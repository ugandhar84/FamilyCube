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

const DAY_NAMES = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseDate(s: string) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function formatTime(t?: string) {
  if (!t) return '';
  const [h,m] = t.split(':').map(Number);
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
function get15Days(center: string): string[] {
  const base = parseDate(center);
  return Array.from({ length:15 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate()-7+i); return toDateStr(d);
  });
}

// ─── 15-Day Strip ─────────────────────────────────────────────────────────────

function DayStrip({ selected, events, colors, onSelect }: {
  selected:string; events:FamilyEvent[]; colors:any; onSelect:(s:string)=>void;
}) {
  const today = toDateStr(new Date());
  const days  = get15Days(selected);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:12, gap:6, paddingVertical:10 }}>
      {days.map(d => {
        const date = parseDate(d);
        const hasEv = events.some(e => e.date === d);
        const isToday = d === today;
        const isSel   = d === selected;
        return (
          <Pressable key={d} onPress={() => onSelect(d)}
            style={[s.dayCell, {
              backgroundColor: isSel ? colors.primary : isToday ? colors.primary+'20' : colors.surface,
              borderColor: isSel ? colors.primary : isToday ? colors.primary+'50' : colors.border,
            }]}>
            <Text style={{ fontSize:9, fontWeight:'800',
              color: isSel ? '#fff' : isToday ? colors.primary : colors.textTertiary }}>
              {DAY_NAMES[date.getDay()]}
            </Text>
            <Text style={{ fontSize:15, fontWeight:'900',
              color: isSel ? '#fff' : isToday ? colors.primary : colors.textPrimary }}>
              {date.getDate()}
            </Text>
            {hasEv && (
              <View style={[s.dayDot, { backgroundColor: isSel ? '#fff' : colors.amber }]} />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

const CAT_COLOR_KEY: Record<string, string> = {
  Work:'primary', Medical:'danger', Sports:'amber', School:'primary',
  Study:'primary', Birthday:'amber', Event:'teal', Other:'textTertiary',
};

function EventCard({ ev, isParent, colors, onApprove }: {
  ev:FamilyEvent; isParent:boolean; colors:any; onApprove:(id:string)=>void;
}) {
  const colorKey = CAT_COLOR_KEY[ev.category ?? 'Other'] ?? 'textTertiary';
  const accentColor: string = (colors as any)[colorKey] ?? colors.textTertiary;

  return (
    <View style={[s.evCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[s.evDot, { backgroundColor: accentColor }]} />
      <View style={{ flex:1, marginLeft:12 }}>
        <View style={[s.row, { justifyContent:'space-between', marginBottom:2 }]}>
          <Text style={{ fontSize:13, fontWeight:'700', color: colors.textPrimary, flex:1 }} numberOfLines={1}>
            {ev.title}
          </Text>
          {ev.approvalPending && (
            <View style={[s.pendingBadge, { backgroundColor: colors.amber+'25', borderColor: colors.amber+'50' }]}>
              <Text style={{ fontSize:8, fontWeight:'800', color: colors.amber }}>PENDING</Text>
            </View>
          )}
        </View>
        <View style={s.row}>
          {ev.time ? <Text style={{ fontSize:11, fontWeight:'800', color: accentColor, marginRight:6 }}>
            {formatTime(ev.time)}
          </Text> : null}
          {ev.category ? <Text style={{ fontSize:10, color: colors.textTertiary }}>{ev.category}</Text> : null}
        </View>
        {ev.driver && (
          <Text style={{ fontSize:10, color: colors.textSecondary, marginTop:2 }}>Driver: {ev.driver}</Text>
        )}
        {ev.notes ? (
          <Text style={{ fontSize:10, color: colors.textTertiary, marginTop:2 }} numberOfLines={1}>{ev.notes}</Text>
        ) : null}

        {isParent && ev.approvalPending && (
          <View style={[s.row, { gap:8, marginTop:8 }]}>
            <Pressable onPress={() => onApprove(ev.id)}
              style={[s.evBtn, { flex:1, backgroundColor: colors.teal }]}>
              <Text style={{ fontSize:11, fontWeight:'800', color:'#fff' }}>✓ Confirm</Text>
            </Pressable>
            <Pressable onPress={() => Alert.alert('Declined', `"${ev.title}" declined`)}
              style={[s.evBtn, { flex:1, backgroundColor: colors.danger+'20',
                borderWidth:1, borderColor: colors.danger+'40' }]}>
              <Text style={{ fontSize:11, fontWeight:'800', color: colors.danger }}>✕ Decline</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────

const EVENT_TYPES: EventType[] = ['event','reminder','appointment','birthday'];
const EVENT_TYPE_LABEL: Record<EventType, string> = {
  event: '🎉 Event', reminder: '🔔 Reminder', appointment: '📋 Appointment', birthday: '🎂 Birthday',
};

function AddEventModal({ visible, colors, onClose, onSave }: {
  visible:boolean; colors:any; onClose:()=>void; onSave:(d:any)=>void;
}) {
  const [title, setTitle]       = useState('');
  const [time,  setTime]        = useState('');
  const [date,  setDate]        = useState(toDateStr(new Date()));
  const [category, setCategory] = useState<EventType>('event');
  const [notes, setNotes]       = useState('');
  const [driver, setDriver]     = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onSave({ title:title.trim(), date, time:time||undefined, type:category,
      notes:notes||undefined, driver:driver||undefined,
      approvalPending:false, conflict:false,
      createdAt: new Date().toISOString() });
    onClose(); setTitle(''); setTime(''); setNotes(''); setDriver('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
        <View style={s.overlay}>
          <Pressable style={{flex:1}} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <View style={[s.row, { justifyContent:'space-between', marginBottom:12 }]}>
              <Text style={{ fontSize:15, fontWeight:'800', color: colors.textPrimary }}>Add Calendar Event</Text>
              <Pressable onPress={onClose}><Ionicons name="close" size={20} color={colors.textTertiary} /></Pressable>
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>EVENT TITLE</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Soccer Practice"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface }]} />

            <View style={{ flexDirection:'row', gap:10 }}>
              <View style={{flex:1}}>
                <Text style={[s.label, { color: colors.textSecondary }]}>DATE (YYYY-MM-DD)</Text>
                <TextInput value={date} onChangeText={setDate}
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: colors.surface, marginBottom:0 }]} />
              </View>
              <View style={{flex:1}}>
                <Text style={[s.label, { color: colors.textSecondary }]}>TIME (HH:MM)</Text>
                <TextInput value={time} onChangeText={setTime} placeholder="15:30"
                  placeholderTextColor={colors.textTertiary}
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: colors.surface, marginBottom:0 }]} />
              </View>
            </View>

            <Text style={[s.label, { color: colors.textSecondary, marginTop:10 }]}>TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
              <View style={{flexDirection:'row', gap:6}}>
                {EVENT_TYPES.map(t => (
                  <Pressable key={t} onPress={() => setCategory(t)}
                    style={[s.catChip, { backgroundColor: category===t ? colors.primary+'25' : colors.surface,
                      borderColor: category===t ? colors.primary : colors.border }]}>
                    <Text style={{ fontSize:11, fontWeight:'700',
                      color: category===t ? colors.primary : colors.textTertiary }}>
                      {EVENT_TYPE_LABEL[t]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[s.label, { color: colors.textSecondary }]}>DRIVER (optional)</Text>
            <TextInput value={driver} onChangeText={setDriver} placeholder="Who is driving?"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface }]} />

            <Text style={[s.label, { color: colors.textSecondary }]}>NOTES (optional)</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Any details…"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface }]} />

            <Pressable onPress={submit}
              style={[s.submitBtn, { backgroundColor: title.trim() ? colors.teal : colors.border }]}>
              <Text style={{ color:'#fff', fontSize:14, fontWeight:'800' }}>Add to Family Calendar</Text>
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
  const { events, loadFromStorage:loadEvents, addEvent, updateEvent } = useEventStore();

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [filterMember, setFilterMember] = useState<string|null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  const bg = isDark ? '#0B0F1A' : colors.background;

  const visibleEvents = events.filter(e =>
    e.date === selectedDate && (!filterMember || e.memberId === filterMember || !e.memberId)
  );

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: bg }} edges={['top']}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={{ fontSize:16, fontWeight:'800', color: colors.textPrimary }}>Family Calendar</Text>
        <Pressable onPress={() => setShowAdd(true)}
          style={[s.addBtn, { backgroundColor: colors.teal }]}>
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={{ fontSize:12, fontWeight:'700', color:'#fff', marginLeft:4 }}>Add Event</Text>
        </Pressable>
      </View>

      {/* ── Member Filter Chips ── */}
      <View style={[s.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal:12, gap:6, paddingVertical:8 }}>
          <Pressable onPress={() => setFilterMember(null)}
            style={[s.chip, { backgroundColor: !filterMember ? colors.primary : colors.surface,
              borderColor: !filterMember ? colors.primary : colors.border }]}>
            <Text style={{ fontSize:11, fontWeight: !filterMember?'800':'600',
              color: !filterMember ? '#fff' : colors.textSecondary }}>All Family</Text>
          </Pressable>
          {members.map(m => (
            <Pressable key={m.id} onPress={() => setFilterMember(m.id)}
              style={[s.chip, { backgroundColor: filterMember===m.id ? colors.primary : colors.surface,
                borderColor: filterMember===m.id ? colors.primary : colors.border }]}>
              <Text style={{ fontSize:11, fontWeight: filterMember===m.id?'800':'600',
                color: filterMember===m.id ? '#fff' : colors.textSecondary }}>
                {m.emoji} {m.name.split(' ')[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── 15-Day Strip ── */}
      <View style={{ backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border }}>
        <DayStrip selected={selectedDate} events={events} colors={colors} onSelect={setSelectedDate} />
      </View>

      {/* ── Day Header ── */}
      <View style={[s.dayHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={{ fontSize:13, fontWeight:'800', color: colors.textPrimary }}>
          {parseDate(selectedDate).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
        </Text>
        <View style={[s.countBadge, { backgroundColor: colors.primary+'20', borderColor: colors.primary+'40' }]}>
          <Text style={{ fontSize:10, fontWeight:'800', color: colors.primary }}>{visibleEvents.length} events</Text>
        </View>
      </View>

      {/* ── Timeline ── */}
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding:12, gap:10, paddingBottom:40 }}>
        {visibleEvents.length === 0 ? (
          <View style={[s.emptyBox, { borderColor: colors.border }]}>
            <Text style={{ fontSize:32, marginBottom:8 }}>📅</Text>
            <Text style={{ fontSize:14, fontWeight:'700', color: colors.textTertiary }}>No events this day</Text>
            <Text style={{ fontSize:12, color: colors.textTertiary, marginTop:4 }}>Tap "Add Event" to plan the day</Text>
          </View>
        ) : (
          <View style={{ flexDirection:'row' }}>
            <View style={[s.timelineLine, { backgroundColor: colors.borderMed }]} />
            <View style={{ flex:1, paddingLeft:16, gap:10 }}>
              {visibleEvents
                .sort((a,b) => (a.time??'').localeCompare(b.time??''))
                .map(ev => (
                  <EventCard key={ev.id} ev={ev} isParent={isParent} colors={colors}
                    onApprove={id => updateEvent(id, { approvalPending:false })} />
                ))}
            </View>
          </View>
        )}
      </ScrollView>

      <AddEventModal visible={showAdd} colors={colors}
        onClose={() => setShowAdd(false)}
        onSave={d => addEvent(d)} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                 paddingHorizontal:16, paddingVertical:12,
                 borderBottomWidth: StyleSheet.hairlineWidth },
  addBtn:      { flexDirection:'row', alignItems:'center', borderRadius:12,
                 paddingVertical:7, paddingHorizontal:12 },
  filterBar:   { borderBottomWidth: StyleSheet.hairlineWidth },
  chip:        { borderRadius:20, borderWidth:1, paddingHorizontal:12, paddingVertical:6 },
  dayCell:     { width:46, borderRadius:16, borderWidth:1, paddingVertical:8,
                 alignItems:'center', gap:2 },
  dayDot:      { width:5, height:5, borderRadius:99, marginTop:2 },
  dayHeader:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                 paddingHorizontal:16, paddingVertical:8,
                 borderBottomWidth: StyleSheet.hairlineWidth },
  countBadge:  { borderRadius:99, borderWidth:1, paddingHorizontal:10, paddingVertical:4 },
  row:         { flexDirection:'row', alignItems:'center' },
  evCard:      { borderRadius:18, borderWidth:1, padding:14, flexDirection:'row', alignItems:'flex-start' },
  evDot:       { width:10, height:10, borderRadius:99, marginTop:4, flexShrink:0 },
  evBtn:       { borderRadius:10, paddingVertical:7, alignItems:'center' },
  pendingBadge:{ borderRadius:99, borderWidth:1, paddingHorizontal:8, paddingVertical:3, marginLeft:6 },
  timelineLine:{ width:2, borderRadius:2, minHeight:40 },
  emptyBox:    { borderRadius:20, borderWidth:1, padding:40, alignItems:'center' },
  catChip:     { borderRadius:20, borderWidth:1, paddingHorizontal:10, paddingVertical:6 },
  overlay:     { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.8)' },
  sheet:       { borderTopLeftRadius:28, borderTopRightRadius:28, borderTopWidth:1,
                 padding:20, paddingBottom:40 },
  handle:      { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  label:       { fontSize:10, fontWeight:'700', letterSpacing:0.5, marginBottom:6, marginTop:10 },
  input:       { borderWidth:1.5, borderRadius:12, padding:10, fontSize:13, marginBottom:10 },
  submitBtn:   { borderRadius:14, paddingVertical:13, alignItems:'center', marginTop:4 },
});
