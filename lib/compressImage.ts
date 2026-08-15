import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Resize + compress an image to a target size suitable for AI/storage.
 * @param uri      local file URI from ImagePicker
 * @param maxWidth max width in px (default 900 — good for receipts/docs)
 * @param quality  JPEG quality 0–1 (default 0.5 → ~100-200 KB for a typical photo)
 * @returns        compressed local URI + base64 string
 */
export async function compressImage(
  uri: string,
  maxWidth = 900,
  quality = 0.5,
): Promise<{ uri: string; base64: string }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return { uri: result.uri, base64: result.base64 ?? '' };
}
