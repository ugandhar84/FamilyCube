/**
 * SnakeGame — routed screen (app/hub/games/snake.tsx). Solo only, no AI
 * needed — params: ?difficulty=easy|medium|hard. A fixed-interval game
 * loop (setInterval, cleared/reset on unmount and on restart) drives
 * movement; direction changes are queued and applied at the start of the
 * next tick so a fast double-swipe can't reverse into instant self-
 * collision.
 *
 * Input is a swipe anywhere over the board (react-native-gesture-handler's
 * modern `Gesture.Pan()` API — GestureHandlerRootView already wraps the app
 * root in app/_layout.tsx). An earlier version used an on-screen D-pad on
 * the stated grounds that swipe "needs a gesture-handler dependency this
 * repo doesn't use" — that was simply false, gesture-handler has been a
 * direct dependency all along.
 *
 * Grid is plain <View> cells (400 of them; cheap enough per tick that a
 * canvas/SVG layer would be premature), and the board is sized off the
 * live window minus the chrome above/below it rather than a fixed cap, so
 * it fills as much of the screen as it can while staying square.
 *
 * Design cohesion: every game screen now gets its OWN subtle backdrop tint
 * (via ArcadeScreen's backgroundColors) instead of only Uno standing out
 * against a shared violet — a dark forest-green wash here, distinct from
 * Memory's plum and Tic-Tac-Toe's neutral violet-black, so stepping into
 * each game reads as its own space rather than 3 identical shells plus one
 * outlier. Music also stops on this game's own gameOver, matching Uno.
 * Uno's much bolder felt-green table is still the deliberate outlier in
 * DEGREE (a physical table surface, not just a tinted backdrop) — that's a
 * difference of interaction model (a shared table vs. a cabinet board), not
 * an inconsistency.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { ArcadeScreen } from '../arcade/ArcadeScreen';
import { ArcadePrimaryButton } from '../arcade/ArcadePrimaryButton';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO } from '../theme/gameTheme';
import { playSfx } from '../theme/gameAudio';
import {
  Direction, Point, SnakeDifficulty, GRID_SIZE, TICK_MS, GROWTH_PER_FOOD,
  initialSnake, nextHead, isOutOfBounds, isSelfCollision, isOpposite, randomEmptyCell, computeSnakeScore,
} from './snakeLogic';
import { useGameStore } from '@/store/gameStore';

const STARTING_LENGTH = initialSnake().length;

// Chrome we have to leave room for when sizing the board off the window.
const HEADER_HEIGHT = 56;    // ArcadeScreen's own header row
const SCORE_ROW_HEIGHT = 58; // FOOD / LENGTH readout above the board
const HINT_ROW_HEIGHT = 34;  // "swipe to steer" line below the board
const BOARD_H_PADDING = 16;  // horizontal breathing room either side
const BOARD_V_GAPS = 32;     // the column's gap:16 above + below the board

// A swipe has to travel this far before we accept a direction from it.
// Small enough to feel instant, large enough that a stray tap on the board
// (e.g. TAP TO START) never registers as a turn.
const SWIPE_THRESHOLD = 18;

export default function SnakeGame() {
  const { difficulty: difficultyParam } = useLocalSearchParams<{ difficulty?: string }>();
  const difficulty: SnakeDifficulty = (difficultyParam as SnakeDifficulty) ?? 'medium';
  const submitScore = useGameStore(s => s.submitScore);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Fill as much of the screen as a square board can: bounded by width on
  // tall phones and by the leftover vertical space on short/landscape ones.
  const availableWidth = windowWidth - BOARD_H_PADDING * 2;
  const availableHeight = windowHeight - insets.top - insets.bottom
    - HEADER_HEIGHT - SCORE_ROW_HEIGHT - HINT_ROW_HEIGHT - BOARD_V_GAPS;
  // Snap to a whole number of cells so the grid ends flush with the border
  // instead of leaving a fractional sliver on the right/bottom edge.
  const cellSize = Math.max(1, Math.floor(Math.min(availableWidth, availableHeight) / GRID_SIZE));
  const boardSize = cellSize * GRID_SIZE;

  const [snake, setSnake] = useState<Point[]>(initialSnake);
  const [food, setFood] = useState<Point>(() => randomEmptyCell(initialSnake()));
  const [pendingGrowth, setPendingGrowth] = useState(0);
  const [foodEaten, setFoodEaten] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);

  const DIFFICULTY_LABEL: Record<SnakeDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

  const directionRef = useRef<Direction>('right');
  const queuedDirectionRef = useRef<Direction | null>(null);
  // Tracks the touch position (in the gesture's own accumulated-
  // translation coordinate space) as of the LAST direction change, not
  // the start of the whole finger-down gesture. Without this, a single
  // continuous drag could only ever register ONE turn (once 18px of total
  // translation was consumed, every later onUpdate in that same gesture
  // was ignored) — real Snake play is a sequence of quick flicks that
  // often happen without lifting the finger, so each flick needs its own
  // fresh threshold measured from where the PREVIOUS flick left off, not
  // from wherever the finger first touched down.
  const lastTurnX = useSharedValue(0);
  const lastTurnY = useSharedValue(0);

  const queueDirection = useCallback((next: Direction) => {
    if (isOpposite(directionRef.current, next) || directionRef.current === next) return;
    queuedDirectionRef.current = next;
  }, []);

  // Swipe steering, one flick at a time. Dominant axis wins on each
  // measurement; a diagonal resolves to whichever of |dx|/|dy| is larger.
  const panGesture = Gesture.Pan()
    .minDistance(6)
    .onBegin(() => {
      'worklet';
      lastTurnX.value = 0;
      lastTurnY.value = 0;
    })
    .onUpdate(e => {
      'worklet';
      const dx = e.translationX - lastTurnX.value;
      const dy = e.translationY - lastTurnY.value;
      if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
      lastTurnX.value = e.translationX;
      lastTurnY.value = e.translationY;
      const dir: Direction = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      runOnJS(queueDirection)(dir);
    });

  useEffect(() => {
    if (!started || gameOver) return;
    const interval = setInterval(() => {
      if (queuedDirectionRef.current) {
        directionRef.current = queuedDirectionRef.current;
        queuedDirectionRef.current = null;
      }

      setSnake(prevSnake => {
        const head = nextHead(prevSnake[0], directionRef.current);

        if (isOutOfBounds(head) || isSelfCollision(head, prevSnake)) {
          setGameOver(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          playSfx('snakeCrash');
          return prevSnake;
        }

        const ateFood = head.x === food.x && head.y === food.y;
        const body = [head, ...prevSnake];

        if (ateFood) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          playSfx('snakeEat');
          setFoodEaten(n => n + 1);
          setPendingGrowth(g => g + GROWTH_PER_FOOD[difficulty] - 1);
          setFood(randomEmptyCell(body));
          return body;
        }

        if (pendingGrowth > 0) {
          setPendingGrowth(g => g - 1);
          return body;
        }

        body.pop();
        return body;
      });
    }, TICK_MS[difficulty]);
    return () => clearInterval(interval);
  }, [started, gameOver, food, difficulty, pendingGrowth]);

  useEffect(() => {
    if (gameOver && !scoreSubmitted) {
      setScoreSubmitted(true);
      const score = computeSnakeScore({ difficulty, foodEaten, snakeLength: snake.length, startingLength: STARTING_LENGTH });
      submitScore({ gameType: 'snake', difficulty, score, snakeLength: snake.length, snakeFoodEaten: foodEaten });
    }
  }, [gameOver]);

  const handleRestart = () => {
    const fresh = initialSnake();
    setSnake(fresh);
    setFood(randomEmptyCell(fresh));
    directionRef.current = 'right';
    queuedDirectionRef.current = null;
    setPendingGrowth(0);
    setFoodEaten(0);
    setGameOver(false);
    setScoreSubmitted(false);
    setStarted(true);
  };

  const handleStart = () => setStarted(true);

  const snakeCells = new Set(snake.map(p => `${p.x},${p.y}`));
  const headKey = `${snake[0].x},${snake[0].y}`;

  return (
    <ArcadeScreen
      title="SNAKE" musicStopped={gameOver}
      backgroundColors={['#132A1B', '#0F2015', '#0C0819']}
    >
      <View style={{ flex: 1, alignItems: 'center', gap: 16, paddingHorizontal: BOARD_H_PADDING }}>
        <View style={{ height: SCORE_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: ARCADE_TYPO.label, color: ARCADE.textSecondary, fontFamily: ARCADE_FONT_DISPLAY_BOLD }}>Food</Text>
            <Text style={{ fontSize: ARCADE_TYPO.score, color: ARCADE.snake, fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontVariant: ['tabular-nums'] }}>
              {foodEaten}
            </Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: ARCADE_TYPO.label, color: ARCADE.textSecondary, fontFamily: ARCADE_FONT_DISPLAY_BOLD }}>Length</Text>
            <Text style={{ fontSize: ARCADE_TYPO.score, color: ARCADE.textPrimary, fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontVariant: ['tabular-nums'] }}>
              {snake.length}
            </Text>
          </View>
          {/* Difficulty is picked once on the launcher and never shown again
              once you're actually playing — a player who backgrounds the app
              and comes back, or just forgets, has no way to tell current
              speed from Easy/Medium/Hard without dying and checking the
              launcher again. A small pill badge answers "how fast is this"
              without competing with FOOD/LENGTH for primary attention. */}
          <View style={{
            alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 4,
            borderRadius: 10, borderWidth: 1.5, borderColor: ARCADE.snake, backgroundColor: `${ARCADE.snake}22`,
          }}>
            <Text style={{ fontSize: ARCADE_TYPO.label, color: ARCADE.snake, fontFamily: ARCADE_FONT_DISPLAY_BOLD, letterSpacing: 0.4 }}>
              {DIFFICULTY_LABEL[difficulty]}
            </Text>
          </View>
        </View>

        <GestureDetector gesture={panGesture}>
        <View style={{
          width: boardSize, height: boardSize, borderRadius: 20, backgroundColor: '#04120A',
          borderWidth: 2, borderColor: ARCADE.snake, overflow: 'hidden',
          shadowColor: ARCADE.snake, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
        }}>
          {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
            const x = i % GRID_SIZE;
            const y = Math.floor(i / GRID_SIZE);
            const key = `${x},${y}`;
            const isSnakeCell = snakeCells.has(key);
            const isHead = key === headKey;
            const isFood = food.x === x && food.y === y;
            return (
              <View
                key={key}
                style={{
                  position: 'absolute', left: x * cellSize, top: y * cellSize, width: cellSize, height: cellSize,
                  backgroundColor: isHead ? ARCADE.primary : isSnakeCell ? ARCADE.snake : isFood ? ARCADE.ticTacToeO : 'transparent',
                  borderRadius: isFood ? cellSize / 2 : 3,
                  margin: isSnakeCell || isFood ? 1 : 0,
                }}
              />
            );
          })}

          {!started && (
            <View style={{ ...absoluteFillCenter, backgroundColor: 'rgba(12,8,25,0.85)' }}>
              <Pressable onPress={handleStart}>
                <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.heading, color: ARCADE.primary }}>
                  ▶ Tap to start
                </Text>
              </Pressable>
            </View>
          )}
          {gameOver && (
            <View style={{ ...absoluteFillCenter, backgroundColor: 'rgba(12,8,25,0.85)', gap: 12 }}>
              <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: ARCADE_TYPO.display, color: ARCADE.ticTacToeO }}>
                Game over
              </Text>
              <ArcadePrimaryButton label="Play Again" onPress={handleRestart} />
            </View>
          )}
        </View>
        </GestureDetector>

        <Text style={{
          height: HINT_ROW_HEIGHT, textAlignVertical: 'center',
          fontSize: ARCADE_TYPO.label, letterSpacing: 0.4, color: ARCADE.textMuted,
          fontFamily: ARCADE_FONT_DISPLAY_BOLD,
        }}>
          Swipe anywhere on the board to steer
        </Text>
      </View>
    </ArcadeScreen>
  );
}

const absoluteFillCenter = {
  position: 'absolute' as const, left: 0, top: 0, right: 0, bottom: 0,
  alignItems: 'center' as const, justifyContent: 'center' as const,
};
