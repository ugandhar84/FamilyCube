/**
 * kidQuestLanes — the ONE definition of "which chores may this kiosk
 * viewer see" and "which of those are up-for-grabs pool chores."
 *
 * This logic was written inside KioskTasksTab.tsx (its `visibleQuests` /
 * `poolQuests` / `poolIds` memos, and its COLUMN_STATUSES lanes). The kid
 * Overview now needs the exact same answers for its "My Chores" widget,
 * and a second copy is precisely how the two surfaces would drift into
 * disagreeing about what counts as an open pool chore — the failure mode
 * KioskTasksTab's own comments record fixing more than once. So the rules
 * live here and both callers import them; no behavior changed in the move.
 *
 * See KioskTasksTab.tsx's own long comment above `visibleQuests` for WHY
 * each exclusion exists (it mirrors QuestsScreen.tsx:596's Bounty filter
 * and the phone's per-viewer visibility rules) — that reasoning is not
 * repeated here, only the rules themselves.
 */
import type { LucideIcon } from 'lucide-react-native';
import { Clock, CheckCircle2, Zap, Coins, ClipboardList, RotateCcw, Ban } from 'lucide-react-native';
import type { Quest } from '@/store/questStore';
import type { FamilyMember } from '@/store/familyStore';
import { isAssignedTo, isDoneCard, isDeclinedCard } from '@/features/tasks/lib/deriveCardActions';
import { fmtDateTime, parseLocalDate } from '@/lib/dates';
import type { KioskColors } from './kioskPalette';

/**
 * The kanban's status vocabulary. Exported so any surface summarising
 * chore state uses the board's OWN labels rather than inventing a parallel
 * set a kid would then have to reconcile.
 */
export const COLUMN_STATUSES: { key: string; label: string; statuses: string[] }[] = [
  { key: 'todo',     label: 'To Do',       statuses: ['todo'] },
  { key: 'progress', label: 'In Progress', statuses: ['claimed', 'in_progress'] },
  { key: 'redo',     label: 'Needs Redo',  statuses: ['declined'] },
  { key: 'review',   label: 'In Review',   statuses: ['pending_approval'] },
];

/** Chores this viewer is allowed to see at all on a shared kiosk. */
export function visibleQuestsFor(
  quests: Quest[],
  members: FamilyMember[],
  viewer: { id: string; role: string },
): Quest[] {
  const adultMemberIds = new Set(
    members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id),
  );
  const isKidOrTeen = viewer.role === 'kid' || viewer.role === 'teen';
  if (!isKidOrTeen) return quests;
  return quests.filter(q => {
    if (q.isAdultTask) return false;
    if ((q as any).awaitingParentApproval) return false;
    if (q.assignedToId && adultMemberIds.has(q.assignedToId)) return false;
    if (q.isPool) return !q.inviteGrandparents;
    return isAssignedTo(q, viewer.id);
  });
}

/** Up-for-grabs bounties inside an already-visibility-filtered list. */
export function poolQuestsIn(visible: Quest[]): Quest[] {
  return visible.filter(q =>
    q.isPool && q.status === 'todo' && !q.isAdultTask &&
    !q.assignedToId && !q.inviteGrandparents,
  );
}

/**
 * The phone card's claimed → submitted → approved timeline line
 * (QuestCard.tsx:293-307 renders this same three-stamp trail in its header;
 * KidQuestCard.tsx:147-155 the same for the kid fork), same fields, same
 * `fmtDateTime` formatter, same arrow separators — so no two surfaces
 * render a chore's history in a different shape.
 *
 * Lived in KioskKidWidgets.tsx as a private helper until the kiosk Tasks
 * board needed the identical line inside its own CollapsibleQuestCard body;
 * moved here (the file both already import their shared chore logic from)
 * rather than copied, for exactly the reason this module's header gives.
 * Returns '' when the chore has no timestamps yet (an unclaimed To Do), and
 * the caller renders nothing.
 */
export function questTimeline(q: Quest): string {
  const parts: string[] = [];
  if (q.claimedAt) parts.push(`Claimed ${fmtDateTime(q.claimedAt)}`);
  if (q.submittedAt) parts.push(`Submitted ${fmtDateTime(q.submittedAt)}`);
  if (q.approvedAt) parts.push(`Approved ${fmtDateTime(q.approvedAt)}`);
  return parts.join(' → ');
}

