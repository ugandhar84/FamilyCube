/**
 * ReviewTimetableScreen — "timetable" step of the full-page flyer scanner
 * flow: extracted class schedule, editable period rows (expand/collapse
 * inline editor), term tabs when multiple terms are detected, kid
 * assignment, "Save Schedule" action. Full-page conversion of the former
 * AppBottomSheet step body — behavior unchanged.
 */
import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import FlyerScreenHeader from './FlyerScreenHeader';
import { ExtractedTimetable, ExtractedPeriod, fmtTime12 } from './types';

export default function ReviewTimetableScreen({
  colors, isDark,
  timetable,
  editablePeriods, setEditablePeriods,
  selectedTerm, setSelectedTerm,
  kids, allNames, timetableKidId, setTTKid,
  onConfirm, onRescan, onClose,
}: {
  colors: any; isDark: boolean;
  timetable: ExtractedTimetable;
  editablePeriods: ExtractedPeriod[];
  setEditablePeriods: React.Dispatch<React.SetStateAction<ExtractedPeriod[]>>;
  selectedTerm: string | null;
  setSelectedTerm: React.Dispatch<React.SetStateAction<string | null>>;
  kids: any[]; allNames: string[];
  timetableKidId: string;
  setTTKid: (id: string) => void;
  onConfirm: () => void;
  onRescan: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [expandedPeriodIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
      <FlyerScreenHeader
        colors={colors} isDark={isDark}
        backLabel="‹ Cancel"
        onBack={onClose}
        title="Class Schedule"
        subtitle="Review & assign to your kid(s)"
      />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>📚 Class Schedule</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
              {[timetable.school, timetable.grade].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{editablePeriods.length} periods</Text>
        </View>

        {/* Term tabs — only shown when multiple terms detected */}
        {(() => {
          const terms = [...new Set(editablePeriods.map(p => p.term).filter(Boolean) as string[])];
          if (terms.length < 2) return null;
          const ALL_TERMS = [null, ...terms]; // null = "All"
          return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
              {ALL_TERMS.map(t => {
                const sel = selectedTerm === t;
                return (
                  <Pressable key={t ?? 'all'} onPress={() => { setSelectedTerm(t); setExpandedIdx(null); }}
                    style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: sel ? BRAND.purple : (isDark ? '#1E293B' : '#F1F5F9'),
                      borderWidth: 1.5, borderColor: sel ? BRAND.purple : colors.border }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? '#fff' : colors.textSecondary }}>
                      {t ?? 'All terms'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          );
        })()}

        {/* Editable period rows */}
        <View style={{ gap: 6, marginBottom: 14 }}>
          {editablePeriods.map((p, i) => {
            if (selectedTerm && p.term && p.term !== selectedTerm) return null;
            const expanded = expandedPeriodIdx === i;
            const ALL_DAYS_LIST = ['mon','tue','wed','thu','fri','sat','sun'];
            const DAY_ABBR: Record<string,string> = { mon:'M',tue:'T',wed:'W',thu:'Th',fri:'F',sat:'Sa',sun:'Su' };
            const updateP = (patch: Partial<ExtractedPeriod>) =>
              setEditablePeriods(prev => prev.map((x, j) => j === i ? { ...x, ...patch } : x));

            return (
              <View key={i} style={{ borderRadius: 14, borderWidth: 1.5,
                borderColor: expanded ? BRAND.purple + '60' : (isDark ? colors.border : '#E8E8F0'),
                backgroundColor: expanded ? (isDark ? BRAND.purple + '10' : BRAND.purple + '06') : (isDark ? colors.card : '#fff'),
                overflow: 'hidden' }}>

                {/* Collapsed row — tap to expand */}
                <Pressable onPress={() => setExpandedIdx(expanded ? null : i)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                  <View style={{ alignItems: 'center', width: 52, backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                    borderRadius: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple, fontVariant: ['tabular-nums'] }}>
                      {p.startTime ? fmtTime12(p.startTime).replace(' AM','a').replace(' PM','p') : '—'}
                    </Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontVariant: ['tabular-nums'] }}>
                      {p.endTime ? fmtTime12(p.endTime).replace(' AM','a').replace(' PM','p') : ''}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: p.isLunch ? '#D97706' : colors.textPrimary }} numberOfLines={1}>
                      {p.subject || 'Untitled'}
                    </Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>
                      {[p.teacher, p.room].filter(Boolean).join(' · ') || 'Tap to edit'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: BRAND.teal }}>
                      {p.days.map(d => DAY_ABBR[d] ?? d[0].toUpperCase()).join('')}
                    </Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTertiary} />
                  </View>
                </Pressable>

                {/* Expanded inline editor */}
                {expanded && (
                  <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#EEF0F4' }}>
                    <TextInput value={p.subject} onChangeText={v => updateP({ subject: v })}
                      placeholder="Subject" placeholderTextColor={colors.textTertiary}
                      style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary,
                        borderBottomWidth: 1, borderBottomColor: BRAND.purple + '40', paddingVertical: 6 }} />

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput value={p.teacher ?? ''} onChangeText={v => updateP({ teacher: v || null })}
                        placeholder="Teacher" placeholderTextColor={colors.textTertiary}
                        style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 8,
                          borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }} />
                      <TextInput value={p.room ?? ''} onChangeText={v => updateP({ room: v || null })}
                        placeholder="Room" placeholderTextColor={colors.textTertiary}
                        style={{ width: 90, fontSize: TYPO.body, color: colors.textPrimary, padding: 8,
                          borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }} />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput value={p.startTime ?? ''} onChangeText={v => updateP({ startTime: v || null })}
                        placeholder="08:20" placeholderTextColor={colors.textTertiary} keyboardType="numbers-and-punctuation"
                        style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 8, textAlign: 'center',
                          borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }} />
                      <Text style={{ color: colors.textTertiary }}>→</Text>
                      <TextInput value={p.endTime ?? ''} onChangeText={v => updateP({ endTime: v || null })}
                        placeholder="09:05" placeholderTextColor={colors.textTertiary} keyboardType="numbers-and-punctuation"
                        style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 8, textAlign: 'center',
                          borderRadius: 10, borderWidth: 1.5, borderColor: colors.border }} />
                    </View>

                    <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                      {ALL_DAYS_LIST.map(d => {
                        const on = p.days.includes(d);
                        return (
                          <Pressable key={d} onPress={() => updateP({ days: on ? p.days.filter(x=>x!==d) : [...p.days,d] })}
                            style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: on ? BRAND.purple : (isDark ? '#1E293B' : '#F1F5F9'),
                              borderWidth: 1.5, borderColor: on ? BRAND.purple : colors.border }}>
                            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: on ? '#fff' : colors.textSecondary }}>
                              {DAY_ABBR[d]}
                            </Text>
                          </Pressable>
                        );
                      })}
                      <Pressable onPress={() => updateP({ isLunch: !p.isLunch })}
                        style={{ paddingHorizontal: 10, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: p.isLunch ? '#F59E0B' : (isDark ? '#1E293B' : '#F1F5F9'),
                          borderWidth: 1.5, borderColor: p.isLunch ? '#F59E0B' : colors.border }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: p.isLunch ? '#fff' : colors.textSecondary }}>🍱 Lunch</Text>
                      </Pressable>
                    </View>

                    <Pressable onPress={() => { setEditablePeriods(prev => prev.filter((_,j) => j !== i)); setExpandedIdx(null); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' }}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      <Text style={{ fontSize: TYPO.caption, color: '#EF4444', fontWeight: '700' }}>Remove period</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Add period */}
        <Pressable onPress={() => {
          const last = editablePeriods[editablePeriods.length - 1];
          const newP: ExtractedPeriod = { periodName: '', subject: '', teacher: null, room: null,
            startTime: last?.endTime ?? null, endTime: null, days: ['mon','tue','wed','thu','fri'] };
          setEditablePeriods(prev => [...prev, newP]);
          setExpandedIdx(editablePeriods.length);
        }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          borderRadius: 12, paddingVertical: 12, borderWidth: 1.5, borderStyle: 'dashed',
          borderColor: BRAND.purple + '50', marginBottom: 16 }}>
          <Ionicons name="add" size={18} color={BRAND.purple} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>Add period</Text>
        </Pressable>

        {/* Kid picker */}
        <Text style={f.sectionLabel}>Assign to</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {kids.map(k => {
            const sel = timetableKidId === k.id;
            return (
              <Pressable key={k.id} onPress={() => setTTKid(k.id)}
                style={[f.kidChip, { backgroundColor: sel ? BRAND.purple + '20' : colors.surface, borderColor: sel ? BRAND.purple : colors.border }]}>
                <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl} siblings={allNames} size={36} ringColor={sel ? BRAND.amber : colors.textTertiary} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? BRAND.purple : colors.textPrimary }}>{k.name.split(' ')[0]}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 16, flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={onRescan} style={[f.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="arrow-back" size={15} color={colors.textSecondary} />
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>Rescan</Text>
        </Pressable>
        <Pressable onPress={onConfirm}
          style={[f.submitBtn, { flex: 2, backgroundColor: timetableKidId ? BRAND.purple : colors.border }]}>
          <Ionicons name="book-outline" size={16} color={timetableKidId ? '#fff' : colors.textTertiary} />
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: timetableKidId ? '#fff' : colors.textTertiary }}>Save Schedule →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const f = StyleSheet.create({
  kidChip:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1.5, padding: 10, paddingRight: 16 },
  cancelBtn:   { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtn:   { flexDirection: 'row', gap: 6, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:{ fontSize: TYPO.label, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
});
