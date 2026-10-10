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

async function signedUrl(filePath: string): Promise<string> {
  console.log('[recordsDownload] createSignedUrl — path:', filePath);
  const { data, error } = await supabase.storage
    .from('medical-records')
    .createSignedUrl(filePath, 120);
  console.log('[recordsDownload] signedUrl result — url:', data?.signedUrl?.slice(0, 80), 'error:', error?.message);
  if (error || !data?.signedUrl) throw new Error(`Could not create download link: ${error?.message ?? 'unknown'}`);
  return data.signedUrl;
}

async function downloadBytesViaUrl(filePath: string): Promise<ArrayBuffer> {
  const url = await signedUrl(filePath);
  const res = await fetch(url);
  console.log('[recordsDownload] fetch status:', res.status, 'content-length:', res.headers.get('content-length'));
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  return res.arrayBuffer();
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

  const url  = await signedUrl(rec.file_path);
  const name = safeName(rec);
  const uri  = (FileSystem.cacheDirectory ?? '') + name;

  // Use native fetch → arrayBuffer → base64 → write.
  // FileSystem.downloadAsync returns 200 + 0 bytes for Supabase signed URLs
  // because it doesn't follow the storage redirect properly.
  console.log('[recordsDownload] fetch — url length:', url.length);
  const res = await fetch(url);
  console.log('[recordsDownload] fetch status:', res.status, 'content-length:', res.headers.get('content-length'));
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  console.log('[recordsDownload] arrayBuffer byteLength:', buf.byteLength);
  if (buf.byteLength === 0) throw new Error('Downloaded file is empty — storage may still be syncing, please retry');
  // arrayBuffer → base64 via Uint8Array + btoa (works in Hermes)
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  const info = await FileSystem.getInfoAsync(uri);
  console.log('[recordsDownload] written file info:', JSON.stringify(info));

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: mimeFor(name), dialogTitle: rec.title });
}

export async function downloadZip(recs: MedRecord[], zipName = 'medical-records.zip'): Promise<void> {
  const zip       = new JSZip();
  const usedNames = new Set<string>();

  await Promise.all(
    recs.filter(r => r.file_path).map(async (rec, idx) => {
      let name = safeName(rec, idx);
      if (usedNames.has(name)) name = `${idx + 1}_${name}`;
      usedNames.add(name);
      const buf = await downloadBytesViaUrl(rec.file_path!);
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
