/**
 * UnoHand — the local player's own hand, drawn as an arced fan.
 *
 * Fixes the two things that made the old hand unusable:
 *
 *  1. OVERLAP. The old hand used a fixed -18pt margin on 52pt cards,
 *     leaving 34pt of each card visible and cutting the value glyph in
 *     half. Here the per-card step is COMPUTED: it starts at a generous
 *     value and only tightens (down to a floor that still leaves the
 *     value and its corner pip fully visible) as the hand grows. Partial
 *     overlap is idiomatic; illegible overlap is not.
 *
 *  2. ALIGNMENT. The old ScrollView left a short hand jammed against the
 *     left edge with dead space to its right. `contentContainerStyle`
 *     here uses flexGrow + justifyContent:'center', which centres the
 *     content when it's narrower than the viewport and falls back to
 *     normal left-aligned scrolling when it overflows.
 *
 * Legality is expressed as a real hierarchy: legal cards lift up, gain a
 * glow border and stay fully saturated; illegal ones sit low and dimmed
 * and are genuinely non-interactive (`disabled`), so the affordance and
 * the behaviour agree.
 *
 * The play animation is optimistic and purely visual — see UnoGame.tsx's
 * `submitPlay`, which fires the RPC first and only then starts the flight.
 */
import { useEffect } from 'react';
import { View, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withDelay,
} from 'react-native-reanimated';
import { ARCADE_SPRING, ARCADE_SPRING_BOUNCY } from '../theme/gameTheme';
import { UnoCard, isLegalPlay } from './unoLogic';
import { UnoCardFace, CARD_W } from './UnoCardViews';

// How much of each card must remain visible. The value oval plus its
// top-left corner pip both live inside the leftmost ~46pt of a 66pt card,
// so this floor guarantees the value always reads.
const MIN_VISIBLE = 46;
const MAX_VISIBLE = CARD_W + 6;

export function UnoHand({
  hand, topCard, activeWildColor, isMyTurn, disabled, justDrewCount, onCardPress,
}: {
  hand: UnoCard[];
  topCard: UnoCard | undefined;
  activeWildColor: string | null;
  isMyTurn: boolean;
  disabled: boolean;
  /** How many cards at the END of the hand are newly drawn — they pop in. */
  justDrewCount: number;
  onCardPress: (card: UnoCard, index: number) => void;
}) {
  const { width } = useWindowDimensions();
  const usable = width - 32;

  // Step = visible width per card. Fit the whole hand on screen if we can
  // do so without dropping below MIN_VISIBLE; otherwise clamp at the floor
  // and let the ScrollView scroll.
  const n = hand.length;
  const step = n <= 1
    ? MAX_VISIBLE
    : Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, (usable - CARD_W) / (n - 1)));

  const contentWidth = n === 0 ? 0 : (n - 1) * step + CARD_W;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        // flexGrow + center => centred when short, scrollable when long.
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 22,
        paddingBottom: 6,
      }}
    >
      <View style={{ width: contentWidth, height: 130 }}>
        {hand.map((card, i) => {
          const legal = isMyTurn && topCard ? isLegalPlay(card, topCard, activeWildColor) : false;
          // Arc: cards toward the edges tilt out and sit slightly lower,
          // which is what turns a flat row into a held fan.
          const mid = (n - 1) / 2;
          const offset = n === 1 ? 0 : (i - mid) / Math.max(mid, 1);
          const angle = offset * 9;
          const dip = Math.abs(offset) * Math.abs(offset) * 14;

          return (
            <HandCard
              key={`${card.color}:${card.value}:${i}`}
              card={card}
              left={i * step}
              angle={angle}
              dip={dip}
              legal={legal}
              dimmed={isMyTurn && !legal}
              disabled={disabled || !legal}
              isNew={i >= n - justDrewCount}
              onPress={() => onCardPress(card, i)}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

function HandCard({
  card, left, angle, dip, legal, dimmed, disabled, isNew, onPress,
}: {
  card: UnoCard; left: number; angle: number; dip: number;
  legal: boolean; dimmed: boolean; disabled: boolean; isNew: boolean;
  onPress: () => void;
}) {
  const lift = useSharedValue(legal ? 1 : 0);
  const press = useSharedValue(1);
  const enter = useSharedValue(isNew ? 0 : 1);

  useEffect(() => {
    lift.value = withSpring(legal ? 1 : 0, ARCADE_SPRING);
  }, [legal]);

  useEffect(() => {
    if (isNew) {
      // Newly drawn card pops in from below with a small bounce.
      enter.value = 0;
      enter.value = withDelay(60, withSpring(1, ARCADE_SPRING_BOUNCY));
    } else {
      enter.value = 1;
    }
  }, [isNew]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: dip - lift.value * 16 + (1 - enter.value) * 44 },
      { rotate: `${angle}deg` },
      { scale: press.value * (0.9 + enter.value * 0.1) },
    ],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', left, bottom: 0 }, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => { press.value = withSpring(0.94, ARCADE_SPRING); }}
        onPressOut={() => { press.value = withSpring(1, ARCADE_SPRING); }}
        accessibilityRole="button"
        accessibilityLabel={`${card.color} ${card.value}${legal ? ', playable' : ''}`}
        accessibilityState={{ disabled }}
        hitSlop={{ top: 8, bottom: 8 }}
      >
        <UnoCardFace card={card} dimmed={dimmed} highlighted={legal} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * FlyingCard — the visual "throw" of a card from the hand toward the
 * discard pile. Mounted by UnoGame.tsx AFTER the RPC has already been
 * fired, purely as a flourish, and unmounted by its own onDone. It never
 * gates, delays or reorders the real move.
 *
 * Deliberately simplified physics: a single spring on translate + rotate +
 * scale, from an approximate hand position to the table centre. Real
 * per-card measured geometry (onLayout of each fan card, measured against
 * the pile) was not worth the complexity for a ~350ms flourish.
 */
export function FlyingCard({
  card, fromX, fromY, toX, toY, onDone,
}: {
  card: UnoCard; fromX: number; fromY: number; toX: number; toY: number; onDone: () => void;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withSpring(1, { damping: 15, stiffness: 130 });
    const t = setTimeout(onDone, 480);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    // Arc: the card rises above the straight line at the midpoint, so it
    // reads as thrown onto the table rather than slid across it.
    transform: [
      { translateX: fromX + (toX - fromX) * p.value },
      { translateY: fromY + (toY - fromY) * p.value - Math.sin(p.value * Math.PI) * 46 },
      { rotate: `${p.value * 340}deg` },
      { scale: 1 - p.value * 0.18 },
    ],
    opacity: p.value > 0.92 ? 0 : 1,
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, zIndex: 50 }, style]}>
      <UnoCardFace card={card} size={1.1} />
    </Animated.View>
  );
}
