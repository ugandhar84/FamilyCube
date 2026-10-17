import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/ThemeContext';
import { FamilyMember, useFamilyStore } from '@/store/familyStore';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/chatCrypto';
import { useDeviceClass } from '@/lib/useDeviceClass';
import { KIOSK_RADIUS } from '@/features/kiosk/kioskTheme';
import { GEMINI } from '@/constants/geminiRhythm';

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
  const { colors, isDark } = useTheme();
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
    <Pressable allowRapidPress onPress={handlePress} disabled={disabled} style={styles.keyWrap}>
      {/* Figma rhythm: bright white round keys that lift off the cream card with a real shadow, no border. */}
      <Animated.View style={[styles.key, isDark ? { backgroundColor: colors.surface, borderColor: colors.border } : { backgroundColor: GEMINI.cardBg, borderWidth: 0, ...GEMINI.cardShadow, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }, {
        transform: [{ scale }],
        opacity: disabled ? 0.4 : 1,
      }]}>
        {label === '⌫' ? (
          <Ionicons name="backspace-outline" size={24} color={isDark ? colors.textSecondary : GEMINI.bodyColor} />
        ) : (
          <Text style={[styles.keyText, { color: isDark ? colors.textPrimary : GEMINI.titleColor }]}>{label}</Text>
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
function PinEntryLayer({ visible, member, onSuccess, onCancel }: PinEntryModalProps) {
  const { colors, isDark } = useTheme();
  // On a kiosk/tablet device this renders as a centered, shaped card
  // (matching KioskFormDrawer's own centered "dialog" variant — same
  // width/radius/maxHeight — so it reads as one of kiosk's own dialogs
  // instead of a phone-style full-bleed pageSheet stretched across a much
  // wider screen) [live-requested: "reduce this pin layout nicely centered
  // with nice shape"]. Phone keeps the exact same pageSheet as before —
  // this is a rendering branch only, none of the PIN/verification logic
  // below changes for either device class.
  const { deviceClass } = useDeviceClass();
  const isTablet = deviceClass === 'kitchenHub';

  const [entered, setEntered]       = useState('');
  const [attempts, setAttempts]     = useState(0);
  const [locked, setLocked]         = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [errorMsg, setErrorMsg]     = useState('');

  const shakeAnim    = useRef(new Animated.Value(0)).current;
  const lockInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const accentColor = isDark ? (member?.role === 'parent' ? colors.parent : colors.kid) : GEMINI.blue;

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
    // Only a member with their OWN real login needs a grant — for anyone
    // else, resolve_active_member_id's fast path (no auth_user_id at all,
    // so nothing to mismatch) already works with zero extra steps, and
    // calling the grant RPC pointlessly would still work but adds a
    // needless extra column write on every plain-family-member switch.
    // Live-reported bug this closes: a family member with their own
    // separate Supabase login (e.g. both parents individually signed up
    // before merging into one family) could be PIN-switched to on a
    // device whose actual auth session belongs to someone ELSE's login —
    // every identity-verified action for them then silently failed with a
    // generic "couldn't confirm" error, since the server had no way to
    // trust the switch without either the real login or this grant.
    const rpcName = member.authUserId ? 'verify_member_pin_and_grant' : 'verify_member_pin';
    // device_id scopes the resulting grant token to THIS device (migration
    // 20260979000000) — without it, PIN-switching into this same member on
    // a second device would silently invalidate this device's own grant.
    (member.authUserId ? getDeviceId() : Promise.resolve(undefined))
      .then(deviceId => supabase.rpc(rpcName, { p_member_id: member.id, p_entered_pin: submittedPin, ...(deviceId ? { p_device_id: deviceId } : {}) }))
      .then(({ data, error }) => {
        setVerifying(false);
        if (error) {
          console.warn(`[PinEntryModal] ${rpcName} failed`, error.message);
          shakeAndClear('Could not verify — check your connection and try again');
          return;
        }
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.ok) {
          if (result.grant_token && result.grant_expires_at) {
            useFamilyStore.getState().setActiveMemberGrant(member.id, result.grant_token, result.grant_expires_at);
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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
      Haptics.selectionAsync().catch(() => {});
      setEntered(p => p.slice(0, -1));
      if (errorMsg) setErrorMsg('');
    } else if (entered.length < PIN_LENGTH) {
      // A light tap for every digit; the last digit gets a firmer one as the PIN is checked.
      Haptics.impactAsync(entered.length + 1 === PIN_LENGTH ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setEntered(p => p + key);
    }
  };

  if (!member) return null;

  const content = (
    <>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onCancel} style={[styles.cancelBtn, { borderColor: colors.border }]}>
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatarCircle, {
          backgroundColor: GEMINI.cardBg,
          borderColor: accentColor,
        }]}>
          <Text style={styles.avatarEmoji}>{member.emoji ?? member.name[0]}</Text>
        </View>
        <Text style={[styles.memberName, { color: isDark ? colors.textPrimary : GEMINI.titleColor }]}>{member.name}</Text>
        <Text style={[styles.roleTag, { color: accentColor }]}>
          {member.role === 'parent' ? '👑 Parent' : '🌟 Kid'}
        </Text>
        <Text style={[styles.prompt, { color: isDark ? colors.textSecondary : GEMINI.bodyColor, fontWeight: '700' }]}>
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
      <Text style={[styles.hint, { color: isDark ? colors.textTertiary : GEMINI.bodyColorLight }]}>
        Forgot PIN? Ask a parent to reset it in Settings.
      </Text>
    </>
  );

  // Inline, not a native Modal: rendered as an absolute full-parent layer so
  // the PIN prompt is part of the screen instead of a popup ("no more
  // popup/alerts — all should be inline, including pin ask").
  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.inlineLayer, { zIndex: 1000, elevation: 1000 }]} pointerEvents="box-none">
      <Pressable style={[styles.tabletScrim, !isTablet && { padding: 0, alignItems: 'stretch', backgroundColor: 'transparent' }]} onPress={isTablet ? onCancel : undefined} accessibilityRole="button" accessibilityLabel="Close">
        <Pressable
          style={[
            isTablet ? styles.tabletCard : styles.inlineFull,
            { backgroundColor: isDark ? colors.surface : GEMINI.canvas, borderColor: isDark ? colors.border : GEMINI.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {content}
        </Pressable>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  inlineLayer: { alignItems: 'stretch', justifyContent: 'center' },
  inlineFull: { flex: 1, width: '100%', alignSelf: 'stretch', alignItems: 'center', paddingTop: 56 },
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

  avatarSection: { alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 16 },
  avatarCircle: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
  },
  avatarEmoji: { fontSize: 38 },
  memberName:  { fontSize: 24, fontWeight: '800', marginTop: 4 },
  roleTag:     { fontSize: 13, fontWeight: '600' },
  prompt:      { fontSize: 14, marginTop: 4 },

  dotsRow: {
    flexDirection: 'row',
    gap: 22,
    marginBottom: 6,
  },
  dot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2,
  },

  errorWrap: { height: 22, marginBottom: 8 },
  errorText: { fontSize: 13, fontWeight: '600' },

  // A centred 3x4 pad of round keys, sized to sit in the middle of the card rather than stretch across it.
  pad: { alignSelf: 'center', gap: 14 },
  padRow: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  keyWrap: { width: 76, flex: 0 },
  key: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  keyText: { fontSize: 28, fontWeight: '600' },
  keyPlaceholder: { width: 76, flex: 0 },

  hint: { fontSize: 12, marginTop: 18, textAlign: 'center' },

  // Tablet/kiosk only — centered dialog card, same width/radius/maxHeight
  // as KioskFormDrawer's own 'dialog' variant so this reads as one of
  // kiosk's own dialogs rather than a phone pageSheet stretched wide.
  tabletScrim: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', padding: 24,
  },
  tabletCard: {
    width: 400, maxWidth: '100%', maxHeight: '94%',
    borderWidth: 1, borderRadius: KIOSK_RADIUS.lg,
    alignItems: 'center', paddingTop: 14, paddingBottom: 20,
    overflow: 'hidden',
  },
});

