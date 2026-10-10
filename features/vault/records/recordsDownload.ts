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
  const base = rec.file_name
    ? rec.file_name.replace(/[^a-zA-Z0-9._\-]/g, '_')
    : `${rec.title.replace(/[^a-zA-Z0-9]/g, '_')}.${ext(rec)}`;
  return idx !== undefined ? `${String(idx + 1).padStart(2, '0')}_${base}` : base;
}

export async function downloadSingle(rec: MedRecord): Promise<void> {
  if (!rec.file_path) throw new Error('No file attached to this record');

  const url  = await signedUrl(rec.file_path);
  const name = safeName(rec);
  const uri  = (FileSystem.cacheDirectory ?? '') + name;

  // Let expo-file-system fetch the URL natively — no blob/base64 involved
  console.log('[recordsDownload] downloadAsync — url (first 80):', url.slice(0, 80), 'uri:', uri);
  const result = await FileSystem.downloadAsync(url, uri);
  console.log('[recordsDownload] downloadAsync result — status:', result.status, 'uri:', result.uri);
  // Check actual file size
  const info = await FileSystem.getInfoAsync(result.uri);
  console.log('[recordsDownload] file info after download:', JSON.stringify(info));
  if (result.status !== 200) throw new Error(`Download failed: HTTP ${result.status}`);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(result.uri, { mimeType: mimeFor(name), dialogTitle: rec.title });
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
