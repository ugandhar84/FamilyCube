// FamilyCube — Edge Function: mention-notify
// Called fire-and-forget from chatStore when a chat message contains @mentions.
// Resolves @firstName matches against family members, sends push to mentioned
// members (skips the sender), persists in-app notification via family-notifier.
//
// Deploy: supabase functions deploy mention-notify
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const {
      messageId,
      channelId,
      senderId,
      text,
      mentions,  // string[] — the raw @handle words extracted by chatStore
    } = await req.json() as {
      messageId: string;
      channelId: string;
      senderId:  string;
      text:      string;
      mentions:  string[];
    };

    if (!senderId || !channelId || !Array.isArray(mentions) || mentions.length === 0) {
      return json({ ok: false, error: 'senderId, channelId, mentions required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Resolve sender name + family ────────────────────────────────────────
    const { data: sender } = await supabase
      .from('members')
      .select('id, name, family_id')
      .eq('id', senderId)
      .single();

    if (!sender?.family_id) return json({ ok: true, notified: 0 });

    // ── 2. Load all family members (excluding sender) ──────────────────────────
    const { data: members } = await supabase
      .from('members')
      .select('id, name, expo_push_token')
      .eq('family_id', sender.family_id)
      .neq('id', senderId);

    if (!members?.length) return json({ ok: true, notified: 0 });

    // ── 3. Match @mentions against member first names (case-insensitive) ───────
    const mentionedMembers = members.filter(m => {
      const firstName = m.name.split(' ')[0].toLowerCase();
      return mentions.some((handle: string) => handle.toLowerCase() === firstName);
    });

    if (!mentionedMembers.length) return json({ ok: true, notified: 0 });

    // ── 4. Delegate to family-notifier for push + persistence ─────────────────
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const notifierHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    const tokens    = mentionedMembers.map((m: any) => m.expo_push_token).filter(Boolean);
    const memberIds = mentionedMembers.map((m: any) => m.id);

    await fetch(notifierUrl, {
      method: 'POST',
      headers: notifierHeaders,
      body: JSON.stringify({
        type: 'chat_mention',
        tokens,
        memberIds,
        familyId: sender.family_id,
        persist: true,
        payload: {
          messageId, channelId,
          senderName: sender.name,
          senderId,
          preview: text.length > 80 ? text.slice(0, 77) + '…' : text,
        },
      }),
    });

    console.log(`[mention-notify] ${sender.name} mentioned ${memberIds.length} member(s) in channel ${channelId}`);
    return json({ ok: true, notified: memberIds.length });

  } catch (e: any) {
    console.error('[mention-notify]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
