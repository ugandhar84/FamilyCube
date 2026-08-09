import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Keyboard, Platform, StyleSheet, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addMonths, addYears } from 'date-fns';
import { parseDbTime } from '@/lib/dates';
import { useTheme } from '@/lib/ThemeContext';
import { saveAppointment, deleteAppointment, updateAppointmentStatus, rescheduleAppointment } from '@/lib/db/appointments';
import { formatTime } from '@/lib/units';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import BottomSheet from '@/components/BottomSheet';
import { showAlert } from '@/components/AppAlert';
import type { Appointment } from '@/lib/types';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

const APPT_TYPES = [
  { value: 'checkup',   label: 'Checkup',   emoji: '🩺' },
  { value: 'vaccine',   label: 'Vaccine',   emoji: '💉' },
  { value: 'dental',    label: 'Dental',    emoji: '🦷' },
  { value: 'surgery',   label: 'Surgery',   emoji: '⚕️' },
  { value: 'grooming',  label: 'Grooming',  emoji: '✂️' },
  { value: 'follow_up', label: 'Follow-up', emoji: '📋' },
  { value: 'other',     label: 'Other',     emoji: '📅' },
];


interface Props {
  visible: boolean;
  appointment: Appointment | null;
  canEdit?: boolean;
  accentColor?: string;
  onClose: () => void;
  onSaved?: (updated: Appointment) => void;
  onDeleted?: () => void;
  /** Called when a recurring appointment was auto-created (petId, payload) */
  onRecurrenceCreated?: (petId: string, payload: any) => void;
}

