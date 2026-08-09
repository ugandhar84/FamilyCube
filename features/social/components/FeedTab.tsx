import React, { useCallback, useMemo, useRef, useState } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { showAlert } from '@/components/AppAlert';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import PawBondLoader from '@/components/PawBondLoader';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { PostCard } from '@/features/social/components/PostCard';
import { fd } from '@/features/social/socialStyles';
import { SPECIES_CHIPS } from '@/features/social/types';

type FeedTabKey = 'for_you' | 'following' | 'pinned';

interface FeedTabProps {
  ac: string;
  colors: any;
  isDark: boolean;
  pet: any;
  profile: any;
  resolvedFeedPet: any;
  sortedPets: any[];
  storeUserId: string | null;
  loading: boolean;
  feedTab: FeedTabKey;
  feedSpecies: string;
  showSearch: boolean;
  searchQuery: string;
  feedSections: { posts: any[] }[];
  posts: any[];
  activePetId: string | null;
  freshFollowersCount: number | null;
  freshFollowingCount: number | null;
  pinnedPostIds: Set<string>;
  followedPetIds: Set<string>;
  reportedPostIds: Set<string>;
  videoMuted: boolean;
  perms: { canLike: boolean; canComment: boolean };
  tier: string;
  mainTab: string;
  feedQuery: { isLoading: boolean; isFetchingNextPage: boolean; hasNextPage: boolean };
  onFetchNextPage: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onSetFeedTab: (tab: FeedTabKey) => void;
  onSetFeedSpecies: (s: any) => void;
  onSetShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  onSetSearchQuery: (q: string) => void;
  onSetShowPetPicker: (v: boolean) => void;
  onSetShowCompose: (v: boolean) => void;
  onOpenFollowSheet: (mode: 'followers' | 'following') => void;
  onToggleLike: (postId: string) => void;
  onToggleComments: (postId: string) => void;
  onAddComment: (postId: string, body: string) => Promise<void>;
  onAfterComment?: () => void;
  onToggleFollow: (petId: string, currently: boolean) => void;
  onSetMenuPost: (post: any) => void;
  onHandleReport: (post: any) => void;
  onSetVideoMuted: (fn: (m: boolean) => boolean) => void;
  onTogglePin: (postId: string) => void;
  scrollToTopRef?: React.MutableRefObject<(() => void) | null>;
}

