/**
 * useMedications — shared medication list/add/toggle/delete logic, scoped
 * to a single family member. Extracted from HealthTab.tsx's own
 * implementation (the real one: full MedForm insert + a materialized
 * recurring calendar reminder) and SeniorView.tsx's near-duplicate — both
 * queried the same family_medications table with slightly different
 * scoping, which is exactly the kind of hand-maintained-twice drift risk
 * TaskFormShell.tsx's own header comment warns about elsewhere in this
 * app. Any screen that needs a per-member medication list (Grandparent's
 * Hub card, Parent's Hub card, and eventually HealthTab itself) should use
 * this instead of querying family_medications directly.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useEventStore } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { showToast } from '@/components/AppToast';
import { Medication, MedForm, today } from './types';

export function useMedications(familyId: string | undefined, memberId: string | undefined) {
  const [meds, setMeds] = useState<Medication[]>([]);

  const loadMeds = useCallback(async () => {
    if (!familyId || !memberId) return;
    const { data } = await supabase.from('family_medications')
      .select('*')
      .eq('family_id', familyId).eq('member_id', memberId).eq('is_active', true)
      .order('created_at', { ascending: false });
    if (data) setMeds(data as Medication[]);
  }, [familyId, memberId]);

  useEffect(() => { loadMeds(); }, [loadMeds]);

  useEffect(() => {
    if (!familyId || !memberId) return;
    const channel = supabase
      .channel(`meds-${familyId}-${memberId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'family_medications',
        filter: `member_id=eq.${memberId}`,
      }, () => { loadMeds(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId, memberId, loadMeds]);

  // Full MedForm-based insert, same shape HealthTab.tsx's AddMedModal
  // submits — dosage, frequency, prescriber/pharmacy, start/end date,
  // escalation, PLUS a real recurring calendar reminder (daily, from
  // start_date through end_date if set), not just a bare DB row with no
  // schedule anywhere.
  // targetMemberId lets a caller with a wider member list (e.g. a Hub
  // card's "Assigned To" picker covering the whole family, not just the
  // profile this hook is scoped to) insert the medication under a
  // DIFFERENT member than the hook's own memberId — defaults to memberId
  // so every existing self-only call site is unaffected.
  const addMed = useCallback(async (form: MedForm, targetMemberId?: string) => {
    const subjectId = targetMemberId ?? memberId;
    if (!familyId || !subjectId) return;
    const times = form.reminder_times.length ? form.reminder_times : ['08:00'];
    const { data } = await supabase.from('family_medications').insert({
      family_id: familyId,
      member_id: subjectId,
      assigned_by: memberId,
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
    }).select().single();
    if (data) {
      // Only inject into this hook's own list if the med was actually
      // added for the member THIS hook is scoped to — a parent adding a
      // med for a kid from a picker covering the whole family must not
      // have it silently appear under the parent's own "my meds" list.
      if (subjectId === memberId) setMeds(prev => [data as Medication, ...prev]);
      supabase.rpc('upsert_med_suggestion', {
        p_name: form.name.trim(),
        p_category: form.category,
        p_hint: form.category,
      }).then(() => {});
      // One independent recurring series PER dose time — "2x Daily" with
      // times [08:00, 20:00] materializes two separate daily recurring
      // events, each ringing at its own time, instead of the one call
      // this used to make (which silently dropped every dose time past
      // the first — live-reported: selecting "2x Daily" only ever asked
      // for a single reminder time with nowhere to enter a second).
      // A parent can add a med for a DIFFERENT member (kid, senior) than
      // themselves via a picker covering the whole family — that member
      // previously had no way to know a new medication was added to their
      // own record. Self-adds (subjectId === memberId) stay silent, same
      // rule HealthTab.tsx's own addMed already uses.
      if (subjectId !== memberId) {
        const byName = useFamilyStore.getState().members.find(m => m.id === memberId)?.name;
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'medication_added', familyId, memberIds: [subjectId], persist: true,
            excludeMemberId: memberId,
            payload: { memberId: subjectId, medName: form.name.trim(), dosage: form.dosage.trim() ? `${form.dosage} ${form.dosage_unit}` : undefined, byName },
          },
        }).catch(e => console.warn('[useMedications] addMed notify failed:', e?.message));
      }

      // Reminder goes to subjectId (the actual patient), not memberId (the
      // acting parent) — otherwise a parent adding a kid's medication would
      // wrongly schedule the "take your pill" reminder on their own profile.
      times.forEach(time => {
        useEventStore.getState().addRecurringEvent(
          {
            title: `Take ${form.name.trim()}`,
            date: form.start_date || today(),
            time,
            memberId: subjectId,
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
  }, [familyId, memberId]);

  const toggleMed = useCallback(async (med: Medication) => {
    const todayStr = today();
    const alreadyTaken = med.taken_date === todayStr;
    const newDate = alreadyTaken ? null : todayStr;
    const { error } = await supabase.from('family_medications')
      .update({ taken_date: newDate, modified_by: memberId ?? null, updated_at: new Date().toISOString() })
      .eq('id', med.id);
    if (!error) {
      setMeds(prev => prev.map(m => m.id === med.id ? { ...m, taken_date: newDate, modified_by: memberId ?? null } : m));
      showToast(alreadyTaken ? 'Marked as not taken' : 'Marked as taken');
    }
  }, [memberId]);

  // Real hard delete, same as HealthTab.tsx's own deleteMed — stamps
  // deleted_by/notes first (an audit trail, in case a trigger/log reads it
  // before the row is gone) then removes the row. HealthTab.tsx's version
  // requires a typed removal reason via Alert.prompt; the Hub card's
  // existing confirm-only flow (MedicationsCard.tsx) doesn't collect one,
  // so this accepts an optional reason instead of forcing that UI onto a
  // quick Hub widget.
  const deleteMed = useCallback(async (id: string, reason?: string) => {
    await supabase.from('family_medications')
      .update({ deleted_by: memberId ?? null, notes: reason?.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    await supabase.from('family_medications').delete().eq('id', id);
    setMeds(prev => prev.filter(m => m.id !== id));
    showToast('Medication removed');
  }, [memberId]);

  return { meds, loadMeds, addMed, toggleMed, deleteMed };
}
