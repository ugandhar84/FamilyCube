# Auth / Session / Onboarding / Biometric Flow Hardening

**Status:** Implemented — commit `3e74ad77` on `feat/silky-premium-palette`.

## Context

This session hit a cascade of real bugs in sign-out/sign-in/onboarding/biometric
routing: a cross-account data leak, sign-out landing on onboarding instead of
login, an already-onboarded user being shown "Create/Join Family" for a family
that already exists, and one genuine infinite loop (from a reactive fix attempt,
already reverted). Root cause, confirmed by a full read-only architecture audit:
**5 independent navigators** decide auth/onboarding/family routing with no
shared coordination and no way to distinguish "family data still loading" from
"confirmed, genuinely empty family." Two of the five never checked family state
at all; the one that did couldn't tell loading from empty; a fourth could bounce
the user back to `/(tabs)` at an arbitrary later moment, re-triggering the
first; and sign-out had 4 different implementations instead of 1, so biometric
preservation and cross-account cache clearing weren't applied consistently.

**Design decision: targeted coordination fixes to the existing 5 navigators,
not a rewrite.** They don't disagree on policy, only on timing/staleness
handling — a consolidated mega-effect would risk re-deriving splash-timing,
call-alert routing, and widget-tap deferral logic that already has hard-won,
comment-documented fixes protecting it.

## The fix, in 4 parts

### 1. `store/familyStore.ts` — a genuine loading-vs-confirmed signal

Added `familyLoadStatus: 'idle' | 'loading' | 'confirmed'` to `FamilyState`.
- `loadFromStorage()`: sets `'loading'` at the start; sets `'confirmed'` on the
  cache-hit branch; sets `'confirmed'` after the existing bounded 3-attempt
  retry loop exits (whether it found members or not).
- `syncFromDB()`'s other direct call sites (`ChildChoreBoard.tsx`,
  `ParentReviewDeck.tsx`) do NOT touch this field — only `loadFromStorage`'s
  already-bounded loop may set `'confirmed'`, since it's the one code path
  guaranteed to terminate. This is what makes it safe: `'confirmed'` is
  *always* reached in bounded time (≤3 attempts, ≤~1.5s backoff), regardless
  of what the query returns — there is no "can't verify, block forever" path,
  which is what caused an earlier fix attempt (commit `4b917b2d`, since
  reverted in `8ef931a7`) to produce a genuine infinite loop.
- `reset()`: sets it back to `'idle'`.

### 2. `app/(tabs)/_layout.tsx` — one-shot guard + status-aware gating

The family-redirect effect now gates on `familyLoadStatus === 'confirmed'`
instead of the `loaded` boolean (which flipped `true` the instant *any* fetch
attempt finished, including a still-resolving auth-propagation race that looked
identical to a real empty family), plus a `useRef` one-shot guard so it can
never re-fire within the same mount:

```ts
const hasSession = useAuthStore(s => !!s.session);
const familyLoadStatus = useFamilyStore(s => s.familyLoadStatus);
const redirectedToOnboarding = useRef(false);
useEffect(() => {
  if (redirectedToOnboarding.current) return;
  if (hasSession && familyLoadStatus === 'confirmed' && members.length === 0) {
    redirectedToOnboarding.current = true;
    router.replace('/onboarding');
  }
}, [hasSession, familyLoadStatus, members.length]);
```

A genuine new `(tabs)` mount (e.g. after a real subsequent sign-in) gets a
fresh ref, so one legitimate check is preserved.

`SetupFamilyScreen.tsx` needed **no code change** — its own existing-family
check (kept as-is, a legitimate safety net against duplicate family rows) is
no longer reachable via the ping-pong path once this gate can't fire
prematurely.

### 3. `store/authStore.ts` — one `signOut()`, consistently applied everywhere

