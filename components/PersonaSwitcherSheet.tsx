/**
 * PersonaSwitcherSheet
 * Matches the gemini-code profileSwitcher layout:
 *  - Grouped rows: Parents / Kids / Seniors
 *  - Active row highlighted with role accent color
 *  - Role badge pill (Parent / Kid / Senior)
 *  - Kids show coin balance + GP bonus
 *  - Parents/Seniors show role description
 *  - PIN gate stub (reserved for future)
 */
import React, { useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  StyleSheet, Pressable,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, FamilyMember } from '@/store/familyStore';
import { BRAND } from './FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from './FamilyAvatar';

// ─── Role palette ─────────────────────────────────────────────────────────────
const ROLE = {
  parent: {
    accent:  BRAND.teal,
    ring:    '#10B981',
    selBg:   '#F0FDF4',
    selBgDk: 'rgba(16,185,129,0.12)',
    selBord: '#10B981',
    badgeBg: '#D1FAE5',
    badgeBgDk: 'rgba(16,185,129,0.2)',
    badgeTx: '#065F46',
    badgeTxDk: '#34D399',
    label:   'Parent',
    desc:    'Executive Parent Mode',
  },
  kid: {
    accent:  BRAND.amber,
    ring:    '#F59E0B',
    selBg:   '#FFFBEB',
    selBgDk: 'rgba(245,158,11,0.12)',
    selBord: '#F59E0B',
    badgeBg: '#FEF3C7',
    badgeBgDk: 'rgba(245,158,11,0.2)',
    badgeTx: '#92400E',
    badgeTxDk: '#FCD34D',
    label:   'Kid',
    desc:    '',
  },
  senior: {
    accent:  BRAND.purple,
    ring:    BRAND.purple,
    selBg:   '#F5F3FF',
    selBgDk: 'rgba(146,97,199,0.12)',
    selBord: BRAND.purple,
    badgeBg: '#EDE9FE',
    badgeBgDk: 'rgba(146,97,199,0.2)',
    badgeTx: '#5B21B6',
    badgeTxDk: '#C4B5FD',
    label:   'Senior',
    desc:    'Bonus Wallet Funder & Driver',
  },
} as const;

// ─── Icons ────────────────────────────────────────────────────────────────────
function UsersIcon({ c }: { c: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Circle cx={9} cy={7} r={4} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M3,21 C3,17 5.7,14 9,14 C12.3,14 15,17 15,21" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Path d="M16,3.1 C17.2,3.5 18,4.7 18,6 C18,7.3 17.2,8.5 16,8.9" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M19,14 C20.7,14.7 22,16.7 22,19" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
function XIcon({ c }: { c: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}
function CheckIcon({ c }: { c: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M5 13l4 4L19 7" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}


// ─── Section header ────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[sl.text, { color: colors.textTertiary }]}>{label}</Text>
  );
}
const sl = StyleSheet.create({
  text: { fontSize: TYPO.micro, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 6, marginTop: 10 },
});

// ─── Member row ────────────────────────────────────────────────────────────────
function MemberRow({ member, isActive, onPress, isDark, siblingNames }: {
  member: FamilyMember; isActive: boolean; onPress: () => void; isDark: boolean; siblingNames: string[];
}) {
  const { colors } = useTheme();
  const rp = ROLE[member.role];

  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const rowBg   = isActive ? (isDark ? rp.selBgDk : rp.selBg) : (isDark ? colors.surface : '#F8FAFC');
  const rowBord = isActive ? rp.selBord : (isDark ? colors.border : '#E2E8F0');

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 18 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 14 }); }}
      onPress={onPress}>
      <Animated.View style={[mr.row, aStyle, { backgroundColor: rowBg, borderColor: rowBord }]}>
        {/* Avatar */}
        <FamilyAvatar
          name={member.name}
          emoji={member.emoji}
          avatarUrl={member.avatarUrl}
          siblings={siblingNames}
          size={44}
          ringColor={rp.ring}
        />

        {/* Info */}
        <View style={mr.info}>
          <Text style={[mr.name, { color: isDark ? colors.textPrimary : '#0F172A' }]} numberOfLines={1}>
            {member.name}
          </Text>
          {member.role === 'kid' ? (
            <Text style={[mr.sub, { color: isDark ? rp.badgeTxDk : rp.accent }]}>
              Store: {member.mainCoins ?? member.coins}🪙{'  '}GP Bonus: {member.gpCoins ?? 0}🪙
            </Text>
          ) : (
            <Text style={[mr.sub, { color: isDark ? colors.textTertiary : '#64748B' }]}>
              {rp.desc}
            </Text>
          )}
        </View>

        {/* Right: badge + checkmark */}
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <View style={[mr.badge, {
            backgroundColor: isDark ? rp.badgeBgDk : rp.badgeBg,
            borderColor: isDark ? rp.accent + '50' : rp.selBord + '80',
          }]}>
            <Text style={[mr.badgeText, { color: isDark ? rp.badgeTxDk : rp.badgeTx }]}>
              {rp.label}
            </Text>
          </View>
          {isActive && (
            <View style={[mr.checkWrap, { backgroundColor: rp.accent }]}>
              <CheckIcon c="#fff" />
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}
const mr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, padding: 12, marginBottom: 8 },
  info:      { flex: 1 },
  name:      { fontSize: TYPO.caption, fontWeight: '800', marginBottom: 2 },
  sub:       { fontSize: TYPO.micro + 1, fontWeight: '600' },
  badge:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: TYPO.micro, fontWeight: '800' },
  checkWrap: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

