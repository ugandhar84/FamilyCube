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
import { TYPO, LETTER_SPACING } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useRewardStore, Reward } from '@/store/rewardStore';
import { useChoreStore } from '@/store/choreStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';
import { Flame } from 'lucide-react-native';
import { showToast } from '@/components/AppToast';

// ─── Category config ──────────────────────────────────────────────────────────
// Each category maps to a brand token (not raw hex) so the badge always
// agrees with PerkCard's icon-chip accent for the same category — Treats/
// amber, Experiences/lavender, Screen Time/info-blue, Privileges/sage,
// Special/danger.

const CAT_LABELS: Record<string, string> = {
  Treats:        '🟡 Treats',
  Experiences:   '🟣 Experiences',
  'Screen Time': '🔵 Screen Time',
  Privileges:    '🟢 Privileges',
  Special:       '⭐ Special',
};

// 'Special' is the catch-all most user-created perks end up tagged as (no
// dedicated category fits), so a fixed color for it made a grid of mostly-
// Special perks look like one repeated card. Special (and anything
// unmapped) instead cycles through the brand palette by grid position —
// real categories (Treats/Experiences/Screen Time/Privileges) stay fixed
// since those already carry distinct meaning.
const SPECIAL_CYCLE = ['danger', 'accent', 'teal', 'amber'] as const;

function categoryAccent(category: string | undefined, colors: any, index = 0): string {
  const map: Record<string, string> = {
    Treats: colors.amber, Experiences: colors.accent, 'Screen Time': colors.info,
    Privileges: colors.teal,
  };
  if (category && map[category]) return map[category];
  return colors[SPECIAL_CYCLE[index % SPECIAL_CYCLE.length]];
}

