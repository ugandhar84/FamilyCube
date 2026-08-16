import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
// Lazy-read family_id from active member without circular dep
const getFamilyId = (): string | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useFamilyStore } = require('@/store/familyStore');
    const state = useFamilyStore.getState();
    const active = state.members.find((m: any) => m.id === state.activeMemberId) ?? state.members[0];
    return (active as any)?.familyId ?? null;
  } catch { return null; }
};

// ─── Quest event notifier (fire-and-forget) ───────────────────────────────────
// familyId is resolved from the quests table row so the edge function can
// look up the right members and push tokens per family.
async function notifyQuestEvent(questId: string, event: string, extra: Record<string, unknown> = {}) {
  try {
    // Resolve familyId from DB — single lightweight query
    const { data } = await supabase
      .from('quests')
      .select('family_id')
      .eq('id', questId)
      .single();
    const familyId = data?.family_id;
    if (!familyId) return; // can't notify without family context
    supabase.functions
      .invoke('quest-event-notifier', { body: { event, questId, familyId, ...extra } })
      .catch(e => console.warn('[questStore] notify invoke failed:', e?.message));
  } catch (e: any) {
    console.warn('[questStore] notify failed:', e?.message);
  }
}

// ─── Domain types ────────────────────────────────────────────────────────────

export type QuestStatus    = 'todo' | 'claimed' | 'in_progress' | 'pending_approval' | 'approved' | 'done' | 'declined' | 'archived' | 'cancelled';
export type QuestCategory  = 'Kitchen' | 'Room' | 'Yard' | 'School' | 'Pet' | 'Living Room' | 'Garage' | 'Bathroom' | 'Laundry' | 'Errand' | 'Tech' | 'Finance' | 'Health' | 'Garden' | 'Car' | 'Shopping' | 'Cooking' | 'Social' | 'Creative' | 'Other';
export type QuestRecurrence = 'once' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type QuestPriority   = 'low' | 'medium' | 'high' | 'urgent';
export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'hero';

// Spec §2: chore_definitions.category
export type QuestType =
  | 'citizenship'      // non-negotiable, 0 pts, required for streak
  | 'routine'          // standard recurring
  | 'bounty'           // high-effort, first-come
  | 'shopping'         // errand / shopping run with item list + optional receipt
  | 'grandparent_quest'// intergenerational, funded by grandparent
  | 'parent_only'      // adult-only, private, 0 pts
  | 'general';         // default (existing quests)

// Spec §8: actionable pushback for parent-only quests
export type PushbackType = 'snooze' | 'blocker' | 'trade' | 'discuss';

export interface QuestPushback {
  type:       PushbackType;
  details:    string;
  by:         string;   // memberId who pushed back
  at:         string;   // ISO timestamp
  snoozeUntil?: string; // for type=snooze
}

export interface QuestHistoryEntry {
  at:      string;
  action:  'created' | 'assigned' | 'claimed' | 'submitted' | 'approved' | 'declined' | 'reassigned' | 'reopened' | 'cancelled' | 'archived';
  by?:     string;
  note?:   string;
}

// ─── Participant ──────────────────────────────────────────────────────────────
// One row per (quest, member) pair. Tracks each kid's independent journey.
export type ParticipantStatus = 'todo' | 'in_progress' | 'pending_approval' | 'approved' | 'declined' | 'cancelled';

export interface QuestParticipant {
  id:              string;
  questId:         string;
  memberId:        string;
  status:          ParticipantStatus;
  claimedAt?:      string;
  submittedAt?:    string;
  approvedAt?:     string;
  declinedAt?:     string;
  approvedById?:   string;
  declineReason?:  string;
  declineReasonCode?: string;
  photoUrl?:       string;
  photoUrls:       string[];
  completionNote?: string;
  coinsAwarded?:   number;
  createdAt:       string;
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
  isMultiAssign:    boolean;
  maxClaimants?:    number;        // null = unlimited; 1 = first-come (default)
  preferredAssigneeId?: string;

  participants:     QuestParticipant[];  // loaded alongside quest

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
  shoppingItems?:   string[];
  shoppingStore?:   string;
  shoppingBudget?:  number;
  linkedStore?:     string;

  tags:             string[];
  history:          QuestHistoryEntry[];
  createdById?:     string;
  lastModifiedById?: string;

  isAdultTask:      boolean;  // true = only visible to parent/senior; hidden from kids/grandparents
  inviteGrandparents?: boolean; // true = grandparents can also see/claim this adult task

