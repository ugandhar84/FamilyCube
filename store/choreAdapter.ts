/**
 * choreAdapter — Quest-compatible shim backed by choreStore.
 *
 * Drop-in replacement for `useQuestStore` so QuestsScreen, KidView, TodayView
 * can import from here instead of questStore without changing their logic.
 * questStore is retained in the codebase but no longer wired to any UI.
 */
import { useChoreStore } from './choreStore';
import type { ChoreTask, ChoreCategoryType } from './choreStore';
import { supabase } from '@/lib/supabase';
import type {
  Quest, QuestStatus, QuestDifficulty, QuestCategory, QuestType,
  QuestRecurrence,
} from './questStore';

// 6.1 — shared by both reassignQuest implementations below (the instance
// hook and the static .getState() shim) so a manual reassignment from
// EITHER call path actually tells someone it happened, matching every
// other quest mutation (approve/decline/submit/etc.) which already fires
// quest-event-notifier. The edge function's 'quest_reassigned' case was
// fully built (notifies new assignee + parents) but nothing ever called it.
function notifyQuestReassigned(chore: ChoreTask, prevAssigneeId: string | undefined, newAssigneeId: string, triggeredById: string) {
  supabase.functions.invoke('quest-event-notifier', {
    body: {
      event: 'quest_reassigned',
      questId: chore.id,
      questTitle: chore.title,
      familyId: chore.familyId,
      triggeredById,
      assigneeId: prevAssigneeId,
      newAssigneeId,
      coins: chore.basePoints > 0 ? chore.basePoints : chore.coinsReward,
    },
  }).catch(e => console.warn('[choreAdapter] reassignQuest notify', e?.message));
}

// ─── ChoreTask → Quest mapping ────────────────────────────────────────────────

function choreStatusToQuestStatus(s: ChoreTask['status']): QuestStatus {
  switch (s) {
    case 'in_progress':                  return 'in_progress';
    case 'pending_approval':             return 'pending_approval';
    case 'pending_grandparent_approval': return 'pending_approval';
    case 'pending_parent_approval':      return 'todo';
    // Scenario 1.6 — a GP's pending offer maps to 'pending_approval' so it
    // rides the existing pending-approval UI (QuestsScreen's Review tab,
    // etc.) without new plumbing there. The real ChoreTask status stays
    // distinct so parent-facing UI (ChoreReviewSection.tsx) can filter
    // specifically for GP offers — see gpOfferById.
    case 'gp_offer_pending':             return 'pending_approval';
    case 'approved':                     return 'approved';
    case 'auto_approved':                return 'approved';
    case 'redo_requested':               return 'declined';
    // Without these, terminal statuses fall through to 'todo' and finished
    // tasks reappear in the Household Backlog forever.
    case 'completed':                    return 'done';
    case 'declined':                     return 'cancelled';
    case 'expired':                      return 'archived';
    default:                             return 'todo';
  }
}

function categoryTypeToQuestType(ct: ChoreCategoryType): QuestType {
  switch (ct) {
    case 'citizenship':      return 'citizenship';
    case 'routine':          return 'routine';
    case 'bounty':           return 'bounty';
    case 'shopping':         return 'shopping';
    case 'grandparent_quest':return 'grandparent_quest';
    case 'parent_only_quest':return 'parent_only';
    default:                 return 'general';
  }
}

