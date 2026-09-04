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
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { assigneeStyle } from '@/features/calendar/components/EventCard';
import { showToast } from '@/components/AppToast';
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
  return <KioskBoardView active={active} members={members} colors={colors} isDark={isDark} />;
}

// Shared board for parent/kid/teen — one kanban, but every card's
// available action (claim / submit / approve / edit / delete / nothing)
// is now derived per-viewer via deriveQuestActions (the exact same
// canClaim/canSubmit/canApprove/canEdit/canDelete rules QuestCard.tsx uses
// on the phone). Previously this whole view assumed a parent regardless of
// who was actually standing at the kiosk — a kid switching to their own
// profile got the PARENT's create/edit/delete authority over every chore
// including other kids', with no claim/submit action anywhere (live-
// reported: "we need similar chore/event creation and claim like mobile
// app... claim, submit, review all exact same mobile app functions").
function KioskBoardView({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { quests, claimQuest, submitQuest, approveQuest } = useQuestStore();
  const isActiveApprover = useTemporaryApproverStore(s => s.isActiveApprover(active.id));
  const isParent = active.role === 'parent';
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);

  const byColumn = useMemo(
    () => COLUMN_STATUSES.map(col => ({
      ...col,
      items: quests.filter(q => col.statuses.includes(q.status)),
    })),
    [quests],
  );

  // Per-kid summary strip — open count + coins earned today, tinted with
  // that kid's own color (same system Calendar/Agenda already use). The
  // status columns below stay the real workflow view (what's stuck where);
  // this strip is the "how's everyone doing" glance a status board alone
  // can't answer. Parent/senior-facing only — a kid viewing their own
  // family's board doesn't need a leaderboard-shaped comparison of siblings
  // front and center the way a parent glancing at the fridge does.
  const kids = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const kidStats = useMemo(() => kids.map(k => {
    const mine = quests.filter(q => q.assignedToId === k.id);
    const open = mine.filter(q => q.status !== 'done' && q.status !== 'approved').length;
    const total = mine.length;
    return { member: k, open, total };
  }), [kids, quests]);

  const memberName = (id?: string) => members.find(m => m.id === id)?.name?.split(' ')[0];
  const memberOf = (id?: string) => members.find(m => m.id === id);

  // Was a small caption line under the title ("Tap to claim") relying on
  // the WHOLE card being one mystery-meat Pressable — live-reported as
  // "no buttons at all on the card," and correctly so: the real phone
  // QuestCard.tsx renders an actual filled button (s.actionBtn, "Claim
  // Chore") as its own distinct element for each of Claim/Submit/Approve.
  // A kiosk is used from arm's length on a shared surface, which makes a
  // real, obvious button MORE necessary than on a phone held inches away,
  // not less. Returns a {label, accent, action} triple for a real button;
  // edit stays the card's own tap (parent-only, see below) rather than a
  // button, matching how mobile treats "tap the card to open/edit" vs.
  // "tap this specific button to change status."
  const primaryAction = (q: Quest, actions: ReturnType<typeof deriveQuestActions>): { label: string; accent: string; action: () => void } | null => {
    if (actions.canClaim) return { label: 'Claim Chore', accent: colors.amber, action: () => { claimQuest(q.id, active.id); showToast(`Claimed "${q.title}" ✓`); } };
    if (actions.canResubmit) return { label: 'Resubmit', accent: colors.primary, action: () => { submitQuest(q.id, undefined, active.id); showToast('Resubmitted for review ✓'); } };
    if (actions.canSubmit) return { label: 'Submit for Review', accent: colors.primary, action: () => { submitQuest(q.id, undefined, active.id); showToast('Submitted for review ✓'); } };
    if (actions.canApprove) return { label: 'Approve', accent: colors.teal, action: () => { approveQuest(q.id, active.id); showToast('Approved ✓'); } };
    return null;
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Chores</Text>
        {isParent && (
          <Pressable onPress={() => setComposerOpen(true)} style={[s.addBtn, { backgroundColor: colors.primary }]}>
            <Plus size={18} color="#fff" />
            <Text style={s.addBtnText}>New Chore</Text>
          </Pressable>
        )}
      </View>

      {isParent && kidStats.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statStripOuter} contentContainerStyle={s.statStrip}>
          {kidStats.map(({ member, open, total }) => {
            const rs = assigneeStyle(member, colors, isDark);
            return (
              <View key={member.id} style={[s.statPill, { backgroundColor: rs.badge, borderColor: rs.dot + '55' }]}>
                <Text style={{ fontSize: 15 }}>{member.emoji ?? '👤'}</Text>
                <Text style={[s.statName, { color: rs.text }]}>{member.name.split(' ')[0]}</Text>
                <Text style={[s.statFrac, { color: rs.text }]}>{total - open}/{total}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={s.columns}>
        {byColumn.map(col => (
          <View key={col.key} style={s.col}>
            <Text style={[s.colHead, { color: colors.textTertiary }]}>{col.label.toUpperCase()} · {col.items.length}</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
              {col.items.map(q => {
                const rs = assigneeStyle(memberOf(q.assignedToId), colors, isDark);
                const actions = deriveQuestActions(q, { id: active.id, role: active.role, isActiveApprover });
                const btn = primaryAction(q, actions);
                // Parent (or anyone with edit rights) can still tap the card
                // body itself to open the editor — a real button only
                // replaces the "tap the whole card" pattern for the
                // claim/submit/approve actions, which need to be unmissable
                // from arm's length, not for the parent's own edit flow.
                const CardShell = actions.canEdit ? Pressable : View;
                // Coins are a kid/teen incentive mechanic — an adult task
                // (a parent/GP chore, q.isAdultTask) or one assigned
                // directly to a parent/senior member has no payout concept
                // on the phone app either, so showing "0 🪙"/a stray coin
                // figure here read as broken rather than by-design.
                const assignee = memberOf(q.assignedToId);
                const isAdultAssignee = q.isAdultTask || assignee?.role === 'parent' || assignee?.role === 'senior';
                return (
                  <CardShell
                    key={q.id}
                    {...(actions.canEdit ? { onPress: () => setEditingQuest(q) } : {})}
                    style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: rs.dot }]}
                  >
                    <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                    <View style={s.cardMeta}>
                      <Text style={[s.cardSub, { color: q.isPool ? colors.textSecondary : rs.text, fontWeight: q.isPool ? '600' : '800' }]} numberOfLines={1}>
                        {q.isPool ? 'Open to all' : memberName(q.assignedToId) ?? 'Unassigned'}
                      </Text>
                      {!isAdultAssignee && (
                        <Text style={[s.cardCoin, { color: colors.amber }]}>{q.coins} 🪙</Text>
                      )}
                    </View>
                    {btn && (
                      <Pressable
                        onPress={btn.action}
                        style={[s.cardActionBtn, { backgroundColor: btn.accent }]}
                      >
                        <Text style={s.cardActionBtnText}>{btn.label}</Text>
                      </Pressable>
                    )}
                  </CardShell>
                );
              })}
              {col.items.length === 0 && (
                <Text style={[s.emptyCol, { color: colors.textTertiary }]}>Nothing here</Text>
              )}
            </ScrollView>
          </View>
        ))}
      </View>

      {isParent && (
        <>
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
            active={active}
            isActiveApprover={isActiveApprover}
            onClose={() => setEditingQuest(null)}
            members={members}
            colors={colors}
            isDark={isDark}
          />
        </>
      )}
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
          <Text style={[s.title, { color: colors.textPrimary, fontSize: 18 }]}>Your Sponsored Chores</Text>
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
  // Was: no explicit height on the ScrollView itself (only on its
  // contentContainerStyle) — in a plain flex column, a horizontal
  // ScrollView with an unbounded cross-axis can stretch to fill whatever
  // vertical space its sibling below doesn't claim, instead of hugging its
  // own pill content. Live-reported: "the tasks filter pills height should
  // be fixed, it is stretching now too much." flexGrow:0 pins it to
  // exactly its content's height.
  statStripOuter: { flexGrow: 0, marginBottom: 16 },
  statStrip: { flexDirection: 'row', gap: 8 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  statName: { fontSize: 12, fontWeight: '800' },
  statFrac: { fontSize: 11, fontWeight: '700', opacity: 0.85 },
  columns: { flex: 1, flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  colHead: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
  card: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 3, padding: 13 },
  cardTitle: { fontSize: TYPO.body, fontWeight: '800' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cardSub: { fontSize: 11, fontWeight: '600', flex: 1, marginRight: 8 },
  cardCoin: { fontSize: 11, fontWeight: '800' },
  cardActionBtn: { marginTop: 10, borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  cardActionBtnText: { color: '#fff', fontSize: TYPO.label, fontWeight: '800' },
  emptyCol: { fontSize: TYPO.caption, fontWeight: '600', textAlign: 'center', paddingTop: 20 },
  gpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  gpCard: { width: 260, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cheerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  cheerBtnText: { color: '#fff', fontSize: TYPO.label, fontWeight: '800' },
});
