import React, { useState, useRef } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Keyboard, Modal, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';

const { width: SW } = Dimensions.get('window');
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { EmojiAvatar } from './EmojiAvatar';
import { MentionText, MentionDropdown } from './MentionComponents';
import { getMentionQuery, insertMention, relTime } from '@/features/social/utils';
import { Post } from '@/features/social/types';

interface CommentsSectionProps {
  post: Post;
  myPet: any;
  myProfile: any;
  myUserId?: string | null;
  onAdd: (postId: string, body: string, photoUri?: string | null, replyToId?: string | null) => Promise<void>;
  onCollapse: () => void;
  colors: any;
  canComment: boolean;
  showCollapseButton?: boolean;
  preloadedComments?: any[];
  onInputFocus?: () => void;
}

interface ReplyingTo { id: string; name: string; }

function CommentPhoto({ uri }: { uri: string }) {
  const [viewing, setViewing] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setViewing(true)} activeOpacity={0.85}>
        <Image source={{ uri }} style={cm.commentPhoto} resizeMode="cover" />
      </TouchableOpacity>
      {viewing && (
        <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={() => setViewing(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setViewing(false)}>
            <Image source={{ uri }} style={{ width: SW, height: SW }} resizeMode="contain" />
            <TouchableOpacity
              style={{ position: 'absolute', top: 52, right: 20, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: 6 }}
              onPress={() => setViewing(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

function CommentsSectionBase({
  post, myPet, myProfile, myUserId, onAdd, onCollapse, colors, canComment,
  showCollapseButton = true, preloadedComments, onInputFocus,
}: CommentsSectionProps) {
  const [draft, setDraft]             = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [commentCursor, setCommentCursor] = useState(0);
  const [attachedPhoto, setAttachedPhoto] = useState<string | null>(null);
  const [replyingTo, setReplyingTo]   = useState<ReplyingTo | null>(null);
  const inputRef = useRef<TextInput>(null);
  const ac = myPet?.accent_color ?? colors.primary;

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const handleDraftChange = (t: string) => {
    setDraft(t);
    setMentionQuery(getMentionQuery(t, commentCursor));
  };
  const handleDraftSelect = (e: any) => {
    const pos = e.nativeEvent?.selection?.end ?? draftRef.current.length;
    setCommentCursor(pos);
    setMentionQuery(getMentionQuery(draftRef.current, pos));
  };
  const handleMentionSelect = (slug: string) => {
    const result = insertMention(draft, commentCursor, slug);
    setDraft(result.text);
    setCommentCursor(result.cursor);
    setMentionQuery(null);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setAttachedPhoto(result.assets[0].uri);
    }
  };

  const startReply = (comment: any) => {
    const name = comment.pet?.name ?? (comment.author?.handle ? `@${comment.author.handle}` : 'them');
    setReplyingTo({ id: comment.id, name });
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const cancelReply = () => setReplyingTo(null);

  const submit = async () => {
    const text = draft.trim();
    if ((!text && !attachedPhoto) || submitting) return;
    const photo = attachedPhoto;
    const reply = replyingTo;
    setDraft('');
    setAttachedPhoto(null);
    setReplyingTo(null);
    Keyboard.dismiss();
    inputRef.current?.blur();
    setSubmitting(true);
    try {
      await onAdd(post.id, text, photo, reply?.id ?? null);
    } finally {
      setSubmitting(false);
    }
  };

  const canSend = !!draft.trim() || !!attachedPhoto;
  const displayComments = preloadedComments ?? post.comments ?? [];

  return (
    <View style={[cm.wrap, { borderTopColor: colors.border }]}>
      {showCollapseButton && (
        <TouchableOpacity onPress={onCollapse} style={cm.collapseRow} activeOpacity={0.65}>
          <Text style={[cm.collapseLabel, { color: colors.textSecondary }]}>
            {post.comments_count > 0 ? `${post.comments_count} comment${post.comments_count !== 1 ? 's' : ''}` : 'Comments'}
          </Text>
          <Ionicons name="chevron-up" size={14} color={colors.textTertiary} />
        </TouchableOpacity>
      )}

      {displayComments.map((c: any) => (
        <View key={c.id} style={cm.row}>
          <EmojiAvatar emoji={c.pet?.emoji} name={c.author?.handle ?? c.pet?.name ?? '?'} size={30}
            color={c.pet?.accent_color ?? colors.primary} avatarUrl={c.pet?.avatar_url} />
          <View style={{ flex: 1 }}>
            <View style={cm.bubble}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
                <Text style={[cm.cName, { color: c.pet?.accent_color ?? ac }]}>
                  {c.pet?.name ?? (c.author?.handle ? `@${c.author.handle}` : 'Pet parent')}
                </Text>
                {c.pet?.name && c.author?.handle ? (
                  <Text style={[cm.cOwner, { color: colors.textSecondary }]}>@{c.author.handle}</Text>
                ) : null}
                <Text style={[cm.cTime, { color: colors.textSecondary }]}>{relTime(c.created_at)}</Text>
              </View>
              {!!c.body && <MentionText text={c.body} style={[cm.cBody, { color: colors.textPrimary }]} />}
              {!!c.photo_url && <CommentPhoto uri={c.photo_url} />}
            </View>
            {/* Reply action */}
            {canComment && (
              <TouchableOpacity onPress={() => startReply(c)} style={cm.replyAction}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="return-down-forward-outline" size={12} color={colors.textTertiary} />
                <Text style={[cm.replyActionText, { color: colors.textTertiary }]}>Reply</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {displayComments.length === 0 && !submitting && (
        <Text style={[cm.empty, { color: colors.textSecondary }]}>No comments yet — be the first</Text>
      )}

      {(canComment || post.comments_count < 2) && (
        <View style={cm.inputBlock}>
          {/* Reply banner */}
          {replyingTo && (
            <View style={[cm.replyBanner, { backgroundColor: ac + '18', borderLeftColor: ac }]}>
              <Ionicons name="return-down-forward-outline" size={12} color={ac} />
              <Text style={[cm.replyBannerText, { color: ac }]} numberOfLines={1}>
                Replying to {replyingTo.name}
              </Text>
              <TouchableOpacity onPress={cancelReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={14} color={ac} />
              </TouchableOpacity>
            </View>
          )}

          {/* Photo preview */}
          {attachedPhoto && (
            <View style={cm.photoPreviewRow}>
              <Image source={{ uri: attachedPhoto }} style={cm.photoPreview} resizeMode="cover" />
              <TouchableOpacity onPress={() => setAttachedPhoto(null)} style={cm.removePhoto}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={cm.inputRow}>
            <EmojiAvatar emoji={myPet?.emoji} name={myProfile?.full_name ?? 'Me'} size={30}
              color={ac} avatarUrl={myPet?.avatar_url} />
            <View style={{ flex: 1, position: 'relative' }}>
              {mentionQuery && (
                <View style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50 }}>
                  <MentionDropdown query={mentionQuery} colors={colors} accent={ac}
                    onSelect={handleMentionSelect} />
                </View>
              )}
              <View style={[cm.inputWrap, {
                backgroundColor: colors.inputBg,
                borderColor: submitting ? `${ac}60` : colors.inputBorder,
              }]}>
                <TextInput
                  ref={inputRef}
                  style={[cm.input, { color: colors.textPrimary }]}
                  placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : `Add a comment as ${myPet?.name ?? 'you'}…`}
                  placeholderTextColor={colors.placeholder}
                  value={draft}
                  onChangeText={handleDraftChange}
                  onSelectionChange={handleDraftSelect}
                  onFocus={onInputFocus}
                  returnKeyType="send"
                  onSubmitEditing={submit}
                  blurOnSubmit={true}
                  editable={!submitting}
                  multiline
                />
                {/* Photo attach button */}
                <TouchableOpacity onPress={pickPhoto} disabled={submitting}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={{ marginBottom: 2 }}>
                  <Ionicons name={attachedPhoto ? 'image' : 'image-outline'} size={18}
                    color={attachedPhoto ? ac : colors.textSecondary} />
                </TouchableOpacity>
                {submitting
                  ? <ActivityIndicator size="small" color={ac} style={{ marginLeft: 6 }} />
                  : <TouchableOpacity
                      onPress={submit}
                      disabled={!canSend}
                      style={[cm.sendBtn, { backgroundColor: canSend ? ac : colors.border }]}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="arrow-up" size={14} color="#fff" />
                    </TouchableOpacity>
                }
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export const CommentsSection = React.memo(CommentsSectionBase);

export const cm = StyleSheet.create({
  wrap:           { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  collapseRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 4, marginBottom: 2 },
  collapseLabel:  { fontSize: TYPO.caption, fontWeight: '700', opacity: 0.6, letterSpacing: 0.5, textTransform: 'uppercase' },
  row:            { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bubble:         { flex: 1 },
  cName:          { fontSize: TYPO.body, fontWeight: '700', letterSpacing: -0.1 },
  cOwner:         { fontSize: TYPO.caption, fontWeight: '500' },
  cTime:          { fontSize: TYPO.caption, fontWeight: '400' },
  cBody:          { fontSize: TYPO.body, lineHeight: 23, marginTop: 2, letterSpacing: 0.05 },
  commentPhoto:   { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, marginTop: 6 },
  replyAction:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginLeft: 2 },
  replyActionText:{ fontSize: TYPO.caption, fontWeight: '600', letterSpacing: 0.2 },
  empty:          { fontSize: TYPO.body, textAlign: 'center', paddingVertical: 8, fontStyle: 'italic', opacity: 0.5 },
  inputBlock:     { gap: 6 },
  replyBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6,
                    borderLeftWidth: 3, borderRadius: 6, marginBottom: 2 },
  replyBannerText:{ flex: 1, fontSize: TYPO.caption, fontWeight: '600' },
  photoPreviewRow:{ position: 'relative', alignSelf: 'flex-start', marginLeft: 38, marginBottom: 4 },
  photoPreview:   { width: 72, height: 72, borderRadius: 10 },
  removePhoto:    { position: 'absolute', top: -6, right: -6 },
  inputRow:       { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 4 },
  inputWrap:      { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, borderWidth: 1,
                    paddingHorizontal: 14, paddingVertical: 6, gap: 8 },
  input:          { flex: 1, fontSize: TYPO.body, maxHeight: 80, paddingTop: 2, lineHeight: 20 },
  sendBtn:        { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
});
