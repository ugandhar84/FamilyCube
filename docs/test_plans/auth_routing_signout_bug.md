# Bug Investigation + Test Plan — Sign-out lands on onboarding/join-family instead of login

## Live repro reported (2026-08-27)

1. Sign out from Profile → **lands on the onboarding slideshow / "I have an account, join a family" screen, not `/login`.**
2. Tap "I have an account" → sign in with the SAME auth user that just signed out → **lands on `/onboarding` again, not `/(tabs)`.**
3. Confirmed via device log that the profile check itself ran and decided correctly:
   ```
   [FamilyCube:ProfileCheck] {"deleted_at": null, "onboarding_completed": true, "profileError": undefined,
   "profileExists": true, "terms_accepted": true, "userId": "62ac7da2-..."}
   ```
   i.e. `app/_layout.tsx`'s `onAuthStateChange` `SIGNED_IN` handler correctly resolved `router.replace('/(tabs)')` — so **something navigates AWAY from `/(tabs)` after that**, or a stale/racing navigation from before the sign-in wins the race against it.

## Root-cause hypotheses, ranked

### H1 — Biometric-preserving sign-out never fires a real `SIGNED_OUT` event (HIGH confidence)

`store/authStore.ts:244-272` (`signOut()` without `forceGlobal`): when biometric login is enabled, it **deliberately skips `supabase.auth.signOut()` entirely** to keep the refresh token alive for Face ID — it only clears local Zustand state (`set({session:null,...})`). Supabase's client-side session is never invalidated, so `onAuthStateChange` never emits `SIGNED_OUT`, and `app/_layout.tsx`'s `SIGNED_OUT` handler (the one that correctly routes to `/(auth)/login?signedOut=1`, line ~397-406) **never runs**.

The ONLY thing that navigates to login on this path is `ProfileSettingsScreen.tsx`'s own explicit `router.replace('/(auth)/login?signedOut=1')` (line 1588) after `await signOut()`. If anything else — a stray effect, a deep-link handler, a `getSession()`-based check anywhere — reads Supabase's still-valid, unrevoked session in that same window and independently triggers navigation (or if a queued `INITIAL_SESSION`/`TOKEN_REFRESHED` event from the still-live client fires and re-enters the `SIGNED_IN` branch), it can race and override the explicit `/login` replace with something else, OR silently re-authenticate. `LoginScreen.tsx`'s own auto-Face-ID-trigger IS correctly suppressed via `signedOut=1`/`justSignedOut` (line 131) — but that only blocks LoginScreen's *own* effect, not any other consumer of the still-valid session.

**This does not by itself explain landing on `/onboarding`/`FamilyChoiceScreen`** — it explains landing somewhere OTHER than a clean `/login`. Needs to be combined with H2 or H3.

### H2 — `(tabs)/_layout.tsx`'s onboarding-redirect guard fires on stale `familyLoadStatus`/`members` after the SECOND (real) sign-in (MEDIUM-HIGH confidence — best fit for the log evidence)

`app/(tabs)/_layout.tsx:383-389`:
```ts
useEffect(() => {
  if (redirectedToOnboarding.current) return;
  if (hasSession && familyLoadStatus === 'confirmed' && members.length === 0) {
    redirectedToOnboarding.current = true;
    router.replace('/onboarding');
  }
}, [hasSession, familyLoadStatus, members.length]);
```
This fires on a FRESH `TabLayout` mount (fresh `useRef`) if, at ANY point after `hasSession` becomes true, `familyLoadStatus` reaches `'confirmed'` while `members` is still `[]`. The mount-effect at line 344-348 (`if (!familyLoaded) loadFamily()`) kicks off `loadFromStorage()`, which has a bounded 3-attempt/~1.5s retry specifically to bridge "auth just happened, DB read comes back empty transiently" — but that retry window is capped. If the real `members` fetch takes LONGER than ~1.5s after a sign-in that immediately follows a sign-out (fresh JWT propagation, RLS context, cold Supabase connection, etc.), `familyLoadStatus` reaches `'confirmed'` with `members.length === 0` anyway, and THIS effect — not the `onAuthStateChange` profile check — sends the user to `/onboarding`. This fires entirely independently of, and later than, the correct `router.replace('/(tabs)')` your log shows — explaining exactly the "correct decision, wrong final screen" symptom.

**This is the most likely root cause of symptom #2** (sign back in → onboarding despite a real family existing) and plausibly of #1 as well if the biometric-preserved "sign out" is quietly re-authenticating fast enough to reach `/(tabs)` before hitting this same race.