export function choreToQuest(c: ChoreTask): Quest {
  const recurrence: QuestRecurrence =
    c.recurrenceRule?.frequency === 'daily'   ? 'daily' :
    c.recurrenceRule?.frequency === 'weekly'  ? 'weekly' :
    c.recurrenceRule?.frequency === 'monthly' ? 'monthly' :
    'once';

  return {
    id:               c.id,
    title:            c.title,
    description:      c.description,
    category:         (c.category as QuestCategory) ?? 'Other',
    priority:         'medium',
    difficulty:       (c.difficulty as QuestDifficulty) ?? 'easy',
    estimatedMinutes: undefined,
    coins:            c.basePoints,
    xpReward:         c.xpReward ?? 10,
    bonusCoins:       c.bonusCoins ?? 0,
    bonusExpiresAt:   (c as any).bonusExpiresAt ?? undefined,

    assignedToId:     c.assignedToId,
    assignedToIds:    c.assignedToId ? [c.assignedToId] : [],
    isPool:           c.isPool ?? (!c.assignedToId && c.categoryType === 'bounty'),
    isMultiAssign:    false,
    // Was hardcoded to 1 — the "up to N kids" setting was saved nowhere
    // (see choreAdapter.ts's updateQuest, previously a no-op for this
    // field) so every quest read back as single-claimant regardless of
    // what was actually set. Now reads the real persisted value.
    maxClaimants:     c.maxClaimants ?? 1,
    preferredAssigneeId: undefined,
    // Multi-slot bounty (maxClaimants > 1): participants come from the
    // real bounty_claims rows (c.claims, loaded via loadBountyClaims),
    // each independently tracked. Single-claimant chore: synthesized from
    // assignedToId as before, unchanged.
    participants:     c.claims?.length
      ? c.claims.map(cl => ({
          id: cl.id, questId: c.id, memberId: cl.memberId,
          status: (cl.status === 'in_progress' ? 'in_progress' : cl.status === 'pending_approval' ? 'pending_approval' : cl.status === 'approved' ? 'approved' : 'declined') as import('@/store/questStore').ParticipantStatus,
          claimedAt: cl.claimedAt, submittedAt: cl.submittedAt, approvedAt: cl.approvedAt, declinedAt: cl.declinedAt,
          photoUrl: cl.submissionPhotoUrl, photoUrls: cl.submissionPhotoUrl ? [cl.submissionPhotoUrl] : [],
          completionNote: cl.submissionNote, coinsAwarded: cl.coinsAwarded, declineReason: cl.rejectionReason,
          createdAt: cl.createdAt,
        }))
      : c.assignedToId
        ? [{ id: `${c.id}_${c.assignedToId}`, questId: c.id, memberId: c.assignedToId, status: (choreStatusToQuestStatus(c.status) === 'done' ? 'approved' : choreStatusToQuestStatus(c.status)) as import('@/store/questStore').ParticipantStatus, photoUrls: [], createdAt: c.createdAt }]
        : [],

    isDaily:          c.recurrenceRule?.frequency === 'daily',
    recurrence,
    recurrenceDays:   [],
    templateId:       undefined,

    status:           choreStatusToQuestStatus(c.status),
    awaitingParentApproval: c.status === 'pending_parent_approval',
    dueDate:          c.dueDate,
    dueTime:          c.dueTime,

    startedAt:        undefined,
    // Every status past "just created" implies a claim happened at some
    // point — 'done' was never a real ChoreStatus value (checked against
    // the actual union), and pending_grandparent_approval/auto_approved/
    // completed were missing entirely, which silently made the stepper's
    // "Claimed" step show as not-done for any already-finished GP-sponsored
    // quest (grandparentApproveAndCheer's terminal status is 'completed',
    // not 'approved').
    claimedAt:        (['in_progress','pending_approval','pending_grandparent_approval','gp_offer_pending','approved','auto_approved','completed'] as string[]).includes(c.status)
                        ? c.createdAt
                        : undefined,
    submittedAt:      c.submittedAt,
    approvedAt:       c.approvedAt,
    completedAt:      c.approvedAt,
    declinedAt:       c.declinedAt,
    reviewedById:     c.reviewedById,
    archivedAt:       undefined,
    cancelledAt:      undefined,

    photoRequired:    c.requiresPhotoProof,
    photoUrl:         c.submissionPhotoUrl,
    photoUrls:        c.submissionPhotoUrl ? [c.submissionPhotoUrl] : [],
    videoUrl:         undefined,
    completionNote:   c.submissionNote,

    approvedById:     undefined,
    declineReason:    c.rejectionReason,
    declineReasonCode: undefined,

    linkedGroceryIds: [],
    linkedStore:      undefined,
    linkedEventId:    c.linkedEventId,

    tags:             [],
    history:          [],
    createdById:      c.createdById,
    lastModifiedById: undefined,

    // isAdultTask: derive from categoryType (parent_only_quest OR shopping) since is_private_parent col absent in DB
    // Shopping runs MUST be adult-only (kids never see grocery shopping tasks per spec)
    isAdultTask:      c.isPrivateParent || c.categoryType === 'parent_only_quest' || c.categoryType === 'shopping',
    inviteGrandparents: c.inviteGrandparents ?? false,
    gpWithdrawnIds:   c.gpWithdrawnIds,
    questType:        categoryTypeToQuestType(c.categoryType),
    assignmentMode:   c.assignedToId ? 'direct' : 'pull',
    bounceCount:      0,
    isLocked:         false,
    pushbacks:        [],
    autoApproveAt:    c.approvalWindowExpiresAt,
    appreciationSent: false,
    snoozedUntil:     undefined,
    cheers:           c.cheers ?? [],
    teamGroupId:      c.teamGroupId,
    sponsorUserId:    c.sponsorUserId,
    alertCall:            c.alertCall ?? false,
    alertCallLeadMinutes: c.alertCallLeadMinutes ?? 10,
    rewardPendingReview:  c.rewardPendingReview ?? false,
  };
}

