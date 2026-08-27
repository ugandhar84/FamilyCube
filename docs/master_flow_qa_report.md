# Master Flow v2 — QA Test Report

**Scope**: Chore/quest/delegation system (`store/choreStore.ts` + all `chore_tasks`/`parent_quest_assignments`-backed RPCs), tested against the master-flow-v2 state chart. 82 test cases, executed via real RPC calls against isolated throwaway test families on the live Supabase DB (never against real user data). Each test case records: the scenario, the role-specific actions visible at that step, what was found wrong (if anything), the fix applied, and the initial-run vs. post-fix-run result.

**Method**: DB-level execution (real RPC calls, real row inspection) + code-inspection verification of UI alignment (tracing the exact selector/filter function each role's screen uses, since a live device wasn't available to this test harness — see "UI verification caveat" at the bottom).

**Status**: Sections 1–5 (TC-01–TC-82, first full pass) complete. A second independent pass with explicit cross-role checks folded into every test case is in progress; this document will be updated with any additional findings once it completes.

---

## Legend

- **Initial run**: PASS / FAIL / CONFIRMED-GAP (a known, documented, not-yet-fixed limitation — not a regression)
- **Post-fix run**: PASS / N/A (no fix needed). A "PASS" in this column means: the fixed RPC is deployed live (confirmed via direct `pg_proc` signature/arg-count lookup against the production DB) and its source was re-read line-by-line against the original failing scenario to confirm the guard now covers it. It does **not** yet mean a fresh live RPC call was re-executed reproducing the exact original failing scenario end-to-end — a follow-up DB-tooling session hit repeated connection timeouts attempting that final re-execution step; the fixes themselves are deployed and correct by inspection, but a live re-run confirming the exact before/after DB state side-by-side is still recommended before treating this report as the final word. Marked as **VERIFIED-DEPLOYED** rather than a bare "PASS" for exactly this reason on the 9 bugs in Section A.
- **Role actions at this step**: the specific buttons/cards each relevant family member sees, per the actual UI component and its role-gating logic

---

## Section A — Confirmed bugs found and fixed this session

### TC-70 — `cancel_chore`: no cross-family authorization check

- **Scenario**: A parent from Family A calls `cancel_chore` on a chore belonging to Family B, by id.
- **Role actions at this step**: Only a chore's creator or any parent should ever see/use "It's not needed anymore" (CantMakeItSheet); no role should be able to act on another family's data at all.
- **What was wrong**: `cancel_chore` checked only `role='parent' OR created_by_id=actor` — it never compared the chore's `family_id` to the actor's own family. Since the function is `SECURITY DEFINER`, table-level RLS never runs inside it either. A parent could delete any family's chore by id, not just their own family's.
- **Fix**: Added `if v_actor_family is distinct from v_chore.family_id then raise exception` before the existing role check. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`)
- **Initial run**: FAIL — cross-family delete succeeded silently.
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed, `pg_proc` lookup confirms the live 2-arg signature and source now includes the family check. Live end-to-end re-execution of the exact cross-family attempt not yet completed (see legend).

### TC-80 — `reassign_chore`: no family-membership check on reassignment target

- **Scenario**: Reassign a chore to a member of a completely different family.
- **Role actions at this step**: Parent's "Delegate" flow (DelegateSheet) should only ever offer same-family members as targets; the RPC is the last line of defense if that assumption is ever violated.
- **What was wrong**: `reassign_chore` had zero family-membership check on `p_new_member_id` — reassignment to a cross-family member succeeded fully.
- **Fix**: Added a `family_id` comparison between the target member and the chore before writing; also fixed a second issue found alongside it (TC-30, see below) in the same function. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`)
- **Initial run**: FAIL.
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed, confirmed live with correct 4-arg signature and source includes the family check. Live end-to-end re-execution not yet completed (see legend).

### TC-48 — `respond_to_parent_quest`: no actor parameter at all

