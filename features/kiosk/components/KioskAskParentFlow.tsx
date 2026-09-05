/**
 * KioskAskParentFlow — the kid's eight "ask a parent" destinations, and the
 * state behind them, in ONE place.
 *
 * This used to live inline inside KioskBoardView (KioskTasksTab.tsx): six
 * pieces of useState (one of them tri-valued, covering three of the eight
 * destinations), an `openCreator` dispatcher, one useKioskLockSuspended
 * covering all of them, and six modal components rendered at the bottom of
 * that function. The owner then wanted the same destinations reachable from
 * the Overview's "Your stuff" section too — and a second inline copy is
 * exactly the copy-drift this codebase has been bitten by before (see
 * kidQuestLanes, extracted for the same reason once the kid Overview's "My
 * Chores" widget started answering the same lane questions from a second
 * copy). So it moved here whole.
 *
 * ── The eight destinations ──────────────────────────────────────────────
 * These are AskParentSheet.tsx's own eight options — same keys, same
 * descriptions, same destination modal for each. The first three labels
 * drop the leading "Ask …", because on the Overview these render as tiles
 * beneath an "ASK A PARENT" sub-header that already says it:
 *
 *   key          label              phone label       destination modal
 *   ─────────────────────────────────────────────────────────────────────
 *   ride         A Ride             Ask for a Ride    KidRequestModal
 *   permission   Permission         Ask Permission    AskModal 'permission'
 *   question     A Question         Ask a Question    AskModal 'question'
 *   medication   Medication Alert   (same)            AskModal 'medication'
 *   grocery      Request Grocery    (same)            GroceryModal
 *   supplies     School Supplies    (same)            SuppliesModal
 *   quest        Suggest a Chore    (same)            QuestProposalModal
 *   chore        Propose a Chore    (same)            KidChoreProposalModal
 *
 * Only the tile captions differ; the phone's own AskParentSheet picker
 * (still used by KioskTasksTab) renders its own labels unchanged.
 *
 * ASK_PARENT_OPTIONS below is exported so a caller can render its own
 * entry points (the Overview's "Your stuff" grid renders all eight as
 * individual tiles) without re-typing the list and letting it drift from
 * what open() actually accepts.
 *
 * ── Interface: useKioskAskParent() ──────────────────────────────────────
 * A hook returning `{ open, node }`:
 *
 *   open(key)  — jump STRAIGHT to one destination. No picker in between.
 *   node       — the modals themselves; render it once, anywhere in the tree.
 *
 * This shape (rather than a `visible` prop, or a forwardRef imperative
 * handle) is what lets the two call sites differ in UI while sharing one
 * source of truth for the state and the modals:
 *
 *   • KioskOverviewTab's "Your stuff" section calls open('grocery') etc.
 *     directly from eight tiles — no intermediate screen at all.
 *   • KioskTasksTab keeps its single "Ask Parent" button, which shows the
 *     shared phone AskParentSheet picker and hands its choice to the very
 *     same open(). Passing `withPicker` to the hook is what mounts that
 *     picker and gives back openPicker().
 *
 * No imperative ref handle: nothing in features/kiosk/ uses
 * useImperativeHandle today (grepped — zero hits), and a hook returning a
 * node is both simpler and lets the caller keep the trigger wherever it
 * likes.
 *
 * ── Idle lock ───────────────────────────────────────────────────────────
 * useKioskLockSuspended below covers all seven pieces of state — the
 * optional picker plus the six destination states. These are all shared
 * phone components rendered into their own native Modal, so their touches
 * never reach KioskScreen's root onTouchStart; without this the idle lock
 * can fire mid-form and throw the draft away.
 *
 * `colors`/`isDark` come from useTheme() here rather than being threaded in
 * as props: the destination modals are SHARED PHONE components that take
 * the app palette, and useTheme() is the same single source KioskScreen
 * itself reads before threading `colors` down. Taking them as props would
 * have forced callers with no `colors` prop (KioskOverviewTab) to grow one.
 */
import { useCallback, useState, type ReactNode } from 'react';
import {
  Car, Unlock, HelpCircle, Pill, ShoppingCart, BookOpen, ClipboardList,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useTheme } from '@/lib/ThemeContext';
import { AskParentSheet } from '@/features/hub/kid/AskParentSheet';
import { KidChoreProposalModal } from '@/features/hub/kid/KidChoreProposalModal';
import { GroceryModal, SuppliesModal, AskModal, QuestProposalModal } from '@/features/hub/KidModals';
import { KidRequestModal } from '@/features/calendar/KidRequestModal';
import { useKioskLockSuspended } from '../KioskActivityContext';
import type { KioskColors } from '../kioskPalette';

export type AskParentKey =
  | 'ride' | 'permission' | 'question' | 'medication'
  | 'grocery' | 'supplies' | 'quest' | 'chore';

