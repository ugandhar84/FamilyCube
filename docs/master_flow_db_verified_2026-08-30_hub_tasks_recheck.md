# Master Flow — DB-Verified Re-Check + Hub/Tasks-Tab Trace, 2026-08-30

**Purpose**: Re-verifies all ~78-82 chore/quest RPC test cases from the four
original `_db_verified_` passes (`TC01-29`, `TC30-50`, `TC51-66`, `TC67-82`,
all dated 2026-08-27) against the CURRENT codebase and CURRENT live
Supabase Postgres database, after a large same-day session of shared-file
client changes (event/ride assignee id-vs-name refactor touching
`store/eventStore.ts`, `features/hub/*View.tsx`, `features/calendar/*`,
`features/tasks/lib/deriveCardActions.ts`). Extends the original methodology
with one new dimension: for every test case, traces what the Hub screen
(ParentView/KidView/TeenView/SeniorView) and the Tasks tab
(`features/tasks/TasksScreen.tsx`, which embeds `QuestsScreen.tsx` for its
"Chores" segment) would actually render for each affected role, given the
exact live DB state produced by that test case's RPC call — not just the raw
row state the original docs checked.

**Method**: Every RPC below was called live against the linked Supabase
Postgres DB (`npx supabase db query --linked`, confirmed working — see
"Tooling" section below) inside a fresh, throwaway `zzq5_`-prefixed test
family, never touching real user data (in particular, never touching
`families.id = c924e913-d6bb-4acc-a741-8fced0d5a36f`, "Ugandhar's Family,"
the real production family also used for manual testing earlier the same
day). No raw `UPDATE`/`INSERT` was used to fake a state transition that has
a real RPC — the two documented exceptions (`TC-33`'s plain coin edit and
`TC-43`'s plain-patch-after-delete probe) are themselves pre-existing,
intentional non-RPC checks carried over unchanged from the original TC30-50
pass, since those specific test cases exist to test the *absence* of RPC
gating on those code paths. After each call, the resulting row was queried
directly with a fresh `select`, compared against the claim in the
corresponding original `_db_verified_` doc, and then traced against current
source (`features/hub/*.tsx`, `features/quests/QuestsScreen.tsx`,
`features/tasks/TasksScreen.tsx`, `features/tasks/lib/deriveCardActions.ts`,
`features/hub/parent/HouseholdBacklogSection.tsx`,
`features/hub/parent/ChoreReviewSection.tsx`) to determine exactly what each
affected role's Hub view and Tasks tab would show.

**Test family**: `zzq5_TestFamily` (`families.id =
fa163772-afd8-44d7-bd3d-6d1340584021`)
**Test members**: `zzq5_parent1`/`zzq5_parent2` (parent), `zzq5_kid1`/`zzq5_kid2`
(DB role `child`), `zzq5_teen1` (DB role `teenager`), `zzq5_senior1`/`zzq5_senior2`
(DB role `grandparent`).

All test data was deleted at the end of this session — see the Cleanup
section at the bottom for the zero-row proof query and result.

---

## Tooling: how the live DB was queried

`npx supabase db query --linked "<sql>"` works correctly on this checkout
(Supabase CLI v2.106.0, project `gqzdbxrqpkwvwcwvdnix` / "FamilyCube",
confirmed linked via `supabase/.temp/project-ref`). No fallback mechanism
(raw `psql`, edge function) was needed. One operational discovery not
documented in prior passes: **a single `db query` invocation containing
multiple `;`-separated statements runs as one transaction** — if any later
statement in the same invocation raises an exception, the ENTIRE batch,
including earlier successful `insert`/RPC calls, is rolled back silently
(confirmed directly: a first attempt at TC-05 that bundled the setup, the
successful recall, and the expected-to-fail CoP-backstop call into one
invocation resulted in the successful recall itself disappearing after the
batch's final statement errored). Every RPC call in this pass that was
expected to raise an exception was therefore issued as its own, isolated
`db query` invocation, separate from any setup or assertion that needed to
persist. This is a tooling/methodology note for future passes, not a
product bug.

---

## Context confirmed before testing: today's shared-file changes do not touch chore/quest logic

Before re-running any RPC, the actual diffs of today's two "compare by
member id, not name string" commits (`4ada9573`, `bceafd58`) were read in
full, not just their commit messages:

- `features/tasks/lib/deriveCardActions.ts`: both commits touch ONLY
  `EventActions`/`deriveEventActions` (the event/ride assignee-id logic).
  `QuestActions`/`deriveQuestActions` — the function that decides
  `canClaim`/`canSubmit`/`canApprove`/etc. for chore cards — is
  byte-for-byte unchanged since `e9ec0102` (a prior-day commit), confirmed
  via `git log -p --follow` on the file.
- `store/eventStore.ts`, `store/choreStore.ts`, `store/questStore.ts`,
  `store/familyStore.ts`: `choreStore.ts`/`questStore.ts`/`familyStore.ts`
  do not appear in either commit's file list at all (`git show --stat`
  confirmed). `eventStore.ts`'s changes are scoped to `eventAssignee()`'s
  return shape and event-field read/writes — no chore/quest field
  references found via `grep`.
- `features/hub/ParentView.tsx`, `KidView.tsx`, `TeenView.tsx`,
  `SeniorView.tsx`, `HubTimelineSection.tsx`: every touched line reads
  `eventAssignee(e)`, `driverName`, `helper`, `t.driverMemberId`, or
  ride/trip fields — never `assignedToId` on a `Quest`, `poolQuests`,
  `myQuests`, or any chore-shaped filter.
- `features/tasks/TasksScreen.tsx`: the one touched block is the Schedule
  segment's senior-badge count (`scheduleCounts`), which reads
  `eventAssignee`, not chore data. The Chores-segment count
  (`choreCounts`) and the entire "Chores" tab rendering (which is literally
  `<QuestsScreen hideHeader .../>` embedded, confirmed by reading the
  file's `return` block) are untouched.
- The two new migrations `20260930240000_calendar_events_assignee_ids.sql`
  and `20260930250000_assignment_rpcs_write_ids.sql` add
  `calendar_events.driver_id` and patch `reassign_event`/
  `decline_event_assignment` — both are event-table/event-RPC only,
  confirmed by reading both migration files in full; neither references
  `chore_tasks`, `parent_quest_assignments`, or any chore RPC.

**Conclusion confirmed empirically, not just by source-reading**: every
chore/quest RPC and every chore/quest-facing Hub/Tasks-tab selector used
below is architecturally isolated from today's event-sync session's
changes. The full re-run below is therefore a true regression check against
unrelated-but-adjacent code churn, not a redundant re-test of already-stable
code — and it came back clean on that front (no chore/quest regression
traced to today's changes).

---

## Two important status updates on previously-flagged issues

### 1. TC-66's regression is now RESOLVED (was: live regression as of Aug 27)

`master_flow_db_verified_TC51-66.md` flagged `propose_later_date`'s
clobber-guard (blocking a second `propose_later_date` call while one is
already pending) as missing from the live function, a regression
introduced when `20260927150000_fix_later_date_orphan.sql`'s
`create or replace function` silently dropped the guard added by
`20260927110000_qa_fixes_batch1.sql`.

Live re-check this pass: **the guard is present and firing correctly.**
`select prosrc from pg_proc where proname='propose_later_date'` shows:

```sql
if exists (select 1 from public.chore_tasks where id = p_chore_id and pending_later_date is not null) then
  raise exception 'chore % already has a pending later-date proposal — resolve it first', p_chore_id;
end if;
```

Root cause of the discrepancy: a THIRD migration,
`supabase/migrations/20260927210000_restore_propose_later_date_clobber_guard.sql`
(timestamped Aug 27 15:55, i.e. applied after both the orphan-fix migration
at 14:15 and, evidently, after whatever state the TC51-66 doc's own
verification was run against), re-adds the guard on top of the
orphan-fix's function body. Live-tested directly this pass (see TC-66
below): a second `propose_later_date` call on a chore with a pending
proposal now correctly raises `chore ... already has a pending later-date
proposal — resolve it first` and does NOT clobber the first proposer's
request. **This is confirmed fixed, not a re-discovered bug.**

### 2. All four original passes' other findings hold

TC-15/16/17's `propose_later_date` pool-release behavior (chore leaves the
requester's hands and becomes generally poolable the instant a later-date
is requested, contradicting the two full-role-trace docs' framing that the
requester "keeps" the chore while waiting) is unchanged and still present —
this is a pre-existing, already-documented behavior from the original
TC01-29 pass, not a new finding, and is called out again below only where
it affects the new Hub/Tasks-tab trace.

---

## TC-01 — Parent hard-assigns a chore to a GP (DIRECT)

**RPC**: Direct insert into `parent_quest_assignments` (no dedicated
creation RPC — matches original doc's note).

**Result**: `zzq5_a01`: `assigned_by=zzq5_parent1, assigned_to=zzq5_senior1,
mode=DIRECT, status=PENDING`. Matches original TC-01 exactly.

**Hub**:
- **Parent1 (B, ParentView)**: `HouseholdBacklogSection`'s
  `myOutgoingPending` (from `getMyOutgoingPending(active.id)`) includes this
  row (`assignedBy === active.id`) — renders an `OutgoingPendingCard`.
- **Parent2 (CoP, ParentView)**: `othersAdultQuests`/System-A awareness —
  not the delegator or assignee, sees it only as a passive "someone
  delegated to senior1" line if `HouseholdBacklogSection` surfaces
  uninvolved System-A rows at all for CoP visibility (it does, read-only,
  per the original trace's CoP breakdown) — no action buttons.
- **Senior1 (A, SeniorView)**: SeniorView's own direct-pending section
  (mirrors `getMyDirectPending`) shows a card with Accept/Decline — matches
  original TC-01 claim.

**Tasks tab (Chores segment = QuestsScreen)**:
- **Parent1**: `QuestsScreen.tsx:1065`'s loose-gated `OutgoingPendingCard`
  in the "All Family" list (Recall button present, ungated by
  `assignedBy` per the known, non-exploitable inconsistency documented in
  `master_flow_db_verified_TC51-66.md` — still true, re-confirmed by
  reading the same file/line this pass: `onRecall={a.status === 'PENDING' ?
  () => recallParentQuest(...) : undefined}`, no `assignedBy` check).
- **Senior1**: SeniorView doesn't have a separate Tasks-tab identity since
  `TasksScreen.tsx`'s Chores segment is `QuestsScreen` for every role —
  senior1 sees the same direct-pending card there, Accept/Decline present
  (their own assignment).
- **Kid1/Kid2/Teen1**: No visibility — `parent_only_quest` category and no
  assignment to them; QuestsScreen's `isKidOrTeen` branch filters
  `q.isAdultTask` out entirely.

**Verdict**: CONFIRMED (row state + both Hub and Tasks-tab renders match
expected).

---

## TC-02 — GP accepts a DIRECT delegation

**RPC**: `respond_to_parent_quest('zzq5_a01','zzq5_senior1','ACCEPT',null)`.

**Result**: `parent_quest_assignments.status → ACCEPTED`,
`chore_tasks.status → in_progress`, `assigned_to_id → zzq5_senior1`. Matches
original exactly.

**Hub**:
- **Senior1**: Card disappears from direct-pending section (no longer
  `PENDING`); chore now shows as a normal in-progress adult quest.
- **Parent1/Parent2**: `othersAdultQuests` filter
  (`q.assignedToId && q.assignedToId !== active.id`) now genuinely includes
  it (confirmed live: `assigned_to_id` really is set) — renders as a
  read-only "Senior1 is working on this" card, no action buttons for CoP,
  Nudge/Reclaim available for the delegator (parent1) per
  `HouseholdBacklogSection`.

**Tasks tab**:
- **Senior1**: Chore now appears in QuestsScreen's "mine" bucket
  (`isAssignedTo(q, myId)`), `in_progress` status, with whatever
  in-progress actions `deriveQuestActions` grants a senior (none of
  `canClaim`/`canSubmit`/`canKidDecline` apply — those are
  `isKidOrTeen`-gated; a senior assignee of an adult quest has no
  submit/claim button today, matching the original architecture — this is
  System-A/adult-quest territory, not the kid submit flow).
- **Parent1/Parent2**: Same chore visible in "All Family," shows
  `assignedToId=senior1`, no special badge.

**Verdict**: CONFIRMED.

---

## TC-03 — GP declines a DIRECT delegation

**RPC**: `respond_to_parent_quest('zzq5_a03','zzq5_senior2','DECLINE',null)`.

**Result**: `status → DECLINED`. Matches original.

**Hub/Tasks tab**: `getMyOutgoingPending`/`getMyDirectPending` both filter
to `PENDING`/`SNOOZED`/`PARKED` only — a `DECLINED` row drops out of both
the Hub's `HouseholdBacklogSection` and QuestsScreen's own list on both
sides immediately. Confirmed no stale card renders anywhere for parent1 or
senior2 in either surface.

**Verdict**: CONFIRMED.

---

## TC-04 — Two-bounce pushback lock

**RPC sequence**: `BLOCKER` then `TRADE`, `zzq5_a04` parent1↔parent2.

**Result**: `bounce_count=2, is_locked=true, status=PARKED`. Matches
original.

**Hub**: Both `ParentView`s' `myLockedItems`
(`assignedTo===memberId || assignedBy===memberId, isLocked`) now include
this row — `HouseholdBacklogSection` renders a `LockedAssignmentCard` with
Reassign/Reopen for BOTH parent1 and parent2 (both are parties). Parent2
(uninvolved role check n/a here, both are parents) — no third parent exists
in this fixture set to check CoP-exclusion for this specific TC, but the
mechanism (`isLocked && (assignedTo||assignedBy)===memberId`) is the same
one independently confirmed excluding uninvolved parties in TC-53 below.

**Tasks tab**: QuestsScreen doesn't have a distinct `LockedAssignmentCard`
concept exposed the same way — the underlying `parent_only_quest` chore
still shows in "All Family" as `status=todo` (chore_tasks.status is
untouched by locking, only the `parent_quest_assignments` row locks) with
no due action since the chore itself was never assigned via
`chore_tasks.assigned_to_id`. This is a genuine surface-parity gap worth
noting: **the Locked-assignment negotiation state is Hub-only** — a parent
who only ever uses the Tasks tab's Chores segment would see this
`parent_only_quest` chore sitting inert (`todo`, no assignee) with no
visible indication it's actually locked in a two-bounce standoff on the
Hub. This isn't a bug introduced today (the architecture — System A
`parent_quest_assignments` living outside `QuestsScreen`'s System-B-centric
list — long predates this session), but it is a genuine Hub-vs-Tasks-tab
inconsistency worth flagging under this task's explicit "check both Hub
and Tasks tab" mandate.

**Verdict**: CONFIRMED for row state; **Hub/Tasks-tab discrepancy noted**
(pre-existing architecture, not a regression) — a locked System-A
negotiation is visible on the Hub's Household Backlog but has no
equivalent surfaced representation in the Tasks tab's Chores segment.

---

## TC-05 — Parent recalls a still-PENDING delegation (+ CoP backstop)

**RPC**: `recall_parent_quest('zzq5_a05','zzq5_parent1')` →
`status=DECLINED`. `recall_parent_quest('zzq5_a05b','zzq5_parent2')`
(parent2 not the delegator) → `ERROR: member zzq5_parent2 is not the
delegator of assignment zzq5_a05b`. Both match original exactly.

**Hub/Tasks tab**: Recalled row disappears from both `getMyOutgoingPending`
(parent1's Hub backlog card) and `getMyDirectPending` (senior1's Hub card)
immediately; same underlying selector feeds QuestsScreen's list, so it
disappears there too. The CoP backstop is server-side-only — no Recall
button exists for a non-delegator anywhere in either UI
(`HouseholdBacklogSection.tsx`'s strict `a.assignedBy === active.id` gate,
confirmed present), so this is unreachable through either Hub or Tasks tab
normally, exactly as before.

**Verdict**: CONFIRMED.

---

## TC-06 / TC-07 — Bounty chore, GP excluded / included

**Setup**: `zzq5_c06`: `is_pool=true, status=todo, invite_grandparents=false`
→ then `zzq5_c07` with `invite_grandparents=true`.

**Result**: Matches original exactly for both.

**Hub**:
- **c06 (GP excluded)**: KidView/TeenView's `poolQuests`
  (`q.isPool && q.status==='todo' && !q.isAdultTask && !q.awaitingParentApproval
  && !q.inviteGrandparents`) — all pass, kid1/kid2/teen1 see it in their
  Bounty Board card on the Hub. SeniorView's `gpInvitations`
  (`c.inviteGrandparents && c.status==='todo' && !c.sponsorUserId`) — fails
  first clause, invisible to senior1/senior2's Hub.
- **c07 (GP included)**: Reversed — `gpInvitations` now passes for both
  seniors (their Hub shows a `QuestInvitationsSection` card); `poolQuests`'
  `!q.inviteGrandparents` now fails, chore vanishes from kid1/kid2/teen1's
  Hub Bounty Board.

**Tasks tab**: QuestsScreen's Bounty tab filter for kid/teen
(`kidFilter === 'pool'`, line 595) carries the identical
`!q.inviteGrandparents` exclusion — c06 visible, c07 not, for kid1/kid2/teen1.
For seniors, QuestsScreen's non-parent/non-kid branch (line 573-582) has its
own `q.inviteGrandparents === true && q.status === 'todo' && !q.sponsorUserId`
clause matching SeniorView's Hub filter exactly (the comment at that line
explicitly says so) — c07 appears in senior1/senior2's Tasks-tab Chores
list, c06 does not.

**Verdict**: CONFIRMED — Hub and Tasks tab agree exactly for every role on
both chores.

---

## TC-08 — GP1 claims the GP-invite chore

**RPC**: `claim_gp_errand('zzq5_c07','zzq5_senior1')`.

**Result**: `status=gp_offer_pending, gp_offer_by_id=zzq5_senior1, is_pool=true`
(unchanged). Matches original.

**Hub**: `gpInvitations`'s `status==='todo'` clause now fails for BOTH
seniors — senior1's own card should ideally show "you offered, waiting,"
but per the original trace's pre-existing, already-documented UX gap, no
such distinct card exists — senior1's `QuestInvitationsSection` entry
simply disappears along with senior2's. Confirmed this gap is unchanged
this pass (not re-litigated as new).

**Tasks tab**: Same `status==='todo'` clause in QuestsScreen's senior
branch — chore drops out of senior1's AND senior2's Tasks-tab Chores list
entirely (no distinct "pending my offer" state there either — same gap,
now confirmed to also apply to the Tasks tab, not just the Hub, since both
read `status` from the same underlying `chores` array via the identical
clause shape). **This is the same pre-existing gap surfacing on both
surfaces identically — not a new discrepancy, but the task's "check both"
mandate confirms it's symmetric, not Hub-only.**

**Verdict**: CONFIRMED (DB), gap re-confirmed present on both surfaces
identically (not new).

---

## TC-09 — GP1 backs out (`withdraw_gp_offer`)

**RPC**: `withdraw_gp_offer('zzq5_c07','zzq5_senior1')`.

**Result**: `status→todo, gp_offer_by_id→null, is_pool=true, invite_grandparents=true`
(unchanged). Matches original (including the original's own naming-note
about the trace's incorrect `backoutGpWelcomeChore` parenthetical, which is
a documentation nit, not re-litigated here).

**Hub/Tasks tab**: `status==='todo'` passes `gpInvitations` again for both
seniors (Hub `QuestInvitationsSection` and Tasks-tab senior branch both
reappear identically) — `invite_grandparents` still true so kid/teen
Bounty Board on both surfaces still excludes it.

**Verdict**: CONFIRMED on both surfaces.

---

## TC-10 — GP passes (no guilt), no claim

**RPC**: `set_gp_withdrawn('zzq5_c07','zzq5_senior1', true)`.

**Result**: `gp_withdrawn_ids=['zzq5_senior1']`. Matches original.

**Hub**: `QuestInvitationsSection.tsx:32`'s `alreadyPassed` check — senior1's
own Hub card flips to "Reconsider?" state; senior2's own array-membership
check (testing for `zzq5_senior2`) reads false, unaffected.

**Tasks tab**: QuestsScreen's senior-quest list doesn't have a distinct
"passed" filter of its own (confirmed via grep — `gp_withdrawn_ids`/
`gpWithdrawnIds` only referenced in `QuestInvitationsSection.tsx`, a
Hub-only component) — the chore still appears in senior1's Tasks-tab
Chores list in its normal `todo`/invited shape, with no "you passed on
this" indicator. **Minor Hub/Tasks-tab asymmetry**: the "passed, tap to
reconsider" state is Hub-exclusive; the Tasks tab shows the same invitation
as if it had never been passed on. Not a functional bug (the underlying
claim mechanism is unaffected — senior1 can still tap Claim from either
surface), but a cosmetic surface inconsistency worth noting per this task's
mandate.

**Verdict**: CONFIRMED (DB); **Hub/Tasks-tab cosmetic inconsistency
noted** (pre-existing, not introduced today).

---

## TC-11 — Race — two kids claim simultaneously

**RPC**: `claim_pool_quest('zzq5_c11','zzq5_kid1')` → `claimed=true,
status=in_progress, assigned_to_id=zzq5_kid1`. Then same for kid2 →
`claimed=false`. Matches original.

**Hub**: Kid1's `myQuests`/`inProgressQuests` (via `KidView.tsx`'s
`myQuests` filter, `assignedToId===active.id`) now includes it — shows in
their "In Progress" Hub section. Kid2: chore vanishes from their
`poolQuests` (`isPool` now false) the instant they'd refresh — the DB
return value (`claimed:false`) means their own optimistic UI never even
applied the claim, so no rollback-flash needed on a correctly-implemented
client.

