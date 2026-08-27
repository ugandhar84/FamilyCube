# Master Flow — Full Role Trace, TC-51 through TC-66

Scope: this file covers TC-51–TC-66 only (guard/CAS-edge tail of the pushback family, plus
named-handoff edge cases and one later-date edge case). Companion files from parallel agents
cover the rest of TC-01–82. Scenario text and Pass 1/Pass 3 status are quoted from
`docs/master_flow_qa_report.md` Section B and `docs/master_flow_qa_report_pass3.md` Section B.1 —
this file adds nothing to correctness verdicts, it only traces UI-per-role for each step.

Legend: **A** = assignee/receiver, **B** = assigner/delegator/original holder, **CoP** = co-parent
uninvolved in this specific delegation, **GP/Senior** = grandparent role, **K/T** = kid/teen.

Common mechanism used throughout this range (read once, referenced per-TC below): every RPC
wrapper in `store/choreStore.ts` for these actions (`respondToParentQuest`, `completeParentQuest`,
`cancelLockedAssignment`, `recallParentQuest`, `offerChoreHandoff`, `acceptChoreHandoff`,
`declineChoreHandoff`, `proposeLaterDate`) does an **optimistic local `set()` first**, fires the
Supabase RPC, and only on `{ error }` rolls the local state back to the pre-action snapshot and
calls `showToast(...)`. This means for every "invalid action, RPC correctly rejects" case in this
range, the acting role's own UI **does flash the optimistic change for one render frame**, then
snaps back once the rejection round-trips — it is not that "nothing happens," it's "something
happens and then un-happens," surfaced to the actor only as an error toast.

---

### TC-51 — `complete_parent_quest`, nonexistent id

**Scenario**: An actor calls `complete_parent_quest` against an assignment id that does not exist.

**Step-by-step trace**:
1. Action origin: the only UI path that calls `completeParentQuest` is the **"Done"** button in
   `features/hub/parent/backlog/MyAdultQuestCard.tsx:88-96` — `onPress` resolves
   `useChoreStore.getState().getLiveAssignmentForChore(q.id)`; if a live assignment `a` is found,
   `completeParentQuest(a.id, active.id)` fires. Rendered from `HouseholdBacklogSection.tsx:113-117`
   (parent), `QuestsScreen.tsx:1038-1043` (parent/senior via `isParentOrSeniorForSystemA`), and
   `SeniorView.tsx` (senior's own "Assigned To You" equivalent — see TC-49/50 context above this
   range for the Hub-vs-Chores-tab duplication).
2. In practice a nonexistent id can only reach the RPC via a stale client (the card the actor is
   looking at references an id whose row was deleted/mutated between load and tap) — there is no
   UI affordance that lets a role type/paste an arbitrary id.
3. `store/choreStore.ts:4428-4467` `completeParentQuest`: looks up `assignment` locally first
   (`get().parentAssignments.find(a => a.id === assignmentId)`). If the **local** cache still has
   a stale copy of that row, it optimistically flips `status: 'COMPLETED'` client-side, then the
   RPC call at line 4444 returns `{ error }` ("not found" server-side), and the `.then` rollback
   at 4448-4451 restores the pre-tap `assignment`/`chore` state and calls
   `showToast("That didn't go through — check your connection and try again", 'error')`.
   If the local cache has **no** matching row at all (already pruned by a realtime delete), the
   guard at line 4432-4435 (`if (!assignment) { console.warn(...); return; }`) fires first — the
   button tap is a silent no-op with only a console warning, no toast.
4. Role views: A (the actor who tapped Done) sees their own card flash to "done" styling then
   revert to whatever it was (or, in the no-local-row case, sees literally nothing happen). No
   other role's screen is touched — `parentAssignments`/`chores` state for every other client is
   untouched since the write never committed server-side.

**Cross-role impact**: None — this is purely local to the tapping actor's device; no other role's
card, badge, or notification is affected since the write never lands.

---

