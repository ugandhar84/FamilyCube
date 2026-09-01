/**
 * choreStore — Manages the full chore system:
 * citizenship / routine / bounty / shopping / grandparent_quest / parent_only_quest
 * Plus point_transactions, badges, grandparent_matches, parent_quest_assignments.
 *
 * Pattern follows questStore: AsyncStorage cache + Supabase sync + realtime.
 */
import { create } from 'zustand';
import { logActivity, type ActivityAction } from '@/lib/activityLog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { todayLocal } from '@/lib/dates';

const genId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChoreCategoryType =
  | 'citizenship'        // 0 pts, unlocks daily bonus multiplier
  | 'routine'            // Standard recurring, base points
  | 'bounty'             // High-effort, first-come, premium points
  | 'shopping'           // Errand/shopping run — earns coins, receipt optional
  | 'grandparent_quest'  // Intergenerational, funded by grandparent
  | 'parent_only_quest'; // Adult logistics, 0 pts, invisible to kids/grandparents

export type ChoreStatus =
  | 'todo'                           // Pending; assigned; waiting for child
  | 'in_progress'                    // Bounty/GP quest marked started
  | 'pending_approval'               // Submitted; awaiting parent review
  | 'pending_grandparent_approval'   // GP quest done; awaiting grandparent review
  | 'pending_parent_approval'        // GP quest created; awaiting parent approve
  // Scenario 1.6 — a grandparent/senior tapped "I'll Handle It" on an
  // openToGP-flagged chore. Distinct from 'in_progress': nothing is
  // actually assigned yet — the offer sits here until a parent Accepts
  // (→ 'in_progress', assignedToId = the offering GP) or Declines
  // (→ back to 'todo', pool-visible again), or the GP Withdraws it
  // themselves (→ back to 'todo'). See claimGPErrand/acceptGPOffer/
  // declineGPOffer/withdrawGPOffer. Maps to 'pending_approval' in the
  // Quest-shim status space (choreAdapter.ts) so it rides the existing
  // pending-approval UI, but stays a distinct real ChoreStatus so
  // parent-facing UI (ChoreReviewSection.tsx) can filter specifically
  // for GP offers rather than lumping them in with kid submissions.
  | 'gp_offer_pending'
  // A KID (not teen/parent/senior) proposed this chore for themselves or
  // a sibling via KidSmartAskComposer — see propose_kid_chore RPC. Never a
  // real, live, claimable chore in this status; it only becomes one once
  // a parent Accepts (→ 'todo', assignedToId = whoever the kid picked,
  // coinsReward set by the parent at accept time) via approve_kid_chore.
  // Declined proposals are deleted outright (decline_kid_chore), not
  // soft-declined — a declined proposal was never a real chore.
  | 'pending_kid_proposal'
  // A parent changed coins/due_date on a chore that was already claimed
  // (status was 'in_progress') — see propose_terms_change RPC. Paused,
  // not submittable, until the claimant Accepts (→ 'in_progress' again,
  // same assignee) or Hands It Back (→ 'todo', released to the pool, no
  // reason required — the deal changed, not them). pendingTerms carries
  // the old/new values for the claimant's card to show without a second
  // round-trip.
  | 'terms_changed'
  // The assignee disputed a redo_requested decision — see dispute_redo RPC.
  // A DIFFERENT parent than the one who requested the redo reviews the
  // original submission (submissionPhotoUrl/submissionNote survive the
  // redo transition untouched) and either pays it out directly
  // (→ 'approved') or sides with the redo (→ back to 'redo_requested',
  // the kid still has to actually resubmit).
  | 'kid_disputed_redo'
  | 'approved'                       // Parent approved; points credited
  | 'auto_approved'                  // 24h window closed; auto-approved
  | 'redo_requested'                 // Parent rejected; child resubmitting
  | 'completed'                      // Final done state
  | 'declined'                       // Fully declined
  | 'expired';                       // Bounty unclaimed after 7 days

export const REJECTION_PRESETS = [
  { key: 'MISSED_CORNER',  label: 'Missed a corner or spot' },
  { key: 'INCOMPLETE',     label: 'Task not fully complete' },
  { key: 'WRONG_METHOD',   label: 'Wrong method — check instructions' },
  { key: 'QUALITY',        label: 'Quality below standard' },
  { key: 'CUSTOM',         label: 'Custom message…' },
] as const;

export type RejectionPresetKey = typeof REJECTION_PRESETS[number]['key'];

export type PushbackType = 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS';

export type BadgeTier = 'STANDARD' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface ChoreTask {
  id: string;
  title: string;
  description?: string;
  categoryType: ChoreCategoryType;
  category: string;              // From existing chore_tasks.category field
  basePoints: number;
  coinsReward: number;           // Aligns with existing coins_reward field
  bonusCoins?: number;           // Extra coins on top of basePoints, paid at approval
  xpReward: number;
  status: ChoreStatus;
  assignedToId?: string;
  targetChildIds?: string[];     // GP quest: kids it was published to (empty = bounty pool)
  coinsSplitPerKid?: number;     // GP quest: per-kid split points when published to N kids
  teamGroupId?: string;          // GP team job: clones sharing this id pay out together
  familyId?: string;
  createdById?: string;
  sponsorUserId?: string;        // For grandparent quests
  questMode?: 'local' | 'virtual'; // grandparent_quest: in-person vs video call
  inviteGrandparents?: boolean;  // parent-proposed: open invitation to grandparents
  isOpenToTeens?: boolean;       // parent-proposed: open invitation to teens (mirrors inviteGrandparents)
  isPrivateParent: boolean;
  // Server-stamped, auto-updated on every write — used to detect a
  // concurrent edit before a checked write (see update_chore_task_checked).
  updatedAt?: string;
  isPool?: boolean;               // unassigned quest open for anyone to claim
  // Set when a single-slot chore is claimed via claimPoolQuest (in_progress),
  // cleared on release back to the pool. Used by chore-noshow-sweep to detect
  // a chore claimed then abandoned before submission — see migration
  // 20260908100000_chore_tasks_claimed_at.sql.
  claimedAt?: string;
  // Set while status === 'terms_changed' — old/new coins/due-date values
  // for the claimant's Accept/Hand-back card. See propose_terms_change RPC.
  pendingTerms?: { old: { coinsReward: number; basePoints: number; dueDate?: string; dueTime?: string }; new: { coinsReward: number; basePoints: number; dueDate?: string; dueTime?: string }; changedBy: string; changedAt: string };
  requiresPhotoProof: boolean;
  difficulty?: 'easy' | 'medium' | 'hard' | 'hero';
  recurrenceRule: RecurrenceRule;
  instanceDate?: string;
  dueDate?: string;
  dueTime?: string;
  // Call-style reminder — opt-in per chore. Fires a real (VoIP push /
  // CallKit) ringing alert to the assignee this many minutes before dueTime,
  // not just a normal push. 0 = "on time" (fires at the due moment itself).
  alertCall?: boolean;
  alertCallLeadMinutes?: number;
  redoCount: number;
  submissionNote?: string;
  proofNotes?: string;
  submissionPhotoUrl?: string;
  rejectionReason?: string;
  // Parent-authored note added AFTER final approval — the one field still
  // editable once a quest is done and paid; every other field is locked.
  parentNote?: string;
  approvalWindowExpiresAt?: string;
  // Shopping quest item list (categoryType === 'shopping')
  shoppingItems?: string[];          // e.g. ['Milk 2%', 'Bread', 'Eggs x12']
  shoppingStore?: string;            // e.g. 'Walmart', 'Target'
  shoppingBudget?: number;           // optional spend cap in dollars
  // Spec 8.2 — optional tie to a calendar event this quest logistically
  // supports (e.g. "pack for the trip" linked to the "Family Trip" event).
  // Display-only association picked at creation/edit, no bidirectional
  // sync/cascade to the event itself.
  linkedEventId?: string;
  // Household Backlog's pool "disable without deleting" toggle
  // (PoolQuestCard.tsx). A real, dedicated, persisted flag — previously
  // that toggle wrote isPrivateParent instead (a field that means
  // something completely different: hides the chore from every non-parent
  // role and pulls it out of the parent's own review deck) and never
  // survived a reload anyway, since isPrivateParent isn't a real DB
  // column and gets recomputed from categoryType on every sync.
  isDisabled?: boolean;
  // Scenario 1.13 — set at creation when a Teen self-creates a quest with a
  // coinsReward (+ bonusCoins) above householdSettings.teenRewardCoSignThreshold.
  // The chore itself stays status 'todo' and is fully claimable/workable —
  // only the payout is gated: submitChore/approveChore/resubmitChore must
  // not award points while this is still true. Cleared by a parent via
  // approveTeenReward / adjustTeenReward / declineTeenReward.
  rewardPendingReview?: boolean;
  // Scenario 1.6 — memberId of the grandparent/senior who offered to
  // handle this openToGP chore while status === 'gp_offer_pending'.
  // Deliberately NOT written to assignedToId until a parent actually
  // Accepts the offer (acceptGPOffer) — assignedToId still means "this
  // is who is doing the work," which isn't true yet for a pending offer.
  // Cleared on accept/decline/withdraw.
  gpOfferById?: string;
  // Grandparents who tapped "Pass" on this chore's open GP invitation
  // (inviteGrandparents/openToGP) — persisted so Pass survives reload and
  // is per-GP (a household with two grandparents shouldn't have one GP's
  // Pass hide the invite from the other). Cleared implicitly once the
  // chore is actually assigned (assignedToId set) or reopened to the pool.
  gpWithdrawnIds?: string[];
  // Master-flow "hand it to a specific person" — set by offer_chore_handoff,
  // cleared by accept_chore_handoff/decline_chore_handoff. While set, the
  // chore has NOT actually been reassigned yet (assignedToId is untouched)
  // — it's a real offer awaiting the receiver's Accept/Pass-again response,
  // not a blind immediate reassignment.
  pendingHandoffTo?: string;
  pendingHandoffReason?: string;
  pendingHandoffOfferedBy?: string;
  pendingHandoffOfferedAt?: string;
  // Master-flow "ask for a later time" — set by propose_later_date, cleared
  // by approve_later_date (which then actually rewrites dueDate)/
  // decline_later_date. dueDate itself is untouched while this is set.
  pendingLaterDate?: string;
  pendingLaterReason?: string;
  pendingLaterRequestedBy?: string;
  pendingLaterRequestedAt?: string;
  // GP receipt reimbursement
  receiptPhotoUrl?: string;
  receiptAmount?: number;       // in dollars/currency units (not points)
  receiptNote?: string;
  receiptSubmittedAt?: string;
  receiptReimbursedAt?: string; // parent taps "Reimbursed" to acknowledge
  cheers?: ChoreCheer[];        // Cheer Squad — GP/sibling reactions on a completed chore
  submittedAt?: string;
  approvedAt?: string;
  reviewedAt?: string;
  reviewedById?: string;    // memberId of the parent/senior who approved or requested a redo
  declinedAt?: string;
  createdAt: string;

  // ── Scenario 4.7 — disputed approval (two parents disagree) ──────────────
  // A second parent who disagrees with an already-approved-and-paid chore
  // can flag it for discussion (soft, no financial effect) or request a
  // full reversal (a real clawback — needs the original approver's co-sign
  // unless the household explicitly allows unilateral reversal). Nothing
  // ever silently claws back a payout; see flagApprovalForDiscussion /
  // requestApprovalReversal / coSignReversal / standByApproval.
  disputeStatus?: 'flagged' | 'reversal_requested';
  disputeReason?: string;
  disputedById?: string;    // memberId of the parent who raised the dispute
  disputedAt?: string;
  // Audit trail once a reversal actually executes — the chore itself stays
  // visible/inspectable afterward rather than vanishing, per spec's "a
  // visible audit note" requirement.
  reversedAt?: string;
  reversedById?: string;
  // Per-parent dismiss for the Hub's "Recently Approved" list — a parent who's
  // already seen an approval can clear it from their own view without hiding
  // it from a co-parent who hasn't looked yet, and without cutting short the
  // 7-day dispute window itself. See acknowledgeRecentApproval.
  reviewAckIds?: string[];

  // Multi-slot bounty claiming — a bounty with maxClaimants > 1 lets that
  // many kids each independently claim/work/submit/get paid for their own
  // slot, instead of the single-claimant first-come model claimBounty uses
  // by default (assignedToId stays unused for a multi-slot bounty; each
  // claim is tracked in the separate bounty_claims table instead). NULL/1
  // means the existing single-claimant behavior, unchanged.
  maxClaimants?: number;
  claims?: BountyClaim[];
}

export interface BountyClaim {
  id: string;
  choreId: string;
  memberId: string;
  status: 'in_progress' | 'pending_approval' | 'approved' | 'declined';
  claimedAt: string;
  submittedAt?: string;
  submissionPhotoUrl?: string;
  submissionNote?: string;
  approvedAt?: string;
  reviewedById?: string;
  declinedAt?: string;
  rejectionReason?: string;
  coinsAwarded?: number;
  createdAt: string;
}

export interface ChoreCheer {
  memberId: string;   // who sent the cheer
  at:       string;   // ISO
  coins?:   number;   // optional kudos coins gifted alongside (GP only)
  note?:    string;   // optional kudos text note
}

export interface RecurrenceRule {
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'rotating' | 'first_come';
  days?: number[];              // e.g. [1,3,5] for Mon/Wed/Fri — 'weekly' only
  // 'monthly' only — 1-28, or 31 as shorthand for "last day of the month"
  // (never 29/30 — a fixed 29th/30th/31st silently vanishes or shifts in
  // shorter months; "last day" is the one value guaranteed to exist every
  // month). Absent = implicit "whatever day-of-month it was first approved
  // on", the pre-existing behavior before this field existed.
  dayOfMonth?: number;
  siblingIds?: string[];        // For rotating assignments
  rotationCycleDays?: number;
  durationDays?: number;        // For bounty expiry
}

export interface PointTransaction {
  id: string;
  userId: string;
  choreInstanceId?: string;
  amount: number;
  transactionType:
    | 'EARNED' | 'CASH_OUT' | 'SAVED' | 'SPENT' | 'GIVEN'
    | 'GRANDPARENT_MATCH' | 'STREAK_FREEZE' | 'ADMIN_ADJUSTMENT';
  spendAllocation: number;
  saveAllocation: number;
  giveAllocation: number;
  notes?: string;
  createdAt: string;
  // Which sub-wallet this transaction moves — defaults to 'mainCoins' for
  // every existing/omitted row (regular earned/chore money, the
  // Spend/Save/Give-split cash-out flow). 'gpCoins' is the separate,
  // deliberately-unsplit Grandparent Bonus pool — a GP-coin CASH_OUT always
  // has spend/save/give allocations of 0/0/amount-in-spend (the whole
  // request goes through as a flat cash-out, no financial-literacy jar
  // lesson attached, per product decision) and must never be summed into
  // getMemberBalance's mainCoins-only totals.
  wallet?: 'mainCoins' | 'gpCoins';
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeKey: BadgeKey;
  tier: BadgeTier;
  progress: number;
  progressTarget?: number;
  unlockedAt?: string;
  visualUrl?: string;
  bonusPerkActive: boolean;
  createdAt: string;
}

export type BadgeKey =
  | 'streak_titan'
  | 'dawn_patrol'
  | 'weekend_warrior'
  | 'iron_vault'
  | 'philanthropist'
  | 'master_investor'
  | 'grand_champion'
  | 'sibling_synergy'
  | 'tech_guru'
  | 'clean_slate';

export interface ParentQuestAssignment {
  id: string;
  choreId: string;
  assignedBy: string;
  assignedTo: string;
  status: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PARKED' | 'DECLINED' | 'SNOOZED';
  snoozeUntil?: string;
  bounceCount: number;
  isLocked: boolean;
  actionablePushback?: PushbackType;
  pushbackDetails?: string;
  note?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GrandparentMatch {
  id: string;
  familyId: string;
  grandparentId: string;
  childId: string;
  matchType: 'FIXED_PERCENTAGE' | 'FIXED_AMOUNT' | 'GOAL_PLEDGE';
  matchValue?: number;
  matchJar?: 'SPEND' | 'SAVE' | 'GIVE';
  goalTarget?: number;
  maxMonthlyContribution?: number;
  monthlyContributedYtd: number;
  isActive: boolean;
  createdAt: string;
}

export interface HouseholdSettings {
  pointsToFiatRatio: number;   // 0.01 = 100 pts → 1 unit of currencyCode below
  currencyCode: string;    // ISO 4217, e.g. 'USD', 'EUR', 'INR' — parent-editable in Profile settings
  currencySymbol: string;  // e.g. '$', '€', '₹' — shown wherever coins are converted to real money
  spendAllocationPct: number;  // Default 50
  saveAllocationPct: number;   // Default 40
  giveAllocationPct: number;   // Default 10
  allowChildAllocationOverride: boolean;
  autoApproveTimeoutHours: number;
  minCashoutPoints: number;
  // Scenario 1.13 — a Teen self-creating a quest with a coin reward above
  // this threshold gets the TASK created and immediately workable as normal,
  // but the reward itself is flagged rewardPendingReview until a parent
  // approves/adjusts/declines it (see ChoreTask.rewardPendingReview).
  teenRewardCoSignThreshold: number;
  // Scenario 4.7 — when false (the default/safe option), a reversal
  // request needs the ORIGINAL approving parent's co-sign before the
  // clawback executes. When true, the requesting parent can execute the
  // reversal immediately — the spec explicitly allows this as an opt-in
  // household config, but every reversal (co-signed or unilateral) always
  // leaves a visible audit note (disputeReason/disputedById/reversedById).
  allowUnilateralReversal: boolean;
}

// ─── Badge Definitions ────────────────────────────────────────────────────────

export const BADGE_DEFINITIONS: Record<BadgeKey, {
  label: string;
  emoji: string;
  description: string;
  tiers?: { tier: BadgeTier; target: number; label: string }[];
  bonus: string;
}> = {
  streak_titan: {
    label: 'Streak Titan',
    emoji: '🛡️',
    description: 'Complete 100% of daily routines for consecutive days',
    tiers: [
      { tier: 'STANDARD', target: 7,  label: 'Bronze' },
      { tier: 'SILVER',   target: 14, label: 'Silver' },
      { tier: 'GOLD',     target: 30, label: 'Gold' },
      { tier: 'DIAMOND',  target: 90, label: 'Diamond' },
    ],
    bonus: '+10% points on all tasks during active streak',
  },
  dawn_patrol: {
    label: 'Dawn Patrol',
    emoji: '🌅',
    description: 'Complete morning routines before 7:45 AM for 5 weekdays in a row',
    bonus: 'Unlocks Sunrise profile frame',
  },
  weekend_warrior: {
    label: 'Weekend Warrior',
    emoji: '🏆',
    description: 'Complete 3+ Bounty tasks over one Saturday–Sunday',
    bonus: '+100 bonus milestone points',
  },
  iron_vault: {
    label: 'Iron Vault',
    emoji: '🏦',
    description: 'Keep 2,500+ points in Save Jar for 60 days without cashing out',
    bonus: 'Parent interest match boosted by +2%',
  },
  philanthropist: {
    label: 'Philanthropist',
    emoji: '❤️',
    description: 'Direct 1,000 cumulative points to the Give Jar',
    bonus: '"Heart of Gold" badge shown on family leaderboard',
  },
  master_investor: {
    label: 'Master Investor',
    emoji: '💰',
    description: 'Fund a $50+ savings goal using only chore earnings',
    bonus: 'Permanent golden ledger icon on leaderboard',
  },
  grand_champion: {
    label: 'Grand Champion',
    emoji: '👑',
    description: 'Complete 10 Grandparent Quests',
    bonus: 'Custom duo avatar frame shared with grandparent',
  },
  sibling_synergy: {
    label: 'Sibling Synergy',
    emoji: '🤝',
    description: 'All siblings achieve 100% chore completion on the same day',
    bonus: 'Unlock Family Pizza Night or Movie Picker privilege',
  },
  tech_guru: {
    label: 'Tech Guru',
    emoji: '💻',
    description: 'Complete 5 digital assistance quests for grandparents',
    bonus: '"Silicon Hero" profile theme unlocked',
  },
  clean_slate: {
    label: 'Clean Slate',
    emoji: '✨',
    description: 'Complete a Bounty task with photo proof on first attempt',
    bonus: '+50 bonus points; shareable to family feed',
  },
};

// ─── Cache keys ───────────────────────────────────────────────────────────────

const CACHE_KEY_CHORES       = '@familycube_chores_v1';
const CACHE_KEY_TRANSACTIONS = '@familycube_transactions_v1';
const CACHE_KEY_BADGES       = '@familycube_badges_v1';
const CACHE_KEY_SETTINGS     = '@familycube_household_settings_v1';
const CACHE_KEY_ASSIGNMENTS  = '@familycube_parent_assignments_v1';
const CACHE_TTL = 60_000;

let _fetchedAt = 0;
let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

// ─── Helper: resolve family ID ────────────────────────────────────────────────

const getFamilyId = (): string | null => {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const state = useFamilyStore.getState();
    const active = state.members.find((m: any) => m.id === state.activeMemberId) ?? state.members[0];
    return (active as any)?.familyId ?? null;
  } catch { return null; }
};

const getActiveMemberId = (): string | null => {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const s = useFamilyStore.getState();
    return s.activeMemberId ?? s.members[0]?.id ?? null;
  } catch { return null; }
};

// ─── Handoff notifications ─────────────────────────────────────────────────────
// offerChoreHandoff/acceptChoreHandoff/declineChoreHandoff previously fired
// zero notifications at all — the receiver only found out a chore was
// offered to them by happening to open the app and see it in their list, and
// the offerer never learned whether an accept/decline happened. Routes
// through the same family-notifier pipeline as every other real
// notification in the app (rewardStore/helpStore/kidRequestStore/
// groceryStore, quest-event-notifier's fire()) — best-effort, never blocks
// the actual handoff state change.
function memberName(memberId: string | undefined | null): string {
  if (!memberId) return 'Someone';
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const m = useFamilyStore.getState().members.find((mm: any) => mm.id === memberId);
    return m?.name ?? 'Someone';
  } catch { return 'Someone'; }
}

function notifyChoreHandoff(
  type: 'chore_handoff_offered' | 'chore_handoff_accepted' | 'chore_handoff_declined',
  familyId: string | undefined,
  memberIds: string[],
  excludeMemberId: string | null,
  payload: Record<string, unknown>,
) {
  if (!familyId || !memberIds.length) return;
  supabase.functions.invoke('family-notifier', {
    body: {
      type, familyId, memberIds, payload, persist: true,
      excludeMemberId: excludeMemberId ?? undefined,
    },
  }).catch(e => console.warn('[choreStore] handoff notify failed:', e?.message));
}

// Live-reported bug — "Assign, reassign, reclaim — these are not even
// working." updateChore's generic assignedToId-change path (used by
// EditQuestModal's kid-reassign save, ChoreReviewSection's GP-turned-down
// reassign, and a handful of direct-RPC "reassign_chore"/"reclaim" call
// sites across features/) only ever wrote logChoreUpdateActivity's silent
// 'reassigned' audit row — never a real notification. quest-event-notifier
// already has a fully-built 'quest_reassigned' case (new assignee gets
// "🔀 Force Assigned"-style push, parents get a summary) that
// choreAdapter.ts's own reassignQuest/getState().reassignQuest already call
// for THEIR reassignment path — this is the same event, reused so the
// updateChore path (and the raw-RPC call sites below that can't easily
// route through choreAdapter) tells someone too. Skips a self-claim (actor
// reassigning the chore to themselves) since there's nothing to tell the
// actor about their own action.
function notifyChoreReassigned(
  chore: ChoreTask,
  prevAssigneeId: string | undefined,
  newAssigneeId: string,
  triggeredById: string | null,
) {
  if (!chore.familyId || newAssigneeId === triggeredById) return;
  supabase.functions.invoke('quest-event-notifier', {
    body: {
      event: 'quest_reassigned',
      questId: chore.id,
      questTitle: chore.title,
      familyId: chore.familyId,
      triggeredById: triggeredById ?? undefined,
      assigneeId: prevAssigneeId,
      newAssigneeId,
      coins: chore.basePoints > 0 ? chore.basePoints : chore.coinsReward,
    },
  }).catch(e => console.warn('[choreStore] reassign notify failed:', e?.message));
}

// Nudge buttons scattered across the parent Hub/Backlog cards (OutgoingPendingCard,
// OthersAdultQuestCard, MyAdultQuestCard, ChoreReviewSection's GP-sponsor nudge,
// DirectPendingCard's Accept/"on it" pings) previously only ever sent a chat
// DM via useChatStore — easy to miss, and never populates the notification
// bell/push. Live-reported: "Nudge also should trigger the push along
// sending the chat" — this ADDS a real family-notifier call alongside the
// existing chat message (which stays, as the in-thread record), it doesn't
// replace it. Reuses 'custom' (family-notifier's own default case renders
// whatever title/body the caller passes, same pattern notifyChoreHandoff/
// quest-event-notifier's gp_offer_pending/quest_reassigned cases already
// rely on for a one-off title+body that doesn't need its own NotifType).
function notifyChorePing(
  familyId: string | undefined,
  memberId: string | undefined | null,
  excludeMemberId: string | null,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  if (!familyId || !memberId || memberId === excludeMemberId) return;
  supabase.functions.invoke('family-notifier', {
    body: {
      type: 'custom', familyId, memberIds: [memberId], persist: true,
      excludeMemberId: excludeMemberId ?? undefined,
      payload: { title, body, data: data ?? {} },
    },
  }).catch(e => console.warn('[choreStore] nudge notify failed:', e?.message));
}

// Mirrors eventStore.ts's logUpdateActivity — one row per meaningful field
// change, covering the transitions a family actually wants in the shared
// history sheet (claim/submit/approve/decline, reassignment, reward edits,
// due-date changes), not every column patch (e.g. photo proof URLs).
function logChoreUpdateActivity(prevChore: ChoreTask, updates: Partial<ChoreTask>, id: string) {
  const familyId = getFamilyId();
  const actorId = getActiveMemberId();
  const push = (action: ActivityAction, field: string, oldValue: unknown, newValue: unknown, note?: string) => {
    logActivity({
      entityType: 'chore', entityId: id, familyId, actorId, action, field,
      oldValue: oldValue == null ? null : String(oldValue),
      newValue: newValue == null ? null : String(newValue),
      note,
    });
  };
  if ('status' in updates && updates.status !== prevChore.status) {
    const statusAction: ActivityAction =
      updates.status === 'pending_approval' || updates.status === 'pending_grandparent_approval' || updates.status === 'pending_parent_approval' ? 'submitted' :
      updates.status === 'approved' ? 'approved' :
      updates.status === 'declined' ? 'declined' :
      'status_changed';
    push(statusAction, 'status', prevChore.status, updates.status);
  }
  if ('assignedToId' in updates && updates.assignedToId !== prevChore.assignedToId) {
    push('reassigned', 'assignedToId', prevChore.assignedToId, updates.assignedToId);
  }
  if ('coinsReward' in updates && updates.coinsReward !== prevChore.coinsReward) {
    push('reward_changed', 'coinsReward', prevChore.coinsReward, updates.coinsReward);
  }
  if ('bonusCoins' in updates && updates.bonusCoins !== prevChore.bonusCoins) {
    push('reward_changed', 'bonusCoins', prevChore.bonusCoins, updates.bonusCoins);
  }
  if ('dueDate' in updates && updates.dueDate !== prevChore.dueDate) {
    push('due_date_changed', 'dueDate', prevChore.dueDate, updates.dueDate);
  }
  if ('description' in updates && updates.description !== prevChore.description) {
    push('notes_changed', 'description', prevChore.description, updates.description);
  }
}

// ─── Helper: get active member role ──────────────────────────────────────────

const getActiveMemberRole = (): string | null => {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const state = useFamilyStore.getState();
    const active = state.members.find((m: any) => m.id === state.activeMemberId) ?? state.members[0];
    return (active as any)?.role ?? null;
  } catch { return null; }
};

// ─── Helper: notify parents/seniors that a chore was submitted for review ─────
// 7.2 — submitChore/resubmitChore/submitGrandparentQuest all flip status to a
// pending-review state with no notification to whoever needs to act on it.
// quest-event-notifier's 'quest_submitted' case already resolves parents +
// seniors (grandparents) and builds the right copy — this just invokes it,
// mirroring the fire-and-forget shape already used at this file's other
// quest-event-notifier call sites (cheerChore/appreciationPing).
const notifyQuestSubmitted = (chore: ChoreTask) => {
  if (!chore.familyId) return;
  supabase.functions.invoke('quest-event-notifier', {
    body: {
      event: 'quest_submitted',
      questId: chore.id,
      questTitle: chore.title,
      familyId: chore.familyId,
      assigneeId: chore.assignedToId ?? null,
    },
  }).catch(e => console.warn('[choreStore] quest_submitted notify', e?.message));
};

// ─── Helper: cash-out notifications ────────────────────────────────────────────
// Audit finding — requestCashOut/settleCashOut/approveCashOut/denyCashOut
// previously fired zero notifications in any direction: parents never knew
// a cash-out was waiting on them, and the requesting kid never learned the
// outcome once a parent acted. Mirrors reward_redeemed/reward_decision's
// existing shape (the closest semantic match — a kid asking for something
// that needs a parent's approval) rather than reusing those types directly,
// since a cash-out isn't a store reward redemption.
function notifyCashOutRequested(userId: string, points: number) {
  const familyId = getFamilyId();
  if (!familyId) return;
  try {
    const { useFamilyStore } = require('./familyStore');
    const approverIds = (useFamilyStore.getState().members as any[])
      .filter((m: any) => (m.role === 'parent' || m.role === 'senior') && m.id !== userId)
      .map((m: any) => m.id);
    if (!approverIds.length) return;
    supabase.functions.invoke('family-notifier', {
      body: {
        type: 'cashout_requested', familyId, memberIds: approverIds, persist: true,
        excludeMemberId: userId,
        payload: { points, kidName: memberName(userId) },
      },
    }).catch(e => console.warn('[choreStore] cashout_requested notify', e?.message));
  } catch (e) {
    console.warn('[choreStore] notifyCashOutRequested failed', e);
  }
}

function notifyCashOutDecision(
  type: 'cashout_settled' | 'cashout_approved' | 'cashout_denied',
  tx: PointTransaction | undefined,
  extra?: Record<string, unknown>,
) {
  const familyId = getFamilyId();
  const actorId = getActiveMemberId();
  if (!familyId || !tx?.userId || tx.userId === actorId) return;
  supabase.functions.invoke('family-notifier', {
    body: {
      type, familyId, memberIds: [tx.userId], persist: true,
      excludeMemberId: actorId ?? undefined,
      payload: { points: tx.amount, ...extra },
    },
  }).catch(e => console.warn(`[choreStore] ${type} notify`, e?.message));
}

// ─── DB row mappers ───────────────────────────────────────────────────────────

function choreFromRow(row: any): ChoreTask {
  return {
    id:                      String(row.id),
    title:                   row.title,
    description:             row.description ?? undefined,
    categoryType:            (row.category_type ?? 'routine') as ChoreCategoryType,
    category:                row.category ?? 'home',
    basePoints:              row.base_points ?? row.coins_reward ?? 0,
    coinsReward:             row.coins_reward ?? 0,
    bonusCoins:              row.bonus_coins ?? 0,
    xpReward:                row.xp_reward ?? 0,
    status:                  (row.status ?? 'todo') as ChoreStatus,
    assignedToId:            row.assigned_to_id ?? undefined,
    targetChildIds:          Array.isArray(row.target_child_ids) ? row.target_child_ids : undefined,
    coinsSplitPerKid:        row.coins_split_per_kid ?? undefined,
    teamGroupId:             row.team_group_id ?? undefined,
    isPool:                  row.is_pool ?? false,
    familyId:                row.family_id ?? undefined,
    createdById:             row.created_by_id ?? undefined,
    sponsorUserId:           row.sponsor_user_id ?? undefined,
    questMode:               row.quest_mode ?? undefined,
    inviteGrandparents:      row.invite_grandparents ?? false,
    isOpenToTeens:           row.is_open_to_teens ?? false,
    isPrivateParent:         row.category_type === 'parent_only_quest',
    updatedAt:               row.updated_at ?? undefined,
    requiresPhotoProof:      row.requires_photo ?? row.requires_photo_proof ?? false,
    recurrenceRule:          (typeof row.recurrence_rule === 'object' && row.recurrence_rule)
                               ? row.recurrence_rule
                               : { frequency: 'once' as const },
    instanceDate:            row.instance_date ?? undefined,
    dueDate:                 row.due_date ?? undefined,
    dueTime:                 row.due_time ?? undefined,
    alertCall:               row.alert_call ?? false,
    alertCallLeadMinutes:    row.alert_call_lead_minutes ?? 10,
    redoCount:               row.redo_count ?? 0,
    submissionNote:          row.submission_note ?? undefined,
    proofNotes:              row.proof_notes ?? undefined,
    submissionPhotoUrl:      row.submission_photo_url ?? undefined,
    rejectionReason:         row.rejection_reason ?? undefined,
    parentNote:              row.parent_note ?? undefined,
    approvalWindowExpiresAt: row.approval_window_expires_at ?? undefined,
    submittedAt:             row.submitted_at ?? undefined,
    approvedAt:              row.approved_at ?? undefined,
    claimedAt:               row.claimed_at ?? undefined,
    pendingTerms:            row.pending_terms ?? undefined,
    reviewedAt:              row.reviewed_at ?? undefined,
    reviewedById:            row.reviewed_by_id ?? undefined,
    declinedAt:              row.declined_at ?? undefined,
    linkedEventId:           row.linked_event_id ?? undefined,
    createdAt:               row.created_at ?? new Date().toISOString(),
    shoppingItems:           Array.isArray(row.shopping_items) ? row.shopping_items : undefined,
    shoppingStore:           row.shopping_store ?? undefined,
    shoppingBudget:          row.shopping_budget != null ? Number(row.shopping_budget) : undefined,
    gpWithdrawnIds:          Array.isArray(row.gp_withdrawn_ids) ? row.gp_withdrawn_ids : undefined,
    pendingHandoffTo:        row.pending_handoff_to ?? undefined,
    pendingHandoffReason:    row.pending_handoff_reason ?? undefined,
    pendingHandoffOfferedBy: row.pending_handoff_offered_by ?? undefined,
    pendingHandoffOfferedAt: row.pending_handoff_offered_at ?? undefined,
    pendingLaterDate:        row.pending_later_date ?? undefined,
    pendingLaterReason:      row.pending_later_reason ?? undefined,
    pendingLaterRequestedBy: row.pending_later_requested_by ?? undefined,
    pendingLaterRequestedAt: row.pending_later_requested_at ?? undefined,
    reviewAckIds:            Array.isArray(row.review_ack_ids) ? row.review_ack_ids : undefined,
    isDisabled:              row.is_disabled ?? false,
    rewardPendingReview:     row.reward_pending_review ?? false,
    gpOfferById:             row.gp_offer_by_id ?? undefined,
    maxClaimants:            row.max_claimants ?? undefined,
    receiptPhotoUrl:         row.receipt_photo_url ?? undefined,
    receiptAmount:           row.receipt_amount != null ? Number(row.receipt_amount) : undefined,
    receiptNote:             row.receipt_note ?? undefined,
    receiptSubmittedAt:      row.receipt_submitted_at ?? undefined,
    receiptReimbursedAt:     row.receipt_reimbursed_at ?? undefined,
    cheers:                  Array.isArray(row.cheered_by) ? row.cheered_by : [],
    disputeStatus:           row.dispute_status ?? undefined,
    disputeReason:           row.dispute_reason ?? undefined,
    disputedById:            row.disputed_by_id ?? undefined,
    disputedAt:              row.disputed_at ?? undefined,
    reversedAt:              row.reversed_at ?? undefined,
    reversedById:            row.reversed_by_id ?? undefined,
  };
}

