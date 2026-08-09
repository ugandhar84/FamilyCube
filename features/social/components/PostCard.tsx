import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, Animated, InteractionManager, Dimensions } from 'react-native';
const { width: SW } = Dimensions.get('window');
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { showAlert } from '@/components/AppAlert';
import LazyImage from '@/components/LazyImage';
import { relTime, editedTime } from '@/features/social/utils';
import { Post } from '@/features/social/types';
import { EmojiAvatar } from './EmojiAvatar';
import { MentionText } from './MentionComponents';
import { AutoplayVideo, MediaViewer, PhotoGrid, PostMedia } from './MediaComponents';
import { CommentsSection } from './CommentsSection';
import { supabase } from '@/lib/supabase';
import { toTitle } from '@/lib/format';

interface PostCardProps {
  post: Post;
  myUserId: string | null;
  myPet: any;
  myProfile: any;
  followedPetIds: Set<string>;
  onLike: (id: string) => void;
  onToggleComments: (id: string) => void;
  onAddComment: (postId: string, body: string) => Promise<void>;
  onAfterComment?: () => void;
  onFollow: (petId: string, following: boolean) => void;
  onOpenMenu?: (post: Post) => void;
  onReport?: (post: Post) => void;
  reportedPostIds?: Set<string>;
  globalMuted: boolean;
  onToggleMute: () => void;
  colors: any;
  searchQuery?: string;
  canLike?: boolean;
  canComment?: boolean;
  viewerTier?: string;
  pinnedPostIds?: Set<string>;
  onTogglePin?: (postId: string) => void;
  onCommentFocus?: () => void;
}

