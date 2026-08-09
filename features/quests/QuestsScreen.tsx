import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore, Quest, QuestStatus, QuestCategory } from '@/store/questStore';
import { TYPO, RADIUS } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';

const CATEGORIES: QuestCategory[] = ['Kitchen', 'Room', 'Yard', 'School', 'Pet', 'Living Room', 'Other'];
const CAT_EMOJI: Record<QuestCategory, string> = {
  Kitchen: '🍽️', Room: '🛏️', Yard: '🌿', School: '📚', Pet: '🐾', 'Living Room': '🛋️', Other: '✨',
};

const SUGGESTIONS = [
  { label: 'Wash dishes', cat: 'Kitchen' as QuestCategory },
  { label: 'Take out trash', cat: 'Kitchen' as QuestCategory },
  { label: 'Sweep floor', cat: 'Living Room' as QuestCategory },
  { label: 'Do laundry', cat: 'Room' as QuestCategory },
  { label: 'Make the bed', cat: 'Room' as QuestCategory },
  { label: 'Feed the pet', cat: 'Pet' as QuestCategory },
  { label: 'Clean bathroom', cat: 'Room' as QuestCategory },
  { label: 'Water plants', cat: 'Yard' as QuestCategory },
  { label: 'Homework done', cat: 'School' as QuestCategory },
];

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Parent quest card (spec layout) ─────────────────────────────────────────

function ParentQuestCard({ quest, members, activeMemberId, onApprove, onDecline, onDelete }: {
  quest: Quest; members: FamilyMember[]; activeMemberId: string;
  onApprove: () => void; onDecline: () => void; onDelete: () => void;
}) {
  const { colors } = useTheme();
  const assignee = members.find(m => m.id === quest.assignedToId);
  const isReview = quest.status === 'pending_approval';
  const isDone   = quest.status === 'done';

  return (
    <View style={[s.card, {
      backgroundColor: colors.card, borderColor: colors.border,
      borderLeftWidth: isReview ? 3 : 1,
      borderLeftColor: isReview ? colors.warning : colors.border,
    }]}>
      {/* Row 1 — category + assignee + status */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[s.catBadge, { backgroundColor: colors.primaryLight }]}>
          <Text style={{ fontSize: 11 }}>{CAT_EMOJI[quest.category]}</Text>
          <Text style={[s.catText, { color: colors.primary }]}>{quest.category}</Text>
        </View>
        {assignee && (
          <View style={[s.assigneeBadge, {
            backgroundColor: (assignee.role === 'parent' ? colors.parentLight : colors.kidLight),
          }]}>
            <Text style={{ fontSize: 12 }}>{assignee.emoji ?? assignee.name[0]}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: assignee.role === 'parent' ? colors.parent : colors.kidDark }}>
              {assignee.name.split(' ')[0]}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <View style={[s.statusBadge, {
          backgroundColor: isDone ? colors.parentLight : isReview ? colors.amberLight : colors.surface,
        }]}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDone ? colors.parent : isReview ? colors.amberDark : colors.textTertiary }}>
            {isDone ? '✓ Done' : isReview ? 'In Review' : quest.status === 'claimed' ? 'In Progress' : 'To Do'}
          </Text>
        </View>
      </View>

      {/* Row 2 — title + coin */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
          {quest.title}
        </Text>
        <View style={[s.coinPill, { backgroundColor: colors.kidLight }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.kidDark }}>🪙 {quest.coins}</Text>
        </View>
      </View>

      {quest.dueDate && (
        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 2 }}>
          Due {formatDate(quest.dueDate)}
        </Text>
      )}

      {/* Row 4 — actions (only for review) */}
      {isReview && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable
            onPress={onApprove}
            style={{ flex: 1, backgroundColor: colors.parent, borderRadius: RADIUS.md, paddingVertical: 9, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Approve</Text>
          </Pressable>
          <Pressable
            onPress={onDecline}
            style={{ flex: 1, borderWidth: 1.5, borderColor: colors.danger + '60', borderRadius: RADIUS.md, paddingVertical: 9, alignItems: 'center' }}
          >
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Decline</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={{ padding: 9 }}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
      {!isReview && (
        <Pressable onPress={onDelete} style={{ position: 'absolute', top: 10, right: 10 }}>
          <Ionicons name="trash-outline" size={14} color={colors.textTertiary} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Kid quest card (simple checklist style) ──────────────────────────────────

function KidQuestCard({ quest, activeMemberId, onSubmit, onClaim, colors }: {
  quest: Quest; activeMemberId: string;
  onSubmit: () => void; onClaim: () => void; colors: any;
}) {
  const canClaim  = quest.isPool && quest.status === 'todo';
  const canSubmit = quest.status === 'claimed' && quest.assignedToId === activeMemberId;
  const isDone    = quest.status === 'done';
  const isPending = quest.status === 'pending_approval';

  return (
    <View style={[s.kidCard, {
      backgroundColor: isDone ? colors.parentLight : colors.card,
      borderColor: isDone ? colors.parent + '30' : colors.border,
      opacity: isDone ? 0.7 : 1,
    }]}>
      {/* Checkbox */}
      <Pressable
        onPress={canSubmit ? onSubmit : canClaim ? onClaim : undefined}
        style={[s.checkbox, {
          backgroundColor: isDone ? colors.parent : isPending ? colors.amberLight : colors.surface,
          borderColor: isDone ? colors.parent : isPending ? colors.amber : colors.border,
          borderWidth: 2,
        }]}
      >
        {isDone    && <Ionicons name="checkmark" size={14} color="#fff" />}
        {isPending && <Ionicons name="time-outline" size={14} color={colors.amber} />}
      </Pressable>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: TYPO.caption, fontWeight: '700',
          color: isDone ? colors.parent : colors.textPrimary,
          textDecorationLine: isDone ? 'line-through' : 'none',
        }}>
          {quest.title}
        </Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 2 }}>
          {CAT_EMOJI[quest.category]} {quest.category}
          {quest.dueDate ? `  · Due ${formatDate(quest.dueDate)}` : ''}
        </Text>
      </View>

      {/* Coin chip */}
      <View style={[s.coinPill, { backgroundColor: isDone ? colors.parent + '20' : colors.kidLight }]}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: isDone ? colors.parent : colors.kidDark }}>
          +{quest.coins} 🪙
        </Text>
      </View>
    </View>
  );
}

