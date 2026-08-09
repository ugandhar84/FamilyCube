import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Pressable, Dimensions, Animated, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { router } from 'expo-router';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { MentionText } from '@/features/social/components/MentionComponents';

const { width: SW, height: SH } = Dimensions.get('window');

function PhotoViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Image source={{ uri }} style={{ width: SW, height: SH }} contentFit="contain" />
        <TouchableOpacity
          style={{ position: 'absolute', top: 52, right: 20, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: 6 }}
          onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
  );
}

function relTime(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return ''; }
}

export interface PostCommentItem {
  id: string;
  author_id: string;
  pet_id?: string | null;
  body: string;
  created_at: string;
  reply_to_comment_id?: string | null;
  photo_url?: string | null;
  likes_count?: number;
  liked?: boolean;
  author?: { full_name: string | null; handle?: string | null };
  pet?: { name: string; emoji: string; accent_color?: string; avatar_url?: string | null };
  replies?: PostCommentItem[];
}

interface PostCommentsListProps {
  comments: PostCommentItem[];
  commentsLoading: boolean;
  showComments: boolean;
  commentsCount: number;
  commentsHasMore?: boolean;
  onToggle: () => void;
  onLoadMore?: () => void;
  onDeleteComment?: (commentId: string) => void;
  ac: string;
  colors: any;
  onReply: (comment: PostCommentItem) => void;
  onLike?: (commentId: string, liked: boolean) => void;
  currentUserId?: string | null;
  focusCommentId?: string | null;
  scrollViewRef?: React.RefObject<any>;
  listOffsetY?: number;
  onLayout?: (e: any) => void;
}

export interface PostCommentsListHandle {
  scrollToComment: (commentId: string) => void;
}

