import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type QuestStatus = 'todo' | 'claimed' | 'pending_approval' | 'done';
export type QuestCategory = 'Kitchen' | 'Room' | 'Yard' | 'School' | 'Pet' | 'Living Room' | 'Other';

export interface Quest {
  id: string;
  title: string;
  description?: string;
  coins: number;
  xpReward: number;
  assignedToId?: string;   // undefined = pool (anyone can claim)
  status: QuestStatus;
  category: QuestCategory;
  dueDate?: string;        // ISO date string
  createdAt: string;
  isDaily?: boolean;
  isPool?: boolean;
  completedAt?: string;
  submittedAt?: string;
  photoRequired?: boolean;
}

interface QuestState {
  quests: Quest[];
  loaded: boolean;
  loadFromStorage: () => Promise<void>;
  addQuest: (q: Omit<Quest, 'id' | 'createdAt'>) => void;
  claimQuest: (id: string, memberId: string) => void;
  submitQuest: (id: string) => void;
  approveQuest: (id: string) => void;
  declineQuest: (id: string) => void;
  deleteQuest: (id: string) => void;
}

const KEY = '@familycube_quests';

const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const SEED: Quest[] = [
  { id: 'q1', title: 'Wash the dishes',     coins: 30, xpReward: 20, assignedToId: 'kid-1',   status: 'todo',             category: 'Kitchen',     dueDate: today,    createdAt: today, isDaily: true },
  { id: 'q2', title: 'Take out the trash',  coins: 20, xpReward: 15, assignedToId: 'kid-1',   status: 'pending_approval', category: 'Kitchen',     dueDate: today,    createdAt: today, submittedAt: today },
  { id: 'q3', title: 'Make the bed',        coins: 10, xpReward: 10, assignedToId: 'kid-1',   status: 'done',             category: 'Room',        dueDate: today,    createdAt: today, completedAt: today },
  { id: 'q4', title: 'Vacuum living room',  coins: 40, xpReward: 30, assignedToId: undefined, status: 'todo',             category: 'Living Room', dueDate: tomorrow, createdAt: today, isPool: true },
  { id: 'q5', title: 'Water the plants',    coins: 15, xpReward: 10, assignedToId: undefined, status: 'todo',             category: 'Yard',        dueDate: tomorrow, createdAt: today, isPool: true },
  { id: 'q6', title: 'Feed the pet',        coins: 20, xpReward: 15, assignedToId: 'kid-1',   status: 'claimed',          category: 'Pet',         dueDate: today,    createdAt: today },
  { id: 'q7', title: 'Homework done',       coins: 50, xpReward: 40, assignedToId: 'kid-1',   status: 'todo',             category: 'School',      dueDate: today,    createdAt: today, isDaily: true },
  { id: 'q8', title: 'Sort recycling',      coins: 25, xpReward: 20, assignedToId: 'parent-1',status: 'todo',             category: 'Yard',        dueDate: today,    createdAt: today },
];

const save = (quests: Quest[]) => AsyncStorage.setItem(KEY, JSON.stringify(quests));

export const useQuestStore = create<QuestState>((set, get) => ({
  quests: [],
  loaded: false,

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const quests = raw ? JSON.parse(raw) as Quest[] : SEED;
      if (!raw) save(SEED);
      set({ quests, loaded: true });
    } catch { set({ quests: SEED, loaded: true }); }
  },

  addQuest: (q) => {
    const quest: Quest = { ...q, id: 'q' + Date.now(), createdAt: new Date().toISOString() };
    const next = [quest, ...get().quests];
    set({ quests: next }); save(next);
  },

  claimQuest: (id, memberId) => {
    const next = get().quests.map(q =>
      q.id === id ? { ...q, status: 'claimed' as QuestStatus, assignedToId: memberId, isPool: false } : q
    );
    set({ quests: next }); save(next);
  },

  submitQuest: (id) => {
    const next = get().quests.map(q =>
      q.id === id ? { ...q, status: 'pending_approval' as QuestStatus, submittedAt: new Date().toISOString() } : q
    );
    set({ quests: next }); save(next);
  },

  approveQuest: (id) => {
    const next = get().quests.map(q =>
      q.id === id ? { ...q, status: 'done' as QuestStatus, completedAt: new Date().toISOString() } : q
    );
    set({ quests: next }); save(next);
  },

  declineQuest: (id) => {
    const next = get().quests.map(q =>
      q.id === id ? { ...q, status: 'claimed' as QuestStatus, submittedAt: undefined } : q
    );
    set({ quests: next }); save(next);
  },

  deleteQuest: (id) => {
    const next = get().quests.filter(q => q.id !== id);
    set({ quests: next }); save(next);
  },
}));
