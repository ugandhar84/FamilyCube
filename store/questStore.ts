import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// ─── Domain types ────────────────────────────────────────────────────────────

export type QuestStatus    = 'todo' | 'claimed' | 'in_progress' | 'pending_approval' | 'approved' | 'done' | 'declined' | 'archived' | 'cancelled';
export type QuestCategory  = 'Kitchen' | 'Room' | 'Yard' | 'School' | 'Pet' | 'Living Room' | 'Garage' | 'Bathroom' | 'Laundry' | 'Errand' | 'Tech' | 'Finance' | 'Health' | 'Garden' | 'Car' | 'Shopping' | 'Cooking' | 'Social' | 'Creative' | 'Other';
export type QuestRecurrence = 'once' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type QuestPriority   = 'low' | 'medium' | 'high' | 'urgent';
export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'hero';

export interface QuestHistoryEntry {
  at:      string;
  action:  'created' | 'assigned' | 'claimed' | 'submitted' | 'approved' | 'declined' | 'reassigned' | 'reopened' | 'cancelled' | 'archived';
  by?:     string;
  note?:   string;
}

export interface Quest {
  id:               string;
  title:            string;
  description?:     string;
  instructions?:    string;
  category:         QuestCategory;
  priority:         QuestPriority;
  difficulty:       QuestDifficulty;
  estimatedMinutes?: number;
  coins:            number;
  xpReward:         number;
  bonusCoins:       number;
  bonusExpiresAt?:  string;

  assignedToId?:    string;
  assignedToIds:    string[];
  isPool:           boolean;
  preferredAssigneeId?: string;

  isDaily:          boolean;
  recurrence:       QuestRecurrence;
  recurrenceDays:   number[];
  templateId?:      string;

  status:           QuestStatus;
  dueDate?:         string;
  dueTime?:         string;

  startedAt?:       string;
  claimedAt?:       string;
  submittedAt?:     string;
  approvedAt?:      string;
  completedAt?:     string;
  declinedAt?:      string;
  archivedAt?:      string;
  cancelledAt?:     string;

  photoRequired:    boolean;
  photoUrl?:        string;
  photoUrls:        string[];
  videoUrl?:        string;
  completionNote?:  string;

  approvedById?:    string;
  declineReason?:   string;
  declineReasonCode?: string;

  linkedGroceryIds: string[];
  linkedStore?:     string;

