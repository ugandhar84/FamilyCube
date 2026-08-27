# Master Flow — Exploratory Cross-Role DB Findings

**What this is**: a fourth round of QA, distinct from Pass 1/2/3's pass-fail test-case verification. Per explicit instruction, this round injected real state into isolated test families via the actual production RPCs (never raw `UPDATE`s except two documented exceptions mirroring `EventFormModal.tsx`'s own creation-time writes), then — after every single state transition — traced what **every other role** would concretely see and which action buttons would be available to them, including the messy in-between states nobody usually thinks to check. This is not re-litigating Pass 1–3's correctness verdicts; it is a new layer of cross-role UI-visibility exploration on top of already-proven-correct RPCs.

Four coordinated agents ran in parallel, each owning one flow family, each in its own isolated `zzexp{1-4}_`-prefixed test family, each fully cleaned up with a zero-row proof query at the end (verified below in each section). No live device/simulator was available — verification method is: real DB state, cross-referenced against the actual selector/component source that would render it, exactly as Pass 3 already established for the named-handoff flow.

**Headline result**: 12 previously-undocumented cross-role findings, two of which are live, currently-reachable dead-end/regression-class bugs worth fixing, not just UX polish.

---

## 1. DIRECT delegation + approve/redo/dispute (`zzexp1_`)

Full detail: RPCs exercised — `respond_to_parent_quest` (ACCEPT/DECLINE/SNOOZE/BLOCKER/TRADE), `cancel_locked_assignment`, `reassign_chore`, `complete_parent_quest`, `approve_chore`, `request_redo`, `dispute_redo`, `resolve_redo_dispute`.

### Findings

1. **🔴 Chores tab hides System-A delegations entirely from grandparents.** `QuestsScreen.tsx` gates `myDirectPending`/`myLockedItems`/`myOutgoingPending` behind `isParent && activeMember ? getX(...) : []` — a senior's role is never `'parent'`, so this is *always* `[]` regardless of live DB state. A grandparent with a real, actionable PENDING or locked delegation sees it fully on the Hub tab (`SeniorView.tsx`) but **nothing at all** on the Chores tab. A source comment in `SeniorView.tsx` claims this exact gap was "already fixed" — it was fixed for Hub only, not `QuestsScreen.tsx`. **This is live and reachable today**, not a hypothetical.
2. **No counter-pushback button once a delegation is PARKED.** The RPC fully supports the assigner responding (confirmed live — calling `respond_to_parent_quest` as `assigned_by` succeeded), but `OutgoingPendingCard` never wires an `onRespond` callback — only Nudge. A parent whose delegation just bounced back has no button anywhere to Accept/Decline/counter-pushback from their own outgoing card.
3. **`getMyLockedItems` drops the co-parent visibility `getMyOutgoingPending` explicitly grants.** A second parent can see a co-parent's delegation to a senior while it's PENDING/PARKED, but loses all visibility the instant it locks (two-bounce rule) — exactly the moment a second adult's input matters most.
4. **"Reopen" on a locked `parent_only_quest` is a dead end with misleading copy.** The confirm dialog says it "goes back to the open pool for anyone to take" — true for ordinary chores, but adult-only chores are deliberately excluded from the `is_pool=true` reopen (correct, kids/teens must never see adult tasks). Net effect: the chore becomes a `todo`/unassigned/`is_pool=false` orphan with **zero card referencing it for any role**, including the parent who just tapped Reopen.
5. **Redo-dispute card has no client-side self-resolve guard.** The RPC correctly blocks the original requesting parent from resolving their own dispute (confirmed: live attempt raised `member ... requested this redo — a different parent must resolve the dispute`), but `ChoreReviewSection.tsx`'s `RedoDisputeCard` shows the same two buttons to that parent anyway — the block is server-side only, so tapping the button produces a rejection with no client-side signal it was always going to fail.

Cleanup proof: `{families_left:0, members_left:0, chores_left:0, pqa_left:0, activity_log_left:0}`.

---

## 2. GP pool/claim + later-date reschedule (`zzexp2_`)

