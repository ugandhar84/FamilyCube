import { create } from 'zustand';

// Fire-and-forget signal for a full-screen celebration burst (e.g. a parent
// approving & paying out a chore). Deeply nested cards can't render their
// own full-screen overlay — they're clipped by whatever ScrollView/card
// wraps them — so they call trigger() and a single listener mounted at the
// screen root (GlobalCelebration) reacts to it instead.
interface CelebrationState {
  seq: number;
  trigger: () => void;
}

export const useCelebrationStore = create<CelebrationState>((set) => ({
  seq: 0,
  trigger: () => set(s => ({ seq: s.seq + 1 })),
}));
