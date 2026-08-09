import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Reward {
  id: string;
  title: string;
  emoji: string;
  cost: number;
  description?: string;
  category: 'Screen Time' | 'Food' | 'Activity' | 'Shopping' | 'Special';
  stock?: number;      // undefined = unlimited
  available: boolean;
}

export interface Redemption {
  id: string;
  rewardId: string;
  memberId: string;
  redeemedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface RewardState {
  rewards: Reward[];
  redemptions: Redemption[];
  loaded: boolean;
  loadFromStorage: () => Promise<void>;
  redeemReward: (rewardId: string, memberId: string) => void;
  approveRedemption: (id: string) => void;
  rejectRedemption: (id: string) => void;
  addReward: (r: Omit<Reward, 'id'>) => void;
  toggleRewardAvailability: (id: string) => void;
}

const REWARDS_KEY     = '@familycube_rewards';
const REDEMPTIONS_KEY = '@familycube_redemptions';

const SEED_REWARDS: Reward[] = [
  { id: 'r1',  title: '30 min Extra Screen Time', emoji: '📱', cost: 50,  category: 'Screen Time', available: true },
  { id: 'r2',  title: 'Movie Night Pick',          emoji: '🎬', cost: 80,  category: 'Activity',    available: true },
  { id: 'r3',  title: 'Ice Cream Trip 🍦',          emoji: '🍦', cost: 100, category: 'Food',        available: true },
  { id: 'r4',  title: 'Stay Up 1hr Late',          emoji: '🌙', cost: 120, category: 'Special',     available: true },
  { id: 'r5',  title: 'Pizza for Dinner',          emoji: '🍕', cost: 150, category: 'Food',        available: true },
  { id: 'r6',  title: 'New Game / App',             emoji: '🎮', cost: 200, category: 'Shopping',    available: true },
  { id: 'r7',  title: 'Skip One Chore (1 time)',   emoji: '🎫', cost: 80,  category: 'Special',     stock: 2, available: true },
  { id: 'r8',  title: 'Friend Sleepover',          emoji: '🛏️', cost: 300, category: 'Activity',    available: true },
  { id: 'r9',  title: 'Toy Store Trip',            emoji: '🧸', cost: 400, category: 'Shopping',    available: true },
  { id: 'r10', title: 'Extra YouTube Time',        emoji: '▶️', cost: 60,  category: 'Screen Time', available: true },
];

const save = (rewards: Reward[], redemptions: Redemption[]) => {
  AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(rewards));
  AsyncStorage.setItem(REDEMPTIONS_KEY, JSON.stringify(redemptions));
};

export const useRewardStore = create<RewardState>((set, get) => ({
  rewards: [],
  redemptions: [],
  loaded: false,

  loadFromStorage: async () => {
    try {
      const [rRaw, redRaw] = await Promise.all([
        AsyncStorage.getItem(REWARDS_KEY),
        AsyncStorage.getItem(REDEMPTIONS_KEY),
      ]);
      const rewards     = rRaw   ? JSON.parse(rRaw)   as Reward[]     : SEED_REWARDS;
      const redemptions = redRaw ? JSON.parse(redRaw) as Redemption[] : [];
      if (!rRaw) AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(SEED_REWARDS));
      set({ rewards, redemptions, loaded: true });
    } catch { set({ rewards: SEED_REWARDS, redemptions: [], loaded: true }); }
  },

  redeemReward: (rewardId, memberId) => {
    const red: Redemption = {
      id: 'rd' + Date.now(), rewardId, memberId,
      redeemedAt: new Date().toISOString(), status: 'pending',
    };
    const nextRed = [...get().redemptions, red];
    set({ redemptions: nextRed });
    save(get().rewards, nextRed);
  },

  approveRedemption: (id) => {
    const nextRed = get().redemptions.map(r => r.id === id ? { ...r, status: 'approved' as const } : r);
    set({ redemptions: nextRed }); save(get().rewards, nextRed);
  },

  rejectRedemption: (id) => {
    const nextRed = get().redemptions.map(r => r.id === id ? { ...r, status: 'rejected' as const } : r);
    set({ redemptions: nextRed }); save(get().rewards, nextRed);
  },

  addReward: (r) => {
    const reward: Reward = { ...r, id: 'r' + Date.now() };
    const next = [...get().rewards, reward];
    set({ rewards: next }); save(next, get().redemptions);
  },

  toggleRewardAvailability: (id) => {
    const next = get().rewards.map(r => r.id === id ? { ...r, available: !r.available } : r);
    set({ rewards: next }); save(next, get().redemptions);
  },
}));
