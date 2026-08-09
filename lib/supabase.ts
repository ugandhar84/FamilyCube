import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as ImageManipulator from 'expo-image-manipulator';
import { todayLocal } from '@/lib/dates';
import { markNetworkOffline, markNetworkOnline, isNetworkError } from '@/lib/networkStore';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL      ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️  PawBond: Supabase credentials missing.\n' +
    'Create a .env file with:\n' +
    '  EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key'
  );
}

// ── Debug fetch wrapper ───────────────────────────────────────────────────────
// Logs every Supabase REST / Storage / Functions request + response.
// Set EXPO_PUBLIC_SUPABASE_DEBUG=false to silence in production.
const DEBUG_SB = process.env.EXPO_PUBLIC_SUPABASE_DEBUG === 'true';

function extractLabel(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    // /rest/v1/TABLE  →  TABLE
    const restIdx = parts.indexOf('v1');
    if (restIdx !== -1 && parts[restIdx + 1]) return `[DB] ${parts[restIdx + 1]}`;
    // /storage/v1/object/... → storage
    if (parts.includes('storage')) return `[Storage] ${parts.slice(-2).join('/')}`;
    // /functions/v1/FUNC  →  fn:FUNC
    const fnIdx = parts.indexOf('v1', parts.indexOf('functions'));
    if (fnIdx !== -1 && parts[fnIdx + 1]) return `[Fn] ${parts[fnIdx + 1]}`;
    return `[SB] ${u.pathname}`;
  } catch {
    return '[SB]';
  }
}

const debugFetch: typeof fetch = async (input, init) => {
  const url    = typeof input === 'string' ? input : (input as Request).url;
  const method = init?.method ?? 'GET';
  const label  = extractLabel(url);

  if (DEBUG_SB) {
    const body = init?.body;
    const bodyPreview = typeof body === 'string'
      ? (body.length > 200 ? body.slice(0, 200) + '…' : body)
      : body instanceof FormData ? '[FormData]' : body ? '[binary]' : undefined;
    console.log(`🔵 ${method} ${label}`, bodyPreview ? `body: ${bodyPreview}` : '');
  }

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    if (isNetworkError(err)) markNetworkOffline();
    throw err;
  }
  const ms = Date.now() - t0;
  if (res.ok) markNetworkOnline();

  if (DEBUG_SB) {
    if (res.ok) {
      console.log(`✅ ${method} ${label} ${res.status} (${ms}ms)`);
    } else {
      // Clone so body can still be read by the caller
      const clone = res.clone();
      const errText = await clone.text().catch(() => '');
      console.warn(`❌ ${method} ${label} ${res.status} (${ms}ms)`, errText.slice(0, 300));
    }
  }
  return res;
};

export const supabase = createClient(
  supabaseUrl      || 'https://placeholder.supabase.co',
  supabaseAnonKey  || 'placeholder-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: debugFetch },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Storage bucket layout (all pet + user media lives in the "pets" bucket)
//
//   pets/
//     users/<userId>/avatar/         ← human user profile photo
//     <petId>/profile/               ← pet avatar / cover photo
//     <petId>/mood/                  ← AI mood-scan captures
//     <petId>/gallery/               ← manually uploaded pet photos
//     <petId>/year-in-review/        ← highlight video clips (future)
//     users/<userId>/pet-drafts/     ← temp avatar during new-pet creation
//                                       (no petId yet; safe to leave orphaned)
//
//   health-records/  (separate bucket — medical docs, stricter RLS)
//     <petId>/
//
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET        = 'pets';
const PRIVATE_BUCKET = 'pet-media'; // private bucket — gallery + mood photos (family-only)

// Signed URL expiry: 1 year. Private bucket ensures the path is not guessable;
// the signed token adds a second layer so even known paths require a valid token.
const SIGNED_URL_EXPIRY_SECONDS = 31_536_000;

/** Generate a short-lived signed URL for a private pet-media object. */
async function createSignedMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Failed to sign URL');
  return data.signedUrl;
}

