import React, { useState, useRef, useCallback } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  Animated, Dimensions, ScrollView, ActivityIndicator, Share,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { toTitle } from '@/lib/format';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { PostVideoPlayer } from '@/features/social/components/PostVideoPlayer';
import { PhotoGrid, PostMedia } from '@/features/social/components/MediaComponents';
import { supabase } from '@/lib/supabase';

const { width: SW } = Dimensions.get('window');

function relTime(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
}

export interface PostDetailData {
  id: string;
  pet_id: string;
  author_id: string;
  caption: string | null;
  photo_url: string | null;
  photo_urls?: string[] | null;
  media_type?: 'photo' | 'video' | null;
  video_url?: string | null;
  is_media_blocked?: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  is_edited?: boolean;
  pet?: {
    id?: string;
    name: string;
    emoji: string;
    accent_color?: string;
    avatar_url?: string | null;
    owner_id?: string;
    species?: string;
    breed?: string;
    dob?: string;
    city?: string;
  };
  author?: { full_name: string | null; handle?: string | null };
  liked: boolean;
  reaction?: string | null;
  owner_tier?: string;
  caption_overlay?: boolean;
  overlay_caption?: string | null;
  fit_frame?: boolean;
}

interface PostDetailCardProps {
  post: PostDetailData;
  ac: string;
  isOwn: boolean;
  colors: any;
  isDark: boolean;
  showComments: boolean;
  onToggleComments: () => void;
  toggleLike: () => void;
  onReact: (emoji: string) => void;
  likeScale: Animated.Value;
  reported: boolean;
  onReport: () => void;
  onUnreport: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  viewerUrls: string[];
  viewerIndex: number;
  onOpenViewer: (urls: string[], index: number) => void;
  onCloseViewer: () => void;
  userId?: string;
  following?: boolean;
  onFollow?: () => void;
}

const REACTIONS = ['❤️', '🐾', '🦴', '😂', '🐕', '😢'];

// ── Hero media with gradient caption overlay ──────────────────────────────────
function HeroMedia({
  post, ac, isOwn, colors, toggleLike, onOpenViewer,
}: { post: PostDetailData; ac: string; isOwn: boolean; colors: any; toggleLike: () => void; onOpenViewer: (urls: string[], index: number) => void }) {
  const [ratio, setRatio] = useState(1);
  const clampedRatio = Math.min(Math.max(ratio, 3 / 4), 1.91);

  // Double-tap detection for single-photo view
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleLastTap  = useRef(0);
  const handleSinglePhotoTap = () => {
    const now = Date.now();
    if (singleTapTimer.current && now - singleLastTap.current < 400) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
      if (!isOwn) toggleLike();
    } else {
      singleLastTap.current = now;
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        onOpenViewer([post.photo_url!], 0);
      }, 400);
    }
  };

  if (post.is_media_blocked) {
    return (
      <View style={[s.mediaBanned, { backgroundColor: colors.inputBg }]}>
        <Ionicons name="ban-outline" size={18} color={colors.textTertiary} />
        <Text style={{ color: colors.textTertiary, fontSize: TYPO.body, fontWeight: '600' }}>Media removed by moderators</Text>
      </View>
    );
  }

  if (post.media_type === 'video' && post.video_url) {
    return (
      <View style={{ width: SW, aspectRatio: clampedRatio }}>
        <PostVideoPlayer uri={post.video_url} onDoubleTap={!isOwn ? toggleLike : undefined} />
        {!!post.caption_overlay && !!(post.overlay_caption || post.caption) && (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.72)']}
            style={s.captionGrad}
            pointerEvents="none">
            <Text style={s.captionOverlay} numberOfLines={3}>{post.overlay_caption || post.caption}</Text>
          </LinearGradient>
        )}
      </View>
    );
  }

  if ((post.photo_urls && post.photo_urls.length > 1) || post.photo_url) {
    return (
      <PostMedia
        photoUrl={post.photo_url}
        photoUrls={post.photo_urls}
        fitFrame={!!post.fit_frame}
        captionOverlay={!!post.caption_overlay}
        overlayCaption={post.overlay_caption}
        caption={post.caption}
        colors={colors}
        onPress={(url, index, urls) => onOpenViewer(urls ?? [url], index ?? 0)}
        onDoubleTap={!isOwn ? toggleLike : undefined}
      />
    );
  }

  return null;
}

