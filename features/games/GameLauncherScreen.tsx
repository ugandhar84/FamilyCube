/**
 * GameLauncherScreen — game + mode + difficulty picker (app/hub/games/index.tsx).
 * Phase 2: Tic-Tac-Toe solo-vs-AI only — Memory/Snake/Uno tiles and the
 * multiplayer opponent-picker land in later phases per the build plan.
 */
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export default function GameLauncherScreen() {
  const { colors, isDark } = useTheme();
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>('medium');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary }}>
          Family Games
        </Text>
      </View>

      <View style={{ padding: 16, gap: 20 }}>
        <View style={{
          borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.card, padding: 16, gap: 12,
        }}>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>
            ⭕ Tic-Tac-Toe
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            Play against the computer. Choose a difficulty:
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DIFFICULTIES.map(d => {
              const selected = d === difficulty;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.md,
                    borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primaryLight : colors.surface,
                  }}
                >
                  <Text style={{
                    fontSize: TYPO.caption, fontWeight: '800', textTransform: 'capitalize',
                    color: selected ? colors.primary : colors.textPrimary,
                  }}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/hub/games/tic-tac-toe', params: { mode: 'solo_ai', difficulty } })}
            style={{ borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center', backgroundColor: colors.primary }}
          >
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Play vs AI</Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center' }}>
          More games — Memory, Snake, Uno, and playing against family — coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
