import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType } from '@/store/eventStore';
import AppHeader from '@/components/AppHeader';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatTime12(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function timeParts(t?: string): { time: string; ampm: string } {
  if (!t) return { time: '--', ampm: '' };
  const [h, m] = t.split(':').map(Number);
  return { time: `${h % 12 || 12}:${String(m).padStart(2,'0')}`, ampm: h >= 12 ? 'PM' : 'AM' };
}
function get15Days(center: string): string[] {
  const base = parseDate(center);
  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() - 7 + i); return toDateStr(d);
  });
}

const DAY_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

// ── Day Strip ─────────────────────────────────────────────────────────────────

function DayStrip({ selected, events, colors, isDark, onSelect }: {
  selected: string; events: FamilyEvent[]; colors: any; isDark: boolean;
  onSelect: (d: string) => void;
}) {
  const today = toDateStr(new Date());
  const days  = get15Days(selected);
  const bg    = isDark ? colors.card : '#FFFFFF';

  return (
    <View style={[s.dayStripWrap, { backgroundColor: bg, borderBottomColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 10 }}>
        {days.map(d => {
          const date   = parseDate(d);
          const hasEv  = events.some(e => e.date === d);
          const isSel  = d === selected;
          const isToday = d === today;

          return (
            <Pressable key={d} onPress={() => onSelect(d)}
              style={[s.dayCell, {
                backgroundColor: isSel
                  ? colors.primary
                  : isDark ? colors.surface : '#F5F4FA',
                borderColor: isSel
                  ? colors.primary
                  : isDark ? colors.border : 'rgba(146,97,199,0.12)',
              }]}>
              <Text style={{ fontSize: 10, fontWeight: '800',
                color: isSel ? '#fff' : isToday ? colors.primary : colors.textTertiary,
                letterSpacing: 0.5 }}>
                {DAY_SHORT[date.getDay()]}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '900',
                color: isSel ? '#fff' : isToday ? colors.primary : colors.textPrimary }}>
                {date.getDate()}
              </Text>
              {/* Event dot */}
              <View style={{ height: 6, alignItems: 'center', justifyContent: 'center' }}>
                {hasEv && (
                  <View style={[s.dayDot, { backgroundColor: isSel ? '#fff' : colors.teal }]} />
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  event: 'EVENT', reminder: 'REMINDER', appointment: 'APPT', birthday: 'BIRTHDAY',
  Medical: 'MEDICAL', Sports: 'SPORTS', School: 'SCHOOL', Work: 'WORK',
  Birthday: 'BIRTHDAY', Event: 'EVENT', Other: 'OTHER',
};

function EventCard({ ev, isParent, isLast, colors, isDark, memberName, onApprove }: {
  ev: FamilyEvent; isParent: boolean; isLast: boolean; colors: any; isDark: boolean;
  memberName: string; onApprove: (id: string) => void;
}) {
  const { time, ampm } = timeParts(ev.time);
  const typeLabel = TYPE_LABEL[ev.category ?? ev.type ?? 'event'] ?? 'EVENT';
  const cardBg    = isDark ? colors.card : '#FFFFFF';
  const shadow    = isDark ? {} : {
    shadowColor: '#9261C7', shadowOpacity: 0.07,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 16 }}>
      {/* ── Left: time clock + connector line ── */}
      <View style={{ width: 72, alignItems: 'center' }}>
        {/* Circle time bubble */}
        <View style={[s.timeBubble, {
          borderColor: colors.teal,
          backgroundColor: isDark ? colors.teal + '15' : colors.teal + '12',
        }]}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: colors.teal, lineHeight: 16 }}>
            {time}
          </Text>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.teal, lineHeight: 12 }}>
            {ampm}
          </Text>
        </View>
        {/* Connector line to next event */}
        {!isLast && (
          <View style={[s.connector, { backgroundColor: colors.primary + '30' }]} />
        )}
      </View>

      {/* ── Right: event card ── */}
      <View style={[s.evCard, { backgroundColor: cardBg, borderColor: isDark ? colors.border : 'rgba(146,97,199,0.10)' }, shadow,
        { marginBottom: isLast ? 0 : 16 }]}>
        {/* Card header row */}
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
          <View style={[s.typeBadge, {
            backgroundColor: colors.teal + '15',
            borderColor:     colors.teal + '60',
          }]}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.teal, letterSpacing: 0.8 }}>
              {typeLabel}
            </Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>
            {formatTime12(ev.time)}
          </Text>
        </View>

        {/* Title */}
        <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B', marginBottom: 6 }}>
          {ev.title}
        </Text>

        {/* For: member */}
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
          For: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
            {memberName}
          </Text>
        </Text>

        {/* Driver row */}
        {ev.driver && (
          <View style={[s.row, { marginTop: 6 }]}>
            <Ionicons name="car-outline" size={13} color={colors.teal} />
            <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '600', marginLeft: 4 }}>
              {ev.driver}
            </Text>
          </View>
        )}

        {/* Notes */}
        {ev.notes && (
          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }} numberOfLines={2}>
            {ev.notes}
          </Text>
        )}

        {/* Approval buttons */}
        {isParent && ev.approvalPending && (
          <View style={[s.row, { gap: 8, marginTop: 10 }]}>
            <Pressable onPress={() => onApprove(ev.id)}
              style={[s.evBtn, { flex: 1, backgroundColor: colors.teal }]}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>✓ Confirm</Text>
            </Pressable>
            <Pressable onPress={() => Alert.alert('Declined', `"${ev.title}" declined`)}
              style={[s.evBtn, { flex: 1, borderWidth: 1, borderColor: colors.danger + '50',
                backgroundColor: colors.danger + '15' }]}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.danger }}>✕ Decline</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Add Event Modal ───────────────────────────────────────────────────────────

