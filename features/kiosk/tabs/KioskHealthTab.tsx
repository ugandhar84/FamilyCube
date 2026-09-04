/**
 * KioskHealthTab — kiosk-sized wrapper around the same HealthTab/RecordsTab
 * components the phone's HealthRecordsScreen.tsx switches between
 * (Medications / Immunizations / Records). Live-requested: "add all the
 * pills for the pages which is on the mobile hub screen [to] the kiosk
 * side bar" — Health is one of the Hub's AppsQuickAccessPills entries with
 * no kiosk-native equivalent until now.
 *
 * Mirrors the phone screen's one 3-way segmented switch (not two stacked
 * switches — that was live-reported as confusing there and the fix
 * shouldn't regress here), just re-styled with kiosk's bigger touch
 * targets. Same reuse pattern as every other kiosk tab: the inner
 * components already read activeMemberId/role themselves.
 */
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Heart, Pill, Syringe, FolderOpen } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useUIStore } from '@/store/uiStore';
import HealthTabComp from '@/features/vault/tabs/HealthTab';
import RecordsTabComp from '@/features/vault/tabs/RecordsTab';

type Segment = 'meds' | 'vax' | 'records';

export function KioskHealthTab({ isKid, colors, isDark }: {
  isKid: boolean; colors: any; isDark: boolean;
}) {
  const [tab, setTab] = useState<Segment>('meds');

  const SEGMENTS: { key: Segment; label: string; Icon: any; tint: string }[] = isKid
    ? [{ key: 'meds', label: 'Medications', Icon: Pill, tint: colors.danger }]
    : [
        { key: 'meds',    label: 'Medications',   Icon: Pill,       tint: colors.danger },
        { key: 'vax',     label: 'Immunizations', Icon: Syringe,    tint: colors.teal },
        { key: 'records', label: 'Records',       Icon: FolderOpen, tint: colors.teal },
      ];

  const accent = SEGMENTS.find(s => s.key === tab)?.tint ?? colors.danger;

  // HealthTabComp only mounts for meds/vax and owns the FAB-segment flag
  // for those two on the phone (no FAB in kiosk to target, but this store
  // write is harmless/shared) — when Records is selected here, set it
  // directly, mirroring HealthRecordsScreen.tsx's own same effect.
  useEffect(() => {
    if (tab === 'records') useUIStore.getState().setHealthRecordsActiveSegment('records');
  }, [tab]);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={[s.iconBadge, { backgroundColor: accent + '18', borderColor: accent + '30' }]}>
          <Heart size={22} color={accent} />
        </View>
        <Text style={[s.title, { color: colors.textPrimary }]}>Health & Records</Text>
      </View>

      {SEGMENTS.length > 1 && (
        <View style={s.segmentRow}>
          {SEGMENTS.map(seg => {
            const active = tab === seg.key;
            return (
              <Pressable key={seg.key} onPress={() => setTab(seg.key)} style={[s.segment, {
                backgroundColor: active ? seg.tint + '18' : colors.surface,
                borderColor: active ? seg.tint + '60' : colors.border,
              }]}>
                <seg.Icon size={18} color={active ? seg.tint : colors.textSecondary} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: active ? seg.tint : colors.textSecondary }}>
                  {seg.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
        {tab === 'records'
          ? <RecordsTabComp colors={colors} isDark={isDark} />
          : <HealthTabComp colors={colors} isDark={isDark} kidView={isKid}
              healthTab={tab === 'vax' ? 'vax' : 'meds'}
              setHealthTab={t => setTab(t)} />}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  iconBadge: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  segmentRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  segment: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 18, flex: 1,
  },
  body: { paddingBottom: 40 },
});
