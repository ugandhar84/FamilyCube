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
import AppHeader from '@/components/AppHeader';

// ─── Category config ──────────────────────────────────────────────────────────

const CAT_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  Treats:      { label: '🟡 Treats',      bg: '#FEF3C7', text: '#92400E' },
  Experiences: { label: '🟣 Experiences', bg: '#EDE9FE', text: '#5B21B6' },
  'Screen Time':{ label: '🔵 Screen Time', bg: '#DBEAFE', text: '#1E40AF' },
  Privileges:  { label: '🟢 Privileges',  bg: '#D1FAE5', text: '#065F46' },
  Special:     { label: '⭐ Special',      bg: '#FEE2E2', text: '#991B1B' },
};

function CategoryBadge({ category, isDark }: { category?: string; isDark: boolean }) {
  const cfg = CAT_CONFIG[category ?? 'Special'] ?? CAT_CONFIG.Special;
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : cfg.bg, marginBottom: 6 }}>
      <Text style={{ fontSize: 9, fontWeight: '800', color: isDark ? '#E2E8F0' : cfg.text, letterSpacing: 0.3 }}>
        {cfg.label}
      </Text>
    </View>
  );
}

// ─── AI suggestion card ───────────────────────────────────────────────────────

interface AiSuggestion {
  emoji: string; title: string; category: string; cost: number;
  targetKid: string; reason: string;
}

const MOCK_SUGGESTIONS: AiSuggestion[] = [
  { emoji: '🎮', title: 'Extra Gaming Hour',  category: 'Screen Time', cost: 80,
    targetKid: 'Kids', reason: 'Great for hitting streak milestones' },
  { emoji: '🍕', title: 'Pizza Night Pick',   category: 'Treats',      cost: 60,
    targetKid: 'All',  reason: 'Popular food reward for completed chores' },
  { emoji: '🎬', title: 'Movie Night Choice', category: 'Experiences', cost: 100,
    targetKid: 'All',  reason: 'High-value weekend reward' },
  { emoji: '📱', title: 'Phone Time +30min',  category: 'Screen Time', cost: 50,
    targetKid: 'Teens', reason: 'Works well as a daily bonus' },
  { emoji: '🏖️', title: 'Day Trip Choice',   category: 'Experiences', cost: 200,
    targetKid: 'All',  reason: 'Save up for a bigger reward' },
  { emoji: '🛍️', title: 'Small Toy/Book',    category: 'Treats',      cost: 120,
    targetKid: 'Kids', reason: 'Tangible reward under $20' },
];

