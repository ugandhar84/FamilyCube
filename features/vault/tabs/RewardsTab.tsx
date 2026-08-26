import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Gift, Plus, Coins, ChevronRight, X, Check, Trash2 } from 'lucide-react-native';
import { useRewardStore } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import { SCard, CardHeader, MemberAvatar, StatusPill, AddBtn, EmptyState } from './shared';
import { TYPO } from '@/constants/theme';

const CAT_EMOJI: Record<string, string> = {
  'Screen Time': '📱', Food: '🍔', Activity: '🏃', Shopping: '🛍️',
  Special: '⭐', Experience: '🎡',
};

const CATEGORIES = ['Screen Time', 'Food', 'Activity', 'Shopping', 'Special', 'Experience'];

// ─── Add/Edit Reward Modal ────────────────────────────────────────────────────

function RewardModal({ visible, onClose, onSave, initial, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSave: (data: any) => void;
  initial?: any; colors: any; isDark: boolean;
}) {
  const [title,    setTitle]    = useState(initial?.title    ?? '');
  const [cost,     setCost]     = useState(String(initial?.cost ?? ''));
  const [category, setCategory] = useState(initial?.category ?? 'Special');
  const [emoji,    setEmoji]    = useState(initial?.emoji    ?? '🎁');

  const handleSave = () => {
    if (!title.trim() || !cost) return;
    onSave({ title: title.trim(), cost: parseInt(cost), category, emoji, available: true });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary, marginBottom: 16 }}>
              {initial ? 'Edit Reward' : 'New Reward'}
            </Text>

            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Title</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="30 min Screen Time…"
              placeholderTextColor={colors.placeholder}
              style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body, color: colors.textPrimary, marginBottom: 12 }} />

            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Coin Cost</Text>
            <TextInput value={cost} onChangeText={setCost} placeholder="50" keyboardType="number-pad"
              placeholderTextColor={colors.placeholder}
              style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                paddingHorizontal: 12, paddingVertical: 10, fontSize: TYPO.body, color: colors.textPrimary, marginBottom: 12 }} />

            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, marginBottom: 20 }}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} onPress={() => setCategory(c)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                    borderColor: category === c ? colors.accent : colors.border,
                    backgroundColor: category === c ? colors.accent + '18' : 'transparent' }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                    color: category === c ? colors.accent : colors.textSecondary }}>
                    {CAT_EMOJI[c]} {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity onPress={handleSave}
              style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.accent }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>
                {initial ? 'Save Changes' : 'Add Reward'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── RewardsTab ───────────────────────────────────────────────────────────────

export default function RewardsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const rewards   = useRewardStore(s => s.rewards);
  const addReward = useRewardStore(s => s.addReward);
  const { members } = useFamilyStore();

  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab]         = useState<'catalog' | 'kids'>('catalog');

  const kids = members.filter(m => m.role === 'kid');

  return (
    <View style={{ gap: 12 }}>
      {/* Summary row */}
      <SCard colors={colors} isDark={isDark} accent={colors.accent}>
        <CardHeader Icon={Gift} iconColor={colors.accent} title="Rewards Store" colors={colors}
          onAction={() => setShowAdd(true)} actionLabel="Add" />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1, backgroundColor: isDark ? '#1A1030' : '#F5F3FF', borderRadius: 14,
            padding: 12, borderWidth: 1, borderColor: colors.accent + '25', alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.accent }}>{rewards.length}</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Rewards</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: isDark ? '#2D2008' : '#FFFBEB', borderRadius: 14,
            padding: 12, borderWidth: 1, borderColor: '#F59E0B25', alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#F59E0B' }}>
              {rewards.filter((r: any) => r.available !== false).length}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Active</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: isDark ? '#0D2A1E' : '#ECFDF5', borderRadius: 14,
            padding: 12, borderWidth: 1, borderColor: '#10B98125', alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#10B981' }}>
              {kids.length}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Kids</Text>
          </View>
        </View>
      </SCard>

      {/* Sub-tabs */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['catalog', 'kids'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 14, alignItems: 'center',
              borderWidth: 1.5, backgroundColor: tab === t ? colors.accent : 'transparent',
              borderColor: tab === t ? colors.accent : colors.border }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800',
              color: tab === t ? '#fff' : colors.textSecondary }}>
              {t === 'catalog' ? '🎁 Catalog' : '👧 Kids Balances'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Catalog */}
      {tab === 'catalog' && (
        <SCard colors={colors} isDark={isDark} accent={colors.accent}>
          {rewards.length === 0
            ? <EmptyState Icon={Gift} label="No rewards yet" colors={colors} />
            : rewards.map((r: any, i: number) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 12, borderBottomWidth: i < rewards.length - 1 ? 1 : 0,
                borderBottomColor: colors.border }}>
                <View style={{ width: 42, height: 42, borderRadius: 13,
                  backgroundColor: isDark ? '#1A1030' : '#F5F3FF',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>{r.emoji ?? CAT_EMOJI[r.category] ?? '🎁'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}
                    numberOfLines={1}>{r.title}</Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }}>
                    {r.category} · {r.available !== false ? 'Active' : 'Hidden'}
                  </Text>
                </View>
                <View style={{ backgroundColor: isDark ? '#2D2008' : '#FFFBEB', borderRadius: 10,
                  paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#F59E0B30' }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#F59E0B' }}>
                    🪙 {r.cost}
                  </Text>
                </View>
              </View>
            ))
          }
        </SCard>
      )}

      {/* Kids balances */}
      {tab === 'kids' && (
        <SCard colors={colors} isDark={isDark} accent={colors.accent}>
          {kids.length === 0
            ? <EmptyState Icon={Coins} label="No kids yet" colors={colors} />
            : kids.map((kid, i) => (
              <View key={kid.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 12, borderBottomWidth: i < kids.length - 1 ? 1 : 0,
                borderBottomColor: colors.border }}>
                <MemberAvatar name={kid.name} color={colors.accent} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                    {kid.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <View style={{ height: 5, flex: 1, borderRadius: 3,
                      backgroundColor: colors.border, overflow: 'hidden' }}>
                      <View style={{ height: '100%', borderRadius: 3,
                        width: `${Math.min((kid.coins / 500) * 100, 100)}%`,
                        backgroundColor: colors.accent }} />
                    </View>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                      {kid.coins} / 500
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: isDark ? '#1A1030' : '#F5F3FF', borderRadius: 10,
                  paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.accent + '30' }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.accent }}>
                    🪙 {kid.coins}
                  </Text>
                </View>
              </View>
            ))
          }
        </SCard>
      )}

      <RewardModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={(data) => addReward(data)}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
}
