/**
 * CouplePinModal — PIN entry for the "Just Us" private parents-only chat
 * channel. Same shake/lockout visual language as PinEntryModal.tsx, but
 * channel-scoped rather than per-member: unlocking is shared by whichever
 * 2 parents the channel belongs to, verified via verify_channel_pin (not
 * verify_member_pin), and there's no `member` prop since success isn't
 * tied to switching who's active.
 *
 * Three modes:
 *  - 'set'     — first-time setup, enter 4 digits twice to confirm, calls
 *                set_channel_pin. Used when a parent enables Just Us.
 *  - 'verify'  — day-to-day unlock, calls verify_channel_pin with the same
 *                server-side attempt/lockout tracking as PinEntryModal.
 *  - 'disable' — turning Just Us off. Deliberately never accepts the
 *                channel PIN — only the disabling parent's own birth year
 *                (calls disable_channel_pin), so a child who
 *                obtained/guessed the PIN can't also disable the feature
 *                to hide it. Uses a plain 4-digit year field, not the dot
 *                indicator (a year isn't secret the way a PIN is, and
 *                needs to be visibly typed to reduce entry mistakes).
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useDeviceClass } from '@/lib/useDeviceClass';
import { KIOSK_RADIUS } from '@/features/kiosk/kioskTheme';
import { useCoupleChannelStore } from '@/store/coupleChannelStore';

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;

const KEYS = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['','0','⌫'],
];

function PinDots({ entered, shaking, color }: { entered: number; shaking: Animated.Value; color: string }) {
  return (
    <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shaking }] }]}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View key={i} style={[styles.dot, {
          backgroundColor: i < entered ? color : 'transparent',
          borderColor: i < entered ? color : 'rgba(148,163,184,0.5)',
        }]} />
      ))}
    </Animated.View>
  );
}

function Key({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    if (disabled || label === '') return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, tension: 300, friction: 6 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 260, friction: 7 }),
    ]).start();
    onPress();
  };
  if (label === '') return <View style={styles.keyPlaceholder} />;
  return (
    <Pressable onPress={handlePress} disabled={disabled} style={styles.keyWrap}>
      <Animated.View style={[styles.key, {
        backgroundColor: colors.surface, borderColor: colors.border,
        transform: [{ scale }], opacity: disabled ? 0.4 : 1,
      }]}>
        {label === '⌫'
          ? <Ionicons name="backspace-outline" size={22} color={colors.textSecondary} />
          : <Text style={[styles.keyText, { color: colors.textPrimary }]}>{label}</Text>}
      </Animated.View>
    </Pressable>
  );
}

type Mode = 'set' | 'verify' | 'disable';

interface Props {
  visible: boolean;
  mode: Mode;
  channelId: string;
  // Required for 'set' mode only — the OTHER parent's member id, so the
  // channel row can be created (with member_ids populated) on first
  // enable, before either parent has ever sent a message in it. See
  // set_channel_pin's own comment (migration 20260955000000) for why this
  // can't be deferred to whenever a message happens to be sent.
  otherMemberId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function CouplePinModal({ visible, mode, channelId, otherMemberId, onSuccess, onCancel }: Props) {
  const { colors, isDark } = useTheme();
  const { deviceClass } = useDeviceClass();
  const isTablet = deviceClass === 'kitchenHub';
  const accentColor = colors.accent;

  const [entered, setEntered] = useState('');
  // 'set' mode's second pass, confirming the first entry matches.
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [verifying, setVerifying] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const lockInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible) {
      setEntered('');
      setFirstPin(null);
      setAttempts(0);
      setLocked(false);
      setLockRemaining(0);
      setErrorMsg('');
      setVerifying(false);
      if (lockInterval.current) clearInterval(lockInterval.current);
    }
  }, [visible, mode, channelId]);

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

  const shakeAndClear = (msg: string) => {
    Vibration.vibrate(400);
    setErrorMsg(msg);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start(() => setEntered(''));
  };

  // Auto-submit at 4 digits, mode-dependent target.
  useEffect(() => {
    if (entered.length < PIN_LENGTH || verifying) return;

    if (mode === 'set') {
      if (firstPin === null) {
        // First pass — stash it, prompt for confirmation, don't call the server yet.
        setFirstPin(entered);
        setEntered('');
        return;
      }
      if (entered !== firstPin) {
        setFirstPin(null);
        shakeAndClear("PINs didn't match — try again");
        return;
      }
      if (!otherMemberId) {
        console.warn('[CouplePinModal] set mode requires otherMemberId');
        shakeAndClear('Something went wrong — try again');
        return;
      }
      setVerifying(true);
      supabase.rpc('set_channel_pin', { p_channel_id: channelId, p_pin: entered, p_other_member_id: otherMemberId })
        .then(({ error }) => {
          setVerifying(false);
          if (error) {
            console.warn('[CouplePinModal] set_channel_pin failed', error.message);
            setFirstPin(null);
            shakeAndClear('Could not set PIN — check your connection and try again');
            return;
          }
          useCoupleChannelStore.getState().markUnlocked(channelId);
          onSuccess();
        });
      return;
    }

    if (mode === 'verify') {
      setVerifying(true);
      const submittedPin = entered;
      supabase.rpc('verify_channel_pin', { p_channel_id: channelId, p_entered_pin: submittedPin })
        .then(({ data, error }) => {
          setVerifying(false);
          if (error) {
            console.warn('[CouplePinModal] verify_channel_pin failed', error.message);
            shakeAndClear('Could not verify — check your connection and try again');
            return;
          }
          const result = Array.isArray(data) ? data[0] : data;
          if (result?.ok) {
            useCoupleChannelStore.getState().markUnlocked(channelId);
            setEntered('');
            setAttempts(0);
            setErrorMsg('');
            onSuccess();
            return;
          }
          if (result?.locked_until) {
            startLockout(result.locked_until);
            shakeAndClear('Too many attempts. Try again in a moment');
            return;
          }
          const remaining = result?.attempts_remaining ?? Math.max(0, MAX_ATTEMPTS - (attempts + 1));
          setAttempts(a => a + 1);
          shakeAndClear(`Wrong PIN · ${remaining} attempt${remaining === 1 ? '' : 's'} left`);
        });
      return;
    }

    // mode === 'disable' — entered digits are a birth YEAR, not a PIN. We
    // still gate the composer to 4 digits (PIN_LENGTH doubles as year
    // length here), but never send this to verify_channel_pin — only to
    // disable_channel_pin, which checks it against the caller's own
    // members.date_of_birth server-side.
    setVerifying(true);
    const year = parseInt(entered, 10);
    supabase.rpc('disable_channel_pin', { p_channel_id: channelId, p_entered_birth_year: year })
      .then(({ data, error }) => {
        setVerifying(false);
        if (error) {
          console.warn('[CouplePinModal] disable_channel_pin failed', error.message);
          shakeAndClear(error.message?.includes('no birth year')
            ? 'No birth year on file — ask support to disable this'
            : 'Could not verify — check your connection and try again');
          return;
        }
        if (data === true) {
          useCoupleChannelStore.getState().reset();
          onSuccess();
          return;
        }
        shakeAndClear('That year doesn’t match');
      });
  }, [entered]);

  const handleKey = (key: string) => {
    if (locked) return;
    if (key === '⌫') {
      setEntered(p => p.slice(0, -1));
      if (errorMsg) setErrorMsg('');
    } else if (entered.length < PIN_LENGTH) {
      setEntered(p => p + key);
    }
  };

  const prompt = mode === 'set'
    ? (firstPin === null ? 'Set a PIN for Just Us' : 'Confirm the PIN')
    : mode === 'verify'
      ? (locked ? `🔒 Locked for ${lockRemaining}s` : 'Enter the Just Us PIN')
      : 'Enter your birth year to turn this off';

  const content = (
    <>
      <View style={styles.header}>
        <Pressable onPress={onCancel} style={[styles.cancelBtn, { borderColor: colors.border }]}>
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </View>

      <View style={styles.titleSection}>
        <Text style={styles.titleEmoji}>💕</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Just Us</Text>
        <Text style={[styles.prompt, { color: colors.textSecondary }]}>{prompt}</Text>
      </View>

      <PinDots entered={entered.length} shaking={shakeAnim} color={accentColor} />

      <View style={styles.errorWrap}>
        {errorMsg ? <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text> : null}
      </View>

      <View style={[styles.pad, { opacity: locked ? 0.4 : 1 }]}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.padRow}>
            {row.map((key, ki) => (
              <Key key={ki} label={key} onPress={() => handleKey(key)}
                disabled={locked || (key !== '⌫' && entered.length >= PIN_LENGTH)} />
            ))}
          </View>
        ))}
      </View>

      {mode === 'disable' && (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          This confirms it's really you — not the shared PIN, which anyone
          who's been given it could enter.
        </Text>
      )}
    </>
  );

  if (isTablet) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
        <Pressable style={styles.tabletScrim} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
          <Pressable style={[styles.tabletCard, { backgroundColor: isDark ? colors.surface : colors.background, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            {content}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={[styles.sheet, { backgroundColor: isDark ? colors.surface : colors.background }]}>
        {content}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, alignItems: 'center', paddingTop: 16 },
  header: { width: '100%', flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 20, marginBottom: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  cancelText: { fontSize: 14, fontWeight: '600' },

  titleSection: { alignItems: 'center', gap: 6, marginTop: 24, marginBottom: 36 },
  titleEmoji: { fontSize: 44 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 6 },
  prompt: { fontSize: 14, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },

  dotsRow: { flexDirection: 'row', gap: 20, marginBottom: 16 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },

  errorWrap: { height: 22, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600' },

  pad: { width: '100%', paddingHorizontal: 32, gap: 12 },
  padRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  keyWrap: { flex: 1 },
  key: { height: 68, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontWeight: '600' },
  keyPlaceholder: { flex: 1 },

  hint: { fontSize: 12, marginTop: 20, textAlign: 'center', paddingHorizontal: 32 },

  tabletScrim: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  tabletCard: { width: 420, maxWidth: '100%', maxHeight: '85%', borderWidth: 1, borderRadius: KIOSK_RADIUS.lg, alignItems: 'center', paddingTop: 16, paddingBottom: 24, overflow: 'hidden' },
});
