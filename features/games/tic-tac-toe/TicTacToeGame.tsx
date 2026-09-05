/**
 * TicTacToeGame — routed screen (app/hub/games/tic-tac-toe.tsx). Params:
 *   solo:        ?mode=solo_ai&difficulty=easy|medium|hard
 *   multiplayer: ?mode=multiplayer&sessionId=<uuid>
 *
 * Solo board state is local-only per the plan (no gameStore, no DB row at
 * all) — the human is always 'X' and always goes first, matching
 * accept_game_challenge's "challenger goes first" rule so solo and
 * multiplayer feel consistent.
 *
 * Multiplayer renders straight off gameStore.activeSession.boardState —
 * the server (submit_game_move RPC) is the sole authority on legality and
 * turn order; this screen never mutates the board locally, it only ever
 * calls submitMove and re-renders whatever comes back over realtime. The
 * challenger is always 'X' (accept_game_challenge's own convention), so
 * the active member's mark is derived once from the session, not stored.
 *
 * Full "Neon Cabinet" arcade design pass (see the design plan this was
 * built from): glowing cabinet board, SVG neon X/O marks, player pods
 * showing whose turn it is, a per-cell pulse across the winning three
 * plus a confetti burst on victory (no separate drawn win-line — the
 * pulsing cells themselves already read as "this is the win"), and a
 * scanning-highlight "thinking" animation for the AI's turn.
 *
 * Own subtle backdrop tint (ArcadeScreen's backgroundColors) and
 * musicStopped wired to this screen's own game-over, same as Snake/
 * Memory/Uno — see SnakeGame.tsx's header note for the cross-game
 * cohesion rationale. gameOver is reported up from whichever of
 * Solo/MultiplayerTicTacToe is actually mounted via onGameOverChange.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence,
  withRepeat, withDelay,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { ArcadeScreen } from '../arcade/ArcadeScreen';
import { ArcadePrimaryButton } from '../arcade/ArcadePrimaryButton';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO, ARCADE_SPRING_BOUNCY, ARCADE_AI_THINK_MS } from '../theme/gameTheme';
import { playSfx } from '../theme/gameAudio';
import { speakEvent } from '../theme/gameVoice';
import { Board, checkWinner, checkWinningLine, isDraw, emptyBoard } from './ticTacToeLogic';
import { pickAiMove, type Difficulty } from './ticTacToeAI';
import { TicTacToeMark } from './TicTacToeMark';
import { useGameStore } from '@/store/gameStore';
import { useFamilyStore } from '@/store/familyStore';

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

function PlayerPod({
  label, wins, mark, active, accent, dimmed,
}: { label: string; wins: number; mark: 'X' | 'O'; active: boolean; accent: string; dimmed: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, minWidth: 96, maxWidth: 130,
      paddingHorizontal: 12, borderRadius: 18, backgroundColor: ARCADE.surface, borderWidth: 2,
      borderColor: active ? accent : 'transparent', opacity: dimmed ? 0.55 : 1,
    }}>
      <TicTacToeMark symbol={mark} size={18} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ flex: 1, fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.label, color: ARCADE.textPrimary }}
      >
        {label}
      </Text>
      <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.score, color: ARCADE.textPrimary, fontVariant: ['tabular-nums'] }}>
        {wins}
      </Text>
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

function BoardShell({
  board, winningLine, draw, thinking, statusText, statusColor, boardSize, cellSize,
  leftLabel, rightLabel, leftWins, rightWins, leftTurn, rightTurn, leftMark, rightMark,
  onCellPress, cellsDisabled, showConfetti, confettiColors, footer,
}: {
  board: Board; winningLine: [number, number, number] | null; draw: boolean; thinking: boolean;
  statusText: string; statusColor: string; boardSize: number; cellSize: number;
  leftLabel: string; rightLabel: string; leftWins: number; rightWins: number;
  leftTurn: boolean; rightTurn: boolean; leftMark: 'X' | 'O'; rightMark: 'X' | 'O';
  onCellPress: (i: number) => void; cellsDisabled: boolean;
  showConfetti: boolean; confettiColors: [string, string]; footer: React.ReactNode;
}) {
  const thinkPulse = useSharedValue(1);
  useEffect(() => {
    if (thinking) {
      thinkPulse.value = withRepeat(withSequence(withTiming(0.45, { duration: 450 }), withTiming(1, { duration: 450 })), -1, true);
    } else {
      thinkPulse.value = 1;
    }
  }, [thinking]);
  const thinkStyle = useAnimatedStyle(() => ({ opacity: thinkPulse.value }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24 }}>
      {/* Player pods — leftLabel/rightLabel are "YOU"/"AI" for solo but a
          real (potentially long) family member name in multiplayer, so
          every pod caps its own width and shrinks its name rather than
          assuming a short fixed label. Fixed height + a single content
          row (mark, name, score) keeps both pods identically sized
          regardless of whose turn it is — only the border/opacity change. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <PlayerPod label={leftLabel} wins={leftWins} mark={leftMark} active={leftTurn} accent={ARCADE.ticTacToeX} dimmed={!leftTurn && !draw && !winningLine} />
        <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: 13, color: ARCADE.textMuted }}>VS</Text>
        <PlayerPod label={rightLabel} wins={rightWins} mark={rightMark} active={rightTurn} accent={ARCADE.ticTacToeO} dimmed={!rightTurn && !draw && !winningLine} />
      </View>

      <View style={{ height: ARCADE_TYPO.display + 4, justifyContent: 'center', width: boardSize, alignItems: 'center' }}>
        <Animated.Text
          style={[thinkStyle, {
            fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.display, color: statusColor,
            letterSpacing: 0.5, textAlign: 'center',
          }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
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
        <View style={{ width: boardSize, height: boardSize, flexDirection: 'row', flexWrap: 'wrap', gap: CELL_GAP }}>
          {board.map((cell, i) => (
            <ArcadeCell
              key={i}
              value={cell}
              index={i}
              cellSize={cellSize}
              disabled={cellsDisabled}
              winning={!!winningLine && winningLine.includes(i)}
              onPress={() => onCellPress(i)}
            />
          ))}
        </View>
        {showConfetti && <ConfettiBurst colorA={confettiColors[0]} colorB={confettiColors[1]} />}
      </View>

      {footer}
    </View>
  );
}

function SoloTicTacToe({ boardSize, cellSize, difficulty, onGameOverChange }: { boardSize: number; cellSize: number; difficulty: Difficulty; onGameOverChange: (v: boolean) => void }) {
  const [board, setBoard] = useState<Board>(emptyBoard());
  const [isHumanTurn, setIsHumanTurn] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [wins, setWins] = useState({ human: 0, ai: 0 });

  const winner = checkWinner(board);
  const winningLine = checkWinningLine(board);
  const draw = isDraw(board);
  const gameOver = winner !== null || draw;

  useEffect(() => { onGameOverChange(gameOver); }, [gameOver]);

  const bannerY = useSharedValue(-20);
  const bannerScale = useSharedValue(0.8);
  useEffect(() => {
    if (gameOver) {
      bannerY.value = withSpring(0, ARCADE_SPRING_BOUNCY);
      bannerScale.value = withSpring(1, ARCADE_SPRING_BOUNCY);
      if (winner) {
        Haptics.notificationAsync(winner === 'X' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
        playSfx(winner === 'X' ? 'win' : 'lose');
        speakEvent(winner === 'X' ? 'win' : 'lose');
      }
    } else {
      bannerY.value = -20;
      bannerScale.value = 0.8;
    }
  }, [gameOver]);
  const bannerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bannerY.value }, { scale: bannerScale.value }] }));

  const submitSoloResult = useGameStore(s => s.submitSoloResult);
  const resultSubmittedRef = useRef(false);

  useEffect(() => {
    if (winner === 'X') setWins(w => ({ ...w, human: w.human + 1 }));
    else if (winner === 'O') setWins(w => ({ ...w, ai: w.ai + 1 }));
  }, [winner]);

  // Solo play has no game_sessions row at all — this is the ONLY place a
  // solo Tic-Tac-Toe result ever reaches game_win_tallies/XP (see
  // submitSoloResult's own comment in gameStore.ts). resultSubmittedRef
  // (not state) guards this so a re-render never double-submits the same
  // finished game — reset on handleRestart alongside the rest of the round.
  useEffect(() => {
    if (!gameOver || resultSubmittedRef.current) return;
    resultSubmittedRef.current = true;
    submitSoloResult('tic_tac_toe', winner === 'X' ? 'win' : winner === 'O' ? 'loss' : 'draw');
  }, [gameOver]);

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
    playSfx('moveTick');
    const next = [...board];
    next[i] = 'X';
    setBoard(next);
    setIsHumanTurn(false);
  };

  const handleRestart = () => {
    setBoard(emptyBoard());
    setIsHumanTurn(true);
    setThinking(false);
    resultSubmittedRef.current = false;
  };

  const statusText = winner === 'X' ? 'You win!'
    : winner === 'O' ? 'AI wins'
    : draw ? 'Draw'
    : thinking ? 'AI is thinking…'
    : 'Your turn';
  const statusColor = winner === 'X' ? ARCADE.ticTacToeX : winner === 'O' ? ARCADE.ticTacToeO : ARCADE.textPrimary;

  return (
    <BoardShell
      board={board} winningLine={winningLine} draw={draw} thinking={thinking}
      statusText={statusText} statusColor={statusColor} boardSize={boardSize} cellSize={cellSize}
      leftLabel="YOU" rightLabel="AI" leftWins={wins.human} rightWins={wins.ai}
      leftTurn={isHumanTurn && !gameOver} rightTurn={!isHumanTurn && !gameOver}
      leftMark="X" rightMark="O"
      onCellPress={handleCellPress} cellsDisabled={!isHumanTurn || gameOver}
      showConfetti={gameOver && winner === 'X'} confettiColors={[ARCADE.ticTacToeX, ARCADE.primary]}
      footer={gameOver && (
        <Animated.View style={bannerStyle}>
          <ArcadePrimaryButton label="Play Again" onPress={handleRestart} />
        </Animated.View>
      )}
    />
  );
}

function MultiplayerTicTacToe({ boardSize, cellSize, sessionId, onGameOverChange }: { boardSize: number; cellSize: number; sessionId: string; onGameOverChange: (v: boolean) => void }) {
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId) ?? members[0]?.id ?? null;
  const activeSession = useGameStore(s => s.activeSession);
  const submitMove = useGameStore(s => s.submitMove);
  const loadSession = useGameStore(s => s.loadSession);
  const ensureSessionRealtime = useGameStore(s => s.ensureSessionRealtime);
  const stopSessionRealtime = useGameStore(s => s.stopSessionRealtime);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    useGameStore.setState({ activeSession: null });
    ensureSessionRealtime(sessionId);
    // Realtime only delivers UPDATEs — a session with no update yet (e.g.
    // the challenger who just created it, still 'pending') would otherwise
    // leave activeSession null forever. Fetch the current row once so the
    // screen renders the real state immediately.
    loadSession(sessionId);
    return () => stopSessionRealtime();
  }, [sessionId]);

  const session = activeSession?.id === sessionId ? activeSession : null;
  const board: Board = (session?.boardState?.cells as Board) ?? emptyBoard();
  const winningLine = checkWinningLine(board);

  const isParticipant = !!session && (session.challengerId === activeMemberId || session.challengedId === activeMemberId);
  const gameOver = session?.status === 'completed';
  const draw = session?.result === 'draw' || session?.result === 'tie';
  const myWon = gameOver && session?.winnerId === activeMemberId;

  // Every hook in this component must run on every render regardless of
  // the early "not loaded yet" / "not your game" return below — an effect
  // declared AFTER a conditional return only gets called once that
  // condition is false, which changes the hook count between renders and
  // is a real Rules-of-Hooks violation (React throws "Rendered more hooks
  // than during the previous render"). Guard the effect's BODY instead.
  useEffect(() => {
    if (!gameOver || draw) return;
    playSfx(myWon ? 'win' : 'lose');
    speakEvent(myWon ? 'win' : 'lose');
  }, [gameOver]);

  // Same hoist-above-early-return rule as the effect above — must run on
  // every render so the mounted-once musicStopped prop actually tracks
  // this session's real status instead of freezing at whatever it was
  // when the component first had a loaded session.
  useEffect(() => { onGameOverChange(!!gameOver); }, [gameOver]);

  if (!session || !isParticipant) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.body, color: ARCADE.textMuted }}>
          {!session ? 'Loading game…' : 'This game belongs to a different family member.'}
        </Text>
      </View>
    );
  }

  // accept_game_challenge always seats the challenger as 'X' — see the
  // migration's own comment. The active member's mark falls out of that.
  const isChallenger = session.challengerId === activeMemberId;
  const myMark: 'X' | 'O' = isChallenger ? 'X' : 'O';
  const opponentId = isChallenger ? session.challengedId : session.challengerId;
  const opponent = members.find(m => m.id === opponentId);
  const me = members.find(m => m.id === activeMemberId);

  const isMyTurn = session.status === 'active' && session.currentTurnMemberId === activeMemberId;

  const handleCellPress = async (i: number) => {
    if (!isMyTurn || gameOver || board[i] !== null || submitting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    playSfx('moveTick');
    setSubmitting(true);
    try {
      await submitMove(sessionId, { cell: i });
    } finally {
      setSubmitting(false);
    }
  };

  const statusText = gameOver
    ? (draw ? 'Draw' : myWon ? 'You win!' : `${opponent?.name?.split(' ')[0] ?? 'Opponent'} wins`)
    : session.status === 'pending' ? 'Waiting…'
    : isMyTurn ? 'Your turn'
    : `${opponent?.name?.split(' ')[0] ?? 'Their'}'s turn`;
  const statusColor = gameOver
    ? (draw ? ARCADE.textPrimary : myWon ? ARCADE.ticTacToeX : ARCADE.ticTacToeO)
    : ARCADE.textPrimary;

  const leftIsMe = isChallenger;

  return (
    <BoardShell
      board={board} winningLine={winningLine} draw={draw} thinking={false}
      statusText={statusText} statusColor={statusColor} boardSize={boardSize} cellSize={cellSize}
      leftLabel={(leftIsMe ? me?.name : opponent?.name)?.split(' ')[0]?.toUpperCase() ?? (leftIsMe ? 'YOU' : 'THEM')}
      rightLabel={(leftIsMe ? opponent?.name : me?.name)?.split(' ')[0]?.toUpperCase() ?? (leftIsMe ? 'THEM' : 'YOU')}
      leftWins={0} rightWins={0}
      leftTurn={!gameOver && session.currentTurnMemberId === (leftIsMe ? activeMemberId : opponentId)}
      rightTurn={!gameOver && session.currentTurnMemberId === (leftIsMe ? opponentId : activeMemberId)}
      leftMark={leftIsMe ? myMark : (myMark === 'X' ? 'O' : 'X')}
      rightMark={leftIsMe ? (myMark === 'X' ? 'O' : 'X') : myMark}
      onCellPress={handleCellPress} cellsDisabled={!isMyTurn || gameOver}
      showConfetti={myWon} confettiColors={[ARCADE.ticTacToeX, ARCADE.primary]}
      footer={null}
    />
  );
}

export default function TicTacToeGame() {
  const { mode, difficulty: difficultyParam, sessionId } = useLocalSearchParams<{ mode?: string; difficulty?: string; sessionId?: string }>();
  const difficulty: Difficulty = (difficultyParam as Difficulty) ?? 'medium';
  const { width: windowWidth } = useWindowDimensions();
  const boardSize = Math.min(windowWidth - 64, BOARD_MAX);
  const cellSize = (boardSize - CELL_GAP * 2) / 3;
  const [gameOver, setGameOver] = useState(false);

  return (
    // Design cohesion: a subtle backdrop tint of its own (see the file
    // header note on why Snake/Memory/Tic-Tac-Toe each get one now, and why
    // Uno's much bolder felt table remains a deliberate outlier in DEGREE).
    // Music stops on this game's own gameOver, same as Uno/Snake/Memory —
    // reported up from whichever variant is actually mounted below.
    <ArcadeScreen title="TIC-TAC-TOE" musicStopped={gameOver} backgroundColors={['#1B1032', '#150C28', '#0C0819']}>
      {mode === 'multiplayer' && sessionId ? (
        <MultiplayerTicTacToe boardSize={boardSize} cellSize={cellSize} sessionId={sessionId} onGameOverChange={setGameOver} />
      ) : (
        <SoloTicTacToe boardSize={boardSize} cellSize={cellSize} difficulty={difficulty} onGameOverChange={setGameOver} />
      )}
    </ArcadeScreen>
  );
}