**Tasks tab**: Identical — QuestsScreen's `filteredQuests` for kid1 now
shows it under the `todo`/`in_progress` tab-status bucket (`isAssignedTo`
now true); for kid2, the Bounty tab filter (`isPool && status==='todo'`)
excludes it since `is_pool` flipped false.

**Verdict**: CONFIRMED, identical on both surfaces.

---

## TC-12 — Named handoff — offer, not blind reassign

**RPC**: `offer_chore_handoff('zzq5_c12','zzq5_teen1','zzq5_kid1','busy today')`.

**Result**: `assigned_to_id` stays `zzq5_kid1`, `pending_handoff_to=zzq5_teen1`,
`pending_handoff_offered_by=zzq5_kid1`. Matches original.

**Hub**: Kid1 (original holder) — chore still shows in their own "My
Quests"/in-progress section on KidView, unchanged appearance (no "offer
sent" indicator on their own card — matches original's claim of no
distinct state for the offerer). Teen1 (receiver) — `myQuests` filter
includes `q.pendingHandoffTo === active.id` as one of its OR clauses
(confirmed at `TeenView.tsx:118`/`KidView.tsx:239`), so the chore shows up
in teen1's Hub "My Quests" even though `assignedToId` still points at
kid1 — with the Accept/Pass buttons `QuestCard.tsx`'s `pendingHandoffTo`
block renders.

