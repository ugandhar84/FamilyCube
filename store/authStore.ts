import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { usePreferenceStore } from '@/store/preferenceStore';
import { clearWeatherCache } from '@/lib/weather';
import { resetAppSettingsSubscription } from '@/lib/hooks/useAppSettings';
import { useNotifStore } from '@/store/notifStore';
import { useFamilyStore } from '@/store/familyStore';

export const TERMS_VERSION = '1.0';

export interface UserProfile {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  phone: string | null;
  timezone: string | null;
  bio: string | null;
  created_at: string;
  ai_mood_consent: boolean;
  ai_mood_consent_date: string | null;
  onboarding_completed: boolean;
  terms_accepted: boolean;
  terms_accepted_at: string | null;
  terms_version: string | null;
  ai_consent_accepted: boolean;
  ai_consent_accepted_at: string | null;
  is_admin: boolean;
  deleted_at: string | null;
}

const PROFILE_COLS = 'id, full_name, handle, avatar_url, phone, timezone, bio, created_at, ai_mood_consent, ai_mood_consent_date, onboarding_completed, terms_accepted, terms_accepted_at, terms_version, ai_consent_accepted, ai_consent_accepted_at, is_admin, deleted_at';

// In-flight dedup: if fetchProfile is already running for a uid, return the same promise
const _profileFetching = new Map<string, Promise<void>>();
// TTL: back-to-back triggers (getSession + INITIAL_SESSION + screen focus) within this
// window reuse the cached profile instead of refetching
const PROFILE_TTL_MS = 15_000;
let _profileFetchedAt = 0;
/** Force the next fetchProfile to hit the DB (call after profile mutations). */
export function invalidateProfileCache() { _profileFetchedAt = 0; }

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  biometricEnabled: boolean;
  loading: boolean;

  setSession: (session: Session | null) => void;
  fetchProfile: (userId?: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  acceptTerms: () => Promise<void>;
  acceptAiConsent: (accepted: boolean) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  // forceGlobal: skip the biometric-preserve branch entirely and always do
  // a full/global sign-out, even if biometric is enabled — for "sign in as
  // a different account" flows, where preserving a restorable token for the
  // account being abandoned would be wrong. Every other side effect (push-
  // token removal, all store resets including familyStore.reset(), cache
  // clearing) still runs identically regardless of this flag.
  signOut: (opts?: { forceGlobal?: boolean }) => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  biometricEnabled: false,
  loading: false,

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
    if (session?.user) get().fetchProfile(session.user.id);
    else set({ profile: null });
  },

  fetchProfile: async (userId) => {
    const uid = userId ?? get().user?.id;
    if (!uid) return;
    // Deduplicate concurrent calls for the same user (e.g. getSession + onAuthStateChange both fire)
    if (_profileFetching.has(uid)) return _profileFetching.get(uid)!;
    // TTL guard — skip when we already have this user's profile and it's fresh
    if (get().profile?.id === uid && Date.now() - _profileFetchedAt < PROFILE_TTL_MS) return;
    const promise = (async () => {
    // Try to read the existing profile first
    let { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.warn('[authStore] fetchProfile select error:', error.message);
      // A single missing/renamed column (schema drift between this client
      // build and the live DB) previously failed the WHOLE select and left
      // `profile` null forever with no fallback — any screen/gate reading
      // onboarding_completed/terms_accepted off this store then had nothing
      // to route on. Retry with only the columns app/_layout.tsx's own
      // routing gate actually needs, so a drifted optional column (like the
      // missing ai_mood_consent case this was written for) can't take down
      // profile loading entirely.
      const retry = await supabase
        .from('profiles')
        .select('id, full_name, handle, onboarding_completed, terms_accepted, deleted_at')
        .eq('id', uid)
        .maybeSingle();
      if (retry.error || !retry.data) {
        console.warn('[authStore] fetchProfile fallback select also failed:', retry.error?.message);
        return;
      }
      set({ profile: retry.data as UserProfile });
      _profileFetchedAt = Date.now();
      return;
    }
    if (data) {
      set({ profile: data as UserProfile });
      _profileFetchedAt = Date.now();
      return;
    }
    // No row yet — seed it once with the OAuth display name
    const user = get().session?.user;
    const { data: created } = await supabase
      .from('profiles')
      .insert({ id: uid, full_name: user?.user_metadata?.full_name ?? null, onboarding_completed: false, terms_accepted: false })
      .select(PROFILE_COLS)
      .single();
    if (created) set({ profile: created as UserProfile });
    })();
    _profileFetching.set(uid, promise);
    try { await promise; } finally { _profileFetching.delete(uid); }
  },

  updateProfile: async (updates) => {
    const uid = get().user?.id;
    if (!uid) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', uid)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new Error(error.message);
    if (data) set({ profile: data as UserProfile });
  },

  acceptTerms: async () => {
    const uid = get().user?.id;
    if (!uid) throw new Error('Not signed in');
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('profiles')
      .update({ terms_accepted: true, terms_accepted_at: now, terms_version: TERMS_VERSION, onboarding_completed: true })
      .eq('id', uid)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new Error(error.message);
    if (data) set({ profile: data as UserProfile });
  },

  acceptAiConsent: async (accepted: boolean) => {
    const uid = get().user?.id;
    if (!uid) throw new Error('Not signed in');
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('profiles')
      .update({ ai_consent_accepted: accepted, ai_consent_accepted_at: now })
      .eq('id', uid)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new Error(error.message);
    if (data) set({ profile: data as UserProfile });
  },

  completeOnboarding: async () => {
    const uid = get().user?.id;
    if (!uid) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', uid)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new Error(error.message);
    if (data) set({ profile: data as UserProfile });
  },

  signOut: async (opts) => {
    set({ loading: true });

    const userId = get().user?.id ?? null;

    // Always remove the push token for this device before signing out.
    // This prevents cron notifications from reaching a device that no longer
    // has an active session (and prevents a different user who logs in next
    // from inheriting pending pushes meant for this account).
    if (userId) {
      try {
        const { removePushToken } = await import('@/lib/notifications');
        await removePushToken(userId);
      } catch { /* ignore */ }
    }

    // If biometric login is enabled, sign out LOCALLY so the refresh token
    // stays valid and Face ID can restore the session later. Otherwise do a
    // full (global) sign-out that revokes the token server-side.
    // Skipped entirely when forceGlobal is set (e.g. "sign in as a
    // different account") — localOnly simply stays false, so the call below
    // defaults to a global sign-out regardless of biometric state.
    let localOnly = false;
    if (!opts?.forceGlobal) {
      try {
        const { isBiometricEnabled, saveBiometricSession } = await import('@/lib/biometrics');
        const enabled = await isBiometricEnabled();
        console.log('[Bio] signOut: biometricEnabled =', enabled);
        if (enabled) {
          // Capture the CURRENT session tokens right now. Supabase rotates refresh
          // tokens on every refresh, so a token saved earlier may already be
          // stale — grabbing it at sign-out time gives the freshest valid one.
          const { data: { session } } = await supabase.auth.getSession();
          console.log('[Bio] signOut: hasLiveSession =', !!session, '| hasRefresh =', !!session?.refresh_token);
          if (session?.refresh_token) {
            await saveBiometricSession(session.access_token, session.refresh_token);
            localOnly = true;
            console.log('[Bio] signOut: saved biometric session token ✓ (local sign-out)');
          }
        }
      } catch { /* ignore */ }
    }
    await supabase.auth.signOut(localOnly ? { scope: 'local' } : undefined);
    set({ session: null, user: null, profile: null, loading: false });
    useSubscriptionStore.getState().reset();
    usePreferenceStore.getState().reset();
    useNotifStore.getState().reset();
    // Critical: familyStore caches members/activeMemberId under fixed
    // (non-user-scoped) AsyncStorage keys, and derives which family to
    // query on next load from whatever's already cached. Without this,
    // signing out and back in as a DIFFERENT account kept showing (and
    // re-querying) the previous account's family — a real cross-account
    // data leak, not just a stale-UI flash.
    await useFamilyStore.getState().reset();
    clearWeatherCache();
    resetAppSettingsSubscription();
  },

  setBiometricEnabled: (enabled) => set({ biometricEnabled: enabled }),
}));
