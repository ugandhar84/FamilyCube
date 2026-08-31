import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, Animated, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { FamilyMember } from '@/store/familyStore';
import { supabase } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────
const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const KEYS = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['','0','⌫'],
];

// ─── Dot indicator ────────────────────────────────────────────────────────────
function PinDots({ entered, shaking, color }: { entered: number; shaking: Animated.Value; color: string }) {
  return (
    <Animated.View style={[styles.dotsRow, {
      transform: [{ translateX: shaking }],
    }]}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < entered ? color : 'transparent',
              borderColor: i < entered ? color : 'rgba(148,163,184,0.5)',
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

// ─── Number key ───────────────────────────────────────────────────────────────
function Key({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (disabled || label === '') return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, tension: 300, friction: 6 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 260, friction: 7 }),
    ]).start();
    onPress();
  };

  if (label === '') return <View style={styles.keyPlaceholder} />;

  return (
    <Pressable onPress={handlePress} disabled={disabled} style={styles.keyWrap}>
      <Animated.View style={[styles.key, {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        transform: [{ scale }],
        opacity: disabled ? 0.4 : 1,
      }]}>
        {label === '⌫' ? (
          <Ionicons name="backspace-outline" size={22} color={colors.textSecondary} />
        ) : (
          <Text style={[styles.keyText, { color: colors.textPrimary }]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface PinEntryModalProps {
  visible: boolean;
  member: FamilyMember | null;
  onSuccess: (member: FamilyMember) => void;
  onCancel: () => void;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function PinEntryModal({ visible, member, onSuccess, onCancel }: PinEntryModalProps) {
  const { colors, isDark } = useTheme();

  const [entered, setEntered]       = useState('');
  const [attempts, setAttempts]     = useState(0);
  const [locked, setLocked]         = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [errorMsg, setErrorMsg]     = useState('');

  const shakeAnim    = useRef(new Animated.Value(0)).current;
  const lockInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const accentColor = member?.role === 'parent' ? colors.parent : colors.kid;

  const [verifying, setVerifying] = useState(false);

  // Reset state when a new member is targeted
  useEffect(() => {
    if (visible) {
      setEntered('');
      setAttempts(0);
      setLocked(false);
      setLockRemaining(0);
      setErrorMsg('');
      setVerifying(false);
      if (lockInterval.current) clearInterval(lockInterval.current);
    }
  }, [visible, member?.id]);

  // Lockout countdown — driven by the server's own locked_until timestamp
  // (see startLockout below), not just a local timer, so this correctly
  // reflects a lockout that's still active even if the app was closed and
  // reopened mid-lockout.
  const startLockout = (lockedUntil: string | Date) => {
    const untilMs = new Date(lockedUntil).getTime();
    const remaining = Math.max(1, Math.ceil((untilMs - Date.now()) / 1000));
    setLocked(true);
    setLockRemaining(remaining);
    if (lockInterval.current) clearInterval(lockInterval.current);
    lockInterval.current = setInterval(() => {
      setLockRemaining(prev => {
        if (prev <= 1) {
          clearInterval(lockInterval.current!);
          setLocked(false);
          setAttempts(0);
          setEntered('');
          setErrorMsg('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  useEffect(() => () => { if (lockInterval.current) clearInterval(lockInterval.current); }, []);

  // Auto-verify when 4 digits entered — routed through verify_member_pin,
  // a real server-side RPC, instead of a plain client-side string compare.
  // Logged QA gap, fixed: attempt count and lockout now live on the
  // member's row in the database, not local React state — force-quitting
  // and reopening the app (or leaving/re-entering this sheet) no longer
  // resets a lockout or a partial attempt count, since the server is the
  // one keeping score now, not the component.
  useEffect(() => {
    if (entered.length < PIN_LENGTH || !member || verifying) return;
    setVerifying(true);
    const submittedPin = entered;
    supabase.rpc('verify_member_pin', { p_member_id: member.id, p_entered_pin: submittedPin })
      .then(({ data, error }) => {
        setVerifying(false);
        if (error) {
          console.warn('[PinEntryModal] verify_member_pin failed', error.message);
          shakeAndClear('Could not verify — check your connection and try again');
          return;
        }
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.ok) {
          onSuccess(member);
          setEntered('');
          setAttempts(0);
          setErrorMsg('');
          return;
        }
        if (result?.locked_until) {
          startLockout(result.locked_until);
          shakeAndClear(`Too many attempts. Try again in a moment`);
          return;
        }
        const remaining = result?.attempts_remaining ?? Math.max(0, MAX_ATTEMPTS - (attempts + 1));
        setAttempts(a => a + 1);
        shakeAndClear(`Wrong PIN · ${remaining} attempt${remaining === 1 ? '' : 's'} left`);
      });
  }, [entered]);

  const shakeAndClear = (msg: string) => {
    Vibration.vibrate(400);
    setErrorMsg(msg);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start(() => setEntered(''));
  };

  const handleKey = (key: string) => {
    if (locked) return;
    if (key === '⌫') {
      setEntered(p => p.slice(0, -1));
      if (errorMsg) setErrorMsg('');
    } else if (entered.length < PIN_LENGTH) {
      setEntered(p => p + key);
    }
  };

  if (!member) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={[styles.sheet, { backgroundColor: isDark ? colors.surface : colors.background }]}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={[styles.cancelBtn, { borderColor: colors.border }]}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarCircle, {
            backgroundColor: (member.role === 'parent' ? colors.parentLight : colors.kidLight),
            borderColor: accentColor,
          }]}>
            <Text style={styles.avatarEmoji}>{member.emoji ?? member.name[0]}</Text>
          </View>
          <Text style={[styles.memberName, { color: colors.textPrimary }]}>{member.name}</Text>
          <Text style={[styles.roleTag, { color: accentColor }]}>
            {member.role === 'parent' ? '👑 Parent' : '🌟 Kid'}
          </Text>
          <Text style={[styles.prompt, { color: colors.textSecondary }]}>
            {locked ? `🔒 Locked for ${lockRemaining}s` : 'Enter PIN to switch profile'}
          </Text>
        </View>

        {/* PIN dots */}
        <PinDots entered={entered.length} shaking={shakeAnim} color={accentColor} />

        {/* Error */}
        <View style={styles.errorWrap}>
          {errorMsg ? (
            <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text>
          ) : null}
        </View>

        {/* Number pad */}
        <View style={[styles.pad, { opacity: locked ? 0.4 : 1 }]}>
          {KEYS.map((row, ri) => (
            <View key={ri} style={styles.padRow}>
              {row.map((key, ki) => (
                <Key
                  key={ki}
                  label={key}
                  onPress={() => handleKey(key)}
                  disabled={locked || (key !== '⌫' && entered.length >= PIN_LENGTH)}
                />
              ))}
            </View>
          ))}
        </View>

        {/* Forgot PIN hint */}
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Forgot PIN? Ask a parent to reset it in Settings.
        </Text>

      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 16,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  cancelText: { fontSize: 14, fontWeight: '600' },

  avatarSection: { alignItems: 'center', gap: 6, marginTop: 24, marginBottom: 36 },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
  },
  avatarEmoji: { fontSize: 44 },
  memberName:  { fontSize: 24, fontWeight: '800', marginTop: 6 },
  roleTag:     { fontSize: 13, fontWeight: '600' },
  prompt:      { fontSize: 14, marginTop: 4 },

  dotsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 16,
  },
  dot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2,
  },

  errorWrap: { height: 22, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600' },

  pad: { width: '100%', paddingHorizontal: 32, gap: 12 },
  padRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  keyWrap: { flex: 1 },
  key: {
    height: 68, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  keyText: { fontSize: 24, fontWeight: '600' },
  keyPlaceholder: { flex: 1 },

  hint: { fontSize: 12, marginTop: 28, textAlign: 'center' },
});
