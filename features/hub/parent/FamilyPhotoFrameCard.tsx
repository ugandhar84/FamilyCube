/**
 * FamilyPhotoFrameCard — a small tilted "photo frame" shown beside the
 * greeting text on the Parent Hub, mirroring the photo-frame thumbnail seen
 * on other family-hub apps' Home tab header. Fully separate from the
 * Memories feed — its own storage path (uploadFamilyFramePhoto) and its own
 * table (family_photo_frame, one row per family_id+member_id — see the
 * family_photo_frame_per_member migration), so setting what's on the frame
 * never creates a Memories post and never reads from one.
 *
 * Scoped per PARENT, not per family: each parent has their own frame photo,
 * independent of what any other parent on the same family has set (this
 * card only ever renders on a parent's own Hub via ParentView.tsx — kids/
 * teens/grandparents never see it, so there's no other role to reconcile
 * this with).
 *
 * Empty state uses assets/empty/family-frame.jpg — a static illustration
 * (not generated at runtime) matching the app's warm/sepia tone.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { RADIUS, TYPO } from '@/constants/theme';
import { supabase, uploadFamilyFramePhoto, deleteFamilyFramePhoto } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import CubeSpinner from '@/components/CubeSpinner';

const EMPTY_FRAME_IMAGE = require('@/assets/empty/family-frame.jpg');

/**
 * Turns the Hub frame on/off — the only thing ProfileSettingsScreen.tsx's
 * "Family Photo" toggle does. Turning it on does NOT open a picker; it
 * just makes the (empty-illustration) frame appear on the Hub, where the
 * existing long-press-to-upload flow (below) is how a photo actually gets
 * set. Upserts frame_enabled without touching photo_url — a parent who
 * already has a photo and toggles off/on again keeps it (this never sends
 * photo_url: null), matching "off" meaning "don't show the card," not
 * "forget the photo."
 */
