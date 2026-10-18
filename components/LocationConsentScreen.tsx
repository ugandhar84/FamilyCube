/**
 * LocationConsentScreen — the full-page disclosure shown before Family Cube ever asks the system for location access.
 * Plain language: what is collected, when, who sees it, what it is (and is not) used for, how to stop. Opt-in only.
 */
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin } from 'lucide-react-native';
import { OverlayPage, OverlayHeading } from '@/components/OverlayPage';
import { useTheme } from '@/lib/ThemeContext';
import { RHYTHM } from '@/constants/theme';

const POINTS: { title: string; body: string }[] = [
  { title: 'What is shared', body: 'Your precise location, how fast you are moving (so the map can show walking or driving), and your phone’s battery level. If you are a driver, trip summaries such as distance and top speed are saved for your parents.' },
  { title: 'When', body: 'Only while sharing is on. It keeps working in the background, even when the app is closed, so your family can see you are safe. iPhone shows a blue indicator whenever the app uses your location in the background.' },
  { title: 'Who can see it', body: 'Only the members of your own family group. It is never shown to anyone else.' },
  { title: 'What it is not used for', body: 'Never for advertising, never sold, and never shared with other companies. It is used only to power Find Family, safe-place alerts and driving alerts.' },
  { title: 'You stay in control', body: 'Sharing is off until you turn it on, and you can turn it off at any time from the Find Family screen. You can also change location access in iPhone Settings.' },
];

export default function LocationConsentScreen({ visible, onAgree, onClose }: { visible: boolean; onAgree: () => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <OverlayPage visible={visible} onDismiss={onClose} zIndex={70} backgroundColor={colors.background}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <OverlayHeading eyebrow="FAMILY CUBE · FIND FAMILY" title="Share your location?" subtitle="Here is exactly what happens if you say yes" accent="teal" Icon={MapPin} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, gap: RHYTHM.item, paddingBottom: RHYTHM.section }} showsVerticalScrollIndicator={false}>
          {POINTS.map(p => (
            <View key={p.title} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: RHYTHM.card, gap: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{p.title}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>{p.body}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: RHYTHM.item, paddingHorizontal: RHYTHM.page, paddingTop: RHYTHM.item, paddingBottom: Math.max(insets.bottom, RHYTHM.page) }}>
          <Pressable onPress={onClose} accessibilityRole="button" style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Not now</Text>
          </Pressable>
          <Pressable onPress={onAgree} accessibilityRole="button" style={{ flex: 1.4, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textInverse }}>I agree, continue</Text>
          </Pressable>
        </View>
      </View>
    </OverlayPage>
  );
}
