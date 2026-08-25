/**
 * PersonaSwitcherSheet — gaming-mode profile switcher with PIN gate.
 * Tapping a PIN-protected profile slides to an in-sheet PIN pad.
 * Correct PIN → switch. Wrong → shake + clear.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { router } from 'expo-router';
import {
  View, Text, Modal, TouchableOpacity, ScrollView, Pressable,
  TextInput, Animated as RNAnimated,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence } from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, FamilyMember } from '@/store/familyStore';
import { BRAND } from './FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from './FamilyAvatar';

// ─── Role theming ─────────────────────────────────────────────────────────────

const ROLE_THEME: Record<string, { accent: string; bg: string; darkBg: string }> = {
  parent: { accent: BRAND.teal,   bg: '#D6F5EE', darkBg: '#0C2E28' },
  kid:    { accent: BRAND.amber,  bg: '#FFF0CC', darkBg: '#2A1C00' },
  teen:   { accent: BRAND.pink,   bg: '#FCE4F1', darkBg: '#3A0F26' },
  senior: { accent: BRAND.purple, bg: '#EDE4FF', darkBg: '#1C0E30' },
};

function accent(role: string) { return ROLE_THEME[role]?.accent ?? BRAND.purple; }

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon({ c }: { c: string }) {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Path d="M5 13l4 4L19 7" stroke={c} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function LockIcon({ c, size = 9 }: { c: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 11V7a4 4 0 018 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z"
        stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function XIcon({ c }: { c: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}
function UsersIcon({ c }: { c: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Circle cx={9} cy={7} r={4} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M3,21 C3,17 5.7,14 9,14 C12.3,14 15,17 15,21" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Path d="M16,3.1 C17.2,3.5 18,4.7 18,6 C18,7.3 17.2,8.5 16,8.9" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M19,14 C20.7,14.7 22,16.7 22,19" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
function BackspaceIcon({ c }: { c: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M18 9l-6 6M12 9l6 6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ArrowIcon({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M19 12H5M12 5l-7 7 7 7" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Coin badge ───────────────────────────────────────────────────────────────

function CoinBadge({ icon, amount, label, color, isDark }: {
  icon: string; amount: number; label: string; color: string; isDark: boolean;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: color + (isDark ? '25' : '18'),
      borderRadius: 10,
      borderWidth: 1, borderColor: color + '50',
      paddingVertical: 5, alignItems: 'center',
    }}>
      <Text style={{ fontSize: 13 }}>{icon}</Text>
      <Text style={{ fontSize: 13, fontWeight: '900', color, letterSpacing: -0.5, lineHeight: 16 }}>
        {amount}
      </Text>
      <Text style={{ fontSize: 9, fontWeight: '600', color: color + 'AA', letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

function StatPill({ label, value, ac }: { label: string; value: string | number; ac: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: ac + '22',
      borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
    }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: ac }}>{value}</Text>
      <Text style={{ fontSize: 9.5, fontWeight: '600', color: ac + 'AA' }}>{label}</Text>
    </View>
  );
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({ member, isActive, onPress, isDark, allNames }: {
  member: FamilyMember; isActive: boolean; onPress: () => void;
  isDark: boolean; allNames: string[];
}) {
  const ac      = accent(member.role);
  const theme   = ROLE_THEME[member.role] ?? ROLE_THEME.senior;
  const subLabel = member.subRole
    ?? (member.role === 'senior' ? 'Grandparent' : member.role === 'parent' ? 'Parent' : member.role === 'teen' ? 'Teen' : 'Kid');

  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const cardBg = isActive
    ? (isDark ? theme.darkBg : theme.bg)
    : (isDark ? '#111827' : ac + '0A');

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={() => { scale.value = withTiming(0.96, { duration: 70 }); }}
      onPressOut={() => { scale.value = withTiming(1.00, { duration: 120 }); }}
      onPress={onPress}
    >
      <Animated.View style={[aStyle, {
        borderRadius: 16,
        borderWidth: isActive ? 2 : 1,
        borderColor: isActive ? ac : (isDark ? ac + '35' : ac + '40'),
        backgroundColor: cardBg,
        overflow: 'hidden',
      }]}>
        {/* Role accent top strip */}
        <View style={{ height: 3, backgroundColor: ac, opacity: isActive ? 1 : 0.4 }} />

        <View style={{ padding: 12, gap: 10 }}>
          {/* Avatar row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ position: 'relative' }}>
              <FamilyAvatar
                name={member.name}
                emoji={member.emoji}
                avatarUrl={member.avatarUrl}
                siblings={allNames}
                size={46}
                ringColor={isActive ? ac : ac + '70'}
                ringWidth={isActive ? 2.5 : 1.5}
                bgColor={ac + (isDark ? '28' : '18')}
              />
              {isActive && (
                <View style={{
                  position: 'absolute', bottom: -1, right: -1,
                  width: 16, height: 16, borderRadius: 8, backgroundColor: ac,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: isDark ? '#0A1220' : '#fff',
                }}>
                  <CheckIcon c="#fff" />
                </View>
              )}
              {member.pinEnabled && !isActive && (
                <View style={{
                  position: 'absolute', bottom: -1, right: -1,
                  width: 16, height: 16, borderRadius: 8,
                  backgroundColor: isDark ? '#1A2840' : '#E8EEF8',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: isDark ? '#334155' : '#C8D4EC',
                }}>
                  <LockIcon c={isDark ? '#94A3B8' : '#6B7FA3'} />
                </View>
              )}
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{
                fontSize: 14, fontWeight: '800',
                color: isActive ? ac : (isDark ? '#E2EAF8' : '#0A1628'),
                letterSpacing: -0.3,
              }} numberOfLines={1}>
                {member.name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{
                  backgroundColor: isActive ? ac : (ac + (isDark ? '30' : '20')),
                  borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
                }}>
                  <Text style={{
                    fontSize: 10, fontWeight: '700',
                    color: isActive ? '#fff' : ac, letterSpacing: 0.2,
                  }}>
                    {subLabel}
                  </Text>
                </View>
                {member.pinEnabled && (
                  <Text style={{ fontSize: 10 }}>🔒</Text>
                )}
              </View>
            </View>
          </View>

          {/* Role-specific info */}
          {member.role === 'kid' || member.role === 'teen' ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <CoinBadge icon="🪙" amount={member.mainCoins} label="MAIN"   color={BRAND.amber}  isDark={isDark} />
              <CoinBadge icon="⭐" amount={member.gpCoins}   label="GP"     color={BRAND.purple} isDark={isDark} />
            </View>
          ) : member.role === 'parent' ? (
            <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
              <StatPill label="LVL"  value={member.level}            ac={ac} />
              <StatPill label="🔥"   value={`${member.streak}d`}    ac={BRAND.amber} />
              <StatPill label="DONE" value={member.questsCompleted}  ac={ac} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 5 }}>
              <StatPill label="LVL"  value={member.level}           ac={ac} />
              <StatPill label="DONE" value={member.questsCompleted} ac={ac} />
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── PIN Pad ──────────────────────────────────────────────────────────────────

