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
  CalendarClock, CheckSquare, Sparkles, RotateCcw,
  Coins, CheckCircle2, Camera, type LucideIcon,
} from 'lucide-react-native';

import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import type { Quest } from '@/store/questStore';
import { useChoreStore } from '@/store/choreStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { fmtTime } from '@/lib/dates';
import { showToast } from '@/components/AppToast';

import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { kioskOnAccent, type KioskColors } from '../kioskPalette';
import { COLUMN_STATUSES, visibleQuestsFor, poolQuestsIn, questTimeline, kioskQuestMeta } from '../kidQuestLanes';
import { WidgetCard, WidgetHeader, Well, Chip, ActionButton, EmptyNote } from './KioskOS';
import { KioskCantDoThisDialog } from './KioskCantDoThisDialog';
import { CollapsibleQuestCard } from '@/features/quests/components/CollapsibleQuestCard';

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
  // The LABELS now match the phone card's wording rather than kiosk's own
  // terse verbs, since matching that card is the point: its submit button
  // reads "Mark Done → Get Paid" (or "Take Photo to Get Paid" when the
  // chore requires proof), and its redo button "Revise & Resubmit"
  // (KidQuestCard.tsx:263-306). Kiosk drops the phone's own leading glyph
  // (✓/↩) on both — each button already renders a real Icon component
  // right next to the label, so a second, textual checkmark/arrow read as
  // a duplicate. The ACTIONS are unchanged — the same claimQuest /
  // submitQuest / approveQuest from choreAdapter this widget already
  // wired.
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
          label: 'Take Photo to Get Paid', accent: k.sage, Icon: Camera,
          action: () => { onOpenTasks(); },
        };
      }
      return {
        label: 'Mark Done → Get Paid', accent: k.sage, Icon: CheckCircle2,
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
      <WidgetHeader
        Icon={CheckSquare} eyebrow="Chores" title="My chores"
        accent={k.gold} k={k} isDark={isDark}
        right={totalMine > 0
          ? <Chip label={`${totalMine} open`} accent={k.gold} isDark={isDark} k={k} />
          : undefined}
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
                {
                  backgroundColor: isSelected ? accent + (isDark ? '33' : '22') : on ? accent + (isDark ? '1F' : '14') : k.well,
                  borderColor: isSelected ? accent : on ? accent + (isDark ? '45' : '38') : k.cardBorder,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${b.items.length} ${b.label}`}
            >
              <Text
                style={[s.statusCount, { color: on || isSelected ? accent : k.textFaint }]}
                numberOfLines={1}
              >
                {b.items.length}
              </Text>
              <Text
                style={[s.statusLabel, { color: on || isSelected ? accent : k.textFaint }]}
                numberOfLines={2}
              >
                {b.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The selected tab's chores. Live-reported: an inner ScrollView here
          (and, on retry, a FlatList with nestedScrollEnabled) didn't
          reliably claim the scroll gesture from the Overview's own outer
          ScrollView (KioskOverviewTab.tsx) — scrolling here scrolled the
          whole Hub instead. Nested vertical scroll-in-scroll is unreliable
          on RN regardless of which list component or Android-only prop is
          used, so this sidesteps it entirely: a flat, non-scrolling list
          capped to 3 rows (matching "Up for grabs" below, which already
          uses the same cap-and-link pattern for its own overflow), with a
          "See N more" link into the real Tasks tab — which has its own,
          legitimately scrollable, non-nested board — instead of trying to
          scroll inside this card at all. Each visible row still gets the
          SAME primary action button the Chores board shows (Claim /
          Submit / Resubmit / Approve, via the same deriveQuestActions gate
          just above) — this was previously read-only title+coins with no
          way to act without switching tabs. */}
      {selected && (
        selected.items.length === 0 ? (
          <EmptyNote text={`Nothing in ${selected.label} right now.`} k={k} style={{ marginBottom: KIOSK_SPACE.sm }} />
        ) : (
          <View style={{ gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.sm }}>
            {selected.items.slice(0, 3).map(q => (
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
            {selected.items.length > 3 && (
              <Pressable onPress={onOpenTasks} accessibilityRole="button" accessibilityLabel={`See ${selected.items.length - 3} more in ${selected.label}`}>
                <Text style={[s.poolMore, { color: accentFor(selected.key) }]} numberOfLines={1}>
                  See {selected.items.length - 3} more in {selected.label} →
                </Text>
              </Pressable>
            )}
          </View>
        )
      )}

      {/* Up for grabs. Kept to the top three so this stays a glance — the
          Chores tab is one tap away for the rest, and the count on the
          header says how many there really are. */}
      <View style={s.poolHead}>
        <Sparkles size={16} color={k.purple} />
        <Text style={[s.poolHeadText, { color: k.purple }]} numberOfLines={1}>Up for grabs</Text>
        <Chip
          label={`${pool.length}`}
          accent={pool.length > 0 ? k.purple : k.textFaint}
          isDark={isDark} k={k}
        />
      </View>

      {pool.length === 0 ? (
        <EmptyNote text="No bounty chores right now." k={k} />
      ) : (
        <View style={{ gap: KIOSK_SPACE.xs }}>
          {/* Claim right here — the whole point of surfacing "up for grabs"
              on a shared kiosk widget is that a kid standing at the counter
              shouldn't have to switch to the Chores tab just to take one.
              Same real action the board itself uses: claimQuest(id,
              active.id), the exact race-safe claim every other kiosk claim
              button calls — a sibling claiming the same bounty a moment
              earlier is resolved store-side, not re-derived here. */}
          {pool.slice(0, 3).map(q => (
            <Well key={q.id} k={k} accent={k.purple} style={s.poolRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.poolTitle, { color: k.text }]} numberOfLines={1}>{q.title}</Text>
                {q.coins > 0 && (
                  <Text style={[s.poolCoins, { color: k.gold }]} numberOfLines={1}>
                    {q.coins}
                    <Text style={[s.poolCoinsUnit, { color: k.textMuted }]}> coins</Text>
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => {
                  claimQuest(q.id, active.id);
                  showToast(`Claimed "${q.title}" ✓`);
                }}
                style={({ pressed }) => [
                  s.poolClaimBtn,
                  { backgroundColor: k.purple, opacity: pressed ? 0.75 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Claim ${q.title}`}
                accessibilityHint={q.coins > 0 ? `Worth ${q.coins} coins` : undefined}
              >
                <Text style={[s.poolClaimText, { color: kioskOnAccent(k, k.purple) }]} numberOfLines={1}>
                  Claim
                </Text>
              </Pressable>
            </Well>
          ))}
          {pool.length > 3 && (
            <Text style={[s.poolMore, { color: k.textFaint }]} numberOfLines={1}>
              and {pool.length - 3} more up for grabs
            </Text>
          )}
        </View>
      )}

      <ActionButton
        label={pool.length > 3 ? 'See all bounty chores' : 'Open my chores'}
        accent={pool.length > 0 ? k.purple : k.gold}
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
// status pill, since it's peer to a badge/tag, not a headline).
const CHORE_CARD_TYPO = {
  title: 14.5,
  badge: 12.5,
  meta: 12,
  button: 13.5,
} as const;

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
  const meta = kioskQuestMeta(q, k);
  const timeline = questTimeline(q);
  const inReview = q.status === 'pending_approval';
  // questTimeline() joins every stage ("Claimed ... → Submitted ... →
  // Approved ...") into one string for the pinned meta row's 1-line
  // summary; the expanded view below splits it back out so a chore with
  // more than one stage doesn't get clipped there.
  const timelineStages = timeline ? timeline.split(' → ') : [];

  return (
    <CollapsibleQuestCard
      accentColor={meta.accent}
      cardBg={k.card}
      cardBord={k.cardBorder}
      header={
        // Two explicit rows, not one flex-wrapping row — a title long
        // enough to wrap used to push the coin badge and status pill to
        // unpredictable positions (sometimes both trailing the title's
        // second line, sometimes split across two lines themselves)
        // depending on exact pixel widths. Row 1 is the title alone, at
        // its own full width; row 2 is always coins + status together,
        // so the header reads as a fixed, predictable 2-line shape no
        // matter how long a chore's name is. Live-reported reference
        // screenshot (the phone's own KidQuestCard) shows this exact
        // shape — comfortably sized pills on their own row, not squeezed
        // onto the title's row — which is what this now matches.
        <View style={s.choreCardHeader}>
          <Text style={[s.choreTitle, { color: k.text }]} numberOfLines={2}>{q.title}</Text>
          <View style={s.choreCardBadgeRow}>
            {q.coins > 0 && (
              <View
                style={[s.coinBadge, { backgroundColor: k.well, borderColor: k.goldEdge }]}
                accessibilityLabel={`Worth ${q.coins} coins`}
              >
                <Coins size={13} color={k.gold} />
                <Text style={[s.coinBadgeText, { color: k.gold }]} numberOfLines={1}>{q.coins}</Text>
              </View>
            )}
            <View
              style={[s.statusPill, { backgroundColor: k.well, borderColor: meta.accent }]}
              accessibilityLabel={`Status: ${meta.label.toLowerCase()}`}
            >
              <meta.Icon size={12} color={meta.accent} />
              <Text style={[s.statusPillText, { color: meta.accent }]} numberOfLines={1}>{meta.label}</Text>
            </View>
          </View>
        </View>
      }
      // Live-reported with a screenshot of the phone's own card: the action
      // buttons (and the claimed-date / progress line above them) are
      // ALWAYS visible there, not hidden behind the chevron tap the way
      // this card's CollapsibleQuestCard shell defaults to. pinnedFooter is
      // exactly that escape hatch — rendered outside the collapsible body,
      // so a kid sees "Mark Done → Get 10 Coins" without expanding
      // anything. Only the timeline text (a "collapsed by default, more
      // detail on tap" nicety) stays as real collapsible `children` below.
      pinnedFooter={
        <>
          {(!!timeline || inReview) && (
            <View style={[s.choreMetaRow, { borderTopColor: k.cardBorder }]}>
              {!!timeline && (
                <Text style={[s.choreTimeline, { color: k.textFaint }]} numberOfLines={1}>{timeline}</Text>
              )}
              {inReview && (
                <Text style={[s.choreHelper, { color: k.gold }]} numberOfLines={1}>
                  Waiting on a parent to review
                </Text>
              )}
            </View>
          )}

          {btn && (
            <View style={s.choreActions}>
              <Pressable
                onPress={btn.action}
                style={({ pressed }) => [
                  s.choreBtn, s.choreBtnPrimary,
                  { backgroundColor: btn.accent, borderColor: btn.accent },
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${btn.label}: ${q.title}`}
                accessibilityHint={q.coins > 0 ? `Worth ${q.coins} coins` : undefined}
              >
                <btn.Icon size={13} color={kioskOnAccent(k, btn.accent)} />
                <Text
                  style={[s.choreBtnText, { color: kioskOnAccent(k, btn.accent) }]}
                  numberOfLines={1}
                >
                  {btn.label}
                </Text>
              </Pressable>

              {showDecline && (
                <Pressable
                  onPress={onDecline}
                  style={({ pressed }) => [
                    s.choreBtn, s.choreBtnGhost,
                    { borderColor: k.dangerEdge, backgroundColor: k.card },
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Can't do this: ${q.title}`}
                  accessibilityHint="Give a reason and put this chore back up for grabs"
                >
                  <Text style={[s.choreBtnText, { color: k.danger }]} numberOfLines={1}>
                    Can't do this
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </>
      }
    >
      {/* Live-reported: "add the expanded [content] in the expanded view"
          — with the meta line/buttons now always visible in pinnedFooter,
          the chevron had nothing left to show. Real detail behind it now:
          the full stage-by-stage timeline (the pinned meta row above only
          shows it truncated to 1 line, which clips a chore that's been
          claimed AND submitted AND approved), plus the parent's own note
          on a declined/needs-redo chore — a real field (declineReason)
          that had no home anywhere on this card before. */}
      {timelineStages.length > 0 && (
        <View style={s.choreExpandedTimeline}>
          {timelineStages.map((stage, i) => (
            <Text key={i} style={[s.choreTimelineStage, { color: k.textMuted }]} numberOfLines={1}>
              {stage}
            </Text>
          ))}
        </View>
      )}
      {!!q.declineReason && (
        <View style={[s.choreDeclineNote, { backgroundColor: k.dangerSoft, borderColor: k.dangerEdge }]}>
          <Text style={[s.choreDeclineLabel, { color: k.danger }]} numberOfLines={1}>Parent's note</Text>
          <Text style={[s.choreDeclineText, { color: k.text }]} numberOfLines={4}>{q.declineReason}</Text>
        </View>
      )}
    </CollapsibleQuestCard>
  );
}

const s = StyleSheet.create({
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
  choreCardHeader: { gap: 6 },
  choreCardBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  choreTitle: { fontSize: CHORE_CARD_TYPO.title, fontWeight: '800' },
  // Badges/pills sit on `k.card`, not on a tint of their own accent: they
  // are already inside a status-tinted card, and a tint on a tint muddies
  // both. A solid card-colored chip reads as lifted off the wash.
  coinBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 5,
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
  },
  coinBadgeText: { fontSize: CHORE_CARD_TYPO.badge, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 5,
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
  },
  statusPillText: { fontSize: CHORE_CARD_TYPO.badge, fontWeight: '800', letterSpacing: 0.3 },
  // The claimed-date / progress line, ALWAYS visible above the buttons in
  // pinnedFooter (see ChoreCardRow) — a hairline top border separates it
  // from the header, matching the reference screenshot's own divider.
  choreMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: KIOSK_SPACE.sm, marginTop: 2,
    gap: KIOSK_SPACE.sm,
  },
  choreTimeline: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '600' },
  choreHelper: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '700' },
  // Expanded (chevron-tapped) content — full stage-by-stage timeline and
  // the parent's decline note, both real detail with nowhere else to live
  // on this card now that the meta row/buttons are always visible.
  choreExpandedTimeline: { gap: 3, marginBottom: 6 },
  choreTimelineStage: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '600' },
  choreDeclineNote: {
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    padding: KIOSK_SPACE.sm, gap: 2,
  },
  choreDeclineLabel: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '900', letterSpacing: 0.3 },
  choreDeclineText: { fontSize: CHORE_CARD_TYPO.meta, fontWeight: '600', lineHeight: CHORE_CARD_TYPO.meta * 1.4 },
  // Side-by-side, primary weighted 2:1 over the outlined decline — the same
  // flex ratio the phone card uses for this exact pair. Always visible now
  // (pinnedFooter, not collapsible body) — see ChoreCardRow's own comment,
  // matching the live-reported reference screenshot of the phone's card.
  // Live-reported: "don't use bulky buttons" — pill-shaped (full radius)
  // and hugging KIOSK_HIT.min (kiosk's touch floor, still the non-
  // negotiable minimum) rather than a taller rectangular block with extra
  // padding on top of it, so this reads as a light, friendly tap target
  // instead of a heavy panel.
  choreActions: { flexDirection: 'row', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.sm },
  choreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.md,
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1.5,
  },
  choreBtnPrimary: { flex: 2 },
  choreBtnGhost: { flex: 1 },
  choreBtnText: { fontSize: CHORE_CARD_TYPO.button, fontWeight: '800', flexShrink: 1 },

  poolHead: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    marginBottom: KIOSK_SPACE.xs,
  },
  poolHeadText: { flex: 1, fontSize: KIOSK_TYPO.label, fontWeight: '900', letterSpacing: 0.4 },
  // Taller than the old title+coins-only row now that each one also carries
  // its own Claim button — minHeight alone doesn't add real breathing room
  // once content wraps to two lines (title stacked over coins), so this
  // uses vertical padding instead of just a floor.
  poolRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    minHeight: KIOSK_HIT.min + 8, paddingVertical: KIOSK_SPACE.xs,
  },
  // Caption, not body: this row carries a Claim button on the same line,
  // and at body size a real chore name truncates against it.
  poolTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  poolCoins: { fontSize: KIOSK_TYPO.caption, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 2 },
  poolCoinsUnit: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  poolMore: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  // Shrunk from KIOSK_SPACE.md horizontal padding + KIOSK_TYPO.label text:
  // that combination alone was wide enough to push a chore's title into
  // truncating on the same row. minWidth (not padding alone) is what keeps
  // this a real touch target at the new, tighter padding.
  poolClaimBtn: {
    minHeight: KIOSK_HIT.min, minWidth: 64, paddingHorizontal: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  poolClaimText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
});
