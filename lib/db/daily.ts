import { supabase } from '@/lib/supabase';

// ── Checklist ─────────────────────────────────────────────────────────────────

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from('daily_checklist').delete().eq('id', id);
  if (error) throw error;
}

export async function insertChecklistItem(payload: {
  pet_id: string; date: string; type: string; label: string;
  completed: boolean; completed_by?: string | null; completed_at?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('daily_checklist').insert(payload);
  if (error) throw error;
}

export async function upsertChecklistItem(payload: {
  pet_id: string; date: string; type: string; label: string;
  completed: boolean; completed_by?: string | null; completed_at?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('daily_checklist').upsert(payload, {
    onConflict: 'pet_id,date,type,label',
  });
  if (error) throw error;
}

// ── Feeding ───────────────────────────────────────────────────────────────────

export async function insertFeedingLog(payload: {
  pet_id: string; fed_by: string; meal_type: string;
  food_type?: string | null; amount_grams?: number | null;
  date?: string; fed_at?: string;
}): Promise<void> {
  const { error } = await supabase.from('feeding_logs').insert(payload);
  if (error) throw error;
}

export async function deleteFeedingLog(id: string): Promise<void> {
  const { error } = await supabase.from('feeding_logs').delete().eq('id', id);
  if (error) throw error;
}

export async function updateFeedingLog(id: string, payload: {
  meal_type?: string; food_type?: string | null; amount_grams?: number | null;
}): Promise<void> {
  const { error } = await supabase.from('feeding_logs').update(payload).eq('id', id);
  if (error) throw error;
}

// ── Grooming ──────────────────────────────────────────────────────────────────

export async function insertGroomingLog(payload: {
  pet_id: string; type: string; done_at: string; done_at_time?: string | null;
  done_by?: string | null; notes?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('grooming_logs').insert({
    ...payload,
    done_at_ts: payload.done_at_time ?? now,
  });
  if (error) throw error;
}

export async function deleteGroomingLog(id: string): Promise<void> {
  const { error } = await supabase.from('grooming_logs').delete().eq('id', id);
  if (error) throw error;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function upsertDailyNote(
  petId: string, date: string, note: string,
): Promise<void> {
  const { error } = await supabase.from('daily_notes').upsert(
    { pet_id: petId, date, note },
    { onConflict: 'pet_id,date' },
  );
  if (error) throw error;
}
