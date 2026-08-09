/**
 * PetsSlice — owns the full pet roster and active-pet selection.
 *
 * Manages owned pets, family-shared pets, per-pet role assignments, and
 * caretaker-tier inheritance. All other slices (CareSlice, HealthSlice)
 * use `activePetId` from here to scope their own queries.
 *
 * Key design decisions:
 *  - fetchPets merges owned + family pets in a single call and deduplicates by id.
 *  - A 30-second TTL prevents redundant round-trips when the Home tab refocuses.
 *  - Owner role always wins over a family row for the same pet.
 *  - deletePet cleans up storage buckets best-effort before deleting the DB row
 *    so the storage quota is reclaimed even if the app force-quits mid-delete.
 */
import { StateCreator } from 'zustand';
import { supabase } from '@/lib/supabase';
import { differenceInDays, parseISO } from 'date-fns';
import { dbg, dbgSupabase } from '@/lib/debug';
import { unsubscribeAll as realtimeUnsubscribeAll } from '@/lib/realtime';
import type { Pet } from '@/lib/types';
import { dedup, clearInFlight } from '../utils';

const TAG = 'PetsSlice';

// fetchPets TTL — skip refetch when data is fresher than this (home tab refetches on every focus)
const PETS_TTL_MS = 30_000;
let _petsFetchedAt = 0;
/** Call after mutating pets outside the store (e.g. lib/db updatePet) so the next fetchPets refetches. */
export function invalidatePetsCache() { _petsFetchedAt = 0; }

/** Normalise a raw DB row — handles both old `color` and new `accent_color` column names */
function normalisePet(row: any): Pet {
  return {
    ...row,
    // Support both column names during migration window
    accent_color: row.accent_color ?? row.color ?? '#7C5CBF',
  } as Pet;
}

export interface PetsSlice {
  // ── State ──────────────────────────────────────────────────────
  /** All pets the user owns or has been invited to as a family member. */
  pets: Pet[];
  /** UUID of the pet currently shown across all screens. Null on first load. */
  activePetId: string | null;
  /** Maps petId → the current user's role ('owner' | 'caretaker' | 'caregiver' | 'viewer'). */
  petRoles: Record<string, string>;
  /** For caretaker-role pets: the pet owner's subscription tier, used for context-tier feature gating. */
  ownerTierByPet: Record<string, string>;
  /** Pets the user can access as a family member (caretaker / caregiver / viewer). */
  familyPets: Pet[];
  /** Maps petId → array of family-member user IDs (populated separately from fetchFamilyPets). */
  petFamilyMap: Record<string, string[]>;
  /** True while the initial fetchPets call is in flight — prevents flash of empty state. */
  loading: boolean;
  /** Last error message from any pets operation, or null when clean. */
  error: string | null;

  // ── Computed ───────────────────────────────────────────────────
  /** Derived from pets + activePetId — returns the active Pet object or null. */
  activePet: () => Pet | null;
  /** Days since adoption_date for the given pet; returns 0 when date is missing. */
  daysWithPet: (petId: string) => number;

  // ── Pet CRUD ───────────────────────────────────────────────────
  /** Loads owned + family pets with a 30-second TTL. Silent refresh after first load. */
  fetchPets: (userId: string) => Promise<void>;
  /** Switches the active pet — pass null to clear context (global/summary mode). */
  setActivePet: (petId: string | null) => void;
  /** Patches a single pet in the local pets array without a DB round-trip. */
  updatePetInStore: (pet: Pet) => void;
  /** Inserts a new pet, sets it as active, and returns the created Pet or null on error. */
  addPet: (pet: Omit<Pet, 'id' | 'created_at'>) => Promise<Pet | null>;
  /** Updates pet fields and syncs the local store on success. Returns false on DB error. */
  updatePet: (petId: string, updates: Partial<Omit<Pet, 'id' | 'created_at' | 'owner_id'>>) => Promise<boolean>;
  /** Hard-deletes the pet row and cleans up all storage buckets first (best-effort). */
  deletePet: (petId: string) => Promise<boolean>;
  /** Soft-deletes to 'memorial' status — pet stays visible in read-only mode. */
  memorizePet: (petId: string, reason: string) => Promise<boolean>;

