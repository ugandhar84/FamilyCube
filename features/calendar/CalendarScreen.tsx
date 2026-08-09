import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType } from '@/store/eventStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDayStrip(centerDate: Date, count = 7) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(centerDate);
    d.setDate(centerDate.getDate() - 3 + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTime(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const TYPE_ICONS: Record<EventType, string> = {
  event: 'calendar', reminder: 'alarm', appointment: 'medical', birthday: 'gift',
};

// ─── Day strip ────────────────────────────────────────────────────────────────

function DayStrip({ selected, onSelect }: { selected: Date; onSelect: (d: Date) => void }) {
  const { colors } = useTheme();
  const days = getDayStrip(selected);
  const DAY = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  return (
    <View style={[styles.dayStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {days.map((d, i) => {
        const isToday  = isSameDay(d, new Date());
        const isSel    = isSameDay(d, selected);
        return (
          <Pressable key={i} onPress={() => onSelect(d)} style={styles.dayCell}>
            <Text style={[styles.dayLabel, { color: isSel ? colors.primary : colors.textTertiary }]}>
              {DAY[d.getDay()]}
            </Text>
            <View style={[styles.dayNum, {
              backgroundColor: isSel ? colors.primary : isToday ? colors.primaryLight : 'transparent',
            }]}>
              <Text style={[styles.dayNumText, {
                color: isSel ? '#fff' : isToday ? colors.primary : colors.textPrimary,
                fontWeight: isSel || isToday ? '800' : '500',
              }]}>{d.getDate()}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ event, memberEmoji, onPress }: {
  event: FamilyEvent; memberEmoji?: string; onPress: () => void;
}) {
  const { colors } = useTheme();
  const color = event.color ?? colors.primary;
  return (
    <Pressable onPress={onPress} style={[styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.eventColorBar, { backgroundColor: color }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={TYPE_ICONS[event.type] as any} size={13} color={color} />
          <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={1}>{event.title}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {event.allDay ? (
            <Text style={[styles.eventTime, { color: colors.textTertiary }]}>All day</Text>
          ) : event.time ? (
            <Text style={[styles.eventTime, { color: colors.textTertiary }]}>{formatTime(event.time)}{event.endTime ? ` – ${formatTime(event.endTime)}` : ''}</Text>
          ) : null}
          {event.location ? (
            <Text style={[styles.eventTime, { color: colors.textTertiary }]}>📍 {event.location}</Text>
          ) : null}
        </View>
      </View>
      {memberEmoji ? <Text style={{ fontSize: 20 }}>{memberEmoji}</Text> : null}
    </Pressable>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

function AddEventModal({ visible, defaultDate, members, onClose, onAdd }: {
  visible: boolean; defaultDate: string; members: any[]; onClose: () => void; onAdd: (e: any) => void;
}) {
  const { colors } = useTheme();
  const [title, setTitle]     = useState('');
  const [time, setTime]       = useState('');
  const [type, setType]       = useState<EventType>('event');
  const [memberId, setMember] = useState<string | undefined>(undefined);
  const [color, setColor]     = useState('#9261C7');

  const COLORS = ['#9261C7','#00BBA4','#F5A623','#F04E98','#EF4444','#3B82F6'];
  const TYPES: EventType[] = ['event','reminder','appointment','birthday'];

  const reset = () => { setTitle(''); setTime(''); setType('event'); setMember(undefined); setColor('#9261C7'); };

  const handleAdd = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), date: defaultDate, time: time || undefined, type, memberId, color });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => { reset(); onClose(); }}>
              <Text style={[{ color: colors.textSecondary, fontSize: 16 }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>New Event</Text>
            <Pressable onPress={handleAdd} disabled={!title.trim()}>
              <Text style={[{ fontSize: 16, fontWeight: '700', color: title.trim() ? colors.primary : colors.textTertiary }]}>Add</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <TextInput
              value={title} onChangeText={setTitle} placeholder="Event title"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
            {/* Time */}
            <TextInput
              value={time} onChangeText={setTime} placeholder="Time (e.g. 14:30)"
              placeholderTextColor={colors.placeholder} keyboardType="numbers-and-punctuation"
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
            {/* Type */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <Pressable key={t} onPress={() => setType(t)}
                    style={[styles.typeChip, {
                      backgroundColor: type === t ? colors.primary + '20' : colors.surface,
                      borderColor: type === t ? colors.primary : colors.border,
                    }]}>
                    <Ionicons name={TYPE_ICONS[t] as any} size={14} color={type === t ? colors.primary : colors.textTertiary} />
                    <Text style={[{ fontSize: 12, fontWeight: '600', color: type === t ? colors.primary : colors.textSecondary, textTransform: 'capitalize' }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {/* Color */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Color</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {COLORS.map(c => (
                  <Pressable key={c} onPress={() => setColor(c)}
                    style={[styles.colorDot, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: '#fff', shadowColor: c, shadowOpacity: color === c ? 0.5 : 0, shadowRadius: 4, elevation: color === c ? 4 : 0 }]} />
                ))}
              </View>
            </View>
            {/* Assign */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>For</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Pressable onPress={() => setMember(undefined)}
                  style={[styles.typeChip, {
                    backgroundColor: !memberId ? colors.primary + '20' : colors.surface,
                    borderColor: !memberId ? colors.primary : colors.border,
                  }]}>
                  <Text style={[{ fontSize: 12, fontWeight: '600', color: !memberId ? colors.primary : colors.textSecondary }]}>Everyone</Text>
                </Pressable>
                {members.map(m => (
                  <Pressable key={m.id} onPress={() => setMember(m.id)}
                    style={[styles.typeChip, {
                      backgroundColor: memberId === m.id ? colors.primary + '20' : colors.surface,
                      borderColor: memberId === m.id ? colors.primary : colors.border,
                    }]}>
                    <Text>{m.emoji}</Text>
                    <Text style={[{ fontSize: 12, fontWeight: '600', color: memberId === m.id ? colors.primary : colors.textSecondary }]}>{m.name.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Calendar Screen ──────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { colors } = useTheme();
  const { members, loaded, loadFromStorage } = useFamilyStore();
  const { events, loadFromStorage: loadEvents, addEvent, deleteEvent } = useEventStore();
  const [selected, setSelected] = useState(new Date());
  const [showAdd, setShowAdd]   = useState(false);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadEvents(); }, []);

  const dateStr = toLocalDateStr(selected);
  const dayEvents = events
    .filter(e => e.date === dateStr)
    .sort((a, b) => (a.time ?? '00:00').localeCompare(b.time ?? '00:00'));

  const upcoming = events
    .filter(e => e.date > dateStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const monthLabel = selected.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Schedule</Text>
          <Text style={[styles.screenSub, { color: colors.textSecondary }]}>{monthLabel}</Text>
        </View>
        <Pressable onPress={() => setShowAdd(true)} style={[styles.newBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newBtnText}>Event</Text>
        </Pressable>
      </View>

      {/* Day strip */}
      <DayStrip selected={selected} onSelect={setSelected} />

      {/* Navigation arrows */}
      <View style={[styles.weekNav, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => { const d = new Date(selected); d.setDate(d.getDate()-7); setSelected(d); }}
          style={[styles.navBtn, { borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={() => setSelected(new Date())}
          style={[styles.todayBtn, { borderColor: colors.primary }]}>
          <Text style={[{ color: colors.primary, fontWeight: '700', fontSize: 13 }]}>Today</Text>
        </Pressable>
        <Pressable onPress={() => { const d = new Date(selected); d.setDate(d.getDate()+7); setSelected(d); }}
          style={[styles.navBtn, { borderColor: colors.border }]}>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}>
        {/* Selected day events */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {isSameDay(selected, new Date()) ? 'Today' : selected.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          {' '}· {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
        </Text>

        {dayEvents.length === 0 ? (
          <View style={[styles.emptyDay, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 36 }}>📅</Text>
            <Text style={[{ color: colors.textSecondary, fontSize: 14, marginTop: 8 }]}>Nothing scheduled</Text>
            <Pressable onPress={() => setShowAdd(true)} style={[styles.emptyAddBtn, { borderColor: colors.primary }]}>
              <Text style={[{ color: colors.primary, fontWeight: '600', fontSize: 13 }]}>+ Add event</Text>
            </Pressable>
          </View>
        ) : (
          dayEvents.map(e => (
            <EventRow
              key={e.id} event={e}
              memberEmoji={members.find(m => m.id === e.memberId)?.emoji}
              onPress={() => {}}
            />
          ))
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 8 }]}>Coming Up</Text>
            {upcoming.map(e => {
              const d = new Date(e.date);
              const diff = Math.round((d.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
              const dayLabel = diff === 1 ? 'Tomorrow' : diff === 2 ? 'In 2 days' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <View key={e.id}>
                  <Text style={[styles.upcomingDate, { color: colors.textTertiary }]}>{dayLabel}</Text>
                  <EventRow
                    event={e}
                    memberEmoji={members.find(m => m.id === e.memberId)?.emoji}
                    onPress={() => {}}
                  />
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <AddEventModal
        visible={showAdd} defaultDate={dateStr} members={members}
        onClose={() => setShowAdd(false)} onAdd={addEvent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  screenTitle:  { fontSize: TYPO.heading, fontWeight: '800' },
  screenSub:    { fontSize: TYPO.caption, marginTop: 2 },
  newBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },

  dayStrip:     { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1 },
  dayCell:      { flex: 1, alignItems: 'center', gap: 4 },
  dayLabel:     { fontSize: 11, fontWeight: '600' },
  dayNum:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayNumText:   { fontSize: 15 },

  weekNav:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1 },
  navBtn:       { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  todayBtn:     { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },

  sectionTitle: { fontSize: TYPO.body, fontWeight: '700' },
  upcomingDate: { fontSize: 11, fontWeight: '600', marginBottom: 4, marginTop: 4 },

  eventRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: RADIUS.lg, borderWidth: 1 },
  eventColorBar:{ width: 4, height: '100%', borderRadius: 2, minHeight: 40 },
  eventTitle:   { fontSize: TYPO.body, fontWeight: '600' },
  eventTime:    { fontSize: 12 },

  emptyDay:     { alignItems: 'center', padding: 32, borderRadius: RADIUS.xl, borderWidth: 1, borderStyle: 'dashed' },
  emptyAddBtn:  { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },

  modalSheet:   { flex: 1 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  modalTitle:   { fontSize: 17, fontWeight: '700' },
  label:        { fontSize: 13, fontWeight: '600' },
  input:        { borderWidth: 1, borderRadius: RADIUS.md, padding: 12, fontSize: TYPO.body },
  typeChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  colorDot:     { width: 28, height: 28, borderRadius: 14 },
});