// Mirrors HeroMedia in PostDetailCard exactly — same ratio clamping, contentFit/contentPosition,
// and caption overlay inside the image view.
function AdaptivePhoto({
  uri, onPress, onDoubleTap, fitFrame, captionOverlay, overlayCaption, caption,
}: {
  uri: string;
  onPress?: () => void;
  onDoubleTap?: () => void;
  fitFrame?: boolean;
  captionOverlay?: boolean;
  overlayCaption?: string | null;
  caption?: string | null;
}) {
  const { Image: EImage } = require('expo-image');
  const [ratio, setRatio] = React.useState<number | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  const clampedRatio = ratio ? Math.min(Math.max(ratio, 3 / 4), 1.91) : 4 / 5;

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (singleTapTimer.current && now - lastTap.current < 250) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
      onDoubleTap?.();
    } else {
      lastTap.current = now;
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        onPress?.();
      }, 250);
    }
  }, [onPress, onDoubleTap]);

  return (
    <TouchableOpacity activeOpacity={0.95} onPress={handleTap}>
      <View style={{ width: SW, aspectRatio: fitFrame ? 1 : clampedRatio, backgroundColor: '#000' }}>
        <EImage
          source={{ uri }}
          style={{ width: '100%', height: '100%', backgroundColor: fitFrame ? '#000' : undefined }}
          contentFit={fitFrame ? 'contain' : 'cover'}
          contentPosition={fitFrame ? 'center' : 'top'}
          cachePolicy="memory-disk"
          transition={180}
          onLoad={(e: any) => {
            const w = e.source?.width ?? e.nativeEvent?.width;
            const h = e.source?.height ?? e.nativeEvent?.height;
            if (w && h) setRatio(w / h);
          }}
        />
        {!!captionOverlay && !!(overlayCaption || caption) && (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 64, paddingBottom: 18, paddingHorizontal: 16 }}
            pointerEvents="none">
            <Text style={{ color: '#fff', fontSize: TYPO.subheading, lineHeight: 26, fontWeight: '600', letterSpacing: 0.1, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }} numberOfLines={4}>
              {overlayCaption || caption}
            </Text>
          </LinearGradient>
        )}
        <View style={{ position: 'absolute', top: 12, right: 12 }} pointerEvents="none">
          <Ionicons name="expand-outline" size={16} color="rgba(255,255,255,0.7)" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PostCardBase({
  post, myUserId, myPet, myProfile, followedPetIds,
  onLike, onToggleComments, onAddComment, onAfterComment, onFollow, onOpenMenu, onReport, reportedPostIds,
  globalMuted, onToggleMute, colors, searchQuery, canLike, canComment, viewerTier,
  pinnedPostIds, onTogglePin, onCommentFocus,
}: PostCardProps) {
  const ac = post.pet?.accent_color ?? colors.primary;
  const isOwn      = post.author_id === myUserId;
  const isMockPost = post.id.startsWith('m') || post.id.startsWith('local');

  // Latest 2 comments preview — only comments that are tied to a pet
  type PreviewComment = { id: string; author_id: string; body: string; photoUrl?: string | null; created_at: string; petName: string; petEmoji?: string; petAvatarUrl?: string; petAccentColor?: string; ownerHandle?: string | null };
  const [previewComments, setPreviewComments] = useState<PreviewComment[]>([]);

  const refetchPreview = useCallback(async () => {
    if (isMockPost) return;
    const { data } = await supabase
      .from('post_comments')
      .select('id, author_id, pet_id, body, photo_url, created_at, pets(name, emoji, avatar_url, accent_color), profiles(handle)')
      .eq('post_id', post.id)
      .not('pet_id', 'is', null)
      .order('created_at', { ascending: false })   // newest first so limit(2) = latest 2
      .limit(2);
    if (data) {
      setPreviewComments(
        (data as any[])
          .filter((c: any) => !!c.pets?.name)
          .map((c: any) => ({
            id: c.id,
            author_id: c.author_id,
            body: c.body,
            photoUrl: c.photo_url ?? null,
            created_at: c.created_at,
            petName: c.pets.name as string,
            petEmoji: c.pets.emoji,
            petAvatarUrl: c.pets.avatar_url,
            petAccentColor: c.pets.accent_color,
            ownerHandle: c.profiles?.handle ?? null,
          }))
          .reverse()   // reverse so they read oldest→newest top→bottom
      );
    }
  }, [post.id, isMockPost]);

  useEffect(() => {
    if (isMockPost || post.comments_count === 0) {
      setPreviewComments([]);
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => { refetchPreview(); });
    return () => task.cancel();
  // Only re-run on mount / post change — NOT on comments_count.
  // Re-fetch is triggered explicitly after onAddComment resolves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  // Wrap onAddComment: support photo upload and reply threading inline on the card.
  // Photo/reply path inserts directly (onAddComment is text-only via SocialScreen).
  const handleAddComment = useCallback(async (postId: string, body: string, photoUri?: string | null, replyToId?: string | null) => {
    if (photoUri || replyToId) {
      // Rich comment — upload photo if present, then insert directly
      let uploadedUrl: string | null = null;
      if (photoUri) {
        try {
          const { uploadCommentPhoto } = require('@/lib/supabase');
          uploadedUrl = await uploadCommentPhoto(myUserId, photoUri);
        } catch { /* submit without photo if upload fails */ }
      }
      const { data: insertedCard } = await supabase.from('post_comments').insert({
        post_id: postId,
        author_id: myUserId,
        pet_id: myPet?.id ?? null,
        body: body || ' ',
        photo_url: uploadedUrl,
        reply_to_comment_id: replyToId ?? null,
      }).select('id').single();

      // Send notifications (same logic as PostDetailScreen)
      if (myPet?.name && myUserId) {
        const cmtBody = body.slice(0, 100);
        const actorData = { type: 'post_comment', post_id: postId, comment_id: insertedCard?.id ?? null, actor_pet_id: myPet.id, actor_name: myPet.name, actor_emoji: myPet.emoji, actor_owner_handle: myProfile?.handle ?? null };

        // Notify the replied-to commenter — one notification per replier per comment
        if (replyToId) {
          const { data: repliedRow } = await supabase.from('post_comments').select('author_id').eq('id', replyToId).single();
          if (repliedRow?.author_id && repliedRow.author_id !== myUserId) {
            supabase.functions.invoke('playdates', { body: { action: 'notify', user_id: repliedRow.author_id, title: `${myPet.emoji ?? '🐾'} ${myPet.name} replied to your comment`, body: cmtBody, type: 'post_comment_reply', dedup_key: `reply:${replyToId}:from:${myUserId}`, data: { ...actorData, type: 'post_comment_reply', reply_to_comment_id: replyToId, body: body.slice(0, 120) } } }).catch(() => {});
          }
          // Notify post author — collapsed per post
          if (post.author_id && post.author_id !== myUserId && post.author_id !== repliedRow?.author_id) {
            supabase.functions.invoke('playdates', { body: { action: 'notify', user_id: post.author_id, title: `${myPet.emoji ?? '🐾'} ${myPet.name} replied on your post`, body: cmtBody, type: 'post_comment', dedup_key: `comment:post:${postId}:owner`, data: { ...actorData, body: body.slice(0, 120) } } }).catch(() => {});
          }
        } else {
          // Plain comment — notify post author, collapsed per post
          if (post.author_id && post.author_id !== myUserId) {
            supabase.functions.invoke('playdates', { body: { action: 'notify', user_id: post.author_id, title: `${myPet.emoji ?? '🐾'} ${myPet.name} commented on your post`, body: cmtBody, type: 'post_comment', dedup_key: `comment:post:${postId}:owner`, data: { ...actorData, body: body.slice(0, 120) } } }).catch(() => {});
          }
        }

        // Notify other thread participants — one collapsed notification per person per post
        ;(async () => {
          try {
            const { data: rows } = await supabase.from('post_comments').select('author_id').eq('post_id', postId)
              .neq('author_id', myUserId)
              .neq('author_id', post.author_id ?? '');
            if (!rows?.length) return;
            const participantIds = [...new Set(rows.map((r: any) => r.author_id))];
            await Promise.all(participantIds.map((uid: string) =>
              supabase.functions.invoke('playdates', { body: { action: 'notify', user_id: uid, title: `${myPet.emoji ?? '🐾'} ${myPet.name} also commented`, body: cmtBody, type: 'post_comment', dedup_key: `comment:post:${postId}:thread:${uid}`, data: { ...actorData, thread: true } } }).catch(() => {}),
            ));
          } catch {}
        })();
      }
    } else {
      await onAddComment(postId, body);
    }
    await refetchPreview();
    onAfterComment?.();
  }, [onAddComment, onAfterComment, refetchPreview, myUserId, myPet, myProfile, post]);

  // Adapt DB-preview shape → PostComment shape for CommentsSection.
  // Prefer post.comments (optimistic, parent-managed); fall back to DB-fetched preview.
  const displayComments = useMemo(() => {
    if (post.comments?.length) return post.comments;
    return previewComments.map(c => ({
      id: c.id, author_id: c.author_id, body: c.body, photo_url: c.photoUrl ?? null, created_at: c.created_at,
      pet: { name: c.petName, emoji: c.petEmoji, accent_color: c.petAccentColor, avatar_url: c.petAvatarUrl },
      author: null,
    }));
  }, [post.comments, previewComments]);

  const fullscreenMediaEnabled = true; // always on — detail page has no flag gate either
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerUrl, setMediaViewerUrl] = useState<string | null>(null);
  const [mediaViewerUrls, setMediaViewerUrls] = useState<string[]>([]);
  const [mediaViewerStartIndex, setMediaViewerStartIndex] = useState(0);
  const openViewer = (url: string, index?: number, allUrls?: string[]) => {
    setMediaViewerUrl(url);
    setMediaViewerUrls(allUrls && allUrls.length > 1 ? allUrls : []);
    setMediaViewerStartIndex(index ?? 0);
    setMediaViewerOpen(true);
  };

  const matchReason = (() => {
    if (!searchQuery?.trim()) return null;
    const q = searchQuery.toLowerCase();
    if (post.pet?.name?.toLowerCase().includes(q))    return `pet: ${post.pet.name}`;
    if (post.caption?.toLowerCase().includes(q)) {
      const cap = post.caption;
      return `caption: "${cap.slice(0, 40)}${cap.length > 40 ? '…' : ''}"`;
    }
    if (post.pet?.breed?.toLowerCase().includes(q))   return `breed: ${post.pet.breed}`;
    return null;
  })();
  const isFollowing = followedPetIds.has(post.pet?.id ?? '');
  const [localFollowing, setLocalFollowing] = useState<boolean | null>(null);
  const displayFollowing = localFollowing !== null ? localFollowing : isFollowing;
  const wasEdited = !!post.is_edited;

  const [captionExpanded, setCaptionExpanded] = useState(false);

  const likeScale = useRef(new Animated.Value(1)).current;
  const likeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLike = useCallback(() => {
    if (canLike === false) return;
    if (!post.liked) {
      Animated.sequence([
        Animated.spring(likeScale, { toValue: 1.45, useNativeDriver: true, tension: 300, friction: 5 }),
        Animated.spring(likeScale, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 7 }),
      ]).start();
    }
    if (likeDebounceRef.current) clearTimeout(likeDebounceRef.current);
    likeDebounceRef.current = setTimeout(() => { onLike(post.id); }, 300);
  }, [canLike, post.liked, post.id, onLike, likeScale]);

  return (
    <View style={[pc.card, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      {/* Header — matches PostDetailCard: avatar + name/meta stacked + follow/menu */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10 }}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/pet/[id]', params: { id: post.pet_id } } as any)}
          activeOpacity={0.8}>
          <View style={[pc.avatarRing, { borderColor: ac }]}>
            <EmojiAvatar emoji={post.pet?.emoji} name={post.pet?.name ?? '?'} size={40} color={ac} avatarUrl={post.pet?.avatar_url} />
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[pc.petName, { color: colors.textPrimary }]} numberOfLines={1}>
              {post.pet?.name ?? 'Pet'}
            </Text>
            {matchReason && (
              <View style={[pc.matchChip, { backgroundColor: `${ac}18`, borderColor: `${ac}30` }]}>
                <Text style={[pc.matchChipText, { color: ac }]}>{matchReason}</Text>
              </View>
            )}
          </View>
          {(post.pet?.breed || post.pet?.species) && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary ?? colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
              {[toTitle(post.pet.breed), toTitle(post.pet.species)].filter(Boolean).join(' · ')}
            </Text>
          )}
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
            {post.author?.handle ? `@${post.author.handle}` : 'Pet parent'}
            {' · '}{relTime(post.created_at)}{wasEdited ? ` · edited ${editedTime(post.edited_at ?? post.updated_at ?? post.created_at)}` : ''}
          </Text>
        </View>

        {isOwn ? (
          !isMockPost
            ? <TouchableOpacity onPress={() => onOpenMenu?.(post)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={pc.moreBtn}>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            : null
        ) : (
          <TouchableOpacity
            style={[pc.followBtn, displayFollowing
              ? { borderColor: colors.border, backgroundColor: 'transparent' }
              : { borderColor: ac, backgroundColor: ac }
            ]}
            onPress={() => {
              const petId = post.pet?.id;
              if (!petId) return;
              if (displayFollowing) {
                showAlert('Unfollow?', `Stop following ${post.pet?.name ?? 'this pet'}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Unfollow', style: 'destructive', onPress: () => { setLocalFollowing(false); onFollow(petId, true); } },
                ]);
              } else {
                setLocalFollowing(true);
                onFollow(petId, false);
              }
            }}>
            <Text style={[pc.followText, { color: displayFollowing ? colors.textSecondary : '#fff' }]}>
              {displayFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {(post.photo_url || post.photo_urls?.length || post.video_url || post.is_media_blocked) && (
        <View style={{ height: 8 }} />
      )}

      {post.is_media_blocked ? (
        <View style={[pc.mediaBanned, { backgroundColor: colors.border }]}>
          <Ionicons name="ban-outline" size={15} color={colors.textTertiary} />
          <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, fontWeight: '600' }}>Media removed by moderators</Text>
        </View>
      ) : post.media_type === 'video' && post.video_url ? (
        <View style={{ width: SW, overflow: 'hidden', marginBottom: 4 }}>
          <AutoplayVideo uri={post.video_url} id={post.id} globalMuted={globalMuted} onToggleMute={onToggleMute}
            onExpand={fullscreenMediaEnabled ? () => openViewer(post.video_url!) : undefined}
            onDoubleTap={!isOwn ? handleLike : undefined} />
        </View>
      ) : (post.photo_urls && post.photo_urls.length >= 1) || post.photo_url ? (
        <PostMedia
          photoUrl={post.photo_url}
          photoUrls={post.photo_urls}
          fitFrame={!!post.fit_frame}
          captionOverlay={!!post.caption_overlay}
          overlayCaption={post.overlay_caption}
          caption={post.caption}
          colors={colors}
          onPress={fullscreenMediaEnabled ? (url, index, urls) => openViewer(url, index, urls) : undefined}
          onDoubleTap={!isOwn ? handleLike : undefined}
        />
      ) : null}

      {fullscreenMediaEnabled && (
        <MediaViewer
          visible={mediaViewerOpen}
          mediaType={post.media_type === 'video' ? 'video' : 'photo'}
          uri={mediaViewerUrl ?? (post.media_type === 'video' ? post.video_url ?? null : post.photo_url)}
          urls={mediaViewerUrls.length > 1 ? mediaViewerUrls : undefined}
          startIndex={mediaViewerStartIndex}
          onClose={() => { setMediaViewerOpen(false); setMediaViewerUrl(null); setMediaViewerUrls([]); setMediaViewerStartIndex(0); }}
          onDoubleTap={!isOwn ? handleLike : undefined}
        />
      )}

      {/* Instagram-style caption: bold pet name + caption text below image */}
      {post.caption && !(post.caption_overlay && !post.overlay_caption && post.photo_url && !post.video_url) && (
        <TouchableOpacity activeOpacity={1} onPress={() => setCaptionExpanded(v => !v)}
          style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
          <Text style={{ fontSize: TYPO.body, lineHeight: 24, color: colors.textPrimary }} numberOfLines={captionExpanded ? 0 : 3}>
            <Text style={{ fontWeight: '800' }}>{post.pet?.name ?? 'Pet'} </Text>
            {post.caption}
          </Text>
          {!captionExpanded && post.caption.length > 120 && (
            <Text style={{ fontSize: TYPO.body, color: ac, marginTop: 3, fontWeight: '600' }}>more</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={pc.actions}>
            <TouchableOpacity
              style={pc.actionBtn}
              onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id, open_comments: '1' } } as any)}
              activeOpacity={0.65}>
              <View style={pc.actionInner}>
                <Ionicons name="chatbubble-outline" size={19} color={colors.textSecondary} />
                {post.comments_count > 0 && (
                  <Text style={[pc.actionCount, { color: colors.textSecondary }]}>
                    {post.comments_count}
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={pc.actionBtn}
              onPress={isOwn ? undefined : handleLike}
              activeOpacity={isOwn ? 1 : 0.65}
              disabled={isOwn}>
              <Animated.View style={[pc.actionInner, { transform: [{ scale: likeScale }] }]}>
                <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={19} color={post.liked ? colors.danger : colors.textSecondary} />
                {post.likes_count > 0 && (
                  <Text style={[pc.actionCount, { color: post.liked ? colors.danger : colors.textSecondary }]}>
                    {post.likes_count.toLocaleString()}
                  </Text>
                )}
              </Animated.View>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {!isMockPost && (
              <TouchableOpacity
                style={pc.actionBtn}
                onPress={() => router.push(`/post/${post.id}` as any)}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="expand-outline" size={19} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            {!isOwn && !isMockPost && !!myUserId && (() => {
              const hasReported = reportedPostIds?.has(post.id) ?? false;
              return (
                <TouchableOpacity
                  style={pc.actionBtn}
                  onPress={() => onReport?.(post)}
                  activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={hasReported ? 'flag' : 'flag-outline'} size={18} color={hasReported ? colors.danger : colors.textTertiary} />
                </TouchableOpacity>
              );
            })()}

            {!isMockPost && !!myUserId && (() => {
              const isPinned = pinnedPostIds?.has(post.id) ?? false;
              const handlePin = () => {
                if (isPinned) {
                  showAlert('Unpin post?', 'Remove this post from your pinned collection?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Unpin', style: 'destructive', onPress: () => onTogglePin?.(post.id) },
                  ]);
                } else {
                  onTogglePin?.(post.id);
                }
              };
              return (
                <TouchableOpacity
                  style={pc.actionBtn}
                  onPress={handlePin}
                  activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={isPinned ? 'bookmark' : 'bookmark-outline'} size={19} color={isPinned ? ac : colors.textSecondary} />
                </TouchableOpacity>
              );
            })()}
          </View>

          {/* Preview: latest 2 comments inline — only when 2+ exist (avoids double-render with CommentsSection below) */}
          {post.comments_count >= 2 && previewComments.length > 0 && (
            <View style={pc.previewComments}>
              {previewComments.map((c, idx) => {
                const isMe = c.author_id === myUserId;
                const petName    = isMe ? (myPet?.name  ?? 'You')           : c.petName;
                const petEmoji   = isMe ? myPet?.emoji                       : c.petEmoji;
                const petColor   = isMe ? (myPet?.accent_color ?? colors.primary) : (c.petAccentColor ?? colors.primary);
                const petAvatar  = isMe ? myPet?.avatar_url                  : c.petAvatarUrl;
                const ownerHandle = isMe ? (myProfile?.handle ?? null)        : (c.ownerHandle ?? null);
                return (
                  <React.Fragment key={c.id}>
                    {idx > 0 && <View style={[pc.previewDivider, { backgroundColor: colors.border }]} />}
                    <View style={pc.previewRow}>
                      <EmojiAvatar emoji={petEmoji} name={petName} size={26} color={petColor} avatarUrl={petAvatar} />
                      <View style={{ flex: 1 }}>
                        <Text style={[pc.previewAuthor, { color: colors.textPrimary }]}>
                          <Text style={{ color: petColor }}>{petName}</Text>
                          {ownerHandle ? <Text style={{ color: colors.textSecondary, fontWeight: '400', fontSize: TYPO.caption }}> @{ownerHandle}</Text> : null}
                          <Text style={{ color: colors.textSecondary, fontWeight: '400', fontSize: TYPO.caption }}> · {relTime(c.created_at)}</Text>
                        </Text>
                        {c.body ? (
                          <Text style={[pc.previewBody, { color: colors.textSecondary }]} numberOfLines={2}>{c.body}</Text>
                        ) : null}
                        {c.photoUrl ? (
                          <LazyImage uri={c.photoUrl} style={{ width: 56, height: 56, borderRadius: 8, marginTop: 3 }} resizeMode="cover" />
                        ) : null}
                      </View>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* View all — only shown when 2+ comments */}
          {post.comments_count >= 2 && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id, open_comments: '1' } } as any)}
              style={pc.viewComments}>
              <Text style={[pc.viewCommentsText, { color: colors.primaryText ?? colors.primary }]}>
                {`View all ${post.comments_count} comment${post.comments_count !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          )}

          {/* When < 2 comments: CommentsSection inline (handles both display + input, no double-render) */}
          {post.comments_count < 2 && canComment && (
            <View style={{ paddingHorizontal: 14 }}>
            <CommentsSection
              post={post}
              myPet={myPet}
              myProfile={myProfile}
              myUserId={myUserId}
              onAdd={handleAddComment}
              onCollapse={() => {}}
              colors={colors}
              canComment={canComment}
              showCollapseButton={false}
              preloadedComments={displayComments.length ? displayComments : undefined}
              onInputFocus={onCommentFocus}
            />
            </View>
          )}

          {/* When 2+ comments: inline "Add a comment" tap-to-open (re-fetch handled via handleAddComment in post detail) */}
          {post.comments_count >= 2 && canComment && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 8, paddingHorizontal: 14 }}>
              <EmojiAvatar emoji={myPet?.emoji} name={myPet?.name ?? 'Me'} size={30} color={myPet?.accent_color ?? colors.primary} avatarUrl={myPet?.avatar_url} />
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id, open_comments: '1' } } as any)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1,
                         borderColor: colors.inputBorder, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.inputBg }}>
                <Text style={{ color: colors.placeholder, fontSize: TYPO.body }}>Add a comment…</Text>
              </TouchableOpacity>
            </View>
          )}

    </View>
  );
}

