# Claude Agent Instructions for PawBond (Petkoinia)

**READ THIS FIRST** before starting any task. This file is the source of truth for all agent sessions.

---

## Pre-Task Checklist

Every session, in this order:

1. ✅ **Read `AGENT_CONTEXT.md`** — current state, architecture, known issues
2. ✅ **Sync with remote** — `git checkout main && git pull origin main` before touching any files
3. ✅ **Run `git status`** — verify working tree is clean (no uncommitted changes)
4. ✅ **Run `npx tsc --noEmit`** — baseline TypeScript health check (should show 0 errors on source files)
5. ✅ **Ask the user** — clarify the exact scope (don't guess at multi-part tasks)
6. ✅ **Create a fresh branch** — `git checkout -b fix/[task-name]` or `feat/[task-name]` — never reuse an old branch from a previous session

## Avoiding Conflicts (multi-session rule)

Each Claude session is independent. If two sessions touch the same file on the same branch, git will conflict on merge. The fix is simple:

- **One session = one branch = one PR.** When you're done with a task: commit → push → merge PR → done.
- **Never continue work on a branch from a previous session** without first checking if it was already merged and starting fresh from main.
- **Always `git pull origin main`** as step #1. If the branch was merged, switch to main and create a new branch.

---

## Core Rules

### 1. Scope is Sacred
- **One task = one branch = one commit.**
- If the user asks for 5 things, ask: *"Should I do these as separate PRs or one? Which is the priority?"*
- Don't bundle unrelated refactors into a bug fix.

### 2. TypeScript Must Pass
- Every change must pass `npx tsc --noEmit` with 0 errors on source files (backups excluded).
- Pre-existing errors are listed in `AGENT_CONTEXT.md` — don't fix them unless asked; don't make them worse.

### 3. Commit Discipline
- **One semantic commit per task.** No "temp commit" + "fix commit" + "oops commit" chains.
- Commit message format:
  ```
  feat: [short title — what changed]
  
  [2-3 sentences on why + any context the next agent needs]
  
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- Example: `fix: notification mark-done dedup — store + local state sync`

### 4. Test Before Claiming Done
- If the change is observable in the UI: start the dev server, verify it works, share a screenshot.
- If it's backend/type-only: verify TypeScript passes.
- **Claim "done" only when you've tested it**, not just "the code looks right."

### 5. Ask About Architecture, Don't Guess
- If you're unsure whether to:
  - Add a new hook vs. modify an existing one
  - Store state in Zustand vs. local React state
  - Create a new edge function vs. add to an existing one
  - **Ask the user.** Don't make judgment calls on architecture.

### 6. Update the Context File
- After every session, update `AGENT_CONTEXT.md`:
  - New decisions made
  - New bugs found
  - Status of what's in progress
  - Any new architectural patterns
- Commit this update as part of the same commit (or a separate "chore" commit if it's substantial).

### 7. Never Break Existing Tests
- Search for `test` / `spec` files before making changes.
- If they fail, fix them or ask the user before proceeding.

---

## File Organization (Don't Deviate)

The project follows strict modular architecture. Always preserve this structure:

```
src/
  ├── app/                     # Expo Router routes (navigation entry points)
  ├── features/                # Feature modules (each = folder with screens + components)
  │   ├── social/              # Follow, feed, playdates, notifications
  │   ├── care/                # Health tracking, feeding, meds, checklist
  │   ├── health/              # Appointments, vaccines, records, insurance
  │   ├── ai/                  # Mood scan, symptom scan, vet chat, etc.
  │   └── [feature-name]/
  ├── components/              # Shared UI components (used by 2+ features)
  ├── lib/                     # Utilities: DB, auth, dates, hooks, types
  ├── store/                   # Zustand stores (one file per store, e.g., petStore.ts)
  ├── constants/               # Theme colors, limits, config constants
  └── shared/
      ├── services/            # Notification service, etc.
      └── store/               # Shared store slices (e.g., care.slice.ts)
supabase/
  ├── functions/               # Edge functions (one folder per function)
  ├── migrations/              # SQL migration files (timestamp + name)
  └── schema_consolidated.sql  # Reference schema (read-only)
```

**Rule:** If you create a new file, it must go in one of these folders. Never create random new files at the root or in unexpected places.

---

## State Management (Zustand)

**Golden rule:** Zustand for global, React state for local.

### Global State (in `store/`)
- `authStore` — user session, email, subscription tier
- `petStore` — active pet, pet list, care logs (feeding, meds, mood, checklist), roles
- `notifStore` — unread count, cached notifications
- `preferenceStore` — quiet hours, notification preferences
- `subscriptionStore` — tier, usage limits, remaining quota

### Local State (React `useState`)
- Form inputs, modals, temporary UI state, expanded sections
- **Don't** store in Zustand if it's only used by one component.

### Shared Store Slices
- `shared/store/slices/care.slice.ts` — feeding logs, mood logs, checklist (part of `petStore`)
- Pattern: define slice separately, compose into `petStore` in `petStore.ts`

---

## Database (Supabase)

### Realtime Subscriptions
- Pattern: Use `loadRef` to hold the load function, call it in the cleanup of a realtime subscription.
- **Why:** Prevents `postgres_changes` from crashing if `load` closure captures stale state.
- See: `features/care/hooks/useTodayData.ts` for reference.

### Notifications Table
- `notification_logs` — in-app inbox. Schema: `user_id, type, title, body, data, read, created_at`
- Check constraint on `type` — all valid types listed in the latest migration.
- Dedup: `UNIQUE(user_id, dedup_key)` — upsert on this constraint to prevent duplicates across cron runs.

### Deletion
- Mark deleted notifications as `deleted_at` (soft delete) or use explicit `deleteNotifications()` calls.
- After delete, call `removeNotifs()` to sync local state AND store cache.

---

## Notifications (Push + In-App)

### Push Tokens
- Stored in `push_tokens` table with `UNIQUE(token)` constraint.
- On login, `savePushToken()` upserts the current device's token (reassigns if device switched users).
- On logout, `removePushToken()` deletes it.

### In-App Notifications (notification_logs)
- Written by edge functions or the app itself.
- `useNotificationsData` hook manages local state, DB sync, and store cache.
- **Mark-done pattern:** `removeNotifs()` deletes from local state, store cache, and DB immediately (prevents "come back on reload").

### Local Notifications (Expo Notifications)
- Fired when user navigates away during a scan (mood scan-ready alert).
- Use `scheduleImmediateNotification()` helper from `shared/services/notifications.service.ts`.

---

## AI Features (Gemini, DeepSeek, OpenAI)

### Model Chain Pattern
Most AI functions follow: `DeepSeek → Gemini 2.5 Flash → fallbacks`

See `ARCHITECTURE.md` for complete model chains per function.

### Tier-Gated Features
- **Free:** basic pet profiles, 2 mood scans/day
- **Pro:** health records, up to 10 mood scans/day, family invites
- **Ultimate:** symptom scan, vet chat, parse health records, receipts

Check tier with `useContextTier(petId)` and gate features with `usePaywall()`.

---

## Dark Mode & Theme

### Pattern
- Global theme from `useTheme()` — provides `colors` object and `isDark` boolean.
- Theme toggle stored in `preferenceStore`.
- **CSS variables:** Use `@media (prefers-color-scheme)` in any inline CSS.
- **React Native:** Use `colors.primary`, `colors.textPrimary`, etc. (not hardcoded hex).

### Colors (Reference)
See `AGENT_CONTEXT.md` for the full palette. Key naming:
- `primary`, `accent` — brand colors
- `textPrimary`, `textSecondary`, `textTertiary` — text hierarchy
- `card`, `surface`, `inputBg` — component backgrounds
- `border`, `separator` — dividers
- `danger`, `warning`, `success` — semantic colors

---

## Navigation (Expo Router)

### Route Structure
- Routes in `app/` follow the file-based routing (Expo Router v56).
- Deep links wired in `app/_layout.tsx` — when a notification/deep link arrives, resolve pet context and route correctly.

### Pattern for Scan Results
- Symptom scan result → "Ask PetDoc" button → `/ai/vet-chat` with `scan_ctx` URL param
- VetChatScreen reads `scan_ctx`, silently prepends it to the first user message, then clears it
- User never sees the hidden preamble; the AI is just primed with the scan context

---

## Performance & Memory

### FlashList Virtualization
- Used in notification lists, feed, etc.
- **Gotcha:** Stale state in FlashList cells if you're using external hooks that update frequently.
- **Fix:** Pass memoized props directly (e.g., `myPet={resolvedPet ?? pet}` in PostCard).

### Care Progress Calculation
- Shared formula in `lib/careProgress.ts` used by widget, Home, and Care-Today.
- Keeps meal slots (3), mood slot (1), and checklist items in sync across all surfaces.

### Pending Action Guards
- Use `useRef<Set>()` to prevent double-tap duplicates in notifications, care actions, etc.
- Pattern: add to Set on start, delete in finally block.

---

## Known Issues (Don't Ignore These)

See `AGENT_CONTEXT.md` for the current list of known bugs, pre-existing TypeScript errors, and features in progress.

Before starting work, check:
1. Is this on the "known issues" list?
2. Is there a workaround in place?
3. Should I fix it or work around it?

---

## Testing & Verification

### Before Pushing
1. **TypeScript:** `npx tsc --noEmit` (0 errors on source)
2. **Dev server:** Start with `npm start`, test the feature manually
3. **Git history:** `git log --oneline -5` (verify one clean commit)
4. **Screenshot/proof:** If UI change, capture and share

### Branches Stay Clean
- Merge to `main` only after review / approval (or auto-merge CI).
- Never commit to `main` directly; use a PR/branch.

---

## Talking to Supabase Functions

### Pattern
```typescript
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const res = await fetch(`${supabaseUrl}/functions/v1/[function-name]`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,  // from supabase.auth.getSession()
  },
  body: JSON.stringify({ /* payload */ }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error);
```

### Tier Checking (in edge functions)
```typescript
const proStatus = await requireUltimateForPet(svcClient, userId, petId);
if (proStatus.blocked) return json({ error: proStatus.message }, 402);
```

---

## When in Doubt

1. **Architecture question?** Check `AGENT_CONTEXT.md` → `ARCHITECTURE.md` → ask the user.
2. **Database schema question?** Read `supabase/schema_consolidated.sql`.
3. **Notification types?** Check the CHECK constraint in the latest migration.
4. **AI model chains?** See `ARCHITECTURE.md` edge functions table.
5. **Still unsure?** Ask the user. Don't make up the answer.

---

## Summary for Next Agent

Before you end your session:

1. ✅ Commit your work (one clean commit).
2. ✅ Update `AGENT_CONTEXT.md` with:
   - What you changed and why
   - Any new decisions or patterns discovered
   - Status of in-progress work
   - Any new bugs or gotchas found
3. ✅ Run `npx tsc --noEmit` one last time (should pass).
4. ✅ Push your branch.
5. ✅ Leave a comment in this chat summarizing what you did.

The next agent will read this file + `AGENT_CONTEXT.md` and hit the ground running.

---

**Last Updated:** 2026-08-02  
**Maintained by:** Claude Code (multi-agent protocol)
