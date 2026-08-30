import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated, Image, ActivityIndicator } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { fmtDateShort, fmtDateTime, parseLocalDate, parseTimeInput, parseDbTime } from '@/lib/dates';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { useEventStore } from '@/store/eventStore';
import type { Quest } from '@/store/questStore';
import { I } from './icons';
import { s } from './questCardStyles';
import { CollapsibleQuestCard } from './CollapsibleQuestCard';
import { FlashBonusBadge } from './FlashBonusBadge';
import { QuestStepper } from './QuestStepper';
import { ParentSelfNoteRow } from './ParentSelfNoteRow';
import { fmt12h, timeAgo } from './questAiFallbacks';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { ChoreHistorySheet } from '@/features/tasks/components/ChoreHistorySheet';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  q: Quest;
  now: number;
  questId?: string;
  members: any[];
  colors: any;
  isDark: boolean;
  cardBg: string;
  cardBord: string;
  isParent: boolean;
  isSenior: boolean;
  isKid: boolean;
  isKidOrTeen: boolean;
  isParentOrSenior: boolean;
  myId?: string;
  activeMember: any;
  isAssignedTo: (q: Quest, memberId: string) => boolean;
  isClaiming: Record<string, boolean>;
  handleClaim: (id: string) => void;
  openSubmitSheet: (quest: Quest) => void;
  setDeclineTarget: (t: { id: string; title: string; memberId?: string } | null) => void;
  // Kid/teen's own "Can't do this" — separate from setDeclineTarget (which
  // opens the parent-facing DeclineModal, wrong copy/presets for a kid
  // declining their own chore: "Decline Quest" / "The chore wasn't done
  // properly" reads as a parent rejecting a submission, not a kid backing
  // out). Opens the shared CantMakeItSheet instead, with real outcome
  // choices (pool/reassign/later/cancel) instead of pool-only.
  onCantMakeIt?: (chore: ChoreTask) => void;
  approveQuest: (id: string, memberId: string) => void;
  reassignQuest: (id: string, memberId: string, byId: string) => void;
  approveParticipant: (questId: string, memberId: string, byId: string) => void;
  reopenParticipant: (questId: string, memberId: string, byId: string) => void;
  updateQuest: (id: string, patch: any, byId?: string) => void;
  deleteQuest: (id: string) => void;
  setEditTarget: (q: Quest | null) => void;
  setDelegateTarget: (t: { id: string; title: string } | null) => void;
  setProofPhotoViewerUri: (uri: string | null) => void;
}

