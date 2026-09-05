/**
 * KioskSchoolTab — kiosk-sized wrapper around the same SchoolTab component
 * the phone's SchoolScreen.tsx uses (class schedules, homework references).
 * Live-requested: "add all the pills for the pages which is on the mobile
 * hub screen [to] the kiosk side bar" — School is one of the Hub's
 * AppsQuickAccessPills entries with no kiosk-native equivalent until now.
 *
 * Same reuse pattern as every other kiosk tab (KioskMemoriesTab, etc.):
 * the inner component already reads activeMemberId/role itself, so this
 * wrapper only owns the kiosk-styled header and a bigger touch-target
 * surface — no logic duplicated, no new permission rules invented.
 *
 * ── Hub-OS migration, and the one boundary it can't cross ───────────────
 * The wrapper chrome (title block, the card the content sits in) is now
 * built from the kiosk palette + KioskOS primitives like every other
 * migrated tab. The EMBEDDED SchoolTab is a shared phone component that
 * takes the app's own `colors` object and styles itself with it; restyling
 * its internals would mean forking it, which is exactly the duplication
 * this wrapper exists to avoid. So `colors` is still passed through to it.
 *
 * That is consistent, not mismatched: both palettes resolve off the SAME
 * useTheme() isDark, and kiosk's grounds are drawn from the same Kinfolk
 * hue family — so the embedded content reads as a panel of app content set
 * into a kiosk frame, in both light and dark. Making SchoolTab itself
 * kiosk-aware is a separate, larger job than a styling pass.
 */
import { View, ScrollView, StyleSheet } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import SchoolTabComp from '@/features/vault/tabs/SchoolTab';
import { KIOSK_SPACE } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, TabTitle } from '../components/KioskOS';
import { useKioskActivity } from '../KioskActivityContext';

export function KioskSchoolTab({ isKid, colors, isDark }: {
  isKid: boolean; colors: any; isDark: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScrollBeginDrag={registerActivity}
      >
        <TabTitle
          title="School"
          subtitle="Class schedules and what's due"
          k={k}
        />
        <WidgetCard k={k} isDark={kioskDark}>
          <WidgetHeader
            Icon={BookOpen} eyebrow="This week" title="Classes & homework"
            accent={k.purple} k={k} isDark={kioskDark}
          />
          <SchoolTabComp colors={colors} isDark={isDark} isKid={isKid} />
        </WidgetCard>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
});
