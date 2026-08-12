import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// ─── Domain types ────────────────────────────────────────────────────────────

export type QuestStatus    = 'todo' | 'claimed' | 'pending_approval' | 'approved' | 'done' | 'declined';
export type QuestCategory  = 'Kitchen' | 'Room' | 'Yard' | 'School' | 'Pet' | 'Living Room' | 'Errand' | 'Tech' | 'Other';
export type QuestRecurrence = 'once' | 'daily' | 'weekdays' | 'weekly' | 'custom';
export type QuestPriority   = 'low' | 'medium' | 'high' | 'urgent';

export interface QuestHistoryEntry {
  at:      string;   // ISO timestamp
  action:  'created' | 'assigned' | 'claimed' | 'submitted' | 'approved' | 'declined' | 'reassigned' | 'reopened';
  by?:     string;   // memberId who performed the action
  note?:   string;
}

export interface Quest {
  id:            string;
  title:         string;
  description?:  string;
  category:      QuestCategory;
  priority:      QuestPriority;
  coins:         number;
  xpReward:      number;
  assignedToId?:  string;    // primary assignee (used for claim/approve flow)
  assignedToIds?: string[];  // all assignees; empty/undefined = open pool
  isPool:         boolean;
  isDaily:       boolean;
  recurrence:    QuestRecurrence;
  recurrenceDays?: number[]; // 0=Sun..6=Sat for 'custom'
  status:        QuestStatus;
  dueDate?:      string;    // ISO date YYYY-MM-DD
  createdAt:     string;    // ISO
  claimedAt?:    string;
  submittedAt?:  string;
  completedAt?:  string;
  declinedAt?:   string;
  photoRequired: boolean;
  photoUrl?:     string;
  approvedById?: string;
  declineReason?: string;
  tags:          string[];
  history:       QuestHistoryEntry[];
  templateId?:   string;    // links to a recurring template
  createdById?:  string;    // parent who created it
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface QuestState {
  quests:  Quest[];
  loaded:  boolean;

  loadFromStorage:  () => Promise<void>;
  syncFromDB:       () => Promise<void>;

  addQuest:         (q: Omit<Quest, 'id' | 'createdAt' | 'history' | 'tags'> & { tags?: string[]; createdById?: string }) => Quest;
  updateQuest:      (id: string, updates: Partial<Omit<Quest, 'id' | 'createdAt' | 'history'>>) => void;
  deleteQuest:      (id: string) => void;

  claimQuest:       (id: string, memberId: string) => void;
  submitQuest:      (id: string, photoUrl?: string) => void;
  approveQuest:     (id: string, approverId: string, note?: string) => void;
  declineQuest:     (id: string, approverId: string, reason?: string) => void;
  reassignQuest:    (id: string, memberId: string | undefined, by?: string) => void;
  reopenQuest:      (id: string, by?: string) => void;

  duplicateQuest:   (id: string) => Quest | null;
  archiveDoneQuests: () => void;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const today    = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

function histEntry(action: QuestHistoryEntry['action'], by?: string): QuestHistoryEntry {
  return { at: new Date().toISOString(), action, by };
}

const SEED: Quest[] = [
  {
    id: 'q1', title: 'Wash the dishes', category: 'Kitchen', priority: 'medium',
    coins: 30, xpReward: 20, assignedToId: 'kid-1', isPool: false, isDaily: true,
    recurrence: 'daily', status: 'todo', dueDate: today, createdAt: today,
    photoRequired: false, tags: ['chore', 'daily'],
    history: [histEntry('created', 'parent-1'), histEntry('assigned', 'parent-1')],
  },
  {
    id: 'q2', title: 'Take out the trash', category: 'Kitchen', priority: 'medium',
    coins: 20, xpReward: 15, assignedToId: 'kid-1', isPool: false, isDaily: false,
    recurrence: 'weekly', status: 'pending_approval', dueDate: today, createdAt: today,
    submittedAt: today, photoRequired: false, tags: ['chore'],
    history: [histEntry('created', 'parent-1'), histEntry('assigned', 'parent-1'), histEntry('claimed', 'kid-1'), histEntry('submitted', 'kid-1')],
  },
  {
    id: 'q3', title: 'Make the bed', category: 'Room', priority: 'low',
    coins: 10, xpReward: 10, assignedToId: 'kid-1', isPool: false, isDaily: true,
    recurrence: 'daily', status: 'done', dueDate: today, createdAt: today,
    completedAt: today, photoRequired: false, tags: ['room', 'daily'],
    history: [histEntry('created', 'parent-1'), histEntry('claimed', 'kid-1'), histEntry('submitted', 'kid-1'), histEntry('approved', 'parent-1')],
  },
  {
    id: 'q4', title: 'Vacuum living room', category: 'Living Room', priority: 'medium',
    coins: 40, xpReward: 30, assignedToId: undefined, isPool: true, isDaily: false,
    recurrence: 'weekly', status: 'todo', dueDate: tomorrow, createdAt: today,
    photoRequired: false, tags: ['chore', 'bounty'],
    history: [histEntry('created', 'parent-1')],
  },
  {
    id: 'q5', title: 'Water the plants', category: 'Yard', priority: 'low',
    coins: 15, xpReward: 10, assignedToId: undefined, isPool: true, isDaily: false,
    recurrence: 'weekly', status: 'todo', dueDate: tomorrow, createdAt: today,
    photoRequired: false, tags: ['yard', 'bounty'],
    history: [histEntry('created', 'parent-1')],
  },
  {
    id: 'q6', title: 'Feed the pet', category: 'Pet', priority: 'high',
    coins: 20, xpReward: 15, assignedToId: 'kid-1', isPool: false, isDaily: true,
    recurrence: 'daily', status: 'claimed', dueDate: today, createdAt: today,
    claimedAt: today, photoRequired: false, tags: ['pet', 'daily'],
    history: [histEntry('created', 'parent-1'), histEntry('assigned', 'parent-1'), histEntry('claimed', 'kid-1')],
  },
  {
    id: 'q7', title: 'Homework done', category: 'School', priority: 'urgent',
    coins: 50, xpReward: 40, assignedToId: 'kid-1', isPool: false, isDaily: true,
    recurrence: 'weekdays', status: 'todo', dueDate: today, createdAt: today,
    photoRequired: true, tags: ['school', 'daily'],
    history: [histEntry('created', 'parent-1'), histEntry('assigned', 'parent-1')],
  },
  {
    id: 'q8', title: 'Sort recycling', category: 'Yard', priority: 'low',
    coins: 25, xpReward: 20, assignedToId: 'parent-1', isPool: false, isDaily: false,
    recurrence: 'weekly', status: 'todo', dueDate: today, createdAt: today,
    photoRequired: false, tags: ['chore'],
    history: [histEntry('created', 'parent-1')],
  },
  {
    id: 'q9', title: 'Clean room & desk', category: 'Room', priority: 'medium',
    coins: 35, xpReward: 25, assignedToId: 'kid-2', isPool: false, isDaily: false,
    recurrence: 'weekly', status: 'todo', dueDate: today, createdAt: today,
    photoRequired: true, tags: ['room'],
    history: [histEntry('created', 'parent-1'), histEntry('assigned', 'parent-1')],
  },
  {
    id: 'q10', title: 'Unload dishwasher', category: 'Kitchen', priority: 'medium',
    coins: 20, xpReward: 15, assignedToId: undefined, isPool: true, isDaily: false,
    recurrence: 'daily', status: 'todo', dueDate: today, createdAt: today,
    photoRequired: false, tags: ['kitchen', 'bounty'],
    history: [histEntry('created', 'parent-1')],
  },
];

// ─── Persistence ──────────────────────────────────────────────────────────────

const KEY  = '@familycube_quests_v3';
const save = (quests: Quest[]) => AsyncStorage.setItem(KEY, JSON.stringify(quests));

// ─── Store ────────────────────────────────────────────────────────────────────

export const useQuestStore = create<QuestState>((set, get) => ({
  quests: [],
  loaded: false,

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const quests = raw ? (JSON.parse(raw) as Quest[]) : SEED;
      if (!raw) save(SEED);
      set({ quests, loaded: true });
    } catch {
      set({ quests: SEED, loaded: true });
    }
  },

  syncFromDB: async () => {
    try {
      const { data, error } = await supabase
        .from('quests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error || !data) return;
      // If DB has quests, prefer them over local seed; otherwise keep local
      if (data.length > 0) {
        const quests = data.map(fromRow);
        set({ quests });
        save(quests);
      }
    } catch {}
  },

  addQuest: (q) => {
    const quest: Quest = {
      ...q,
      id:      'q' + Date.now(),
      tags:    q.tags ?? [],
      createdAt: new Date().toISOString(),
      isPool:  q.isPool ?? !q.assignedToId,
      history: [histEntry('created', q.createdById), ...(q.assignedToId ? [histEntry('assigned', q.createdById)] : [])],
    };
    const next = [quest, ...get().quests];
    set({ quests: next }); save(next);
    supabase.from('quests').insert([toRow(quest)]).then(() => {});
    return quest;
  },

  updateQuest: (id, updates) => {
    const next = get().quests.map(q => q.id === id ? { ...q, ...updates } : q);
    set({ quests: next }); save(next);
    const updated = next.find(q => q.id === id);
    if (updated) supabase.from('quests').update(toRow(updated)).eq('id', id).then(() => {});
  },

  deleteQuest: (id) => {
    const next = get().quests.filter(q => q.id !== id);
    set({ quests: next }); save(next);
    supabase.from('quests').delete().eq('id', id).then(() => {});
  },

  claimQuest: (id, memberId) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return { ...q, status: 'claimed' as QuestStatus, assignedToId: memberId, isPool: false, claimedAt: now,
        history: [...q.history, histEntry('claimed', memberId)] };
    });
    set({ quests: next }); save(next);
  },

