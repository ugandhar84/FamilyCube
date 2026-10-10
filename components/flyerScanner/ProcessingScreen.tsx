/**
 * ProcessingScreen — Step 2 of the full-page flyer scanner flow. Pure
 * spinner state while the parse-flyer edge function (Gemini Vision) runs.
 * No footer/actions — matches the original AppBottomSheet step exactly
 * (which also rendered no footer for 'processing').
 */
import { View, Text, ActivityIndicator } from 'react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

export default function ProcessingScreen({ colors, isDark }: { colors: any; isDark: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#FFFFFF' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 }}>
        <ActivityIndicator size="large" color={BRAND.purple} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Reading your flyer…</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Gemini Vision is extracting the schedule</Text>
      </View>
    </View>
  );
}
