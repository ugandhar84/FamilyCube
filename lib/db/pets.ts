import { supabase } from '@/lib/supabase';
import { invalidatePetsCache } from '@/store/petStore';
import { todayLocal } from '@/lib/dates';

export async function getPet(petId: string) {
  const { data, error } = await supabase.from('pets').select('id,name,emoji,species,breed,birthday,adoption_date,avatar_url,owner_id,is_active,status,memorial_reason,memorial_at,accent_color,location_lat,location_lng,location_shared,weight_kg,microchip_id,insurance_provider,insurance_policy_number,vet_name,vet_phone,vet_address,neutered,gender,bio,created_at,updated_at').eq('id', petId).single();
  if (error) throw error;
  return data;
}

export async function updatePet(petId: string, payload: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('pets').update(payload).eq('id', petId);
  if (error) throw error;
  invalidatePetsCache(); // next fetchPets refetches instead of serving the 30s TTL cache
}

export async function getPetsByIds(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('pets').select('id,name,emoji,species,breed,avatar_url,owner_id,accent_color,location_lat,location_lng,location_shared,created_at').in('id', ids);
  if (error) throw error;
  return data ?? [];
}

export async function getProfiles(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('profiles').select('id,full_name,handle,avatar_url').in('id', ids);
  if (error) throw error;
  return data ?? [];
}

export async function getNotificationCounts(userId: string, socialTypes: string[]) {
  const [general, social] = await Promise.all([
    supabase.from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('read', false)
      .not('type', 'in', `(${socialTypes.join(',')})`),
    supabase.from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('read', false)
      .in('type', socialTypes),
  ]);
  return { general: general.count ?? 0, social: social.count ?? 0 };
}

export async function getNextVetVisit(petId: string) {
  const today = todayLocal();
  const { data } = await supabase
    .from('vet_visits')
    .select('visit_date')
    .eq('pet_id', petId)
    .gte('visit_date', today)
    .order('visit_date', { ascending: true })
    .limit(1);
  return data?.[0]?.visit_date ?? null;
}

export async function getDailyScanCount(petId: string, date: string): Promise<number> {
  const { data } = await supabase
    .from('daily_scan_counts')
    .select('count')
    .eq('pet_id', petId)
    .eq('date', date)
    .maybeSingle();
  return data?.count ?? 0;
}
