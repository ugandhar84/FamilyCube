/**
 * useProfileSettings — encapsulates security and stats state for ProfileScreen.
 *
 * Owns: biometric availability/enabled, screenshot protection, AI consent,
 * media retention config, and mood-scan count. All have their own useEffects
 * so they're loaded once on mount and cached where possible.
 *
 * Returns values plus toggle callbacks so the screen stays thin.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  isBiometricAvailable, isBiometricEnabled, setBiometricEnabled,
  getBiometricLabel, saveBiometricSession, clearBiometricSession,
} from '@/lib/biometrics';
import { isScreenshotProtectionEnabled, setScreenshotProtection } from '@/lib/screenshotProtection';
import { showAlert } from '@/components/AppAlert';

// Module-level caches — survive tab switches, reset on app restart only
let _mediaRetentionCache: { enabled: boolean; days: number } | null = null;
const _moodScanCountCache = new Map<string, { count: number; ts: number }>();

export function useProfileSettings(activePetId: string | null, profile: any) {
  // ─── Biometrics ──────────────────────────────────────────────────────────────
  const [bioAvailable,    setBioAvailable]    = useState(false);
  const [bioEnabled,      setBioEnabledState] = useState(false);
  const [bioLabel,        setBioLabel]        = useState('Biometrics');

  // ─── Screenshot protection ──────────────────────────────────────────────────
  // Default true so there's no momentary flash of "unprotected" on mount
  const [screenshotProtect, setScreenshotProtectState] = useState(true);

  // ─── AI consent ─────────────────────────────────────────────────────────────
  const [aiConsent, setAiConsentState] = useState(false);

  // ─── Media retention config ──────────────────────────────────────────────────
  // Fetched once per session; reflects the admin-configured window so the copy
  // in the UI never drifts out of sync with what actually happens server-side.
  const [mediaRetention, setMediaRetention] = useState<{ enabled: boolean; days: number } | null>(null);

  // ─── Mood scan count ─────────────────────────────────────────────────────────
  const [moodScanCount, setMoodScanCount] = useState<number | null>(null);

  // Load biometrics and screenshot protection once on mount
  useEffect(() => {
    (async () => {
      const [available, enabled, label, screenshotEnabled] = await Promise.all([
        isBiometricAvailable(), isBiometricEnabled(), getBiometricLabel(),
        isScreenshotProtectionEnabled(),
      ]);
      setBioAvailable(available);
      setBioEnabledState(enabled);
      setBioLabel(label);
      setScreenshotProtectState(screenshotEnabled);
    })();
  }, []);

  // Sync AI consent whenever profile loads
  useEffect(() => {
    if (profile) setAiConsentState((profile as any).ai_mood_consent ?? false);
  }, [profile]);

  // Media retention — single fetch per session, cached in module scope
  useEffect(() => {
    if (_mediaRetentionCache) { setMediaRetention(_mediaRetentionCache); return; }
    supabase
      .from('media_retention_config').select('enabled,retain_days')
      .eq('category', 'social_post').maybeSingle()
      .then(({ data }) => {
        if (data) {
          _mediaRetentionCache = { enabled: data.enabled, days: data.retain_days };
          setMediaRetention(_mediaRetentionCache);
        }
      });
  }, []);

  // Mood scan count — 1h cache keyed by petId
  useEffect(() => {
    if (!activePetId) return;
    const cached = _moodScanCountCache.get(activePetId);
    if (cached && Date.now() - cached.ts < 3_600_000) { setMoodScanCount(cached.count); return; }
    supabase
      .from('mood_logs').select('id', { count: 'exact', head: true })
      .eq('pet_id', activePetId)
      .then(({ count }) => {
        const c = count ?? 0;
        _moodScanCountCache.set(activePetId, { count: c, ts: Date.now() });
        setMoodScanCount(c);
      });
  }, [activePetId]);

  // ─── Toggle handlers ─────────────────────────────────────────────────────────

  const toggleBiometric = async (val: boolean) => {
    setBioEnabledState(val); // optimistic
    try {
      await setBiometricEnabled(val);
      if (val) {
        // Persist session tokens so Face ID can restore the session after sign-out
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.refresh_token) {
          await saveBiometricSession(session.access_token, session.refresh_token);
        }
        showAlert(`${bioLabel} enabled`, `You can now unlock PawBond with ${bioLabel}.`);
      } else {
        await clearBiometricSession();
      }
    } catch (e: any) {
      setBioEnabledState(!val); // revert on failure
      showAlert('Could not update', e?.message ?? 'Please try again.');
    }
  };

  const toggleScreenshotProtection = async (val: boolean) => {
    setScreenshotProtectState(val);
    try {
      await setScreenshotProtection(val);
    } catch {
      setScreenshotProtectState(!val); // revert on failure
    }
  };

  return {
    bioAvailable, bioEnabled, bioLabel,
    screenshotProtect,
    aiConsent,
    mediaRetention,
    moodScanCount,
    toggleBiometric,
    toggleScreenshotProtection,
  };
}
