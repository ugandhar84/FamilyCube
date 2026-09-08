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
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Heart, Pill, Syringe, FolderOpen, Plus, ScanLine } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, PanelHead, TabTitle, Chip, EmptyNote, ActionButton } from '../components/KioskOS';
import { useKioskActivity } from '../KioskActivityContext';
import { useUIStore } from '@/store/uiStore';
import { useFamilyStore } from '@/store/familyStore';
import { assigneeStyle } from '@/features/calendar/components/EventCard';
import { supabase } from '@/lib/supabase';
import { today as todayStr } from '@/features/vault/tabs/health/types';
import type { Medication, Vaccine, MedForm, VaxForm } from '@/features/vault/tabs/health/types';
import type { MedRecord } from '@/features/vault/records/types';
import type { ParsedMedication, ParsedVaccine } from '@/features/vault/usePrescriptionScanner';
import type { RecordForm } from '@/features/vault/records/types';
import type * as DocumentPicker from 'expo-document-picker';
import HealthTabComp from '@/features/vault/tabs/HealthTab';
import RecordsTabComp from '@/features/vault/tabs/RecordsTab';
import AddMedModal from '@/features/vault/tabs/health/AddMedModal';
import AddVaxModal from '@/features/vault/tabs/health/AddVaxModal';
import AddRecordModal from '@/features/vault/records/AddRecordModal';
import ScanReviewSheet from '@/features/vault/tabs/health/ScanReviewSheet';
import { showToast } from '@/components/AppToast';
import { KioskHealthAiWidget } from '../components/KioskHealthAiWidget';

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
    const medsQ = isKid && activeMember?.id
      ? supabase.from('family_medications').select('*').eq('family_id', familyId).eq('member_id', activeMember.id)
      : supabase.from('family_medications').select('*').eq('family_id', familyId);
    const vaxQ = isKid && activeMember?.id
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
  const [scanning, setScanning] = useState(false);

  const addMed = useCallback(async (memberId: string, form: MedForm) => {
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
    if (error) { console.warn('[KioskHealthTab] addMed failed:', error); return; }
    if (data) { showToast('Medication added'); loadSidebar(); }
  }, [familyId, activeMember?.id, loadSidebar]);

  const addVax = useCallback(async (memberId: string, form: VaxForm) => {
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
    if (error) { console.warn('[KioskHealthTab] addVax failed:', error); return; }
    if (data) { showToast('Vaccine added'); loadSidebar(); }
  }, [familyId, loadSidebar]);

  const addRecord = useCallback(async (
    memberId: string,
    form: RecordForm,
    file: DocumentPicker.DocumentPickerAsset | null,
  ) => {
    let file_path: string | null = null;
    let file_name: string | null = null;
    let file_size: number | null = null;
    if (file) {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${familyId}/${memberId}/${Date.now()}.${ext}`;
      const blob = await fetch(file.uri).then(r => r.blob());
      const { data: up, error: upErr } = await supabase.storage
        .from('medical-records')
        .upload(path, blob, { contentType: file.mimeType ?? 'application/octet-stream', upsert: false });
      if (!upErr && up) { file_path = up.path; file_name = file.name; file_size = file.size ?? null; }
    }
    const { data, error } = await supabase.from('medical_records').insert({
      family_id: familyId, member_id: memberId,
      uploaded_by: activeMember?.id ?? null,
      title: form.title.trim(), tag: form.tag,
      record_date: form.record_date, notes: form.notes.trim() || null,
      file_path, file_name, file_size,
      ai_analyzed: false, ai_tags: [],
    }).select().single();
    if (error) { console.warn('[KioskHealthTab] addRecord failed:', error); return; }
    if (data) { showToast('Record added'); loadSidebar(); }
  }, [familyId, activeMember?.id, loadSidebar]);

  const saveScannedMed = useCallback(async (reviewMed: ParsedMedication, reviewMemberId: string) => {
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
    if (error) { console.warn('[KioskHealthTab] saveScannedMed failed:', error); return; }
    if (data) { showToast('Medication added'); loadSidebar(); }
  }, [familyId, activeMember?.id, loadSidebar]);

  const saveScannedVax = useCallback(async (reviewVax: ParsedVaccine, reviewMemberId: string) => {
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
    if (error) { console.warn('[KioskHealthTab] saveScannedVax failed:', error); return; }
    if (data) { showToast('Vaccine added'); loadSidebar(); }
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

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScrollBeginDrag={registerActivity}
      >
        <TabTitle
          title="Health & Records"
          subtitle="Medications, immunizations and the household's documents"
          k={k}
        />

        <View style={[s.twoColRow, isNarrowLayout && s.twoColRowStacked]}>
        <View style={[s.centerCol, isNarrowLayout && s.colFullWidth]}>

        {/* CubeAI as its own separate section, matching Chores' own
            KioskAiChoresEngine placement [live-reported: "i want to move
            the cube ai as a separate section similar to the chores"] —
            was only ever available inline inside HealthTabComp's meds/vax
            view before this. Same !kidView gate HealthAiAssistant's own
            phone mount uses (kids don't get the AI pill there either). */}
        {!isKid && (
          <View style={{ marginBottom: KIOSK_SPACE.md }}>
            <KioskHealthAiWidget members={members} activeMemberId={activeMemberId ?? undefined} isDark={kioskDark} k={k} />
          </View>
        )}

        {SEGMENTS.length > 1 && (
          <View style={s.segmentRow} accessibilityRole="tablist">
            {SEGMENTS.map(seg => {
              const isActive = tab === seg.key;
              return (
                <Pressable
                  key={seg.key}
                  onPress={() => { registerActivity(); setTab(seg.key); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={seg.label}
                  style={({ pressed }) => [
                    s.segment,
                    {
                      backgroundColor: isActive
                        ? seg.tint + (kioskDark ? '24' : '1A')
                        : pressed ? k.cardHover : k.card,
                      borderColor: isActive ? seg.tint + (kioskDark ? '4D' : '3D') : k.cardBorder,
                    },
                  ]}
                >
                  <seg.Icon size={15} color={isActive ? seg.tint : k.textMuted} />
                  <Text
                    numberOfLines={1}
                    style={[s.segmentLabel, { color: isActive ? seg.tint : k.textMuted }]}
                  >
                    {seg.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <WidgetCard k={k} isDark={kioskDark}>
          <WidgetHeader
            Icon={Heart} eyebrow="Household" title={current.label}
            accent={accent} k={k} isDark={kioskDark}
            // Real "Add"/"Scan" entry points in the section heading's own
            // right corner [live-reported: "there we should have add med
            // add vax scan recod on the section heading right corner..
            // get all the add form from the mobile equevalent.."] — the
            // SAME real modals/save logic HealthTab.tsx/RecordsTab.tsx
            // already use, mounted a second time here as a faster path;
            // HealthTabComp/RecordsTabComp keep their own "+" affordances
            // too. Parent-only, same as every other write action added to
            // kiosk this session (e.g. Chores' "New Chore").
            right={!isKid ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {tab === 'meds' && (
                  <ActionButton
                    label="Scan" Icon={ScanLine} accent={k.danger}
                    k={k} isDark={kioskDark} variant="soft"
                    onPress={() => { registerActivity(); setScanMode('rx'); setShowScanSheet(true); }}
                    accessibilityHint="Scan a prescription label with the camera"
                  />
                )}
                {tab === 'vax' && (
                  <ActionButton
                    label="Scan" Icon={ScanLine} accent={k.sage}
                    k={k} isDark={kioskDark} variant="soft"
                    onPress={() => { registerActivity(); setScanMode('vaccine'); setShowScanSheet(true); }}
                    accessibilityHint="Scan a vaccine record with the camera"
                  />
                )}
                <ActionButton
                  label={tab === 'meds' ? 'Add Med' : tab === 'vax' ? 'Add Vax' : 'Add Record'}
                  Icon={Plus} accent={accent}
                  k={k} isDark={kioskDark} variant="solid"
                  onPress={() => {
                    registerActivity();
                    if (tab === 'meds') setShowAddMed(true);
                    else if (tab === 'vax') setShowAddVax(true);
                    else setShowAddRecord(true);
                  }}
                  accessibilityHint={`Opens the ${tab === 'meds' ? 'add medication' : tab === 'vax' ? 'add immunization' : 'add record'} form`}
                />
              </View>
            ) : undefined}
          />
          {tab === 'records'
            ? <RecordsTabComp colors={colors} isDark={isDark} />
            : <HealthTabComp colors={colors} isDark={isDark} kidView={isKid}
                healthTab={tab === 'vax' ? 'vax' : 'meds'}
                setHealthTab={t => setTab(t)}
                // KioskHealthAiWidget above already mounts the same real
                // useHealthAi hook as its own standalone card — without
                // this, the AI pill would render a second time inline
                // here too.
                hideAiAssistant={!isKid} />}
        </WidgetCard>

        {/* Real mobile modals/scan sheet, mounted the same way HealthTab.tsx/
            RecordsTab.tsx mount them — same components, same props, this
            file's own state only controls visible/onClose. */}
        <AddMedModal visible={showAddMed} onClose={() => setShowAddMed(false)}
          onSave={addMed} members={members} colors={colors} isDark={isDark} />
        <AddVaxModal visible={showAddVax} onClose={() => setShowAddVax(false)}
          onSave={addVax} members={members} colors={colors} isDark={isDark} />
        <AddRecordModal visible={showAddRecord} onClose={() => setShowAddRecord(false)}
          onSave={addRecord} colors={colors} isDark={isDark}
          members={members} activeMemberId={activeMemberId ?? null} />
        <ScanReviewSheet
          visible={showScanSheet}
          scanMode={scanMode}
          activeMemberId={activeMember?.id ?? ''}
          members={members}
          colors={colors}
          isDark={isDark}
          onClose={() => setShowScanSheet(false)}
          onSaveMed={saveScannedMed}
          onSaveVax={saveScannedVax}
          onScanningChange={setScanning}
        />

        </View>

        {/* ── Sidebar — matching Chores' own sideCol pattern exactly. Parent
            only, same as Chores' roster panels always were, and shown
            across all three segments since it summarizes the whole Health
            area rather than tracking whichever segment happens to be
            selected.

            Every panel now ALWAYS renders (with an EmptyNote fallback)
            instead of disappearing when its own list is empty — a panel
            that vanishes on zero results is indistinguishable from a
            panel that's missing or broken [live-reported: "i didn't find
            these widgets" — turned out to be exactly this: an empty
            household made every panel silently disappear] → "on lets show
            the widgets with empty component to avoid confusion". */}
        {!isKid && (
          <View style={[s.sideCol, isNarrowLayout && s.colFullWidth]}>
            <WidgetCard k={k} isDark={kioskDark} style={s.sidebarPanel}>
              <PanelHead title="Who takes what" k={k} />
              {medsByMember.length === 0 ? (
                <EmptyNote text="No active medications yet." k={k} />
              ) : medsByMember.map(({ member, meds, takenToday, overdue, overdueMeds }, i) => {
                  const rs = assigneeStyle(member, colors, isDark);
                  const clear = overdue === 0 && takenToday === meds.length;
                  // Name the specific overdue medication instead of just a
                  // count — "Amoxicillin overdue" tells a parent what to
                  // actually go do, a bare red "1" doesn't. Falls back to
                  // "N overdue" only when a member has more than one
                  // overdue med at once (naming all of them would overflow
                  // the row).
                  const overdueLabel = overdue === 1
                    ? `${overdueMeds[0].name} overdue`
                    : overdue > 1
                      ? `${overdue} meds overdue`
                      : clear ? 'All taken today' : `${takenToday}/${meds.length} taken today`;
                  return (
                    <View
                      key={member.id}
                      style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                      accessibilityLabel={`${member.name.split(' ')[0]}: ${takenToday} of ${meds.length} taken today${overdue > 0 ? `, ${overdueMeds.map(m => m.name).join(', ')} overdue` : ''}`}
                    >
                      <View style={[s.jarAvatar, { backgroundColor: rs.badge, borderColor: rs.dot, borderWidth: 1.5 }]}>
                        <Text style={{ fontSize: 15 }}>{member.emoji ?? '👤'}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>{member.name.split(' ')[0]}</Text>
                        <Text style={[s.jarMeta, { color: overdue > 0 ? k.danger : k.textFaint }]} numberOfLines={1}>
                          {overdueLabel}
                        </Text>
                      </View>
                      {overdue > 0 ? (
                        <Text style={[s.jarAmt, { color: k.danger }]} numberOfLines={1}>!</Text>
                      ) : (
                        <Text style={[s.jarAmt, { color: k.sage }]} numberOfLines={1}>✓</Text>
                      )}
                    </View>
                  );
                })}
            </WidgetCard>

            <WidgetCard k={k} isDark={kioskDark} style={s.sidebarPanel}>
              <PanelHead
                title="Refills due soon"
                k={k}
                right={refillsSoon.length > 0 ? <Chip label={`${refillsSoon.length}`} accent={k.gold} isDark={kioskDark} k={k} /> : undefined}
              />
              {refillsSoon.length === 0 ? (
                <EmptyNote text="No refills due in the next 7 days." k={k} />
              ) : refillsSoon.map(({ med, daysLeft }, i) => {
                const member = members.find(m => m.id === med.member_id);
                return (
                  <View
                    key={med.id}
                    style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                  >
                    <View style={[s.jarAvatar, { backgroundColor: k.goldSoft, borderColor: k.goldEdge, borderWidth: 1.5 }]}>
                      <Text style={{ fontSize: 15 }}>{member?.emoji ?? '💊'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>{med.name}</Text>
                      <Text style={[s.jarMeta, { color: k.textFaint }]} numberOfLines={1}>
                        {member?.name.split(' ')[0] ?? 'Someone'}
                      </Text>
                    </View>
                    <Text style={[s.jarAmt, { color: k.gold, fontSize: 13 }]} numberOfLines={1}>
                      {daysLeft === 0 ? 'Today' : `${daysLeft}d`}
                    </Text>
                  </View>
                );
              })}
            </WidgetCard>

            <WidgetCard k={k} isDark={kioskDark} style={s.sidebarPanel}>
              <PanelHead
                title="Immunizations due"
                k={k}
                right={vaxDueSoon.length > 0 ? <Chip label={`${vaxDueSoon.length}`} accent={k.sage} isDark={kioskDark} k={k} /> : undefined}
              />
              {vaxDueSoon.length === 0 ? (
                <EmptyNote text="No immunizations due in the next 30 days." k={k} />
              ) : vaxDueSoon.map(({ vax, daysLeft }, i) => {
                const member = members.find(m => m.id === vax.member_id);
                return (
                  <View
                    key={vax.id}
                    style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                  >
                    <View style={[s.jarAvatar, { backgroundColor: k.sageSoft, borderColor: k.sageEdge, borderWidth: 1.5 }]}>
                      <Text style={{ fontSize: 15 }}>{member?.emoji ?? '💉'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>{vax.title}</Text>
                      <Text style={[s.jarMeta, { color: k.textFaint }]} numberOfLines={1}>
                        {member?.name.split(' ')[0] ?? 'Someone'}
                      </Text>
                    </View>
                    <Text style={[s.jarAmt, { color: k.sage, fontSize: 13 }]} numberOfLines={1}>
                      {daysLeft <= 0 ? 'Due' : `${daysLeft}d`}
                    </Text>
                  </View>
                );
              })}
            </WidgetCard>

            <WidgetCard k={k} isDark={kioskDark} style={s.sidebarPanel}>
              <PanelHead
                title="Records needing attention"
                k={k}
                right={recordsNeedingAttention.length > 0 ? <Chip label={`${recordsNeedingAttention.length}`} accent={k.danger} isDark={kioskDark} k={k} /> : undefined}
              />
              {recordsNeedingAttention.length === 0 ? (
                <EmptyNote text="Nothing flagged — everything's up to date." k={k} />
              ) : recordsNeedingAttention.map(({ rec, urgency, followUps }, i) => {
                const member = members.find(m => m.id === rec.member_id);
                const urgent = urgency === 'urgent';
                return (
                  <View
                    key={rec.id}
                    style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                  >
                    <View style={[s.jarAvatar, { backgroundColor: urgent ? k.dangerSoft : k.goldSoft, borderColor: urgent ? k.dangerEdge : k.goldEdge, borderWidth: 1.5 }]}>
                      <Text style={{ fontSize: 15 }}>{member?.emoji ?? '📄'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>{rec.title}</Text>
                      <Text style={[s.jarMeta, { color: k.textFaint }]} numberOfLines={1}>
                        {member?.name.split(' ')[0] ?? 'Someone'}
                        {urgency === 'urgent' ? ' · Urgent' : urgency === 'attention' ? ' · Needs review' : followUps > 0 ? ` · ${followUps} follow-up${followUps > 1 ? 's' : ''}` : ''}
                      </Text>
                    </View>
                    <Text style={[s.jarAmt, { color: urgent ? k.danger : k.gold, fontSize: 13 }]} numberOfLines={1}>
                      {urgent ? '!' : '·'}
                    </Text>
                  </View>
                );
              })}
            </WidgetCard>
          </View>
        )}

        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },

  // Same twoColRow/centerCol/sideCol/colFullWidth values as
  // KioskTasksTab.tsx/KioskOverviewTab.tsx, verbatim (same 1080px
  // breakpoint, same stack-below-it behavior).
  twoColRow: { flexDirection: 'row', gap: KIOSK_SPACE.md, alignItems: 'flex-start' },
  twoColRowStacked: { flexDirection: 'column' },
  colFullWidth: { flex: undefined, width: '100%' },
  centerCol: { flex: 1, gap: KIOSK_SPACE.md, minWidth: 0 },
  sideCol: { flex: undefined, width: 340, gap: KIOSK_SPACE.md, minWidth: 0 },
  sidebarPanel: {},

  // Same jar-row pattern Chores'/Overview's own sidebar panels use,
  // verbatim values.
  jarRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  jarAvatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  jarName: { fontSize: 13.5, fontWeight: '700' },
  jarMeta: { fontSize: 11.5, marginTop: 2 },
  jarAmt: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },

  // Same compact sizing as Chores' filter pills / Schedule's mode switch
  // [live-reported: "follow the health also same design pattern like we
  // did for chores and the schedule" → "AIso same like chores"] — was a
  // much heavier control (KIOSK_HIT.control height, KIOSK_RADIUS.md,
  // body-size text).
  segmentRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md, flexWrap: 'wrap' },
  segment: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5, minHeight: KIOSK_HIT.min - 10,
    paddingHorizontal: KIOSK_SPACE.sm, flex: 1, minWidth: 140,
  },
  segmentLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
});
