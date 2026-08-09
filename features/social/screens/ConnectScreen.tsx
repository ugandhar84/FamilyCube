/**
 * PawBond — Connect (Tab 3)
 *
 * Single top bar: Feed · Nearby · Family · Playdates
 * SocialScreen is ALWAYS mounted (display:'none' when Playdates is active) to
 * preserve its Supabase realtime channel subscription.
 */
import { useState, useEffect } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';

import SocialScreen from '@/app/(tabs)/social';

type MainTab = 'Feed' | 'Nearby' | 'Family';
type TabLabel = 'Feed' | 'Playdates' | 'Family';

const ALL_TABS: { label: TabLabel; tab: MainTab }[] = [
  { label: 'Feed',      tab: 'Feed'   },
  { label: 'Playdates', tab: 'Nearby' },
  { label: 'Family',    tab: 'Family' },
];

export default function ConnectScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ tab?: MainTab; post_id?: string; open_comments?: string }>();
  const [tab, setTab] = useState<MainTab>(params.tab ?? 'Feed');

  // Deep links (notifications, etc.) navigate here with a `tab` param instead
  // of pushing the hidden `/(tabs)/social` route directly — that route stays
  // mounted alongside this screen's own SocialScreen child once visited
  // (tabs don't unmount on blur), and two instances sharing the same
  // activePetId collide on the same realtime channel topic and crash.
  useEffect(() => {
    if (params.tab) setTab(params.tab);
  }, [params.tab]);
  const flags = {
    feed:      useFeatureFlag('connect_feed_enabled', true),
    playdates: useFeatureFlag('connect_playdates_enabled', true),
    family:    useFeatureFlag('connect_family_enabled', false),
  };
  const TABS = ALL_TABS.filter(t =>
    (t.tab !== 'Feed'   || flags.feed) &&
    (t.tab !== 'Nearby' || flags.playdates) &&
    (t.tab !== 'Family' || flags.family)
  );

  // If the current tab just got disabled out from under the user, jump to
  // the first tab that's still enabled — otherwise the pill disappears but
  // SocialScreen keeps rendering whatever `tab` was last set to.
  useEffect(() => {
    if (TABS.length > 0 && !TABS.some(t => t.tab === tab)) {
      setTab(TABS[0].tab);
    }
  }, [flags.feed, flags.playdates, flags.family]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={styles.titleRow}>
          {/* Title row with pulsing badge */}
          <View style={styles.topRow}>
            <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Connect</Text>
          </View>

          {/* Segmented control — same style as Care / Memories */}
          <View style={[styles.segTrack, { backgroundColor: colors.card }]}>
            {TABS.map(({ label, tab: t }) => {
              const active = tab === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.segItem,
                    active && {
                      backgroundColor: colors.primary,
                      shadowColor: colors.primary,
                      shadowOpacity: 0.3,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 2,
                    },
                  ]}
                  onPress={() => setTab(t)}
                  activeOpacity={0.8}>
                  <Text style={[
                    styles.segLabel,
                    { color: active ? '#fff' : colors.textSecondary,
                      fontWeight: active ? '700' : '500' },
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </SafeAreaView>


      <View style={{ flex: 1 }}>
        {/* SocialScreen always mounted — drives Feed / Playdates(Nearby) / Family */}
        <SocialScreen
          hideHeader
          forceTab={tab}
          initialPostId={params.post_id}
          openComments={params.open_comments === '1'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 8,
  },
  pageTitle: {
    fontSize: TYPO.hero,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segTrack: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    gap: 3,
  },
  segItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 17,
  },
  segLabel: {
    fontSize: TYPO.body,
  },

});
