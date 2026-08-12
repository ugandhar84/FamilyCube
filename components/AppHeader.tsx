/**
 * AppHeader
 * Used on every screen: brand logo+name | persona switcher pill | notification bell
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { CubeMark, BRAND } from './FamilyCubeLogo';

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

// ── Header wordmark (horizontal, compact) ────────────────────────────────────

function HeaderWordmark({ textColor }: { textColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={[s.wFamily, { color: textColor }]}>Family </Text>
      <Text style={s.wCube}>
        <Text style={{ color: BRAND.teal   }}>C</Text>
        <Text style={{ color: BRAND.amber  }}>u</Text>
        <Text style={{ color: BRAND.pink   }}>b</Text>
        <Text style={{ color: BRAND.purple }}>e</Text>
      </Text>
    </View>
  );
}

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  parent: { label: 'PARENT MODE', color: BRAND.teal },
  kid:    { label: 'KID MODE',    color: BRAND.amber },
  senior: { label: 'SENIOR MODE', color: BRAND.purple },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface AppHeaderProps {
  memberName?:   string;
  memberRole?:   'parent' | 'kid' | 'senior';
  notifCount?:   number;
  onPersonaPress?: () => void;
  onBellPress?:  () => void;
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

  return (
    <View style={[s.bar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>

      {/* LEFT: cube mark + wordmark */}
      <View style={s.left}>
        <CubeMark size={30} uid="hdr" />
        <HeaderWordmark textColor={colors.textPrimary} />
      </View>

      {/* RIGHT: persona pill + bell */}
      <View style={s.right}>

        {/* Persona switcher */}
        <TouchableOpacity
          style={[s.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={onPersonaPress}
          activeOpacity={0.75}
        >
          {/* Avatar ring */}
          <View style={[s.avatarRing, { borderColor: role.color }]}>
            <PersonIcon color={colors.textSecondary} />
          </View>

          {/* Name + role */}
          <View>
            <Text style={[s.pillName, { color: colors.textPrimary }]} numberOfLines={1}>
              {memberName}
            </Text>
            <Text style={[s.pillRole, { color: role.color }]}>{role.label}</Text>
          </View>

          <ChevronDown color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Notification bell */}
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
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  wCube: {
    fontSize: 17,
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