// Daily upload limits per pet (enforced client-side; checked server-side via RLS count)
export const GALLERY_DAILY_LIMIT = 4;
export const MOOD_DAILY_LIMIT    = 3;   // already enforced in home screen
// ── Compression targets ───────────────────────────────────────────────────────
// Keep these as the single source of truth — tune here, nowhere else.
//   avatar   : faces fill most of frame; 480px is plenty at display size
//   gallery  : full pet photo, shown large → 1080px, 0.78 quality
//   social   : feed card (already 1080px in uploadSocialPhoto — kept there)
//   mood     : only shown in small tile + care notes card → 960px
//   daily    : tiny log thumbnail → 640px (already set in uploadDailyPhoto)
//   feedback : diagnostic screenshot, must be legible → 1080px
//   insurance: document clarity matters → 1200px, slightly higher quality
const COMPRESS = {
  avatar:    { width: 480,  quality: 0.75 },
  gallery:   { width: 1080, quality: 0.78 },
  mood:      { width: 960,  quality: 0.75 },
  feedback:  { width: 1080, quality: 0.75 },
  insurance: { width: 1200, quality: 0.80 },
  default:   { width: 1280, quality: 0.72 },
} as const;

async function compressImage(
  uri: string,
  opts: { width: number; quality: number },
): Promise<{ uri: string; base64: string }> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: opts.width } }],
      { compress: opts.quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return { uri: result.uri, base64: result.base64! };
  } catch {
    // Fallback: try without resize (e.g. already smaller than target)
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: opts.quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return { uri: result.uri, base64: result.base64! };
  }
}

// Legacy alias used by uploadMoodPhoto slow-path and uploadPetGalleryPhoto slow-path
async function resizeImage(uri: string): Promise<{ uri: string; base64?: string }> {
  return compressImage(uri, COMPRESS.default);
}

// Shared: encode a local file URI to an uploadable body.
// Prefers base64 (avoids fetch(file://) which returns 0 bytes on Android).
async function encodeBody(
  localUri: string,
  base64Data: string | null,
): Promise<ArrayBuffer | Blob> {
  if (base64Data) {
    const binary = atob(base64Data);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  return fetch(localUri).then(r => r.blob());
}

async function uploadToStorage(
  path: string,
  body: ArrayBuffer | Blob,
  mimeType: string,
  upsert = false,
): Promise<string> {
  const bodySize = body instanceof ArrayBuffer ? body.byteLength : (body as Blob).size;
  console.log(`[Storage] uploading to ${path}, size=${bodySize} bytes, mime=${mimeType}, upsert=${upsert}`);
  // A 0-byte upload is never a legitimate outcome anywhere this helper is used
  // (avatar/pet/mood/gallery/social photos, video) — it silently produces a
  // broken file that "succeeds" with no error until playback/display. Fail
  // loudly instead so the caller can retry or roll back.
  if (bodySize === 0) throw new Error('Encoded upload body is 0 bytes — the source file may be empty or unreadable.');

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { upsert, contentType: mimeType });
  if (error) {
    console.error('[Storage] ❌ upload error:', error.message, error);
    throw new Error(error.message);
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  console.log('[Storage] ✅ uploaded, publicUrl:', data.publicUrl);
  return data.publicUrl;
}

// ── User profile avatar ───────────────────────────────────────────────────────
// Path: users/<userId>/avatar/<timestamp>.<ext>
export async function uploadUserAvatar(
  localUri: string,
  base64Data: string | null,
  mimeType = 'image/jpeg',
): Promise<string> {
  console.log('[uploadUserAvatar] localUri:', localUri, 'b64 length:', base64Data?.length ?? 'null', 'mime:', mimeType);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { console.error('[uploadUserAvatar] ❌ no session'); throw new Error('No session'); }
  console.log('[uploadUserAvatar] session user:', session.user.id);
  const path = `users/${session.user.id}/avatar/${Date.now()}.jpg`;
  console.log('[uploadUserAvatar] storage path:', path);
  const { base64 } = await compressImage(localUri, COMPRESS.avatar);
  const encoded = await encodeBody('', base64);
  console.log('[uploadUserAvatar] encoded body size:', encoded instanceof ArrayBuffer ? encoded.byteLength : (encoded as Blob).size);
  return uploadToStorage(path, encoded, 'image/jpeg', true);
}

// ── Feedback screenshot ───────────────────────────────────────────────────────
// Path: <userId>/<timestamp>.<ext>  — private bucket, admin reads via service role
export async function uploadFeedbackScreenshot(
  localUri: string,
  base64Data: string | null,
  mimeType = 'image/jpeg',
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No session');
  const path = `${session.user.id}/${Date.now()}.jpg`;
  const { base64 } = await compressImage(localUri, COMPRESS.feedback);
  const encoded = await encodeBody('', base64);
  const { error } = await supabase.storage
    .from('feedback')
    .upload(path, encoded, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path; // store path; admin generates signed URL when viewing
}

// ── Pet avatar / cover photo ──────────────────────────────────────────────────
// Path: <petId>/profile/<timestamp>.<ext>
// Pass petId when available (edit flow). Omit during new-pet creation (no ID yet)
// → falls back to users/<userId>/pet-drafts/ so ownership is still clear.
export async function uploadPetAvatar(
  localUri: string,
  base64Data: string | null,
  mimeType = 'image/jpeg',
  petId?: string,
): Promise<string> {
  let path: string;
  if (petId) {
    path = `${petId}/profile/${Date.now()}.jpg`;
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session');
    path = `users/${session.user.id}/pet-drafts/${Date.now()}.jpg`;
  }
  const { base64 } = await compressImage(localUri, COMPRESS.avatar);
  return uploadToStorage(path, await encodeBody('', base64), 'image/jpeg', true);
}

// ── Daily care log photo ─────────────────────────────────────────────────────
// Path: <petId>/daily/<category>/<timestamp>.jpg
// Compressed harder than avatars — max 640px, quality 0.5
export async function uploadDailyPhoto(
  petId: string,
  category: string, // 'meal' | 'activity' | 'grooming'
  localUri: string,
): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 640 } }],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const body = await encodeBody(compressed.uri, compressed.base64 ?? null);
  const path = `${petId}/daily/${category}/${Date.now()}.jpg`;
  return uploadToStorage(path, body, 'image/jpeg', false);
}

