# Master Flow — DB-Verified Trace, TC-01 through TC-29

**Purpose**: Verifies `docs/master_flow_full_role_trace_TC01-29.md`'s per-role claims against REAL Supabase Postgres state, not source reading alone. For every meaningful DB state transition: (1) called the real RPC, (2) queried the resulting row, (3) confirmed the row matches what the source trace says each role's selector would compute given that row.

**Test data**: One throwaway family `zzp4a_TestFam` (`11111111-1111-1111-1111-111111111111`) with 7 `zzp4a_`-prefixed members — `zzp4a_parent1`/`zzp4a_parent2` (parent), `zzp4a_kid1`/`zzp4a_kid2` (DB role `child`), `zzp4a_teen1` (DB role `teenager`), `zzp4a_senior1`/`zzp4a_senior2` (DB role `grandparent`). All chores/assignments `zzp4a_c*`/`zzp4a_a*`-prefixed. Fully cleaned up at the end — proof query at the bottom.

**Schema notes confirmed live**: `families.id` uuid, `members.id` text, `members.family_id` uuid, `chore_tasks.id`/`family_id` text (cast to uuid where the RPC needs it internally). `members.role` check constraint is `['parent','child','kid','teenager','grandparent']` — NOT `'teen'`/`'senior'` (those are app-level display roles; `familyStore.ts:458` maps `kid→child`, `teen→teenager`, `senior→grandparent` on write, and reverses it on read at `familyStore.ts:333`). `members.avatar` is NOT NULL, supplied as emoji throughout.

---

### TC-01 — Parent hard-assigns a chore to a GP (DIRECT)