export const FeedTab = React.memo(function FeedTab({
  ac, colors, isDark, pet, profile, resolvedFeedPet, sortedPets, storeUserId,
  loading, feedTab, feedSpecies, showSearch, searchQuery, feedSections, posts,
  activePetId, freshFollowersCount, freshFollowingCount, pinnedPostIds,
  followedPetIds, reportedPostIds, videoMuted, perms, tier, mainTab, feedQuery,
  onSetFeedTab, onSetFeedSpecies, onSetShowSearch, onSetSearchQuery,
  onSetShowPetPicker, onSetShowCompose, onOpenFollowSheet,
  onToggleLike, onToggleComments, onAddComment, onAfterComment, onToggleFollow,
  onSetMenuPost, onHandleReport, onSetVideoMuted, onTogglePin, onFetchNextPage, scrollToTopRef,
  onRefresh, refreshing,
}: FeedTabProps) {
  const toggleMute = useCallback(() => onSetVideoMuted(m => !m), [onSetVideoMuted]);
  const listRef = useRef<FlashListRef<any>>(null);
  const [showGoTop, setShowGoTop] = useState(false);

  // Expose imperative scroll-to-top so SocialScreen can call it after a new post
  React.useEffect(() => {
    if (scrollToTopRef) {
      scrollToTopRef.current = () => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
        setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), 350);
      };
    }
  }, [scrollToTopRef]);

  const allPosts = useMemo(() => feedSections.flatMap(s => s.posts), [feedSections]);

  const ListHeader = useMemo(() => (
    <>
      {pet && (
        <View style={[fd.statBar, { backgroundColor: colors.background, borderBottomColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <TouchableOpacity style={fd.statItem} activeOpacity={0.7} onPress={() => onOpenFollowSheet('followers')}>
            <Text style={[fd.statNum, { color: colors.textPrimary }]}>{freshFollowersCount ?? '—'}</Text>
            <Text style={[fd.statLabel, { color: colors.textSecondary }]}>Followers</Text>
          </TouchableOpacity>
          <View style={[fd.statDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={fd.statItem} activeOpacity={0.7} onPress={() => onOpenFollowSheet('following')}>
            <Text style={[fd.statNum, { color: colors.textPrimary }]}>{freshFollowingCount ?? '—'}</Text>
            <Text style={[fd.statLabel, { color: colors.textSecondary }]}>Following</Text>
          </TouchableOpacity>
          <View style={[fd.statDivider, { backgroundColor: colors.border }]} />
          <View style={fd.statItem}>
            <Text style={[fd.statNum, { color: colors.textPrimary }]}>{posts.filter(p => p.pet_id === activePetId).length}</Text>
            <Text style={[fd.statLabel, { color: colors.textSecondary }]}>In Feed</Text>
          </View>
        </View>
      )}

      <View style={[fd.feedTabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
          {([
            { key: 'for_you'  , label: 'For You'  , badge: null as number | null },
            { key: 'following', label: 'Following', badge: null as number | null },
            { key: 'pinned'   , label: 'Pinned'   , badge: pinnedPostIds.size > 0 ? pinnedPostIds.size : null },
          ] as { key: FeedTabKey; label: string; badge: number | null }[]).map(({ key: tab, label, badge }) => {
            const active = feedTab === tab;
            const searchActive = showSearch && active;
            return (
              <TouchableOpacity key={tab} style={fd.feedTabBtn} activeOpacity={0.75}
                onPress={() => { onSetFeedTab(tab); if (showSearch) { onSetShowSearch(() => false); onSetSearchQuery(''); } }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Text style={[fd.feedTabTxt, { color: active ? ac : colors.textTertiary, fontWeight: active ? '800' : '500' }]}>
                    {label}
                  </Text>
                  {badge !== null && (
                    <View style={[fd.feedTabBadge, { backgroundColor: active ? ac : colors.inputBg }]}>
                      <Text style={[fd.feedTabBadgeTxt, { color: active ? '#fff' : colors.textTertiary }]}>{badge}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      if (!active) onSetFeedTab(tab);
                      onSetShowSearch(s => { const next = !s; if (!next) onSetSearchQuery(''); return next; });
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} activeOpacity={0.6}>
                    <Ionicons name={searchActive ? 'close-circle' : 'search'} size={14}
                      color={searchActive ? ac : colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                {active && <View style={[fd.feedTabUnderline, { backgroundColor: ac }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {!showSearch && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}
          style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexShrink: 0 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 7, gap: 6, flexDirection: 'row', alignItems: 'center' }}>
          {SPECIES_CHIPS.map(({ key, label, emoji }) => {
            const active = feedSpecies === key;
            return (
              <TouchableOpacity key={key} onPress={() => onSetFeedSpecies(key)} activeOpacity={0.75}
                style={[fd.chip, { backgroundColor: active ? ac : colors.inputBg, borderColor: active ? ac : colors.border }]}>
                <Text style={{ fontSize: TYPO.body }}>{emoji}</Text>
                <Text style={[fd.chipText, { color: active ? '#fff' : colors.textSecondary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {showSearch && (
        <View style={[fd.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={[fd.searchInput, { color: colors.textPrimary }]}
            placeholder="Search posts, pets, breeds…"
            placeholderTextColor={colors.placeholder}
            value={searchQuery} onChangeText={onSetSearchQuery}
            autoFocus returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()} blurOnSubmit />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSetSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {searchQuery.length > 0 && (
        <Text style={[fd.resultCount, { color: colors.textSecondary }]}>
          {feedSections[0]?.posts.length ?? 0} result{(feedSections[0]?.posts.length ?? 0) !== 1 ? 's' : ''}
        </Text>
      )}

      {!showSearch && (
        <View style={[fd.createBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity onPress={() => sortedPets.length > 1 && onSetShowPetPicker(true)} activeOpacity={0.75}
            style={{ position: 'relative' }}>
            <EmojiAvatar emoji={resolvedFeedPet?.emoji ?? '🐾'} name={resolvedFeedPet?.name ?? profile?.full_name ?? 'You'} size={38} color={ac} avatarUrl={resolvedFeedPet?.avatar_url} />
            {sortedPets.length > 1 && (
              <View style={[fd.petPickerBadge, { backgroundColor: ac }]}>
                <Ionicons name="chevron-down" size={8} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85}
            onPress={() => {
              if (sortedPets.length === 0) {
                showAlert('Add a pet first', 'You need to register a pet before you can post.', [
                  { text: 'Not now', style: 'cancel' },
                  { text: 'Add pet', onPress: () => router.push('/onboarding/add-pet') },
                ]);
                return;
              }
              onSetShowCompose(true);
            }}>
            <View style={[fd.createPill, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Text style={{ color: colors.placeholder, fontSize: TYPO.body }}>
                {sortedPets.length === 0 ? 'Add a pet to start posting 🐾' : `What's ${resolvedFeedPet?.name ?? 'your baby'} up to? 🐾`}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85}
            onPress={() => {
              if (sortedPets.length === 0) {
                router.push('/onboarding/add-pet');
                return;
              }
              onSetShowCompose(true);
            }}>
            <View style={[fd.photoIcon, { backgroundColor: `${ac}18` }]}>
              <Ionicons name="camera-outline" size={18} color={ac} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {loading && (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
          <PawBondLoader size={52} />
        </View>
      )}
    </>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [
    pet, colors, ac, isDark, posts, activePetId, freshFollowersCount, freshFollowingCount,
    pinnedPostIds, feedTab, showSearch, searchQuery, feedSections, feedSpecies,
    resolvedFeedPet, sortedPets, profile,
    onOpenFollowSheet, onSetFeedTab, onSetShowSearch, onSetSearchQuery,
    onSetFeedSpecies, onSetShowPetPicker, onSetShowCompose, loading,
  ]);

  const ListEmpty = useMemo(() => {
    if (loading) return null;
    const isSearch = searchQuery.trim().length > 0;
    if (isSearch) {
      return (
        <View style={fd.empty}>
          <Text style={{ fontSize: 44 }}>🔍</Text>
          <Text style={[fd.emptyTitle, { color: colors.textPrimary }]}>No results</Text>
          <Text style={[fd.emptySub, { color: colors.textSecondary }]}>Nothing matches "{searchQuery.trim()}"</Text>
          <TouchableOpacity style={[fd.emptyBtn, { backgroundColor: ac }]} onPress={() => onSetSearchQuery('')}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Clear</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (feedTab === 'pinned') return (
      <View style={fd.empty}>
        <Text style={{ fontSize: 44 }}>📌</Text>
        <Text style={[fd.emptyTitle, { color: colors.textPrimary }]}>No pinned posts yet</Text>
        <Text style={[fd.emptySub, { color: colors.textSecondary }]}>Long-press any post and tap "Pin post" to save it here</Text>
        <TouchableOpacity style={[fd.emptyBtn, { backgroundColor: ac }]} onPress={() => onSetFeedTab('for_you')}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Browse For You</Text>
        </TouchableOpacity>
      </View>
    );
    if (feedTab === 'following') return (
      <View style={fd.empty}>
        <Text style={{ fontSize: 44 }}>🐾</Text>
        <Text style={[fd.emptyTitle, { color: colors.textPrimary }]}>
          {followedPetIds.size === 0 ? 'Not following anyone yet' : 'No posts from who you follow'}
        </Text>
        <Text style={[fd.emptySub, { color: colors.textSecondary }]}>
          {followedPetIds.size === 0
            ? 'Head to For You and tap + Follow on pets you like'
            : "The pets you follow haven't posted yet — check back soon"}
        </Text>
        <TouchableOpacity style={[fd.emptyBtn, { backgroundColor: ac }]} onPress={() => onSetFeedTab('for_you')}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Browse For You</Text>
        </TouchableOpacity>
      </View>
    );
    return (
      <View style={fd.empty}>
        <Text style={{ fontSize: 44 }}>🐾</Text>
        <Text style={[fd.emptyTitle, { color: colors.textPrimary }]}>Nothing here yet</Text>
        <Text style={[fd.emptySub, { color: colors.textSecondary }]}>
          {`Be the first to share from ${pet?.name ?? 'your pet'}'s day`}
        </Text>
        <TouchableOpacity style={[fd.emptyBtn, { backgroundColor: ac }]} onPress={() => onSetShowCompose(true)}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Create a post</Text>
        </TouchableOpacity>
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchQuery, feedTab, followedPetIds, pet, colors, ac, onSetSearchQuery, onSetFeedTab, onSetShowCompose]);

  const ListFooter = useMemo(() => {
    if (feedQuery.isLoading || mainTab !== 'Feed' || showSearch) return null;
    const currentTabPostCount = allPosts.length;
    return (
      <View style={{ alignItems: 'center', paddingVertical: 28, gap: 6 }}>
        {feedQuery.isFetchingNextPage ? (
          <PawBondLoader size={36} bars={false} isDark={isDark} />
        ) : currentTabPostCount > 0 && !feedQuery.hasNextPage ? (
          <>
            <Text style={{ fontSize: TYPO.hero }}>🐾</Text>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>You're all caught up!</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
              No more posts right now — check back later for fresh moments from your pet community.
            </Text>
          </>
        ) : null}
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedQuery.isLoading, feedQuery.isFetchingNextPage, feedQuery.hasNextPage, mainTab, showSearch, allPosts.length, isDark, colors]);

  const renderItem = useCallback(({ item: post, index }: { item: any; index: number }) => (
    <PostCard post={post} myUserId={storeUserId} myPet={resolvedFeedPet ?? pet} myProfile={profile}
      followedPetIds={followedPetIds} onLike={onToggleLike}
      onToggleComments={onToggleComments} onAddComment={onAddComment} onAfterComment={onAfterComment}
      onFollow={onToggleFollow} onOpenMenu={onSetMenuPost} onReport={onHandleReport}
      reportedPostIds={reportedPostIds} globalMuted={videoMuted}
      onToggleMute={toggleMute} colors={colors}
      searchQuery={showSearch ? searchQuery : undefined}
      canLike={perms.canLike} canComment={perms.canComment}
      viewerTier={tier} pinnedPostIds={pinnedPostIds} onTogglePin={onTogglePin}
 />
  ), [
    storeUserId, pet, resolvedFeedPet, profile, followedPetIds, onToggleLike, onToggleComments, onAddComment, onAfterComment,
    onToggleFollow, onSetMenuPost, onHandleReport, reportedPostIds, videoMuted, toggleMute,
    colors, showSearch, searchQuery, perms, tier, pinnedPostIds, onTogglePin,
  ]);

  const ItemSeparator = React.memo(() => (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
  ));

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        ref={listRef}
        data={loading ? ([] as typeof allPosts) : allPosts}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
        {...{ estimatedItemSize: 420 } as any}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        onEndReached={onFetchNextPage}
        onEndReachedThreshold={0.4}
        onRefresh={onRefresh}
        refreshing={refreshing ?? false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        contentContainerStyle={{ paddingTop: 6 }}
        onScroll={e => {
          const y = e.nativeEvent.contentOffset.y;
          setShowGoTop(y > 400);
        }}
        scrollEventThrottle={100}
      />
      {/* FAB: compose (at top) or scroll-to-top (when scrolled) */}
      <TouchableOpacity
        onPress={() => {
          if (showGoTop) {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          } else if (sortedPets.length === 0) {
            showAlert('Add a pet first', 'You need to register a pet before you can post.', [
              { text: 'Not now', style: 'cancel' },
              { text: 'Add pet', onPress: () => router.push('/onboarding/add-pet') },
            ]);
          } else {
            onSetShowCompose(true);
          }
        }}
        activeOpacity={0.85}
        style={{
          position: 'absolute', bottom: 20, right: 16,
          height: 52, borderRadius: 26,
          paddingHorizontal: 0,
          width: 52,
          backgroundColor: ac,
          flexDirection: 'row',
          alignItems: 'center', justifyContent: 'center',
          gap: 6,
          shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}>
        <Ionicons name={showGoTop ? 'chevron-up' : 'add'} size={showGoTop ? 20 : 26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
});
