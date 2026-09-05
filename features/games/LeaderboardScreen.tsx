/**
 * LeaderboardScreen — routed screen (app/hub/games/leaderboard.tsx).
 * Two sections: a score leaderboard (Snake + solo Memory — the only games
 * with a sortable numeric score, per game_scores.sql's own header comment)
 * and a win/loss "Records" tab (Tic-Tac-Toe/Memory/Uno — games decided by
 * winning, not a score, per game_win_tallies.sql). Records is genuinely a
 * different shape (record per member, not a ranked score list), so it gets
 * its own top-level tab rather than being forced into the score list.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { ArcadeScreen } from './arcade/ArcadeScreen';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO } from './theme/gameTheme';
import { useGameStore, type Difficulty, type GameWinTally } from '@/store/gameStore';
import { useFamilyStore } from '@/store/familyStore';

const SCORE_GAME_TYPES: { key: 'snake' | 'memory'; label: string; icon: string; accent: string }[] = [
  { key: 'snake', label: 'Snake', icon: '🐍', accent: ARCADE.snake },
  { key: 'memory', label: 'Memory', icon: '🧠', accent: ARCADE.memory },
];
const RECORD_GAME_TYPES: { key: 'tic_tac_toe' | 'memory' | 'uno'; label: string; icon: string; accent: string }[] = [
  { key: 'tic_tac_toe', label: 'Tic-Tac-Toe', icon: '⭕', accent: ARCADE.primary },
  { key: 'memory', label: 'Memory', icon: '🧠', accent: ARCADE.memory },
  { key: 'uno', label: 'Uno', icon: '🎴', accent: ARCADE.uno },
];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const MEDALS = ['🥇', '🥈', '🥉'];

function ScoresTab() {
  const [gameType, setGameType] = useState<'snake' | 'memory'>('snake');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [loading, setLoading] = useState(true);
  const members = useFamilyStore(s => s.members);
  const loadLeaderboard = useGameStore(s => s.loadLeaderboard);
  const leaderboard = useGameStore(s => s.leaderboard[`${gameType}:${difficulty}`] ?? []);
  const activeAccent = SCORE_GAME_TYPES.find(g => g.key === gameType)!.accent;

  useEffect(() => {
    setLoading(true);
    loadLeaderboard(gameType, difficulty).finally(() => setLoading(false));
  }, [gameType, difficulty]);

  return (
    <View style={{ flex: 1, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SCORE_GAME_TYPES.map(g => {
          const selected = g.key === gameType;
          return (
            <Pressable
              key={g.key}
              onPress={() => setGameType(g.key)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16,
                borderWidth: 1.5, borderColor: selected ? g.accent : ARCADE.line,
                backgroundColor: selected ? `${g.accent}22` : ARCADE.surface,
              }}
            >
              <Text style={{ fontSize: 18 }}>{g.icon}</Text>
              <Text style={{
                fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label,
                color: selected ? g.accent : ARCADE.textSecondary, marginTop: 2,
              }}>
                {g.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {DIFFICULTIES.map(d => {
          const selected = d === difficulty;
          return (
            <Pressable
              key={d}
              onPress={() => setDifficulty(d)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12,
                borderWidth: 1.5, borderColor: selected ? ARCADE.primary : ARCADE.line,
                backgroundColor: selected ? 'rgba(255,176,32,0.14)' : ARCADE.surfaceRaised,
              }}
            >
              <Text style={{
                fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label, letterSpacing: 0.5,
                textTransform: 'uppercase', color: selected ? ARCADE.primary : ARCADE.textSecondary,
              }}>
                {d}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={activeAccent} />
        </View>
      ) : leaderboard.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: ARCADE.textSecondary, fontSize: ARCADE_TYPO.body }}>No scores yet — be the first!</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
          {leaderboard.map((entry, i) => {
            const member = members.find(m => m.id === entry.memberId);
            return (
              <View
                key={entry.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16,
                  backgroundColor: ARCADE.surface, borderWidth: 1, borderColor: i < 3 ? activeAccent : ARCADE.line,
                  paddingVertical: 12, paddingHorizontal: 14,
                }}
              >
                <Text style={{ fontSize: ARCADE_TYPO.heading, width: 28 }}>
                  {i < 3 ? MEDALS[i] : `${i + 1}`}
                </Text>
                <Text style={{ flex: 1, fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.body, color: ARCADE.textPrimary }} numberOfLines={1}>
                  {member?.name ?? 'Someone'}
                </Text>
                <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.score, color: activeAccent, fontVariant: ['tabular-nums'] }}>
                  {entry.score}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function RecordsTab() {
  const [gameType, setGameType] = useState<'tic_tac_toe' | 'memory' | 'uno'>('tic_tac_toe');
  const [loading, setLoading] = useState(true);
  const [tallies, setTallies] = useState<GameWinTally[]>([]);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId) ?? members[0]?.id ?? null;
  const familyId = (members.find(m => m.id === activeMemberId) as any)?.familyId ?? (members[0] as any)?.familyId ?? null;
  const loadFamilyWinTallies = useGameStore(s => s.loadFamilyWinTallies);
  const activeAccent = RECORD_GAME_TYPES.find(g => g.key === gameType)!.accent;

  useEffect(() => {
    if (!familyId) return;
    setLoading(true);
    loadFamilyWinTallies(familyId, gameType).then(setTallies).finally(() => setLoading(false));
  }, [familyId, gameType]);

  // Ranked by wins desc, ties broken by fewer losses — a family member with
  // zero recorded games simply never appears here (there's no row to show
  // "0-0-0" from) rather than padding the list with everyone in the family.
  const ranked = [...tallies].sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  return (
    <View style={{ flex: 1, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {RECORD_GAME_TYPES.map(g => {
          const selected = g.key === gameType;
          return (
            <Pressable
              key={g.key}
              onPress={() => setGameType(g.key)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16,
                borderWidth: 1.5, borderColor: selected ? g.accent : ARCADE.line,
                backgroundColor: selected ? `${g.accent}22` : ARCADE.surface,
              }}
            >
              <Text style={{ fontSize: 18 }}>{g.icon}</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={{
                  fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label,
                  color: selected ? g.accent : ARCADE.textSecondary, marginTop: 2,
                }}
              >
                {g.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={activeAccent} />
        </View>
      ) : ranked.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: ARCADE.textSecondary, fontSize: ARCADE_TYPO.body }}>No games finished yet — be the first!</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
          {ranked.map((entry, i) => {
            const member = members.find(m => m.id === entry.memberId);
            const played = entry.wins + entry.losses + entry.draws;
            return (
              <View
                key={entry.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16,
                  backgroundColor: ARCADE.surface, borderWidth: 1, borderColor: i < 3 ? activeAccent : ARCADE.line,
                  paddingVertical: 12, paddingHorizontal: 14,
                }}
              >
                <Text style={{ fontSize: ARCADE_TYPO.heading, width: 28 }}>
                  {i < 3 ? MEDALS[i] : `${i + 1}`}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.body, color: ARCADE.textPrimary }} numberOfLines={1}>
                    {member?.name ?? 'Someone'}
                  </Text>
                  <Text style={{ fontSize: ARCADE_TYPO.label, color: ARCADE.textMuted }}>
                    {played} played
                  </Text>
                </View>
                <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.score, color: activeAccent, fontVariant: ['tabular-nums'] }}>
                  {entry.wins}-{entry.losses}{entry.draws > 0 ? `-${entry.draws}` : ''}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

export default function LeaderboardScreen() {
  const [tab, setTab] = useState<'scores' | 'records'>('scores');

  return (
    <ArcadeScreen title="LEADERBOARD">
      <View style={{ flex: 1, paddingHorizontal: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: ARCADE.surfaceRaised, borderRadius: 16, padding: 4 }}>
          {(['scores', 'records'] as const).map(t => {
            const selected = t === tab;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12,
                  backgroundColor: selected ? ARCADE.primary : 'transparent',
                }}
              >
                <Text style={{
                  fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label, letterSpacing: 0.5,
                  textTransform: 'uppercase', color: selected ? ARCADE.bgTop : ARCADE.textSecondary,
                }}>
                  {t === 'scores' ? 'High Scores' : 'Records'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'scores' ? <ScoresTab /> : <RecordsTab />}
      </View>
    </ArcadeScreen>
  );
}
