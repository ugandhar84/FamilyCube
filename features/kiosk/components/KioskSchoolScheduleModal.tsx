/**
 * KioskSchoolScheduleModal — kiosk-native shell around the real school
 * schedule create/edit form, replacing SchoolScheduleModal.tsx's own
 * phone-styled bottom-slide-up <Modal> [live-reported: "i see that there
 * is manual forms are missing in school it should be side form"] — every
 * other kiosk form in this codebase (KioskAddMedForm, KioskAddVaxForm,
 * KioskGroceryItemSheet…) is a KioskFormDrawer side panel, but School's
 * edit modal was left as the phone's own centered/bottom sheet, the one
 * form on kiosk that didn't match the rest.
 *
 * This is a pure shell swap, not a logic fork: PeriodEditor, TimeInput,
 * timeToMins, formatTime and ALL_DAYS are all imported from the real
 * SchoolScheduleModal.tsx (exported there for exactly this reuse) rather
 * than reimplemented, and the school-name/grade/scheduleType/periods state
 * plus addBlankPeriod/updatePeriod/deletePeriod/save logic below is a
 * verbatim port of that file's own real component — same useSchoolStore
 * addSchedule/updateSchedule calls, same validation, same KidSchedule
 * shape. Nothing about what School CRUD can do changes; only the
 * container it renders inside does.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { useSchoolStore, type ClassPeriod, type KidSchedule } from '@/store/schoolStore';
import {
  PeriodEditor, timeToMins, ALL_DAYS,
} from '@/features/hub/SchoolScheduleModal';
import { KioskFormDrawer, KioskFieldLabel, kioskInputStyle } from './KioskFormDrawer';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_TYPO } from '../kioskTheme';

interface Props {
  visible:    boolean;
  memberId:   string;
  memberName: string;
  isParent:   boolean;
  colors:     any;
  isDark:     boolean;
  onClose:    () => void;
}

export function KioskSchoolScheduleModal({ visible, memberId, memberName, isParent, colors, isDark, onClose }: Props) {
  const { k } = useKioskColors();
  const { schedules, addSchedule, updateSchedule } = useSchoolStore();
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
  const [periods, setPeriods] = useState<ClassPeriod[]>(existing?.periods ?? []);

  // Re-seed local state whenever the drawer opens for (possibly) a
  // different member/schedule — KioskFormDrawer keeps the component
  // mounted between opens (see other kiosk forms' own visible-guarded
  // reset effects), so this can't rely on useState's initial value alone.
  // Same real reset() SchoolScheduleModal.tsx itself uses.
  useEffect(() => {
    if (!visible) return;
    const s = useSchoolStore.getState().schedules.find(x => x.memberId === memberId);
    setSchoolName(s?.school ?? '');
    setGradeLabel(s?.gradeYear ?? '');
    setPeriods(s?.periods ?? []);
  }, [visible, memberId]);

  const addBlankPeriod = useCallback(() => {
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
  }, [periods]);

  const updatePeriod = (id: string, p: ClassPeriod) =>
    setPeriods(prev => prev.map(x => x.id === id ? p : x));

  const deletePeriod = (id: string) =>
    setPeriods(prev => prev.filter(x => x.id !== id));

  const sorted = [...periods].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!schoolName.trim() && periods.length === 0) {
      setError('Add a school name or at least one period.');
      return;
    }
    setError(null);
    const schedule: KidSchedule = {
      memberId, memberName,
      semester:    'Fall',
      year:        new Date().getFullYear(),
      gradeYear:   gradeLabel.trim() || undefined,
      school:      schoolName.trim() || undefined,
      lunchPeriod: 'B',
      dayType:     'Regular',
      periods:     sorted,
    };
    if (existing) updateSchedule(memberId, schedule);
    else           addSchedule(schedule);
    onClose();
  };

  const input = kioskInputStyle(k);

  return (
    <KioskFormDrawer
      visible={visible} title={`${memberName}'s Schedule`} subtitle="Same real form as the phone app"
      accent={BRAND.purple} Icon={BookOpen} k={k} onClose={onClose}
      variant="drawer"
      submitLabel={existing ? 'Save Changes' : 'Save Schedule'} onSubmit={save}
      canSubmit submitting={false}
      error={error}
    >
      {/* ── School info ── */}
      <KioskFieldLabel k={k}>SCHOOL INFO</KioskFieldLabel>
      <TextInput
        value={schoolName} onChangeText={setSchoolName}
        placeholder="School name" placeholderTextColor={k.textFaint}
        style={[input, { marginBottom: KIOSK_SPACE.xs }]}
      />
      <TextInput
        value={gradeLabel} onChangeText={setGradeLabel}
        placeholder="Grade / Year / Class (e.g. Grade 9, Year 10)" placeholderTextColor={k.textFaint}
        style={[input, { marginBottom: KIOSK_SPACE.md }]}
      />

      {/* ── Schedule type ── */}
      <KioskFieldLabel k={k}>SCHEDULE TYPE</KioskFieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.xs }}>
        {([
          { key: 'regular',   label: 'Regular',        desc: 'Same subjects every day' },
          { key: 'block',     label: 'A/B Block',      desc: 'Alternating day schedule' },
          { key: 'quarterly', label: '4 Terms / Qtrs', desc: 'Different subjects each quarter' },
          { key: 'semester',  label: '2 Semesters',    desc: 'Fall + Spring schedule' },
        ] as const).map(opt => {
          const sel = scheduleType === opt.key;
          return (
            <Pressable key={opt.key} onPress={() => setScheduleType(opt.key)}
              style={{ flex: 1, minWidth: '45%', paddingHorizontal: 10, paddingVertical: 10,
                borderRadius: 14, borderWidth: 1.5,
                borderColor: sel ? BRAND.purple : k.cardBorder,
                backgroundColor: sel ? BRAND.purple + '12' : 'transparent' }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? BRAND.purple : k.text }}>
                {opt.label}
              </Text>
              <Text style={{ fontSize: TYPO.micro, color: sel ? BRAND.purple + 'AA' : k.textFaint, marginTop: 2 }}>
                {opt.desc}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {scheduleType !== 'regular' && (
        <Text style={{ fontSize: TYPO.micro, color: k.textFaint, marginBottom: KIOSK_SPACE.md }}>
          {scheduleType === 'block'     ? 'Add periods and set days to "A day" or "B day" (Mon/Wed/Fri and Tue/Thu).' : ''}
          {scheduleType === 'quarterly' ? 'Add periods per quarter and set the Term field (Q1, Q2, Q3, Q4).' : ''}
          {scheduleType === 'semester'  ? 'Add periods per semester and set the Term field (Fall, Spring).' : ''}
        </Text>
      )}

      {/* ── Periods ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <KioskFieldLabel k={k}>TIMETABLE</KioskFieldLabel>
        <Text style={{ fontSize: TYPO.micro, color: k.textFaint }}>Times as HH:MM (24h)</Text>
      </View>

      <View style={{ gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.sm }}>
        {sorted.map(p => (
          <PeriodEditor key={p.id} period={p} colors={colors} isDark={isDark}
            onChange={updated => updatePeriod(p.id, updated)}
            onDelete={() => deletePeriod(p.id)} />
        ))}
      </View>

      <TouchableOpacity onPress={addBlankPeriod}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          borderRadius: 14, paddingVertical: 13, borderWidth: 1.5, borderStyle: 'dashed',
          borderColor: BRAND.purple + '60', backgroundColor: BRAND.purple + '08' }}>
        <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '700', color: BRAND.purple }}>+ Add Period</Text>
      </TouchableOpacity>
    </KioskFormDrawer>
  );
}
