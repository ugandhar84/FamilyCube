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
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Image, Modal, useWindowDimensions } from 'react-native';
import {
  Plus, PartyPopper, Check, Clock3, Sparkles, History, Target, TriangleAlert,
  CheckCircle2, Camera, RotateCcw, Zap, Trophy, ShieldQuestion, Pencil,
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
import { fmtDateShort, withinLast24h } from '@/lib/dates';
import { showToast } from '@/components/AppToast';
import { KioskQuestEditor } from '../components/KioskQuestEditor';
import { WidgetCard, WidgetHeader, PanelHead, Well, Chip, TabTitle, ActionButton, EmptyNote, KioskExpandableCard } from '../components/KioskOS';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import { useKioskAskParent } from '../components/KioskAskParentFlow';
import { KioskKidCheerList } from '../components/KioskKidQuickActions';
import { KioskCantDoThisDialog } from '../components/KioskCantDoThisDialog';
import { KioskRedoReasonDialog } from '../components/KioskRedoReasonDialog';
import { GpOfferReviewCard } from '@/features/hub/parent/GpOfferReviewCard';
import { CreateQuestModal } from '@/features/hub/senior/CreateQuestModal';
import { KioskAiChoresEngine } from '../components/KioskAiChoresEngine';
import { KioskChoreHistorySheet } from '../components/KioskChoreHistorySheet';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
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
  // Two-column layout, matching KioskOverviewTab.tsx's own real
  // twoColRow/centerCol/sideCol split exactly (same 1080px breakpoint,
  // same stack-below-it behavior) — visual-polish pass only, per explicit
  // direction to give this tab Overview's own look. "Who has what" and a
  // new real coin-balance panel move into the sidebar; every other zone
  // stays in the main column, unchanged in content or logic.
  const { width: winWidth } = useWindowDimensions();
  const isNarrowBoardLayout = winWidth < 1080;
  const { quests, claimQuest, submitQuest, approveQuest, declineQuest, reopenQuest } = useQuestStore();
  const isActiveApprover = useTemporaryApproverStore(s => s.isActiveApprover(active.id));
  const giveBackChore = useChoreStore(s => s.giveBackChore);
  const startGrandparentQuest = useChoreStore(s => s.startGrandparentQuest);
  // A multi-slot bounty's per-claim submissions [GAP — audit A2/A3, the
  // same real feature entered from two angles: QuestCard.tsx's inline
  // per-participant approve/decline row IS this same chore.claims data
  // (confirmed: choreAdapter.ts's approveParticipant/declineParticipant
  // route straight to approveBountyClaim/declineBountyClaim, not a
  // separate system) — live entirely in chore.claims, never touching the
  // parent chore's own status, so KioskBoardView's own pending_approval
  // column can't see them at all. Same real derivation
  // ParentReviewDeck.tsx's own pendingBountyClaims uses.
  const chores = useChoreStore(s => s.chores);
  const approveBountyClaim = useChoreStore(s => s.approveBountyClaim);
  const declineBountyClaim = useChoreStore(s => s.declineBountyClaim);
  const pendingBountyClaims = useMemo(() => chores.flatMap(c =>
    (c.claims ?? []).filter(cl => cl.status === 'pending_approval').map(cl => ({ chore: c, claim: cl })),
  ), [chores]);
  // Cash-out approval [GAP — audit A8] — a kid's coin-to-cash conversion
  // request, entirely absent from this board (which only ever reads
  // `quests`/`chores`, never PointTransaction rows at all).
  const getPendingCashOuts = useChoreStore(s => s.getPendingCashOuts);
  const approveCashOut = useChoreStore(s => s.approveCashOut);
  const denyCashOut = useChoreStore(s => s.denyCashOut);
  const pointsToFiatRatio = useChoreStore(s => s.householdSettings.pointsToFiatRatio);
  const currencySymbol = useChoreStore(s => s.householdSettings.currencySymbol);
  const transactions = useChoreStore(s => s.transactions);
  const pendingCashOuts = useMemo(() => getPendingCashOuts(), [getPendingCashOuts, transactions]);
  // GP-offer review [GAP — audit A9] — a chore at raw status
  // 'gp_offer_pending' (a grandparent offered to handle an openToGP
  // chore; nothing is assigned yet). deriveQuestActions.canApprove
  // explicitly EXCLUDES these (its own gpOnlyReview guard) specifically
  // so a normal Approve button never renders for them — this board never
  // checked raw chore status at all, so such a chore would either
  // silently vanish or render a dead Approve button.
  const acceptGPOffer = useChoreStore(s => s.acceptGPOffer);
  const declineGPOffer = useChoreStore(s => s.declineGPOffer);
  const gpOffersPending = useMemo(() => chores.filter(c => c.status === 'gp_offer_pending'), [chores]);
  const [redoTargetBoard, setRedoTargetBoard] = useState<{ id: string; title: string } | null>(null);
  // Photo-proof viewer [GAP — audit A13] — read-only tap-to-enlarge for an
  // already-submitted proof photo. No camera needed (kiosk's own real
  // camera-capture punt for SUBMITTING a photo stays as-is — this is only
  // about VIEWING one someone already submitted), same real full-screen
  // Modal shape SubmitQuestSheet.tsx's own proofPhotoViewerUri uses.
  const [proofPhotoViewerUri, setProofPhotoViewerUri] = useState<string | null>(null);
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
    // A GP-submitted receipt [GAP — audit A7] — real ChoreTask-native
    // fields (receiptPhotoUrl/receiptAmount/receiptNote/receiptReimbursedAt)
    // that don't exist on the Quest shim at all, so this card had zero way
    // to show one even existed. Same real chores lookup pendingBountyClaims
    // above already established for this file.
    const rawChore = chores.find(c => c.id === q.id);
    const hasReceipt = !!rawChore?.receiptPhotoUrl || rawChore?.receiptAmount != null;
    const receiptReimbursed = !!rawChore?.receiptReimbursedAt;
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
                <Text style={{ fontSize: 18 }}>{catMeta.emoji}</Text>
              </View>
              <Text style={[s.cardTitle, { color: k.text, flex: 1 }]} numberOfLines={2}>{q.title}</Text>
              {/* Filled rather than wash — coins are the headline reward on
                  a chore card, not a status label, so this one chip earns
                  the bolder treatment every other status pill deliberately
                  avoids (see badgeRow's own comment on why THOSE stay
                  outlined). Visual-polish pass only, same real q.coins
                  value. */}
              {!isAdultAssignee && (
                <Chip label={`${q.coins} 🪙`} accent={k.gold} isDark={kioskDark} k={k} filled />
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
              {/* Text label added [live-reported: "don't see view
                  details"] — icon-only with no visible text didn't read
                  as a details/history affordance while scanning a
                  collapsed board, even though the real full-log sheet it
                  opens was already there and correctly wired. */}
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
                <Text style={[s.historyBtnText, { color: k.textMuted }]}>Details</Text>
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

        {/* ── Edited-by notice [GAP — audit A12] ─────────────────────── */}
        {!!q.lastModifiedById && (
          <View style={s.editedByRow}>
            <Pencil size={10} color={k.textFaint} />
            <Text style={[s.editedByText, { color: k.textFaint }]} numberOfLines={1}>
              edited by {memberOf(q.lastModifiedById)?.name ?? 'parent'}
            </Text>
          </View>
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

        {/* ── Photo-proof thumbnail [GAP — audit A13] ─────────────────
            Read-only tap-to-enlarge for a photo the kid already
            submitted — a parent reviewing on kiosk had no way to see it
            before tapping Approve. Submitting a NEW photo still stays a
            phone-only action (no camera flow on kiosk) — this is purely
            about viewing one that already exists. */}
        {!!q.photoUrl && (
          <Pressable onPress={() => setProofPhotoViewerUri(q.photoUrl!)} style={s.photoThumbWrap} accessibilityRole="imagebutton" accessibilityLabel={`View submitted photo for ${q.title}`}>
            <Image source={{ uri: q.photoUrl }} style={s.photoThumb} resizeMode="cover" />
            <View style={s.photoThumbTag}>
              <Text style={s.photoThumbTagText}>Tap to enlarge</Text>
            </View>
          </Pressable>
        )}
        {q.photoRequired && !q.photoUrl && q.status !== 'todo' && (
          <View style={[s.photoMissingBox, { backgroundColor: k.goldSoft }]}>
            <Camera size={22} color={k.gold} />
            <Text style={[s.photoMissingText, { color: k.gold }]}>Photo proof missing</Text>
          </View>
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

        {/* ── GP receipt / reimbursement [GAP — audit A7] ────────────────
            Same real block ParentReviewDeck.tsx's own ReviewCard shows
            (photo, amount, note, Mark Reimbursed) — was entirely absent
            from this board's own chore cards. Parent-only action;
            everyone can see the receipt was submitted and whether it's
            been paid back. */}
        {hasReceipt && (
          <View style={[s.receiptBox, { borderColor: receiptReimbursed ? k.sageEdge : k.goldEdge, backgroundColor: receiptReimbursed ? k.sageSoft : k.goldSoft }]}>
            <View style={s.receiptHeaderRow}>
              <Text style={{ fontSize: 16 }}>🧾</Text>
              <Text style={[s.receiptHeaderText, { color: receiptReimbursed ? k.sage : k.gold, flex: 1 }]} numberOfLines={1}>
                {receiptReimbursed ? 'Receipt reimbursed ✓' : 'GP submitted a receipt'}
              </Text>
              {rawChore?.receiptAmount != null && (
                <View style={[s.receiptAmountPill, { backgroundColor: receiptReimbursed ? k.sage : k.gold }]}>
                  <Text style={s.receiptAmountText}>${rawChore.receiptAmount.toFixed(2)}</Text>
                </View>
              )}
            </View>
            {!!rawChore?.receiptPhotoUrl && (
              <Image source={{ uri: rawChore.receiptPhotoUrl }} style={s.receiptPhoto} resizeMode="cover" />
            )}
            {!!rawChore?.receiptNote && (
              <Text style={[s.receiptNote, { color: k.textMuted }]} numberOfLines={3}>"{rawChore.receiptNote}"</Text>
            )}
            {!receiptReimbursed && isParent && (
              <ActionButton
                label="💳 Mark Reimbursed" accent={k.gold} k={k} isDark={kioskDark} variant="solid"
                style={s.receiptBtn}
                accessibilityHint={`Confirm you've reimbursed the receipt on ${q.title}`}
                onPress={() => {
                  registerActivity();
                  const memberLabel = memberOf(q.assignedToId)?.name?.split(' ')[0] ?? 'the helper';
                  Alert.alert(
                    'Mark as Reimbursed?',
                    rawChore?.receiptAmount != null
                      ? `Confirm you've paid $${rawChore.receiptAmount.toFixed(2)} back to ${memberLabel}.`
                      : `Confirm you've reimbursed ${memberLabel} for this receipt.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: '💳 Reimbursed', onPress: () => useChoreStore.getState().acknowledgeGPReimbursement(q.id) },
                    ],
                  );
                }}
              />
            )}
          </View>
        )}

        {/* ── Named handoff — receiver's offer banner [GAP — audit A10] ──
            Someone handed this chore directly to q.pendingHandoffTo (via
            offerChoreHandoff — a real, already-existing store action this
            card just never showed the receiving end of). Display only;
            the real Accept/Pass buttons sit in the action row below,
            matching QuestCard.tsx's own split between this banner and its
            action-row buttons exactly. */}
        {q.pendingHandoffTo === active.id && (
          <View style={[s.noticeBanner, { backgroundColor: k.primarySoft, borderColor: k.primaryEdge }]}>
            <Text style={[s.noticeTitle, { color: k.primary }]} numberOfLines={1}>
              {memberName(q.pendingHandoffOfferedBy) ?? 'Someone'} wants to hand you this
            </Text>
            {!!q.pendingHandoffReason && (
              <Text style={[s.noticeText, { color: k.textMuted }]} numberOfLines={2}>"{q.pendingHandoffReason}"</Text>
            )}
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
        ) : q.pendingHandoffTo === active.id ? (
          // ── Named handoff receiver: Accept/Pass [GAP — audit A10] ────
          // Same real store actions (acceptChoreHandoff/
          // declineChoreHandoff) QuestCard.tsx's own action row calls for
          // this exact case — "I've got it" takes the chore on, "Can't
          // either" declines and puts it back, no reason required (the
          // offering person already gave one, if any, in the banner above).
          <View style={s.actionRow}>
            <ActionButton
              label="I've got it"
              Icon={Check}
              accent={k.sage}
              k={k}
              isDark={kioskDark}
              variant="solid"
              style={s.actionPrimary}
              accessibilityHint={`Accept the handoff of ${q.title}`}
              onPress={() => { registerActivity(); useChoreStore.getState().acceptChoreHandoff(q.id, active.id); showToast('Accepted ✓'); }}
            />
            <ActionButton
              label="Can't either"
              accent={k.danger}
              k={k}
              isDark={kioskDark}
              variant="soft"
              style={s.actionSecondary}
              accessibilityHint={`Decline the handoff of ${q.title}`}
              onPress={() => { registerActivity(); useChoreStore.getState().declineChoreHandoff(q.id, active.id); showToast('Passed — back with the parent ✓'); }}
            />
          </View>
        ) : actions.canAcceptGp ? (
          // ── GP-quest accept/decline [GAP — audit finding A5] ─────────
          // A kid/teen assigned a grandparent_quest still at status:'todo'
          // must explicitly accept before it moves to in-progress — the
          // phone's own KidQuestCard.tsx (its isGpTodo branch) offers
          // "I'll take it"/"Decline" here, distinct from the generic
          // canSubmit "Mark Done" path this card used to fall through to
          // (which skipped the accept step entirely). Decline routes
          // through the SAME real dispatch the phone's own KidView.tsx
          // uses for this exact case (setDeclineQuest -> CantMakeItSheet
          // -> resolveCantMakeIt) — the identical one-step kiosk dialog
          // canKidDecline already reuses below, not a new one.
          <View style={s.actionRow}>
            <ActionButton
              label="I'll take it"
              Icon={Sparkles}
              accent={k.sage}
              k={k}
              isDark={kioskDark}
              variant="solid"
              style={s.actionPrimary}
              accessibilityHint={`Accept ${q.title}`}
              onPress={() => { registerActivity(); startGrandparentQuest(q.id, active.id); showToast(`Accepted "${q.title}" ✓`); }}
            />
            <ActionButton
              label="Decline"
              accent={k.danger}
              k={k}
              isDark={kioskDark}
              variant="soft"
              style={s.actionSecondary}
              accessibilityHint={`Give a reason and decline ${q.title}`}
              onPress={() => { registerActivity(); setDeclineTarget({ id: q.id, title: q.title }); }}
            />
          </View>
        ) : (btn || actions.canKidDecline || actions.canGiveBack || (actions.canApprove && !!q.assignedToId) || actions.canReopen) ? (
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
            {/* ── Parent Redo, paired with Approve [GAP — audit finding
                A1] ────────────────────────────────────────────────────
                The board's own canApprove branch (primaryAction, above)
                rendered ONLY Approve — a kiosk parent had no way to send
                a submission back with a reason, unlike the phone's own
                QuestCard.tsx, which renders Approve and "↩ Redo" side by
                side. Same real dispatch DeclineModal.tsx's own onConfirm
                uses (declineQuest -> choreStore.requestRedo), reused via
                choreAdapter exactly as the phone form does — no new
                store logic, only the missing UI path to reach it. */}
            {actions.canApprove && !!q.assignedToId && (
              <ActionButton
                label="Redo"
                Icon={RotateCcw}
                accent={k.gold}
                k={k}
                isDark={kioskDark}
                variant="soft"
                style={s.actionSecondary}
                accessibilityHint={`Send ${q.title} back for a redo, with a reason`}
                onPress={() => { registerActivity(); setRedoTargetBoard({ id: q.id, title: q.title }); }}
              />
            )}
            {/* Reopen — deriveQuestActions.canReopen (isParentOrSenior &&
                declined) [fresh-audit finding]. The real reopenQuest store
                action + this exact condition both exist and work on the
                phone, but QuestsScreen.tsx defines a full handleReopen
                handler and never wires it to any button — genuinely
                unreachable there. Built here anyway per explicit
                direction: it's a real, safe, working action underneath
                (reopenQuest just resets status back to 'todo', clearing
                redoCount/rejectionReason), just one the phone's own UI
                never surfaced. */}
            {actions.canReopen && (
              <ActionButton
                label="Reopen"
                Icon={RotateCcw}
                accent={k.textMuted}
                k={k}
                isDark={kioskDark}
                variant="soft"
                style={btn ? s.actionSecondary : s.actionPrimary}
                accessibilityHint={`Reopen ${q.title} so it can be tried again`}
                onPress={() => { registerActivity(); reopenQuest(q.id, active.id); showToast(`Reopened "${q.title}" ✓`); }}
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
            {/* ── Give it back [GAP — audit finding A4] ─────────────────
                Lighter-weight than "Can't do this" — a kid who
                self-claimed a pool chore but hasn't started it yet gets a
                no-reason-required undo alongside (not instead of) the
                heavier Can't-Make-It flow, matching QuestCard.tsx's own
                real canGiveBack/canKidDecline pairing. Never shown
                alongside canKidDecline for the SAME chore in practice —
                canGiveBack requires claimedAt (a genuine self-claim),
                canKidDecline requires !isPool (already assigned) — but
                both read from real, independent flags rather than one
                being derived from the other, matching the phone's own
                shape exactly. */}
            {actions.canGiveBack && !actions.canKidDecline && (
              <ActionButton
                label="Give it back"
                accent={k.textMuted}
                k={k}
                isDark={kioskDark}
                variant="soft"
                style={s.actionSecondary}
                accessibilityHint={`Put ${q.title} back up for grabs, no reason needed`}
                onPress={() => { registerActivity(); giveBackChore(q.id, active.id); showToast('Given back ✓'); }}
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

      <View style={[s.twoColRow, isNarrowBoardLayout && s.twoColRowStacked]}>
      <View style={[s.centerCol, isNarrowBoardLayout && s.colFullWidth]}>

      {/* ── CubeAI Chores Engine [GAP — audit D3] ───────────────────────
          Same real AutoBalance/Spark/Advice engine the phone's own
          Chores toolbar always shows — entirely absent from kiosk
          before this (confirmed via grep: zero references anywhere in
          this file to AiEngineBanner/AiTool/AutoBalanceCard/FomoCard/
          AdviceCard/callAutoBalance/callFomo/callAdvice/family-ai).
          Parent-only, matching QuestsScreen.tsx's own isParent gate. */}
      {isParent && (
        <View style={s.aiBannerRow}>
          <KioskAiChoresEngine
            quests={filteredQuests}
            kids={members.filter(m => m.role === 'kid' || m.role === 'teen')}
            activeMemberId={active.id}
            colors={colors}
            isDark={isDark}
          />
        </View>
      )}

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

      {/* ── Zone 1.5: Bounty claims needing review [GAP — audit A2/A3] ──
          Same real card content ParentReviewDeck.tsx's own
          BountyClaimReviewCard has (submitted photo, child's note, the
          same real coin figure) — a review surface KioskBoardView had
          zero visibility into at all, since these claims never touch the
          parent chore's own status the rest of this board keys off. */}
      {isParent && pendingBountyClaims.length > 0 && (
        <WidgetCard k={k} isDark={kioskDark} accent={k.primary} style={s.zone}>
          <WidgetHeader
            Icon={Trophy} eyebrow="Bounty" title="Claims needing review"
            accent={k.primary} k={k} isDark={kioskDark}
            right={<Chip label={`${pendingBountyClaims.length}`} accent={k.primary} isDark={kioskDark} k={k} />}
          />
          <View style={s.gpGrid}>
            {pendingBountyClaims.map(({ chore, claim }) => {
              const child = members.find(m => m.id === claim.memberId);
              const coins = (chore.basePoints > 0 ? chore.basePoints : chore.coinsReward) + (chore.bonusCoins ?? 0);
              return (
                <Well key={`${chore.id}:${claim.memberId}`} k={k} accent={k.primary} style={s.claimCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs }}>
                    {!!child && (
                      <Text style={[s.cardSub, { color: k.textMuted, flex: 1 }]} numberOfLines={1}>{child.name.split(' ')[0]}</Text>
                    )}
                    <Chip label={`+${coins} 🪙`} accent={k.gold} isDark={kioskDark} k={k} filled />
                  </View>
                  <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={2}>{chore.title}</Text>
                  {!!claim.submissionPhotoUrl && (
                    <Image source={{ uri: claim.submissionPhotoUrl }} style={s.claimPhoto} resizeMode="cover" />
                  )}
                  {chore.requiresPhotoProof && !claim.submissionPhotoUrl && (
                    <Text style={[s.cardSub, { color: k.gold }]} numberOfLines={2}>⚠️ No photo submitted — photo was required</Text>
                  )}
                  {!!claim.submissionNote && (
                    <View style={[s.claimNoteBox, { backgroundColor: k.well }]}>
                      <Text style={[s.claimNoteLabel, { color: k.textFaint }]}>CHILD'S NOTE</Text>
                      <Text style={[s.cardSub, { color: k.textMuted }]}>{claim.submissionNote}</Text>
                    </View>
                  )}
                  <View style={s.gpBtnRow}>
                    <ActionButton
                      label="Decline" accent={k.danger} k={k} isDark={kioskDark} variant="soft"
                      style={s.gpBtnSecondary}
                      accessibilityHint={`Decline ${child?.name?.split(' ')[0] ?? 'this'}'s claim on ${chore.title}`}
                      onPress={() => {
                        registerActivity();
                        Alert.alert('Decline this claim?', `${child?.name?.split(' ')[0] ?? 'This claimant'}'s slot goes back for a redo.`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Decline', style: 'destructive', onPress: () => declineBountyClaim(chore.id, claim.memberId, active.id) },
                        ]);
                      }}
                    />
                    <ActionButton
                      label="Approve" Icon={Check} accent={k.sage} k={k} isDark={kioskDark} variant="solid"
                      style={s.gpBtn}
                      accessibilityHint={`Approve ${child?.name?.split(' ')[0] ?? 'this'}'s claim on ${chore.title}`}
                      onPress={() => { registerActivity(); approveBountyClaim(chore.id, claim.memberId, active.id); showToast('Approved ✓'); }}
                    />
                  </View>
                </Well>
              );
            })}
          </View>
        </WidgetCard>
      )}

      {/* ── Zone 1.6: Cash-out approval [GAP — audit A8] ──────────────
          Same real card ParentReviewDeck.tsx's own CashOutCard has (the
          Spend/Save/Give allocation breakdown, the real currency
          conversion) — entirely absent before, since this board only
          ever read quests/chores, never PointTransaction rows. */}
      {isParent && pendingCashOuts.length > 0 && (
        <WidgetCard k={k} isDark={kioskDark} accent={k.sage} style={s.zone}>
          <WidgetHeader
            Icon={Check} eyebrow="Real money" title="Cash-out requests"
            accent={k.sage} k={k} isDark={kioskDark}
            right={<Chip label={`${pendingCashOuts.length}`} accent={k.sage} isDark={kioskDark} k={k} />}
          />
          <View style={s.gpGrid}>
            {pendingCashOuts.map(req => {
              const member = members.find(m => m.id === req.userId);
              return (
                <Well key={req.id} k={k} accent={k.sage} style={s.claimCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs }}>
                    <Text style={[s.cardSub, { color: k.textMuted, flex: 1 }]} numberOfLines={1}>
                      {member?.name?.split(' ')[0] ?? req.userId} · Cash-Out Request
                    </Text>
                    <Text style={[s.cashOutTotal, { color: k.sage }]}>
                      {currencySymbol}{(req.amount * pointsToFiatRatio).toFixed(2)}
                    </Text>
                  </View>
                  <View style={[s.cashOutBreakdown, { backgroundColor: k.well }]}>
                    {([
                      { l: '🛍️ Spend', v: req.spendAllocation },
                      { l: '🏦 Save', v: req.saveAllocation },
                      { l: '❤️ Give', v: req.giveAllocation },
                    ] as const).map(j => (
                      <View key={j.l} style={{ flexDirection: 'row' }}>
                        <Text style={[s.cardSub, { color: k.textMuted, flex: 1 }]}>{j.l}</Text>
                        <Text style={[s.cashOutLine, { color: k.sage }]}>
                          {j.v} pts ({currencySymbol}{(j.v * pointsToFiatRatio).toFixed(2)})
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.gpBtnRow}>
                    <ActionButton
                      label="Deny" accent={k.danger} k={k} isDark={kioskDark} variant="soft"
                      style={s.gpBtnSecondary}
                      accessibilityHint="Deny this cash-out request"
                      onPress={() => {
                        registerActivity();
                        Alert.alert('Deny Cash-Out?', 'Funds stay in their wallet.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Deny', style: 'destructive', onPress: () => denyCashOut(req.id) },
                        ]);
                      }}
                    />
                    <ActionButton
                      label="💵 Approve Payout" accent={k.sage} k={k} isDark={kioskDark} variant="solid"
                      style={s.gpBtn}
                      accessibilityHint="Approve this cash-out payout"
                      onPress={() => { registerActivity(); approveCashOut(req.id); showToast('Payout approved ✓'); }}
                    />
                  </View>
                </Well>
              );
            })}
          </View>
        </WidgetCard>
      )}

      {/* ── Zone 1.7: Grandparent offers [GAP — audit A9] ──────────────
          GpOfferReviewCard is a real, standalone-exported component
          (features/hub/parent/GpOfferReviewCard.tsx) — mounted directly,
          not re-implemented, matching this file's own established
          pattern of reusing real shared-phone components (SmartTaskComposer,
          AddQuestModal) with the phone colors prop threaded through. */}
      {isParent && gpOffersPending.length > 0 && (
        <WidgetCard k={k} isDark={kioskDark} accent={k.sage} style={s.zone}>
          <WidgetHeader
            Icon={Sparkles} eyebrow="Waiting on you" title="Grandparent offers"
            accent={k.sage} k={k} isDark={kioskDark}
            right={<Chip label={`${gpOffersPending.length}`} accent={k.sage} isDark={kioskDark} k={k} />}
          />
          <View style={s.gpGrid}>
            {gpOffersPending.map(c => (
              <View key={c.id} style={s.claimCard}>
                <GpOfferReviewCard
                  c={c} members={members} colors={colors} isDark={isDark} active={active}
                  acceptGPOffer={(choreId, parentId) => { registerActivity(); acceptGPOffer(choreId, parentId); showToast('Offer accepted ✓'); }}
                  declineGPOffer={(choreId, parentId, reason) => { registerActivity(); declineGPOffer(choreId, parentId, reason); }}
                />
              </View>
            ))}
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

      </View>

      {/* ── Sidebar — matching KioskOverviewTab.tsx's own sideCol
          (Coin Jars etc). "Who has what" relocated here from the main
          column (same real kidStats data, unchanged), plus a new real
          coin-balance panel using the exact same jar-row pattern Overview
          uses for its own Coin Jars widget (mainCoins + gpCoins off each
          real FamilyMember — no invented numbers). Parent-facing only,
          same as the roster always was. */}
      <View style={[s.sideCol, isNarrowBoardLayout && s.colFullWidth]}>
        {isParent && kidStats.length > 0 && (
          <WidgetCard k={k} isDark={kioskDark}>
            <PanelHead title="Who has what" k={k} />
            {kidStats.map(({ member, open, total }, i) => {
              const rs = assigneeStyle(member, colors, isDark);
              const done = total - open;
              const clear = open === 0;
              return (
                <View
                  key={member.id}
                  style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                  accessibilityLabel={`${member.name.split(' ')[0]}: ${done} of ${total} chores done`}
                >
                  <View style={[s.jarAvatar, { backgroundColor: rs.badge, borderColor: rs.dot, borderWidth: 1.5 }]}>
                    <Text style={{ fontSize: 15 }}>{member.emoji ?? '👤'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>{member.name.split(' ')[0]}</Text>
                    <Text style={[s.jarMeta, { color: k.textFaint }]} numberOfLines={1}>
                      {clear ? 'All done' : `${done}/${total} chores`}
                    </Text>
                  </View>
                  <Text style={[s.jarAmt, { color: clear ? k.sage : rs.dot }]} numberOfLines={1}>
                    {clear ? '✓' : `${open}`}
                  </Text>
                </View>
              );
            })}
          </WidgetCard>
        )}

        {/* Real coin balance — mainCoins + gpCoins off each real
            FamilyMember, same fields/formula KioskOverviewTab.tsx's own
            Coin Jars widget uses. Genuinely new content (no equivalent
            existed anywhere on this tab before), not a mobile-parity
            port — purely this visual pass's own addition. */}
        {isParent && kidStats.length > 0 && (
          <WidgetCard k={k} isDark={kioskDark}>
            <PanelHead title="Coin balance" k={k} />
            {kidStats.map(({ member }, i) => {
              const rs = assigneeStyle(member, colors, isDark);
              const total = ((member as any).mainCoins ?? 0) + ((member as any).gpCoins ?? 0);
              return (
                <View
                  key={member.id}
                  style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                >
                  <View style={[s.jarAvatar, { backgroundColor: rs.badge, borderColor: rs.dot, borderWidth: 1.5 }]}>
                    <Text style={{ fontSize: 15 }}>{member.emoji ?? '👤'}</Text>
                  </View>
                  <Text style={[s.jarName, { color: k.text, flex: 1 }]} numberOfLines={1}>{member.name.split(' ')[0]}</Text>
                  <Text style={[s.jarAmt, { color: k.gold }]} numberOfLines={1}>🪙 {total}</Text>
                </View>
              );
            })}
          </WidgetCard>
        )}
      </View>

      </View>

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

      <KioskRedoReasonDialog
        visible={!!redoTargetBoard}
        choreTitle={redoTargetBoard?.title ?? ''}
        k={k}
        onClose={() => setRedoTargetBoard(null)}
        onSend={(reason) => {
          if (!redoTargetBoard) return;
          declineQuest(redoTargetBoard.id, active.id, reason, 'custom');
          showToast('Sent back for a redo ✓');
        }}
      />

      {/* Full-screen photo-proof viewer [GAP — audit A13] — same real
          near-black-scrim, tap-anywhere-to-close shape
          SubmitQuestSheet.tsx's own proofPhotoViewerUri Modal uses. */}
      <Modal
        visible={!!proofPhotoViewerUri}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setProofPhotoViewerUri(null)}
      >
        <Pressable style={s.photoViewerScrim} onPress={() => setProofPhotoViewerUri(null)} accessibilityRole="button" accessibilityLabel="Close photo">
          {!!proofPhotoViewerUri && (
            <Image source={{ uri: proofPhotoViewerUri }} style={s.photoViewerImage} resizeMode="contain" />
          )}
          <View style={s.photoViewerCloseTag}>
            <Text style={s.photoViewerCloseText}>Close ✕</Text>
          </View>
        </Pressable>
      </Modal>

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
  const { quests, claimQuest, submitQuest, approveQuest, updateQuest } = useQuestStore();
  const cheerChore = useChoreStore(s => s.cheerChore);
  const chores = useChoreStore(s => s.chores);

  const kids = members.filter(m => m.role === 'kid' || m.role === 'teen');
  // CreateQuestModal's own real scope (SeniorView.tsx's own `kids`,
  // role==='kid' only) — narrower than the kid+teen `kids` above, which
  // serves other, wider purposes here (cheering, GP-pool). Not
  // interchangeable — a grandparent sponsoring a chore for a specific
  // grandkid picks from the same kid-only list the real phone form does.
  const sponsorableKids = members.filter(m => m.role === 'kid');

  // ── Sponsor a Chore [fresh-audit gap] ─────────────────────────────────
  // A grandparent standing at kiosk had NO way to sponsor/create a
  // grandparent quest at all — confirmed via grep, zero references to
  // CreateQuestModal/createGrandparentQuest/Sponsor anywhere in
  // features/kiosk/ before this. QuestsScreen.tsx's own isSenior-gated
  // "Sponsor Chore" toolbar button opens the exact same real
  // CreateQuestModal + createGrandparentQuest flow SeniorView.tsx's own
  // Hub-side sponsor button uses (that file's own comment: "same
  // CreateQuestModal + createGrandparentQuest flow as the Hub's 'Sponsor a
  // Quest', so both entry points produce the exact same safe, two-gate
  // quest") — reused directly here as this view's own third entry point,
  // same real component, same real store call, verbatim state shape from
  // QuestsScreen.tsx's own handleCreateSponsorQuest.
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  const [newQuestMode, setNewQuestMode] = useState<'local' | 'virtual'>('local');
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [newQuestDesc, setNewQuestDesc] = useState('');
  const [newQuestPoints, setNewQuestPoints] = useState('350');
  const [newQuestKidIds, setNewQuestKidIds] = useState<string[]>([]);
  const [newQuestPhoto, setNewQuestPhoto] = useState(true);
  const handleCreateSponsorQuest = () => {
    if (!newQuestTitle.trim()) return;
    useChoreStore.getState().createGrandparentQuest({
      title: newQuestTitle.trim(),
      description: newQuestDesc.trim() || undefined,
      basePoints: parseInt(newQuestPoints, 10) || 350,
      childIds: newQuestKidIds,
      sponsorId: active.id,
      mode: newQuestMode,
      requiresPhoto: newQuestPhoto,
    });
    setNewQuestTitle('');
    setNewQuestDesc('');
    setNewQuestPoints('350');
    setNewQuestKidIds([]);
    setNewQuestMode('local');
    setNewQuestPhoto(true);
    setShowSponsorModal(false);
  };

  // Real SeniorView.tsx filter: ['approved','auto_approved','completed']
  // on the raw ChoreTask.status — choreAdapter.ts's own translation maps
  // auto_approved→'approved' and completed→'done' onto this Quest shim,
  // so ['approved','done'] here is already the correct equivalent (not a
  // gap by itself). What WAS genuinely missing: the real 24h window
  // ("today's finished grandkid chores... the point is the pending
  // action, not a history feed") — this used to show cheer-eligible
  // chores indefinitely. Real fallback chain is approvedAt ?? reviewedAt
  // ?? createdAt (raw ChoreTask fields) — neither reviewedAt nor createdAt
  // exists on this Quest shim, so approvedAt ?? completedAt ?? claimedAt
  // substitutes the closest real always-set-on-completion timestamps this
  // shape actually has.
  const kidsCheerable = useMemo(() => quests.filter(q => {
    if (!['approved', 'done'].includes(q.status)) return false;
    if (!q.assignedToId || !kids.some(k => k.id === q.assignedToId)) return false;
    if ((q.cheers ?? []).some(c => c.memberId === active.id)) return false;
    return withinLast24h(q.approvedAt ?? q.completedAt ?? q.claimedAt);
  }), [quests, kids, active.id]);

  const myGpQuestsOpen = useMemo(() => quests.filter(q =>
    q.questType === 'grandparent_quest' && q.status === 'todo' && !q.assignedToId
  ), [quests]);
  const myGpQuestsAssigned = useMemo(() => quests.filter(q =>
    q.questType === 'grandparent_quest' && q.assignedToId === active.id &&
    ['claimed', 'in_progress'].includes(q.status)
  ), [quests]);
  // Real deriveCardActions.ts's own gpOnlyReview guard on canApprove
  // [fresh-audit wiring bug]: choreAdapter.ts's translation collapses BOTH
  // raw 'pending_grandparent_approval' and 'gp_offer_pending' onto this
  // Quest shim's 'pending_approval' status, so a plain q.status ===
  // 'pending_approval' filter can't tell a real "any grandparent can
  // approve this" item from a GP-only-review one meant for a different
  // flow entirely (the sponsoring grandparent's own Accept/Decline). The
  // write itself is safe either way — choreStore.approveChore no-ops
  // unless the RAW status is exactly 'pending_approval' — but tapping
  // "Approve" on a GP-only item did nothing at all, a dead button with no
  // visible effect. Excluded here the same way deriveCardActions.ts does.
  const gpOnlyReviewChoreIds = useMemo(
    () => new Set(chores.filter(c => c.status === 'pending_grandparent_approval' || c.status === 'gp_offer_pending').map(c => c.id)),
    [chores],
  );
  const pendingReview = useMemo(
    () => quests.filter(q => q.status === 'pending_approval' && !gpOnlyReviewChoreIds.has(q.id)),
    [quests, gpOnlyReviewChoreIds],
  );
  // ── GP-Welcome pool: Pass/Reconsider/Backout/Done [GAP — audit A6] ──────
  // Distinct from myGpQuestsOpen/myGpQuestsAssigned above (this grandparent's
  // OWN sponsored quests for kids) — this is the reverse: ordinary family
  // chores a PARENT opened to any grandparent's help (inviteGrandparents),
  // which this view never checked at all (it never called
  // deriveQuestActions anywhere, only its own hand-rolled questType/status
  // filters). Same real gating QuestCard.tsx's own canGpClaimPool/canGpDone
  // branches use (deriveCardActions.ts:144-146), computed per-quest here
  // the same way KioskBoardView already does for its own lanes.
  const gpPoolOpen = useMemo(
    () => quests.filter(q => deriveQuestActions(q, { id: active.id, role: active.role }).canGpClaimPool),
    [quests, active.id, active.role],
  );
  const gpPoolClaimed = useMemo(
    () => quests.filter(q => deriveQuestActions(q, { id: active.id, role: active.role }).canGpDone),
    [quests, active.id, active.role],
  );

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];

  /**
   * One GP card. The three lanes below (cheer / approve / sponsored) all
   * rendered a near-identical card with a different button, so they share
   * one renderer now rather than repeating the markup four times — that
   * repetition is exactly how the four copies drifted apart on padding and
   * numberOfLines in the first place.
   *
   * secondaryBtn is optional — added for the GP-pool zones below (Help/Pass,
   * Backout/Done), which each need two real, independent actions on the
   * same card, matching QuestCard.tsx's own canGpClaimPool/canGpDone
   * button pairs exactly rather than forcing a two-action decision into
   * this shared renderer's original one-button shape.
   */
  const gpCard = (
    q: typeof quests[number],
    opts: {
      sub?: string; label: string; Icon?: typeof Check; accent: string; onPress: () => void; hint: string;
      secondaryBtn?: { label: string; accent: string; onPress: () => void; hint: string };
    },
  ) => (
    <Well key={q.id} k={k} accent={opts.accent} style={s.gpCard}>
      <View style={[s.catBadge, { backgroundColor: (CATEGORY_META[q.category]?.color ?? k.textFaint) + '18' }]}>
        <Text style={{ fontSize: 18 }}>{CATEGORY_META[q.category]?.emoji ?? '📋'}</Text>
      </View>
      <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={2}>{q.title}</Text>
      {!!opts.sub && (
        <Text style={[s.cardSub, { color: k.textMuted }]} numberOfLines={1}>{opts.sub}</Text>
      )}
      <View style={s.gpBtnRow}>
        {!!opts.secondaryBtn && (
          <ActionButton
            label={opts.secondaryBtn.label}
            accent={opts.secondaryBtn.accent}
            k={k}
            isDark={kioskDark}
            variant="soft"
            style={s.gpBtnSecondary}
            accessibilityHint={opts.secondaryBtn.hint}
            onPress={() => { registerActivity(); opts.secondaryBtn!.onPress(); }}
          />
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
      </View>
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
        right={
          <ActionButton
            label="Sponsor Chore"
            Icon={Plus}
            accent={k.sage}
            k={k}
            isDark={kioskDark}
            variant="solid"
            accessibilityHint="Create a chore for a grandkid"
            onPress={() => { registerActivity(); setShowSponsorModal(true); }}
          />
        }
      />

      {/* Real, exported CreateQuestModal + createGrandparentQuest flow —
          same two entry points the phone has (Hub's own Sponsor button,
          QuestsScreen.tsx's toolbar Sponsor Chore button) both produce.
          editing is always false here — kiosk has no equivalent yet of
          re-opening this form to revise an already-created, still-pending
          sponsored quest (that's MySponsoredQuestsSection's own onEdit,
          a separate real gap, not part of this fix). */}
      <CreateQuestModal
        visible={showSponsorModal}
        onClose={() => setShowSponsorModal(false)}
        editing={false}
        kids={sponsorableKids} colors={colors} isDark={isDark}
        newQuestMode={newQuestMode} setNewQuestMode={setNewQuestMode}
        newQuestTitle={newQuestTitle} setNewQuestTitle={setNewQuestTitle}
        newQuestDesc={newQuestDesc} setNewQuestDesc={setNewQuestDesc}
        newQuestPoints={newQuestPoints} setNewQuestPoints={setNewQuestPoints}
        newQuestKidIds={newQuestKidIds} setNewQuestKidIds={setNewQuestKidIds}
        newQuestPhoto={newQuestPhoto} setNewQuestPhoto={setNewQuestPhoto}
        onCreate={handleCreateSponsorQuest}
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

      {/* ── GP-Welcome pool: Help/Pass, Backout/Done [GAP — audit A6] ────
          A family chore a PARENT opened to any grandparent's help — real,
          distinct from "Your sponsored chores" below (this grandparent's
          OWN chores for the kids). Same real Alert.alert confirm-guards
          and store calls QuestCard.tsx's own canGpClaimPool/canGpDone
          branches use. */}
      {gpPoolOpen.length > 0 && (
        <WidgetCard k={k} isDark={kioskDark} style={s.zone}>
          <WidgetHeader
            Icon={PartyPopper} eyebrow="Family asked" title="Help with a family chore"
            accent={k.gold} k={k} isDark={kioskDark}
            right={<Chip label={`${gpPoolOpen.length}`} accent={k.gold} isDark={kioskDark} k={k} />}
          />
          <View style={s.gpGrid}>
            {gpPoolOpen.map(q => {
              const gpAlreadyPassed = (q.gpWithdrawnIds ?? []).includes(active.id);
              return gpCard(q, {
                sub: memberName(q.assignedToId),
                label: gpAlreadyPassed ? '🔄 Reconsider?' : "❤️ I'd Love To Help",
                accent: k.gold,
                hint: q.title,
                onPress: () => {
                  Alert.alert('Help With This?', `Take on "${q.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: "❤️ I'd Love To Help",
                      onPress: () => {
                        useChoreStore.getState().updateChore(q.id, { gpOfferById: undefined } as any);
                        updateQuest(q.id, { assignedToId: active.id, isPool: false, status: 'in_progress' }, active.id);
                        useChoreStore.getState().setGpWithdrawn(q.id, active.id, false);
                        showToast("You're on it ✓");
                      },
                    },
                  ]);
                },
                secondaryBtn: gpAlreadyPassed ? undefined : {
                  label: 'Pass', accent: k.textMuted, hint: `Pass on ${q.title}`,
                  onPress: () => { useChoreStore.getState().setGpWithdrawn(q.id, active.id, true); },
                },
              });
            })}
          </View>
        </WidgetCard>
      )}

      {gpPoolClaimed.length > 0 && (
        <WidgetCard k={k} isDark={kioskDark} accent={k.sage} style={s.zone}>
          <WidgetHeader
            Icon={Check} eyebrow="You're helping" title="Family chores you claimed"
            accent={k.sage} k={k} isDark={kioskDark}
            right={<Chip label={`${gpPoolClaimed.length}`} accent={k.sage} isDark={kioskDark} k={k} />}
          />
          <View style={s.gpGrid}>
            {gpPoolClaimed.map(q => gpCard(q, {
              sub: memberName(q.assignedToId),
              label: 'Done', accent: k.sage, hint: `Mark ${q.title} done`,
              onPress: () => { useChoreStore.getState().completeGpWelcomeChore(q.id, active.id); },
              secondaryBtn: {
                label: 'Backout', accent: k.danger, hint: `Give ${q.title} back to the pool`,
                onPress: () => {
                  Alert.alert('Give This Back?', `"${q.title}" will go back to the open pool for any grandparent to pick up.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Backout', style: 'destructive', onPress: () => { useChoreStore.getState().backoutGpWelcomeChore(q.id, active.id); } },
                  ]);
                },
              },
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
  // Deliberately NO borderRadius override — WidgetCard's own shared
  // default (KIOSK_RADIUS.sm) is what Overview uses everywhere too (that
  // file never overrides it either); matching Overview's real radius
  // means leaving this alone, not adopting a rounder one-off shape.
  zone: { marginBottom: KIOSK_SPACE.md },

  // ── Two-column layout, matching KioskOverviewTab.tsx's own real
  // twoColRow/centerCol/sideCol/colFullWidth values exactly (same 1080px
  // breakpoint, same stack-below-it behavior) — visual-polish pass only.
  twoColRow: { flexDirection: 'row', gap: KIOSK_SPACE.md, alignItems: 'flex-start' },
  twoColRowStacked: { flexDirection: 'column' },
  colFullWidth: { flex: undefined, width: '100%' },
  centerCol: { flex: 1, gap: KIOSK_SPACE.md, minWidth: 0 },
  sideCol: { flex: undefined, width: 340, gap: KIOSK_SPACE.md, minWidth: 0 },

  // ── Sidebar jar-row, matching KioskOverviewTab.tsx's own Coin Jars
  // jarRow/jarAvatar/jarName/jarMeta/jarAmt exactly.
  jarRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  jarAvatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  jarName: { fontSize: 13.5, fontWeight: '700' },
  jarMeta: { fontSize: 11.5, marginTop: 2 },
  jarAmt: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },

  // ── Filter bar ────────────────────────────────────────────────────────
  filterBar: { gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md },
  aiBannerRow: { alignItems: 'flex-start', marginBottom: KIOSK_SPACE.md },
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

  // Pool lane — a plain full-width vertical stack, matching the approved
  // Overview-language mock's own "Up for grabs" row list exactly (one
  // chore per row, full width — not a wrapped tile grid). Replaces an
  // earlier percentage-flexBasis tile-grid attempt that live-reported as
  // broken (cards rendering far narrower than intended, content
  // truncating to single characters) — a plain vertical stack has no
  // percentage-of-ambiguous-parent-width math to get wrong, and matches
  // the actual approved design besides.
  poolGrid: { gap: KIOSK_SPACE.md },
  poolCard: { width: '100%' },

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
  // Widened from a bare 30x30 icon-only circle to a labeled pill
  // [live-reported: "don't see view details"] — same real History icon,
  // now with a visible text label so it reads as a details affordance at
  // a glance instead of an unlabeled icon a scanning user could miss.
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 30, borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.sm, justifyContent: 'center', marginLeft: 'auto',
  },
  historyBtnText: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  // Matches WidgetHeader's own headerIcon exactly (38x38, KIOSK_RADIUS.md)
  // — the same icon-chip size/shape Overview uses everywhere, rather than
  // this card's own smaller one-off badge. Visual-polish pass only.
  catBadge: { width: 38, height: 38, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
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
  receiptBox: { borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5, gap: KIOSK_SPACE.xs, padding: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.xs },
  receiptHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  receiptHeaderText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  receiptAmountPill: { borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.xs, paddingVertical: 3 },
  receiptAmountText: { fontSize: KIOSK_TYPO.caption, fontWeight: '900', color: '#fff' },
  receiptPhoto: { width: '100%', height: 140, borderRadius: KIOSK_RADIUS.sm },
  receiptNote: { fontSize: KIOSK_TYPO.label, fontStyle: 'italic' },
  receiptBtn: { alignSelf: 'stretch' },
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
  // Plain full-width vertical stack — see poolGrid's own comment above for
  // why the earlier percentage-flexBasis tile-grid attempt is gone.
  gpGrid: { gap: KIOSK_SPACE.md },
  gpCard: { width: '100%', gap: KIOSK_SPACE.sm },
  claimCard: { width: '100%', gap: KIOSK_SPACE.sm },
  claimPhoto: { width: '100%', height: 140, borderRadius: KIOSK_RADIUS.sm },
  claimNoteBox: { borderRadius: KIOSK_RADIUS.sm, padding: KIOSK_SPACE.sm, gap: 2 },
  claimNoteLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '700', letterSpacing: 0.4 },
  cashOutTotal: { fontSize: KIOSK_TYPO.subheading, fontWeight: '900' },
  cashOutBreakdown: { borderRadius: KIOSK_RADIUS.sm, padding: KIOSK_SPACE.sm, gap: KIOSK_SPACE.xs },
  cashOutLine: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  editedByRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  editedByText: { fontSize: KIOSK_TYPO.micro, fontWeight: '600' },
  photoThumbWrap: { borderRadius: KIOSK_RADIUS.sm, overflow: 'hidden' },
  photoThumb: { width: '100%', height: 160 },
  photoThumbTag: { position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: KIOSK_RADIUS.sm, backgroundColor: 'rgba(0,0,0,0.6)' },
  photoThumbTagText: { fontSize: KIOSK_TYPO.micro, color: '#fff', fontWeight: '700' },
  photoMissingBox: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.sm },
  photoMissingText: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  photoViewerScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center', alignItems: 'center' },
  photoViewerImage: { width: '100%', height: '100%' },
  photoViewerCloseTag: { position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: KIOSK_RADIUS.full, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs },
  photoViewerCloseText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', color: '#fff' },
  gpBtn: { flex: 2 },
  gpBtnRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, alignSelf: 'stretch' },
  gpBtnSecondary: { flex: 1 },
});
