// Download helper for medical record files.
// Single file → signed URL + FileSystem.downloadAsync → share.
// Multiple files → bundle as ZIP + share.
//
// NOTE: Supabase storage .download() returns a Blob. On React Native/Hermes,
// Blob.arrayBuffer() is not implemented and FileReader.readAsDataURL sometimes
// returns an empty result for large files. We bypass all blob handling for
// single-file download by creating a short-lived signed URL and letting
// expo-file-system fetch it natively. The zip path uses the same signed URL
// approach to get a real ArrayBuffer via native fetch.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing    from 'expo-sharing';
import JSZip           from 'jszip';
import { supabase }    from '@/lib/supabase';
import type { MedRecord } from './types';
import { decryptFileBytes } from '@/lib/fileCrypto';

async function signedUrl(filePath: string, bucket: 'medical-records' | 'medical-audio' = 'medical-records'): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 120);
  if (error || !data?.signedUrl) throw new Error(`Could not create download link: ${error?.message ?? 'unknown'}`);
  return data.signedUrl;
}

export async function downloadBytesViaUrl(filePath: string, familyId: string, bucket: 'medical-records' | 'medical-audio' = 'medical-records'): Promise<ArrayBuffer> {
  const url = await signedUrl(filePath, bucket);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  // Files are stored encrypted with the family key; older uploads are plain and pass through.
  const plain = await decryptFileBytes(familyId, new Uint8Array(await res.arrayBuffer()));
  return plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) as ArrayBuffer;
}

function ext(rec: MedRecord): string {
  if (rec.file_name) {
    const parts = rec.file_name.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  }
  if (rec.file_path) {
    const parts = rec.file_path.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  }
  return 'bin';
}

function safeName(rec: MedRecord, idx?: number): string {
  const raw = rec.file_name ?? `${rec.title}.${ext(rec)}`;
  // Replace non-alphanumeric (except . - _) with underscore, then collapse
  // runs of underscores and strip leading/trailing ones, then prefix FC_
  const cleaned = raw
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = `FC_${cleaned || 'document.bin'}`;
  return idx !== undefined ? `${String(idx + 1).padStart(2, '0')}_${base}` : base;
}

export async function downloadSingle(rec: MedRecord): Promise<void> {
  if (!rec.file_path) throw new Error('No file attached to this record');

  const name = safeName(rec);
  const uri  = (FileSystem.cacheDirectory ?? '') + name;

  // Use native fetch → arrayBuffer → decrypt → base64 → write.
  // FileSystem.downloadAsync returns 200 + 0 bytes for Supabase signed URLs
  // because it doesn't follow the storage redirect properly.
  const buf = await downloadBytesViaUrl(rec.file_path, rec.family_id);
  if (buf.byteLength === 0) throw new Error('Downloaded file is empty — storage may still be syncing, please retry');
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: mimeFor(name), dialogTitle: rec.title });
}

/** A visit recording's raw audio (medical-audio bucket), decrypted, handed to the share sheet. */
export async function downloadVisitAudio(rec: MedRecord): Promise<void> {
  if (!rec.file_path) throw new Error('No audio attached to this visit');
  const buf = await downloadBytesViaUrl(rec.file_path, rec.family_id, 'medical-audio');
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const uri = (FileSystem.cacheDirectory ?? '') + (rec.file_name ?? 'visit.m4a').replace(/[^a-zA-Z0-9._-]/g, '_');
  await FileSystem.writeAsStringAsync(uri, btoa(binary), { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: 'audio/mp4', dialogTitle: rec.title });
}

export async function downloadZip(recs: MedRecord[], zipName = 'medical-records.zip'): Promise<void> {
  const zip       = new JSZip();
  const usedNames = new Set<string>();

  await Promise.all(
    recs.filter(r => r.file_path).map(async (rec, idx) => {
      let name = safeName(rec, idx);
      if (usedNames.has(name)) name = `${idx + 1}_${name}`;
      usedNames.add(name);
      const buf = await downloadBytesViaUrl(rec.file_path!, rec.family_id);
      zip.file(name, buf);
    }),
  );

  const zipBlob: Blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const zipUri = (FileSystem.cacheDirectory ?? '') + zipName;

  // For the zip blob we still need FileReader — JSZip only outputs Blob here,
  // and this is a generated blob (not from storage) so it's reliably readable.
  const reader = new FileReader();
  const b64: string = await new Promise((resolve, reject) => {
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(zipBlob);
  });

  await FileSystem.writeAsStringAsync(zipUri, b64, { encoding: FileSystem.EncodingType.Base64 });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(zipUri, {
    mimeType: 'application/zip',
    dialogTitle: `${recs.length} medical records`,
    UTI: 'public.zip-archive',
  });
}

function mimeFor(filename: string): string {
  const e = filename.split('.').pop()?.toLowerCase();
  if (e === 'pdf')  return 'application/pdf';
  if (e === 'png')  return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'heic') return 'image/heic';
  return 'application/octet-stream';
}
