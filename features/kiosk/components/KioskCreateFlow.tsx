/**
 * useKioskCreateFlow — the "+" on the kiosk Chores page. A parent gets the
 * smart composer (describe it in a sentence, it classifies chore vs event and
 * pre-fills), with "full form" hand-offs to the kiosk chore / event forms. A
 * kid gets the Ask-a-parent picker instead (no direct creation), exactly as
 * the full board did. Returns `open()` and a `node` to render once.
 */
import { useState, type ReactNode } from 'react';
import type { FamilyMember } from '@/store/familyStore';
import KioskSmartTaskComposer from './KioskSmartTaskComposer';
import { KioskAddChoreForm } from './KioskAddChoreForm';
import { KioskAddEventForm } from './KioskAddEventForm';
import { useKioskAskParent } from './KioskAskParentFlow';

export function useKioskCreateFlow({ active, members }: { active: FamilyMember; members: FamilyMember[] }): { open: () => void; node: ReactNode } {
  const isKid = active.role === 'kid';
  const [showComposer, setShowComposer] = useState(false);
  const [questPrefill, setQuestPrefill] = useState<any>(undefined);
  const [eventPrefill, setEventPrefill] = useState<any>(undefined);
  const [showQuest, setShowQuest] = useState(false);
  const [showEvent, setShowEvent] = useState(false);
  const { openPicker, node: askNode } = useKioskAskParent({ active, members, withPicker: true });

  const open = () => { if (isKid) openPicker(); else setShowComposer(true); };

  const node = (
    <>
      {askNode}
      <KioskSmartTaskComposer
        visible={showComposer}
        members={members}
        activeMemberId={active.id}
        familyId={active.familyId ?? ''}
        onClose={() => setShowComposer(false)}
        onCreated={() => setShowComposer(false)}
        onOpenFullForm={(kind, prefill) => {
          setShowComposer(false);
          if (kind === 'quest') { setQuestPrefill(prefill); setShowQuest(true); }
          else { setEventPrefill(prefill); setShowEvent(true); }
        }}
      />
      {showQuest && (
        <KioskAddChoreForm
          visible={showQuest}
          onClose={() => { setShowQuest(false); setQuestPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={questPrefill}
          initialStep={questPrefill ? 'review' : undefined}
        />
      )}
      {showEvent && (
        <KioskAddEventForm
          visible={showEvent}
          onClose={() => { setShowEvent(false); setEventPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={eventPrefill}
          initialStep="review"
        />
      )}
    </>
  );
  return { open, node };
}