// The full per-quest card — header row (avatar stack/title/status),
// badge strip, expanded body (stepper, description, shopping list,
// submission proof, participant tracker) and action strip.
export function QuestCard({
  q, now, questId, members, colors, isDark, cardBg, cardBord,
  isParent, isSenior, isKid, isKidOrTeen, isParentOrSenior, myId, activeMember,
  isAssignedTo, isClaiming, handleClaim, openSubmitSheet, setDeclineTarget, onCantMakeIt,
  approveQuest, reassignQuest, approveParticipant, reopenParticipant,
  updateQuest, deleteQuest, setEditTarget, setDelegateTarget, setProofPhotoViewerUri,
}: Props) {
  const assignee = members.find(m => m.id === q.assignedToId);
  // Persisted (chore_tasks.gp_withdrawn_ids), per-GP "no guilt" pass on a
  // GP-welcome invite. Deliberately DB-backed, not local component state —
  // it must survive reload and must be per-grandparent (a household with
  // two GPs shouldn't have one GP's Pass hide the invite from the other).
  // Once passed, the button flips to "🔄 Reconsider?" instead of the card
  // disappearing — it stays reconsiderable until the chore is actually
  // claimed by someone, at which point canGpClaimPool goes false anyway
  // (assignedToId gets set) and this whole block stops rendering.
  const gpAlreadyPassed = isSenior && !!myId && (q.gpWithdrawnIds ?? []).includes(myId);
  const isPoolCard = q.isPool && q.status === 'todo';
  // 'in_progress' is what an ACCEPTED System-A assignment sets the chore to
  // (see respondToParentQuest's ACCEPT branch in choreStore.ts) — without
  // it here, an accepted parent-to-parent quest fell through every branch
  // in this component (not todo, not review, not done) and simply
  // vanished from the Chores tab the moment it was accepted.
  const isTodoCard = (q.status === 'todo' || q.status === 'claimed' || q.status === 'in_progress') && !isPoolCard;
  const isReview   = q.status === 'pending_approval';
  const isDoneCard = q.status === 'approved' || q.status === 'done';
  const isDeclined = q.status === 'declined';
  const choreData  = useChoreStore.getState().chores.find(c => c.id === q.id);

  // RBAC checks — derived from the one shared source both QuestCard and
  // Hub's KidQuestCard now call, instead of each hand-rolling its own
  // version (that drift already caused two documented bugs in KidQuestCard:
  // an overdue-badge mismatch and a dead decline-branch). See
  // features/tasks/lib/deriveCardActions.ts for the full rule set/comments —
  // this is the same logic that used to live inline here, just importable.
  const isActiveApprover = useTemporaryApproverStore(s => !!myId && s.isActiveApprover(myId));
  // deriveQuestActions only ever branches on kid-or-teen vs parent vs
  // senior — never null/unknown — so when none of isParent/isSenior/
  // isKidOrTeen hold (e.g. no activeMember resolved yet) this intentionally
  // passes a role that satisfies none of the function's role checks,
  // matching the original inline consts' behavior of evaluating false in
  // that same edge case.
  const {
    canClaim, canSubmit, canResubmit, canKidDecline, canAcceptGp, canGpClaimPool, canGpDone,
    canApprove, canReopen, canEditFull, canEditRestricted, canEdit, canDelete,
  } = deriveQuestActions(
    q,
    {
      id: myId ?? '',
      role: isParent ? 'parent' : isSenior ? 'senior' : isKidOrTeen ? 'kid' : undefined,
      isActiveApprover,
    },
    { categoryType: choreData?.categoryType, status: choreData?.status },
  );

  // Accent colour by status
  const accentColor =
    isPoolCard    ? BRAND.amber :
    isDeclined    ? colors.danger :
    isDoneCard    ? colors.success :
    isReview      ? BRAND.purple :
    q.priority === 'urgent' ? colors.danger : BRAND.purple;

  const hasBonus = q.bonusCoins > 0 && (!q.bonusExpiresAt || new Date(q.bonusExpiresAt).getTime() > now);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Whether the action strip has ANYTHING to render — with the
  // redundant Edit button gone (long-press covers it now), an
  // otherwise-inert card would show a bare empty divider bar
  // without this gate.
  const hasActionStripContent =
    !!q.pendingTerms ||
    canClaim || canAcceptGp || canGpClaimPool || canGpDone ||
    (canSubmit && !canAcceptGp && q.participants.length <= 1) ||
    canResubmit || canKidDecline ||
    (canApprove && q.participants.length <= 1) ||
    (isPoolCard && isParentOrSenior) ||
    (isParent && q.isAdultTask && isTodoCard && !q.assignedToId) ||
    (isSenior && q.questType === 'grandparent_quest' && isTodoCard && !q.assignedToId) ||
    (isSenior && q.questType === 'grandparent_quest' && isTodoCard && q.assignedToId === activeMember?.id);

  // ── Collapsed header ────────────────────────────────────────────
  const claimantIds    = q.assignedToIds?.length ? q.assignedToIds : (q.assignedToId ? [q.assignedToId] : []);
  const claimants      = claimantIds.map(id => members.find(m => m.id === id)).filter((m): m is typeof members[0] => !!m);
  const avatarSiblings = members.map(m => m.name);
  const AVSIZE    = 30;
  const AVOVERLAP = 16;
  const stackW    = claimants.length > 0 ? AVSIZE + (claimants.length - 1) * AVOVERLAP : 0;

  // Due date chip — urgency coloring
  const dueMsRaw    = q.dueDate ? parseLocalDate(q.dueDate).getTime() : null;
  const todayStart  = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd    = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  // dueMsRaw is a date-only value parsed at midnight — compare
  // against the start of today (not Date.now()) so a chore
  // due today isn't flagged "overdue" the instant midnight
  // passes, only once its due date is actually in the past.
  const isOverdue   = !!dueMsRaw && dueMsRaw < todayStart.getTime() && !isDoneCard && !isDeclined;
  const isDueToday  = !!dueMsRaw && dueMsRaw <= todayEnd.getTime() && !isOverdue;
  const isDueTomorrow = !!dueMsRaw && dueMsRaw <= tomorrowEnd.getTime() && !isDueToday && !isOverdue;
  const dueColor = isOverdue ? colors.danger : isDueToday ? colors.warning : colors.textSecondary;
  // Multi-slot bounties (maxClaimants > 1) have no per-claimant due date —
  // this one shared card's overdue state reflects the CHORE, not any one
  // claimant's own timeliness (QA Round 19, High: distinct claimants were
  // seeing an identical "Overdue" badge with no way to tell whose slot was
  // actually late). Softer wording here so it reads as chore-level status,
  // not a personal judgment on whoever's looking at it.
  const isMultiSlot = (q.maxClaimants ?? 1) > 1;
  const dueLabel = isOverdue    ? (isMultiSlot ? '⚠ Chore overdue' : `⚠ ${q.dueDate ? fmtDateShort(q.dueDate) : 'Overdue'}`)
                 : isDueToday  ? '⚡ Today'
                 : isDueTomorrow ? 'Tomorrow'
                 : q.dueDate ? fmtDateShort(q.dueDate) : 'Tonight';

  // Status line — concise, no "due" repetition (due is in chip on right)
  const bonusMs = hasBonus && q.bonusExpiresAt ? new Date(q.bonusExpiresAt).getTime() - Date.now() : 0;
  const bonusStatusSuffix = hasBonus && bonusMs > 0
    ? ` · ⚡ Grab it before bonus ends!`
    : '';

  // How early/late the submission landed vs. the deadline
  // (dueDate + dueTime, or end-of-day if no time was set) —
  // shown on the approved card so a parent can see at a glance
  // whether this was turned in ahead of schedule or scraped
  // in late, in days/hours down to the actual date+hour, not
  // just a vague "on time"/"late" label.
  const submitTimingLabel = (() => {
    if (!q.submittedAt || !q.dueDate) return '';
    const deadline = parseLocalDate(q.dueDate);
    if (q.dueTime) {
      const parsed = parseTimeInput(q.dueTime);
      if (parsed) {
        const [dh, dm] = parsed.split(':').map(Number);
        deadline.setHours(dh, dm || 0, 0, 0);
      }
    } else {
      deadline.setHours(23, 59, 59, 999);
    }
    const submitted = new Date(q.submittedAt);
    const diffMs = submitted.getTime() - deadline.getTime();
    const diffH  = Math.abs(diffMs) / 3_600_000;
    const fmtSpan = (hours: number) => {
      if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
      if (hours < 24) return `${Math.round(hours)}h`;
      const days = Math.floor(hours / 24);
      const rem  = Math.round(hours % 24);
      return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
    };
    const submittedStamp = submitted.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    return diffMs <= 0
      ? ` · ${fmtSpan(diffH)} early (${submittedStamp})`
      : ` · ${fmtSpan(diffH)} late (${submittedStamp})`;
  })();

  // Scenario 1.13 — a teen's over-threshold reward stays flagged
  // rewardPendingReview until a parent Approves/Adjusts/Declines it, but
  // the WORK itself can still fully approve in the meantime (approveChore
  // proceeds normally, only payout is gated). Without this, the card looked
  // byte-for-byte identical to a normal, fully-paid "Approved" quest —
  // the teen had zero indication their coins were actually withheld.
  // GPs are never paid coins (master-flow R_COINS) — this had no isGPQuest
  // guard, unlike the pill above (line 332-333) and ParentReviewDeck.tsx's
  // own equivalent fix, so a completed GP quest's done-card status line
  // still showed "Approved · +N paid" even though nothing was ever paid.
  const isGPQuestDone = q.questType === 'grandparent_quest';
  const paidSuffix = isGPQuestDone
    ? ''
    : q.rewardPendingReview
      ? ' · reward pending parent review'
      : q.participants.length > 1 ? ` · ${q.participants.length} paid` : q.coins > 0 ? ` · +${q.coins} paid` : '';
  const statusLine = isReview
    ? `Submitted ${q.submittedAt ? new Date(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'for review'}`
    : isDoneCard
      ? `Approved${submitTimingLabel}${paidSuffix}`
      : isDeclined
        ? 'Declined ❌'
        : isPoolCard && claimants.length > 1
          ? `${claimants.length} kids racing for it${bonusStatusSuffix}`
          : isPoolCard && claimants.length === 1
            ? `${claimants[0].name} claimed it`
            : isPoolCard
              ? `Open — claim it now${bonusStatusSuffix}`
              : q.claimedAt
                ? `In progress · ${timeAgo(q.claimedAt)}`
                : hasBonus
                  ? `Not started${bonusStatusSuffix}`
                  : (q as any).createdAt
                    ? `Added ${timeAgo((q as any).createdAt)}`
                    : 'Not started';

  const cardHeader = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 }}>
        {/* Overlapping avatar stack */}
        {claimants.length > 0 && (
          <View style={{ width: stackW, height: AVSIZE, flexShrink: 0 }}>
            {claimants.slice(0, 4).map((m, i) => (
              <View key={m.id} style={{ position: 'absolute', left: i * AVOVERLAP, zIndex: claimants.length - i }}>
                <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={avatarSiblings} size={AVSIZE} ringColor={accentColor} ringWidth={1.5} />
              </View>
            ))}
          </View>
        )}

        {/* Title + status */}
        <View style={{ flex: 1 }}>
          <Text style={[s.questTitle, { color: colors.textPrimary }]} numberOfLines={1}>{q.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            {q.recurrence !== 'once' && (
              <Text style={{ fontSize: 12 }} accessibilityLabel={`Repeats ${q.recurrence}`}>🔄</Text>
            )}
            <Text style={{ fontSize: TYPO.label, color: isDoneCard ? colors.success : colors.textSecondary, fontWeight: isDoneCard ? '700' : '400', flexShrink: 1 }} numberOfLines={1}>
              {statusLine}
            </Text>
          </View>
          {/* Full claimed → submitted → approved timeline — previously only
              shown once the card was expanded (the collapsed body below),
              so a parent scanning a long Completed list never saw it
              without tapping into every card individually. Kid's own view
              renders through this exact same component, so this was never
              actually a role difference in the code — but making it
              visible in the always-shown header, not just the collapsed
              body, is the fix that actually matches what "show the detail
              like kid's chores" is asking for. */}
          {isDoneCard && (q.claimedAt || q.submittedAt) && (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
              {/* Was raw new Date(ts) — Postgres timestamps ("2026-08-24
                  19:53:09+00") return Invalid Date from RN's JS engine,
                  which toLocaleDateString/toLocaleTimeString then render
                  as the literal text "Invalid Date" (same root cause as
                  the celebration-replay bug found live this session).
                  parseDbTime normalizes the shape before parsing. */}
              {q.claimedAt && `Claimed ${parseDbTime(q.claimedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${parseDbTime(q.claimedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              {q.claimedAt && q.submittedAt ? ' → ' : ''}
              {q.submittedAt && `Submitted ${parseDbTime(q.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${parseDbTime(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              {q.submittedAt && (q as any).approvedAt ? ' → ' : ''}
              {(q as any).approvedAt && `Done ${parseDbTime((q as any).approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${parseDbTime((q as any).approvedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
            </Text>
          )}
          {/* Cheer indicator — previously nothing anywhere showed whether a
              chore had been cheered, so a correctly-recorded cheer (write
              confirmed in the DB) looked identical to an uncheered chore on
              every card, reading as "the cheer didn't work" even when it did. */}
          {(q.cheers ?? []).length > 0 && (
            <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
              🎉 Cheered by {(q.cheers ?? [])
                .map(c => members.find(m => m.id === c.memberId)?.name?.split(' ')[0])
                .filter(Boolean)
                .join(', ')}
            </Text>
          )}
        </View>

        {/* Right: due chip + coins (done cards show their pill
            pinned to the card's bottom-right instead — see
            below — so this column only carries the due chip
            and in-progress coin pill here). */}
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <TouchableOpacity onPress={() => setHistoryOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          {(isTodoCard || isPoolCard || isReview) && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
              backgroundColor: dueColor + '14', borderWidth: 1, borderColor: dueColor + '30' }}>
              <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: dueColor, letterSpacing: 0.2 }}>{dueLabel}</Text>
            </View>
          )}
          {!isDoneCard && q.coins > 0 && (() => {
            const role = members.find(m => m.id === q.assignedToId)?.role;
            const isAdult = role === 'parent' || role === 'senior';
            const isGPQuest = q.questType === 'grandparent_quest';
            if (isAdult || isGPQuest || q.isAdultTask) return null;
            const coinAmt = hasBonus ? q.coins + q.bonusCoins : q.coins;
            // rewardPendingReview (1.13's teen co-sign threshold) reuses
            // the same "locked" purple/🔒 treatment isReview already uses —
            // both mean the same thing to the teen looking at this pill:
            // the coins aren't really theirs yet. Without this, a flagged
            // quest showed the normal amber/🪙 pill from the moment it was
            // created, identical to any other quest, with no hint the
            // reward needs a parent's sign-off before it'll actually pay.
            const locked = isReview || q.rewardPendingReview;
            const coinColor = locked ? BRAND.purple : BRAND.amber;
            return (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
                backgroundColor: coinColor + '14', borderWidth: 1, borderColor: coinColor + '30',
              }}>
                <Text style={{ fontSize: 11 }}>{locked ? '🔒' : '🪙'}</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: coinColor }}>{coinAmt}</Text>
              </View>
            );
          })()}
        </View>
      </View>


      {/* Flash bonus badge — full width, below header row so it never overlaps title */}
      {hasBonus && q.bonusExpiresAt && (
        <View style={{ marginTop: 6 }}>
          <FlashBonusBadge bonusCoins={q.bonusCoins} expiresAt={q.bonusExpiresAt} />
        </View>
      )}
    </View>
  );

  const swipeDeleteAction = (_prog: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    // Spec 6.3: deleting an item someone is actively working on needs an
    // explicit extra confirmation naming them, and they deserve a clear,
    // kind "this was cancelled" notice — not silence. QuestsScreen's
    // edit-modal delete path already does this (see its onDelete handler);
    // this swipe-to-delete path previously had generic copy with no
    // assignee mention and sent no notification at all, even though it's
    // reachable on an in-progress/submitted quest (canDelete doesn't
    // exclude those statuses).
    const isActive = q.status === 'in_progress' || q.status === 'pending_approval';
    const assigneeId = q.assignedToId;
    const assignee = assigneeId ? members.find(m => m.id === assigneeId) : undefined;
    const title = isActive && assignee ? 'Delete In-Progress Chore' : 'Delete Chore';
    const message = isActive && assignee
      ? `${assignee.name.split(' ')[0]} is currently working on "${q.title}" — delete anyway?`
      : `Remove "${q.title}"? This cannot be undone.`;
    return (
      <TouchableOpacity
        style={{ width: 72, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.danger, borderRadius: 18, marginLeft: 8, marginBottom: 10 }}
        onPress={() => Alert.alert(
          title,
          message,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete Anyway', style: 'destructive', onPress: () => {
            if (isActive && assigneeId) {
              const parentName = activeMember?.name?.split(' ')[0] ?? 'A parent';
              const msg = `🗑️ ${parentName} removed the quest "${q.title}" that was assigned to you — no action needed on your end.`;
              try {
                const { useChatStore } = require('@/store/chatStore');
                useChatStore.getState().sendMessage(assigneeId, activeMember?.id ?? '', msg);
              } catch { /* chat store not available */ }
            }
            deleteQuest(q.id);
          } }]
        )}
      >
        <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
          <I.Trash c={colors.textInverse} size={20} />
          <Text style={{ color: colors.textInverse, fontSize: TYPO.micro, fontWeight: '800', marginTop: 2 }}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View key={q.id}>
    <Swipeable
      renderRightActions={canDelete ? swipeDeleteAction : undefined}
      overshootRight={false}
      friction={2}
    >
    <CollapsibleQuestCard accentColor={accentColor} cardBg={cardBg} cardBord={cardBord}
      onDoubleTap={canEdit ? () => setEditTarget(q) : undefined}
      onLongPress={canEdit ? () => setEditTarget(q) : undefined}
      initiallyExpanded={q.id === questId}
      header={cardHeader}
      dimmed={isDoneCard}
    >
      {/* ── Expanded body — NO title/coin repeat, header already shows them ── */}

        {/* Progress stepper — single-kid quests only (multi-kid gets per-row stepper below).
            Once fully settled (approved/declined) the 3-node stepper is past business —
            a compact one-line summary keeps that history without the tall spread. */}
        {q.participants.length <= 1 && (!!q.assignedToId || q.claimedAt || q.submittedAt || (q as any).approvedAt || (q as any).declinedAt) && (
          isDoneCard && (q as any).approvedAt ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 2, marginBottom: 6 }}>
              {q.claimedAt && `Claimed ${parseDbTime(q.claimedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              {q.claimedAt && (q.submittedAt || (q as any).approvedAt) ? ' → ' : ''}
              {q.submittedAt && `Submitted ${parseDbTime(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              {q.submittedAt && (q as any).approvedAt ? ' → ' : ''}
              {(q as any).approvedAt && `Approved ${parseDbTime((q as any).approvedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
            </Text>
          ) : (
            <QuestStepper
              claimedAt={q.claimedAt}
              submittedAt={q.submittedAt}
              approvedAt={(q as any).approvedAt}
              declinedAt={(q as any).declinedAt}
              declineReason={q.declineReason}
              reviewerName={members.find(m => m.id === q.reviewedById)?.name.split(' ')[0]}
              accentColor={accentColor}
              isDark={isDark}
              colors={colors}
              isAssigned={!!q.assignedToId && !q.claimedAt}
            />
          )
        )}

        {/* Description */}
        {q.description ? (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 20, marginBottom: 10 }}>
            {q.description}
          </Text>
        ) : null}

        {/* Shopping item list — sourced from chore row (choreStore) or quest row (questStore) */}
        {(() => {
          const si = choreData?.shoppingItems ?? q.shoppingItems;
          const ss = choreData?.shoppingStore ?? q.shoppingStore;
          const sb = choreData?.shoppingBudget ?? q.shoppingBudget;
          return (si?.length || ss || sb != null) ? (
          <View style={{ marginBottom: 10, borderRadius: 10, borderWidth: 1,
            borderColor: colors.teal + '40',
            backgroundColor: colors.tealLight, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
              borderBottomWidth: si?.length ? 1 : 0,
              borderBottomColor: colors.teal + '30' }}>
              <Text style={{ fontSize: 14 }}>🛍️</Text>
              <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.teal }}>
                {ss ? `Shop at ${ss}` : 'Shopping List'}
              </Text>
              {sb != null && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                  backgroundColor: colors.successLight, borderWidth: 1, borderColor: colors.success }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.successDark }}>
                    Budget ${sb}
                  </Text>
                </View>
              )}
            </View>
            {si?.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 12, paddingVertical: 7,
                borderBottomWidth: i < (si.length - 1) ? 1 : 0,
                borderBottomColor: colors.teal + '20' }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5,
                  borderColor: colors.teal, backgroundColor: 'transparent' }} />
                <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
              </View>
            ))}
          </View>
          ) : null;
        })()}

        {/* Submitted time + photo proof — stays visible after
            approval too (not just while In Review), so the
            proof photo remains available for future reference
            instead of vanishing the moment a quest is done. */}
        {(isReview || isDoneCard) && q.submittedAt && (
          <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.primary + '40', overflow: 'hidden', backgroundColor: colors.primaryLight }}>
            {/* Submitted banner */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
              <I.Mail c={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary }}>
                  {isDoneCard
                    ? `${assignee?.name ?? 'Kid'} submitted this`
                    : `${assignee?.name ?? 'Kid'} submitted for review`}
                </Text>
                <Text style={{ fontSize: TYPO.micro + 1, color: colors.primaryDark }}>
                  {fmtDateTime(q.submittedAt)}
                </Text>
              </View>
              {q.photoRequired && !q.photoUrl && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.warningLight, borderWidth: 1, borderColor: colors.warning }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.warningDark }}>No photo</Text>
                </View>
              )}
            </View>
            {/* Photo thumbnail */}
            {q.photoUrl ? (
              <TouchableOpacity onPress={() => setProofPhotoViewerUri(q.photoUrl!)}>
                <Image
                  source={{ uri: q.photoUrl }}
                  style={{ width: '100%', height: 160, backgroundColor: colors.surface }}
                  resizeMode="cover"
                />
                <View style={{ position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textInverse, fontWeight: '700' }}>Tap to enlarge</Text>
                </View>
              </TouchableOpacity>
            ) : q.photoRequired ? (
              <View style={{ height: 80, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.warningLight }}>
                <I.Photo c={colors.warningDark} size={28} />
                <Text style={{ fontSize: TYPO.label, color: colors.warningDark, fontWeight: '600' }}>Photo proof missing</Text>
              </View>
            ) : null}
            {/* Completion note */}
            {q.completionNote ? (
              <View style={{ padding: 10, paddingTop: 4 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.primary, fontStyle: 'italic' }}>
                  "{q.completionNote}"
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ── Badge strip — settled/paid cards skip this entirely;
            category/difficulty/etc are no longer live info
            once a chore is done, and the header pill already
            says everything that still matters. ── */}
        {!isDoneCard && (
        <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
          <View style={[s.badge, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '40' }]}>
            <Text style={[s.badgeText, { color: colors.primary }]}>{q.category}</Text>
          </View>
          {q.dueDate && (
            <View style={[s.badge, { backgroundColor: dueColor + '14', borderColor: dueColor + '40' }]}>
              <Text style={[s.badgeText, { color: dueColor }]}>
                📅 {fmtDateShort(q.dueDate)}{q.dueTime ? ` · ${fmt12h(q.dueTime)}` : ''}
              </Text>
            </View>
          )}
          {q.priority === 'urgent' && (
            <View style={[s.badge, { backgroundColor: colors.dangerLight, borderColor: colors.danger + '40' }]}>
              <Text style={[s.badgeText, { color: colors.danger }]}>🔴 Urgent</Text>
            </View>
          )}
          {/* Spec 8.2 — display-only badge for a quest linked to a calendar event. */}
          {(q as any).linkedEventId && (() => {
            const linkedEvent = useEventStore.getState().events.find(e => e.id === (q as any).linkedEventId);
            if (!linkedEvent) return null;
            return (
              <View style={[s.badge, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '40' }]}>
                <Text style={[s.badgeText, { color: colors.primary }]} numberOfLines={1}>🔗 {linkedEvent.title}</Text>
              </View>
            );
          })()}
          {q.difficulty && (
            <View style={[s.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.badgeText, { color: colors.textSecondary }]}>
                {q.difficulty === 'easy' ? '😊' : q.difficulty === 'medium' ? '💪' : q.difficulty === 'hard' ? '🔥' : '⚡'}{' '}
                {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
              </Text>
            </View>
          )}
          {isPoolCard && (
            <View style={[s.badge, { backgroundColor: colors.warningLight, borderColor: BRAND.amber + '60' }]}>
              <Text style={[s.badgeText, { color: BRAND.amber }]}>⚡ Open Bounty</Text>
            </View>
          )}
          {q.photoRequired && (isTodoCard || isPoolCard) && (
            <View style={[s.badge, { backgroundColor: colors.warningLight, borderColor: colors.warning + '60' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <I.Photo c={colors.warningDark} size={11} />
                <Text style={[s.badgeText, { color: colors.warningDark }]}>Photo proof</Text>
              </View>
            </View>
          )}
          {hasBonus && (() => {
            let countdownLabel = '';
            if (q.bonusExpiresAt) {
              const secsLeft = Math.max(0, Math.floor((new Date(q.bonusExpiresAt).getTime() - now) / 1000));
              const h = Math.floor(secsLeft / 3600);
              const m = Math.floor((secsLeft % 3600) / 60);
              const sec = secsLeft % 60;
              if (h > 0) countdownLabel = ` · ${h}h ${m}m left`;
              else if (m > 0) countdownLabel = ` · ${m}m ${sec}s left`;
              else countdownLabel = secsLeft > 0 ? ` · ${sec}s left` : ' · expired';
            }
            return (
              <View style={[s.badge, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '60' }]}>
                <Text style={[s.badgeText, { color: colors.warning, fontWeight: '900' }]}>
                  🔥 +{q.bonusCoins}🪙 BONUS{countdownLabel}
                </Text>
              </View>
            );
          })()}
        </View>

        {/* edited-by notice — only when modified */}
        {q.lastModifiedById && (
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <I.Edit2 c={colors.textTertiary} size={10} />
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
              edited by {members.find(m => m.id === q.lastModifiedById)?.name ?? 'parent'}
            </Text>
          </View>
          </Text>
        )}

        {/* ── Decline reason ── */}
        {isDeclined && q.declineReason && (
          <View style={[s.declineBox, { backgroundColor: colors.dangerLight, borderColor: colors.danger + '60' }]}>
            <I.AlertCircle c={colors.danger} />
            <Text style={[s.declineText, { color: colors.danger, flex: 1 }]}>{q.declineReason}</Text>
          </View>
        )}

        {/* ── Named handoff — receiver's Accept/Pass-again offer ──
            Was confirmed via QA audit to have zero UI anywhere despite
            the store actions (offerChoreHandoff/acceptChoreHandoff/
            declineChoreHandoff) existing since earlier this session —
            CantMakeItSheet's "hand it to someone specific" wrote a real
            pending offer that no screen ever showed the receiver. */}
        {q.pendingHandoffTo === myId && (
          <View style={[s.declineBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '60' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.declineText, { color: colors.primary, fontWeight: '800' }]}>
                {members.find((m: any) => m.id === q.pendingHandoffOfferedBy)?.name?.split(' ')[0] ?? 'Someone'} wants to hand you this
              </Text>
              {!!q.pendingHandoffReason && (
                <Text style={[s.declineText, { color: colors.textSecondary }]}>"{q.pendingHandoffReason}"</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Terms changed (QA punch list #2) ── */}
        {q.pendingTerms && (
          <View style={[s.declineBox, { backgroundColor: colors.dangerLight, borderColor: colors.danger + '60' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.declineText, { color: colors.danger, fontWeight: '800' }]}>The terms changed</Text>
              {q.pendingTerms.old.coinsReward !== q.pendingTerms.new.coinsReward && (
                <Text style={[s.declineText, { color: colors.textSecondary }]}>
                  Coins: {q.pendingTerms.old.coinsReward} → {q.pendingTerms.new.coinsReward} 🪙
                </Text>
              )}
              {q.pendingTerms.old.dueDate !== q.pendingTerms.new.dueDate && (
                <Text style={[s.declineText, { color: colors.textSecondary }]}>
                  Due: {q.pendingTerms.old.dueDate ?? 'none'} → {q.pendingTerms.new.dueDate ?? 'none'}
                </Text>
              )}
              {q.pendingTerms.old.dueTime !== q.pendingTerms.new.dueTime && (
                <Text style={[s.declineText, { color: colors.textSecondary }]}>
                  Due time: {q.pendingTerms.old.dueTime ?? 'none'} → {q.pendingTerms.new.dueTime ?? 'none'}
                </Text>
              )}
            </View>
          </View>
        )}

        </>
        )}{/* end badge strip */}

      {/* Parent's private note — inside the expandable body
          (not a pinned footer) so it only shows once someone
          actually opens the card, per collapsed-card density. */}
      {isParent && isDoneCard && (
        <View style={{ marginBottom: 8 }}>
          <ParentSelfNoteRow choreId={q.id} initialNote={choreData?.parentNote} colors={colors} isDark={isDark} />
        </View>
      )}

      {/* ── Participant tracker — multi-kid only (single-kid: header + stepper covers it) ── */}
      {q.participants.length > 1 && (
        <View style={{ marginBottom: 4 }}>
          {q.participants.filter(p =>
            // Kids only see their own participant row; parents/seniors see all
            isParentOrSenior || p.memberId === activeMember?.id
          ).map(p => {
            const pm = members.find(m => m.id === p.memberId);
            if (!pm) return null;
            const pSiblings = members.map(m => m.name);
            const pIsMe = p.memberId === activeMember?.id;
            const pStatusColor =
              p.status === 'approved'          ? colors.success
              : p.status === 'pending_approval' ? BRAND.purple
              : p.status === 'declined'         ? colors.danger
              : p.status === 'in_progress'      ? BRAND.amber
              : colors.textTertiary;
            const pStatusLabel =
              p.status === 'approved'          ? `✅ Approved · +${p.coinsAwarded ?? q.coins}🪙`
              : p.status === 'pending_approval' ? `📬 Submitted${p.submittedAt ? ' · ' + new Date(p.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''}`
              : p.status === 'declined'         ? `❌ Declined${p.declineReason ? ' — ' + p.declineReason : ''}`
              : p.status === 'in_progress'      ? `🏃 In progress${p.claimedAt ? ' · ' + timeAgo(p.claimedAt) : ''}`
              : '○ Not started';
            return (
              <View key={p.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FamilyAvatar name={pm.name} emoji={pm.emoji} avatarUrl={(pm as any).avatarUrl} siblings={pSiblings} size={30} ringColor={pStatusColor} ringWidth={1.5} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{pm.name}</Text>
                    <Text style={{ fontSize: TYPO.micro + 1, color: pStatusColor }}>{pStatusLabel}</Text>
                  </View>
                  {/* Approve/decline/reopen a kid's submission is a PARENT-ONLY
                      action — a grandparent's only rights on someone else's
                      quest are claim/pass/can't-make-it (master-flow spec).
                      Was isParentOrSenior, which showed these controls to a
                      grandparent on ANY multi-kid quest card regardless of
                      who created/sponsored it — confirmed live, not
                      GP-sponsored-only. The client-side canApprove() check
                      downstream already no-ops a GP's tap, but a visible
                      button that silently does nothing is still wrong; see
                      also the bounty_claims RLS fix that closes the
                      matching server-side gap. */}
                  {isParent && p.status === 'pending_approval' && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger }}
                        onPress={() => setDeclineTarget({ id: q.id, title: q.title, memberId: p.memberId })}
                      >
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success }}
                        onPress={() => approveParticipant(q.id, p.memberId, activeMember?.id ?? '')}
                      >
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.success }}>Approve ✓</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {isParent && p.status === 'declined' && (
                    <TouchableOpacity
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                      onPress={() => reopenParticipant(q.id, p.memberId, activeMember?.id)}
                    >
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textSecondary }}>Reopen</Text>
                    </TouchableOpacity>
                  )}
                  {/* Kid's own submit + send-back buttons */}
                  {pIsMe && (p.status === 'todo' || p.status === 'in_progress') && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '40' }}
                        onPress={() => Alert.alert(
                          "Can't do this?",
                          `Send "${q.title}" back to the family pool so a parent can reassign it?`,
                          [
                            { text: 'Keep it', style: 'cancel' },
                            {
                              text: 'Send back', style: 'destructive',
                              onPress: () => {
                                // A multi-slot bounty (real claims tracked in
                                // bounty_claims, not chore_tasks.assignedToId)
                                // needs its own withdraw path — reassignQuest
                                // only ever mutates the parent chore row's
                                // assignedToId/isPool, never touching this
                                // kid's own claim, so their slot stayed
                                // status='in_progress' forever with no way to
                                // free it (live-DB QA, kid-role sweep, High).
                                if ((choreData?.maxClaimants ?? 1) > 1 && myId) {
                                  useChoreStore.getState().withdrawBountyClaim(q.id, myId);
                                } else {
                                  reassignQuest(q.id, '', activeMember?.id);
                                }
                              },
                            },
                          ]
                        )}
                      >
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>Can't do this</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: BRAND.purple + '20', borderWidth: 1, borderColor: BRAND.purple }}
                        onPress={() => openSubmitSheet(q)}
                      >
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Submit</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {/* Per-kid progress stepper */}
                {(p.claimedAt || p.submittedAt || p.approvedAt || p.declinedAt) && (
                  <View style={{ marginLeft: 40, marginTop: 6 }}>
                    <QuestStepper
                      claimedAt={p.claimedAt}
                      submittedAt={p.submittedAt}
                      approvedAt={p.approvedAt}
                      declinedAt={p.declinedAt}
                      declineReason={p.declineReason}
                      reviewerName={members.find(m => m.id === p.approvedById)?.name.split(' ')[0]}
                      accentColor={pStatusColor}
                      isDark={isDark}
                      colors={colors}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Action strip — pool claim + single-kid fallback + edit hint */}
      {hasActionStripContent && (
      <View style={[s.actionStrip, { borderTopColor: colors.border }]}>

        {/* QA punch list #2 — a parent changed coins/due-date on this
            already-claimed chore (propose_terms_change RPC). Paused until
            the claimant Accepts or Hands It Back — replaces every other
            action in the strip while pending, same as KidQuestCard.tsx's
            Hub-side equivalent. */}
        {q.pendingTerms && q.assignedToId === myId && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.success }]}
              onPress={() => useChoreStore.getState().acceptTermsChange(q.id, myId ?? '')}
            >
              <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Still fine by me</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.danger }]}
              onPress={() => useChoreStore.getState().rejectTermsChange(q.id, myId ?? '')}
            >
              <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Hand it back</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Receiver of a named handoff — Accept ("I've got it") or Pass
            again ("can't either — put it back", no reason required). */}
        {q.pendingHandoffTo === myId && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.success }]}
              onPress={() => useChoreStore.getState().acceptChoreHandoff(q.id, myId ?? '')}
            >
              <Text style={[s.actionBtnText, { color: colors.textInverse }]}>I've got it</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.danger }]}
              onPress={() => useChoreStore.getState().declineChoreHandoff(q.id, myId ?? '')}
            >
              <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Can't either</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Kid: Claim open bounty */}
        {!q.pendingTerms && canClaim && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: BRAND.amber, opacity: isClaiming[q.id] ? 0.6 : 1 }]}
            onPress={() => handleClaim(q.id)}
            disabled={isClaiming[q.id]}
          >
            {isClaiming[q.id]
              ? <ActivityIndicator color={colors.textInverse} size="small" />
              : <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Claim Quest</Text>}
          </TouchableOpacity>
        )}

        {/* Kid: opt in to a grandparent quest before working it */}
        {!q.pendingTerms && canAcceptGp && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: colors.success }]}
            onPress={() => useChoreStore.getState().startGrandparentQuest(q.id, myId ?? '')}
          >
            <Text style={[s.actionBtnText, { color: colors.textInverse }]}>🙌 I'll take it</Text>
          </TouchableOpacity>
        )}

        {/* Kid: Submit single-assign quest (multi-assign submits via participant row) */}
        {!q.pendingTerms && canSubmit && !canAcceptGp && q.participants.length <= 1 && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: BRAND.purple }]}
            onPress={() => openSubmitSheet(q)}
          >
            <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Submit for Review</Text>
          </TouchableOpacity>
        )}

        {/* QA punch list #5 — kid disputed the redo instead of resubmitting,
            waiting on a second parent. Same waiting state as
            KidQuestCard.tsx's Hub-side equivalent. */}
        {q.kidDisputedRedo && (
          <Text style={{ fontSize: 12, color: colors.textTertiary, fontStyle: 'italic', paddingVertical: 10 }}>
            Waiting on a second parent to take a look…
          </Text>
        )}

        {/* Kid / teen: revise a parent-declined quest and send it back */}
        {!q.pendingTerms && !q.kidDisputedRedo && canResubmit && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: BRAND.purple }]}
            onPress={() => openSubmitSheet(q)}
          >
            <Text style={[s.actionBtnText, { color: colors.textInverse }]}>↩ Revise & Resubmit</Text>
          </TouchableOpacity>
        )}

        {/* QA punch list #5 — "I did do it right the first time" instead of
            resubmitting, asks a second parent to review the original
            submission. Only offered alongside a real redo (not while
            already disputed). */}
        {!q.pendingTerms && !q.kidDisputedRedo && canResubmit && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: BRAND.purple }]}
            onPress={() => useChoreStore.getState().disputeRedo(q.id, myId ?? '')}
          >
            <Text style={[s.actionBtnText, { color: BRAND.purple }]}>I did do it</Text>
          </TouchableOpacity>
        )}

        {/* Kid: Decline / refuse an assigned quest — same label as the Hub's
            GP-quest card ("Decline") when this is that same choice */}
        {!q.pendingTerms && canKidDecline && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.danger }]}
            onPress={() => {
              if (onCantMakeIt && choreData) onCantMakeIt(choreData);
              else setDeclineTarget({ id: q.id, title: q.title, memberId: undefined });
            }}
          >
            <Text style={[s.actionBtnText, { color: colors.danger }]}>{canAcceptGp ? 'Decline' : "Can't do this"}</Text>
          </TouchableOpacity>
        )}

        {/* Parent/senior: Approve + Redo — same actions the Hub's
            Chore Review board offers, so a parent doesn't have
            to leave the Quests tab to actually review a
            submission. Multi-kid quests get this per-row above
            instead (each participant reviewed independently). */}
        {canApprove && q.participants.length <= 1 && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.danger }]}
              onPress={() => setDeclineTarget({ id: q.id, title: q.title, memberId: undefined })}
            >
              <Text style={[s.actionBtnText, { color: colors.danger }]}>↩ Redo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { flex: 2, backgroundColor: colors.success }]}
              onPress={() => approveQuest(q.id, activeMember?.id ?? '')}
            >
              <Text style={[s.actionBtnText, { color: colors.textInverse }]}>✓ Approve</Text>
            </TouchableOpacity>
          </>
        )}

        {/* A parent-claimable "I'll do this" on a kid bounty
            pool card was removed — a bounty pool is
            specifically kid-earning-coins territory; a parent
            wanting to do the task themselves should mark it
            Parent Only at creation, not self-claim a kid's
            chore. Parents/seniors still see the status badge
            below (claimant count), just no claim action. */}

        {/* Parent/Senior view of open bounty — show claimant count vs cap.
            Hidden for a GP who already has their own I'd Love To Help /
            Reconsider? button below (canGpClaimPool) — that button already
            conveys the open/waiting state directly, so a redundant
            "Waiting for a grandparent to claim" badge above it was just
            noise for exactly the person it was talking about. */}
        {isPoolCard && isParentOrSenior && !canGpClaimPool && (
          <View style={[s.paidBadge, { backgroundColor: colors.warningLight, borderColor: BRAND.amber + '50' }]}>
            <Text style={[s.paidText, { color: BRAND.amber }]}>
              {q.participants.length === 0
                ? (q.inviteGrandparents ? 'Waiting for a grandparent to claim' : 'Waiting for a kid to claim')
                : q.maxClaimants && q.participants.length >= q.maxClaimants
                  ? `Full — ${q.participants.length}/${q.maxClaimants} claimed`
                  : `${q.participants.length} claimed${q.maxClaimants ? ` · ${q.maxClaimants - q.participants.length} spots left` : ''}`}
            </Text>
          </View>
        )}

        {/* Parent: Take It (self-assign) + Delegate on unassigned adult tasks.
            Any adult task WITH an assignee (mine or a co-parent's) never
            reaches this card at all — QuestsScreen.tsx excludes those IDs
            from filteredQuests and renders MyAdultQuestCard/
            OthersAdultQuestCard instead, the same components Household
            Backlog uses, so both screens show identical actions for it. */}
        {isParent && q.isAdultTask && isTodoCard && !q.assignedToId && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: BRAND.purple + '18', borderWidth: 1.5, borderColor: BRAND.purple + '50', flex: 1 }]}
              onPress={() => Alert.alert(
                'Take It',
                `Assign "${q.title}" to yourself?`,
                [{ text: 'Cancel', style: 'cancel' }, {
                  text: "✋ Take It",
                  onPress: () => {
                    if (!activeMember?.id) return;
                    supabase.rpc('reassign_chore', {
                      p_chore_id: q.id, p_new_member_id: activeMember.id, p_by_member_id: activeMember.id,
                    }).then(({ error }) => {
                      if (error) { console.warn('[QuestCard] Take It reassign_chore failed', error.message); return; }
                      showToast('Taken ✓');
                      // Self-claim onto an unassigned adult task — the
                      // acting parent doesn't need telling about their own
                      // action, but the co-parent(s) do (mirrors
                      // quest_claimed's own "parents get told when a task
                      // gets claimed" routing, which claimPoolQuest/
                      // claimBounty also newly fire for the kid-pool case).
                      const familyId = useChoreStore.getState().chores.find(c => c.id === q.id)?.familyId;
                      if (familyId) {
                        supabase.functions.invoke('quest-event-notifier', {
                          body: {
                            event: 'quest_claimed', questId: q.id, questTitle: q.title,
                            familyId, triggeredById: activeMember.id, assigneeId: activeMember.id,
                          },
                        }).catch((e: any) => console.warn('[QuestCard] Take It notify failed', e?.message));
                      }
                    });
                  },
                }]
              )}
            >
              <Text style={[s.actionBtnText, { color: BRAND.purple }]}>✋ Take It</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { borderWidth: 1.5, borderColor: BRAND.amber + '60', backgroundColor: 'transparent', flex: 1 }]}
              onPress={() => setDelegateTarget({ id: q.id, title: q.title })}
            >
              <Text style={[s.actionBtnText, { color: BRAND.amber }]}>📤 Delegate</Text>
            </TouchableOpacity>
          </>
        )}

        {/* GP (senior): claim a plain household chore a parent flagged
            "GP Welcome" — see canGpClaimPool above. Pass sits alongside it,
            matching the Hub's QuestInvitationsSection Accept/Pass pair, but
            persisted to gp_withdrawn_ids (not local state) so it survives
            reload and flips this GP's own button to "🔄 Reconsider?" instead
            of hiding the card — it stays reconsiderable until someone
            actually claims the chore. */}
        {canGpClaimPool && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: BRAND.amber + '18', borderWidth: 1.5, borderColor: BRAND.amber + '60', flex: 2 }]}
              onPress={() => {
                console.log(`[UserAction] screen=Chores role=senior member=${activeMember?.name} tapped "${gpAlreadyPassed ? 'Reconsider?' : "I'd Love To Help"}" on "${q.title}" (id=${q.id}) → updateQuest(assignedToId) + set_gp_withdrawn [features/quests/components/QuestCard.tsx:918]`);
                Alert.alert(
                  'Help With This?',
                  `Take on "${q.title}"?`,
                  [{ text: 'Cancel', style: 'cancel' }, {
                    text: "❤️ I'd Love To Help",
                    onPress: () => {
                      // Explicit status:'in_progress' — this chore may carry
                      // a stale gp_offer_pending/gpOfferById from an earlier,
                      // unrelated GP-offer flow on the same row (live-repro'd:
                      // a chore reset to unassigned via direct DB edit kept
                      // its old status, so claiming it here landed on the
                      // parent-review Redo/Approve UI instead of this GP's
                      // own claim/submit card). Don't rely on the row's prior
                      // state being clean — set it explicitly.
                      useChoreStore.getState().updateChore(q.id, { gpOfferById: undefined } as any);
                      updateQuest(q.id, {
                        assignedToId: activeMember?.id, isPool: false, status: 'in_progress',
                      }, activeMember?.id);
                      if (myId) {
                        useChoreStore.getState().setGpWithdrawn(q.id, myId, false);
                      }
                      showToast("You're on it ✓");
                    },
                  }]
                );
              }}
            >
              <Text style={[s.actionBtnText, { color: BRAND.amber }]}>
                {gpAlreadyPassed ? '🔄 Reconsider?' : "❤️ I'd Love To Help"}
              </Text>
            </TouchableOpacity>
            {!gpAlreadyPassed && (
              <TouchableOpacity
                style={[s.actionBtn, { borderWidth: 1.5, borderColor: colors.border, backgroundColor: 'transparent', flex: 1 }]}
                onPress={() => {
                  console.log(`[UserAction] screen=Chores role=senior member=${activeMember?.name} tapped "Pass" on "${q.title}" (id=${q.id}) → setGpWithdrawn [features/quests/components/QuestCard.tsx:948]`);
                  if (myId) {
                    useChoreStore.getState().setGpWithdrawn(q.id, myId, true);
                  }
                }}
              >
                <Text style={[s.actionBtnText, { color: colors.textTertiary }]}>Pass</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* GP (senior): Done / Backout on a GP-Welcome chore they've
            claimed — see canGpDone above. Done self-completes (no approval
            gate, no coin payout); Backout releases it back to the open
            pool, same as if they'd never claimed it. */}
        {canGpDone && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { borderWidth: 1.5, borderColor: colors.danger + '60', backgroundColor: 'transparent', flex: 1 }]}
              onPress={() => {
                console.log(`[UserAction] screen=Chores role=senior member=${activeMember?.name} tapped "Backout" on "${q.title}" (id=${q.id}) [features/quests/components/QuestCard.tsx:996]`);
                Alert.alert(
                  'Give This Back?',
                  `"${q.title}" will go back to the open pool for any grandparent to pick up.`,
                  [{ text: 'Cancel', style: 'cancel' }, {
                    text: 'Backout', style: 'destructive',
                    onPress: () => {
                      console.log(`[UserAction] screen=Chores role=senior member=${activeMember?.name} confirmed "Backout" on "${q.title}" (id=${q.id}) → backoutGpWelcomeChore [features/quests/components/QuestCard.tsx:1005]`);
                      useChoreStore.getState().backoutGpWelcomeChore(q.id, myId!);
                    },
                  }]
                );
              }}
            >
              <Text style={[s.actionBtnText, { color: colors.danger }]}>Backout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.success, flex: 2 }]}
              onPress={() => {
                console.log(`[UserAction] screen=Chores role=senior member=${activeMember?.name} tapped "Done" on "${q.title}" (id=${q.id}) → completeGpWelcomeChore [features/quests/components/QuestCard.tsx:1017]`);
                useChoreStore.getState().completeGpWelcomeChore(q.id, myId!);
              }}
            >
              <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Done</Text>
            </TouchableOpacity>
          </>
        )}

        {/* GP (senior): claim a grandparent_quest errand */}
        {isSenior && q.questType === 'grandparent_quest' && isTodoCard && !q.assignedToId && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: BRAND.amber + '18', borderWidth: 1.5, borderColor: BRAND.amber + '60' }]}
            onPress={() => Alert.alert(
              'Claim Errand',
              `Take on "${q.title}"?`,
              [{ text: 'Cancel', style: 'cancel' }, {
                text: "I'll take it 👴",
                onPress: () => {
                  if (!activeMember?.id) return;
                  supabase.rpc('reassign_chore', {
                    p_chore_id: q.id, p_new_member_id: activeMember.id, p_by_member_id: activeMember.id,
                  }).then(({ error }) => {
                    if (error) { console.warn('[QuestCard] GP claim reassign_chore failed', error.message); return; }
                    showToast("You're on it ✓");
                    // Same self-claim gap as "Take It" above — the claiming
                    // GP doesn't need telling about their own action, but
                    // parents do.
                    const familyId = useChoreStore.getState().chores.find(c => c.id === q.id)?.familyId;
                    if (familyId) {
                      supabase.functions.invoke('quest-event-notifier', {
                        body: {
                          event: 'quest_claimed', questId: q.id, questTitle: q.title,
                          familyId, triggeredById: activeMember.id, assigneeId: activeMember.id,
                        },
                      }).catch((e: any) => console.warn('[QuestCard] GP claim notify failed', e?.message));
                    }
                  });
                },
              }]
            )}
          >
            <Text style={[s.actionBtnText, { color: BRAND.amber }]}>I'll take it 👴</Text>
          </TouchableOpacity>
        )}

        {/* GP: submit their claimed errand */}
        {isSenior && q.questType === 'grandparent_quest' && isTodoCard && q.assignedToId === activeMember?.id && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: BRAND.teal }]}
            onPress={() => openSubmitSheet(q)}
          >
            <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Done · Submit</Text>
          </TouchableOpacity>
        )}

        {/* "All done · paid" moved up into the collapsed header
            (bottom-right, next to the coin/due chips) — no
            longer duplicated down here in the action strip. */}

        {/* Edit is reachable via long-press on the card itself
            (CollapsibleQuestCard's onLongPress) — no separate
            button needed, one less thing competing for space. */}
      </View>
      )}{/* action strip */}
    </CollapsibleQuestCard>
    </Swipeable>
    {historyOpen && (
      <ChoreHistorySheet choreId={q.id} title={q.title} members={members} onClose={() => setHistoryOpen(false)} />
    )}
    </View>
  );
}
