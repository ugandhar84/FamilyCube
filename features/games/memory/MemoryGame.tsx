/**
 * MemoryGame — routed screen (app/hub/games/memory.tsx). Params:
 *   solo:        ?mode=solo_ai&difficulty=easy|medium|hard
 *   multiplayer: ?mode=multiplayer&sessionId=<uuid>
 *
 * Solo board state is local-only (no gameStore, no DB row), same rule as
 * solo Tic-Tac-Toe. Only a COMPLETED solo game calls gameStore.submitScore
 * — the leaderboard is the entire reason solo Memory touches the backend
 * at all.
 *
 * Multiplayer renders straight off gameStore.activeSession.boardState (the
 * { cards, flippedIds } shape submit_game_move's memory branch owns) — this
 * screen never resolves match/no-match itself in multiplayer, it only ever
 * calls submitMove with one cardId per flip and re-renders whatever the RPC
 * returns, same server-authoritative pattern as Tic-Tac-Toe multiplayer.
 * The server's own mismatch resolution flips both cards back to face-down
 * WITHIN the same response that reveals the second card, so this screen
 * fakes the "preview" by holding the previous face-up render for
 * MISMATCH_PREVIEW_MS before it's allowed to apply that response.
 *
 * Own subtle backdrop tint and musicStopped wired to this screen's own
 * round-over state, same as Snake/Tic-Tac-Toe/Uno — see SnakeGame.tsx's
 * header note for the cross-game cohesion rationale.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { ArcadeScreen } from '../arcade/ArcadeScreen';
import { ArcadePrimaryButton } from '../arcade/ArcadePrimaryButton';
import { CardFlip } from '../shared/CardFlip';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO, ARCADE_AI_THINK_MS } from '../theme/gameTheme';
import { playSfx } from '../theme/gameAudio';
import { speakEvent } from '../theme/gameVoice';
import {
  MemoryCard, MemoryDifficulty, PAIR_COUNT, GRID_COLUMNS, TIME_LIMIT_SECONDS,
  faceFor, generateDeck, isDeckComplete, computeMemoryScoreBreakdown,
} from './memoryLogic';
import { pickAiMemoryTurn, recordSeen, type SeenMap } from './memoryAI';
import { useGameStore } from '@/store/gameStore';
import { useFamilyStore } from '@/store/familyStore';

const MISMATCH_PREVIEW_MS = 700;
const GRID_MAX_WIDTH = 340;
const CARD_GAP = 8;

function MemoryCardView({ card, size, onPress, disabled }: { card: MemoryCard; size: number; onPress: () => void; disabled: boolean }) {
  const matched = card.matchedBy !== null;
  const scale = useSharedValue(1);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (matched) {
      pulse.value = withSequence(withTiming(1.08, { duration: 160 }), withTiming(1, { duration: 160 }));
    }
  }, [matched]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * pulse.value }], opacity: matched ? 0.35 : 1 }));

  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Pressable
        disabled={disabled || card.faceUp || matched}
        onPressIn={() => { if (!disabled && !card.faceUp && !matched) scale.value = withTiming(0.94, { duration: 80 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
        onPress={onPress}
        style={{ flex: 1 }}
      >
        <CardFlip
          size={size}
          faceUp={card.faceUp || matched}
          front={
            <View style={{
              width: size, height: size, borderRadius: 14, backgroundColor: ARCADE.surfaceRaised,
              borderWidth: 1.5, borderColor: matched ? ARCADE.memory : ARCADE.lineGlow,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: size * 0.5 }}>{faceFor(card.pairId)}</Text>
            </View>
          }
          back={
            <View style={{
              width: size, height: size, borderRadius: 14, backgroundColor: ARCADE.surfaceRaised,
              borderWidth: 2, borderColor: ARCADE.memory, alignItems: 'center', justifyContent: 'center',
              shadowColor: ARCADE.memory, shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
            }}>
              <View style={{
                width: size * 0.62, height: size * 0.62, borderRadius: (size * 0.62) / 2,
                backgroundColor: `${ARCADE.memory}33`, alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Plain system font, not the Baloo 2 display face — Baloo 2's
                    "?" glyph is a stylized loop that reads as a garbled
                    symbol at this size/weight rather than a recognizable
                    question mark. */}
                <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: ARCADE.memory }}>?</Text>
              </View>
            </View>
          }
        />
      </Pressable>
    </Animated.View>
  );
}

