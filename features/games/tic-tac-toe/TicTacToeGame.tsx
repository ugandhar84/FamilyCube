/**
 * TicTacToeGame — routed screen (app/hub/games/tic-tac-toe.tsx). Phase 2
 * of the Family Games plan: solo-vs-AI only for now — the multiplayer
 * branch (reading a sessionId param, subscribing to gameStore's session
 * realtime channel, calling submitMove) lands in Phase 3 once the
 * challenge/session realtime plumbing exists on the store side. Params:
 *   ?mode=solo_ai&difficulty=easy|medium|hard
 *
 * Solo board state is local-only per the plan (no gameStore, no DB row at
 * all for a solo game) — the human is always 'X' and always goes first,
 * matching accept_game_challenge's own "challenger goes first" rule so
 * solo and multiplayer feel consistent.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { Board, checkWinner, isDraw, emptyBoard } from './ticTacToeLogic';
import { pickAiMove, type Difficulty } from './ticTacToeAI';

type CellValue = 'X' | 'O' | null;

export default function TicTacToeGame() {
  const { colors, isDark } = useTheme();
  const { difficulty: difficultyParam } = useLocalSearchParams<{ mode?: string; difficulty?: string }>();
  const difficulty: Difficulty = (difficultyParam as Difficulty) ?? 'medium';

  const [board, setBoard] = useState<Board>(emptyBoard());
  const [isHumanTurn, setIsHumanTurn] = useState(true);
  const [thinking, setThinking] = useState(false);

  const winner = checkWinner(board);
  const draw = isDraw(board);
  const gameOver = winner !== null || draw;

  // AI's turn: pick and apply a move after a short delay so its move
  // doesn't feel instantaneous/robotic — long enough to read as
  // "thinking," short enough not to feel laggy.
  useEffect(() => {
    if (gameOver || isHumanTurn) return;
    setThinking(true);
    const timer = setTimeout(() => {
      setBoard(prev => {
        const move = pickAiMove(prev, 'O', difficulty);
        const next = [...prev];
        next[move] = 'O';
        return next;
      });
      setThinking(false);
      setIsHumanTurn(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [isHumanTurn, gameOver, difficulty]);

  const handleCellPress = (i: number) => {
    if (!isHumanTurn || gameOver || board[i] !== null) return;
    const next = [...board];
    next[i] = 'X';
    setBoard(next);
    setIsHumanTurn(false);
  };

  const handleRestart = () => {
    setBoard(emptyBoard());
    setIsHumanTurn(true);
    setThinking(false);
  };

  const statusText = winner === 'X' ? 'You win! 🎉'
    : winner === 'O' ? 'AI wins'
    : draw ? "It's a draw"
    : thinking ? 'AI is thinking…'
    : 'Your turn';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary, flex: 1 }}>
          Tic-Tac-Toe
        </Text>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textTertiary, textTransform: 'capitalize' }}>
          {difficulty}
        </Text>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24 }}>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>
          {statusText}
        </Text>

        <View style={{
          width: 300, height: 300, flexDirection: 'row', flexWrap: 'wrap',
          borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: colors.border,
          gap: 2,
        }}>
          {board.map((cell: CellValue, i: number) => (
            <Pressable
              key={i}
              onPress={() => handleCellPress(i)}
              disabled={!isHumanTurn || gameOver || cell !== null}
              style={{
                width: '32.6%', height: '32.6%', alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.card,
              }}
            >
              <Text style={{
                fontSize: 48, fontWeight: '900',
                color: cell === 'X' ? colors.primary : cell === 'O' ? colors.accent : 'transparent',
              }}>
                {cell ?? '·'}
              </Text>
            </Pressable>
          ))}
        </View>

        {gameOver && (
          <Pressable
            onPress={handleRestart}
            style={{
              borderRadius: RADIUS.md, paddingVertical: 13, paddingHorizontal: 28,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Play Again</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
