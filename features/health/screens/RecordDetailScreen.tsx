import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, Image,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import { saveVaccine, saveMedication, logWeight, saveAppointment, updateHealthRecord, deleteHealthRecord } from '@/lib/db';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { format, parseISO } from 'date-fns';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { showUpgradeAlert } from '@/lib/subscription';
import { ProcessingSteps } from '@/features/health/components/ProcessingSteps';
import { TYPO } from '@/constants/theme';

// ── Types ─────────────────────────────────────────────────────────────────────
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
  ai_summary: string | null;
  extracted_data: ExtractedData | null;
  created_at: string;
  error_message: string | null;
}

interface ExtractedItem {
  type: 'vaccine' | 'medication' | 'lab_result' | 'weight' | 'diagnosis' | 'appointment'
    | 'imaging' | 'procedure' | 'exam_finding' | 'instruction' | 'note';
  date: string | null;
  title: string;
  plain_language: string;
  raw_value: string | null;
  unit: string | null;
  is_abnormal: boolean | null;
  reference_range: string | null;
  next_due: string | null;
  dosage: string | null;
  frequency: string | null;
  manufacturer: string | null;
  follow_up_date: string | null;
  severity: string | null;
  vet_name: string | null;
  clinic: string | null;
  notes: string | null;
}

interface ExtractedData {
  items: ExtractedItem[];
  visit_date: string | null;
  vet_name: string | null;
  clinic: string | null;
  patient_mismatch?: boolean;
  document_patient_name?: string | null;
  document_species?: string | null;
}


// ── Config ────────────────────────────────────────────────────────────────────
const TYPE_CFG: Record<ExtractedItem['type'], { label: string; color: string; bg: string; icon: string }> = {
  vaccine:     { label: 'Vaccine',     color: '#0F6E56', bg: '#E1F5EE', icon: 'shield-checkmark-outline' },
  medication:  { label: 'Medication',  color: '#3C3489', bg: '#EEEDFE', icon: 'medical-outline' },
  lab_result:  { label: 'Lab result',  color: '#0C447C', bg: '#E6F1FB', icon: 'flask-outline' },
  weight:      { label: 'Weight',      color: '#5F5E5A', bg: '#F1EFE8', icon: 'scale-outline' },
  diagnosis:   { label: 'Diagnosis',   color: '#A32D2D', bg: '#FCEBEB', icon: 'bandage-outline' },
  appointment: { label: 'Follow-up',   color: '#854F0B', bg: '#FAEEDA', icon: 'calendar-outline' },
  imaging:     { label: 'Imaging',     color: '#0C447C', bg: '#E6F1FB', icon: 'scan-outline' },
  procedure:   { label: 'Procedure',   color: '#993C1D', bg: '#FAECE7', icon: 'cut-outline' },
  exam_finding:{ label: 'Exam finding',color: '#993556', bg: '#FBEAF0', icon: 'pulse-outline' },
  instruction: { label: 'Instructions',color: '#5F5E5A', bg: '#F1EFE8', icon: 'clipboard-outline' },
  note:        { label: 'Note',        color: '#5F5E5A', bg: '#F1EFE8', icon: 'document-text-outline' },
};
// Fallback config for any type the AI emits that isn't in TYPE_CFG above —
// without this, unrecognized types are extracted and stored but never rendered,
// which looks exactly like "the AI didn't extract this section" from the user's
// side even though the data made it into the DB.
const FALLBACK_CFG = { label: 'Other', color: '#5F5E5A', bg: '#F1EFE8', icon: 'document-text-outline' };

const SAVEABLE = new Set(['vaccine', 'medication', 'lab_result', 'weight', 'appointment']);

