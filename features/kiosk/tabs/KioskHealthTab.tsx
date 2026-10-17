/**
 * KioskHealthTab — kiosk-sized wrapper around the same HealthTab/RecordsTab
 * components the phone's HealthRecordsScreen.tsx switches between
 * (Medications / Immunizations / Records). Live-requested: "add all the
 * pills for the pages which is on the mobile hub screen [to] the kiosk
 * side bar" — Health is one of the Hub's AppsQuickAccessPills entries with
 * no kiosk-native equivalent until now.
 *
 * Mirrors the phone screen's one 3-way segmented switch (not two stacked
 * switches — that was live-reported as confusing there and the fix
 * shouldn't regress here), just re-styled with kiosk's bigger touch
 * targets. Same reuse pattern as every other kiosk tab: the inner
 * components already read activeMemberId/role themselves.
 *
 * ── Hub-OS migration ────────────────────────────────────────────────────
 * Title block, segmented switch and the card the content sits in are now
 * built from the kiosk palette + KioskOS primitives. The kid gate is
 * unchanged: a kid still sees Medications only, and never Immunizations or
 * Records — that is a role-permission rule from the audit pass, not
 * styling, so it survives verbatim below.
 *
 * The embedded HealthTab/RecordsTab are shared phone components styled from
 * the app's own `colors`; see KioskSchoolTab's header for why that prop is
 * still threaded through rather than forked. Both palettes resolve off the
 * same useTheme() isDark, so the two never disagree about light vs dark.
 *
 * ── Two-column redesign, matching Chores/Schedule ──────────────────────
 * Live-requested: "follow the health also same design pattern like we did
 * for chores and the schedule" → "i think we should redesign these tabs to
 * inspiring from other pages" → "Ok, now proceed with health to match with
 * the mobile core logic and the redesign". HealthTabComp/RecordsTabComp
 * still mount VERBATIM, unmodified, as the centerCol's own content — every
 * real action (add/edit/delete/mark-taken/scan/AI assistant/records
 * search+filter+download) is exactly the same component the phone uses, so
 * 100% of the real mobile logic survives untouched.
 *
 * The NEW piece is the sideCol, matching Chores' own sidebar pattern
 * (KioskTasksTab.tsx's "Who has what"/"Coin balance" jar-row panels): a
 * small, real-data summary alongside the main content. Genuinely new
 * plumbing was unavoidable here — unlike Chores' useChoreStore, meds/vax
 * data lives ONLY in HealthTabComp's own local useState, populated by a
 * direct Supabase query with no shared store to read from (confirmed via a
 * full read of features/vault/tabs/HealthTab.tsx). So this file runs its
 * OWN read-only fetch of the exact same two tables
 * (family_medications/family_vaccines), with the exact same
 * kidView+member_id filter HealthTab.tsx's own `load()` applies — this is
 * the one correctness rule that matters: a kid session must never see
 * another member's medication data leak into the sidebar. The fetch is
 * purely additive (no writes, no realtime channel) and never touches what
 * HealthTabComp itself renders or how it mutates data.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, useWindowDimensions } from 'react-native';
import { Pill, Syringe, FolderOpen, Plus, ScanLine, History, Check, XCircle, Clock, AlarmClock, Repeat, Mic, FileDown, Sparkles, Trash2, Search, FileText, Download } from 'lucide-react-native';
import { Alert } from 'react-native';
import { KioskAreaMenu, type AreaItem } from '../components/KioskAreaMenu';
import { kioskPastels } from '../kioskPalette';
import { shareVaccineRecordsPdf } from '@/features/vault/tabs/health/vaxPdfExport';
import { useHealthAi } from '@/features/vault/tabs/health/useHealthAi';
import { encodeTakenEntry, FREQ_LABELS } from '@/features/vault/tabs/health/types';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, PanelHead, TabTitle, Chip, EmptyNote, ActionButton } from '../components/KioskOS';
import { useKioskActivity } from '../KioskActivityContext';
import { useUIStore } from '@/store/uiStore';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { assigneeStyle } from '@/features/calendar/components/EventCard';
import { supabase } from '@/lib/supabase';
import { claimChannel } from '@/lib/realtimeChannel';
import { today as todayStr, medicationAdherenceHistory, groupHistoryByDay, formatDoseTime, fmtDateDisplay } from '@/features/vault/tabs/health/types';
import type { Medication, Vaccine, MedForm, VaxForm, DoseAdherence } from '@/features/vault/tabs/health/types';
import type { MedRecord } from '@/features/vault/records/types';
import type { ParsedMedication, ParsedVaccine } from '@/features/vault/usePrescriptionScanner';
import type { RecordForm } from '@/features/vault/records/types';
import type * as DocumentPicker from 'expo-document-picker';
import HealthTabComp from '@/features/vault/tabs/HealthTab';
import RecordsTabComp from '@/features/vault/tabs/RecordsTab';
import { KioskAddMedForm } from '../components/KioskAddMedForm';
import { KioskAddVaxForm } from '../components/KioskAddVaxForm';
import { KioskAddRecordForm } from '../components/KioskAddRecordForm';
import { KioskScanReviewForm } from '../components/KioskScanReviewForm';
import { showToast } from '@/components/AppToast';
import { KioskHealthAiWidget } from '../components/KioskHealthAiWidget';
import { KioskFormDrawer } from '../components/KioskFormDrawer';
import { KioskAvatar } from '../components/KioskAvatar';

type Segment = 'meds' | 'vax' | 'records';

// Same real overdue rule HealthTab.tsx's own isOverdue uses (its own
// per-med grace window off frequency_times[0] + escalation_after_min or a
// flat 60min default) — read in full and ported verbatim, not
// re-approximated, so the sidebar's "overdue" count can never disagree
// with what the real Medications list itself calls overdue.
function isMedOverdue(med: Medication): boolean {
  if (med.taken_date === todayStr()) return false;
  if (!med.frequency_times?.length) return false;
  const now = new Date();
  const [hh, mm] = med.frequency_times[0].split(':').map(Number);
  const scheduled = new Date();
  scheduled.setHours(hh, mm, 0, 0);
  const graceMins = med.escalation_enabled ? med.escalation_after_min : 60;
  scheduled.setMinutes(scheduled.getMinutes() + graceMins);
  return now > scheduled;
}

export function KioskHealthTab({ isKid, colors, isDark }: {
  isKid: boolean; colors: any; isDark: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const [tab, setTab] = useState<Segment>('meds');
  const { width: winWidth } = useWindowDimensions();
  const isNarrowLayout = winWidth < 1080;
  const role = (useFamilyStore.getState().members.find(m => m.id === useFamilyStore.getState().activeMemberId)?.role ?? 'parent') as string;
  const own = role !== 'parent';

  // ROLE GATE (audit pass) — a kid sees Medications only. Unchanged by the
  // visual migration.
  const SEGMENTS: { key: Segment; label: string; Icon: any; tint: string }[] = isKid
    ? [{ key: 'meds', label: 'Medications', Icon: Pill, tint: k.danger }]
    : [
        { key: 'meds',    label: 'Medications',   Icon: Pill,       tint: k.danger },
        { key: 'vax',     label: 'Immunizations', Icon: Syringe,    tint: k.sage },
        { key: 'records', label: 'Records',       Icon: FolderOpen, tint: k.blue },
      ];

  const current = SEGMENTS.find(seg => seg.key === tab) ?? SEGMENTS[0];
  const accent = current.tint;

  // HealthTabComp only mounts for meds/vax and owns the FAB-segment flag
  // for those two on the phone (no FAB in kiosk to target, but this store
  // write is harmless/shared) — when Records is selected here, set it
  // directly, mirroring HealthRecordsScreen.tsx's own same effect.
  useEffect(() => {
    if (tab === 'records') useUIStore.getState().setHealthRecordsActiveSegment('records');
  }, [tab]);

  // ── Sidebar's own read-only fetch ─────────────────────────────────────
  // Same two tables, same kidView+member_id filter HealthTab.tsx's own
  // load() uses — this file's members/familyId/activeMember resolution is
  // copied from that same component for the same reason. Purely additive:
  // no writes, no realtime subscription (the sidebar refreshing a few
  // seconds behind a live edit is an acceptable trade against duplicating
  // HealthTab.tsx's whole realtime-channel plumbing a second time for a
  // summary panel).
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const [sideMeds, setSideMeds] = useState<Medication[]>([]);
  const [sideVaxes, setSideVaxes] = useState<Vaccine[]>([]);
  const [sideRecords, setSideRecords] = useState<MedRecord[]>([]);

  const loadSidebar = useCallback(async () => {
    if (familyId === 'family-1') return;
    const medsQ = own && activeMember?.id
      ? supabase.from('family_medications').select('*').eq('family_id', familyId).eq('member_id', activeMember.id)
      : supabase.from('family_medications').select('*').eq('family_id', familyId);
    const vaxQ = own && activeMember?.id
      ? supabase.from('family_vaccines').select('*').eq('family_id', familyId).eq('member_id', activeMember.id)
      : supabase.from('family_vaccines').select('*').eq('family_id', familyId);
    // Records segment is parent-only (kids never reach it — same SEGMENTS
    // gate above), so this query never needs a member_id filter the way
    // meds/vax do above.
    const recordsQ = isKid
      ? null
      : supabase.from('medical_records').select('*').eq('family_id', familyId).order('record_date', { ascending: false });
    const [medsRes, vaxRes, recordsRes] = await Promise.all([
      medsQ.order('created_at', { ascending: false }),
      vaxQ.order('date', { ascending: false }),
      recordsQ ?? Promise.resolve({ data: [] as MedRecord[], error: null }),
    ]);
    // Errors were previously swallowed silently — a failed fetch (RLS,
    // network) looked identical to "no data" and just made the whole
    // sidebar vanish with zero visible feedback [live-reported: "i didn't
    // find these widgets"], making a real bug indistinguishable from an
    // empty household.
    if (medsRes.error) console.warn('[KioskHealthTab] sidebar meds fetch failed:', medsRes.error);
    if (vaxRes.error) console.warn('[KioskHealthTab] sidebar vax fetch failed:', vaxRes.error);
    if ('error' in recordsRes && recordsRes.error) console.warn('[KioskHealthTab] sidebar records fetch failed:', recordsRes.error);
    if (medsRes.data) setSideMeds(medsRes.data as Medication[]);
    if (vaxRes.data) setSideVaxes(vaxRes.data as Vaccine[]);
    if (recordsRes.data) setSideRecords(recordsRes.data as MedRecord[]);
  }, [familyId, isKid, activeMember?.id]);

  useEffect(() => { loadSidebar(); }, [loadSidebar]);
  // Re-fetch whenever the segment switch changes tabs — cheap, and keeps
  // the sidebar reasonably fresh after a visit to the real add/edit modals
  // inside HealthTabComp without needing a second realtime channel.
  useEffect(() => { loadSidebar(); }, [tab, loadSidebar]);

  // ── Realtime — same real tables/filters HealthTab.tsx's own
  // health-${familyId} channel and RecordsTab.tsx's own medrec-${familyId}
  // channel subscribe to [live-reported: "see the all channels it is
  // ubscriber for rel time data to reflect and cahe etc similar to mobile
  // app.."] — the sidebar's own fetch was purely one-shot before this,
  // so a change made from ANOTHER device (or even this same device's
  // HealthTabComp, which subscribes under its own topic name) never
  // reached the sidebar until the next segment-tab switch. A distinct
  // topic name (kiosk-health-sidebar-*, not health-*/medrec-*) is
  // deliberate: HealthTabComp/RecordsTabComp are mounted in the SAME
  // tree and already hold the real health-${familyId}/medrec-${familyId}
  // topics, and claimChannel() returns null for a second subscribe
  // attempt on an already-active topic — reusing their exact topic name
  // here would silently give the sidebar no realtime channel at all.
  useEffect(() => {
    if (familyId === 'family-1') return;
    const ch = claimChannel(`kiosk-health-sidebar-${familyId}`);
    if (!ch) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'family_medications', filter: `family_id=eq.${familyId}` }, () => loadSidebar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_vaccines', filter: `family_id=eq.${familyId}` }, () => loadSidebar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records', filter: `family_id=eq.${familyId}` }, () => loadSidebar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [familyId, loadSidebar]);

  // ── Add Med / Add Vax / Add Record / Scan Rx / Scan Vax ────────────────
  // [live-reported: "there we should have add med add vax scan recod on
  // the section heading right corner.. get all the add form from the
  // mobile equevalent.." / "where are scan arx, ask ai scan vax etc in
  // cubeai and other f[eatures]"] — HealthTabComp/RecordsTabComp still own
  // their OWN full add/scan flows too (their own "+" affordances keep
  // working exactly as before); this is a second, faster entry point right
  // in the section heading, using the SAME real modal components and save
  // logic HealthTab.tsx/RecordsTab.tsx call, not a re-implementation.
  //
  // The save functions below are the exact real insert logic ported
  // verbatim from HealthTab.tsx's own addMed/addVax/saveScannedMed/
  // saveScannedVax and RecordsTab.tsx's own addRecord (same tables, same
  // columns, same defaults) — this file has no shared meds/vax/records
  // store to call into (see the file header), so "reuse the real logic"
  // here means "insert the identical row," same as the sidebar's own
  // read-only fetch mirrors HealthTab.tsx's load(). After any save,
  // loadSidebar() re-runs so the sidebar panels reflect the new row
  // immediately rather than waiting for the next tab-change re-fetch.
  const [showAddMed, setShowAddMed] = useState(false);
  const [showAddVax, setShowAddVax] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [showScanSheet, setShowScanSheet] = useState(false);
  const [scanMode, setScanMode] = useState<'rx' | 'vaccine'>('rx');
  // Medication adherence-history side drawer — kiosk's own KioskFormDrawer
  // shell instead of HealthRecordsList's phone bottom Modal, same real
  // medicationAdherenceHistory() data [live-requested: "show that history
  // side bar"].
  const [historyMed, setHistoryMed] = useState<Medication | null>(null);

  // Every save function below is wrapped in try/catch so it can never
  // reject — AddMedModal/AddVaxModal/AddRecordModal/ScanReviewSheet all
  // `await onSave(...)` with no try/catch of their own before calling
  // their own setSaving(false)/onClose(), so an uncaught throw here would
  // leave THEIR modal stuck in its "saving" state forever [live-reported:
  // "i scanned the photo in the records and then app got frozen after
  // add" — traced to exactly this pattern in addRecord's file-upload
  // step; applied the same guard to the other four save functions since
  // they share the identical risk against their own modal's saving state].
  const addMed = useCallback(async (memberId: string, form: MedForm) => {
    try {
      const times = form.reminder_times.length ? form.reminder_times : ['08:00'];
      const { data, error } = await supabase.from('family_medications').insert({
        family_id: familyId,
        member_id: memberId,
        assigned_by: activeMember?.id ?? null,
        name: form.name.trim(),
        dosage: form.dosage.trim(),
        dosage_unit: form.dosage_unit,
        frequency: form.frequency,
        frequency_times: times,
        category: form.category,
        prescribing_doctor: form.prescribing_doctor || null,
        pharmacy: form.pharmacy || null,
        refill_date: form.refill_date || null,
        pills_remaining: form.pills_remaining ? parseInt(form.pills_remaining) : null,
        instructions: form.instructions || null,
        is_ongoing: !form.end_date,
        is_active: true,
        start_date: form.start_date || todayStr(),
        end_date: form.end_date || null,
        escalation_enabled: form.escalation_enabled,
        escalation_after_min: parseInt(form.escalation_after_min) || 60,
      }).select().single();
      if (error) { console.warn('[KioskHealthTab] addMed failed:', error); showToast('Could not save the medication'); return; }
      if (data) {
        // Real side effects HealthTab.tsx's own addMed performs, ported
        // verbatim — a first pass here only did the insert and silently
        // dropped these three, a real logic gap traced while wiring the
        // kiosk-native form rebuild [live-reported: "add model or edit
        // models like a add groceries model type.."].
        if (memberId !== activeMember?.id) {
          supabase.functions.invoke('family-notifier', {
            body: {
              type: 'medication_added', familyId, memberIds: [memberId], persist: true,
              excludeMemberId: activeMember?.id,
              payload: { memberId, medName: form.name.trim(), dosage: form.dosage.trim() ? `${form.dosage} ${form.dosage_unit}` : undefined, byName: activeMember?.name },
            },
          }).catch(e => console.warn('[KioskHealthTab] addMed notify failed:', e?.message));
        }
        supabase.rpc('upsert_med_suggestion', {
          p_name: form.name.trim(),
          p_category: form.category,
          p_hint: form.category,
        }).then(() => {});
        // One independent recurring calendar series PER dose time, same
        // as HealthTab.tsx's own addMed — a med now actually shows up on
        // the member's Schedule instead of being a silent DB flag.
        times.forEach(time => {
          useEventStore.getState().addRecurringEvent(
            {
              title: `Take ${form.name.trim()}`,
              date: form.start_date || todayStr(),
              time,
              memberId,
              type: 'reminder',
              category: 'Medication',
              notes: form.instructions || undefined,
              alertCall: form.alert_call,
              alertCallLeadMinutes: 0,
            },
            {
              frequency: 'daily',
              ...(form.end_date ? { endDate: form.end_date } : {}),
            }
          );
        });
        showToast('Medication added'); loadSidebar();
      }
    } catch (e) {
      console.warn('[KioskHealthTab] addMed threw:', e);
      showToast('Could not save the medication');
    }
  }, [familyId, activeMember?.id, loadSidebar]);

  const addVax = useCallback(async (memberId: string, form: VaxForm) => {
    try {
      const { data, error } = await supabase.from('family_vaccines').insert({
        family_id: familyId,
        member_id: memberId,
        title: form.title.trim(),
        vaccine_type: form.vaccine_type || null,
        date: form.date,
        next_due_date: form.next_due_date || null,
        series_current: parseInt(form.series_current) || 1,
        series_total: parseInt(form.series_total) || 1,
        administered_by: form.administered_by || null,
        location: form.location || null,
        notes: form.notes || null,
        done: false,
      }).select().single();
      if (error) { console.warn('[KioskHealthTab] addVax failed:', error); showToast('Could not save the vaccine'); return; }
      if (data) { showToast('Vaccine added'); loadSidebar(); }
    } catch (e) {
      console.warn('[KioskHealthTab] addVax threw:', e);
      showToast('Could not save the vaccine');
    }
  }, [familyId, loadSidebar]);

  const addRecord = useCallback(async (
    memberId: string,
    form: RecordForm,
    file: DocumentPicker.DocumentPickerAsset | null,
  ) => {
    // [live-reported: "i scanned the photo in the records and then app
    // got frozen after add"] — the file-upload step below had NO error
    // handling: a thrown exception (a bad file:// URI, a storage-upload
    // failure) propagated straight up through AddRecordModal's own
    // handleSave, which awaits onSave with no try/catch of its own —
    // meaning setSaving(false)/onClose() never ran and the modal stayed
    // stuck in its "saving, disabled" state forever, reading as a freeze.
    // Wrapping this whole function in try/catch guarantees onSave always
    // resolves (never rejects) so the modal can always close, and any
    // real failure is at least visible in the console + a toast instead
    // of silently hanging.
    try {
      let file_path: string | null = null;
      let file_name: string | null = null;
      let file_size: number | null = null;
      if (file) {
        try {
          const ext = file.name.split('.').pop() ?? 'bin';
          const path = `${familyId}/${memberId}/${Date.now()}.${ext}`;
          const blob = await fetch(file.uri).then(r => r.blob());
          const { data: up, error: upErr } = await supabase.storage
            .from('medical-records')
            .upload(path, blob, { contentType: file.mimeType ?? 'application/octet-stream', upsert: false });
          if (upErr) console.warn('[KioskHealthTab] addRecord upload failed:', upErr);
          else if (up) { file_path = up.path; file_name = file.name; file_size = file.size ?? null; }
        } catch (uploadErr) {
          // Photo upload failed (bad URI, network) — still save the
          // record itself without the attachment rather than losing the
          // whole entry the way an uncaught throw here would have.
          console.warn('[KioskHealthTab] addRecord photo upload threw:', uploadErr);
          showToast('Could not attach the photo — record saved without it');
        }
      }
      const { data, error } = await supabase.from('medical_records').insert({
        family_id: familyId, member_id: memberId,
        uploaded_by: activeMember?.id ?? null,
        title: form.title.trim(), tag: form.tag,
        record_date: form.record_date, notes: form.notes.trim() || null,
        file_path, file_name, file_size,
        ai_analyzed: false, ai_tags: [],
      }).select().single();
      if (error) { console.warn('[KioskHealthTab] addRecord failed:', error); showToast('Could not save the record'); return; }
      if (data) { showToast('Record added'); loadSidebar(); }
    } catch (e) {
      console.warn('[KioskHealthTab] addRecord threw:', e);
      showToast('Could not save the record');
    }
  }, [familyId, activeMember?.id, loadSidebar]);

  const saveScannedMed = useCallback(async (reviewMed: ParsedMedication, reviewMemberId: string) => {
    try {
      const { data, error } = await supabase.from('family_medications').insert({
        family_id: familyId,
        member_id: reviewMemberId,
        assigned_by: activeMember?.id ?? null,
        name: reviewMed.name.trim() || 'Unknown medication',
        dosage: reviewMed.dosage.trim(),
        dosage_unit: 'mg',
        frequency: reviewMed.frequency || 'As directed',
        frequency_times: ['08:00'],
        category: 'other',
        prescribing_doctor: reviewMed.prescriber || null,
        pharmacy: reviewMed.pharmacy || null,
        instructions: reviewMed.instructions || null,
        is_ongoing: !reviewMed.duration || reviewMed.duration.toLowerCase().includes('ongoing'),
        is_active: true,
        escalation_enabled: false,
        escalation_after_min: 60,
      }).select().single();
      if (error) { console.warn('[KioskHealthTab] saveScannedMed failed:', error); showToast('Could not save the scanned medication'); return; }
      if (data) { showToast('Medication added'); loadSidebar(); }
    } catch (e) {
      console.warn('[KioskHealthTab] saveScannedMed threw:', e);
      showToast('Could not save the scanned medication');
    }
  }, [familyId, activeMember?.id, loadSidebar]);

  const saveScannedVax = useCallback(async (reviewVax: ParsedVaccine, reviewMemberId: string) => {
    try {
      const { data, error } = await supabase.from('family_vaccines').insert({
        family_id: familyId,
        member_id: reviewMemberId,
        title: reviewVax.vaccine_name.trim() || 'Unknown vaccine',
        vaccine_type: reviewVax.manufacturer || null,
        date: reviewVax.administered_date ?? todayStr(),
        next_due_date: reviewVax.next_due_date ?? null,
        series_current: reviewVax.dose_number ?? 1,
        series_total: reviewVax.total_doses ?? 1,
        administered_by: reviewVax.administered_by || null,
        location: reviewVax.site || null,
        notes: reviewVax.lot_number ? `Lot: ${reviewVax.lot_number}` : null,
        done: true,
      }).select().single();
      if (error) { console.warn('[KioskHealthTab] saveScannedVax failed:', error); showToast('Could not save the scanned vaccine'); return; }
      if (data) { showToast('Vaccine added'); loadSidebar(); }
    } catch (e) {
      console.warn('[KioskHealthTab] saveScannedVax threw:', e);
      showToast('Could not save the scanned vaccine');
    }
  }, [familyId, loadSidebar]);

  // "Who takes what" — one row per member with at least one active
  // medication, same jar-row pattern Chores' own "Who has what" uses.
  const medsByMember = useMemo(() => {
    const activeMeds = sideMeds.filter(m => m.is_active);
    const byId = new Map<string, Medication[]>();
    for (const med of activeMeds) {
      const list = byId.get(med.member_id) ?? [];
      list.push(med);
      byId.set(med.member_id, list);
    }
    return members
      .filter(m => byId.has(m.id))
      .map(member => {
        const meds = byId.get(member.id)!;
        const takenToday = meds.filter(m => m.taken_date === todayStr()).length;
        const overdueMeds = meds.filter(isMedOverdue);
        return { member, meds, takenToday, overdue: overdueMeds.length, overdueMeds };
      });
  }, [sideMeds, members]);

  // "Refills due soon" — same 7-day window HealthTab.tsx's own
  // medRefillSoon filter uses, ported verbatim.
  const refillsSoon = useMemo(() => {
    const now = Date.now();
    return sideMeds
      .filter(m => m.is_active && m.refill_date)
      .map(m => ({ med: m, daysLeft: Math.ceil((new Date(m.refill_date!).getTime() - now) / (24 * 3600_000)) }))
      .filter(x => x.daysLeft >= 0 && x.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [sideMeds]);

  // "Immunizations due" — same 30-day window HealthTab.tsx's own
  // vaxStatusFilter==='due_soon' branch uses, ported verbatim. Parent-only
  // (kids never reach the vax segment at all, per the same role gate
  // above), shown regardless of which segment is currently selected since
  // it summarizes the whole Health area, same as Chores' sidebar staying
  // visible across every kidFilter/tabStatus).
  const vaxDueSoon = useMemo(() => {
    if (isKid) return [];
    const now = Date.now();
    return sideVaxes
      .filter(v => !v.done && v.next_due_date)
      .map(v => ({ vax: v, daysLeft: Math.ceil((new Date(v.next_due_date!).getTime() - now) / (24 * 3600_000)) }))
      .filter(x => x.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [sideVaxes, isKid]);

  // "Records needing attention" — real AI-derived signal
  // (ai_analysis_json.urgency), not an invented heuristic. A record only
  // gets flagged here when the SAME analysis pipeline RecordsTab.tsx's own
  // AiReviewSheet already ran on it marked it 'urgent' or 'attention', or
  // left an unresolved follow-up item/next step. Parent-only, same as
  // every other sidebar panel.
  const recordsNeedingAttention = useMemo(() => {
    if (isKid) return [] as { rec: MedRecord; urgency: string; followUps: number }[];
    const flagged: { rec: MedRecord; urgency: string; followUps: number }[] = [];
    for (const rec of sideRecords) {
      const a = rec.ai_analysis_json;
      if (!a) continue;
      const urgency: string = a.urgency;
      const followUps = 'follow_up_items' in a ? a.follow_up_items?.length ?? 0
        : 'next_steps' in a ? a.next_steps?.length ?? 0 : 0;
      if (urgency !== 'urgent' && urgency !== 'attention' && followUps === 0) continue;
      flagged.push({ rec, urgency, followUps });
    }
    // Urgent first, then attention, then plain follow-ups; most recent
    // within each tier.
    const rank = (u: string) => u === 'urgent' ? 0 : u === 'attention' ? 1 : 2;
    flagged.sort((a, b) => {
      const r = rank(a.urgency) - rank(b.urgency);
      return r !== 0 ? r : new Date(b.rec.record_date).getTime() - new Date(a.rec.record_date).getTime();
    });
    return flagged;
  }, [sideRecords, isKid]);
  /* ───────── area-menu layout (Health & Records) ───────── */
  const pastels = kioskPastels(k);
  type HArea = 'today' | 'meds' | 'refills' | 'vax' | 'records' | 'visit' | 'bring' | 'scanrx' | 'ai' | 'export';
  const [area, setArea] = useState<HArea>('today');
  const [who, setWho] = useState<string>('all');
  const [medStatus, setMedStatus] = useState<'active' | 'taken' | 'pending' | 'overdue' | 'all'>('active');
  const [vaxStatus, setVaxStatus] = useState<'all' | 'pending' | 'done' | 'due'>('all');
  const [medQuery, setMedQuery] = useState('');
  const [recQuery, setRecQuery] = useState('');
  const [recTag, setRecTag] = useState('all');
  const [openRec, setOpenRec] = useState<MedRecord | null>(null);
  const [openVax, setOpenVax] = useState<Vaccine | null>(null);
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const ai = useHealthAi({ members, activeMemberId: activeMemberId ?? undefined });
  const [exportIds, setExportIds] = useState<string[]>([]);
  const today = todayStr();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const t12 = (t: string) => formatDoseTime(t);
  const people = own ? members.filter(m => m.id === activeMemberId) : members;
  const inScope = <T extends { member_id: string }>(l: T[]) => l.filter(x => (!own || x.member_id === activeMemberId) && (who === 'all' || x.member_id === who));
  const nameOf = (id: string) => members.find(m => m.id === id)?.name?.split(' ')[0] ?? 'Member';
  const toneOf = (id: string) => pastels[Math.max(0, members.findIndex(m => m.id === id)) % 4];

  const doseTaken = (m: Medication, t: string) => {
    const multi = (m.frequency_times?.length ?? 1) > 1;
    const set = new Set(m.taken_dates ?? []);
    return set.has(encodeTakenEntry(today, multi ? t : null)) || (!multi && (m.taken_date === today || set.has(today)));
  };
  const dosesOf = (m: Medication) => (m.frequency_times?.length ? m.frequency_times : ['08:00']).map(t => {
    const taken = doseTaken(m, t);
    return { med: m, time: t, taken, od: !taken && mins(t) + (m.escalation_enabled ? m.escalation_after_min : 60) < nowMins && m.frequency !== 'as_needed' };
  });
  const activeMeds = inScope(sideMeds.filter(m => m.is_active));
  const allDoses = activeMeds.flatMap(dosesOf);
  const overdueCount = allDoses.filter(d => d.od).length;

  const markTaken = async (med: Medication, time: string | null) => {
    const entry = encodeTakenEntry(today, time);
    const was = (med.taken_dates ?? []).includes(entry);
    const { error } = await supabase.rpc('toggle_medication_dose', { p_med_id: med.id, p_entry: entry, p_mark_taken: !was, p_today: today, p_modified_by: activeMemberId ?? null });
    if (error) { showToast('Could not update the dose'); return; }
    showToast(was ? 'Marked as not taken' : `${med.name} marked taken`); loadSidebar();
  };
  const confirmDelete = (title: string, run: () => PromiseLike<unknown>) => Alert.alert(title, 'This removes it for everyone in the family. It cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await run(); loadSidebar(); setOpenRec(null); setOpenVax(null); } },
  ]);
  const deleteMed = (m: Medication) => confirmDelete(`Delete ${m.name}?`, () => supabase.from('family_medications').delete().eq('id', m.id));
  const deleteVax = (v: Vaccine) => confirmDelete(`Delete ${v.title}?`, () => supabase.from('family_vaccines').delete().eq('id', v.id));
  const deleteRec = (r: MedRecord) => confirmDelete(`Delete ${r.title}?`, () => supabase.from('medical_records').delete().eq('id', r.id));
  const markRefilled = async (m: Medication) => {
    const next = new Date(); next.setDate(next.getDate() + 30);
    await supabase.from('family_medications').update({ pills_remaining: 60, refill_date: next.toISOString().slice(0, 10) }).eq('id', m.id);
    showToast(`${m.name} refilled`); loadSidebar();
  };
  const markVaxDone = async (v: Vaccine) => { await supabase.from('family_vaccines').update({ done: !v.done }).eq('id', v.id); loadSidebar(); setOpenVax(null); };
  const exportPdf = async () => {
    const ms = people.filter(m => exportIds.includes(m.id)).map(m => ({ memberId: m.id, memberName: m.name, vaccines: sideVaxes.filter(v => v.member_id === m.id) }));
    if (!ms.length) { showToast('Pick at least one person'); return; }
    try { await shareVaccineRecordsPdf({ familyName: 'Family', members: ms }); } catch { showToast('Could not export the PDF'); }
  };

  const lowRx = activeMeds.filter(m => (m.pills_remaining != null && m.pills_remaining <= 10) || refillsSoon.some(r => r.med.id === m.id));
  const attn = inScope(sideRecords).filter(r => r.ai_analysis_json && (r.ai_analysis_json.urgency === 'urgent' || r.ai_analysis_json.urgency === 'attention'));
  const pendingVax = inScope(sideVaxes).filter(v => !v.done).length;

  const items: AreaItem<HArea>[] = isKid
    ? [{ id: 'today', label: 'Today’s doses', Icon: AlarmClock, badge: overdueCount || undefined }, { id: 'meds', label: 'My medications', Icon: Pill }]
    : [
      { id: 'today', label: 'Today’s doses', Icon: AlarmClock, badge: overdueCount || undefined },
      { id: 'meds', label: 'All medications', Icon: Pill },
      { id: 'refills', label: 'Refills', Icon: Repeat, badge: lowRx.length || undefined },
      { id: 'vax', label: 'Vaccines', Icon: Syringe, badge: pendingVax || undefined },
      { id: 'records', label: 'All records', Icon: FolderOpen, badge: attn.length || undefined },
      { id: 'visit', label: 'Record a visit', Icon: Mic },
      { id: 'bring', label: 'Bring in a document', Icon: FileText },
      { id: 'scanrx', label: 'Scan a prescription', Icon: ScanLine },
      { id: 'ai', label: 'Ask health AI', Icon: Sparkles },
      ...(own ? [] : [{ id: 'export' as HArea, label: 'Export PDF', Icon: FileDown }]),
    ];

  const Pill2 = ({ t, tone }: { t: string; tone?: 'g' | 'a' | 'r' | 'l' }) => (
    <View style={[s.pill, { backgroundColor: tone === 'r' ? k.danger : tone === 'g' ? k.pastelSageCard : tone === 'a' ? k.pastelAmberCard : tone === 'l' ? k.pastelLavCard : k.card }]}>
      <Text style={[s.pillT, { color: tone === 'r' ? k.onAccent : tone === 'g' ? k.sage : tone === 'a' ? k.gold : tone === 'l' ? k.purple : k.textMuted }]}>{t}</Text>
    </View>
  );
  const Btn = ({ label, onPress, kind = 'pri', Icon }: { label: string; onPress: () => void; kind?: 'pri' | 'sec' | 'ok' | 'dg'; Icon?: any }) => (
    <Pressable onPress={() => { registerActivity(); onPress(); }} accessibilityRole="button" accessibilityLabel={label}
      style={[s.btn, { backgroundColor: kind === 'pri' ? k.primary : kind === 'ok' ? k.sage : 'transparent', borderWidth: kind === 'dg' ? 1.5 : 0, borderColor: k.danger }, kind === 'sec' && { backgroundColor: k.well }]}>
      {Icon && <Icon size={16} color={kind === 'pri' || kind === 'ok' ? k.onPrimary : kind === 'dg' ? k.danger : k.text} />}
      <Text style={[s.btnT, { color: kind === 'pri' || kind === 'ok' ? k.onPrimary : kind === 'dg' ? k.danger : k.text }]}>{label}</Text>
    </Pressable>
  );
  const Chip2 = ({ label, on, onPress, i }: { label: string; on: boolean; onPress: () => void; i: number }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip2, { backgroundColor: on ? k.primary : pastels[i % 4].card }]}>
      <Text style={[s.chipT2, { color: on ? k.onPrimary : pastels[i % 4].fg }]}>{label}</Text>
    </Pressable>
  );
  const whoRow = own || people.length < 2 ? null : (
    <View style={s.wrapRow}>
      <Chip2 label="Everyone" on={who === 'all'} onPress={() => setWho('all')} i={1} />
      {people.map((m, i) => <Chip2 key={m.id} label={m.name.split(' ')[0]} on={who === m.id} onPress={() => setWho(m.id)} i={i + 2} />)}
    </View>
  );
  const Head = ({ title, right }: { title: string; right?: React.ReactNode }) => (
    <View style={s.head}><Text style={[s.h1, { color: k.text }]}>{title}</Text><View style={{ flex: 1 }} />{right}</View>
  );

  const content = () => {
    if (area === 'today') {
      const ids = (own ? [activeMemberId ?? ''] : people.map(m => m.id)).filter(id => who === 'all' || id === who);
      return (
        <>
          <Head title="Today’s doses" right={!isKid ? <Btn label="Add medication" Icon={Plus} onPress={() => setShowAddMed(true)} /> : undefined} />
          {whoRow}
          <View style={s.grid}>
            {ids.map(id => {
              const ds = activeMeds.filter(m => m.member_id === id).flatMap(dosesOf).sort((a, b) => mins(a.time) - mins(b.time));
              const tk = ds.filter(d => d.taken).length; const tone = toneOf(id);
              return (
                <View key={id} style={[s.mc, { backgroundColor: tone.col, borderColor: tone.card }]}>
                  <View style={s.mcTop}>
                    <KioskAvatar name={nameOf(id)} size={46} bgColor={tone.card} k={k} />
                    <View style={{ flex: 1 }}><Text style={[s.mcName, { color: k.text }]}>{nameOf(id)}</Text><Text style={[s.sm, { color: k.textMuted }]}>{tk} of {ds.length} doses taken today</Text></View>
                    {ds.some(d => d.od) ? <Pill2 t="Overdue" tone="r" /> : ds.length > 0 && tk === ds.length ? <Pill2 t="All done ✓" tone="g" /> : null}
                  </View>
                  <View style={[s.bar, { backgroundColor: k.card }]}><View style={{ width: `${ds.length ? (tk / ds.length) * 100 : 0}%`, height: '100%', backgroundColor: k.sage, borderRadius: 5 }} /></View>
                  {ds.length === 0 ? <Text style={[s.sm, { color: k.textMuted }]}>No medications scheduled.</Text> : ds.map((d, i) => (
                    <View key={i} style={[s.dose, { backgroundColor: k.card }, d.od && { borderWidth: 2.5, borderColor: k.danger }, d.taken && { opacity: 0.75 }]}>
                      <Text style={[s.tm, { color: k.textMuted }]}>{t12(d.time)}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.dName, { color: k.text }]} numberOfLines={1}>{d.med.name} {d.med.dosage} {d.med.dosage_unit}</Text>
                        {!!d.med.instructions && <Text style={[s.sm, { color: k.textMuted }]} numberOfLines={1}>{d.med.instructions}</Text>}
                      </View>
                      {d.taken ? <Pill2 t="✓ Taken" tone="g" /> : <Btn kind="ok" label="Mark taken" onPress={() => markTaken(d.med, (d.med.frequency_times?.length ?? 1) > 1 ? d.time : null)} />}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </>
      );
    }
    if (area === 'meds') {
      const l = inScope(sideMeds).filter(m => {
        const ds = dosesOf(m);
        const okS = medStatus === 'all' ? true : medStatus === 'active' ? m.is_active : medStatus === 'taken' ? ds.every(d => d.taken) : medStatus === 'pending' ? ds.some(d => !d.taken) : ds.some(d => d.od);
        return okS && (!medQuery || (m.name + (m.prescribing_doctor ?? '')).toLowerCase().includes(medQuery.toLowerCase()));
      });
      return (
        <>
          <Head title={isKid ? 'My medications' : 'All medications'} right={!isKid ? <Btn label="Add medication" Icon={Plus} onPress={() => setShowAddMed(true)} /> : undefined} />
          {whoRow}
          <View style={s.wrapRow}>
            <View style={[s.search, { backgroundColor: k.well }]}><Search size={16} color={k.textFaint} /><TextInput value={medQuery} onChangeText={setMedQuery} placeholder="Search medications" placeholderTextColor={k.textFaint} style={[s.searchIn, { color: k.text }]} accessibilityLabel="Search medications" /></View>
            {([['active', 'Active'], ['taken', 'Taken today'], ['pending', 'Pending'], ['overdue', 'Overdue'], ['all', 'All']] as const).map(([key, t], i) => <Chip2 key={key} label={t} on={medStatus === key} onPress={() => setMedStatus(key)} i={i} />)}
          </View>
          <View style={s.grid}>
            {l.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No medications match.</Text> : l.map(m => {
              const tone = toneOf(m.member_id);
              return (
                <View key={m.id} style={[s.mc, { backgroundColor: tone.col, borderColor: tone.card }]}>
                  <View style={s.mcTop}>
                    <KioskAvatar name={nameOf(m.member_id)} size={44} bgColor={tone.card} k={k} />
                    <View style={{ flex: 1, minWidth: 0 }}><Text style={[s.mcName, { color: k.text }]} numberOfLines={1}>{m.name} {m.dosage} {m.dosage_unit}</Text>
                      <Text style={[s.sm, { color: k.textMuted }]} numberOfLines={1}>{nameOf(m.member_id)} · {FREQ_LABELS[m.frequency] ?? m.frequency} · {(m.frequency_times ?? []).map(t12).join(', ')}</Text></View>
                    <Pill2 t={m.category === 'prescription' ? 'Rx' : m.category} tone="l" />
                  </View>
                  {!!m.instructions && <Text style={[s.sm, { color: k.textMuted }]}>{m.instructions}</Text>}
                  <View style={s.wrapRow}>
                    {!!m.prescribing_doctor && <Pill2 t={`🩺 ${m.prescribing_doctor}`} />}{!!m.pharmacy && <Pill2 t={`🏪 ${m.pharmacy}`} />}
                    {m.escalation_enabled && <Pill2 t={`🔔 Alert after ${m.escalation_after_min} min`} tone="a" />}{!!m.end_date && <Pill2 t={`Ends ${fmtDateDisplay(new Date(m.end_date + 'T00:00:00'))}`} />}
                  </View>
                  {m.pills_remaining != null && (
                    <View><Text style={[s.sm, { color: k.textMuted }]}>{m.pills_remaining} pills left{m.refill_date ? ` · refill ${fmtDateDisplay(new Date(m.refill_date + 'T00:00:00'))}` : ''}</Text>
                      <View style={[s.bar, { backgroundColor: k.card }]}><View style={{ width: `${Math.min(100, m.pills_remaining * 3.3)}%`, height: '100%', borderRadius: 5, backgroundColor: m.pills_remaining <= 10 ? k.danger : k.sage }} /></View></View>
                  )}
                  <View style={s.wrapRow}>
                    <Btn kind="ok" label="Taken" onPress={() => { const next = dosesOf(m).find(d => !d.taken) ?? dosesOf(m)[0]; markTaken(m, (m.frequency_times?.length ?? 1) > 1 ? next.time : null); }} />
                    <Btn kind="sec" label="History" onPress={() => setHistoryMed(m)} />
                    {!isKid && <Btn kind="sec" label="Edit" onPress={() => setEditMed(m)} />}
                    {!isKid && <Btn kind="dg" label="Delete" onPress={() => deleteMed(m)} />}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      );
    }
    if (area === 'refills') {
      return (
        <>
          <Head title="Refills" />{whoRow}
          {lowRx.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>Nothing is running low. 🎉</Text> : lowRx.map(m => {
            const tone = toneOf(m.member_id);
            return (
              <View key={m.id} style={[s.row, { backgroundColor: tone.col, borderColor: tone.card }]}>
                <KioskAvatar name={nameOf(m.member_id)} size={44} bgColor={tone.card} k={k} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.dName, { color: k.text }]}>{m.name} {m.dosage} {m.dosage_unit}</Text>
                  <Text style={[s.sm, { color: k.textMuted }]}>{nameOf(m.member_id)} · {m.pills_remaining ?? '?'} pills left · refill {m.refill_date ? fmtDateDisplay(new Date(m.refill_date + 'T00:00:00')) : 'not set'}{m.pharmacy ? ` · ${m.pharmacy}` : ''}</Text>
                </View>
                <Btn kind="ok" label="Mark refilled" onPress={() => markRefilled(m)} />
              </View>
            );
          })}
        </>
      );
    }
    if (area === 'vax') {
      const l = inScope(sideVaxes).filter(v => vaxStatus === 'all' || (vaxStatus === 'done' && v.done) || (vaxStatus === 'pending' && !v.done) || (vaxStatus === 'due' && !v.done && v.next_due_date && (new Date(v.next_due_date).getTime() - Date.now()) / 86400000 <= 30));
      return (
        <>
          <Head title="Vaccines" right={<Btn label="Add vaccine" Icon={Plus} onPress={() => setShowAddVax(true)} />} />{whoRow}
          <View style={s.wrapRow}>{([['all', 'All'], ['pending', 'Pending'], ['done', 'Done'], ['due', 'Due soon']] as const).map(([key, t], i) => <Chip2 key={key} label={t} on={vaxStatus === key} onPress={() => setVaxStatus(key)} i={i} />)}</View>
          <View style={{ gap: 8 }}>
            {l.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No vaccines match.</Text> : (() => {
              // Grouped by month and year given (or due, when not given yet), newest first.
              const keyOf = (v: Vaccine) => (v.date || v.next_due_date || '').slice(0, 7);
              const groups = new Map<string, Vaccine[]>();
              [...l].sort((a, b) => (b.date || b.next_due_date || '').localeCompare(a.date || a.next_due_date || '')).forEach(v => { const g = keyOf(v); groups.set(g, [...(groups.get(g) ?? []), v]); });
              return [...groups.entries()].map(([g, list], gi) => (
                <View key={g || 'none'} style={{ gap: 8 }}>
                  <Text style={[s.eb, { color: k.textFaint, marginTop: gi ? 8 : 0 }]}>
                    {g ? new Date(g + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() : 'NO DATE'} · {list.length}
                  </Text>
                  {list.map((v, i) => {
                    const tone = pastels[i % 4];
                    return (
                      <Pressable key={v.id} onPress={() => setOpenVax(v)} accessibilityRole="button" accessibilityLabel={`${v.title}, ${nameOf(v.member_id)}`} style={[s.vrow, { backgroundColor: tone.col, borderColor: tone.card }]}>
                  <KioskAvatar name={nameOf(v.member_id)} size={32} bgColor={tone.card} k={k} />
                  <View style={{ flex: 1.4, minWidth: 0 }}><Text style={[s.dName, { color: k.text }]} numberOfLines={1}>{v.title}</Text><Text style={[s.sm, { color: k.textMuted }]} numberOfLines={1}>{nameOf(v.member_id)}</Text></View>
                  <Text style={[s.sm, { color: k.textMuted, flex: 1 }]} numberOfLines={1}>{v.date ? fmtDateDisplay(new Date(v.date + 'T00:00:00')) : 'Not given yet'}</Text>
                  <Text style={[s.sm, { color: k.textMuted, width: 90 }]}>Dose {v.series_current}/{v.series_total}</Text>
                  <Text style={[s.sm, { color: k.textMuted, flex: 1 }]} numberOfLines={1}>{v.next_due_date ? `Due ${fmtDateDisplay(new Date(v.next_due_date + 'T00:00:00'))}` : ''}</Text>
                  <Pill2 t={v.done ? 'Done' : 'Pending'} tone={v.done ? 'g' : 'a'} />
                </Pressable>
                    );
                  })}
                </View>
              ));
            })()}
          </View>
        </>
      );
    }
    if (area === 'records') {
      const TAGS: [string, string, string][] = [['lab', 'Lab', '🧪'], ['discharge', 'Discharge', '🏥'], ['prescription', 'Prescription', '💊'], ['imaging', 'Imaging', '🩻'], ['insurance', 'Insurance', '🛡️'], ['vaccination', 'Vaccination', '💉'], ['visit_recording', 'Visit Recording', '🎙️'], ['other', 'Other', '📄']];
      const l = inScope(sideRecords).filter(r => (recTag === 'all' || r.tag === recTag) && (!recQuery || r.title.toLowerCase().includes(recQuery.toLowerCase())));
      return (
        <>
          <Head title="All records" right={<Btn label="Bring in a document" Icon={Plus} onPress={() => setArea('bring')} />} />{whoRow}
          <View style={[s.search, { backgroundColor: k.well }]}><Search size={16} color={k.textFaint} /><TextInput value={recQuery} onChangeText={setRecQuery} placeholder="Search records" placeholderTextColor={k.textFaint} style={[s.searchIn, { color: k.text }]} accessibilityLabel="Search records" /></View>
          <View style={s.wrapRow}><Chip2 label="All" on={recTag === 'all'} onPress={() => setRecTag('all')} i={0} />{TAGS.map(([key, t, e], i) => <Chip2 key={key} label={`${e} ${t}`} on={recTag === key} onPress={() => setRecTag(key)} i={i + 1} />)}</View>
          <View style={s.grid}>
            {l.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No records match.</Text> : l.map((r, i) => {
              const tone = pastels[i % 4]; const tg = TAGS.find(x => x[0] === r.tag) ?? TAGS[7]; const urg = r.ai_analysis_json?.urgency;
              return (
                <Pressable key={r.id} onPress={() => setOpenRec(r)} accessibilityRole="button" accessibilityLabel={r.title} style={[s.rec, { backgroundColor: tone.col, borderColor: tone.card }]}>
                  <View style={[s.recIc, { backgroundColor: tone.card }]}><Text style={{ fontSize: 22 }}>{tg[2]}</Text></View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={[s.dName, { color: k.text }]} numberOfLines={1}>{r.title}</Text>
                    <View style={s.wrapRow}><Pill2 t={tg[1]} /><Pill2 t={nameOf(r.member_id)} /><Pill2 t={fmtDateDisplay(new Date(r.record_date + 'T00:00:00'))} /><Pill2 t="🔒 Encrypted" tone="g" />{urg && urg !== 'routine' && <Pill2 t={urg === 'urgent' ? 'Urgent' : 'Attention'} tone={urg === 'urgent' ? 'r' : 'a'} />}</View>
                    {!!r.ai_summary && <Text style={[s.sm, { color: k.textMuted }]} numberOfLines={3}>AI SUMMARY · {r.ai_summary}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      );
    }
    if (area === 'visit' || area === 'bring' || area === 'scanrx') {
      const cfg = {
        visit: { title: 'Record a visit', big: 'Capture the appointment', txt: 'Add the visit as a record with the doctor, date and notes. Recording audio for an AI summary is available from a phone.', btn: 'Add the visit record', Icon: Mic, run: () => setShowAddRecord(true) },
        bring: { title: 'Bring in a document', big: 'Choose how to bring it in', txt: 'Add a photo or PDF of a lab, discharge paper, imaging or insurance card. You check the details before it is saved.', btn: 'Bring in a document', Icon: FileText, run: () => setShowAddRecord(true) },
        scanrx: { title: 'Scan a prescription', big: 'Bring in a prescription', txt: 'Take a photo of the label. The medication, dose and doctor are filled in for you to confirm before anything is saved.', btn: 'Scan a prescription', Icon: ScanLine, run: () => { setScanMode('rx'); setShowScanSheet(true); } },
      }[area];
      return (
        <>
          <Head title={cfg.title} />{whoRow}
          <View style={[s.hero, { backgroundColor: k.pastelLav, borderColor: k.pastelLavCard }]}>
            <View style={[s.heroIc, { backgroundColor: k.pastelLavCard }]}><cfg.Icon size={30} color={k.purple} /></View>
            <View style={{ flex: 1 }}><Text style={[s.mcName, { color: k.text }]}>{cfg.big}</Text><Text style={[s.sm, { color: k.textMuted }]}>{cfg.txt}</Text></View>
          </View>
          <View style={s.wrapRow}><Btn label={cfg.btn} Icon={cfg.Icon} onPress={cfg.run} />{area === 'bring' && <Btn kind="sec" label="Scan a vaccine record" Icon={Syringe} onPress={() => { setScanMode('vaccine'); setShowScanSheet(true); }} />}</View>
        </>
      );
    }
    if (area === 'ai') {
      return (
        <>
          <Head title="Ask health AI" right={<Pill2 t={`About ${who === 'all' ? 'the family' : nameOf(who)}`} tone="l" />} />{whoRow}
          <KioskHealthAiWidget members={members} activeMemberId={activeMemberId ?? undefined} isDark={kioskDark} k={k} />
        </>
      );
    }
    // export
    return (
      <>
        <Head title="Export PDF" right={<Pill2 t="Step 1 · before export" />} />
        <Text style={[s.eb, { color: k.sage }]}>MEMBERS INCLUDED</Text>
        <View style={s.wrapRow}>{people.map((m, i) => <Chip2 key={m.id} label={m.name.split(' ')[0]} on={exportIds.includes(m.id)} onPress={() => setExportIds(p => (p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id]))} i={i + 1} />)}</View>
        <Text style={[s.sm, { color: k.textMuted }]}>Exports each person's immunization record as a printable PDF.</Text>
        <View style={s.wrapRow}><Btn label="Export PDF" Icon={Download} onPress={exportPdf} /></View>
      </>
    );
  };

  return (
    <View style={s.shell}>
      <KioskAreaMenu title="Health & Records" items={items} area={area} onPick={a => { registerActivity(); setArea(a); }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll2} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onScrollBeginDrag={registerActivity}>
        {content()}
      </ScrollView>

      {/* Medication history */}
      <KioskFormDrawer visible={!!historyMed} variant="drawer" title={historyMed ? `${historyMed.name} history` : 'History'} subtitle={historyMed ? nameOf(historyMed.member_id) : undefined}
        accent={k.danger} Icon={History} k={k} onClose={() => setHistoryMed(null)}>
        {(() => {
          const days = historyMed ? groupHistoryByDay(medicationAdherenceHistory(historyMed)) : [];
          if (days.length === 0) return <EmptyNote text="No history yet." k={k} />;
          return days.map(({ date, doses }) => (
            <View key={date} style={{ marginBottom: KIOSK_SPACE.md }}>
              <Text style={{ fontSize: KIOSK_TYPO.caption, fontWeight: '800', color: k.textFaint, marginBottom: 6 }}>{fmtDateDisplay(new Date(date + 'T00:00:00'))}</Text>
              {doses.map((dose: DoseAdherence, idx: number) => {
                const tint = dose.status === 'taken' ? k.sage : dose.status === 'missed' ? k.danger : k.textFaint;
                const Icon = dose.status === 'taken' ? Check : dose.status === 'missed' ? XCircle : Clock;
                return (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: idx > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: k.cardBorder }}>
                    <Icon size={14} color={tint} />
                    <Text style={{ flex: 1, fontSize: KIOSK_TYPO.body, color: k.textMuted }}>{dose.time ? formatDoseTime(dose.time) : 'Dose'}</Text>
                    <Text style={{ fontSize: KIOSK_TYPO.caption, fontWeight: '800', color: tint }}>{dose.status === 'taken' ? 'Taken' : dose.status === 'missed' ? 'Missed' : 'Upcoming'}</Text>
                  </View>
                );
              })}
            </View>
          ));
        })()}
      </KioskFormDrawer>

      {/* Record detail */}
      <KioskFormDrawer visible={!!openRec} variant="drawer" title={openRec?.title ?? ''} subtitle={openRec ? `${nameOf(openRec.member_id)} · ${fmtDateDisplay(new Date(openRec.record_date + 'T00:00:00'))}` : undefined}
        accent={k.purple} Icon={FileText} k={k} onClose={() => setOpenRec(null)}>
        {openRec && (() => {
          const a: any = openRec.ai_analysis_json;
          const find: string[] = a?.key_findings ?? a?.discussion_topics?.map((d: any) => d.title) ?? [];
          const fu: string[] = a?.follow_up_items ?? a?.next_steps?.map((n: any) => n.text) ?? [];
          return (
            <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
              <View style={s.wrapRow}><Pill2 t="🔒 Encrypted" tone="g" />{a?.urgency && <Pill2 t={a.urgency === 'urgent' ? 'Urgent' : a.urgency === 'attention' ? 'Attention' : 'Routine'} tone={a.urgency === 'urgent' ? 'r' : a.urgency === 'attention' ? 'a' : undefined} />}</View>
              {!!openRec.ai_summary && <><Text style={[s.eb, { color: k.purple }]}>AI SUMMARY</Text><View style={[s.tg, { backgroundColor: k.pastelLav }]}><Text style={[s.dName, { color: k.text }]}>{openRec.ai_summary}</Text></View></>}
              {find.length > 0 && <><Text style={[s.eb, { color: k.gold }]}>KEY FINDINGS</Text>{find.map((f, i) => <View key={i} style={[s.tg, { backgroundColor: k.pastelAmber }]}><Text style={[s.dName, { color: k.text }]}>{f}</Text></View>)}</>}
              {fu.length > 0 && <><Text style={[s.eb, { color: k.sage }]}>FOLLOW-UP ACTIONS</Text>{fu.map((f, i) => <View key={i} style={[s.tg, { backgroundColor: k.pastelSage }]}><Text style={[s.dName, { color: k.text }]}>{f}</Text></View>)}</>}
              {!!openRec.notes && <><Text style={[s.eb, { color: k.textFaint }]}>NOTES</Text><Text style={[s.sm, { color: k.textMuted }]}>{openRec.notes}</Text></>}
              {!own && <Btn kind="dg" label="Delete record" Icon={Trash2} onPress={() => deleteRec(openRec)} />}
            </View>
          );
        })()}
      </KioskFormDrawer>

      {/* Vaccine detail */}
      <KioskFormDrawer visible={!!openVax} variant="drawer" title={openVax?.title ?? ''} subtitle={openVax ? nameOf(openVax.member_id) : undefined} accent={k.sage} Icon={Syringe} k={k} onClose={() => setOpenVax(null)}>
        {openVax && (
          <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
            <View style={s.wrapRow}><Pill2 t={`Dose ${openVax.series_current} of ${openVax.series_total}`} tone="g" /><Pill2 t={openVax.done ? 'Done' : 'Pending'} tone={openVax.done ? 'g' : 'a'} />{!!openVax.next_due_date && <Pill2 t={`Next due ${fmtDateDisplay(new Date(openVax.next_due_date + 'T00:00:00'))}`} />}</View>
            {!!openVax.administered_by && <View style={[s.tg, { backgroundColor: k.well }]}><Text style={[s.sm, { color: k.textMuted }]}>Administered by</Text><Text style={[s.dName, { color: k.text }]}>{openVax.administered_by}</Text></View>}
            {!!openVax.location && <View style={[s.tg, { backgroundColor: k.well }]}><Text style={[s.sm, { color: k.textMuted }]}>Location</Text><Text style={[s.dName, { color: k.text }]}>{openVax.location}</Text></View>}
            {!!openVax.notes && <View style={[s.tg, { backgroundColor: k.pastelAmber }]}><Text style={[s.sm, { color: k.textMuted }]}>Notes</Text><Text style={[s.dName, { color: k.text }]}>{openVax.notes}</Text></View>}
            {!own && <Btn kind="sec" label={openVax.done ? 'Mark as pending' : 'Mark dose given'} onPress={() => markVaxDone(openVax)} />}
          </View>
        )}
      </KioskFormDrawer>

      <KioskAddMedForm visible={showAddMed || !!editMed} onClose={() => { setShowAddMed(false); setEditMed(null); }}
        onSave={editMed ? (async (mid, form) => {
          await supabase.from('family_medications').update({
            member_id: mid, name: form.name.trim(), dosage: form.dosage.trim(), dosage_unit: form.dosage_unit, frequency: form.frequency,
            frequency_times: form.reminder_times.length ? form.reminder_times : ['08:00'], category: form.category, prescribing_doctor: form.prescribing_doctor || null,
            pharmacy: form.pharmacy || null, refill_date: form.refill_date || null, pills_remaining: form.pills_remaining ? parseInt(form.pills_remaining) : null,
            instructions: form.instructions || null, end_date: form.end_date || null, escalation_enabled: form.escalation_enabled, escalation_after_min: parseInt(form.escalation_after_min) || 60,
          }).eq('id', editMed.id);
          showToast('Medication saved'); loadSidebar();
        }) : addMed}
        members={members} colors={colors} isDark={isDark} />
      <KioskAddVaxForm visible={showAddVax} onClose={() => setShowAddVax(false)} onSave={addVax} members={members} colors={colors} isDark={isDark} />
      <KioskAddRecordForm visible={showAddRecord} onClose={() => setShowAddRecord(false)} onSave={addRecord} colors={colors} isDark={isDark} members={members} activeMemberId={activeMemberId ?? null} />
      <KioskScanReviewForm visible={showScanSheet} scanMode={scanMode} activeMemberId={activeMember?.id ?? ''} members={members} colors={colors} isDark={isDark}
        onClose={() => setShowScanSheet(false)} onSaveMed={saveScannedMed} onSaveVax={saveScannedVax} />
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', minHeight: 0 },
  scroll2: { padding: KIOSK_SPACE.xl, paddingBottom: 120, gap: KIOSK_SPACE.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md, alignItems: 'flex-start' },
  mc: { flexGrow: 1, flexBasis: 380, borderRadius: 24, borderWidth: 1.5, padding: 14, gap: 9 },
  mcTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mcName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sm: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  pill: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  pillT: { fontSize: 11.5, fontWeight: '800' },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  dose: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 8 },
  tm: { fontSize: 13, fontWeight: '800', minWidth: 76 },
  dName: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 15 },
  btnT: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  chip2: { minHeight: 42, borderRadius: 100, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  chipT2: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, paddingHorizontal: 16, minHeight: 46, minWidth: 220 },
  searchIn: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '600', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, padding: 12 },
  rec: { flexGrow: 1, flexBasis: 380, flexDirection: 'row', gap: 12, borderRadius: 22, borderWidth: 1.5, padding: 14 },
  recIc: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, borderRadius: 26, borderWidth: 1.5, padding: 16 },
  heroIc: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  vrow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, minHeight: 56 },
  vc: { flexGrow: 1, flexBasis: 230, maxWidth: '33%', borderRadius: 18, borderWidth: 1.5, padding: 10, gap: 6 },
  tg: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  eb: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1 },
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.xl, width: '100%' },
});