// ─── Root-hosted presentation ────────────────────────────────────────────────
// A PIN prompt used to be a native Modal; now it is an in-screen layer. Most
// callers sit inside small containers (e.g. the kiosk header) that would clip
// it, so by default it is drawn by <PinEntryHost/> mounted once at the app
// root. Pass `inline` where the caller is itself a full-screen root (the kiosk
// lock screen is a native Modal, which a root host would sit behind).
type PinHostState = { props: PinEntryModalProps | null };
const hostListeners = new Set<(s: PinHostState) => void>();
let hostState: PinHostState = { props: null };
const setHost = (props: PinEntryModalProps | null) => {
  hostState = { props };
  hostListeners.forEach(l => l(hostState));
};

export function PinEntryHost() {
  const [st, setSt] = useState<PinHostState>(hostState);
  useEffect(() => {
    hostListeners.add(setSt);
    return () => { hostListeners.delete(setSt); };
  }, []);
  if (!st.props) return null;
  return <PinEntryLayer {...st.props} />;
}

export default function PinEntryModal(props: PinEntryModalProps & { inline?: boolean }) {
  const { inline, ...rest } = props;
  const { visible, member, onSuccess, onCancel } = rest;
  useEffect(() => {
    if (inline) return;
    if (visible && member) setHost({ visible, member, onSuccess, onCancel });
    else setHost(null);
  }, [inline, visible, member, onSuccess, onCancel]);
  useEffect(() => () => { if (!inline) setHost(null); }, [inline]);
  if (!inline) return null;
  return <PinEntryLayer {...rest} />;
}
