/**
 * KioskQuestComposer — create a new quest/chore from kiosk mode.
 *
 * A new, kiosk-sized modal (wide centered card, big touch targets) — NOT
 * the phone's AddQuestModal (a multi-step bottom sheet built for a much
 * narrower screen) reused at a different size. Writes through the exact
 * same choreStore.addChore the phone app itself calls, so a quest created
 * here is indistinguishable from one created on a phone.
 */
import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChoreStore } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';

const COIN_PRESETS = [10, 15, 20, 30, 50];

export function KioskQuestComposer({ visible, onClose, active, members, colors, isDark }: {
  visible: boolean; onClose: () => void;
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const addChore = useChoreStore(s => s.addChore);
  const [title, setTitle] = useState('');
  const [coins, setCoins] = useState(15);
  const [assignedToId, setAssignedToId] = useState<string | undefined>(undefined);

  const kids = members.filter(m => m.role === 'kid' || m.role === 'teen');

  const reset = () => { setTitle(''); setCoins(15); setAssignedToId(undefined); };
  const close = () => { reset(); onClose(); };

  const save = () => {
    if (!title.trim()) return;
    addChore({
      title: title.trim(),
      categoryType: 'routine',
      category: 'Other',
      basePoints: 0,
      coinsReward: coins,
      xpReward: 10,
      status: 'todo',
      isPool: !assignedToId,
      assignedToId,
      requiresPhotoProof: false,
      recurrenceRule: { frequency: 'once' },
      familyId: (active as any).familyId,
      createdById: active.id,
    });
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>New Chore</Text>
            <Pressable onPress={close} hitSlop={12}><X size={22} color={colors.textSecondary} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={s.body}>
            <Text style={[s.label, { color: colors.textSecondary }]}>What needs doing?</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Fold laundry"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              autoFocus
            />

            <Text style={[s.label, { color: colors.textSecondary }]}>Reward</Text>
            <View style={s.row}>
              {COIN_PRESETS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setCoins(c)}
                  style={[s.chip, { borderColor: coins === c ? colors.primary : colors.border, backgroundColor: coins === c ? colors.primaryLight : colors.surface }]}
                >
                  <Text style={[s.chipText, { color: coins === c ? colors.primary : colors.textPrimary }]}>{c} 🪙</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>Assign to</Text>
            <View style={s.row}>
              <Pressable
                onPress={() => setAssignedToId(undefined)}
                style={[s.chip, { borderColor: !assignedToId ? colors.primary : colors.border, backgroundColor: !assignedToId ? colors.primaryLight : colors.surface }]}
              >
                <Text style={[s.chipText, { color: !assignedToId ? colors.primary : colors.textPrimary }]}>Open pool</Text>
              </Pressable>
              {kids.map(k => (
                <Pressable
                  key={k.id}
                  onPress={() => setAssignedToId(k.id)}
                  style={[s.chip, { borderColor: assignedToId === k.id ? colors.primary : colors.border, backgroundColor: assignedToId === k.id ? colors.primaryLight : colors.surface }]}
                >
                  <Text style={[s.chipText, { color: assignedToId === k.id ? colors.primary : colors.textPrimary }]}>{k.emoji ?? '👤'} {k.name.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={s.footer}>
            <Pressable onPress={close} style={[s.btn, { borderWidth: 1.5, borderColor: colors.border }]}>
              <Text style={[s.btnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={!title.trim()} style={[s.btn, { backgroundColor: title.trim() ? colors.primary : colors.border, flex: 2 }]}>
              <Text style={[s.btnText, { color: '#fff' }]}>Create Chore</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 560, maxWidth: '90%', maxHeight: '80%', borderRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  label: { fontSize: TYPO.caption, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, padding: 14, fontSize: TYPO.body },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipText: { fontSize: TYPO.label, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 10, padding: 20, paddingTop: 12 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: TYPO.body, fontWeight: '800' },
});
