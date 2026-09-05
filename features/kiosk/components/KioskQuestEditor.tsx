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

import { useChoreStore } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { showToast } from '@/components/AppToast';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { KioskModalHost } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';

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

  // PARITY FIX: the phone's AddQuestModal locks the coin field to 0 and
  // makes it non-editable whenever the chore is an adult task or is
  // invited to grandparents (its own `coinsDisabled`, AddQuestModal.tsx:489
  // — "adult task toggled on: ... zero coins" / "GP invite toggled: zero
  // coins (GPs don't earn coins)"). Kiosk's editor had no such notion: a
  // parent could put an arbitrary coin reward on an adult/GP chore that the
  // phone's own creation form would never allow and that no payout path
  // honors — the same class of inconsistency KioskTasksTab already guards
  // against on the DISPLAY side (its isAdultAssignee check hides the coin
  // pill), just never enforced on the WRITE side here.
  const coinsDisabled = !!quest.isAdultTask || !!quest.inviteGrandparents;

  const save = () => {
    if (!canEdit || !title.trim()) return;
    updateChore(quest.id, {
      title: title.trim(),
      coinsReward: coinsDisabled ? 0 : Math.max(0, parseInt(coins, 10) || 0),
    });
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
        <KioskModalHost style={s.overlay}>
          <View
            style={[s.card, { backgroundColor: colors.card }]}
            accessibilityViewIsModal
            accessibilityLabel={`Chore details, read only: ${quest.title}`}
          >
            <View style={s.header}>
              <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={2}>{quest.title}</Text>
              <Pressable
                onPress={onClose}
                hitSlop={16}
                style={s.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={28} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={[s.lockBadge, { backgroundColor: colors.amberLight, marginHorizontal: KIOSK_SPACE.lg }]}>
              <Lock size={16} color={colors.amber} />
              <Text style={{ fontSize: KIOSK_TYPO.micro, fontWeight: '700', color: colors.amber }}>Read-only</Text>
            </View>
            <View style={s.body}>
              <Text style={[s.label, { color: colors.textSecondary, marginTop: 0 }]}>Reward</Text>
              <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{quest.coins} coins</Text>
            </View>
            <View style={s.footer}>
              <Pressable
                onPress={onClose}
                style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={[s.btnText, { color: colors.textSecondary }]}>Close</Text>
              </Pressable>
            </View>
          </View>
        </KioskModalHost>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KioskModalHost>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
        <View
          style={[s.card, { backgroundColor: colors.card, ...(keyboardAwareMaxHeight !== undefined ? { maxHeight: keyboardAwareMaxHeight } : {}) }]}
          accessibilityViewIsModal
        >
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Edit Chore</Text>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              style={s.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close without saving"
            >
              <X size={28} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={s.body}>
            <Text style={[s.label, { color: colors.textSecondary }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              accessibilityLabel="Chore title"
              // Matches the phone form's own bound; without it a kiosk
              // paste could write a title no card layout can render.
              maxLength={120}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
            <Text style={[s.label, { color: colors.textSecondary }]}>Reward (coins)</Text>
            <TextInput
              value={coinsDisabled ? '0' : coins}
              onChangeText={coinsDisabled ? undefined : (t => setCoins(t.replace(/[^0-9]/g, '')))}
              editable={!coinsDisabled}
              keyboardType="number-pad"
              accessibilityLabel="Coin reward"
              // 4 digits, same practical ceiling the phone form's numeric
              // field allows — an unbounded paste here becomes a coin
              // payout no balance check anticipates.
              maxLength={4}
              style={[s.input, {
                color: colors.textPrimary,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                width: 150,
                opacity: coinsDisabled ? 0.4 : 1,
              }]}
            />
            {coinsDisabled && (
              <Text style={[s.hint, { color: colors.textTertiary }]}>
                {quest.isAdultTask ? 'Adult chores have no coin reward.' : 'Grandparent chores have no coin reward.'}
              </Text>
            )}
          </View>

          <View style={s.footer}>
            {canDelete && (
              <Pressable
                onPress={confirmDelete}
                style={[s.iconBtn, { borderColor: colors.danger }]}
                accessibilityRole="button"
                accessibilityLabel={`Delete chore ${quest.title}`}
              >
                <Trash2 size={24} color={colors.danger} />
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[s.btnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!title.trim()}
              style={[s.btn, { backgroundColor: title.trim() ? colors.primary : colors.border, flex: 2 }]}
              accessibilityRole="button"
              accessibilityLabel="Save changes"
              accessibilityState={{ disabled: !title.trim() }}
            >
              <Text style={[s.btnText, { color: '#fff' }]}>Save Changes</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      </KioskModalHost>
    </Modal>
  );
}

// Scaled to KIOSK_TYPO/KIOSK_HIT throughout — this is a form filled in
// standing at a counter, so every field and button is sized for that
// rather than for a phone in the hand. TYPO is no longer imported here.
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 620, maxWidth: '92%', borderRadius: KIOSK_RADIUS.lg, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm,
  },
  headerTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', flexShrink: 1 },
  closeBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  lockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, alignSelf: 'flex-start',
    borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 6, marginBottom: KIOSK_SPACE.xs,
  },
  body: { paddingHorizontal: KIOSK_SPACE.lg, gap: 6 },
  label: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.xs },
  input: {
    borderWidth: 1.5, borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.md,
    minHeight: KIOSK_HIT.min, fontSize: KIOSK_TYPO.body,
  },
  hint: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: KIOSK_SPACE.xs },
  footer: { flexDirection: 'row', gap: KIOSK_SPACE.sm, padding: KIOSK_SPACE.lg },
  iconBtn: {
    width: KIOSK_HIT.control, minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.sm,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  btn: {
    flex: 1, borderRadius: KIOSK_RADIUS.sm, minHeight: KIOSK_HIT.control,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.sm,
  },
  btnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
});
