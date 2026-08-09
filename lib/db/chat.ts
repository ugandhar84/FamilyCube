import { supabase } from '@/lib/supabase';

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  message_type: string;
  content: string | null;
  proposed_date: string | null;
  proposed_time: string | null;
  proposed_location: string | null;
  proposal_status: string | null;
  created_at: string;
}

const PAGE_SIZE = 30;

export async function getMessagesPage(
  chatId: string,
  cursor?: string, // ISO timestamp — load messages OLDER than this
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  let q = supabase
    .from('playdate_chat_messages')
    .select('id,chat_id,sender_id,message_type,content,proposed_date,proposed_time,proposed_location,proposal_status,created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw error;

  // Reverse to chronological order for display
  const messages = ((data ?? []) as ChatMessage[]).reverse();
  return { messages, hasMore: (data?.length ?? 0) === PAGE_SIZE };
}

export async function sendChatMessage(
  chatId: string,
  senderId: string,
  content: string,
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('playdate_chat_messages')
    .insert({ chat_id: chatId, sender_id: senderId, message_type: 'text', content })
    .select()
    .single();
  if (error) throw error;
  return data as ChatMessage;
}
