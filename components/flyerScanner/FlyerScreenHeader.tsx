/**
 * FlyerScreenHeader — shared full-page header for every FlyerScannerModal
 * step, hand-rolled to match BringInDocumentScreen.tsx/ReviewFindingsScreen.tsx's
 * own header shape exactly (insets.top + 8 padding, a small back/cancel
 * link, then a big 29px/700-weight title, optional subtitle below) rather
 * than inventing a new header style or reaching for PageHeading (neither
 * reference screen uses it — see module header of those two files).
 */
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FlyerScreenHeader({
  colors, isDark,
  backLabel, onBack,
  title, subtitle,
}: {
  colors: any; isDark: boolean;
  backLabel: string;
  onBack: () => void;
  title: string;
  subtitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const titleC = isDark ? colors.textPrimary : '#172337';
  const bodyC  = isDark ? colors.textSecondary : '#657185';
  const linkC  = isDark ? colors.primary : '#294FC7';

  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24, paddingBottom: 8 }}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: linkC }}>{backLabel}</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 10, lineHeight: 36 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 13, color: bodyC, marginTop: 4, lineHeight: 18 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}