function SoloMemory({ difficulty, onGameOverChange }: { difficulty: MemoryDifficulty; onGameOverChange: (v: boolean) => void }) {
  const submitScore = useGameStore(s => s.submitScore);
  const submitSoloResult = useGameStore(s => s.submitSoloResult);
  const { width: windowWidth } = useWindowDimensions();

  const columns = GRID_COLUMNS[difficulty];
  const gridWidth = Math.min(windowWidth - 48, GRID_MAX_WIDTH);
  // Floor: at an exact fit (cardSize*cols + gap*(cols-1) === gridWidth) any
  // sub-pixel rounding up wraps the last card of every row onto its own line.
  const cardSize = Math.floor((gridWidth - CARD_GAP * (columns - 1)) / columns);

  const [cards, setCards] = useState<MemoryCard[]>(() => generateDeck(difficulty));
  const [flippedIds, setFlippedIds] = useState<number[]>([]);
  const [isHumanTurn, setIsHumanTurn] = useState(true);
  // A match earns the SAME player another turn, so isHumanTurn's value
  // often doesn't change across turns (false -> false for a second AI
  // turn in a row) — a plain useEffect([isHumanTurn]) then never re-fires
  // and the AI silently stalls forever after its first match. This counter
  // increments on every turn handoff, match-and-continue included, so it's
  // always a fresh dependency value regardless of whose turn it still is.
  const [turnToken, setTurnToken] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false); // locks input during mismatch preview
  // Tracked per-player, not as one shared counter — the score formula
  // (and the leaderboard submission) must only reflect the HUMAN's own
  // moves. A shared counter previously meant every AI turn silently
  // counted against the human's own move-penalty, so "your score" was
  // partly determined by how many turns the AI happened to take.
  const [moveCount, setMoveCount] = useState({ human: 0, ai: 0 });
  const [pairs, setPairs] = useState({ human: 0, ai: 0 });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  // Without a real "not started" gate, the timer and score both began
  // counting the instant this screen mounted — before the player had
  // flipped a single card. On a timed difficulty that meant the round
  // could silently time out (0 pairs found) while the player was still
  // looking at the board, and briefly rendered a nonsensical state (a
  // score computed from a stale/zero clock) before any real play began.
  const [started, setStarted] = useState(false);
  const seenRef = useRef<SeenMap>(new Map());
  const startedRef = useRef<number | null>(null);

  const totalPairs = PAIR_COUNT[difficulty];
  const timeLimit = TIME_LIMIT_SECONDS[difficulty];
  const gameOver = isDeckComplete(cards);
  const timeUp = started && timeLimit !== null && elapsedSeconds >= timeLimit;
  const roundOver = gameOver || timeUp;

  useEffect(() => { onGameOverChange(roundOver); }, [roundOver]);

  useEffect(() => {
    if (!started || roundOver || startedRef.current === null) return;
    const startedAt = startedRef.current;
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [started, roundOver]);

  useEffect(() => {
    if (roundOver && !scoreSubmitted) {
      setScoreSubmitted(true);
      const score = computeMemoryScoreBreakdown({ difficulty, moveCount: moveCount.human, timeElapsedSeconds: elapsedSeconds, pairsWon: pairs.human, totalPairs }).total;
      submitScore({ gameType: 'memory', difficulty, score, memoryMoves: moveCount.human, memoryTimeSeconds: elapsedSeconds });
      submitSoloResult('memory', pairs.human > pairs.ai ? 'win' : pairs.human < pairs.ai ? 'loss' : 'draw');
      if (pairs.human > pairs.ai) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        playSfx('win');
        speakEvent('win');
      } else if (pairs.human < pairs.ai) {
        playSfx('lose');
        speakEvent('lose');
      }
    }
  }, [roundOver]);

  const flipCard = (id: number, matchedBy: string | null = null, faceUp = true) => {
    setCards(prev => prev.map(c => (c.id === id ? { ...c, faceUp, matchedBy: matchedBy ?? c.matchedBy } : c)));
  };

  const resolveTurn = (firstId: number, secondId: number, player: 'human' | 'ai') => {
    setMoveCount(m => ({ ...m, [player]: m[player] + 1 }));
    const first = cards.find(c => c.id === firstId)!;
    const second = cards.find(c => c.id === secondId)!;
    const isMatch = first.pairId === second.pairId;

    if (isMatch) {
      setCards(prev => prev.map(c => (c.id === firstId || c.id === secondId) ? { ...c, matchedBy: player, faceUp: true } : c));
      setPairs(p => ({ ...p, [player]: p[player] + 1 }));
      setFlippedIds([]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      playSfx('cardFlip');
      // Match earns another turn for the same player.
      setIsHumanTurn(player === 'human');
      setTurnToken(t => t + 1);
      return;
    }

    // Mismatch: hold both face-up briefly (so the player actually sees
    // them) before flipping back and passing the turn.
    setBusy(true);
    setTimeout(() => {
      setCards(prev => prev.map(c => (c.id === firstId || c.id === secondId) ? { ...c, faceUp: false } : c));
      setFlippedIds([]);
      setBusy(false);
      setIsHumanTurn(player !== 'human');
      setTurnToken(t => t + 1);
    }, MISMATCH_PREVIEW_MS);
  };

  const handleCardPress = (id: number) => {
    if (!isHumanTurn || busy || roundOver) return;
    const card = cards.find(c => c.id === id);
    if (!card || card.faceUp || card.matchedBy) return;

    // The very first flip of the round is what actually starts the clock
    // — not the screen mounting. startedRef feeds the timer effect above;
    // `started` itself gates timeUp so a timed round can never expire
    // before the player has done anything.
    if (!started) {
      startedRef.current = Date.now();
      setStarted(true);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    playSfx('cardFlip');
    recordSeen(seenRef.current, card);
    flipCard(id);

    if (flippedIds.length === 0) {
      setFlippedIds([id]);
    } else {
      const firstId = flippedIds[0];
      resolveTurn(firstId, id, 'human');
    }
  };

  // AI's turn.
  useEffect(() => {
    if (isHumanTurn || busy || roundOver) return;
    setThinking(true);
    const turn = pickAiMemoryTurn(cards, seenRef.current, difficulty);
    const t1 = setTimeout(() => {
      const firstCard = cards.find(c => c.id === turn.first)!;
      recordSeen(seenRef.current, firstCard);
      flipCard(turn.first);
      const t2 = setTimeout(() => {
        const secondId = turn.second(firstCard.pairId);
        const secondCard = cards.find(c => c.id === secondId)!;
        recordSeen(seenRef.current, secondCard);
        flipCard(secondId);
        setThinking(false);
        resolveTurn(turn.first, secondId, 'ai');
      }, ARCADE_AI_THINK_MS);
      return () => clearTimeout(t2);
    }, ARCADE_AI_THINK_MS);
    return () => clearTimeout(t1);
    // turnToken (not isHumanTurn alone) drives this: a match keeps the same
    // player's turn, so isHumanTurn can stay `false` across consecutive AI
    // turns — turnToken always changes on a handoff, match-and-continue
    // included, so a fresh AI turn reliably starts every time it should.
  }, [turnToken, busy, roundOver]);

  const handleRestart = () => {
    setCards(generateDeck(difficulty));
    setFlippedIds([]);
    setIsHumanTurn(true);
    setThinking(false);
    setBusy(false);
    setMoveCount({ human: 0, ai: 0 });
    setPairs({ human: 0, ai: 0 });
    setElapsedSeconds(0);
    setScoreSubmitted(false);
    seenRef.current = new Map();
    startedRef.current = null;
    setStarted(false);
  };

  const timeRemaining = timeLimit !== null ? Math.max(0, timeLimit - elapsedSeconds) : null;
  const statusText = roundOver
    ? (pairs.human > pairs.ai ? 'You win!' : pairs.human < pairs.ai ? 'AI wins' : 'Tie')
    : thinking ? 'AI is thinking…'
    : isHumanTurn ? 'Your turn' : "AI's turn";
  const statusColor = roundOver
    ? (pairs.human > pairs.ai ? ARCADE.memory : pairs.human < pairs.ai ? ARCADE.ticTacToeO : ARCADE.textPrimary)
    : ARCADE.textPrimary;

  // Same formula as the leaderboard submission, recomputed live off the
  // exact same moveCount.human/elapsedSeconds state — the number on screen
  // while playing is never a different figure from what actually gets
  // submitted. Only the HUMAN's own moves count against the move penalty —
  // the AI taking a turn (even a mismatch) never costs the human anything.
  const scoreBreakdown = computeMemoryScoreBreakdown({ difficulty, moveCount: moveCount.human, timeElapsedSeconds: elapsedSeconds, pairsWon: pairs.human, totalPairs });

  return (
    <MemoryBoardShell
      cards={cards} gridWidth={gridWidth} cardSize={cardSize} statusText={statusText} statusColor={statusColor}
      timeRemaining={timeRemaining}
      leftLabel="YOU" rightLabel="AI" leftCount={pairs.human} rightCount={pairs.ai} totalPairs={totalPairs}
      leftTurn={isHumanTurn && !roundOver} rightTurn={!isHumanTurn && !roundOver}
      onCardPress={handleCardPress} cardsDisabled={!isHumanTurn || busy || roundOver}
      score={started ? scoreBreakdown.total : undefined}
      scoreBreakdown={roundOver ? scoreBreakdown : undefined}
      footer={roundOver && <ArcadePrimaryButton label="Play Again" onPress={handleRestart} />}
    />
  );
}

function MemoryBoardShell({
  cards, gridWidth, cardSize, statusText, statusColor, timeRemaining,
  leftLabel, rightLabel, leftCount, rightCount, totalPairs, leftTurn, rightTurn,
  onCardPress, cardsDisabled, footer, score, scoreBreakdown,
}: {
  cards: MemoryCard[]; gridWidth: number; cardSize: number; statusText: string; statusColor: string;
  timeRemaining: number | null; leftLabel: string; rightLabel: string; leftCount: number; rightCount: number;
  totalPairs: number; leftTurn: boolean; rightTurn: boolean;
  onCardPress: (id: number) => void; cardsDisabled: boolean; footer: React.ReactNode;
  // Solo-only — multiplayer has no scoring concept (it's win/loss, per the
  // plan), so both are omitted there. `score` updates live during play,
  // recomputed from the same formula the leaderboard submission uses, so
  // the number on screen while playing is never a different figure from
  // what actually gets submitted. `scoreBreakdown` is only shown once the
  // round ends — a plain-language readout of how that number was reached.
  score?: number;
  scoreBreakdown?: { base: number; movePenalty: number; timePenalty: number; difficultyBonus: number };
}) {
  // No cards dealt yet (session still 'pending', waiting on accept) — a
  // "0/0" score reads as broken rather than "not started", and an empty
  // grid still claims flex:1 worth of blank space below the status line.
  // Show just the two pods + status until there's an actual board to draw.
  const isPending = cards.length === 0;

  return (
    <View style={
      isPending
        ? { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 16 }
        : { flex: 1, alignItems: 'center', paddingTop: 8, gap: 14, paddingHorizontal: 16 }
    }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{
          alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16,
          backgroundColor: ARCADE.surface, borderWidth: 2,
          borderColor: leftTurn ? ARCADE.memory : 'transparent',
        }}>
          <Text style={{ fontSize: ARCADE_TYPO.label, color: ARCADE.textSecondary, fontFamily: ARCADE_FONT_DISPLAY_BOLD }} numberOfLines={1}>{leftLabel}</Text>
          {!isPending && (
            <Text style={{ fontSize: ARCADE_TYPO.score, color: ARCADE.textPrimary, fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontVariant: ['tabular-nums'] }}>
              {leftCount}/{totalPairs}
            </Text>
          )}
        </View>
        {timeRemaining !== null && (
          <Text style={{
            fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading,
            color: timeRemaining <= 15 ? ARCADE.ticTacToeO : ARCADE.textPrimary, fontVariant: ['tabular-nums'],
          }}>
            {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
          </Text>
        )}
        <View style={{
          alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16,
          backgroundColor: ARCADE.surface, borderWidth: 2,
          borderColor: rightTurn ? ARCADE.memory : 'transparent',
        }}>
          <Text style={{ fontSize: ARCADE_TYPO.label, color: ARCADE.textSecondary, fontFamily: ARCADE_FONT_DISPLAY_BOLD }} numberOfLines={1}>{rightLabel}</Text>
          {!isPending && (
            <Text style={{ fontSize: ARCADE_TYPO.score, color: ARCADE.textPrimary, fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontVariant: ['tabular-nums'] }}>
              {rightCount}/{totalPairs}
            </Text>
          )}
        </View>
      </View>

      <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.display, color: statusColor }}>
        {statusText}
      </Text>

      {score !== undefined && !isPending && (
        <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: ARCADE_TYPO.body, color: ARCADE.memory, marginTop: -8, fontVariant: ['tabular-nums'] }}>
          Your score: {score}
        </Text>
      )}

      {scoreBreakdown && (
        <View style={{
          borderRadius: 14, borderWidth: 1, borderColor: ARCADE.line, backgroundColor: ARCADE.surface,
          paddingVertical: 10, paddingHorizontal: 14, gap: 3, width: gridWidth,
        }}>
          <BreakdownRow label="Base" value={`+${scoreBreakdown.base}`} />
          {scoreBreakdown.movePenalty > 0 && <BreakdownRow label="Extra moves" value={`-${scoreBreakdown.movePenalty}`} negative />}
          {scoreBreakdown.timePenalty > 0 && <BreakdownRow label="Time taken" value={`-${scoreBreakdown.timePenalty}`} negative />}
          {scoreBreakdown.difficultyBonus > 0 && <BreakdownRow label="Difficulty bonus" value={`+${scoreBreakdown.difficultyBonus}`} />}
        </View>
      )}

      {!isPending && (
        <View style={{ width: gridWidth, flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
          {cards.map(card => (
            <MemoryCardView
              key={card.id} card={card} size={cardSize}
              onPress={() => onCardPress(card.id)}
              disabled={cardsDisabled}
            />
          ))}
        </View>
      )}

      {footer}
    </View>
  );
}

function BreakdownRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: ARCADE_TYPO.label, color: ARCADE.textSecondary }}>{label}</Text>
      <Text style={{
        fontSize: ARCADE_TYPO.label, fontWeight: '800', fontVariant: ['tabular-nums'],
        color: negative ? ARCADE.ticTacToeO : ARCADE.memory,
      }}>
        {value}
      </Text>
    </View>
  );
}

// All difficulties use the same column count (GRID_COLUMNS is 4 for every
// difficulty — only row count/pair count varies), so cardSize doesn't
// depend on the session's own difficulty and can be computed once here.
function MultiplayerMemory({ gridWidth, sessionId, onGameOverChange }: { gridWidth: number; sessionId: string; onGameOverChange: (v: boolean) => void }) {
  const cardSize = Math.floor((gridWidth - CARD_GAP * (GRID_COLUMNS.medium - 1)) / GRID_COLUMNS.medium);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId) ?? members[0]?.id ?? null;
  const activeSession = useGameStore(s => s.activeSession);
  const submitMove = useGameStore(s => s.submitMove);
  const loadSession = useGameStore(s => s.loadSession);
  const ensureSessionRealtime = useGameStore(s => s.ensureSessionRealtime);
  const stopSessionRealtime = useGameStore(s => s.stopSessionRealtime);
  const [submitting, setSubmitting] = useState(false);
  // The server resolves a mismatch (both cards revealed, then flipped back
  // down) within a single response — we hold the PREVIOUS render (with
  // both cards still face-up) for a beat before accepting a response that
  // flips them back, so the player actually sees what they picked.
  const [displayOverride, setDisplayOverride] = useState<{ cards: MemoryCard[] } | null>(null);
  const pendingFirstIdRef = useRef<number | null>(null);

  useEffect(() => {
    useGameStore.setState({ activeSession: null });
    ensureSessionRealtime(sessionId);
    loadSession(sessionId);
    return () => stopSessionRealtime();
  }, [sessionId]);

  const session = activeSession?.id === sessionId ? activeSession : null;
  const isParticipant = !!session && (session.challengerId === activeMemberId || session.challengedId === activeMemberId);

  const serverCards: MemoryCard[] = session?.boardState?.cards ?? [];
  const cards = displayOverride?.cards ?? serverCards;
  const gameOver = session?.status === 'completed';
  const draw = session?.result === 'tie';
  const myWon = gameOver && session?.winnerId === activeMemberId;

  // Every hook here must run on every render regardless of the early
  // "not loaded yet" / "not your game" return below — an effect declared
  // AFTER a conditional return only gets called once that condition is
  // false, which changes the hook count between renders (React throws
  // "Rendered more hooks than during the previous render"). Guard the
  // effect's BODY instead of skipping the hook call itself.
  useEffect(() => {
    if (!gameOver || draw) return;
    playSfx(myWon ? 'win' : 'lose');
    speakEvent(myWon ? 'win' : 'lose');
  }, [gameOver]);

  // Same hoist-above-early-return rule as the effect above.
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

  const totalPairs = cards.length / 2;

  const isChallenger = session.challengerId === activeMemberId;
  const opponentId = isChallenger ? session.challengedId : session.challengerId;
  const opponent = members.find(m => m.id === opponentId);
  const me = members.find(m => m.id === activeMemberId);

  const isMyTurn = session.status === 'active' && session.currentTurnMemberId === activeMemberId;
  const myPairs = cards.filter(c => c.matchedBy === activeMemberId).length;
  const opponentPairs = cards.filter(c => c.matchedBy === opponentId).length;

  const handleCardPress = async (id: number) => {
    if (!isMyTurn || gameOver || submitting || displayOverride) return;
    const card = cards.find(c => c.id === id);
    if (!card || card.faceUp || card.matchedBy) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    playSfx('cardFlip');
    setSubmitting(true);
    const isSecondFlip = pendingFirstIdRef.current !== null;
    try {
      const result = await submitMove(sessionId, { cardId: id });
      if (!result) return;

      if (isSecondFlip) {
        const firstId = pendingFirstIdRef.current!;
        pendingFirstIdRef.current = null;
        const resultCards: MemoryCard[] = result.boardState?.cards ?? [];
        const firstMatched = resultCards.find(c => c.id === firstId)?.matchedBy !== null;
        if (!firstMatched) {
          // Mismatch — the RPC already flipped both back down. Show a
          // preview with both still face-up before applying the real
          // (flipped-back) state.
          const previewCards = resultCards.map(c => (c.id === firstId || c.id === id) ? { ...c, faceUp: true } : c);
          setDisplayOverride({ cards: previewCards });
          setTimeout(() => setDisplayOverride(null), MISMATCH_PREVIEW_MS);
        }
      } else {
        pendingFirstIdRef.current = id;
      }
    } finally {
      setSubmitting(false);
    }
  };

  const statusText = gameOver
    ? (draw ? 'Tie' : myWon ? 'You win!' : `${opponent?.name?.split(' ')[0] ?? 'Opponent'} wins`)
    : session.status === 'pending' ? 'Waiting…'
    : isMyTurn ? 'Your turn'
    : `${opponent?.name?.split(' ')[0] ?? 'Their'}'s turn`;
  const statusColor = gameOver ? (draw ? ARCADE.textPrimary : myWon ? ARCADE.memory : ARCADE.ticTacToeO) : ARCADE.textPrimary;
  const timeLimit = session.timeLimitSeconds;
  const timeRemaining = timeLimit && session.startedAt
    ? Math.max(0, timeLimit - Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000))
    : null;

  return (
    <MemoryBoardShell
      cards={cards} gridWidth={gridWidth} cardSize={cardSize} statusText={statusText} statusColor={statusColor}
      timeRemaining={timeRemaining}
      leftLabel={me?.name?.split(' ')[0]?.toUpperCase() ?? 'YOU'} rightLabel={opponent?.name?.split(' ')[0]?.toUpperCase() ?? 'THEM'}
      leftCount={myPairs} rightCount={opponentPairs} totalPairs={totalPairs}
      leftTurn={isMyTurn && !gameOver} rightTurn={!isMyTurn && !gameOver}
      onCardPress={handleCardPress} cardsDisabled={!isMyTurn || gameOver || submitting || !!displayOverride}
      footer={null}
    />
  );
}

export default function MemoryGame() {
  const { mode, difficulty: difficultyParam, sessionId } = useLocalSearchParams<{ mode?: string; difficulty?: string; sessionId?: string }>();
  const difficulty: MemoryDifficulty = (difficultyParam as MemoryDifficulty) ?? 'medium';
  const { width: windowWidth } = useWindowDimensions();
  const gridWidth = Math.min(windowWidth - 48, GRID_MAX_WIDTH);
  const [gameOver, setGameOver] = useState(false);

  return (
    // Own subtle backdrop tint + musicStopped on this game's own end state —
    // see SnakeGame.tsx's header note for the cross-game cohesion rationale.
    <ArcadeScreen title="MEMORY" musicStopped={gameOver} backgroundColors={['#241132', '#180F28', '#0C0819']}>
      {mode === 'multiplayer' && sessionId ? (
        <MultiplayerMemory gridWidth={gridWidth} sessionId={sessionId} onGameOverChange={setGameOver} />
      ) : (
        <SoloMemory difficulty={difficulty} onGameOverChange={setGameOver} />
      )}
    </ArcadeScreen>
  );
}
