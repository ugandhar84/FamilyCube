import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  TextInput, Alert, Platform, Modal, KeyboardAvoidingView, Keyboard, TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useRewardStore, Reward } from '@/store/rewardStore';
import { useChoreStore } from '@/store/choreStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import AppHeader from '@/components/AppHeader';
import { Flame } from 'lucide-react-native';

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

function PerkCard({ reward, myCoins, isKid, isParent, colors, isDark, onRedeem, onEdit, onDelete, isGoal, onToggleGoal }: {
  reward: Reward; myCoins: number; isKid: boolean; isParent: boolean; colors: any; isDark: boolean;
  onRedeem: (r: Reward) => void; onEdit: (r: Reward) => void; onDelete: (r: Reward) => void;
  isGoal?: boolean; onToggleGoal?: (r: Reward) => void;
}) {
  const canRedeem = isKid && myCoins >= reward.cost;
  return (
    <View style={[s.perkCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.textPrimary, overflow: 'hidden' }]}>
      <LinearGradient
        colors={[colors.primary + '0C', colors.primary + '00']}
        start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={18} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
      )}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)' }} pointerEvents="none" />

      {/* Parent actions */}
      {isParent && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
          <Pressable onPress={() => onEdit(reward)}
            style={{ padding: 5, borderRadius: 8, backgroundColor: colors.surface }}>
            <Ionicons name="pencil" size={13} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => onDelete(reward)}
            style={{ padding: 5, borderRadius: 8, backgroundColor: colors.danger + '20' }}>
            <Ionicons name="trash" size={13} color={colors.danger} />
          </Pressable>
        </View>
      )}

      <Text style={{ fontSize: 30, marginBottom: 6 }}>{reward.emoji ?? '🎁'}</Text>
      <CategoryBadge category={reward.category} isDark={isDark} />
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
        {reward.title}
      </Text>
      <Text style={{ fontSize: 10, fontWeight: '900', color: colors.amber, marginBottom: 4 }}>
        {reward.cost} Coins 🪙
      </Text>
      {reward.description ? (
        <Text style={{ fontSize: 10, color: colors.textTertiary, lineHeight: 14, marginBottom: 4 }}>
          {reward.description}
        </Text>
      ) : null}

      {isKid ? (
        <>
          <Pressable onPress={() => onRedeem(reward)} disabled={!canRedeem}
            style={[s.redeemBtn, { backgroundColor: canRedeem ? colors.teal : colors.border, marginTop: 8 }]}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: canRedeem ? colors.textInverse : colors.textTertiary }}>
              {canRedeem ? 'Redeem Perk' : `Need ${reward.cost - myCoins} more 🪙`}
            </Text>
          </Pressable>
          {onToggleGoal && (
            <Pressable onPress={() => onToggleGoal(reward)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
              <Ionicons name={isGoal ? 'star' : 'star-outline'} size={13} color={isGoal ? colors.amber : colors.textTertiary} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: isGoal ? colors.amber : colors.textTertiary }}>
                {isGoal ? 'My Goal' : 'Set as My Goal'}
              </Text>
            </Pressable>
          )}
        </>
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card }}>

            {/* Drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            {/* Fixed header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <Text style={{ flex: 1, fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>
                {editing ? 'Edit Perk' : 'Create Custom Perk'}
              </Text>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
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
            </ScrollView>

            {/* Fixed footer */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable onPress={submit}
                style={[s.submitBtn, { backgroundColor: name.trim() ? colors.teal : colors.border }]}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                  {editing ? 'Save Changes' : 'Publish Perk to Family Store'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── StoreScreen ──────────────────────────────────────────────────────────────

export default function StoreScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage, deductCoins, awardCoins } = useFamilyStore();
  const { rewards, loadFromStorage: loadRewards, addReward, updateReward, deleteReward, redeemReward } = useRewardStore();
  const pointsToFiatRatio = useChoreStore(s => s.householdSettings.pointsToFiatRatio);

  const [showCreate,  setShowCreate]  = useState(false);
  const [editing,     setEditing]     = useState<Reward | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  // Jar picker — only shown when the kid actually has a choice (both
  // wallets non-zero and at least one alone can't cover it, or both can).
  const [jarPickerTarget, setJarPickerTarget] = useState<Reward | null>(null);
  // Grant Coins — relocated here from the now-removed standalone Ledger
  // tab; Send Coins (peer-to-peer transfer) was dropped, this is the one
  // parent action kept alongside the balance/goal display.
  const [grantTarget, setGrantTarget] = useState<{ id: string; name: string } | null>(null);
  const [grantAmount, setGrantAmount] = useState('');

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadRewards(); }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  const isKid    = activeMember?.role === 'kid';
  const myMainCoins = (activeMember as any)?.mainCoins ?? 0;
  const myGpCoins   = (activeMember as any)?.gpCoins ?? 0;
  const myCoins  = myMainCoins + myGpCoins;
  const kids     = members.filter(m => m.role === 'kid' || m.role === 'teen');

  // A kid's own chosen goal (goalRewardId, set via "Set as My Goal" on their
  // own Perk card) takes priority. Falls back to "whichever perk they're
  // closest to affording" only if they haven't picked one — so the card
  // never shows nothing just because a kid hasn't engaged with the goal
  // feature yet.
  const goalForKid = (kidId: string, kidCoins: number) => {
    const kid = members.find(m => m.id === kidId);
    if (kid?.goalRewardId) {
      const chosen = rewards.find(r => r.id === kid.goalRewardId && r.available);
      if (chosen) return chosen;
    }
    const affordable = rewards
      .filter(r => r.available && r.cost > 0 && (!r.eligibleMemberIds || r.eligibleMemberIds.includes(kidId)))
      .sort((a, b) => a.cost - b.cost);
    return affordable.find(r => r.cost >= kidCoins) ?? affordable[affordable.length - 1];
  };

  // Redeems from a specific wallet — real deduction (deductCoins) + a real
  // Redemption record (redeemReward), replacing the old stub that only
  // showed an alert and never touched any balance or persisted anything.
  const redeemFrom = (r: Reward, wallet: 'mainCoins' | 'gpCoins') => {
    if (!activeMember) return;
    const ok = redeemReward(r.id, activeMember.id, wallet);
    if (!ok) { Alert.alert('Unable to Redeem', 'This perk is no longer available.'); return; }
    deductCoins(activeMember.id, r.cost, wallet);
    Alert.alert('🎉 Redeemed!', `"${r.title}" redeemed for ${r.cost} 🪙 from your ${wallet === 'gpCoins' ? 'Grandparent Bonus jar' : 'Main Coins'}! Ask a parent for your reward.`);
  };

  const handleRedeem = (r: Reward) => {
    if (myCoins < r.cost) {
      Alert.alert('Insufficient Coins', `You need ${r.cost} 🪙 but only have ${myCoins} 🪙`);
      return;
    }
    // No real choice to make — redeem straight from whichever single jar
    // covers it (prefer Main Coins first, matching how coins already read
    // as "the" balance everywhere else in the app).
    if (myGpCoins === 0 || myMainCoins >= r.cost) {
      Alert.alert('Redeem Perk?', `Redeem "${r.title}" for ${r.cost} 🪙?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem', onPress: () => redeemFrom(r, 'mainCoins') },
      ]);
      return;
    }
    if (myMainCoins === 0) {
      Alert.alert('Redeem Perk?', `Redeem "${r.title}" for ${r.cost} 🪙 from your Grandparent Bonus jar?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem', onPress: () => redeemFrom(r, 'gpCoins') },
      ]);
      return;
    }
    // Genuine choice — neither jar alone covers it OR both could, let the
    // kid pick which one to spend from instead of silently pooling them.
    setJarPickerTarget(r);
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

        {/* ── Kids' Piggy Banks & Wishlists ── parent-only at-a-glance view
            of every kid/teen's balance and their closest wishlist goal —
            replaces the old standalone Ledger tab, which is now removed;
            this is the one place a parent checks kids' coin balances. */}
        {isParent && kids.length > 0 && (
          <View style={{ paddingHorizontal: 12, marginBottom: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginBottom: 10 }}>
              Kids' Piggy Banks & Wishlists
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {kids.map(kid => {
                const kidCoins = ((kid as any).mainCoins ?? 0) + ((kid as any).gpCoins ?? 0);
                const dollars = (kidCoins * pointsToFiatRatio).toFixed(2);
                const goal = goalForKid(kid.id, kidCoins);
                const pct = goal ? Math.min(kidCoins / goal.cost, 1) : 0;
                const streak = (kid as any).streak ?? 0;
                return (
                  <View key={kid.id} style={{
                    flexGrow: 1, minWidth: '46%', borderRadius: 18, padding: 16, alignItems: 'center',
                    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                  }}>
                    <Text style={{ fontSize: 32, marginBottom: 6 }}>{kid.emoji ?? '🙂'}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 }}>
                      {kid.name.split(' ')[0]}
                    </Text>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: BRAND.teal, marginBottom: 8 }}>
                      ${dollars}
                    </Text>
                    {streak > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12,
                        paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
                        backgroundColor: colors.amberLight }}>
                        <Flame size={12} color={colors.amber} />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.amber }}>
                          {streak}-day streak
                        </Text>
                      </View>
                    )}
                    {goal && (
                      <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }} numberOfLines={1}>
                            Goal: {goal.title}
                          </Text>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textPrimary }}>
                            {Math.round(pct * 100)}%
                          </Text>
                        </View>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 3, backgroundColor: BRAND.teal }} />
                        </View>
                      </View>
                    )}
                    <Pressable onPress={() => { setGrantAmount(''); setGrantTarget({ id: kid.id, name: kid.name }); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12,
                        borderRadius: 10, borderWidth: 1, borderColor: colors.amber + '60',
                        backgroundColor: colors.amberLight, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Ionicons name="gift-outline" size={13} color={colors.amber} />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.amber }}>Grant Coins</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
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
                  isGoal={isKid && activeMember?.goalRewardId === r.id}
                  onToggleGoal={isKid ? (target) => {
                    if (!activeMember) return;
                    const nextGoalId = activeMember.goalRewardId === target.id ? undefined : target.id;
                    useFamilyStore.getState().updateMember(activeMember.id, { goalRewardId: nextGoalId });
                  } : undefined}
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

      <JarPickerModal
        reward={jarPickerTarget}
        mainCoins={myMainCoins}
        gpCoins={myGpCoins}
        colors={colors}
        isDark={isDark}
        onClose={() => setJarPickerTarget(null)}
        onPick={wallet => {
          if (jarPickerTarget) redeemFrom(jarPickerTarget, wallet);
          setJarPickerTarget(null);
        }}
      />

      {/* Grant Coins — relocated from the removed standalone Ledger tab. */}
      <Modal visible={!!grantTarget} transparent animationType="fade" onRequestClose={() => setGrantTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ borderRadius: 18, padding: 20, backgroundColor: colors.card }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginBottom: 4 }}>
              Grant Coins
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 14 }}>
              Give {grantTarget?.name?.split(' ')[0]} a bonus, no chore required.
            </Text>
            <TextInput
              value={grantAmount} onChangeText={setGrantAmount} keyboardType="numeric"
              placeholder="e.g. 25" placeholderTextColor={colors.textTertiary}
              style={{ borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, color: colors.textPrimary,
                backgroundColor: colors.surface, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15, fontWeight: '700', marginBottom: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setGrantTarget(null)}
                style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const n = parseInt(grantAmount, 10);
                  if (!n || n <= 0 || !grantTarget) return;
                  awardCoins(grantTarget.id, n, 'mainCoins');
                  setGrantTarget(null);
                }}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.amber }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Grant</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Jar picker ────────────────────────────────────────────────────────────────