### H3 — Double/duplicate `TabLayout` mount reusing a stale `redirectedToOnboarding` ref or racing two `loadFromStorage()` calls (LOW-MEDIUM confidence)

If React (especially in dev/StrictMode) or expo-router's own screen-freezing keeps a previous `(tabs)` instance alive/frozen rather than fully unmounting, `familyStore.reset()`'s `familyLoadStatus: 'idle'` write could interleave with an in-flight `loadFromStorage()` call from the PREVIOUS session, corrupting the state machine (e.g. an in-flight promise's own `set({familyLoadStatus:'confirmed'})` landing AFTER `reset()`'s `'idle'`, prematurely marking a stale/empty state as confirmed for the new session). Worth instrumenting/ruling out even if H2 turns out to be sufficient on its own.

## Recommended immediate fix (pending test confirmation)

Widen `(tabs)/_layout.tsx`'s redirect condition so a transient "confirmed but empty" state occurring **immediately after a fresh sign-in** doesn't get treated identically to a genuinely-onboarded-but-family-less account. Options, in order of preference:
1. Increase `loadFromStorage`'s retry bound specifically for the immediately-post-sign-in case (e.g. detect "no cache at all" + "session is brand new this app lifetime" and use a longer/more attempts backoff only in that case), OR
2. Add one more layer of confirmation before firing `router.replace('/onboarding')` in `(tabs)/_layout.tsx` — e.g. require `familyLoadStatus === 'confirmed'` to hold true across two consecutive effect ticks / a short debounce, not just once, OR
3. Have `ProfileSettingsScreen.tsx`'s sign-out (and the biometric-preserving branch generally) explicitly force a real `supabase.auth.signOut()` call (not just local state) even when preserving biometrics — i.e. separate "revoke the live session" from "keep a token stashed for Face ID restore" as two independent concerns instead of one skipping the other. This closes H1 outright regardless of H2/H3's outcome.

