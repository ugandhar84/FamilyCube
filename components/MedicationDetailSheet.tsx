import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Keyboard, Platform, Modal, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '@/lib/ThemeContext';
import { saveMedication, deleteMedication } from '@/lib/db';
import { showAlert } from '@/components/AppAlert';
import BottomSheet from '@/components/BottomSheet';
import type { Medication } from '@/lib/db/medications';

const FREQ_OPTS = ['once', 'daily', 'twice_daily', 'weekly', 'as_needed'] as const;
type Freq = typeof FREQ_OPTS[number];

interface Props {
  visible: boolean;
  medication: Medication | null;
  petId: string | null;
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: (updated: Medication) => void;
  onDeleted?: () => void;
}

export default function MedicationDetailSheet({ visible, medication, petId, canEdit = true, onClose, onSaved, onDeleted }: Props) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [isViewMode, setIsViewMode] = useState(true);

  // Form state
  const [name, setName]         = useState('');
  const [dosage, setDosage]     = useState('');
  const [frequency, setFrequency] = useState<Freq>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]   = useState('');
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [pickerField, setPickerField] = useState<'start' | 'end' | null>(null);
  const [pickerDate, setPickerDate]   = useState(new Date());

  useMemo(() => {
    if (medication) {
      setName(medication.name ?? '');
      setDosage(medication.dosage ?? '');
      setFrequency((FREQ_OPTS.includes(medication.frequency as Freq) ? medication.frequency : 'daily') as Freq);
      setStartDate(medication.start_date ?? '');
      setEndDate(medication.end_date ?? '');
      setIsActive(medication.is_active ?? true);
      setNotes(medication.notes ?? '');
      setIsViewMode(true);
    }
  }, [medication?.id]);

  const handleSave = async () => {
    if (!medication || !petId) return;
    if (!name.trim()) { showAlert('Required', 'Medication name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        dosage: dosage.trim() || null,
        frequency,
        start_date: startDate || null,
        end_date: endDate || null,
        is_active: isActive,
        notes: notes.trim() || null,
      } as Omit<Medication, 'id' | 'pet_id' | 'created_at'>;
      await saveMedication(petId, payload, medication.id);
      onSaved?.({ ...medication, ...payload });
      setIsViewMode(true);
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Could not save medication.');
    }
    setSaving(false);
  };

  const handleDelete = () => {
    if (!medication) return;
    showAlert('Delete medication?', medication.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteMedication(medication.id);
            onDeleted?.();
            onClose();
          } catch {
            showAlert('Error', 'Could not delete medication.');
          }
        },
      },
    ]);
  };

  const handleClose = () => { setPickerField(null); onClose(); };

  const openPicker = (field: 'start' | 'end') => {
    Keyboard.dismiss();
    const val = field === 'start' ? startDate : endDate;
    const base = val ? new Date(val) : new Date();
    setPickerDate(isNaN(base.getTime()) ? new Date() : base);
    setPickerField(field);
  };

  const applyPicker = (d: Date) => {
    const str = format(d, 'yyyy-MM-dd');
    if (pickerField === 'start') setStartDate(str);
    else if (pickerField === 'end') setEndDate(str);
    setPickerField(null);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isViewMode ? 'Medication details' : medication?.id ? 'Edit medication' : 'Add medication'}
      titleIcon={<Ionicons name="medical-outline" size={16} color={colors.primaryText ?? colors.primary} />}
      accent={colors.primary}
    >
      {medication && (
        isViewMode ? (
          <>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Hero header */}
              <View style={[s.hero, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' }]}>
                <View style={[s.heroIcon, { backgroundColor: colors.primary + '22' }]}>
                  <Ionicons name="medical" size={22} color={colors.primaryText ?? colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.heroName, { color: colors.textPrimary }]}>{medication.name}</Text>
                  {medication.dosage ? <Text style={[s.heroDose, { color: colors.textSecondary }]}>{medication.dosage}</Text> : null}
                </View>
                <View style={[s.statusPill, { backgroundColor: medication.is_active ? colors.success + '20' : colors.card, borderColor: medication.is_active ? colors.success + '50' : colors.border }]}>
                  <View style={[s.statusDot, { backgroundColor: medication.is_active ? colors.success : colors.textSecondary }]} />
                  <Text style={[s.statusText, { color: medication.is_active ? colors.success : colors.textSecondary }]}>
                    {medication.is_active ? 'Active' : 'Stopped'}
                  </Text>
                </View>
              </View>

              {/* Frequency chip */}
              {medication.frequency ? (
                <View style={s.chipRow}>
                  <View style={[s.chip, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
                    <Ionicons name="repeat-outline" size={13} color={colors.primaryText ?? colors.primary} />
                    <Text style={[s.chipText, { color: colors.primaryText ?? colors.primary }]}>
                      {medication.frequency.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Date range */}
              {(medication.start_date || medication.end_date) ? (
                <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    {medication.start_date ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[s.infoLabel, { color: colors.textTertiary }]}>Start</Text>
                        <Text style={[s.infoValue, { color: colors.textPrimary }]}>{format(new Date(medication.start_date), 'MMM d, yyyy')}</Text>
                      </View>
                    ) : null}
                    {medication.end_date ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[s.infoLabel, { color: colors.textTertiary }]}>End</Text>
                        <Text style={[s.infoValue, { color: colors.textPrimary }]}>{format(new Date(medication.end_date), 'MMM d, yyyy')}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* Notes */}
              {medication.notes ? (
                <View style={[s.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[s.notesLabel, { color: colors.textTertiary }]}>NOTES</Text>
                  <Text style={[s.notesText, { color: colors.textPrimary }]}>{medication.notes}</Text>
                </View>
              ) : null}
            </ScrollView>
            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
                <Text style={s.cancelText}>Close</Text>
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.danger ?? '#E53935', flex: 0.7 }]} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger ?? '#E53935'} />
                </TouchableOpacity>
              )}
              {canEdit && (
                <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={() => setIsViewMode(false)}>
                  <Ionicons name="pencil-outline" size={15} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={s.saveBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <Text style={s.label}>Name *</Text>
              <TextInput style={s.input} placeholder="Carprofen, Apoquel…" placeholderTextColor={colors.placeholder} value={name} onChangeText={t => setName(t.replace(/[^a-zA-Z0-9\s\-'.]/g, ''))} maxLength={100} />

              <Text style={s.label}>Dosage</Text>
              <TextInput style={s.input} placeholder="25mg" placeholderTextColor={colors.placeholder} value={dosage} onChangeText={t => setDosage(t.replace(/[^a-zA-Z0-9\s./]/g, ''))} maxLength={50} />

              <Text style={s.label}>Frequency</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {FREQ_OPTS.map(f => {
                  const sel = frequency === f;
                  return (
                    <TouchableOpacity key={f}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary + '14' : colors.background }}
                      onPress={() => setFrequency(f)}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: sel ? colors.primary : colors.textSecondary }}>{f.replace('_', ' ')}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['start', 'end'] as const).map(field => (
                  <View key={field} style={{ flex: 1 }}>
                    <Text style={s.label}>{field === 'start' ? 'Start date' : 'End date'}</Text>
                    <TouchableOpacity style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => openPicker(field)}>
                      <Ionicons name="calendar-outline" size={13} color={colors.primaryText ?? colors.primary} />
                      <Text style={{ fontSize: 15, color: (field === 'start' ? startDate : endDate) ? colors.textPrimary : colors.placeholder }}>
                        {(field === 'start' ? startDate : endDate) ? format(new Date(field === 'start' ? startDate : endDate), 'MMM d, yyyy') : 'Pick date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {pickerField !== null && (
                Platform.OS === 'ios' ? (
                  <Modal transparent animationType="slide" visible onRequestClose={() => setPickerField(null)}>
                    <View style={{ flex: 1 }}>
                      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPickerField(null)} />
                      <View style={[s.pickerSheet, { backgroundColor: colors.card }]}>
                        <View style={s.pickerHead}>
                          <TouchableOpacity onPress={() => setPickerField(null)}><Text style={{ fontSize: 15, color: colors.textSecondary }}>Cancel</Text></TouchableOpacity>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>Select date</Text>
                          <TouchableOpacity onPress={() => applyPicker(pickerDate)}><Text style={{ fontSize: 15, fontWeight: '700', color: colors.primaryText ?? colors.primary }}>Done</Text></TouchableOpacity>
                        </View>
                        <DateTimePicker value={pickerDate} mode="date" display="spinner" themeVariant={isDark ? 'dark' : 'light'}
                          onChange={(_, d) => { if (d) setPickerDate(d); }} style={{ width: '100%' }} />
                      </View>
                    </View>
                  </Modal>
                ) : (
                  <DateTimePicker value={pickerDate} mode="date" display="default"
                    onChange={(_, d) => { if (d) applyPicker(d); }} />
                )
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {[{ val: true, label: '🟢 Active' }, { val: false, label: '⚫ Stopped' }].map(opt => {
                  const sel = isActive === opt.val;
                  return (
                    <TouchableOpacity key={String(opt.val)}
                      style={{ flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary + '12' : colors.background, alignItems: 'center' }}
                      onPress={() => setIsActive(opt.val)}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: sel ? colors.primary : colors.textSecondary }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>Notes</Text>
              <TextInput style={[s.input, s.textarea]} placeholder="Reason, instructions…" placeholderTextColor={colors.placeholder} value={notes} onChangeText={setNotes} multiline textAlignVertical="top" maxLength={500} />
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => medication.id ? setIsViewMode(true) : handleClose()}>
                <Text style={s.cancelText}>{medication.id ? 'Back' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
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
  label:      { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input:      { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 44, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background },
  textarea:   { height: 76, paddingTop: 11 },
  pickerSheet:{ borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  footer:     { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cancelBtn:  { flex: 1, height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  saveBtn:    { flex: 2, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  saveBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
  viewRow:    { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  viewLabel:  { fontSize: 14, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  viewValue:  { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  hero:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  heroIcon:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroName:   { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  heroDose:   { fontSize: 14, fontWeight: '500' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText:   { fontSize: 13, fontWeight: '600' },
  infoCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  infoLabel:  { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, width: 36 },
  infoValue:  { fontSize: 14, fontWeight: '500' },
  notesCard:  { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 4 },
  notesLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  notesText:  { fontSize: 14, fontWeight: '400', lineHeight: 20 },
});
