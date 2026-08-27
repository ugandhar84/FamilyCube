/**
 * KioskTasksTab — role-gated per the quest-flows spec (docs/quest-flows-
 * spec.md §3/§4/§5): a Parent gets the full create/edit/delete kanban
 * (3 columns: To Do / In Progress / In Review). A Senior/GP does NOT — per
 * spec they cheer/high-five kids' finished chores and can only claim/submit
 * their own grandparent_quest items, with no create/edit/delete of anyone
 * else's quest. See KioskGpTasksView below for that branch, mirroring
 * SeniorView.tsx's own kidsCheerable/mySponsoredQuests filters and
 * choreStore's cheerChore action exactly (not reinvented).
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Plus, PartyPopper, Check } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { KioskQuestComposer } from '../components/KioskQuestComposer';
import { KioskQuestEditor } from '../components/KioskQuestEditor';

const COLUMN_STATUSES: { key: string; label: string; statuses: string[] }[] = [
  { key: 'todo',     label: 'To Do',       statuses: ['todo'] },
  { key: 'progress', label: 'In Progress', statuses: ['claimed', 'in_progress'] },
  { key: 'review',   label: 'In Review',   statuses: ['pending_approval'] },
];

export function KioskTasksTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  if (active.role === 'senior') {
    return <KioskGpTasksView active={active} members={members} colors={colors} isDark={isDark} />;
  }
  return <KioskParentTasksView active={active} members={members} colors={colors} isDark={isDark} />;
}

function KioskParentTasksView({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { quests } = useQuestStore();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);

  const byColumn = useMemo(
    () => COLUMN_STATUSES.map(col => ({
      ...col,
      items: quests.filter(q => col.statuses.includes(q.status)),
    })),
    [quests],
  );

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Quests</Text>
        <Pressable onPress={() => setComposerOpen(true)} style={[s.addBtn, { backgroundColor: colors.primary }]}>
          <Plus size={18} color="#fff" />
          <Text style={s.addBtnText}>New Quest</Text>
        </Pressable>
      </View>

      <View style={s.columns}>
        {byColumn.map(col => (
          <View key={col.key} style={s.col}>
            <Text style={[s.colHead, { color: colors.textTertiary }]}>{col.label.toUpperCase()} · {col.items.length}</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
              {col.items.map(q => (
                <Pressable
                  key={q.id}
                  onPress={() => setEditingQuest(q)}
                  style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: colors.primary }]}
                >
                  <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                  <View style={s.cardMeta}>
                    <Text style={[s.cardSub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {q.isPool ? 'Open to all' : memberName(q.assignedToId) ?? 'Unassigned'}
                    </Text>
                    <Text style={[s.cardCoin, { color: colors.amber }]}>{q.coins} 🪙</Text>
                  </View>
                </Pressable>
              ))}
              {col.items.length === 0 && (
                <Text style={[s.emptyCol, { color: colors.textTertiary }]}>Nothing here</Text>
              )}
            </ScrollView>
          </View>
        ))}
      </View>

      <KioskQuestComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        active={active}
        members={members}
        colors={colors}
        isDark={isDark}
      />
      <KioskQuestEditor
        quest={editingQuest}
        onClose={() => setEditingQuest(null)}
        members={members}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
}

// ── GP / Senior view ────────────────────────────────────────────────────────
// Per spec: no create/edit/delete. Three things a GP actually does here:
// 1. Cheer/high-five kids' chores finished in the last 24h (cheerChore) —
//    mirrors SeniorView.tsx's CheerSquadSection filter exactly.
// 2. Claim/submit their own grandparent_quest items via the same
//    claimQuest/submitQuest actions the phone's quest cards use.
// 3. Approve pending_approval quests (parent-or-senior RBAC per spec §5).
function KioskGpTasksView({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { quests, claimQuest, submitQuest, approveQuest } = useQuestStore();
  const cheerChore = useChoreStore(s => s.cheerChore);

  const kids = members.filter(m => m.role === 'kid' || m.role === 'teen');

  const kidsCheerable = useMemo(() => quests.filter(q => {
    if (!['approved', 'done'].includes(q.status)) return false;
    if (!q.assignedToId || !kids.some(k => k.id === q.assignedToId)) return false;
    if ((q.cheers ?? []).some(c => c.memberId === active.id)) return false;
    return true;
  }), [quests, kids, active.id]);

  const myGpQuestsOpen = useMemo(() => quests.filter(q =>
    q.questType === 'grandparent_quest' && q.status === 'todo' && !q.assignedToId
  ), [quests]);
  const myGpQuestsAssigned = useMemo(() => quests.filter(q =>
    q.questType === 'grandparent_quest' && q.assignedToId === active.id &&
    ['claimed', 'in_progress'].includes(q.status)
  ), [quests]);
  const pendingReview = useMemo(() => quests.filter(q => q.status === 'pending_approval'), [quests]);

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];

  return (
    <ScrollView style={s.root} contentContainerStyle={{ gap: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Text style={[s.title, { color: colors.textPrimary }]}>Cheer Your Grandkids</Text>

      <View style={s.gpGrid}>
        {kidsCheerable.length === 0 && (
          <Text style={[s.emptyCol, { color: colors.textTertiary }]}>Nothing finished yet today 🌱</Text>
        )}
        {kidsCheerable.map(q => (
          <View key={q.id} style={[s.gpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
            <Text style={[s.cardSub, { color: colors.textSecondary }]}>{memberName(q.assignedToId)} finished this</Text>
            <Pressable
              onPress={() => cheerChore(q.id, active.id)}
              style={[s.cheerBtn, { backgroundColor: colors.teal }]}
            >
              <PartyPopper size={16} color="#fff" />
              <Text style={s.cheerBtnText}>Send a Cheer</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {pendingReview.length > 0 && (
        <>
          <Text style={[s.title, { color: colors.textPrimary, fontSize: 18 }]}>Waiting on Approval</Text>
          <View style={s.gpGrid}>
            {pendingReview.map(q => (
              <View key={q.id} style={[s.gpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                <Text style={[s.cardSub, { color: colors.textSecondary }]}>{memberName(q.assignedToId) ?? 'Unassigned'}</Text>
                <Pressable onPress={() => approveQuest(q.id, active.id)} style={[s.cheerBtn, { backgroundColor: colors.primary }]}>
                  <Check size={16} color="#fff" />
                  <Text style={s.cheerBtnText}>Approve</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}

      {(myGpQuestsOpen.length > 0 || myGpQuestsAssigned.length > 0) && (
        <>
          <Text style={[s.title, { color: colors.textPrimary, fontSize: 18 }]}>Your Sponsored Quests</Text>
          <View style={s.gpGrid}>
            {myGpQuestsOpen.map(q => (
              <View key={q.id} style={[s.gpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                <Pressable onPress={() => claimQuest(q.id, active.id)} style={[s.cheerBtn, { backgroundColor: colors.primary }]}>
                  <Text style={s.cheerBtnText}>Claim</Text>
                </Pressable>
              </View>
            ))}
            {myGpQuestsAssigned.map(q => (
              <View key={q.id} style={[s.gpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                <Pressable onPress={() => submitQuest(q.id, undefined, active.id)} style={[s.cheerBtn, { backgroundColor: colors.amber }]}>
                  <Text style={s.cheerBtnText}>Submit</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  title: { fontSize: 24, fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  addBtnText: { color: '#fff', fontSize: TYPO.label, fontWeight: '800' },
  columns: { flex: 1, flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  colHead: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
  card: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 3, padding: 13 },
  cardTitle: { fontSize: TYPO.body, fontWeight: '800' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cardSub: { fontSize: 11, fontWeight: '600', flex: 1, marginRight: 8 },
  cardCoin: { fontSize: 11, fontWeight: '800' },
  emptyCol: { fontSize: TYPO.caption, fontWeight: '600', textAlign: 'center', paddingTop: 20 },
  gpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  gpCard: { width: 260, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cheerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  cheerBtnText: { color: '#fff', fontSize: TYPO.label, fontWeight: '800' },
});