function CommentRow({
  c, ac, colors, onReply, onLike, onDelete, isReply = false, currentUserId, highlighted = false, onLayout,
}: {
  c: PostCommentItem;
  ac: string;
  colors: any;
  onReply: (c: PostCommentItem) => void;
  onLike?: (commentId: string, liked: boolean) => void;
  onDelete?: (commentId: string) => void;
  isReply?: boolean;
  currentUserId?: string | null;
  highlighted?: boolean;
  onLayout?: (y: number) => void;
}) {
  const [liked, setLiked] = useState(!!c.liked);
  const [likesCount, setLikesCount] = useState(c.likes_count ?? 0);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const isOwnComment = !!currentUserId && c.author_id === currentUserId;

  const handleLongPress = () => {
    if (!isOwnComment || !onDelete) return;
    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(c.id) },
    ]);
  };
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!highlighted) return;
    // Flash highlight: fade in then out
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.delay(800),
      Animated.timing(flashAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
    ]).start();
  }, [highlighted]);

  const goToPet = c.pet_id
    ? () => router.push({ pathname: '/pet/[id]', params: { id: c.pet_id! } } as any)
    : undefined;
  const displayName = c.pet?.name ?? (c.author?.handle ? `@${c.author.handle}` : 'Pet parent');
  const ownerHandle = c.pet?.name && c.author?.handle ? c.author.handle : null;
  const accentColor = c.pet?.accent_color ?? ac;

  const handleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikesCount(n => Math.max(0, n + (next ? 1 : -1)));
    onLike?.(c.id, next);
  };

  const highlightColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', `${ac}22`],
  });

  return (
    <Animated.View
      style={[s.row, isReply && s.replyRow, { backgroundColor: highlightColor, borderRadius: 10 }]}
      onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}
      onStartShouldSetResponder={() => false}>
      {/* long-press to delete own comments */}
      {isOwnComment && onDelete && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onLongPress={handleLongPress}
          delayLongPress={500}
        />
      )}
      {isReply && <View style={[s.replyLine, { backgroundColor: colors.border }]} />}
      <TouchableOpacity onPress={goToPet} disabled={!goToPet} activeOpacity={0.75}>
        <EmojiAvatar
          emoji={c.pet?.emoji}
          name={c.author?.handle ?? c.pet?.name ?? '?'}
          size={isReply ? 26 : 30}
          color={accentColor}
          avatarUrl={c.pet?.avatar_url}
        />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={s.bubble}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
            <TouchableOpacity onPress={goToPet} disabled={!goToPet} activeOpacity={0.75}>
              <Text style={[s.name, { color: accentColor }]}>{displayName}</Text>
            </TouchableOpacity>
            {ownerHandle ? <Text style={[s.ownerHandle, { color: colors.textSecondary }]}>@{ownerHandle}</Text> : null}
            <Text style={[s.time, { color: colors.textSecondary }]}>{relTime(c.created_at)}</Text>
          </View>
          {!!c.body && <MentionText text={c.body} style={[s.body, { color: colors.textPrimary }]} />}
          {!!c.photo_url && (
            <TouchableOpacity onPress={() => setViewingPhoto(true)} activeOpacity={0.85}>
              <Image
                source={{ uri: c.photo_url }}
                style={s.commentPhoto}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </TouchableOpacity>
          )}
        </View>
        {viewingPhoto && c.photo_url && (
          <PhotoViewer uri={c.photo_url} onClose={() => setViewingPhoto(false)} />
        )}
        <View style={s.actions}>
          {!isReply && (
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => onReply(c)}
              activeOpacity={0.65}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="return-down-forward-outline" size={13} color={colors.textSecondary} />
              <Text style={[s.actionText, { color: colors.textSecondary }]}>Reply</Text>
            </TouchableOpacity>
          )}
          {!isOwnComment && (
            <TouchableOpacity
              style={s.actionBtn}
              onPress={handleLike}
              activeOpacity={0.65}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={13}
                color={liked ? '#E0525A' : colors.textSecondary}
              />
              {likesCount > 0 && (
                <Text style={[s.actionText, { color: liked ? '#E0525A' : colors.textSecondary }]}>
                  {likesCount}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const PostCommentsListBase = forwardRef<PostCommentsListHandle, PostCommentsListProps>(function PostCommentsListBase(
  { comments, commentsLoading, showComments, commentsCount, commentsHasMore, onToggle, onLoadMore, onDeleteComment, ac, colors, onReply, onLike, currentUserId, focusCommentId, scrollViewRef, listOffsetY = 0, onLayout },
  ref,
) {
  const topLevel = comments.filter(c => !c.reply_to_comment_id);
  const repliesMap: Record<string, PostCommentItem[]> = {};
  for (const c of comments) {
    if (c.reply_to_comment_id) {
      if (!repliesMap[c.reply_to_comment_id]) repliesMap[c.reply_to_comment_id] = [];
      repliesMap[c.reply_to_comment_id].push(c);
    }
  }

  // Which top-level comments have their replies expanded
  // Pre-expand the parent of focusCommentId if it's a reply
  const focusParentId = focusCommentId
    ? comments.find(c => c.id === focusCommentId)?.reply_to_comment_id ?? null
    : null;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    focusParentId ? new Set([focusParentId]) : new Set(),
  );

  // If focusCommentId arrives after mount (async nav), expand its parent
  useEffect(() => {
    if (focusParentId) setExpandedIds(prev => prev.has(focusParentId) ? prev : new Set([...prev, focusParentId]));
  }, [focusParentId]);

  const toggleReplies = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Track each comment's y offset within the list
  const commentOffsets = useRef<Record<string, number>>({});
  const setOffset = useCallback((id: string, y: number) => {
    commentOffsets.current[id] = y;
  }, []);

  const scrollToComment = useCallback((commentId: string) => {
    const y = commentOffsets.current[commentId];
    if (y == null || !scrollViewRef?.current) return;
    scrollViewRef.current.scrollTo({ y: listOffsetY + y, animated: true });
  }, [scrollViewRef, listOffsetY]);

  useImperativeHandle(ref, () => ({ scrollToComment }), [scrollToComment]);

  // Auto-scroll when focusCommentId is set and comments have loaded
  useEffect(() => {
    if (!focusCommentId || commentsLoading) return;
    const timer = setTimeout(() => scrollToComment(focusCommentId), 400);
    return () => clearTimeout(timer);
  }, [focusCommentId, commentsLoading, scrollToComment]);

  return (
    <View style={[s.card, { backgroundColor: colors.card }]} onLayout={onLayout}>
      <TouchableOpacity style={s.titleRow} onPress={onToggle} activeOpacity={0.7}>
        <Text style={[s.title, { color: colors.textPrimary }]}>
          Comments{commentsCount > 0 ? ` (${commentsCount})` : ''}
        </Text>
        <Ionicons name={showComments ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
      </TouchableOpacity>

      {showComments && (commentsLoading ? (
        <ActivityIndicator size="small" color={ac} style={{ marginVertical: 16 }} />
      ) : topLevel.length === 0 ? (
        <Text style={[s.empty, { color: colors.textSecondary }]}>
          No comments yet — be the first 🐾
        </Text>
      ) : (
        topLevel.map(c => {
          const replies = repliesMap[c.id] ?? [];
          const expanded = expandedIds.has(c.id);
          return (
            <View key={c.id}>
              <CommentRow
                c={c} ac={ac} colors={colors} onReply={onReply} onLike={onLike} onDelete={onDeleteComment} currentUserId={currentUserId}
                highlighted={focusCommentId === c.id}
                onLayout={(y) => setOffset(c.id, y)}
              />
              {replies.length > 0 && (
                <TouchableOpacity
                  onPress={() => toggleReplies(c.id)}
                  activeOpacity={0.7}
                  style={s.repliesToggle}>
                  <View style={[s.replyToggleLine, { backgroundColor: ac }]} />
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'return-down-forward'}
                    size={12}
                    color={ac}
                  />
                  <Text style={[s.repliesToggleText, { color: ac }]}>
                    {expanded ? 'Hide replies' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                  </Text>
                </TouchableOpacity>
              )}
              {expanded && replies.map(r => (
                <CommentRow
                  key={r.id} c={r} ac={ac} colors={colors} onReply={onReply} onLike={onLike} onDelete={onDeleteComment} isReply currentUserId={currentUserId}
                  highlighted={focusCommentId === r.id}
                  onLayout={(y) => setOffset(r.id, y)}
                />
              ))}
            </View>
          );
        })
      ))}

      {showComments && !commentsLoading && commentsHasMore && onLoadMore && (
        <TouchableOpacity
          onPress={onLoadMore}
          activeOpacity={0.7}
          style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: ac }}>Load more comments</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export const PostCommentsList = React.memo(PostCommentsListBase) as typeof PostCommentsListBase;

const s = StyleSheet.create({
  card:         { marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 14 },
  titleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:        { fontSize: TYPO.subheading, fontWeight: '700' },
  empty:        { fontSize: TYPO.body, textAlign: 'center', paddingVertical: 16 },
  row:          { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  replyRow:          { marginLeft: 38, marginBottom: 8 },
  replyLine:         { width: 2, borderRadius: 1, position: 'absolute', left: -20, top: 0, bottom: 0 },
  repliesToggle:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 38, marginBottom: 10, marginTop: -4 },
  replyToggleLine:   { width: 16, height: 1.5, borderRadius: 1, opacity: 0.5 },
  repliesToggleText: { fontSize: TYPO.caption, fontWeight: '700' },
  bubble:       { flex: 1 },
  name:         { fontSize: TYPO.body, fontWeight: '700', letterSpacing: -0.1 },
  ownerHandle:  { fontSize: TYPO.caption, fontWeight: '500' },
  time:         { fontSize: TYPO.caption },
  body:         { fontSize: TYPO.body, marginTop: 3, lineHeight: 23, letterSpacing: 0.05 },
  commentPhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, marginTop: 8 },
  actions:      { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 5, marginLeft: 4 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText:   { fontSize: TYPO.caption, fontWeight: '600' },
});