function txFromRow(row: any): PointTransaction {
  return {
    id:                String(row.id),
    userId:            String(row.user_id),
    choreInstanceId:   row.chore_instance_id ?? undefined,
    amount:            row.amount,
    transactionType:   row.transaction_type,
    spendAllocation:   row.spend_allocation ?? 0,
    saveAllocation:    row.save_allocation ?? 0,
    giveAllocation:    row.give_allocation ?? 0,
    notes:             row.notes ?? undefined,
    createdAt:         row.created_at ?? new Date().toISOString(),
  };
}

function badgeFromRow(row: any): UserBadge {
  return {
    id:              String(row.id),
    userId:          String(row.user_id),
    badgeKey:        row.badge_key as BadgeKey,
    tier:            (row.tier ?? 'STANDARD') as BadgeTier,
    progress:        row.progress ?? 0,
    progressTarget:  row.progress_target ?? undefined,
    unlockedAt:      row.unlocked_at ?? undefined,
    visualUrl:       row.visual_url ?? undefined,
    bonusPerkActive: row.bonus_perk_active ?? true,
    createdAt:       row.created_at ?? new Date().toISOString(),
  };
}

function parentAssignmentFromRow(row: any): ParentQuestAssignment {
  return {
    id:                  String(row.id),
    choreId:             String(row.chore_id),
    assignedBy:          String(row.assigned_by),
    assignedTo:          String(row.assigned_to),
    status:              (row.status ?? 'PENDING') as ParentQuestAssignment['status'],
    snoozeUntil:         row.snooze_until ?? undefined,
    bounceCount:         row.bounce_count ?? 0,
    isLocked:            row.is_locked ?? false,
    actionablePushback:  row.actionable_pushback ?? undefined,
    pushbackDetails:     row.pushback_details ?? undefined,
    note:                row.note ?? undefined,
    completedAt:         row.completed_at ?? undefined,
    createdAt:           row.created_at ?? new Date().toISOString(),
    updatedAt:           row.updated_at ?? new Date().toISOString(),
  };
}

// ─── Three-jar allocation calculator ─────────────────────────────────────────

function calculateJarSplit(
  points: number,
  settings: HouseholdSettings,
  override?: { spendPct: number; savePct: number; givePct: number },
): { spend: number; save: number; give: number } {
  const spendPct = override?.spendPct ?? settings.spendAllocationPct;
  const savePct  = override?.savePct  ?? settings.saveAllocationPct;

  const spend = Math.floor(points * (spendPct / 100));
  const save  = Math.floor(points * (savePct  / 100));
  const give  = points - spend - save; // remainder ensures sum = points

  return { spend, save, give };
}

// Local calendar date as YYYY-MM-DD — NOT toISOString().slice(0,10), which
// is UTC and can already read as "tomorrow" hours before local midnight in
// timezones behind UTC. A chore approved at 5:57pm local time getting
// reset back to todo an hour later, same day, was exactly this bug: the
// UTC-vs-local mismatch made resetDueRecurringChores treat "later today"
// as if the next cycle had already started.
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The date a recurring chore's next cycle actually starts, given the date
// it was last approved. Daily → tomorrow; weekly/monthly → the same
// weekday/day-of-month one period out. 'rotating'/'first_come' have no
// fixed cadence here — they're reassigned by other flows, not this clock.
// `days` (0=Sun..6=Sat) only applies to 'weekly' — a chore recurring on
// specific days (e.g. Mon/Wed/Fri) previously always jumped exactly +7 days
// from whenever it was last approved regardless of which days were picked,
// so "every Mon/Wed/Fri" behaved identically to "every 7 days from
// whenever I happened to approve it" — the picked days were saved but never
// actually consulted. Finds the next of the selected weekdays strictly
// after fromISO, wrapping into the following week if none remain this one.
function nextDueDate(fromISO: string, frequency: RecurrenceRule['frequency'], days?: number[], dayOfMonth?: number): string | null {
  const d = new Date(fromISO);
  if (frequency === 'daily') { d.setDate(d.getDate() + 1); return localDateStr(d); }
  if (frequency === 'monthly') {
    d.setMonth(d.getMonth() + 1);
    if (dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31) {
      // Land on day 1 first, THEN set the target day — setting a day that
      // doesn't exist in the current month (e.g. day 31 while still sitting
      // on a 30-day month before the month rolls) overflows into the month
      // after next instead of clamping, which silently skips a whole cycle.
      d.setDate(1);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      // 31 is this app's "last day of the month" shorthand (see
      // RecurrenceRule.dayOfMonth) — clamp any target beyond what the
      // month actually has, so "31" in February lands on the 28th/29th
      // instead of rolling into March.
      d.setDate(Math.min(dayOfMonth, daysInMonth));
    }
    return localDateStr(d);
  }
  if (frequency !== 'weekly') return null;
  if (!days || days.length === 0) { d.setDate(d.getDate() + 7); return localDateStr(d); }
  const sorted = [...new Set(days)].filter(n => n >= 0 && n <= 6).sort((a, b) => a - b);
  if (sorted.length === 0) { d.setDate(d.getDate() + 7); return localDateStr(d); }
  for (let add = 1; add <= 7; add++) {
    const candidate = new Date(d);
    candidate.setDate(candidate.getDate() + add);
    if (sorted.includes(candidate.getDay())) return localDateStr(candidate);
  }
  // Unreachable (every weekday 0-6 spans at most 7 days out), but keeps the
  // function total rather than implicitly returning undefined.
  d.setDate(d.getDate() + 7);
  return localDateStr(d);
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface ChoreState {
  // Core data
  chores:              ChoreTask[];
  transactions:        PointTransaction[];
  badges:              UserBadge[];
  parentAssignments:   ParentQuestAssignment[];
  grandparentMatches:  GrandparentMatch[];
  householdSettings:   HouseholdSettings;
  loaded:              boolean;

  // Data loading
  loadFromStorage:     () => Promise<void>;
  syncFromDB:          (force?: boolean) => Promise<void>;

  // ── Chore CRUD ─────────────────────────────────────────────────────────────
  addChore:            (chore: Omit<ChoreTask, 'id' | 'createdAt' | 'isPrivateParent' | 'redoCount'>) => Promise<ChoreTask>;
  updateChore:         (id: string, updates: Partial<ChoreTask>) => Promise<void>;
  deleteChore:         (id: string) => Promise<void>;

  // ── Child actions ──────────────────────────────────────────────────────────
  // onLost — scenarios 3.1/3.4: the claim's optimistic local write can lose
  // for two DIFFERENT reasons that both land on the same "0 rows" DB result:
  // another member's claim landed first (still exists, just not mine — spec
  // 3.1's "someone just claimed this"), or a parent deleted the chore out
  // from under the claim entirely (spec 3.4's "this quest was just removed
  // by a parent"). Distinguished with one extra existence check on the lost
  // race, so the caller can show the right message instead of a generic one.
  claimBounty:              (choreId: string, childId: string, onLost?: (reason: 'claimed' | 'deleted') => void) => Promise<void>;
  // Multi-slot bounty claiming (chore_tasks.max_claimants > 1) — each kid's
  // claim tracked independently in bounty_claims rather than assignedToId.
  // claimBounty automatically delegates here when maxClaimants > 1.
  // Reuses claimBounty's own 'claimed' | 'deleted' reason shape so both
  // functions' callers (claimBounty delegates to this one when
  // maxClaimants > 1) can share one onLost handler — 'claimed' covers both
  // "someone else took the last slot" and "you already have a claim."
  claimBountySlot:          (choreId: string, childId: string, onLost?: (reason: 'claimed' | 'deleted') => void) => Promise<void>;
  submitBountyClaim:        (choreId: string, childId: string, opts?: { photoUrl?: string; note?: string }) => Promise<void>;
  approveBountyClaim:       (choreId: string, childId: string, reviewerId: string) => Promise<void>;
  declineBountyClaim:       (choreId: string, childId: string, reviewerId: string, reason?: string) => Promise<void>;
  // A kid backing out of their OWN claimed bounty slot before submitting —
  // distinct from declineBountyClaim (parent-initiated, reviewer-gated,
  // only for a pending_approval claim). Live-DB QA found QuestCard's
  // "Can't do this" on a multi-slot bounty called the generic
  // reassignQuest (which only ever mutates chore_tasks.assignedToId/
  // isPool), never touching this kid's own bounty_claims row — the claim
  // stayed status='in_progress' forever, with no way to actually free the
  // slot for anyone else.
  withdrawBountyClaim:      (choreId: string, childId: string) => Promise<void>;
  loadBountyClaims:         (choreId: string) => Promise<void>;
  claimPoolQuest:           (choreId: string, memberId: string, onLost?: (reason: 'claimed' | 'deleted') => void) => Promise<void>;
  // Returns false (and does nothing) if the chore isn't submittable yet —
  // currently: a recurring chore whose due_date is still in the future.
  // One-time chores and on/after-due-date recurring chores always succeed.
  submitChore:              (choreId: string, opts?: { photoUrl?: string; note?: string }) => boolean;
  resubmitChore:            (choreId: string, opts?: { photoUrl?: string; note?: string }) => Promise<void>;
  // Internal — shared by submitChore/resubmitChore, calls the submit_chore
  // RPC (server-side redo-cap/self-assigned-parent branch + coin payout).
  // Not part of the public store API surface, not called by UI directly.
  _submitChoreViaRpc:       (choreId: string, chore: ChoreTask, opts?: { photoUrl?: string; note?: string }) => Promise<void>;
  // QA punch list #5 — pre-payout dispute (kid disagrees with a redo
  // request, asks a second parent instead of just resubmitting). See
  // migration 20260908150000_redo_dispute_rpcs.sql.
  disputeRedo:              (choreId: string, memberId: string) => Promise<void>;
  resolveRedoDispute:       (choreId: string, reviewerId: string, pay: boolean) => Promise<void>;
  instantCompleteChore:     (choreId: string, childId: string) => Promise<void>;
  startGrandparentQuest:    (choreId: string, childId: string) => Promise<void>;
  submitGrandparentQuest:   (choreId: string, opts?: { photoUrl?: string; note?: string }) => Promise<void>;

  // ── GP errand receipt ─────────────────────────────────────────────────────
  // Scenario 1.6 — claimGPErrand no longer claims outright; it records an
  // OFFER (status 'gp_offer_pending', gpOfferById set) that a parent must
  // Accept or Decline before assignedToId/status:'in_progress' are set. See
  // acceptGPOffer/declineGPOffer/withdrawGPOffer below.
  claimGPErrand:           (choreId: string, gpMemberId: string) => Promise<void>;
  setGpWithdrawn:          (choreId: string, gpMemberId: string, withdrawn: boolean) => Promise<void>;
  offerChoreHandoff:       (choreId: string, toMemberId: string, byMemberId: string, reason?: string) => Promise<void>;
  acceptChoreHandoff:      (choreId: string, memberId: string) => Promise<void>;
  declineChoreHandoff:     (choreId: string, memberId: string) => Promise<void>;
  proposeLaterDate:        (choreId: string, byMemberId: string, newDate: string, reason?: string) => Promise<void>;
  approveLaterDate:        (choreId: string, parentId: string) => Promise<void>;
  declineLaterDate:        (choreId: string, parentId: string) => Promise<void>;
  cancelChore:             (choreId: string, byMemberId: string) => Promise<boolean>;
  acceptGPOffer:           (choreId: string, parentId: string) => Promise<void>;
  declineGPOffer:          (choreId: string, parentId: string, reason?: string) => Promise<void>;
  // A kid proposed this chore for themselves/a sibling (propose_kid_chore
  // RPC, status='pending_kid_proposal') — parent Accepts with a real coin
  // amount (the kid never sets one) or Declines outright (row is deleted
  // server-side, not soft-declined — a declined proposal was never a real
  // chore). See 20260907120000_kid_proposed_chore_rpcs.sql.
  approveKidProposedChore: (choreId: string, reviewerId: string, coins: number, dueDate?: string) => Promise<void>;
  declineKidProposedChore: (choreId: string, reviewerId: string, reason?: string) => Promise<void>;
  // QA punch list #2 — a claimant's response to a parent changing coins/
  // due-date underneath them (status='terms_changed', see propose_terms_
  // change RPC in updateChore above). Accept keeps the chore on the new
  // terms; reject hands it back to the pool, no reason required.
  acceptTermsChange:       (choreId: string, memberId: string) => Promise<void>;
  rejectTermsChange:       (choreId: string, memberId: string) => Promise<void>;
  withdrawGPOffer:         (choreId: string, gpMemberId: string) => Promise<void>;
  submitGPErrandReceipt:   (choreId: string, opts: { receiptPhotoUrl?: string; receiptAmount?: number; receiptNote?: string }) => Promise<void>;
  acknowledgeGPReimbursement: (choreId: string) => Promise<void>;
  // GP-Welcome pool (canGpClaimPool in QuestCard.tsx — a plain
  // inviteGrandparents chore a GP claimed directly via "I'd Love To Help",
  // NOT the sponsored claimGPErrand offer-pending flow above). No approval
  // gate and no coin payout — a GP is a trusted adult helping out, same
  // "adults don't earn coins for their own chores" precedent
  // QuestApprovalCard.tsx already documents for parents.
  completeGpWelcomeChore:  (choreId: string, gpMemberId: string) => Promise<void>;
  backoutGpWelcomeChore:   (choreId: string, gpMemberId: string) => Promise<void>;
  giveBackChore:           (choreId: string, memberId: string) => Promise<void>;

  // ── Scenarios 9.2/9.3 — temporary-approver / caregiver-mode ──────────────
  // Single source of truth for "is this member currently allowed to
  // approve/decline a chore submission" — role === 'parent' OR an active
  // temporary-approver grant (store/temporaryApproverStore.ts). Every
  // approval-gating check should route through this rather than
  // re-deriving role === 'parent' ad hoc, so a future change to what
  // counts as an approver only needs to change in one place.
  canApprove:                      (memberId: string) => boolean;

  // ── Parent review ──────────────────────────────────────────────────────────
  approveChore:                    (choreId: string, reviewerId: string) => Promise<void>;
  requestRedo:                     (choreId: string, reviewerId: string, reason: string, presetKey?: string) => Promise<void>;
  requestGrandparentRedo:          (choreId: string, grandparentId: string, reason: string) => Promise<void>;

  // ── Cheer Squad — GP/sibling reactions on a completed chore ─────────────────
  cheerChore:                      (choreId: string, fromMemberId: string, opts?: { coins?: number; note?: string }) => Promise<void>;
  approveGrandparentQuestAsParent: (choreId: string, parentId: string) => void;
  declineGrandparentQuestAsParent: (choreId: string, parentId: string, reason: string) => void;
  resetDueRecurringChores:         () => void;

  // ── Scenario 1.13 — Teen reward co-sign threshold ─────────────────────────
  // A parent clears a Teen-created quest's rewardPendingReview flag. If the
  // chore's work is already fully approved/auto_approved (the teen finished
  // and it was reviewed before the parent got to the reward queue), payout
  // fires immediately on approval; otherwise the flag simply clears and the
  // normal submit/approve payout path (now unblocked) pays out whenever the
  // work itself is later approved.
  approveTeenReward:  (choreId: string, approverId: string) => void;
  adjustTeenReward:   (choreId: string, approverId: string, newAmount: number) => void;
  declineTeenReward:  (choreId: string, approverId: string, reason?: string) => void;

  // ── Scenario 4.7 — disputed approval (two parents disagree) ─────────────
  // flagApprovalForDiscussion: soft flag, no financial effect — notifies the
  // approving parent that a co-parent wants to discuss it. Never visible to
  // the kid (spec: "no visibility into the parents' disagreement").
  flagApprovalForDiscussion: (choreId: string, byParentId: string, note?: string) => void;
  // standByApproval: the approving parent dismisses a flag/reversal request
  // without reversing — clears disputeStatus, no financial effect.
  standByApproval:           (choreId: string, byParentId: string) => void;
  // acknowledgeRecentApproval: a parent clears one chore from their own
  // "Recently Approved" Hub list. Per-viewer (adds byParentId to
  // reviewAckIds) so it doesn't cut short the 7-day dispute window for a
  // co-parent who hasn't seen it yet — see recentlyApproved's filter in
  // ChoreReviewSection.tsx, which excludes any chore the viewer already
  // acknowledged.
  acknowledgeRecentApproval: (choreId: string, byParentId: string) => void;
  // requestApprovalReversal: if householdSettings.allowUnilateralReversal is
  // true, executes the clawback immediately (still leaves a full audit
  // trail). Otherwise sets disputeStatus: 'reversal_requested' and waits for
  // the ORIGINAL approving parent's coSignReversal — never a silent,
  // unilateral clawback by default.
  requestApprovalReversal:   (choreId: string, byParentId: string, reason: string) => void;
  // coSignReversal: the original approving parent (chore.reviewedById)
  // agrees with a pending reversal request — executes the clawback.
  coSignReversal:            (choreId: string, coSigningParentId: string) => void;
  // Internal — the actual clawback logic shared by the unilateral-allowed
  // and co-signed paths. Not intended to be called directly from UI.
  _executeReversal:          (choreId: string, byParentId: string, reason: string) => void;

  // ── Points economy ────────────────────────────────────────────────────────
  awardPoints:         (userId: string, choreId: string, points: number, xp?: number, wallet?: 'mainCoins' | 'gpCoins') => void;
  requestCashOut:      (userId: string, points: number, override?: { spendPct: number; savePct: number; givePct: number }, wallet?: 'mainCoins' | 'gpCoins') => void;
  settleCashOut:       (transactionId: string, method: 'PHYSICAL_CASH' | 'DEBIT_CARD' | 'LEDGER') => void;
  approveCashOut:      (transactionId: string) => void;
  denyCashOut:         (transactionId: string) => void;

  // ── Badges ────────────────────────────────────────────────────────────────
  updateBadgeProgress: (userId: string, badgeKey: BadgeKey, progress: number) => void;
  unlockBadge:         (userId: string, badgeKey: BadgeKey, tier?: BadgeTier) => void;
  getBadgeProgress:    (userId: string) => UserBadge[];

  // ── Parent-only quests ────────────────────────────────────────────────────
  addParentQuest:      (choreId: string, assignedBy: string, assignedTo?: string, mode?: 'PULL' | 'DIRECT', note?: string) => Promise<ParentQuestAssignment | null>;
  createAndAddParentQuest: (task: { title: string; description?: string; dueDate?: string; assignedTo?: string; mode: 'PULL' | 'DIRECT'; createdById: string }) => Promise<ChoreTask>;
  respondToParentQuest:(assignmentId: string, response: {
    action: 'ACCEPT' | 'DECLINE' | 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS';
    details?: string;
  }) => void;
  completeParentQuest: (assignmentId: string, completedBy: string) => void;
  // Only exit from a locked (two-bounce) assignment — previously there was
  // none at all, so a bounced task just sat there permanently with a
  // "discuss offline" label and no button to actually move past it once
  // that offline conversation happened. Clears the lock, marks the
  // assignment DECLINED (finally giving that status a real use), and
  // reopens the chore in the pool for anyone to take or re-delegate.
  cancelLockedAssignment: (assignmentId: string, byMemberId: string) => void;
  // The delegator taking back a still-PENDING (not yet accepted) System-A
  // delegation — distinct from cancelLockedAssignment, which is for a
  // locked (two-bounce) assignment. A delegator should always be able to
  // recall their own delegation without the delegate's permission; the
  // delegate is notified rather than having it silently vanish.
  recallParentQuest:   (assignmentId: string, recallerId: string) => void;
  appreciationPing:    (assignmentId: string, fromId: string, message: string) => void;

  // ── Grandparent actions ───────────────────────────────────────────────────
  addGrandparentMatch: (match: Omit<GrandparentMatch, 'id' | 'createdAt' | 'monthlyContributedYtd'>) => void;
  applyGrandparentMatches: (childId: string, jarAmounts: { spend: number; save: number; give: number }) => void;
  createGrandparentQuest: (task: { title: string; description?: string; basePoints: number; childIds: string[]; dueDate?: string; sponsorId: string; mode?: 'local' | 'virtual'; requiresPhoto?: boolean }) => ChoreTask;
  approveGrandparentQuest: (choreId: string, parentId: string) => void;
  declineGrandparentQuest: (choreId: string, parentId: string, reason: string) => void;
  // Kid/teen declining a chore assigned directly to them — extracted from
  // features/hub/kid/DeclineQuestSheet.tsx's inline button handler so the
  // same 3-way dispatch (GP quest / team-clone / plain chore) is reusable
  // from other surfaces (e.g. features/tasks' unified "can't make it" sheet)
  // instead of being re-derived and risking drift between two copies.
  declineChoreAssignment: (choreId: string, byMemberId: string, reason: string) => void;
  grandparentApproveAndCheer: (choreId: string, grandparentId: string, sticker?: string) => void;

  // ── Settings ──────────────────────────────────────────────────────────────
  updateHouseholdSettings: (updates: Partial<HouseholdSettings>) => void;

  // ── Selectors ─────────────────────────────────────────────────────────────
  getChildDashboard:   (childId: string) => {
    citizenship: ChoreTask[];
    routines:    ChoreTask[];
    bounties:    ChoreTask[];
    shopping:    ChoreTask[];
    grandparentQuests: ChoreTask[];
    completedToday: ChoreTask[];
    pendingReview: ChoreTask[];
  };
  getParentReviewDeck: () => ChoreTask[];
  getParentQuestPool:  () => ChoreTask[];
  getMemberBalance:    (memberId: string) => { spend: number; save: number; give: number; total: number };
  getPendingCashOuts:  () => PointTransaction[];
  // ── System-A (parent_quest_assignments) shared selectors ──────────────────
  // Single source of truth for "does this chore have a live negotiation
  // going on" — every write path that could otherwise silently steal or
  // clobber a DIRECT assignment (Take It, auto-assign, Edit's reassign
  // picker) must check this first instead of only looking at the chore's
  // own assignedToId, which System A deliberately leaves empty until
  // accepted.
  getActiveAssignmentChoreIds: () => Set<string>;
  getLiveAssignmentForChore: (choreId: string) => ParentQuestAssignment | undefined;
  getMyDirectPending: (memberId: string) => ParentQuestAssignment[];
  getMyLockedItems:   (memberId: string) => ParentQuestAssignment[];
  getMyOutgoingPending: (memberId: string) => ParentQuestAssignment[];
}

// ─── Default settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: HouseholdSettings = {
  pointsToFiatRatio:            0.01,
  currencyCode:                 'USD',
  currencySymbol:               '$',
  spendAllocationPct:           50,
  saveAllocationPct:            40,
  giveAllocationPct:            10,
  allowChildAllocationOverride: false,
  autoApproveTimeoutHours:      24,
  minCashoutPoints:             100,
  teenRewardCoSignThreshold:    100,
  allowUnilateralReversal:      false,
};

// ─── DB write helper ──────────────────────────────────────────────────────────

// Was fire-and-forget with no failure handling at all beyond a
// console.warn — every one of dbUpdate's ~20 call sites applies its own
// optimistic local `set()` BEFORE calling this, so on an RLS violation or
// network failure the UI kept showing the optimistic result (chore
// approved, points awarded, quest reassigned) forever with nothing telling
// the user or reverting local state — a real, silent data-integrity gap,
// not just a missing nicety. `onFailure` is optional and additive: existing
// call sites that don't pass one keep the exact old (silent, console-only)
// behavior; call sites are being migrated one at a time to pass a rollback
// that restores the pre-optimistic-update local state, plus a shared
// user-facing toast so a failed save is at least visible even before every
// site has a real rollback wired.
// Returns a promise of whether the write succeeded — most callers ignore it
// (truly fire-and-forget, `onFailure` covers their rollback need), but a
// call site whose NEXT step must only happen once the write is actually
// confirmed (e.g. denyCashOut's coin refund, which must never fire ahead of
// its own denial tag actually landing) can await/.then() it directly.
// DB-is-truth: returns the full confirmed row (not just {ok}) so a caller
// can render its local state directly from what the server actually
// persisted, instead of re-applying its own patch as a guess. `row` is
// undefined on any failure — callers converted to the DB-is-truth pattern
// should treat a missing row as "nothing to render," not fall back to a
// local guess.
function dbUpdate(table: string, id: string, patch: Record<string, unknown>, onFailure?: () => void): Promise<{ ok: boolean; row?: any }> {
  _fetchedAt = 0;
  console.log(`[choreStore] → DB update ${table}/${id}`, patch);
  // QA TC-43 — .update().eq('id', id) with no matching row returns NO error
  // and zero affected rows, which this previously reported as {ok:true}. An
  // optimistic edit applied locally to a chore someone else had already
  // deleted (a real race, not hypothetical — a parent cancels while another
  // parent is mid-edit) looked like a successful save with nothing actually
  // written server-side, silently reverting on the next real sync with zero
  // explanation. .select() (the full row, not just 'id') makes Postgrest
  // report the actually-matched row so a real 0-row case is distinguishable
  // from a genuine error, AND gives DB-is-truth callers the confirmed row
  // to render from.
  return Promise.resolve(supabase.from(table).update(patch).eq('id', id).select()).then(({ data, error }) => {
    if (error) {
      console.warn(`[choreStore] ✗ DB update ${table}/${id} FAILED`, error.message);
      onFailure?.();
      showToast("Couldn't save — check your connection and try again", 'error');
      return { ok: false };
    }
    if (!data || data.length === 0) {
      console.warn(`[choreStore] ✗ DB update ${table}/${id} matched 0 rows — likely already deleted`);
      onFailure?.();
      showToast("Couldn't save — this may have already been removed", 'error');
      return { ok: false };
    }
    console.log(`[choreStore] ✓ DB update ${table}/${id} ok`);
    return { ok: true, row: data[0] };
  });
}

// Fire-and-forget by default (existing callers don't await this and never
// see a rejection) — but returns a promise that resolves once the write
// settles, so a caller that chains a dependent insert (e.g. an assignment
// row that RLS-checks the chore it references) can wait for the actual DB
// commit instead of just the local state update. DB-is-truth: also returns
// the confirmed inserted row so a caller can render from it directly.
function dbInsert(table: string, row: Record<string, unknown>): Promise<{ ok: boolean; row?: any }> {
  _fetchedAt = 0;
  console.log(`[choreStore] → DB insert ${table}`, row);
  return Promise.resolve(supabase.from(table).insert(row).select()).then(({ data, error }) => {
    if (error) {
      console.warn(`[choreStore] ✗ DB insert ${table} FAILED`, error.message, '| row:', row);
      return { ok: false };
    }
    console.log(`[choreStore] ✓ DB insert ${table} ok (id=${row.id})`);
    return { ok: true, row: data?.[0] };
  });
}

// ─── Realtime subscription ────────────────────────────────────────────────────

