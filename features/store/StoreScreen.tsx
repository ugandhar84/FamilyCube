import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useRewardStore, Reward } from '@/store/rewardStore';

// ─── PerkCard ─────────────────────────────────────────────────────────────────

function PerkCard({ reward, canRedeem, onRedeem, onEdit, isParent, colors, isDark }: {
  reward: Reward; canRedeem: boolean;
  onRedeem: (r: Reward) => void;
  onEdit: (r: Reward) => void;
  isParent: boolean; colors: any; isDark: boolean;
}) {
  return (
    <Pressable
      onLongPress={() => isParent && onEdit(reward)}
      style={[s.perkCard, { backgroundColor: isDark ? colors.card : '#fff', borderColor: colors.border }]}
    >
      <Text style={{ fontSize: 36, marginBottom: 6 }}>{reward.emoji ?? '🎁'}</Text>
      <Text style={[s.perkTitle, { color: colors.textPrimary }]}>{reward.title}</Text>
      <Text style={{ fontSize: 12, color: colors.amber, fontWeight: '800', marginTop: 2 }}>
        {reward.cost} Coins 🪙
      </Text>
      {reward.description ? (
        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, textAlign: 'center' }}>
          {reward.description}
        </Text>
      ) : null}

      {!isParent && (
        <Pressable
          onPress={() => onRedeem(reward)}
          disabled={!canRedeem}
          style={[s.redeemBtn, {
            backgroundColor: canRedeem ? colors.teal : colors.border,
            marginTop: 10,
          }]}
        >
          <Text style={[s.redeemBtnText, { color: canRedeem ? '#fff' : colors.textTertiary }]}>
            Redeem Perks
          </Text>
        </Pressable>
      )}
      {isParent && (
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 8 }}>
          Long-press to edit
        </Text>
      )}
    </Pressable>
  );
}

// ─── Create/Edit Perk Modal ───────────────────────────────────────────────────