### TC-52 — `cancel_locked_assignment`, not locked

**Scenario**: `cancel_locked_assignment` (the "Reopen" action) is called against an assignment that
is not actually `is_locked = true`.

**Step-by-step trace**:
1. Action origin: **"Reopen"** button in `features/hub/parent/backlog/LockedAssignmentCard.tsx:74-79`
   → confirm Alert ("Reopen this task?") → `cancelLockedAssignment(a.id, active.id)` at line 32.
   This card is *only ever rendered* for rows already in `myLockedItems`
   (`getMyLockedItems`, `store/choreStore.ts:5032-5037`), which filters strictly on `a.isLocked`.
   So in normal UI flow this button cannot exist pointed at a non-locked row — the scenario
   requires a stale card (the row was unlocked by another actor between render and tap, e.g. a
   race with TC-30/31's reassign/reopen paths).
2. `cancelLockedAssignment` (`store/choreStore.ts:4469-4495`): optimistically sets
   `status: 'DECLINED', isLocked: false` locally, fires
   `supabase.rpc('cancel_locked_assignment', ...)`. Server rejects ("assignment ... is not
   locked"), rollback restores prior `assignment`, `showToast("That didn't go through —
   check your connection and try again", 'error')` at line 4488.
3. Rendered from `HouseholdBacklogSection.tsx:164-172` (parent), `QuestsScreen.tsx:1069-1078`
   (parent/senior), and `SeniorView.tsx:921-930` (senior).

**Cross-role impact**: None — the row's real server state (already unlocked, presumably now
active/reassigned under someone else's card) is untouched; only the stale-card holder's own UI
briefly flickers and reverts. Whoever the row is *actually* live under (per TC-30/31's fix) keeps
seeing it correctly in their own card the whole time, unaffected.

---

### TC-53 — `cancel_locked_assignment`, uninvolved actor

**Scenario**: A third party who is neither `assignedTo` nor `assignedBy` on the locked assignment
calls `cancel_locked_assignment`.

**Step-by-step trace**:
1. Same "Reopen" button/component as TC-52. Structurally this can't be reached by an uninvolved
   role through the app's own visibility rules: `getMyLockedItems(memberId)` at
   `store/choreStore.ts:5032-5037` requires `a.assignedTo === memberId || a.assignedBy === memberId`
   — an uninvolved CoP or GP2 never gets a `LockedAssignmentCard` for this row in the first place,
   so there is no button for them to tap. This case is reachable only via a raw/forced RPC call,
   not through any in-app selector — consistent with Pass 1/3 treating it as a pure RPC-layer
   guard test, not a UI-reachable one.
2. If forced anyway: RPC rejects with "member ... is not a party to assignment ...";
   `cancelLockedAssignment`'s `.then` rollback (`store/choreStore.ts:4483-4489`) restores state and
   toasts.

**Cross-role impact**: None — no card for this row exists in an uninvolved role's UI at all (A's
and B's own `LockedAssignmentCard` are unaffected, since the reject means the row never actually
unlocked).

---

### TC-54 — `cancel_locked_assignment`, nonexistent id

**Scenario**: Same action, target assignment id does not exist.

**Step-by-step trace**: Identical shape to TC-51/52 — reachable only via a stale/deleted local row.
`store/choreStore.ts:4469-4495`: if the local `assignment` lookup at 4471 misses, the function
returns immediately after a `console.warn`, no RPC call, no toast, no visible UI change beyond the
button doing nothing. If a stale local copy exists, the optimistic flip + RPC-reject + rollback +
toast path fires exactly as TC-52. Same three render sites
(`HouseholdBacklogSection.tsx`, `QuestsScreen.tsx`, `SeniorView.tsx`).

**Cross-role impact**: None — nonexistent row, no other role has any card referencing it either.

---

### TC-55 — `recall_parent_quest`, receiver tries to recall

**Scenario**: The **receiver** (A) of a still-PENDING delegation calls `recall_parent_quest` on
their own incoming assignment (recall is a delegator-only action).

**Step-by-step trace**:
1. Action origin: **"Recall"** button, `features/hub/parent/backlog/OutgoingPendingCard.tsx:83-95`.
   Critically, this button is rendered conditionally via the `onRecall` **prop**, and each parent
   render site gates that prop differently:
   - `HouseholdBacklogSection.tsx:158` — `onRecall={a.status === 'PENDING' && a.assignedBy ===
     active.id ? () => recallParentQuest(...) : undefined}` — the strictest gate, requires
     `active.id === a.assignedBy`. A receiver here (whose own view would show this row, if at all,
     under `myDirectPending`/`DirectPendingCard`, not `OutgoingPendingCard`) structurally never
     gets this button.
   - `QuestsScreen.tsx:1065` and `SeniorView.tsx:918` — **both only check `a.status === 'PENDING'`**,
     with no `assignedBy === active.id` check at all. This is a real inconsistency: on the Chores
     tab or the Senior Hub, `OutgoingPendingCard` is only ever populated from `myOutgoingPending`
     (`getMyOutgoingPending`, `store/choreStore.ts:5064-5087`) — and that selector already scopes
     to `a.assignedBy === memberId` OR (for a parent viewing a co-parent's delegation to a
     third-party senior) a read-only third-party-visibility case. So in the currently-shipped data
     flow, a receiver (A) never actually reaches `myOutgoingPending` for their own incoming
     delegation — `getMyDirectPending` is what surfaces it to them, via `DirectPendingCard`, which
     has no Recall action at all (`Accept`/`Respond` only, `DirectPendingCard.tsx:56-77`). So while
     the component-level guard is looser on Chores/Senior-Hub than on the parent Hub's own
     backlog, the upstream selector still prevents this from being player-reachable today — it's a
     latent inconsistency (the two looser call sites rely entirely on `getMyOutgoingPending`
     never handing them a row they don't own), not a live exploit path through normal UI taps.
2. If reached anyway (forced call, or a future selector regression makes it reachable): RPC
   rejects "member ... is not the delegator of assignment ..."; `recallParentQuest`
   (`store/choreStore.ts:4507-4543`) rolls back its optimistic `assignedToId`/`status` flip on the
   chore and the assignment row, toasts the generic connection-error message (not the actual
   authorization reason — the client never surfaces the server's specific exception text to the
   user here, just a generic retry prompt).

**Cross-role impact**: None under current selector wiring — B (the actual delegator) keeps their
own `OutgoingPendingCard` and eventual Recall ability untouched; A's own `DirectPendingCard` is
unaffected since A never had a working Recall button to begin with. Worth flagging: the
`QuestsScreen.tsx:1065` / `SeniorView.tsx:918` guard should match `HouseholdBacklogSection.tsx:158`'s
explicit `assignedBy === active.id` check for defense-in-depth, even though it's not currently
exploitable through the selector.

---

### TC-56 — `recall_parent_quest`, already ACCEPTED

**Scenario**: B calls recall on a delegation that has already moved to `ACCEPTED` (recall is only
valid pre-acceptance).

**Step-by-step trace**:
1. Once `respond_to_parent_quest` ACCEPT succeeds, the assignment leaves `myOutgoingPending`
   entirely — `getMyOutgoingPending` (`store/choreStore.ts:5074-5086`) filters to
   `a.status === 'PENDING' || 'SNOOZED' || 'PARKED'`, excluding `ACCEPTED`. So B's
   `OutgoingPendingCard` for this row disappears from the Household Backlog / Chores tab / Senior
   Hub the moment it's accepted, replaced by the chore now showing under `othersAdultQuests` (for
   CoP) or as a live `in_progress` chore card for A. There is no Recall button left to press under
   normal navigation — this is another stale-card-only repro (B has an old screenshot-equivalent
   render still showing the pre-accept card).
2. If forced: RPC rejects "assignment ... is not PENDING (status=ACCEPTED)"; same rollback/toast
   path as TC-55.

**Cross-role impact**: None — A's now-live claimed chore (rendered as `MyAdultQuestCard` for A,
`OthersAdultQuestCard` for CoP per `HouseholdBacklogSection.tsx:110-128`) is completely unaffected
by B's failed recall attempt.

---

### TC-57 — `recall_parent_quest`, already DECLINED, recall again

**Scenario**: B calls recall a second time on a delegation A already declined.

**Step-by-step trace**:
1. Once `respond_to_parent_quest` DECLINE succeeds, `getMyOutgoingPending` again excludes it
   (`status` no longer PENDING/SNOOZED/PARKED) — B's card for this row is gone from the UI the
   moment the decline lands; `respondToParentQuest`'s decline branch also releases the chore back
   to `todo`/unassigned (`store/choreStore.ts:4388-4390`), so it should reappear as an unclaimed
   pool item (`PoolQuestCard` via `sortedUnclaimedPool`, `HouseholdBacklogSection.tsx:174-202`) if
   it was pool-eligible, or simply sit `todo`/unassigned otherwise.
2. Repeat-recall attempt requires a stale card exactly as TC-56; RPC rejects "assignment ... is not
   PENDING (status=DECLINED)"; same generic-toast rollback.

**Cross-role impact**: None — the chore's real, already-reopened state (visible to K/T pool or
sitting unassigned) is unaffected by B's failed repeat recall.

