/**
 * Shared read-only appointment detail view.
 * Used inside the bottom sheet in both health.tsx and appointments.tsx.
 */
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Linking, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '@/lib/ThemeContext';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { showAlert } from '@/components/AppAlert';

export interface ApptDetailData {
  id: string;
  title?: string;
  appointment_type?: string;
  scheduled_at?: string;
  vet_name?: string;
  vet_phone?: string;
  clinic_name?: string;
  clinic_address?: string;
  cost?: number | string | null;
  recurrence?: string;
  notes?: string;
  visit_summary?: string;
  status?: string;
}

interface Props {
  appt: ApptDetailData;
  accent: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReschedule: (newIso: string) => void;
  onComplete: (summary: string) => void;
  onCancel: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[ss.row, { borderBottomColor: colors.border }]}>
      <Text style={[ss.label, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

function formatTime(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function AppointmentDetailView({
  appt, accent, canEdit,
  onClose, onEdit, onDelete, onReschedule, onComplete, onCancel,
}: Props) {
  const { colors } = useTheme();
  const { height: screenHeight } = useWindowDimensions();

  const [rescheduling, setRescheduling]           = useState(false);
  const [rescheduleDate, setRescheduleDate]         = useState('');
  const [pickerDate, setPickerDate]                 = useState(new Date());
  const [pickerMode, setPickerMode]                 = useState<'date' | 'time' | null>(null);
  const [showSummaryInput, setShowSummaryInput]     = useState(false);
  const [summaryText, setSummaryText]               = useState('');

  const parsedDate = appt.scheduled_at
    ? (() => { try { return new Date(appt.scheduled_at!.replace(' ', 'T')); } catch { return null; } })()
    : null;

  return (
    <>
      <ScrollView
        style={{ maxHeight: screenHeight * 0.52 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        {/* Date & time */}
        <Row label="Date & time">
          <Text style={[ss.value, { color: colors.textPrimary }]}>
            {parsedDate && !isNaN(parsedDate.getTime())
              ? `${format(parsedDate, 'EEE, MMM d, yyyy')} · ${formatTime(parsedDate)}`
              : appt.scheduled_at ?? '—'}
          </Text>
        </Row>

        {/* Type */}
        {appt.appointment_type ? (
          <Row label="Type">
            <Text style={[ss.value, { color: colors.textPrimary, textTransform: 'capitalize' }]}>
              {appt.appointment_type}
            </Text>
          </Row>
        ) : null}

        {/* Title */}
        {appt.title ? (
          <Row label="Title">
            <Text style={[ss.value, { color: colors.textPrimary }]}>{appt.title}</Text>
          </Row>
        ) : null}

        {/* Vet */}
        {appt.vet_name ? (
          <Row label="Vet">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[ss.value, { color: colors.textPrimary, flex: 1 }]}>{appt.vet_name}</Text>
              {appt.vet_phone ? (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${appt.vet_phone}`)}
                  style={[ss.chip, { backgroundColor: colors.successLight }]}>
                  <Ionicons name="call-outline" size={13} color={colors.success} />
                  <Text style={{ fontSize: 13, color: colors.success, fontWeight: '700' }}>Call</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {appt.vet_phone ? <Text style={[ss.sub, { color: colors.textSecondary }]}>{appt.vet_phone}</Text> : null}
          </Row>
        ) : null}

        {/* Clinic */}
        {appt.clinic_name ? (
          <Row label="Clinic">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[ss.value, { color: colors.textPrimary, flex: 1 }]}>{appt.clinic_name}</Text>
              {appt.clinic_address ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`maps://?q=${encodeURIComponent(appt.clinic_address!)}`).catch(() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(appt.clinic_address!)}`))}
                  style={[ss.chip, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="map-outline" size={13} color={colors.primaryText ?? colors.primary} />
                  <Text style={{ fontSize: 13, color: colors.primaryText ?? colors.primary, fontWeight: '700' }}>Map</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {appt.clinic_address ? <Text style={[ss.sub, { color: colors.textSecondary }]}>{appt.clinic_address}</Text> : null}
          </Row>
        ) : null}

        {/* Cost */}
        {appt.cost != null && appt.cost !== '' ? (
          <Row label="Cost">
            <Text style={[ss.value, { color: colors.textPrimary }]}>${Number(appt.cost).toFixed(2)}</Text>
          </Row>
        ) : null}

        {/* Recurrence */}
        {appt.recurrence && appt.recurrence !== 'none' ? (
          <Row label="Repeat">
            <Text style={[ss.value, { color: colors.textPrimary, textTransform: 'capitalize' }]}>{appt.recurrence}</Text>
          </Row>
        ) : null}

        {/* Notes */}
        {appt.notes ? (
          <Row label="Notes">
            <Text style={[ss.value, { color: colors.textPrimary }]}>{appt.notes}</Text>
          </Row>
        ) : null}

        {/* Visit summary */}
        {appt.visit_summary ? (
          <Row label="Visit summary">
            <Text style={[ss.value, { color: colors.textPrimary }]}>{appt.visit_summary}</Text>
          </Row>
        ) : null}

        {/* Status */}
        <Row label="Status">
          <Text style={[ss.value, { textTransform: 'capitalize',
            color: appt.status === 'completed' ? colors.success
              : appt.status === 'cancelled' ? colors.danger
              : accent }]}>
            {appt.status ?? 'upcoming'}
          </Text>
        </Row>

        {/* Status actions */}
        {canEdit && (
          rescheduling ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={[ss.label, { color: colors.textSecondary }]}>New date & time</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[ss.dateBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => { const b = rescheduleDate ? new Date(rescheduleDate.replace(' ', 'T')) : new Date(); setPickerDate(isNaN(b.getTime()) ? new Date() : b); setPickerMode('date'); }}>
                  <Ionicons name="calendar-outline" size={14} color={accent} />
                  <Text style={{ fontSize: 14, color: rescheduleDate ? colors.textPrimary : colors.textTertiary }}>
                    {rescheduleDate ? format(new Date(rescheduleDate.replace(' ', 'T')), 'MMM d, yyyy') : 'Select date'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ss.dateBtn, { flex: 0.7, borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => { const b = rescheduleDate ? new Date(rescheduleDate.replace(' ', 'T')) : new Date(); setPickerDate(isNaN(b.getTime()) ? new Date() : b); setPickerMode('time'); }}>
                  <Ionicons name="time-outline" size={14} color={accent} />
                  <Text style={{ fontSize: 14, color: rescheduleDate ? colors.textPrimary : colors.textTertiary }}>
                    {rescheduleDate ? formatTime(new Date(rescheduleDate.replace(' ', 'T'))) : 'Time'}
                  </Text>
                </TouchableOpacity>
              </View>
              <AppDateTimePicker
                visible={pickerMode !== null}
                value={pickerDate}
                mode={pickerMode === 'time' ? 'time' : 'date'}
                accent={accent}
                onCancel={() => setPickerMode(null)}
                onConfirm={(d) => {
                  setPickerDate(d);
                  const mode = pickerMode!;
                  setRescheduleDate(prev => mode === 'date'
                    ? `${format(d, 'yyyy-MM-dd')} ${prev.slice(11, 16) || '09:00'}`
                    : `${prev.slice(0, 10) || format(d, 'yyyy-MM-dd')} ${format(d, 'HH:mm')}`);
                  setPickerMode(null);
                }}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={[ss.actionBtn, { flex: 0.6, borderColor: colors.border }]}
                  onPress={() => { setRescheduling(false); setRescheduleDate(''); }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ss.actionBtn, { flex: 1, backgroundColor: accent + '18', borderColor: accent }]}
                  onPress={() => {
                    if (!rescheduleDate) { showAlert('Pick a date', 'Select a new date and time.'); return; }
                    const parsed = new Date(rescheduleDate.replace(' ', 'T'));
                    if (isNaN(parsed.getTime())) return;
                    setRescheduling(false); setRescheduleDate('');
                    onReschedule(parsed.toISOString());
                  }}>
                  <Ionicons name="calendar-outline" size={14} color={accent} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: accent }}>Confirm reschedule</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : showSummaryInput ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={[ss.label, { color: colors.textSecondary }]}>Visit summary (optional)</Text>
              <TextInput
                style={[ss.textarea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
                placeholder="Diagnosis, treatment, follow-up…"
                placeholderTextColor={colors.textTertiary}
                value={summaryText}
                onChangeText={setSummaryText}
                multiline
                textAlignVertical="top"
                autoFocus
                maxLength={1000}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[ss.actionBtn, { flex: 0.6, borderColor: colors.border }]}
                  onPress={() => { setShowSummaryInput(false); setSummaryText(''); }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ss.actionBtn, { flex: 1, backgroundColor: colors.successLight, borderColor: colors.success }]}
                  onPress={() => { setShowSummaryInput(false); onComplete(summaryText); setSummaryText(''); }}>
                  <Ionicons name="checkmark-circle-outline" size={15} color={colors.success} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.success }}>Save & Complete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 4 }}>
              <TouchableOpacity
                style={[ss.actionBtn, { flex: 1, backgroundColor: colors.successLight, borderColor: colors.success }]}
                onPress={() => showAlert('Mark as completed?', 'Add a quick visit summary (optional).', [
                  { text: 'Skip', onPress: () => onComplete('') },
                  { text: 'Add summary', onPress: () => { setSummaryText(''); setShowSummaryInput(true); } },
                ])}>
                <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.success }}>Completed</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ss.actionBtn, { flex: 1, backgroundColor: colors.warningLight ?? colors.primaryLight, borderColor: colors.warning ?? accent }]}
                onPress={() => { setRescheduleDate(''); setRescheduling(true); }}>
                <Ionicons name="calendar-outline" size={14} color={colors.warning ?? accent} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.warning ?? accent }}>Reschedule</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ss.actionBtn, { flex: 1, backgroundColor: colors.dangerLight, borderColor: colors.danger }]}
                onPress={onCancel}>
                <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger }}>Cancelled</Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[ss.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={[ss.footerBtn, { borderColor: colors.border, flex: 1 }]} onPress={onClose}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>Close</Text>
        </TouchableOpacity>
        {canEdit && (
          <TouchableOpacity style={[ss.footerBtn, { borderColor: colors.danger, flex: 0.7 }]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        )}
        {canEdit && (
          <TouchableOpacity style={[ss.footerBtn, { backgroundColor: accent, borderColor: accent, flex: 1.2 }]} onPress={onEdit}>
            <Ionicons name="pencil-outline" size={15} color="#fff" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

const ss = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  value: {
    fontSize: 15,
    fontWeight: '500',
  },
  sub: {
    fontSize: 13,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    height: 88,
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
  },
});
