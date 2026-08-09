import React, { useState, useEffect, useRef } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { showPickerOverlay, usePickerOverlayStore } from '@/store/pickerOverlayStore';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { showAlert } from '@/components/AppAlert';
import { containsProfanity, censorText } from '@/lib/profanityFilter';
import { getMentionQuery, insertMention } from '@/features/social/utils';
import { MentionDropdown } from '@/features/social/components/MentionComponents';
import BottomSheet from '@/components/BottomSheet';
import { EmojiAvatar } from './EmojiAvatar';
import { Post, MAX_VIDEO_BYTES } from '@/features/social/types';

// ── Video helpers (exported so ComposeSheet in SocialScreen can reuse) ──────────

export async function prepareVideoForUpload(
  uri: string, onCompressing?: (v: boolean) => void,
): Promise<{ uri: string; base64: string } | 'too-large' | 'empty' | 'read-failed'> {
  onCompressing?.(true);
  let finalUri = uri;
  const { NativeModules } = require('react-native');
  if (NativeModules.Compressor) {
    try {
      const { Video } = require('react-native-compressor');
      finalUri = await Video.compress(uri, { compressionMethod: 'auto' }, () => {});
    } catch (e: any) {
      console.warn('[video] compression failed, uploading original:', e?.message);
    }
  } else {
    console.warn('[video] compressor native module not linked — uploading original');
  }

  const info = await FileSystem.getInfoAsync(finalUri);
  const sizeBytes = info.exists ? info.size : 0;
  if (sizeBytes > MAX_VIDEO_BYTES) { onCompressing?.(false); return 'too-large'; }
  if (sizeBytes === 0) { onCompressing?.(false); return 'empty'; }

  try {
    const base64 = await FileSystem.readAsStringAsync(finalUri, { encoding: FileSystem.EncodingType.Base64 });
    onCompressing?.(false);
    return { uri: finalUri, base64 };
  } catch {
    onCompressing?.(false);
    return 'read-failed';
  }
}

export function showVideoSourceMenu(onRecord: () => void, onPick: () => void) {
  showPickerOverlay('Add video', [
    { label: 'Record',  onPress: onRecord },
    { label: 'Gallery', onPress: onPick },
  ]);
}

// ── EditPostSheet ──────────────────────────────────────────────────────────────

interface EditPostSheetProps {
  visible: boolean;
  post: Post | null;
  onClose: () => void;
  onSave: (
    postId: string,
    caption: string,
    photoChange: 'none' | 'removed' | 'replaced',
    newPhotoUri?: string | null,
    newPhotoBase64?: string | null,
    videoChange?: 'none' | 'removed' | 'replaced',
    newVideoUri?: string | null,
    newVideoBase64?: string | null,
    newVideoMime?: string,
    overlayCaption?: string | null,
    captionOverlay?: boolean,
    replacedPhotoUrls?: string[] | null,
    replacedPhotoBase64s?: (string | null)[] | null,
  ) => Promise<void>;
  colors: any;
}