  submitQuest: (id, photoUrl) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return { ...q, status: 'pending_approval' as QuestStatus, submittedAt: now, ...(photoUrl ? { photoUrl } : {}),
        history: [...q.history, histEntry('submitted', q.assignedToId)] };
    });
    set({ quests: next }); save(next);
  },

  approveQuest: (id, approverId, note) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return { ...q, status: 'done' as QuestStatus, completedAt: now, approvedById: approverId,
        history: [...q.history, { ...histEntry('approved', approverId), note }] };
    });
    set({ quests: next }); save(next);
  },

  declineQuest: (id, approverId, reason) => {
    const now = new Date().toISOString();
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return { ...q, status: 'declined' as QuestStatus, declinedAt: now, declineReason: reason, approvedById: approverId,
        history: [...q.history, { ...histEntry('declined', approverId), note: reason }] };
    });
    set({ quests: next }); save(next);
  },

  reassignQuest: (id, memberId, by) => {
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return { ...q, assignedToId: memberId, isPool: !memberId, status: 'todo' as QuestStatus,
        claimedAt: undefined, submittedAt: undefined,
        history: [...q.history, histEntry('reassigned', by)] };
    });
    set({ quests: next }); save(next);
  },

  reopenQuest: (id, by) => {
    const next = get().quests.map(q => {
      if (q.id !== id) return q;
      return { ...q, status: 'claimed' as QuestStatus, submittedAt: undefined, declinedAt: undefined, declineReason: undefined,
        history: [...q.history, histEntry('reopened', by)] };
    });
    set({ quests: next }); save(next);
  },

  duplicateQuest: (id) => {
    const src = get().quests.find(q => q.id === id);
    if (!src) return null;
    const duplicate: Quest = {
      ...src, id: 'q' + Date.now(), createdAt: new Date().toISOString(),
      status: 'todo', claimedAt: undefined, submittedAt: undefined,
      completedAt: undefined, declinedAt: undefined, photoUrl: undefined,
      approvedById: undefined, declineReason: undefined,
      history: [histEntry('created')],
    };
    const next = [duplicate, ...get().quests];
    set({ quests: next }); save(next);
    return duplicate;
  },

  archiveDoneQuests: () => {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const next = get().quests.filter(q => !(q.status === 'done' && (q.completedAt ?? '') < cutoff));
    set({ quests: next }); save(next);
  },
}));

