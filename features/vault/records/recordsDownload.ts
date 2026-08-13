// Download helper for medical record files.
// Single file → save to device cache + share in original format.
// Multiple files → bundle as ZIP + share.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing    from 'expo-sharing';
import JSZip           from 'jszip';
import { supabase }    from '@/lib/supabase';
import type { MedRecord } from './types';

async function downloadBytes(filePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from('medical-records')
    .download(filePath);
  if (error || !data) throw new Error(`Download failed: ${error?.message ?? 'unknown'}`);
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
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

  const bytes  = await downloadBytes(rec.file_path);
  const name   = safeName(rec);
  const uri    = FileSystem.cacheDirectory + name;

  // Write raw bytes via base64
  const b64 = Buffer.from(bytes).toString('base64');
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: mimeFor(name), dialogTitle: rec.title });
}

export async function downloadZip(recs: MedRecord[], zipName = 'medical-records.zip'): Promise<void> {
  const zip  = new JSZip();
  const usedNames: Set<string> = new Set();

  await Promise.all(
    recs.filter(r => r.file_path).map(async (rec, idx) => {
      let name = safeName(rec, idx);
      // Deduplicate filenames
      if (usedNames.has(name)) name = `${idx + 1}_${name}`;
      usedNames.add(name);
      const bytes = await downloadBytes(rec.file_path!);
      zip.file(name, bytes);
    }),
  );

  const zipBlob: Blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const zipUri = FileSystem.cacheDirectory + zipName;

  // Blob → base64
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
