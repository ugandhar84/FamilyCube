import { supabase } from '@/lib/supabase';
import { todayLocal } from '@/lib/dates';

export interface Medication {
  id: string;
  pet_id: string;
  name: string;
  dosage: string | null;
  frequency: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  source: string | null;
  remind_time: string | null; // HH:MM 24h, e.g. "08:00"
  notif_id: string | null;    // expo local notification identifier
  created_at: string;
}

const COLS = 'id,pet_id,name,dosage,frequency,start_date,end_date,is_active,notes,source,remind_time,notif_id,created_at';

export async function getMedications(petId: string): Promise<Medication[]> {
  const { data, error } = await supabase
    .from('medications')
    .select(COLS)
    .eq('pet_id', petId)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Medication[];
}

export async function getActiveMedications(petId: string, asOf?: string): Promise<Medication[]> {
  const date = asOf ?? todayLocal();
  const { data, error } = await supabase
    .from('medications')
    .select(COLS)
    .eq('pet_id', petId)
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${date}`)
    .order('name');
  if (error) throw error;
  const rows = (data ?? []) as Medication[];
  return rows.filter(m => !m.end_date || m.end_date >= date);
}

export async function saveMedication(
  petId: string,
  payload: Omit<Medication, 'id' | 'pet_id' | 'created_at'>,
  id?: string,
): Promise<string | undefined> {
  const row = { pet_id: petId, ...payload };
  if (id) {
    const { error } = await supabase.from('medications').update(row).eq('id', id);
    if (error) throw error;
    return id;
  } else {
    const { data, error } = await supabase.from('medications').insert(row).select('id').single();
    if (error) throw error;
    return (data as any)?.id as string;
  }
}

export async function getMedicationNotifId(id: string): Promise<string | null> {
  const { data } = await supabase.from('medications').select('notif_id').eq('id', id).single();
  return (data as any)?.notif_id ?? null;
}

export async function setMedicationNotifId(id: string, notifId: string | null): Promise<void> {
  const { error } = await supabase.from('medications').update({ notif_id: notifId }).eq('id', id);
  if (error) throw error;
}

export async function toggleMedActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('medications').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deleteMedication(id: string): Promise<void> {
  const { error } = await supabase.from('medications').delete().eq('id', id);
  if (error) throw error;
}
