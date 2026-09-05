/**
 * TicTacToeGame — routed screen (app/hub/games/tic-tac-toe.tsx). Phase 2:
 * solo-vs-AI only — the multiplayer branch lands in Phase 3 once the
 * challenge/session realtime plumbing exists on the store side. Params:
 *   ?mode=solo_ai&difficulty=easy|medium|hard
 *
 * Solo board state is local-only per the plan (no gameStore, no DB row at
 * all) — the human is always 'X' and always goes first, matching
 * accept_game_challenge's "challenger goes first" rule so solo and
 * multiplayer feel consistent.
 *
 * Full "Neon Cabinet" arcade design pass (see the design plan this was
 * built from): glowing cabinet board, SVG neon X/O marks, player pods
 * showing whose turn it is, a drawn win-line + cell pulse on victory, a
 * small confetti burst, and a scanning-highlight "thinking" animation
 * for the AI's turn.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence,
  withRepeat, withDelay, Easing, runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { ArcadeScreen } from '../arcade/ArcadeScreen';
import { ArcadePrimaryButton } from '../arcade/ArcadePrimaryButton';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO, ARCADE_SPRING_BOUNCY, ARCADE_AI_THINK_MS } from '../theme/gameTheme';
import { Board, checkWinner, checkWinningLine, isDraw, emptyBoard } from './ticTacToeLogic';
import { pickAiMove, type Difficulty } from './ticTacToeAI';
import { TicTacToeMark } from './TicTacToeMark';

const BOARD_MAX = 320;
const CELL_GAP = 8;

function ArcadeCell({
  value, index, onPress, disabled, winning, cellSize,
}: {
  value: 'X' | 'O' | null; index: number; onPress: () => void; disabled: boolean; winning: boolean; cellSize: number;
}) {
  const scale = useSharedValue(1);
  const markScale = useSharedValue(value ? 1 : 0.4);
  const markOpacity = useSharedValue(value ? 1 : 0);
  const flash = useSharedValue(0);
  const pulse = useSharedValue(1);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value && prevValue.current === null) {
      // A mark was just placed here — spring in with overshoot, flash the
      // cell background toward the player's accent, then decay.
      markScale.value = withSpring(1, ARCADE_SPRING_BOUNCY);
      markOpacity.value = withTiming(1, { duration: 120 });
      flash.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 300 }));
    }
    prevValue.current = value;
  }, [value]);

  useEffect(() => {
    if (winning) {
      // Three-beat win pulse (beat 3 of the design's win sequence) —
      // staggered per-cell delay handled by the caller via `winning`
      // toggling slightly later per cell isn't needed here since all
      // three cells pulse together per the design ("the three cells then
      // pulse together").
      pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 180 }), withTiming(1, { duration: 180 })), 3, false);
    }
  }, [winning]);

  const cellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulse.value }],
    backgroundColor: winning
      ? `rgba(255,176,32,${0.18})`
      : `rgba(255,255,255,${0.05 + flash.value * 0.15})`,
  }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: markScale.value }],
    opacity: markOpacity.value,
  }));

  return (
    <Pressable
      disabled={disabled || value !== null}
      onPressIn={() => { if (!disabled && value === null) scale.value = withTiming(0.94, { duration: 80 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
      onPress={onPress}
      style={{ width: cellSize, height: cellSize }}
    >
      <Animated.View style={[{
        flex: 1, borderRadius: 18, borderWidth: 1, borderColor: ARCADE.line,
        alignItems: 'center', justifyContent: 'center',
      }, cellStyle]}>
        {value && (
          <Animated.View style={markStyle}>
            <TicTacToeMark symbol={value} size={cellSize * 0.56} />
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function WinLineOverlay({ line, boardSize, cellSize }: { line: [number, number, number]; boardSize: number; cellSize: number }) {
  const progress = useSharedValue(0);
  useEffect(() => { progress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }); }, [line]);

  const [a, , c] = line;
  const cellStep = cellSize + CELL_GAP;
  const centerOf = (i: number) => ({ x: (i % 3) * cellStep + cellSize / 2, y: Math.floor(i / 3) * cellStep + cellSize / 2 });
  const start = centerOf(a);
  const end = centerOf(c);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: boardSize, height: boardSize }}>
      <Animated.View style={[{
        position: 'absolute', left: start.x, top: start.y - 2, width: length, height: 4, borderRadius: 2,
        backgroundColor: ARCADE.primary, transform: [{ rotate: `${angle}deg` }], transformOrigin: 'left center',
        shadowColor: ARCADE.primaryGlow, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
      }, style]} />
    </View>
  );
}

function ConfettiBurst({ colorA, colorB }: { colorA: string; colorB: string }) {
  const dots = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    angle: (i / 10) * Math.PI * 2 + Math.random() * 0.3,
    color: i % 2 === 0 ? colorA : colorB,
  })), [colorA, colorB]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%' }}>
      {dots.map((d, i) => <ConfettiDot key={i} angle={d.angle} color={d.color} />)}
    </View>
  );
}

function ConfettiDot({ angle, color }: { angle: number; color: string }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);
  useEffect(() => {
    progress.value = withSpring(1, { damping: 8, stiffness: 90 });
    opacity.value = withDelay(150, withTiming(0, { duration: 250 }));
  }, []);
  const distance = 70;
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: Math.cos(angle) * distance * progress.value },
      { translateY: Math.sin(angle) * distance * progress.value },
      { scale: 1 - progress.value * 0.3 },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]} />;
}

export default function TicTacToeGame() {
  const { difficulty: difficultyParam } = useLocalSearchParams<{ mode?: string; difficulty?: string }>();
  const difficulty: Difficulty = (difficultyParam as Difficulty) ?? 'medium';
  const { width: windowWidth } = useWindowDimensions();
  const boardSize = Math.min(windowWidth - 64, BOARD_MAX);
  const cellSize = (boardSize - CELL_GAP * 2) / 3;

  const [board, setBoard] = useState<Board>(emptyBoard());
  const [isHumanTurn, setIsHumanTurn] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [wins, setWins] = useState({ human: 0, ai: 0 });

  const winner = checkWinner(board);
  const winningLine = checkWinningLine(board);
  const draw = isDraw(board);
  const gameOver = winner !== null || draw;

  const thinkPulse = useSharedValue(1);
  useEffect(() => {
    if (thinking) {
      thinkPulse.value = withRepeat(withSequence(withTiming(0.45, { duration: 450 }), withTiming(1, { duration: 450 })), -1, true);
    } else {
      thinkPulse.value = 1;
    }
  }, [thinking]);
  const thinkStyle = useAnimatedStyle(() => ({ opacity: thinkPulse.value }));

  const bannerY = useSharedValue(-20);
  const bannerScale = useSharedValue(0.8);
  useEffect(() => {
    if (gameOver) {
      bannerY.value = withSpring(0, ARCADE_SPRING_BOUNCY);
      bannerScale.value = withSpring(1, ARCADE_SPRING_BOUNCY);
      if (winner) Haptics.notificationAsync(winner === 'X' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else {
      bannerY.value = -20;
      bannerScale.value = 0.8;
    }
  }, [gameOver]);
  const bannerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bannerY.value }, { scale: bannerScale.value }] }));

  useEffect(() => {
    if (winner === 'X') setWins(w => ({ ...w, human: w.human + 1 }));
    else if (winner === 'O') setWins(w => ({ ...w, ai: w.ai + 1 }));
  }, [winner]);

  // AI's turn — enforced minimum think delay per the design spec (an
  // instant move reads as broken, not smart), regardless of how fast
  // minimax actually resolves.
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
    }, ARCADE_AI_THINK_MS);
    return () => clearTimeout(timer);
  }, [isHumanTurn, gameOver, difficulty]);

  const handleCellPress = (i: number) => {
    if (!isHumanTurn || gameOver || board[i] !== null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

  const statusText = winner === 'X' ? 'YOU WIN!'
    : winner === 'O' ? 'AI WINS'
    : draw ? 'DRAW'
    : thinking ? 'THINKING…'
    : 'YOUR TURN';
  const statusColor = winner === 'X' ? ARCADE.ticTacToeX : winner === 'O' ? ARCADE.ticTacToeO : ARCADE.textPrimary;

  return (
    <ArcadeScreen title="TIC-TAC-TOE">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24 }}>

        {/* Player pods */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{
            alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20,
            backgroundColor: ARCADE.surface, borderWidth: 2,
            borderColor: isHumanTurn && !gameOver ? ARCADE.ticTacToeX : 'transparent',
            opacity: isHumanTurn || gameOver ? 1 : 0.55,
          }}>
            <TicTacToeMark symbol="X" size={22} />
            <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.score, color: ARCADE.textPrimary, fontVariant: ['tabular-nums'] }}>
              {wins.human}
            </Text>
          </View>
          <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: 13, color: ARCADE.textMuted }}>VS</Text>
          <View style={{
            alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20,
            backgroundColor: ARCADE.surface, borderWidth: 2,
            borderColor: !isHumanTurn && !gameOver ? ARCADE.ticTacToeO : 'transparent',
            opacity: !isHumanTurn || gameOver ? 1 : 0.55,
          }}>
            <TicTacToeMark symbol="O" size={22} />
            <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.score, color: ARCADE.textPrimary, fontVariant: ['tabular-nums'] }}>
              {wins.ai}
            </Text>
          </View>
        </View>

        <View style={{ height: ARCADE_TYPO.display + 4, justifyContent: 'center' }}>
          <Animated.Text style={[thinkStyle, {
            fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.display, color: statusColor, letterSpacing: 0.5,
          }]}>
            {statusText}
          </Animated.Text>
        </View>

        {/* Cabinet board */}
        <View style={{
          width: boardSize + 24, padding: 12, borderRadius: 28,
          backgroundColor: ARCADE.surface, borderWidth: 2, borderColor: ARCADE.lineGlow,
          shadowColor: ARCADE.primaryGlow, shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
          elevation: 12,
        }}>
          {/* Corner "marquee bulb" dots — subtle cabinet framing device */}
          <View style={{ position: 'absolute', top: 10, left: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: ARCADE.primary }} />
          <View style={{ position: 'absolute', top: 10, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: ARCADE.primary }} />
          <View style={{ width: boardSize, height: boardSize, flexDirection: 'row', flexWrap: 'wrap', gap: CELL_GAP }}>
            {board.map((cell, i) => (
              <ArcadeCell
                key={i}
                value={cell}
                index={i}
                cellSize={cellSize}
                disabled={!isHumanTurn || gameOver}
                winning={!!winningLine && winningLine.includes(i)}
                onPress={() => handleCellPress(i)}
              />
            ))}
            {winningLine && <WinLineOverlay line={winningLine} boardSize={boardSize} cellSize={cellSize} />}
          </View>
          {gameOver && winner === 'X' && <ConfettiBurst colorA={ARCADE.ticTacToeX} colorB={ARCADE.primary} />}
        </View>

        {gameOver && (
          <Animated.View style={bannerStyle}>
            <ArcadePrimaryButton label="Play Again" onPress={handleRestart} />
          </Animated.View>
        )}
      </View>
    </ArcadeScreen>
  );
}