Full detail: RPCs exercised — `claim_gp_errand`, `decline_gp_offer`, `claim_pool_quest`, `set_gp_withdrawn`, `propose_later_date`, `approve_later_date`, `decline_later_date`.

### Findings

1. **GP decline leaves zero trace for the declined GP.** `decline_gp_offer` writes a real `rejection_reason`, but no GP-facing component reads it. The chore just silently reappears in the GP's own invitation list as if brand new — no "you were already declined, here's why" messaging anywhere. `gp_withdrawn_ids` is untouched, so it's not even in the "Reconsider?" state — it looks exactly like a chore she's never seen before.
2. **🔴 `propose_later_date` immediately orphans the chore from the requester's own view — AND both resolutions (approve/decline) leave it permanently orphaned for everyone.** The RPC unconditionally nulls `assigned_to_id` the moment a later-date request is made. `KidView.tsx`/`TeenView.tsx`'s `myQuests` filter requires `assignedToId === active.id`, so the requesting kid/teen loses all visibility into their own chore the instant they ask for a later time — no "waiting on parent" card exists anywhere on their side (only the parent-side `CantMakeItLaterCard` exists). Worse: **after a parent approves OR declines**, `assigned_to_id` stays `null` and `is_pool` stays `false` — the chore is now invisible to every kid/teen filter in the codebase, permanently, until a parent manually notices and reassigns it via a separate, unprompted action. Neither the approve path nor the decline path signals that follow-up is needed. This is a genuine, live, in-production dead end affecting every later-date reschedule request in the app.
3. Confirmed working correctly, no surprises: senior2's pool view drops a GP-invite chore the instant senior1 claims it (no ghost card); kid2/teen1 see the identical instant-disappearance when kid1 claims a pool chore; `gp_withdrawn_ids` correctly isolates one GP's pass from another's view (per-GP-id array, not a chore-level flag); a second `propose_later_date` on the same chore is correctly blocked server-side with a specific, real error.

Cleanup proof: `{activity_left:0, chores_left:0, families_left:0, members_left:0, participants_left:0}`.

---

## 3. Named handoff (extended) + cancel/delete + terms-change (`zzexp3_`)

Full detail: RPCs exercised — `offer_chore_handoff`, `accept_chore_handoff`, `decline_chore_handoff`, `propose_terms_change`, `accept_terms_change`, `reject_terms_change`, `cancel_chore`.

### Findings

1. **Parents see nothing during a pending handoff either — only the named receiver does.** The "X wants to hand you this" banner is gated to `pendingHandoffTo === myId` exclusively. The offering kid's own card shows no distinguishable "offer sent, awaiting response" state (matches Pass 3's original TC-12 finding), and **neither parent has any visibility that a handoff is in flight** — no card, no badge, nothing. The original holder also has no way to retract an offer once sent.
2. **`propose_terms_change`'s live-write is visually literal, not just a backend quirk.** The claiming kid's primary coin number on their own card already shows the *new* proposed value immediately — the old→new diff only appears as a secondary red banner underneath. This isn't "old value with a pending badge" as one might assume; it's "new value as if already true, with a footnote."
3. **`reject_terms_change` ("Hand it back") fully un-claims the chore into the open pool**, not just a value restore — confirmed live. A sibling can immediately claim the same chore at the restored original terms; this is a real behavior, not a display artifact, worth knowing since "hand it back" reads like a narrower action than "release to anyone."
4. **`cancel_chore` is an unconditional hard `DELETE`, confirmed via `pg_get_functiondef`, and is 100% silent to every role including parents.** It writes an `activity_log` row that literally no client component ever reads. A parent cancelling a claimed chore gives the holding kid/teen zero warning or notification of any kind — the chore just vanishes.
5. **Across all four "a chore leaves someone's hands" flows tested (accepted handoff, declined handoff, rejected terms-change, parent cancel), the disappearance from the losing party's screen is identical and indistinguishable.** A kid has no way to tell, from the UI alone, whether they voluntarily handed something off, a sibling claimed it out from under them, or a parent unilaterally cancelled it.

Cleanup proof: `{chore_tasks: 0, activity_log: 0, members: 0, families: 0}`.

---

## 4. Calendar events — driver/helper/passenger (`zzexp4_`)