function CategoryBadge({ category, index = 0, colors, isDark }: { category?: string; index?: number; colors: any; isDark: boolean }) {
  const accent = categoryAccent(category, colors, index);
  const label = CAT_LABELS[category ?? 'Special'] ?? CAT_LABELS.Special;
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
      backgroundColor: isDark ? accent + '28' : accent + '20', marginBottom: 6 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: isDark ? colors.textPrimary : accent, letterSpacing: 0.3 }}>
        {label}
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
    <View style={{ backgroundColor: colors.pinkLight,
      borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 14, borderRadius: 18, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>✨</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.accent }}>
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
            <CategoryBadge category={s.category} colors={colors} isDark={isDark} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
              {s.title}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '900', color: colors.amber, marginBottom: 4 }}>
              {s.cost} 🪙
            </Text>
            <Text style={{ fontSize: 10, color: colors.textSecondary, marginBottom: 8, lineHeight: 14 }}>
              {s.reason}
            </Text>
            <Pressable onPress={() => onAdd(s)}
              style={{ backgroundColor: colors.accent,
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

function PerkCard({ reward, index = 0, myCoins, isKid, isParent, canRedeemSelf, colors, isDark, onRedeem, onEdit, isGoal, onToggleGoal }: {
  reward: Reward; index?: number; myCoins: number; isKid: boolean; isParent: boolean;
  // Was isKid-only, so teen and senior roles — both of whom earn coins
  // elsewhere in the app with nowhere else to spend them — got a
  // permanently-disabled card with no redeem action at all (QA sweep,
  // full-app per-role audit, Critical for both roles).
  canRedeemSelf: boolean;
  colors: any; isDark: boolean;
  onRedeem: (r: Reward) => void; onEdit: (r: Reward) => void;
  isGoal?: boolean; onToggleGoal?: (r: Reward) => void;
}) {
  const canRedeem = canRedeemSelf && myCoins >= reward.cost;
  // Each category gets its own brand tint instead of every card defaulting
  // to amber — see categoryAccent() — so the grid reads as distinct
  // categories at a glance instead of one repeated tan tile.
  const accent = categoryAccent(reward.category, colors, index);
  return (
    <Pressable
      onLongPress={isParent ? () => onEdit(reward) : undefined}
      delayLongPress={350}
      style={[s.perkCard, { backgroundColor: isDark ? accent + '20' : accent + '1E', borderColor: accent + (isDark ? '55' : '40'), shadowColor: accent, overflow: 'hidden' }]}>

      {/* Icon circle — solid-tint chip matching the Hub quick-action tiles'
          bold "badge" treatment, not a bare floating emoji on a wash.
          ~85% opacity rather than fully solid — a 44px block at full
          opacity on every card read as a heavy dark square. */}
      <View style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 8,
        backgroundColor: accent + 'D9',
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22 }}>{reward.emoji ?? '🎁'}</Text>
      </View>
      <CategoryBadge category={reward.category} index={index} colors={colors} isDark={isDark} />
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
        {reward.title}
      </Text>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.amber, marginBottom: 4 }}>
        {reward.cost} Coins 🪙
      </Text>
      {reward.description ? (
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, lineHeight: 14, marginBottom: 4 }}>
          {reward.description}
        </Text>
      ) : null}

      {canRedeemSelf ? (
        <>
          <Pressable onPress={() => onRedeem(reward)} disabled={!canRedeem}
            style={[s.redeemBtn, { backgroundColor: canRedeem ? colors.teal : colors.border, marginTop: 8 }]}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: canRedeem ? colors.textInverse : colors.textTertiary }}>
              {canRedeem ? 'Redeem Perk' : `Need ${reward.cost - myCoins} more 🪙`}
            </Text>
          </Pressable>
          {isKid && onToggleGoal && (
            <Pressable onPress={() => onToggleGoal(reward)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
              <Ionicons name={isGoal ? 'star' : 'star-outline'} size={13} color={isGoal ? colors.amber : colors.textTertiary} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: isGoal ? colors.amber : colors.textTertiary }}>
                {isGoal ? 'My Goal' : 'Set as My Goal'}
              </Text>
            </Pressable>
          )}
        </>
      ) : isParent ? (
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
          Hold to edit
        </Text>
      ) : (
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center', marginTop: 8 }}>
          Not available for your role
        </Text>
      )}
    </Pressable>
  );
}

// ─── Create / Edit Perk Modal ─────────────────────────────────────────────────

const CATEGORIES = ['Treats', 'Experiences', 'Screen Time', 'Privileges', 'Special'];
const EMOJIS = ['🎮','🎬','🍕','🎂','🏖️','🎪','📱','🛍️','🎁','⭐','🏆','🎵','🎨','🎯','🚀'];

