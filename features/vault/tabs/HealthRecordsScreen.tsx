/**
 * HealthRecordsScreen — combined Health + Records destination (one pill,
 * one route) with a single 3-way segmented switch (Medications /
 * Immunizations / Records), replacing what was originally two separate
 * pills, and then — after a stacked-switch regression (this screen's own
 * Health/Records switch ON TOP of HealthTab.tsx's own separate inner
 * Medications/Immunizations switch, live-reported as confusing/"worse
 * design") — merged into the one switch below. HealthTab.tsx's inner
 * switch was removed; `healthTab` is now controlled from here.
 */
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pill, Syringe, FolderOpen } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import HealthTabComp from './HealthTab';
import RecordsTabComp from './RecordsTab';

type Segment = 'meds' | 'vax' | 'records';

export default function HealthRecordsScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const kidView = activeMember?.role === 'kid';
  const [tab, setTab] = useState<Segment>('meds');

  // No fullBleedScreenActive hide-FAB trick here — the shared FAB itself
  // morphs to a "+" on this route (app/(tabs)/_layout.tsx's
  // onFamilyHealthTab), same pattern as Tasks/Memories. That FAB also
  // tracks healthRecordsActiveSegment (set by HealthTabComp for meds/vax,
  // and here directly for records) to tint/target itself correctly — see
  // HealthTab.tsx's own effect for the meds/vax half of that.
  const SEGMENTS: { key: Segment; label: string; Icon: any; tint: string }[] = kidView
    ? [{ key: 'meds', label: 'Medications', Icon: Pill, tint: colors.danger }]
    : [
        { key: 'meds',    label: 'Medications',   Icon: Pill,       tint: colors.danger },
        { key: 'vax',     label: 'Immunizations', Icon: Syringe,    tint: colors.teal },
        { key: 'records', label: 'Records',       Icon: FolderOpen, tint: colors.teal },
      ];

  const accent = SEGMENTS.find(s => s.key === tab)?.tint ?? colors.danger;

  // HealthTabComp only mounts for meds/vax and owns the FAB-segment flag
  // for those two (see its own effect); when Records is selected here,
  // HealthTabComp isn't mounted at all, so this screen sets the flag
  // directly instead.
  useEffect(() => {
    if (tab === 'records') useUIStore.getState().setHealthRecordsActiveSegment('records');
  }, [tab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={hideHeader ? [] : ['top']}>
      {!hideHeader && (
        <View style={{ flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ marginRight: 12 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ width: 34, height: 34, borderRadius: 10,
            backgroundColor: accent + '18', borderWidth: 1, borderColor: accent + '30',
            alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <Ionicons name="heart" size={17} color={accent} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, flex: 1 }}>
            Health & Records
          </Text>
        </View>
      )}

      {/* Single segmented switch — one Medications/Immunizations/Records
          row, not two stacked switches. Wraps to 2 lines gracefully via
          flexWrap if the labels don't fit 3-across on a narrow phone,
          rather than a horizontal scroll that could hide "Records". */}
      {SEGMENTS.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
          {SEGMENTS.map(seg => {
            const active = tab === seg.key;
            return (
              <TouchableOpacity key={seg.key} onPress={() => setTab(seg.key)} activeOpacity={0.85}
                style={{
                  flexGrow: 1, flexBasis: '30%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 14, paddingVertical: 10, overflow: 'hidden',
                  borderWidth: 1.5, borderColor: active ? seg.tint + (isDark ? '70' : '55') : colors.border,
                }}>
                {active && (
                  <>
                    <LinearGradient
                      colors={[seg.tint + '30', seg.tint + '10']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                      pointerEvents="none"
                    />
                    {Platform.OS === 'ios' ? (
                      <BlurView intensity={14} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
                    ) : (
                      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
                    )}
                  </>
                )}
                <seg.Icon size={14} color={active ? seg.tint : colors.textSecondary} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: active ? seg.tint : colors.textSecondary }}>
                  {seg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 80, paddingTop: 14 }}>
        {tab === 'records'
          ? <RecordsTabComp colors={colors} isDark={isDark} />
          : <HealthTabComp colors={colors} isDark={isDark} kidView={kidView}
              healthTab={tab === 'vax' ? 'vax' : 'meds'}
              setHealthTab={t => setTab(t)} />}
      </ScrollView>
    </SafeAreaView>
  );
}
