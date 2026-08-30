// Shared "who's actually in this chat channel" resolver — extracted from
// mention-notify/index.ts (its original single caller) so chat-notify (real
// per-message push, not just @mentions) can use the EXACT same rule instead
// of a second hand-copied version that could drift out of sync with
// ChatScreen.tsx's own channel-membership logic.
//
// `members` must be the full family roster (role, linked_parent_id,
// created_at) — the seniors_a/seniors_b branch needs the whole roster to
// correctly derive side-A/side-B, not just the channel's own participants.
export async function resolveChannelMembership(
  supabase: any,
  channelId: string,
  members: { id: string; role: string; linked_parent_id?: string | null; created_at?: string | null }[],
): Promise<(memberId: string) => boolean> {
  if (channelId.startsWith('dm_')) {
    // Deterministic pair-id scheme: dm_<sortedIdA>_<sortedIdB> — splitting the
    // id on '_' breaks for any real member id that itself contains an
    // underscore. Query chat_channels' own member_ids (the source of truth
    // is_chat_channel_participant's RLS function also relies on) instead of
    // re-parsing the id string.
    const { data: dmChannel } = await supabase
      .from('chat_channels')
      .select('member_ids')
      .eq('id', channelId)
      .maybeSingle();
    const dmMemberIds: string[] = Array.isArray(dmChannel?.member_ids) ? dmChannel!.member_ids : [];
    return (memberId: string) => dmMemberIds.includes(memberId);
  }
  if (channelId === 'parents') {
    return (memberId: string) => members.find(m => m.id === memberId)?.role === 'parent';
  }
  if (channelId === 'seniors_all') {
    // The whole family — both grandparents, both parents, every kid/teen.
    return () => true;
  }
  if (channelId === 'seniors_a' || channelId === 'seniors_b') {
    // That side's grandparent(s) + everyone else (parents/kids/teens),
    // excluding only the OTHER side's grandparent — mirrors
    // buildGroupChannels'/ChatScreen.tsx's sideForGp derivation
    // (linkedParentId → parents[0]='a' side / parents[1]='b' side; an
    // unlinked senior falls into the 'a' side, matching that same fallback
    // rule).
    const parentsForSide = members.filter(m => m.role === 'parent')
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    const wantSide = channelId === 'seniors_a' ? 0 : 1;
    return (memberId: string) => {
      const m = members.find(x => x.id === memberId);
      if (!m) return false;
      if (m.role !== 'senior') return true;
      const linked = m.linked_parent_id;
      if (!linked) return wantSide === 0; // unlinked → side A fallback
      return linked === parentsForSide[wantSide]?.id;
    };
  }
  if (channelId.startsWith('seniors')) {
    // Unrecognized seniors_* variant — fall back to the pre-existing
    // senior-or-parent rule rather than guessing further.
    return (memberId: string) => {
      const role = members.find(m => m.id === memberId)?.role;
      return role === 'senior' || role === 'parent';
    };
  }
  if (channelId === 'all') {
    // Grandparents never have #all-family — they get their own Grand Squad
    // channels instead (matches ChatScreen.tsx's own `ch.id !== 'all' ||
    // !isSenior` gate and the server-side RLS rule).
    return (memberId: string) => members.find(m => m.id === memberId)?.role !== 'senior';
  }
  // Any other unrecognized id — whole family, matching prior behavior.
  return () => true;
}
