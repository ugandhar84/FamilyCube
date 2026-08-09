import { showAlert } from '@/components/AppAlert';
import { showPickerOverlay, usePickerOverlayStore } from '@/store/pickerOverlayStore';
/**
 * PawBond — Community / Social
 *
 * Tabs: Feed · Nearby · Family
 * Data loading extracted into domain hooks (useSocialFeedData, useSocialNearby,
 * useSocialPlaydates, useSocialFamily, useSocialEvents, useSocialRealtime).
 * This file is the orchestrator: it wires hooks together, owns post-interaction
 * actions (like/comment/create), and delegates rendering to tab components.
 */

import React, { useState, useEffect, useCallback, useDeferredValue, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useForYouFeed } from '@/lib/hooks/useFeed';
import FeedSkeleton from '@/components/FeedSkeleton';
import { getPetProfile } from '@/lib/db/petProfile';
import { petProfileKeys } from '@/lib/hooks/usePetProfile';
import {
  View, Text, ScrollView, TouchableOpacity, TouchableWithoutFeedback, StyleSheet,
  TextInput, Modal, ActivityIndicator, Image, Pressable,
  KeyboardAvoidingView, Platform, ActionSheetIOS, RefreshControl, Animated,
  Alert, Linking, Dimensions, Keyboard, Share, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@/components/BottomSheet';
import ActionSheet from '@/components/ActionSheet';
import { Ionicons } from '@expo/vector-icons';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { LinearGradient } from 'expo-linear-gradient';
import LazyImage from '@/components/LazyImage';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { registerVideo, unregisterVideo, checkVideoVisibility, pauseAllVideos } from '@/lib/videoVisibility';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { useFeatureFlag as useGamificationFlag } from '@/lib/featureFlags';
import { FeatureUnavailable } from '@/components/FeatureGate';
import { awardCoins, fetchDailyProgress } from '@/lib/db/rewards';
import CoinFlowOverlay from '@/components/CoinFlowOverlay';
import { saveMediaToDevice } from '@/lib/saveMedia';
import * as Calendar from 'expo-calendar';
import { formatDistanceToNow, parseISO, format, isBefore } from 'date-fns';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase, uploadSocialPhoto, uploadSocialVideo } from '@/lib/supabase';
import {
  getPlaydateChats, getIncomingRequests, markChatRead as dbMarkChatRead,
  insertNotification, upsertNotification, deleteNotificationByDedup,
  deletePost as dbDeletePost, sendPlaydateRequest, withdrawPlaydateRequest,
  deleteEventRsvp, deleteEventRsvpByUser, insertEventRsvp, insertCommunityEvent,
  removeFamilyMember, updateMemberRole, revokeInvite, markAllNotificationsRead,
} from '@/lib/db';
import { followPet, unfollowPet } from '@/lib/db/follows';
import { getLocationAPI, isLocationAvailable } from '@/lib/location';
import { usePetStore } from '@/store/petStore';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import { usePaywall } from '@/lib/hooks/usePaywall';
import { LIMITS } from '@/lib/subscription';
import TeaserGate from '@/components/TeaserGate';
import { todayLocal, parseDbTime } from '@/lib/dates';
import { SPACING, RADIUS, TYPO} from '@/constants/theme';
import { formatDist, usesImperial, formatTime } from '@/lib/units';
import { containsProfanity, censorText } from '@/lib/profanityFilter';
import { recipientAllowsNotif } from '@/lib/notifications';
import { toTitle } from '@/lib/format';
import PawBondLoader from '@/components/PawBondLoader';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import SubscriptionBadge from '@/components/SubscriptionBadge';

// Extracted feature imports
import { useShallow } from 'zustand/react/shallow';
import {
  Post, PostComment, FamilyMember, NearbyPet, IncomingRequest, CommunityEvent,
  GenderFilter, MainTab, SpeciesFilter,
  DISTANCE_OPTS_METRIC, DISTANCE_OPTS_IMPERIAL, KM_PER_MILE, KG_PER_LB,
  SPECIES_CHIPS, CANCEL_REASONS, MAX_VIDEO_BYTES,
} from '@/features/social/types';
import {
  getMentionQuery, insertMention, extractHandles, relTime, editedTime,
  initials, haversineKm, petAgeLabel, getEventTypes, getStatusCfg,
  pickCancelReason, usStateAbbr,
} from '@/features/social/utils';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { MentionText, MentionDropdown } from '@/features/social/components/MentionComponents';
import { StoriesStrip } from '@/features/social/components/StoriesStrip';
import { CommentsSection } from '@/features/social/components/CommentsSection';
import { AutoplayVideo, MediaViewer, PhotoGrid } from '@/features/social/components/MediaComponents';
import { PostCard, LocalSaveBtn, pc } from '@/features/social/components/PostCard';
import { NearbyPetCard, nc, rt, CAROUSEL_CARD_W, CAROUSEL_PHOTO_H } from '@/features/social/components/NearbyPetCard';
import { EventCard, ev } from '@/features/social/components/EventCard';
import { EditPostSheet, prepareVideoForUpload, showVideoSourceMenu } from '@/features/social/components/EditPostSheet';
import { ComposeSheet } from '@/features/social/components/ComposeSheet';
import { cps, sc, fd, nb, fm, ep, md, pd } from '@/features/social/socialStyles';
import { FamilyTab } from '@/features/social/components/FamilyTab';
import { PlaydatesTab } from '@/features/social/components/PlaydatesTab';
import { FeedTab } from '@/features/social/components/FeedTab';
import { NearbyTab } from '@/features/social/components/NearbyTab';
import { IncomingRequestSheet } from '@/features/social/components/IncomingRequestSheet';
import { OutgoingPlaydateSheet } from '@/features/social/components/OutgoingPlaydateSheet';
import { ProposalSheet } from '@/features/social/components/ProposalSheet';
import { CounterProposeSheet } from '@/features/social/components/CounterProposeSheet';

// Domain hooks
import { useSocialFeedData } from '@/features/social/hooks/useSocialFeedData';
import { useSocialNearby } from '@/features/social/hooks/useSocialNearby';
import { useSocialPlaydates } from '@/features/social/hooks/useSocialPlaydates';
import { useSocialFamily } from '@/features/social/hooks/useSocialFamily';
import { useSocialEvents } from '@/features/social/hooks/useSocialEvents';
import { useSocialRealtime } from '@/features/social/hooks/useSocialRealtime';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

const SOCIAL_NOTIF_TYPES = ['playdate_request', 'playdate_accepted', 'playdate_proposal', 'playdate_counter_proposal', 'chat_message', 'post_like', 'post_comment', 'post_comment_reply', 'follow', 'mention', 'family_update', 'new_post'];

