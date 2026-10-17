import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { syncPlaceGeofences } from '@/lib/placeGeofencing';

export type PlaceKind = 'home' | 'school' | 'work' | 'other';

export interface FamilyPlace {
  id: string;
  kind: PlaceKind;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusM: number;
  memberIds: string[];
}

export interface PlaceInput {
  id?: string | null;
  kind: PlaceKind;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radiusM: number;
  memberIds: string[];
}

type Result = { ok: boolean; error?: string; place?: FamilyPlace };

const fromRow = (r: any): FamilyPlace => ({
  id: r.id, kind: r.kind, name: r.name, address: r.address ?? null,
  latitude: r.latitude, longitude: r.longitude, radiusM: r.radius_m, memberIds: r.member_ids ?? [],
});

function friendly(raw: string): string {
  if (/only a parent/i.test(raw)) return 'Only a parent can manage family places.';
  if (/caller is not member/i.test(raw)) return 'Your session changed — switch back to your profile and try again.';
  if (/belong to your family/i.test(raw)) return 'Everyone you assign must be in your family.';
  if (/invalid coordinates/i.test(raw)) return 'That location is not valid — move the pin and try again.';
  if (/radius/i.test(raw)) return 'Pick a radius between 50 m and 2 km.';
  if (/not found/i.test(raw)) return 'That place no longer exists.';
  if (/needs a name/i.test(raw)) return 'Give this place a name before saving.';
  // Expose raw message in dev so we can diagnose
  return `Couldn't save — ${raw}`;
}

interface PlacesState {
  places: FamilyPlace[];
  loading: boolean;
  familyId: string | null;
  memberId: string | null;
  load: (familyId: string, memberId: string) => Promise<void>;
  save: (actorId: string, input: PlaceInput) => Promise<Result>;
  remove: (actorId: string, id: string) => Promise<Result>;
}

export const usePlacesStore = create<PlacesState>((set, get) => {
  const resync = () => {
    const { places, memberId } = get();
    if (memberId) syncPlaceGeofences(places, memberId).catch(e => console.warn('[placesStore] geofence sync failed', e));
  };

  return {
    places: [], loading: false, familyId: null, memberId: null,

    load: async (familyId, memberId) => {
      set({ loading: true, familyId, memberId });
      const { data, error } = await supabase.from('family_places').select('*').eq('family_id', familyId).order('created_at');
      if (error) { console.warn('[placesStore] load failed', error.message); set({ loading: false }); return; }
      set({ places: (data ?? []).map(fromRow), loading: false });
      resync();
    },

    save: async (actorId, input) => {
      console.log('[placesStore] save', { actorId, input });
      const { data, error } = await supabase.rpc('upsert_family_place', {
        p_actor_id: actorId, p_id: input.id ?? null, p_kind: input.kind, p_name: input.name,
        p_address: input.address ?? null, p_lat: input.latitude, p_lng: input.longitude,
        p_radius_m: input.radiusM, p_member_ids: input.memberIds,
      });
      if (error) {
        console.error('[placesStore] upsert_family_place error:', error.message, error.code, error.details);
        return { ok: false, error: friendly(error.message) };
      }
      const place = fromRow(Array.isArray(data) ? data[0] : data);
      set(s => ({ places: [...s.places.filter(p => p.id !== place.id), place] }));
      resync();
      return { ok: true, place };
    },

    remove: async (actorId, id) => {
      const { error } = await supabase.rpc('delete_family_place', { p_actor_id: actorId, p_id: id });
      if (error) return { ok: false, error: friendly(error.message) };
      set(s => ({ places: s.places.filter(p => p.id !== id) }));
      resync();
      return { ok: true };
    },
  };
});
