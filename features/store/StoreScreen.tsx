import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useRewardStore, Reward } from '@/store/rewardStore';
import { familyAi } from '@/lib/familyAiService';
import type { RewardCategory } from '@/store/rewardStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ['All', 'Treats', 'Experiences', 'Screen Time', 'Privileges'] as const;
type FilterCat = typeof CATEGORIES[number];

const PERK_CATEGORIES = ['Treats', 'Experiences', 'Screen Time', 'Privileges'] as const;
type PerkCat = typeof PERK_CATEGORIES[number];

const CAT_COLORS: Record<string, string> = {
  Treats:       '#F59E0B',
  Experiences:  '#8B5CF6',
  'Screen Time':'#3B82F6',
  Privileges:   '#10B981',
};

const EMOJI_OPTIONS = [
  '🍕','🎟️','🚀','🎮','🍿','🎪','🍦','📚',
  '🌙','🎨','⚽','🎯','🏊','🎸','🍔','🎁',
];

// ─── Category badge ───────────────────────────────────────────────────────────

function CatBadge({ category }: { category: string }) {
  const color = CAT_COLORS[category] ?? '#6B7280';
  return (
    <View style={{ borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2,
      alignSelf: 'flex-start', backgroundColor: color + '20', borderColor: color + '55' }}>
      <Text style={{ fontSize: 9, fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {category}
      </Text>
    </View>
  );
}

// ─── Perk card ────────────────────────────────────────────────────────────────

function PerkCard({ reward, isKid, coins, onRedeem, onEdit, onDelete, colors, isDark }: {
  reward: Reward; isKid: boolean; coins: number;
  onRedeem: () => void; onEdit: () => void; onDelete: () => void;
  colors: any; isDark: boolean;
}) {
  const canAfford = coins >= reward.cost && (reward.available ?? true);

  return (
    <View style={[pc.card, { backgroundColor: isDark ? '#131927' : colors.card, borderColor: colors.border }]}>
      <View style={{ gap: 6, flex: 1 }}>
        {/* Top row: emoji + parent actions */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 30 }}>{reward.emoji ?? '🎁'}</Text>
          {!isKid && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable onPress={onEdit} hitSlop={8}>
                <Ionicons name="pencil-outline" size={14} color={colors.textTertiary} />
              </Pressable>
              <Pressable onPress={onDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={14} color="#EF4444" />
              </Pressable>
            </View>
          )}
        </View>
        <Text style={[pc.title, { color: colors.textPrimary }]} numberOfLines={2}>{reward.title}</Text>
        <CatBadge category={reward.category ?? 'Treats'} />
        <Text style={pc.coins}>{reward.cost} Coins 🪙</Text>
      </View>

      {isKid ? (
        <Pressable style={[pc.redeemBtn, { opacity: canAfford ? 1 : 0.45 }]} onPress={onRedeem}>
          <Ionicons name="gift-outline" size={13} color="#fff" />
          <Text style={pc.redeemText}>Redeem</Text>
        </Pressable>
      ) : (
        <Text style={[pc.catalogLabel, { color: colors.textTertiary }]}>Parent Catalog View</Text>
      )}
    </View>
  );
}

const pc = StyleSheet.create({
  card:        { borderRadius: 24, borderWidth: 1, padding: 14, flex: 1, gap: 10, justifyContent: 'space-between' },
  title:       { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  coins:       { fontSize: 10, color: '#F59E0B', fontWeight: '800' },
  redeemBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 9 },
  redeemText:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  catalogLabel:{ fontSize: 10, textAlign: 'center' },
});

// ─── AI Perks panel ───────────────────────────────────────────────────────────

interface AiSuggestion { title: string; coins: number; category: string; targetKid: string; motivationReason: string; icon: string; }

function AiPerksPanel({ suggestions, loading, onAdd, onDismiss }: {
  suggestions: AiSuggestion[]; loading: boolean;
  onAdd: (s: AiSuggestion) => void; onDismiss: () => void;
}) {
  const [added, setAdded] = useState<Set<string>>(new Set());

  const handleAdd = (s: AiSuggestion) => {
    setAdded(prev => new Set([...prev, s.title]));
    onAdd(s);
  };

  return (
    <View style={{ borderRadius: 20, borderWidth: 1.5, padding: 14, gap: 12,
      backgroundColor: '#0D1117', borderColor: 'rgba(139,92,246,0.4)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.25)', paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(139,92,246,0.2)',
            alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={14} color="#A78BFA" />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#A78BFA' }}>CubeAI Perk Suggestions</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={10}>
          <Text style={{ fontSize: 12, color: '#7C3AED', fontWeight: '600' }}>✕ Close</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <ActivityIndicator color="#8B5CF6" size="small" />
          <Text style={{ fontSize: 12, color: '#A78BFA', fontStyle: 'italic' }}>
            Analyzing kids' behavior and generating perks…
          </Text>
        </View>
      ) : suggestions.length === 0 ? (
        <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', paddingVertical: 8 }}>
          No suggestions available.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {suggestions.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              padding: 12, borderRadius: 16, backgroundColor: 'rgba(139,92,246,0.1)',
              borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)' }}>
              <Text style={{ fontSize: 24 }}>{s.icon}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#F1F5F9' }}>{s.title}</Text>
                <Text style={{ fontSize: 10, color: '#A78BFA' }} numberOfLines={1}>
                  {s.motivationReason}{s.targetKid ? ` · ${s.targetKid}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <View style={{ backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: 10,
                  paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#FCD34D' }}>{s.coins} 🪙</Text>
                </View>
                {added.has(s.title) ? (
                  <View style={{ backgroundColor: '#10B981', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>✓ Added</Text>
                  </View>
                ) : (
                  <Pressable onPress={() => handleAdd(s)} style={{ backgroundColor: '#10B981',
                    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>+ Add</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Create / Edit Perk sheet ─────────────────────────────────────────────────

function PerkSheet({ visible, editing, onClose, onSave, colors }: {
  visible: boolean; editing: Reward | null;
  onClose: () => void; onSave: (r: Partial<Reward>) => void; colors: any;
}) {
  const insets = useSafeAreaInsets();
  const isEdit = !!editing;

  const [title,    setTitle]    = useState('');
  const [coins,    setCoins]    = useState('50');
  const [category, setCategory] = useState<PerkCat>('Treats');
  const [icon,     setIcon]     = useState('🎁');

  useEffect(() => {
    setTitle(editing?.title ?? '');
    setCoins(String(editing?.cost ?? 50));
    setCategory((editing?.category as PerkCat) ?? 'Treats');
    setIcon(editing?.emoji ?? '🎁');
  }, [editing, visible]);

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) { Alert.alert('Title required'); return; }
    const cost = parseInt(coins, 10);
    if (!cost || cost < 1) { Alert.alert('Enter a valid coin cost'); return; }
    onSave({ title: trimmed, emoji: icon, cost, category: category as RewardCategory, available: true, requiresApproval: true });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[sh.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[sh.handle, { backgroundColor: colors.border }]} />
          <View style={[sh.sheetHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={isEdit ? 'pencil' : 'add-circle'} size={20} color="#10B981" />
              <Text style={[sh.sheetTitle, { color: colors.textPrimary }]}>
                {isEdit ? 'Edit Perk' : 'Create Store Perk'}
              </Text>
            </View>
            <Pressable onPress={onClose} style={[sh.closeBtn, { backgroundColor: colors.surface }]} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 16, padding: 20 }} bounces={false} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 6 }}>
              <Text style={[sh.label, { color: colors.textSecondary }]}>Perk Title</Text>
              <TextInput
                style={[sh.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                value={title} onChangeText={setTitle}
                placeholder="e.g. Movie Night Choice"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[sh.label, { color: colors.textSecondary }]}>Coin Cost</Text>
                <TextInput
                  style={[sh.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  value={coins} onChangeText={setCoins} keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 2, gap: 6 }}>
                <Text style={[sh.label, { color: colors.textSecondary }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {PERK_CATEGORIES.map(c => {
                      const color = CAT_COLORS[c];
                      const active = category === c;
                      return (
                        <Pressable key={c} onPress={() => setCategory(c)} style={{
                          borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
                          backgroundColor: active ? color : color + '18',
                          borderWidth: 1, borderColor: active ? color : color + '44',
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : color }}>{c}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[sh.label, { color: colors.textSecondary }]}>Emoji Icon</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {EMOJI_OPTIONS.map(e => (
                  <Pressable key={e} onPress={() => setIcon(e)} style={{
                    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: icon === e ? '#10B981' : colors.border,
                    backgroundColor: icon === e ? '#10B98120' : colors.surface,
                  }}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable style={sh.publishBtn} onPress={handleSave}>
              <Text style={sh.publishText}>{isEdit ? 'Save Changes' : 'Publish to Family Store'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const sh = StyleSheet.create({
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%' },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle:  { fontSize: 14, fontWeight: '700' },
  closeBtn:    { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label:       { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  input:       { borderRadius: 12, borderWidth: 1, padding: 11, fontSize: 13 },
  publishBtn:  { backgroundColor: '#10B981', borderRadius: 20, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  publishText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StoreScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const { rewards, loadFromStorage, redeemReward, addReward, updateReward, deleteReward } = useRewardStore();

  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [editing,      setEditing]      = useState<Reward | null>(null);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [selectedCat,  setSelectedCat]  = useState<FilterCat>('All');
  const [aiOpen,       setAiOpen]       = useState(false);
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiSuggestions,setAiSuggestions]= useState<AiSuggestion[]>([]);

  useEffect(() => { loadFromStorage(); }, []);

  const active   = members.find(m => m.id === activeMemberId) ?? members[0];
  const isKid    = active?.role === 'kid';
  const coins    = active ? ((active as any).mainCoins ?? (active as any).coins ?? 0) : 0;

  const filtered = rewards.filter(r => {
    const matchCat = selectedCat === 'All' || r.category === selectedCat;
    const matchQ   = r.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQ;
  });

  const rows: Reward[][] = [];
  for (let i = 0; i < filtered.length; i += 2) rows.push(filtered.slice(i, i + 2));

  const handleRedeem = (r: Reward) => {
    if (coins < r.cost) {
      Alert.alert('Not enough coins', `You need ${r.cost} coins but only have ${coins}.`);
      return;
    }
    Alert.alert(
      'Redeem Perk?',
      `${r.emoji ?? '🎁'} ${r.title} — ${r.cost} Coins\n\nThis will be deducted from your wallet.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem!', onPress: () => {
          redeemReward(r.id, active?.id ?? '');
          Alert.alert('🎉 Perk Claimed!', `"${r.title}" redeemed. Show this to a parent!`);
        }},
      ],
    );
  };

  const handleDelete = (r: Reward) => {
    Alert.alert('Delete Perk?', `Remove "${r.title}" from the store?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReward?.(r.id) ?? setSheetOpen(false) },
    ]);
  };

  const handleSave = (partial: Partial<Reward>) => {
    if (editing) {
      updateReward?.(editing.id, partial as any);
    } else {
      addReward(partial as any);
    }
    setEditing(null);
  };

  const handleRunAi = async () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const kids = members.filter(m => m.role === 'kid').map(m => ({
        name: m.name, age: (m as any).age ?? 10, coins: (m as any).mainCoins ?? 0,
      }));
      const result = await familyAi.suggestRewards(kids);
      setAiSuggestions((result as any).personalizedPerks ?? []);
    } catch {
      Alert.alert('AI Error', 'Could not fetch perk suggestions. Try again.');
      setAiOpen(false);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddSuggestion = (s: AiSuggestion) => {
    addReward({
      title: s.title, emoji: s.icon, cost: s.coins,
      category: s.category as RewardCategory, available: true, requiresApproval: true,
    } as any);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Family Perks Store</Text>
          {isKid ? (
            <View style={[s.balanceBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="bag-handle-outline" size={11} color="#F59E0B" />
              <Text style={[s.balanceText, { color: colors.textSecondary }]}>
                {' '}<Text style={{ color: '#F59E0B', fontWeight: '900' }}>{coins} 🪙</Text>
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={s.aiBtn} onPress={handleRunAi}>
                <Ionicons name="sparkles" size={13} color="#FCD34D" />
                <Text style={s.aiBtnText}>AI Perks</Text>
              </Pressable>
              <Pressable style={s.addBtn} onPress={() => { setEditing(null); setSheetOpen(true); }}>
                <Ionicons name="add" size={15} color="#fff" />
                <Text style={s.addBtnText}>Add Perk</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Note ── */}
        <Text style={[s.note, { color: colors.textTertiary }]}>
          Store perks are redeemed from your Main Parent Wallet. Grandparent Bonus coins are cashed out via parents.
        </Text>

        {/* ── AI Panel ── */}
        {aiOpen && (
          <AiPerksPanel
            suggestions={aiSuggestions}
            loading={aiLoading}
            onAdd={handleAddSuggestion}
            onDismiss={() => { setAiOpen(false); setAiSuggestions([]); }}
          />
        )}

        {/* ── Search ── */}
        <View style={[s.searchWrap, { backgroundColor: isDark ? colors.card : '#F1F5F9', borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={15} color={colors.textTertiary} />
          <TextInput
            style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder="Filter perks by name…"
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        {/* ── Category pills ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {CATEGORIES.map(cat => {
            const active = selectedCat === cat;
            const color  = cat === 'All' ? colors.primary : (CAT_COLORS[cat] ?? colors.primary);
            return (
              <Pressable key={cat} onPress={() => setSelectedCat(cat)} style={[s.catPill, {
                backgroundColor: active ? color : (isDark ? colors.card : '#F1F5F9'),
                borderColor: active ? color : colors.border,
              }]}>
                <Text style={[s.catPillText, { color: active ? '#fff' : colors.textSecondary }]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Grid ── */}
        {filtered.length > 0 ? (
          <View style={{ gap: 12 }}>
            {rows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: 12 }}>
                {row.map(r => (
                  <PerkCard
                    key={r.id} reward={r} isKid={isKid} coins={coins}
                    colors={colors} isDark={isDark}
                    onRedeem={() => handleRedeem(r)}
                    onEdit={() => { setEditing(r); setSheetOpen(true); }}
                    onDelete={() => handleDelete(r)}
                  />
                ))}
                {row.length === 1 && <View style={{ flex: 1 }} />}
              </View>
            ))}
          </View>
        ) : (
          <View style={s.empty}>
            <Text style={{ fontSize: 44, marginBottom: 10 }}>🎁</Text>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {searchQuery || selectedCat !== 'All' ? 'No matching perks' : 'No perks yet'}
            </Text>
            <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>
              {searchQuery || selectedCat !== 'All'
                ? 'Try a different filter or search.'
                : isKid ? 'Ask a parent to add perks for you!' : 'Tap "Add Perk" to create the first one.'}
            </Text>
          </View>
        )}
      </ScrollView>

      <PerkSheet
        visible={sheetOpen}
        editing={editing}
        onClose={() => { setSheetOpen(false); setEditing(null); }}
        onSave={handleSave}
        colors={colors}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: '900', flex: 1 },
  balanceBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5 },
  balanceText: { fontSize: 10, fontWeight: '700' },
  aiBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#7C3AED',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  aiBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B981',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  note:        { fontSize: 10, lineHeight: 15 },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  catPill:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  catPillText: { fontSize: 12, fontWeight: '700' },
  empty:       { alignItems: 'center', paddingVertical: 60 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyDesc:   { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