export const PostCard = React.memo(PostCardBase);

// ── LocalSaveBtn ───────────────────────────────────────────────────────────────

function LocalSaveBtnBase({ postId, colors, ac }: { postId: string; colors: any; ac: string }) {
  const [saved, setSaved] = useState(false);
  const key = `saved:${postId}`;

  React.useEffect(() => {
    AsyncStorage.getItem(key).then(v => { if (v === 'true') setSaved(true); });
  }, [key]);

  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    if (next) {
      await AsyncStorage.setItem(key, 'true');
    } else {
      await AsyncStorage.removeItem(key);
    }
  };

  return (
    <TouchableOpacity onPress={toggle} style={{ padding: 6 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? ac : colors.textSecondary} />
    </TouchableOpacity>
  );
}

export const LocalSaveBtn = React.memo(LocalSaveBtnBase);

export const pc = StyleSheet.create({
  card:         { borderBottomWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingBottom: 4 },
  row:          { flexDirection: 'row', gap: 12, paddingHorizontal: 14 },
  leftCol:      { width: 50, alignItems: 'center' },
  rightCol:     { flex: 1, paddingBottom: 12 },
  avatarRing:   { width: 50, height: 50, borderRadius: 25, borderWidth: 2, padding: 2,
                  alignItems: 'center', justifyContent: 'center' },
  nameRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  petName:      { fontSize: TYPO.subheading, fontWeight: '800', letterSpacing: -0.2, flexShrink: 1 },
  handle:       { fontSize: TYPO.body, flexShrink: 1 },
  dot:          { fontSize: TYPO.body },
  time:         { fontSize: TYPO.body },
  matchChip:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  matchChipText:{ fontSize: TYPO.body, fontWeight: '700' },
  moreBtn:      { padding: 4, marginLeft: 4 },
  followBtn:    { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, borderWidth: 1.5, marginLeft: 6 },
  followText:   { fontSize: TYPO.body, fontWeight: '800' },
  captionBody:  { fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: 0.1, marginBottom: 10 },
  photo:        { width: SW, marginBottom: 4, overflow: 'hidden' },
  mediaBanned:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
                  paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  actions:      { flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 14, paddingBottom: 10, paddingHorizontal: 14 },
  actionBtn:    { padding: 4 },
  actionInner:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionCount:  { fontSize: TYPO.body, fontWeight: '600' },
  previewComments: { marginBottom: 6, gap: 0, paddingHorizontal: 14 },
  previewDivider:  { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  previewRow:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  previewAuthor:   { fontSize: 15, fontWeight: '800', letterSpacing: -0.2, marginBottom: 2 },
  previewBody:     { fontSize: 16, lineHeight: 23, fontWeight: '400', letterSpacing: 0.1 },
  viewComments:    { paddingVertical: 4, paddingBottom: 6, paddingHorizontal: 14 },
  viewCommentsText: { fontSize: TYPO.body, fontWeight: '500' },
});