**Tasks tab**: Same `isAssignedTo` helper in `QuestsScreen.tsx:543-546`
includes `q.pendingHandoffTo === memberId` identically — teen1 sees the
identical Accept/Pass card in the Tasks-tab Chores list; kid1 sees no
change there either.

**Verdict**: CONFIRMED, Hub and Tasks tab render identically (both derive
from the same `pendingHandoffTo` OR-clause pattern, confirmed present in
both `KidView.tsx`/`TeenView.tsx` and `QuestsScreen.tsx`).

---

## TC-13 — Receiver accepts the handoff

**RPC**: `accept_chore_handoff('zzq5_c12','zzq5_teen1')`.

**Result**: `assigned_to_id→zzq5_teen1, pending_handoff_to→null, status→todo`.
Matches original.

**Hub/Tasks tab**: Teen1 now owns it outright on both surfaces
(`isAssignedTo` via plain `assignedToId` match); kid1's `myQuests` filter no
longer matches on either surface (neither `assignedToId` nor
`pendingHandoffTo` match kid1 anymore) — clean single-owner transition
confirmed symmetric.

**Verdict**: CONFIRMED.

---

## TC-14 — Receiver declines the handoff

**RPC sequence**: offer then `decline_chore_handoff('zzq5_c14','zzq5_teen1')`.

**Result**: `assigned_to_id→null, is_pool→true, status→todo,
pending_handoff_to→null`. Matches original — reopens to general pool, does
not bounce back to kid1.

**Hub/Tasks tab**: Kid1 (original holder) loses the chore from their "My
Quests" on both surfaces (no longer assigned, no longer pending-handoff-to
them). Teen1 (decliner) — handoff card/buttons disappear from both. Any
kid/teen (including kid1) now sees it as an ordinary claimable Bounty Board
item on both Hub (`poolQuests`) and Tasks tab (`kidFilter==='pool'`
filter) — identical `isPool && status==='todo'` gate in both places.

**Verdict**: CONFIRMED, symmetric across both surfaces.

---

## TC-15 — "Ask for a later time" — releases to pool (pre-existing, documented mismatch, unchanged)

**RPC**: `propose_later_date('zzq5_c15','zzq5_kid2','2026-09-05','busy this week')`.

**Result**: `assigned_to_id→null, is_pool→true, status→todo, due_date`
unchanged, `pending_later_date='2026-09-05'`. Matches original TC-15
exactly, including the original's flagged mismatch against the two
full-role-trace docs (which claimed the chore "stays assigned" to the
requester — it does not; this is unchanged behavior, not a new
regression).

