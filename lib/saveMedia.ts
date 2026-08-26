/**
 * saveMediaToDevice — save a remote URL to the device photo library.
 *
 * Strategy (same on iOS and Android):
 *   1. Download the file to local cache.
 *   2. Request MediaLibrary permission.
 *      - Granted / limited (iOS 14+ limited selection) → saveToLibraryAsync → silent save.
 *      - Denied → inform user to open Settings, then fall through to share sheet.
 *      - Native module missing (Expo Go) → fall through to share sheet.
 *   3. Share sheet fallback: on iOS the sheet shows "Save Image / Save Video" natively;
 *      on Android the user picks "Save to Files" or any target app.
 *
 * Returns 'saved' | 'shared' | 'cancelled'.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform, ToastAndroid } from 'react-native';
import { showAlert } from '@/components/AppAlert';

export type SaveResult = 'saved' | 'shared' | 'cancelled';

export async function saveMediaToDevice(
  remoteUrl: string,
  mediaType: 'photo' | 'video' = 'photo',
): Promise<SaveResult> {
  // ── 1. Derive file extension and MIME type ────────────────────────────────
  const rawExt = remoteUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const ext = mediaType === 'video'
    ? (['mov', 'mp4', 'm4v'].includes(rawExt) ? rawExt : 'mp4')
    : (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg');

  const mimeType = mediaType === 'video'
    ? (ext === 'mov' ? 'video/quicktime' : 'video/mp4')
    : (ext === 'png' ? 'image/png' : 'image/jpeg');

  // iOS UTI — required for Sharing.shareAsync on iOS to show Save correctly
  const UTI = mediaType === 'video' ? 'public.movie' : 'public.image';

  // ── 2. Download to local cache ────────────────────────────────────────────
  const localPath = `${FileSystem.cacheDirectory}familycube_${Date.now()}.${ext}`;
  const { uri: localUri, status: httpStatus } = await FileSystem.downloadAsync(remoteUrl, localPath);
  if (httpStatus !== 200) throw new Error(`Download failed (HTTP ${httpStatus})`);

  // ── 3. Try MediaLibrary direct save ──────────────────────────────────────
  try {
    // writeOnly=true on Android: only requests WRITE permission, no READ needed for saving.
    const perm = await MediaLibrary.requestPermissionsAsync(true);

    const canSave =
      perm.status === 'granted' ||
      // iOS 14+ "limited" access still allows saving new photos to the library.
      (Platform.OS === 'ios' && (perm as any).accessPrivilege !== 'none');

    if (canSave) {
      await MediaLibrary.saveToLibraryAsync(localUri);
      // iOS already shows a native "Photo saved" system banner — no extra prompt needed.
      // Android has no native feedback, so show a brief non-blocking toast.
      if (Platform.OS === 'android') {
        ToastAndroid.show('Saved to gallery', ToastAndroid.SHORT);
      }
      return 'saved';
    }

    // User explicitly denied — explain before showing share sheet as alternative.
    if (perm.status === 'denied') {
      await new Promise<void>(resolve =>
        showAlert(
          'Gallery access needed',
          Platform.OS === 'ios'
            ? 'Go to Settings → Family Cube → Photos and allow access to save directly to your gallery.'
            : 'Go to Settings → Apps → Family Cube → Permissions → Photos and allow access.',
          [{ text: 'OK', onPress: () => resolve() }],
        )
      );
    }
  } catch {
    // MediaLibrary native module unavailable (Expo Go) — fall through to share sheet.
  }

  // ── 4. Share sheet fallback ───────────────────────────────────────────────
  // iOS: native sheet shows "Save Image" / "Save Video" at the top.
  // Android: user picks "Save to Files", "Downloads", or any target app.
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) return 'cancelled';

  await Sharing.shareAsync(localUri, { mimeType, dialogTitle: 'Save to your device', UTI });
  return 'shared';
}
