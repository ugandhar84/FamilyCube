/**
 * choreStore — Manages the full chore system:
 * citizenship / routine / bounty / shopping / grandparent_quest / parent_only_quest
 * Plus point_transactions, badges, grandparent_matches, parent_quest_assignments.
 *
 * Pattern follows questStore: AsyncStorage cache + Supabase sync + realtime.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

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
  isPrivateParent: boolean;
  isPool?: boolean;               // unassigned quest open for anyone to claim
  requiresPhotoProof: boolean;
  difficulty?: 'easy' | 'medium' | 'hard' | 'hero';
  recurrenceRule: RecurrenceRule;
  instanceDate?: string;
  dueDate?: string;
  dueTime?: string;
  redoCount: number;
  submissionNote?: string;
  proofNotes?: string;
  submissionPhotoUrl?: string;
  rejectionReason?: string;
  approvalWindowExpiresAt?: string;
  // Shopping quest item list (categoryType === 'shopping')
  shoppingItems?: string[];          // e.g. ['Milk 2%', 'Bread', 'Eggs x12']
  shoppingStore?: string;            // e.g. 'Walmart', 'Target'
  shoppingBudget?: number;           // optional spend cap in dollars
  openToGP?: boolean;        // parent flagged this for grandparent to handle (e.g. grocery run + scan receipt)
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
}

export interface ChoreCheer {
  memberId: string;   // who sent the cheer
  at:       string;   // ISO
  coins?:   number;   // optional kudos coins gifted alongside (GP only)
  note?:    string;   // optional kudos text note
}

export interface RecurrenceRule {
  frequency: 'once' | 'daily' | 'weekly' | 'rotating' | 'first_come';
  days?: number[];              // e.g. [1,3,5] for Mon/Wed/Fri
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
  pointsToFiatRatio: number;   // 0.01 = 100 pts → $1.00
  spendAllocationPct: number;  // Default 50
  saveAllocationPct: number;   // Default 40
  giveAllocationPct: number;   // Default 10
  allowChildAllocationOverride: boolean;
  autoApproveTimeoutHours: number;
  minCashoutPoints: number;
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
const CACHE_TTL = 5 * 60_000;

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

// ─── Helper: get active member role ──────────────────────────────────────────

const getActiveMemberRole = (): string | null => {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const state = useFamilyStore.getState();
    const active = state.members.find((m: any) => m.id === state.activeMemberId) ?? state.members[0];
    return (active as any)?.role ?? null;
  } catch { return null; }
};

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
    isPrivateParent:         row.category_type === 'parent_only_quest',
    requiresPhotoProof:      row.requires_photo ?? row.requires_photo_proof ?? false,
    recurrenceRule:          (typeof row.recurrence_rule === 'object' && row.recurrence_rule)
                               ? row.recurrence_rule
                               : { frequency: 'once' as const },
    instanceDate:            row.instance_date ?? undefined,
    dueDate:                 row.due_date ?? undefined,
    dueTime:                 row.due_time ?? undefined,
    redoCount:               row.redo_count ?? 0,
    submissionNote:          row.submission_note ?? undefined,
    proofNotes:              row.proof_notes ?? undefined,
    submissionPhotoUrl:      row.submission_photo_url ?? undefined,
    rejectionReason:         row.rejection_reason ?? undefined,
    approvalWindowExpiresAt: row.approval_window_expires_at ?? undefined,
    submittedAt:             row.submitted_at ?? undefined,
    approvedAt:              row.approved_at ?? undefined,
    reviewedAt:              row.reviewed_at ?? undefined,
    reviewedById:            row.reviewed_by_id ?? undefined,
    declinedAt:              row.declined_at ?? undefined,
    createdAt:               row.created_at ?? new Date().toISOString(),
    shoppingItems:           Array.isArray(row.shopping_items) ? row.shopping_items : undefined,
    shoppingStore:           row.shopping_store ?? undefined,
    shoppingBudget:          row.shopping_budget != null ? Number(row.shopping_budget) : undefined,
    openToGP:                row.open_to_gp ?? false,
    receiptPhotoUrl:         row.receipt_photo_url ?? undefined,
    receiptAmount:           row.receipt_amount != null ? Number(row.receipt_amount) : undefined,
    receiptNote:             row.receipt_note ?? undefined,
    receiptSubmittedAt:      row.receipt_submitted_at ?? undefined,
    receiptReimbursedAt:     row.receipt_reimbursed_at ?? undefined,
    cheers:                  Array.isArray(row.cheered_by) ? row.cheered_by : [],
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
  syncFromDB:          () => Promise<void>;

  // ── Chore CRUD ─────────────────────────────────────────────────────────────
  addChore:            (chore: Omit<ChoreTask, 'id' | 'createdAt' | 'isPrivateParent' | 'redoCount'>) => ChoreTask;
  updateChore:         (id: string, updates: Partial<ChoreTask>) => void;
  deleteChore:         (id: string) => void;

  // ── Child actions ──────────────────────────────────────────────────────────
  claimBounty:              (choreId: string, childId: string) => void;
  submitChore:              (choreId: string, opts?: { photoUrl?: string; note?: string }) => void;
  resubmitChore:            (choreId: string, opts?: { photoUrl?: string; note?: string }) => void;
  instantCompleteChore:     (choreId: string, childId: string) => void;
  startGrandparentQuest:    (choreId: string, childId: string) => void;
  submitGrandparentQuest:   (choreId: string, opts?: { photoUrl?: string; note?: string }) => void;

  // ── GP errand receipt ─────────────────────────────────────────────────────
  claimGPErrand:           (choreId: string, gpMemberId: string) => void;
  submitGPErrandReceipt:   (choreId: string, opts: { receiptPhotoUrl?: string; receiptAmount?: number; receiptNote?: string }) => void;
  acknowledgeGPReimbursement: (choreId: string) => void;

  // ── Parent review ──────────────────────────────────────────────────────────
  approveChore:                    (choreId: string, reviewerId: string) => void;
  requestRedo:                     (choreId: string, reviewerId: string, reason: string, presetKey?: string) => void;

  // ── Cheer Squad — GP/sibling reactions on a completed chore ─────────────────
  cheerChore:                      (choreId: string, fromMemberId: string, opts?: { coins?: number; note?: string }) => void;
  approveGrandparentQuestAsParent: (choreId: string, parentId: string) => void;
  declineGrandparentQuestAsParent: (choreId: string, parentId: string, reason: string) => void;
  scanAndAutoApprove:              () => void;

  // ── Points economy ────────────────────────────────────────────────────────
  awardPoints:         (userId: string, choreId: string, points: number) => void;
  requestCashOut:      (userId: string, points: number, override?: { spendPct: number; savePct: number; givePct: number }) => void;
  settleCashOut:       (transactionId: string, method: 'PHYSICAL_CASH' | 'DEBIT_CARD' | 'LEDGER') => void;
  approveCashOut:      (transactionId: string) => void;
  denyCashOut:         (transactionId: string) => void;

  // ── Badges ────────────────────────────────────────────────────────────────
  updateBadgeProgress: (userId: string, badgeKey: BadgeKey, progress: number) => void;
  unlockBadge:         (userId: string, badgeKey: BadgeKey, tier?: BadgeTier) => void;
  getBadgeProgress:    (userId: string) => UserBadge[];

  // ── Parent-only quests ────────────────────────────────────────────────────
  addParentQuest:      (choreId: string, assignedBy: string, assignedTo?: string, mode?: 'PULL' | 'DIRECT') => ParentQuestAssignment | null;
  createAndAddParentQuest: (task: { title: string; description?: string; dueDate?: string; assignedTo?: string; mode: 'PULL' | 'DIRECT'; createdById: string }) => ChoreTask;
  respondToParentQuest:(assignmentId: string, response: {
    action: 'ACCEPT' | 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS';
    details?: string;
  }) => void;
  completeParentQuest: (assignmentId: string, completedBy: string) => void;
  appreciationPing:    (assignmentId: string, fromId: string, message: string) => void;

  // ── Grandparent actions ───────────────────────────────────────────────────
  addGrandparentMatch: (match: Omit<GrandparentMatch, 'id' | 'createdAt' | 'monthlyContributedYtd'>) => void;
  createGrandparentQuest: (task: { title: string; description?: string; basePoints: number; childIds: string[]; dueDate?: string; sponsorId: string; mode?: 'local' | 'virtual'; requiresPhoto?: boolean }) => ChoreTask;
  approveGrandparentQuest: (choreId: string, parentId: string) => void;
  declineGrandparentQuest: (choreId: string, parentId: string, reason: string) => void;
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
}

// ─── Default settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: HouseholdSettings = {
  pointsToFiatRatio:            0.01,
  spendAllocationPct:           50,
  saveAllocationPct:            40,
  giveAllocationPct:            10,
  allowChildAllocationOverride: false,
  autoApproveTimeoutHours:      24,
  minCashoutPoints:             100,
};

// ─── DB write helper ──────────────────────────────────────────────────────────

function dbUpdate(table: string, id: string, patch: Record<string, unknown>) {
  _fetchedAt = 0;
  console.log(`[choreStore] → DB update ${table}/${id}`, patch);
  supabase.from(table).update(patch).eq('id', id).then(({ error }) => {
    if (error) console.warn(`[choreStore] ✗ DB update ${table}/${id} FAILED`, error.message);
    else console.log(`[choreStore] ✓ DB update ${table}/${id} ok`);
  });
}

function dbInsert(table: string, row: Record<string, unknown>) {
  _fetchedAt = 0;
  console.log(`[choreStore] → DB insert ${table}`, row);
  supabase.from(table).insert(row).then(({ error }) => {
    if (error) console.warn(`[choreStore] ✗ DB insert ${table} FAILED`, error.message, '| row:', row);
    else console.log(`[choreStore] ✓ DB insert ${table} ok (id=${row.id})`);
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
          // Hide parent-only quests from non-parents
          const role = getActiveMemberRole();
          if (chore.isPrivateParent && role !== 'parent') return;
          // Skip if already added optimistically by addChore
          if (state.chores.some(c => c.id === chore.id)) return;
          setState({ chores: [chore, ...state.chores] });
        } else if (eventType === 'UPDATE') {
          setState({
            chores: state.chores.map(c =>
              c.id === String(newRow.id) ? choreFromRow(newRow) : c
            ),
          });
        } else if (eventType === 'DELETE') {
          setState({ chores: state.chores.filter(c => c.id !== String(oldRow.id)) });
        }
      })
      .subscribe((status) => {
        console.log(`[choreStore] realtime chores:${familyId} subscribe status=${status}`);
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

  syncFromDB: async () => {
    if (Date.now() - _fetchedAt < CACHE_TTL) return;
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

      if (role !== 'parent') {
        choreQuery = choreQuery.neq('category_type', 'parent_only_quest');
      }

      const [{ data: choresData }, { data: txData }, { data: badgesData }, { data: assignmentsData }] = await Promise.all([
        choreQuery,
        supabase
          .from('point_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('user_badges')
          .select('*')
          .order('created_at', { ascending: false }),
        // RLS scopes this to the family via its chore_tasks join — no family_id column on the table itself
        supabase
          .from('parent_quest_assignments')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      const chores       = (choresData ?? []).map(choreFromRow);
      const transactions = (txData     ?? []).map(txFromRow);
      const badges       = (badgesData ?? []).map(badgeFromRow);
      const parentAssignments = (assignmentsData ?? []).map(parentAssignmentFromRow);

      _fetchedAt = Date.now();
      set({ chores, transactions, badges, parentAssignments, loaded: true });

      await Promise.all([
        AsyncStorage.setItem(CACHE_KEY_CHORES,       JSON.stringify(chores)),
        AsyncStorage.setItem(CACHE_KEY_TRANSACTIONS,  JSON.stringify(transactions)),
        AsyncStorage.setItem(CACHE_KEY_BADGES,        JSON.stringify(badges)),
        AsyncStorage.setItem(CACHE_KEY_ASSIGNMENTS,   JSON.stringify(parentAssignments)),
      ]);

      ensureRealtime(familyId, set, get);
    } catch (e) {
      console.warn('[choreStore] syncFromDB error', e);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CHORE CRUD
  // ─────────────────────────────────────────────────────────────────────────

  addChore: (partial) => {
    const familyId = getFamilyId();
    const now = new Date().toISOString();
    const autoExpire = partial.categoryType === 'parent_only_quest'
      ? undefined
      : ['citizenship', 'routine', 'shopping'].includes(partial.categoryType)
        ? new Date(Date.now() + (get().householdSettings.autoApproveTimeoutHours * 3600_000)).toISOString()
        : undefined;

    const chore: ChoreTask = {
      ...partial,
      id:                   genId(),
      isPrivateParent:      (partial as any).isPrivateParent ?? partial.categoryType === 'parent_only_quest',
      redoCount:            0,
      approvalWindowExpiresAt: autoExpire,
      createdAt:            now,
    };

    set(s => ({ chores: [chore, ...s.chores] }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify([chore, ...get().chores]));

    // DB insert — map back to snake_case schema fields
    dbInsert('chore_tasks', {
      id:                       chore.id,
      title:                    chore.title,
      description:              chore.description,
      category_type:            chore.categoryType,
      category:                 chore.category,
      base_points:              chore.basePoints,
      coins_reward:             chore.coinsReward,
      xp_reward:                chore.xpReward,
      status:                   chore.status,
      assigned_to_id:           chore.assignedToId,
      family_id:                familyId,
      created_by_id:            chore.createdById,
      sponsor_user_id:          chore.sponsorUserId,
      quest_mode:               chore.questMode ?? null,
      invite_grandparents:      chore.inviteGrandparents ?? false,
      requires_photo:           chore.requiresPhotoProof,
      recurrence_rule:          chore.recurrenceRule,
      instance_date:            chore.instanceDate,
      due_date:                 chore.dueDate,
      due_time:                 chore.dueTime,
      approval_window_expires_at: autoExpire,
      created_at:               now,
      shopping_items:           (partial as any).shoppingItems ?? null,
      shopping_store:           (partial as any).shoppingStore ?? null,
      shopping_budget:          (partial as any).shoppingBudget ?? null,
    });

    return chore;
  },

  updateChore: (id, updates) => {
    set(s => ({
      chores: s.chores.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));

    // Map to DB fields
    const patch: Record<string, unknown> = {};
    if (updates.title              !== undefined) patch.title                    = updates.title;
    if (updates.description        !== undefined) patch.description              = updates.description;
    if (updates.status             !== undefined) patch.status                   = updates.status;
    if (updates.assignedToId       !== undefined) patch.assigned_to_id           = updates.assignedToId;
    if (updates.targetChildIds     !== undefined) patch.target_child_ids         = updates.targetChildIds;
    if (updates.coinsSplitPerKid   !== undefined) patch.coins_split_per_kid       = updates.coinsSplitPerKid;
    if (updates.teamGroupId        !== undefined) patch.team_group_id             = updates.teamGroupId;
    if (updates.categoryType       !== undefined) patch.category_type            = updates.categoryType;
    if (updates.category           !== undefined) patch.category                 = updates.category;
    if (updates.basePoints         !== undefined) patch.base_points              = updates.basePoints;
    if (updates.coinsReward        !== undefined) patch.coins_reward             = updates.coinsReward;
    if (updates.difficulty         !== undefined) patch.difficulty               = updates.difficulty;
    if (updates.dueDate            !== undefined) patch.due_date                 = updates.dueDate;
    if (updates.dueTime            !== undefined) patch.due_time                 = updates.dueTime;
    if (updates.requiresPhotoProof !== undefined) patch.requires_photo           = updates.requiresPhotoProof;
    if (updates.inviteGrandparents !== undefined) patch.invite_grandparents      = updates.inviteGrandparents;
    if (updates.recurrenceRule     !== undefined) patch.recurrence_rule          = updates.recurrenceRule;
    if (updates.shoppingItems        !== undefined) patch.shopping_items             = updates.shoppingItems;
    if (updates.shoppingStore        !== undefined) patch.shopping_store             = updates.shoppingStore;
    if (updates.shoppingBudget       !== undefined) patch.shopping_budget            = updates.shoppingBudget;
    if ((updates as any).openToGP    !== undefined) patch.open_to_gp                = (updates as any).openToGP;
    if (updates.receiptPhotoUrl      !== undefined) patch.receipt_photo_url          = updates.receiptPhotoUrl;
    if (updates.receiptAmount        !== undefined) patch.receipt_amount             = updates.receiptAmount;
    if (updates.receiptNote          !== undefined) patch.receipt_note               = updates.receiptNote;
    if (updates.receiptSubmittedAt   !== undefined) patch.receipt_submitted_at       = updates.receiptSubmittedAt;
    if (updates.receiptReimbursedAt  !== undefined) patch.receipt_reimbursed_at      = updates.receiptReimbursedAt;
    if (updates.submissionNote     !== undefined) patch.submission_note          = updates.submissionNote;
    if (updates.proofNotes         !== undefined) patch.proof_notes              = updates.proofNotes;
    if (updates.submissionPhotoUrl !== undefined) patch.submission_photo_url     = updates.submissionPhotoUrl;
    if (updates.rejectionReason    !== undefined) patch.rejection_reason         = updates.rejectionReason;
    if (updates.submittedAt        !== undefined) patch.submitted_at             = updates.submittedAt;
    if (updates.approvedAt         !== undefined) patch.approved_at              = updates.approvedAt;
    if (updates.reviewedAt         !== undefined) patch.reviewed_at              = updates.reviewedAt;
    if (updates.reviewedById       !== undefined) patch.reviewed_by_id           = updates.reviewedById;
    if (updates.declinedAt         !== undefined) patch.declined_at              = updates.declinedAt;
    if (updates.redoCount          !== undefined) patch.redo_count               = updates.redoCount;
    if (updates.cheers             !== undefined) patch.cheered_by               = updates.cheers;
    if (Object.keys(patch).length > 0) dbUpdate('chore_tasks', id, patch);
  },

  deleteChore: (id) => {
    set(s => ({ chores: s.chores.filter(c => c.id !== id) }));
    AsyncStorage.setItem(CACHE_KEY_CHORES, JSON.stringify(get().chores));
    supabase.from('chore_tasks').delete().eq('id', id).then(({ error }) => {
      if (error) console.warn('[choreStore] delete error', error.message);
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CHILD ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  claimBounty: (choreId, childId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'bounty' || chore.status !== 'todo') return;
    if (chore.assignedToId) return; // Already claimed

    get().updateChore(choreId, {
      assignedToId: childId,
      status: 'todo',  // Now assigned; stays todo until submission
    });
  },

  submitChore: (choreId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !['todo', 'in_progress'].includes(chore.status)) return;

    // Spec: if redo_count >= 2, auto-approve immediately — no more manual review
    if ((chore.redoCount ?? 0) >= 2) {
      const now = new Date().toISOString();
      get().updateChore(choreId, { status: 'auto_approved', approvedAt: now, reviewedAt: now });
      const pts = chore.basePoints > 0 ? chore.basePoints : chore.coinsReward;
      if (pts > 0 && chore.assignedToId) get().awardPoints(chore.assignedToId, choreId, pts);
      return;
    }

    const now = new Date().toISOString();
    const expiry = new Date(Date.now() +
      (get().householdSettings.autoApproveTimeoutHours * 3600_000)).toISOString();

    get().updateChore(choreId, {
      status:                  'pending_approval',
      submissionNote:          opts?.note,
      submissionPhotoUrl:      opts?.photoUrl,
      submittedAt:             now,
      approvalWindowExpiresAt: expiry,
    });
  },

  resubmitChore: (choreId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'redo_requested') return;

    // Spec: redo_count >= 2 → auto-approve
    if ((chore.redoCount ?? 0) >= 2) {
      const now = new Date().toISOString();
      get().updateChore(choreId, { status: 'auto_approved', approvedAt: now, reviewedAt: now });
      const pts = chore.basePoints > 0 ? chore.basePoints : chore.coinsReward;
      if (pts > 0 && chore.assignedToId) get().awardPoints(chore.assignedToId, choreId, pts);
      return;
    }

    const now = new Date().toISOString();
    const expiry = new Date(Date.now() +
      (get().householdSettings.autoApproveTimeoutHours * 3600_000)).toISOString();

    get().updateChore(choreId, {
      status:                  'pending_approval',
      submissionNote:          opts?.note ?? chore.submissionNote,
      submissionPhotoUrl:      opts?.photoUrl ?? chore.submissionPhotoUrl,
      submittedAt:             now,
      approvalWindowExpiresAt: expiry,
    });
  },

  // Citizenship 0-pt tasks: tap = immediate complete, no review needed
  instantCompleteChore: (choreId, childId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'citizenship') return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;
    const now = new Date().toISOString();
    get().updateChore(choreId, {
      status:      'completed',
      approvedAt:  now,
      submittedAt: now,
    });
  },

  startGrandparentQuest: (choreId, childId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'grandparent_quest' || chore.status !== 'todo') return;
    if (chore.assignedToId && chore.assignedToId !== childId) return; // already claimed by sibling
    // Claim clears pool flag so first-come wins permanently.
    get().updateChore(choreId, { status: 'in_progress', assignedToId: childId, isPool: false });
  },

  submitGrandparentQuest: (choreId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'grandparent_quest') return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;
    const now = new Date().toISOString();
    get().updateChore(choreId, {
      status:             'pending_grandparent_approval',
      submissionNote:     opts?.note,
      submissionPhotoUrl: opts?.photoUrl,
      submittedAt:        now,
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GP ERRAND RECEIPT
  // ─────────────────────────────────────────────────────────────────────────

  claimGPErrand: (choreId, gpMemberId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.inviteGrandparents || chore.status !== 'todo') return;
    get().updateChore(choreId, { status: 'in_progress', assignedToId: gpMemberId });
  },

  submitGPErrandReceipt: (choreId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || !chore.inviteGrandparents) return;
    if (!['todo', 'in_progress'].includes(chore.status)) return;
    get().updateChore(choreId, {
      status:              'pending_approval',  // goes to parent review deck
      receiptPhotoUrl:     opts.receiptPhotoUrl,
      receiptAmount:       opts.receiptAmount,
      receiptNote:         opts.receiptNote,
      receiptSubmittedAt:  new Date().toISOString(),
      submittedAt:         new Date().toISOString(),
    });
  },

  acknowledgeGPReimbursement: (choreId) => {
    get().updateChore(choreId, { receiptReimbursedAt: new Date().toISOString() });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARENT REVIEW
  // ─────────────────────────────────────────────────────────────────────────

  approveChore: (choreId, reviewerId) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'pending_approval') return;
    if (!chore.assignedToId) return;

    const now = new Date().toISOString();
    get().updateChore(choreId, {
      status:       'approved',
      approvedAt:   now,
      reviewedAt:   now,
      reviewedById: reviewerId,
    });

    // Bounty targeted at a shortlist (teamGroupId links the sibling clones for
    // display only): each kid earns the full amount independently, the moment
    // they're approved. Nobody's payout waits on or shrinks because of anyone
    // else — falls straight through to the normal single-kid payout below.

    // Award points
    const pointsToAward = chore.basePoints > 0 ? chore.basePoints : chore.coinsReward;
    if (pointsToAward > 0 && chore.assignedToId) {
      get().awardPoints(chore.assignedToId, choreId, pointsToAward);
    }

    // Also award coins via RPC (existing pattern)
    if (chore.coinsReward > 0 && chore.assignedToId) {
      supabase.rpc('award_coins', {
        member_id:   chore.assignedToId,
        coins_delta: chore.coinsReward,
        xp_delta:    chore.xpReward,
      }).then(({ error }) => {
        if (error) console.warn('[choreStore] award_coins RPC', error.message);
      });
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

    // G1 — reset recurring chores back to todo so they reappear next cycle
    if (chore.recurrenceRule?.frequency && chore.recurrenceRule.frequency !== 'once') {
      get().updateChore(choreId, {
        status:           'todo',
        assignedToId:     undefined,
        submittedAt:      undefined,
        submissionPhotoUrl: undefined,
        submissionNote:   undefined,
        approvedAt:       undefined,
        reviewedAt:       undefined,
        rejectionReason:  undefined,
        redoCount:        0,
      });
    }
  },

  requestRedo: (choreId, reviewerId, reason, _presetKey) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.status !== 'pending_approval') return;

    const newRedoCount = (chore.redoCount ?? 0) + 1;
    get().updateChore(choreId, {
      status:          'redo_requested',
      rejectionReason: reason,
      reviewedAt:      new Date().toISOString(),
      reviewedById:    reviewerId,
      redoCount:       newRedoCount,
    });
  },

  cheerChore: (choreId, fromMemberId, opts) => {
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    if ((chore.cheers ?? []).some(c => c.memberId === fromMemberId)) return; // one cheer per person
    const entry: ChoreCheer = {
      memberId: fromMemberId, at: new Date().toISOString(),
      ...(opts?.coins ? { coins: opts.coins } : {}),
      ...(opts?.note?.trim() ? { note: opts.note.trim() } : {}),
    };
    get().updateChore(choreId, { cheers: [...(chore.cheers ?? []), entry] });
    supabase.functions.invoke('quest-event-notifier', {
      body: { event: 'chore_cheered', choreId, fromId: fromMemberId, coins: opts?.coins ?? 0, note: entry.note ?? null },
    }).catch(e => console.warn('[choreStore] cheerChore notify', e?.message));
  },

  approveGrandparentQuestAsParent: (choreId, parentId) => {
    // Parent approves a GP-created quest → routes to targeted kids (split points)
    // or drops to the Bounty Pool when no child was selected.
    const now = new Date().toISOString();
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) return;
    const targets = chore.targetChildIds ?? [];

    if (targets.length === 0) {
      // No kids selected → Bounty Pool. Any grandchild can claim first-come.
      get().updateChore(choreId, { status: 'todo', isPool: true, assignedToId: undefined, reviewedAt: now });
      dbUpdate('chore_tasks', choreId, { status: 'todo', is_pool: true, assigned_to_id: null, reviewed_at: now });
      return;
    }
    if (targets.length === 1) {
      // Single targeted kid → assign directly, full points.
      get().updateChore(choreId, { status: 'todo', isPool: false, assignedToId: targets[0], reviewedAt: now });
      dbUpdate('chore_tasks', choreId, { status: 'todo', is_pool: false, assigned_to_id: targets[0], reviewed_at: now });
      return;
    }

    // 2+ kids → a bounty targeted at a specific shortlist. Each kid gets their
    // own clone for the FULL point value, not a split — one kid backing out
    // must never shrink what the others earn. teamGroupId only links the
    // clones for a single consolidated review card; it no longer gates payout.
    const teamGroup = `team_${choreId}`;
    console.log(`[choreStore] approveGrandparentQuestAsParent → bounty ${teamGroup}: ${targets.length} kids × ${chore.basePoints} pts each`);
    get().updateChore(choreId, {
      status: 'todo', isPool: false, assignedToId: targets[0],
      teamGroupId: teamGroup, targetChildIds: targets, reviewedAt: now,
    });
    dbUpdate('chore_tasks', choreId, {
      status: 'todo', is_pool: false, assigned_to_id: targets[0],
      team_group_id: teamGroup, reviewed_at: now,
    });
    for (const targetKid of targets.slice(1)) {
      const cloneId = genId();
      dbInsert('chore_tasks', {
        id: cloneId, title: chore.title, description: chore.description,
        category_type: 'grandparent_quest', base_points: chore.basePoints, coins_reward: chore.coinsReward,
        xp_reward: chore.xpReward, status: 'todo', assigned_to_id: targetKid, is_pool: false,
        sponsor_user_id: chore.sponsorUserId, target_child_ids: targets,
        team_group_id: teamGroup, quest_mode: chore.questMode ?? null,
        requires_photo: chore.requiresPhotoProof, family_id: chore.familyId ?? getFamilyId(),
        due_date: chore.dueDate ?? null, created_at: now,
      });
      set(s => ({
        chores: [{
          ...chore, id: cloneId, assignedToId: targetKid, status: 'todo', isPool: false,
          teamGroupId: teamGroup, targetChildIds: targets, reviewedAt: now,
        }, ...s.chores],
      }));
    }
  },

  declineGrandparentQuestAsParent: (choreId, parentId, reason) => {
    get().updateChore(choreId, {
      status:          'declined',
      rejectionReason: reason,
      reviewedAt:      new Date().toISOString(),
    });
    dbUpdate('chore_tasks', choreId, {
      status: 'declined', rejection_reason: reason, reviewed_at: new Date().toISOString(),
    });
  },

  // Scan local store for expired approval windows and auto-approve them
  scanAndAutoApprove: () => {
    const now = Date.now();
    const toAuto = get().chores.filter(c =>
      c.status === 'pending_approval' &&
      c.approvalWindowExpiresAt &&
      new Date(c.approvalWindowExpiresAt).getTime() <= now &&
      c.assignedToId,
    );
    for (const chore of toAuto) {
      get().updateChore(chore.id, {
        status:     'auto_approved',
        approvedAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
      });
      const pts = chore.basePoints > 0 ? chore.basePoints : chore.coinsReward;
      if (pts > 0 && chore.assignedToId) get().awardPoints(chore.assignedToId, chore.id, pts);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // POINTS ECONOMY
  // ─────────────────────────────────────────────────────────────────────────

  awardPoints: (userId, choreId, points) => {
    const settings = get().householdSettings;
    const { spend, save, give } = calculateJarSplit(points, settings);

    const tx: PointTransaction = {
      id:               genId(),
      userId,
      choreInstanceId:  choreId,
      amount:           points,
      transactionType:  'EARNED',
      spendAllocation:  spend,
      saveAllocation:   save,
      giveAllocation:   give,
      notes:            `Chore approved`,
      createdAt:        new Date().toISOString(),
    };

    set(s => ({ transactions: [tx, ...s.transactions] }));

    // Update balances in DB
    supabase.rpc('increment_jar_balances', {
      member_id:    userId,
      spend_delta:  spend,
      save_delta:   save,
      give_delta:   give,
      total_delta:  points,
    }).then(({ error }) => {
      if (error) console.warn('[choreStore] increment_jar_balances', error.message);
    });

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
    });
  },

  requestCashOut: (userId, points, override) => {
    const settings = get().householdSettings;
    if (points < settings.minCashoutPoints) {
      console.warn('[choreStore] Cash-out below minimum', points);
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
    });
  },

  settleCashOut: (transactionId, method) => {
    set(s => ({
      transactions: s.transactions.map(tx =>
        tx.id === transactionId
          ? { ...tx, notes: `${tx.notes} [Settled: ${method}]` }
          : tx
      ),
    }));
    dbUpdate('point_transactions', transactionId, { notes: `Settled: ${method}` });
  },

  approveCashOut: (transactionId) => {
    set(s => ({
      transactions: s.transactions.map(tx =>
        tx.id === transactionId
          ? { ...tx, notes: `${tx.notes ?? ''} [Approved]` }
          : tx
      ),
    }));
    dbUpdate('point_transactions', transactionId, { notes: '[Approved]' });
  },

  denyCashOut: (transactionId) => {
    set(s => ({
      transactions: s.transactions.map(tx =>
        tx.id === transactionId
          ? { ...tx, notes: `${tx.notes ?? ''} [Denied]` }
          : tx
      ),
    }));
    dbUpdate('point_transactions', transactionId, { notes: '[Denied]' });
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
    set(s => {
      const existing = s.badges.find(
        b => b.userId === userId && b.badgeKey === badgeKey && b.tier === tier,
      );
      if (existing?.unlockedAt) return s; // Already unlocked

      return {
        badges: s.badges.map(b =>
          (b.userId === userId && b.badgeKey === badgeKey && b.tier === tier)
            ? { ...b, unlockedAt: now, bonusPerkActive: true }
            : b
        ),
      };
    });
    AsyncStorage.setItem(CACHE_KEY_BADGES, JSON.stringify(get().badges));
    dbUpdate('user_badges', badgeKey, { unlocked_at: now, bonus_perk_active: true });
  },

  getBadgeProgress: (userId) => {
    return get().badges.filter(b => b.userId === userId);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARENT-ONLY QUESTS
  // ─────────────────────────────────────────────────────────────────────────

  addParentQuest: (choreId, assignedBy, assignedTo, mode = 'PULL') => {
    console.log(`[choreStore] addParentQuest called — choreId=${choreId} assignedBy=${assignedBy} assignedTo=${assignedTo ?? '(self)'} mode=${mode}`);
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore) {
      console.warn(`[choreStore] addParentQuest ABORTED — no chore found with id=${choreId}`);
      return null;
    }
    // Household Backlog's pool mixes real parent_only_quest chores with
    // shopping-type quests (both flagged isAdultTask upstream and rendered as
    // pseudo parent_only_quest rows) — this guard only accepted the former,
    // so "Take It" silently no-op'd for every grocery run.
    if (!['parent_only_quest', 'shopping'].includes(chore.categoryType)) {
      console.warn(`[choreStore] addParentQuest ABORTED — chore "${chore.title}" has categoryType="${chore.categoryType}", not parent_only_quest/shopping`);
      return null;
    }

    const now = new Date().toISOString();
    const finalAssignedTo = assignedTo ?? assignedBy;
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
      createdAt:         now,
      updatedAt:         now,
    };

    set(s => ({ parentAssignments: [assignment, ...s.parentAssignments] }));
    dbInsert('parent_quest_assignments', {
      id:          assignment.id,
      chore_id:    choreId,
      assigned_by: assignedBy,
      assigned_to: finalAssignedTo,
      status:      assignment.status,
      bounce_count: 0,
      is_locked:   false,
      created_at:  now,
      updated_at:  now,
    });

    // The Household Backlog pool/mine/theirs split is computed from the chore's
    // OWN assignedToId (Household Backlog reads `quests`, not parentAssignments),
    // so the claim must land there too — otherwise the chore never leaves the
    // pool and "Take It" reappears every time the list reloads.
    // DIRECT stays unassigned on the chore until the delegate accepts — otherwise
    // it lands in their "Assigned to you" list with a Done button and the
    // Accept/Respond card never gets a chance to render.
    if (mode === 'PULL') {
      console.log(`[choreStore] addParentQuest → assignment ${assignment.id} created (ACCEPTED); syncing chore ${choreId} → assignedToId=${finalAssignedTo} status=in_progress`);
      get().updateChore(choreId, { assignedToId: finalAssignedTo, status: 'in_progress' });
    } else {
      console.log(`[choreStore] addParentQuest → assignment ${assignment.id} created (PENDING); chore ${choreId} left unassigned until accepted`);
    }

    return assignment;
  },

  respondToParentQuest: (assignmentId, response) => {
    console.log(`[choreStore] respondToParentQuest called — assignmentId=${assignmentId} action=${response.action}`);
    const assignment = get().parentAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      console.warn(`[choreStore] respondToParentQuest ABORTED — no assignment found with id=${assignmentId}`);
      return;
    }
    if (assignment.isLocked) {
      console.warn(`[choreStore] respondToParentQuest ABORTED — assignment ${assignmentId} is locked (two-bounce rule)`);
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
      case 'SNOOZE':
        newStatus = 'SNOOZED';
        snoozeUntil = new Date(Date.now() + 48 * 3600_000).toISOString();
        break;
      case 'BLOCKER':
      case 'TRADE':
      case 'DISCUSS':
        newStatus = 'PARKED';
        newBounceCount += 1;
        // Spec: Two-Bounce Rule — lock after bounce_count >= 1
        if (newBounceCount >= 1) {
          newIsLocked = true;
        }
        break;
    }

    console.log(`[choreStore] respondToParentQuest → assignment ${assignmentId}: status=${newStatus} bounceCount=${newBounceCount} locked=${newIsLocked}`);
    set(s => ({
      parentAssignments: s.parentAssignments.map(a =>
        a.id === assignmentId
          ? {
              ...a,
              status:             newStatus,
              snoozeUntil,
              bounceCount:        newBounceCount,
              isLocked:           newIsLocked,
              actionablePushback: response.action === 'ACCEPT' ? undefined : response.action as PushbackType,
              pushbackDetails:    response.details,
              updatedAt:          now,
            }
          : a
      ),
    }));

    // Keep the chore row in step — the backlog's pool/mine/theirs split reads the
    // chore, not the assignment. A bounced task must lose its assignee or it sits
    // on the refuser's list forever and nobody else can pick it up.
    if (newStatus === 'ACCEPTED') {
      get().updateChore(assignment.choreId, { assignedToId: assignment.assignedTo, status: 'in_progress' });
    } else if (newStatus === 'PARKED') {
      get().updateChore(assignment.choreId, { assignedToId: undefined, status: 'todo' });
    }

    dbUpdate('parent_quest_assignments', assignmentId, {
      status:               newStatus,
      snooze_until:         snoozeUntil,
      bounce_count:         newBounceCount,
      is_locked:            newIsLocked,
      actionable_pushback:  response.action === 'ACCEPT' ? null : response.action,
      pushback_details:     response.details,
      updated_at:           now,
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
    dbUpdate('parent_quest_assignments', assignmentId, {
      status:       'COMPLETED',
      completed_at: now,
      updated_at:   now,
    });
    console.log(`[choreStore] completeParentQuest → syncing chore ${assignment.choreId} status=completed`);
    get().updateChore(assignment.choreId, { status: 'completed' });
  },

  appreciationPing: (assignmentId, fromId, message) => {
    // Fire-and-forget appreciation message (no points)
    supabase.functions.invoke('quest-event-notifier', {
      body: { event: 'appreciation_ping', assignmentId, fromId, message },
    }).catch(e => console.warn('[choreStore] appreciationPing', e?.message));
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
    return chore;
  },

  declineGrandparentQuest: (choreId, parentId, reason) => {
    // Kid declines a GP quest assigned to them → release back to the pool so
    // siblings can still claim it. Single-target quests go back to the bounty
    // pool rather than being killed entirely.
    const chore = get().chores.find(c => c.id === choreId);
    if (!chore || chore.categoryType !== 'grandparent_quest') return;
    if (chore.status !== 'todo') return;
    if (!chore.isPool && !chore.targetChildIds?.length) {
      // Directly assigned → release to pool for the whole family.
      get().updateChore(choreId, {
        status: 'todo', isPool: true, assignedToId: undefined,
        rejectionReason: reason, reviewedAt: new Date().toISOString(),
      });
      dbUpdate('chore_tasks', choreId, {
        status: 'todo', is_pool: true, assigned_to_id: null,
        rejection_reason: reason, reviewed_at: new Date().toISOString(),
      });
      return;
    }
    get().updateChore(choreId, {
      status: 'declined', rejectionReason: reason, reviewedAt: new Date().toISOString(),
    });
  },

  createAndAddParentQuest: (task) => {
    const familyId = getFamilyId();
    const now = new Date().toISOString();
    const chore: ChoreTask = {
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
    set(s => ({ chores: [chore, ...s.chores] }));
    dbInsert('chore_tasks', {
      id: chore.id, title: chore.title, description: chore.description,
      category_type: 'parent_only_quest', base_points: 0,
      status: 'todo', assigned_to_id: chore.assignedToId,
      created_by_id: task.createdById, family_id: familyId,
      due_date: task.dueDate, created_at: now,
    });
    // If DIRECT mode, create assignment immediately
    if (task.mode === 'DIRECT' && task.assignedTo) {
      get().addParentQuest(chore.id, task.createdById, task.assignedTo, 'DIRECT');
    }
    return chore;
  },

  addGrandparentMatch: (match) => {
    const now = new Date().toISOString();
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
    get().updateChore(choreId, { status: 'todo' }); // Moves from pending to claimable
    dbUpdate('chore_tasks', choreId, {
      status:      'todo',
      reviewed_at: new Date().toISOString(),
    });
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

    // Award points with 50/40/10 jar split (grandparent funded)
    if (chore.basePoints > 0) {
      const settings = get().householdSettings;
      const split = calculateJarSplit(chore.basePoints, settings, { spendPct: 50, savePct: 40, givePct: 10 });
      get().awardPoints(chore.assignedToId, choreId, chore.basePoints);
      // Update jar balances on member record
      const members = get().transactions; // side-effect: the transaction records the split
      void split; // split values available for future DB write to member jar columns
    }

    // Increment Grand Champion badge progress
    get().updateBadgeProgress(chore.assignedToId, 'grand_champion',
      (get().badges.find(b =>
        b.userId === chore.assignedToId && b.badgeKey === 'grand_champion',
      )?.progress ?? 0) + 1,
    );
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
        spend_allocation_pct:             settings.spendAllocationPct,
        save_allocation_pct:              settings.saveAllocationPct,
        give_allocation_pct:              settings.giveAllocationPct,
        allow_child_allocation_override:  settings.allowChildAllocationOverride,
        auto_approve_timeout_hours:       settings.autoApproveTimeoutHours,
        min_cashout_points:               settings.minCashoutPoints,
      }).eq('id', familyId).then(({ error }) => {
        if (error) console.warn('[choreStore] updateHouseholdSettings', error.message);
      });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SELECTORS
  // ─────────────────────────────────────────────────────────────────────────

  getChildDashboard: (childId) => {
    const todayStr = new Date().toISOString().split('T')[0];
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
      completedToday: allVisible.filter(c =>
        c.assignedToId === childId &&
        ['approved', 'auto_approved', 'completed'].includes(c.status) &&
        (c.approvedAt ?? c.submittedAt ?? '').startsWith(todayStr),
      ),
      pendingReview: allVisible.filter(c =>
        c.assignedToId === childId &&
        ['pending_approval', 'pending_grandparent_approval'].includes(c.status),
      ),
    };
  },

  getParentReviewDeck: () => {
    return get().chores
      .filter(c => c.status === 'pending_approval' && !c.isPrivateParent)
      .sort((a, b) => (a.submittedAt ?? a.createdAt) < (b.submittedAt ?? b.createdAt) ? -1 : 1);
  },

  getParentQuestPool: () => {
    const done = new Set<ChoreStatus>(['approved', 'auto_approved', 'completed', 'declined', 'expired']);
    return get().chores
      .filter(c => c.categoryType === 'parent_only_quest' && !c.assignedToId && !done.has(c.status))
      .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
  },

  getMemberBalance: (memberId) => {
    const txs = get().transactions.filter(t => t.userId === memberId);
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
