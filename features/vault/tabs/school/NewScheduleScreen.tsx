/**
 * NewScheduleScreen — one page to create a child's school schedule: who it's for, the school, then the classes, each added
 * with the same fields as the class editor (name, room, teacher, times, days, term). Nothing is saved until "Save schedule".
 * Replaces the old two-step wizard.
 */
import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayPage, OverlayHeading } from '@/components/OverlayPage';
import FamilyAvatar from '@/components/FamilyAvatar';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { useSchoolStore, type ClassPeriod } from '@/store/schoolStore';
import { ClassEditScreen } from './ClassEditScreen';
import { fmtTime12 } from './TimeField';

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };

export function NewScheduleScreen({ colors, isDark, presetMemberId, onClose, zIndex = 60 }: {
  colors: any; isDark: boolean;
  presetMemberId?: string;
  onClose: () => void;
  zIndex?: number;
}) {
  const insets = useSafeAreaInsets();
  const members = useFamilyStore(s => s.members);
  const kids: FamilyMember[] = useMemo(() => members.filter(m => m.role === 'kid' || m.role === 'teen'), [members]);
  const [kidId, setKidId] = useState<string>(presetMemberId ?? (kids.length === 1 ? kids[0].id : ''));
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [classes, setClasses] = useState<ClassPeriod[]>([]);
  const [editing, setEditing] = useState<ClassPeriod | 'new' | null>(null);
  const [error, setError] = useState('');

  const canvas = isDark ? colors.background : GEMINI.canvas;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const BLUE = GEMINI.blue;
  const field = { borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: cardBg } as const;
  const label = { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4, color: bodyC, marginBottom: 4, textTransform: 'uppercase' as const };

  const kid = kids.find(k => k.id === kidId);
  const terms = [...new Set(classes.map(c => c.term).filter((t): t is string => !!t))];

  const doSave = () => {
    if (!kid) return;
    const sorted = [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((c, i) => ({ ...c, period: i + 1 }));
    useSchoolStore.getState().addSchedule({
      memberId: kid.id, memberName: kid.name, semester: 'Fall' as any, year: new Date().getFullYear(),
      gradeYear: grade.trim() || undefined, school: school.trim() || undefined,
      lunchPeriod: 'B' as any, dayType: 'Regular' as any, periods: sorted,
      holidays: useSchoolStore.getState().schedules.find(s => s.memberId === kid.id)?.holidays ?? [],
    });
    onClose();
  };

  const save = () => {
    if (!kid) { setError('Choose who this schedule is for.'); return; }
    if (classes.length === 0) { setError('Add at least one class.'); return; }
    const existing = useSchoolStore.getState().schedules.find(s => s.memberId === kid.id);
    if (existing && existing.periods.length > 0) {
      Alert.alert(`Replace ${kid.name.split(' ')[0]}'s schedule?`, `They already have ${existing.periods.length} classes. This replaces them (holidays are kept).`, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: doSave },
      ]);
      return;
    }
    doSave();
  };

  return (
    <OverlayPage visible onDismiss={onClose} zIndex={zIndex} backgroundColor={canvas}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <OverlayHeading eyebrow="FAMILY CUBE · SCHOOL" title="Create schedule" subtitle="Who it's for, the school and the classes"
          accent="amber" topInset={insets.top} onTitlePress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, paddingBottom: insets.bottom + RHYTHM.section, gap: RHYTHM.item }}>
            <View>
              <Text style={label}>For</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {kids.map(k => {
                  const on = k.id === kidId;
                  return (
                    <TouchableOpacity key={k.id} onPress={() => { setKidId(k.id); setError(''); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, borderWidth: 1.5, paddingVertical: 6, paddingLeft: 6, paddingRight: 14,
                        borderColor: on ? BLUE : border, backgroundColor: on ? BLUE + '18' : cardBg }}>
                      <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl} size={28} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: on ? BLUE : titleC }}>{k.name.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
              <View style={[field, { flex: 2 }]}>
                <Text style={label}>School</Text>
                <TextInput value={school} onChangeText={setSchool} placeholder="School name" placeholderTextColor={bodyC + '88'} style={{ fontSize: 15, color: titleC, padding: 0 }} />
              </View>
              <View style={[field, { flex: 1 }]}>
                <Text style={label}>Grade</Text>
                <TextInput value={grade} onChangeText={setGrade} placeholder="e.g. 8th" placeholderTextColor={bodyC + '88'} style={{ fontSize: 15, color: titleC, padding: 0 }} />
              </View>
            </View>

            <Text style={[label, { marginTop: 6, marginBottom: 0 }]}>Classes · {classes.length}</Text>
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: cardBg, paddingHorizontal: RHYTHM.card, paddingVertical: 6 }}>
              {classes.length === 0 ? (
                <Text style={{ fontSize: 13, fontWeight: '600', color: bodyC, paddingVertical: 12 }}>No classes yet. Add the first one below.</Text>
              ) : [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((c, i) => (
                <TouchableOpacity key={c.id} onPress={() => setEditing(c)} style={{ paddingVertical: 12, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: titleC }} numberOfLines={1}>{c.subject}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC, marginTop: 1 }} numberOfLines={1}>
                      {fmtTime12(c.startTime)}–{fmtTime12(c.endTime)} · {(c.days ?? []).map(d => DAY_LABEL[d] ?? d).join(' ')}{c.term ? ` · ${c.term}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: BLUE }}>Edit</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setEditing('new')} style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: border, backgroundColor: cardBg }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>+ Add a class</Text>
            </TouchableOpacity>

            {error ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>{error}</Text> : null}
            <TouchableOpacity onPress={save} accessibilityRole="button" style={{ minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Save schedule</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
      {editing && (
        <ClassEditScreen
          colors={colors} isDark={isDark}
          memberId={kidId} memberName={kid?.name ?? 'Child'}
          period={editing === 'new' ? null : editing}
          terms={terms} defaultTerm={terms[0]}
          onClose={() => setEditing(null)} zIndex={zIndex + 1}
          draft={{
            onSave: (c) => setClasses(prev => prev.some(x => x.id === c.id) ? prev.map(x => x.id === c.id ? c : x) : [...prev, c]),
            onDelete: editing !== 'new' ? () => setClasses(prev => prev.filter(x => x.id !== (editing as ClassPeriod).id)) : undefined,
          }}
        />
      )}
    </OverlayPage>
  );
}
