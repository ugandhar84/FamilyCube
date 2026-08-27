# Master Flow — DB-Verified Trace, TC-51 through TC-66

This file DB-verifies the claims in `docs/master_flow_full_role_trace_TC51-66.md` against a
live, throwaway test family (`zzp4c_`-prefixed) on the linked Supabase Postgres instance. Every
RPC below was called for real via `npx supabase db query --linked` (never a raw `UPDATE`), and
the resulting row state was queried directly and compared against the source trace's claims.

**Test family**: `zzp4c_test_family` (`families.id = a697db82-e2ab-4d0b-80c1-e25685acb360`)
Members: `zzp4c_parent1`/`zzp4c_parent2` (parent), `zzp4c_kid1`/`zzp4c_kid2` (kid),
`zzp4c_teen1` (teenager), `zzp4c_senior1` (grandparent).

All test data was deleted at the end of this session — see the Cleanup section for the proof-count
query and result.

---

## Source-code verification: the two flagged open questions

### 1. `OutgoingPendingCard` Recall-button gating — CONFIRMED, still inconsistent

Read directly on this branch (`feat/kitchen-kiosk-mode`); note the source file the trace names,
`features/hub/parent/backlog/HouseholdBacklogSection.tsx`, has since moved to
`features/hub/parent/HouseholdBacklogSection.tsx` (same content, new path) — file paths below are
current-branch, not the trace's paths, but the logic and outcome are identical:

- `features/hub/parent/HouseholdBacklogSection.tsx:158`:
  ```
  onRecall={a.status === 'PENDING' && a.assignedBy === active.id ? () => recallParentQuest(a.id, active.id) : undefined}
  ```
  Strict gate — requires the active member to actually be the delegator.

- `features/quests/QuestsScreen.tsx:1065`:
  ```
  onRecall={a.status === 'PENDING' ? () => recallParentQuest(a.id, activeMember!.id) : undefined}
  ```
  Loose gate — `assignedBy` is never checked at all.

- `features/hub/SeniorView.tsx:918`:
  ```
  onRecall={a.status === 'PENDING' ? () => { ...; recallParentQuest(a.id, active.id); } : undefined}
  ```
  Also loose — same omission.

**Verdict: CONFIRMED, not stale.** The inconsistency the trace describes is real and still present
in the current source. As the trace notes, it is not currently player-reachable because
`getMyOutgoingPending` (`store/choreStore.ts:5064-5087`, confirmed present at those line numbers)
already scopes rows to `assignedBy === memberId` before either loose render site ever sees them —
so the component-level looseness is latent, not exploitable through today's selector wiring. It
should still be fixed for defense-in-depth, matching the strict site.

### 2. Optimistic-write-then-rollback pattern — CONFIRMED for all four functions

Read `store/choreStore.ts` directly (current line numbers differ slightly from the trace's, which
was written against a different branch state):

- `respondToParentQuest` (`store/choreStore.ts:4330-4432`): optimistic `set()` at 4381-4397 before
  the RPC call at 4399; on `{ error }`, rollback at 4403-4406 restores `prevAssignment`/`prevChore`.
  One deviation from the trace: the actual toast text on rollback is **"That didn't go through —
  someone else may have already responded. Pull to refresh and try again."** (line 4407), not the
  generic "check your connection" text the trace's summary implies applies uniformly — this
  function's toast is more specific than the others.
- `completeParentQuest` (`store/choreStore.ts:4434-4473`): optimistic `set()` at 4442-4448 before
  RPC at 4450; rollback at 4454-4457 restores `assignment`/`prevChore`; generic "check your
  connection" toast at 4458. Matches trace.
- `cancelLockedAssignment` (`store/choreStore.ts:4475-4501`): optimistic `set()` at 4482-4488
  before RPC at 4489; rollback at 4493 restores `assignment`; generic toast at 4494. Matches trace.
