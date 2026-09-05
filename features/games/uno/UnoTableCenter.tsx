/**
 * UnoTableCenter — the draw pile + discard pile cluster that sits at the
 * middle of the felt.
 *
 * Both piles are deliberately drawn as STACKS (a few offset shadow cards
 * under the visible top card) rather than as single flat rectangles, so
 * the table centre reads as a physical deck. The discard's top card wears
 * a coloured glow matching its own colour (or the active wild colour, when
 * a wild is on top and a colour has been chosen), which is also the
 * clearest possible answer to "what can I play right now".
 *
 * The pending-draw stack (+2/+4 chained) gets a pulsing badge over the
 * draw pile AND replaces the pile's own caption ("N left" -> "Draw N or
 * play a Draw card") — it's the single most consequential piece of state
 * when it's non-zero, and a bare number badge doesn't tell a real player
 * either what tapping the pile does or that stacking another Draw card is
 * the way out. The accessibility label carries the same explanation.
 *
 * Purely presentational: `onDrawPress` is handed straight through to the
 * owner, which fires the real RPC. Nothing here delays or gates that call.
 */
import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring,
} from 'react-native-reanimated';
import { ARCADE, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO, ARCADE_SPRING_BOUNCY } from '../theme/gameTheme';
import { UnoCard, UNO_COLOR_HEX } from './unoLogic';
import { UnoCardFace, UnoCardBack, CARD_W, CARD_H } from './UnoCardViews';

const PILE_SCALE = 1.25;

