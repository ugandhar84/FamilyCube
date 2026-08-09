import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import BottomSheet from '@/components/BottomSheet';
import { TypeIcon } from './TypeIcon';
import { type EntryType, type JournalEntry, TYPE_LABEL, MEAL_EMOJI } from './journalTypes';
import { TYPO } from '@/constants/theme';

interface EntryFormSheetProps {
  addType: EntryType | null;
  editingEntry: JournalEntry | null;
  pet: any;
  selected: Date;
  accentColor: string;
  colors: any;
  typeColors: Record<EntryType, string>;
  saving: boolean;
  s: any;
  fTitle: string; setFTitle: (v: string) => void;
  fMealType: string; setFMealType: (v: string) => void;
  fAmount: string; setFAmount: (v: string) => void;
  fGroomType: string; setFGroomType: (v: string) => void;
  fNote: string; setFNote: (v: string) => void;
  fWeight: string; setFWeight: (v: string) => void;
  fClinic: string; setFClinic: (v: string) => void;
  fDiagnosis: string; setFDiagnosis: (v: string) => void;
  fPrivate: boolean; setFPrivate: (v: boolean | ((p: boolean) => boolean)) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: (entry: JournalEntry) => void;
}

export const EntryFormSheet = React.memo(function EntryFormSheet({
  addType, editingEntry, pet, selected, accentColor, colors, typeColors, saving, s,
  fTitle, setFTitle, fMealType, setFMealType, fAmount, setFAmount,
  fGroomType, setFGroomType, fNote, setFNote, fWeight, setFWeight,
  fClinic, setFClinic, fDiagnosis, setFDiagnosis, fPrivate, setFPrivate,
  onClose, onSave, onDelete,
}: EntryFormSheetProps) {
  return (
    <BottomSheet
      visible={!!addType}
      onClose={onClose}
      title={addType ? (editingEntry ? `Edit ${TYPE_LABEL[addType]}` : `Log ${TYPE_LABEL[addType]}`) : undefined}
      titleIcon={addType ? <TypeIcon type={addType} color={typeColors[addType]} size={18} /> : undefined}
      accent={addType ? typeColors[addType] : undefined}>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -8, marginBottom: 4 }}>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, flex: 1 }}>
          {pet.emoji} {pet.name} · {format(selected, 'MMM d')}
        </Text>
        {editingEntry && (
          <TouchableOpacity
            style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => { onClose(); setTimeout(() => onDelete(editingEntry), 200); }}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.entryDivider, { backgroundColor: colors.border }]} />

      <View style={{ paddingTop: 16, paddingBottom: 8 }}>
        {addType === 'note' && (
          <>
            <TextInput
              style={[s.entryInput, s.entryMulti, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
              placeholder={`What's on your mind about ${pet.name}?`}
              placeholderTextColor={colors.placeholder}
              value={fTitle} onChangeText={setFTitle}
              multiline textAlignVertical="top" maxLength={1000} />
            <TouchableOpacity
              style={[s.privacyToggleRow, { borderColor: fPrivate ? accentColor : colors.border, backgroundColor: fPrivate ? `${accentColor}10` : colors.inputBg }]}
              onPress={() => setFPrivate(v => !v)}>
              <View style={[s.privacyCheck, { borderColor: fPrivate ? accentColor : colors.border, backgroundColor: fPrivate ? accentColor : 'transparent' }]}>
                {fPrivate && <Ionicons name="checkmark" size={11} color="#fff" />}
              </View>
              <Ionicons name={fPrivate ? 'lock-closed' : 'lock-open-outline'} size={13} color={fPrivate ? accentColor : colors.textSecondary} />
              <Text style={{ fontSize: TYPO.body, color: fPrivate ? accentColor : colors.textSecondary, flex: 1 }}>
                {fPrivate ? 'Private — only you can see this' : 'Shared with family members'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {addType === 'meal' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
              {(['meal','breakfast','lunch','dinner','treat','water'] as const).map(t => (
                <TouchableOpacity key={t}
                  style={[s.mealChip, { backgroundColor: fMealType === t ? accentColor : colors.inputBg, borderColor: fMealType === t ? accentColor : colors.border }]}
                  onPress={() => setFMealType(t)}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: fMealType === t ? '#fff' : colors.textSecondary }}>
                    {MEAL_EMOJI[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {fMealType === 'water'
              ? <TextInput
                  style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                  placeholder="Amount in ml (optional) — e.g. 250"
                  placeholderTextColor={colors.placeholder}
                  value={fAmount} onChangeText={setFAmount} keyboardType="numeric" />
              : <>
                  <TextInput
                    style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                    placeholder={fMealType === 'treat' ? 'Treat type — e.g. Chicken bone' : 'Food / brand — e.g. Royal Canin'}
                    placeholderTextColor={colors.placeholder}
                    value={fTitle} onChangeText={t => setFTitle(t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, ''))} maxLength={100} />
                  <TextInput
                    style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary, marginTop: 10 }]}
                    placeholder={fMealType === 'treat' ? 'Amount — e.g. 2 pieces' : 'Amount — e.g. 150g'}
                    placeholderTextColor={colors.placeholder}
                    value={fAmount} onChangeText={setFAmount} keyboardType="numeric" />
                </>
            }
          </>
        )}

        {addType === 'grooming' && (
          <>
            <View style={s.groomGrid}>
              {[{ k:'bath',l:'🛁 Bath' },{ k:'trim',l:'✂️ Trim' },{ k:'nails',l:'💅 Nails' },{ k:'brush',l:'🪮 Brush' },{ k:'ear_clean',l:'👂 Ears' }].map(({ k, l }) => (
                <TouchableOpacity key={k}
                  style={[s.groomCell, { backgroundColor: fGroomType === k ? accentColor : colors.inputBg, borderColor: fGroomType === k ? accentColor : colors.border }]}
                  onPress={() => setFGroomType(k)}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: fGroomType === k ? '#fff' : colors.textSecondary }}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary, marginTop: 12 }]}
              placeholder="Notes — any observations… (optional)"
              placeholderTextColor={colors.placeholder}
              value={fNote} onChangeText={setFNote} maxLength={200} />
          </>
        )}

        {addType === 'weight' && (
          <>
            <TextInput
              style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary, fontSize: TYPO.hero, textAlign: 'center', fontWeight: '800', height: 64 }]}
              placeholder="0.0 kg" placeholderTextColor={colors.placeholder}
              value={fWeight} onChangeText={setFWeight} keyboardType="decimal-pad" />
            <TextInput
              style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary, marginTop: 10 }]}
              placeholder="Notes — any context… (optional)"
              placeholderTextColor={colors.placeholder}
              value={fNote} onChangeText={setFNote} />
          </>
        )}

        {addType === 'vet' && (
          <>
            <TextInput
              style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
              placeholder="Reason — e.g. Annual checkup, Vaccine *"
              placeholderTextColor={colors.placeholder}
              value={fTitle} onChangeText={t => setFTitle(t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, ''))} maxLength={100} />
            <TextInput
              style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary, marginTop: 10 }]}
              placeholder="Vet name — e.g. Dr. Smith (optional)"
              placeholderTextColor={colors.placeholder}
              value={fNote} onChangeText={t => setFNote(t.replace(/[^\p{L}\s\-'.]/gu, ''))} maxLength={80} />
            <TextInput
              style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary, marginTop: 10 }]}
              placeholder="Clinic — e.g. City Animal Clinic (optional)"
              placeholderTextColor={colors.placeholder}
              value={fClinic} onChangeText={t => setFClinic(t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, ''))} maxLength={100} />
            <TextInput
              style={[s.entryInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary, marginTop: 10 }]}
              placeholder="Outcome — e.g. All clear, antibiotics (optional)"
              placeholderTextColor={colors.placeholder}
              value={fDiagnosis} onChangeText={t => setFDiagnosis(t.replace(/[^a-zA-Z0-9\s\-'.,/&()]/g, ''))} maxLength={200} />
          </>
        )}
      </View>

      <View style={[s.entryDivider, { backgroundColor: colors.border }]} />

      <View style={s.entryFooter}>
        <TouchableOpacity style={[s.entryCancel, { borderColor: colors.border }]} onPress={onClose}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.entrySave, { backgroundColor: addType ? typeColors[addType] : accentColor, opacity: saving ? 0.75 : 1 }]}
          onPress={onSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>{editingEntry ? 'Save changes' : 'Save'}</Text>}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
});
