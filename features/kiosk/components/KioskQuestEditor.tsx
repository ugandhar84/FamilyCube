/**
 * KioskQuestEditor — edit or delete an existing quest from kiosk mode.
 * New kiosk-sized modal, writes through the same choreStore.updateChore/
 * deleteChore the phone's EditQuestModal already calls.
 *
 * RBAC: this had zero permission awareness — any member tapping any quest
 * card could edit or delete it outright. Today it's only reachable via a
 * permission-gated card tap in KioskTasksTab (deriveQuestActions.canEdit
 * decides whether the Pressable even fires), but the editor itself
 * enforced nothing, so a future second entry point (or the gate being
 * loosened) would silently reopen full write access to anyone. Now calls
 * the same deriveQuestActions the tab's own gate already uses and re-checks
 * canEdit/canDelete here too, at the point of the actual write — belt and
 * suspenders, same reasoning as KioskEventEditor's deriveEventEditPermission
 * fix.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, Alert, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { X, Trash2, Lock } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChoreStore } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { showToast } from '@/components/AppToast';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';

export function KioskQuestEditor({ quest, active, isActiveApprover, onClose, members, colors, isDark }: {
  quest: Quest | null; active: FamilyMember; isActiveApprover?: boolean; onClose: () => void;
  members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const updateChore = useChoreStore(s => s.updateChore);
  const deleteChore = useChoreStore(s => s.deleteChore);
  const [title, setTitle] = useState('');
  const [coins, setCoins] = useState('0');
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(80);

  useEffect(() => {
    if (quest) { setTitle(quest.title); setCoins(String(quest.coins)); }
  }, [quest?.id]);

  if (!quest) return null;

  const actions = deriveQuestActions(quest, { id: active.id, role: active.role, isActiveApprover });
  const canEdit = actions.canEdit;
  const canDelete = actions.canDelete;

  const save = () => {
    if (!canEdit || !title.trim()) return;
    updateChore(quest.id, { title: title.trim(), coinsReward: Math.max(0, parseInt(coins, 10) || 0) });
    showToast('Chore updated');
    onClose();
  };

  const confirmDelete = () => {
    if (!canDelete) return;
    Alert.alert('Delete this chore?', `"${quest.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteChore(quest.id); showToast('Chore deleted'); onClose(); } },
    ]);
  };

  if (!canEdit) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={s.overlay}>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <View style={s.header}>
              <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{quest.title}</Text>
              <Pressable onPress={onClose} hitSlop={12}><X size={22} color={colors.textSecondary} /></Pressable>
            </View>
            <View style={[s.lockBadge, { backgroundColor: colors.amberLight, marginHorizontal: 20 }]}>
              <Lock size={12} color={colors.amber} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.amber }}>Read-only</Text>
            </View>
            <View style={s.body}>
              <Text style={[s.label, { color: colors.textSecondary, marginTop: 0 }]}>Reward</Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{quest.coins} coins</Text>
            </View>
            <View style={s.footer}>
              <Pressable onPress={onClose} style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}>
                <Text style={[s.btnText, { color: colors.textSecondary }]}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card, ...(keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : {}) }]}>
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Edit Chore</Text>
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
            {canDelete && (
              <Pressable onPress={confirmDelete} style={[s.iconBtn, { borderColor: colors.danger }]}>
                <Trash2 size={18} color={colors.danger} />
              </Pressable>
            )}
            <Pressable onPress={onClose} style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}>
              <Text style={[s.btnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={!title.trim()} style={[s.btn, { backgroundColor: title.trim() ? colors.primary : colors.border, flex: 2 }]}>
              <Text style={[s.btnText, { color: '#fff' }]}>Save Changes</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 500, maxWidth: '90%', borderRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', flexShrink: 1 },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
  body: { paddingHorizontal: 20, gap: 6 },
  label: { fontSize: TYPO.caption, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, padding: 14, fontSize: TYPO.body },
  footer: { flexDirection: 'row', gap: 10, padding: 20 },
  iconBtn: { width: 50, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: TYPO.body, fontWeight: '800' },
});
