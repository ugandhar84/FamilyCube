/**
 * KioskTasksTab — role-gated per the quest-flows spec (docs/quest-flows-
 * spec.md §3/§4/§5): a Parent gets the full create/edit/delete kanban
 * (3 columns: To Do / In Progress / In Review). A Senior/GP does NOT — per
 * spec they cheer/high-five kids' finished chores and can only claim/submit
 * their own grandparent_quest items, with no create/edit/delete of anyone
 * else's quest. See KioskGpTasksView below for that branch, mirroring
 * SeniorView.tsx's own kidsCheerable/mySponsoredQuests filters and
 * choreStore's cheerChore action exactly (not reinvented).
 *
 * ── Hub-OS migration ────────────────────────────────────────────────────
 * The board's own chrome — masthead, zone headers, pool tiles, roster
 * chips, lane heads, empty state — is restyled onto the kiosk palette and
 * the KioskOS primitives (TabTitle / WidgetCard / WidgetHeader / Well /
 * Chip / ActionButton). None of the role or status logic moved: the
 * deriveQuestActions per-viewer gating, the pool lane's own filter and the
 * poolIds de-duplication against the status lanes, the senior branch, and
 * every useKioskLockSuspended declaration are all unchanged.
 *
 * `colors` is still a prop and still threaded down, because this tab hosts
 * a handful of SHARED PHONE components (SmartTaskComposer, AddQuestModal,
 * AddEventModal, assigneeStyle) that take the app palette and cannot be
 * restyled without forking them. Both palettes resolve off the same
 * useTheme() isDark, so a kiosk frame around app-palette content is
 * consistent within a mode.
 *
 * The one exception this used to also carry — CollapsibleQuestCard's own
 * phone-scale shell (BlurView/LinearGradient glass effect, borderRadius 28,
 * a custom shadow) sitting inside kiosk's otherwise-flat Well/WidgetCard
 * containers — was the single real visual mismatch a direct comparison
 * against KioskOverviewTab.tsx turned up (everything else — chip shapes,
 * spacing, hierarchy, token usage — was already consistent). Replaced with
 * KioskExpandableCard (KioskOS.tsx), a kiosk-native shell reproducing the
 * same real interaction contract this file actually uses (tap toggles
 * expand/collapse, double-tap-within-320ms edits instead) on WidgetCard's
 * own flat radius/border/kioskElevation. renderQuestCard's own header/
 * children content — every status pill, badge, and action row inside the
 * shell — was already kiosk-native and needed no change.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import {
  Plus, PartyPopper, Check, Clock3, Sparkles, History, Target, TriangleAlert,
  CheckCircle2, Camera, RotateCcw, Zap, Trophy, ShieldQuestion,
} from 'lucide-react-native';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { deriveQuestActions, isAssignedTo } from '@/features/tasks/lib/deriveCardActions';
import {
  COLUMN_STATUSES, visibleQuestsFor, poolQuestsIn, questTimeline,
  KIOSK_STATUS_TABS, kioskFilterAvailability, applyKidFilter, applyTabStatus,
  kioskQuestMeta, isQuestOverdue, isMultiSlotQuest, teamMatesOf,
  type KioskTabStatus,
} from '../kidQuestLanes';
import { assigneeStyle } from '@/features/calendar/components/EventCard';
import { CATEGORY_META } from '@/features/quests/components/questFormShared';
import { fmtDateShort } from '@/lib/dates';
import { showToast } from '@/components/AppToast';
import { KioskQuestEditor } from '../components/KioskQuestEditor';
import { WidgetCard, WidgetHeader, Well, Chip, TabTitle, ActionButton, EmptyNote, KioskExpandableCard } from '../components/KioskOS';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import { useKioskAskParent } from '../components/KioskAskParentFlow';
import { KioskKidCheerList } from '../components/KioskKidQuickActions';
import { KioskCantDoThisDialog } from '../components/KioskCantDoThisDialog';
import { KioskChoreHistorySheet } from '../components/KioskChoreHistorySheet';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS, kioskElevation } from '../kioskTheme';
import { useKioskColors, kioskOnAccent, type KioskColors } from '../kioskPalette';

// Live-reported: a chore a parent sent back for redo (choreAdapter maps
// the DB's 'redo_requested' status down to Quest status 'declined',
// isDeclinedCard's own target state) had no column to appear in at all —
// it silently vanished from the board the moment a parent tapped Redo,
// with no visibility into "sent back, waiting on the kid" until they
// resubmitted. Added as its own 4th column rather than folding it into
// "To Do", since a redo request carries a rejection reason the kid needs
// to see and act on differently than a fresh unclaimed chore.
//
// COLUMN_STATUSES, and the visibility/pool filters this view derives from
// it, now live in ../kidQuestLanes so the kid Overview's "My Chores"
// widget answers those questions from the same source rather than a
// second copy that could drift. Nothing about the rules changed.

export function KioskTasksTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  // Live-reported: an approved chore (e.g. a "Suggest a Chore" proposal a
  // parent just approved into a real pool chore) didn't show up on kiosk
  // until the tablet was manually reopened — but showed immediately on
  // phone. Root cause: every phone screen that renders chores
  // (TasksScreen, QuestsScreen, HubScreen, ChildChoreBoard) calls
  // syncFromDB()/loadFromStorage() on its own mount; this tab never did,
  // so it relied entirely on choreStore's realtime channel already being
  // alive. That channel is only force-recovered by app/_layout.tsx's
  // AppState foreground listener (useChoreStore.getState().syncFromDB(true)
  // on every foreground) — a wall-mounted kiosk that's always foregrounded
  // never re-triggers that recovery path, so a socket that silently died
  // (a known, documented failure mode — see that listener's own comment)
  // stayed dead indefinitely with nothing to notice or fix it. Lives here,
  // above the role branch, so it runs once regardless of which of the two
  // views below actually renders — not duplicated in each. A plain
  // interval, not just a mount-time sync, because this tab can sit open on
  // a countertop for hours without ever remounting — the same duration a
  // phone user would cover by backgrounding/foregrounding or navigating
  // away and back, neither of which happens here.
  useEffect(() => {
    const sync = () => { useChoreStore.getState().syncFromDB(true).catch(() => {}); };
    sync();
    const id = setInterval(sync, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  if (active.role === 'senior') {
    return <KioskGpTasksView active={active} members={members} colors={colors} isDark={isDark} />;
  }
  return <KioskBoardView active={active} members={members} colors={colors} isDark={isDark} />;
}

/**
 * One filter pill. Shape borrows KioskScheduleTab's own `filterChip` (the
 * member-filter row established earlier on this branch) rather than
 * KioskFormDrawer's KioskPill: this is a persistent horizontal filter bar
 * in exactly the same role on a sibling tab, and the two reading the same
 * is worth more here than matching a form control's shape.
 *
 * Accessibility is the reason this is a component and not inline markup —
 * every pill needs role/label/hint/selected state, and four call sites
 * writing that by hand is how one of them ends up without it.
 */
