import { supabase } from '@/lib/supabase';

export interface VetVisit {
  id: string;
  pet_id: string;
  visit_date: string;
  vet_name: string | null;
  clinic_name: string | null;
  reason: string | null;
  diagnosis: string | null;
  notes: string | null;
}

const COLS = 'id,pet_id,visit_date,vet_name,clinic_name,reason,diagnosis,notes';

export async function getVetVisits(petId: string): Promise<VetVisit[]> {
  const { data, error } = await supabase
    .from('vet_visits')
    .select(COLS)
    .eq('pet_id', petId)
    .order('visit_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VetVisit[];
}

export async function saveVetVisit(
  petId: string,
  payload: Omit<VetVisit, 'id' | 'pet_id'>,
  id?: string,
): Promise<void> {
  const row = { pet_id: petId, ...payload, visit_ts: new Date().toISOString() };
  const { error } = id
    ? await supabase.from('vet_visits').update(row).eq('id', id)
    : await supabase.from('vet_visits').insert(row);
  if (error) throw error;
}

export async function deleteVetVisit(id: string): Promise<void> {
  const { error } = await supabase.from('vet_visits').delete().eq('id', id);
  if (error) throw error;
}