Full detail: RPCs exercised — `assign_event_role`, `confirm_event_assignment`, `claim_event_slot`, `decline_event_assignment`, `reassign_event`, `add_event_passenger`, `remove_event_passenger`, `calendar_event_history`.

**Architecture note surfaced by this pass**: the real driver/helper/passenger action UI lives entirely in the **Hub** feature (`TeenView.tsx`/`TeenCarDispatchSection.tsx`, `SeniorView.tsx`/`YourRidesSection.tsx`, `ParentView.tsx`/`HouseholdBacklogSection.tsx`/`HelperEventCard.tsx`/`RideRequiredEventCard.tsx`), not `features/calendar/CalendarScreen.tsx`, which is read-only for these fields (badges/strips only, one drag-to-swap handler calling `reassign_event`).

### Findings

1. **🔴 `assign_event_role` never checks `is_open_to_teens`/`is_open_to_grandparents` before creating a pending assignment — but the separate DB trigger enforcing that flag fires later, at confirm time, not assignment time.** Live repro: with `is_open_to_teens=false`, a direct `assign_event_role` to a teen succeeds and shows the teen a normal "Confirm/Can't" card — but tapping Confirm throws a raw Postgres exception (`not_open_to_teens: ... is not a valid driver/helper for this event`), surfaced to the teen only as a generic "Couldn't confirm — try again" toast with zero indication the assignment can *never* succeed as configured. The manual "assign a driver" UI (`EventFormModal.tsx`) already prevents picking an ineligible teen/GP, so this exact path is unreachable via that specific screen today — but it's a live gap in `assign_event_role` itself, reachable by any other/future direct-assignment code path. Recommended fix: mirror the trigger's own guard inside `assign_event_role` so the illegal state is rejected at assignment time, not dead-ended at confirmation time.
2. **Self-claim (`claim_event_slot`) skips the "awaiting reply" visibility parents get from an assign-then-confirm flow entirely.** It writes straight to `confirmed`, so a self-claimed ride simply appears already-settled to parents on next refresh — there is no in-between pending state they ever see, unlike a direct assignment.
3. **A Ride-category decline force-opens BOTH the grandparent and teen pools, regardless of prior values.** Confirmed live: senior1 declining flips `is_open_to_teens` from `false` to `true` even though nobody had asked to widen it to teens. A teen with zero prior involvement in the event can suddenly see and claim it.
4. **🔴 Removing a passenger who is also the event's primary subject silently detaches the event from that person entirely.** `calendar_events.member_id` doubles as both "the event's primary subject" (used everywhere as "for `<kid>`") and the seed value `remove_event_passenger` nulls out when the removed passenger matches it. Live repro: removing kid1 (who was both the event's subject and its sole passenger) nulled `member_id`, and every downstream lookup (`hubComponents.tsx`'s "Attending:" chip, `HelperEventCard.tsx`'s kid-name lookup) now resolves to nothing — a driver-facing card would show a ride with no named kid at all. This is a real, reachable-through-the-UI regression risk on any "remove passenger" tap against an event's original subject.
5. **`calendar_event_history` is entirely write-only.** Confirmed via full-codebase grep: zero call sites read it, and no component reads the `history` jsonb column either. It's invisible in the UI for every role, including any admin/debug view.

Cleanup proof: `{ce:0, ep:0, fam:0, mem:0}`, plus `activity_log: 0`.

---

## Recommended priority if follow-up fix work is scoped

**Worth fixing (live, reachable, dead-end or data-loss class):**
- GP-pool #2 — later-date approve/decline permanently orphaning the chore (affects every later-date request in the app)
- DIRECT-delegation #1 — grandparents blind on the Chores tab (contradicts an existing code comment claiming it was already fixed)
- Calendar #4 — passenger removal silently detaching the event's subject (a real regression risk on a normal "remove passenger" tap)
- Calendar #1 — `assign_event_role` missing the open-flag guard the confirm-time trigger already enforces (defense-in-depth against a currently-unreachable-but-plausible future path)

**Worth tracking but lower urgency (UX/messaging gaps, not dead ends or data loss):**
- Everything else above — mostly "no visible signal that X happened" rather than a broken/lost state.
