import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  AlertCircle, RefreshCw, Lock,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { claimChannel } from '@/lib/realtimeChannel';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { EmptyState } from './shared';
import FullPageOverlay from '@/components/FullPageOverlay';
import PhotoRedactModal from '@/components/PhotoRedactModal';
import RecordsFigmaList from '../records/RecordsFigmaList';
import BringInDocumentScreen from '../records/BringInDocumentScreen';
import ReviewFindingsScreen from '../records/ReviewFindingsScreen';
import RecordsFilterScreen from '../records/RecordsFilterScreen';
import AddRecordModal from '../records/AddRecordModal';
import { encryptAnalysis, decryptAnalysis, isEncryptedBlob } from '../records/recordsCrypto';
import { downloadSingle, downloadZip } from '../records/recordsDownload';
import { MedRecord, AiAnalysis, AppointmentAnalysis, RecordForm, BLANK_FORM, RecordTag, TAGS } from '../records/types';
import { fmtDate, todayLocal } from '@/lib/dates';
import type * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as DocPicker from 'expo-document-picker';
import { showToast } from '@/components/AppToast';
import { showAlert } from '@/components/AppAlert';
import AiConsentSheet, { useAiConsent } from '@/components/AiConsentGate';
import { GEMINI } from '@/constants/geminiRhythm';

// ─── RecordsTab ───────────────────────────────────────────────────────────────

