# Master Flow — Full Role-Wise UI Trace, TC-67 through TC-82

**Scope**: Pure source-code UI tracing for TC-67–TC-82, matching the depth/format of Pass 3's Section B.3 (`docs/master_flow_qa_report_pass3.md`). No DB queries or RPC re-verification performed here — correctness of every RPC guard cited below was already proven live in Pass 1 (`docs/master_flow_qa_report.md`) and re-verified with zero regressions in Pass 3. This document only answers: **given that DB state, what does each role's screen actually show, and which file/line drives it.**

**Legend**: **A** = assignee/receiver, **B** = assigner/delegator/proposer, **CoP** = co-parent not involved in this specific action, **K/T** = kid/teen general pool visibility, **GP** = grandparent.

Key files referenced throughout:
- `store/choreStore.ts` — all client-side RPC call sites and optimistic local updates
- `features/hub/parent/ChoreReviewSection.tsx` — parent-facing review cards (`CantMakeItLaterCard`, `RedoDisputeCard`)
- `features/hub/parent/DelegateSheet.tsx` — parent's reassign-target picker
- `features/hub/KidView.tsx` / `features/hub/TeenView.tsx` — kid/teen pool + "my quests" filters
- `features/quests/components/QuestCard.tsx` — the shared card rendering claim/handoff/terms buttons
- `features/chores/ParentReviewDeck.tsx` — parent's approve/decline deck for pending_approval chores
- `supabase/migrations/20260927110000_qa_fixes_batch1.sql` — the 9-bug fix migration (TC-30/31/37B/48/50/59/66/69/70/80)
- `supabase/migrations/20260927150000_fix_later_date_orphan.sql` — the `propose_later_date` `is_pool` fix (relevant to TC-67/68/69/82)

---

### TC-67 — `approve_later_date`, no pending proposal

**Scenario**: A parent calls `approve_later_date` on a chore that has no `pending_later_date` set (fresh chore, no reschedule request ever made).

**Step-by-step trace**:

