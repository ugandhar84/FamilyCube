import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore, FamilyMember } from '@/store/familyStore';
import { useQuestStore, Quest, QuestStatus, QuestCategory } from '@/store/questStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_TABS: { key: QuestStatus | 'all' | 'pool'; label: string }[] = [
  { key: 'all',              label: 'All'      },
  { key: 'todo',             label: 'To Do'    },
  { key: 'claimed',          label: 'In Progress' },
  { key: 'pending_approval', label: 'Review'   },
  { key: 'done',             label: 'Done'     },
  { key: 'pool',             label: '🎯 Pool'  },
];

const CATEGORIES: QuestCategory[] = ['Kitchen', 'Room', 'Yard', 'School', 'Pet', 'Living Room', 'Other'];
const CAT_EMOJI: Record<QuestCategory, string> = {
  Kitchen: '🍽️', Room: '🛏️', Yard: '🌿', School: '📚', Pet: '🐾', 'Living Room': '🛋️', Other: '✨',
};

const SUGGESTIONS = [
  { label: '🍽️ Wash dishes', cat: 'Kitchen' as QuestCategory },
  { label: '🗑️ Take out trash', cat: 'Kitchen' as QuestCategory },
  { label: '🧹 Sweep floor', cat: 'Living Room' as QuestCategory },
  { label: '🧺 Do laundry', cat: 'Room' as QuestCategory },
  { label: '🛏️ Make the bed', cat: 'Room' as QuestCategory },
  { label: '🐾 Feed the pet', cat: 'Pet' as QuestCategory },
  { label: '🚿 Clean bathroom', cat: 'Room' as QuestCategory },
  { label: '🌿 Water plants', cat: 'Yard' as QuestCategory },
  { label: '📚 Homework done', cat: 'School' as QuestCategory },
  { label: '♻️ Sort recycling', cat: 'Yard' as QuestCategory },
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

// ─── Avatar chip ──────────────────────────────────────────────────────────────

function AvatarChip({ member, selected, onPress }: {
  member: FamilyMember; selected: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  const color = member.role === 'parent' ? colors.parent : colors.kid;
  return (
    <Pressable onPress={onPress} style={[styles.avatarChip, {
      backgroundColor: selected ? color + '25' : colors.surface,
      borderColor: selected ? color : colors.border,
    }]}>
      <Text style={{ fontSize: 18 }}>{member.emoji ?? member.name[0]}</Text>
      <Text style={[styles.chipName, { color: selected ? color : colors.textSecondary }]}>
        {member.name.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

// ─── Quest card ───────────────────────────────────────────────────────────────

function QuestCard({ quest, members, isParent, activeMemberId, onClaim, onSubmit, onApprove, onDecline, onDelete }: {
  quest: Quest;
  members: FamilyMember[];
  isParent: boolean;
  activeMemberId: string;
  onClaim: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const assignee = members.find(m => m.id === quest.assignedToId);

  const statusColor: Record<QuestStatus, string> = {
    todo:             colors.textTertiary,
    claimed:          colors.primary,
    pending_approval: colors.warning,
    done:             colors.parent,
  };
  const statusLabel: Record<QuestStatus, string> = {
    todo:             'To Do',
    claimed:          'In Progress',
    pending_approval: '⏳ Review',
    done:             '✅ Done',
  };

  return (
    <View style={[styles.questCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.questHeader}>
        <View style={[styles.catBadge, { backgroundColor: colors.primaryLight }]}>
          <Text style={{ fontSize: 12 }}>{CAT_EMOJI[quest.category]}</Text>
          <Text style={[styles.catText, { color: colors.primary }]}>{quest.category}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {quest.isDaily && (
            <View style={[styles.badge, { backgroundColor: colors.accent + '20' }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>Daily</Text>
            </View>
          )}
          {quest.isPool && (
            <View style={[styles.badge, { backgroundColor: colors.warning + '20' }]}>
              <Text style={[styles.badgeText, { color: colors.warning }]}>Pool</Text>
            </View>
          )}
          <Text style={[styles.statusText, { color: statusColor[quest.status] }]}>
            {statusLabel[quest.status]}
          </Text>
        </View>
      </View>

      {/* Title + due */}
      <Text style={[styles.questTitle, { color: colors.textPrimary }]}>{quest.title}</Text>
      {quest.dueDate && (
        <Text style={[styles.questDue, { color: colors.textTertiary }]}>
          📅 Due {formatDate(quest.dueDate)}
        </Text>
      )}

      {/* Assignee + coins */}
      <View style={styles.questFooter}>
        <View style={styles.questAssignee}>
          {assignee ? (
            <>
              <Text style={{ fontSize: 16 }}>{assignee.emoji ?? assignee.name[0]}</Text>
              <Text style={[styles.assigneeName, { color: colors.textSecondary }]}>
                {assignee.name.split(' ')[0]}
              </Text>
            </>
          ) : (
            <Text style={[styles.assigneeName, { color: colors.textTertiary }]}>Unassigned</Text>
          )}
        </View>
        <View style={[styles.coinPill, { backgroundColor: colors.kidLight }]}>
          <Text style={[styles.coinPillText, { color: colors.kid }]}>🪙 {quest.coins}</Text>
          <Text style={[styles.coinPillText, { color: colors.primary, marginLeft: 8 }]}>+{quest.xpReward}XP</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.questActions}>
        {quest.isPool && quest.status === 'todo' && (
          <Pressable style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={onClaim}>
            <Text style={styles.actionBtnText}>🙋 Claim Quest</Text>
          </Pressable>
        )}
        {quest.status === 'claimed' && quest.assignedToId === activeMemberId && (
          <Pressable style={[styles.actionBtn, { backgroundColor: colors.parent }]} onPress={onSubmit}>
            <Text style={styles.actionBtnText}>✅ Mark Done</Text>
          </Pressable>
        )}
        {quest.status === 'pending_approval' && isParent && (
          <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.parent, flex: 1 }]} onPress={onApprove}>
              <Text style={styles.actionBtnText}>✅ Approve</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: colors.danger, flex: 1 }]} onPress={onDecline}>
              <Text style={styles.actionBtnText}>↩️ Decline</Text>
            </Pressable>
          </View>
        )}
        {isParent && (
          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        )}
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

  const filtered = SUGGESTIONS.filter(s =>
    !title.trim() || s.label.toLowerCase().includes(title.toLowerCase().trim())
  );

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
        <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Pressable onPress={() => { reset(); onClose(); }}>
              <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>New Quest</Text>
            <Pressable onPress={handleAdd} disabled={!title.trim()}>
              <Text style={[styles.modalSave, { color: title.trim() ? colors.primary : colors.textTertiary }]}>Add</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Quest Title *</Text>
              <TextInput
                value={title} onChangeText={setTitle}
                placeholder="What needs to be done?"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              {/* Suggestion chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {filtered.map(s => (
                  <Pressable key={s.label} onPress={() => { setTitle(s.label.replace(/^[^\w\s]*\s/, '')); setCategory(s.cat); }}
                    style={[styles.suggChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.suggText, { color: colors.textSecondary }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Coins */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>🪙 Coin Reward</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[10, 20, 30, 50, 100].map(c => (
                  <Pressable key={c} onPress={() => setCoins(String(c))}
                    style={[styles.coinOption, {
                      backgroundColor: coins === String(c) ? colors.kid + '20' : colors.surface,
                      borderColor: coins === String(c) ? colors.kid : colors.border,
                    }]}>
                    <Text style={[{ color: coins === String(c) ? colors.kid : colors.textSecondary, fontWeight: '700', fontSize: 13 }]}>{c}</Text>
                  </Pressable>
                ))}
                <TextInput
                  value={coins} onChangeText={setCoins} keyboardType="numeric"
                  style={[styles.coinCustom, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                />
              </View>
            </View>

            {/* Category */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <Pressable key={cat} onPress={() => setCategory(cat)}
                    style={[styles.catChip, {
                      backgroundColor: category === cat ? colors.primary + '20' : colors.surface,
                      borderColor: category === cat ? colors.primary : colors.border,
                    }]}>
                    <Text>{CAT_EMOJI[cat]}</Text>
                    <Text style={[{ color: category === cat ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '600' }]}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Pool toggle */}
            <Pressable onPress={() => setIsPool(!isPool)}
              style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>🎯 Pool Quest</Text>
                <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>Anyone can claim this</Text>
              </View>
              <View style={[styles.toggle, { backgroundColor: isPool ? colors.primary : colors.border }]}>
                <View style={[styles.toggleThumb, { left: isPool ? 22 : 2 }]} />
              </View>
            </Pressable>

            {/* Assign to */}
            {!isPool && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Assign To</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {members.map(m => (
                    <AvatarChip key={m.id} member={m} selected={assignedToId === m.id}
                      onPress={() => setAssignedToId(assignedToId === m.id ? undefined : m.id)} />
                  ))}
                </ScrollView>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Quests Screen ────────────────────────────────────────────────────────────

export default function QuestsScreen() {
  const { colors } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { quests, loadFromStorage: loadQuests, claimQuest, submitQuest, approveQuest, declineQuest, deleteQuest, addQuest } = useQuestStore();

  const [filter, setFilter] = useState<QuestStatus | 'all' | 'pool'>('all');
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const fabAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadQuests(); }, []);

  const active = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';

  const filtered = quests.filter(q => {
    if (filter === 'pool') return q.isPool && q.status === 'todo';
    if (filter !== 'all' && q.status !== filter) return false;
    if (memberFilter && q.assignedToId !== memberFilter) return false;
    if (!isParent) {
      // Kids only see their own quests + pool quests
      if (q.status !== 'todo' || !q.isPool) {
        if (q.assignedToId !== activeMemberId) return false;
      }
    }
    return true;
  });

  const pendingCount = quests.filter(q => q.status === 'pending_approval').length;

  const animFab = () => {
    Animated.sequence([
      Animated.spring(fabAnim, { toValue: 0.9, useNativeDriver: true, tension: 300, friction: 6 }),
      Animated.spring(fabAnim, { toValue: 1,   useNativeDriver: true, tension: 260, friction: 7 }),
    ]).start();
    setShowNew(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Quests</Text>
          <Text style={[styles.screenSub, { color: colors.textSecondary }]}>
            {isParent ? `${pendingCount} pending approval` : `${quests.filter(q => q.assignedToId === activeMemberId && q.status === 'todo').length} to complete`}
          </Text>
        </View>
        <Pressable onPress={animFab} style={[styles.newBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      {/* Member filter chips (parents only) */}
      {isParent && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
          <Pressable onPress={() => setMemberFilter(null)}
            style={[styles.filterChip, {
              backgroundColor: !memberFilter ? colors.primary + '20' : colors.surface,
              borderColor: !memberFilter ? colors.primary : colors.border,
            }]}>
            <Text style={[{ color: !memberFilter ? colors.primary : colors.textSecondary, fontWeight: '600', fontSize: 12 }]}>Everyone</Text>
          </Pressable>
          {members.map(m => (
            <AvatarChip key={m.id} member={m} selected={memberFilter === m.id}
              onPress={() => setMemberFilter(memberFilter === m.id ? null : m.id)} />
          ))}
        </ScrollView>
      )}

      {/* Status tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
        {STATUS_TABS.map(tab => {
          const count = tab.key === 'pool'
            ? quests.filter(q => q.isPool && q.status === 'todo').length
            : tab.key === 'all' ? quests.length
            : quests.filter(q => q.status === tab.key).length;
          return (
            <Pressable key={tab.key} onPress={() => setFilter(tab.key)}
              style={[styles.statusTab, {
                backgroundColor: filter === tab.key ? colors.primary : colors.surface,
                borderColor: filter === tab.key ? colors.primary : colors.border,
              }]}>
              <Text style={[styles.statusTabText, { color: filter === tab.key ? '#fff' : colors.textSecondary }]}>
                {tab.label} {count > 0 ? `(${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Quest list */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🎯</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All clear!</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>No quests here. Tap + New to add one.</Text>
          </View>
        ) : (
          filtered.map(q => (
            <QuestCard
              key={q.id} quest={q} members={members} isParent={isParent}
              activeMemberId={activeMemberId ?? ''}
              onClaim={() => claimQuest(q.id, activeMemberId ?? '')}
              onSubmit={() => submitQuest(q.id)}
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
      <Animated.View style={[styles.fab, { transform: [{ scale: fabAnim }] }]}>
        <Pressable onPress={animFab} style={[styles.fabBtn, { backgroundColor: colors.primary }]}>
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

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  screenTitle:  { fontSize: TYPO.heading, fontWeight: '800' },
  screenSub:    { fontSize: TYPO.caption, marginTop: 2 },
  newBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },

  avatarChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  chipName:     { fontSize: 12, fontWeight: '600' },
  filterChip:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, justifyContent: 'center' },

  statusTab:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  statusTabText:{ fontSize: 12, fontWeight: '600' },

  questCard:    { borderRadius: RADIUS.xl, borderWidth: 1, padding: 14, gap: 8 },
  questHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  catText:      { fontSize: 11, fontWeight: '600' },
  badge:        { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText:    { fontSize: 10, fontWeight: '700' },
  statusText:   { fontSize: 11, fontWeight: '700' },
  questTitle:   { fontSize: TYPO.body, fontWeight: '700' },
  questDue:     { fontSize: 12 },
  questFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  questAssignee:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  assigneeName: { fontSize: 13, fontWeight: '500' },
  coinPill:     { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  coinPillText: { fontSize: 12, fontWeight: '700' },
  questActions: { flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' },
  actionBtn:    { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  actionBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  deleteBtn:    { padding: 8 },

  empty:        { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:   { fontSize: 20, fontWeight: '700' },
  emptySub:     { fontSize: 14, textAlign: 'center' },

  fab:          { position: 'absolute', bottom: 24, right: 20 },
  fabBtn:       { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 8 },

  // Modal
  modalSheet:   { flex: 1 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  modalTitle:   { fontSize: 17, fontWeight: '700' },
  modalCancel:  { fontSize: 16 },
  modalSave:    { fontSize: 16, fontWeight: '700' },
  label:        { fontSize: 13, fontWeight: '600' },
  input:        { borderWidth: 1, borderRadius: RADIUS.md, padding: 12, fontSize: TYPO.body },
  suggChip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  suggText:     { fontSize: 12, fontWeight: '500' },
  coinOption:   { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, minWidth: 40, alignItems: 'center' },
  coinCustom:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, width: 56, textAlign: 'center' },
  catChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  toggleRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: RADIUS.lg, borderWidth: 1 },
  toggleLabel:  { fontSize: 15, fontWeight: '600' },
  toggleSub:    { fontSize: 12, marginTop: 2 },
  toggle:       { width: 44, height: 24, borderRadius: 12, position: 'relative' },
  toggleThumb:  { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', top: 2 },
});