// ── Screen ────────────────────────────────────────────────────────────────────
export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const { activePet, activePetId, petRoles } = usePetStore(useShallow(s => ({ activePet: s.activePet, activePetId: s.activePetId, petRoles: s.petRoles })));
  const { tier } = useSubscriptionStore();
  const pet    = activePet();
  const accent = pet?.accent_color ?? colors.primary;
  const perms  = getPermissions(activePetId ? petRoles[activePetId] : 'owner');

  const [record,     setRecord]     = useState<HealthRecord | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [selected,        setSelected]        = useState<Set<number>>(new Set());
  // Large panels (50+ items) render every row if all groups start expanded —
  // start collapsed for those so the initial paint stays fast; small reports
  // still expand by default so nothing needs an extra tap.
  const [expandedGroups,  setExpandedGroups]  = useState<Set<string>>(new Set(Object.keys(TYPE_CFG)));
  const LARGE_REPORT_THRESHOLD = 20;

  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const applyRecord = useCallback((data: any) => {
    setRecord(data as HealthRecord);
    if (data?.status === 'done') {
      const ed = data.extracted_data;
      const items: ExtractedItem[] = ed?.items ?? [];
      const pre = new Set(items.map((_: any, i: number) => i).filter((i: number) => SAVEABLE.has(items[i].type)));
      setSelected(pre);
      if (items.length > LARGE_REPORT_THRESHOLD) setExpandedGroups(new Set());
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.from('health_records').select('*').eq('id', id).single();
      if (!data) return;
      applyRecord(data);
    } catch (e: any) {
      console.error('[RecordDetail] load error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [id, applyRecord]);

  useEffect(() => { load(); }, [load]);

  const [retrying, setRetrying] = useState(false);

  // Source page URLs we can re-send to the analyzer for a retry.
  const retryPages = (): string[] => record?.file_url ? [record.file_url] : [];

  const handleRetry = async () => {
    if (!record) return;
    const pages = retryPages();
    if (pages.length === 0) { router.back(); return; }
    setRetrying(true);
    try {
      // Flip back to processing so the poller picks up the new result.
      await supabase.from('health_records')
        .update({ status: 'processing', error_message: null })
        .eq('id', record.id);
      setRecord(prev => prev ? { ...prev, status: 'processing', error_message: null } : prev);
      const { error } = await supabase.functions.invoke('parse-health-record', {
        body: { record_id: record.id, pet_id: record.pet_id, pages },
      });
      if (error) {
        // Check for Pro subscription gate
        if (error.status === 402) {
          await supabase.from('health_records')
            .update({ status: 'error', error_message: 'Pro feature. Upgrade to parse health records.' })
            .eq('id', record.id);
          setRecord(prev => prev ? { ...prev, status: 'error', error_message: 'Pro feature. Upgrade to parse health records.' } : prev);
          showUpgradeAlert({ message: 'Upgrade to use AI health record analysis.' });
        } else {
          await supabase.from('health_records')
            .update({ status: 'error', error_message: 'Retry failed. Please upload a clearer photo.' })
            .eq('id', record.id);
          setRecord(prev => prev ? { ...prev, status: 'error', error_message: 'Retry failed. Please upload a clearer photo.' } : prev);
        }
      }
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Retry failed. Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  // Realtime: server pushes when analysis completes.
  // Also does a one-time check after subscribing to catch records that
  // finished before the channel was ready (race between edge fn and subscribe).
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const channel = supabase
      .channel(`health_record:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'health_records', filter: `id=eq.${id}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status === 'processing') return;
          applyRecord(updated);
        },
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data } = await supabase.from('health_records').select('*').eq('id', id).single();
          if (mounted && data && data.status !== 'processing') applyRecord(data);
        }
      });

    // Safety timeout — edge fn crashed without writing a result
    const timeout = setTimeout(async () => {
      const { data } = await supabase.from('health_records').select('status').eq('id', id).single();
      if (data?.status === 'processing') {
        await supabase.from('health_records')
          .update({ status: 'error', error_message: 'Analysis timed out. Please try again.' })
          .eq('id', id);
        setRecord(prev => prev ? { ...prev, status: 'error', error_message: 'Analysis timed out. Please try again.' } : prev);
      }
    }, 3 * 60 * 1000);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearTimeout(timeout);
    };
  }, [id, applyRecord]);

  // Poll while processing — fallback in case Realtime row-filter doesn't fire
  useEffect(() => {
    if (record?.status !== 'processing' || !id) return;
    let stopped = false;
    const interval = setInterval(async () => {
      const { data } = await supabase.from('health_records').select('*').eq('id', id).single();
      if (stopped) return;
      if (!data) { clearInterval(interval); stopped = true; return; }
      if (data.status !== 'processing') applyRecord(data);
    }, 5000);
    return () => { stopped = true; clearInterval(interval); };
  }, [record?.status, id, applyRecord]);

  // Pre-select saveables when record loads already-done
  useEffect(() => {
    if (record?.status === 'done' && selected.size === 0) {
      const items: ExtractedItem[] = record.extracted_data?.items ?? [];
      const pre = new Set(items.map((_, i) => i).filter(i => SAVEABLE.has(items[i].type)));
      setSelected(pre);
      if (items.length > LARGE_REPORT_THRESHOLD) setExpandedGroups(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.status]); // intentionally omit `selected` — only auto-select on first status→done transition

  // ── Save selected items ───────────────────────────────────────────────────
  const saveSelected = async () => {
    if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('save health data')); return; }
    if (!record?.pet_id || selected.size === 0) return;
    setSaving(true);
    const items = record.extracted_data?.items ?? [];
    const petId = record.pet_id;
    const docVet    = record.extracted_data?.vet_name ?? null;
    const docClinic = record.extracted_data?.clinic ?? null;
    const errors: string[] = [];
    let saved = 0;
    let skipped = 0;

    // ── Cross-scan dedup: if the same report is scanned twice, don't re-insert
    // rows that already exist (same normalized name + same date). One batched
    // read per table, keyed lookups per item.
    const norm = (s?: string | null) => (s ?? '').toLowerCase().replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim();
    // 23505 = Postgres unique_violation. The pre-check below is only an optimization
    // to skip a round trip for the common case — the DB unique index (migration_health_scan_dedup.sql)
    // is what actually protects against two concurrent scans both passing the pre-check.
    const isDupError = (e: any) => e?.code === '23505' || /duplicate key value/i.test(e?.message ?? '');

    // Levenshtein edit distance — catches OCR/AI misreads of the same drug
    // name across two scans (e.g. "Lamuvudine" vs "Lamuvidine", 1 char apart).
    // Exact-string dedup (the Set-based keys below, and the DB unique index)
    // can't catch this since the strings genuinely differ.
    const levenshtein = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      if (m === 0) return n;
      if (n === 0) return m;
      const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
      return dp[m][n];
    };
    // Fuzzy match: same date, and names within edit-distance 2 (or ratio <20% of
    // the longer name for longer drug names). Used only for medications/vaccines
    // where a misread name is common and dangerous to duplicate.
    const fuzzyDup = (name: string, date: string, existing: { name: string; date: string }[]): boolean =>
      existing.some(e => {
        if (e.date !== date) return false;
        const a = norm(name), b = norm(e.name);
        if (a === b) return true;
        const dist = levenshtein(a, b);
        return dist <= 2 || dist / Math.max(a.length, b.length) < 0.2;
      });

    try {
    const [exVax, exMed, exLab, exWt, exAppt] = await Promise.all([
      supabase.from('vaccines').select('name,last_given').eq('pet_id', petId),
      supabase.from('medications').select('name,start_date').eq('pet_id', petId),
      supabase.from('lab_results').select('test_name,tested_at').eq('pet_id', petId),
      supabase.from('weight_logs').select('weight_kg,logged_at').eq('pet_id', petId),
      supabase.from('appointments').select('title,scheduled_at').eq('pet_id', petId),
    ]);
    const vaxExisting  = (exVax.data ?? []).map((r: any) => ({ name: r.name, date: (r.last_given ?? '').slice(0, 10) }));
    const medExisting  = (exMed.data ?? []).map((r: any) => ({ name: r.name, date: (r.start_date ?? '').slice(0, 10) }));
    const labKeys  = new Set((exLab.data  ?? []).map((r: any) => `${norm(r.test_name)}|${(r.tested_at ?? '').slice(0, 10)}`));
    const wtKeys   = new Set((exWt.data   ?? []).map((r: any) => `${r.weight_kg}|${(r.logged_at ?? '').slice(0, 10)}`));
    const apptKeys = new Set((exAppt.data ?? []).map((r: any) => `${norm(r.title)}|${(r.scheduled_at ?? '').slice(0, 10)}`));

    for (const idx of Array.from(selected)) {
      const item = items[idx];
      if (!item) continue;
      const vet    = item.vet_name    ?? docVet;
      const clinic = item.clinic      ?? docClinic;
      const date   = item.date        ?? record.extracted_data?.visit_date ?? null;

      try {
        if (item.type === 'vaccine') {
          const vaxDate = (date ?? '').slice(0, 10);
          if (fuzzyDup(item.title, vaxDate, vaxExisting)) { skipped++; continue; }
          vaxExisting.push({ name: item.title, date: vaxDate });
          await saveVaccine(petId, {
            name: item.title,
            last_given: date, next_due: item.next_due ?? null,
            vet_name: vet, clinic,
            notes: [item.plain_language, item.notes].filter(Boolean).join(' '),
            source_record_id: record.id,
          } as any);
          saved++;

        } else if (item.type === 'medication') {
          const medDate = (date ?? '').slice(0, 10);
          if (fuzzyDup(item.title, medDate, medExisting)) { skipped++; continue; }
          medExisting.push({ name: item.title, date: medDate });
          const freq = (['daily','weekly','monthly','as_needed'] as const)
            .find(f => f === item.frequency) ?? 'daily';
          const fullPayload = {
            name: item.title,
            dosage: item.dosage ?? null, frequency: freq,
            start_date: date, is_active: true,
            notes: [item.plain_language, item.notes].filter(Boolean).join(' '),
            source: 'scan',
          };
          try {
            await saveMedication(petId, { ...fullPayload, source_record_id: record.id } as any);
          } catch (e: any) {
            // Schema drift retry with core fields only
            if (/column .* of 'medications'|schema cache/i.test(e.message)) {
              await saveMedication(petId, {
                name: item.title,
                dosage: item.dosage ?? null, frequency: freq,
                start_date: date, is_active: true,
                source_record_id: record.id,
              } as any);
            } else throw e;
          }
          saved++;

        } else if (item.type === 'lab_result') {
          const labKey = `${norm(item.title)}|${(date ?? '').slice(0, 10)}`;
          if (labKeys.has(labKey)) { skipped++; continue; }
          labKeys.add(labKey);
          // No service for lab_results — keep direct supabase call
          const { error } = await supabase.from('lab_results').insert({
            pet_id: petId,
            test_name: item.title, name: item.title,
            result_value: item.raw_value ?? null, result: item.raw_value ?? null,
            unit: item.unit ?? null,
            is_abnormal: item.is_abnormal ?? false,
            reference_range: item.reference_range ?? null,
            interpretation: item.plain_language,
            tested_at: date, notes: item.notes ?? null,
            source_record_id: record.id,
          });
          if (error) {
            if (isDupError(error)) skipped++;
            else errors.push(item.title);
          } else saved++;

        } else if (item.type === 'weight') {
          const kg = parseFloat(item.raw_value ?? '0');
          if (!isNaN(kg) && kg > 0) {
            // logWeight stamps logged_at = now, so dedup against today's UTC date (matches existing keys)
            const wtKey = `${kg}|${new Date().toISOString().slice(0, 10)}`;
            if (wtKeys.has(wtKey)) { skipped++; continue; }
            wtKeys.add(wtKey);
            await logWeight(petId, kg, { source_record_id: record.id });
            saved++;
          }

        } else if (item.type === 'appointment') {
          const apptDate = item.follow_up_date ?? date;
          if (apptDate) {
            const apptKey = `${norm(item.title)}|${new Date(apptDate).toISOString().slice(0, 10)}`;
            if (apptKeys.has(apptKey)) { skipped++; continue; }
            apptKeys.add(apptKey);
            await saveAppointment(petId, {
              title: item.title, type: 'checkup',
              scheduled_at: new Date(apptDate).toISOString(),
              vet_name: vet, clinic_name: clinic,
              notes: [item.plain_language, item.notes].filter(Boolean).join(' '),
              status: 'upcoming',
              source_record_id: record.id,
            } as any);
            saved++;
          }
        }
      } catch (e: any) {
        // Two concurrent scans both passed the pre-check above; the DB unique
        // index caught the second insert — that's a skip, not a failure.
        if (isDupError(e)) skipped++;
        else errors.push(item.title);
      }
    }

    const dupNote = skipped > 0 ? ` ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped (already saved).` : '';
    if (errors.length) {
      await updateHealthRecord(record.id, { auto_saved: saved > 0 });
      showAlert(`Saved ${saved}, ${errors.length} failed`, `Could not save: ${errors.join(', ')}.${dupNote}`);
    } else {
      await updateHealthRecord(record.id, { auto_saved: true });
      // Create a tagged timeline entry so it gets cascade-deleted with the record
      const abnormalItems = items.filter(it => (it as any).is_abnormal);
      const timelineDesc = (record.extracted_data as any)?.ai_summary ?? record.ai_summary ??
        (abnormalItems.length > 0
          ? `${abnormalItems.length} abnormal finding${abnormalItems.length !== 1 ? 's' : ''}: ${abnormalItems.slice(0, 3).map((it: any) => it.title).join(', ')}`
          : `${saved} health item${saved !== 1 ? 's' : ''} extracted by FurAI`);
      const visitDate = record.extracted_data?.visit_date ?? record.created_at.slice(0, 10);
      await supabase.from('pet_timelines').upsert({
        pet_id: record.pet_id,
        title: record.file_name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || 'Health record',
        description: timelineDesc,
        event_date: visitDate,
        category: 'health',
        is_pinned: false,
        created_by: (await supabase.auth.getUser()).data.user?.id,
        source_record_id: record.id,
      }, { onConflict: 'source_record_id' }).select();
      await load();
      showAlert('✓ Saved', `${saved} item${saved !== 1 ? 's' : ''} added to ${pet?.name ?? 'your baby'}'s health profile.${dupNote}`);
    }
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not save health data. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const toggleItem = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const items = record?.extracted_data?.items ?? [];
  const saveableCount = items.filter((_, i) => selected.has(i) && SAVEABLE.has(items[i].type)).length;

  if (loading) return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <PawBondLoader size={56} />
    </SafeAreaView>
  );

  if (!record) return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Text style={{ color: colors.textPrimary, padding: 20 }}>Record not found.</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={s.title} numberOfLines={1}>{record.file_name}</Text>
          <PetHeaderChip pet={pet as any} meta={[
            record.source === 'camera' ? 'Camera scan' : record.file_type === 'pdf' ? 'PDF' : 'Photo',
            record.page_count > 1 ? `${record.page_count} pages` : null,
            format(parseISO(record.created_at), 'MMM d, yyyy'),
          ].filter(Boolean).join(' · ')} />
        </View>
        {/* Delete record */}
        {perms.canLogHealth && (
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => showAlert('Delete record', 'This will permanently remove this health record.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => {
                try { await deleteHealthRecord(record.id); router.back(); }
                catch (e: any) { showAlert('Could not delete', e.message); }
              }},
            ])}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── RAW (free tier — document viewer + download) ───────────────────── */}
      {record.status === 'raw' && (() => {
        const pageUrls: string[] = record.file_url ? [record.file_url] : [];
        const isPdf = record.file_type === 'pdf';

        const handleDownload = async (url: string, index: number) => {
          try {
            const ext  = isPdf ? 'pdf' : 'jpg';
            const name = `${record.file_name.replace(/[^a-zA-Z0-9_-]/g, '_')}_p${index + 1}.${ext}`;
            const dest = `${(FileSystem as any).documentDirectory}${name}`;
            const { uri } = await FileSystem.downloadAsync(url, dest);
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
              await Sharing.shareAsync(uri, { mimeType: isPdf ? 'application/pdf' : 'image/jpeg', dialogTitle: 'Save document' });
            } else {
              showAlert('Saved', `File saved to ${uri}`);
            }
          } catch (e: any) {
            showAlert('Download failed', e.message ?? 'Could not download file.');
          }
        };

        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {/* Info row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
              <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={isPdf ? 'document-text-outline' : 'image-outline'} size={22} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>{record.file_name}</Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>
                  {format(parseISO(record.created_at), 'MMM d, yyyy')} · {record.page_count} page{record.page_count !== 1 ? 's' : ''} · {record.file_type.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Pages — images shown inline; PDFs open in browser */}
            {pageUrls.length > 0 ? pageUrls.map((url, i) => (
              <View key={i} style={{ marginBottom: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
                {/* Page header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>
                    {pageUrls.length > 1 ? `Page ${i + 1} of ${pageUrls.length}` : 'Document'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => WebBrowser.openBrowserAsync(url)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: accent + '15' }}>
                      <Ionicons name="open-outline" size={14} color={accent} />
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: accent }}>Open</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDownload(url, i)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: accent + '15' }}>
                      <Ionicons name="download-outline" size={14} color={accent} />
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: accent }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* Image preview (not for PDF) */}
                {!isPdf && (
                  <TouchableOpacity activeOpacity={0.85} onPress={() => WebBrowser.openBrowserAsync(url)}>
                    <Image
                      source={{ uri: url }}
                      style={{ width: '100%', height: 320 }}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                )}
                {/* PDF placeholder */}
                {isPdf && (
                  <TouchableOpacity
                    onPress={() => WebBrowser.openBrowserAsync(url)}
                    style={{ height: 120, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Ionicons name="document-text-outline" size={40} color={accent} />
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Tap to open PDF</Text>
                  </TouchableOpacity>
                )}
              </View>
            )) : (
              <View style={{ alignItems: 'center', padding: 32 }}>
                <Ionicons name="document-outline" size={40} color={colors.textTertiary} />
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 8 }}>No preview available</Text>
              </View>
            )}

            {/* Upgrade CTA */}
            <TouchableOpacity
              onPress={() => showUpgradeAlert({ message: 'Upgrade to Pro — FurAI extracts vaccines, medications, lab results and appointments automatically.' })}
              style={{ borderRadius: 16, padding: 18, backgroundColor: '#7C3AED18', borderWidth: 1, borderColor: '#7C3AED40', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Ionicons name="sparkles-outline" size={28} color="#7C3AED" />
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#7C3AED' }}>Unlock FurAI Analysis</Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>
                Upgrade to Pro — FurAI extracts vaccines, medications, lab results and appointments automatically.
              </Text>
              <View style={{ backgroundColor: '#7C3AED', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: TYPO.body }}>Upgrade to Pro</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        );
      })()}

      {/* ── PROCESSING ─────────────────────────────────────────────────────── */}
      {record.status === 'processing' && (
        <ProcessingSteps accent={accent} colors={colors} createdAt={record.created_at} />
      )}

      {/* ── ERROR ──────────────────────────────────────────────────────────── */}
      {record.status === 'error' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          <View style={{ borderRadius: 24, padding: 28, alignItems: 'center', gap: 12, backgroundColor: colors.card }}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', textAlign: 'center', color: colors.textPrimary }}>Couldn’t read this document</Text>
            <Text style={{ fontSize: TYPO.body, textAlign: 'center', lineHeight: 21, color: colors.textSecondary }}>
              We weren’t able to analyze this file. This can happen with blurry photos or an unstable
              connection. You can try again, or upload a clearer photo of each page.
            </Text>
            {/* Raw error only in development — never shown to end users */}
            {__DEV__ && !!record.error_message && (
              <View style={[s.errorBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Text style={{ fontSize: TYPO.body, color: '#A32D2D', fontFamily: 'monospace' }}>{record.error_message}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              {retryPages().length > 0 && (
                <TouchableOpacity
                  style={[s.retryBtn, { backgroundColor: accent, opacity: retrying ? 0.6 : 1 }]}
                  onPress={handleRetry}
                  disabled={retrying}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{retrying ? 'Retrying…' : 'Try again'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.retryBtn, { backgroundColor: colors.border }]} onPress={() => router.back()}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Upload another</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── DONE ───────────────────────────────────────────────────────────── */}
      {record.status === 'done' && (
        <>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>

            {/* Wrong pet warning — computed client-side from stored doc name/species */}
            {(() => {
              const ed = record.extracted_data;
              if (!ed) return null;
              const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
              const SPECIES_MAP: Record<string, string[]> = {
                dog: ['dog', 'canine', 'k9'], cat: ['cat', 'feline'],
                rabbit: ['rabbit', 'bunny'], bird: ['bird', 'avian'],
              };
              const toCanonical = (s: string) => {
                const n = norm(s);
                for (const [key, aliases] of Object.entries(SPECIES_MAP))
                  if (aliases.some(a => n.includes(a))) return key;
                return n;
              };
              const docName = ed.document_patient_name;
              const docSpecies = ed.document_species;
              const petName = pet?.name;
              const petSpecies = pet?.species;
              const nameMismatch = !!(docName && petName &&
                !norm(docName).includes(norm(petName)) &&
                !norm(petName).includes(norm(docName)));
              const speciesMismatch = !!(docSpecies && petSpecies &&
                toCanonical(docSpecies) !== toCanonical(petSpecies));
              const isMismatch = nameMismatch || speciesMismatch;
              if (!isMismatch) return null;
              const detail = [
                docName ?? null,
                docSpecies ? `a ${docSpecies}` : null,
              ].filter(Boolean).join(', ') || 'a different pet';
              return (
                <View style={[s.savedBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B40', marginBottom: 10 }]}>
                  <Ionicons name="warning-outline" size={16} color="#B45309" />
                  <Text style={{ fontSize: TYPO.body, color: '#B45309', fontWeight: '600', flex: 1 }}>
                    This record appears to be for{' '}
                    <Text style={{ fontWeight: '800' }}>{detail}</Text>
                    , not {petName ?? 'this pet'}. Please check you uploaded the right document.
                  </Text>
                </View>
              );
            })()}

            {/* Already saved banner */}
            {record.auto_saved && (
              <View style={[s.savedBanner, { backgroundColor: '#E1F5EE', borderColor: '#0F6E5640' }]}>
                <Ionicons name="checkmark-circle" size={16} color="#0F6E56" />
                <Text style={{ fontSize: TYPO.body, color: '#0F6E56', fontWeight: '600', flex: 1 }}>
                  Already saved to {pet?.name ?? 'your baby'}'s profile
                </Text>
              </View>
            )}

            {/* Visit card — date / vet / clinic */}
            <View style={[s.visitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.visitIconWrap, { backgroundColor: accent + '18' }]}>
                <Ionicons name="document-text-outline" size={20} color={accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.visitTitle, { color: colors.textPrimary }]} numberOfLines={1}>{record.file_name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 }}>
                  {record.extracted_data?.visit_date && (
                    <View style={s.visitChip}>
                      <Ionicons name="calendar-outline" size={11} color={colors.textTertiary} />
                      <Text style={[s.visitChipText, { color: colors.textSecondary }]}>
                        {format(parseISO(record.extracted_data.visit_date), 'MMM d, yyyy')}
                      </Text>
                    </View>
                  )}
                  {record.extracted_data?.vet_name && (
                    <View style={s.visitChip}>
                      <Ionicons name="person-outline" size={11} color={colors.textTertiary} />
                      <Text style={[s.visitChipText, { color: colors.textSecondary }]}>Dr. {record.extracted_data.vet_name}</Text>
                    </View>
                  )}
                  {record.extracted_data?.clinic && (
                    <View style={s.visitChip}>
                      <Ionicons name="business-outline" size={11} color={colors.textTertiary} />
                      <Text style={[s.visitChipText, { color: colors.textSecondary }]}>{record.extracted_data.clinic}</Text>
                    </View>
                  )}
                  {record.page_count > 1 && (
                    <View style={s.visitChip}>
                      <Ionicons name="copy-outline" size={11} color={colors.textTertiary} />
                      <Text style={[s.visitChipText, { color: colors.textSecondary }]}>{record.page_count} pages</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* AI summary */}
            {record.ai_summary && (
              <View style={[s.summaryBox, { backgroundColor: accent + '10', borderColor: accent + '28' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="sparkles-outline" size={13} color={accent} />
                  <Text style={[s.summaryLabel, { color: accent }]}>FURAI SUMMARY</Text>
                </View>
                <Text style={[s.summaryText, { color: colors.textPrimary }]}>{record.ai_summary}</Text>
              </View>
            )}

            {/* Select-all row */}
            {items.length > 0 && !record.auto_saved && (
              <View style={[s.selectAllRow, { borderColor: colors.border }]}>
                <Text style={[s.selectAllLabel, { color: colors.textSecondary }]}>Tap a group to select all · tap item to toggle</Text>
                <TouchableOpacity onPress={() => {
                  const saveableIdxs = items.map((_,i) => i).filter(i => SAVEABLE.has(items[i].type));
                  const allSelected  = saveableIdxs.every(i => selected.has(i));
                  setSelected(allSelected ? new Set() : new Set(saveableIdxs));
                }}>
                  <Text style={[s.selectAllBtn, { color: accent }]}>
                    {items.map((_,i) => i).filter(i => SAVEABLE.has(items[i].type)).every(i => selected.has(i))
                      ? 'Deselect all' : 'Select all'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Empty */}
            {items.length === 0 && (
              <View style={s.emptyWrap}>
                <Ionicons name="document-outline" size={40} color={colors.textTertiary} />
                <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Nothing extracted</Text>
                <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                  FurAI couldn't find structured health data. The image may be blurry or the document type isn't supported.
                </Text>
              </View>
            )}

            {/* ── Grouped collapsible sections ──
                 Group by whatever types are actually present in the data, not just
                 the known TYPE_CFG keys — a type the AI emits outside that fixed
                 list (or a future one added to the prompt but not yet given a
                 dedicated config here) still gets its own section via FALLBACK_CFG
                 instead of silently disappearing. */}
            {Array.from(new Set(items.map(i => i.type))).map(type => {
              const groupItems = items
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => item.type === type);
              if (groupItems.length === 0) return null;

              const cfg      = TYPE_CFG[type] ?? FALLBACK_CFG;
              const saveable = SAVEABLE.has(type);
              const isOpen   = expandedGroups.has(type);

              // How many in group are selected
              const groupSelected = groupItems.filter(({ idx }) => selected.has(idx)).length;
              const allGroupSel   = saveable && groupSelected === groupItems.length;

              return (
                <View key={type} style={{ marginBottom: 12 }}>
                  {/* Group header card */}
                  <TouchableOpacity
                    style={[s.groupHeader, { backgroundColor: colors.card, borderColor: isOpen ? cfg.color + '50' : colors.border }]}
                    activeOpacity={0.75}
                    onPress={() => {
                      // If saveable: first tap selects all in group, second tap toggles open
                      if (saveable && !record.auto_saved && !allGroupSel) {
                        // Select all in group
                        setSelected(prev => {
                          const next = new Set(prev);
                          groupItems.forEach(({ idx }) => next.add(idx));
                          return next;
                        });
                      }
                      setExpandedGroups(prev => {
                        const next = new Set(prev);
                        if (next.has(type)) next.delete(type); else next.add(type);
                        return next;
                      });
                    }}>

                    {/* Left: colored icon */}
                    <View style={[s.groupIconWrap, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
                    </View>

                    {/* Middle: label + count */}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.groupLabel, { color: colors.textPrimary }]}>{cfg.label}s</Text>
                      <Text style={[s.groupCount, { color: colors.textSecondary }]}>
                        {groupItems.length} item{groupItems.length > 1 ? 's' : ''}
                        {saveable && !record.auto_saved && groupSelected > 0
                          ? ` · ${groupSelected} selected` : ''}
                      </Text>
                    </View>

                    {/* Right: checkbox (saveable) + chevron */}
                    {saveable && !record.auto_saved && (
                      <View style={[s.groupCheckbox, {
                        borderColor: allGroupSel ? cfg.color : colors.border,
                        backgroundColor: allGroupSel ? cfg.color : 'transparent',
                      }]}>
                        {allGroupSel && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                    )}
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.textTertiary}
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>

                  {/* Expanded sub-items */}
                  {isOpen && (
                    <View style={[s.subList, { borderColor: cfg.color + '30', backgroundColor: colors.background }]}>
                      {groupItems.map(({ item, idx }, gi) => {
                        const isSel  = selected.has(idx);
                        const isLast = gi === groupItems.length - 1;
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[
                              s.subItem,
                              !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                              saveable && !record.auto_saved && isSel && { backgroundColor: cfg.color + '08' },
                            ]}
                            activeOpacity={saveable && !record.auto_saved ? 0.7 : 1}
                            onPress={() => saveable && !record.auto_saved && toggleItem(idx)}>

                            {/* Spine dot */}
                            <View style={{ alignItems: 'center', width: 20, paddingTop: 2 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isSel && saveable ? cfg.color : colors.border }} />
                              {!isLast && <View style={{ width: 1.5, flex: 1, backgroundColor: colors.border, marginTop: 3 }} />}
                            </View>

                            <View style={{ flex: 1, paddingLeft: 10 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <Text style={[s.subTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                                {item.date && (
                                  <Text style={[s.subDate, { color: colors.textSecondary }]}>
                                    {format(parseISO(item.date), 'MMM d')}
                                  </Text>
                                )}
                              </View>
                              {!!item.plain_language && (
                                <Text style={[s.subPlain, { color: colors.textSecondary }]}>{item.plain_language}</Text>
                              )}

                              {/* Lab value inline */}
                              {item.type === 'lab_result' && item.raw_value && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                                  <Text style={[s.subValue, { color: colors.textPrimary }]}>
                                    {item.raw_value}{item.unit ? ` ${item.unit}` : ''}
                                  </Text>
                                  {item.is_abnormal === true && (
                                    <View style={s.abnormalBadge}><Text style={s.abnormalText}>ABNORMAL</Text></View>
                                  )}
                                  {item.is_abnormal === false && (
                                    <View style={s.normalBadge}><Text style={s.normalText}>NORMAL</Text></View>
                                  )}
                                  {item.reference_range && (
                                    <Text style={[s.subDate, { color: colors.textSecondary }]}>Ref: {item.reference_range}</Text>
                                  )}
                                </View>
                              )}

                              {/* Med dosage */}
                              {item.type === 'medication' && (item.dosage || item.frequency) && (
                                <Text style={[s.subValue, { color: colors.textSecondary, marginTop: 4 }]}>
                                  {[item.dosage, item.frequency?.replace('_',' ')].filter(Boolean).join(' · ')}
                                </Text>
                              )}

                              {/* Vaccine manufacturer + next due */}
                              {item.type === 'vaccine' && (
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                                  {item.manufacturer && <Text style={[s.subDate, { color: colors.textSecondary }]}>{item.manufacturer}</Text>}
                                  {item.next_due && <Text style={{ fontSize: TYPO.body, color: '#0F6E56', fontWeight: '600' }}>Due {format(parseISO(item.next_due), 'MMM d, yyyy')}</Text>}
                                </View>
                              )}

                              {/* Appointment follow-up */}
                              {item.follow_up_date && (
                                <Text style={{ fontSize: TYPO.body, color: '#854F0B', fontWeight: '600', marginTop: 4 }}>
                                  Follow-up {format(parseISO(item.follow_up_date), 'MMM d, yyyy')}
                                </Text>
                              )}
                            </View>

                            {/* Checkbox */}
                            {saveable && !record.auto_saved && (
                              <View style={[s.subCheckbox, {
                                borderColor: isSel ? cfg.color : colors.border,
                                backgroundColor: isSel ? cfg.color : 'transparent',
                              }]}>
                                {isSel && <Ionicons name="checkmark" size={10} color="#fff" />}
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Sticky save bar */}
          {!record.auto_saved && saveableCount > 0 && perms.canLogHealth && (
            <View style={[s.saveBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.saveBarTitle, { color: colors.textPrimary }]}>
                  {saveableCount} item{saveableCount !== 1 ? 's' : ''} selected
                </Text>
                <Text style={[s.saveBarSub, { color: colors.textSecondary }]}>
                  Will be added to {pet?.name ?? 'your baby'}'s health timeline
                </Text>
              </View>
              <TouchableOpacity
                style={[s.saveBarBtn, { backgroundColor: accent, opacity: saving ? 0.6 : 1 }]}
                onPress={saveSelected}
                disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                      <Text style={s.saveBarBtnText}>Save to profile</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.background },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  iconBtn:{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  sub:     { fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 },

  stateWrap: { flex: 1, padding: 24 },
  errorBox:  { borderWidth: 1, borderRadius: 10, padding: 12, width: '100%' },
  retryBtn:  { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },

  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },

  // Visit card
  visitCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  visitIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  visitTitle:    { fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary },
  visitChip:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  visitChipText: { fontSize: TYPO.body },

  summaryBox:   { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  summaryLabel: { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.5 },
  summaryText:  { fontSize: TYPO.body, lineHeight: 20 },

  selectAllRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 4 },
  selectAllLabel:{ fontSize: TYPO.body, fontWeight: '500' },
  selectAllBtn:  { fontSize: TYPO.body, fontWeight: '700' },

  emptyWrap:  { alignItems: 'center', paddingVertical: 48, gap: 10, paddingHorizontal: 16 },
  emptyTitle: { fontSize: TYPO.subheading, fontWeight: '700' },
  emptySub:   { fontSize: TYPO.body, textAlign: 'center', lineHeight: 20 },

  // Group header
  groupHeader:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  groupIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  groupLabel:    { fontSize: TYPO.body, fontWeight: '700' },
  groupCount:    { fontSize: TYPO.body, marginTop: 1 },
  groupCheckbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Sub-items list
  subList:    { marginTop: 4, borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginLeft: 12 },
  subItem:    { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 0 },
  subTitle:   { fontSize: TYPO.body, fontWeight: '700', flex: 1 },
  subDate:    { fontSize: TYPO.body },
  subPlain:   { fontSize: TYPO.body, lineHeight: 17, marginTop: 2 },
  subValue:   { fontSize: TYPO.body, fontWeight: '600' },
  subCheckbox:{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 },

  abnormalBadge: { backgroundColor: '#FCEBEB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  abnormalText:  { fontSize: TYPO.body, fontWeight: '700', color: '#A32D2D' },
  normalBadge:   { backgroundColor: '#E1F5EE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  normalText:    { fontSize: TYPO.body, fontWeight: '700', color: '#0F6E56' },

  saveBar:       { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
  saveBarTitle:  { fontSize: TYPO.body, fontWeight: '700' },
  saveBarSub:    { fontSize: TYPO.body, marginTop: 1 },
  saveBarBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  saveBarBtnText:{ color: '#fff', fontSize: TYPO.body, fontWeight: '700' },

});