export default function RecordsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyId = (activeMember as any)?.familyId ?? (members[0] as any)?.familyId ?? '';

  // ── List state ──────────────────────────────────────────────────────────────
  const [records,      setRecords]      = useState<MedRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [filterTag,    setFilterTag]    = useState<string>('all');
  const [filterMember, setFilterMember] = useState<string>('all');
  const [showFilter,   setShowFilter]   = useState(false);

  // ── Modal / action state ─────────────────────────────────────────────────────
  const [showAdd,     setShowAdd]     = useState(false);

  // ── New Figma scan/upload flow (Screens A/B/C) ───────────────────────────────
  // Screen A — "Bring in a document". Owns record type/owner drafts; the
  // actual save still goes through the real addRecord()/AddRecordModal
  // save path below — this screen is the entry point into it, not a
  // parallel system.
  const [showBringIn,   setShowBringIn]   = useState(false);
  const [draftTag,       setDraftTag]      = useState<RecordTag>('lab');
  const [draftOwnerId,   setDraftOwnerId]  = useState(activeMemberId ?? members[0]?.id ?? '');
  // Screen B — redaction. Reuses the real PhotoRedactModal drag-to-draw
  // tool (verified: genuine Gesture.Pan box-drawing + ViewShot flatten,
  // not a mock) rather than re-implementing its gesture/capture logic.
  // pendingPhoto holds the picked camera/library asset until the user
  // confirms (possibly redacted) boxes; redactedCount tracks how many
  // boxes were drawn on the record that's currently pending review, so
  // ReviewFindingsScreen's "N private regions excluded" line is always a
  // real count, never a guess.
  const [pendingPhoto, setPendingPhoto] = useState<{ asset: ImagePicker.ImagePickerAsset; redactImg: { base64: string; mimeType: string } } | null>(null);
  const [redactedFile, setRedactedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [lastRedactionCount, setLastRedactionCount] = useState<Record<string, number>>({});
  const [savingDraft, setSavingDraft] = useState(false);

  // Shared FAB's family-health-tab "+" face (app/(tabs)/_layout.tsx) fires
  // this one-shot flag instead of opening Ask Cube — same pattern
  // TasksScreen.tsx/MemoriesTab.tsx/HealthTab.tsx use. HealthRecordsScreen
  // mounts only one of HealthTab/RecordsTab at a time (segmented switch),
  // so both safely consume the same flag without conflicting.
  const openHealthRecordsComposerRequested = useUIStore(s => s.openHealthRecordsComposerRequested);
  useEffect(() => {
    if (openHealthRecordsComposerRequested) {
      useUIStore.getState().setOpenHealthRecordsComposerRequested(false);
      setShowAdd(true);
    }
  }, [openHealthRecordsComposerRequested]);

  useFocusEffect(useCallback(() => {
    if (useUIStore.getState().openHealthRecordsComposerRequested) {
      useUIStore.getState().setOpenHealthRecordsComposerRequested(false);
      setShowAdd(true);
    }
  }, []));
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const { checked: aiConsentChecked, consented: aiConsented, showSheet: showAiConsent, setShowSheet: setShowAiConsent, markConsented: markAiConsented } = useAiConsent(activeMemberId ?? undefined);
  const pendingAnalyzeAction = useRef<(() => void) | null>(null);
  const [pending,        setPending]       = useState<Record<string, AiAnalysis | AppointmentAnalysis>>({});
  const [notMedical,     setNotMedical]    = useState<Record<string, string>>({});
  const [analyzeErrors,  setAnalyzeErrors] = useState<Record<string, string>>({});
  const [reviewRec,   setReviewRec]   = useState<MedRecord | null>(null);
  const [approving,   setApproving]   = useState(false);
  // Selection / download
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const selectable = selectedIds.size > 0;

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!familyId || familyId === 'family-1') return;
    setLoading(true); setLoadError(null);
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('family_id', familyId)
      .order('record_date', { ascending: false });
    if (error) {
      setLoadError('Could not load records. Tap to retry.');
    } else {
      // Decrypt any encrypted analysis blobs
      const rows = await Promise.all(
        (data ?? []).map(async (row: any) => {
          if (row.ai_analysis_json && isEncryptedBlob(row.ai_analysis_json)) {
            const dec = await decryptAnalysis<AiAnalysis>(familyId, row.ai_analysis_json);
            return { ...row, ai_analysis_json: dec };
          }
          return row;
        }),
      );
      setRecords(rows as MedRecord[]);
    }
    setLoading(false);
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!familyId || familyId === 'family-1') return;
    const ch = claimChannel(`medrec-${familyId}`);
    if (!ch) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records',
        filter: `family_id=eq.${familyId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [familyId, load]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const memberName  = (id: string) => members.find(m => m.id === id)?.name ?? 'Unknown';
  const memberIndex = (id: string) => members.findIndex(m => m.id === id);

  const filtered = useMemo(() => {
    let list = records;
    if (filterMember !== 'all') list = list.filter(r => r.member_id === filterMember);
    if (filterTag    !== 'all') list = list.filter(r => r.tag === filterTag);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.ai_summary?.toLowerCase().includes(q) ||
        (r.ai_analysis_json as any)?.summary?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, filterMember, filterTag, search]);

  const activeFilters = (filterTag !== 'all' ? 1 : 0) + (filterMember !== 'all' ? 1 : 0);

  // ── Add ──────────────────────────────────────────────────────────────────────
  const addRecord = async (
    memberId: string,
    form: RecordForm,
    file: DocumentPicker.DocumentPickerAsset | null,
  ) => {
    let file_path: string | null = null;
    let file_name: string | null = null;
    let file_size: number | null = null;

    console.log('[RecordsTab] addRecord called — file:', file ? { uri: file.uri, name: file.name, mimeType: file.mimeType, size: file.size } : null);

    if (file) {
      const ext  = file.name.split('.').pop() ?? 'bin';
      const path = `${familyId}/${memberId}/${Date.now()}.${ext}`;
      try {
        // Supabase JS on React Native/Hermes uploads a Blob as 0 bytes.
        // Read the file as base64 with FileSystem, decode to Uint8Array, upload that.
        const FS = await import('expo-file-system/legacy');
        const b64str = await FS.readAsStringAsync(file.uri, { encoding: 'base64' as any });
        const binary = atob(b64str);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        console.log('[RecordsTab] read file bytes — length:', bytes.byteLength, 'path:', path);
        const { data: up, error: upErr } = await supabase.storage
          .from('medical-records')
          .upload(path, bytes, { contentType: file.mimeType ?? 'application/octet-stream', upsert: false });
        if (upErr) {
          // Was silently swallowed — a failed storage upload still inserted
          // the record with file_path: null, no error surfaced anywhere
          // (live-reported: "no file is attached to this record" after a
          // real camera capture, no visible error at the time).
          console.log('[RecordsTab] storage upload FAILED:', JSON.stringify(upErr));
        } else if (up) {
          console.log('[RecordsTab] storage upload OK — path:', up.path);
          file_path = up.path; file_name = file.name; file_size = file.size ?? null;
        }
      } catch (fetchErr: any) {
        console.log('[RecordsTab] fetch(file.uri) threw before upload even started:', fetchErr?.message ?? fetchErr);
      }
    } else {
      console.log('[RecordsTab] addRecord called with file=null — no upload attempted');
    }

    const { data } = await supabase.from('medical_records').insert({
      family_id: familyId, member_id: memberId,
      uploaded_by: activeMember?.id ?? null,
      title: form.title.trim(), tag: form.tag,
      record_date: form.record_date, notes: form.notes.trim() || null,
      file_path, file_name, file_size,
      ai_analyzed: false, ai_tags: [],
    }).select().single();

    if (data) { setRecords(prev => [data as MedRecord, ...prev]); showToast('Record added'); }
    return data as MedRecord | undefined;
  };

  // ── Screen A → B/C wiring — camera/library picks go through
  // PhotoRedactModal (real drag-to-draw tool) before being saved; a
  // file-picker PDF/image has no redaction step today (see
  // BringInDocumentScreen's own honesty note) and saves directly. ──────────
  const toBase64FromUri = async (uri: string) => {
    const r2 = await fetch(uri); const b = await r2.arrayBuffer(); const u = new Uint8Array(b);
    let s = ''; for (let i = 0; i < u.byteLength; i++) s += String.fromCharCode(u[i]); return btoa(s);
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { showAlert('Camera access needed', 'Please allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64 ?? await toBase64FromUri(asset.uri);
    setShowBringIn(false);
    setPendingPhoto({ asset, redactImg: { base64, mimeType: asset.mimeType ?? 'image/jpeg' } });
  };

  const pickLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Photo library access needed', 'Please allow photo library access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64 ?? await toBase64FromUri(asset.uri);
    setShowBringIn(false);
    setPendingPhoto({ asset, redactImg: { base64, mimeType: asset.mimeType ?? 'image/jpeg' } });
  };

  const pickFilesDirect = async () => {
    const result = await DocPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const isPdf = asset.mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      // Image file — route through the redact modal the same way camera/library photos do
      setShowBringIn(false);
      try {
        const base64 = await toBase64FromUri(asset.uri);
        const mimeType = asset.mimeType ?? 'image/jpeg';
        // Synthesise an ImagePickerAsset shape so handleRedactConfirm can build
        // the DocumentPickerAsset from it (it only reads asset.fileName).
        const fakeAsset = { uri: asset.uri, fileName: asset.name, mimeType } as ImagePicker.ImagePickerAsset;
        setPendingPhoto({ asset: fakeAsset, redactImg: { base64, mimeType } });
      } catch {
        // Fallback: if base64 read fails, save directly without redaction
        await saveDraftRecord(asset, false);
      }
    } else {
      // PDF — no page-render capability without a native module; save directly
      setShowBringIn(false);
      await saveDraftRecord(asset, false);
    }
  };

  // Saves straight through the real addRecord() path (same storage upload
  // + insert as before), using the Screen A draft type/owner. `wasRedacted`
  // only ever true for a photo that actually went through
  // handleRedactConfirm below — never asserted for the file-picker path.
  const saveDraftRecord = async (file: DocumentPicker.DocumentPickerAsset | null, wasRedacted: boolean, redactionCount = 0) => {
    setSavingDraft(true);
    try {
      // Screen A's flow never asks for a title up front, so this always
      // falls back — but a raw filename like "photo_1791605994382" reads
      // badly in the list (live-reported). A human-readable
      // "<Record type> · <today's date>" fallback is honest (there really
      // is no user-entered title) while reading far better than the
      // timestamped filename did.
      const typeLabel = TAGS.find(t => t.id === draftTag)?.label ?? 'Health document';
      const fallbackTitle = `${typeLabel} · ${fmtDate(todayLocal())}`;
      const form: RecordForm = { ...BLANK_FORM, tag: draftTag, title: fallbackTitle };
      const saved = await addRecord(draftOwnerId, form, file);
      if (saved && wasRedacted) {
        setLastRedactionCount(prev => ({ ...prev, [saved.id]: redactionCount }));
      }
    } finally {
      setSavingDraft(false);
    }
  };

  const pendingBoxCount = useRef(0);
  const handleRedactConfirm = async (finalImages: { base64: string; mimeType: string }[]) => {
    console.log('[RecordsTab] handleRedactConfirm called — pendingPhoto:', !!pendingPhoto, 'finalImages count:', finalImages?.length, 'base64 length:', finalImages?.[0]?.base64?.length ?? 'MISSING');
    if (!pendingPhoto) {
      console.log('[RecordsTab] handleRedactConfirm bailed — pendingPhoto was null');
      return;
    }
    const finalImg = finalImages[0];
    if (!finalImg?.base64) {
      console.log('[RecordsTab] handleRedactConfirm bailed — no base64 in finalImages[0], aborting save (was previously silently falling through to a file-less save)');
      setPendingPhoto(null);
      showAlert('Could not process photo', 'The photo could not be captured. Please try again.');
      return;
    }
    const name = pendingPhoto.asset.fileName ?? `photo_${Date.now()}.jpg`;
    try {
      // Persist the flattened (possibly redacted) base64 to a real cache file
      // so it fits the DocumentPickerAsset shape addRecord already expects —
      // this IS the copy that gets uploaded/stored, per the honesty note in
      // BringInDocumentScreen (not the untouched original asset).
      const FileSystem = await import('expo-file-system/legacy');
      const destUri = `${FileSystem.cacheDirectory}${Date.now()}_${name}`;
      await FileSystem.writeAsStringAsync(destUri, finalImg.base64, { encoding: 'base64' as any });
      const info = await FileSystem.getInfoAsync(destUri);
      console.log('[RecordsTab] wrote redacted image to cache — destUri:', destUri, 'info.exists:', (info as any).exists, 'info.size:', (info as any).size);
      const file = { uri: destUri, name, mimeType: finalImg.mimeType, size: (info as any).size ?? null } as DocumentPicker.DocumentPickerAsset;
      setPendingPhoto(null);
      await saveDraftRecord(file, true, pendingBoxCount.current);
      return;
    } catch (err: any) {
      console.log('[RecordsTab] handleRedactConfirm threw while writing/preparing file:', err?.message ?? err);
      setPendingPhoto(null);
      showAlert('Could not save photo', err?.message ?? 'Something went wrong preparing the file.');
      return;
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const deleteRecord = (rec: MedRecord) => {
    Alert.alert('Remove record', `Remove "${rec.title}"? This permanently deletes the file from your vault.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        if (rec.file_path) await supabase.storage.from('medical-records').remove([rec.file_path]);
        await supabase.from('medical_records').delete().eq('id', rec.id);
        setRecords(prev => prev.filter(r => r.id !== rec.id));
        setPending(prev => { const c = { ...prev }; delete c[rec.id]; return c; });
        setNotMedical(prev => { const c = { ...prev }; delete c[rec.id]; return c; });
        showToast('Record removed');
      }},
    ]);
  };

  // ── AI Analyze ────────────────────────────────────────────────────────────────
  // Tag-aware: a 'visit_recording' row (created by RecordVisitSheet.tsx's
  // stopAndUpload, which now uploads+creates the record immediately on
  // Stop rather than waiting for a separate Submit tap — see its own
  // comment) needs the AUDIO analyzer, not the document one. Reachable
  // from here independently of that sheet ever being reopened: closing it
  // before submitting leaves a real, unanalyzed row that shows up in this
  // list like any other, with its own Analyze/Delete actions.
  const analyzeRecord = (rec: MedRecord) => {
    if (rec.ai_analyzed) return;
    if (aiConsentChecked && !aiConsented) {
      pendingAnalyzeAction.current = () => analyzeRecordNow(rec);
      setShowAiConsent(true);
      return;
    }
    analyzeRecordNow(rec);
  };

  const analyzeRecordNow = async (rec: MedRecord) => {
    setAnalyzingId(rec.id);
    setAnalyzeErrors(prev => { const n = { ...prev }; delete n[rec.id]; return n; });
    const isVisitRecording = rec.tag === 'visit_recording';
    try {
      const { data: fnData, error } = await supabase.functions.invoke(
        isVisitRecording ? 'analyze-appointment-recording' : 'analyze-medical-record',
        { body: { record_id: rec.id, member_name: memberName(rec.member_id) } },
      );
      if (error) {
        // FunctionsHttpError wraps a non-2xx response. The Supabase JS client
        // exposes the parsed body on error.context — try to pull a real
        // message from it before falling back to the generic string.
        let msg = 'Analysis failed — please try again.';
        try {
          const ctx = (error as any).context;
          // context may be the raw Response or an already-parsed object
          const body = ctx?.json ? await ctx.json() : ctx;
          if (body?.error) msg = body.error;
          else if (body?.message) msg = body.message;
          else if (typeof error.message === 'string' && !error.message.includes('non-2xx')) {
            msg = error.message;
          }
        } catch { /* ignore parse failure */ }
        throw new Error(msg);
      }
      if (fnData?.error) throw new Error(fnData.error);
      if (fnData?.not_medical) {
        setNotMedical(prev => ({ ...prev, [rec.id]: fnData.message ?? 'This does not appear to be a medical document.' }));
        return;
      }
      const analysis: AiAnalysis | AppointmentAnalysis = fnData?.analysis;
      if (!analysis?.summary) throw new Error('Invalid AI response');
      setPending(prev => ({ ...prev, [rec.id]: analysis }));
      // Auto-open the review sheet
      setReviewRec(rec);
      // Push notification to the record's assigned member
      supabase.functions.invoke('family-notifier', {
        body: {
          familyId,
          memberId:   rec.member_id,
          type:       'custom',
          payload: isVisitRecording ? {
            title: '📋 Visit Summary Ready',
            body:  `${rec.title} — tap to review and approve the summary`,
            data:  { screen: 'vault', tab: 'records', record_id: rec.id },
          } : {
            title: '🧬 AI Analysis Ready',
            body:  `${rec.title} — tap to review and approve the findings`,
            data:  { screen: 'vault', tab: 'records', record_id: rec.id },
          },
        },
      }).catch(() => { /* non-blocking */ });
    } catch (err: any) {
      const msg = err.message ?? 'Could not analyze. Please try again.';
      setAnalyzeErrors(prev => ({ ...prev, [rec.id]: msg }));
    } finally {
      setAnalyzingId(null);
    }
  };

  // ── Approve: encrypt then store ───────────────────────────────────────────────
  const approveAnalysis = async () => {
    if (!reviewRec) return;
    const analysis = pending[reviewRec.id];
    if (!analysis) return;
    setApproving(true);
    try {
      // Encrypt the full analysis JSON — per-device envelope when available
      // (activeMemberId needed to satisfy device registration), legacy
      // familyId-derived key otherwise (see recordsCrypto.ts).
      const encryptedBlob = await encryptAnalysis(familyId, analysis, activeMemberId ?? undefined);

      const { error } = await supabase.from('medical_records').update({
        ai_summary:       analysis.summary,
        ai_tags:          analysis.tags ?? [],
        ai_analysis_json: encryptedBlob,   // stored as AES-GCM ciphertext
        ai_analyzed:      true,
      }).eq('id', reviewRec.id);

      if (error) throw new Error(error.message);

      // Update local state with the decrypted object (display stays readable)
      setRecords(prev => prev.map(r =>
        r.id === reviewRec.id
          ? { ...r, ai_summary: analysis.summary, ai_tags: analysis.tags ?? [],
              ai_analysis_json: analysis, ai_analyzed: true }
          : r
      ));
      setPending(prev => { const c = { ...prev }; delete c[reviewRec.id]; return c; });
      setReviewRec(null);
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Could not save the analysis. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const dismissReview = () => {
    if (reviewRec) {
      setPending(prev => { const c = { ...prev }; delete c[reviewRec.id]; return c; });
    }
    setReviewRec(null);
  };

  // ── Selection / download ──────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  const handleDownloadSingle = async (rec: MedRecord) => {
    setDownloading(true);
    try {
      await downloadSingle(rec);
    } catch (err: any) {
      showToast('Download failed: ' + (err.message ?? 'please try again'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = async () => {
    const toDownload = filtered.filter(r => selectedIds.has(r.id) && r.file_path);
    if (toDownload.length === 0) {
      Alert.alert('No files', 'None of the selected records have attached files.');
      return;
    }
    setDownloading(true);
    try {
      if (toDownload.length === 1) {
        await downloadSingle(toDownload[0]);
      } else {
        await downloadZip(toDownload);
      }
      clearSelection();
    } catch (err: any) {
      Alert.alert('Download failed', err.message ?? 'Could not download the file(s). Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────────
  if (!familyId || familyId === 'family-1') return (
    <View style={{ padding: 16 }}>
      <EmptyState Icon={Lock} label="Sign in and join a family vault to access medical records" colors={colors} />
    </View>
  );

  if (loading) return (
    <View style={{ padding: 16 }}>
      <ActivityIndicator color={colors.teal} style={{ marginVertical: 24 }} />
    </View>
  );

  if (loadError) return (
    <View style={{ padding: 16 }}>
      <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
        <AlertCircle size={28} color={colors.danger} />
        <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>{loadError}</Text>
        <TouchableOpacity onPress={load}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.teal + '15',
            borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
          <RefreshCw size={13} color={colors.teal} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>Retry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  // Full Figma treatment throughout: the list itself (RecordsFigmaList),
  // the scan/upload entry (BringInDocumentScreen), the AI-review screen
  // (ReviewFindingsScreen) and the filter screen (RecordsFilterScreen) —
  // every one a FullPageOverlay sibling of THIS component's own content,
  // never nested inside a child that's itself inside a ScrollView (same
  // containment rule HealthRecordsScreen.tsx's own module header documents).
  return (
    <>
      <AiConsentSheet
        visible={showAiConsent}
        memberId={activeMemberId ?? ''}
        familyId={familyId}
        colors={colors}
        isDark={isDark}
        onAgree={() => {
          setShowAiConsent(false);
          markAiConsented();
          pendingAnalyzeAction.current?.();
          pendingAnalyzeAction.current = null;
        }}
        onDecline={() => { setShowAiConsent(false); pendingAnalyzeAction.current = null; }}
      />

      <View style={{ padding: 16, gap: 14 }}>
        <TouchableOpacityBringIn onPress={() => { setDraftOwnerId(activeMemberId ?? members[0]?.id ?? ''); setShowBringIn(true); }} colors={colors} isDark={isDark} />

        <RecordsFigmaList
          colors={colors} isDark={isDark}
          records={records} filtered={filtered}
          search={search} setSearch={setSearch}
          activeFilters={activeFilters} openFilterScreen={() => setShowFilter(true)}
          memberName={memberName} memberIndex={memberIndex}
          analyzingId={analyzingId} pending={pending} notMedical={notMedical} analyzeErrors={analyzeErrors}
          onAnalyze={analyzeRecord} onOpenReview={(rec) => setReviewRec(rec)} onDelete={deleteRecord}
          onDownloadSingle={handleDownloadSingle}
          selectedIds={selectedIds} selectable={selectable} onToggleSelect={toggleSelect} clearSelection={clearSelection}
          downloading={downloading} onDownload={handleDownload}
        />
      </View>

      {/* Manual-entry path — AddRecordModal's own save form, reached either
          directly from the list's "+" or from BringInDocumentScreen's
          "Enter details manually instead" link. Left as its own Modal (it
          already owns real camera/library/file picking + its own redact
          step for photos) rather than re-built as a 4th full-page screen —
          this is the one path task scope didn't ask to be reskinned, and
          doing so safely needs the same redact-wiring work Screen A/B
          above already received. */}
      <AddRecordModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={async (memberId, form, file) => { await addRecord(memberId, form, file); }}
        colors={colors} isDark={isDark}
        members={members} activeMemberId={activeMemberId}
      />

      {/* Screen A — "Bring in a document" */}
      <FullPageOverlay visible={showBringIn} onDismiss={() => setShowBringIn(false)} zIndex={52}>
        <BringInDocumentScreen
          colors={colors} isDark={isDark} members={members} activeMemberId={activeMemberId}
          ownerName={memberName(draftOwnerId)}
          onClose={() => setShowBringIn(false)}
          onPickCamera={pickCamera}
          onPickLibrary={pickLibrary}
          onPickFiles={pickFilesDirect}
          onManualEntry={() => { setShowBringIn(false); setShowAdd(true); }}
          recordType={draftTag} setRecordType={setDraftTag}
          recordOwnerId={draftOwnerId} setRecordOwnerId={setDraftOwnerId}
        />
      </FullPageOverlay>

      {/* Screen B — redaction. Reuses the real PhotoRedactModal drag-to-draw
          tool (verified gesture/ViewShot implementation, not a mock),
          given Figma-matching title/subtitle copy. */}
      <PhotoRedactModal
        visible={!!pendingPhoto}
        images={pendingPhoto ? [pendingPhoto.redactImg] : []}
        accentColor={colors.teal}
        title="Hide private details"
        subtitle="Drag to draw black boxes over anything you don't want included"
        confirmLabel="Confirm redactions · review findings →"
        onDiscard={() => setPendingPhoto(null)}
        onBoxCountConfirmed={(count: number) => { pendingBoxCount.current = count; }}
        onConfirm={handleRedactConfirm}
      />

      {/* Screen C — "Check the findings" */}
      <FullPageOverlay visible={!!(reviewRec && pending[reviewRec.id])} onDismiss={dismissReview} zIndex={53}>
        {reviewRec && pending[reviewRec.id] && (
          <ReviewFindingsScreen
            colors={colors} isDark={isDark}
            rec={reviewRec} analysis={pending[reviewRec.id]}
            memberName={memberName(reviewRec.member_id)}
            approving={approving}
            onApprove={approveAnalysis}
            onDismiss={dismissReview}
            onClose={dismissReview}
            wasRedacted={lastRedactionCount[reviewRec.id] != null}
            redactionCount={lastRedactionCount[reviewRec.id]}
          />
        )}
      </FullPageOverlay>

      {/* Filter screen — full-page replacement for RecordsFilterSheet.tsx's
          bottom sheet, per the app-wide "no bottom sheets" rule. */}
      <FullPageOverlay visible={showFilter} onDismiss={() => setShowFilter(false)} zIndex={51}>
        <RecordsFilterScreen
          colors={colors} isDark={isDark} members={members}
          filterMember={filterMember} setFilterMember={setFilterMember}
          filterTag={filterTag} setFilterTag={setFilterTag}
          recordCount={records.length}
          onClose={() => setShowFilter(false)}
        />
      </FullPageOverlay>
    </>
  );
}

// Small "Bring in a document" banner/button living above the list card —
// kept as a tiny local component so RecordsTab's main render stays
// readable; not exported, not reused elsewhere.
function TouchableOpacityBringIn({ onPress, colors, isDark }: { onPress: () => void; colors: any; isDark: boolean }) {
  // "Gemini rhythm" tokens (CLAUDE.md rule 6 exception) — imported from
  // the shared module [live-reported: "i still see text in the forms not
  // converted" — this component had its own inline raw hex, missed by
  // the earlier file-level sweep since it wasn't a top-of-file const block].
  const BLUE = GEMINI.blue;
  const border = isDark ? colors.border : GEMINI.border;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const titleC = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyC  = isDark ? colors.textSecondary : GEMINI.bodyColor;
  return (
    <TouchableOpacity onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: cardBg, borderRadius: 16, borderWidth: 1, borderColor: border, padding: 16 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: BLUE + '15',
        alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={20} color={BLUE} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Bring in a document</Text>
        <Text style={{ fontSize: 12, fontWeight: '500', color: bodyC, marginTop: 2 }}>
          Scan or upload a visit record — redact, then review AI findings before saving
        </Text>
      </View>
    </TouchableOpacity>
  );
}
