# Test Plan — Member Onboarding: Invite Code & Email Invite

**Scope:** two independent invite mechanisms found in the codebase, each with a parent-side half and an invitee-side onboarding half:

1. **Invite Code** (`family_invites` table, per-invitee model) — parent pre-creates the member row and profile, invitee joins with an 8-char code and sets their own PIN. This is the live, UI-wired path (`ProfileSettingsScreen.tsx`, `RosterTab.tsx` → `generate-invite-code` → `JoinFamilyScreen.tsx` → `join-family`).
2. **Email Invite** (`member_invitations` table, standalone real-auth model) — parent sends an email invite carrying a role; invitee signs in/up with their *own* real email and accepts via a deep link. **Flagged finding: `send-member-invite` has no UI call site anywhere in the app today** — it exists only as an edge function + DB table + accept screen (`MemberInviteScreen.tsx`) with nothing to trigger it from. This plan tests it directly via edge-function call (simulating what a future "Invite by email" button would do) and notes this gap explicitly rather than skipping the flow.

All testing uses isolated, throwaway test families (`zzob1_`–`zzob4_` prefix), real Supabase inserts/RPCs/edge-function calls against the live linked project, and ends every test case with an explicit row-count cleanup proof. No real user or production family data is touched at any point.

---

## Test Family Setup

| Family | Purpose |
|---|---|
| `zzob1_CodeHappy` | Code path — happy path + role/PIN verification |
| `zzob2_CodeEdge` | Code path — expiry, reuse, race, revoke, legacy-code edge cases |
| `zzob3_EmailHappy` | Email path — happy path, role stamping, deep link |
| `zzob4_EmailEdge` | Email path — expiry, wrong-email hijack attempt, duplicate invite, self-accept |

Each family created via normal `families` + one seed `parent` member insert (real auth user via `supabase.auth.admin.createUser` with a `+zzob*@test.familycube.dev`-style throwaway address). Every RPC/edge-function call logged with request/response. Final step of every test case: `select count(*) from members/family_invites/member_invitations where family_id = '<test family id>'` before delete, then delete, then re-`select count(*)` to prove 0.

---

## Part 1 — Invite Code Flow (`family_invites`)

### 1A. Parent: create pending member + generate code