// ── Sponsored listing asset (logo / cover) ───────────────────────────────────
// Path: sponsored/<type>/<timestamp>.jpg  (always in 'pets' bucket)
// Admin-only; storage RLS checked via is_admin on profiles.
export async function uploadSponsoredAsset(
  type: 'logo' | 'cover',
  localUri: string,
): Promise<string> {
  const width = type === 'cover' ? 1200 : 400;
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const body = await encodeBody(compressed.uri, compressed.base64 ?? null);
  const path = `sponsored/${type}/${Date.now()}.jpg`;
  return uploadToStorage(path, body, 'image/jpeg', false);
}

// ── Recommendation / sponsored media (image, GIF, or video) ─────────────────
// base64Data must be read at pick time via FileSystem.readAsStringAsync (legacy).
// Callers must never re-read from the URI later — temp files may be gone by then.
// GIF/video: uploaded from base64 bytes directly (same as uploadSocialVideo).
// Still image: compressed first then uploaded from base64.
export async function uploadRecommendationMedia(
  localUri: string,
  mimeType: string,
  base64Data: string,
): Promise<string> {
  // Detect by mimeType AND uri extension so QuickTime (.quicktime) and other
  // formats with missing/undefined mimeType are caught reliably.
  const lcUri   = localUri.toLowerCase();
  const isVideo = mimeType.startsWith('video/')
    || lcUri.endsWith('.mov') || lcUri.endsWith('.mp4')
    || lcUri.endsWith('.quicktime') || lcUri.endsWith('.avi') || lcUri.endsWith('.m4v');
  const isGif   = mimeType === 'image/gif' || lcUri.endsWith('.gif');

  const ext = isGif ? 'gif' : isVideo ? 'mp4' : 'jpg';
  // Always store videos as video/mp4 regardless of input mime type — QuickTime MOV
  // from iOS is H.264/AAC which is fully compatible with the MP4 container, and
  // this ensures Android ExoPlayer can play the file without needing a separate upload.
  const effectiveMime = isVideo ? 'video/mp4' : (isGif ? mimeType : 'image/jpeg');
  const folder = isVideo ? 'videos' : isGif ? 'gifs' : 'images';
  const path = `sponsored/recommendations/${folder}/${Date.now()}.${ext}`;

  if (isGif || isVideo) {
    if (!base64Data) throw new Error('No media data — please pick the file again.');
    const binary = atob(base64Data);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return uploadToStorage(path, bytes.buffer, effectiveMime, false);
  }

  // Still image: compress then upload
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 1200 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return uploadToStorage(path, await encodeBody(compressed.uri, compressed.base64 ?? null), 'image/jpeg', false);
}