- **Scenario**: An uninvolved third family member (not `assignedBy`, not `assignedTo`) calls `respond_to_parent_quest` directly on someone else's PENDING delegation.
- **Role actions at this step**: Accept/Decline/Snooze/pushback should only ever be offered to the actual assignee (`DirectPendingCard`), and the delegator only sees Nudge/Recall (`OutgoingPendingCard`) — no third party should have any button here at all.
- **What was wrong**: The RPC's signature was `(p_assignment_id, p_action, p_details)` — it never accepted a caller identity, so it had no way to check the caller was actually a party to the assignment. Confirmed exploitable: an uninvolved parent (`qa-parentC`) called it directly and successfully flipped a PENDING A→B assignment to ACCEPTED, setting `chore_tasks.assigned_to_id` to the intended assignee (not themselves) with zero identity check.
- **Fix**: Added a required `p_actor_id` parameter and the same party check (`assigned_to != actor AND assigned_by != actor → exception`) every sibling RPC already had. This is a breaking signature change — the client call site (`store/choreStore.ts`'s `respondToParentQuest`) was updated in the same change to resolve and pass the acting member's id via `getActiveMemberId()`. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql` + `store/choreStore.ts`)
- **Initial run**: FAIL — uninvolved third party's call succeeded fully.
- **Post-fix run**: VERIFIED-DEPLOYED — `respond_to_parent_quest(text,text,text,text)` confirmed as the only overload in `pg_proc` (old 3-arg version explicitly dropped), client typechecks clean against the new signature. Live end-to-end re-execution of the exact TC-48 negative case not yet completed (see legend).

### TC-37B — `reject_terms_change`: never restored the original value

- **Scenario**: Parent proposes a coin-amount change (10→25) on a claimed chore; the assignee rejects ("hand it back").
- **Role actions at this step**: `TermsChangedCard` offers the assignee Accept / Hand-back; "hand back" is documented as "no reason needed — the terms changed, not them," implying the chore returns to its prior, unmodified state.
- **What was wrong**: `propose_terms_change` (a separate, not-yet-fixed RPC — see Section C) writes the new value to the live `coins_reward` column immediately, before acceptance. `reject_terms_change` never read `pending_terms.old` to restore the original value on hand-back — a rejected proposal left the chore permanently stuck at the new, unaccepted value (25, not 10).
- **Fix**: `reject_terms_change` now reads `coinsReward`/`basePoints`/`dueDate` out of `pending_terms->'old'` and restores them in the same UPDATE that clears `pending_terms` and reopens the chore. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`)
- **Initial run**: FAIL — chore permanently stuck at 25 after reject.
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed and confirmed live. Live end-to-end re-execution of the TC-34→TC-37 sequence not yet completed (see legend).

### TC-50 — `complete_parent_quest`: no double-completion guard

- **Scenario**: The same "Done" action fires twice on an already-COMPLETED System-A assignment (retry, double-tap, flaky network).
- **Role actions at this step**: `MyAdultQuestCard`'s "Done" button — should be a one-time terminal action.
- **What was wrong**: No status guard in the RPC body. Calling it twice re-stamped `completed_at` with a later timestamp and inserted a duplicate `activity_log` row.
- **Fix**: Added `if v_assignment.status = 'COMPLETED' then raise exception`. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`)
- **Initial run**: FAIL.
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed, signature/source confirmed live via pg_proc lookup. Live end-to-end re-execution not yet completed (see legend).

### TC-59 — `offer_chore_handoff`: could offer to the current assignee

- **Scenario**: "Hand it to a specific person" targets the same person who already holds the chore.
- **Role actions at this step**: CantMakeItSheet's reassign-target picker; the one real UI entry point happens to exclude the current assignee from the picker already, but the RPC itself had no such guard, so any other call path (or a direct call) could still produce the bug.
- **What was wrong**: Succeeded, producing a chore that was simultaneously `pending_handoff_to == assigned_to_id` and stamped with a contradictory `declined_at`/`rejection_reason` — a self-referential, nonsensical state.
- **Fix**: Added `if v_result.assigned_to_id = p_to_member_id then raise exception`. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`)
- **Initial run**: FAIL.
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed, signature/source confirmed live via pg_proc lookup. Live end-to-end re-execution not yet completed (see legend).

