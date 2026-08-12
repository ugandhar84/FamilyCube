import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore, Quest, QuestStatus, QuestCategory } from '@/store/questStore';
import type { FamilyMember } from '@/store/familyStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: QuestCategory[] = [
  'Kitchen', 'Room', 'Yard', 'School', 'Pet', 'Living Room', 'Errand', 'Tech', 'Other',
];

const CAT_EMOJI: Record<QuestCategory, string> = {
  Kitchen: '🍽️', Room: '🛏️', Yard: '🌿', School: '📚',
  Pet: '🐾', 'Living Room': '🛋️', Errand: '🏃', Tech: '💻', Other: '✨',
};

const STATUS_LABEL: Record<QuestStatus, string> = {
  todo: 'To Do', claimed: 'In Progress', pending_approval: 'In Review',
  approved: 'Approved', done: 'Paid ✓', declined: 'Declined',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── QuestCard ────────────────────────────────────────────────────────────────

function QuestCard({ quest, members, activeMember, isParent, onApprove, onDecline, onClaim, onSubmit, colors, isDark }: {
  quest: Quest;
  members: FamilyMember[];
  activeMember?: FamilyMember;
  isParent: boolean;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onClaim:   (id: string) => void;
  onSubmit:  (id: string) => void;
  colors: any;
  isDark: boolean;
}) {
  const assignee = members.find(m => m.id === quest.assignedToId);
  const isReview = quest.status === 'pending_approval';
  const isDone   = quest.status === 'done' || quest.status === 'approved';
  const isPool   = quest.status === 'todo' && !quest.assignedToId;
  const inProg   = quest.status === 'claimed' || (quest.status === 'todo' && !!quest.assignedToId);

  const borderColor = isReview ? colors.amber + '80' : isDone ? colors.teal + '60' : colors.border;
  const cardBg      = isDark ? colors.card : '#FFFFFF';

  return (
    <View style={[s.card, { backgroundColor: cardBg, borderColor }]}>
      {/* Top row: category + coins */}
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
        <View style={[s.catBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
          <Text style={{ fontSize: 11 }}>{CAT_EMOJI[quest.category]}</Text>
          <Text style={[s.catText, { color: colors.primary }]}>{quest.category}</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.amber }}>
          +{quest.coins} 🪙 (${(quest.coins * 0.1).toFixed(2)})
        </Text>
      </View>

      {/* Title */}
      <Text style={[s.questTitle, { color: colors.textPrimary }]}>{quest.title}</Text>

      {/* Due date */}
      {quest.dueDate && (
        <View style={[s.row, { marginTop: 4 }]}>
          <Ionicons name="time-outline" size={12} color={colors.amber} />
          <Text style={{ fontSize: 11, color: colors.amber, fontWeight: '700', marginLeft: 4 }}>
            Due: {formatDate(quest.dueDate)}
          </Text>
        </View>
      )}

      {/* Assignee & actions */}
      <View style={[s.row, { justifyContent: 'space-between', marginTop: 12, paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          {assignee
            ? <Text>Assignee: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{assignee.name.split(' ')[0]}</Text></Text>
            : <Text style={{ fontWeight: '700', color: colors.amber }}>⚡ Open Bounty Pool</Text>}
        </Text>

        {/* Action buttons by status */}
        {isPool && (
          <Pressable onPress={() => onClaim(quest.id)}
            style={[s.actionBtn, { backgroundColor: colors.amber }]}>
            <Text style={s.actionBtnText}>Claim Task</Text>
          </Pressable>
        )}
        {isReview && (
          <View style={s.row}>
            <Pressable style={[s.actionBtn, { backgroundColor: colors.primary + '22',
              borderWidth: 1, borderColor: colors.primary + '44' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Inspect Proof</Text>
            </Pressable>
            {isParent && (
              <Pressable onPress={() => onApprove(quest.id)}
                style={[s.actionBtn, { backgroundColor: colors.teal, marginLeft: 6 }]}>
                <Text style={s.actionBtnText}>Approve</Text>
              </Pressable>
            )}
          </View>
        )}
        {isDone && (
          <View style={[s.doneTag, { backgroundColor: colors.teal + '20',
            borderWidth: 1, borderColor: colors.teal + '50' }]}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.teal }}>Paid ✓</Text>
          </View>
        )}
        {inProg && !isReview && (
          <Pressable onPress={() => onSubmit(quest.id)}
            style={[s.actionBtn, { backgroundColor: colors.primary }]}>
            <Text style={s.actionBtnText}>Submit Proof</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Sibling Cheer card ───────────────────────────────────────────────────────

function CheerCard({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [sent, setSent] = useState(false);
  return (
    <View style={[s.card, { backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderColor: colors.primary + '40' }]}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.amber }}>
          👧 Maya completed "Read 20 Mins Science Book"
        </Text>
        <Text style={{ fontSize: 11, color: colors.textTertiary }}>2h ago</Text>
      </View>
      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
        Maya earned +20 🪙 toward Roblox pass!
      </Text>
      <Pressable
        onPress={() => { setSent(true); Alert.alert('High Five Sent! 🎉'); }}
        style={[s.actionBtn, { backgroundColor: sent ? colors.teal : colors.primary + '22',
          borderWidth: 1, borderColor: colors.primary + '44', alignSelf: 'flex-start' }]}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: sent ? '#fff' : colors.primary }}>
          {sent ? '✓ High Five Sent!' : '✋ Send High Five 🎉'}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── New Quest Modal ──────────────────────────────────────────────────────────

function NewQuestModal({ visible, members, onClose, onCreate, colors, isDark }: {
  visible: boolean; members: FamilyMember[];
  onClose: () => void;
  onCreate: (data: Partial<Quest>) => void;
  colors: any; isDark: boolean;
}) {
  const [title, setTitle]       = useState('');
  const [coins, setCoins]       = useState('20');
  const [category, setCategory] = useState<QuestCategory>('Kitchen');
  const [assignee, setAssignee] = useState<string>('pool');
  const kids = members.filter(m => m.role === 'kid');

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), coins: parseInt(coins) || 20, category,
      assignedToId: assignee === 'pool' ? undefined : assignee, status: 'todo' });
    setTitle(''); setCoins('20'); setCategory('Kitchen'); setAssignee('pool');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: isDark ? colors.card : '#fff', borderColor: colors.border }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />
            <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>New Quest</Text>

            {/* Suggestions */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['Wash dishes', 'Make the bed', 'Feed the pet', 'Do laundry', 'Homework done', 'Water plants'].map(s => (
                  <Pressable key={s} onPress={() => setTitle(s)}
                    style={[{ borderRadius: 99, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
                      backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>+ {s}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[s.label, { color: colors.textSecondary }]}>QUEST TITLE</Text>
            <TextInput
              value={title} onChangeText={setTitle} placeholder="e.g. Clean the bathroom"
              placeholderTextColor={colors.placeholder}
              style={[s.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <View style={[s.row, { gap: 12, marginBottom: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>COINS</Text>
                <TextInput value={coins} onChangeText={setCoins} keyboardType="number-pad"
                  style={[s.input, { color: colors.textPrimary, borderColor: colors.border,
                    backgroundColor: colors.surface }]} />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={[s.label, { color: colors.textSecondary }]}>CATEGORY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={[s.row, { gap: 6 }]}>
                    {CATEGORIES.map(c => (
                      <Pressable key={c} onPress={() => setCategory(c)}
                        style={[{ borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
                          backgroundColor: category === c ? colors.primary + '20' : colors.surface,
                          borderColor: category === c ? colors.primary : colors.border }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700',
                          color: category === c ? colors.primary : colors.textSecondary }}>
                          {CAT_EMOJI[c]} {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>

            <Text style={[s.label, { color: colors.textSecondary }]}>ASSIGN TO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={[s.row, { gap: 8 }]}>
                <Pressable onPress={() => setAssignee('pool')}
                  style={[{ borderRadius: 99, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6,
                    backgroundColor: assignee === 'pool' ? colors.amber + '20' : colors.surface,
                    borderColor: assignee === 'pool' ? colors.amber : colors.border }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700',
                    color: assignee === 'pool' ? colors.amber : colors.textSecondary }}>⚡ Bounty Pool</Text>
                </Pressable>
                {kids.map(k => (
                  <Pressable key={k.id} onPress={() => setAssignee(k.id)}
                    style={[{ borderRadius: 99, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6,
                      backgroundColor: assignee === k.id ? colors.primary + '20' : colors.surface,
                      borderColor: assignee === k.id ? colors.primary : colors.border }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: assignee === k.id ? colors.primary : colors.textSecondary }}>
                      {k.emoji ?? '👦'} {k.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Pressable onPress={submit}
              style={[s.submitBtn, { backgroundColor: title.trim() ? colors.teal : colors.border }]}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.submitBtnText}>Create Quest</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── QuestsScreen ─────────────────────────────────────────────────────────────

type KidFilter = 'all' | 'my' | string; // string = member name
type QuestFilter = 'all' | 'todo' | 'claimed' | 'pending_approval' | 'done';

export default function QuestsScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { quests, loadFromStorage: loadQuests, addQuest, updateQuest, claimQuest, approveQuest, declineQuest } = useQuestStore();

  const [kidFilter, setKidFilter]       = useState<KidFilter>('all');
  const [statusFilter, setStatusFilter] = useState<QuestFilter>('all');
  const [showNew, setShowNew]           = useState(false);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadQuests(); }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent     = activeMember?.role === 'parent';
  const isKid        = activeMember?.role === 'kid';
  const isCheer      = kidFilter === 'cheer';

  // Filter quests
  let filtered = [...quests];
  if (kidFilter === 'my') {
    filtered = filtered.filter(q => q.assignedToId === activeMemberId);
  } else if (kidFilter === 'pool') {
    filtered = filtered.filter(q => !q.assignedToId || q.status === 'todo');
  } else if (kidFilter !== 'all' && kidFilter !== 'cheer') {
    // filter by member name
    const targetMember = members.find(m => m.name.split(' ')[0] === kidFilter);
    if (targetMember) filtered = filtered.filter(q => q.assignedToId === targetMember.id);
  }

  if (!isCheer && statusFilter !== 'all') {
    const statusMap: Record<QuestFilter, QuestStatus[]> = {
      all: [], todo: ['todo'], claimed: ['claimed'], pending_approval: ['pending_approval'], done: ['done', 'approved'],
    };
    const statuses = statusMap[statusFilter];
    if (statuses.length) filtered = filtered.filter(q => statuses.includes(q.status));
  }

  const kids = members.filter(m => m.role === 'kid');

  const bg = isDark ? '#0B0F1A' : '#F3F4F8';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['top']}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Household Quests</Text>
        {isParent && (
          <Pressable onPress={() => setShowNew(true)}
            style={[s.newBtn, { backgroundColor: colors.teal }]}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.newBtnText}>New Quest</Text>
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Kid filter strip ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          {[
            { id: 'all',   label: 'All Family' },
            ...(isKid ? [{ id: 'my', label: '👤 My Quests' }] : []),
            ...kids.map(k => ({ id: k.name.split(' ')[0], label: `${k.emoji ?? '👦'} ${k.name.split(' ')[0]}` })),
            { id: 'pool',  label: '⚡ Bounty Pool' },
            { id: 'cheer', label: '👥 Sibling Cheer' },
          ].map(f => {
            const active = kidFilter === f.id;
            const bg2 = f.id === 'pool'  ? (active ? colors.amber : colors.surface)
              : f.id === 'cheer' ? (active ? colors.primary : colors.surface)
              : (active ? colors.primary : colors.surface);
            return (
              <Pressable key={f.id} onPress={() => setKidFilter(f.id)}
                style={[s.filterChip, { backgroundColor: bg2,
                  borderColor: active ? 'transparent' : colors.border }]}>
                <Text style={{ fontSize: 12, fontWeight: '700',
                  color: active ? '#fff' : colors.textSecondary }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Cheer mode ── */}
        {isCheer ? (
          <View style={{ paddingHorizontal: 12, gap: 10 }}>
            <CheerCard colors={colors} isDark={isDark} />
          </View>
        ) : (
          <>
            {/* ── Status tab bar ── */}
            <View style={[s.tabBar, { marginHorizontal: 12, backgroundColor: colors.surface,
              borderColor: colors.border }]}>
              {[
                { id: 'all',              label: 'All' },
                { id: 'todo',             label: 'To Do' },
                { id: 'pending_approval', label: 'In Review' },
                { id: 'done',             label: 'Paid' },
              ].map(t => {
                const active = statusFilter === t.id;
                return (
                  <Pressable key={t.id} onPress={() => setStatusFilter(t.id as QuestFilter)}
                    style={[s.tabBtn, active && { backgroundColor: colors.card, borderRadius: 8 }]}>
                    <Text style={[s.tabBtnText, {
                      color: active ? colors.textPrimary : colors.textTertiary,
                      fontWeight: active ? '700' : '500',
                    }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Quest list ── */}
            <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 10 }}>
              {filtered.length === 0 ? (
                <View style={[s.emptyBox, { backgroundColor: isDark ? colors.card : '#fff',
                  borderColor: colors.border }]}>
                  <Text style={{ fontSize: 28, marginBottom: 8 }}>📋</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>
                    No quests match the selected filters
                  </Text>
                </View>
              ) : filtered.map(q => (
                <QuestCard
                  key={q.id} quest={q} members={members}
                  activeMember={activeMember} isParent={isParent}
                  onApprove={(id) => approveQuest(id, activeMemberId ?? '')}
                  onDecline={(id) => declineQuest(id, activeMemberId ?? '')}
                  onClaim={(id)   => claimQuest(id, activeMemberId ?? '')}
                  onSubmit={(id)  => updateQuest(id, { status: 'pending_approval' })}
                  colors={colors} isDark={isDark}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <NewQuestModal
        visible={showNew} members={members}
        onClose={() => setShowNew(false)}
        onCreate={(data) => addQuest(data as any)}
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
  newBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99,
                paddingVertical: 8, paddingHorizontal: 14 },
  newBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  filterChip: { borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },

  tabBar:     { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, marginBottom: 4 },
  tabBtn:     { flex: 1, paddingVertical: 7, alignItems: 'center' },
  tabBtnText: { fontSize: 13 },

  card:       { borderRadius: 18, borderWidth: 1, padding: 14,
                shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
                elevation: 2 },
  catBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99,
                borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  catText:    { fontSize: 11, fontWeight: '700' },
  questTitle: { fontSize: 15, fontWeight: '800', lineHeight: 21 },
  doneTag:    { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },

  row:        { flexDirection: 'row', alignItems: 'center' },
  actionBtn:  { borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12 },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  emptyBox:   { borderRadius: 18, borderWidth: 1, padding: 32, alignItems: 'center' },

  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1,
                padding: 20, paddingBottom: 40 },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  label:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input:      { borderWidth: 1.5, borderRadius: 12, padding: 10, fontSize: 15, marginBottom: 12 },
  submitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, borderRadius: 14, paddingVertical: 14 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
