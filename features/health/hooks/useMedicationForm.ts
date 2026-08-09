/**
 * useMedicationForm — medication modal state and handlers.
 */
import { useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { showAlert } from '@/components/AppAlert';
import { saveMedication, toggleMedActive } from '@/lib/db';
import type { Medication } from '@/lib/types';
import type { TLEvent } from '@/features/health/components/HealthUtils';

interface Options {
  activePetId: string | null | undefined;
  setMeds:     React.Dispatch<React.SetStateAction<Medication[]>>;
  onSaved:     () => void;
  setPickerMode: (m: 'date' | 'time' | 'med_start_date' | 'med_end_date' | null) => void;
  setPickerDate: (d: Date) => void;
  pickerMode:  'date' | 'time' | 'med_start_date' | 'med_end_date' | null;
  pickerDate:  Date;
}

export function useMedicationForm({
  activePetId, setMeds, onSaved, setPickerMode, setPickerDate, pickerMode, pickerDate,
}: Options) {
  const [medModal,      setMedModal]      = useState(false);
  const [medData,       setMedData]       = useState<Record<string, any> | null>(null);
  const [isMedViewMode, setIsMedViewMode] = useState(true);
  const [saving,        setSaving]        = useState(false);
  const medOrigRef = useRef<Record<string, any> | null>(null);

  const saveMed = useCallback(async () => {
    if (!medData?.name?.trim() || !activePetId) { showAlert('Required', 'Name required.'); return; }
    setSaving(true);
    const payload = {
      name: medData.name.trim(),
      dosage: medData.dosage?.trim() || null,
      frequency: medData.frequency ?? 'daily',
      start_date: medData.start_date || null,
      end_date: medData.end_date || null,
      is_active: medData.is_active ?? true,
      notes: medData.notes?.trim() || null,
    };
    try {
      await saveMedication(activePetId, payload as any, medData.id);
    } catch (err: any) {
      setSaving(false); showAlert('Error', err.message); return;
    }
    setSaving(false);
    setMedModal(false); setMedData(null);
    onSaved();
  }, [medData, activePetId, onSaved]);

  const onPressMedTimeline = useCallback((ev: TLEvent) => {
    const d = { ...ev.raw };
    medOrigRef.current = d; setMedData(d); setIsMedViewMode(true);
    setTimeout(() => setMedModal(true), 0);
  }, []);

  const onToggleMedActive = useCallback(async (id: string, newActive: boolean) => {
    setMeds(prev => prev.map(m => m.id === id ? { ...m, is_active: newActive } as Medication : m));
    try { await toggleMedActive(id, newActive); }
    catch (err: any) {
      setMeds(prev => prev.map(m => m.id === id ? { ...m, is_active: !newActive } as Medication : m));
      showAlert('Error', err.message ?? 'Could not update medication.');
    }
    onSaved();
  }, [setMeds, onSaved]);

  const confirmMedPicker = useCallback(() => {
    if (pickerMode === 'med_start_date') {
      setMedData((p: any) => ({ ...p, start_date: format(pickerDate, 'yyyy-MM-dd') }));
    } else if (pickerMode === 'med_end_date') {
      setMedData((p: any) => ({ ...p, end_date: format(pickerDate, 'yyyy-MM-dd') }));
    }
    setPickerMode(null);
  }, [pickerMode, pickerDate, setPickerMode]);

  return {
    medModal, setMedModal,
    medData, setMedData,
    isMedViewMode, setIsMedViewMode,
    saving, setSaving,
    medOrigRef,
    saveMed, onPressMedTimeline, onToggleMedActive, confirmMedPicker,
  };
}