- `recallParentQuest` (`store/choreStore.ts:4513-4549`): optimistic `set()` at 4521-4526 before RPC
  at 4527; rollback at 4531-4534 restores `assignment`/`prevChore`; generic toast at 4535. Matches
  trace.

**Verdict: CONFIRMED** — all four do optimistic-write-then-conditional-rollback exactly as
described, reached by reading the exact function bodies (no live race condition needed). The one
correction: `respondToParentQuest`'s rollback toast text is not the generic string used by the
other three.

---

## TC-51 — `complete_parent_quest`, nonexistent id

**Scenario**: Call `complete_parent_quest` against an assignment id that doesn't exist.

**RPC call**: `select complete_parent_quest('zzp4c_nonexistent_id','zzp4c_parent1');`

**Result**: `ERROR: P0001: assignment zzp4c_nonexistent_id not found` (raised at function line 8).

**Per-role view**:
- Actor (whoever's stale card triggered this): if the client's local `parentAssignments` cache
  still had a copy of the row, they'd see a one-frame "done" flash on their own card, then a
  revert plus the generic "That didn't go through" toast (per the confirmed rollback pattern
  above). If the local cache had already pruned the row, `completeParentQuest`'s own guard
  (`store/choreStore.ts` — `if (!assignment) { ...; return; }`) fires first: a silent no-op, no
  RPC round-trip, no toast.
- All other roles: unaffected — the server-side write never happened.

**Verdict: CONFIRMED.** RPC rejection message and behavior match the trace exactly.

---

## TC-52 — `cancel_locked_assignment`, not locked

**Scenario**: Call `cancel_locked_assignment` on an assignment where `is_locked = false`.

**Setup**: `parent_quest_assignments` row `zzp4c_asn_52` — `assigned_by=zzp4c_parent1`,
`assigned_to=zzp4c_parent2`, `status='PENDING'`, `is_locked=false`.

**RPC call**: `select cancel_locked_assignment('zzp4c_asn_52','zzp4c_parent1');`

**Result**: `ERROR: P0001: assignment zzp4c_asn_52 is not locked` (function line 15).

**Per-role view**:
- Actor (parent1, if reached via a stale `LockedAssignmentCard`): optimistic flip to
  `DECLINED`/`unlocked` for one frame, then rollback + generic toast — this card structurally
  cannot render in the current UI for a non-locked row (`getMyLockedItems` filters strictly on
  `isLocked`), so this is stale-card-only in practice.
- Other roles: unaffected, row's real state untouched.

**Verdict: CONFIRMED.**

---

## TC-53 — `cancel_locked_assignment`, uninvolved actor

**Scenario**: A member who is neither `assigned_to` nor `assigned_by` calls
`cancel_locked_assignment` on a locked assignment.

**Setup**: `parent_quest_assignments` row `zzp4c_asn_53` — `assigned_by=zzp4c_parent1`,
`assigned_to=zzp4c_senior1`, `status='PARKED'`, `is_locked=true`. `zzp4c_parent2` is the
uninvolved third party.

**RPC call**: `select cancel_locked_assignment('zzp4c_asn_53','zzp4c_parent2');`

**Result**: `ERROR: P0001: member zzp4c_parent2 is not a party to assignment zzp4c_asn_53`
(function line 12).

**Per-role view**:
- parent2 (uninvolved): no `LockedAssignmentCard` for this row exists in their UI at all —
  `getMyLockedItems(memberId)` requires `assignedTo === memberId || assignedBy === memberId`, and
  parent2 is neither. Reachable only via a forced/raw RPC call, exactly as the trace states.
- parent1 (B) and senior1 (A): their own cards for this row are untouched — the reject means the
  row never actually unlocked.

**Verdict: CONFIRMED.**

---

## TC-54 — `cancel_locked_assignment`, nonexistent id

**Scenario**: Same action against an id that doesn't exist.

**RPC call**: `select cancel_locked_assignment('zzp4c_nonexistent_id2','zzp4c_parent1');`

**Result**: `ERROR: P0001: assignment zzp4c_nonexistent_id2 not found` (function line 9).

**Per-role view**: Same shape as TC-51 — stale-local-row-only reachability, silent no-op if the
local cache already pruned the row, optimistic-flash-then-revert-plus-toast otherwise.

**Verdict: CONFIRMED.**

---

## TC-55 — `recall_parent_quest`, receiver tries to recall

**Scenario**: The receiver (A) of a still-PENDING delegation calls `recall_parent_quest` on their
own incoming assignment.

**Setup**: `parent_quest_assignments` row `zzp4c_asn_55` — `assigned_by=zzp4c_parent1` (B),
`assigned_to=zzp4c_parent2` (A), `status='PENDING'`.

**RPC call**: `select recall_parent_quest('zzp4c_asn_55','zzp4c_parent2');` (A recalling their own
incoming delegation)

**Result**: `ERROR: P0001: member zzp4c_parent2 is not the delegator of assignment zzp4c_asn_55`
(function line 11).

**Per-role view**:
- A (parent2, receiver): per the confirmed source-read above, A's own `DirectPendingCard` (which
  is what actually surfaces this row to them via `getMyDirectPending`) has no Recall action at
  all — `Accept`/`Respond` only. A never has a working Recall button to press through normal
  navigation regardless of which render site's gate is in play.
