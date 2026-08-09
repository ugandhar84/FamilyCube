import { View, Text, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import BackButton from '@/components/BackButton';
import NotificationsScreen from './NotificationsScreen';

export default function AllNotificationsScreen() {
  const { colors } = useTheme();
  const bg = colors.background;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: bg }}>
        <View style={s.header}>
          <BackButton />
          <Text style={[s.title, { color: colors.textPrimary }]}>Notifications</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>
      <NotificationsScreen hideHeader />
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: TYPO.subheading, fontWeight: '700',
  },
});
