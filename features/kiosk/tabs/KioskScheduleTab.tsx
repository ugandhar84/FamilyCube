/**
 * KioskScheduleTab — a landscape 7-day week strip (not the phone's Month/
 * Week/Agenda/Day switcher — there's room here to just always show the
 * week). Tap a day to add an event via KioskEventComposer, tap an event
 * chip to edit/delete via KioskEventEditor. Writes go through the same
 * eventStore actions (addEvent/updateEvent/deleteEvent) the phone's
 * EventFormModal already uses.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useEventStore } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import { localDateStr } from '@/lib/dates';
import { KioskEventComposer } from '../components/KioskEventComposer';
import { KioskEventEditor } from '../components/KioskEventEditor';

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

export function KioskScheduleTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const rangeEvents = useEventStore(s => s.rangeEvents);
  const loadRange = useEventStore(s => s.loadRange);
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);

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
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [rangeEvents]);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Schedule</Text>
        <Text style={[s.range, { color: colors.textSecondary }]}>
          {days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
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
                {dayEvents.map(ev => (
                  <Pressable key={ev.id} onPress={() => setEditingEvent(ev)} style={[s.evChip, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.teal }]}>
                    <Text style={[s.evTitle, { color: colors.textPrimary }]} numberOfLines={2}>{ev.title}</Text>
                    {!!ev.time && <Text style={[s.evTime, { color: colors.textSecondary }]}>{ev.time}</Text>}
                  </Pressable>
                ))}
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
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  range: { fontSize: TYPO.caption, fontWeight: '700' },
  week: { flex: 1, flexDirection: 'row', gap: 8 },
  dayCol: { flex: 1 },
  dayHead: { alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  dow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  dnum: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  evChip: { borderRadius: 10, borderWidth: 1, borderLeftWidth: 3, padding: 8 },
  evTitle: { fontSize: 11, fontWeight: '700' },
  evTime: { fontSize: 9.5, fontWeight: '600', marginTop: 2 },
  addDay: { marginTop: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', paddingVertical: 8 },
});
