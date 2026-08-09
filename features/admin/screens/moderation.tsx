import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text,  TouchableOpacity, StyleSheet,
  Alert, TextInput, RefreshControl, Platform,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import LazyImage from '@/components/LazyImage';
import {
  getModerationPosts, approvePost, hidePost, blockPostMedia, unblockPostMedia, deleteAdminPost,
  type ModerationPost as Post, type ModerationTab,
} from '@/lib/db/admin';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

function ModVideoPlayer({ uri }: { uri: string }) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; p.play(); });
  return (
    <View style={{ width: '100%', height: 200, backgroundColor: '#000' }}>
      <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      <TouchableOpacity
        style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, padding: 5 }}
        onPress={() => { player.muted = !player.muted; setMuted(m => !m); }}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

type Tab = ModerationTab;
const TABS: { key: Tab; label: string }[] = [
  { key: 'reported', label: '🔴 Reported' },
  { key: 'recent',   label: '🕐 Recent'   },
  { key: 'all',      label: '📋 All'      },
];

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function ModerationScreen() {
  const { colors, isDark } = useTheme();
  const listRef   = useRef<FlashListRef<any>>(null);
  const loadedOnce = useRef(false);
  const searchRef  = useRef('');

  const [tab, setTab]           = useState<Tab>('reported');
  const [posts, setPosts]       = useState<Post[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showGoTop, setShowGoTop] = useState(false);

  // Date filter
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate,   setToDate]   = useState<Date | null>(null);
  const [showFrom, setShowFrom] = useState(false);
  const [showTo,   setShowTo]   = useState(false);

  const load = useCallback(async (silent = false, t: Tab = tab) => {
    if (silent) setRefreshing(true);
    else if (!loadedOnce.current) setLoading(true);
    try {
      let rows = await getModerationPosts(t, fromDate, toDate);
      const search = searchRef.current.trim();
      if (search) {
        const lc = search.toLowerCase();
        rows = rows.filter(p =>
          (p.author_name ?? '').toLowerCase().includes(lc) ||
          (p.caption ?? '').toLowerCase().includes(lc)
        );
      }
      setPosts(rows);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      loadedOnce.current = true;
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, [tab, fromDate, toDate]);

  useEffect(() => { load(false, tab); }, [tab, fromDate, toDate]);
  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) load(true, tab);
  }, [load, tab]));

  const approve = async (post: Post) => {
    try {
      await approvePost(post.id);
      setPosts(prev => prev.filter(p => p.id !== post.id));
    } catch (e: any) {
      showAlert('Error', e.message);
    }
  };

  const hide = async (post: Post) => {
    try {
      await hidePost(post.id);
      setPosts(prev => prev.filter(p => p.id !== post.id));
    } catch (e: any) {
      showAlert('Error', e.message);
    }
  };

  const toggleMediaBlock = async (post: Post) => {
    const blocking = !post.is_media_blocked;
    showAlert(
      blocking ? 'Block media?' : 'Unblock media?',
      blocking
        ? 'The photo/video will be hidden from public view. The caption and post remain.'
        : 'The media will be restored and visible to all users.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: blocking ? 'Block Media' : 'Unblock', style: blocking ? 'destructive' : 'default', onPress: async () => {
          try {
            if (blocking) await blockPostMedia(post.id);
            else await unblockPostMedia(post.id);
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, is_media_blocked: blocking } : p));
          } catch (e: any) { showAlert('Error', e.message); }
        }},
      ],
    );
  };

  const remove = (post: Post) => {
    showAlert('Delete post?', 'This will permanently delete the post and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteAdminPost(post.id);
          setPosts(prev => prev.filter(p => p.id !== post.id));
        } catch (e: any) {
          showAlert('Error', e.message);
        }
      }},
    ]);
  };

  const clearDates = () => { setFromDate(null); setToDate(null); };

  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';
  const inp  = isDark ? '#2A2242' : '#F4F0FF';

  const renderPost = ({ item: p }: { item: Post }) => (
    <View style={[s.card, { backgroundColor: card }]}>
      <View style={s.meta}>
        <View style={{ flex: 1 }}>
          <Text style={[s.author, { color: colors.textPrimary }]}>
            {p.author_name ?? 'Unknown'}{p.pet_name ? ` · ${p.pet_name}` : ''}
          </Text>
          <Text style={[s.date, { color: sub }]}>
            {new Date(p.created_at).toLocaleDateString()} · {p.likes_count} likes
            {p.is_flagged ? ' · 🚩 Flagged' : ''}
            {p.is_hidden ? ' · 🙈 Hidden' : ''}
            {p.moderated ? ' · ✅ Moderated' : ''}
          </Text>
        </View>
        {p.report_count > 0 && (
          <View style={s.reportBadge}>
            <Ionicons name="flag" size={11} color="#fff" />
            <Text style={s.reportBadgeText}>{p.report_count}</Text>
          </View>
        )}
      </View>

      {p.media_type === 'video' && p.video_url ? (
        <ModVideoPlayer uri={p.video_url} />
      ) : p.photo_url ? (
        <LazyImage uri={p.photo_url} style={s.postImg} />
      ) : null}
      {p.is_media_blocked && (
        <View style={[s.mediaBlocBadge, { backgroundColor: '#F59E0B22' }]}>
          <Ionicons name="eye-off-outline" size={13} color="#F59E0B" />
          <Text style={{ color: '#F59E0B', fontSize: TYPO.body, fontWeight: '700' }}>Media blocked from public</Text>
        </View>
      )}

      {p.caption ? (
        <Text style={[s.caption, { color: colors.textSecondary }]} numberOfLines={4}>
          {p.caption}
        </Text>
      ) : null}

      <View style={[s.actions, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={s.actionBtn} onPress={() => approve(p)}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
          <Text style={[s.actionText, { color: '#16A34A' }]}>Approve</Text>
        </TouchableOpacity>
        <View style={[s.divider, { backgroundColor: colors.border }]} />
        <TouchableOpacity style={s.actionBtn} onPress={() => toggleMediaBlock(p)}>
          <Ionicons name={p.is_media_blocked ? 'image-outline' : 'ban-outline'} size={18} color="#8B5CF6" />
          <Text style={[s.actionText, { color: '#8B5CF6' }]}>{p.is_media_blocked ? 'Unblock' : 'Block Media'}</Text>
        </TouchableOpacity>
        <View style={[s.divider, { backgroundColor: colors.border }]} />
        <TouchableOpacity style={s.actionBtn} onPress={() => hide(p)}>
          <Ionicons name="eye-off-outline" size={18} color="#F59E0B" />
          <Text style={[s.actionText, { color: '#F59E0B' }]}>Hide</Text>
        </TouchableOpacity>
        <View style={[s.divider, { backgroundColor: colors.border }]} />
        <TouchableOpacity style={s.actionBtn} onPress={() => remove(p)}>
          <Ionicons name="trash-outline" size={18} color="#E24B4A" />
          <Text style={[s.actionText, { color: '#E24B4A' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabText, { color: tab === t.key ? colors.primary : sub }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search bar */}
      <View style={[s.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.searchBox, { backgroundColor: inp }]}>
          <Ionicons name="search-outline" size={16} color={sub} />
          <TextInput
            style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder="Search by author or caption…"
            placeholderTextColor={sub}
            returnKeyType="search"
            clearButtonMode="while-editing"
            defaultValue=""
            onChangeText={v => { searchRef.current = v; }}
            onSubmitEditing={() => load(false, tab)}
          />
        </View>
      </View>

      {/* Date filter row */}
      <View style={[s.dateRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[s.datePill, { borderColor: fromDate ? colors.primary : colors.border, backgroundColor: fromDate ? colors.primary + '14' : 'transparent' }]}
          onPress={() => setShowFrom(true)}
        >
          <Ionicons name="calendar-outline" size={13} color={fromDate ? colors.primary : sub} />
          <Text style={[s.datePillText, { color: fromDate ? colors.primary : sub }]}>
            {fromDate ? `From ${fmtDate(fromDate)}` : 'From date'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.datePill, { borderColor: toDate ? colors.primary : colors.border, backgroundColor: toDate ? colors.primary + '14' : 'transparent' }]}
          onPress={() => setShowTo(true)}
        >
          <Ionicons name="calendar-outline" size={13} color={toDate ? colors.primary : sub} />
          <Text style={[s.datePillText, { color: toDate ? colors.primary : sub }]}>
            {toDate ? `To ${fmtDate(toDate)}` : 'To date'}
          </Text>
        </TouchableOpacity>
        {(fromDate || toDate) && (
          <TouchableOpacity onPress={clearDates} style={s.clearBtn}>
            <Ionicons name="close-circle" size={16} color={sub} />
          </TouchableOpacity>
        )}
        <Text style={[s.countBadge, { color: sub }]}>{posts.length} posts</Text>
      </View>

      {/* Date pickers */}
      <AppDateTimePicker
        visible={showFrom}
        value={fromDate ?? new Date()}
        mode="date"
        maximumDate={toDate ?? new Date()}
        accent={colors.primary}
        onCancel={() => setShowFrom(false)}
        onConfirm={(d) => { setFromDate(d); setShowFrom(false); }}
      />
      <AppDateTimePicker
        visible={showTo}
        value={toDate ?? new Date()}
        mode="date"
        minimumDate={fromDate ?? undefined}
        maximumDate={new Date()}
        accent={colors.primary}
        onCancel={() => setShowTo(false)}
        onConfirm={(d) => { setToDate(d); setShowTo(false); }}
      />

      {loading
        ? <View style={{ alignItems: 'center', paddingTop: 64 }}><PawBondLoader size={52} isDark={isDark} /></View>
        : (
          
            <FlashList
              ref={listRef}
              data={posts}
              keyExtractor={p => p.id}
              renderItem={renderPost}
              style={{ flex: 1 }}
              bounces={false}
              overScrollMode="never"
              contentContainerStyle={{ padding: 12, gap: 10 }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
              scrollEventThrottle={16}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => load(true, tab)}
                  tintColor="transparent"
                  colors={['transparent']}
                />
              }
              ListEmptyComponent={
                <View style={s.empty}>
                  <Text style={{ fontSize: TYPO.hero }}>{tab === 'flagged' ? '✅' : '📭'}</Text>
                  <Text style={[s.emptyText, { color: sub }]}>
                    {tab === 'reported' ? 'No posts with 50+ reports — all clear!' :
                     tab === 'flagged'  ? 'No flagged posts — all clear!' : 'No posts yet'}
                  </Text>
                </View>
              }
            />
          
        )
      }
      {showGoTop && (
        <TouchableOpacity
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tabs:         { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:       { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText:      { fontSize: TYPO.body, fontWeight: '700' },
  searchRow:    { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:  { flex: 1, fontSize: TYPO.body },
  dateRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  datePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  datePillText: { fontSize: TYPO.body, fontWeight: '600' },
  clearBtn:     { padding: 2 },
  countBadge:   { marginLeft: 'auto', fontSize: TYPO.body, fontWeight: '600' },
  pickerBg:     { borderRadius: 16, marginHorizontal: 12, marginTop: 4 },
  card:         { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  meta:         { flexDirection: 'row', alignItems: 'center', padding: 14 },
  author:       { fontSize: TYPO.body, fontWeight: '700' },
  date:         { fontSize: TYPO.body, marginTop: 2 },
  postImg:      { width: '100%', height: 200 },
  caption:      { padding: 14, fontSize: TYPO.body, lineHeight: 20 },
  actions:      { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  actionText:   { fontSize: TYPO.body, fontWeight: '700' },
  divider:      { width: StyleSheet.hairlineWidth, marginVertical: 8 },
  empty:            { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText:        { fontSize: TYPO.body },
  reportBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E24B4A', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  reportBadgeText:  { fontSize: TYPO.body, fontWeight: '800', color: '#fff' },
  mediaBlocBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginBottom: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
});
