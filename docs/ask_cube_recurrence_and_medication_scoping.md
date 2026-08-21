# Scoping: Arbitrary-Interval Recurrence + Medication Reminders

Branch: `feat/redesign-phase1-hub-quests`. This is research/design only — no
code changes were made under this doc. Both problems trace to real,
currently-shipped code; every claim below cites file:line as of this
session (after commit `eb6c2c25`).

---

## Problem 1 — Arbitrary-interval recurrence ("alternate days", "every 3rd day")

### Current state

`EventRecurrenceRule` (`store/eventStore.ts:29-34`):
```ts
export interface EventRecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  days?: number[];       // weekly only
  endDate?: string;
  occurrences?: number;
}
```
`choreStore.ts`'s `RecurrenceRule` (`store/choreStore.ts:206-212`) is the same shape plus
`'rotating' | 'first_come'` frequencies and rotation-specific fields. Neither has any
notion of a step/interval.

Generators:
- `generateOccurrenceDates(fromDate, rule, existingCount)` (`store/eventStore.ts:1528-1566`) —
  daily advances the cursor by exactly 1 day per loop iteration
  (`cursor = offsetDate(cursor, 1)`, line 1538); weekly walks every calendar day and
  filters by `days.includes(dow)` (line 1540-1547); monthly increments the month by
  exactly 1 (line 1553). There is no step parameter anywhere in this function.
- `nextDueDate(fromISO, frequency)` (`store/choreStore.ts:657-664`) — same shape,
  `daily` = `+1 day`, `weekly` = `+7 days`, `monthly` = `+1 month`, hardcoded.

Both are called from stable, well-covered call sites (`addRecurringEvent`,
`extendRecurringSeries`, `resetDueRecurringChores`) — the change is additive
and localized to these two functions plus the two type definitions.

**DB schema — no migration needed.** Confirmed live via `supabase db query --linked`:
```
calendar_events.recurrence_rule  -> jsonb
chore_tasks.recurrence_rule      -> jsonb
```
Both are already loosely-typed JSON columns (`fromRow`/`toRow` in eventStore.ts:482,546
just pass the object through unchanged). A new key on the JSON object requires zero
migration — it will round-trip transparently through existing read/write paths the
moment the TS type and generator understand it.

