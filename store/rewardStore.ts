import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';

// ─── Realtime subscription ─────────────────────────────────────────────────
// Mirrors familyStore.ts's ensureRealtime pattern. reward_redemptions has no
// family_id column of its own (confirmed via information_schema, same
// situation choreStore.ts's parent_quest_assignments handler already
// documents) — RLS is relied on to only deliver rows the client is
// authorized to see, same trust boundary syncFromDB's own unfiltered select
// on this table already uses. Without this, a redemption request/approval/
// decline made on one device was invisible on every other family member's
// device until a full app restart re-ran syncFromDB — the same class of gap
// V-A3/V-A4/V-A5 fixed for member balances, kid requests, and System-A
// negotiation state earlier this session.
let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtSubscribed = false;

function ensureRealtime(setState: (s: Partial<RewardState>) => void, getState: () => RewardState) {
  if (_rtSubscribed && _rtChannel) return;
  if (_rtChannel) {
    supabase.removeChannel(_rtChannel);
    _rtChannel = null;
  }
  const staleTopic = 'realtime:reward_redemptions';
  const stale = supabase.getChannels().filter(c => c.topic === staleTopic);
  if (stale.length > 0) stale.forEach(c => supabase.removeChannel(c));
  _rtSubscribed = true;

  try {
    _rtChannel = supabase
      .channel('reward_redemptions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reward_redemptions' },
        ({ eventType, new: newRow, old: oldRow }) => {
          const state = getState();
          if (eventType === 'INSERT') {
            const rd = redemptionFromRow(newRow);
            if (state.redemptions.some(r => r.id === rd.id)) return;
            const all = [rd, ...state.redemptions];
            setState({ redemptions: all });
            save(state.rewards, all);
          } else if (eventType === 'UPDATE') {
            const updated = redemptionFromRow(newRow);
            const all = state.redemptions.map(r => r.id === updated.id ? updated : r);
            setState({ redemptions: all });
            save(state.rewards, all);
          } else if (eventType === 'DELETE') {
            const all = state.redemptions.filter(r => r.id !== String((oldRow as any).id));
            setState({ redemptions: all });
            save(state.rewards, all);
          }
        })
      .subscribe((status) => {
        console.log(`[rewardStore] realtime reward_redemptions subscribe status=${status}`);
        // Same fix as choreStore.ts's/eventStore.ts's ensureRealtime — the
        // guard above only checks "does _rtChannel exist," never "is it
        // actually connected," so a socket killed by backgrounding would
        // leave _rtChannel non-null but dead forever, blocking every later
        // ensureRealtime() call from resubscribing. Clearing on a terminal
        // bad status makes the next call actually reconnect. Matters more
        // now that syncFromDB() (and therefore this channel) actually runs
        // — see loadFromStorage's own comment for why it didn't before.
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[rewardStore] realtime reward_redemptions unhealthy (${status}) — clearing so the next sync resubscribes`);
          _rtSubscribed = false; _rtChannel = null;
        }
      });
  } catch (e: any) {
    console.warn('[rewardStore] ensureRealtime subscribe failed', e?.message ?? e);
  }
}

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
  updatedAt?:        string;          // set on every updateReward() call, undefined until first edit
  updatedById?:      string;          // memberId of whoever last edited this perk
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
  updateReward:            (id: string, updates: Partial<Omit<Reward, 'id' | 'createdAt'>>, actingMemberId?: string) => void;
  deleteReward:            (id: string) => void;
  toggleAvailability:      (id: string, actingMemberId?: string) => void;

  // Now async — redeem_reward is a real atomic RPC (row-locked eligibility
  // check + stock decrement + insert in one transaction), not a client-side
  // check-then-write. Returns false if ineligible OR if the RPC's own
  // authoritative check rejects it (e.g. someone else claimed the last
  // stock a moment earlier) — either way, no local state is guessed at
  // before the server confirms.
  redeemReward:            (rewardId: string, memberId: string, wallet?: 'mainCoins' | 'gpCoins') => Promise<boolean>;
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

// Recipients for a perk-catalog change: whoever could actually redeem it —
// eligibleMemberIds if the reward is restricted, otherwise every kid/teen
// in the family (parents don't redeem rewards themselves, so they're never
// a recipient here regardless of who made the change).
function perkAudienceIds(reward: { eligibleMemberIds?: string[] }, excludeMemberId?: string): string[] {
  const members = useFamilyStore.getState().members;
  const pool = reward.eligibleMemberIds?.length
    ? members.filter(m => reward.eligibleMemberIds!.includes(m.id))
    : members.filter(m => m.role !== 'parent');
  return pool.filter(m => m.id !== excludeMemberId).map(m => m.id);
}

function notifyPerkUpdated(reward: Reward, change: 'price' | 'available' | 'unavailable' | 'other', actingMemberId?: string) {
  const familyId = getFamilyId();
  const memberIds = perkAudienceIds(reward, actingMemberId);
  if (!familyId || !memberIds.length) return;
  supabase.functions.invoke('family-notifier', {
    body: {
      type: 'perk_updated', familyId, memberIds, persist: true,
      excludeMemberId: actingMemberId,
      payload: { rewardId: reward.id, rewardTitle: reward.title, change, cost: reward.cost },
    },
  }).catch(e => console.warn('[rewardStore] perk notify failed:', e?.message));
}

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

// Same getFamilyId() pattern eventStore.ts/choreStore.ts use — the rewards
// table (unlike reward_redemptions) has a real family_id column, since a
// reward isn't inherently scoped to one member the way a redemption is.
function getFamilyId(): string | null {
  const s = useFamilyStore.getState();
  const m = s.members.find(mem => mem.id === s.activeMemberId) ?? s.members[0];
  return (m as any)?.familyId ?? null;
}

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
    // Was: cache-only — every single call site across the app (HubScreen,
    // StoreScreen) only ever calls loadFromStorage(), and syncFromDB (the
    // only thing that reads rewards/reward_redemptions from Supabase, and
    // the only thing that calls ensureRealtime — see this file's own
    // ensureRealtime doc comment above) was never invoked from anywhere in
    // the app at all. Confirmed via a full-codebase search: nothing calls
    // it. So beyond the seeded defaults, the reward catalog and every
    // redemption ever made were only ever visible on the ONE device that
    // happened to create them (persisted to that device's own AsyncStorage
    // only) — a reward a parent added, or a redemption a kid requested, was
    // invisible on every other family member's device, forever, with no
    // realtime channel ever even subscribing. Same cache-first-then-
    // background-sync shape helpStore.ts's loadFromStorage already
    // documents as "the pattern" for this codebase; wiring it in here too.
    get().syncFromDB();
  },

  syncFromDB: async () => {
    try {
      const [{ data: rData }, { data: rdData }] = await Promise.all([
        supabase.from('rewards').select('*').order('created_at'),
        // Unbounded before — every redemption ever requested, across a
        // family's whole lifetime, loaded on every sync. Capped same as
        // choreStore's point_transactions/parent_quest_assignments queries.
        supabase.from('reward_redemptions').select('*').order('requested_at', { ascending: false }).limit(200),
      ]);
      if (rData && rData.length > 0) {
        const rewards     = rData.map(rewardFromRow);
        const redemptions = rdData ? rdData.map(redemptionFromRow) : get().redemptions;
        set({ rewards, redemptions });
        save(rewards, redemptions);
      }
      ensureRealtime(set, get);
    } catch {}
  },

  addReward: (r) => {
    const reward: Reward = { ...r, id: 'r' + Date.now(), createdAt: new Date().toISOString() };
    const next = [...get().rewards, reward];
    set({ rewards: next }); save(next, get().redemptions);
    // Was a bare .then(() => {}) — silently swallowed the 42P01 "relation
    // rewards does not exist" error that made every reward-catalog write
    // permanently no-op against production (QA sweep, live-DB
    // verification). Now surfaced the same way every other store's writes
    // already report failures.
    supabase.from('rewards').insert([rewardToRow(reward)])
      .then(({ error }) => { if (error) console.warn('[rewardStore] addReward insert', error.message); });
    return reward;
  },

  updateReward: (id, updates, actingMemberId) => {
    const prev = get().rewards.find(r => r.id === id);
    // Stamp who/when on every real edit — the Store perk detail sheet's
    // "last updated by X" line reads this. Not stamped for toggleAvailability
    // below (a separate, lighter-weight action) since that already has its
    // own dedicated function; this covers PerkModal's actual edit form.
    const stamped = { ...updates, updatedAt: new Date().toISOString(), updatedById: actingMemberId };
    const next = get().rewards.map(r => r.id === id ? { ...r, ...stamped } : r);
    set({ rewards: next }); save(next, get().redemptions);
    const updated = next.find(r => r.id === id);
    if (updated) {
      supabase.from('rewards').update(rewardToRow(updated)).eq('id', id)
        .then(({ error }) => { if (error) console.warn('[rewardStore] updateReward', error.message); });

      // Only a genuinely perk-affecting change is worth interrupting a kid
      // for — cost or availability, not a wording/emoji tweak. Was: this
      // whole action notified no one at all; a kid had no way to know a
      // perk they were saving up for changed price, short of reopening the
      // Store tab.
      if (prev && updated.available) {
        if (typeof updates.cost === 'number' && updates.cost !== prev.cost) {
          notifyPerkUpdated(updated, 'price', actingMemberId);
        } else if (updates.available === true && prev.available === false) {
          notifyPerkUpdated(updated, 'available', actingMemberId);
        }
      }
    }
  },

  deleteReward: (id) => {
    const reward = get().rewards.find(r => r.id === id);
    // Was: silently dropped any in-flight redemption of this reward from
    // local state along with the catalog row, with no refund and no word
    // to the kid — a kid who redeemed something a parent then deletes from
    // the store (StoreScreen.tsx's PerkModal onDelete) lost both the reward
    // AND the coins they paid for it, with zero visibility into why it
    // vanished. Only 'pending' redemptions get refunded here, same rule
    // rejectRedemption/cancelRedemption already use — an 'approved'
    // redemption means the reward was already granted/is being fulfilled
    // outside the app, so refunding it on top of that would be wrong.
    const affectedPending = get().redemptions.filter(rd => rd.rewardId === id && rd.status === 'pending');
    const nextR  = get().rewards.filter(r => r.id !== id);
    const nextRd = get().redemptions.filter(rd => rd.rewardId !== id);
    set({ rewards: nextR, redemptions: nextRd }); save(nextR, nextRd);
    supabase.from('rewards').delete().eq('id', id)
      .then(({ error }) => { if (error) console.warn('[rewardStore] deleteReward', error.message); });
    for (const rd of affectedPending) {
      if (rd.deductedCoins > 0) {
        useFamilyStore.getState().awardCoins(rd.memberId, rd.deductedCoins, rd.wallet ?? 'mainCoins');
      }
      notifyReward(rd.memberId, 'reward_removed', {
        redemptionId: rd.id, rewardTitle: reward?.title ?? '', rewardEmoji: reward?.emoji ?? '🎁',
        cost: rd.deductedCoins, memberId: rd.memberId,
      });
    }
  },

  toggleAvailability: (id, actingMemberId) => {
    const prev = get().rewards.find(r => r.id === id);
    const next = get().rewards.map(r => r.id === id ? { ...r, available: !r.available } : r);
    set({ rewards: next }); save(next, get().redemptions);
    const updated = next.find(r => r.id === id);
    if (prev && updated) {
      notifyPerkUpdated(updated, updated.available ? 'available' : 'unavailable', actingMemberId);
    }
  },

  redeemReward: async (rewardId, memberId, wallet) => {
    const reward = get().rewards.find(r => r.id === rewardId);
    if (!reward) return false;
    // Cheap client-side pre-checks stay as an early bail for obviously-bad
    // calls (skip a network round trip for a reward that's plainly
    // unavailable) — but they are NOT the actual guard against a double-
    // redeem race; redeem_reward's own row lock is. Every check that
    // matters for correctness is re-verified server-side inside the RPC.
    if (!reward.available) return false;
    if (reward.expiresAt && reward.expiresAt < new Date().toISOString()) return false;
    if (reward.eligibleMemberIds && !reward.eligibleMemberIds.includes(memberId)) return false;

    const { data, error } = await supabase.rpc('redeem_reward', {
      p_reward_id: rewardId,
      p_member_id: memberId,
      p_wallet: wallet ?? null,
    });
    if (error) {
      // Expected failures (out of stock, max reached, expired, not
      // eligible) surface here as a normal RPC error — the caller (e.g.
      // StoreScreen.redeemFrom) already shows an "Unable to Redeem" alert
      // on a false return, same UX as before, just now backed by an
      // authoritative server check instead of a guessable client one.
      console.warn('[rewardStore] redeem_reward RPC failed', error.message);
      return false;
    }
    const redemptionId = Array.isArray(data) ? data[0]?.redemption_id : data?.redemption_id;
    if (!redemptionId) return false;

    // Local state is now a reflection of what the server already committed
    // (not a guess made ahead of it) — safe to apply optimistically since
    // the RPC already succeeded by this point. The realtime subscription
    // above will also independently pick up the INSERT and no-op here via
    // its own `some(r => r.id === rd.id)` de-dupe guard.
    const redemption: Redemption = {
      id: redemptionId, rewardId, memberId,
      redeemedAt: new Date().toISOString(),
      status: reward.requiresApproval ? 'pending' : 'approved',
      deductedCoins: reward.cost,
      wallet,
      ...(reward.requiresApproval ? {} : { respondedAt: new Date().toISOString() }),
    };
    const nextRewards = reward.stock !== undefined
      ? get().rewards.map(r => r.id === rewardId ? { ...r, stock: Math.max(0, (r.stock ?? 1) - 1) } : r)
      : get().rewards;
    const nextRd = get().redemptions.some(r => r.id === redemptionId)
      ? get().redemptions
      : [...get().redemptions, redemption];
    set({ rewards: nextRewards, redemptions: nextRd });
    save(nextRewards, nextRd);

    if (reward.requiresApproval) {
      notifyReward(memberId, 'reward_redeemed', {
        redemptionId, rewardId, rewardTitle: reward.title,
        rewardEmoji: reward.emoji, cost: reward.cost, memberId,
      });
    }
    return true;
  },

  approveRedemption: (id, approverId, note) => {
    const now = new Date().toISOString();
    const rd = get().redemptions.find(r => r.id === id);
    // Was missing a status guard (unlike cancelRedemption, which already
    // checks status === 'pending') — a co-parent approving/declining a
    // redemption their partner already acted on moments earlier, from a
    // stale pre-realtime-update card, could double-refund or contradict an
    // already-fulfilled decision (QA sweep, parent-role audit, Medium M2).
    if (!rd || rd.status !== 'pending') return;
    const nextRd = get().redemptions.map(r =>
      r.id === id ? { ...r, status: 'approved' as RedemptionStatus, approvedBy: approverId, note, respondedAt: now } : r
    );
    set({ redemptions: nextRd }); save(get().rewards, nextRd);
    // reward_redemptions has no rejected_by/note/responded_at columns —
    // approved_by isn't tracked server-side either, only the timestamp and
    // status. approvedBy/note stay local-only (same limitation the DB
    // schema already has), same as before this fix; not silently inventing
    // new columns here.
    supabase.from('reward_redemptions').update({ status: 'approved', approved_at: now }).eq('id', id)
      .then(({ error }) => { if (error) console.warn('[rewardStore] approveRedemption update', error.message); });
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
    // Same status guard as approveRedemption above — without it a
    // co-parent could refund coins for a redemption already approved (or
    // already rejected) on another device.
    if (!rd || rd.status !== 'pending') return;
    const nextRd = get().redemptions.map(r =>
      r.id === id ? { ...r, status: 'rejected' as RedemptionStatus, rejectedBy: rejectorId, note, respondedAt: now } : r
    );
    const reward = get().rewards.find(r => r.id === rd.rewardId);
    const nextR = reward?.stock !== undefined
      ? get().rewards.map(r => r.id === rd.rewardId ? { ...r, stock: (r.stock ?? 0) + 1 } : r)
      : get().rewards;
    set({ rewards: nextR, redemptions: nextRd }); save(nextR, nextRd);
    supabase.from('reward_redemptions').update({ status: 'declined', declined_at: now, declined_reason: note ?? null }).eq('id', id)
      .then(({ error }) => { if (error) console.warn('[rewardStore] rejectRedemption update', error.message); });
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
    // No dedicated "cancelled" value exists in reward_redemptions.status —
    // stored as 'declined' server-side (same as reject) with the reason
    // noting it was self-cancelled, since local Redemption.status keeps its
    // own richer 'cancelled' distinction for the UI.
    const now = new Date().toISOString();
    const rd = get().redemptions.find(r => r.id === id);
    const nextRd = get().redemptions.map(r =>
      r.id === id ? { ...r, status: 'cancelled' as RedemptionStatus, respondedAt: now } : r
    );
    set({ redemptions: nextRd }); save(get().rewards, nextRd);
    supabase.from('reward_redemptions').update({ status: 'declined', declined_at: now, declined_reason: 'Cancelled by requester' }).eq('id', id)
      .then(({ error }) => { if (error) console.warn('[rewardStore] cancelRedemption update', error.message); });
    if (rd && rd.status === 'pending' && rd.deductedCoins > 0) {
      useFamilyStore.getState().awardCoins(rd.memberId, rd.deductedCoins, rd.wallet ?? 'mainCoins');
    }
  },

  deleteRedemption: (id) => {
    const nextRd = get().redemptions.filter(rd => rd.id !== id);
    set({ redemptions: nextRd }); save(get().rewards, nextRd);
    supabase.from('reward_redemptions').delete().eq('id', id)
      .then(({ error }) => { if (error) console.warn('[rewardStore] deleteRedemption', error.message); });
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
    id: r.id, family_id: getFamilyId(), title: r.title, emoji: r.emoji, description: r.description ?? null,
    category: r.category, cost: r.cost, stock: r.stock ?? null, available: r.available,
    eligible_member_ids: r.eligibleMemberIds ?? null, max_per_member: r.maxPerMember ?? null,
    expires_at: r.expiresAt ?? null, icon_color: r.iconColor ?? null,
    requires_approval: r.requiresApproval, created_at: r.createdAt, created_by_id: r.createdById ?? null,
    updated_at: r.updatedAt ?? null, updated_by_id: r.updatedById ?? null,
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
    updatedAt: row.updated_at ?? undefined, updatedById: row.updated_by_id ? String(row.updated_by_id) : undefined,
  };
}

// The live table is `reward_redemptions`, not `redemptions` — a prior pass
// wrote this mapper (and the equivalent insert calls below) against a
// hypothetical schema that was never actually deployed; syncFromDB's read
// silently returned nothing as a result. Real columns (confirmed via
// information_schema): id, reward_id, reward_title, coin_cost, member_id,
// member_name, status, requested_at, created_at, screen_time_code,
// declined_reason, declined_at, approved_at, wallet (added by this pass's
// migration). There is no rejected_by/note/responded_at column — status
// transitions are tracked only via approved_at/declined_at timestamps, and
// "who approved/rejected" and any parent note are not currently persisted
// server-side (local-only, same limitation as before this fix — flagged,
// not silently invented as a new column here).
function redemptionFromRow(row: any): Redemption {
  return {
    id: String(row.id), rewardId: String(row.reward_id), memberId: String(row.member_id ?? ''),
    redeemedAt: row.requested_at ?? row.created_at ?? new Date().toISOString(),
    status: row.status === 'declined' ? 'rejected' : (row.status ?? 'pending'),
    deductedCoins: row.coin_cost ?? 0,
    wallet: row.wallet === 'gpCoins' ? 'gpCoins' : row.wallet === 'mainCoins' ? 'mainCoins' : undefined,
    respondedAt: row.approved_at ?? row.declined_at ?? undefined,
    note: row.declined_reason ?? undefined,
  };
}