  tags:             string[];
  history:          QuestHistoryEntry[];
  createdById?:     string;
  lastModifiedById?: string;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface QuestState {
  quests:  Quest[];
  loaded:  boolean;

  loadFromStorage:  () => Promise<void>;
  syncFromDB:       () => Promise<void>;

  addQuest:         (q: Omit<Quest, 'id' | 'createdAt' | 'history' | 'tags' | 'assignedToIds' | 'photoUrls' | 'linkedGroceryIds' | 'recurrenceDays' | 'bonusCoins' | 'difficulty'> & Partial<Pick<Quest, 'tags' | 'difficulty'>>) => Quest;
  updateQuest:      (id: string, updates: Partial<Omit<Quest, 'id' | 'history'>>, by?: string) => void;
  deleteQuest:      (id: string) => void;

  claimQuest:       (id: string, memberId: string) => void;
  submitQuest:      (id: string, opts?: { photoUrl?: string; photoUrls?: string[]; note?: string }) => void;
  approveQuest:     (id: string, approverId: string, note?: string) => void;
  declineQuest:     (id: string, approverId: string, reason?: string, reasonCode?: string) => void;
  reassignQuest:    (id: string, memberId: string | undefined, by?: string) => void;
  reopenQuest:      (id: string, by?: string) => void;
  cancelQuest:      (id: string, by?: string) => void;
  archiveDoneQuests: () => void;

  duplicateQuest:   (id: string) => Quest | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function histEntry(action: QuestHistoryEntry['action'], by?: string, note?: string): QuestHistoryEntry {
  return { at: new Date().toISOString(), action, ...(by ? { by } : {}), ...(note ? { note } : {}) };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const KEY  = '@familycube_quests_v3';
const save = (quests: Quest[]) => AsyncStorage.setItem(KEY, JSON.stringify(quests));

// ─── DB helpers ───────────────────────────────────────────────────────────────

function dbUpdate(id: string, patch: Record<string, unknown>) {
  supabase.from('quests').update(patch).eq('id', id).then(({ error }) => {
    if (error) console.warn('[questStore] DB update failed', id, error.message);
  });
}

// Award coins + XP to a member when a quest is approved.
// Fires-and-forgets; UI already shows optimistic coins via familyStore.
function awardMemberCoins(memberId: string, coins: number, xp: number) {
  if (!memberId || coins <= 0) return;
  supabase.rpc('award_coins', { member_id: memberId, coins_delta: coins, xp_delta: xp })
    .then(({ error }) => {
      if (error) console.warn('[questStore] award_coins RPC failed', error.message);
    });
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useQuestStore = create<QuestState>((set, get) => ({
  quests: [],
  loaded: false,

  loadFromStorage: async () => {
    // First load from cache so UI shows instantly, then sync from DB
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const cached = raw ? (JSON.parse(raw) as Quest[]) : null;
      if (cached && cached.length > 0) {
        set({ quests: cached, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
    // Always sync from DB on load — DB is source of truth
    get().syncFromDB();
  },

  syncFromDB: async () => {
    try {
      const { data, error } = await supabase
        .from('quests')
        .select('*')
        .is('deleted_at', null)
        .not('status', 'eq', 'archived')
        .order('created_at', { ascending: false });
      if (error || !data) return;
      const quests = data.map(fromRow);
      set({ quests, loaded: true });
      save(quests);
    } catch (e) {
      console.warn('[questStore] syncFromDB failed', e);
    }
  },

  addQuest: (q) => {
    const quest: Quest = {
      ...q,
      id:               'q' + Date.now(),
      difficulty:       q.difficulty ?? 'easy',
      tags:             (q as any).tags ?? [],
      assignedToIds:    [],
      photoUrls:        [],
      linkedGroceryIds: [],
      recurrenceDays:   [],
      bonusCoins:       0,
      createdAt:        new Date().toISOString(),
      isPool:           q.isPool ?? !q.assignedToId,
      history:          [
        histEntry('created', q.createdById),
        ...(q.assignedToId ? [histEntry('assigned', q.createdById)] : []),
      ],
    } as Quest & { createdAt: string };
    const next = [quest, ...get().quests];
    set({ quests: next }); save(next);
    supabase.from('quests').insert([toRow(quest)]).then(({ error }) => {
      if (error) console.warn('[questStore] insert failed', error.message);
    });
    return quest;
  },

  updateQuest: (id, updates, by) => {
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      const hist = by ? [...q.history, histEntry('assigned', by)] : q.history;
      return { ...q, ...updates, history: hist };
    });
    set({ quests: next }); save(next);
    const updated = next.find(q => q.id === id);
    if (updated) {
      dbUpdate(id, { ...toRow(updated), last_modified_by_id: by ?? null });
    }
  },

  deleteQuest: (id) => {
    const next = get().quests.filter(q => q.id !== id);
    set({ quests: next }); save(next);
    // Soft-delete: keep row in DB, mark deleted_at
    dbUpdate(id, { deleted_at: new Date().toISOString() });
  },

  claimQuest: (id, memberId) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      // Pool quests lock to the first claimer — no one else can claim
      if (q.isPool && q.status !== 'todo') return q;
      return {
        ...q,
        status:       'claimed' as QuestStatus,
        assignedToId: memberId,
        isPool:       false,
        claimedAt:    now,
        history:      [...q.history, histEntry('claimed', memberId)],
      };
    });
    set({ quests: next }); save(next);
    dbUpdate(id, {
      status:         'claimed',
      assigned_to_id: memberId,
      is_pool:        false,
      claimed_at:     now,
      history:        (next.find(q => q.id === id)?.history ?? []),
    });
  },

  submitQuest: (id, opts = {}) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      // Guard: only the assignee can submit
      return {
        ...q,
        status:          'pending_approval' as QuestStatus,
        submittedAt:     now,
        photoUrl:        opts.photoUrl ?? q.photoUrl,
        photoUrls:       opts.photoUrls ?? q.photoUrls,
        completionNote:  opts.note ?? q.completionNote,
        history:         [...q.history, histEntry('submitted', q.assignedToId)],
      };
    });
    set({ quests: next }); save(next);
    const q = next.find(x => x.id === id);
    if (!q) return;
    dbUpdate(id, {
      status:           'pending_approval',
      submitted_at:     now,
      photo_url:        q.photoUrl ?? null,
      photo_urls:       q.photoUrls,
      completion_note:  q.completionNote ?? null,
      history:          q.history,
    });
  },

  approveQuest: (id, approverId, note) => {
    const now = new Date().toISOString();
    const quest = get().quests.find(q => q.id === id);
    if (!quest) return;

    const updated: Quest = {
      ...quest,
      status:       'done' as QuestStatus,
      completedAt:  now,
      approvedAt:   now,
      approvedById: approverId,
      history:      [...quest.history, histEntry('approved', approverId, note)],
    };
    const next = get().quests.map(q => q.id === id ? updated : q);
    set({ quests: next }); save(next);

    dbUpdate(id, {
      status:          'done',
      completed_at:    now,
      approved_at:     now,
      approved_by_id:  approverId,
      history:         updated.history,
    });

    // Award coins + XP to the assignee
    if (quest.assignedToId) {
      const totalCoins = quest.coins + quest.bonusCoins;
      awardMemberCoins(quest.assignedToId, totalCoins, quest.xpReward);
    }
  },

  declineQuest: (id, approverId, reason, reasonCode) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return {
        ...q,
        status:           'declined' as QuestStatus,
        declinedAt:       now,
        declineReason:    reason,
        declineReasonCode: reasonCode,
        approvedById:     approverId,
        history:          [...q.history, histEntry('declined', approverId, reason)],
      };
    });
    set({ quests: next }); save(next);
    const q = next.find(x => x.id === id);
    if (!q) return;
    dbUpdate(id, {
      status:              'declined',
      declined_at:         now,
      decline_reason:      reason ?? null,
      decline_reason_code: reasonCode ?? null,
      approved_by_id:      approverId,
      history:             q.history,
    });
  },

  reassignQuest: (id, memberId, by) => {
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return {
        ...q,
        assignedToId:  memberId,
        isPool:        !memberId,
        status:        'todo' as QuestStatus,
        claimedAt:     undefined,
        submittedAt:   undefined,
        history:       [...q.history, histEntry('reassigned', by)],
      };
    });
    set({ quests: next }); save(next);
    dbUpdate(id, {
      assigned_to_id:    memberId ?? null,
      is_pool:           !memberId,
      status:            'todo',
      claimed_at:        null,
      submitted_at:      null,
      history:           (next.find(q => q.id === id)?.history ?? []),
      last_modified_by_id: by ?? null,
    });
  },

  reopenQuest: (id, by) => {
    // Parent gives kid another attempt after decline; status → claimed
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return {
        ...q,
        status:       'claimed' as QuestStatus,
        submittedAt:  undefined,
        declinedAt:   undefined,
        declineReason: undefined,
        declineReasonCode: undefined,
        history:      [...q.history, histEntry('reopened', by)],
      };
    });
    set({ quests: next }); save(next);
    dbUpdate(id, {
      status:              'claimed',
      submitted_at:        null,
      declined_at:         null,
      decline_reason:      null,
      decline_reason_code: null,
      history:             (next.find(q => q.id === id)?.history ?? []),
      last_modified_by_id: by ?? null,
    });
  },

  cancelQuest: (id, by) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return {
        ...q,
        status:      'cancelled' as QuestStatus,
        cancelledAt: now,
        history:     [...q.history, histEntry('cancelled', by)],
      };
    });
    set({ quests: next }); save(next);
    dbUpdate(id, {
      status:              'cancelled',
      cancelled_at:        now,
      history:             (next.find(q => q.id === id)?.history ?? []),
      last_modified_by_id: by ?? null,
    });
  },

  archiveDoneQuests: () => {
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const toArchive = get().quests.filter(
      q => q.status === 'done' && (q.completedAt ?? '') < cutoff
    );
    const next = get().quests.map(q =>
      toArchive.find(a => a.id === q.id)
        ? { ...q, status: 'archived' as QuestStatus, archivedAt: now }
        : q
    );
    set({ quests: next.filter(q => q.status !== 'archived') }); save(next.filter(q => q.status !== 'archived'));
    // Mark archived in DB
    toArchive.forEach(q => dbUpdate(q.id, { status: 'archived', archived_at: now }));
  },

  duplicateQuest: (id) => {
    const src = get().quests.find(q => q.id === id);
    if (!src) return null;
    const duplicate: Quest = {
      ...src,
      id:              'q' + Date.now(),
      status:          'todo',
      claimedAt:       undefined,
      submittedAt:     undefined,
      completedAt:     undefined,
      approvedAt:      undefined,
      declinedAt:      undefined,
      cancelledAt:     undefined,
      archivedAt:      undefined,
      startedAt:       undefined,
      photoUrl:        undefined,
      photoUrls:       [],
      videoUrl:        undefined,
      completionNote:  undefined,
      approvedById:    undefined,
      declineReason:   undefined,
      declineReasonCode: undefined,
      history:         [histEntry('created', src.createdById)],
    };
    (duplicate as any).createdAt = new Date().toISOString();
    const next = [duplicate, ...get().quests];
    set({ quests: next }); save(next);
    supabase.from('quests').insert([toRow(duplicate)]).then(() => {});
    return duplicate;
  },
}));

