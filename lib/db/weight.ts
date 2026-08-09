import { supabase } from '@/lib/supabase';

export interface WeightLog {
  id: string;
  pet_id: string;
  weight_kg: number;
  logged_at: string;
  notes: string | null;
  logged_by: string | null;
}

export async function getWeightLogs(petId: string, limit = 30): Promise<WeightLog[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('id,pet_id,weight_kg,logged_at,notes,logged_by')
    .eq('pet_id', petId)
    .lte('logged_at', new Date().toISOString())
    .order('logged_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WeightLog[];
}

export async function logWeight(petId: string, weightKg: number, loggedBy?: string | { source_record_id?: string }, notes?: string | null, loggedAt?: string): Promise<void> {
  const extra = typeof loggedBy === 'object' ? loggedBy : {};
  const loggedByStr = typeof loggedBy === 'string' ? loggedBy : null;
  const now = loggedAt ?? new Date().toISOString();
  const { error } = await supabase.from('weight_logs').insert({
    pet_id: petId,
    weight_kg: weightKg,
    logged_at: now,          // date col — keeps date-based dedup working
    logged_at_time: now,     // timestamptz col — used for sorting in journal
    logged_by: loggedByStr,
    notes: notes ?? null,
    ...extra,
  });
  // Unique constraint uq_weight_logs_pet_value_date fires when the exact same
  // weight is logged for the same pet on the same day (health-scan dedup).
  // Treat it as success — the entry already exists with identical data.
  if (error && error.code !== '23505') throw error;
}

export async function updateWeightLog(id: string, weightKg: number, loggedAt: string, notes?: string | null): Promise<void> {
  const { error } = await supabase.from('weight_logs').update({
    weight_kg: weightKg,
    logged_at: loggedAt,
    notes: notes ?? null,
  }).eq('id', id);
  // 23505: same weight already exists for this pet on the target date — treat as success.
  if (error && error.code !== '23505') throw error;
}

export async function deleteWeightLog(id: string): Promise<void> {
  const { error } = await supabase.from('weight_logs').delete().eq('id', id);
  if (error) throw error;
}