function ensureRealtime(
  familyId: string,
  setState: (s: Partial<ChoreState>) => void,
  getState: () => ChoreState,
) {
  if (_rtFamilyId === familyId && _rtChannel) {
    console.log(`[choreStore] ensureRealtime — already subscribed to chores:${familyId}, skipping`);
    return;
  }
  if (_rtChannel) {
    console.log(`[choreStore] ensureRealtime — removing previous channel (was family=${_rtFamilyId})`);
    supabase.removeChannel(_rtChannel);
    _rtChannel = null;
  }
  // Dev-mode hot reload resets this module's `let` state, but the Supabase
  // client is a persisted singleton whose socket can still hold a channel
  // under this exact topic name — calling .on() on a fresh channel object
  // with a name collision throws "cannot add callbacks ... after subscribe()".
  // Sweep any live channel with the same topic before creating a new one.
  const staleTopic = `realtime:chores:${familyId}`;
  const stale = supabase.getChannels().filter(c => c.topic === staleTopic);
  if (stale.length > 0) {
    console.log(`[choreStore] ensureRealtime — found ${stale.length} stale channel(s) for ${staleTopic} (likely hot-reload), removing`);
    stale.forEach(c => supabase.removeChannel(c));
  }
  _rtFamilyId = familyId;

  console.log(`[choreStore] ensureRealtime — subscribing to chores:${familyId}`);
  try {
    _rtChannel = supabase
      .channel(`chores:${familyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chore_tasks',
        filter: `family_id=eq.${familyId}`,
      }, ({ eventType, new: newRow, old: oldRow }) => {
        console.log(`[choreStore] realtime chore_tasks ${eventType}`, (newRow as any)?.id ?? (oldRow as any)?.id);
        const state = getState();
        if (eventType === 'INSERT') {
          const chore = choreFromRow(newRow);
          // Hide parent-only quests from non-parents — except a senior who
          // is themselves the assignee of THIS specific parent_only_quest
          // (addParentQuest's adult-to-adult delegation flow can hand one
          // to a GP; blocking it here would silently drop their own
          // delegated quest the instant it arrived over realtime).
          const role = getActiveMemberRole();
          const activeId = (() => { try { const { useFamilyStore } = require('@/store/familyStore'); return useFamilyStore.getState().activeMemberId; } catch { return null; } })();
          const isMyOwnParentOnlyQuest = role === 'senior' && chore.assignedToId === activeId;
          if (chore.isPrivateParent && role !== 'parent' && !isMyOwnParentOnlyQuest) return;
          // Skip if already added optimistically by addChore
          if (state.chores.some(c => c.id === chore.id)) return;
          setState({ chores: [chore, ...state.chores] });
        } else if (eventType === 'UPDATE') {
          const chore = choreFromRow(newRow);
          // Same role filter as the INSERT branch above (V-A1) — a chore
          // that transitions INTO parent_only_quest after a non-parent
          // device already has the row cached must not have that update
          // applied locally; drop the pre-existing row instead of leaving
          // a private task's live field changes visible to a kid/senior —
          // UNLESS that senior is themselves the quest's assignee (same
          // adult-to-adult delegation exception as the INSERT branch).
          const role = getActiveMemberRole();
          const activeId = (() => { try { const { useFamilyStore } = require('@/store/familyStore'); return useFamilyStore.getState().activeMemberId; } catch { return null; } })();
          const isMyOwnParentOnlyQuest = role === 'senior' && chore.assignedToId === activeId;
          if (chore.isPrivateParent && role !== 'parent' && !isMyOwnParentOnlyQuest) {
            setState({ chores: state.chores.filter(c => c.id !== chore.id) });
            return;
          }
          setState({
            chores: state.chores.map(c =>
              c.id === String(newRow.id) ? chore : c
            ),
          });
        } else if (eventType === 'DELETE') {
          setState({ chores: state.chores.filter(c => c.id !== String(oldRow.id)) });
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'parent_quest_assignments',
        // parent_quest_assignments has no family_id column of its own (RLS
        // scopes it via a join to chore_tasks.family_id — confirmed in
        // supabase/migrations/20260815000004_parent_quest_assignments.sql)
        // so this handler can't filter server-side by family the way the
        // chore_tasks handler above does. RLS itself still restricts which
        // rows actually reach this client (only rows whose chore belongs to
        // the caller's family are ever delivered), so no additional
        // client-side scoping is needed here — same trust boundary
        // syncFromDB's unfiltered select on this table already relies on.
      }, ({ eventType, new: newRow, old: oldRow }) => {
        console.log(`[choreStore] realtime parent_quest_assignments ${eventType}`, (newRow as any)?.id ?? (oldRow as any)?.id);
        const state = getState();
        if (eventType === 'INSERT') {
          const assignment = parentAssignmentFromRow(newRow);
          if (state.parentAssignments.some(a => a.id === assignment.id)) return;
          setState({ parentAssignments: [assignment, ...state.parentAssignments] });
        } else if (eventType === 'UPDATE') {
          setState({
            parentAssignments: state.parentAssignments.map(a =>
              a.id === String(newRow.id) ? parentAssignmentFromRow(newRow) : a
            ),
          });
        } else if (eventType === 'DELETE') {
          setState({ parentAssignments: state.parentAssignments.filter(a => a.id !== String(oldRow.id)) });
        }
      })
      .subscribe((status) => {
        console.log(`[choreStore] realtime chores:${familyId} subscribe status=${status}`);
        // ensureRealtime's own guard above only checks "does _rtChannel
        // exist," never "is it actually connected" — a socket that dies
        // (most commonly: the OS suspends the app in the background, which
        // silently kills the underlying WebSocket) left _rtChannel as a
        // non-null but functionally dead object, so every later syncFromDB
        // call kept short-circuiting on "already subscribed... skipping"
        // forever. Confirmed live: GP/parent actions (Pass, decline,
        // backout) updated the ACTING device fine (local optimistic state)
        // but never reached any OTHER family member's device until they
        // manually pulled-to-refresh — which works only because it forces
        // a real DB round-trip, bypassing the dead socket entirely. Nulling
        // _rtChannel here on a terminal bad status makes the next
        // syncFromDB call (see the AppState foreground handler below)
        // actually resubscribe instead of trusting a corpse.
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[choreStore] realtime chores:${familyId} unhealthy (${status}) — clearing so the next sync resubscribes`);
          // Guard against a stale channel's late status callback clobbering
          // a newer channel that's already replaced it (e.g. a rapid
          // background/foreground cycle creating a second ensureRealtime
          // call before this one's status settles).
          if (_rtFamilyId === familyId) { _rtChannel = null; _rtFamilyId = ''; }
        }
      });
  } catch (e: any) {
    console.warn('[choreStore] ensureRealtime subscribe failed', e?.message ?? e);
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useChoreStore = create<ChoreState>()((set, get) => ({
  chores:             [],
  transactions:       [],
  badges:             [],
  parentAssignments:  [],
  grandparentMatches: [],
  householdSettings:  DEFAULT_SETTINGS,
  loaded:             false,

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────────────────────

  loadFromStorage: async () => {
    try {
      const [rawChores, rawTx, rawBadges, rawSettings, rawAssignments] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY_CHORES),
        AsyncStorage.getItem(CACHE_KEY_TRANSACTIONS),
        AsyncStorage.getItem(CACHE_KEY_BADGES),
        AsyncStorage.getItem(CACHE_KEY_SETTINGS),
        AsyncStorage.getItem(CACHE_KEY_ASSIGNMENTS),
      ]);
      const rawParsed: ChoreTask[] = rawChores ? JSON.parse(rawChores) : [];
      // Deduplicate by id — guards against stale duplicates written before this fix
      const seen = new Set<string>();
      const deduped = rawParsed.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      set({
        chores:           deduped,
        transactions:     rawTx       ? JSON.parse(rawTx)       : [],
        badges:           rawBadges   ? JSON.parse(rawBadges)   : [],
        householdSettings: rawSettings ? { ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) } : DEFAULT_SETTINGS,
        parentAssignments: rawAssignments ? JSON.parse(rawAssignments) : [],
        loaded: true,
      });
    } catch (e) {
      console.warn('[choreStore] loadFromStorage error', e);
      set({ loaded: true });
    }
  },

  syncFromDB: async (force = false) => {
    if (!force && Date.now() - _fetchedAt < CACHE_TTL) return;
    const familyId = getFamilyId();
    if (!familyId) return;

    const role = getActiveMemberRole();

    try {
      // Fetch chores — filter out parent-only for non-parents
      let choreQuery = supabase
        .from('chore_tasks')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });

      // parent_only_quest used to mean "parents only, full stop" — but
      // addParentQuest's adult-to-adult delegation flow now lets a
      // grandparent be the assignee/assigner of one of these too (a parent
      // can hand a quest to a GP, a GP to a parent or another GP). A
      // senior's own delegated quest must still reach them, or converting
      // it to parent_only_quest on delegation (see addParentQuest) would
      // silently make it invisible to the very person it was just handed
      // to. Kids/teens stay fully excluded from parent_only_quest, same as
      // before. A senior gets ONLY the parent_only_quest rows where they're
      // specifically the assignee — not blanket visibility into every
      // parent-only task in the family, which parent_only_quest's own name
      // still implies should stay parent-scoped by default.
      // Live user-reported gap, confirmed against the actual RLS policy
      // (not just this client-side query): a chore assigned directly to a
      // parent was only excluded from a kid/teen's own device if the
      // creating parent had explicitly toggled "Parent Only"
      // (category_type='parent_only_quest') — an ordinary chore that just
      // happens to be assigned to a parent, with nobody remembering to
      // flip that toggle, was fetched raw by every kid/teen device.
      // Parents shouldn't have to remember to mark something private just
      // because it's for another adult.
      //
      // The REAL fix is the database's own row-level security rule
      // (20260930400000_chore_tasks_hide_parent_assignee_by_default.sql),
      // which now also excludes any row assigned to a parent-role member
      // regardless of category_type — that's the actual, unbypassable
      // boundary, since expressing "assignee's role is parent" cleanly in
      // this client-side filter syntax (which can't easily join against
      // members) isn't reliable enough to be the real protection. This
      // query is intentionally left matching its OLD, narrower shape —
      // it's just a bandwidth pre-filter to skip an unnecessary round
      // trip for the common case, not a security boundary; the server
      // will correctly withhold rows this filter still lets through.
      if (role === 'senior') {
        const activeId = (() => { try { const { useFamilyStore } = require('@/store/familyStore'); return useFamilyStore.getState().activeMemberId; } catch { return null; } })();
        choreQuery = choreQuery.or(`category_type.neq.parent_only_quest,assigned_to_id.eq.${activeId}`);
      } else if (role !== 'parent') {
        choreQuery = choreQuery.neq('category_type', 'parent_only_quest');
      }

      const [{ data: choresData }, { data: txData }, { data: badgesData }, { data: assignmentsData }, { data: familyRow }] = await Promise.all([
        choreQuery,
        supabase
          .from('point_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('user_badges')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        // RLS scopes this to the family via its chore_tasks join — no family_id column on the table itself.
        // Same unbounded-growth risk point_transactions already caps for —
        // this table is append-only across a family's whole lifetime.
        supabase
          .from('parent_quest_assignments')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        // Household Settings previously never had a working read path at
        // all — updateHouseholdSettings wrote these columns, but nothing
        // ever fetched them back, so every device silently kept whatever
        // it last had in AsyncStorage (or the hardcoded defaults) forever,
        // with zero cross-device sync.
        supabase
          .from('families')
          .select('points_to_fiat_ratio, currency_code, currency_symbol, spend_allocation_pct, save_allocation_pct, give_allocation_pct, allow_child_allocation_override, auto_approve_timeout_hours, min_cashout_points, teen_reward_cosign_threshold, allow_unilateral_reversal')
          .eq('id', familyId)
          .single(),
      ]);

      const chores       = (choresData ?? []).map(choreFromRow);
      const transactions = (txData     ?? []).map(txFromRow);
      const badges       = (badgesData ?? []).map(badgeFromRow);
      const parentAssignments = (assignmentsData ?? []).map(parentAssignmentFromRow);
      const householdSettings: HouseholdSettings = familyRow ? {
        pointsToFiatRatio:            familyRow.points_to_fiat_ratio            ?? DEFAULT_SETTINGS.pointsToFiatRatio,
        currencyCode:                 familyRow.currency_code                   ?? DEFAULT_SETTINGS.currencyCode,
        currencySymbol:               familyRow.currency_symbol                 ?? DEFAULT_SETTINGS.currencySymbol,
        spendAllocationPct:           familyRow.spend_allocation_pct            ?? DEFAULT_SETTINGS.spendAllocationPct,
        saveAllocationPct:            familyRow.save_allocation_pct             ?? DEFAULT_SETTINGS.saveAllocationPct,
        giveAllocationPct:            familyRow.give_allocation_pct             ?? DEFAULT_SETTINGS.giveAllocationPct,
        allowChildAllocationOverride: familyRow.allow_child_allocation_override ?? DEFAULT_SETTINGS.allowChildAllocationOverride,
        autoApproveTimeoutHours:      familyRow.auto_approve_timeout_hours      ?? DEFAULT_SETTINGS.autoApproveTimeoutHours,
        minCashoutPoints:             familyRow.min_cashout_points              ?? DEFAULT_SETTINGS.minCashoutPoints,
        teenRewardCoSignThreshold:    familyRow.teen_reward_cosign_threshold    ?? DEFAULT_SETTINGS.teenRewardCoSignThreshold,
        allowUnilateralReversal:      familyRow.allow_unilateral_reversal       ?? DEFAULT_SETTINGS.allowUnilateralReversal,
      } : get().householdSettings;

      _fetchedAt = Date.now();
      set({ chores, transactions, badges, parentAssignments, householdSettings, loaded: true });

      await Promise.all([
        AsyncStorage.setItem(CACHE_KEY_CHORES,       JSON.stringify(chores)),
        AsyncStorage.setItem(CACHE_KEY_TRANSACTIONS,  JSON.stringify(transactions)),
        AsyncStorage.setItem(CACHE_KEY_BADGES,        JSON.stringify(badges)),
        AsyncStorage.setItem(CACHE_KEY_ASSIGNMENTS,   JSON.stringify(parentAssignments)),
        AsyncStorage.setItem(CACHE_KEY_SETTINGS,      JSON.stringify(householdSettings)),
      ]);

      ensureRealtime(familyId, set, get);
    } catch (e) {
      console.warn('[choreStore] syncFromDB error', e);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CHORE CRUD
  // ─────────────────────────────────────────────────────────────────────────

  addChore: async (partial) => {
    const familyId = getFamilyId();
    const now = new Date().toISOString();

    // Live QA audit found "shopping is adult-only" was UI-copy-only —
    // nothing in this function (or updateChore, below) actually rejected a
    // kid/teen assignedToId on a shopping chore; one was inserted and ran
    // the full submit→approve→payout cycle with zero rejection anywhere.
    // Real data-layer guard: strip a non-adult assignee back to unassigned
    // (pool) rather than silently letting the write through with the wrong
    // assignee, or throwing and losing the whole create.
    if (partial.categoryType === 'shopping' && partial.assignedToId) {
      try {
        const { useFamilyStore } = require('./familyStore');
        const assignee = useFamilyStore.getState().members.find((m: any) => m.id === partial.assignedToId);
        if (assignee && assignee.role !== 'parent' && assignee.role !== 'senior') {
          console.warn('[choreStore] addChore blocked a non-adult assignedToId on a shopping chore — clearing to pool', assignee.role);
          partial = { ...partial, assignedToId: undefined, isPool: true };
        }
      } catch (e) {
        console.warn('[choreStore] addChore shopping adult-only check failed', e);
      }
    }
    const autoExpire = partial.categoryType === 'parent_only_quest'
      ? undefined
      : ['citizenship', 'routine', 'shopping'].includes(partial.categoryType)
        ? new Date(Date.now() + (get().householdSettings.autoApproveTimeoutHours * 3600_000)).toISOString()
        : undefined;

    // Scenario 1.13 — a Teen self-creating a quest (createdById is a 'teen'
    // member) with a coin reward above the household threshold gets the
    // reward flagged for parent review. The task itself is unaffected: it's
    // created as normal (status stays whatever the caller passed, typically
    // 'todo') and is immediately claimable/workable — only payout is gated
    // (see submitChore/resubmitChore/approveChore). A caller that already
    // set rewardPendingReview explicitly (e.g. a future edit flow) is
    // trusted as-is and not overridden here.
    let rewardPendingReview = (partial as any).rewardPendingReview ?? false;
    if (!rewardPendingReview && partial.createdById) {
      try {
        const { useFamilyStore } = require('./familyStore');
        const creator = useFamilyStore.getState().members.find((m: any) => m.id === partial.createdById);
        const totalReward = (partial.coinsReward ?? 0) + ((partial as any).bonusCoins ?? 0);
        const threshold = get().householdSettings.teenRewardCoSignThreshold;
        if (creator?.role === 'teen' && totalReward > threshold) {
          rewardPendingReview = true;
        }
      } catch (e) {
        console.warn('[choreStore] addChore teen-reward-threshold check failed', e);
      }
    }

    const chore: ChoreTask = {
      ...partial,
      id:                   genId(),
      isPrivateParent:      (partial as any).isPrivateParent ?? partial.categoryType === 'parent_only_quest',
      redoCount:            0,
      approvalWindowExpiresAt: autoExpire,
      rewardPendingReview,
      createdAt:            now,
    };

    // DB-is-truth: await the insert and only add the chore to local state
    // once the server has actually confirmed it — was optimistic (added to
    // `chores` immediately, insert fired after, tracked via
    // _choreInsertPromises purely so a dependent write, e.g.
    // createAndAddParentQuest's assignment row which RLS-checks that
    // chore_id already exists, could wait for the real insert). Now the
    // await itself IS that guarantee, and the returned row (via
    // choreFromRow) is what actually gets rendered — not the client-built
    // draft.
    const { ok, row } = await dbInsert('chore_tasks', {
      id:                       chore.id,
      title:                    chore.title,
      description:              chore.description,
      category_type:            chore.categoryType,
      category:                 chore.category,
      base_points:              chore.basePoints,
      coins_reward:             chore.coinsReward,
      bonus_coins:              chore.bonusCoins ?? 0,
      xp_reward:                chore.xpReward,
      status:                   chore.status,
      assigned_to_id:           chore.assignedToId,
      is_pool:                  chore.isPool ?? false,
      reward_pending_review:    chore.rewardPendingReview ?? false,
      family_id:                familyId,
      created_by_id:            chore.createdById,
      sponsor_user_id:          chore.sponsorUserId,
      quest_mode:               chore.questMode ?? null,
      invite_grandparents:      chore.inviteGrandparents ?? false,
      is_open_to_teens:         chore.isOpenToTeens ?? false,
      requires_photo:           chore.requiresPhotoProof,
      recurrence_rule:          chore.recurrenceRule,
      instance_date:            chore.instanceDate,
      due_date:                 chore.dueDate,
      due_time:                 chore.dueTime,
      // due_date/due_time are local wall-clock values with no offset of
      // their own — chore_tasks.timezone existed as a column but was never
      // actually populated by the app, silently defaulting to 'UTC' in
      // Postgres. call-reminder-sweeper (a Deno edge function, which runs
      // in UTC) parsed "due_dateTdue_time" as if it WERE UTC, so any family
      // not literally in UTC got their call reminder computed against the
      // wrong absolute time — 5 hours early for US Central, for example.
      // The device's real IANA zone (Intl resolvedOptions, same source
      // lib/dates.ts already uses for locale-aware formatting) lets the
      // sweeper convert correctly instead of guessing.
      timezone:                 Intl.DateTimeFormat().resolvedOptions().timeZone,
      alert_call:               chore.alertCall ?? false,
      alert_call_lead_minutes:  chore.alertCallLeadMinutes ?? 10,
      approval_window_expires_at: autoExpire,
      created_at:               now,
      shopping_items:           (partial as any).shoppingItems ?? null,
      shopping_store:           (partial as any).shoppingStore ?? null,
      shopping_budget:          (partial as any).shoppingBudget ?? null,
      linked_event_id:          chore.linkedEventId ?? null,
    });
    if (!ok || !row) {
      console.warn('[choreStore] addChore insert failed');
      showToast("Couldn't save — check your connection and try again", 'error');
      throw new Error('addChore insert failed');
    }
    const confirmed = choreFromRow(row);
    set(s => ({ chores: [confirmed, ...s.chores] }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    logActivity({ entityType: 'chore', entityId: confirmed.id, familyId, actorId: confirmed.createdById ?? getActiveMemberId(), action: 'created' });

    // 7.1 — a newly-posted claimable POOL quest gets zero signal to eligible
    // kids/teens (and seniors, if GP-eligible) otherwise — they'd only see
    // it if they happened to open the tab. A directly-assigned chore
    // already has its own separate signal via the assignment itself, so
    // this only fires for the unassigned/pool case. Same fire-and-forget
    // invoke shape as the other quest-event-notifier call sites in this
    // file (cheerChore/appreciationPing above).
    if (confirmed.isPool && !confirmed.assignedToId && familyId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_posted',
          questId: confirmed.id,
          questTitle: confirmed.title,
          familyId,
          inviteGrandparents: confirmed.inviteGrandparents ?? false,
        },
      }).catch(e => console.warn('[choreStore] addChore quest_posted notify', e?.message));
    }

    // Live-reported: a chore created and directly assigned to someone
    // (not posted to the open pool) sent ZERO notification to them at all
    // — the comment right above this block asserted a directly-assigned
    // chore "already has its own separate signal via the assignment
    // itself," but nothing in this function (or anywhere else in this
    // file, confirmed via grep for quest_assigned) ever actually fired
    // one. quest-event-notifier's own 'quest_assigned' case exists and is
    // correctly implemented (assignee gets "📋 New Quest Assigned!") —
    // it was just never called from here. Mirrors the isPool branch above:
    // this is the direct-assignment case, so the two are mutually
    // exclusive (a pool chore has no assignedToId yet; an assigned chore
    // isn't posted to the open pool for others to claim).
    if (!confirmed.isPool && confirmed.assignedToId && familyId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_assigned',
          questId: confirmed.id,
          questTitle: confirmed.title,
          familyId,
          assigneeId: confirmed.assignedToId,
          coins: confirmed.coinsReward ?? 0,
        },
      }).catch(e => console.warn('[choreStore] addChore quest_assigned notify', e?.message));
    }

    // A chore with a real due DATE+TIME (not just a vague "due today")
    // materializes a linked calendar_events row, the same way Medications'
    // addMed already does via addRecurringEvent — this is what lets a
    // timed chore ride the existing 2-way calendar sync engine
    // (calendar-sync-push/Apple EventKit) for free, with zero new sync
    // logic of its own (user decision: funnel every syncable domain
    // through calendar_events rather than giving chores their own push
    // path). linkedEventId already existed as a column but was previously
    // always null — this is the first real writer of it.
    if (confirmed.dueDate && confirmed.dueTime && !confirmed.linkedEventId) {
      // addEvent is async (eventStore.ts's DB-is-truth conversion) — was a
      // real bug here: this fire-and-forget block never awaited it, so
      // linkedEventId was a Promise object, not a real event id, silently
      // writing a stringified promise into the DB instead of a usable
      // reference. Await it properly.
      (async () => {
        try {
          const { useEventStore } = require('./eventStore');
          const linkedEventId = await useEventStore.getState().addEvent({
            title: confirmed.title,
            date: confirmed.dueDate,
            time: confirmed.dueTime,
            memberId: confirmed.assignedToId,
            type: 'reminder',
            category: 'Chore',
            createdBy: confirmed.createdById ?? getActiveMemberId() ?? undefined,
          });
          if (linkedEventId) get().updateChore(confirmed.id, { linkedEventId } as any);
        } catch (e) {
          console.warn('[choreStore] addChore calendar materialization failed', e);
        }
      })();
    }

    return confirmed;
  },

  updateChore: async (id, rawUpdates) => {
    const prevChore = get().chores.find(c => c.id === id);
    // QA TC-38 — SeniorView.tsx's openEditSponsoredQuest/handleCreateQuest
    // already let a grandparent edit their own sponsored quest via this same
    // updateChore call, but with no server-side backstop: the "only reachable
    // while pending_parent_approval" claim relied entirely on the UI never
    // exposing the edit button once a parent has acted, not on updateChore
    // itself refusing a stale/direct write. Once a parent has approved or
    // declined, the terms are final — reject any further edit here instead
    // of trusting the client to never ask.
    if (prevChore?.categoryType === 'grandparent_quest' && prevChore.status !== 'pending_parent_approval') {
      // Deep QA trace found this list didn't include coinsReward — a
      // claimed grandparent_quest blocked a basePoints edit outright as
      // "already reviewed, final" but let the functionally equivalent
      // coinsReward edit fall through to the general propose_terms_change
      // path instead, an inconsistent lock on the same underlying "how
      // much does this quest pay" concept.
      const editableFields = ['title', 'description', 'basePoints', 'coinsReward', 'targetChildIds', 'questMode', 'requiresPhotoProof'];
      if (editableFields.some(f => f in rawUpdates)) {
        console.warn(`[choreStore] blocked edit to grandparent_quest ${id} — status is ${prevChore.status}, not pending_parent_approval`);
        showToast("This quest has already been reviewed — it can't be edited anymore", 'error');
        return;
      }
    }
    // QA punch list #2 — "Terms changed after someone took it" was
    // entirely missing: a plain patch here silently rewrote coins/due-date
    // on an already-claimed chore with zero notice to the claimant. A
    // coins/due-date edit on a claimed (in_progress, has an assignee)
    // chore now goes through propose_terms_change instead of a plain
    // patch — the chore pauses at 'terms_changed' until the claimant
    // Accepts or Hands It Back (see TermsChangedCard.tsx). Doesn't apply
    // to the reviewer's OWN accept/decline flows (those already route
    // through their own dedicated RPCs, never through updateChore for
    // this field combination) or to a chore that isn't claimed yet (a
    // parent editing an open pool/unclaimed chore's coins is still a
    // plain, immediate edit — nobody has a stake in it yet).
    if (
      prevChore && prevChore.status === 'in_progress' && prevChore.assignedToId &&
      // QA TC-36 — dueTime was missing from this gate entirely, so a
      // due-time-only edit on a claimed chore fell through to the plain
      // patch below with zero notice to the claimant, unlike coins/
      // dueDate edits on the same chore.
      (('coinsReward' in rawUpdates) || ('basePoints' in rawUpdates) || ('dueDate' in rawUpdates) || ('dueTime' in rawUpdates))
    ) {
      const reviewerId = getActiveMemberId();
      if (reviewerId) {
        const newCoins = 'coinsReward' in rawUpdates ? (rawUpdates as any).coinsReward : undefined;
        const newBase   = 'basePoints'  in rawUpdates ? (rawUpdates as any).basePoints  : undefined;
        const newDue     = 'dueDate'     in rawUpdates ? (rawUpdates as any).dueDate     : undefined;
        const newDueTime = 'dueTime'     in rawUpdates ? (rawUpdates as any).dueTime     : undefined;
        const { error } = await supabase.rpc('propose_terms_change', {
          p_chore_id: id, p_by_member_id: reviewerId,
          p_new_coins_reward: newCoins ?? null, p_new_base_points: newBase ?? null,
          p_new_due_date: newDue ?? null, p_new_due_time: newDueTime ?? null,
        });
        if (error) {
          console.warn('[choreStore] propose_terms_change RPC failed', error.message);
          showToast("Couldn't save — please try again", 'error');
          return;
        }
        await get().syncFromDB(true);
        return;
      }
    }
    // Live QA audit found a shopping chore's assignedToId could be changed
    // to a kid/teen via a later edit (not just at creation, which addChore
    // now separately guards) with zero rejection. Same fix here: an edit
    // reassigning a shopping chore to a non-adult is redirected back to
    // pool rather than silently accepted.
    if ('assignedToId' in rawUpdates && (rawUpdates as any).assignedToId) {
      const existing = get().chores.find(c => c.id === id);
      const effectiveCategory = (rawUpdates as any).categoryType ?? existing?.categoryType;
      if (effectiveCategory === 'shopping') {
        try {
          const { useFamilyStore } = require('./familyStore');
          const assignee = useFamilyStore.getState().members.find((m: any) => m.id === (rawUpdates as any).assignedToId);
          if (assignee && assignee.role !== 'parent' && assignee.role !== 'senior') {
            console.warn('[choreStore] updateChore blocked a non-adult assignedToId on a shopping chore — clearing to pool', assignee.role);
            rawUpdates = { ...rawUpdates, assignedToId: undefined, isPool: true } as any;
          }
        } catch (e) {
          console.warn('[choreStore] updateChore shopping adult-only check failed', e);
        }
      }
    }
    // Scenario 1.13 — live QA audit found the teen reward co-sign threshold
    // was ONLY ever checked at addChore (creation) time. A parent editing an
    // EXISTING teen-created quest's coinsReward/bonusCoins upward — e.g.
    // bumping a 50-coin quest to 150 — never re-ran the check, so the
    // reward silently exceeded the threshold with rewardPendingReview
    // staying false: a complete, verified bypass of the co-sign gate (the
    // full submit→approve→payout cycle went through with no review). Only
    // re-flags (never un-flags on a downward edit — a parent can already
    // clear the flag deliberately via approveTeenReward/adjustTeenReward,
    // and auto-clearing on edit risks quietly releasing a payout that
    // still needed sign-off for other reasons). Only acts when the caller
    // hasn't already explicitly set rewardPendingReview themselves, same
    // trust-the-caller escape hatch addChore's own check uses.
    if (('coinsReward' in rawUpdates || 'bonusCoins' in rawUpdates) && !('rewardPendingReview' in rawUpdates)) {
      const existing = get().chores.find(c => c.id === id);
      if (existing && !existing.rewardPendingReview && existing.createdById) {
        try {
          const { useFamilyStore } = require('./familyStore');
          const creator = useFamilyStore.getState().members.find((m: any) => m.id === existing.createdById);
          const newCoins  = 'coinsReward' in rawUpdates ? (rawUpdates as any).coinsReward ?? 0 : existing.coinsReward;
          const newBonus  = 'bonusCoins'  in rawUpdates ? (rawUpdates as any).bonusCoins  ?? 0 : (existing.bonusCoins ?? 0);
          const totalReward = newCoins + newBonus;
          const threshold = get().householdSettings.teenRewardCoSignThreshold;
          if (creator?.role === 'teen' && totalReward > threshold) {
            console.warn('[choreStore] updateChore edit pushed a teen quest reward over threshold — flagging rewardPendingReview', id);
            rawUpdates = { ...rawUpdates, rewardPendingReview: true } as any;
          }
        } catch (e) {
          console.warn('[choreStore] updateChore teen-reward-threshold recheck failed', e);
        }
      }
    }
    // Live-repro'd bug: EditQuestModal's restricted ("Adjust") reassign
    // writes assignedToId straight to System B, but a chore can already
    // have a live System-A parent_quest_assignments row (PENDING/ACCEPTED/
    // SNOOZED/PARKED) pointing at a DIFFERENT person — e.g. from an
    // earlier DelegateSheet handoff or GP-welcome claim. Without closing
    // that stale row out, QuestsScreen's activeAssignmentChoreIds
    // exclusion keeps rendering the chore via DirectPendingCard addressed
    // to the OLD (System-A) assignee, so the reassignment silently
    // "doesn't move" from the user's perspective even though this write
    // succeeded. addParentQuest already supersedes stale System-A rows
    // when creating a NEW one (see its own staleOpen comment) — this is
    // the missing mirror case: any direct System-B assignedToId change
    // must supersede a stale System-A row too, not just a fresh System-A
    // assignment superseding a previous one.
    if ('assignedToId' in rawUpdates) {
      const newAssignee = (rawUpdates as any).assignedToId;
      const existing = prevChore;
      if (existing && newAssignee !== existing.assignedToId) {
        const staleOpen = get().parentAssignments.filter(a =>
          a.choreId === id && !a.isLocked &&
          ['PENDING', 'ACCEPTED', 'SNOOZED', 'PARKED'].includes(a.status)
        );
        if (staleOpen.length > 0) {
          const now = new Date().toISOString();
          console.log(`[choreStore] updateChore reassign → superseding ${staleOpen.length} stale System-A assignment(s) on chore ${id}`);
          const results = await Promise.all(staleOpen.map(a =>
            dbUpdate('parent_quest_assignments', a.id, { status: 'COMPLETED', updated_at: now })
          ));
          const confirmed = staleOpen.filter((_, i) => results[i].ok);
          if (confirmed.length > 0) {
            set(s => ({
              parentAssignments: s.parentAssignments.map(a =>
                confirmed.some(x => x.id === a.id) ? { ...a, status: 'COMPLETED', updatedAt: now } : a
              ),
            }));
          }
        }
      }
    }
    // openToGP (a separate "Offer to GP" toggle column) and
    // inviteGrandparents used to be two different DB columns meaning the
    // same thing, kept in sync by a mirror-write here that a later bug
    // (DelegateSheet reading a stale snapshot) showed wasn't a reliable fix
    // — openToGP has since been dropped from chore_tasks entirely;
    // inviteGrandparents is the one column every read path uses.
    // DB-is-truth: await the write and only reflect it locally once the
    // server confirms it — was optimistic (set() before the write, rolled
    // back on failure); local state now only ever shows a confirmed row.
    const updates = rawUpdates;

    // Live QA trace of the P2P (parent-to-parent) lane found this was a
    // real, reproducible race: two parents editing the same chore's
    // title/note/date within the same instant silently last-write-wins,
    // with zero signal to whichever parent's edit was discarded. When the
    // patch touches ONLY the collision-prone free-text/scalar fields a
    // person types directly into an edit sheet, route through
    // update_chore_task_checked instead of the plain patch below — it
    // rejects the write with a clear error if the row moved on since
    // prevChore was last loaded, rather than silently overwriting.
    const CHECKED_FIELDS = ['title', 'description', 'parentNote', 'dueDate', 'dueTime', 'coinsReward', 'basePoints'] as const;
    const updateKeys = Object.keys(updates);
    if (prevChore && updateKeys.length > 0 && updateKeys.every(k => (CHECKED_FIELDS as readonly string[]).includes(k))) {
      const { error } = await supabase.rpc('update_chore_task_checked', {
        p_chore_id: id,
        p_title: 'title' in updates ? (updates as any).title ?? null : null,
        p_has_title: 'title' in updates,
        p_description: 'description' in updates ? (updates as any).description ?? null : null,
        p_has_description: 'description' in updates,
        p_parent_note: 'parentNote' in updates ? (updates as any).parentNote ?? null : null,
        p_has_parent_note: 'parentNote' in updates,
        p_due_date: 'dueDate' in updates ? (updates as any).dueDate ?? null : null,
        p_has_due_date: 'dueDate' in updates,
        p_due_time: 'dueTime' in updates ? (updates as any).dueTime ?? null : null,
        p_has_due_time: 'dueTime' in updates,
        p_coins_reward: 'coinsReward' in updates ? (updates as any).coinsReward ?? null : null,
        p_has_coins_reward: 'coinsReward' in updates,
        p_base_points: 'basePoints' in updates ? (updates as any).basePoints ?? null : null,
        p_has_base_points: 'basePoints' in updates,
        p_expected_updated_at: prevChore.updatedAt ?? null,
      });
      if (error) {
        console.warn('[choreStore] update_chore_task_checked FAILED', error.message);
        const isStale = error.message?.includes('stale_write');
        showToast(isStale ? "Someone else already changed this — refresh to see their update" : "Couldn't save — check your connection and try again", 'error');
        return;
      }
      set(s => ({
        chores: s.chores.map(c => c.id === id ? { ...c, ...updates } : c),
      }));
      AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
      await get().syncFromDB(true);
      return;
    }

    // Map to DB fields. Uses `in` (key presence), not `!== undefined`, so a
    // caller that explicitly passes `{ approvedAt: undefined }` to CLEAR a
    // field (e.g. resetDueRecurringChores rolling a chore back to 'todo')
    // actually writes SQL NULL, instead of the key silently being dropped
    // from the patch — which previously left approved_at/reviewed_at/
    // reviewed_by_id/submitted_at stale in the DB after a status reset,
    // desyncing status ('todo') from those leftover approval fields the
    // next time syncFromDB() overwrote local state with the DB's version.
    const patch: Record<string, unknown> = {};
    if ('title'              in updates) patch.title                    = updates.title;
    if ('description'        in updates) patch.description              = updates.description;
    if ('status'             in updates) patch.status                   = updates.status;
    if ('assignedToId'       in updates) patch.assigned_to_id           = updates.assignedToId ?? null;
    if ('claimedAt'          in updates) patch.claimed_at               = updates.claimedAt ?? null;
    if ('isPool'             in updates) patch.is_pool                  = updates.isPool;
    if ('targetChildIds'     in updates) patch.target_child_ids         = updates.targetChildIds;
    if ('coinsSplitPerKid'   in updates) patch.coins_split_per_kid       = updates.coinsSplitPerKid;
    if ('teamGroupId'        in updates) patch.team_group_id             = updates.teamGroupId;
    if ('categoryType'       in updates) patch.category_type            = updates.categoryType;
    if ('category'           in updates) patch.category                 = updates.category;
    if ('basePoints'         in updates) patch.base_points              = updates.basePoints;
    if ('coinsReward'        in updates) patch.coins_reward             = updates.coinsReward;
    if ('bonusCoins'         in updates) patch.bonus_coins              = updates.bonusCoins;
    if ('difficulty'         in updates) patch.difficulty               = updates.difficulty;
    if ('dueDate'            in updates) patch.due_date                 = updates.dueDate;
    // Stamp the device's real timezone whenever due_time changes — see the
    // matching comment in addChore for why this matters (chore_tasks.
    // timezone silently defaulted to 'UTC' and the sweeper trusted it).
    if ('dueTime'            in updates) { patch.due_time = updates.dueTime; patch.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; }
    if ('alertCall'          in updates) patch.alert_call               = updates.alertCall ?? false;
    if ('alertCallLeadMinutes' in updates) patch.alert_call_lead_minutes = updates.alertCallLeadMinutes ?? 10;
    if ('requiresPhotoProof' in updates) patch.requires_photo           = updates.requiresPhotoProof;
    if ('inviteGrandparents' in updates) patch.invite_grandparents      = updates.inviteGrandparents;
    if ('isOpenToTeens'      in updates) patch.is_open_to_teens         = updates.isOpenToTeens;
    if ('recurrenceRule'     in updates) patch.recurrence_rule          = updates.recurrenceRule;
    if ('shoppingItems'        in updates) patch.shopping_items             = updates.shoppingItems;
    if ('shoppingStore'        in updates) patch.shopping_store             = updates.shoppingStore;
    if ('shoppingBudget'       in updates) patch.shopping_budget            = updates.shoppingBudget;
    if ('gpWithdrawnIds' in (updates as any)) patch.gp_withdrawn_ids       = (updates as any).gpWithdrawnIds ?? [];
    if ('reviewAckIds' in (updates as any)) patch.review_ack_ids          = (updates as any).reviewAckIds ?? [];
    if ('isDisabled'  in (updates as any)) patch.is_disabled               = (updates as any).isDisabled;
    if ('rewardPendingReview' in (updates as any)) patch.reward_pending_review = (updates as any).rewardPendingReview;
    if ('gpOfferById'   in (updates as any)) patch.gp_offer_by_id             = (updates as any).gpOfferById ?? null;
    if ('maxClaimants'  in (updates as any)) patch.max_claimants              = (updates as any).maxClaimants ?? null;
    if ('receiptPhotoUrl'      in updates) patch.receipt_photo_url          = updates.receiptPhotoUrl ?? null;
    if ('receiptAmount'        in updates) patch.receipt_amount             = updates.receiptAmount ?? null;
    if ('receiptNote'          in updates) patch.receipt_note               = updates.receiptNote ?? null;
    if ('receiptSubmittedAt'   in updates) patch.receipt_submitted_at       = updates.receiptSubmittedAt ?? null;
    if ('receiptReimbursedAt'  in updates) patch.receipt_reimbursed_at      = updates.receiptReimbursedAt ?? null;
    if ('submissionNote'     in updates) patch.submission_note          = updates.submissionNote ?? null;
    if ('proofNotes'         in updates) patch.proof_notes              = updates.proofNotes ?? null;
    if ('submissionPhotoUrl' in updates) patch.submission_photo_url     = updates.submissionPhotoUrl ?? null;
    if ('rejectionReason'    in updates) patch.rejection_reason         = updates.rejectionReason ?? null;
    if ('parentNote'         in updates) patch.parent_note              = updates.parentNote ?? null;
    if ('submittedAt'        in updates) patch.submitted_at             = updates.submittedAt ?? null;
    if ('approvedAt'         in updates) patch.approved_at              = updates.approvedAt ?? null;
    if ('reviewedAt'         in updates) patch.reviewed_at              = updates.reviewedAt ?? null;
    if ('reviewedById'       in updates) patch.reviewed_by_id           = updates.reviewedById ?? null;
    if ('declinedAt'         in updates) patch.declined_at              = updates.declinedAt ?? null;
    if ('linkedEventId'      in updates) patch.linked_event_id          = updates.linkedEventId ?? null;
    if ('redoCount'          in updates) patch.redo_count               = updates.redoCount;
    if ('cheers'             in updates) patch.cheered_by               = updates.cheers;
    if ('disputeStatus'      in (updates as any)) patch.dispute_status  = (updates as any).disputeStatus ?? null;
    if ('disputeReason'      in (updates as any)) patch.dispute_reason  = (updates as any).disputeReason ?? null;
    if ('disputedById'       in (updates as any)) patch.disputed_by_id  = (updates as any).disputedById ?? null;
    if ('disputedAt'         in (updates as any)) patch.disputed_at     = (updates as any).disputedAt ?? null;
    if ('reversedAt'         in (updates as any)) patch.reversed_at     = (updates as any).reversedAt ?? null;
    if ('reversedById'       in (updates as any)) patch.reversed_by_id  = (updates as any).reversedById ?? null;
    if (Object.keys(patch).length > 0) {
      const { ok } = await dbUpdate('chore_tasks', id, patch);
      if (!ok) {
        console.warn(`[choreStore] updateChore patch write failed for ${id}`);
        showToast("Couldn't save — check your connection and try again", 'error');
        return;
      }
      set(s => ({ chores: s.chores.map(c => c.id === id ? { ...c, ...updates } : c) }));
      AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    }
    // Keep a chore's linked calendar_events row (addChore's materialization,
    // above) in sync when its due date/time actually changes — otherwise
    // the calendar reminder (and anything synced from it externally) would
    // silently drift out of date with the chore itself.
    if (prevChore?.linkedEventId && ('dueDate' in updates || 'dueTime' in updates)) {
      const newDueDate = (updates as any).dueDate ?? prevChore.dueDate;
      const newDueTime = (updates as any).dueTime ?? prevChore.dueTime;
      if (newDueDate && newDueTime) {
        try {
          const { useEventStore } = require('./eventStore');
          useEventStore.getState().updateEvent(prevChore.linkedEventId, { date: newDueDate, time: newDueTime });
        } catch (e) {
          console.warn('[choreStore] updateChore linked-event sync failed', e);
        }
      }
    }
    if (prevChore) logChoreUpdateActivity(prevChore, updates, id);
    // See notifyChoreReassigned's own comment above — logChoreUpdateActivity
    // (just above) already logs this transition to the silent activity_log,
    // this is the actual live notification nothing was ever sending. Only
    // fires on a genuine reassignment to a different, real person — not a
    // pool-release (assignedToId cleared to undefined/null) and not a
    // self-claim, both of which have their own dedicated notification paths
    // (claimPoolQuest/claimBounty's quest_claimed, and pool-release needs no
    // "you got a chore" ping since nobody new was actually assigned).
    if (prevChore && 'assignedToId' in updates) {
      const newAssigneeId = (updates as any).assignedToId as string | undefined;
      if (newAssigneeId && newAssigneeId !== prevChore.assignedToId) {
        notifyChoreReassigned(
          { ...prevChore, ...updates } as ChoreTask,
          prevChore.assignedToId,
          newAssigneeId,
          getActiveMemberId(),
        );
      }
    }
  },

  deleteChore: async (id) => {
    const familyId = getFamilyId();
    const actorId = getActiveMemberId();
    const deletedChore = get().chores.find(c => c.id === id);

    // DB-is-truth: await the delete before touching local state at all —
    // was optimistic (removed locally, restored on failure).
    const { error } = await supabase.from('chore_tasks').delete().eq('id', id);
    if (error) {
      console.warn('[choreStore] delete error', error.message);
      showToast("Couldn't delete — check your connection and try again", 'error');
      return;
    }

    // Any parent_quest_assignments row referencing this chore would
    // otherwise be orphaned permanently — every render path that looks one
    // up already null-guards the missing chore (no crash/ghost card), but
    // the row itself never got cleaned up. Force-close it the same way
    // addParentQuest/resetDueRecurringChores supersede a stale open
    // assignment, rather than leaving dead rows behind.
    const now = new Date().toISOString();
    const orphaned = get().parentAssignments.filter(a => a.choreId === id);
    if (orphaned.length > 0) {
      const results = await Promise.all(orphaned.map(a =>
        dbUpdate('parent_quest_assignments', a.id, { status: 'COMPLETED', updated_at: now })
      ));
      const confirmed = orphaned.filter((_, i) => results[i].ok);
      if (confirmed.length > 0) {
        set(s => ({
          parentAssignments: s.parentAssignments.map(a =>
            confirmed.some(x => x.id === a.id) ? { ...a, status: 'COMPLETED', updatedAt: now } : a
          ),
        }));
      }
    }
    // A chore materialized as a linked calendar_events row (addChore,
    // above) would otherwise stay behind forever — including on any
    // connected external calendar, since deleteEvent is what actually
    // triggers calendar-sync-push/Apple EventKit's own delete. Deleting
    // the CHORE should delete its calendar reminder too, the same way
    // deleting a FamilyCube event deletes it from a connected calendar.
    if (deletedChore?.linkedEventId) {
      try {
        const { useEventStore } = require('./eventStore');
        await useEventStore.getState().deleteEvent(deletedChore.linkedEventId);
      } catch (e) {
        console.warn('[choreStore] deleteChore linked-event cleanup failed', e);
      }
    }
    set(s => ({ chores: s.chores.filter(c => c.id !== id) }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    logActivity({ entityType: 'chore', entityId: id, familyId, actorId, action: 'deleted' });
    // Audit finding (same shape as the addChore assignment gap): a chore
    // with a live assignee got permanently deleted with ZERO signal to
    // that person — they'd only notice it vanished from their list. Only
    // fires when there was actually someone to tell, and never tells the
    // deleter about their own action.
    if (deletedChore?.assignedToId && deletedChore.assignedToId !== actorId && familyId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'chore_deleted', familyId, memberIds: [deletedChore.assignedToId], persist: true,
          excludeMemberId: actorId ?? undefined,
          payload: { questId: id, questTitle: deletedChore.title, byName: memberName(actorId) },
        },
      }).catch(e => console.warn('[choreStore] deleteChore notify failed:', e?.message));
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MULTI-SLOT BOUNTY CLAIMING (maxClaimants > 1) ─────────────────────────
  // "Up to N kids can claim" already had a full built UI (AddQuestAssignSection's
  // picker, QuestCard's "Full — X/Y claimed" copy) but no backend — this is
  // the actual implementation, tracked via the separate bounty_claims table
  // rather than the single-claimant assignedToId field.
  // ─────────────────────────────────────────────────────────────────────────

  claimBountySlot: async (choreId, childId, onLost) => {
    const { data, error } = await supabase.rpc('claim_bounty_slot', { p_chore_id: choreId, p_member_id: childId });
    if (error) {
      console.warn('[choreStore] claimBountySlot RPC failed', error.message);
      return;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.claimed) {
      console.warn('[choreStore] claimBountySlot lost — bounty full or already claimed by this member', choreId);
      if (onLost) onLost('claimed');
      return;
    }
    const now = new Date().toISOString();
    const claim: BountyClaim = {
      id: result.claim_id, choreId, memberId: childId, status: 'in_progress',
      claimedAt: now, createdAt: now,
    };
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? { ...c, claims: [...(c.claims ?? []), claim] } : c),
    }));
    showToast('Claimed ✓');
    // Live-reported: "claim ... not even working" — quest-event-notifier
    // has a fully-built 'quest_claimed' case (tells parents/seniors a
    // kid just claimed a slot) that nothing in this file was ever
    // calling. Fires here alongside claimBounty/claimPoolQuest below.
    const chore = get().chores.find(c => c.id === choreId);
    if (chore?.familyId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_claimed', questId: choreId, questTitle: chore.title,
          familyId: chore.familyId, triggeredById: childId, assigneeId: childId,
        },
      }).catch(e => console.warn('[choreStore] claimBountySlot notify failed', e?.message));
    }
  },

  loadBountyClaims: async (choreId) => {
    const { data, error } = await supabase.from('bounty_claims').select('*').eq('chore_id', choreId);
    if (error) { console.warn('[choreStore] loadBountyClaims failed', error.message); return; }
    const claims: BountyClaim[] = (data ?? []).map((r: any) => ({
      id: r.id, choreId: r.chore_id, memberId: r.member_id, status: r.status,
      claimedAt: r.claimed_at, submittedAt: r.submitted_at ?? undefined,
      submissionPhotoUrl: r.submission_photo_url ?? undefined, submissionNote: r.submission_note ?? undefined,
      approvedAt: r.approved_at ?? undefined, reviewedById: r.reviewed_by_id ?? undefined,
      declinedAt: r.declined_at ?? undefined, rejectionReason: r.rejection_reason ?? undefined,
      coinsAwarded: r.coins_awarded ?? undefined, createdAt: r.created_at,
    }));
    set(s => ({ chores: s.chores.map(c => c.id === choreId ? { ...c, claims } : c) }));
  },

  submitBountyClaim: async (choreId, childId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    const claim = chore?.claims?.find(cl => cl.memberId === childId);
    if (!claim || claim.status !== 'in_progress') return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('bounty_claims')
      .update({ status: 'pending_approval', submitted_at: now, submission_photo_url: opts?.photoUrl ?? null, submission_note: opts?.note ?? null })
      .eq('id', claim.id);
    if (error) {
      console.warn('[choreStore] submitBountyClaim DB update failed', error.message);
      showToast("Couldn't submit — please try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c, claims: (c.claims ?? []).map(cl => cl.memberId === childId
          ? { ...cl, status: 'pending_approval', submittedAt: now, submissionPhotoUrl: opts?.photoUrl, submissionNote: opts?.note }
          : cl),
      } : c),
    }));
    if (chore?.familyId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: { event: 'quest_submitted', questId: choreId, questTitle: chore.title, familyId: chore.familyId, assigneeId: childId },
      }).catch(e => console.warn('[choreStore] submitBountyClaim notify', e?.message));
    }
  },

  approveBountyClaim: async (choreId, childId, reviewerId) => {
    const chore = get().chores.find(c => c.id === choreId);
    const claim = chore?.claims?.find(cl => cl.memberId === childId);
    if (!chore || !claim || claim.status !== 'pending_approval') return;
    if (!get().canApprove(reviewerId)) {
      console.warn('[choreStore] approveBountyClaim blocked — reviewer is not a parent and has no active temporary-approver grant');
      return;
    }
    const now = new Date().toISOString();
    const pts = (chore.basePoints > 0 ? chore.basePoints : chore.coinsReward) + (chore.bonusCoins ?? 0);
    const { error } = await supabase.from('bounty_claims')
      .update({ status: 'approved', approved_at: now, reviewed_by_id: reviewerId, coins_awarded: pts })
      .eq('id', claim.id);
    if (error) {
      console.warn('[choreStore] approveBountyClaim DB update failed', error.message);
      showToast("Couldn't approve — please try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c, claims: (c.claims ?? []).map(cl => cl.memberId === childId
          ? { ...cl, status: 'approved', approvedAt: now, reviewedById: reviewerId, coinsAwarded: pts }
          : cl),
      } : c),
    }));
    // Each claim pays out fully and independently — same "no split" model
    // team-clone quests already use (1.7, deliberate/unchanged this session).
    if (pts > 0) get().awardPoints(childId, choreId, pts, chore.xpReward);

    // Coordinated live-DB QA (Round 16) found chore_tasks.status never
    // rolled up when every slot resolved — claim_bounty_slot's own cap
    // check (status != 'declined') is the real source of truth for "how
    // many slots are filled," so mirror it here: once every non-declined
    // claim is approved and the count meets maxClaimants, the parent
    // chore is done and every isPool && status==='todo' visibility filter
    // (KidView, TeenView, QuestsScreen) should stop showing it as claimable.
    const claimsAfter = (chore.claims ?? []).map(cl => cl.memberId === childId ? { ...cl, status: 'approved' as const } : cl);
    const filledClaims = claimsAfter.filter(cl => cl.status !== 'declined');
    const allSlotsResolved = chore.maxClaimants != null
      && filledClaims.length >= chore.maxClaimants
      && filledClaims.every(cl => cl.status === 'approved');
    if (allSlotsResolved) {
      set(s => ({ chores: s.chores.map(c => c.id === choreId ? { ...c, status: 'approved' } : c) }));
      supabase.from('chore_tasks').update({ status: 'approved' }).eq('id', choreId)
        .then(({ error }) => {
          if (error) {
            console.warn('[choreStore] approveBountyClaim slot-rollup status update failed', error.message);
            // Bug-hunt finding: the optimistic set() above already flipped
            // the parent chore to status:'approved' — the per-slot payout
            // above is unaffected either way (already fired, independent of
            // this rollup write), but on failure the LOCAL rollup status
            // itself never actually landed, so this device would show the
            // bounty as fully resolved while every other device (and a
            // fresh resync) would still show it as claimable/in-progress.
            set(s => ({ chores: s.chores.map(c => c.id === choreId && c.status === 'approved' ? { ...c, status: chore.status } : c) }));
          }
        });
    }
    // Audit finding — the kid whose multi-slot claim was just approved (and
    // paid, above) got zero notice; they'd only see it if they reopened the
    // app. Was routed through quest-event-notifier's generic 'quest_approved'
    // event, which forwards straight to family-notifier's own generic
    // quest_approved copy — family-notifier already has a bounty-specific
    // 'bounty_claim_approved' type with richer copy ("Claim Approved! ...
    // +N🪙!") that was fully built but never actually called from anywhere
    // (dead-code audit). Call family-notifier directly with the real type
    // instead, since this is a single known recipient, not a broadcast that
    // needs quest-event-notifier's own resolution logic.
    if (chore.familyId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'bounty_claim_approved', familyId: chore.familyId, memberIds: [childId],
          payload: { questTitle: chore.title, questId: choreId, coins: pts },
          persist: true,
        },
      }).catch(e => console.warn('[choreStore] approveBountyClaim notify', e?.message));
    }
  },

  declineBountyClaim: async (choreId, childId, reviewerId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    const claim = chore?.claims?.find(cl => cl.memberId === childId);
    if (!claim || claim.status !== 'pending_approval') return;
    if (!get().canApprove(reviewerId)) {
      console.warn('[choreStore] declineBountyClaim blocked — reviewer is not a parent and has no active temporary-approver grant');
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from('bounty_claims')
      .update({ status: 'declined', declined_at: now, rejection_reason: reason ?? null, reviewed_by_id: reviewerId })
      .eq('id', claim.id);
    if (error) {
      console.warn('[choreStore] declineBountyClaim DB update failed', error.message);
      showToast("Couldn't decline — please try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c, claims: (c.claims ?? []).map(cl => cl.memberId === childId
          // Round 4 QA found reviewedById was never set on decline (unlike
          // approveBountyClaim's sibling path, which does) — a declined
          // claim's audit trail was missing who actually declined it.
          ? { ...cl, status: 'declined', declinedAt: now, rejectionReason: reason, reviewedById: reviewerId }
          : cl),
      } : c),
    }));
    // Audit finding — same gap as approveBountyClaim above, decline side:
    // the kid whose claim was just turned down got zero notice. Same fix —
    // call family-notifier directly with the bounty-specific
    // 'bounty_claim_declined' type instead of quest-event-notifier's
    // generic quest_declined forwarding, so the kid gets the actual
    // "Claim Declined" copy (with reason) family-notifier already has
    // built for this, rather than generic quest-decline wording.
    if (chore?.familyId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'bounty_claim_declined', familyId: chore.familyId, memberIds: [childId],
          payload: { questTitle: chore.title, questId: choreId, reason },
          persist: true,
        },
      }).catch(e => console.warn('[choreStore] declineBountyClaim notify', e?.message));
    }
  },

  // A kid backing out of their own claimed slot before submitting — only
  // valid while the claim is still 'in_progress' (once submitted, that's
  // the parent's decision via declineBountyClaim, not the kid's to
  // reverse). Deletes the claim row outright rather than marking it
  // 'declined' — an in-progress claim was never actually reviewed, so
  // there's nothing to keep an audit trail of, and deleting genuinely
  // frees the slot for claimBountySlot's own count to pick back up
  // immediately, matching how a fresh claim would look.
  withdrawBountyClaim: async (choreId, childId) => {
    const chore = get().chores.find(c => c.id === choreId);
    const claim = chore?.claims?.find(cl => cl.memberId === childId);
    if (!claim || claim.status !== 'in_progress') return;
    const { error } = await supabase.from('bounty_claims').delete().eq('id', claim.id);
    if (error) {
      console.warn('[choreStore] withdrawBountyClaim DB delete failed', error.message);
      showToast("Couldn't withdraw — please try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId
        ? { ...c, claims: (c.claims ?? []).filter(cl => cl.memberId !== childId) }
        : c),
    }));
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CHILD ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  claimBounty: async (choreId, childId, onLost) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'bounty' || chore.status !== 'todo') return;
    // maxClaimants > 1 is a genuinely different mechanism — claimBountySlot,
    // below — tracked per-participant via the separate bounty_claims table
    // instead of the single assignedToId field this function's CAS guards.
    if (chore.maxClaimants && chore.maxClaimants > 1) {
      await get().claimBountySlot(choreId, childId, onLost);
      return;
    }
    if (chore.assignedToId) return; // Already claimed

    // DB-is-truth: await the CAS write and only reflect a claim locally
    // once we know it actually won — was optimistic (set immediately,
    // rolled back on loss), which briefly showed the loser as the
    // claimant during the race window. Conditional WHERE assigned_to_id
    // IS NULL still ensures only the first request to actually land wins.
    _fetchedAt = 0;
    const { data, error } = await supabase.from('chore_tasks')
      .update({ assigned_to_id: childId, status: 'in_progress', is_pool: false })
      .eq('id', choreId)
      .is('assigned_to_id', null)
      .select('id');
    if (error) {
      console.warn('[choreStore] claimBounty DB update failed', error.message);
      showToast("Couldn't claim — please try again", 'error');
      return;
    }
    if (!data || data.length === 0) {
      console.warn('[choreStore] claimBounty lost the race on', choreId);
      // Spec 3.4 — distinguish "someone else claimed it" from "it was
      // deleted": a follow-up existence check is the only way to tell
      // the two apart, since both produce the same 0-row CAS result.
      if (onLost) {
        const { data: stillExists } = await supabase.from('chore_tasks').select('id').eq('id', choreId).maybeSingle();
        onLost(stillExists ? 'claimed' : 'deleted');
      }
      return;
    }
    // Deep QA trace found this diverged from every sibling claim path
    // (claimPoolQuest, claimBountySlot) in two ways: it left status at
    // 'todo' instead of 'in_progress' (meaning propose_terms_change's
    // status==='in_progress' guard rejected editing terms on a claimed
    // single-claimant bounty, unlike a pool-quest claim), AND it never
    // set isPool: false at all — so a claimed bounty stayed isPool:true,
    // status:'todo', letting it re-appear as still-open in any pool
    // filter that checks isPool+status without also checking
    // !assignedToId (several of the app's own pool filters do exactly
    // that). Both are fixed here to match every other claim path.
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? { ...c, assignedToId: childId, status: 'in_progress', isPool: false } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    // Audit finding — the comment on claimBountySlot above (and this
    // file's own quest-event-notifier routing-matrix doc comment) both
    // claimed claimBounty already fired 'quest_claimed' alongside it;
    // verified false — this single-claimant path called nothing at all.
    // Tells parents/seniors a kid just claimed a bounty, same event
    // claimBountySlot fires for the multi-slot case.
    if (chore.familyId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_claimed', questId: choreId, questTitle: chore.title,
          familyId: chore.familyId, triggeredById: childId, assigneeId: childId,
        },
      }).catch(e => console.warn('[choreStore] claimBounty notify failed', e?.message));
    }
  },

  // General-purpose pool-quest claim with the same first-write-wins
  // compare-and-swap protection as claimBounty, but usable for ANY
  // isPool chore regardless of categoryType. claimBounty itself is
  // hard-gated to categoryType === 'bounty', and it turns out every
  // reachable "Claim" button in the live UI (KidView, TeenView,
  // QuestsScreen — all via choreAdapter's claimQuest) goes through a
  // plain unconditional updateChore() with no WHERE guard at all, meaning
  // spec scenario 1.1/3.1's two-kids-claim-the-same-quest race had no
  // actual protection on any path a user can reach. This mirrors
  // claimBounty's exact CAS + rollback shape, generalized to any pool
  // chore, and sets status to 'in_progress' (what claimQuest's callers
  // expect) instead of 'todo'.
  claimPoolQuest: async (choreId, memberId, onLost) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    // claimPoolQuest — not claimBounty — is the actual reachable "Claim"
    // action from every live screen (see choreAdapter.ts's claimQuest
    // comment), so the multi-slot branch has to live here too, not just on
    // claimBounty's own dormant single-claimant path.
    if (chore.maxClaimants && chore.maxClaimants > 1) {
      await get().claimBountySlot(choreId, memberId, onLost);
      return;
    }
    if (chore.assignedToId) return; // Already claimed or gone

    // DB-is-truth: await the CAS write before reflecting a claim locally
    // (see claimBounty's matching comment for why — was optimistic, briefly
    // showed the loser as the claimant during the race window).
    // claimedAt — used by the chore-noshow-sweep edge function to tell
    // "claimed a while ago, gone silent" apart from "just claimed" (spec's
    // "Gone quiet — still on?" exit branch).
    const claimedAt = new Date().toISOString();
    _fetchedAt = 0;
    const { data, error } = await supabase.from('chore_tasks')
      .update({ assigned_to_id: memberId, status: 'in_progress', is_pool: false, claimed_at: claimedAt })
      .eq('id', choreId)
      .is('assigned_to_id', null)
      .select('id');
    if (error) {
      console.warn('[choreStore] claimPoolQuest DB update failed', error.message);
      showToast("Couldn't claim — please try again", 'error');
      return;
    }
    if (!data || data.length === 0) {
      console.warn('[choreStore] claimPoolQuest lost the race on', choreId, '(see spec 3.1)');
      // Spec 3.4 — same claimed-vs-deleted disambiguation as claimBounty.
      if (onLost) {
        const { data: stillExists } = await supabase.from('chore_tasks').select('id').eq('id', choreId).maybeSingle();
        onLost(stillExists ? 'claimed' : 'deleted');
      }
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? { ...c, assignedToId: memberId, status: 'in_progress', isPool: false, claimedAt } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    showToast('Claimed ✓');
    // Audit finding — same gap as claimBounty above: this is the actual
    // reachable "Claim" action from every live screen (KidView, TeenView,
    // QuestsScreen), and it fired zero notification to parents/seniors.
    if (chore.familyId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_claimed', questId: choreId, questTitle: chore.title,
          familyId: chore.familyId, triggeredById: memberId, assigneeId: memberId,
        },
      }).catch(e => console.warn('[choreStore] claimPoolQuest notify failed', e?.message));
    }
  },

  submitChore: (choreId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !['todo', 'in_progress'].includes(chore.status)) return false;

    // A recurring chore can't be submitted for a cycle that hasn't started
    // yet (e.g. tapping today on next month's instance) — on-time and late
    // (overdue/catch-up) submission are both fine, matching how "overdue"
    // is already defined elsewhere (dueDate <= today). One-time chores
    // (frequency 'once', or no recurrenceRule) are never gated by this.
    // Purely a UX pre-check (no exploit in submitting "early" — the RPC
    // below doesn't re-derive this), left client-side.
    const freq = chore.recurrenceRule?.frequency;
    if (freq && freq !== 'once' && chore.dueDate && chore.dueDate > localDateStr(new Date())) {
      return false;
    }
    if (chore.requiresPhotoProof && !opts?.photoUrl && !chore.submissionPhotoUrl) return false;

    get()._submitChoreViaRpc(choreId, chore, opts);
    return true;
  },

  // QA punch list #3 — submitChore/resubmitChore used to compose the whole
  // status transition (including which of self-assigned-parent/redo-cap-
  // auto-approve/normal-pending_approval branch to take, and the coin
  // payout itself) entirely client-side, trusting the LOCAL chore.redoCount
  // — a stale or modified client could bypass the "max 2 redo rounds, then
  // auto-approve" cap that way. Both now optimistically update local state
  // (so the UI feels instant) then call submit_chore, which re-derives
  // every branch from the DB ROW and pays out via award_coins atomically —
  // see migration 20260908130000_submit_chore_rpc.sql. Shared by
  // submitChore and resubmitChore since the server-side branch is
  // identical either way (the RPC only cares about the row's own status/
  // redo_count/created_by_id, not which client action name got there).
  _submitChoreViaRpc: async (choreId: string, chore: ChoreTask, opts?: { photoUrl?: string; note?: string }) => {
    const now = new Date().toISOString();
    // DB-is-truth: await the RPC and only reflect the transition locally
    // once its real re-derived branch (self-assigned-parent / redo-cap /
    // normal pending_approval) comes back — was optimistic (guessed
    // pending_approval immediately, corrected after). Also closes a
    // previously live-tested double-writer race: updateChore() must NEVER
    // be used here even now, since a second independent writer on the
    // same row could still land between this await and its own — this
    // function alone is the only writer of chore_tasks.status for a submit.
    const { data, error } = await supabase.rpc('submit_chore', {
      p_chore_id: choreId, p_member_id: chore.assignedToId,
      p_note: opts?.note ?? null, p_photo_url: opts?.photoUrl ?? null,
    });
    if (error) {
      console.warn('[choreStore] submit_chore RPC failed on', choreId, ':', error.message);
      showToast("Couldn't submit — please try again", 'error');
      return;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return;
    const newStatus: ChoreStatus = result.chore.status;
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c, status: newStatus,
        submissionNote: opts?.note ?? c.submissionNote,
        submissionPhotoUrl: opts?.photoUrl ?? c.submissionPhotoUrl,
        submittedAt: now,
        approvedAt: result.chore.approved_at ?? c.approvedAt,
        reviewedAt: result.chore.reviewed_at ?? c.reviewedAt,
        approvalWindowExpiresAt: result.chore.approval_window_expires_at ?? c.approvalWindowExpiresAt,
      } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    // award_coins already ran server-side inside the RPC — mirror the
    // local member-balance patch + jar-split reporting row awardPoints()
    // normally does, without re-calling award_coins a second time (that
    // would double-pay). See awardPoints()'s own comment: the RPC call
    // is the source of truth, everything else here is display/reporting.
    if (result.coins_paid > 0 && chore.assignedToId) {
      const wallet: 'mainCoins' | 'gpCoins' = chore.categoryType === 'grandparent_quest' || chore.sponsorUserId ? 'gpCoins' : 'mainCoins';
      try {
        const { useFamilyStore } = require('./familyStore');
        useFamilyStore.setState((s: any) => ({
          members: s.members.map((m: any) => m.id === chore.assignedToId
            ? wallet === 'gpCoins'
              ? { ...m, gpCoins: Math.max(0, (m.gpCoins ?? 0) + result.coins_paid), xp: Math.max(0, (m.xp ?? 0) + (chore.xpReward ?? 0)) }
              : { ...m, coins: Math.max(0, (m.coins ?? 0) + result.coins_paid), mainCoins: Math.max(0, (m.mainCoins ?? 0) + result.coins_paid), xp: Math.max(0, (m.xp ?? 0) + (chore.xpReward ?? 0)) }
            : m),
        }));
      } catch { /* familyStore not mounted yet — server balance still landed */ }
      const settings = get().householdSettings;
      const { spend, save, give } = wallet === 'gpCoins' ? { spend: result.coins_paid, save: 0, give: 0 } : calculateJarSplit(result.coins_paid, settings);
      dbInsert('point_transactions', {
        id: genId(), user_id: chore.assignedToId, chore_instance_id: choreId, amount: result.coins_paid,
        transaction_type: 'EARNED', spend_allocation: spend, save_allocation: save, give_allocation: give,
        notes: result.auto_approved ? 'Chore auto-approved (redo cap reached)' : 'Chore approved', created_at: now, wallet,
      });
    }
    if (newStatus === 'pending_approval') notifyQuestSubmitted(chore);
  },

  resubmitChore: async (choreId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'redo_requested') return;
    if (chore.requiresPhotoProof && !opts?.photoUrl && !chore.submissionPhotoUrl) return;

    // Same submit_chore RPC as submitChore — see that function's comment
    // and migration 20260908130000_submit_chore_rpc.sql. The RPC's own
    // status check already accepts 'redo_requested' as a valid starting
    // state, so no separate resubmit-specific RPC is needed; the
    // self-assigned-parent/redo-cap branches are identical either way.
    await get()._submitChoreViaRpc(choreId, chore, {
      note: opts?.note ?? chore.submissionNote,
      photoUrl: opts?.photoUrl ?? chore.submissionPhotoUrl,
    });
  },

  // QA punch list #5 — the kid's own "I did do it — ask [a parent]" path,
  // pre-payout. See migration 20260908150000_redo_dispute_rpcs.sql.
  disputeRedo: async (choreId, memberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'redo_requested' || chore.assignedToId !== memberId) return;

    const { error } = await supabase.rpc('dispute_redo', { p_chore_id: choreId, p_member_id: memberId });
    if (error) {
      console.warn('[choreStore] disputeRedo RPC failed on', choreId, ':', error.message);
      showToast("Couldn't submit — please try again", 'error');
      return;
    }
    set(s => ({ chores: s.chores.map(c => c.id === choreId ? { ...c, status: 'kid_disputed_redo' } : c) }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    showToast('Asked for a second opinion ✓');
    // Audit finding — a kid disputing a redo previously told nobody who
    // could actually act on it; parents only saw it if they happened to
    // reopen the review deck. This is a fresh "needs a decision" state,
    // same recipient set (parents + seniors) as a fresh submission.
    if (chore.familyId) {
      try {
        const { useFamilyStore } = require('./familyStore');
        // Live QA finding: this excluded only the disputing kid — the
        // one parent who genuinely CANNOT act on this dispute
        // (resolve_redo_dispute's own RPC blocks reviewedById from
        // resolving their own call) still got the "second opinion
        // needed" push alongside everyone else, which isn't a clean
        // escalation to someone new and could read as the app asking
        // that same parent to reconsider their own decision.
        const approverIds = (useFamilyStore.getState().members as any[])
          .filter(m => (m.role === 'parent' || m.role === 'senior') && m.id !== memberId && m.id !== chore.reviewedById)
          .map(m => m.id);
        if (approverIds.length) {
          supabase.functions.invoke('family-notifier', {
            body: {
              type: 'chore_redo_disputed', familyId: chore.familyId, memberIds: approverIds, persist: true,
              excludeMemberId: memberId,
              payload: { questId: choreId, questTitle: chore.title, kidName: memberName(memberId) },
            },
          }).catch(e => console.warn('[choreStore] disputeRedo notify', e?.message));
        }
      } catch (e) {
        console.warn('[choreStore] disputeRedo recipient resolution failed', e);
      }
    }
  },

  // A different parent than the one who requested the redo reviews the
  // original submission. p_pay=true approves it outright (→ 'approved',
  // real payout); p_pay=false sides with the redo (→ back to
  // 'redo_requested', the kid still has to resubmit).
  resolveRedoDispute: async (choreId, reviewerId, pay) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'kid_disputed_redo') return;

    const { data, error } = await supabase.rpc('resolve_redo_dispute', { p_chore_id: choreId, p_reviewer_id: reviewerId, p_pay: pay });
    if (error) {
      console.warn('[choreStore] resolveRedoDispute RPC failed on', choreId, ':', error.message);
      showToast("Couldn't save — please try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? { ...c, status: pay ? 'approved' as const : 'redo_requested' as const } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    const result = Array.isArray(data) ? data[0] : data;
    if (pay && result?.coins_paid > 0 && chore.assignedToId) {
      const wallet: 'mainCoins' | 'gpCoins' = chore.categoryType === 'grandparent_quest' || chore.sponsorUserId ? 'gpCoins' : 'mainCoins';
      try {
        const { useFamilyStore } = require('./familyStore');
        useFamilyStore.setState((s: any) => ({
          members: s.members.map((m: any) => m.id === chore.assignedToId
            ? wallet === 'gpCoins'
              ? { ...m, gpCoins: Math.max(0, (m.gpCoins ?? 0) + result.coins_paid), xp: Math.max(0, (m.xp ?? 0) + (chore.xpReward ?? 0)) }
              : { ...m, coins: Math.max(0, (m.coins ?? 0) + result.coins_paid), mainCoins: Math.max(0, (m.mainCoins ?? 0) + result.coins_paid), xp: Math.max(0, (m.xp ?? 0) + (chore.xpReward ?? 0)) }
            : m),
        }));
      } catch { /* familyStore not mounted yet — server balance still landed */ }
      // Mirrors the same reporting-row insert _submitChoreViaRpc's
      // auto-approve/approve branch already does — award_coins updates
      // the real balance server-side, but nothing writes the
      // point_transactions ledger row for it, so a dispute payout was
      // silently missing from the kid's own earnings history even
      // though the coins had genuinely landed (confirmed live: balance
      // matched exactly, only the ledger row was absent).
      const settings = get().householdSettings;
      const { spend, save, give } = wallet === 'gpCoins' ? { spend: result.coins_paid, save: 0, give: 0 } : calculateJarSplit(result.coins_paid, settings);
      dbInsert('point_transactions', {
        id: genId(), user_id: chore.assignedToId, chore_instance_id: choreId, amount: result.coins_paid,
        transaction_type: 'EARNED', spend_allocation: spend, save_allocation: save, give_allocation: give,
        notes: 'Redo dispute resolved in kid\'s favor', created_at: new Date().toISOString(), wallet,
      });
    }
    showToast(pay ? 'Approved ✓' : 'Sided with the redo request');
    // Audit finding — the kid never learned the outcome of a dispute
    // they raised; previously silent either way. pay=true reuses the
    // normal approval notification (same one approveChore sends); pay=
    // false gets a dedicated "the redo stands" message rather than the
    // ordinary quest_reopened copy, since this is specifically the
    // outcome of an escalation the kid asked for, not a fresh redo
    // request from the same parent.
    if (chore.assignedToId) {
      if (pay) {
        supabase.functions.invoke('quest-event-notifier', {
          body: {
            event: 'quest_approved', questId: choreId, questTitle: chore.title,
            familyId: chore.familyId, assigneeId: chore.assignedToId, coins: result?.coins_paid ?? 0,
          },
        }).catch(e => console.warn('[choreStore] resolveRedoDispute notify', e?.message));
      } else if (chore.familyId) {
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'chore_redo_dispute_resolved', familyId: chore.familyId, memberIds: [chore.assignedToId], persist: true,
            excludeMemberId: reviewerId,
            payload: { questId: choreId, questTitle: chore.title, pay: false },
          },
        }).catch(e => console.warn('[choreStore] resolveRedoDispute notify', e?.message));
      }
    }
  },

  // Citizenship 0-pt tasks: tap = immediate complete, no review needed
  instantCompleteChore: async (choreId, childId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'citizenship') return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;
    const now = new Date().toISOString();
    await get().updateChore(choreId, {
      status:      'completed',
      approvedAt:  now,
      submittedAt: now,
    });
  },

  startGrandparentQuest: async (choreId, childId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'grandparent_quest' || chore.status !== 'todo') return;
    if (chore.assignedToId && chore.assignedToId !== childId) return; // already claimed by sibling
    // Claim clears pool flag so first-come wins permanently.
    await get().updateChore(choreId, { status: 'in_progress', assignedToId: childId, isPool: false });
    showToast("You're on it ✓");
  },

  submitGrandparentQuest: async (choreId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'grandparent_quest') return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;
    const now = new Date().toISOString();
    await get().updateChore(choreId, {
      status:             'pending_grandparent_approval',
      submissionNote:     opts?.note,
      submissionPhotoUrl: opts?.photoUrl,
      submittedAt:        now,
    });
    notifyQuestSubmitted(chore);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GP ERRAND RECEIPT
  // ─────────────────────────────────────────────────────────────────────────

  // Scenario 1.6 — a GP tapping "I'll Handle It" on an openToGP chore used
  // to claim it outright (assignedToId + status:'in_progress'), with zero
  // parent involvement and no way to withdraw. Now it records an OFFER: the
  // chore stays unassigned (assignedToId untouched) but moves to
  // 'gp_offer_pending' with gpOfferById recording who offered, and parents
  // get notified to Accept/Decline. See acceptGPOffer/declineGPOffer below.
  claimGPErrand: async (choreId, gpMemberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.inviteGrandparents || chore.status !== 'todo') return;

    // DB-is-truth: await the race-safe RPC (claim_gp_errand — row-locked,
    // unique-outcome CAS) and only reflect the offer locally once it
    // actually won — was optimistic-update + rollback-on-loss, briefly
    // showing a losing GP as having sent the offer.
    _fetchedAt = 0;
    const { data, error } = await supabase.rpc('claim_gp_errand', { p_chore_id: choreId, p_gp_member_id: gpMemberId });
    if (error) {
      console.warn('[choreStore] claimGPErrand RPC failed', error.message);
      showToast("Couldn't send offer — please try again", 'error');
      return;
    }
    const claimed = Array.isArray(data) ? data[0]?.claimed : (data as any)?.claimed;
    if (!claimed) {
      // Live QA finding: this rollback previously had zero visible
      // feedback — a losing grandparent's card just silently reverted
      // (a console.warn only), which read as the tap having done
      // nothing at all. The spec's own claim-race gap (#10) calls for
      // "the second sees 'already taken'" — this toast is that signal.
      console.warn('[choreStore] claimGPErrand lost the race on', choreId, '— another GP already offered');
      showToast('Already taken by another grandparent', 'info');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? { ...c, status: 'gp_offer_pending', gpOfferById: gpMemberId } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    showToast('Offer sent ✓');

    if (chore.familyId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'gp_offer_pending',
          questId: chore.id,
          questTitle: chore.title,
          familyId: chore.familyId,
          assigneeId: gpMemberId,
        },
      }).catch(e => console.warn('[choreStore] claimGPErrand gp_offer_pending notify', e?.message));
    }
  },

  // A GP passing/reconsidering on a GP-welcome invite — see gpWithdrawnIds'
  // own comment for why this is server-persisted (per-GP, survives reload).
  // Previously called set_gp_withdrawn directly from both QuestCard.tsx and
  // QuestInvitationsSection.tsx with no local state patch on success — the
  // RPC (correctly) wrote the DB row, but nothing told choreStore.chores
  // about it, so the "🔄 Reconsider?" flip only ever appeared after a
  // realtime round-trip happened to land, making Pass look like a dead
  // button in the meantime. Fixed with the same optimistic-patch +
  // rollback-on-error shape claimGPErrand already uses for its own RPC.
  setGpWithdrawn: async (choreId, gpMemberId, withdrawn) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    const prevIds = chore.gpWithdrawnIds ?? [];
    const nextIds = withdrawn
      ? (prevIds.includes(gpMemberId) ? prevIds : [...prevIds, gpMemberId])
      : prevIds.filter(id => id !== gpMemberId);
    const { error } = await supabase.rpc('set_gp_withdrawn', { p_chore_id: choreId, p_gp_member_id: gpMemberId, p_withdrawn: withdrawn });
    if (error) {
      console.warn('[choreStore] setGpWithdrawn RPC failed', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? { ...c, gpWithdrawnIds: nextIds } : c),
    }));
    if (withdrawn) showToast('Passed ✓');
  },

  // Master-flow "hand it to a specific person" — records an offer without
  // reassigning yet (see offer_chore_handoff's own comment). Local patch is
  // optimistic on the offering device; the receiver's device picks it up
  // via realtime/sync same as any other chore field.
  offerChoreHandoff: async (choreId, toMemberId, byMemberId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    const { error } = await supabase.rpc('offer_chore_handoff', {
      p_chore_id: choreId, p_to_member_id: toMemberId, p_by_member_id: byMemberId, p_reason: reason ?? null,
    });
    if (error) {
      console.warn('[choreStore] offerChoreHandoff RPC failed', error.message);
      showToast("Couldn't send — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c,
        pendingHandoffTo: toMemberId, pendingHandoffReason: reason,
        pendingHandoffOfferedBy: byMemberId, pendingHandoffOfferedAt: new Date().toISOString(),
        rejectionReason: reason ?? c.rejectionReason,
      } : c),
    }));
    notifyChoreHandoff('chore_handoff_offered', chore.familyId, [toMemberId], byMemberId, {
      questTitle: chore.title, questId: chore.id, byName: memberName(byMemberId), reason: reason ?? undefined,
    });
  },

  // Receiver: "I've got it" — only now does the chore actually become
  // theirs. Requires a live pending_handoff_to match (server-enforced too).
  acceptChoreHandoff: async (choreId, memberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.pendingHandoffTo !== memberId) return;
    const offeredBy = chore.pendingHandoffOfferedBy;
    const { error } = await supabase.rpc('accept_chore_handoff', { p_chore_id: choreId, p_member_id: memberId });
    if (error) {
      console.warn('[choreStore] acceptChoreHandoff RPC failed', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c, assignedToId: memberId, isPool: false, status: 'todo', claimedAt: new Date().toISOString(),
        pendingHandoffTo: undefined, pendingHandoffReason: undefined,
        pendingHandoffOfferedBy: undefined, pendingHandoffOfferedAt: undefined,
      } : c),
    }));
    showToast("You're on it ✓");
    if (offeredBy) {
      notifyChoreHandoff('chore_handoff_accepted', chore.familyId, [offeredBy], memberId, {
        questTitle: chore.title, questId: chore.id, byName: memberName(memberId),
      });
    }
  },

  // Receiver: "can't either — put it back" — reopens straight to the pool,
  // no reason required (master-flow's own framing for this exact case).
  declineChoreHandoff: async (choreId, memberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.pendingHandoffTo !== memberId) return;
    const offeredBy = chore.pendingHandoffOfferedBy;
    const { error } = await supabase.rpc('decline_chore_handoff', { p_chore_id: choreId, p_member_id: memberId });
    if (error) {
      console.warn('[choreStore] declineChoreHandoff RPC failed', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c, assignedToId: undefined, isPool: true, status: 'todo',
        pendingHandoffTo: undefined, pendingHandoffReason: undefined,
        pendingHandoffOfferedBy: undefined, pendingHandoffOfferedAt: undefined,
      } : c),
    }));
    if (offeredBy) {
      notifyChoreHandoff('chore_handoff_declined', chore.familyId, [offeredBy], memberId, {
        questTitle: chore.title, questId: chore.id, byName: memberName(memberId),
      });
    }
  },

  // Master-flow "ask for a later time" — a counter-offer, not a silent
  // self-service reschedule. Releases the chore (it's genuinely not
  // happening at the original time on this assignee's plate) but leaves
  // dueDate untouched until a parent actually approves the new date.
  proposeLaterDate: async (choreId, byMemberId, newDate, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    const { error } = await supabase.rpc('propose_later_date', { p_chore_id: choreId, p_by_member_id: byMemberId, p_new_date: newDate, p_reason: reason ?? null });
    if (error) {
      console.warn('[choreStore] proposeLaterDate RPC failed', error.message);
      showToast("Couldn't send — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c,
        // Live QA finding: this used to release the chore to the open
        // pool (assignedToId: undefined, isPool: true) the instant a
        // later-date was requested — before a parent had even answered.
        // Anyone else could claim it out from under the requester while
        // the request was still pending, and neither approving NOR
        // declining ever gave it back. The server-side RPCs no longer
        // touch assignment at all for this flow (20260930350000) — the
        // requester keeps the chore the whole time, matching every other
        // "asking for a change" flow (e.g. propose_terms_change).
        pendingLaterDate: newDate, pendingLaterReason: reason,
        pendingLaterRequestedBy: byMemberId, pendingLaterRequestedAt: new Date().toISOString(),
      } : c),
    }));
    // Audit finding — proposing a later date releases the chore back
    // to the pool AND parks it awaiting a parent's Approve/Decline via
    // approveLaterDate/declineLaterDate, but no parent was ever told
    // there was a decision waiting on them.
    if (chore.familyId) {
      try {
        const { useFamilyStore } = require('./familyStore');
        const approverIds = (useFamilyStore.getState().members as any[])
          .filter(m => (m.role === 'parent' || m.role === 'senior') && m.id !== byMemberId)
          .map(m => m.id);
        if (approverIds.length) {
          supabase.functions.invoke('family-notifier', {
            body: {
              type: 'chore_later_date_proposed', familyId: chore.familyId, memberIds: approverIds, persist: true,
              excludeMemberId: byMemberId,
              payload: { questId: choreId, questTitle: chore.title, byName: memberName(byMemberId), newDate, reason },
            },
          }).catch(e => console.warn('[choreStore] proposeLaterDate notify', e?.message));
        }
      } catch (e) {
        console.warn('[choreStore] proposeLaterDate recipient resolution failed', e);
      }
    }
  },

  // Parent approves a pending later-date proposal — only now does dueDate
  // actually change.
  approveLaterDate: async (choreId, parentId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.pendingLaterDate) return;
    const newDate = chore.pendingLaterDate;
    const { error } = await supabase.rpc('approve_later_date', { p_chore_id: choreId, p_parent_id: parentId });
    if (error) {
      console.warn('[choreStore] approveLaterDate RPC failed', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c, dueDate: newDate,
        pendingLaterDate: undefined, pendingLaterReason: undefined,
        pendingLaterRequestedBy: undefined, pendingLaterRequestedAt: undefined,
      } : c),
    }));
    showToast('Reschedule approved ✓');
    // Audit finding — the proposer never learned their reschedule
    // request went through.
    if (chore.familyId && chore.pendingLaterRequestedBy && chore.pendingLaterRequestedBy !== parentId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'chore_later_date_approved', familyId: chore.familyId, memberIds: [chore.pendingLaterRequestedBy], persist: true,
          excludeMemberId: parentId,
          payload: { questId: choreId, questTitle: chore.title, newDate },
        },
      }).catch(e => console.warn('[choreStore] approveLaterDate notify', e?.message));
    }
  },

  // Parent declines a pending later-date proposal — clears it, original
  // dueDate stands. The chore was never unassigned in the first place
  // (fixed 20260930350000) — this is now a genuine no-op on assignment.
  declineLaterDate: async (choreId, parentId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.pendingLaterDate) return;
    const { error } = await supabase.rpc('decline_later_date', { p_chore_id: choreId, p_parent_id: parentId });
    if (error) {
      console.warn('[choreStore] declineLaterDate RPC failed', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c,
        pendingLaterDate: undefined, pendingLaterReason: undefined,
        pendingLaterRequestedBy: undefined, pendingLaterRequestedAt: undefined,
      } : c),
    }));
    // Audit finding — same gap as approveLaterDate's success path,
    // decline side: the proposer never learned it was turned down.
    if (chore.familyId && chore.pendingLaterRequestedBy && chore.pendingLaterRequestedBy !== parentId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'chore_later_date_declined', familyId: chore.familyId, memberIds: [chore.pendingLaterRequestedBy], persist: true,
          excludeMemberId: parentId,
          payload: { questId: choreId, questTitle: chore.title },
        },
      }).catch(e => console.warn('[choreStore] declineLaterDate notify', e?.message));
    }
  },

  // "It's not needed anymore" — only the chore's creator or a parent may
  // cancel outright (master-flow spec). Server-enforced via cancel_chore
  // rather than trusting client role state; this used to just call
  // deleteChore directly, letting ANY current assignee hard-delete a chore
  // someone else created. No optimistic local delete here (unlike this
  // file's other actions) — deleting first and rolling back on a 403 would
  // flash the chore as gone for anyone unauthorized to remove it; wait for
  // the RPC's real answer instead.
  cancelChore: async (choreId, byMemberId) => {
    // QA exploratory finding — cancel_chore was a silent hard delete: the
    // holder of a claimed chore got zero notice it was cancelled out from
    // under them, unlike every other "this chore left your hands" path
    // (handoff decline, terms-change reject) which at least reopens it
    // visibly. Capture the pre-cancel assignee before the row is gone, same
    // pattern acceptGPOffer/declineGrandparentQuest already use for their
    // own notifications.
    const chore = get().chores.find(c => c.id === choreId);
    const { data, error } = await supabase.rpc('cancel_chore', { p_chore_id: choreId, p_by_member_id: byMemberId });
    if (error) {
      console.warn('[choreStore] cancelChore RPC failed', error.message);
      showToast("Only the person who created this, or a parent, can cancel it", 'error');
      return false;
    }
    set(s => ({ chores: s.chores.filter(c => c.id !== choreId) }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    if (chore?.assignedToId && chore.assignedToId !== byMemberId) {
      try {
        const { useChatStore } = require('./chatStore');
        useChatStore.getState().sendMessage(chore.assignedToId, byMemberId,
          `🗑️ "${chore.title}" was cancelled — no longer needed, thanks anyway.`);
      } catch (e) {
        console.warn('[choreStore] cancelChore notification failed', e);
      }
    }
    return true;
  },

  // A parent accepting a pending GP offer — this is the ONLY point the
  // chore actually becomes assigned to the offering GP (assignedToId +
  // status:'in_progress'), mirroring startGrandparentQuest's claim shape.
  // Same canApprove gate as approveChore — this is a real authorization
  // decision, not just a UI convenience.
  acceptGPOffer: async (choreId, parentId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'gp_offer_pending' || !chore.gpOfferById) return;
    if (!get().canApprove(parentId)) {
      console.warn('[choreStore] acceptGPOffer blocked — reviewer', parentId, 'is not a parent and has no active temporary-approver grant');
      return;
    }
    const offeringGpId = chore.gpOfferById;

    // Now backed by the accept_gp_offer Postgres RPC (see migration
    // 20260905180000_gp_offer_rpcs.sql) — same two-field CAS (status +
    // the specific offering GP, guarding against a stale offer if GP A
    // withdrew and GP B has since offered) enforced server-side with
    // authorization checking and a real audit row.
    const { error } = await supabase.rpc('accept_gp_offer', { p_chore_id: choreId, p_parent_id: parentId });
    if (error) {
      console.warn('[choreStore] acceptGPOffer RPC failed on', choreId, ':', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId
        ? { ...c, status: 'in_progress', assignedToId: offeringGpId, gpOfferById: undefined, isPool: false }
        : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    try {
      const { useChatStore } = require('./chatStore');
      useChatStore.getState().sendMessage(offeringGpId, parentId,
        `✅ Your offer to handle "${chore.title}" was accepted — go ahead!`);
    } catch (e) {
      console.warn('[choreStore] acceptGPOffer notification failed', e);
    }
    showToast('Offer accepted ✓');
  },

  // A parent declining a pending GP offer — reverts to pre-offer 'todo',
  // still visible/claimable to any opted-in GP (inviteGrandparents/openToGP
  // is untouched, only the offer itself is undone).
  declineGPOffer: async (choreId, parentId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'gp_offer_pending' || !chore.gpOfferById) return;
    if (!get().canApprove(parentId)) {
      console.warn('[choreStore] declineGPOffer blocked — reviewer', parentId, 'is not a parent and has no active temporary-approver grant');
      return;
    }
    const offeringGpId = chore.gpOfferById;

    // Now backed by the decline_gp_offer Postgres RPC — same two-field CAS
    // and authorization check as accept_gp_offer, server-side.
    const { error } = await supabase.rpc('decline_gp_offer', { p_chore_id: choreId, p_parent_id: parentId, p_reason: reason ?? null });
    if (error) {
      console.warn('[choreStore] declineGPOffer RPC failed on', choreId, ':', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId
        ? { ...c, status: 'todo', gpOfferById: undefined, rejectionReason: reason }
        : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    try {
      const { useChatStore } = require('./chatStore');
      useChatStore.getState().sendMessage(offeringGpId, parentId,
        `💬 "${chore.title}" wasn't accepted this time${reason ? ` — "${reason}"` : ''}. Thanks for offering!`);
    } catch (e) {
      console.warn('[choreStore] declineGPOffer notification failed', e);
    }
    showToast('Declined — back in the pool ✓');
  },

  // Parent (or active temporary approver) accepts a kid's proposed chore —
  // becomes a real, live 'todo' chore assigned to whoever the kid picked,
  // with the coin reward the PARENT sets now via approve_kid_chore.
  approveKidProposedChore: async (choreId, reviewerId, coins, dueDate) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'pending_kid_proposal') return;
    if (!get().canApprove(reviewerId)) {
      console.warn('[choreStore] approveKidProposedChore blocked — reviewer', reviewerId, 'is not authorized');
      return;
    }
    const coinsReward = Math.max(0, Math.floor(coins) || 0);

    const { error } = await supabase.rpc('approve_kid_chore', { p_chore_id: choreId, p_reviewer_id: reviewerId, p_coins_reward: coinsReward, p_xp_reward: 0, p_due_date: dueDate ?? null });
    if (error) {
      console.warn('[choreStore] approveKidProposedChore RPC failed on', choreId, ':', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId
        ? { ...c, status: 'todo', coinsReward, basePoints: coinsReward, dueDate, reviewedById: reviewerId }
        : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    try {
      const { useChatStore } = require('./chatStore');
      if (chore.assignedToId) {
        useChatStore.getState().sendMessage(chore.assignedToId, reviewerId,
          `✅ "${chore.title}" was approved — ${coinsReward} coins when it's done!`);
      }
    } catch (e) {
      console.warn('[choreStore] approveKidProposedChore notification failed', e);
    }
    showToast('Chore approved ✓');
  },

  // A declined proposal was never a real, live chore — decline_kid_chore
  // deletes the row server-side.
  declineKidProposedChore: async (choreId, reviewerId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'pending_kid_proposal') return;
    if (!get().canApprove(reviewerId)) {
      console.warn('[choreStore] declineKidProposedChore blocked — reviewer', reviewerId, 'is not authorized');
      return;
    }

    const { error } = await supabase.rpc('decline_kid_chore', { p_chore_id: choreId, p_reviewer_id: reviewerId, p_reason: reason ?? null });
    if (error) {
      console.warn('[choreStore] declineKidProposedChore RPC failed on', choreId, ':', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({ chores: s.chores.filter(c => c.id !== choreId) }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    try {
      const { useChatStore } = require('./chatStore');
      if (chore.createdById) {
        useChatStore.getState().sendMessage(chore.createdById, reviewerId,
          `"${chore.title}" wasn't approved this time${reason ? ` — "${reason}"` : ''}.`);
      }
    } catch (e) {
      console.warn('[choreStore] declineKidProposedChore notification failed', e);
    }
    showToast('Declined');
  },

  acceptTermsChange: async (choreId, memberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'terms_changed' || chore.assignedToId !== memberId) return;

    const { error } = await supabase.rpc('accept_terms_change', { p_chore_id: choreId, p_member_id: memberId });
    if (error) {
      console.warn('[choreStore] acceptTermsChange RPC failed on', choreId, ':', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? { ...c, status: 'in_progress', pendingTerms: undefined } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    showToast('Still fine by you ✓');
  },

  rejectTermsChange: async (choreId, memberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'terms_changed' || chore.assignedToId !== memberId) return;

    const { error } = await supabase.rpc('reject_terms_change', { p_chore_id: choreId, p_member_id: memberId });
    if (error) {
      console.warn('[choreStore] rejectTermsChange RPC failed on', choreId, ':', error.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId
        ? { ...c, status: 'todo', isPool: true, assignedToId: undefined, claimedAt: undefined, pendingTerms: undefined }
        : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
    showToast('Handed back ✓');
    // Audit finding — the parent who proposed the terms change (coins/
    // due-date edit on an already-claimed chore) never learned the
    // claimant handed it back instead of accepting — they'd only see it
    // if they happened to reopen the pool and notice it was open again.
    const proposerId = chore.pendingTerms?.changedBy;
    if (chore.familyId && proposerId && proposerId !== memberId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'chore_terms_change_rejected', familyId: chore.familyId, memberIds: [proposerId], persist: true,
          excludeMemberId: memberId,
          payload: { questId: choreId, questTitle: chore.title, byName: memberName(memberId) },
        },
      }).catch(e => console.warn('[choreStore] rejectTermsChange notify', e?.message));
    }
  },

  // The offering GP retracting their own offer before a parent acts on it —
  // reverts to 'todo', same end state as declineGPOffer minus the parent's
  // decision and notification.
  withdrawGPOffer: async (choreId, gpMemberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'gp_offer_pending' || chore.gpOfferById !== gpMemberId) return;

    // Now backed by the withdraw_gp_offer Postgres RPC — returns null
    // (not an error) when the offer was already resolved by someone else.
    const { data, error } = await supabase.rpc('withdraw_gp_offer', { p_chore_id: choreId, p_gp_member_id: gpMemberId });
    if (error) { console.warn('[choreStore] withdrawGPOffer RPC failed', error.message); return; }
    if (!data) {
      console.warn('[choreStore] withdrawGPOffer lost the race on', choreId, '— offer already resolved (accepted/declined) underneath, re-syncing from DB');
      await get().syncFromDB(true);
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? { ...c, status: 'todo', gpOfferById: undefined } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    _fetchedAt = 0;
  },

  // Scenario 4.2/4.6 — a GP completing a plain errand with no receipt/
  // reimbursement data attached auto-completes instantly (status straight
  // to 'auto_approved', the same terminal "done and paid" status the
  // parent-self-assign auto-complete path already uses — see submitChore's
  // isSelfAssignedByParent branch above), with a lightweight informational
  // ping to parents (not an approval request) — never a coin payout, since
  // a grandparent doing the work never earns coins (master-flow spec: "no
  // coin field at all" for GP/parent tasks). A submission that DOES carry
  // receipt/reimbursement data still routes to 'pending_approval' for real
  // parent review, unchanged from before.
  submitGPErrandReceipt: async (choreId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.inviteGrandparents) return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;

    const hasReceiptData = !!(opts.receiptPhotoUrl || opts.receiptAmount != null || opts.receiptNote);
    const now = new Date().toISOString();

    if (!hasReceiptData) {
      await get().updateChore(choreId, {
        status:      'auto_approved',
        approvedAt:  now,
        reviewedAt:  now,
        submittedAt: now,
      });
      // Master-flow spec audit finding: this function is only ever called
      // from SeniorView.tsx (features/hub/SeniorView.tsx:333,359,923) —
      // chore.assignedToId here is always the grandparent submitting their
      // own errand, never a kid/teen. Coins/stars exist ONLY when a kid or
      // teen does the work; a grandparent-done task has no coin field at
      // all, not a zeroed one. This branch previously called awardPoints
      // regardless, paying real coins into the GP's own mainCoins/gpCoins
      // wallet — a direct spec violation, confirmed live as a real bug,
      // not just a UI gap. Removed entirely: a GP errand with no receipt
      // is logged and thanked (the chat ping below), never paid.
      // Informational-only ping to parents — mirrors the sponsor-notification
      // pattern (chatStore.sendMessage via require()-based cross-store call)
      // approveChore already uses for GP-sponsored quests, just addressed to
      // parents instead of the sponsor since there's no separate sponsor here.
      try {
        const { useFamilyStore } = require('./familyStore');
        const { useChatStore } = require('./chatStore');
        const gp = useFamilyStore.getState().members.find((m: any) => m.id === chore.assignedToId);
        const parents = useFamilyStore.getState().members.filter((m: any) => m.role === 'parent');
        for (const parent of parents) {
          if (!chore.assignedToId) continue;
          useChatStore.getState().sendMessage(parent.id, chore.assignedToId,
            `✅ ${gp?.name?.split(' ')[0] ?? 'A grandparent'} finished "${chore.title}" — all done, no receipt needed!`);
        }
      } catch (e) {
        console.warn('[choreStore] submitGPErrandReceipt auto-complete notification failed', e);
      }
      return;
    }

    await get().updateChore(choreId, {
      status:              'pending_approval',  // goes to parent review deck
      receiptPhotoUrl:     opts.receiptPhotoUrl,
      receiptAmount:       opts.receiptAmount,
      receiptNote:         opts.receiptNote,
      receiptSubmittedAt:  now,
      submittedAt:         now,
    });
    notifyQuestSubmitted(chore);
  },

  acknowledgeGPReimbursement: async (choreId) => {
    await get().updateChore(choreId, { receiptReimbursedAt: new Date().toISOString() });
  },

  // GP-Welcome pool completion (QuestCard.tsx's canGpClaimPool card, Chores
  // tab). Deliberately separate from submitGPErrandReceipt above rather
  // than reusing its no-receipt branch — that function pays coins to the
  // assignee (correct for its own two callers, the Hub's receipt-submission
  // flow), but a GP completing a plain household chore they picked up
  // should NOT earn coins, same "adults don't earn coins for their own
  // chores" precedent QuestApprovalCard.tsx documents for parents. No
  // approval gate — the GP is a trusted adult, this is a self-completion,
  // not a submission awaiting review.
  completeGpWelcomeChore: async (choreId, gpMemberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.assignedToId !== gpMemberId) return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;

    const now = new Date().toISOString();
    await get().updateChore(choreId, {
      status:      'auto_approved',
      approvedAt:  now,
      reviewedAt:  now,
      submittedAt: now,
    });

    try {
      const { useFamilyStore } = require('./familyStore');
      const { useChatStore } = require('./chatStore');
      const gp = useFamilyStore.getState().members.find((m: any) => m.id === gpMemberId);
      const parents = useFamilyStore.getState().members.filter((m: any) => m.role === 'parent');
      for (const parent of parents) {
        useChatStore.getState().sendMessage(parent.id, gpMemberId,
          `✅ ${gp?.name?.split(' ')[0] ?? 'A grandparent'} finished "${chore.title}" — all done!`);
      }
    } catch (e) {
      console.warn('[choreStore] completeGpWelcomeChore notification failed', e);
    }
    showToast('Marked done ✓');
  },

  // The claiming GP giving the chore back before finishing — releases it
  // to the open pool exactly as if they'd never claimed it (any GP,
  // including this one, can claim it again). Mirrors declineGrandparentQuest's
  // "release, don't punish" shape rather than treating a change of mind as
  // a failure.
  backoutGpWelcomeChore: async (choreId, gpMemberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.assignedToId !== gpMemberId) return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;

    await get().updateChore(choreId, {
      status: 'todo', assignedToId: undefined, isPool: true, claimedAt: undefined,
    });
    showToast('Given back to the pool ✓');
  },

  // Live QA finding: only grandparents had a "give it back before starting"
  // action (backoutGpWelcomeChore above) — a kid or teen who claimed an
  // ordinary pool chore and changed their mind had no equivalent, only the
  // heavier "Can't make it?" flow (which asks for a reason and offers a
  // named handoff, not a quick undo). Mirrors backoutGpWelcomeChore's exact
  // shape for any pool chore, any non-GP claimant.
  giveBackChore: async (choreId, memberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.assignedToId !== memberId) return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;

    await get().updateChore(choreId, {
      status: 'todo', assignedToId: undefined,
      isPool: chore.categoryType !== 'parent_only_quest',
      claimedAt: undefined,
    });
    showToast('Given back to the pool ✓');
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARENT REVIEW
  // ─────────────────────────────────────────────────────────────────────────

  canApprove: (memberId) => {
    try {
      const { useFamilyStore } = require('./familyStore');
      const member = useFamilyStore.getState().members.find((m: any) => m.id === memberId);
      if (member?.role === 'parent') return true;
    } catch (e) {
      console.warn('[choreStore] canApprove role lookup failed', e);
    }
    try {
      const { useTemporaryApproverStore } = require('./temporaryApproverStore');
      return useTemporaryApproverStore.getState().isActiveApprover(memberId);
    } catch (e) {
      console.warn('[choreStore] canApprove temp-grant lookup failed', e);
      return false;
    }
  },

  approveChore: async (choreId, reviewerId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'pending_approval') return;
    if (!chore.assignedToId) return;
    // Scenarios 9.2/9.3 — reviewerId must be a parent OR hold an active
    // temporary-approver grant. This is a genuine authorization gate, not
    // just a UI convenience — approveChore pays out real coins, so it must
    // hold even if a stale/tampered client somehow calls it directly.
    if (!get().canApprove(reviewerId)) {
      console.warn('[choreStore] approveChore blocked — reviewer', reviewerId, 'is not a parent and has no active temporary-approver grant');
      return;
    }

    const now = new Date().toISOString();

    // Two parents acting on the same submission within the same round-trip
    // window (spec 3.3 — Parent-1 approves while Parent-2 declines) would
    // both pass the local `status !== 'pending_approval'` guard above
    // against the same stale starting state, and updateChore's generic
    // dbUpdate() has no WHERE-status guard — both writes would land with
    // Postgres last-writer-wins, and worse, BOTH sides' payout/redo side
    // effects (awardPoints below, or requestRedo's redo_requested flip)
    // would already have fired locally before either write even reaches
    // the DB. Guard specifically the approved/paid outcome with a
    // conditional UPDATE on the status this call started from, mirroring
    // respondToParentQuest's identical race guard.
    //
    // NOTE: the approve_chore Postgres RPC (migration
    // 20260905120000_chore_participant_rpcs.sql) exists and is the intended
    // long-term single source of truth for this transition — but it also
    // pays out via its own award_coins() call, and this function's
    // downstream side effects (jar-split PointTransaction recording via
    // awardPoints, quest-event-notifier, GP-sponsor chat, streak, grocery
    // sync, recurrence reset) all assume awardPoints below is the ONE
    // payout call. Calling the RPC here as well would double-pay. Left as a
    // raw CAS update for now rather than risk a double payout; folding this
    // specific call site fully onto the RPC (moving the jar-split/
    // notification logic server-side too) is future work, not done in this
    // pass — see the DB-driven-assignment-state plan's Phase 2 step 2 note.
    const previousStatus = chore.status;

    // Atomic audit-trail write this CAS previously skipped entirely
    // (bypassing updateChore's own activity_log logging) — approveChore
    // pays out real coins and had zero record of who approved what until
    // now. Fire-and-forget, matching every other logActivity call site.
    logActivity({
      entityType: 'chore', entityId: choreId, familyId: chore.familyId, actorId: reviewerId,
      action: 'approved', field: 'status', oldValue: previousStatus, newValue: 'approved',
    });

    // Bounty targeted at a shortlist (teamGroupId links the sibling clones for
    // display only): each kid earns the full amount independently, the moment
    // they're approved. Nobody's payout waits on or shrinks because of anyone
    // else — falls straight through to the normal single-kid payout below.

    // Award points — bonusCoins (set via the Add Quest form's "bonus" field,
    // or a Flash Bonus applied later) is paid in the SAME transaction as the
    // base reward, not a separate step, so it can't be silently forgotten or
    // left unpaid after approval. awardPoints below is the ONE payout call —
    // it used to be paired with a second, separate award_coins RPC call
    // here, which would have double-paid the base coinsReward now that
    // awardPoints itself calls award_coins (see awardPoints' own comment).
    const pointsToAward = (chore.basePoints > 0 ? chore.basePoints : chore.coinsReward) + (chore.bonusCoins ?? 0);
    // Scenario 1.13 — a Teen-created quest whose reward is still flagged
    // rewardPendingReview must not pay out here even though the work itself
    // is fully approved. The chore's work-review state (status/approvedAt
    // above) proceeds normally; only the coin payout waits on a parent
    // clearing the flag via approveTeenReward/adjustTeenReward, which pays
    // out at that point instead.
    //
    // Bug-hunt finding: this payout used to fire unconditionally right
    // after the CAS write was DISPATCHED, not after it actually resolved —
    // the CAS's own .then() correctly detected a lost race (another
    // parent/device already flipped this chore's status) but only logged a
    // warning, while awardPoints below had already run regardless. Two
    // parents approving the same submission within the same round-trip
    // window (or a network retry replaying the same approve call) could
    // double-pay real coins. Now the payout and every side effect below it
    // are gated on the CAS actually confirming THIS call won the race —
    // an already-approved/declined chore (lost race) pays out nothing and
    // stops here.
    const { data: casData, error: casError } = await supabase.from('chore_tasks')
      .update({ status: 'approved', approved_at: now, reviewed_at: now, reviewed_by_id: reviewerId })
      .eq('id', choreId)
      .eq('status', previousStatus)
      .select('id');
    if (casError) {
      console.warn('[choreStore] approveChore CAS check failed', casError.message);
      return;
    }
    if (!casData || casData.length === 0) {
      console.warn(`[choreStore] approveChore lost the race on ${choreId} — another parent's decision landed first; no payout applied here (see 4.7 dispute handling)`);
      // DB-is-truth: nothing was written locally before the CAS ran now, so
      // there's nothing to roll back — just resync to pick up whichever
      // decision actually won.
      await get().syncFromDB(true);
      return;
    }

    // CAS won — reflect the confirmed approval locally now.
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c, status: 'approved', approvedAt: now, reviewedAt: now, reviewedById: reviewerId,
      } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));

    if (pointsToAward > 0 && chore.assignedToId && !chore.rewardPendingReview) {
      // A grandparent-sponsored quest can also reach this generic approval
      // path (e.g. a parent reviews it instead of the sponsoring GP using
      // grandparentApproveAndCheer directly) — still pays out of gpCoins in
      // that case, same as the GP's own approval path, so the payout wallet
      // never depends on WHICH role happened to tap Approve.
      const wallet = chore.categoryType === 'grandparent_quest' || chore.sponsorUserId ? 'gpCoins' : 'mainCoins';
      get().awardPoints(chore.assignedToId, choreId, pointsToAward, chore.xpReward, wallet);
    }

    // 7.3 — approval pays out real coins but previously fired zero
    // notification. quest-event-notifier's 'quest_approved' case (which
    // also fires 'coins_awarded' when total > 0) already has the "Approved!
    // +N coins" copy built — reuse it rather than writing new copy.
    // coins must reflect what was ACTUALLY paid, not pointsToAward
    // unconditionally — a Teen-created quest still flagged
    // rewardPendingReview (1.13) skips the real awardPoints call above, so
    // sending pointsToAward here would tell the assignee they got coins
    // they haven't actually received yet.
    if (chore.familyId && chore.assignedToId) {
      const coinsActuallyPaid = chore.rewardPendingReview ? 0 : pointsToAward;
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_approved',
          questId: chore.id,
          questTitle: chore.title,
          familyId: chore.familyId,
          assigneeId: chore.assignedToId,
          coins: coinsActuallyPaid,
        },
      }).catch(e => console.warn('[choreStore] approveChore quest_approved notify', e?.message));
    }

    // GP-sponsored quest → also tell the sponsoring grandparent it was
    // approved, mirroring declineGrandparentQuest's established
    // sponsor-notification pattern (chatStore.sendMessage via
    // require()-based cross-store call, not the edge function).
    if (chore.sponsorUserId) {
      try {
        const { useFamilyStore } = require('./familyStore');
        const { useChatStore } = require('./chatStore');
        const kid = useFamilyStore.getState().members.find((m: any) => m.id === chore.assignedToId);
        useChatStore.getState().sendMessage(chore.sponsorUserId, reviewerId,
          `🎉 ${kid?.name?.split(' ')[0] ?? 'Your grandchild'} completed "${chore.title}" — approved!`);
      } catch (e) {
        console.warn('[choreStore] approveChore sponsor notification failed', e);
      }
    }

    // responsibility_history — same append-only audit trail the
    // Responsibility Engine reads for fairness/effort scoring. Manual
    // parent/GP approval (this function) was the one completion path that
    // never wrote here — chore-auto-approve (the cron path) always did,
    // which silently meant fairness scoring only ever saw auto-approved
    // chores and never the far more common manually-reviewed ones.
    if (chore.assignedToId && chore.familyId) {
      supabase.from('responsibility_history').insert({
        family_id: chore.familyId,
        chore_id: choreId,
        member_id: chore.assignedToId,
        category: chore.categoryType ?? 'chore',
        responsibility_type: 'chore',
        outcome: 'completed',
        effort_points: pointsToAward,
        metadata: { reviewed_by_id: reviewerId },
      }).then(({ error }) => {
        if (error) console.warn('[choreStore] responsibility_history insert', error.message);
      });
    }

    // Spec 1.9 — real streak tracking. members.streak was a static seeded
    // column, never actually touched by real completions. Only recurring
    // chores (frequency !== 'once') count toward a streak — a one-off task
    // has no "keep it going" cadence to track. On-time (approved on/before
    // dueDate, same definition submitChore/resetDueRecurringChores already
    // use for "overdue") increments the streak by 1; approved LATE (after
    // dueDate had already passed) breaks the streak back to 0 — it still
    // counts as done, just not on-schedule, matching resetDueRecurringChores'
    // rollover clock rather than inventing a separate one.
    if (chore.assignedToId && chore.recurrenceRule?.frequency && chore.recurrenceRule.frequency !== 'once') {
      const onTime = !chore.dueDate || chore.dueDate >= localDateStr(new Date());
      try {
        const { useFamilyStore } = require('./familyStore');
        const member = useFamilyStore.getState().members.find((m: any) => m.id === chore.assignedToId);
        const nextStreak = onTime ? ((member as any)?.streak ?? 0) + 1 : 0;
        useFamilyStore.getState().updateMember(chore.assignedToId, { streak: nextStreak });
      } catch (e) {
        console.warn('[choreStore] approveChore streak update failed', e);
      }
    }

    // Sync shoppingItems to grocery_items table so they appear everywhere
    if (chore.shoppingItems?.length && chore.familyId) {
      const rows = chore.shoppingItems.map((name: string) => ({
        family_id:  chore.familyId,
        name:       name.trim(),
        added_by:   chore.assignedToId,
        is_bought:  false,
        ai_generated: false,
      })).filter((r: any) => r.name);
      supabase.from('grocery_items').insert(rows).then(({ error }) => {
        if (error) console.warn('[choreStore] grocery sync after approve', error.message);
      });
    }

    // G1 — recurring chores reset back to todo for their next cycle, but not
    // instantly: resetting the moment this approval lands (same day, same
    // session) meant an approved-and-paid photo quest snapped straight back
    // to "Take Photo to Get Paid" before the teen ever left the screen. The
    // actual reset is date-gated and handled by resetDueRecurringChores,
    // called on every load.
  },

  requestRedo: async (choreId, reviewerId, reason, _presetKey) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'pending_approval') return;
    // Scenarios 9.2/9.3 — same authorization gate as approveChore.
    if (!get().canApprove(reviewerId)) {
      console.warn('[choreStore] requestRedo blocked — reviewer', reviewerId, 'is not a parent and has no active temporary-approver grant');
      return;
    }

    const newRedoCount = (chore.redoCount ?? 0) + 1;
    const now = new Date().toISOString();

    // DB-is-truth: await the RPC (request_redo — row-locked,
    // authorization-checked and CAS-guarded server-side against "another
    // parent already approved") before reflecting the redo request
    // locally, instead of setting optimistically and rolling back on a
    // lost race or authorization failure.
    const { error } = await supabase.rpc('request_redo', { p_chore_id: choreId, p_reviewer_id: reviewerId, p_reason: reason });
    if (error) {
      console.warn(`[choreStore] requestRedo RPC rejected ${choreId}:`, error.message);
      showToast("Couldn't save — please try again", 'error');
      return;
    }
    set(s => ({
      chores: s.chores.map(c => c.id === choreId ? {
        ...c,
        status:          'redo_requested' as const,
        rejectionReason: reason,
        reviewedAt:      now,
        reviewedById:    reviewerId,
        redoCount:       newRedoCount,
      } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));

    // Master-flow audit finding: every other chore-lifecycle transition
    // (approve, decline, GP-offer accept/decline) fires a notification —
    // requestRedo/requestGrandparentRedo were the one silent gap. Uses
    // quest_reopened — the edge function already had this exact case
    // built ("🔄 Another Chance! ... give it another try") with zero
    // callers anywhere in the client, which is exactly what a redo
    // request means (still workable, not a hard decline).
    if (chore.familyId && chore.assignedToId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_reopened',
          questId: chore.id,
          questTitle: chore.title,
          familyId: chore.familyId,
          assigneeId: chore.assignedToId,
          coins: chore.coinsReward,
          // Live QA finding: the reason a parent typed for the redo was
          // captured locally (rejectionReason above) but never sent here —
          // a kid got a generic "try again" push with zero indication of
          // what was actually wrong, forcing them to open the app and find
          // the reason in the chore detail screen themselves.
          reason,
        },
      }).catch(e => console.warn('[choreStore] requestRedo quest_reopened notify', e?.message));
    }
  },

  // Same shape as requestRedo, but for a grandparent's own completion review
  // (pending_grandparent_approval) — requestRedo alone silently no-ops here
  // since it only accepts pending_approval, which is exactly why
  // PendingVerifyCheerCard had no reject path at all: nothing existed for a
  // GP to call. resubmitChore (the kid-side "try again" flow) only checks
  // for status === 'redo_requested' regardless of who set it, so this
  // reuses the same status and the kid's existing resubmit flow just works.
  requestGrandparentRedo: async (choreId, grandparentId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'pending_grandparent_approval') return;

    const newRedoCount = (chore.redoCount ?? 0) + 1;
    await get().updateChore(choreId, {
      status:          'redo_requested',
      rejectionReason: reason,
      reviewedAt:      new Date().toISOString(),
      reviewedById:    grandparentId,
      redoCount:       newRedoCount,
    });

    // Same notification gap fix as requestRedo above — master-flow audit
    // finding, this sibling function had it too.
    if (chore.familyId && chore.assignedToId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_reopened',
          questId: chore.id,
          questTitle: chore.title,
          familyId: chore.familyId,
          assigneeId: chore.assignedToId,
          coins: chore.coinsReward,
          reason,
        },
      }).catch(e => console.warn('[choreStore] requestGrandparentRedo quest_reopened notify', e?.message));
    }
  },

  cheerChore: async (choreId, fromMemberId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    if ((chore.cheers ?? []).some(c => c.memberId === fromMemberId)) return; // one cheer per person
    const entry: ChoreCheer = {
      memberId: fromMemberId, at: new Date().toISOString(),
      ...(opts?.coins ? { coins: opts.coins } : {}),
      ...(opts?.note?.trim() ? { note: opts.note.trim() } : {}),
    };
    await get().updateChore(choreId, { cheers: [...(chore.cheers ?? []), entry] });
    // opts.coins was previously only ever recorded on the cheer entry for
    // display — never actually credited to the kid. cheerChore is exclusively
    // a Senior/GP feature (CheerSquadSection, features/hub/senior/), so a
    // cheer's coin amount is grandparent kudos money, same wallet as any
    // other GP-sponsored payout — the unsplit gpCoins pool, not run through
    // the Spend/Save/Give split.
    if (opts?.coins && opts.coins > 0 && chore.assignedToId) {
      get().awardPoints(chore.assignedToId, choreId, opts.coins, 0, 'gpCoins');
    }
    // event: 'chore_cheered' previously had no matching case in
    // quest-event-notifier's switch (fell to its unknown-event default,
    // silent no-op) AND never included familyId/questTitle/assigneeId,
    // which the function needs to actually resolve and notify anyone —
    // it would have 400'd even with a matching case added. Both fixed here.
    if (chore.familyId && chore.assignedToId) {
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'chore_cheered',
          questId: choreId,
          questTitle: chore.title,
          familyId: chore.familyId,
          triggeredById: fromMemberId,
          assigneeId: chore.assignedToId,
          coins: opts?.coins ?? 0,
          note: entry.note ?? undefined,
        },
      }).catch(e => console.warn('[choreStore] cheerChore notify', e?.message));
    }
  },

  approveGrandparentQuestAsParent: (choreId, parentId) => {
    // Parent approves a GP-created quest → routes to targeted kids (split points)
    // or drops to the Bounty Pool when no child was selected.
    const now = new Date().toISOString();
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    const targets = chore.targetChildIds ?? [];

    // Audit finding — the sponsoring grandparent who created this quest
    // never learned a parent actually approved and routed it; they'd only
    // find out by reopening the app and noticing the status changed.
    // Notifies regardless of which of the three routing branches below
    // runs, since all three are "a parent approved your quest," just with
    // different downstream routing.
    const notifySponsor = () => {
      if (chore.sponsorUserId && chore.familyId && chore.sponsorUserId !== parentId) {
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'grandparent_quest_routed', familyId: chore.familyId, memberIds: [chore.sponsorUserId], persist: true,
            excludeMemberId: parentId,
            payload: { questId: choreId, questTitle: chore.title, routedToPool: targets.length === 0 },
          },
        }).catch(e => console.warn('[choreStore] approveGrandparentQuestAsParent notify', e?.message));
      }
    };

    if (targets.length === 0) {
      // No kids selected → Bounty Pool. Any grandchild can claim first-come.
      // updateChore already writes this exact patch to chore_tasks itself
      // (and now rolls back on failure) — was a second, redundant dbUpdate
      // call to the same row with the same fields right after, with no
      // rollback of its own.
      get().updateChore(choreId, { status: 'todo', isPool: true, assignedToId: undefined, reviewedAt: now });
      notifySponsor();
      return;
    }
    if (targets.length === 1) {
      // Single targeted kid → assign directly, full points. Same
      // already-covered-by-updateChore redundancy as above.
      get().updateChore(choreId, { status: 'todo', isPool: false, assignedToId: targets[0], reviewedAt: now });
      notifySponsor();
      return;
    }

    // 2+ kids → a bounty targeted at a specific shortlist. Each kid gets their
    // own clone for the FULL point value, not a split — one kid backing out
    // must never shrink what the others earn. teamGroupId only links the
    // clones for a single consolidated review card; it no longer gates payout.
    const teamGroup = `team_${choreId}`;
    console.log(`[choreStore] approveGrandparentQuestAsParent → bounty ${teamGroup}: ${targets.length} kids × ${chore.basePoints} pts each`);
    // updateChore already writes this same patch to chore_tasks itself
    // (with rollback on failure) — was a second, redundant dbUpdate call to
    // the same row right after.
    get().updateChore(choreId, {
      status: 'todo', isPool: false, assignedToId: targets[0],
      teamGroupId: teamGroup, targetChildIds: targets, reviewedAt: now,
    });
    for (const targetKid of targets.slice(1)) {
      const cloneId = genId();
      set(s => ({
        chores: [{
          ...chore, id: cloneId, assignedToId: targetKid, status: 'todo', isPool: false,
          teamGroupId: teamGroup, targetChildIds: targets, reviewedAt: now,
        }, ...s.chores],
      }));
      dbInsert('chore_tasks', {
        id: cloneId, title: chore.title, description: chore.description,
        category_type: 'grandparent_quest', base_points: chore.basePoints, coins_reward: chore.coinsReward,
        xp_reward: chore.xpReward, status: 'todo', assigned_to_id: targetKid, is_pool: false,
        sponsor_user_id: chore.sponsorUserId, target_child_ids: targets,
        team_group_id: teamGroup, quest_mode: chore.questMode ?? null,
        requires_photo: chore.requiresPhotoProof, family_id: chore.familyId ?? getFamilyId(),
        due_date: chore.dueDate ?? null, created_at: now,
      }).then(({ ok }) => {
        // Was never checked — a failed clone insert (e.g. RLS rejection)
        // still left a phantom "assigned" chore card in local state for a
        // kid who, server-side, was never actually given anything to do.
        if (!ok) {
          set(s => ({ chores: s.chores.filter(c => c.id !== cloneId) }));
          showToast("Couldn't create this kid's copy — check your connection and try again", 'error');
        }
      });
    }
    notifySponsor();
  },

  declineGrandparentQuestAsParent: (choreId, parentId, reason) => {
    // updateChore already writes this same patch to chore_tasks itself
    // (with rollback on failure) — was a second, redundant dbUpdate call to
    // the same row right after.
    const chore = get().chores.find(c => c.id === choreId);
    get().updateChore(choreId, {
      status:          'declined',
      rejectionReason: reason,
      reviewedAt:      new Date().toISOString(),
    });
    // Audit finding — mirrors declineGrandparentQuest's (the kid-decline
    // sibling function) existing sponsor notification, which this
    // parent-decline path never had at all.
    if (chore?.sponsorUserId && chore.familyId && chore.sponsorUserId !== parentId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'grandparent_quest_declined_by_parent', familyId: chore.familyId, memberIds: [chore.sponsorUserId], persist: true,
          excludeMemberId: parentId,
          payload: { questId: choreId, questTitle: chore.title, reason },
        },
      }).catch(e => console.warn('[choreStore] declineGrandparentQuestAsParent notify', e?.message));
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1.13 — TEEN REWARD CO-SIGN THRESHOLD
  // ─────────────────────────────────────────────────────────────────────────

  approveTeenReward: (choreId, approverId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.rewardPendingReview) return;

    get().updateChore(choreId, { rewardPendingReview: false });

    // The teen may have already finished the work and had it approved
    // before a parent got to the reward queue — approveChore/submitChore/
    // resubmitChore skipped payout while the flag was set, so pay out now
    // that it's cleared. If the work is still in progress/pending, clearing
    // the flag alone is enough: the normal payout path (now unblocked)
    // fires whenever the work itself is next approved.
    if (['approved', 'auto_approved'].includes(chore.status)) {
      const pts = (chore.basePoints > 0 ? chore.basePoints : chore.coinsReward) + (chore.bonusCoins ?? 0);
      if (pts > 0 && chore.assignedToId) {
        const wallet = chore.categoryType === 'grandparent_quest' || chore.sponsorUserId ? 'gpCoins' : 'mainCoins';
        get().awardPoints(chore.assignedToId, choreId, pts, chore.xpReward, wallet);
      }
    }

    try {
      const { useChatStore } = require('./chatStore');
      if (chore.assignedToId) {
        useChatStore.getState().sendMessage(chore.assignedToId, approverId,
          `✅ Your reward for "${chore.title}" (${chore.coinsReward}🪙) was approved!`);
      }
    } catch (e) {
      console.warn('[choreStore] approveTeenReward notification failed', e);
    }
  },

  adjustTeenReward: (choreId, approverId, newAmount) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.rewardPendingReview) return;
    const safeAmount = Math.max(0, Math.round(newAmount));

    get().updateChore(choreId, {
      coinsReward:         safeAmount,
      basePoints:          chore.basePoints > 0 ? safeAmount : chore.basePoints,
      rewardPendingReview: false,
    });

    if (['approved', 'auto_approved'].includes(chore.status)) {
      const pts = safeAmount + (chore.bonusCoins ?? 0);
      if (pts > 0 && chore.assignedToId) {
        const wallet = chore.categoryType === 'grandparent_quest' || chore.sponsorUserId ? 'gpCoins' : 'mainCoins';
        get().awardPoints(chore.assignedToId, choreId, pts, chore.xpReward, wallet);
      }
    }

    try {
      const { useChatStore } = require('./chatStore');
      if (chore.assignedToId) {
        useChatStore.getState().sendMessage(chore.assignedToId, approverId,
          `✏️ Your reward for "${chore.title}" was adjusted to ${safeAmount}🪙 and approved.`);
      }
    } catch (e) {
      console.warn('[choreStore] adjustTeenReward notification failed', e);
    }
  },

  declineTeenReward: (choreId, approverId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.rewardPendingReview) return;

    // Zero the reward and clear the flag — the task itself (already worked
    // on or in progress) is left exactly as-is; only the payout amount is
    // reset to 0 so nothing pays out for it going forward.
    get().updateChore(choreId, {
      coinsReward:         0,
      basePoints:          0,
      bonusCoins:          0,
      rewardPendingReview: false,
    });

    try {
      const { useChatStore } = require('./chatStore');
      if (chore.assignedToId) {
        useChatStore.getState().sendMessage(chore.assignedToId, approverId,
          `🚫 Your requested reward for "${chore.title}" was declined${reason ? ` — "${reason}"` : ''}. The task is unaffected.`);
      }
    } catch (e) {
      console.warn('[choreStore] declineTeenReward notification failed', e);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4.7 — DISPUTED APPROVAL (TWO PARENTS DISAGREE)
  // ─────────────────────────────────────────────────────────────────────────

  flagApprovalForDiscussion: (choreId, byParentId, note) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !['approved', 'auto_approved'].includes(chore.status)) return;
    if (byParentId === chore.reviewedById) return; // can't dispute your own approval

    get().updateChore(choreId, {
      disputeStatus: 'flagged',
      disputeReason: note,
      disputedById:  byParentId,
      disputedAt:    new Date().toISOString(),
    });

    // Notify the original approving parent — never the kid (spec: a kid
    // should have no visibility into the parents' disagreement).
    try {
      const { useChatStore } = require('./chatStore');
      if (chore.reviewedById) {
        useChatStore.getState().sendMessage(chore.reviewedById, byParentId,
          `🚩 Your approval of "${chore.title}" was flagged for discussion${note ? ` — "${note}"` : ''}.`);
      }
    } catch (e) {
      console.warn('[choreStore] flagApprovalForDiscussion notification failed', e);
    }
  },

  standByApproval: (choreId, byParentId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.disputeStatus) return;

    get().updateChore(choreId, {
      disputeStatus: undefined,
      disputeReason: undefined,
      disputedById:  undefined,
      disputedAt:    undefined,
    });

    try {
      const { useChatStore } = require('./chatStore');
      if (chore.disputedById) {
        useChatStore.getState().sendMessage(chore.disputedById, byParentId,
          `${chore.title}" was reviewed again and the approval stands — no changes made.`);
      }
    } catch (e) {
      console.warn('[choreStore] standByApproval notification failed', e);
    }
  },

  acknowledgeRecentApproval: (choreId, byParentId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    if ((chore.reviewAckIds ?? []).includes(byParentId)) return;

    get().updateChore(choreId, {
      reviewAckIds: [...(chore.reviewAckIds ?? []), byParentId],
    } as any);
  },

  // The actual clawback — a real negative payout, same shape as
  // denyCashOut's gpCoins refund (awardPoints with a negative amount),
  // generalized to whichever wallet the original payout used. Only ever
  // called from requestApprovalReversal (unilateral-allowed path) or
  // coSignReversal (co-signed path) — never exposed directly to UI, so
  // every reversal always has disputeReason/disputedById/reversedById set.
  _executeReversal: (choreId, byParentId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.assignedToId) return;
    if (!['approved', 'auto_approved'].includes(chore.status)) return;

    const pointsPaid = (chore.basePoints > 0 ? chore.basePoints : chore.coinsReward) + (chore.bonusCoins ?? 0);
    const wallet = chore.categoryType === 'grandparent_quest' || chore.sponsorUserId ? 'gpCoins' : 'mainCoins';
    const now = new Date().toISOString();

    get().updateChore(choreId, {
      status:         'declined',
      declinedAt:     now,
      disputeStatus:  undefined,
      disputeReason:  reason,
      disputedById:   chore.disputedById ?? byParentId,
      disputedAt:     chore.disputedAt ?? now,
      reversedAt:     now,
      reversedById:   byParentId,
    });

    // Claw back the payout — a real negative transaction, not a silent
    // balance edit; awardPoints already writes both the point_transactions
    // audit row and the live members balance patch for a negative amount.
    if (pointsPaid > 0) {
      get().awardPoints(chore.assignedToId, choreId, -pointsPaid, 0, wallet);
    }

    try {
      const { useChatStore } = require('./chatStore');
      useChatStore.getState().sendMessage(chore.assignedToId, byParentId,
        `⚠️ The approval for "${chore.title}" was reversed by a parent${reason ? ` — "${reason}"` : ''}. ${pointsPaid > 0 ? `${pointsPaid} coins were removed from your balance.` : ''}`);
    } catch (e) {
      console.warn('[choreStore] reversal notification (assignee) failed', e);
    }
    // Real push/bell notification alongside the chat message above (kept as
    // the in-thread record) — mirrors this file's other "add a real
    // notification alongside the existing chat DM" upgrades.
    if (chore.familyId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'approval_reversed', familyId: chore.familyId, memberIds: [chore.assignedToId], persist: true,
          excludeMemberId: byParentId,
          payload: { questId: choreId, questTitle: chore.title, byName: memberName(byParentId), reason },
        },
      }).catch(e => console.warn('[choreStore] reversal notify (assignee) failed', e?.message));
    }
    // Audit finding — when this runs via the UNILATERAL path (household
    // setting allows a single parent to reverse without a co-sign), the
    // ORIGINAL approving parent (whose approval is being overridden) never
    // learned about it at all — only the co-signed path (requestApprovalReversal,
    // below) notified them, and only that a request existed, not that it
    // executed. byParentId === chore.reviewedById can't happen in practice
    // (requestApprovalReversal's own guard blocks disputing your own
    // approval before reaching here) but is excluded defensively anyway.
    if (chore.familyId && chore.reviewedById && chore.reviewedById !== byParentId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'approval_reversed', familyId: chore.familyId, memberIds: [chore.reviewedById], persist: true,
          excludeMemberId: byParentId,
          payload: { questId: choreId, questTitle: chore.title, byName: memberName(byParentId), reason },
        },
      }).catch(e => console.warn('[choreStore] reversal notify (approver) failed', e?.message));
    }
  },

  requestApprovalReversal: (choreId, byParentId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !['approved', 'auto_approved'].includes(chore.status)) return;
    if (byParentId === chore.reviewedById) return; // can't dispute your own approval

    if (get().householdSettings.allowUnilateralReversal) {
      get()._executeReversal(choreId, byParentId, reason);
      return;
    }

    // Default, safe path — needs the original approver's co-sign. No
    // financial effect happens here; the chore stays approved/paid until
    // coSignReversal actually executes it.
    get().updateChore(choreId, {
      disputeStatus: 'reversal_requested',
      disputeReason: reason,
      disputedById:  byParentId,
      disputedAt:    new Date().toISOString(),
    });

    try {
      const { useChatStore } = require('./chatStore');
      if (chore.reviewedById) {
        useChatStore.getState().sendMessage(chore.reviewedById, byParentId,
          `🚩 A reversal was requested for "${chore.title}"${reason ? ` — "${reason}"` : ''}. Nothing has changed yet — this needs your co-sign to actually reverse the payout.`);
      }
    } catch (e) {
      console.warn('[choreStore] requestApprovalReversal notification failed', e);
    }
  },

  coSignReversal: (choreId, coSigningParentId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.disputeStatus !== 'reversal_requested') return;
    // Only the ORIGINAL approving parent can co-sign — the requester
    // already agreed by definition, and this must be a second, independent
    // parent's sign-off, not the same person confirming their own request.
    if (coSigningParentId !== chore.reviewedById) return;

    // Snapshot before _executeReversal's own updateChore call clears
    // disputedById/disputeStatus as part of executing the reversal.
    const requesterId = chore.disputedById;
    get()._executeReversal(choreId, coSigningParentId, chore.disputeReason ?? '');
    // Audit finding — the parent who originally REQUESTED the reversal
    // never learned it was actually co-signed and executed; they'd only
    // find out by reopening the chore and noticing it flipped to declined.
    if (chore.familyId && requesterId && requesterId !== coSigningParentId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'approval_reversal_cosigned', familyId: chore.familyId, memberIds: [requesterId], persist: true,
          excludeMemberId: coSigningParentId,
          payload: { questId: choreId, questTitle: chore.title },
        },
      }).catch(e => console.warn('[choreStore] coSignReversal notify', e?.message));
    }
  },

  // G1 — an approved recurring chore only resets to an unassigned 'todo'
  // once its next cycle has actually arrived (daily → the next calendar
  // day, weekly/monthly → one period out from approval), not the instant
  // it's approved. Called on every load.
  //
  // Auto-approval of an expired review window itself is NOT handled
  // client-side anymore — a scanAndAutoApprove() used to run here too,
  // deciding the outcome and crediting coins directly from whichever
  // device happened to load the screen first, with no server authority,
  // no escalation check, and no CAS guard against two devices racing the
  // same payout. It also silently defeated chore-auto-approve's correct,
  // already-deployed server-side design (24h escalate-to-other-parent,
  // 48h last-resort auto-approve) by winning the race to auto-approve
  // immediately on app-open, before escalation ever got a chance to fire.
  // Removed per explicit product direction: every state transition must be
  // a real DB/RPC write the server decides, not a client-side scan that
  // happens to reach the same conclusion.
  resetDueRecurringChores: () => {
    const today = localDateStr(new Date());
    const toReset = get().chores.filter(c =>
      // 'completed' is the terminal status grandparentApproveAndCheer sets
      // for a GP-sponsored quest reviewed via the GP's own approval path
      // (distinct from 'approved', which the generic approveChore path
      // uses) — a recurring GP quest approved this way never matched this
      // filter before, so it got stuck forever after cycle 1: correctly
      // completed and paid, but never reopened for its next cycle. Live QA
      // audit caught this by testing a GP-sponsored recurring quest through
      // 2+ full cycles, not just one.
      (c.status === 'approved' || c.status === 'completed') &&
      c.recurrenceRule?.frequency && c.recurrenceRule.frequency !== 'once' &&
      c.approvedAt &&
      (() => {
        const next = nextDueDate(c.approvedAt!, c.recurrenceRule.frequency, c.recurrenceRule.days, c.recurrenceRule.dayOfMonth);
        return next !== null && today >= next;
      })(),
    );
    const now = new Date().toISOString();
    for (const chore of toReset) {
      // An adult/parent_only_quest chore can be recurring AND simultaneously
      // delegated via System A (parent_quest_assignments) — the reset below
      // wipes assignedToId back to unassigned regardless, so any assignment
      // still open on this chore is about to reference a now-stale state.
      // Force-close it the same way addParentQuest supersedes a stale open
      // assignment when a fresh one starts, rather than leaving it dangling
      // as a live PENDING/ACCEPTED/PARKED/SNOOZED card nobody can act on.
      const staleOpen = get().parentAssignments.filter(a =>
        a.choreId === chore.id && !a.isLocked &&
        ['PENDING', 'ACCEPTED', 'SNOOZED', 'PARKED'].includes(a.status)
      );
      if (staleOpen.length > 0) {
        set(s => ({
          parentAssignments: s.parentAssignments.map(a =>
            staleOpen.some(x => x.id === a.id) ? { ...a, status: 'COMPLETED', updatedAt: now } : a
          ),
        }));
        for (const a of staleOpen) {
          dbUpdate('parent_quest_assignments', a.id, { status: 'COMPLETED', updated_at: now }, () => {
            set(s => ({ parentAssignments: s.parentAssignments.map(x => x.id === a.id ? a : x) }));
          });
        }
      }
      // Live QA audit found this unconditionally cleared assignedToId on
      // EVERY reset, including a directly-assigned recurring routine chore
      // (e.g. daily "Brush Teeth" assigned to one specific kid) — but
      // getChildDashboard's `routines` filter (unlike every other category)
      // has no `|| !c.assignedToId` pool fallback, by design ("Routines:
      // only mine" — see that comment). Clearing the assignee here silently
      // orphaned the chore: not assigned to anyone, not pool-visible to
      // anyone either, permanently invisible until a parent manually
      // reassigned it. A routine chore keeps its assignee across resets;
      // only genuinely poolable categories (bounty/shopping/citizenship/
      // grandparent_quest, all of which already have that fallback) should
      // ever lose their assignment here.
      const preserveAssignee = chore.categoryType === 'routine' && !chore.isPool;
      // Recurring QA sweep found dueDate was never re-anchored on reset,
      // frozen at the chore's original creation date forever — the missed-
      // cycle streak-break scan below (`dueDate < today`) became permanently
      // true starting the day after any reset, breaking a kid's streak
      // before they'd had any real chance at the new cycle. Advance it here
      // to the new cycle's own due date, same nextDueDate() calc used to
      // decide this chore was even due for reset in the first place.
      const newDueDate = nextDueDate(now, chore.recurrenceRule!.frequency, chore.recurrenceRule!.days, chore.recurrenceRule!.dayOfMonth) ?? undefined;
      get().updateChore(chore.id, {
        status:             'todo',
        assignedToId:       preserveAssignee ? chore.assignedToId : undefined,
        submittedAt:        undefined,
        submissionPhotoUrl: undefined,
        submissionNote:     undefined,
        approvedAt:         undefined,
        reviewedAt:         undefined,
        rejectionReason:    undefined,
        redoCount:          0,
        dueDate:            newDueDate,
      });
    }

    // Spec 1.9 — the missed-cycle half of streak tracking (approveChore
    // handles the on-time-vs-late-completion half). A recurring chore whose
    // dueDate has already passed while it's still sitting incomplete
    // (nobody ever submitted/approved it for this cycle at all) breaks its
    // assignee's streak — same "dueDate < today" overdue definition
    // submitChore/chore-deadline-notifier already use, scanned on the same
    // cadence as the reset-to-'todo' sweep above rather than a new cron.
    const missed = get().chores.filter(c =>
      c.assignedToId &&
      ['todo', 'in_progress', 'redo_requested'].includes(c.status) &&
      c.recurrenceRule?.frequency && c.recurrenceRule.frequency !== 'once' &&
      c.dueDate && c.dueDate < today,
    );
    if (missed.length > 0) {
      try {
        const { useFamilyStore } = require('./familyStore');
        const seen = new Set<string>();
        for (const chore of missed) {
          const memberId = chore.assignedToId!;
          if (seen.has(memberId)) continue;
          seen.add(memberId);
          const member = useFamilyStore.getState().members.find((m: any) => m.id === memberId);
          if ((member as any)?.streak > 0) {
            useFamilyStore.getState().updateMember(memberId, { streak: 0 });
          }
        }
      } catch (e) {
        console.warn('[choreStore] resetDueRecurringChores streak reset failed', e);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // POINTS ECONOMY
  // ─────────────────────────────────────────────────────────────────────────

  awardPoints: (userId, choreId, points, xp = 0, wallet = 'mainCoins') => {
    const settings = get().householdSettings;
    // Grandparent-sponsored money is a deliberately simple, unsplit pool
    // (product decision) — the Spend/Save/Give financial-literacy split
    // only applies to mainCoins, so a gpCoins payout carries the full
    // amount as "spend" on the transaction record (for reporting/history
    // only; getMemberBalance's own reducer is mainCoins-only and never
    // sums gpCoins transactions into it regardless of these fields).
    const { spend, save, give } = wallet === 'gpCoins'
      ? { spend: points, save: 0, give: 0 }
      : calculateJarSplit(points, settings);

    const tx: PointTransaction = {
      id:               genId(),
      userId,
      choreInstanceId:  choreId,
      amount:           points,
      transactionType:  'EARNED',
      spendAllocation:  spend,
      saveAllocation:   save,
      giveAllocation:   give,
      notes:            wallet === 'gpCoins' ? 'Grandparent quest approved' : 'Chore approved',
      createdAt:        new Date().toISOString(),
      wallet,
    };

    set(s => ({ transactions: [tx, ...s.transactions] }));

    // Update the member's real coin balance. There is no
    // increment_jar_balances RPC in this database (confirmed via
    // information_schema — it was called here for a long time, always
    // failing silently to a console warning) and members has no
    // spend/save/give sub-balance columns to write jar splits into anyway
    // — award_coins (members.coins/main_coins/xp, or members.gp_coins/xp
    // when wallet='gp') is the one RPC that actually exists and is the
    // real payout every caller of awardPoints needs. The jar split
    // (spend/save/give) is still computed and recorded on the
    // point_transactions row above for reporting; only the (not currently
    // persisted) per-jar running balance was ever missing.
    supabase.rpc('award_coins', {
      member_id:   userId,
      coins_delta: points,
      xp_delta:    xp,
      wallet:      wallet === 'gpCoins' ? 'gp' : 'main',
    }).then(({ error }) => {
      if (error) {
        console.warn('[choreStore] award_coins', error.message);
        // Bug-hunt finding: the familyStore balance patch below runs
        // unconditionally right after this RPC is DISPATCHED, not gated on
        // it actually succeeding — so a genuine award_coins failure (RPC
        // error, not a race) still left the local balance showing the
        // increment as if it had been paid. Reverse the same delta this
        // call applied, by decrement (not overwrite), so it can't clobber a
        // concurrent, unrelated award that landed on this member in the
        // meantime.
        try {
          const { useFamilyStore } = require('@/store/familyStore');
          useFamilyStore.setState((s: any) => ({
            members: s.members.map((m: any) => m.id === userId
              ? wallet === 'gpCoins'
                ? { ...m, gpCoins: Math.max(0, (m.gpCoins ?? 0) - points), xp: Math.max(0, (m.xp ?? 0) - xp) }
                : { ...m, coins: Math.max(0, (m.coins ?? 0) - points),
                    mainCoins: Math.max(0, (m.mainCoins ?? 0) - points),
                    xp: Math.max(0, (m.xp ?? 0) - xp) }
              : m),
          }));
        } catch { /* familyStore not mounted — nothing to roll back on-screen */ }
      }
    });

    // The RPC above is the source of truth in Postgres, but familyStore's
    // in-memory members array (what every balance display actually reads)
    // is only ever refetched once at app boot — nothing here used to patch
    // it, so an approved quest's payout was invisible on-screen until a
    // full reload. Apply the same delta locally, by increment (not by
    // overwriting with a snapshot), so it can't clobber a concurrent award
    // from another device.
    try {
      const { useFamilyStore } = require('@/store/familyStore');
      useFamilyStore.setState((s: any) => ({
        members: s.members.map((m: any) => m.id === userId
          ? wallet === 'gpCoins'
            ? { ...m, gpCoins: Math.max(0, (m.gpCoins ?? 0) + points), xp: Math.max(0, (m.xp ?? 0) + xp) }
            : { ...m, coins: Math.max(0, (m.coins ?? 0) + points),
                mainCoins: Math.max(0, (m.mainCoins ?? 0) + points),
                xp: Math.max(0, (m.xp ?? 0) + xp) }
          : m),
      }));
    } catch { /* familyStore not mounted yet — RPC write still lands */ }

    // Log transaction in DB
    dbInsert('point_transactions', {
      id:                tx.id,
      user_id:           userId,
      chore_instance_id: choreId,
      amount:            points,
      transaction_type:  'EARNED',
      spend_allocation:  spend,
      save_allocation:   save,
      give_allocation:   give,
      notes:             tx.notes,
      created_at:        tx.createdAt,
      wallet,
    });

    // Grandparent Match execution — a match rule (addGrandparentMatch) was
    // previously configuration-only: a GP could set up "match 50% of what
    // Leo saves," but nothing anywhere ever read monthlyContributedYtd,
    // watched for a jar contribution, or credited the matched amount.
    // mainCoins EARNED is the only source of jar allocations a match can
    // apply against — a gpCoins payout (this same function, wallet='gpCoins')
    // has no jars, so it can never itself trigger a match.
    if (wallet === 'mainCoins') {
      get().applyGrandparentMatches(userId, { spend, save, give });
    }
  },

  // For each active match rule targeting this child, checks the jar the
  // rule matches against (matchJar), computes the matched amount
  // (FIXED_PERCENTAGE of that jar's contribution from THIS earn event, or
  // FIXED_AMOUNT flat per earn event — GOAL_PLEDGE has no per-earn trigger,
  // it's a lump pledge toward goalTarget, not matched incrementally),
  // clamps it against maxMonthlyContribution, credits the grandparent's
  // own gpCoins... no — credits the CHILD's gpCoins (the match is money
  // the grandparent is contributing TO the child), and advances
  // monthlyContributedYtd. Silently no-ops for any rule that's inactive,
  // has no matching jar contribution this event, or has already hit its
  // monthly cap.
  applyGrandparentMatches: (childId, jarAmounts) => {
    const rules = get().grandparentMatches.filter(m => m.isActive && m.childId === childId);
    if (rules.length === 0) return;

    for (const rule of rules) {
      if (rule.matchType === 'GOAL_PLEDGE') continue; // lump pledge, not a per-earn match
      const jarContribution =
        rule.matchJar === 'SAVE' ? jarAmounts.save :
        rule.matchJar === 'GIVE' ? jarAmounts.give :
        rule.matchJar === 'SPEND' ? jarAmounts.spend : 0;
      if (jarContribution <= 0) continue;

      let matched = rule.matchType === 'FIXED_PERCENTAGE'
        ? Math.round(jarContribution * ((rule.matchValue ?? 0) / 100))
        : (rule.matchValue ?? 0); // FIXED_AMOUNT — flat per earn event this jar was touched
      if (matched <= 0) continue;

      if (rule.maxMonthlyContribution != null) {
        const remaining = rule.maxMonthlyContribution - rule.monthlyContributedYtd;
        if (remaining <= 0) continue; // cap already hit this month
        matched = Math.min(matched, remaining);
      }

      get().awardPoints(childId, '', matched, 0, 'gpCoins');

      const newYtd = rule.monthlyContributedYtd + matched;
      set(s => ({
        grandparentMatches: s.grandparentMatches.map(m =>
          m.id === rule.id ? { ...m, monthlyContributedYtd: newYtd } : m
        ),
      }));
      // The match itself already paid out via awardPoints above (real
      // coins, not reversible here) — but if THIS write fails, the
      // monthly-cap counter silently desyncs from what was actually paid,
      // which could let a future match exceed the grandparent's intended
      // monthly cap. Roll the local counter back to what's actually
      // persisted so the next run's cap check is still accurate.
      dbUpdate('grandparent_matches', rule.id, { monthly_contributed_ytd: newYtd }, () => {
        set(s => ({
          grandparentMatches: s.grandparentMatches.map(m => m.id === rule.id ? rule : m),
        }));
      });

      // Let the grandparent know their match actually fired — a match with
      // no visible confirmation is indistinguishable from one that's
      // silently broken.
      try {
        const { useFamilyStore } = require('./familyStore');
        const { useChatStore } = require('./chatStore');
        const child = useFamilyStore.getState().members.find((m: any) => m.id === childId);
        useChatStore.getState().sendMessage(rule.grandparentId, childId,
          `🌱 Your match kicked in — ${matched} bonus coins added for ${child?.name?.split(' ')[0] ?? 'your grandchild'}'s saving!`);
      } catch (e) {
        console.warn('[choreStore] applyGrandparentMatches notify failed', e);
      }
    }
  },

  requestCashOut: (userId, points, override, wallet = 'mainCoins') => {
    const settings = get().householdSettings;
    if (points < settings.minCashoutPoints) {
      console.warn('[choreStore] Cash-out below minimum', points);
      return;
    }

    if (wallet === 'gpCoins') {
      // gpCoins is a flat, unsplit pool (product decision) — no Spend/Save/
      // Give jars apply, so this validates against the member's actual
      // gp_coins balance (familyStore, not getMemberBalance's mainCoins-
      // only reducer) and records the transaction with the full amount as
      // a single flat allocation, not a 3-way jar split.
      const { useFamilyStore } = require('./familyStore');
      const member = useFamilyStore.getState().members.find((m: any) => m.id === userId);
      const gpBalance = member?.gpCoins ?? 0;
      if (points > gpBalance) {
        console.warn('[choreStore] GP cash-out exceeds balance', points, gpBalance);
        return;
      }
      const gpTx: PointTransaction = {
        id:              genId(),
        userId,
        amount:          points,
        transactionType: 'CASH_OUT',
        spendAllocation: points, saveAllocation: 0, giveAllocation: 0,
        notes:           `Cash-out request: ${points} pts (Grandparent Bonus)`,
        createdAt:       new Date().toISOString(),
        wallet:          'gpCoins',
      };
      set(s => ({ transactions: [gpTx, ...s.transactions] }));
      dbInsert('point_transactions', {
        id: gpTx.id, user_id: userId, amount: points, transaction_type: 'CASH_OUT',
        spend_allocation: points, save_allocation: 0, give_allocation: 0,
        notes: gpTx.notes, created_at: gpTx.createdAt, wallet: 'gpCoins',
      });
      // gpCoins has no derived-balance reducer the way getMemberBalance
      // computes mainCoins from transactions (which treats a pending
      // CASH_OUT as an immediate deduction without touching the literal
      // members.main_coins column). gpCoins IS the literal balance, so the
      // same "money is earmarked the moment a request is filed" behavior
      // requires an actual deduction here — refunded explicitly by
      // denyCashOut if the parent declines it.
      get().awardPoints(userId, '', -points, 0, 'gpCoins');
      notifyCashOutRequested(userId, points);
      return;
    }

    // A kid could otherwise request a cash-out for more points than they
    // actually have — nothing previously checked requested points against
    // getMemberBalance before writing the CASH_OUT transaction that
    // immediately counts against their balance (see getMemberBalance's
    // reducer below, which treats every CASH_OUT row as an instant
    // deduction regardless of approval state). Block it here the same way
    // the UI's CashOutSheet already clamps its slider to bal.total — this
    // is the store-level guard the client-only clamp had no backstop for.
    const bal = get().getMemberBalance(userId);
    if (points > bal.total) {
      console.warn('[choreStore] Cash-out exceeds balance', points, bal.total);
      return;
    }

    const { spend, save, give } = calculateJarSplit(points, settings, override);

    const tx: PointTransaction = {
      id:              genId(),
      userId,
      amount:          points,
      transactionType: 'CASH_OUT',
      spendAllocation: spend,
      saveAllocation:  save,
      giveAllocation:  give,
      notes:           `Cash-out request: ${points} pts`,
      createdAt:       new Date().toISOString(),
      wallet:          'mainCoins',
    };

    set(s => ({ transactions: [tx, ...s.transactions] }));
    dbInsert('point_transactions', {
      id:               tx.id,
      user_id:          userId,
      amount:           points,
      transaction_type: 'CASH_OUT',
      spend_allocation: spend,
      save_allocation:  save,
      give_allocation:  give,
      notes:            tx.notes,
      created_at:       tx.createdAt,
      wallet:           'mainCoins',
    });
    // Logged QA gap, fixed: getMemberBalance's derived ledger correctly
    // treats a pending CASH_OUT as an instant deduction (the transaction
    // row inserted above), but members.main_coins — the literal column
    // the Store tab and redeem_reward's own balance check both read
    // directly — was never touched by a mainCoins cash-out request. A kid
    // could request a cash-out for their whole balance, then immediately
    // spend that same (still-literally-present) main_coins balance on a
    // Store reward before a parent ever approved the cash-out — the same
    // coins spent twice. Mirrors gpCoins' own earmark-at-request-time
    // pattern (see the gpCoins branch above), refunded by denyCashOut
    // below if the parent declines.
    try {
      const { useFamilyStore } = require('@/store/familyStore');
      useFamilyStore.getState().awardCoins(userId, -points, 'mainCoins');
    } catch (e) { console.warn('[choreStore] requestCashOut mainCoins earmark failed', e); }
    notifyCashOutRequested(userId, points);
  },

  settleCashOut: (transactionId, method) => {
    const prevTx = get().transactions.find(tx => tx.id === transactionId);
    const newNotes = `${prevTx?.notes ?? ''} [Settled: ${method}]`;
    set(s => ({
      transactions: s.transactions.map(tx =>
        tx.id === transactionId ? { ...tx, notes: newNotes } : tx
      ),
    }));
    // Was writing the bare literal "Settled: X" to the DB — discarding
    // whatever the transaction's original notes text was there, diverging
    // from the full `${prior} [Settled: X]` string applied to local state
    // above. Also had no rollback: a failed write left local state showing
    // "settled" forever with the DB never actually reflecting it.
    dbUpdate('point_transactions', transactionId, { notes: newNotes }, () => {
      set(s => ({ transactions: s.transactions.map(tx => tx.id === transactionId && prevTx ? prevTx : tx) }));
    }).then(({ ok }) => {
      // Audit finding — the kid never learned their cash-out was settled;
      // gated on the write actually landing, same pattern denyCashOut's
      // gpCoins refund already uses.
      if (ok) notifyCashOutDecision('cashout_settled', prevTx, { method });
    });
  },

  approveCashOut: (transactionId) => {
    const prevTx = get().transactions.find(tx => tx.id === transactionId);
    const newNotes = `${prevTx?.notes ?? ''} [Approved]`;
    set(s => ({
      transactions: s.transactions.map(tx =>
        tx.id === transactionId ? { ...tx, notes: newNotes } : tx
      ),
    }));
    // Same bare-literal-overwrite bug as settleCashOut above, plus no
    // rollback on failure.
    dbUpdate('point_transactions', transactionId, { notes: newNotes }, () => {
      set(s => ({ transactions: s.transactions.map(tx => tx.id === transactionId && prevTx ? prevTx : tx) }));
    }).then(({ ok }) => {
      // Audit finding — the kid never learned their cash-out was approved.
      if (ok) notifyCashOutDecision('cashout_approved', prevTx);
    });
  },

  denyCashOut: (transactionId) => {
    // For a mainCoins cash-out, tagging the row "[Denied]" IS the actual
    // reversal — see getMemberBalance above, which excludes any CASH_OUT
    // transaction whose notes contain "[Denied]" from the running balance
    // (that reducer derives the whole balance from transactions, so
    // excluding one row is enough). gpCoins has no equivalent derived-
    // balance reducer — familyStore.members.gpCoins is the literal balance,
    // and requestCashOut's gpCoins branch explicitly deducts it up front
    // (earmarking the request, same "money leaves the moment it's asked
    // for" behavior mainCoins gets implicitly from the reducer) — so a
    // denied GP cash-out must be credited back explicitly here, below.
    const tx = get().transactions.find(t => t.id === transactionId);
    const newNotes = `${tx?.notes ?? ''} [Denied]`;
    set(s => ({
      transactions: s.transactions.map(t =>
        t.id === transactionId ? { ...t, notes: newNotes } : t
      ),
    }));
    // Was writing the bare literal "[Denied]" (discarding the transaction's
    // original notes text) and refunding gpCoins UNCONDITIONALLY regardless
    // of whether this write actually succeeded — a failed write here left
    // local state showing "denied" (balance looks right on this device)
    // while the DB's row was never actually tagged, AND the gpCoins refund
    // had already fired. A later sync reading the still-untagged DB row
    // back could then look "un-denied" while the coins were already
    // refunded once — a real double-payout vector. Gate the refund on the
    // write actually landing, using dbUpdate's returned promise instead of
    // firing it unconditionally right after the fire-and-forget call.
    dbUpdate('point_transactions', transactionId, { notes: newNotes }, () => {
      set(s => ({ transactions: s.transactions.map(t => t.id === transactionId && tx ? tx : t) }));
    }).then(({ ok }) => {
      if (ok && tx?.userId && (tx.wallet === 'gpCoins' || tx.wallet === 'mainCoins')) {
        // Explicit refund of the LITERAL column for both wallets now.
        // gpCoins never had a derived-balance reducer (members.gpCoins IS
        // the literal balance). mainCoins used to rely entirely on
        // getMemberBalance's [Denied]-exclusion reducer for the Quests
        // tab — but requestCashOut's mainCoins branch now also earmarks
        // the literal main_coins column at request time (logged QA gap,
        // fixed, to close a real double-spend against the Store tab,
        // which reads that column directly) — so a denied mainCoins
        // request must now be credited back here too, not just excluded
        // from the ledger.
        get().awardPoints(tx.userId, '', tx.amount, 0, tx.wallet);
      }
      // Audit finding — the kid never learned their cash-out was denied.
      if (ok) notifyCashOutDecision('cashout_denied', tx, { refunded: tx?.wallet === 'gpCoins' || tx?.wallet === 'mainCoins' });
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BADGES
  // ─────────────────────────────────────────────────────────────────────────

  updateBadgeProgress: (userId, badgeKey, progress) => {
    set(s => {
      const existing = s.badges.find(b => b.userId === userId && b.badgeKey === badgeKey);
      if (existing) {
        return {
          badges: s.badges.map(b =>
            (b.userId === userId && b.badgeKey === badgeKey)
              ? { ...b, progress }
              : b
          ),
        };
      }
      const def = BADGE_DEFINITIONS[badgeKey];
      const target = def.tiers?.[0]?.target;
      const newBadge: UserBadge = {
        id:              genId(),
        userId,
        badgeKey,
        tier:            'STANDARD',
        progress,
        progressTarget:  target,
        bonusPerkActive: false,
        createdAt:       new Date().toISOString(),
      };
      return { badges: [...s.badges, newBadge] };
    });
    AsyncStorage.setItem(CACHE_KEY_BADGES, JSON.stringify(get().badges));
  },

  unlockBadge: (userId, badgeKey, tier = 'STANDARD') => {
    const now = new Date().toISOString();
    const prevBadge = get().badges.find(
      b => b.userId === userId && b.badgeKey === badgeKey && b.tier === tier,
    );
    if (prevBadge?.unlockedAt) return; // Already unlocked
    if (!prevBadge) return; // No local row to unlock — addBadge must run first

    set(s => ({
      badges: s.badges.map(b =>
        (b.userId === userId && b.badgeKey === badgeKey && b.tier === tier)
          ? { ...b, unlockedAt: now, bonusPerkActive: true }
          : b
      ),
    }));
    AsyncStorage.setItem(CACHE_KEY_BADGES, JSON.stringify(get().badges));
    // Was `dbUpdate('user_badges', badgeKey, ...)` — badgeKey (e.g.
    // "streak_7") was passed as the row's PRIMARY KEY, but user_badges.id is
    // a separate generated uuid; `badge_key` is just a category column, never
    // the id. `.eq('id', badgeKey)` matched zero rows every single call, so
    // this write has been a silent permanent no-op since the table was
    // created — badge unlocks only ever existed in the local AsyncStorage
    // cache, never actually persisted, and would vanish on a fresh
    // syncFromDB() or reinstall. Use the real row id instead.
    dbUpdate('user_badges', prevBadge.id, { unlocked_at: now, bonus_perk_active: true }, () => {
      set(s => ({ badges: s.badges.map(b => b.id === prevBadge.id ? prevBadge : b) }));
    });
  },

  getBadgeProgress: (userId) => {
    return get().badges.filter(b => b.userId === userId);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARENT-ONLY QUESTS
  // ─────────────────────────────────────────────────────────────────────────

  addParentQuest: async (choreId, assignedBy, assignedTo, mode = 'PULL', note) => {
    console.log(`[choreStore] addParentQuest called — choreId=${choreId} assignedBy=${assignedBy} assignedTo=${assignedTo ?? '(self)'} mode=${mode}`);
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) {
      console.warn(`[choreStore] addParentQuest ABORTED — no chore found with id=${choreId}`);
      return null;
    }
    // Was hard-gated to parent_only_quest/shopping only — a parent could
    // delegate a grocery run to their co-parent but not, say, a citizenship
    // task or a bounty they'd claimed themselves and now want to hand off.
    // The actual safety property this guard needs to enforce isn't "which
    // category," it's "both people are adults" — grandparents are welcome
    // on both sides of this handoff too (a parent can hand a quest to a
    // GP, a GP can hand one to a parent or another GP), not just parents —
    // this is an adult-to-adult Accept/Decline flow, not a general
    // reassignment tool for a kid's chore. DelegateSheet's own member
    // picker currently only offers parent-role members (a separate UI
    // gap, not fixed here); this is the real authorization boundary.
    const ADULT_ROLES = new Set(['parent', 'senior']);
    const byMember = (() => { try { const { useFamilyStore } = require('./familyStore'); return useFamilyStore.getState().members.find((m: any) => m.id === assignedBy); } catch { return null; } })();
    const toMember = (() => { try { const { useFamilyStore } = require('./familyStore'); return useFamilyStore.getState().members.find((m: any) => m.id === (assignedTo ?? assignedBy)); } catch { return null; } })();
    if (!ADULT_ROLES.has(byMember?.role) || !ADULT_ROLES.has(toMember?.role)) {
      console.warn(`[choreStore] addParentQuest ABORTED — this is an adult-to-adult handoff; assignedBy role=${byMember?.role}, assignedTo role=${toMember?.role}`);
      return null;
    }

    const now = new Date().toISOString();
    const finalAssignedTo = assignedTo ?? assignedBy;

    // Per explicit product decision: once a chore is handed parent-to-
    // parent through this flow, it becomes a real parent_only_quest going
    // forward — hidden from kid/GP visibility the same as any other
    // parent-only task, regardless of what category it started as (a
    // citizenship task, a bounty a parent had claimed themselves, etc.).
    // This isn't just "route it through the same mechanism" — the
    // category label itself changes, permanently, not only for this one
    // delegation cycle.
    if (chore.categoryType !== 'parent_only_quest') {
      console.log(`[choreStore] addParentQuest → converting chore ${choreId} categoryType from "${chore.categoryType}" to "parent_only_quest" (parent-to-parent handoff)`);
      // isPrivateParent set explicitly alongside categoryType — choreFromRow
      // (the DB→local mapper) always re-derives it live from category_type
      // on every sync, but updateChore's own local set() is a plain shallow
      // merge with no such re-derivation, so without this the in-memory
      // state would keep showing the chore as kid/GP-visible until the
      // next full syncFromDB happened to run.
      get().updateChore(choreId, { categoryType: 'parent_only_quest', isPrivateParent: true } as any);
    }

    // Only one assignment should ever be "live" per chore — a reassign or a
    // repeat delegate tap used to just pile another PENDING row on top of
    // whatever was already open, so both parents ended up seeing multiple
    // Accept/Respond cards for the same task. Close out anything still open
    // on this chore before starting the new one.
    const staleOpen = get().parentAssignments.filter(a =>
      a.choreId === choreId && !a.isLocked &&
      ['PENDING', 'ACCEPTED', 'SNOOZED', 'PARKED'].includes(a.status)
    );
    if (staleOpen.length > 0) {
      console.log(`[choreStore] addParentQuest → superseding ${staleOpen.length} open assignment(s) on chore ${choreId}`);
      set(s => ({
        parentAssignments: s.parentAssignments.map(a =>
          staleOpen.some(x => x.id === a.id) ? { ...a, status: 'COMPLETED', updatedAt: now } : a
        ),
      }));
      for (const a of staleOpen) {
        dbUpdate('parent_quest_assignments', a.id, { status: 'COMPLETED', updated_at: now }, () => {
          set(s => ({ parentAssignments: s.parentAssignments.map(x => x.id === a.id ? a : x) }));
        });
      }
    }

    // Bug (live-repro'd): a chore can carry a stale System-B assignedToId
    // from an earlier, unrelated flow (e.g. a grandparent claiming a
    // GP-welcome invite via updateQuest) — addParentQuest never touched it,
    // so starting a fresh DIRECT delegation here left BOTH systems "live"
    // for the same chore at once. getMyDirectPending's own systemBIds
    // check (added to avoid double-listing a chore already answered via
    // System B) then excluded it there BECAUSE assignedToId was set, while
    // ParentView/QuestsScreen's activeAssignmentChoreIds excluded it from
    // the System-B "my adult quests" list BECAUSE a live PENDING System-A
    // row now existed — the chore satisfied both exclusions simultaneously
    // and disappeared from every screen. A DIRECT delegation means "needs
    // the new assignee's Accept/Decline," which isn't true yet — clear the
    // stale System-B assignedToId so only the new PENDING assignment is
    // "live," matching the "only one assignment should ever be live"
    // guarantee above, but across both systems instead of just within A.
    if (mode === 'DIRECT' && chore.assignedToId) {
      get().updateChore(choreId, { assignedToId: undefined, isPool: chore.isPool ?? false } as any);
    }

    // PULL mode: person self-claims from backlog (assignedTo = themselves)
    // DIRECT mode: explicitly assigned to partner, status starts PENDING
    const assignment: ParentQuestAssignment = {
      id:                genId(),
      choreId,
      assignedBy,
      assignedTo:        finalAssignedTo,
      status:            mode === 'DIRECT' ? 'PENDING' : 'ACCEPTED', // pull = self-accept
      bounceCount:       0,
      isLocked:          false,
      note,
      createdAt:         now,
      updatedAt:         now,
    };

    // DB-is-truth: await the insert before reflecting the assignment
    // locally. RLS on parent_quest_assignments checks that chore_id already
    // exists in chore_tasks — every caller (createAndAddParentQuest,
    // AddQuestModal, EditQuestModal) now awaits its own chore insert before
    // calling addParentQuest, so the chore row is guaranteed to exist by the
    // time this runs; no shared _choreInsertPromises wait needed anymore.
    const { ok: assignOk } = await dbInsert('parent_quest_assignments', {
      id:          assignment.id,
      chore_id:    choreId,
      assigned_by: assignedBy,
      assigned_to: finalAssignedTo,
      status:      assignment.status,
      bounce_count: 0,
      is_locked:   false,
      note:        note ?? null,
      created_at:  now,
      updated_at:  now,
    });
    if (!assignOk) {
      console.warn(`[choreStore] addParentQuest — assignment insert failed for chore ${choreId}`);
      showToast("Couldn't assign — please try again", 'error');
      return undefined as any;
    }
    set(s => ({ parentAssignments: [assignment, ...s.parentAssignments] }));

    // The Household Backlog pool/mine/theirs split is computed from the chore's
    // OWN assignedToId (Household Backlog reads `quests`, not parentAssignments),
    // so the claim must land there too — otherwise the chore never leaves the
    // pool and "Take It" reappears every time the list reloads.
    // DIRECT stays unassigned on the chore until the delegate accepts — otherwise
    // it lands in their "Assigned to you" list with a Done button and the
    // Accept/Respond card never gets a chance to render.
    if (mode === 'PULL') {
      // Live QA trace found this path had NO race protection — unlike
      // claim_pool_quest (used for the Quest-shim pool items), a plain
      // updateChore() here is an unconditional write with no row lock and
      // no check that the chore was still actually unclaimed. Two parents
      // tapping "Take It" on the same ordinary pool chore within the same
      // instant both succeeded, second write silently winning, with the
      // loser's own UI still showing them as the claimant. Route through
      // the same race-safe, compare-and-set RPC claim_pool_quest already
      // uses (only writes if assigned_to_id is still null and is_pool is
      // still true) BEFORE touching local state, instead of writing
      // optimistically first and only finding out about the race after.
      console.log(`[choreStore] addParentQuest → assignment ${assignment.id} created (ACCEPTED); claiming chore ${choreId} via claim_pool_quest`);
      supabase.rpc('claim_pool_quest', { p_chore_id: choreId, p_member_id: finalAssignedTo }).then(({ data, error }) => {
        const claimed = !error && (Array.isArray(data) ? data[0]?.claimed : (data as any)?.claimed);
        if (!claimed) {
          console.warn(`[choreStore] addParentQuest PULL — chore ${choreId} claim failed (already taken or error: ${error?.message ?? 'n/a'}); reverting assignment ${assignment.id}`);
          set(s => ({ parentAssignments: s.parentAssignments.filter(a => a.id !== assignment.id) }));
          dbUpdate('parent_quest_assignments', assignment.id, { status: 'COMPLETED' });
          showToast('Someone else already took that', 'info');
          get().syncFromDB(true);
          return;
        }
        // Claim landed — now safe to reflect it in local state; syncFromDB
        // will also pick up the RPC's own writes (assigned_to_id/is_pool/
        // status) on its next pass, this just avoids a UI flicker/delay.
        set(s => ({ chores: s.chores.map(c => c.id === choreId ? { ...c, assignedToId: finalAssignedTo, status: 'in_progress', isPool: false } : c) }));
        AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
      });
    } else if (chore.assignedToId) {
      // A RE-delegation (DelegateSheet reassigning a chore that was already
      // assigned to someone via a PRIOR cycle) left the chore's own
      // assignedToId pointing at the OLD assignee — the comment above ("DIRECT
      // stays unassigned until accepted") only actually held for a chore
      // delegated for the first time out of the pool, which starts with no
      // assignedToId at all. Real repro: chore assigned to Parent A, Parent A
      // re-delegates to Parent B via DelegateSheet → a new PENDING assignment
      // is created here, but assignedToId stays "Parent A." Every read path
      // keyed on "does this chore have a live System-A row" (getMyDirectPending/
      // getMyOutgoingPending/getMyLockedItems/getMyAccepted's systemBIds guard)
      // then EXCLUDES it, thinking System B still owns it — while System B's
      // own cards (othersAdultQuests etc.) ALSO now exclude it once a live
      // System-A row exists. The chore fell into the gap between both systems
      // and rendered nowhere. Clearing the stale assignedToId here restores
      // the invariant the comment above already assumed: unassigned-on-chore
      // means "System A owns this right now," full stop, whether this is the
      // chore's first delegation or its fifth.
      console.log(`[choreStore] addParentQuest → assignment ${assignment.id} created (PENDING); clearing stale assignedToId=${chore.assignedToId} on chore ${choreId} so System A is the sole owner until accepted`);
      get().updateChore(choreId, { assignedToId: undefined });
    } else {
      console.log(`[choreStore] addParentQuest → assignment ${assignment.id} created (PENDING); chore ${choreId} left unassigned until accepted`);
    }

    // Audit finding — same bug class as the addChore direct-assignment gap
    // this whole audit started from: a DIRECT parent-to-parent (or GP)
    // delegation created a real PENDING assignment the delegate must
    // Accept/Decline, but nothing ever told them it existed — they'd only
    // find out by happening to open the Backlog. Fixed here, inside
    // addParentQuest itself, rather than at individual call sites (DelegateSheet/
    // AddQuestModal/EditQuestModal/createAndAddParentQuest all funnel through
    // this one function) so every current AND future caller gets it
    // uniformly — mirrors the same lesson notifyChoreReassigned already
    // applied to updateChore's assignedToId path.
    if (mode === 'DIRECT' && chore.familyId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'parent_quest_delegated', familyId: chore.familyId, memberIds: [finalAssignedTo], persist: true,
          excludeMemberId: assignedBy,
          payload: { questId: choreId, questTitle: chore.title, byName: memberName(assignedBy), note },
        },
      }).catch(e => console.warn('[choreStore] addParentQuest delegate notify failed:', e?.message));
    }

    return assignment;
  },

  // Rewritten onto the respond_to_parent_quest RPC — the CAS check now runs
  // against the DB's live row inside the same transaction that writes it,
  // never a client-side status snapshot. The old version guarded its write
  // with `.eq('status', previousStatus)` where previousStatus came from
  // get().parentAssignments.find(...) — a value that can go stale after a
  // profile switch, backgrounding, or any timing gap, and when the CAS
  // lost, the client silently reverted its optimistic update and only
  // logged a warning: the person who tapped Decline saw the sheet close
  // as if it worked, and the assignment quietly stayed exactly as it was
  // (live-repro'd: a GP's "can't do it" sat PENDING in the DB indefinitely
  // with zero visible error). Same optimistic-patch-then-reconcile shape as
  // this file's other RPC-backed actions, but now a genuine failure surfaces
  // a real, visible error instead of a silent no-op.
  respondToParentQuest: (assignmentId, response) => {
    const assignment = get().parentAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      console.warn(`[choreStore] respondToParentQuest ABORTED — no assignment found with id=${assignmentId}`);
      return;
    }
    // QA-confirmed bug: respond_to_parent_quest's RPC never took an actor
    // parameter at all, so it couldn't verify the caller was actually a
    // party (assignedTo/assignedBy) to the assignment — an uninvolved
    // family member could accept/decline someone else's delegation with
    // zero identity check. The RPC now requires one; getActiveMemberId()
    // is the same "who's acting" resolution every other actor-less action
    // in this file already uses (see its own call sites above).
    const actorId = getActiveMemberId();
    if (!actorId) {
      showToast("Couldn't tell who's responding — try again", 'error');
      return;
    }
    if (assignment.isLocked) {
      showToast("This one's locked — needs to be discussed outside the app", 'error');
      return;
    }

    const now = new Date().toISOString();
    let newStatus: ParentQuestAssignment['status'] = 'PENDING';
    let snoozeUntil: string | undefined;
    let newBounceCount = assignment.bounceCount;
    let newIsLocked = false;

    switch (response.action) {
      case 'ACCEPT':
        newStatus = 'ACCEPTED';
        break;
      case 'DECLINE':
        newStatus = 'DECLINED';
        break;
      case 'SNOOZE':
        newStatus = 'SNOOZED';
        snoozeUntil = new Date(Date.now() + 48 * 3600_000).toISOString();
        break;
      case 'BLOCKER':
      case 'TRADE':
      case 'DISCUSS':
        newStatus = 'PARKED';
        newBounceCount += 1;
        if (newBounceCount >= 2) newIsLocked = true;
        break;
    }

    const prevAssignment = assignment;
    const prevChore = get().chores.find(c => c.id === assignment.choreId);
    set(s => ({
      parentAssignments: s.parentAssignments.map(a =>
        a.id === assignmentId
          ? {
              ...a,
              status: newStatus, snoozeUntil, bounceCount: newBounceCount, isLocked: newIsLocked,
              actionablePushback: (response.action === 'ACCEPT' || response.action === 'DECLINE') ? undefined : response.action as PushbackType,
              pushbackDetails: response.details, updatedAt: now,
            }
          : a
      ),
      chores: newStatus === 'ACCEPTED'
        ? s.chores.map(c => c.id === assignment.choreId ? { ...c, assignedToId: assignment.assignedTo, status: 'in_progress' } : c)
        : (newStatus === 'PARKED' || newStatus === 'DECLINED')
          ? s.chores.map(c => c.id === assignment.choreId ? { ...c, assignedToId: undefined, status: 'todo' } : c)
          : s.chores,
    }));

    supabase.rpc('respond_to_parent_quest', { p_assignment_id: assignmentId, p_actor_id: actorId, p_action: response.action, p_details: response.details ?? null })
      .then(({ error }) => {
        if (error) {
          console.warn(`[choreStore] respondToParentQuest RPC failed for ${assignmentId}`, error.message);
          set(s => ({
            parentAssignments: s.parentAssignments.map(a => a.id === assignmentId ? prevAssignment : a),
            chores: prevChore ? s.chores.map(c => c.id === prevChore.id ? prevChore : c) : s.chores,
          }));
          showToast("That didn't go through — someone else may have already responded. Pull to refresh and try again.", 'error');
          return;
        }
        // Notify the delegator only once the write is CONFIRMED — they
        // fired off a delegation and otherwise have no signal it was
        // actually accepted/declined until they happen to reopen the
        // backlog. Only ACCEPT/DECLINE are terminal-enough to be worth a
        // ping here; SNOOZE/BLOCKER/TRADE/DISCUSS already surface via
        // PushbackSheet's existing flow.
        if (newStatus === 'ACCEPTED' || newStatus === 'DECLINED') {
          try {
            const { useFamilyStore } = require('./familyStore');
            const { useChatStore } = require('./chatStore');
            const delegate = useFamilyStore.getState().members.find((m: any) => m.id === assignment.assignedTo);
            const chore = get().chores.find(c => c.id === assignment.choreId);
            const firstName = delegate?.name?.split(' ')[0] ?? 'They';
            const msg = newStatus === 'ACCEPTED'
              ? `✅ ${firstName} accepted "${chore?.title ?? 'that task'}".`
              : `🚫 ${firstName} declined "${chore?.title ?? 'that task'}".`;
            useChatStore.getState().sendMessage(assignment.assignedBy, assignment.assignedTo, msg);
          } catch (e) {
            console.warn('[choreStore] respondToParentQuest notify failed', e);
          }
        }
      });
  },

  completeParentQuest: (assignmentId, completedBy) => {
    console.log(`[choreStore] completeParentQuest called — assignmentId=${assignmentId} completedBy=${completedBy}`);
    const now = new Date().toISOString();
    const assignment = get().parentAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      console.warn(`[choreStore] completeParentQuest ABORTED — no assignment found with id=${assignmentId}`);
      return;
    }
    set(s => ({
      parentAssignments: s.parentAssignments.map(a =>
        a.id === assignmentId
          ? { ...a, status: 'COMPLETED', completedAt: now, updatedAt: now }
          : a
      ),
    }));
    const prevChore = get().chores.find(c => c.id === assignment.choreId);
    supabase.rpc('complete_parent_quest', { p_assignment_id: assignmentId, p_completed_by: completedBy })
      .then(({ error }) => {
        if (error) {
          console.warn(`[choreStore] completeParentQuest RPC failed for ${assignmentId}`, error.message);
          set(s => ({
            parentAssignments: s.parentAssignments.map(a => a.id === assignmentId ? assignment : a),
            chores: prevChore ? s.chores.map(c => c.id === prevChore.id ? prevChore : c) : s.chores,
          }));
          showToast("That didn't go through — check your connection and try again", 'error');
          return;
        }
        try {
          const { useFamilyStore } = require('./familyStore');
          const { useChatStore } = require('./chatStore');
          const delegate = useFamilyStore.getState().members.find((m: any) => m.id === completedBy);
          const chore = get().chores.find(c => c.id === assignment.choreId);
          const firstName = delegate?.name?.split(' ')[0] ?? 'They';
          useChatStore.getState().sendMessage(assignment.assignedBy, completedBy,
            `🎉 ${firstName} completed "${chore?.title ?? 'that task'}"!`);
        } catch (e) {
          console.warn('[choreStore] completeParentQuest notify failed', e);
        }
      });
  },

  cancelLockedAssignment: (assignmentId, byMemberId) => {
    const now = new Date().toISOString();
    const assignment = get().parentAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      console.warn(`[choreStore] cancelLockedAssignment ABORTED — no assignment found with id=${assignmentId}`);
      return;
    }
    set(s => ({
      parentAssignments: s.parentAssignments.map(a =>
        a.id === assignmentId
          ? { ...a, status: 'DECLINED', isLocked: false, updatedAt: now }
          : a
      ),
    }));
    supabase.rpc('cancel_locked_assignment', { p_assignment_id: assignmentId, p_by_member_id: byMemberId })
      .then(({ error }) => {
        if (error) {
          console.warn(`[choreStore] cancelLockedAssignment RPC failed for ${assignmentId}`, error.message);
          set(s => ({ parentAssignments: s.parentAssignments.map(a => a.id === assignmentId ? assignment : a) }));
          showToast("That didn't go through — check your connection and try again", 'error');
          return;
        }
        // Audit finding — the OTHER party to this locked negotiation (a
        // two-bounce assignment stuck on "discuss offline") never learned
        // it was cancelled and reopened — whichever of assignedBy/assignedTo
        // isn't the one cancelling.
        const otherPartyId = assignment.assignedBy === byMemberId ? assignment.assignedTo : assignment.assignedBy;
        const familyId = get().chores.find(c => c.id === assignment.choreId)?.familyId ?? getFamilyId();
        if (otherPartyId && otherPartyId !== byMemberId && familyId) {
          const choreTitle = get().chores.find(c => c.id === assignment.choreId)?.title;
          supabase.functions.invoke('family-notifier', {
            body: {
              type: 'parent_quest_lock_cancelled', familyId, memberIds: [otherPartyId], persist: true,
              excludeMemberId: byMemberId,
              payload: { questId: assignment.choreId, questTitle: choreTitle ?? 'that task', byName: memberName(byMemberId) },
            },
          }).catch(e => console.warn('[choreStore] cancelLockedAssignment notify', e?.message));
        }
      });
    // Chore was already unassigned/todo while locked (respondToParentQuest's
    // PARKED branch clears assignedToId) — no chore-row change needed here,
    // it naturally re-enters the open pool now that no live assignment
    // references it (getActiveAssignmentChoreIds no longer includes it
    // since DECLINED is a terminal status).
  },

  // Recall — the delegator takes back a still-PENDING (not yet accepted)
  // delegation. Only PENDING is recallable: once accepted the delegate has
  // committed to it (recall at that point would be a "reassign" decision,
  // a different, already-existing flow via DelegateSheet). See spec 1.3/6.5.
  // Rewritten onto recall_parent_quest — was a client-side-only
  // `assignment.assignedBy !== recallerId` check (the exact staleness class
  // respond_to_parent_quest was already rewritten to close): a stale
  // client could show the Recall button to someone unauthorized and the
  // raw dbUpdate would have gone through unchecked. The RPC re-validates
  // against the live row.
  recallParentQuest: (assignmentId, recallerId) => {
    const assignment = get().parentAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      console.warn(`[choreStore] recallParentQuest ABORTED — no assignment found with id=${assignmentId}`);
      return;
    }
    const now = new Date().toISOString();
    const prevChore = get().chores.find(c => c.id === assignment.choreId);
    set(s => ({
      parentAssignments: s.parentAssignments.map(a =>
        a.id === assignmentId ? { ...a, status: 'DECLINED', updatedAt: now } : a
      ),
      chores: s.chores.map(c => c.id === assignment.choreId ? { ...c, assignedToId: recallerId, status: 'todo' } : c),
    }));
    supabase.rpc('recall_parent_quest', { p_assignment_id: assignmentId, p_recaller_id: recallerId })
      .then(({ error }) => {
        if (error) {
          console.warn(`[choreStore] recallParentQuest RPC failed for ${assignmentId}`, error.message);
          set(s => ({
            parentAssignments: s.parentAssignments.map(a => a.id === assignmentId ? assignment : a),
            chores: prevChore ? s.chores.map(c => c.id === prevChore.id ? prevChore : c) : s.chores,
          }));
          showToast("That didn't go through — check your connection and try again", 'error');
          return;
        }
        try {
          const { useFamilyStore } = require('./familyStore');
          const { useChatStore } = require('./chatStore');
          const recaller = useFamilyStore.getState().members.find((m: any) => m.id === recallerId);
          const chore = get().chores.find(c => c.id === assignment.choreId);
          const recallerName = recaller?.name?.split(' ')[0] ?? 'They';
          useChatStore.getState().sendMessage(assignment.assignedTo, recallerId,
            `↩️ ${recallerName} took back "${chore?.title ?? 'that task'}" — no action needed from you.`);
          // Live-reported: "reclaim ... not even working" — this is the
          // OutgoingPendingCard "Recall" action (a parent taking a
          // delegated task back from a co-parent). Was chat-DM-only, easy
          // to miss and never populates the notification bell/push — this
          // ADDS a real one alongside the existing chat message.
          notifyChorePing(
            chore?.familyId, assignment.assignedTo, recallerId,
            '↩️ Task Taken Back',
            `${recallerName} took back "${chore?.title ?? 'that task'}" — no action needed from you.`,
            { screen: 'Quests', questId: assignment.choreId },
          );
        } catch (e) {
          console.warn('[choreStore] recallParentQuest notify failed', e);
        }
      });
  },

  appreciationPing: (assignmentId, fromId, message) => {
    // Was invoking quest-event-notifier with 'appreciation_ping' — the
    // function has no matching case (falls to its unknown-event default and
    // silently no-ops) AND the payload never included familyId, which the
    // function requires unconditionally, so this would have 400'd even with
    // a matching case added. Same underlying problem the doc's Category 7
    // intro described for the original two dead call sites. Since this is
    // fundamentally a one-to-one appreciation message with no state change
    // to fan out, it's simpler and more consistent to send it the same way
    // recallParentQuest (right above) already notifies a specific person —
    // a direct chatStore DM — rather than build out a new edge-function
    // case for a single-recipient message.
    try {
      const { useFamilyStore } = require('./familyStore');
      const { useChatStore } = require('./chatStore');
      const assignment = get().parentAssignments.find(a => a.id === assignmentId);
      if (!assignment) return;
      const sender = useFamilyStore.getState().members.find((m: any) => m.id === fromId);
      useChatStore.getState().sendMessage(assignment.assignedBy, fromId,
        `💛 ${sender?.name?.split(' ')[0] ?? 'They'}: ${message}`);
    } catch (e) {
      console.warn('[choreStore] appreciationPing notify failed', e);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GRANDPARENT ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  createGrandparentQuest: (task) => {
    const familyId = getFamilyId();
    const now = new Date().toISOString();
    // GP-created quests enter the parent safety-review queue. Target children
    // (if any) are captured NOW so the parent can publish to exactly those kids
    // (split points evenly) or drop to the bounty pool when no kids selected.
    const targets = task.childIds?.length ? [...new Set(task.childIds)] : [];
    const perKid  = targets.length > 0 ? Math.floor(task.basePoints / targets.length) : undefined;
    const chore: ChoreTask = {
      id:               genId(),
      title:            task.title,
      description:      task.description,
      categoryType:     'grandparent_quest',
      category:         'grandparent',
      basePoints:       task.basePoints,
      coinsReward:      0,
      xpReward:         0,
      status:           'pending_parent_approval', // awaiting parent OK
      sponsorUserId:    task.sponsorId,
      targetChildIds:   targets,
      coinsSplitPerKid: perKid,
      questMode:        task.mode,
      familyId:         familyId ?? undefined,
      isPrivateParent:   false,
      requiresPhotoProof: task.requiresPhoto ?? true,
      recurrenceRule:   { frequency: 'once' },
      dueDate:          task.dueDate,
      redoCount:        0,
      createdAt:        now,
    };
    set(s => ({ chores: [chore, ...s.chores] }));
    dbInsert('chore_tasks', {
      id: chore.id, title: chore.title, description: chore.description,
      category_type: 'grandparent_quest', base_points: task.basePoints,
      status: 'pending_parent_approval', sponsor_user_id: task.sponsorId,
      target_child_ids: targets, coins_split_per_kid: perKid,
      quest_mode: task.mode ?? null, requires_photo: task.requiresPhoto ?? true,
      family_id: familyId, due_date: task.dueDate, created_at: now,
    });
    // Audit finding — a GP-created quest enters the parent safety-review
    // queue (status 'pending_parent_approval') but no parent was ever told
    // one was waiting — they'd only see it by opening the review deck.
    if (familyId) {
      try {
        const { useFamilyStore } = require('./familyStore');
        const parentIds = (useFamilyStore.getState().members as any[])
          .filter((m: any) => m.role === 'parent' && m.id !== task.sponsorId)
          .map((m: any) => m.id);
        if (parentIds.length) {
          supabase.functions.invoke('family-notifier', {
            body: {
              type: 'grandparent_quest_needs_review', familyId, memberIds: parentIds, persist: true,
              excludeMemberId: task.sponsorId,
              payload: { questId: chore.id, questTitle: chore.title, gpName: memberName(task.sponsorId) },
            },
          }).catch(e => console.warn('[choreStore] createGrandparentQuest notify', e?.message));
        }
      } catch (e) {
        console.warn('[choreStore] createGrandparentQuest recipient resolution failed', e);
      }
    }
    return chore;
  },

  declineGrandparentQuest: (choreId, parentId, reason) => {
    // Kid declines a GP quest assigned to them → release back to the pool so
    // siblings can still claim it. Single-target quests go back to the bounty
    // pool rather than being killed entirely.
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'grandparent_quest') return;
    if (chore.status !== 'todo') return;

    // The sponsor notification used to be entirely caller-provided — every
    // current call site happened to send its own chat message right after
    // calling this, but nothing enforced it, so a future caller that forgot
    // would silently decline with zero notification to the sponsor and no
    // signal anything was missed. Centralizing it here removes that risk.
    // Requires cross-store access (chatStore/familyStore) — first instance
    // of that in this file, done via .getState() (runtime-only, no import
    // cycle) rather than a static import, matching the pattern already used
    // elsewhere in the app for one-off cross-store calls.
    try {
      const { useFamilyStore } = require('./familyStore');
      const { useChatStore } = require('./chatStore');
      const decliner = useFamilyStore.getState().members.find((m: any) => m.id === parentId);
      if (chore.sponsorUserId) {
        useChatStore.getState().sendMessage(chore.sponsorUserId, parentId,
          `🙏 ${decliner?.name?.split(' ')[0] ?? 'Your grandchild'} can't take "${chore.title}"${reason ? ` — "${reason}"` : ''}`);
      }
    } catch (e) {
      console.warn('[choreStore] declineGrandparentQuest sponsor notification failed', e);
    }

    if (!chore.isPool && !chore.targetChildIds?.length) {
      // Directly assigned → release to pool for the whole family.
      // updateChore already writes this same patch to chore_tasks itself
      // (with rollback on failure) — was a second, redundant dbUpdate call
      // to the same row right after.
      get().updateChore(choreId, {
        status: 'todo', isPool: true, assignedToId: undefined,
        rejectionReason: reason, reviewedAt: new Date().toISOString(),
      });
      return;
    }
    get().updateChore(choreId, {
      status: 'declined', rejectionReason: reason, reviewedAt: new Date().toISOString(),
    });
  },

  declineChoreAssignment: (choreId, byMemberId, reason) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;

    let byName = 'Someone';
    try {
      const { useFamilyStore } = require('./familyStore');
      byName = useFamilyStore.getState().members.find((m: any) => m.id === byMemberId)?.name?.split(' ')[0] ?? byName;
    } catch (e) {
      console.warn('[choreStore] declineChoreAssignment name lookup failed', e);
    }

    if (chore.categoryType === 'grandparent_quest') {
      // declineGrandparentQuest sends the sponsor DM itself — only need the
      // family-wide fallback here for the no-sponsor case, which it doesn't
      // cover.
      get().declineGrandparentQuest(choreId, byMemberId, reason);
      if (!chore.sponsorUserId) {
        try {
          const { useChatStore } = require('./chatStore');
          useChatStore.getState().sendMessage('all', byMemberId, `🙏 ${byName} can't take "${chore.title}" — "${reason}"`);
        } catch (e) {
          console.warn('[choreStore] declineChoreAssignment fallback notification failed', e);
        }
      }
      return;
    }

    if (chore.teamGroupId && chore.targetChildIds?.length) {
      // Team-clone chore — decline this one clone only. Releasing to the
      // family-wide pool would expose it to kids who were never targeted,
      // losing the shortlist framing; the other targets' clones are
      // separate rows, untouched either way.
      get().updateChore(choreId, { status: 'declined', assignedToId: undefined });
    } else {
      // Plain (non-team, non-GP) household chore — send back to the pool.
      // rejectionReason/declinedAt record who declined and why so the
      // creator sees "declined by X" instead of a task that looks brand
      // new (PoolQuestCard reads these).
      get().updateChore(choreId, {
        assignedToId: undefined, isPool: true, status: 'todo', claimedAt: undefined,
        rejectionReason: `Declined by ${byName}: "${reason}"`,
        declinedAt: new Date().toISOString(),
      });
    }

    try {
      const { useChatStore } = require('./chatStore');
      useChatStore.getState().sendMessage('all', byMemberId, `🙏 ${byName} can't take "${chore.title}" — "${reason}"`);
    } catch (e) {
      console.warn('[choreStore] declineChoreAssignment notification failed', e);
    }
  },

  createAndAddParentQuest: async (task) => {
    const familyId = getFamilyId();
    const now = new Date().toISOString();
    const draft: ChoreTask = {
      id:               genId(),
      title:            task.title,
      description:      task.description,
      categoryType:     'parent_only_quest',
      category:         'household',
      basePoints:       0,
      coinsReward:      0,
      xpReward:         0,
      status:           'todo',
      assignedToId:     task.mode === 'DIRECT' ? task.assignedTo : undefined,
      createdById:      task.createdById,
      familyId:         familyId ?? undefined,
      isPrivateParent:  true,
      requiresPhotoProof: false,
      recurrenceRule:   { frequency: 'once' },
      dueDate:          task.dueDate,
      redoCount:        0,
      createdAt:        now,
    };
    // DB-is-truth: await the insert and render only the confirmed row.
    // Also closes a real regression: addParentQuest (called below for
    // DIRECT mode) used to wait on a shared _choreInsertPromises map
    // entry that ONLY addChore ever populated — this function does its
    // OWN separate direct insert, so that lookup always silently missed
    // (Promise.resolve(), no wait at all) for exactly the race the
    // original comment described. Awaiting the insert HERE, before
    // calling addParentQuest, closes that gap directly instead of
    // relying on a shared map keyed by an id addParentQuest has no other
    // way to know is or isn't already present.
    const { ok, row } = await dbInsert('chore_tasks', {
      id: draft.id, title: draft.title, description: draft.description,
      category_type: 'parent_only_quest', base_points: 0,
      status: 'todo', assigned_to_id: draft.assignedToId,
      created_by_id: task.createdById, family_id: familyId,
      due_date: task.dueDate, created_at: now,
    });
    if (!ok || !row) {
      console.warn('[choreStore] createAndAddParentQuest insert failed');
      showToast("Couldn't save — check your connection and try again", 'error');
      throw new Error('createAndAddParentQuest insert failed');
    }
    const chore = choreFromRow(row);
    set(s => ({ chores: [chore, ...s.chores] }));
    // If DIRECT mode, create assignment immediately — safe now, the chore
    // row is confirmed to exist before this fires.
    if (task.mode === 'DIRECT' && task.assignedTo) {
      await get().addParentQuest(chore.id, task.createdById, task.assignedTo, 'DIRECT');
    }
    return chore;
  },

  addGrandparentMatch: (match) => {
    const now = new Date().toISOString();
    // DB has a unique constraint on (grandparent_id, child_id, match_type) —
    // re-saving a match rule for the same grandkid+type (e.g. adjusting the
    // percentage/cap) previously always attempted a fresh INSERT and hit
    // that constraint, failing silently (console warning only, nothing
    // shown to the user, so the sheet just appeared to do nothing). Now
    // treat an existing match for that same combination as an edit.
    const existing = get().grandparentMatches.find(m =>
      m.grandparentId === match.grandparentId &&
      m.childId === match.childId &&
      m.matchType === match.matchType
    );
    if (existing) {
      const updated: GrandparentMatch = {
        ...existing,
        matchValue: match.matchValue,
        matchJar: match.matchJar,
        goalTarget: match.goalTarget,
        maxMonthlyContribution: match.maxMonthlyContribution,
        isActive: true,
      };
      set(s => ({ grandparentMatches: s.grandparentMatches.map(m => m.id === existing.id ? updated : m) }));
      dbUpdate('grandparent_matches', existing.id, {
        match_value:              updated.matchValue,
        match_jar:                updated.matchJar,
        goal_target:              updated.goalTarget,
        max_monthly_contribution: updated.maxMonthlyContribution,
        is_active:                true,
      }, () => {
        set(s => ({ grandparentMatches: s.grandparentMatches.map(m => m.id === existing.id ? existing : m) }));
      });
      return;
    }
    const newMatch: GrandparentMatch = {
      ...match,
      id:                    genId(),
      monthlyContributedYtd: 0,
      createdAt:             now,
    };
    set(s => ({ grandparentMatches: [newMatch, ...s.grandparentMatches] }));
    dbInsert('grandparent_matches', {
      id:                      newMatch.id,
      family_id:               newMatch.familyId,
      grandparent_id:          newMatch.grandparentId,
      child_id:                newMatch.childId,
      match_type:              newMatch.matchType,
      match_value:             newMatch.matchValue,
      match_jar:               newMatch.matchJar,
      goal_target:             newMatch.goalTarget,
      max_monthly_contribution: newMatch.maxMonthlyContribution,
      is_active:               true,
      created_at:              now,
    });
  },

  approveGrandparentQuest: (choreId, parentId) => {
    // Moves from pending to claimable. Was two separate writes to the same
    // row — updateChore's own status-only patch, then a second dbUpdate
    // adding reviewedAt that updateChore's call didn't carry (not a true
    // duplicate like the other sites in this file, since the field sets
    // differed, but still two round-trips for one logical change with no
    // rollback on the second). Folded into the one call.
    get().updateChore(choreId, { status: 'todo', reviewedAt: new Date().toISOString() });
  },

  grandparentApproveAndCheer: (choreId, grandparentId, sticker) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'pending_grandparent_approval') return;
    if (!chore.assignedToId) return;

    const now = new Date().toISOString();
    get().updateChore(choreId, { status: 'completed', approvedAt: now });

    // Bounty targeted at a shortlist (teamGroupId links the sibling clones for
    // display only): each kid is verified and paid independently — falls
    // straight through to the normal single-kid payout below.

    // Award points — grandparent-funded, so this pays out of the separate
    // gpCoins pool (not run through the Spend/Save/Give split, which only
    // applies to money earned through ordinary household chores). bonusCoins
    // now included, matching approveChore's identical payout.
    if (chore.basePoints > 0) {
      const pts = chore.basePoints + (chore.bonusCoins ?? 0);
      get().awardPoints(chore.assignedToId, choreId, pts, chore.xpReward, 'gpCoins');
    }

    // Increment Grand Champion badge progress
    get().updateBadgeProgress(chore.assignedToId, 'grand_champion',
      (get().badges.find(b =>
        b.userId === chore.assignedToId && b.badgeKey === 'grand_champion',
      )?.progress ?? 0) + 1,
    );

    // responsibility_history — see approveChore's identical write for why
    // this must happen on every completion path, not just the cron auto-
    // approve one.
    if (chore.assignedToId && chore.familyId) {
      supabase.from('responsibility_history').insert({
        family_id: chore.familyId,
        chore_id: choreId,
        member_id: chore.assignedToId,
        category: chore.categoryType ?? 'chore',
        responsibility_type: 'chore',
        outcome: 'completed',
        effort_points: chore.basePoints,
        metadata: { reviewed_by_id: grandparentId, grandparent_approved: true },
      }).then(({ error }) => {
        if (error) console.warn('[choreStore] responsibility_history insert', error.message);
      });
    }

    // Audit finding — this is the GP's own direct approve-and-pay flow
    // (as opposed to a parent using the generic approveChore, which already
    // fires this same notification) and it told the kid nothing at all.
    if (chore.assignedToId && chore.familyId) {
      const pts = chore.basePoints > 0 ? chore.basePoints + (chore.bonusCoins ?? 0) : 0;
      supabase.functions.invoke('quest-event-notifier', {
        body: {
          event: 'quest_approved', questId: choreId, questTitle: chore.title,
          familyId: chore.familyId, assigneeId: chore.assignedToId, coins: pts,
        },
      }).catch(e => console.warn('[choreStore] grandparentApproveAndCheer notify', e?.message));
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SETTINGS
  // ─────────────────────────────────────────────────────────────────────────

  updateHouseholdSettings: (updates) => {
    set(s => ({ householdSettings: { ...s.householdSettings, ...updates } }));
    const settings = get().householdSettings;
    AsyncStorage.setItem(CACHE_KEY_SETTINGS, JSON.stringify(settings));

    const familyId = getFamilyId();
    if (familyId) {
      supabase.from('families').update({
        points_to_fiat_ratio:             settings.pointsToFiatRatio,
        currency_code:                    settings.currencyCode,
        currency_symbol:                  settings.currencySymbol,
        spend_allocation_pct:             settings.spendAllocationPct,
        save_allocation_pct:              settings.saveAllocationPct,
        give_allocation_pct:              settings.giveAllocationPct,
        allow_child_allocation_override:  settings.allowChildAllocationOverride,
        auto_approve_timeout_hours:       settings.autoApproveTimeoutHours,
        min_cashout_points:               settings.minCashoutPoints,
        teen_reward_cosign_threshold:     settings.teenRewardCoSignThreshold,
        allow_unilateral_reversal:        settings.allowUnilateralReversal,
      }).eq('id', familyId).then(({ error }) => {
        if (error) console.warn('[choreStore] updateHouseholdSettings', error.message);
      });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SELECTORS
  // ─────────────────────────────────────────────────────────────────────────

  getChildDashboard: (childId) => {
    // Was `new Date().toISOString().split('T')[0]` (UTC today) compared
    // against approvedAt/submittedAt's own UTC-date prefix — for anyone
    // west of UTC, a chore approved at 8pm local already has a UTC
    // timestamp dated tomorrow for several hours, silently dropping it off
    // "completed today" until midnight local. Use the device's local
    // calendar date on both sides instead (see lib/dates.ts).
    const todayStr = todayLocal();
    const allVisible = get().chores.filter(c => !c.isPrivateParent);

    return {
      // Citizenship: show all family citizenship tasks (0-pt streak tasks)
      citizenship: allVisible.filter(c =>
        c.categoryType === 'citizenship' &&
        ['todo', 'in_progress', 'redo_requested', 'completed', 'pending_approval'].includes(c.status) &&
        (c.assignedToId === childId || !c.assignedToId),
      ),
      // Routines: only mine
      routines: allVisible.filter(c =>
        c.categoryType === 'routine' &&
        ['todo', 'in_progress', 'redo_requested'].includes(c.status) &&
        c.assignedToId === childId,
      ),
      // Bounties: all unclaimed + my claimed ones (show sibling-claimed as read-only)
      bounties: allVisible.filter(c =>
        c.categoryType === 'bounty' &&
        ['todo', 'in_progress'].includes(c.status) &&
        c.status !== 'expired',
      ),
      // Shopping runs: open to all or directly assigned — first to claim
      shopping: allVisible.filter(c =>
        c.categoryType === 'shopping' &&
        ['todo', 'in_progress'].includes(c.status) &&
        (c.assignedToId === childId || !c.assignedToId),
      ),
      // GP quests: parent-approved ones ready for me, or my in-progress ones
      grandparentQuests: allVisible.filter(c =>
        c.categoryType === 'grandparent_quest' &&
        ['todo', 'in_progress', 'pending_grandparent_approval'].includes(c.status) &&
        (c.assignedToId === childId || !c.assignedToId),
      ),
      completedToday: allVisible.filter(c => {
        if (c.assignedToId !== childId) return false;
        if (!['approved', 'auto_approved', 'completed'].includes(c.status)) return false;
        const ts = c.approvedAt ?? c.submittedAt;
        if (!ts) return false;
        const d = new Date(ts);
        return !isNaN(d.getTime()) && localDateStr(d) === todayStr;
      }),
      pendingReview: allVisible.filter(c =>
        c.assignedToId === childId &&
        ['pending_approval', 'pending_grandparent_approval'].includes(c.status),
      ),
    };
  },

  getParentReviewDeck: () => {
    // Was `&& !c.isPrivateParent` — silently undercounted the badge relative
    // to what ParentReviewDeck.tsx actually renders (its own pendingSubmissions
    // filter, `chores.filter(c => c.status === 'pending_approval')`, has no
    // such exclusion, and parent_only_quest submissions ARE real, actionable
    // approve/decline cards there — a co-parent-delegated adult task goes
    // through the same submit flow as any other chore). Dropped to match.
    return get().chores
      .filter(c => c.status === 'pending_approval')
      .sort((a, b) => (a.submittedAt ?? a.createdAt) < (b.submittedAt ?? b.createdAt) ? -1 : 1);
  },

  getParentQuestPool: () => {
    const done = new Set<ChoreStatus>(['approved', 'auto_approved', 'completed', 'declined', 'expired']);
    return get().chores
      .filter(c => c.categoryType === 'parent_only_quest' && !c.assignedToId && !done.has(c.status))
      .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
  },

  // Any chore with a still-live (non-terminal) assignment row — PENDING,
  // ACCEPTED, IN_PROGRESS, SNOOZED, or locked/PARKED. A chore in this set
  // must never be silently picked up via a plain "Take It"/auto-assign/
  // reassign write — those all bypass parentAssignments and would leave a
  // stale row pointing at the original assignee, who could then Accept it
  // later and clobber whoever grabbed it in the meantime.
  // Live QA audit found: once an assignment is ACCEPTED/IN_PROGRESS, this
  // function used to still count it as "actively negotiating" (only
  // COMPLETED/DECLINED were treated as done) — but respondToParentQuest's
  // ACCEPT branch ALSO syncs chore_tasks.assigned_to_id at that exact
  // moment, meaning System B (myAdultQuests/othersAdultQuests, keyed off
  // assignedToId) is now the correct, authoritative display owner. With
  // BOTH systems still claiming "the other one owns this," the chore was
  // excluded from getMyAccepted (its own systemBIds guard, since
  // assignedToId is now set) AND from myAdultQuests/othersAdultQuests
  // (this function still listed it as "active"), and rendered nowhere —
  // the same "vanishes from the UI" symptom as the original reassignment
  // bug, on a different transition. The negotiation (what THIS function
  // is meant to track) ends the moment a decision is made — ACCEPTED/
  // IN_PROGRESS/PARKED-resolved states are handoff-complete, not still-
  // pending; only genuinely undecided states (PENDING/PARKED-awaiting-
  // response/SNOOZED) should keep a chore out of System B's cards.
  getActiveAssignmentChoreIds: () => {
    const stillNegotiating = new Set(['PENDING', 'PARKED', 'SNOOZED']);
    return new Set(
      get().parentAssignments.filter(a => stillNegotiating.has(a.status)).map(a => a.choreId)
    );
  },

  // The one shared place "which assignment, if any, is currently live on
  // this chore" is computed — DelegateSheet, MyAdultQuestCard, and
  // HouseholdBacklogSection each used to hand-roll their own
  // .find(a => a.choreId === X && ['PENDING','ACCEPTED',...].includes(a.status))
  // with slightly different status lists, which is exactly the drift class
  // this session's bugs kept coming from (a co-parent's delegation being
  // invisible to the other parent, a stuck assignment nobody's UI agreed
  // was "live"). Same status set as getActiveAssignmentChoreIds, plus
  // ACCEPTED (a chore someone has already taken on is still "live" for the
  // purposes of "who currently holds this").
  getLiveAssignmentForChore: (choreId) => {
    const live = new Set(['PENDING', 'ACCEPTED', 'PARKED', 'SNOOZED']);
    return get().parentAssignments.find(a => a.choreId === choreId && live.has(a.status));
  },

  getMyDirectPending: (memberId) => {
    const nowIso = new Date().toISOString();
    const systemBIds = new Set(get().chores.filter(c => !!c.assignedToId).map(c => c.id));
    return get().parentAssignments.filter(a =>
      a.assignedTo === memberId && !a.isLocked && !systemBIds.has(a.choreId) &&
      (a.status === 'PENDING' || a.status === 'PARKED' ||
       (a.status === 'SNOOZED' && (!a.snoozeUntil || a.snoozeUntil <= nowIso)))
    );
  },

  // Both the assignee (who bounced it) and the assigner (who has to
  // actually resolve it) need visibility — previously only the assignee
  // could see a locked item, so the assigner's own delegation silently
  // vanished from their view the moment it got parked.
  getMyLockedItems: (memberId) => {
    const systemBIds = new Set(get().chores.filter(c => !!c.assignedToId).map(c => c.id));
    // QA exploratory finding — a co-parent could see a delegation to a
    // senior/GP while it was merely pending/parked (getMyOutgoingPending's
    // own household-broadcast widening below), then lost all visibility the
    // instant it locked — exactly the moment a stuck negotiation most needs
    // a second adult's attention. Mirrors getMyOutgoingPending's identical
    // widening rule: only for another PARENT (never a senior/GP peeking at
    // someone else's), and only when the target is a third-party senior,
    // not the co-parent's own direct handoff (System-A's getMyDirectPending
    // already covers that).
    const myRole = (() => {
      try { const { useFamilyStore } = require('./familyStore'); return useFamilyStore.getState().members.find((m: any) => m.id === memberId)?.role; }
      catch { return null; }
    })();
    const assigneeRole = (id: string) => {
      try { const { useFamilyStore } = require('./familyStore'); return useFamilyStore.getState().members.find((m: any) => m.id === id)?.role; }
      catch { return null; }
    };
    return get().parentAssignments.filter(a => {
      if (!a.isLocked || systemBIds.has(a.choreId)) return false;
      if (a.assignedTo === memberId || a.assignedBy === memberId) return true;
      if (myRole !== 'parent') return false;
      const targetRole = assigneeRole(a.assignedTo);
      return targetRole === 'senior' && a.assignedTo !== memberId;
    });
  },

  // getMyAccepted removed — respondToParentQuest's ACCEPT branch always
  // syncs chore_tasks.assigned_to_id in the same action that sets an
  // assignment's status to ACCEPTED, so the "accepted but assignedToId
  // still unset" state this filtered for could never actually occur; it
  // was permanently dead code (and so was AcceptedQuestCard, its one
  // consumer). MyAdultQuestCard (System B) is the real, reachable card for
  // an accepted delegation.

  // A delegation the current member sent out and is still waiting on —
  // previously the assigner had NO visibility into their own PENDING/
  // SNOOZED-and-still-waiting DIRECT assignment; it just silently existed
  // with no card anywhere until the assignee responded, so "assigned a
  // task" and "nothing happened yet" looked identical from the assigner's
  // side.
  // A delegation to a THIRD PARTY (grandparent, not the other parent) is a
  // household responsibility, not a private negotiation between the two
  // people on it — every parent should be able to see it's pending, Nudge
  // it, or Recall it, not just whichever parent happened to be the one who
  // tapped "assign." Previously scoped strictly to a.assignedBy === memberId,
  // so the SECOND parent had zero visibility into a co-parent's delegation
  // to a GP — no card, no way to know it existed, no way to act on it.
  // A parent-to-PARENT delegation (assignee is also a parent/senior... no,
  // assignee role check below) stays assigner-scoped — that one genuinely
  // is a private two-person negotiation (PushbackSheet's SNOOZE/BLOCKER/
  // TRADE/DISCUSS model), not a household-wide broadcast.
  getMyOutgoingPending: (memberId) => {
    const systemBIds = new Set(get().chores.filter(c => !!c.assignedToId).map(c => c.id));
    const myRole = (() => {
      try { const { useFamilyStore } = require('./familyStore'); return useFamilyStore.getState().members.find((m: any) => m.id === memberId)?.role; }
      catch { return null; }
    })();
    const assigneeRole = (id: string) => {
      try { const { useFamilyStore } = require('./familyStore'); return useFamilyStore.getState().members.find((m: any) => m.id === id)?.role; }
      catch { return null; }
    };
    return get().parentAssignments.filter(a => {
      if (a.assignedBy === a.assignedTo || a.isLocked || systemBIds.has(a.choreId)) return false;
      if (!(a.status === 'PENDING' || a.status === 'SNOOZED' || a.status === 'PARKED')) return false;
      if (a.assignedBy === memberId) return true;
      // Not the one who assigned it — only visible to another PARENT
      // (never a senior/GP peeking at someone else's delegation), and only
      // when the target is a third party (senior/GP), not the co-parent's
      // own private handoff to this exact member (which is System-A's
      // getMyDirectPending's job, not this one).
      if (myRole !== 'parent') return false;
      const targetRole = assigneeRole(a.assignedTo);
      return targetRole === 'senior' && a.assignedTo !== memberId;
    });
  },

  getMemberBalance: (memberId) => {
    // A denied cash-out must stop counting against the balance — denyCashOut
    // only ever tagged the transaction's notes with "[Denied]" and never
    // reversed the deduction this reducer applies for every CASH_OUT row,
    // so a denied request permanently shrank the kid's wallet with no way
    // back (the UI's own "Deny" confirm text — "Funds stay in their
    // wallet" — was actively false). A denied CASH_OUT is excluded here so
    // it no longer subtracts; approved/still-pending ones still do, since
    // the money is genuinely earmarked the moment a request is filed.
    const txs = get().transactions.filter(t =>
      t.userId === memberId && !(t.transactionType === 'CASH_OUT' && t.notes?.includes('[Denied]'))
    );
    const spend = txs.reduce((sum, t) => {
      if (t.transactionType === 'EARNED') return sum + t.spendAllocation;
      if (t.transactionType === 'CASH_OUT') return sum - t.spendAllocation;
      return sum;
    }, 0);
    const save = txs.reduce((sum, t) => {
      if (t.transactionType === 'EARNED') return sum + t.saveAllocation;
      if (t.transactionType === 'CASH_OUT') return sum - t.saveAllocation;
      return sum;
    }, 0);
    const give = txs.reduce((sum, t) => {
      if (t.transactionType === 'EARNED') return sum + t.giveAllocation;
      if (t.transactionType === 'CASH_OUT') return sum - t.giveAllocation;
      return sum;
    }, 0);

    return { spend: Math.max(0, spend), save: Math.max(0, save), give: Math.max(0, give), total: Math.max(0, spend + save + give) };
  },

  getPendingCashOuts: () => {
    return get().transactions.filter(t =>
      t.transactionType === 'CASH_OUT' &&
      t.notes?.includes('request') &&
      !t.notes?.includes('Settled'),
    );
  },
}));
