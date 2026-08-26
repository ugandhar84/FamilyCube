import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Pill, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import { useUIStore } from '@/store/uiStore';
import { useEventStore } from '@/store/eventStore';
import { SCard, CardHeader } from './shared';
import { ParsedMedication, ParsedVaccine } from '../usePrescriptionScanner';

import { Medication, Vaccine, FREQ_LABELS, getCatColors, today, MedForm, VaxForm } from './health/types';
import AddMedModal from './health/AddMedModal';
import AddVaxModal from './health/AddVaxModal';
import HealthAiAssistant from './health/HealthAiAssistant';
import HealthSearchBar from './health/HealthSearchBar';
import ScanReviewSheet from './health/ScanReviewSheet';
import HealthFilterSheet, { MedFilters, VaxFilters } from './health/HealthFilterSheet';
import HealthRecordsList from './health/HealthRecordsList';

export default function HealthTab({ colors, isDark, kidView = false, healthTab, setHealthTab }: {
  colors: any; isDark: boolean; kidView?: boolean;
  // Controlled from HealthRecordsScreen.tsx — that screen owns ONE 3-way
  // switch (Medications/Immunizations/Records) instead of this component
  // also owning its own separate inner Medications/Immunizations switch,
  // which previously stacked two switches on one screen (live-reported as
  // confusing/"worse design"). Falls back to local state so this component
  // still works if ever rendered without a controller.
  healthTab?: 'meds' | 'vax'; setHealthTab?: (t: 'meds' | 'vax') => void;
}) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  const [meds, setMeds]     = useState<Medication[]>([]);
  const [vaxes, setVaxes]   = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showMedModal, setShowMedModal] = useState(false);
  const [showVaxModal, setShowVaxModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localHealthTab, setLocalHealthTab] = useState<'meds' | 'vax'>('meds');
  const effectiveHealthTab = healthTab ?? localHealthTab;
  const effectiveSetHealthTab = setHealthTab ?? setLocalHealthTab;
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // Lets the shared FAB (app/(tabs)/_layout.tsx) tint itself teal for
  // Immunizations vs. the Health-danger-red default, tracking this inner
  // segmented switch — not just which route/screen is focused. Set on
  // mount too (not just on change) so the FAB is correctly colored the
  // instant this screen becomes focused, before any tap changes healthTab.
  useEffect(() => {
    useUIStore.getState().setHealthRecordsActiveSegment(effectiveHealthTab === 'vax' ? 'immunizations' : 'health');
  }, [effectiveHealthTab]);

  // ── Medication filters (default: active = ongoing, all members) ──────────────
  const [medSearch, setMedSearch]         = useState('');
  const [medMemberFilter, setMedMemberFilter] = useState<string[]>([]);      // [] = all
  const [medCatFilter, setMedCatFilter]   = useState<string[]>([]);           // [] = all
  const [medStatusFilter, setMedStatusFilter] = useState<'active' | 'taken' | 'pending' | 'overdue' | 'all'>('active');
  const [medOngoingOnly, setMedOngoingOnly] = useState(true);
  const [medFreqFilter, setMedFreqFilter] = useState<string[]>([]);
  const [medRefillSoon, setMedRefillSoon] = useState(false);
  const [medEscalationOnly, setMedEscalationOnly] = useState(false);

  // ── Vaccine filters (default: all, all members) ───────────────────────────────
  const [vaxSearch, setVaxSearch]         = useState('');
  const [vaxMemberFilter, setVaxMemberFilter] = useState<string[]>([]);       // [] = all
  const [vaxStatusFilter, setVaxStatusFilter] = useState<'all' | 'done' | 'pending' | 'due_soon'>('pending');
  const [vaxDueSoonDays, setVaxDueSoonDays] = useState(30);

  // Draft filters shown inside bottom sheet before Apply
  const [draftMed, setDraftMed] = useState<MedFilters>({
    search: '', members: [], categories: [], status: 'active',
    ongoing: true, frequencies: [], refillSoon: false, escalationOnly: false,
  });
  const [draftVax, setDraftVax] = useState<VaxFilters>({
    search: '', members: [], status: 'pending', dueSoonDays: 30,
  });

  // AI state
  const [aiQuery, setAiQuery]   = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiShared, setAiShared]   = useState(false);

  // AI banner open state
  const [aiOpen, setAiOpen] = useState(false);
  const aiSlideAnim = useRef(new Animated.Value(0)).current;
  const toggleAiOpen = (next: boolean) => {
    setAiOpen(next);
    Animated.timing(aiSlideAnim, { toValue: next ? 1 : 0, duration: 240, useNativeDriver: false }).start();
  };

  // Scan bottom sheet state (owned here so the AI banner can trigger it; the
  // sheet itself owns all scanning/redaction/review state internally)
  const [showScanSheet, setShowScanSheet] = useState(false);
  const [scanMode, setScanMode] = useState<'rx' | 'vaccine'>('rx');
  const [scanning, setScanning] = useState(false);

  // Shared FAB's family-health-tab "+" face (app/(tabs)/_layout.tsx) fires
  // this one-shot flag instead of opening Ask Cube — same pattern
  // TasksScreen.tsx/MemoriesTab.tsx use. Replaces the old
  // fullBleedScreenActive hide (Health's own CubeAI banner vs. Ask Cube's
  // sparkle competing) — that's moot now since the shared FAB no longer
  // shows the sparkle face on this route at all.
  const openHealthRecordsComposerRequested = useUIStore(s => s.openHealthRecordsComposerRequested);
  useEffect(() => {
    if (openHealthRecordsComposerRequested) {
      useUIStore.getState().setOpenHealthRecordsComposerRequested(false);
      if (effectiveHealthTab === 'vax') setShowVaxModal(true); else setShowMedModal(true);
    }
  }, [openHealthRecordsComposerRequested, effectiveHealthTab]);

  useFocusEffect(useCallback(() => {
    if (useUIStore.getState().openHealthRecordsComposerRequested) {
      useUIStore.getState().setOpenHealthRecordsComposerRequested(false);
      if (effectiveHealthTab === 'vax') setShowVaxModal(true); else setShowMedModal(true);
    }
  }, [effectiveHealthTab]));

  const openScanSheet = (mode: 'rx' | 'vaccine') => {
    setScanMode(mode);
    setShowScanSheet(true);
  };

  const closeScanSheet = () => {
    setShowScanSheet(false);
  };

  const load = useCallback(async () => {
    if (familyId === 'family-1') return; // real family not resolved yet
    setLoading(true);
    setLoadError(null);
    // Kids only see their own assigned medications and vaccines
    const medsQ = kidView && activeMember?.id
      ? supabase.from('family_medications').select('*').eq('family_id', familyId).eq('member_id', activeMember.id)
      : supabase.from('family_medications').select('*').eq('family_id', familyId);
    const vaxQ = kidView && activeMember?.id
      ? supabase.from('family_vaccines').select('*').eq('family_id', familyId).eq('member_id', activeMember.id)
      : supabase.from('family_vaccines').select('*').eq('family_id', familyId);
    const [medsRes, vaxRes] = await Promise.all([
      medsQ.order('created_at', { ascending: false }),
      vaxQ.order('date', { ascending: false }),
    ]);
    if (medsRes.error || vaxRes.error) {
      setLoadError('Could not load health records. Tap refresh to try again.');
    } else {
      if (medsRes.data) setMeds(medsRes.data as Medication[]);
      if (vaxRes.data)  setVaxes(vaxRes.data as Vaccine[]);
    }
    setLoading(false);
  }, [familyId, kidView, activeMember?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime: keep medications and vaccines in sync across devices
  useEffect(() => {
    if (familyId === 'family-1') return;
    const channel = supabase
      .channel(`health-${familyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'family_medications',
        filter: `family_id=eq.${familyId}`,
      }, () => { load(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'family_vaccines',
        filter: `family_id=eq.${familyId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId, load]);

  // Mark medication taken today — records who marked it
  const markTaken = async (med: Medication) => {
    const todayStr = today();
    const alreadyTaken = med.taken_date === todayStr;
    const newDate = alreadyTaken ? null : todayStr;
    const { error } = await supabase.from('family_medications')
      .update({
        taken_date: newDate,
        modified_by: activeMember?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', med.id);
    if (!error) {
      setMeds(prev => prev.map(m => m.id === med.id
        ? { ...m, taken_date: newDate, modified_by: activeMember?.id ?? null }
        : m));
    }
  };

  // Toggle vaccine done
  const toggleVax = async (vax: Vaccine) => {
    const { error } = await supabase.from('family_vaccines')
      .update({
        done: !vax.done,
        modified_by: activeMember?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vax.id);
    if (!error) {
      setVaxes(prev => prev.map(v => v.id === vax.id ? { ...v, done: !v.done } : v));
    }
  };

  // Delete med — requires a comment/reason
  const deleteMed = (id: string) => {
    Alert.prompt(
      'Reason for removing',
      'Enter a brief note (required)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async (comment: string | undefined) => {
            if (!comment?.trim()) {
              Alert.alert('Comment required', 'Please enter a reason before removing.');
              return;
            }
            await supabase.from('family_medications')
              .update({ deleted_by: activeMember?.id ?? null, notes: comment.trim(), updated_at: new Date().toISOString() })
              .eq('id', id);
            await supabase.from('family_medications').delete().eq('id', id);
            setMeds(prev => prev.filter(m => m.id !== id));
          },
        },
      ],
      'plain-text'
    );
  };

  const deleteVax = async (id: string) => {
    await supabase.from('family_vaccines').delete().eq('id', id);
    setVaxes(prev => prev.filter(v => v.id !== id));
  };

  const toggleMedActive = (med: Medication) => {
    const newActive = !med.is_active;
    const action = newActive ? 'reactivate' : 'deactivate';
    Alert.prompt(
      `${newActive ? 'Reactivate' : 'Deactivate'} medication`,
      `Why are you ${action === 'deactivate' ? 'stopping' : 'restarting'} ${med.name}? (required)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newActive ? 'Reactivate' : 'Deactivate',
          style: newActive ? 'default' : 'destructive',
          onPress: async (comment: string | undefined) => {
            if (!comment?.trim()) {
              Alert.alert('Comment required', 'Please enter a reason.');
              return;
            }
            const { error } = await supabase.from('family_medications')
              .update({
                is_active: newActive,
                modified_by: activeMember?.id ?? null,
                notes: comment.trim(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', med.id);
            if (!error) setMeds(prev => prev.map(m =>
              m.id === med.id ? { ...m, is_active: newActive, modified_by: activeMember?.id ?? null } : m));
          },
        },
      ],
      'plain-text'
    );
  };

  const addMed = async (memberId: string, form: MedForm) => {
    const { data } = await supabase.from('family_medications').insert({
      family_id: familyId,
      member_id: memberId,
      assigned_by: activeMember?.id ?? null,
      name: form.name.trim(),
      dosage: form.dosage.trim(),
      dosage_unit: form.dosage_unit,
      frequency: form.frequency,
      frequency_times: [form.reminder_time || '08:00'],
      category: form.category,
      prescribing_doctor: form.prescribing_doctor || null,
      pharmacy: form.pharmacy || null,
      refill_date: form.refill_date || null,
      pills_remaining: form.pills_remaining ? parseInt(form.pills_remaining) : null,
      instructions: form.instructions || null,
      is_ongoing: !form.end_date,
      is_active: true,
      start_date: form.start_date || today(),
      end_date: form.end_date || null,
      escalation_enabled: form.escalation_enabled,
      escalation_after_min: parseInt(form.escalation_after_min) || 60,
    }).select().single();
    if (data) {
      setMeds(prev => [data as Medication, ...prev]);
      // Persist to global suggestions so other families see it; increment use_count on conflict
      supabase.rpc('upsert_med_suggestion', {
        p_name: form.name.trim(),
        p_category: form.category,
        p_hint: form.category,
      }).then(() => {});

      // Materialize the reminder as a real recurring calendar entry (daily,
      // from start_date through end_date if set) instead of a silent DB
      // flag with no schedule anywhere — the medication now actually shows
      // up on the member's own Schedule, and alert_call opts into the same
      // CallKit-style ringing reminder chores/events already use, riding
      // that existing infrastructure with zero new native/server work.
      useEventStore.getState().addRecurringEvent(
        {
          title: `Take ${form.name.trim()}`,
          date: form.start_date || today(),
          time: form.reminder_time || '08:00',
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
    }
  };

  const addVax = async (memberId: string, form: VaxForm) => {
    const { data } = await supabase.from('family_vaccines').insert({
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
    if (data) setVaxes(prev => [data as Vaccine, ...prev]);
  };

  const saveScannedMed = async (reviewMed: ParsedMedication, reviewMemberId: string) => {
    const { data } = await supabase.from('family_medications').insert({
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
    if (data) setMeds(prev => [data as Medication, ...prev]);
  };

  const saveScannedVax = async (reviewVax: ParsedVaccine, reviewMemberId: string) => {
    const { data } = await supabase.from('family_vaccines').insert({
      family_id: familyId,
      member_id: reviewMemberId,
      title: reviewVax.vaccine_name.trim() || 'Unknown vaccine',
      vaccine_type: reviewVax.manufacturer || null,
      date: reviewVax.administered_date ?? today(),
      next_due_date: reviewVax.next_due_date ?? null,
      series_current: reviewVax.dose_number ?? 1,
      series_total: reviewVax.total_doses ?? 1,
      administered_by: reviewVax.administered_by || null,
      location: reviewVax.site || null,
      notes: reviewVax.lot_number ? `Lot: ${reviewVax.lot_number}` : null,
      done: true,
    }).select().single();
    if (data) setVaxes(prev => [data as Vaccine, ...prev]);
  };

  // Returns true if today's dose is overdue (past scheduled time + grace, not taken)
  const isOverdue = (med: Medication) => {
    if (med.taken_date === today()) return false;
    if (!med.frequency_times?.length) return false;
    const now = new Date();
    const firstTime = med.frequency_times[0]; // "HH:MM"
    const [hh, mm] = firstTime.split(':').map(Number);
    const scheduled = new Date();
    scheduled.setHours(hh, mm, 0, 0);
    const graceMins = med.escalation_enabled ? med.escalation_after_min : 60;
    scheduled.setMinutes(scheduled.getMinutes() + graceMins);
    return now > scheduled;
  };

  const askAI = async (q?: string) => {
    const text = (q ?? aiQuery).trim();
    if (!text) return;
    setAiLoading(true);
    setAiResult('');
    setAiShared(false);
    setAiQuery('');
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          action: 'health_qa',
          question: text,
          family: members.map(m => ({ name: m.name, role: m.role })),
        },
      });
      if (error || !data?.result?.answer) {
        // Fallback response
        setAiResult(
          `Health guidance for: "${text}"\n\n` +
          `• This is general information only — not medical advice.\n` +
          `• For children and seniors, consult your family doctor for personalized guidance.\n` +
          `• In an emergency, call 911 or go to the nearest ER.\n\n` +
          `Consider logging this question and the doctor's answer in your health notes.`
        );
      } else {
        setAiResult(data.result.answer);
      }
    } catch {
      setAiResult('Unable to reach Health AI right now. Please try again shortly.');
    }
    setAiLoading(false);
  };

  const shareAiToChat = () => {
    if (!aiResult) return;
    const msg = `🩺 *Health AI Response*\n\n${aiResult}\n\n⚠️ For informational use only — consult a healthcare provider for medical decisions.`;
    useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
    setAiShared(true);
  };

  const openFilterSheet = () => {
    // Seed draft from current applied filters
    setDraftMed({ search: medSearch, members: medMemberFilter, categories: medCatFilter,
      status: medStatusFilter, ongoing: medOngoingOnly, frequencies: medFreqFilter,
      refillSoon: medRefillSoon, escalationOnly: medEscalationOnly });
    setDraftVax({ search: vaxSearch, members: vaxMemberFilter,
      status: vaxStatusFilter, dueSoonDays: vaxDueSoonDays });
    setShowFilterSheet(true);
  };

  const applyFilters = () => {
    setMedSearch(draftMed.search);
    setMedMemberFilter(draftMed.members);
    setMedCatFilter(draftMed.categories);
    setMedStatusFilter(draftMed.status);
    setMedOngoingOnly(draftMed.ongoing);
    setMedFreqFilter(draftMed.frequencies);
    setMedRefillSoon(draftMed.refillSoon);
    setMedEscalationOnly(draftMed.escalationOnly);
    setVaxSearch(draftVax.search);
    setVaxMemberFilter(draftVax.members);
    setVaxStatusFilter(draftVax.status);
    setVaxDueSoonDays(draftVax.dueSoonDays);
    setShowFilterSheet(false);
  };

  const resetFilters = () => {
    if (effectiveHealthTab === 'meds') {
      setDraftMed({ search: '', members: [], categories: [], status: 'active',
        ongoing: true, frequencies: [], refillSoon: false, escalationOnly: false });
    } else {
      setDraftVax({ search: '', members: [], status: 'pending', dueSoonDays: 30 });
    }
  };

  const clearMedFilters = () => {
    setMedSearch(''); setMedMemberFilter([]); setMedCatFilter([]);
    setMedStatusFilter('active'); setMedOngoingOnly(true);
    setMedFreqFilter([]); setMedRefillSoon(false); setMedEscalationOnly(false);
  };

  const clearVaxFilters = () => {
    setVaxSearch(''); setVaxMemberFilter([]); setVaxStatusFilter('pending'); setVaxDueSoonDays(30);
  };

  const memberName  = (id: string) => members.find(m => m.id === id)?.name ?? id;
  const memberColor = (id: string) => {
    const m = members.find(mb => mb.id === id);
    return m?.role === 'parent' ? colors.accent : m?.role === 'senior' ? colors.info : colors.success;
  };

  // ── Active filter count for badge ────────────────────────────────────────────
  const medActiveFilterCount = useMemo(() => {
    let n = 0;
    if (medStatusFilter !== 'active') n++;
    if (medMemberFilter.length) n++;
    if (medCatFilter.length) n++;
    if (medFreqFilter.length) n++;
    if (!medOngoingOnly) n++;
    if (medRefillSoon) n++;
    if (medEscalationOnly) n++;
    if (medSearch) n++;
    return n;
  }, [medStatusFilter, medMemberFilter, medCatFilter, medFreqFilter,
      medOngoingOnly, medRefillSoon, medEscalationOnly, medSearch]);

  const vaxActiveFilterCount = useMemo(() => {
    let n = 0;
    // 'pending' is the real default (see vaxStatusFilter's own useState
    // above) — was checking against 'all' here, which isn't the default,
    // so a completely untouched screen showed "1 active filter" / a
    // "Pending · Clear all" chip as if the user had picked something
    // (live-reported: "what is that pending clear all, should only
    // appear when actual filters apply"). Mirrors medActiveFilterCount's
    // own pattern just above (medStatusFilter !== 'active', its default).
    if (vaxStatusFilter !== 'pending') n++;
    if (vaxMemberFilter.length) n++;
    if (vaxSearch) n++;
    return n;
  }, [vaxStatusFilter, vaxMemberFilter, vaxSearch]);

  // Filtered meds
  const filteredMeds = useMemo(() => {
    const todayStr = today();
    const now = new Date();
    return meds.filter(med => {
      if (kidView && !med.is_active) return false;
      if (medMemberFilter.length && !medMemberFilter.includes(med.member_id)) return false;
      if (medCatFilter.length && !medCatFilter.includes(med.category)) return false;
      if (medFreqFilter.length && !medFreqFilter.includes(med.frequency)) return false;
      if (medOngoingOnly && !med.is_ongoing) return false;
      if (medEscalationOnly && !med.escalation_enabled) return false;
      if (medRefillSoon) {
        if (!med.refill_date) return false;
        const diff = new Date(med.refill_date).getTime() - now.getTime();
        if (diff < 0 || diff > 7 * 24 * 3600_000) return false;
      }
      if (medSearch && !med.name.toLowerCase().includes(medSearch.toLowerCase())) return false;
      if (medStatusFilter === 'active')  return med.is_ongoing;
      if (medStatusFilter === 'taken')   return med.taken_date === todayStr;
      if (medStatusFilter === 'pending') return med.taken_date !== todayStr && !isOverdue(med);
      if (medStatusFilter === 'overdue') return isOverdue(med);
      return true;
    });
  }, [meds, medMemberFilter, medCatFilter, medFreqFilter, medOngoingOnly,
      medEscalationOnly, medRefillSoon, medSearch, medStatusFilter]);

  // Filtered vaxes
  const filteredVaxes = useMemo(() => {
    const now = new Date();
    return vaxes.filter(vax => {
      if (vaxMemberFilter.length && !vaxMemberFilter.includes(vax.member_id)) return false;
      if (vaxSearch && !vax.title.toLowerCase().includes(vaxSearch.toLowerCase())) return false;
      if (vaxStatusFilter === 'done')    return vax.done;
      if (vaxStatusFilter === 'pending') return !vax.done;
      if (vaxStatusFilter === 'due_soon') {
        if (!vax.next_due_date) return false;
        const due = new Date(vax.next_due_date);
        return !vax.done && (due.getTime() - now.getTime()) < vaxDueSoonDays * 24 * 3600_000;
      }
      return true;
    });
  }, [vaxes, vaxMemberFilter, vaxSearch, vaxStatusFilter, vaxDueSoonDays]);

  if (loading) return (
    <SCard colors={colors} isDark={isDark} accent={colors.primary}>
      <CardHeader Icon={Pill} iconColor={colors.primary} title="Health Tracker" colors={colors} />
      <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
    </SCard>
  );

  if (loadError) return (
    <SCard colors={colors} isDark={isDark} accent={colors.primary}>
      <CardHeader Icon={Pill} iconColor={colors.primary} title="Health Tracker" colors={colors} />
      <View style={{ backgroundColor: colors.danger + '15', borderRadius: 12, padding: 14, marginTop: 12, gap: 10 }}>
        <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{loadError}</Text>
        <TouchableOpacity
          onPress={load}
          style={{ alignSelf: 'center', backgroundColor: colors.danger, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 }}
        >
          <Text style={{ color: colors.textInverse, fontSize: 13, fontWeight: '800' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SCard>
  );

  // ── Kid view: simple active-meds-only layout ─────────────────────────────
  if (kidView) {
    const activeMeds = meds.filter(m => m.is_active);
    const todayStr = today();
    return (
      <View style={{ gap: 12 }}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : activeMeds.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Pill size={40} color={colors.primary + '60'} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textSecondary }}>
              No active medications
            </Text>
            <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center' }}>
              A parent will add your medications here
            </Text>
          </View>
        ) : activeMeds.map(med => {
          const isTaken = med.taken_date === todayStr;
          const catColor = getCatColors(colors)[med.category] ?? colors.primary;
          return (
            <View key={med.id} style={{
              borderRadius: 20, overflow: 'hidden',
              borderWidth: 1.5,
              borderColor: isTaken ? colors.success + '50' : catColor + '30',
              backgroundColor: colors.card,
            }}>
              {/* Color stripe */}
              <View style={{ height: 4, backgroundColor: isTaken ? colors.success : catColor }} />
              <View style={{ padding: 16, gap: 10 }}>
                {/* Med name + category */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14,
                    backgroundColor: catColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Pill size={22} color={catColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3 }}>
                      {med.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
                      {med.dosage} {med.dosage_unit} · {FREQ_LABELS[med.frequency] ?? med.frequency}
                    </Text>
                  </View>
                  {isTaken && (
                    <View style={{ backgroundColor: colors.success + '18', borderRadius: 10,
                      paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.success + '40' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.success }}>✓ Done</Text>
                    </View>
                  )}
                </View>

                {/* Instructions */}
                {!!med.instructions && (
                  <Text style={{ fontSize: 13, color: colors.textSecondary,
                    backgroundColor: isDark ? colors.surface : '#F8F7FF',
                    borderRadius: 10, padding: 10 }}>
                    {med.instructions}
                  </Text>
                )}

                {/* Mark taken button */}
                <TouchableOpacity onPress={() => markTaken(med)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 13, borderRadius: 14,
                    backgroundColor: isTaken ? colors.success + '15' : catColor,
                    borderWidth: isTaken ? 1.5 : 0,
                    borderColor: isTaken ? colors.success + '50' : 'transparent',
                  }}>
                  <Check size={16} color={isTaken ? colors.success : colors.textInverse} />
                  <Text style={{ fontSize: 15, fontWeight: '900',
                    color: isTaken ? colors.success : colors.textInverse }}>
                    {isTaken ? 'Marked as Taken' : 'Mark as Taken'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <>
      {/* ── AI Health Assistant + Search — same row when the AI pill is
          collapsed, so the two don't stack with a dead gap between them
          (live-reported). Once the AI pill is tapped open, its tool row
          needs the full width, so search drops below it instead of being
          squeezed. Kids have no AI pill at all — search then just takes
          the full row on its own. ── */}
      <View style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: aiOpen ? 'wrap' : 'nowrap' }}>
        {!kidView && (
          <View style={aiOpen ? { width: '100%' } : undefined}>
            <HealthAiAssistant
              colors={colors}
              isDark={isDark}
              aiOpen={aiOpen}
              toggleAiOpen={toggleAiOpen}
              aiSlideAnim={aiSlideAnim}
              scanning={scanning}
              onScanRx={() => openScanSheet('rx')}
              onScanVaccine={() => openScanSheet('vaccine')}
              aiQuery={aiQuery}
              setAiQuery={setAiQuery}
              aiLoading={aiLoading}
              aiResult={aiResult}
              setAiResult={setAiResult}
              aiShared={aiShared}
              setAiShared={setAiShared}
              askAI={askAI}
              shareAiToChat={shareAiToChat}
            />
          </View>
        )}
        {!aiOpen && (
          <HealthSearchBar
            colors={colors} isDark={isDark} healthTab={effectiveHealthTab}
            medSearch={medSearch} setMedSearch={setMedSearch}
            vaxSearch={vaxSearch} setVaxSearch={setVaxSearch}
            medActiveFilterCount={medActiveFilterCount} vaxActiveFilterCount={vaxActiveFilterCount}
            openFilterSheet={openFilterSheet}
          />
        )}
      </View>
      {aiOpen && (
        <View style={{ marginTop: -6, marginBottom: 14 }}>
          <HealthSearchBar
            colors={colors} isDark={isDark} healthTab={effectiveHealthTab}
            medSearch={medSearch} setMedSearch={setMedSearch}
            vaxSearch={vaxSearch} setVaxSearch={setVaxSearch}
            medActiveFilterCount={medActiveFilterCount} vaxActiveFilterCount={vaxActiveFilterCount}
            openFilterSheet={openFilterSheet}
          />
        </View>
      )}

      {/* ── Medications + Immunizations (unified) ───── */}
      <HealthRecordsList
        colors={colors}
        isDark={isDark}
        kidView={kidView}
        meds={meds}
        vaxes={vaxes}
        filteredMeds={filteredMeds}
        filteredVaxes={filteredVaxes}
        healthTab={effectiveHealthTab}
        setHealthTab={effectiveSetHealthTab}
        medSearch={medSearch}
        setMedSearch={setMedSearch}
        vaxSearch={vaxSearch}
        setVaxSearch={setVaxSearch}
        medActiveFilterCount={medActiveFilterCount}
        vaxActiveFilterCount={vaxActiveFilterCount}
        openFilterSheet={openFilterSheet}
        setShowMedModal={setShowMedModal}
        setShowVaxModal={setShowVaxModal}
        medStatusFilter={medStatusFilter}
        medMemberFilter={medMemberFilter}
        medCatFilter={medCatFilter}
        medRefillSoon={medRefillSoon}
        medEscalationOnly={medEscalationOnly}
        vaxStatusFilter={vaxStatusFilter}
        vaxMemberFilter={vaxMemberFilter}
        vaxDueSoonDays={vaxDueSoonDays}
        clearMedFilters={clearMedFilters}
        clearVaxFilters={clearVaxFilters}
        memberName={memberName}
        memberColor={memberColor}
        isOverdue={isOverdue}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        markTaken={markTaken}
        toggleMedActive={toggleMedActive}
        deleteMed={deleteMed}
        toggleVax={toggleVax}
        deleteVax={deleteVax}
        load={load}
      />

      {/* Modals */}
      <AddMedModal visible={showMedModal} onClose={() => setShowMedModal(false)}
        onSave={addMed} members={members} colors={colors} isDark={isDark} />
      <AddVaxModal visible={showVaxModal} onClose={() => setShowVaxModal(false)}
        onSave={addVax} members={members} colors={colors} isDark={isDark} />

      {/* ── Scan Rx / Vaccine — 2-page bottom sheet (full-screen during redact) ── */}
      <ScanReviewSheet
        visible={showScanSheet}
        scanMode={scanMode}
        activeMemberId={activeMember?.id ?? ''}
        members={members}
        colors={colors}
        isDark={isDark}
        onClose={closeScanSheet}
        onSaveMed={saveScannedMed}
        onSaveVax={saveScannedVax}
        onScanningChange={setScanning}
      />

      {/* ── Filter Bottom Sheet ─────────────────────── */}
      <HealthFilterSheet
        visible={showFilterSheet}
        onRequestClose={() => setShowFilterSheet(false)}
        colors={colors}
        isDark={isDark}
        members={members}
        healthTab={effectiveHealthTab}
        draftMed={draftMed}
        setDraftMed={setDraftMed}
        draftVax={draftVax}
        setDraftVax={setDraftVax}
        resetFilters={resetFilters}
        applyFilters={applyFilters}
        filteredMeds={filteredMeds}
        filteredVaxes={filteredVaxes}
        meds={meds}
        vaxes={vaxes}
        memberName={memberName}
        activeMemberId={activeMember?.id ?? ''}
        sendMessage={(channel, memberId, msg) => useChatStore.getState().sendMessage(channel, memberId, msg)}
        setShowFilterSheet={setShowFilterSheet}
      />
    </>
  );
}