// ─── Quest-shaped addChore input ──────────────────────────────────────────────

function questInputToChoreInput(q: Partial<Quest> & Record<string, any>) {
  return {
    title:             q.title ?? '',
    description:       q.description,
    categoryType:      (
      q.questType === 'citizenship'       ? 'citizenship' :
      q.questType === 'routine'           ? 'routine' :
      q.questType === 'bounty'            ? 'bounty' :
      q.questType === 'shopping'          ? 'shopping' :
      q.questType === 'grandparent_quest' ? 'grandparent_quest' :
      q.questType === 'parent_only'       ? 'parent_only_quest' : 'routine'
    ) as ChoreCategoryType,
    category:          q.category ?? 'Other',
    basePoints:        q.coins ?? 20,
    coinsReward:       q.coins ?? 20,
    // Must reach addChore's creation-time payload, not just a follow-up
    // updateQuest call — addChore's teenRewardCoSignThreshold check reads
    // this field at creation time (see store/choreStore.ts), so a bonus
    // applied only afterward is invisible to that check and lets a teen's
    // real total reward (base + bonus) silently exceed the co-sign
    // threshold without ever flagging rewardPendingReview.
    bonusCoins:        q.bonusCoins ?? 0,
    xpReward:          q.xpReward ?? 10,
    difficulty:        q.difficulty,
    // A grandparent_quest must clear the parent's safety-review gate before
    // any kid can see it — same rule createGrandparentQuest enforces via its
    // own dedicated insert. Without this, "Sponsor a Quest" (which reuses
    // this same generic form) published straight to kids with no parent in
    // the loop at all, which is the opposite of what that review status is
    // for.
    status:            (q.questType === 'grandparent_quest' ? 'pending_parent_approval' : 'todo') as any,
    assignedToId:      q.assignedToId ?? (q.assignedToIds?.[0]),
    requiresPhotoProof: q.photoRequired ?? false,
    dueDate:           q.dueDate,
    dueTime:           q.dueTime,
    createdById:       q.createdById,
    // A grandparent_quest created through the normal Add Quest form (as
    // opposed to the separate createGrandparentQuest flow) never set
    // sponsorUserId — the field both SeniorView's own review queue and the
    // parent-queue's exclusion filter key off of to know which grandparent
    // must approve it. The creator IS the sponsor for this quest type.
    sponsorUserId:     q.questType === 'grandparent_quest' ? q.createdById : (q as any).sponsorUserId,
    recurrenceRule:    {
      frequency: (
        q.recurrence === 'daily'   ? 'daily' :
        q.recurrence === 'weekly'  ? 'weekly' :
        q.recurrence === 'monthly' ? 'monthly' : 'once'
      ) as 'once' | 'daily' | 'weekly' | 'monthly',
      // Which weekdays a 'weekly' chore actually recurs on (0=Sun..6=Sat) —
      // only meaningful alongside frequency:'weekly'; nextDueDate() in
      // choreStore.ts falls back to a flat +7 days when this is absent.
      days: q.recurrence === 'weekly' && (q as any).recurrenceDays?.length ? (q as any).recurrenceDays : undefined,
      // Which day-of-month a 'monthly' chore recurs on (1-28, or 31 as
      // "last day of the month") — only meaningful alongside
      // frequency:'monthly'; absent falls back to whatever day-of-month it
      // was first approved on, same as before this field existed.
      dayOfMonth: q.recurrence === 'monthly' && (q as any).recurrenceDayOfMonth ? (q as any).recurrenceDayOfMonth : undefined,
    },
    isPrivateParent:    q.isAdultTask ?? false,
    isPool:             q.isPool ?? false,
    inviteGrandparents: q.inviteGrandparents ?? false,
    shoppingItems:      q.shoppingItems,
    shoppingStore:      q.shoppingStore,
    shoppingBudget:     q.shoppingBudget,
    alertCall:            (q as any).alertCall,
    alertCallLeadMinutes: (q as any).alertCallLeadMinutes,
    rewardPendingReview:  (q as any).rewardPendingReview,
    linkedEventId:        q.linkedEventId,
  };
}