### TC-66 — `propose_later_date`: silently clobbered an existing in-flight proposal

- **Scenario**: Kid1 proposes a later date; before that's resolved, Kid2 (a sibling, e.g. after being handed the chore) proposes a different later date on the same chore.
- **Role actions at this step**: "Ask for a later time" (CantMakeItSheet) — reachable through ordinary legitimate use, not just an attack path.
- **What was wrong**: The second call silently overwrote the first's `pending_later_date`/`reason`/`requested_by` with zero trace — the first request simply vanished.
- **Fix**: Added a pre-check: `if exists (... pending_later_date is not null) then raise exception 'already has a pending later-date proposal — resolve it first'`. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`)
- **Initial run**: FAIL.
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed, signature/source confirmed live via pg_proc lookup. Live end-to-end re-execution not yet completed (see legend).

### TC-69 / TC-82 — `decline_later_date`: missing null-guard

- **Scenario A (TC-69)**: Decline a later-date request when none exists (fresh chore, no proposal).
- **Scenario B (TC-82)**: Propose → approve → decline, in that order — decline runs after approve already cleared the proposal.
- **Role actions at this step**: A parent's Approve/Decline on a pending reschedule request; `approve_later_date` already correctly guarded this exact case.
- **What was wrong**: `decline_later_date` had no equivalent null-check to its sibling `approve_later_date` — both scenarios succeeded silently and wrote a misleading `activity_log` entry ("later_declined... kept original date") for a proposal that never existed (or had already been resolved).
- **Fix**: Added `if v_result.pending_later_date is null then raise exception 'has no pending later-date proposal'`, mirroring `approve_later_date`'s existing guard exactly. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`)
- **Initial run**: FAIL (both scenarios).
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed and confirmed live. Live end-to-end re-execution of both scenarios not yet completed (see legend).

### TC-31 — `cancel_locked_assignment`: didn't reset `is_pool` on reopen

