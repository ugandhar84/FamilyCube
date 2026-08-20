import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated, Image, ActivityIndicator } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { fmtDateShort, fmtDateTime, parseLocalDate } from '@/lib/dates';
import { useChoreStore } from '@/store/choreStore';
import type { Quest } from '@/store/questStore';
import { I } from './icons';
import { s } from './questCardStyles';
import { CollapsibleQuestCard } from './CollapsibleQuestCard';
import { FlashBonusBadge } from './FlashBonusBadge';
import { QuestStepper } from './QuestStepper';
import { ParentSelfNoteRow } from './ParentSelfNoteRow';
import { fmt12h, timeAgo } from './questAiFallbacks';

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
  isAssignedTo, isClaiming, handleClaim, openSubmitSheet, setDeclineTarget,
  approveQuest, reassignQuest, approveParticipant, reopenParticipant,
  updateQuest, deleteQuest, setEditTarget, setDelegateTarget, setProofPhotoViewerUri,
}: Props) {
  const assignee = members.find(m => m.id === q.assignedToId);
  const isPoolCard = q.isPool && q.status === 'todo';
  const isTodoCard = (q.status === 'todo' || q.status === 'claimed') && !isPoolCard;
  const isReview   = q.status === 'pending_approval';
  const isDoneCard = q.status === 'approved' || q.status === 'done';
  const isDeclined = q.status === 'declined';
  const choreData  = useChoreStore.getState().chores.find(c => c.id === q.id);

  // RBAC checks
  const canClaim   = isKidOrTeen && isPoolCard;
  // Submit: kid/teen and it's their own quest
  const canSubmit  = isKidOrTeen && isTodoCard && !!myId && isAssignedTo(q, myId);
  // A declined chore is represented as redo_requested by the
  // chore adapter. The assignee can correct it and submit again.
  const canResubmit = isKidOrTeen && isDeclined && !!myId && isAssignedTo(q, myId);
  // Kid can refuse — teens CANNOT decline (no decline authority)
  const canKidDecline = isKid && isTodoCard && !q.isPool && !!myId && isAssignedTo(q, myId);
  // GP quest sitting at todo — the kid accepts it before it counts as started
  const canAcceptGp = isKid && !!myId && isAssignedTo(q, myId) &&
    choreData?.categoryType === 'grandparent_quest' && choreData?.status === 'todo';
  // Approve/Decline: parent or senior, quest in review
  const canApprove = isParentOrSenior && isReview;
  // Reopen: parent or senior, quest was declined
  const canReopen  = isParentOrSenior && isDeclined;
  // Full edit: unassigned (no one has claimed it yet) — all fields incl. coins
  const canEditFull       = isParent && (isPoolCard || (q.status === 'todo' && !q.assignedToId));
  // Restricted edit: quest is claimed/in-progress/pending — due date + reassign only, no coins/title
  const canEditRestricted = isParent && !isDoneCard && !isDeclined &&
    (q.status === 'in_progress' || q.status === 'pending_approval' || (q.status === 'todo' && !!q.assignedToId));
  const canEdit           = isParent && !isDoneCard && !isDeclined;
  // Delete: parent always; GP too, but only their own sponsorship
  // and only before it's done — a kid's completed/paid work isn't theirs to erase.
  const canDelete  = (isParent || (isSenior && q.questType === 'grandparent_quest' && q.sponsorUserId === myId)) && !isDoneCard;

  // Accent colour by status
  const accentColor =
    isPoolCard    ? BRAND.amber :
    isDeclined    ? colors.danger :
    isDoneCard    ? colors.success :
    isReview      ? BRAND.purple :
    q.priority === 'urgent' ? colors.danger : BRAND.purple;

  const hasBonus = q.bonusCoins > 0 && (!q.bonusExpiresAt || new Date(q.bonusExpiresAt).getTime() > now);

  // Whether the action strip has ANYTHING to render — with the
  // redundant Edit button gone (long-press covers it now), an
  // otherwise-inert card would show a bare empty divider bar
  // without this gate.
  const hasActionStripContent =
    canClaim || canAcceptGp ||
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
  const dueLabel = isOverdue    ? `⚠ ${q.dueDate ? fmtDateShort(q.dueDate) : 'Overdue'}`
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
      const [dh, dm] = q.dueTime.split(':').map(Number);
      if (!Number.isNaN(dh)) deadline.setHours(dh, dm || 0, 0, 0);
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

  const paidSuffix = q.participants.length > 1 ? ` · ${q.participants.length} paid` : q.coins > 0 ? ` · +${q.coins} paid` : '';
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
            const locked = isReview;
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
    return (
      <TouchableOpacity
        style={{ width: 72, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.danger, borderRadius: 18, marginLeft: 8, marginBottom: 10 }}
        onPress={() => Alert.alert(
          'Delete Chore',
          `Remove "${q.title}"? This cannot be undone.`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteQuest(q.id) }]
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
              {q.claimedAt && `Claimed ${new Date(q.claimedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              {q.claimedAt && (q.submittedAt || (q as any).approvedAt) ? ' → ' : ''}
              {q.submittedAt && `Submitted ${new Date(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              {q.submittedAt && (q as any).approvedAt ? ' → ' : ''}
              {(q as any).approvedAt && `Approved ${new Date((q as any).approvedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
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
                  {/* Per-kid actions for parent/senior */}
                  {isParentOrSenior && p.status === 'pending_approval' && (
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
                  {isParentOrSenior && p.status === 'declined' && (
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
                            { text: 'Send back', style: 'destructive', onPress: () => reassignQuest(q.id, '', activeMember?.id) },
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

        {/* Kid: Claim open bounty */}
        {canClaim && (
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
        {canAcceptGp && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: colors.success }]}
            onPress={() => useChoreStore.getState().startGrandparentQuest(q.id, myId ?? '')}
          >
            <Text style={[s.actionBtnText, { color: colors.textInverse }]}>🙌 I'll take it</Text>
          </TouchableOpacity>
        )}

        {/* Kid: Submit single-assign quest (multi-assign submits via participant row) */}
        {canSubmit && !canAcceptGp && q.participants.length <= 1 && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: BRAND.purple }]}
            onPress={() => openSubmitSheet(q)}
          >
            <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Submit for Review</Text>
          </TouchableOpacity>
        )}

        {/* Kid / teen: revise a parent-declined quest and send it back */}
        {canResubmit && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: BRAND.purple }]}
            onPress={() => openSubmitSheet(q)}
          >
            <Text style={[s.actionBtnText, { color: colors.textInverse }]}>↩ Revise & Resubmit</Text>
          </TouchableOpacity>
        )}

        {/* Kid: Decline / refuse an assigned quest — same label as the Hub's
            GP-quest card ("Decline") when this is that same choice */}
        {canKidDecline && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.danger }]}
            onPress={() => setDeclineTarget({ id: q.id, title: q.title, memberId: undefined })}
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

        {/* Parent/Senior view of open bounty — show claimant count vs cap */}
        {isPoolCard && isParentOrSenior && (
          <View style={[s.paidBadge, { backgroundColor: colors.warningLight, borderColor: BRAND.amber + '50' }]}>
            <Text style={[s.paidText, { color: BRAND.amber }]}>
              {q.participants.length === 0
                ? 'Waiting for a kid to claim'
                : q.maxClaimants && q.participants.length >= q.maxClaimants
                  ? `Full — ${q.participants.length}/${q.maxClaimants} claimed`
                  : `${q.participants.length} claimed${q.maxClaimants ? ` · ${q.maxClaimants - q.participants.length} spots left` : ''}`}
            </Text>
          </View>
        )}

        {/* Parent: Take It (self-assign) + Delegate on unassigned adult tasks */}
        {isParent && q.isAdultTask && isTodoCard && !q.assignedToId && (
          <>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: BRAND.purple + '18', borderWidth: 1.5, borderColor: BRAND.purple + '50', flex: 1 }]}
              onPress={() => Alert.alert(
                'Take It',
                `Assign "${q.title}" to yourself?`,
                [{ text: 'Cancel', style: 'cancel' }, {
                  text: "✋ Take It",
                  onPress: () => updateQuest(q.id, { assignedToId: activeMember?.id, isPool: false }, activeMember?.id),
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

        {/* GP (senior): claim a grandparent_quest errand */}
        {isSenior && q.questType === 'grandparent_quest' && isTodoCard && !q.assignedToId && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: BRAND.amber + '18', borderWidth: 1.5, borderColor: BRAND.amber + '60' }]}
            onPress={() => Alert.alert(
              'Claim Errand',
              `Take on "${q.title}"?`,
              [{ text: 'Cancel', style: 'cancel' }, {
                text: "I'll take it 👴",
                onPress: () => updateQuest(q.id, { assignedToId: activeMember?.id, isPool: false }, activeMember?.id),
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
    </View>
  );
}
