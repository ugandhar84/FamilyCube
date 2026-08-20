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
import { useFamilyStore } from '@/store/familyStore';
import { LETTER_SPACING } from '@/constants/theme';
import { IconCubeMark, BRAND } from './FamilyCubeLogo';
import PersonaSwitcherDropdown from './PersonaSwitcherDropdown';

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

function GearIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} fill="none" />
      <Path
        d="M19.4,13 C19.5,12.7 19.5,12.3 19.4,12 L21,10.5 L19,7.5 L17,8.2 C16.5,7.8 16,7.5 15.4,7.3 L15,5.2 L11,5.2 L10.6,7.3 C10,7.5 9.5,7.8 9,8.2 L7,7.5 L5,10.5 L6.6,12 C6.5,12.3 6.5,12.7 6.6,13 L5,14.5 L7,17.5 L9,16.8 C9.5,17.2 10,17.5 10.6,17.7 L11,19.8 L15,19.8 L15.4,17.7 C16,17.5 16.5,17.2 17,16.8 L19,17.5 L21,14.5 Z"
        stroke={color} strokeWidth={1.6} strokeLinejoin="round" fill="none"
      />
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
  teen:   { label: 'TEEN MODE',   color: BRAND.pink },
  senior: { label: 'SENIOR MODE', color: BRAND.purple },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface AppHeaderProps {
  memberName?:      string;
  memberRole?:      'parent' | 'kid' | 'teen' | 'senior';
  notifCount?:      number;
  onPersonaPress?:  () => void;
  onBellPress?:     () => void;
  // Only passed by roles that don't have a dedicated Profile/settings tab in
  // their bottom nav (currently: senior/GP, which trades that tab slot for
  // Memories) — omitted everywhere else so the icon doesn't appear twice.
  onSettingsPress?: () => void;
}

function RefreshIcon({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Path d="M23 4v6h-6M1 20v-6h6" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M3.5 9A9 9 0 0121 15M20.5 15A9 9 0 013 9" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export default function AppHeader({
  memberName    = 'Member',
  memberRole    = 'parent',
  notifCount    = 0,
  onPersonaPress,
  onBellPress,
  onSettingsPress,
}: AppHeaderProps) {
  const { colors, isDark } = useTheme();
  const { familyName } = useFamilyStore();
  const role = ROLE_CONFIG[memberRole] ?? ROLE_CONFIG.parent;
  const [showSwitcher, setShowSwitcher] = React.useState(false);
  const initial = (memberName.trim()[0] ?? '?').toUpperCase();

  const handlePersonaPress = () => {
    setShowSwitcher(v => !v);
    onPersonaPress?.();
  };

  return (
    <View style={{ position: 'relative', zIndex: 30 }}>
    <View style={[s.bar, { backgroundColor: colors.background }]}>

      {/* LEFT: persona header (two-line: name+mode, family+switch) — the
          animated cube mark used to live here; it's reserved for loading
          states now instead, so the header leads straight with identity. */}
      <View style={s.left}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
          onPress={handlePersonaPress}
          activeOpacity={0.75}
        >
          <View style={{ position: 'relative' }}>
            <View style={{
              width: 34, height: 34, borderRadius: 11,
              backgroundColor: role.color, alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>{initial}</Text>
            </View>
            <View style={{
              position: 'absolute', bottom: -2, right: -2, width: 11, height: 11, borderRadius: 6,
              backgroundColor: colors.success, borderWidth: 2, borderColor: colors.background,
            }} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[s.pillName, { color: colors.textPrimary, maxWidth: undefined }]} numberOfLines={1}>
                {memberName}
              </Text>
              <View style={{ backgroundColor: role.color + '18', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: LETTER_SPACING.badge, color: role.color }}>{role.label}</Text>
              </View>
              <View style={{
                width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.surface,
                transform: [{ rotate: showSwitcher ? '180deg' : '0deg' }],
              }}>
                <ChevronDown color={colors.textSecondary} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>{familyName}</Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>·</Text>
              <RefreshIcon color={colors.primary} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Switch Profile</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* RIGHT: settings (only for roles without a Profile tab) + bell */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onSettingsPress && (
          <TouchableOpacity
            style={[s.bell, { backgroundColor: isDark ? 'rgba(155,125,212,0.22)' : '#F0E8FA' }]}
            onPress={onSettingsPress}
            activeOpacity={0.8}
          >
            <GearIcon color={BRAND.purple} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.bell, { backgroundColor: isDark ? 'rgba(245,166,35,0.22)' : '#FEF0D3' }]}
          onPress={onBellPress}
          activeOpacity={0.8}
        >
          <BellIcon color={BRAND.amber} />
          {notifCount > 0 && <View style={s.badge} />}
        </TouchableOpacity>
      </View>
    </View>

    <PersonaSwitcherDropdown visible={showSwitcher} onClose={() => setShowSwitcher(false)} />
    </View>
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
