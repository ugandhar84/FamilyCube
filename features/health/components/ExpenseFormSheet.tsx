import React, { memo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback,
  KeyboardAvoidingView, Platform, ScrollView, TextInput, StyleSheet, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_CONFIG } from '@/lib/db/expenses';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { s } from './expensesStyles';
import type { FormState } from './expensesUtils';
import { TYPO } from '@/constants/theme';

interface Pet { id: string; name: string; [key: string]: any; }

interface Props {
  visible: boolean;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  addForPetId: string | null;
  setAddForPetId: (id: string) => void;
  selectedPetId: string | null;
  pets: Pet[];
  accent: string;
  colors: any;
  saving: boolean;
  showPicker: boolean;
  setShowPicker: (v: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  petForEntry: (pid: string) => Pet | undefined;
}

const ExpenseFormSheet = memo(function ExpenseFormSheet({
  visible, form, setForm, addForPetId, setAddForPetId,
  selectedPetId, pets, accent, colors, saving, showPicker, setShowPicker,
  onClose, onSave, petForEntry,
}: Props) {
  const cfg = EXPENSE_CATEGORY_CONFIG;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); onClose(); }}>
        <View style={StyleSheet.absoluteFillObject} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        {visible && <View style={[s.sheet, { backgroundColor: colors.surface ?? colors.card }]}>
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <View>
              <Text style={{ fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary }}>{form.id ? 'Edit expense' : 'Log expense'}</Text>
              {addForPetId && <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>{petForEntry(addForPetId)?.name ?? 'Pet'}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            {/* Pet selector */}
            {!selectedPetId && !form.id && pets.length > 1 && (
              <View>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Pet</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row' }}>
                  {pets.map(p => {
                    const sel = addForPetId === p.id;
                    const pa = p.accent_color ?? accent;
                    return (
                      <TouchableOpacity key={p.id} onPress={() => setAddForPetId(p.id)}
                        style={[s.petChip, { borderColor: sel ? pa : colors.border, backgroundColor: sel ? pa + '18' : colors.card }]}>
                        <Text style={{ fontSize: TYPO.body }}>{p.emoji ?? '🐾'}</Text>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: sel ? pa : colors.textSecondary }}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Category */}
            <View>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {EXPENSE_CATEGORIES.map(cat => {
                  const c = cfg[cat]; const sel = form.category === cat;
                  return (
                    <TouchableOpacity key={cat} onPress={() => setForm(p => ({ ...p, category: cat }))}
                      style={[s.petChip, { borderColor: sel ? c.color : colors.border, backgroundColor: sel ? c.color + '18' : colors.card }]}>
                      <Text style={{ fontSize: TYPO.subheading }}>{c.emoji}</Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: sel ? c.color : colors.textSecondary }}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Title */}
            <View>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Title</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg ?? colors.background, borderColor: colors.inputBorder ?? colors.border }]}
                placeholder="e.g. Annual Checkup, Royal Canin 15lb bag"
                placeholderTextColor={colors.placeholder}
                value={form.title}
                onChangeText={t => setForm(p => ({ ...p, title: t }))}
                maxLength={120}
                returnKeyType="next"
              />
            </View>

            {/* Amount */}
            <View>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Amount ($)</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg ?? colors.background, borderColor: colors.inputBorder ?? colors.border }]}
                placeholder="0.00" placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
                value={form.amount}
                onChangeText={t => setForm(p => ({ ...p, amount: t.replace(/[^0-9.]/g, '') }))} />
            </View>

            {/* Date */}
            <View>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Date</Text>
              <TouchableOpacity onPress={() => setShowPicker(true)}
                style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg ?? colors.background, borderColor: colors.inputBorder ?? colors.border }]}>
                <Ionicons name="calendar-outline" size={16} color={accent} />
                <Text style={{ fontSize: TYPO.body, color: colors.textPrimary }}>{format(parseISO(form.expense_date), 'MMMM d, yyyy')}</Text>
              </TouchableOpacity>
            </View>

            {/* Notes */}
            <View>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Notes (optional)</Text>
              <TextInput
                style={[s.input, { height: 60, paddingTop: 10, textAlignVertical: 'top', color: colors.textPrimary, backgroundColor: colors.inputBg ?? colors.background, borderColor: colors.inputBorder ?? colors.border }]}
                multiline placeholder="Extra details, clinic name, brand…" placeholderTextColor={colors.placeholder}
                value={form.notes} onChangeText={t => setForm(p => ({ ...p, notes: t }))} maxLength={300} />
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 8 }}>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }]} onPress={onSave} disabled={saving}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          <AppDateTimePicker visible={showPicker} value={parseISO(form.expense_date)} mode="date" accent={accent}
            onCancel={() => setShowPicker(false)}
            onConfirm={d => { setForm(p => ({ ...p, expense_date: format(d, 'yyyy-MM-dd') })); setShowPicker(false); }} />
        </View>}
      </KeyboardAvoidingView>
    </Modal>
  );
});

export default ExpenseFormSheet;
