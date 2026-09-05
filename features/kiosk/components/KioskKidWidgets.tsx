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
import { CalendarClock, CheckSquare, Sparkles } from 'lucide-react-native';

import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { fmtTime } from '@/lib/dates';
import { showToast } from '@/components/AppToast';

import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { kioskOnAccent, type KioskColors } from '../kioskPalette';
import { COLUMN_STATUSES, visibleQuestsFor, poolQuestsIn } from '../kidQuestLanes';
import { WidgetCard, WidgetHeader, Well, Chip, ActionButton, EmptyNote } from './KioskOS';

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
  const { quests, claimQuest } = useQuestStore();

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

  const accentFor = (key: string) =>
    key === 'todo' ? k.gold
      : key === 'progress' ? k.blue
      : key === 'redo' ? k.danger
      : k.sage;

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

      {/* The selected tab's chores — scrollable, capped so this stays a
          widget and not a second copy of the full board. */}
      {selected && (
        selected.items.length === 0 ? (
          <EmptyNote text={`Nothing in ${selected.label} right now.`} k={k} style={{ marginBottom: KIOSK_SPACE.sm }} />
        ) : (
          <ScrollView
            style={s.bucketScroll}
            contentContainerStyle={{ gap: KIOSK_SPACE.xs }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {selected.items.map(q => (
              <Well key={q.id} k={k} accent={accentFor(selected.key)} style={s.bucketRow}>
                <Text style={[s.bucketTitle, { color: k.text }]} numberOfLines={1}>{q.title}</Text>
                {q.coins > 0 && (
                  <Text style={[s.poolCoins, { color: k.gold }]} numberOfLines={1}>
                    {q.coins}
                    <Text style={[s.poolCoinsUnit, { color: k.textMuted }]}> coins</Text>
                  </Text>
                )}
              </Well>
            ))}
          </ScrollView>
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
    </WidgetCard>
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
  // Selected-tab chore list — capped height, own scroll, so a bucket with
  // many items doesn't grow the whole widget card open-endedly.
  bucketScroll: { maxHeight: 168, marginBottom: KIOSK_SPACE.sm },
  bucketRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: KIOSK_SPACE.sm, minHeight: 44,
  },
  bucketTitle: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },

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
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.min + 8, paddingVertical: KIOSK_SPACE.xs,
  },
  poolTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  poolCoins: { fontSize: KIOSK_TYPO.body, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 2 },
  poolCoinsUnit: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  poolMore: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  poolClaimBtn: {
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  poolClaimText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
});