| # | Step | Action (who) | Expected DB result | Expected UI result |
|---|---|---|---|---|
| TC-01 | Parent opens Profile → Family → "Invite Member" | Parent | — | `InviteMemberSheet` opens with name/role/relationship/DOB/optional-email fields |
| TC-02 | Parent submits name="Zoe Test", role=kid, no email | Parent | `insert into members (invite_status='pending', auth_user_id=null, family_id, role='child')` — real row, verify via direct select | Sheet closes, new pending member shows in roster list with "Pending" badge |
| TC-03 | Code auto-generated right after TC-02 | System (`generate-invite-code`) | `insert into family_invites (family_id, member_id=<TC-02 id>, code, status='pending', created_by=<parent auth uid>, expires_at=now()+7d)` — verify `code` matches `[A-Z]{3}[A-Z0-9]{5}` pattern (excl. 0/O/1/I/L) | 8-char code shown to parent, "Share code" UI (copy/share sheet) |
| TC-04 | Parent regenerates code for same pending member (resend) | Parent, via `resendInviteFor` | Existing `family_invites` row for that `member_id` is **updated in place** (new code, new expiry) — verify old code no longer resolves via `join-family`, verify only 1 row exists for that `member_id` (not 2) | New code displayed, old one silently dead |
| TC-05 | Second entry point: same actions via Vault → Roster tab's "Invite Codes" card instead of Profile sheet | Parent | Same table/RPC — confirm both UI entry points converge on identical `generate-invite-code` behavior, no divergent code paths | Same result surfaces in both places |
| TC-06 | Parent adds optional email to the pending member before code generation | Parent | Same `family_invites` insert; edge function additionally attempts Gmail SMTP send (best-effort) — verify `emailSent`/`emailError` returned in response, and that failure (e.g. bad email) does NOT roll back the code row | Alert shown if email failed to send, but code still usable |
| TC-07 | Non-parent (a `child`/`teenager` role member's auth token) attempts to call `generate-invite-code` directly | Malicious/test client | 403 rejected — verify no row written | — |

### 1B. Invitee: join with code

| # | Step | Action (who) | Expected DB result | Expected UI result |
|---|---|---|---|---|
| TC-08 | Fresh device, no session: tap "Join with Code" from `FamilyChoiceScreen` | Invitee | `supabase.auth.signInAnonymously()` creates a new anon `auth.users` row | Routed to `/onboarding/join-family`, code-entry step |
| TC-09 | Enter valid code from TC-03 | Invitee | `join-family` looks up `family_invites` by code+`status='pending'` — verify match found | Advances to profile step |
| TC-10 | Complete profile (avatar/color) + PIN steps, submit | Invitee | `members` row from TC-02 updated: `auth_user_id=<invitee's anon uid>`, `invite_status='active'`, `avatar`, `color`, PIN saved via separate `update` call — **verify name="Zoe Test" and role="child" are UNCHANGED from parent's original values** (server ignores invitee-typed name/role on this path) | Lands in `/(tabs)`, member appears active |
| TC-11 | `family_invites` row post-redemption | System | Verify `status='accepted'`, `used_by=<invitee auth uid>` | — |
| TC-12 | Same invitee (same device/session) re-submits the join form a second time (double-tap/retry) | Invitee | Second call 404s (`status='pending'` lookup fails since already `'accepted'`) — verify no duplicate `members` row, no duplicate `family_invites` row | Generic "Invalid or expired" shown, harmless since already joined |
| TC-13 | **Cross-role verification**: after TC-10, have the seed parent view the roster | Parent | — | Zoe now shows as active (not pending), correct role badge, correct avatar |

### 1C. Code path — edge cases (`zzob2_CodeEdge`)

| # | Step | Action | Expected result |
|---|---|---|---|
| TC-14 | Manually backdate a `family_invites.expires_at` to the past via direct DB update, then attempt `join-family` with that code | Invitee | 410 returned; verify `status` flips `pending→expired` as a side effect of the failed attempt |
| TC-15 | Attempt `join-family` with a `code` that never existed (random 8 chars) | Invitee | 404 "Invalid or expired invite code" — generic message, no distinct "never existed" vs "used" vs "expired" copy (confirms code-reading finding) |
| TC-16 | Race: two devices (two separate anon sessions) call `join-family` with the SAME valid code near-simultaneously | Two invitee clients | Exactly one succeeds; the second gets 409 "already been claimed on another device" — verify only ONE `members` row ends up with a non-null `auth_user_id` for that `member_id` |
| TC-17 | Delete the pre-created `members` row (TC-02-style) out from under a still-pending code, then attempt redemption | Invitee | 404 "the profile it was created for is missing" |
| TC-18 | Parent revokes a pending invite via `RosterTab.tsx`'s revoke action | Parent | `family_invites.status` directly set to `'expired'` — verify subsequent `join-family` attempt with that code 410s |
| TC-19 | Legacy-code simulation: manually insert a `family_invites` row with `member_id=null` (pre-migration shape), attempt join with invitee-typed name/role | Invitee | Verify the LEGACY branch fires: a brand-new `members` row is inserted using the invitee's own typed name/role (not a pre-created row) — confirms both code branches still function post-migration |
| TC-20 | Duplicate-code collision (forced): directly insert two `family_invites` rows with an identical `code` value across two different `member_id`s (simulating the un-enforced-at-DB-level race noted in research) | Test harness | Confirm which row `join-family`'s `.eq('code', ...)` lookup resolves (likely arbitrary/first match) — **document actual behavior**, since no DB constraint prevents this; flag as a real (if rare) latent bug if it resolves to the wrong family |

---

## Part 2 — Email Invite Flow (`member_invitations`)

**Note before running Part 2:** since no UI button currently calls `send-member-invite`, TC-21 onward invoke the edge function directly (via authenticated `fetch`/`supabase.functions.invoke`) to validate the backend contract that a future UI button would rely on. Flag to the user: confirm whether this feature is intended to ship soon (in which case these results gate that work) or is genuinely dead code to be removed.

### 2A. Parent: send email invite

| # | Step | Action | Expected DB result | Expected result |
|---|---|---|---|---|
| TC-21 | Parent (real, non-anonymous auth session) calls `send-member-invite` with `email="grandma+zzob3@test.familycube.dev", role="grandparent"` | Parent | `insert into member_invitations (family_id, token=<uuid>, email, role='grandparent', invited_by=<parent auth uid>, status='pending', expires_at=now()+7d)` | Function returns success; (would-be) deep link `familycube://member-invite/{token}` |
| TC-22 | Verify Gmail SMTP send attempted (best-effort) | System | Same non-blocking behavior as TC-06 — failure doesn't block the DB write | — |
| TC-23 | Same parent re-invites the same email while TC-21's invite is still pending | Parent | App-level check (line 81-91) AND DB unique partial index both should reject — verify only 1 row exists for `(family_id, lower(email))` where `status='pending'` | 4xx "already invited" style error |
| TC-24 | Parent invites an email that already belongs to an active member of the SAME family | Parent | Rejected — `existingMember` lookup match | Error surfaced |
| TC-25 | Parent invites an email that belongs to an active member of a DIFFERENT family (e.g. seed parent from `zzob1`) | Parent | **Allowed by design** — verify insert succeeds (cross-family membership is intentional, e.g. grandparent in two households) | Success |
| TC-26 | Non-parent role attempts to call `send-member-invite` | Test client | 403, no row written | — |

### 2B. Invitee: accept email invite

| # | Step | Action | Expected DB result | Expected UI result |
|---|---|---|---|---|
| TC-27 | Invitee opens `familycube://member-invite/{token}` with NO session | Invitee | `MemberInviteScreen` loads `member_invitations` by token (RLS allows any `authenticated` row-by-token read) — but invitee has no session at all yet | Prompted to Sign in / Create account before accept is possible |
| TC-28 | Invitee signs up with a real account using the SAME email the invite was sent to, returns to the invite screen, taps Accept | Invitee | `accept-member-invite` succeeds: idempotency check passes (first attempt), status/expiry/self-invite checks pass, email match passes → `insert into members (auth_user_id=<invitee uid>, email=<invitee email>, role='grandparent' [from TC-21], invite_status='active')`; `member_invitations` updated `status='accepted', accepted_at, accepted_by, member_id` | Lands in `/(tabs)` as an active member with the parent-assigned role, no PIN step (real-auth path has no PIN) |
| TC-29 | Invitee taps Accept again (retry/double-tap) | Invitee | Idempotent short-circuit — verify it returns the SAME `member_id` from TC-28, no second `members` row inserted | No visible error, same result |
| TC-30 | **Cross-role verification**: seed parent views roster after TC-28 | Parent | — | Grandma shows active, role=grandparent (exactly as the parent set at invite time — invitee never got to choose) |

### 2C. Email path — edge cases (`zzob4_EmailEdge`)

| # | Step | Action | Expected result |
|---|---|---|---|
| TC-31 | Invitee signs in with a DIFFERENT email than the invite targeted, taps Accept | Invitee | 403 "wrong account" — both client pre-check (`MemberInviteScreen.tsx`) and server (`accept-member-invite`) should block; verify no `members` row written |
| TC-32 | Invitee is only in an ANONYMOUS session (never completed real signup) and somehow reaches the accept action (e.g. by bypassing the client gate) | Invitee | Server-side hard rejection — `user.email` null check (line 87-89) — 403 regardless of client-side gating |
| TC-33 | Backdate `expires_at` on TC-21's row, attempt accept | Invitee | 410; verify `status` flips `pending→expired` |
| TC-34 | The inviting parent attempts to accept their OWN invite (e.g. testing with a second browser tab under their own account) | Parent | 400 self-invite rejection |
| TC-35 | Parent revokes a pending `member_invitations` row via direct RLS-permitted update (no UI button exists per the research finding — test the RLS path directly) | Parent | `status→'revoked'` succeeds under RLS; subsequent accept attempt correctly rejects (`status !== 'pending'`) — **flag: this proves the backend supports revoke but there is no UI to trigger it in-app today** |

---

## Cross-Cutting Checks (both flows)

| # | Check |
|---|---|
| TC-36 | Confirm `members.email` per-family uniqueness (`idx_members_family_email_unique`) — attempt to add two pending/active members with the same email in the same family, confirm rejection; confirm the SAME email IS allowed across two different families |
| TC-37 | Confirm neither `family_invites` nor `member_invitations` is readable/writable by a request with NO Supabase session at all (raw anon-key REST call, no JWT) — RLS should reject |
| TC-38 | Confirm an anonymous (code-path) session can never successfully call `accept-member-invite` (already covered by TC-32, listed here as the explicit cross-flow boundary check) |
| TC-39 | Confirm a real-auth (email-path) invitee is never routed through `JoinFamilyScreen`'s PIN step — the two onboarding UIs should never cross-contaminate |
| TC-40 | Push-token best-effort notification (`send-member-invite`, lines 168-201) — verify failure to deliver a push never blocks the DB insert or HTTP success response |

---

## Cleanup Proof (run after every test family)

```sql
-- before delete
select count(*) from members where family_id = '<test family id>';
select count(*) from family_invites where family_id = '<test family id>';
select count(*) from member_invitations where family_id = '<test family id>';

-- delete (cascades: members→family cascade, family_invites member_id cascade, member_invitations family_id cascade)
delete from families where id = '<test family id>';

-- after delete — all must return 0
select count(*) from members where family_id = '<test family id>';
select count(*) from family_invites where family_id = '<test family id>';
select count(*) from member_invitations where family_id = '<test family id>';
```

Also delete the throwaway `auth.users` rows created for anon sessions (TC-08, TC-16) and real signups (TC-28, TC-31, TC-34) via `supabase.auth.admin.deleteUser`.

---

## Open Questions to Resolve Before/During Execution

1. **Is the email-invite feature (`send-member-invite` / `member_invitations` / `MemberInviteScreen`) intended to ship soon, or is it dead code?** No UI button calls it anywhere today. Worth a decision before investing further QA time in Part 2 — either wire up an "Invite by email" button in `InviteMemberSheet`, or flag the whole subsystem for removal.
2. **Revoke UI gap** — `member_invitations` RLS supports parent-initiated revoke (TC-35) but no screen exposes it, unlike `family_invites` which has a working revoke button in `RosterTab.tsx`. If email invites ship, this needs a matching UI affordance.
3. **Duplicate-code race (TC-20)** — no DB-level unique constraint on `family_invites.code`. Given the 8-char alphabet (`3^{uppercase-letters} × 5^{31-char alphabet}`≈ huge keyspace) a real collision is astronomically unlikely, but the *forced* test (TC-20) will reveal what happens if the app-level retry-loop is ever bypassed or bugged — worth running once and documenting, not necessarily worth a DB migration unless TC-20 reveals an actual family-crossing risk.
