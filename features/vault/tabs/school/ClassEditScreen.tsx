/**
 * ClassEditScreen — add, edit or delete ONE class on a child's timetable (subject, room, teacher, times, days, term).
 * Saves straight into the child's schedule (the same record the timetable scan writes); deleting asks first.
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayPage, OverlayHeading } from '@/components/OverlayPage';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { useSchoolStore, type ClassPeriod } from '@/store/schoolStore';
import { TimeField } from './TimeField';

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' }, { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' },
];

export function ClassEditScreen({ colors, isDark, memberId, memberName, period, terms, defaultTerm, onClose, zIndex = 59 }: {
  colors: any; isDark: boolean;
  memberId: string; memberName: string;
  /** The class being edited; null adds a new one. */
  period: ClassPeriod | null;
  terms: string[];
  defaultTerm?: string;
  onClose: () => void;
  zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState(period?.subject ?? '');
  const [room, setRoom] = useState(period?.room ?? '');
  const [teacher, setTeacher] = useState(period?.teacher ?? '');
  const [start, setStart] = useState<string | null>(period?.startTime ?? '08:00');
  const [end, setEnd] = useState<string | null>(period?.endTime ?? '08:50');
  const [days, setDays] = useState<string[]>(period?.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']);
  const [term, setTerm] = useState<string | undefined>(period ? period.term : defaultTerm);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [subject, start, end, days]);

  const canvas = isDark ? colors.background : GEMINI.canvas;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const BLUE = GEMINI.blue;
  const field = { borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: cardBg } as const;
  const label = { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4, color: bodyC, marginBottom: 4, textTransform: 'uppercase' as const };

  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  const save = () => {
    if (!subject.trim()) { setError('Give the class a name.'); return; }
    if (!start || !end || toMin(end) <= toMin(start)) { setError('The end time has to be after the start time.'); return; }
    if (days.length === 0) { setError('Pick at least one day.'); return; }
    const st = useSchoolStore.getState();
    const schedule = st.schedules.find(s => s.memberId === memberId);
    if (!schedule) return;
    const patch = { subject: subject.trim(), room: room.trim(), teacher: teacher.trim() || undefined, startTime: start, endTime: end, days, term };
    if (period) {
      // A class that is also on the calendar keeps that series in step; the rest are saved straight to the schedule.
      if (period.linkedEventId) st.updatePeriod(memberId, period.id, patch);
      else st.updateSchedule(memberId, { periods: schedule.periods.map(p => p.id === period.id ? { ...p, ...patch } : p) });
    } else {
      const next: ClassPeriod = { id: 'p' + Date.now(), period: schedule.periods.length + 1, ...patch } as ClassPeriod;
      st.updateSchedule(memberId, { periods: [...schedule.periods, next].sort((a, b) => a.startTime.localeCompare(b.startTime)) });
    }
    onClose();
  };

  const remove = () => {
    if (!period) return;
    Alert.alert(`Delete ${period.subject}?`, `It's removed from ${memberName.split(' ')[0]}'s timetable${period.term ? ` (${period.term})` : ''}.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { useSchoolStore.getState().deletePeriod(memberId, period.id); onClose(); } },
    ]);
  };

  return (
    <OverlayPage visible onDismiss={onClose} zIndex={zIndex} backgroundColor={canvas}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <OverlayHeading eyebrow="FAMILY CUBE · SCHOOL" title={period ? 'Edit class' : 'Add a class'}
          subtitle={`${memberName.split(' ')[0]}'s timetable`} accent="amber" topInset={insets.top} onTitlePress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, paddingBottom: insets.bottom + RHYTHM.section, gap: RHYTHM.item }}>
            <View style={field}>
              <Text style={label}>Class</Text>
              <TextInput value={subject} onChangeText={setSubject} placeholder="e.g. Math" placeholderTextColor={bodyC + '88'} style={{ fontSize: 16, color: titleC, padding: 0 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
              <View style={[field, { flex: 1 }]}>
                <Text style={label}>Room</Text>
                <TextInput value={room} onChangeText={setRoom} placeholder="Optional" placeholderTextColor={bodyC + '88'} style={{ fontSize: 15, color: titleC, padding: 0 }} />
              </View>
              <View style={[field, { flex: 1 }]}>
                <Text style={label}>Teacher</Text>
                <TextInput value={teacher} onChangeText={setTeacher} placeholder="Optional" placeholderTextColor={bodyC + '88'} style={{ fontSize: 15, color: titleC, padding: 0 }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
              <View style={{ flex: 1 }}><TimeField label="Starts" value={start} onChange={setStart} colors={colors} isDark={isDark} accent={BLUE} /></View>
              <View style={{ flex: 1 }}><TimeField label="Ends" value={end} onChange={setEnd} colors={colors} isDark={isDark} accent={BLUE} /></View>
            </View>

            <View>
              <Text style={label}>Days</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {DAYS.map(d => {
                  const on = days.includes(d.key);
                  return (
                    <TouchableOpacity key={d.key} onPress={() => setDays(prev => on ? prev.filter(x => x !== d.key) : [...prev, d.key])}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1.5,
                        borderColor: on ? BLUE : border, backgroundColor: on ? BLUE + '18' : cardBg }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: on ? BLUE : bodyC }}>{d.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {terms.length > 0 && (
              <View>
                <Text style={label}>Term</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[...terms, undefined].map(t => {
                    const on = term === t;
                    return (
                      <TouchableOpacity key={t ?? 'all'} onPress={() => setTerm(t)}
                        style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5,
                          borderColor: on ? BLUE : border, backgroundColor: on ? BLUE + '18' : cardBg }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: on ? BLUE : bodyC }}>{t ?? 'All year'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {error ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>{error}</Text> : null}

            <TouchableOpacity onPress={save} accessibilityRole="button"
              style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{period ? 'Save changes' : 'Add class'}</Text>
            </TouchableOpacity>
            {period && (
              <TouchableOpacity onPress={remove} accessibilityRole="button"
                style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger + '1A' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.danger }}>Delete this class</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </OverlayPage>
  );
}