export function UnoTableCenter({
  topCard, activeWildColor, drawPileCount, pendingDrawCount, canDraw, direction, onDrawPress,
}: {
  topCard: UnoCard | undefined;
  activeWildColor: string | null;
  drawPileCount: number;
  pendingDrawCount: number;
  canDraw: boolean;
  direction: 1 | -1;
  onDrawPress: () => void;
}) {
  const w = CARD_W * PILE_SCALE;
  const h = CARD_H * PILE_SCALE;

  // Colour of the glow behind the discard's top card: the chosen wild
  // colour wins when one is active, otherwise the card's own colour.
  const glowColor = activeWildColor
    ? UNO_COLOR_HEX[activeWildColor as UnoCard['color']]
    : topCard
      ? UNO_COLOR_HEX[topCard.color]
      : ARCADE.uno;

  // The discard top card "lands" with a small spring whenever it changes —
  // this is what makes an opponent's or AI's play visible on this client
  // even though the play itself happened on the server.
  const landKey = topCard ? `${topCard.color}:${topCard.value}:${activeWildColor ?? ''}` : 'none';
  const land = useSharedValue(1);
  useEffect(() => {
    land.value = 0.82;
    land.value = withSpring(1, ARCADE_SPRING_BOUNCY);
  }, [landKey]);
  const landStyle = useAnimatedStyle(() => ({ transform: [{ scale: land.value }] }));

  // Draw pile invitation: a gentle breathing scale while it's actually
  // tappable, dead still when it isn't.
  const invite = useSharedValue(1);
  useEffect(() => {
    if (canDraw) {
      invite.value = withRepeat(withSequence(withTiming(1.05, { duration: 780 }), withTiming(1, { duration: 780 })), -1, true);
    } else {
      invite.value = withTiming(1, { duration: 200 });
    }
  }, [canDraw]);
  const inviteStyle = useAnimatedStyle(() => ({ transform: [{ scale: invite.value }] }));

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
        {/* ── Draw pile ── */}
        <Pressable
          onPress={onDrawPress}
          disabled={!canDraw}
          accessibilityRole="button"
          accessibilityLabel={
            pendingDrawCount > 0
              ? `Draw ${pendingDrawCount} penalty cards. You can play a matching Draw card instead to pass the penalty on.`
              : `Draw a card. ${drawPileCount} remaining`
          }
        >
          <Animated.View style={[{ width: w, height: h }, inviteStyle]}>
            <StackShadows width={w} height={h} depth={Math.min(3, Math.max(1, Math.ceil(drawPileCount / 12)))} />
            <View style={{ opacity: canDraw ? 1 : 0.55 }}>
              <UnoCardBack size={PILE_SCALE} />
            </View>
            {canDraw && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute', left: -3, right: -3, top: -3, bottom: -3,
                  borderRadius: 13, borderWidth: 2,
                  borderColor: pendingDrawCount > 0 ? ARCADE.uno : 'rgba(255,176,32,0.6)',
                }}
              />
            )}
            {pendingDrawCount > 0 && <PendingDrawBadge count={pendingDrawCount} />}
          </Animated.View>
          {/* A bare "+2" badge with no caption leaves a real player guessing
              what tapping the pile actually does, and whether there's any
              way out of it — this is the single most consequential piece
              of hidden state on the table (per the file header), so it
              gets the ONE line of table text that explains the mechanic
              instead of just a number. */}
          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{
              marginTop: 6, textAlign: 'center', width: w + 24,
              fontSize: ARCADE_TYPO.label, fontWeight: '700',
              letterSpacing: pendingDrawCount > 0 ? 0.2 : 1.2,
              color: pendingDrawCount > 0 ? ARCADE.uno : ARCADE.textMuted,
              fontVariant: ['tabular-nums'],
            }}
          >
            {pendingDrawCount > 0
              ? `Draw ${pendingDrawCount} or play a Draw card`
              : `${drawPileCount} left`}
          </Text>
        </Pressable>

        {/* ── Discard pile ── */}
        <View>
          <Animated.View style={[{ width: w, height: h }, landStyle]}>
            {/* Coloured halo behind the top card. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', left: -10, right: -10, top: -10, bottom: -10,
                borderRadius: 20, backgroundColor: glowColor, opacity: 0.22,
              }}
            />
            <StackShadows width={w} height={h} depth={3} scattered />
            {topCard ? (
              <View
                style={{
                  shadowColor: glowColor,
                  shadowOpacity: 0.9,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 0 },
                }}
              >
                <UnoCardFace card={topCard} size={PILE_SCALE} />
              </View>
            ) : (
              <View
                style={{
                  width: w, height: h, borderRadius: 12,
                  borderWidth: 2, borderStyle: 'dashed', borderColor: ARCADE.line,
                }}
              />
            )}
            {/* Chosen-wild-colour chip, only meaningful when a wild is on top. */}
            {activeWildColor && topCard && topCard.color === 'wild' && (
              <View
                style={{
                  position: 'absolute', bottom: -7, right: -7, width: 22, height: 22, borderRadius: 11,
                  backgroundColor: UNO_COLOR_HEX[activeWildColor as UnoCard['color']],
                  borderWidth: 2.5, borderColor: '#0E0918',
                }}
              />
            )}
          </Animated.View>
          <Text
            style={{
              marginTop: 6, textAlign: 'center', fontSize: ARCADE_TYPO.label, fontWeight: '700',
              letterSpacing: 1.2, color: ARCADE.textMuted,
            }}
          >
            {direction === -1 ? '⇄ Reversed' : 'In play'}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Offset ghost cards under a pile, giving it apparent depth. */
function StackShadows({ width, height, depth, scattered = false }: { width: number; height: number; depth: number; scattered?: boolean }) {
  return (
    <>
      {Array.from({ length: depth }, (_, i) => {
        const d = depth - i;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width, height,
              borderRadius: 12,
              backgroundColor: i % 2 === 0 ? '#241B47' : '#1B1436',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              transform: scattered
                ? [{ translateX: d * 1.5 * (i % 2 === 0 ? 1 : -1) }, { translateY: d * 1.5 }, { rotate: `${d * (i % 2 === 0 ? 3 : -3)}deg` }]
                : [{ translateX: d * 2 }, { translateY: d * 2 }],
            }}
          />
        );
      })}
    </>
  );
}

function PendingDrawBadge({ count }: { count: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withSequence(withTiming(1.18, { duration: 420 }), withTiming(1, { duration: 420 })), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute', top: -12, right: -14,
          paddingHorizontal: 9, paddingVertical: 3,
          borderRadius: 12,
          backgroundColor: ARCADE.uno,
          borderWidth: 2, borderColor: '#0E0918',
          shadowColor: ARCADE.uno, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: 14, color: '#fff' }}>+{count}</Text>
    </Animated.View>
  );
}