function FilterPill({
  label, emoji, selected, accent, onPress, k, isDark, a11yLabel, hint,
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  accent: string;
  onPress: () => void;
  k: KioskColors;
  isDark: boolean;
  a11yLabel: string;
  hint: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        s.filterChip,
        selected
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: k.well, borderColor: k.cardBorder },
        pressed && { opacity: 0.75 },
      ]}
    >
      {!!emoji && <Text style={{ fontSize: 18 }}>{emoji}</Text>}
      <Text
        style={[s.filterChipText, { color: selected ? kioskOnAccent(k, accent) : k.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Shared board for parent/kid/teen — one kanban, but every card's
// available action (claim / submit / approve / edit / delete / nothing)
// is now derived per-viewer via deriveQuestActions (the exact same
// canClaim/canSubmit/canApprove/canEdit/canDelete rules QuestCard.tsx uses
// on the phone). Previously this whole view assumed a parent regardless of
// who was actually standing at the kiosk — a kid switching to their own
// profile got the PARENT's create/edit/delete authority over every chore
// including other kids', with no claim/submit action anywhere (live-
// reported: "we need similar chore/event creation and claim like mobile
// app... claim, submit, review all exact same mobile app functions").
function KioskBoardView({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const { quests, claimQuest, submitQuest, approveQuest } = useQuestStore();
  const isActiveApprover = useTemporaryApproverStore(s => s.isActiveApprover(active.id));
  const isParent = active.role === 'parent';
  const isKidCreator = active.role === 'kid';
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);

  // ── Card-level chore actions the board previously had no path to ──────
  // The phone kid card reaches three choreStore actions directly that this
  // board's `primaryAction` (claim/submit/approve via choreAdapter) never
  // covered — a pending terms change has to be accepted or rejected, and a
  // redo request can be disputed instead of resubmitted. Selected
  // individually rather than destructured off the whole store for the
  // reason KidQuestCard.tsx:51-57 records at length: Zustand actions are
  // stable references, so this subscribes to nothing and can't re-render
  // the board on unrelated chore updates.
  const acceptTermsChange = useChoreStore(s => s.acceptTermsChange);
  const rejectTermsChange = useChoreStore(s => s.rejectTermsChange);
  const disputeRedo = useChoreStore(s => s.disputeRedo);

  // Per-card History sheet target, and the "Can't do this" reason dialog's.
  // Both held as {id,title} rather than the Quest itself so a store update
  // mid-flow can't leave a stale object pinned open — same convention
  // KioskKidWidgets' own declineTarget uses.
  const [historyTarget, setHistoryTarget] = useState<{ id: string; title: string } | null>(null);
  const [declineTarget, setDeclineTarget] = useState<{ id: string; title: string } | null>(null);

  // Creation flow — ported verbatim from TasksScreen.tsx's own wiring
  // (features/tasks/TasksScreen.tsx lines ~213-234, ~474-540): a parent
  // gets the real free-text SmartTaskComposer (classifies Event vs Quest
  // live, auto-fills, "Adjust in full form" hands off to the real
  // AddEventModal/AddQuestModal pre-filled); a kid gets the same
  // Kid-safe AskParentSheet the phone's Tasks tab and Hub FAB use instead
  // — no free-text guessing, no direct assignment. Mobile's real gate for
  // this button is actually role === 'parent' only (the shared FAB in
  // app/(tabs)/_layout.tsx that opens SmartTaskComposer on the Tasks tab
  // is parent-role-gated — teen/senior currently have no creation entry
  // point there at all on mobile itself, see this port's own notes) —
  // kiosk's pre-existing `isParent &&` gate on the "New Chore" button
  // already matched that exactly, so it's left as-is here.
  const [showComposer, setShowComposer] = useState(false);
  const [manualQuestPrefill, setManualQuestPrefill] = useState<{
    title?: string; coins?: number; assignedToId?: string; photoRequired?: boolean; dueDate?: string;
  } | undefined>(undefined);
  const [manualEventPrefill, setManualEventPrefill] = useState<{
    title?: string; category?: string; memberId?: string; startAt?: string; notes?: string;
    recurFreq?: 'daily' | 'weekly' | 'monthly'; recurDays?: number[];
    pickupLocation?: string; dropLocation?: string; returnTime?: string; helperId?: string;
  } | undefined>(undefined);
  const [showManualQuest, setShowManualQuest] = useState(false);
  const [showManualEvent, setShowManualEvent] = useState(false);

  // The kid branch's entire flow — the AskParentSheet picker plus all six
  // destination modals, and the six pieces of state behind them — now lives
  // in useKioskAskParent, because the Overview's "Your stuff" section needed
  // the SAME eight destinations and a second inline copy would have drifted.
  // `withPicker` keeps THIS tab's behaviour exactly as it was: one button,
  // the shared phone picker, then a destination. (The Overview skips the
  // picker and tiles the eight destinations directly — same hook, same
  // state, same modals, different entry UI.)
  const { openPicker, node: askParentNode } = useKioskAskParent({
    active, members, withPicker: true,
  });
  const openCreator = () => { if (isKidCreator) openPicker(); else setShowComposer(true); };

  // Hold the kiosk idle lock while ANY of these creation sheets is open.
  // They're all shared phone components rendered into their own native
  // Modal, so their touches never reach KioskScreen's root onTouchStart —
  // without this, composing a chore counts as inactivity and the lock can
  // fire mid-form, throwing the draft away. See KioskActivityContext.
  // The Ask-Parent side of that suspension moved with the flow:
  // KioskAskParentFlow makes its own useKioskLockSuspended call covering
  // showAskParentSheet (passed to it as `visible`) plus its own six.
  // historyTarget/declineTarget are NOT listed here: both render through
  // KioskFormDrawer, which wraps KioskModalHost and already suspends the
  // lock for its own lifetime — the same reason KioskAskParentFlow's six
  // sheets aren't listed either. Only the shared PHONE modals above, which
  // render into their own native Modal and never reach KioskScreen's root
  // onTouchStart, need declaring by hand.
  useKioskLockSuspended(
    showComposer || showManualQuest || showManualEvent || editingQuest !== null,
  );

  // Live-reported: a single card sat at a fixed narrow width inside a
  // whole column's worth of empty space ("cute buttons and use the space
  // properly"). Each column now lays its cards out as a wrapping grid —
  // 1 card per row on a narrower kiosk, 2 once a column is wide enough to
  // comfortably fit two ~260px+ cards side by side, so the column's real
  // width is what's actually used rather than one lonely card floating in
  // a void.
  // ── Column grid math, and why there is now so little of it ────────────
  // Live-reported: the four status columns rendered ragged rather than as
  // an even grid on a real tablet. Three compounding causes:
  //
  //  1. RAIL_AND_PADDING hardcoded `84` as the nav-rail width — a copy of
  //     KioskScreen's own value that went stale the moment that rail was
  //     widened for kiosk touch targets, so every column was computed
  //     ~24px wider than the space available and the row overflowed.
  //  2. COLUMN_GAP was a hardcoded 16 while s.columns' real `gap` was 18 —
  //     the math reserved 48px of gutter where flexbox consumed 54px, and
  //     the 6px shortfall came out of the columns unevenly. That mismatch
  //     IS the ragged-header effect.
  //  3. Each column was then given that exact fractional width with
  //     flexShrink: 0, so sub-pixel widths rounded to different physical
  //     pixels per column and nothing could absorb the overflow.
  //
  // Rather than fix the arithmetic three ways, the arithmetic is gone:
  // s.col is flex:1 + flexBasis:0 + minWidth:0, so flexbox divides the row
  // evenly and exactly by construction. There is no width to compute, no
  // gap constant to keep in sync with the stylesheet, and no float to
  // round — which is the only version of this that cannot silently drift
  // again the next time a rail or a spacing token changes.

  // ── Per-viewer visibility [GAP, not a simplification] ─────────────────
  // This board previously did `quests.filter(q => col.statuses.includes(
  // q.status))` and nothing else — NO per-viewer scoping whatsoever. The
  // phone's QuestsScreen.tsx (lines ~548-563) applies three hard
  // exclusions for a kid/teen viewer that kiosk simply did not have:
  //
  //   · q.isAdultTask                — adult chores were never kid-visible
  //   · q.awaitingParentApproval     — a grandparent_quest still awaiting a
  //                                    parent's SAFETY REVIEW must not be
  //                                    visible or claimable until approved
  //                                    (see choreAdapter's own note)
  //   · another kid's assigned chore — "Never: ... other kids' quests"
  //
  // plus, for pool/bounty chores specifically (QuestsScreen.tsx:596), the
  // `!q.inviteGrandparents` exclusion, because an inviteGrandparents chore
  // is GP-pool-only even while isPool/todo (e.g. after
  // backoutGpWelcomeChore puts it back).
  //
  // On a personal phone the blast radius of missing these is one child's
  // own screen. On a wall-mounted kiosk it's every person who walks past
  // the counter while a kid profile is active — including a GP-only chore
  // rendered with an "Open to all" chip inviting any kid to claim it, and
  // a safety-review-pending chore offered up before a parent has vetted
  // it. Same rules as the phone, applied at the source list so every lane
  // below inherits them.
  const visibleQuests = useMemo(
    () => visibleQuestsFor(quests, members, { id: active.id, role: active.role }),
    [quests, members, active.role, active.id],
  );

  // ── Viewer-chosen filters [GAP] ───────────────────────────────────────
  // Live-reported: "match with mobile app like cards with expand collapse
  // and its status and history etc.. also filters." The board had per-
  // viewer VISIBILITY (above) but no filter the person standing at it could
  // actually choose — the phone's Chores tab leads with a whole
  // QuestFilters row (QuestsScreen.tsx:943) and kiosk had nothing.
  //
  // Two independent facets, exactly as on the phone:
  //   · kidFilter  — WHOSE chores ('all' | a member id | 'adults' | 'pool'
  //                  | 'cheer'), QuestFilters.tsx's own string vocabulary
  //   · tabStatus  — WHICH STAGE ('all' | 'todo' | 'review' | 'completed'),
  //                  QuestFilters.tsx:11's exported TabStatus
  //
  // Both are applied by kidQuestLanes' applyKidFilter/applyTabStatus, which
  // are QuestsScreen.tsx:584-619's predicates moved, not re-derived — so a
  // rule fixed on one surface can't quietly stay broken on the other. They
  // run STRICTLY AFTER visibleQuestsFor: a filter can only ever narrow what
  // the role rules already permitted, never widen it, which is what keeps a
  // kid from selecting their way into an adult task or a GP-only pool chore.
  //
  // Which pills exist at all is kioskFilterAvailability(role) — a direct
  // port of QuestFilters.tsx's own prop-driven conditionals (Adults is
  // parent-only, Cheer is kid/teen-only, per-member pills are for adults),
  // rather than kiosk inventing role gating that could diverge from the
  // already-audited phone rules.
  const avail = useMemo(() => kioskFilterAvailability(active.role), [active.role]);
  const [kidFilter, setKidFilter] = useState('all');
  const [tabStatus, setTabStatus] = useState<KioskTabStatus>('all');

  // Reset the lens when the person at the kiosk changes — QuestsScreen does
  // the same on persona switch (its prevMemberIdRef effect, line 333). On a
  // shared counter tablet this matters MORE than on a phone: without it the
  // next person walks up to a board silently narrowed to someone else's
  // name, or to a pill their own role isn't even allowed to see.
  useEffect(() => { setKidFilter('all'); setTabStatus('all'); }, [active.id, active.role]);

  const filteredQuests = useMemo(
    () => applyTabStatus(applyKidFilter(visibleQuests, kidFilter), kidFilter, tabStatus),
    [visibleQuests, kidFilter, tabStatus],
  );
  const isFiltered = kidFilter !== 'all' || tabStatus !== 'all';

  // Masthead counts, computed off the unfiltered visible set — see the
  // TabTitle subtitle's own note for why these must not track the filter.
  const totals = useMemo(() => {
    const pool = poolQuestsIn(visibleQuests).length;
    const review = visibleQuests.filter(q => q.status === 'pending_approval').length;
    const mine = visibleQuests.filter(q =>
      ['todo', 'claimed', 'in_progress'].includes(q.status) && !q.isPool,
    ).length;
    return { pool, review, mine };
  }, [visibleQuests]);

  // ── Pool / "Up for grabs" lane [GAP] ──────────────────────────────────
  // Pool chores previously had no lane of their own — they fell into
  // whichever status column matched (always "To Do") and were
  // distinguishable only by a small "Open to all" chip. The phone gives
  // them a dedicated Bounty tab precisely because "unclaimed, anyone can
  // take this" is a different KIND of thing from "assigned to someone and
  // in progress." A kiosk is the single best place in the product for that
  // distinction — it's the shared surface kids actually walk past — so
  // pool chores get the most prominent zone on the board rather than the
  // least. Eligibility matches QuestsScreen.tsx:596's Bounty filter
  // exactly, including the !assignedToId check that makes a sibling's
  // just-claimed bounty disappear immediately rather than lingering.
  // Reads the FILTERED list, not the raw visible one, so the hero pool zone
  // narrows with everything else — e.g. picking one kid's pill leaves the
  // unassigned backlog visible (applyKidFilter keeps it, matching
  // QuestsScreen.tsx:609) while "In Review" empties the pool zone entirely,
  // since an unclaimed bounty is by definition not in review.
  const poolQuests = useMemo(() => poolQuestsIn(filteredQuests), [filteredQuests]);

  // Status lanes exclude anything already surfaced in the pool lane, so a
  // bounty isn't rendered twice on the same board.
  const poolIds = useMemo(() => new Set(poolQuests.map(q => q.id)), [poolQuests]);
  const byColumn = useMemo(
    () => COLUMN_STATUSES.map(col => ({
      ...col,
      items: filteredQuests.filter(q => col.statuses.includes(q.status) && !poolIds.has(q.id)),
    })),
    [filteredQuests, poolIds],
  );

  // Measured width of the status-lane row (see its onLayout below for why
  // this is measured rather than read off Dimensions). 0 until first layout,
  // which falls through to the single-row default — the same thing the grid
  // did before this existed, so the first frame is unchanged.
  const [boardWidth, setBoardWidth] = useState(0);
  const laneBasis = useMemo(() => {
    const shown = byColumn.filter(c => c.items.length > 0).length;
    if (shown <= 1 || boardWidth <= 0) return null;
    // A lane holds one card per row (s.cardGrid), and a kiosk chore card
    // stops being readable below roughly this width — the same order of
    // magnitude the pool tiles (s.poolCard, 320) already work from.
    const MIN_LANE = 260;
    const gap = KIOSK_SPACE.md;
    const fit = Math.max(1, Math.floor((boardWidth + gap) / (MIN_LANE + gap)));
    if (fit >= shown) return null; // everything fits on one row — plain flex:1
    // Otherwise wrap into `fit` per row. The basis subtracts the real
    // gutters this row will consume BEFORE dividing — the exact arithmetic
    // whose absence (a hardcoded gap that didn't match the stylesheet's)
    // produced the ragged grid documented above. `gap` here reads the same
    // KIOSK_SPACE.md token s.columns uses, so the two cannot disagree the
    // way a copied constant did. flexGrow:1 lets a final, short row still
    // fill the width rather than leaving a hole beside it.
    const basis = Math.floor((boardWidth - gap * (fit - 1)) / fit);
    return { flexBasis: basis, maxWidth: basis, flexGrow: 1 };
  }, [byColumn, boardWidth]);

  // Per-kid summary strip — open count + coins earned today, tinted with
  // that kid's own color (same system Calendar/Agenda already use). The
  // status columns below stay the real workflow view (what's stuck where);
  // this strip is the "how's everyone doing" glance a status board alone
  // can't answer. Parent/senior-facing only — a kid viewing their own
  // family's board doesn't need a leaderboard-shaped comparison of siblings
  // front and center the way a parent glancing at the fridge does.
  const kids = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const kidStats = useMemo(() => kids.map(k => {
    const mine = quests.filter(q => q.assignedToId === k.id);
    const open = mine.filter(q => q.status !== 'done' && q.status !== 'approved').length;
    const total = mine.length;
    return { member: k, open, total };
  }), [kids, quests]);

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];
  const memberOf = (id?: string) => members.find(m => m.id === id);

  // Was a small caption line under the title ("Tap to claim") relying on
  // the WHOLE card being one mystery-meat Pressable — live-reported as
  // "no buttons at all on the card," and correctly so: the real phone
  // QuestCard.tsx renders an actual filled button (s.actionBtn, "Claim
  // Chore") as its own distinct element for each of Claim/Submit/Approve.
  // A kiosk is used from arm's length on a shared surface, which makes a
  // real, obvious button MORE necessary than on a phone held inches away,
  // not less. Returns a {label, accent, action} triple for a real button;
  // edit stays the card's own tap (parent-only, see below) rather than a
  // button, matching how mobile treats "tap the card to open/edit" vs.
  // "tap this specific button to change status."
  // ── Card labels/icons now mirror the phone kid card [GAP] ─────────────
  // The phone card (KidQuestCard.tsx:230-307) does NOT render one generic
  // verb per state — each branch has its own copy and its own icon, and the
  // labels are part of what the owner is comparing against:
  //
  //   pool/bounty        → "Claim (+N 🪙)"      Trophy   (phone: BRAND.purple)
  //   claimed            → "Start Chore"        Zap      (phone: BRAND.teal)
  //   todo/in_progress   → "Mark Done → Get Paid" / "Take Photo to Get Paid"
  //   declined           → "Revise & Resubmit"  RotateCcw
  //
  // The CLAIMED branch is a real intermediate state on the phone, not a
  // cosmetic label: a kid who just claimed a bounty sees "Start Chore"
  // before they ever see a submit button. Traced through its caller
  // (features/hub/KidView.tsx:481) that `onStart` resolves to
  // `submitQuest(id, undefined, active.id)` — the SAME choreAdapter action
  // as submit, because choreAdapter maps a claimed chore's advance and a
  // submission onto one status transition. So this is one action wearing
  // two labels by state, which is exactly what's replicated here rather
  // than inventing a kiosk-only "start" store call that doesn't exist.
  //
  // Photo-required chores are the one place kiosk can't match the phone:
  // the phone opens SubmitProofSheet (a camera capture) before payout, and
  // kiosk has no capture flow — so rather than silently submitting without
  // the proof the chore demands, the label states the requirement and the
  // press is a no-op toast telling the kid to finish it on a phone. Same
  // call KioskKidWidgets' own primaryAction already makes for this case.
  const primaryAction = (q: Quest, actions: ReturnType<typeof deriveQuestActions>): {
    label: string; accent: string; Icon: typeof Check; action: () => void;
  } | null => {
    if (actions.canClaim) {
      return {
        label: `Claim (+${q.coins} 🪙)`, accent: k.purple, Icon: Trophy,
        action: () => { claimQuest(q.id, active.id); showToast(`Claimed "${q.title}" ✓`); },
      };
    }
    if (actions.canResubmit) {
      return {
        label: 'Revise & Resubmit', accent: k.gold, Icon: RotateCcw,
        action: () => { submitQuest(q.id, undefined, active.id); showToast('Resubmitted for review ✓'); },
      };
    }
    if (actions.canSubmit) {
      // The phone's own distinct "claimed" step — see the note above.
      if (q.status === 'claimed') {
        return {
          label: 'Start Chore', accent: k.sage, Icon: Zap,
          action: () => { submitQuest(q.id, undefined, active.id); showToast(`Started "${q.title}" ✓`); },
        };
      }
      if (q.photoRequired) {
        return {
          label: 'Take Photo to Get Paid', accent: k.sage, Icon: Camera,
          action: () => { showToast('This chore needs a photo — finish it on your phone 📷'); },
        };
      }
      return {
        label: 'Mark Done → Get Paid', accent: k.sage, Icon: CheckCircle2,
        action: () => { submitQuest(q.id, undefined, active.id); showToast('Submitted for review ✓'); },
      };
    }
    if (actions.canApprove) {
      return {
        label: 'Approve', accent: k.sage, Icon: Check,
        action: () => { approveQuest(q.id, active.id); showToast('Approved ✓'); },
      };
    }
    return null;
  };

  // One shared card renderer, used by both the pool lane and the status
  // lanes so a chore looks identical wherever it appears.
  //
  // ── Parity pass vs. the phone kid card ────────────────────────────────
  // Live-reported: "kiosk chores cards still not matching with the chores
  // cards of mobile app." The reference is features/hub/kid/KidQuestCard.tsx
  // (a kid's real chore card on the phone Hub). What this card was missing,
  // and where each piece now comes from:
  //
  //   · status pill in the ALWAYS-VISIBLE header (phone:117-120) — the
  //     shared kioskQuestMeta from ../kidQuestLanes, so this card and the
  //     Overview's My-Chores widget render an identical pill per status
  //   · overdue badge (phone:121-127) — shared isQuestOverdue/
  //     isMultiSlotQuest, the phone's date-only rule, not a re-derivation
  //   · reward-pending-review badge + body copy (phone:128-133, 169-173)
  //   · the description, in italics (phone:159-161)
  //   · the "terms changed" card with its old→new diff AND its two real
  //     buttons, which REPLACE the normal action row entirely while
  //     pendingTerms is live (phone:179-214)
  //   · the team/multi-slot "Also offered to…" banner (phone:194-201)
  //   · the kid-disputed-redo waiting message (phone:276-281)
  //   · "I did do it" beside "Revise & Resubmit" on a declined chore
  //     (phone:282-297)
  //   · "Can't do this" beside the primary action (phone:254-259, 271-274),
  //     gated on the same deriveQuestActions.canKidDecline
  //   · a real History affordance opening the full activity log, not just
  //     the inline three-stamp line (phone:137-139, 310-312)
  //
  // Everything visual is translated to kiosk tokens (KIOSK_TYPO/SPACE/
  // RADIUS/HIT, k.* colors) rather than copied at phone scale, and every
  // button calls the SAME store action the phone button calls.
  const renderQuestCard = (q: Quest, opts?: { showDeclineReason?: boolean }) => {
    const assignee = memberOf(q.assignedToId);
    const rs = assigneeStyle(assignee, colors, isDark);
    const actions = deriveQuestActions(q, { id: active.id, role: active.role, isActiveApprover });
    const btn = primaryAction(q, actions);
    // Coins are a kid/teen incentive mechanic — an adult task or one
    // assigned to a parent/senior has no payout concept on the phone
    // either, so a stray coin figure here read as broken, not by-design.
    const isAdultAssignee = q.isAdultTask || assignee?.role === 'parent' || assignee?.role === 'senior';
    const catMeta = CATEGORY_META[q.category] ?? { emoji: '📋', color: k.textFaint };
    const timeline = questTimeline(q);
    const meta = kioskQuestMeta(q, k);
    const overdue = isQuestOverdue(q);
    const mates = teamMatesOf(q, quests);
    // Phone gate, verbatim: the terms-change prompt is the kid's own
    // decision on their own chore, so it only appears for the assignee.
    // A parent glancing at the same card sees the diff (below) but no
    // accept/reject buttons — those are not theirs to press.
    const showTermsPrompt = !!q.pendingTerms && isAssignedTo(q, active.id) &&
      (active.role === 'kid' || active.role === 'teen');
    return (
      <KioskExpandableCard
        accentColor={catMeta.color}
        k={k}
        isDark={kioskDark}
        onDoubleTap={actions.canEdit ? () => setEditingQuest(q) : undefined}
        header={
          <View style={s.cardHeader}>
            <View style={s.cardTopRow}>
              <View style={[s.catBadge, { backgroundColor: catMeta.color + '18' }]}>
                <Text style={{ fontSize: 17 }}>{catMeta.emoji}</Text>
              </View>
              <Text style={[s.cardTitle, { color: k.text, flex: 1 }]} numberOfLines={2}>{q.title}</Text>
              {!isAdultAssignee && (
                <Chip label={`${q.coins} 🪙`} accent={k.gold} isDark={kioskDark} k={k} />
              )}
            </View>

            {/* ── Summary badge row [GAP] ──────────────────────────────
                The phone puts status, overdue and reward-pending in the
                ALWAYS-VISIBLE summary beside the coin badge (KidQuestCard
                .tsx:117-133), which is the whole point of them: a kid
                scanning a lane must see "in review" or "overdue" without
                expanding anything. Kiosk showed none of it collapsed —
                status was inferable only from which lane the card sat in,
                and a card in the pool zone or the Overview widget carried
                no status cue at all. Its own row rather than crammed
                beside the title, so a two-line title can't squeeze the
                pills off the card at kiosk scale. */}
            <View style={s.badgeRow}>
              <View
                style={[s.statusPill, { backgroundColor: k.well, borderColor: meta.accent }]}
                accessibilityLabel={`Status: ${meta.label.toLowerCase()}`}
              >
                <meta.Icon size={12} color={meta.accent} />
                <Text style={[s.statusPillText, { color: meta.accent }]} numberOfLines={1}>{meta.label}</Text>
              </View>

              {overdue && (
                <View
                  style={[s.statusPill, { backgroundColor: k.dangerSoft, borderColor: k.dangerEdge }]}
                  accessibilityLabel={isMultiSlotQuest(q)
                    ? 'This chore is overdue'
                    : `Overdue — was due ${fmtDateShort(q.dueDate)}`}
                >
                  <TriangleAlert size={12} color={k.danger} />
                  <Text style={[s.statusPillText, { color: k.danger }]} numberOfLines={1}>
                    {/* A multi-slot bounty shares ONE due date across every
                        claimant, so naming that date on an individual's
                        card misrepresents it as personal — the phone shows
                        a generic label instead (KidQuestCard.tsx:124). */}
                    {isMultiSlotQuest(q) ? 'Chore overdue' : fmtDateShort(q.dueDate)}
                  </Text>
                </View>
              )}

              {q.rewardPendingReview && (
                <View
                  style={[s.statusPill, { backgroundColor: k.well, borderColor: k.goldEdge }]}
                  accessibilityLabel="The reward for this chore is waiting on a parent's approval"
                >
                  <Clock3 size={12} color={k.gold} />
                  <Text style={[s.statusPillText, { color: k.gold }]} numberOfLines={1}>
                    Reward pending
                  </Text>
                </View>
              )}

              {/* ── History [GAP] ──────────────────────────────────────
                  The inline timeline below is the three-stamp summary; the
                  phone ALSO puts a History icon in this same summary row
                  (KidQuestCard.tsx:137-139) opening the full activity log —
                  every edit, reassignment, redo and dispute, not just the
                  three happy-path stamps. Kiosk had no route to that at
                  all. Opens the kiosk-native sheet, which reads the SAME
                  fetchActivityLog('chore', id) rows the phone sheet does.
                  Sits inside KioskExpandableCard's own header Pressable,
                  so it needs a real hitSlop to be reliably hit without
                  toggling the card instead. */}
              <Pressable
                onPress={() => { registerActivity(); setHistoryTarget({ id: q.id, title: q.title }); }}
                hitSlop={12}
                style={({ pressed }) => [
                  s.historyBtn,
                  { backgroundColor: k.well, borderColor: k.cardBorder },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`History for ${q.title}`}
                accessibilityHint="Shows everything that has happened on this chore"
              >
                <History size={13} color={k.textMuted} />
              </Pressable>
            </View>
          </View>
        }
      >
        {!!opts?.showDeclineReason && !!q.declineReason && (
          <View style={[s.reasonBanner, { backgroundColor: k.dangerSoft, borderColor: k.dangerEdge }]}>
            <Text style={[s.reasonText, { color: k.danger }]} numberOfLines={3}>↩ {q.declineReason}</Text>
          </View>
        )}

        {/* ── Description [GAP] ────────────────────────────────────────
            The phone shows the chore's own instructions in italic body text
            at the top of the expanded body (KidQuestCard.tsx:159-161) —
            "wipe the counters too", the detail that actually tells a kid
            what finishing means. Kiosk dropped it entirely, so a chore
            whose whole point was in its description read as a bare title. */}
        {!!q.description && (
          <Text style={[s.cardDescription, { color: k.textMuted }]} numberOfLines={4}>
            "{q.description}"
          </Text>
        )}

        <View style={s.cardMeta}>
          <View style={[s.assigneeChip, { backgroundColor: q.isPool ? k.well : rs.badge, borderColor: q.isPool ? k.cardBorder : rs.dot + '55' }]}>
            {!q.isPool && <Text style={{ fontSize: 14 }}>{assignee?.emoji ?? '👤'}</Text>}
            <Text style={[s.assigneeChipText, { color: q.isPool ? k.textMuted : rs.text }]} numberOfLines={1}>
              {q.isPool ? 'Open to all' : memberName(q.assignedToId) ?? 'Unassigned'}
            </Text>
          </View>
          {!!q.dueDate && (
            <View style={s.dueRow}>
              <Clock3 size={13} color={k.textFaint} />
              <Text style={[s.dueText, { color: k.textFaint }]} numberOfLines={1}>{fmtDateShort(q.dueDate)}</Text>
            </View>
          )}
        </View>

        {/* ── Inline timeline ──────────────────────────────────────────
            The chore's own claimed → submitted → approved trail
            (QuestCard.tsx:293-307, KidQuestCard.tsx:147-155). The shared
            `questTimeline` helper, so this card, the Overview widget and
            the phone render one identical string. Renders nothing for an
            untouched To Do, which has no stamps. The full log lives behind
            the History button in the header above; this is the summary. */}
        {!!timeline && (
          <Text
            style={[s.timelineText, { color: k.textFaint }]}
            numberOfLines={2}
            accessibilityLabel={`Timeline: ${timeline}`}
          >
            {timeline}
          </Text>
        )}

        {/* ── "Waiting on a grown-up" helper (phone:162-167) ──────────── */}
        {q.status === 'pending_approval' && (
          <Text style={[s.cardHelper, { color: k.gold }]} numberOfLines={2}>
            {q.questType === 'grandparent_quest'
              ? 'Waiting on a grandparent to review this chore.'
              : 'Waiting on a parent to review this chore.'}
          </Text>
        )}

        {/* ── Reward pending review [GAP] (phone:169-173) ───────────────
            A kid asked for a reward above the household's auto-approve
            limit. The chore itself is fine to start — this only says the
            PAYOUT is being confirmed separately — and without the sentence
            the header's "Reward pending" badge is alarming and unexplained. */}
        {q.rewardPendingReview && (
          <View style={[s.noticeBanner, { backgroundColor: k.goldSoft, borderColor: k.goldEdge }]}>
            <Text style={[s.noticeText, { color: k.gold }]} numberOfLines={4}>
              The reward you asked for ({q.coins} 🪙) needs a parent's OK since it's above the
              household limit — go ahead and start the chore, the reward gets confirmed separately.
            </Text>
          </View>
        )}

        {/* ── Terms changed [GAP] (phone:179-192) ──────────────────────
            A parent edited the coins or the due date AFTER the kid took the
            chore on. choreStore holds the change as `pendingTerms` rather
            than applying it silently, precisely so the kid gets to see the
            old→new diff and agree — which is impossible if the card never
            renders it. Shown to everyone who can see the card (a parent
            checking what they changed); only the assignee gets the buttons. */}
        {!!q.pendingTerms && (
          <View style={[s.noticeBanner, { backgroundColor: k.goldSoft, borderColor: k.goldEdge }]}>
            <Text style={[s.noticeTitle, { color: k.gold }]} numberOfLines={1}>The terms changed</Text>
            {q.pendingTerms.old.coinsReward !== q.pendingTerms.new.coinsReward && (
              <Text style={[s.noticeText, { color: k.textMuted }]} numberOfLines={1}>
                Coins:{' '}
                <Text style={[s.strike, { color: k.textFaint }]}>{q.pendingTerms.old.coinsReward}</Text>
                {` → ${q.pendingTerms.new.coinsReward} 🪙`}
              </Text>
            )}
            {q.pendingTerms.old.dueDate !== q.pendingTerms.new.dueDate && (
              <Text style={[s.noticeText, { color: k.textMuted }]} numberOfLines={1}>
                Due:{' '}
                <Text style={[s.strike, { color: k.textFaint }]}>
                  {q.pendingTerms.old.dueDate ? fmtDateShort(q.pendingTerms.old.dueDate) : 'none'}
                </Text>
                {` → ${q.pendingTerms.new.dueDate ? fmtDateShort(q.pendingTerms.new.dueDate) : 'none'}`}
              </Text>
            )}
          </View>
        )}

        {/* ── Team / multi-slot bounty [GAP] (phone:194-201) ────────────
            This bounty was offered to several kids at once. The thing that
            actually needs saying is that it is NOT a race for one payout —
            everyone who finishes earns the full amount — which is exactly
            the misunderstanding a bare "Open to all" chip invites. */}
        {mates.length > 0 && (
          <View style={s.teamRow}>
            <Target size={14} color={k.gold} />
            <Text style={[s.teamText, { color: k.gold }]} numberOfLines={3}>
              {`Also offered to ${mates.map(t => memberName(t.assignedToId) ?? 'a sibling').join(' & ')} — everyone who finishes gets the full ${q.coins} 🪙`}
            </Text>
          </View>
        )}

        {actions.canEdit && (
          <Pressable
            onPress={() => setEditingQuest(q)}
            style={s.editLink}
            accessibilityRole="button"
            accessibilityLabel={`Edit details for ${q.title}`}
          >
            <Text style={[s.editLinkText, { color: k.primary }]}>Edit details</Text>
          </Pressable>
        )}

        {/* ── Action row ───────────────────────────────────────────────
            Branch order is the phone's (KidQuestCard.tsx:202-309), and the
            order is load-bearing:

            1. A live pendingTerms REPLACES the normal action row outright.
               Offering "Mark Done → Get Paid" beside an unanswered "the
               coins changed from 20 to 5" would let a kid finish a chore
               without ever answering the question the store is holding
               open for them.
            2. kidDisputedRedo replaces the redo buttons with a waiting
               message — the dispute is already filed, and a second
               "Revise & Resubmit" tap would withdraw it by resubmitting.
            3. A declined chore gets BOTH resubmit and "I did do it".
            4. Otherwise the primary action, plus "Can't do this" when
               deriveQuestActions says this viewer may decline. */}
        {showTermsPrompt ? (
          <View style={s.actionRow}>
            <ActionButton
              label="Still fine by me"
              Icon={CheckCircle2}
              accent={k.sage}
              k={k}
              isDark={kioskDark}
              variant="solid"
              style={s.actionPrimary}
              accessibilityHint={`Accept the new terms for ${q.title}`}
              onPress={() => {
                registerActivity();
                acceptTermsChange(q.id, active.id);
                showToast('Terms accepted ✓');
              }}
            />
            <ActionButton
              label="Hand it back"
              accent={k.danger}
              k={k}
              isDark={kioskDark}
              variant="soft"
              style={s.actionSecondary}
              accessibilityHint={`Turn down the new terms and give ${q.title} back`}
              onPress={() => {
                registerActivity();
                rejectTermsChange(q.id, active.id);
                showToast('Handed back — a parent will see this');
              }}
            />
          </View>
        ) : q.kidDisputedRedo && actions.canResubmit ? (
          // ── Kid-disputed redo [GAP] (phone:276-281) ─────────────────
          // The kid already said "I did do it" — a second parent has to
          // weigh in before anything else can happen, so the card states
          // that instead of offering buttons that would undo the dispute.
          <Text style={[s.waitingText, { color: k.textFaint }]} numberOfLines={2}>
            Waiting on a second parent to take a look…
          </Text>
        ) : actions.canResubmit ? (
          // ── Declined: resubmit OR dispute [GAP] (phone:282-297) ─────
          // Kiosk offered resubmit only, which silently assumes the parent
          // was right. The phone gives the kid a real second option —
          // pre-payout dispute — and it is the one that most needs to be
          // reachable from the shared family screen where the disagreement
          // is actually happening.
          <View style={s.actionRow}>
            {btn && (
              <ActionButton
                label={btn.label}
                Icon={btn.Icon}
                accent={btn.accent}
                k={k}
                isDark={kioskDark}
                variant="solid"
                style={s.actionPrimary}
                accessibilityHint={q.title}
                onPress={() => { registerActivity(); btn.action(); }}
              />
            )}
            <ActionButton
              label="I did do it"
              Icon={ShieldQuestion}
              accent={k.purple}
              k={k}
              isDark={kioskDark}
              variant="soft"
              style={s.actionSecondary}
              accessibilityHint={`Ask a second parent to look at ${q.title} again`}
              onPress={() => {
                registerActivity();
                disputeRedo(q.id, active.id);
                showToast('Asked a parent to take another look ✓');
              }}
            />
          </View>
        ) : (btn || actions.canKidDecline) ? (
          <View style={s.actionRow}>
            {btn && (
              <ActionButton
                label={btn.label}
                Icon={btn.Icon}
                accent={btn.accent}
                k={k}
                isDark={kioskDark}
                variant="solid"
                style={s.actionPrimary}
                accessibilityHint={q.title}
                onPress={() => { registerActivity(); btn.action(); }}
              />
            )}
            {/* Same gate the phone reads (its canDeclinePlain, KidQuestCard
                .tsx:87 = deriveQuestActions.canKidDecline) and the same
                one-step kiosk reason dialog the Overview widget already
                uses, which reaches choreStore.declineChoreAssignment via
                resolveCantMakeIt exactly as the phone sheet does. */}
            {actions.canKidDecline && (
              <ActionButton
                label="Can't do this"
                accent={k.danger}
                k={k}
                isDark={kioskDark}
                variant="soft"
                style={s.actionSecondary}
                accessibilityHint={`Give a reason and put ${q.title} back up for grabs`}
                onPress={() => { registerActivity(); setDeclineTarget({ id: q.id, title: q.title }); }}
              />
            )}
          </View>
        ) : null}
      </KioskExpandableCard>
    );
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.rootContent}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={registerActivity}
    >
      {/* ── Masthead ──────────────────────────────────────────────────
          A kiosk screen announces itself: the shared TabTitle, with a
          subtitle stating what this board currently means for whoever is
          standing at it, so the surface is self-explanatory to a family
          member who walked up without navigating here deliberately. The
          creation button's role gate is unchanged (parent, or a kid via
          the Kid-safe AskParentSheet). */}
      <TabTitle
        title="Chores"
        k={k}
        // Counts deliberately read the UNFILTERED visible set. The
        // masthead is the board's standing summary — "3 waiting on you" has
        // to stay true while someone is looking at one kid's pill, or the
        // number silently drops to 0 and reads as "nothing needs me" when
        // three chores actually do.
        subtitle={isParent
          ? `${totals.review} waiting on you · ${totals.pool} up for grabs`
          : `${totals.pool} up for grabs · ${totals.mine} on your plate`}
        right={(isParent || isKidCreator) ? (
          <ActionButton
            label={isParent ? 'New Chore' : 'Ask Parent'}
            Icon={Plus}
            accent={k.primary}
            k={k}
            isDark={kioskDark}
            variant="solid"
            accessibilityHint={isParent ? 'Opens the chore composer' : 'Send a request to a parent'}
            onPress={() => { registerActivity(); openCreator(); }}
          />
        ) : undefined}
      />

      {/* ── Filter bar ────────────────────────────────────────────────
          The phone's "Member / Filter Pills + Status Tabs" block
          (QuestsScreen.tsx:942-954 → QuestFilters.tsx), in kiosk's own
          visual language. Two rows because they're two independent facets
          and stacking them is what makes that legible from across a
          kitchen; the phone stacks them for the same reason.

          Sizing note — this bar must not reintroduce the ragged-column bug
          documented at length above s.columns. It can't: it's a sibling
          block ABOVE the lane grid, not inside it, so it takes vertical
          space only and never enters the columns' horizontal division.
          The member row is a horizontal ScrollView with flexGrow:0 on the
          ScrollView itself (s.filterRowOuter) — without that a horizontal
          ScrollView in a flex column stretches to fill leftover vertical
          space instead of hugging its pills, the exact bug KioskScheduleTab
          hit and records in its own stylesheet. The status row wraps
          instead of scrolling, since it is a fixed three-item set. */}
      <View style={s.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterRowOuter}
          contentContainerStyle={s.filterRow}
          onScrollBeginDrag={registerActivity}
        >
          <FilterPill
            label={avail.isKidOrTeen ? 'My Chores' : 'All Family'}
            emoji={avail.isKidOrTeen ? '🎯' : undefined}
            selected={kidFilter === 'all'}
            accent={k.primary}
            k={k} isDark={kioskDark}
            a11yLabel={avail.isKidOrTeen ? 'Show my chores' : "Show the whole family's chores"}
            hint="Filters the board"
            onPress={() => { registerActivity(); setKidFilter('all'); setTabStatus('all'); }}
          />

          {/* Per-member pills — adults only, per QuestFilters.tsx:75. A
              kid/teen has no sibling chores in scope to filter to (see
              visibleQuestsFor), so the row would be a set of pills that all
              resolve to an empty board. */}
          {avail.showPerMember && kids.map(m => {
            const rs = assigneeStyle(m, colors, isDark);
            const on = kidFilter === m.id;
            const first = m.name.split(' ')[0];
            return (
              <FilterPill
                key={m.id}
                label={first}
                emoji={m.emoji ?? '👤'}
                selected={on}
                accent={rs.dot}
                k={k} isDark={kioskDark}
                a11yLabel={`Filter to ${first}'s chores`}
                hint="Filters the board to one person"
                onPress={() => { registerActivity(); setKidFilter(on ? 'all' : m.id); setTabStatus('all'); }}
              />
            );
          })}

          {/* Adults — parent-only. QuestFilters.tsx:92 gates this on
              isParentOrSenior && !isSenior, i.e. a grandparent does NOT
              get it (their world is their own quests and cheering), and
              kiosk routes seniors to KioskGpTasksView entirely anyway. */}
          {avail.showAdults && (
            <FilterPill
              label="Adults"
              emoji="👨‍👩"
              selected={kidFilter === 'adults'}
              accent={k.purple}
              k={k} isDark={kioskDark}
              a11yLabel="Show adult chores only"
              hint="Filters the board to grown-up tasks"
              onPress={() => { registerActivity(); setKidFilter('adults'); setTabStatus('all'); }}
            />
          )}

          <FilterPill
            label="Bounty"
            emoji="⚡"
            selected={kidFilter === 'pool'}
            accent={k.gold}
            k={k} isDark={kioskDark}
            a11yLabel="Show up-for-grabs bounty chores only"
            hint="Filters the board to chores anyone can claim"
            onPress={() => { registerActivity(); setKidFilter('pool'); setTabStatus('all'); }}
          />

          {/* Sibling Cheer — kid/teen only (QuestFilters.tsx:119). */}
          {avail.showCheer && (
            <FilterPill
              label="Sibling Cheer"
              emoji="👏"
              selected={kidFilter === 'cheer'}
              accent={k.sage}
              k={k} isDark={kioskDark}
              a11yLabel="Cheer on what your brothers and sisters finished"
              hint="Switches to the cheering view"
              onPress={() => { registerActivity(); setKidFilter('cheer'); setTabStatus('all'); }}
            />
          )}
        </ScrollView>

        {/* Status segment — hidden under Cheer, exactly as the phone hides
            it (QuestFilters.tsx:135), because that view isn't a status
            list at all. */}
        {kidFilter !== 'cheer' && (
          <View style={s.statusRow} accessibilityRole="tablist">
            {KIOSK_STATUS_TABS.map(tab => {
              const on = tabStatus === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => { registerActivity(); setTabStatus(tab.key); }}
                  accessibilityRole="tab"
                  accessibilityLabel={`${tab.label} chores`}
                  accessibilityHint="Filters the board by stage"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [
                    s.statusTab,
                    on
                      ? { backgroundColor: k.primary, borderColor: k.primary }
                      : { backgroundColor: k.card, borderColor: k.cardBorder },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text
                    style={[s.statusTabText, { color: on ? kioskOnAccent(k, k.primary) : k.textMuted }]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Sibling Cheer view ────────────────────────────────────────
          The phone swaps the whole quest list for SiblingCheerPanel when
          this filter is on (QuestsScreen.tsx:957). Kiosk does the same,
          but reuses KioskKidCheerList — the list body already built this
          session for the Hub's Cheer Squad sheet — rather than becoming a
          third copy of the same cheering UI. */}
      {kidFilter === 'cheer' && avail.showCheer && (
        <WidgetCard k={k} isDark={kioskDark} accent={k.sage} style={s.zone}>
          <WidgetHeader
            Icon={PartyPopper}
            eyebrow="Their wins"
            title="Sibling Cheer"
            accent={k.sage}
            k={k}
            isDark={kioskDark}
          />
          <KioskKidCheerList active={active} members={members} k={k} isDark={kioskDark} />
        </WidgetCard>
      )}

      {kidFilter !== 'cheer' && <>

      {/* ── Zone 1: Up for grabs ──────────────────────────────────────
          The pool lane leads the board rather than being buried inside
          "To Do". This is the one thing on a shared kitchen surface that
          is addressed to the ROOM rather than to an individual, so it
          gets hero treatment: full width, tinted tiles, big cards. */}
      {poolQuests.length > 0 && (
        <WidgetCard k={k} isDark={kioskDark} accent={k.gold} style={s.zone}>
          <WidgetHeader
            Icon={Sparkles}
            eyebrow="Anyone can claim these"
            title="Up for grabs"
            accent={k.gold}
            k={k}
            isDark={kioskDark}
            right={<Chip label={`${poolQuests.length}`} accent={k.gold} isDark={kioskDark} k={k} />}
          />
          <View style={s.poolGrid}>
            {poolQuests.map(q => (
              <Well key={q.id} k={k} accent={k.gold} style={s.poolCard}>
                {renderQuestCard(q)}
              </Well>
            ))}
          </View>
        </WidgetCard>
      )}

      {/* ── Zone 2: Who has what ──────────────────────────────────────
          Person-first, matching KioskHeader's avatar language. A status
          kanban answers "what is stuck where," which is a project-
          management question; the question a family actually asks at the
          kitchen counter is "who still has something to do." Each member
          gets a row with their own tint, so the board is readable as a
          set of PEOPLE from across the room. Parent/teen-facing — a kid
          shouldn't get a sibling-comparison leaderboard front and center
          (same reasoning the old stat strip already applied). */}
      {isParent && kidStats.length > 0 && (
        <WidgetCard k={k} isDark={kioskDark} style={s.zone}>
          <WidgetHeader
            Icon={Check} eyebrow="Roster" title="Who has what"
            accent={k.sage} k={k} isDark={kioskDark}
          />
          {/* Compact roster CHIPS, not a card per person. Live-reported:
              full-size member cards held very little information (avatar,
              name, a fraction, a bar) while occupying a whole tile each,
              so two people filled a row and the screen read sparse and
              oversized. A chip puts the same information on one line —
              avatar, name, count, progress — so a family of six fits in
              the space two cards used, and the zone reads as a roster
              rather than as two big empty boxes. */}
          <View style={s.rosterRow}>
            {kidStats.map(({ member, open, total }) => {
              const rs = assigneeStyle(member, colors, isDark);
              const done = total - open;
              const pct = total > 0 ? done / total : 1;
              const clear = open === 0;
              return (
                <View
                  key={member.id}
                  style={[s.rosterChip, { backgroundColor: k.well, borderColor: k.cardBorder, ...kioskElevation(rs.dot, kioskDark) }]}
                  accessibilityLabel={`${member.name.split(' ')[0]}: ${done} of ${total} chores done`}
                >
                  <View style={[s.rosterAvatar, { backgroundColor: rs.badge, borderColor: rs.dot }]}>
                    <Text style={{ fontSize: 18 }}>{member.emoji ?? '👤'}</Text>
                  </View>
                  <View style={s.rosterBody}>
                    <View style={s.rosterTopLine}>
                      <Text style={[s.rosterName, { color: k.text }]} numberOfLines={1}>
                        {member.name.split(' ')[0]}
                      </Text>
                      <Text style={[s.rosterFrac, { color: clear ? k.sage : rs.dot }]} numberOfLines={1}>
                        {clear ? 'done' : `${done}/${total}`}
                      </Text>
                    </View>
                    {/* A slim rule, not a chunky bar — it's a supporting
                        indicator, not the headline. */}
                    <View style={[s.rosterTrack, { backgroundColor: k.cardBorder }]}>
                      <View style={[s.rosterFill, { backgroundColor: clear ? k.sage : rs.dot, width: `${Math.round(pct * 100)}%` }]} />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </WidgetCard>
      )}

      {/* ── Zone 3: Status lanes ──────────────────────────────────────
          Status demoted to a secondary facet below the person view, and
          each lane is now rendered only when it has something in it —
          four permanently-empty "Nothing here" columns is exactly the
          dead, admin-dashboard look this surface has to avoid. The lanes
          themselves keep the even flex grid (see the COLUMN_GAP comment
          above for the alignment fix). */}
      {byColumn.some(c => c.items.length > 0) && (
        <WidgetCard k={k} isDark={kioskDark} style={s.zone}>
          <WidgetHeader
            Icon={Clock3} eyebrow="By status" title="In flight"
            accent={k.primary} k={k} isDark={kioskDark}
          />
          {/* ── Lane grid sizing ────────────────────────────────────────
              The even-division fix documented above s.columns (flex:1 +
              flexBasis:0 + minWidth:0) is intact and untouched — it is
              still what makes the lanes an exact grid with no arithmetic to
              drift. What it CANNOT do on its own is decide how many lanes
              belong on one row: dividing a narrow portrait pane four ways
              gives ~150px lanes, and a chore card with a category badge, a
              two-line title and a coin chip does not survive that.
              Live check: 4 lanes need ~260px each to stay readable, so the
              row splits once the measured pane can't afford that.

              Deliberately measured with onLayout rather than
              Dimensions.get('window') — this pane sits inside the kiosk nav
              rail, so window width overstates it by the rail's width, which
              is exactly the stale-constant mistake the RAIL_AND_PADDING
              note above records. `laneCols` only ever chooses how many
              lanes share a row; within a row flexbox still divides exactly,
              so no fractional width is ever computed or rounded here. */}
          <View
            style={s.columns}
            onLayout={e => setBoardWidth(e.nativeEvent.layout.width)}
          >
            {byColumn.filter(c => c.items.length > 0).map(col => (
              <View key={col.key} style={[s.col, laneBasis]}>
                <View style={s.colHeadRow}>
                  <Text style={[s.colHead, { color: k.textMuted }]} numberOfLines={1}>
                    {col.label.toUpperCase()}
                  </Text>
                  <View style={[s.colCount, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
                    <Text style={[s.colCountText, { color: k.textMuted }]}>{col.items.length}</Text>
                  </View>
                </View>
                <View style={s.cardGrid}>
                  {col.items.map(q => (
                    <View key={q.id} style={s.laneCard}>
                      {renderQuestCard(q, { showDeclineReason: col.key === 'redo' })}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </WidgetCard>
      )}

      {/* Whole-board empty state — one calm, centered message rather
          than four separate "Nothing here" labels. */}
      {poolQuests.length === 0 && !byColumn.some(c => c.items.length > 0) && (
        // Deliberately quiet and SMALL. Live-reported: the previous
        // version was the single largest element on screen, which is
        // backwards for a state that by definition has nothing to show.
        // An empty state should reassure and get out of the way, so this
        // is one tidy inline row rather than a hero panel.
        <View style={[s.boardEmpty, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
          <Text style={{ fontSize: 20 }}>{isFiltered ? '🔍' : '🎉'}</Text>
          <Text style={[s.boardEmptyText, { color: k.textMuted }]} numberOfLines={2}>
            {/* A filtered-empty board is a different message from a truly
                clear one — "All clear, every chore is done" while a Bounty
                or In Review pill is silently narrowing the view is simply
                false, and on a shared surface nobody remembers they left a
                filter on. Phrasings track QuestsScreen.tsx:977-980's own
                per-tabStatus empty copy. */}
            {!isFiltered ? 'All clear — every chore is done or approved.'
              : tabStatus === 'todo'      ? 'Nothing to do under this filter 🎉'
              : tabStatus === 'review'    ? 'Nothing is waiting for review right now.'
              : tabStatus === 'completed' ? 'Nothing finished under this filter yet.'
              : 'No chores match this filter.'}
          </Text>
          {isFiltered && (
            <ActionButton
              label="Clear filters"
              accent={k.primary}
              k={k}
              isDark={kioskDark}
              variant="soft"
              accessibilityHint="Shows the whole board again"
              onPress={() => { registerActivity(); setKidFilter('all'); setTabStatus('all'); }}
            />
          )}
        </View>
      )}

      </>}

      {/* Per-card History — the full activity log behind the header's
          History button. Kiosk-native (KioskFormDrawer 'drawer' variant)
          rather than the phone's ChoreHistorySheet, but reading the exact
          same fetchActivityLog('chore', id) rows with the same verb/field
          formatting; see that component's header for the full reasoning. */}
      <KioskChoreHistorySheet
        choreId={historyTarget?.id ?? null}
        choreTitle={historyTarget?.title}
        members={members}
        k={k}
        onClose={() => setHistoryTarget(null)}
      />

      {/* "Can't do this" reason picker — the same one-step kiosk dialog the
          Overview's My-Chores widget uses, so the two surfaces can't offer
          different decline vocabularies for the same chore. */}
      {declineTarget && (
        <KioskCantDoThisDialog
          visible
          choreId={declineTarget.id}
          choreTitle={declineTarget.title}
          byMemberId={active.id}
          k={k}
          onClose={() => setDeclineTarget(null)}
        />
      )}

      {isParent && (
        <KioskQuestEditor
          quest={editingQuest}
          active={active}
          isActiveApprover={isActiveApprover}
          onClose={() => setEditingQuest(null)}
          members={members}
          colors={colors}
          isDark={isDark}
        />
      )}

      {/* Real creation flow, ported from TasksScreen.tsx lines ~474-540 —
          see this file's top-of-function comment for the full mapping. The
          kid half of it (picker + eight destinations) is the shared
          useKioskAskParent hook, used here and by the Overview. */}
      {askParentNode}

      <SmartTaskComposer
        visible={showComposer}
        members={members}
        activeMemberId={active.id}
        familyId={active.familyId ?? ''}
        onClose={() => setShowComposer(false)}
        onCreated={() => setShowComposer(false)}
        onOpenFullForm={(kind, prefill) => {
          setShowComposer(false);
          if (kind === 'quest') {
            setManualQuestPrefill(prefill as typeof manualQuestPrefill);
            setShowManualQuest(true);
          } else {
            setManualEventPrefill(prefill as typeof manualEventPrefill);
            setShowManualEvent(true);
          }
        }}
      />

      {showManualQuest && (
        <AddQuestModal
          visible={showManualQuest}
          onClose={() => { setShowManualQuest(false); setManualQuestPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={manualQuestPrefill}
          initialStep={manualQuestPrefill ? 'review' : undefined}
        />
      )}

      {showManualEvent && (
        <AddEventModal
          visible={showManualEvent}
          onClose={() => { setShowManualEvent(false); setManualEventPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={manualEventPrefill as any}
          initialStep="review"
        />
      )}
    </ScrollView>
  );
}

// ── GP / Senior view ────────────────────────────────────────────────────────
// Per spec: no create/edit/delete. Three things a GP actually does here:
// 1. Cheer/high-five kids' chores finished in the last 24h (cheerChore) —
//    mirrors SeniorView.tsx's CheerSquadSection filter exactly.
// 2. Claim/submit their own grandparent_quest items via the same
//    claimQuest/submitQuest actions the phone's quest cards use.
// 3. Approve pending_approval quests (parent-or-senior RBAC per spec §5).
function KioskGpTasksView({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const { quests, claimQuest, submitQuest, approveQuest } = useQuestStore();
  const cheerChore = useChoreStore(s => s.cheerChore);

  const kids = members.filter(m => m.role === 'kid' || m.role === 'teen');

  const kidsCheerable = useMemo(() => quests.filter(q => {
    if (!['approved', 'done'].includes(q.status)) return false;
    if (!q.assignedToId || !kids.some(k => k.id === q.assignedToId)) return false;
    if ((q.cheers ?? []).some(c => c.memberId === active.id)) return false;
    return true;
  }), [quests, kids, active.id]);

  const myGpQuestsOpen = useMemo(() => quests.filter(q =>
    q.questType === 'grandparent_quest' && q.status === 'todo' && !q.assignedToId
  ), [quests]);
  const myGpQuestsAssigned = useMemo(() => quests.filter(q =>
    q.questType === 'grandparent_quest' && q.assignedToId === active.id &&
    ['claimed', 'in_progress'].includes(q.status)
  ), [quests]);
  const pendingReview = useMemo(() => quests.filter(q => q.status === 'pending_approval'), [quests]);

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];

  /**
   * One GP card. The three lanes below (cheer / approve / sponsored) all
   * rendered a near-identical card with a different button, so they share
   * one renderer now rather than repeating the markup four times — that
   * repetition is exactly how the four copies drifted apart on padding and
   * numberOfLines in the first place.
   */
  const gpCard = (
    q: typeof quests[number],
    opts: { sub?: string; label: string; Icon?: typeof Check; accent: string; onPress: () => void; hint: string },
  ) => (
    <Well key={q.id} k={k} accent={opts.accent} style={s.gpCard}>
      <View style={[s.catBadge, { backgroundColor: (CATEGORY_META[q.category]?.color ?? k.textFaint) + '18' }]}>
        <Text style={{ fontSize: 18 }}>{CATEGORY_META[q.category]?.emoji ?? '📋'}</Text>
      </View>
      <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={2}>{q.title}</Text>
      {!!opts.sub && (
        <Text style={[s.cardSub, { color: k.textMuted }]} numberOfLines={1}>{opts.sub}</Text>
      )}
      <ActionButton
        label={opts.label}
        Icon={opts.Icon}
        accent={opts.accent}
        k={k}
        isDark={kioskDark}
        variant="solid"
        style={s.gpBtn}
        accessibilityHint={opts.hint}
        onPress={() => { registerActivity(); opts.onPress(); }}
      />
    </Well>
  );

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.rootContent}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={registerActivity}
    >
      <TabTitle
        title="Cheer Your Grandkids"
        subtitle="High-five what they finished, and pitch in on your own chores"
        k={k}
      />

      <WidgetCard k={k} isDark={kioskDark} style={s.zone}>
        <WidgetHeader
          Icon={PartyPopper} eyebrow="Last finished" title="Ready to cheer"
          accent={k.sage} k={k} isDark={kioskDark}
          right={kidsCheerable.length > 0
            ? <Chip label={`${kidsCheerable.length}`} accent={k.sage} isDark={kioskDark} k={k} />
            : undefined}
        />
        {kidsCheerable.length === 0 ? (
          <EmptyNote text="Nothing finished yet today 🌱" k={k} />
        ) : (
          <View style={s.gpGrid}>
            {kidsCheerable.map(q => gpCard(q, {
              sub: `${memberName(q.assignedToId)} finished this`,
              label: 'Send a Cheer', Icon: PartyPopper, accent: k.sage,
              hint: q.title,
              onPress: () => cheerChore(q.id, active.id),
            }))}
          </View>
        )}
      </WidgetCard>

      {pendingReview.length > 0 && (
        <WidgetCard k={k} isDark={kioskDark} accent={k.primary} style={s.zone}>
          <WidgetHeader
            Icon={Check} eyebrow="Needs a grown-up" title="Waiting on approval"
            accent={k.primary} k={k} isDark={kioskDark}
            right={<Chip label={`${pendingReview.length}`} accent={k.primary} isDark={kioskDark} k={k} />}
          />
          <View style={s.gpGrid}>
            {pendingReview.map(q => gpCard(q, {
              sub: memberName(q.assignedToId) ?? 'Unassigned',
              label: 'Approve', Icon: Check, accent: k.primary,
              hint: q.title,
              onPress: () => approveQuest(q.id, active.id),
            }))}
          </View>
        </WidgetCard>
      )}

      {(myGpQuestsOpen.length > 0 || myGpQuestsAssigned.length > 0) && (
        <WidgetCard k={k} isDark={kioskDark} style={s.zone}>
          <WidgetHeader
            Icon={Sparkles} eyebrow="Yours" title="Your sponsored chores"
            accent={k.gold} k={k} isDark={kioskDark}
          />
          <View style={s.gpGrid}>
            {myGpQuestsOpen.map(q => gpCard(q, {
              label: 'Claim', accent: k.primary, hint: q.title,
              onPress: () => claimQuest(q.id, active.id),
            }))}
            {myGpQuestsAssigned.map(q => gpCard(q, {
              label: 'Submit', accent: k.gold, hint: q.title,
              onPress: () => submitQuest(q.id, undefined, active.id),
            }))}
          </View>
        </WidgetCard>
      )}
    </ScrollView>
  );
}

// Rescaled to the kiosk ladder. The card action buttons ("Claim Chore",
// "Approve") matter most: these are THE primary interactions on a shared
// counter surface, tapped by kids at arm's length, and were previously
// 12px-labelled phone buttons.
const s = StyleSheet.create({
  root: { flex: 1 },
  rootContent: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  // Zones — the ambient rhythm. Large gaps BETWEEN zones and tight
  // grouping WITHIN them, so the screen resolves as three confident
  // blocks at a glance rather than one uniform field of cards.
  // Each zone is a WidgetCard now, so the gap between them is a plain
  // margin rather than the old bare-View rhythm.
  zone: { marginBottom: KIOSK_SPACE.md },

  // ── Filter bar ────────────────────────────────────────────────────────
  filterBar: { gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md },
  // A horizontal ScrollView in a flex column stretches to fill leftover
  // vertical space unless flexGrow is pinned on the ScrollView ITSELF (not
  // its contentContainerStyle) — live-reported on KioskScheduleTab as
  // "the filter pills height should be fixed, it is stretching now too
  // much." Same token, same fix, so the two filter rows can't diverge.
  filterRowOuter: { flexGrow: 0 },
  filterRow: {
    flexDirection: 'row', gap: KIOSK_SPACE.xs, alignItems: 'center',
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.min,
    justifyContent: 'center', borderRadius: KIOSK_RADIUS.full, borderWidth: 1.5,
  },
  filterChipText: { fontSize: KIOSK_TYPO.label, fontWeight: '800', flexShrink: 1 },
  // Wraps rather than scrolls — a fixed three-item set, and a three-pill
  // row that scrolls when it doesn't need to reads as broken.
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  statusTab: {
    paddingHorizontal: KIOSK_SPACE.lg, minHeight: KIOSK_HIT.min,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1.5,
  },
  statusTabText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },

  // The chore's claimed → submitted → approved trail inside the card body.
  timelineText: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginBottom: KIOSK_SPACE.xs },

  // Pool lane — the hero zone. Wide tiles, generous minimums.
  poolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  poolCard: { width: 320, maxWidth: '100%' },

  // People zone — compact roster chips (see the render comment). Each is
  // ~220px and one line tall, so six people fit where two cards did.
  rosterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  rosterChip: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    width: 220, maxWidth: '100%',
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingVertical: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.sm,
  },
  rosterAvatar: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  rosterBody: { flex: 1, minWidth: 0, gap: 5 },
  rosterTopLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: KIOSK_SPACE.xs },
  rosterName: { fontSize: KIOSK_TYPO.body, fontWeight: '800', flexShrink: 1 },
  rosterFrac: { fontSize: KIOSK_TYPO.label, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rosterTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  rosterFill: { height: '100%', borderRadius: 2 },

  // Lane column heads — a label plus a count chip, not a run-on string.
  colHeadRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.sm },
  colCount: { minWidth: 32, paddingHorizontal: 8, paddingVertical: 2, borderRadius: KIOSK_RADIUS.full, borderWidth: 1, alignItems: 'center' },
  colCountText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', fontVariant: ['tabular-nums'] },
  laneCard: { width: '100%' },

  // One tidy inline row, not a hero panel — an empty state should be the
  // quietest thing on screen, not the largest.
  boardEmpty: {
    // flexWrap so the "Clear filters" button (only present in the filtered
    // variant) drops to its own line on a narrow pane rather than squeezing
    // the message text — this row is otherwise unchanged.
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: KIOSK_SPACE.sm,
    alignSelf: 'flex-start', maxWidth: '100%',
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    paddingVertical: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.md,
  },
  boardEmptyText: { fontSize: KIOSK_TYPO.body, fontWeight: '600', flexShrink: 1 },
  // Was: no explicit height on the ScrollView itself (only on its
  // contentContainerStyle) — in a plain flex column, a horizontal
  // ScrollView with an unbounded cross-axis can stretch to fill whatever
  // vertical space its sibling below doesn't claim, instead of hugging its
  // own pill content. Live-reported: "the tasks filter pills height should
  // be fixed, it is stretching now too much." flexGrow:0 pins it to
  // exactly its content's height.
  // Was flex:1 — forced every column (and its inner ScrollView) to
  // stretch the full remaining screen height even when there were only 1-2
  // cards, reading as a huge dead void below a handful of cards
  // (live-reported: "too much height unnecessarily"). Columns now hug
  // their own content; the outer screen ScrollView (see the root return)
  // handles scrolling if a column's real content ever exceeds the screen.
  // `gap` here MUST equal the COLUMN_GAP constant the cards-per-row
  // estimate reads — both are KIOSK_SPACE.md; see the block comment on
  // that constant for why a mismatch produced a visibly ragged grid.
  // flexWrap added alongside the laneBasis math above: on a wide landscape
  // kiosk nothing wraps (every lane clears the 260px floor and laneBasis
  // stays null, so this is the exact single-row grid it always was), while
  // a narrow portrait pane splits 4 lanes into 2x2 instead of squeezing
  // four unreadable ~150px columns onto one line. alignItems:'flex-start'
  // so a short second row doesn't stretch to the tall row's height.
  columns: {
    flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md,
    alignItems: 'flex-start',
  },
  // flex:1 + flexBasis:0 + minWidth:0 is what actually makes the four
  // columns an even grid: flexBasis:0 means the free space is divided
  // equally rather than distributed on top of differing content widths
  // (flex:1 alone still lets a column with a long chore title claim more),
  // and minWidth:0 lets a column shrink below its content's intrinsic
  // width instead of forcing the row to overflow.
  col: { flex: 1, flexBasis: 0, minWidth: 0 },
  colHead: { fontSize: KIOSK_TYPO.sectionLabel, fontWeight: '800', letterSpacing: 1.2, marginBottom: KIOSK_SPACE.sm },
  // Cards stack one per row within a lane; the lane itself is flex-sized.
  // stretching a whole narrow column — live-reported: a single card sat
  // in a huge empty column with nothing else to fill the space.
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.lg, alignContent: 'flex-start' },
  // The always-visible header is two rows now — title line, then the
  // status/overdue/reward/history badge row. See renderQuestCard's own note
  // for why the badges are their own row rather than beside the title.
  cardHeader: { gap: KIOSK_SPACE.xs },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: KIOSK_SPACE.xs },
  // Outlined rather than filled: several of these can appear at once
  // (status + overdue + reward pending), and three solid color blocks in a
  // row overwhelm the title they're meant to annotate. The accent lives in
  // the border and the label, on the neutral `well` ground, which reads the
  // same way in both appearances.
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 3,
    flexShrink: 1,
  },
  statusPillText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
  // A real bordered control, not a bare icon — this sits inside the card's
  // own header Pressable, so it needs to read as a separate tappable thing
  // rather than decoration. hitSlop (at the call site) carries it past the
  // touch floor without making the chip visually heavy.
  historyBtn: {
    width: 30, height: 30, borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginLeft: 'auto',
  },
  catBadge: { width: 32, height: 32, borderRadius: KIOSK_RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800', lineHeight: KIOSK_TYPO.body * 1.3 },
  cardSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  // The chore's own instructions — italic, matching the phone's treatment
  // of a description as a quoted aside rather than another metadata line.
  cardDescription: {
    fontSize: KIOSK_TYPO.caption, fontStyle: 'italic', fontWeight: '600',
    lineHeight: KIOSK_TYPO.caption * 1.4, marginBottom: KIOSK_SPACE.xs,
  },
  cardHelper: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginBottom: KIOSK_SPACE.xs },
  // Shared shell for the reward-pending and terms-changed notices, so two
  // amber banners on one card can't drift apart on padding or radius.
  noticeBanner: {
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, gap: 2,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs,
    marginBottom: KIOSK_SPACE.xs,
  },
  noticeTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  noticeText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', lineHeight: KIOSK_TYPO.caption * 1.35 },
  strike: { textDecorationLine: 'line-through' },
  teamRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.xs,
    marginBottom: KIOSK_SPACE.xs,
  },
  teamText: { flex: 1, fontSize: KIOSK_TYPO.caption, fontWeight: '700', lineHeight: KIOSK_TYPO.caption * 1.35 },
  waitingText: {
    fontSize: KIOSK_TYPO.caption, fontStyle: 'italic', fontWeight: '600',
    textAlign: 'center', paddingVertical: KIOSK_SPACE.sm,
  },
  // Two-up action row. The phone weights these 2:1 (its flex:2 / flex:1) so
  // the affirmative action clearly leads and the secondary one reads as the
  // exception — same ratio here. flexWrap so a long primary label ("Take
  // Photo to Get Paid") drops the secondary button to its own line in a
  // narrow lane rather than crushing both.
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  actionPrimary: { flexGrow: 2, flexBasis: 140, minWidth: 0 },
  actionSecondary: { flexGrow: 1, flexBasis: 100, minWidth: 0 },
  reasonBanner: { borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.xs },
  reasonText: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.sm },
  // Was a bare text link with no padding — a ~14px-tall tap target on a
  // kiosk. Now a real padded control meeting the touch-size floor.
  editLink: {
    alignSelf: 'flex-start', marginBottom: KIOSK_SPACE.xs, minHeight: 44,
    justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.xs,
  },
  editLinkText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  assigneeChip: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.full,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs, borderWidth: 1, flexShrink: 1,
  },
  assigneeChipText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dueText: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  // (cardActionBtn's full-width single button was replaced by the two-up
  // actionRow above, which the phone card's own branches all use.)
  gpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  // maxWidth so a fixed-width card can never exceed a narrow portrait
  // pane and clip — same guard applied to every fixed-width card in kiosk.
  gpCard: { width: 320, maxWidth: '100%', gap: KIOSK_SPACE.sm },
  gpBtn: { alignSelf: 'stretch' },
});
