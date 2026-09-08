/**
 * KioskKidWidgets — the two kid-role widgets that REPLACE parent-shaped
 * content on the kiosk Overview.
 *
 * Both exist because the Overview was written for a parent and rendered
 * the same to everyone. Two widgets in particular were wrong for a kid:
 *
 *  · "Ride & pickup" (rides needing a driver) is co-parent coordination.
 *    A kid can't act on it — the actions were already parent-gated — so
 *    all it did was occupy the most prominent widget slot with a household
 *    logistics problem that isn't theirs. Replaced for kid role by
 *    KidTodayWidget: their OWN day, in time order, resting on now.
 *
 *  · "Grocery list" is a shopping concern. Replaced for kid role by
 *    KidChoresWidget: their own chore status breakdown plus the
 *    up-for-grabs pool bounties, which is the single most kiosk-native
 *    thing in the product — a shared surface a kid walks past is exactly
 *    where "anyone can claim this" belongs.
 *
 * Neither widget invents data or rules. KidTodayWidget uses eventStore's
 * dayEvents and the SAME "is this event this member's" test the Schedule
 * tab's own per-person filter uses (memberIds, falling back to memberId),
 * so the mini-timeline and the full Schedule tab can never disagree about
 * whose event is whose. KidChoresWidget uses ../kidQuestLanes, which is
 * KioskTasksTab's own visibility/pool/column logic lifted into a shared
 * module (it now imports from there too) rather than re-derived.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import {
  CalendarClock, CheckSquare, RotateCcw,
  Coins, CheckCircle2, Camera, ClipboardList, Clock3, XCircle, Check, ChevronRight, type LucideIcon,
} from 'lucide-react-native';

import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import type { Quest } from '@/store/questStore';
import { useChoreStore } from '@/store/choreStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore, REQUEST_META } from '@/store/kidRequestStore';
import { KidRequestsSheet } from './KioskKidQuickActions';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { fmtTime } from '@/lib/dates';
import { showToast } from '@/components/AppToast';

import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { kioskOnAccent, type KioskColors } from '../kioskPalette';
import { useKioskFonts, KIOSK_FONT } from '../kioskFonts';
import { COLUMN_STATUSES, visibleQuestsFor, poolQuestsIn } from '../kidQuestLanes';
import { WidgetCard, WidgetHeader, PanelHead, Well, Chip, ActionButton, EmptyNote } from './KioskOS';
import { KioskCantDoThisDialog } from './KioskCantDoThisDialog';

// ════════════════════════════════════════════════════════════════════════
// My Schedule — today, resting on "now"
// ════════════════════════════════════════════════════════════════════════

/**
 * Whose event is this? The Schedule tab's per-person filter
 * (KioskScheduleTab.tsx's `filterMemberId` branch) resolves an event's
 * people as `memberIds` when present, else the single `memberId` — same
 * test here so the two never disagree.
 */
function involves(ev: FamilyEvent, memberId: string): boolean {
  const ids = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
  return ids.includes(memberId);
}

/** Minutes past midnight for an event's start, or null for an all-day item. */
function startMinutes(ev: FamilyEvent): number | null {
  if (ev.allDay || !ev.time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(ev.time);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

const ROW_HEIGHT = 62;
const LIST_MAX_HEIGHT = 260;

export function KidTodayWidget({ active, k, isDark, onOpenSchedule, style }: {
  active: FamilyMember;
  k: KioskColors;
  isDark: boolean;
  onOpenSchedule: () => void;
  style?: any;
}) {
  const dayEvents = useEventStore(s => s.dayEvents);
  const scrollRef = useRef<ScrollView | null>(null);

  // All-day items first (they have no position on a clock), then timed
  // items chronologically — the reading order of a day agenda.
  const mine = useMemo(() => {
    const rows = dayEvents.filter(ev => involves(ev, active.id));
    return rows.sort((a, b) => {
      const am = startMinutes(a);
      const bm = startMinutes(b);
      if (am === null && bm === null) return a.title.localeCompare(b.title);
      if (am === null) return -1;
      if (bm === null) return 1;
      return am - bm;
    });
  }, [dayEvents, active.id]);

  /**
   * "Nearest current time" = the first timed item that has not yet
   * started; if the whole day is already behind us, the LAST timed item
   * (what just happened) rather than snapping back to the morning. All-day
   * items are never a scroll target — they have no time to be near.
   *
   * This is only the initial resting position: the list is a normal
   * ScrollView, so a kid can scroll freely in both directions from there.
   */
  const focusIndex = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let lastTimed = -1;
    for (let i = 0; i < mine.length; i++) {
      const m = startMinutes(mine[i]);
      if (m === null) continue;
      lastTimed = i;
      if (m >= nowMin) return i;
    }
    return lastTimed;
  }, [mine]);

  // Scroll AFTER layout, not during render — the standard RN pattern.
  // Keyed on the focused event's id so it re-rests when the day's data
  // actually changes, and not on every unrelated store tick (which would
  // yank the list back under a kid mid-scroll).
  const focusId = focusIndex >= 0 ? mine[focusIndex]?.id : undefined;
  useEffect(() => {
    if (focusIndex <= 0) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: focusIndex * (ROW_HEIGHT + KIOSK_SPACE.xs),
        animated: false,
      });
    }, 80);
    return () => clearTimeout(t);
  }, [focusId, focusIndex]);

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      <WidgetHeader
        Icon={CalendarClock} eyebrow="Today" title="My schedule"
        accent={k.blue} k={k} isDark={isDark}
        right={mine.length > 0
          ? <Chip label={`${mine.length}`} accent={k.blue} isDark={isDark} k={k} />
          : undefined}
      />
      {mine.length === 0 ? (
        <EmptyNote text="Nothing on your calendar today — enjoy it." k={k} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ maxHeight: LIST_MAX_HEIGHT }}
          contentContainerStyle={{ gap: KIOSK_SPACE.xs }}
          showsVerticalScrollIndicator
          accessibilityLabel={`Your schedule today, ${mine.length} ${mine.length === 1 ? 'item' : 'items'}`}
        >
          {mine.map((ev, i) => {
            const m = startMinutes(ev);
            const past = m !== null && m < nowMin;
            const isNext = i === focusIndex && !past;
            return (
              <Well
                key={ev.id}
                k={k}
                accent={isNext ? k.blue : undefined}
                style={[s.evRow, past && { opacity: 0.55 }]}
              >
                <Text
                  style={[s.evTime, { color: isNext ? k.blue : k.textMuted }]}
                  numberOfLines={1}
                >
                  {m === null ? 'All day' : fmtTime(ev.time)}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.evTitle, { color: k.text }]} numberOfLines={2}>{ev.title}</Text>
                  {!!ev.location && (
                    <Text style={[s.evMeta, { color: k.textFaint }]} numberOfLines={1}>{ev.location}</Text>
                  )}
                </View>
                {isNext && <Chip label="Next" accent={k.blue} isDark={isDark} k={k} filled />}
              </Well>
            );
          })}
        </ScrollView>
      )}
      <ActionButton
        label="Open my calendar" accent={k.blue} k={k} isDark={isDark}
        onPress={onOpenSchedule}
        style={{ marginTop: KIOSK_SPACE.sm }}
        accessibilityHint="Open the full family schedule"
      />
    </WidgetCard>
  );
}

