import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;  // ISO
  reactions?: Record<string, string[]>;  // emoji → memberIds
  imageUrl?: string;
}

interface ChatState {
  messages: ChatMessage[];
  loaded: boolean;
  loadFromStorage: () => Promise<void>;
  sendMessage: (senderId: string, text: string) => void;
  addReaction: (messageId: string, emoji: string, memberId: string) => void;
  deleteMessage: (id: string) => void;
}

const KEY = '@familycube_chat';

const ts = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60000).toISOString();

const SEED: ChatMessage[] = [
  { id: 'm1', senderId: 'parent-1', text: 'Good morning everyone! 🌞',            timestamp: ts(120) },
  { id: 'm2', senderId: 'kid-1',    text: 'Morning! Can we have pancakes today?',  timestamp: ts(118) },
  { id: 'm3', senderId: 'parent-2', text: 'Sure! Who wants to help make them? 🥞', timestamp: ts(115) },
  { id: 'm4', senderId: 'kid-1',    text: 'ME! 🙋',                               timestamp: ts(114), reactions: { '❤️': ['parent-1', 'parent-2'] } },
  { id: 'm5', senderId: 'parent-1', text: 'Leo, don\'t forget your dentist at 10am today', timestamp: ts(60) },
  { id: 'm6', senderId: 'kid-1',    text: 'Aww do I have to 😭',                   timestamp: ts(58) },
  { id: 'm7', senderId: 'parent-2', text: 'Yes! Finish your quests first and you get extra coins 🪙', timestamp: ts(55) },
  { id: 'm8', senderId: 'kid-1',    text: 'Deal! 🤝',                              timestamp: ts(54), reactions: { '😂': ['parent-1'] } },
  { id: 'm9', senderId: 'parent-1', text: 'Family game night tonight at 7! 🎮',   timestamp: ts(10) },
];

const save = (messages: ChatMessage[]) => AsyncStorage.setItem(KEY, JSON.stringify(messages));

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  loaded: false,

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const messages = raw ? JSON.parse(raw) as ChatMessage[] : SEED;
      if (!raw) save(SEED);
      set({ messages, loaded: true });
    } catch { set({ messages: SEED, loaded: true }); }
  },

  sendMessage: (senderId, text) => {
    const msg: ChatMessage = { id: 'm' + Date.now(), senderId, text, timestamp: new Date().toISOString() };
    const next = [...get().messages, msg];
    set({ messages: next }); save(next);
  },

  addReaction: (messageId, emoji, memberId) => {
    const next = get().messages.map(m => {
      if (m.id !== messageId) return m;
      const reactions = { ...(m.reactions ?? {}) };
      const existing = reactions[emoji] ?? [];
      if (existing.includes(memberId)) {
        reactions[emoji] = existing.filter(id => id !== memberId);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...existing, memberId];
      }
      return { ...m, reactions };
    });
    set({ messages: next }); save(next);
  },

  deleteMessage: (id) => {
    const next = get().messages.filter(m => m.id !== id);
    set({ messages: next }); save(next);
  },
}));
