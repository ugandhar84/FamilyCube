/**
 * ComposeSheet — bottom sheet for creating a new post.
 */
import React, { useState, useEffect, useRef } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoEditor } from './PhotoEditor';
import BottomSheet from '@/components/BottomSheet';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { usePaywall } from '@/lib/hooks/usePaywall';
import { LIMITS } from '@/lib/subscription';
import { showAlert } from '@/components/AppAlert';
import { showPickerOverlay, usePickerOverlayStore } from '@/store/pickerOverlayStore';
import { containsProfanity, censorText } from '@/lib/profanityFilter';
import { getMentionQuery, insertMention } from '@/features/social/utils';
import { MAX_VIDEO_BYTES } from '@/features/social/types';
import { MentionDropdown } from '@/features/social/components/MentionComponents';
import { EmojiAvatar } from '@/features/social/components/EmojiAvatar';
import { prepareVideoForUpload, showVideoSourceMenu } from '@/features/social/components/EditPostSheet';

interface ComposeSheetProps {
  visible: boolean;
  onClose: () => void;
  onPost: (
    caption: string,
    photoUri: string | null,
    photoBase64: string | null,
    videoUri?: string | null,
    videoBase64?: string | null,
    videoMimeType?: string,
    onUploadProgress?: (fraction: number) => void,
    postingAsPetId?: string,
    photoUris?: string[],
    photoB64s?: string[],
    captionOverlay?: boolean,
    fitFrame?: boolean,
    overlayCaption?: string,
  ) => Promise<void>;
  pet: any;
  pets?: any[];
  profile: any;
  colors: any;
  canPost?: boolean;
}