- B (parent1, delegator): their own `OutgoingPendingCard` and eventual Recall ability are
  untouched.

**Verdict: CONFIRMED** — both the RPC-level rejection and the UI-reachability analysis (including
the flagged QuestsScreen/SeniorView gating inconsistency, see section above) hold on live source
and a live RPC call.

---

## TC-56 — `recall_parent_quest`, already ACCEPTED

**Scenario**: B calls recall on a delegation already `ACCEPTED`.

**Setup**: `parent_quest_assignments` row `zzp4c_asn_56` — `assigned_by=zzp4c_parent1`,
`assigned_to=zzp4c_parent2`, `status='ACCEPTED'`.

**RPC call**: `select recall_parent_quest('zzp4c_asn_56','zzp4c_parent1');`

**Result**: `ERROR: P0001: assignment zzp4c_asn_56 is not PENDING (status=ACCEPTED)` (function
line 14).

**Per-role view**: B's `OutgoingPendingCard` for this row is already gone from their UI the moment
acceptance landed (`getMyOutgoingPending` excludes non-PENDING/SNOOZED/PARKED statuses) — this is
reachable only via a stale card. A's now-live claimed chore is completely unaffected by B's failed
attempt.

**Verdict: CONFIRMED.**

---

## TC-57 — `recall_parent_quest`, already DECLINED, recall again

**Scenario**: B calls recall a second time on a delegation A already declined.

**Setup**: `parent_quest_assignments` row `zzp4c_asn_57` — `assigned_by=zzp4c_parent1`,
`assigned_to=zzp4c_parent2`, `status='DECLINED'`.

**RPC call**: `select recall_parent_quest('zzp4c_asn_57','zzp4c_parent1');`

**Result**: `ERROR: P0001: assignment zzp4c_asn_57 is not PENDING (status=DECLINED)` (function
line 14).

**Per-role view**: Same shape as TC-56 — B's card for this row disappeared from
`getMyOutgoingPending` the moment the decline landed; repeat-recall is stale-card-only.

**Verdict: CONFIRMED.**

---

## TC-58 — `recall_parent_quest`, nonexistent id

**RPC call**: `select recall_parent_quest('zzp4c_nonexistent_id3','zzp4c_parent1');`

**Result**: `ERROR: P0001: assignment zzp4c_nonexistent_id3 not found` (function line 8).

**Verdict: CONFIRMED.**

---

## TC-59 — `offer_chore_handoff` to the current assignee (FAIL → VERIFIED-DEPLOYED)

**Scenario**: Offer a handoff on a chore to its own current assignee (self-referential state).

**Setup**: `chore_tasks` row `zzp4c_chore_59` — `assigned_to_id='zzp4c_kid1'`,
`status='in_progress'`.