/**
 * Per-chore status meta — icon, uppercase pill label, kiosk accent.
 *
 * This is features/hub/kid/KidQuestCard.tsx's `questStatusMeta` (its lines
 * 23-38) translated to kiosk tokens. The MAPPING is the phone's, not a
 * kiosk invention:
 *
 *   phone BRAND.teal   (in_progress / claimed)  → k.sage
 *   phone BRAND.amber  (pending_approval)       → k.gold
 *   phone BRAND.amber  (declined / needs redo)  → k.gold
 *   phone BRAND.purple (todo)                   → k.purple
 *   phone MONEY_GREEN  (pool bounty, approved)  → k.sage
 *   phone colors.danger(cancelled)              → k.danger
 *
 * Note the phone deliberately does NOT use red for "declined": its own
 * comment records that cancelled (nothing to do) and declined (a redo IS
 * required) read as the same red pill with only a tiny label telling them
 * apart, so declined was moved to amber's "still active, needs attention"
 * tone.
 *
 * Lived privately inside components/KioskKidWidgets.tsx (the Hub "My
 * Chores" widget) until the Chores board needed the identical pill in its
 * own card header. Moved here rather than copied, for exactly the reason
 * this module's header gives — a second copy is how the two surfaces end
 * up disagreeing about what a given status looks like. The 'cancelled'
 * branch was absent from the widget's copy (its buckets never contain a
 * cancelled chore) and is restored here from the phone original, since the
 * board's own lanes CAN surface one.
 */
export function kioskQuestMeta(q: Quest, k: KioskColors): { Icon: LucideIcon; label: string; accent: string } {
  if (q.isPool && q.status === 'todo') return { Icon: Coins, label: 'BOUNTY', accent: k.sage };
  if (q.status === 'pending_approval') return { Icon: Clock, label: 'IN REVIEW', accent: k.gold };
  if (q.status === 'approved' || q.status === 'done') return { Icon: CheckCircle2, label: 'APPROVED', accent: k.sage };
  if (q.status === 'cancelled') return { Icon: Ban, label: 'CANCELLED', accent: k.danger };
  if (q.status === 'declined') return { Icon: RotateCcw, label: 'NEEDS ANOTHER TRY', accent: k.gold };
  if (q.status === 'in_progress') return { Icon: Zap, label: 'IN PROGRESS', accent: k.sage };
  if (q.status === 'claimed') return { Icon: Zap, label: 'CLAIMED', accent: k.sage };
  return { Icon: ClipboardList, label: 'TO DO', accent: k.purple };
}

/**
 * Is this chore past its due date and still owed?
 *
 * KidQuestCard.tsx:97-100 verbatim (which is itself QuestCard.tsx's own
 * isOverdue, deliberately kept identical there so the Hub card and the
 * Chores-tab card can't flag the same chore differently): a DATE-ONLY
 * compare against the start of today — not `Date.now()`, so a chore due
 * today is never overdue at 4pm — excluded once the chore is done or has
 * been sent back for a redo (a declined chore's own banner is the message
 * that matters, not a stale due date).
 *
 * Shared from here rather than written inline in one tab so the Hub widget
 * can adopt the identical rule without re-deriving it.
 */
export function isQuestOverdue(q: Quest): boolean {
  if (!q.dueDate) return false;
  if (isDoneCard(q) || isDeclinedCard(q)) return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return parseLocalDate(q.dueDate).getTime() < todayStart.getTime();
}

/**
 * A multi-slot bounty shares ONE due date across every claimant, so naming
 * that date on an individual's card misrepresents it as personal — the
 * phone shows a generic "Chore overdue" instead (KidQuestCard.tsx:103, and
 * QuestCard.tsx's identical isMultiSlot note).
 */
export function isMultiSlotQuest(q: Quest): boolean {
  return (q.maxClaimants ?? 1) > 1;
}

/**
 * The other kids a team/multi-slot bounty was offered to alongside this
 * one. Each earns the FULL coins independently — nobody's payout depends on
 * the others finishing — which is what the card's banner has to say.
 * KidQuestCard.tsx:90 verbatim.
 */
export function teamMatesOf(q: Quest, allQuests: Quest[]): Quest[] {
  if (!q.teamGroupId) return [];
  return allQuests.filter(t => t.teamGroupId === q.teamGroupId && t.id !== q.id);
}

