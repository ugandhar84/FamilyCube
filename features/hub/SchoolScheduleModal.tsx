/**
 * SchoolScheduleModal — create / edit a kid's school timetable.
 * Parent or kid can open it; parent edits are authoritative.
 *
 * Data lives in schoolStore (AsyncStorage).  No Supabase yet.
 */
import { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Pressable, Alert, ScrollView, Platform, StyleSheet,
  Modal, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Plus, Trash2, ChevronDown, X, PartyPopper, Calendar } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO, RADIUS } from '@/constants/theme';
import { useSchoolStore, type ClassPeriod, type KidSchedule, type SchoolHoliday, subjectColor } from '@/store/schoolStore';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { localDateStr, fmtDate } from '@/lib/dates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible:    boolean;
  memberId:   string;
  memberName: string;
  isParent:   boolean;
  colors:     any;
  isDark:     boolean;
  onClose:    () => void;
}

export const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = typeof ALL_DAYS[number];
const DAY_LABEL: Record<Day, string> = {
  mon: 'M', tue: 'T', wed: 'W', thu: 'Th', fri: 'F', sat: 'Sa', sun: 'Su',
};

// ─── Time picker helper ───────────────────────────────────────────────────────

export function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Simple HH:MM picker via text input — good enough for MVP
export function TimeInput({ value, onChange, placeholder, colors }: {
  value: string; onChange: (v: string) => void; placeholder: string; colors: any;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      keyboardType="numbers-and-punctuation"
      style={{ fontSize: TYPO.body, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, flex: 1, textAlign: 'center' }}
    />
  );
}

// ─── Period row (edit) ────────────────────────────────────────────────────────