---

### TC-58 — `recall_parent_quest`, nonexistent id

**Scenario**: Recall against an assignment id that doesn't exist.

**Step-by-step trace**: Same shape as TC-51/54 — `recallParentQuest`
(`store/choreStore.ts:4507-4543`) guards on local lookup first (`if (!assignment) { ...; return; }`
at 4508-4512, silent no-op) or, if a stale local row exists, optimistic-flip → RPC "not found" →
rollback → generic toast. Reachable only via a stale/deleted card on `OutgoingPendingCard`'s Recall
button across the same three render sites as TC-55.

**Cross-role impact**: None.

---

### TC-59 — `offer_chore_handoff` to the current assignee (FAIL → VERIFIED-DEPLOYED)

**Scenario**: Per the QA report, offering a chore handoff to the chore's own current assignee had
**no guard at all** originally — a contradictory self-referential state (`assigned_to_id ===
pending_handoff_to`) could be written. Fixed; Pass 3 re-confirmed live: "offering a chore to its
own current assignee correctly raised `chore ... is already assigned to member ...`."

**Step-by-step trace (current, fixed behavior)**:
1. Action origin: handoff offers are created via `CantMakeItSheet`'s "hand it to someone specific"
   flow (per the comment at `features/quests/components/QuestCard.tsx:657-663`), which calls
   `useChoreStore.getState().offerChoreHandoff(choreId, toMemberId, byMemberId, reason)`. The
   picker in that sheet is a member-selection list; nothing in the picker's own filtering
   structurally prevents selecting the chore's current holder as the handoff target (this is a
   server-side, not client-side, guard) — that omission is exactly why the bug existed.