// ── Filter semantics, ported from the phone's QuestFilters/QuestsScreen ──
//
// The kiosk Tasks board had per-viewer VISIBILITY (visibleQuestsFor above)
// but no user-driven FILTER at all — the phone has both, and they are
// different things: visibility is a hard security/role rule the viewer
// cannot change, a filter is a lens the viewer chooses on top of what
// they're already allowed to see. These live here so the two layers are
// applied in the right order at one place and can't be transposed.
//
// `KioskKidFilter` mirrors QuestFilters.tsx's own `kidFilter` string
// vocabulary exactly ('all' | 'pool' | 'adults' | 'cheer' | a member id),
// and `KioskTabStatus` is QuestFilters.tsx:11's exported TabStatus type.
// Note the phone's own STATUS_TABS (QuestFilters.tsx:48-52) deliberately
// renders only All / To Do / In Review — 'completed' is in the type and in
// QuestsScreen's filter switch (line 618) but has no tab, because approved
// chores stay inline in "All" rather than being segregated. Kiosk matches
// that: the constant below is the RENDERED set.

export type KioskTabStatus = 'all' | 'todo' | 'review' | 'completed';

export const KIOSK_STATUS_TABS: { key: KioskTabStatus; label: string }[] = [
  { key: 'all',    label: 'All' },
  { key: 'todo',   label: 'To Do' },
  { key: 'review', label: 'In Review' },
];

/**
 * Which member/scope pills a viewer of this role may see. Mirrors
 * QuestFilters.tsx's own prop-driven conditional rendering one-for-one:
 *
 *  · 'all'    — always (labelled "My Chores" for a kid, "All Family" else)
 *  · per-kid  — `!isKid` (QuestFilters.tsx:75). Kiosk widens this to
 *               !isKidOrTeen, because a teen has kid visibility here
 *               (visibleQuestsFor) and so has no sibling chores to filter
 *               to — the phone reaches the same end state via its own
 *               kid-visibility filter emptying those pills out.
 *  · 'adults' — isParentOrSenior && !isSenior (QuestFilters.tsx:92)
 *  · 'pool'   — always (QuestFilters.tsx:105)
 *  · 'cheer'  — !isParentOrSenior (QuestFilters.tsx:119), i.e. kid/teen only
 */
export function kioskFilterAvailability(role: string) {
  const isKid = role === 'kid';
  const isTeen = role === 'teen';
  const isSenior = role === 'senior';
  const isParent = role === 'parent';
  const isParentOrSenior = isParent || isSenior;
  return {
    isKid,
    isKidOrTeen: isKid || isTeen,
    showPerMember: !(isKid || isTeen),
    showAdults: isParentOrSenior && !isSenior,
    showPool: true,
    showCheer: !isParentOrSenior,
  };
}

/**
 * Apply the chosen member/scope lens to an already-visibility-filtered
 * list. Mirrors QuestsScreen.tsx:584-613's own `kidFilter` switch — the
 * SAME predicates, in the same order — with one deliberate omission: the
 * phone's `kidFilter === 'all'` branches do extra pool/assignment
 * narrowing that kiosk's board already performs structurally (its pool
 * lane is poolQuestsIn, its status lanes exclude those ids), so 'all' here
 * is a genuine pass-through and the board keeps its existing shape.
 */
export function applyKidFilter(visible: Quest[], kidFilter: string): Quest[] {
  if (kidFilter === 'all' || kidFilter === 'cheer') return visible;
  if (kidFilter === 'adults') return visible.filter(q => q.isAdultTask);
  if (kidFilter === 'pool') return poolQuestsIn(visible);
  // A specific member id — QuestsScreen.tsx:609 keeps unassigned pool
  // chores alongside that member's own chores (the shared backlog is still
  // relevant when you're looking at one person's plate), and excludes
  // adult tasks from a per-kid lens.
  return visible.filter(q =>
    (!q.isAdultTask && q.isPool && !q.assignedToId) ||
    (isAssignedTo(q, kidFilter) && !q.isAdultTask),
  );
}

/**
 * Apply the status segment. QuestsScreen.tsx:615-619 verbatim, including
 * the fact that 'todo' means todo-OR-claimed (not just 'todo') and that
 * 'cheer' bypasses the status filter entirely.
 */
export function applyTabStatus(list: Quest[], kidFilter: string, tabStatus: KioskTabStatus): Quest[] {
  if (kidFilter === 'cheer' || tabStatus === 'all') return list;
  if (tabStatus === 'todo') return list.filter(q => q.status === 'todo' || q.status === 'claimed');
  if (tabStatus === 'review') return list.filter(q => q.status === 'pending_approval');
  return list.filter(q => q.status === 'approved' || q.status === 'done');
}