Do not implement any of these until the test cases below have isolated which hypothesis is actually firing — the fixes are different enough that guessing wrong wastes a cycle (and risks re-introducing the exact infinite-loop regression this exact file's comments already warn about).

---

## Test Plan

All tests use a real, throwaway auth account + real Supabase Auth session (not anonymous) against a real family (`zzrt1_SignoutRepro`), so RLS/JWT timing is realistic. Console log capture required for every run (the app already logs `[FamilyCube:ProfileCheck]`, `[Bio] signOut: ...`, `dbg(TAG, 'onAuthStateChange → ...')` — capture full device logs, not just a summary).

### Group A — Isolate H1 (biometric-preserving sign-out event behavior)

| # | Step | Setup | Expected (if working) | What confirms H1 |
|---|---|---|---|---|
| TC-01 | Disable biometric login entirely for the test account, then tap Sign Out | Biometric OFF | `supabase.auth.signOut()` actually called (full path, not preserved branch) → real `SIGNED_OUT` event → `app/_layout.tsx` line 406's `/login?signedOut=1` fires → lands cleanly on Login | If this ALSO fails to land on `/login`, H1 is ruled out — H2/H3 are the real cause |
| TC-02 | Enable biometric login, tap Sign Out, capture logs for `[Bio] signOut:` lines | Biometric ON | `preservedBiometricSession` should log `true`; `supabase.auth.signOut()` line 271 should NOT execute (confirm via log/breakpoint) | Confirms the skip is actually happening as designed |
| TC-03 | Immediately after TC-02, call `supabase.auth.getSession()` directly (e.g. via a temporary debug log at the top of `LoginScreen`'s mount) — does it still return a valid, non-null session? | Biometric ON | **This is the crux check.** If `getSession()` returns a still-live session on the Login screen right after sign-out, that confirms the client-side session was never actually invalidated, matching H1's exact mechanism | A live session here + landing anywhere other than the plain Login form confirms H1 |
| TC-04 | With biometric ON, sign out, then immediately (within ~1s, before tapping anything) check what screen is actually rendered and whether any OTHER `onAuthStateChange` event fired in the log (`INITIAL_SESSION`, `TOKEN_REFRESHED`, spurious `SIGNED_IN`) | Biometric ON | Should see ONLY the explicit UI navigation, no auth events | Any additional auth event here is the smoking gun for H1's "still-live session gets rediscovered" |

### Group B — Isolate H2 (post-sign-in family-load race)

| # | Step | Setup | Expected (if working) | What confirms H2 |
|---|---|---|---|---|
| TC-05 | With biometric OFF (to cleanly isolate from H1), sign out normally (confirmed landing on `/login` via TC-01), then sign back in with the SAME account. Capture full timing: timestamp of `SIGNED_IN` event, timestamp of `router.replace('/(tabs)')`, timestamp of `(tabs)/_layout.tsx` mount, timestamp of each `loadFromStorage` retry attempt, timestamp (if any) of `router.replace('/onboarding')` from line 387 | Biometric OFF | Should land on `/(tabs)` and STAY there | If `router.replace('/onboarding')` fires AFTER `/(tabs)` was reached, with `familyLoadStatus==='confirmed'` and `members.length===0` at that moment — H2 confirmed directly |
| TC-06 | Same as TC-05 but on a throttled/slow network (Instruments Network Link Conditioner or equivalent, ~1-2s added latency) to make the race window wider and more reproducible | Biometric OFF, throttled | If TC-05 was borderline/inconsistent, this should make it fail consistently if H2 is real | Reliable repro under throttling strongly confirms H2 |
| TC-07 | Same as TC-05 but with the account's family intentionally having many rows (real members, quests, events) to see if `syncFromDB`'s query itself is slow enough at any realistic scale to blow the 1.5s retry budget even on a fast network | Biometric OFF | Should still resolve within budget | If it also fails here, H2's root fix needs to scale the retry budget, not just patch a network-throttled edge case |
| TC-08 | Directly instrument (temporary console.log) `(tabs)/_layout.tsx` line 385's condition inputs (`hasSession`, `familyLoadStatus`, `members.length`) on every effect run during TC-05's repro | Biometric OFF | — | Definitive proof/disproof of H2 — shows the EXACT values at the moment the redirect fires |

### Group C — Isolate H3 (stale mount / duplicate loadFromStorage race)

| # | Step | Setup | Expected | What confirms H3 |
|---|---|---|---|---|
| TC-09 | Add a temporary module-level counter incrementing on every `TabLayout` function-body execution (not just effects — the function itself), log it on sign-out → sign-in cycle | — | Should see exactly ONE new mount per real navigation into `/(tabs)` | More than one mount per navigation, or a mount whose `redirectedToOnboarding` ref is already `true` on first render, confirms H3 |
| TC-10 | Add a temporary log at the top and bottom of `familyStore.loadFromStorage()` with a unique call-id, run TC-05's repro, confirm no two calls are ever in flight simultaneously for the same session | — | Exactly one in-flight `loadFromStorage()` call per sign-in | Overlapping calls (a stale one from the prior session still resolving) confirms H3 |

### Group D — Combined real-world repro matrix

| # | Scenario | Biometric | Network | Expected pass condition |
|---|---|---|---|---|
| TC-11 | Sign out → sign back in, same device, same account, fast network | OFF | Normal | Lands and stays on `/(tabs)` |
| TC-12 | Same, biometric ON | ON | Normal | Lands and stays on `/(tabs)`, no login form flash for an explicit sign-out |
| TC-13 | Same, biometric ON, throttled network | ON | Throttled | Lands and stays on `/(tabs)` — this is the highest-risk combination given H1+H2 compounding |
| TC-14 | Sign out → cold-kill the app → relaunch → sign in (not Face ID) | OFF | Normal | Lands on `/(tabs)`, not onboarding |
| TC-15 | Sign out → cold-kill the app → relaunch → use Face ID to restore | ON | Normal | Lands on `/(tabs)` directly, no onboarding flash |
| TC-16 | Repeat TC-11 five times in a row (rapid sign-out/sign-in cycling) to check for cumulative state corruption (stale refs, leaked realtime channels, etc.) | OFF | Normal | Consistent behavior on all 5 attempts — no degradation |

---

## Instrumentation checklist before running

- [ ] Temporary verbose logging added to: `authStore.signOut()` (already has some `[Bio]` logs — confirm they're active), `app/_layout.tsx`'s `onAuthStateChange` (already has `dbg(TAG, 'onAuthStateChange → ...')` — confirm log level is visible), `(tabs)/_layout.tsx`'s redirect effect (line 383-389 — ADD a log here, currently silent).
- [ ] Confirm whether the test device/simulator has biometric enrollment available (Face ID simulator toggle) to actually exercise the ON branches.
- [ ] Capture full `adb logcat`/Xcode console output for each test case, not summarized — timestamps matter for race diagnosis.

## Cleanup

Standard: delete the throwaway `zzrt1_SignoutRepro` family and its auth user via `supabase.auth.admin.deleteUser` after the full matrix runs; verify 0 rows remain in `members`/`families` for that id.