**RPC call**: `select offer_chore_handoff('zzp4c_chore_59','zzp4c_kid1','zzp4c_kid1','testing self-handoff');`

**Result**: `ERROR: P0001: chore zzp4c_chore_59 is already assigned to member zzp4c_kid1`
(function line 12).

**Per-role view**: Offerer and target are the same person in this scenario, so there is no second
role's screen to affect; the actor sees the optimistic `pendingHandoffTo` flash then revert with
the generic "Couldn't send" toast, per the confirmed rollback pattern.

**Verdict: CONFIRMED — this guard is live and deployed exactly as the trace's
"VERIFIED-DEPLOYED" tag claims.**

---

## TC-60 — `offer_chore_handoff`, nonexistent chore

**RPC call**: `select offer_chore_handoff('zzp4c_chore_nonexistent','zzp4c_teen1','zzp4c_kid1','test');`

**Result**: `ERROR: P0001: chore zzp4c_chore_nonexistent not found` (function line 9).

**Verdict: CONFIRMED.**

---

## TC-61 — `accept_chore_handoff`, wrong actor

**Scenario**: A member who is not `pending_handoff_to` calls `accept_chore_handoff`.

**Setup**: `chore_tasks` row `zzp4c_chore_61` — offered from kid2 to teen1 via
`offer_chore_handoff('zzp4c_chore_61','zzp4c_teen1','zzp4c_kid2','busy')` (succeeded,
`pending_handoff_to='zzp4c_teen1'`).

**RPC call**: `select accept_chore_handoff('zzp4c_chore_61','zzp4c_kid1');` (kid1, wrong actor)

**Result**: `ERROR: P0001: chore zzp4c_chore_61 has no pending handoff to member zzp4c_kid1`
(function line 12).

**Per-role view**: kid1 (wrong actor) never sees the "I've got it" button at all — hard client-side
render gate on `q.pendingHandoffTo === myId`. teen1 (correct target)'s own pending-offer UI is
completely unaffected by kid1's failed/no-op attempt.

**Verdict: CONFIRMED.**

---

## TC-62 — `accept_chore_handoff`, no pending handoff

**Setup**: `chore_tasks` row `zzp4c_chore_62` — `pending_handoff_to IS NULL`.

**RPC call**: `select accept_chore_handoff('zzp4c_chore_62','zzp4c_kid1');`

**Result**: `ERROR: P0001: chore zzp4c_chore_62 has no pending handoff to member zzp4c_kid1`
(function line 12) — identical exception shape to TC-61, confirming the trace's claim these two
cases hit the exact same server-side guard.

**Verdict: CONFIRMED.**

---

## TC-63 — `accept_chore_handoff`, double-accept

**Setup**: `chore_tasks` row `zzp4c_chore_63` — offered from kid2 to kid1 via
`offer_chore_handoff('zzp4c_chore_63','zzp4c_kid1','zzp4c_kid2','swap please')`.

**Step 1 — first accept**: `select accept_chore_handoff('zzp4c_chore_63','zzp4c_kid1');` →
succeeded. Resulting row: `assigned_to_id='zzp4c_kid1'`, `is_pool=false`, `status='todo'`,
`claimed_at` set, all four `pending_handoff_*` fields cleared to null.

**Step 2 — second accept (same actor, same chore)**:
`select accept_chore_handoff('zzp4c_chore_63','zzp4c_kid1');` →
`ERROR: P0001: chore zzp4c_chore_63 has no pending handoff to member zzp4c_kid1` (function
line 12) — since the first accept already cleared `pending_handoff_to`.

**Per-role view**: kid1's card after the first accept shows the offer banner/Accept/Decline
buttons gone (field cleared), replaced by their normal in-progress chore UI. The second attempt is
a silent local no-op on any real client (guard `chore.pendingHandoffTo !== memberId` at
`store/choreStore.ts:2458`); this direct RPC call bypassed that client guard to confirm the
server's own idempotency rejection independently.

**Verdict: CONFIRMED.**

