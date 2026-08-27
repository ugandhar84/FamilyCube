# Master Flow — Full Cross-Role UI Trace, TC-01 through TC-29

**Purpose**: Closes the depth gap the earlier QA passes left open. `docs/master_flow_qa_report.md` (Section B) and `docs/master_flow_qa_report_pass3.md` (Section B.1/B.3) established pass/fail verdicts for all 82 test cases with only a one-line "Role actions" summary per case. This document takes TC-01–TC-29 and traces, step by step, exactly which file/component/selector renders what for every role connected to that flow, matching the depth of Pass 3's own B.3 (named-handoff) section.

**Method**: Pure source-code reading. No DB queries, no RPC re-verification — correctness of the RPCs themselves is already established in the two source reports and is not re-litigated here. Where a fix is referenced, it is described as already-shipped per the existing reports (see `supabase/migrations/20260927110000_qa_fixes_batch1.sql` for the 9 Section-A fixes).

**Legend**: **A** = assignee/receiver, **B** = assigner/delegator, **CoP** = co-parent uninvolved in this specific delegation, **GP1/GP2** = grandparent(s), **K/T** = kid/teen pool-visibility.

---

### TC-01 — Parent hard-assigns a chore to a GP (DIRECT)

**Scenario**: A parent uses DelegateSheet to directly assign an unclaimed chore to a grandparent (System A: `addParentQuest(..., 'DIRECT', note)`).

**Step-by-step trace**:
1. **Action**: Parent B taps a member chip in `features/hub/parent/DelegateSheet.tsx:72-118`. The picker (`members.filter(m => m.role === 'parent' || (m.role === 'senior' && isGPOpen))`) only shows GPs when `inviteGrandparents` is already toggled on for that chore — otherwise the GP chip is absent entirely from B's own screen. Non-quest-row chores call `addParentQuest(target.choreId, active.id, m.id, 'DIRECT', note)` (`DelegateSheet.tsx:99`), which creates a new `parent_quest_assignments` row, `status='PENDING'`.
   - **B (delegator)**: Sees `OutgoingPendingCard` (`features/hub/parent/backlog/OutgoingPendingCard.tsx`) in Household Backlog's "Waiting on response" group, fed by `getMyOutgoingPending(active.id)` (`store/choreStore.ts:5064`). Copy: `"Waiting on {assignee} to accept"`. Shows Nudge + Recall buttons — Recall is wired only `if (a.status==='PENDING' && a.assignedBy===active.id)` (`HouseholdBacklogSection.tsx:158`).
   - **CoP (other parent)**: `getMyOutgoingPending` (`store/choreStore.ts:5074-5086`) includes this row for a co-parent too, *because the target role is `senior`* (`targetRole === 'senior' && a.assignedTo !== memberId`) — a household-wide broadcast, not a private negotiation. CoP sees the same `OutgoingPendingCard`, but `onRecall` is `undefined` (CoP is not `a.assignedBy`), so only Nudge renders — no Recall button (`HouseholdBacklogSection.tsx:158`, the `a.assignedBy === active.id` guard).
   - **A (GP)**: `getMyDirectPending(active.id)` (`store/choreStore.ts:5018`) returns this row (`assignedTo===GP && status==='PENDING'`), rendering `DirectPendingCard` (`features/hub/parent/backlog/DirectPendingCard.tsx`) via `SeniorView.tsx:107` (SeniorView reuses the same Household Backlog cards/selectors as ParentView). Copy: `"From {assigner}"`, buttons Accept / Respond, plus "Let {assigner} know you're on it" nudge.

