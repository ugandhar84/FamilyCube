// FamilyCube — Edge Function: mention-notify
// Called fire-and-forget from chatStore when a chat message contains @mentions.
// Resolves real member ids against family members, sends push to mentioned
// members (skips the sender), persists in-app notification via family-notifier.
//
// Real, pre-existing bug fixed here: this used to match `mentions` (raw
// @word text) against member FIRST NAMES — but chatStore.ts's own stored
// mention format is @[Name|id], and its extraction regex could never
// actually match that bracket form (see chatStore.ts's own comment), so
// `mentions` reaching this function was always empty for every mention
// sent through the real picker — this function has likely never actually
// fired for a real mention. chatStore.ts now extracts the real member id
// out of the bracket token instead of the display name, so this matches
// by id — exact, not a first-name string comparison, and it's what lets
// the synthetic id 'everyone' (an @everyone mention) resolve to every
// real channel member below rather than needing its own separate code
// path (live-requested: "lets make that as @ everyone").
//
// Deploy: supabase functions deploy mention-notify
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const {
      messageId,
      channelId,
      senderId,
      text,
      mentions,  // string[] — real member ids (or the synthetic 'everyone') extracted by chatStore
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

    // ── 2. Load all family members (excluding sender for notification
    //      purposes — kept separately below for side-derivation, which
    //      must see the FULL parent roster or a sender who is themselves
    //      one of the two parents would silently drop out of the side-A/
    //      side-B index and mis-scope every seniors_a/seniors_b check) ────
    const { data: allMembers } = await supabase
      .from('members')
      .select('id, name, role, expo_push_token, linked_parent_id, created_at')
      .eq('family_id', sender.family_id);

    if (!allMembers?.length) return json({ ok: true, notified: 0 });
    const members = allMembers.filter((m: any) => m.id !== senderId);
    if (!members.length) return json({ ok: true, notified: 0 });

    // ── 2b. Scope to who's actually IN this channel ─────────────────────────────
    // Previously this matched @mentions against every family member with no
    // regard for channelId at all — so mentioning someone in a private 1-on-1
    // DM (e.g. Alex ↔ Priya) could push a real notification, with a text
    // preview of the message, to a completely uninvolved family member (e.g.
    // Maya) who has no access to that conversation. Mirrors the same
    // channel-membership rule the client's own mention-suggestion list uses
    // (ChatScreen.tsx) — recomputed here server-side rather than trusted from
    // the client, since this is the actual delivery gate. Extracted to
    // _shared/chatChannelMembers.ts so chat-notify (real per-message push)
    // uses the identical rule instead of a second hand-copied version.
    const inChannel = await resolveChannelMembership(supabase, channelId, allMembers as any);

    // ── 3. Match @mentions by real member id, scoped to actual channel
    //      participants. 'everyone' is a synthetic id meaning "every real
    //      member of this channel" (excluding the sender, already applied
    //      above) rather than one specific member. ─────────────────────────
    const mentionIds = new Set(mentions);
    const isEveryoneMentioned = mentionIds.has('everyone');
    const mentionedMembers = members.filter(m =>
      inChannel(m.id) && (isEveryoneMentioned || mentionIds.has(m.id)),
    );

    if (!mentionedMembers.length) return json({ ok: true, notified: 0 });

    // ── 4. Delegate to family-notifier for push + persistence ─────────────────
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const notifierHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    // No `tokens` here — family-notifier resolves per-device tokens from
    // member_device_tokens (falling back to members.expo_push_token) itself,
    // given just memberIds. Avoids this function's own snapshot of the
    // single-column token, which is stale for any member who isn't the most
    // recently active profile on a shared device.
    const memberIds = mentionedMembers.map((m: any) => m.id);

    await fetch(notifierUrl, {
      method: 'POST',
      headers: notifierHeaders,
      body: JSON.stringify({
        type: 'chat_mention',
        memberIds,
        familyId: sender.family_id,
        persist: true,
        payload: {
          messageId, channelId,
          senderName: sender.name,
          senderId,
          isEveryone: isEveryoneMentioned,
          // Same @[Name|id] -> "@Name" stripping as chat-notify's own
          // preview — a push body has no rich-text mention renderer
          // (live-reported: "push is coming weired").
          preview: (() => {
            const displayText = text.replace(/@\[([^\]]+)\|([^\]]+)\]/g, (_m: string, name: string, id: string) =>
              id === 'everyone' ? '@everyone' : `@${name.split(' ')[0]}`);
            return displayText.length > 80 ? displayText.slice(0, 77) + '…' : displayText;
          })(),
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
