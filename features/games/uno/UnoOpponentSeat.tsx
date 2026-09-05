/**
 * UnoOpponentSeat — one opponent around the table edge.
 *
 * An opponent's actual cards are NEVER available to this client
 * (uno_players_public redacts every hand but the caller's own, by design
 * — see the note in gameStore.ts), so this renders the only thing that
 * genuinely is known: handCount. It's drawn as a real overlapping fan of
 * card BACKS with a slight per-card rotation, so hand size is legible as
 * physical stacking depth rather than as a number alone. Above a cap the
 * fan stops growing and the numeric count carries the rest — otherwise a
 * 15-card hand would run off the seat's width.
 *
 * "Their turn" is a Reanimated pulse on the seat's glow ring rather than a
 * static border, so at a glance you can see whose turn it is without
 * reading any text.
 */
import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring,
} from 'react-native-reanimated';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_FONT_DISPLAY_EXTRABOLD, ARCADE_TYPO, ARCADE_SPRING } from '../theme/gameTheme';
import { UnoCardBack } from './UnoCardViews';

// Max card-backs drawn in a fan. Beyond this the fan is visually "full"
// and the count label communicates the remainder.
const MAX_FAN = 7;
const FAN_SCALE = 0.42;
const FAN_STEP = 12; // horizontal pt between successive backs

export function UnoOpponentSeat({
  name, handCount, isTurn, hasCalledUno, isAi, aiDifficulty, compact = false,
}: {
  name: string;
  handCount: number;
  isTurn: boolean;
  hasCalledUno: boolean;
  isAi: boolean;
  aiDifficulty: string | null;
  compact?: boolean;
}) {
  const pulse = useSharedValue(0);
  const lift = useSharedValue(0);

  useEffect(() => {
    if (isTurn) {
      pulse.value = withRepeat(
        withSequence(withTiming(1, { duration: 620 }), withTiming(0.25, { duration: 620 })),
        -1,
        true,
      );
      lift.value = withSpring(1, ARCADE_SPRING);
    } else {
      pulse.value = withTiming(0, { duration: 220 });
      lift.value = withSpring(0, ARCADE_SPRING);
    }
  }, [isTurn]);

  const seatStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.15 + pulse.value * 0.7,
    shadowRadius: 6 + pulse.value * 12,
    borderColor: isTurn ? ARCADE.uno : ARCADE.line,
    transform: [{ scale: 1 + lift.value * 0.04 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({ opacity: pulse.value * 0.9 }));

  const fanCount = Math.max(1, Math.min(handCount, MAX_FAN));
  const scale = compact ? FAN_SCALE * 0.86 : FAN_SCALE;
  const step = compact ? FAN_STEP * 0.86 : FAN_STEP;

  return (
    <Animated.View
      style={[
        {
          alignItems: 'center',
          gap: 5,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 18,
          borderWidth: 1.5,
          backgroundColor: 'rgba(23,17,38,0.72)',
          shadowColor: ARCADE.uno,
          shadowOffset: { width: 0, height: 0 },
          minWidth: 112,
        },
        seatStyle,
      ]}
    >
      {/* Soft inner glow layer — fades in and out with the turn pulse. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
            borderRadius: 18, backgroundColor: 'rgba(255,90,60,0.14)',
          },
          ringStyle,
        ]}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: ARCADE_FONT_DISPLAY_BOLD,
            fontSize: ARCADE_TYPO.body,
            color: isTurn ? ARCADE.textPrimary : ARCADE.textSecondary,
            maxWidth: 96,
          }}
        >
          {name}
        </Text>
        {isAi && <AiBadge difficulty={aiDifficulty} />}
      </View>

      {/* The fan. Each back is nudged right by `step` and rotated a little
          further than the last, pivoting from its bottom edge so the fan
          splays like held cards rather than shearing sideways. */}
      <View
        style={{
          height: 96 * scale + 10,
          width: (fanCount - 1) * step + 66 * scale,
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        {Array.from({ length: fanCount }, (_, i) => {
          const mid = (fanCount - 1) / 2;
          const angle = fanCount === 1 ? 0 : (i - mid) * 7;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: i * step,
                transform: [{ rotate: `${angle}deg` }, { translateY: Math.abs(i - mid) * 1.5 }],
              }}
            >
              <UnoCardBack size={scale} />
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text
          style={{
            fontSize: ARCADE_TYPO.label,
            fontWeight: '700',
            letterSpacing: 1.2,
            color: handCount === 1 ? ARCADE.uno : ARCADE.textMuted,
            fontVariant: ['tabular-nums'],
          }}
        >
          {handCount} {handCount === 1 ? 'card' : 'cards'}
        </Text>
        {hasCalledUno && handCount === 1 && <UnoShoutChip />}
      </View>
    </Animated.View>
  );
}

function AiBadge({ difficulty }: { difficulty: string | null }) {
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 6,
        backgroundColor: 'rgba(165,107,255,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(165,107,255,0.45)',
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontWeight: '800',
          letterSpacing: 0.8,
          color: ARCADE.memory,
        }}
      >
        {(difficulty ?? 'ai').slice(0, 4).toUpperCase()}
      </Text>
    </View>
  );
}

function UnoShoutChip() {
  const s = useSharedValue(0.8);
  useEffect(() => {
    s.value = withRepeat(withSequence(withTiming(1.1, { duration: 380 }), withTiming(0.9, { duration: 380 })), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View
      style={[
        { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: ARCADE.uno },
        style,
      ]}
    >
      <Text style={{ fontFamily: ARCADE_FONT_DISPLAY_EXTRABOLD, fontSize: 9, color: '#fff', letterSpacing: 0.6 }}>UNO!</Text>
    </Animated.View>
  );
}
