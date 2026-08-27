# Master Flow — Full Cross-Role UI Trace, TC-30 through TC-50

Scope note: this document is a pure source-code UI trace layered on top of the
already-proven RPC correctness in `docs/master_flow_qa_report.md` (Pass 1) and
`docs/master_flow_qa_report_pass3.md` (Pass 3). It does not re-verify DB
behavior — every RPC-level verdict below is carried forward from those reports
unchanged. What this document adds is: for each meaningful DB state
transition in TC-30–50, which file/component each relevant role's screen
renders from, the exact selector/filter that gates visibility, and the literal
button labels/copy shown.

System-A vocabulary used throughout: "System A" = `parent_quest_assignments`
(direct parent↔parent/GP delegation, two-bounce pushback rules). "System B" =
plain `chore_tasks` claim/pool flow (kid/teen bounty board, `is_pool`).

---

### TC-30 — Pushback then reassign to a third party

**Scenario**: A locked (two-bounce, `is_locked=true`) System-A assignment between two parents is reassigned to a third family member via DelegateSheet, bypassing Recall/Cancel. Pass 1: FAIL (dangling `parent_quest_assignments` row). Pass 3: PASS, regression-checked live — `reassign_chore` now closes the stale open row to `COMPLETED`.

**Step-by-step trace**:

