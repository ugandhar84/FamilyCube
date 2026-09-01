/**
 * GlobalCelebration — mounts once at a screen's root (outside any
 * ScrollView) and plays a full-screen congratulations effect whenever
 * useCelebrationStore().trigger() fires, e.g. a parent approving & paying
 * out a chore several component layers deep, or a kid seeing a fresh
 * cheer/approved-permission/approved-chore land on their own Hub.
 *
 * Uses the iMessage-style balloon rise (BalloonCelebration) rather than the
 * older confetti-from-center burst (FullScreenCelebration) — requested
 * specifically for genuinely congratulatory moments; kept FullScreenCelebration
 * as a separate component rather than deleting it in case a non-congratulatory
 * celebration need comes up later that wants the punchier confetti-pop feel.
 */
import { useEffect, useState } from 'react';
import BalloonCelebration from './BalloonCelebration';
import { useCelebrationStore } from '@/store/celebrationStore';

export default function GlobalCelebration() {
  const seq = useCelebrationStore(s => s.seq);
  const [visible, setVisible] = useState(false);

  // Was: a mounted-ref guard that swallowed the FIRST trigger() of every
  // session — seq starts at 0 fresh on every app load (never persisted),
  // so there was never a stale-value case to guard against, only a race
  // against whichever caller's own mount effect (e.g.
  // KidNeedsYouSection's DB-backed watermark celebration, which can fire
  // synchronously on the very first Hub render) happened to run trigger()
  // before this component's own mount effect had set the guard —
  // live-reported: celebration never plays at all, for any approval.
  useEffect(() => {
    if (seq === 0) return;
    setVisible(true);
  }, [seq]);

  if (!visible) return null;

  return (
    <BalloonCelebration
      visible={visible}
      onDone={() => setVisible(false)}
    />
  );
}
