import AsyncStorage from '@react-native-async-storage/async-storage';

const PINS_KEY = 'chat_channel_pins';

// The channel strip auto-sorts by most-recent-message by default (see
// sortChannelIds below) — pins are the only manual override, letting a user
// keep a favorite channel first regardless of activity.
export async function loadPinnedChannels(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(PINS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function savePinnedChannels(pins: string[]): Promise<void> {
  await AsyncStorage.setItem(PINS_KEY, JSON.stringify(pins));
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