const EVENT_TYPES: EventType[] = ['event', 'reminder', 'appointment', 'birthday'];
const EVENT_TYPE_LABEL: Record<EventType, string> = {
  event: '🎉 Event', reminder: '🔔 Reminder', appointment: '📋 Appointment', birthday: '🎂 Birthday',
};

function AddEventModal({ visible, colors, isDark, onClose, onSave }: {
  visible: boolean; colors: any; isDark: boolean; onClose: () => void; onSave: (d: any) => void;
}) {
  const [title,    setTitle]    = useState('');
  const [time,     setTime]     = useState('');
  const [date,     setDate]     = useState(toDateStr(new Date()));
  const [category, setCategory] = useState<EventType>('event');
  const [notes,    setNotes]    = useState('');
  const [driver,   setDriver]   = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), date, time: time || undefined, type: category,
      notes: notes || undefined, driver: driver || undefined,
      approvalPending: false, conflict: false, createdAt: new Date().toISOString() });
    onClose(); setTitle(''); setTime(''); setNotes(''); setDriver('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: isDark ? colors.card : '#FFFFFF',
            borderColor: isDark ? colors.border : 'rgba(146,97,199,0.15)' }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
                Add Event
              </Text>
              <Pressable onPress={onClose}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </Pressable>
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>TITLE</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Soccer Practice"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: isDark ? colors.textPrimary : '#1E2D6B',
                borderColor: isDark ? colors.border : 'rgba(146,97,199,0.25)',
                backgroundColor: isDark ? colors.surface : '#F9F8FD' }]} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>DATE</Text>
                <TextInput value={date} onChangeText={setDate}
                  style={[s.input, { color: isDark ? colors.textPrimary : '#1E2D6B',
                    borderColor: isDark ? colors.border : 'rgba(146,97,199,0.25)',
                    backgroundColor: isDark ? colors.surface : '#F9F8FD', marginBottom: 0 }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>TIME (HH:MM)</Text>
                <TextInput value={time} onChangeText={setTime} placeholder="15:30"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.input, { color: isDark ? colors.textPrimary : '#1E2D6B',
                    borderColor: isDark ? colors.border : 'rgba(146,97,199,0.25)',
                    backgroundColor: isDark ? colors.surface : '#F9F8FD', marginBottom: 0 }]} />
              </View>
            </View>

            <Text style={[s.label, { color: colors.textSecondary, marginTop: 12 }]}>TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EVENT_TYPES.map(t => (
                  <Pressable key={t} onPress={() => setCategory(t)}
                    style={[s.catChip, {
                      backgroundColor: category === t ? colors.primary + '20' : isDark ? colors.surface : '#F5F4FA',
                      borderColor:     category === t ? colors.primary : isDark ? colors.border : 'rgba(146,97,199,0.2)',
                    }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: category === t ? colors.primary : colors.textTertiary }}>
                      {EVENT_TYPE_LABEL[t]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[s.label, { color: colors.textSecondary }]}>DRIVER (optional)</Text>
            <TextInput value={driver} onChangeText={setDriver} placeholder="Who is driving?"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: isDark ? colors.textPrimary : '#1E2D6B',
                borderColor: isDark ? colors.border : 'rgba(146,97,199,0.25)',
                backgroundColor: isDark ? colors.surface : '#F9F8FD' }]} />

            <Pressable onPress={submit}
              style={[s.submitBtn, { backgroundColor: title.trim() ? colors.primary : colors.border }]}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Add to Family Schedule</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── CalendarScreen ────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const { events, addEvent, updateEvent } = useEventStore();

  const [selectedDate,  setSelectedDate]  = useState(toDateStr(new Date()));
  const [filterMember,  setFilterMember]  = useState<string | null>(null);
  const [showAdd,       setShowAdd]       = useState(false);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent     = activeMember?.role === 'parent';
  const bg           = isDark ? colors.background : '#F5F4FA';

  const visibleEvents = events
    .filter(e => e.date === selectedDate &&
      (!filterMember || e.memberId === filterMember || !e.memberId))
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  const selectedDateObj  = parseDate(selectedDate);
  const selectedDateText = selectedDateObj.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  // Resolve "For:" label for an event
  const memberLabel = (ev: FamilyEvent) => {
    if (!ev.memberId) return 'Family';
    const m = members.find(m => m.id === ev.memberId);
    return m ? m.name.split(' ')[0] : 'Family';
  };

  const cardBg = isDark ? colors.card : '#FFFFFF';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top']}>
      {/* ── Shared App Header ── */}
      <AppHeader onSwitchMember={() => {}} onNotifications={() => {}} />

      {/* ── Page title + action buttons ── */}
      <View style={[s.titleRow, { backgroundColor: isDark ? colors.card : '#FFFFFF',
        borderBottomColor: isDark ? colors.border : 'rgba(146,97,199,0.1)' }]}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
            Family Schedule
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 1 }}>
            {selectedDateText}
          </Text>
        </View>
        <View style={s.row}>
          <Pressable style={[s.rangeBtn, {
            borderColor: isDark ? colors.border : 'rgba(146,97,199,0.3)',
            backgroundColor: isDark ? colors.surface : '#F5F4FA',
          }]}>
            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginLeft: 5 }}>Range</Text>
          </Pressable>
          <Pressable onPress={() => setShowAdd(true)}
            style={[s.addBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', marginLeft: 4 }}>Event</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Member filter chips ── */}
      <View style={{ backgroundColor: isDark ? colors.card : '#FFFFFF',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(146,97,199,0.1)' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 10 }}>
          {/* All Members */}
          <Pressable onPress={() => setFilterMember(null)}
            style={[s.memberChip, {
              backgroundColor: !filterMember ? colors.primary : isDark ? colors.surface : '#F5F4FA',
              borderColor:     !filterMember ? colors.primary : isDark ? colors.border : 'rgba(146,97,199,0.2)',
            }]}>
            <Text style={{ fontSize: 13, fontWeight: '700',
              color: !filterMember ? '#fff' : colors.textSecondary }}>
              All Members
            </Text>
          </Pressable>
          {/* Per member */}
          {members.map(m => (
            <Pressable key={m.id} onPress={() => setFilterMember(m.id)}
              style={[s.memberChip, {
                backgroundColor: filterMember === m.id ? colors.primary : isDark ? colors.surface : '#F5F4FA',
                borderColor:     filterMember === m.id ? colors.primary : isDark ? colors.border : 'rgba(146,97,199,0.2)',
                flexDirection: 'row', alignItems: 'center', gap: 6,
              }]}>
              {m.emoji
                ? <Text style={{ fontSize: 14 }}>{m.emoji}</Text>
                : <Ionicons name="person" size={13}
                    color={filterMember === m.id ? '#fff' : colors.textTertiary} />}
              <Text style={{ fontSize: 13, fontWeight: '700',
                color: filterMember === m.id ? '#fff' : colors.textSecondary }}>
                {m.name.split(' ')[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── 15-Day strip ── */}
      <DayStrip selected={selectedDate} events={events} colors={colors}
        isDark={isDark} onSelect={setSelectedDate} />

      {/* ── Timeline ── */}
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 48 }}>
        {visibleEvents.length === 0 ? (
          <View style={[s.emptyBox, {
            marginHorizontal: 20, backgroundColor: cardBg,
            borderColor: isDark ? colors.border : 'rgba(146,97,199,0.12)',
          }]}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>📅</Text>
            <Text style={{ fontSize: 15, fontWeight: '800',
              color: isDark ? colors.textPrimary : '#1E2D6B', marginBottom: 4 }}>
              No events scheduled
            </Text>
            <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center' }}>
              Tap "+ Event" to add one for the family
            </Text>
          </View>
        ) : (
          visibleEvents.map((ev, i) => (
            <EventCard
              key={ev.id}
              ev={ev}
              isParent={isParent}
              isLast={i === visibleEvents.length - 1}
              colors={colors}
              isDark={isDark}
              memberName={memberLabel(ev)}
              onApprove={id => updateEvent(id, { approvalPending: false })}
            />
          ))
        )}
      </ScrollView>

      <AddEventModal visible={showAdd} colors={colors} isDark={isDark}
        onClose={() => setShowAdd(false)}
        onSave={d => addEvent(d)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center' },

  titleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: 16, paddingVertical: 12,
               borderBottomWidth: StyleSheet.hairlineWidth },
  rangeBtn:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
               borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  addBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 22,
               paddingHorizontal: 16, paddingVertical: 8 },

  memberChip: { borderRadius: 22, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8 },

  dayStripWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  dayCell:   { width: 52, borderRadius: 18, borderWidth: 1.5, paddingVertical: 10,
               alignItems: 'center', gap: 2 },
  dayDot:    { width: 6, height: 6, borderRadius: 3 },

  // Time bubble — circular, teal border
  timeBubble: { width: 62, height: 62, borderRadius: 31, borderWidth: 2,
                alignItems: 'center', justifyContent: 'center' },
  connector:  { width: 2, flex: 1, minHeight: 20, borderRadius: 2, marginTop: 4, marginBottom: 0 },

  // Event card
  evCard:     { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14 },
  typeBadge:  { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 4 },
  evBtn:      { borderRadius: 12, paddingVertical: 8, alignItems: 'center' },

  emptyBox:   { borderRadius: 24, borderWidth: 1, padding: 40, alignItems: 'center' },

  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28,
                borderTopWidth: 1, padding: 20, paddingBottom: 44 },
  handle:     { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  label:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6, marginTop: 10 },
  input:      { borderWidth: 1.5, borderRadius: 14, padding: 12, fontSize: 14, marginBottom: 10 },
  catChip:    { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  submitBtn:  { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
});