---

## TC-64 — `decline_chore_handoff`, wrong actor

**Setup**: `chore_tasks` row `zzp4c_chore_64` — offered from kid1 to teen1 via
`offer_chore_handoff('zzp4c_chore_64','zzp4c_teen1','zzp4c_kid1','cant do it')`.

**RPC call**: `select decline_chore_handoff('zzp4c_chore_64','zzp4c_senior1');` (senior1, wrong
actor)

**Result**: `ERROR: P0001: chore zzp4c_chore_64 has no pending handoff to member zzp4c_senior1`
(function line 12).

**Verdict: CONFIRMED.**

---

## TC-65 — `decline_chore_handoff`, no pending handoff

**Setup**: `chore_tasks` row `zzp4c_chore_65` — `pending_handoff_to IS NULL`.

**RPC call**: `select decline_chore_handoff('zzp4c_chore_65','zzp4c_kid1');`

**Result**: `ERROR: P0001: chore zzp4c_chore_65 has no pending handoff to member zzp4c_kid1`
(function line 12).

**Verdict: CONFIRMED.**

---

## TC-66 — `propose_later_date`, second proposal on an already-pending chore — **MISMATCH FOUND (regression)**

**Scenario per trace**: "Originally, a second `propose_later_date` call on a chore that already
had a pending later-date proposal silently overwrote the first request with no guard... Fixed;
Pass 3 re-confirmed live: KidA proposed a later date, then KidA2 (sibling) proposed a second later
date on the same still-pending chore — now correctly raises 'chore ... already has a pending
later-date proposal — resolve it first.'"

**Setup**: `chore_tasks` row `zzp4c_chore_66` — `assigned_to_id='zzp4c_kid1'`,
`status='in_progress'`, `category_type='standard'`, `is_pool=false`.

**Step 1 — first proposal (KidA = kid1)**:
```
select propose_later_date('zzp4c_chore_66','zzp4c_kid1','2026-09-01','KidA needs later time');
```
Succeeded. Resulting row: `assigned_to_id=NULL`, `status='todo'`, **`is_pool=true`** (confirmed —
this part of the earlier fix, `is_pool = (category_type is distinct from 'parent_only_quest')`, is
correctly live in `propose_later_date`'s current definition), `pending_later_date='2026-09-01'`,
`pending_later_reason='KidA needs later time'`, `pending_later_requested_by='zzp4c_kid1'`.

**Step 2 — second proposal (KidA2 = kid2), same chore, first proposal still pending**:
```
select propose_later_date('zzp4c_chore_66','zzp4c_kid2','2026-09-05','KidA2 also wants later');
```
**This call SUCCEEDED — no exception was raised.** Resulting row (re-queried directly):
`pending_later_date='2026-09-05'`, `pending_later_reason='KidA2 also wants later'`,
`pending_later_requested_by='zzp4c_kid2'` — **KidA's original proposal (2026-09-01, "KidA needs
later time", requested by kid1) was silently overwritten with zero trace**, exactly reproducing
the *original, pre-fix* bug the trace claims was fixed.

**Root cause identified**: two migrations both touch `propose_later_date` via
`create or replace function`, and the later one clobbered the earlier one's fix:
- `supabase/migrations/20260927110000_qa_fixes_batch1.sql` (section 6) added the guard:
  ```sql
  if exists (select 1 from public.chore_tasks where id = p_chore_id and pending_later_date is not null) then
    raise exception 'chore % already has a pending later-date proposal — resolve it first', p_chore_id;
  end if;
  ```
- `supabase/migrations/20260927150000_fix_later_date_orphan.sql` (a later timestamp, applied
  after) redefines the **entire function** to fix the unrelated `is_pool` orphan bug, but its
  `create or replace function public.propose_later_date(...)` body does **not** include the
  clobber-guard block at all — it was dropped when the function was rewritten, since that
  migration's author was focused solely on the `is_pool` fix and used `create or replace` (which
  fully replaces the function body) rather than an `ALTER FUNCTION`-style patch.

