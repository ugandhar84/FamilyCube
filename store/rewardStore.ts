import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type RewardCategory = 'Screen Time' | 'Food' | 'Activity' | 'Shopping' | 'Special' | 'Experience';
export type RedemptionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Reward {
  id:                string;
  title:             string;
  emoji:             string;
  description?:      string;
  category:          RewardCategory;
  cost:              number;          // coins price
  stock?:            number;          // undefined = unlimited
  available:         boolean;
  eligibleMemberIds?: string[];       // if set, only these members can redeem
  maxPerMember?:     number;          // redemption cap per member
  expiresAt?:        string;          // ISO — auto-hides after date
  iconColor?:        string;          // optional custom accent color
  requiresApproval:  boolean;         // false = auto-approve on claim
  createdAt:         string;
  createdById?:      string;
}

export interface Redemption {
  id:            string;
  rewardId:      string;
  memberId:      string;
  redeemedAt:    string;
  status:        RedemptionStatus;
  deductedCoins: number;     // snapshot of cost at time of redemption
  wallet?:       'mainCoins' | 'gpCoins'; // which jar was actually debited — needed to refund on reject/cancel
  approvedBy?:   string;     // parent memberId
  rejectedBy?:   string;
  note?:         string;     // parent comment
  respondedAt?:  string;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface RewardState {
  rewards:      Reward[];
  redemptions:  Redemption[];
  loaded:       boolean;

  loadFromStorage:         () => Promise<void>;
  syncFromDB:              () => Promise<void>;

  addReward:               (r: Omit<Reward, 'id' | 'createdAt'>) => Reward;
  updateReward:            (id: string, updates: Partial<Omit<Reward, 'id' | 'createdAt'>>) => void;
  deleteReward:            (id: string) => void;
  toggleAvailability:      (id: string) => void;

  redeemReward:            (rewardId: string, memberId: string, wallet?: 'mainCoins' | 'gpCoins') => boolean; // returns false if ineligible
  approveRedemption:       (id: string, approverId: string, note?: string) => void;
  rejectRedemption:        (id: string, rejectorId: string, note?: string) => void;
  cancelRedemption:        (id: string) => void;
  deleteRedemption:        (id: string) => void;

  // Helpers
  getEligibleRewards:      (memberId: string) => Reward[];
  getRedemptionsForMember: (memberId: string) => Redemption[];
  getPendingRedemptions:   () => Redemption[];
  memberRedemptionCount:   (rewardId: string, memberId: string) => number;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

const SEED_REWARDS: Reward[] = [
  { id: 'r1',  title: '30 min Extra Screen Time', emoji: '📱', cost: 50,  category: 'Screen Time',  available: true, requiresApproval: false, createdAt: now },
  { id: 'r2',  title: 'Movie Night Pick',          emoji: '🎬', cost: 80,  category: 'Activity',     available: true, requiresApproval: true,  createdAt: now },
  { id: 'r3',  title: 'Ice Cream Trip',            emoji: '🍦', cost: 100, category: 'Food',         available: true, requiresApproval: true,  createdAt: now },
  { id: 'r4',  title: 'Stay Up 1hr Late',          emoji: '🌙', cost: 120, category: 'Special',      available: true, requiresApproval: true,  maxPerMember: 3, createdAt: now },
  { id: 'r5',  title: 'Pizza for Dinner',          emoji: '🍕', cost: 150, category: 'Food',         available: true, requiresApproval: true,  createdAt: now },
  { id: 'r6',  title: 'New Game / App',            emoji: '🎮', cost: 200, category: 'Shopping',     available: true, requiresApproval: true,  createdAt: now },
  { id: 'r7',  title: 'Skip One Chore (1 time)',   emoji: '🎫', cost: 80,  category: 'Special',      available: true, requiresApproval: false, stock: 2, maxPerMember: 1, createdAt: now },
  { id: 'r8',  title: 'Friend Sleepover',          emoji: '🛏️', cost: 300, category: 'Experience',   available: true, requiresApproval: true,  createdAt: now },
  { id: 'r9',  title: 'Toy Store Trip',            emoji: '🧸', cost: 400, category: 'Shopping',     available: true, requiresApproval: true,  createdAt: now },
  { id: 'r10', title: 'Extra YouTube Time',        emoji: '▶️', cost: 60,  category: 'Screen Time',  available: true, requiresApproval: false, createdAt: now },
  { id: 'r11', title: 'Choose Family Dinner Spot', emoji: '🍽️', cost: 180, category: 'Experience',   available: true, requiresApproval: true,  createdAt: now },
  { id: 'r12', title: 'Canteen / Lunch Money $5',  emoji: '💵', cost: 100, category: 'Food',         available: true, requiresApproval: true,  maxPerMember: 4, createdAt: now },
];

// ─── Persistence ──────────────────────────────────────────────────────────────

const REWARDS_KEY     = '@familycube_rewards_v2';
const REDEMPTIONS_KEY = '@familycube_redemptions_v2';

async function notifyReward(memberId: string, type: string, payload: Record<string, unknown>) {
  try {
    const { data } = await supabase.from('members').select('family_id').eq('id', memberId).single();
    const familyId = data?.family_id;
    if (!familyId) return;
    supabase.functions
      .invoke('family-notifier', { body: { type, familyId, payload, persist: true } })
      .catch(e => console.warn('[rewardStore] notify failed:', e?.message));
  } catch (e: any) {
    console.warn('[rewardStore] notify error:', e?.message);
  }
}

const save = (rewards: Reward[], redemptions: Redemption[]) => {
  AsyncStorage.setItem(REWARDS_KEY,     JSON.stringify(rewards));
  AsyncStorage.setItem(REDEMPTIONS_KEY, JSON.stringify(redemptions));
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRewardStore = create<RewardState>((set, get) => ({
  rewards:     [],
  redemptions: [],
  loaded:      false,

  loadFromStorage: async () => {
    try {
      const [rRaw, rdRaw] = await Promise.all([
        AsyncStorage.getItem(REWARDS_KEY),
        AsyncStorage.getItem(REDEMPTIONS_KEY),
      ]);
      const rewards     = rRaw  ? (JSON.parse(rRaw)  as Reward[])     : SEED_REWARDS;
      const redemptions = rdRaw ? (JSON.parse(rdRaw) as Redemption[]) : [];
      if (!rRaw) AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(SEED_REWARDS));
      set({ rewards, redemptions, loaded: true });
    } catch {
      set({ rewards: SEED_REWARDS, redemptions: [], loaded: true });
    }
  },

  syncFromDB: async () => {
    try {
      const [{ data: rData }, { data: rdData }] = await Promise.all([
        supabase.from('rewards').select('*').order('created_at'),
        supabase.from('redemptions').select('*').order('redeemed_at', { ascending: false }),
      ]);
      if (rData && rData.length > 0) {
        const rewards     = rData.map(rewardFromRow);
        const redemptions = rdData ? rdData.map(redemptionFromRow) : get().redemptions;
        set({ rewards, redemptions });
        save(rewards, redemptions);
      }
    } catch {}
  },

  addReward: (r) => {
    const reward: Reward = { ...r, id: 'r' + Date.now(), createdAt: new Date().toISOString() };
    const next = [...get().rewards, reward];
    set({ rewards: next }); save(next, get().redemptions);
    supabase.from('rewards').insert([rewardToRow(reward)]).then(() => {});
    return reward;
  },

  updateReward: (id, updates) => {
    const next = get().rewards.map(r => r.id === id ? { ...r, ...updates } : r);
    set({ rewards: next }); save(next, get().redemptions);
    const updated = next.find(r => r.id === id);
    if (updated) supabase.from('rewards').update(rewardToRow(updated)).eq('id', id).then(() => {});
  },

  deleteReward: (id) => {
    const nextR  = get().rewards.filter(r => r.id !== id);
    const nextRd = get().redemptions.filter(rd => rd.rewardId !== id);
    set({ rewards: nextR, redemptions: nextRd }); save(nextR, nextRd);
    supabase.from('rewards').delete().eq('id', id).then(() => {});
  },

  toggleAvailability: (id) => {
    const next = get().rewards.map(r => r.id === id ? { ...r, available: !r.available } : r);
    set({ rewards: next }); save(next, get().redemptions);
  },

  redeemReward: (rewardId, memberId, wallet) => {
    const reward = get().rewards.find(r => r.id === rewardId);
    if (!reward || !reward.available) return false;
    if (reward.expiresAt && reward.expiresAt < new Date().toISOString()) return false;
    if (reward.eligibleMemberIds && !reward.eligibleMemberIds.includes(memberId)) return false;
    if (reward.maxPerMember !== undefined) {
      const count = get().memberRedemptionCount(rewardId, memberId);
      if (count >= reward.maxPerMember) return false;
    }
    if (reward.stock !== undefined && reward.stock <= 0) return false;

    const redemption: Redemption = {
      id: 'rd' + Date.now(), rewardId, memberId,
      redeemedAt: new Date().toISOString(),
      status: reward.requiresApproval ? 'pending' : 'approved',
      deductedCoins: reward.cost,
      // Recorded so a later reject/cancel can refund the correct jar — see
      // rejectRedemption/cancelRedemption. Caller (StoreScreen) already
      // knows which wallet it called deductCoins with; without this, a
      // declined "pending approval" redemption permanently lost the coins
      // (deductCoins fires at request time, not at approval time) with no
      // way to know which jar to credit back.
      wallet,
      ...(reward.requiresApproval ? {} : { respondedAt: new Date().toISOString() }),
    };

    // Decrement stock if limited
    const nextRewards = reward.stock !== undefined
      ? get().rewards.map(r => r.id === rewardId ? { ...r, stock: (r.stock ?? 1) - 1 } : r)
      : get().rewards;

    const nextRd = [...get().redemptions, redemption];
    set({ rewards: nextRewards, redemptions: nextRd });
    save(nextRewards, nextRd);
    if (reward.requiresApproval) {
      notifyReward(memberId, 'reward_redeemed', {
        redemptionId: redemption.id, rewardId, rewardTitle: reward.title,
        rewardEmoji: reward.emoji, cost: reward.cost, memberId,
      });
    }
    return true;
  },

  approveRedemption: (id, approverId, note) => {
    const now = new Date().toISOString();
    const rd = get().redemptions.find(r => r.id === id);
    const nextRd = get().redemptions.map(r =>
      r.id === id ? { ...r, status: 'approved' as RedemptionStatus, approvedBy: approverId, note, respondedAt: now } : r
    );
    set({ redemptions: nextRd }); save(get().rewards, nextRd);
    if (rd) {
      const reward = get().rewards.find(r => r.id === rd.rewardId);
      notifyReward(rd.memberId, 'reward_decision', {
        redemptionId: id, rewardTitle: reward?.title ?? '', rewardEmoji: reward?.emoji ?? '🎁',
        decision: 'approved', note, memberId: rd.memberId,
      });
    }
  },

  rejectRedemption: (id, rejectorId, note) => {
    // Spec (8.3): a declined redemption must not permanently cost the kid
    // their coins. deductCoins fires at *request* time (StoreScreen.redeemFrom),
    // not at approval time, so a decline here must explicitly refund the same
    // wallet the redemption was originally debited from — previously this
    // function only restored `stock`, never the coins, so a rejected
    // redemption silently vaporized the kid's balance with no way to get it
    // back. Also fixes a dead-code bug: the old stock-restore branch did an
    // early `return` before the notifyReward call below ever ran, so any
    // stock-limited reward's rejection notification was silently skipped.
    const now = new Date().toISOString();
    const rd = get().redemptions.find(r => r.id === id);
    if (!rd) return;
    const nextRd = get().redemptions.map(r =>
      r.id === id ? { ...r, status: 'rejected' as RedemptionStatus, rejectedBy: rejectorId, note, respondedAt: now } : r
    );
    const reward = get().rewards.find(r => r.id === rd.rewardId);
    const nextR = reward?.stock !== undefined
      ? get().rewards.map(r => r.id === rd.rewardId ? { ...r, stock: (r.stock ?? 0) + 1 } : r)
      : get().rewards;
    set({ rewards: nextR, redemptions: nextRd }); save(nextR, nextRd);
    if (rd.deductedCoins > 0) {
      useFamilyStore.getState().awardCoins(rd.memberId, rd.deductedCoins, rd.wallet ?? 'mainCoins');
    }
    notifyReward(rd.memberId, 'reward_decision', {
      redemptionId: id, rewardTitle: reward?.title ?? '', rewardEmoji: reward?.emoji ?? '🎁',
      decision: 'rejected', note, memberId: rd.memberId,
    });
  },

  cancelRedemption: (id) => {
    // Same refund logic as rejectRedemption — cancelling a still-pending
    // request must give back the reserved coins, not just flip the status.
    const rd = get().redemptions.find(r => r.id === id);
    const nextRd = get().redemptions.map(r =>
      r.id === id ? { ...r, status: 'cancelled' as RedemptionStatus, respondedAt: new Date().toISOString() } : r
    );
    set({ redemptions: nextRd }); save(get().rewards, nextRd);
    if (rd && rd.status === 'pending' && rd.deductedCoins > 0) {
      useFamilyStore.getState().awardCoins(rd.memberId, rd.deductedCoins, rd.wallet ?? 'mainCoins');
    }
  },

  deleteRedemption: (id) => {
    const nextRd = get().redemptions.filter(rd => rd.id !== id);
    set({ redemptions: nextRd }); save(get().rewards, nextRd);
  },

  // ─── Selectors ───────────────────────────────────────────────────────────────

  getEligibleRewards: (memberId) => {
    const now = new Date().toISOString();
    return get().rewards.filter(r => {
      if (!r.available) return false;
      if (r.expiresAt && r.expiresAt < now) return false;
      if (r.stock !== undefined && r.stock <= 0) return false;
      if (r.eligibleMemberIds && !r.eligibleMemberIds.includes(memberId)) return false;
      if (r.maxPerMember !== undefined && get().memberRedemptionCount(r.id, memberId) >= r.maxPerMember) return false;
      return true;
    });
  },

  getRedemptionsForMember: (memberId) =>
    get().redemptions.filter(rd => rd.memberId === memberId),

  getPendingRedemptions: () =>
    get().redemptions.filter(rd => rd.status === 'pending'),

  memberRedemptionCount: (rewardId, memberId) =>
    get().redemptions.filter(rd =>
      rd.rewardId === rewardId && rd.memberId === memberId && rd.status !== 'rejected' && rd.status !== 'cancelled'
    ).length,
}));

// ─── DB row mappers ───────────────────────────────────────────────────────────

function rewardToRow(r: Reward) {
  return {
    id: r.id, title: r.title, emoji: r.emoji, description: r.description ?? null,
    category: r.category, cost: r.cost, stock: r.stock ?? null, available: r.available,
    eligible_member_ids: r.eligibleMemberIds ?? null, max_per_member: r.maxPerMember ?? null,
    expires_at: r.expiresAt ?? null, icon_color: r.iconColor ?? null,
    requires_approval: r.requiresApproval, created_at: r.createdAt, created_by_id: r.createdById ?? null,
  };
}

function rewardFromRow(row: any): Reward {
  return {
    id: String(row.id), title: row.title, emoji: row.emoji, description: row.description ?? undefined,
    category: row.category ?? 'Special', cost: row.cost ?? 0,
    stock: row.stock ?? undefined, available: Boolean(row.available),
    eligibleMemberIds: row.eligible_member_ids ?? undefined, maxPerMember: row.max_per_member ?? undefined,
    expiresAt: row.expires_at ?? undefined, iconColor: row.icon_color ?? undefined,
    requiresApproval: Boolean(row.requires_approval ?? true),
    createdAt: row.created_at, createdById: row.created_by_id ? String(row.created_by_id) : undefined,
  };
}

function redemptionFromRow(row: any): Redemption {
  return {
    id: String(row.id), rewardId: String(row.reward_id), memberId: String(row.member_id),
    redeemedAt: row.redeemed_at, status: row.status ?? 'pending',
    deductedCoins: row.deducted_coins ?? 0,
    wallet: row.wallet === 'gpCoins' ? 'gpCoins' : row.wallet === 'mainCoins' ? 'mainCoins' : undefined,
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    rejectedBy: row.rejected_by ? String(row.rejected_by) : undefined,
    note: row.note ?? undefined, respondedAt: row.responded_at ?? undefined,
  };
}