function AiPerksPanel({ onAdd, onClose, colors, isDark }: {
  onAdd: (s: AiSuggestion) => void; onClose: () => void; colors: any; isDark: boolean;
}) {
  return (
    <View style={{ backgroundColor: isDark ? '#1A1035' : '#F5F3FF',
      borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>✨</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#C4B5FD' : '#5B21B6' }}>
            AI Perk Suggestions
          </Text>
        </View>
        <Pressable onPress={onClose}>
          <Ionicons name="close" size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
        {MOCK_SUGGESTIONS.map((s, i) => (
          <View key={i} style={{ width: 160, backgroundColor: colors.card,
            borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12,
            shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
            <Text style={{ fontSize: 26, marginBottom: 4 }}>{s.emoji}</Text>
            <CategoryBadge category={s.category} isDark={isDark} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
              {s.title}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#F5A623', marginBottom: 4 }}>
              {s.cost} 🪙
            </Text>
            <Text style={{ fontSize: 10, color: colors.textSecondary, marginBottom: 8, lineHeight: 14 }}>
              {s.reason}
            </Text>
            <Pressable onPress={() => onAdd(s)}
              style={{ backgroundColor: isDark ? '#5B21B6' : '#7C3AED',
                borderRadius: 10, paddingVertical: 6, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12 }}>⚡</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Add</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Perk Card ────────────────────────────────────────────────────────────────

function PerkCard({ reward, myCoins, isKid, isParent, colors, isDark, onRedeem, onEdit, onDelete }: {
  reward: Reward; myCoins: number; isKid: boolean; isParent: boolean; colors: any; isDark: boolean;
  onRedeem: (r: Reward) => void; onEdit: (r: Reward) => void; onDelete: (r: Reward) => void;
}) {
  const canRedeem = isKid && myCoins >= reward.cost;
  return (
    <View style={[s.perkCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Parent actions */}
      {isParent && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
          <Pressable onPress={() => onEdit(reward)}
            style={{ padding: 5, borderRadius: 8, backgroundColor: colors.surface }}>
            <Ionicons name="pencil" size={13} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => onDelete(reward)}
            style={{ padding: 5, borderRadius: 8, backgroundColor: '#FEE2E2' }}>
            <Ionicons name="trash" size={13} color="#DC2626" />
          </Pressable>
        </View>
      )}

      <Text style={{ fontSize: 30, marginBottom: 6 }}>{reward.emoji ?? '🎁'}</Text>
      <CategoryBadge category={reward.category} isDark={isDark} />
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
        {reward.title}
      </Text>
      <Text style={{ fontSize: 10, fontWeight: '900', color: '#F5A623', marginBottom: 4 }}>
        {reward.cost} Coins 🪙
      </Text>
      {reward.description ? (
        <Text style={{ fontSize: 10, color: colors.textTertiary, lineHeight: 14, marginBottom: 4 }}>
          {reward.description}
        </Text>
      ) : null}

      {isKid ? (
        <Pressable onPress={() => onRedeem(reward)} disabled={!canRedeem}
          style={[s.redeemBtn, { backgroundColor: canRedeem ? colors.teal : colors.border, marginTop: 8 }]}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: canRedeem ? '#fff' : colors.textTertiary }}>
            {canRedeem ? 'Redeem Perk' : `Need ${reward.cost - myCoins} more 🪙`}
          </Text>
        </Pressable>
      ) : !isParent ? (
        <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center', marginTop: 8 }}>
          Kid Mode Required
        </Text>
      ) : null}
    </View>
  );
}

// ─── Create / Edit Perk Modal ─────────────────────────────────────────────────

const CATEGORIES = ['Treats', 'Experiences', 'Screen Time', 'Privileges', 'Special'];
const EMOJIS = ['🎮','🎬','🍕','🎂','🏖️','🎪','📱','🛍️','🎁','⭐','🏆','🎵','🎨','🎯','🚀'];

function PerkModal({ visible, editing, colors, onClose, onSave }: {
  visible: boolean; editing?: Reward | null; colors: any;
  onClose: () => void; onSave: (data: any) => void;
}) {
  const [name,  setName]  = useState('');
  const [desc,  setDesc]  = useState('');
  const [cost,  setCost]  = useState('50');
  const [emoji, setEmoji] = useState('🎁');
  const [cat,   setCat]   = useState('Special');

  useEffect(() => {
    if (visible) {
      setName(editing?.title ?? '');
      setDesc(editing?.description ?? '');
      setCost(String(editing?.cost ?? 50));
      setEmoji(editing?.emoji ?? '🎁');
      setCat(editing?.category ?? 'Special');
    }
  }, [visible, editing]);

  const submit = () => {
    if (!name.trim()) return;
    onSave({ title: name.trim(), description: desc.trim() || undefined,
      cost: parseInt(cost) || 50, emoji, category: cat });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>
                {editing ? 'Edit Perk' : 'Create Custom Perk'}
              </Text>
              <Pressable onPress={onClose}>
                <Ionicons name="close" size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>PERK TITLE</Text>
            <TextInput value={name} onChangeText={setName}
              placeholder="e.g. Movie Night Choice"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface }]} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>COIN COST</Text>
                <TextInput value={cost} onChangeText={setCost} keyboardType="number-pad"
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: colors.surface, marginBottom: 0 }]} />
              </View>
            </View>

            <Text style={[s.label, { color: colors.textSecondary, marginTop: 10 }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {CATEGORIES.map(c => (
                  <Pressable key={c} onPress={() => setCat(c)}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5,
                      backgroundColor: cat === c ? colors.primary + '20' : colors.surface,
                      borderColor: cat === c ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: cat === c ? colors.primary : colors.textSecondary }}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[s.label, { color: colors.textSecondary }]}>DESCRIPTION (optional)</Text>
            <TextInput value={desc} onChangeText={setDesc} placeholder="Brief description…"
              placeholderTextColor={colors.textTertiary}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                backgroundColor: colors.surface }]} />

            <Text style={[s.label, { color: colors.textSecondary }]}>EMOJI ICON</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EMOJIS.map(e => (
                  <Pressable key={e} onPress={() => setEmoji(e)}
                    style={[s.emojiBtn, {
                      backgroundColor: emoji === e ? colors.primary + '25' : colors.surface,
                      borderColor: emoji === e ? colors.primary : colors.border,
                    }]}>
                    <Text style={{ fontSize: 20 }}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Pressable onPress={submit}
              style={[s.submitBtn, { backgroundColor: name.trim() ? colors.teal : colors.border }]}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                {editing ? 'Save Changes' : 'Publish Perk to Family Store'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── StoreScreen ──────────────────────────────────────────────────────────────

export default function StoreScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { rewards, loadFromStorage: loadRewards, addReward, updateReward, deleteReward } = useRewardStore();

  const [showCreate,  setShowCreate]  = useState(false);
  const [editing,     setEditing]     = useState<Reward | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadRewards(); }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  const isKid    = activeMember?.role === 'kid';
  const myCoins  = (activeMember as any)?.mainCoins ?? 0;
  const kids     = members.filter(m => m.role === 'kid');

  const handleRedeem = (r: Reward) => {
    if (myCoins < r.cost) {
      Alert.alert('Insufficient Coins', `You need ${r.cost} 🪙 but only have ${myCoins} 🪙`);
      return;
    }
    Alert.alert('Redeem Perk?', `Redeem "${r.title}" for ${r.cost} 🪙?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Redeem', onPress: () => Alert.alert('🎉 Redeemed!',
        `"${r.title}" redeemed! Ask a parent for your reward.`) },
    ]);
  };

  const handleDelete = (r: Reward) => {
    Alert.alert('Delete Perk?', `Remove "${r.title}" from the store?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive',
        onPress: () => deleteReward?.(r.id) },
    ]);
  };

  const handleAddAiSuggestion = (s: { title: string; category: string; cost: number; emoji: string; reason: string }) => {
    addReward?.({
      title: s.title, category: s.category, cost: s.cost, emoji: s.emoji,
      description: s.reason, available: true, requiresApproval: true,
      createdAt: new Date().toISOString(),
    } as any);
    Alert.alert('✅ Added!', `"${s.title}" added to the family store.`);
  };

  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={hideHeader ? [] : ['top']}>
      {!hideHeader && (
        <AppHeader
          memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
          memberRole={activeMember?.role ?? 'parent'}
          notifCount={0}
          onPersonaPress={() => setSwitcherOpen(true)}
        />
      )}

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Page title row ── */}
        <View style={[s.header, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>
            Family Perks Store
          </Text>
          {isKid ? (
            <View style={[s.coinBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary }}>
                Balance: <Text style={{ color: '#F5A623', fontWeight: '900' }}>{myCoins} 🪙</Text>
              </Text>
            </View>
          ) : isParent ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setShowAiPanel(v => !v)}
                style={[s.createBtn, { backgroundColor: showAiPanel ? '#5B21B6' : '#7C3AED' }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>✨ AI Perks</Text>
              </Pressable>
              <Pressable onPress={() => { setEditing(null); setShowCreate(true); }}
                style={[s.createBtn, { backgroundColor: colors.teal }]}>
                <Ionicons name="add" size={14} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff', marginLeft: 3 }}>Add Perk</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* ── AI Panel ── */}
        {isParent && showAiPanel && (
          <AiPerksPanel
            onAdd={handleAddAiSuggestion}
            onClose={() => setShowAiPanel(false)}
            colors={colors}
            isDark={isDark}
          />
        )}

        <View style={{ padding: 12 }}>
          <Text style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 12, lineHeight: 16 }}>
            Perks are redeemed from your Main Wallet. Grandparent Bonus coins are cashed out via parents.
          </Text>

          {rewards.length === 0 ? (
            <View style={[s.emptyBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🎁</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textTertiary }}>No perks yet</Text>
              {isParent && (
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, textAlign: 'center' }}>
                  Tap "+ Add Perk" or try "✨ AI Perks" for suggestions
                </Text>
              )}
            </View>
          ) : (
            <View style={s.grid}>
              {rewards.map(r => (
                <PerkCard key={r.id} reward={r} myCoins={myCoins}
                  isKid={isKid} isParent={isParent} colors={colors} isDark={isDark}
                  onRedeem={handleRedeem}
                  onEdit={r => { setEditing(r); setShowCreate(true); }}
                  onDelete={handleDelete}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <PerkModal
        visible={showCreate}
        editing={editing}
        colors={colors}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        onSave={data => {
          if (editing) updateReward?.(editing.id, data);
          else addReward?.({ available: true, requiresApproval: true,
            createdAt: new Date().toISOString(), ...data } as any);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  createBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 12,
               paddingVertical: 7, paddingHorizontal: 12 },
  coinBadge: { borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  perkCard:  { width: '47.5%', borderRadius: 20, borderWidth: 1, padding: 14,
               shadowColor: '#000', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 2 },
               shadowRadius: 6, elevation: 3 },
  redeemBtn: { borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  emptyBox:  { borderRadius: 20, borderWidth: 1, padding: 40, alignItems: 'center' },
  overlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1,
               padding: 20, paddingBottom: 40 },
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  label:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input:     { borderWidth: 1.5, borderRadius: 12, padding: 10, fontSize: 13, marginBottom: 10 },
  emojiBtn:  { width: 44, height: 44, borderRadius: 12, borderWidth: 1,
               alignItems: 'center', justifyContent: 'center' },
  submitBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});
