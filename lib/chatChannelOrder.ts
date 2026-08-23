import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const PINS_KEY_PREFIX = 'chat_channel_pins_'; // legacy per-device cache, see below

// The channel strip auto-sorts by most-recent-message by default (see
// sortChannelIds below) — pins are the only manual override, letting a user
// keep a favorite channel first regardless of activity. Was AsyncStorage-only
// (device-local) — a pin never survived a reinstall or synced to a second
// device for the same person. Now backed by chat_pinned_channels, personal
// per-member (not family-wide — a parent pinning #parents-vault doesn't
// pin it for the kids too). AsyncStorage is kept as a same-session cache
// only, keyed per-member so switching the active profile on one device
// can't leak the previous member's pins while the DB fetch is in flight.
export async function loadPinnedChannels(memberId: string): Promise<string[]> {
  const cacheKey = PINS_KEY_PREFIX + memberId;
  try {
    const { data, error } = await supabase
      .from('chat_pinned_channels')
      .select('channel_id')
      .eq('member_id', memberId)
      .order('pinned_at', { ascending: true });
    if (error) throw error;
    const pins = (data ?? []).map(r => r.channel_id as string);
    AsyncStorage.setItem(cacheKey, JSON.stringify(pins)).catch(() => {});
    return pins;
  } catch (e) {
    console.warn('[chatChannelOrder] loadPinnedChannels DB fetch failed, falling back to cache', (e as any)?.message ?? e);
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }
}

export async function togglePinnedChannel(memberId: string, channelId: string, pin: boolean): Promise<void> {
  if (pin) {
    // Check-then-insert, not upsert(ignoreDuplicates) — confirmed via
    // direct testing (store/chatStore.ts's ensureDmChannelRow/
    // ensureGroupChannelRow) that Supabase's upsert with
    // ignoreDuplicates:true (Prefer: resolution=ignore-duplicates) fails
    // RLS's INSERT policy even on a genuinely fresh row with zero
    // conflict, while an otherwise-identical plain insert succeeds.
    const { data: existing } = await supabase
      .from('chat_pinned_channels')
      .select('member_id')
      .eq('member_id', memberId)
      .eq('channel_id', channelId)
      .maybeSingle();
    if (existing) return;
    const { error } = await supabase
      .from('chat_pinned_channels')
      .insert({ member_id: memberId, channel_id: channelId });
    // A duplicate-key error means another device won the race and pinned
    // it between our SELECT and INSERT — not a real failure.
    if (error && error.code !== '23505') console.warn('[chatChannelOrder] pin failed', error.message);
  } else {
    const { error } = await supabase
      .from('chat_pinned_channels')
      .delete()
      .eq('member_id', memberId)
      .eq('channel_id', channelId);
    if (error) console.warn('[chatChannelOrder] unpin failed', error.message);
  }
}

// Pinned ids first (in pin order), then everything else by most-recent-
// activity descending (channels with no activity yet sink to the bottom,
// keeping their relative `ids` order among themselves).
export function sortChannelIds(ids: string[], pinned: string[], lastActivity: Record<string, string>): string[] {
  const pinnedSet = new Set(pinned.filter(id => ids.includes(id)));
  const pinnedOrdered = pinned.filter(id => pinnedSet.has(id));
  const rest = ids.filter(id => !pinnedSet.has(id));
  const withActivity = rest.filter(id => lastActivity[id]);
  const withoutActivity = rest.filter(id => !lastActivity[id]);
  withActivity.sort((a, b) => (lastActivity[b] > lastActivity[a] ? 1 : -1));
  return [...pinnedOrdered, ...withActivity, ...withoutActivity];
}
