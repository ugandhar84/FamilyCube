import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
  RefreshControl,  ScrollView,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { useTheme } from '@/lib/ThemeContext';
import { RADIUS, TYPO} from '@/constants/theme';
import PawBondLoader from '@/components/PawBondLoader';
import {
  SocialCard, PetAvatar,
  TYPE_FILTERS,
} from '@/features/social/components/SocialCard';
import { useNotifSelection } from '@/features/social/hooks/useNotifSelection';
import { useSocialNotificationsData } from '@/features/social/hooks/useSocialNotificationsData';

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SocialNotificationsScreen({ hideHeader = false, onUnreadChange }: { hideHeader?: boolean; onUnreadChange?: (count: number) => void } = {}) {
  const { colors, isDark } = useTheme();
  const { user }           = useAuthStore();
  const feedEnabled      = useFeatureFlag('connect_feed_enabled', true);
  const playdatesEnabled = useFeatureFlag('connect_playdates_enabled', true);
  const chatEnabled      = useFeatureFlag('connect_playdates_chat_enabled', false);

  const hiddenTypes = useMemo(() => {
    const s = new Set<string>();
    if (!feedEnabled) { ['post_like','post_comment','follow','mention'].forEach(t => s.add(t)); }
    if (!playdatesEnabled) {
      ['playdate_request','playdate_resend','playdate_accepted','playdate_declined',
       'playdate_withdrawal','playdate_proposal','playdate_counter_proposal','playdate_confirmed',
       'playdate_proposal_declined','playdate_proposal_cancelled','playdate_cancelled',
       'playdate_reminder','playdate_rescheduled','playdate_expired','playdate_completion',
       'playdate_chat_message','chat_message'].forEach(t => s.add(t));
    }
    return s;
  }, [feedEnabled, playdatesEnabled]);

  const [typeFilter, setTypeFilter] = useState('all');
  const [petFilter,  setPetFilter]  = useState<string | null>(null);

  const listRef = useRef<FlashListRef<any>>(null);
  const sel     = useNotifSelection();
  const d       = useSocialNotificationsData(user, hiddenTypes, typeFilter, petFilter, listRef, chatEnabled);

  const isAllSelected = sel.selected.size === d.allIds.length && d.allIds.length > 0;

  useEffect(() => { onUnreadChange?.(d.totalUnread); }, [d.totalUnread, onUnreadChange]);

  const handlePress = useCallback((item: any) => {
    if (sel.selecting) { sel.toggleItem(item.id); return; }
    d.openNotif(item);
  }, [sel.selecting, sel.toggleItem, d.openNotif]);

  const handleLongPress = useCallback((id: string) => {
    sel.setSelecting(true);
    sel.setSelected(new Set([id]));
  }, []);

  const bg = isDark ? '#0E0A1A' : '#F5F3FF';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaView edges={hideHeader ? [] : ['top']} style={{ backgroundColor: bg }}>

        {!hideHeader && (
          <View style={ss.header}>
            <View>
              <Text style={[ss.title, { color: colors.textPrimary }]}>Activity</Text>
              {d.totalUnread > 0 && <Text style={[ss.sub, { color: colors.primaryText ?? colors.primary }]}>{d.totalUnread} unread</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              {d.totalUnread > 0 && !sel.selecting && (
                <TouchableOpacity onPress={d.markAllRead} style={[ss.headerBtn, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '12' }]}>
                  <Ionicons name="checkmark-done" size={14} color={colors.primaryText ?? colors.primary} />
                  <Text style={[ss.headerBtnTxt, { color: colors.primaryText ?? colors.primary }]}>Mark all read</Text>
                </TouchableOpacity>
              )}
              {sel.selecting && (
                <TouchableOpacity onPress={() => sel.setSelecting(false)} style={[ss.headerBtn, { borderColor: colors.border }]}>
                  <Text style={[ss.headerBtnTxt, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Type filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.filterRow} style={{ marginBottom: 4 }}>
          {TYPE_FILTERS.filter(ft =>
            !(ft.key === 'playdate' || ft.key === 'chat_message') || playdatesEnabled
          ).filter(ft =>
            !(ft.key === 'post_like' || ft.key === 'post_comment') || feedEnabled
          ).map(({ key, label, icon }) => {
            const active = typeFilter === key;
            const cnt    = d.typeCounts[key] ?? 0;
            return (
              <TouchableOpacity key={key} onPress={() => { setTypeFilter(key); if (sel.selecting) sel.setSelecting(false); }} activeOpacity={0.75}
                style={[ss.chip, active ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: isDark ? '#1A1030' : '#EDE9FC', borderColor: isDark ? '#2A1F48' : '#DDD6FE' }]}>
                <Text style={ss.chipIcon}>{icon}</Text>
                <Text style={[ss.chipLabel, { color: active ? '#fff' : colors.textSecondary }]}>{label}</Text>
                {cnt > 0 && (
                  <View style={[ss.chipBadge, { backgroundColor: active ? 'rgba(255,255,255,0.3)' : colors.primary }]}>
                    <Text style={ss.chipBadgeTxt}>{cnt > 99 ? '99+' : cnt}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* My pet pills */}
        {d.myPets.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.petRow} style={{ marginBottom: 4 }}>
            <TouchableOpacity onPress={() => setPetFilter(null)}
              style={[ss.petPill, !petFilter ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: isDark ? '#1A1030' : '#EDE9FC', borderColor: isDark ? '#2A1F48' : '#DDD6FE' }]}>
              <Text style={[ss.petPillTxt, { color: !petFilter ? '#fff' : colors.textSecondary }]}>🐾 All</Text>
            </TouchableOpacity>
            {d.myPets.map(p => {
              const active = petFilter === p.id;
              const tint   = p.accent_color ?? '#7C5CBF';
              const cnt    = d.myPetCounts[p.id] ?? 0;
              return (
                <TouchableOpacity key={p.id} onPress={() => setPetFilter(active ? null : p.id)}
                  style={[ss.petPill, active ? { backgroundColor: tint + '20', borderColor: tint, borderWidth: 2 } : { backgroundColor: isDark ? '#1A1030' : '#EDE9FC', borderColor: isDark ? '#2A1F48' : '#DDD6FE' }]}>
                  <View style={{ position: 'relative' }}>
                    <PetAvatar emoji={p.emoji} color={p.accent_color ?? undefined} avatarUrl={p.avatar_url} size={20} />
                    {cnt > 0 && (
                      <View style={[ss.petBadge, { backgroundColor: tint }]}>
                        <Text style={ss.petBadgeTxt}>{cnt > 9 ? '9+' : cnt}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[ss.petPillTxt, { color: active ? tint : colors.textSecondary, fontWeight: active ? '800' : '600' }]} numberOfLines={1}>{p.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      {d.loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PawBondLoader size={52} isDark={isDark} />
        </View>
      ) : d.filtered.length === 0 ? (
        <View style={ss.center}>
          <View style={[ss.emptyIcon, { backgroundColor: isDark ? '#1A1030' : '#EDE9FC' }]}>
            <Text style={{ fontSize: 36 }}>🐾</Text>
          </View>
          <Text style={[ss.emptyTitle, { color: colors.textPrimary }]}>All quiet here</Text>
          <Text style={[ss.emptySub, { color: colors.textSecondary }]}>Likes, comments, playdates{'\n'}and messages will appear here.</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/connect', params: { tab: 'Feed' } })}
            style={[ss.exploreBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Explore community</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={d.filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <SocialCard
              notif={item}
              isRead={item.read || d.readIds.has(item.id)}
              isSelected={sel.selected.has(item.id)}
              selecting={sel.selecting}
              colors={colors}
              isDark={isDark}
              actorPetMap={d.actorPetMap}
              onPress={() => handlePress(item)}
              onLongPress={() => handleLongPress(item.id)}
            />
          )}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: sel.selecting ? 120 : 40 }}
          refreshControl={<RefreshControl refreshing={d.refreshing} onRefresh={() => { d.setRefreshing(true); d.load(false); }} tintColor={colors.primary} />}
          onEndReached={d.loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={d.loadingMore ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <PawBondLoader size={36} bars={false} isDark={isDark} />
            </View>
          ) : null}
        />
      )}

      {/* Multi-select toolbar */}
      <Animated.View
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop: 8, transform: [{ translateY: sel.toolbarY }] }}
        pointerEvents={sel.selecting ? 'auto' : 'none'}
      >
        <View style={[ss.toolbar, { backgroundColor: isDark ? '#1A1030F5' : '#FFFFFFF5', borderColor: isDark ? '#3A2A5A' : '#DDD6FE' }]}>
          <TouchableOpacity style={ss.tbBtn} onPress={() => sel.setSelecting(false)}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
            <Text style={[ss.tbLabel, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <View style={[ss.divider, { backgroundColor: isDark ? '#3A2A5A' : '#DDD6FE' }]} />
          <Text style={[ss.selCount, { color: colors.textPrimary }]}>{sel.selected.size} selected</Text>
          <View style={[ss.divider, { backgroundColor: isDark ? '#3A2A5A' : '#DDD6FE' }]} />
          <TouchableOpacity style={ss.tbBtn} onPress={() => isAllSelected ? sel.setSelected(new Set()) : sel.setSelected(new Set(d.allIds))}>
            <Ionicons name="checkmark-done-circle-outline" size={22} color={colors.primaryText ?? colors.primary} />
            <Text style={[ss.tbLabel, { color: colors.primaryText ?? colors.primary }]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ss.tbBtn} onPress={() => { d.markRead([...sel.selected]); sel.setSelecting(false); }} disabled={!sel.selected.size}>
            <Ionicons name="mail-open-outline" size={22} color="#1D9E75" />
            <Text style={[ss.tbLabel, { color: '#1D9E75' }]}>Read</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ss.tbBtn} onPress={() => d.confirmDelete(sel.selected, () => sel.setSelecting(false))} disabled={!sel.selected.size}>
            <Ionicons name="trash-outline" size={22} color={sel.selected.size ? '#E24B4A' : colors.textSecondary} />
            <Text style={[ss.tbLabel, { color: sel.selected.size ? '#E24B4A' : colors.textSecondary }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const ss = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title:        { fontSize: TYPO.hero, fontWeight: '800', letterSpacing: -0.5 },
  sub:          { fontSize: TYPO.body, fontWeight: '600', marginTop: 2 },
  headerBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1 },
  headerBtnTxt: { fontSize: TYPO.body, fontWeight: '600' },
  filterRow:    { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1 },
  chipIcon:     { fontSize: TYPO.body },
  chipLabel:    { fontSize: TYPO.body, fontWeight: '600' },
  chipBadge:    { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 10, minWidth: 16, alignItems: 'center' },
  chipBadgeTxt: { fontSize: TYPO.body, fontWeight: '800', color: '#fff' },
  petRow:       { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  petPill:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1 },
  petPillTxt:   { fontSize: TYPO.body, fontWeight: '600', maxWidth: 80 },
  petBadge:     { position: 'absolute', top: -3, right: -3, minWidth: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  petBadgeTxt:  { fontSize: TYPO.body, fontWeight: '900', color: '#fff' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyIcon:    { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle:   { fontSize: TYPO.heading, fontWeight: '700' },
  emptySub:     { fontSize: TYPO.body, textAlign: 'center', lineHeight: 22 },
  exploreBtn:   { marginTop: 14, paddingHorizontal: 26, paddingVertical: 12, borderRadius: 14 },
  toolbar:      { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: -4 }, shadowRadius: 20, elevation: 10 },
  selCount:     { fontSize: TYPO.body, fontWeight: '600', flex: 1 },
  divider:      { width: 1, height: 24, marginHorizontal: 4 },
  tbBtn:        { alignItems: 'center', gap: 2, paddingHorizontal: 10 },
  tbLabel:      { fontSize: TYPO.body, fontWeight: '700' },
});
