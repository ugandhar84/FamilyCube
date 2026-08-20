/**
 * PersonaSwitcherDropdown — inline "Select Family Profile" panel that drops
 * down directly beneath AppHeader, replacing the old bottom-sheet pattern.
 * Square gradient-initial avatar tiles, single-column list, checkmark on
 * the active row, PIN gate reused from the family store's existing pin
 * flow for locked non-active profiles.
 */
import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Pressable, Animated as RNAnimated } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, FamilyMember } from '@/store/familyStore';
import { BRAND } from './FamilyCubeLogo';

const ROLE_ACCENT: Record<string, string> = {
  parent: BRAND.teal,
  kid:    BRAND.amber,
  teen:   BRAND.pink,
  senior: BRAND.purple,
};

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parent',
  kid:    'Kid',
  teen:   'Teen',
  senior: 'Grandparent',
};

function accent(role: string) { return ROLE_ACCENT[role] ?? BRAND.purple; }

// ── Icons ─────────────────────────────────────────────────────────────────────
function CheckIcon({ c, size = 13 }: { c: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 13l4 4L19 7" stroke={c} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function LockIcon({ c, size = 12 }: { c: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 11V7a4 4 0 018 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z"
        stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function BackspaceIcon({ c }: { c: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M18 9l-6 6M12 9l6 6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ArrowLeftIcon({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M19 12H5M12 5l-7 7 7 7" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Square gradient-initial avatar tile (mock's exact style) ───────────────────
function SquareAvatar({ name, roleAccent, size = 40 }: { name: string; roleAccent: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <LinearGradient
      colors={[roleAccent, roleAccent + 'AA']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: size * 0.42, fontWeight: '800', color: '#fff' }}>{initial}</Text>
    </LinearGradient>
  );
}

// ── PIN pad (compact, reused for locked profile switch) ────────────────────────
const PIN_LENGTH = 4;

function PinPad({ member, isDark, onSuccess, onCancel }: {
  member: FamilyMember; isDark: boolean; onSuccess: () => void; onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);
  const shake = useRef(new RNAnimated.Value(0)).current;
  const ac = accent(member.role);

  const triggerShake = () => {
    RNAnimated.sequence([
      RNAnimated.timing(shake, { toValue: 8, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: -6, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: 0, duration: 40, useNativeDriver: true }),
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
    <View style={{ paddingHorizontal: 18, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeftIcon c={colors.textSecondary} />
        </TouchableOpacity>
        <SquareAvatar name={member.name} roleAccent={ac} size={32} />
        <View>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>{member.name}</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>Enter PIN to switch</Text>
        </View>
      </View>

      <RNAnimated.View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 18, transform: [{ translateX: shake }] }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={{
            width: 12, height: 12, borderRadius: 6,
            backgroundColor: i < digits.length ? (error ? colors.danger : ac) : colors.surface,
            borderWidth: 1.5, borderColor: i < digits.length ? (error ? colors.danger : ac) : colors.border,
          }} />
        ))}
      </RNAnimated.View>

      {error && (
        <Text style={{ textAlign: 'center', color: colors.danger, fontSize: 11, fontWeight: '600', marginBottom: 10, marginTop: -14 }}>
          Wrong PIN — try again
        </Text>
      )}

      <View style={{ gap: 8 }}>
        {[0, 3, 6, 9].map(row => (
          <View key={row} style={{ flexDirection: 'row', gap: 8 }}>
            {KEYS.slice(row, row + 3).map((k, ci) => {
              if (k === '') return <View key={ci} style={{ flex: 1 }} />;
              const isBackspace = k === '⌫';
              return (
                <TouchableOpacity key={ci}
                  style={{ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  onPress={() => isBackspace ? del() : press(k)}
                  activeOpacity={0.6}>
                  {isBackspace
                    ? <BackspaceIcon c={colors.textSecondary} />
                    : <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>{k}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Member row ───────────────────────────────────────────────────────────────
function MemberRow({ member, isActive, onPress, isDark }: {
  member: FamilyMember; isActive: boolean; onPress: () => void; isDark: boolean;
}) {
  const { colors } = useTheme();
  const ac = accent(member.role);
  const subLabel = member.subRole ?? ROLE_LABEL[member.role] ?? member.role;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
        borderWidth: isActive ? 1.5 : 0,
        borderColor: isActive ? ac + '50' : 'transparent',
        backgroundColor: isActive ? ac + (isDark ? '1E' : '12') : 'transparent',
      }}>
      <SquareAvatar name={member.name} roleAccent={ac} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{member.name}</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>{subLabel}</Text>
      </View>
      {isActive ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: ac, alignItems: 'center', justifyContent: 'center' }}>
          <CheckIcon c="#fff" />
        </View>
      ) : member.pinEnabled ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <LockIcon c={colors.textTertiary} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────
export default function PersonaSwitcherDropdown({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);

  if (!visible) return null;

  const handleSelect = (m: FamilyMember) => {
    if (m.pinEnabled && m.id !== activeMemberId) {
      setPinTarget(m);
    } else {
      setActiveMember(m.id);
      onClose();
    }
  };

  const handlePinSuccess = () => {
    if (pinTarget) setActiveMember(pinTarget.id);
    setPinTarget(null);
    onClose();
  };

  const handleClose = () => {
    setPinTarget(null);
    onClose();
  };

  return (
    <>
      {/* Backdrop — tap outside to dismiss. Previously had no background
          color at all (a purely invisible tap-catcher), so whatever sat
          below the header (e.g. Chat's own channel strip/sub-header) stayed
          fully visible and looked like it was sliding into/behind the
          dropdown rather than being cleanly covered by it. */}
      <Pressable
        onPress={handleClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -2000, zIndex: 40,
          backgroundColor: 'rgba(0,0,0,0.35)' }}
      />

      {/* Panel — drops down directly under the header */}
      <View style={{
        position: 'absolute', top: '100%', left: 12, right: 12, zIndex: 50,
        marginTop: 8, borderRadius: 22, overflow: 'hidden',
        backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
        shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 16,
      }}>
        {!pinTarget && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.textSecondary, textTransform: 'uppercase' }}>
              Select Family Profile
            </Text>
            <View style={{ backgroundColor: colors.primaryLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>Kinfolk OS</Text>
            </View>
          </View>
        )}

        {pinTarget ? (
          <PinPad member={pinTarget} isDark={isDark} onSuccess={handlePinSuccess} onCancel={() => setPinTarget(null)} />
        ) : (
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 8, gap: 2 }} showsVerticalScrollIndicator={false}>
            {members.map(m => (
              <MemberRow key={m.id} member={m} isActive={m.id === activeMemberId} onPress={() => handleSelect(m)} isDark={isDark} />
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}
