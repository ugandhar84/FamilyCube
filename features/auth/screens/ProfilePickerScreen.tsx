import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import PinEntryModal from '@/components/PinEntryModal';

/**
 * ProfilePickerScreen — full-screen "who's using the device" kiosk landing
 * page, shown after Lock & Switch Back (or any future step-away action)
 * instead of dropping straight back into the real auth-owner's Hub. Any
 * family member can tap their own avatar to become the active profile —
 * same tap-to-select + PIN-gate model PersonaSwitcherSheet already uses for
 * in-app switching, but as a standalone screen with no dismiss/close, since
 * there's no screen "behind" it to reveal until someone picks a profile.
 */
export default function ProfilePickerScreen() {
  const { colors, isDark } = useTheme();
  const allMembers = useFamilyStore(s => s.members);
  const familyName = useFamilyStore(s => s.familyName);
  const setActiveMember = useFamilyStore(s => s.setActiveMember);

  const members = allMembers.filter(m => !m.deletedAt && m.inviteStatus !== 'pending');
  const allNames = members.map(m => m.name);
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);

  const selectMember = (m: FamilyMember) => {
    if (m.pinEnabled && m.pin) {
      setPinTarget(m);
    } else {
      setActiveMember(m.id);
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]}>{familyName || 'Our Family'}</Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>Tap your profile to continue</Text>
      </View>

      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        {members.map(m => (
          <Pressable key={m.id} onPress={() => selectMember(m)} style={s.tile}>
            <FamilyAvatar
              name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
              siblings={allNames} size={72}
              ringColor={colors.primary} ringWidth={2}
            />
            <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {m.name.split(' ')[0]}
            </Text>
            {m.pinEnabled && (
              <Text style={[s.lockHint, { color: colors.textTertiary }]}>🔒 PIN</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>

      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={(member) => { setActiveMember(member.id); router.replace('/(tabs)'); }}
        onCancel={() => setPinTarget(null)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 24, paddingBottom: 12 },
  title: { fontSize: TYPO.hero, fontWeight: '800' },
  subtitle: { fontSize: TYPO.body, marginTop: 4 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 20, padding: 24,
  },
  tile: { alignItems: 'center', gap: 8, width: 96 },
  name: { fontSize: TYPO.body, fontWeight: '700' },
  lockHint: { fontSize: TYPO.micro, fontWeight: '600' },
});
