/**
 * FamilyGamesSection — Hub section rendered by all 4 role views (Parent/
 * Kid/Teen/Senior). Phase 2: a single Tic-Tac-Toe tile linking to the
 * launcher — the other 3 games and inline challenge/invite cards land in
 * later phases per the build plan.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';

export function FamilyGamesSection({ colors, isDark }: { colors: any; isDark: boolean }) {
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
      <Text style={{ fontSize: TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Family Games
      </Text>
      <Pressable
        onPress={() => router.push('/hub/games')}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.card, padding: 14,
        }}
      >
        <View style={{
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.accent,
        }}>
          <Text style={{ fontSize: 20 }}>🎮</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
            Play a game
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            Tic-Tac-Toe vs the computer
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