2. `offerChoreHandoff` (`store/choreStore.ts:2433-2452`): optimistically sets
   `pendingHandoffTo`/`pendingHandoffReason`/`pendingHandoffOfferedBy` on the chore locally, fires
   `supabase.rpc('offer_chore_handoff', ...)`. Server now rejects with "chore ... is already
   assigned to member ..."; rollback at line 2449 restores the chore to its pre-tap snapshot;
   `showToast("Couldn't send — check your connection and try again", 'error')` — a generic message
   that doesn't actually explain *why* (the toast text doesn't distinguish "you tried to hand it to
   yourself/current holder" from any other transient failure).
3. Role views: B (the offerer) briefly sees their own `QuestCard` (wherever it renders — Hub's
   `myAdultQuests`/held-chore card, or the Chores tab) reflect a "pending handoff" state via the
   `pendingHandoffTo` field for one optimistic frame, then it reverts to the plain held/in-progress
   card once the rollback lands. The target (who, in this scenario, IS the current holder — i.e.
   the same person as B) sees nothing distinct happen since they're the same actor; there is no
   separate "receiver" role instance triggered.

**Cross-role impact**: None — since offerer and target are the same person in this specific
scenario, there is no second role whose screen could even be affected; the entire interaction is
self-contained to B's own device and reverts cleanly.