function PerkModal({ visible, editing, colors, onClose, onSave, onDelete }: {
  visible: boolean; editing?: Reward | null; colors: any;
  onClose: () => void; onSave: (data: any) => void; onDelete?: (r: Reward) => void;
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
            maxHeight: '90%', backgroundColor: colors.card,
            borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8 }}>

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
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 10 }}>
              <Pressable onPress={submit}
                style={[s.submitBtn, { backgroundColor: name.trim() ? colors.teal : colors.border }]}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                  {editing ? 'Save Changes' : 'Publish Perk to Family Store'}
                </Text>
              </Pressable>
              {editing && onDelete && (
                <Pressable onPress={() => onDelete(editing)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>Delete Perk</Text>
                </Pressable>
              )}
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
  const { rewards, redemptions, loadFromStorage: loadRewards, addReward, updateReward, deleteReward, redeemReward, approveRedemption, rejectRedemption } = useRewardStore();
  const pointsToFiatRatio = useChoreStore(s => s.householdSettings.pointsToFiatRatio);
  const currencySymbol = useChoreStore(s => s.householdSettings.currencySymbol);

  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);
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
  // Was isKid/isParent-only, so teen AND senior both fell through to the
  // else-branch: a bare title with no balance, and every perk card showing
  // the literal text "Kid Mode Required" with no redeem action — despite
  // both roles genuinely earning coins elsewhere (teens via quests,
  // seniors via gpCoins/Send Bonus in SeniorView's Hub) and having no other
  // place in the app to spend them (QA sweep, full-app per-role audit,
  // Critical for both roles). redeemFrom/handleRedeem below already sum
  // BOTH wallets and are fully role-agnostic — only the UI gating was
  // narrow.
  const canRedeemSelf = isKid || activeMember?.role === 'teen' || activeMember?.role === 'senior';
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
  const redeemFrom = async (r: Reward, wallet: 'mainCoins' | 'gpCoins') => {
    if (!activeMember) return;
    const ok = await redeemReward(r.id, activeMember.id, wallet);
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
        onPress: () => { deleteReward?.(r.id); showToast('Reward deleted'); } },
    ]);
  };

  const handleAddAiSuggestion = (s: { title: string; category: string; cost: number; emoji: string; reason: string }) => {
    addReward?.({
      title: s.title, category: s.category, cost: s.cost, emoji: s.emoji,
      description: s.reason, available: true, requiresApproval: true,
      createdAt: new Date().toISOString(),
    } as any);
    showToast(`"${s.title}" added to the store`);
  };

  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={hideHeader ? [] : ['top']}>
      {!hideHeader && (
        <AppHeader
          memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
          memberRole={activeMember?.role ?? 'parent'}
          memberEmoji={activeMember?.emoji}
          memberAvatarUrl={activeMember?.avatarUrl}
          notifCount={unreadNotifCount}
          onPersonaPress={() => setSwitcherOpen(true)}
          onBellPress={() => setNotifPanelOpen(true)}
        />
      )}
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Page title row ── AI Perks/Add Perk moved down next to the
            perks grid itself (below), so this top row stays a plain title +
            balance and doesn't compete with Redemptions/Approvals/Piggy
            Banks for attention right under the header. */}
        <View style={[s.header, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>
            Family Perks Store
          </Text>
          {canRedeemSelf && (
            <View style={[s.coinBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary }}>
                Balance: <Text style={{ color: colors.amber, fontWeight: '900' }}>{myCoins} 🪙</Text>
              </Text>
            </View>
          )}
        </View>

        {/* ── My Redemptions ── redeeming was fire-and-forget (a one-time
            Alert, then nothing) — a kid/teen/senior who redeemed a perk had
            no way to check whether it was still pending or already
            fulfilled anywhere in the app (QA sweep, full-app per-role
            audit, High). The parent-only "Kids' Piggy Banks" glance below
            never substituted for this — that's a parent's view of OTHERS'
            balances, not a self-view of one's own redemption history. */}
        {canRedeemSelf && activeMember && (() => {
          const mine = redemptions
            .filter(r => r.memberId === activeMember.id)
            .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
            .slice(0, 5);
          if (mine.length === 0) return null;
          const statusMeta: Record<string, { label: string; color: string }> = {
            pending:   { label: 'Pending',   color: colors.warning },
            approved:  { label: 'Fulfilled', color: colors.success },
            rejected:  { label: 'Declined',  color: colors.danger },
            cancelled: { label: 'Cancelled', color: colors.textTertiary },
          };
          return (
            <View style={{ paddingHorizontal: 12, marginBottom: 10 }}>
              <Text style={{ fontSize: TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
                textTransform: 'uppercase', letterSpacing: LETTER_SPACING.sectionLabel, marginBottom: 8 }}>
                My Redemptions
              </Text>
              <View style={{ gap: 6 }}>
                {mine.map(r => {
                  const reward = rewards.find(rw => rw.id === r.rewardId);
                  const meta = statusMeta[r.status] ?? statusMeta.pending;
                  return (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                      paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text style={{ fontSize: 16 }}>{reward?.emoji ?? '🎁'}</Text>
                      <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                        {reward?.title ?? 'Perk'}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary }}>{r.deductedCoins} 🪙</Text>
                      <View style={{ backgroundColor: meta.color + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: meta.color }}>{meta.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* ── Pending Approvals ── a reward with requiresApproval:true
            created a real, fully-implemented Redemption record (pending →
            approved/rejected, with coin refund on reject) — approveRedemption/
            rejectRedemption were both correct and DB-synced, but NO call site
            anywhere in the app ever invoked either: a kid's "requires
            approval" redemption was permanently stuck in Pending forever,
            with zero UI for a parent, on either device, to actually decide
            it (QA sweep, parent-role audit, Critical C1). */}
        {isParent && (() => {
          const pending = redemptions.filter(r => r.status === 'pending');
          if (pending.length === 0) return null;
          return (
            <View style={{ paddingHorizontal: 12, marginBottom: 4 }}>
              <Text style={{ fontSize: TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
                textTransform: 'uppercase', letterSpacing: LETTER_SPACING.sectionLabel, marginBottom: 10 }}>
                Pending Approvals ({pending.length})
              </Text>
              <View style={{ gap: 8 }}>
                {pending.map(rd => {
                  const reward = rewards.find(r => r.id === rd.rewardId);
                  const kid = members.find(m => m.id === rd.memberId);
                  return (
                    <View key={rd.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                      paddingHorizontal: 12, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 22 }}>{reward?.emoji ?? '🎁'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
                          {reward?.title ?? 'Perk'}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                          {kid?.name.split(' ')[0] ?? 'A kid'} · {rd.deductedCoins} 🪙
                        </Text>
                      </View>
                      <Pressable onPress={() => { rejectRedemption(rd.id, activeMemberId ?? ''); showToast('Redemption rejected'); }}
                        style={{ padding: 8, borderRadius: 10, backgroundColor: colors.danger + '18' }}>
                        <Ionicons name="close" size={16} color={colors.danger} />
                      </Pressable>
                      <Pressable onPress={() => { approveRedemption(rd.id, activeMemberId ?? ''); showToast('Redemption approved'); }}
                        style={{ padding: 8, borderRadius: 10, backgroundColor: colors.teal + '18' }}>
                        <Ionicons name="checkmark" size={16} color={colors.teal} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* ── Kids' Piggy Banks & Wishlists ── parent-only at-a-glance view
            of every kid/teen's balance and their closest wishlist goal —
            replaces the old standalone Ledger tab, which is now removed;
            this is the one place a parent checks kids' coin balances. */}
        {isParent && kids.length > 0 && (
          <View style={{ paddingHorizontal: 12, marginBottom: 4 }}>
            <Text style={{ fontSize: TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
              textTransform: 'uppercase', letterSpacing: LETTER_SPACING.sectionLabel, marginBottom: 10 }}>
              Kids' Piggy Banks & Wishlists
            </Text>
            {/* Fixed 3-column grid (was 2-up via minWidth:'46%') — card
                Fixed 2-column grid (was full-width single column via
                minWidth:'46%' with only 1 fitting per row at larger sizes;
                also tried a denser 3-up pass, landed on 2x2 as the better
                balance of legibility vs. density). */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {kids.map(kid => {
                const kidCoins = ((kid as any).mainCoins ?? 0) + ((kid as any).gpCoins ?? 0);
                const dollars = (kidCoins * pointsToFiatRatio).toFixed(2);
                const goal = goalForKid(kid.id, kidCoins);
                const pct = goal ? Math.min(kidCoins / goal.cost, 1) : 0;
                const streak = (kid as any).streak ?? 0;
                return (
                  <View key={kid.id} style={{
                    width: '48%', borderRadius: 18, padding: 14, alignItems: 'center',
                    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.teal + (isDark ? '55' : '40'),
                    shadowColor: colors.teal, shadowOpacity: 0.1, shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 }, elevation: 3, overflow: 'hidden',
                  }}>
                    <LinearGradient
                      colors={[colors.teal + '20', colors.teal + '00']}
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
                    <View style={{ width: 48, height: 48, borderRadius: 14, marginBottom: 8,
                      backgroundColor: colors.teal + '25', borderWidth: 1, borderColor: colors.teal + '45',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 24 }}>{kid.emoji ?? '🙂'}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginBottom: 5 }} numberOfLines={1}>
                      {kid.name.split(' ')[0]}
                    </Text>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: BRAND.teal, marginBottom: 7 }}>
                      {currencySymbol}{dollars}
                    </Text>
                    {streak > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 11,
                        paddingHorizontal: 9, paddingVertical: 4, marginBottom: 8,
                        backgroundColor: colors.amberLight }}>
                        <Flame size={11} color={colors.amber} />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.amber }}>
                          {streak}-day streak
                        </Text>
                      </View>
                    )}
                    {goal && (
                      <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary, marginBottom: 5 }} numberOfLines={1}>
                          Goal: {goal.title}
                        </Text>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 3, backgroundColor: BRAND.teal }} />
                        </View>
                        {/* % moved below the bar, right-aligned — was
                            crammed into the same row as the goal title with
                            no truncation guard on the title, so a longer
                            goal name could crowd or push the percentage. */}
                        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textPrimary, textAlign: 'right', marginTop: 4 }}>
                          {Math.round(pct * 100)}%
                        </Text>
                      </View>
                    )}
                    <Pressable onPress={() => { setGrantAmount(''); setGrantTarget({ id: kid.id, name: kid.name }); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10,
                        borderRadius: 10, borderWidth: 1, borderColor: colors.amber + '60',
                        backgroundColor: colors.amberLight, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Ionicons name="gift-outline" size={12} color={colors.amber} />
                      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.amber }}>Grant Coins</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ padding: 12 }}>
          {/* This row (AI Perks/Add Perk) and everything below it is the
              actual perks catalog — previously had no heading at all, so
              the buttons floated with no context for what section they
              belonged to. */}
          <Text style={{ fontSize: TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
            textTransform: 'uppercase', letterSpacing: LETTER_SPACING.sectionLabel, marginBottom: 10 }}>
            Available Perks
          </Text>
          {isParent && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <Pressable onPress={() => setShowAiPanel(v => !v)}
                style={[s.createBtn, { backgroundColor: showAiPanel ? colors.accent : colors.accent + 'CC' }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>✨ AI Perks</Text>
              </Pressable>
              <Pressable onPress={() => { setEditing(null); setShowCreate(true); }}
                style={[s.createBtn, { backgroundColor: colors.teal }]}>
                <Ionicons name="add" size={14} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff', marginLeft: 3 }}>Add Perk</Text>
              </Pressable>
            </View>
          )}

          {isParent && showAiPanel && (
            <AiPerksPanel
              onAdd={handleAddAiSuggestion}
              onClose={() => setShowAiPanel(false)}
              colors={colors}
              isDark={isDark}
            />
          )}

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
              {rewards.map((r, i) => (
                <PerkCard key={r.id} reward={r} index={i} myCoins={myCoins}
                  isKid={isKid} isParent={isParent} canRedeemSelf={canRedeemSelf} colors={colors} isDark={isDark}
                  onRedeem={handleRedeem}
                  onEdit={r => { setEditing(r); setShowCreate(true); }}
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
          if (editing) { updateReward?.(editing.id, data); showToast('Reward updated'); }
          else { addReward?.({ available: true, requiresApproval: true,
            createdAt: new Date().toISOString(), ...data } as any); showToast('Reward added'); }
        }}
        onDelete={r => { setShowCreate(false); setEditing(null); handleDelete(r); }}
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
          <View style={{ borderRadius: 18, padding: 20, backgroundColor: colors.card,
            borderWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
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
          style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 14,
            borderWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
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
