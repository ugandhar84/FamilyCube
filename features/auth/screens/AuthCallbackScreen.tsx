import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

// Handles the familycube://auth/callback deep link redirect from:
//   - Email confirmation links
//   - Google OAuth redirects (Android / fallback)
//
// Supabase appends tokens in the URL fragment: #access_token=...&refresh_token=...
// expo-router exposes fragment params via useLocalSearchParams on native.
export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    token?: string;
    type?: string;
    error?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    const { access_token, refresh_token, token, type, error } = params;

    if (error) {
      console.warn('[AuthCallback] OAuth error:', error, params.error_description);
      router.replace('/(auth)/login');
      return;
    }

    // OAuth / magic-link with access_token in fragment
    if (access_token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token: refresh_token ?? '',
      });
      if (sessionError) {
        console.error('[AuthCallback] setSession failed:', sessionError.message);
        router.replace('/(auth)/login');
      }
      // onAuthStateChange in _layout.tsx handles navigation to /(tabs)
      return;
    }

    // Email confirmation OTP token
    if (token && type) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: type as any,
      });
      if (verifyError) {
        console.error('[AuthCallback] verifyOtp failed:', verifyError.message);
        router.replace('/(auth)/login');
      }
      return;
    }

    // Nothing to process — _layout.tsx onAuthStateChange will handle navigation
    // (tokens arrive via openAuthSessionAsync on Android, not as search params)
    console.log('[AuthCallback] No tokens in params — waiting for _layout navigation');
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <PawBondLoader size={56} />
      <Text style={{ marginTop: 14, fontSize: TYPO.body, color: colors.textSecondary }}>Signing you in…</Text>
    </View>
  );
}
