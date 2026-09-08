// FamilyCube — Edge Function: chat-notify
// Called fire-and-forget from chatStore.sendMessage for EVERY new chat
// message (not just @mentions, which mention-notify already covers
// separately) — live-reported: "why chat notifications are not coming."
// Resolves the other participants of the sending channel/DM (excluding the
// sender), sends push via family-notifier under the 'chat' category —
// distinct from mention-notify's 'mentions' category, so a member can
// control general chat pushes and @mention pushes independently (see
// family-notifier's chat_message vs chat_mention CATEGORY_BY_TYPE entries).
//
// Deploy: supabase functions deploy chat-notify
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveChannelMembership } from '../_shared/chatChannelMembers.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Minimal, server-side label for the FIXED group channels only — mirrors
// features/chat/components/constants.ts's own static labels for these ids.
// DM channels and per-family senior-side channels intentionally get no
// label here (the push already leads with the sender's name, which is
// enough context for a 1-on-1); this only exists to distinguish "a message
// in a group channel" from "a DM" in the notification title.
const GROUP_LABELS: Record<string, string> = {
  all: 'Family Chat',
  parents: 'Parents Vault',
  seniors_all: 'the Grand Squad',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { channelId, senderId, text, mentions } = await req.json() as {
      channelId: string;
      senderId:  string;
      text:      string;
      mentions?: string[]; // real member ids (or the synthetic 'everyone'), already-notified-via-mention-notify — used to avoid double-pinging them
    };

    if (!senderId || !channelId) {
      return json({ ok: false, error: 'senderId, channelId required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: sender } = await supabase
      .from('members')
      .select('id, name, family_id')
      .eq('id', senderId)
      .single();
    if (!sender?.family_id) return json({ ok: true, notified: 0 });

    const { data: allMembers } = await supabase
      .from('members')
      .select('id, name, role, linked_parent_id, created_at')
      .eq('family_id', sender.family_id);
    if (!allMembers?.length) return json({ ok: true, notified: 0 });

    const inChannel = await resolveChannelMembership(supabase, channelId, allMembers as any);
    // Exclude the sender, and anyone already pinged by mention-notify for
    // this same message — they don't need two separate pushes for one
    // send. `mentions` is now real member ids (chatStore.ts extracts the
    // id out of the stored @[Name|id] token, not the display name — see
    // that file's own comment on why matching by first name was always
    // wrong/dead code here), plus the synthetic id 'everyone' when an
    // @everyone mention is present, which every recipient here already
    // counts as — so an @everyone message correctly skips this whole
    // plain-chat push entirely and lets mention-notify's own (now-working)
    // 'everyone' push be the only one that fires, rather than double-
    // pinging the whole family once from each function.
    const mentionedIds = new Set(mentions ?? []);
    const isEveryoneMentioned = mentionedIds.has('everyone');
    const recipients = isEveryoneMentioned ? [] : (allMembers as any[]).filter(m =>
      m.id !== senderId &&
      inChannel(m.id) &&
      !mentionedIds.has(m.id),
    );
    if (!recipients.length) return json({ ok: true, notified: 0 });

    const channelLabel = GROUP_LABELS[channelId];
    // Strip @[Name|id] mention tokens down to plain "@Name" before slicing
    // for the push preview — a push notification body has no rich-text
    // renderer the way MentionText.tsx does client-side, so the raw
    // bracket syntax showed up literally (live-reported: "push is coming
    // weired" / "@[Everyone|everyone] yeah even chat showing this" —
    // same underlying gap, fixed here for the push preview and separately
    // for the chat app's own reply-quote previews, the other two PLAIN
    // Text spots that show raw message text).
    const displayText = text.replace(/@\[([^\]]+)\|([^\]]+)\]/g, (_m: string, name: string, id: string) =>
      id === 'everyone' ? '@everyone' : `@${name.split(' ')[0]}`);
    const preview = displayText.length > 80 ? displayText.slice(0, 77) + '…' : displayText;

    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    await fetch(notifierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        type: 'chat_message',
        memberIds: recipients.map((m: any) => m.id),
        familyId: sender.family_id,
        persist: true,
        payload: { senderName: sender.name, senderId, channelId, channelLabel, preview },
      }),
    });

    console.log(`[chat-notify] ${sender.name} → ${recipients.length} recipient(s) in ${channelId}`);
    return json({ ok: true, notified: recipients.length });

  } catch (e: any) {
    console.error('[chat-notify]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