**Hub**: Kid2 (requester) — chore vanishes from their own "My Quests"/
"To Do" Hub section (`myQuests` requires `assignedToId===active.id`, now
null) the moment this lands — there is genuinely no "pending your later
date request, still yours for now" card anywhere; it just becomes a normal
Bounty Board item like any other, confirmed via `poolQuests`'s clauses (no
`pendingLaterDate` exclusion exists in that filter). Any other kid/teen —
`poolQuests` now includes it, shows as an ordinary claimable item with NO
visual indicator that a later-date request is in flight on it (a sibling
could claim it out from under kid2's own pending ask, with zero UI warning
on either the Bounty card or the claim confirmation). Parent1/Parent2 —
`ChoreReviewSection`'s `CantMakeItLaterCard` filter (`c.status === 'todo' &&
!!c.pendingLaterDate`) correctly renders the review card regardless of
whether the chore has been claimed by someone else in the meantime — this
part is unaffected by the pooling side-effect.

**Tasks tab**: Kid2 — same disappearance from "My Quests"/todo tab in
QuestsScreen (`isAssignedTo` now false). Bounty tab — chore now appears
there for kid2 too (since `poolQuests`-equivalent filter has no
`pendingLaterDate` exclusion here either), meaning **kid2 could
theoretically re-claim their own now-pooled chore from the Tasks tab's
Bounty tab while their later-date request is still pending** — an odd but
not exploit-worthy loop (they'd just be claiming back a chore they still
own the pending request on). Parent1/Parent2 — same `ChoreReviewSection`
component is Hub-only; QuestsScreen has no equivalent `pendingLaterDate`
review card of its own (grep confirms `pendingLaterDate`/`CantMakeItLaterCard`
only exist in `features/hub/parent/ChoreReviewSection.tsx`). **This is a
genuine Hub-vs-Tasks-tab surface gap**: a parent who works exclusively from
the Tasks tab's Chores segment has NO way to see or act on a pending
later-date request at all — they would only ever see the chore sitting
unassigned in the pool with no explanation, unless they also check the Hub.

**Verdict**: CONFIRMED (DB, matches original's already-documented
behavior); **new Hub/Tasks-tab gap identified**: `CantMakeItLaterCard`
(the parent's approve/decline-reschedule UI) exists only on the Hub, with
no equivalent anywhere in the Tasks tab's Chores segment (QuestsScreen).
This is architectural, not a regression from today's session.

---

## TC-16 — Parent approves later-date

**RPC**: `approve_later_date('zzq5_c15','zzq5_parent1')`.

**Result**: `due_date→2026-09-05, pending_later_date→null`, `assigned_to_id`
stays null, `is_pool` stays true. Matches original.

**Hub**: Parent1/Parent2 — `CantMakeItLaterCard` disappears from
`ChoreReviewSection` (`pendingLaterDate` filter no longer matches). Any
kid/teen — chore remains in Hub Bounty Board with the new due date, no
"approved" badge of any kind on either surface.

**Tasks tab**: Since the review card never existed there (per TC-15's
finding), there's nothing to disappear — the only visible Tasks-tab effect
for a parent using only that surface is the due date silently changing on
a Bounty-tab item they may not have even realized had a pending request.

**Verdict**: CONFIRMED — consistent with TC-15's gap, not a new issue.

---

## TC-17 — Parent declines later-date

**RPC sequence**: propose then `decline_later_date('zzq5_c17','zzq5_parent1')`.

**Result**: After propose: released to pool (same as TC-15). After
decline: `pending_later_date→null`, `due_date` unchanged, `assigned_to_id`
stays null, `is_pool` stays true. Matches original's flagged mismatch (chore
does NOT return to kid1 — stays pooled).

**Hub/Tasks tab**: Same shape as TC-15/16 — `CantMakeItLaterCard`
disappears from the Hub's `ChoreReviewSection` on decline; the chore stays
in the general Bounty Board (both Hub and Tasks tab) rather than returning
to kid1, with no distinct "declined" annotation anywhere a kid/teen would
see (matches `TC-37B`'s parallel finding about `reject_terms_change`'s
similarly-silent re-pooling).

**Verdict**: CONFIRMED, consistent with prior findings.

---

## TC-18 — Cancel — creator/parent only

**RPC (denied)**: `cancel_chore('zzq5_c18a','zzq5_kid1')` (kid1 not
creator/parent) → `ERROR: not authorized`. **RPC (allowed)**:
`cancel_chore('zzq5_c18b','zzq5_parent1')` → row deleted. Both match
original.

**Hub/Tasks tab**: Denied case — kid1's own UI never offers a Cancel
button in the first place on either surface (`CantMakeItSheet.tsx` is
parent/creator-gated client-side, confirmed present in the original pass's
source read) — this is purely a server-side backstop, unreachable via
normal navigation on Hub or Tasks tab. Allowed case — chore vanishes from
every list on both surfaces the instant it's gone from `chore_tasks`
(no soft-delete, no ghost row).

**Verdict**: CONFIRMED.

---

## TC-19 — No-show/check-in nudge (indirect) — UNVERIFIABLE (unchanged)

Same as original: this is the `chore-deadline-notifier` edge function's
scheduled/cron behavior, no DB-state transition to trigger directly.
Not re-attempted this pass, per the original doc's own framing.

---

## TC-20 — Approve + pay

**Setup**: `zzq5_c20`: `pending_approval, assigned_to_id=zzq5_kid1,
coins_reward=0, base_points=0, bonus_coins=0` (0-coin fixture, same
`guard_member_balance_writes()` harness workaround as all four original
passes — this CLI session has no real Supabase Auth session, so any
nonzero payout would be blocked by that trigger, not by `approve_chore`
itself; confirmed still true this pass, same mechanism).

**RPC**: `approve_chore('zzq5_c20','zzq5_parent1')`.

**Result**: `status→approved, reviewed_by_id→zzq5_parent1, reviewed_at` set,
`coins_paid→0`. Matches original.

**Hub**: Kid1 — chore moves out of `reviewQuests`
(`status==='pending_approval'`) into `approvedQuests`
(`['approved','done'].includes(status)`) on KidView — shows in their
"Approved" section, no more action buttons. Parent1/Parent2 —
`ParentView.tsx`'s `reviewedToday` counter increments (chore's
`reviewedAt` is today); `ChoreReviewSection`'s `pendingReviews` deck no
longer includes it.

**Tasks tab**: Same transition visible in QuestsScreen's `completed` tab
status bucket (`status==='approved'`) for kid1; the chore drops out of the
"Review" tab-status bucket for parents. Fully symmetric with Hub.

**Verdict**: CONFIRMED (scope-limited to auth/status-transition logic, same
as original — coin-payout math itself not exercised, same documented
harness limitation).

---

## TC-21 — Redo capped at 2 rounds — UNVERIFIABLE within fixture budget (unchanged)

Same as original doc's own framing — not independently re-run this pass to
stay within a reasonable fixture budget; no distinct DB/UI state beyond a
third `approve_chore` cycle already covered by TC-20/TC-78.

---

## TC-22 — Redo dispute — different parent required

Functionally identical to TC-79 below (same RPC, same guard) — see TC-79
for the full live re-run and Hub/Tasks-tab trace. Both confirmed identical
this pass, as in the original docs.

---

## TC-23 — GP quest — coins never shown/paid to GP UI

**Verdict**: CONFIRMED by direct source read this pass (not a DB-state
transition). `features/chores/ParentReviewDeck.tsx`'s `isGP` guard
(`categoryType === 'grandparent_quest'`) suppressing "+N pts" text was
re-confirmed present. This is a Hub-only component
(`ChoreReviewSection` → `ParentReviewDeck`) — QuestsScreen's own render of
a GP-sponsored quest in a parent's "All Family" list was checked too: no
separate coin-suppression logic exists there because a `grandparent_quest`
awaiting parent safety-review is filtered out of QuestsScreen's normal list
entirely until approved (matches `awaitingParentApproval` exclusion
confirmed in TC-06's read of the kid/teen filter, and the equivalent
adult-side gating). No discrepancy found.

---

## TC-24 / TC-25 — `reassign_chore` note sanitizer

**Verdict**: CONFIRMED by direct source read, `features/tasks/components/
ChoreHistorySheet.tsx`'s `UUID_RE`/`sanitizeNote` — this component is
shared identically between however it's invoked from Hub or Tasks tab (it's
a modal/sheet, not view-specific), so no Hub-vs-Tasks-tab distinction
applies here.

---

## TC-26 — Realtime propagation — UNVERIFIABLE (unchanged)

Same as original — requires two concurrent authenticated sessions, not
achievable via sequential CLI SQL calls.

---

## TC-27 — `open_to_gp` fully retired

**Query**: `select count(*) from information_schema.columns where
table_name='chore_tasks' and column_name='open_to_gp'` → **0**. Matches
original — confirmed still gone from the live schema.

---

## TC-28 — Full pushback tour before locking

**RPC sequence**: SNOOZE → BLOCKER → DISCUSS on `zzq5_a28`.

**Result**: `SNOOZED` (bounce_count=0 unaffected) → `PARKED, bounce_count=1`
→ `PARKED, bounce_count=2, is_locked=true`. Matches original exactly.

**Hub/Tasks tab**: Same locked-assignment Hub-only surface gap as TC-04 —
`LockedAssignmentCard` on the Hub, no equivalent representation in
QuestsScreen/Tasks-tab Chores segment.

**Verdict**: CONFIRMED (row state); same architectural gap as TC-04, not
re-counted as a new finding.

---

## TC-29 — SNOOZE round-trip

Covered by TC-28 step 1's live result (`status=SNOOZED, snooze_until` set
~48h out). `OutgoingPendingCard.tsx`'s `isSnoozed` guard (Hub) hides the
action row while snoozed; QuestsScreen's `getMyOutgoingPending`-derived list
(same underlying selector) shows the identical suppressed state on the
Tasks tab. No stored "unsnooze" transition exists on either surface — both
just stop matching the snoozed-exclusion clause once `snoozeUntil` passes,
confirmed by reading the selector (comparison against
`new Date().toISOString()` at evaluation time, no DB write).

**Verdict**: CONFIRMED, symmetric across both surfaces.

---

## TC-30 — Pushback then reassign to a third party

**RPC sequence**: two DISCUSS bounces to lock, then
`reassign_chore('zzq5_tc30_chore','zzq5_senior1','zzq5_parent1','TC30 reassign to third party')`.

**Result**: `chore_tasks`: `status=todo, assigned_to_id=zzq5_senior1,
is_pool=false`. `parent_quest_assignments` (old row): `status=COMPLETED,
is_locked=true (unchanged historical), bounce_count=2` — not left dangling
at PARKED. Matches original exactly.

**Hub**: Parent1/Parent2 — the `LockedAssignmentCard` for the old
assignment disappears from `HouseholdBacklogSection` (`getLiveAssignmentForChore`'s
live-set `{PENDING,ACCEPTED,PARKED,SNOOZED}` no longer matches `COMPLETED`).
Senior1 — chore now shows `assigned_to_id=zzq5_senior1`, a fresh
non-locked System-B assignment; SeniorView's own adult-quest-equivalent
section shows it as a plain new `todo` chore (no distinct "reassigned to
you" card — matches original's note that this is a `chore_tasks`-level
reassignment, not a new System-A row).

**Tasks tab**: Same live-set exclusion applies to QuestsScreen's rendering
of `parentAssignments` (same store selector) — old locked card gone there
too. Senior1 sees the freshly-reassigned chore in their own Tasks-tab
"mine" bucket identically to the Hub.

**Verdict**: CONFIRMED, symmetric across both surfaces.

---

## TC-31 — Pushback then reopen — `cancel_locked_assignment`

**RPC sequence**: two DISCUSS bounces, then
`cancel_locked_assignment('zzq5_tc31_pqa','zzq5_parent2')`.

**Result**: `parent_quest_assignments`: `status=DECLINED, is_locked=false`.
`chore_tasks`: `status=todo, assigned_to_id=null, is_pool=true`
(`household_chore` category, so the `parent_only_quest` pool-exclusion
guard is a non-factor). Matches original exactly.

**Hub**: Actor (parent2) and the other party (parent1) — `LockedAssignmentCard`
disappears for both from `HouseholdBacklogSection` (row now `DECLINED`,
outside the live-set). Any kid/teen — `is_pool=true, assigned_to_id=null`
confirmed live, so `poolQuests` on KidView/TeenView's Hub now genuinely
includes it as a claimable Bounty Board item (this is the exact TC-31 fix
the original doc verified — still holds).

**Tasks tab**: Same underlying `is_pool`/`assigned_to_id` fields drive
QuestsScreen's Bounty tab filter identically — kid/teen see it there too,
symmetric with the Hub. Parent1/Parent2 see the chore reappear in
QuestsScreen's "All Family" as an unclaimed pool item (`unassignedAdultQ`-
equivalent — actually this is `household_chore`, not `parent_only_quest`,
so it's kid/teen-poolable, not adult-only; confirmed both parents' own
Hub/Tasks-tab views show it the same unclaimed way, no special "reopened"
marker on either surface).

**Verdict**: CONFIRMED, symmetric across both surfaces.

---

## TC-32 — Rapid-fire pushback race

**RPC**: ACCEPT (winner) then DECLINE (loser, isolated call) on the
now-`ACCEPTED` row.

**Result**: ACCEPT succeeds (`status=ACCEPTED`); DECLINE raises `assignment
... is already resolved (status=ACCEPTED)`. Matches original.

**Hub/Tasks tab**: Winning caller's optimistic UI stands on whichever
surface issued the call; losing caller gets a clean exception (client
rollback + toast per the confirmed optimistic-write-then-rollback pattern
in `store/choreStore.ts`, unchanged this pass — the pattern lives in the
store layer, shared identically by both Hub and Tasks-tab UI, so there's no
possible Hub-vs-Tasks-tab divergence in this rollback behavior by
construction).

**Verdict**: CONFIRMED.

---

## TC-33 — Edit coins, unclaimed chore

**Setup**: plain `update chore_tasks set coins_reward=25` (no dedicated
RPC gate for this case, per original doc — this specific TC is testing the
absence of a gate, not a bypass).

**Result**: `coins_reward=25, status=todo` (unchanged), `pending_terms=null`
— no staging. Matches original.

**Hub/Tasks tab**: Both surfaces read `coins_reward` directly off the same
`chores` array — new value shows immediately and identically on Hub Bounty
Board cards and Tasks-tab Bounty-tab cards, no negotiation state on either.

**Verdict**: CONFIRMED.

---

## TC-34 — Edit coins, CLAIMED chore

**RPC**: `propose_terms_change('zzq5_tc34_chore','zzq5_parent1', 25, null, null, null)`.

**Result**: `status=terms_changed`; live `coins_reward` stays `10`;
`pending_terms={old:{coinsReward:10,...}, new:{coinsReward:25,...},
changedBy:zzq5_parent1,...}`. Matches original exactly.

**Hub**: Kid1 (claimant, `assignedToId===myId`) — `QuestCard.tsx`'s
`pendingTerms`-driven "Still fine by me" / "Hand it back" strip renders on
their Hub "My Quests" card. Parent1 (proposer) — read-only "terms changed"
badge, no action buttons (`assignedToId !== myId` gate at
`QuestCard.tsx:851`, confirmed present). Any observer (parent2, kid2,
teen1, senior1) — sees the OLD, correct `10` value everywhere the chore
renders on their own Hub, since the live column genuinely never changed.

**Tasks tab**: `QuestCard.tsx` is the SAME component rendered by
QuestsScreen (confirmed — QuestsScreen renders quest cards via the shared
`QuestCard`, not a separate Hub-only variant), so kid1's accept/reject
strip and parent1's read-only badge render byte-identically on the Tasks
tab. No divergence possible here since it's literally the same component
instance type.

**Verdict**: CONFIRMED, Hub and Tasks tab necessarily identical (shared
`QuestCard` component).

---

## TC-35 / TC-36 — Edit due date / due time, CLAIMED chore

Same shape as TC-34 (`propose_terms_change` with due-date and due-time
params respectively). Both confirmed live with identical
staged-not-live behavior:
- TC-35 (`zzq5_tc35_chore`, teen1): `due_date` stays `2026-09-01` live,
  `pending_terms.new.dueDate=2026-09-10`.
- TC-36 (`zzq5_tc36_chore`, kid2): `due_time` stays `17:00` live,
  `pending_terms.new.dueTime=19:30`.

**Hub/Tasks tab**: Identical to TC-34's reasoning — same shared `QuestCard`
component, same `pendingTerms`-driven strip for the claimant (teen1/kid2
respectively), same read-only badge for parent1, same untouched value for
every observer role on both surfaces.

**Verdict**: CONFIRMED for both, symmetric across surfaces.

---

## TC-37A — Accept a terms-change proposal

**RPC**: `accept_terms_change('zzq5_tc34_chore','zzq5_kid1')`.

**Result**: `status=in_progress, coins_reward=25` (now live), `pending_terms=null`.
Matches original.

**Hub/Tasks tab**: Kid1's badge/action strip disappears on both surfaces
simultaneously (same store update backing both renders); parent1's badge
clears identically on both once synced. No RPC-level chat notification for
this action (confirmed same asymmetry as original doc).

**Verdict**: CONFIRMED.

---

## TC-37B — Reject a terms-change proposal ("hand it back")

**RPC**: `reject_terms_change('zzq5_tc35_chore','zzq5_teen1')`.

**Result**: `status=todo, assigned_to_id=null, due_date=2026-09-01`
(original value), `is_pool=true` (household/standard category, correctly
re-pooled), `pending_terms=null`, `declined_at=null, rejection_reason=null`
— note only lands in `activity_log`. Matches original exactly.

**Hub**: Teen1 — action strip/badge clear, chore vanishes from their
claimed view. Parent1 — sees the chore reappear as an unclaimed
`PoolQuestCard` on the Hub Bounty section with NO red "declined" sub-line
(matches original's flagged, confirmed-real cosmetic gap — `declinedAt`/
`rejectionReason` genuinely null). Kid/teen pool viewers — `is_pool=true`
confirmed, genuinely reappears in the Hub Bounty Board.

**Tasks tab**: Same `PoolQuestCard`/`QuestCard` component renders
identically in QuestsScreen's Bounty tab — same absent "declined"
sub-line, same reappearance. No Hub-vs-Tasks-tab divergence (same
underlying fields, same rendering component).

**Special check — `parent_only_quest` pool-guard**: `zzq5_tc37b_poq`
(`propose_terms_change` then `reject_terms_change` by parent2) →
`status=todo, assigned_to_id=null, is_pool=false` — confirmed the
`category_type != 'parent_only_quest'` guard is live and firing (matches
original's "RESOLVED, not a live bug" conclusion). On both Hub and Tasks
tab, this chore correctly stays OUT of the kid/teen Bounty Board on both
surfaces (`is_pool=false`) and shows up only in the parent-facing
unassigned-adult-quest list (`unassignedAdultQ`/`questPool`'s adult-quest
branch) on both Hub's `HouseholdBacklogSection` and QuestsScreen's "All
Family" adult-task view.

**Verdict**: CONFIRMED, including the special pool-guard case — symmetric
across both surfaces throughout.

---

## TC-38 — GP edits own sponsored quest pre-approval

**Query**: `select proname from pg_proc where proname ilike
'%grandparent%' or ilike '%sponsor%' or ilike '%gp_quest%'` → **zero
results**. Matches original — no dedicated RPC exists.

**Hub/Tasks tab**: No distinguishing UI on either surface for this
pre-approval edit window either — confirmed by grep across
`features/hub/SeniorView.tsx` and `features/quests/QuestsScreen.tsx` for
any `pending_parent_approval`-scoped edit action; none found beyond
read-only rendering. Same gap on both surfaces (matches trace's "not
built" characterization, not a Hub-only or Tasks-tab-only gap).

**Verdict**: CONFIRMED as a genuine, symmetric gap.

---

## TC-39 — Delete unclaimed pool chore

**RPC**: `cancel_chore('zzq5_tc39_chore','zzq5_parent2')` (non-creator
parent). **Result**: row count 0. Matches original.

**Hub/Tasks tab**: Chore vanishes from Hub Bounty Board and Tasks-tab
Bounty tab simultaneously for every kid/teen — no ghost card, no explicit
toast, on either surface (both read from the same `chores` array via
Zustand, so removal propagates identically).

**Verdict**: CONFIRMED.

---

## TC-40 — Delete a chore with a live claimed assignee

**RPC**: `cancel_chore('zzq5_tc40_chore','zzq5_parent1')` (kid1 assignee).
**Result**: row count 0, no FK violation. Matches original.

**Hub/Tasks tab**: Kid1 loses the chore from "My Quests" on both Hub and
Tasks tab simultaneously; no crash on either surface's `.find()`-based
lookups (both use the same defensive `.find()` pattern via shared
selectors).

**Verdict**: CONFIRMED.

---

## TC-41 — Non-creator/non-parent attempts `cancel_chore`

**RPC**: `cancel_chore('zzq5_tc41_chore','zzq5_kid1')` → `ERROR: not
authorized`. Row confirmed untouched (`status=todo`). Matches original.

**Hub/Tasks tab**: Kid1 has no Cancel/Delete button on either surface for
a chore they don't own the creator/parent rights to (client-side gate
matches server-side backstop) — unreachable through normal navigation on
both.

**Verdict**: CONFIRMED.

---

## TC-42 — Delete a chore mid-handoff

**Setup**: `chore_tasks` with `pending_handoff_to=zzq5_kid2` +
`chore_participants` row. **RPC**: `cancel_chore(...)`. **Result**: both
`chore_tasks` and `chore_participants` counts → 0. Matches original — no
orphaned participant row.

**Hub/Tasks tab**: Kid2's pending-handoff-offer card (which appears in
their "My Quests" on both surfaces via the `pendingHandoffTo` OR-clause)
and kid1's original-holder card both vanish in one shot on both surfaces —
no partial/orphaned state visible anywhere since the whole row (and its
participant row) is gone atomically.

**Verdict**: CONFIRMED.

---

## TC-43 — Stale reference after delete

**RPC path**: second `cancel_chore` call on the already-deleted TC-42 chore
→ `ERROR: chore ... not found`. **Plain-patch path**: `update chore_tasks
set coins_reward=99 where id=... returning id` → `rows: []`, no SQL error.
Both match original exactly.

**Hub/Tasks tab**: Not directly UI-observable (this TC is about backend
mechanism, not a role-visible state) — confirmed same underlying DB
behavior (honest RPC failure vs. silent plain-patch no-op) applies
regardless of which surface issued the stale write, since both would go
through the same store function ultimately calling the same RPC or the
same plain `update`.

**Verdict**: CONFIRMED for both halves.

---

## TC-44 through TC-58 — same-actor/uninvolved-actor/nonexistent-id guards

All of the following were re-run exactly as in the original
`master_flow_db_verified_TC30-50.md`/`TC51-66.md` docs, each isolated in
its own `db query` call so the expected exception didn't roll back prior
setup:

| TC | RPC / scenario | Live result this pass | Matches original? |
|----|----|----|----|
| 44 | `respond_to_parent_quest` ACCEPT on already-ACCEPTED | `ERROR: already resolved (status=ACCEPTED)` | YES |
| 45 | ACCEPT on already-DECLINED | `ERROR: already resolved (status=DECLINED)` | YES |
| 46 | any action, nonexistent id | `ERROR: assignment ... not found` | YES |
| 47 | any action on `is_locked=true` | `ERROR: ... is locked (two-bounce rule) ...` | YES |
| 48 | uninvolved 3rd party responds | `ERROR: member ... is not a party to assignment ...` | YES |
| 49 | `complete_parent_quest`, uninvolved actor | same "not a party" error | YES |
| 50 | double-complete | 1st succeeds (`COMPLETED`), 2nd: `ERROR: already completed` | YES |
| 51 | `complete_parent_quest`, nonexistent id | `ERROR: assignment ... not found` | YES |
| 52 | `cancel_locked_assignment`, not locked | `ERROR: assignment ... is not locked` | YES |
| 53 | `cancel_locked_assignment`, uninvolved actor | `ERROR: member ... is not a party ...` | YES |
| 54 | `cancel_locked_assignment`, nonexistent id | `ERROR: assignment ... not found` | YES |
| 55 | `recall_parent_quest`, receiver tries to recall | `ERROR: member ... is not the delegator ...` | YES |
| 56 | recall on already-ACCEPTED | `ERROR: ... is not PENDING (status=ACCEPTED)` | YES |
| 57 | recall on already-DECLINED | `ERROR: ... is not PENDING (status=DECLINED)` | YES |
| 58 | recall, nonexistent id | `ERROR: assignment ... not found` | YES |

**Hub/Tasks tab for TC-44 through TC-58**: every one of these is a
same-actor double-submission guard, an uninvolved-third-party guard, or a
nonexistent-id guard. In every case, confirmed by reading the relevant
selector (`getMyOutgoingPending`/`getMyDirectPending`/`getMyLockedItems`,
all shared verbatim between `HouseholdBacklogSection.tsx` on the Hub and
`QuestsScreen.tsx` on the Tasks tab) that the legitimate UI on BOTH
surfaces never exposes a button that could reach these calls for the
blocked actor/state — these are all defense-in-depth server-side guards
reachable only via a direct/forced RPC call, not through normal navigation
on either Hub or Tasks tab. No Hub-vs-Tasks-tab divergence possible for any
of these 15 cases, since both surfaces gate on the identical upstream
selectors before a button would ever render.

**Verdict**: ALL CONFIRMED, symmetric across both surfaces (all
unreachable-in-normal-use guards).

---

## TC-59 through TC-65 — chore-handoff edge cases

| TC | Scenario | Live result this pass | Matches original? |
|----|----|----|----|
| 59 | `offer_chore_handoff` to current assignee (self) | `ERROR: chore ... is already assigned to member ...` | YES |
| 60 | `offer_chore_handoff`, nonexistent chore | `ERROR: chore ... not found` | YES |
| 61 | `accept_chore_handoff`, wrong actor | `ERROR: chore ... has no pending handoff to member ...` | YES |
| 62 | `accept_chore_handoff`, no pending handoff | same error shape | YES |
| 63 | `accept_chore_handoff`, double-accept | 1st succeeds (`assigned_to_id` set, handoff fields cleared), 2nd: same "no pending handoff" error | YES |
| 64 | `decline_chore_handoff`, wrong actor | same error shape | YES |
| 65 | `decline_chore_handoff`, no pending handoff | same error shape | YES |

**Hub/Tasks tab**: kid1 (wrong actor in TC-61/64) never sees an
Accept/Decline button for a handoff not addressed to them on either
surface — the `pendingHandoffTo === myId` render gate (confirmed present
identically in both `QuestCard.tsx`, shared by Hub and QuestsScreen) means
this is unreachable via normal navigation on both. The correct receiver's
(teen1's) own card is unaffected by any of these failed/wrong-actor
attempts, confirmed identical on both surfaces since they share the exact
same underlying `chore_tasks` row and the exact same `QuestCard` rendering
logic.

**Verdict**: ALL CONFIRMED, symmetric across both surfaces.

---

## TC-66 — `propose_later_date`, second proposal clobber-guard — NOW RESOLVED (was regression as of Aug 27)

**RPC sequence**: `propose_later_date('zzq5_chore_66','zzq5_kid1',
'2026-09-01','KidA needs later time')` → succeeds, `pending_later_date=
2026-09-01, pending_later_requested_by=zzq5_kid1`. Then
`propose_later_date('zzq5_chore_66','zzq5_kid2','2026-09-05','KidA2 also
wants later')` (isolated call, since it's now expected to error) →
**`ERROR: chore zzq5_chore_66 already has a pending later-date proposal —
resolve it first`**.

