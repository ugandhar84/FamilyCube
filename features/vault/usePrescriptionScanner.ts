import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';

export interface ParsedMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  refills: number | null;
  prescriber: string;
  prescribed_date: string | null;
  pharmacy: string;
  notes: string;
}

export interface ParsedVaccine {
  vaccine_name: string;
  manufacturer: string;
  lot_number: string;
  administered_date: string | null;
  dose_number: number | null;
  total_doses: number | null;
  next_due_date: string | null;
  site: string;
  administered_by: string;
}

export type DocType = 'medication' | 'vaccine' | 'both';

export interface ScanResult {
  doc_type: DocType;
  medication?: ParsedMedication;
  vaccine?: ParsedVaccine;
  /** "low" means the model had trouble reading a field (often the dosage/
   * dose number) and left it blank rather than guessing — surface
   * confidenceNote so the user knows to double-check the original document
   * before trusting this as a real health record. */
  confidence?: 'high' | 'low';
  confidenceNote?: string;
  /** The document had more than one medication/vaccine listed but this
   * schema only extracts one entry per scan — additionalItemsNote
   * describes what else was found so nothing is silently lost. */
  additionalItemsFound?: boolean;
  additionalItemsNote?: string;
}

export interface PendingImage {
  base64: string;
  mimeType: string;
}

const MAX_PHOTOS = 3;

async function callEdgeFunction(images: PendingImage[]): Promise<Record<string, any>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  const supabaseUrl = (supabase as any).supabaseUrl as string;

  const res = await fetch(`${supabaseUrl}/functions/v1/parse-prescription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    // send first image as primary; additional images as extraPages
    body: JSON.stringify({
      imageBase64: images[0].base64,
      mimeType: images[0].mimeType,
      extraPages: images.slice(1).map(img => ({ imageBase64: img.base64, mimeType: img.mimeType })),
    }),
  });

  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

const PICKER_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  quality: 0.85,
  base64: true,
  allowsEditing: true,
  allowsMultipleSelection: false,
};

export function usePrescriptionScanner() {
  const [scanning, setScanning]         = useState(false);
  const [scanResult, setScanResult]     = useState<ScanResult | null>(null);
  const [showReview, setShowReview]     = useState(false);
  const [scanError, setScanError]       = useState<string | null>(null);
  /** Up to 3 images picked and cropped, waiting for optional redaction. */
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

  const pickImage = async (source: 'camera' | 'library') => {
    setScanError(null);
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { setScanError('Camera access needed. Please allow it in Settings.'); return; }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { setScanError('Photo library access needed. Please allow it in Settings.'); return; }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICKER_OPTS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTS);

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) { setScanError('Could not read image data. Please try again.'); return; }
      setPendingImages(prev => {
        if (prev.length >= MAX_PHOTOS) return prev; // cap at 3
        return [...prev, { base64: asset.base64!, mimeType: asset.mimeType ?? 'image/jpeg' }];
      });
    } catch (err: any) {
      setScanError(err.message ?? 'Could not open camera. Please try again.');
    }
  };

  /** Send all accumulated (possibly redacted) images to the AI edge function. */
  const scan = async (redactedImages: PendingImage[]) => {
    if (redactedImages.length === 0) return;
    setScanError(null);
    setScanning(true);
    try {
      const json = await callEdgeFunction(redactedImages);
      if (json.doc_type === 'none') {
        const what = json.reason ?? "This doesn't look like a prescription or vaccine record.";
        setScanError(`Not a medical document — ${what}\n\nPlease upload a prescription, pharmacy label, or immunization record.`);
        return;
      }
      setScanResult({
        doc_type: json.doc_type ?? 'medication',
        medication: json.medication,
        vaccine: json.vaccine,
        confidence: json.confidence,
        confidenceNote: json.confidence_note,
        additionalItemsFound: json.additional_items_found,
        additionalItemsNote: json.additional_items_note,
      });
      setPendingImages([]); // leave redact mode so review page shows
      setShowReview(true);
    } catch (err: any) {
      console.error('[usePrescriptionScanner]', err);
      setScanError(err.message ?? 'Could not parse. Please try again or enter details manually.');
    } finally {
      setScanning(false);
    }
  };

  /** PDF path: pick → read → scan directly (no redact step for PDFs). */
  const pickAndScan = async (source: 'document') => {
    setScanError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      if ((asset.size ?? 0) > 5 * 1024 * 1024) {
        setScanError('PDF is too large (max 5 MB). Please use a smaller file or take a photo instead.');
        return;
      }
      const resp  = await fetch(asset.uri);
      const buf   = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary  = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      await scan([{ base64: btoa(binary), mimeType: 'application/pdf' }]);
    } catch (err: any) {
      console.error('[usePrescriptionScanner]', err);
      setScanError(err.message ?? 'Could not read PDF. Please try again.');
    }
  };

  const removeImage    = (idx: number) => setPendingImages(prev => prev.filter((_, i) => i !== idx));
  const clearPending   = ()            => setPendingImages([]);

  const clearScan = () => {
    setScanResult(null);
    setShowReview(false);
    setScanError(null);
    setPendingImages([]);
  };

  return {
    scanning, scanResult, showReview, scanError,
    pendingImages, maxPhotos: MAX_PHOTOS,
    pickImage, scan, pickAndScan,
    removeImage, clearPending, clearScan, setScanResult,
  };
}
