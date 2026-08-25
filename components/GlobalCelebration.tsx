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
import { useEffect, useRef, useState } from 'react';
import BalloonCelebration from './BalloonCelebration';
import { useCelebrationStore } from '@/store/celebrationStore';

export default function GlobalCelebration() {
  const seq = useCelebrationStore(s => s.seq);
  const [visible, setVisible] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
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