export default function SocialScreen({ hideHeader = false, forceTab, initialPostId, openComments: openCommentsProp }: {
  hideHeader?: boolean;
  forceTab?: MainTab;
  initialPostId?: string | null;
  openComments?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const EVENT_TYPES = getEventTypes(colors);
  const eventsEnabled = useFeatureFlag('events_enabled', true);
  const feedEnabled = useFeatureFlag('connect_feed_enabled', true);
  const playdatesChatEnabled = useFeatureFlag('connect_playdates_chat_enabled', false);
  const gamificationEnabled = useGamificationFlag('gamification');
  const insets = useSafeAreaInsets();
  const { activePetId, activePet, pets, setActivePet, petRoles } = usePetStore(
    useShallow(s => ({ activePetId: s.activePetId, activePet: s.activePet, pets: s.pets, setActivePet: s.setActivePet, petRoles: s.petRoles }))
  );
  const perms = getPermissions(activePetId ? (petRoles[activePetId] ?? 'owner') : 'owner');
  const { profile } = useAuthStore();
  const { gate: paywallGate, tier } = usePaywall();
  const pet = activePet();
  const [feedPet, setFeedPet] = useState<typeof pet>(null);
  const resolvedFeedPet = feedPet ?? pet;
  const ac  = resolvedFeedPet?.accent_color ?? pet?.accent_color ?? colors.primary;
  const ownerFirst = profile?.handle ? `@${profile.handle}` : profile?.full_name?.split(' ')[0]?.trim();
  const qc  = useQueryClient();
  const petRef = useRef(pet);
  useEffect(() => { petRef.current = pet; }, [pet]);

  const prefetchPetProfile = useCallback((petId: string) => {
    qc.prefetchQuery({
      queryKey: petProfileKeys.profile(petId),
      queryFn:  () => getPetProfile(petId),
      staleTime: 5 * 60_000,
    });
  }, [qc]);

  const params = useLocalSearchParams<{ tab?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const feedScrollToTopRef = useRef<(() => void) | null>(null);
  const rtId = useRef(Math.random().toString(36).slice(2)).current;

  // ── UI state ──────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>(forceTab ?? 'Feed');
  const [feedTab, setFeedTab] = useState<'for_you' | 'following' | 'pinned'>('for_you');
  const [userId, setUserId]   = useState<string | null>(null);
  const [socialUnreadCount, setSocialUnreadCount] = useState(0);
  const [showGoTop, setShowGoTop] = useState(false);

  // Feed state
  const feedQuery = useForYouFeed();
  const [posts, setPosts] = useState<Post[]>([]);
  const postsSeeded = useRef(false);
  const lastFeedPet = useRef<string | null>(null);
  const loading    = !postsSeeded.current && (feedQuery.isPending || feedQuery.isFetching);
  const refreshing = feedQuery.isRefetching && postsSeeded.current;
  const [videoMuted, setVideoMuted] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch]   = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [showCompose, setShowCompose] = useState(false);
  const [coinFlow, setCoinFlow] = useState<{
    visible: boolean; amount: number; action: string;
    quotaLeft: number; quotaMax: number; petBalance: number;
  }>({ visible: false, amount: 0, action: '', quotaLeft: 100, quotaMax: 100, petBalance: 0 });

  const showCoinFlow = useCallback(async (amount: number, action: string) => {
    if (!userId || amount <= 0) return;
    const progress = await fetchDailyProgress(userId).catch(() => ({ earned: 0, cap: 100, remaining: 100 }));
    const quotaLeft = Math.max(0, progress.remaining);
    if (quotaLeft <= 0) return; // nothing left today — skip animation
    const { data: profileData } = await supabase.from('profiles').select('coins').eq('id', userId).maybeSingle();
    setCoinFlow({
      visible: true,
      amount: Math.min(amount, quotaLeft),
      action,
      quotaLeft,
      quotaMax: progress.cap,
      petBalance: profileData?.coins ?? 0,
    });
  }, [userId]);
  const [showPetPicker, setShowPetPicker] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [menuPost, setMenuPost] = useState<Post | null>(null);
  const [reportPost, setReportPost] = useState<Post | null>(null);
  const [reportedPostIds, setReportedPostIds] = useState<Set<string>>(new Set());

  const [cpVisible, setCpVisible]     = useState(false);
  const [cpRequestId, setCpRequestId] = useState<string | null>(null);
  const [proposalTarget, setProposalTarget]  = useState<NearbyPet | null>(null);
  const [proposalVisible, setProposalVisible] = useState(false);
  const [selectedNearbyPet, setSelectedNearbyPet] = useState<NearbyPet | null>(null);
  const [followSheetMode, setFollowSheetMode] = useState<'followers' | 'following' | null>(null);
  const [followList, setFollowList] = useState<any[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [followPetFilter, setFollowPetFilter] = useState<string>('all');
  const [followSearchQuery, setFollowSearchQuery] = useState('');
  const [showFollowPicker, setShowFollowPicker] = useState(false);
  const [pendingFollowTarget, setPendingFollowTarget] = useState<{ petId: string; ownerUserId: string; targetName: string } | null>(null);
  const [followPickerMode, setFollowPickerMode] = useState<'follow' | 'unfollow'>('follow');
  // Subset of pets to show in the picker (for unfollow: only pets that follow the target)
  const [pendingFollowPets, setPendingFollowPets] = useState<typeof pets | null>(null);

  // Domain hooks — each owns its own state + async functions
  const storeUserId = useAuthStore(state => state.user?.id);

  const feedData = useSocialFeedData(userId, activePetId);

  const nearby = useSocialNearby(
    userId, activePetId, (pet as any)?.species, prefetchPetProfile,
  );

  const playdates = useSocialPlaydates(userId, activePetId, playdatesChatEnabled);

  const family = useSocialFamily(activePetId, pet?.name);

  const events = useSocialEvents(userId, activePetId);

  // Realtime subscriptions (side-effect only)
  useSocialRealtime({
    activePetId, userId, rtId,
    setPosts, setSocialUnreadCount,
    loadIncomingRequests: playdates.loadIncomingRequests,
    loadPlaydateChats: playdates.loadPlaydateChats,
  });

  // ── Init effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    const uid = storeUserId ?? null;
    setUserId(uid);
    if (uid) {
      feedData.loadFollows(uid, activePetId ?? undefined);
      feedData.loadPins(uid);
      // Load already-reported posts so the flag shows filled and unreport dialog triggers correctly
      supabase.from('post_reports').select('post_id').eq('reporter_id', uid)
        .then(({ data }) => {
          if (data?.length) setReportedPostIds(new Set(data.map((r: any) => r.post_id)));
        });
    }
  }, [storeUserId]);

  useEffect(() => { if (forceTab) setMainTab(forceTab); }, [forceTab]);
  useEffect(() => { if (params.tab === 'Nearby') setMainTab('Nearby'); }, [params.tab]);

  useEffect(() => {
    if (!activePetId) return;
    let mounted = true;
    family.loadFamily();
    events.loadEvents();
    feedData.setFreshFollowersCount(null);
    feedData.setFreshFollowingCount(null);
    if (activePetId) {
      supabase.from('pet_follows').select('id', { count: 'exact', head: true })
        .eq('following_pet_id', activePetId)
        .then(({ count }) => { if (mounted && count !== null) feedData.setFreshFollowersCount(count); });
      supabase.from('pet_follows').select('id', { count: 'exact', head: true })
        .eq('follower_pet_id', activePetId)
        .then(({ count }) => { if (mounted && count !== null) feedData.setFreshFollowingCount(count); });
    }
    playdates.setRequestedPets(new Map());
    playdates.setPlaydateStatuses(new Map());
    nearby.setDistanceFilter(nearby.distanceOpts[1].km);
    if (userId) { playdates.loadIncomingRequests(); playdates.loadPlaydateChats(); }
    return () => { mounted = false; };
  }, [activePetId]);

  // Re-fetch events when userId becomes available so user_rsvpd reflects actual RSVP state
  useEffect(() => {
    if (userId) events.loadEvents();
  }, [userId]);

  useEffect(() => {
    if (mainTab === 'Nearby') {
      nearby.initLocation();
      if (userId) { playdates.loadIncomingRequests(); playdates.loadPlaydateChats(); }
    }
    scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [mainTab, userId]);

  useEffect(() => {
    if (nearby.userLocation && activePetId && userId) nearby.loadNearbyPets();
  }, [nearby.userLocation, nearby.distanceFilter, nearby.nearbySpecies, nearby.genderFilter, activePetId, userId]);

  // Reset seeded flag when active pet changes
  useEffect(() => {
    if (activePetId && activePetId !== lastFeedPet.current) {
      lastFeedPet.current = activePetId;
      postsSeeded.current = false;
    }
  }, [activePetId]);

  // Reset scroll on pet switch
  const lastScrollPetSocial = useRef<string | null>(null);
  useEffect(() => {
    if (activePetId && activePetId !== lastScrollPetSocial.current) {
      lastScrollPetSocial.current = activePetId;
      scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      setShowGoTop(false);
    }
  }, [activePetId]);

  useEffect(() => { setFeedPet(null); }, [activePetId]);

  // Seed local posts from React Query pages (preserves UI state: liked, comments)
  const lastFeedIdsRef = useRef<string>('');
  useEffect(() => {
    const pages = feedQuery.data?.pages;
    if (!pages) return;
    const serverPosts = pages.flatMap((p: any) => p.posts);
    const newIds = serverPosts.map((p: any) => p.id).join(',');
    if (newIds === lastFeedIdsRef.current) {
      setPosts(prev => prev.map(existing => {
        const fresh = serverPosts.find((s: any) => s.id === existing.id);
        if (!fresh) return existing;
        return { ...existing, ...fresh, liked: existing.liked, showComments: existing.showComments, comments: existing.comments, commentsLoaded: existing.commentsLoaded };
      }));
      return;
    }
    lastFeedIdsRef.current = newIds;
    postsSeeded.current = true;
    setPosts(prev => {
      const prevMap = new Map(prev.map(p => [p.id, p]));
      const serverIds = new Set(serverPosts.map((p: any) => p.id));
      // Preserve posts created in the last 2 min that the server page hasn't returned yet
      // (own new posts added optimistically may not be in the current page window)
      const recentOwn = prev.filter(p =>
        !p.id.startsWith('local_') &&
        !serverIds.has(p.id) &&
        Date.now() - new Date(p.created_at).getTime() < 120_000
      );
      return [
        ...recentOwn,
        ...serverPosts.map((p: any) => ({
          ...p,
          liked:          prevMap.get(p.id)?.liked          ?? false,
          showComments:   prevMap.get(p.id)?.showComments   ?? false,
          comments:       prevMap.get(p.id)?.comments       ?? [],
          commentsLoaded: prevMap.get(p.id)?.commentsLoaded ?? false,
        })),
      ];
    });
  }, [feedQuery.data]);

  // Patch is_media_blocked on focus
  useFocusEffect(useCallback(() => {
    setPosts(current => {
      if (current.length === 0) return current;
      const ids = current.map(p => p.id);
      Promise.resolve(supabase.from('social_posts').select('id, is_media_blocked').in('id', ids))
        .then(({ data }) => {
          if (!data) return;
          const existingIds = new Set(data.map((r: any) => r.id));
          const map: Record<string, boolean> = {};
          data.forEach((r: any) => { map[r.id] = r.is_media_blocked ?? false; });
          setPosts(prev => prev
            .filter(p => existingIds.has(p.id)) // remove deleted posts
            .map(p =>
              map[p.id] !== undefined && map[p.id] !== p.is_media_blocked
                ? { ...p, is_media_blocked: map[p.id] }
                : p
            )
          );
        }).catch(() => {});
      return current;
    });
  }, []));

  useFocusEffect(useCallback(() => {
    const uid = storeUserId ?? null;
    if (!uid || !activePetId) return;
    feedData.loadFollows(uid);
    feedData.loadPins(uid);
    feedData.loadFollowerCount(uid);
    playdates.loadPlaydateChats();
    if (mainTab === 'Nearby') {
      playdates.loadIncomingRequests();
      nearby.loadNearbyPets();
    }
    Promise.resolve(supabase.from('notification_logs').select('id', { count: 'exact', head: true })
      .eq('user_id', uid).eq('read', false).in('type', SOCIAL_NOTIF_TYPES))
      .then(({ count }) => setSocialUnreadCount(count ?? 0)).catch(() => {});
  }, [storeUserId, mainTab, activePetId]));

  // Deep-link to a specific post
  const toggleCommentsRef = useRef<(id: string) => void>(() => {});
  const likingRef = useRef<Set<string>>(new Set()); // tracks in-flight like requests per post
  useEffect(() => {
    if (!initialPostId) return;
    setMainTab('Feed');
    (async () => {
      const { data } = await supabase
        .from('social_posts')
        .select(`id, pet_id, author_id, caption, overlay_caption, photo_url, photo_urls, media_type, video_url, video_thumbnail_url,
          is_public, likes_count, comments_count, created_at, updated_at, is_edited, edited_at,
          caption_overlay, fit_frame,
          pets ( id, name, emoji, accent_color, species, breed, avatar_url, followers_count, owner_id ),
          author:profiles ( full_name, handle )`)
        .eq('id', initialPostId).maybeSingle();
      if (!data) { showAlert('Post unavailable', 'This post has been deleted or is no longer available.'); return; }
      const { data: sub } = (data as any).pets?.owner_id
        ? await supabase.from('subscriptions').select('tier').eq('user_id', (data as any).pets.owner_id).maybeSingle()
        : { data: null };
      const fetchedPost: Post = {
        ...(data as any), pet: (data as any).pets, author: (data as any).author,
        owner_tier: (sub as any)?.tier ?? 'free', liked: false, showComments: false, comments: [], commentsLoaded: false,
      };
      setPosts(prev => { const filtered = prev.filter(p => p.id !== initialPostId); return [fetchedPost, ...filtered]; });
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        if (openCommentsProp) setTimeout(() => toggleCommentsRef.current(initialPostId!), 250);
      }, 120);
    })();
  }, [initialPostId, openCommentsProp]);

  // ── Feed actions ──────────────────────────────────────────────────────────

  const loadFeed = useCallback(async (pull = false) => {
    if (pull) await feedQuery.refetch();
    else if (!feedQuery.data) await feedQuery.refetch();
  }, [feedQuery]);

  const loadMorePosts = useCallback(() => {
    if (!feedQuery.hasNextPage || feedQuery.isFetchingNextPage) return;
    feedQuery.fetchNextPage();
  }, [feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

  const toggleLike = useCallback((postId: string) => {
    if (!userId) { showAlert('Sign in required', 'Please sign in to like posts.'); return; }
    if (!perms.canLike) return;
    if (likingRef.current.has(postId)) return; // already in-flight — drop rapid tap
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (post.author_id === userId) return;
    likingRef.current.add(postId);
    const liked = !post.liked;
    setPosts(prev => prev.map(p =>
      p.id !== postId ? p : { ...p, liked, likes_count: Math.max(0, p.likes_count + (liked ? 1 : -1)) }
    ));
    if (postId.startsWith('m') || postId.startsWith('local')) {
      likingRef.current.delete(postId);
      return;
    }
    const curPet = petRef.current;
    const dedupKey = `like:${postId}:${userId}`;
    const authorId = post.author_id;
    Promise.resolve(supabase.rpc('increment_post_likes', { p_post_id: postId, p_delta: liked ? 1 : -1 }))
      .then(() => {
        if (liked && gamificationEnabled && userId) {
          awardCoins(userId, 'post_liked', postId).then(result => {
            if (result.ok && result.coins_awarded && result.coins_awarded > 0) {
              showCoinFlow(result.coins_awarded, 'for the love! ❤️');
            }
          });
        }
      })
      .finally(() => { likingRef.current.delete(postId); });
    if (!authorId) return;
    if (liked) {
      if (curPet?.name && authorId !== userId) {
        const likeTitle = ownerFirst ? `${curPet.emoji ?? '🐾'} ${curPet.name} (${ownerFirst}) liked your post` : `${curPet.emoji ?? '🐾'} ${curPet.name} liked your post`;
        const likeBody  = post.caption ? post.caption.slice(0, 80) : 'Tap to see the post';
        supabase.functions.invoke('playdates', {
          body: { action: 'notify', user_id: authorId, title: likeTitle, body: likeBody,
            type: 'post_like', dedup_key: dedupKey,
            data: { type: 'post_like', post_id: postId, actor_user_id: userId, actor_pet_id: activePetId, actor_name: curPet.name, actor_emoji: curPet.emoji, actor_owner_handle: profile?.handle ?? null },
          },
        }).catch(() => {});
      }
    } else {
      Promise.resolve(supabase.rpc('delete_notification_by_dedup', { p_user_id: authorId, p_dedup_key: dedupKey })).catch(() => {});
    }
  }, [userId, activePetId, posts, ownerFirst, profile?.handle, perms.canLike, gamificationEnabled]);

  const toggleComments = useCallback(async (postId: string) => {
    const post = posts.find(p => p.id === postId);
    const opening = !post?.showComments;
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, showComments: !p.showComments }
        : opening ? { ...p, showComments: false } : p
    ));
    if (post && !post.commentsLoaded && !postId.startsWith('m') && !postId.startsWith('local')) {
      const { data: comments } = await supabase
        .from('post_comments').select('id, post_id, author_id, pet_id, body, created_at')
        .eq('post_id', postId).order('created_at', { ascending: false }).limit(30);
      const rows = comments ?? [];
      const authorIds = [...new Set(rows.map((c: any) => c.author_id).filter(Boolean))];
      const petIds    = [...new Set(rows.map((c: any) => c.pet_id).filter(Boolean))];
      const [profileRes, petRes] = await Promise.all([
        authorIds.length ? supabase.from('profiles').select('id, full_name, handle, avatar_url').in('id', authorIds) : { data: [] },
        petIds.length ? supabase.from('pets').select('id, name, emoji, accent_color, avatar_url').in('id', petIds) : { data: [] },
      ]);
      const profileMap = Object.fromEntries((profileRes.data ?? []).map((p: any) => [p.id, p]));
      const petMap     = Object.fromEntries((petRes.data    ?? []).map((p: any) => [p.id, p]));
      const loaded = rows.map((c: any) => ({ ...c, author: profileMap[c.author_id] ?? null, pet: petMap[c.pet_id] ?? null }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments: loaded, commentsLoaded: true } : p));
    }
  }, [posts]);
  useEffect(() => { toggleCommentsRef.current = toggleComments; }, [toggleComments]);

  const addComment = useCallback(async (postId: string, body: string) => {
    if (!perms.canComment) return;
    if (containsProfanity(body)) {
      showAlert('Keep it friendly 🐾', 'Your comment contains language that isn\'t allowed. Please edit and try again.', [{ text: 'OK' }]);
      return;
    }
    const localId = `lc_${Date.now()}`;
    const localComment: PostComment = {
      id: localId, author_id: userId ?? '', body,
      created_at: new Date().toISOString(),
      author: { full_name: profile?.full_name ?? 'You', handle: profile?.handle ?? null, avatar_url: profile?.avatar_url ?? null },
      pet: pet ? { name: pet.name, emoji: pet.emoji, accent_color: pet.accent_color, avatar_url: pet.avatar_url } : undefined,
    };
    const bumpedAt = new Date().toISOString();
    setPosts(prev => {
      const updated = prev.map(p => p.id !== postId ? p : {
        ...p, updated_at: bumpedAt,
        comments: [localComment, ...(p.comments ?? [])],
        comments_count: (p.comments_count ?? 0) + 1,
      });
      return [...updated].sort((a, b) =>
        new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime()
      );
    });
    feedScrollToTopRef.current?.();
    const post = posts.find(p => p.id === postId);
    const { data, error } = await supabase.from('post_comments')
      .insert({ post_id: postId, author_id: userId, pet_id: activePetId ?? null, body })
      .select('id').single();
    if (error) {
      console.warn('[addComment] insert failed:', error.message);
      setPosts(prev => prev.map(p => p.id !== postId ? p : {
        ...p, comments: (p.comments ?? []).filter(c => c.id !== localId),
        comments_count: Math.max(0, (p.comments_count ?? 1) - 1),
      }));
      return;
    }
    if (post?.author_id && post.author_id !== userId) {
      const curPet  = petRef.current;
      const postTitle = curPet?.name ? `${curPet.emoji ?? '🐾'} ${curPet.name} commented on your post` : 'New comment on your post';
      const postBody  = body.slice(0, 80);
      supabase.functions.invoke('playdates', {
        body: { action: 'notify', user_id: post.author_id, title: postTitle, body: postBody,
          type: 'post_comment', dedup_key: `comment:${postId}:${data.id}`,
          data: { type: 'post_comment', post_id: postId, actor_user_id: userId, actor_pet_id: activePetId, actor_name: curPet?.name, actor_emoji: curPet?.emoji, actor_owner_handle: profile?.handle ?? null },
        },
      }).catch(() => {});
    }
    if (body.includes('@')) {
      const handles = extractHandles(body);
      if (handles.length) {
        supabase.functions.invoke('mention-notify', {
          body: { comment_id: data.id, handles, actor_pet_name: pet?.name ?? 'Someone', actor_pet_emoji: pet?.emoji ?? '🐾', actor_user_id: userId },
        }).catch(() => {});
      }
    }
    if (gamificationEnabled && userId) {
      awardCoins(userId, 'comment_added', data.id).then(result => {
        if (result.ok && result.coins_awarded && result.coins_awarded > 0) {
          showCoinFlow(result.coins_awarded, 'for commenting! 💬');
        }
      });
    }
  }, [userId, activePetId, pet, profile, posts, perms.canComment, gamificationEnabled]);

  const executeFollowAction = useCallback(async (
    followerPetId: string, targetPetId: string, targetOwnerUserId: string, isFollowing: boolean,
  ) => {
    const uid = storeUserId ?? null;
    try {
      if (isFollowing) {
        await unfollowPet(followerPetId, targetPetId);
        deleteNotificationByDedup(targetOwnerUserId, `follow:${followerPetId}:${targetPetId}`).catch(() => {});
      } else {
        await followPet(followerPetId, targetPetId);
        const curPet = petRef.current;
        if (curPet?.name) {
          const title = `${curPet.emoji ?? '🐾'} ${curPet.name} started following you`;
          supabase.functions.invoke('playdates', {
            body: {
              action: 'notify', user_id: targetOwnerUserId, title, body: 'Tap to see their profile',
              type: 'follow', dedup_key: `follow:${followerPetId}:${targetPetId}`,
              data: { type: 'follow', actor_user_id: uid, actor_pet_id: followerPetId, actor_name: curPet.name, actor_emoji: curPet.emoji, actor_owner_handle: profile?.handle ?? null },
            },
          }).catch(() => {});
        }
      }
      if (userId) feedData.loadFollows(userId, activePetId ?? undefined);
    } catch (e: any) {
      showAlert('Error', e.message);
    }
  }, [storeUserId, feedData, profile?.handle]);

  const toggleFollow = useCallback(async (targetPetId: string, currentlyFollowing: boolean) => {
    if (!userId) { showAlert('Sign in required', 'Please sign in to follow pets.'); return; }
    if (!activePetId) { showAlert('Select a pet', 'Choose your active pet first to follow other pets.'); return; }
    const isFollowing = currentlyFollowing || feedData.followedPetIds.has(targetPetId);
    const targetPost = posts.find(p => p.pet?.id === targetPetId);
    const targetOwnerUserId = targetPost?.author_id ?? '';
    const targetName = targetPost?.pet?.name ?? 'this pet';

    if (pets.length <= 1) {
      executeFollowAction(activePetId, targetPetId, targetOwnerUserId, isFollowing);
      return;
    }

    // Multi-pet: pre-check which pets actually follow (or don't follow) this target
    const myPetIds = pets.map(p => p.id);
    const { data: existingRows } = await supabase
      .from('pet_follows')
      .select('follower_pet_id')
      .in('follower_pet_id', myPetIds)
      .eq('following_pet_id', targetPetId);
    const alreadyFollowingIds = new Set((existingRows ?? []).map((r: any) => r.follower_pet_id));

    if (isFollowing) {
      // Unfollow: only show pets that actually follow this target
      const followerPets = pets.filter(p => alreadyFollowingIds.has(p.id));
      if (followerPets.length === 0) return;
      if (followerPets.length === 1) {
        executeFollowAction(followerPets[0].id, targetPetId, targetOwnerUserId, true);
        return;
      }
      setPendingFollowPets(followerPets);
    } else {
      // Follow: only show pets that don't already follow this target
      const eligiblePets = pets.filter(p => !alreadyFollowingIds.has(p.id));
      if (eligiblePets.length === 0) return;
      if (eligiblePets.length === 1) {
        executeFollowAction(eligiblePets[0].id, targetPetId, targetOwnerUserId, false);
        return;
      }
      setPendingFollowPets(eligiblePets);
    }

    setPendingFollowTarget({ petId: targetPetId, ownerUserId: targetOwnerUserId, targetName });
    setFollowPickerMode(isFollowing ? 'unfollow' : 'follow');
    setShowFollowPicker(true);
  }, [storeUserId, activePetId, pets, feedData.followedPetIds, posts, executeFollowAction]);

  const [followersData, setFollowersData] = useState<any[]>([]);
  const [followingData, setFollowingData] = useState<any[]>([]);

  const openFollowSheet = useCallback((mode: 'followers' | 'following') => {
    const p = activePet();
    router.push({
      pathname: '/pet/followers' as any,
      params: { petId: p?.id ?? '', initialTab: mode },
    });
  }, [activePetId]);

  const handleDeletePost = useCallback((post: Post) => {
    showAlert('Delete post', 'This cannot be undone. Are you sure?', [
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setPosts(prev => prev.filter(p => p.id !== post.id));
        await dbDeletePost(post.id, post.author_id).catch(() => {});
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const handleReport = useCallback((post: Post) => {
    const alreadyReported = reportedPostIds.has(post.id);
    if (alreadyReported) {
      showAlert('Remove report?', 'This will withdraw your report on this post.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          if (userId) await supabase.from('post_reports').delete().eq('post_id', post.id).eq('reporter_id', userId);
          setReportedPostIds(prev => { const next = new Set(prev); next.delete(post.id); return next; });
        }},
      ]);
      return;
    }
    showAlert(
      'Report post',
      'Why are you reporting this post?',
      [
        { text: 'Spam', onPress: async () => {
          if (userId) await supabase.from('post_reports').insert({ post_id: post.id, reporter_id: userId, reason: 'spam' }).then(() => {});
          setReportedPostIds(prev => new Set(prev).add(post.id));
        }},
        { text: 'Inappropriate', onPress: async () => {
          if (userId) await supabase.from('post_reports').insert({ post_id: post.id, reporter_id: userId, reason: 'inappropriate' }).then(() => {});
          setReportedPostIds(prev => new Set(prev).add(post.id));
        }},
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [reportedPostIds, userId]);

  const createPost = async (
    caption: string, photoUri: string | null, photoBase64: string | null,
    videoUri: string | null = null, videoBase64: string | null = null, videoMimeType?: string,
    onUploadProgress?: (fraction: number) => void,
    postingAsPetId?: string,
    photoUris: string[] = [], photoB64s: string[] = [],
    captionOverlay = false,
    fitFrame = false,
    overlayCaption = '',
  ) => {
    const targetPetId = postingAsPetId ?? activePetId;
    if (!targetPetId || !userId) { showAlert('Not signed in', 'Please sign in and select a baby to post.'); return; }
    if (caption && containsProfanity(caption)) { showAlert('Keep it friendly 🐾', 'Post contains language that isn\'t allowed.'); return; }

    // Use the actual posting pet (may differ from activePet when user switches pet in compose)
    const postingPet = pets.find(p => p.id === targetPetId) ?? pet;
    const localId = `local_${Date.now()}`;
    const newPost: Post = {
      id: localId, pet_id: targetPetId, author_id: userId,
      caption: caption || null,
      overlay_caption: (captionOverlay && !videoUri && !!(photoUri || photoUris.length > 0) && overlayCaption) ? overlayCaption : null,
      photo_url: videoUri ? null : photoUri,
      media_type: videoUri ? 'video' : 'photo',
      video_url: videoUri,
      caption_overlay: captionOverlay && !videoUri && !!(photoUri || photoUris.length > 0),
      fit_frame: fitFrame && !videoUri && !!(photoUri || photoUris.length > 0),
      likes_count: 0, comments_count: 0, is_public: true,
      created_at: new Date().toISOString(),
      pet: postingPet
        ? { name: postingPet.name, emoji: postingPet.emoji, accent_color: postingPet.accent_color, species: (postingPet as any).species, followers_count: 0 }
        : undefined,
      author: { full_name: profile?.full_name ?? 'You', handle: profile?.handle ?? null, avatar_url: profile?.avatar_url ?? null },
      liked: false, showComments: false, comments: [], commentsLoaded: true,
    };
    setPosts(prev => [newPost, ...prev]);
    feedScrollToTopRef.current?.();
    if (videoUri) setTimeout(() => checkVideoVisibility(), 300);

    let photo_url: string | null = null;
    let photo_urls_arr: string[] = [];
    let photoFileSize = 0;

    if (photoUris.length > 0) {
      const results = await Promise.allSettled(
        photoUris.map((u, i) => uploadSocialPhoto(userId, u, photoB64s[i] ?? null, i))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') { photo_urls_arr.push(r.value.url); photoFileSize += r.value.fileSizeBytes; }
        else console.error('[createPost] multi-photo upload failed:', r.reason?.message);
      }
      if (photo_urls_arr.length > 0) photo_url = photo_urls_arr[0];
      setPosts(prev => prev.map(p => p.id === localId ? { ...p, photo_url, photo_urls: photo_urls_arr } : p));
    } else if (photoUri) {
      try {
        const result = await uploadSocialPhoto(userId, photoUri, photoBase64);
        photo_url = result.url; photo_urls_arr = [result.url]; photoFileSize = result.fileSizeBytes;
        setPosts(prev => prev.map(p => p.id === localId ? { ...p, photo_url, photo_urls: photo_urls_arr } : p));
      } catch (e: any) { console.error('[createPost] upload failed:', e.message); }
    }

    let video_url: string | null = null;
    let videoFileSize = 0;
    if (videoUri) {
      if (!videoBase64) {
        setPosts(prev => prev.filter(p => p.id !== localId));
        showAlert('Could not upload video', 'The video data was lost — please pick or record it again.');
        return;
      }
      try {
        const result = await uploadSocialVideo(userId, videoBase64, videoMimeType, onUploadProgress);
        video_url = result.url; videoFileSize = result.fileSizeBytes;
        setPosts(prev => prev.map(p => p.id === localId ? { ...p, video_url } : p));
      } catch (e: any) {
        setPosts(prev => prev.filter(p => p.id !== localId));
        showAlert('Could not upload video',
          e.message?.includes('mime type') || e.message?.includes('not supported')
            ? 'The server rejected this video format. If this keeps happening, the storage bucket may need the video migration applied (ask your admin to run migration_pets_bucket_video.sql).'
            : (e.message ?? 'Please try again.'),
        );
        return;
      }
    }

    const { data, error: insertErr } = await supabase
      .from('social_posts')
      .insert({
        pet_id: targetPetId, author_id: userId, caption: caption || null,
        overlay_caption: (captionOverlay && !videoUri && !!photo_url && overlayCaption) ? overlayCaption : null,
        photo_url: videoUri ? null : photo_url, photo_urls: videoUri ? [] : photo_urls_arr,
        media_type: videoUri ? 'video' : 'photo', video_url, is_public: true,
        file_size_bytes: videoUri ? videoFileSize : photoFileSize,
        caption_overlay: captionOverlay && !videoUri && !!photo_url,
        fit_frame: fitFrame && !videoUri && !!photo_url,
      })
      .select(`*, pets ( id, name, emoji, accent_color, species, breed, avatar_url, followers_count, owner_id ), author:profiles ( full_name, handle )`)
      .single();

    if (insertErr) {
      console.error('Post insert failed:', insertErr.message, insertErr.details);
      showAlert('Could not save post', insertErr.message);
      setPosts(prev => prev.filter(p => p.id !== localId));
      if (photo_url) { const path = photo_url.split('/pets/')[1]?.split('?')[0]; if (path) supabase.storage.from('pets').remove([path]).then(() => {}); }
      if (video_url) { const path = video_url.split('/pets/')[1]?.split('?')[0]; if (path) supabase.storage.from('pets').remove([path]).then(() => {}); }
      return;
    }

    const saved: Post = { ...data, pet: (data as any).pets, author: (data as any).author, liked: false, showComments: false, comments: [], commentsLoaded: true };
    setPosts(prev => [saved, ...prev.filter(p => p.id !== localId)]);
    if (saved.media_type === 'video' && saved.video_url) setTimeout(() => checkVideoVisibility(), 300);

    // Notify followers (fire-and-forget)
    ;(async () => {
      try {
        if (!activePetId) return;
        // Fetch pets that follow this pet, along with their owner's user_id
        const { data: followers } = await supabase
          .from('pet_follows')
          .select('follower_pet:pets!follower_pet_id(owner_id)')
          .eq('following_pet_id', activePetId);
        const followerOwnerIds = [...new Set(
          (followers ?? []).map((r: any) => r.follower_pet?.owner_id).filter(Boolean)
        )].filter(id => id !== userId);
        if (!followerOwnerIds.length) return;
        const petName = pet?.name ?? 'A pet'; const petEmoji = pet?.emoji ?? '🐾';
        const title = ownerFirst ? `${petEmoji} ${petName} (${ownerFirst}) posted` : `${petEmoji} ${petName} posted`;
        const body  = caption ? caption.slice(0, 100) : (saved.media_type === 'video' ? 'Shared a video 🎥' : 'Shared a photo 📸');
        await Promise.all(followerOwnerIds.map((ownerId: string) =>
          supabase.functions.invoke('playdates', {
            body: { action: 'notify', user_id: ownerId, title, body, type: 'new_post',
              dedup_key: `new_post:${saved.id}:${ownerId}`,
              data: { type: 'new_post', post_id: saved.id, pet_id: activePetId, actor_name: petName, actor_emoji: petEmoji, actor_owner_handle: profile?.handle ?? null },
            },
          }).catch(() => {})
        ));
      } catch (e: any) { console.warn('[createPost] follower notify failed:', e.message); }
    })();

    if (caption) {
      const handles = extractHandles(caption);
      if (handles.length) {
        supabase.functions.invoke('mention-notify', {
          body: { post_id: saved.id, handles, actor_pet_name: pet?.name ?? 'Someone', actor_pet_emoji: pet?.emoji ?? '🐾', actor_user_id: userId },
        }).catch(() => {});
      }
    }

    if (gamificationEnabled && userId) {
      // Delay so compose sheet is fully dismissed before the coin overlay appears
      setTimeout(() => {
        awardCoins(userId, 'post_created', saved.id).then(result => {
          if (result.ok && result.coins_awarded && result.coins_awarded > 0) {
            showCoinFlow(result.coins_awarded, 'for posting! 📸');
          }
        }).catch(() => {});
      }, 800);
    }
  };

  const openCounterPropose = (requestId: string) => { setCpRequestId(requestId); setCpVisible(true); };

  const requestPlaydate = (target: NearbyPet) => {
    if (!userId || !activePetId) return;
    if (pet?.status === 'memorial') { showAlert('Memorial profile', `${pet.name}'s profile is a memorial — playdates are not available.`); return; }
    if (target.owner_id === userId) { showAlert('That\'s your pet! 🐾', 'You can\'t send a playdate request to your own pet.'); return; }
    const existingStatus = playdates.playdateStatuses.get(target.id);
    if (existingStatus && existingStatus !== 'declined' && existingStatus !== 'cancelled' && existingStatus !== 'past' && existingStatus !== 'expired') {
      const label = existingStatus === 'agreed' ? 'confirmed playdate' : existingStatus === 'negotiating' ? 'active chat' : existingStatus === 'accepted' ? 'accepted request' : 'pending request';
      showAlert('Already connected 🐾', `You already have a ${label} with ${target.name}. Check My Playdates to continue.`, [{ text: 'OK' }]);
      return;
    }
    if (playdates.requestedPets.has(target.id)) return;
    setProposalTarget(target);
    setProposalVisible(true);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const sortedPets = useMemo(() => {
    const feedId = resolvedFeedPet?.id ?? activePetId;
    const first = pets.find(p => p.id === feedId);
    return first ? [first, ...pets.filter(p => p.id !== feedId)] : pets;
  }, [pets, activePetId, resolvedFeedPet]);

  const [feedSpecies, setFeedSpecies] = useState<SpeciesFilter>('all');

  const feedSections = useMemo(() => {
    const effectiveDate = (p: Post) => Math.max(new Date(p.updated_at ?? p.created_at).getTime(), new Date(p.created_at).getTime());
    const byDate = (a: Post, b: Post) => effectiveDate(b) - effectiveDate(a);
    const speciesFiltered = feedSpecies === 'all' ? posts : posts.filter(p => (p.pet?.species ?? '').toLowerCase() === feedSpecies);

    if (feedTab === 'pinned') {
      let pinnedPosts = posts.filter(p => feedData.pinnedPostIds.has(p.id));
      if (deferredSearchQuery.trim()) {
        const q = deferredSearchQuery.toLowerCase();
        pinnedPosts = pinnedPosts.filter(p => p.caption?.toLowerCase().includes(q) || p.pet?.name?.toLowerCase().includes(q) || p.pet?.breed?.toLowerCase().includes(q) || p.author?.full_name?.toLowerCase().includes(q));
      }
      return [{ header: null as string | null, posts: pinnedPosts }];
    }
    if (feedTab === 'following') {
      let followingPosts = [...speciesFiltered].filter(p => feedData.followedPetIds.has(p.pet?.id ?? '')).sort(byDate);
      if (deferredSearchQuery.trim()) {
        const q = deferredSearchQuery.toLowerCase();
        followingPosts = followingPosts.filter(p => p.caption?.toLowerCase().includes(q) || p.pet?.name?.toLowerCase().includes(q) || p.pet?.breed?.toLowerCase().includes(q) || p.author?.full_name?.toLowerCase().includes(q));
      }
      return [{ header: null as string | null, posts: followingPosts }];
    }
    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.toLowerCase();
      return [{ header: null as string | null, posts: [...speciesFiltered].filter(p => p.caption?.toLowerCase().includes(q) || p.pet?.name?.toLowerCase().includes(q) || p.pet?.breed?.toLowerCase().includes(q) || p.author?.full_name?.toLowerCase().includes(q)).sort(byDate) }];
    }
    return [{ header: null as string | null, posts: [...speciesFiltered].sort(byDate) }];
  }, [posts, feedData.followedPetIds, feedData.pinnedPostIds, activePetId, pet, deferredSearchQuery, feedTab, feedSpecies]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderFeed = () => (
    <FeedTab
      ac={ac} colors={colors} isDark={isDark}
      pet={pet} profile={profile} resolvedFeedPet={resolvedFeedPet}
      sortedPets={sortedPets} storeUserId={storeUserId ?? null}
      loading={loading} feedTab={feedTab} feedSpecies={feedSpecies}
      showSearch={showSearch} searchQuery={searchQuery}
      feedSections={feedSections} posts={posts} activePetId={activePetId}
      freshFollowersCount={feedData.freshFollowersCount} freshFollowingCount={feedData.freshFollowingCount}
      pinnedPostIds={feedData.pinnedPostIds} followedPetIds={feedData.followedPetIds}
      reportedPostIds={reportedPostIds} videoMuted={videoMuted}
      perms={perms} tier={tier} mainTab={mainTab} feedQuery={feedQuery}
      onSetFeedTab={setFeedTab} onSetFeedSpecies={setFeedSpecies}
      onSetShowSearch={setShowSearch} onSetSearchQuery={setSearchQuery}
      onSetShowPetPicker={setShowPetPicker} onSetShowCompose={setShowCompose}
      onOpenFollowSheet={openFollowSheet}
      onToggleLike={toggleLike} onToggleComments={toggleComments}
      onAddComment={addComment} onAfterComment={() => feedScrollToTopRef.current?.()} onToggleFollow={toggleFollow}
      onSetMenuPost={setMenuPost} onHandleReport={handleReport}
      onSetVideoMuted={setVideoMuted} onTogglePin={feedData.togglePin}
      onFetchNextPage={loadMorePosts}
      scrollToTopRef={feedScrollToTopRef}
    />
  );

  const renderNearby = () => (
    <NearbyTab
      ac={ac} colors={colors} isDark={isDark} pet={pet} profile={profile} userId={userId}
      locationGranted={nearby.locationGranted} locationLabel={nearby.locationLabel}
      distanceFilter={nearby.distanceFilter} setDistanceFilter={nearby.setDistanceFilter} distanceOpts={nearby.distanceOpts}
      genderFilter={nearby.genderFilter} setGenderFilter={nearby.setGenderFilter}
      breedSearch={nearby.breedSearch} setBreedSearch={nearby.setBreedSearch}
      filteredNearby={nearby.filteredNearby} loadingNearby={nearby.loadingNearby}
      events={events.events} loadingEvents={events.loadingEvents} eventsEnabled={eventsEnabled} toggleRsvp={events.toggleRsvp}
      playdateChats={playdates.playdateChats} setPlaydateChats={playdates.setPlaydateChats}
      incomingRequests={playdates.incomingRequests}
      outgoingActiveReqs={playdates.outgoingActiveReqs} setOutgoingActiveReqs={playdates.setOutgoingActiveReqs}
      playdateMeta={playdates.playdateMeta}
      playdateStatuses={playdates.playdateStatuses} setPlaydateStatuses={playdates.setPlaydateStatuses}
      loadingRequests={playdates.loadingRequests} loadingChats={playdates.loadingChats}
      requestedPets={playdates.requestedPets} respondingId={playdates.respondingId}
      playdatesChatEnabled={playdatesChatEnabled}
      chatReadAt={playdates.chatReadAt} markChatRead={playdates.markChatRead}
      resolvedFeedPet={resolvedFeedPet} activePetId={activePetId} setFeedPet={setFeedPet} sortedPets={sortedPets}
      showOutgoingSheet={playdates.showOutgoingSheet} setShowOutgoingSheet={playdates.setShowOutgoingSheet}
      proposalHistory={playdates.proposalHistory} setProposalHistory={playdates.setProposalHistory}
      setShowProfileModal={playdates.setShowProfileModal} setSelectedRequest={playdates.setSelectedRequest}
      setShowCreateEvent={events.setShowCreateEvent}
      requestPlaydate={requestPlaydate} withdrawPlaydate={playdates.withdrawPlaydate} resendPlaydate={playdates.resendPlaydate}
      respondToRequest={playdates.respondToRequest} respondAndChat={playdates.respondAndChat}
      loadIncomingRequests={playdates.loadIncomingRequests} loadPlaydateChats={playdates.loadPlaydateChats}
    />
  );

  const renderPlaydates = () => (
    <PlaydatesTab
      ac={ac} colors={colors} userId={userId}
      playdateChats={playdates.playdateChats}
      incomingRequests={playdates.incomingRequests}
      requestedPets={playdates.requestedPets}
      outgoingActiveReqs={playdates.outgoingActiveReqs}
      loadingRequests={playdates.loadingRequests}
      loadingChats={playdates.loadingChats}
      playdatesChatEnabled={playdatesChatEnabled}
      respondingId={playdates.respondingId}
      formatTime={formatTime}
      onRespondToRequest={playdates.respondToRequest}
      onRespondAndChat={playdates.respondAndChat}
      onRespondAndSchedule={openCounterPropose}
      onGoNearby={() => setMainTab('Nearby')}
    />
  );

  const renderFamily = () => (
    <FamilyTab
      ac={ac} colors={colors} pet={pet} profile={profile}
      family={family.family} pendingInvites={family.pendingInvites}
      perms={perms} changingRoleId={family.changingRoleId}
      onInvite={async () => {
        const ok = await paywallGate('familyManagement', { title: 'Pro feature', message: 'Family management is available on Pro and Ultimate plans.' });
        if (ok) family.setShowInvite(true);
      }}
      onChangeRole={family.changeRole}
      onRemoveFamily={family.removeFamily}
      onCancelInvite={family.cancelInvite}
    />
  );

  // ── Screen ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={undefined}
      keyboardVerticalOffset={0}>
      <SafeAreaView edges={hideHeader ? [] : ['top']} style={{ backgroundColor: colors.card }}>
        {!hideHeader && (
          <View style={[sc.header, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[sc.title, { color: colors.textPrimary }]}>Community</Text>
            </View>
            <TouchableOpacity
              style={[sc.addBtn, { backgroundColor: colors.inputBg, marginRight: 8 }]}
              onPress={() => router.push('/(tabs)/all-notifications')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="notifications-outline" size={18} color={colors.textSecondary} />
              {socialUnreadCount > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                  <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700' }}>{socialUnreadCount > 99 ? '99+' : socialUnreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[sc.addBtn, { backgroundColor: colors.inputBg }]}
              onPress={() => { setShowSearch(s => !s); setSearchQuery(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showSearch ? 'close' : 'search'} size={18} color={showSearch ? ac : colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        {!hideHeader && (
          <View style={[sc.tabRow, { backgroundColor: colors.inputBg, borderRadius: 0, paddingVertical: 6 }]}>
            {(['Feed', 'Nearby', 'Family'] as MainTab[]).map(tab => {
              const active = mainTab === tab;
              const badge = tab === 'Nearby' ? playdates.incomingRequests.length : 0;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[sc.tabBtn, active && { backgroundColor: `${ac}18` }]}
                  onPress={() => {
                    setMainTab(tab);
                    if (tab === 'Nearby' && userId && socialUnreadCount > 0) {
                      markAllNotificationsRead(userId, SOCIAL_NOTIF_TYPES).then(() => setSocialUnreadCount(0)).catch(() => {});
                    }
                  }} activeOpacity={0.8}>
                  <Text style={[sc.tabLabel, { color: active ? ac : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>{tab}</Text>
                  {badge > 0 && <View style={{ position: 'absolute', top: 2, right: 2, backgroundColor: colors.danger, borderRadius: 6, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}><Text style={{ color: '#fff', fontSize: TYPO.label, fontWeight: '700' }}>{badge}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </SafeAreaView>

      {mainTab === 'Feed'     && renderFeed()}
      {mainTab === 'Nearby'   && renderNearby()}
      {mainTab === 'Family'   && renderFamily()}

      {/* Pet switcher modal — opened by tapping compose bar avatar */}
      <Modal visible={showPetPicker} transparent animationType="slide" onRequestClose={() => setShowPetPicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowPetPicker(false)} activeOpacity={1} />
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: insets.bottom + 16, maxHeight: '80%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
              <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }}>Switch Baby</Text>
              <TouchableOpacity onPress={() => setShowPetPicker(false)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {pets.map(p => {
                  const isActive = p.id === (feedPet?.id ?? activePetId);
                  const pc = (p as any).accent_color ?? colors.primary;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setFeedPet(p as any); setShowPetPicker(false); }}
                      activeOpacity={0.7}
                      style={{ width: '30%', alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: isActive ? 2 : StyleSheet.hairlineWidth, borderColor: isActive ? pc : colors.border }}>
                      {(p as any).avatar_url
                        ? <Image source={{ uri: (p as any).avatar_url }} style={{ width: 44, height: 44, borderRadius: 22, marginBottom: 8 }} />
                        : <Text style={{ fontSize: 36, marginBottom: 6 }}>{p.emoji}</Text>}
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2, textAlign: 'center' }} numberOfLines={1}>
                        {(p as any).breed ? toTitle((p as any).breed) : toTitle((p as any).species ?? 'Pet')}
                      </Text>
                      {isActive && (
                        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="checkmark-circle" size={12} color={pc} />
                          <Text style={{ fontSize: TYPO.caption, color: pc, fontWeight: '700' }}>Active</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Compose sheet */}
      <ComposeSheet
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        onPost={createPost}
        pet={resolvedFeedPet}
        pets={sortedPets}
        profile={profile}
        colors={colors}
        canPost={perms.canPost}
      />

      {/* Edit post sheet */}
      <EditPostSheet
        visible={editingPost !== null}
        post={editingPost}
        onClose={() => setEditingPost(null)}
        onSave={async (postId, caption, photoChange, newPhotoUri, newPhotoBase64, videoChange, newVideoUri, newVideoBase64, newVideoMime, overlayCaption, captionOverlay, replacedPhotoUrls: string[] | null | undefined, replacedPhotoBase64s: (string | null)[] | null | undefined) => {
          let photo_url: string | null | undefined;
          let photo_urls: string[] | undefined;

          if (replacedPhotoUrls && replacedPhotoBase64s && userId) {
            // Multi-photo edit: upload only newly-added photos (base64 present), keep existing URLs as-is
            const uploaded: string[] = [];
            for (let i = 0; i < replacedPhotoUrls.length; i++) {
              const b64 = replacedPhotoBase64s[i];
              if (b64) {
                const result = await uploadSocialPhoto(userId, replacedPhotoUrls[i], b64);
                uploaded.push(result.url);
              } else {
                uploaded.push(replacedPhotoUrls[i]);
              }
            }
            photo_urls = uploaded;
            photo_url = uploaded[0] ?? null;
          } else if (photoChange === 'removed') {
            photo_url = null; photo_urls = [];
          } else if (photoChange === 'replaced' && newPhotoUri && newPhotoBase64 && userId) {
            const result = await uploadSocialPhoto(userId, newPhotoUri, newPhotoBase64);
            photo_url = result.url; photo_urls = [result.url];
          }

          let video_url: string | null | undefined;
          if (videoChange === 'removed') {
            video_url = null;
          } else if (videoChange === 'replaced' && newVideoBase64 && userId) {
            const result = await uploadSocialVideo(userId, newVideoBase64, newVideoMime);
            video_url = result.url;
          }

          const updateFields: Record<string, any> = {
            caption,
            overlay_caption: overlayCaption ?? null,
            caption_overlay: !!captionOverlay,
            updated_at: new Date().toISOString(), is_edited: true, edited_at: new Date().toISOString(),
          };
          if (photo_url !== undefined) updateFields.photo_url = photo_url;
          if (photo_urls !== undefined) updateFields.photo_urls = photo_urls;
          if (video_url !== undefined) { updateFields.video_url = video_url; updateFields.video_thumbnail_url = video_url === null ? null : undefined; }
          if (photoChange === 'replaced') updateFields.media_type = 'photo';
          if (videoChange === 'replaced') updateFields.media_type = 'video';
          if (photoChange === 'removed' && videoChange === 'removed') updateFields.media_type = 'photo';

          const { data } = await supabase.from('social_posts').update(updateFields).eq('id', postId).select('*').single();
          if (data) setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...data } : p));
          setEditingPost(null);
          feedScrollToTopRef.current?.();
        }}
        colors={colors}
      />

      {/* Coin flow animation */}
      <CoinFlowOverlay
        visible={coinFlow.visible}
        amount={coinFlow.amount}
        action={coinFlow.action}
        petEmoji={pet?.emoji ?? '🐾'}
        petName={pet?.name ?? 'Your Pet'}
        petBalance={coinFlow.petBalance}
        dailyQuotaLeft={coinFlow.quotaLeft}
        dailyQuotaMax={coinFlow.quotaMax}
        onDismiss={() => setCoinFlow(f => ({ ...f, visible: false }))}
      />

      {/* Create event sheet */}
      <BottomSheet
        visible={events.showCreateEvent}
        onClose={() => { events.setPickerTarget(null); events.setShowCreateEvent(false); }}
        title="Create event">
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {/* Cover photo */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => showAlert('Cover photo', 'Choose a source', [
              { text: 'Camera', onPress: async () => {
                const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
                if (!res.canceled && res.assets[0]) events.setEvCoverUri(res.assets[0].uri);
              }},
              { text: 'Photo Library', onPress: async () => {
                const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
                if (!res.canceled && res.assets[0]) events.setEvCoverUri(res.assets[0].uri);
              }},
              ...(events.evCoverUri ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => events.setEvCoverUri(null) }] : []),
              { text: 'Cancel', style: 'cancel' as const },
            ])}
            style={{ height: 140, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.inputBg,
              borderWidth: 1.5, borderColor: colors.border, borderStyle: events.evCoverUri ? 'solid' : 'dashed',
              alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            {events.evCoverUri ? (
              <ExpoImage source={{ uri: events.evCoverUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Ionicons name="image-outline" size={28} color={colors.textTertiary} />
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>Add cover photo</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, opacity: 0.7 }}>Camera or library</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={[md.label, { color: colors.textSecondary }]}>Event title *</Text>
          <TextInput
            style={[md.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
            placeholder="e.g. Dog park meetup" placeholderTextColor={colors.placeholder}
            value={events.evTitle} onChangeText={events.setEvTitle} />
          <Text style={[md.label, { color: colors.textSecondary }]}>Event type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {Object.entries(EVENT_TYPES).map(([key, et]) => (
              <TouchableOpacity key={key} onPress={() => events.setEvType(key)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: events.evType === key ? ac : colors.inputBg, borderWidth: 1, borderColor: events.evType === key ? ac : colors.border }}>
                <Text style={{ color: events.evType === key ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: TYPO.body }}>{et.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[md.label, { color: colors.textSecondary }]}>Description</Text>
          <TextInput
            style={[md.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary, height: 72, textAlignVertical: 'top' }]}
            placeholder="What's happening?" placeholderTextColor={colors.placeholder} multiline
            value={events.evDesc} onChangeText={events.setEvDesc} />
          <Text style={[md.label, { color: colors.textSecondary }]}>Start</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => events.setPickerTarget('startDate')} style={[cps.dateBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, flex: 1 }]}>
              <Ionicons name="calendar-outline" size={15} color={ac} />
              <Text style={{ color: colors.textPrimary, fontSize: TYPO.body, flex: 1 }}>{format(events.evStart, 'MMM d, yyyy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => events.setPickerTarget('startTime')} style={[cps.dateBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Ionicons name="time-outline" size={15} color={ac} />
              <Text style={{ color: colors.textPrimary, fontSize: TYPO.body }}>{format(events.evStart, 'h:mm a')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[md.label, { color: colors.textSecondary }]}>End</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => events.setPickerTarget('endDate')} style={[cps.dateBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, flex: 1 }]}>
              <Ionicons name="calendar-outline" size={15} color={ac} />
              <Text style={{ color: colors.textPrimary, fontSize: TYPO.body, flex: 1 }}>{format(events.evEnd, 'MMM d, yyyy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => events.setPickerTarget('endTime')} style={[cps.dateBtn, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Ionicons name="time-outline" size={15} color={ac} />
              <Text style={{ color: colors.textPrimary, fontSize: TYPO.body }}>{format(events.evEnd, 'h:mm a')}</Text>
            </TouchableOpacity>
          </View>
          <AppDateTimePicker
            visible={events.pickerTarget !== null}
            value={events.pickerTarget === 'startDate' || events.pickerTarget === 'startTime' ? events.evStart : events.evEnd}
            mode={events.pickerTarget === 'startDate' || events.pickerTarget === 'endDate' ? 'date' : 'time'}
            minimumDate={events.pickerTarget === 'startDate' ? new Date() : events.pickerTarget === 'endDate' ? events.evStart : undefined}
            accent={ac}
            onCancel={() => events.setPickerTarget(null)}
            onConfirm={(selected) => {
              if (events.pickerTarget === 'startDate' || events.pickerTarget === 'startTime') {
                const next = new Date(events.evStart);
                if (events.pickerTarget === 'startDate') {
                  next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                  if (isBefore(events.evEnd, next)) { const pushed = new Date(next); pushed.setHours(next.getHours() + 2); events.setEvEnd(pushed); }
                } else { next.setHours(selected.getHours(), selected.getMinutes(), 0, 0); }
                events.setEvStart(next);
              } else {
                const next = new Date(events.evEnd);
                if (events.pickerTarget === 'endDate') next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                events.setEvEnd(next);
              }
              events.setPickerTarget(null);
            }}
          />
          <Text style={[md.label, { color: colors.textSecondary }]}>Location</Text>
          <LocationAutocompleteInput
            value={events.evLocation} onChangeText={events.setEvLocation}
            placeholder="e.g. Central Park, main entrance"
            colors={colors} />
        </ScrollView>
        <View style={[md.footer, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={[md.cancelBtn, { borderColor: colors.border }]} onPress={() => events.setShowCreateEvent(false)}>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[md.sendBtn, { backgroundColor: ac, opacity: events.savingEvent || !events.evTitle.trim() ? 0.6 : 1 }]}
            onPress={events.createEvent} disabled={events.savingEvent || !events.evTitle.trim()}>
            {events.savingEvent
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="calendar-outline" size={15} color="#fff" /><Text style={{ fontSize: TYPO.body, color: '#fff', fontWeight: '700' }}>Create event</Text></>}
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Family invite sheet */}
      <BottomSheet
        visible={family.showInvite}
        onClose={() => { family.setShowInvite(false); family.setInviteEmail(''); }}
        title="Invite family member">
        <View style={{ padding: 16, gap: 14 }}>
          <TextInput
            style={[md.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
            placeholder="Email address" placeholderTextColor={colors.placeholder}
            value={family.inviteEmail} onChangeText={family.setInviteEmail}
            autoCapitalize="none" keyboardType="email-address" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['caretaker', 'caregiver', 'viewer'] as const).map(r => (
              <TouchableOpacity key={r} onPress={() => family.setInviteRole(r)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: family.inviteRole === r ? ac : colors.inputBg, borderWidth: 1, borderColor: family.inviteRole === r ? ac : colors.border }}>
                <Text style={{ color: family.inviteRole === r ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: TYPO.caption }}>{toTitle(r)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={{ backgroundColor: ac, borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: family.sending || !family.inviteEmail.trim() ? 0.6 : 1 }}
            onPress={family.sendInvite} disabled={family.sending || !family.inviteEmail.trim()}>
            {family.sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Send invite</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Playdate sheets */}
      <IncomingRequestSheet
        visible={playdates.showProfileModal}
        request={playdates.selectedRequest}
        onClose={() => { playdates.setShowProfileModal(false); playdates.setSelectedRequest(null); }}
        ac={ac} colors={colors} userId={userId}
        respondAndChat={playdates.respondAndChat}
        respondToRequest={playdates.respondToRequest}
        openCounterPropose={openCounterPropose}
        playdatesChatEnabled={playdatesChatEnabled}
        playdateChats={playdates.playdateChats}
        setIncomingRequests={playdates.setIncomingRequests}
      />
      <OutgoingPlaydateSheet
        sheet={playdates.showOutgoingSheet}
        onClose={() => playdates.setShowOutgoingSheet(null)}
        ac={ac} colors={colors} userId={userId}
        playdatesChatEnabled={playdatesChatEnabled}
        playdateChats={playdates.playdateChats}
        proposalHistory={playdates.proposalHistory}
        openCounterPropose={openCounterPropose}
        loadPlaydateChats={playdates.loadPlaydateChats}
        loadIncomingRequests={playdates.loadIncomingRequests}
        setOutgoingActiveReqs={playdates.setOutgoingActiveReqs}
        setRequestedPets={playdates.setRequestedPets}
        setPlaydateStatuses={playdates.setPlaydateStatuses}
        withdrawPlaydate={playdates.withdrawPlaydate}
      />
      <ProposalSheet
        visible={proposalVisible}
        target={proposalTarget}
        activePetId={activePetId}
        myPet={pet}
        onClose={() => setProposalVisible(false)}
        ac={ac} colors={colors}
        setRequestedPets={playdates.setRequestedPets}
        setPlaydateStatuses={playdates.setPlaydateStatuses}
        setOutgoingActiveReqs={playdates.setOutgoingActiveReqs}
      />
      <CounterProposeSheet
        visible={cpVisible}
        requestId={cpRequestId}
        onClose={() => setCpVisible(false)}
        ac={ac} colors={colors}
        setIncomingRequests={playdates.setIncomingRequests}
      />

      {/* Post context menu */}
      <ActionSheet
        visible={menuPost !== null}
        onClose={() => setMenuPost(null)}
        actions={[
          ...(menuPost?.author_id === storeUserId ? [
            { label: 'Edit post',   icon: 'pencil-outline'   as const, onPress: () => { setEditingPost(menuPost); setMenuPost(null); } },
            { label: 'Delete post', icon: 'trash-outline'    as const, destructive: true, onPress: () => { const p = menuPost!; setMenuPost(null); handleDeletePost(p); } },
          ] : []),
          feedData.pinnedPostIds.has(menuPost?.id ?? '')
            ? { label: 'Unpin post', icon: 'pin-outline'   as const, onPress: () => { feedData.togglePin(menuPost!.id); setMenuPost(null); } }
            : { label: 'Pin post',   icon: 'pin-outline'   as const, onPress: () => { feedData.togglePin(menuPost!.id); setMenuPost(null); } },
          ...(menuPost?.author_id !== storeUserId ? [
            { label: 'Report post', icon: 'flag-outline'   as const, destructive: true, onPress: () => { const p = menuPost!; setMenuPost(null); handleReport(p); } },
          ] : []),
        ]}
      />

      {/* Pet picker for follow / unfollow action */}
      <BottomSheet
        visible={showFollowPicker}
        onClose={() => { setShowFollowPicker(false); setPendingFollowTarget(null); setPendingFollowPets(null); }}
        title={followPickerMode === 'follow'
          ? `Follow ${pendingFollowTarget?.targetName ?? ''} as…`
          : `Unfollow ${pendingFollowTarget?.targetName ?? ''} as…`}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {(pendingFollowPets ?? pets).map(p => {
            const pAc = (p as any).accent_color ?? ac;
            const isActive = p.id === activePetId;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  if (!pendingFollowTarget) return;
                  setShowFollowPicker(false);
                  const target = pendingFollowTarget;
                  setPendingFollowTarget(null);
                  setPendingFollowPets(null);
                  const alreadyFollowing = followPickerMode === 'unfollow';
                  executeFollowAction(p.id, target.petId, target.ownerUserId, alreadyFollowing);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 20, paddingVertical: 14,
                  backgroundColor: isActive ? `${pAc}11` : 'transparent',
                }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${pAc}22`, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {(p as any).avatar_url
                    ? <LazyImage uri={(p as any).avatar_url} style={{ width: 44, height: 44, borderRadius: 22 }} />
                    : <Text style={{ fontSize: TYPO.title }}>{p.emoji ?? '🐾'}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{p.emoji} {p.name}</Text>
                  {isActive && <Text style={{ fontSize: TYPO.caption, color: pAc }}>Active pet</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Followers / Following full-page modal with tabs + search */}
      <Modal
        visible={followSheetMode !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setFollowSheetMode(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.textSecondary + '33' }}>
            <TouchableOpacity onPress={() => setFollowSheetMode(null)} style={{ padding: 4, marginRight: 8 }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>
              {activePet()?.emoji ?? '🐾'} {activePet()?.name}
            </Text>
          </View>
          {/* Tabs */}
          <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, backgroundColor: (colors as any).surface ?? (colors as any).card ?? colors.inputBg, borderRadius: 10, padding: 3 }}>
            {(['followers', 'following'] as const).map(tab => {
              const isActive = followSheetMode === tab;
              const count = tab === 'followers' ? (feedData.freshFollowersCount ?? followersData.length) : (feedData.freshFollowingCount ?? followingData.length);
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => {
                    setFollowSheetMode(tab);
                    setFollowList(tab === 'followers' ? followersData : followingData);
                    setFollowSearchQuery('');
                  }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: isActive ? ac : 'transparent' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: isActive ? '#fff' : colors.textSecondary }}>
                    {tab === 'followers' ? 'Followers' : 'Following'}{count ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Search bar */}
          <View style={{ marginHorizontal: 16, marginTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: (colors as any).surface ?? (colors as any).card ?? colors.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={followSearchQuery}
              onChangeText={setFollowSearchQuery}
              placeholder="Search pets..."
              placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary }}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {followSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setFollowSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {/* List */}
          {followListLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={ac} />
            </View>
          ) : (() => {
            const filtered = followList.filter((p: any) => {
              if (!followSearchQuery) return true;
              const q = followSearchQuery.toLowerCase();
              const owner = p.profiles ?? {};
              return (
                p.name?.toLowerCase().includes(q) ||
                owner.handle?.toLowerCase().includes(q) ||
                owner.full_name?.toLowerCase().includes(q)
              );
            });
            if (filtered.length === 0) return (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Text style={{ fontSize: TYPO.hero }}>🐾</Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
                  {followSearchQuery ? 'No matches' : (followSheetMode === 'followers' ? 'No followers yet' : 'Not following anyone yet')}
                </Text>
              </View>
            );
            return (
              <ScrollView contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
                {filtered.map((p: any) => {
                  const pAc = p.accent_color ?? ac;
                  const owner = p.profiles ?? {};
                  const ownerLabel = owner.handle ? `@${owner.handle}` : 'PawBond user';
                  const isFollowingTab = followSheetMode === 'following';
                  return (
                    <View
                      key={p.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => { setFollowSheetMode(null); router.push({ pathname: '/pet/[id]', params: { id: p.id } } as any); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: `${pAc}22`, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: `${pAc}44` }}>
                          {p.avatar_url
                            ? <LazyImage uri={p.avatar_url} style={{ width: 48, height: 48, borderRadius: 24 }} />
                            : <Text style={{ fontSize: TYPO.title }}>{p.emoji ?? '🐾'}</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{p.emoji} {p.name}</Text>
                          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{ownerLabel}</Text>
                        </View>
                      </TouchableOpacity>
                      {isFollowingTab && (
                        <TouchableOpacity
                          onPress={() => {
                            const followerPetId = activePetId ?? pets[0]?.id;
                            if (!followerPetId) return;
                            showAlert('Unfollow?', `Stop following ${p.name}?`, [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Unfollow', style: 'destructive', onPress: async () => {
                                try {
                                  await unfollowPet(followerPetId, p.id);
                                  const next = followingData.filter((f: any) => f.id !== p.id);
                                  setFollowingData(next);
                                  setFollowList(next);
                                  feedData.loadFollows(userId!, followerPetId);
                                } catch (e: any) { showAlert('Error', e.message); }
                              }},
                            ]);
                          }}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Unfollow</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            );
          })()}
        </SafeAreaView>
      </Modal>

      <CoinFlowOverlay
        visible={coinFlow.visible}
        amount={coinFlow.amount}
        action={coinFlow.action}
        petEmoji={pet?.emoji ?? '🐾'}
        petName={pet?.name ?? 'Your Pet'}
        petBalance={coinFlow.petBalance}
        dailyQuotaLeft={coinFlow.quotaLeft}
        dailyQuotaMax={coinFlow.quotaMax}
        onDismiss={() => setCoinFlow(f => ({ ...f, visible: false }))}
      />
    </KeyboardAvoidingView>
  );
}