// ─── New Quest Modal ──────────────────────────────────────────────────────────

function NewQuestModal({ visible, members, onClose, onAdd, activeMemberId }: {
  visible: boolean; members: FamilyMember[];
  onClose: () => void; onAdd: (q: any) => void; activeMemberId: string;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [coins, setCoins] = useState('30');
  const [category, setCategory] = useState<QuestCategory>('Kitchen');
  const [assignedToId, setAssignedToId] = useState<string | undefined>(undefined);
  const [isPool, setIsPool] = useState(false);

  const reset = () => { setTitle(''); setCoins('30'); setCategory('Kitchen'); setAssignedToId(undefined); setIsPool(false); };

  const handleAdd = () => {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(), coins: Number(coins) || 30,
      xpReward: Math.round((Number(coins) || 30) * 0.7),
      category, assignedToId: isPool ? undefined : (assignedToId || activeMemberId),
      isPool, status: 'todo',
      dueDate: new Date().toISOString().split('T')[0],
    });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => { reset(); onClose(); }}>
              <Text style={{ fontSize: 16, color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>New Quest</Text>
            <Pressable onPress={handleAdd} disabled={!title.trim()}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: title.trim() ? colors.primary : colors.textTertiary }}>Add</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <View style={{ gap: 8 }}>
              <Text style={s.label2}>Quest Title</Text>
              <TextInput
                value={title} onChangeText={setTitle}
                placeholder="What needs to be done?"
                placeholderTextColor={colors.textTertiary}
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {SUGGESTIONS.filter(s2 => !title.trim() || s2.label.toLowerCase().includes(title.toLowerCase())).map(sg => (
                  <Pressable key={sg.label} onPress={() => { setTitle(sg.label); setCategory(sg.cat); }}
                    style={[s.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>{CAT_EMOJI[sg.cat]} {sg.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Coins */}
            <View style={{ gap: 8 }}>
              <Text style={s.label2}>Coin Reward</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[10, 20, 30, 50, 100].map(c => (
                  <Pressable key={c} onPress={() => setCoins(String(c))}
                    style={[s.coinOpt, {
                      backgroundColor: coins === String(c) ? colors.kidLight : colors.surface,
                      borderColor: coins === String(c) ? colors.kid : colors.border,
                    }]}>
                    <Text style={{ color: coins === String(c) ? colors.kidDark : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
                      🪙 {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Category */}
            <View style={{ gap: 8 }}>
              <Text style={s.label2}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <Pressable key={cat} onPress={() => setCategory(cat)}
                    style={[s.chip, {
                      backgroundColor: category === cat ? colors.primaryLight : colors.surface,
                      borderColor: category === cat ? colors.primary : colors.border,
                    }]}>
                    <Text style={{ fontSize: 13 }}>{CAT_EMOJI[cat]}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: category === cat ? colors.primary : colors.textSecondary }}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Assign */}
            <View style={{ gap: 8 }}>
              <Text style={s.label2}>Assign To</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {members.map(m => {
                  const sel = assignedToId === m.id;
                  const accent = m.role === 'parent' ? colors.parent : colors.kid;
                  return (
                    <Pressable key={m.id} onPress={() => setAssignedToId(sel ? undefined : m.id)}
                      style={[s.chip, {
                        backgroundColor: sel ? accent + '20' : colors.surface,
                        borderColor: sel ? accent : colors.border,
                      }]}>
                      <Text style={{ fontSize: 16 }}>{m.emoji ?? m.name[0]}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? accent : colors.textSecondary }}>
                        {m.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type StatusTab = 'review' | 'todo' | 'done';

export default function QuestsScreen() {
  const { colors } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { quests, loadFromStorage: loadQuests, claimQuest, submitQuest, approveQuest, declineQuest, deleteQuest, addQuest } = useQuestStore();

  const [statusTab, setStatusTab] = useState<StatusTab>('todo');
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const fabAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadQuests(); }, []);

  const active   = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';

  const reviewCount = quests.filter(q => q.status === 'pending_approval').length;
  const todoCount   = quests.filter(q => q.status === 'todo' || q.status === 'claimed').length;
  const doneCount   = quests.filter(q => q.status === 'done').length;

  const statusFilter = (q: Quest) => {
    if (statusTab === 'review') return q.status === 'pending_approval';
    if (statusTab === 'done')   return q.status === 'done';
    return q.status === 'todo' || q.status === 'claimed';
  };

  const parentFiltered = quests.filter(q => {
    if (!statusFilter(q)) return false;
    if (memberFilter && q.assignedToId !== memberFilter) return false;
    return true;
  });

  const kidQuests = quests.filter(q => {
    if (q.isPool && q.status === 'todo') return true;
    return q.assignedToId === activeMemberId;
  });

  const animFab = () => {
    Animated.sequence([
      Animated.spring(fabAnim, { toValue: 0.88, useNativeDriver: true, tension: 300, friction: 6 }),
      Animated.spring(fabAnim, { toValue: 1,    useNativeDriver: true, tension: 260, friction: 7 }),
    ]).start();
    setShowNew(true);
  };

  // ── Kid view ──────────────────────────────────────────────────────────────
  if (!isParent) {
    const morning   = kidQuests.filter((_, i) => i < 2);
    const afterSchool = kidQuests.filter((_, i) => i >= 2 && i < 4);
    const evening   = kidQuests.filter((_, i) => i >= 4);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        {/* Kid header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[s.screenTitle, { color: colors.textPrimary }]}>My Quests</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
              {kidQuests.filter(q => q.status !== 'done' && q.status !== 'pending_approval').length} remaining today
            </Text>
          </View>
          <View style={[s.coinBadge, { backgroundColor: colors.kidLight }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.kidDark }}>🪙 {active?.coins ?? 0}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
          {[
            { label: '🌅 Morning', items: morning },
            { label: '📚 After School', items: afterSchool },
            { label: '🌙 Evening', items: evening },
          ].filter(g => g.items.length > 0).map(group => (
            <View key={group.label}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {group.label}
              </Text>
              <View style={{ gap: 8 }}>
                {group.items.map(q => (
                  <KidQuestCard
                    key={q.id} quest={q} activeMemberId={activeMemberId ?? ''}
                    colors={colors}
                    onSubmit={() => submitQuest(q.id)}
                    onClaim={() => claimQuest(q.id, activeMemberId ?? '')}
                  />
                ))}
              </View>
            </View>
          ))}

          {kidQuests.length === 0 && (
            <View style={s.empty}>
              <Text style={{ fontSize: 48 }}>🎉</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>All done!</Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>No quests today. Check back tomorrow!</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Parent view ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.screenTitle, { color: colors.textPrimary }]}>Quests</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
            {reviewCount > 0 ? `${reviewCount} pending approval` : 'Family task board'}
          </Text>
        </View>
        <Pressable onPress={animFab} style={[s.addBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>New Quest</Text>
        </Pressable>
      </View>

      {/* Member filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, gap: 8 }}>
        <Pressable onPress={() => setMemberFilter(null)}
          style={[s.chip, {
            backgroundColor: !memberFilter ? colors.primaryLight : colors.surface,
            borderColor: !memberFilter ? colors.primary : colors.border,
          }]}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: !memberFilter ? colors.primary : colors.textSecondary }}>
            All
          </Text>
        </Pressable>
        {members.map(m => {
          const sel   = memberFilter === m.id;
          const accent = m.role === 'parent' ? colors.parent : colors.kid;
          return (
            <Pressable key={m.id} onPress={() => setMemberFilter(sel ? null : m.id)}
              style={[s.chip, {
                backgroundColor: sel ? accent + '20' : colors.surface,
                borderColor: sel ? accent : colors.border,
              }]}>
              <Text style={{ fontSize: 16 }}>{m.emoji ?? m.name[0]}</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? accent : colors.textSecondary }}>
                {m.name.split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Status tabs */}
      <View style={[s.statusBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {[
          { key: 'review' as StatusTab, label: 'Review', count: reviewCount, activeColor: colors.warning },
          { key: 'todo'   as StatusTab, label: 'To Do',  count: todoCount,   activeColor: colors.primary },
          { key: 'done'   as StatusTab, label: 'Done',   count: doneCount,   activeColor: colors.parent  },
        ].map(tab => (
          <Pressable key={tab.key} onPress={() => setStatusTab(tab.key)} style={[s.statusTabBtn, {
            borderBottomWidth: statusTab === tab.key ? 2 : 0,
            borderBottomColor: tab.activeColor,
          }]}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: statusTab === tab.key ? '800' : '500',
              color: statusTab === tab.key ? tab.activeColor : colors.textSecondary }}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[s.tabBadge, { backgroundColor: statusTab === tab.key ? tab.activeColor : colors.border }]}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: statusTab === tab.key ? '#fff' : colors.textSecondary }}>
                  {tab.count}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* Quest list */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 110 }}>
        {parentFiltered.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>✓</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>
              {statusTab === 'review' ? 'No pending approvals' : statusTab === 'done' ? 'Nothing done yet' : 'All clear!'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
              {statusTab === 'todo' ? 'Tap + New Quest to add tasks for the family.' : ''}
            </Text>
          </View>
        ) : (
          parentFiltered.map(q => (
            <ParentQuestCard
              key={q.id} quest={q} members={members} activeMemberId={activeMemberId ?? ''}
              onApprove={() => approveQuest(q.id)}
              onDecline={() => declineQuest(q.id)}
              onDelete={() => Alert.alert('Delete Quest', 'Remove this quest?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteQuest(q.id) },
              ])}
            />
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <Animated.View style={[s.fab, { transform: [{ scale: fabAnim }] }]}>
        <Pressable onPress={animFab} style={[s.fabBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </Animated.View>

      <NewQuestModal
        visible={showNew} members={members}
        onClose={() => setShowNew(false)} onAdd={addQuest}
        activeMemberId={activeMemberId ?? ''}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  screenTitle:{ fontSize: TYPO.heading, fontWeight: '800' },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  coinBadge:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full },

  chip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1.5 },

  statusBar:  { flexDirection: 'row', borderBottomWidth: 1, marginHorizontal: 16, borderRadius: RADIUS.md, overflow: 'hidden' },
  statusTabBtn:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 },
  tabBadge:   { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },

  // Cards
  card:       { borderRadius: RADIUS.xl, borderWidth: 1, padding: 14, position: 'relative' },
  catBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  catText:    { fontSize: 10, fontWeight: '700' },
  assigneeBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  statusBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  coinPill:   { paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full },

  kidCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.lg, borderWidth: 1, padding: 12 },
  checkbox:   { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },

  fab:        { position: 'absolute', bottom: 24, right: 20 },
  fabBtn:     { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 8 },

  modalHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  label2:     { fontSize: 13, fontWeight: '600', color: '#64748B' },
  input:      { borderWidth: 1, borderRadius: RADIUS.md, padding: 12, fontSize: TYPO.body },
  coinOpt:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center' },
});
