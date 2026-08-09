import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert, TouchableOpacity, TextInput, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { getAppSettings, setAppSetting } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

const INTERVAL_OPTIONS = [
  { label: 'Daily',     value: 1 },
  { label: 'Every 2d',  value: 2 },
  { label: 'Every 3d',  value: 3 },
  { label: 'Weekly',    value: 7 },
];

const CONCERN_MODES = [
  { label: 'Random',   value: 'random',   desc: 'Rotate through all quiz concerns randomly' },
  { label: 'Priority', value: 'priority', desc: 'Always send highest-priority concern first' },
];

interface FlagDef {
  key: string;
  label: string;
  description: string;
}

interface Section {
  title: string;
  subtitle: string;
  flags: FlagDef[];
}

const SECTIONS: Section[] = [
  {
    title: 'Connect — sub-tabs',
    subtitle: 'Show or hide individual tabs inside the Connect screen.',
    flags: [
      {
        key: 'connect_feed_enabled',
        label: 'Feed',
        description: 'Community post feed — photos, updates, and stories from nearby pet parents.',
      },
      {
        key: 'connect_playdates_enabled',
        label: 'Playdates',
        description: 'Send and receive playdate requests via proposal flow.',
      },
      {
        key: 'connect_playdates_chat_enabled',
        label: 'Playdates Chat',
        description: 'Full real-time chat screen for playdate negotiation. Off = proposal-only flow.',
      },
      {
        key: 'connect_family_enabled',
        label: 'Family',
        description: 'Invite family members to co-manage a pet — shared care logs and notifications.',
      },
    ],
  },
  {
    title: 'Media',
    subtitle: 'Control media upload and viewing capabilities.',
    flags: [
      {
        key: 'video_posts_enabled',
        label: 'Video posts',
        description: 'Let users attach a video to social posts (autoplay muted in the feed, tap to unmute). Capped at 100 MB.',
      },
      {
        key: 'media_fullscreen_download_enabled',
        label: 'Full-screen media + download',
        description: "Let users tap a post's photo or video to view it full-screen and save it to their device.",
      },
    ],
  },
  {
    title: 'Community',
    subtitle: 'Community safety and event features.',
    flags: [
      {
        key: 'sos_enabled',
        label: 'SOS — lost pet alerts',
        description: 'Allow users to trigger a lost pet alert and notify nearby pet parents.',
      },
      {
        key: 'events_enabled',
        label: 'Community events',
        description: 'Let users create and RSVP to local pet events.',
      },
    ],
  },
  {
    title: 'Care & Health',
    subtitle: 'Pet care tracking and AI health features.',
    flags: [
      {
        key: 'health_records_enabled',
        label: 'Health records',
        description: 'AI-powered health record parsing and storage.',
      },
      {
        key: 'mood_scan_enabled',
        label: 'Mood scan',
        description: 'AI camera scan to detect pet mood and generate care advice.',
      },
      {
        key: 'ai_symptom_scan_enabled',
        label: 'Symptom scan',
        description: 'AI-guided symptom checker — users describe signs and get a triage recommendation.',
      },
      {
        key: 'ai_vet_chat_enabled',
        label: 'Vet chat',
        description: 'AI vet chat for quick health questions and care guidance.',
      },
      {
        key: 'daily_care_enabled',
        label: 'Daily care reminders',
        description: 'Push notifications for daily feeding, walks, and grooming.',
      },
      {
        key: 'appt_voice_input_enabled',
        label: 'Voice input for appointments',
        description: 'Mic button on the appointment form — users speak naturally and AI fills the fields automatically.',
      },
      {
        key: 'ios_widget_enabled',
        label: 'iOS home screen widget',
        description: 'Shows pet care ring, streak, and next appointment on the iOS home screen. Requires build 27+.',
      },
    ],
  },
  {
    title: 'Memories',
    subtitle: 'Pet memory, timeline, and video reel features.',
    flags: [
      {
        key: 'pet_timeline_enabled',
        label: 'AI pet timeline',
        description: 'Year-in-review AI-generated timeline of key moments for pro users.',
      },
      {
        key: 'memories_video_enabled',
        label: 'Memory video reel',
        description: 'Auto-generated video montage from gallery photos.',
      },
    ],
  },
];

