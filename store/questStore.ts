// ─── Quest types ─────────────────────────────────────────────────────────────
// The actual Zustand store/runtime that used to live in this file is dead —
// nothing has been wired to it since the app moved to choreStore.ts
// (accessed via choreAdapter.ts's useQuestStore shim, which QuestsScreen,
// KidView, TeenView, TodayView, and every quest-card component actually
// import). These type definitions are still the shared vocabulary ~17 files
// import (`import type { Quest, QuestCategory, ... } from '@/store/questStore'`)
// and choreAdapter.ts maps ChoreTask <-> Quest against them, so they're kept
// here as the single source of truth for the shape — just with no store
// attached. Do not add a `useQuestStore` export here; use
// `@/store/choreAdapter`'s `useQuestStore` for the real, live store.

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
  // A grandparent_quest still sitting at the DB's pending_parent_approval
  // status collapses to QuestStatus 'todo' (choreAdapter's
  // choreStatusToQuestStatus) so existing 'todo' handling elsewhere doesn't
  // need to change — but that means status alone can't tell a kid-visible
  // ready quest from one still waiting on a parent's safety review. Callers
  // that decide kid visibility MUST check this before showing a
  // grandparent_quest as claimable.
  awaitingParentApproval?: boolean;
  dueDate?:         string;
  dueTime?:         string;
  // Call-style reminder — opt-in, rings the assignee via CallKit/
  // ConnectionService this many minutes before dueTime.
  alertCall?:            boolean;
  alertCallLeadMinutes?: number;

  startedAt?:       string;
  claimedAt?:       string;
  submittedAt?:     string;
  approvedAt?:      string;
  completedAt?:     string;
  declinedAt?:      string;
  archivedAt?:      string;
  cancelledAt?:     string;
  reviewedById?:    string;  // who approved/declined it — chore_tasks.reviewed_by_id

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

  // Cheer Squad — GP/sibling reactions on a completed quest
  cheers?:          QuestCheer[];
  /** GP team job: quests sharing this id pay out only when all are approved. */
  teamGroupId?:     string;
  /** GP quest: who sponsored/created it (undefined for regular chores). */
  sponsorUserId?:   string;
}

export interface QuestCheer {
  memberId: string;   // who sent the cheer
  at:       string;   // ISO
  coins?:   number;   // optional kudos coins gifted alongside (GP only)
  note?:    string;   // optional kudos text note
}
