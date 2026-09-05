/**
 * GameLauncherScreen — game + mode + difficulty picker (app/hub/games/index.tsx).
 * Phase 2: Tic-Tac-Toe solo-vs-AI only — Memory/Snake/Uno tiles and the
 * multiplayer opponent-picker land in later phases per the build plan.
 * Full arcade theme — this screen IS the "stepping into games" moment,
 * same as every screen under app/hub/games/**.
 */
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ArcadeScreen } from './arcade/ArcadeScreen';
import { ArcadePrimaryButton } from './arcade/ArcadePrimaryButton';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO } from './theme/gameTheme';

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export default function GameLauncherScreen() {
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>('medium');

  return (
    <ArcadeScreen title="FAMILY GAMES">
      <View style={{ padding: 16, gap: 20 }}>
        <View style={{
          borderRadius: 24, borderWidth: 1.5, borderColor: ARCADE.lineGlow,
          backgroundColor: ARCADE.surface, padding: 18, gap: 14,
        }}>
          <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading, color: ARCADE.textPrimary }}>
            ⭕ Tic-Tac-Toe
          </Text>
          <Text style={{ fontSize: ARCADE_TYPO.body, color: ARCADE.textSecondary }}>
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
                    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 14,
                    borderWidth: 1.5, borderColor: selected ? ARCADE.primary : ARCADE.line,
                    backgroundColor: selected ? 'rgba(255,176,32,0.16)' : ARCADE.surfaceRaised,
                  }}
                >
                  <Text style={{
                    fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label, letterSpacing: 0.6,
                    textTransform: 'uppercase', color: selected ? ARCADE.primary : ARCADE.textSecondary,
                  }}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <ArcadePrimaryButton
            label="Play vs AI"
            onPress={() => router.push({ pathname: '/hub/games/tic-tac-toe', params: { mode: 'solo_ai', difficulty } })}
          />
        </View>

        <Text style={{ fontSize: ARCADE_TYPO.body, color: ARCADE.textMuted, textAlign: 'center' }}>
          More games — Memory, Snake, Uno, and playing against family — coming soon.
        </Text>
      </View>
    </ArcadeScreen>
  );
}
