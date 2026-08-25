import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import GoogleIcon from '@/components/GoogleIcon';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import {
  isBiometricEnabled, isBiometricAvailable, getBiometricLabel,
  authenticateWithBiometricsDetailed, getBiometricSession, clearBiometricSession,
} from '@/lib/biometrics';
import { RADIUS, SPACING , TYPO } from '@/constants/theme';

function friendlyAuthError(msg: string): string {
  if (!msg || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch'))
    return 'No internet connection. Please check your network and try again.';
  if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid credentials'))
    return 'Incorrect email or password.';
  if (msg.toLowerCase().includes('email not confirmed'))
    return 'Please verify your email before signing in.';
  if (msg.toLowerCase().includes('too many requests'))
    return 'Too many attempts. Please wait a moment and try again.';
  return 'Something went wrong. Please try again.';
}

// Required for expo-web-browser OAuth redirect handling on iOS
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { signedOut } = useLocalSearchParams<{ signedOut?: string }>();
  // signedOut=1 means the user explicitly tapped "Sign out". Suppress the Face ID
  // auto-prompt so they aren't instantly logged back in (sign-out loop).
  const justSignedOut = signedOut === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Two genuinely different audiences were previously stacked as six
  // equal-weight options on one long scroll (Face ID, email form, Apple,
  // Google, forgot-password, sign-up, AND invite-code all competing for
  // attention) — a kid or grandparent joining with just a code had to
  // scroll past a whole email/password/OAuth form meant for someone else
  // entirely to find their actual path. This makes the fork explicit and
  // upfront: 'choose' shows just the two tiles, 'email' reveals today's
  // full form unchanged, 'code' jumps straight past any email UI at all.
  const [mode, setMode] = useState<'choose' | 'email'>('choose');
  const [startingCode, setStartingCode] = useState(false);

  // "Log in with Face ID" — shown when biometric is enabled and we have a saved
  // session token to restore (e.g. after signing out). Same pattern as banking apps.
  const [bioReady, setBioReady] = useState(false);
  const [bioLabel, setBioLabel] = useState('Face ID');
  const [bioLoading, setBioLoading] = useState(false);
  const isIOS = Platform.OS === 'ios';
  const [appleAvailable, setAppleAvailable] = useState(true); // Default true to show all buttons immediately

  const biometricLogin = useCallback(async (label?: string) => {
    setBioLoading(true);
    const { success, error } = await authenticateWithBiometricsDetailed(`Sign in with ${label ?? bioLabel}`);
    if (!success) {
      setBioLoading(false);
      if (error && !['user_cancel', 'system_cancel', 'app_cancel'].includes(error)) {
        showAlert('Could not authenticate', error);
      }
      return;
    }

    // Preferred path: the session is still alive (we "locked" instead of a real
    // sign-out), so just reveal the app. Zero token gymnastics → always works.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setBioLoading(false);
      router.replace('/(tabs)');
      return;
    }

    // Fallback: no live session (e.g. cold start after a real logout). Try to
    // restore from a stored token if one exists.
    const saved = await getBiometricSession();
    if (saved) {
      const { error: setErr } = await supabase.auth.setSession(saved);
      setBioLoading(false);
      if (setErr) {
        await clearBiometricSession();
        setBioReady(false);
        showAlert('Session expired', 'Please sign in with your password once to re-enable Face ID.');
        return;
      }
      return; // SIGNED_IN handles navigation
    }
    setBioLoading(false);
    showAlert('Sign in required', 'Please sign in with your email and password.');
  }, [bioLabel]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const enabled = await isBiometricEnabled();
        const available = enabled ? await isBiometricAvailable() : false;
        // Show the Face ID button whenever biometric is enabled + available.
        // The session is usually still alive (locked, not signed out); a stored
        // token is only the fallback path.
        if (enabled && available) {
          const label = await getBiometricLabel();
          setBioLabel(label);
          setBioReady(true);
          // Don't auto-trigger after an explicit sign-out — the user would be
          // instantly logged back in, making sign-out feel broken.
          if (!justSignedOut) {
            timer = setTimeout(() => biometricLogin(label), 400);
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  const handleLogin = async () => {
    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail || !password) {
      showAlert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) {
      showAlert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      showAlert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setLoading(false);
      showAlert('Login failed', friendlyAuthError(error.message));
      return;
    }
    // Session persists via Supabase's storage; _layout saves the biometric
    // session token on SIGNED_IN when biometric is enabled.
    setLoading(false);
  };

  const handleAppleLogin = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'ios') {
        // Native Apple Sign In on iOS
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        if (!credential.identityToken) {
          showAlert('Sign-in failed', 'No identity token received from Apple.');
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) showAlert('Sign-in failed', friendlyAuthError(error.message));
      } else {
        // Web OAuth flow for Android (same pattern as Google)
        const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
        const redirectUri = isExpoGo ? 'exp://127.0.0.1:8081/--/auth/callback' : 'familycube://auth/callback';
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: { redirectTo: redirectUri, skipBrowserRedirect: true },
        });
        if (error || !data?.url) { showAlert('Apple sign-in unavailable', friendlyAuthError(error?.message ?? '')); setLoading(false); return; }
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
        if (result.type === 'success' && result.url) {
          const hashPart  = result.url.split('#')[1] ?? '';
          const queryPart = result.url.split('?')[1]?.split('#')[0] ?? '';
          const accessToken  = new URLSearchParams(hashPart).get('access_token')  ?? new URLSearchParams(queryPart).get('access_token');
          const refreshToken = new URLSearchParams(hashPart).get('refresh_token') ?? new URLSearchParams(queryPart).get('refresh_token') ?? '';
          const code = new URLSearchParams(queryPart).get('code');
          if (accessToken) {
            const { error: se } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (se) showAlert('Sign-in failed', friendlyAuthError(se.message));
          } else if (code) {
            const { error: ce } = await supabase.auth.exchangeCodeForSession(result.url);
            if (ce) showAlert('Sign-in failed', friendlyAuthError(ce.message));
          }
        }
      }
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') showAlert('Sign-in failed', friendlyAuthError(e?.message ?? ''));
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      // iOS: ASWebAuthenticationSession intercepts any scheme automatically → use app scheme
      // Android Expo Go: familycube:// not registered as intent filter → use exp:// so
      //   Chrome Custom Tabs can hand back to Expo Go after OAuth completes
      // Android standalone/dev-client: app scheme is registered → use familycube://
      const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
      const redirectUri = (Platform.OS === 'android' && isExpoGo)
        ? 'exp://127.0.0.1:8081/--/auth/callback'    // adb reverse: localhost tunnels to Metro
        : 'familycube://auth/callback';


      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data?.url) {
        showAlert(
          'Google sign-in unavailable',
          'Enable Google under Supabase Dashboard → Authentication → Providers, then add the redirect URL to Allowed Redirect URLs.',
        );
        setLoading(false);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

      if (result.type === 'success' && result.url) {
        // Try hash fragment first (implicit flow), then query string (PKCE flow)
        const hashPart  = result.url.split('#')[1] ?? '';
        const queryPart = result.url.split('?')[1]?.split('#')[0] ?? '';
        const hashParams  = new URLSearchParams(hashPart);
        const queryParams = new URLSearchParams(queryPart);

        const accessToken  = hashParams.get('access_token')  ?? queryParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') ?? queryParams.get('refresh_token') ?? '';
        const code         = queryParams.get('code');

        if (accessToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) showAlert('Sign-in failed', friendlyAuthError(sessionError.message));
        } else if (code) {
          // PKCE code exchange
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
          if (exchangeError) showAlert('Sign-in failed', friendlyAuthError(exchangeError.message));
        } else {
          showAlert('Sign-in incomplete', 'No token received. Ensure Google is configured in Supabase.');
        }
        // onAuthStateChange in _layout.tsx handles navigation
      }
      // result.type === 'cancel' → user closed the browser, do nothing
    } catch (e: any) {
      showAlert('Sign-in failed', friendlyAuthError(e?.message ?? ''));
    }
    setLoading(false);
  };

  const s = makeStyles(colors, isDark);

  const startCodeFlow = async () => {
    if (startingCode) return;
    setStartingCode(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) { setStartingCode(false); showAlert('Could not start', 'Please try again.'); return; }
    }
    setStartingCode(false);
    router.push('/onboarding/join-family');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={s.logoWrap}>
            <AnimatedCubeMark size={100} />
            <Text style={s.logoText}>Family Cube</Text>
            <Text style={s.logoSub}>Connect. Organize. Care. Grow.</Text>
          </View>

          {mode === 'choose' && (
            <View style={{ gap: SPACING.md }}>
              {/* Log in with Face ID / Touch ID — a returning user's fastest
                  path, kept visible right on the fork instead of a tap
                  deeper, since biometric auto-triggers on mount anyway and
                  this is just the manual fallback for that. */}
              {bioReady && (
                <>
                  <TouchableOpacity
                    style={[s.bioBtn, { borderColor: colors.primary }]}
                    onPress={() => biometricLogin()}
                    disabled={bioLoading}
                    activeOpacity={0.85}
                  >
                    {bioLoading ? (
                      <ActivityIndicator color={colors.primaryText ?? colors.primary} />
                    ) : (
                      <>
                        <Ionicons
                          name={bioLabel === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
                          size={20}
                          color={colors.primaryText ?? colors.primary}
                        />
                        <Text style={[s.bioText, { color: colors.primaryText ?? colors.primary }]}>Log in with {bioLabel}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.switchBtn, { marginTop: -SPACING.sm }]}
                    activeOpacity={0.7}
                    onPress={() => showAlert(
                      'Switch account',
                      'This will remove the saved Face ID session so you can sign in as a different account.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Switch account',
                          style: 'destructive',
                          onPress: async () => {
                            await clearBiometricSession();
                            setBioReady(false);
                          },
                        },
                      ],
                    )}
                  >
                    <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
                    <Text style={[s.switchText, { color: colors.textSecondary }]}>Switch account</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* The fork — two genuinely different audiences: someone with
                  their own email/account, vs. someone (often a kid or
                  grandparent) joining a family that's already set up, who
                  has neither an email nor a password to enter. */}
              <TouchableOpacity style={s.choiceCard} activeOpacity={0.85} onPress={() => setMode('email')}>
                <View style={[s.choiceIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="mail-outline" size={22} color={colors.primaryText ?? colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.choiceTitle}>I have an account</Text>
                  <Text style={s.choiceSub}>Sign in with email, Apple, or Google</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity style={s.choiceCard} activeOpacity={0.85} disabled={startingCode} onPress={startCodeFlow}>
                <View style={[s.choiceIcon, { backgroundColor: colors.amber + '18' }]}>
                  {startingCode
                    ? <ActivityIndicator size="small" color={colors.amber} />
                    : <Ionicons name="key-outline" size={22} color={colors.amber} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.choiceTitle}>I'm joining a family</Text>
                  <Text style={s.choiceSub}>Enter the invite code someone gave you — no email needed</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity style={[s.linkBtn, { marginTop: SPACING.sm }]} onPress={() => router.push('/(auth)/signup')}>
                <Text style={s.linkText}>
                  New here?{'  '}
                  <Text style={{ color: colors.primaryText ?? colors.primary, fontWeight: '600' }}>Create a family account</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === 'email' && (
            <>
              <TouchableOpacity style={s.backToChoice} onPress={() => setMode('choose')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
                <Text style={s.backToChoiceText}>Back</Text>
              </TouchableOpacity>

              <View style={s.form}>
                <Text style={s.label}>Email</Text>
                <TextInput
                  style={s.input}
                  placeholder="you@email.com"
                  placeholderTextColor={colors.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                  autoCorrect={false}
                />

                <Text style={[s.label, { marginTop: SPACING.md }]}>Password</Text>
                <View style={s.passwordWrap}>
                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                    placeholder="••••••••"
                    placeholderTextColor={colors.placeholder}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                    <Text style={s.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[s.btn, loading && { opacity: 0.7 }]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnText}>Sign in</Text>
                  }
                </TouchableOpacity>

                <View style={s.dividerRow}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerText}>or</Text>
                  <View style={s.dividerLine} />
                </View>

                {/* Apple Sign In — native on iOS, web OAuth on Android */}
                {isIOS ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={isDark
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={RADIUS.md}
                    style={{ height: 52, marginTop: SPACING.sm }}
                    onPress={handleAppleLogin}
                  />
                ) : (
                  <TouchableOpacity style={[s.appleBtn, { backgroundColor: isDark ? '#fff' : '#000' }]} onPress={handleAppleLogin} disabled={loading}>
                    <Text style={{ fontSize: TYPO.heading, color: isDark ? '#000' : '#fff' }}></Text>
                    <Text style={[s.appleBtnText, { color: isDark ? '#000' : '#fff' }]}>Sign in with Apple</Text>
                  </TouchableOpacity>
                )}

                {/* Google */}
                <TouchableOpacity style={s.googleBtn} onPress={handleGoogleLogin} disabled={loading}>
                  <GoogleIcon size={20} />
                  <Text style={s.googleText}>Continue with Google</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.linkBtn} onPress={() => showAlert('Reset password', 'Check your email for a reset link after we send it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Send', onPress: async () => {
                  const trimmedEmail = email.trim().toLowerCase();
                  if (!trimmedEmail) { showAlert('Enter your email first'); return; }
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { showAlert('Invalid email', 'Please enter a valid email address.'); return; }
                  const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
                  if (error) { showAlert('Could not send reset link', friendlyAuthError(error.message)); return; }
                  showAlert('Sent!', 'Check your inbox for a reset link.');
                }}])}>
                  <Text style={s.forgotText}>Forgot password?</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.linkBtn} onPress={() => router.push('/(auth)/signup')}>
                  <Text style={s.linkText}>
                    No account?{'  '}
                    <Text style={{ color: colors.primaryText ?? colors.primary, fontWeight: '600' }}>Create one free</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('@/lib/ThemeContext').useTheme>['colors'], isDark: boolean) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xxl },
    logoWrap: { alignItems: 'center', marginBottom: SPACING.xxxl },
    logoBrand: { width: 100, height: 100, marginBottom: SPACING.md, resizeMode: 'contain' },
    logoText: { fontSize: 38, fontWeight: '700', color: colors.primaryText ?? colors.primary, letterSpacing: -0.5 },
    logoSub: { fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.xs, lineHeight: 20 },

    biometricBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: colors.primaryLight,
      borderRadius: RADIUS.lg, paddingVertical: 14, marginBottom: SPACING.lg,
      borderWidth: 1, borderColor: colors.primary + '40',
    },
    biometricEmoji: { fontSize: TYPO.title },
    biometricText: { fontSize: TYPO.body, fontWeight: '600', color: colors.primaryText ?? colors.primary },

    bioBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderWidth: 1.5, borderRadius: RADIUS.lg, paddingVertical: 14,
      marginBottom: SPACING.lg,
    },
    bioText: { fontSize: TYPO.body, fontWeight: '700' },
    switchBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
      marginTop: -SPACING.sm, marginBottom: SPACING.lg, paddingVertical: 6,
    },
    switchText: { fontSize: TYPO.caption, fontWeight: '500' },

    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.lg },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: TYPO.body, color: colors.textSecondary, whiteSpace: 'nowrap' } as any,

    form: { width: '100%' },
    label: { fontSize: TYPO.body, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
    input: {
      height: 50,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.lg,
      fontSize: TYPO.body,
      color: colors.textPrimary,
      backgroundColor: colors.inputBg,
      marginBottom: SPACING.sm,
    },
    passwordWrap: { flexDirection: 'row', marginBottom: SPACING.sm },
    eyeBtn: {
      width: 50, height: 50,
      borderWidth: 1, borderLeftWidth: 0,
      borderColor: colors.inputBorder,
      borderTopRightRadius: RADIUS.md, borderBottomRightRadius: RADIUS.md,
      backgroundColor: colors.inputBg,
      alignItems: 'center', justifyContent: 'center',
    },
    eyeText: { fontSize: TYPO.heading },

    btn: {
      height: 52,
      backgroundColor: colors.primary,
      borderRadius: RADIUS.md,
      alignItems: 'center', justifyContent: 'center',
      marginTop: SPACING.md,
    },
    btnText: { color: '#fff', fontSize: TYPO.subheading, fontWeight: '700' },

    appleBtn: {
      height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: RADIUS.md, marginTop: SPACING.sm,
    },
    appleBtnText: { fontSize: TYPO.body, fontWeight: '600' },
    googleBtn: {
      height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderWidth: 1, borderColor: colors.borderMed,
      borderRadius: RADIUS.md, marginTop: SPACING.sm,
      backgroundColor: colors.card,
    },

    googleText: { fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary },

    linkBtn: { marginTop: SPACING.lg, alignItems: 'center' },
    forgotText: { fontSize: TYPO.body, color: colors.primaryText ?? colors.primary, fontWeight: '500' },
    linkText: { fontSize: TYPO.body, color: colors.textSecondary },

    choiceCard: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
      borderWidth: 1.5, borderColor: colors.border, borderRadius: RADIUS.lg,
      backgroundColor: colors.card, padding: SPACING.lg,
    },
    choiceIcon: {
      width: 44, height: 44, borderRadius: RADIUS.md,
      alignItems: 'center', justifyContent: 'center',
    },
    choiceTitle: { fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary },
    choiceSub: { fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 },

    backToChoice: {
      flexDirection: 'row', alignItems: 'center', gap: 2,
      alignSelf: 'flex-start', marginBottom: SPACING.lg,
    },
    backToChoiceText: { fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '500' },
  });
