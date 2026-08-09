import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MemberRole = 'parent' | 'kid';

export interface FamilyMember {
  id: string;
  name: string;
  role: MemberRole;
  emoji?: string;
  avatarUrl?: string;
  coins: number;
  xp: number;
  streak: number;
  level: number;
  questsCompleted: number;
  questsPending: number;
  // PIN lock
  pin?: string;           // 4-digit PIN string, undefined = no PIN set
  pinEnabled?: boolean;   // explicit toggle; true = require PIN on switch
}

interface FamilyState {
  members: FamilyMember[];
  activeMemberId: string | null;
  loaded: boolean;

  setMembers: (members: FamilyMember[]) => void;
  setActiveMember: (id: string) => void;
  addMember: (member: FamilyMember) => void;
  updateMember: (id: string, updates: Partial<FamilyMember>) => void;
  setMemberPin: (id: string, pin: string | null) => void;
  loadFromStorage: () => Promise<void>;
}

const STORAGE_KEY = '@familycube_members';
const ACTIVE_KEY  = '@familycube_active_member';

// Seed — parents have PIN enabled by default so the flow is testable on first run
const SEED_MEMBERS: FamilyMember[] = [
  { id: 'parent-1', name: 'Praveena', role: 'parent', emoji: '👩', coins: 0,  xp: 0,   streak: 5, level: 1, questsCompleted: 12, questsPending: 2, pin: '1234', pinEnabled: true },
  { id: 'parent-2', name: 'Ugandhar', role: 'parent', emoji: '👨', coins: 0,  xp: 0,   streak: 3, level: 1, questsCompleted: 8,  questsPending: 1, pin: '1234', pinEnabled: true },
  { id: 'kid-1',    name: 'Leo',      role: 'kid',    emoji: '🧒', coins: 120, xp: 340, streak: 7, level: 3, questsCompleted: 24, questsPending: 3 },
];

export const useFamilyStore = create<FamilyState>((set, get) => ({
  members: [],
  activeMemberId: null,
  loaded: false,

  setMembers: (members) => {
    set({ members });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  },

  setActiveMember: (id) => {
    set({ activeMemberId: id });
    AsyncStorage.setItem(ACTIVE_KEY, id);
  },

  addMember: (member) => {
    const next = [...get().members, member];
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  updateMember: (id, updates) => {
    const next = get().members.map(m => m.id === id ? { ...m, ...updates } : m);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  setMemberPin: (id, pin) => {
    const next = get().members.map(m =>
      m.id === id
        ? { ...m, pin: pin ?? undefined, pinEnabled: pin !== null }
        : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  loadFromStorage: async () => {
    try {
      const [raw, activeId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
      ]);
      const members = raw ? JSON.parse(raw) as FamilyMember[] : SEED_MEMBERS;
      if (!raw) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_MEMBERS));
      const activeMemberId = activeId && members.some(m => m.id === activeId)
        ? activeId
        : members[0]?.id ?? null;
      set({ members, activeMemberId, loaded: true });
    } catch {
      set({ members: SEED_MEMBERS, activeMemberId: SEED_MEMBERS[0].id, loaded: true });
    }
  },
}));
