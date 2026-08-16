# FamilyCube — Quest E2E Event Trace

> Each quest type is traced from origination through every possible state.  
> For each state: who triggered it, what each role sees on each screen, what buttons are available.  
> Use this to verify code and catch gaps before they reach production.

---

## Legend

| Symbol | Role |
|--------|------|
| 😤 P | Parent |
| 💡 T | Teen |
| ⭐ K | Kid |
| 😎 G | Grandparent (Senior) |

Screens:
- **Hub** = Home Dashboard (ParentView / KidView / TeenView / GPView)
- **QS** = QuestsScreen (tabs: All / Pool / Review / Done / My Quests / Submitted)
- **Sched** = ScheduleScreen

Button colors:  🟣 Purple · 🟡 Amber · 🟢 Teal · 🔴 Red · ⬜ Ghost

---

## 1. CITIZENSHIP Quest (Recurring household duty)

**Created by:** 😤 Parent  
**Assigned to:** specific Kid or Teen (direct assign) — never pool  
**Recurrence:** daily or weekly  
**Coins:** yes  
**Fields:** title, description, assignee, coins, difficulty, due time, photo required, recurrence days  

---

### State: `todo`

**Event:** Parent creates quest (QuestsScreen Add Modal → submit)

| Role | Hub | QuestsScreen | ScheduleScreen | Buttons |
|------|-----|-------------|----------------|---------|
| 😤 P | Household Backlog → "Assigned to others" row if assigned to co-parent; not shown if assigned to kid | All tab: card visible · assignee chip shown | Date card if due date set | `Edit` (long-press) · `Delete` (long-press) · `Delegate` |
| 💡 T / ⭐ K (assignee) | **My Quests** section: card with title + coins badge + due chip | My Quests tab: card · Citizenship category chip | Own task on due date | `Start` / `I'll do it` → moves to `in_progress` |
| 💡 T / ⭐ K (not assignee) | Not shown | Not shown | Not shown | — |
| 😎 G | Not shown | Not shown | Family events only | — |

**Gaps to check:**
- [ ] Recurring instances: does a new `todo` generate on reset after `approved`?
- [ ] `todo` card must show coins + category chip on kid/teen hub

---

### State: `in_progress`

**Event:** Kid/Teen taps "Start" (or auto-transitions on claim)

| Role | Hub | QuestsScreen | ScheduleScreen | Buttons |
|------|-----|-------------|----------------|---------|
| 😤 P | Action Needed: "In Progress" awareness row (optional) | All tab: card with `IN PROGRESS` chip | — | `Edit` (if todo, now locked) · `Reassign` |
| 💡 T / ⭐ K (assignee) | My Quests: `IN PROGRESS` badge | My Quests tab: card with orange chip | — | `Submit Proof` (opens note + photo sheet) |
| 😎 G | Not shown | Not shown | — | — |

**Gaps to check:**
- [ ] Parent's "Action Needed" should not show in_progress citizenship tasks (no action needed yet)
- [ ] Submit sheet: photo gated to `photoRequired === true`

---

### State: `pending_approval`

**Event:** Kid/Teen submits proof (note + optional photo)

| Role | Hub | QuestsScreen | ScheduleScreen | Buttons |
|------|-----|-------------|----------------|---------|
| 😤 P | **Action Needed** → "Needs Review" card with kid photo/note preview | **Review tab**: card highlighted · submission note + photo | Date flagged with ⏳ | 🟢 `Approve` · 🔴 `Decline` · `View Photo` |
| 💡 T / ⭐ K (assignee) | My Quests: `SUBMITTED` chip · coins badge locked 🔒 | Submitted tab: card · "Pending parent review" label | — | No action (waiting) |
| 😎 G | Not shown | Not shown | — | 🟢 `Approve` if `inviteGrandparents = true` (not typical for citizenship) |

**Gaps to check:**
- [ ] Review tab badge count must increment
- [ ] Coins badge on kid card must show lock icon, not clickable

---

### State: `approved`

