import React, { RefObject, useState, useRef } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { MentionDropdown } from '@/features/social/components/MentionComponents';
import { getMentionQuery, insertMention } from '@/features/social/utils';

export interface ReplyingTo {
  commentId: string;
  petName: string;
  authorId: string;
}

interface PostCommentInputProps {
  draft: string;
  onChangeDraft: (text: string) => void;
  onSubmit: (photoUri?: string | null) => void;
  submitting: boolean;
  pet: { name?: string; emoji?: string; accent_color?: string; avatar_url?: string | null } | null | undefined;
  profileName: string | null | undefined;
  profileId?: string | null;
  ac: string;
  colors: any;
  inputRef: RefObject<TextInput | null>;
  replyingTo?: ReplyingTo | null;
  onCancelReply?: () => void;
}

const MAX_COMMENT_LENGTH = 500;

function PostCommentInputBase({
  draft, onChangeDraft, onSubmit, submitting, pet, profileName, profileId, ac, colors, inputRef,
  replyingTo, onCancelReply,
}: PostCommentInputProps) {
  const insets = useSafeAreaInsets();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [attachedPhoto, setAttachedPhoto] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const handleChange = (t: string) => {
    onChangeDraft(t);
    setMentionQuery(getMentionQuery(t, cursor));
  };

  const handleSelectionChange = (e: any) => {
    const pos = e.nativeEvent?.selection?.end ?? draftRef.current.length;
    setCursor(pos);
    setMentionQuery(getMentionQuery(draftRef.current, pos));
  };

  const handleMentionSelect = (slug: string) => {
    const result = insertMention(draftRef.current, cursor, slug);
    onChangeDraft(result.text);
    setCursor(result.cursor);
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

  const handleSubmit = () => {
    onSubmit(attachedPhoto);
    setAttachedPhoto(null);
  };

  const canSend = !!draft.trim() || !!attachedPhoto;

  return (
    <View style={[s.container, { borderTopColor: colors.border, backgroundColor: colors.background, zIndex: 10 }]}>
      {replyingTo && (
        <View style={[s.replyBanner, { backgroundColor: ac + '18', borderLeftColor: ac }]}>
          <Ionicons name="return-down-forward-outline" size={13} color={ac} />
          <Text style={[s.replyBannerText, { color: ac }]} numberOfLines={1}>
            Replying to {replyingTo.petName}
          </Text>
          <TouchableOpacity onPress={onCancelReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={15} color={ac} />
          </TouchableOpacity>
        </View>
      )}

      {attachedPhoto && (
        <View style={s.photoPreviewRow}>
          <Image source={{ uri: attachedPhoto }} style={s.photoPreview} resizeMode="cover" />
          <TouchableOpacity
            onPress={() => setAttachedPhoto(null)}
            style={s.removePhoto}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close-circle" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <View style={{ position: 'relative' }}>
        {mentionQuery && (
          <View style={s.mentionOverlay}>
            <MentionDropdown
              query={mentionQuery}
              colors={colors}
              accent={ac}
              onSelect={handleMentionSelect}
            />
          </View>
        )}
        <View style={[s.row, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <EmojiAvatar
          emoji={pet?.emoji}
          name={profileName ?? 'Me'}
          size={30}
          color={pet?.accent_color ?? '#7C5CBF'}
          avatarUrl={pet?.avatar_url}
        />
        <View style={[s.wrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder ?? colors.border }]}>
          <View style={{ flex: 1 }}>
            <TextInput
              ref={inputRef}
              style={[s.input, { color: colors.textPrimary }]}
              placeholder={replyingTo ? `Reply to ${replyingTo.petName}…` : `Add a comment as ${pet?.name ?? 'you'}…`}
              placeholderTextColor={colors.placeholder ?? colors.textTertiary}
              value={draft}
              onChangeText={handleChange}
              onSelectionChange={handleSelectionChange}
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              blurOnSubmit={true}
              editable={!submitting}
              multiline
              maxLength={MAX_COMMENT_LENGTH}
            />
            {draft.length > MAX_COMMENT_LENGTH - 50 && (
              <Text style={{ fontSize: TYPO.label, color: draft.length >= MAX_COMMENT_LENGTH ? '#E0525A' : colors.textTertiary, alignSelf: 'flex-end', paddingRight: 4, paddingBottom: 2 }}>
                {MAX_COMMENT_LENGTH - draft.length}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={pickPhoto}
            disabled={submitting}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={{ marginLeft: 4, marginBottom: 4 }}>
            <Ionicons
              name={attachedPhoto ? 'image' : 'image-outline'}
              size={20}
              color={attachedPhoto ? ac : colors.textSecondary}
            />
          </TouchableOpacity>
          {submitting
            ? <ActivityIndicator size="small" color={ac} style={{ marginLeft: 6 }} />
            : (
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!canSend}
                style={[s.sendBtn, { backgroundColor: canSend ? ac : colors.border }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="send" size={13} color="#fff" />
              </TouchableOpacity>
            )
          }
        </View>
        </View>
      </View>
    </View>
  );
}

export const PostCommentInput = React.memo(PostCommentInputBase);

const s = StyleSheet.create({
  container:       { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8 },
  replyBanner:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 7, borderLeftWidth: 3, marginBottom: 4 },
  replyBannerText: { flex: 1, fontSize: TYPO.caption, fontWeight: '600' },
  photoPreviewRow: { position: 'relative', alignSelf: 'flex-start', marginHorizontal: 16, marginBottom: 6 },
  photoPreview:    { width: 80, height: 80, borderRadius: 10 },
  removePhoto:     { position: 'absolute', top: -6, right: -6 },
  row:             { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  wrap:            { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  input:           { flex: 1, fontSize: TYPO.body, maxHeight: 90, paddingTop: 0, paddingBottom: 0 },
  sendBtn:         { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  mentionOverlay:  { position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50 },
});
