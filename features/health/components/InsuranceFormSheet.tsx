import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { makeStyles, type EditState } from './insuranceStyles';

type Styles = ReturnType<typeof makeStyles>;

interface InsuranceFormSheetProps {
  editing: EditState;
  setEditing: React.Dispatch<React.SetStateAction<EditState>>;
  s: Styles;
  accent: string;
  colors: any;
  pickerField: 'start_date' | 'end_date' | null;
  pickerDate: Date;
  parsingDoc: boolean;
  displayFileUri: string | undefined | null;
  openDatePicker: (field: 'start_date' | 'end_date') => void;
  setPickerField: React.Dispatch<React.SetStateAction<'start_date' | 'end_date' | null>>;
  pickPhoto: () => void;
  pickFromGallery: () => void;
  pickPDF: () => void;
  onDelete: () => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  uploadingFile: boolean;
}

export const InsuranceFormSheet = React.memo(function InsuranceFormSheet({
  editing, setEditing, s, accent, colors,
  pickerField, pickerDate, parsingDoc, displayFileUri,
  openDatePicker, setPickerField, pickPhoto, pickFromGallery, pickPDF,
  onDelete, onBack, onSave, saving, uploadingFile,
}: InsuranceFormSheetProps) {
  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>

        <Text style={s.inputLabel}>Provider *</Text>
        <TextInput style={s.input}
          placeholder="e.g. Healthy Paws, Trupanion"
          placeholderTextColor={colors.placeholder}
          value={editing.provider ?? ''}
          onChangeText={(t) => setEditing((p) => ({ ...p, provider: t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, '') }))}
          maxLength={100} />

        <Text style={s.inputLabel}>Policy number</Text>
        <TextInput style={s.input}
          placeholder="e.g. HP-2024-88213"
          placeholderTextColor={colors.placeholder}
          value={editing.policy_number ?? ''}
          onChangeText={(t) => setEditing((p) => ({ ...p, policy_number: t.replace(/[^a-zA-Z0-9\-]/g, '').toUpperCase() }))}
          maxLength={50} />

        <Text style={s.inputLabel}>Coverage type</Text>
        <TextInput style={s.input}
          placeholder="e.g. Accident & illness, Wellness add-on"
          placeholderTextColor={colors.placeholder}
          value={editing.coverage_type ?? ''}
          onChangeText={(t) => setEditing((p) => ({ ...p, coverage_type: t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, '') }))}
          maxLength={100} />

        <Text style={s.inputLabel}>Monthly premium</Text>
        <TextInput style={s.input}
          placeholder="e.g. 42.50"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.placeholder}
          value={editing.premium_amount != null ? String(editing.premium_amount) : ''}
          onChangeText={(t) => setEditing((p) => ({ ...p, premium_amount: t.trim() ? parseFloat(t) : null }))} />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.inputLabel}>Deductible</Text>
            <TextInput style={s.input}
              placeholder="250"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.placeholder}
              value={editing.deductible != null ? String(editing.deductible) : ''}
              onChangeText={(t) => setEditing((p) => ({ ...p, deductible: t.trim() ? parseFloat(t) : null }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.inputLabel}>Reimbursement %</Text>
            <TextInput style={s.input}
              placeholder="90"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.placeholder}
              value={editing.reimbursement_percent != null ? String(editing.reimbursement_percent) : ''}
              onChangeText={(t) => setEditing((p) => ({ ...p, reimbursement_percent: t.trim() ? parseFloat(t) : null }))} />
          </View>
        </View>

        <Text style={s.inputLabel}>Annual limit</Text>
        <TextInput style={s.input}
          placeholder="e.g. 5000"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.placeholder}
          value={editing.annual_limit != null ? String(editing.annual_limit) : ''}
          onChangeText={(t) => setEditing((p) => ({ ...p, annual_limit: t.trim() ? parseFloat(t) : null }))} />

        <Text style={s.inputLabel}>Claims phone</Text>
        <TextInput style={s.input}
          placeholder="e.g. (855) 555-0100"
          keyboardType="phone-pad"
          placeholderTextColor={colors.placeholder}
          value={editing.claims_phone ?? ''}
          onChangeText={(t) => setEditing((p) => ({ ...p, claims_phone: t }))}
          maxLength={20} />

        <Text style={s.inputLabel}>Start date</Text>
        <TouchableOpacity style={s.dateRow} onPress={() => openDatePicker('start_date')}>
          <Ionicons name="calendar-outline" size={18} color={accent} />
          <Text style={[s.dateText, !editing.start_date && { color: colors.placeholder }]}>
            {editing.start_date ? format(parseISO(editing.start_date), 'MMMM d, yyyy') : 'Select date'}
          </Text>
          {editing.start_date && (
            <TouchableOpacity onPress={() => setEditing((p) => ({ ...p, start_date: '' }))} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <Text style={s.inputLabel}>End / renewal date</Text>
        <TouchableOpacity style={s.dateRow} onPress={() => openDatePicker('end_date')}>
          <Ionicons name="calendar-outline" size={18} color={accent} />
          <Text style={[s.dateText, !editing.end_date && { color: colors.placeholder }]}>
            {editing.end_date ? format(parseISO(editing.end_date), 'MMMM d, yyyy') : 'Select date'}
          </Text>
          {editing.end_date && (
            <TouchableOpacity onPress={() => setEditing((p) => ({ ...p, end_date: '' }))} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <AppDateTimePicker
          visible={pickerField !== null}
          value={pickerDate}
          mode="date"
          minimumDate={pickerField === 'end_date' && editing.start_date ? new Date(editing.start_date) : undefined}
          accent={accent}
          onCancel={() => setPickerField(null)}
          onConfirm={(d) => {
            if (pickerField) setEditing((p) => ({ ...p, [pickerField]: format(d, 'yyyy-MM-dd') }));
            setPickerField(null);
          }}
        />

        <Text style={s.inputLabel}>Policy document</Text>
        {parsingDoc && (
          <View style={[s.filePreview, { borderColor: accent + '40', backgroundColor: accent + '0D', marginBottom: 8 }]}>
            <ActivityIndicator size="small" color={accent} />
            <Text style={[s.fileText, { color: accent }]}>Reading document with AI…</Text>
          </View>
        )}
        {displayFileUri ? (
          <View style={[s.filePreview, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
            <Ionicons name={editing.fileMime?.includes('pdf') ? 'document-outline' : 'image-outline'} size={20} color={accent} />
            <Text style={s.fileText} numberOfLines={1}>
              {editing.fileName ?? (editing.fileMime?.includes('pdf') ? 'Policy document (PDF)' : 'Policy photo attached')}
            </Text>
            {editing.file_url && !editing.fileUri && (
              <TouchableOpacity onPress={() => Linking.openURL(editing.file_url!)}>
                <Ionicons name="eye-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setEditing(p => ({ ...p, fileUri: undefined, file_url: undefined, fileName: undefined }))}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.fileBtn, { borderColor: colors.inputBorder }]} onPress={pickPhoto}>
              <Ionicons name="camera-outline" size={18} color={accent} />
              <Text style={s.fileBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.fileBtn, { borderColor: colors.inputBorder }]} onPress={pickFromGallery}>
              <Ionicons name="images-outline" size={18} color={accent} />
              <Text style={s.fileBtnText}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.fileBtn, { borderColor: colors.inputBorder }]} onPress={pickPDF}>
              <Ionicons name="document-outline" size={18} color={accent} />
              <Text style={s.fileBtnText}>PDF</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.inputLabel}>Notes</Text>
        <TextInput style={[s.input, { height: 72, paddingTop: 12 }]}
          multiline
          placeholder="Deductible, reimbursement %, exclusions, etc."
          placeholderTextColor={colors.placeholder}
          value={editing.notes ?? ''}
          onChangeText={(t) => setEditing((p) => ({ ...p, notes: t }))}
          maxLength={500} />

        {editing.id && (
          <TouchableOpacity style={s.deleteBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
            <Text style={[s.deleteBtnText, { color: colors.danger }]}>Delete this policy</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.cancelBtn} onPress={onBack}>
          <Text style={s.cancelText}>{editing.id ? 'Back' : 'Cancel'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }, (saving || uploadingFile) && { opacity: 0.7 }]}
          onPress={onSave} disabled={saving || uploadingFile}>
          {(saving || uploadingFile)
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </>
  );
});
