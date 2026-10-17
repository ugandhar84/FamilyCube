import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { markNetworkOffline, isNetworkError } from '@/lib/networkStore';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  center?: boolean;
}

type ShowAlertFn = (title: string, message?: string, buttons?: AlertButton[], center?: boolean) => void;

let _showAlert: ShowAlertFn | null = null;

const NETWORK_KEYWORDS = [
  'network request failed', 'failed to fetch', 'no internet', 'networkerror',
  'typeerror: failed', 'enotfound', 'econnrefused', 'fetch error', 'offline',
  'network error', 'socket hang up', 'connection refused', 'aborted',
];

// Raw Postgres / Supabase server error patterns — never shown to users
const SERVER_ERROR_PATTERNS = [
  /\b(duplicate key|unique constraint|foreign key|violates|syntax error|relation ".+" does not exist)/i,
  /\b(42[0-9]{3}|23[0-9]{3})\b/,   // Postgres SQLSTATE codes
  /\bpg_/i,
  /error:\s+"[^"]+":/i,
  /\b(jwt expired|jwt invalid|invalid jwt|token expired)\b/i,
  /supabase\./i,
  /postgrest/i,
];

// Keywords for timeouts specifically (also network)
const TIMEOUT_PATTERNS = ['timeout', 'timed out', 'request timed'];

function classify(title: string, message?: string): 'network' | 'server' | 'user' {
  const hay = `${title} ${message ?? ''}`.toLowerCase();
  if (NETWORK_KEYWORDS.some(k => hay.includes(k))) return 'network';
  if (TIMEOUT_PATTERNS.some(k => hay.includes(k)))  return 'network';
  const full = `${title} ${message ?? ''}`;
  if (SERVER_ERROR_PATTERNS.some(r => r.test(full)))  return 'server';
  return 'user';
}

/** `center` shows the dialog in the middle of the screen over a dimmed backdrop (for choices like "Open in Maps"). */
export function showAlert(title: string, message?: string, buttons?: AlertButton[], center?: boolean) {
  const kind = classify(title, message);

  if (kind === 'network') {
    markNetworkOffline();
    return;
  }

  if (kind === 'server') {
    // Replace raw server error with a safe, actionable message
    if (_showAlert) {
      _showAlert(title, 'Something went wrong. Please try again.', buttons ?? [{ text: 'OK' }]);
    }
    return;
  }

  if (_showAlert) {
    _showAlert(title, message, buttons ?? [{ text: 'OK' }], center);
  }
}

export default function AppAlert() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<AlertState>({
    visible: false, title: '', message: undefined, buttons: [],
  });

  // Every native Alert.alert in the app renders as this inline banner
  // instead of a system popup ("no alert screen models").
  useEffect(() => {
    const orig = Alert.alert;
    Alert.alert = ((title: string, message?: string, buttons?: AlertButton[]) => {
      showAlert(title, message, buttons);
    }) as typeof Alert.alert;
    return () => { Alert.alert = orig; };
  }, []);

  useEffect(() => {
    _showAlert = (title, message, buttons, center) => {
      setState({ visible: true, title, message, center, buttons: buttons ?? [{ text: 'OK' }] });
    };
    return () => { _showAlert = null; };
  }, []);

  const dismiss = useCallback((btn?: AlertButton) => {
    setState(s => ({ ...s, visible: false }));
    setTimeout(() => btn?.onPress?.(), Platform.OS === 'ios' ? 450 : 100);
  }, []);

  useEffect(() => {
    if (!state.visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const cancel = state.buttons.find(b => b.style === 'cancel');
      dismiss(cancel);
      return true;
    });
    return () => sub.remove();
  }, [state.visible, state.buttons, dismiss]);

  // iOS-style: light frosted card, all buttons side-by-side as gray pills,
  // text color only distinguishes roles (cancel=dark, destructive=red, default=accent)
  const cardBg   = isDark ? 'rgba(44,44,46,0.97)'  : 'rgba(242,242,247,0.97)';
  const pillBg   = isDark ? 'rgba(68,68,70,0.90)'  : 'rgba(210,210,220,0.80)';
  const titleCol = isDark ? '#FFFFFF'               : '#000000';
  const msgCol   = isDark ? 'rgba(255,255,255,0.65)': 'rgba(0,0,0,0.55)';

  const btnTextColor = (btn: AlertButton) =>
    btn.style === 'destructive' ? '#FF3B30'
    : btn.style === 'cancel'    ? (isDark ? '#EBEBF5' : '#3C3C43')
    : colors.primary;

  const btnFontWeight = (btn: AlertButton): '500' | '600' | '700' =>
    btn.style === 'cancel' ? '500' : btn.style === 'destructive' ? '600' : '700';

  if (!state.visible) return null;
  return (
    <View style={[ss.overlay, state.center
      ? { top: 0, bottom: 0, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }
      : { top: insets.top + 8 }]} pointerEvents={state.center ? 'auto' : 'box-none'}>
      <View style={{ width: '100%', alignItems: 'center' }} pointerEvents="box-none">
        <View style={withAndroidShadowFix([ss.card, { backgroundColor: cardBg }])}>

          <View style={ss.header}>
            <Text style={[ss.title, { color: titleCol }]}>{state.title}</Text>
            {!!state.message && (
              <Text style={[ss.message, { color: msgCol }]}>{state.message}</Text>
            )}
          </View>

          {/* Buttons: cancel always full-width at bottom; actions in rows of 2 */}
          <View style={ss.btnArea}>
            {(() => {
              const cancelBtn  = state.buttons.find(b => b.style === 'cancel');
              const actionBtns = state.buttons.filter(b => b.style !== 'cancel');
              const rows: AlertButton[][] = [];
              for (let i = 0; i < actionBtns.length; i += 2)
                rows.push(actionBtns.slice(i, i + 2));
              return (
                <>
                  {rows.map((row, ri) => (
                    <View key={ri} style={[ss.row, ri > 0 && { marginTop: 8 }]}>
                      {row.map((btn, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[ss.pill, { flex: 1, marginLeft: i > 0 ? 8 : 0, backgroundColor: pillBg }]}
                          activeOpacity={0.7}
                          onPress={() => dismiss(btn)}
                        >
                          <Text style={[ss.pillText, { color: btnTextColor(btn), fontWeight: btnFontWeight(btn) }]}>
                            {btn.text}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                  {cancelBtn && (
                    <TouchableOpacity
                      style={[ss.pill, { marginTop: 8, backgroundColor: pillBg }]}
                      activeOpacity={0.7}
                      onPress={() => dismiss(cancelBtn)}
                    >
                      <Text style={[ss.pillText, { color: btnTextColor(cancelBtn), fontWeight: '500' }]}>
                        {cancelBtn.text}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </View>

        </View>
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  overlay:  {
    position: 'absolute', left: 0, right: 0, zIndex: 9999, elevation: 9999,
    alignItems: 'center', paddingHorizontal: 16,
  },
  card:     {
    width: '100%', maxWidth: 440, borderRadius: 18,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24 },
      android: { elevation: 20 },
    }),
  },
  header:   { paddingTop: 26, paddingBottom: 20, paddingHorizontal: 22 },
  title:    { fontSize: 17, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  message:  { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  btnArea:  { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 },
  row:      { flexDirection: 'row' },
  pill:     { borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 15, textAlign: 'center' },
});
