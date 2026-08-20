import { create } from 'zustand';

interface NetworkState {
  isOffline: boolean;
  setOffline: (v: boolean) => void;
}

export const useNetworkStore = create<NetworkState>(set => ({
  isOffline: false,
  setOffline: (v) => set({ isOffline: v }),
}));

// Show the banner only after 5 consecutive failures — avoids false positives on
// lock/unlock when iOS momentarily drops connectivity before re-establishing it.
const FAILURE_THRESHOLD = 5;
let _failureCount = 0;

/** Call this wherever a network failure is caught. Shows the banner after N consecutive failures. */
export function markNetworkOffline() {
  _failureCount++;
  if (_failureCount < FAILURE_THRESHOLD) return; // silent — still in retry window
  useNetworkStore.getState().setOffline(true);
}

/** Call this on any successful network request to reset the failure counter. */
export function markNetworkOnline() {
  _failureCount = 0;
  if (useNetworkStore.getState().isOffline) {
    useNetworkStore.getState().setOffline(false);
    // Offline → online transition: retry anything chatStore.sendMessage
    // queued to AsyncStorage while a send failed. Previously nothing ever
    // read that queue back — a message composed while offline was queued
    // once and then silently lost forever, with no error shown to the
    // sender (see chatStore's OFFLINE_KEY). Lazy require to avoid a
    // circular import (networkStore is imported by lib/supabase.ts, which
    // chatStore itself depends on transitively), same pattern choreStore
    // already uses for its own cross-store require.
    try {
      const { useChatStore } = require('@/store/chatStore');
      useChatStore.getState().flushOfflineQueue?.().catch((e: any) =>
        console.warn('[networkStore] flushOfflineQueue failed:', e?.message));
    } catch { /* chatStore not mounted yet */ }
  }
}

/** Returns true when the error looks like a connectivity failure. */
export function isNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('no internet') ||
    msg.includes('fetch error') ||
    msg.includes('typeerror: failed')
  );
}
