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
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Plus, PartyPopper, Check, Clock3 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { assigneeStyle } from '@/features/calendar/components/EventCard';
import { CATEGORY_META } from '@/features/quests/components/questFormShared';
import { fmtDateShort } from '@/lib/dates';
import { showToast } from '@/components/AppToast';
import { KioskQuestEditor } from '../components/KioskQuestEditor';
import { CollapsibleQuestCard } from '@/features/quests/components/CollapsibleQuestCard';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import { AskParentSheet } from '@/features/hub/kid/AskParentSheet';
import { KidChoreProposalModal } from '@/features/hub/kid/KidChoreProposalModal';
import { GroceryModal, SuppliesModal, AskModal, QuestProposalModal } from '@/features/hub/KidModals';
import { KidRequestModal } from '@/features/calendar/KidRequestModal';

// Live-reported: a chore a parent sent back for redo (choreAdapter maps
// the DB's 'redo_requested' status down to Quest status 'declined',
// isDeclinedCard's own target state) had no column to appear in at all —
// it silently vanished from the board the moment a parent tapped Redo,
// with no visibility into "sent back, waiting on the kid" until they
// resubmitted. Added as its own 4th column rather than folding it into
// "To Do", since a redo request carries a rejection reason the kid needs
// to see and act on differently than a fresh unclaimed chore.
const COLUMN_STATUSES: { key: string; label: string; statuses: string[] }[] = [
  { key: 'todo',     label: 'To Do',       statuses: ['todo'] },
  { key: 'progress', label: 'In Progress', statuses: ['claimed', 'in_progress'] },
  { key: 'redo',     label: 'Needs Redo',  statuses: ['declined'] },
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
  const isKidCreator = active.role === 'kid';
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);

  // Creation flow — ported verbatim from TasksScreen.tsx's own wiring
  // (features/tasks/TasksScreen.tsx lines ~213-234, ~474-540): a parent
  // gets the real free-text SmartTaskComposer (classifies Event vs Quest
  // live, auto-fills, "Adjust in full form" hands off to the real
  // AddEventModal/AddQuestModal pre-filled); a kid gets the same
  // Kid-safe AskParentSheet the phone's Tasks tab and Hub FAB use instead
  // — no free-text guessing, no direct assignment. Mobile's real gate for
  // this button is actually role === 'parent' only (the shared FAB in
  // app/(tabs)/_layout.tsx that opens SmartTaskComposer on the Tasks tab
  // is parent-role-gated — teen/senior currently have no creation entry
  // point there at all on mobile itself, see this port's own notes) —
  // kiosk's pre-existing `isParent &&` gate on the "New Chore" button
  // already matched that exactly, so it's left as-is here.
  const [showComposer, setShowComposer] = useState(false);
  const [manualQuestPrefill, setManualQuestPrefill] = useState<{
    title?: string; coins?: number; assignedToId?: string; photoRequired?: boolean; dueDate?: string;
  } | undefined>(undefined);
  const [manualEventPrefill, setManualEventPrefill] = useState<{
    title?: string; category?: string; memberId?: string; startAt?: string; notes?: string;
    recurFreq?: 'daily' | 'weekly' | 'monthly'; recurDays?: number[];
  } | undefined>(undefined);
  const [showManualQuest, setShowManualQuest] = useState(false);
  const [showManualEvent, setShowManualEvent] = useState(false);

  const [showAskParentSheet, setShowAskParentSheet] = useState(false);
  const [groceryModal, setGroceryModal] = useState(false);
  const [suppliesModal, setSuppliesModal] = useState(false);
  const [askModal, setAskModal] = useState<null | 'permission' | 'question' | 'medication'>(null);
  const [questProposalModal, setQuestProposalModal] = useState(false);
  const [choreProposalModal, setChoreProposalModal] = useState(false);
  const [rideRequestModal, setRideRequestModal] = useState(false);
  const openCreator = () => { if (isKidCreator) setShowAskParentSheet(true); else setShowComposer(true); };

  // Live-reported: a single card sat at a fixed narrow width inside a
  // whole column's worth of empty space ("cute buttons and use the space
  // properly"). Each column now lays its cards out as a wrapping grid —
  // 1 card per row on a narrower kiosk, 2 once a column is wide enough to
  // comfortably fit two ~260px+ cards side by side, so the column's real
  // width is what's actually used rather than one lonely card floating in
  // a void.
  const { width: winWidth } = useWindowDimensions();
  const RAIL_AND_PADDING = 84 + 40; // nav rail + s.root's own horizontal padding
  const COLUMN_GAP = 16;
  const NUM_COLUMNS = COLUMN_STATUSES.length;
  const boardWidth = winWidth - RAIL_AND_PADDING;
  const columnWidth = (boardWidth - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
  const cardsPerRow = columnWidth >= 560 ? 2 : 1;

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
    <ScrollView style={s.root} contentContainerStyle={s.rootContent} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Chores</Text>
        {isParent && (
          <Pressable onPress={openCreator} style={[s.addBtn, { backgroundColor: colors.primary }]}>
            <Plus size={18} color="#fff" />
            <Text style={s.addBtnText}>New Chore</Text>
          </Pressable>
        )}
        {isKidCreator && (
          <Pressable onPress={openCreator} style={[s.addBtn, { backgroundColor: colors.primary }]}>
            <Plus size={18} color="#fff" />
            <Text style={s.addBtnText}>Ask Parent</Text>
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
          <View key={col.key} style={[s.col, { width: columnWidth }]}>
            <Text style={[s.colHead, { color: colors.textTertiary }]}>{col.label.toUpperCase()} · {col.items.length}</Text>
            {/* Plain View, not a nested ScrollView — the whole screen
                scrolls now (see the root return above), so a column just
                hugs its own content height instead of claiming an
                unbounded scroll area that used to stretch the full
                screen even for 1-2 cards. */}
            <View style={s.cardGrid}>
              {col.items.map(q => {
                const rs = assigneeStyle(memberOf(q.assignedToId), colors, isDark);
                const actions = deriveQuestActions(q, { id: active.id, role: active.role, isActiveApprover });
                const btn = primaryAction(q, actions);
                // Coins are a kid/teen incentive mechanic — an adult task
                // (a parent/GP chore, q.isAdultTask) or one assigned
                // directly to a parent/senior member has no payout concept
                // on the phone app either, so showing "0 🪙"/a stray coin
                // figure here read as broken rather than by-design.
                const assignee = memberOf(q.assignedToId);
                const isAdultAssignee = q.isAdultTask || assignee?.role === 'parent' || assignee?.role === 'senior';
                const catMeta = CATEGORY_META[q.category] ?? { emoji: '📋', color: colors.textTertiary };
                const cardWidth = cardsPerRow === 2 ? (columnWidth - 10) / 2 : columnWidth;
                return (
                  <View key={q.id} style={{ width: cardWidth }}>
                    {/* Same CollapsibleQuestCard mobile's own QuestCard.tsx
                        uses — header always visible (compact: category +
                        coin + title), tap to expand for the due date/decline
                        reason/action button. Was: everything always shown at
                        full height, reading as "too much height
                        unnecessarily" for a card that's mostly just a title
                        and one button — same concept as mobile, not a new
                        one invented for kiosk. */}
                    <CollapsibleQuestCard
                      accentColor={catMeta.color}
                      cardBg={colors.card}
                      cardBord={colors.border}
                      onDoubleTap={actions.canEdit ? () => setEditingQuest(q) : undefined}
                      header={
                        <View style={s.cardTopRow}>
                          <View style={[s.catBadge, { backgroundColor: catMeta.color + '18' }]}>
                            <Text style={{ fontSize: 15 }}>{catMeta.emoji}</Text>
                          </View>
                          <Text style={[s.cardTitle, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{q.title}</Text>
                          {!isAdultAssignee && (
                            <View style={[s.coinPill, { backgroundColor: colors.amberLight }]}>
                              <Text style={[s.coinPillText, { color: colors.amber }]}>{q.coins} 🪙</Text>
                            </View>
                          )}
                        </View>
                      }
                    >
                      {col.key === 'redo' && !!q.declineReason && (
                        <View style={[s.reasonBanner, { backgroundColor: colors.danger + '14' }]}>
                          <Text style={[s.reasonText, { color: colors.danger }]} numberOfLines={2}>↩ {q.declineReason}</Text>
                        </View>
                      )}

                      <View style={s.cardMeta}>
                        <View style={[s.assigneeChip, { backgroundColor: q.isPool ? colors.surface : rs.badge, borderColor: q.isPool ? colors.border : rs.dot + '55' }]}>
                          {!q.isPool && <Text style={{ fontSize: 12 }}>{assignee?.emoji ?? '👤'}</Text>}
                          <Text style={[s.assigneeChipText, { color: q.isPool ? colors.textSecondary : rs.text }]} numberOfLines={1}>
                            {q.isPool ? 'Open to all' : memberName(q.assignedToId) ?? 'Unassigned'}
                          </Text>
                        </View>
                        {!!q.dueDate && (
                          <View style={s.dueRow}>
                            <Clock3 size={11} color={colors.textTertiary} />
                            <Text style={[s.dueText, { color: colors.textTertiary }]}>{fmtDateShort(q.dueDate)}</Text>
                          </View>
                        )}
                      </View>

                      {actions.canEdit && (
                        <Pressable onPress={() => setEditingQuest(q)} style={s.editLink}>
                          <Text style={[s.editLinkText, { color: colors.primary }]}>Edit details</Text>
                        </Pressable>
                      )}

                      {btn && (
                        <Pressable
                          onPress={btn.action}
                          style={[s.cardActionBtn, { backgroundColor: btn.accent }]}
                        >
                          <Text style={s.cardActionBtnText}>{btn.label}</Text>
                        </Pressable>
                      )}
                    </CollapsibleQuestCard>
                  </View>
                );
              })}
              {col.items.length === 0 && (
                <Text style={[s.emptyCol, { color: colors.textTertiary, width: columnWidth }]}>Nothing here</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {isParent && (
        <KioskQuestEditor
          quest={editingQuest}
          active={active}
          isActiveApprover={isActiveApprover}
          onClose={() => setEditingQuest(null)}
          members={members}
          colors={colors}
          isDark={isDark}
        />
      )}

      {/* Real creation flow, ported from TasksScreen.tsx lines ~474-540 —
          see this file's top-of-function comment for the full mapping. */}
      <AskParentSheet
        visible={showAskParentSheet} onClose={() => setShowAskParentSheet(false)} colors={colors} isDark={isDark}
        onPick={(choice) => {
          setShowAskParentSheet(false);
          setTimeout(() => {
            if (choice === 'ride') setRideRequestModal(true);
            else if (choice === 'grocery') setGroceryModal(true);
            else if (choice === 'supplies') setSuppliesModal(true);
            else if (choice === 'quest') setQuestProposalModal(true);
            else if (choice === 'chore') setChoreProposalModal(true);
            else setAskModal(choice);
          }, 300);
        }}
      />
      <GroceryModal visible={groceryModal} onClose={() => setGroceryModal(false)} active={active} />
      <SuppliesModal visible={suppliesModal} onClose={() => setSuppliesModal(false)} active={active} />
      {askModal && <AskModal visible={!!askModal} onClose={() => setAskModal(null)} type={askModal} active={active} />}
      <QuestProposalModal visible={questProposalModal} onClose={() => setQuestProposalModal(false)} active={active} />
      <KidChoreProposalModal
        visible={choreProposalModal} onClose={() => setChoreProposalModal(false)}
        active={active} members={members} familyId={active.familyId ?? ''}
      />
      <KidRequestModal visible={rideRequestModal} onClose={() => setRideRequestModal(false)} activeMemberId={active.id} />

      <SmartTaskComposer
        visible={showComposer}
        members={members}
        activeMemberId={active.id}
        familyId={active.familyId ?? ''}
        onClose={() => setShowComposer(false)}
        onCreated={() => setShowComposer(false)}
        onOpenFullForm={(kind, prefill) => {
          setShowComposer(false);
          if (kind === 'quest') {
            setManualQuestPrefill(prefill as typeof manualQuestPrefill);
            setShowManualQuest(true);
          } else {
            setManualEventPrefill(prefill as typeof manualEventPrefill);
            setShowManualEvent(true);
          }
        }}
      />

      {showManualQuest && (
        <AddQuestModal
          visible={showManualQuest}
          onClose={() => { setShowManualQuest(false); setManualQuestPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={manualQuestPrefill}
          initialStep={manualQuestPrefill ? 'review' : undefined}
        />
      )}

      {showManualEvent && (
        <AddEventModal
          visible={showManualEvent}
          onClose={() => { setShowManualEvent(false); setManualEventPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={manualEventPrefill as any}
          initialStep="review"
        />
      )}
    </ScrollView>
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
    <ScrollView style={s.root} contentContainerStyle={{ gap: 24, padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Text style={[s.title, { color: colors.textPrimary }]}>Cheer Your Grandkids</Text>

      <View style={s.gpGrid}>
        {kidsCheerable.length === 0 && (
          <Text style={[s.emptyCol, { color: colors.textTertiary }]}>Nothing finished yet today 🌱</Text>
        )}
        {kidsCheerable.map(q => (
          <View key={q.id} style={[s.gpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.catBadge, { backgroundColor: (CATEGORY_META[q.category]?.color ?? colors.textTertiary) + '18' }]}>
              <Text style={{ fontSize: 16 }}>{CATEGORY_META[q.category]?.emoji ?? '📋'}</Text>
            </View>
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
  root: { flex: 1 },
  rootContent: { padding: 20, paddingBottom: 40 },
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
  // Was flex:1 — forced every column (and its inner ScrollView) to
  // stretch the full remaining screen height even when there were only 1-2
  // cards, reading as a huge dead void below a handful of cards
  // (live-reported: "too much height unnecessarily"). Columns now hug
  // their own content; the outer screen ScrollView (see the root return)
  // handles scrolling if a column's real content ever exceeds the screen.
  columns: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  col: { flexShrink: 0 },
  colHead: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
  // Cards wrap into a grid (see cardsPerRow above) instead of one per row
  // stretching a whole narrow column — live-reported: a single card sat
  // in a huge empty column with nothing else to fill the space.
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 20, alignContent: 'flex-start' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  coinPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  coinPillText: { fontSize: 11.5, fontWeight: '800' },
  cardTitle: { fontSize: TYPO.body, fontWeight: '800', lineHeight: 19 },
  cardSub: { fontSize: 12, fontWeight: '600' },
  reasonBanner: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8 },
  reasonText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  editLink: { alignSelf: 'flex-start', marginBottom: 8 },
  editLinkText: { fontSize: 11.5, fontWeight: '800' },
  assigneeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, flexShrink: 1,
  },
  assigneeChipText: { fontSize: 11, fontWeight: '800' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dueText: { fontSize: 10.5, fontWeight: '700' },
  cardActionBtn: { borderRadius: 11, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  cardActionBtnText: { color: '#fff', fontSize: TYPO.label, fontWeight: '800' },
  emptyCol: { fontSize: TYPO.caption, fontWeight: '600', textAlign: 'center', paddingTop: 20 },
  gpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  gpCard: { width: 260, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cheerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  cheerBtnText: { color: '#fff', fontSize: TYPO.label, fontWeight: '800' },
});