// ════════════════════════════════════════════════════════════════════════
// My Chores — status breakdown + up-for-grabs bounties
// ════════════════════════════════════════════════════════════════════════

// kioskQuestMeta (the icon + uppercase pill label + accent per status,
// itself a translation of KidQuestCard.tsx's questStatusMeta) moved to
// ../kidQuestLanes when the Chores board needed the IDENTICAL pill in its
// own card header — a second copy is exactly how the two kiosk surfaces
// would end up disagreeing about what a given status looks like. See that
// file for the full phone→kiosk color mapping and why declined is gold
// rather than red. `accentFor` below still derives its lane tints from the
// same convention.
//
// questTimeline (the claimed → submitted → approved line) moved to
// ../kidQuestLanes when the Chores board needed the identical line inside
// its own card body — see that file for the formatter's provenance. Nothing
// about the string it produces changed; this file is a pure import site now.

// Live-reported: "give the chore filter names too short" — the status
// strip's counter pills wrapped to 2 uneven lines for the longer labels
// ("In Progress", "Needs Redo") even at kiosk's smallest allowed text
// size. COLUMN_STATUSES.label itself stays as-is (it's the Chores board's
// OWN wording, reused deliberately rather than reinvented — see
// kidQuestLanes.ts), so this is a display-only alias scoped to just this
// one cramped 4-up strip.
const STATUS_STRIP_SHORT_LABEL: Record<string, string> = {
  todo: 'To Do', progress: 'Active', redo: 'Redo', review: 'Review',
};

