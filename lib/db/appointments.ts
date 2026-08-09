import { supabase } from '@/lib/supabase';

export interface Appointment {
  id: string;
  pet_id: string;
  title: string;
  scheduled_at: string;
  vet_name: string | null;
  vet_phone: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  status: string;
  notes: string | null;
  type: string | null;
  remind_before_minutes: number | null;
  recurrence: string | null;
  cost: number | null;
  visit_summary: string | null;
}

const COLS = 'id,pet_id,title,scheduled_at,vet_name,vet_phone,clinic_name,clinic_address,status,notes,type,remind_before_minutes,recurrence,cost,visit_summary';

export async function getAppointments(petId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select(COLS)
    .eq('pet_id', petId)
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Appointment[];
}

export async function getUpcomingAppointments(petId: string): Promise<Appointment[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('appointments')
    .select(COLS)
    .eq('pet_id', petId)
    .eq('status', 'upcoming')
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as Appointment[];
}

export async function saveAppointment(
  petId: string,
  payload: Omit<Appointment, 'id' | 'pet_id'>,
  id?: string,
): Promise<{ id: string } | null> {
  const row = { pet_id: petId, ...payload };
  if (id) {
    const { error } = await supabase.from('appointments').update(row).eq('id', id);
    if (error) throw error;
    return { id };
  }
  const { data, error } = await supabase.from('appointments').insert(row).select('id').single();
  if (error) throw error;
  return data as { id: string };
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw error;
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
  extra?: { visit_summary?: string },
): Promise<void> {
  const { error } = await supabase.from('appointments').update({ status, ...extra }).eq('id', id);
  if (error) throw error;
}

export async function rescheduleAppointment(id: string, scheduledAt: string): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({ scheduled_at: scheduledAt, status: 'upcoming' })
    .eq('id', id);
  if (error) throw error;
}