`signOut()` gained an optional param: `signOut(opts?: { forceGlobal?: boolean })`.
When `forceGlobal` is true, it skips the biometric-preserve branch entirely
(`localOnly` stays `false`, so the Supabase call defaults to a global sign-out)
— every other side effect (push-token removal, all store resets including
`familyStore.reset()`, query-cache clear) still runs. Default behavior for
existing callers (e.g. `ProfileSettingsScreen.tsx`'s normal Sign Out) is
unchanged.

Consolidated 3 raw/uncoordinated `signOut()` call sites onto this:
- **`LockScreen.tsx`'s `signInDifferent()`** — now calls
  `useAuthStore.getState().signOut({ forceGlobal: true })` instead of a raw
  `supabase.auth.signOut()`. This closed a real gap: the raw call never ran
  `familyStore.reset()`, a live cross-account-leak risk if the next sign-in is
  a different account.
- **`app/_layout.tsx`'s two soft-delete-restore-failure branches** — same
  replacement, preceded by `clearBiometricSession()` so a broken/failed-restore
  account doesn't leave a stale biometric token silently offering Face ID into
  a state that just failed.

### 4. Cold-launch biometric gap — confirmed working as intended, no change

A global sign-out revoking the server-side refresh token, then requiring
password re-entry on next launch, is the correct security model (the same one
banking apps use — a biometric token is a shortcut back into an *already-valid*
session, never a standalone credential). Boot's `getSession()` correctly routes
to `/login` when there's truly no session; `LoginScreen.tsx`'s own biometric
auto-trigger is the correct, already-working recovery path for a *local*
sign-out. No change made to boot's routing logic.

## Files touched

| File | Change |
|---|---|
| `store/familyStore.ts` | Added `familyLoadStatus` field; set in `loadFromStorage()`/`reset()` |
| `app/(tabs)/_layout.tsx` | One-shot ref guard + gate on `familyLoadStatus === 'confirmed'` |
| `store/authStore.ts` | Added `{ forceGlobal? }` param to `signOut()` |
| `features/auth/screens/LockScreen.tsx` | `signInDifferent()` routes through `authStore.signOut({ forceGlobal: true })` |
| `app/_layout.tsx` | Both soft-delete-restore-failure branches route through the same, preceded by `clearBiometricSession()` |
| `features/onboarding/screens/SetupFamilyScreen.tsx` | No change |

Explicitly **not** touched: boot's `getSession()` gate, `onAuthStateChange`'s
profile-check gate, `LoginScreen.tsx`'s biometric auto-trigger,
`ProfileSettingsScreen.tsx`'s isAuthLinked/viewingOwnProfile split, the
`signedOut=1` param, `loadFromStorage`'s existing retry backoff timing.

## Verification checklist

1. `npx tsc --noEmit` clean.
2. **Cross-account leak**: sign out via both normal Sign Out and
   `signInDifferent()`, sign in as a different account each time — confirm no
   flash of the previous account's family members.
3. **Sign-out → onboarding bug**: sign out from an already-onboarded account —
   confirm landing on `/login`, not `/onboarding`; sign back in — confirm
   landing on `/(tabs)`, not onboarding.
4. **False "no family" bug**: sign in as an account with a real family on a
   throttled/slow connection if possible — confirm the `(tabs)` redirect does
   not fire until `familyLoadStatus` reaches `'confirmed'`.
5. **No loop regression**: force `syncFromDB` to return empty repeatedly
   (temporary test mock) — confirm the app still reaches `/onboarding`
   deterministically within ~2.5s — never hangs, never bounces back and forth
   more than once. Watch console for `router.replace` spam for 10s after
   landing on any screen in this flow.
6. **Sign-out consistency**: after `signInDifferent()`, confirm the previous
   account's biometric token no longer auto-offers Face ID on next cold
   launch.
7. **Regression**: confirm `ProfileSettingsScreen.tsx`'s Sign Out vs Lock &
   Switch Back behavior is unaffected (no changes made there).

## Prior related commits (same investigation, this session)

- `17c693e2` — Sign Out no longer ends the real session while viewing a
  PIN-switched profile (the `isAuthLinked`/`viewingOwnProfile` split).
- `f455bce4` — first attempt at the family-load race (partial fix, superseded
  by this hardening pass).
- `4b917b2d` — a fix attempt that introduced a real infinite loop (see above).
- `8ef931a7` — revert of `4b917b2d` back to a safe baseline.
- `187017f1` — kiosk-style profile picker screen (`/(auth)/profile-picker`),
  unrelated feature built in the same session, not part of this hardening.
