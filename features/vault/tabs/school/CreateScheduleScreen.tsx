/**
 * CreateScheduleScreen — School wizard Step 1 ("Create a schedule").
 * Parent-only. Collects schedule metadata + which weekdays the schedule
 * runs, then hands a draft object up to SchoolHomeScreen, which opens
 * Screen 4 (BuildPeriodsScreen) to add periods per chosen day. Nothing is
 * written to schoolStore here — addSchedule only happens once periods
 * exist, from BuildPeriodsScreen's "Finish & save schedule" (mirrors
 * SchoolScheduleModal.tsx's own save() sequencing).
 *
 * Same FullPageOverlay + literal-hex Figma shell as the homeowner
 * reference screens (HomeownerNotesTab.tsx et al) — CANVAS/TITLE_CLR/
 * BODY_CLR/BLUE/BORDER/CARD_BG use the exact hex this redesign's brief
 * specifies, with useTheme() colors.* as the dark-mode fallback.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FullPageOverlay from '@/components/FullPageOverlay';
import { ScanDateField } from '../health/ScanDateField';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';

// "Gemini rhythm" tokens (CLAUDE.md rule 6 exception, 2026-10-10) — see
// SchoolHomeScreen.tsx's own comment for the full rationale.
const CANVAS = '#ECE6DE';
const TITLE_CLR = '#0D1210';
const BODY_CLR = '#3D4D47';
const BODY_CLR_LIGHT = '#4E5C56';
const BLUE = '#3B5FE4';
const LINK_BLUE = '#23352B';
const BORDER = '#DDD6CC';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F0EDE6';
const CARD_SHADOW = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } as const;

export const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type SchoolDay = typeof ALL_DAYS[number];
const DAY_LABEL: Record<SchoolDay, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export interface ScheduleDraft {
  scheduleName: string;
  school: string;
  memberId: string;
  memberName: string;
  yearClass: string;
  weekPattern: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  timeZone: string;
  days: SchoolDay[];
}

function FieldRow({ label, value, onChangeText, placeholder, colors, isDark }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; colors: any; isDark: boolean;
}) {
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
      paddingHorizontal: 16, paddingVertical: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: bodyC, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor="#C0C7D4"
        style={{ fontSize: 15, color: titleC, padding: 0 }}
      />
    </View>
  );
}

function DropRow({ label, value, options, onSelect, isDark, colors }: {
  label: string; value: string; options: { key: string; label: string }[];
  onSelect: (k: string) => void; isDark: boolean; colors: any;
}) {
  const [open, setOpen] = useState(false);
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: bodyC, marginBottom: 4 }}>{label}</Text>
        <Text style={{ fontSize: 15, color: titleC }}>{options.find(o => o.key === value)?.label ?? 'Choose…'} ▾</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: border }}>
          {options.map(opt => (
            <TouchableOpacity key={opt.key} onPress={() => { onSelect(opt.key); setOpen(false); }}
              style={{ paddingHorizontal: 16, paddingVertical: 10,
                backgroundColor: opt.key === value ? (isDark ? colors.surface : SURFACE) : cardBg }}>
              <Text style={{ fontSize: 14, color: opt.key === value ? BLUE : titleC,
                fontWeight: opt.key === value ? '600' : '400' }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const WEEK_PATTERNS = ['Every week', 'Week A / Week B', 'Term-time only'];

export function CreateScheduleScreen({ visible, colors, isDark, parentName, onClose, onContinue, zIndex = 60 }: {
  visible: boolean; colors: any; isDark: boolean; parentName: string;
  onClose: () => void;
  onContinue: (draft: ScheduleDraft) => void;
  zIndex?: number;
}) {
  const { members } = useFamilyStore();
  const kids: FamilyMember[] = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const insets = useSafeAreaInsets();

  const [scheduleName, setScheduleName] = useState('');
  const [school, setSchool] = useState('');
  const [memberId, setMemberId] = useState<string>(kids[0]?.id ?? '');
  const [yearClass, setYearClass] = useState('');
  const [weekPattern, setWeekPattern] = useState(WEEK_PATTERNS[0]);
  const [effectiveFrom, setEffectiveFrom] = useState<string | null>(null);
  const [effectiveUntil, setEffectiveUntil] = useState<string | null>(null);
  const [days, setDays] = useState<SchoolDay[]>(['mon', 'tue', 'wed', 'thu', 'fri']);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  const reset = () => {
    setScheduleName(''); setSchool(''); setMemberId(kids[0]?.id ?? ''); setYearClass('');
    setWeekPattern(WEEK_PATTERNS[0]); setEffectiveFrom(null); setEffectiveUntil(null);
    setDays(['mon', 'tue', 'wed', 'thu', 'fri']);
  };
  const close = () => { reset(); onClose(); };

  const toggleDay = (d: SchoolDay) =>
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const selectedMember = kids.find(k => k.id === memberId);
  const canContinue = !!selectedMember && days.length > 0;

  const handleContinue = () => {
    if (!canContinue || !selectedMember) return;
    onContinue({
      scheduleName: scheduleName.trim() || `${selectedMember.name.split(' ')[0]}'s schedule`,
      school: school.trim(),
      memberId: selectedMember.id,
      memberName: selectedMember.name,
      yearClass: yearClass.trim(),
      weekPattern,
      effectiveFrom,
      effectiveUntil,
      timeZone,
      days,
    });
    reset();
  };

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={zIndex}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE }}>‹ School</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
            Create a schedule
          </Text>
          <View style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: 8, backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
            <Text style={{ fontSize: 12, color: isDark ? BLUE : LINK_BLUE, fontWeight: '600' }}>
              New schedule · parent draft
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48, gap: 12 }}>

            {kids.length === 0 ? (
              <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontSize: 14, color: bodyC }}>No kids or teens in this family yet.</Text>
              </View>
            ) : (
              <>
                <FieldRow label="Schedule name" value={scheduleName} onChangeText={setScheduleName}
                  placeholder="e.g. Fall term timetable" colors={colors} isDark={isDark} />

                <FieldRow label="School" value={school} onChangeText={setSchool}
                  placeholder="e.g. Eastfield Primary" colors={colors} isDark={isDark} />

                <DropRow label="Family member" value={memberId}
                  options={kids.map(k => ({ key: k.id, label: k.name }))}
                  onSelect={setMemberId} isDark={isDark} colors={colors} />

                <FieldRow label="Year / class" value={yearClass} onChangeText={setYearClass}
                  placeholder="e.g. Year 5" colors={colors} isDark={isDark} />

                <DropRow label="Week pattern" value={weekPattern}
                  options={WEEK_PATTERNS.map(p => ({ key: p, label: p }))}
                  onSelect={setWeekPattern} isDark={isDark} colors={colors} />

                <ScanDateField label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom}
                  colors={colors} isDark={isDark} accent={BLUE} />

                <ScanDateField label="Effective until · optional" value={effectiveUntil} onChange={setEffectiveUntil}
                  colors={colors} isDark={isDark} accent={BLUE} />

                <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                  paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: bodyC, marginBottom: 4 }}>Time zone</Text>
                  <Text style={{ fontSize: 15, color: titleC }}>{timeZone}</Text>
                </View>

                {/* Teaching days — individual Mon-Sun toggle pills */}
                <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
                  paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: bodyC }}>Choose teaching days</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {ALL_DAYS.map(d => {
                      const on = days.includes(d);
                      return (
                        <TouchableOpacity key={d} onPress={() => toggleDay(d)}
                          style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: on ? BLUE : border,
                            backgroundColor: on ? (isDark ? colors.surface : '#EEF3FB') : cardBg }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: on ? BLUE : bodyC }}>
                            {DAY_LABEL[d]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Info card */}
                <View style={{ borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                  backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
                  <Text style={{ fontSize: 13, color: isDark ? BLUE : LINK_BLUE, fontWeight: '700', marginBottom: 4 }}>
                    Next: add periods
                  </Text>
                  <Text style={{ fontSize: 13, color: bodyC, lineHeight: 18 }}>
                    After this, you'll build out each teaching day's class periods — times, subjects and
                    rooms — one day at a time.
                  </Text>
                </View>

                {/* Continue */}
                <TouchableOpacity onPress={handleContinue} disabled={!canContinue}
                  style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: canContinue ? BLUE : (isDark ? colors.surface : SURFACE) }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: canContinue ? '#FFFFFF' : bodyC }}>
                    Continue to period editor →
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={close} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: bodyC }}>Cancel schedule</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </FullPageOverlay>
  );
}