// ─── Animated sheet ────────────────────────────────────────────────────────────
function Sheet({ visible, onClose, children, colors, isDark }: {
  visible: boolean; onClose: () => void; children: React.ReactNode;
  colors: any; isDark: boolean;
}) {
  const ty = useSharedValue(400);

  useEffect(() => {
    ty.value = visible
      ? withSpring(0, { damping: 22, stiffness: 280 })
      : withTiming(400, { duration: 260 });
  }, [visible]);

  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={sh.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <Animated.View style={[sh.sheet, aStyle, {
          backgroundColor: isDark ? '#131927' : '#FFFFFF',
          borderColor: isDark ? '#1E293B' : '#E2E8F0',
        }]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
const sh = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.72)', justifyContent: 'flex-end' },
  sheet:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, paddingBottom: 40 },
});

// ─── Main export ──────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PersonaSwitcherSheet({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();

  const parents = members.filter(m => m.role === 'parent');
  const kids    = members.filter(m => m.role === 'kid');
  const seniors = members.filter(m => m.role === 'senior');
  const allNames = members.map(m => m.name);

  const select = (id: string) => {
    setActiveMember(id);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} colors={colors} isDark={isDark}>
      {/* Handle */}
      <View style={[ps.handle, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />

      {/* Header */}
      <View style={[ps.header, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <UsersIcon c={BRAND.purple} />
          <Text style={[ps.title, { color: isDark ? colors.textPrimary : '#0F172A' }]}>
            Switch Active Profile
          </Text>
        </View>
        <TouchableOpacity
          style={[ps.closeBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <XIcon c={isDark ? '#94A3B8' : '#64748B'} />
        </TouchableOpacity>
      </View>

      {/* Member list */}
      <ScrollView
        style={{ maxHeight: 480 }}
        contentContainerStyle={ps.list}
        showsVerticalScrollIndicator={false}>

        {parents.length > 0 && (
          <>
            <SectionLabel label="Parents (Approvers & Drivers)" />
            {parents.map(m => (
              <MemberRow key={m.id} member={m} isActive={m.id === activeMemberId}
                isDark={isDark} siblingNames={allNames} onPress={() => select(m.id)} />
            ))}
          </>
        )}

        {kids.length > 0 && (
          <>
            <SectionLabel label="Kids (Quest HQ & Wallets)" />
            {kids.map(m => (
              <MemberRow key={m.id} member={m} isActive={m.id === activeMemberId}
                isDark={isDark} siblingNames={allNames} onPress={() => select(m.id)} />
            ))}
          </>
        )}

        {seniors.length > 0 && (
          <>
            <SectionLabel label="Seniors & Grandparents" />
            {seniors.map(m => (
              <MemberRow key={m.id} member={m} isActive={m.id === activeMemberId}
                isDark={isDark} siblingNames={allNames} onPress={() => select(m.id)} />
            ))}
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const ps = StyleSheet.create({
  handle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, marginBottom: 4 },
  title:    { fontSize: TYPO.body, fontWeight: '900' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  list:     { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
});
