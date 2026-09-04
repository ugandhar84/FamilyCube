import { create } from 'zustand';

/**
 * useRecoveryBackfillStore — surfaces progress of the chat recovery
 * backfill (lib/deviceRegistry.ts's runChatRecoveryBackfillInBackground)
 * so RecoveryBackfillBanner.tsx can show a lightweight "Securing older
 * messages…" banner while it runs, instead of it silently working in the
 * background with no visible feedback. Purely informational — nothing
 * here drives the actual crypto, which lives entirely in deviceRegistry.ts.
 */
interface RecoveryBackfillState {
  active: boolean;
  wrappedSoFar: number;
  start: () => void;
  progress: (justWrapped: number) => void;
  finish: () => void;
}

export const useRecoveryBackfillStore = create<RecoveryBackfillState>((set) => ({
  active: false,
  wrappedSoFar: 0,
  start: () => set({ active: true, wrappedSoFar: 0 }),
  progress: (justWrapped) => set(s => ({ wrappedSoFar: s.wrappedSoFar + justWrapped })),
  finish: () => set({ active: false }),
}));
