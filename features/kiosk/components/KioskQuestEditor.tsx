/**
 * KioskQuestEditor — edit or delete an existing quest from kiosk mode.
 * New kiosk-sized modal, writes through the same choreStore.updateChore/
 * deleteChore the phone's EditQuestModal already calls.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, Alert, StyleSheet } from 'react-native';
import { X, Trash2 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChoreStore } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

export function KioskQuestEditor({ quest, onClose, members, colors, isDark }: {
  quest: Quest | null; onClose: () => void;
  members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const updateChore = useChoreStore(s => s.updateChore);
  const deleteChore = useChoreStore(s => s.deleteChore);
  const [title, setTitle] = useState('');
  const [coins, setCoins] = useState('0');

  useEffect(() => {
    if (quest) { setTitle(quest.title); setCoins(String(quest.coins)); }
  }, [quest?.id]);

  if (!quest) return null;

  const save = () => {
    if (!title.trim()) return;
    updateChore(quest.id, { title: title.trim(), coinsReward: Math.max(0, parseInt(coins, 10) || 0) });
    onClose();
  };

  const confirmDelete = () => {
    Alert.alert('Delete this quest?', `"${quest.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteChore(quest.id); onClose(); } },
    ]);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Edit Quest</Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={22} color={colors.textSecondary} /></Pressable>
          </View>

          <View style={s.body}>
            <Text style={[s.label, { color: colors.textSecondary }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
            <Text style={[s.label, { color: colors.textSecondary }]}>Reward (coins)</Text>
            <TextInput
              value={coins}
              onChangeText={t => setCoins(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, width: 120 }]}
            />
          </View>

          <View style={s.footer}>
            <Pressable onPress={confirmDelete} style={[s.iconBtn, { borderColor: colors.danger }]}>
              <Trash2 size={18} color={colors.danger} />
            </Pressable>
            <Pressable onPress={onClose} style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}>
              <Text style={[s.btnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={!title.trim()} style={[s.btn, { backgroundColor: title.trim() ? colors.primary : colors.border, flex: 2 }]}>
              <Text style={[s.btnText, { color: '#fff' }]}>Save Changes</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 500, maxWidth: '90%', borderRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  body: { paddingHorizontal: 20, gap: 6 },
  label: { fontSize: TYPO.caption, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, padding: 14, fontSize: TYPO.body },
  footer: { flexDirection: 'row', gap: 10, padding: 20 },
  iconBtn: { width: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: TYPO.body, fontWeight: '800' },
});