Note: `calendar_events` also carries legacy/unused-looking `recurrence` (text),
`recurrence_days` (jsonb), and `recurrence_end_date` (text) columns from what looks
like a pre-`recurrence_rule` iteration of this feature — not read by any code found in
`eventStore.ts` (`fromRow`/`toRow` don't reference them). Leave them alone; not in scope.

### Is this an Ask-Cube-only gap, or app-wide?

**App-wide.** Grepped both manual forms:
- `features/calendar/EventFormModal.tsx:124` — `repeatFreq` state is
  `'none' | 'daily' | 'weekly' | 'monthly'`, a fixed picker (lines 826-844) with no
  interval/step input anywhere.
- `features/quests/components/AddQuestModal.tsx:138` — `routineFreq` is
  `'daily' | 'weekly' | 'monthly' | 'first_come' | 'once'`, same ceiling.

A human typing "every other day" into the app today has no way to express it either.
This must be built at the data-model layer (type + generator), with Ask Cube and the
two manual forms as three independent callers/UIs on top of the same primitive —
building it as an Ask-Cube-only special case would create a fourth, divergent
recurrence dialect and would still leave manual users unable to do the same thing.

### Recommended design

**1. Type extension** — add one optional field to both rule interfaces:
```ts
export interface EventRecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval?: number;     // NEW — step size in units of `frequency`; default 1 when absent
  days?: number[];
  endDate?: string;
  occurrences?: number;
}
```
Same `interval?: number` addition to `choreStore.ts`'s `RecurrenceRule`. Backward
compatible: every existing row has no `interval` key, reads as `undefined`, generator
treats `undefined`/`1` identically (`interval ?? 1`) — zero behavior change for
existing daily/weekly/monthly series.

Examples this enables: "alternate days" = `{frequency:'daily', interval:2}`; "every
3rd day" = `{frequency:'daily', interval:3}`; "every 3 weeks" = `{frequency:'weekly',
interval:3}`; "every other Tuesday" = `{frequency:'weekly', interval:2, days:[2]}`.

**2. Anchor date — this is the subtle part, and the prompt's suspicion is correct.**
`generateOccurrenceDates`'s daily/monthly branches already implicitly anchor on
`fromDate` (the rule's own start date, threaded in from `addRecurringEvent`/
`extendRecurringSeries`) — that part is fine as-is and needs no new field for the
daily/every-N-days case: "alternate days starting Tuesday" is just
`interval:2` stepped from `fromDate = that Tuesday`, so day 1/3/5/... falls out
naturally by advancing the cursor by `interval` days each loop instead of 1.

The **weekly+interval** case is where a naive step breaks: weekly recurrence
currently walks every calendar day and tests `days.includes(dow)` (eventStore.ts:1540-1547)
— it has no concept of "which week" a candidate day falls in, so a plain interval
counter can't be spliced into that loop without an explicit week-counting anchor.
Fix: compute each candidate's week-offset from `fromDate` (`Math.floor(daysSinceFromDate / 7)`)
and only accept a `days` match when `weekOffset % interval === 0`. This needs the anchor
(`fromDate`) already being passed in — no *new* field required, but the algorithm must
change from "walk every day, filter by weekday" to "walk every day, filter by weekday
AND by week-number-mod-interval". Monthly+interval is the same pattern already used
(`m += 1` becomes `m += interval`), no anchor ambiguity there.

**Net: no new field needed beyond `interval` itself** — `fromDate`/`first.date` already
flows through as the implicit anchor in both `addRecurringEvent` and
`extendRecurringSeries`. The risk is purely in getting the weekly-interval week-counting
math right, not in the schema.

**3. Generator changes** (`generateOccurrenceDates`, `nextDueDate`):
- `generateOccurrenceDates`: change `cursor = offsetDate(cursor, 1)` to advance by
  `rule.interval ?? 1` for the daily branch; add the week-offset-mod-interval filter
  described above for weekly; change `m += 1` to `m += rule.interval ?? 1` for monthly.
- `nextDueDate` (choreStore.ts): daily `+1` → `+ (interval ?? 1)` days; weekly `+7` →
  `+ 7*(interval ?? 1)` days; monthly `+1 month` → `+ (interval ?? 1)` months. Simpler
  here since chores don't have the weekly+specific-days combinator eventStore does —
  chores' `days` field is unused by `nextDueDate` today (only `frequency` is read at
  choreStore.ts:657), so chore-side weekly+interval is just the simple day-multiple case.

**4. Ask Cube tool schema** — add to `propose_event`/`propose_quest` alongside the
existing `recurrenceFrequency`/`recurrenceDays` (ask-cube/index.ts:213-220, 244-251):
```ts
recurrenceInterval: {
  type: 'number',
  description: 'Step size for the repeat, in units of recurrenceFrequency. Omit or use 1 for a plain '
    + 'every-day/every-week/every-month repeat. "Alternate days"/"every other day" -> frequency "daily", '
    + 'interval 2. "Every 3rd day" -> frequency "daily", interval 3. "Every other Tuesday" -> frequency '
    + '"weekly", interval 2, recurrenceDays [2]. "Every 3 weeks" -> frequency "weekly", interval 3.',
},
```
Wired through exactly like `recurrenceFrequency` is today (ask-cube/index.ts:678-683,
707-711 build `recurrenceRule` conditionally) — add `interval: args.recurrenceInterval` to
that object when present. `AskCubeChat.tsx`'s accept path (`addRecurringEvent`/quest
recurrence bridge) needs no change — it already forwards `d.recurrenceRule` opaquely.

**5. Manual form UI** — `EventFormModal.tsx`/`AddQuestModal.tsx` need a "Every ⟨N⟩ ⟨day/week/month⟩(s)"
stepper next to the existing frequency picker, defaulting to 1 (i.e. today's exact
behavior) so this is purely additive to the UI too.

### Scope/risk assessment

- **Type + generator change (eventStore.ts + choreStore.ts): low risk, ~half a day.**
  Pure functions, easy to unit-reason-about, backward compatible by construction
  (`interval ?? 1`). The one place that needs real care is the weekly-interval
  week-counting logic — worth a few by-hand test dates before trusting it (e.g.
  generate 6 weeks of "every other Tuesday starting Aug 4" by hand and diff against
  the function's output).
- **Ask Cube tool schema + wiring: low risk, ~1 hour**, directly mirrors the just-shipped
  `eb6c2c25` pattern.
- **Manual form UI (stepper control in both modals): small-to-medium, ~half a day**,
  mostly UI work (TYPO/colors/RADIUS per house style) plus wiring the new state into
  the rule object.
- **Total: roughly 1.5-2 days** for the full data-model-first build (generators + both
  manual forms + Ask Cube), not a 1-hour patch — this is exactly the "next layer"
  the eb6c2c25 commit message deferred.

### Recommended build order

1. `interval` field + generator changes in `eventStore.ts` and `choreStore.ts` first —
   this is the shared foundation both UI surfaces sit on top of, and is independently
   testable/mergeable.
2. Manual `EventFormModal.tsx`/`AddQuestModal.tsx` stepper UI — proves the data model
   end-to-end through the app's primary, human-typed path before trusting Ask Cube to
   parse natural language into it.
3. Ask Cube `recurrenceInterval` tool-schema addition — smallest, lowest-risk piece,
   naturally last since steps 1-2 validate the underlying mechanics it depends on.

---

## Problem 2 — Medication reminders via Ask Cube → Medications page + Hub/Schedule

### Current state

**The real Medications page** is `features/vault/tabs/HealthTab.tsx` (not
`HealthAiAssistant.tsx`, which is a separate chat-style health Q&A surface reading the
same tables read-only). HealthTab.tsx owns the actual `family_medications` CRUD:
add (`HealthTab.tsx:237`), scan-and-save (`:286`), mark-taken (`:139`), toggle-active
(`:203`), delete (`:189`).

**`family_medications` reminder infrastructure already exists, partially wired:**
live columns confirmed via `supabase db query --linked`:
- `frequency_times` (jsonb, array of `"HH:MM"` strings) — set at insert time but
  **hardcoded to `['08:00']`** (`HealthTab.tsx:245,295`) with no UI control to change it.
- `reminder_enabled` (boolean) — exists as a column but **is not read or written
  anywhere in `HealthTab.tsx`** (grepped `reminder_enabled` in that file: zero hits
  beyond the schema query itself) — a dead/unused flag today.
- `escalation_enabled` / `escalation_after_min` / `escalation_to` (jsonb) — this is
  the one reminder-adjacent mechanic that's actually live: `isOverdue()`
  (`HealthTab.tsx:327-336`) uses `frequency_times[0]` + `escalation_after_min` to flag
  a medication as overdue in the Medications page's own UI. This is a client-side
  "is it late" computed flag, not a push/CallKit ring — `escalation_to` looks intended
  for notifying other members but nothing in this file dispatches it.

So: reminder *fields* exist in the DB but the actual "ring like an event/chore
alertCall" mechanism does not — confirmed by checking `call-reminder-sweeper/index.ts`,
which only queries `chore_tasks` (line 139) and `calendar_events` (line 164), each
filtered `.eq('alert_call', true)`. **`family_medications` is never queried by the
sweeper at all** (grepped the whole file — zero references to `family_medications`).
A medication reminder today cannot ring; it can only render a red "overdue" chip.

**`get_health_summary`** (ask-cube/index.ts:185-194, executed at :545-563) is the
existing read-only integration point to extend: parent-only gate at line 546
(`if (viewerRole !== 'parent') return { error: ... }`), resolves the named member via
`resolveMemberId(...)`, queries `family_medications`/`family_vaccines` scoped to
`family_id` + `member_id`, and returns the person's **alias** (`aliasMap.toAlias.get(id)`)
rather than their real name or any place name — this is the exact pattern the new
write tool must replicate.

### Recommended design

**(a) New Ask Cube tool, `propose_medication_reminder`.** Mirror `propose_update`'s
find-or-create shape (ask-cube/index.ts:565 for the pattern): search
`family_medications` by name (`ilike`) scoped to the resolved member; if found, propose
an update to that row's reminder fields; if not found, propose creating a new
medication row with the reminder set from the start — same duality
`propose_update`/`propose_event` already establish elsewhere in this file, so no new
architectural shape is being introduced.

Proposed tool schema (parent-only, per `get_health_summary`'s existing gate):
```ts
{
  name: 'propose_medication_reminder',
  description: 'Propose adding/changing a medication reminder — creates the medication '
    + 'if it does not exist yet, or updates its reminder time if it does. Parent-only.',
  parameters: {
    memberName: { type: 'string', description: 'Who the medication is for — required.' },
    medicationName: { type: 'string', description: 'The medication name, e.g. "Amoxicillin".' },
    reminderTime: { type: 'string', description: 'HH:MM 24-hour — when the reminder should fire.' },
    dosage: { type: 'string', description: 'Only if creating new / user stated it.' },
  },
  required: ['memberName', 'medicationName', 'reminderTime'],
}
```

**(b) Surfacing on the Medications page:** trivial — it's the same `family_medications`
row HealthTab.tsx already renders; setting `frequency_times`/`reminder_enabled` on that
row makes it appear with zero HealthTab.tsx changes beyond (ideally) finally reading
`reminder_enabled` to show a bell icon, and adding a time picker to the Add/Edit form
so a human can set something other than the hardcoded `08:00` too (same "don't make
this Ask-Cube-only" principle as Problem 1 — right now NO path in the app lets a human
set a custom reminder time either, it's always `08:00`).

**(c) Surfacing on Hub/Schedule — recommend linking to a `calendar_events` row rather
than building a Hub widget from scratch.** Rationale, concretely:
- `propose_event`'s category enum already includes `'Medical'` (ask-cube/index.ts:205) —
  no schema change needed to categorize it correctly.
- `isEventSensitive()` (eventStore.ts:178-180) already treats `category === 'Medical'`
  as sensitive by default (privacy-correct out of the box — GP sees a busy-block,
  siblings see nothing, matching how a real medication schedule should be treated,
  per the existing 5.5 privacy rule documented in that file).
  `canViewSensitiveEventDetail` (eventStore.ts:222-251) then handles the
  parent/subject/GP/sibling visibility fan-out for free.
  - **Note for the "flagged to hub in schedules" requirement**: a plain `Medical`-category
    event is sensitive-by-default, which means a sibling would NOT see it and a
    grandparent gets only a busy-block. If the intent is "everyone in the family sees
    a medication reminder banner," that's a deliberate deviation from the default
    Medical-category behavior and should be flagged as a product decision (does the
    reminder need `privacyLevel` overridden or `sharedWithSiblings`/`sharedWithGPForCare`
    set?) rather than assumed either way — worth confirming with the user before building.
  - The Hub tab's existing event-surfacing (upcoming events widgets, whatever HubScreen
    currently renders from `calendar_events`) already respects this visibility model, so
    a medication-linked event shows up on Hub/Schedule through the exact same rendering
    path every other event uses — no new "medication due today" component needed.
- `alertCall`/`alertCallLeadMinutes` (eventStore.ts:111-112) is the exact ring mechanism
  the user is asking for ("medication reminder... goes to... AND is flagged"), and
  `call-reminder-sweeper` already sweeps every `calendar_events` row with
  `alert_call = true` (confirmed above) — a medication reminder implemented as an
  event with `alertCall: true` gets real CallKit-style ringing **for free**, with zero
  changes to the sweeper.
- The alternative — building a standalone "medication due today" Hub widget that reads
  `family_medications` directly plus extending the sweeper to also poll that table — is
  strictly more work for a strictly worse outcome: it would duplicate the
  visibility/privacy logic `isEventSensitive`/`canViewSensitiveEventDetail` already
  solve, and would need the sweeper's dedup/idempotency logic (lines ~170-200, tracking
  "already rung" state) reimplemented for a second table.

**Recommended shape:** `propose_medication_reminder`'s accept path (in
`AskCubeChat.tsx`, alongside the existing `event`/`quest`/`update_event` branches at
lines 322-379) does two writes: (1) upsert the `family_medications` row with
`frequency_times: [reminderTime]` (and `reminder_enabled: true`, finally giving that
column a real writer), and (2) call `addEvent`/`addRecurringEvent` with
`category: 'Medical'`, `alertCall: true`, `alertCallLeadMinutes: 0`, linked loosely by
storing the medication's id in the event's `notes` or a new light `medicationId?: string`
field on `FamilyEvent` if a hard link is wanted for later edits (optional refinement,
not required for v1 — the two rows can be independently created without a foreign key
if scope needs to stay small, at the cost of the two ever drifting if one side is
edited later without the other).

### call-reminder-sweeper — needs no changes

Confirmed by full-file grep: it only ever queries `chore_tasks` and `calendar_events`,
each gated by `alert_call = true`. Under the calendar_events-linking design, a
medication reminder is swept automatically the moment its linked event row exists with
`alert_call = true` — this is the "gets it for free" claim, verified against the actual
function code, not assumed.

### Security/privacy — parent-only gate

Trivial to replicate — confirmed by pattern-matching every other role-gated tool in
`ask-cube/index.ts`. The exact one-line guard used by `get_health_summary`
(`if (viewerRole !== 'parent') return { error: 'Health information is only available to
parents.' }`, line 546) drops into `propose_medication_reminder`'s handler unchanged.
Name-aliasing is likewise a direct copy: resolve `memberName` via the existing
`resolveMemberId(supabase, familyId, args.memberName, aliasMap)` helper already used at
line 547, and return only `aliasMap.toAlias.get(id)` in any response text, never the
real name or a real place name. **No place in this design requires anything other than
the identical, already-proven pattern** — this is the "trivial" case the prompt asked
to confirm, not a place needing new gating logic.

### Scope/risk assessment

- **Ask Cube tool (`propose_medication_reminder` + accept-path wiring in
  AskCubeChat.tsx): low-to-medium risk, ~3-4 hours.** Follows two already-proven
  patterns exactly (propose_update's find-or-create, get_health_summary's parent gate +
  aliasing) — the only genuinely new code is the "also create/link a calendar_events
  row" step, which is a direct `addEvent`/`addRecurringEvent` call with fields this
  session has already used repeatedly.
- **Medications page reminder-time UI (letting a human set something other than the
  hardcoded `08:00`, and showing `reminder_enabled` state): small, ~1-2 hours.** Purely
  additive to `HealthTab.tsx`'s existing Add/Edit medication form.
- **Hub/Schedule surfacing: effectively free** if the calendar_events-link design is
  used — it inherits Hub/Schedule's existing event rendering and the sweeper's existing
  ring behavior with no new code in either surface, only the privacy-scope product
  decision flagged above needs an explicit answer before shipping.
- **Total: roughly 1 day**, smaller and lower-risk than Problem 1's full build,
  *provided* the privacy-scope question (does everyone see it, or does it inherit
  Medical's default privacy-sensitive treatment) is settled first — that's a product
  call, not an engineering unknown.

### Recommended build order (both problems combined)

1. **Problem 1, step 1** (interval + generator changes) — foundational, unblocks
   nothing in Problem 2 but is the more architecturally significant of the two and
   should land first while full context is fresh.
2. **Problem 2** in full (it does not depend on Problem 1 at all — medication
   reminders don't need interval recurrence, a daily/no-repeat reminder is the common
   case) — smaller, well-understood, can ship independently and sooner.
3. **Problem 1, steps 2-3** (manual form UI, then Ask Cube schema) — lowest urgency,
   safe to sequence last.

Problem 2 could reasonably ship *before* Problem 1 entirely if the user wants the
smaller, faster win first — the two are fully independent; the order above is by
architectural importance, not a hard dependency chain.