const ALL_FLAGS = SECTIONS.flatMap(s => s.flags);

// ─── Rewards / gamification feature flags (stored in feature_flags table) ────
const REWARD_FLAGS: FlagDef[] = [
  { key: 'gamification',        label: 'Coins & XP system',        description: 'Master switch — enables coins, XP, levels, and all sub-features below.' },
  { key: 'daily_quests',        label: 'Daily quests',             description: 'Daily quest panel with bonus coin tasks.' },
  { key: 'leaderboard',         label: 'Weekly leaderboard',       description: 'Weekly ranking of top pet parents by XP.' },
  { key: 'cuteness_arena',      label: 'Cuteness Arena',           description: 'Weekly bracket-style cuteness vote.' },
  { key: 'rewards_marketplace', label: 'Rewards marketplace',      description: 'Partner coupons redeemable with earned coins.' },
  { key: 'pet_report_card',     label: 'Monthly pet report card',  description: 'Auto-generated shareable stat card each month.' },
  { key: 'seasonal_events',     label: 'Seasonal events',          description: 'Time-limited holiday challenges and bonus quests.' },
];

export default function AdminSettingsScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [showGoTop, setShowGoTop] = useState(false);
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Upgrade nudge config
  const [nudgeEnabled,      setNudgeEnabled]      = useState(true);
  const [nudgeIntervalDays, setNudgeIntervalDays] = useState(1);
  const [nudgeConcernMode,  setNudgeConcernMode]  = useState<'random' | 'priority'>('random');

  // Gallery limit
  const [galleryLimit,    setGalleryLimit]    = useState(4);
  const [galleryLimitStr, setGalleryLimitStr] = useState('4');

  // Rewards / gamification flags (feature_flags table)
  const [rewardFlags,    setRewardFlags]    = useState<Record<string, boolean>>({});
  const [savingRewardKey, setSavingRewardKey] = useState<string | null>(null);


  const [toastMsg, setToastMsg] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => setToastMsg(''), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAppSettings([
        ...ALL_FLAGS.map(f => f.key),
        'upgrade_nudge_enabled',
        'upgrade_nudge_interval_days',
        'upgrade_nudge_concern_mode',
        'gallery_daily_limit',
      ]);
      const parsed: Record<string, boolean> = {};
      for (const f of ALL_FLAGS) {
        const defaultOn = f.key.startsWith('connect_');
        parsed[f.key] = data[f.key] !== undefined ? data[f.key] === true : defaultOn;
      }
      setValues(parsed);
      if (data['upgrade_nudge_enabled'] !== undefined)      setNudgeEnabled(data['upgrade_nudge_enabled'] as boolean);
      if (data['upgrade_nudge_interval_days'] !== undefined) setNudgeIntervalDays(data['upgrade_nudge_interval_days'] as number);
      if (data['upgrade_nudge_concern_mode'] !== undefined)  setNudgeConcernMode(data['upgrade_nudge_concern_mode'] as any);
      if (data['gallery_daily_limit'] !== undefined) {
        const v = data['gallery_daily_limit'] as number;
        setGalleryLimit(v);
        setGalleryLimitStr(String(v));
      }

      // Load reward flags from feature_flags table
      const { data: ffRows } = await supabase.from('feature_flags').select('key,enabled').in('key', REWARD_FLAGS.map(f => f.key));
      const rf: Record<string, boolean> = {};
      for (const f of REWARD_FLAGS) rf[f.key] = false; // defaults
      for (const row of ffRows ?? []) rf[row.key] = row.enabled;
      setRewardFlags(rf);
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Could not load settings.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string, next: boolean) => {
    if (!user?.id) return;
    setValues(prev => ({ ...prev, [key]: next }));
    setSavingKey(key);
    try {
      await setAppSetting(key, next, user.id);
      showToast(`${next ? 'Enabled' : 'Disabled'} — saved`);
    } catch (e: any) {
      setValues(prev => ({ ...prev, [key]: !next }));
      showAlert('Error', e.message ?? 'Could not save setting.');
    }
    setSavingKey(null);
  };

  const toggleRewardFlag = async (key: string, next: boolean) => {
    setRewardFlags(prev => ({ ...prev, [key]: next }));
    setSavingRewardKey(key);
    try {
      const { error } = await supabase.from('feature_flags').upsert({ key, enabled: next }, { onConflict: 'key' });
      if (error) throw error;
      showToast(`${next ? 'Enabled' : 'Disabled'} — saved`);
    } catch (e: any) {
      setRewardFlags(prev => ({ ...prev, [key]: !next }));
      showAlert('Error', e.message ?? 'Could not save flag.');
    }
    setSavingRewardKey(null);
  };

  const saveNudgeEnabled = async (v: boolean) => {
    setNudgeEnabled(v);
    try {
      await setAppSetting('upgrade_nudge_enabled', v, user!.id);
      showToast(`Nudge ${v ? 'enabled' : 'disabled'} — saved`);
    } catch (e: any) { setNudgeEnabled(!v); showAlert('Error', e.message); }
  };

  const saveNudgeInterval = async (v: number) => {
    setNudgeIntervalDays(v);
    try {
      await setAppSetting('upgrade_nudge_interval_days', v, user!.id);
      showToast('Interval saved');
    } catch (e: any) { showAlert('Error', e.message); }
  };

  const saveNudgeConcernMode = async (v: 'random' | 'priority') => {
    setNudgeConcernMode(v);
    try {
      await setAppSetting('upgrade_nudge_concern_mode', v, user!.id);
      showToast('Mode saved');
    } catch (e: any) { showAlert('Error', e.message); }
  };

  const saveGalleryLimit = async (raw: string) => {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || n > 50) {
      showAlert('Invalid value', 'Enter a number between 1 and 50.');
      setGalleryLimitStr(String(galleryLimit));
      return;
    }
    setGalleryLimit(n);
    try {
      await setAppSetting('gallery_daily_limit', n, user!.id);
      showToast('Gallery limit saved');
    } catch (e: any) { showAlert('Error', e.message); }
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <PawBondLoader size={52} isDark={isDark} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} alwaysBounceVertical={false} overScrollMode="never"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}>
        <Text style={[s.pageHint, { color: colors.textSecondary }]}>
          Toggle app-wide features on or off without a release. Changes take effect immediately.
        </Text>

        {SECTIONS.map(section => (
          <View key={section.title} style={{ marginBottom: 24 }}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{section.title}</Text>
            <Text style={[s.sectionSub, { color: colors.textSecondary }]}>{section.subtitle}</Text>

            <View style={[s.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {section.flags.map((f, i) => (
                <View
                  key={f.key}
                  style={[
                    s.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[s.label, { color: colors.textPrimary }]}>{f.label}</Text>
                    <Text style={[s.desc, { color: colors.textSecondary }]}>{f.description}</Text>
                  </View>
                  <Switch
                    value={values[f.key] ?? false}
                    onValueChange={v => toggle(f.key, v)}
                    disabled={savingKey === f.key}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
              {/* Gallery daily limit — extra numeric row appended to Media section */}
              {section.title === 'Media' && (
                <View style={[s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[s.label, { color: colors.textPrimary }]}>Gallery upload limit</Text>
                    <Text style={[s.desc, { color: colors.textSecondary }]}>
                      Max photos a user can upload per pet per day (1–50). Deletions free up slots within the same day.
                    </Text>
                  </View>
                  <TextInput
                    value={galleryLimitStr}
                    onChangeText={setGalleryLimitStr}
                    onBlur={() => saveGalleryLimit(galleryLimitStr)}
                    onSubmitEditing={() => saveGalleryLimit(galleryLimitStr)}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={2}
                    style={{
                      width: 52, height: 36, borderRadius: 8,
                      borderWidth: 1, borderColor: colors.border,
                      backgroundColor: colors.background,
                      color: colors.textPrimary,
                      fontSize: TYPO.subheading, fontWeight: '700',
                      textAlign: 'center',
                    }}
                  />
                </View>
              )}
            </View>
          </View>
        ))}

        {/* ── Rewards & Gamification ────────────────────────────────── */}
        <View style={{ marginBottom: 24 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Rewards & Gamification</Text>
          <Text style={[s.sectionSub, { color: colors.textSecondary }]}>
            Toggle coins, XP, and gamification sub-features on or off globally.
          </Text>
          <View style={[s.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {REWARD_FLAGS.map((f, i) => (
              <View
                key={f.key}
                style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[s.label, { color: colors.textPrimary }]}>{f.label}</Text>
                  <Text style={[s.desc, { color: colors.textSecondary }]}>{f.description}</Text>
                </View>
                <Switch
                  value={rewardFlags[f.key] ?? false}
                  onValueChange={v => toggleRewardFlag(f.key, v)}
                  disabled={savingRewardKey === f.key}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        </View>

        {/* ── Upgrade Nudges ─────────────────────────────────────────── */}
        <View style={{ marginBottom: 24 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Upgrade Nudges</Text>
          <Text style={[s.sectionSub, { color: colors.textSecondary }]}>
            Context-aware Ultimate upgrade push notifications sent to free-tier users based on their quiz concerns.
          </Text>

          <View style={[s.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Enable / disable */}
            <View style={s.row}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[s.label, { color: colors.textPrimary }]}>Enabled</Text>
                <Text style={[s.desc, { color: colors.textSecondary }]}>
                  Master kill-switch. Off = no nudges sent regardless of other settings.
                </Text>
              </View>
              <Switch
                value={nudgeEnabled}
                onValueChange={saveNudgeEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#fff"
              />
            </View>

            {/* Interval */}
            <View style={[s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: 'column', alignItems: 'flex-start' }]}>
              <Text style={[s.label, { color: colors.textPrimary, marginBottom: 4 }]}>Send interval</Text>
              <Text style={[s.desc, { color: colors.textSecondary, marginBottom: 10 }]}>
                Minimum days between nudges per user. Default: Daily (1 day).
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {INTERVAL_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => saveNudgeInterval(opt.value)}
                    style={[
                      s.chip,
                      nudgeIntervalDays === opt.value
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { backgroundColor: 'transparent', borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.chipText, { color: nudgeIntervalDays === opt.value ? '#fff' : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Concern mode */}
            <View style={[s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: 'column', alignItems: 'flex-start' }]}>
              <Text style={[s.label, { color: colors.textPrimary, marginBottom: 4 }]}>Concern selection</Text>
              <Text style={[s.desc, { color: colors.textSecondary, marginBottom: 10 }]}>
                How concerns are picked from the user's quiz answers for each nudge.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CONCERN_MODES.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => saveNudgeConcernMode(opt.value as any)}
                    style={[
                      s.chip,
                      nudgeConcernMode === opt.value
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { backgroundColor: 'transparent', borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.chipText, { color: nudgeConcernMode === opt.value ? '#fff' : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.desc, { color: colors.textSecondary, marginTop: 8 }]}>
                {CONCERN_MODES.find(m => m.value === nudgeConcernMode)?.desc}
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>
      {showGoTop && (
        <TouchableOpacity
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
      {toastMsg !== '' && (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', bottom: 88, alignSelf: 'center',
          opacity: toastOpacity,
          backgroundColor: '#1C1C1E', borderRadius: 20,
          paddingHorizontal: 20, paddingVertical: 10,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 }, elevation: 6,
        }}>
          <Ionicons name="checkmark-circle" size={16} color="#34C759" />
          <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '600' }}>{toastMsg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pageHint:     { fontSize: TYPO.body, lineHeight: 19, marginBottom: 20 },
  sectionTitle: { fontSize: TYPO.body, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  sectionSub:   { fontSize: TYPO.body, lineHeight: 17, marginBottom: 10 },
  group:        { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', padding: 14 },
  label:        { fontSize: TYPO.body, fontWeight: '600', marginBottom: 2 },
  desc:         { fontSize: TYPO.body, lineHeight: 16 },
  chip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText:     { fontSize: TYPO.body, fontWeight: '600' },
});
