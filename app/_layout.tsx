import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { showAlert } from '@/components/AppAlert';
import { useEffect, useRef, useState, useCallback } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { StyleSheet, AppState, LogBox, Linking, Modal, View, Text, TouchableOpacity, SafeAreaView, Image, Platform } from 'react-native';
import FamilyCubeSplashScreen from '@/components/FamilyCubeSplashScreen';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { updateStreak, awardCoins } from '@/lib/db/rewards';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AppAlert from '@/components/AppAlert';
import AppToast from '@/components/AppToast';
import OfflineBanner from '@/components/OfflineBanner';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';
import { ThemeProvider, useTheme } from '@/lib/ThemeContext';
import { useAuthStore, invalidateProfileCache } from '@/store/authStore';
import { useWidgetSync } from '@/lib/hooks/useWidgetSync';
import { savePushToken, saveTokenToMember, addNotificationResponseListener, addNotificationReceivedListener, registerNotificationCategories } from '@/lib/notifications';
import { todayLocal } from '@/lib/dates';
import { reloadBlockedWords } from '@/lib/profanityFilter';
import { isBiometricEnabled, isBiometricAvailable, saveBiometricSession } from '@/lib/biometrics';
import { applyScreenshotProtection } from '@/lib/screenshotProtection';
import { dbg, dbgWarn, dbgError } from '@/lib/debug';
import { useDeviceClass } from '@/lib/useDeviceClass';
import { initRevenueCat } from '@/lib/subscription';
import { prefetchFeatureFlags } from '@/lib/featureFlags';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import PaywallSheet from '@/components/PaywallSheet';
import PickerLoadingOverlay from '@/components/PickerLoadingOverlay';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';
import { useNotifStore } from '@/store/notifStore';
import { useChoreStore } from '@/store/choreStore';
import { useEventStore } from '@/store/eventStore';
import { useChatStore } from '@/store/chatStore';
import NotificationPanel, { routeForNotification } from '@/components/NotificationPanel';
import AppPinLockOverlay from '@/components/AppPinLockOverlay';
import { useFamilyStore } from '@/store/familyStore';
import { startBatteryPolling, stopBatteryPolling } from '@/lib/locationTracking';
import { registerStoreGeofences } from '@/lib/storeGeofencing';
import {
  setupCallAlerts, listenForVoipToken, saveVoipTokenToMember,
  registerAndroidVoipToken, listenForForegroundCallReminder,
  listenForCallReminderAnswered, wasReminderCallJustAnswered,
  listenForCallReminderEnded,
  checkLastAnsweredCallOnColdStart, shipPendingCallDebugTraceIfAny,
} from '@/lib/callAlert';

SplashScreen.preventAutoHideAsync().catch(() => {});

if (!__DEV__) {
  console.log = () => {};
  console.info = () => {};
}

// react-native-compressor constructs a NativeEventEmitter at module-load time
// inside its own package code (Video/index.js). When the native module isn't
// linked yet (Expo Go, or a dev client built before this package was added),
// React Native's own NativeEventEmitter constructor throws — a path that
// bypasses our try/catch around the lazy require() in social.tsx, since the
// throw happens inside RN internals, not our call stack. We do catch and
// handle the resulting failure gracefully (compression just no-ops, falls back
// to uploading the original file) — this only silences the redundant redbox.
// Remove once every dev build in use has been rebuilt with this package linked.
LogBox.ignoreLogs([
  /react-native-compressor.*doesn't seem to be linked/,
  /\[RevenueCat\].*Error fetching offerings/,
  /RevenueCat\.OfferingsManager\.Error/,
  // Network failures are handled via OfflineBanner — suppress the dev overlay
  /Network request failed/,
  /Failed to fetch/,
  /TypeError: Failed/,
  /NetworkError/,
]);

const TAG = 'RootLayout';