// ── Reaction picker ───────────────────────────────────────────────────────────
function ReactionPicker({
  visible, ac, current, onPick, onClose,
}: { visible: boolean; ac: string; current?: string | null; onPick: (e: string) => void; onClose: () => void }) {
  if (!visible) return null;
  return (
    <>
      <TouchableOpacity
        style={{ position: 'absolute', top: -800, left: -800, right: -800, bottom: -800 }}
        activeOpacity={0}
        onPress={onClose}
      />
      <View style={s.reactionPicker}>
        {REACTIONS.map(r => (
          <TouchableOpacity
            key={r}
            onPress={() => { onPick(r); onClose(); }}
            style={[s.reactionBtn, current === r && { backgroundColor: ac + '33', borderRadius: 20 }]}>
            <Text style={{ fontSize: TYPO.hero }}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

// ── Pet quick-peek sheet ──────────────────────────────────────────────────────
function PetPeekSheet({
  visible, pet, ac, colors, onClose, following, onFollow,
}: { visible: boolean; pet: PostDetailData['pet']; ac: string; colors: any; onClose: () => void; following?: boolean; onFollow?: () => void }) {
  const [morePosts, setMorePosts] = useState<any[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  React.useEffect(() => {
    if (!visible || !pet) return;
    setLoadingMore(true);
    supabase.from('social_posts')
      .select('id, photo_url, media_type, video_url, caption')
      .eq('pet_id', (pet as any).id ?? '')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => { setMorePosts(data ?? []); setLoadingMore(false); });
  }, [visible, (pet as any)?.id]);

  if (!visible || !pet) return null;

  const age = (() => {
    const dob = (pet as any).dob;
    if (!dob) return null;
    const months = (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (months < 12) return `${Math.round(months)}mo`;
    return `${Math.floor(months / 12)}y`;
  })();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: colors.card }]}>
        <View style={s.sheetHandle} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <EmojiAvatar emoji={pet.emoji} name={pet.name} size={56} color={ac} avatarUrl={pet.avatar_url} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary }}>{pet.name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
              {(pet as any).species && (
                <View style={[s.pill, { backgroundColor: ac + '22' }]}>
                  <Text style={{ fontSize: TYPO.caption, color: ac, fontWeight: '600' }}>{(pet as any).species}</Text>
                </View>
              )}
              {(pet as any).breed && (
                <View style={[s.pill, { backgroundColor: colors.inputBg }]}>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{(pet as any).breed}</Text>
                </View>
              )}
              {age && (
                <View style={[s.pill, { backgroundColor: colors.inputBg }]}>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{age} old</Text>
                </View>
              )}
              {(pet as any).city && (
                <View style={[s.pill, { backgroundColor: colors.inputBg }]}>
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>📍 {(pet as any).city}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ gap: 6, alignItems: 'flex-end' }}>
            {!!onFollow && (
              <TouchableOpacity
                onPress={onFollow}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5,
                  borderColor: following ? colors.border : ac,
                  backgroundColor: following ? 'transparent' : ac }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: following ? colors.textSecondary : '#fff' }}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.viewProfileBtn, { backgroundColor: ac + '22', borderWidth: 1, borderColor: ac }]}
              onPress={() => { onClose(); router.push({ pathname: '/pet/[id]', params: { id: (pet as any).id } } as any); }}>
              <Text style={{ color: ac, fontSize: TYPO.caption, fontWeight: '700' }}>Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 10, letterSpacing: 0.5 }}>
          MORE FROM {pet.name.toUpperCase()}
        </Text>

        {loadingMore ? (
          <ActivityIndicator color={ac} style={{ marginVertical: 20 }} />
        ) : morePosts.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, textAlign: 'center', paddingVertical: 16 }}>No posts yet</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {morePosts.map(p => (
              <TouchableOpacity
                key={p.id}
                onPress={() => { onClose(); router.push({ pathname: '/post/[id]', params: { id: p.id } } as any); }}
                activeOpacity={0.8}>
                <View style={s.moreThumbnail}>
                  {p.photo_url
                    ? <Image source={{ uri: p.photo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inputBg }}>
                        <Ionicons name="film-outline" size={22} color={colors.textSecondary} />
                      </View>
                  }
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Full-screen immersive viewer ──────────────────────────────────────────────
function ImmersiveViewer({
  urls, startIndex, onClose,
}: { urls: string[]; startIndex: number; onClose: () => void }) {
  const [page, setPage] = useState(startIndex);

  React.useEffect(() => { setPage(startIndex); }, [startIndex]);

  const visible = urls.length > 0;
  const url = urls[page] ?? urls[0];

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Image — no ScrollView, no gesture recognizers */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={{ uri: url }}
            style={{ width: SW, height: '100%' }}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        </View>

        {/* Left / right tap zones for multi-image navigation */}
        {urls.length > 1 && (
          <>
            <TouchableOpacity
              onPress={() => setPage(p => Math.max(0, p - 1))}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: SW * 0.35 }}
              activeOpacity={1}
            />
            <TouchableOpacity
              onPress={() => setPage(p => Math.min(urls.length - 1, p + 1))}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: SW * 0.35 }}
              activeOpacity={1}
            />
          </>
        )}

        {/* Close button */}
        <TouchableOpacity
          onPress={onClose}
          style={{ position: 'absolute', top: 54, left: 16, width: 38, height: 38,
            borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Counter top-right */}
        {urls.length > 1 && (
          <View style={{ position: 'absolute', top: 54, right: 16,
            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '600' }}>{page + 1} / {urls.length}</Text>
          </View>
        )}

        {/* Dot indicators */}
        {urls.length > 1 && (
          <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {urls.map((_, i) => (
              <View key={i} style={{
                width: i === page ? 18 : 6, height: 6, borderRadius: 3,
                backgroundColor: i === page ? '#fff' : 'rgba(255,255,255,0.4)',
              }} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
function PostDetailCardBase({
  post, ac, isOwn, colors, isDark, showComments, onToggleComments,
  toggleLike, onReact, likeScale, reported, onReport, onUnreport, pinned, onTogglePin,
  viewerUrls, viewerIndex, onOpenViewer, onCloseViewer, userId,
  following, onFollow,
}: PostDetailCardProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [showPeek, setShowPeek] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLikePressIn = useCallback(() => {
    longPressTimer.current = setTimeout(() => setShowReactions(true), 420);
  }, []);
  const handleLikePressOut = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);
  const handleLikeTap = useCallback(() => {
    if (showReactions) return;
    toggleLike();
  }, [showReactions, toggleLike]);

  const currentReaction = post.reaction ?? null;
  const hasMedia = !!(post.photo_url || (post.photo_urls && post.photo_urls.length > 0) || post.video_url);

  return (
    <View style={{ backgroundColor: colors.background }}>
      {/* Pet header — outside card padding so it aligns with screen edge content */}
      <View style={[s.header, { paddingHorizontal: 16 }]}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
          activeOpacity={0.75}
          onPress={() => setShowPeek(true)}>
          <View style={[s.avatarRing, { borderColor: ac }]}>
            <EmojiAvatar emoji={post.pet?.emoji} name={post.pet?.name ?? '?'} size={40} color={ac} avatarUrl={post.pet?.avatar_url} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[s.petName, { color: colors.textPrimary }]}>{post.pet?.name ?? 'Pet'}</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.textSecondary} />
            </View>
            {(post.pet?.breed || post.pet?.species) && (
              <Text style={{ fontSize: TYPO.label, color: colors.textTertiary ?? colors.textSecondary, marginBottom: 1 }}>
                {[toTitle(post.pet.breed), toTitle(post.pet.species)].filter(Boolean).join(' · ')}
              </Text>
            )}
            <Text style={[s.meta, { color: colors.textSecondary }]}>
              {post.author?.handle ? `@${post.author.handle}` : 'Pet parent'}
              {' · '}{relTime(post.created_at)}{post.is_edited ? ' · edited' : ''}
            </Text>
          </View>
        </TouchableOpacity>
        {!isOwn && !!onFollow && (
          <TouchableOpacity
            onPress={onFollow}
            style={{
              paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5,
              borderColor: following ? colors.border : ac,
              backgroundColor: following ? 'transparent' : ac,
            }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: following ? colors.textSecondary : '#fff' }}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Caption above media when no media — truncate at 5 lines with expand */}
      {!hasMedia && !!post.caption && (
        captionExpanded ? (
          <TouchableOpacity activeOpacity={1} onPress={() => setCaptionExpanded(false)} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Text style={[s.captionStandalone, { color: colors.textPrimary, paddingHorizontal: 0, paddingBottom: 0 }]}>{post.caption}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity activeOpacity={1} onPress={() => post.caption!.length > 200 && setCaptionExpanded(true)} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Text style={[s.captionStandalone, { color: colors.textPrimary, paddingHorizontal: 0, paddingBottom: 0 }]} numberOfLines={5}>{post.caption}</Text>
            {post.caption.length > 200 && (
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>more</Text>
            )}
          </TouchableOpacity>
        )
      )}

      {/* Full-bleed hero media */}
      {hasMedia && (
        <View style={{ marginTop: 10 }}>
          <HeroMedia post={post} ac={ac} isOwn={isOwn} colors={colors} toggleLike={toggleLike} onOpenViewer={onOpenViewer} />
        </View>
      )}

      {/* Actions row */}
      <View style={[s.actions, { paddingHorizontal: 16 }]}>
        <View style={s.actionBtn}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
            {post.comments_count > 0 && <Text style={[s.actionCount, { color: colors.textSecondary }]}>{post.comments_count}</Text>}
          </View>
        </View>

        {/* Like with long-press for reactions */}
        <View>
          <TouchableOpacity
            style={s.actionBtn}
            onPressIn={!isOwn ? handleLikePressIn : undefined}
            onPressOut={!isOwn ? handleLikePressOut : undefined}
            onPress={!isOwn ? handleLikeTap : undefined}
            disabled={isOwn}
            activeOpacity={0.65}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                {currentReaction
                  ? <Text style={{ fontSize: TYPO.title }}>{currentReaction}</Text>
                  : <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={21} color={post.liked ? colors.danger : colors.textSecondary} />
                }
              </Animated.View>
              {post.likes_count > 0 && (
                <Text style={[s.actionCount, { color: post.liked ? colors.danger : colors.textSecondary }]}>{post.likes_count}</Text>
              )}
            </View>
          </TouchableOpacity>
          <ReactionPicker
            visible={showReactions}
            ac={ac}
            current={currentReaction}
            onPick={onReact}
            onClose={() => setShowReactions(false)}
          />
        </View>

        <TouchableOpacity
          style={s.actionBtn}
          activeOpacity={0.65}
          onPress={() => {
            const petName = post.pet?.name ?? 'a pet';
            const caption = post.caption ? ` — "${post.caption.slice(0, 80)}"` : '';
            Share.share({ message: `Check out ${petName} on PawBond!${caption}` }).catch(() => {});
          }}>
          <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {!isOwn && !!userId && (
          <TouchableOpacity
            style={s.actionBtn}
            onPress={reported ? onUnreport : onReport}
            activeOpacity={0.65}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={reported ? 'flag' : 'flag-outline'} size={19} color={reported ? colors.danger : colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.actionBtn} onPress={onTogglePin} activeOpacity={0.65}>
          <Ionicons name={pinned ? 'bookmark' : 'bookmark-outline'} size={20} color={pinned ? ac : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={[s.divider, { backgroundColor: colors.border }]} />

      {/* Pet peek sheet */}
      <PetPeekSheet
        visible={showPeek}
        pet={post.pet as any}
        ac={ac}
        colors={colors}
        onClose={() => setShowPeek(false)}
        following={following}
        onFollow={!isOwn ? onFollow : undefined}
      />

      {/* Immersive fullscreen viewer */}
      <ImmersiveViewer urls={viewerUrls} startIndex={viewerIndex} onClose={onCloseViewer} />
    </View>
  );
}

export const PostDetailCard = React.memo(PostDetailCardBase);

const s = StyleSheet.create({
  header:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  avatarRing:       { width: 48, height: 48, borderRadius: 24, borderWidth: 2, padding: 2, alignItems: 'center', justifyContent: 'center' },
  petName:          { fontSize: TYPO.subheading, fontWeight: '800', letterSpacing: -0.2 },
  meta:             { fontSize: TYPO.caption, marginTop: 1 },
  captionStandalone:{ fontSize: TYPO.subheading, lineHeight: 25, paddingHorizontal: 16, paddingBottom: 12 },
  captionGrad:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16 },
  captionOverlay:   { color: '#fff', fontSize: TYPO.body, lineHeight: 22, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  captionBelow:     { fontSize: TYPO.body, lineHeight: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  expandHint:       { position: 'absolute', top: 12, right: 12 },
  mediaBanned:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
  actions:          { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 10 },
  actionBtn:        { padding: 4 },
  actionCount:      { fontSize: TYPO.body, fontWeight: '600' },
  divider:          { height: StyleSheet.hairlineWidth, marginHorizontal: 0 },
  reactionPicker:   { position: 'absolute', bottom: 44, left: -8, flexDirection: 'row', gap: 4, backgroundColor: 'rgba(30,30,30,0.96)', borderRadius: 32, paddingHorizontal: 10, paddingVertical: 8, zIndex: 99 },
  reactionBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:            { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, minHeight: 300 },
  sheetHandle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: '#888', alignSelf: 'center', marginBottom: 20 },
  pill:             { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  viewProfileBtn:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  moreThumbnail:    { width: 90, height: 90, borderRadius: 10, overflow: 'hidden', backgroundColor: '#333' },
});