// ─── DB row mappers (extend to match your actual Supabase schema) ─────────────

function toRow(q: Quest) {
  return {
    id:              q.id,
    title:           q.title,
    description:     q.description ?? null,
    category:        q.category,
    priority:        q.priority,
    coins:           q.coins,
    xp_reward:       q.xpReward,
    assigned_to_id:  q.assignedToId ?? null,
    is_pool:         q.isPool,
    is_daily:        q.isDaily,
    recurrence:      q.recurrence,
    status:          q.status,
    due_date:        q.dueDate ?? null,
    photo_required:  q.photoRequired,
    photo_url:       q.photoUrl ?? null,
    approved_by_id:  q.approvedById ?? null,
    decline_reason:  q.declineReason ?? null,
    tags:            q.tags,
    template_id:     q.templateId ?? null,
    created_by_id:   q.createdById ?? null,
    created_at:      q.createdAt,
    claimed_at:      q.claimedAt ?? null,
    submitted_at:    q.submittedAt ?? null,
    completed_at:    q.completedAt ?? null,
  };
}

function fromRow(row: any): Quest {
  return {
    id:            String(row.id),
    title:         row.title,
    description:   row.description ?? undefined,
    category:      row.category ?? 'Other',
    priority:      row.priority ?? 'medium',
    coins:         row.coins ?? 0,
    xpReward:      row.xp_reward ?? 0,
    assignedToId:  row.assigned_to_id ? String(row.assigned_to_id) : undefined,
    isPool:        Boolean(row.is_pool),
    isDaily:       Boolean(row.is_daily),
    recurrence:    row.recurrence ?? 'once',
    status:        row.status ?? 'todo',
    dueDate:       row.due_date ?? undefined,
    createdAt:     row.created_at,
    claimedAt:     row.claimed_at ?? undefined,
    submittedAt:   row.submitted_at ?? undefined,
    completedAt:   row.completed_at ?? undefined,
    photoRequired: Boolean(row.photo_required),
    photoUrl:      row.photo_url ?? undefined,
    approvedById:  row.approved_by_id ? String(row.approved_by_id) : undefined,
    declineReason: row.decline_reason ?? undefined,
    tags:          row.tags ?? [],
    history:       [],   // history stored separately or in jsonb
    templateId:    row.template_id ?? undefined,
    createdById:   row.created_by_id ? String(row.created_by_id) : undefined,
  };
}
