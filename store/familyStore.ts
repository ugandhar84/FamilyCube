/**
 * familyStore — wraps the v2 Supabase `members` table.
 * Cache: AsyncStorage (instant) + background DB sync on every load.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export type MemberRole = 'parent' | 'kid' | 'teen' | 'senior';

export interface FamilyMember {
  id: string;
  name: string;
  role: MemberRole;
  subRole?: string;     // e.g. 'Dad', 'Mom', 'Grandpa' — display label, not a gate
  emoji?: string;       // stored as `avatar` in DB when it's an emoji
  avatarUrl?: string;   // stored as `avatar` when it's a URL
  coins: number;
  mainCoins: number;    // Main parent-wallet coins (used in Perks Store)
  gpCoins: number;      // Grandparent bonus sub-wallet coins
  xp: number;
  streak: number;
  level: number;
  questsCompleted: number;
  questsPending: number;
  pin?: string;
  pinEnabled?: boolean;
  familyId?: string;
  // Teen-specific profile fields
  hasCar?: boolean;           // Opts teen into ride/pickup dispatch pool
  rideEarningsPerRun?: number; // Parent-configured coins per pickup run
  groceryEarningsPerRun?: number; // Parent-configured coins per grocery run
  // Senior / GP availability prefs (persisted so they survive app restart)
  gpCheerleaderMode?: boolean;        // Hides all driving requests
  gpDriveWindowDays?: number[];       // 0=Sun … 6=Sat
  gpDriveWindowStart?: string;        // 'HH:MM' 24h
  gpDriveWindowEnd?: string;          // 'HH:MM' 24h
  gpWeeklyRideCap?: number;           // Max rides they'll take per calendar week
}

interface FamilyState {
  members: FamilyMember[];
  activeMemberId: string | null;
  loaded: boolean;
  familyName: string;

  setMembers: (members: FamilyMember[]) => void;
  setActiveMember: (id: string) => void;
  setFamilyName: (name: string) => void;
  addMember: (member: Omit<FamilyMember, 'id'>) => Promise<void>;
  updateMember: (id: string, updates: Partial<FamilyMember>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  awardCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => void;
  deductCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => void;
  setMemberPin: (id: string, pin: string | null) => Promise<void>;
  loadFromStorage: () => Promise<void>;
  syncFromDB: () => Promise<void>;
}

const STORAGE_KEY = '@familycube_members_v4';
const ACTIVE_KEY  = '@familycube_active_member';

// Seed data for demo / first launch (IDs match questStore seeds)
const SEED_MEMBERS: FamilyMember[] = [
  { id: 'parent-1', name: 'Alex (Dad)',  role: 'parent', emoji: '👨', coins: 0,   mainCoins: 0,  gpCoins: 0,  xp: 0,   streak: 3, level: 2, questsCompleted: 5,  questsPending: 1 },
  { id: 'parent-2', name: 'Priya (Mom)', role: 'parent', emoji: '👩', coins: 0,  mainCoins: 0,  gpCoins: 0,  xp: 0,   streak: 2, level: 2, questsCompleted: 3,  questsPending: 0 },
  { id: 'kid-1',    name: 'Leo',         role: 'kid',    emoji: '🦁', coins: 108, mainCoins: 108, gpCoins: 45, xp: 320, streak: 4, level: 3, questsCompleted: 12, questsPending: 2 },
  { id: 'kid-2',    name: 'Maya',        role: 'kid',    emoji: '🌸', coins: 75,  mainCoins: 75,  gpCoins: 30, xp: 210, streak: 2, level: 2, questsCompleted: 8,  questsPending: 1 },
  { id: 'kid-3',    name: 'Sam',         role: 'kid',    emoji: '👶', coins: 40,  mainCoins: 40,  gpCoins: 20, xp: 90,  streak: 1, level: 1, questsCompleted: 4,  questsPending: 1 },
  { id: 'teen-1',   name: 'Jordan',       role: 'teen',   emoji: '🎧', coins: 60,  mainCoins: 60,  gpCoins: 0, xp: 180, streak: 3, level: 2, questsCompleted: 6,  questsPending: 1, hasCar: false, rideEarningsPerRun: 50, groceryEarningsPerRun: 30 },
  { id: 'senior-1', name: 'Grandma Mary', role: 'senior', emoji: '👵', coins: 0, mainCoins: 0,  gpCoins: 0,  xp: 0,   streak: 0, level: 1, questsCompleted: 0,  questsPending: 0 },
];

// DB row → FamilyMember
function fromRow(row: any): FamilyMember {
  const isUrl = typeof row.avatar === 'string' && row.avatar.startsWith('http');
  const coins = row.coins ?? 0;
  return {
    id:              String(row.id),
    name:            row.name,
    role:            row.role === 'child' ? 'kid' : row.role === 'grandparent' ? 'senior' : row.role === 'teenager' ? 'teen' : row.role as MemberRole,
    subRole:         row.sub_role ?? undefined,
    emoji:           isUrl ? undefined : (row.avatar ?? undefined),
    avatarUrl:       isUrl ? row.avatar : undefined,
    familyId:        row.family_id ?? undefined,
    coins,
    mainCoins:       row.main_coins ?? coins,
    gpCoins:         row.gp_coins ?? 0,
    xp:              row.xp ?? 0,
    streak:          row.streak ?? 0,
    level:           row.level ?? 1,
    questsCompleted: row.quests_completed ?? 0,
    questsPending:   row.quests_pending ?? 0,
    pin:             row.pin ?? undefined,
    pinEnabled:      Boolean(row.pin),
    hasCar:          row.has_car ?? false,
    rideEarningsPerRun:    row.ride_earnings_per_run ?? 50,
    groceryEarningsPerRun: row.grocery_earnings_per_run ?? 30,
    gpCheerleaderMode:  row.gp_cheerleader_mode  ?? false,
    gpDriveWindowDays:  row.gp_drive_window_days  ?? [2, 4],
    gpDriveWindowStart: row.gp_drive_window_start ?? '14:00',
    gpDriveWindowEnd:   row.gp_drive_window_end   ?? '17:30',
    gpWeeklyRideCap:    row.gp_weekly_ride_cap    ?? 2,
  };
}

// FamilyMember → DB upsert payload (v2 `members` schema)
function toRow(m: FamilyMember) {
  return {
    id:       m.id,
    name:     m.name,
    role:     m.role === 'kid' ? 'child' : m.role === 'teen' ? 'teenager' : m.role,
    sub_role: m.subRole ?? null,
    avatar: m.avatarUrl ?? m.emoji ?? '👤',
    coins: m.coins,
    main_coins: m.mainCoins,
    gp_coins:   m.gpCoins,
    xp:    m.xp,
    streak: m.streak,
    level:  m.level,
    quests_completed: m.questsCompleted,
    quests_pending:   m.questsPending,
    pin:   m.pin ?? null,
    has_car: m.hasCar ?? false,
    ride_earnings_per_run: m.rideEarningsPerRun ?? 50,
    grocery_earnings_per_run: m.groceryEarningsPerRun ?? 30,
    gp_cheerleader_mode:  m.gpCheerleaderMode  ?? false,
    gp_drive_window_days: m.gpDriveWindowDays  ?? [2, 4],
    gp_drive_window_start: m.gpDriveWindowStart ?? '14:00',
    gp_drive_window_end:   m.gpDriveWindowEnd   ?? '17:30',
    gp_weekly_ride_cap:    m.gpWeeklyRideCap    ?? 2,
  };
}

function applyActive(members: FamilyMember[], cached: string | null, current: string | null) {
  if (current && members.some(m => m.id === current)) return current;
  if (cached  && members.some(m => m.id === cached))  return cached;
  // Prefer first parent over first member (DB order may vary)
  return (members.find(m => m.role === 'parent') ?? members[0])?.id ?? null;
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  members: [],
  activeMemberId: null,
  loaded: false,
  familyName: 'Our Family',

  setFamilyName: (name) => set({ familyName: name }),

  setMembers: (members) => {
    set({ members });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  },

  setActiveMember: (id) => {
    set({ activeMemberId: id });
    AsyncStorage.setItem(ACTIVE_KEY, id);
    // Save push token to the newly active member row
    import('@/lib/notifications').then(({ saveTokenToMember }) => {
      saveTokenToMember(id).catch(() => {});
    });
  },

  addMember: async (member) => {
    // Insert into DB and get back the generated ID
    const row = { ...toRow({ ...member, id: '' }), id: undefined };
    const { data, error } = await supabase
      .from('members')
      .insert([{ name: row.name, role: row.role, avatar: row.avatar, coins: row.coins, xp: row.xp, streak: row.streak, level: row.level }])
      .select()
      .single();
    if (error || !data) { console.warn('[familyStore] addMember:', error?.message); return; }
    const added = fromRow(data);
    const next = [...get().members, added];
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  updateMember: async (id, updates) => {
    const next = get().members.map(m => m.id === id ? { ...m, ...updates } : m);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const updated = next.find(m => m.id === id);
    if (updated) {
      await supabase.from('members').update(toRow(updated)).eq('id', id);
    }
  },

  removeMember: async (id) => {
    const next = get().members.filter(m => m.id !== id);
    set({ members: next, activeMemberId: get().activeMemberId === id ? (next[0]?.id ?? null) : get().activeMemberId });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    await supabase.from('members').delete().eq('id', id);
  },

  awardCoins: (memberId, amount, wallet) => {
    const next = get().members.map(m =>
      m.id === memberId ? { ...m, [wallet]: Math.max(0, (m[wallet] ?? 0) + amount) } : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const updated = next.find(m => m.id === memberId);
    if (updated) supabase.from('members').update(toRow(updated)).eq('id', memberId);
  },

  deductCoins: (memberId, amount, wallet) => {
    const next = get().members.map(m =>
      m.id === memberId ? { ...m, [wallet]: Math.max(0, (m[wallet] ?? 0) - amount) } : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const updated = next.find(m => m.id === memberId);
    if (updated) supabase.from('members').update(toRow(updated)).eq('id', memberId);
  },

  setMemberPin: async (id, pin) => {
    const next = get().members.map(m =>
      m.id === id ? { ...m, pin: pin ?? undefined, pinEnabled: pin !== null } : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    await supabase.from('members').update({ pin: pin ?? null }).eq('id', id);
  },

  loadFromStorage: async () => {
    try {
      const [raw, activeId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
      ]);
      const cached = raw ? (JSON.parse(raw) as FamilyMember[]) : null;
      if (cached && cached.length > 0) {
        set({
          members: cached,
          activeMemberId: applyActive(cached, activeId, null),
          loaded: true,
        });
        // Refresh in background
        get().syncFromDB();
        return;
      }
    } catch {}
    // No cache — try DB, fall back to seed data
    await get().syncFromDB();
    // If DB returned nothing (offline / empty), use seed members
    if (get().members.length === 0) {
      set({ members: SEED_MEMBERS, activeMemberId: SEED_MEMBERS[0].id });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_MEMBERS));
    }
    set({ loaded: true });
  },

  syncFromDB: async () => {
    try {
      const [activeId, { data, error }] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_KEY),
        supabase.from('members').select('*').order('created_at'),
      ]);
      if (error || !data) return;
      const members = data.map(fromRow);
      set({
        members,
        activeMemberId: applyActive(members, activeId, get().activeMemberId),
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(members));

      // Warm up custom category + suggestion caches in background
      const familyId = members[0]?.familyId;
      if (familyId) {
        import('@/lib/familyCustomCategories').then(({ warmupCustomCache }) => {
          warmupCustomCache(familyId).catch(() => {});
        });
      }
    } catch (e) {
      console.warn('[familyStore] syncFromDB:', e);
    }
  },
}));
