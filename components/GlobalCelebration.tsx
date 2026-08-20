/**
 * GlobalCelebration — mounts once at a screen's root (outside any
 * ScrollView) and plays a full-screen CelebrationBurst whenever
 * useCelebrationStore().trigger() fires, e.g. a parent approving & paying
 * out a chore several component layers deep.
 */
import { useEffect, useRef, useState } from 'react';
import FullScreenCelebration from './FullScreenCelebration';
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
    <FullScreenCelebration
      visible={visible}
      onDone={() => setVisible(false)}
    />
  );
}
