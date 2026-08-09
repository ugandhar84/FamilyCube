import { supabase } from '@/lib/supabase';

export interface Vaccine {
  id: string;
  pet_id: string;
  name: string;
  last_given: string | null;
  next_due: string | null;
  vet_name: string | null;
  clinic: string | null;
  notes: string | null;
  created_at: string;
}

const COLS = 'id,pet_id,name,last_given,next_due,vet_name,clinic,notes,created_at';

export async function getVaccines(petId: string): Promise<Vaccine[]> {
  const { data, error } = await supabase
    .from('vaccines')
    .select(COLS)
    .eq('pet_id', petId)
    .order('next_due', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Vaccine[];
}

export async function saveVaccine(
  petId: string,
  payload: Omit<Vaccine, 'id' | 'pet_id' | 'created_at'>,
  id?: string,
): Promise<void> {
  const row = { pet_id: petId, ...payload };
  const { error } = id
    ? await supabase.from('vaccines').update(row).eq('id', id)
    : await supabase.from('vaccines').insert(row);
  if (error) throw error;
}

export async function deleteVaccine(id: string): Promise<void> {
  const { error } = await supabase.from('vaccines').delete().eq('id', id);
  if (error) throw error;
}
