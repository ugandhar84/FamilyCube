# FamilyCube — Quest Flows & UI Component Spec

> Last updated: 2026-08-15  
> Validated against: `QuestsScreen.tsx`, `ParentView.tsx`, `choreAdapter.ts`, `choreStore.ts`, `ChildChoreBoard.tsx`

---

## 1. Role Legend

| Symbol | Role | Key colour |
|--------|------|-----------|
| 😤 | Parent | Purple `#7C3AED` |
| 💡 | Teen | Amber `#F59E0B` |
| ⭐ | Kid | Teal `#0D9488` |
| 😎 | GP (Senior) | Blue `#3B82F6` |

---

## 2. Quest Status Flow

```
  [todo] ──→ [claimed/in_progress] ──→ [pending_approval] ──→ [approved]
  Parent       Kid / Teen claims        Kid / Teen submits     Parent / GP approves
  creates                                                      → coins released
                         ↑
              [redo_requested] ←── Parent asks again → kid resubmits
              [declined]       ←── Parent declines · Kid can't re-appeal
```

### Status → UI mapping (`choreStatusToQuestStatus` in `choreAdapter.ts`)

| ChoreTask status | Quest status shown |
|------------------|--------------------|
| `todo` | `todo` |
| `in_progress` | `in_progress` |
| `pending_approval` | `pending_approval` |
| `pending_grandparent_approval` | `pending_approval` |
| `pending_parent_approval` | `todo` |
| `approved` / `auto_approved` | `approved` |
| `redo_requested` | `declined` |

---

## 3. Home Dashboard — Per-Role

### 😤 Parent (`ParentView.tsx`)

| Section | What's shown | Source |
|---------|-------------|--------|
| TodayView header | Animated timeline of today's events | `eventStore` |
| Alert Banner | Conflict/driver/pending escalations | `eventStore` |
| Quick Action tiles | Scan Flyer · + Quest · Event · Grocery | Navigation |
| Household Snapshot | Reviewed today · Avg streak · Cash-outs | `choreStore` |
| Family Leaderboard | Kids ranked by streak + points | `familyStore` |
| **Action Needed** | Ride approvals · Quest reviews · Kid requests | `choreAdapter` + `kidRequestStore` |
| **Household Backlog** | Pool tasks (PULL) · Assigned to me · Others' | `choreStore.getParentQuestPool()` + `choreAdapter` |
| Chore Review Deck | `pending_approval` chores for review | `choreStore.getParentReviewDeck()` |

**Key RBAC rules:**
- Adult tasks are visible to parents only (hidden from kids/teens)
- `awaitingApproval` = quests from `choreAdapter` with `status === 'pending_approval'`
- Backlog task count = `questPool.length + myAdultQuests.length + othersAdultQuests.length`
- **"Take It"** → `updateQuest(id, { assignedToId: me, status: 'claimed' })` for quest-row items, `handlePullTask` for chore-pool items
- **"Delegate"** → opens delegate sheet for cross-parent assignment

### 💡 Teen

| Section | Source component |
|---------|-----------------|
| todo / claimed — TeenView chore board | `TeenView` |
| pending_approval — "Submitted" chip | Quest card status |
| Errand bounties (pool) | `isPool = true` quests |
| Junior dispatch (`hasCar`) | Transport events with teen helper |
| Grocery runs section | Shopping category quests |

### ⭐ Kid

| Section | Source component |
|---------|-----------------|
| todo — ChildChoreBoard | `ChildChoreBoard.tsx` |
| claimed — "In progress" chip | Quest card |
| pending_approval — "Submitted" chip | Quest card |
| approved / done — Completed section | Quest card |

### 😎 GP (Senior)

| Section | Source component |
|---------|-----------------|
| Sponsored quests panel | GP-specific view |
| todo — Grandparent quests | `questType === 'grandparent_quest'` |
| Kids' progress summary | Read-only |
| No direct action (except claim/submit on GP quests) | Per spec |

---

## 4. Quests Screen — Tab × Role

### 😤 Parent (full access)

| Tab | Filter logic | Actions available |
|-----|-------------|------------------|
| **All** | `!q.isAdultTask` (every non-adult family quest) | Create · Edit · Delete · Approve · Decline · Reopen |
| **Review** | `status === 'pending_approval'` | Approve · Decline |
| **Pool** | `isPool && status === 'todo'` (open bounties) | Assign · Edit |
| **Done** | `status === 'approved' \| 'done'` | View history |

- Kid filter dropdown narrows All tab: shows `assignedToId === kidFilter` **plus** unassigned pool quests (`isPool && !assignedToId`)
- Adult tasks rendered with grey badge — hidden from kid/teen filter views
- Long-press on any `todo` card or pool card → opens **Edit Modal**
- Edit modal: assignee list filtered to parents-only when `isAdultTask`; coins/bonus hidden when `isAdultTask`

