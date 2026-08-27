# Master Flow — DB-Verified, TC-30 through TC-50

This document verifies the claims in `docs/master_flow_full_role_trace_TC30-50.md`
against a REAL Supabase database — every RPC below was actually invoked (never a
raw UPDATE standing in for one), and every resulting row state was queried
directly and compared to the source trace's claim.

**Test family** (all rows `zzp4b_`-prefixed, throwaway, deleted at the end):

| Member id | DB `role` | Notes |
|---|---|---|
| `zzp4b_parent1` | `parent` | |
| `zzp4b_parent2` | `parent` | |
| `zzp4b_kid1` | `child` | |
| `zzp4b_kid2` | `child` | |
| `zzp4b_teen1` | `teenager` | |
| `zzp4b_senior1` | `grandparent` | |

Family id: `270da587-bc84-41a8-8f13-b99a705f793e` (`families.name = 'zzp4b_test_family'`).

Note on DB role strings: the app's in-memory `MemberRole` union (`parent | kid |
teen | senior`) is translated at the Supabase boundary in `store/familyStore.ts`
— the actual `members.role` column values are `parent | child | teenager |
grandparent`. Fixture rows were created using the real DB-column values.

All RPCs were called via `npx supabase db query --linked`, one at a time
(concurrent calls destabilized the CLI's temp-login role and tripped a
connection circuit-breaker, so every RPC call and every verification SELECT
here ran strictly sequentially).

---

### TC-30 — Pushback then reassign to a third party — **CONFIRMED**

**Scenario**: parent1 delegates `zzp4b_tc30_chore` to parent2 via a
`parent_quest_assignments` row. Two `respond_to_parent_quest(..., 'DISCUSS', ...)`
bounces (one from each side) lock it (`bounce_count=2`, `is_locked=true`,
`status=PARKED`). parent1 then calls `reassign_chore` to hand the chore to a
third party, senior1, bypassing Recall/Cancel entirely.

**Steps + exact RPC calls**:
1. `insert into parent_quest_assignments (...) values ('zzp4b_tc30_pqa', 'zzp4b_tc30_chore', 'zzp4b_parent1', 'zzp4b_parent2', 'delegate', 'PENDING')`
2. `respond_to_parent_quest('zzp4b_tc30_pqa','zzp4b_parent2','DISCUSS','bounce 1')` → `status=PARKED, bounce_count=1, is_locked=false`
3. `respond_to_parent_quest('zzp4b_tc30_pqa','zzp4b_parent1','DISCUSS','bounce 2')` → `status=PARKED, bounce_count=2, is_locked=true`
4. `reassign_chore('zzp4b_tc30_chore','zzp4b_senior1','zzp4b_parent1','TC30 reassign to third party')`

**Resulting row state** (queried directly after step 4):
- `chore_tasks` (`zzp4b_tc30_chore`): `status=todo`, `assigned_to_id=zzp4b_senior1`, `is_pool=false`
- `parent_quest_assignments` (`zzp4b_tc30_pqa`, the OLD row): `status=COMPLETED`, `is_locked=true` (unchanged, kept as historical record), `bounce_count=2` — NOT left dangling at `PARKED`/`is_locked=true`.

**Per-role breakdown**:
- **parent1** (original assigner): the old locked assignment's `LockedAssignmentCard` disappears from Household Backlog — `getLiveAssignmentForChore`'s live-set (`{PENDING,ACCEPTED,PARKED,SNOOZED}`) no longer matches the now-`COMPLETED` row. Confirmed: row really is `COMPLETED`, outside that set.
- **parent2** (original assignee): same disappearance, symmetric — same row, same live-set check.
- **senior1** (new third-party assignee): the chore is now `assigned_to_id=zzp4b_senior1`, `status=todo` — a fresh, non-locked delegation. No `parent_quest_assignments` row exists yet for senior1 on this chore (only `chore_tasks.assigned_to_id` was rewritten by `reassign_chore`) — they'd see this via whatever card renders a freshly-reassigned chore, not `DirectPendingCard` (which is `parent_quest_assignments`-driven) — this is a `chore_tasks`-level reassignment, not a new System-A delegation row.
- **kid1/kid2/teen1**: uninvolved, no visibility into System-A backlog cards at all.

**Verdict**: CONFIRMED. The stale `PARKED`/locked row is correctly closed to `COMPLETED` rather than left dangling — this is the exact TC-30 regression fix, and it holds live.

---

### TC-31 — Pushback then reopen — `cancel_locked_assignment` — **CONFIRMED**

**Scenario**: Same two-bounce lock pattern, but instead of reassigning, one
party calls `cancel_locked_assignment` to reopen the chore back to the pool.

**Steps + exact RPC calls**:
1. `insert into chore_tasks (...) values ('zzp4b_tc31_chore', category_type='household_chore', is_pool=false, status='in_progress', assigned_to_id='zzp4b_parent2')`
2. `insert into parent_quest_assignments (...) values ('zzp4b_tc31_pqa', ...)`
3. `respond_to_parent_quest('zzp4b_tc31_pqa','zzp4b_parent2','DISCUSS','b1')` → `PARKED, bounce_count=1`
4. `respond_to_parent_quest('zzp4b_tc31_pqa','zzp4b_parent1','DISCUSS','b2')` → `PARKED, bounce_count=2, is_locked=true`
5. `cancel_locked_assignment('zzp4b_tc31_pqa','zzp4b_parent2')`

**Resulting row state**:
- `parent_quest_assignments` (`zzp4b_tc31_pqa`): `status=DECLINED`, `is_locked=false`
- `chore_tasks` (`zzp4b_tc31_chore`): `status=todo`, `assigned_to_id=null`, **`is_pool=true`** (category_type is `household_chore`, not `parent_only_quest`, so the guard's exclusion is a non-factor here and the flip correctly applies)

**Per-role breakdown**:
- **Actor (whoever called Reopen — parent2 here)**: their `LockedAssignmentCard` disappears immediately (client-side optimistic per trace); DB confirms the row is genuinely `DECLINED` now, outside the live-set.
- **Other original party (parent1)**: same disappearance, driven by the same now-`DECLINED` row; trace's claim of a chat DM firing here is a client-side `sendMessage` call, not independently DB-verifiable, but not contradicted by anything found.
- **kid1/kid2/teen1 (pool viewers)**: `is_pool=true` and `assigned_to_id=null` confirmed — this chore is now genuinely visible/claimable on any kid/teen bounty-board query filtering on `isPool===true && assignedToId==null`. This is the exact TC-31 bug (pre-fix this stayed `false`) and it is now closed live.
- **Other parents (HouseholdBacklogSection)**: chore now matches `unclaimedPool` filter (`!getLiveAssignmentForChore(c.id)` — true, since the only assignment row is `DECLINED`) — would render as `PoolQuestCard`.

**Verdict**: CONFIRMED. `is_pool` correctly resets to `true` on reopen.

---

### TC-32 — Rapid-fire pushback race — **CONFIRMED**

**Scenario**: Two "concurrent" `respond_to_parent_quest` calls race on the same
assignment. Verified by calling ACCEPT once (winner), then immediately calling
DECLINE again on the now-`ACCEPTED` row (simulating the loser's call landing
after the winner's write committed) — this exercises the identical code path a
true DB-level race would hit: the explicit `status not in (...)` check plus the
CAS `where id=... and status=v_assignment.status` guard, both evaluated against
the live row inside the same transaction, not a client snapshot.

**Steps + exact RPC calls**:
1. `insert into chore_tasks/parent_quest_assignments` fixtures (`zzp4b_tc32_chore`/`zzp4b_tc32_pqa`, status `PENDING`)
2. `respond_to_parent_quest('zzp4b_tc32_pqa','zzp4b_parent2','ACCEPT',null)` → succeeds, `status=ACCEPTED`
3. `respond_to_parent_quest('zzp4b_tc32_pqa','zzp4b_parent2','DECLINE',null)` → **raises**: `assignment zzp4b_tc32_pqa is already resolved (status=ACCEPTED)`

**Per-role breakdown**:
- **Losing caller** (whichever role's second call lands after the first commits): gets a real, visible exception — in the store wrapper this becomes the rollback + `showToast(...)` per the trace; role-agnostic, applies identically to any System-A party (parent, GP).
- **Winning caller**: normal optimistic UI stands; DB confirms the row genuinely reached `ACCEPTED` with no corruption from the second attempt.
- **Cross-role**: no other role (kid/teen) is exposed to this at all — purely a same-surface, two-tabs-open scenario between the two System-A parties.

**Verdict**: CONFIRMED. Exactly one call's write survives; the second gets a clean, honest exception, never silent divergence or row corruption.

---

### TC-33 — Edit coins, unclaimed chore — **CONFIRMED**

**Scenario**: A plain UPDATE (standing in for the client's `updateChore` plain-patch
path, since there is no dedicated RPC gate for this case) sets `coins_reward` on
an unclaimed (`status=todo`, `assigned_to_id=null`) chore.

**Steps**:
1. `insert into chore_tasks (...) values ('zzp4b_tc33_chore', status='todo', assigned_to_id=null, coins_reward=10)`
2. `update chore_tasks set coins_reward=25 where id='zzp4b_tc33_chore'`

**Resulting row state**: `coins_reward=25`, `status=todo` (unchanged), `pending_terms=null` — no staging occurred, applied immediately.

**Per-role breakdown**:
- **Editing parent**: sees `coins_reward=25` immediately on next render — no gate engaged (confirms the client gate's own explicit condition, `status==='in_progress' && assignedToId`, is the only thing standing between this path and the terms-change RPC — and it correctly does not apply here).
- **Kid/Teen pool viewers**: same updated value, no negotiation state (`pending_terms` genuinely null).
- **Cross-role**: immediate, ungated, symmetric — confirmed, matches trace exactly.

**Verdict**: CONFIRMED.

---

### TC-34 — Edit coins, CLAIMED chore — **CONFIRMED**

**Scenario**: `propose_terms_change` on a claimed (`in_progress`, `assigned_to_id`
set) chore, changing `coinsReward` only.

**Steps + exact RPC calls**:
1. `insert into chore_tasks (...) values ('zzp4b_tc34_chore', status='in_progress', assigned_to_id='zzp4b_kid1', coins_reward=10, due_date='2026-09-01')`
2. `propose_terms_change('zzp4b_tc34_chore','zzp4b_parent1', 25, null, null, null)`

**Resulting row state** (queried directly): `status=terms_changed`; **live `coins_reward` still `10`** (untouched); `pending_terms = {"old":{"coinsReward":10,...}, "new":{"coinsReward":25,...}, "changedBy":"zzp4b_parent1", "changedAt":"..."}`.

**Per-role breakdown**:
- **Proposing parent (parent1)**: `q.assignedToId !== myId` → read-only "terms changed" badge only, no action buttons (per `QuestCard.tsx`'s gate at line 851).
- **Claimant (kid1)**: `q.assignedToId === myId` → gets "Still fine by me" / "Hand it back" action strip; all other actions suppressed while `pendingTerms` is truthy.
- **Observer roles (parent2, kid2, teen1, senior1)**: since live `coins_reward` genuinely never left `10`, anyone reading the chore mid-negotiation sees the OLD, correct value everywhere except this card's own pending-terms badge — confirms the exact defect closure this session's migration claims.

**Verdict**: CONFIRMED. Live-write-before-acceptance defect is genuinely closed; staging is real, not just a comment.

---

### TC-35 — Edit due date, CLAIMED chore — **CONFIRMED**

**Steps + exact RPC calls**:
1. `insert into chore_tasks (...) values ('zzp4b_tc35_chore', status='in_progress', assigned_to_id='zzp4b_teen1', due_date='2026-09-01')`
2. `propose_terms_change('zzp4b_tc35_chore','zzp4b_parent1', null, null, '2026-09-10', null)`

**Resulting row state**: `status=terms_changed`; live `due_date` still `2026-09-01`; `pending_terms.old.dueDate=2026-09-01`, `pending_terms.new.dueDate=2026-09-10`.

**Per-role breakdown**: identical shape to TC-34 — proposer (parent1) read-only badge, claimant (teen1) gets accept/reject buttons, all other roles see the untouched old due date.

**Verdict**: CONFIRMED. Same staged-not-live mechanism holds for due-date edits.

---

### TC-36 — Edit due TIME, CLAIMED chore — **CONFIRMED**

**Steps + exact RPC calls**:
1. `insert into chore_tasks (...) values ('zzp4b_tc36_chore', status='in_progress', assigned_to_id='zzp4b_kid2', due_time='17:00')`
2. `propose_terms_change('zzp4b_tc36_chore','zzp4b_parent1', null, null, null, '19:30')` — the `p_new_due_time` parameter exists and is accepted (confirms the RPC signature genuinely includes it, closing the "dueTime missing from gate" asymmetry).

**Resulting row state**: `status=terms_changed`; live `due_time` still `17:00`; `pending_terms.old.dueTime=17:00`, `pending_terms.new.dueTime=19:30`.

**Per-role breakdown**: same shape — claimant (kid2) gets the same accept/reject pair folded into the same `pendingTerms` object per the trace (no separate due-time UI needed).

**Verdict**: CONFIRMED. Due-time edits are now gated identically to coins/date edits, both client-signature-wise (per source) and RPC-wise (confirmed live here).

---

### TC-37A — Accept a terms-change proposal — **CONFIRMED**

**Steps + exact RPC calls**: `accept_terms_change('zzp4b_tc34_chore','zzp4b_kid1')` (accepting TC-34's pending coins 10→25 proposal).

**Resulting row state**: `status=in_progress`; **`coins_reward=25`** (now genuinely live — this is the FIRST point the new value was ever written to the live column); `pending_terms=null`.

**Per-role breakdown**:
- **Claimant (kid1)**: badge/action buttons disappear, chore reverts to normal in-progress card with the new value now real.
- **Proposing parent (parent1)**: badge clears on next sync; no RPC-level notification path exists (`activity_log` insert has no corresponding chat `sendMessage` in this RPC, consistent with the trace's observation of a minor asymmetry vs. other terminal actions).

**Verdict**: CONFIRMED. Accept is the sole moment new terms become real; no half-applied state observed at any intermediate point.

---

### TC-37B — Reject a terms-change proposal ("hand it back") — **CONFIRMED, including both new observations**

**Steps + exact RPC calls**:
1. `reject_terms_change('zzp4b_tc35_chore','zzp4b_teen1')` (rejecting TC-35's pending due-date 09-01→09-10 proposal)

**Resulting row state**: `status=todo`; `assigned_to_id=null`; `due_date=2026-09-01` (the ORIGINAL value — confirms "nothing to restore" holds because nothing was ever changed live); `is_pool=true` (household_chore, correctly re-pooled); `pending_terms=null`.
`declined_at=null`, `rejection_reason=null` (queried directly) — the reject note did NOT land here.
`activity_log` for this entity shows: `action=terms_rejected, note="terms changed, handed back — kept original terms", to_status=todo` — confirms the note landed ONLY in `activity_log`, exactly as the trace's second new observation claims.

**Per-role breakdown**:
- **Claimant (teen1)**: action strip/badge clear, chore vanishes from claimed view (`status` no longer `in_progress`).
- **Proposing parent (parent1)**: sees the chore reappear as an unclaimed `PoolQuestCard` with NO red "declined" sub-line (`declineNote` reads from `declinedAt`/`rejectionReason`, both confirmed null) — looks like any freshly-unclaimed pool item, exactly the flagged UX inconsistency.
- **Kid/Teen pool viewers**: for a `household_chore`, `is_pool=true` confirmed — genuinely reappears in the pool.

**Special check — parent_only_quest pool-guard (the trace's flagged new observation #1)**:
1. `insert into chore_tasks (...) values ('zzp4b_tc37b_poq', category_type='parent_only_quest', status='in_progress', assigned_to_id='zzp4b_parent2', coins_reward=10)`
2. `propose_terms_change('zzp4b_tc37b_poq','zzp4b_parent1', 20, null, null, null)` — **succeeds** (parent2 is a parent, so `propose_terms_change`'s authorization check, `v_by_role != 'parent'`, trivially passes — confirms the scenario IS reachable, exactly as the trace flagged it might be)
3. `reject_terms_change('zzp4b_tc37b_poq','zzp4b_parent2')`

**Resulting row state**: `status=todo`, `assigned_to_id=null`, **`is_pool=false`** (confirmed via direct SELECT, not just the RPC's return tuple) — the `category_type != 'parent_only_quest'` guard from migration `20260927200000_fix_reject_terms_change_pool_guard.sql` is genuinely present and firing correctly in the LIVE database.

**Verdict**: CONFIRMED, with the important resolution that **the pool-guard patch is live and working** — a `parent_only_quest` run through claim → propose-terms-change → reject does NOT incorrectly re-enter the kid/teen pool. The scenario is reachable (propose_terms_change's authorization does not block it), but the reject-side guard correctly catches it. This closes the trace's flagged "genuinely new observation #1" as **RESOLVED, not a live bug** — the follow-up migration had already landed by the time of this verification. Observation #2 (declinedAt/rejectionReason vs activity_log) is **CONFIRMED as a real, live, minor UX inconsistency** (not a data-integrity bug, per the trace's own framing).

---

### TC-38 — GP edits own sponsored quest pre-approval — **CONFIRMED (UNVERIFIABLE beyond source, consistent with trace)**

**Scenario**: Checked for any dedicated RPC that would let a GP edit their own
`grandparent_quest` while `status=pending_parent_approval`.

**Steps**: `select proname from pg_proc where proname ilike '%grandparent%' or ilike '%sponsor%' or ilike '%gp_quest%'` → **zero results**. Also created a live fixture (`zzp4b_tc38_gpq`, `category_type=grandparent_quest`, `status=pending_parent_approval`, `sponsor_user_id=zzp4b_senior1`) to confirm the row shape is reachable at all.

**Per-role breakdown**:
- **GP (senior1)**: no RPC exists for this edit at all — confirms there is no server-side path, not just a missing UI button. Whatever a GP's pending-approval quest card renders, it can only be read-only or route through a plain (client-gated only) `updateChore`.
- **Parent role**: unaffected — sees the quest in the normal pending-approval review queue.

**Verdict**: CONFIRMED as a genuine gap (matches trace's "not built" characterization) — no RPC-level distinction exists for this specific pre-approval edit window; this remains a missing feature, not a bug in existing code, and is not independently falsifiable beyond confirming no RPC path exists.

---

### TC-39 — Delete unclaimed pool chore — **CONFIRMED**

**Steps + exact RPC calls**:
1. `insert into chore_tasks (...) values ('zzp4b_tc39_chore', is_pool=true, status='todo', created_by_id='zzp4b_parent1')`
2. `cancel_chore('zzp4b_tc39_chore','zzp4b_parent2')` — called by a DIFFERENT parent than the creator, confirming "creator OR any parent" authorization.

**Resulting row state**: `chore_tasks` row count for this id: **0** (hard-deleted).

**Per-role breakdown**:
- **Canceling parent (parent2)**: succeeds despite not being the creator (any parent may cancel).
- **Kid/Teen pool viewers**: chore simply gone on next sync, no ghost card, no explicit "deleted" toast (per trace).

**Verdict**: CONFIRMED.

---

### TC-40 — Delete a chore with a live claimed assignee — **CONFIRMED**

**Steps + exact RPC calls**:
1. `insert into chore_tasks (...) values ('zzp4b_tc40_chore', status='in_progress', assigned_to_id='zzp4b_kid1', created_by_id='zzp4b_parent1')`
2. `cancel_chore('zzp4b_tc40_chore','zzp4b_parent1')`

**Resulting row state**: row count 0 — deleted cleanly with an active claimant, no FK violation, no exception.

**Per-role breakdown**:
- **Canceling parent**: immediate local filter-out (client-side, consistent with trace).
- **Claimant (kid1)**: loses the chore from local state on next sync; DB confirms no server-side error occurs regardless of claim state, consistent with the "no crash on stale reference" claim (which is itself a client-code assertion about `.find()` tolerance, not independently DB-testable, but nothing here contradicts it).

**Verdict**: CONFIRMED.

---

### TC-41 — Non-creator/non-parent attempts `cancel_chore` — **CONFIRMED**

**Steps + exact RPC calls**:
1. `insert into chore_tasks (...) values ('zzp4b_tc41_chore', status='todo', created_by_id='zzp4b_parent1')`
2. `cancel_chore('zzp4b_tc41_chore','zzp4b_kid1')` (kid1 is neither creator nor a parent)

**Result**: **raises** `member zzp4b_kid1 is not authorized to cancel chore zzp4b_tc41_chore (not the creator or a parent)`. Row confirmed untouched afterward (`status=todo`, still exists).

**Per-role breakdown**:
- **Unauthorized actor (kid1)**: gets the exact exception the trace's client wrapper turns into a toast; no optimistic delete occurred (row genuinely never touched).
- **Other roles**: unaffected — write never happened.

**Verdict**: CONFIRMED.

---

### TC-42 — Delete a chore mid-handoff — **CONFIRMED**

**Steps + exact RPC calls**:
1. `insert into chore_tasks (...) values ('zzp4b_tc42_chore', status='in_progress', assigned_to_id='zzp4b_kid1', pending_handoff_to='zzp4b_kid2', pending_handoff_offered_by='zzp4b_kid1')`
2. `insert into chore_participants (chore_id, member_id, role, status) values ('zzp4b_tc42_chore','zzp4b_kid2','assignee','pending')` — added explicitly since no auto-trigger populates this table on chore insert.
3. `cancel_chore('zzp4b_tc42_chore','zzp4b_parent1')`

**Resulting row state**: `chore_tasks` count 0; `chore_participants` count for this chore_id: **0** — confirms cascade cleanup, no orphaned participant row.

**Per-role breakdown**:
- **Receiver of the pending handoff (kid2)**: their handoff-offer box and action pair vanish once the whole chore row (and its participant row) is gone in one shot.
- **Original holder (kid1)**: same — chore vanishes entirely.
- **Approving parent**: any pending-approval queue entry tied to this chore also disappears (no separate row survives).

**Verdict**: CONFIRMED. No orphaned `chore_participants` row survives the cascade.

---

### TC-43 — Stale reference after delete — **CONFIRMED (RPC path) / CONFIRMED-AS-REAL-GAP (plain-patch path)**

**RPC path**: `cancel_chore('zzp4b_tc42_chore','zzp4b_parent1')` called a second time (chore already deleted by TC-42's own cancel) → **raises** `chore zzp4b_tc42_chore not found`. Clean, honest exception.

**Plain-patch path (the flagged gap)**: `update chore_tasks set coins_reward=99 where id='zzp4b_tc42_chore' returning id` → returned **`rows: []`** with **no SQL error at all** — a genuine silent 0-row UPDATE. This directly confirms the DB-level premise of the flagged gap: Postgres/PostgREST treats a 0-row UPDATE as a successful, empty result, never an exception. Whether the client additionally shows a false "saved" toast on top of this is a client-code question outside DB scope (as the trace itself notes), but the DB behavior it depends on is now live-confirmed true.

**Per-role breakdown**:
- **RPC-backed action from any role**: real, visible, honest failure.
- **Plain-patch action from any role editing a chore just deleted elsewhere**: the write silently no-ops with a "successful" (empty) response — the client-side toast-gating logic determines whether this becomes a false positive, unconfirmed here (out of DB scope) but the underlying mechanism is real.

**Verdict**: CONFIRMED for both halves — RPC paths fail honestly; the plain-patch silent-no-op mechanism is real and live, consistent with the trace's "flagged, unconfirmed, still open" framing (now DB-confirmed as a real mechanism, though the client-surfacing question remains unconfirmed by design, since that requires reading client toast logic beyond this pass's DB scope).

---

### TC-44 — `respond_to_parent_quest` — ACCEPT on already-ACCEPTED — **CONFIRMED**

**Steps + exact RPC calls**:
1. Fixtures `zzp4b_tc44_chore`/`zzp4b_tc44_pqa` (`PENDING`)
2. `respond_to_parent_quest('zzp4b_tc44_pqa','zzp4b_parent2','ACCEPT',null)` → `ACCEPTED`
3. `respond_to_parent_quest('zzp4b_tc44_pqa','zzp4b_parent2','ACCEPT',null)` again → **raises** `assignment zzp4b_tc44_pqa is already resolved (status=ACCEPTED)`

**Per-role breakdown**: purely same-actor (parent2) double-submission guard; no other role exposed.

**Verdict**: CONFIRMED.

---

### TC-45 — ACCEPT on already-DECLINED — **CONFIRMED**

**Steps + exact RPC calls**:
1. Fixtures `zzp4b_tc45_chore`/`zzp4b_tc45_pqa` (`PENDING`)
2. `respond_to_parent_quest('zzp4b_tc45_pqa','zzp4b_parent2','DECLINE',null)` → `DECLINED`
3. `respond_to_parent_quest('zzp4b_tc45_pqa','zzp4b_parent2','ACCEPT',null)` → **raises** `assignment zzp4b_tc45_pqa is already resolved (status=DECLINED)`

**Per-role breakdown**: same-actor stale-call guard, correct status echoed in the exception (`DECLINED`, not a generic message).

**Verdict**: CONFIRMED.

---

### TC-46 — Any action, nonexistent id — **CONFIRMED**

**Steps**: `respond_to_parent_quest('zzp4b_nonexistent_id','zzp4b_parent1','ACCEPT',null)` → **raises** `assignment zzp4b_nonexistent_id not found`.

**Per-role breakdown**: not reachable through any normal UI flow (every card derives its assignment id from an already-fetched row); pure defensive guard, no role-visible effect.

**Verdict**: CONFIRMED.

---

### TC-47 — Any action on `is_locked=true` — **CONFIRMED**

**Steps + exact RPC calls**:
1. `insert into parent_quest_assignments (...) values ('zzp4b_tc47_pqa', status='PARKED', is_locked=true, bounce_count=2)` (fixture, bypassing the two-bounce dance since TC-30/31 already independently prove the locking mechanism itself)
2. `respond_to_parent_quest('zzp4b_tc47_pqa','zzp4b_parent2','ACCEPT',null)` → **raises** `assignment zzp4b_tc47_pqa is locked (two-bounce rule) — needs to be discussed outside the app`

**Per-role breakdown**: both parties in a locked negotiation would only ever see `LockedAssignmentCard`'s Reassign/Reopen pair in the real UI (per trace); this confirms the RPC-level guard as the third/final layer of defense holds even for a direct call.

**Verdict**: CONFIRMED. Exact exception wording match.

---

### TC-48 — Uninvolved 3rd party responds — **CONFIRMED**

**Steps + exact RPC calls**:
1. Fixtures `zzp4b_tc48_chore`/`zzp4b_tc48_pqa` (`PENDING`, between parent1/parent2)
2. `respond_to_parent_quest('zzp4b_tc48_pqa','zzp4b_senior1','ACCEPT',null)` — senior1 is neither `assigned_by` nor `assigned_to` — → **raises** `member zzp4b_senior1 is not a party to assignment zzp4b_tc48_pqa`

**Resulting row state**: confirmed still `PENDING` afterward — the uninvolved call had zero effect.

**Per-role breakdown**:
- **Uninvolved third party (senior1)**: gets a real exception when calling directly; in the real UI they'd never even see this assignment's card (filtered lists), so this specifically closes the direct-call/exploit path.
- **Structural cross-role**: zero visible change to parent1/parent2's screens from this rejected attempt.

**Verdict**: CONFIRMED. The `p_actor_id` fix and party check both hold live, exactly as claimed.

---

### TC-49 — `complete_parent_quest`, uninvolved actor — **CONFIRMED**

**Steps**: `complete_parent_quest('zzp4b_tc48_pqa','zzp4b_senior1')` → **raises** `member zzp4b_senior1 is not a party to assignment zzp4b_tc48_pqa`.

**Per-role breakdown**: same shape as TC-48 — no legitimate role's UI has a button that would fire this for someone else's assignment (`OthersAdultQuestCard`'s Nudge/Reclaim never call `complete_parent_quest`); the RPC guard defends only the direct-call path.

**Verdict**: CONFIRMED.

---

### TC-50 — Double-complete — **CONFIRMED**

**Steps + exact RPC calls**:
1. `complete_parent_quest('zzp4b_tc44_pqa','zzp4b_parent2')` → succeeds, `status=COMPLETED`, `completed_at` stamped. `activity_log` count for `action='completed'` on this entity: **1**.
2. `complete_parent_quest('zzp4b_tc44_pqa','zzp4b_parent2')` again → **raises** `assignment zzp4b_tc44_pqa is already completed`. `activity_log` count re-checked: still **1** (no duplicate row written).

**Per-role breakdown**: purely same-actor (parent2); the guard prevents both a duplicate `activity_log` entry and a re-stamped `completed_at` — confirmed the second call's rejection happens before any write, so `completed_at` genuinely was never touched a second time.

**Verdict**: CONFIRMED. Live DB's `complete_parent_quest` (from `20260927110000_qa_fixes_batch1.sql`, which supersedes the earlier `20260927060000_parent_quest_write_rpcs.sql` version that lacked this guard) has the double-completion check, confirmed via direct `prosrc` introspection AND via this live call.

---

## Summary of the two flagged new observations (from the source trace's own summary section)

1. **`reject_terms_change`'s `is_pool` guard for `parent_only_quest`** — **RESOLVED, confirmed live**. The scenario is reachable (a parent can `propose_terms_change` on a `parent_only_quest` they're the claimant of — `v_by_role != 'parent'` trivially passes for a parent claimant), but the reject path's `category_type is distinct from 'parent_only_quest'` guard (migration `20260927200000_fix_reject_terms_change_pool_guard.sql`) is genuinely present in the live database and correctly keeps `is_pool=false` for the parent-only quest. This is NOT a live bug as of this verification.
2. **`reject_terms_change`'s note going to `activity_log`, not `chore.declinedAt`/`rejectionReason`** — **CONFIRMED as a real, live, minor UX inconsistency**. Directly verified: after a reject, `declined_at` and `rejection_reason` are both `null` on the chore row, while `activity_log` carries the human-readable note (`"terms changed, handed back — kept original terms"`). A parent viewing the re-pooled chore genuinely sees no red "declined" annotation for this path, unlike a kid's decline. Not a data-integrity bug — cosmetic only, exactly as the trace characterized it.

---

## Cleanup

All `zzp4b_`-prefixed rows deleted at the end of this pass, in dependency
order: `activity_log` → `chore_participants` → `parent_quest_assignments` →
`chore_tasks` → `members` → `families`. No real user/family data was touched
at any point — every insert/update/RPC call above targeted only ids/rows
created by this pass within family `270da587-bc84-41a8-8f13-b99a705f793e`.

**Zero-row proof query** (run after teardown):

```sql
select
  (select count(*) from public.families where name like 'zzp4b_%') as families_left,
  (select count(*) from public.members where id like 'zzp4b_%') as members_left,
  (select count(*) from public.chore_tasks where id like 'zzp4b_%') as chores_left,
  (select count(*) from public.parent_quest_assignments where id like 'zzp4b_%') as pqa_left,
  (select count(*) from public.chore_participants where chore_id like 'zzp4b_%') as participants_left,
  (select count(*) from public.activity_log where entity_id like 'zzp4b_%') as activity_log_left;
```

**Result**: `{"families_left":0,"members_left":0,"chores_left":0,"pqa_left":0,"participants_left":0,"activity_log_left":0}` — confirmed 0 rows remain in every table this pass touched.