// ─── The hook — drop-in for useQuestStore ────────────────────────────────────

export function useQuestStore() {
  const store = useChoreStore();

  return {
    // State
    quests: store.chores.map(choreToQuest),

    // Mutations
    addQuest: (q: Partial<Quest> & Record<string, any>) => {
      return store.addChore(questInputToChoreInput(q as any) as any);
    },

    // Returns false when choreStore.submitChore rejected it (recurring chore
    // not due yet) — the GP/redo paths always succeed if reached.
    // memberId is optional and NEW — only needed for a multi-slot bounty
    // (maxClaimants > 1), where submitChore's single assignedToId path
    // doesn't apply and the caller must say WHICH kid's claim this submit
    // is for. Every existing call site omits it and is unaffected.
    submitQuest: (id: string, opts?: { note?: string; photoUrl?: string }, memberId?: string): boolean => {
      const chore = store.chores.find(c => c.id === id);
      if (chore?.maxClaimants && chore.maxClaimants > 1) {
        if (!memberId) { console.warn('[choreAdapter] submitQuest on a multi-slot bounty requires memberId'); return false; }
        store.submitBountyClaim(id, memberId, opts);
        return true;
      }
      // A GP-sponsored quest is the grandparent's to review, not the parent's —
      // submitChore always routed to pending_approval (parent review deck)
      // regardless of category, so every GP quest submission was landing in
      // front of the wrong person.
      if (chore?.categoryType === 'grandparent_quest') { store.submitGrandparentQuest(id, opts); return true; }
      // A parent decline maps to redo_requested in choreStore. Route the next
      // kid/teen submission through the dedicated resubmission transition.
      else if (chore?.status === 'redo_requested') { store.resubmitChore(id, opts); return true; }
      else return store.submitChore(id, opts);
    },

    approveQuest: (id: string, approverId: string) => {
      store.approveChore(id, approverId);
    },

    declineQuest: (id: string, _by: string, reason: string, _reasonCode?: string) => {
      store.requestRedo(id, _by, reason);
    },

    reopenQuest: (id: string, _by: string) => {
      store.updateChore(id, { status: 'todo', redoCount: 0, submittedAt: undefined, rejectionReason: undefined });
    },

    claimQuest: (id: string, memberId: string, onLost?: (reason: 'claimed' | 'deleted') => void) => {
      // Routed through claimPoolQuest (not a plain updateChore) so this,
      // the only reachable "Claim" action in the live app (KidView,
      // TeenView, QuestsScreen), actually gets the compare-and-swap
      // first-write-wins protection spec scenarios 1.1/3.1 require. The
      // previous plain updateChore() had no WHERE guard, so two kids
      // claiming the same pool quest within the same round-trip would
      // both "win" locally with Postgres silently picking a last-writer —
      // claimBounty already had this protection but is hard-gated to
      // categoryType === 'bounty' and unreachable from any live screen.
      // onLost — scenarios 3.1/3.4: lets the caller show "someone just
      // claimed this" vs. "this was just removed by a parent" instead of a
      // silent disappearance or a generic error.
      store.claimPoolQuest(id, memberId, onLost);
    },

    updateQuest: (id: string, updates: Partial<Quest>, _by?: string) => {
      const choreUpdates: Partial<ChoreTask> = {};
      if (updates.title         !== undefined) choreUpdates.title             = updates.title;
      if (updates.description   !== undefined) choreUpdates.description       = updates.description;
      if (updates.coins         !== undefined) { choreUpdates.basePoints = updates.coins; choreUpdates.coinsReward = updates.coins; }
      if (updates.dueDate       !== undefined) choreUpdates.dueDate           = updates.dueDate;
      if (updates.dueTime       !== undefined) choreUpdates.dueTime           = updates.dueTime;
      if (updates.alertCall            !== undefined) choreUpdates.alertCall            = updates.alertCall;
      if (updates.alertCallLeadMinutes !== undefined) choreUpdates.alertCallLeadMinutes = updates.alertCallLeadMinutes;
      // Only 'once'|'daily'|'weekly'|'monthly' map onto RecurrenceRule —
      // 'weekdays'/'biweekly'/'custom' aren't offered by any recurrence
      // picker UI today, so there's nothing to translate them from.
      if (updates.recurrence && ['once', 'daily', 'weekly', 'monthly'].includes(updates.recurrence)) {
        choreUpdates.recurrenceRule = { frequency: updates.recurrence as 'once' | 'daily' | 'weekly' | 'monthly' };
      }
      if (updates.difficulty    !== undefined) choreUpdates.difficulty        = updates.difficulty;
      if (updates.photoRequired !== undefined) choreUpdates.requiresPhotoProof= updates.photoRequired;
      if (updates.assignedToId  !== undefined) choreUpdates.assignedToId      = updates.assignedToId;
      if (updates.linkedEventId !== undefined) choreUpdates.linkedEventId     = updates.linkedEventId;
      if ((updates as any).isPool !== undefined) choreUpdates.isPool          = (updates as any).isPool;
      // isAdultTask is derived from categoryType on read (choreToQuest), so
      // the edit form's toggle has to write back to categoryType/
      // isPrivateParent here or it silently resets on the next save —
      // otherwise re-opening the edit form after any save shows the toggle
      // off even though it was on.
      if ((updates as any).isAdultTask !== undefined) {
        const adult = (updates as any).isAdultTask as boolean;
        choreUpdates.isPrivateParent = adult;
        if (adult) {
          if (choreUpdates.categoryType !== 'shopping') choreUpdates.categoryType = 'parent_only_quest';
        } else if (choreUpdates.categoryType === 'parent_only_quest') {
          // Turning the toggle off has to move the chore out of the
          // adult-only category too — isAdultTask reads (isPrivateParent ||
          // categoryType === 'parent_only_quest' || ...), so leaving
          // categoryType alone here would keep it reading as an adult task.
          choreUpdates.categoryType = 'routine';
        }
      }
      if ((updates as any).status !== undefined) {
        const s = (updates as any).status as Quest['status'];
        choreUpdates.status =
          s === 'in_progress'      ? 'in_progress' :
          s === 'pending_approval' ? 'pending_approval' :
          s === 'approved'         ? 'approved' :
          s === 'declined'         ? 'redo_requested' :
          s === 'done'             ? 'approved' : 'todo';
      }
      if ((updates as any).inviteGrandparents !== undefined) choreUpdates.inviteGrandparents = (updates as any).inviteGrandparents;
      if ((updates as any).gpWithdrawnIds     !== undefined) choreUpdates.gpWithdrawnIds     = (updates as any).gpWithdrawnIds;
      store.updateChore(id, choreUpdates);
    },

    deleteQuest: (id: string) => {
      store.deleteChore(id);
    },

    reassignQuest: (id: string, memberId: string, _by: string) => {
      // '' means "send back to pool / unassign" (e.g. QuestCard's "Can't do
      // this" flows) -- updateChore's DB patch only nulls a field on `??`,
      // and '' is not nullish, so passing it through as-is used to write
      // assigned_to_id: '' to Postgres instead of NULL, leaving the chore
      // looking assigned-to-nobody-in-particular rather than truly open.
      if (!memberId) {
        const chore = store.chores.find(c => c.id === id);
        if (chore?.teamGroupId && chore?.targetChildIds?.length) {
          // Team-clone chore — releasing to the family-wide pool would
          // expose this slice to kids never targeted, losing the
          // shortlist framing (mirrors declineGrandparentQuest's own
          // targetChildIds branch). Decline this clone only; sibling
          // clones are separate rows, untouched either way.
          store.updateChore(id, { status: 'declined', assignedToId: undefined });
          return;
        }
      }
      const chore = store.chores.find(c => c.id === id);
      const prevAssigneeId = chore?.assignedToId;
      // Live QA audit found reassigning a chore that was mid-review
      // (status='pending_approval', with the previous assignee's
      // submission note/photo still attached) only ever patched
      // assignedToId/isPool — leaving the OLD assignee's submission data
      // and pending_approval status attributed to the NEW assignee. Only
      // masked because the next real claim/submit happened to overwrite
      // those same fields; a parent's review queue read in between would
      // show one kid's abandoned attempt as if it belonged to whoever the
      // chore was just reassigned to. A genuine reassignment (not the
      // pool-release/decline path above) resets the chore to a clean
      // 'todo' state, same fields resetDueRecurringChores already clears
      // for the same "start fresh" reason.
      const wasMidReview = chore?.status === 'pending_approval' || chore?.status === 'redo_requested';
      // Live-DB QA (kid-role sweep) found the more common case — a kid
      // backing out of an 'in_progress' claim, not mid-review — never got
      // status reset at all: only wasMidReview reset it, so a plain
      // back-out left the chore at is_pool=true, status='in_progress',
      // assignedToId=null — a combination every pool filter across
      // QuestsScreen/KidView requires status==='todo' for, so the chore
      // became invisible everywhere, for every role, simultaneously. A
      // genuine pool-release (!memberId) always needs status:'todo',
      // regardless of what status it's releasing FROM.
      const isPoolRelease = !memberId;
      store.updateChore(id, {
        assignedToId: memberId || undefined,
        isPool: memberId ? undefined : true,
        ...(isPoolRelease ? { status: 'todo' as const } : {}),
        ...(wasMidReview ? {
          submittedAt: undefined,
          submissionPhotoUrl: undefined,
          submissionNote: undefined,
          rejectionReason: undefined,
        } : {}),
      });
      // 6.1 — reassigning a quest silently moved it to a new kid with zero
      // notification to either the new assignee or the parents who'd expect
      // to know it happened. quest-event-notifier already has a fully-built
      // 'quest_reassigned' case (notifies new assignee + parents) that
      // nothing was ever calling. Skip when memberId is '' — that's the
      // pool-release/decline path above, not a real reassignment.
      if (memberId && chore?.familyId) {
        notifyQuestReassigned(chore, prevAssigneeId, memberId, _by);
      }
    },

    cheerQuest: (id: string, fromMemberId: string, opts?: { coins?: number; note?: string }) => {
      store.cheerChore(id, fromMemberId, opts);
    },

    // Boot / hydration — delegate to choreStore
    loaded:          store.loaded ?? true,
    loadFromStorage: store.loadFromStorage,

    // A multi-select in AddQuestModal (assignIds.length > 1) creates the
    // quest itself with NO assignee at all (assignedToId: undefined,
    // isMulti gates it that way deliberately) and relied entirely on this
    // function to actually assign anyone — it was a no-op stub, so multi-
    // assign silently created one unassigned chore and nothing else; every
    // selected kid except whichever the UI happened to still call out saw
    // nothing. Mirrors approveGrandparentQuestAsParent's proven team-clone
    // pattern: the ORIGINAL chore (questId) is assigned to the first member
    // directly; every other selected member gets a full-value clone linked
    // by teamGroupId, so one kid declining/finishing never affects another's
    // payout — same rule the GP bounty path already established.
    createParticipants: async (questId: string, memberIds: string[]) => {
      if (memberIds.length === 0) return;
      const chore = store.chores.find(c => c.id === questId);
      if (!chore) return;
      const [first, ...rest] = memberIds;
      store.updateChore(questId, { assignedToId: first, status: 'todo' });
      if (rest.length === 0) return;
      const teamGroup = `team_${questId}`;
      store.updateChore(questId, { teamGroupId: teamGroup, targetChildIds: memberIds } as any);
      for (const memberId of rest) {
        store.addChore({
          ...chore,
          assignedToId: memberId,
          status: 'todo',
          isPool: false,
          teamGroupId: teamGroup,
          targetChildIds: memberIds,
        } as any);
      }
    },
    // Were dead no-op stubs — a multi-slot bounty's per-kid Approve/Decline
    // (rendered by QuestCard whenever participants.length > 1, which is now
    // real data instead of always a single synthesized entry) had buttons
    // with nothing behind them. Now routed to the real bounty_claims-backed
    // actions.
    approveParticipant: (questId: string, memberId: string, by: string) => {
      store.approveBountyClaim(questId, memberId, by);
    },
    declineParticipant: (questId: string, memberId: string, by: string, reason?: string, _code?: string) => {
      store.declineBountyClaim(questId, memberId, by, reason);
    },
    // No re-open concept for a declined bounty claim yet — a kid can
    // re-claim the slot fresh (if one is still open) rather than resuming
    // a declined attempt. Left as a no-op intentionally, unlike the other
    // two which were unintentional dead stubs.
    reopenParticipant:  (_questId: string, _memberId: string, _by: string) => {},
  };
}

