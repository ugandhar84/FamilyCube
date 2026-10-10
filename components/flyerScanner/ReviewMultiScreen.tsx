/**
 * ReviewMultiScreen — "multi" step of the full-page flyer scanner flow:
 * a multi-event school calendar extraction, with per-event select/
 * deselect, select-all toggle, kid assignment, "Import N Events" action.
 * Full-page conversion of the former AppBottomSheet step body — behavior
 * unchanged.
 */
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import FlyerScreenHeader from './FlyerScreenHeader';
import { ExtractedCalendar, CAT_EMOJI, fmtTime12 } from './types';

export default function ReviewMultiScreen({
  colors, isDark,
  multiCal,
  selectedEvents, setSelEvts,
  kids, allNames, selectedKids, setSelKids,
  onConfirm, onRescan, onClose,
}: {
  colors: any; isDark: boolean;
  multiCal: ExtractedCalendar;
  selectedEvents: Set<number>;
  setSelEvts: React.Dispatch<React.SetStateAction<Set<number>>>;
  kids: any[]; allNames: string[];
  selectedKids: string[];
  setSelKids: React.Dispatch<React.SetStateAction<string[]>>;
  onConfirm: () => void;
  onRescan: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
      <FlyerScreenHeader
        colors={colors} isDark={isDark}
        backLabel="‹ Cancel"
        onBack={onClose}
        title="School Calendar"
        subtitle="Review & assign to your kid(s)"
      />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 }}>
        <View style={{ backgroundColor: BRAND.teal + '12', borderRadius: 16, padding: 14, marginBottom: 16, gap: 4 }}>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>📅 School Calendar</Text>
          {multiCal.school && <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{multiCal.school}</Text>}
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4 }}>
            {multiCal.events.length} events found · {selectedEvents.size} selected
          </Text>
        </View>

        {/* Toggle all */}
        <Pressable onPress={() => setSelEvts(selectedEvents.size === multiCal.events.length ? new Set() : new Set(multiCal.events.map((_, i) => i)))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>
            {selectedEvents.size === multiCal.events.length ? 'Deselect all' : 'Select all'}
          </Text>
        </Pressable>

        {/* Event list */}
        <View style={{ gap: 6, marginBottom: 16 }}>
          {multiCal.events.map((ev, i) => {
            const sel = selectedEvents.has(i);
            const isHoliday = ev.category === 'Holiday';
            return (
              <Pressable key={i} onPress={() => setSelEvts(prev => { const s = new Set(prev); sel ? s.delete(i) : s.add(i); return s; })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: sel ? (isHoliday ? '#FEF3C7' : BRAND.teal + '10') : (isDark ? colors.card : '#F8FAFF'),
                  borderRadius: 12, padding: 10, borderWidth: 1.5,
                  borderColor: sel ? (isHoliday ? '#F59E0B' : BRAND.teal) : (isDark ? colors.border : '#E8E8F0') }}>
                <Text style={{ fontSize: 16 }}>{CAT_EMOJI[ev.category] ?? '📋'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{ev.title}</Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                    {ev.date ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                    {ev.time ? ` · ${fmtTime12(ev.time)}` : ''}
                  </Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                  borderColor: sel ? (isHoliday ? '#F59E0B' : BRAND.teal) : colors.border,
                  backgroundColor: sel ? (isHoliday ? '#F59E0B' : BRAND.teal) : 'transparent',
                  alignItems: 'center', justifyContent: 'center' }}>
                  {sel && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Kid picker */}
        <Text style={f.sectionLabel}>Add to whose schedule?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {kids.map(k => {
            const sel = selectedKids.includes(k.id);
            return (
              <Pressable key={k.id} onPress={() => setSelKids(prev => sel ? prev.filter(id => id !== k.id) : [...prev, k.id])}
                style={[f.kidChip, { backgroundColor: sel ? BRAND.teal + '20' : colors.surface, borderColor: sel ? BRAND.teal : colors.border }]}>
                <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl} siblings={allNames} size={36} ringColor={sel ? BRAND.teal : colors.textTertiary} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: sel ? BRAND.teal : colors.textPrimary }}>{k.name.split(' ')[0]}</Text>
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
          style={[f.submitBtn, { flex: 2, backgroundColor: selectedKids.length && selectedEvents.size ? BRAND.teal : colors.border }]}>
          <Ionicons name="calendar-outline" size={16} color={selectedKids.length && selectedEvents.size ? '#fff' : colors.textTertiary} />
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: selectedKids.length && selectedEvents.size ? '#fff' : colors.textTertiary }}>
            Import {selectedEvents.size} Event{selectedEvents.size !== 1 ? 's' : ''} →
          </Text>
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