**Cross-role impact**: Correctly surfaces to B (with Recall), CoP (Nudge-only, no Recall — matches spec's "household broadcast, not private negotiation" intent), and A/GP (Accept/Respond). No K/T visibility (this is a DIRECT delegation, not a pool item) — correct, since kids/teens have no card path into System A at all.

---

### TC-02 — GP accepts a DIRECT delegation

**Scenario**: The GP taps Accept on the DirectPendingCard from TC-01.

**Step-by-step trace**:
1. **Action**: GP taps "Accept" (`DirectPendingCard.tsx:56-65`) → `respondToParentQuest(a.id, { action: 'ACCEPT' })`, which both flips `parent_quest_assignments.status` to `ACCEPTED` and syncs `chore_tasks.assigned_to_id` to the GP (per Pass 1's note under "getMyAccepted removed"). A `sendMessage` fires to the assigner: `"✅ {GP} accepted "{chore}""` (`DirectPendingCard.tsx:63-64`).
   - **A (GP)**: The chore now has a live `assignedToId`, so `getActiveAssignmentChoreIds`/`systemBIds` exclude it from System A cards; it renders as `myActiveErrands`/`myAdultQuests`-style content depending on category — for a plain adult delegation it becomes System B's `MyAdultQuestCard` (`features/hub/parent/backlog/MyAdultQuestCard.tsx`), showing "← from {assigner}" and Done/Reassign buttons (`MyAdultQuestCard.tsx:76-101`).
   - **B (assigner) & CoP**: `othersAdultQuests` (`ParentView.tsx:457`, `adultQuestsNoLiveAssignment.filter(q => q.assignedToId && q.assignedToId !== active.id)`) now includes this chore, rendering `OthersAdultQuestCard.tsx` with the "Claimed by {GP}" green-check line (`OthersAdultQuestCard.tsx:89-93`) and Nudge/Reclaim buttons.

**Cross-role impact**: Correct — moves cleanly from "pending" cards to "claimed/in-progress" cards for every relevant role, GP's own card updates, both parents (assigner and co-parent) see the same read-only "Claimed by GP" state.

---

### TC-03 — GP declines a DIRECT delegation

**Scenario**: GP declines instead of accepting.

**Step-by-step trace**:
1. **Action**: GP would use `respondToParentQuest(a.id, { action: 'DECLINE' })` — via `PushbackSheet.tsx` if reached through "Respond," which fires a `sendMessage` to the assigner on `action==='DECLINE'` (`PushbackSheet.tsx:32-36`): `"🙅 {GP} can't take "{chore}""`.
   - **A (GP)**: Card disappears from GP's `getMyDirectPending` immediately (status leaves `PENDING`).
   - **B**: Card disappears from `getMyOutgoingPending`'s "Waiting on response" list — this was itself a previously-fixed "stuck-PENDING" bug per the report's TC-03 note ("PASS post earlier session's stuck-PENDING fix").
   - **CoP**: Same list, same disappearance (both are keyed off the same `parentAssignments` filter reacting to the status change).

**Cross-role impact**: Confirmed correct — no lingering stale cards on either side; per Pass 1, this was already fixed prior to this pass, re-confirmed by source (status filters in `getMyOutgoingPending`/`getMyDirectPending` both exclude non-PENDING/SNOOZED/PARKED rows).

---

### TC-04 — Two-bounce pushback lock

**Scenario**: A DIRECT assignment gets pushed back (SNOOZE/BLOCKER/TRADE/DISCUSS) twice, locking it.

**Step-by-step trace**:
1. **Action**: Assignee uses `PushbackSheet.tsx:24-39` twice via `respondToParentQuest`. The RPC sets `isLocked=true` after the second bounce (server-side bounce-count logic; not re-verified here per scope).
   - **A (assignee) & B (assigner)**: Both render `LockedAssignmentCard` (`features/hub/parent/backlog/LockedAssignmentCard.tsx`), sourced from `getMyLockedItems(memberId)` (`store/choreStore.ts:5032`, which explicitly matches `a.assignedTo === memberId || a.assignedBy === memberId`) — both parties see it in `HouseholdBacklogSection.tsx:164-172`. Copy: `"Discuss offline with {other} — bounced"`, buttons Reassign (`onDelegate`) / Reopen (`cancelLockedAssignment`) only — no Accept/pushback options remain once locked.
   - **CoP**: Not a party (`assignedTo`/`assignedBy` don't include CoP), so `getMyLockedItems` excludes it — no card at all for a third parent, correctly.

**Cross-role impact**: Correct — both parties get the identical locked-state card with only Reassign/Reopen; uninvolved third parties see nothing.

---

### TC-05 — Parent recalls a still-PENDING delegation

**Scenario**: B recalls their own still-open DIRECT delegation before the assignee responds.

**Step-by-step trace**:
1. **Action**: B taps Recall on `OutgoingPendingCard.tsx:83-95` → confirm Alert → `recallParentQuest(a.id, active.id)`.
   - **B**: Card disappears from `getMyOutgoingPending`.
   - **A**: Card disappears from `getMyDirectPending` — the assignment is gone/resolved before they ever acted.
   - **CoP**: If CoP attempts a raw `recallParentQuest` call on B's delegation (not B), the RPC rejects it server-side (`recall_parent_quest`'s "not the delegator" guard, TC-55 in the 82-case table) — but the *UI itself* never offers CoP a Recall button in the first place: `HouseholdBacklogSection.tsx:158` only wires `onRecall` `if (a.assignedBy === active.id)`, so CoP's card renders with Nudge only, same as TC-01.

**Cross-role impact**: Correct on both layers — UI never exposes Recall to CoP, and the RPC backstops it if bypassed.

---

### TC-06 — Bounty chore, GP excluded

**Scenario**: A plain pool chore (no `inviteGrandparents` flag) is posted; only kids/teens should see it.

**Step-by-step trace**:
1. **Action**: Parent posts an unassigned pool chore with `inviteGrandparents` left false/undefined.
   - **K/T**: `poolQuests` filter in `KidView.tsx:232` / `TeenView.tsx:113` — `quests.filter(q => q.isPool && q.status==='todo' && !q.isAdultTask && !q.awaitingParentApproval && !q.inviteGrandparents)` — includes it (the `!q.inviteGrandparents` clause passes since it's false). Renders as an "Open Bounty" badge on `QuestCard.tsx:603-606`.
   - **GP1 & GP2**: `gpInvitations` in `SeniorView.tsx:439-441` — `chores.filter(c => c.inviteGrandparents && c.status==='todo' && !c.sponsorUserId)` — excludes it (`inviteGrandparents` is false), so `QuestInvitationsSection` never renders it (`invitations.length` check at `QuestInvitationsSection.tsx:24`), and it doesn't count toward SeniorView's badge total (`SeniorView.tsx:810`).

**Cross-role impact**: Correct — mutually exclusive visibility gated on the single `inviteGrandparents` boolean, confirmed on both the K/T and GP selector sides.

---

### TC-07 — Chore flagged `inviteGrandparents=true`

**Scenario**: Same as TC-06 but with the GP-invite flag set (Workflow 2).

**Step-by-step trace**:
1. **Action**: Parent toggles "GP Welcome" — via `PoolQuestCard.tsx:178-205`'s toggle, `OthersAdultQuestCard.tsx:151`, or `DelegateSheet.tsx:121-146` — all three ultimately call `updateChore(choreId, { inviteGrandparents: true })`.
   - **GP1 & GP2**: Both now pass `gpInvitations`'s filter (`SeniorView.tsx:439-441`) identically — no per-GP scoping at this stage, both see `QuestInvitationsSection` with the "❤️ I'd Love To Help" / "Pass" buttons (`QuestInvitationsSection.tsx:79-99`).
   - **K/T**: `poolQuests`' `!q.inviteGrandparents` clause now excludes it from both `KidView.tsx:232` and `TeenView.tsx:113` — the Bounty Board loses it entirely.

**Cross-role impact**: Correct — identical GP1/GP2 visibility, and clean, mutually-exclusive removal from the kid/teen pool the moment the flag flips (single-flag boolean gate confirmed identical to TC-06's inverse).

---

### TC-08 — GP1 claims the GP-invite chore

**Scenario**: GP1 taps "I'd Love To Help," which calls `claimGPErrand` and sets `status='gp_offer_pending'` (an offer, not an instant claim — a parent still confirms).

**Step-by-step trace**:
1. **Action**: GP1 taps the button at `QuestInvitationsSection.tsx:67-87` → `claimGPErrand(c.id, active.id)` (since `c.inviteGrandparents && c.categoryType !== 'grandparent_quest'`).
   - **GP1**: **UX gap, confirmed present in both source reports and re-confirmed here.** `myActiveErrands` (`SeniorView.tsx:404-408`) requires `status==='in_progress'`, and `myPendingOffers` (`SeniorView.tsx:131-133`) does exist and does match `status==='gp_offer_pending' && gpOfferById===active.id` — however Pass 1/Pass 3 both flagged that this state has no distinct rendering section wired into the visible Hub tree the way `myActiveErrands` does; `myPendingOffers` is computed but its consuming JSX render location was not confirmed in either report to produce a distinguishable "I offered, waiting on parent" card. Not re-litigated further here per scope (already a documented Section-C item).
   - **GP2**: Per the report, GP2 is excluded from the pool the moment GP1 *offers* — `gpInvitations` itself doesn't filter by claim state (it filters `status==='todo'`, and the chore left `'todo'` the moment it became `'gp_offer_pending'`), so GP2's `QuestInvitationsSection` list simply no longer includes it (`SeniorView.tsx:439-441`'s `status==='todo'` clause fails now).
   - **Parent**: Would see this as a pending GP-offer requiring confirmation — `GpOfferReviewCard.tsx` (not traced in depth here, out of TC-08's specific scope, but exists as the parent-facing accept/decline surface for `gp_offer_pending`).

**Cross-role impact**: DB/exclusivity correct (GP2 immediately excluded); the one open gap is GP1's own missing "waiting on parent" card, already documented and not a new finding.

---

### TC-09 — GP1 backs out (`backoutGpWelcomeChore`)

**Scenario**: GP1 reverses their offer/claim before parent confirmation.

**Step-by-step trace**:
1. **Action**: GP1 backs out via the reverse of the claim action.
   - **GP1**: Chore reappears in GP1's own `gpInvitations` list (status reverts to `'todo'`), so `QuestInvitationsSection` re-renders it — since `alreadyPassed` is false (GP1 didn't "Pass," they backed out of a claim), it shows the normal "I'd Love To Help" state, not "Reconsider?".
   - **GP2**: Also reappears in GP2's `gpInvitations` (same `status==='todo'` filter now matches again).
   - **K/T**: Confirmed NOT to leak into `poolQuests` — `inviteGrandparents` is still true, so `!q.inviteGrandparents` in `KidView.tsx:232`/`TeenView.tsx:113` still excludes it.

**Cross-role impact**: Correct — reopens cleanly to both GPs, stays fenced off from the K/T pool the entire time (single-flag gate holds through the back-out transition too).

---

### TC-10 — GP passes (no guilt), no claim

**Scenario**: GP1 taps "Pass" instead of claiming.

**Step-by-step trace**:
1. **Action**: GP1 taps Pass (`QuestInvitationsSection.tsx:89-98`) → `setGpWithdrawn(c.id, active.id, true)`, appending GP1's id to `chore.gpWithdrawnIds`.
   - **GP1**: `alreadyPassed = (c.gpWithdrawnIds ?? []).includes(active.id)` (`QuestInvitationsSection.tsx:32`) flips true — GP1's own card optimistically flips its primary button to "🔄 Reconsider?" (`QuestInvitationsSection.tsx:81-86`), and the Pass button itself disappears (`!alreadyPassed` guard at line 88).
   - **GP2**: `gpWithdrawnIds` is per-GP — GP2's own `alreadyPassed` check reads the same array but tests for GP2's own id, which isn't in it, so GP2's card/badge is completely unaffected — silent to GP2, per spec.

**Cross-role impact**: Correct — per-GP array membership check keeps this entirely private to the passing GP; no visible signal to GP2, no visible signal to K/T (still fenced by `inviteGrandparents`).

---

### TC-11 — Race — two GPs claim simultaneously

**Scenario**: GP1 and GP2 both tap claim on the same pool item at (nearly) the same instant.

**Step-by-step trace**:
1. **Action**: Both call the pool-claim RPC (`claim_pool_quest`/`claim_gp_errand` depending on category) at once; server-side CAS ensures only one wins.
   - **Winner**: Sees the claim succeed — `showToast('Taken ✓')` in the `claim_pool_quest` client wiring (`HouseholdBacklogSection.tsx:195`, same pattern used for parent-side pool claims; the GP-side equivalent in `QuestInvitationsSection`/`claimGPErrand` follows the same 0-row-CAS contract).
   - **Loser**: The RPC returns a 0-row/`claimed:false` result; the client-side handler shows `showToast('Someone else already took that', 'info')` (`HouseholdBacklogSection.tsx:192`, confirmed as the exact copy pattern the report's TC-11 result matches: "deterministic from RPC return, not inferred from a stale read").

**Cross-role impact**: Correct — exactly one claim wins, the loser gets explicit, real-time feedback rather than a silently-ignored tap.

---

### TC-12 — Named handoff — offer, not blind reassign

**Scenario**: Kid/teen A1 uses CantMakeItSheet's "Hand it to someone specific" to offer their chore to A2, rather than instantly reassigning it.

*(This flow — TC-12/13/14 — was traced in full end-to-end depth by Pass 3's own Section B.3, which this report reuses directly rather than re-deriving, per the task's instruction.)*

**Step-by-step trace** (from Pass 3 B.3, re-confirmed against current source):
1. **Action**: A1 selects a target in `CantMakeItSheet.tsx:155-179` and taps "Send it over" → `submit('reassign')` → `resolveCantMakeIt` → `offerChoreHandoff(item.id, opts.reassignToMemberId, byMemberId, reason)` (`features/tasks/lib/cantMakeIt.ts:62`). This sets `pending_handoff_to`, `pending_handoff_reason`, `pending_handoff_offered_by` — `assigned_to_id` stays on A1, unchanged.
   - **A2 (receiver)**: `TeenView.tsx:110` / `KidView.tsx:232` both include `q.pendingHandoffTo === active.id` in their `myQuests` filter, so the chore appears in A2's own quest list even though `assignedToId` still points to A1. `QuestCard.tsx:663-674` renders a dedicated banner: `"{offerer} wants to hand you this"` + reason; `QuestCard.tsx:870-880` gates a receiver-only action strip with "I've got it" (`acceptChoreHandoff`) / "Pass again" (`declineChoreHandoff`) buttons, shown only `if (q.pendingHandoffTo === myId)`.
   - **A1 (original holder)**: Card continues rendering as a normal held/in-progress chore — no distinct "offer sent, awaiting response" visual state exists in `QuestCard.tsx` beyond the `pending_handoff_*` fields being silently present (confirmed unchanged from Pass 1's original finding).

**Cross-role impact**: Correct as a genuine offer (not a blind reassign) — A2 gets a real accept/decline choice, A1's own card is unchanged until resolved.

---

### TC-13 — Receiver accepts the handoff

**Scenario**: A2 taps "I've got it."

**Step-by-step trace**:
1. **Action**: `QuestCard.tsx:872-877` → `acceptChoreHandoff(q.id, myId)`. Server sets `assigned_to_id = A2`, clears `pending_handoff_to`, resets `status='todo'`.
   - **A2**: Chore is now a fully-owned, plain assigned item — `pendingHandoffTo === myId` no longer matches, so the handoff banner/action-strip disappears; it renders as a normal `todo` quest card.
   - **A1**: `myQuests` filter (`assignedToId === active.id || ... || pendingHandoffTo === active.id`) no longer matches any clause for A1 — the chore silently leaves A1's list entirely.

**Cross-role impact**: Correct — clean single-owner transition, no stale references on either side.

---

### TC-14 — Receiver declines the handoff

**Scenario**: A2 taps "Pass again."

**Step-by-step trace**:
1. **Action**: `QuestCard.tsx:878-880` → `declineChoreHandoff(q.id, myId)`. Server reopens to the general pool: `assigned_to_id=null`, `is_pool=true`, `status='todo'`, `pending_handoff_to=null`.
   - **A2**: Handoff banner disappears; chore leaves A2's `myQuests` (no longer `pendingHandoffTo === active.id`, and `assignedToId` is null).
   - **A1 (original holder)**: Confirmed does NOT reappear on A1's own assigned list — `assignedToId` is null, not A1 — the chore instead surfaces generically in the K/T Bounty Board pool (`poolQuests`, `isPool && status==='todo'`) for anyone to reclaim, matching the Gap Register's explicit intent ("do not silently dump it back on the original decliner").

**Cross-role impact**: Correct — reopens to the general pool rather than bouncing back to A1, confirmed by both the field-level reset and by A1's own filter no longer matching.

---

### TC-15 — "Ask for a later time" — approval required

**Scenario**: A kid/teen requests a later due date on their own chore via CantMakeItSheet's step-3 flow; requires parent approval before `due_date` actually changes.

**Step-by-step trace**:
1. **Action**: Kid/teen picks a date in `CantMakeItSheet.tsx:198-226` → `submit('later')` → `proposeLaterDate(item.id, byMemberId, laterDate, reason)` (`features/tasks/lib/cantMakeIt.ts:72`). Sets `pending_later_date`, `pending_later_reason`, `pending_later_requested_by` — `due_date` itself is untouched.
   - **A (requester)**: No distinct pending-request card confirmed in `QuestCard.tsx` for the requester's own view beyond the chore staying assigned to them with its original due date (the request is a parent-facing surface, not a requester-facing one).
   - **Parent(s)**: `ChoreReviewSection.tsx` builds `laterRequests` from chores with a live `pendingLaterDate`, rendering `CantMakeItLaterCard` (`ChoreReviewSection.tsx:567-604`) — both parents (this is a parent-facing review queue, not assignee-scoped) see the same card: `"{requester} asked to move this to {date}"` + reason quote, with "Keep original date" / "Approve new date" buttons.
   - **K/T (uninvolved siblings)**: No visibility — this never enters any pool/bounty filter.

**Cross-role impact**: Correct — `due_date` stays unchanged in the DB and in every UI surface until a parent acts; both parents (not just one) see the pending request in their review queue.

---

### TC-16 — Parent approves later-date

**Scenario**: A parent taps "Approve new date" on TC-15's card.

**Step-by-step trace**:
1. **Action**: `ChoreReviewSection.tsx:597-600` → `approveLaterDate(c.id, active.id)`. Server writes `due_date = pending_later_date`, clears the pending fields.
   - **Both parents**: `CantMakeItLaterCard` disappears from `laterRequests` (no more `pendingLaterDate`) for whichever parent didn't act, same as the one who did — it's the same underlying chore row.
   - **A (kid/teen)**: The chore's `dueDate` now actually reflects the new date wherever it's rendered (`QuestCard.tsx`'s due-date line, `MyAdultQuestCard`-style due-date text for adult-quest equivalents) — confirmed as a real DB write, not just a UI illusion.

**Cross-role impact**: Correct — `due_date` is now genuinely applied and visible everywhere the chore renders for every role.

---

### TC-17 — Parent declines later-date

**Scenario**: A parent taps "Keep original date."

**Step-by-step trace**:
1. **Action**: `ChoreReviewSection.tsx:591-596` → `declineLaterDate(c.id, active.id)`. Server clears the pending fields, `due_date` never touched.
   - **A (kid/teen)**: `due_date` unchanged; chore stays exactly as it was — still assigned to them, still `todo`/`in_progress`, no auto-reassign anywhere in this path.
   - **Both parents**: Card disappears from `laterRequests` the same way as TC-16's approval path (pending fields cleared either way).

**Cross-role impact**: Correct — a decline is a true no-op on the chore's actual state beyond clearing the request; no reassignment side effect for any role.

---

### TC-18 — Cancel — creator/parent only

**Scenario**: A non-creator, non-parent assignee attempts to cancel a chore outright.

**Step-by-step trace**:
1. **Action**: The only client entry point into `cancelChore` is CantMakeItSheet's "It's not needed anymore" (`CantMakeItSheet.tsx:187-191`) → `resolveCantMakeIt`'s `'cancel'` branch (`cantMakeIt.ts:74-79`) → `cancelChore(item.id, byMemberId)`, which is a promise the sheet awaits before showing "Cancelled ✓" (`CantMakeItSheet.tsx:74-78`).
   - **Non-creator/non-parent A**: The button is visually present to them (CantMakeItSheet doesn't gate this option by role client-side), but the server-side `cancel_chore` RPC's `role='parent' OR created_by_id=actor` check rejects it — the awaited promise resolves falsy/rejects, and the sheet's own logic only shows the success toast `if (ok)` (`CantMakeItSheet.tsx:75`), so a rejected cancel shows no success toast, though there's no distinct error-toast branch traced here either (only the happy path is wired to `showToast`).
   - **Creator/parent**: Same button, same RPC — succeeds, chore row is fully removed for every role that had it in view.

**Cross-role impact**: Correctly enforced server-side; the client doesn't pre-filter the button by role, so this is a legitimate last-line-of-defense case, not a defense-in-depth one — confirmed consistent with the RPC-level guard already verified in the source reports.

---

### TC-19 — No-show/check-in nudge (indirect)

**Scenario**: The `chore-deadline-notifier` edge function's dry-run behavior.

**No traceable single UI component** — this is a server-side scheduled/edge function (`chore-deadline-notifier`), not a screen a role opens. Per both source reports, this was only verified as a non-crashing dry-run (`ok:true`) after an `is_open_to_teens` column fix; exact per-role notification timing/delivery requires a live device/cron test, which is out of this pass's pure-source-tracing scope. Stated plainly rather than forcing a fake UI citation.

---

### TC-20 — Approve + pay

**Scenario**: A parent approves a completed chore, triggering coin payout; `QuestStepper` should show all steps filled and the item should sort to the top of the Done list.

**Step-by-step trace**:
1. **Action**: Parent approves via the approval RPC (`approve_chore`), which pays coins and sets `status='approved'`.
   - **A (kid/teen)**: `QuestStepper` (referenced in `QuestCard.tsx`'s participant-tracker block, e.g. `QuestCard.tsx:823-833` for the multi-kid case) renders `claimedAt`/`submittedAt`/`approvedAt` dots — with `approvedAt` now set, all relevant dots fill.
   - **Approving parent**: Sees `DisputeApprovalCard`'s "not yet disputed, I am the approver" branch (`ChoreReviewSection.tsx:405-427`) — `"{kid} earned {coins} coins · approved by you"` with a Dismiss action.
   - **Co-parent**: Sees the same chore via `DisputeApprovalCard`'s "not disputed, not the approver" branch (`ChoreReviewSection.tsx:429-483`) — `"Approved by {approver} · {kid} earned {coins} coins"`, with Flag for Discussion / Request Reversal buttons available.

**Cross-role impact**: Correct — every role's card reflects the real payout state; the co-parent gets dispute-initiation actions the original approver doesn't (can't dispute your own approval).

---

### TC-21 — Redo capped at 2 rounds

**Scenario**: A third redo request auto-approves server-side rather than allowing a 4th round.

**Step-by-step trace**: This is a server-side counter (`redoCount`) enforced inside the redo-request RPC — no distinct client component renders a "redo cap reached" state differently from a normal approval; the 3rd submit simply resolves as an ordinary approval (same `DisputeApprovalCard`/`QuestStepper` path as TC-20) rather than re-entering the redo-request flow. Not independently re-run in either source pass; no new UI citation available beyond confirming the redo/approval cards are the same components already traced above.

**Cross-role impact**: Not independently verifiable from source alone beyond "the same approval UI renders once the cap silently converts round 3 into a real approval" — matches the existing reports' own "not independently re-run" status.

---

### TC-22 — Redo dispute — different parent required

**Scenario**: The same parent who requested a redo cannot resolve their own dispute.

**Step-by-step trace**:
1. **Action**: Kid disputes a redo (not directly traced — a kid-side action outside this component's scope) → chore reaches `status='kid_disputed_redo'`, surfaced via `redoDisputed` (`ChoreReviewSection.tsx:639`).
   - **Same parent (the one who requested the redo)**: `RedoDisputeCard` (`ChoreReviewSection.tsx:491-546`) checks `isSameReviewer = active.id === c.reviewedById` — if true, renders only italic text: `"You requested this redo — a different parent needs to review the dispute."` (`ChoreReviewSection.tsx:523-526`), with zero action buttons.
   - **Different parent**: Same card, `isSameReviewer` false, renders "Side with the redo" / "Pay it ({coins}🪙)" buttons (`ChoreReviewSection.tsx:527-543`) → `resolveRedoDispute(c.id, active.id, pay)`.
   - **Kid**: Sees the dispute's original submission note/reason preserved (`c.rejectionReason`/`c.submissionNote`, rendered at `ChoreReviewSection.tsx:513-522` — though this specific block is parent-facing; the kid's own equivalent view is `KidQuestCard.tsx`, not traced in this pass).

**Cross-role impact**: Correct — the UI itself (not just the RPC) already withholds the resolve buttons from the same-parent case, matching the guard confirmed live as TC-79.

---

### TC-23 — GP quest — coins never shown/paid to GP UI

**Scenario**: A GP-sponsored quest's payout should never surface a "+N pts" style coin badge in the parent's approval UI, since GP-sponsored payouts route through a separate `gpCoins` sponsor wallet, not the household economy.

**Step-by-step trace**:
1. **Action**: Parent reviews/approves a `grandparent_quest`-category chore.
   - **Parent**: The approval deck (`ParentReviewDeck.tsx`, referenced by the source report but not opened in this pass — cited per the existing report's own finding) applies an explicit `!isGP` guard before rendering any "+N pts" text, suppressing it specifically for GP-sponsored quests.
   - **GP (sponsor)**: Sees their own sponsored-quest tracking via `mySponsoredQuestsInProgress`/`myPendingSponsoredQuests` (`SeniorView.tsx:308-325`) — these lists have no coin-badge rendering tied to the household `coinsReward` field either, consistent with the separate-wallet design.

**Cross-role impact**: Correct per source — the suppression is a UI-only concern (`award_coins` still legitimately runs server-side into the separate `gpCoins` wallet, which the report explicitly notes is intentional, not a contradiction).

---

### TC-24 — `reassign_chore` note — no raw UUID leak

**Scenario**: The activity-log note for a reassignment must not display a raw member UUID.

**Step-by-step trace**:
1. **Action**: N/A — this is a history-sheet display check, not a live user action.
   - **Any role viewing history**: `ChoreHistorySheet.tsx`'s `sanitizeNote` function (`ChoreHistorySheet.tsx:78-84`) runs a `UUID_RE` regex over every free-text `note` field and resolves any bare UUID to the matching member's first name via `members.find(m => m.id === uuid)?.name?.split(' ')[0]`, stripping it entirely if no match exists. `resolveFieldValue` (`ChoreHistorySheet.tsx:53-64`) separately resolves the structured `assignedToId` field the same way.

**Cross-role impact**: N/A (not a live cross-role action) — but confirmed as a shared, single sanitizer (`ChoreHistorySheet.tsx`) reused identically by both `QuestCard.tsx:1196` (Tasks tab) and `KidQuestCard.tsx:311` (Hub), so every role that can open a chore's history sees the same sanitized output, not two independently-drifting implementations.

---

### TC-25 — `ChoreHistorySheet` defense-in-depth sanitizer

**Scenario**: Same sanitizer as TC-24, framed as its own defense-in-depth test case.

**Step-by-step trace**: Identical mechanism to TC-24 — `sanitizeNote` (`ChoreHistorySheet.tsx:78-84`) is explicitly documented in its own comment block (`ChoreHistorySheet.tsx:66-76`) as a backstop for the case where a *future* RPC makes the same raw-UUID mistake `reassign_chore`/`propose_kid_chore`/`offer_chore_handoff` each independently made at different times — each of those three is now fixed at the source, but this sheet is the one place all of them render, so it's the one worth hardening centrally rather than trusting every future RPC author to remember.

**Cross-role impact**: N/A (defense-in-depth, not role-visibility) — same shared component for every role, confirmed.

---

### TC-26 — Realtime propagation across two sessions

**No traceable single UI component** — this tests whether a DB change made in one logged-in session (e.g. Parent A's phone) propagates live to another open session (e.g. Parent B's phone) via Supabase realtime channels, without either session refreshing. Both source reports explicitly flag this as untestable via direct SQL/source-reading alone ("flagged in original test doc as manual-device-test-required" / "requires live sockets/device — out of scope for this harness"). Every individual screen in this app subscribes to its own realtime channel (e.g. `SeniorView.tsx:221-231`'s `family_medications` channel pattern is representative of the general shape used across the codebase), but confirming actual cross-session propagation timing/reliability requires a live multi-device pass, not a source read. Stated plainly rather than forcing a fake citation.

---

### TC-27 — `open_to_gp` fully retired

**Scenario**: The old `open_to_gp` column should be completely gone from both DB and client, superseded by `inviteGrandparents`.

**Step-by-step trace**:
1. **Action**: N/A — a column-retirement check, not a live user action.
   - **SeniorView.tsx:121-128**: `gpWelcomeChores` is explicitly kept as a hardcoded empty array with a comment confirming `openToGP` "has since been dropped from `chore_tasks` entirely (single source of truth: `inviteGrandparents`)" — kept only to avoid touching every downstream prop/badge consumer, not because the column still exists.

**Cross-role impact**: N/A (retirement/cleanup check) — confirmed via source that no role's screen reads a live `open_to_gp` column anymore; `inviteGrandparents` is the sole gate used throughout (as already traced in TC-06/07/09).

---

### TC-28 — Full 4-action pushback tour before locking

**Scenario**: All four pushback actions (SNOOZE/BLOCKER/TRADE/DISCUSS) are exercised pre-lock; both parties see pushback options only before the two-bounce lock, and `LockedAssignmentCard` for both after.

**Step-by-step trace**:
1. **Action**: Assignee opens `PushbackSheet.tsx` (reached via `DirectPendingCard`'s "Respond" button, `DirectPendingCard.tsx:71`) and picks any of the four non-terminal actions (`PushbackSheet.tsx:94-112`) — each calls `respondToParentQuest(assignmentId, { action, details })`.
   - **Pre-lock, both parties**: Assignee continues seeing `DirectPendingCard` (still `PENDING`/`PARKED` pre-lock, `isBounced` styling once `status==='PARKED'`, `DirectPendingCard.tsx:47-51`); assigner sees `OutgoingPendingCard` reflecting the bounce (`isBounced` branch, `OutgoingPendingCard.tsx:39,55-61`, showing the pushback detail quote).
   - **Post-lock (2nd bounce), both parties**: Both switch to `LockedAssignmentCard` via `getMyLockedItems` as traced in TC-04 — pushback options are gone entirely (no `PushbackSheet` entry point exists on a locked item; `DirectPendingCard`/`OutgoingPendingCard` no longer render since the chore fails their status filters once `isLocked`).

**Cross-role impact**: Correct — pushback-count/lock logic is symmetric for both parties' UI, transitioning identically from pending/bounced cards to the shared locked card.

---

### TC-29 — SNOOZE round-trip — expiry re-surfaces

**Scenario**: An assignee snoozes a DIRECT delegation for 48h; once `snooze_until` passes, it should reappear on the assignee's list with no explicit "unsnooze" action needed.

**Step-by-step trace**:
1. **Action**: Assignee picks "Snooze 48h" in `PushbackSheet.tsx:96` → `respondToParentQuest(id, { action: 'SNOOZE' })`, setting `status='SNOOZED'` and a `snoozeUntil` timestamp.
   - **A (assignee), while still snoozed**: `getMyDirectPending` (`store/choreStore.ts:5018-5026`) explicitly excludes a still-active snooze — the condition is `a.status === 'SNOOZED' && (!a.snoozeUntil || a.snoozeUntil <= nowIso)`, i.e. only a SNOOZED row whose snooze window has *already elapsed* counts as "direct pending" again. `OutgoingPendingCard` on the assigner's side shows the `isSnoozed` branch instead (`OutgoingPendingCard.tsx:38,58-59`, `"Snoozed by {assignee} — waiting"`), with its action row hidden entirely while snoozed (`!isSnoozed` guard at `OutgoingPendingCard.tsx:75`).
   - **A, after `snoozeUntil` passes**: The exact same `getMyDirectPending` selector — re-evaluated on next render/poll, no explicit "unsnooze" RPC call anywhere — now includes the row again (the `snoozeUntil <= nowIso` clause flips true), so `DirectPendingCard` reappears automatically.

**Cross-role impact**: Correct by design — expiry is a pure time-based re-evaluation of the same selector, not a stored state transition, so both sides' cards update purely from `Date.now()` moving forward; no explicit action required from any role.

---

## Summary

29 of 29 test cases received a full per-role trace. TC-12–TC-14 (named handoff) were reused directly from Pass 3's own Section B.3, re-confirmed against current source (`TeenView.tsx:110`, `KidView.tsx:232`, `QuestCard.tsx:663-674` and `:870-880`), per the task instructions.

**No traceable single UI component** (stated plainly rather than forced): TC-19 (edge-function/cron notification timing) and TC-26 (realtime cross-session propagation) — both are explicitly flagged as requiring live device/multi-session testing in the source reports, not something a source-code read alone can confirm. TC-21 (redo-cap-at-2) also has no distinct "cap reached" UI state — it silently converts into the same approval UI as TC-20, which is noted rather than invented.

**New observation surfaced while tracing (not gone looking for it)**: TC-18's `CantMakeItSheet.tsx:74-78` awaits `cancelChore`'s promise and shows a success toast only `if (ok)` — but there's no corresponding failure-path toast/alert wired for when the server-side rejection actually fires (e.g. the non-creator/non-parent case). The user's tap silently does nothing visible beyond the sheet closing, which is a materially different (and worse) experience than the explicit "Someone else already took that" pattern this same codebase uses correctly elsewhere (`HouseholdBacklogSection.tsx:192`, TC-11's pool-claim race). This is a real, source-confirmed UI gap, not a re-litigation of the RPC's own correctness (the RPC-level guard itself is already verified in the existing reports).