**Event:** Parent taps Approve

| Role | Hub | QuestsScreen | ScheduleScreen | Buttons |
|------|-----|-------------|----------------|---------|
| 😤 P | Household Snapshot: "Reviewed today" +1 | Done tab: card with ✓ + approval date | — | `Archive` (optional) |
| 💡 T / ⭐ K (assignee) | Completed section: coins awarded animation | Done tab: card with 🪙 coins earned | — | `Share` (optional) |
| 😎 G | Not shown | Not shown | — | — |

**Gaps to check:**
- [ ] Coin animation on kid hub after approval
- [ ] Streak counter increments on parent snapshot

---

### State: `declined` (redo_requested)

**Event:** Parent taps Decline → picks reason

| Role | Hub | QuestsScreen | ScheduleScreen | Buttons |
|------|-----|-------------|----------------|---------|
| 😤 P | Action Needed clears this card | All tab: card with `REDO` chip | — | — |
| 💡 T / ⭐ K (assignee) | My Quests: `REDO NEEDED` chip · decline reason shown | My Quests tab: card with red chip | — | `Resubmit` → goes back to `in_progress` |
| 😎 G | Not shown | Not shown | — | — |

---

## 2. ROUTINE Quest (Scheduled repeating)

Identical flow to Citizenship except:
- Category chip shows `ROUTINE` (blue)
- Recurrence days can be specific days of week
- No pool mode ever

All state transitions and role visibility are the same as Citizenship.  
**Skip re-tracing — use Citizenship trace above.** Only difference is the chip color and category label.

---

## 3. BOUNTY Quest (Pool — first-come, open claim)

**Created by:** 😤 Parent  
**Assigned to:** nobody (isPool = true) OR specific person  
**Recurrence:** once  
**Coins:** yes  
**Fields:** title, description, coins, difficulty, due date, photo required  

---

### State: `todo` + `isPool = true`

**Event:** Parent creates Bounty quest, leaves assignee empty

| Role | Hub | QuestsScreen | ScheduleScreen | Buttons |
|------|-----|-------------|----------------|---------|
| 😤 P | Household Backlog → Pool section: `OPEN BOUNTY` card | All tab + Pool tab: card with `POOL` badge | Due date if set | 🟡 `Assign` · `Edit` (long-press) · `Delete` |
| 💡 T | My Quests: Bounty section with `CLAIM` button | Pool tab: `CLAIM` button | — | 🟢 `Claim` → assigns to teen, status → `in_progress` |
| ⭐ K | Bounty section on hub | Pool tab: `CLAIM` button | — | 🟢 `Claim` → assigns to kid |
| 😎 G | Not shown | Not shown | — | — |

**Gaps to check:**
- [ ] After claim: `isPool` must be set to `false` on ChoreTask, `assignedToId` = claimant
- [ ] Kid filter dropdown in parent QS: pool quests must appear even with a specific kid filter active

---

### State: `in_progress` (after claim)

Identical to Citizenship `in_progress` for the claimant.  
Parent additionally sees: All tab card shows assignee chip (was pool, now claimed).

---

### State: `pending_approval` → `approved` / `declined`

Same as Citizenship.

---

### Alternate path: Parent self-claims (`isPool → assignedToId = parent`)

**Event:** Parent taps "I'll do this" on pool card

| Role | Hub | QuestsScreen | Buttons |
|------|-----|-------------|---------|
| 😤 P (self) | Moves from Pool → "Assigned to me" section | My Quests (if adult) or All | `Mark Done` → skips kid approval flow → directly `approved` |
| Others | No longer visible as pool | Pool tab: removed | — |

**Gaps to check:**
- [ ] Parent self-complete bypasses `pending_approval` — must go directly to `approved`
- [ ] `isPool` cleared on self-claim

---

## 4. SHOPPING Quest (Grocery Run)

