import { showAlert } from '@/components/AppAlert';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, Image, 
  RefreshControl, Dimensions, Animated, Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
let TextRecognition: typeof import('@react-native-ml-kit/text-recognition').default | null = null;
try { TextRecognition = require('@react-native-ml-kit/text-recognition').default; } catch {}
import { LinearGradient } from 'expo-linear-gradient';
import LazyImage from '@/components/LazyImage';
import { dbRun } from '@/lib/dbUtils';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { deleteHealthRecord as dbDeleteHealthRecord } from '@/lib/db';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { LIMITS, showUpgradeAlert } from '@/lib/subscription';
import { format, parseISO, startOfDay, endOfDay, differenceInYears } from 'date-fns';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { FeatureUnavailable } from '@/components/FeatureGate';
import { usePaywall, useContextTier } from '@/lib/hooks/usePaywall';
import TeaserGate from '@/components/TeaserGate';
import { formatTime } from '@/lib/units';
import { RecordCard } from '@/features/health/components/RecordCard';
import { RecordsHeroCard } from '@/features/health/components/RecordsHeroCard';
import { scheduleImmediateNotification } from '@/shared/services/notifications.service';
import { TYPO } from '@/constants/theme';

const { width: SW } = Dimensions.get('window');

// On-device OCR (ML Kit) is trained on print text — on a handwritten page it
// doesn't return '', it returns a few garbled characters. A bare length>0 check
// would treat that as "readable" and route the whole batch to the cheap
// text-only AI path, which never sees the actual image — so handwritten meds
// silently vanish. Require real prose-like content: a minimum length AND a
// letter-density check that garbled OCR noise fails.
function looksReadable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return false;
  const letters = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  return letters / trimmed.length > 0.4;
}

interface HealthRecord {
  id: string;
  pet_id: string;
  file_name: string;
  file_url: string;
  file_type: 'pdf' | 'image';
  status: 'raw' | 'processing' | 'done' | 'error';
  source: 'upload' | 'camera';
  extraction_count: number;
  page_count: number;
  auto_saved: boolean;
  doc_type: DocType | null;
  created_at: string;
}

type StagedPage = { uri: string; base64: string | null; source: 'camera' | 'gallery' | 'pdf'; name: string; mimeType: string; extractedText?: string };

type DocType = 'lab' | 'prescription' | 'discharge' | 'vaccination' | 'xray' | 'invoice' | 'other';

const DOC_TYPES: { key: DocType; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'lab',          label: 'Lab Report',    icon: 'flask-outline',            color: '#0C447C', bg: '#E6F1FB' },
  { key: 'prescription', label: 'Prescription',  icon: 'medical-outline',          color: '#3C3489', bg: '#EEEDFE' },
  { key: 'discharge',    label: 'Discharge',     icon: 'document-text-outline',    color: '#854F0B', bg: '#FAEEDA' },
  { key: 'vaccination',  label: 'Vaccination',   icon: 'shield-checkmark-outline', color: '#0F6E56', bg: '#E1F5EE' },
  { key: 'xray',         label: 'X-Ray / Scan',  icon: 'scan-outline',             color: '#6B21A8', bg: '#F3E8FF' },
  { key: 'invoice',      label: 'Invoice',       icon: 'receipt-outline',          color: '#92400E', bg: '#FEF3C7' },
  { key: 'other',        label: 'Other',         icon: 'folder-outline',           color: '#475569', bg: '#F1F5F9' },
];

const MAX_PAGES        = 4;     // 4 pages → safe within 8192 output token limit
const MAX_PAGE_SIZE_MB = 5;     // per image — larger files hit edge fn timeout

const CAPABILITIES = [
  { icon: 'shield-checkmark-outline', label: 'Vaccines',    color: '#0F6E56', bg: '#E1F5EE' },
  { icon: 'medical-outline',          label: 'Medications', color: '#3C3489', bg: '#EEEDFE' },
  { icon: 'flask-outline',            label: 'Lab results', color: '#0C447C', bg: '#E6F1FB' },
  { icon: 'calendar-outline',         label: 'Follow-ups',  color: '#854F0B', bg: '#FAEEDA' },
];