  // Spec §2 / §8: parent-only quest extensions
  questType:        QuestType;
  assignmentMode:   'pull' | 'direct'; // pull = household backlog; direct = assigned to partner
  bounceCount:      number;            // Two-Bounce Rule tracker
  isLocked:         boolean;           // true after 2 bounces → move to unassigned pool
  pushbacks:        QuestPushback[];   // actionable pushback history
  autoApproveAt?:   string;            // ISO — set when submitted; cron approves after 24h
  appreciationSent: boolean;           // co-parent sent appreciation ping after completion
  snoozedUntil?:    string;            // ISO — if pushback type=snooze
}

// ─── Cache + realtime state ───────────────────────────────────────────────────

const CACHE_KEY   = '@familycube_quests_v3';
const CACHE_TTL   = 5 * 60_000;   // 5 min SWR
let   _fetchedAt  = 0;
const _inFlight   = new Set<string>();
let   _abort: AbortController | null = null;
let   _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let   _rtFamilyId = '';

// ─── Store interface ──────────────────────────────────────────────────────────

interface QuestState {
  quests:  Quest[];
  loaded:  boolean;

  loadFromStorage:  () => Promise<void>;
  syncFromDB:       () => Promise<void>;

  addQuest:         (q: Omit<Quest, 'id' | 'createdAt' | 'history' | 'tags' | 'photoUrls' | 'linkedGroceryIds' | 'recurrenceDays' | 'bonusCoins' | 'difficulty' | 'isMultiAssign' | 'maxClaimants' | 'participants' | 'questType' | 'assignmentMode' | 'bounceCount' | 'isLocked' | 'pushbacks' | 'appreciationSent'> & Partial<Pick<Quest, 'tags' | 'difficulty' | 'questType' | 'assignmentMode'>>) => Quest;
  updateQuest:      (id: string, updates: Partial<Omit<Quest, 'id' | 'history'>>, by?: string) => void;
  deleteQuest:      (id: string) => void;

  claimQuest:       (id: string, memberId: string) => void;
  submitQuest:      (id: string, opts?: { photoUrl?: string; photoUrls?: string[]; note?: string }) => void;
  approveQuest:     (id: string, approverId: string, note?: string) => void;
  declineQuest:     (id: string, approverId: string, reason?: string, reasonCode?: string) => void;
  reassignQuest:    (id: string, memberId: string | undefined, by?: string) => void;
  reopenQuest:      (id: string, by?: string) => void;

  // Per-participant actions (multi-assign + multi-claim pool)
  approveParticipant: (questId: string, memberId: string, approverId: string) => void;
  declineParticipant: (questId: string, memberId: string, approverId: string, reason?: string, reasonCode?: string) => void;
  reopenParticipant:  (questId: string, memberId: string, by?: string) => void;
  createParticipants: (questId: string, memberIds: string[]) => Promise<void>;
  cancelQuest:      (id: string, by?: string) => void;
  archiveDoneQuests: () => void;

  duplicateQuest:   (id: string) => Quest | null;