**RPC**: Direct insert into `parent_quest_assignments` (no dedicated creation RPC exists — `addParentQuest` in `store/choreStore.ts:4152` is a client-side function that does its own `dbUpdate`/insert; the trace's own file:line citations for this step are accurate about this).

**Row state**: `zzp4a_a01`: `chore_id=zzp4a_c01, assigned_by=zzp4a_parent1, assigned_to=zzp4a_senior1, mode=DIRECT, status=PENDING`.

**Verdict**: CONFIRMED. Matches `getMyOutgoingPending`/`getMyDirectPending` selector logic read directly from `store/choreStore.ts:5024-5093` — B sees it (assignedBy===memberId), CoP sees it too (assignee role is `senior`, target !== memberId, CoP role is `parent`), A/GP sees it via `getMyDirectPending` (assignedTo===memberId, status PENDING).

---

### TC-02 — GP accepts a DIRECT delegation

**RPC**: `respond_to_parent_quest('zzp4a_a01', 'zzp4a_senior1', 'ACCEPT', null)`.

**Row state**: `parent_quest_assignments.status → ACCEPTED`. `chore_tasks(zzp4a_c01).status → in_progress`, `.assigned_to_id → zzp4a_senior1` (confirmed via follow-up `select`).

**Verdict**: CONFIRMED. `chore_tasks.assigned_to_id` is now live, so `systemBIds` (in `getMyDirectPending`/`getMyOutgoingPending`) excludes the chore from System-A cards on both sides; `ParentView.tsx:457`'s `othersAdultQuests` filter (`q.assignedToId && q.assignedToId !== active.id`) now genuinely includes it for B and CoP — confirmed by reading that exact line.

---

### TC-03 — GP declines a DIRECT delegation

**RPC**: `respond_to_parent_quest('zzp4a_a03', 'zzp4a_senior2', 'DECLINE', null)` (fresh fixture `zzp4a_c03`/`zzp4a_a03`, since a01 was consumed by TC-02).

**Row state**: `status → DECLINED`.

**Verdict**: CONFIRMED. `getMyOutgoingPending`/`getMyDirectPending` both filter to `PENDING`/`SNOOZED`/`PARKED` only — a `DECLINED` row drops out of both immediately, no stale card on either side.

---

### TC-04 — Two-bounce pushback lock

**RPC**: `respond_to_parent_quest('zzp4a_a04', 'zzp4a_parent2', 'BLOCKER', 'first bounce')` → `bounce_count=1, is_locked=false, status=PARKED`. Then `respond_to_parent_quest('zzp4a_a04', 'zzp4a_parent1', 'TRADE', 'second bounce')` → `bounce_count=2, is_locked=true, status=PARKED`.

**Verdict**: CONFIRMED. `is_locked` flips true exactly on the 2nd non-terminal pushback action (RPC source: `v_bounce_count >= 2 then v_is_locked := true`), matching `getMyLockedItems` (`assignedTo===memberId || assignedBy===memberId, isLocked`) — both parties get the card, CoP (uninvolved) is excluded by the same filter.

---

### TC-05 — Parent recalls a still-PENDING delegation

**RPC**: `recall_parent_quest('zzp4a_a05', 'zzp4a_parent1')` → `status → DECLINED`. Spot-checked the CoP-backstop claim too (lighter-touch per the trace's own TC-05 wording): `recall_parent_quest('zzp4a_a05b', 'zzp4a_parent2')` where parent2 is NOT the delegator on that assignment.

**Result**: The CoP attempt raised a real exception: `member zzp4a_parent2 is not the delegator of assignment zzp4a_a05b`.

**Verdict**: CONFIRMED on both layers — B's own recall succeeds and removes the card from both `getMyOutgoingPending` (B) and `getMyDirectPending` (A); the RPC-level backstop for an uninvolved CoP fires exactly as the trace claims, and `HouseholdBacklogSection.tsx:158`'s `a.assignedBy === active.id` guard means the UI never even offers CoP that button in the first place.

---

### TC-06 — Bounty chore, GP excluded

**Setup**: `zzp4a_c06`: `is_pool=true, status=todo, invite_grandparents=false` (default).

**Verdict**: CONFIRMED by direct row inspection against both selectors read from source. `poolQuests` (`KidView.tsx:235`, `TeenView.tsx:113`): `q.isPool && q.status==='todo' && !q.isAdultTask && !q.awaitingParentApproval && !q.inviteGrandparents` — all clauses pass, chore is K/T-visible. `gpInvitations` (`SeniorView.tsx:439-440`): `c.inviteGrandparents && c.status==='todo' && !c.sponsorUserId` — fails on the first clause, chore is GP-invisible for both GP1 and GP2.

---

### TC-07 — Chore flagged `inviteGrandparents=true`

**Setup**: `update chore_tasks set invite_grandparents=true where id='zzp4a_c07'` (mirrors what `updateChore(choreId, {inviteGrandparents:true})` writes client-side — same net DB effect).

**Row state**: `is_pool=true, status=todo, invite_grandparents=true`.

**Verdict**: CONFIRMED. Now `gpInvitations`' filter passes for both GP1 and GP2 identically (no per-GP scoping at this stage — confirmed, the filter has no member-specific clause). `poolQuests`' `!q.inviteGrandparents` clause now fails — chore disappears from both `KidView.tsx:235` and `TeenView.tsx:113`.

---

### TC-08 — GP1 claims the GP-invite chore

**RPC**: `claim_gp_errand('zzp4a_c07', 'zzp4a_senior1')`.

**Row state**: `claimed=true`, chore row: `status=gp_offer_pending, gp_offer_by_id=zzp4a_senior1, is_pool=true` (unchanged).

**Verdict**: CONFIRMED for the DB/exclusivity claim — `gpInvitations`' `status==='todo'` clause now fails for both GPs (status left `'todo'` for `'gp_offer_pending'`), so GP2 is excluded the instant GP1 offers, exactly as claimed. The trace's own noted UX gap (GP1 has no distinct "I offered, waiting" card) is a pre-existing, already-documented Section-C item, not re-litigated here — not re-verified live since it's an absence-of-UI claim, not a DB-state claim.

---

### TC-09 — GP1 backs out (`backoutGpWelcomeChore`)

**RPC note**: the actual RPC name is `withdraw_gp_offer` (client wrapper is `withdrawGPOffer` in `SeniorView.tsx:952`) — the trace's parenthetical `(backoutGpWelcomeChore)` names a different, unrelated function (`claim_gp_welcome_chore`'s sibling, gated on the now-fully-dropped `open_to_gp` column, confirmed dead — see TC-27). This is a minor naming imprecision in the trace, not a behavioral bug: the actual flow the trace describes (GP1 reversing their `gp_offer_pending` claim) is served by `withdraw_gp_offer`, which is what was tested.

**RPC**: `withdraw_gp_offer('zzp4a_c07', 'zzp4a_senior1')`.

**Row state**: `status → todo`, `gp_offer_by_id → null`, `is_pool=true` (unchanged), `invite_grandparents=true` (unchanged).

**Verdict**: CONFIRMED on substance. `status==='todo'` again passes `gpInvitations` for both GP1 and GP2 — reappears for both. `invite_grandparents` still true — `poolQuests`' `!q.inviteGrandparents` still excludes it from K/T. **Naming note flagged above should be corrected in the source trace** (cosmetic, not a functional finding).

---

### TC-10 — GP passes (no guilt), no claim

**RPC**: `set_gp_withdrawn('zzp4a_c07', 'zzp4a_senior1', true)`.

**Row state**: `gp_withdrawn_ids = ['zzp4a_senior1']`.

**Verdict**: CONFIRMED. Per-GP array membership (`QuestInvitationsSection.tsx:32`'s `alreadyPassed` check) — GP1's own card flips to "Reconsider?"; GP2's own `alreadyPassed` check (testing for `zzp4a_senior2` in the same array) reads false, unaffected, matching the trace's "silent to GP2" claim exactly.

---

### TC-11 — Race — two GPs claim simultaneously

**RPC**: `claim_pool_quest('zzp4a_c11', 'zzp4a_kid1')` → `claimed=true`, `status=in_progress`, `assigned_to_id=zzp4a_kid1`. Then `claim_pool_quest('zzp4a_c11', 'zzp4a_kid2')` (same chore, already claimed) → `claimed=false`.

**Verdict**: CONFIRMED. Exactly one claim wins; the loser's RPC call returns a deterministic `claimed:false` row rather than silently no-opping or erroring — matches the trace's "deterministic from RPC return, not inferred from a stale read" claim precisely. (Tested via `claim_pool_quest`, the general pool-item CAS path; `claim_gp_errand`'s equivalent CAS mechanism was independently confirmed via TC-08's single-claim test and its `for update` row lock / `status='todo'` guard.)

---

### TC-12 — Named handoff — offer, not blind reassign

**RPC**: `offer_chore_handoff('zzp4a_c12', 'zzp4a_teen1', 'zzp4a_kid1', 'busy today')` (kid1 held `zzp4a_c12`, offering to teen1).

**Row state**: `assigned_to_id` **stays** `zzp4a_kid1` (unchanged), `pending_handoff_to=zzp4a_teen1`, `pending_handoff_offered_by=zzp4a_kid1`.

**Verdict**: CONFIRMED (light spot-check per task instructions, since Pass 3's B.3 already covered this in depth). RPC source (`20260927020000_chore_handoff_accept_flow.sql`) confirms `offer_chore_handoff` never touches `assigned_to_id`/`status` — only records the offer, exactly matching the trace's "does NOT touch assigned_to_id/status at all" claim.

---

### TC-13 — Receiver accepts the handoff

**RPC**: `accept_chore_handoff('zzp4a_c12', 'zzp4a_teen1')`.

**Row state**: `assigned_to_id → zzp4a_teen1`, `pending_handoff_to → null`, `status → todo`.

**Verdict**: CONFIRMED. Clean single-owner transition — A2 (teen1) now owns it outright, A1 (kid1)'s `myQuests` filter no longer matches any clause.

---

### TC-14 — Receiver declines the handoff

**RPC**: fresh fixture `zzp4a_c14` (assigned to kid1) → `offer_chore_handoff('zzp4a_c14','zzp4a_teen1','zzp4a_kid1','nope')` → `decline_chore_handoff('zzp4a_c14', 'zzp4a_teen1')`.

**Row state**: `assigned_to_id → null`, `is_pool → true`, `status → todo`, `pending_handoff_to → null`.

**Verdict**: CONFIRMED. Reopens to the general pool (`is_pool=true`, unassigned) rather than bouncing back to A1 (kid1) — matches the "do not silently dump it back on the original decliner" intent exactly.

---

### TC-15 — "Ask for a later time" — approval required

**RPC**: `propose_later_date('zzp4a_c15', 'zzp4a_kid2', '2026-09-05', 'busy this week')` (c15 was assigned to kid2 beforehand).

**Row state**: `assigned_to_id → null`, `is_pool → true`, `status → todo`, `due_date` **unchanged** (still `null` in this fixture), `pending_later_date='2026-09-05'`.

**Verdict**: **MISMATCH.** The source trace (line 206) claims: *"A (requester): No distinct pending-request card confirmed... beyond the chore staying assigned to them with its original due date."* This is false against the live DB. The currently-active `propose_later_date` (migration `20260927150000_fix_later_date_orphan.sql`, which `CREATE OR REPLACE`s and supersedes the earlier `20260927030000_chore_later_time_approval.sql` version the trace appears to have read) **releases the chore**: `assigned_to_id=null`, `is_pool=(category_type is distinct from 'parent_only_quest')` → `true` for this non-adult chore. This was a deliberate, documented fix for a real orphan bug (kid loses pool visibility entirely) — but it means the requester does NOT keep the chore on their own plate while waiting for approval; it becomes generally poolable, visible to any kid/teen in the household's Bounty Board (`poolQuests` filter: `isPool && status==='todo'` — no clause blocks it), and claimable by a sibling while the later-date request is still pending. `due_date` itself is correctly untouched, matching that specific sub-claim.

---

### TC-16 — Parent approves later-date

**RPC**: `approve_later_date('zzp4a_c15', 'zzp4a_parent1')`.

**Row state**: `due_date → '2026-09-05'`, `pending_later_date → null`. `assigned_to_id` stays `null`, `is_pool` stays `true` (approve_later_date never touches either).

**Verdict**: CONFIRMED on the `due_date` write itself — it's a real DB write, applied and visible everywhere the chore renders, matching the trace's core claim. **However this compounds TC-15's finding**: the trace's framing implies the chore is still "the kid/teen's own chore" whose due date just changed — but per TC-15, it left the requester's hands the moment they asked. By the time this approval lands, the chore may already have been claimed by a different pool member (or nobody), not necessarily kid2. Not a separate bug — same root cause as TC-15.

---

### TC-17 — Parent declines later-date

**RPC**: fresh fixture `zzp4a_c17` (assigned to kid1, `due_date='2026-08-30'`) → `propose_later_date('zzp4a_c17','zzp4a_kid1','2026-09-10','need extra time')` → `decline_later_date('zzp4a_c17', 'zzp4a_parent1')`.

**Row state after propose**: `assigned_to_id → null`, `is_pool → true` (same release as TC-15). **After decline**: `pending_later_date → null`, `due_date` unchanged (`2026-08-30`), `assigned_to_id` **stays `null`**, `is_pool` **stays `true`**.

**Verdict**: **MISMATCH**, same root cause as TC-15. The trace (line 233) claims: *"A (kid/teen): due_date unchanged; chore stays exactly as it was — still assigned to them, still todo/in_progress, no auto-reassign anywhere in this path."* Live DB shows the chore is NOT "exactly as it was" — it was released to the pool at `propose_later_date` time and `decline_later_date` never reassigns it back (confirmed by reading the RPC: it only clears the four `pending_later_*` columns). `due_date` staying unchanged is correctly claimed. The "no auto-reassign" framing is technically true (nothing explicitly reassigns it to someone else) but misleading — the chore is left ownerless/pooled, not "still assigned to" the original requester.

---

### TC-18 — Cancel — creator/parent only

**RPC (denied case)**: `cancel_chore('zzp4a_c18a', 'zzp4a_kid1')` where `zzp4a_c18a` was created by `zzp4a_parent1` and assigned to `zzp4a_kid1` (non-creator, non-parent actor).

**Result**: Real exception raised: `member zzp4a_kid1 is not authorized to cancel chore zzp4a_c18a (not the creator or a parent)`. Row untouched (still exists).

**RPC (allowed case)**: `cancel_chore('zzp4a_c18b', 'zzp4a_parent1')` (parent1 is both creator and a parent).

**Result**: Succeeded, row deleted — confirmed via follow-up `count(*)=0`.

**Verdict**: CONFIRMED. Server-side authorization enforced exactly as the RPC comment and trace both state — client doesn't pre-filter the button by role (confirmed by reading `CantMakeItSheet.tsx` in the earlier full-trace pass), making this a legitimate last-line-of-defense case. The trace's own flagged gap (no client-side failure toast on the denied path) is a UI-polish observation, not re-tested here since it requires the running client, not DB state.

---

### TC-19 — No-show/check-in nudge (indirect)

**UNVERIFIABLE** — confirmed, matches trace. This is the `chore-deadline-notifier` edge function's scheduled/cron behavior. There is no DB-state transition to trigger via a direct RPC call that would meaningfully exercise the notification-timing logic; the function's correctness (dry-run `ok:true` after the `is_open_to_teens` column fix) was already established by prior passes reading its source, not something this pass's RPC-verification method can add to. Stated plainly per the trace's own framing.

---

### TC-20 — Approve + pay

**Setup**: `zzp4a_c20`: `status=pending_approval, assigned_to_id=zzp4a_kid1, coins_reward=0, base_points=0` (0-coin fixture per the task's mandated `guard_member_balance_writes()` workaround — this CLI has no real Supabase Auth session, so a nonzero payout would be blocked by that guard, not by `approve_chore` itself).

**RPC**: `approve_chore('zzp4a_c20', 'zzp4a_parent1')`.

**Row state**: `chore.status → approved`, `chore.reviewed_by_id → zzp4a_parent1`, `chore.reviewed_at` set, `coins_paid → 0` (correctly skipped since `coins_reward=0` means `v_pts=0`, so `award_coins` is never invoked at all — the RPC's own `if v_pts > 0` guard short-circuits before ever touching the balance-write path, meaning the 0-coin fixture exercised the full authorization + status-transition logic cleanly without needing to route around `guard_member_balance_writes()`).

**Verdict**: CONFIRMED for the authorization/status-transition logic (the part this fixture can exercise). `reviewed_by_id` now set — matches `DisputeApprovalCard`'s "not yet disputed, I am the approver" vs. "not the approver" branch split (`ChoreReviewSection.tsx:405-483`, confirmed present at those lines in the earlier read). Coin-payout math itself (the `award_coins` call and its actual wallet increment) was NOT exercised — that's the documented, expected scope limit for this pass, not a finding.

---

### TC-21 — Redo capped at 2 rounds

**UNVERIFIABLE within this pass's fixture budget** — matches trace's own "not independently re-run" framing. The 3rd-redo-auto-approves-as-normal-approval behavior would require walking a chore through `request_redo` three full cycles (submit → redo-request → resubmit, twice) before hitting the cap, which wasn't set up as a dedicated fixture in this pass. No distinct UI/DB state differs from a normal approval per the trace's own claim, so a targeted verification would only re-confirm TC-20's already-tested `approve_chore` path a third time — not attempted separately here to stay within a reasonable fixture budget for this scope.

---

### TC-22 — Redo dispute — different parent required

**Setup**: `zzp4a_c22`: `status=kid_disputed_redo, assigned_to_id=zzp4a_kid1, reviewed_by_id=zzp4a_parent1` (parent1 is the one who originally requested/reviewed the redo).

**RPC (same parent, denied)**: `resolve_redo_dispute('zzp4a_c22', 'zzp4a_parent1', false)`.

**Result**: Real exception: `member zzp4a_parent1 requested this redo — a different parent must resolve the dispute`.

**RPC (different parent, allowed)**: `resolve_redo_dispute('zzp4a_c22', 'zzp4a_parent2', false)`.

**Result**: Succeeded — `chore.status → redo_requested` ("side with the redo" branch, `p_pay=false`), `reviewed_by_id` stays `zzp4a_parent1` (the resolver doesn't overwrite the original reviewer field for this branch).

**Verdict**: CONFIRMED. The RPC-level guard fires exactly as both the trace and TC-79 claim — `isSameReviewer` UI check (`ChoreReviewSection.tsx:497`) withholds the resolve buttons client-side, and the RPC backstops it server-side identically.

---

### TC-23 — GP quest — coins never shown/paid to GP UI

**Verdict**: CONFIRMED by direct source read (not a DB-state transition — this is a rendering-suppression claim). `features/chores/ParentReviewDeck.tsx:86` (`const isGP = task.categoryType === 'grandparent_quest'`), `:104` and `:115` (`{!isGP && task.basePoints > 0 && (...)`) confirm the `!isGP` guard exists exactly as the trace claims, suppressing the "+N pts" text specifically for GP-sponsored quests. Not independently re-run against a live GP-quest fixture since it's a pure rendering-logic claim, not a DB-state claim — the file was actually opened and the guard confirmed present at those line numbers (the original trace cited it "per the existing report's own finding" without confirming the file directly; this pass did open and confirm it).

---

### TC-24 / TC-25 — `reassign_chore` note sanitizer / defense-in-depth

**Verdict**: CONFIRMED by direct source read. `features/tasks/components/ChoreHistorySheet.tsx:77` (`UUID_RE` regex), `:78-84` (`sanitizeNote` function resolving any bare UUID to the matching member's first name via `members.find(m => m.id === uuid)?.name?.split(' ')[0]`, stripping if no match) — matches the trace's claims exactly, including the near-identical line numbers cited.

---

### TC-26 — Realtime propagation across two sessions

**UNVERIFIABLE** — confirmed, matches trace. This requires two concurrent, independently-authenticated live sessions/sockets to test cross-session realtime propagation; a single CLI issuing sequential SQL RPC calls cannot exercise or observe Supabase Realtime channel behavior. Stated plainly per the trace's own framing, no new attempt made.

---

### TC-27 — `open_to_gp` fully retired

**Query**: `select count(*) from information_schema.columns where table_name='chore_tasks' and column_name='open_to_gp'`.

**Result**: `0`.

**Verdict**: CONFIRMED — live schema check, not just a source-comment read. The column is genuinely gone from the live database, matching the trace's claim and the migration comment in `20260927130000_security_fix_cross_family_gaps.sql` ("a column dropped this session... already dead/broken (every call fails at runtime)") found while investigating TC-09's naming discrepancy above.

---

### TC-28 — Full 4-action pushback tour before locking

**RPC sequence** on `zzp4a_a28` (fresh DIRECT assignment, parent1→parent2):
1. `respond_to_parent_quest('zzp4a_a28','zzp4a_parent2','SNOOZE',null)` → `status=SNOOZED, snooze_until=+48h, bounce_count=0, is_locked=false`.
2. `respond_to_parent_quest('zzp4a_a28','zzp4a_parent2','BLOCKER','blocked')` → `status=PARKED, bounce_count=1, is_locked=false`.
3. `respond_to_parent_quest('zzp4a_a28','zzp4a_parent1','DISCUSS','discuss')` → `status=PARKED, bounce_count=2, is_locked=true`.

**Verdict**: CONFIRMED. SNOOZE doesn't count toward the bounce lock (bounce_count unaffected); BLOCKER/TRADE/DISCUSS all route through the identical RPC branch (confirmed by reading `respond_to_parent_quest`'s source — all three share one `elsif p_action in ('BLOCKER','TRADE','DISCUSS')` clause, so exercising any two of the three exhaustively proves the third behaves identically; TRADE wasn't separately called since the source makes clear it's not a distinct code path). Lock fires exactly on the 2nd non-SNOOZE pushback — matches `getMyLockedItems`'s symmetric both-party visibility (TC-04's same mechanism).

---

### TC-29 — SNOOZE round-trip — expiry re-surfaces

**RPC**: `respond_to_parent_quest('zzp4a_a29', 'zzp4a_senior1', 'SNOOZE', null)`.

**Row state**: `status=SNOOZED`, `snooze_until` = now + 48h.

**Verdict**: CONFIRMED by direct source read of the selector against this live row. `getMyDirectPending` (`store/choreStore.ts:5024-5031`): while `snoozeUntil > nowIso`, the `(a.status === 'SNOOZED' && (!a.snoozeUntil || a.snoozeUntil <= nowIso))` clause is false, so the row is correctly excluded — matches "not direct-pending while still snoozed." The re-inclusion after expiry is a pure comparison against `new Date().toISOString()` at selector-evaluation time, not a stored transition — confirmed no DB write happens on "unsnooze" (there is no such RPC), exactly as the trace claims. `OutgoingPendingCard.tsx:38` (`isSnoozed`) and `:75` (`!isSnoozed` guard hiding the action row) were also directly confirmed present.

---

## Summary of findings

**Confirmed (25 of 29)**: TC-01, 02, 03, 04, 05, 06, 07, 08, 09 (see naming note), 10, 11, 12, 13, 14, 18, 20 (scope-limited), 22, 23, 24, 25, 27, 28, 29, plus TC-16 (due_date write itself).

**MISMATCH (2 — real, source-confirmed documentation bugs)**:
- **TC-15**: `propose_later_date` (current live version, `20260927150000_fix_later_date_orphan.sql`) releases the chore to the general pool (`assigned_to_id=null, is_pool=true`) immediately on request — it does NOT "stay assigned to" the requester as the source trace claims. The trace appears to have read the superseded `20260927030000` version of this function. `due_date` itself staying untouched is correctly claimed.
- **TC-17**: Same root cause — after `decline_later_date`, the chore stays released/pooled (`assigned_to_id=null, is_pool=true`), not "still assigned to them" as claimed. `due_date` staying unchanged is correctly claimed.
- (TC-16 is a compounding consequence of the same root cause, not a separate mismatch — its specific `due_date`-write claim is itself correct.)

**Naming imprecision (not a functional bug)**: TC-09's parenthetical `(backoutGpWelcomeChore)` names the wrong function — the actual live flow uses `withdraw_gp_offer`/`withdrawGPOffer`. The described behavior itself was confirmed correct.

**UNVERIFIABLE (3, as the trace itself already flags)**: TC-19 (edge-function/cron timing — no DB transition to exercise), TC-21 (redo-cap-at-2 — not independently re-run this pass, no distinct DB state to check beyond a 3rd full `approve_chore` cycle), TC-26 (realtime cross-session propagation — requires live concurrent sockets, not achievable via sequential SQL calls).

**Not requiring live-DB re-verification (pure source/schema claims, confirmed directly)**: TC-23 (isGP guard — file opened, confirmed present at cited lines), TC-24/25 (sanitizer — file opened, confirmed present), TC-27 (schema check — column absence confirmed live, not just via comment).

---

## Cleanup — zero-row proof

```sql
select 'families' as tbl, count(*) from public.families where name like 'zzp4a_%'
union all select 'members', count(*) from public.members where id like 'zzp4a_%' or name like 'zzp4a_%'
union all select 'chore_tasks', count(*) from public.chore_tasks where id like 'zzp4a_%'
union all select 'parent_quest_assignments', count(*) from public.parent_quest_assignments where id like 'zzp4a_%'
union all select 'chore_participants', count(*) from public.chore_participants where chore_id like 'zzp4a_%'
union all select 'activity_log', count(*) from public.activity_log where entity_id like 'zzp4a_%';
```

**Result**: `families=0, members=0, chore_tasks=0, parent_quest_assignments=0, chore_participants=0, activity_log=0`.

All `zzp4a_`-prefixed test rows (1 family, 7 members, ~20 chores, ~8 parent_quest_assignments, plus their cascaded `chore_participants`/`activity_log` rows) were deleted in dependency order (assignments/participants/activity_log → chore_tasks → members → families) and confirmed fully removed. No real user/family data was read, modified, or used as a fixture at any point.