---

### TC-60 — `offer_chore_handoff`, nonexistent chore

**Scenario**: Handoff offered against a chore id that no longer exists.

**Step-by-step trace**:
1. `offerChoreHandoff` (`store/choreStore.ts:2433-2452`): guards first on local lookup
   (`const chore = get().chores.find(c => c.id === choreId); if (!chore) return;` at 2434-2435) —
   if the chore was already removed from local state (e.g. deleted elsewhere and realtime-synced
   out), the button tap is a complete no-op, not even reaching the RPC. Only if a stale local copy
   of a since-deleted chore still exists does it optimistically set the handoff fields and then hit
   the RPC's "chore ... not found" rejection, rolling back to the stale (soon-to-be-pruned) local
   copy and toasting the generic "Couldn't send" message.
2. Same `CantMakeItSheet` origin as TC-59.

**Cross-role impact**: None — no chore exists for any role to see either way.

---

### TC-61 — `accept_chore_handoff`, wrong actor

**Scenario**: A member who is not the `pending_handoff_to` target calls `accept_chore_handoff`.

**Step-by-step trace**:
1. Action origin: **"I've got it"** button, `features/quests/components/QuestCard.tsx:863-869`
   (kid/teen Chores tab render) and the identical Hub-side block at `QuestCard.tsx:657-663`'s
   parallel action row — both gated on `{q.pendingHandoffTo === myId && (...)}`. This is a hard
   client-side render gate: a wrong-actor member (someone whose id ≠ `pendingHandoffTo`) never
   sees this button rendered at all for that chore — the row simply displays as a normal chore card
   with no handoff-specific UI from their perspective (or, if `q.assignedToId === thatMember.id`
   too, whatever their own normal in-progress card looks like).
2. `acceptChoreHandoff` (`store/choreStore.ts:2456-2473`) also double-guards client-side:
   `if (!chore || chore.pendingHandoffTo !== memberId) return;` at line 2458 — so even a
   programmatic/forced call from the wrong actor's session is a silent local no-op with zero RPC
   round-trip, since the button that would invoke it structurally can't exist for them. Only a raw
   RPC call (bypassing the app entirely) reaches the server-side "chore ... has no pending handoff
   to member ..." rejection.
3. `myId`/`myQuests` resolution for kid/teen receivers: `features/hub/TeenView.tsx:110` and
   `features/hub/KidView.tsx:232` both include `q.pendingHandoffTo === active.id` in their
   `myQuests` filter — so the *correct* target sees the chore surface in their own list even before
   `assignedToId` moves, but the wrong actor's `myQuests` filter never matches on this chore via
   `pendingHandoffTo` (only if they separately hold `assignedToId`/`assignedToIds`, an unrelated
   reason).

**Cross-role impact**: None — the correct target's pending-offer card/buttons
(`QuestCard.tsx:657-663`/`863-869`) are completely unaffected by a wrong actor's failed/no-op
attempt.

---

### TC-62 — `accept_chore_handoff`, no pending handoff

**Scenario**: `accept_chore_handoff` called on a chore that has no `pending_handoff_to` set at all.

**Step-by-step trace**: Same button/gate as TC-61 — `q.pendingHandoffTo === myId` is `false` for
every member when the field is `null`/`undefined`, so the "I've got it" block never renders for
anyone on that chore. `acceptChoreHandoff`'s own guard (`store/choreStore.ts:2458`) is the same
`chore.pendingHandoffTo !== memberId` check, so this is unreachable through the UI; only a raw RPC
call surfaces the server's identical "no pending handoff" exception.

