import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { showAlert } from '@/components/AppAlert';
import { useEffect, useRef, useState, useCallback } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { StyleSheet, AppState, LogBox, Linking, Modal, View, Text, TouchableOpacity, SafeAreaView, Image, Platform } from 'react-native';
import FamilyCubeSplashScreen from '@/components/FamilyCubeSplashScreen';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { fetchFeedPage } from '@/lib/db/social';
import { FEED_QUERY_KEY } from '@/lib/hooks/useFeed';
import { getAppSettings } from '@/lib/db/appSettings';
import { updateStreak, awardCoins } from '@/lib/db/rewards';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AppAlert from '@/components/AppAlert';
import AppToast from '@/components/AppToast';
import OfflineBanner from '@/components/OfflineBanner';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { ThemeProvider, useTheme } from '@/lib/ThemeContext';
import { useAuthStore, invalidateProfileCache } from '@/store/authStore';
import { usePetStore } from '@/store/petStore';
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
import { useChatStore } from '@/store/chatStore';
import NotificationPanel, { routeForNotification } from '@/components/NotificationPanel';
import { useFamilyStore } from '@/store/familyStore';
import {
  setupCallAlerts, listenForVoipToken, saveVoipTokenToMember,
  registerAndroidVoipToken, listenForForegroundCallReminder,
  trackIncomingCallPayloads, onCallAnswered,
  checkNativeAnsweredCall, listenForNativeCallAnswered,
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

// Auto-sync user location to all their pets on login
async function syncLocationToPets(userId: string) {
  try {
    console.log('[PawBond:LocationSync] Starting location sync for user', userId);

    // Check existing permission before prompting — avoid re-requesting on every login
    let { status } = await Location.getForegroundPermissionsAsync();
    console.log('[PawBond:LocationSync] Current permission status:', status);

    if (status === 'denied') {
      console.warn('[PawBond:LocationSync] Location permission previously denied — skipping');
      return;
    }

    if (status !== 'granted') {
      const result = await Location.requestForegroundPermissionsAsync();
      status = result.status;
      console.log('[PawBond:LocationSync] Permission after request:', status);
    }

    if (status !== 'granted') {
      console.warn('[PawBond:LocationSync] Location permission not granted');
      return;
    }

    console.log('[PawBond:LocationSync] Requesting current position...');
    // Get current position with high accuracy (street level)
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeInterval: 500,
      distanceInterval: 0,
    });

    const { latitude: lat, longitude: lon } = pos.coords;
    const now = new Date().toISOString();

    console.log('[PawBond:LocationSync] Got coordinates:', { lat, lon });
    console.log('[PawBond:LocationSync] Updating all pets...');

    // Refresh coordinates only. Do NOT flip location_shared — discovery
    // visibility is the user's explicit choice, controlled from settings.
    const { data, error } = await supabase
      .from('pets')
      .update({
        location_lat: lat,
        location_lng: lon,
        location_updated_at: now,
      })
      .eq('owner_id', userId)
      .select('id, name, location_lat, location_lng');

    if (error) {
      dbgWarn(TAG, 'Failed to sync location', error.message);
    } else {
      console.log('[PawBond:LocationSync] ✅ Synced location to', data?.length ?? 0, 'pets', { lat, lon });
      dbg(TAG, 'Location synced', { pets: data?.length, lat, lon });
    }

    // Also upsert user_locations — used by send-lost-alert / send-found-alert
    // to find nearby users to notify. Without this the lost alert always finds
    // zero recipients because those edge functions query user_locations, not pets.
    await supabase.from('user_locations').upsert(
      { user_id: userId, lat, lng: lon, updated_at: now },
      { onConflict: 'user_id' }
    );
  } catch (err: any) {
    console.error('[PawBond:LocationSync] Exception:', err?.message);
    dbgWarn(TAG, 'syncLocationToPets exception', err?.message);
  }
}

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
  // The auth-state-change boot sequence's router.replace('/(tabs)') was
  // unconditionally stomping /call-alert: PushKit/CallKit answer navigation
  // fires very fast on a cold launch, but this async profile-fetch flow can
  // resolve a moment later and blindly replace whatever route is active —
  // cutting the reminder off mid-speech with no visible error, just a
  // silent, near-instant unmount. A ref (not a hook value, since this is
  // read inside an async callback defined once, not on every render) lets
  // that redirect check the CURRENT route right before firing and skip
  // itself if the user has since landed on the call screen.
  const currentPathname = useRef('');
  const pathname = usePathname();
  useEffect(() => { currentPathname.current = pathname; }, [pathname]);
  // Prevents SIGNED_IN handler from navigating during the initial boot sequence
  // (getSession handles initial navigation; onAuthStateChange handles post-login navigation)
  const bootCompleted = useRef(false);
  const pendingWidgetTap = useRef(false);
  const bootTime = useRef(Date.now()).current;

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
        useSubscriptionStore.getState().loadSubscription(session.user.id).catch(() => {});
        useNotifStore.getState().fetchAll(session.user.id).catch(() => {});
        // Streak + daily login coins (fire-and-forget, only when gamification is on)
        if (isFeatureEnabled('gamification')) {
          updateStreak(session.user.id).catch(() => {});
          awardCoins(session.user.id, 'daily_login').catch(() => {});
        }
        // Prefetch first feed page so Connect tab is instant on first visit.
        queryClient.prefetchInfiniteQuery({
          queryKey: FEED_QUERY_KEY,
          queryFn: ({ pageParam }) => fetchFeedPage(pageParam as number),
          initialPageParam: 0,
        }).catch(() => {});
        // Batch-prefetch all feature flags in one query — seeds the COLD cache
        // so the 5 individual useFeatureFlag calls on the social screen are instant.
        getAppSettings([
          'media_fullscreen_download_enabled', 'video_posts_enabled',
          'events_enabled', 'connect_feed_enabled', 'connect_playdates_chat_enabled',
          'sos_enabled', 'connect_family_enabled',
        ]).then(settings => {
          Object.entries(settings).forEach(([key, value]) => {
            queryClient.setQueryData(['app_settings', key], value);
          });
        }).catch(() => {});
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
          if (session) {
            const { data: profile, error: profileErr } = await supabase
              .from('profiles')
              .select('onboarding_completed, terms_accepted, deleted_at, handle')
              .eq('id', session.user.id)
              .single();
            if (profile?.deleted_at) {
              const deletedAt  = new Date(profile.deleted_at).getTime();
              const thirtyDays = 30 * 24 * 60 * 60 * 1000;
              if (Date.now() - deletedAt < thirtyDays) {
                const { error: restoreErr } = await supabase
                  .from('profiles')
                  .update({ deleted_at: null })
                  .eq('id', session.user.id);
                if (restoreErr) {
                  await supabase.auth.signOut({ scope: 'local' });
                  hideSplashThen(() => router.replace('/(auth)/login'));
                  return;
                }
                showAlert('Welcome back! 🐾', 'Your account and all your data have been fully restored. Nothing was lost.');
              }
            }
            if (profileErr || !profile?.terms_accepted || !profile?.onboarding_completed) {
              destination = '/onboarding';
            } else if (!profile?.handle) {
              destination = '/onboarding/handle-picker';
            } else {
              let locked = false;
              try {
                if (await isBiometricEnabled()) locked = await isBiometricAvailable();
              } catch {}
              destination = locked ? '/(auth)/lock' : '/(tabs)';
            }
          }
          // Widget tap arrived before boot — ensure we land on home tab
          if (pendingWidgetTap.current && session && destination !== '/(tabs)') {
            destination = '/(tabs)';
          }
          pendingWidgetTap.current = false;
          // Always navigate BEFORE dismissing splash to prevent the screen
          // from loading behind the fading overlay (causes animation jank).
          // Same call-alert guard as the onAuthStateChange redirect below —
          // this initial-boot navigation runs in the same render pass as
          // the call-answer effect and can race it too.
          if (!currentPathname.current.startsWith('/call-alert')) {
            router.replace(destination as any);
          }
          hideSplashThen(() => {});
        }
      }, remaining);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      dbg(TAG, 'onAuthStateChange →', event, session?.user?.id ?? 'no user');
      setSession(session);

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        // Init RevenueCat and load subscription tier.
        initRevenueCat(session.user.id);
        useSubscriptionStore.getState().loadSubscription(session.user.id).catch(() => {});
        useNotifStore.getState().fetchAll(session.user.id).catch(() => {});
        queryClient.prefetchInfiniteQuery({
          queryKey: FEED_QUERY_KEY,
          queryFn: ({ pageParam }) => fetchFeedPage(pageParam as number),
          initialPageParam: 0,
        }).catch(() => {});

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

        // Auto-sync location to all pets on login
        syncLocationToPets(session.user.id).catch((e) =>
          dbgWarn(TAG, 'syncLocationToPets failed', e?.message)
        );

        // During initial app boot, getSession handles the first navigation.
        // Only navigate from SIGNED_IN after boot is done (i.e. user signed in from the login screen).
        if (!bootCompleted.current) return;
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('onboarding_completed, terms_accepted, deleted_at, handle')
          .eq('id', session.user.id)
          .single();

        console.log('[PawBond:ProfileCheck]', {
          userId: session.user.id,
          profileExists: !!profile,
          profileError: profileError?.message,
          terms_accepted: profile?.terms_accepted,
          onboarding_completed: profile?.onboarding_completed,
          deleted_at: profile?.deleted_at ?? null,
        });

        // ── Soft-delete restore ──────────────────────────────────────────────
        // If the account was scheduled for deletion but the user logged back in
        // within 30 days, restore it automatically.
        if (profile?.deleted_at) {
          const deletedAt  = new Date(profile.deleted_at).getTime();
          const thirtyDays = 30 * 24 * 60 * 60 * 1000;
          if (Date.now() - deletedAt < thirtyDays) {
            // Restore: clear the deleted_at flag
            const { error: restoreErr } = await supabase
              .from('profiles')
              .update({ deleted_at: null })
              .eq('id', session.user.id);
            if (restoreErr) {
              console.error('[PawBond:Restore] Failed to restore account:', restoreErr.message);
              showAlert('Restore failed', "We couldn't restore your account right now. Please try signing in again.");
              await supabase.auth.signOut({ scope: 'local' });
              return;
            } else {
              showAlert(
                'Welcome back! 🐾',
                'Your account and all your data have been fully restored. Nothing was lost.',
              );
            }
          }
          // If past 30 days the purge cron already deleted the auth user,
          // so this branch is unreachable — but guard anyway.
        }

        if (currentPathname.current.startsWith('/call-alert')) {
          console.log('[PawBond:ProfileCheck] On call-alert screen, skipping post-auth redirect');
        } else if (!profile) {
          console.log('[PawBond:ProfileCheck] No profile found, going to onboarding');
          router.replace('/onboarding');
        } else if (!profile.terms_accepted) {
          console.log('[PawBond:ProfileCheck] Terms not accepted, going to onboarding');
          router.replace('/onboarding');
        } else if (!profile.onboarding_completed) {
          console.log('[PawBond:ProfileCheck] Onboarding not completed, going to onboarding');
          router.replace('/onboarding');
        } else if (!profile.handle) {
          console.log('[PawBond:ProfileCheck] No handle yet, showing handle picker');
          router.replace('/onboarding/handle-picker');
        } else {
          console.log('[PawBond:ProfileCheck] All done, going to home');
          router.replace('/(tabs)');
        }
      } else if (event === 'SIGNED_OUT') {
        // unsubscribeFromSubChanges();  // subscription not active in this version
        // Wipe all user-specific data from stores immediately so the next user
        // (or the same user logging in to a different account) never sees stale data.
        usePetStore.getState().reset();
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
      console.log('[PawBond:DeepLink] Received:', url);
      // Widget tap — open home tab (only after boot completes)
      if (url === 'pawbond:///' || url === 'pawbond://' || url === 'pawbond://home') {
        if (bootCompleted.current) {
          const { session: activeSession } = useAuthStore.getState();
          if (activeSession) {
            console.log('[PawBond:DeepLink] Navigating to home');
            router.replace('/(tabs)');
          }
        } else {
          // Let boot handle routing — it always navigates to /(tabs) for logged-in users.
          // Store intent so boot can ensure home tab lands even if other conditions interfere.
          console.log('[PawBond:DeepLink] Boot not ready — deferring widget tap to boot sequence');
          pendingWidgetTap.current = true;
        }
        return;
      }
      const inviteMatch = url.match(/^pawbond:\/\/invite\/([^?#]+)/);
      if (inviteMatch) {
        console.log('[PawBond:DeepLink] Processing invite:', inviteMatch[1]);
        router.push(`/invite/${inviteMatch[1]}`);
        return;
      }
      if (!url.startsWith('pawbond://auth/callback') && !url.includes('/--/auth/callback') && !url.includes('auth/callback')) {
        console.log('[PawBond:DeepLink] Not an auth callback, ignoring');
        return;
      }
      console.log('[PawBond:DeepLink] Processing auth callback...');
      const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
      const p = new URLSearchParams(fragment);
      const accessToken = p.get('access_token');
      const refreshToken = p.get('refresh_token') ?? '';
      console.log('[PawBond:DeepLink] Tokens found:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
      if (accessToken) {
        console.log('[PawBond:DeepLink] Setting session from callback...');
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => {
            if (error) {
              dbgError(TAG, 'deep-link setSession failed', error.message);
              console.error('[PawBond:DeepLink] setSession error:', error.message);
            } else {
              console.log('[PawBond:DeepLink] Session set successfully');
            }
          })
          .catch((e) => {
            dbgError(TAG, 'deep-link setSession threw', e?.message);
            console.error('[PawBond:DeepLink] setSession exception:', e?.message);
          });
      }
    };
    const deepLinkSub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then(url => { if (url) handleDeepLink({ url }); });

    const notifListener = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data as any;
      dbg(TAG, 'Notification tapped', data);
      console.log('[PawBond:Notification] Type:', data?.type);

      // If no active session, the user is signed out. Don't deep-link into the
      // app — just navigate to login so they can authenticate first.
      const { session: activeSession } = useAuthStore.getState();
      if (!activeSession) {
        console.log('[PawBond:Notification] No session — redirecting to login');
        router.replace('/(auth)/login');
        return;
      }

      // Helper: switch active pet context before navigating.
      // For bundled multi-pet notifications skip the switch — let the user pick.
      const switchPet = (petId: string | undefined) => {
        if (!petId) return;
        const { pets } = usePetStore.getState();
        if (pets.some(p => p.id === petId)) usePetStore.getState().setActivePet(petId);
      };
      // Always set pet context from notification data.
      // Single pet: sets it directly. Multi-pet bundle: sets the primary pet_id;
      // the destination screen (e.g. Care > Today) shows all pets regardless.
      const switchPetIfSingle = (data: any) => switchPet(data?.pet_id);

      if (data?.type === 'lost_alert') {
        router.push('/(tabs)/sos');
      } else if (data?.type === 'appointment_complete_prompt' && data?.appointment_id) {
        switchPet(data.pet_id);
        showAlert(
          'Mark appointment complete?',
          'Tap Complete to update the appointment status in your records.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Mark Complete', onPress: async () => {
              const { error } = await supabase
                .from('appointments')
                .update({ status: 'completed' })
                .eq('id', data.appointment_id);
              if (error) {
                showAlert('Error', 'Could not update appointment. Please try again.');
                return;
              }
              router.push('/health/appointments');
            }},
          ]
        );
      } else if (data?.type === 'feeding_reminder' && response?.actionIdentifier === 'fed_action') {
        // "✓ Fed" action tapped — log the meal silently without opening the app
        const petId = data?.pet_id;
        const meal  = data?.meal ?? 'meal';
        if (petId && activeSession?.user?.id) {
          const logRow = {
            pet_id: petId,
            fed_by: activeSession.user.id,
            meal_type: meal,
            food_type: null,
            amount_grams: null,
            date: todayLocal(),
            fed_at: new Date().toISOString(),
          };
          supabase.from('feeding_logs').insert(logRow).then(({ error, data: inserted }) => {
            if (error) { console.warn('[PawBond:FedAction] insert failed', error.message); return; }
            if (inserted) usePetStore.getState().fetchFeedingLogs(petId, logRow.date).catch(() => {});
          });
        }
      } else if (data?.type === 'feeding_reminder' || data?.type === 'walk_reminder') {
        switchPetIfSingle(data);
        router.push({ pathname: '/(tabs)/care', params: { section: 'today' } } as any);
      } else if (data?.type === 'mood_reminder' || data?.type === 'mood_scan_ready') {
        switchPet(data?.pet_id);
        router.push('/ai/mood-camera');
      } else if (data?.type === 'symptom_scan_ready') {
        switchPet(data?.pet_id);
        router.push('/ai/symptom-scan');
      } else if (data?.type === 'vaccine_reminder') {
        switchPet(data?.pet_id);
        router.push('/health/vaccines');
      } else if (data?.type === 'appointment_reminder') {
        switchPet(data?.pet_id);
        router.push('/health/appointments');
      } else if (data?.type === 'invite' && data?.invitation_token) {
        router.push(`/invite/${data.invitation_token}`);
      } else if (
        data?.type === 'playdate_request' || data?.type === 'playdate_resend' ||
        data?.type === 'playdate_accepted' ||
        data?.type === 'playdate_withdrawal' || data?.type === 'playdate_declined' ||
        data?.type === 'playdate_reminder' || data?.type === 'playdate_message' ||
        data?.type === 'playdate_proposal' || data?.type === 'playdate_proposal_response' ||
        data?.type === 'playdate_counter_proposal' ||
        data?.type === 'playdate_confirmed' || data?.type === 'playdate_cancelled' ||
        data?.type === 'chat_message'
      ) {
        console.log('[PawBond:Notification] Playdate notification:', data?.type);
        // Switch to the relevant pet so My Playdates shows the right data
        if (data?.pet_id) switchPet(data.pet_id);
        if (data?.chat_id) {
          router.push(`/playdate-chat/${data.chat_id}`);
        } else if (data?.request_id) {
          router.push({ pathname: '/playdate/[id]', params: { id: data.request_id } } as any);
        } else {
          router.push('/my-playdates' as any);
        }
      } else if (data?.type === 'event_rsvp' && data?.event_id) {
        router.push(`/event/${data.event_id}`);
      } else if (['post_like', 'post_comment', 'post_comment_reply', 'mention', 'new_post'].includes(data?.type)) {
        const openComments = ['post_comment', 'post_comment_reply', 'mention'].includes(data?.type) ? '1' : '0';
        if (data?.post_id) {
          router.push({ pathname: '/post/[id]', params: { id: data.post_id, open_comments: openComments } } as any);
        } else {
          router.push('/(tabs)/social-notifications' as any);
        }
      } else if (data?.type === 'follow') {
        if (data?.actor_pet_id) {
          router.push({ pathname: '/pet/[id]', params: { id: data.actor_pet_id } } as any);
        } else {
          router.push('/(tabs)/social-notifications' as any);
        }
      } else if (['medication_reminder', 'med_missed_dose', 'med_monthly_nudge', 'med_monthly_followup'].includes(data?.type)) {
        switchPet(data?.pet_id);
        router.push('/health/medications');
      } else if (['birthday_notif', 'memorial_notif'].includes(data?.type)) {
        switchPet(data?.pet_id);
        router.push({ pathname: '/(tabs)/care', params: { section: 'notes' } } as any);
      } else if (data?.type === 'daily_tip') {
        router.push({ pathname: '/(tabs)/care', params: { section: 'today' } } as any);
      } else if (data?.type === 'lost_owner_checkin') {
        router.push('/(tabs)/sos' as any);
      } else if (data?.type === 'family_update') {
        router.push({ pathname: '/(tabs)/connect', params: { tab: 'Family' } } as any);
      } else if (data?.type === 'invite' && !data?.invitation_token) {
        router.push('/(tabs)/notifications' as any);
      } else if (
        data?.type === 'playdate_rescheduled' ||
        data?.type === 'playdate_expired' ||
        data?.type === 'playdate_completion' ||
        data?.type === 'playdate_chat_message'
      ) {
        if (data?.pet_id) switchPet(data.pet_id);
        if (data?.chat_id) {
          router.push(`/playdate-chat/${data.chat_id}`);
        } else if (data?.request_id) {
          router.push({ pathname: '/playdate/[id]', params: { id: data.request_id } } as any);
        } else {
          router.push('/my-playdates' as any);
        }
      } else {
        // system, pet_found, sos, and truly unknown types
        console.log('[PawBond:Notification] Sending to notifications tab for type:', data?.type);
        router.push('/(tabs)/notifications' as any);
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
  //   1. The `global-notif-${rtUserId}` realtime channel (DB INSERT into
  //      notification_logs) — has the full row (type/data), so tapping it
  //      can route to the right screen.
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

  useEffect(() => {
    if (!rtUserId) return;
    const ch = supabase
      .channel(`global-notif-${rtUserId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_logs', filter: `user_id=eq.${rtUserId}` },
        (payload) => {
          const row = payload.new as any;
          useNotifStore.getState().increment();
          useNotifStore.getState().prependNotification(row);
          showInAppToast({ title: row?.title ?? 'New notification', body: row?.body, type: row?.type, data: row?.data });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [rtUserId]);

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
          useSubscriptionStore.getState().loadSubscription(user.id).catch(() => {});
          useNotifStore.getState().fetchAll(user.id).catch(() => {});
        }
      });

      if (awayMs < LOCK_AFTER_MS) return;
      if (!bootCompleted.current) return;
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
  useEffect(() => {
    console.log('[_layout] call-alert effect mounting');
    setupCallAlerts();
    // onCallAnswered must run BEFORE trackIncomingCallPayloads — the latter
    // reads CallKit's replayed cold-start event queue (getInitialEvents,
    // async) and, if that queue contains an already-answered call (app was
    // killed, user answered from the lock screen before JS ever loaded),
    // invokes the answer handler directly. Registering the handler after
    // starting that read would race it.
    // checkNativeAnsweredCall (UserDefaults-cached, read on boot) and
    // listenForNativeCallAnswered (the live FCCallAnswered NSNotification)
    // both feed this same handler and can BOTH fire for the same answered
    // call — the native CXCallObserver delegate that caches to UserDefaults
    // is the same one whose live notification this listens for, so a
    // single answer can trigger router.push('/call-alert') twice. The
    // second push remounts the screen mid-flight, cancelling whatever
    // audio-session wait / Speech.speak() was already in progress — this
    // was the actual cause of the "screen opens, stays open, but silent"
    // symptom on an otherwise-correct cold-start answer. Track the last
    // routed callUUID so a duplicate is a no-op.
    let lastRoutedCallUUID: string | null = null;
    const unanswer = onCallAnswered((payload) => {
      if (payload.callUUID && payload.callUUID === lastRoutedCallUUID) {
        console.log('[_layout] duplicate answer for callUUID, skipping re-navigation', payload.callUUID);
        return;
      }
      lastRoutedCallUUID = payload.callUUID || null;
      router.push({
        pathname: '/call-alert',
        params: { itemType: payload.itemType, itemId: payload.itemId, callUUID: payload.callUUID },
      } as any);
    });
    const untrack = trackIncomingCallPayloads();
    // Covers the killed-app-then-answered-from-lock-screen case
    // trackIncomingCallPayloads' getInitialEvents() cannot (see
    // checkNativeAnsweredCall in lib/callAlert.ts for the full mechanism —
    // CXCallObserver + UserDefaults instead of an in-memory replay queue).
    checkNativeAnsweredCall();
    const untrackNative = listenForNativeCallAnswered();
    return () => { untrack(); unanswer(); untrackNative(); };
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
        <Stack.Screen name="onboarding/add-pet" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="onboarding/ai-consent" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="pet/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="pet/edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="invite/[token]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="vet/clinics" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="health/appointments" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="health/weights" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile/edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="pet/card" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="playdate/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="hub/help-history" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="call-alert" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
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