export function PeriodEditor({ period, colors, isDark, onChange, onDelete }: {
  period: ClassPeriod; colors: any; isDark: boolean;
  onChange: (p: ClassPeriod) => void; onDelete: () => void;
}) {
  const col = subjectColor(period.subject);

  const toggleDay = (d: string) => {
    const days: string[] = (period as any).days ?? ALL_DAYS.slice(0, 5);
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    onChange({ ...period, days: next } as any);
  };

  const days: string[] = (period as any).days ?? ['mon', 'tue', 'wed', 'thu', 'fri'];

  return (
    <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: col + '50',
      backgroundColor: isDark ? col + '12' : col + '08', padding: 12, gap: 8 }}>

      {/* Subject + delete */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: col }} />
        {/* Bold TYPO.body placeholder text was visually indistinguishable
            from a section label/header rather than reading as an empty,
            tappable input — [live-reported, with a screenshot: "no
            subject field" on a period whose subject was genuinely just
            never typed in yet]. Placeholder now renders lighter/thinner,
            same convention every other field in this card already uses,
            so an empty Subject field looks like the other empty fields
            (Room, Teacher, Term) instead of like a static label. */}
        <TextInput
          value={period.subject}
          onChangeText={v => onChange({ ...period, subject: v })}
          placeholder="Subject / Class name"
          placeholderTextColor={colors.textTertiary}
          style={{ flex: 1, fontSize: TYPO.body, fontWeight: period.subject ? '700' : '400', color: colors.textPrimary }}
        />
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Trash2 size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* Period name + Room */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={period.period > 0 ? String(period.period) : ''}
          onChangeText={v => onChange({ ...period, period: parseInt(v) || 0 })}
          placeholder="Period #"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          style={{ width: 72, fontSize: TYPO.body, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8,
            borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, textAlign: 'center' }}
        />
        <TextInput
          value={period.room}
          onChangeText={v => onChange({ ...period, room: v })}
          placeholder="Room"
          placeholderTextColor={colors.textTertiary}
          style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8,
            borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }}
        />
      </View>

      {/* Teacher + Term */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={period.teacher ?? ''}
          onChangeText={v => onChange({ ...period, teacher: v })}
          placeholder="Teacher (optional)"
          placeholderTextColor={colors.textTertiary}
          style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8,
            borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }}
        />
        <TextInput
          value={(period as any).term ?? ''}
          onChangeText={v => onChange({ ...period, term: v || undefined } as any)}
          placeholder="Term (Q1…)"
          placeholderTextColor={colors.textTertiary}
          style={{ width: 88, fontSize: TYPO.body, color: colors.textPrimary, paddingHorizontal: 10, paddingVertical: 8,
            borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }}
        />
      </View>

      {/* Times */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TimeInput value={period.startTime} onChange={v => onChange({ ...period, startTime: v })}
          placeholder="08:00" colors={colors} />
        <Text style={{ color: colors.textTertiary, fontSize: TYPO.caption }}>→</Text>
        <TimeInput value={period.endTime} onChange={v => onChange({ ...period, endTime: v })}
          placeholder="08:50" colors={colors} />
      </View>

      {/* Days */}
      <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
        {ALL_DAYS.map(d => {
          const on = days.includes(d);
          return (
            <TouchableOpacity key={d} onPress={() => toggleDay(d)}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? col : (isDark ? '#1E293B' : '#F1F5F9'),
                borderWidth: 1.5, borderColor: on ? col : colors.border }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: on ? '#fff' : colors.textSecondary }}>
                {DAY_LABEL[d]}
              </Text>
            </TouchableOpacity>
          );
        })}
        {/* Lunch toggle */}
        <TouchableOpacity onPress={() => onChange({ ...period, isLunch: !period.isLunch })}
          style={{ paddingHorizontal: 10, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
            backgroundColor: period.isLunch ? '#F59E0B' : (isDark ? '#1E293B' : '#F1F5F9'),
            borderWidth: 1.5, borderColor: period.isLunch ? '#F59E0B' : colors.border }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: period.isLunch ? '#fff' : colors.textSecondary }}>
            🍱 Lunch
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Holidays / Breaks ──────────────────────────────────────────────────────
// Date ranges (with a reason) that suppress class-period materialization —
// Winter Break, a teacher in-service day, etc. Writes go straight through
// useSchoolStore's addHoliday/removeHoliday (not staged in this modal's own
// local draft state like periods are) since those actions already own their
// full side effect (retroactively clearing/restoring materialized
// occurrences) — deferring that to the outer Save button would mean a
// holiday's clear/restore only happens on save, which is more surprising
// than "add a holiday, it takes effect immediately" (same immediacy as
// every other schedule action already reachable outside this modal, e.g.
// deleting a period from the Vault's School tab).
export function HolidaySection({ memberId, holidays, colors, isDark }: {
  memberId: string; holidays: SchoolHoliday[]; colors: any; isDark: boolean;
}) {
  const { addHoliday, removeHoliday } = useSchoolStore();
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState('');
  const [rangeStart, setRangeStart] = useState(new Date());
  const [rangeEnd, setRangeEnd] = useState(new Date());
  const [pickingStart, setPickingStart] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [saving, setSaving] = useState(false);

  const onPickStart = (_: any, date?: Date) => {
    if (Platform.OS === 'android') setPickingStart(false);
    if (date) {
      setRangeStart(date);
      if (date > rangeEnd) setRangeEnd(date);
    }
  };
  const onPickEnd = (_: any, date?: Date) => {
    if (Platform.OS === 'android') setPickingEnd(false);
    if (date) setRangeEnd(date);
  };

  const startAdd = () => {
    setReason('');
    setRangeStart(new Date());
    setRangeEnd(new Date());
    setAdding(true);
  };

  const confirmAdd = async () => {
    if (!reason.trim()) { Alert.alert('Add a reason', 'e.g. "Winter Break"'); return; }
    setSaving(true);
    try {
      await addHoliday(memberId, {
        startDate: localDateStr(rangeStart),
        endDate:   localDateStr(rangeEnd),
        reason:    reason.trim(),
      });
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Holidays / Breaks
        </Text>
      </View>

      {holidays.map(h => (
        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
          borderRadius: 12, borderWidth: 1.5, borderColor: '#F59E0B50',
          backgroundColor: isDark ? '#F59E0B12' : '#F59E0B08', padding: 10 }}>
          <PartyPopper size={16} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{h.reason}</Text>
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
              {fmtDate(h.startDate)} – {fmtDate(h.endDate)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => removeHoliday(memberId, h.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Trash2 size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ))}

      {adding ? (
        <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: '#F59E0B50',
          backgroundColor: isDark ? '#F59E0B12' : '#F59E0B08', padding: 12, gap: 8 }}>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (e.g. Winter Break)"
            placeholderTextColor={colors.textTertiary}
            style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={() => { setPickingEnd(false); setPickingStart(true); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1.5,
                borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Calendar size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{fmtDate(localDateStr(rangeStart))}</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>–</Text>
            <TouchableOpacity onPress={() => { setPickingStart(false); setPickingEnd(true); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1.5,
                borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Calendar size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{fmtDate(localDateStr(rangeEnd))}</Text>
            </TouchableOpacity>
          </View>

          {(pickingStart || pickingEnd) && (
            <Modal transparent animationType="fade" visible onRequestClose={() => { setPickingStart(false); setPickingEnd(false); }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
                activeOpacity={1} onPress={() => { setPickingStart(false); setPickingEnd(false); }}>
                <TouchableOpacity activeOpacity={1}
                  style={{ backgroundColor: colors.card, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, paddingBottom: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>
                      📅 {pickingStart ? 'From' : 'To'}
                    </Text>
                    <TouchableOpacity onPress={() => { setPickingStart(false); setPickingEnd(false); }}>
                      <Text style={{ color: BRAND.purple, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={pickingStart ? rangeStart : rangeEnd}
                    mode="date" display="spinner"
                    minimumDate={pickingEnd ? rangeStart : undefined}
                    onChange={pickingStart ? onPickStart : onPickEnd}
                    textColor={colors.textPrimary}
                    style={{ height: 180, width: '100%' }}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => setAdding(false)}
              style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmAdd} disabled={saving}
              style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#F59E0B', opacity: saving ? 0.6 : 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>{saving ? 'Saving…' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={startAdd}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderRadius: 14, paddingVertical: 13, borderWidth: 1.5, borderStyle: 'dashed',
            borderColor: '#F59E0B60', backgroundColor: '#F59E0B08' }}>
          <Plus size={16} color="#F59E0B" />
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#F59E0B' }}>Add Holiday</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SchoolScheduleModal({ visible, memberId, memberName, isParent, colors, isDark, onClose }: Props) {
  const { schedules, addSchedule, updateSchedule, addPeriod, updatePeriod: storeUpdatePeriod, deletePeriod: storeDeletePeriod } = useSchoolStore();
  const existing = schedules.find(s => s.memberId === memberId);

  const [schoolName,   setSchoolName]   = useState(existing?.school    ?? '');
  const [gradeLabel,   setGradeLabel]   = useState(existing?.gradeYear ?? '');
  const [scheduleType, setScheduleType] = useState<'regular'|'block'|'quarterly'|'semester'>(
    (() => {
      if (!existing) return 'regular';
      const terms = [...new Set(existing.periods.map(p => (p as any).term).filter(Boolean))];
      if (terms.length >= 4) return 'quarterly';
      if (terms.length === 2) return 'semester';
      const days = [...new Set(existing.periods.flatMap(p => (p as any).days ?? []))];
      if (days.includes('a-day') || days.includes('b-day')) return 'block';
      return 'regular';
    })()
  );
  const [periods,     setPeriods]     = useState<ClassPeriod[]>(
    existing?.periods ?? []
  );

  // Reset when schedule changes externally
  const reset = useCallback(() => {
    const s = useSchoolStore.getState().schedules.find(x => x.memberId === memberId);
    setSchoolName(s?.school ?? '');
    setGradeLabel(s?.gradeYear ?? '');
    setPeriods(s?.periods ?? []);
  }, [memberId]);

  const addBlankPeriod = () => {
    const last = [...periods].sort((a, b) => a.startTime.localeCompare(b.startTime)).pop();
    const newPeriod: ClassPeriod & { days: string[] } = {
      id:        'p' + Date.now(),
      period:    periods.filter(p => !p.isLunch && !p.isBreak).length + 1,
      subject:   '',
      room:      '',
      startTime: last?.endTime ?? '08:00',
      endTime:   '',
      days:      ['mon', 'tue', 'wed', 'thu', 'fri'],
    } as any;
    setPeriods(prev => [...prev, newPeriod]);
  };

  const updatePeriod = (id: string, p: ClassPeriod) =>
    setPeriods(prev => prev.map(x => x.id === id ? p : x));

  const deletePeriod = (id: string) =>
    setPeriods(prev => prev.filter(x => x.id !== id));

  const sorted = [...periods].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  const save = async () => {
    if (!schoolName.trim() && periods.length === 0) {
      Alert.alert('Nothing to save', 'Add a school name or at least one period.');
      return;
    }
    // Was a single updateSchedule/addSchedule bulk-replace call — the
    // store's own per-period actions (addPeriod/updatePeriod/deletePeriod)
    // are the ONLY path that materializes a class period as a real
    // calendar_events row (materializePeriodEvent, schoolStore.ts), so a
    // kid/teen's class schedule never showed up in the Hub's today
    // timeline or the kiosk Overview's "My Schedule" widget — both read
    // from useEventStore, and this modal never wrote there at all
    // [live-reported: "Are we not showing the school schedule under
    // kids/teens agenda? ... should be their today's timeline in hub and
    // overview my schedule"]. Diffing the locally-edited `periods` array
    // against what's actually stored and routing each add/change/removal
    // through the real per-period actions is what actually materializes
    // the calendar events, while keeping this screen's own "edit several
    // rows, then Save once" UX unchanged.
    const previousPeriods = existing?.periods ?? [];
    const previousById = new Map(previousPeriods.map(p => [p.id, p]));
    const currentIds = new Set(sorted.map(p => p.id));

    for (const prev of previousPeriods) {
      if (!currentIds.has(prev.id)) {
        storeDeletePeriod(memberId, prev.id);
      }
    }
    // Sequential, not Promise.all — addPeriod/updatePeriod each read/write
    // the same schedules array via get()/set(), so concurrent calls would
    // race and silently drop all but the last writer's change.
    for (const period of sorted) {
      const prev = previousById.get(period.id);
      const { id, ...rest } = period;
      if (!prev) {
        await addPeriod(memberId, rest);
      } else {
        const changed = (Object.keys(rest) as (keyof typeof rest)[])
          .some(k => JSON.stringify(rest[k]) !== JSON.stringify((prev as any)[k]));
        if (changed) await storeUpdatePeriod(memberId, id, rest);
      }
    }

    // School name/grade/lunch/dayType still go through the existing
    // whole-schedule update — those fields have no per-field store action
    // and don't materialize anything, so a bulk update is fine for them.
    const scheduleMeta = {
      memberId, memberName,
      semester:    (existing?.semester ?? 'Fall') as KidSchedule['semester'],
      year:        existing?.year ?? new Date().getFullYear(),
      gradeYear:   gradeLabel.trim() || undefined,
      school:      schoolName.trim() || undefined,
      lunchPeriod: existing?.lunchPeriod ?? 'B',
      dayType:     existing?.dayType ?? 'Regular',
    };
    if (existing) updateSchedule(memberId, scheduleMeta);
    else           addSchedule({ ...scheduleMeta, periods: [] });
    onClose();
  };

  const dismiss = () => { Keyboard.dismiss(); onClose(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(92);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Pressable style={{ flex: 1 }} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '92%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>
                  {`📚 ${memberName}'s Schedule`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}>
      <View style={{ gap: 14, paddingHorizontal: 4 }}>
        {/* School info */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            School Info
          </Text>
          <TextInput
            value={schoolName}
            onChangeText={setSchoolName}
            placeholder="School name"
            placeholderTextColor={colors.textTertiary}
            style={{ fontSize: TYPO.body, color: colors.textPrimary, paddingHorizontal: 13, paddingVertical: 13,
              borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
              backgroundColor: isDark ? colors.card : '#fff' }}
          />
          <TextInput
            value={gradeLabel}
            onChangeText={setGradeLabel}
            placeholder="Grade / Year / Class (e.g. Grade 9, Year 10)"
            placeholderTextColor={colors.textTertiary}
            style={{ fontSize: TYPO.body, color: colors.textPrimary, paddingHorizontal: 13, paddingVertical: 13,
              borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
              backgroundColor: isDark ? colors.card : '#fff' }}
          />
        </View>

        {/* Schedule type */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Schedule Type
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([
              { key: 'regular',   label: 'Regular',       desc: 'Same subjects every day' },
              { key: 'block',     label: 'A/B Block',     desc: 'Alternating day schedule' },
              { key: 'quarterly', label: '4 Terms / Qtrs', desc: 'Different subjects each quarter' },
              { key: 'semester',  label: '2 Semesters',   desc: 'Fall + Spring schedule' },
            ] as const).map(opt => {
              const sel = scheduleType === opt.key;
              return (
                <Pressable key={opt.key} onPress={() => setScheduleType(opt.key)}
                  style={{ flex: 1, minWidth: '45%', paddingHorizontal: 10, paddingVertical: 10,
                    borderRadius: 14, borderWidth: 1.5,
                    borderColor: sel ? BRAND.purple : colors.border,
                    backgroundColor: sel ? BRAND.purple + '12' : (isDark ? colors.card : '#fff') }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? BRAND.purple : colors.textPrimary }}>
                    {opt.label}
                  </Text>
                  <Text style={{ fontSize: TYPO.micro, color: sel ? BRAND.purple + 'AA' : colors.textTertiary, marginTop: 2 }}>
                    {opt.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {scheduleType !== 'regular' && (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
              {scheduleType === 'block'     ? 'Add periods and set days to "A day" or "B day" (Mon/Wed/Fri and Tue/Thu).' : ''}
              {scheduleType === 'quarterly' ? 'Add periods per quarter and set the Term field (Q1, Q2, Q3, Q4).' : ''}
              {scheduleType === 'semester'  ? 'Add periods per semester and set the Term field (Fall, Spring).' : ''}
            </Text>
          )}
        </View>

        {/* Periods */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Timetable
            </Text>
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>Times as HH:MM (24h)</Text>
          </View>

          {sorted.map(p => (
            <PeriodEditor key={p.id} period={p} colors={colors} isDark={isDark}
              onChange={updated => updatePeriod(p.id, updated)}
              onDelete={() => deletePeriod(p.id)} />
          ))}

          <TouchableOpacity onPress={addBlankPeriod}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              borderRadius: 14, paddingVertical: 13, borderWidth: 1.5, borderStyle: 'dashed',
              borderColor: BRAND.purple + '60', backgroundColor: BRAND.purple + '08' }}>
            <Plus size={16} color={BRAND.purple} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: BRAND.purple }}>Add Period</Text>
          </TouchableOpacity>
        </View>

        <HolidaySection memberId={memberId} holidays={existing?.holidays ?? []} colors={colors} isDark={isDark} />
      </View>
            </ScrollView>

            {/* Sticky footer */}
            <View style={{ padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity onPress={save}
                style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center', backgroundColor: BRAND.purple }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: '#fff' }}>
                  {existing ? 'Save Changes' : 'Save Schedule'}
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Hub card — inline display ────────────────────────────────────────────────

function getNowStatus(periods: ClassPeriod[]) {
  const now   = new Date();
  const nowM  = now.getHours() * 60 + now.getMinutes();
  const dayMap: Record<number, string> = { 0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat' };
  const today = dayMap[now.getDay()];

  const todayPeriods = periods
    .filter(p => {
      const days: string[] = (p as any).days ?? ['mon','tue','wed','thu','fri'];
      return days.includes(today);
    })
    .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  if (todayPeriods.length === 0) return { status: 'no_school' as const, period: null, next: null };

  const current = todayPeriods.find(p =>
    nowM >= timeToMins(p.startTime) && nowM < timeToMins(p.endTime)
  );
  if (current) {
    const idx  = todayPeriods.indexOf(current);
    const next = todayPeriods[idx + 1] ?? null;
    return { status: 'in_class' as const, period: current, next };
  }

  const firstStart = timeToMins(todayPeriods[0].startTime);
  if (nowM < firstStart) return { status: 'before_school' as const, period: null, next: todayPeriods[0] };

  const lastEnd = timeToMins(todayPeriods[todayPeriods.length - 1].endTime);
  if (nowM >= lastEnd) return { status: 'done' as const, period: null, next: null };

  // Between periods
  const next = todayPeriods.find(p => timeToMins(p.startTime) > nowM) ?? null;
  return { status: 'break' as const, period: null, next };
}

const DAY_KEYS  = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_ABBR: Record<string,string> = { mon:'M',tue:'T',wed:'W',thu:'Th',fri:'F',sat:'Sa',sun:'Su' };
const DAY_FULL: Record<string,string> = { mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat',sun:'Sun' };
const NOW_DAY_KEY_MAP: Record<number,string> = { 0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat' };

export function SchoolScheduleCard({ memberId, memberName, isParent, colors, isDark, defaultExpanded, externalOpenRequested, onExternalOpenHandled, onEditModalVisibilityChange, renderEditModal }: {
  memberId: string; memberName: string; isParent: boolean; colors: any; isDark: boolean; defaultExpanded?: boolean;
  /** Set true to open this card's edit-schedule modal from OUTSIDE (the
   * shared FAB's School-tab "+" face, via SchoolTab.tsx's one-shot uiStore
   * flag) — same one-shot pattern as HealthTab's own composer-requested
   * flag. onExternalOpenHandled must be called once consumed so the caller
   * can clear its own flag. */
  externalOpenRequested?: boolean;
  onExternalOpenHandled?: () => void;
  /** Fires whenever this card's own edit-schedule Modal opens/closes —
   * lets a kiosk wrapper participate in the idle lock while a parent is
   * mid-edit (this Modal has no kiosk awareness of its own, same real bug
   * class already fixed for AskCubeChat/other phone-shared modals: kiosk's
   * idle timer kept running as if nothing was happening, risking a
   * discarded draft) [live-requested: "please aling those 2 pages with
   * the exact mobile functionality" — School's own CRUD modal]. Optional;
   * the phone's own SchoolTab.tsx never passes this, so its behavior is
   * completely unchanged. */
  onEditModalVisibilityChange?: (open: boolean) => void;
  /** Kiosk-only override — when provided, this card renders the given
   * function instead of mounting its own real SchoolScheduleModal, so a
   * kiosk wrapper can show its own KioskFormDrawer-shelled version of the
   * exact same real form instead of the phone's slide-up sheet
   * [live-reported: "i see that there is manual forms are missing in
   * school it should be side form"]. Same visible/onClose contract as the
   * built-in modal — the card still owns editModalOpen and still decides
   * when to show it, only the rendered shell changes. Optional; every
   * existing caller (the phone's own SchoolScreen.tsx/SchoolTab.tsx) never
   * passes this, so their behavior is completely unchanged. */
  renderEditModal?: (props: { visible: boolean; onClose: () => void; memberId: string; memberName: string; isParent: boolean }) => ReactNode;
}) {
  const [editModalOpen, setEditModalOpenState] = useState(false);
  const setEditModalOpen = (open: boolean) => {
    setEditModalOpenState(open);
    onEditModalVisibilityChange?.(open);
  };
  useEffect(() => {
    if (externalOpenRequested) {
      setEditModalOpen(true);
      onExternalOpenHandled?.();
    }
  }, [externalOpenRequested]);
  const { schedules } = useSchoolStore();
  const schedule = schedules.find(s => s.memberId === memberId);

  // Derive which days and terms actually have periods
  const availableDays = useMemo(() => {
    if (!schedule) return [] as string[];
    const set = new Set<string>();
    schedule.periods.forEach(p => {
      const days: string[] = (p as any).days ?? ['mon','tue','wed','thu','fri'];
      days.forEach(d => set.add(d));
    });
    return DAY_KEYS.filter(d => set.has(d));
  }, [schedule]);

  const availableTerms = useMemo(() => {
    if (!schedule) return [] as string[];
    const set = new Set<string>();
    schedule.periods.forEach(p => { if ((p as any).term) set.add((p as any).term); });
    return [...set];
  }, [schedule]);

  const todayKey = NOW_DAY_KEY_MAP[new Date().getDay()];
  const [selectedDay,  setSelectedDay]  = useState<string | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);

  // Default day to today (or first available)
  const activeDay = selectedDay ?? (availableDays.includes(todayKey) ? todayKey : (availableDays[0] ?? todayKey));
  const activeTerm = selectedTerm; // null = all terms

  const dayPeriods = useMemo(() => {
    if (!schedule) return [] as ClassPeriod[];
    return schedule.periods
      .filter(p => {
        const days: string[] = (p as any).days ?? ['mon','tue','wed','thu','fri'];
        const term: string | undefined = (p as any).term;
        const dayMatch  = days.includes(activeDay);
        const termMatch = !activeTerm || !term || term === activeTerm;
        return dayMatch && termMatch;
      })
      .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  }, [schedule, activeDay, activeTerm]);

  const { status, period, next } = useMemo(
    () => schedule ? getNowStatus(schedule.periods) : { status: 'no_school' as const, period: null, next: null },
    [schedule]
  );

  const chip = useMemo(() => {
    if (!schedule)              return { label: 'No schedule set',      color: colors.textTertiary, bg: colors.border + '30' };
    if (status === 'no_school') return { label: 'No school today',      color: colors.textSecondary, bg: colors.border + '30' };
    if (status === 'done')      return { label: '✓ School done',        color: '#10B981', bg: '#10B98118' };
    if (status === 'in_class' && period?.isLunch) return { label: '🍱 Lunch', color: '#F59E0B', bg: '#F59E0B18' };
    if (status === 'in_class')  return { label: `📖 ${period!.subject}`, color: BRAND.purple, bg: BRAND.purple + '18' };
    if (status === 'break')     return { label: '☕ Break',             color: BRAND.teal, bg: BRAND.teal + '18' };
    if (status === 'before_school') return { label: '⏰ School starts soon', color: BRAND.amber, bg: BRAND.amber + '18' };
    return { label: '', color: '', bg: '' };
  }, [schedule, status, period, colors]);

  const nowM = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <>
      <View style={{ backgroundColor: colors.card, borderRadius: 18,
        borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
        shadowColor: colors.textPrimary, shadowOpacity: 0.06, shadowRadius: 12,
        shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
        <LinearGradient
          colors={[colors.primary + '0C', colors.primary + '00']}
          start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {Platform.OS === 'ios' ? (
          <BlurView intensity={18} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
        )}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)' }} pointerEvents="none" />

        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
          <Text style={{ fontSize: 15 }}>🏫</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>School Schedule</Text>
            {schedule?.school && (
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>{schedule.school}</Text>
            )}
          </View>
          {chip.label ? (
            <View style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: chip.bg }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: chip.color }}>{chip.label}</Text>
            </View>
          ) : null}
        </View>

        {!schedule ? (
          /* No schedule yet. The real create-schedule entry point now
             lives in the title row above this card (SchoolTab.tsx's own
             "Create Schedule" button beside the selected kid's name)
             [live-requested: "i want create a schedule button in the row
             of title once we select the kid" / "in empty component we can
             remove that button" — this card's own copy of that button,
             added when this was the only entry point, is redundant now]. */
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>
              No schedule yet
            </Text>
          </View>
        ) : (
          <>
            {/* Term tabs — only when multiple terms */}
            {availableTerms.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: 14, marginBottom: 8 }}
                contentContainerStyle={{ gap: 6 }}>
                {[null, ...availableTerms].map(t => {
                  const sel = activeTerm === t;
                  return (
                    <Pressable key={t ?? 'all'} onPress={() => setSelectedTerm(t)}
                      style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
                        backgroundColor: sel ? BRAND.purple + '20' : (isDark ? '#1E293B' : '#F1F5F9'),
                        borderWidth: 1.5, borderColor: sel ? BRAND.purple : colors.border }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: sel ? BRAND.purple : colors.textSecondary }}>
                        {t ?? 'All'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Day tab strip — only days that have periods */}
            {availableDays.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: 14, marginBottom: 10 }}
                contentContainerStyle={{ gap: 6 }}>
                {availableDays.map(d => {
                  const sel = d === activeDay;
                  const isToday = d === todayKey;
                  return (
                    <Pressable key={d} onPress={() => setSelectedDay(d)}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                        backgroundColor: sel ? BRAND.purple : (isDark ? '#1E293B' : '#F1F5F9'),
                        borderWidth: isToday ? 2 : 1.5,
                        borderColor: sel ? BRAND.purple : (isToday ? BRAND.purple + '60' : colors.border) }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? '#fff' : (isToday ? BRAND.purple : colors.textSecondary) }}>
                        {DAY_FULL[d]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Timeline for selected day */}
            <View style={{ borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#F1F5F9', marginHorizontal: 0 }}>
              {dayPeriods.length === 0 ? (
                <Text style={{ paddingHorizontal: 14, paddingVertical: 14, fontSize: TYPO.caption, color: colors.textSecondary }}>
                  No classes on {DAY_FULL[activeDay] ?? activeDay}.
                </Text>
              ) : dayPeriods.map((p, i) => {
                const col    = subjectColor(p.subject);
                const isActiveDay = activeDay === todayKey;
                const active = isActiveDay && nowM >= timeToMins(p.startTime) && nowM < timeToMins(p.endTime);
                const past   = isActiveDay && nowM >= timeToMins(p.endTime);
                return (
                  <View key={p.id} style={{ flexDirection: 'row', gap: 0,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: isDark ? colors.border + '60' : '#F3F4F6',
                    backgroundColor: active ? col + '0E' : 'transparent', opacity: past ? 0.5 : 1 }}>
                    {/* Colored left rail */}
                    <View style={{ width: 4, backgroundColor: p.isLunch ? '#F59E0B' : col, borderRadius: 0 }} />
                    {/* Time column */}
                    <View style={{ width: 54, paddingVertical: 10, paddingLeft: 10, alignItems: 'flex-start', justifyContent: 'center' }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: active ? col : colors.textTertiary, fontVariant: ['tabular-nums'] }}>
                        {formatTime(p.startTime)}
                      </Text>
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontVariant: ['tabular-nums'] }}>
                        {formatTime(p.endTime)}
                      </Text>
                    </View>
                    {/* Subject + meta */}
                    <View style={{ flex: 1, paddingVertical: 10, paddingRight: 14, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {past && <Text style={{ fontSize: TYPO.micro, color: '#10B981' }}>✓</Text>}
                        {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: col }} />}
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800',
                          color: p.isLunch ? '#D97706' : (active ? col : colors.textPrimary) }} numberOfLines={1}>
                          {p.subject}
                        </Text>
                        {(p as any).term && availableTerms.length > 1 && !activeTerm && (
                          <Text style={{ fontSize: TYPO.micro, color: BRAND.teal, fontWeight: '700' }}>{(p as any).term}</Text>
                        )}
                      </View>
                      {(p.teacher || p.room) && (
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>
                          {[p.teacher, p.room].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Footer: edit */}
            <Pressable onPress={() => setEditModalOpen(true)}
              style={{ paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1,
                borderTopColor: isDark ? colors.border : '#F1F5F9', alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>
                {isParent ? 'Edit Schedule →' : 'View / Edit Schedule →'}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {renderEditModal ? renderEditModal({ visible: editModalOpen, onClose: () => setEditModalOpen(false), memberId, memberName, isParent }) : (
        <SchoolScheduleModal
          visible={editModalOpen}
          memberId={memberId}
          memberName={memberName}
          isParent={isParent}
          colors={colors}
          isDark={isDark}
          onClose={() => setEditModalOpen(false)}
        />
      )}
    </>
  );
}
