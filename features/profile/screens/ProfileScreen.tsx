/**
 * ProfileScreen — the user's profile tab.
 *
 * Domain hooks:
 *   - useProfileSettings  → biometrics, screenshot protection, AI consent, mood count
 *   - useProfilePrivacy   → profile-visibility + pet-visibility toggles (12 fields)
 *   - useProfileSheets    → bottom-sheet open/close state (7 sheets)
 *
 * Components:
 *   - NotificationSettingsSheet, ProfileEditSheet, ProfilePrivacySheet, PetPrivacySheet
 *   - ProfileCard, ProfileSectionHeader, SettingRow, ProfileStatTiles, ProfilePetsList
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, ScrollView, TouchableOpacity,
  Switch, RefreshControl, Modal, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '@/components/AppAlert';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import type { ThemeMode } from '@/lib/ThemeContext';
import { usePreferenceStore } from '@/store/preferenceStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import LazyImage from '@/components/LazyImage';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { useFeatureFlag as useGate, invalidateFeatureFlags } from '@/lib/featureFlags';
import SubscriptionBadge from '@/components/SubscriptionBadge';
import RewardsScreen from '@/features/rewards/RewardsScreen';
import FeedbackSheet from '@/components/FeedbackSheet';

import { useProfileSettings }    from '@/features/profile/hooks/useProfileSettings';
import { useProfilePrivacy }     from '@/features/profile/hooks/useProfilePrivacy';
import { useProfileSheets }      from '@/features/profile/hooks/useProfileSheets';
import SettingRow                from '@/features/profile/components/SettingRow';
import ProfileSectionHeader      from '@/features/profile/components/ProfileSectionHeader';
import ProfileCard               from '@/features/profile/components/ProfileCard';
import NotificationSettingsSheet from '@/features/profile/components/NotificationSettingsSheet';
import ProfileEditSheet          from '@/features/profile/components/ProfileEditSheet';
import ProfilePrivacySheet       from '@/features/profile/components/ProfilePrivacySheet';
import PetPrivacySheet           from '@/features/profile/components/PetPrivacySheet';
import { hero, thm }             from '@/features/profile/styles';
import { initials, memberSince } from '@/features/profile/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BottomSheet from '@/components/BottomSheet';
import ProfileStatTiles          from '@/features/profile/components/ProfileStatTiles';
import ProfilePetsList           from '@/features/profile/components/ProfilePetsList';

export default function ProfileScreen() {
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile, fetchProfile, signOut, updateProfile } = useAuthStore();
  const { pets, activePet, activePetId, fetchPets } = usePetStore(
    useShallow(s => ({ pets: s.pets, activePet: s.activePet, activePetId: s.activePetId, fetchPets: s.fetchPets }))
  );
  const accent           = activePet()?.accent_color ?? colors.primary;
  const { tier }         = useSubscriptionStore();
  const sosEnabled         = useFeatureFlag('sos_enabled', true);
  const adminPanelEnabled  = useFeatureFlag('admin_panel_enabled', true);
  const familyEnabled      = useFeatureFlag('connect_family_enabled', false);
  const playdatesEnabled   = useFeatureFlag('connect_playdates_enabled', true);
  const eventsEnabled      = useFeatureFlag('events_enabled', true);
  const rewardsEnabled       = useGate('rewards_marketplace');
  const gamificationEnabled  = useGate('gamification');
  const [showRewards, setShowRewards] = useState(false);

  // ── Widget pet selector ──────────────────────────────────────────────────────
  const WIDGET_PREF_KEY = 'widget_selected_pet_ids';
  const [showWidgetSheet, setShowWidgetSheet] = useState(false);
  const [widgetPetIds, setWidgetPetIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(WIDGET_PREF_KEY).then(val => {
      if (val) setWidgetPetIds(JSON.parse(val));
      else setWidgetPetIds(pets.slice(0, 3).map(p => p.id)); // default: all pets
    });
  }, [pets]);

  const toggleWidgetPet = async (petId: string) => {
    setWidgetPetIds(prev => {
      const next = prev.includes(petId) ? prev.filter(id => id !== petId) : [...prev, petId];
      AsyncStorage.setItem(WIDGET_PREF_KEY, JSON.stringify(next));
      return next;
    });
  };

  // ── Domain hooks ─────────────────────────────────────────────────────────────
  const {
    bioAvailable, bioEnabled, bioLabel,
    screenshotProtect,
    toggleBiometric, toggleScreenshotProtection,
    moodScanCount,
  } = useProfileSettings(activePetId, profile);

  const privacy = useProfilePrivacy(profile, user?.id);
  const sheets  = useProfileSheets();

  // ── Notification preferences ─────────────────────────────────────────────────
  const {
    notifDaily, setNotifDaily, notifHealth, setNotifHealth,
    notifAppointment, setNotifAppointment,
    notifLost, setNotifLost, notifFamily, setNotifFamily,
    notifPlaydate, setNotifPlaydate, notifChat, setNotifChat,
    notifEvent, setNotifEvent,
    notifPostLike, setNotifPostLike, notifPostComment, setNotifPostComment,
    notifFollow, setNotifFollow, notifMention, setNotifMention,
    quietHoursEnabled, setQuietHoursEnabled,
    quietHoursStart, setQuietHoursStart,
    quietHoursEnd, setQuietHoursEnd,
    loadPreferences,
  } = usePreferenceStore();

  // ── Avatar / emoji ───────────────────────────────────────────────────────────
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [userEmoji,      setUserEmoji]      = useState('🧑');
  useEffect(() => { if (profile) setUserEmoji((profile as any).user_emoji ?? '🧑'); }, [profile]);

  const avatarUri   = localAvatarUri ?? profile?.avatar_url ?? null;
  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? 'You';
  const avatarInit  = initials(profile?.full_name, user?.email);
  const memberStr   = memberSince(profile?.created_at);

  // ── Refresh ──────────────────────────────────────────────────────────────────
  const lastProfileFetch = useRef(0);
  const scrollViewRef    = useRef<ScrollView>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastProfileFetch.current = 0;
    invalidateFeatureFlags();
    await Promise.all([fetchProfile(), user?.id ? fetchPets(user.id) : Promise.resolve()]);
    setRefreshing(false);
  }, [fetchProfile, fetchPets, user?.id]);

  useEffect(() => { fetchProfile(); }, []);
  useFocusEffect(useCallback(() => {
    const now = Date.now();
    if (now - lastProfileFetch.current < 30_000) return;
    lastProfileFetch.current = now;
    fetchProfile();
    loadPreferences();
  }, [fetchProfile, loadPreferences]));

  // ── Reputation ratings ────────────────────────────────────────────────────────
  const [eventRating,    setEventRating]    = useState<{ avg: number; count: number } | null>(null);
  const [playdateRating, setPlaydateRating] = useState<{ avg: number; count: number } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from('user_event_rating_stats').select('avg_rating, total_ratings').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_host_rating_stats').select('avg_rating, total_ratings').eq('user_id', user.id).maybeSingle(),
    ]).then(([ev, pd]) => {
      if (ev.data?.avg_rating) setEventRating({ avg: Number(ev.data.avg_rating), count: ev.data.total_ratings });
      if (pd.data?.avg_rating) setPlaydateRating({ avg: Number(pd.data.avg_rating), count: pd.data.total_ratings });
    });
  }, [user?.id]);

  const handleSignOut = () => {
    showAlert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/(auth)/login?signedOut=1'); } },
    ]);
  };

  const themeOptions: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; value: ThemeMode }[] = [
    { label: 'System', icon: 'phone-portrait-outline', value: 'system' },
    { label: 'Light',  icon: 'sunny-outline',          value: 'light'  },
    { label: 'Dark',   icon: 'moon-outline',           value: 'dark'   },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView ref={scrollViewRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false} overScrollMode="never"
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          onScroll={e => setShowScrollTop(e.nativeEvent.contentOffset.y > 200)} scrollEventThrottle={16}>

          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 }}>
            <Text style={{ fontSize: TYPO.hero, fontWeight: '800', color: colors.textPrimary }}>Profile</Text>
          </View>

          {/* Hero card */}
          <LinearGradient colors={[accent, `${accent}CC`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hero.card}>
            <View style={[hero.blob, { width: 160, height: 160, top: -50, right: -40, opacity: 0.12 }]} />
            <View style={[hero.blob, { width: 80, height: 80, bottom: 10, left: -20, opacity: 0.10 }]} />
            <TouchableOpacity onPress={() => sheets.setShowEdit(true)} style={[hero.editBtn, { position: 'absolute', top: 0, right: 0, zIndex: 10 }]}>
              <Ionicons name="pencil-outline" size={16} color="#fff" />
            </TouchableOpacity>
            <View style={hero.topRow}>
              <TouchableOpacity onPress={() => sheets.setShowPhotoPicker(true)} activeOpacity={0.8}>
                <View style={hero.avatarRing}>
                  {avatarUri
                    ? <LazyImage key={avatarUri} uri={avatarUri} style={hero.avatar} />
                    : <LinearGradient colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.15)']} style={[hero.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: userEmoji ? 36 : TYPO.hero, fontWeight: '800', color: '#fff' }}>{userEmoji || avatarInit}</Text>
                      </LinearGradient>
                  }
                  <View style={hero.camBadge}><Ionicons name="camera" size={12} color="#fff" /></View>
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={hero.name} numberOfLines={1}>{displayName}</Text>
                  <SubscriptionBadge tier={tier} size="md" />
                </View>
                {profile?.handle ? <Text style={[hero.email, { color: 'rgba(255,255,255,0.90)', fontWeight: '600', marginBottom: 1 }]}>@{profile.handle}</Text> : null}
                <Text style={hero.email}>{user?.email}</Text>
                {profile?.phone ? <Text style={hero.email}>📱 {profile.phone}</Text> : null}
                {memberStr ? <Text style={hero.since}>{memberStr}</Text> : null}
              </View>
            </View>
          </LinearGradient>

          {/* Stat tiles */}
          <ProfileStatTiles petsCount={pets.length} moodScanCount={moodScanCount} accent={accent} colors={colors} sosEnabled={sosEnabled} />

          {/* Reputation row — only shown when ratings exist */}
          {(eventRating || playdateRating) && (
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 4, marginBottom: 2 }}>
              {eventRating && (
                <View style={{ flex: 1, backgroundColor: colors.inputBg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.title }}>🎪</Text>
                  <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary }}>
                    ⭐ {eventRating.avg.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontWeight: '600' }}>
                    Host rating
                  </Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
                    {eventRating.count} {eventRating.count === 1 ? 'review' : 'reviews'}
                  </Text>
                </View>
              )}
              {playdateRating && (
                <View style={{ flex: 1, backgroundColor: colors.inputBg, borderRadius: 14, padding: 12, alignItems: 'center', gap: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.title }}>🐾</Text>
                  <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: colors.textPrimary }}>
                    ⭐ {playdateRating.avg.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontWeight: '600' }}>
                    Playdate host
                  </Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
                    {playdateRating.count} {playdateRating.count === 1 ? 'review' : 'reviews'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* My babies */}
          <ProfileSectionHeader label="My babies" colors={colors} first />
          <ProfilePetsList pets={pets} accent={accent} colors={colors} />

          {/* Appearance */}
          <ProfileSectionHeader label="Appearance" colors={colors} />
          <ProfileCard colors={colors}>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, marginBottom: 10 }}>Theme</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {themeOptions.map(opt => {
                  const active = mode === opt.value;
                  return (
                    <TouchableOpacity key={opt.value} onPress={() => setMode(opt.value)} activeOpacity={0.75}
                      style={[thm.cell, { backgroundColor: active ? accent : (colors.inputBg ?? colors.background), borderColor: active ? accent : colors.border }]}>
                      <Ionicons name={opt.icon} size={20} color={active ? '#fff' : colors.textSecondary} />
                      <Text style={[thm.label, { color: active ? '#fff' : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>{opt.label}</Text>
                      {active && <View style={thm.check}><Ionicons name="checkmark" size={10} color={accent} /></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ProfileCard>

          {/* Notifications */}
          <ProfileSectionHeader label="Notifications" colors={colors} />
          <ProfileCard colors={colors}>
            <SettingRow icon="notifications-outline" label="Notification settings" sub="Manage alerts, reminders & quiet hours" colors={colors}
              right={<Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
              onPress={() => sheets.setShowNotifSheet(true)} />
          </ProfileCard>

          {/* Widget */}
          {Platform.OS === 'ios' && pets.length > 0 && (
            <>
              <ProfileSectionHeader label="Home screen widget" colors={colors} />
              <ProfileCard colors={colors}>
                <SettingRow
                  icon="grid-outline"
                  label="Widget pets"
                  sub={widgetPetIds.length === 0
                    ? 'No pets selected'
                    : widgetPetIds.length === pets.length
                      ? 'All pets shown'
                      : `${widgetPetIds.length} of ${pets.length} pets shown`}
                  colors={colors}
                  right={<Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
                  onPress={() => setShowWidgetSheet(true)}
                />
              </ProfileCard>
            </>
          )}

          {/* My public profile */}
          <ProfileSectionHeader label="My public profile" colors={colors} />
          <ProfileCard colors={colors}>
            <SettingRow icon="person-outline" label="Profile emoji" sub="Your public avatar emoji" colors={colors}
              right={
                <TouchableOpacity onPress={() => sheets.setShowEmojiPicker(true)}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.title }}>{userEmoji}</Text>
                </TouchableOpacity>
              } />
            <SettingRow icon="eye-outline" label="Visibility" sub="Choose what others can see" colors={colors} borderTop
              onPress={() => sheets.setShowProfilePrivacy(true)}
              right={<Ionicons name="chevron-forward" size={16} color={colors.textTertiary ?? colors.textSecondary} />} />
          </ProfileCard>

          {/* My babies' profiles */}
          <ProfileSectionHeader label="My babies' profiles" colors={colors} />
          <ProfileCard colors={colors}>
            <SettingRow icon="eye-outline" label="What others can see" sub="Choose what visitors see when they visit your babies" colors={colors}
              onPress={() => sheets.setShowPetPrivacy(true)}
              right={<Ionicons name="chevron-forward" size={16} color={colors.textTertiary ?? colors.textSecondary} />} />
          </ProfileCard>

          {/* Security */}
          <ProfileSectionHeader label="Security" colors={colors} />
          <ProfileCard colors={colors}>
            {bioAvailable
              ? <SettingRow icon={bioLabel === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
                  label={`Lock with ${bioLabel}`} sub="Require it each time you open the app" colors={colors}
                  right={<Switch value={bioEnabled} onValueChange={toggleBiometric}
                    trackColor={{ false: colors.border, true: `${accent}80` }}
                    thumbColor={bioEnabled ? accent : (colors.textTertiary ?? '#999')} />} />
              : <SettingRow icon="lock-closed-outline" label="Biometrics not available" colors={colors} />
            }
            <SettingRow icon="eye-off-outline" label="Screenshot protection" sub="Blocks screenshots and screen recording" colors={colors} borderTop
              right={<Switch value={screenshotProtect} onValueChange={toggleScreenshotProtection}
                trackColor={{ false: colors.border, true: `${accent}80` }}
                thumbColor={screenshotProtect ? accent : (colors.textTertiary ?? '#999')} />} />
            <SettingRow icon="key-outline" label="Change password" sub="Reset via email" colors={colors} borderTop
              right={
                <TouchableOpacity onPress={async () => {
                  if (!user?.email) return;
                  const { error } = await supabase.auth.resetPasswordForEmail(user.email);
                  error ? showAlert('Error', error.message) : showAlert('Email sent', 'Check your inbox for the reset link.');
                }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: accent }}>Send link</Text>
                </TouchableOpacity>
              } />
          </ProfileCard>

          {/* Terms */}
          <View style={{ marginTop: 16 }}>
            <ProfileCard colors={colors}>
              {profile?.terms_accepted
                ? <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
                    <Ionicons name="document-text-outline" size={20} color={colors.primaryText ?? colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.subheading, fontWeight: '600', color: colors.textPrimary }}>Terms & Conditions</Text>
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>
                        ✅ Accepted v{profile.terms_version ?? '1.0'} · {profile.terms_accepted_at ? new Date(profile.terms_accepted_at).toLocaleDateString() : ''}
                      </Text>
                    </View>
                  </View>
                : <SettingRow icon="document-text-outline" label="Terms & Conditions" sub="Not yet accepted" colors={colors}
                    color={colors.danger ?? '#EF4444'} onPress={() => router.push('/onboarding/terms')} />
              }
            </ProfileCard>
          </View>

          {/* Admin */}
          {adminPanelEnabled && profile?.is_admin && (
            <>
              <ProfileSectionHeader label="Admin" colors={colors} />
              <TouchableOpacity onPress={() => router.push('/admin')} activeOpacity={0.85}
                style={{ marginHorizontal: 16, borderRadius: 20, overflow: 'hidden' }}>
                <LinearGradient colors={['#6C3FC5', '#3B2F8F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="shield-checkmark" size={20} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: '#fff', letterSpacing: -0.3 }}>Admin Dashboard</Text>
                      <Text style={{ fontSize: TYPO.body, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Media cleanup, retention config</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {/* Rewards marketplace — requires both gamification and rewards_marketplace flags */}
          {rewardsEnabled && gamificationEnabled && (
            <>
              <ProfileSectionHeader label="Rewards" colors={colors} />
              <ProfileCard colors={colors}>
                <SettingRow
                  icon="gift-outline"
                  label="Pet Rewards"
                  sub="Redeem coins for partner coupons & discounts"
                  colors={colors}
                  onPress={() => setShowRewards(true)}
                />
              </ProfileCard>
            </>
          )}

          {/* Support */}
          <ProfileSectionHeader label="Support" colors={colors} />
          <ProfileCard colors={colors}>
            <SettingRow icon="bug-outline" label="Report a bug" sub="Send feedback or report an issue" colors={colors} onPress={() => sheets.setShowFeedback(true)} />
          </ProfileCard>

          {/* Account */}
          <ProfileSectionHeader label="Account" colors={colors} />
          <ProfileCard colors={colors}>
            <SettingRow icon="trash-outline" label="Delete account" sub="Permanently removes all data"
              color={colors.danger ?? '#EF4444'} colors={colors}
              onPress={() => showAlert('Delete account?',
                'Your account will be scheduled for deletion. All data is kept safely for 30 days — just log back in within that time and everything will be automatically restored. After 30 days, deletion is permanent.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete account', style: 'destructive', onPress: async () => {
                    const { data: { user: authUser } } = await supabase.auth.getUser();
                    if (!authUser) return;
                    const { error } = await supabase.functions.invoke('delete-account', { body: { user_id: authUser.id } });
                    if (error) { showAlert('Error', 'Could not delete your account. Please try again or contact support.'); return; }
                    await signOut();
                  }},
                ],
              )} />
          </ProfileCard>

          {/* Sign out */}
          <TouchableOpacity onPress={handleSignOut} activeOpacity={0.8}
            style={{ marginHorizontal: 16, marginTop: 22, height: 52, borderRadius: 16,
              borderWidth: 1.5, borderColor: colors.danger ?? '#EF4444',
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger ?? '#EF4444'} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.danger ?? '#EF4444' }}>Sign out</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
            PawBond v1.0.0 · Made with 💚 for pet lovers
          </Text>
        </ScrollView>
      </SafeAreaView>

      {/* Widget pet selector sheet */}
      <BottomSheet
        visible={showWidgetSheet}
        onClose={() => setShowWidgetSheet(false)}
        title="Widget pets">
        <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 }}>
            Choose which pets appear on your home screen widget. Up to 3 pets are shown.
          </Text>
          {pets.map((p, idx) => {
            const pAc = (p as any).accent_color ?? accent;
            const selected = widgetPetIds.includes(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => toggleWidgetPet(p.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingVertical: 14,
                  borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                }}>
                <View style={{ width: 46, height: 46, borderRadius: 23,
                  backgroundColor: `${pAc}22`, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: TYPO.title }}>{p.emoji ?? '🐾'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{p.name}</Text>
                  {(p as any).species ? (
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 1 }}>
                      {(p as any).species}
                    </Text>
                  ) : null}
                </View>
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: selected ? pAc : 'transparent',
                  borderWidth: 2, borderColor: selected ? pAc : colors.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected && <Ionicons name="checkmark" size={15} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>

      {/* ── Bottom sheets ── */}
      <NotificationSettingsSheet
        visible={sheets.showNotifSheet} onClose={() => sheets.setShowNotifSheet(false)}
        tier={tier} accent={accent} colors={colors}
        notifDaily={notifDaily} setNotifDaily={setNotifDaily}
        notifHealth={notifHealth} setNotifHealth={setNotifHealth}
        notifAppointment={notifAppointment} setNotifAppointment={setNotifAppointment}
        notifPostLike={notifPostLike} setNotifPostLike={setNotifPostLike}
        notifPostComment={notifPostComment} setNotifPostComment={setNotifPostComment}
        notifFollow={notifFollow} setNotifFollow={setNotifFollow}
        notifMention={notifMention} setNotifMention={setNotifMention}
        notifLost={notifLost} setNotifLost={setNotifLost}
        notifFamily={notifFamily} setNotifFamily={setNotifFamily}
        notifPlaydate={notifPlaydate} setNotifPlaydate={setNotifPlaydate}
        notifChat={notifChat} setNotifChat={setNotifChat}
        notifEvent={notifEvent} setNotifEvent={setNotifEvent}
        quietHoursEnabled={quietHoursEnabled} setQuietHoursEnabled={setQuietHoursEnabled}
        quietHoursStart={quietHoursStart} setQuietHoursStart={setQuietHoursStart}
        quietHoursEnd={quietHoursEnd} setQuietHoursEnd={setQuietHoursEnd}
        sosEnabled={sosEnabled} familyEnabled={familyEnabled}
        playdatesEnabled={playdatesEnabled} eventsEnabled={eventsEnabled}
      />

      <ProfileEditSheet
        showEdit={sheets.showEdit}               onCloseEdit={() => sheets.setShowEdit(false)}
        showPhotoPicker={sheets.showPhotoPicker} onClosePhotoPicker={() => sheets.setShowPhotoPicker(false)}
        showEmojiPicker={sheets.showEmojiPicker} onCloseEmojiPicker={() => sheets.setShowEmojiPicker(false)}
        initialName={profile?.full_name ?? ''} initialPhone={profile?.phone ?? ''}
        avatarUri={avatarUri} avatarInit={avatarInit}
        profileName={profile?.full_name ?? undefined}
        userEmoji={userEmoji} onEmojiChange={setUserEmoji}
        onSave={async (name, phone) => {
          await updateProfile({ full_name: name || (profile?.full_name ?? ''), phone: phone || null });
          lastProfileFetch.current = Date.now();
        }}
        onAvatarUriChange={uri => {
          setLocalAvatarUri(uri);
          if (uri && uri.startsWith('http')) updateProfile({ avatar_url: uri });
          if (!uri) updateProfile({ avatar_url: null });
        }}
        userId={user?.id} accent={accent} colors={colors}
      />

      <ProfilePrivacySheet
        visible={sheets.showProfilePrivacy} onClose={() => sheets.setShowProfilePrivacy(false)}
        showName={privacy.profileShowName}   onChangeName={v  => { privacy.setProfileShowName(v);  privacy.saveProfilePrivacy('profile_show_full_name', v); }}
        showEmail={privacy.profileShowEmail} onChangeEmail={v => { privacy.setProfileShowEmail(v); privacy.saveProfilePrivacy('profile_show_email', v); }}
        showPhoto={privacy.profileShowPhoto} onChangePhoto={v => { privacy.setProfileShowPhoto(v); privacy.saveProfilePrivacy('profile_show_photo', v); }}
        accent={accent} colors={colors}
      />

      <PetPrivacySheet
        visible={sheets.showPetPrivacy} onClose={() => sheets.setShowPetPrivacy(false)}
        showAbout={privacy.petShowAbout}           onChangeAbout={v      => { privacy.setPetShowAbout(v);      privacy.savePetPrivacy('pet_show_about',      v); }}
        showVaccines={privacy.petShowVaccines}     onChangeVaccines={v   => { privacy.setPetShowVaccines(v);   privacy.savePetPrivacy('pet_show_vaccines',   v); }}
        showAllergies={privacy.petShowAllergies}   onChangeAllergies={v  => { privacy.setPetShowAllergies(v);  privacy.savePetPrivacy('pet_show_allergies',  v); }}
        showVetVisits={privacy.petShowVetVisits}   onChangeVetVisits={v  => { privacy.setPetShowVetVisits(v);  privacy.savePetPrivacy('pet_show_vet_visits', v); }}
        showWeight={privacy.petShowWeight}         onChangeWeight={v     => { privacy.setPetShowWeight(v);     privacy.savePetPrivacy('pet_show_weight',     v); }}
        showMilestones={privacy.petShowMilestones} onChangeMilestones={v => { privacy.setPetShowMilestones(v); privacy.savePetPrivacy('pet_show_milestones', v); }}
        accent={accent} colors={colors}
      />

      <FeedbackSheet visible={sheets.showFeedback} onClose={() => sheets.setShowFeedback(false)} />

      <Modal visible={showRewards} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRewards(false)}>
        <RewardsScreen onClose={() => setShowRewards(false)} />
      </Modal>

      {/* Scroll-to-top FAB */}
      {showScrollTop && (
        <TouchableOpacity onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: insets.bottom + 16, right: 20, width: 46, height: 46, borderRadius: 23,
            backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}
