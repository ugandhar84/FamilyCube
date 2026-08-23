import { supabase } from '@/lib/supabase';

export interface AskCubeProposal {
  kind: 'event' | 'quest' | 'grocery' | 'meal' | 'update_event' | 'update_chore' | 'redemption';
  data: Record<string, any>;
}

export interface AskCubeChoreRef {
  id: string;
  title: string;
}

export interface AskCubeResponse {
  conversationId: string;
  answer: string;
  proposals: AskCubeProposal[];
  chores: AskCubeChoreRef[];
}

export const askCube = {
  async send(memberId: string, message: string, conversationId?: string): Promise<AskCubeResponse> {
    const { data, error } = await supabase.functions.invoke('ask-cube', {
      body: { memberId, message, conversationId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return { ...data, proposals: data?.proposals ?? [], chores: data?.chores ?? [] } as AskCubeResponse;
  },

  // Most-recently-updated conversation for this member, if any — so
  // reopening the FAB resumes the same thread instead of always starting
  // fresh (client-only history was rejected in favor of real persistence).
  async getLatestConversation(memberId: string): Promise<string | null> {
    const { data } = await supabase.from('ask_cube_conversations')
      .select('id').eq('member_id', memberId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return data?.id ?? null;
  },

  // Full history for this member, most-recently-updated first — powers the
  // conversation history sheet. Scoped by member_id, matching
  // getLatestConversation above (each person's chat with Cube is their own
  // thread, not shared family-wide — see the RLS policy comment in
  // 20260818233000_ask_cube_conversations.sql).
  async listConversations(memberId: string): Promise<{ id: string; title: string | null; updatedAt: string }[]> {
    const { data, error } = await supabase.from('ask_cube_conversations')
      .select('id, title, updated_at')
      .eq('member_id', memberId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
  },

  async getMessages(conversationId: string) {
    const { data, error } = await supabase.from('ask_cube_messages')
      .select('id, role, content, proposal, proposal_status, chore_refs, created_at')
      .eq('conversation_id', conversationId)
      // tool rows (raw JSON results) and assistant rows that only carry
      // tool_calls (content null) are internal to the model loop — the chat
      // UI only ever renders real user/assistant turns and inline proposal
      // cards, never a tool's raw JSON payload.
      .in('role', ['user', 'assistant'])
      .not('content', 'is', null)
      .order('created_at');
    if (error) throw error;
    return data ?? [];
  },

  async startNewConversation() {
    return undefined; // omitting conversationId on the next send() starts a fresh thread
  },
};