// Upload video for Android playback — always forces video/mp4 + .mp4 extension
// so ExoPlayer can decode it regardless of what iOS reports as the mime type.
export async function uploadAndroidVideo(base64Data: string): Promise<string> {
  if (!base64Data) throw new Error('No video data — please pick the file again.');
  const path = `sponsored/recommendations/videos/${Date.now()}_android.mp4`;
  const binary = atob(base64Data);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return uploadToStorage(path, bytes.buffer, 'video/mp4', false);
}

// ── AI mood-scan photo ────────────────────────────────────────────────────────
// Path: <petId>/mood/<timestamp>.jpg
export async function uploadMoodPhoto(
  petId: string,
  localUri: string,
  base64Data: string | null,
  mimeType = 'image/jpeg',
): Promise<string> {
  const path = `${petId}/mood/${Date.now()}.jpg`;
  // Always compress — mood photos display small (tile + care card); 960px is generous.
  const { base64 } = await compressImage(localUri, COMPRESS.mood);
  const body = await encodeBody('', base64);

  // Upload to private bucket and return a signed URL so only family members can view.
  const bodySize = body instanceof ArrayBuffer ? body.byteLength : (body as Blob).size;
  if (bodySize === 0) throw new Error('Encoded upload body is 0 bytes');
  const { error } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return createSignedMediaUrl(path);
}

// ── Gallery photo (manual upload from camera roll) ────────────────────────────
// Path: <petId>/gallery/<timestamp>.<ext>
// Also inserts a row in pet_photos so the Memories screen can query it.
export async function uploadPetGalleryPhoto(
  petId: string,
  localUri: string,
  base64Data: string | null,
  mimeType = 'image/jpeg',
  takenAt?: string,   // YYYY-MM-DD, defaults to today
  caption?: string,
): Promise<string> {
  const path = `${petId}/gallery/${Date.now()}.jpg`;
  // Always compress — gallery photos are shown in a grid/lightbox at 1080px max.
  const { base64: galleryB64 } = await compressImage(localUri, COMPRESS.gallery);
  const galleryBody = await encodeBody('', galleryB64);
  const fileSizeBytes = (galleryBody as ArrayBuffer).byteLength;
  if (fileSizeBytes === 0) throw new Error('Encoded upload body is 0 bytes — the source file may be empty or unreadable.');

  // Upload to private bucket — family-only access enforced at storage level.
  const { error: upErr } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .upload(path, galleryBody, { contentType: 'image/jpeg' });
  if (upErr) throw new Error(upErr.message);
  const signedUrl = await createSignedMediaUrl(path);

  const today = todayLocal();
  const { error } = await supabase.from('pet_photos').insert({
    pet_id: petId,
    url: signedUrl,
    storage_path: path,   // stored for future signed URL refresh
    caption: caption ?? null,
    taken_at: takenAt ?? today,
    file_size_bytes: fileSizeBytes,
  });
  if (error) throw new Error(error.message);

  return signedUrl;
}

export async function deletePetGalleryPhotos(
  photoIds: string[],
): Promise<void> {
  // Fetch storage paths first so we can remove from bucket
  const { data, error: fetchErr } = await supabase
    .from('pet_photos')
    .select('id,storage_path')
    .in('id', photoIds);
  if (fetchErr) throw new Error(fetchErr.message);

  // Delete DB rows
  const { error: delErr } = await supabase
    .from('pet_photos')
    .delete()
    .in('id', photoIds);
  if (delErr) throw new Error(delErr.message);

  // Remove from storage (best-effort — ignore missing files)
  const paths = (data ?? []).map((r: any) => r.storage_path).filter(Boolean);
  if (paths.length) {
    await supabase.storage.from(PRIVATE_BUCKET).remove(paths);
  }
}

