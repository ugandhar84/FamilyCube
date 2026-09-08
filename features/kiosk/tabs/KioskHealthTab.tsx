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
 *
 * ── Hub-OS migration ────────────────────────────────────────────────────
 * Title block, segmented switch and the card the content sits in are now
 * built from the kiosk palette + KioskOS primitives. The kid gate is
 * unchanged: a kid still sees Medications only, and never Immunizations or
 * Records — that is a role-permission rule from the audit pass, not
 * styling, so it survives verbatim below.
 *
 * The embedded HealthTab/RecordsTab are shared phone components styled from
 * the app's own `colors`; see KioskSchoolTab's header for why that prop is
 * still threaded through rather than forked. Both palettes resolve off the
 * same useTheme() isDark, so the two never disagree about light vs dark.
 */
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Heart, Pill, Syringe, FolderOpen } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, TabTitle } from '../components/KioskOS';
import { useKioskActivity } from '../KioskActivityContext';
import { useUIStore } from '@/store/uiStore';
import HealthTabComp from '@/features/vault/tabs/HealthTab';
import RecordsTabComp from '@/features/vault/tabs/RecordsTab';

type Segment = 'meds' | 'vax' | 'records';

export function KioskHealthTab({ isKid, colors, isDark }: {
  isKid: boolean; colors: any; isDark: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const [tab, setTab] = useState<Segment>('meds');

  // ROLE GATE (audit pass) — a kid sees Medications only. Unchanged by the
  // visual migration.
  const SEGMENTS: { key: Segment; label: string; Icon: any; tint: string }[] = isKid
    ? [{ key: 'meds', label: 'Medications', Icon: Pill, tint: k.danger }]
    : [
        { key: 'meds',    label: 'Medications',   Icon: Pill,       tint: k.danger },
        { key: 'vax',     label: 'Immunizations', Icon: Syringe,    tint: k.sage },
        { key: 'records', label: 'Records',       Icon: FolderOpen, tint: k.blue },
      ];

  const current = SEGMENTS.find(seg => seg.key === tab) ?? SEGMENTS[0];
  const accent = current.tint;

  // HealthTabComp only mounts for meds/vax and owns the FAB-segment flag
  // for those two on the phone (no FAB in kiosk to target, but this store
  // write is harmless/shared) — when Records is selected here, set it
  // directly, mirroring HealthRecordsScreen.tsx's own same effect.
  useEffect(() => {
    if (tab === 'records') useUIStore.getState().setHealthRecordsActiveSegment('records');
  }, [tab]);

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScrollBeginDrag={registerActivity}
      >
        <TabTitle
          title="Health & Records"
          subtitle="Medications, immunizations and the household's documents"
          k={k}
        />

        {SEGMENTS.length > 1 && (
          <View style={s.segmentRow} accessibilityRole="tablist">
            {SEGMENTS.map(seg => {
              const isActive = tab === seg.key;
              return (
                <Pressable
                  key={seg.key}
                  onPress={() => { registerActivity(); setTab(seg.key); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={seg.label}
                  style={({ pressed }) => [
                    s.segment,
                    {
                      backgroundColor: isActive
                        ? seg.tint + (kioskDark ? '24' : '1A')
                        : pressed ? k.cardHover : k.card,
                      borderColor: isActive ? seg.tint + (kioskDark ? '4D' : '3D') : k.cardBorder,
                    },
                  ]}
                >
                  <seg.Icon size={15} color={isActive ? seg.tint : k.textMuted} />
                  <Text
                    numberOfLines={1}
                    style={[s.segmentLabel, { color: isActive ? seg.tint : k.textMuted }]}
                  >
                    {seg.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <WidgetCard k={k} isDark={kioskDark}>
          <WidgetHeader
            Icon={Heart} eyebrow="Household" title={current.label}
            accent={accent} k={k} isDark={kioskDark}
          />
          {tab === 'records'
            ? <RecordsTabComp colors={colors} isDark={isDark} />
            : <HealthTabComp colors={colors} isDark={isDark} kidView={isKid}
                healthTab={tab === 'vax' ? 'vax' : 'meds'}
                setHealthTab={t => setTab(t)} />}
        </WidgetCard>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  // Same compact sizing as Chores' filter pills / Schedule's mode switch
  // [live-reported: "follow the health also same design pattern like we
  // did for chores and the schedule" → "AIso same like chores"] — was a
  // much heavier control (KIOSK_HIT.control height, KIOSK_RADIUS.md,
  // body-size text).
  segmentRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md, flexWrap: 'wrap' },
  segment: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5, minHeight: KIOSK_HIT.min - 10,
    paddingHorizontal: KIOSK_SPACE.sm, flex: 1, minWidth: 140,
  },
  segmentLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
});
