/**
 * useAppointmentForm — all appointment modal state and handlers.
 */
import { useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { showAlert } from '@/components/AppAlert';
import { saveAppointment, deleteAppointment } from '@/lib/db';
import { useVoiceAppointment, type ParsedAppointment } from '@/lib/hooks/useVoiceAppointment';
import { parseDbTime } from '@/lib/dates';
import type { TLEvent } from '@/features/health/components/HealthUtils';

interface Options {
  activePetId:      string | null | undefined;
  activePet:        any;
  voiceApptEnabled: boolean;
  tier:             string;
  petsCount:        number;
  onSaved:          () => void;
  setActivePet:     (id: string) => void;
}

export function useAppointmentForm({
  activePetId, activePet, voiceApptEnabled, tier, petsCount, onSaved, setActivePet,
}: Options) {
  const [apptModal,      setApptModal]      = useState(false);
  const [apptData,       setApptData]       = useState<Record<string, any> | null>(null);
  const [isApptViewMode, setIsApptViewMode] = useState(true);
  const [apptInputSheet, setApptInputSheet] = useState(false);
  const [voiceReview,    setVoiceReview]    = useState<ParsedAppointment | null>(null);
  const [apptPetId,      setApptPetId]      = useState<string | null>(null);
  const [pickerMode,     setPickerMode]     = useState<'date' | 'time' | 'med_start_date' | 'med_end_date' | null>(null);
  const [pickerDate,     setPickerDate]     = useState(new Date());
  const [saving,         setSaving]         = useState(false);
  const apptOrigRef = useRef<Record<string, any> | null>(null);

  const voice = useVoiceAppointment((parsed: ParsedAppointment) => {
    setVoiceReview(parsed);
  });

  const switchToPetIfNeeded = useCallback(() => {
    if (apptPetId && apptPetId !== activePetId) setActivePet(apptPetId);
  }, [apptPetId, activePetId, setActivePet]);

  const openAddAppt = useCallback(() => {
    const canVoice = voiceApptEnabled && tier === 'ultimate';
    if (canVoice || petsCount > 1) {
      setApptPetId(activePetId ?? null);
      setVoiceReview(null);
      setApptInputSheet(true);
    } else {
      setIsApptViewMode(false);
      setApptData({ type: 'checkup', status: 'upcoming' });
      setApptModal(true);
    }
  }, [voiceApptEnabled, tier, petsCount, activePetId]);

  const saveAppt = useCallback(async () => {
    if (!apptData?.title?.trim() || !apptData?.scheduled_at || !activePetId) {
      showAlert('Required', 'Title and date are required.'); return;
    }
    const parsedAppt = new Date(apptData.scheduled_at.trim().replace(' ', 'T'));
    if (isNaN(parsedAppt.getTime())) { showAlert('Invalid date'); return; }
    const iso = parsedAppt.toISOString();
    setSaving(true);
    const payload = {
      title: apptData.title.trim(),
      type: apptData.type ?? 'checkup',
      scheduled_at: iso,
      vet_name: apptData.vet_name ?? null,
      vet_phone: apptData.vet_phone?.trim() || null,
      clinic_name: apptData.clinic_name ?? null,
      clinic_address: apptData.clinic_address?.trim() || null,
      notes: apptData.notes ?? null,
      visit_summary: apptData.visit_summary?.trim() || null,
      status: (apptData.status ?? 'upcoming') as any,
      duration_minutes: 30,
      remind_before_minutes: null,
      recurrence: apptData.recurrence ?? null,
      cost: apptData.cost != null && apptData.cost !== '' ? parseFloat(apptData.cost) : null,
    };
    try {
      await saveAppointment(activePetId, payload, apptData.id);
    } catch (err: any) {
      setSaving(false); showAlert('Error', err.message); return;
    }
    setSaving(false);
    setApptModal(false); setApptData(null);
    onSaved();

    if (!apptData.id) {
      showAlert('Add to Calendar?', 'Would you like to add this appointment to your device calendar?', [
        { text: 'Skip', style: 'cancel' },
        {
          text: 'Add to Calendar',
          onPress: async () => {
            const { addAppointmentToCalendar } = await import('@/lib/calendarSync');
            const added = await addAppointmentToCalendar({
              title: payload.title, scheduledAt: payload.scheduled_at,
              durationMinutes: payload.duration_minutes, vetName: payload.vet_name,
              clinicName: payload.clinic_name, clinicAddress: payload.clinic_address,
              notes: payload.notes, petName: activePet?.name,
            });
            if (added) showAlert('Added!', 'Appointment saved to your calendar.');
          },
        },
      ]);
    }
  }, [apptData, activePetId, activePet, onSaved]);

  const deleteAppt = useCallback((id: string) => {
    showAlert('Remove appointment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deleteAppointment(id); onSaved(); }
        catch (e: any) { showAlert('Error', e?.message ?? 'Could not remove appointment.'); }
      }},
    ]);
  }, [onSaved]);

  const confirmVoiceReview = useCallback(async () => {
    if (!voiceReview || !activePetId) return;
    switchToPetIfNeeded();
    let scheduledAtISO = voiceReview.scheduled_at ?? '';
    if (scheduledAtISO && !scheduledAtISO.includes('T')) {
      const parsed = new Date(scheduledAtISO.replace(' ', 'T'));
      if (!isNaN(parsed.getTime())) scheduledAtISO = parsed.toISOString();
    }
    try {
      await saveAppointment(activePetId, {
        title: voiceReview.title ?? 'Appointment',
        type: (voiceReview.type ?? 'checkup') as any,
        scheduled_at: scheduledAtISO || new Date().toISOString(),
        vet_name: voiceReview.vet_name ?? null,
        vet_phone: null,
        clinic_name: voiceReview.clinic_name ?? null,
        clinic_address: voiceReview.clinic_address ?? null,
        notes: voiceReview.notes ?? null,
        status: 'upcoming' as const,
        remind_before_minutes: null,
        recurrence: null,
        cost: null,
        visit_summary: null,
      } as any);
      showAlert('✅ Saved!', `${voiceReview.title ?? 'Appointment'} added successfully.`);
      setVoiceReview(null); setApptInputSheet(false);
      onSaved();
    } catch (e: any) { showAlert('Error', e.message ?? 'Could not save appointment.'); }
  }, [voiceReview, activePetId, switchToPetIfNeeded, onSaved]);

  const onPressApptTimeline = useCallback((ev: TLEvent) => {
    const dt = parseDbTime(ev.raw.scheduled_at ?? '');
    const loc = isNaN(dt.getTime())
      ? (ev.raw.scheduled_at ?? '').slice(0, 16).replace('T', ' ')
      : `${format(dt, 'yyyy-MM-dd')} ${format(dt, 'HH:mm')}`;
    const d = { ...ev.raw, scheduled_at: loc };
    apptOrigRef.current = d; setApptData(d); setIsApptViewMode(true);
    setTimeout(() => setApptModal(true), 0);
  }, []);

  const confirmPicker = useCallback(() => {
    const existing = apptData?.scheduled_at ?? '';
    if (pickerMode === 'date') {
      setApptData(p => ({ ...p, scheduled_at: `${format(pickerDate, 'yyyy-MM-dd')} ${existing.slice(11, 16) || '09:00'}` }));
    } else if (pickerMode === 'time') {
      setApptData(p => ({ ...p, scheduled_at: `${existing.slice(0, 10) || format(pickerDate, 'yyyy-MM-dd')} ${format(pickerDate, 'HH:mm')}` }));
    }
    setPickerMode(null);
  }, [pickerMode, pickerDate, apptData]);

  return {
    apptModal, setApptModal,
    apptData, setApptData,
    isApptViewMode, setIsApptViewMode,
    apptInputSheet, setApptInputSheet,
    voiceReview, setVoiceReview,
    apptPetId, setApptPetId,
    pickerMode, setPickerMode,
    pickerDate, setPickerDate,
    saving, setSaving,
    apptOrigRef,
    voice,
    openAddAppt, saveAppt, deleteAppt, confirmVoiceReview,
    onPressApptTimeline, confirmPicker,
  };
}
