/**
 * AppHeader
 * Left:  cube (dice-roll → settle → pulse loop) + "Family Cube" scales in
 * Right: persona switcher pill | notification bell
 * Heart replaces the dot of the "i" in "Family" (dotless ı + absolute SVG).
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withDelay, withSpring, withTiming, withSequence, withRepeat,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/ThemeContext';
import { IconCubeMark, BRAND } from './FamilyCubeLogo';
import PersonaSwitcherSheet from './PersonaSwitcherSheet';

// ── Icons ─────────────────────────────────────────────────────────────────────

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M18,16 L18,11 C18,7.7 16.4,5 13,4.2 L13,3.5 C13,2.7 12.6,2 12,2 C11.4,2 11,2.7 11,3.5 L11,4.2 C7.6,5 6,7.7 6,11 L6,16 L4,18 L20,18 Z"
        fill={color}
      />
      <Path d="M12,22 C13.1,22 14,21.1 14,20 L10,20 C10,21.1 10.9,22 12,22 Z" fill={color} />
    </Svg>
  );
}

function ChevronDown({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M6,9 L12,15 L18,9" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function PersonIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} fill={color} />
      <Path d="M4,20 C4,16 7.6,13 12,13 C16.4,13 20,16 20,20" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ── Animated cube: dice roll → settle → gentle pulse loop ────────────────────

function AnimatedCubeMark({ size = 30 }: { size?: number }) {
  const rotate = useSharedValue(-360);
  const scale  = useSharedValue(0.4);
  const op     = useSharedValue(0);

  useEffect(() => {
    op.value = withTiming(1, { duration: 200 });
    // Roll → pause 8s → snap back → roll again, forever
    rotate.value = withRepeat(
      withSequence(
        withTiming(0,    { duration: 500, easing: Easing.out(Easing.cubic) }),
        withDelay(8000, withTiming(-360, { duration: 1 })),
      ),
      -1, false,
    );
    // Scale: spring in, then soft pulse loop
    scale.value = withSequence(
      withSpring(1, { damping: 8, stiffness: 180 }),
      withDelay(200, withRepeat(
        withSequence(
          withTiming(1.08, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1,    { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withDelay(1800, withTiming(1, { duration: 1 })),
        ),
        -1, false,
      )),
    );
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ rotate: `${rotate.value}deg` }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={aStyle}>
      <IconCubeMark size={size} />
    </Animated.View>
  );
}

// ── Brand name: scales + fades in; heart on dotless ı ────────────────────────

function AnimatedBrandName({ textColor }: { textColor: string }) {
  const scale = useSharedValue(0.7);
  const op    = useSharedValue(0);

  useEffect(() => {
    op.value    = withDelay(300, withTiming(1,  { duration: 350 }));
    scale.value = withDelay(300, withSpring(1, { damping: 14, stiffness: 160 }));
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scale: scale.value }],
  }));

  const FONT     = 17;
  const HEART_SZ = 7;
  // At 17px bold: "Famı" ≈ 30px; heart center ≈ 30px from left
  const HEART_LEFT = 29;
  const HEART_TOP  = 2;

  return (
    <Animated.View style={aStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <View style={{ position: 'relative' }}>
          <Svg
            width={HEART_SZ} height={HEART_SZ} viewBox="0 0 20 18"
            style={{ position: 'absolute', left: HEART_LEFT, top: HEART_TOP, zIndex: 1 }}
          >
            <Path
              d="M10,16 C7,13 0,9 0,5 C0,0 5,-1 10,6 C15,-1 20,0 20,5 C20,9 13,13 10,16 Z"
              fill="#D4870A"
            />
          </Svg>
          <Text style={[s.wFamily, { color: textColor, fontSize: FONT }]}>Famıly </Text>
        </View>
        <Text style={[s.wCube, { fontSize: FONT }]}>
          <Text style={{ color: BRAND.teal   }}>C</Text>
          <Text style={{ color: BRAND.amber  }}>u</Text>
          <Text style={{ color: BRAND.pink   }}>b</Text>
          <Text style={{ color: BRAND.purple }}>e</Text>
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  parent: { label: 'PARENT MODE', color: BRAND.teal },
  kid:    { label: 'KID MODE',    color: BRAND.amber },
  teen:   { label: 'TEEN MODE',   color: BRAND.amber },
  senior: { label: 'SENIOR MODE', color: BRAND.purple },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface AppHeaderProps {
  memberName?:     string;
  memberRole?:     'parent' | 'kid' | 'teen' | 'senior';
  notifCount?:     number;
  onPersonaPress?: () => void;
  onBellPress?:    () => void;
}

export default function AppHeader({
  memberName    = 'Member',
  memberRole    = 'parent',
  notifCount    = 0,
  onPersonaPress,
  onBellPress,
}: AppHeaderProps) {
  const { colors, isDark } = useTheme();
  const role = ROLE_CONFIG[memberRole] ?? ROLE_CONFIG.parent;
  const [showSwitcher, setShowSwitcher] = React.useState(false);

  const handlePersonaPress = () => {
    setShowSwitcher(true);
    onPersonaPress?.();
  };

  return (
    <>
    <PersonaSwitcherSheet visible={showSwitcher} onClose={() => setShowSwitcher(false)} />
    <View style={[s.bar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>

      {/* LEFT: cube icon + persona pill */}
      <View style={s.left}>
        <AnimatedCubeMark size={36} />

        <TouchableOpacity
          style={[s.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handlePersonaPress}
          activeOpacity={0.75}
        >
          <View style={[s.avatarRing, { borderColor: role.color }]}>
            <PersonIcon color={colors.textSecondary} />
          </View>
          <View>
            <Text style={[s.pillName, { color: colors.textPrimary }]} numberOfLines={1}>
              {memberName}
            </Text>
            <Text style={[s.pillRole, { color: role.color }]}>{role.label}</Text>
          </View>
          <ChevronDown color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* RIGHT: bell only */}
      <TouchableOpacity
        style={[s.bell, { backgroundColor: isDark ? 'rgba(245,166,35,0.22)' : '#FEF0D3' }]}
        onPress={onBellPress}
        activeOpacity={0.8}
      >
        <BellIcon color={BRAND.amber} />
        {notifCount > 0 && <View style={s.badge} />}
      </TouchableOpacity>
    </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wFamily: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  wCube: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 50,
    borderWidth: 1,
  },
  avatarRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillName: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
    maxWidth: 72,
  },
  pillRole: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    lineHeight: 12,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
