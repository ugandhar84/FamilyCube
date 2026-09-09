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
  Coins, CheckCircle2, Camera, ClipboardList, Clock3, XCircle, Check, ChevronRight, ChevronDown, type LucideIcon,
} from 'lucide-react-native';

import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import type { Quest } from '@/store/questStore';
import { useChoreStore } from '@/store/choreStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore, REQUEST_META, type KidRequest, type KidRequestItem } from '@/store/kidRequestStore';
import { FlashBonusBadge } from '@/features/quests/components/FlashBonusBadge';
import { KidRequestsSheet, KioskKidCheerList } from './KioskKidQuickActions';
import { useKioskAskParent, ASK_PARENT_OPTIONS } from './KioskAskParentFlow';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { fmtTime } from '@/lib/dates';
import { showToast } from '@/components/AppToast';

import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { kioskOnAccent, type KioskColors } from '../kioskPalette';
import { useKioskFonts, KIOSK_FONT } from '../kioskFonts';
import { visibleQuestsFor, poolQuestsIn } from '../kidQuestLanes';
import { WidgetCard, WidgetHeader, PanelHead, Well, Chip, ActionButton, EmptyNote } from './KioskOS';
import { KioskFormDrawer } from './KioskFormDrawer';
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

  // Mock's own 4-pill filter set exactly: All / Needs review / To do /
  // Done — a real, different shape from the Chores board's own 4
  // COLUMN_STATUSES lanes (todo/progress/redo/review), which have no
  // direct 1:1 mapping onto the mock's simpler 3 named filters (the mock
  // has no separate "in progress" or "needs redo" pill, and no "Done"
  // lane existed in this widget at all before now — completed chores were
  // simply never shown here). Folded without losing any real status:
  // "To do" = todo + in-progress/claimed (not yet submitted), "Needs
  // review" = pending_approval + declined (needs a parent's attention
  // either way), "Done" = approved/done (a real bucket, newly added to
  // this widget rather than continuing to exclude completed chores
  // entirely) [live-requested: "still MY tasks section is not matching
  // with MOCK filterpills"].
  const FILTERS: { key: string; label: string; statuses: string[] }[] = [
    { key: 'all',    label: 'All',          statuses: [] },
    { key: 'review', label: 'Needs review', statuses: ['pending_approval', 'declined'] },
    { key: 'todo',   label: 'To do',        statuses: ['todo', 'claimed', 'in_progress'] },
    { key: 'done',   label: 'Done',         statuses: ['approved', 'done'] },
  ];

  const mine = useMemo(
    () => visible.filter(q => !poolIds.has(q.id) && q.assignedToId === active.id),
    [visible, poolIds, active.id],
  );

  const buckets = useMemo(() => FILTERS.map(f => ({
    key: f.key,
    label: f.label,
    items: f.key === 'all' ? mine : mine.filter(q => f.statuses.includes(q.status)),
  })), [mine]);

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

  // mine.length, not a sum across buckets — "all" is one of the buckets
  // now (matching the mock's own always-present All pill), so summing
  // every bucket's own item count would double-count each chore once for
  // "all" and again for whichever specific status it's actually in.
  const totalMine = mine.length;

  // Mock's own default selected pill is "All" — matches its screenshot
  // (the All pill shown active/filled) rather than auto-jumping to
  // whichever status has something in it.
  const [activeBucket, setActiveBucket] = useState<string>('all');
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
          Chores tab.

          Rebuilt to match the mock's own exact .chip/.chip.active shape
          (screenshot reference) — a single-row scroller of flat pills,
          label + inline "(N)" count, all the same neutral surface/text
          color; only the SELECTED pill fills solid with k.text/k.card
          (page ink), no per-status accent tinting anywhere — not the
          earlier 4-cell grid with big stacked numbers and per-status
          accent colors [live-requested: "still MY tasks section is not
          matching with MOCK filterpills"]. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statusStripScroll}>
        <View style={s.statusStrip}>
          {buckets.map(b => {
            const isSelected = b.key === activeBucket;
            return (
              <Pressable
                key={b.key}
                onPress={() => setActiveBucket(b.key)}
                style={[
                  s.chip,
                  { backgroundColor: isSelected ? k.text : k.well, borderColor: isSelected ? k.text : k.cardBorder },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${b.label}, ${b.items.length}`}
              >
                <Text
                  style={[s.chipText, { color: isSelected ? k.card : k.text }]}
                  numberOfLines={1}
                >
                  {b.label} <Text style={{ opacity: 0.6 }}>({b.items.length})</Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

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

      {/* Quiet text link, not a filled button — same convention this
          sideCol's own "Reward Store" link (and parent's Coin Jars/Meals
          panels) already use [live-requested: "open my chores should be
          text link with >"]. */}
      <Pressable
        onPress={onOpenTasks}
        style={({ pressed }) => [s.panelTextLink, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Open my chores"
        accessibilityHint="Open the chores board"
      >
        <Text style={[s.panelTextLinkText, { color: k.gold }]}>Open my chores</Text>
        <ChevronRight size={14} color={k.gold} />
      </Pressable>

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

// KioskMyBalancePanel (a self-scoped coin panel in this sideCol) was
// removed per live feedback ("KioskMyBalancePanel - remove this
// completly"). Kid/teen balance now shows only in the persistent left
// column (KioskKidTeenStatsColumn.tsx, under the identity card). Teen's
// quick-actions grid lives in KioskMyStuffPanel below.

// ════════════════════════════════════════════════════════════════════════
// My Stuff — teen-only sideCol panel, the real 8-destination ask-a-parent
// grid [live-requested: "heer instead of balance we must show the quick
// actions right.. for teens" / "name as My STUFF that section" / "4 per
// row we can keep if possible.."]. Same real ASK_PARENT_OPTIONS data +
// open(key) action kid's own "Your stuff" card (KioskKidQuickActions) and
// KioskTasksTab's picker both already use; role-agnostic (confirmed by
// reading it: no kid-only assumption in the hook or ASK_PARENT_OPTIONS).
// ════════════════════════════════════════════════════════════════════════

export function KioskMyStuffPanel({
  active, members, k, isDark,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  k: KioskColors;
  isDark: boolean;
}) {
  const { open: openAskParent, node: askParentNode } = useKioskAskParent({ active, members });

  return (
    <WidgetCard k={k} isDark={isDark}>
      <PanelHead title="My stuff" k={k} />
      {/* 2 rows of the 4-per-row grid visible before scrolling, the rest
          scroll — 8 real options fit exactly 2 rows at 4-up. */}
      <ScrollView style={s.askGridScroll} showsVerticalScrollIndicator={false}>
        <View style={s.askGrid}>
          {ASK_PARENT_OPTIONS.map(opt => (
            <Pressable
              key={opt.key}
              onPress={() => openAskParent(opt.key)}
              style={({ pressed }) => [
                s.askTile,
                { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
              ]}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityHint={opt.desc}
            >
              <opt.Icon size={18} color={opt.accent(k)} />
              <Text style={[s.askTileLabel, { color: k.text }]} numberOfLines={2}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {askParentNode}
    </WidgetCard>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Cheer Squad — own sideCol panel, real kidCheerableQuests data via the
// same KioskKidCheerList component the Chores tab's own "Sibling Cheer"
// filter already renders (not re-derived), 4 rows visible before it
// scrolls [live-requested: "cheers sqard as a separate widget in the
// right most colum - show only 4 and rest in scroll view .. same for the
// teens as well"]. Role-agnostic — kidCheerableQuests/kidSiblingsOf carry
// no kid-only assumption, same as ASK_PARENT_OPTIONS above.
// ════════════════════════════════════════════════════════════════════════

export function KioskCheerSquadPanel({ active, members, k, isDark }: {
  active: FamilyMember;
  members: FamilyMember[];
  k: KioskColors;
  isDark: boolean;
}) {
  return (
    <WidgetCard k={k} isDark={isDark}>
      <PanelHead title="Cheer squad" k={k} />
      {/* KioskKidCheerList's own real rows are ~64px tall (heroQuick-scale
          avatar+text+button, cheerRow's KIOSK_HIT.primary min-height) plus
          the sm gap between them — 4 rows visible, rest scroll. Cheer
          itself opens a real centered sheet (KioskKidCheerList's own
          SendCheerSheet) rather than an inline note field in this small
          scroll — a field here had no reliable way to clear the on-screen
          keyboard [live-reported, after two failed scroll-into-view
          attempts: "lets show the diffrent sheet in center and enter
          notes and hit cheers?"]. */}
      <ScrollView style={s.cheerSquadScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <KioskKidCheerList active={active} members={members} k={k} isDark={isDark} />
      </ScrollView>
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
                {/* Meta + coins on the same row now, same "coins live next
                    to the status text" pattern My Tasks' own rows use
                    [live-requested: "move the coins nooneclaime yet row
                    with blinking.."].
                    Real time-limited bonus (q.bonusExpiresAt) gets the
                    exact real FlashBonusBadge — same component/live
                    countdown/pulse-faster-when-critical the Quests tab's
                    own QuestCard uses, not a kiosk reinvention.
                    [live-asked: "i think there is a timer right for this
                    claim and i belive we have some fomo logic to expire
                    it and auto assing with penalty and push bonus etc.."
                    / "is it parent triggerd or auto cron?" — verified by
                    reading the actual code, not assumed: PARENT-TRIGGERED
                    ONLY, no auto-cron. bonusCoins/bonusExpiresAt are only
                    ever set client-side when a parent applies
                    KioskAiChoresEngine.tsx's own Spark suggestion
                    (updateQuest). A server-side quest-sweep-cron function
                    DOES exist and once had exactly this "expire the FOMO
                    bonus → force-reassign + coin penalty" logic — but that
                    function's own header comment documents it was
                    deleted: it queried a `quests` table the real app
                    never uses (chore_tasks is the real table, with no
                    bonus_coins/bonus_expires_at columns at all), so those
                    branches were "dropped entirely rather than ported
                    onto columns that don't exist." Today, nothing
                    actually happens when this countdown hits zero except
                    the badge disappearing — it's a real field with no
                    server-side enforcement behind it, not a UI bug on my
                    part to fix here.] Otherwise a plain, non-pulsing coin
                    amount — nothing time-limited about it. */}
                <View style={s.poolFlatMetaRow}>
                  <Text style={[s.poolFlatMeta, { color: k.textFaint }]} numberOfLines={1}>
                    {q.assignedToId ? 'Claimed' : 'No one claimed yet'}
                  </Text>
                  {q.bonusExpiresAt && q.bonusCoins > 0 ? (
                    <FlashBonusBadge bonusCoins={q.coins + q.bonusCoins} expiresAt={q.bonusExpiresAt} />
                  ) : q.coins > 0 ? (
                    <Text style={[s.poolFlatCoin, { color: k.gold }]} numberOfLines={1}>+{q.coins}</Text>
                  ) : null}
                </View>
              </View>
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

// Grocery/supplies requests encode `detail` as a machine-readable payload
// (GROCERY_PREFIX/SUPPLIES_PREFIX + JSON, per KidModals.tsx's own
// encodeGroceryRequest/KioskSuppliesRequestSheet.tsx) rather than plain
// text — printing r.detail raw here showed the literal prefix+JSON string
// to a kid [live-reported screenshot: "my requests has the raw jason"].
// Same real priority the parent-facing GroceryRequestCard.tsx uses: prefer
// the real r.items (multi-item requests carry their own item names) over
// decoding detail, and never fall through to a still-encoded string.
const GROCERY_PREFIX = 'GROCERY_REQUEST:';
const SUPPLIES_PREFIX = 'SUPPLIES_REQUEST:';
export function requestDisplayTitle(r: { detail?: string | null; items?: { name: string }[] }, fallbackLabel?: string): string {
  if (r.items?.length) {
    return r.items.length === 1 ? r.items[0].name : `${r.items[0].name} +${r.items.length - 1} more`;
  }
  // r.detail is undefined/null for real request types that never set it
  // (e.g. a plain ride/permission/question ask) — calling .startsWith on
  // that crashed mid-render and blanked the whole panel
  // [live-reported: "what happen to the myrequest last 30days after you
  // fix that json raw it is disappered"], rather than the intended
  // graceful fallback.
  const detail = r.detail ?? '';
  const isEncoded = detail.startsWith(GROCERY_PREFIX) || detail.startsWith(SUPPLIES_PREFIX);
  if (!isEncoded) return detail || fallbackLabel || 'Request';
  try {
    const raw = detail.replace(GROCERY_PREFIX, '').replace(SUPPLIES_PREFIX, '');
    const parsed = JSON.parse(raw);
    if (parsed?.name) return parsed.name;
    if (Array.isArray(parsed?.items) && parsed.items.length) {
      return parsed.items.length === 1 ? parsed.items[0].name : `${parsed.items[0].name} +${parsed.items.length - 1} more`;
    }
  } catch { /* fall through to fallbackLabel */ }
  return fallbackLabel || 'Request';
}

// ════════════════════════════════════════════════════════════════════════
// KioskRequestDetailDrawer — the full request + response, opened by
// tapping a row in either My Requests panel (Overview sideCol) or the
// full-history KidRequestsSheet [live-requested: "when i click on
// dividual reuest it should open the side bar to show the complte
// request/responses" / "i eman i requested groceries or supplies how do
// that kid know what is capproved item level" / "my main concern is what
// is approved and ehat nor.."]. For a multi-item grocery/supplies request
// this is the ONLY place a kid can see PER-ITEM approve/reject status —
// every other surface (compact panel, history sheet) only ever showed one
// rolled-up status for the whole request, which hides that a parent
// approved half the list and rejected the rest. Real data only:
// KidRequestItem.status/approvedBy/rejectedBy/parentNote per item (set by
// the real parent approveItems/rejectItems flow), and the request's own
// top-level parentNote/respondedBy for a single-answer request with no
// item list.
// ════════════════════════════════════════════════════════════════════════

function itemStatusOf(status: string, k: KioskColors): { label: string; accent: string; Icon: LucideIcon } {
  if (status === 'approved') return { label: 'Approved', accent: k.sage, Icon: CheckCircle2 };
  if (status === 'rejected') return { label: 'Declined', accent: k.danger, Icon: XCircle };
  return { label: 'Waiting', accent: k.gold, Icon: Clock3 };
}

export function KioskRequestDetailDrawer({ request, members, k, isDark, onClose }: {
  request: KidRequest | null;
  members: FamilyMember[];
  k: KioskColors;
  isDark: boolean;
  onClose: () => void;
}) {
  const nameOf = (id?: string) => members.find(m => m.id === id)?.name?.trim().split(' ')[0];
  if (!request) return null;
  const meta = REQUEST_META[request.type];
  const st = requestStatusOf(request.status, k);
  const hasItems = !!request.items?.length;
  const title = requestDisplayTitle(request, meta?.label);

  return (
    <KioskFormDrawer
      visible={!!request}
      variant="drawer"
      title={title}
      subtitle={meta?.label}
      accent={st.accent}
      Icon={ClipboardList}
      k={k}
      onClose={onClose}
    >
      <View style={{ gap: KIOSK_SPACE.md }}>
        <View style={s.reqDetailStatusRow}>
          <st.Icon size={16} color={st.accent} />
          <Text style={[s.reqDetailStatusText, { color: st.accent }]}>{st.label}</Text>
          <Text style={[s.reqDetailMetaText, { color: k.textFaint }]}>
            {new Date(request.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>

        {/* Per-item breakdown — the whole reason this drawer exists for a
            grocery/supplies request. Each item keeps its OWN real status,
            not the request's rolled-up one. */}
        {hasItems ? (
          <View style={{ gap: KIOSK_SPACE.sm }}>
            <Text style={[s.reqDetailSectionLabel, { color: k.textMuted }]}>ITEMS ({request.items!.length})</Text>
            {request.items!.map((it: KidRequestItem) => {
              const ist = itemStatusOf(it.status, k);
              const by = it.status === 'approved' ? it.approvedBy : it.status === 'rejected' ? it.rejectedBy : undefined;
              // Real approvedAt/rejectedAt timestamps [live-requested:
              // "approved date and time is not shown"] — same 12h app-wide
              // format standard used everywhere else on this card.
              const at = it.status === 'approved' ? it.approvedAt : it.status === 'rejected' ? it.rejectedAt : undefined;
              const atLabel = at ? new Date(at).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
              }) : undefined;
              return (
                <View key={it.id} style={[s.reqDetailItemRow, { borderColor: k.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm }}>
                    <Text style={{ fontSize: 18 }}>{it.emoji ?? '🛒'}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.reqDetailItemName, { color: k.text }]} numberOfLines={1}>
                        {it.name}{it.qty ? ` · ${it.qty}` : ''}
                      </Text>
                      {!!it.store && (
                        <Text style={[s.reqDetailItemMeta, { color: k.textFaint }]} numberOfLines={1}>{it.store}</Text>
                      )}
                    </View>
                    <Chip label={ist.label} accent={ist.accent} isDark={isDark} k={k} />
                  </View>
                  {(by || atLabel || it.parentNote) && (
                    <Text style={[s.reqDetailItemNote, { color: k.textMuted }]} numberOfLines={3}>
                      {[by ? nameOf(by) : null, atLabel].filter(Boolean).join(' · ')}
                      {it.parentNote ? `${by || atLabel ? ' — ' : ''}“${it.parentNote}”` : ''}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <>
            <Text style={[s.reqDetailBody, { color: k.text }]}>{request.detail || meta?.label || 'Request'}</Text>
            {!!request.respondedBy && (
              <Text style={[s.reqDetailMetaText, { color: k.textFaint }]}>
                Answered by {nameOf(request.respondedBy)}
                {request.respondedAt ? ` · ${new Date(request.respondedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
              </Text>
            )}
            {!!request.parentNote && (
              <View style={[s.reqDetailNoteBox, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
                <Text style={[s.reqDetailNoteLabel, { color: k.textMuted }]}>Parent's note</Text>
                <Text style={[s.reqDetailNoteText, { color: k.text }]}>“{request.parentNote}”</Text>
              </View>
            )}
          </>
        )}
      </View>
    </KioskFormDrawer>
  );
}

// Tiny relative-time label for a compact row [live-requested: "also show
// the qpproved date time stap on the my rquest individual card tiny
// atleast" / "x ago or actual date/time"] — "just now"/"5m ago"/"3h
// ago"/"2d ago", falling back to a short date once it's old enough that
// "N ago" stops being a useful glance.
function agoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  // Full request+response drawer, opened by tapping any row
  // [live-requested: "when i click on dividual reuest it should open the
  // side bar to show the complte request/responses"].
  const [viewingRequest, setViewingRequest] = useState<KidRequest | null>(null);

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
            const displayTitle = requestDisplayTitle(r, meta?.label);
            return (
              <Pressable
                key={r.id}
                onPress={() => setViewingRequest(r)}
                style={({ pressed }) => [
                  s.reqCompactRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder },
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${displayTitle}, ${st.label}`}
                accessibilityHint="Opens the full request and response"
              >
                <Text style={s.reqCompactEmoji} numberOfLines={1}>{meta?.emoji ?? '📋'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.reqCompactTitle, { color: k.text }]} numberOfLines={1}>{displayTitle}</Text>
                  <Text style={[s.reqCompactMeta, { color: st.accent }]} numberOfLines={1}>
                    {st.label}{answered ? ` · ${answered}` : ''} · {agoLabel(r.respondedAt ?? r.requestedAt)}
                  </Text>
                </View>
                <ChevronRight size={16} color={k.textFaint} />
              </Pressable>
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
      <KioskRequestDetailDrawer
        request={viewingRequest} members={members} k={k} isDark={isDark}
        onClose={() => setViewingRequest(null)}
      />
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
  // Collapsed to title + meta row (2 lines) by default; the helper line
  // and Parent's note box only show once expanded [live-reported: "we
  // can show only 2 rows in the card rest we can keep t in expanded
  // mode"] — this row previously had no collapse state at all, so every
  // task's full detail printed inline regardless of how many were on
  // screen. Only offered when there's actually something to expand into.
  const hasExpandableContent = inReview || !!q.declineReason;
  const [expanded, setExpanded] = useState(false);

  const fontsLoaded = useKioskFonts();
  const fontExtrabold = fontsLoaded ? KIOSK_FONT.inter.extrabold : undefined;
  const fontSemibold = fontsLoaded ? KIOSK_FONT.inter.semibold : undefined;

  const RowShell = hasExpandableContent ? Pressable : View;

  return (
    <RowShell
      style={s.taskRow}
      {...(hasExpandableContent ? {
        onPress: () => setExpanded(e => !e),
        accessibilityRole: 'button' as const,
        accessibilityHint: expanded ? 'Collapses this chore' : 'Shows more detail about this chore',
      } : {})}
    >
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
          {/* Mock's own simple meta line ("Every day · kitchen", "Due
              tonight", "Completed Wednesday") — real recurrence/description/
              due-date fields, not invented copy: description (a kid's own
              real note on the chore) or a plain recurrence label when
              there's no description, falling back to the due date; a
              completed chore instead shows when it was approved.
              App-wide date format standard: "Mar 25, 2026" (abbreviated
              month, not full — live-requested: "date format should be
              Mar 25, 2026 12h format"), real 12-hour time. Was a raw
              "YYYY-MM-DD" q.dueDate string / a bare weekday name for the
              completed line — both real formatting bugs against that
              standard, not intentional. dueTime is already stored as a
              real display-formatted 12h string (e.g. "3:30 PM", via
              questFormShared's own fmtTimeLabel at write time —
              AddQuestModal.tsx's own `dueTime: fmtTimeLabel(dueDate)`),
              used as-is rather than re-parsed. */}
          <Text style={[s.taskMeta, { color: k.textFaint, fontFamily: fontSemibold, flexShrink: 1 }]} numberOfLines={1}>
            {(() => {
              if (isDone) {
                // A real, malformed q.approvedAt (not just missing) was
                // rendering literally as "Completed Invalid Date"
                // [live-reported screenshot] — new Date() on an
                // unparseable string produces an Invalid Date object,
                // which still passes the truthy `?` check but formats to
                // that exact literal string. Guard with isNaN on the
                // parsed time, same validity check used elsewhere for
                // this class of bug, so a bad timestamp falls back to no
                // date shown rather than a nonsense one.
                const approvedDate = q.approvedAt ? new Date(q.approvedAt) : null;
                return approvedDate && !isNaN(approvedDate.getTime())
                  ? `Completed ${approvedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : '';
              }
              // Due date/time takes priority whenever the chore actually
              // has one — was losing to the recurrence label for any
              // repeating chore (most real chores ARE recurring — "Feed
              // Biscuit," "Make my bed," etc.), which hid the real due
              // date/time behind "Every day" every time [live-requested:
              // "i still dint see due time"]. AddQuestModal always writes
              // dueTime alongside dueDate from the same picker value
              // (fmtTimeLabel(dueDate)), so a quest with a due date
              // essentially always has a real due time too. Recurrence
              // label is now only the fallback for a chore that somehow
              // has no due date/time at all, then description, then
              // nothing.
              const dueLabel = q.dueDate
                ? `Due ${new Date(q.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  + (q.dueTime ? ` · ${q.dueTime}` : '')
                : null;
              const recurLabel = q.isDaily || q.recurrence === 'daily' ? 'Every day'
                : q.recurrence === 'weekly' ? 'Every week'
                : q.recurrence === 'monthly' ? 'Every month'
                : null;
              return dueLabel || recurLabel || q.description || '';
            })()}
          </Text>
          {inReview && (
            <View style={[s.taskBadge, { backgroundColor: k.goldSoft }]}>
              <Text style={[s.taskBadgeText, { color: k.gold, fontFamily: fontExtrabold }]} numberOfLines={1}>PENDING</Text>
            </View>
          )}
          {/* Coins — moved inline with due date/time instead of stacked
              in the right-hand action column [live-requested: "coins can
              be shown in the row of duedate and time right"]. Sits right
              after the meta text/PENDING badge with the row's own normal
              gap spacing, not pushed out to the far right edge — that
              read as too far separated from the status it's paired with
              [live-requested: "pending status and the coins move closure
              to the due date and time" / "why coins pushed too far from
              status?"]. */}
          {!isDone && q.coins > 0 && (
            <Text style={[s.taskCoin, { color: k.gold }]} numberOfLines={1}>+{q.coins}</Text>
          )}
          {isDone && (
            <Text style={[s.taskDoneCoin, { color: k.textFaint }]} numberOfLines={1}>+{q.coins}</Text>
          )}
          {/* Small affordance marking this row as tappable for more detail
              — only shown when there actually IS more (inReview helper
              text or a declined chore's Parent's note), matching
              hasExpandableContent's own gate on the row's Pressable. */}
          {hasExpandableContent && (
            <ChevronDown
              size={14}
              color={k.textFaint}
              style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          )}
        </View>
        {/* Collapsed to title + meta row by default now — these two
            blocks only show once expanded [live-reported: "we can show
            only 2 rows in the card rest we can keep t in expanded
            mode"]. */}
        {expanded && inReview && (
          <Text style={[s.choreHelper, { color: k.gold, fontFamily: fontSemibold }]} numberOfLines={2}>
            Waiting on a parent to review this chore.
          </Text>
        )}
        {expanded && !!q.declineReason && (
          <View style={[s.choreDeclineNote, { backgroundColor: k.dangerSoft, borderColor: k.dangerEdge }]}>
            <Text style={[s.choreDeclineLabel, { color: k.danger, fontFamily: fontExtrabold }]} numberOfLines={1}>Parent's note</Text>
            <Text style={[s.choreDeclineText, { color: k.text, fontFamily: fontSemibold }]} numberOfLines={4}>{q.declineReason}</Text>
          </View>
        )}
      </View>

      {/* Action(s) — right-aligned column, coins moved up into the meta
          row (due date/time) instead [live-requested: "buttons are
          positions weired" / "coins can be shown in the row of duedate
          and time right"]. This app's real chores can carry a SECOND
          "Can't do this" button alongside the primary one, so the two are
          stacked here rather than trying to fit both on one line. */}
      <View style={s.taskRightCol}>

        {/* Mock's own disabled "Awaiting review" ghost pill for a chore
            with no available action (in review, waiting on a parent).
            Smaller than a real actionable button [live-reported: "looks
            like button on the my tasks also over sized awiting for
            review"] — this is a passive status label, not a control the
            standard KIOSK_HIT.min touch-target floor is meant for. */}
        {!isDone && !btn && inReview && (
          <View style={[s.taskGhostPill, { backgroundColor: k.well, borderColor: k.cardBorder, opacity: 0.6 }]}>
            <Text style={[s.taskGhostPillText, { color: k.textFaint, fontFamily: fontExtrabold }]} numberOfLines={1}>
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
                {/* Shortened visible label ("Can't do this" -> "Can't do")
                    so this pill sits comfortably beside Mark Done on one
                    row at kiosk scale [live-requested: "just use short
                    name"] — accessibilityLabel above keeps the full,
                    unambiguous phrasing for a screen reader. */}
                <Text style={[s.taskActionText, { color: k.danger, fontFamily: fontExtrabold }]} numberOfLines={1}>
                  Can't do
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </RowShell>
  );
}

const s = StyleSheet.create({
  // My requests (compact sideCol rows). 5 rows visible by default.
  reqListScroll: { maxHeight: 270 },
  // 4 rows visible (KIOSK_HIT.primary=56 each + KIOSK_SPACE.sm=10 gaps),
  // rest scroll [live-requested: "show only 4 and rest in scroll view"].
  cheerSquadScroll: { maxHeight: 254 },
  reqCompactRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingVertical: KIOSK_SPACE.xs, minHeight: KIOSK_HIT.min,
  },
  reqCompactEmoji: { fontSize: 18 },
  reqCompactTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  reqCompactMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', marginTop: 1 },

  // KioskRequestDetailDrawer.
  reqDetailStatusRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  reqDetailStatusText: { fontSize: KIOSK_TYPO.body, fontWeight: '800', flex: 1 },
  reqDetailMetaText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  reqDetailSectionLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 0.5 },
  reqDetailItemRow: {
    gap: 6, paddingVertical: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.sm,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
  },
  reqDetailItemName: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  reqDetailItemMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 1 },
  reqDetailItemNote: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  reqDetailBody: { fontSize: KIOSK_TYPO.body, fontWeight: '600', lineHeight: KIOSK_TYPO.body * 1.4 },
  reqDetailNoteBox: { gap: 4, padding: KIOSK_SPACE.sm, borderWidth: 1, borderRadius: KIOSK_RADIUS.sm },
  reqDetailNoteLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 0.5 },
  reqDetailNoteText: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },

  // My schedule.
  evRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: ROW_HEIGHT,
  },
  evTime: { width: 76, fontSize: KIOSK_TYPO.caption, fontWeight: '800', fontVariant: ['tabular-nums'] },
  evTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  evMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2 },

  // My tasks filter pills — mock's own flat .chip/.chip.active shape,
  // matched to its real CSS values (not the generic KIOSK_SPACE/HIT
  // tokens, which read visibly chunkier — KIOSK_HIT.min's 48px floor
  // alone made this pill roughly 50% taller than the mock's real ~31px
  // pill) [live-requested: "it is not matchign the pill shapes & sizes of
  // text with the mock"]: .chip{font-size:12px;font-weight:700;
  // padding:7px 13px;border-radius:999px}. A filter chip is a lighter,
  // denser control by the mock's own design — this doesn't carry kiosk's
  // usual 48px touch-target floor, same as it doesn't in the reference.
  statusStripScroll: { marginBottom: KIOSK_SPACE.sm },
  statusStrip: { flexDirection: 'row', gap: 8 },
  chip: {
    borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 13, paddingVertical: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  // ~76px per collapsed ChoreCardRow (2-line header + padding/border) + xs
  // gap, so 5 rows visible by default before scrolling — same bounded-
  // height + nestedScrollEnabled pattern FamilySchedulePanel/"Meals this
  // week"/"Grocery list" already use successfully in this same centerCol.
  choreListScroll: { maxHeight: 400 },
  // ~50px per poolRow + xs gap, 5 rows visible by default.
  poolListScroll: { maxHeight: 270 },
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
  // Teen's "My Stuff" panel — 2 rows of the 4-per-row grid visible before
  // scrolling, the rest scroll. Tile height bumped taller than the base
  // KIOSK_HIT.control per "can you make my stuff widger lil tollor?" /
  // "lil more taller please".
  askGridScroll: { maxHeight: (KIOSK_HIT.control + 26) * 2 + KIOSK_SPACE.xs },
  askGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  askTile: {
    flexBasis: '22%', flexGrow: 1, minHeight: KIOSK_HIT.control + 26, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: KIOSK_SPACE.md, paddingHorizontal: KIOSK_SPACE.xs,
  },
  // Smaller than KIOSK_TYPO.micro (12) per "also reduce the lable text to
  // smaller" — a literal size, matching the same deliberate-exception
  // pattern this file already uses for the filter chip text above.
  askTileLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  // Flat mock-matched task row (ChoreCardRow) — mock's own .task/.task-
  // check/.task-title/.task-meta/.badge/.task-coin/.task-action shapes.
  taskRow: {
    flexDirection: 'row', alignItems: 'stretch', gap: KIOSK_SPACE.sm,
    paddingVertical: KIOSK_SPACE.sm,
  },
  taskCheck: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
    alignSelf: 'flex-start',
  },
  taskMain: { flex: 1, minWidth: 0, gap: 2, alignSelf: 'flex-start' },
  taskTitle: { fontSize: CHORE_CARD_TYPO.title, fontWeight: '800' },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, marginTop: 1 },
  taskMeta: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '600' },
  taskBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  taskBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  // Mock's own .task-coin exactly: font-size:14px; font-weight:600 (not
  // extrabold — the coin amount is quieter than the mock's title/action
  // text, carrying its color rather than heavy weight for emphasis).
  taskCoin: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'right' },
  taskDoneCoin: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 2 },
  // Coins + action(s), stacked as one right-aligned column — see
  // ChoreCardRow's own comment on why these no longer sit as three loose
  // row siblings (coin amount + up to two buttons never fit on one line
  // at kiosk scale without wrapping oddly).
  // justifyContent: 'center' — was top-aligned only, so a row whose
  // title/meta column ran taller than the stacked action button(s) left
  // visible dead space below the button(s) instead of the pair sitting
  // centered against the row's real height [live-reported: "if i have
  // multiple buttons we should fit nicely to avoid crating more wihte
  // spce on the cards"].
  taskRightCol: { alignItems: 'flex-end', justifyContent: 'center', gap: KIOSK_SPACE.xs, flexShrink: 0 },
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
  // Side by side, not stacked — two smaller compact pills fit one row
  // fine at kiosk scale and read as a natural pair instead of leaving
  // dead space below a stacked, over-tall pair [live-reported: "done,
  // can't do these are 2 bugs and put in the same row with small buttons
  // right?"]. minHeight dropped from KIOSK_HIT.min (this pair sits beside
  // the already-large tap-target checkbox to their left, so these don't
  // need to independently meet the same floor) and padding tightened so
  // both fit comfortably on one line without wrapping.
  taskActionPair: { flexDirection: 'row', gap: KIOSK_SPACE.xs },
  taskActionBtn: {
    minHeight: 32, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  taskActionText: { fontSize: CHORE_CARD_TYPO.button, fontWeight: '800' },
  // Smaller than a real actionable taskActionBtn — a passive status
  // label, not a control.
  taskGhostPill: {
    paddingVertical: 6, paddingHorizontal: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end',
  },
  taskGhostPillText: { fontSize: 11, fontWeight: '800' },

  poolMore: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  // Up for Grabs — flat mock-matched rows (KioskUpForGrabsPanel), matched
  // to the mock's own real CSS values same as My Tasks' pills/coin above:
  // .bounty-title{font-size:13.5px;font-weight:700},
  // .bounty-meta{font-size:11.5px}, .bounty-coin{font-size:15px;
  // font-weight:600}, .claimbtn{font-size:11px;font-weight:700;
  // padding:7px 11px;border-radius:7px} — not the generic KIOSK_TYPO/HIT
  // tokens, which read visibly chunkier (same 48px-floor mismatch as the
  // filter pills) [live-requested: "now upfor grabs match the sme
  // stylings"].
  poolFlatRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingVertical: KIOSK_SPACE.sm,
  },
  poolFlatTitle: { fontSize: 13.5, fontWeight: '700' },
  poolFlatMetaRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, marginTop: 1 },
  poolFlatMeta: { fontSize: 11.5, fontWeight: '600' },
  poolFlatCoin: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  poolFlatClaimBtn: {
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  poolFlatClaimText: { fontSize: 11, fontWeight: '700' },
});
