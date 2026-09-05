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
import { Plus, PartyPopper, Check, Clock3, Sparkles } from 'lucide-react-native';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { deriveQuestActions, isAssignedTo } from '@/features/tasks/lib/deriveCardActions';
import { assigneeStyle } from '@/features/calendar/components/EventCard';
import { CATEGORY_META } from '@/features/quests/components/questFormShared';
import { fmtDateShort } from '@/lib/dates';
import { showToast } from '@/components/AppToast';
import { KioskQuestEditor } from '../components/KioskQuestEditor';
import { CollapsibleQuestCard } from '@/features/quests/components/CollapsibleQuestCard';
import { KioskCard, KioskZoneHeader } from '../components/KioskSurface';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import { AskParentSheet } from '@/features/hub/kid/AskParentSheet';
import { KidChoreProposalModal } from '@/features/hub/kid/KidChoreProposalModal';
import { GroceryModal, SuppliesModal, AskModal, QuestProposalModal } from '@/features/hub/KidModals';
import { KidRequestModal } from '@/features/calendar/KidRequestModal';
import { useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS, kioskElevation } from '../kioskTheme';

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
    pickupLocation?: string; dropLocation?: string; returnTime?: string; helperId?: string;
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

  // Hold the kiosk idle lock while ANY of these creation sheets is open.
  // They're all shared phone components rendered into their own native
  // Modal, so their touches never reach KioskScreen's root onTouchStart —
  // without this, composing a chore counts as inactivity and the lock can
  // fire mid-form, throwing the draft away. See KioskActivityContext.
  useKioskLockSuspended(
    showComposer || showManualQuest || showManualEvent || showAskParentSheet ||
    groceryModal || suppliesModal || !!askModal || questProposalModal ||
    choreProposalModal || rideRequestModal || editingQuest !== null,
  );

  // Live-reported: a single card sat at a fixed narrow width inside a
  // whole column's worth of empty space ("cute buttons and use the space
  // properly"). Each column now lays its cards out as a wrapping grid —
  // 1 card per row on a narrower kiosk, 2 once a column is wide enough to
  // comfortably fit two ~260px+ cards side by side, so the column's real
  // width is what's actually used rather than one lonely card floating in
  // a void.
  // ── Column grid math, and why there is now so little of it ────────────
  // Live-reported: the four status columns rendered ragged rather than as
  // an even grid on a real tablet. Three compounding causes:
  //
  //  1. RAIL_AND_PADDING hardcoded `84` as the nav-rail width — a copy of
  //     KioskScreen's own value that went stale the moment that rail was
  //     widened for kiosk touch targets, so every column was computed
  //     ~24px wider than the space available and the row overflowed.
  //  2. COLUMN_GAP was a hardcoded 16 while s.columns' real `gap` was 18 —
  //     the math reserved 48px of gutter where flexbox consumed 54px, and
  //     the 6px shortfall came out of the columns unevenly. That mismatch
  //     IS the ragged-header effect.
  //  3. Each column was then given that exact fractional width with
  //     flexShrink: 0, so sub-pixel widths rounded to different physical
  //     pixels per column and nothing could absorb the overflow.
  //
  // Rather than fix the arithmetic three ways, the arithmetic is gone:
  // s.col is flex:1 + flexBasis:0 + minWidth:0, so flexbox divides the row
  // evenly and exactly by construction. There is no width to compute, no
  // gap constant to keep in sync with the stylesheet, and no float to
  // round — which is the only version of this that cannot silently drift
  // again the next time a rail or a spacing token changes.

  // ── Per-viewer visibility [GAP, not a simplification] ─────────────────
  // This board previously did `quests.filter(q => col.statuses.includes(
  // q.status))` and nothing else — NO per-viewer scoping whatsoever. The
  // phone's QuestsScreen.tsx (lines ~548-563) applies three hard
  // exclusions for a kid/teen viewer that kiosk simply did not have:
  //
  //   · q.isAdultTask                — adult chores were never kid-visible
  //   · q.awaitingParentApproval     — a grandparent_quest still awaiting a
  //                                    parent's SAFETY REVIEW must not be
  //                                    visible or claimable until approved
  //                                    (see choreAdapter's own note)
  //   · another kid's assigned chore — "Never: ... other kids' quests"
  //
  // plus, for pool/bounty chores specifically (QuestsScreen.tsx:596), the
  // `!q.inviteGrandparents` exclusion, because an inviteGrandparents chore
  // is GP-pool-only even while isPool/todo (e.g. after
  // backoutGpWelcomeChore puts it back).
  //
  // On a personal phone the blast radius of missing these is one child's
  // own screen. On a wall-mounted kiosk it's every person who walks past
  // the counter while a kid profile is active — including a GP-only chore
  // rendered with an "Open to all" chip inviting any kid to claim it, and
  // a safety-review-pending chore offered up before a parent has vetted
  // it. Same rules as the phone, applied at the source list so every lane
  // below inherits them.
  const visibleQuests = useMemo(() => {
    const adultMemberIds = new Set(
      members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id),
    );
    const isKidOrTeen = active.role === 'kid' || active.role === 'teen';
    if (!isKidOrTeen) return quests;
    return quests.filter(q => {
      if (q.isAdultTask) return false;
      if ((q as any).awaitingParentApproval) return false;
      if (q.assignedToId && adultMemberIds.has(q.assignedToId)) return false;
      if (q.isPool) return !q.inviteGrandparents;
      return isAssignedTo(q, active.id);
    });
  }, [quests, members, active.role, active.id]);

  // ── Pool / "Up for grabs" lane [GAP] ──────────────────────────────────
  // Pool chores previously had no lane of their own — they fell into
  // whichever status column matched (always "To Do") and were
  // distinguishable only by a small "Open to all" chip. The phone gives
  // them a dedicated Bounty tab precisely because "unclaimed, anyone can
  // take this" is a different KIND of thing from "assigned to someone and
  // in progress." A kiosk is the single best place in the product for that
  // distinction — it's the shared surface kids actually walk past — so
  // pool chores get the most prominent zone on the board rather than the
  // least. Eligibility matches QuestsScreen.tsx:596's Bounty filter
  // exactly, including the !assignedToId check that makes a sibling's
  // just-claimed bounty disappear immediately rather than lingering.
  const poolQuests = useMemo(
    () => visibleQuests.filter(q =>
      q.isPool && q.status === 'todo' && !q.isAdultTask &&
      !q.assignedToId && !q.inviteGrandparents,
    ),
    [visibleQuests],
  );

  // Status lanes exclude anything already surfaced in the pool lane, so a
  // bounty isn't rendered twice on the same board.
  const poolIds = useMemo(() => new Set(poolQuests.map(q => q.id)), [poolQuests]);
  const byColumn = useMemo(
    () => COLUMN_STATUSES.map(col => ({
      ...col,
      items: visibleQuests.filter(q => col.statuses.includes(q.status) && !poolIds.has(q.id)),
    })),
    [visibleQuests, poolIds],
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

  // One shared card renderer, used by both the pool lane and the status
  // lanes so a chore looks identical wherever it appears.
  const renderQuestCard = (q: Quest, opts?: { showDeclineReason?: boolean }) => {
    const assignee = memberOf(q.assignedToId);
    const rs = assigneeStyle(assignee, colors, isDark);
    const actions = deriveQuestActions(q, { id: active.id, role: active.role, isActiveApprover });
    const btn = primaryAction(q, actions);
    // Coins are a kid/teen incentive mechanic — an adult task or one
    // assigned to a parent/senior has no payout concept on the phone
    // either, so a stray coin figure here read as broken, not by-design.
    const isAdultAssignee = q.isAdultTask || assignee?.role === 'parent' || assignee?.role === 'senior';
    const catMeta = CATEGORY_META[q.category] ?? { emoji: '📋', color: colors.textTertiary };
    return (
      <CollapsibleQuestCard
        accentColor={catMeta.color}
        cardBg={colors.card}
        cardBord={colors.border}
        onDoubleTap={actions.canEdit ? () => setEditingQuest(q) : undefined}
        header={
          <View style={s.cardTopRow}>
            <View style={[s.catBadge, { backgroundColor: catMeta.color + '18' }]}>
              <Text style={{ fontSize: 17 }}>{catMeta.emoji}</Text>
            </View>
            <Text style={[s.cardTitle, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>{q.title}</Text>
            {!isAdultAssignee && (
              <View style={[s.coinPill, { backgroundColor: colors.amberLight }]}>
                <Text style={[s.coinPillText, { color: colors.amber }]}>{q.coins} 🪙</Text>
              </View>
            )}
          </View>
        }
      >
        {!!opts?.showDeclineReason && !!q.declineReason && (
          <View style={[s.reasonBanner, { backgroundColor: colors.danger + '14' }]}>
            <Text style={[s.reasonText, { color: colors.danger }]} numberOfLines={2}>↩ {q.declineReason}</Text>
          </View>
        )}

        <View style={s.cardMeta}>
          <View style={[s.assigneeChip, { backgroundColor: q.isPool ? colors.surface : rs.badge, borderColor: q.isPool ? colors.border : rs.dot + '55' }]}>
            {!q.isPool && <Text style={{ fontSize: 14 }}>{assignee?.emoji ?? '👤'}</Text>}
            <Text style={[s.assigneeChipText, { color: q.isPool ? colors.textSecondary : rs.text }]} numberOfLines={1}>
              {q.isPool ? 'Open to all' : memberName(q.assignedToId) ?? 'Unassigned'}
            </Text>
          </View>
          {!!q.dueDate && (
            <View style={s.dueRow}>
              <Clock3 size={13} color={colors.textTertiary} />
              <Text style={[s.dueText, { color: colors.textTertiary }]}>{fmtDateShort(q.dueDate)}</Text>
            </View>
          )}
        </View>

        {actions.canEdit && (
          <Pressable
            onPress={() => setEditingQuest(q)}
            style={s.editLink}
            accessibilityRole="button"
            accessibilityLabel={`Edit details for ${q.title}`}
          >
            <Text style={[s.editLinkText, { color: colors.primary }]}>Edit details</Text>
          </Pressable>
        )}

        {btn && (
          <Pressable
            onPress={btn.action}
            style={[s.cardActionBtn, { backgroundColor: btn.accent }]}
            accessibilityRole="button"
            accessibilityLabel={`${btn.label}: ${q.title}`}
          >
            <Text style={s.cardActionBtnText} numberOfLines={1}>{btn.label}</Text>
          </Pressable>
        )}
      </CollapsibleQuestCard>
    );
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.rootContent} showsVerticalScrollIndicator={false}>
      {/* ── Masthead ──────────────────────────────────────────────────
          Not a phone screen title. A kiosk screen announces itself: an
          oversized display title with a one-line subtitle stating what
          this board currently means for whoever is standing at it, so
          the surface is self-explanatory to a family member who walked
          up without navigating here deliberately. */}
      <View style={s.masthead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>Chores</Text>
          <Text style={[s.mastheadSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {isParent
              ? `${byColumn[3].items.length} waiting on you · ${poolQuests.length} up for grabs`
              : `${poolQuests.length} up for grabs · ${byColumn[0].items.length + byColumn[1].items.length} on your plate`}
          </Text>
        </View>
        {(isParent || isKidCreator) && (
          <Pressable
            onPress={openCreator}
            style={[s.addBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel={isParent ? 'New chore' : 'Ask a parent'}
            accessibilityHint={isParent ? 'Opens the chore composer' : 'Send a request to a parent'}
          >
            <Plus size={20} color="#fff" />
            <Text style={s.addBtnText}>{isParent ? 'New Chore' : 'Ask Parent'}</Text>
          </Pressable>
        )}
      </View>

      {/* ── Zone 1: Up for grabs ──────────────────────────────────────
          The pool lane leads the board rather than being buried inside
          "To Do". This is the one thing on a shared kitchen surface that
          is addressed to the ROOM rather than to an individual, so it
          gets hero treatment: full width, tinted tiles, big cards. */}
      {poolQuests.length > 0 && (
        <View style={s.zone}>
          <KioskZoneHeader
            title="Up for grabs"
            count={poolQuests.length}
            accent={colors.amber}
            colors={colors}
            right={
              <View style={s.zoneHint}>
                <Sparkles size={18} color={colors.amber} />
                <Text style={[s.zoneHintText, { color: colors.textTertiary }]} numberOfLines={1}>
                  Anyone can claim these
                </Text>
              </View>
            }
          />
          <View style={s.poolGrid}>
            {poolQuests.map(q => (
              <KioskCard key={q.id} colors={colors} isDark={isDark} tone={colors.amber} style={s.poolCard}>
                {renderQuestCard(q)}
              </KioskCard>
            ))}
          </View>
        </View>
      )}

      {/* ── Zone 2: Who has what ──────────────────────────────────────
          Person-first, matching KioskHeader's avatar language. A status
          kanban answers "what is stuck where," which is a project-
          management question; the question a family actually asks at the
          kitchen counter is "who still has something to do." Each member
          gets a row with their own tint, so the board is readable as a
          set of PEOPLE from across the room. Parent/teen-facing — a kid
          shouldn't get a sibling-comparison leaderboard front and center
          (same reasoning the old stat strip already applied). */}
      {isParent && kidStats.length > 0 && (
        <View style={s.zone}>
          <KioskZoneHeader title="Who has what" accent={colors.teal} colors={colors} />
          {/* Compact roster CHIPS, not a card per person. Live-reported:
              full-size member cards held very little information (avatar,
              name, a fraction, a bar) while occupying a whole tile each,
              so two people filled a row and the screen read sparse and
              oversized. A chip puts the same information on one line —
              avatar, name, count, progress — so a family of six fits in
              the space two cards used, and the zone reads as a roster
              rather than as two big empty boxes. */}
          <View style={s.rosterRow}>
            {kidStats.map(({ member, open, total }) => {
              const rs = assigneeStyle(member, colors, isDark);
              const done = total - open;
              const pct = total > 0 ? done / total : 1;
              const clear = open === 0;
              return (
                <View
                  key={member.id}
                  style={[s.rosterChip, { backgroundColor: colors.card, borderColor: colors.border, ...kioskElevation(rs.dot, isDark) }]}
                  accessibilityLabel={`${member.name.split(' ')[0]}: ${done} of ${total} chores done`}
                >
                  <View style={[s.rosterAvatar, { backgroundColor: rs.badge, borderColor: rs.dot }]}>
                    <Text style={{ fontSize: 18 }}>{member.emoji ?? '👤'}</Text>
                  </View>
                  <View style={s.rosterBody}>
                    <View style={s.rosterTopLine}>
                      <Text style={[s.rosterName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {member.name.split(' ')[0]}
                      </Text>
                      <Text style={[s.rosterFrac, { color: clear ? colors.success : rs.dot }]}>
                        {clear ? 'done' : `${done}/${total}`}
                      </Text>
                    </View>
                    {/* A slim rule, not a chunky bar — it's a supporting
                        indicator, not the headline. */}
                    <View style={[s.rosterTrack, { backgroundColor: colors.surface }]}>
                      <View style={[s.rosterFill, { backgroundColor: clear ? colors.success : rs.dot, width: `${Math.round(pct * 100)}%` }]} />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Zone 3: Status lanes ──────────────────────────────────────
          Status demoted to a secondary facet below the person view, and
          each lane is now rendered only when it has something in it —
          four permanently-empty "Nothing here" columns is exactly the
          dead, admin-dashboard look this surface has to avoid. The lanes
          themselves keep the even flex grid (see the COLUMN_GAP comment
          above for the alignment fix). */}
      {byColumn.some(c => c.items.length > 0) && (
        <View style={s.zone}>
          <KioskZoneHeader title="In flight" accent={colors.primary} colors={colors} />
          <View style={s.columns}>
            {byColumn.filter(c => c.items.length > 0).map(col => (
              <View key={col.key} style={s.col}>
                <View style={s.colHeadRow}>
                  <Text style={[s.colHead, { color: colors.textSecondary }]} numberOfLines={1}>
                    {col.label.toUpperCase()}
                  </Text>
                  <View style={[s.colCount, { backgroundColor: colors.surface }]}>
                    <Text style={[s.colCountText, { color: colors.textSecondary }]}>{col.items.length}</Text>
                  </View>
                </View>
                <View style={s.cardGrid}>
                  {col.items.map(q => (
                    <View key={q.id} style={s.laneCard}>
                      {renderQuestCard(q, { showDeclineReason: col.key === 'redo' })}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Whole-board empty state — one calm, centered message rather
          than four separate "Nothing here" labels. */}
      {poolQuests.length === 0 && !byColumn.some(c => c.items.length > 0) && (
        // Deliberately quiet and SMALL. Live-reported: the previous
        // version was the single largest element on screen, which is
        // backwards for a state that by definition has nothing to show.
        // An empty state should reassure and get out of the way, so this
        // is one tidy inline row rather than a hero panel.
        <View style={[s.boardEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 20 }}>🎉</Text>
          <Text style={[s.boardEmptyText, { color: colors.textSecondary }]} numberOfLines={1}>
            All clear — every chore is done or approved.
          </Text>
        </View>
      )}

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
              <Text style={{ fontSize: 18 }}>{CATEGORY_META[q.category]?.emoji ?? '📋'}</Text>
            </View>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
            <Text style={[s.cardSub, { color: colors.textSecondary }]}>{memberName(q.assignedToId)} finished this</Text>
            <Pressable
              onPress={() => cheerChore(q.id, active.id)}
              style={[s.cheerBtn, { backgroundColor: colors.teal }]}
              accessibilityRole="button"
              accessibilityLabel={`Send a cheer for ${q.title}`}
            >
              <PartyPopper size={18} color="#fff" />
              <Text style={s.cheerBtnText}>Send a Cheer</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {pendingReview.length > 0 && (
        <>
          <Text style={[s.title, { color: colors.textPrimary, fontSize: KIOSK_TYPO.heading }]}>Waiting on Approval</Text>
          <View style={s.gpGrid}>
            {pendingReview.map(q => (
              <View key={q.id} style={[s.gpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                <Text style={[s.cardSub, { color: colors.textSecondary }]}>{memberName(q.assignedToId) ?? 'Unassigned'}</Text>
                <Pressable
                  onPress={() => approveQuest(q.id, active.id)}
                  style={[s.cheerBtn, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve ${q.title}`}
                >
                  <Check size={18} color="#fff" />
                  <Text style={s.cheerBtnText}>Approve</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}

      {(myGpQuestsOpen.length > 0 || myGpQuestsAssigned.length > 0) && (
        <>
          <Text style={[s.title, { color: colors.textPrimary, fontSize: KIOSK_TYPO.heading }]}>Your Sponsored Chores</Text>
          <View style={s.gpGrid}>
            {myGpQuestsOpen.map(q => (
              <View key={q.id} style={[s.gpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                <Pressable
                  onPress={() => claimQuest(q.id, active.id)}
                  style={[s.cheerBtn, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Claim ${q.title}`}
                >
                  <Text style={s.cheerBtnText}>Claim</Text>
                </Pressable>
              </View>
            ))}
            {myGpQuestsAssigned.map(q => (
              <View key={q.id} style={[s.gpCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                <Pressable
                  onPress={() => submitQuest(q.id, undefined, active.id)}
                  style={[s.cheerBtn, { backgroundColor: colors.amber }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Submit ${q.title} for review`}
                >
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

// Rescaled to the kiosk ladder. The card action buttons ("Claim Chore",
// "Approve") matter most: these are THE primary interactions on a shared
// counter surface, tapped by kids at arm's length, and were previously
// 12px-labelled phone buttons.
const s = StyleSheet.create({
  root: { flex: 1 },
  rootContent: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: KIOSK_SPACE.lg, gap: KIOSK_SPACE.sm },
  // Masthead: display-scale title + a live subtitle stating what the board
  // means right now, so someone who walked up without navigating here
  // understands the surface without reading any card.
  masthead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: KIOSK_SPACE.md, marginBottom: KIOSK_SPACE.lg,
  },
  // `title` is one of the few things that earns hero scale on this screen.
  title: { fontSize: KIOSK_TYPO.title, fontWeight: '800', letterSpacing: -0.6 },
  mastheadSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 3 },
  // Reachable without being dominant: the hit target is KIOSK_HIT.primary
  // (56), but the type stays at body scale and the shadow is soft rather
  // than heavy — being easy to tap and being visually loud are different
  // concerns, and conflating them is what made this button overbearing.
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.primary, borderRadius: KIOSK_RADIUS.full,
    justifyContent: 'center',
    shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  addBtnText: { color: '#fff', fontSize: KIOSK_TYPO.body, fontWeight: '800' },

  // Zones — the ambient rhythm. Large gaps BETWEEN zones and tight
  // grouping WITHIN them, so the screen resolves as three confident
  // blocks at a glance rather than one uniform field of cards.
  zone: { marginBottom: KIOSK_SPACE.xl },
  zoneHint: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, flexShrink: 1 },
  zoneHintText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },

  // Pool lane — the hero zone. Wide tiles, generous minimums.
  poolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  poolCard: { width: 320, maxWidth: '100%' },

  // People zone — compact roster chips (see the render comment). Each is
  // ~220px and one line tall, so six people fit where two cards did.
  rosterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  rosterChip: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    width: 220, maxWidth: '100%',
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingVertical: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.sm,
  },
  rosterAvatar: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  rosterBody: { flex: 1, minWidth: 0, gap: 5 },
  rosterTopLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: KIOSK_SPACE.xs },
  rosterName: { fontSize: KIOSK_TYPO.body, fontWeight: '800', flexShrink: 1 },
  rosterFrac: { fontSize: KIOSK_TYPO.label, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rosterTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  rosterFill: { height: '100%', borderRadius: 2 },

  // Lane column heads — a label plus a count chip, not a run-on string.
  colHeadRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.sm },
  colCount: { minWidth: 32, paddingHorizontal: 8, paddingVertical: 2, borderRadius: KIOSK_RADIUS.full, alignItems: 'center' },
  colCountText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', fontVariant: ['tabular-nums'] },
  laneCard: { width: '100%' },

  // One tidy inline row, not a hero panel — an empty state should be the
  // quietest thing on screen, not the largest.
  boardEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    alignSelf: 'flex-start', maxWidth: '100%',
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    paddingVertical: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.md,
  },
  boardEmptyText: { fontSize: KIOSK_TYPO.body, fontWeight: '600', flexShrink: 1 },
  // Was: no explicit height on the ScrollView itself (only on its
  // contentContainerStyle) — in a plain flex column, a horizontal
  // ScrollView with an unbounded cross-axis can stretch to fill whatever
  // vertical space its sibling below doesn't claim, instead of hugging its
  // own pill content. Live-reported: "the tasks filter pills height should
  // be fixed, it is stretching now too much." flexGrow:0 pins it to
  // exactly its content's height.
  // Was flex:1 — forced every column (and its inner ScrollView) to
  // stretch the full remaining screen height even when there were only 1-2
  // cards, reading as a huge dead void below a handful of cards
  // (live-reported: "too much height unnecessarily"). Columns now hug
  // their own content; the outer screen ScrollView (see the root return)
  // handles scrolling if a column's real content ever exceeds the screen.
  // `gap` here MUST equal the COLUMN_GAP constant the cards-per-row
  // estimate reads — both are KIOSK_SPACE.md; see the block comment on
  // that constant for why a mismatch produced a visibly ragged grid.
  columns: { flexDirection: 'row', gap: KIOSK_SPACE.md, alignItems: 'stretch' },
  // flex:1 + flexBasis:0 + minWidth:0 is what actually makes the four
  // columns an even grid: flexBasis:0 means the free space is divided
  // equally rather than distributed on top of differing content widths
  // (flex:1 alone still lets a column with a long chore title claim more),
  // and minWidth:0 lets a column shrink below its content's intrinsic
  // width instead of forcing the row to overflow.
  col: { flex: 1, flexBasis: 0, minWidth: 0 },
  colHead: { fontSize: KIOSK_TYPO.sectionLabel, fontWeight: '800', letterSpacing: 1.2, marginBottom: KIOSK_SPACE.sm },
  // Cards stack one per row within a lane; the lane itself is flex-sized.
  // stretching a whole narrow column — live-reported: a single card sat
  // in a huge empty column with nothing else to fill the space.
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.lg, alignContent: 'flex-start' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  catBadge: { width: 32, height: 32, borderRadius: KIOSK_RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  coinPill: { borderRadius: KIOSK_RADIUS.full, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 5 },
  coinPillText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  cardTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800', lineHeight: KIOSK_TYPO.body * 1.3 },
  cardSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  reasonBanner: { borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.xs },
  reasonText: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.sm },
  // Was a bare text link with no padding — a ~14px-tall tap target on a
  // kiosk. Now a real padded control meeting the touch-size floor.
  editLink: {
    alignSelf: 'flex-start', marginBottom: KIOSK_SPACE.xs, minHeight: 44,
    justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.xs,
  },
  editLinkText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  assigneeChip: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.full,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs, borderWidth: 1, flexShrink: 1,
  },
  assigneeChipText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dueText: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  cardActionBtn: {
    borderRadius: KIOSK_RADIUS.sm, minHeight: KIOSK_HIT.control,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.sm,
  },
  cardActionBtnText: { color: '#fff', fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  emptyCol: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', textAlign: 'center', paddingTop: KIOSK_SPACE.lg, width: '100%' },
  gpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  // maxWidth so a fixed-width card can never exceed a narrow portrait
  // pane and clip — same guard applied to every fixed-width card in kiosk.
  gpCard: { width: 320, maxWidth: '100%', borderRadius: KIOSK_RADIUS.md, borderWidth: 1, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  cheerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.sm, minHeight: KIOSK_HIT.control, paddingHorizontal: KIOSK_SPACE.sm,
  },
  cheerBtnText: { color: '#fff', fontSize: KIOSK_TYPO.body, fontWeight: '800' },
});