// ─── DB row → Quest ───────────────────────────────────────────────────────────

function fromRow(row: any): Quest {
  return {
    id:               String(row.id),
    title:            row.title,
    description:      row.description ?? undefined,
    instructions:     row.instructions ?? undefined,
    category:         (row.category as QuestCategory) ?? 'Other',
    priority:         (row.priority as QuestPriority) ?? 'medium',
    difficulty:       (row.difficulty as QuestDifficulty) ?? 'easy',
    estimatedMinutes: row.estimated_minutes ?? undefined,
    coins:            row.coins ?? 0,
    xpReward:         row.xp_reward ?? 0,
    bonusCoins:       row.bonus_coins ?? 0,
    bonusExpiresAt:   row.bonus_expires_at ?? undefined,

    assignedToId:     row.assigned_to_id ? String(row.assigned_to_id) : undefined,
    assignedToIds:    row.assigned_to_ids ?? [],
    isPool:           Boolean(row.is_pool),
    preferredAssigneeId: row.preferred_assignee_id ?? undefined,

    isDaily:          Boolean(row.is_daily),
    recurrence:       (row.recurrence as QuestRecurrence) ?? 'once',
    recurrenceDays:   row.recurrence_days ?? [],
    templateId:       row.template_id ?? undefined,

    status:           (row.status as QuestStatus) ?? 'todo',
    dueDate:          row.due_date ?? undefined,
    dueTime:          row.due_time ?? undefined,

    startedAt:        row.started_at ?? undefined,
    claimedAt:        row.claimed_at ?? undefined,
    submittedAt:      row.submitted_at ?? undefined,
    approvedAt:       row.approved_at ?? undefined,
    completedAt:      row.completed_at ?? undefined,
    declinedAt:       row.declined_at ?? undefined,
    archivedAt:       row.archived_at ?? undefined,
    cancelledAt:      row.cancelled_at ?? undefined,

    photoRequired:    Boolean(row.photo_required),
    photoUrl:         row.photo_url ?? undefined,
    photoUrls:        row.photo_urls ?? [],
    videoUrl:         row.video_url ?? undefined,
    completionNote:   row.completion_note ?? undefined,

    approvedById:     row.approved_by_id ? String(row.approved_by_id) : undefined,
    declineReason:    row.decline_reason ?? undefined,
    declineReasonCode: row.decline_reason_code ?? undefined,

    linkedGroceryIds: row.linked_grocery_ids ?? [],
    linkedStore:      row.linked_store ?? undefined,

    tags:             row.tags ?? [],
    history:          Array.isArray(row.history) ? row.history : [],
    createdById:      row.created_by_id ? String(row.created_by_id) : undefined,
    lastModifiedById: row.last_modified_by_id ? String(row.last_modified_by_id) : undefined,
  };
}

