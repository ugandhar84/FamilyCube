/**
 * choreAdapter — Quest-compatible shim backed by choreStore.
 *
 * Drop-in replacement for `useQuestStore` so QuestsScreen, KidView, TodayView
 * can import from here instead of questStore without changing their logic.
 * questStore is retained in the codebase but no longer wired to any UI.
 */
import { useChoreStore } from './choreStore';
import type { ChoreTask, ChoreCategoryType } from './choreStore';
import type {
  Quest, QuestStatus, QuestDifficulty, QuestCategory, QuestType,
  QuestRecurrence,
} from './questStore';

// ─── ChoreTask → Quest mapping ────────────────────────────────────────────────

function choreStatusToQuestStatus(s: ChoreTask['status']): QuestStatus {
  switch (s) {
    case 'in_progress':                  return 'in_progress';
    case 'pending_approval':             return 'pending_approval';
    case 'pending_grandparent_approval': return 'pending_approval';
    case 'pending_parent_approval':      return 'todo';
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
    bonusCoins:       (c as any).bonusCoins ?? 0,
    bonusExpiresAt:   (c as any).bonusExpiresAt ?? undefined,

    assignedToId:     c.assignedToId,
    assignedToIds:    c.assignedToId ? [c.assignedToId] : [],
    isPool:           c.isPool ?? (!c.assignedToId && c.categoryType === 'bounty'),
    isMultiAssign:    false,
    maxClaimants:     1,
    preferredAssigneeId: undefined,
    participants:     c.assignedToId
      ? [{ id: `${c.id}_${c.assignedToId}`, questId: c.id, memberId: c.assignedToId, status: (choreStatusToQuestStatus(c.status) === 'done' ? 'approved' : choreStatusToQuestStatus(c.status)) as import('@/store/questStore').ParticipantStatus, photoUrls: [], createdAt: c.createdAt }]
      : [],

    isDaily:          c.recurrenceRule?.frequency === 'daily',
    recurrence,
    recurrenceDays:   [],
    templateId:       undefined,

    status:           choreStatusToQuestStatus(c.status),
    dueDate:          c.dueDate,
    dueTime:          c.dueTime,

    startedAt:        undefined,
    claimedAt:        ['in_progress','pending_approval','approved','done'].includes(c.status)
                        ? c.createdAt
                        : undefined,
    submittedAt:      c.submittedAt,
    approvedAt:       c.approvedAt,
    completedAt:      c.approvedAt,
    declinedAt:       c.declinedAt,
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

    tags:             [],
    history:          [],
    createdById:      c.createdById,
    lastModifiedById: undefined,

    // isAdultTask: derive from categoryType (parent_only_quest OR shopping) since is_private_parent col absent in DB
    // Shopping runs MUST be adult-only (kids never see grocery shopping tasks per spec)
    isAdultTask:      c.isPrivateParent || c.categoryType === 'parent_only_quest' || c.categoryType === 'shopping',
    inviteGrandparents: c.inviteGrandparents ?? false,
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
    xpReward:          q.xpReward ?? 10,
    difficulty:        q.difficulty,
    status:            'todo' as const,
    assignedToId:      q.assignedToId ?? (q.assignedToIds?.[0]),
    requiresPhotoProof: q.photoRequired ?? false,
    dueDate:           q.dueDate,
    dueTime:           q.dueTime,
    createdById:       q.createdById,
    recurrenceRule:    {
      frequency: (
        q.recurrence === 'daily'   ? 'daily' :
        q.recurrence === 'weekly'  ? 'weekly' : 'once'
      ) as 'once' | 'daily' | 'weekly',
    },
    isPrivateParent:    q.isAdultTask ?? false,
    isPool:             q.isPool ?? false,
    inviteGrandparents: q.inviteGrandparents ?? false,
    shoppingItems:      q.shoppingItems,
    shoppingStore:      q.shoppingStore,
    shoppingBudget:     q.shoppingBudget,
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

    submitQuest: (id: string, opts?: { note?: string; photoUrl?: string }) => {
      const chore = store.chores.find(c => c.id === id);
      // A GP-sponsored quest is the grandparent's to review, not the parent's —
      // submitChore always routed to pending_approval (parent review deck)
      // regardless of category, so every GP quest submission was landing in
      // front of the wrong person.
      if (chore?.categoryType === 'grandparent_quest') store.submitGrandparentQuest(id, opts);
      // A parent decline maps to redo_requested in choreStore. Route the next
      // kid/teen submission through the dedicated resubmission transition.
      else if (chore?.status === 'redo_requested') store.resubmitChore(id, opts);
      else store.submitChore(id, opts);
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

    claimQuest: (id: string, memberId: string) => {
      store.updateChore(id, { status: 'in_progress', assignedToId: memberId, isPool: false });
    },

    updateQuest: (id: string, updates: Partial<Quest>, _by?: string) => {
      const choreUpdates: Partial<ChoreTask> = {};
      if (updates.title         !== undefined) choreUpdates.title             = updates.title;
      if (updates.description   !== undefined) choreUpdates.description       = updates.description;
      if (updates.coins         !== undefined) { choreUpdates.basePoints = updates.coins; choreUpdates.coinsReward = updates.coins; }
      if (updates.dueDate       !== undefined) choreUpdates.dueDate           = updates.dueDate;
      if (updates.difficulty    !== undefined) choreUpdates.difficulty        = updates.difficulty;
      if (updates.photoRequired !== undefined) choreUpdates.requiresPhotoProof= updates.photoRequired;
      if (updates.assignedToId  !== undefined) choreUpdates.assignedToId      = updates.assignedToId;
      if ((updates as any).isPool !== undefined) choreUpdates.isPool          = (updates as any).isPool;
      if ((updates as any).status !== undefined) {
        const s = (updates as any).status as Quest['status'];
        choreUpdates.status =
          s === 'in_progress'      ? 'in_progress' :
          s === 'pending_approval' ? 'pending_approval' :
          s === 'approved'         ? 'approved' :
          s === 'declined'         ? 'redo_requested' :
          s === 'done'             ? 'approved' : 'todo';
      }
      store.updateChore(id, choreUpdates);
    },

    deleteQuest: (id: string) => {
      store.deleteChore(id);
    },

    reassignQuest: (id: string, memberId: string, _by: string) => {
      store.updateChore(id, { assignedToId: memberId });
    },

    cheerQuest: (id: string, fromMemberId: string, opts?: { coins?: number; note?: string }) => {
      store.cheerChore(id, fromMemberId, opts);
    },

    // Boot / hydration — delegate to choreStore
    loaded:          store.loaded ?? true,
    loadFromStorage: store.loadFromStorage,

    // Multi-participant stubs — chore system is single-assignee
    createParticipants: async (_questId: string, _memberIds: string[]) => {},
    approveParticipant: (_questId: string, _memberId: string, _by: string) => {},
    declineParticipant: (_questId: string, _memberId: string, _by: string, _reason?: string, _code?: string) => {},
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
      if (updates.maxClaimants   !== undefined) { /* no-op — pool managed by isPool flag */ }
      if (updates.bonusCoins     !== undefined) { /* no bonus in chore system */ }
      if (updates.difficulty     !== undefined) choreUpdates.difficulty    = updates.difficulty;
      if (updates.assignedToId   !== undefined) choreUpdates.assignedToId  = updates.assignedToId;
      if ((updates as any).isPool !== undefined) choreUpdates.isPool       = (updates as any).isPool;
      if ((updates as any).status !== undefined) {
        const s = (updates as any).status as Quest['status'];
        choreUpdates.status =
          s === 'in_progress'      ? 'in_progress' :
          s === 'pending_approval' ? 'pending_approval' :
          s === 'approved'         ? 'approved' :
          s === 'declined'         ? 'redo_requested' :
          s === 'done'             ? 'approved' : 'todo';
      }
      store.updateChore(id, choreUpdates);
    },
    addQuest:      (q: any) => store.addChore(questInputToChoreInput(q) as any),
    reassignQuest: (id: string, memberId: string, _by?: string) => {
      store.updateChore(id, { assignedToId: memberId });
    },
  };
  return shim;
};
