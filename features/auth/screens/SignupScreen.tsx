import { showAlert } from '@/components/AppAlert';
import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import GoogleIcon from '@/components/GoogleIcon';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { useFamilyStore } from '@/store/familyStore';
import { markPendingTermsAcceptance } from '@/lib/biometrics';
import { AnimatedCubeMark } from '@/components/FamilyCubeLogo';
import { RADIUS, SPACING , TYPO } from '@/constants/theme';

function friendlyAuthError(msg: string): string {
  if (!msg || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch'))
    return 'No internet connection. Please check your network and try again.';
  if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists'))
    return 'An account with this email already exists. Try signing in instead.';
  if (msg.toLowerCase().includes('too many requests'))
    return 'Too many attempts. Please wait a moment and try again.';
  return 'Something went wrong. Please try again.';
}

export default function SignupScreen() {
  const { colors, isDark } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const isIOS = Platform.OS === 'ios';
  const [appleAvailable, setAppleAvailable] = useState(true); // Default true to show all buttons immediately
  // Checkbox on this screen, not a dedicated full-screen Terms wall — the
  // wall was a real drop-off point (a long legal document was the very
  // first thing a new user hit, before they'd even created an account).
  // acceptTermsOnly() (authStore.ts) persists the real acceptance once a
  // session exists (right after signUp succeeds) — the checkbox itself is
  // just gating whether signup can proceed at all.
  const [termsAgreed, setTermsAgreed] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const recordTermsAcceptance = async () => {
    try { await useAuthStore.getState().acceptTermsOnly(); }
    catch (e: any) { console.warn('[SignupScreen] acceptTermsOnly failed', e?.message ?? e); }
  };

  const handleSignup = async () => {
    if (loading) return;
    if (!termsAgreed) {
      showAlert('Terms required', 'Please agree to the Terms & Privacy Policy to continue.');
      return;
    }
    const trimName  = fullName.trim();
    const trimEmail = email.trim().toLowerCase();
    if (!trimName || !trimEmail || !password) {
      showAlert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (trimName.length < 2) {
      showAlert('Name too short', 'Your name must be at least 2 characters.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) {
      showAlert('Invalid email', 'Please enter a valid email address (e.g. you@email.com).');
      return;
    }
    if (password.length < 8) {
      showAlert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9!@#$%^&*]/.test(password)) {
      showAlert('Weak password', 'Password must contain at least one letter and one number or symbol.');
      return;
    }
    setLoading(true);
    // Same cross-identity reset as LoginScreen.tsx's handleLogin — this
    // device may already hold a DIFFERENT identity's cached familyStore
    // state (e.g. someone joined a family via invite code here first,
    // anonymously, then this screen is used to create a brand-new
    // account without ever signing out of that first identity). Without
    // this, SetupFamilyScreen's own "does this auth user already have a
    // family" check, and every screen after it, could read stale cached
    // members/activeMemberId left over from the OTHER identity.
    await useFamilyStore.getState().reset();
    let data: Awaited<ReturnType<typeof supabase.auth.signUp>>['data'] | undefined;
    let error: Awaited<ReturnType<typeof supabase.auth.signUp>>['error'] | undefined;
    try {
      ({ data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
          emailRedirectTo: 'familycube://auth/callback',
        },
      }));
    } catch (e: any) {
      // A thrown network/unexpected error here previously left the screen on
      // its loading state forever with nothing shown — always resolve to a
      // visible alert and stay on this screen, never a silent stuck/blank
      // state.
      setLoading(false);
      showAlert('Signup failed', friendlyAuthError(e?.message ?? ''));
      return;
    }
    setLoading(false);
    if (error) {
      showAlert('Signup failed', friendlyAuthError(error.message));
      return;
    }
    // Supabase's signUp deliberately does NOT return an error for an
    // already-registered email (anti-enumeration) — it instead returns a
    // user object whose identities array is empty. This was previously
    // unhandled, so a repeat signup fell through to the "auto-confirmed,
    // let _layout.tsx route it" no-op branch below with no session and no
    // profile to route on — the actual cause of the reported blank screen.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      showAlert(
        'Account already exists',
        'An account with this email already exists. Try signing in instead.',
        [{ text: 'Sign in', onPress: () => router.replace('/(auth)/login') }, { text: 'Cancel', style: 'cancel' }]
      );
      return;
    }
    if (data?.user && !data.session) {
      // No session yet — acceptTermsOnly() needs one. Mark it pending so
      // _layout.tsx's post-verification profile fetch can record it once a
      // real session exists (after the user clicks the emailed link).
      await markPendingTermsAcceptance();
      showAlert(
        'Verify your email',
        'We sent a confirmation link to your email. Click it to activate your account.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
      return;
    }
    // Auto-confirmed — a real session exists right now, record acceptance
    // directly. Don't navigate here — _layout.tsx onAuthStateChange will
    // route to /onboarding, then through the full flow.
    await recordTermsAcceptance();
  };

  const handleAppleSignup = async () => {
    if (!termsAgreed) {
      showAlert('Terms required', 'Please agree to the Terms & Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    // Same cross-identity reset as handleSignup's own — see its comment.
    await useFamilyStore.getState().reset();
    try {
      if (Platform.OS === 'ios') {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        if (!credential.identityToken) {
          showAlert('Sign-up failed', 'No identity token received from Apple.');
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) showAlert('Sign-up failed', friendlyAuthError(error.message));
        else await recordTermsAcceptance();
      } else {
        const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
        const redirectUri = isExpoGo ? 'exp://127.0.0.1:8081/--/auth/callback' : 'familycube://auth/callback';
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: { redirectTo: redirectUri, skipBrowserRedirect: true },
        });
        if (error || !data?.url) { showAlert('Apple sign-up unavailable', friendlyAuthError(error?.message ?? '')); setLoading(false); return; }
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
        if (result.type === 'success' && result.url) {
          const hashPart  = result.url.split('#')[1] ?? '';
          const queryPart = result.url.split('?')[1]?.split('#')[0] ?? '';
          const accessToken  = new URLSearchParams(hashPart).get('access_token')  ?? new URLSearchParams(queryPart).get('access_token');
          const refreshToken = new URLSearchParams(hashPart).get('refresh_token') ?? new URLSearchParams(queryPart).get('refresh_token') ?? '';
          const code = new URLSearchParams(queryPart).get('code');
          if (accessToken) {
            const { error: se } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (se) showAlert('Sign-up failed', friendlyAuthError(se.message));
            else await recordTermsAcceptance();
          } else if (code) {
            const { error: ce } = await supabase.auth.exchangeCodeForSession(result.url);
            if (ce) showAlert('Sign-up failed', friendlyAuthError(ce.message));
            else await recordTermsAcceptance();
          }
        }
      }
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') showAlert('Sign-up failed', friendlyAuthError(e?.message ?? ''));
    }
    setLoading(false);
  };

  const handleGoogleSignup = async () => {
    if (loading) return;
    if (!termsAgreed) {
      showAlert('Terms required', 'Please agree to the Terms & Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    // Same cross-identity reset as handleSignup's own — see its comment.
    await useFamilyStore.getState().reset();
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    const redirectUri = (Platform.OS === 'android' && isExpoGo)
      ? 'exp://127.0.0.1:8081/--/auth/callback'
      : 'familycube://auth/callback';
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      setLoading(false);
      showAlert('Google sign-up unavailable', friendlyAuthError(error.message));
      return;
    }
    if (data?.url) {
      try {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

        if (result.type === 'success') {
          if (result.url) {

            // Try parsing from both fragment and query string
            const fragment = result.url.split('#')[1] ?? result.url.split('?')[1] ?? '';

            const urlObj = new URL(result.url);
            const accessToken = urlObj.searchParams.get('access_token') ?? urlObj.hash.match(/access_token=([^&]+)/)?.[1];
            const refreshToken = urlObj.searchParams.get('refresh_token') ?? urlObj.hash.match(/refresh_token=([^&]+)/)?.[1];
            if (accessToken && refreshToken) {
              const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
              if (sessionError) {
                setLoading(false);
                showAlert('Sign-up failed', friendlyAuthError(sessionError.message));
                return;
              }
              await recordTermsAcceptance();
              setLoading(false);
              // Don't navigate here — let onAuthStateChange in _layout.tsx route based on profile state
            } else {
              setLoading(false);
            }
          } else {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      } catch (err) {
        setLoading(false);
        showAlert('Browser error', String(err));
      }
    } else {
      setLoading(false);
    }
  };

  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={s.header}>
            <AnimatedCubeMark size={80} />
            <Text style={s.title}>Create your account</Text>
            <Text style={s.sub}>Start your Family Cube journey today</Text>
          </View>

          {/* Apple sign-up */}
          {isIOS ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={isDark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={RADIUS.md}
              style={{ height: 52, marginBottom: SPACING.sm }}
              onPress={handleAppleSignup}
            />
          ) : (
            <TouchableOpacity
              style={[s.appleBtn, { backgroundColor: isDark ? '#fff' : '#000' }]}
              onPress={handleAppleSignup}
              disabled={loading}>
              <Text style={{ fontSize: TYPO.heading, color: isDark ? '#000' : '#fff' }}></Text>
              <Text style={[s.appleBtnText, { color: isDark ? '#000' : '#fff' }]}>Sign up with Apple</Text>
            </TouchableOpacity>
          )}

          {/* Google sign-up */}
          <TouchableOpacity style={s.googleBtn} onPress={handleGoogleSignup} disabled={loading}>
            <GoogleIcon size={20} />
            <Text style={s.googleText}>Sign up with Google</Text>
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or with email</Text>
            <View style={s.dividerLine} />
          </View>

          <View style={s.form}>
            <Text style={s.label}>Full name</Text>
            <TextInput
              style={s.input}
              placeholder="Your name"
              placeholderTextColor={colors.placeholder}
              value={fullName}
              onChangeText={t => setFullName(t.replace(/[^\p{L}\s\-'.]/gu, ''))}
              returnKeyType="next"
              autoCorrect={false}
            />

            <Text style={[s.label, { marginTop: SPACING.md }]}>Email</Text>
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
                placeholder="At least 8 characters"
                placeholderTextColor={colors.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleSignup}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                <Text>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>

            {/* Checkbox here instead of a dedicated full-screen Terms wall
                — the wall was a real onboarding drop-off point (a long
                legal document as the very first thing a new user saw,
                before they'd even created an account). "Terms & Privacy"
                opens a read-only viewer (app/terms.tsx) that pops back
                here on close. */}
            <TouchableOpacity
              style={s.checkRow}
              onPress={() => setTermsAgreed(!termsAgreed)}
              activeOpacity={0.7}
            >
              <View style={[
                s.checkbox,
                {
                  borderColor: termsAgreed ? colors.primary : colors.inputBorder,
                  backgroundColor: termsAgreed ? colors.primary : 'transparent',
                },
              ]}>
                {termsAgreed && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <Text style={s.checkLabel}>
                I agree to the{' '}
                <Text
                  style={{ color: colors.primaryText ?? colors.primary, fontWeight: '600' }}
                  onPress={() => router.push('/terms' as any)}
                >
                  Terms & Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btn, (loading || !termsAgreed) && { opacity: 0.5 }]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Create account</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.linkBtn} onPress={() => router.back()}>
              <Text style={s.linkText}>
                Already have an account?{'  '}
                <Text style={{ color: colors.primaryText ?? colors.primary, fontWeight: '600' }}>Sign in</Text>
              </Text>
            </TouchableOpacity>

            {/* Someone without their own email (a kid or grandparent joining
                a family someone else set up) doesn't belong on this form at
                all — sends them back to the login screen's fork, where "I'm
                joining a family" is the actual first-class path (handles
                the anonymous-auth join-code flow there, not duplicated
                here). */}
            <TouchableOpacity style={s.linkBtn} onPress={() => router.replace('/(auth)/login')}>
              <Text style={s.linkText}>
                No email?{'  '}
                <Text style={{ color: colors.primaryText ?? colors.primary, fontWeight: '600' }}>Join with an invite code instead</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('@/lib/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, padding: SPACING.xxl },
    back: { marginBottom: SPACING.xl, alignSelf: 'flex-start' },
    header: { alignItems: 'center', marginBottom: SPACING.xl },
    logoBrand: { width: 80, height: 80, marginBottom: SPACING.md, resizeMode: 'contain' },
    title: { fontSize: TYPO.hero, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
    sub: { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 4 },
    googleBtn: {
      height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderWidth: 1, borderColor: colors.borderMed,
      borderRadius: RADIUS.md, marginBottom: SPACING.lg,
      backgroundColor: colors.card,
    },
    appleBtn: {
      height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderRadius: RADIUS.md, marginBottom: SPACING.sm,
    },
    appleBtnText: { fontSize: TYPO.body, fontWeight: '600' },

    googleText: { fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.lg },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: TYPO.body, color: colors.textSecondary },
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
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACING.sm, paddingVertical: 4 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    checkLabel: { flex: 1, fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 },
    btn: {
      height: 52,
      backgroundColor: colors.primary,
      borderRadius: RADIUS.md,
      alignItems: 'center', justifyContent: 'center',
      marginTop: SPACING.md,
    },
    btnText: { color: '#fff', fontSize: TYPO.subheading, fontWeight: '700' },
    linkBtn: { marginTop: SPACING.lg, alignItems: 'center' },
    linkText: { fontSize: TYPO.body, color: colors.textSecondary },
  });
