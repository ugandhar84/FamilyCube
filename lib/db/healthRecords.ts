import { supabase } from '@/lib/supabase';

export async function getHealthRecords(petId: string, limit = 50) {
  const { data, error } = await supabase
    .from('health_records')
    .select('id,pet_id,file_name,file_type,page_count,status,error_message,ai_summary,auto_saved,extracted_data,created_at')
    .eq('pet_id', petId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getHealthRecord(id: string) {
  const { data, error } = await supabase
    .from('health_records')
    .select('id,pet_id,file_name,file_type,file_url,page_count,status,error_message,ai_summary,extracted_data,structured_data,auto_saved,created_at,updated_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateHealthRecord(id: string, payload: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('health_records').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteHealthRecord(id: string): Promise<void> {
  // pet_timelines has source_record_id with FK ON DELETE CASCADE so the DB handles
  // its cleanup automatically. Other tables (lab_results, vaccines, medications,
  // appointments, weight_logs) do NOT have a source_record_id column — attempting
  // to delete by it causes a PostgREST column-not-found error.
  const { error } = await supabase.from('health_records').delete().eq('id', id);
  if (error) throw error;
}