### 💡 Teen / ⭐ Kid

| Tab | Filter |
|-----|--------|
| My Quests | `assignedToId === me` |
| Pool / Bounty | `isPool && status === 'todo'` (open to claim) |
| Submitted | `status === 'pending_approval'` — 🔒 coins locked |
| Done | `status === 'approved'` — coins shown (+🪙) |

- Can claim open pool quests via **"Claim"** button
- Can submit their own quests (photo proof gated to `assignedToId === me`)
- Teen: **cannot** decline; Kid: can decline own quests only

### 😎 GP (Senior)

| Tab | Filter |
|-----|--------|
| Cheer tab | Kids' `pending` and `completed` quests |

- 🎉 Cheer on submitted quests
- 👋 High Five on done quests
- Can approve (parent-or-senior RBAC)
- Claim button shown: `isSenior && questType === 'grandparent_quest' && status === 'todo' && !assignedToId`
- Submit button shown: `isSenior && questType === 'grandparent_quest' && status === 'todo' && assignedToId === me`

---

## 5. Quest Card — Action Strip

All buttons in the action strip of a quest card are conditional on role + status:

| Button | Condition | Action |
|--------|-----------|--------|
| **Claim** | `isPool && isKidOrTeen && status=todo` | `claimQuest(id, me)` |
| **Submit Proof** | `assignedToId === me && status !== pending/approved` | Opens photo+note sheet |
| **Approve** | `isParent \| isSenior && status=pending_approval` | `approveQuest(id, me)` |
| **Decline** | `isParent && status=pending_approval` | Opens DeclineModal with presets |
| **Reopen** | `isParent && status=declined` | `reopenQuest(id, me)` |
| **I'll do this** | `isPool && isParent` | `claimQuest(id, me)` (self-claim) |
| **GP Claim** | `isSenior && questType=grandparent_quest && !assignedToId` | `claimQuest(id, me)` |
| **GP Submit** | `isSenior && questType=grandparent_quest && assignedToId=me` | Submit flow |
| **Edit** (long-press) | `isParent && (status=todo \| isPool)` | Opens EditModal |

---

## 6. Quest Types & Category Resolution

### `resolvedQuestType` (set on submit in `QuestsScreen.tsx`)

```
isAdultTask           → 'parent_only'
isRoutine + type      → routineType ('citizenship' | 'routine' | 'bounty' | 'shopping')
else                  → defaultQuestType ?? 'general'
inviteGrandparent     → 'grandparent_quest'  (via inviteGrandparents flag)
```

### `ChoreCategoryType` → `QuestType` mapping

| ChoreCategoryType | QuestType |
|-------------------|-----------|
| `citizenship` | `citizenship` |
| `routine` | `routine` |
| `bounty` | `bounty` |
| `shopping` | `shopping` |
| `grandparent_quest` | `grandparent_quest` |
| `parent_only_quest` | `parent_only` |
| _(fallback)_ | `general` |

---

## 7. Quest Type Selector — 2×2 Grid (Add Quest Modal)

| Tile | Icon | Colour | Default freq | Behaviour |
|------|------|--------|-------------|-----------|
| Citizenship | 🏅 | Purple | daily | Recurring household duty |
| Routine | 🔄 | Blue | daily | Scheduled repeating task |
| Bounty | 💰 | Amber | once | Pool quest (first-come) |
| **Shopping** | 🛍️ | Teal `#0D9488` | once | Shows item list + store + budget fields |

---

## 8. Coins / Bonus Discipline

```
coinsDisabled = isAdultTask || inviteGrandparent || assignedToAdultsOnly
```

- `toggleAdultTask(true)` → zeroes coins + bonus, clears kid assignees, disables pool
- `toggleGPInvite(true)` → zeroes coins + bonus
- `assignedToAdultsOnly` = all selected assignees have role `parent` or `senior`
- GP cards never show coin badge: `!isAdult && !isGPQuest && !q.isAdultTask`

---

## 9. Shopping Quest — Additional Fields

When `routineType === 'shopping'`:

| Field | Storage | Shown on card |
|-------|---------|--------------|
| Item list (`shoppingLines`) | `ChoreTask.shoppingItems: string[]` | ✅ Teal block with checkboxes |
| Grocery list items (selected from DB) | merged into `shoppingItems` | ✅ Same block |
| Store name | `ChoreTask.shoppingStore` | ✅ "Shop at X" header |
| Budget | `ChoreTask.shoppingBudget` | ✅ "Budget $X" badge |
| Photo proof | forced `photoRequired = true` | ✅ Camera badge |