/**
 * The eight options. Descriptions match AskParentSheet's verbatim; three
 * labels (ride/permission/question) drop AskParentSheet's own leading "Ask"
 * — these tiles render under a kiosk-only "ASK A PARENT" section header
 * (KioskKidQuickActions.tsx), so "Ask for a Ride" etc. would read as a
 * redundant "Ask a Parent: Ask for a Ride." AskParentSheet.tsx itself is
 * untouched; this trim is kiosk-tile-only. Each option also gets a
 * kiosk-palette accent (`accent` is a function of the kiosk palette so it
 * resolves correctly in both light and dark — the phone sheet's own colors
 * are app-palette hexes and can't be reused).
 */
export const ASK_PARENT_OPTIONS: {
  key: AskParentKey; label: string; desc: string; Icon: LucideIcon;
  accent: (k: KioskColors) => string;
}[] = [
  { key: 'ride',       label: 'A Ride',           desc: 'Pickup, drop-off, or both',      Icon: Car,          accent: k => k.gold },
  { key: 'permission', label: 'Permission',       desc: 'Go somewhere, do something',     Icon: Unlock,       accent: k => k.purple },
  { key: 'question',   label: 'A Question',       desc: 'Something you want to know',     Icon: HelpCircle,   accent: k => k.blue },
  { key: 'medication', label: 'Medication Alert', desc: "I didn't take my meds",          Icon: Pill,         accent: k => k.danger },
  { key: 'grocery',    label: 'Request Grocery',  desc: 'Add items to the shopping list', Icon: ShoppingCart, accent: k => k.sage },
  { key: 'supplies',   label: 'School Supplies',  desc: 'Things I need for school',       Icon: BookOpen,     accent: k => k.blue },
  { key: 'quest',      label: 'Suggest a Chore',  desc: 'For yourself — pick the coins',  Icon: HelpCircle,   accent: k => k.primary },
  { key: 'chore',      label: 'Propose a Chore',  desc: 'For you or a sibling',           Icon: ClipboardList, accent: k => k.purple },
];

export function useKioskAskParent({
  active, members, withPicker = false,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  /**
   * Also mount the shared phone AskParentSheet picker, and return an
   * `openPicker` that shows it. Only KioskTasksTab wants this — the
   * Overview's tiles go straight to a destination.
   */
  withPicker?: boolean;
}): { open: (key: AskParentKey) => void; openPicker: () => void; node: ReactNode } {
  const { colors, isDark } = useTheme();

  const [picker, setPicker] = useState(false);
  const [groceryModal, setGroceryModal] = useState(false);
  const [suppliesModal, setSuppliesModal] = useState(false);
  const [askModal, setAskModal] = useState<null | 'permission' | 'question' | 'medication'>(null);
  const [questProposalModal, setQuestProposalModal] = useState(false);
  const [choreProposalModal, setChoreProposalModal] = useState(false);
  const [rideRequestModal, setRideRequestModal] = useState(false);

  // All seven — the optional picker plus the six destination states.
  // Unchanged in coverage from the inline version in KioskTasksTab.
  useKioskLockSuspended(
    picker || groceryModal || suppliesModal || !!askModal ||
    questProposalModal || choreProposalModal || rideRequestModal,
  );

  const open = useCallback((key: AskParentKey) => {
    if (key === 'ride') setRideRequestModal(true);
    else if (key === 'grocery') setGroceryModal(true);
    else if (key === 'supplies') setSuppliesModal(true);
    else if (key === 'quest') setQuestProposalModal(true);
    else if (key === 'chore') setChoreProposalModal(true);
    else setAskModal(key);
  }, []);

  const openPicker = useCallback(() => setPicker(true), []);

  const node = (
    <>
      {withPicker && (
        <AskParentSheet
          visible={picker} onClose={() => setPicker(false)} colors={colors} isDark={isDark}
          onPick={(choice) => {
            setPicker(false);
            // The 300ms gap is unchanged from the inline version: two
            // native Modals cross-fading in the same frame drops the second
            // one on iOS, so the picker is fully dismissed before the
            // destination is mounted. Only the picker path needs it — a
            // tile tap has no modal to dismiss first.
            setTimeout(() => open(choice), 300);
          }}
        />
      )}
      <GroceryModal visible={groceryModal} onClose={() => setGroceryModal(false)} active={active} />
      <SuppliesModal visible={suppliesModal} onClose={() => setSuppliesModal(false)} active={active} />
      {askModal && <AskModal visible={!!askModal} onClose={() => setAskModal(null)} type={askModal} active={active} />}
      <QuestProposalModal visible={questProposalModal} onClose={() => setQuestProposalModal(false)} active={active} />
      <KidChoreProposalModal
        visible={choreProposalModal} onClose={() => setChoreProposalModal(false)}
        active={active} members={members} familyId={active.familyId ?? ''}
      />
      <KidRequestModal visible={rideRequestModal} onClose={() => setRideRequestModal(false)} activeMemberId={active.id} />
    </>
  );

  return { open, openPicker, node };
}