export default function HealthRecordsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const healthRecordsEnabled = useFeatureFlag('health_records_enabled', true);
  const { gate, consume } = usePaywall();
  const { user } = useAuthStore();
  const { activePetId, activePet, petRoles } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, activePet: s.activePet, petRoles: s.petRoles })));
  const tier = useContextTier(activePetId);
  const perms = getPermissions(activePetId ? petRoles[activePetId] : 'owner');

  const healthLimit = LIMITS[tier].healthRecordsPerMonth; // -1 = unlimited
  const [monthlyUsed, setMonthlyUsed] = useState(0);
  const [usageLoaded, setUsageLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id || healthLimit === -1) { setUsageLoaded(true); return; }
    let mounted = true;
    useSubscriptionStore.getState()
      .refreshUsage(user.id, 'healthRecordsPerMonth')
      .then(count => { if (mounted) { setMonthlyUsed(count); setUsageLoaded(true); } })
      .catch(() => { if (mounted) setUsageLoaded(true); });
    return () => { mounted = false; };
  }, [user?.id, tier]);
  const pet    = activePet();
  const accent = pet?.accent_color ?? colors.primary;
  const petAgeYrs = (pet as any)?.birthday ? differenceInYears(new Date(), parseISO((pet as any).birthday)) : null;
  const petAge = petAgeYrs != null ? `${petAgeYrs} yr${petAgeYrs !== 1 ? 's' : ''}` : null;

  const [records,      setRecords]      = useState<HealthRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const cursorRef = useRef<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [stagedPages,  setStagedPages]  = useState<StagedPage[]>([]);
  const [docType,      setDocType]      = useState<DocType>('other');
  const [filterType,   setFilterType]   = useState<DocType | 'all'>('all');
  const [fromDate,     setFromDate]     = useState<Date | null>(null);
  const [toDate,       setToDate]       = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<'from' | 'to' | null>(null);
  // Single unified modal — never closes between transitions, eliminates iOS race condition
  const [sheetPhase,   setSheetPhase]   = useState<'closed' | 'picker' | 'staging' | 'uploading'>('closed');
  const cancelUploadRef = useRef(false);

  // Collapsible cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Scroll-to-top FAB
  const scrollRef    = useRef<ScrollView>(null);
  const scrollY      = useRef(0);
  const fabOpacity   = useRef(new Animated.Value(0)).current;
  const [fabVisible, setFabVisible] = useState(false);

  const handleScrollFab = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.current = y;
    const shouldShow = y > 400;
    if (shouldShow && !fabVisible) {
      setFabVisible(true);
      Animated.timing(fabOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (!shouldShow && fabVisible) {
      Animated.timing(fabOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setFabVisible(false));
    }
  }, [fabVisible]);

  const limitReached = usageLoaded && healthLimit !== -1 && monthlyUsed >= healthLimit;

  const s = useMemo(() => makeStyles(colors, isDark, accent), [colors, isDark, accent]);

  const PAGE = 30;

  const load = useCallback(async () => {
    if (!activePetId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('health_records')
      .select('id,pet_id,file_name,file_url,file_type,status,source,extraction_count,page_count,auto_saved,doc_type,created_at')
      .eq('pet_id', activePetId)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (error) console.error('[HealthRecords] load error:', error.message, error.code);
    const rows = (data as HealthRecord[]) ?? [];
    cursorRef.current = rows.length > 0 ? rows[rows.length - 1].created_at : null;
    setHasMore(rows.length === PAGE);
    setRecords(rows);
    setLoading(false);
    setRefreshing(false);
  }, [activePetId]);

  const loadMore = useCallback(async () => {
    if (!activePetId || !hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    const { data, error } = await supabase
      .from('health_records')
      .select('id,pet_id,file_name,file_url,file_type,status,source,extraction_count,page_count,auto_saved,doc_type,created_at')
      .eq('pet_id', activePetId)
      .order('created_at', { ascending: false })
      .lt('created_at', cursorRef.current)
      .limit(PAGE);
    if (error) console.error('[HealthRecords] loadMore error:', error.message, error.code);
    const rows = (data as HealthRecord[]) ?? [];
    if (rows.length > 0) cursorRef.current = rows[rows.length - 1].created_at;
    setHasMore(rows.length === PAGE);
    setRecords(prev => {
      const seen = new Set(prev.map(r => r.id));
      return [...prev, ...rows.filter((r: HealthRecord) => !seen.has(r.id))];
    });
    setLoadingMore(false);
  }, [activePetId, hasMore, loadingMore]);

  const handleScroll = useCallback((e: any) => {
    handleScrollFab(e);
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 300) loadMore();
  }, [handleScrollFab, loadMore]);

  useFocusEffect(useCallback(() => {
    load(); setExpandedIds(new Set());
  }, [load]));

  // Realtime: update list instantly when an analyzed record transitions out of 'processing'
  useEffect(() => {
    if (!activePetId) return;
    const channel = supabase
      .channel(`health_records:${activePetId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'health_records', filter: `pet_id=eq.${activePetId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status === 'processing') return; // still running — ignore
          setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
          if (updated.status === 'done') {
            scheduleImmediateNotification({
              title: `${pet?.name ?? 'Pet'}'s medical record is ready 📋`,
              body: updated.title
                ? `"${updated.title}" has been analysed — tap to view.`
                : 'Your health record has been analysed — tap to view.',
              data: { screen: 'records' },
              notifType: 'record_analyzed',
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activePetId]);

  // ── Analyze ──────────────────────────────────────────────────────────────────
  // Flow: native FileSystem.uploadAsync → fallback to base64 if that fails/times out
  //       → DB record → navigate → edge fn (background, URLs only)
  const analyzeStaged = async () => {
    if (!activePetId || !stagedPages.length) return;

    // Gate: 3 health records/month on free tier
    const allowed = await gate('healthRecordsPerMonth', {
      title: 'Record limit reached',
      message: "You've used your 3 free health records this month. Upgrade to Pro for unlimited records.",
    });
    if (!allowed) return;

    cancelUploadRef.current = false;

    const T_TOTAL = Date.now();
    console.log('[FurAI] ══════════════════════════════════════');
    console.log('[FurAI] analyzeStaged START');
    console.log('[FurAI] petId:', activePetId);
    console.log('[FurAI] pages queued:', stagedPages.length);
    stagedPages.forEach((p, i) =>
      console.log(`[FurAI]   page[${i}] source=${p.source} mime=${p.mimeType} name=${p.name} uri=${p.uri.slice(0, 80)}`),
    );

    // Snapshot pages BEFORE clearing state, then switch unified modal from
    // 'staging' → 'uploading' in one render — no close/open race condition.
    const snapshotPages = [...stagedPages];
    setStagedPages([]);
    setSheetPhase('uploading');
    setDocType('other');
    setUploadStatus('Preparing…');

    // ── helper: upload one file with a 45-second timeout ──────────────────────
    const uploadWithTimeout = (url: string, uri: string, headers: Record<string, string>, mimeType: string): Promise<{ status: number; body: string }> => {
      const TIMEOUT_MS = 45_000;
      console.log(`[FurAI]   uploadAsync → ${url.slice(0, 90)}`);
      const native = FileSystem.uploadAsync(url, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers,
      });
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Upload timed out after ${TIMEOUT_MS / 1000}s — check network & storage bucket`)), TIMEOUT_MS),
      );
      return Promise.race([native, timer]) as Promise<{ status: number; body: string }>;
    };

    // ── helper: base64 fallback upload via fetch (slower but reliable) ────────
    const uploadBase64Fallback = async (
      path: string, uri: string, mimeType: string,
      token: string, anonKey: string, sbUrl: string,
    ): Promise<void> => {
      console.log(`[FurAI]   base64 fallback: reading file…`);
      // Read as base64 string
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      console.log(`[FurAI]   base64 length: ${b64.length} (~${Math.round(b64.length * 0.75 / 1024)}KB)`);

      // Decode to binary
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const uploadUrl = `${sbUrl}/storage/v1/object/health-records/${path}`;
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: bytes.buffer,
      });
      const body = await res.text();
      console.log(`[FurAI]   base64 fetch → status=${res.status} body=${body.slice(0, 120)}`);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Base64 upload HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
    };

    try {
      // ── Step 0: Auth session ────────────────────────────────────────────────
      setUploadStatus('Authenticating…');
      console.log('[FurAI] Step 0: getting auth session…');
      const T0 = Date.now();
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      console.log(`[FurAI] getSession took ${Date.now() - T0}ms`);

      if (sessionErr) console.error('[FurAI] getSession error:', sessionErr.message);
      const token   = sessionData?.session?.access_token ?? '';
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const sbUrl   = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      console.log('[FurAI] auth token present:', !!token, '(length', token.length + ')');
      console.log('[FurAI] sbUrl:', sbUrl.slice(0, 50));
      console.log('[FurAI] anonKey present:', !!anonKey, '(length', anonKey.length + ')');

      if (!token) {
        throw new Error('Not authenticated — session token is missing. Please sign out and sign in again.');
      }

      const pageUrls: string[] = [];

      // ── Step 1: Upload each page ────────────────────────────────────────────
      for (let i = 0; i < snapshotPages.length; i++) {
        if (cancelUploadRef.current) throw new Error('Cancelled by user');

        const page = snapshotPages[i];
        setUploadStatus(`Uploading page ${i + 1} of ${snapshotPages.length}…`);

        // Normalise MIME: some gallery images come back as image/heic on iOS
        // We mark them jpeg since we're uploading the raw bytes as-is
        const rawMime = page.mimeType ?? 'image/jpeg';
        const mimeType = rawMime.includes('heic') || rawMime.includes('heif') ? 'image/jpeg' : rawMime;
        const ext  = mimeType.includes('pdf') ? 'pdf' : 'jpg';
        const path = `${activePetId}/${Date.now()}_p${i + 1}.${ext}`;

        const uploadUrl = `${sbUrl}/storage/v1/object/health-records/${path}`;
        console.log(`\n[FurAI] ── PAGE ${i + 1}/${snapshotPages.length} ──`);
        console.log(`[FurAI]   source : ${page.source}`);
        console.log(`[FurAI]   rawMime: ${rawMime}  →  using: ${mimeType}`);
        console.log(`[FurAI]   uri    : ${page.uri.slice(0, 100)}`);
        console.log(`[FurAI]   path   : ${path}`);
        console.log(`[FurAI]   bucket url: ${uploadUrl.slice(0, 100)}`);

        const T_PAGE = Date.now();
        let uploadedOk = false;

        // ── Try 1: native FileSystem.uploadAsync (fast, no JS blocking) ──────
        try {
          console.log(`[FurAI]   trying native uploadAsync (45s timeout)…`);
          const result = await uploadWithTimeout(uploadUrl, page.uri, {
            'Authorization': `Bearer ${token}`,
            'apikey': anonKey,
            'Content-Type': mimeType,
            'x-upsert': 'true',
          }, mimeType);

          console.log(`[FurAI]   native upload finished in ${Date.now() - T_PAGE}ms`);
          console.log(`[FurAI]   status: ${result.status}`);
          console.log(`[FurAI]   body  : ${result.body?.slice(0, 200)}`);

          if (result.status >= 200 && result.status < 300) {
            uploadedOk = true;
          } else {
            console.warn(`[FurAI]   native upload non-2xx, trying base64 fallback…`);
          }
        } catch (nativeErr: any) {
          console.warn(`[FurAI]   native upload failed/timed-out: ${nativeErr.message}`);
          console.warn(`[FurAI]   falling back to base64 path…`);
        }

        // ── Try 2: base64 fetch fallback ──────────────────────────────────────
        if (!uploadedOk) {
          setUploadStatus(`Retrying page ${i + 1}… (slower path)`);
          console.log(`[FurAI]   base64 fallback for page ${i + 1}`);
          try {
            await uploadBase64Fallback(path, page.uri, mimeType, token, anonKey, sbUrl);
            uploadedOk = true;
            console.log(`[FurAI]   base64 fallback SUCCESS for page ${i + 1}`);
          } catch (b64Err: any) {
            console.error(`[FurAI]   base64 fallback also failed: ${b64Err.message}`);
            throw new Error(
              `Page ${i + 1} upload failed via both methods.\n` +
              `Native error + Base64 error: ${b64Err.message}\n` +
              `Check that the "health-records" storage bucket exists in your Supabase project ` +
              `with INSERT policy for authenticated users.`
            );
          }
        }

        const { data: urlData } = supabase.storage.from('health-records').getPublicUrl(path);
        pageUrls.push(urlData.publicUrl);
        console.log(`[FurAI]   ✓ page ${i + 1} done in ${Date.now() - T_PAGE}ms`);
        console.log(`[FurAI]   public URL: ${urlData.publicUrl.slice(0, 100)}`);
      }

      if (cancelUploadRef.current) throw new Error('Cancelled by user');

      console.log('\n[FurAI] ── All pages uploaded ──');
      console.log('[FurAI] URLs:', pageUrls.length);
      pageUrls.forEach((u, i) => console.log(`[FurAI]   [${i}] ${u.slice(0, 80)}`));

      // ── Step 2: Insert DB record ────────────────────────────────────────────
      setUploadStatus('Saving record…');
      const firstName = snapshotPages[0].name;
      const label = snapshotPages.length > 1
        ? `${firstName} (+${snapshotPages.length - 1} more pages)`
        : firstName;

      console.log('\n[FurAI] Step 2: inserting health_records row');
      console.log('[FurAI] label:', label);
      console.log('[FurAI] file_type:', snapshotPages[0].mimeType.includes('pdf') ? 'pdf' : 'image');
      console.log('[FurAI] source:', snapshotPages[0].source === 'camera' ? 'camera' : 'upload');
      console.log('[FurAI] page_count:', pageUrls.length);

      const { data: record, error: insertErr } = await supabase
        .from('health_records')
        .insert({
          pet_id:           activePetId,
          file_name:        label,
          file_url:         pageUrls[0],
          file_type:        snapshotPages[0].mimeType.includes('pdf') ? 'pdf' : 'image',
          source:           snapshotPages[0].source === 'camera' ? 'camera' : 'upload',
          status:           tier === 'free' ? 'raw' : 'processing',
          pages:            pageUrls,
          page_count:       pageUrls.length,
          extraction_count: 0,
          auto_saved:       false,
          doc_type:         docType,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[FurAI] DB insert error code:', insertErr.code);
        console.error('[FurAI] DB insert error msg :', insertErr.message);
        console.error('[FurAI] DB insert hint      :', insertErr.hint);
        throw new Error(`DB insert failed: ${insertErr.message}`);
      }
      console.log('[FurAI] DB record created → id:', record.id);
      await consume('healthRecordsPerMonth');
      setMonthlyUsed(n => n + 1);

      // ── Step 3: Navigate immediately, don't wait for AI ────────────────────
      console.log('\n[FurAI] Step 3: navigating to detail screen');
      setSheetPhase('closed');
      await load();
      router.push(`/health/record/${record.id}`);

      // ── Step 4: Fire edge function (background) — paid tiers only ───────────
      if (tier === 'free') {
        console.log('\n[FurAI] Step 4: skipped — free tier, raw document saved');
        return;
      }
      const T_FN = Date.now();
      console.log('\n[FurAI] Step 4: invoking parse-health-record edge fn');

      // Priority: text_pages (on-device OCR) → base64_pages (direct to vision AI) → image URLs
      const textPages = snapshotPages.map(p => p.extractedText ?? '');
      // If ANY page's OCR looks unreadable (e.g. handwriting), send ALL pages as
      // images so the vision AI can actually see the ones OCR couldn't read —
      // mixing text-mode for good pages and vision-mode for bad ones isn't
      // possible since the AI call is a single request per document.
      const allHaveText = textPages.every(t => looksReadable(t));

      let edgePayload: Record<string, unknown>;

      if (allHaveText) {
        // On-device OCR worked → send text; edge fn tries Gemini first, DeepSeek as fallback
        edgePayload = { record_id: record.id, pet_id: activePetId, text_pages: textPages };
      } else {
        // Read images as base64 — edge fn gets image data without re-downloading from storage
        // This eliminates the storage round-trip (~500ms) and avoids CORS/auth issues
        const base64Pages: { data: string; mime: string }[] = [];
        for (let i = 0; i < snapshotPages.length; i++) {
          const page = snapshotPages[i];
          const mime = (page.mimeType.includes('heic') || page.mimeType.includes('heif'))
            ? 'image/jpeg' : page.mimeType;
          if (mime.includes('pdf')) {
            console.log(`[FurAI]   page[${i}] PDF — skip base64`);
            continue;
          }
          try {
            const b64 = await FileSystem.readAsStringAsync(page.uri, { encoding: FileSystem.EncodingType.Base64 });
            console.log(`[FurAI]   page[${i}] base64: ${Math.round(b64.length * 0.75 / 1024)}KB`);
            base64Pages.push({ data: b64, mime });
          } catch (e: any) {
            console.warn(`[FurAI]   page[${i}] base64 read failed: ${e?.message} — will use URL`);
          }
        }
        edgePayload = base64Pages.length > 0
          ? { record_id: record.id, pet_id: activePetId, base64_pages: base64Pages }
          : { record_id: record.id, pet_id: activePetId, pages: pageUrls };
      }

      // ── Detailed send log ──────────────────────────────────────────────────
      const mode = allHaveText ? 'TEXT (on-device OCR → Gemini/DeepSeek)'
        : edgePayload.base64_pages ? 'BASE64 (direct → Gemini/OpenAI vision)'
        : 'IMAGE URLS (fallback — edge fn re-downloads)';
      console.log('\n[FurAI] ══ PAYLOAD TO EDGE FUNCTION ══');
      console.log('[FurAI] mode         :', mode);
      console.log('[FurAI] record_id    :', record.id);
      console.log('[FurAI] pet_id       :', activePetId);
      if (allHaveText) {
        textPages.forEach((t, i) => {
          console.log(`[FurAI]   page[${i}] chars=${t.length} preview="${t.slice(0, 120).replace(/\n/g, ' ↵ ')}"`);
        });
      } else if (edgePayload.base64_pages) {
        const bp = edgePayload.base64_pages as { data: string; mime: string }[];
        bp.forEach((p, i) =>
          console.log(`[FurAI]   page[${i}] mime=${p.mime} size=${Math.round(p.data.length * 0.75 / 1024)}KB`));
        console.log('[FurAI] OCR was empty — using vision AI:');
        snapshotPages.forEach((p, i) =>
          console.log(`[FurAI]   page[${i}] ocr_chars=${(p.extractedText ?? '').length} source=${p.source}`));
      } else {
        (edgePayload.pages as string[]).forEach((u, i) =>
          console.log(`[FurAI]   page[${i}] url=${u.slice(0, 80)}`));
      }
      console.log('[FurAI] ══════════════════════════════════\n');

      supabase.functions.invoke('parse-health-record', {
        body: edgePayload,
      }).then(({ data: fnData, error: fnErr }) => {
        if (fnErr) {
          console.error(`[FurAI] edge fn ERROR after ${Date.now() - T_FN}ms:`, fnErr.message ?? fnErr);
          // Check for Pro subscription gate
          if (fnErr.status === 402) {
            markRecordError(record.id, 'Pro feature. Upgrade to parse health records.');
            showUpgradeAlert({ message: 'Upgrade to use AI health record analysis.' });
          } else {
            // Defensively mark the record as errored so the detail screen doesn't
            // poll "processing" forever if the function failed to update it.
            markRecordError(record.id, fnErr.message ?? 'AI analysis failed. Please try again.');
          }
        } else {
          console.log(`[FurAI] edge fn SUCCESS after ${Date.now() - T_FN}ms`);
          console.log('[FurAI] edge fn response:', JSON.stringify(fnData).slice(0, 300));
        }
      }).catch((e: any) => {
        console.error(`[FurAI] edge fn network error after ${Date.now() - T_FN}ms:`, e?.message ?? e);
        markRecordError(record.id, e?.message ?? 'Network error during analysis. Please try again.');
      });

      console.log(`\n[FurAI] ══ analyzeStaged DONE in ${Date.now() - T_TOTAL}ms ══`);
      console.log('[FurAI] AI analysis running in background, user is on detail screen');

    } catch (err: any) {
      const isCancelled = err?.message === 'Cancelled by user';
      console.log(`\n[FurAI] ══ analyzeStaged ${isCancelled ? 'CANCELLED' : 'ERROR'} ══`);
      console.error('[FurAI] error:', err?.message ?? err);
      console.log('[FurAI] total elapsed before error:', Date.now() - T_TOTAL, 'ms');
      cancelUploadRef.current = false;
      setSheetPhase('closed');
      setUploadStatus('');
      if (!isCancelled) {
        showAlert(
          'Upload failed',
          err.message ?? 'Something went wrong. Check your connection and try again.',
          [{ text: 'OK' }],
        );
      }
    }
  };

  // Defensively flag a record as errored so the detail screen shows a graceful
  // failure state (with retry) instead of spinning on "processing" forever.
  const markRecordError = (recordId: string, message: string) => {
    supabase.from('health_records')
      .update({ status: 'error', error_message: message, processed_at: new Date().toISOString() })
      .eq('id', recordId)
      .then(() => {}, () => {}); // never throw from a background handler
  };

  // ── OCR helper — runs on-device, returns extracted text or '' on failure ──────
  const runOCR = async (uri: string, label: string): Promise<string> => {
    try {
      console.log(`[OCR] recognizing ${label}: uri=${uri.slice(0, 100)}`);
      const result = await TextRecognition?.recognize(uri);
      console.log(`[OCR] ${label}: result keys=${Object.keys(result ?? {}).join(',')}, blocks=${result?.blocks?.length ?? 'undefined'}`);
      if (!result?.blocks?.length) {
        console.log(`[OCR] ${label}: no text blocks → returning empty`);
        return '';
      }
      const text = result.blocks.map((b: any) => b.text).join('\n').trim();
      console.log(`[OCR] ${label}: ${text.length} chars → "${text.slice(0, 150).replace(/\n/g, ' ↵ ')}"`);
      return text;
    } catch (e: any) {
      console.warn(`[OCR] ${label} FAILED:`, e?.message ?? e);
      return '';
    }
  };

  // ── Pickers ──────────────────────────────────────────────────────────────────
  const addFromCamera = async () => {
    if (stagedPages.length >= MAX_PAGES) {
      showAlert('Page limit reached', `You can upload up to ${MAX_PAGES} pages at a time. Analyze these first, then add more.`);
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { setSheetPhase('closed'); showAlert('Camera access needed', 'Allow camera access in Settings.'); return; }
    let result: ImagePicker.ImagePickerResult;
    try {
      await showPickerLoading('Waiting for camera…');
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, quality: 0.5, allowsEditing: true, base64: false });
      hidePickerLoading();
    } catch (e: any) { setSheetPhase('closed'); showAlert('Could not open camera', e?.message); return; }
    if (result.canceled || !result.assets?.length) { setSheetPhase('closed'); return; }

    const asset = result.assets[0];
    // File size check
    if (asset.fileSize && asset.fileSize > MAX_PAGE_SIZE_MB * 1024 * 1024) {
      showAlert('Image too large', `Please use an image under ${MAX_PAGE_SIZE_MB} MB.`);
      setSheetPhase('staging');
      return;
    }
    setUploadStatus('Scanning document…');
    setSheetPhase('uploading');
    const extractedText = await runOCR(asset.uri, 'camera scan');
    if (cancelUploadRef.current) { cancelUploadRef.current = false; setSheetPhase('closed'); return; }
    setStagedPages(p => [...p, { uri: asset.uri, base64: null, source: 'camera', name: `scan_${Date.now()}.jpg`, mimeType: 'image/jpeg', extractedText }]);
    setUploadStatus('');
    setSheetPhase('staging');
  };

  const addFromGallery = async () => {
    if (stagedPages.length >= MAX_PAGES) {
      showAlert('Page limit reached', `You can upload up to ${MAX_PAGES} pages at a time. Analyze these first, then add more.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setSheetPhase('closed'); showAlert('Gallery access needed', 'Allow photo access in Settings.'); return; }
    let result: ImagePicker.ImagePickerResult;
    const remaining = MAX_PAGES - stagedPages.length;
    try {
      await showPickerLoading();
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.5, allowsMultipleSelection: true, selectionLimit: remaining });
      hidePickerLoading();
    } catch (e: any) { setSheetPhase('closed'); showAlert('Could not open gallery', e?.message); return; }
    if (result.canceled || !result.assets?.length) { setSheetPhase('closed'); return; }

    // Drop oversized images and warn
    const tooBig = result.assets.filter(a => a.fileSize && a.fileSize > MAX_PAGE_SIZE_MB * 1024 * 1024);
    const valid  = result.assets.filter(a => !a.fileSize || a.fileSize <= MAX_PAGE_SIZE_MB * 1024 * 1024);
    if (tooBig.length) {
      showAlert('Some images skipped', `${tooBig.length} image${tooBig.length > 1 ? 's were' : ' was'} over ${MAX_PAGE_SIZE_MB} MB and won't be added.`);
    }
    if (!valid.length) { setSheetPhase(stagedPages.length ? 'staging' : 'closed'); return; }

    setUploadStatus(`Scanning page 1 of ${valid.length}…`);
    setSheetPhase('uploading');

    const pages: StagedPage[] = [];
    for (let i = 0; i < valid.length; i++) {
      const a = valid[i];
      setUploadStatus(`Scanning page ${i + 1} of ${valid.length}…`);
      const extractedText = await runOCR(a.uri, `gallery page ${i + 1}`);
      if (cancelUploadRef.current) { cancelUploadRef.current = false; setSheetPhase('closed'); return; }
      pages.push({ uri: a.uri, base64: null, source: 'gallery', name: `photo_${Date.now()}_${i}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', extractedText });
    }
    setStagedPages(p => [...p, ...pages]);
    setUploadStatus('');
    setSheetPhase('staging');
  };

  const addPDF = async () => {
    // iOS: system file picker cannot present on top of an open Modal.
    // Close any open phase first and wait for the dismiss animation to finish.
    const wasOpen = sheetPhase !== 'closed';
    if (wasOpen) {
      setSheetPhase('closed');
      await new Promise(r => setTimeout(r, 380));
    }

    let result: DocumentPicker.DocumentPickerResult;
    try {
      console.log('[PDF] opening document picker…');
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      console.log('[PDF] picker returned: canceled=', result.canceled, 'assets=', (result as any).assets?.length ?? 0);
    } catch (e: any) {
      console.error('[PDF] picker threw:', e?.message);
      showAlert('Could not open files', e?.message);
      return;
    }

    if (result.canceled || !(result as any).assets?.length) return;

    const asset = (result as any).assets[0];
    console.log('[PDF] picked:', asset.name, asset.mimeType, asset.uri.slice(0, 80));

    if (asset.size && asset.size > MAX_PAGE_SIZE_MB * 1024 * 1024) {
      showAlert('PDF too large', `Please use a PDF under ${MAX_PAGE_SIZE_MB} MB. Try compressing it or scanning individual pages instead.`);
      return;
    }

    setStagedPages([{ uri: asset.uri, base64: null, source: 'gallery', name: asset.name, mimeType: asset.mimeType ?? 'application/pdf' }]);
    setSheetPhase('staging');
  };

  const removeStagedPage = (idx: number) => {
    setStagedPages(p => { const next = p.filter((_, i) => i !== idx); if (next.length === 0) setSheetPhase('closed'); return next; });
  };

  const deleteRecord = (id: string) => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('delete health records')); return; }
    showAlert('Delete record?', 'Removes the upload and all extracted data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await dbDeleteHealthRecord(id); load(); } catch (e: any) { showAlert('Could not delete record.', e.message); } } },
    ]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!healthRecordsEnabled) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <FeatureUnavailable
          label={`Keep all of ${pet?.name ?? 'your baby'}'s records in one secure folder.`}
          proGate
          headline={`${pet?.name ?? 'Your baby'}'s records — all in one place`}
          message="Upgrade to Pro for unlimited document storage — so you never lose an official vet certificate again."
          petName={pet?.name}
          ctaLabel="Go Pro for Unlimited Storage"
          perks={[
            'Unlimited health records & documents',
            `FurAI scans every document for ${pet?.name ?? 'your baby'}`,
            'PDF, photo & camera scan support',
            'All vet certificates stored securely',
          ]}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View>
            <Text style={s.title}>{tier === 'free' ? 'Health Documents' : 'Analyze with FurAI ✓'}</Text>
            {pet && <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: accent, marginTop: 1 }} numberOfLines={1}>{(pet as any).emoji ?? '🐾'}  {pet.name}{petAge ? `  ·  ${petAge}` : ''}</Text>}
          </View>
          {pet && <PetHeaderChip pet={pet as any} variant="badge" />}
        </View>
      </View>

      {loading ? (
        <PawBondLoader size={56} />
      ) : (
        
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} colors={[colors.primary]} />}>

          {/* ── Hero gradient card ── */}
          <RecordsHeroCard
            tier={tier}
            accent={accent}
            limitReached={limitReached}
            canLogHealth={perms.canLogHealth}
            s={s}
            onScanPress={() => { setStagedPages([]); setSheetPhase('picker'); }}
            onPdfPress={() => { setStagedPages([]); addPDF(); }}
          />

          {/* ── Monthly quota badge (free / pro with limit) ── */}
          {usageLoaded && healthLimit !== -1 && (
            <View style={{ alignItems: 'center', paddingHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
                backgroundColor: monthlyUsed >= healthLimit
                  ? `${colors.danger}18` : isDark ? colors.surface : `${accent}10`,
                borderColor: monthlyUsed >= healthLimit ? `${colors.danger}35` : `${accent}28`,
              }}>
                <Ionicons
                  name={monthlyUsed >= healthLimit ? 'ban-outline' : 'document-text-outline'}
                  size={13}
                  color={monthlyUsed >= healthLimit ? colors.danger : accent}
                />
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: monthlyUsed >= healthLimit ? colors.danger : colors.textSecondary }}>
                  {monthlyUsed >= healthLimit
                    ? `Monthly limit reached (${healthLimit}/${healthLimit})`
                    : `${monthlyUsed} of ${healthLimit} document${healthLimit !== 1 ? 's' : ''} uploaded this month`}
                </Text>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: `${accent}22`, marginLeft: 2 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', textTransform: 'capitalize', letterSpacing: 0.4, color: accent }}>
                    {tier === 'ultimate' ? 'Ultimate' : tier === 'pro' ? 'Pro' : 'Free'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── How it works (only shown when no records) ── */}
          {records.length === 0 && (
            <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
              <Text style={s.sectionLabel}>HOW IT WORKS</Text>
              {(tier === 'free' ? [
                { n: '1', icon: 'phone-portrait-outline',   title: 'Scan or upload',      sub: 'Camera scan, gallery photo, or PDF — up to 3 per month on free' },
                { n: '2', icon: 'document-text-outline',    title: 'Stored by date',       sub: 'All your vet documents saved and organised chronologically' },
                { n: '3', icon: 'sparkles-outline',         title: 'Upgrade for AI',       sub: 'Pro users get FurAI analysis — extracts every health detail automatically' },
              ] : [
                { n: '1', icon: 'phone-portrait-outline',   title: 'Scan or upload',       sub: 'Camera scan, gallery photo, or PDF — multi-page supported' },
                { n: '2', icon: 'sparkles-outline',         title: 'FurAI reads it',       sub: 'AI scans the document and extracts every health detail' },
                { n: '3', icon: 'checkmark-circle-outline', title: 'You confirm',          sub: 'Review what was found and save selected items to the health profile' },
              ]).map((step, i) => (
                <View key={i} style={[s.stepRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[s.stepNum, { backgroundColor: accent + '18' }]}>
                    <Text style={[s.stepNumText, { color: accent }]}>{step.n}</Text>
                  </View>
                  <Ionicons name={step.icon as any} size={22} color={accent} style={{ marginHorizontal: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                    <Text style={[s.stepSub, { color: colors.textSecondary }]}>{step.sub}</Text>
                  </View>
                </View>
              ))}

              {/* Formats supported */}
              <View style={[s.formatsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.formatsLabel, { color: colors.textSecondary }]}>SUPPORTED FORMATS</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  {[
                    { icon: 'document-text-outline', label: 'PDF', color: '#534AB7' },
                    { icon: 'scan-outline',           label: 'Camera scan', color: '#0F6E56' },
                    { icon: 'images-outline',         label: 'Gallery photo', color: '#185FA5' },
                    { icon: 'copy-outline',           label: 'Multi-page', color: '#854F0B' },
                  ].map(f => (
                    <View key={f.label} style={[s.formatChip, { backgroundColor: f.color + '12', borderColor: f.color + '30' }]}>
                      <Ionicons name={f.icon as any} size={13} color={f.color} />
                      <Text style={[s.formatChipText, { color: f.color }]}>{f.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ── Previous scans ── */}
          {records.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={s.sectionLabel}>{tier === 'free' ? 'YOUR DOCUMENTS' : 'PREVIOUS SCANS'}</Text>
                <Text style={[s.sectionCount, { color: colors.textSecondary }]}>{records.length}</Text>
              </View>

              {/* ── Filter bar ── */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                {([{ key: 'all', label: 'All', icon: 'albums-outline', color: accent, bg: accent + '15' },
                  ...DOC_TYPES] as { key: string; label: string; icon: string; color: string; bg: string }[])
                  .filter(dt => dt.key === 'all' || records.some(r => (r.doc_type ?? 'other') === dt.key))
                  .map(dt => {
                    const sel = filterType === dt.key;
                    return (
                      <TouchableOpacity key={dt.key} onPress={() => setFilterType(dt.key as any)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6,
                          borderRadius: 20, borderWidth: 1.5,
                          borderColor: sel ? dt.color : colors.border,
                          backgroundColor: sel ? dt.bg : 'transparent' }}>
                        <Ionicons name={dt.icon as any} size={12} color={sel ? dt.color : colors.textTertiary} />
                        <Text style={{ fontSize: TYPO.body, fontWeight: sel ? '700' : '500', color: sel ? dt.color : colors.textSecondary }}>{dt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>

              {/* ── Date range row ── */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="calendar-outline" size={13} color={colors.textTertiary} />
                <TouchableOpacity
                  onPress={() => setShowDatePicker('from')}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7,
                    borderRadius: 20, borderWidth: 1.5,
                    borderColor: fromDate ? accent : colors.border,
                    backgroundColor: fromDate ? accent + '12' : 'transparent' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: fromDate ? '700' : '500', color: fromDate ? accent : colors.textSecondary }}>
                    {fromDate ? format(fromDate, 'MMM d, yyyy') : 'From date'}
                  </Text>
                  {fromDate && (
                    <TouchableOpacity onPress={() => setFromDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={14} color={accent} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>→</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker('to')}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7,
                    borderRadius: 20, borderWidth: 1.5,
                    borderColor: toDate ? accent : colors.border,
                    backgroundColor: toDate ? accent + '12' : 'transparent' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: toDate ? '700' : '500', color: toDate ? accent : colors.textSecondary }}>
                    {toDate ? format(toDate, 'MMM d, yyyy') : 'To date'}
                  </Text>
                  {toDate && (
                    <TouchableOpacity onPress={() => setToDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={14} color={accent} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              <AppDateTimePicker
                visible={showDatePicker !== null}
                value={showDatePicker === 'from' ? (fromDate ?? new Date()) : (toDate ?? new Date())}
                mode="date"
                maximumDate={new Date()}
                minimumDate={showDatePicker === 'to' && fromDate ? fromDate : undefined}
                accent={accent}
                onCancel={() => setShowDatePicker(null)}
                onConfirm={(date) => {
                  if (showDatePicker === 'from') setFromDate(date); else setToDate(date);
                  setShowDatePicker(null);
                }}
              />

              {(() => {
                const FREE_VISIBLE = 3;
                const filtered = records.filter(r => {
                  if (filterType !== 'all' && (r.doc_type ?? 'other') !== filterType) return false;
                  const d = parseISO(r.created_at);
                  if (fromDate && d < startOfDay(fromDate)) return false;
                  if (toDate   && d > endOfDay(toDate))     return false;
                  return true;
                });
                const isFreeTier  = tier === 'free';
                const visibleRecs = isFreeTier ? filtered.slice(0, FREE_VISIBLE) : filtered;
                const lockedRecs  = isFreeTier ? filtered.slice(FREE_VISIBLE)    : [];
                const renderCard = (rec: typeof filtered[number]) => (
                  <RecordCard
                    key={rec.id}
                    rec={rec}
                    isExpanded={expandedIds.has(rec.id)}
                    isDark={isDark}
                    accent={accent}
                    canDelete={perms.canLogHealth}
                    colors={colors}
                    s={s}
                    onToggle={toggleExpand}
                    onDelete={deleteRecord}
                  />
                );
                return (
                  <>
                    {visibleRecs.map(renderCard)}
                    {lockedRecs.length > 0 && (
                      <TeaserGate
                        locked
                        minHeight={200}
                        headline={`${pet?.name ?? 'Your baby'} has more records`}
                        body={`You have ${lockedRecs.length} older document${lockedRecs.length !== 1 ? 's' : ''} locked behind the free tier. Upgrade to Pro for unlimited record history.`}
                        ctaLabel="Go Pro for Unlimited Storage"
                        petName={pet?.name}
                        perks={[
                          'Unlimited health records & documents',
                          `FurAI scans every document for ${pet?.name ?? 'your baby'}`,
                          'PDF, photo & camera scan support',
                          'Full document history — no cutoff',
                        ]}
                      >
                        {lockedRecs.map(renderCard)}
                      </TeaserGate>
                    )}
                  </>
                );
              })()}
            </View>
          )}

          {loadingMore && (
            <ActivityIndicator color={accent} size="small" style={{ marginVertical: 16 }} />
          )}
        </ScrollView>
        
      )}

      {/* ── Scroll-to-top FAB ── */}
      {fabVisible && (
        <Animated.View style={[s.fab, { opacity: fabOpacity, backgroundColor: accent, bottom: insets.bottom + 16 }]}>
          <TouchableOpacity onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} style={s.fabInner}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Single unified modal: picker → staging → uploading — never closes between phases ── */}
      <Modal
        visible={sheetPhase !== 'closed'}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (sheetPhase === 'picker') setSheetPhase('closed');
          if (sheetPhase === 'staging') { setSheetPhase('closed'); setStagedPages([]); }
        }}>

        {sheetPhase === 'uploading' ? (
          /* ── Phase 3: uploading progress ── */
          <View style={s.uploadOverlay}>
            <View style={[s.uploadCard, { backgroundColor: colors.surface }]}>
              <View style={[s.uploadIconWrap, { backgroundColor: accent + '15' }]}>
                <Ionicons name="cloud-upload-outline" size={28} color={accent} />
              </View>
              <PawBondLoader size={56} />
              <Text style={[s.uploadTitle, { color: colors.textPrimary }]}>Uploading…</Text>
              <Text style={[s.uploadSub, { color: colors.textSecondary, textAlign: 'center' }]}>{uploadStatus}</Text>
              <Text style={[s.uploadHint, { color: colors.textSecondary }]}>{tier === 'free' ? 'Saving your document…' : 'FurAI will analyze once uploaded'}</Text>
              <TouchableOpacity
                style={{ marginTop: 18, paddingHorizontal: 28, paddingVertical: 11,
                         borderRadius: 22, borderWidth: 1.5, borderColor: colors.border }}
                onPress={() => { cancelUploadRef.current = true; }}>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>

        ) : sheetPhase === 'staging' ? (
          /* ── Phase 2: staging thumbnails ── */
          <View style={s.overlay}>
            <View style={[s.sheet, { backgroundColor: colors.surface }]}>
              <View style={s.sheetHandle} />

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>
                    {stagedPages.length} / {MAX_PAGES} page{stagedPages.length !== 1 ? 's' : ''} queued
                  </Text>
                  <Text style={[s.sheetSub, { color: colors.textSecondary }]}>
                    {stagedPages.length >= MAX_PAGES
                      ? `Page limit reached — save now or remove a page to swap`
                      : tier === 'free' ? 'All pages saved as one document' : 'FurAI will read all pages as one document'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => { setSheetPhase('closed'); setStagedPages([]); }}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <FlashList
                data={stagedPages}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => `${i}`}
                contentContainerStyle={{ gap: 10, paddingVertical: 16 }}
                style={{ maxHeight: 150 }}
                renderItem={({ item, index }) => (
                  <View style={{ position: 'relative' }}>
                    {item.mimeType.includes('pdf') ? (
                      <View style={[s.thumb, { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="document-text-outline" size={30} color={colors.primaryText ?? colors.primary} />
                        <Text style={{ fontSize: TYPO.body, color: colors.primaryText ?? colors.primary, marginTop: 4, fontWeight: '700' }}>PDF</Text>
                      </View>
                    ) : (
                      <LazyImage uri={item.uri} style={s.thumb} resizeMode="cover" />
                    )}
                    <View style={[s.thumbBadge, { backgroundColor: accent }]}>
                      <Text style={{ fontSize: TYPO.body, color: '#fff', fontWeight: '800' }}>P{index + 1}</Text>
                    </View>
                    {/* OCR status dot */}
                    <View style={{ position: 'absolute', bottom: 6, right: 6, width: 14, height: 14, borderRadius: 7,
                      backgroundColor: item.extractedText ? '#0F6E56' : '#854F0B',
                      borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={item.extractedText ? 'text' : 'image-outline'} size={7} color="#fff" />
                    </View>
                    <TouchableOpacity style={s.thumbRemove} onPress={() => removeStagedPage(index)}>
                      <View style={{ backgroundColor: '#fff', borderRadius: 10 }}>
                        <Ionicons name="close-circle" size={20} color="#A32D2D" />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              />

              {/* ── Document type picker ── */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.6, marginBottom: 8 }}>DOCUMENT TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {DOC_TYPES.map(dt => {
                    const sel = docType === dt.key;
                    return (
                      <TouchableOpacity
                        key={dt.key}
                        onPress={() => setDocType(dt.key)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7,
                          borderRadius: 20, borderWidth: 1.5,
                          borderColor: sel ? dt.color : colors.border,
                          backgroundColor: sel ? dt.bg : colors.card }}>
                        <Ionicons name={dt.icon as any} size={13} color={sel ? dt.color : colors.textTertiary} />
                        <Text style={{ fontSize: TYPO.body, fontWeight: sel ? '700' : '500', color: sel ? dt.color : colors.textSecondary }}>{dt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  disabled={stagedPages.length >= MAX_PAGES}
                  style={[s.addMoreBtn, { borderColor: accent + '60', opacity: stagedPages.length >= MAX_PAGES ? 0.38 : 1 }]}
                  onPress={() => setSheetPhase('picker')}>
                  <Ionicons name="add-outline" size={18} color={accent} />
                  <Text style={[s.addMoreText, { color: accent }]}>Add page</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.analyzeBtn, { backgroundColor: accent }]}
                  onPress={analyzeStaged}>
                  <Ionicons name={tier === 'free' ? 'cloud-upload-outline' : 'sparkles-outline'} size={18} color="#fff" />
                  <Text style={s.analyzeBtnText}>
                    {tier === 'free'
                      ? `Save document${stagedPages.length > 1 ? ` (${stagedPages.length} pages)` : ''}`
                      : `Analyze ${stagedPages.length} page${stagedPages.length !== 1 ? 's' : ''}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

        ) : (
          /* ── Phase 1: source picker ── */
          <View style={s.overlay}>
            <View style={[s.sheet, { backgroundColor: colors.surface }]}>
              <View style={s.sheetHandle} />
              <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Add document pages</Text>
              <Text style={[s.sheetSub, { color: colors.textSecondary }]}>
                {stagedPages.length > 0 ? `${stagedPages.length} page${stagedPages.length > 1 ? 's' : ''} queued — add more or analyze` : 'Choose how to add your vet document'}
              </Text>

              <View style={{ gap: 10, marginTop: 20 }}>
                <TouchableOpacity style={[s.sourceCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={addFromCamera}>
                  <View style={[s.sourceIconWrap, { backgroundColor: accent + '15' }]}>
                    <Ionicons name="scan-outline" size={24} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sourceTitle, { color: colors.textPrimary }]}>Scan a page</Text>
                    <Text style={[s.sourceSub, { color: colors.textSecondary }]}>Use camera · tap multiple times to add pages</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>

                <TouchableOpacity style={[s.sourceCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={addFromGallery}>
                  <View style={[s.sourceIconWrap, { backgroundColor: '#185FA5' + '18' }]}>
                    <Ionicons name="images-outline" size={24} color="#185FA5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sourceTitle, { color: colors.textPrimary }]}>Choose from gallery</Text>
                    <Text style={[s.sourceSub, { color: colors.textSecondary }]}>Select multiple images at once</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>

                <TouchableOpacity style={[s.sourceCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={addPDF}>
                  <View style={[s.sourceIconWrap, { backgroundColor: '#534AB7' + '15' }]}>
                    <Ionicons name="document-text-outline" size={24} color="#534AB7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sourceTitle, { color: colors.textPrimary }]}>Upload PDF</Text>
                    <Text style={[s.sourceSub, { color: colors.textSecondary }]}>Digital lab report or discharge summary</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[s.cancelPill, { backgroundColor: colors.card }]} onPress={() => setSheetPhase('closed')}>
                <Text style={[s.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {/* FAB */}
      {perms.canLogHealth && (
        <TouchableOpacity
          disabled={limitReached}
          style={[s.scanFab, { backgroundColor: limitReached ? '#94A3B8' : accent }]}
          onPress={() => limitReached ? showUpgradeAlert({ message: 'Upgrade to Pro for unlimited health records.' }) : setSheetPhase('picker')}
          activeOpacity={0.85}>
          <Ionicons name={limitReached ? 'lock-closed-outline' : 'scan-outline'} size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean, accent: string) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.background },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  sub:     { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  scanBtnText: { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },

  // Hero
  heroCard: { borderRadius: 24, padding: 20 },
  heroIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroTitle: { fontSize: TYPO.heading, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginBottom: 4 },
  heroSub:   { fontSize: TYPO.body, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  capPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  capPillText: { fontSize: TYPO.body, color: 'rgba(255,255,255,0.95)', fontWeight: '600' },
  heroBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, paddingVertical: 13 },
  heroBtnPrimaryText: { fontSize: TYPO.body, fontWeight: '700' },
  heroBtnSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  heroBtnSecondaryText: { fontSize: TYPO.body, fontWeight: '700', color: 'rgba(255,255,255,0.95)' },

  // How it works
  sectionLabel: { fontSize: TYPO.body, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.8, marginBottom: 12 },
  sectionCount: { fontSize: TYPO.body, fontWeight: '700', marginLeft: 8 },
  stepRow:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  stepNum:    { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText:{ fontSize: TYPO.body, fontWeight: '800' },
  stepTitle:  { fontSize: TYPO.body, fontWeight: '700', marginBottom: 2 },
  stepSub:    { fontSize: TYPO.body, lineHeight: 17 },
  formatsBox: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 8 },
  formatsLabel:{ fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5 },
  formatChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  formatChipText: { fontSize: TYPO.body, fontWeight: '600' },

  // Records
  recCard:       { borderWidth: 1, borderRadius: 18, marginBottom: 10, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }, android: { elevation: 2 } }) },
  recRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  recIcon:       { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recName:       { fontSize: TYPO.body, fontWeight: '700', marginBottom: 2 },
  recMeta:       { fontSize: TYPO.body },
  recExpanded:   { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 8 },
  recDetailRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  recDetailText: { fontSize: TYPO.body, lineHeight: 17 },
  recActions:    { flexDirection: 'row', gap: 8, marginTop: 6 },
  recActionBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  recActionBtnText: { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  statusPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:    { fontSize: TYPO.body, fontWeight: '700' },

  fabInner: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },

  // FAB (scan/upload button — distinct from the scroll-to-top `fab` above)
  scanFab:  { position: 'absolute', bottom: 92, right: 20, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },

  // Upload overlay
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  uploadCard:    { borderRadius: 24, padding: 28, alignItems: 'center', gap: 8, width: SW * 0.75 },
  uploadIconWrap:{ width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  uploadTitle:   { fontSize: TYPO.subheading, fontWeight: '700' },
  uploadSub:     { fontSize: TYPO.body, textAlign: 'center' },
  uploadHint:    { fontSize: TYPO.body, textAlign: 'center' },

  // Modals
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 44 },
  sheetHandle:{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  sheetSub:   { fontSize: TYPO.body, marginTop: 4, lineHeight: 18 },

  // Source picker
  sourceCard:     { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, padding: 14 },
  sourceIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sourceTitle:    { fontSize: TYPO.body, fontWeight: '700', marginBottom: 2 },
  sourceSub:      { fontSize: TYPO.body, lineHeight: 17 },
  cancelPill:     { marginTop: 14, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelText:     { fontSize: TYPO.body, fontWeight: '600' },

  // Staging
  thumb:       { width: 88, height: 114, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card },
  thumbBadge:  { position: 'absolute', top: 6, left: 6, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  thumbRemove: { position: 'absolute', top: 4, right: 4 },
  addMoreBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13 },
  addMoreText: { fontSize: TYPO.body, fontWeight: '700' },
  analyzeBtn:  { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 13 },
  analyzeBtnText: { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
});