export default function AppointmentDetailSheet({
  visible, appointment, canEdit = true, accentColor, onClose, onSaved, onDeleted, onRecurrenceCreated,
}: Props) {
  const { colors } = useTheme();
  const accent = accentColor ?? colors.primary;
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [isViewMode, setIsViewMode] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle]               = useState('');
  const [apptType, setApptType]         = useState('checkup');
  const [vetName, setVetName]           = useState('');
  const [vetPhone, setVetPhone]         = useState('');
  const [clinicName, setClinicName]     = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [apptDate, setApptDate]         = useState('');
  const [notes, setNotes]               = useState('');
  const [visitSummary, setVisitSummary] = useState('');
  const [cost, setCost]                 = useState('');
  const [recurrence, setRecurrence]     = useState<'none' | 'monthly' | 'yearly'>('none');
  const [pickerMode, setPickerMode]         = useState<'date' | 'time' | null>(null);
  const [pickerDate, setPickerDate]         = useState(new Date());
  const [rescheduling, setRescheduling]     = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [reschedulePickerMode, setReschedulePickerMode] = useState<'date' | 'time' | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<{ title?: string; apptDate?: string }>({});

  useMemo(() => {
    if (appointment) {
      setTitle(appointment.title ?? '');
      setApptType(appointment.type ?? 'checkup');
      setVetName(appointment.vet_name ?? '');
      setVetPhone(appointment.vet_phone ?? '');
      setClinicName(appointment.clinic_name ?? '');
      setClinicAddress(appointment.clinic_address ?? '');
      const _dt = parseDbTime(appointment.scheduled_at);
      setApptDate(isNaN(_dt.getTime()) ? appointment.scheduled_at.slice(0, 16).replace('T', ' ') : `${format(_dt, 'yyyy-MM-dd')} ${format(_dt, 'HH:mm')}`);
      setNotes(appointment.notes ?? '');
      setVisitSummary(appointment.visit_summary ?? '');
      setCost(appointment.cost != null ? String(appointment.cost) : '');
      setRecurrence((appointment.recurrence as any) ?? 'none');
      setErrors({});
      setIsViewMode(true);
    }
  }, [appointment?.id]);

  const handleSave = async () => {
    if (!appointment) return;
    const newErrors: typeof errors = {};
    const trimTitle = title.trim();

    if (!trimTitle) {
      newErrors.title = 'Title is required';
    }
    if (!apptDate.trim()) {
      newErrors.apptDate = 'Date and time are required';
    } else {
      const parsed = new Date(apptDate.replace(' ', 'T'));
      if (isNaN(parsed.getTime())) {
        newErrors.apptDate = 'Invalid date format. Use: 2026-07-15 10:30';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const parsed = new Date(apptDate.replace(' ', 'T'));
    setSaving(true);
    try {
      const payload = {
        title: trimTitle,
        type: apptType,
        scheduled_at: parsed.toISOString(),
        vet_name: vetName.trim() || null,
        vet_phone: vetPhone.trim() || null,
        clinic_name: clinicName.trim() || null,
        clinic_address: clinicAddress.trim() || null,
        notes: notes.trim() || null,
        visit_summary: visitSummary.trim() || null,
        cost: cost.trim() ? parseFloat(cost) : null,
        remind_before_minutes: null,
        recurrence: recurrence === 'none' ? null : recurrence,
        status: appointment.status,
        duration_minutes: appointment.duration_minutes ?? 30,
        reminder_sent: appointment.reminder_sent,
        reminder_at: appointment.reminder_at,
        created_at: appointment.created_at,
      } as any;
      await saveAppointment(appointment.pet_id, payload, appointment.id);
      onSaved?.({ ...appointment, ...payload });
      setIsViewMode(true);
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Could not save appointment.');
    }
    setSaving(false);
  };

  const handleComplete = () => {
    if (!appointment) return;
    showAlert('Mark as completed?', 'Optionally add a visit summary.', [
      { text: 'Skip', onPress: () => doComplete('') },
      { text: 'Add summary', onPress: () => { setIsViewMode(false); } },
    ]);
  };

  const doComplete = async (summary: string) => {
    if (!appointment) return;
    try {
      await updateAppointmentStatus(appointment.id, 'completed', summary ? { visit_summary: summary } : undefined);
      const updated = { ...appointment, status: 'completed' as const, visit_summary: summary || appointment.visit_summary };
      onSaved?.(updated);
      // Recurrence
      if (appointment.recurrence === 'monthly' || appointment.recurrence === 'yearly') {
        const base = new Date(appointment.scheduled_at);
        const next = appointment.recurrence === 'monthly' ? addMonths(base, 1) : addYears(base, 1);
        const nextPayload = {
          title: appointment.title, type: appointment.type,
          scheduled_at: next.toISOString(),
          vet_name: appointment.vet_name, vet_phone: appointment.vet_phone,
          clinic_name: appointment.clinic_name, clinic_address: appointment.clinic_address,
          notes: appointment.notes, visit_summary: null, cost: null,
          remind_before_minutes: appointment.remind_before_minutes,
          recurrence: appointment.recurrence, status: 'upcoming',
          duration_minutes: appointment.duration_minutes ?? 30,
        };
        onRecurrenceCreated?.(appointment.pet_id, nextPayload);
      }
    } catch (e: any) { showAlert('Error', e.message); }
    onClose();
  };

  const handleDelete = () => {
    if (!appointment) return;
    showAlert('Delete appointment?', appointment.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteAppointment(appointment.id); onDeleted?.(); onClose(); }
        catch { showAlert('Error', 'Could not delete appointment.'); }
      }},
    ]);
  };

  const typeEmoji = APPT_TYPES.find(t => t.value === (appointment?.type ?? apptType))?.emoji ?? '📅';

  return (
    <BottomSheet
      visible={visible}
      onClose={() => { setPickerMode(null); setIsViewMode(true); onClose(); }}
      title={isViewMode ? 'Appointment details' : 'Edit appointment'}
      titleIcon={<Ionicons name="calendar-outline" size={16} color={accent} />}
      accent={accent}
    >
      {appointment && (
        isViewMode ? (
          <>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Type</Text>
                <Text style={s.viewValue}>{typeEmoji} {APPT_TYPES.find(t => t.value === appointment.type)?.label ?? appointment.type}</Text>
              </View>
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Date & time</Text>
                <Text style={s.viewValue}>
                  {(() => { const d = parseDbTime(appointment.scheduled_at); return isNaN(d.getTime()) ? appointment.scheduled_at : `${format(d, 'EEE, MMM d, yyyy')} · ${formatTime(d)}`; })()}
                </Text>
              </View>
              {appointment.vet_name ? (
                <View style={s.viewRow}>
                  <Text style={s.viewLabel}>Vet</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={[s.viewValue, { flex: 1 }]}>{appointment.vet_name}</Text>
                    {appointment.vet_phone ? (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${appointment.vet_phone}`)} style={[s.contactBtn, { backgroundColor: colors.successLight }]}>
                        <Ionicons name="call-outline" size={13} color={colors.success} />
                        <Text style={{ fontSize: 14, color: colors.success, fontWeight: '700' }}>Call</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {appointment.vet_phone ? <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 2 }}>{appointment.vet_phone}</Text> : null}
                </View>
              ) : null}
              {appointment.clinic_name ? (
                <View style={s.viewRow}>
                  <Text style={s.viewLabel}>Clinic</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={[s.viewValue, { flex: 1 }]}>{appointment.clinic_name}</Text>
                    {appointment.clinic_address ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`maps://?q=${encodeURIComponent(appointment.clinic_address!)}`).catch(() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(appointment.clinic_address!)}`))}
                        style={[s.contactBtn, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="map-outline" size={13} color={colors.primaryText ?? colors.primary} />
                        <Text style={{ fontSize: 14, color: colors.primaryText ?? colors.primary, fontWeight: '700' }}>Map</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {appointment.clinic_address ? <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 2 }}>{appointment.clinic_address}</Text> : null}
                </View>
              ) : null}
              {appointment.cost != null ? (
                <View style={s.viewRow}>
                  <Text style={s.viewLabel}>Cost</Text>
                  <Text style={s.viewValue}>${Number(appointment.cost).toFixed(2)}</Text>
                </View>
              ) : null}
              {appointment.recurrence && appointment.recurrence !== 'none' ? (
                <View style={s.viewRow}>
                  <Text style={s.viewLabel}>Repeat</Text>
                  <Text style={[s.viewValue, { textTransform: 'capitalize' }]}>{appointment.recurrence}</Text>
                </View>
              ) : null}
              {appointment.notes ? (
                <View style={s.viewRow}>
                  <Text style={s.viewLabel}>Notes</Text>
                  <Text style={s.viewValue}>{appointment.notes}</Text>
                </View>
              ) : null}
              {appointment.visit_summary ? (
                <View style={s.viewRow}>
                  <Text style={s.viewLabel}>Visit summary</Text>
                  <Text style={s.viewValue}>{appointment.visit_summary}</Text>
                </View>
              ) : null}
              <View style={s.viewRow}>
                <Text style={s.viewLabel}>Status</Text>
                <Text style={[s.viewValue, { textTransform: 'capitalize', color: appointment.status === 'completed' ? colors.success : appointment.status === 'cancelled' ? colors.danger : accent }]}>
                  {appointment.status ?? 'scheduled'}
                </Text>
              </View>
              {/* Status actions */}
              {canEdit && (
              rescheduling ? (
                <View style={{ marginBottom: 10, gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 }}>New date & time</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[s.input, s.dateBtn, { flex: 1 }]} onPress={() => { const b = rescheduleDate ? new Date(rescheduleDate.replace(' ', 'T')) : new Date(); setPickerDate(isNaN(b.getTime()) ? new Date() : b); setReschedulePickerMode('date'); }}>
                      <Ionicons name="calendar-outline" size={14} color={accent} />
                      <Text style={[s.dateBtnText, { color: rescheduleDate ? colors.textPrimary : colors.placeholder }]}>{rescheduleDate ? format(new Date(rescheduleDate.replace(' ', 'T')), 'MMM d, yyyy') : 'Select date'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.input, s.dateBtn, { flex: 0.7 }]} onPress={() => { const b = rescheduleDate ? new Date(rescheduleDate.replace(' ', 'T')) : new Date(); setPickerDate(isNaN(b.getTime()) ? new Date() : b); setReschedulePickerMode('time'); }}>
                      <Ionicons name="time-outline" size={14} color={accent} />
                      <Text style={[s.dateBtnText, { color: rescheduleDate ? colors.textPrimary : colors.placeholder }]}>{rescheduleDate ? formatTime(new Date(rescheduleDate.replace(' ', 'T'))) : 'Time'}</Text>
                    </TouchableOpacity>
                  </View>
                  <AppDateTimePicker
                    visible={reschedulePickerMode !== null}
                    value={pickerDate}
                    mode={reschedulePickerMode === 'time' ? 'time' : 'date'}
                    accent={accent}
                    onCancel={() => setReschedulePickerMode(null)}
                    onConfirm={(d) => {
                      setPickerDate(d);
                      const mode = reschedulePickerMode!;
                      setRescheduleDate(prev => mode === 'date'
                        ? `${format(d, 'yyyy-MM-dd')} ${prev.slice(11, 16) || '09:00'}`
                        : `${prev.slice(0, 10) || format(d, 'yyyy-MM-dd')} ${format(d, 'HH:mm')}`);
                      setReschedulePickerMode(null);
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[s.statusBtn, { flex: 0.6, borderColor: colors.border }]} onPress={() => { setRescheduling(false); setRescheduleDate(''); }}>
                      <Text style={[s.statusBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.statusBtn, { flex: 1, backgroundColor: accent + '18', borderColor: accent }]}
                      onPress={async () => {
                        if (!rescheduleDate) { showAlert('Pick a date', 'Select a new date and time.'); return; }
                        const parsed = new Date(rescheduleDate.replace(' ', 'T'));
                        if (isNaN(parsed.getTime())) return;
                        const iso = parsed.toISOString();
                        try { await rescheduleAppointment(appointment.id, iso); onSaved?.({ ...appointment, scheduled_at: iso, status: 'upcoming' }); } catch (e: any) { showAlert('Error', e.message); return; }
                        setRescheduling(false); setRescheduleDate(''); onClose();
                      }}>
                      <Ionicons name="calendar-outline" size={14} color={accent} />
                      <Text style={[s.statusBtnText, { color: accent }]}>Confirm reschedule</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  <TouchableOpacity style={[s.statusBtn, { backgroundColor: colors.successLight, borderColor: colors.success }]} onPress={handleComplete}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
                    <Text style={[s.statusBtnText, { color: colors.success }]}>Completed</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.statusBtn, { backgroundColor: colors.warningLight, borderColor: colors.warning }]} onPress={() => { setRescheduleDate(''); setRescheduling(true); }}>
                    <Ionicons name="calendar-outline" size={14} color={colors.warning} />
                    <Text style={[s.statusBtnText, { color: colors.warning }]}>Reschedule</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.statusBtn, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}
                    onPress={async () => {
                      try { await updateAppointmentStatus(appointment.id, 'cancelled'); onSaved?.({ ...appointment, status: 'cancelled' }); } catch {}
                      onClose();
                    }}>
                    <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                    <Text style={[s.statusBtnText, { color: colors.danger }]}>Cancelled</Text>
                  </TouchableOpacity>
                </View>
              )
            )}
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                <Text style={s.cancelText}>Close</Text>
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.danger ?? '#E53935', flex: 0.7 }]} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger ?? '#E53935'} />
                </TouchableOpacity>
              )}
              {canEdit && (
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }]} onPress={() => setIsViewMode(false)}>
                  <Ionicons name="pencil-outline" size={15} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={s.saveBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>

              {/* Type */}
              <Text style={s.label}>Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 }}>
                {APPT_TYPES.map(t => {
                  const sel = apptType === t.value;
                  return (
                    <TouchableOpacity key={t.value} onPress={() => setApptType(t.value)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, backgroundColor: sel ? accent + '22' : 'transparent', borderColor: sel ? accent : colors.border }}>
                      <Text style={{ fontSize: 14 }}>{t.emoji}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: sel ? accent : colors.textSecondary }}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Title */}
              <Text style={s.label}>Title *</Text>
              <TextInput style={[s.input, errors.title ? { borderColor: colors.danger ?? '#E53935' } : {}]} placeholder="Annual checkup, Vaccination…" placeholderTextColor={colors.placeholder} value={title} onChangeText={t => { setTitle(t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, '')); setErrors(e => ({ ...e, title: undefined })); }} returnKeyType="next" maxLength={100} />
              {errors.title && <Text style={{ fontSize: 12, color: colors.danger ?? '#E53935', marginTop: 4 }}>{errors.title}</Text>}

              {/* Date & time */}
              <Text style={s.label}>Date & time *</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.input, s.dateBtn, { flex: 1, borderColor: errors.apptDate ? colors.danger ?? '#E53935' : colors.border }]} onPress={() => { const b = apptDate ? new Date(apptDate.replace(' ', 'T')) : new Date(); setPickerDate(isNaN(b.getTime()) ? new Date() : b); setPickerMode('date'); setErrors(e => ({ ...e, apptDate: undefined })); }}>
                  <Ionicons name="calendar-outline" size={14} color={accent} />
                  <Text style={[s.dateBtnText, { color: apptDate ? colors.textPrimary : colors.placeholder }]}>
                    {apptDate ? format(new Date(apptDate.replace(' ', 'T')), 'MMM d, yyyy') : 'Select date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.input, s.dateBtn, { flex: 0.7, borderColor: errors.apptDate ? colors.danger ?? '#E53935' : colors.border }]} onPress={() => { const b = apptDate ? new Date(apptDate.replace(' ', 'T')) : new Date(); setPickerDate(isNaN(b.getTime()) ? new Date() : b); setPickerMode('time'); setErrors(e => ({ ...e, apptDate: undefined })); }}>
                  <Ionicons name="time-outline" size={14} color={accent} />
                  <Text style={[s.dateBtnText, { color: apptDate ? colors.textPrimary : colors.placeholder }]}>
                    {apptDate ? formatTime(new Date(apptDate.replace(' ', 'T'))) : 'Time'}
                  </Text>
                </TouchableOpacity>
              </View>
              {errors.apptDate && <Text style={{ fontSize: 12, color: colors.danger ?? '#E53935', marginTop: 4 }}>{errors.apptDate}</Text>}
              <AppDateTimePicker
                visible={pickerMode !== null}
                value={pickerDate}
                mode={pickerMode === 'time' ? 'time' : 'date'}
                accent={accent}
                onCancel={() => setPickerMode(null)}
                onConfirm={(d) => {
                  const mode = pickerMode!;
                  setPickerDate(d);
                  setApptDate(prev => mode === 'date'
                    ? `${format(d, 'yyyy-MM-dd')} ${prev.slice(11, 16) || '09:00'}`
                    : `${prev.slice(0, 10) || format(d, 'yyyy-MM-dd')} ${format(d, 'HH:mm')}`);
                  setPickerMode(null);
                }}
              />

              {/* Vet & phone */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Vet name</Text>
                  <TextInput style={s.input} placeholder="Dr. Smith" placeholderTextColor={colors.placeholder} value={vetName} onChangeText={t => setVetName(t.replace(/[^a-zA-Z\s\-'.]/g, ''))} returnKeyType="next" maxLength={80} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Phone</Text>
                  <TextInput style={s.input} placeholder="555-123-4567" placeholderTextColor={colors.placeholder} value={vetPhone} onChangeText={setVetPhone} keyboardType="phone-pad" returnKeyType="next" maxLength={20} />
                </View>
              </View>

              {/* Clinic & address */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Clinic</Text>
                  <TextInput style={s.input} placeholder="City Vet" placeholderTextColor={colors.placeholder} value={clinicName} onChangeText={t => setClinicName(t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, ''))} returnKeyType="next" maxLength={100} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Address</Text>
                  <LocationAutocompleteInput value={clinicAddress} onChangeText={setClinicAddress} placeholder="123 Main St" colors={colors} maxLength={150} />
                </View>
              </View>

              {/* Cost */}
              <Text style={s.label}>Cost ($)</Text>
              <TextInput style={s.input} placeholder="0.00" placeholderTextColor={colors.placeholder} value={cost} onChangeText={setCost} keyboardType="decimal-pad" returnKeyType="next" maxLength={10} />

              {/* Recurrence */}
              <Text style={s.label}>Repeat</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                {(['none', 'monthly', 'yearly'] as const).map(r => (
                  <TouchableOpacity key={r} onPress={() => setRecurrence(r)} style={{ flex: 1, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', borderColor: recurrence === r ? accent : colors.border, backgroundColor: recurrence === r ? accent + '22' : 'transparent' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: recurrence === r ? accent : colors.textSecondary, textTransform: 'capitalize' }}>{r === 'none' ? 'Once' : r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notes */}
              <Text style={s.label}>Notes</Text>
              <TextInput style={[s.input, s.textarea]} placeholder="Bring vaccination records, fasting required…" placeholderTextColor={colors.placeholder} value={notes} onChangeText={setNotes} multiline textAlignVertical="top" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} maxLength={500} />

              {/* Visit summary — only for completed */}
              {appointment.status === 'completed' && (
                <>
                  <Text style={s.label}>Visit summary</Text>
                  <TextInput style={[s.input, s.textarea, { height: 88 }]} placeholder="Diagnosis, treatment, follow-up instructions…" placeholderTextColor={colors.placeholder} value={visitSummary} onChangeText={setVisitSummary} multiline textAlignVertical="top" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} maxLength={1000} />
                </>
              )}

              {/* Status */}
              <Text style={s.label}>Status</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([
                  { value: 'completed', label: 'Completed', bg: colors.successLight, border: colors.success, text: colors.success },
                  { value: 'cancelled', label: 'Cancelled', bg: colors.dangerLight,  border: colors.danger,  text: colors.danger  },
                  { value: 'upcoming',  label: 'Upcoming',  bg: accent + '18', border: accent, text: accent },
                ] as const).map(opt => {
                  const sel = (appointment.status ?? 'upcoming') === opt.value;
                  return (
                    <View key={opt.value} style={[s.statusBadge, { backgroundColor: sel ? opt.bg : 'transparent', borderColor: sel ? opt.border : colors.border }]}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: sel ? opt.text : colors.textSecondary }}>{opt.label}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setIsViewMode(true)}>
                <Text style={s.cancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </>
        )
      )}
    </BottomSheet>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  label:       { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input:       { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 44, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background },
  textarea:    { height: 76, paddingTop: 11 },
  dateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtnText: { fontSize: 14, flex: 1 },
  footer:      { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cancelBtn:   { flex: 1, height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelText:  { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  saveBtn:     { flex: 2, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  viewRow:     { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  viewLabel:   { fontSize: 14, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  viewValue:   { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  contactBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  statusBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  statusBtnText: { fontSize: 14, fontWeight: '600' },
  statusBadge: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
});