1. **RPC/action fired**: `approve_later_date(p_chore_id, p_parent_id)`. Guard (pre-existing, unchanged by the `is_pool` fix): `if v_result.pending_later_date is null then raise exception 'chore % has no pending later-date proposal'`. Nothing is written — the exception fires before the `update` executes.
2. **Parent (B/approver)**: There is no UI path to trigger this in normal use — `CantMakeItLaterCard` (`features/hub/parent/ChoreReviewSection.tsx:567-604`) only renders for chores in the `laterRequests` filter (`ChoreReviewSection.tsx:655-658`: `c.status === 'todo' && !!c.pendingLaterDate && !(reviewAckIds).includes(active.id)`), which requires `pendingLaterDate` to be truthy. A chore with no pending proposal never produces this card, so a parent cannot reach "Approve new date" for it through the UI. The RPC's guard is defense-in-depth against a stale client / direct call, matching every sibling function's pattern.
3. **Kid/Teen/GP (A)**: No card exists for this state on any role's screen — the chore just renders as a normal `todo`/`in_progress` item via `QuestCard.tsx`, no `pendingHandoffTo`/`pendingTerms` badge strip content applies since `pendingLaterDate` is what gates the parent card, not the assignee's own card (the assignee's own "Ask for a later time" flow is `CantMakeItSheet`, a separate write path).

**Cross-role impact**: No role sees any visible effect — the call is rejected server-side before any row changes, so every role's screen is unaffected; this is purely a defense-in-depth guard with no reachable legitimate UI trigger.

---

### TC-68 — `approve_later_date`, not authorized

**Scenario**: A non-parent (e.g. a sibling kid/teen) attempts to call `approve_later_date` directly on a chore that DOES have a pending proposal.

**Step-by-step trace**:

1. **RPC/action fired**: `approve_later_date` checks the caller's role is `parent` (or grandparent-approver equivalent per the RPC's authorization branch); a kid/teen actor raises `member % is not authorized to approve a reschedule`. No row changes.
2. **Parent (B)**: Sees the real `CantMakeItLaterCard` (`ChoreReviewSection.tsx:567-604`) with "Keep original date" / "Approve new date" buttons — this is the only legitimate entry point, and it is only rendered inside `ChoreReviewSection`, which is only mounted for parent/senior-approver roles in the Hub (`features/hub/ParentView.tsx` / `SeniorView.tsx`), never for kid/teen roles.
3. **Kid/Teen (A or sibling)**: `KidView.tsx`/`TeenView.tsx` have no equivalent approve card at all — a kid has no button anywhere in the UI that could fire `approveLaterDate`. The requester's own chore (per the fixed `propose_later_date`, see TC-66/82 below) shows as unassigned-and-back-in-the-pool while the request is pending, not as an item with an "Approve" action.
4. **Requester kid (A, if different from the attacker)**: sees their own request pending — no distinguishable "awaiting approval" card on `KidView`/`TeenView` (matches Pass 1's TC-15 finding: the chore is simply visible again in the pool, `isPool: true` per the `is_pool` fix, with no separate "reschedule pending" badge on the kid-facing card).

**Cross-role impact**: Only a parent/senior-approver's screen exposes the real Approve/Decline controls at all; a kid/teen role has zero UI surface to attempt this from, so the RPC's role guard is the sole protection against a modified/direct client call, not a redundant check behind a UI gate that already blocks it.

---

### TC-69 / TC-82 — `decline_later_date`, missing null-guard (fixed) — traced against the CURRENT `is_pool`-fixed behavior

**Scenario A (TC-69)**: Decline a later-date request when none exists.
**Scenario B (TC-82)**: Propose → approve → decline, in that order — decline runs after approve already cleared the proposal.

Both share the same guard: `decline_later_date` now checks `if v_result.pending_later_date is null then raise exception 'chore % has no pending later-date proposal'` (`supabase/migrations/20260927110000_qa_fixes_batch1.sql:399+`), mirroring `approve_later_date`'s pre-existing guard.

**Step-by-step trace (TC-82's full sequence, since it exercises every state transition)**:

1. **`propose_later_date(choreId, kidId, newDate, reason)` fires.** As of `supabase/migrations/20260927150000_fix_later_date_orphan.sql`, this now sets `assigned_to_id = null`, `status = 'todo'`, `is_pool = (category_type != 'parent_only_quest')`, plus `pending_later_date/reason/requested_by/requested_at`.
   - **Kid A (requester)**: `store/choreStore.ts:2500-2518` (`proposeLaterDate`) optimistically sets local state — **note**: the local optimistic patch at line 2505 sets `isPool: false`, which is now STALE relative to the fixed RPC's `is_pool=true`. Until the next refetch/realtime sync overwrites it, Kid A's own screen briefly shows the chore as gone from their pool view even though the server has already made it poolable again. Once synced, `KidView.tsx:235` (`poolQuests = quests.filter(q => q.isPool && q.status === 'todo' && ...)`) picks it back up and Kid A sees their own chore reappear in the general Bounty Board, not in a "my quests" section, since `assignedToId` is null.
   - **Other Kid/Teen (K/T)**: Once synced, sees the chore appear in their own pool list (`KidView.tsx:235` / `TeenView.tsx:113`) with a normal "Claim" button (`QuestCard.tsx:888-894`) — nothing distinguishes it as "someone else's reschedule request," it looks like any other freshly-released pool chore.
   - **Parent (B)**: `ChoreReviewSection.tsx`'s `laterRequests` filter (line 655) picks it up (`status==='todo' && pendingLaterDate` truthy) and renders `CantMakeItLaterCard` with copy `"{Kid A} asked to move this to {date}"` and buttons "Keep original date" / "Approve new date" (lines 582-599).
2. **`approve_later_date(choreId, parentId)` fires.** Sets `dueDate = pendingLaterDate`, clears all `pending_later_*` fields. Does NOT touch `is_pool` or `assigned_to_id` (per the fix migration's comment, this was deliberate — the chore stays exactly as poolable/unassigned as `propose_later_date` left it).
   - **Parent (B)**: `store/choreStore.ts:2522-2540` optimistically updates `dueDate`, clears `pendingLaterDate` etc.; `laterRequests` filter no longer matches (no `pendingLaterDate`), so `CantMakeItLaterCard` disappears from the parent's queue. Toast: `"Reschedule approved ✓"` (line 2535).
   - **Kid/Teen (K/T, including original requester)**: Chore remains visible in the pool (`isPool` was already `true` from step 1 and is untouched here) — now shows the new due date. No distinct "approved" badge on the kid-facing card; it just reads as a normal pool chore with an updated date.
3. **`decline_later_date(choreId, parentId)` fires** — but `pending_later_date` is already `null` (cleared by step 2's approve). Guard fires: `raise exception 'chore % has no pending later-date proposal'`.
   - **Parent (B)**: `store/choreStore.ts:2544-2561` (`declineLaterDate`) has already optimistically cleared local `pendingLater*` fields (which were already null/undefined post-approve, so this is a no-op locally) and calls the RPC; the RPC's exception is caught at line 2555 (`console.warn(...)`), local state is rolled back to the pre-call snapshot (also a no-op since nothing had changed), and the toast `"Couldn't save — check your connection and try again"` fires (line 2559) — **misleading copy**, since the real reason is "there's nothing to decline," not a connection issue, but this is pre-existing generic error-toast wording shared by every action in this file, not something newly introduced by the TC-69/82 fix.
   - There is no legitimate UI path to reach step 3 in the first place: once step 2's approve fires, `CantMakeItLaterCard` for this chore has already vanished from the parent's queue (per step 2's filter match failure), so "Keep original date" is no longer tappable for this chore by any parent through normal navigation. This scenario is only reachable via a stale screen (parent had the card open, a co-parent approved it first, original parent's screen hasn't refreshed) or a direct/scripted call — consistent with TC-69's fresh-chore variant having no UI path either.
4. **Kid A (requester)**: Unaffected by step 3's rejected decline — their chore stays at the newly-approved due date from step 2, still visible in the pool.

**Cross-role impact**: The `is_pool` fix (this session) means the requesting kid's chore is now visible to every kid/teen in the household pool immediately after `propose_later_date`, rather than vanishing — this benefits ALL kid/teen roles' Bounty Board, not just the requester. The `decline_later_date` null-guard prevents a stale/racing parent screen from writing a misleading `activity_log` entry ("later_declined... kept original date") after another parent has already approved, but produces a generic (slightly misleading) "couldn't save" toast on the stale parent's own screen rather than a specific "already resolved" message.

---

### TC-70 — `cancel_chore`, cross-family (see TC-80 note: this is a security test with no legitimate UI path)

This falls outside the assigned TC-74–82 detail range per the report's own Section A entry, but is referenced by TC-71's adjacency; no separate trace needed here since Pass 1/Pass 3 already fully cover it and it has no cross-role UI surface (a parent never sees another family's chores in any list — `chores` is always fetched scoped to the active member's own `family_id`).

---

### TC-74 — `claim_pool_quest` (i.e. the real `claimPoolQuest` client action) on a non-pool chore

**Scenario**: A kid/teen taps "Claim" (or a stale/direct call fires) on a chore that is not currently poolable (`is_pool=false` or already has an assignee) — the report labels this `claim_pool_quest` but the actual reachable client code path is `claimPoolQuest` in `store/choreStore.ts`, which uses a plain conditional `UPDATE ... WHERE assigned_to_id IS NULL` (a CAS), not a dedicated RPC.

**Step-by-step trace**:

1. **Action fired**: `claimPoolQuest(choreId, memberId, onLost)` (`store/choreStore.ts:2055-2108`). Client first optimistically sets `assignedToId: memberId, status: 'in_progress', isPool: false, claimedAt` (line 2074), then fires `supabase.from('chore_tasks').update({...}).eq('id', choreId).is('assigned_to_id', null).select('id')` (lines 2078-2082) — the `.is('assigned_to_id', null)` clause is the CAS guard. Since the chore already has an assignee (or was never a pool chore), this WHERE clause matches 0 rows.
2. **Claiming kid/teen (A, the one who tapped)**: `data.length === 0` branch fires (line 2088) — local optimistic claim is rolled back: `assignedToId: undefined, status: 'todo', isPool: true, claimedAt: undefined` restored (line 2092). If `onLost` callback was passed, it queries whether the chore still exists to disambiguate "claimed" vs "deleted" (lines 2097-2103) and surfaces that distinction to the caller (typically `QuestCard.tsx`'s `handleClaim`, which shows an alert — exact copy lives in the caller, not in the store). No success toast fires; the "Claimed ✓" toast (line 2106) is skipped entirely on this branch.
3. **Other kid/teen (K/T)**: If the chore genuinely already belongs to someone else, it was never in their own `poolQuests` filter to begin with (`KidView.tsx:235` / `TeenView.tsx:113` require `q.isPool && q.status==='todo'`) — no card to interact with, no visible effect.
4. **Original assignee (A', if the chore has one)**: Completely unaffected — their own card (rendered via `myQuests`/`todoQuests` filters) is untouched since the failed claim never wrote anything.

**Cross-role impact**: The failed claim is invisible to everyone except the kid/teen who attempted it — the CAS guard means no other role's screen changes, and the attempting kid/teen's screen silently reverts to the pre-tap state with, at most, an "already taken" alert surfaced by the calling component.

---

### TC-75 — `claim_pool_quest` on an already-assigned chore (race variant)

**Scenario**: Same mechanism as TC-74, but specifically the race case — two kids tap "Claim" on the same still-poolable chore at nearly the same time; the loser's CAS write matches 0 rows because the winner's write landed first.

**Step-by-step trace**:

1. **Winner (Kid A)**: `claimPoolQuest` fires, `.is('assigned_to_id', null)` still matches (chore was genuinely unclaimed at write time) — `data.length > 0`, `showToast('Claimed ✓')` fires (line 2106). Chore now shows in Kid A's own `myQuests`/`todoQuests` section (`assignedToId === A`, `isPool: false`).
2. **Loser (Kid B)**: Same code path, but by the time Kid B's UPDATE reaches the DB, `assigned_to_id` is no longer null — CAS matches 0 rows. Same rollback as TC-74 step 2: local claim reverted, `onLost('claimed')` fires if wired (line 2100, since the chore still exists — just claimed by someone else), surfacing a "Someone else already took that" style message from the calling UI (matches Pass 1's TC-11 finding for the deterministic race behavior).
3. **Other siblings (K/T not involved in the race)**: Once the winning write propagates, the chore silently disappears from their `poolQuests` filter (no longer `isPool: true`) — no explicit "claimed by X" toast on their own screens, it just stops appearing in the pool list on next render/refetch.
4. **Parent (B/CoP)**: No dedicated UI signal fires for a pool claim at all (pool claims don't touch `parent_quest_assignments`, unlike DIRECT delegations) — a parent would only notice via the chore's own card in `HouseholdBacklogSection`-style views showing the new assignee, no special "claimed" notification.

**Cross-role impact**: Exactly one claimant's screen reflects success; the loser's screen silently reverts with an "already taken" message; every other kid/teen's pool view just loses the item on next sync with no explanation of who took it; parents get no distinct notification for pool claims at all (contrast with DIRECT delegations, which do generate `OutgoingPendingCard`/`DirectPendingCard` states).

---

### TC-76 — `approve_chore`, not authorized

**Scenario**: A non-parent, non-approver actor (e.g. a sibling kid) calls `approve_chore` directly on a `pending_approval` chore.

**Step-by-step trace**:

1. **RPC fired**: `approve_chore(p_chore_id, p_reviewer_id)` (`supabase/migrations/20260905120000_chore_participant_rpcs.sql:136+`). Guard: `if <reviewer not parent/senior-approver> then raise exception 'member % is not authorized to approve chores'` (line 164). No row changes.
2. **Legitimate parent/approver (B)**: Sees the real "✓ Approve" button in `features/chores/ParentReviewDeck.tsx:221-227` (`ReviewCard`, the deck item for a single pending-approval submission) — calls `onApprove(task)` which resolves to `approveChore` in `store/choreStore.ts:2975+`. The store itself ALSO gates this client-side before even attempting the call: `store/choreStore.ts:2975-2984` checks the same "reviewer is a parent or has an active temporary-approver grant" condition and logs `console.warn('[choreStore] approveChore blocked...')` + returns early if not, meaning a kid's own client build would never even fire the RPC — the RPC guard is defense-in-depth against a modified/direct client, matching the report's characterization.
3. **Submitting kid/teen (A)**: No approve button exists anywhere on `KidView.tsx`/`TeenView.tsx` for their own submitted chore — they only ever see their own submission reflected as `pending_approval` status (e.g. a "Waiting for approval" style state on their own card), never an actionable approve control.

**Cross-role impact**: The kid role has zero UI surface offering this action at all; the client-side gate in `choreStore.ts:2975-2984` and the RPC's own guard are two independent layers protecting the same boundary, with the RPC being the one that actually matters against a bypassed/direct call.

---

### TC-77 — `approve_chore`, not pending_approval

**Scenario**: `approve_chore` called on a chore whose status is something other than `pending_approval` (e.g. still `todo` or already `approved`).

**Step-by-step trace**:

1. **RPC fired**: Guard `if v_chore.status != 'pending_approval' then raise exception 'chore % is not pending approval (status=%)'` (line 155). No row changes.
2. **Parent (B)**: `ParentReviewDeck.tsx`'s deck only ever renders `ReviewCard` for chores whose status genuinely is `pending_approval` (the deck's own source filter, upstream of `ReviewCard`, selects on that status) — so a parent cannot reach the "✓ Approve" button for a `todo` chore through normal navigation; this guard only matters against a stale deck snapshot (parent had the card open, chore's state changed underneath them via another parent's action) or a direct call.
3. **Kid/Teen (A)**: Their own card correctly reflects whatever the real status is (`todo`/`in_progress`/etc.) via the normal `QuestCard.tsx` status-driven rendering — unaffected either way since the call was rejected.

**Cross-role impact**: Purely a staleness/defense-in-depth guard; no role's legitimate screen offers a way to trigger this, so the practical cross-role impact is nil except protecting against a race between two parents' stale decks (see TC-78, the more common real-world trigger of this same guard).

---

### TC-78 — `approve_chore`, double-approve

**Scenario**: Two parents (or one parent double-tapping / retrying on a flaky connection) both call `approve_chore` on the same chore; the first succeeds, the second hits the same `not pending_approval` guard from TC-77 because the first call already flipped status to `approved`.

**Step-by-step trace**:

1. **First parent (B1) approves**: `approveChore` (`store/choreStore.ts:2975+`) fires; on success the chore's status becomes `approved`, coins pay out (subject to the harness's `guard_member_balance_writes` caveat noted in Pass 3 — not relevant to live device UI, which does have a real auth session). Locally, `ParentReviewDeck.tsx`'s `ReviewCard` for this chore disappears from B1's deck (no longer matches the `pending_approval` filter). `QuestStepper`-style UI on the kid's own card (referenced in the original report's TC-20) shows all steps filled/sorts to "Done."
2. **Second parent (B2, stale deck) approves the same card**: If B2's deck hadn't yet refreshed, they still see the `ReviewCard` with "✓ Approve" and tap it. `approve_chore` re-checks status server-side — now `approved`, not `pending_approval` — guard fires, `store/choreStore.ts`'s optimistic update (if any was applied before the RPC round-trip) is rolled back on the error branch (matching the pattern seen in `approveLaterDate`/`declineLaterDate`), and B2 sees a generic failure toast; the chore does NOT get double-paid or re-stamped.
3. **Assignee kid/teen (A)**: Sees exactly one approval reflected — a single "+N pts" / approved-state transition on their own card, since only the first call's write actually lands.
4. **Other co-parent(s) (CoP, uninvolved)**: If a third parent is also viewing the same deck, their `recentlyApproved` view (`ChoreReviewSection.tsx:683-698`, the 7-day dispute window) picks up the single real approval once synced, showing `c.reviewedById` as B1, giving CoP the ability to flag/dispute if the wrong parent's decision seems off — this is the mechanism that exists specifically so a co-parent isn't locked out of seeing/contesting an approval they weren't present for.

**Cross-role impact**: Exactly one approval lands regardless of how many parents/retries race for it; the losing parent's screen gets a rejected-write error rather than corrupting the chore's paid/approved state, and the assignee never sees a duplicate payout.

---

### TC-79 — `resolve_redo_dispute`, same parent as requester

**Scenario**: The same parent who originally requested the redo (`reviewedById` on the chore) attempts to resolve the resulting `kid_disputed_redo` dispute themselves, instead of a different parent doing so.

**Step-by-step trace**:

1. **RPC fired**: `resolve_redo_dispute(p_chore_id, p_reviewer_id, p_pay)` (`supabase/migrations/20260908150000_redo_dispute_rpcs.sql:94+`). Guard: `if p_reviewer_id = v_chore.reviewed_by_id then raise exception 'member % requested this redo — a different parent must resolve the dispute'` (line 129). No row changes.
2. **Requesting parent (the one who is blocked, "B" in this context)**: `RedoDisputeCard` (`features/hub/parent/ChoreReviewSection.tsx:491-546`) is rendered for EVERY parent viewing the redo-disputed chore, including the original requester — the component itself already gates the buttons client-side: `isSameReviewer = active.id === c.reviewedById` (line 497); when true, instead of the Side-with-redo/Pay buttons, it shows italic text: `"You requested this redo — a different parent needs to review the dispute."` (lines 523-526). The RPC's guard is redundant defense-in-depth here — the UI already prevents the requesting parent from even seeing the action buttons, only the explanatory text.
3. **Different parent (the legitimate resolver, "CoP")**: Sees the same `RedoDisputeCard` but with `isSameReviewer=false`, so the real two buttons render: "Side with the redo" (outlined, calls `resolveRedoDispute(c.id, active.id, false)`) and "Pay it (N🪙)" (filled primary, calls `resolveRedoDispute(c.id, active.id, true)`) — lines 528-542.
4. **Kid/teen (A, the disputer)**: Card copy shown to the requesting/uninvolved parent references the kid by first name: `"{kid} disagrees with {originalReviewer} redo request — asking you to take a look"` (line 509). The kid's own screen (`KidView.tsx`/`TeenView.tsx`) shows the chore in a disputed-redo state — no direct action available to the kid at this stage, they're waiting on the second parent's Side-with-redo/Pay decision.

**Cross-role impact**: The requesting parent is blocked at BOTH the UI layer (buttons never render for them, replaced with explanatory text) and the RPC layer (defense-in-depth against a direct call) — a genuinely different parent is the only role with a live decision to make; the kid only observes the outcome once resolved.

---

### TC-80 — `reassign_chore`, cross-family target (security test — already fixed/deployed) — tracing the legitimate SAME-family reassign path

Per the task scope, the cross-family exploit itself has no UI path (no picker anywhere ever offers a member from another family) and is already fixed/verified in Pass 1/Pass 3. This trace covers what a normal, same-family reassign shows to each role.

**Scenario**: A parent uses "Delegate" (`DelegateSheet.tsx`) to reassign a chore to a different, legitimate same-family member (parent or, if GP Welcome is toggled on, a senior/grandparent).

**Step-by-step trace**:

1. **RPC fired**: `supabase.rpc('reassign_chore', { p_chore_id, p_new_member_id, p_by_member_id })` — called directly from `DelegateSheet.tsx:92-97`, not wrapped through a `store/choreStore.ts` action. The RPC (`supabase/migrations/20260927110000_qa_fixes_batch1.sql:74-135`) deletes the old `chore_participants` assignee row (line 95), validates `v_new_member_family` against `v_chore_family` (lines 105-108, the TC-80 fix), inserts a new `chore_participants` row for the target (`status='pending'`), sets `assigned_to_id = p_new_member_id, is_pool = false, status = 'todo', claimed_at = null` (lines 113-118), and — per the TC-30 fix bundled into the same function — closes any still-open `parent_quest_assignments` row for the chore to `COMPLETED` (lines 121-127) so the old System-A assignment can't disagree with the new owner.
2. **Delegating parent (B)**: `DelegateSheet.tsx`'s member picker (line 72) only ever lists `members.filter(m => m.role === 'parent' || (m.role === 'senior' && isGPOpen))` — kids/teens are never offered as delegate targets through this sheet at all (this sheet is for the System-A/adult-quest delegation flow, distinct from the kid/teen pool-claim or named-handoff flows). On tap, `showToast('Delegated to {Name} ✓')` fires (line 96) and the sheet closes (line 107).
3. **New target parent/senior (A, the new assignee)**: The chore now appears in their own quest list via whichever adult-quest card renders `assignedToId === self` — e.g. `features/hub/parent/backlog/MyAdultQuestCard.tsx` (the file exists per the earlier grep of `reassignChore`/`DelegateSheet` references) — as a freshly assigned, `todo`-status item with no special "reassigned" badge distinct from a normal DIRECT delegation once accepted.
4. **Prior assignee (A', if there was a live prior assignment)**: `DelegateSheet.tsx:81-84` computes `priorAssigneeId` from `getLiveAssignmentForChore` BEFORE firing the RPC, and if the prior assignee is neither the new target nor the acting parent, sends them an explicit chat message: `"↪️ {active.name} reassigned \"{title}\" to {new target's name}."` (lines 102-104, via `useChatStore.sendMessage`) — this is the only in-app notification of the reassignment for the bumped party; their own card simply stops showing the chore as theirs once synced (their locked/pending card, if any, is closed server-side by the bundled TC-30 fix rather than lingering).
5. **Other co-parent/uninvolved family member (CoP)**: No dedicated notification; would only notice via the chat message thread (if they're in it) or by observing the chore's card now shows the new assignee's name/avatar.

**Cross-role impact**: The reassign is fully transactional across both the `chore_tasks` row and any stale `parent_quest_assignments` row (per the bundled TC-30 fix), so every role's view of "who owns this chore" stays consistent; the bumped prior assignee is the only party who gets an explicit push (a chat message), while the new assignee and any onlookers only learn about it by the chore's card changing on their own next sync.

---

### TC-81 — Offer → decline → accept (out of order)

**Scenario**: `offer_chore_handoff` targets a receiver, the receiver (or someone) declines it, then a subsequent `accept_chore_handoff` call is attempted on the now-already-resolved offer.

**Step-by-step trace**:

1. **`offer_chore_handoff(choreId, toMemberId, byMemberId, reason)` fires.** `store/choreStore.ts:2433-2454` (`offerChoreHandoff`) — sets `pendingHandoffTo`, `pendingHandoffReason`, `pendingHandoffOfferedBy` on the chore; `assignedToId` stays with the original holder (does not reassign yet, per Pass 3's B.3 confirmation).
   - **Original holder (B)**: Own card is unchanged — no distinguishable "offer sent, awaiting response" state exists (matches the Pass 3 B.3 step 3 finding, unchanged here).
   - **Receiver (A)**: `QuestCard.tsx:663-674` (badge strip) shows `"{offerer} wants to hand you this"` plus the reason in quotes; `QuestCard.tsx:870-885` (action row) shows two buttons: "I've got it" (`acceptChoreHandoff`) and "Can't either" (`declineChoreHandoff`). Same filter (`q.pendingHandoffTo === myId`) drives both the `KidView.tsx:232`-style and `TeenView.tsx` inclusion in "my quests" even though `assignedToId` still points at the original holder.
2. **`decline_chore_handoff(choreId, receiverId)` fires.** Reopens to the general pool: `assigned_to_id=null, is_pool=true, status='todo', pending_handoff_to=null` (per Pass 3 B.3 step 5) — does NOT bounce back to the original holder.
   - **Receiver (A, the decliner)**: The handoff badge/buttons (`QuestCard.tsx:663-674`/`870-885`) disappear the moment `pendingHandoffTo` clears — chore drops out of their "my quests" filter entirely.
   - **Original holder (B)**: Also loses the chore — it's now `assignedToId=null`, so it no longer appears in B's own assigned-to-me list either; it now shows in the general kid/teen pool (`poolQuests` filter, `KidView.tsx:235`/`TeenView.tsx:113`) for anyone, including B if B is a kid/teen role.
   - **Other kid/teen (K/T)**: Chore now appears in their own pool view as an ordinary claimable item, indistinguishable from any other pool-released chore.
3. **`accept_chore_handoff(choreId, receiverId)` fires — but `pending_handoff_to` is already null** (cleared by step 2's decline). Guard: no pending handoff to this member → exception (the same guard TC-61/62/64/65 exercise, `"chore % has no pending handoff to member %"` per Pass 3's TC-61/62 rows).
   - **Receiver (A, retrying/stale)**: If this fires from a stale screen (receiver had the accept button visible before their own decline round-tripped, or from a double-tap race), `acceptChoreHandoff` (`store/choreStore.ts:2456-2475`) rolls back any optimistic local change on the error branch — no visible change beyond a possible generic failure toast, since the buttons themselves have already disappeared from a synced screen per step 2.
   - **Every other role**: Unaffected — the chore is already in the general pool per step 2's resolution, and the rejected accept call writes nothing.

**Cross-role impact**: The decline is the authoritative terminal action once it lands — every role's view of the chore updates to "released to the pool," and a subsequent accept attempt (whether from a genuine race or a stale/replayed client action) is rejected cleanly with no state corruption, matching the pattern used throughout the handoff/later-date/redo-dispute guard families.

---

### TC-82 — Propose → approve → decline (out of order)

Traced in full above under **TC-69 / TC-82** (they share the identical root-cause guard and are best understood as one sequence — see that section for the complete step-by-step, including the `is_pool` fix's effect on pool visibility at each stage).

---

## Summary of files/lines most load-bearing for this TC range

- `store/choreStore.ts:2500-2561` — `proposeLaterDate`/`approveLaterDate`/`declineLaterDate` client actions (TC-67/68/69/82)
- `store/choreStore.ts:2055-2108` — `claimPoolQuest`, the plain-CAS pool-claim path (TC-74/75)
- `store/choreStore.ts:2975-2984` — client-side `approveChore` authorization pre-check (TC-76)
- `store/choreStore.ts:2433-2496` — `offerChoreHandoff`/`acceptChoreHandoff`/`declineChoreHandoff` (TC-81)
- `features/hub/parent/ChoreReviewSection.tsx:491-546` (`RedoDisputeCard`) — TC-79
- `features/hub/parent/ChoreReviewSection.tsx:567-604` (`CantMakeItLaterCard`) — TC-67/68/69/82
- `features/hub/parent/DelegateSheet.tsx:72-118` — TC-80's legitimate same-family reassign UI
- `features/quests/components/QuestCard.tsx:663-674, 870-885` — named-handoff receiver badge/buttons (TC-81)
- `features/chores/ParentReviewDeck.tsx:221-227` — the "✓ Approve" button (TC-76/77/78)
- `supabase/migrations/20260927110000_qa_fixes_batch1.sql` — all 9 guard fixes underlying TC-30/48/50/59/66/69/70/80/82
- `supabase/migrations/20260927150000_fix_later_date_orphan.sql` — the `is_pool=true`-on-release fix, directly changes what every kid/teen role's Bounty Board shows during TC-67/68/69/82's window

## Notable visibility gap observed while tracing (not previously documented)

`store/choreStore.ts:2505` — `proposeLaterDate`'s local optimistic update still sets `isPool: false` on the requesting kid's own chore, even though the now-fixed `propose_later_date` RPC (`20260927150000_fix_later_date_orphan.sql`) sets `is_pool = true` server-side (except for adult-only chores). This means the requesting kid's own screen will show the chore as briefly gone from their pool view for the duration between the optimistic update and the next realtime sync/refetch — the opposite of the fix's intent (the chore should read as immediately visible-and-poolable, not vanish-then-reappear). Once a realtime update or refetch lands, the correct `isPool: true` state overwrites it. This is a client-side staleness cosmetic issue, not a data-integrity bug — the server-side row is correct throughout — but it directly undercuts the UX goal the `is_pool` fix was written for (see the fix migration's own comment: "the requester's own chore reappears in the pool immediately"). Suggest updating `store/choreStore.ts:2505` to set `isPool: (chore.categoryType !== 'parent_only_quest')` to match the RPC, mirroring how `reassign_chore`'s release branch and `cancel_locked_assignment`'s reopen branch already compute the same condition.