export async function setFamilyPhotoFrameEnabled(familyId: string, memberId: string, enabled: boolean): Promise<boolean> {
  try {
    const { error } = await supabase.from('family_photo_frame')
      .upsert({ family_id: familyId, member_id: memberId, frame_enabled: enabled, updated_by: memberId, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return true;
  } catch (e: any) {
    Alert.alert("Couldn't update setting", e?.message ?? 'Please try again.');
    return false;
  }
}

export function FamilyPhotoFrameCard({ colors, isDark, width = 124, height, onFrameStateChange }: {
  colors: any; isDark: boolean; width?: number; height?: number;
  // Was: this card always rendered, falling back to a static placeholder
  // illustration when no photo was set — reads as a half-finished/empty
  // frame taking up layout space rather than a deliberate design choice.
  // Live-requested: the frame should only appear at all once a parent has
  // explicitly turned it on via Profile settings (setFamilyPhotoFrameEnabled
  // above) — NOT merely once a photo exists, since turning it on shows the
  // empty illustration first (ready for long-press-to-upload), before any
  // photo is picked. Reports frame_enabled so the parent (TodayView.tsx)
  // can decide whether to render this card's column at all.
  onFrameStateChange?: (enabled: boolean) => void;
}) {
  const frameH = height ?? width * 1.25;
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const myId = activeMemberId ?? members[0]?.id ?? '';

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadLatest = useCallback(async () => {
    if (!myId) { setLoading(false); return; }
    // A real fetch failure (network, RLS) was previously indistinguishable
    // from "this parent genuinely has no photo set" — data came back
    // undefined either way and both fell through to the same empty-state
    // illustration with no way to tell which happened, and no retry path
    // short of a full app reload. Logging the error at least surfaces it in
    // dev/crash reporting; a failed load is retried automatically next time
    // this card remounts (e.g. navigating back to Hub).
    const { data, error } = await supabase.from('family_photo_frame')
      .select('photo_url, storage_path, frame_enabled').eq('family_id', familyId).eq('member_id', myId).maybeSingle();
    if (error) console.warn('[FamilyPhotoFrameCard] loadLatest failed:', error.message);
    setPhotoUrl(data?.photo_url ?? null);
    setStoragePath(data?.storage_path ?? null);
    setPhotoFailed(false);
    setLoading(false);
    // No row yet (this parent has never touched the setting) defaults to
    // enabled — matches the column's own DEFAULT true and the pre-existing
    // "frame always visible" behavior for anyone who hasn't opted out.
    onFrameStateChange?.(data ? data.frame_enabled : true);
  }, [familyId, myId, onFrameStateChange]);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  const uploadFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow photo library access in Settings to update the family frame.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.9,
      // Crop to the frame's own aspect ratio before upload — the frame is a
      // fixed 3:2 landscape, so letting the user pick which part of the
      // photo fills it avoids an automatic center-crop cutting off faces.
      allowsEditing: true, aspect: [3, 2],
    });
    if (res.canceled || !res.assets?.[0]) return;

    setUploading(true);
    try {
      const { signedUrl, path } = await uploadFamilyFramePhoto(familyId, myId, res.assets[0].uri);
      const { data, error } = await supabase.from('family_photo_frame')
        .upsert({ family_id: familyId, member_id: myId, photo_url: signedUrl, storage_path: path, frame_enabled: true, updated_by: myId, updated_at: new Date().toISOString() })
        .select('photo_url, storage_path').single();
      if (error) throw new Error(error.message);
      if (data) { setPhotoUrl(data.photo_url); setStoragePath(data.storage_path); setPhotoFailed(false); }
    } catch (e: any) {
      Alert.alert("Couldn't update frame", e?.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    Alert.alert('Remove frame photo?', "This deletes your photo completely — it can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          if (!storagePath) return;
          setUploading(true);
          try {
            await deleteFamilyFramePhoto(familyId, myId, storagePath);
            setPhotoUrl(null);
            setStoragePath(null);
            setPhotoFailed(false);
            // Removing the photo doesn't turn the frame off — it just goes
            // back to the empty illustration, still visible, still
            // long-press-able to set a new one. Only the Profile toggle
            // (setFamilyPhotoFrameEnabled) controls visibility.
          } catch (e: any) {
            Alert.alert("Couldn't remove photo", e?.message ?? 'Please try again.');
          } finally {
            setUploading(false);
          }
        },
      },
    ]);
  };

  const onLongPress = () => {
    if (!photoUrl || photoFailed) { uploadFromGallery(); return; }
    // An existing photo gets a choice — long-pressing straight into another
    // gallery picker with no way to instead just remove what's there was
    // the gap this whole feature request was about ("provide option to
    // delete existing photo completely").
    Alert.alert('Frame photo', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose new photo', onPress: uploadFromGallery },
      { text: 'Remove photo', style: 'destructive', onPress: removePhoto },
    ]);
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        style={{
          transform: [{ rotate: '4deg' }],
          width, height: frameH,
          borderRadius: RADIUS.lg, overflow: 'hidden',
          backgroundColor: colors.card, borderWidth: 5, borderColor: colors.card,
          shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 10,
          elevation: 6,
        }}
      >
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
            <CubeSpinner size={20} />
          </View>
        ) : photoUrl && !photoFailed ? (
          <ExpoImage source={{ uri: photoUrl }} style={{ flex: 1 }} contentFit="cover"
            cachePolicy="memory-disk" transition={180} onError={() => setPhotoFailed(true)} />
        ) : (
          <ExpoImage source={EMPTY_FRAME_IMAGE} style={{ flex: 1 }} contentFit="cover" />
        )}

        {uploading && (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)' }}>
            <CubeSpinner size={20} />
          </View>
        )}
      </Pressable>

      <Text style={{ marginTop: -2, fontSize: 9, fontWeight: '600', color: colors.textTertiary,
        transform: [{ rotate: '4deg' }] }}>
        Press hold to edit
      </Text>
    </View>
  );
}
