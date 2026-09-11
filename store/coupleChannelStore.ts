/**
 * coupleChannelStore — session-only state for the "Just Us" private
 * parents-only chat channel: whether the current session has unlocked a
 * given channel's PIN, and whether each channel is currently enabled
 * (i.e. has a PIN set at all) per the last known server state.
 *
 * Deliberately NOT persisted to AsyncStorage — an "unlocked this session"
 * flag surviving app restarts would defeat the point of the PIN. Must be
 * wiped on sign-out the same way chatStore.reset() wipes its own state,
 * or the unlock would leak to the next signed-in account on a shared
 * device (the exact bug class fixed in commit 50d2796e for chatStore).
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface CoupleChannelState {
  unlockedChannelIds: Set<string>;
  enabledChannelIds: Set<string>;

  isUnlocked: (channelId: string) => boolean;
  markUnlocked: (channelId: string) => void;

  isEnabled: (channelId: string) => boolean;
  refreshEnabled: (channelId: string) => Promise<boolean>;

  reset: () => void;
}

export const useCoupleChannelStore = create<CoupleChannelState>((set, get) => ({
  unlockedChannelIds: new Set(),
  enabledChannelIds: new Set(),

  isUnlocked: (channelId) => get().unlockedChannelIds.has(channelId),
  markUnlocked: (channelId) => set(s => ({ unlockedChannelIds: new Set(s.unlockedChannelIds).add(channelId) })),

  isEnabled: (channelId) => get().enabledChannelIds.has(channelId),
  refreshEnabled: async (channelId) => {
    const { data } = await supabase
      .from('chat_channels')
      .select('pin_hash')
      .eq('id', channelId)
      .maybeSingle();
    const enabled = !!data?.pin_hash;
    set(s => {
      const next = new Set(s.enabledChannelIds);
      if (enabled) next.add(channelId); else next.delete(channelId);
      return { enabledChannelIds: next };
    });
    return enabled;
  },

  reset: () => set({ unlockedChannelIds: new Set(), enabledChannelIds: new Set() }),
}));
