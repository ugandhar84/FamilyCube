import { supabase } from '@/lib/supabase';

export async function getAppSetting<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? null;
}

export async function getAppSettings(keys: string[]): Promise<Record<string, unknown>> {
  if (!keys.length) return {};
  const { data, error } = await supabase.from('app_settings').select('key,value').in('key', keys);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(r => [r.key, r.value]));
}

export async function setAppSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: updatedBy },
    { onConflict: 'key' },
  );
  if (error) throw error;
}