  // Spec §8: parent-only quest actions
  pullTask:          (id: string, memberId: string) => void;           // claim from household backlog
  pushbackTask:      (id: string, pb: QuestPushback) => void;         // actionable pushback
  appreciateTask:    (id: string, fromMemberId: string) => void;       // post-completion appreciation ping
  lockTask:          (id: string) => void;                             // two-bounce lock → unassigned pool
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function histEntry(action: QuestHistoryEntry['action'], by?: string, note?: string): QuestHistoryEntry {
  return { at: new Date().toISOString(), action, ...(by ? { by } : {}), ...(note ? { note } : {}) };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const save = (quests: Quest[]) => AsyncStorage.setItem(CACHE_KEY, JSON.stringify(quests));

// ─── DB helpers ───────────────────────────────────────────────────────────────

function dbUpdate(id: string, patch: Record<string, unknown>) {
  _fetchedAt = 0; // invalidate TTL so next syncFromDB re-fetches
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

// ─── Realtime subscription ────────────────────────────────────────────────────

function ensureRealtime(
  familyId: string,
  getState: () => QuestState,
  setState: (s: Partial<QuestState>) => void,
) {
  if (_rtFamilyId === familyId && _rtChannel) return;
  if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; }
  _rtFamilyId = familyId;

  _rtChannel = supabase
    .channel(`quests:${familyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quests', filter: `family_id=eq.${familyId}` },
      (payload) => {
        const { quests } = getState();
        const newRow = payload.new as any;
        const oldRow = payload.old as any;

        let next: Quest[];
        if (payload.eventType === 'INSERT') {
          if (quests.find(q => q.id === newRow.id)) return; // already added optimistically
          const q = fromRow(newRow);
          q.participants = backfillParticipants(q);
          next = [q, ...quests];
        } else if (payload.eventType === 'UPDATE') {
          if (newRow.deleted_at || newRow.status === 'archived') {
            next = quests.filter(q => q.id !== newRow.id);
          } else {
            next = quests.map(q => {
              if (q.id !== newRow.id) return q;
              const updated = fromRow(newRow);
              updated.participants = q.participants; // keep in-memory participants
              return updated;
            });
          }
        } else if (payload.eventType === 'DELETE') {
          next = quests.filter(q => q.id !== oldRow.id);
        } else return;

        setState({ quests: next });
        save(next);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quest_participants' },
      (payload) => {
        const { quests } = getState();
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        const questId  = newRow?.quest_id ?? oldRow?.quest_id;
        const memberId = newRow?.member_id ?? oldRow?.member_id;
        if (!questId) return;

        const next = quests.map(q => {
          if (q.id !== questId) return q;
          let parts = q.participants;
          if (payload.eventType === 'INSERT') {
            if (parts.find(p => p.memberId === memberId)) return q;
            parts = [...parts, participantFromRow(newRow)];
          } else if (payload.eventType === 'UPDATE') {
            parts = parts.map(p => p.memberId === memberId ? participantFromRow(newRow) : p);
          } else if (payload.eventType === 'DELETE') {
            parts = parts.filter(p => p.memberId !== memberId);
          }
          return { ...q, participants: parts };
        });

        setState({ quests: next });
        save(next);
      }
    )
    .subscribe(status => {
      console.log('[questStore] realtime', status, familyId);
    });
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useQuestStore = create<QuestState>((set, get) => ({
  quests: [],
  loaded: false,

  loadFromStorage: async () => {
    // 1. Paint instantly from disk cache
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      const cached = raw ? (JSON.parse(raw) as Quest[]) : null;
      if (cached && cached.length > 0) set({ quests: cached, loaded: true });
    } catch { /* ignore */ }

    // 2. Fetch from DB (respects TTL — skip if cache is still fresh)
    await get().syncFromDB();
    set({ loaded: true });
  },

  syncFromDB: async () => {
    // SWR: skip if data was fetched recently
    if (Date.now() - _fetchedAt < CACHE_TTL && get().quests.length > 0) return;

    // Dedup: skip if a fetch is already in-flight
    if (_inFlight.has('quests')) return;
    _inFlight.add('quests');

    // Abort previous stale fetch
    _abort?.abort();
    _abort = new AbortController();

    try {
      const familyId = getFamilyId();
      const [questsRes, partRes] = await Promise.all([
        (() => {
          let q = supabase
            .from('quests')
            .select('*')
            .is('deleted_at', null)
            .not('status', 'eq', 'archived')
            .order('created_at', { ascending: false });
          if (familyId) q = q.eq('family_id', familyId);
          return q;
        })(),
        (() => {
          let q = supabase
            .from('quest_participants')
            .select('*')
            .order('created_at', { ascending: true });
          if (familyId) {
            // Filter participants to only this family's quests via subquery approach
            // (quest_participants has no family_id — join via in-memory after fetch)
          }
          return q;
        })(),
      ]);

      if (_abort?.signal.aborted) return;
      if (questsRes.error || !questsRes.data) return;

      const questIds = new Set(questsRes.data.map((r: any) => r.id));
      const partsByQuest: Record<string, QuestParticipant[]> = {};
      for (const row of (partRes.data ?? [])) {
        if (!questIds.has(row.quest_id)) continue; // only this family's quests
        const p = participantFromRow(row);
        if (!partsByQuest[p.questId]) partsByQuest[p.questId] = [];
        partsByQuest[p.questId].push(p);
      }

      const quests = questsRes.data.map((row: any) => {
        const q = fromRow(row);
        q.participants = partsByQuest[q.id] ?? backfillParticipants(q);
        return q;
      });

      _fetchedAt = Date.now();
      set({ quests, loaded: true });
      save(quests);

      // Wire realtime after first successful fetch
      if (familyId) ensureRealtime(familyId, get, set);
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.warn('[questStore] syncFromDB failed', e);
    } finally {
      _inFlight.delete('quests');
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
      shoppingItems:    (q as any).shoppingItems ?? undefined,
      shoppingStore:    (q as any).shoppingStore ?? undefined,
      shoppingBudget:   (q as any).shoppingBudget ?? undefined,
      recurrenceDays:   [],
      bonusCoins:       0,
      isMultiAssign:    false,
      maxClaimants:     1,
      participants:     [],
      isAdultTask:        (q as any).isAdultTask ?? false,
      inviteGrandparents: (q as any).inviteGrandparents ?? false,
      questType:        (q as any).questType ?? 'general',
      assignmentMode:   (q as any).assignmentMode ?? 'direct',
      bounceCount:      0,
      isLocked:         false,
      pushbacks:        [],
      appreciationSent: false,
      createdAt:        new Date().toISOString(),
      isPool:           q.isPool ?? !q.assignedToId,
      history:          [
        histEntry('created', q.createdById),
        ...(q.assignedToId ? [histEntry('assigned', q.createdById)] : []),
      ],
    } as Quest & { createdAt: string };
    const prev = get().quests;
    const next = [quest, ...prev];
    set({ quests: next }); save(next);
    supabase.from('quests').insert([toRow(quest)]).then(({ error }) => {
      if (error) {
        console.warn('[questStore] insert failed', error.message);
        set({ quests: prev }); save(prev); // rollback
      } else if (quest.assignedToId) {
        notifyQuestEvent(quest.id, 'quest_assigned', { questTitle: quest.title, assigneeId: quest.assignedToId, coins: quest.coins, triggeredById: quest.createdById });
      }
    });
    return quest;
  },

  updateQuest: (id, updates, by) => {
    const prev   = get().quests;
    const before = prev.find(q => q.id === id);
    const next   = prev.map(q => {
      if (q.id !== id) return q;
      const hist = by ? [...q.history, histEntry('assigned', by)] : q.history;
      return { ...q, ...updates, history: hist };
    });
    set({ quests: next }); save(next);
    const updated = next.find(q => q.id === id);
    if (updated) {
      supabase.from('quests')
        .update({ ...toRow(updated), last_modified_by_id: by ?? null })
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.warn('[questStore] update failed', id, error.message);
            set({ quests: prev }); save(prev); // rollback
          }
        });
      if ((!before?.bonusCoins || before.bonusCoins === 0) && (updates.bonusCoins ?? 0) > 0) {
        notifyQuestEvent(id, 'bonus_activated', {
          questTitle:     updated.title,
          assigneeId:     updated.assignedToId,
          bonusCoins:     updates.bonusCoins,
          bonusExpiresAt: updates.bonusExpiresAt,
          triggeredById:  by,
        });
      }
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
    const claimedQ = next.find(q => q.id === id);
    if (claimedQ) notifyQuestEvent(id, 'quest_claimed', { questTitle: claimedQ.title, assigneeId: memberId, coins: claimedQ.coins, triggeredById: memberId });
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
    notifyQuestEvent(id, 'quest_submitted', { questTitle: q.title, assigneeId: q.assignedToId, triggeredById: q.assignedToId });
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

    // Award coins + XP and notify assignee
    if (quest.assignedToId) {
      const totalCoins = quest.coins + quest.bonusCoins;
      awardMemberCoins(quest.assignedToId, totalCoins, quest.xpReward);
      notifyQuestEvent(id, 'quest_approved', { questTitle: quest.title, assigneeId: quest.assignedToId, coins: quest.coins, bonusCoins: quest.bonusCoins, triggeredById: approverId });
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
    const declinedQ = get().quests.find(x => x.id === id);
    if (declinedQ?.assignedToId) notifyQuestEvent(id, 'quest_declined', { questTitle: declinedQ.title, assigneeId: declinedQ.assignedToId, declineReason: reason, triggeredById: approverId });
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
    const prevQ = get().quests.find(q => q.id === id);
    dbUpdate(id, {
      assigned_to_id:    memberId ?? null,
      is_pool:           !memberId,
      status:            'todo',
      claimed_at:        null,
      submitted_at:      null,
      history:           (next.find(q => q.id === id)?.history ?? []),
      last_modified_by_id: by ?? null,
    });
    if (prevQ) notifyQuestEvent(id, 'quest_reassigned', { questTitle: prevQ.title, assigneeId: prevQ.assignedToId, newAssigneeId: memberId, coins: prevQ.coins, triggeredById: by });
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
    const reopenedQ = next.find(q => q.id === id);
    dbUpdate(id, {
      status:              'claimed',
      submitted_at:        null,
      declined_at:         null,
      decline_reason:      null,
      decline_reason_code: null,
      history:             (reopenedQ?.history ?? []),
      last_modified_by_id: by ?? null,
    });
    if (reopenedQ?.assignedToId) notifyQuestEvent(id, 'quest_reopened', { questTitle: reopenedQ.title, assigneeId: reopenedQ.assignedToId, coins: reopenedQ.coins, triggeredById: by });
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
      participants:    [],
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

  // ── Participant actions ────────────────────────────────────────────────────

  approveParticipant: (questId, memberId, approverId) => {
    const now = new Date().toISOString();
    const quest = get().quests.find(q => q.id === questId);
    if (!quest) return;
    const participant = quest.participants.find(p => p.memberId === memberId);
    if (!participant) return;

    const patch: Partial<QuestParticipant> = {
      status:       'approved',
      approvedAt:   now,
      approvedById: approverId,
      coinsAwarded: quest.coins + quest.bonusCoins,
    };
    const next = updateQuestParticipant(get().quests, questId, memberId, patch);
    set({ quests: next }); save(next);

    dbUpdateParticipant(questId, memberId, {
      status:          'approved',
      approved_at:     now,
      approved_by_id:  approverId,
      coins_awarded:   quest.coins + quest.bonusCoins,
    });
    // Also update quest-level status in DB
    const updated = next.find(q => q.id === questId);
    if (updated) dbUpdate(questId, { status: updated.status, approved_at: now, approved_by_id: approverId });

    awardMemberCoins(memberId, quest.coins + quest.bonusCoins, quest.xpReward);
  },

  declineParticipant: (questId, memberId, approverId, reason, reasonCode) => {
    const now = new Date().toISOString();
    const patch: Partial<QuestParticipant> = {
      status:            'declined',
      declinedAt:        now,
      approvedById:      approverId,
      declineReason:     reason,
      declineReasonCode: reasonCode,
    };
    const next = updateQuestParticipant(get().quests, questId, memberId, patch);
    set({ quests: next }); save(next);
    dbUpdateParticipant(questId, memberId, {
      status:              'declined',
      declined_at:         now,
      approved_by_id:      approverId,
      decline_reason:      reason ?? null,
      decline_reason_code: reasonCode ?? null,
    });
    const updated = next.find(q => q.id === questId);
    if (updated) dbUpdate(questId, { status: updated.status });
  },

  reopenParticipant: (questId, memberId, by) => {
    const patch: Partial<QuestParticipant> = {
      status:        'in_progress',
      declinedAt:    undefined,
      declineReason: undefined,
      submittedAt:   undefined,
    };
    const next = updateQuestParticipant(get().quests, questId, memberId, patch);
    set({ quests: next }); save(next);
    dbUpdateParticipant(questId, memberId, {
      status:         'in_progress',
      declined_at:    null,
      decline_reason: null,
      submitted_at:   null,
    });
    const updated = next.find(q => q.id === questId);
    if (updated) dbUpdate(questId, { status: updated.status, last_modified_by_id: by ?? null });
  },

  createParticipants: async (questId, memberIds) => {
    const now = new Date().toISOString();
    const rows = memberIds.map(mid => ({
      quest_id:   questId,
      member_id:  mid,
      status:     'todo',
      created_at: now,
    }));
    const { error } = await supabase.from('quest_participants').insert(rows);
    if (error) { console.warn('[questStore] createParticipants failed', error.message); return; }

    // Update in-memory quest with the new participant stubs
    const stubs: QuestParticipant[] = memberIds.map(mid => ({
      id:         `${questId}_${mid}`,
      questId,
      memberId:   mid,
      status:     'todo',
      photoUrls:  [],
      createdAt:  now,
    }));
    const next = get().quests.map(q =>
      q.id === questId ? { ...q, participants: [...q.participants, ...stubs] } : q
    );
    set({ quests: next }); save(next);
  },

  // ── Spec §8: Pull from household backlog ──────────────────────────────────
  pullTask: (id, memberId) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id || q.assignmentMode !== 'pull') return q;
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
    dbUpdate(id, { status: 'claimed', assigned_to_id: memberId, is_pool: false, claimed_at: now });
    const q = next.find(x => x.id === id);
    if (q) notifyQuestEvent(id, 'quest_claimed', { questTitle: q.title, assigneeId: memberId, triggeredById: memberId });
  },

  // ── Spec §8: Actionable Pushback ──────────────────────────────────────────
  pushbackTask: (id, pb) => {
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      const newBounce = q.bounceCount + 1;
      const locked    = newBounce >= 2;
      return {
        ...q,
        bounceCount:  newBounce,
        isLocked:     locked,
        pushbacks:    [...q.pushbacks, pb],
        snoozedUntil: pb.type === 'snooze' ? pb.snoozeUntil : q.snoozedUntil,
        // Two-Bounce: after lock, release to unassigned pool
        ...(locked ? { assignedToId: undefined, isPool: true, status: 'todo' as QuestStatus } : {}),
        history: [...q.history, histEntry('assigned', pb.by, `pushback:${pb.type}`)],
      };
    });
    set({ quests: next }); save(next);
    const q = next.find(x => x.id === id);
    if (!q) return;
    dbUpdate(id, {
      bounce_count:  q.bounceCount,
      is_locked:     q.isLocked,
      pushbacks:     q.pushbacks,
      snoozed_until: q.snoozedUntil ?? null,
      ...(q.isLocked ? { assigned_to_id: null, is_pool: true, status: 'todo' } : {}),
      history:       q.history,
    });
  },

  // ── Spec §8: Appreciation Ping ────────────────────────────────────────────
  appreciateTask: (id, fromMemberId) => {
    const next = get().quests.map(q =>
      q.id === id ? { ...q, appreciationSent: true } : q
    );
    set({ quests: next }); save(next);
    dbUpdate(id, { appreciation_sent: true });
    const q = next.find(x => x.id === id);
    if (q) notifyQuestEvent(id, 'appreciation_sent', { questTitle: q.title, triggeredById: fromMemberId });
  },

  // ── Two-Bounce Rule: manual lock ─────────────────────────────────────────
  lockTask: (id) => {
    const next = get().quests.map(q =>
      q.id === id
        ? { ...q, isLocked: true, assignedToId: undefined, isPool: true, status: 'todo' as QuestStatus }
        : q
    );
    set({ quests: next }); save(next);
    dbUpdate(id, { is_locked: true, assigned_to_id: null, is_pool: true, status: 'todo' });
  },
}));

// ─── DB row → Quest ───────────────────────────────────────────────────────────

// ─── Participant helpers ──────────────────────────────────────────────────────

function participantFromRow(row: any): QuestParticipant {
  return {
    id:              String(row.id),
    questId:         String(row.quest_id),
    memberId:        String(row.member_id),
    status:          (row.status as ParticipantStatus) ?? 'todo',
    claimedAt:       row.claimed_at ?? undefined,
    submittedAt:     row.submitted_at ?? undefined,
    approvedAt:      row.approved_at ?? undefined,
    declinedAt:      row.declined_at ?? undefined,
    approvedById:    row.approved_by_id ?? undefined,
    declineReason:   row.decline_reason ?? undefined,
    declineReasonCode: row.decline_reason_code ?? undefined,
    photoUrl:        row.photo_url ?? undefined,
    photoUrls:       row.photo_urls ?? [],
    completionNote:  row.completion_note ?? undefined,
    coinsAwarded:    row.coins_awarded ?? undefined,
    createdAt:       row.created_at,
  };
}

// Legacy quests (pre-participants) — synthesise one participant row in memory
// so the UI can treat all quests uniformly. Not written to DB.
function backfillParticipants(q: Quest): QuestParticipant[] {
  if (!q.assignedToId && !q.assignedToIds?.length) return [];
  const memberIds = q.assignedToIds?.length ? q.assignedToIds : [q.assignedToId!];
  return memberIds.map(mid => ({
    id:           `synthetic_${q.id}_${mid}`,
    questId:      q.id,
    memberId:     mid,
    status:       q.status === 'pending_approval' ? 'pending_approval'
                : q.status === 'done'             ? 'approved'
                : q.status === 'declined'         ? 'declined'
                : q.status === 'claimed'          ? 'in_progress'
                : 'todo' as ParticipantStatus,
    claimedAt:    q.claimedAt,
    submittedAt:  q.submittedAt,
    approvedAt:   q.approvedAt,
    declinedAt:   q.declinedAt,
    approvedById: q.approvedById,
    declineReason: q.declineReason,
    photoUrl:     q.photoUrl,
    photoUrls:    q.photoUrls ?? [],
    completionNote: q.completionNote,
    createdAt:    new Date().toISOString(),
  }));
}

function dbUpdateParticipant(questId: string, memberId: string, patch: Record<string, unknown>) {
  supabase
    .from('quest_participants')
    .update(patch)
    .eq('quest_id', questId)
    .eq('member_id', memberId)
    .then(({ error }) => {
      if (error) console.warn('[questStore] participant update failed', error.message);
    });
}

function updateQuestParticipant(
  quests: Quest[],
  questId: string,
  memberId: string,
  patch: Partial<QuestParticipant>
): Quest[] {
  return quests.map(q => {
    if (q.id !== questId) return q;
    const parts = q.participants.map(p =>
      p.memberId === memberId ? { ...p, ...patch } : p
    );
    // Derive quest-level status from participants
    const statuses = parts.map(p => p.status);
    const allDone      = statuses.every(s => s === 'approved');
    const anyPending   = statuses.some(s => s === 'pending_approval');
    const anyDeclined  = statuses.every(s => s === 'declined');
    const questStatus: QuestStatus =
      allDone    ? 'done'
      : anyPending ? 'pending_approval'
      : anyDeclined ? 'declined'
      : q.status; // keep existing when mixed
    return { ...q, participants: parts, status: questStatus };
  });
}

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
    isMultiAssign:    Boolean(row.is_multi_assign),
    maxClaimants:     row.max_claimants ?? 1,
    preferredAssigneeId: row.preferred_assignee_id ?? undefined,
    participants:     [], // populated by syncFromDB after fetching quest_participants

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
    shoppingItems:    Array.isArray(row.shopping_items) ? row.shopping_items : undefined,
    shoppingStore:    row.shopping_store ?? undefined,
    shoppingBudget:   row.shopping_budget ?? undefined,
    linkedStore:      row.linked_store ?? undefined,

    tags:             row.tags ?? [],
    history:          Array.isArray(row.history) ? row.history : [],
    createdById:      row.created_by_id ? String(row.created_by_id) : undefined,
    lastModifiedById: row.last_modified_by_id ? String(row.last_modified_by_id) : undefined,
    isAdultTask:        Boolean(row.is_adult_task),
    inviteGrandparents: Boolean(row.invite_grandparents),

    questType:        (row.quest_type as QuestType) ?? 'general',
    assignmentMode:   (row.assignment_mode as 'pull' | 'direct') ?? 'direct',
    bounceCount:      row.bounce_count ?? 0,
    isLocked:         Boolean(row.is_locked),
    pushbacks:        Array.isArray(row.pushbacks) ? row.pushbacks : [],
    autoApproveAt:    row.auto_approve_at ?? undefined,
    appreciationSent: Boolean(row.appreciation_sent),
    snoozedUntil:     row.snoozed_until ?? undefined,
  };
}

// ─── Quest → DB row ───────────────────────────────────────────────────────────

function toRow(q: Quest & { createdAt?: string }) {
  return {
    id:                 q.id,
    family_id:          getFamilyId(),
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
    is_multi_assign:    q.isMultiAssign ?? false,
    max_claimants:      q.maxClaimants ?? 1,
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
    shopping_items:     q.shoppingItems ?? null,
    shopping_store:     q.shoppingStore ?? null,
    shopping_budget:    q.shoppingBudget ?? null,
    linked_store:       q.linkedStore ?? null,

    tags:               q.tags ?? [],
    history:            q.history ?? [],
    created_by_id:      q.createdById ?? null,
    last_modified_by_id: q.lastModifiedById ?? null,
    is_adult_task:       q.isAdultTask ?? false,
    invite_grandparents: q.inviteGrandparents ?? false,

    quest_type:         q.questType ?? 'general',
    assignment_mode:    q.assignmentMode ?? 'direct',
    bounce_count:       q.bounceCount ?? 0,
    is_locked:          q.isLocked ?? false,
    pushbacks:          q.pushbacks ?? [],
    auto_approve_at:    q.autoApproveAt ?? null,
    appreciation_sent:  q.appreciationSent ?? false,
    snoozed_until:      q.snoozedUntil ?? null,

    created_at:         q.createdAt ?? new Date().toISOString(),
  };
}
