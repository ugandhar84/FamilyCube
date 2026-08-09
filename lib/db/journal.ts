import { supabase } from '@/lib/supabase';

/** Single RPC call — returns all journal data for a pet, with optional cursor for pagination. */
export async function getJournalData(
  petId: string,
  limit = 60,
  cursor?: string,   // ISO timestamp — load entries older than this
): Promise<Record<string, any[]>> {
  const params: Record<string, any> = { p_pet_id: petId, p_limit: limit };
  if (cursor) params.p_cursor = cursor;
  const { data, error } = await supabase.rpc('get_pet_journal', params);
  if (error) {
    if (error.code === 'PGRST202') {
      console.warn('[journal] get_pet_journal RPC not found — run migration_journal_rpc_v2.sql');
      return { notes:[], moods:[], meals:[], grooming:[], tasks:[], vet_visits:[], weights:[], milestones:[], medications:[], vaccines:[], appointments:[], profiles:[] };
    }
    throw error;
  }
  return data as Record<string, any[]>;
}

export async function savePetNote(
  petId: string, authorId: string, content: string, isPrivate = false,
): Promise<void> {
  const { error } = await supabase.from('pet_notes').insert({
    pet_id: petId, author_id: authorId, content,
    is_private: isPrivate, noted_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function updatePetNote(
  id: string,
  payload: { content?: string; is_private?: boolean; updated_at?: string; updated_by?: string },
): Promise<void> {
  const { error } = await supabase.from('pet_notes').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteJournalEntry(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}