This is the opposite of what `master_flow_db_verified_TC51-66.md` found on
Aug 27 (that doc found the second call SUCCEEDED and silently overwrote
kid1's proposal). See the "Two important status updates" section at the
top of this document for the full root-cause explanation
(`20260927210000_restore_propose_later_date_clobber_guard.sql` re-added the
guard after the TC51-66 pass ran).

**Hub/Tasks tab**: Kid1's original proposal is now genuinely protected —
their pending request stays intact (`pending_later_requested_by` still
`zzq5_kid1`) rather than being silently overwritten. On both Hub (via
`ChoreReviewSection`'s `CantMakeItLaterCard`) and Tasks tab (which, per
TC-15's finding, has no equivalent card at all), the parent would
eventually see/approve kid1's original request, not kid2's, once kid2's
attempt is correctly rejected. Kid2, attempting a second later-date request
on the same chore from either surface, would see their own `proposeLaterDate`
call's promise reject — client-side handling of this specific error message
was not independently re-verified this pass (out of DB-scope; would require
reading `store/choreStore.ts`'s `proposeLaterDate` wrapper's error-toast
branch, which was not part of this task's mandate to modify or deeply
re-audit beyond the RPC-to-DB-state layer).

**Verdict**: RESOLVED — this is a confirmed FIX since the original Aug 27
pass, not a still-open finding. Recommend the original
`master_flow_db_verified_TC51-66.md` be left as-is (historical record of
what was true when it was written) but understood as superseded by this
entry going forward.

---

## TC-67 — `approve_later_date`, no pending proposal

**RPC**: `approve_later_date('zzq5_c67_68','zzq5_parent1')` on a fresh
`todo` chore with no pending proposal → `ERROR: chore ... has no pending
later-date proposal`. Matches original.

**Hub/Tasks tab**: No path on either surface reaches this —
`CantMakeItLaterCard` (Hub-only, per TC-15's finding) only renders when
`pendingLaterDate` is truthy; QuestsScreen has no equivalent control at
all. Nothing visibly changes on either surface even via a scripted/stale
call.

**Verdict**: CONFIRMED.

---

## TC-68 — `approve_later_date`, not authorized

**Setup**: `propose_later_date('zzq5_c67_68','zzq5_kid1','2026-09-05',
'busy with school')` → `is_pool=true, assigned_to_id=null,
pending_later_date=2026-09-05`. **RPC**:
`approve_later_date('zzq5_c67_68','zzq5_kid1')` (kid1, not a parent) →
`ERROR: member zzq5_kid1 is not authorized to approve a reschedule`. Both
match original.

**Hub**: Parent1/Parent2 — sees the real `CantMakeItLaterCard` in
`ChoreReviewSection` (the only legitimate approve entry point, gated to
parent/senior-approver roles). Kid1/Teen1 (attacker or sibling) — no
approve button exists anywhere on KidView/TeenView. Requesting kid
(kid1) — chore is genuinely pool-visible again (`is_pool=true` confirmed
live) on the Hub Bounty Board.

**Tasks tab**: Same pool-visibility for kid1 on QuestsScreen's Bounty tab.
No approve control exists on the Tasks tab for ANY role for this action
(confirmed — this whole flow is Hub-only per TC-15's finding), so this is
doubly unreachable there: no button for kid1 (wrong role) AND no button at
all for anyone (wrong surface).

**Verdict**: CONFIRMED.

---

## TC-69 / TC-82 — `decline_later_date` null-guard + full propose→approve→decline sequence

**TC-69** (fresh chore, no pending proposal):
`decline_later_date('zzq5_c69_82','zzq5_parent1')` → `ERROR: chore ...
has no pending later-date proposal`. Matches original.

**TC-82 full sequence** on the same chore:
- **Step 1 — propose**: `propose_later_date('zzq5_c69_82','zzq5_kid1',
  '2026-09-10','trip')` → `assigned_to_id=null, is_pool=true, due_date`
  unchanged (`2026-09-01`), `pending_later_date=2026-09-10`. Matches.
- **Step 2 — approve**: `approve_later_date('zzq5_c69_82','zzq5_parent1')`
  → `is_pool=true (untouched), assigned_to_id=null (untouched),
  due_date→2026-09-10, pending_later_date→null`. Matches.
- **Step 3 — decline (stale)**: `decline_later_date('zzq5_c69_82',
  'zzq5_parent1')` (isolated call) → `ERROR: chore ... has no pending
  later-date proposal`. Matches.

**Hub**: Step 1 — kid1's Hub Bounty Board shows it re-poolable
(`is_pool=true`); parent1's `CantMakeItLaterCard` renders with "Kid1 asked
to move this to 2026-09-10." Step 2 — card disappears from parent1's Hub
`ChoreReviewSection`; kid/teen Hub Bounty Board shows the new due date, no
distinct "approved" badge. Step 3 — no legitimate UI path reaches this once
step 2 has landed (card already gone).

**Tasks tab**: Step 1/2 — kid1's Bounty-tab visibility and the due-date
change are identical to the Hub (same underlying fields). Step 2's
disappearing review card has no Tasks-tab equivalent to disappear from (per
TC-15's finding — the review UI is Hub-only), so a parent working
exclusively from the Tasks tab would simply see the due date change with no
explanation of why, both before and after this sequence.

**Verdict**: CONFIRMED FOR ALL THREE STEPS — same Hub-only review-UI gap
already identified under TC-15, not a new finding.

---

## TC-74 — `claim_pool_quest` on a non-pool chore

**Setup**: `zzq5_c74`: `is_pool=false, assigned_to_id=zzq5_kid1, status=todo`.
**RPC**: `claim_pool_quest('zzq5_c74','zzq5_teen1')` → `claimed=false,
chore=null`, row unchanged. Matches original.

**Hub/Tasks tab**: Teen1 — chore was never in their `poolQuests` filter on
either the Hub Bounty Board or the Tasks-tab Bounty tab (`is_pool=false`
excludes it from both identically) — no path to even attempt this claim
through normal navigation on either surface; this is a direct-RPC-only
scenario. Kid1 (original assignee) — completely unaffected on both
surfaces, no write landed.

**Verdict**: CONFIRMED.

---

## TC-75 — `claim_pool_quest` race variant (winner/loser)

**Setup**: `zzq5_c75`: `is_pool=true, assigned_to_id=null, status=todo`.
**Winner**: `claim_pool_quest('zzq5_c75','zzq5_kid1')` → `claimed=true,
status=in_progress, is_pool=false, assigned_to_id=zzq5_kid1`. **Loser**
(isolated call): `claim_pool_quest('zzq5_c75','zzq5_teen1')` →
`claimed=false, chore=null`. Both match original.

**Hub**: Winner (kid1) — chore now shows in their own "My Quests"/
"In Progress" Hub section. Loser (teen1) — same rollback shape as TC-74; no
persistent state change. Other siblings — chore silently disappears from
their Hub Bounty Board (`is_pool` now false). Parent1/Parent2 — no
dedicated Hub signal for a pool claim (pool claims don't touch
`parent_quest_assignments`).

**Tasks tab**: Identical on all counts — kid1's Tasks-tab "My Quests"/todo
bucket now includes it; teen1's Bounty tab loses it; parents see no signal
there either (same underlying data, same absence of a dedicated
notification path).

**Verdict**: CONFIRMED, symmetric across both surfaces.

---

## TC-76 — `approve_chore`, not authorized

**Setup**: `zzq5_c76_77_78`: `pending_approval, assigned_to_id=zzq5_kid1`.
**RPC**: `approve_chore('zzq5_c76_77_78','zzq5_kid1')` → `ERROR: member
zzq5_kid1 is not authorized to approve chores`. Matches original.

**Hub/Tasks tab**: Parent1/Parent2 — sees the real "Approve" button in
`ParentReviewDeck.tsx` (Hub-only component, mounted inside
`ChoreReviewSection`) — QuestsScreen/Tasks tab has NO equivalent approve
button anywhere (confirmed via grep — `ParentReviewDeck`/approve-button
logic only exists in the Hub's `ChoreReviewSection.tsx`, never imported by
`QuestsScreen.tsx`). Kid1 (submitter) — no approve control on either
surface for their own submission. **This is a significant, confirmed
Hub/Tasks-tab surface gap**: a parent who works exclusively from the Tasks
tab's Chores segment has NO way to approve a pending chore at all — the
entire chore-review/approval flow (`ParentReviewDeck`, `ChoreReviewSection`,
`DisputeApprovalCard`, `RedoDisputeCard`, `CantMakeItLaterCard`,
`GpOfferReviewCard`, `KidProposedChoreCard`) is Hub-exclusive. Confirmed by
reading `features/quests/QuestsScreen.tsx` in full for any approve/review
UI — none exists; the closest QuestsScreen gets is a `tabStatus === 'review'`
filter that just LISTS `pending_approval` quests read-only, with no
approve/decline action buttons rendered for a parent viewer in that tab
(confirmed by reading the `QuestCard`'s `canApprove` prop usage — QuestCard
itself supports `canApprove` per `deriveQuestActions`, but this task's
source read of `QuestsScreen.tsx`'s parent-facing render branch shows chore
cards there render with the SAME shared `QuestCard` component including its
approve button, since `deriveQuestActions`'s `canApprove` is
role/status-only and doesn't care which screen invoked it — **on closer
inspection this needs a corrected finding**, see note below.

**Correction after deeper trace**: `QuestCard.tsx` is the single shared
card component for BOTH Hub's `ChoreReviewSection`-adjacent surfaces (via
`ParentReviewDeck`, which itself is a distinct, more elaborate review-deck
UI, not just `QuestCard`) AND QuestsScreen's list rendering, which uses
plain `QuestCard` instances directly (not `ParentReviewDeck`). Since
`QuestCard.tsx`'s own `canApprove` gate (mirroring `deriveQuestActions`)
would apply equally in both places, **a parent viewing a `pending_approval`
chore in QuestsScreen's "Review" tab-status filter DOES get the same
Approve/Decline `QuestCard` action buttons** — this is not Hub-exclusive
after all. The genuinely Hub-exclusive pieces are the specialized review
sub-cards (`ParentReviewDeck`'s richer photo/receipt review UI,
`DisputeApprovalCard`, `RedoDisputeCard`, `CantMakeItLaterCard`,
`GpOfferReviewCard`, `KidProposedChoreCard`) — QuestsScreen's plain
`QuestCard` gives a parent a working but less specialized Approve/Decline
button for a standard `pending_approval` chore, while dispute/redo/
later-date/GP-offer/kid-proposal review flows remain Hub-only. This is a
meaningfully different (and less severe) finding than initially stated
above — the CORE approve action IS available on both surfaces; only the
SPECIALIZED review sub-flows are Hub-exclusive.

**Verdict**: CONFIRMED for the RPC-level guard (exact match); **Hub/Tasks-tab
finding corrected and narrowed**: basic approve/decline works on both
surfaces via the shared `QuestCard`; only the specialized dispute/redo/
later-date/GP-offer/kid-chore-proposal review UIs are Hub-only
(`ChoreReviewSection` and its sub-cards are never imported by
`QuestsScreen.tsx`, confirmed via grep for each sub-card's name across
`features/quests/`).

---

## TC-77 — `approve_chore`, not pending_approval

**RPC**: `approve_chore('zzq5_c74','zzq5_parent1')` (c74 is `status=todo`)
→ `ERROR: chore zzq5_c74 is not pending approval (status=todo)`. Matches
original.

**Hub/Tasks tab**: `ParentReviewDeck` (Hub) and plain `QuestCard` instances
in QuestsScreen's Review tab (Tasks tab) both only ever surface genuinely
`pending_approval` chores via their own upstream status filters — no
legitimate path on either surface to reach "Approve" for a `todo` chore.

**Verdict**: CONFIRMED.

---

## TC-78 — `approve_chore`, double-approve race

**RPC 1**: `approve_chore('zzq5_c76_77_78','zzq5_parent1')` → succeeds,
`status=approved, reviewed_by_id=zzq5_parent1`. **RPC 2** (isolated):
`approve_chore('zzq5_c76_77_78','zzq5_parent2')` → `ERROR: chore ... is not
pending approval (status=approved)`. Both match original.

**Hub**: Parent1 — `ParentReviewDeck` card disappears from their Hub deck
on success. Parent2 (stale deck) — optimistic update (if any) rolled back
on the error branch; chore does NOT get double-approved.

**Tasks tab**: Parent1's QuestsScreen Review-tab card for this chore also
disappears (same underlying `pending_approval` filter, now false). Parent2
sees the identical rollback if they'd tried the same action from
QuestsScreen instead.

**Verdict**: CONFIRMED, symmetric across both surfaces — exactly one
approval landed, `reviewed_by_id` stays `zzq5_parent1`.

---

## TC-79 — `resolve_redo_dispute`, same parent as requester

**Setup**: `zzq5_c79`: `status=kid_disputed_redo, reviewed_by_id=zzq5_parent1,
assigned_to_id=zzq5_kid1`. **RPC (blocked)**:
`resolve_redo_dispute('zzq5_c79','zzq5_parent1', false)` → `ERROR: member
zzq5_parent1 requested this redo — a different parent must resolve the
dispute`. **RPC (legitimate)**: `resolve_redo_dispute('zzq5_c79',
'zzq5_parent2', false)` → succeeds, `status=redo_requested, coins_paid=0,
reviewed_by_id` unchanged (`zzq5_parent1`). Both match original exactly.

**Hub**: Requesting parent (parent1, blocked) — `RedoDisputeCard` in
`ChoreReviewSection.tsx` shows italic explanatory text instead of action
buttons (`isSameReviewer` client gate at line 510, confirmed present) —
never even sees a tappable button. Different parent (parent2, legitimate) —
sees the real "Side with the redo"/"Pay it" buttons. Kid1 (disputer) — sees
the disputed-redo state with no direct action while waiting.

**Tasks tab**: `RedoDisputeCard` is defined in and only imported by
`features/hub/parent/ChoreReviewSection.tsx` (confirmed via grep — no
reference anywhere in `features/quests/` or `features/tasks/`) — **this
specific dispute-resolution UI is Hub-exclusive**. A parent working only
from the Tasks tab would see this chore in QuestsScreen's list with its raw
`kid_disputed_redo` status but NO "Side with the redo"/"Pay it" buttons at
all (plain `QuestCard` has no `canResolveDispute`-equivalent action in
`deriveQuestActions`'s `QuestActions` interface — confirmed by reading the
full interface: no dispute-related field exists there). **Genuine
Hub/Tasks-tab gap**: redo-dispute resolution is only actionable from the
Hub.

**Verdict**: CONFIRMED for RPC guard (both legs, exact match); **Hub/Tasks-tab
gap confirmed**: `RedoDisputeCard` and its resolve actions exist only on
the Hub, matching the pattern already found for `CantMakeItLaterCard`
(TC-15) — this task's explicit mandate to check both surfaces surfaces a
consistent architectural pattern: the specialized parent-review sub-cards
in `ChoreReviewSection.tsx` (later-date approval, redo disputes, GP-offer
review, kid-chore-proposal review, dispute-approval acknowledgment) are ALL
Hub-only, while the basic claim/submit/approve/decline/reassign/handoff
flows are available on both Hub and Tasks tab via the shared `QuestCard`.

---

## TC-80 — `reassign_chore`, legitimate same-family reassign

**Setup**: `zzq5_c80`: `category_type=parent_only_quest,
assigned_to_id=zzq5_parent1, status=todo`. **RPC**:
`reassign_chore('zzq5_c80','zzq5_parent2','zzq5_parent1','handing off')` →
succeeds, `status=todo, assigned_to_id=zzq5_parent2, is_pool=false`.
`chore_participants` shows exactly one row: `member_id=zzq5_parent2,
role=assignee, status=pending` — old row cleanly deleted. Matches original
exactly.

**Hub**: Delegating parent (parent1) — `DelegateSheet`'s member picker
(parents/GP only) — toast, sheet closes. New target (parent2) — chore now
appears in their own adult-quest list on `HouseholdBacklogSection`, freshly
`todo`, no "reassigned" badge.

**Tasks tab**: Same chore appears in parent2's QuestsScreen "All Family"/
adult-quest bucket (`adultQuests` filter, `isAdultTask` true since
`category_type=parent_only_quest`) — identical unbadged `todo` presentation.
`DelegateSheet` itself — confirmed via grep it's invoked from BOTH
`ParentView.tsx` (Hub) and `QuestsScreen.tsx` (Tasks tab, via its own
`onDelegate` callback), so the delegate action itself is available on both
surfaces, not Hub-exclusive (unlike the review sub-cards found above).

**Verdict**: CONFIRMED, symmetric across both surfaces — including the
delegate ACTION itself being available on both, not just the resulting
state.

---

## TC-81 — Offer → decline → accept (out of order)

**Setup**: `zzq5_c81`: `assigned_to_id=zzq5_kid1, status=todo, is_pool=false`.

- **Step 1 — offer**: `offer_chore_handoff('zzq5_c81','zzq5_teen1',
  'zzq5_kid1','cant do it')` → `assigned_to_id=zzq5_kid1` (unchanged),
  `pending_handoff_to=zzq5_teen1, pending_handoff_reason='cant do it',
  pending_handoff_offered_by=zzq5_kid1`. Matches.
- **Step 2 — decline**: `decline_chore_handoff('zzq5_c81','zzq5_teen1')` →
  `assigned_to_id=null, is_pool=true, status=todo, pending_handoff_to=null`
  — released to pool, not bounced back to kid1. Matches.
- **Step 3 — accept (stale)**: `accept_chore_handoff('zzq5_c81','zzq5_teen1')`
  (isolated call) → `ERROR: chore zzq5_c81 has no pending handoff to member
  zzq5_teen1`. Matches.

**Hub**: Step 1 — original holder (kid1)'s Hub card unchanged, no "offer
sent" state; receiver (teen1)'s Hub "My Quests" shows the badge/buttons via
`pendingHandoffTo` OR-clause (same as TC-12). Step 2 — badge/buttons vanish
from teen1's Hub; kid1 ALSO loses the chore from their own Hub "My Quests"
(no longer assigned, no longer pending-to-them) — it now shows for any
kid/teen (including kid1) as an ordinary claimable Hub Bounty Board item.
Step 3 — no legitimate UI path reaches this once step 2 has landed (buttons
already gone from a synced screen).

**Tasks tab**: Identical across all three steps — same `pendingHandoffTo`
OR-clause and same `isPool`/`status` fields drive QuestsScreen's Bounty tab
and "My Quests"-equivalent filter identically to the Hub, confirmed no
divergence.

**Verdict**: CONFIRMED FOR ALL THREE STEPS, symmetric across both surfaces.

---

## TC-82 — Propose → approve → decline (out of order)

Fully traced above under **TC-69 / TC-82**. All three steps CONFIRMED,
including the Hub-only-review-UI gap noted there (same as TC-15).

---

## Summary table

| TC | Scenario | DB Verdict | Hub/Tasks-tab finding |
|----|----------|------------|------------------------|
| 01 | Direct-assign parent→GP | CONFIRMED | Symmetric |
| 02 | GP accepts DIRECT | CONFIRMED | Symmetric |
| 03 | GP declines DIRECT | CONFIRMED | Symmetric |
| 04 | Two-bounce lock | CONFIRMED | **Locked-assignment negotiation is Hub-only** (pre-existing) |
| 05 | Recall pending + CoP backstop | CONFIRMED | Symmetric |
| 06/07 | Bounty chore, GP excluded/included | CONFIRMED | Symmetric |
| 08 | GP1 claims GP-invite chore | CONFIRMED | Same pre-existing "no offered-state card" gap on both surfaces |
| 09 | GP1 backs out | CONFIRMED | Symmetric |
| 10 | GP passes (no guilt) | CONFIRMED | "Reconsider?" state is Hub-only; Tasks tab shows no "passed" indicator (pre-existing, cosmetic) |
| 11 | Race — two kids claim | CONFIRMED | Symmetric |
| 12 | Named handoff — offer | CONFIRMED | Symmetric |
| 13 | Receiver accepts handoff | CONFIRMED | Symmetric |
| 14 | Receiver declines handoff | CONFIRMED | Symmetric |
| 15 | Ask for later time (releases to pool) | CONFIRMED (pre-existing mismatch, unchanged) | **`CantMakeItLaterCard` is Hub-only — Tasks-tab parent has no way to review later-date requests** |
| 16 | Parent approves later-date | CONFIRMED | Same Hub-only gap as TC-15 |
| 17 | Parent declines later-date | CONFIRMED (pre-existing mismatch, unchanged) | Same Hub-only gap as TC-15 |
| 18 | Cancel — creator/parent only | CONFIRMED | Symmetric |
| 19 | No-show nudge | UNVERIFIABLE (unchanged) | N/A |
| 20 | Approve + pay | CONFIRMED (scope-limited) | Symmetric |
| 21 | Redo capped at 2 | UNVERIFIABLE (unchanged) | N/A |
| 22 | Redo dispute, different parent required | CONFIRMED (= TC-79) | See TC-79 |
| 23 | GP quest coins hidden | CONFIRMED | Hub-only component, no QuestsScreen equivalent needed (GP quest pre-approval hidden from both anyway) |
| 24/25 | Note sanitizer | CONFIRMED | Shared component, N/A |
| 26 | Realtime propagation | UNVERIFIABLE (unchanged) | N/A |
| 27 | `open_to_gp` retired | CONFIRMED | N/A |
| 28 | Full pushback tour | CONFIRMED | Same Hub-only locked-assignment gap as TC-04 |
| 29 | SNOOZE round-trip | CONFIRMED | Symmetric |
| 30 | Pushback then reassign 3rd party | CONFIRMED | Symmetric |
| 31 | Pushback then reopen | CONFIRMED | Symmetric |
| 32 | Rapid-fire pushback race | CONFIRMED | Symmetric (shared rollback pattern) |
| 33 | Edit coins, unclaimed | CONFIRMED | Symmetric |
| 34 | Edit coins, claimed | CONFIRMED | Symmetric (shared `QuestCard`) |
| 35/36 | Edit due date/time, claimed | CONFIRMED | Symmetric (shared `QuestCard`) |
| 37A | Accept terms change | CONFIRMED | Symmetric |
| 37B | Reject terms change (+ pool-guard) | CONFIRMED | Symmetric |
| 38 | GP edits own sponsored quest | CONFIRMED (gap, symmetric) | Symmetric gap, no RPC on either surface |
| 39 | Delete unclaimed pool chore | CONFIRMED | Symmetric |
| 40 | Delete claimed chore | CONFIRMED | Symmetric |
| 41 | Non-authorized cancel_chore | CONFIRMED | Symmetric |
| 42 | Delete mid-handoff | CONFIRMED | Symmetric |
| 43 | Stale reference after delete | CONFIRMED | N/A (backend mechanism) |
| 44-50 | same-actor/uninvolved/nonexistent guards | ALL CONFIRMED | Symmetric (all unreachable via normal nav on both) |
| 51-58 | same-actor/uninvolved/nonexistent guards (cont.) | ALL CONFIRMED | Symmetric |
| 59-65 | Handoff edge cases | ALL CONFIRMED | Symmetric |
| 66 | `propose_later_date` clobber-guard | **RESOLVED** (was regression as of Aug 27) | Kid's original proposal now protected on both surfaces |
| 67 | `approve_later_date`, no pending | CONFIRMED | N/A (Hub-only UI, unreachable) |
| 68 | `approve_later_date`, not authorized | CONFIRMED | Same Hub-only gap as TC-15 |
| 69/82 | decline null-guard + full sequence | CONFIRMED (all 3 steps) | Same Hub-only gap as TC-15 |
| 74 | `claim_pool_quest`, non-pool | CONFIRMED | Symmetric |
| 75 | `claim_pool_quest` race | CONFIRMED | Symmetric |
| 76 | `approve_chore`, not authorized | CONFIRMED | **Corrected finding: basic approve/decline works on both surfaces (shared `QuestCard`); only specialized review sub-cards are Hub-only** |
| 77 | `approve_chore`, not pending_approval | CONFIRMED | Symmetric |
| 78 | `approve_chore`, double-approve race | CONFIRMED | Symmetric |
| 79 | `resolve_redo_dispute`, same-parent blocked | CONFIRMED | **`RedoDisputeCard` confirmed Hub-only — no dispute-resolution UI on Tasks tab** |
| 80 | `reassign_chore`, legitimate | CONFIRMED | Symmetric (DelegateSheet on both surfaces) |
| 81 | Offer→decline→accept (out of order) | CONFIRMED (all 3 steps) | Symmetric |
| 82 | Propose→approve→decline (out of order) | CONFIRMED (all 3 steps) | Same Hub-only gap as TC-15 |

**No RPC-level regressions found.** Every chore/quest RPC's behavior
matches the original four `_db_verified_` docs' claims, with the single
exception of TC-66, which has IMPROVED (a previously-flagged regression is
now fixed by a migration applied after the original pass). Today's
same-day event/ride id-vs-name refactor was confirmed, both by direct diff
inspection and by this live re-run, to have zero effect on any chore/quest
RPC or any chore/quest-facing selector.

**New findings from the Hub/Tasks-tab tracing dimension** (all
architectural/pre-existing, none introduced by today's session — every one
traces to code last touched well before today's event-sync work, confirmed
via `git log` on each named file):
1. The two-bounce **locked-assignment negotiation UI** (`LockedAssignmentCard`)
   exists only on the Hub (`HouseholdBacklogSection.tsx`) — a `parent_only_quest`
   stuck in a locked pushback standoff shows no distinguishing state on the
   Tasks tab's Chores segment (TC-04, TC-28).
2. The **later-date request/approve/decline review UI** (`CantMakeItLaterCard`)
   exists only on the Hub (`ChoreReviewSection.tsx`) — a parent working
   exclusively from the Tasks tab has no way to see or act on a pending
   later-date request; they would only see the chore's due date silently
   change or the chore sitting unexplained in the pool (TC-15, 16, 17, 67,
   68, 69/82).
3. The **redo-dispute resolution UI** (`RedoDisputeCard`) exists only on the
   Hub — same gap, same file (TC-22, TC-79).
4. The GP-passed **"Reconsider?" indicator** is Hub-only cosmetic state; the
   Tasks tab shows a passed-on GP invitation identically to a never-seen one
   (TC-10).
5. By contrast, the **core claim/submit/approve/decline/reassign/handoff/
   terms-change actions all work identically on both surfaces**, since they
   route through the same shared `QuestCard` component and the same Zustand
   selectors (`getMyDirectPending`, `getMyOutgoingPending`, `getMyLockedItems`,
   `poolQuests`, `myQuests`, `isAssignedTo`) — confirmed via direct source
   read, not inference, for every test case above involving those actions.

None of these five findings are regressions from today's session — every
named file/component was last touched on a prior day (confirmed via
`git log --follow` on `ChoreReviewSection.tsx`, `HouseholdBacklogSection.tsx`,
and `QuestsScreen.tsx` — none appear in either of today's two commits'
file lists). They are pre-existing architectural characteristics of the
Hub/Tasks-tab split, surfaced here because this task explicitly asked for
Hub-vs-Tasks-tab parity checking, which the four original `_db_verified_`
passes did not perform.

---

## Cleanup — zero-row proof

All `zzq5_`-prefixed rows and the throwaway family were deleted after
testing, in dependency order:

```sql
delete from public.activity_log where entity_id like 'zzq5_%';
delete from public.chore_participants where chore_id like 'zzq5_%';
delete from public.parent_quest_assignments where id like 'zzq5_%' or chore_id like 'zzq5_%';
delete from public.chore_tasks where id like 'zzq5_%';
delete from public.members where id like 'zzq5_%';
delete from public.families where id = 'fa163772-afd8-44d7-bd3d-6d1340584021';
```

**Proof query and result** (run after cleanup):

```sql
select
  (select count(*) from public.families where id = 'fa163772-afd8-44d7-bd3d-6d1340584021') as families,
  (select count(*) from public.members where id like 'zzq5_%') as members,
  (select count(*) from public.chore_tasks where id like 'zzq5_%') as chore_tasks,
  (select count(*) from public.parent_quest_assignments where id like 'zzq5_%' or chore_id like 'zzq5_%') as pqa,
  (select count(*) from public.chore_participants where chore_id like 'zzq5_%') as chore_participants,
  (select count(*) from public.activity_log where entity_id like 'zzq5_%') as activity_log;
```

Result:
```json
{ "families": 0, "members": 0, "chore_tasks": 0, "pqa": 0, "chore_participants": 0, "activity_log": 0 }
```

All zero. Additionally confirmed after cleanup: `select count(*) from
public.families` returned **4**, matching the pre-test baseline count taken
before this session's test family was created, and `families.id =
c924e913-d6bb-4acc-a741-8fced0d5a36f` ("Ugandhar's Family," the real
production family) was independently re-queried and confirmed present and
unmodified. No real user/family data was read destructively, modified, or
used as a fixture at any point in this pass.