export const ComposeSheet = React.memo(function ComposeSheet({
  visible, onClose, onPost,
  pet, pets: allPets = [], profile, colors, canPost: canPostRole = true,
}: ComposeSheetProps) {
  const insets = useSafeAreaInsets();
  const videoPostsEnabled = useFeatureFlag('video_posts_enabled');
  const { gate, consume, tier } = usePaywall();
  const pickerActive = usePickerOverlayStore(s => s.visible);

  const [caption, setCaption]           = useState('');
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [photoB64, setPhotoB64]         = useState<string | null>(null);
  const [photoUris, setPhotoUris]       = useState<string[]>([]);
  const [photoB64s, setPhotoB64s]       = useState<string[]>([]);
  const [videoUri, setVideoUri]         = useState<string | null>(null);
  const [videoB64, setVideoB64]         = useState<string | null>(null);
  const [videoMime, setVideoMime]       = useState<string | undefined>(undefined);
  const [compressingVideo, setCompressingVideo] = useState(false);
  const [posting, setPosting]           = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [captionWarn, setCaptionWarn]       = useState(false);
  const [captionOverlay, setCaptionOverlay] = useState(false);
  const [overlayCaption, setOverlayCaption] = useState('');
  const [fitFrame,      setFitFrame]         = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [editorUri, setEditorUri]       = useState<string | null>(null);
  const [cursorPos, setCursorPos]       = useState(0);
  const [composePet, setComposePet]     = useState<any>(pet);

  const captionRef      = useRef<TextInput>(null);
  const postingRef      = useRef(false);
  const petPillScrollRef = useRef<ScrollView>(null);
  const captionTextRef  = useRef(caption);
  captionTextRef.current = caption;

  const ac = composePet?.accent_color ?? pet?.accent_color ?? colors.primary;
  const videoPlayer = useVideoPlayer(videoUri ?? '', p => { p.muted = true; });

  const hasMedia = !!(photoUri || photoUris.length > 0 || videoUri);
  const charPct  = caption.length / 500;
  const charNear = charPct > 0.8;

  useEffect(() => { if (visible) setComposePet(pet); }, [visible, pet]);
  useEffect(() => {
    const t = setTimeout(() => petPillScrollRef.current?.scrollTo({ x: 0, animated: true }), 50);
    return () => clearTimeout(t);
  }, [composePet]);
  useEffect(() => {
    if (!visible) return;
    ImagePicker.requestMediaLibraryPermissionsAsync()
      .then(({ granted }) => { if (granted) MediaLibrary.getAssetsAsync({ first: 1 }).catch(() => {}); })
      .catch(() => {});
  }, [visible]);

  const handleCaptionChange = (t: string) => {
    setCaption(t);
    if (captionWarn) setCaptionWarn(false);
    setMentionQuery(getMentionQuery(t, cursorPos));
  };
  const handleCaptionSelect = (e: any) => {
    const pos = e.nativeEvent?.selection?.end ?? captionTextRef.current.length;
    setCursorPos(pos);
    setMentionQuery(getMentionQuery(captionTextRef.current, pos));
  };
  const handleMentionSelect = (slug: string) => {
    const result = insertMention(caption, cursorPos, slug);
    setCaption(result.text);
    setCursorPos(result.cursor);
    setMentionQuery(null);
  };

  const pickFromGallery = async () => {
    try {
      await showPickerLoading();
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 0.85,
        allowsMultipleSelection: true, selectionLimit: 4,
      });
      hidePickerLoading();
      if (res.canceled || !res.assets?.length) return;
      const assets = res.assets.slice(0, 4);
      setVideoUri(null); setVideoB64(null); setVideoMime(undefined);
      if (assets.length === 1) {
        setPhotoUris([]); setPhotoB64s([]);
        setEditorUri(assets[0].uri);
      } else {
        const uris = assets.map(a => a.uri);
        const b64s = await Promise.all(uris.map(u =>
          FileSystem.readAsStringAsync(u, { encoding: FileSystem.EncodingType.Base64 })));
        setPhotoUri(null); setPhotoB64(null);
        setPhotoUris(uris); setPhotoB64s(b64s);
      }
    } catch (e: any) {
      hidePickerLoading();
      if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
        showAlert('Dev build required', 'Run: npx expo run:ios to use photo features.');
      } else { showAlert('Error', e?.message ?? 'Could not open photo library.'); }
    }
  };

  const pickFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { showAlert('Camera access needed', 'Allow camera access in Settings to take a photo.'); return; }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: true, aspect: [4, 3], base64: true });
      if (res.canceled || !res.assets?.[0]) return;
      setVideoUri(null); setVideoB64(null); setVideoMime(undefined);
      setEditorUri(res.assets[0].uri);
    } catch (e: any) {
      if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
        showAlert('Dev build required', 'Run: npx expo run:ios to use photo features.');
      } else { showAlert('Error', e?.message ?? 'Could not open camera.'); }
    }
  };

  const acceptPickedVideo = async (uri: string, mimeType: string | undefined) => {
    const result = await prepareVideoForUpload(uri, setCompressingVideo);
    if (result === 'too-large') { showAlert('Video too large', `Max ${MAX_VIDEO_BYTES / (1024 * 1024)} MB.`); return; }
    if (result === 'empty' || result === 'read-failed') { showAlert('Could not read video', 'Please try again.'); return; }
    setPhotoUri(null); setPhotoB64(null);
    setVideoUri(result.uri); setVideoB64(result.base64); setVideoMime(mimeType);
  };

  const pickVideo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { showAlert('Permission needed', 'Allow photo library access to pick a video.'); return; }
      await showPickerLoading();
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
      hidePickerLoading();
      if (res.canceled || !res.assets?.[0]) return;
      await acceptPickedVideo(res.assets[0].uri, res.assets[0].mimeType);
    } catch (e: any) {
      if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
        showAlert('Dev build required', 'Run: npx expo run:ios to use video features.');
      } else { showAlert('Error', e?.message ?? 'Could not open video library.'); }
    }
  };

  const recordVideo = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { showAlert('Camera access needed', 'Allow camera access to record a video.'); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return;
      await acceptPickedVideo(res.assets[0].uri, res.assets[0].mimeType);
    } catch (e: any) {
      if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
        showAlert('Dev build required', 'Run: npx expo run:ios to use video features.');
      } else { showAlert('Error', e?.message ?? 'Could not open camera.'); }
    }
  };

  const handlePost = async () => {
    if (!canPostRole) return;
    if (!caption.trim() && !photoUri && !photoUris.length && !videoUri) return;
    if (postingRef.current) return;
    if (caption.trim().length > 500) { showAlert('Caption too long', 'Post caption must be 500 characters or fewer.'); return; }
    if (overlayCaption.trim().length > 250) { showAlert('Photo caption too long', 'On-photo caption must be 250 characters or fewer.'); return; }
    if (caption.trim() && containsProfanity(caption)) {
      setCaptionWarn(true); setCaption(censorText(caption)); return;
    }
    const postFeature = videoUri ? 'videoPostsPerMonth' : 'feedPostsPerMonth';
    const allowed = await gate(postFeature, {
      title: 'Post limit reached',
      message: videoUri ? 'Upgrade to Pro to post unlimited videos.' : "You've hit your free post limit. Upgrade to Pro.",
    });
    if (!allowed) return;
    setCaptionWarn(false);
    postingRef.current = true;
    const isVideo = !!videoUri;
    const captionVal = caption.trim();
    const overlayVal = overlayCaption.trim();
    const pUri = photoUri; const pB64 = photoB64;
    const vUri = videoUri; const vB64 = videoB64; const vMime = videoMime;
    const pUris = [...photoUris]; const pB64s = [...photoB64s];
    const cOverlay = captionOverlay; const fFrame = fitFrame;
    const postPetId = composePet?.id;

    setCaption(''); setPhotoUri(null); setPhotoB64(null);
    setPhotoUris([]); setPhotoB64s([]);
    setVideoUri(null); setVideoB64(null); setVideoMime(undefined);
    setCaptionWarn(false); setCaptionOverlay(false); setOverlayCaption(''); setFitFrame(false);

    if (isVideo) {
      setPosting(true); setUploadProgress(0);
    } else {
      onClose();
    }

    try {
      await onPost(captionVal, pUri, pB64, vUri, vB64, vMime,
        isVideo ? (fraction) => setUploadProgress(fraction) : undefined,
        postPetId, pUris, pB64s, cOverlay, fFrame, overlayVal);
      await consume(postFeature);
      if (isVideo) onClose();
    } catch (e: any) {
      showAlert('Post failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      postingRef.current = false; setPosting(false); setUploadProgress(0);
    }
  };

  const dismiss = () => {
    onClose();
    setCaption(''); setPhotoUri(null); setPhotoB64(null);
    setPhotoUris([]); setPhotoB64s([]);
    setVideoUri(null); setVideoB64(null); setVideoMime(undefined);
    setCaptionWarn(false); setCaptionOverlay(false); setOverlayCaption('');
  };

  const canPost = (!!caption.trim() || hasMedia) && !posting && !compressingVideo;

  return (
    <BottomSheet visible={visible} onClose={pickerActive ? () => {} : dismiss} style={{ height: '85%' }}>
      <View style={{ flex: 1 }}>
      {/* ── Header ── */}
      <View style={cs.header}>
        <EmojiAvatar emoji={composePet?.emoji ?? pet?.emoji} name={profile?.full_name ?? 'You'} size={42} color={ac} avatarUrl={composePet?.avatar_url ?? pet?.avatar_url} />
        <View style={{ flex: 1, marginLeft: 10, gap: 4 }}>
          <Text style={[cs.handleText, { color: colors.textPrimary }]}>
            {profile?.handle ? `@${profile.handle}` : 'You'}
          </Text>
          {allPets.length > 1 ? (
            <ScrollView ref={petPillScrollRef} horizontal showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}
              contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
              {[...allPets]
                .sort((a: any, b: any) => (b.id === (composePet?.id ?? pet?.id) ? 1 : 0) - (a.id === (composePet?.id ?? pet?.id) ? 1 : 0))
                .map((p: any) => {
                  const selected = (composePet?.id ?? pet?.id) === p.id;
                  const pAc = p.accent_color ?? colors.primary;
                  return (
                    <TouchableOpacity key={p.id} onPress={() => setComposePet(p)} activeOpacity={0.75}
                      style={[cs.petPill, { backgroundColor: selected ? pAc : `${pAc}18`, borderColor: selected ? pAc : `${pAc}40` }]}>
                      <Text style={{ fontSize: TYPO.caption }}>{p.emoji ?? '🐾'}</Text>
                      <Text style={[cs.petPillText, { color: selected ? '#fff' : pAc }]}>{p.name}</Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          ) : (
            <View style={cs.audienceRow}>
              <View style={[cs.audiencePill, { backgroundColor: `${ac}15` }]}>
                <Ionicons name="earth" size={11} color={ac} />
                <Text style={[cs.audienceText, { color: ac }]}>Public</Text>
              </View>
              <Text style={[cs.dotSep, { color: colors.textTertiary }]}>·</Text>
              <Text style={[cs.petName, { color: colors.textSecondary }]}>{pet?.emoji} {pet?.name ?? 'Your pet'}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={[cs.closeBtn, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="close" size={17} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Profanity warning ── */}
      {captionWarn && (
        <View style={[cs.profanityBar, { backgroundColor: colors.warningLight }]}>
          <Ionicons name="warning-outline" size={13} color={colors.warningDark} />
          <Text style={[cs.profanityText, { color: colors.warningDark }]}>Offensive language removed — keep it friendly 🐾</Text>
          <TouchableOpacity onPress={() => setCaptionWarn(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={13} color={colors.warningDark} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Scrollable body — flex: 1 fills space between header and toolbar ── */}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 64 }}
      >

      {/* ── Caption input ── */}
      <TextInput
        ref={captionRef}
        style={[cs.input, { color: colors.textPrimary }]}
        placeholder={`What's ${composePet?.name ?? pet?.name ?? 'your pet'} up to? 🐾`}
        placeholderTextColor={colors.placeholder}
        value={caption}
        onChangeText={handleCaptionChange}
        onSelectionChange={handleCaptionSelect}
        multiline maxLength={500}
        autoFocus={false}
      />

      {/* ── Photo editor ── */}
      {editorUri && (
        <PhotoEditor
          visible={!!editorUri}
          photoUri={editorUri}
          accent={ac}
          onDone={(uri, b64, fit) => { setEditorUri(null); setPhotoUri(uri); setPhotoB64(b64); setFitFrame(fit); }}
          onCancel={() => setEditorUri(null)}
        />
      )}

      {/* ── Single photo preview ── */}
      {photoUri && (
        <View style={cs.mediaWrap}>
          <Image source={{ uri: photoUri }} cachePolicy="memory-disk" style={cs.mediaPreview} contentFit="cover" />

          {/* Caption overlay: gradient + text */}
          {captionOverlay && overlayCaption.trim().length > 0 && (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.72)']}
              style={cs.overlayGradient}
            >
              <Text style={cs.overlayLabelText} numberOfLines={3}>{overlayCaption}</Text>
            </LinearGradient>
          )}

          {/* Top-right: wand + remove */}
          <View style={cs.mediaActions}>
            <TouchableOpacity style={[cs.mediaActionBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
              onPress={() => setEditorUri(photoUri)}>
              <Ionicons name="color-wand-outline" size={15} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[cs.mediaActionBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
              onPress={() => { setPhotoUri(null); setPhotoB64(null); setCaptionOverlay(false); }}>
              <Ionicons name="close" size={15} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Bottom-left: caption overlay toggle chip */}
          <TouchableOpacity
            style={[cs.overlayChip, { backgroundColor: captionOverlay ? ac : 'rgba(0,0,0,0.52)' }]}
            onPress={() => setCaptionOverlay(v => !v)}
            activeOpacity={0.8}
          >
            <Ionicons name="text" size={12} color="#fff" />
            <Text style={cs.overlayChipText}>{captionOverlay ? 'Caption on' : 'Caption off'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Overlay caption input (only when caption-on toggle is active for a single photo) ── */}
      {captionOverlay && photoUri && (
        <View style={[cs.overlayCaptionWrap, { borderColor: `${ac}50`, backgroundColor: `${ac}08` }]}>
          <View style={cs.overlayCaptionHeader}>
            <Ionicons name="text" size={13} color={ac} />
            <Text style={[cs.overlayCaptionLabel, { color: ac }]}>On-photo caption</Text>
            <Text style={[cs.overlayCaptionCount, { color: overlayCaption.length > 220 ? '#F59E0B' : colors.textTertiary }]}>
              {overlayCaption.length}/250
            </Text>
          </View>
          <TextInput
            style={[cs.overlayCaptionInput, { color: colors.textPrimary }]}
            placeholder="Text shown on the photo…"
            placeholderTextColor={colors.placeholder}
            value={overlayCaption}
            onChangeText={t => setOverlayCaption(t.slice(0, 250))}
            multiline
            maxLength={250}
          />
        </View>
      )}

      {/* ── Multi-photo grid ── */}
      {photoUris.length > 0 && (
        <View style={cs.multiGrid}>
          {photoUris.map((u, i) => (
            <View key={u} style={cs.multiThumb}>
              <Image source={{ uri: u }} cachePolicy="memory-disk" style={{ flex: 1 }} contentFit="cover" />
              <TouchableOpacity style={cs.multiRemove}
                onPress={() => { setPhotoUris(p => p.filter((_, j) => j !== i)); setPhotoB64s(p => p.filter((_, j) => j !== i)); }}>
                <Ionicons name="close" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {photoUris.length < 4 && (
            <TouchableOpacity style={[cs.multiThumb, cs.multiAdd, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
              onPress={() => showPickerOverlay('🖼️ Add Photo', [
                { label: 'Camera',  onPress: pickFromCamera },
                { label: 'Gallery', onPress: pickFromGallery },
              ])}>
              <Ionicons name="add" size={22} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Video compression spinner ── */}
      {compressingVideo && (
        <View style={[cs.mediaWrap, { alignItems: 'center', justifyContent: 'center', height: 100 }]}>
          <ActivityIndicator color={ac} />
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 8 }}>Preparing video…</Text>
        </View>
      )}

      {/* ── Video preview ── */}
      {videoUri && !compressingVideo && (
        <View style={cs.mediaWrap}>
          <VideoView player={videoPlayer} style={[cs.mediaPreview, { borderRadius: 0 }]} contentFit="cover" nativeControls={false} />
          <View style={cs.videoBadge}>
            <Ionicons name="videocam" size={11} color="#fff" />
            <Text style={cs.videoBadgeText}>Video</Text>
          </View>
          <View style={cs.mediaActions}>
            <TouchableOpacity style={[cs.mediaActionBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
              onPress={() => { setVideoUri(null); setVideoB64(null); setVideoMime(undefined); }}>
              <Ionicons name="close" size={15} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      </ScrollView>{/* end scrollable body */}

      {/* ── Mention autocomplete overlay — floats above toolbar ── */}
      {mentionQuery && (
        <View style={{ position: 'absolute', bottom: 56, left: 0, right: 0, zIndex: 50, paddingHorizontal: 4 }}>
          <MentionDropdown query={mentionQuery} colors={colors} accent={ac} onSelect={handleMentionSelect} />
        </View>
      )}

      {/* ── Toolbar + Post — pinned above keyboard ── */}
      <View style={[cs.toolbar, { borderTopColor: colors.border }]}>
        {/* Left: media buttons */}
        <View style={cs.toolbarLeft}>
          <TouchableOpacity style={cs.toolBtn} disabled={compressingVideo || !!videoUri}
            onPress={() => showPickerOverlay('🖼️ Add a Photo', [
              { label: 'Camera',  onPress: pickFromCamera },
              { label: 'Gallery', onPress: pickFromGallery },
            ])}>
            <Ionicons name="image-outline" size={22} color={hasMedia && !videoUri ? ac : colors.textSecondary} />
          </TouchableOpacity>
          {videoPostsEnabled && LIMITS[tier].videoPostsPerMonth !== 0 && (
            <TouchableOpacity style={cs.toolBtn} disabled={compressingVideo || !!photoUri || photoUris.length > 0}
              onPress={async () => {
                const ok = await gate('videoPostsPerMonth', { title: 'Video posts — Pro feature', message: 'Upgrade to Pro to post videos.' });
                if (ok) showVideoSourceMenu(recordVideo, pickVideo);
              }}>
              <Ionicons name="videocam-outline" size={22} color={videoUri ? ac : colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Right: char count + Post */}
        <View style={cs.toolbarRight}>
          <Text style={[cs.charCount, { color: charNear ? '#F59E0B' : colors.textTertiary }]}>
            {caption.length}/500
          </Text>
          <TouchableOpacity
            style={[cs.postBtn, { backgroundColor: canPost ? ac : `${ac}40` }]}
            onPress={handlePost} disabled={!canPost} activeOpacity={0.82}>
            {posting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={cs.postBtnText}>Post</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Upload overlay — covers full sheet ── */}
      {posting && (
        <View style={cs.uploadOverlay}>
          <View style={[cs.uploadCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={ac} />
            {videoUri ? (
              <>
                <Text style={[cs.uploadTitle, { color: colors.textPrimary }]}>Uploading video…</Text>
                <View style={[cs.progressTrack, { backgroundColor: colors.border }]}>
                  <View style={[cs.progressFill, { backgroundColor: ac, width: `${Math.round(uploadProgress * 100)}%` as any }]} />
                </View>
                <Text style={[cs.uploadPct, { color: colors.textSecondary }]}>{Math.round(uploadProgress * 100)}%</Text>
              </>
            ) : (
              <Text style={[cs.uploadTitle, { color: colors.textPrimary }]}>Posting…</Text>
            )}
            <Text style={[cs.uploadSub, { color: colors.textSecondary }]}>Almost there 🐾</Text>
          </View>
        </View>
      )}
      </View>
    </BottomSheet>
  );
});

const cs = StyleSheet.create({
  // Header
  header:          { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handleText:      { fontSize: TYPO.body, fontWeight: '700' },
  audienceRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  audiencePill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  audienceText:    { fontSize: TYPO.caption, fontWeight: '600' },
  dotSep:          { fontSize: TYPO.caption },
  petName:         { fontSize: TYPO.caption, fontWeight: '500' },
  petPill:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, borderWidth: 1.5 },
  petPillText:     { fontSize: TYPO.caption, fontWeight: '700' },
  closeBtn:        { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // Caption input
  input:                { fontSize: TYPO.subheading, minHeight: 80, textAlignVertical: 'top', lineHeight: 26, marginBottom: 12 },
  inputOverlayMode:     { minHeight: 60, maxHeight: 100, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body },

  // Overlay caption box
  overlayCaptionWrap:   { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, marginBottom: 10 },
  overlayCaptionHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  overlayCaptionLabel:  { fontSize: TYPO.caption, fontWeight: '700', flex: 1 },
  overlayCaptionCount:  { fontSize: TYPO.caption, fontWeight: '600' },
  overlayCaptionInput:  { fontSize: TYPO.body, minHeight: 48, textAlignVertical: 'top', lineHeight: 22 },

  // Media
  mediaWrap:       { marginBottom: 10, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  mediaPreview:    { width: '100%', height: 210 },
  mediaActions:    { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8 },
  mediaActionBtn:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  overlayGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16 },
  overlayLabelText:{ color: '#fff', fontSize: TYPO.body, lineHeight: 22, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  overlayChip:     { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  overlayChipText: { color: '#fff', fontSize: TYPO.caption, fontWeight: '700' },

  // Multi photo
  multiGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  multiThumb:      { width: 80, height: 80, borderRadius: 10, overflow: 'hidden' },
  multiAdd:        { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed' },
  multiRemove:     { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },

  // Video
  videoBadge:      { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  videoBadgeText:  { fontSize: TYPO.caption, fontWeight: '700', color: '#fff' },

  // Toolbar
  toolbar:         { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 16 },
  toolbarLeft:     { flexDirection: 'row', gap: 4, flex: 1 },
  toolbarRight:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolBtn:         { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  charCount:       { fontSize: TYPO.caption, fontWeight: '500' },
  postBtn:         { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 22 },
  postBtnText:     { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },

  // Profanity
  profanityBar:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, marginBottom: 8 },
  profanityText:   { flex: 1, fontSize: TYPO.caption, fontWeight: '600' },

  // Upload overlay
  uploadOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderRadius: 20, zIndex: 99 },
  uploadCard:      { width: 220, borderRadius: 20, padding: 28, alignItems: 'center', gap: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 16 },
  uploadTitle:     { fontSize: TYPO.subheading, fontWeight: '800', textAlign: 'center' },
  uploadSub:       { fontSize: TYPO.caption, textAlign: 'center' },
  uploadPct:       { fontSize: TYPO.body, fontWeight: '700' },
  progressTrack:   { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:    { height: 6, borderRadius: 3 },
});