function EditPostSheetBase({ visible, post, onClose, onSave, colors }: EditPostSheetProps) {
  const insets = useSafeAreaInsets();
  const videoPostsEnabled = useFeatureFlag('video_posts_enabled');
  const pickerActive = usePickerOverlayStore(s => s.visible);
  const [caption, setCaption]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [editWarn, setEditWarn]   = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const captionRef = useRef(caption);
  const [photoChange, setPhotoChange] = useState<'none' | 'removed' | 'replaced'>('none');
  const [newPhotoUri, setNewPhotoUri]   = useState<string | null>(null);
  const [newPhotoB64, setNewPhotoB64]   = useState<string | null>(null);
  const [videoChange, setVideoChange] = useState<'none' | 'removed' | 'replaced'>('none');
  const [newVideoUri, setNewVideoUri]   = useState<string | null>(null);
  const [newVideoB64, setNewVideoB64]   = useState<string | null>(null);
  const [newVideoMime, setNewVideoMime] = useState<string | undefined>(undefined);
  const [preparingVideo, setPreparingVideo] = useState(false);
  const [overlayCaption, setOverlayCaption] = useState('');
  const [captionOverlay, setCaptionOverlay] = useState(false);

  // Multi-photo state: local copy of photo_urls that can be modified
  const [editPhotos, setEditPhotos] = useState<{ uri: string; base64?: string | null; isNew?: boolean }[]>([]);
  const [photosChanged, setPhotosChanged] = useState(false);

  const ac = post?.pet?.accent_color ?? colors.primary;
  const isMultiPhoto = (post?.photo_urls?.length ?? 0) > 1;

  const editVideoPlayer = useVideoPlayer(newVideoUri ?? post?.video_url ?? '', p => { p.muted = true; });

  useEffect(() => {
    if (post) {
      setCaption(post.caption ?? '');
      setOverlayCaption(post.overlay_caption ?? '');
      setCaptionOverlay(!!post.caption_overlay);
      setEditWarn(false);
      setPhotoChange('none');
      setNewPhotoUri(null);
      setNewPhotoB64(null);
      setVideoChange('none');
      setNewVideoUri(null);
      setNewVideoB64(null);
      setNewVideoMime(undefined);
      setPhotosChanged(false);
      if (post.photo_urls && post.photo_urls.length > 1) {
        setEditPhotos(post.photo_urls.map(u => ({ uri: u })));
      } else {
        setEditPhotos([]);
      }
    }
  }, [post?.id]);

  const showPhotoSourceMenu = (onCamera: () => void, onLibrary: () => void) => {
    showPickerOverlay('Add photo', [
      { label: 'Camera',  onPress: onCamera },
      { label: 'Library', onPress: onLibrary },
    ]);
  };

  const takeNewPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { showAlert('Camera access needed', 'Allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'], quality: 0.85, base64: true, allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setNewPhotoUri(asset.uri);
      setNewPhotoB64(asset.base64 ?? null);
      setPhotoChange('replaced');
      setVideoChange('removed'); setNewVideoUri(null); setNewVideoB64(null);
    }
  };

  const pickNewPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Allow photo access to change the image.'); return; }
    await showPickerLoading();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85, base64: true, allowsEditing: true,
    });
    hidePickerLoading();
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setNewPhotoUri(asset.uri);
      setNewPhotoB64(asset.base64 ?? null);
      setPhotoChange('replaced');
      setVideoChange('removed'); setNewVideoUri(null); setNewVideoB64(null);
    }
  };

  // Multi-photo: remove a photo at index
  const removeMultiPhoto = (idx: number) => {
    setEditPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotosChanged(true);
  };

  // Multi-photo: replace a photo at index
  const replaceMultiPhoto = async (idx: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Allow photo access.'); return; }
    await showPickerLoading();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, base64: true, allowsEditing: true,
    });
    hidePickerLoading();
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setEditPhotos(prev => prev.map((p, i) => i === idx ? { uri: asset.uri, base64: asset.base64 ?? null, isNew: true } : p));
      setPhotosChanged(true);
    }
  };

  // Multi-photo: add a photo (camera or library)
  const addMultiPhotoFromLibrary = async () => {
    if (editPhotos.length >= 4) { showAlert('Limit reached', 'Maximum 4 photos per post.'); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Allow photo access.'); return; }
    await showPickerLoading();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, base64: true, allowsEditing: true,
    });
    hidePickerLoading();
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setEditPhotos(prev => [...prev, { uri: asset.uri, base64: asset.base64 ?? null, isNew: true }]);
      setPhotosChanged(true);
    }
  };

  const addMultiPhotoFromCamera = async () => {
    if (editPhotos.length >= 4) { showAlert('Limit reached', 'Maximum 4 photos per post.'); return; }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { showAlert('Camera access needed', 'Allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'], quality: 0.85, base64: true, allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setEditPhotos(prev => [...prev, { uri: asset.uri, base64: asset.base64 ?? null, isNew: true }]);
      setPhotosChanged(true);
    }
  };

  const acceptNewVideo = async (uri: string, mimeType: string | undefined) => {
    const result = await prepareVideoForUpload(uri, setPreparingVideo);
    if (result === 'too-large') {
      showAlert('Video too large', `Please pick or record a shorter clip (max ${MAX_VIDEO_BYTES / (1024 * 1024)} MB).`);
      return;
    }
    if (result === 'empty' || result === 'read-failed') {
      showAlert('Could not read video', 'Please try picking or recording it again.');
      return;
    }
    setNewVideoUri(result.uri);
    setNewVideoB64(result.base64);
    setNewVideoMime(mimeType);
    setVideoChange('replaced');
    setPhotoChange('removed'); setNewPhotoUri(null); setNewPhotoB64(null);
  };

  const pickNewVideo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { showAlert('Permission needed', 'Allow photo library access to pick a video.'); return; }
      await showPickerLoading();
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
      hidePickerLoading();
      if (res.canceled || !res.assets?.[0]) return;
      await acceptNewVideo(res.assets[0].uri, res.assets[0].mimeType);
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not open video library.');
    }
  };

  const recordNewVideo = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { showAlert('Camera access needed', 'Allow camera access in Settings to record a video.'); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return;
      await acceptNewVideo(res.assets[0].uri, res.assets[0].mimeType);
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not open camera.');
    }
  };

  const handleSave = async () => {
    if (!post) return;
    if (caption.trim().length > 500) {
      showAlert('Caption too long', 'Post caption must be 500 characters or fewer.');
      return;
    }
    if (containsProfanity(caption)) {
      setEditWarn(true);
      setCaption(censorText(caption));
      return;
    }
    setEditWarn(false);
    setSaving(true);
    try {
      const hasPhoto = isMultiPhoto
        ? editPhotos.length > 0
        : photoChange === 'replaced' ? !!newPhotoUri : photoChange !== 'removed' && !!post.photo_url;
      const finalOverlay = captionOverlay && hasPhoto ? overlayCaption.trim() || null : null;

      if (isMultiPhoto && photosChanged) {
        const newUris = editPhotos.map(p => p.uri);
        const newB64s = editPhotos.map(p => p.base64 ?? null);
        await onSave(post.id, caption.trim(), editPhotos.length === 0 ? 'removed' : 'replaced',
          null, null, videoChange, newVideoUri, newVideoB64, newVideoMime,
          finalOverlay, captionOverlay && hasPhoto,
          newUris, newB64s);
      } else {
        await onSave(post.id, caption.trim(), photoChange, newPhotoUri, newPhotoB64,
          videoChange, newVideoUri, newVideoB64, newVideoMime,
          finalOverlay, captionOverlay && hasPhoto);
      }
      onClose();
    } catch (e: any) {
      showAlert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const captionChanged  = caption.trim() !== (post?.caption ?? '').trim();
  const overlayChanged  = overlayCaption.trim() !== (post?.overlay_caption ?? '').trim() || captionOverlay !== !!post?.caption_overlay;
  const imageChanged    = photoChange !== 'none' || photosChanged;
  const videoEdited     = videoChange !== 'none';
  const canSave = (captionChanged || overlayChanged || imageChanged || videoEdited) && !saving && !preparingVideo;

  const displayPhoto = photoChange === 'removed' ? null
    : photoChange === 'replaced' ? newPhotoUri
    : post?.photo_url ?? null;

  const hasOriginalVideo = post?.media_type === 'video' && !!post?.video_url;
  const displayVideo = videoChange === 'removed' ? null
    : videoChange === 'replaced' ? newVideoUri
    : hasOriginalVideo ? post?.video_url : null;

  const hasOriginalPhoto = post?.media_type !== 'video' && !!post?.photo_url;
  const mediaWasRemoved = (hasOriginalVideo && videoChange === 'removed') || (hasOriginalPhoto && photoChange === 'removed');
  const restoreOriginal = () => {
    setPhotoChange('none'); setNewPhotoUri(null); setNewPhotoB64(null);
    setVideoChange('none'); setNewVideoUri(null); setNewVideoB64(null);
  };

  const hasAnyPhoto = isMultiPhoto ? editPhotos.length > 0 : !!displayPhoto;

  return (
    <BottomSheet visible={visible} onClose={pickerActive ? () => {} : onClose} title="Edit post"
      titleIcon={<Ionicons name="create-outline" size={16} color={ac} />} accent={ac}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          bounces={false}
          style={{ maxHeight: 500 }}
        >
          {/* ── Multi-photo grid editor ── */}
          {isMultiPhoto ? (
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {editPhotos.map((photo, idx) => (
                  <View key={photo.uri + idx} style={{ width: '47%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                    <Image source={{ uri: photo.uri }} cachePolicy="memory-disk"
                      style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    {photo.isNew && (
                      <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.55)',
                        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: '#fff', fontSize: TYPO.label, fontWeight: '700' }}>NEW</Text>
                      </View>
                    )}
                    <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity onPress={() => replaceMultiPhoto(idx)}
                        style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 5 }}>
                        <Ionicons name="swap-horizontal" size={14} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeMultiPhoto(idx)}
                        style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 5 }}>
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {editPhotos.length < 4 && (
                  <TouchableOpacity
                    onPress={() => showPhotoSourceMenu(addMultiPhotoFromCamera, addMultiPhotoFromLibrary)}
                    style={[ep.addPhotoBtn, { width: '47%', aspectRatio: 1, borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                    <Ionicons name="add-circle-outline" size={28} color={colors.textTertiary} />
                    <Text style={{ color: colors.textSecondary, fontSize: TYPO.caption, marginTop: 4 }}>Add photo</Text>
                  </TouchableOpacity>
                )}
              </View>
              {editPhotos.length === 0 && (
                <View style={[ep.removedBox, { backgroundColor: colors.inputBg, borderColor: colors.border, marginTop: 8 }]}>
                  <Ionicons name="images-outline" size={22} color={colors.textTertiary} />
                  <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, marginTop: 4 }}>All photos removed</Text>
                  <TouchableOpacity onPress={() => {
                    setEditPhotos((post?.photo_urls ?? []).map(u => ({ uri: u })));
                    setPhotosChanged(false);
                  }}
                    style={[ep.photoBtn, { backgroundColor: colors.inputBg, borderColor: colors.border, marginTop: 8 }]}>
                    <Text style={[ep.photoBtnTxt, { color: colors.textSecondary }]}>Restore originals</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <>
              {/* ── Video display ── */}
              {displayVideo ? (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ position: 'relative' }}>
                    <VideoView player={editVideoPlayer} style={{ width: '100%', height: 160, borderRadius: 12 }}
                      contentFit="cover" nativeControls={false} />
                    {videoChange === 'replaced' && (
                      <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)',
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700' }}>NEW VIDEO</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity onPress={() => showVideoSourceMenu(recordNewVideo, pickNewVideo)} disabled={preparingVideo}
                        style={[ep.photoBtn, { backgroundColor: colors.inputBg, borderColor: colors.border, flex: 1 }]}>
                        <Ionicons name="videocam-outline" size={14} color={colors.textSecondary} />
                        <Text style={[ep.photoBtnTxt, { color: colors.textSecondary }]}>Change video</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setVideoChange('removed'); setNewVideoUri(null); setNewVideoB64(null); }}
                        disabled={preparingVideo}
                        style={[ep.photoBtn, { backgroundColor: colors.dangerLight, borderColor: colors.danger + '40', flex: 1 }]}>
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                        <Text style={[ep.photoBtnTxt, { color: colors.danger }]}>Remove video</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : !displayPhoto ? (
                /* ── No media — show add options ── */
                <View style={{ marginBottom: 12 }}>
                  {mediaWasRemoved && (
                    <View style={[ep.removedBox, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 8 }]}>
                      <Ionicons name={hasOriginalVideo ? 'videocam-outline' : 'image-outline'} size={22} color={colors.textTertiary} />
                      <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, marginTop: 4 }}>
                        {hasOriginalVideo ? 'Video' : 'Photo'} removed
                      </Text>
                      <TouchableOpacity onPress={restoreOriginal}
                        style={[ep.photoBtn, { backgroundColor: colors.inputBg, borderColor: colors.border, marginTop: 8 }]}>
                        <Text style={[ep.photoBtnTxt, { color: colors.textSecondary }]}>Restore original</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={newPhotoUri ? undefined : () => showPhotoSourceMenu(takeNewPhoto, pickNewPhoto)}
                      style={[ep.addPhotoBtn, { borderColor: colors.border, backgroundColor: colors.inputBg, flex: 1 }]}>
                      {newPhotoUri ? (
                        <View style={{ position: 'relative' }}>
                          <Image source={{ uri: newPhotoUri }} cachePolicy="memory-disk" style={{ width: '100%', height: 130, borderRadius: 10 }} contentFit="cover" />
                          <TouchableOpacity onPress={() => { setPhotoChange(mediaWasRemoved ? 'removed' : 'none'); setNewPhotoUri(null); setNewPhotoB64(null); }}
                            style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)',
                              borderRadius: 12, padding: 4 }}>
                            <Ionicons name="close" size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={22} color={colors.textTertiary} />
                          <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, marginTop: 4 }}>Add a photo</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {videoPostsEnabled && !newPhotoUri && (
                      <TouchableOpacity onPress={() => showVideoSourceMenu(recordNewVideo, pickNewVideo)}
                        style={[ep.addPhotoBtn, { borderColor: colors.border, backgroundColor: colors.inputBg, flex: 1 }]}>
                        <Ionicons name="videocam-outline" size={22} color={colors.textTertiary} />
                        <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, marginTop: 4 }}>Add a video</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ) : null}

              {/* ── Single photo display ── */}
              {!displayVideo && !hasOriginalVideo && displayPhoto ? (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ position: 'relative' }}>
                    <Image source={{ uri: displayPhoto }} cachePolicy="memory-disk"
                      style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" />
                    {photoChange === 'replaced' && (
                      <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)',
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700' }}>NEW PHOTO</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity onPress={() => showPhotoSourceMenu(takeNewPhoto, pickNewPhoto)}
                        style={[ep.photoBtn, { backgroundColor: colors.inputBg, borderColor: colors.border, flex: 1 }]}>
                        <Ionicons name="image-outline" size={14} color={colors.textSecondary} />
                        <Text style={[ep.photoBtnTxt, { color: colors.textSecondary }]}>Change photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setPhotoChange('removed'); setNewPhotoUri(null); }}
                        style={[ep.photoBtn, { backgroundColor: colors.dangerLight, borderColor: colors.danger + '40', flex: 1 }]}>
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                        <Text style={[ep.photoBtnTxt, { color: colors.danger }]}>Remove photo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          )}

          {preparingVideo && (
            <View style={[ep.removedBox, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 12 }]}>
              <ActivityIndicator color={ac} />
              <Text style={{ color: colors.textSecondary, fontSize: TYPO.body, marginTop: 6 }}>Preparing video…</Text>
            </View>
          )}

          {/* Overlay caption toggle + input */}
          {hasAnyPhoto && (
            <View style={{ marginBottom: 12 }}>
              <TouchableOpacity
                onPress={() => setCaptionOverlay(v => !v)}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: captionOverlay ? 8 : 0 }}>
                <Ionicons name="text" size={14} color={captionOverlay ? ac : colors.textTertiary} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: captionOverlay ? ac : colors.textTertiary }}>
                  {captionOverlay ? 'Caption on photo ✓' : 'Add caption on photo'}
                </Text>
              </TouchableOpacity>
              {captionOverlay && (
                <View style={{ borderWidth: 1.5, borderColor: `${ac}50`, backgroundColor: `${ac}08`, borderRadius: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                    <Ionicons name="text" size={13} color={ac} />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: ac, flex: 1 }}>On-photo caption</Text>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: overlayCaption.length > 220 ? '#F59E0B' : colors.textTertiary }}>
                      {overlayCaption.length}/250
                    </Text>
                  </View>
                  <TextInput
                    style={{ fontSize: TYPO.body, minHeight: 48, textAlignVertical: 'top', lineHeight: 22, color: colors.textPrimary }}
                    placeholder="Text shown on the photo…"
                    placeholderTextColor={colors.placeholder}
                    value={overlayCaption}
                    onChangeText={t => setOverlayCaption(t.slice(0, 250))}
                    multiline
                    maxLength={250}
                  />
                </View>
              )}
            </View>
          )}

          {editWarn && (
            <View style={[eps.profanityBar, { backgroundColor: colors.warningLight, marginBottom: 8 }]}>
              <Ionicons name="warning-outline" size={13} color={colors.warningDark} />
              <Text style={[eps.profanityText, { color: colors.warningDark }]}>
                Offensive language removed — please keep it friendly
              </Text>
              <TouchableOpacity onPress={() => setEditWarn(false)} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
                <Ionicons name="close" size={13} color={colors.warningDark} />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: ac,
              alignItems: 'center', justifyContent: 'center', padding: 2 }}>
              <EmojiAvatar emoji={post?.pet?.emoji} name={post?.pet?.name ?? '?'} size={36} color={ac} avatarUrl={post?.pet?.avatar_url} />
            </View>
            <View style={{ flex: 1, position: 'relative' }}>
              {mentionQuery !== null && (
                <View style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50 }}>
                  <MentionDropdown
                    query={mentionQuery} colors={colors} accent={ac}
                    onSelect={(slug) => {
                      const result = insertMention(captionRef.current, cursorPos, slug);
                      captionRef.current = result.text;
                      setCaption(result.text);
                      setCursorPos(result.cursor);
                      setMentionQuery(null);
                    }}
                  />
                </View>
              )}
              <TextInput
                style={[eps.input, { color: colors.textPrimary, fontSize: TYPO.subheading, lineHeight: 25 }]}
                placeholder="What's on your mind…"
                placeholderTextColor={colors.placeholder}
                value={caption}
                onChangeText={t => {
                  captionRef.current = t;
                  setCaption(t);
                  setMentionQuery(getMentionQuery(t, cursorPos));
                  if (editWarn) setEditWarn(false);
                }}
                onSelectionChange={e => {
                  const pos = e.nativeEvent?.selection?.end ?? caption.length;
                  setCursorPos(pos);
                  setMentionQuery(getMentionQuery(captionRef.current, pos));
                }}
                multiline maxLength={500}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12, paddingLeft: 52 }}>
            <Text style={{ fontSize: TYPO.body, color: caption.length > 450 ? colors.warning : colors.textTertiary }}>
              {caption.length}/500
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
            <TouchableOpacity style={[eps.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[eps.sendBtn, { backgroundColor: canSave ? ac : colors.border }]}
              onPress={handleSave} disabled={!canSave}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="checkmark" size={16} color="#fff" />
                   <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Save changes</Text></>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </BottomSheet>
  );
}

export const EditPostSheet = React.memo(EditPostSheetBase);

// ── Styles ─────────────────────────────────────────────────────────────────────

const ep = StyleSheet.create({
  photoBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10,
                 paddingHorizontal: 12, paddingVertical: 7, justifyContent: 'center' },
  photoBtnTxt: { fontSize: TYPO.body, fontWeight: '600' },
  removedBox:  { alignItems: 'center', borderWidth: 1, borderRadius: 12, borderStyle: 'dashed', paddingVertical: 18 },
  addPhotoBtn: { alignItems: 'center', borderWidth: 1.5, borderRadius: 12, borderStyle: 'dashed', paddingVertical: 18, justifyContent: 'center' },
});

const eps = StyleSheet.create({
  profanityBar:  { flexDirection: 'row', alignItems: 'center', gap: 8,
                   paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, marginBottom: 6 },
  profanityText: { flex: 1, fontSize: TYPO.body, fontWeight: '600' },
  input:         { fontSize: TYPO.subheading, minHeight: 90, textAlignVertical: 'top', lineHeight: 24, marginBottom: 10 },
  cancelBtn:     { flex: 1, height: 52, borderWidth: 1.5, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sendBtn:       { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
});