// ─── Quest → DB row ───────────────────────────────────────────────────────────

function toRow(q: Quest & { createdAt?: string }) {
  return {
    id:                 q.id,
    title:              q.title,
    description:        q.description ?? null,
    instructions:       q.instructions ?? null,
    category:           q.category,
    priority:           q.priority,
    difficulty:         q.difficulty,
    estimated_minutes:  q.estimatedMinutes ?? null,
    coins:              q.coins,
    xp_reward:          q.xpReward,
    bonus_coins:        q.bonusCoins,
    bonus_expires_at:   q.bonusExpiresAt ?? null,

    assigned_to_id:     q.assignedToId ?? null,
    assigned_to_ids:    q.assignedToIds ?? [],
    is_pool:            q.isPool,
    preferred_assignee_id: q.preferredAssigneeId ?? null,

    is_daily:           q.isDaily,
    recurrence:         q.recurrence,
    recurrence_days:    q.recurrenceDays ?? [],
    template_id:        q.templateId ?? null,

    status:             q.status,
    due_date:           q.dueDate ?? null,
    due_time:           q.dueTime ?? null,

    started_at:         q.startedAt ?? null,
    claimed_at:         q.claimedAt ?? null,
    submitted_at:       q.submittedAt ?? null,
    approved_at:        q.approvedAt ?? null,
    completed_at:       q.completedAt ?? null,
    declined_at:        q.declinedAt ?? null,
    archived_at:        q.archivedAt ?? null,
    cancelled_at:       q.cancelledAt ?? null,

    photo_required:     q.photoRequired,
    photo_url:          q.photoUrl ?? null,
    photo_urls:         q.photoUrls ?? [],
    video_url:          q.videoUrl ?? null,
    completion_note:    q.completionNote ?? null,

    approved_by_id:     q.approvedById ?? null,
    decline_reason:     q.declineReason ?? null,
    decline_reason_code: q.declineReasonCode ?? null,

    linked_grocery_ids: q.linkedGroceryIds ?? [],
    linked_store:       q.linkedStore ?? null,

    tags:               q.tags ?? [],
    history:            q.history ?? [],
    created_by_id:      q.createdById ?? null,
    last_modified_by_id: q.lastModifiedById ?? null,

    created_at:         q.createdAt ?? new Date().toISOString(),
  };
}