function PerkModal({ visible, editing, onClose, onSave, colors, isDark }: {
  visible: boolean; editing?: Reward | null;
  onClose: () => void;
  onSave: (data: Partial<Reward>) => void;
  colors: any; isDark: boolean;
}) {
  const [name, setName]   = useState(editing?.title ?? '');
  const [desc, setDesc]   = useState(editing?.description ?? '');
  const [cost, setCost]   = useState(String(editing?.cost ?? '50'));
  const [emoji, setEmoji] = useState(editing?.emoji ?? '🎁');

  useEffect(() => {
    setName(editing?.title ?? '');
    setDesc(editing?.description ?? '');
    setCost(String(editing?.cost ?? '50'));
    setEmoji(editing?.emoji ?? '🎁');
  }, [editing, visible]);

  const submit = () => {
    if (!name.trim()) return;
    onSave({ title: name.trim(), description: desc.trim() || undefined,
      cost: parseInt(cost) || 50, emoji });
    onClose();
  };

  const EMOJI_OPTS = ['🎮', '🎬', '🍕', '🎂', '🏖️', '🎪', '📱', '🛍️', '🎁', '⭐', '🏆', '🎵'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: isDark ? colors.card : '#fff', borderColor: colors.border }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>
              {editing ? 'Edit Perk' : 'Create Custom Perk'}
            </Text>

            {/* Emoji picker */}
            <Text style={[s.label, { color: colors.textSecondary }]}>ICON</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EMOJI_OPTS.map(e => (
                  <Pressable key={e} onPress={() => setEmoji(e)}
                    style={[s.emojiBtn, {
                      backgroundColor: emoji === e ? colors.primary + '20' : colors.surface,
                      borderColor: emoji === e ? colors.primary : colors.border,
                    }]}>
                    <Text style={{ fontSize: 20 }}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[s.label, { color: colors.textSecondary }]}>PERK NAME</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Extra screen time"
              placeholderTextColor={colors.placeholder}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]} />

            <Text style={[s.label, { color: colors.textSecondary }]}>DESCRIPTION (optional)</Text>
            <TextInput value={desc} onChangeText={setDesc} placeholder="Brief description…"
              placeholderTextColor={colors.placeholder}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]} />

            <Text style={[s.label, { color: colors.textSecondary }]}>COIN COST</Text>
            <TextInput value={cost} onChangeText={setCost} keyboardType="number-pad"
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]} />

            <Pressable onPress={submit}
              style={[s.submitBtn, { backgroundColor: name.trim() ? colors.primary : colors.border }]}>
              <Text style={s.submitBtnText}>{editing ? 'Save Changes' : 'Create Perk'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── StoreScreen ─────────────────────────────────────────────────────────────

export default function StoreScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { rewards, loadFromStorage: loadRewards, addReward, updateReward } = useRewardStore();

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]       = useState<Reward | null>(null);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadRewards(); }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent     = activeMember?.role === 'parent';
  const isKid        = activeMember?.role === 'kid';
  const myCoins      = (activeMember as any)?.coins ?? 0;

  const handleRedeem = (r: Reward) => {
    if (myCoins < r.cost) {
      Alert.alert('Insufficient Coins', `You need ${r.cost} 🪙 but only have ${myCoins} 🪙`);
      return;
    }
    Alert.alert('Redeem Perk?', `Redeem "${r.title}" for ${r.cost} 🪙?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Redeem', onPress: () => Alert.alert('🎉 Redeemed!', `"${r.title}" has been redeemed. Ask a parent for your reward!`) },
    ]);
  };

  const bg = isDark ? '#0B0F1A' : '#F3F4F8';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['top']}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Family Perks Store</Text>
        {isParent ? (
          <Pressable onPress={() => setShowCreate(true)}
            style={[s.addBtn, { backgroundColor: colors.teal }]}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.addBtnText}>Create Perk</Text>
          </Pressable>
        ) : (
          <View style={[s.coinBadge, { backgroundColor: isDark ? colors.surface : '#FFF9EC',
            borderColor: colors.amber + '50' }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.amber }}>
              {myCoins} 🪙
            </Text>
          </View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>

        {/* Kid wallet info */}
        {isKid && (
          <View style={[s.walletCard, { backgroundColor: isDark ? colors.card : '#fff',
            borderColor: colors.amber + '40' }]}>
            <View>
              <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '700' }}>
                MAIN STORE WALLET
              </Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: colors.amber }}>{myCoins} 🪙</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                = ${(myCoins * 0.1).toFixed(2)} value
              </Text>
            </View>
            <Ionicons name="wallet" size={32} color={colors.amber + '60'} />
          </View>
        )}

        {/* Parent notice */}
        {isParent && (
          <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 10, lineHeight: 17 }}>
            Perks are redeemed from kids' Main Store Wallet. Grandparent Bonus coins are cashed out via parents separately.
          </Text>
        )}

        {/* Perk grid */}
        {rewards.length === 0 ? (
          <View style={[s.emptyBox, { backgroundColor: isDark ? colors.card : '#fff', borderColor: colors.border }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🎁</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textSecondary }}>
              No perks yet
            </Text>
            {isParent && (
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>
                Tap "Create Perk" to add rewards for the kids
              </Text>
            )}
          </View>
        ) : (
          <View style={s.grid}>
            {rewards.map(r => (
              <PerkCard
                key={r.id} reward={r}
                canRedeem={myCoins >= r.cost}
                onRedeem={handleRedeem}
                onEdit={(r) => { setEditing(r); setShowCreate(true); }}
                isParent={isParent}
                colors={colors} isDark={isDark}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <PerkModal
        visible={showCreate} editing={editing}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        onSave={(data) => {
          if (editing) updateReward?.(editing.id, data as any);
          else addReward?.({ category: 'Special', available: true, requiresApproval: true, createdAt: new Date().toISOString(), ...data } as any);
        }}
        colors={colors} isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:{ fontSize: 18, fontWeight: '800' },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99,
                paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  coinBadge:  { borderRadius: 99, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 14 },

  walletCard: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  perkCard:   { width: '47.5%', borderRadius: 20, borderWidth: 1, padding: 14,
                alignItems: 'center',
                shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 },
                shadowRadius: 6, elevation: 2 },
  perkTitle:  { fontSize: 13, fontWeight: '800', textAlign: 'center', lineHeight: 18 },
  redeemBtn:  { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, width: '100%',
                alignItems: 'center' },
  redeemBtnText: { fontSize: 12, fontWeight: '800' },

  emptyBox:   { borderRadius: 18, borderWidth: 1, padding: 40, alignItems: 'center' },

  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1,
                padding: 20, paddingBottom: 40 },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  label:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input:      { borderWidth: 1.5, borderRadius: 12, padding: 10, fontSize: 15, marginBottom: 12 },
  emojiBtn:   { width: 44, height: 44, borderRadius: 12, borderWidth: 1,
                alignItems: 'center', justifyContent: 'center' },
  submitBtn:  { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
