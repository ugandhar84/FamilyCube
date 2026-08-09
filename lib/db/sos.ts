import { supabase } from '@/lib/supabase';

export async function getLostAlerts(limit = 20) {
  const { data, error } = await supabase
    .from('lost_alerts')
    .select('*')
    .eq('is_found', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getMyLostAlerts(userId: string) {
  const { data, error } = await supabase
    .from('lost_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertLostAlert(payload: Record<string, any>) {
  const { data, error } = await supabase.from('lost_alerts').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateLostAlert(id: string, payload: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('lost_alerts').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteLostAlert(id: string): Promise<void> {
  const { error } = await supabase.from('lost_alerts').delete().eq('id', id);
  if (error) throw error;
}
