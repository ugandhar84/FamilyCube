# Family Chore System — Complete Feature Specification & Development Guide

**Document Version:** 1.0  
**Last Updated:** 2026-08-15  
**Status:** Ready for Development  
**Target Platform:** React Native (Expo SDK 56) / React Web

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Data Model & Schema](#2-data-model--schema)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Feature 1: Child Dashboard & Task Execution](#4-feature-1-child-dashboard--task-execution)
5. [Feature 2: Parent Review & Approval Deck](#5-feature-2-parent-review--approval-deck)
6. [Feature 3: Grandparent Quests & Sponsorship](#6-feature-3-grandparent-quests--sponsorship)
7. [Feature 4: Point Economy & Cash Realization](#7-feature-4-point-economy--cash-realization)
8. [Feature 5: Parent-Only Quests & Anti-Ping-Pong](#8-feature-5-parent-only-quests--anti-ping-pong)
9. [Feature 6: Badge Engine & Gamification](#9-feature-6-badge-engine--gamification)
10. [Feature 7: Household Settings & Administration](#10-feature-7-household-settings--administration)
11. [API Specification](#11-api-specification)
12. [Error Handling & Edge Cases](#12-error-handling--edge-cases)
13. [Implementation Roadmap](#13-implementation-roadmap)

---

## 1. SYSTEM OVERVIEW

### 1.1 Core Philosophy

The **Intergenerational Chore & Gamification Platform** bridges three family demographics:

| Role | Primary Goal | Interaction Pattern |
|------|--------------|-------------------|
| **Children (Doers)** | Earn points for completing chores; learn financial literacy | Claim → Execute → Submit → Await Approval → Cash Out |
| **Parents (Admins)** | Create routines; approve completions; manage household finances | Create → Assign → Review → Approve → Settle Ledger |
| **Grandparents (Sponsors)** | Fund special quests; celebrate achievements; match savings | Fund → Monitor → Celebrate → Match/Boost |

### 1.2 Key Mechanics

- **Task Categories:** Citizenship (0 pts), Routines (base pts), Bounty (high pts), Grandparent Quests (custom), Parent-Only (0 pts, private)
- **Approval Flow:** Child submits → Parent reviews within 24h → Auto-approve if unreviewed
- **Point-to-Cash:** 100 pts = $1.00 (configurable); auto-splits 50% Spend / 40% Save / 10% Give
- **Privacy Wall:** Parent-Only Quests invisible to children & grandparents (database-level RLS)
- **Anti-Ping-Pong:** Two-Bounce Rule + Actionable Pushback for co-parent tasks

---

## 2. DATA MODEL & SCHEMA

### 2.1 Database Tables (PostgreSQL)

#### **Table: `households`**
Represents a single family household and its configuration.

```sql
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  points_to_fiat_ratio DECIMAL(10, 4) DEFAULT 0.0100,  -- $100 pts = $1.00
  spend_allocation_pct INT DEFAULT 50,    -- % to Spend Jar
  save_allocation_pct INT DEFAULT 40,     -- % to Save Jar
  give_allocation_pct INT DEFAULT 10,     -- % to Give Jar
  allow_child_allocation_override BOOLEAN DEFAULT FALSE,  -- Child can adjust split
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Fields Explained:**
- `points_to_fiat_ratio`: Inverse ratio (0.01 = 100 pts → $1.00). Parents adjust in Settings.
- `*_allocation_pct`: Default auto-split percentages; sum must equal 100.
- `allow_child_allocation_override`: If true, child can manually adjust split on cash-out.

---

#### **Table: `users`**
All household members across roles.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  auth_uid VARCHAR(255) UNIQUE,  -- Link to auth provider (Supabase, Firebase, etc.)
  role VARCHAR(20) NOT NULL CHECK (role IN ('PARENT', 'CHILD', 'GRANDPARENT')),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  avatar_url TEXT,
  emoji_avatar VARCHAR(10),  -- Single emoji fallback (e.g., "🧒")
  spend_balance INT DEFAULT 0,   -- Points allocated to Spend Jar
  save_balance INT DEFAULT 0,    -- Points allocated to Save Jar
  give_balance INT DEFAULT 0,    -- Points allocated to Give Jar
  total_points_earned INT DEFAULT 0,  -- Lifetime earnings (read-only)
  streak_count INT DEFAULT 0,    -- Current consecutive day streak
  streak_last_completed_date DATE,  -- Last day routine was 100% complete
  streak_frozen_dates DATE[],  -- Dates protected by Streak Freeze
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(household_id, email)  -- Prevent duplicate emails per household
);
```

**Fields Explained:**
- `role`: Determines API visibility, UI sections, and permission matrix.
- `*_balance`: Real-time points in each jar; sum != total_points_earned (child can spend).
- `streak_count`: Incremented daily if all Citizenship + Routine tasks completed.
- `streak_frozen_dates`: Array of dates protected by parent Freeze or Streak Shield purchase.

---

#### **Table: `chore_definitions`**
Template definitions for tasks; referenced by instances.

```sql
CREATE TABLE chore_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(30) NOT NULL CHECK (category IN (
    'CITIZENSHIP',      -- Non-negotiable (0 pts)
    'ROUTINE',          -- Standard recurring (base pts)
    'BOUNTY',           -- High-effort competitive (premium pts)
    'GRANDPARENT_QUEST', -- Intergenerational (custom pts + badges)
    'PARENT_ONLY_QUEST'  -- Adult-only logistics (0 pts, private)
  )),
  is_private_parent BOOLEAN GENERATED ALWAYS AS (category = 'PARENT_ONLY_QUEST') STORED,
  base_points INT NOT NULL DEFAULT 0,
  requires_photo_proof BOOLEAN DEFAULT FALSE,
  recurrence_rule JSONB,  -- { "frequency": "DAILY" | "WEEKLY" | "FIRST_COME", "days": [0,1,2...], "rotation_sibling_ids": [...] }
  due_date DATE,  -- For one-off Bounty or Grandparent Quests
  sponsor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Grandparent or Parent funding this
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Recurrence Rule Examples:**
```json
{
  "frequency": "DAILY",
  "rotation": false
}

{
  "frequency": "WEEKLY",
  "days": [1, 3, 5],  -- Mon, Wed, Fri
  "rotation": false
}

{
  "frequency": "ROTATING",
  "sibling_ids": ["uuid-child-1", "uuid-child-2", "uuid-child-3"],
  "rotation_cycle_days": 3  -- Rotates every 3 days
}

{
  "frequency": "FIRST_COME",
  "duration_days": 7  -- Expires after 7 days if unclaimed
}
```

---

#### **Table: `chore_instances`**
Individual task occurrences; one instance per day per chore (for recurring) or per claim (for Bounty).

```sql
CREATE TABLE chore_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_id UUID NOT NULL REFERENCES chore_definitions(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL for Bounty until claimed
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',           -- Assigned; waiting for child action
    'SUBMITTED',         -- Child submitted; awaiting parent review
    'APPROVED',          -- Parent approved; points credited
    'REDO_REQUESTED',    -- Parent rejected; child resubmitting
    'AUTO_APPROVED'      -- 24h window closed; auto-approved
  )),
  proof_image_url TEXT,  -- S3 URL or similar
  proof_notes TEXT,      -- Child's optional notes with submission
  completed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  redo_count INT DEFAULT 0,  -- Tracks rejections; max 2 before auto-approve
  rejection_reason VARCHAR(500),  -- Parent's feedback
  instance_date DATE NOT NULL,  -- Date this instance is "for" (useful for recurring)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(chore_id, assigned_to, instance_date)  -- Prevent duplicate instances for same day
);
```

**Status Flow Diagram:**
```
PENDING
  ├─→ SUBMITTED (child taps "Mark Complete")
  │    ├─→ APPROVED (parent swipes right)
  │    │    └─→ points credited
  │    ├─→ REDO_REQUESTED (parent swipes left + reason)
  │    │    └─→ back to PENDING
  │    └─→ AUTO_APPROVED (24h window, unreviewed)
  │         └─→ points credited
  └─→ [Bounty unclaimed → auto-expire after 7 days]
```

---

#### **Table: `point_transactions`**
Ledger of all point movements (earned, spent, allocated, cashed out).

```sql
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chore_instance_id UUID REFERENCES chore_instances(id) ON DELETE SET NULL,  -- NULL for manual/admin
  amount INT NOT NULL,  -- Raw points earned/spent
  transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN (
    'EARNED',           -- Points credited from chore approval
    'CASH_OUT',         -- Points converted to fiat
    'SAVED',            -- Explicit move to Save Jar
    'SPENT',            -- Explicit move to Spend Jar
    'GIVEN',            -- Explicit move to Give Jar
    'GRANDPARENT_MATCH', -- Match contribution from grandparent
    'STREAK_FREEZE',    -- Adjustment for streak protection
    'ADMIN_ADJUSTMENT'  -- Manual parent override
  )),
  spend_allocation INT DEFAULT 0,    -- Points routed to Spend Jar
  save_allocation INT DEFAULT 0,     -- Points routed to Save Jar
  give_allocation INT DEFAULT 0,     -- Points routed to Give Jar
  notes TEXT,  -- Reason for transaction (e.g., "Chore: Unload dishwasher")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Transaction Examples:**

*Example 1: Child completes "Unload dishwasher" (50 pts, Routine)*
```sql
INSERT INTO point_transactions VALUES (
  gen_random_uuid(),
  'child-uuid',
  'chore-instance-uuid',
  50,  -- amount
  'EARNED',
  25,  -- spend_allocation (50% of 50)
  20,  -- save_allocation (40% of 50)
  5,   -- give_allocation (10% of 50)
  'Chore: Unload dishwasher (APPROVED)',
  NOW()
);
```

*Example 2: Child cashes out 200 pts*
```sql
INSERT INTO point_transactions VALUES (
  gen_random_uuid(),
  'child-uuid',
  NULL,
  200,  -- amount
  'CASH_OUT',
  100,  -- spend_allocation
  80,   -- save_allocation
  20,   -- give_allocation
  'Cash-out: 200 pts → $2.00',
  NOW()
);
```

---

#### **Table: `user_badges`**
Tracks badge unlocks per user, with tier levels.

```sql
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key VARCHAR(50) NOT NULL,  -- e.g., "streak_titan", "iron_vault", "grand_champion"
  tier VARCHAR(20) DEFAULT 'STANDARD' CHECK (tier IN ('STANDARD', 'SILVER', 'GOLD', 'DIAMOND')),
  progress INT DEFAULT 0,  -- e.g., days completed toward Streak Titan
  progress_target INT,  -- e.g., 7 for Streak Titan (Bronze)
  unlocked_at TIMESTAMP WITH TIME ZONE,
  visual_url TEXT,  -- URL to badge image/emoji
  bonus_perk_active BOOLEAN DEFAULT TRUE,  -- Whether bonus is currently applying
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, badge_key, tier)  -- One badge/tier per user
);
```

---

#### **Table: `parent_quest_assignments`**
Tracks co-parent adult task assignments and state.

```sql
CREATE TABLE parent_quest_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chore_id UUID NOT NULL REFERENCES chore_definitions(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- Parent who created
  assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- Partner
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',            -- Awaiting partner acknowledgment
    'ACCEPTED',           -- Partner pulled task
    'IN_PROGRESS',        -- Partner working on it
    'COMPLETED',          -- Partner marked done
    'PARKED',             -- "Let's Discuss" → moved to sync list
    'DECLINED',           -- "Declined" → unassigned pool
    'SNOOZED'             -- "Snooze 48h"
  )),
  snooze_until TIMESTAMP WITH TIME ZONE,  -- When snooze expires
  bounce_count INT DEFAULT 0,  -- Tracks back-and-forth; max 1 before locked
  is_locked BOOLEAN DEFAULT FALSE,  -- Two-Bounce Rule; assignment feature disabled
  actionable_pushback VARCHAR(50),  -- 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS'
  pushback_details TEXT,  -- "Need 48h" | "Need password" | "I'll trade for X"
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

#### **Table: `grandparent_matches`**
Stores active match rules and contribution history.

```sql
CREATE TABLE grandparent_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  grandparent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_type VARCHAR(20) NOT NULL CHECK (match_type IN (
    'FIXED_PERCENTAGE',   -- e.g., 100% match
    'FIXED_AMOUNT',       -- e.g., $10/month cap
    'GOAL_PLEDGE'         -- e.g., "If you reach 5000 pts, I'll add $25"
  )),
  match_value DECIMAL(10, 2),  -- Percentage (e.g., 1.0 = 100%) or dollar amount
  match_jar VARCHAR(20) CHECK (match_jar IN ('SPEND', 'SAVE', 'GIVE')),  -- Which jar gets boosted
  goal_target INT,  -- For GOAL_PLEDGE: target points child must reach
  max_monthly_contribution DECIMAL(10, 2),  -- Monthly cap for FIXED_PERCENTAGE
  monthly_contributed_ytd DECIMAL(10, 2) DEFAULT 0,  -- Tracking for cap
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(grandparent_id, child_id, match_type)
);
```

---

#### **Table: `notifications`**
Event log for push/in-app notifications.

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
    'TASK_APPROVED',
    'TASK_REJECTED',
    'TASK_AUTO_APPROVED',
    'POINTS_CASHED_OUT',
    'BADGE_UNLOCKED',
    'STREAK_MILESTONE',
    'GRANDPARENT_MATCH_CONTRIBUTION',
    'PARENT_QUEST_ASSIGNED',
    'PARENT_QUEST_DUE_SOON',
    'CHORE_PENDING_REVIEW',
    'BOUNTY_EXPIRING',
    'GRANDPARENT_QUEST_CREATED'
  )),
  title VARCHAR(200) NOT NULL,
  body TEXT,
  metadata JSONB,  -- e.g., { "chore_id": "...", "points": 50, "badge_name": "Streak Titan" }
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 2.2 Row-Level Security (RLS) Policies

#### **Policy 1: Parent-Only Quest Invisibility**

```sql
ALTER TABLE chore_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY parent_quest_isolation_policy ON chore_definitions
  FOR ALL
  USING (
    -- Allow access if: not a parent-only quest, OR user is a parent
    category != 'PARENT_ONLY_QUEST'
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'PARENT'
      AND users.household_id = chore_definitions.household_id
    )
  );
```

**Result:**
- Child logs in → Cannot query/see any row where `category = 'PARENT_ONLY_QUEST'`
- Grandparent logs in → Cannot query/see any row where `category = 'PARENT_ONLY_QUEST'`
- Parent logs in → Can see all rows, including PARENT_ONLY_QUEST

#### **Policy 2: Household Isolation**

```sql
CREATE POLICY household_isolation_policy ON users
  FOR SELECT
  USING (household_id = auth.user_household_id());  -- Custom claim set at auth time

CREATE POLICY household_isolation_policy ON chore_definitions
  FOR SELECT
  USING (household_id = auth.user_household_id());

-- Apply to all tables...
```

**Result:**
- User can only see/modify data for their household
- No cross-household data leakage

---

## 3. USER ROLES & PERMISSIONS

### 3.1 Permission Matrix

| Action | Parent | Child | Grandparent |
|--------|--------|-------|-------------|
| **Create Citizen Chores** | ✅ Full | ❌ | ❌ |
| **Create Routines** | ✅ Full | ❌ | ❌ |
| **Post Bounties** | ✅ Full | ❌ | ❌ |
| **Sponsor Grandparent Quests** | ✅ Approve | ❌ | ✅ Create & Fund |
| **Create Parent-Only Quests** | ✅ Full (Private) | ❌ Hidden | ❌ Hidden |
| **Claim/Execute Tasks** | ❌ | ✅ Full | ❌ |
| **Submit Proof** | ❌ | ✅ Full | ❌ |
| **Approve/Reject** | ✅ Full | ❌ | ❌ |
| **Cash-Out Points** | ✅ Approve & Settle | ✅ Initiate | ✅ View Only |
| **Fund Cash Matches** | ✅ Accept/Decline | ❌ | ✅ Full |
| **Award Badges** | ✅ System-Triggered | ❌ | ✅ Kudos/Stickers |
| **View Leaderboard** | ✅ Full | ✅ Full (no parent earnings) | ✅ Full (no adult tasks) |
| **Manage Settings** | ✅ Full | ❌ | ❌ |
| **Assign Parent Quests** | ✅ Create & Assign to Partner | ❌ | ❌ |
| **Respond to Parent Quests** | ✅ Accept/Snooze/Trade/Discuss | ❌ | ❌ |

---

### 3.2 Role-Specific Dashboards

#### **Child Dashboard**
- **Top Section:** Today's Citizenship + Routine tasks (pinned, must complete for streak)
- **Bounty Board:** Available first-come Bounties (with point values & claim buttons)
- **Grandparent Quests:** Active quests from grandparents (funded & approved)
- **Points Summary:** Spend | Save | Give jars + total earned
- **Streak Counter:** Current consecutive days + next milestone badge
- **Completed Today:** Cards showing approved tasks from today
- **Pending Review:** Tasks submitted but awaiting parent approval

#### **Parent Dashboard (Hub)**
- **Today's Review Deck:** Card stack of pending chore submissions (swipe right/left)
- **Quick Stats:** 
  - Tasks reviewed today
  - Children's streaks
  - Pending cash-outs
  - Grandparent match contributions YTD
- **Family Leaderboard:** Children's rankings by streaks, badges, earnings
- **Bounty Board Management:** Create, edit, expire bounties
- **Parent Quest Pool:** Co-parent tasks in Household Backlog (pull-based)
- **Settings:** Points ratio, jar allocations, streak rules, approval timeout
- **Cash Ledger:** Pending cash-outs, settlement history, match tracking

#### **Grandparent Dashboard**
- **Family Kudos Feed:** Read-only stream of child completions (photos, timestamps)
- **Active Quests Sponsored:** Quests created by me + status per child
- **Match Rules:** My active matches per child (% match, monthly spent, goals)
- **Badges:** Children's milestone badges (Grand Champion, Tech Guru, etc.)
- **One-Tap Actions:**
  - Sponsor a New Quest
  - Fund a Match
  - Send Praise Sticker
- **Leaderboard:** View by child, no adult/parent tasks visible

---

## 4. FEATURE 1: Child Dashboard & Task Execution

### 4.1 User Flow: Claim & Complete a Routine Task

```
┌─────────────────────────────────────────────────────────────────┐
│ CHILD VIEWS DASHBOARD                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ TODAY'S CITIZENSHIP (Required for Streak)                      │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ ☐ Make your bed                                             ││
│ │ ☐ Clear dinner plate                                        ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ YOUR ROUTINES (EARN POINTS)                                   │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ ☐ Unload dishwasher              50 pts ($0.50)            ││
│ │ ☐ Feed pets                       30 pts ($0.30)            ││
│ │ ☐ Vacuum living room              60 pts ($0.60)            ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ BOUNTY BOARD (CLAIM & EARN)                                   │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Wash family vehicle interior      300 pts ($3.00)  [CLAIM] ││
│ │ Organize tool shed                250 pts ($2.50)  [CLAIM] ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ GRANDPARENT QUESTS                                            │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ 30-min tech help (Grandpa)        250 pts        [START]  ││
│ │ Read chapter aloud (Grandma)      200 pts        [START]  ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Step 1: Child taps "Unload dishwasher"
        ↓
Step 2: [Optional] Taps "MARK COMPLETE" when done
        (Photo proof dialog opens if `requires_photo_proof = true`)
        ↓
Step 3: Child takes photo (before/after) or skips
        ↓
Step 4: Taps "SUBMIT" → status = SUBMITTED
        Task moves to parent's Review Deck
        ↓
Step 5: [Auto-timeout] If parent doesn't review in 24h,
        status = AUTO_APPROVED
        Points credited instantly
        ↓
Step 6: Child sees "Approved!" notification
        Points appear in Spend/Save/Give jars
```

---

### 4.2 UI Mockup: Child Task Card

```
┌──────────────────────────────────────────────────────┐
│ UNLOAD DISHWASHER                  [Routine Chore]  │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Description: Empty the dishwasher and put dishes   │
│              in cabinets. Wipe down counter.        │
│                                                      │
│ Points:      50 pts ($0.50)                        │
│              • Spend: $0.25                         │
│              • Save:  $0.20                         │
│              • Give:  $0.05                         │
│                                                      │
│ Photo Required: Yes                                 │
│                                                      │
│ Status: PENDING (assigned to you)                  │
│                                                      │
│ [MARK COMPLETE & TAKE PHOTO] [SKIP]               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

### 4.3 UI Mockup: Photo Submission Flow

```
AFTER TAPPING "MARK COMPLETE":

┌───────────────────────────────────────────┐
│ Submit Proof Photo                        │
├───────────────────────────────────────────┤
│                                           │
│ [OPEN CAMERA] [CHOOSE FROM GALLERY]      │
│                                           │
│ ┌─────────────────────────────────────┐  │
│ │                                     │  │
│ │       [Before/After Photo]          │  │
│ │                                     │  │
│ └─────────────────────────────────────┘  │
│                                           │
│ Optional notes:                           │
│ ┌─────────────────────────────────────┐  │
│ │ Did the best I could! 💪           │  │
│ └─────────────────────────────────────┘  │
│                                           │
│ [CANCEL]  [SUBMIT FOR REVIEW]           │
│                                           │
└───────────────────────────────────────────┘

On SUBMIT:
• Image uploaded to S3 (async)
• Status changes to SUBMITTED
• proof_image_url populated
• proof_notes saved
• Notification: "Task submitted! Parent will review soon."
```

---

### 4.4 Feature Requirements: Child Task Execution

#### **Requirement 4.4.1: Task Discovery**
- **Scope:** Display all pending & upcoming tasks assigned to child
- **Rules:**
  - Sort order: Citizenship (pinned) → Routines (by date/priority) → Bounties → Grandparent Quests
  - Filter toggle: Show only "Due Today" vs. "All Pending"
  - Bounty cards show "First-come" badge + expiration timer
- **API Endpoint:** `GET /api/chores/child-dashboard`
  - Query params: `household_id`, `child_id`, `include_expired=false`
  - Returns: `chore_definition[]` with `next_instance_date`, `status`, `points`, `expires_at`

---

#### **Requirement 4.4.2: Task Claim (Bounty Only)**
- **Scope:** Child claims a Bounty before anyone else
- **Rules:**
  - Once claimed, `assigned_to = child_id`
  - Other children see "Claimed by Sibling Name" badge (read-only)
  - Recurrence = FIRST_COME; duration is 7 days default
  - If unclaimed after 7 days, status = EXPIRED; parent can re-post
- **API Endpoint:** `POST /api/chores/{chore_id}/claim`
  - Body: `{ "child_id": "...", "claimed_at": "2026-08-15T10:30:00Z" }`
  - Returns: updated `chore_instance` with `assigned_to` populated
  - Error: 409 Conflict if already claimed

---

#### **Requirement 4.4.3: Task Submission & Photo Proof**
- **Scope:** Child marks task complete and optionally uploads photo
- **Rules:**
  - Status changes: PENDING → SUBMITTED
  - Photo is optional unless `chore.requires_photo_proof = true`
  - Max photo size: 5 MB
  - Upload async (show spinner, allow background)
  - Retry logic: If upload fails, show "Retry" button
- **API Endpoints:**
  1. `POST /api/chores/{instance_id}/submit`
     - Body: `{ "proof_notes": "...", "completed_at": "2026-08-15T14:20:00Z" }`
     - Returns: updated `chore_instance` with `status = SUBMITTED`
  
  2. `POST /api/media/upload-chore-proof` (multipart form-data)
     - Field: `image` (file)
     - Returns: `{ "url": "s3://...", "instance_id": "..." }`
     - Side effect: Updates `chore_instance.proof_image_url`

---

#### **Requirement 4.4.4: Streak Tracking**
- **Scope:** Maintain consecutive-day streak for completing all Citizenship + Routines
- **Rules:**
  - Streak increments at 11:59 PM if `instance_date = today` AND all Citizenship + Routines marked APPROVED or AUTO_APPROVED
  - If even one Citizen/Routine not done, streak resets to 0
  - Parent can freeze specific dates (sick days, holidays, trips) → streak survives
  - Child can purchase "Streak Shield" (100 Save Jar pts) → forgive 1 missed day per month
  - Streak bonus: +10% point bonus on all chores during active streak day
- **API Endpoint:** `GET /api/streaks/{child_id}`
  - Returns: `{ "current_count": 7, "last_completed_date": "2026-08-14", "frozen_dates": [...], "bonus_multiplier": 1.10 }`
- **Calculation Logic (Server-Side Cron):**
  ```
  Run daily at 11:59 PM UTC:
  1. For each child:
    a. Fetch all Citizenship + Routine instances for today
    b. Count those with status = APPROVED or AUTO_APPROVED
    c. If count == total count:
       - Increment streak_count
       - Update streak_last_completed_date = today
    d. Else:
       - Reset streak_count = 0
  2. Apply +10% bonus to all future earned points for child (via transaction multiplier)
  ```

---

## 5. FEATURE 2: Parent Review & Approval Deck

### 5.1 User Flow: Review & Approve/Reject

```
┌──────────────────────────────────────────────────────────────┐
│ PARENT OPENS "PENDING REVIEWS" TAB                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Daily Review Deck (3 pending)                              │
│                                                              │
│ CARD 1 (front)                                             │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ UNLOAD DISHWASHER              [Routine] 50 pts        ││
│ │ Submitted by: Alex                                      ││
│ │ Time: 2:30 PM today                                     ││
│ │                                                          ││
│ │ [Before/After Photo]                                   ││
│ │ Notes: "Glasses on top shelf"                          ││
│ │                                                          ││
│ │ [SWIPE LEFT ←]  [SWIPE RIGHT →]                        ││
│ │ REJECT         APPROVE                                  ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ 2 more pending...                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Step 1: Parent swipes RIGHT → Approve
        status = APPROVED
        points_earned = 50
        Transaction created: 50 pts → 25 Spend, 20 Save, 5 Give
        Notification to child: "Unload dishwasher approved! +50 pts"
        Card removed from deck

Step 2: (Alternative) Parent swipes LEFT → Request Redo
        Modal opens: "Select a reason..."
        - [ ] Missed corner of the bed
        - [ ] Glasses put away wrong
        - [ ] Counter not wiped
        - [ ] Custom message...
        
        Parent selects reason
        Status = REDO_REQUESTED
        Notification: "Please redo dishwasher. Feedback: Glasses put away wrong."
        Task returns to child dashboard
        redo_count incremented

Step 3: (Auto) 24h window passes, no review
        Status = AUTO_APPROVED
        Points credited
        Notification: "Auto-approved after 24 hours!"
```

---

### 5.2 UI Mockup: Swipeable Review Card

```
┌────────────────────────────────────────────────────┐
│ TASK REVIEW CARD (Swipeable)                      │
├────────────────────────────────────────────────────┤
│                                                    │
│ Alex — UNLOAD DISHWASHER                         │
│ Routine  50 pts ($0.50)                          │
│ Submitted: 2:30 PM today                         │
│                                                    │
│ [Photo: Unloaded dishwasher, clean counter]      │
│                                                    │
│ Notes from child:                                │
│ "Glasses on top shelf like you asked"            │
│                                                    │
│ ─────────────────────────────────────────────────│
│                                                    │
│         [←← REJECT]  [APPROVE →→]               │
│                                                    │
│ (or tap "REJECT" button to open reason modal)   │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

### 5.3 Feature Requirements: Parent Review

#### **Requirement 5.3.1: Review Deck Display**
- **Scope:** Show all pending submissions (SUBMITTED status) in card deck format
- **Rules:**
  - Sort by: oldest first (FIFO)
  - Filter options: by child, by chore type, by date
  - Card shows: child name, chore title, points, submitted time, photo, notes
  - Display countdown timer: "24h until auto-approve" (decreasing in real-time)
  - Max cards on screen: 1 (swipe to next)
- **API Endpoint:** `GET /api/chores/review-deck`
  - Query params: `household_id`, `parent_id`, `filter_by_child=null`, `filter_by_category=null`
  - Returns: `chore_instance[]` sorted by `created_at` ASC, with calculated time_until_auto_approve
- **Polling/Real-Time:** WebSocket `chores:review-deck-updated` event or 5-sec polling

---

#### **Requirement 5.3.2: Approve Action**
- **Scope:** Parent approves task submission
- **Rules:**
  - Status changes: SUBMITTED → APPROVED
  - Points calculation:
    - Base points = `chore.base_points`
    - Streak bonus = base × streak_multiplier (e.g., 1.10 if on day 7+)
    - Final points = base × streak_bonus (rounded down)
  - Auto-split: 50% Spend, 40% Save, 10% Give (from household config)
  - Create transaction: type=EARNED, amount=final_points
  - Update user.spend_balance, .save_balance, .give_balance
  - Notification to child: "[Task name] approved! +[points] pts"
  - Remove from review deck
- **API Endpoint:** `POST /api/chores/{instance_id}/approve`
  - Body: `{ "reviewed_by": "parent_id" }`
  - Side effects:
    1. Update chore_instances: status, reviewed_by, reviewed_at
    2. Create point_transaction record
    3. Increment user balances (spend, save, give)
    4. Emit notification to child
  - Returns: updated `chore_instance`

---

#### **Requirement 5.3.3: Reject Action (Request Redo)**
- **Scope:** Parent rejects task and requests resubmission
- **Rules:**
  - Status changes: SUBMITTED → REDO_REQUESTED
  - rejection_reason stored (e.g., "Missed corner", "Custom: Wipe the sink")
  - redo_count incremented
  - If redo_count >= 2:
    - Next submission (even if poor) auto-approves
    - Prevents infinite rejection loops
  - Task returns to child dashboard in "Needs Redo" state
  - Notification: "[Task name] needs redo. Feedback: [reason]"
- **API Endpoint:** `POST /api/chores/{instance_id}/request-redo`
  - Body: `{ "rejection_reason": "...", "reason_preset": "MISSED_CORNER" or "CUSTOM" }`
  - Returns: updated `chore_instance` with `status = REDO_REQUESTED`, `redo_count`
- **Rejection Reason Presets:**
  ```json
  {
    "MISSED_CORNER": "Missed a corner or spot",
    "INCOMPLETE": "Task not fully complete",
    "WRONG_METHOD": "Wrong method; see instructions",
    "QUALITY": "Quality below standard",
    "CUSTOM": "[Parent's custom message]"
  }
  ```

---

#### **Requirement 5.3.4: Auto-Approval After 24h**
- **Scope:** System auto-approves unreviewed submissions after 24 hours
- **Rules:**
  - Run every 1 minute (or 15-min batch): Check all SUBMITTED instances where `created_at < NOW() - INTERVAL '24 hours'`
  - Auto-approve using same logic as manual approve
  - Status = AUTO_APPROVED (not APPROVED, for analytics)
  - Notification to child: "Your [task] was automatically approved after 24 hours! +[points] pts"
  - Notification to parent: "Auto-approved: [task] by [child]" (informational only)
- **Implementation:** Supabase scheduled function or server-side cron job
  ```sql
  -- Pseudo-SQL cron job
  UPDATE chore_instances
  SET status = 'AUTO_APPROVED',
      reviewed_at = NOW()
  WHERE status = 'SUBMITTED'
    AND created_at < NOW() - INTERVAL '24 hours'
    AND household_id = $1;
  
  -- Then create corresponding point_transaction records
  -- Then send notifications
  ```

---

## 6. FEATURE 3: Grandparent Quests & Sponsorship

### 6.1 User Flow: Sponsor a Quest

```
┌───────────────────────────────────────────────────────────┐
│ GRANDPARENT TAPS "SPONSOR A QUEST"                       │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ New Grandparent Quest Form                              │
│ ┌───────────────────────────────────────────────────────┐│
│ │ Quest Title:                                          ││
│ │ [Tech help with phone]                                ││
│ │                                                        ││
│ │ Description:                                          ││
│ │ [30-minute FaceTime call to help download apps]     ││
│ │                                                        ││
│ │ Point Reward:                                         ││
│ │ [250] pts  ($2.50)                                   ││
│ │                                                        ││
│ │ Assign to:                                            ││
│ │ ◉ All grandkids                                       ││
│ │ ○ Specific child: [Alex ▼]                           ││
│ │                                                        ││
│ │ Due Date: (optional)                                 ││
│ │ [2026-08-31]                                         ││
│ │                                                        ││
│ │ [CANCEL]  [FUND THIS QUEST]                          ││
│ │                                                        ││
│ └───────────────────────────────────────────────────────┘│
│                                                           │
└───────────────────────────────────────────────────────────┘

Step 1: Grandparent fills form, taps FUND
        ↓
Step 2: "Fund This Quest" dialog:
        "You're funding 250 pts ($2.50) for this quest.
         This will be held until Alex completes."
        
        Taps "CONFIRM & SEND"
        ↓
Step 3: Notification sent to parent:
        "Grandma sponsored a quest! 'Tech help' (+250 pts)
         [APPROVE] [SUGGEST EDIT] [DECLINE]"
        ↓
Step 4a: (Parent approves)
         Status = APPROVED
         Notification to Alex: "Grandma sponsored a quest for you!
         Tech help with phone - 250 pts. [START]"
         ↓
Step 4b: Alex taps START
         Status = IN_PROGRESS
         Grandparent sees "In progress..."
         ↓
Step 5:  Alex completes & submits proof
         Status = PENDING_GRANDPARENT_APPROVAL
         Grandparent gets notification
         ↓
Step 6:  Grandparent taps "APPROVE & CHEER"
         Status = COMPLETED
         Points released to Alex
         Grandparent can send celebration sticker/emoji
         ↓
Step 7:  Achievement logged:
         Alex unlocks progress toward "Grand Champion" badge
         (need 10 Grandparent Quests)
```

---

### 6.2 UI Mockup: Grandparent Quest Card

```
┌──────────────────────────────────────────────────────┐
│ TECH HELP WITH PHONE          [Grandparent Quest]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│ From: Grandma Patricia                              │
│ Reward: 250 pts ($2.50)                            │
│ Due: Aug 31                                         │
│                                                      │
│ Description:                                        │
│ 30-minute FaceTime call to help download apps      │
│ and set up email on your new phone.                │
│                                                      │
│ Status: Ready to Start (Parent approved)            │
│                                                      │
│ [START QUEST]  [ASK PARENT]  [DECLINE]             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

### 6.3 Feature Requirements: Grandparent Quests

#### **Requirement 6.3.1: Quest Creation & Funding**
- **Scope:** Grandparent creates and funds a quest for child(ren)
- **Rules:**
  - Title required; 150 char max
  - Point reward required; min 50 pts
  - Description optional; 500 char max
  - Scope: All children in household, or specific child
  - Due date optional
  - Status = PENDING_PARENT_APPROVAL (awaiting parent OK)
  - Points are held in parent's escrow until completion
- **API Endpoint:** `POST /api/chores/grandparent-quests`
  - Body:
    ```json
    {
      "sponsor_user_id": "grandparent_uuid",
      "title": "Tech help with phone",
      "description": "30-min FaceTime...",
      "category": "GRANDPARENT_QUEST",
      "base_points": 250,
      "child_ids": ["child_uuid"] or [],  // empty = all children
      "due_date": "2026-08-31",
      "household_id": "household_uuid"
    }
    ```
  - Returns: created `chore_definition` with `status = PENDING_PARENT_APPROVAL`
  - Side effect: Notification to parent(s)

---

#### **Requirement 6.3.2: Parent Approval Flow**
- **Scope:** Parent approves/declines/edits grandparent quest
- **Rules:**
  - Parent receives notification with quest details
  - Can approve as-is, suggest edits (reopen quest with feedback), or decline
  - If approved: Notification sent to child(ren)
  - If declined: Notification sent to grandparent + points released back to grandparent's account
  - If edited: Grandparent notified, can re-fund or cancel
- **API Endpoints:**
  1. `POST /api/chores/{quest_id}/parent-approve`
     - Body: `{ "approved_by": "parent_uuid" }`
     - Side effect: Send notification to all assigned children
  
  2. `POST /api/chores/{quest_id}/parent-decline`
     - Body: `{ "reason": "Too expensive", "declined_by": "parent_uuid" }`
     - Side effect: Refund points to grandparent; notify grandparent
  
  3. `POST /api/chores/{quest_id}/parent-suggest-edit`
     - Body: `{ "suggested_points": 150, "feedback": "Can we make it shorter?" }`
     - Side effect: Quest paused; grandparent gets edit request

---

#### **Requirement 6.3.3: Quest Execution & Completion**
- **Scope:** Child executes quest and submits proof
- **Rules:**
  - Once child clicks START, quest status = IN_PROGRESS
  - Child marks complete & optionally uploads photo/notes
  - Status = PENDING_GRANDPARENT_APPROVAL
  - Grandparent reviews and taps APPROVE & CHEER
  - Points credited to child
  - Badge progress incremented (Grand Champion = 10 quests)
- **API Endpoints:**
  1. `POST /api/chores/{instance_id}/start-grandparent-quest`
     - Body: `{ "child_id": "...", "started_at": "..." }`
     - Returns: updated instance with `status = IN_PROGRESS`
  
  2. `POST /api/chores/{instance_id}/complete-grandparent-quest`
     - Body: `{ "proof_image_url": "...", "notes": "..." }`
     - Returns: updated instance with `status = PENDING_GRANDPARENT_APPROVAL`
  
  3. `POST /api/chores/{instance_id}/grandparent-approve-and-cheer`
     - Body: `{ "grandparent_id": "...", "celebration_sticker": "🎉" }`
     - Side effects:
       - Status = COMPLETED
       - Points credited
       - Badge progress incremented
       - Celebration sticker posted to feed
     - Returns: updated instance

---

#### **Requirement 6.3.4: Grandparent Kudos Feed**
- **Scope:** Grandparent sees read-only stream of child completions
- **Rules:**
  - Shows child photos, timestamps, badges earned
  - Grandparent can react with stickers/emojis (👏, 🎉, ❤️, etc.)
  - Grandparent can send voice cheer clips (optional feature)
  - Can filter by child or date range
- **API Endpoint:** `GET /api/grandparent/kudos-feed`
  - Query params: `household_id`, `grandparent_id`, `child_id=null`, `days=30`
  - Returns: `{ completions: [{ child_name, chore_title, image, timestamp, reactions }] }`
- **WebSocket Event:** `kudos-feed:update` (real-time new completions)

---

## 7. FEATURE 4: Point Economy & Cash Realization

### 7.1 User Flow: Child Cashes Out Points

```
┌────────────────────────────────────────────────────────────┐
│ CHILD VIEWS POINTS SUMMARY                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ YOUR POINTS                                              │
│ ┌────────────────────────────────────────────────────────┐│
│ │ SPEND JAR    $4.75                              [350 pts] ││
│ │ SAVE JAR     $2.40                              [240 pts] ││
│ │ GIVE JAR     $0.60                               [60 pts] ││
│ │                                                         ││
│ │ Total Earned: $100.00  (10,000 pts lifetime)          ││
│ │                                                         ││
│ │ [CASH OUT POINTS]                                      ││
│ └────────────────────────────────────────────────────────┘│
│                                                            │
└────────────────────────────────────────────────────────────┘

Step 1: Child taps [CASH OUT POINTS]
        ↓
Step 2: "How much?" dialog
        ┌─────────────────────────────────┐
        │ How much to cash out?            │
        │ Min: 100 pts ($1.00)            │
        │                                  │
        │ [350 pts / $3.50 selected ▼]    │
        │                                  │
        │ Split across jars:              │
        │ • Spend (50%): $1.75            │
        │ • Save  (40%): $1.40            │
        │ • Give  (10%): $0.35            │
        │                                  │
        │ [ADJUST SPLIT] [NEXT]           │
        └─────────────────────────────────┘
        ↓
Step 3: (Optional) Child taps [ADJUST SPLIT] to manually control
        ┌─────────────────────────────────┐
        │ Customize Split                  │
        │ (Total must = $3.50)            │
        │                                  │
        │ Spend: [1.75] (50%)             │
        │ Save:  [1.40] (40%)             │
        │ Give:  [0.35] (10%)             │
        │                                  │
        │ [SAVE CUSTOM SPLIT]             │
        └─────────────────────────────────┘
        ↓
Step 4: [NEXT] → Allocation Review
        ┌─────────────────────────────────┐
        │ Ready to cash out 350 pts        │
        │                                  │
        │ • Spend: $1.75 (immediate)      │
        │ • Save:  $1.40 (family vault)   │
        │ • Give:  $0.35 (to charity)     │
        │                                  │
        │ [BACK] [SUBMIT FOR APPROVAL]   │
        └─────────────────────────────────┘
        ↓
Step 5: Submitted to parent
        Notification: "Cash-out pending parent approval"
        Status = PENDING_SETTLEMENT
        ↓
Step 6: (Parent receives notification)
        "Alex is cashing out 350 pts ($3.50)"
        [VIEW] [APPROVE & SETTLE]
        ↓
Step 7: Parent selects settlement method:
        ○ Physical cash envelope
        ○ Transfer to Greenlight/GoHenry
        ○ Keep in digital ledger
        
        Taps [APPROVE & SETTLE]
        ↓
Step 8: Child notified: "Cash-out approved!"
        Points deducted from all jars
        Transaction logged
        Balances update
```

---

### 7.2 UI Mockup: Cash-Out Confirmation

```
┌──────────────────────────────────────────────────┐
│ CONFIRM CASH-OUT                                 │
├──────────────────────────────────────────────────┤
│                                                  │
│ You're cashing out 350 pts ($3.50)              │
│                                                  │
│ ┌──────────────────────────────────────────────┐│
│ │ SPEND JAR       $1.75                        ││
│ │ (immediate debit card / cash)                 ││
│ │                                              ││
│ │ SAVE JAR        $1.40                        ││
│ │ (locked vault, parent-matched interest)      ││
│ │                                              ││
│ │ GIVE JAR        $0.35                        ││
│ │ (to your chosen charity: Food Bank)         ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ [CANCEL]  [CONFIRM & SUBMIT]                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

### 7.3 Feature Requirements: Point Economy

#### **Requirement 7.3.1: Points-to-Fiat Conversion Model**
- **Scope:** System maintains configurable exchange rate between points and fiat currency
- **Rules:**
  - Default: 100 pts = $1.00 (ratio = 0.01)
  - Parent can adjust ratio in Settings
  - Ratio change applies to all future cash-outs (not retroactive)
  - Dual valuation display: all chores show "250 pts ($2.50)"
  - Calculations: fiat_value = points × ratio, rounded to nearest cent
- **API Endpoint:** `GET/PUT /api/households/{household_id}/settings/points-ratio`
  - GET returns: `{ "ratio": 0.01, "example": "100 pts = $1.00" }`
  - PUT body: `{ "new_ratio": 0.015 }` (100 pts = $1.50)
  - Side effect: Update all pending/future transactions with new ratio

---

#### **Requirement 7.3.2: Automatic Three-Jar Split Routing**
- **Scope:** When points are earned or cashed out, automatically allocate across Spend/Save/Give jars
- **Rules:**
  - Default split: 50% Spend, 40% Save, 10% Give (configurable per household)
  - Each transaction creates three point_transaction rows (one per jar)
  - Balances update atomically (all three or none)
  - Child can manually adjust split on cash-out (if `allow_child_allocation_override = true`)
  - Manual adjustments still must sum to 100%
- **Implementation:**
  ```typescript
  // Function to auto-split earned points
  async function allocateEarnedPoints(
    userId: string,
    pointsEarned: number,
    choreInstanceId: string,
    household: Household
  ) {
    const spend = Math.floor(pointsEarned * (household.spend_allocation_pct / 100));
    const save = Math.floor(pointsEarned * (household.save_allocation_pct / 100));
    const give = pointsEarned - spend - save;  // Remainder to ensure sum is exact

    // Create three transactions
    await createTransaction(userId, {
      amount: pointsEarned,
      transaction_type: 'EARNED',
      spend_allocation: spend,
      save_allocation: save,
      give_allocation: give,
      chore_instance_id: choreInstanceId
    });

    // Update user balances
    await updateUserBalances(userId, {
      spend_balance: +spend,
      save_balance: +save,
      give_balance: +give
    });
  }
  ```

---

#### **Requirement 7.3.3: Cash-Out & Settlement Approval**
- **Scope:** Child requests cash-out; parent approves & selects settlement method
- **Rules:**
  - Minimum cash-out: 100 pts (configurable)
  - Child can adjust jar split before submission (if allowed)
  - Parent receives notification & must approve within 7 days
  - Parent selects settlement method: physical, debit card, or ledger
  - Once settled, points deducted from all jars; transaction immutable
- **API Endpoints:**
  1. `POST /api/points/cash-out-request`
     - Body:
       ```json
       {
         "user_id": "child_uuid",
         "points_amount": 350,
         "spend_allocation": 175,
         "save_allocation": 140,
         "give_allocation": 35
       }
       ```
     - Returns: `{ "request_id": "...", "status": "PENDING_SETTLEMENT" }`
     - Side effect: Notification to parent
  
  2. `POST /api/points/settle-cash-out/{request_id}`
     - Body:
       ```json
       {
         "parent_id": "parent_uuid",
         "settlement_method": "DEBIT_CARD" | "PHYSICAL_CASH" | "LEDGER",
         "settlement_details": {
           "card_id": "greenlight_123",
           "notes": "Transferred to Greenlight card"
         }
       }
       ```
     - Side effects:
       - Deduct points from user balances
       - Create final point_transaction record
       - Update ledger history
       - Notify child: "Cash-out settled!"
     - Returns: `{ "status": "COMPLETED", "receipt_id": "..." }`

---

#### **Requirement 7.3.4: Grandparent Match & Boost Mechanics**
- **Scope:** Grandparent sets match rules & contributes to child's jars
- **Rules:**
  - Match types: FIXED_PERCENTAGE (100% match), FIXED_AMOUNT ($10/month cap), GOAL_PLEDGE ("If you reach 5000 pts, I'll add $25")
  - Monthly cap prevents unlimited grandparent spending
  - Match contributions appear in transaction history with attribution ("Grandpa matched your $50 cash-out!")
  - Grandparent can set multiple match rules per child
  - Match calculations happen at settlement time (real-time calculation)
- **API Endpoints:**
  1. `POST /api/grandparent-matches`
     - Body:
       ```json
       {
         "grandparent_id": "...",
         "child_id": "...",
         "match_type": "FIXED_PERCENTAGE",
         "match_value": 1.0,
         "match_jar": "SAVE",
         "max_monthly_contribution": 100
       }
       ```
     - Returns: created `grandparent_matches` record
     - Side effect: Notification to parent & child
  
  2. `GET /api/grandparent-matches/{grandparent_id}`
     - Returns: all active matches with monthly spent tracking

---

## 8. FEATURE 5: Parent-Only Quests & Anti-Ping-Pong

### 8.1 User Flow: Create & Assign Adult Task

```
┌────────────────────────────────────────────────────────────┐
│ PARENT A OPENS "PARENT QUEST POOL"                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ Create a Household Task                                  │
│ (0 points, private, non-monetized)                       │
│                                                            │
│ [+ NEW TASK]                                             │
│                                                            │
│ Form:                                                    │
│ Title: [Schedule annual HVAC servicing]                 │
│ Description: [Call Premier HVAC, book appointment,      │
│              get estimate for annual maintenance]        │
│                                                            │
│ Assignment Mode:                                         │
│ ◉ Add to Household Backlog (Partner pulls)             │
│ ○ Direct assign to Partner B                           │
│                                                            │
│ (If Direct Assign selected:)                            │
│ Due Date: [2026-08-20]                                  │
│ Add to Partner's calendar: ☑                            │
│                                                            │
│ [CANCEL]  [CREATE TASK]                                │
│                                                            │
└────────────────────────────────────────────────────────────┘

Step 1: Parent A chooses "Add to Household Backlog"
        (default, pull-based)
        ↓
Step 2: Task created, status = UNASSIGNED
        Parent A sees task in "Household Backlog" section
        Notification to Partner B: "New household task:
                                     Schedule HVAC service"
        ↓
Step 3: Partner B reviews backlog
        Reads task details
        Decides: "I can do this"
        Taps [PULL THIS TASK]
        ↓
Step 4: Status = ACCEPTED
        Task moves to "My Active Tasks"
        Notification to Parent A: "Partner B pulled: HVAC service"
        ↓
Step 5: Partner B marks complete
        Taps [MARK COMPLETE]
        Status = COMPLETED
        ↓
Step 6: Parent A sees: "Partner B completed HVAC service"
        (Appreciation ping optional: "Thanks for handling that!")
        ↓
        ─────────────────────────────────────────────────
        ALTERNATIVE: DIRECT ASSIGNMENT
        ─────────────────────────────────────────────────
Step 1: Parent A chooses "Direct assign to Partner B"
        Sets due date
        Taps [CREATE TASK]
        ↓
Step 2: Status = PENDING (directly assigned)
        Notification to Partner B: "Task assigned: HVAC service"
        ↓
Step 3: Partner B has options:
        - [ACCEPT] → Status = ACCEPTED
        - [SNOOZE] → "I need 48 hours" → status = SNOOZED
        - [BLOCKER] → "I need the account password first"
        - [TRADE] → "I'll do HVAC if you take grocery run"
        - [LET'S DISCUSS] → Pauses assignment, moved to "Weekly Sync" list
        ↓
Step 4a: (If Partner accepts or snooze expires)
         Normal workflow continues
        ↓
Step 4b: (If Partner taps "Let's Discuss")
         Task moved to "Parking Lot: Pending Discussion"
         Assigned to both parents' "sync meeting" agenda
         No auto-assignment, no bouncing back
         Flag for in-person conversation
         ↓
```

---

### 8.2 UI Mockup: Household Backlog & Actionable Pushback

```
HOUSEHOLD BACKLOG (Pull-based):

┌────────────────────────────────────────────────────────┐
│ UNASSIGNED TASKS (Pull when ready)                    │
├────────────────────────────────────────────────────────┤
│                                                        │
│ ▢ Schedule annual HVAC servicing                      │
│   Due: Aug 20  |  Created by: Parent A                │
│   [PULL THIS TASK]                                    │
│                                                        │
│ ▢ Renew car insurance policy                          │
│   Due: Aug 25  |  Created by: Parent A                │
│   [PULL THIS TASK]                                    │
│                                                        │
│ ▢ File Q3 property tax documents                      │
│   Due: Sep 15  |  Created by: Parent B                │
│   [PULL THIS TASK]                                    │
│                                                        │
└────────────────────────────────────────────────────────┘

WHEN PARTNER TAPS "ACTIONABLE PUSHBACK":

┌────────────────────────────────────────────────────────┐
│ Hmm, I can't take this right now                      │
│                                                        │
│ (Select one)                                          │
│ [ ] Snooze: "I'll do this, but I need 48 hours"     │
│ [ ] Blocker: "I can do this, but you need to..."    │
│ [ ] Trade: "I'll take HVAC if you take grocery"     │
│ [ ] Discuss: "Let's talk about this in person"      │
│                                                        │
│ Details:                                              │
│ [_________________________________]                  │
│                                                        │
│ [CANCEL]  [SEND PUSHBACK]                            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### 8.3 Feature Requirements: Parent-Only Quests

#### **Requirement 8.3.1: Parent-Only Quest Creation**
- **Scope:** Parent creates private, non-monetized adult household tasks
- **Rules:**
  - Title & description required
  - Category = PARENT_ONLY_QUEST (triggers RLS to hide from children/grandparents)
  - Zero points (base_points = 0)
  - Examples: "Schedule HVAC", "Renew auto insurance", "File taxes"
  - No leaderboard impact, no badge progress
  - Completely invisible at database level to non-parent users (RLS)
- **API Endpoint:** `POST /api/chores/parent-quests`
  - Body:
    ```json
    {
      "household_id": "...",
      "creator_id": "parent_uuid",
      "title": "Schedule annual HVAC servicing",
      "description": "Call Premier HVAC...",
      "category": "PARENT_ONLY_QUEST",
      "base_points": 0,
      "assignment_mode": "PULL" | "DIRECT"
    }
    ```
  - Returns: created `chore_definition` with `is_private_parent = true`
  - Note: Child/Grandparent users cannot query this endpoint; they get 403

---

#### **Requirement 8.3.2: Assignment Modes (Pull vs. Direct)**
- **Scope:** Parent chooses how to assign adult tasks
- **Pull-Based (Household Backlog):**
  - Task goes to shared "Unassigned" pool
  - Partner voluntarily pulls tasks when ready
  - Drastically reduces rejection rate (opt-in > push)
  - Default mode
- **Direct Assignment:**
  - Task assigned directly to partner with due date
  - Partner must respond (Accept/Snooze/Blocker/Trade/Discuss)
  - Use sparingly (after verbal agreement)
- **API Requirements:**
  - `POST /api/chores/{quest_id}/pull` — Partner claims from backlog
  - `POST /api/chores/{quest_id}/assign` — Parent directly assigns (with due date)
  - Body includes: `assignment_mode`, `assigned_to`, `due_date`

---

#### **Requirement 8.3.3: Two-Bounce Rule (Anti-Ping-Pong)**
- **Scope:** Prevent infinite back-and-forth reassignments
- **Rules:**
  - If task bounced back twice (Parent A → Parent B → back to A → back to B), system locks assignment
  - After lock, task defaults to "Unassigned Household Pool" for next week's in-person sync
  - Prevents digital nagging loop
  - bounce_count tracked in `parent_quest_assignments.bounce_count`
  - Once locked (`is_locked = true`), assignment feature disabled for that task; partner gets note
- **Implementation:**
  ```typescript
  async function handleTaskBounce(taskId: string, returnedBy: string) {
    const assignment = await getAssignment(taskId);
    
    if (assignment.bounce_count >= 1) {
      // Lock the assignment
      await lockAssignment(taskId);
      // Move to unassigned pool
      await moveToUnassignedPool(taskId);
      // Notify both parents
      notifyParents("Task locked. Please discuss offline.");
    } else {
      // Increment bounce count
      increment(assignment.bounce_count);
    }
  }
  ```

---

#### **Requirement 8.3.4: Actionable Pushback (vs. Flat Rejection)**
- **Scope:** Instead of "Decline", partner articulates why they can't take task
- **Rules:**
  - NO flat "Decline" button
  - Options: Snooze, Blocker, Trade, Let's Discuss
  - Each option contains implicit next step:
    - **Snooze:** Task paused 48h, then re-assigned (automatic)
    - **Blocker:** Task paused; notes show what's needed; awaiting that prerequisite
    - **Trade:** Task paused; awaiting counter-trade agreement
    - **Let's Discuss:** Task moved to "Parking Lot"; flagged for weekly sync meeting; no auto-reassignment
- **API Endpoint:** `POST /api/chores/{quest_id}/pushback`
  - Body:
    ```json
    {
      "user_id": "partner_uuid",
      "pushback_type": "SNOOZE" | "BLOCKER" | "TRADE" | "DISCUSS",
      "details": "Need 48h" | "Need password" | "I'll trade for grocery run" | ""
    }
    ```
  - Returns: updated assignment with `status`, `actionable_pushback`, `snooze_until`
  - Side effect: Notification to assigning parent with pushback details

---

#### **Requirement 8.3.5: Pull Method (Opt-In Preference)**
- **Scope:** Default all adult tasks to shared backlog; partners pull voluntarily
- **Rules:**
  - Eliminates "boss assigning work to employee" feeling
  - Partners check backlog when they have capacity
  - Drastically reduces friction/rejection
  - Direct assignment should only follow verbal agreement
- **Implementation:**
  - When creating task with `assignment_mode = PULL`:
    - Status = UNASSIGNED
    - No assigned_to
    - Visible to both parents in "Household Backlog"
  - Parent can `POST /api/chores/{quest_id}/pull` to claim

---

#### **Requirement 8.3.6: Appreciation Loop (Non-Monetized)**
- **Scope:** Partners send acknowledgment after task completion (no points)
- **Rules:**
  - After task marked COMPLETED, completer's partner can tap appreciation button
  - One-tap options: "Thanks for handling that", "Coffee on me", "You're the best"
  - Optional: Share calendar sync (e.g., "John completed oil change. Next due: 6 months")
  - No points, no currency, purely relational
- **API Endpoint:** `POST /api/chores/{quest_id}/appreciation-ping`
  - Body: `{ "from_parent": "...", "message": "Thanks for handling that" }`
  - Returns: notification log entry
  - Side effect: Notification to other parent

---

## 9. FEATURE 6: Badge Engine & Gamification

### 9.1 Badge Unlock System

#### **Consistency & Habit Badges**

| Badge Name | Criteria | Visual | Bonus | Tier |
|---|---|---|---|---|
| **Streak Titan** | 7, 14, 30, 90 consecutive days 100% Citizen + Routine completion | Bronze/Silver/Gold/Diamond shield | +10% point bonus on achieved day | STANDARD → DIAMOND |
| **The Dawn Patrol** | All morning routines before 7:45 AM for 5 consecutive weekdays | Sunrise profile frame | Unlock "Sunrise" avatar theme | STANDARD |
| **Weekend Warrior** | 3+ Bounty tasks claimed & completed same Saturday–Sunday | Bronze trophy | +100 bonus points | STANDARD |

#### **Financial Literacy Badges**

| Badge Name | Criteria | Visual | Bonus |
|---|---|---|---|
| **Iron Vault** | Maintain Save Jar 2,500+ pts for 60 consecutive days (no cash-out) | Bank vault icon | Parent interest match bumped to +2% monthly |
| **Philanthropist** | Cumulative 1,000 pts directed to Give Jar (verified donation) | Heart & Hands | "Heart of Gold" badge on leaderboard |
| **Master Investor** | Self-defined savings goal $50+ funded 100% from chore earnings (no allowance) | Golden ledger | Permanent golden ledger icon on leaderboard |

#### **Intergenerational Badges**

| Badge Name | Criteria | Visual | Bonus |
|---|---|---|---|
| **Grand Champion** | Complete 10 Grandparent Quests | Special framed badge | Unlock custom duo avatar frame (shared with grandparent) |
| **Sibling Synergy** | All children in household achieve 100% daily completion on same day | Family privilege card | Unlock "Family Pizza Night" or "Movie Picker" privilege |
| **Tech Guru** | Complete 5 digital assistance quests for grandparents | Silicon hero badge | Display "Silicon Hero" profile theme |

#### **Mastery Badges**

| Badge Name | Criteria | Visual | Bonus |
|---|---|---|---|
| **Clean Slate** | Complete high-tier Bounty task with photo proof on first attempt (no redo) | Broom/Sparkle emoji | +50 bonus points; shareable to family feed |

---

### 9.2 Feature Requirements: Badge Engine

#### **Requirement 9.2.1: Automated Badge Unlock Logic**
- **Scope:** System automatically calculates badge progress and unlocks when criteria met
- **Rules:**
  - Each badge has progress tracking (e.g., "Day 5/7" for Streak Titan Bronze)
  - Criteria checked daily via cron or event-triggered
  - Unlock notification sent to child immediately when criteria met
  - Badges display on profile, leaderboard, and family feed
  - Some badges have tiers (Streak Titan: Bronze → Silver → Gold → Diamond)
- **Implementation: Cron Job (Daily 12:00 AM UTC)**
  ```typescript
  async function calculateBadgeProgress() {
    // For each household
    for (const household of households) {
      for (const child of household.children) {
        // Streak Titan
        const streak = await calculateCurrentStreak(child.id);
        await updateBadgeProgress(child.id, 'streak_titan', streak);
        
        if (streak >= 7) await unlockBadge(child.id, 'streak_titan', 'BRONZE');
        if (streak >= 14) await unlockBadge(child.id, 'streak_titan', 'SILVER');
        if (streak >= 30) await unlockBadge(child.id, 'streak_titan', 'GOLD');
        if (streak >= 90) await unlockBadge(child.id, 'streak_titan', 'DIAMOND');
        
        // Iron Vault
        const saveBalance = await getJarBalance(child.id, 'SAVE');
        const daysWithoutCashOut = await countDaysWithoutCashOut(child.id);
        
        if (saveBalance >= 2500 && daysWithoutCashOut >= 60) {
          await unlockBadge(child.id, 'iron_vault');
        }
        
        // Grand Champion
        const grandparentQuestsCompleted = await countCompletedQuests(
          child.id,
          'GRANDPARENT_QUEST'
        );
        
        if (grandparentQuestsCompleted >= 10) {
          await unlockBadge(child.id, 'grand_champion');
        }
        
        // ... more badges
      }
    }
  }
  ```

---

#### **Requirement 9.2.2: Badge Progress Display**
- **Scope:** Show children progress toward next badge unlock
- **Rules:**
  - "5/7 days toward Streak Titan (Bronze)" displayed prominently on dashboard
  - Progress bars show visual completion
  - Display next milestone bonus (e.g., "Earn +10% bonus when you reach 7 days")
- **API Endpoint:** `GET /api/badges/{child_id}/progress`
  - Returns: all badges with `progress`, `progress_target`, `unlocked_at`, `bonus_perk`

---

#### **Requirement 9.2.3: Badge Bonus Perks**
- **Scope:** Awarded badges grant tangible bonuses to gameplay
- **Rules:**
  - Streak Titan: +10% point multiplier on all earned points during active streak
  - Iron Vault: Unlock +2% monthly compound interest on Save Jar (parent match boost)
  - Clean Slate: +50 bonus points one-time; shareable to family feed
  - Sibling Synergy: Unlock family privilege (e.g., "Movie Picker" privilege card valid for 1 week)
  - Bonuses apply automatically when badge unlocked
- **Implementation:**
  ```typescript
  async function applyBadgeBonus(userId: string, badgeKey: string, tier?: string) {
    switch (badgeKey) {
      case 'streak_titan':
        // Apply streak bonus multiplier
        await setStreakMultiplier(userId, 1.10);
        break;
      case 'iron_vault':
        // Boost save jar interest
        await updateSaveJarInterest(userId, { bonus: 0.02 });
        break;
      case 'clean_slate':
        // Award 50 bonus points
        await awardBonus Points(userId, 50, 'Clean Slate Badge Bonus');
        break;
      // ...
    }
  }
  ```

---

## 10. FEATURE 7: Household Settings & Administration

### 10.1 Parent Settings Page

```
┌───────────────────────────────────────────────────────────┐
│ HOUSEHOLD SETTINGS                                        │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ HOUSEHOLD INFO                                          │
│ Name: [Our Family           ]                           │
│ [EDIT]                                                  │
│                                                           │
│ POINTS ECONOMY                                          │
│ Exchange Rate: 100 pts = $[1.00  ]                      │
│                                                           │
│ Auto-Split Percentages:                                 │
│ Spend Jar: [50]%                                        │
│ Save Jar:  [40]%                                        │
│ Give Jar:  [10]%  (sum must = 100%)                     │
│                                                           │
│ ☑ Allow children to adjust split on cash-out           │
│                                                           │
│ APPROVAL & TIMING                                       │
│ Auto-approve unreviewed tasks after: [24] hours        │
│ Minimum chore value: [100] pts                          │
│                                                           │
│ STREAK RULES                                            │
│ Streak Freeze: Allow for sick days, trips              │
│ Streak Shield cost: [100] Save Jar pts / month         │
│                                                           │
│ FAMILY MEMBERS                                          │
│ Parents:                                                │
│ • You (Parent A)                                        │
│ • [Invite Partner]                                      │
│                                                           │
│ Children:                                               │
│ • Alex (age 9)                                          │
│ • Sam (age 12)                                          │
│ [+ ADD CHILD]                                           │
│                                                           │
│ Grandparents:                                           │
│ • Patricia (Grandpa's wife)                            │
│ • John (Grandpa)                                        │
│ [+ INVITE GRANDPARENT]                                 │
│                                                           │
│ [SAVE SETTINGS]                                         │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

### 10.2 Feature Requirements: Household Administration

#### **Requirement 10.2.1: Household Configuration**
- **Scope:** Parent sets household-wide rules and parameters
- **Rules:**
  - Household name, logo/emoji
  - Points-to-fiat ratio (default 100 pts = $1.00)
  - Auto-split percentages (default 50/40/10)
  - Auto-approve timeout (default 24h)
  - Streak freeze enabled/disabled
  - Minimum cash-out amount
- **API Endpoint:** `GET/PUT /api/households/{household_id}/settings`
  - GET returns: all current settings
  - PUT body: changed fields only (partial update)
  - Side effect: Audit log entry; notification to all family members if major changes

---

#### **Requirement 10.2.2: Family Member Management**
- **Scope:** Add/remove children, grandparents, co-parents
- **Rules:**
  - Parent can add co-parent via email invite
  - Parent can add child manually (sets age, emoji avatar)
  - Parent can invite grandparents via email
  - Invited members get email with join link
  - Role assignment at invite time
  - Can revoke access (deactivate user, preserve history)
- **API Endpoints:**
  1. `POST /api/households/{household_id}/invite`
     - Body: `{ "email": "...", "role": "PARENT" | "CHILD" | "GRANDPARENT", "name": "..." }`
     - Returns: invite token
     - Side effect: Email sent with join link
  
  2. `POST /api/households/{household_id}/remove-member`
     - Body: `{ "user_id": "...", "reason": "..." }`
     - Side effect: User deactivated; history preserved

---

## 11. API SPECIFICATION

### 11.1 Authentication & Authorization

All endpoints require:
- **Header:** `Authorization: Bearer {jwt_token}`
- **Header:** `X-Household-ID: {household_uuid}` (for isolation)

Tokens contain claims:
```json
{
  "sub": "user_uuid",
  "household_id": "household_uuid",
  "role": "PARENT" | "CHILD" | "GRANDPARENT",
  "iat": 1234567890,
  "exp": 1234668890
}
```

Row-Level Security (RLS) at database level ensures even if token is compromised, queries are restricted by household & role.

---

### 11.2 Chore Management Endpoints

#### **Create Chore**
```http
POST /api/chores
Content-Type: application/json

{
  "household_id": "uuid",
  "creator_id": "uuid",
  "title": "Unload dishwasher",
  "description": "Empty and put dishes in cabinets",
  "category": "ROUTINE",
  "base_points": 50,
  "requires_photo_proof": false,
  "recurrence_rule": {
    "frequency": "DAILY"
  }
}

Response 201:
{
  "id": "chore-uuid",
  "household_id": "...",
  "title": "...",
  "category": "ROUTINE",
  "base_points": 50,
  "created_at": "2026-08-15T10:00:00Z"
}
```

---

#### **Get Chore Dashboard (Child)**
```http
GET /api/chores/child-dashboard?household_id={id}&child_id={id}

Response 200:
{
  "citizenship_tasks": [
    {
      "id": "chore-uuid",
      "title": "Make bed",
      "category": "CITIZENSHIP",
      "base_points": 0,
      "status": "PENDING",
      "instance_date": "2026-08-15",
      "assigned_to": "child-uuid"
    }
  ],
  "routines": [...],
  "bounties": [...],
  "grandparent_quests": [...],
  "completed_today": [...]
}
```

---

#### **Submit Chore Proof**
```http
POST /api/chores/{instance_id}/submit
Content-Type: application/json

{
  "completed_at": "2026-08-15T14:30:00Z",
  "proof_notes": "All clean!"
}

Response 200:
{
  "id": "instance-uuid",
  "status": "SUBMITTED",
  "submitted_at": "2026-08-15T14:30:00Z"
}

// Separately: Upload proof image
POST /api/media/upload-chore-proof
Content-Type: multipart/form-data

{
  "image": [binary file],
  "instance_id": "instance-uuid"
}

Response 200:
{
  "url": "s3://bucket/...",
  "instance_id": "instance-uuid"
}
```

---

#### **Parent Approve/Reject**
```http
POST /api/chores/{instance_id}/approve
Content-Type: application/json

{
  "reviewed_by": "parent-uuid"
}

Response 200:
{
  "id": "instance-uuid",
  "status": "APPROVED",
  "points_awarded": 50,
  "reviewed_at": "2026-08-15T16:00:00Z"
}

// Reject variant
POST /api/chores/{instance_id}/request-redo
Content-Type: application/json

{
  "rejection_reason": "Missed corner",
  "reason_preset": "MISSED_CORNER"
}

Response 200:
{
  "id": "instance-uuid",
  "status": "REDO_REQUESTED",
  "redo_count": 1,
  "rejection_reason": "Missed corner"
}
```

---

### 11.3 Points & Cash-Out Endpoints

#### **Cash-Out Request**
```http
POST /api/points/cash-out-request
Content-Type: application/json

{
  "user_id": "child-uuid",
  "points_amount": 350,
  "spend_allocation": 175,
  "save_allocation": 140,
  "give_allocation": 35
}

Response 201:
{
  "request_id": "cashout-uuid",
  "status": "PENDING_SETTLEMENT",
  "points_amount": 350,
  "fiat_value": 3.50,
  "allocations": {
    "spend": 1.75,
    "save": 1.40,
    "give": 0.35
  },
  "created_at": "2026-08-15T15:00:00Z"
}
```

---

#### **Settle Cash-Out**
```http
POST /api/points/settle-cash-out/{request_id}
Content-Type: application/json

{
  "parent_id": "parent-uuid",
  "settlement_method": "DEBIT_CARD",
  "settlement_details": {
    "card_id": "greenlight_123",
    "notes": "Transferred to Greenlight"
  }
}

Response 200:
{
  "request_id": "...",
  "status": "COMPLETED",
  "receipt_id": "receipt-uuid",
  "settled_at": "2026-08-15T16:30:00Z"
}
```

---

### 11.4 Grandparent Endpoints

#### **Create Grandparent Quest**
```http
POST /api/chores/grandparent-quests
Content-Type: application/json

{
  "sponsor_user_id": "grandparent-uuid",
  "title": "Tech help with phone",
  "description": "30-min FaceTime to help...",
  "category": "GRANDPARENT_QUEST",
  "base_points": 250,
  "child_ids": ["child-uuid"],  // empty for all children
  "due_date": "2026-08-31",
  "household_id": "household-uuid"
}

Response 201:
{
  "id": "chore-uuid",
  "status": "PENDING_PARENT_APPROVAL",
  "...": "..."
}
```

---

#### **Fund Grandparent Match**
```http
POST /api/grandparent-matches
Content-Type: application/json

{
  "grandparent_id": "grandparent-uuid",
  "child_id": "child-uuid",
  "match_type": "FIXED_PERCENTAGE",
  "match_value": 1.0,
  "match_jar": "SAVE",
  "max_monthly_contribution": 100.00
}

Response 201:
{
  "id": "match-uuid",
  "...": "..."
}
```

---

## 12. ERROR HANDLING & EDGE CASES

### 12.1 Error Codes & Responses

#### **400 Bad Request**
```json
{
  "error": "INVALID_INPUT",
  "message": "Points amount must be >= 100",
  "field": "points_amount"
}
```

#### **403 Forbidden**
```json
{
  "error": "PERMISSION_DENIED",
  "message": "Child cannot approve chores"
}
```

#### **404 Not Found**
```json
{
  "error": "RESOURCE_NOT_FOUND",
  "message": "Chore instance not found",
  "resource_id": "instance-uuid"
}
```

#### **409 Conflict**
```json
{
  "error": "STATE_CONFLICT",
  "message": "Bounty already claimed by another child",
  "current_state": "claimed_at"
}
```

---

### 12.2 Edge Case Handling

#### **Edge Case 1: Child Submits Same Task Twice**
- **Scenario:** Child submits "Unload dishwasher" twice on same day
- **Rule:** UNIQUE constraint on `(chore_id, assigned_to, instance_date)` prevents duplicate instances
- **Response:** 409 Conflict "Task already submitted for today"
- **Resolution:** Parent can only review one instance; second submission rejected before insertion

---

#### **Edge Case 2: Parent Approves & Auto-Approve Triggers Simultaneously**
- **Scenario:** Parent taps APPROVE at 11:59 PM; cron job runs auto-approve at midnight
- **Rule:** Use database transaction with row-level locking
- **Implementation:**
  ```sql
  BEGIN TRANSACTION;
  SELECT * FROM chore_instances WHERE id = $1 FOR UPDATE;  -- Lock row
  IF status = 'SUBMITTED' AND created_at < NOW() - INTERVAL '24 hours' THEN
    UPDATE to AUTO_APPROVED;
  ELSE IF status = 'SUBMITTED' THEN
    UPDATE to APPROVED;
  END IF;
  COMMIT;
  ```

---

#### **Edge Case 3: Three-Jar Split Rounding Errors**
- **Scenario:** 1 pt cash-out: 50% Spend = 0.5, 40% Save = 0.4, 10% Give = 0.1
- **Rule:** Always use floor() for first two; remainder to third
  - Spend: floor(1 × 0.50) = 0
  - Save: floor(1 × 0.40) = 0
  - Give: 1 - 0 - 0 = 1
- **Result:** 1 pt goes to Give (ensures sum = 1 exactly)

---

#### **Edge Case 4: Streak Broken Day Before Badge Unlock**
- **Scenario:** Child on 6-day streak; misses Day 7
- **Rule:** Streak resets to 0 immediately; loses eligibility for that tier (until 7 more days)
- **Badge Status:** Bronze Streak Titan progress → 0/7
- **Recovery:** Child can earn Streak Shield (100 Save pts) to forgive 1 day/month

---

#### **Edge Case 5: Two-Bounce Rule with Edit Requests**
- **Scenario:** Parent A → Parent B (1st bounce); Parent B suggests edit; Parent A provides new version; Parent B bounces again
- **Rule:** Edit requests do NOT count as bounces. Only actual rejections (Decline button) count.
- **Logic:**
  - Bounce 1: Parent B taps "Decline" → bounce_count = 1
  - Parent A resubmits
  - Bounce 2: Parent B taps "Decline" again → bounce_count = 2 → LOCK assignment, move to Unassigned Pool

---

## 13. IMPLEMENTATION ROADMAP

### Phase 1: MVP (Weeks 1-4)
- [ ] Database schema & auth setup
- [ ] Child Dashboard & Task Discovery
- [ ] Parent Review Deck & Approve/Reject
- [ ] Basic Points & Auto-Split (Spend/Save/Give)
- [ ] Streak Calculation
- [ ] Settings Page

### Phase 2: Extended Gameplay (Weeks 5-8)
- [ ] Grandparent Quests (Create → Approve → Execute → Pay)
- [ ] Cash-Out & Settlement (Child Request → Parent Approve → Settlement Method)
- [ ] Badge Engine (Streak Titan, Iron Vault, Grand Champion)
- [ ] Grandparent Matches & Cash Boosting

### Phase 3: Adult Operations (Weeks 9-12)
- [ ] Parent-Only Quests (Zero-point, private)
- [ ] Household Backlog (Pull-based assignment)
- [ ] Actionable Pushback (Snooze, Blocker, Trade, Discuss)
- [ ] Two-Bounce Rule & Anti-Ping-Pong
- [ ] Appreciation Loop

### Phase 4: Polish & Analytics (Weeks 13-16)
- [ ] Notifications (push, in-app, email digest)
- [ ] Leaderboards & Family Feed
- [ ] Exported reports (household earnings, badge stats, settlement history)
- [ ] Performance optimization & stress testing
- [ ] Mobile responsiveness & offline support

---

## Appendix: Glossary of Terms

| Term | Definition |
|------|-----------|
| **Citizenship Chore** | Non-negotiable baseline task (0 pts); unlocks daily bonus multiplier |
| **Routine** | Recurring chore with standard points (base points) |
| **Bounty** | High-effort, competitive, first-come task; premium point yield |
| **Grandparent Quest** | Intergenerational task funded & approved by grandparent |
| **Parent-Only Quest** | Private adult household task; 0 pts, invisible to children/GP |
| **Jar** | One of three point buckets (Spend, Save, Give); auto-filled on earn/cash-out |
| **Streak** | Consecutive days with 100% Citizenship + Routine completion |
| **Badge** | Achievement unlock; grants bragging rights & tangible bonuses |
| **Match** | Grandparent contribution rule (e.g., 100% match on Save Jar) |
| **Two-Bounce Rule** | After task bounced back twice, assignment locks; moves to Unassigned Pool |
| **Actionable Pushback** | Constructive response to task (Snooze, Blocker, Trade, Discuss) |
| **RLS** | Row-Level Security; database-enforced privacy (Parent-Only Quests) |
| **Auto-Approve** | Unreviewed task auto-approved after 24h to prevent bottlenecks |

---

**Document ends. Ready for development.**