// Only shown when the kid genuinely has a choice — neither wallet alone
// covers the cost, or both do. Redeeming used to always silently pool
// mainCoins + gpCoins together; this makes the two jars actually separate
// and spendable on purpose, not just a cosmetic split.
function JarPickerModal({ reward, mainCoins, gpCoins, colors, isDark, onClose, onPick }: {
  reward: Reward | null; mainCoins: number; gpCoins: number; colors: any; isDark: boolean;
  onClose: () => void; onPick: (wallet: 'mainCoins' | 'gpCoins') => void;
}) {
  if (!reward) return null;
  const jars: { key: 'mainCoins' | 'gpCoins'; label: string; balance: number; emoji: string; color: string }[] = [
    { key: 'mainCoins', label: 'Main Coins', balance: mainCoins, emoji: '🪙', color: BRAND.amber },
    { key: 'gpCoins', label: 'Grandparent Bonus', balance: gpCoins, emoji: '⭐', color: BRAND.purple },
  ];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
        activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}
          style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 14 }}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>Pay with which jar?</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            "{reward.title}" costs {reward.cost} 🪙
          </Text>
          {jars.map(j => {
            const affordable = j.balance >= reward.cost;
            return (
              <TouchableOpacity key={j.key} disabled={!affordable} onPress={() => onPick(j.key)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14,
                  borderWidth: 1.5, borderColor: affordable ? j.color + '60' : colors.border,
                  backgroundColor: affordable ? j.color + '12' : colors.surface,
                  padding: 14, opacity: affordable ? 1 : 0.5 }}>
                <Text style={{ fontSize: 22 }}>{j.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{j.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
                    {j.balance} 🪙 available{!affordable ? ' — not enough' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