Both migrations are present in the repo and both appear to have been applied in order (the
currently-deployed function has the `is_pool` fix but not the clobber-guard), confirmed by reading
`pg_proc.prosrc` directly for the live function on the linked project — it matches
`20260927150000_fix_later_date_orphan.sql`'s body exactly, with no guard clause present.

**Per-role impact of the live bug**: A parent/approver's queue is silently rewired mid-flight —
whoever approves next approves KidA2's request, not KidA's, and KidA has no signal their original
ask ever existed. KidA's `pendingLaterDate`-driven local view would show the same overwritten
values once resynced (their own optimistic local copy briefly disagrees with the server, then gets
overwritten by the next realtime/poll sync to match KidA2's values instead). Cross-role damage is
worse than the trace assumes: the trace states "the fix's practical cross-role effect is that the
first requester's in-flight proposal ... can no longer be silently clobbered" — this is currently
**false** on the live database.

**Verdict: MISMATCH.** The trace's TC-66 claim ("Fixed; Pass 3 re-confirmed live... now correctly
raises...") does not hold against the currently deployed `propose_later_date` function. This is a
live regression, most likely introduced when `20260927150000_fix_later_date_orphan.sql` redefined
the function without preserving the earlier migration's clobber-guard. Recommend re-adding the
`pending_later_date is not null` guard to the current function body (the `is_pool` fix and the
clobber-guard are not mutually exclusive — both can coexist in one function).

---

## Summary

| TC | Verdict |
|----|---------|
| 51 | CONFIRMED |
| 52 | CONFIRMED |
| 53 | CONFIRMED |
| 54 | CONFIRMED |
| 55 | CONFIRMED |
| 56 | CONFIRMED |
| 57 | CONFIRMED |
| 58 | CONFIRMED |
| 59 | CONFIRMED |
| 60 | CONFIRMED |
| 61 | CONFIRMED |
| 62 | CONFIRMED |
| 63 | CONFIRMED |
| 64 | CONFIRMED |
| 65 | CONFIRMED |
| 66 | **MISMATCH — live regression, clobber-guard missing from deployed `propose_later_date`** |
| Recall-button gating (flagged issue) | CONFIRMED — inconsistency real, not exploitable today |
| Optimistic-write-then-rollback (flagged issue) | CONFIRMED for all four functions |

15 of 16 numbered test cases confirmed exactly against live DB behavior. One confirmed mismatch:
TC-66's clobber-guard is not present in the currently deployed `propose_later_date` function,
despite the trace (and the earlier migration) claiming it was fixed — a `create or replace
function` in a later migration silently dropped the guard while fixing an unrelated bug.

---

## Cleanup

All `zzp4c_`-prefixed rows created for this verification pass were deleted at the end of the
session:

```sql
delete from parent_quest_assignments where id like 'zzp4c_%';
delete from chore_participants where chore_id like 'zzp4c_%';
delete from activity_log where entity_id like 'zzp4c_%';
delete from chore_tasks where id like 'zzp4c_%';
delete from members where id like 'zzp4c_%';
delete from families where id = 'a697db82-e2ab-4d0b-80c1-e25685acb360';
```

**Proof-count query and result** (run after cleanup):

```sql
select
  (select count(*) from families where id = 'a697db82-e2ab-4d0b-80c1-e25685acb360') as families,
  (select count(*) from members where id like 'zzp4c_%') as members,
  (select count(*) from chore_tasks where id like 'zzp4c_%') as chore_tasks,
  (select count(*) from parent_quest_assignments where id like 'zzp4c_%') as assignments,
  (select count(*) from chore_participants where chore_id like 'zzp4c_%') as participants,
  (select count(*) from activity_log where entity_id like 'zzp4c_%') as activity_log;
```

Result: `{"families": 0, "members": 0, "chore_tasks": 0, "assignments": 0, "participants": 0,
"activity_log": 0}` — zero rows remain across every table touched by this test pass.