function RootNavigator() {
  useWidgetSync();
  // Phones stay portrait (app.config.js); tablet-class devices — including a
  // wall-mounted "kitchen hub" iPad/Android tablet — get landscape unlocked
  // here at runtime, since Android has no static per-idiom orientation split.
  useDeviceClass();
  const { isDark, colors } = useTheme();
  const { setSession } = useAuthStore();
  const [checked, setChecked] = useState(false);
  // Guard so router.replace only fires once even if effect somehow re-runs
  const navigated = useRef(false);
  // Prevents SIGNED_IN handler from navigating during the initial boot sequence
  // (getSession handles initial navigation; onAuthStateChange handles post-login navigation)
  const bootCompleted = useRef(false);
  const pendingWidgetTap = useRef(false);
  const bootTime = useRef(Date.now()).current;
  // Monotonic guard against overlapping post-auth profile checks: multiple
  // onAuthStateChange events (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED)
  // can fire in quick succession, each kicking off its own async `.single()`
  // profile fetch — without this, an EARLIER request that happens to
  // resolve LAST (network jitter, a transient read racing a just-completed
  // write) could call router.replace('/onboarding') and stomp a correct,
  // already-applied '/(tabs)' navigation from a later, faster request.
  // Reported: user with terms_accepted=true/onboarding_completed=true
  // confirmed correct in the DB still landed back on /onboarding.
  const profileCheckSeq = useRef(0);

  // Root-level overlay covers everything including the tab bar.
  // hideAsync fires in onSplashLayout — only after gradient is painted —
  // so native splash → animated overlay is a seamless swap with no hard cut.
  const [splashGone, setSplashGone] = useState(false);
  const splashOpacity = useSharedValue(1);
  const splashStyle = useAnimatedStyle(() => ({ opacity: splashOpacity.value }));
  const splashPainted = useRef(false);

  const onSplashLayout = useCallback(() => {
    if (splashPainted.current) return;
    splashPainted.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const hideSplashThen = useCallback((navigate: () => void) => {
    const finish = () => { setSplashGone(true); navigate(); };
    splashOpacity.value = withTiming(0, { duration: 800 }, (done) => {
      if (done) runOnJS(finish)();
    });
  }, []);

  useEffect(() => {
    dbg(TAG, 'Initialising auth listener');

    
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        dbgError(TAG, 'getSession failed', error.message);
      } else {
        dbg(TAG, 'getSession →', session ? `user ${session.user.id}` : 'no session');
      }
      setSession(session);
      reloadBlockedWords().catch(() => {});
      applyScreenshotProtection().catch(() => {});
      prefetchFeatureFlags().catch(() => {});
      if (session) {
        initRevenueCat(session.user.id);
        // familyId lets loadSubscription anchor the 7-day trial window to
        // families.created_at — omitting it (as every call site here
        // previously did) meant computeTrial() always saw familyCreatedAt
        // as null, so isTrial/trialDaysLeft never actually activated for
        // anyone, silently.
        useSubscriptionStore.getState().loadSubscription(
          session.user.id,
          useFamilyStore.getState().members.find(m => m.familyId)?.familyId,
        ).catch(() => {});
        useNotifStore.getState().fetchAll(session.user.id).catch(() => {});
        // Streak + daily login coins (fire-and-forget, only when gamification is on)
        if (isFeatureEnabled('gamification')) {
          updateStreak(session.user.id).catch(() => {});
          awardCoins(session.user.id, 'daily_login').catch(() => {});
        }
      }
      // Hold native splash until auth + profile check finishes. The overlay
      // calls hideAsync once painted, then hideSplashThen fades it out.
      const MIN_SPLASH_MS = 2200;
      const elapsed = Date.now() - bootTime;
      const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
      setTimeout(async () => {
        bootCompleted.current = true;
        setChecked(true);
        if (!navigated.current) {
          navigated.current = true;
          let destination = '/(auth)/login';
          // A "local" sign-out (biometric preserved) deliberately never
          // revokes this session server-side — Face ID needs it to still be
          // valid to restore. But that also means Supabase's OWN client
          // storage still holds a technically-valid session here, so
          // without this check a cold relaunch right after that kind of
          // sign-out would skip straight past the lock/login screen with no
          // Face ID/PIN prompt at all. isLocked() is the explicit flag that
          // makes boot treat this session as "no session" for routing
          // purposes until Face ID/PIN actually clears it.
          const { isLocked } = await import('@/lib/biometrics');
          const sessionIsSoftLocked = session ? await isLocked() : false;
          if (sessionIsSoftLocked) {
            destination = '/(auth)/lock';
          } else if (session) {
            // Reuse authStore's own fetchProfile() (already kicked off by
            // setSession() above) instead of a second, separate query for
            // the same row — fetchProfile has its own in-flight dedup (so
            // this either joins that same promise or is a fast no-op) and a
            // 15s TTL cache, so this is not a redundant round trip. This
            // also means every navigation gate now reads from the exact
            // same fetch/cache, removing one more source of the kind of
            // cross-gate staleness/race this session's other fixes closed.
            await useAuthStore.getState().fetchProfile(session.user.id);
            const profile = useAuthStore.getState().profile;
            const profileErr = profile ? null : new Error('Profile not found after fetchProfile');
            if (profile?.deleted_at) {
              // Family Cube's own soft-delete window is 7 days (Profile's
              // "Delete account" danger-zone action) — see the symmetric
              // 7-day restore in store/familyStore.ts's setActiveMember
              // (PIN-switch path) and member-purge-sweep (the cron that
              // permanently removes anything past this window).
              const deletedAt = new Date(profile.deleted_at).getTime();
              const sevenDays = 7 * 24 * 60 * 60 * 1000;
              if (Date.now() - deletedAt < sevenDays) {
                const { error: restoreErr } = await supabase
                  .from('profiles')
                  .update({ deleted_at: null })
                  .eq('id', session.user.id);
                if (restoreErr) {
                  // Routed through authStore.signOut({ forceGlobal: true })
                  // instead of a raw scope:'local' call — the raw call
                  // bypassed familyStore.reset() and every other store
                  // reset, and never cleared a stale biometric token for an
                  // account whose restore just failed (which would
                  // otherwise keep silently offering Face ID into a broken
                  // state on the next cold launch).
                  const { clearBiometricSession } = await import('@/lib/biometrics');
                  await clearBiometricSession().catch(() => {});
                  await useAuthStore.getState().signOut({ forceGlobal: true });
                  hideSplashThen(() => router.replace('/(auth)/login'));
                  return;
                }
                showAlert('Welcome back!', 'Your account and all your data have been fully restored. Nothing was lost.');
              }
            }
            if (session.user.is_anonymous) {
              // Anonymous users (join-family / device-recovery) never get a
              // profiles row by design — join-family only ever stamps
              // members.auth_user_id, never touches profiles (confirmed:
              // profiles is real-auth-only). Routing through the
              // terms_accepted/onboarding_completed check below would
              // always read "no profile" for this population and send a
              // successfully-joined kid/senior back through onboarding on
              // every cold relaunch, forever — check for an actual joined
              // members row instead, the real signal of "already done."
              const { data: ownMember } = await supabase
                .from('members')
                .select('id')
                .eq('auth_user_id', session.user.id)
                .maybeSingle();
              destination = ownMember ? '/(tabs)' : '/onboarding';
            } else if (profileErr || !profile?.terms_accepted) {
              // No profile at all, or terms genuinely never accepted —
              // the full 8-slide tutorial + Terms screen is the correct
              // destination here.
              console.warn('[FamilyCube:OnboardingGate] routing to /onboarding', {
                userId: session.user.id,
                profileErr: profileErr?.message,
                terms_accepted: profile?.terms_accepted,
                onboarding_completed: profile?.onboarding_completed,
                profileFound: !!profile,
              });
              destination = '/onboarding';
            } else if (!profile.onboarding_completed) {
              // Terms ARE already accepted (this is the common post-Terms-
              // fix state: acceptTermsOnly() sets terms_accepted without
              // touching onboarding_completed) but the family hasn't been
              // created/joined yet. Live-reported: this used to send the
              // user back through the full slide tutorial from scratch
              // ("Let's go" screen) — after a 2.2s minimum-splash wait that
              // read as a long, confusing hang — even though they'd
              // already seen it and just wanted to get back to
              // create-vs-join. Route straight to the actual decision they
              // need to make instead.
              console.warn('[FamilyCube:OnboardingGate] terms accepted, no family yet — routing to /onboarding/family-choice', {
                userId: session.user.id,
              });
              destination = '/onboarding/family-choice';
            } else {
              let locked = false;
              try {
                if (await isBiometricEnabled()) locked = await isBiometricAvailable();
              } catch {}
              destination = locked ? '/(auth)/lock' : '/(tabs)';
              // Whoever was PIN-switched to as the active member before the
              // app closed is NOT necessarily who's coming back on this cold
              // boot — same reasoning as LoginScreen/LockScreen's Face ID
              // restore paths, which already mark this. Without it here,
              // biometric lock being OFF meant this branch went straight to
              // /(tabs) with the last-persisted activeMemberId (possibly a
              // PIN-enabled kid's profile) and no reset ever ran — reported
              // live as landing directly on a kid's profile with no PIN
              // prompt after a plain app relaunch. isLocked/lock-screen's own
              // Face ID path already covers the locked branch; this covers
              // the no-lock-enabled branch the same way.
              if (!locked) {
                const { markPendingOwnerReset } = await import('@/lib/biometrics');
                await markPendingOwnerReset();
              }
            }
          }
          // Widget tap arrived before boot — ensure we land on home tab
          if (pendingWidgetTap.current && session && destination !== '/(tabs)') {
            destination = '/(tabs)';
          }
          pendingWidgetTap.current = false;
          // Always navigate BEFORE dismissing splash to prevent the screen
          // from loading behind the fading overlay (causes animation jank).
          router.replace(destination as any);
          hideSplashThen(() => {});
        }
      }, remaining);
    }).catch((e) => {
      // getSession() itself rejecting (thrown exception, not the normal
      // {data,error} resolve path) meant this whole .then() chain never
      // ran — hideSplashThen() was never called, so the splash overlay's
      // Modal (visible={!splashGone}) stayed mounted FOREVER, with its
      // opacity never animated down. A transparent, fully-invisible Modal
      // still captures every touch within its bounds on native — this is
      // exactly what live-reported as "the lock screen renders normally
      // but nothing is tappable," surfacing on a background→foreground
      // resume (the exact moment a transient network hiccup is most
      // likely). Fail safe: still dismiss the splash and land on login —
      // getSession() failing at all means there's no session to trust
      // anyway, so login is the correct fallback destination.
      dbgError(TAG, 'getSession promise rejected', e?.message ?? e);
      if (!navigated.current) {
        navigated.current = true;
        bootCompleted.current = true;
        setChecked(true);
        router.replace('/(auth)/login');
        hideSplashThen(() => {});
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      dbg(TAG, 'onAuthStateChange →', event, session?.user?.id ?? 'no user');
      setSession(session);

      // An anonymous session (signInAnonymously(), used by LoginScreen's
      // "Enter invite code" and the device-recovery flow) is ALWAYS a
      // deliberate mid-flow step toward join-family/recover-device — there
      // is no profile row for it yet by definition, and there never will be
      // one until the join/recovery completes and re-stamps a REAL profile.
      // Letting this handler's normal SIGNED_IN routing run for it raced
      // against the screen's own router.push('/onboarding/join-family')
      // (LoginScreen.tsx's startCodeFlow): if this handler's async
      // profile fetch resolved first, it saw "no profile" and called
      // router.replace('/onboarding') — hijacking navigation into the
      // tutorial before the user ever reached join-family, then the user
      // had to go through FamilyChoiceScreen and back into JoinFamilyScreen
      // a second time, which is exactly the "asks twice" confusion
      // reported live. The screen that started the anonymous session
      // already owns navigation for it — this handler has nothing useful
      // to do until a real (non-anonymous) profile exists.
      if (session?.user?.is_anonymous) return;

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        // Init RevenueCat and load subscription tier.
        initRevenueCat(session.user.id);
        // familyId lets loadSubscription anchor the 7-day trial window to
        // families.created_at — omitting it (as every call site here
        // previously did) meant computeTrial() always saw familyCreatedAt
        // as null, so isTrial/trialDaysLeft never actually activated for
        // anyone, silently.
        useSubscriptionStore.getState().loadSubscription(
          session.user.id,
          useFamilyStore.getState().members.find(m => m.familyId)?.familyId,
        ).catch(() => {});
        useNotifStore.getState().fetchAll(session.user.id).catch(() => {});

        savePushToken(session.user.id).catch((e) =>
          dbgWarn(TAG, 'savePushToken failed', e?.message)
        );
        // Save token to the active family member row (FamilyCube push routing).
        // If members haven't loaded yet, subscribe and fire once they do.
        const activeMemberId = useFamilyStore.getState().activeMemberId;
        if (activeMemberId) {
          saveTokenToMember(activeMemberId).catch(() => {});
        } else {
          const unsub = useFamilyStore.subscribe((state) => {
            if (state.activeMemberId) {
              saveTokenToMember(state.activeMemberId).catch(() => {});
              unsub();
            }
          });
        }
        registerNotificationCategories().catch(() => {});

        // Seed home_timezone + timezone on first sign-in if not yet set.
        // home_timezone is the user's "home" TZ used for reminder scheduling
        // and is only updated when the user explicitly taps "Update Reminders".
        const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (deviceTz) {
          supabase.from('profiles')
            .select('home_timezone')
            .eq('id', session.user.id)
            .maybeSingle()
            .then(({ data }) => {
              // Always keep timezone in sync — prefs.ts (edge functions) read this for quiet hours
              const updates: Record<string, string> = { current_timezone: deviceTz, timezone: deviceTz };
              if (!data?.home_timezone) {
                updates.home_timezone = deviceTz;
              }
              supabase.from('profiles').update(updates).eq('id', session.user.id).then(() => {});
            });
        }

        // Refresh the stored biometric session token on every sign-in so Face ID
        // restore keeps working after a later sign-out.
        if (session.refresh_token) {
          isBiometricEnabled().then(en => {
            if (en) saveBiometricSession(session.access_token, session.refresh_token).catch(() => {});
          }).catch(() => {});
        }

        // During initial app boot, getSession handles the first navigation.
        // Only navigate from SIGNED_IN after boot is done (i.e. user signed in from the login screen).
        if (!bootCompleted.current) return;
        const mySeq = ++profileCheckSeq.current;
        // Reuses authStore's own fetchProfile()/profile (dedup + 15s TTL
        // cache) instead of a third independent query for the same row —
        // same consolidation as the boot gate above. The profileCheckSeq
        // guard below is unrelated to the data source and still protects
        // against THIS handler firing more than once in overlapping fashion.
        await useAuthStore.getState().fetchProfile(session.user.id);
        let profile = useAuthStore.getState().profile;
        // Consumes SignupScreen.tsx's markPendingTermsAcceptance() — set
        // when the checkbox was checked but signUp() landed on the
        // email-verification path (no session existed yet to record
        // acceptance against). This is that session, now that the user
        // clicked the emailed link — apply the pending "yes" before the
        // routing check below reads terms_accepted.
        const { consumePendingTermsAcceptance } = await import('@/lib/biometrics');
        if (profile && !profile.terms_accepted && await consumePendingTermsAcceptance()) {
          try {
            await useAuthStore.getState().acceptTermsOnly();
            profile = useAuthStore.getState().profile;
          } catch (e: any) {
            console.warn('[_layout] pending terms acceptance failed to apply', e?.message ?? e);
          }
        }
        const profileError = profile ? null : new Error('Profile not found after fetchProfile');
        // A newer check already started (and may have already navigated)
        // while this one was in flight — this result is stale, don't act
        // on it or risk stomping a correct navigation with an outdated read.
        if (mySeq !== profileCheckSeq.current) return;

        console.log('[FamilyCube:ProfileCheck]', {
          userId: session.user.id,
          profileExists: !!profile,
          profileError: profileError?.message,
          terms_accepted: profile?.terms_accepted,
          onboarding_completed: profile?.onboarding_completed,
          deleted_at: profile?.deleted_at ?? null,
        });

        // ── Soft-delete restore ──────────────────────────────────────────────
        // If the account was scheduled for deletion (Profile's "Delete
        // account") but the user logged back in within 7 days, restore it
        // automatically. Symmetric with familyStore.setActiveMember's
        // restore-on-PIN-switch for non-auth members, and with the same
        // window member-purge-sweep uses to permanently purge past it.
        if (profile?.deleted_at) {
          const deletedAt = new Date(profile.deleted_at).getTime();
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          if (Date.now() - deletedAt < sevenDays) {
            // Restore: clear the deleted_at flag
            const { error: restoreErr } = await supabase
              .from('profiles')
              .update({ deleted_at: null })
              .eq('id', session.user.id);
            if (restoreErr) {
              console.error('[FamilyCube:Restore] Failed to restore account:', restoreErr.message);
              showAlert('Restore failed', "We couldn't restore your account right now. Please try signing in again.");
              // Same consolidation as the boot-time restore-failure branch
              // above — forceGlobal ensures a consistent full sign-out with
              // familyStore.reset() and every other store reset applied,
              // and clears any stale biometric token for this broken account.
              const { clearBiometricSession } = await import('@/lib/biometrics');
              await clearBiometricSession().catch(() => {});
              await useAuthStore.getState().signOut({ forceGlobal: true });
              return;
            } else {
              showAlert(
                'Welcome back!',
                'Your account and all your data have been fully restored. Nothing was lost.',
              );
            }
          }
          // If past 7 days the purge cron already deleted the auth user,
          // so this branch is unreachable — but guard anyway.
        }

        if (!profile) {
          console.log('[FamilyCube:ProfileCheck] No profile found, going to onboarding');
          router.replace('/onboarding');
        } else if (!profile.terms_accepted) {
          console.log('[FamilyCube:ProfileCheck] Terms not accepted, going to onboarding');
          router.replace('/onboarding');
        } else if (!profile.onboarding_completed) {
          // Terms already accepted — this is the common post-Terms-fix
          // state (acceptTermsOnly() sets terms_accepted without touching
          // onboarding_completed), meaning the person just hasn't
          // created/joined a family yet. Sending them through the full
          // slide tutorial again here was the exact bug reported live:
          // sign out from the create/join-family choice screen, sign back
          // in, land back on the "Let's go" tutorial after a confusing
          // wait, instead of straight back to the actual choice. Same fix
          // as the boot-time gate above.
          console.log('[FamilyCube:ProfileCheck] Terms accepted, no family yet — going to family-choice');
          router.replace('/onboarding/family-choice');
        } else {
          console.log('[FamilyCube:ProfileCheck] All done, going to home');
          router.replace('/(tabs)');
        }
      } else if (event === 'SIGNED_OUT') {
        // unsubscribeFromSubChanges();  // subscription not active in this version
        // Wipe all user-specific data from stores immediately so the next user
        // (or the same user logging in to a different account) never sees stale data.
        invalidateProfileCache();
        queryClient.clear();
        // Pass signedOut=1 so the login screen shows the Face ID button but
        // does NOT auto-trigger it — the user must tap manually (standard UX
        // for apps like banking / social after an explicit sign-out).
        router.replace('/(auth)/login?signedOut=1' as any);
      } else if (event === 'TOKEN_REFRESHED') {
        dbg(TAG, 'Token refreshed ok');
        // Keep the biometric session token current so Face ID restore keeps working
        if (session?.refresh_token) {
          try {
            if (await isBiometricEnabled()) {
              await saveBiometricSession(session.access_token, session.refresh_token);
            }
          } catch { /* ignore */ }
        }
      }
    });

    const handleDeepLink = ({ url }: { url: string }) => {
      console.log('[FamilyCube:DeepLink] Received:', url);
      // Widget tap — open home tab (only after boot completes)
      if (url === 'familycube:///' || url === 'familycube://' || url === 'familycube://home') {
        if (bootCompleted.current) {
          const { session: activeSession } = useAuthStore.getState();
          if (activeSession) {
            console.log('[FamilyCube:DeepLink] Navigating to home');
            router.replace('/(tabs)');
          }
        } else {
          // Let boot handle routing — it always navigates to /(tabs) for logged-in users.
          // Store intent so boot can ensure home tab lands even if other conditions interfere.
          console.log('[FamilyCube:DeepLink] Boot not ready — deferring widget tap to boot sequence');
          pendingWidgetTap.current = true;
        }
        return;
      }
      if (!url.startsWith('familycube://auth/callback') && !url.startsWith('pawbond://auth/callback') && !url.includes('/--/auth/callback') && !url.includes('auth/callback')) {
        console.log('[FamilyCube:DeepLink] Not an auth callback, ignoring');
        return;
      }
      console.log('[FamilyCube:DeepLink] Processing auth callback...');
      const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
      const p = new URLSearchParams(fragment);
      const accessToken = p.get('access_token');
      const refreshToken = p.get('refresh_token') ?? '';
      console.log('[FamilyCube:DeepLink] Tokens found:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
      if (accessToken) {
        console.log('[FamilyCube:DeepLink] Setting session from callback...');
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => {
            if (error) {
              dbgError(TAG, 'deep-link setSession failed', error.message);
              console.error('[FamilyCube:DeepLink] setSession error:', error.message);
            } else {
              console.log('[FamilyCube:DeepLink] Session set successfully');
            }
          })
          .catch((e) => {
            dbgError(TAG, 'deep-link setSession threw', e?.message);
            console.error('[FamilyCube:DeepLink] setSession exception:', e?.message);
          });
      }
    };
    const deepLinkSub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then(url => { if (url) handleDeepLink({ url }); });

    const notifListener = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data as any;
      dbg(TAG, 'Notification tapped', data);
      console.log('[FamilyCube:Notification] Type:', data?.type);

      // If no active session, the user is signed out. Don't deep-link into the
      // app — just navigate to login so they can authenticate first.
      const { session: activeSession } = useAuthStore.getState();
      if (!activeSession) {
        console.log('[FamilyCube:Notification] No session — redirecting to login');
        router.replace('/(auth)/login');
        return;
      }

      if (data?.type === 'chat_message') {
        router.push('/(tabs)/chat' as any);
      } else if (data?.type === 'shopping_trip_started' || data?.type === 'store_proximity') {
        // Family Cube grocery notifications (notify-shopping-trip-started
        // edge function / storeGeofencing.ts's local proximity reminder) —
        // used to fall through to the generic default case below with no
        // case of its own, landing on /(tabs)/notifications instead of the
        // actual grocery list (live-reported: "it is going to somewhere").
        // Grocery has its own dedicated route.
        router.push('/(tabs)/grocery' as any);
      } else if (data?.type === 'schedule_conflict') {
        // schedule-conflict-sweep's server-side double-booking push —
        // lands on the merged Tasks tab, which defaults to its Schedule
        // segment (see features/tasks/TasksScreen.tsx).
        router.push('/(tabs)/tasks' as any);
      } else {
        // Was: router.push('/(tabs)/notifications') — that page
        // (NotificationsScreen.tsx, via the all-notifications/notifications
        // routes) reads from notification_logs, a table confirmed to have
        // zero real writers (see store/notifStore.ts's own header comment
        // and the notifications-table id-default fix). Live-reported:
        // tapping a missed-call-reminder push (call_reminder_missed, one of
        // the "truly unknown types" that always fell into this branch)
        // landed on a dedicated page that always says "All caught up" no
        // matter what — user explicitly wants the bell's own in-app sheet
        // instead, not that page. routeForNotification (the same lookup the
        // in-app toast tap above already uses) returns a specific screen
        // route when the notification type maps to one; anything it doesn't
        // recognize opens NotificationPanel instead, which reads the real,
        // live `notifications` table and actually shows the item.
        const dest = data?.type ? routeForNotification(data.type, data) : null;
        if (dest) {
          console.log('[Notification] Routing to', dest, 'for type:', data?.type);
          router.push(dest as any);
        } else {
          console.log('[Notification] Opening notification panel for type:', data?.type);
          setNotifPanelOpen(true);
        }
      }
    });

    return () => {
      dbg(TAG, 'Cleaning up auth listener');
      subscription.unsubscribe();
      notifListener.remove();
      deepLinkSub.remove();
    };
  }, []);

  // Global realtime listener — increment badge when any new notification arrives.
  // Lives here (root layout) so it works regardless of which tab is visible.
  const { session } = useAuthStore();
  const rtUserId = session?.user?.id;

  // Live subscription tier — single channel, updates store instantly when DB row changes.
  useEffect(() => {
    if (!rtUserId) return;
    const ch = supabase
      .channel(`sub-tier-${rtUserId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${rtUserId}` },
        (payload) => {
          const row = payload.new as any;
          if (row?.tier) {
            const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
            useSubscriptionStore.getState().setTier(row.tier, row.status ?? 'active', expiresAt);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [rtUserId]);

  // In-app notification toast — light, top-anchored, auto-dismissing card.
  // Fed by two independent sources below:
  //   1. The `global-notif-${activeMemberId}` realtime channel (DB INSERT
  //      into `notifications`, member_id-scoped — the table family-notifier
  //      actually writes to; notification_logs has zero real writers and
  //      was the wrong table, live-reported as "i didn't see anything under
  //      the notification screen") — has the full row (type/data), so
  //      tapping it can route to the right screen.
  //   2. The OS foreground push listener — fires purely off the push
  //      payload (title/body only, no guaranteed `data`), for the rare case
  //      a push arrives without (or before) its DB row being visible here.
  const [inAppNotif, setInAppNotif] = useState<{ title: string; body?: string; type?: string; data?: Record<string, any> } | null>(null);
  const inAppTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inAppSlide = useSharedValue(-80);
  const inAppStyle = useAnimatedStyle(() => ({ transform: [{ translateY: inAppSlide.value }] }));
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  const showInAppToast = (n: { title: string; body?: string; type?: string; data?: Record<string, any> }) => {
    setInAppNotif(n);
    inAppSlide.value = withTiming(0, { duration: 300 });
    if (inAppTimerRef.current) clearTimeout(inAppTimerRef.current);
    inAppTimerRef.current = setTimeout(() => {
      inAppSlide.value = withTiming(-80, { duration: 250 }, (done) => {
        if (done) runOnJS(setInAppNotif)(null);
      });
    }, 3500);
  };

  const dismissInAppToast = () => {
    if (inAppTimerRef.current) clearTimeout(inAppTimerRef.current);
    inAppSlide.value = withTiming(-80, { duration: 250 }, (done) => {
      if (done) runOnJS(setInAppNotif)(null);
    });
  };

  const activeMemberIdForNotifs = useFamilyStore(s => s.activeMemberId);
  useEffect(() => {
    if (!activeMemberIdForNotifs) return;
    const ch = supabase
      .channel(`global-notif-${activeMemberIdForNotifs}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member_id=eq.${activeMemberIdForNotifs}` },
        (payload) => {
          const row = payload.new as any;
          useNotifStore.getState().increment();
          useNotifStore.getState().prependNotification({
            id: row.id, user_id: row.member_id ?? '', type: row.type,
            title: row.title, body: row.body ?? row.message ?? '',
            data: row.data ?? row.meta ?? {}, read: row.read ?? false,
            created_at: row.created_at ?? row.timestamp,
          });
          showInAppToast({ title: row?.title ?? 'New notification', body: row?.body ?? row?.message, type: row?.type, data: row?.data ?? row?.meta });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeMemberIdForNotifs]);

  // Chat unread badge — global, app-wide, not tied to the Chat tab being
  // open. Previously the bottom-nav Chat dot only ever reflected whatever
  // chatStore.unreadCounts happened to be from the last time the Chat tab
  // itself ran its own one-shot loadUnreadCounts query — it never updated
  // for a message that arrived while the user was elsewhere in the app,
  // and never cleared if the user left the tab without that query re-
  // running, so it could get stuck showing unread state indefinitely.
  const activeMemberIdForChat = useFamilyStore(s => s.activeMemberId);
  useEffect(() => {
    if (!activeMemberIdForChat) return;
    useChatStore.getState().ensureGlobalUnreadSubscription(activeMemberIdForChat);
  }, [activeMemberIdForChat]);

  // Foreground push listener — fires when a push arrives while the app is open.
  useEffect(() => {
    if (!rtUserId) return;
    const sub = addNotificationReceivedListener((notification) => {
      // Don't call increment() here — the realtime notification_logs INSERT listener
      // already increments the badge when the DB row is written. Calling it here too
      // would double-count every foreground push (one increment per channel).
      const content = notification?.request?.content;
      const title = content?.title ?? 'New notification';
      const body  = content?.body ?? undefined;
      const data  = (content?.data ?? undefined) as Record<string, any> | undefined;
      showInAppToast({ title, body, type: data?.type, data });
    });
    return () => {
      sub.remove();
      if (inAppTimerRef.current) clearTimeout(inAppTimerRef.current);
    };
  }, [rtUserId]);

  // Biometric app-lock on foreground. When the app returns to the foreground
  // after being genuinely backgrounded (not a quick bounce like the Face ID
  // prompt or a share sheet), re-show the lock screen if the user enabled it.
  // This is why you see Face ID *every* time you return — not just cold launch.
  const backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    const LOCK_AFTER_MS = 300_000; // 5 min — only re-lock after genuine backgrounding (screen lock/unlock is a brief bounce)
    const sub = AppState.addEventListener('change', async (next) => {
      if (next === 'background') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
        return;
      }
      if (next !== 'active') return; // ignore 'inactive' (e.g. the bio prompt itself)
      const awayMs = backgroundedAt.current != null ? Date.now() - backgroundedAt.current : 0;
      backgroundedAt.current = null;

      // TEMP diagnostic — ship any pending call-reminder TTS debug trace
      // (see lib/callAlert.ts's shipPendingCallDebugTraceIfAny comment for
      // the full story and why this has to run on EVERY foreground, not
      // just cold start: answering a reminder call backgrounds the app for
      // the call's duration, so the far more common case than a killed app
      // is exactly this — a normal background→active resume once the user
      // hangs up. Fire-and-forget, no-ops instantly if there's no trace
      // pending, so it's safe to call unconditionally on every foreground.
      shipPendingCallDebugTraceIfAny();

      // Live-reported: "answered" was never getting recorded even for calls
      // the user personally answered, causing call-reminder-sweeper's
      // missed-call follow-up to fire a redundant retry call for a reminder
      // that was already handled. checkLastAnsweredCallOnColdStart() was
      // previously only ever called once, at RootNavigator mount — but the
      // SAME reasoning that requires shipPendingCallDebugTraceIfAny to run
      // on every foreground (not just cold start) applies here too:
      // answering a reminder call backgrounds the app for the call's
      // duration without killing the JS process, so the live
      // "CallReminderAnswered" listener (registered once at mount) should
      // in principle still be attached and should have caught it — but
      // confirmed live, across multiple real answered calls, that it
      // wasn't. Running this cold-start-oriented check on every foreground
      // too costs nothing (getLastAnsweredCall/getLastCallEndedAt both
      // resolve instantly to null when there's nothing pending, and
      // markReminderCallRecent only ever moves forward) and closes
      // whatever gap is causing the live listener to miss real answers.
      checkLastAnsweredCallOnColdStart();

      // Track current device timezone silently on foreground (for travel banner).
      // Does NOT change home_timezone or timezone — only current_timezone updates.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) supabase.from('profiles').update({ current_timezone: tz }).eq('id', user.id).then(() => {});
        });
      }

      // Always refresh subscription + unread count on foreground.
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          useSubscriptionStore.getState().loadSubscription(
            user.id,
            useFamilyStore.getState().members.find(m => m.familyId)?.familyId,
          ).catch(() => {});
          useNotifStore.getState().fetchAll(user.id).catch(() => {});
        }
      });

      // Force a real chore/quest DB re-fetch on every foreground — Supabase
      // realtime sockets silently die when the OS suspends the app in the
      // background, and choreStore's own reconnect guard only checks "does
      // a channel object exist," not "is it actually connected," so a dead
      // socket previously went unnoticed indefinitely: a GP's decline/pass/
      // backout updated their OWN device fine but never reached anyone
      // else's until they happened to pull-to-refresh (the only path that
      // does a real DB round-trip independent of the socket). syncFromDB's
      // force=true bypasses its 60s TTL guard, and reaches ensureRealtime,
      // which — now that its .subscribe() callback clears a dead channel on
      // CLOSED/CHANNEL_ERROR/TIMED_OUT — will actually resubscribe here
      // instead of trusting a corpse.
      useChoreStore.getState().syncFromDB(true).catch(() => {});
      // Same gap, same fix, sibling system — eventStore's own realtime
      // channel (calendar_events, ride/driver assignments) had the
      // identical dead-channel vulnerability with no foreground-triggered
      // recovery at all, confirmed via QA audit after the chore-side fix
      // shipped. syncFromDB() here re-fetches the current day and re-runs
      // selectDate, which reaches ensureRealtime the same way choreStore's
      // does.
      useEventStore.getState().syncFromDB().catch(() => {});

      if (awayMs < LOCK_AFTER_MS) return;
      if (!bootCompleted.current) return;
      // Live-reported: answering a call-reminder call (which backgrounds
      // the app for the call's duration, easily past LOCK_AFTER_MS) then
      // foregrounded straight into LockScreen's auto-triggered Face ID —
      // but iOS won't reliably run Face ID while a CallKit call is still
      // active/dismissing, so the prompt hung forever with both buttons
      // dead (busy stuck true, no way to retry). Skip the re-lock check
      // entirely for this one resume; it re-arms on the next genuine
      // backgrounding as usual.
      if (wasReminderCallJustAnswered()) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        if (await isBiometricEnabled() && await isBiometricAvailable()) {
          router.replace('/(auth)/lock');
        }
      } catch { /* bio unavailable — don't lock */ }
    });
    return () => sub.remove();
  }, []);

  // Call-style reminder alerts — CallKeep setup + VoIP token registration +
  // answer routing. iOS's actual wake-on-killed-app path runs natively in
  // AppDelegate.swift before JS ever loads; this just keeps the token fresh
  // and routes to the post-answer screen once CallKit hands control to JS.
  const activeMemberId = useFamilyStore(s => s.activeMemberId);

  // Battery-only polling (every 5 min, independent of the 0.1-mile location
  // gate) — lives here instead of GpsTab.tsx so it keeps running as long as
  // the app is alive, not just while the GPS tab happens to be mounted.
  //
  // Was gated on whether background LOCATION tracking happened to be
  // active — someone who never enabled "Share My Location" (or had it off)
  // never got their own battery_level polled at all, so the family's Radar
  // roster showed their battery as permanently stale/never-updated
  // (user-reported: "battery % also not a periodic check"). Seeing your own
  // accurate battery percentage doesn't require sharing your location with
  // anyone — poll it for the active member unconditionally, any time
  // they're signed in.
  useEffect(() => {
    if (!activeMemberId) { stopBatteryPolling(); return; }
    startBatteryPolling(activeMemberId);
    return () => stopBatteryPolling();
  }, [activeMemberId]);

  // Store-proximity geofences (lib/storeGeofencing.ts) — was ONLY ever
  // registered from GroceryScreen.tsx (on mount, and after pinning a new
  // store), unlike background GPS tracking's own cold-start re-check a few
  // effects up. A user who force-quits and relaunches without happening to
  // open the Grocery tab again would silently lose the geofence even though
  // they'd expect a "you're near the store" push to keep working in the
  // background — same class of bug as the reinstall-resets-to-off issue
  // location sharing already had fixed for it. Re-registers on every
  // cold start / active-member change; registerStoreGeofences itself
  // already no-ops when the family has no pinned stores or the feature
  // flag is off.
  useEffect(() => {
    if (!activeMemberId) return;
    const familyId = useFamilyStore.getState().members.find(m => m.id === activeMemberId)?.familyId;
    if (!familyId) return;
    registerStoreGeofences(familyId, activeMemberId).catch(() => {});
  }, [activeMemberId]);

  useEffect(() => {
    setupCallAlerts();
    // Doesn't depend on activeMemberId — the native "CallReminderAnswered"
    // event already carries itemType/itemId/dueAtIso, everything
    // mark-call-reminder-answered needs to find the right row.
    const unanswered = listenForCallReminderAnswered();
    // Re-stamps the same "just answered" recency flag from the real hang-up
    // moment instead of only answer time — see listenForCallReminderEnded's
    // own comments for why the answer-time-only stamp could expire before
    // the person actually hangs up and the app foregrounds (the in-call TTS
    // repeat alone runs 20-30+ seconds).
    const unended = listenForCallReminderEnded();
    // Covers the (common) case where the reminder call was answered while
    // this listener wasn't mounted yet — backgrounded or fully killed app,
    // which describes most reminder calls since the phone is usually
    // locked/idle when one rings. See checkLastAnsweredCallOnColdStart's own
    // comments for why the live listener above misses this so often in
    // practice. Fire-and-forget: nothing else in boot depends on this
    // resolving first.
    checkLastAnsweredCallOnColdStart();
    // TEMP diagnostic — covers the killed-app case for the debug trace the
    // same way checkLastAnsweredCallOnColdStart covers it for the answered
    // flag just above: if the app was killed while the reminder call was
    // still ringing/active, the AppState 'active' listener never mounts in
    // time to catch that particular resume, so cold start needs its own
    // check too. See lib/callAlert.ts's shipPendingCallDebugTraceIfAny.
    shipPendingCallDebugTraceIfAny();
    return () => { unanswered(); unended(); };
  }, []);

  useEffect(() => {
    if (!activeMemberId) return;
    const familyId = useFamilyStore.getState().members.find(m => m.id === activeMemberId)?.familyId;
    if (!familyId) return;
    if (Platform.OS === 'ios') {
      const unlisten = listenForVoipToken((token) => saveVoipTokenToMember(activeMemberId, familyId, token));
      return unlisten;
    }
    registerAndroidVoipToken(activeMemberId, familyId).catch(() => {});
    const unforeground = listenForForegroundCallReminder();
    return unforeground;
  }, [activeMemberId]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} translucent={false} />

      {/* In-app notification toast — light, top-anchored, auto-dismissing.
          Tapping it opens the notification panel (or routes straight to the
          relevant tab when the type/data resolve to one) and dismisses. */}
      {inAppNotif && (
        <Animated.View style={[inAppToastStyles.wrapper, inAppStyle]} pointerEvents="box-none">
          <SafeAreaView pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => {
                dismissInAppToast();
                const dest = inAppNotif.type ? routeForNotification(inAppNotif.type, inAppNotif.data) : null;
                if (dest) {
                  router.push(dest as any);
                } else {
                  setNotifPanelOpen(true);
                }
              }}
              style={[inAppToastStyles.card, {
                backgroundColor: isDark ? 'rgba(30,38,64,0.97)' : 'rgba(255,255,255,0.97)',
                shadowColor: isDark ? '#000' : '#3D2068',
              }]}
            >
              <Image source={require('../assets/icon.png')} style={inAppToastStyles.icon} />
              <View style={inAppToastStyles.textCol}>
                <View style={inAppToastStyles.titleRow}>
                  <Text style={[inAppToastStyles.appName, { color: colors.textTertiary }]}>FAMILY CUBE</Text>
                  <Text style={[inAppToastStyles.time, { color: colors.textTertiary }]}>now</Text>
                </View>
                <Text style={[inAppToastStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>{inAppNotif.title}</Text>
                {!!inAppNotif.body && (
                  <Text style={[inAppToastStyles.body, { color: colors.textSecondary }]} numberOfLines={2}>{inAppNotif.body}</Text>
                )}
              </View>
            </TouchableOpacity>
          </SafeAreaView>
        </Animated.View>
      )}

      {/* Global notification panel — openable from the toast above, or any
          AppHeader bell. Mounted once here so the toast can trigger it
          regardless of which tab is currently active. */}
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

      {/* Blurs the screen and demands the active member's PIN after the app
          resumes from background past the same 5-min threshold Face ID
          re-lock uses below — covers the PIN-only case (no device biometric
          lock enabled) that the Face ID AppState handler doesn't touch. */}
      <AppPinLockOverlay />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'default',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="onboarding/index" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding/terms" options={{ animation: 'slide_from_right' }} />
        {/* Swipe-back must be off for the whole family-creation/join flow —
            router.replace('/(tabs)') at the end of each pops these screens
            off the stack, but a swipe-back gesture that starts mid-
            transition can still reveal the (about-to-be-removed) screen
            underneath for a frame — live-reported: after successfully
            creating a family and landing on the Hub, a right-swipe still
            showed "Create My Family / Join with Code" behind it. None of
            these screens should ever be reachable via back gesture once
            their own explicit "Back" button/step logic has moved past them. */}
        <Stack.Screen name="onboarding/family-choice" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="onboarding/setup-family" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="onboarding/join-family" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="onboarding/complete-profile" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="profile-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile-settings/terms" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="hub/help-history" options={{ headerShown: false, animation: 'slide_from_right' }} />
      </Stack>


      {/* Global paywall sheet — rendered once at root so any screen can trigger it */}
      <GlobalPaywallSheet />
      {/* Global picker loading overlay — shown while iOS photo browser initialises */}
      <PickerLoadingOverlay />

      {/* Splash modal — Modal creates its own UIWindow above the tab bar,
          so nothing bleeds through. onLayout fires once the gradient is
          painted, then we call hideAsync so native→animated is a seamless swap. */}
      <Modal
        visible={!splashGone}
        transparent={true}
        animationType="none"
        statusBarTranslucent={true}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, splashStyle]}
          onLayout={onSplashLayout}
        >
          <FamilyCubeSplashScreen />
        </Animated.View>
      </Modal>
    </GestureHandlerRootView>
  );
}

function GlobalPaywallSheet() {
  const { visible, headline, body, perks, onClose, hide } = usePaywallSheetStore();
  return (
    <PaywallSheet
      visible={visible}
      onClose={() => { hide(); onClose?.(); }}
      headline={headline}
      body={body}
      perks={perks}
    />
  );
}

const inAppToastStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 10,
  },
  card: {
    marginTop: 6,
    backgroundColor: 'rgba(240,240,245,0.97)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginTop: 1,
  },
  textCol: {
    flex: 1,
    gap: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  time: {
    color: '#8E8E93',
    fontSize: 11,
  },
  title: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  body: {
    color: '#3C3C43',
    fontSize: 13,
    lineHeight: 17,
  },
});

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 32, marginBottom: 12 }}>🐾</Text>
      <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>{error.message}</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RootNavigator />
        <AppAlert />
        <AppToast />
        <OfflineBanner />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