Grocery list integration:
- Parent attaches existing grocery list items (from `grocery_items` table) by store group
- Each store group is collapsible (per-store expand state, header always visible)
- On submit: selected items + new lines are merged into `allItemNames` → stored on ChoreTask
- Grocery run rows written to `grocery_runs` + `grocery_run_items` tables (per store)

---

## 10. Grandparent Invite Flow

```
Parent creates quest → toggles "GP Invite" → inviteGrandparents = true
  → questType = 'grandparent_quest'
  → coins auto-zeroed (GPs don't earn coins)
  → GP Invite toggle visible even when isAdultTask = true
GP sees quest → "Claim" button (assigns to GP)
GP completes → "Submit" button → pending_approval
Parent / senior approves → receipt reimbursement flow
```

---

## 11. Adult Task Flow

```
Parent creates quest → toggles "Adult Task"
  → isAdultTask = true
  → questType = 'parent_only'
  → coins zeroed, bonus zeroed
  → pool disabled
  → assignee list filtered to parents only
  → hidden from all kid/teen views
  → appears in Household Backlog (parent hub)
```

---

## 12. isPool Derivation

**Source of truth:** `ChoreTask.isPool` (bool field, added 2026-08-15).

**Write path:**  
`QuestsScreen.submit` → `addQuest({ isPool: !isAdultTask && (formIsPool || assignIds.length === 0) })`  
→ `questInputToChoreInput` passes `isPool` → stored on `ChoreTask`

**Read path:**  
`choreToQuest` → `isPool: c.isPool ?? (!c.assignedToId && c.categoryType === 'bounty')`  
(fallback keeps bounty-category inference for legacy records)

---

## 13. Schedule Screen — Per Role

| Role | What's shown |
|------|-------------|
| 😤 Parent | Full family calendar · All quests with due dates · `pending_approval` flagged on date · Recurring quest instances |
| 💡 Teen | Full family events (same as parent) · Own quests with due dates · Errand pickup schedules |
| ⭐ Kid | Own quests with due dates · `todo` — upcoming deadlines · `overdue` — ⚠ highlighted red · No adult events visible |
| 😎 GP | Full family calendar · Kids' quest deadlines · GP-sponsored quest dates · Family events (social) |

---

## 14. Known Gaps & Fixes

| # | Gap | Fix applied |
|---|-----|------------|
| 1 | `ParentView` imported from old `questStore` — quests created via QuestsScreen not visible in hub | ✅ Fixed: changed import to `choreAdapter` |
| 2 | `choreToQuest` only set `isPool=true` for `bounty` category — shopping/routine quests lost pool state | ✅ Fixed: added `isPool` field to `ChoreTask`; adapter passes and reads it |
| 3 | `crypto.randomUUID` crash on Hermes | ✅ Fixed: `genId()` helper with typeof guard |
| 4 | Duplicate quest creation (two records per submit) | ✅ Fixed: removed duplicate `addChore` blocks; single `addQuest` call |
| 5 | Coins showing on adult/GP cards | ✅ Fixed: `coinsDisabled` flag; auto-zero on toggle |
| 6 | Long-press edit not opening for non-pool quests | ✅ Fixed: `canEdit = isParent && (status=todo \| isPool)` |
| 7 | Edit modal showing kids for adult task | ✅ Fixed: assignee list filtered to parents when `isAdultTask` |
| 8 | GP Invite hidden when Adult Task on | ✅ Fixed: removed `!isAdultTask &&` guard |
| 9 | `shopping` missing from `CAT_META` in `ChildChoreBoard` | ✅ Fixed: added entry |
| 10 | Specific-kid filter hiding pool quests | ✅ Fixed: filter now includes `isPool && !assignedToId` |
| 11 | Shopping items not appearing on quest card | ✅ Fixed: all item sources unified into `allItemNames`, passed unconditionally |

---

## 15. File Map

| File | Responsibility |
|------|---------------|
| `features/quests/QuestsScreen.tsx` | Main quest UI — add modal, card list, filters, action strip |
| `store/choreAdapter.ts` | Drop-in `useQuestStore` shim backed by choreStore |
| `store/choreStore.ts` | ChoreTask CRUD + AsyncStorage persistence |
| `features/hub/ParentView.tsx` | Home hub parent view — backlog, action needed, stats |
| `features/hub/KidView.tsx` | Kid hub — ChildChoreBoard integration |
| `features/hub/TodayView.tsx` | Animated today header used in all hub views |
| `features/chores/ChildChoreBoard.tsx` | Kid/teen chore board with CAT_META |
| `features/chores/ParentReviewDeck.tsx` | Parent review cards for pending_approval |
| `store/groceryStore.ts` | Grocery items + past stores/names cache |
| `lib/groceryDefaults.ts` | DEFAULT_GROCERY_ITEMS, DEFAULT_GROCERY_STORES |
