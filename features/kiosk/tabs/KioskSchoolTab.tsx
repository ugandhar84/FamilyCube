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
 */
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import SchoolTabComp from '@/features/vault/tabs/SchoolTab';

export function KioskSchoolTab({ isKid, colors, isDark }: {
  isKid: boolean; colors: any; isDark: boolean;
}) {
  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={[s.iconBadge, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '30' }]}>
          <BookOpen size={22} color={colors.accent} />
        </View>
        <Text style={[s.title, { color: colors.textPrimary }]}>School</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
        <SchoolTabComp colors={colors} isDark={isDark} isKid={isKid} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  iconBadge: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  body: { paddingBottom: 40 },
});