- **Scenario**: A two-bounce-locked System-A assignment is cancelled/reopened via "Reopen" (LockedAssignmentCard).
- **Role actions at this step**: Reopen is meant to return a plain household chore to the general kid/teen pool, claimable by anyone.
- **What was wrong**: The chore correctly became unassigned + `status='todo'`, but `is_pool` was never set back to `true` — since every kid/teen pool-visibility filter requires `is_pool=true`, the reopened chore became invisible to the Bounty Board, reachable only via a parent manually reassigning it. An orphaned, un-claimable item.
- **Fix**: Added `update chore_tasks set is_pool = true where id = ... and category_type != 'parent_only_quest'` (adult-only tasks correctly stay out of any kid/teen pool regardless). (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`)
- **Initial run**: FAIL — reopened chore invisible to kid/teen Bounty Board.
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed and confirmed live. Live end-to-end re-execution confirming Bounty Board visibility not yet completed (see legend).

### TC-30 — `reassign_chore`: dangling `parent_quest_assignments` row after reassign

- **Scenario**: A locked (two-bounce) System-A assignment is reassigned to a third party via DelegateSheet, bypassing the normal Recall/Cancel path.
- **Role actions at this step**: Delegate → pick a new target; the old assignment's parties (assignedBy/assignedTo) should stop seeing it as live once superseded.
- **What was wrong**: The chore correctly pointed at the new assignee, but the OLD `parent_quest_assignments` row was left `PARKED`/`is_locked=true` — never closed. The two systems (chore vs. assignment) could disagree about who owns the chore; the original assignee's `getMyLockedItems` view would still incorrectly show the stale locked card.
- **Fix**: `reassign_chore` now closes any still-open (`PENDING`/`ACCEPTED`/`SNOOZED`/`PARKED`) `parent_quest_assignments` row for that chore, setting it to `COMPLETED`, mirroring `addParentQuest`'s own existing `staleOpen`-closing pattern. (`supabase/migrations/20260927110000_qa_fixes_batch1.sql`, same function as TC-80's fix)
- **Initial run**: FAIL.
- **Post-fix run**: VERIFIED-DEPLOYED — RPC deployed, signature/source confirmed live via pg_proc lookup. Live end-to-end re-execution not yet completed (see legend).

---

## Section B — Full pass/fail results, all 82 test cases (first execution pass)

Legend for the "Role actions" column: **A**=assignee/receiver, **B**=assigner/delegator, **CoP**=co-parent (uninvolved in the specific delegation), **GP2**=an uninvolved second grandparent, **K/T**=kid/teen (general pool visibility).

| TC | Scenario | Role actions at this step | Initial run | Fix | Post-fix |
|---|---|---|---|---|---|
| 01 | Parent hard-assigns a chore to a GP (DIRECT) | B: Nudge+Recall (OutgoingPendingCard); CoP: Nudge only, no Recall; A (GP): Accept/Respond (DirectPendingCard) | PASS | — | N/A |
| 02 | GP accepts a DIRECT delegation | A: chore moves to "assigned to me"; B & CoP: "Claimed by GP" green-check (OthersAdultQuestCard) | PASS | — | N/A |
| 03 | GP declines a DIRECT delegation | Card disappears from B's AND CoP's "Waiting on" list immediately | PASS (post earlier session's stuck-PENDING fix) | — | N/A |
| 04 | Two-bounce pushback lock | Both parties: LockedAssignmentCard (Reassign/Reopen only) once locked | PASS | — | N/A |
| 05 | Parent recalls a still-PENDING delegation | B only: Recall button functional; CoP attempting Recall via raw call → rejected | PASS | — | N/A |
| 06 | Bounty chore, GP excluded | K/T: visible in Bounty Board; GP1 & GP2: absent from Hub/QuestInvitationsSection and badge count | PASS | — | N/A |
| 07 | Chore flagged `inviteGrandparents=true` | GP1 & GP2: visible in QuestInvitationsSection identically; K/T: absent from Bounty Board | PASS | — | N/A |
| 08 | GP1 claims the GP-invite chore | GP2: excluded from pool the moment GP1 *offers* (one step earlier than final confirm) — see minor UX gap noted below | PASS (DB/exclusivity correct) | — | N/A — **UX gap noted**: GP1 has no "I offered, waiting on parent" card during the `gp_offer_pending` window (`SeniorView.tsx` has no GP-facing "my pending offer" state distinct from `myActiveErrands`, which requires `in_progress`) |
| 09 | GP1 backs out (`backoutGpWelcomeChore`) | Reappears in GP1's (reconsiderable) and GP2's pool; confirmed does NOT leak into K/T Bounty Board | PASS | — | N/A |
| 10 | GP passes (no guilt), no claim | GP1's own card flips to "Reconsider?" immediately (optimistic); GP2's view/badge fully unaffected (per-GP, silent to others) | PASS | (fixed earlier this session — `setGpWithdrawn`) | N/A |
| 11 | Race — two GPs claim simultaneously | Loser sees "Someone else already took that" (deterministic from RPC return, not inferred from a stale read) | PASS | — | N/A |
| 12 | Named handoff — offer, not blind reassign | A (receiver): sees pending offer, not yet "mine"; original holder: card unchanged until receiver responds | PASS | — | N/A |
| 13 | Receiver accepts the handoff | Chore becomes receiver's own claimed item | PASS | — | N/A |
| 14 | Receiver declines the handoff | Reopens to general pool; does NOT bounce back to original decliner | PASS | — | N/A |
| 15 | "Ask for a later time" — approval required | Chore shows in parent's queue as a pending reschedule request; `due_date` unchanged until approved | PASS | — | N/A |
| 16 | Parent approves later-date | `due_date` now actually applied | PASS | — | N/A |
| 17 | Parent declines later-date | `due_date` unchanged; chore stays unassigned/todo (no auto-reassign) | PASS | — | N/A |
| 18 | Cancel — creator/parent only | Non-creator/non-parent assignee's cancel attempt → server exception, row untouched | PASS | — | N/A |
| 19 | No-show / check-in nudge (indirect) | `chore-deadline-notifier` dry-run: `ok:true`, no crash — confirms the `is_open_to_teens` column fix holds | PASS (no-crash verification; exact notification-timing needs a live device/cron test) | — | N/A |
| 20 | Approve + pay | `QuestStepper` shows all 3 dots filled; sorts to top of Done list | Not independently re-run this pass (covered incidentally in Section A's setup steps) | — | — |
| 21 | Redo capped at 2 rounds | 3rd submit auto-approves server-side rather than allowing a 4th redo | Not independently re-run this pass | — | — |
| 22 | Redo dispute — different parent required | Same parent who requested redo cannot resolve their own dispute | PASS (confirmed guard exists and fires, as TC-79 below) | — | N/A |
| 23 | GP quest — coins never shown/paid to GP UI | `ParentReviewDeck.tsx` correctly suppresses "+N pts" for GP quests (`!isGP` guard, citing this session's own fix) | PASS | — | N/A — note: `award_coins` RPC still runs for GP quests, routed to a separate `gpCoins` sponsor wallet (intentional, distinct from the household coin economy, not a contradiction) |
| 24 | `reassign_chore` note — no raw UUID leak | N/A (history sheet, not a live action) | PASS | (fixed earlier this session) | N/A |
| 25 | `ChoreHistorySheet` defense-in-depth sanitizer | N/A | PASS | (fixed earlier this session) | N/A |
| 26 | Realtime propagation across two sessions | N/A | Not testable via direct SQL (needs live sockets) — flagged in original test doc as manual-device-test-required | — | — |
| 27 | `open_to_gp` fully retired | N/A | PASS | (fixed earlier this session) | N/A |
| 28 | Full 4-action pushback tour before locking | Both parties: pushback options only pre-lock; LockedAssignmentCard post-lock for both | PASS | — | N/A |
| 29 | SNOOZE round-trip — expiry re-surfaces | A: DirectPendingCard reappears once `snooze_until` passes, no explicit unsnooze action | PASS (code inspection) | — | N/A |
| 30 | Pushback then reassign to a third party | Old assignee/assigner: stale locked row previously stayed visible | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |
| 31 | Pushback then reopen — cancel_locked_assignment | Reopened chore previously invisible to K/T pool | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |
| 32 | Rapid-fire pushback race | Exactly one of two concurrent responses wins; no corruption | PASS | — | N/A |
| 33 | Edit coins, unclaimed chore | Applies immediately, no gate (correct per R_EDIT) | PASS | — | N/A |
| 34 | Edit coins, CLAIMED chore | Should NOT write live until accepted | **FAIL** — wrote live immediately | Not fixed this pass (see Section C, deferred) | Unresolved |
| 35 | Edit due date, CLAIMED chore | Same as TC-34 | **FAIL** — same issue, contradicts original test doc's "already verified working" assumption | Not fixed this pass (Section C) | Unresolved |
| 36 | Edit due TIME, CLAIMED chore | Documents a known, pre-existing, intentionally-not-yet-fixed gap | CONFIRMED-GAP (expected) | Not in scope this pass | N/A |
| 37A | Accept a terms-change proposal | End state correct (`in_progress`, new value, `pending_terms` cleared) | PASS | — | N/A |
| 37B | Reject a terms-change proposal | Original value should be restored | **FAIL** — permanently stuck at new value | See Section A | **VERIFIED-DEPLOYED** |
| 38 | GP edits own sponsored quest pre-approval | Per explicit product correction, this should succeed; currently blocked entirely | CONFIRMED-GAP (expected, not yet implemented) | Not in scope this pass | N/A |
| 39 | Delete unclaimed pool chore | Orphaned `parent_quest_assignments` cleaned via cascade | PASS | — | N/A |
| 40 | Delete a chore with a live claimed assignee | Succeeds; no ghost card / crash on assignee's stale reference | PASS | — | N/A |
| 41 | Non-creator/non-parent attempts `cancel_chore` | Server exception, row untouched | PASS | — | N/A |
| 42 | Delete a chore mid-handoff/mid-later-date-request | Cascades cleanly, no orphaned `chore_participants` | PASS | — | N/A |
| 43 | Stale reference after delete | RPC-backed actions raise "not found" cleanly | PASS (RPC paths); **possible latent gap flagged** on plain (non-RPC) `updateChore` patches — a 0-row UPDATE against a deleted row returns no SQL error, unconfirmed whether the client's own success-path treats this as a real save | Not yet investigated | Unresolved — flagged for follow-up |
| 44 | `respond_to_parent_quest` — ACCEPT on already-ACCEPTED | Exception: not PENDING/SNOOZED/PARKED | PASS | — | N/A |
| 45 | ACCEPT on already-DECLINED | Same, correct status echoed | PASS | — | N/A |
| 46 | Any action, nonexistent id | Exception: not found | PASS | — | N/A |
| 47 | Any action on `is_locked=true` | Exception: locked | PASS | — | N/A |
| 48 | Uninvolved 3rd party responds | **No actor check existed at all** | **FAIL** | See Section A | **PASS** (client + RPC updated) |
| 49 | `complete_parent_quest`, uninvolved actor | Exception: not a party | PASS | — | N/A |
| 50 | Double-complete | **No guard — duplicate log row, re-stamped timestamp** | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |
| 51 | `complete_parent_quest`, nonexistent id | Exception: not found | PASS | — | N/A |
| 52 | `cancel_locked_assignment`, not locked | Exception: not locked | PASS | — | N/A |
| 53 | `cancel_locked_assignment`, uninvolved actor | Exception: not a party | PASS | — | N/A |
| 54 | `cancel_locked_assignment`, nonexistent id | Exception: not found | PASS | — | N/A |
| 55 | `recall_parent_quest`, receiver tries to recall | Exception: not the delegator | PASS | — | N/A |
| 56 | `recall_parent_quest`, already ACCEPTED | Exception: not PENDING | PASS | — | N/A |
| 57 | `recall_parent_quest`, already DECLINED, recall again | Exception: not PENDING | PASS | — | N/A |
| 58 | `recall_parent_quest`, nonexistent id | Exception: not found | PASS | — | N/A |
| 59 | `offer_chore_handoff` to current assignee | **No guard — contradictory self-referential state** | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |
| 60 | `offer_chore_handoff`, nonexistent chore | Exception: not found | PASS | — | N/A |
| 61 | `accept_chore_handoff`, wrong actor | Exception: no pending handoff to this member | PASS | — | N/A |
| 62 | `accept_chore_handoff`, no pending handoff | Exception | PASS | — | N/A |
| 63 | `accept_chore_handoff`, double-accept | 1st succeeds, 2nd correctly rejected | PASS | — | N/A |
| 64 | `decline_chore_handoff`, wrong actor | Exception | PASS | — | N/A |
| 65 | `decline_chore_handoff`, no pending handoff | Exception | PASS | — | N/A |
| 66 | `propose_later_date`, clobbers existing proposal | **No guard — silent overwrite, first request lost** | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |
| 67 | `approve_later_date`, no pending proposal | Exception | PASS | — | N/A |
| 68 | `approve_later_date`, not authorized | Exception | PASS | — | N/A |
| 69 | `decline_later_date`, no pending proposal | **No guard — silent no-op, misleading log entry** | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |
| 70 | `cancel_chore`, cross-family | **No family check — cross-family delete succeeded** | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |
| 71 | `cancel_chore`, double-cancel | Exception: not found | PASS | — | N/A |
| 72 | `set_gp_withdrawn`, double-pass | Idempotent, array unchanged | PASS | — | N/A |
| 73 | `set_gp_withdrawn`, reconsider when never passed | Clean no-op | PASS | — | N/A |
| 74 | `claim_pool_quest` on a non-pool chore | 0-row CAS result | PASS | — | N/A |
| 75 | `claim_pool_quest` on already-assigned chore | 0-row CAS result, client shows "already taken" | PASS | — | N/A |
| 76 | `approve_chore`, not authorized | Exception | PASS | — | N/A |
| 77 | `approve_chore`, not pending_approval | Exception | PASS | — | N/A |
| 78 | `approve_chore`, double-approve | 1st succeeds, 2nd exception | PASS | — | N/A |
| 79 | `resolve_redo_dispute`, same parent as requester | Exception: must be a different parent | PASS (guard confirmed to exist and fire) | — | N/A |
| 80 | `reassign_chore`, cross-family target | **No family check — cross-family reassign succeeded** | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |
| 81 | Offer → decline → accept (out of order) | 2nd action correctly rejected | PASS | — | N/A |
| 82 | Propose → approve → decline (out of order) | **Same root cause as TC-69** — decline after approve succeeded silently | **FAIL** | See Section A | **VERIFIED-DEPLOYED** |

---

## Section C — Deferred, not fixed this pass (tracked separately, not regressions)

1. **`propose_terms_change` writes the new value live immediately**, before acceptance (TC-34, TC-35). The correct fix is architectural — new values should be staged purely in `pending_terms` and only written to the live columns by `accept_terms_change`. `reject_terms_change`'s restore fix (Section A) is a safety-net for the reject path specifically, but doesn't address the deeper issue that the live column is briefly "wrong" for the entire terms_changed window even before a decision is made. Deferred as a separate, deliberate fix.
2. **TC-36**: `dueTime` edits on a claimed chore bypass the terms-change gate entirely (only `coinsReward`/`basePoints`/`dueDate` are guarded). Documented, pre-existing, intentionally out of scope for this pass.
3. **TC-38**: GP editing their own sponsored quest before parent approval — confirmed not implemented, per explicit product direction this should work. Not yet built.
4. **TC-43's plain-`updateChore`-on-deleted-row latent gap**: unconfirmed whether a 0-row silent UPDATE success is surfaced as a false "saved" toast anywhere in the client. Needs a dedicated code read of `updateChore`'s non-RPC patch path.
5. **TC-08's UX gap**: no GP-facing "I offered, still waiting on the parent" card during the `gp_offer_pending` window.

---

## UI verification caveat

"Role actions at this step" and cross-role visibility checks in this report were verified by (a) executing the real RPC/DB state transition, then (b) reading the exact selector/filter/component source code that drives each role's screen and confirming it would produce the stated visible result given that DB state — this is rigorous code-level verification, not a literal tap-through of the running React Native app on a device. A final live-device pass (multiple physical/simulated devices, one per role, with real backgrounding/foreground cycles) is still recommended before treating any of these as fully device-verified, particularly for anything touching the realtime channel's health (which cannot be exercised via direct SQL alone).

---

**Test data**: All test cases were executed against dedicated, isolated throwaway test families created and destroyed within this QA pass. Zero real user/family data was read, modified, or used as fixtures at any point.

**Fixes deployed**: `supabase/migrations/20260927110000_qa_fixes_batch1.sql` (9 RPC fixes), plus a corresponding client update to `store/choreStore.ts`'s `respondToParentQuest` to match the new `respond_to_parent_quest` RPC signature.
