import { supabase } from '@/lib/supabase';
import { todayLocal } from '@/lib/dates';

// ── Requests ──────────────────────────────────────────────────────────────────

export async function getOutgoingRequests(fromPetId: string, limit = 50) {
  const { data, error } = await supabase
    .from('playdate_requests')
    .select(`
      id, status, created_at, to_pet_id,
      to_pet:pets!playdate_requests_to_pet_id_fkey(id, name, emoji, accent_color, avatar_url, breed, birthday)
    `)
    .eq('from_pet_id', fromPetId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getIncomingRequests(toPetId: string) {
  const { data, error } = await supabase
    .from('playdate_requests')
    .select(`
      id, from_pet_id, to_pet_id, status, created_at,
      from_pet:pets!playdate_requests_from_pet_id_fkey(name, emoji, accent_color, breed, birthday, avatar_url, owner_id),
      to_pet:pets!playdate_requests_to_pet_id_fkey(name, emoji, owner_id, avatar_url)
    `)
    .eq('status', 'pending')
    .eq('to_pet_id', toPetId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function sendPlaydateRequest(fromPetId: string, toPetId: string) {
  const { data, error } = await supabase
    .from('playdate_requests')
    .insert({ from_pet_id: fromPetId, to_pet_id: toPetId, status: 'pending' })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function deletePlaydateRequest(requestId: string) {
  const { error } = await supabase.from('playdate_requests').delete().eq('id', requestId);
  if (error) throw error;
}

export async function withdrawPlaydateRequest(fromPetId: string, toPetId: string) {
  const { error } = await supabase.from('playdate_requests')
    .delete().eq('from_pet_id', fromPetId).eq('to_pet_id', toPetId);
  if (error) throw error;
}

export async function bulkDeletePlaydateRequests(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('playdate_requests').delete().in('id', ids);
  if (error) throw error;
}

export async function bulkDeletePlaydateChats(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('playdate_chats').delete().in('id', ids);
  if (error) throw error;
}

// ── Chats ─────────────────────────────────────────────────────────────────────

export async function getPlaydateChats(userId: string, petId: string, limit = 50) {
  const today = todayLocal();
  const { data, error } = await supabase
    .from('playdate_chats')
    .select(`
      id, status, agreed_date, agreed_time, agreed_location, created_at,
      from_owner_id, to_owner_id, from_pet_id, to_pet_id,
      from_last_read_at, to_last_read_at,
      from_pet:pets!playdate_chats_from_pet_id_fkey(id, name, emoji, avatar_url, accent_color),
      to_pet:pets!playdate_chats_to_pet_id_fkey(id, name, emoji, avatar_url, accent_color)
    `)
    .or(`from_pet_id.eq.${petId},to_pet_id.eq.${petId}`)
    // Exclude cancelled/declined at DB level
    .in('status', ['negotiating', 'agreed'])
    // Exclude past confirmed playdates at DB level
    .or(`status.eq.negotiating,agreed_date.is.null,agreed_date.gte.${today}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function markChatRead(chatId: string, userId: string, iAmFrom: boolean) {
  const col = iAmFrom ? 'from_last_read_at' : 'to_last_read_at';
  const { error } = await supabase.from('playdate_chats')
    .update({ [col]: new Date().toISOString() }).eq('id', chatId);
  if (error) throw error;
}

export async function updateChatStatus(
  chatId: string,
  status: string,
  extra?: { agreed_date?: string; agreed_time?: string; agreed_location?: string },
) {
  const { error } = await supabase.from('playdate_chats')
    .update({ status, ...extra }).eq('id', chatId);
  if (error) throw error;
}

// ── Chat messages ─────────────────────────────────────────────────────────────

export async function getChatMessages(chatId: string, limit = 30, cursor?: string) {
  let q = supabase
    .from('playdate_chat_messages')
    .select('id,chat_id,sender_id,message_type,content,proposed_date,proposed_time,proposed_location,proposal_status,created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (cursor) q = q.lt('created_at', cursor);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).reverse();
}

export async function sendChatMessage(payload: {
  chat_id: string; sender_id: string; message_type: string;
  content?: string | null; proposed_date?: string | null;
  proposed_time?: string | null; proposed_location?: string | null;
}) {
  const { data, error } = await supabase.from('playdate_chat_messages')
    .insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateProposalStatus(messageId: string, status: string) {
  const { error } = await supabase.from('playdate_chat_messages')
    .update({ proposal_status: status }).eq('id', messageId);
  if (error) throw error;
}
