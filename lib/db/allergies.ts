import { supabase } from '@/lib/supabase';

export interface Allergy {
  id: string;
  pet_id: string;
  allergen: string;
  severity: string;
  category: string | null;
  notes: string | null;
  diagnosed_date: string | null;
  created_at?: string | null;
}

export async function getAllergies(petId: string): Promise<Allergy[]> {
  const { data, error } = await supabase
    .from('allergies')
    .select('id,pet_id,allergen,severity,category,notes,diagnosed_date,created_at')
    .eq('pet_id', petId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Allergy[];
}

export async function saveAllergy(
  petId: string,
  payload: Omit<Allergy, 'id' | 'pet_id'>,
  id?: string,
): Promise<void> {
  const row = { pet_id: petId, ...payload };
  const { error } = id
    ? await supabase.from('allergies').update(row).eq('id', id)
    : await supabase.from('allergies').insert(row);
  if (error) throw error;
}

export async function deleteAllergy(id: string): Promise<void> {
  const { error } = await supabase.from('allergies').delete().eq('id', id);
  if (error) throw error;
}