const PIN_LENGTH = 4;

function PinPad({ member, isDark, onSuccess, onCancel, allNames }: {
  member: FamilyMember; isDark: boolean;
  onSuccess: () => void; onCancel: () => void; allNames: string[];
}) {
  const [digits, setDigits]   = useState('');
  const [error,  setError]    = useState(false);
  const shake = useRef(new RNAnimated.Value(0)).current;
  const ac    = accent(member.role);

  const triggerShake = () => {
    RNAnimated.sequence([
      RNAnimated.timing(shake, { toValue:  8, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue:  6, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: -6, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue:  0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  const press = useCallback((d: string) => {
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    setError(false);

    if (next.length === PIN_LENGTH) {
      setTimeout(() => {
        if (next === member.pin) {
          onSuccess();
        } else {
          triggerShake();
          setError(true);
          setDigits('');
        }
      }, 100);
    }
  }, [digits, member.pin]);

  const del = () => { setDigits(d => d.slice(0, -1)); setError(false); };

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <View style={{ paddingHorizontal: 24, paddingBottom: 8 }}>
      {/* Back + member info */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ArrowIcon c={isDark ? '#6B7FA3' : '#8A9ABF'} />
        </TouchableOpacity>
        <FamilyAvatar
          name={member.name} emoji={member.emoji} avatarUrl={member.avatarUrl}
          siblings={allNames} size={36}
          ringColor={ac} ringWidth={2} bgColor={ac + '22'}
        />
        <View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#E2EAF8' : '#0A1628' }}>
            {member.name}
          </Text>
          <Text style={{ fontSize: 11, color: isDark ? '#6B7FA3' : '#8A9ABF' }}>
            Enter PIN to switch
          </Text>
        </View>
      </View>

      {/* Dot indicators */}
      <RNAnimated.View style={{
        flexDirection: 'row', justifyContent: 'center', gap: 14,
        marginBottom: 28,
        transform: [{ translateX: shake }],
      }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={{
            width: 14, height: 14, borderRadius: 7,
            backgroundColor: i < digits.length
              ? (error ? '#EF4444' : ac)
              : (isDark ? '#253247' : '#DDE4F0'),
            borderWidth: 1.5,
            borderColor: i < digits.length
              ? (error ? '#EF4444' : ac)
              : (isDark ? '#334155' : '#C8D4EC'),
          }} />
        ))}
      </RNAnimated.View>

      {error && (
        <Text style={{ textAlign: 'center', color: '#EF4444', fontSize: 12, fontWeight: '600', marginBottom: 12, marginTop: -18 }}>
          Wrong PIN — try again
        </Text>
      )}

      {/* Numpad */}
      <View style={{ gap: 10 }}>
        {[0, 3, 6, 9].map(row => (
          <View key={row} style={{ flexDirection: 'row', gap: 10 }}>
            {KEYS.slice(row, row + 3).map((k, ci) => {
              if (k === '') return <View key={ci} style={{ flex: 1 }} />;
              const isBackspace = k === '⌫';
              return (
                <TouchableOpacity
                  key={ci}
                  style={{
                    flex: 1, height: 54, borderRadius: 14,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isBackspace
                      ? (isDark ? '#1A2840' : '#EEF2FA')
                      : (isDark ? '#131D30' : '#F4F7FF'),
                    borderWidth: 1,
                    borderColor: isDark ? '#1C2A40' : '#E2EAF8',
                  }}
                  onPress={() => isBackspace ? del() : press(k)}
                  activeOpacity={0.6}
                >
                  {isBackspace
                    ? <BackspaceIcon c={isDark ? '#6B7FA3' : '#8A9ABF'} />
                    : <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#E2EAF8' : '#0A1628' }}>{k}</Text>
                  }
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Group ────────────────────────────────────────────────────────────────────

function Group({ label, members, activeId, onSelect, isDark, allNames }: {
  label: string; members: FamilyMember[]; activeId: string | null;
  onSelect: (m: FamilyMember) => void; isDark: boolean; allNames: string[];
}) {
  const { colors } = useTheme();
  if (members.length === 0) return null;

  const rows: FamilyMember[][] = [];
  for (let i = 0; i < members.length; i += 2) rows.push(members.slice(i, i + 2));

  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{
        fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
        textTransform: 'uppercase', color: colors.textTertiary, marginBottom: 9,
      }}>
        {label}
      </Text>
      <View style={{ gap: 8 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map(m => (
              <MemberCard
                key={m.id} member={m} isActive={m.id === activeId}
                onPress={() => onSelect(m)} isDark={isDark} allNames={allNames}
              />
            ))}
            {row.length < 2 && <View style={{ flex: 1 }} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Sheet wrapper ────────────────────────────────────────────────────────────

function Sheet({ visible, onClose, children, isDark }: {
  visible: boolean; onClose: () => void; children: React.ReactNode; isDark: boolean;
}) {
  const ty = useSharedValue(500);
  useEffect(() => {
    ty.value = visible ? withTiming(0, { duration: 280 }) : withTiming(500, { duration: 220 });
  }, [visible]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(4,10,28,0.72)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <Animated.View style={[aStyle, {
          backgroundColor: isDark ? '#0B1422' : '#FFFFFF',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          borderTopWidth: 1, borderColor: isDark ? '#1A2840' : '#E2EAF8',
          paddingBottom: 40,
          shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.25, shadowRadius: 24, elevation: 24,
        }]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function PersonaSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();

  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);

  const parents  = members.filter(m => m.role === 'parent');
  const kids     = members.filter(m => m.role === 'kid');
  const teens    = members.filter(m => m.role === 'teen');
  const seniors  = members.filter(m => m.role === 'senior');
  const allNames = members.map(m => m.name);

  const handleSelect = (m: FamilyMember) => {
    if (m.pinEnabled && m.id !== activeMemberId) {
      setPinTarget(m);
    } else {
      setActiveMember(m.id);
      onClose();
      // Land on Hub after switching profiles — whatever tab was open for
      // the PREVIOUS member (e.g. Profile & Settings) is rarely where the
      // person who just switched in wants to land.
      router.replace('/(tabs)');
    }
  };

  const handlePinSuccess = () => {
    if (pinTarget) setActiveMember(pinTarget.id);
    setPinTarget(null);
    onClose();
    router.replace('/(tabs)');
  };

  const handleClose = () => {
    setPinTarget(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={handleClose} isDark={isDark}>
      {/* Drag handle */}
      <View style={{
        width: 32, height: 4, borderRadius: 2, alignSelf: 'center',
        marginTop: 12, backgroundColor: isDark ? '#253247' : '#D1DCEF',
      }} />

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
        borderBottomWidth: 1, borderBottomColor: isDark ? '#131F33' : '#EEF2FA',
        marginBottom: pinTarget ? 16 : 0,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {pinTarget
            ? <LockIcon c={BRAND.purple} size={16} />
            : <UsersIcon c={BRAND.teal} />
          }
          <Text style={{
            fontSize: 17, fontWeight: '900',
            color: isDark ? '#E8F0FF' : '#0A1628', letterSpacing: -0.4,
          }}>
            {pinTarget ? 'PIN Required' : 'Switch Profile'}
          </Text>
        </View>
        <TouchableOpacity
          style={{
            width: 28, height: 28, borderRadius: 14,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: isDark ? '#1A2840' : '#EEF2FA',
          }}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <XIcon c={isDark ? '#6B7FA3' : '#8A9ABF'} />
        </TouchableOpacity>
      </View>

      {/* PIN pad or member grid */}
      {pinTarget ? (
        <PinPad
          member={pinTarget}
          isDark={isDark}
          allNames={allNames}
          onSuccess={handlePinSuccess}
          onCancel={() => setPinTarget(null)}
        />
      ) : (
        <ScrollView
          style={{ maxHeight: 500 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}>
          <Group label="Parents"      members={parents} activeId={activeMemberId} onSelect={handleSelect} isDark={isDark} allNames={allNames} />
          <Group label="Kids"         members={kids}    activeId={activeMemberId} onSelect={handleSelect} isDark={isDark} allNames={allNames} />
          <Group label="Teens"        members={teens}   activeId={activeMemberId} onSelect={handleSelect} isDark={isDark} allNames={allNames} />
          <Group label="Grandparents" members={seniors} activeId={activeMemberId} onSelect={handleSelect} isDark={isDark} allNames={allNames} />
        </ScrollView>
      )}
    </Sheet>
  );
}
