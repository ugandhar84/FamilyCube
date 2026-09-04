/**
 * KioskScheduleTab — a landscape 7-day week strip (not the phone's Month/
 * Week/Agenda/Day switcher — there's room here to just always show the
 * week). Tap a day to add an event via KioskEventComposer, tap an event
 * chip to edit/delete via KioskEventEditor. Writes go through the same
 * eventStore actions (addEvent/updateEvent/deleteEvent) the phone's
 * EventFormModal already uses.
 *
 * Redesigned to use this app's own per-person color system (assigneeStyle/
 * MultiPersonTimeFill — built for Calendar/Agenda earlier) instead of one
 * flat teal accent on every chip: each event now reads whose it is at a
 * glance, a card with more than one person gets the same diagonal tint the
 * phone app's calendar already uses, and a member filter row along the top
 * lets whoever's at the fridge focus on just one person's week.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { TYPO, LETTER_SPACING } from '@/constants/theme';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { localDateStr } from '@/lib/dates';
import { assigneeStyle, MultiPersonTimeFill } from '@/features/calendar/components/EventCard';
import { KioskEventComposer } from '../components/KioskEventComposer';
import { KioskEventEditor } from '../components/KioskEventEditor';

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

export function KioskScheduleTab({ members, colors, isDark }: { members: FamilyMember[]; colors: any; isDark: boolean }) {
  const rangeEvents = useEventStore(s => s.rangeEvents);
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart],
  );

  const todayStr = localDateStr(new Date());

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

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={[s.title, { color: colors.textPrimary }]}>Schedule</Text>
          <Text style={[s.range, { color: colors.textSecondary }]}>
            {days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
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

      <View style={s.week}>
        {days.map(d => {
          const dateStr = localDateStr(d);
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
                  const involvedIds = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
                  const involved = involvedIds.map(id => members.find(m => m.id === id)).filter(Boolean) as FamilyMember[];
                  const primary = involved[0];
                  const rs = assigneeStyle(primary, colors, isDark);
                  const multiColors = involved.length > 1 ? involved.map(m => assigneeStyle(m, colors, isDark).dot) : null;
                  return (
                    <Pressable key={ev.id} onPress={() => setEditingEvent(ev)}
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
              <Pressable onPress={() => setComposerDate(dateStr)} style={[s.addDay, { borderColor: colors.border }]}>
                <Plus size={14} color={colors.textTertiary} />
              </Pressable>
            </View>
          );
        })}
      </View>

      <KioskEventComposer
        date={composerDate}
        onClose={() => setComposerDate(null)}
        colors={colors}
        isDark={isDark}
      />
      <KioskEventEditor
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  header: { marginBottom: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '800' },
  range: { fontSize: TYPO.caption, fontWeight: '700', marginTop: 2 },
  // Same fix as KioskTasksTab's stat strip — a horizontal ScrollView with
  // no explicit height of its own can stretch vertically in some layout
  // contexts; flexGrow:0 pins it to its pill content's real height.
  filterRowOuter: { flexGrow: 0 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
  filterText: { fontSize: 12, fontWeight: '800' },
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
});
