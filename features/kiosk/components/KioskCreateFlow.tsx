/**
 * useKioskCreateFlow — the "+" on the kiosk Chores page. A parent gets the
 * "Just describe your task" drawer (say or type a sentence); a kid
 * gets the Ask-a-parent picker instead (no direct creation). Returns
 * `open()` and a `node` to render once.
 */
import { useState, type ReactNode } from 'react';
import type { FamilyMember } from '@/store/familyStore';
import { KioskJustDescribeTaskDrawer } from './KioskJustDescribeDrawer';
import { useKioskAskParent } from './KioskAskParentFlow';

export function useKioskCreateFlow({ active, members }: { active: FamilyMember; members: FamilyMember[] }): { open: () => void; node: ReactNode } {
  const isKid = active.role === 'kid';
  const [show, setShow] = useState(false);
  const { openPicker, node: askNode } = useKioskAskParent({ active, members, withPicker: true });
  const open = () => { if (isKid) openPicker(); else setShow(true); };
  const node = (
    <>
      {askNode}
      <KioskJustDescribeTaskDrawer visible={show} onClose={() => setShow(false)} active={active} members={members} />
    </>
  );
  return { open, node };
}
