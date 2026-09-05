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
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
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
              <Pressable key={seg.key} onPress={() => setTab(seg.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={seg.label}
                style={[s.segment, {
                backgroundColor: active ? seg.tint + '18' : colors.surface,
                borderColor: active ? seg.tint + '60' : colors.border,
              }]}>
                <seg.Icon size={20} color={active ? seg.tint : colors.textSecondary} />
                <Text numberOfLines={1} style={{ fontSize: KIOSK_TYPO.body, fontWeight: '800', color: active ? seg.tint : colors.textSecondary }}>
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
  root: { flex: 1, padding: KIOSK_SPACE.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.lg },
  iconBadge: { width: 46, height: 46, borderRadius: KIOSK_RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: KIOSK_TYPO.title, fontWeight: '800', letterSpacing: -0.6 },
  segmentRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.lg, flexWrap: 'wrap' },
  segment: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, minHeight: KIOSK_HIT.control,
    paddingHorizontal: KIOSK_SPACE.md, flex: 1, minWidth: 180,
  },
  body: { paddingBottom: KIOSK_SPACE.xxl },
});