// Static .getState() for imperative calls (useQuestStore.getState().updateQuest etc.)
useQuestStore.getState = () => {
  const store = useChoreStore.getState();
  const shim = {
    quests: store.chores.map(choreToQuest),
    updateQuest: (id: string, updates: Partial<Quest>, _by?: string) => {
      const choreUpdates: Partial<ChoreTask> = {};
      if (updates.coins          !== undefined) { choreUpdates.basePoints = updates.coins; choreUpdates.coinsReward = updates.coins; }
      // Was a no-op — "up to N kids" already had a full built UI
      // (AddQuestAssignSection's picker, QuestCard's "Full — X/Y claimed"
      // copy) but the value was never actually persisted anywhere, so
      // every multi-slot bounty setting silently did nothing and every
      // pool chore behaved as first-come-single-claimant regardless of
      // what the parent picked. Now wired through to chore_tasks.max_claimants.
      if (updates.maxClaimants   !== undefined) choreUpdates.maxClaimants  = updates.maxClaimants;
      if (updates.bonusCoins     !== undefined) choreUpdates.bonusCoins    = updates.bonusCoins;
      if (updates.difficulty     !== undefined) choreUpdates.difficulty    = updates.difficulty;
      if (updates.dueDate        !== undefined) choreUpdates.dueDate       = updates.dueDate;
      if (updates.dueTime        !== undefined) choreUpdates.dueTime       = updates.dueTime;
      if (updates.alertCall            !== undefined) choreUpdates.alertCall            = updates.alertCall;
      if (updates.alertCallLeadMinutes !== undefined) choreUpdates.alertCallLeadMinutes = updates.alertCallLeadMinutes;
      if (updates.recurrence && ['once', 'daily', 'weekly', 'monthly'].includes(updates.recurrence)) {
        choreUpdates.recurrenceRule = { frequency: updates.recurrence as 'once' | 'daily' | 'weekly' | 'monthly' };
      }
      if (updates.assignedToId   !== undefined) choreUpdates.assignedToId  = updates.assignedToId;
      if ((updates as any).isPool !== undefined) choreUpdates.isPool       = (updates as any).isPool;
      if ((updates as any).isAdultTask !== undefined) {
        const adult = (updates as any).isAdultTask as boolean;
        choreUpdates.isPrivateParent = adult;
        if (adult) {
          if (choreUpdates.categoryType !== 'shopping') choreUpdates.categoryType = 'parent_only_quest';
        } else if (choreUpdates.categoryType === 'parent_only_quest') {
          // Turning the toggle off has to move the chore out of the
          // adult-only category too — isAdultTask reads (isPrivateParent ||
          // categoryType === 'parent_only_quest' || ...), so leaving
          // categoryType alone here would keep it reading as an adult task.
          choreUpdates.categoryType = 'routine';
        }
      }
      if ((updates as any).status !== undefined) {
        const s = (updates as any).status as Quest['status'];
        choreUpdates.status =
          s === 'in_progress'      ? 'in_progress' :
          s === 'pending_approval' ? 'pending_approval' :
          s === 'approved'         ? 'approved' :
          s === 'declined'         ? 'redo_requested' :
          s === 'done'             ? 'approved' : 'todo';
      }
      if ((updates as any).inviteGrandparents !== undefined) choreUpdates.inviteGrandparents = (updates as any).inviteGrandparents;
      if ((updates as any).gpWithdrawnIds     !== undefined) choreUpdates.gpWithdrawnIds     = (updates as any).gpWithdrawnIds;
      store.updateChore(id, choreUpdates);
    },
    addQuest:      (q: any) => store.addChore(questInputToChoreInput(q) as any),
    reassignQuest: (id: string, memberId: string, _by?: string) => {
      // See the instance-hook reassignQuest above for why '' must map to
      // undefined/pool rather than being written through as an empty string,
      // and why a team-clone chore declines-in-place instead of releasing
      // to the family-wide pool.
      if (!memberId) {
        const chore = store.chores.find(c => c.id === id);
        if (chore?.teamGroupId && chore?.targetChildIds?.length) {
          store.updateChore(id, { status: 'declined', assignedToId: undefined });
          return;
        }
      }
      const chore = store.chores.find(c => c.id === id);
      const prevAssigneeId = chore?.assignedToId;
      // See the instance-hook reassignQuest above for why a mid-review
      // reassignment must also reset status/submission fields to a clean
      // 'todo' state, not just move assignedToId — and why any genuine
      // pool-release (!memberId) needs status:'todo' unconditionally, not
      // only when wasMidReview.
      const wasMidReview = chore?.status === 'pending_approval' || chore?.status === 'redo_requested';
      const isPoolRelease = !memberId;
      store.updateChore(id, {
        assignedToId: memberId || undefined,
        isPool: memberId ? undefined : true,
        ...(isPoolRelease ? { status: 'todo' as const } : {}),
        ...(wasMidReview ? {
          submittedAt: undefined,
          submissionPhotoUrl: undefined,
          submissionNote: undefined,
          rejectionReason: undefined,
        } : {}),
      });
      if (memberId && chore?.familyId) {
        notifyQuestReassigned(chore, prevAssigneeId, memberId, _by ?? '');
      }
    },
  };
  return shim;
};
