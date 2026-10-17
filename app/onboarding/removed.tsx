import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserX } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { PageHeading } from '@/components/PageHeading';
import { GEMINI } from '@/constants/geminiRhythm';

/** Shown when an admin removed this person from their family. Their account is fine; they can join or start another family. */
export default function RemovedFromFamilyScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const family = (globalThis as any).__removedFrom as string | undefined;
  const canvas = isDark ? colors.background : GEMINI.canvas;
  const btn = (label: string, onPress: () => void, primary = false) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button"
      style={[s.btn, primary ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: primary ? '#fff' : colors.textPrimary }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <PageHeading eyebrow="FAMILY CUBE · ACCOUNT" title="You were removed"
        subtitle={family ? `A parent removed you from ${family}. Your account is fine.` : 'A parent removed you from the family. Your account is fine.'}
        accent="amber" Icon={UserX} topInset={insets.top} />
      <View style={{ paddingHorizontal: 20, gap: 12, paddingTop: 4 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
          You can no longer see that family's chats, tasks or records. To go back, ask a parent to invite you again (they can also undo the removal within 7 days). Or join or start another family below.
        </Text>
        {btn('Join another family with a code', () => router.replace('/onboarding/join-family' as any), true)}
        {btn('Create my own family', () => router.replace('/onboarding/setup-family' as any))}
        {btn('Sign out', () => { useAuthStore.getState().signOut().then(() => router.replace('/(auth)/login' as any)); })}
      </View>
    </View>
  );
}
const s = StyleSheet.create({ btn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' } });
