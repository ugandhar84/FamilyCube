/**
 * KioskScheduleTab — Month/Week/Day switcher, per-person colored (assigneeStyle/
 * MultiPersonTimeFill, the same system Calendar/Agenda use on the phone).
 *
 * Previously a fixed 7-day week strip only, reasoning "there's room here to
 * just always show the week" — live-reported as a real gap ("calendar no
 * month date weekly views"), so this now offers all three, each redesigned
 * for a kiosk's arm's-length, tap-not-scroll-tiny-rows context rather than
 * a shrunk copy of the phone's own MonthGridView/WeekView/DaySlotView.
 * Reuses calendarDateHelpers' pure date math (buildMonthGrid/toDateStr/
 * addDays) so month-grid generation can't drift from the phone's own.
 *
 * Was also missing an explicit loadRange() call — CalendarScreen.tsx always
 * fetches its own range per view; this tab read rangeEvents directly with
 * nothing guaranteeing that range had ever been populated for a kiosk
 * session that never mounted the phone's own calendar screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { localDateStr } from '@/lib/dates';
import { buildMonthGrid, toDateStr, parseDate, addDays, MONTH_LABELS } from '../../calendar/components/calendarDateHelpers';
import { assigneeStyle, MultiPersonTimeFill } from '@/features/calendar/components/EventCard';
import { KioskEventComposer } from '../components/KioskEventComposer';
import { KioskEventEditor } from '../components/KioskEventEditor';

type ViewMode = 'month' | 'week' | 'day';

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

export function KioskScheduleTab({ members, colors, isDark }: { members: FamilyMember[]; colors: any; isDark: boolean }) {
  const rangeEvents = useEventStore(s => s.rangeEvents);
  const loadRange = useEventStore(s => s.loadRange);
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState(() => new Date());

  const todayStr = localDateStr(new Date());

  // Fetch exactly the window the active view needs — a month grid spans up
  // to 6 weeks either side of the calendar month, week/day only need their
  // own narrow slice. Re-fetches whenever the mode or cursor moves.
  useEffect(() => {
    if (viewMode === 'month') {
      const gridStart = buildMonthGrid(cursor.getFullYear(), cursor.getMonth()).find(c => c) ?? toDateStr(cursor);
      const grid = buildMonthGrid(cursor.getFullYear(), cursor.getMonth());
      const gridEnd = [...grid].reverse().find(c => c) ?? gridStart;
      loadRange(gridStart, gridEnd);
    } else if (viewMode === 'week') {
      const ws = startOfWeek(cursor);
      loadRange(toDateStr(ws), toDateStr(addDays(ws, 6)));
    } else {
      loadRange(toDateStr(cursor), toDateStr(cursor));
    }
  }, [viewMode, cursor, loadRange]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, FamilyEvent[]> = {};
    for (const ev of rangeEvents) {
      if (filterMemberId) {
        const involved = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
        if (!involved.includes(filterMemberId)) continue;
      }
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [rangeEvents, filterMemberId]);

  const involvedFor = (ev: FamilyEvent) => {
    const ids = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
    return ids.map(id => members.find(m => m.id === id)).filter(Boolean) as FamilyMember[];
  };

  const shiftCursor = (dir: 1 | -1) => {
    if (viewMode === 'month') setCursor(c => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    else if (viewMode === 'week') setCursor(c => addDays(c, dir * 7));
    else setCursor(c => addDays(c, dir));
  };

  const headerLabel = viewMode === 'month'
    ? `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : viewMode === 'week'
    ? (() => {
        const ws = startOfWeek(cursor);
        const we = addDays(ws, 6);
        return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      })()
    : cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.navRow}>
            <Pressable onPress={() => shiftCursor(-1)} style={[s.navBtn, { backgroundColor: colors.surface }]} hitSlop={8}>
              <ChevronLeft size={18} color={colors.textSecondary} />
            </Pressable>
            <View>
              <Text style={[s.title, { color: colors.textPrimary }]}>Schedule</Text>
              <Text style={[s.range, { color: colors.textSecondary }]}>{headerLabel}</Text>
            </View>
            <Pressable onPress={() => shiftCursor(1)} style={[s.navBtn, { backgroundColor: colors.surface }]} hitSlop={8}>
              <ChevronRight size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => setCursor(new Date())} style={[s.todayBtn, { borderColor: colors.border }]}>
              <Text style={[s.todayBtnText, { color: colors.textSecondary }]}>Today</Text>
            </Pressable>
          </View>

          <View style={[s.modeSwitch, { backgroundColor: colors.surface }]}>
            {(['month', 'week', 'day'] as ViewMode[]).map(mode => {
              const on = viewMode === mode;
              return (
                <Pressable key={mode} onPress={() => setViewMode(mode)}
                  style={[s.modeBtn, on && { backgroundColor: colors.primary }]}>
                  <Text style={[s.modeBtnText, { color: on ? '#fff' : colors.textSecondary }]}>
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRowOuter} contentContainerStyle={s.filterRow}>
          <Pressable onPress={() => setFilterMemberId(null)}
            style={[s.filterChip, { backgroundColor: !filterMemberId ? colors.primary : colors.surface, borderColor: !filterMemberId ? colors.primary : colors.border }]}>
            <Text style={[s.filterText, { color: !filterMemberId ? '#fff' : colors.textSecondary }]}>Everyone</Text>
          </Pressable>
          {members.map(m => {
            const rs = assigneeStyle(m, colors, isDark);
            const on = filterMemberId === m.id;
            return (
              <Pressable key={m.id} onPress={() => setFilterMemberId(on ? null : m.id)}
                style={[s.filterChip, { backgroundColor: on ? rs.dot : colors.surface, borderColor: on ? rs.dot : colors.border }]}>
                <Text style={{ fontSize: 13 }}>{m.emoji ?? '👤'}</Text>
                <Text style={[s.filterText, { color: on ? '#fff' : colors.textSecondary }]}>{m.name.split(' ')[0]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {viewMode === 'month' && (
        <MonthView cursor={cursor} eventsByDate={eventsByDate} todayStr={todayStr} colors={colors} isDark={isDark}
          involvedFor={involvedFor}
          onDayPress={(dateStr) => { setCursor(parseDate(dateStr)); setViewMode('day'); }} />
      )}
      {viewMode === 'week' && (
        <WeekView cursor={cursor} eventsByDate={eventsByDate} todayStr={todayStr} colors={colors} isDark={isDark}
          involvedFor={involvedFor} onEventPress={setEditingEvent} onAddDay={setComposerDate} />
      )}
      {viewMode === 'day' && (
        <DayView cursor={cursor} eventsByDate={eventsByDate} colors={colors} isDark={isDark}
          involvedFor={involvedFor} onEventPress={setEditingEvent}
          onAdd={() => setComposerDate(toDateStr(cursor))} />
      )}

      <KioskEventComposer date={composerDate} onClose={() => setComposerDate(null)} colors={colors} isDark={isDark} />
      <KioskEventEditor event={editingEvent} onClose={() => setEditingEvent(null)} colors={colors} isDark={isDark} />
    </View>
  );
}

// ── Month grid ───────────────────────────────────────────────────────────
function MonthView({ cursor, eventsByDate, todayStr, colors, isDark, involvedFor, onDayPress }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; todayStr: string; colors: any; isDark: boolean;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onDayPress: (dateStr: string) => void;
}) {
  const cells = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const weeks = useMemo(() => {
    const rows: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);

  return (
    <View style={s.monthRoot}>
      <View style={s.monthDow}>
        {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => (
          <Text key={d} style={[s.monthDowText, { color: colors.textTertiary }]}>{d}</Text>
        ))}
      </View>
      <View style={s.monthGrid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={s.monthWeekRow}>
            {week.map((dateStr, di) => {
              if (!dateStr) return <View key={di} style={s.monthCell} />;
              const isToday = dateStr === todayStr;
              const dayEvents = eventsByDate[dateStr] ?? [];
              const dayNum = parseDate(dateStr).getDate();
              return (
                <Pressable key={dateStr} onPress={() => onDayPress(dateStr)}
                  style={[s.monthCell, s.monthCellFilled, { borderColor: colors.border },
                    isToday && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                  <Text style={[s.monthDayNum, { color: isToday ? colors.primary : colors.textPrimary }]}>{dayNum}</Text>
                  <View style={s.monthDots}>
                    {dayEvents.slice(0, 4).map(ev => {
                      const primary = involvedFor(ev)[0];
                      const rs = assigneeStyle(primary, colors, isDark);
                      return <View key={ev.id} style={[s.monthDot, { backgroundColor: rs.dot }]} />;
                    })}
                    {dayEvents.length > 4 && (
                      <Text style={[s.monthMore, { color: colors.textTertiary }]}>+{dayEvents.length - 4}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Week strip (original design, extracted) ─────────────────────────────
function WeekView({ cursor, eventsByDate, todayStr, colors, isDark, involvedFor, onEventPress, onAddDay }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; todayStr: string; colors: any; isDark: boolean;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void; onAddDay: (dateStr: string) => void;
}) {
  const days = useMemo(() => {
    const ws = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [cursor]);

  return (
    <View style={s.week}>
      {days.map(d => {
        const dateStr = toDateStr(d);
        const isToday = dateStr === todayStr;
        const dayEvents = eventsByDate[dateStr] ?? [];
        return (
          <View key={dateStr} style={s.dayCol}>
            <View style={[s.dayHead, isToday && { borderBottomColor: colors.primary }]}>
              <Text style={[s.dow, { color: colors.textTertiary }]}>{d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</Text>
              <Text style={[s.dnum, { color: isToday ? colors.primary : colors.textPrimary }]}>{d.getDate()}</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {dayEvents.map(ev => {
                const involved = involvedFor(ev);
                const primary = involved[0];
                const rs = assigneeStyle(primary, colors, isDark);
                const multiColors = involved.length > 1 ? involved.map(m => assigneeStyle(m, colors, isDark).dot) : null;
                return (
                  <Pressable key={ev.id} onPress={() => onEventPress(ev)}
                    style={[s.evChip, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: rs.dot, overflow: 'hidden' }]}>
                    {multiColors && <MultiPersonTimeFill hexColors={multiColors} scrimColor={colors.card} size={60} radius={0} />}
                    <Text style={[s.evTitle, { color: colors.textPrimary }]} numberOfLines={2}>{ev.title}</Text>
                    {!!ev.time && <Text style={[s.evTime, { color: colors.textSecondary }]}>{ev.time}</Text>}
                    {involved.length > 0 && (
                      <Text style={[s.evWho, { color: rs.dot }]} numberOfLines={1}>
                        {involved.map(m => m.name.split(' ')[0]).join(', ')}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => onAddDay(dateStr)} style={[s.addDay, { borderColor: colors.border }]}>
              <Plus size={14} color={colors.textTertiary} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// ── Day — hour-by-hour agenda, richer than a single strip column since a
// day view has the whole kiosk width to spend on it. ──────────────────────
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;

function DayView({ cursor, eventsByDate, colors, isDark, involvedFor, onEventPress, onAdd }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; colors: any; isDark: boolean;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void; onAdd: () => void;
}) {
  const dateStr = toDateStr(cursor);
  const dayEvents = useMemo(
    () => (eventsByDate[dateStr] ?? []).slice().sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [eventsByDate, dateStr],
  );
  const timed = dayEvents.filter(ev => !!ev.time);
  const allDay = dayEvents.filter(ev => !ev.time);
  const hours = useMemo(() => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i), []);

  const eventsAtHour = (h: number) => timed.filter(ev => {
    const hr = parseInt(ev.time!.split(':')[0], 10);
    return hr === h;
  });

  return (
    <ScrollView style={s.dayRoot} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {allDay.length > 0 && (
        <View style={s.dayAllDayRow}>
          {allDay.map(ev => {
            const involved = involvedFor(ev);
            const rs = assigneeStyle(involved[0], colors, isDark);
            return (
              <Pressable key={ev.id} onPress={() => onEventPress(ev)}
                style={[s.dayAllDayChip, { backgroundColor: rs.badge, borderColor: rs.dot + '55' }]}>
                <Text style={[s.dayAllDayText, { color: rs.text }]} numberOfLines={1}>{ev.title}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {hours.map(h => {
        const hourEvents = eventsAtHour(h);
        const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
        return (
          <View key={h} style={[s.dayHourRow, { borderTopColor: colors.border }]}>
            <Text style={[s.dayHourLabel, { color: colors.textTertiary }]}>{label}</Text>
            <View style={s.dayHourEvents}>
              {hourEvents.map(ev => {
                const involved = involvedFor(ev);
                const rs = assigneeStyle(involved[0], colors, isDark);
                const multiColors = involved.length > 1 ? involved.map(m => assigneeStyle(m, colors, isDark).dot) : null;
                return (
                  <Pressable key={ev.id} onPress={() => onEventPress(ev)}
                    style={[s.dayEventCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: rs.dot, overflow: 'hidden' }]}>
                    {multiColors && <MultiPersonTimeFill hexColors={multiColors} scrimColor={colors.card} size={60} radius={0} />}
                    <Text style={[s.dayEventTitle, { color: colors.textPrimary }]} numberOfLines={1}>{ev.title}</Text>
                    <Text style={[s.dayEventTime, { color: colors.textSecondary }]}>{ev.time}{ev.endTime ? ` – ${ev.endTime}` : ''}</Text>
                    {involved.length > 0 && (
                      <Text style={[s.evWho, { color: rs.dot }]} numberOfLines={1}>
                        {involved.map(m => m.name.split(' ')[0]).join(', ')}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <Pressable onPress={onAdd} style={[s.dayAddBtn, { backgroundColor: colors.primary }]}>
        <Plus size={16} color="#fff" />
        <Text style={s.dayAddBtnText}>Add Event</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  header: { marginBottom: 16, gap: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  todayBtnText: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  range: { fontSize: TYPO.caption, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  modeSwitch: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 2 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9 },
  modeBtnText: { fontSize: 13, fontWeight: '800' },
  // Was: no explicit height on the ScrollView itself (only on its
  // contentContainerStyle) — in a plain flex column, a horizontal
  // ScrollView with an unbounded cross-axis can stretch to fill leftover
  // vertical space instead of hugging its own pill content.
  filterRowOuter: { flexGrow: 0 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
  filterText: { fontSize: 12, fontWeight: '800' },

  // Week
  week: { flex: 1, flexDirection: 'row', gap: 8 },
  dayCol: { flex: 1 },
  dayHead: { alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  dow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  dnum: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  evChip: { borderRadius: 10, borderWidth: 1, borderLeftWidth: 3, padding: 8, position: 'relative' },
  evTitle: { fontSize: 11, fontWeight: '700' },
  evTime: { fontSize: 9.5, fontWeight: '600', marginTop: 2 },
  evWho: { fontSize: 9, fontWeight: '800', marginTop: 3 },
  addDay: { marginTop: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', paddingVertical: 8 },

  // Month
  monthRoot: { flex: 1 },
  monthDow: { flexDirection: 'row', marginBottom: 6 },
  monthDowText: { flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  monthGrid: { flex: 1, gap: 6 },
  monthWeekRow: { flex: 1, flexDirection: 'row', gap: 6 },
  monthCell: { flex: 1 },
  monthCellFilled: { borderRadius: 12, borderWidth: 1, padding: 8 },
  monthDayNum: { fontSize: 13, fontWeight: '800' },
  monthDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 6 },
  monthDot: { width: 7, height: 7, borderRadius: 3.5 },
  monthMore: { fontSize: 9, fontWeight: '800' },

  // Day
  dayRoot: { flex: 1 },
  dayAllDayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  dayAllDayChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  dayAllDayText: { fontSize: 12, fontWeight: '800' },
  dayHourRow: { flexDirection: 'row', minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 12 },
  dayHourLabel: { width: 56, fontSize: 11, fontWeight: '700', paddingTop: 2 },
  dayHourEvents: { flex: 1, gap: 8 },
  dayEventCard: { borderRadius: 12, borderWidth: 1, borderLeftWidth: 3, padding: 12, position: 'relative' },
  dayEventTitle: { fontSize: TYPO.body, fontWeight: '800' },
  dayEventTime: { fontSize: 11.5, fontWeight: '700', marginTop: 3 },
  dayAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 20 },
  dayAddBtnText: { color: '#fff', fontSize: TYPO.body, fontWeight: '800' },
});
