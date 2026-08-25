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
    // the client, since this is the actual delivery gate.
    let inChannel: (memberId: string) => boolean;
    if (channelId.startsWith('dm_')) {
      // Deterministic pair-id scheme: dm_<sortedIdA>_<sortedIdB> — splitting
      // the id on '_' breaks for any real member id that itself contains an
      // underscore (confirmed live in this family's data, e.g. 'm_...'),
      // fracturing that member's id into extra segments that never match.
      // Query chat_channels' own member_ids (the source of truth
      // is_chat_channel_participant's RLS function also relies on,
      // corrected the same way after the same bug broke production chat
      // earlier this session) instead of re-parsing the id string.
      const { data: dmChannel } = await supabase
        .from('chat_channels')
        .select('member_ids')
        .eq('id', channelId)
        .maybeSingle();
      const dmMemberIds: string[] = Array.isArray(dmChannel?.member_ids) ? dmChannel!.member_ids : [];
      inChannel = (memberId) => dmMemberIds.includes(memberId);
    } else if (channelId === 'parents') {
      inChannel = (memberId) => members.find(m => m.id === memberId)?.role === 'parent';
    } else if (channelId === 'seniors_all') {
      // The whole family — both grandparents, both parents, every kid/teen.
      inChannel = () => true;
    } else if (channelId === 'seniors_a' || channelId === 'seniors_b') {
      // That side's grandparent(s) + everyone else (parents/kids/teens),
      // excluding only the OTHER side's grandparent — mirrors
      // buildGroupChannels'/ChatScreen.tsx's sideForGp derivation
      // (linkedParentId → parents[0]='a' side / parents[1]='b' side; an
      // unlinked senior falls into the 'a' side, matching that same
      // fallback rule).
      const parentsForSide = members.filter((m: any) => m.role === 'parent').sort((a: any, b: any) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      const wantSide = channelId === 'seniors_a' ? 0 : 1;
      inChannel = (memberId) => {
        const m = members.find((x: any) => x.id === memberId);
        if (!m) return false;
        if (m.role !== 'senior') return true;
        const linked = (m as any).linked_parent_id;
        if (!linked) return wantSide === 0; // unlinked → side A fallback
        return linked === parentsForSide[wantSide]?.id;
      };
    } else if (channelId.startsWith('seniors')) {
      // Unrecognized seniors_* variant — fall back to the pre-existing
      // senior-or-parent rule rather than guessing further.
      inChannel = (memberId) => {
        const role = members.find((m: any) => m.id === memberId)?.role;
        return role === 'senior' || role === 'parent';
      };
    } else if (channelId === 'all') {
      // Grandparents never have #all-family — they get their own Grand
      // Squad channels instead (matches ChatScreen.tsx's own
      // `ch.id !== 'all' || !isSenior` gate and the server-side RLS rule).
      inChannel = (memberId) => members.find((m: any) => m.id === memberId)?.role !== 'senior';
    } else {
      // Any other unrecognized id — whole family, matching prior behavior.
      inChannel = () => true;
    }

    // ── 3. Match @mentions against member first names (case-insensitive),
    //      scoped to actual channel participants ───────────────────────────────
    const mentionedMembers = members.filter(m => {
      if (!inChannel(m.id)) return false;
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
