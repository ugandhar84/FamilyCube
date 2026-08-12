import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType } from '@/store/eventStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatTime(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}

function formatHeaderDate(s: string) {
  return parseDate(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function get15Days(center: string): string[] {
  const base = parseDate(center);
  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() - 7 + i);
    return toDateStr(d);
  });
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const CAT_COLOR: Record<string, string> = {
  Work: '#8B5CF6', Medical: '#EF4444', Sports: '#F59E0B',
  School: '#3B82F6', Study: '#3B82F6', Birthday: '#EC4899',
  Event: '#10B981', Other: '#6B7280',
};

const CAT_ICON: Record<string, string> = {
  Work: '💼', Medical: '🏥', Sports: '⚽', School: '🎒',
  Study: '📖', Birthday: '🎂', Event: '📅', Other: '📌',
};

// ─── 15-Day strip ─────────────────────────────────────────────────────────────

function DayStrip({ selected, events, onSelect, colors }: {
  selected: string;
  events: FamilyEvent[];
  onSelect: (s: string) => void;
  colors: any;
}) {
  const days = get15Days(selected);
  const today = toDateStr(new Date());

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8, gap: 6 }}>
      {days.map(dateStr => {
        const d        = parseDate(dateStr);
        const dayName  = DAY_NAMES[d.getDay()];
        const dayNum   = d.getDate();
        const isToday  = dateStr === today;
        const isSel    = dateStr === selected;
        const dayEvts  = events.filter(e => e.date === dateStr);
        const hasWork  = dayEvts.some(e => e.type === 'event' && (e.title.toLowerCase().includes('work') || e.location?.toLowerCase().includes('work')));
        const hasMed   = dayEvts.some(e => e.type === 'appointment');
        const hasBday  = dayEvts.some(e => e.type === 'birthday');

        return (
          <Pressable key={dateStr} onPress={() => onSelect(dateStr)}
            style={[s.dayCell, {
              backgroundColor: isSel ? colors.primary : isToday ? colors.primary + '18' : colors.card,
              borderColor: isSel ? colors.primary : isToday ? colors.primary + '50' : colors.border,
            }]}>
            <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.3,
              color: isSel ? colors.primary + '99' : colors.textTertiary }}>{dayName}</Text>
            <Text style={{ fontSize: 17, fontWeight: '900',
              color: isSel ? '#fff' : isToday ? colors.primary : colors.textPrimary }}>{dayNum}</Text>
            <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
              {hasMed   && <View style={[s.dot, { backgroundColor: '#EF4444' }]} />}
              {hasWork  && <View style={[s.dot, { backgroundColor: '#8B5CF6' }]} />}
              {hasBday  && <View style={[s.dot, { backgroundColor: '#EC4899' }]} />}
              {!hasMed && !hasWork && !hasBday && dayEvts.length > 0 &&
                <View style={[s.dot, { backgroundColor: '#10B981' }]} />}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({ event, isParent, onApprove, colors, isDark }: {
  event: FamilyEvent; isParent: boolean;
  onApprove?: (id: string) => void;
  colors: any; isDark: boolean;
}) {
  const catKey   = event.type === 'appointment' ? 'Medical' : 'Event';
  const catColor = CAT_COLOR[catKey] ?? '#6B7280';
  const catIcon  = CAT_ICON[catKey] ?? '📅';
  const isConflict = (event as any).conflict;
  const cardBg   = isDark ? colors.card : '#FFFFFF';
  const bdrColor = isConflict ? '#F59E0B80' : colors.border;

  return (
    <View style={{ flexDirection: 'row', marginBottom: 16 }}>
      {/* Timeline dot & time */}
      <View style={{ width: 52, alignItems: 'flex-end', paddingRight: 10, paddingTop: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, lineHeight: 13 }}>
          {event.time ? formatTime(event.time).split(' ')[0] : '—'}
        </Text>
        <Text style={{ fontSize: 9, color: colors.textTertiary, fontWeight: '600' }}>
          {event.time ? formatTime(event.time).split(' ')[1] : ''}
        </Text>
      </View>

      {/* Dot */}
      <View style={{ width: 12, alignItems: 'center', paddingTop: 5 }}>
        <View style={[s.timelineDot, {
          backgroundColor: isConflict ? '#F59E0B' : catColor,
        }]} />
        <View style={[s.timelineLine, { backgroundColor: colors.border }]} />
      </View>

      {/* Card */}
      <View style={[s.eventCard, { flex: 1, backgroundColor: cardBg,
        borderColor: bdrColor,
        ...(isConflict ? { backgroundColor: isDark ? '#78350F15' : '#FFFBEB' } : {}) }]}>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
          <View style={[s.catTag, {
            backgroundColor: catColor + '20', borderColor: catColor + '50',
          }]}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: catColor }}>
              {catIcon} {catKey.toUpperCase()}
            </Text>
          </View>
          {event.time && (
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>
              {formatTime(event.time)}
            </Text>
          )}
        </View>

        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 }}>
          {event.title}
        </Text>

        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>
            For: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
              {(event as any).memberName ?? 'Family'}
            </Text>
          </Text>
          {event.location ? (
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>📍 {event.location}</Text>
          ) : null}
        </View>

        {/* Conflict/approval row */}
        {isConflict && isParent && onApprove && (
          <View style={[s.row, { justifyContent: 'space-between', marginTop: 8, paddingTop: 8,
            borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F59E0B40' }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B' }}>⚠️ Kid Request Pending</Text>
            <Pressable onPress={() => onApprove(event.id)}
              style={[s.approveBtn, { backgroundColor: '#10B981' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>✓ Approve</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

function AddEventModal({ visible, members, selectedDate, onClose, onCreate, colors, isDark }: {
  visible: boolean; members: any[]; selectedDate: string;
  onClose: () => void; onCreate: (data: Partial<FamilyEvent>) => void;
  colors: any; isDark: boolean;
}) {
  const [title, setTitle]     = useState('');
  const [type, setType]       = useState<EventType>('event');
  const [time, setTime]       = useState('09:00');
  const [location, setLoc]    = useState('');
  const [member, setMember]   = useState(members[0]?.id ?? '');
  const types: EventType[]    = ['event', 'reminder', 'appointment', 'birthday'];

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), type, date: selectedDate, time: time,
      location: location.trim() || undefined, memberId: member });
    setTitle(''); setType('event'); setTime('09:00'); setLoc('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: isDark ? colors.card : '#fff', borderColor: colors.border }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Add Event</Text>

            <Text style={[s.label, { color: colors.textSecondary }]}>TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {types.map(t => (
                  <Pressable key={t} onPress={() => setType(t)}
                    style={[s.chip, { backgroundColor: type === t ? colors.primary + '20' : colors.surface,
                      borderColor: type === t ? colors.primary : colors.border }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: type === t ? colors.primary : colors.textSecondary }}>
                      {CAT_ICON[t === 'appointment' ? 'Medical' : 'Event']} {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[s.label, { color: colors.textSecondary }]}>TITLE</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="Event name…"
              placeholderTextColor={colors.placeholder}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]} />

            <View style={[s.row, { gap: 12, marginBottom: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>TIME</Text>
                <TextInput value={time} onChangeText={setTime} placeholder="09:00"
                  placeholderTextColor={colors.placeholder}
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: colors.surface, marginBottom: 0 }]} />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>LOCATION (optional)</Text>
                <TextInput value={location} onChangeText={setLoc} placeholder="Address…"
                  placeholderTextColor={colors.placeholder}
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: colors.surface, marginBottom: 0 }]} />
              </View>
            </View>

            <Text style={[s.label, { color: colors.textSecondary, marginTop: 4 }]}>FOR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {members.map(m => (
                  <Pressable key={m.id} onPress={() => setMember(m.id)}
                    style={[s.chip, { backgroundColor: member === m.id ? colors.primary + '20' : colors.surface,
                      borderColor: member === m.id ? colors.primary : colors.border }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: member === m.id ? colors.primary : colors.textSecondary }}>
                      {m.emoji ?? m.name[0]} {m.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Pressable onPress={submit}
              style={[s.submitBtn, { backgroundColor: title.trim() ? colors.primary : colors.border }]}>
              <Ionicons name="calendar" size={16} color="#fff" />
              <Text style={s.submitBtnText}>Add Event</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── CalendarScreen ───────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { events, loadFromStorage: loadEvents, addEvent, updateEvent } = useEventStore();

  const today      = toDateStr(new Date());
  const [selected, setSelected]       = useState(today);
  const [memberFilter, setMemberFilter] = useState('all');
  const [showAdd, setShowAdd]         = useState(false);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadEvents(); }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent     = activeMember?.role === 'parent';
  const isKid        = activeMember?.role === 'kid';

  // Day events filtered by selected date + member filter
  let dayEvents = events.filter(e => e.date === selected);
  if (memberFilter !== 'all') {
    dayEvents = dayEvents.filter(e => e.memberId === memberFilter || (e as any).memberName?.includes(memberFilter));
  }

  const bg = isDark ? '#0B0F1A' : '#F3F4F8';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['top']}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Family Schedule</Text>
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>
            {formatHeaderDate(selected)}
          </Text>
        </View>
        {isKid ? (
          <Pressable onPress={() => Alert.alert('Ask Help / Ride', 'Request coming soon')}
            style={[s.addBtn, { backgroundColor: colors.amber }]}>
            <Text style={{ color: '#000', fontSize: 13, fontWeight: '800' }}>+ Ask Help / Ride</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setShowAdd(true)}
            style={[s.addBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.addBtnText}>Event</Text>
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Member filter chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          {[{ id: 'all', label: 'All Members' }, ...members.map(m => ({
            id: m.id, label: `${m.emoji ?? m.name[0]} ${m.name.split(' ')[0]}`,
          }))].map(f => {
            const active = memberFilter === f.id;
            return (
              <Pressable key={f.id} onPress={() => setMemberFilter(f.id)}
                style={[s.filterChip, {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? 'transparent' : colors.border,
                }]}>
                <Text style={{ fontSize: 12, fontWeight: '700',
                  color: active ? '#fff' : colors.textSecondary }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── 15-day horizontal strip ── */}
        <View style={{ backgroundColor: isDark ? colors.card : '#fff',
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <DayStrip selected={selected} events={events} onSelect={setSelected} colors={colors} />
        </View>

        {/* ── Timeline for selected day ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          {dayEvents.length === 0 ? (
            <View style={[s.emptyBox, { backgroundColor: isDark ? colors.card : '#fff',
              borderColor: colors.border }]}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>📅</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>
                No events on {formatHeaderDate(selected)}
              </Text>
              {isKid && (
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, textAlign: 'center' }}>
                  Tap "+ Ask Help / Ride" to request parent assistance
                </Text>
              )}
            </View>
          ) : (
            <View style={{ position: 'relative' }}>
              {dayEvents
                .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
                .map(ev => (
                  <EventCard
                    key={ev.id} event={ev} isParent={isParent}
                    onApprove={(id) => updateEvent(id, { approvalPending: false })}
                    colors={colors} isDark={isDark}
                  />
                ))}
            </View>
          )}
        </View>
      </ScrollView>

      <AddEventModal
        visible={showAdd} members={members} selectedDate={selected}
        onClose={() => setShowAdd(false)}
        onCreate={(data) => addEvent(data as any)}
        colors={colors} isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:  { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99,
                  paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText:   { color: '#fff', fontSize: 13, fontWeight: '700' },

  filterChip:   { borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },

  dayCell:      { width: 46, borderRadius: 14, borderWidth: 1, paddingVertical: 8,
                  alignItems: 'center', gap: 2 },
  dot:          { width: 5, height: 5, borderRadius: 3 },

  row:          { flexDirection: 'row', alignItems: 'center' },
  timelineDot:  { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineLine: { width: 1, flex: 1, marginTop: 2 },

  eventCard:    { borderRadius: 16, borderWidth: 1, padding: 12, marginLeft: 10,
                  shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 },
                  shadowRadius: 6, elevation: 2 },
  catTag:       { borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  approveBtn:   { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 },

  emptyBox:     { borderRadius: 18, borderWidth: 1, padding: 36, alignItems: 'center' },

  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1,
                  padding: 20, paddingBottom: 40 },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:   { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  label:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input:        { borderWidth: 1.5, borderRadius: 12, padding: 10, fontSize: 15, marginBottom: 12 },
  chip:         { borderRadius: 99, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  submitBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, borderRadius: 14, paddingVertical: 14 },
  submitBtnText:{ color: '#fff', fontSize: 16, fontWeight: '700' },
});
