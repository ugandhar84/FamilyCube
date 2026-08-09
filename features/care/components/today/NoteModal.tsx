import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { upsertDailyNote } from '@/lib/db/daily';
import { TYPO } from '@/constants/theme';

interface Props {
  visible:  boolean;
  petId:    string | null;
  today:    string;
  colors:   any;
  onClose:  () => void;
  onSaved:  (petId: string, note: string) => void;
}

export default function NoteModal({ visible, petId, today, colors, onClose, onSaved }: Props) {
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!visible || !petId) return;
    Promise.resolve(supabase
      .from('daily_notes')
      .select('note')
      .eq('pet_id', petId)
      .eq('date', today)
      .maybeSingle())
      .then(({ data }: any) => setNoteText(data?.note ?? ''))
      .catch(() => {});
  }, [visible, petId, today]);

  const handleSave = async () => {
    if (!petId) return;
    await upsertDailyNote(petId, today, noteText).catch(() => {});
    onSaved(petId, noteText);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { backgroundColor: colors.card ?? colors.background }]}>
          <Text style={[s.modalTitle, { color: colors.textPrimary }]}>📝 Today's note</Text>
          <TextInput
            value={noteText}
            onChangeText={setNoteText}
            multiline
            numberOfLines={4}
            placeholder="How is your pet doing today?"
            placeholderTextColor={colors.textSecondary}
            style={[s.noteInput, { color: colors.textPrimary, borderColor: colors.border ?? colors.textSecondary + '40', backgroundColor: colors.background }]}
          />
          <View style={s.modalButtons}>
            <TouchableOpacity onPress={onClose} style={[s.modalBtn, { borderColor: colors.textSecondary + '60' }]}>
              <Text style={[s.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[s.modalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={[s.modalBtnText, { color: '#fff' }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: '#00000070', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard:    { width: '100%', borderRadius: 16, padding: 20, gap: 14 },
  modalTitle:   { fontSize: TYPO.subheading, fontWeight: '700' },
  noteInput:    { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: TYPO.body, minHeight: 100, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalBtn:     { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  modalBtnText: { fontSize: TYPO.body, fontWeight: '700' },
});