**Created by:** 😤 Parent  
**Assigned to:** specific parent/teen OR pool (isPool = true for family pick-up)  
**Recurrence:** once  
**Coins:** yes (if assigned to kid/teen) · zeroed if adult-only  
**Extra fields:** shoppingItems[], shoppingStore, shoppingBudget, photoRequired (forced true)  

---

### State: `todo` — assigned to partner (co-parent)

**Event:** Parent A creates shopping quest, assigns to Parent B

| Role | Hub | QuestsScreen | ScheduleScreen | Buttons |
|------|-----|-------------|----------------|---------|
| 😤 P-A (creator) | Household Backlog → **Assigned to others** section: card with 🛍️ + item count + store + amber border | All tab: card with `SHOPPING` chip + item list block | Due date | 🟡 `Nudge` → chat message to P-B · 🟣 `Reclaim` → reassign to self |
| 😤 P-B (assignee) | **Assigned to me** section: card with shopping items expanded | All tab: card | — | 🟢 `Mark Done` → `pending_approval` OR directly `approved` |
| 💡 T / ⭐ K | Not shown (isAdultTask implied if both assignees are parents) | Not shown | — | — |
| 😎 G | Not shown | Not shown | — | — |

**Gaps to check:**
- [ ] Shopping items block MUST show in "Assigned to others" expanded view (ParentView line ~1030–1100)
- [ ] `Nudge` sends chat message via `useChatStore.getState().sendMessage`
- [ ] `Reclaim` calls `updateQuest(id, { assignedToId: active.id })`
- [ ] Item count badge `2 items · Costco` shown in collapsed header

---

### State: `todo` — assigned to Teen

| Role | Hub | QuestsScreen | Buttons |
|------|-----|-------------|---------|
| 😤 P | Household Backlog → not in "assigned to others" (teen is not adult) — visible in chore review | All tab: `SHOPPING` chip | `Edit` · `Reassign` |
| 💡 T | My Quests: shopping card with item list teal block | My Quests tab | `Start` → `in_progress` |
| ⭐ K | Not shown | Not shown | — |

---

### State: `todo` — isPool = true (anyone can pick up)

Identical to BOUNTY pool flow. Shopping items shown in pool card expanded view.

---

### State: `in_progress` (teen/parent doing the run)

| Role | Hub | Buttons |
|------|-----|---------|
| 😤 P | Action Needed (if teen doing it): awareness | `Reassign` if needed |
| 💡 T (assignee) | My Quests: IN PROGRESS · item list with checkboxes | `Submit Proof` (photo of receipt forced) |

---

### State: `pending_approval`

| Role | Hub | QuestsScreen | Buttons |
|------|-----|-------------|---------|
| 😤 P | Action Needed → Review card · receipt photo · items summary | Review tab | `Approve` · `Decline` |
| 💡 T | My Quests: SUBMITTED · coins locked | Submitted tab | No action |

---

### State: `approved`

Parent who assigned it + teen see completion. Coins released to teen.  
`grocery_runs` + `grocery_run_items` records created (if integrated).

---

## 5. GRANDPARENT QUEST