**Cross-role impact**: None — no card anywhere reflects a handoff state that doesn't exist.

---

### TC-63 — `accept_chore_handoff`, double-accept

**Scenario**: The correct receiver accepts once (succeeds), then a second `accept_chore_handoff`
call is made on the same now-resolved handoff.

**Step-by-step trace**:
1. First accept: A taps "I've got it" (`QuestCard.tsx:863-869` or `:657-663`) →
   `acceptChoreHandoff(q.id, myId)` → optimistic update at `store/choreStore.ts:2459-2465` sets
   `assignedToId: memberId, isPool: false, status: 'todo'`, clears all four `pendingHandoff*`
   fields → RPC succeeds → `showToast("You're on it ✓")` (line 2468). A's card now renders as a
   normal owned chore; the `pendingHandoffTo === myId` block (`QuestCard.tsx:657-663`) no longer
   matches since the field is cleared, so the offer banner and Accept/Decline buttons both
   disappear from A's own card, replaced by whatever the chore's normal in-progress UI is.
2. Second accept attempt (stale second tap, double-render, or a race from another device signed
   into the same member): local guard `chore.pendingHandoffTo !== memberId` at line 2458 is now
   `true` (field is cleared) → **silent local no-op**, doesn't even reach the RPC. Only a forced
   raw RPC call reaches the server's own idempotency rejection.