export async function uploadSocialPhoto(
  userId: string,
  localUri: string,
  base64Data: string | null,
  suffix?: number,
): Promise<{ url: string; fileSizeBytes: number }> {
  const path = `users/${userId}/social/${Date.now()}${suffix !== undefined ? `_${suffix}` : ''}.jpg`;
  const resolved = base64Data
    ? await (async () => {
        let b64 = base64Data;
        try {
          // Try to resize via the file URI (faster, better compression).
          // If the temp file is stale (e.g. user waited before tapping Post),
          // fall back to the base64 we already captured at edit time.
          const resized = await ImageManipulator.manipulateAsync(
            localUri, [{ resize: { width: 1080 } }],
            { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );
          b64 = resized.base64 ?? base64Data;
        } catch { /* temp file stale — use captured base64 as-is */ }
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer as ArrayBuffer;
      })()
    : await fetch(localUri).then(r => r.blob());
  const fileSizeBytes = resolved instanceof ArrayBuffer ? resolved.byteLength : (resolved as Blob).size;
  const url = await uploadToStorage(path, resolved, 'image/jpeg', false);
  return { url, fileSizeBytes };
}

// ── Comment photo (thumbnail) ─────────────────────────────────────────────────
// Comments display small (4:3 bubble), so compress to 640px max, quality 0.65.
export async function uploadCommentPhoto(
  userId: string,
  localUri: string,
): Promise<string> {
  const path = `users/${userId}/comments/${Date.now()}.jpg`;
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 640 } }],
    { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const binary = atob(compressed.base64!);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return uploadToStorage(path, bytes.buffer as ArrayBuffer, 'image/jpeg', false);
}

// ── Social video ──────────────────────────────────────────────────────────────
// Mirrors uploadSocialPhoto exactly: the caller reads the file's base64 once,
// right after picking/compressing (while the picker's temp file is definitely
// still fresh), and hands the bytes here directly — no re-reading from a file
// path later, which is what caused silent 0-byte uploads. Two earlier upload
// mechanisms (fetch().blob() and FileSystem.createUploadTask/BINARY_CONTENT)
// both produced 0-byte objects for video in this environment, likely because
// by the time the actual upload ran (whenever the user finished composing and
// tapped Post), the compressor's temp output file had already been cleaned up
// — base64 captured immediately at pick time has no such staleness window.
export async function uploadSocialVideo(
  userId: string, base64Data: string, mimeType = 'video/mp4',
  onProgress?: (fraction: number) => void,
): Promise<{ url: string; fileSizeBytes: number }> {
  if (!base64Data) throw new Error('No video data to upload — please pick or record it again.');
  const ext = mimeType.includes('quicktime') || mimeType.includes('mov') ? 'mov' : 'mp4';
  const path = `users/${userId}/social/${Date.now()}.${ext}`;

  onProgress?.(0.2);
  const binary = atob(base64Data);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  onProgress?.(0.6);

  const url = await uploadToStorage(path, bytes.buffer, mimeType, false);
  onProgress?.(1);
  return { url, fileSizeBytes: bytes.byteLength };
}

// ── Pet insurance document (photo or PDF of the policy) ────────────────────────
export async function uploadInsuranceDoc(petId: string, localUri: string, mimeType = 'image/jpeg'): Promise<string> {
  const isPdf = mimeType.includes('pdf');
  const ext   = isPdf ? 'pdf' : 'jpg';
  const path  = `${petId}/insurance/${Date.now()}.${ext}`;
  if (isPdf) {
    const blob = await fetch(localUri).then(r => r.blob());
    return uploadToStorage(path, blob, mimeType, false);
  }
  // Compress image — document clarity still matters so quality is higher
  const { base64 } = await compressImage(localUri, COMPRESS.insurance);
  return uploadToStorage(path, await encodeBody('', base64), 'image/jpeg', false);
}