**Created by:** 😤 Parent (with `inviteGrandparents = true`)  
**Assigned to:** initially unassigned (GP claims)  
**Recurrence:** once  
**Coins:** **zeroed** (GPs don't earn coins)  
**questType:** `grandparent_quest`  

---

### State: `todo` (unassigned — waiting for GP to claim)

| Role | Hub | QuestsScreen | Buttons |
|------|-----|-------------|---------|
| 😤 P | Household Backlog → Pool section with `GP` tag | All tab: card with `GP QUEST` badge | `Edit` · `Reassign` |
| 😎 G | **GP Hub**: Sponsored Quests panel — `OPEN` badge | GP tab or Cheer tab: `Claim` button | 🟢 `Claim` → assignedToId = GP, status → `in_progress` |
| 💡 T / ⭐ K | Not shown | Not shown | — |

**Gaps to check:**
- [ ] Coins badge MUST NOT show on GP quest cards (coinsDisabled check)
- [ ] GP claim sets `assignedToId = gp.id`, `isPool = false`

---

### State: `in_progress` (GP claimed)

| Role | Hub | QuestsScreen | Buttons |
|------|-----|-------------|---------|
| 😤 P | Awareness: assigned to GP | All tab: assignee = GP name | `Reassign` |
| 😎 G | My Quests section on GP Hub | My tab: `CLAIMED` chip | 🟢 `Submit` → `pending_approval` |
| ⭐ K (beneficiary) | Not shown | Not shown | — |

---

### State: `pending_approval`

| Role | Hub | QuestsScreen | Buttons |
|------|-----|-------------|---------|
| 😤 P | Action Needed → Review card | Review tab | `Approve` · `Decline` |
| 😎 G | My Quests: `SUBMITTED` chip | Submitted: waiting label | No action (or `Cheer` on others') |
| ⭐ K | Not shown | Not shown | — |

---

### State: `approved`

- Receipt reimbursement flow triggered (if integrated)
- Kids' progress summary on GP Hub: shows quest completed

**Gaps to check:**
- [ ] GP Hub: "Kids' progress summary" shows GP quest as done after approval
- [ ] No coin award to GP (coins = 0 always)

---

## 6. ADULT / PARENT-ONLY Task

**Created by:** 😤 Parent (isAdultTask = true)  
**Assigned to:** parent(s) only  
**Coins:** **zeroed** always  
**Visibility:** hidden from all kids, teens, GPs  
**questType:** `parent_only`  

---

### State: `todo` — self-assigned

| Role | Hub | QuestsScreen | Buttons |
|------|-----|-------------|---------|
| 😤 P (self) | Household Backlog → **Assigned to me** section: grey `ADULT` badge | All tab: grey badge · no coins shown | 🟣 `Mark Done` → `approved` (no kid approval needed) |
| 💡 T / ⭐ K / 😎 G | **Not visible anywhere** | Not shown | — |

**Gaps to check:**
- [ ] Adult task must be invisible on QS when kid/teen filter active
- [ ] `isAdultTask = true` cards: coins badge hidden, no `Submit Proof` button

---

### State: `todo` — assigned to co-parent

| Role | Hub | QuestsScreen | Buttons |
|------|-----|-------------|---------|
| 😤 P-A (creator) | Household Backlog → **Assigned to others**: readonly card with amber border | All tab: card | 🟡 `Nudge` · 🟣 `Reclaim` |
| 😤 P-B (assignee) | Household Backlog → **Assigned to me**: card | All tab: card | 🟢 `Mark Done` |
| Others | Not visible | Not visible | — |

---

### State: `approved` (parent marks done)

| Role | Hub | QuestsScreen |
|------|-----|-------------|
| 😤 P | Household Snapshot: Reviewed today +1 (if creator approved) | Done tab: card with ✓ |
| Others | Not visible | Not visible |

---

## 7. Cross-Screen State Matrix (Quick Reference)

| Quest State | P Hub section | K/T Hub section | P QS tab | K/T QS tab | G QS tab |
|-------------|--------------|-----------------|----------|------------|----------|
| `todo` pool | Household Backlog › Pool | Bounty / Pool section | All + Pool | Pool | — |
| `todo` assigned to me | Backlog › Assigned to me | My Quests | All | My Quests | — |
| `todo` assigned to other-parent | Backlog › Assigned to others | — | All | — | — |
| `todo` gp quest | Backlog › Pool (GP tag) | — | All | — | GP Quests |
| `in_progress` | Action Needed (awareness) | My Quests (IN PROGRESS) | All | My Quests | — |
| `pending_approval` | **Action Needed › Needs Review** | My Quests (SUBMITTED 🔒) | **Review** | Submitted | Cheer |
| `approved` | Snapshot: Reviewed+1 | Completed (+🪙) | Done | Done | Cheer |
| `declined` | — | My Quests (REDO ❗) | All | My Quests | — |

---

## 8. Button Availability Matrix

| Button | Shown when | Who sees it | Action |
|--------|-----------|-------------|--------|
| `Claim` | `isPool && status=todo` | K / T / GP (GP quests only) | `claimQuest(id, me)` |
| `I'll do this` | `isPool && isParent && status=todo` | P | `claimQuest(id, me)` |
| `Start` | `assignedToId=me && status=todo` | K / T | status → `in_progress` |
| `Submit Proof` | `assignedToId=me && status=in_progress` | K / T / GP | Opens note+photo sheet |
| `Mark Done` | `isParent && (isAdultTask OR selfAssigned)` | P | status → `approved` directly |
| `Approve` | `status=pending_approval && (isParent OR isSenior)` | P / G | `approveQuest(id, me)` |
| `Decline` | `status=pending_approval && isParent` | P | Opens DeclineModal |
| `Resubmit` | `status=declined && assignedToId=me` | K / T | status → `in_progress` |
| `Edit` (long-press) | `isParent && (status=todo OR isPool)` | P | Opens EditModal |
| `Delete` (long-press) | `isParent` | P | Alert → `deleteQuest(id)` |
| `Reassign` / `Delegate` | `isParent` | P | Opens DelegateSheet |
| `Nudge` | `isParent && assigned to other parent` | P | `chatStore.sendMessage` → alert |
| `Reclaim` | `isParent && assigned to other parent` | P | `updateQuest(id, { assignedToId: me })` |
| `Reopen` | `isParent && status=declined` | P | `reopenQuest(id, me)` |
| `Cheer` | `isSenior && status=pending_approval` | G | Reaction only (no state change) |
| `High Five` | `isSenior && status=approved` | G | Reaction only |

---

## 9. Origination Paths

| Who | Where | How | Result |
|-----|-------|-----|--------|
| Parent | QuestsScreen → + button | Add Modal | Quest in `todo` |
| Parent | Home Hub → Quick Action "Quest" | Add Modal shortcut | Quest in `todo` |
| Parent | Home Hub → Quick Action "Grocery" | Shopping-specific modal | Shopping quest in `todo` |
| Parent (with GP invite) | QuestsScreen → toggle GP Invite | Add Modal | `grandparent_quest` in `todo` (coins zeroed) |
| Parent | Pool card → Assign dropdown | DelegateSheet | Assigns pool quest to specific member |
| Kid/Teen | Pool tab → Claim | Tap | Self-assigns bounty, status → `in_progress` |
| Grandparent | GP Hub → Open Quests | Claim tap | Self-assigns GP quest, status → `in_progress` |

---

## 10. Gaps Still Unverified (as of 2026-08-15)

| # | Check | File | Status |
|---|-------|------|--------|
| G1 | Recurring citizenship/routine: new `todo` auto-generated after `approved` | choreStore.ts | ❓ unverified |
| G2 | Parent self-complete (adult task/self-assigned): bypasses `pending_approval` entirely | ParentView.tsx | ❓ unverified |
| G3 | Shopping quest "Assigned to others": items block + Nudge + Reclaim visible | ParentView.tsx ~L1030 | ✅ Fixed this session |
| G4 | GP Hub: "Kids' progress summary" shows GP quest done after approval | GPView.tsx | ❓ unverified |
| G5 | GP quest: coins badge suppressed on all card renders | QuestsScreen, ChildChoreBoard | ❓ unverified |
| G6 | `isPool` cleared after kid/teen claims bounty | choreAdapter claimQuest | ❓ — `claimQuest` sets `in_progress + assignedToId` but does NOT clear `isPool` |
| G7 | QS Pool tab: disappears after claim (isPool=false) | QuestsScreen filter | ❓ depends on G6 |
| G8 | Backlog count badge: updates reactively after claim/reclaim | ParentView.tsx header | ❓ depends on store reactivity |
| G9 | ScheduleScreen: overdue tasks highlighted red for kids | ScheduleScreen.tsx | ❓ unverified |
| G10 | DeclineModal: reason presets populated correctly | QuestsScreen DeclineModal | ❓ unverified |
