# Kiosk Design & Build Rules

Source of truth for how kiosk-mode work gets built in this repo, going
forward. Read this before starting any new kiosk screen/form. This is a
real product surface, not a mock — build it like one from the first file,
not after the fact.

---

## Hard rules (non-negotiable)

1. **Never edit a mobile/shared file to build a kiosk feature.** Not
   `features/quests/`, `features/calendar/`, `features/tasks/`,
   `features/vault/`, or any shared `components/*.tsx` used by real phone
   screens. Read them all you want — never `Edit`/`Write` them for kiosk's
   sake.
2. **When a shared component owns its own Modal/shell with no clean
   prop-driven seam** (can't swap what it renders without changing its
   internals) — fork the whole consuming file into a new kiosk-owned file.
   Change ONLY the shell-owning import(s), aliased to the same local name,
   so the rest of the real logic needs zero other edits. Confirmed pattern:
   `AddQuestModal.tsx` → `KioskAddChoreForm.tsx`.
3. **When a shared component IS cleanly prop-driven** (visible/onClose/
   onConfirm-style contract, no assumptions about its host's chrome) —
   reuse it directly in kiosk forms. No fork needed. Confirmed examples:
   `MemberPicker`, `PhotoRedactModal`.
4. **Never invent data, never simplify permission/validation logic, never
   guess a store signature.** Read the real store/mobile screen first.
5. **New "intelligent" validation (e.g. minimumDate checks) is fine to ADD
   on kiosk even where mobile doesn't have it**, as long as it's confirmed
   mobile genuinely lacks it (don't assume — grep/read first) and it's a
   strict improvement, not a behavior change mobile relies on.
6. **Don't port a mobile limitation as if it were a kiosk bug** — if kiosk
   and mobile share the identical constraint (e.g. AddMedModal's dose-count
   cap), that's parity, not something to "fix" unilaterally.
7. **Do the work, don't narrate the size of the file.** Forking a
   1000+ line file is expected and fine when rule 2 applies — plan it,
   then build it, without a running commentary on how big it is.

## Structural defaults for a new kiosk form

- Kiosk forms are **right-anchored drawers**, not bottom sheets:
  `width: 520, maxWidth: '100%', height: '100%', borderLeftWidth: 1`,
  matching `KioskFormDrawer`'s own `panelBase`/`panelDrawer` values.
  Copy these values exactly rather than re-deriving them per file.
- Multi-step forms reuse the `KioskTaskFormShell` pattern (kiosk fork of
  `TaskFormShell`) — same `stepIds/stepTitles/step/setStep/accentColor/
  headerTitle/headerSubtitle/reviewStepId/children` contract as the real
  shell it forks.
- Date/time fields always use `KioskDateTimePicker` +
  `openAndroidPicker` (`features/kiosk/components/KioskDateTimePicker.tsx`):
  iOS renders a real embedded (`display="inline"`) calendar; Android has
  no inline mode, so it opens the native imperative dialog instead. This
  is a genuine platform capability split, not a style choice — don't try
  to unify it.
  - Always thread the real `isDark` from `useKioskColors()` into
    `themeVariant` — never guess dark mode from a hex-literal comparison.
  - Always wire a `Done` button (`onDone`) — an inline calendar has no
    other natural dismiss affordance.
  - Add `minimumDate` wherever a field is logically forward-looking
    (chore/med due dates, start dates) and reject impossible ranges
    (end < start) with an inline error + auto-bump, not a silent clamp.
- Full-bleed content (camera/gesture views like redaction) must NOT be
  passed as `children` into `KioskFormDrawer` — its body is always padded
  and scrollable with fixed chrome. Give that screen its OWN `<Modal>`
  instead (see `KioskScanReviewForm.tsx`).

## When merging/reducing steps in a forked wizard

- Multi-step forms fork `stepIds` as a `readonly string[]`; any
  `useEffect` that reacts to step count (e.g. clamping the current index,
  jump-to-review) should already compute off `stepIds.length` dynamically
  — verify this holds after a merge rather than assuming.
- A step's real JSX content is not guaranteed to live in one contiguous
  block — grep every `currentStepId === '<id>'` occurrence before editing;
  a single step (e.g. "assign") can be split across multiple conditional
  blocks interleaved with other steps' blocks in the file.
- Merge steps by combining the JSX under one `currentStepId === '<newId>'`
  check and removing the old id from `stepIds`/`stepTitles` — don't
  reshuffle unrelated blocks in the same pass.

## Process going forward

- Plan multi-file/multi-step changes before writing code (this file is the
  place to extend that plan when it's a reusable rule, not a one-off).
- Execute directly once the plan is clear — no running commentary on scope
  or file size mid-task.
- Verify with `npx tsc --noEmit` (must stay clean) before calling any
  kiosk change done.
