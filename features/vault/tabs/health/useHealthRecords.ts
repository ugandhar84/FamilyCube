/**
 * useHealthRecords — extracted, reusable backend logic for Health &
 * Records, pulled out of HealthTab.tsx (which stays completely unchanged
 * and is still what Kiosk uses, via KioskHealthTab.tsx/
 * KioskHealthAiWidget.tsx). This hook is NET-NEW and is consumed ONLY by
 * the new mobile HealthRecordsScreen.tsx rebuild — Kiosk keeps calling its
 * own copy of this exact same logic, inline, inside HealthTab.tsx, as
 * before. Nothing here changes HealthTab.tsx's behavior or Kiosk's.
 *
 * Covers: Supabase load (meds/vaxes) + realtime subscription, addMed/
 * updateMed/addVax/updateVax, markTaken (per-dose-time toggle via
 * toggle_medication_dose RPC), toggleVax, deleteMed/deleteVax/
 * deleteMedsBulk/deleteVaxesBulk/toggleMedActive, isOverdue,
 * saveScannedMed/saveScannedVax, and all filter state + the filtered-list
 * derivation (medStatusFilter/medMemberFilter/medCatFilter/etc. and the
 * useMemo'd filteredMeds/filteredVaxes). Line-for-line behavior parity with
 * HealthTab.tsx's own copy of this logic — see that file for the detailed
 * "why" comments on each piece (atomic dose toggle, per-dose reminders,
 * bulk-delete audit trail, etc.), repeated here only where it affects a
 * call site.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { showToast } from '@/components/AppToast';
import { ParsedMedication, ParsedVaccine } from '../../usePrescriptionScanner';
import {
  Medication, Vaccine, today, MedForm, VaxForm, encodeTakenEntry,
} from './types';
import { MedFilters, VaxFilters } from './HealthFilterSheet';

export function useHealthRecords({ kidView = false }: { kidView?: boolean } = {}) {
  const { members, activeMemberId, familyName } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  const [meds, setMeds]       = useState<Medication[]>([]);
  const [vaxes, setVaxes]     = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Unique per hook INSTANCE, not just per family — HealthPeoplePage.tsx
  // (the person-picker landing page) and HealthRecordsScreen.tsx (opened
  // from inside it, scoped to one member) both call this hook and can be
  // mounted at the same time, which previously tried to open two Supabase
  // realtime channels with the identical name `health-${familyId}-mobile`
  // — the second subscribe() call threw "cannot add postgres_changes
  // callbacks... after subscribe()" (live-reported crash, full stack
  // traced to this effect). A random per-mount suffix keeps every
  // concurrently-mounted instance on its own channel.
  const channelSuffix = useRef(Math.random().toString(36).slice(2)).current;

  // ── Medication filters (default: active = ongoing, all members) ──────
  const [medSearch, setMedSearch]             = useState('');
  const [medMemberFilter, setMedMemberFilter] = useState<string[]>([]);  // [] = all
  const [medCatFilter, setMedCatFilter]       = useState<string[]>([]);  // [] = all
  const [medStatusFilter, setMedStatusFilter] = useState<'active' | 'taken' | 'pending' | 'overdue' | 'all'>('active');
  const [medOngoingOnly, setMedOngoingOnly]   = useState(true);
  const [medFreqFilter, setMedFreqFilter]     = useState<string[]>([]);
  const [medRefillSoon, setMedRefillSoon]     = useState(false);
  const [medEscalationOnly, setMedEscalationOnly] = useState(false);

  // ── Vaccine filters (default: all, all members) ───────────────────────
  const [vaxSearch, setVaxSearch]             = useState('');
  const [vaxMemberFilter, setVaxMemberFilter] = useState<string[]>([]);  // [] = all
  const [vaxStatusFilter, setVaxStatusFilter] = useState<'all' | 'done' | 'pending' | 'due_soon'>('pending');
  const [vaxDueSoonDays, setVaxDueSoonDays]   = useState(30);

  // Draft filters shown inside the Filter screen before Apply
  const [draftMed, setDraftMed] = useState<MedFilters>({
    search: '', members: [], categories: [], status: 'active',
    ongoing: true, frequencies: [], refillSoon: false, escalationOnly: false,
  });
  const [draftVax, setDraftVax] = useState<VaxFilters>({
    search: '', members: [], status: 'pending', dueSoonDays: 30,
  });

  const load = useCallback(async () => {
    if (familyId === 'family-1') return; // real family not resolved yet
    setLoading(true);
    setLoadError(null);
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

  useEffect(() => {
    if (familyId === 'family-1') return;
    const channel = supabase
      .channel(`health-${familyId}-mobile-${channelSuffix}`)
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

  const markTaken = async (med: Medication, time: string | null) => {
    const todayStr = today();
    const entry = encodeTakenEntry(todayStr, time);
    const existingDates = med.taken_dates ?? [];
    const wasTaken = existingDates.includes(entry);
    const { data: newDates, error } = await supabase.rpc('toggle_medication_dose', {
      p_med_id: med.id, p_entry: entry, p_mark_taken: !wasTaken,
      p_today: todayStr, p_modified_by: activeMember?.id ?? null,
    });
    if (!error && newDates) {
      const timesForMed = med.frequency_times?.length ? med.frequency_times : ['08:00'];
      const allDosesTakenToday = timesForMed.every(t => (newDates as string[]).includes(encodeTakenEntry(todayStr, timesForMed.length > 1 ? t : null)));
      setMeds(prev => prev.map(m => m.id === med.id
        ? { ...m, taken_date: allDosesTakenToday ? todayStr : null, taken_dates: newDates as string[], modified_by: activeMember?.id ?? null }
        : m));
      showToast(wasTaken ? 'Marked as not taken' : 'Marked as taken');
    }
  };

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
      showToast(vax.done ? 'Marked as not done' : 'Marked as done');
    }
  };

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
            showToast('Medication removed');
          },
        },
      ],
      'plain-text'
    );
  };

  const deleteVax = async (id: string) => {
    await supabase.from('family_vaccines').delete().eq('id', id);
    setVaxes(prev => prev.filter(v => v.id !== id));
    showToast('Vaccine removed');
  };

  const deleteMedsBulk = (ids: string[]) => {
    if (ids.length === 0) return;
    Alert.prompt(
      `Remove ${ids.length} medication${ids.length > 1 ? 's' : ''}`,
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
            const now = new Date().toISOString();
            await supabase.from('family_medications')
              .update({ deleted_by: activeMember?.id ?? null, notes: comment.trim(), updated_at: now })
              .in('id', ids);
            await supabase.from('family_medications').delete().in('id', ids);
            setMeds(prev => prev.filter(m => !ids.includes(m.id)));
            showToast(`${ids.length} medication${ids.length > 1 ? 's' : ''} removed`);
          },
        },
      ],
      'plain-text'
    );
  };

  const deleteVaxesBulk = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.from('family_vaccines').delete().in('id', ids);
    setVaxes(prev => prev.filter(v => !ids.includes(v.id)));
    showToast(`${ids.length} vaccine${ids.length > 1 ? 's' : ''} removed`);
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
            if (!error) {
              setMeds(prev => prev.map(m =>
                m.id === med.id ? { ...m, is_active: newActive, modified_by: activeMember?.id ?? null } : m));
              showToast(newActive ? 'Medication reactivated' : 'Medication deactivated');
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const updateMed = async (medId: string, memberId: string, form: MedForm) => {
    const { error } = await supabase.from('family_medications').update({
      member_id: memberId,
      modified_by: activeMember?.id ?? null,
      name: form.name.trim(),
      dosage: form.dosage.trim(),
      dosage_unit: form.dosage_unit,
      frequency: form.frequency,
      frequency_times: form.reminder_times.length ? form.reminder_times : ['08:00'],
      category: form.category,
      prescribing_doctor: form.prescribing_doctor || null,
      pharmacy: form.pharmacy || null,
      refill_date: form.refill_date || null,
      pills_remaining: form.pills_remaining ? parseInt(form.pills_remaining) : null,
      instructions: form.instructions || null,
      is_ongoing: !form.end_date,
      start_date: form.start_date || today(),
      end_date: form.end_date || null,
      escalation_enabled: form.escalation_enabled,
      escalation_after_min: parseInt(form.escalation_after_min) || 60,
      source_note: form.source_note || null,
      updated_at: new Date().toISOString(),
    }).eq('id', medId);
    if (!error) {
      setMeds(prev => prev.map(m => m.id === medId ? {
        ...m, member_id: memberId, name: form.name.trim(), dosage: form.dosage.trim(),
        dosage_unit: form.dosage_unit, frequency: form.frequency,
        frequency_times: form.reminder_times.length ? form.reminder_times : ['08:00'],
        category: form.category, prescribing_doctor: form.prescribing_doctor || null,
        pharmacy: form.pharmacy || null, refill_date: form.refill_date || null,
        pills_remaining: form.pills_remaining ? parseInt(form.pills_remaining) : null,
        instructions: form.instructions || null, is_ongoing: !form.end_date,
        start_date: form.start_date || today(), end_date: form.end_date || null,
        escalation_enabled: form.escalation_enabled,
        escalation_after_min: parseInt(form.escalation_after_min) || 60,
        source_note: form.source_note || null,
      } : m));
      showToast('Medication updated');
    } else {
      throw error;
    }
  };

  const addMed = async (memberId: string, form: MedForm, medId?: string) => {
    if (medId) return updateMed(medId, memberId, form);
    const times = form.reminder_times.length ? form.reminder_times : ['08:00'];
    const { data } = await supabase.from('family_medications').insert({
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
      start_date: form.start_date || today(),
      end_date: form.end_date || null,
      escalation_enabled: form.escalation_enabled,
      escalation_after_min: parseInt(form.escalation_after_min) || 60,
      source_note: form.source_note || null,
    }).select().single();
    if (data) {
      setMeds(prev => [data as Medication, ...prev]);

      if (memberId !== activeMember?.id) {
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'medication_added', familyId, memberIds: [memberId], persist: true,
            excludeMemberId: activeMember?.id,
            payload: { memberId, medName: form.name.trim(), dosage: form.dosage.trim() ? `${form.dosage} ${form.dosage_unit}` : undefined, byName: activeMember?.name },
          },
        }).catch(e => console.warn('[useHealthRecords] addMed notify failed:', e?.message));
      }

      supabase.rpc('upsert_med_suggestion', {
        p_name: form.name.trim(),
        p_category: form.category,
        p_hint: form.category,
      }).then(() => {});

      times.forEach(time => {
        useEventStore.getState().addRecurringEvent(
          {
            title: `Take ${form.name.trim()}`,
            date: form.start_date || today(),
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
      showToast('Medication added');
    }
  };

  const updateVax = async (vaxId: string, memberId: string, form: VaxForm) => {
    const { error } = await supabase.from('family_vaccines').update({
      member_id: memberId,
      modified_by: activeMember?.id ?? null,
      title: form.title.trim(),
      vaccine_type: form.vaccine_type || null,
      date: form.date,
      next_due_date: form.next_due_date || null,
      series_current: parseInt(form.series_current) || 1,
      series_total: parseInt(form.series_total) || 1,
      administered_by: form.administered_by || null,
      location: form.location || null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', vaxId);
    if (!error) {
      setVaxes(prev => prev.map(v => v.id === vaxId ? {
        ...v, member_id: memberId, title: form.title.trim(), vaccine_type: form.vaccine_type || null,
        date: form.date, next_due_date: form.next_due_date || null,
        series_current: parseInt(form.series_current) || 1, series_total: parseInt(form.series_total) || 1,
        administered_by: form.administered_by || null, location: form.location || null,
        notes: form.notes || null,
      } : v));
      showToast('Vaccine updated');
    } else {
      throw error;
    }
  };

  const addVax = async (memberId: string, form: VaxForm, vaxId?: string) => {
    if (vaxId) return updateVax(vaxId, memberId, form);
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
    if (data) { setVaxes(prev => [data as Vaccine, ...prev]); showToast('Vaccine added'); }
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
    if (data) { setMeds(prev => [data as Medication, ...prev]); showToast('Medication added'); }
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
    if (data) { setVaxes(prev => [data as Vaccine, ...prev]); showToast('Vaccine added'); }
  };

  const isOverdue = (med: Medication) => {
    if (med.taken_date === today()) return false;
    if (!med.frequency_times?.length) return false;
    const now = new Date();
    const firstTime = med.frequency_times[0];
    const [hh, mm] = firstTime.split(':').map(Number);
    const scheduled = new Date();
    scheduled.setHours(hh, mm, 0, 0);
    const graceMins = med.escalation_enabled ? med.escalation_after_min : 60;
    scheduled.setMinutes(scheduled.getMinutes() + graceMins);
    return now > scheduled;
  };

  const openFilterSheet = () => {
    setDraftMed({ search: medSearch, members: medMemberFilter, categories: medCatFilter,
      status: medStatusFilter, ongoing: medOngoingOnly, frequencies: medFreqFilter,
      refillSoon: medRefillSoon, escalationOnly: medEscalationOnly });
    setDraftVax({ search: vaxSearch, members: vaxMemberFilter,
      status: vaxStatusFilter, dueSoonDays: vaxDueSoonDays });
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
  };

  const resetFilters = (tab: 'meds' | 'vax') => {
    if (tab === 'meds') {
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
  const memberColor = (id: string, colors: any) => {
    const m = members.find(mb => mb.id === id);
    return m?.role === 'parent' ? colors.accent : m?.role === 'senior' ? colors.info : colors.success;
  };

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
    if (vaxStatusFilter !== 'pending') n++;
    if (vaxMemberFilter.length) n++;
    if (vaxSearch) n++;
    return n;
  }, [vaxStatusFilter, vaxMemberFilter, vaxSearch]);

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
    })
      .sort((a, b) => new Date(b.start_date || b.updated_at || 0).getTime() - new Date(a.start_date || a.updated_at || 0).getTime());
  }, [meds, medMemberFilter, medCatFilter, medFreqFilter, medOngoingOnly,
      medEscalationOnly, medRefillSoon, medSearch, medStatusFilter, kidView]);

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
    })
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [vaxes, vaxMemberFilter, vaxSearch, vaxStatusFilter, vaxDueSoonDays]);

  return {
    members, activeMemberId, activeMember, familyId, familyName,
    meds, vaxes, loading, loadError, load,
    medSearch, setMedSearch, medMemberFilter, setMedMemberFilter,
    medCatFilter, setMedCatFilter, medStatusFilter, setMedStatusFilter,
    medOngoingOnly, setMedOngoingOnly, medFreqFilter, setMedFreqFilter,
    medRefillSoon, setMedRefillSoon, medEscalationOnly, setMedEscalationOnly,
    vaxSearch, setVaxSearch, vaxMemberFilter, setVaxMemberFilter,
    vaxStatusFilter, setVaxStatusFilter, vaxDueSoonDays, setVaxDueSoonDays,
    draftMed, setDraftMed, draftVax, setDraftVax,
    openFilterSheet, applyFilters, resetFilters, clearMedFilters, clearVaxFilters,
    medActiveFilterCount, vaxActiveFilterCount,
    filteredMeds, filteredVaxes,
    markTaken, toggleVax, deleteMed, deleteVax, deleteMedsBulk, deleteVaxesBulk,
    toggleMedActive, addMed, updateMed, addVax, updateVax,
    saveScannedMed, saveScannedVax, isOverdue,
    memberName, memberColor,
  };
}
