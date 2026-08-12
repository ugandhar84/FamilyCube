/**
 * HelpRequestModal — create a help request.
 *
 * Adults can log on behalf of a kid (child-selector shown).
 * Kids see "request from me" flow.
 * Homework requests → coin bounty badge.
 * Ride → pick-up / drop-off / round-trip toggle + schedule fields.
 * Tutoring / Childcare → date + time + duration fields.
 * Preferred helper picker (adults in family + "Any Available").
 * All decline/reassign note logic lives in HelpQueueSection.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useHelpStore, HelpCategory, HelpUrgency, RideMode } from '@/store/helpStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

// ─── Suggestion pills ─────────────────────────────────────────────────────────
const SUGGESTIONS: { label: string; icon: string; category: HelpCategory }[] = [
  { label: 'Ride to school',      icon: '🚌', category: 'Ride'      },
  { label: 'Pick up from sports', icon: '⚽', category: 'Ride'      },
  { label: 'Doctor visit',        icon: '🏥', category: 'Ride'      },
  { label: 'Airport drop-off',    icon: '✈️', category: 'Ride'      },
  { label: 'Grocery run',         icon: '🛒', category: 'Errand'    },
  { label: 'Pharmacy pickup',     icon: '💊', category: 'Errand'    },
  { label: 'Math homework',       icon: '🔢', category: 'Homework'  },
  { label: 'Science project',     icon: '🔬', category: 'Homework'  },
  { label: 'Watch the kids',      icon: '👶', category: 'Childcare' },
  { label: 'House chores',        icon: '🧹', category: 'Chore'     },
  { label: 'Tech / iPad help',    icon: '💻', category: 'Advice'    },
  { label: 'Emotional support',   icon: '💖', category: 'Advice'    },
];

const DURATIONS = ['30 min', '1 hr', '1.5 hr', '2 hr', '3 hr'];
const DURATION_MINS: Record<string, number> = {
  '30 min': 30, '1 hr': 60, '1.5 hr': 90, '2 hr': 120, '3 hr': 180,
};

type UrgencyOpt = { key: HelpUrgency; label: string; color: string };
const URGENCY_OPTS: UrgencyOpt[] = [
  { key: 'Low',    label: '🟢 Sometime',  color: '#10B981' },
  { key: 'Medium', label: '🟡 Today',     color: BRAND.amber },
  { key: 'High',   label: '🔴 Urgent!',   color: '#EF4444' },
];

// ─── Small helpers ────────────────────────────────────────────────────────────
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(d: Date) {
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function timeStr(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function addMins(d: Date, mins: number) { return new Date(d.getTime() + mins * 60000); }

// ─── Shared field label ───────────────────────────────────────────────────────
function FieldLabel({ text, required, colors }: { text: string; required?: boolean; colors: any }) {
  return (
    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 }}>
      {text}{required ? <Text style={{ color: '#EF4444' }}> *</Text> : null}
    </Text>
  );
}

// ─── Date/time button row ─────────────────────────────────────────────────────
function DTRow({ label, date, mode, colors, isDark, open, onOpen, onPick }: {
  label: string; date: Date; mode: 'date' | 'time';
  colors: any; isDark: boolean;
  open: boolean; onOpen: () => void; onPick: (d: Date) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <FieldLabel text={label} colors={colors} />
      <Pressable onPress={onOpen}
        style={[s.dtBtn, { backgroundColor: colors.surface, borderColor: open ? BRAND.purple : colors.border }]}>
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={16} color={BRAND.purple} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>
          {mode === 'date' ? fmtDate(date) : fmtTime(date)}
        </Text>
        <Ionicons name="chevron-down" size={13} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
      </Pressable>
      {open && (
        <DateTimePicker
          value={date} mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, d) => d && onPick(d)}
          minimumDate={mode === 'date' ? new Date() : undefined}
          themeVariant={isDark ? 'dark' : 'light'}
          style={{ marginTop: 4 }}
        />
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function HelpRequestModal({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const addRequest = useHelpStore(s => s.addRequest);

  const active = members.find(m => m.id === activeMemberId) ?? members[0];
  const isAdult = active?.role === 'parent' || active?.role === 'senior';
  const kids = members.filter(m => m.role === 'kid');
  const adults = members.filter(m => m.role === 'parent' || m.role === 'senior');

  // ── Form state ──
  const [onBehalfOfId, setOnBehalfOfId] = useState(kids[0]?.id ?? '');
  const [typeText, setTypeText]         = useState('');
  const [category, setCategory]         = useState<HelpCategory>('General');
  const [description, setDescription]   = useState('');
  const [urgency, setUrgency]           = useState<HelpUrgency>('Medium');
  const [preferredHelper, setPref]      = useState('');
  const [rideMode, setRideMode]         = useState<RideMode>('pickup');
  const [duration, setDuration]         = useState('1 hr');

  const now0 = new Date();
  const [date, setDate]         = useState(now0);
  const [startTime, setStart]   = useState(now0);
  const [endTime, setEnd]       = useState(addMins(now0, 60));
  const [returnTime, setReturn] = useState(addMins(now0, 120));

  const [picker, setPicker] = useState<string | null>(null);
  const tog = (key: string) => setPicker(p => p === key ? null : key);

  const filteredSuggs = useMemo(() => {
    const q = typeText.toLowerCase();
    return q ? SUGGESTIONS.filter(sg => sg.label.toLowerCase().includes(q) || sg.category.toLowerCase().includes(q)) : SUGGESTIONS;
  }, [typeText]);

  const isRide      = category === 'Ride';
  const isTutoring  = category === 'Homework';
  const isChildcare = category === 'Childcare';
  const isErrand    = category === 'Errand' || category === 'Chore';
  const isTimeBound = isRide || isTutoring || isChildcare || isErrand;

  const coinBounty = category === 'Homework' ? 20 : 0;
  const canSubmit  = typeText.trim().length > 0 && description.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const requester = isAdult
      ? (members.find(m => m.id === onBehalfOfId) ?? active)
      : active;

    addRequest({
      requesterName:   requester?.name ?? '',
      requesterId:     requester?.id   ?? '',
      onBehalfOf:      isAdult ? active?.name : undefined,
      title:           typeText.trim(),
      description:     description.trim(),
      category,
      urgency,
      preferredHelper: preferredHelper || undefined,
      rewardCoins:     coinBounty || undefined,
      date:            isTimeBound ? dateStr(date) : undefined,
      time:            isTimeBound ? timeStr(startTime) : undefined,
      endTime:         isChildcare ? timeStr(endTime) : isTutoring ? timeStr(addMins(startTime, DURATION_MINS[duration])) : undefined,
      returnTime:      (isRide && rideMode === 'roundtrip') ? timeStr(returnTime) : undefined,
      rideMode:        isRide ? rideMode : undefined,
    });

    resetAndClose();
  };

  const resetAndClose = () => {
    setTypeText(''); setCategory('General'); setDescription('');
    setUrgency('Medium'); setPref(''); setRideMode('pickup');
    setDuration('1 hr'); setPicker(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <Pressable style={s.backdrop} onPress={resetAndClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 0 }}>
        <View style={[s.sheet, { backgroundColor: isDark ? '#111827' : '#FFFFFF', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
          <View style={[s.handle, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />

          {/* Header */}
          <View style={s.hdr}>
            <View style={[s.hdrIcon, { backgroundColor: BRAND.purple + '20' }]}>
              <Ionicons name="help-circle" size={20} color={BRAND.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: colors.textPrimary }]}>
                {isAdult ? 'Dispatch Help for a Kid' : 'Ask Family for Help'}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                {isAdult ? 'Assign tutoring, ride, or support for a child' : 'Parents, siblings, or grandparents can help'}
              </Text>
            </View>
            <Pressable onPress={resetAndClose}
              style={[s.closeBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.body}>

            {/* Child selector — adults only */}
            {isAdult && kids.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <FieldLabel text="Which kid needs help?" colors={colors} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {kids.map(k => (
                    <Pressable key={k.id} onPress={() => setOnBehalfOfId(k.id)}
                      style={[s.chip, {
                        backgroundColor: onBehalfOfId === k.id ? BRAND.amber + '20' : colors.surface,
                        borderColor: onBehalfOfId === k.id ? BRAND.amber : colors.border,
                      }]}>
                      <Text style={{ fontSize: TYPO.body }}>{k.emoji ?? '🧒'}</Text>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: onBehalfOfId === k.id ? BRAND.amber : colors.textSecondary }}>
                        {k.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Request type + suggestion pills ── */}
            <FieldLabel text="What's needed?" required colors={colors} />
            <TextInput
              value={typeText} onChangeText={setTypeText}
              placeholder="e.g. Ride to soccer practice, math homework..."
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: typeText ? BRAND.purple : colors.border }]}
              returnKeyType="done"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, marginBottom: 16 }}>
              {filteredSuggs.map(sg => {
                const sel = typeText === sg.label && category === sg.category;
                return (
                  <Pressable key={sg.label} onPress={() => { setTypeText(sg.label); setCategory(sg.category); setPicker(null); }}
                    style={[s.pill, {
                      backgroundColor: sel ? BRAND.purple + '22' : (isDark ? '#1E293B' : '#F1F5F9'),
                      borderColor: sel ? BRAND.purple : (isDark ? '#334155' : '#E2E8F0'),
                    }]}>
                    <Text style={{ fontSize: TYPO.label }}>{sg.icon}</Text>
                    <Text style={[s.pillText, { color: sel ? BRAND.purple : colors.textSecondary }]}>{sg.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── Description (mandatory) ── */}
            <FieldLabel text="Description" required colors={colors} />
            <TextInput
              value={description} onChangeText={setDescription}
              placeholder="Who, where, any special needs or context..."
              placeholderTextColor={colors.textTertiary}
              style={[s.input, s.multi, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: description ? BRAND.teal : colors.border }]}
              multiline numberOfLines={3} textAlignVertical="top"
            />

            {/* ── Urgency ── */}
            <FieldLabel text="Urgency" colors={colors} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {URGENCY_OPTS.map(u => (
                <Pressable key={u.key} onPress={() => setUrgency(u.key)}
                  style={[s.segBtn, { flex: 1, backgroundColor: urgency === u.key ? u.color + '18' : colors.surface, borderColor: urgency === u.key ? u.color : colors.border }]}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: urgency === u.key ? '800' : '600', color: urgency === u.key ? u.color : colors.textSecondary }}>
                    {u.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Preferred helper ── */}
            {adults.length > 0 && (
              <>
                <FieldLabel text={isAdult ? 'Assign helper' : 'Preferred helper (optional)'} colors={colors} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {[{ id: '', name: 'Any Available', emoji: '👥' }, ...adults].map(a => (
                    <Pressable key={a.id} onPress={() => setPref(a.id)}
                      style={[s.chip, {
                        backgroundColor: preferredHelper === a.id ? BRAND.teal + '20' : colors.surface,
                        borderColor: preferredHelper === a.id ? BRAND.teal : colors.border,
                      }]}>
                      <Text style={{ fontSize: TYPO.body }}>{(a as any).emoji ?? '👤'}</Text>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: preferredHelper === a.id ? BRAND.teal : colors.textSecondary }}>
                        {a.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── Coin bounty (Homework) ── */}
            {category === 'Homework' && (
              <View style={{ backgroundColor: BRAND.purple + '15', borderRadius: 14, borderWidth: 1, borderColor: BRAND.purple + '35', padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>Co-Learning Bounty</Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary, marginTop: 2 }}>Both the kid and helper earn bonus coins on completion!</Text>
                </View>
                <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: BRAND.amber }}>+{coinBounty}🪙</Text>
              </View>
            )}

            {/* ── RIDE fields ── */}
            {isRide && (
              <>
                <FieldLabel text="Ride type" colors={colors} />
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  {([
                    { key: 'pickup',    label: '🚗 Pick-up',  sub: 'Bring me home'    },
                    { key: 'dropoff',   label: '🏁 Drop-off', sub: 'Take me there'    },
                    { key: 'roundtrip', label: '🔄 Both',     sub: '2 events created' },
                  ] as { key: RideMode; label: string; sub: string }[]).map(r => (
                    <Pressable key={r.key} onPress={() => setRideMode(r.key)}
                      style={[s.rideBtn, { flex: 1, backgroundColor: rideMode === r.key ? BRAND.teal + '20' : colors.surface, borderColor: rideMode === r.key ? BRAND.teal : colors.border }]}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: rideMode === r.key ? '800' : '600', color: rideMode === r.key ? BRAND.teal : colors.textSecondary, textAlign: 'center' }}>{r.label}</Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center', marginTop: 2 }}>{r.sub}</Text>
                    </Pressable>
                  ))}
                </View>
                {rideMode === 'roundtrip' && (
                  <View style={{ backgroundColor: BRAND.teal + '15', borderRadius: 12, borderWidth: 1, borderColor: BRAND.teal + '40', padding: 10, marginBottom: 14, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Ionicons name="information-circle" size={15} color={BRAND.teal} />
                    <Text style={{ fontSize: TYPO.label, color: BRAND.teal, fontWeight: '700', flex: 1 }}>Two schedule entries will be created — drop-off and return pick-up.</Text>
                  </View>
                )}
                <DTRow label="Date" date={date} mode="date" colors={colors} isDark={isDark} open={picker === 'date'} onOpen={() => tog('date')} onPick={d => { setDate(d); setPicker(null); }} />
                {(rideMode === 'dropoff' || rideMode === 'roundtrip') && (
                  <DTRow label="Drop-off time" date={startTime} mode="time" colors={colors} isDark={isDark} open={picker === 'start'} onOpen={() => tog('start')} onPick={d => { setStart(d); setPicker(null); }} />
                )}
                {rideMode === 'pickup' && (
                  <DTRow label="Pick-up time" date={startTime} mode="time" colors={colors} isDark={isDark} open={picker === 'start'} onOpen={() => tog('start')} onPick={d => { setStart(d); setPicker(null); }} />
                )}
                {rideMode === 'roundtrip' && (
                  <DTRow label="Return pick-up time" date={returnTime} mode="time" colors={colors} isDark={isDark} open={picker === 'ret'} onOpen={() => tog('ret')} onPick={d => { setReturn(d); setPicker(null); }} />
                )}
              </>
            )}

            {/* ── TUTORING / HOMEWORK fields ── */}
            {isTutoring && (
              <>
                <DTRow label="Date" date={date} mode="date" colors={colors} isDark={isDark} open={picker === 'date'} onOpen={() => tog('date')} onPick={d => { setDate(d); setPicker(null); }} />
                <DTRow label="Start time" date={startTime} mode="time" colors={colors} isDark={isDark} open={picker === 'start'} onOpen={() => tog('start')} onPick={d => { setStart(d); setPicker(null); }} />
                <FieldLabel text="Duration" colors={colors} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                  {DURATIONS.map(d => (
                    <Pressable key={d} onPress={() => setDuration(d)}
                      style={[s.chip, { backgroundColor: duration === d ? BRAND.amber + '20' : colors.surface, borderColor: duration === d ? BRAND.amber : colors.border }]}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: duration === d ? BRAND.amber : colors.textSecondary }}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── CHILDCARE fields ── */}
            {isChildcare && (
              <>
                <DTRow label="Date" date={date} mode="date" colors={colors} isDark={isDark} open={picker === 'date'} onOpen={() => tog('date')} onPick={d => { setDate(d); setPicker(null); }} />
                <DTRow label="Start time" date={startTime} mode="time" colors={colors} isDark={isDark} open={picker === 'start'} onOpen={() => tog('start')} onPick={d => { setStart(d); setPicker(null); }} />
                <DTRow label="End time" date={endTime} mode="time" colors={colors} isDark={isDark} open={picker === 'end'} onOpen={() => tog('end')} onPick={d => { setEnd(d); setPicker(null); }} />
              </>
            )}

            {/* ── ERRAND / CHORE — just date ── */}
            {isErrand && (
              <DTRow label="Needed by (date)" date={date} mode="date" colors={colors} isDark={isDark} open={picker === 'date'} onOpen={() => tog('date')} onPick={d => { setDate(d); setPicker(null); }} />
            )}

            {/* ── Submit ── */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable onPress={resetAndClose}
                style={[s.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSubmit}
                style={[s.submitBtn, { backgroundColor: canSubmit ? BRAND.purple : colors.border, flex: 2 }]}>
                <Ionicons name="send" size={15} color={canSubmit ? '#fff' : colors.textTertiary} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: canSubmit ? '#fff' : colors.textTertiary }}>
                  {isAdult ? 'Dispatch for Kid →' : 'Submit to Family →'}
                </Text>
              </Pressable>
            </View>

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(2,6,23,0.72)' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, maxHeight: '92%' },
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 12 },
  hdr:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  hdrIcon:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: TYPO.caption, fontWeight: '900' },
  closeBtn:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body:      { paddingHorizontal: 20, paddingBottom: 40 },
  input:     { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: TYPO.body, marginBottom: 14 },
  multi:     { minHeight: 88, paddingTop: 12 },
  pill:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  pillText:  { fontSize: TYPO.label, fontWeight: '600' },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  segBtn:    { paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rideBtn:   { paddingVertical: 12, paddingHorizontal: 6, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
  dtBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  submitBtn: { flexDirection: 'row', gap: 6, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});
