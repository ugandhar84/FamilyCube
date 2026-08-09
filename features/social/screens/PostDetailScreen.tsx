import { showAlert } from '@/components/AppAlert';
import { TYPO } from '@/constants/theme';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Platform, Keyboard, Animated, KeyboardAvoidingView, NativeSyntheticEvent, NativeScrollEvent, Modal, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import BackButton from '@/components/BackButton';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { deletePost } from '@/lib/db';
import { followPet, unfollowPet } from '@/lib/db/follows';
import { containsProfanity } from '@/lib/profanityFilter';
import ActionSheet from '@/components/ActionSheet';
import { PostDetailCard, PostDetailData } from '@/features/social/components/PostDetailCard';
import { PostCommentsList, PostCommentItem, PostCommentsListHandle } from '@/features/social/components/PostCommentsList';
import { PostCommentInput, ReplyingTo } from '@/features/social/components/PostCommentInput';

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const { id, open_comments, focus_comment_id } = useLocalSearchParams<{ id: string; open_comments?: string; focus_comment_id?: string }>();
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const { user } = useAuthStore();
  const profile = useAuthStore(s => s.profile);
  const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
  const pet = activePet() as any;

  const [post, setPost]           = useState<PostDetailData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [retryCount, setRetryCount]   = useState(0);
  const [comments, setComments]   = useState<PostCommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [draft, setDraft]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);
  const [showMenu, setShowMenu]       = useState(false);
  const [viewerUrls, setViewerUrls]   = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [pinned, setPinned]       = useState(false);
  const [reported, setReported]   = useState(false);
  const [reaction, setReaction]   = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [editCaptionVisible, setEditCaptionVisible] = useState(false);
  const [editCaptionDraft, setEditCaptionDraft]     = useState('');

  const inputRef        = useRef<TextInput>(null);
  const scrollRef       = useRef<ScrollView>(null);
  const commentsListRef = useRef<PostCommentsListHandle>(null);
  const [listOffsetY, setListOffsetY] = useState(0);
  const likeScale  = useRef(new Animated.Value(1)).current;
  const likingRef  = useRef(false);
  const [showGoTop, setShowGoTop] = useState(false);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsHasMore, setCommentsHasMore] = useState(false);

  const ac = post?.pet?.accent_color ?? pet?.accent_color ?? '#7C5CBF';
  const isOwn = post?.author_id === user?.id;

  // ── Pin ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id || !id) return;
    supabase.from('post_pins').select('post_id').eq('user_id', user.id).eq('post_id', id).maybeSingle()
      .then(({ data }) => { if (data) setPinned(true); });
  }, [user?.id, id]);

  const togglePin = () => {
    if (!user?.id || !id) return;
    if (pinned) {
      showAlert('Unpin post?', 'Remove this post from your pinned collection?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpin', style: 'destructive', onPress: async () => {
          await supabase.from('post_pins').delete().eq('user_id', user.id).eq('post_id', id);
          setPinned(false);
        }},
      ]);
    } else {
      supabase.from('post_pins').upsert({ user_id: user.id, post_id: id }, { onConflict: 'user_id,post_id' });
      setPinned(true);
    }
  };

  // ── Report ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id || !id) return;
    supabase.from('post_reports').select('id').eq('post_id', id).eq('reporter_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setReported(true); });
  }, [user?.id, id]);

  // ── Follow ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!pet?.id || !post?.pet_id) return;
    supabase.from('pet_follows').select('id').eq('follower_pet_id', pet.id).eq('following_pet_id', post.pet_id).maybeSingle()
      .then(({ data }) => { if (data) setFollowing(true); });
  }, [pet?.id, post?.pet_id]);

  const handleFollow = useCallback(async () => {
    if (!pet?.id || !post?.pet_id) return;
    if (following) {
      showAlert('Unfollow?', `Stop following ${post.pet?.name ?? 'this pet'}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unfollow', style: 'destructive', onPress: async () => {
          setFollowing(false);
          try { await unfollowPet(pet.id, post.pet_id); } catch { setFollowing(true); }
        }},
      ]);
    } else {
      setFollowing(true);
      await followPet(pet.id, post.pet_id);
    }
  }, [pet?.id, post?.pet_id, post?.pet?.name, post?.pet?.owner_id, following]);

  const submitReport = useCallback(async (reason: string) => {
    if (!post || !user?.id) return;
    try {
      await supabase.from('post_reports').insert({ post_id: post.id, reporter_id: user.id, reason });
      const { count } = await supabase.from('post_reports').select('*', { count: 'exact', head: true }).eq('post_id', post.id);
      if ((count ?? 0) >= 50) await supabase.from('social_posts').update({ is_flagged: true }).eq('id', post.id);
    } catch {
      // transient error — do not flag the post; the report insert may have failed
    }
    setReported(true);
    showAlert('Reported', 'Thank you — our team will review this post.');
  }, [post, user?.id]);

  const handleUnreport = useCallback(() => {
    if (!post || !user?.id) return;
    showAlert('Remove report?', 'This will withdraw your report on this post.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await supabase.from('post_reports').delete().eq('post_id', post.id).eq('reporter_id', user.id);
        setReported(false);
      }},
    ]);
  }, [post, user?.id]);

  const handleReport = useCallback(() => {
    if (!post) return;
    showAlert(
      'Report this post?',
      'Help us keep PawBond safe. Reports are anonymous and reviewed by our team.',
      [
        {
          text: 'Report', style: 'destructive',
          onPress: () => {
            if (Platform.OS === 'ios') {
              const { ActionSheetIOS } = require('react-native');
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Why are you reporting this?', options: ['Cancel', 'Spam', 'Inappropriate', 'Misinformation', 'Harassment'], cancelButtonIndex: 0, destructiveButtonIndex: [1, 2, 3, 4] },
                (i: number) => {
                  if (i === 1) submitReport('spam');
                  else if (i === 2) submitReport('inappropriate');
                  else if (i === 3) submitReport('misinformation');
                  else if (i === 4) submitReport('harassment');
                },
              );
            } else {
              showAlert('Why are you reporting this?', '', [
                { text: 'Spam', onPress: () => submitReport('spam') },
                { text: 'Inappropriate', onPress: () => submitReport('inappropriate') },
                { text: 'Misinformation', onPress: () => submitReport('misinformation') },
                { text: 'Harassment', onPress: () => submitReport('harassment') },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [post, submitReport]);

  // ── Fetch post ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    setNotFound(false);
    setFetchFailed(false);
    (async () => {
      setLoading(true);
      const idStr = Array.isArray(id) ? id[0] : id;
      const { data, error: fetchError } = await supabase
        .from('social_posts')
        .select(`
          id, pet_id, author_id, caption, overlay_caption, photo_url, photo_urls, media_type, video_url, is_media_blocked,
          likes_count, comments_count, created_at, is_edited, caption_overlay, fit_frame,
          pets ( id, name, emoji, accent_color, avatar_url, owner_id, species, breed ),
          author:profiles ( full_name, handle )
        `)
        .eq('id', idStr)
        .maybeSingle();
      if (fetchError) { setFetchFailed(true); setLoading(false); return; }
      if (!data) { setNotFound(true); setLoading(false); return; }
      let liked = false;
      if (user?.id) {
        const { data: likeRow } = await supabase.from('post_likes').select('id').eq('post_id', id).eq('user_id', user.id).maybeSingle();
        liked = !!likeRow;
      }
      const { data: sub } = (data as any).pets?.owner_id
        ? await supabase.from('subscriptions').select('tier').eq('user_id', (data as any).pets.owner_id).maybeSingle()
        : { data: null };
      setPost({ ...(data as any), pet: (data as any).pets, author: (data as any).author, owner_tier: (sub as any)?.tier ?? 'free', liked });
      setLoading(false);
    })();
  }, [id, user?.id, retryCount]);

  // ── Fetch comments ───────────────────────────────────────────────────────────

  const PAGE_SIZE = 50;

  const loadComments = useCallback(async (page = 1) => {
    if (!id) return;
    setCommentsLoading(true);
    const { data: rows, error } = await supabase
      .from('post_comments')
      .select('id, post_id, author_id, pet_id, body, created_at, reply_to_comment_id, photo_url, likes_count')
      .eq('post_id', id).order('created_at', { ascending: true })
      .range(0, page * PAGE_SIZE - 1);
    if (error) { setCommentsLoading(false); return; }
    const authorIds = [...new Set((rows ?? []).map((c: any) => c.author_id).filter(Boolean))];
    const petIds    = [...new Set((rows ?? []).map((c: any) => c.pet_id).filter(Boolean))];
    // Fetch which comments the current user has liked
    const likedSet = new Set<string>();
    if (user?.id && (rows ?? []).length) {
      const commentIds = (rows ?? []).map((c: any) => c.id);
      const { data: likes } = await supabase.from('comment_likes').select('comment_id')
        .eq('user_id', user.id).in('comment_id', commentIds);
      (likes ?? []).forEach((l: any) => likedSet.add(l.comment_id));
    }
    const [profileRes, petRes] = await Promise.all([
      authorIds.length ? supabase.from('profiles').select('id, full_name, handle, avatar_url').in('id', authorIds) : { data: [] },
      petIds.length    ? supabase.from('pets').select('id, name, emoji, accent_color, avatar_url').in('id', petIds) : { data: [] },
    ]);
    const profileMap = Object.fromEntries((profileRes.data ?? []).map((p: any) => [p.id, p]));
    const petMap     = Object.fromEntries((petRes.data    ?? []).map((p: any) => [p.id, p]));
    setComments((rows ?? []).map((c: any) => ({
      ...c,
      liked: likedSet.has(c.id),
      author: profileMap[c.author_id] ?? null,
      pet: petMap[c.pet_id] ?? null,
    })));
    setCommentsHasMore((rows ?? []).length >= page * PAGE_SIZE);
    setCommentsLoading(false);
  }, [id, user?.id]);

  useEffect(() => { if (post) { setCommentsPage(1); loadComments(1); } }, [post?.id]);

  // ── Like ─────────────────────────────────────────────────────────────────────

  const handleReact = useCallback((emoji: string) => {
    if (!post || !user?.id) return;
    const same = reaction === emoji;
    setReaction(same ? null : emoji);
    if (!post.liked && !same) {
      setPost(p => p ? { ...p, liked: true, likes_count: p.likes_count + 1 } : p);
      Promise.resolve(supabase.rpc('increment_post_likes', { p_post_id: post.id, p_delta: 1 })).catch(() => {});
    }
    if (same && post.liked) {
      setPost(p => p ? { ...p, liked: false, likes_count: Math.max(0, p.likes_count - 1) } : p);
      Promise.resolve(supabase.rpc('increment_post_likes', { p_post_id: post.id, p_delta: -1 })).catch(() => {});
    }
  }, [post, user?.id, reaction]);

  const toggleLike = useCallback(() => {
    if (!post || !user?.id) return;
    if (isOwn) return;
    if (likingRef.current) return; // already in-flight
    likingRef.current = true;
    const liked = !post.liked;
    if (liked) {
      Animated.sequence([
        Animated.spring(likeScale, { toValue: 1.45, useNativeDriver: true, tension: 300, friction: 5 }),
        Animated.spring(likeScale, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 7 }),
      ]).start();
    }
    setPost(p => p ? { ...p, liked, likes_count: Math.max(0, p.likes_count + (liked ? 1 : -1)) } : p);
    const authorId = post.author_id;
    const dedupKey = `like:${post.id}:${user.id}`;
    Promise.resolve(supabase.rpc('increment_post_likes', { p_post_id: post.id, p_delta: liked ? 1 : -1 }))
      .then(() => {})
      .finally(() => { likingRef.current = false; });
    if (!authorId) return;
    if (liked && pet?.name && authorId !== user.id) {
      const likeTitle = `${pet.emoji ?? '🐾'} ${pet.name} liked your post`;
      const likeBody  = post.caption ? post.caption.slice(0, 80) : 'Tap to see the post';
      supabase.functions.invoke('playdates', {
        body: { action: 'notify', user_id: authorId, title: likeTitle, body: likeBody,
          type: 'post_like', dedup_key: dedupKey,
          data: { type: 'post_like', post_id: post.id, actor_user_id: user.id, actor_pet_id: pet.id, actor_name: pet.name, actor_emoji: pet.emoji, actor_owner_handle: profile?.handle ?? null },
        },
      }).catch(() => {});
    } else if (!liked) {
      Promise.resolve(supabase.rpc('delete_notification_by_dedup', { p_user_id: authorId, p_dedup_key: dedupKey })).catch(() => {});
    }
  }, [post, user?.id, pet, isOwn, profile?.handle]);

  // ── Submit comment ───────────────────────────────────────────────────────────

  const submitComment = useCallback(async (photoUri?: string | null) => {
    const text = draft.trim();
    if ((!text && !photoUri) || submitting || !post || !user?.id) return;
    if (text && containsProfanity(text)) { showAlert('Keep it friendly 🐾', 'Your comment contains language that isn\'t allowed.'); return; }
    const currentReply = replyingTo;
    const savedDraft = text;
    setReplyingTo(null);
    Keyboard.dismiss();
    setSubmitting(true);
    // Upload photo if attached
    let uploadedPhotoUrl: string | null = null;
    if (photoUri) {
      try {
        const { uploadCommentPhoto } = require('@/lib/supabase');
        uploadedPhotoUrl = await uploadCommentPhoto(user.id, photoUri);
      } catch { /* photo upload failed — submit comment without it */ }
    }
    const localId = `lc_${Date.now()}`;
    const optimistic: PostCommentItem = {
      id: localId, author_id: user.id, body: text, created_at: new Date().toISOString(),
      reply_to_comment_id: currentReply?.commentId ?? null,
      photo_url: photoUri ?? null,
      likes_count: 0,
      author: { full_name: profile?.full_name ?? 'You', handle: (profile as any)?.handle ?? null },
      pet: pet ? { name: pet.name, emoji: pet.emoji, accent_color: pet.accent_color, avatar_url: pet.avatar_url } : undefined,
    };
    setComments(prev => [...prev, optimistic]);
    setPost(p => p ? { ...p, comments_count: p.comments_count + 1 } : p);
    scrollRef.current?.scrollToEnd({ animated: true });
    try {
      const { data: inserted, error } = await supabase
        .from('post_comments')
        .insert({ post_id: post.id, author_id: user.id, pet_id: pet?.id ?? null, body: text || ' ', reply_to_comment_id: currentReply?.commentId ?? null, photo_url: uploadedPhotoUrl })
        .select('id').single();
      if (error) throw error;
      setDraft('');
      setComments(prev => prev.map(c => c.id === localId ? { ...c, id: inserted.id, photo_url: uploadedPhotoUrl } : c));
      if (pet?.name) {
        const cmtBody = text.slice(0, 100);
        const actorData = { type: 'post_comment', post_id: post.id, comment_id: inserted.id, actor_pet_id: pet.id, actor_name: pet.name, actor_emoji: pet.emoji, actor_owner_handle: profile?.handle ?? null };

        // 1. Notify the original commenter when their comment is replied to
        // dedup_key: one notification per replier per comment (upserts if already unread)
        if (currentReply && currentReply.authorId !== user.id) {
          supabase.functions.invoke('playdates', {
            body: {
              action: 'notify', user_id: currentReply.authorId,
              title: `${pet.emoji ?? '🐾'} ${pet.name} replied to your comment`,
              body: cmtBody, type: 'post_comment_reply',
              dedup_key: `reply:${currentReply.commentId}:from:${user.id}`,
              data: { ...actorData, type: 'post_comment_reply', reply_to_comment_id: currentReply.commentId, body: text.slice(0, 120) },
            },
          }).catch(() => {});
        }

        // 2. Notify the post author — one collapsed notification per post (upserts)
        if (post.author_id && post.author_id !== user.id && post.author_id !== currentReply?.authorId) {
          supabase.functions.invoke('playdates', {
            body: {
              action: 'notify', user_id: post.author_id,
              title: currentReply
                ? `${pet.emoji ?? '🐾'} ${pet.name} replied on your post`
                : `${pet.emoji ?? '🐾'} ${pet.name} commented on your post`,
              body: cmtBody, type: 'post_comment',
              dedup_key: `comment:post:${post.id}:owner`,
              data: { ...actorData, body: text.slice(0, 120) },
            },
          }).catch(() => {});
        }

        // 3. Notify other thread participants — one collapsed "also commented" per person per post
        ;(async () => {
          try {
            const { data: rows } = await supabase.from('post_comments').select('author_id').eq('post_id', post.id)
              .neq('author_id', user.id)
              .neq('author_id', post.author_id ?? '')
              .neq('author_id', currentReply?.authorId ?? '');
            if (!rows?.length) return;
            const participantIds = [...new Set(rows.map(r => r.author_id))];
            await Promise.all(participantIds.map(uid =>
              supabase.functions.invoke('playdates', { body: { action: 'notify', user_id: uid, title: `${pet.emoji ?? '🐾'} ${pet.name} also commented`, body: cmtBody, type: 'post_comment', dedup_key: `comment:post:${post.id}:thread:${uid}`, data: { ...actorData, thread: true } } }).catch(() => {}),
            ));
          } catch {}
        })();
      }
    } catch {
      setComments(prev => prev.filter(c => c.id !== localId));
      setPost(p => p ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p);
      setDraft(savedDraft);
      showAlert('Could not post comment', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, post, user?.id, pet, profile, replyingTo]);

  // ── Comment like ─────────────────────────────────────────────────────────────

  const handleCommentLike = useCallback(async (commentId: string, liked: boolean) => {
    if (!user?.id) return;
    if (liked) {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id }).then(() => {});
    } else {
      await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id).then(() => {});
    }
  }, [user?.id]);

  // ── Edit caption ─────────────────────────────────────────────────────────────

  const openEditCaption = useCallback(() => {
    setEditCaptionDraft(post?.caption ?? '');
    setShowMenu(false);
    setTimeout(() => setEditCaptionVisible(true), 200);
  }, [post?.caption]);

  const saveCaption = useCallback(async () => {
    if (!post || !user?.id) return;
    const newCaption = editCaptionDraft.trim();
    setEditCaptionVisible(false);
    setPost(p => p ? { ...p, caption: newCaption, is_edited: true } : p);
    await supabase.from('social_posts').update({ caption: newCaption, is_edited: true }).eq('id', post.id);
  }, [post, user?.id, editCaptionDraft]);

  // ── Delete post ──────────────────────────────────────────────────────────────

  const handleDeletePost = useCallback(async () => {
    if (!post || !user?.id) return;
    showAlert('Delete post?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deletePost(post.id, user.id);
          setShowMenu(false);
          if (navigation.canGoBack()) router.back();
          else router.replace('/(tabs)/connect' as any);
        } catch (err: any) {
          showAlert('Error', err.message ?? 'Failed to delete post');
        }
      }},
    ]);
  }, [post, user?.id]);

  const goBack = () => navigation.canGoBack() ? router.back() : router.replace('/(tabs)/connect' as any);

  // ── Loading / not found states ───────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]}>
        <View style={s.header}>
          <BackButton onPress={goBack} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Post</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PawBondLoader size={52} isDark={isDark} />
        </View>
      </SafeAreaView>
    );
  }

  if (fetchFailed) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]}>
        <View style={s.header}>
          <BackButton onPress={goBack} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Post</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📡</Text>
          <Text style={[s.notFoundTitle, { color: colors.textPrimary }]}>Couldn't load post</Text>
          <Text style={[s.notFoundSub, { color: colors.textSecondary }]}>Check your connection and try again.</Text>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: ac }]} onPress={() => setRetryCount(c => c + 1)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !post) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]}>
        <View style={s.header}>
          <BackButton onPress={goBack} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Post</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🗑️</Text>
          <Text style={[s.notFoundTitle, { color: colors.textPrimary }]}>Post no longer available</Text>
          <Text style={[s.notFoundSub, { color: colors.textSecondary }]}>This post has been deleted or is no longer available.</Text>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: ac }]} onPress={goBack}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={s.header}>
          <BackButton onPress={goBack} />
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Post</Text>
          {isOwn ? (
            <TouchableOpacity onPress={() => setShowMenu(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        alwaysBounceVertical={false}
        overScrollMode="never"
        scrollEventThrottle={200}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
        contentContainerStyle={{ paddingBottom: 16 }}>
        <PostDetailCard
          post={{ ...post, reaction }}
          ac={ac}
          isOwn={isOwn}
          colors={colors}
          isDark={isDark}
          showComments={showComments}
          onToggleComments={() => setShowComments(v => !v)}
          toggleLike={toggleLike}
          onReact={handleReact}
          likeScale={likeScale}
          reported={reported}
          onReport={handleReport}
          onUnreport={handleUnreport}
          pinned={pinned}
          onTogglePin={togglePin}
          viewerUrls={viewerUrls}
          viewerIndex={viewerIndex}
          onOpenViewer={(urls, idx) => { setViewerUrls(urls); setViewerIndex(idx); }}
          onCloseViewer={() => setViewerUrls([])}
          userId={user?.id}
          following={following}
          onFollow={handleFollow}
        />
        <PostCommentsList
          ref={commentsListRef}
          comments={comments}
          commentsLoading={commentsLoading}
          showComments={showComments}
          commentsCount={post.comments_count}
          onToggle={() => setShowComments(v => !v)}
          ac={ac}
          colors={colors}
          onReply={(c) => {
            const petName = c.pet?.name ?? (c.author?.handle ? `@${c.author.handle}` : 'them');
            setReplyingTo({ commentId: c.id, petName, authorId: c.author_id });
            setTimeout(() => inputRef.current?.focus(), 80);
          }}
          onLike={handleCommentLike}
          onDeleteComment={async (commentId) => {
            const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
            if (!error) setComments(prev => prev.filter(c => c.id !== commentId));
          }}
          commentsHasMore={commentsHasMore}
          onLoadMore={() => {
            const nextPage = commentsPage + 1;
            setCommentsPage(nextPage);
            loadComments(nextPage);
          }}
          currentUserId={user?.id}
          focusCommentId={focus_comment_id}
          scrollViewRef={scrollRef}
          listOffsetY={listOffsetY}
          onLayout={(e: any) => setListOffsetY(e.nativeEvent.layout.y)}
        />
      </ScrollView>

      {showGoTop && (
        <TouchableOpacity
          style={[s.goTopFab, { backgroundColor: ac }]}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      <PostCommentInput
        draft={draft}
        onChangeDraft={setDraft}
        onSubmit={submitComment}
        submitting={submitting}
        pet={pet}
        profileName={profile?.full_name}
        profileId={user?.id}
        ac={ac}
        colors={colors}
        inputRef={inputRef}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      <ActionSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        actions={[
          { label: 'Edit caption', icon: 'pencil-outline', onPress: openEditCaption },
          { label: 'Share post', icon: 'share-outline', onPress: () => {
            setShowMenu(false);
            const petName = post?.pet?.name ?? 'a pet';
            const caption = post?.caption ? ` — "${post.caption.slice(0, 80)}"` : '';
            Share.share({ message: `Check out ${petName} on PawBond!${caption}` }).catch(() => {});
          }},
          { label: 'Delete post', icon: 'trash-outline', destructive: true, onPress: () => handleDeletePost() },
        ]}
      />

      {/* Edit caption inline modal */}
      <Modal visible={editCaptionVisible} animationType="slide" transparent onRequestClose={() => {
        if (editCaptionDraft.trim() !== (post?.caption ?? '').trim()) {
          showAlert('Discard changes?', 'Your caption changes will be lost.', [
            { text: 'Keep editing', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: () => setEditCaptionVisible(false) },
          ]);
        } else {
          setEditCaptionVisible(false);
        }
      }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={[s.editSheet, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>Edit caption</Text>
              <TouchableOpacity onPress={() => setEditCaptionVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.editInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              value={editCaptionDraft}
              onChangeText={setEditCaptionDraft}
              placeholder="Write a caption…"
              placeholderTextColor={colors.placeholder}
              multiline
              autoFocus
              maxLength={500}
            />
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, textAlign: 'right', marginTop: 4 }}>{editCaptionDraft.length}/500</Text>
            <TouchableOpacity
              onPress={saveCaption}
              style={[s.editSaveBtn, { backgroundColor: ac }]}
              activeOpacity={0.85}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1 },
  goTopFab:     { position: 'absolute', bottom: 120, right: 20, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle:  { fontSize: TYPO.subheading, fontWeight: '700' },
  notFoundTitle:{ fontSize: TYPO.heading, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  notFoundSub:  { fontSize: TYPO.body, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  backBtn:      { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  editSheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  editInput:    { minHeight: 100, borderRadius: 12, borderWidth: 1, padding: 12, fontSize: TYPO.subheading, lineHeight: 24, textAlignVertical: 'top' },
  editSaveBtn:  { marginTop: 14, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
});
