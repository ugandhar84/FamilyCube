# Kiosk visual design refresh — deferred

Requested mid-session (2026-09-07), explicitly deferred by the user ("We can take it later") — not started. Captured here so it isn't lost.

## The ask

User wants kiosk's buttons, radios, and form-control styles redesigned — a genuine new visual direction, not a consistency cleanup of the existing system. Confirmed via AskUserQuestion:
- No existing mock/screenshot/Figma to match — this is open-ended design work, not a port.
- Scope: **all of kiosk, systemically** (not just recent additions) — changes belong in the shared design-system files (`features/kiosk/kioskTheme.ts`, `features/kiosk/kioskPalette.ts`, `features/kiosk/components/KioskOS.tsx`), not scattered per-screen overrides.
- Explicitly the whole visual style, not just consistency: "the whole visual style needs to change."

## Current state (as of this writing)

Kiosk already has a coherent, deliberately-documented design system — this is what's being replaced, not extended:

- **`features/kiosk/kioskTheme.ts`** — size half of the system: `KIOSK_TYPO` (type ladder), `KIOSK_HIT` (touch targets, 48/52/56/64/84px), `KIOSK_SPACE` (6/10/14/20/28/40), `KIOSK_RADIUS` (10/14/20/26/999 — "Ambient Counter" soft-corner feel), `kioskElevation()` (warm tinted shadow in light mode, flat in dark mode).
- **`features/kiosk/kioskPalette.ts`** — color half, light/dark variants off the app's own `useTheme()`.
- **`features/kiosk/components/KioskOS.tsx`** — the actual components: `ActionButton` (solid/soft variant, `s.action` style), `Chip` (filled/wash variant, `s.chip`), `WidgetCard`, `WidgetHeader`, etc.
- **`features/kiosk/components/KioskFormDrawer.tsx`** — `KioskPill` (single-select "radio" control, currently a filled/outlined rounded-rect pill, not a circular radio-dot — `accessibilityRole="button"`, `accessibilityState={{selected}}`), `KioskFieldLabel`, `kioskInputStyle`.

The theme file's own header comments explain the current direction's reasoning in detail (why type is non-uniform, why touch-target size and visual size are deliberately decoupled, why radii stay on a fixed ladder, why shadows are warm-tinted and disabled in dark mode) — worth reading before replacing it, since some of that reasoning (touch-target-vs-visual-size decoupling especially) reflects real live-reported calibration fixes ("components are too big... too much zoomed in") and may still apply under a new visual style even if the specific values change.

## Open questions for when this resumes

1. **Direction** — what's the new visual style actually going for? Needs a real design pass (palette, type pairing, layout concept), not just "change the radius." Should use the `artifact-design` skill's fundamentals if mocked up as a reference artifact, or be scoped directly as a code change if going straight to implementation.
2. **Radio shape specifically** — does the new direction want a literal circular radio-dot for single-select choices (category pickers, subject chips, etc.), replacing `KioskPill`'s current filled-pill shape? Called out by name in the request.
3. **Migration scope** — changing shared tokens in `kioskTheme.ts`/`KioskOS.tsx` will ripple across every kiosk screen built this session (Schedule, Chores, Overview, all the new editors/sheets). Should be validated with `npx tsc --noEmit` and a visual pass across all of them, not just the file(s) directly touched.
4. **Reused mobile components** — several real mobile components are mounted directly on kiosk this session (`HouseholdBacklogSection`, `ActionNeededSection`, `AlertBanner`, `ParentReviewDeck`, `MedicationsCard`, `SendBonusCard`, the backlog cards, etc.) and keep their own phone-native styling (`colors`/`isDark` props, not kiosk tokens) by design — a kiosk visual refresh won't reach these unless they're deliberately rebuilt kiosk-native (the precedent for that trade-off already exists: `KioskAskParentFlow.tsx`'s header comment explains why 6 phone modals were rebuilt kiosk-native instead of reused as-is, specifically over a modal-width/palette mismatch).

## Standing constraints that still apply when this resumes

- Kiosk-only files (`features/kiosk/**`) — never edit `features/hub/`, `features/quests/`, `features/calendar/`, `features/tasks/`, or other mobile screens.
- `npx tsc --noEmit` must return zero errors before any piece of this is considered done.
- Never guess a real store/hook signature — grep/read the actual definition first.
