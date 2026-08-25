// TermsViewerScreen — read-only "Terms & Privacy" link target from Profile.
// Reuses the exact same TERMS_CONTENT as the onboarding accept-flow
// (features/onboarding/screens/TermsScreen.tsx) rather than duplicating or
// inventing new legal text, but drops the accept checkbox/CTA — a
// signed-in user re-reading the terms from Settings isn't accepting them,
// just viewing them, and TermsScreen's own back button intentionally
// routes to /onboarding (wrong for a user who's already fully onboarded).
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { TERMS_CONTENT } from '@/features/onboarding/screens/TermsScreen';

export default function TermsViewerScreen() {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary }}>Terms & Privacy</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View style={{
          borderRadius: 16, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.card, padding: 16,
        }}>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 20 }}>
            {TERMS_CONTENT}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