**Cross-role impact**: None on the second call (it's a no-op); the first call's cross-role effect
(covered under TC-12/13 in the earlier TC range and B.3 of Pass 3) is unaffected — B (original
holder, if different from the offer-target chain) and any other family member's `othersAdultQuests`
/pool view simply now shows the chore under A's name, permanently, regardless of the harmless
second tap.

---

### TC-64 — `decline_chore_handoff`, wrong actor

**Scenario**: A non-target member calls `decline_chore_handoff`.

**Step-by-step trace**: Mirrors TC-61 exactly but for the **"Pass again"** button (the decline
half of the same `{q.pendingHandoffTo === myId && (...)}` block, `QuestCard.tsx:657-663`/`863-869`
— decline action wired via `useChoreStore.getState().declineChoreHandoff(q.id, myId ?? '')`).
`declineChoreHandoff` (`store/choreStore.ts:2477-2494`) has the identical client guard
`if (!chore || chore.pendingHandoffTo !== memberId) return;` at line 2479 — unreachable via UI for
a wrong actor, silent no-op if forced client-side, server-side "no pending handoff" rejection only
via a raw RPC call.

**Cross-role impact**: None — the correct target's pending-offer UI is untouched.

---

### TC-65 — `decline_chore_handoff`, no pending handoff

**Scenario**: Decline called on a chore with no pending handoff at all.

**Step-by-step trace**: Same shape as TC-62, for the decline path. `pendingHandoffTo` is falsy for
everyone, so the Accept/Decline block never renders (`QuestCard.tsx:657-663`); `declineChoreHandoff`'s
own guard blocks any programmatic call the same way. Server-side, a raw RPC call gets the identical
"no pending handoff" exception as TC-62/64.

**Cross-role impact**: None.

---

### TC-66 — `propose_later_date` silently clobbered an existing in-flight proposal (FAIL → VERIFIED-DEPLOYED)

**Scenario**: Originally, a second `propose_later_date` call on a chore that already had a pending
later-date proposal **silently overwrote** the first request with no guard — the first requester's
proposal was lost with no trace. Fixed; Pass 3 re-confirmed live: KidA proposed a later date, then
KidA2 (sibling) proposed a second later date on the same still-pending chore — now correctly raises
"chore ... already has a pending later-date proposal — resolve it first."

**Step-by-step trace (current, fixed behavior)**:
1. First proposal: A (e.g. KidA) uses the "Ask for a later time" flow (`CantMakeItSheet`, the same
   sheet that also drives named handoffs per the TC-59 comment) → calls
   `useChoreStore.getState().proposeLaterDate(choreId, byMemberId, newDate, reason)`.
   `proposeLaterDate` (`store/choreStore.ts:2500-2518`) optimistically sets
   `assignedToId: undefined, isPool: false, pendingLaterDate, pendingLaterReason,
   pendingLaterRequestedBy, pendingLaterRequestedAt` and clears `claimedAt` — this **releases the
   chore from KidA immediately, client-side**, before the RPC even confirms. RPC succeeds.
2. Parent/approver role view: the chore now carries `pendingLaterDate` — per the earlier-range
   trace (TC-15/16/17, already covered by other agents), this surfaces to parents as a pending
   reschedule request needing `approveLaterDate`/`declineLaterDate` action, with `dueDate` itself
   left untouched until approval.
3. Second proposal attempt (by KidA2, a sibling with no special relationship to the first request):
   if KidA2 can even reach the same chore's "ask for later" flow — plausible if the chore is
   pool-eligible or KidA2 has visibility into it via a shared/family view — calling
   `proposeLaterDate` again optimistically re-sets the same fields client-side (overwriting KidA's
   `pendingLaterDate`/`pendingLaterReason`/`pendingLaterRequestedBy` locally, in KidA2's own local
   store, for one frame) before the RPC round-trips. Server now rejects with "already has a pending
   later-date proposal — resolve it first"; the `.then` rollback at
   `store/choreStore.ts:2513-2517` restores the chore to `{ ...chore }` — i.e. **back to KidA's
   original proposal**, not to a blank/unproposed state — and
   `showToast("Couldn't send — check your connection and try again", 'error')` fires on KidA2's
   device. The generic toast text again doesn't tell KidA2 *why* — it reads exactly like a network
   failure, not "someone already asked for a reschedule on this."
4. Role views: KidA2 sees their own attempt flash then revert with a generic error toast. KidA
   (first requester) and the parent/approver's views are completely undisturbed — since the
   second call's write never actually commits, the pending proposal they can see and act on the
   whole time remains KidA's original request, unmodified.

**Cross-role impact**: The fix's practical cross-role effect is that the first requester's (A)
in-flight proposal — and by extension the parent/approver's queue, which is driven off the same
chore row — can no longer be silently clobbered by a second, unrelated proposer; a second
proposer instead gets a rejected/reverted local attempt and an (unhelpfully generic) error toast,
with zero visible disruption to A's or the approving parent's existing view of the request.

---

## Summary of UI-tracing observations across this range

- Every TC in TC-51–65 that models "invalid action, RPC correctly rejects" is, in this app's
  current implementation, **either unreachable through normal UI navigation** (the button/card
  that would trigger it structurally cannot render for the wrong actor, thanks to client-side
  gates like `q.pendingHandoffTo === myId`, `chore.pendingHandoffTo !== memberId`, or
  `getMyLockedItems`'s party filter) **or only reachable via a stale/racing card**, in which case
  the acting role sees a one-frame optimistic flash followed by a silent revert plus a generic
  "Couldn't send / didn't go through — check your connection" toast that never surfaces the
  server's actual, more specific rejection reason.
- New visibility inconsistency noticed while tracing TC-55: `OutgoingPendingCard`'s Recall action
  is gated by `a.status === 'PENDING' && a.assignedBy === active.id` in
  `features/hub/parent/backlog/HouseholdBacklogSection.tsx:158`, but only by `a.status ===
  'PENDING'` (no `assignedBy` check at all) at both `features/quests/QuestsScreen.tsx:1065` and
  `features/hub/SeniorView.tsx:918`. Under the current `getMyOutgoingPending` selector
  (`store/choreStore.ts:5064-5087`) this isn't exploitable — that selector already restricts which
  rows a non-delegator ever receives — but the component-level guard itself is inconsistent across
  the three render sites and should match the strictest one for defense-in-depth, the same
  reasoning that motivated the `p_actor_id`/party-check fixes in TC-48/53/55 themselves.
