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
import { useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { CalendarClock, CheckSquare, Sparkles } from 'lucide-react-native';

import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { fmtTime } from '@/lib/dates';

import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { type KioskColors } from '../kioskPalette';
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
  const { quests } = useQuestStore();

  // Same source of truth as the Chores board — see ../kidQuestLanes.
  const visible = useMemo(
    () => visibleQuestsFor(quests, members, { id: active.id, role: active.role }),
    [quests, members, active.id, active.role],
  );
  const pool = useMemo(() => poolQuestsIn(visible), [visible]);
  const poolIds = useMemo(() => new Set(pool.map(q => q.id)), [pool]);

  // The board's own four buckets, in the board's own words — a kid should
  // not have to translate between "Needs Redo" here and something else one
  // tab over.
  const buckets = useMemo(() => {
    const mine = visible.filter(q => !poolIds.has(q.id) && q.assignedToId === active.id);
    return COLUMN_STATUSES.map(col => ({
      key: col.key,
      label: col.label,
      count: mine.filter(q => col.statuses.includes(q.status)).length,
    }));
  }, [visible, poolIds, active.id]);

  const accentFor = (key: string) =>
    key === 'todo' ? k.gold
      : key === 'progress' ? k.blue
      : key === 'redo' ? k.danger
      : k.sage;

  const totalMine = buckets.reduce((n, b) => n + b.count, 0);

  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      <WidgetHeader
        Icon={CheckSquare} eyebrow="Chores" title="My chores"
        accent={k.gold} k={k} isDark={isDark}
        right={totalMine > 0
          ? <Chip label={`${totalMine} open`} accent={k.gold} isDark={isDark} k={k} />
          : undefined}
      />

      {/* Status breakdown. A four-up segmented strip rather than a list:
          the whole point is that it resolves in one glance from a few feet
          away, and a zero bucket is shown greyed rather than hidden so the
          strip's shape stays constant and readable as a shape. */}
      <View style={s.statusStrip}>
        {buckets.map(b => {
          const on = b.count > 0;
          const accent = accentFor(b.key);
          return (
            <View
              key={b.key}
              style={[
                s.statusCell,
                {
                  backgroundColor: on ? accent + (isDark ? '1F' : '14') : k.well,
                  borderColor: on ? accent + (isDark ? '45' : '38') : k.cardBorder,
                },
              ]}
              accessible
              accessibilityLabel={`${b.count} ${b.label}`}
            >
              <Text
                style={[s.statusCount, { color: on ? accent : k.textFaint }]}
                numberOfLines={1}
              >
                {b.count}
              </Text>
              <Text
                style={[s.statusLabel, { color: on ? accent : k.textFaint }]}
                numberOfLines={2}
              >
                {b.label}
              </Text>
            </View>
          );
        })}
      </View>

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
          {pool.slice(0, 3).map(q => (
            <Well key={q.id} k={k} accent={k.purple} style={s.poolRow}>
              <Text style={[s.poolTitle, { color: k.text }]} numberOfLines={1}>{q.title}</Text>
              {q.coins > 0 && (
                <Text style={[s.poolCoins, { color: k.gold }]} numberOfLines={1}>
                  {q.coins}
                  <Text style={[s.poolCoinsUnit, { color: k.textMuted }]}> coins</Text>
                </Text>
              )}
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
        label={pool.length > 0 ? 'Claim a chore' : 'Open my chores'}
        accent={pool.length > 0 ? k.purple : k.gold}
        k={k} isDark={isDark}
        variant={pool.length > 0 ? 'solid' : 'soft'}
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

  // My chores.
  statusStrip: { flexDirection: 'row', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.sm },
  statusCell: {
    flex: 1, minWidth: 0, borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingVertical: KIOSK_SPACE.sm, paddingHorizontal: 4, minHeight: KIOSK_HIT.min,
  },
  statusCount: { fontSize: KIOSK_TYPO.heading, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statusLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', textAlign: 'center' },

  poolHead: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    marginBottom: KIOSK_SPACE.xs,
  },
  poolHeadText: { flex: 1, fontSize: KIOSK_TYPO.label, fontWeight: '900', letterSpacing: 0.4 },
  poolRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: 44,
  },
  poolTitle: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  poolCoins: { fontSize: KIOSK_TYPO.body, fontWeight: '900', fontVariant: ['tabular-nums'] },
  poolCoinsUnit: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  poolMore: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
});