1. **Pre-condition — pushback locks the assignment.** Two bounces on the original A→B delegation set `parent_quest_assignments.status='PARKED'`, `is_locked=true`. Both original parties render `LockedAssignmentCard` (`features/hub/parent/backlog/LockedAssignmentCard.tsx`), which is the collapsed-by-default card shown for any row where `a.isLocked` is true (gating logic lives in the parent it's mounted from, `HouseholdBacklogSection.tsx`). Copy shown, both roles: title line `"Discuss offline with {other}'s first name — bounced"` (line 56-58), red `AlertCircle` icon, danger-tinted card border. Expanded state (tap to expand, line 52) shows the italicized `a.pushbackDetails` quote (line 65) plus two buttons: **"Reassign"** (line 72, calls `onDelegate(chore.id, chore.title)` → opens DelegateSheet) and **"Reopen"** (line 78, calls `cancelLockedAssignment`). Both the original assigner and original assignee see the identical card (component takes `active`/`other` generically — whichever of the two is logged in sees the other's name in the subtitle).
2. **Reassign action — `reassign_chore(chore_id, new_member_id, by_member_id)` fires.** Old `parent_quest_assignments` row (still `PARKED`/`is_locked=true`) is now closed to `status='COMPLETED'` (kept as historical record, not reopened); `chore_tasks.assigned_to_id` is rewritten to the new (third) member.
   - **Original assigner** (the parent who called Reassign): `LockedAssignmentCard` for this chore disappears from their Household Backlog once `getLiveAssignmentForChore` (`store/choreStore.ts:5013-5016`, `live = {'PENDING','ACCEPTED','PARKED','SNOOZED'}`) no longer matches the now-`COMPLETED` row.
   - **Original assignee** (the other parent in the locked pushback): same disappearance — their copy of `LockedAssignmentCard` is driven by the same `getLiveAssignmentForChore` lookup on the same chore id, so it vanishes symmetrically. No chat notification fires for this specific transition (`onDelegate`'s downstream reassignment path in `DelegateSheet.tsx`, not `LockedAssignmentCard`'s own `cancel()`, which is the only handler in this file with a `sendMessage` call — that one only fires on "Reopen", not "Reassign").
   - **New (third) assignee**: now sees this as a live delegation via `DirectPendingCard` (`features/hub/parent/backlog/DirectPendingCard.tsx`) if `assignedTo === active.id` and status is `PENDING`/`PARKED` — copy `"From {assigner's first name}"` (line 40), **Accept** (green, line 69) / **Respond** (opens PushbackSheet, line 76) buttons, plus the passive **"Let {assigner} know you're on it"** nudge row (line 106).
3. **Cross-role impact**: Reassigning a locked pushback to a third party now cleanly retires the old negotiation for both original parties (both cards vanish in lockstep) and hands a fresh, non-locked `DirectPendingCard` to the new assignee — no stale/orphaned card survives on any of the three parents' screens.

---

### TC-31 — Pushback then reopen — `cancel_locked_assignment`

**Scenario**: A locked System-A assignment is reopened via LockedAssignmentCard's "Reopen" button. Pass 1: FAIL (`is_pool` never reset, chore invisible to kid/teen pool). Pass 3: PASS, regression-checked — `is_pool` correctly flips back to `true`.

**Step-by-step trace**:

1. **Trigger**: Either original party taps **"Reopen"** on `LockedAssignmentCard.tsx:78`, confirms the `Alert.alert` ("Reopen this task? ... will go back to the open pool for anyone to take.", lines 25-27), which calls `cancelLockedAssignment(a.id, active.id)` (`store/choreStore.ts:4469`) → RPC `cancel_locked_assignment`. Assignment flips to `DECLINED`/`is_locked=false`; `chore_tasks.status='todo'`, `assigned_to_id=null`, and (post-fix) `is_pool=true` (unless `category_type='parent_only_quest'`, which stays out of any pool regardless).
   - **Actor (whoever tapped Reopen)**: local optimistic patch removes their `LockedAssignmentCard` immediately; `showToast('Reopened ✓')` fires (line 33).
   - **Other original party**: a chat DM fires from `cancel()` (lines 38-41): `"↩️ {actor's first name} reopened \"{chore.title}\" back to the pool."` — this is the one path in this file that does notify the other side. Their own `LockedAssignmentCard` disappears once `getLiveAssignmentForChore` no longer finds the row live (status is now `DECLINED`, not in the `{PENDING,ACCEPTED,PARKED,SNOOZED}` live-set).
   - **Kid/Teen pool (post-fix)**: `KidView.tsx`/`TeenView.tsx`'s bounty-board queries filter on `chore.isPool === true` and unclaimed (`assignedToId == null`); pre-fix the chore was invisible here (the exact TC-31 bug) — post-fix it now correctly reappears as an unclaimed pool card, generically claimable by any kid/teen the same as any other pool item.
   - **Parents (HouseholdBacklogSection)**: the reopened chore now surfaces via `unclaimedPool` (`features/hub/parent/HouseholdBacklogSection.tsx:72-73`, `questPool.filter(c => !systemBIds.has(c.id) && !getLiveAssignmentForChore(c.id))`) and renders as `PoolQuestCard` (`features/hub/parent/backlog/PoolQuestCard.tsx`) with **Take It** / **Delegate** buttons (lines 118, 129).
2. **Cross-role impact**: A reopened pushback correctly and simultaneously clears from both original parents' Household Backlog and reappears as a fully claimable item on the kid/teen Bounty Board and the parent pool section — no role is left seeing a stale card, and no role is missing the reopened item.

---

### TC-32 — Rapid-fire pushback race

**Scenario**: Two concurrent `respond_to_parent_quest` calls race on the same PENDING assignment (e.g. two browser tabs / two rapid taps). Pass 1: PASS — exactly one wins, no corruption. Pass 3: NOT-RE-EXECUTED (covered functionally by the TC-11 pool-race re-run, same CAS pattern).

**Step-by-step trace**:

1. Both calls originate from the same role/screen surface — whichever of `DirectPendingCard`'s **Accept** (line 58) or the PushbackSheet's snooze/blocker/trade/discuss options fires `respondToParentQuest` (`store/choreStore.ts:4324`). The RPC's own row-level CAS (re-checks live DB status inside the same transaction, not a client-side snapshot — see the comment block at `choreStore.ts:4311-4323`) guarantees exactly one write wins.
2. **Losing caller's role**: `choreStore.ts:4393-4402` — on RPC error the optimistic patch is rolled back to `prevAssignment`/`prevChore` and `showToast("That didn't go through — someone else may have already responded. Pull to refresh and try again.", 'error')` fires. This is role-agnostic — whichever UI surface (parent, GP, or any System-A party) initiated the losing call sees this exact toast.
3. **Winning caller's role**: normal optimistic UI stands; if the action was ACCEPT/DECLINE, the delegator gets the chat DM from lines 4410-4424 (`"✅ {name} accepted..."` / `"🚫 {name} declined..."`).
4. **Cross-role impact**: Only one of the two racing roles' UI actions survives; the other cleanly reverts with a visible, actionable error rather than silently diverging from DB truth or corrupting the row.

---

### TC-33 — Edit coins, unclaimed chore

**Scenario**: A parent edits `coinsReward` on a chore that has no assignee yet (`assignedToId` is null / not `in_progress`). Pass 1 & 3: PASS — applies immediately, no gate, correct per spec (nobody has a stake in it yet).

**Step-by-step trace**:

1. Parent edits coins via the chore edit modal → `updateChore(id, { coinsReward })`. The terms-change gate at `store/choreStore.ts:1564-1591` only engages `if (prevChore.status === 'in_progress' && prevChore.assignedToId && (...))` — an unclaimed chore fails that condition, so the code falls through to the plain patch path below it (not shown in this excerpt, but confirmed by the gate's own explicit `if` guard).
2. **Parent (editor)**: sees the coin value update immediately in whichever card renders it — `PoolQuestCard` (`features/hub/parent/backlog/PoolQuestCard.tsx`) for the household backlog view, or `QuestCard` (`features/quests/components/QuestCard.tsx`) on the unified Tasks tab. No pending-terms badge appears because `pendingTerms` was never set.
3. **Kid/Teen (pool viewers)**: see the updated coin amount on the same `PoolQuestCard`/`QuestCard` the next time it re-renders from the store — again, no negotiation state, straight value change.
4. **Cross-role impact**: Immediate, ungated, symmetric — every role sees the new coin value the moment the store updates; there is no claimant to negotiate with.

---

### TC-34 — Edit coins, CLAIMED chore

**Scenario**: A parent edits `coinsReward` on a chore that IS claimed (`status='in_progress'`, has `assignedToId`). Pass 1: FAIL — wrote the new value to the live column immediately, before acceptance. Pass 3 (Section C item 1, re-confirmed by code-read, not independently re-executed live): still an open gap in the OLD `propose_terms_change`. **This session's migration (`20260927190000_fix_terms_change_live_write_and_due_time.sql`) fixes this** — tracing CURRENT (fixed) behavior per task instructions.

**Step-by-step trace (current/fixed behavior)**:

1. Parent edits coins on a claimed chore → `updateChore` gate (`store/choreStore.ts:1564-1591`) matches (`in_progress` + `assignedToId` + `'coinsReward' in rawUpdates`), calls `supabase.rpc('propose_terms_change', { p_chore_id, p_by_member_id: reviewerId, p_new_coins_reward: newCoins, p_new_base_points: newBase ?? null, p_new_due_date: newDue ?? null, p_new_due_time: newDueTime ?? null })` (lines 1578-1581).
2. **RPC (fixed)**: `chore_tasks.status` → `'terms_changed'`; `pending_terms = {old: {...current live values...}, new: {...proposed values...}, changedBy, changedAt}`. Crucially, `coins_reward`/`base_points`/`due_date`/`due_time` **stay at their current (old) values** — nothing live is touched (`supabase/migrations/20260927190000_fix_terms_change_live_write_and_due_time.sql`, `propose_terms_change` body, comment: "Only status + pending_terms change now").
3. **Editing parent**: after `get().syncFromDB(true)` (line 1587) refetches, their own card (`QuestCard.tsx` if on the Tasks tab) shows the badge strip's "The terms changed" block (`QuestCard.tsx:677-698`) — since `q.pendingTerms` is now set and `q.assignedToId !== myId` (editor isn't the claimant) this parent sees the read-only diff summary only: `"Coins: {old} → {new} 🪙"` (line 683) if changed, no action buttons (the accept/reject action strip at line 851 is gated `q.assignedToId === myId`, which excludes the proposing parent).
4. **Claimant (assignee)**: `QuestCard.tsx` for the assignee — same "The terms changed" badge block, PLUS the action strip (lines 851-866): **"Still fine by me"** (green, calls `acceptTermsChange`) and **"Hand it back"** (red, calls `rejectTermsChange`). Every other action in the strip (Claim/Submit/Decline/etc., lines 888-954) is suppressed while `q.pendingTerms` is truthy (`!q.pendingTerms &&` guards on each).
5. **Observer roles (other kids/teens/GPs with no stake)**: because the live `coins_reward` column was never touched (this session's fix), anyone glancing at the chore mid-negotiation sees the OLD, correct coin value everywhere it's rendered outside this specific card's pending-terms badge — the exact defect Pass 3's Section C flagged as still-open is now closed.
6. **Cross-role impact**: Only the claimant gets action buttons; the proposing parent and any other observer see, at most, a read-only "terms changed" notice; nobody sees a live, un-accepted value presented as final.

---

### TC-35 — Edit due date, CLAIMED chore

**Scenario**: Same as TC-34 but editing `dueDate` instead of `coinsReward`. Pass 1 & Pass 3: FAIL/deferred under the old RPC. **Fixed this session**, same mechanism as TC-34.

**Step-by-step trace**: Identical flow to TC-34 step-by-step, substituting the due-date diff line: `QuestCard.tsx:686-689` — `"Due: {old ?? 'none'} → {new ?? 'none'}"` renders in the badge strip whenever `pendingTerms.old.dueDate !== pendingTerms.new.dueDate`. Same actor/claimant/observer role split as TC-34: only the claimant (`q.assignedToId === myId`) gets **"Still fine by me"** / **"Hand it back"**; the live `due_date` column is untouched until `accept_terms_change` applies it.

**Cross-role impact**: Same as TC-34 — due-date changes on a claimed chore are now staged, not live, closing the exact "contradicts original test doc's already-verified-working assumption" flag Pass 3 raised.

---

### TC-36 — Edit due TIME, CLAIMED chore

**Scenario**: Editing `dueTime` on a claimed chore. Pass 1/Pass 3: CONFIRMED-GAP — `dueTime` was entirely missing from the terms-change gate, so a due-time-only edit bypassed the gate and hit the plain `updateChore` patch, writing live with zero notice to the claimant. **Fixed this session** — `dueTime` is now part of both the gate condition and the RPC signature.

**Step-by-step trace (current/fixed behavior)**:

1. `store/choreStore.ts:1570` — the gate condition now explicitly includes `|| ('dueTime' in rawUpdates)` (with an inline comment flagging this as the exact TC-36 fix: "dueTime was missing from this gate entirely..."). A due-time-only edit on a claimed chore now correctly routes into `propose_terms_change` with `p_new_due_time: newDueTime` (line 1581), rather than falling through to a plain patch.
2. **RPC**: `propose_terms_change`'s signature now has `p_new_due_time text default null` (confirmed in `supabase/migrations/20260927190000_fix_terms_change_live_write_and_due_time.sql`); `pending_terms.old.dueTime`/`pending_terms.new.dueTime` are populated from `v_chore.due_time`.
3. **Claimant's UI**: `QuestCard.tsx:691-694` — `"Due time: {old ?? 'none'} → {new ?? 'none'}"` now renders in the badge strip alongside the coins/date lines, and the same **"Still fine by me"** / **"Hand it back"** action strip governs it (no separate due-time-specific UI needed — it's folded into the same `pendingTerms` object and the same accept/reject action pair).
4. **Cross-role impact**: The asymmetry Pass 1/3 documented (coins/date gated, time not) is now closed at both the client gate and the RPC signature — a due-time-only edit on a claimed chore behaves identically to a coins/date edit: staged, visible to the claimant with an explicit accept/reject choice, invisible-as-final to everyone else until accepted.

---

### TC-37A — Accept a terms-change proposal

**Scenario**: The claimant accepts a pending terms-change proposal. Pass 1 & 3: PASS — end state correct (`in_progress`, new value applied, `pending_terms` cleared).

**Step-by-step trace**:

1. Claimant taps **"Still fine by me"** (`QuestCard.tsx:857`) → `acceptTermsChange(q.id, myId)` (`store/choreStore.ts:2755`) → RPC `accept_terms_change(p_chore_id, p_member_id)`.
2. **RPC (current, fixed)**: reads `v_new_coins`/`v_new_base_points`/`v_new_due_date`/`v_new_due_time` out of `pending_terms->'new'` (this is now the FIRST point the live columns are actually written — the whole point of this session's fix), sets `status='in_progress'`, `pending_terms=null`, and applies the new values via `coalesce(v_new_*, existing)`, `due_time = v_new_due_time` (unconditional, since a null due-time is a valid "cleared" state).
3. **Claimant**: badge strip and action buttons both disappear (`q.pendingTerms` is now falsy); chore reverts to its normal in-progress card with the new coins/date/time values now genuinely live.
4. **Proposing parent**: their read-only "terms changed" badge (from TC-34/35/36) also clears on next sync; no explicit accept-notification chat message exists in this RPC's client wrapper (`acceptTermsChange`, `choreStore.ts:2755-2777` — no `sendMessage` call visible in this function, unlike `respondToParentQuest`/`completeParentQuest`, which do notify).
5. **Cross-role impact**: The claimant's accept is the sole moment the new terms become real for every role; no one sees a "half-applied" state at any point, and the parent who proposed it only learns of the acceptance passively (next sync), not via a push notification — a minor asymmetry versus other terminal actions in this system, worth flagging but not a regression of anything previously fixed.

---

### TC-37B — Reject a terms-change proposal ("hand it back")

**Scenario**: The claimant rejects a coin-amount proposal (10→25). Pass 1: FAIL — original value never restored, chore stuck at 25 permanently. Pass 3: PASS, regression-checked live — `reject_terms_change`'s restore-on-reject fix holds. **This session's migration simplifies this further**: since `propose_terms_change` no longer writes live values at all, there is nothing left to restore.

**Step-by-step trace (current/fixed behavior)**:

1. Claimant taps **"Hand it back"** (`QuestCard.tsx:863`) → `rejectTermsChange(q.id, myId)` (`store/choreStore.ts:2778`) → RPC `reject_terms_change`.
2. **RPC (current)**: per the new migration's comment ("coins_reward/base_points/due_date/due_time were never touched by propose_terms_change... nothing left to restore"), the function simply sets `status='todo'`, `assigned_to_id=null`, `is_pool=true`, `pending_terms=null` — the chore is fully released back to the pool at its ORIGINAL (never-modified) values.
3. **Claimant**: their `QuestCard` action strip and badge clear; the chore disappears from their claimed-items view entirely (status is now `todo`, not `in_progress`, and `assignedToId` is null).
4. **Proposing parent**: sees the chore reappear in their Household Backlog as an unclaimed `PoolQuestCard` (`features/hub/parent/backlog/PoolQuestCard.tsx`) — note this card's `declineNote` display (lines 44-50, 71-76) is spec'd for a KID's decline (`chore.declinedAt`/`rejectionReason`), NOT for a terms-change reject — `reject_terms_change`'s activity_log note ("terms changed, handed back — kept original terms") is written to `activity_log`, not to `chore.declinedAt`/`rejectionReason`, so the proposing parent's PoolQuestCard will NOT show the red "declined" sub-line for this specific reopen path; it just looks like any other freshly-unclaimed pool item.
5. **Kid/Teen pool viewers**: since `is_pool=true` is set unconditionally by this RPC (no `category_type != 'parent_only_quest'` guard visible in this specific function, unlike `cancel_locked_assignment`'s TC-31 fix) — a `parent_only_quest` that went through a terms-change reject would incorrectly become pool-visible to kids/teens. This is a genuinely new, previously-undocumented observation from this trace (see summary).
6. **Cross-role impact**: The claimant's reject now correctly and silently discards the proposal with zero value corruption (closing TC-37B's original bug at its root instead of patching around it) — but the proposing parent gets no visual distinction between "kid declined this" and "claimant rejected a terms change," and any `parent_only_quest` run through this specific path may incorrectly re-enter the kid/teen pool.

---

### TC-38 — GP edits own sponsored quest pre-approval

**Scenario**: A grandparent tries to edit a quest they sponsored/proposed before a parent has approved it. Pass 1 & 3: CONFIRMED-GAP (expected) — per explicit product direction this should work, but is currently blocked entirely; not built.

**Step-by-step trace**:

1. No dedicated edit-entry-point exists in `SeniorView.tsx`/`features/hub/SeniorView.tsx` for a GP's own pending-approval quest — the only path to `updateChore` for a `grandparent_quest` before approval is blocked outright by the guard at `store/choreStore.ts:1544-1550`: `if (prevChore.categoryType === 'grandparent_quest' && prevChore.status !== 'pending_parent_approval') { ... blocked }` — note this guard's condition is actually the INVERSE of what would allow the pre-approval edit: it blocks edits once status is NOT `pending_parent_approval` (i.e., once reviewed), which correctly protects post-review quests, but there is no separate UI affordance (edit button/modal) wired up for the pre-approval window either, so the gap is a missing UI entry point, not an active RPC-level block on the pre-approval state itself.
2. **GP role**: no edit button exists on their own view of the pending quest; whatever card renders a GP's own submitted-for-approval quest in `SeniorView.tsx` is read-only.
3. **Parent role**: sees the quest in the pending-approval review queue (`ChoreReviewSection.tsx`, not directly inspected this pass but referenced in the task's "where to look" list) with Approve/Decline — unaffected by this gap.
4. **Cross-role impact**: None yet — this is a documented not-yet-built feature, not a cross-role visibility bug. No further trace possible since the code path doesn't exist.

---

### TC-39 — Delete unclaimed pool chore

**Scenario**: `cancel_chore` (or the equivalent delete path) on an unclaimed pool chore. Pass 1 & 3: PASS — orphaned `parent_quest_assignments` cleaned via cascade; chore row confirmed deleted.

**Step-by-step trace**:

1. Trigger: a parent (creator or any parent, per `cancel_chore`'s role check) taps **"Cancel Task"** on `PoolQuestCard` (`features/hub/parent/backlog/PoolQuestCard.tsx:137`, only shown when `declineNote` is truthy — i.e., a previously-declined pool item) OR the equivalent "It's not needed anymore" path inside `CantMakeItSheet.tsx` (`resolveCantMakeIt` → `cancelChore`, `features/tasks/lib/cantMakeIt.ts`, not directly re-read this pass but referenced by `CantMakeItSheet.tsx:71`'s comment "cancelChore is the one outcome that can genuinely be rejected"). `store/choreStore.ts:2571` `cancelChore(choreId, byMemberId)` → RPC `cancel_chore`, awaited (no optimistic delete — line 2567's comment explains why: avoiding a flash-then-rollback for an unauthorized caller).
2. **Parent (canceller)**: on RPC success, `set(s => ({ chores: s.chores.filter(c => c.id !== choreId) }))` (line 2578) — the card vanishes from their own Household Backlog immediately. On failure, `showToast("Only the person who created this, or a parent, can cancel it", 'error')` (line 2575) and the card stays.
3. **Kid/Teen (pool viewers)**: the chore's row is gone from `chores` entirely on their next sync — it simply stops appearing in `KidView`/`TeenView`'s bounty-board list (no explicit "deleted" toast to a kid, they just never see it again).
4. **Cross-role impact**: A cleanly deleted, never-claimed pool item disappears identically for every role that could have seen it — no ghost card, no orphaned assignment row (per the RPC's cascade cleanup).

---

### TC-40 — Delete a chore with a live claimed assignee

**Scenario**: `cancel_chore` on a chore that currently has a claimant. Pass 1: PASS — succeeds, no ghost card/crash on the assignee's stale reference. Pass 3: NOT-RE-EXECUTED (same code path as TC-39/71, unchanged).

**Step-by-step trace**:

1. Same `cancelChore` RPC path as TC-39, but this time `chore_tasks.assigned_to_id` is populated. The parent-side UI entry point differs by which card the parent sees: if the claimant is another parent under System A, the canceller would be interacting via `MyAdultQuestCard`/`OthersAdultQuestCard`'s context (though neither of those two cards has a direct "Cancel Task" button in the excerpts read this pass — `PoolQuestCard`'s Cancel Task button is specifically gated on unclaimed+declined items, per step 1 above); for a kid/teen claimant, `CantMakeItSheet`'s "It's not needed anymore" outcome (available to a parent acting on any chore, not just their own creation, per the RPC's own authorization, not a client-side role gate) is the more general path.
2. **Canceling parent**: same immediate local filter-out as TC-39 once the RPC resolves.
3. **Claimant (kid/teen/parent/GP)**: on their own device, the next `syncFromDB`/realtime update removes the chore row from local state entirely. Any screen that was mid-render against a stale local reference to this `choreId` (e.g. `QuestCard` looking up `useChoreStore(s => s.chores.find(c => c.id === q.id))` inside `OthersAdultQuestCard.tsx:29`) would get `undefined` back for that lookup — the specific "no crash on stale reference" claim in Pass 1 implies these `.find()`-based lookups are written to tolerate an `undefined` result (optional chaining is used throughout, e.g. `choreData?.shoppingItems`), consistent with what's visible in `OthersAdultQuestCard.tsx` lines 29-33.
4. **Cross-role impact**: The claimant loses their claimed-chore card cleanly on their next sync with no crash; the deleting parent's local state updates immediately; no role is left holding a dangling reference that throws.

---

### TC-41 — Non-creator/non-parent attempts `cancel_chore`

**Scenario**: A kid or GP who is neither the chore's creator nor a parent calls `cancel_chore`. Pass 1 & 3: PASS — server exception, row untouched.

**Step-by-step trace**:

1. There is no client UI path that would even construct this call for an unauthorized role — `cancelChore`'s call sites (`CantMakeItSheet.tsx` and `PoolQuestCard.tsx`'s Cancel Task button) are both reachable by a kid/teen in principle (e.g. `CantMakeItSheet` is used by KidView/TeenView per its own header comment), so the RPC's own server-side check (`role='parent' OR created_by_id=actor`) is the real gate here, not a UI-level role check — confirming Pass 1's "no role should be able to act on another family's data at all" framing extends to "no unauthorized role within the SAME family either."
2. **Unauthorized actor (e.g. a kid who didn't create the chore)**: `cancelChore`'s error branch (`store/choreStore.ts:2573-2576`) fires: `showToast("Only the person who created this, or a parent, can cancel it", 'error')`. The chore is NOT removed from their local `chores` array (no optimistic delete happened, per the design noted in TC-39's trace) — the card simply remains exactly as it was.
3. **Other roles**: completely unaffected — nothing changed server-side, so no other role's UI updates at all.
4. **Cross-role impact**: The rejection is fully local to the unauthorized actor's own screen (a toast, nothing more); every other role's view is untouched because the write never happened.

---

### TC-42 — Delete a chore mid-handoff / mid-later-date-request

**Scenario**: `cancel_chore` on a chore that has an in-flight named handoff (`pendingHandoffTo`) or later-date request (`pendingLaterDate`). Pass 1 & 3: PASS — cascades cleanly, no orphaned `chore_participants`.

**Step-by-step trace**:

1. Pre-condition: chore has `pendingHandoffTo`/`pendingHandoffOfferedBy` set (rendered as the amber "wants to hand you this" box, `QuestCard.tsx:663-674`) OR `pendingLaterDate` set (rendered via `CantMakeItSheet`'s "later" outcome, approve/decline surfaced to a parent). Either way, a parent cancels the chore outright via `cancelChore`.
2. **Receiver of the pending handoff**: their `QuestCard`'s pendingHandoffTo box (lines 663-674) and the action-strip's "I've got it"/"Can't either" pair (lines 870-885) both disappear once the chore row itself is gone — there's no separate cleanup needed client-side since the whole chore (and by extension every field on it) is removed in one shot.
3. **Proposer of a pending later-date request**: same effect — the chore vanishing removes any card that would have shown the pending state.
4. **Approving parent**: any pending-approval queue entry for the later-date request also disappears once the underlying chore row is gone.
5. **Cross-role impact**: A mid-flight negotiation of either kind (handoff or later-date) is fully and atomically discarded for every party the moment the chore is cancelled — no role is left staring at a dangling reference to a negotiation whose subject no longer exists.

---

### TC-43 — Stale reference after delete

**Scenario**: Any RPC-backed action attempted against an already-deleted chore id. Pass 1 & 3: PASS for RPC paths (clean "not found" exception); **possible latent gap flagged, unconfirmed, still open** — a plain (non-RPC) `updateChore` patch against a deleted row is a silent 0-row UPDATE with no SQL error, and it's unconfirmed whether the client surfaces this as a false "saved" toast.

**Step-by-step trace**:

1. **RPC-backed paths** (e.g. `cancel_chore` called twice, per TC-71's re-run): second call raises `chore ... not found` server-side; `store/choreStore.ts`'s error branches for every RPC wrapper in this file (`cancelChore`, `respondToParentQuest`, `completeParentQuest`, `cancelLockedAssignment`, etc.) all follow the same pattern — catch `error`, `console.warn`, `showToast(..., 'error')`, roll back any optimistic patch. Whichever role's UI fired the stale action sees a real, visible error toast.
2. **Plain `updateChore` path (the flagged gap)**: `store/choreStore.ts`'s plain-patch branch (the fallback after the terms-change gate at line 1591, not directly re-read this pass) issues a normal Supabase `UPDATE ... WHERE id = ...` — against a deleted row this returns 0 rows affected, which Supabase's JS client does NOT surface as an `error` (a 0-row UPDATE is a successful, empty result, not a Postgres exception). If `updateChore`'s success path shows any kind of "saved"/confirmation toast unconditionally (not gated on `data` actually containing a returned row), a user editing a chore that was deleted out from under them (e.g. a parent cancelled it moments earlier on another device) would see a false "saved" confirmation while nothing was actually written anywhere.
3. **Cross-role impact**: For RPC paths, every role gets an honest, visible failure. For the flagged plain-patch gap, the acting role's screen may show a misleadingly successful save with zero downstream effect on any other role's view (since nothing was actually written) — this remains genuinely unconfirmed and was NOT resolved by this trace (confirming it requires reading `updateChore`'s exact success-toast logic beyond the terms-change gate excerpt already read, which was out of this trace's specific line range).

---

### TC-44 — `respond_to_parent_quest` — ACCEPT on already-ACCEPTED

**Scenario**: The same assignee calls ACCEPT twice on an already-ACCEPTED assignment. Pass 1 & 3: PASS — exception `assignment ... is already resolved (status=ACCEPTED)`.

**Step-by-step trace**:

1. UI-level: once an assignment reaches `ACCEPTED`, `DirectPendingCard` (the only card offering the Accept button) is no longer rendered for it at all — `HouseholdBacklogSection.tsx`'s selection of which card type to show per assignment is driven by status (PENDING/PARKED-not-locked → `DirectPendingCard`; ACCEPTED chores instead surface via `MyAdultQuestCard`/`OthersAdultQuestCard`, which offer **Done**/**Reassign** or **Nudge**/**Reclaim**, never Accept again). So a live double-tap of Accept is not actually reachable through the normal UI a second time — the RPC's own guard is the real defense against a race (two rapid taps before the first response's UI update lands) or a direct/stale call, not a client-side button that's still visibly offered.
2. **Assignee**: if a race did occur, the second call's error surfaces via the same `respondToParentQuest` error branch as TC-32 (`choreStore.ts:4393-4402`) — rollback + `showToast(...)`.
3. **Cross-role impact**: No other role is exposed to this at all — this is purely a same-actor double-submission guard, invisible to every other party.

---

### TC-45 — ACCEPT on already-DECLINED

**Scenario**: Same as TC-44 but the assignment is already DECLINED. Pass 1 & 3: PASS — same exception pattern, correct status echoed.

**Step-by-step trace**:

1. Once `DECLINED`, the assignment is no longer "live" per `getLiveAssignmentForChore`'s status set (`{'PENDING','ACCEPTED','PARKED','SNOOZED'}` — DECLINED is excluded), so it's not eligible for a fresh Accept anywhere in the assignee's UI — same reasoning as TC-44, this is a defense against a stale/raced call, not a reachable double-tap in the normal flow.
2. **Cross-role impact**: None — same as TC-44, purely a same-actor stale-call guard.

---

### TC-46 — Any action, nonexistent id

**Scenario**: Any `respond_to_parent_quest` action against a nonexistent assignment id. Pass 1 & 3: PASS — exception "not found".

**Step-by-step trace**:

1. Not reachable through any normal UI flow — every card in `features/hub/parent/backlog/` derives its assignment id from a real row already loaded into `parentAssignments` (e.g. `DirectPendingCard`'s `a.id`, passed in as a prop from an already-fetched list). This guard only matters for a stale local reference (e.g. an id cached before the row was deleted server-side by another device) or a direct/malicious call.
2. **Cross-role impact**: None observable from normal UI — purely a defensive guard.

---

### TC-47 — Any action on `is_locked=true`

**Scenario**: Any response action attempted on a locked (two-bounce) assignment. Pass 1 & 3: PASS — exception "is locked (two-bounce rule) — needs to be discussed outside the app".

**Step-by-step trace**:

1. **Client-side pre-check**: `store/choreStore.ts:4342-4345` — `respondToParentQuest` itself checks `if (assignment.isLocked) { showToast("This one's locked — needs to be discussed outside the app", 'error'); return; }` BEFORE ever calling the RPC — this is a genuine client-side mirror of the server guard, not just relying on the RPC's own rejection. The toast text matches the RPC's exception message almost verbatim.
2. **UI-level**: once locked, `LockedAssignmentCard` (not `DirectPendingCard`) is the card shown at all (per `HouseholdBacklogSection.tsx`'s status-driven card selection) — `LockedAssignmentCard` offers only **Reassign**/**Reopen**, no Accept/Decline/pushback options exist on it in the first place, so this guard is effectively double-enforced (UI never offers the blocked action; the store function pre-checks again even if somehow called; the RPC checks a third time).
3. **Cross-role impact**: Both parties in a locked negotiation see only `LockedAssignmentCard`'s Reassign/Reopen pair — no role has any UI path left that would even attempt the blocked action.

---

### TC-48 — Uninvolved 3rd party responds

**Scenario**: A family member who is neither `assignedBy` nor `assignedTo` calls `respond_to_parent_quest` directly. Pass 1: FAIL — no actor check existed at all; an uninvolved parent could accept/decline someone else's delegation. Pass 3: PASS, regression-checked live — `p_actor_id` fix and party-check both hold.

**Step-by-step trace**:

1. **UI-level**: an uninvolved third parent never sees this assignment's `DirectPendingCard`/`OutgoingPendingCard` at all — `HouseholdBacklogSection.tsx`'s card lists are filtered to the acting member's own `parentAssignments` (assignedTo === active.id for `DirectPendingCard`, assignedBy === active.id for `OutgoingPendingCard`), so the only way to reach this bug was a direct RPC call, never a real button tap by an uninvolved party.
2. **Fixed behavior**: `respondToParentQuest` (`choreStore.ts:4337-4341`) now always resolves `actorId = getActiveMemberId()` and sends it as `p_actor_id`; the RPC's party check (`assigned_to != actor AND assigned_by != actor → exception`) rejects any caller who isn't a party, regardless of the client.
3. **Cross-role impact**: Structurally, no role's normal UI could reach this in the first place (filtered lists); the fix closes the direct-call/exploit path specifically, with zero visible change to any legitimate role's screen.

---

### TC-49 — `complete_parent_quest`, uninvolved actor

**Scenario**: A non-party family member calls `complete_parent_quest` directly. Pass 1 & 3: PASS — exception "not a party to assignment".

**Step-by-step trace**:

1. **UI-level**: `completeParentQuest`'s only real UI entry point is `MyAdultQuestCard`'s **Done** button (`features/hub/parent/backlog/MyAdultQuestCard.tsx:88-96`), which only renders for the current parent's own accepted assignments — an uninvolved parent's Household Backlog never surfaces this button for someone else's assignment (they'd see `OthersAdultQuestCard`'s read-only "Claimed by {name}" state instead, with only **Nudge**/**Reclaim** actions — line 90-94, 166-181 — neither of which calls `complete_parent_quest`).
2. **Cross-role impact**: Same shape as TC-48 — a legitimate role never has a button that would fire this; the RPC guard defends the direct-call path only.

---

### TC-50 — Double-complete

**Scenario**: The same "Done" action fires twice on an already-COMPLETED assignment (retry/double-tap/flaky network). Pass 1: FAIL — no guard, duplicate `activity_log` row + re-stamped `completed_at`. Pass 3: PASS, regression-checked live — `if v_assignment.status = 'COMPLETED' then raise exception` holds.

**Step-by-step trace**:

1. **Trigger**: `MyAdultQuestCard.tsx:88-91` — Done button's `onPress` looks up `getLiveAssignmentForChore(q.id)` fresh at tap time and calls `completeParentQuest(a.id, active.id)` if found, else falls back to a plain `updateQuest(q.id, { status: 'done' })` for quests with no linked System-A assignment. A double-tap before the first response lands could theoretically fire twice.
2. **Client-side**: `store/choreStore.ts:4436-4442` optimistically sets `status='COMPLETED'` immediately on the first tap; a near-simultaneous second tap would read the already-optimistically-updated local state, but since the button's own state isn't shown as disabled/loading in this excerpt (no `isCompleting`-style guard visible in `MyAdultQuestCard.tsx`, unlike `handleClaim`'s `isClaiming[q.id]` pattern used elsewhere in `QuestCard.tsx:890-897`), a genuine rapid double-tap COULD still fire two RPC calls.
3. **Second call's error**: `choreStore.ts:4444-4453` — `error` branch rolls back to the pre-optimistic `assignment`/`prevChore` snapshot and `showToast("That didn't go through — check your connection and try again", 'error')`. Note this rollback happens even though the actual first completion DID succeed — the second (rejected) call's rollback restores state to what it captured at ITS OWN call time, which should already reflect `COMPLETED` from the first call's success, so in practice this reads as a harmless no-op toast rather than actually undoing the real completion.
4. **Cross-role impact**: Purely same-actor; the guard prevents a duplicate `activity_log` entry and a re-stamped `completed_at` from corrupting the historical record, which indirectly matters for any role later reviewing activity history, but no other role's live card is affected either way.

---

## Summary of a genuinely new observation from this trace

While tracing TC-37B under the CURRENT (fixed) `reject_terms_change`, two points not previously flagged in Pass 1 or Pass 3 emerged:

1. `reject_terms_change` sets `is_pool = true` unconditionally (no `category_type != 'parent_only_quest'` exclusion), unlike `cancel_locked_assignment`'s TC-31 fix, which explicitly excludes `parent_only_quest` from re-entering any kid/teen pool. If a `parent_only_quest` is ever put through a claim → terms-change-propose → reject cycle, it would incorrectly become visible/claimable on the kid/teen Bounty Board. This needs a live-DB check to confirm reachability (a `parent_only_quest` would need to become claimed with `assigned_to_id` set and then have a parent successfully call `propose_terms_change` on it — worth checking whether the terms-change gate's authorization check would even allow this combination).
2. `reject_terms_change`'s activity-log note is written to `activity_log`, not to the chore's own `declinedAt`/`rejectionReason` columns that `PoolQuestCard.tsx`'s `declineNote` UI reads from (lines 44-50) — so a parent viewing the re-pooled chore after a claimant hands back a terms-change proposal sees a plain, undecorated pool card, not the red "declined: ..." annotation a kid's decline produces. This is a minor UX inconsistency (two structurally similar "sent back to the pool" events render with and without an explanation line, respectively), not a data-integrity bug.

Neither of these was independently re-verified against the live DB this pass (per task scope, this was pure source-code tracing) — both are flagged for a follow-up DB check, not asserted as confirmed live bugs.