  // ── Family ─────────────────────────────────────────────────────
  /** Fetches pets shared with the user via pet_family rows (caretaker / caregiver / viewer). */
  fetchFamilyPets: (userId: string) => Promise<void>;
  /** Fetches and merges role assignments from pet_family; owned pets keep 'owner' role. */
  fetchPetRoles: (userId: string) => Promise<void>;

  // ── Session ────────────────────────────────────────────────────
  /** Clears all pet state, cancels realtime subscriptions, and resets the TTL on sign-out. */
  reset: () => void;
}

const PET_SELECT_COLS = 'id,name,emoji,species,breed,birthday,adoption_date,avatar_url,owner_id,is_active,status,memorial_reason,memorial_at,accent_color,location_lat,location_lng,location_updated_at,location_shared,weight_kg,microchip_id,insurance_policy,neutered,gender,notes,created_at';

export const createPetsSlice: StateCreator<PetsSlice, [], [], PetsSlice> = (set, get) => ({
  pets: [],
  activePetId: null,
  petRoles: {},
  ownerTierByPet: {},
  familyPets: [],
  petFamilyMap: {},
  loading: true, // true on startup — prevents flash of empty state before first fetchPets
  error: null,

  // ── Computed ──────────────────────────────────────────────────────────────

  activePet: () => {
    const { pets, activePetId } = get();
    if (activePetId) return pets.find((p) => p.id === activePetId) ?? pets[0] ?? null;
    return pets[0] ?? null;
  },

  daysWithPet: (petId) => {
    const pet = get().pets.find((p) => p.id === petId);
    if (!pet?.adoption_date) return 0;
    return differenceInDays(new Date(), parseISO(pet.adoption_date));
  },

  // ── Pets ──────────────────────────────────────────────────────────────────

  fetchPets: async (userId) => dedup(`pets:${userId}`, async () => {
    // TTL guard — home tab calls this on every focus; skip when data is fresh
    if (get().pets.length > 0 && Date.now() - _petsFetchedAt < PETS_TTL_MS) {
      dbg(TAG, 'fetchPets — fresh, skipping');
      return;
    }
    dbg(TAG, 'fetchPets →', userId);
    // Only show the loading state on first load — silent refresh afterwards
    if (get().pets.length === 0) set({ loading: true, error: null });
    try {
      // Fetch owned pets
      // Include memorial pets (status='memorial') so their read-only profiles remain visible
      const { data: owned, error: ownedErr } = await supabase
        .from('pets')
        .select(PET_SELECT_COLS)
        .eq('owner_id', userId)
        .or('is_active.eq.true,status.eq.memorial')
        .order('created_at', { ascending: true });

      if (ownedErr) {
        dbgSupabase('fetchPets:owned', ownedErr);
        set({ error: ownedErr.message, loading: false });
        return;
      }

      // Fetch pets where user is a family member (caretaker/caregiver/viewer)
      const { data: familyRows, error: familyErr } = await supabase
        .from('pet_family')
        .select('pet_id, role')
        .eq('user_id', userId);

      let familyPets: any[] = [];
      if (!familyErr && familyRows && familyRows.length > 0) {
        const familyPetIds = familyRows.map((r: any) => r.pet_id);
        const { data: fp } = await supabase
          .from('pets')
          .select(PET_SELECT_COLS)
          .in('id', familyPetIds)
          .eq('is_active', true)
          .order('created_at', { ascending: true });
        familyPets = fp ?? [];
      }

      // Build role map: owned pets → 'owner', family pets → their role
      // Owner always wins — never let a family row downgrade an owned pet
      const petRoles: Record<string, string> = {};
      for (const p of (owned ?? [])) petRoles[p.id] = 'owner';
      for (const r of (familyRows ?? [])) {
        if (!petRoles[r.pet_id]) petRoles[r.pet_id] = r.role;
      }

      // Merge, deduplicate by id
      const allPets = [...(owned ?? []), ...familyPets];
      const seen = new Set<string>();
      const unique = allPets.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      const pets = unique.map(normalisePet);
      dbg(TAG, `fetchPets ← ${pets.length} pets (${owned?.length ?? 0} owned, ${familyPets.length} shared)`);

      // Fetch owner tiers for caretaker-role pets so context-tier inheritance works client-side.
      // Uses a SECURITY DEFINER RPC to safely read another user's subscription tier.
      let ownerTierByPet: Record<string, string> = {};
      const hasCaretakerPets = (familyRows ?? []).some((r: any) => r.role === 'caretaker');
      if (hasCaretakerPets) {
        const { data: tierRows } = await supabase.rpc('get_caretaker_owner_tiers');
        for (const row of (tierRows ?? [])) {
          ownerTierByPet[row.pet_id] = row.owner_tier;
        }
      }

      const currentId = get().activePetId;
      const keepId = (currentId && pets.some(p => p.id === currentId))
        ? currentId
        : (pets[0]?.id ?? null);
      set({ pets, petRoles, ownerTierByPet, familyPets: familyPets.map(normalisePet), activePetId: keepId, loading: false });
      _petsFetchedAt = Date.now();
    } catch (e: any) {
      dbgSupabase('fetchPets', { message: e.message });
      set({ error: e.message, loading: false });
    }
  }),

  setActivePet: (petId) => {
    dbg(TAG, 'setActivePet →', petId);
    set({ activePetId: petId });
  },

  updatePetInStore: (pet) => {
    set((s) => ({
      pets: s.pets.map((p) => (p.id === pet.id ? pet : p)),
    }));
  },

  addPet: async (petData) => {
    dbg(TAG, 'addPet →', petData.name);
    try {
      const { data, error } = await supabase
        .from('pets')
        .insert(petData)
        .select()
        .single();

      if (error) {
        dbgSupabase('addPet', error);
        set({ error: error.message });
        return null;
      }

      const pet = normalisePet(data);
      dbg(TAG, 'addPet ← created', pet.id);
      set((s) => ({ pets: [...s.pets, pet], activePetId: pet.id }));
      return pet;
    } catch (e: any) {
      dbgSupabase('addPet', { message: e.message });
      set({ error: e.message });
      return null;
    }
  },

  updatePet: async (petId, updates) => {
    dbg(TAG, 'updatePet →', petId, Object.keys(updates));
    try {
      const { data, error } = await supabase
        .from('pets')
        .update(updates)
        .eq('id', petId)
        .select()
        .single();

      if (error) {
        dbgSupabase('updatePet', error);
        set({ error: error.message });
        return false;
      }

      const updated = normalisePet(data);
      dbg(TAG, 'updatePet ← ok');
      set((s) => ({
        pets: s.pets.map((p) => (p.id === petId ? updated : p)),
      }));
      return true;
    } catch (e: any) {
      dbgSupabase('updatePet', { message: e.message });
      set({ error: e.message });
      return false;
    }
  },

  deletePet: async (petId) => {
    dbg(TAG, 'deletePet →', petId);
    try {
      // 1. Delete all storage files for this pet (best-effort, don't block on failure)
      await Promise.allSettled([
        // Main bucket: avatar, gallery, daily photos — all under <petId>/
        (async () => {
          const { data: files } = await supabase.storage.from('pets').list(petId, { limit: 1000 });
          if (files?.length) {
            // list() gives top-level folders; recursively remove each sub-path
            const subDirs = files.map(f => f.name);
            await Promise.allSettled(subDirs.map(async (dir) => {
              const { data: subFiles } = await supabase.storage.from('pets').list(`${petId}/${dir}`, { limit: 1000 });
              if (subFiles?.length) {
                const paths = subFiles.map(f => `${petId}/${dir}/${f.name}`);
                await supabase.storage.from('pets').remove(paths);
              }
            }));
            // Also try removing the top-level entries directly (for flat structures)
            const topPaths = files.map(f => `${petId}/${f.name}`);
            await supabase.storage.from('pets').remove(topPaths);
          }
        })(),
        // Private media bucket: mood/gallery/symptom photos under <petId>/
        (async () => {
          const { data: files } = await supabase.storage.from('pet-media').list(petId, { limit: 1000 });
          if (files?.length) {
            const paths = files.map(f => `${petId}/${f.name}`);
            await supabase.storage.from('pet-media').remove(paths);
          }
        })(),
        // Health-records bucket: docs under <petId>/
        (async () => {
          const { data: files } = await supabase.storage.from('health-records').list(petId, { limit: 1000 });
          if (files?.length) {
            const paths = files.map(f => `${petId}/${f.name}`);
            await supabase.storage.from('health-records').remove(paths);
          }
        })(),
      ]);

      // 2. Hard-delete the pets row — all related tables cascade automatically
      const { error } = await supabase
        .from('pets')
        .delete()
        .eq('id', petId);

      if (error) {
        dbgSupabase('deletePet', error);
        return false;
      }

      // 3. Clear notification_logs referencing this pet (no FK, stored in JSONB)
      await supabase
        .from('notification_logs')
        .delete()
        .contains('data', { pet_id: petId });

      dbg(TAG, 'deletePet ← ok');

      // 4. Clear in-memory store state
      set((s) => {
        const pets = s.pets.filter((p) => p.id !== petId);
        const petRoles = { ...s.petRoles };
        const ownerTierByPet = { ...s.ownerTierByPet };
        delete petRoles[petId];
        delete ownerTierByPet[petId];
        return {
          pets,
          petRoles,
          ownerTierByPet,
          familyPets: s.familyPets.filter((p) => p.id !== petId),
          activePetId: s.activePetId === petId ? (pets[0]?.id ?? null) : s.activePetId,
        };
      });
      return true;
    } catch (e: any) {
      dbgSupabase('deletePet', { message: e.message });
      return false;
    }
  },

  memorizePet: async (petId, reason) => {
    dbg(TAG, 'memorizePet →', petId, reason);
    try {
      const { error } = await supabase
        .from('pets')
        .update({ status: 'memorial', memorial_reason: reason, memorial_at: new Date().toISOString() })
        .eq('id', petId);

      if (error) { dbgSupabase('memorizePet', error); return false; }

      dbg(TAG, 'memorizePet ← ok');
      set((s) => ({
        pets: s.pets.map((p) => p.id === petId
          ? { ...p, status: 'memorial', memorial_reason: reason, memorial_at: new Date().toISOString() }
          : p),
      }));
      return true;
    } catch (e: any) {
      dbgSupabase('memorizePet', { message: e.message });
      return false;
    }
  },

  // ── Family ────────────────────────────────────────────────────────────────

  fetchFamilyPets: async (userId) => dedup(`familyPets:${userId}`, async () => {
    dbg(TAG, 'fetchFamilyPets →', userId);
    try {
      const { data: familyRows, error: familyErr } = await supabase
        .from('pet_family')
        .select('pet_id, role')
        .eq('user_id', userId);

      if (familyErr || !familyRows?.length) return;

      const familyPetIds = familyRows.map((r: any) => r.pet_id);
      const { data: fp } = await supabase
        .from('pets')
        .select(PET_SELECT_COLS)
        .in('id', familyPetIds)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      set({ familyPets: (fp ?? []).map(normalisePet) });
    } catch (e: any) {
      dbgSupabase('fetchFamilyPets', { message: e.message });
    }
  }),

  fetchPetRoles: async (userId) => dedup(`petRoles:${userId}`, async () => {
    dbg(TAG, 'fetchPetRoles →', userId);
    try {
      const { data: familyRows, error } = await supabase
        .from('pet_family')
        .select('pet_id, role')
        .eq('user_id', userId);

      if (error) { dbgSupabase('fetchPetRoles', error); return; }

      set((s) => {
        const petRoles = { ...s.petRoles };
        for (const r of (familyRows ?? [])) {
          if (!petRoles[r.pet_id]) petRoles[r.pet_id] = r.role;
        }
        return { petRoles };
      });
    } catch (e: any) {
      dbgSupabase('fetchPetRoles', { message: e.message });
    }
  }),

  // ── Session ───────────────────────────────────────────────────────────────

  reset: () => {
    // Clear all user-specific data when signing out so the next user never sees
    // a previous session's pets, mood logs, or any other personal data.
    _petsFetchedAt = 0;
    clearInFlight();
    realtimeUnsubscribeAll();
    set({
      pets: [], activePetId: null, petRoles: {}, ownerTierByPet: {},
      familyPets: [], petFamilyMap: {},
      loading: false, error: null,
    });
  },
});
