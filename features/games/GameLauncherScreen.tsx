/**
 * GameLauncherScreen — game + mode + difficulty picker (app/hub/games/index.tsx).
 * Tic-Tac-Toe and Memory: solo-vs-AI + challenge-a-family-member. Snake:
 * solo only (leaderboard-driven, no AI/challenge). Uno lands in a later
 * phase. Full arcade theme — this screen IS the "stepping into games"
 * moment, same as every screen under app/hub/games/**.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ArcadeScreen } from './arcade/ArcadeScreen';
import { ArcadePrimaryButton } from './arcade/ArcadePrimaryButton';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO } from './theme/gameTheme';
import ChallengeInviteSheet from './ChallengeInviteSheet';
import { useGameStore, xpToNextLevel, type GameType, type Difficulty } from '@/store/gameStore';
import { useFamilyStore } from '@/store/familyStore';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function GameCard({
  icon, title, blurb, accent, gameType, route,
}: {
  icon: string; title: string; blurb: string; accent: string; gameType: GameType;
  route: '/hub/games/tic-tac-toe' | '/hub/games/memory';
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [inviteVisible, setInviteVisible] = useState(false);

  return (
    <View style={{
      borderRadius: 24, borderWidth: 1.5, borderColor: ARCADE.lineGlow,
      backgroundColor: ARCADE.surface, padding: 18, gap: 14,
    }}>
      <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading, color: ARCADE.textPrimary }}>
        {icon} {title}
      </Text>
      <Text style={{ fontSize: ARCADE_TYPO.body, color: ARCADE.textSecondary }}>{blurb}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {DIFFICULTIES.map(d => {
          const selected = d === difficulty;
          return (
            <Pressable
              key={d}
              onPress={() => setDifficulty(d)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, borderRadius: 14,
                borderWidth: 1.5, borderColor: selected ? accent : ARCADE.line,
                backgroundColor: selected ? `${accent}29` : ARCADE.surfaceRaised,
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label, letterSpacing: 0.6,
                  textTransform: 'uppercase', color: selected ? accent : ARCADE.textSecondary,
                }}
              >
                {d}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ArcadePrimaryButton
        label="Play vs AI"
        onPress={() => router.push({ pathname: route, params: { mode: 'solo_ai', difficulty } })}
      />
      <Pressable
        onPress={() => setInviteVisible(true)}
        style={{
          alignItems: 'center', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14,
          borderWidth: 1.5, borderColor: ARCADE.line, backgroundColor: ARCADE.surfaceRaised,
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label,
            letterSpacing: 0.4, color: ARCADE.textPrimary, textAlign: 'center',
          }}
        >
          👥 Challenge a Family Member
        </Text>
      </Pressable>

      <ChallengeInviteSheet
        visible={inviteVisible}
        onClose={() => setInviteVisible(false)}
        gameType={gameType}
        difficulty={difficulty}
        gameLabel={title}
        gameRoute={route}
      />
    </View>
  );
}

function SnakeCard() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  return (
    <View style={{
      borderRadius: 24, borderWidth: 1.5, borderColor: ARCADE.lineGlow,
      backgroundColor: ARCADE.surface, padding: 18, gap: 14,
    }}>
      <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading, color: ARCADE.textPrimary }}>
        🐍 Snake
      </Text>
      <Text style={{ fontSize: ARCADE_TYPO.body, color: ARCADE.textSecondary }}>
        Solo — eat, grow, don't hit the walls. Scores post to the family leaderboard.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {DIFFICULTIES.map(d => {
          const selected = d === difficulty;
          return (
            <Pressable
              key={d}
              onPress={() => setDifficulty(d)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, borderRadius: 14,
                borderWidth: 1.5, borderColor: selected ? ARCADE.snake : ARCADE.line,
                backgroundColor: selected ? `${ARCADE.snake}29` : ARCADE.surfaceRaised,
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label, letterSpacing: 0.6,
                  textTransform: 'uppercase', color: selected ? ARCADE.snake : ARCADE.textSecondary,
                }}
              >
                {d}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ArcadePrimaryButton
        label="Play"
        onPress={() => router.push({ pathname: '/hub/games/snake', params: { difficulty } })}
      />
    </View>
  );
}

// Cross-game level/XP badge — the one place in the arcade a player sees
// their progression ACROSS all 4 games (not per-game difficulty, which
// already exists per-card). Deliberately sits at the very top of the
// launcher, before any game card, since this IS the "how am I doing
// overall" summary of the whole arcade, not any one game's own state.
function ArcadeLevelBadge() {
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId) ?? members[0]?.id ?? null;
  const familyId = (members.find(m => m.id === activeMemberId) as any)?.familyId ?? (members[0] as any)?.familyId ?? null;
  const loadArcadeStats = useGameStore(s => s.loadArcadeStats);
  const stats = useGameStore(s => (activeMemberId ? s.arcadeStats[activeMemberId] : undefined));

  useEffect(() => {
    if (!familyId || !activeMemberId) return;
    loadArcadeStats(familyId, activeMemberId);
  }, [familyId, activeMemberId]);

  const totalXp = stats?.totalXp ?? 0;
  const { next, remaining } = xpToNextLevel(totalXp);
  const level = stats?.level ?? 1;
  // Progress toward the CURRENT level's own span, not the raw total —
  // 50*(level-1)^2 is where this level started, `next` is where it ends.
  const levelStartXp = 50 * (level - 1) * (level - 1);
  const span = Math.max(1, next - levelStartXp);
  const progress = Math.min(1, Math.max(0, (totalXp - levelStartXp) / span));

  return (
    <View style={{
      borderRadius: 20, borderWidth: 1.5, borderColor: ARCADE.lineGlow,
      backgroundColor: ARCADE.surface, padding: 16, gap: 10,
      flexDirection: 'row', alignItems: 'center',
    }}>
      <View style={{
        width: 52, height: 52, borderRadius: 26, backgroundColor: ARCADE.primary,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: 20, color: ARCADE.bgTop }}>
          {level}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.body, color: ARCADE.textPrimary }}>
          Level {level} Player
        </Text>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: ARCADE.surfaceRaised, overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 4, backgroundColor: ARCADE.primary }} />
        </View>
        <Text style={{ fontSize: ARCADE_TYPO.label, color: ARCADE.textSecondary }}>
          {remaining > 0 ? `${remaining} XP to Level ${level + 1}` : 'Max level reached!'}
        </Text>
      </View>
    </View>
  );
}

export default function GameLauncherScreen() {
  return (
    <ArcadeScreen title="FAMILY GAMES">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }}>
        <ArcadeLevelBadge />
        <GameCard
          icon="⭕" title="Tic-Tac-Toe" blurb="Play against the computer, or challenge a family member."
          accent={ARCADE.primary} gameType="tic_tac_toe" route="/hub/games/tic-tac-toe"
        />
        <GameCard
          icon="🧠" title="Memory" blurb="Flip cards, find pairs. Higher difficulty means more cards and a ticking clock."
          accent={ARCADE.memory} gameType="memory" route="/hub/games/memory"
        />
        <SnakeCard />

        <View style={{
          borderRadius: 24, borderWidth: 1.5, borderColor: ARCADE.lineGlow,
          backgroundColor: ARCADE.surface, padding: 18, gap: 14,
        }}>
          <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading, color: ARCADE.textPrimary }}>
            🎴 Uno
          </Text>
          <Text style={{ fontSize: ARCADE_TYPO.body, color: ARCADE.textSecondary }}>
            2-4 players — invite family, fill empty seats with AI.
          </Text>
          <ArcadePrimaryButton label="New Table" onPress={() => router.push('/hub/games/uno-lobby')} />
        </View>

        <Pressable
          onPress={() => router.push('/hub/games/leaderboard')}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderRadius: 16, borderWidth: 1.5, borderColor: ARCADE.line, backgroundColor: ARCADE.surface,
            paddingVertical: 14,
          }}
        >
          <Text style={{ fontSize: 16 }}>🏆</Text>
          <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.body, color: ARCADE.textPrimary }}>
            View Leaderboard
          </Text>
        </Pressable>

      </ScrollView>
    </ArcadeScreen>
  );
}