export function KidChoresWidget({ active, members, k, isDark, onOpenTasks, style }: {
  active: FamilyMember;
  members: FamilyMember[];
  k: KioskColors;
  isDark: boolean;
  onOpenTasks: () => void;
  style?: any;
}) {
  const { quests, claimQuest, submitQuest, approveQuest } = useQuestStore();
  const isActiveApprover = useTemporaryApproverStore(s => s.isActiveApprover(active.id));

  // Same staleness bug as KioskTasksTab.tsx (see its own top-of-component
  // comment for the full root cause: a wall-mounted kiosk never re-triggers
  // the app's foreground-recovery resync for a dead realtime socket). A kid
  // may see this widget on Overview without ever opening the Tasks tab, so
  // it needs its own correction — but NOT its own competing forced-refresh
  // interval on top of that tab's: this call omits `force`, so it's a
  // no-op if choreStore already synced recently (via this widget, the Tasks
  // tab, or anywhere else), and only does real work when nothing has.
  useEffect(() => {
    useChoreStore.getState().syncFromDB().catch(() => {});
  }, []);

  // Same source of truth as the Chores board — see ../kidQuestLanes.
  const visible = useMemo(
    () => visibleQuestsFor(quests, members, { id: active.id, role: active.role }),
    [quests, members, active.id, active.role],
  );
  const pool = useMemo(() => poolQuestsIn(visible), [visible]);
  const poolIds = useMemo(() => new Set(pool.map(q => q.id)), [pool]);

  // The board's own four buckets, in the board's own words — a kid should
  // not have to translate between "Needs Redo" here and something else one
  // tab over. Each bucket now carries its own quest list (not just a
  // count) so the strip can act as a real tab bar: tapping one filters the
  // list below to just those chores, matching what a kid would expect from
  // a row of four numbered pills that look tappable.
  const buckets = useMemo(() => {
    const mine = visible.filter(q => !poolIds.has(q.id) && q.assignedToId === active.id);
    return COLUMN_STATUSES.map(col => ({
      key: col.key,
      label: col.label,
      items: mine.filter(q => col.statuses.includes(q.status)),
    }));
  }, [visible, poolIds, active.id]);

  /**
   * Lane accent. Was: todo=gold, progress=BLUE, redo=DANGER-RED, review=sage
   * — a kiosk-invented mapping that disagreed with the phone card on three
   * of four lanes (see kioskQuestMeta's comment for the phone's real map).
   * Now derived from the same convention: progress is sage (the phone's
   * teal "in progress"), redo is gold (the phone deliberately does NOT use
   * red there), review is gold, todo is purple.
   */
  const accentFor = (key: string) =>
    key === 'todo' ? k.purple
      : key === 'progress' ? k.sage
      : key === 'redo' ? k.gold
      : k.gold;

  // The exact same per-status action the Chores board offers — same
  // deriveQuestActions gate, same store calls, same toast copy — so a kid
  // can act on a chore right here instead of this widget being read-only
  // and the board being the only place with buttons. See
  // KioskTasksTab.tsx's own primaryAction for the source this mirrors.
  //
  // Labels match the reference mock's own simple wording ("Mark Done",
  // not the phone card's "Mark Done → Get Paid" — live-requested: "no
  // need to -> getpaind - we can just put mark done label"). The ACTIONS
  // are unchanged — the same claimQuest / submitQuest / approveQuest from
  // choreAdapter this widget already wired; only the button text is
  // simplified to match the mock's visual reference.
  //
  // Photo-required chores are the one place kiosk can't match the phone:
  // the phone opens SubmitProofSheet (a camera capture) before paying out.
  // Kiosk has no capture flow, so rather than silently submitting without
  // the proof the chore demands, the button routes to the Chores tab.
  const primaryAction = (
    q: Quest,
  ): { label: string; accent: string; Icon: LucideIcon; action: () => void } | null => {
    const actions = deriveQuestActions(q, { id: active.id, role: active.role, isActiveApprover });
    if (actions.canClaim) {
      return {
        label: 'Claim', accent: k.purple, Icon: Coins,
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
      if (q.photoRequired) {
        return {
          label: 'Take Photo', accent: k.sage, Icon: Camera,
          action: () => { onOpenTasks(); },
        };
      }
      return {
        label: 'Mark Done', accent: k.sage, Icon: CheckCircle2,
        action: () => { submitQuest(q.id, undefined, active.id); showToast('Submitted for review ✓'); },
      };
    }
    if (actions.canApprove) {
      return {
        label: 'Approve', accent: k.sage, Icon: CheckCircle2,
        action: () => { approveQuest(q.id, active.id); showToast('Approved ✓'); },
      };
    }
    return null;
  };

  /**
   * Whether this chore offers the phone card's second, outlined "Can't do
   * this" button beside the primary one. Same gate the phone uses —
   * deriveQuestActions' canKidDecline, which is what KidQuestCard.tsx's own
   * `canDeclinePlain` reads (its line 87) — not a kiosk re-derivation.
   */
  const canDecline = (q: Quest) =>
    deriveQuestActions(q, { id: active.id, role: active.role, isActiveApprover }).canKidDecline;

  // Target for the "Can't do this" reason dialog. Held as {id,title} rather
  // than the Quest itself so a store update mid-flow can't leave a stale
  // object pinned open — the dialog re-looks-up the live chore on submit.
  const [declineTarget, setDeclineTarget] = useState<{ id: string; title: string } | null>(null);

  const totalMine = buckets.reduce((n, b) => n + b.items.length, 0);

  // Selected tab. Defaults to the first bucket that actually has something
  // in it (falling back to "To Do") so opening this widget doesn't land on
  // an empty tab when there's real work sitting in a later one.
  const [activeBucket, setActiveBucket] = useState<string>(() =>
    buckets.find(b => b.items.length > 0)?.key ?? COLUMN_STATUSES[0].key,
  );
  const selected = buckets.find(b => b.key === activeBucket) ?? buckets[0];

  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      {/* Mock's own flat "MY TASKS ... N open" heading — PanelHead (same
          uppercase/tracked style FamilySchedulePanel/My Balance/My
          Requests already use in this redesign), not WidgetHeader's icon-
          chip shape [live-requested: "TASKs seticon should match to the
          100% mock styles and headings etc.."]. */}
      <PanelHead
        title="My tasks" k={k}
        right={<Text style={[s.panelOpenCount, { color: k.textFaint }]} numberOfLines={1}>{totalMine} open</Text>}
      />

      {/* Status TABS. Used to be a plain four-up display strip; each cell
          is now pressable and selects that bucket, with its actual chores
          listed (scrollable, capped height) right below — a kid could
          only glance at counts before, with no way to see WHICH chores
          were "in progress" without leaving this widget for the full
          Chores tab. Selected tab gets a solid fill + bottom-accent bar so
          it reads as "currently open," not just "has a nonzero count." */}
      <View style={s.statusStrip}>
        {buckets.map(b => {
          const on = b.items.length > 0;
          const isSelected = b.key === activeBucket;
          const accent = accentFor(b.key);
          return (
            <Pressable
              key={b.key}
              onPress={() => setActiveBucket(b.key)}
              style={[
                s.statusCell,
                // Mock's own .chip.active convention: a selected filter
                // fills solid with the page's own text/ink colors, not an
                // accent tint — every OTHER chip (selected or not) stays
                // the same neutral surface, only the count/label color
                // carries the per-status accent. Matches the mock's real
                // chip look while keeping this strip's own count-forward
                // 4-cell layout (a deliberate, already-tuned kiosk-scale
                // touch target, not the mock's small text pill)
                // [live-requested: "all the cards and the action styles
                // should match the mock"].
                {
                  backgroundColor: isSelected ? k.text : k.well,
                  borderColor: isSelected ? k.text : on ? accent + (isDark ? '45' : '38') : k.cardBorder,
                  borderWidth: 1,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${b.items.length} ${b.label}`}
            >
              <Text
                style={[s.statusCount, { color: isSelected ? k.card : on ? accent : k.textFaint }]}
                numberOfLines={1}
              >
                {b.items.length}
              </Text>
              <Text
                style={[s.statusLabel, { color: isSelected ? k.card : on ? accent : k.textFaint }]}
                numberOfLines={1}
              >
                {STATUS_STRIP_SHORT_LABEL[b.key] ?? b.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The selected tab's chores. Was a non-scrolling 3-row cap + "See N
          more" link — this widget used to live in the Overview's own
          flex-wrap deck, where an inner ScrollView never reliably claimed
          the scroll gesture from that screen's outer ScrollView. Now
          mounted directly in centerCol instead (same real column
          FamilySchedulePanel/"Meals this week"/"Grocery list" already
          live in), so it uses the identical proven pattern those already
          use successfully on this exact screen: a bounded-height
          ScrollView + nestedScrollEnabled, 5 rows visible by default, the
          rest reachable by scrolling instead of a "See more" link
          [live-requested: "match with mock my taks and all make them
          scollable - 5 items are default show"]. Every visible row still
          gets the SAME primary action button the Chores board shows
          (Claim / Submit / Resubmit / Approve, via the same
          deriveQuestActions gate just above). */}
      {selected && (
        selected.items.length === 0 ? (
          <EmptyNote text={`Nothing in ${selected.label} right now.`} k={k} style={{ marginBottom: KIOSK_SPACE.sm }} />
        ) : (
          <ScrollView style={s.choreListScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            <View style={{ gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.sm }}>
              {selected.items.map(q => (
                <ChoreCardRow
                  key={q.id}
                  q={q}
                  k={k}
                  isDark={isDark}
                  btn={primaryAction(q)}
                  showDecline={canDecline(q)}
                  onDecline={() => setDeclineTarget({ id: q.id, title: q.title })}
                />
              ))}
            </View>
          </ScrollView>
        )
      )}

      <ActionButton
        label="Open my chores"
        accent={k.gold}
        k={k} isDark={isDark}
        variant="soft"
        onPress={onOpenTasks}
        style={{ marginTop: KIOSK_SPACE.sm }}
        accessibilityHint="Open the chores board"
      />

      {/* "Can't do this" reason picker. Built on KioskFormDrawer, so it
          participates in idle-lock via KioskModalHost the same way every
          other kiosk sheet does — see KioskCantDoThisDialog's header for
          why this is a one-step kiosk dialog rather than a port of the
          phone's three-step CantMakeItSheet. It still reaches the same
          declineChoreAssignment store action the phone does. */}
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
    </WidgetCard>
  );
}

// ════════════════════════════════════════════════════════════════════════
// My Balance — self-scoped coin panel for the kid/teen Overview's sideCol,
// matching the reference mock's own left-rail "Balance" block but placed
// in the sideCol per this app's real layout (see KioskOverviewTab.tsx's
// own isParent branch — a real third rail column doesn't exist there,
// only centerCol + sideCol; kid/teen follow that exact same shape rather
// than inventing a third column [live-requested: "we should keep the side
// bar for the navigation tabs like parent" / "follow this as the parents
// coumn strip left side"]).
//
// Real data only: mainCoins/gpCoins (same fields KidPiggyBankSheet and the
// parent's own Coin Jars row already read), weekChoreCounts (same map the
// parent's jar row already computes and passes in — not re-derived here),
// and streak (FamilyMember.streak, server-populated). "Last redeemed" is a
// real derivation from rewardStore's own redemption history, not invented
// copy — the same store the parent's redemption-approval queue reads.
// ════════════════════════════════════════════════════════════════════════

function daysAgoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function KioskMyBalancePanel({
  active, weekChoreCounts, k, isDark, onOpenStore,
}: {
  active: FamilyMember;
  weekChoreCounts: Map<string, { done: number; total: number }>;
  k: KioskColors;
  isDark: boolean;
  onOpenStore: () => void;
}) {
  const redemptions = useRewardStore(s => s.redemptions);
  const main = (active as any).mainCoins ?? 0;
  const gp = (active as any).gpCoins ?? 0;
  const total = main + gp;
  const streak = (active as any).streak ?? 0;
  const progress = weekChoreCounts.get(active.id);

  const lastRedeemed = useMemo(() => {
    const mine = redemptions
      .filter(r => r.memberId === active.id)
      .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt));
    return mine[0];
  }, [redemptions, active.id]);

  return (
    <WidgetCard k={k} isDark={isDark}>
      <PanelHead title="My balance" k={k} />
      <Text style={[s.balanceAmt, { color: k.gold }]} numberOfLines={1}>
        {total}<Text style={[s.balanceUnit, { color: k.textMuted }]}> coins</Text>
      </Text>
      <Text style={[s.balanceSub, { color: k.textFaint }]} numberOfLines={1}>
        {[
          progress ? `${progress.done}/${progress.total} chores this week` : null,
          streak > 0 ? `${streak} day streak` : null,
          lastRedeemed ? `last redeemed ${daysAgoLabel(lastRedeemed.redeemedAt)}` : null,
        ].filter(Boolean).join(' · ') || 'No activity yet this week'}
      </Text>
      {/* Quiet text link, not a filled button — same convention parent's
          own Coin Jars/Meals sideCol panels already use for their own
          "Open reward store"/"Open list" links [live-requested: "rewards
          store is text link >"]. */}
      <Pressable
        onPress={onOpenStore}
        style={({ pressed }) => [s.panelTextLink, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Open reward store"
        accessibilityHint="Open the reward store to spend coins"
      >
        <Text style={[s.panelTextLinkText, { color: k.gold }]}>Reward Store</Text>
        <ChevronRight size={14} color={k.gold} />
      </Pressable>
    </WidgetCard>
  );
}

// ════════════════════════════════════════════════════════════════════════
// My Requests — compact always-visible sideCol list, same real
// kidRequestStore data/filtering KidRequestsSheet already uses (that
// sheet's own `mine`/statusOf logic, ported here verbatim rather than
// re-derived) but shown inline (jarRow-style rows, top 3 + "See all" link)
// instead of behind a sheet tap — matching the mock's own always-visible
// "My Requests" panel placement.
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// Up for Grabs — standalone sideCol panel (pulled out of KidChoresWidget,
// which used to render this as a sub-section of the same "My tasks" card)
// matching the mock's own separate .panel exactly: flat divided rows, a
// gold "+N" coin amount, a sage-tinted "Claim" pill
// [live-requested screenshot: "from MOCK" / "i would prefer mock style
// side widget in place of coins upgrab"]. Same real poolQuestsIn/
// claimQuest logic KidChoresWidget's own pool section used — relocated,
// not re-derived.
// ════════════════════════════════════════════════════════════════════════

export function KioskUpForGrabsPanel({
  active, members, k, isDark, onOpenTasks,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  k: KioskColors;
  isDark: boolean;
  onOpenTasks: () => void;
}) {
  const { quests, claimQuest } = useQuestStore();
  const visible = useMemo(
    () => visibleQuestsFor(quests, members, { id: active.id, role: active.role }),
    [quests, members, active.id, active.role],
  );
  const pool = useMemo(() => poolQuestsIn(visible), [visible]);

  return (
    <WidgetCard k={k} isDark={isDark}>
      <PanelHead
        title="Up for grabs" k={k}
        right={<Text style={[s.panelOpenCount, { color: pool.length > 0 ? k.sage : k.textFaint }]} numberOfLines={1}>{pool.length}</Text>}
      />
      {pool.length === 0 ? (
        <EmptyNote text="No bounty chores right now." k={k} />
      ) : (
        // Same 5-default-visible, scroll-for-the-rest pattern as My Tasks.
        <ScrollView style={s.poolListScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {pool.map((q, i) => (
            <View key={q.id} style={[s.poolFlatRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.poolFlatTitle, { color: k.text }]} numberOfLines={1}>{q.title}</Text>
                <Text style={[s.poolFlatMeta, { color: k.textFaint }]} numberOfLines={1}>
                  {q.assignedToId ? 'Claimed' : 'No one claimed yet'}
                </Text>
              </View>
              {q.coins > 0 && (
                <Text style={[s.poolFlatCoin, { color: k.gold }]} numberOfLines={1}>+{q.coins}</Text>
              )}
              {/* Claim right here — the whole point of surfacing "up for
                  grabs" on a shared kiosk widget is that a kid standing at
                  the counter shouldn't have to switch to the Chores tab
                  just to take one. Same real action the board itself uses:
                  claimQuest(id, active.id), the exact race-safe claim
                  every other kiosk claim button calls — a sibling claiming
                  the same bounty a moment earlier is resolved store-side,
                  not re-derived here. */}
              <Pressable
                onPress={() => {
                  claimQuest(q.id, active.id);
                  showToast(`Claimed "${q.title}" ✓`);
                }}
                style={({ pressed }) => [s.poolFlatClaimBtn, { backgroundColor: k.sageSoft }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`Claim ${q.title}`}
                accessibilityHint={q.coins > 0 ? `Worth ${q.coins} coins` : undefined}
              >
                <Text style={[s.poolFlatClaimText, { color: k.sage }]} numberOfLines={1}>Claim</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </WidgetCard>
  );
}

function requestStatusOf(status: string, k: KioskColors): { label: string; accent: string; Icon: LucideIcon } {
  if (status === 'approved' || status === 'completed') return { label: 'Approved', accent: k.sage, Icon: CheckCircle2 };
  if (status === 'declined' || status === 'cancelled' || status === 'expired') return { label: status === 'expired' ? 'Expired' : 'Declined', accent: k.danger, Icon: XCircle };
  if (status === 'partial') return { label: 'Partly approved', accent: k.gold, Icon: CheckCircle2 };
  return { label: 'Waiting', accent: k.blue, Icon: Clock3 };
}

export function KioskMyRequestsPanel({
  active, members, k, isDark,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  k: KioskColors;
  isDark: boolean;
}) {
  const requests = useKidRequestStore(s => s.requests);
  // "See all" opens the real KidRequestsSheet (same component
  // KioskKidQuickActions' own "My Requests" hero tile used to open,
  // exported from there rather than re-implemented) — this panel is the
  // new always-visible top-3 glance, the sheet is still the real full-
  // history surface.
  const [showAll, setShowAll] = useState(false);

  // Same 30-day window KidRequestsSheet already uses — see that
  // component's own comment for why (matches the phone's real ceiling).
  const mine = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return requests
      .filter(r => r.fromMemberId === active.id && !!r.requestedAt)
      .filter(r => new Date(r.requestedAt).getTime() >= since)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [requests, active.id]);

  const nameOf = (id?: string) => members.find(m => m.id === id)?.name?.trim().split(' ')[0];

  return (
    <WidgetCard k={k} isDark={isDark}>
      <PanelHead
        title="My requests" k={k}
        right={mine.length > 0 ? <Chip label={`${mine.length}`} accent={k.blue} isDark={isDark} k={k} /> : undefined}
      />
      {mine.length === 0 ? (
        <EmptyNote text="You haven't asked for anything in the last 30 days." k={k} />
      ) : (
        // Same 5-default-visible, scroll-for-the-rest pattern as My
        // Chores/Up for Grabs — was a hard top-3 + "See more" link.
        <ScrollView style={s.reqListScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {mine.map((r, i) => {
            const st = requestStatusOf(r.status, k);
            const meta = REQUEST_META[r.type];
            const answered = nameOf(r.respondedBy);
            return (
              <View key={r.id} style={[s.reqCompactRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                <Text style={s.reqCompactEmoji} numberOfLines={1}>{meta?.emoji ?? '📋'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.reqCompactTitle, { color: k.text }]} numberOfLines={1}>{r.detail || meta?.label || 'Request'}</Text>
                  <Text style={[s.reqCompactMeta, { color: st.accent }]} numberOfLines={1}>
                    {st.label}{answered ? ` · ${answered}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
      {mine.length > 5 && (
        <Pressable onPress={() => setShowAll(true)} accessibilityRole="button" accessibilityLabel="See your full request history">
          <Text style={[s.poolMore, { color: k.blue }]} numberOfLines={1}>See full history →</Text>
        </Pressable>
      )}
      {showAll && (
        <KidRequestsSheet
          active={active} members={members} k={k} isDark={isDark}
          onClose={() => setShowAll(false)}
        />
      )}
    </WidgetCard>
  );
}

/**
 * One chore, rendered as the phone's own kid card
 * (features/hub/kid/KidQuestCard.tsx) rather than kiosk's old
 * title + coins + one-small-button row.
 *
 * Brought over from that card, in its order: the status-tinted left edge
 * and background wash, the title as a real heading, a coin badge, an
 * icon + uppercase status pill, the claimed → submitted timeline line, the
 * "waiting on a parent" helper for in-review, and — for an actionable
 * chore — a prominent solid primary button beside an outlined "Can't do
 * this".
 *
 * Sizes are kiosk's, not the phone's: KIOSK_TYPO/SPACE/RADIUS/HIT
 * throughout, every color a k.* token so both appearances resolve.
 *
 * This is a ROW-APPEARANCE change only. The list this sits in is still the
 * deliberate non-scrolling 3-row cap (a nested-scroll gesture conflict with
 * the Overview's outer ScrollView) under the tab strip — see the render
 * site's own comment. The card is taller than the old row, which is why
 * the cap matters more, not less.
 */
/**
 * Live-reported: this card matched the phone's rich per-status content
 * (coin badge, status pill, timeline, "waiting on a parent" helper, action
 * buttons) but not the phone's own COLLAPSE behavior — on phone this is
 * CollapsibleQuestCard (features/quests/components/CollapsibleQuestCard.tsx,
 * already used one file over in KioskTasksTab.tsx's own renderQuestCard):
 * header always visible, everything else — timeline, helper text, action
 * buttons — hidden behind a chevron until tapped. Kiosk was showing all of
 * that unconditionally instead, which also fights the widget's own
 * non-scrolling 3-row cap (see this file's other comments on that): a
 * collapsed card is shorter, so more of them fit in the same capped space,
 * and only the one a kid actually taps into grows to show its full detail.
 *
 * Header here mirrors KioskTasksTab.tsx's own renderQuestCard header shape
 * (title + coin badge, that file's own status/category badge swapped for
 * this widget's status pill instead, since My Chores' whole point is
 * surfacing status at a glance) rather than inventing a different split.
 */
/**
 * This card's own text scale, deliberately separate from the shared
 * KIOSK_TYPO tokens. Reusing KIOSK_TYPO here (body/caption/micro/label)
 * pinned every element on this card to sizes tuned for OTHER, differently-
 * proportioned surfaces — several rounds of live-reported "too big"/"too
 * cramped" feedback on this exact card came from nudging between those
 * fixed steps rather than sizing this card's own hierarchy on its own
 * terms. Calibrated against the phone's real KidQuestCard reference
 * screenshot: title clearly the largest thing on the card, badges a
 * comfortable medium (not squeezed to kiosk's absolute floor), meta/
 * timeline text small and quiet, button label readable at arm's length.
 */
// Live-reported: "can we use the TYPO what we have it in the MOCK html?"
// — docs/kitchen-hub-mockup.html's own .chorecard rule is the kiosk
// mockup's real reference sizing for this exact card (name/sub/coinpill),
// taken at its clamp()'s upper bound since kiosk renders at a fixed size
// rather than the mock's responsive vw-based scaling:
//   .chorecard .name     font-size: clamp(12.5px, 1.05vw, 14.5px) → 14.5
//   .chorecard .sub       font-size: clamp(10.5px, 0.9vw, 12px)    → 12
//   .chorecard .coinpill  font-size: clamp(10.5px, 0.9vw, 12.5px)  → 12.5
// The mock has no separate status-pill/button rule (its chorecard is
// read-only), so those two reuse the closest sized rule in the same file
// (.taskchip .t-title=13.5 for the button label; .t-meta=11 for the
// status pill, since it's peer to a badge/tag, not a headline). Was
// briefly folded into the same `badge` token as the coin pill (12.5) —
// live-corrected: that's the .chorecard .coinpill size, not .taskchip
// .t-meta, so the status pill gets its own `statusPill: 11` token instead
// of silently reusing the coin badge's number.
const CHORE_CARD_TYPO = {
  title: 14.5,
  badge: 12.5,
  statusPill: 11,
  meta: 12,
  // Live-reported: "smaller button sizes" — nudged down one step from the
  // .taskchip .t-title size (13.5) since the buttons are back to being
  // real collapsible content now (see ChoreCardRow's children), not an
  // always-visible pinnedFooter competing for attention with the header.
  button: 12,
} as const;

/**
 * ChoreCardRow — matches the reference mock's own flat `.task` row exactly
 * (live-referenced screenshot): a checkbox square (empty / gold-outlined
 * while pending / solid-sage-filled once done), title + meta line (with a
 * "PENDING" badge inline when in review), the coin amount on the right in
 * gold, and ONE flat action button — not the phone's richer status-tinted
 * card (coin badge + status pill + collapsible timeline this used to
 * mirror) [live-requested: "all the cards and the action styles should
 * match the mock", followed by the actual mock screenshot as the concrete
 * reference]. Every real action underneath is unchanged — `btn`/
 * `showDecline`/`onDecline` still come from the exact same
 * deriveQuestActions-gated primaryAction/canDecline this widget's parent
 * computes; this is a visual-only rebuild, same as every other piece of
 * this redesign. The declined/redo note (q.declineReason) still shows —
 * dropping a parent's real feedback to match the mock's own read-only
 * reference would lose real information the mock never had to represent.
 */
function ChoreCardRow({
  q, k, isDark, btn, showDecline, onDecline,
}: {
  q: Quest;
  k: KioskColors;
  isDark: boolean;
  btn: { label: string; accent: string; Icon: LucideIcon; action: () => void } | null;
  showDecline: boolean;
  onDecline: () => void;
}) {
  const inReview = q.status === 'pending_approval';
  const isDone = q.status === 'approved' || q.status === 'done';

  const fontsLoaded = useKioskFonts();
  const fontExtrabold = fontsLoaded ? KIOSK_FONT.inter.extrabold : undefined;
  const fontSemibold = fontsLoaded ? KIOSK_FONT.inter.semibold : undefined;

  return (
    <View style={s.taskRow}>
      <View
        style={[
          s.taskCheck,
          { borderColor: isDone ? k.sage : inReview ? k.gold : k.cardBorder },
          isDone && { backgroundColor: k.sage },
        ]}
      >
        {isDone && <Check size={13} color={kioskOnAccent(k, k.sage)} strokeWidth={3} />}
      </View>

      <View style={s.taskMain}>
        <Text
          style={[s.taskTitle, { color: isDone ? k.textFaint : k.text, fontFamily: fontExtrabold }, isDone && { textDecorationLine: 'line-through' }]}
          numberOfLines={2}
        >
          {q.title}
        </Text>
        <View style={s.taskMetaRow}>
          {!!q.dueDate && !isDone && (
            <Text style={[s.taskMeta, { color: k.textFaint, fontFamily: fontSemibold }]} numberOfLines={1}>
              {q.dueDate}
            </Text>
          )}
          {inReview && (
            <View style={[s.taskBadge, { backgroundColor: k.goldSoft }]}>
              <Text style={[s.taskBadgeText, { color: k.gold, fontFamily: fontExtrabold }]} numberOfLines={1}>PENDING</Text>
            </View>
          )}
        </View>
        {inReview && (
          <Text style={[s.choreHelper, { color: k.gold, fontFamily: fontSemibold }]} numberOfLines={2}>
            Waiting on a parent to review this chore.
          </Text>
        )}
        {!!q.declineReason && (
          <View style={[s.choreDeclineNote, { backgroundColor: k.dangerSoft, borderColor: k.dangerEdge }]}>
            <Text style={[s.choreDeclineLabel, { color: k.danger, fontFamily: fontExtrabold }]} numberOfLines={1}>Parent's note</Text>
            <Text style={[s.choreDeclineText, { color: k.text, fontFamily: fontSemibold }]} numberOfLines={4}>{q.declineReason}</Text>
          </View>
        )}
      </View>

      {q.coins > 0 && !isDone && (
        <Text style={[s.taskCoin, { color: k.gold }]} numberOfLines={1}>+{q.coins}</Text>
      )}

      {/* Mock's own disabled "Awaiting review" ghost pill for a chore with
          no available action (in review, waiting on a parent). */}
      {!isDone && !btn && inReview && (
        <View style={[s.taskActionBtn, { backgroundColor: k.well, borderColor: k.cardBorder, opacity: 0.6 }]}>
          <Text style={[s.taskActionText, { color: k.textFaint, fontFamily: fontExtrabold }]} numberOfLines={1}>
            Awaiting review
          </Text>
        </View>
      )}

      {!isDone && btn && (
        <View style={s.taskActionPair}>
          <Pressable
            onPress={btn.action}
            style={({ pressed }) => [
              s.taskActionBtn,
              { backgroundColor: k.well, borderColor: k.cardBorder },
              pressed && { backgroundColor: btn.accent, borderColor: btn.accent },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${btn.label}: ${q.title}`}
            accessibilityHint={q.coins > 0 ? `Worth ${q.coins} coins` : undefined}
          >
            <Text style={[s.taskActionText, { color: k.text, fontFamily: fontExtrabold }]} numberOfLines={1}>
              {btn.label}
            </Text>
          </Pressable>
          {showDecline && (
            <Pressable
              onPress={onDecline}
              style={({ pressed }) => [
                s.taskActionBtn,
                { backgroundColor: k.well, borderColor: k.cardBorder },
                pressed && { backgroundColor: k.danger, borderColor: k.danger },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Can't do this: ${q.title}`}
              accessibilityHint="Give a reason and put this chore back up for grabs"
            >
              <Text style={[s.taskActionText, { color: k.danger, fontFamily: fontExtrabold }]} numberOfLines={1}>
                Can't do this
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {isDone && (
        <Text style={[s.taskDoneCoin, { color: k.textFaint }]} numberOfLines={1}>+{q.coins}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // My balance.
  balanceAmt: { fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 2 },
  balanceUnit: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  balanceSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },

  // My requests (compact sideCol rows). 5 rows visible by default.
  reqListScroll: { maxHeight: 270 },
  reqCompactRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingVertical: KIOSK_SPACE.xs, minHeight: KIOSK_HIT.min,
  },
  reqCompactEmoji: { fontSize: 18 },
  reqCompactTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  reqCompactMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', marginTop: 1 },

  // My schedule.
  evRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: ROW_HEIGHT,
  },
  evTime: { width: 76, fontSize: KIOSK_TYPO.caption, fontWeight: '800', fontVariant: ['tabular-nums'] },
  evTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  evMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2 },

  // My chores. statusCount was KIOSK_TYPO.heading — a display-scale number
  // in a small widget cell read as oversized/"zoomed" next to everything
  // else on this card; subheading is still clearly the largest thing in
  // the cell without dominating the whole widget.
  statusStrip: { flexDirection: 'row', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.sm },
  // ~76px per collapsed ChoreCardRow (2-line header + padding/border) + xs
  // gap, so 5 rows visible by default before scrolling — same bounded-
  // height + nestedScrollEnabled pattern FamilySchedulePanel/"Meals this
  // week"/"Grocery list" already use successfully in this same centerCol.
  choreListScroll: { maxHeight: 400 },
  // ~50px per poolRow + xs gap, 5 rows visible by default.
  poolListScroll: { maxHeight: 270 },
  statusCell: {
    flex: 1, minWidth: 0, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingVertical: KIOSK_SPACE.xs, paddingHorizontal: 4, minHeight: KIOSK_HIT.min,
  },
  statusCount: { fontSize: KIOSK_TYPO.subheading, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statusLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', textAlign: 'center' },
  // ── Rich chore card (ChoreCardRow) ────────────────────────────────────
  // (The old bucketScroll/bucketRow/bucketTitle styles are gone: the
  // selected-tab list now renders ChoreCardRow, whose title gets a full
  // row instead of sharing one with a button, so the caption-size
  // truncation workaround those carried is no longer needed. The list
  // itself is still the same non-scrolling 3-row cap.)
  // CollapsibleQuestCard supplies the card's own frame now (glass/blur
  // wash, left accent glow, border, header/body split, the tap-to-expand
  // chevron) — see this file's own header comment above ChoreCardRow. This
  // header is just the always-visible content INSIDE that frame: title on
  // its own row, coins + status pill together on the row below — a fixed
  // 2-row shape regardless of title length (see ChoreCardRow's own comment
  // for why this replaced a single flex-wrapping row).
  //
  // Text sizes below are CHORE_CARD_TYPO, not KIOSK_TYPO — see that
  // constant's own comment for why this card needed its own scale rather
  // than the shared kiosk tokens.
  panelOpenCount: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  // Same values as KioskOverviewTab.tsx's own panelTextLink/panelTextLinkText.
  panelTextLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs, minHeight: KIOSK_HIT.min,
  },
  panelTextLinkText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  // Flat mock-matched task row (ChoreCardRow) — mock's own .task/.task-
  // check/.task-title/.task-meta/.badge/.task-coin/.task-action shapes.
  taskRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.sm,
    paddingVertical: KIOSK_SPACE.sm,
  },
  taskCheck: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  taskMain: { flex: 1, minWidth: 0, gap: 2 },
  taskTitle: { fontSize: CHORE_CARD_TYPO.title, fontWeight: '800' },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, marginTop: 1 },
  taskMeta: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '600' },
  taskBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  taskBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  taskCoin: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
  taskDoneCoin: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 2 },
  choreHelper: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '700', marginTop: 2 },
  // The parent's decline note on a needs-redo chore — real information the
  // mock's own read-only reference has no field for; kept, not dropped.
  choreDeclineNote: {
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    padding: KIOSK_SPACE.sm, gap: 2, marginTop: KIOSK_SPACE.xs,
  },
  choreDeclineLabel: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '900', letterSpacing: 0.3 },
  choreDeclineText: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '600', lineHeight: CHORE_CARD_TYPO.meta * 1.4 },
  // Mock's own .task-action — a flat outlined pill that fills solid with
  // the button's own accent (Mark Done -> sage, Can't do this -> danger)
  // only when pressed, matching .task-action:hover's real behavior as
  // closely as a touch UI (no hover state) can.
  taskActionPair: { flexDirection: 'row', gap: KIOSK_SPACE.xs, marginTop: KIOSK_SPACE.xs, flexWrap: 'wrap' },
  taskActionBtn: {
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.md,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  taskActionText: { fontSize: CHORE_CARD_TYPO.button, fontWeight: '800' },

  poolMore: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  // Up for Grabs — flat mock-matched rows (KioskUpForGrabsPanel): divided
  // by a hairline, gold "+N" coin amount, sage-tinted Claim pill.
  poolFlatRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingVertical: KIOSK_SPACE.sm,
  },
  poolFlatTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  poolFlatMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 1 },
  poolFlatCoin: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  poolFlatClaimBtn: {
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  poolFlatClaimText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
});
