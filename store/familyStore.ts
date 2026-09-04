/**
 * familyStore — wraps the v2 Supabase `members` table.
 * Cache: AsyncStorage (instant) + background DB sync on every load.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// Same fallback pattern already used in choreStore.ts/temporaryApproverStore.ts.
const genId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── Realtime subscription (V-A3) ─────────────────────────────────────────────
// Mirrors choreStore.ts's ensureRealtime pattern exactly: family-scoped
// channel name (no fixed/shared literal — avoids the channel-name-collision
// "cannot add callbacks after subscribe()" crash a prior session fixed
// elsewhere), a dev-hot-reload stale-channel sweep, and an UPDATE handler
// that merges the incoming row into local state in place.
let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

function ensureRealtime(
  familyId: string,
  setState: (s: Partial<FamilyState>) => void,
  getState: () => FamilyState,
) {
  if (_rtFamilyId === familyId && _rtChannel) return; // already subscribed for this family
  if (_rtChannel) {
    supabase.removeChannel(_rtChannel);
    _rtChannel = null;
  }
  // Same hot-reload defensive sweep as choreStore.ts's ensureRealtime — a
  // dev-mode reload resets this module's `let` state but the Supabase
  // client socket can still hold a channel under this exact topic name.
  const staleTopic = `realtime:members:${familyId}`;
  const stale = supabase.getChannels().filter(c => c.topic === staleTopic);
  if (stale.length > 0) {
    stale.forEach(c => supabase.removeChannel(c));
  }
  _rtFamilyId = familyId;

  try {
    _rtChannel = supabase
      .channel(`members:${familyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'members',
        filter: `family_id=eq.${familyId}`,
      }, ({ eventType, new: newRow, old: oldRow }) => {
        const state = getState();
        if (eventType === 'INSERT') {
          const member = fromRow(newRow);
          if (state.members.some(m => m.id === member.id)) return;
          setState({ members: dedupeMembers([...state.members, member]) });
        } else if (eventType === 'UPDATE') {
          setState({
            members: state.members.map(m =>
              m.id === String((newRow as any).id) ? fromRow(newRow) : m
            ),
          });
        } else if (eventType === 'DELETE') {
          setState({ members: state.members.filter(m => m.id !== String((oldRow as any).id)) });
        }
      })
      .subscribe((status) => {
        console.log(`[familyStore] realtime members:${familyId} subscribe status=${status}`);
        // Same fix as choreStore.ts's/eventStore.ts's ensureRealtime — the
        // guard above only checks "does _rtChannel exist," never "is it
        // actually connected," so a socket killed by iOS backgrounding left
        // _rtChannel non-null but dead forever, silently blocking every
        // later ensureRealtime() call from ever resubscribing. Clearing on
        // a terminal bad status makes the next call actually reconnect.
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[familyStore] realtime members:${familyId} unhealthy (${status}) — clearing so the next sync resubscribes`);
          if (_rtFamilyId === familyId) { _rtChannel = null; _rtFamilyId = ''; }
        }
      });
  } catch (e: any) {
    console.warn('[familyStore] ensureRealtime subscribe failed', e?.message ?? e);
  }
}

export type MemberRole = 'parent' | 'kid' | 'teen' | 'senior';

// Purely descriptive — how a member relates to the family, shown on their
// roster card / tree node. Grouped so a picker can show only the options
// that make sense for the role being edited (a 'kid' shouldn't see
// "Grandmother" as an option, etc). Never used for permissions — `role`
// alone drives RBAC everywhere else in the app. Kept to the straightforward
// 2-parent / up-to-4-grandparent household this app actually models —
// no blended-family variants unless real usage asks for them.
export const RELATIONSHIPS_BY_ROLE: Record<MemberRole, string[]> = {
  parent: ['Mother', 'Father'],
  kid:    ['Daughter', 'Son'],
  teen:   ['Daughter', 'Son'],
  senior: ['Grandmother', 'Grandfather'],
};

export interface FamilyMember {
  id: string;
  name: string;
  role: MemberRole;
  subRole?: string;     // e.g. 'Dad', 'Mom', 'Grandpa' — display label, not a gate
  relationship?: string; // e.g. 'Mother', 'Stepson' — purely descriptive, never a permission gate (role is)
  emoji?: string;       // stored as `avatar` in DB when it's an emoji
  avatarUrl?: string;   // stored as `avatar` when it's a URL
  coins: number;
  mainCoins: number;    // Main parent-wallet coins (used in Perks Store)
  gpCoins: number;      // Grandparent bonus sub-wallet coins
  xp: number;
  streak: number;
  level: number;
  questsCompleted: number;
  questsPending: number;
  pin?: string;
  pinEnabled?: boolean;
  familyId?: string;
  // Teen-specific profile fields
  hasCar?: boolean;           // Opts teen into ride/pickup dispatch pool
  rideEarningsPerRun?: number; // Parent-configured coins per pickup run
  groceryEarningsPerRun?: number; // Parent-configured coins per grocery run
  // Senior / GP availability prefs (persisted so they survive app restart)
  gpCheerleaderMode?: boolean;        // Hides all driving requests
  gpDriveWindowDays?: number[];       // 0=Sun … 6=Sat
  gpDriveWindowStart?: string;        // 'HH:MM' 24h
  gpDriveWindowEnd?: string;          // 'HH:MM' 24h
  gpWeeklyRideCap?: number;           // Max rides they'll take per calendar week
  linkedParentId?: string;            // Which parent this GP belongs to (e.g. Priya's mother -> Priya's id) — informational, both parents can still review either side's GP quests
  storeProximityRemindersEnabled?: boolean; // Opt-out for the geofenced "you're near X, items pending" reminder (store_proximity_reminders feature flag) — defaults true
  appleCalendarSyncEnabled?: boolean; // Opt-IN (defaults false) for lib/calendarSync2Way.ts — writes FamilyCube events into the device Calendar app and pulls its events back in
  // A kid/teen's self-chosen savings goal (a specific Reward id from the
  // Perks Store) — previously auto-derived as "whichever reward you're
  // closest to affording," which the kid never actually picked; this lets
  // them set their own, shown on both their own Piggy Bank sheet and the
  // parent-facing Perks page.
  goalRewardId?: string;
  // 'YYYY-MM-DD' — collected post-onboarding via CompleteProfileScreen, not
  // at join time (a brand-new member shouldn't have to hand over a birth
  // date before they've even seen the app). Optional/nullable indefinitely;
  // skipping it is a real, supported choice, not a temporary gap.
  dateOfBirth?: string;
  // Watermark for the Kid Hub's full-screen celebration (approved chore/
  // quest, cheer received, permission approved) — only an item newer than
  // this plays, so relaunching the app or re-entering this profile never
  // replays a celebration for something already seen. Bumped to now()
  // whenever a celebration actually plays — see KidNeedsYouSection.tsx.
  lastCelebrationSeenAt?: string;
  // Hub's quick-access pill row (Radar/School/Health/Ledger/...), in the
  // order this member wants them. Only the ids the member chose to
  // show/pin are listed — anything not in here still falls back to
  // AppsQuickAccessPills's default PILLS order, so an old member with no
  // saved order yet sees the same list as before.
  pillOrder?: string[];
  // Set once a member has independent auth (accepted a member_invitations
  // email invite, or joined via invite code on their own anonymous-auth
  // device) — undefined for a locally-added PIN-only profile riding on
  // another member's session. Purely informational client-side (e.g. a
  // "joined via invite" badge); never a permission gate.
  email?: string;
  // members.auth_user_id — set only for members who personally ran a real
  // Supabase Auth login/signup on some device (founding parent, or anyone
  // who joined independently via invite code/email). Undefined for a
  // PIN-only profile created by someone else's session (typically kids,
  // often seniors). This is THE gate Profile's danger zone uses to decide
  // "Delete account" (self-service, auth-linked) vs "Delete profile"
  // (parent-initiated, PIN-only) — see features/profile.
  authUserId?: string;
  // members.deleted_at — soft-delete marker (see migration
  // 20260908230000_member_soft_delete.sql). Set means this member is
  // scheduled for permanent purge 7 days from this timestamp unless
  // restored (PIN re-entry or, for auth-linked members, a fresh login).
  deletedAt?: string;
  // Per-category push/panel notification opt-outs (Profile page's
  // Notifications section) — keyed by the same NotifCategory buckets
  // family-notifier's own categoryFor() groups every real notification
  // type into. A missing key means enabled (matches every member's
  // existing behavior before this field existed); only `false` mutes a
  // category. See migration 20260924010000_member_notification_prefs.sql.
  notificationPrefs?: Partial<Record<'chores' | 'family' | 'chat' | 'rewards' | 'requests' | 'grocery', boolean>>;
  // Quiet hours + call-alert opt-out (migration
  // 20260924030000_member_quiet_hours_call_prefs.sql) — family-notifier
  // checks these before sending a push (still persists to the notifications
  // table either way, so the in-app bell always has it even when quiet
  // hours suppressed the push itself).
  quietHoursEnabled?: boolean;
  quietHoursStart?: string; // 'HH:MM' 24h, local to timezone below
  quietHoursEnd?: string;   // 'HH:MM' 24h
  // IANA zone (e.g. 'America/New_York') — set whenever quiet hours are
  // configured (features/profile's NotificationsSheet), so family-notifier
  // can convert its own UTC clock into this member's actual local time
  // instead of assuming quiet_hours_start/end are already in UTC (which
  // they never are — the picker shows the device's local clock).
  timezone?: string;
  callAlertsEnabled?: boolean;
  // members.invite_status — 'active' (normal member), 'pending' (parent
  // pre-created this row via the per-invitee invite flow in Profile, no
  // code claimed yet), or 'invited' (legacy email-invite-system state, pre-
  // dates the per-invitee flow). Undefined reads the same as 'active' —
  // every member created before this column existed has no explicit value.
  // See migration 20260924050000_per_invitee_invite_system.sql. Never a
  // permission gate on its own; purely status display + list filtering.
  inviteStatus?: 'active' | 'pending' | 'invited';
  // members.created_at — read-only, display only (e.g. Profile's "Member
  // since" row). Never written back via updateMember/toRow.
  createdAt?: string;
}

interface FamilyState {
  members: FamilyMember[];
  activeMemberId: string | null;
  // Set only when PIN-switching INTO a member who has their own real
  // Supabase login that differs from this device's actual auth session
  // (verify_member_pin_and_grant mints this on a successful PIN check) —
  // resolve_active_member_id() accepts this as proof-of-identity in place
  // of the auth session itself. Cleared on sign-out and on switching to
  // any member whose auth_user_id matches this device's real session (the
  // grant isn't needed there, and clearing it means a stale/expired token
  // is never accidentally sent for the common case). Not persisted to
  // AsyncStorage — a fresh app launch always re-derives auth from the real
  // Supabase session, so a stale grant surviving a relaunch would
  // only ever cause confusion, never add real convenience.
  activeMemberGrantToken: string | null;
  activeMemberGrantExpiresAt: string | null;
  // The member id this grant was minted for — lets setActiveMember tell
  // "switching TO the member the grant belongs to" apart from "switching
  // to anyone else," so the grant survives its own PinEntryModal→
  // setActiveMember call but is dropped on any subsequent switch away.
  activeMemberGrantMemberId: string | null;
  // Multi-family membership — see migration
  // 20260931200000_multi_family_membership_active_family_header.sql. Which
  // of the CURRENTLY ACTIVE member's own families is active right now, for
  // the rare case their auth_user_id has a real member row in more than
  // one (e.g. a grandparent or step-parent in two households). Reset by
  // setActiveMember on every switch — this is scoped to whichever person
  // is active, not to the device, precisely because two different people
  // sharing one device (e.g. two step-parents, each in their own second
  // family alongside the one they share) could otherwise have person A's
  // last-picked family silently leak into person B's requests after a
  // PIN-switch. Only meaningful (and only ever sent as a header) when the
  // active member genuinely has more than one family row — see
  // familiesForActiveMember below.
  activeFamilyId: string | null;
  loaded: boolean;
  // 'idle' before any load attempt; 'loading' while loadFromStorage's cache
  // read / bounded retry loop is still running; 'confirmed' once either a
  // non-empty cache hit landed, OR the bounded retry loop exhausted all
  // attempts (whether it found members or not). Only loadFromStorage's own
  // bounded loop may set 'confirmed' — syncFromDB's other direct call sites
  // (ChildChoreBoard.tsx, ParentReviewDeck.tsx) never touch this, since only
  // the bounded path is guaranteed to terminate. Consumers deciding "does
  // this account have a family" (e.g. (tabs)/_layout.tsx's redirect) must
  // gate on this being 'confirmed', never on `loaded` alone or on
  // members.length===0 while still 'loading' — treating a still-resolving
  // fetch as "confirmed empty" was the root cause of a real bug (a signed-in,
  // already-onboarded user with a real family being bounced to onboarding's
  // Create/Join Family screen because of a transient auth-propagation race).
  familyLoadStatus: 'idle' | 'loading' | 'confirmed';
  familyName: string;
  // Multi-family membership — every family THIS device's real auth.uid()
  // has a member row in, regardless of which is currently active. Members
  // itself is scoped to just the active family (syncFromDB's
  // eq('family_id', knownFamilyId) query), so this is a separate, lighter
  // fetch (see refreshMyFamilies) — populated at load time and whenever a
  // family switch happens, empty array for the overwhelming majority of
  // accounts today (exactly one entry). The family-switcher UI should
  // render nothing at all whenever this has fewer than 2 entries.
  myFamilies: { id: string; name: string }[];

  setMembers: (members: FamilyMember[]) => void;
  setActiveMember: (id: string) => void;
  // Called by PinEntryModal after a successful verify_member_pin_and_grant
  // for a member whose own auth_user_id doesn't match this device's real
  // session — pass null/null to clear (sign-out, or switching to a member
  // who doesn't need one).
  setActiveMemberGrant: (memberId: string | null, token: string | null, expiresAt: string | null) => void;
  // Multi-family membership — switches which family is currently active.
  // Only meaningful when myFamilies has more than one entry; the UI should
  // never offer this control otherwise. familyId must be one of
  // myFamilies' own ids — silently ignored if not (mirrors the server's
  // own validation in resolve_active_member_id(), belt-and-suspenders
  // rather than trusting the caller). Triggers a fresh syncFromDB for the
  // newly active family (members is scoped per-family) after switching.
  setActiveFamily: (familyId: string) => Promise<void>;
  // Populates myFamilies — every family this device's real auth.uid() has
  // a member row in. A separate, lightweight query (not derived from
  // `members`, which is scoped to just the active family) — see
  // myFamilies' own comment. Called once at load time and after any
  // family switch; safe to call anytime, e.g. to refresh after accepting
  // a new family invite.
  refreshMyFamilies: () => Promise<void>;
  setFamilyName: (name: string) => void;
  // Persists to families.name (setFamilyName only ever touched local state —
  // there was previously no path back to the DB at all, so a rename made
  // here would look like it worked and then silently revert on next sync).
  // Returns false on failure so the settings screen can show an error
  // instead of optimistically closing.
  renameFamily: (name: string) => Promise<boolean>;
  addMember: (member: Omit<FamilyMember, 'id'>) => Promise<void>;
  // Per-invitee invite flow (Profile's "Add family member" form) — creates
  // a minimal real member row (name/relationship/role/optional DOB+email,
  // invite_status = 'pending', no coins/PIN/auth yet) BEFORE any code is
  // generated, per explicit spec: the profile exists first, the code just
  // claims it later. Returns the created member (id needed immediately to
  // call generate-invite-code with targetMemberId) or null on failure.
  addPendingMember: (name: string, role: MemberRole, relationship?: string, dateOfBirth?: string, email?: string) => Promise<FamilyMember | null>;
  updateMember: (id: string, updates: Partial<FamilyMember>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  awardCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => Promise<void>;
  deductCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => Promise<void>;
  // Reverses an earlier award (e.g. a teen dropping a ride after being
  // paid for claiming it) — unlike deductCoins, always takes effect, up to
  // whatever balance is actually there, and never rolls back. See
  // clawbackCoins's own comment for why deductCoins is wrong for this.
  clawbackCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => Promise<void>;
  // actingMemberId: who is making this change — omitted/undefined means
  // "assume self" (matches every pre-existing call site, which never passed
  // one). When it differs from `id` (a parent resetting a DIFFERENT
  // member's PIN, e.g. a forgotten-PIN reset for a kid), the other parents
  // are notified — see setMemberPin's own comment for why.
  setMemberPin: (id: string, pin: string | null, actingMemberId?: string) => Promise<void>;
  loadFromStorage: () => Promise<void>;
  syncFromDB: () => Promise<void>;
  // Clears both the in-memory state AND the AsyncStorage cache. Must run
  // on sign-out: loadFromStorage()/syncFromDB() derive which family to
  // query from whatever's ALREADY cached (see syncFromDB's knownFamilyId),
  // so without this, signing out and back in as a different account kept
  // showing — and re-querying — the PREVIOUS account's family data, since
  // nothing ever cleared the stale cache in between (real cross-account
  // data leak, not just a stale-UI flash).
  reset: () => Promise<void>;
}

const STORAGE_KEY = '@familycube_members_v4';
const ACTIVE_KEY  = '@familycube_active_member';

// Every write path into `members` funnels through here — a duplicate id
// (e.g. a realtime INSERT racing a syncFromDB() overwrite from a different
// caller, since ChildChoreBoard.tsx and ParentReviewDeck.tsx both trigger
// their own syncFromDB() independently of familyStore's own load) crashes
// React with "two children with the same key" wherever members are
// rendered in a keyed list (ChatScreen's avatar cluster, etc). Last one
// wins on id collision.
function dedupeMembers(members: FamilyMember[]): FamilyMember[] {
  const byId = new Map<string, FamilyMember>();
  for (const m of members) byId.set(m.id, m);
  return [...byId.values()];
}

// DB row → FamilyMember
function fromRow(row: any): FamilyMember {
  const isUrl = typeof row.avatar === 'string' && row.avatar.startsWith('http');
  const coins = row.coins ?? 0;
  return {
    id:              String(row.id),
    name:            row.name,
    role:            row.role === 'child' ? 'kid' : row.role === 'grandparent' ? 'senior' : row.role === 'teenager' ? 'teen' : row.role as MemberRole,
    subRole:         row.sub_role ?? undefined,
    relationship:    row.relationship ?? undefined,
    // '' (empty string) is how the DB represents "never picked one" for
    // some rows, not just null/undefined — `?? undefined` alone leaves it
    // as '' in that case, which every consumer that does `m.emoji ?? X`
    // then silently renders as nothing instead of falling through to X.
    emoji:           isUrl ? undefined : (row.avatar || undefined),
    avatarUrl:       isUrl ? row.avatar : undefined,
    familyId:        row.family_id ?? undefined,
    coins,
    mainCoins:       row.main_coins ?? coins,
    gpCoins:         row.gp_coins ?? 0,
    xp:              row.xp ?? 0,
    streak:          row.streak ?? 0,
    level:           row.level ?? 1,
    questsCompleted: row.quests_completed ?? 0,
    questsPending:   row.quests_pending ?? 0,
    pin:             row.pin ?? undefined,
    pinEnabled:      Boolean(row.pin),
    hasCar:          row.has_car ?? false,
    rideEarningsPerRun:    row.ride_earnings_per_run ?? 50,
    groceryEarningsPerRun: row.grocery_earnings_per_run ?? 30,
    gpCheerleaderMode:  row.gp_cheerleader_mode  ?? false,
    gpDriveWindowDays:  row.gp_drive_window_days  ?? [2, 4],
    gpDriveWindowStart: row.gp_drive_window_start ?? '14:00',
    gpDriveWindowEnd:   row.gp_drive_window_end   ?? '17:30',
    gpWeeklyRideCap:    row.gp_weekly_ride_cap    ?? 2,
    linkedParentId:     row.linked_parent_id ?? undefined,
    goalRewardId:       row.goal_reward_id ?? undefined,
    email:              row.email ?? undefined,
    dateOfBirth:        row.date_of_birth ?? undefined,
    lastCelebrationSeenAt: row.last_celebration_seen_at ?? undefined,
    pillOrder:          row.pill_order ?? undefined,
    storeProximityRemindersEnabled: row.store_proximity_reminders_enabled ?? true,
    appleCalendarSyncEnabled: row.apple_calendar_sync_enabled ?? false,
    authUserId:         row.auth_user_id ?? undefined,
    deletedAt:          row.deleted_at ?? undefined,
    createdAt:          row.created_at ?? undefined,
    // notification_prefs was added to the type but never actually wired
    // into fromRow/toRow — every toggle write via updateMember() was
    // silently dropped before this fix (never reached the DB, so it also
    // never came back on the next load).
    notificationPrefs:  row.notification_prefs ?? undefined,
    quietHoursEnabled:  row.quiet_hours_enabled ?? false,
    quietHoursStart:    row.quiet_hours_start ?? undefined,
    quietHoursEnd:      row.quiet_hours_end ?? undefined,
    timezone:           row.timezone ?? undefined,
    callAlertsEnabled:  row.call_alerts_enabled ?? true,
    inviteStatus:       row.invite_status ?? undefined,
  };
}

// FamilyMember → DB upsert payload (v2 `members` schema)
function toRow(m: FamilyMember) {
  return {
    id:       m.id,
    name:     m.name,
    role:     m.role === 'kid' ? 'child' : m.role === 'teen' ? 'teenager' : m.role === 'senior' ? 'grandparent' : m.role,
    sub_role: m.subRole ?? null,
    relationship: m.relationship ?? null,
    avatar: m.avatarUrl ?? m.emoji ?? '👤',
    coins: m.coins,
    main_coins: m.mainCoins,
    gp_coins:   m.gpCoins,
    xp:    m.xp,
    streak: m.streak,
    level:  m.level,
    // quests_completed / quests_pending were never real DB columns (only
    // ever set to 0 at member creation, never read anywhere) — every
    // updateMember() call was failing outright because of this, unrelated
    // to whatever field the caller actually meant to change (role,
    // linked_parent_id, GP dispatch prefs, etc.) — the root cause behind a
    // whole string of "X isn't saving" reports this session.
    pin:   m.pin ?? null,
    last_celebration_seen_at: m.lastCelebrationSeenAt ?? null,
    has_car: m.hasCar ?? false,
    ride_earnings_per_run: m.rideEarningsPerRun ?? 50,
    grocery_earnings_per_run: m.groceryEarningsPerRun ?? 30,
    gp_cheerleader_mode:  m.gpCheerleaderMode  ?? false,
    gp_drive_window_days: m.gpDriveWindowDays  ?? [2, 4],
    gp_drive_window_start: m.gpDriveWindowStart ?? '14:00',
    gp_drive_window_end:   m.gpDriveWindowEnd   ?? '17:30',
    gp_weekly_ride_cap:    m.gpWeeklyRideCap    ?? 2,
    linked_parent_id:      m.linkedParentId ?? null,
    goal_reward_id:        m.goalRewardId ?? null,
    date_of_birth:         m.dateOfBirth ?? null,
    pill_order:            m.pillOrder ?? null,
    store_proximity_reminders_enabled: m.storeProximityRemindersEnabled ?? true,
    apple_calendar_sync_enabled: m.appleCalendarSyncEnabled ?? false,
    notification_prefs: m.notificationPrefs ?? {},
    quiet_hours_enabled: m.quietHoursEnabled ?? false,
    quiet_hours_start:   m.quietHoursStart ?? null,
    quiet_hours_end:     m.quietHoursEnd ?? null,
    timezone:            m.timezone ?? null,
    call_alerts_enabled: m.callAlertsEnabled ?? true,
    invite_status:       m.inviteStatus ?? 'active',
  };
}

// "Other parents" for a security-relevant change (PIN reset, role change) —
// every parent in the family besides whoever made the change. Mirrors
// eventStore.ts's own otherParentIds() (ride assignment ping-pong) — same
// name/shape kept consistent across stores rather than sharing one import,
// since eventStore's version already deliberately duplicates hubComponents.tsx's
// pattern rather than centralizing it.
function otherParentIds(members: FamilyMember[], excludeId: string | null | undefined): string[] {
  return members.filter(m => m.role === 'parent' && m.id !== excludeId).map(m => m.id);
}

// realAuthMemberId is this device's own logged-in member (auth_user_id ===
// the actual Supabase session), when that member has their own real login
// at all. It always wins over a cached PIN-switch on a fresh app load —
// PIN-switching into another real-login member (e.g. ugandhar switching to
// praveena) is a same-session convenience, not a re-login, and must not
// survive a relaunch as if it were one (live-reported: switched to
// praveena, reloaded, still praveena instead of snapping back to
// ugandhar's own real account). A member with NO auth_user_id at all (a
// kid with no login of their own) has no "real session" to snap back to,
// so the cached PIN-switch is exactly what should persist for them.
function applyActive(members: FamilyMember[], cached: string | null, current: string | null, realAuthMemberId?: string | null) {
  if (realAuthMemberId && members.some(m => m.id === realAuthMemberId)) return realAuthMemberId;
  if (current && members.some(m => m.id === current)) return current;
  if (cached  && members.some(m => m.id === cached))  return cached;
  // Prefer first parent over first member (DB order may vary)
  return (members.find(m => m.role === 'parent') ?? members[0])?.id ?? null;
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  members: [],
  activeMemberId: null,
  activeFamilyId: null,
  myFamilies: [],
  activeMemberGrantToken: null,
  activeMemberGrantExpiresAt: null,
  activeMemberGrantMemberId: null,
  loaded: false,
  familyLoadStatus: 'idle',
  familyName: 'Our Family',

  setFamilyName: (name) => set({ familyName: name }),

  renameFamily: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const familyId = get().members.find(m => m.familyId)?.familyId;
    if (!familyId) return false;
    const { error } = await supabase.from('families').update({ name: trimmed }).eq('id', familyId);
    if (error) { console.warn('[familyStore] renameFamily failed', error.message); return false; }
    set({ familyName: trimmed });
    // Any other parent's device picks this up via the existing members
    // realtime channel's warm-up path next time it calls syncFromDB(); this
    // is a plain UPDATE with no realtime subscription of its own on
    // families, so it isn't instantly pushed the way member/quest changes
    // are — acceptable since a family's display name changes rarely and
    // isn't time-sensitive the way live status fields are.
    return true;
  },

  // Multi-family membership — see myFamilies' own comment for the full
  // rationale, and setActiveMember's caller for the security gating
  // (grandparent role + real-login-only, never via a PIN-switch grant).
  // Re-checked here too, defensively, so any future caller can't
  // accidentally bypass the scope by calling this directly. Queries
  // `members` directly rather than `families` — members_select's own RLS
  // (auth_user_id = auth.uid() OR family_id = current_user_family_id())
  // already permits exactly this cross-family read with zero policy
  // changes, and a plain members query avoids needing a second table join
  // just to get each family's display name.
  refreshMyFamilies: async () => {
    // TOCTOU guard — this function awaits twice (auth.getUser(), then the
    // members query), and a rapid double-switch (avatar A tapped, then
    // avatar B tapped before A's checks finish) could otherwise let A's
    // in-flight result land and overwrite myFamilies AFTER B has already
    // become active — reopening exactly the cross-person leak
    // setActiveMember's own atomic reset exists to prevent. Captured
    // once at entry, re-checked after EVERY await before ever committing
    // a set() — if the active member changed underneath this call at any
    // point, it's now stale and must not write anything.
    const calledForMemberId = get().activeMemberId;
    const { data: { user } } = await supabase.auth.getUser();
    if (get().activeMemberId !== calledForMemberId) return; // stale — a different member is active now
    if (!user) { set({ myFamilies: [] }); return; }
    const activeMember = get().members.find(m => m.id === calledForMemberId);
    if (activeMember?.role !== 'senior') { set({ myFamilies: [] }); return; }
    const { data, error } = await supabase
      .from('members')
      .select('family_id, families(name)')
      .eq('auth_user_id', user.id);
    if (get().activeMemberId !== calledForMemberId) return; // stale — a different member is active now
    if (error || !data) { console.warn('[familyStore] refreshMyFamilies failed', error?.message); return; }
    const seen = new Set<string>();
    const families: { id: string; name: string }[] = [];
    for (const row of data as any[]) {
      const id = row.family_id ? String(row.family_id) : null;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      families.push({ id, name: row.families?.name ?? 'Family' });
    }
    set({ myFamilies: families });
  },

  // Multi-family membership — see myFamilies/activeFamilyId's own
  // comments. familyId must be one of THIS member's own families
  // (validated client-side here as a belt-and-suspenders check —
  // resolve_active_member_id() independently re-validates server-side on
  // every request regardless, so a bypass here could never actually
  // expose another family's data, only send a header that gets ignored).
  // Triggers a fresh syncFromDB, since `members` itself is scoped to
  // whichever family is active.
  setActiveFamily: async (familyId) => {
    if (!get().myFamilies.some(f => f.id === familyId)) {
      console.warn('[familyStore] setActiveFamily ignored — not one of this member\'s own families', familyId);
      return;
    }
    set({ activeFamilyId: familyId, members: [], activeMemberId: null, familyLoadStatus: 'loading' });
    await get().syncFromDB();
  },

  setActiveMemberGrant: (memberId, token, expiresAt) => set({
    activeMemberGrantToken: token, activeMemberGrantExpiresAt: expiresAt, activeMemberGrantMemberId: memberId,
  }),

  setMembers: (members) => {
    const deduped = dedupeMembers(members);
    set({ members: deduped });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  },

  setActiveMember: (id) => {
    const previousActiveId = get().activeMemberId;
    // A grant token is only ever valid for the exact member it was minted
    // for (verify_member_pin_and_grant stamps it onto that member's own
    // row) — clear it whenever switching to someone OTHER than the member
    // it was just minted for, so a stale token never gets sent for the
    // wrong member. PinEntryModal calls setActiveMemberGrant BEFORE this
    // function runs (see its onSuccess ordering), stamping
    // activeMemberGrantMemberId with the id the grant belongs to —
    // switching TO that same id here must not clobber the grant that was
    // just set for it. Every other switch simply has no grant to begin
    // with, which is correct — resolve_active_member_id's fast path
    // (auth.uid() match, or no auth_user_id at all) covers everyone else
    // with zero extra steps.
    set(state => {
      const keepGrant = state.activeMemberGrantToken && id === state.activeMemberGrantMemberId;
      return {
        activeMemberId: id,
        activeMemberGrantToken: keepGrant ? state.activeMemberGrantToken : null,
        activeMemberGrantExpiresAt: keepGrant ? state.activeMemberGrantExpiresAt : null,
        activeMemberGrantMemberId: keepGrant ? state.activeMemberGrantMemberId : null,
        // Multi-family membership — reset on EVERY switch, unconditionally,
        // before anything below decides whether to repopulate. Two
        // different people sharing one device (e.g. two step-parents, each
        // in their own separate second family alongside the one they
        // share) must never have person A's last-picked family or family
        // list linger into person B's session after a PIN-switch — a real
        // cross-family info leak, not just a stale-UI flash, since
        // myFamilies literally names OTHER households this member belongs
        // to. Re-derived just below, gated on real-login-only.
        activeFamilyId: null,
        myFamilies: [],
      };
    });
    AsyncStorage.setItem(ACTIVE_KEY, id);
    // Multi-family membership — scoped to grandparent (role: 'senior')
    // members only, per explicit product decision: a grandparent
    // genuinely belonging to two of their children's separate households
    // is a normal, unremarkable fact; the same mechanism applied to any
    // role (e.g. two step-parents each in their own second family) raised
    // real concerns this session about emotionally loaded UX and
    // misclick risk that a grandparent-only scope avoids — a GP's two
    // families are typically their kids' own separate homes, not a
    // blended/co-parenting situation with the sensitivity that implies.
    // Reveal OTHER families this member belongs to ONLY when BOTH: (1)
    // their role is 'senior', and (2) they were switched into via their
    // own real device auth session, never via a PIN-switch grant (even a
    // fully legitimate one). The auth-session gate closes a separate real
    // leak risk: without it, whoever is physically holding a shared
    // device could PIN-switch INTO a multi-family GP's profile and, merely
    // by that profile existing, see their other households.
    supabase.auth.getUser().then(({ data: { user } }) => {
      const member = get().members.find(m => m.id === id);
      if (user && member?.authUserId === user.id && member?.role === 'senior') {
        get().refreshMyFamilies();
      }
    }).catch(() => {});
    // Save push token to the newly active member row. saveTokenToMember
    // itself already deletes any OTHER member's member_device_tokens row
    // for this exact device — real dedup, zero tolerance for two members
    // both claiming the same physical device at once. The one remaining
    // gap: the OUTGOING member's members.expo_push_token fallback column
    // (only ever consulted for a member with zero member_device_tokens
    // rows — e.g. their very first switch on a fresh install, before this
    // function has run for them even once) could still hold this device's
    // token until THEY happen to switch again. Clearing it explicitly here
    // closes that window immediately rather than leaving it to chance.
    import('@/lib/notifications').then(({ saveTokenToMember, clearTokenFromMember }) => {
      saveTokenToMember(id).catch(() => {});
      if (previousActiveId && previousActiveId !== id) {
        clearTokenFromMember(previousActiveId).catch(() => {});
      }
    });
    // members.timezone was previously only ever written as a side effect
    // of that specific member personally visiting Profile Settings' Quiet
    // Hours picker — most members never had, leaving it null far more
    // often than not (live-reported: calendar-sync-push's outbound
    // Google/Outlook time conversion had nothing real to fall back on for
    // most members). A shared family device's physical timezone is the
    // correct zone for WHOEVER is currently active on it, regardless of
    // whose login it is — stamping it here, on every switch, means the
    // currently-active member's timezone is always populated without
    // waiting for them to touch an unrelated settings screen first.
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTz) supabase.from('members').update({ timezone: deviceTz }).eq('id', id).then(() => {});
    // ── Restore-on-return: a soft-deleted (Roster "delete profile" or
    // Profile "delete account") member whose PIN gets used again within 7
    // days is fully restored — mirrors app/_layout.tsx's symmetric restore
    // for auth-linked accounts on session resume. Fire-and-forget: never
    // block the (already-instant, local) profile switch on a network round
    // trip — the switch has already happened above by the time this lands.
    const switched = get().members.find(m => m.id === id);
    if (switched?.deletedAt) {
      const deletedMs = new Date(switched.deletedAt).getTime();
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - deletedMs < SEVEN_DAYS_MS) {
        supabase.from('members').update({ deleted_at: null, deletion_notified_at: null }).eq('id', id)
          .then(({ error }) => {
            if (error) { console.warn('[familyStore] restore-on-return failed', error.message); return; }
            set(s => ({ members: s.members.map(m => m.id === id ? { ...m, deletedAt: undefined } : m) }));
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().members));
          });
      }
      // Past 7 days: the member-purge-sweep cron will have already removed
      // this row server-side (or is about to) — nothing to restore, and no
      // special-case needed here since the row simply won't come back on
      // the next syncFromDB().
    }
  },

  addMember: async (member) => {
    // Insert into DB and get back the generated ID. Was previously omitting
    // family_id/auth_user_id entirely — members_insert's RLS policy
    // (auth_user_id = auth.uid() OR family_id = current_user_family_id())
    // then fails outright for any caller whose auth identity isn't already
    // literally on the inserted row, which this bare insert could never
    // satisfy — every call silently no-op'd via the error branch below.
    const active = get().members.find(m => m.id === get().activeMemberId);
    const { data: { user } } = await supabase.auth.getUser();
    const row = { ...toRow({ ...member, id: '' }), id: undefined };
    const { data, error } = await supabase
      .from('members')
      .insert([{
        name: row.name, role: row.role, avatar: row.avatar,
        coins: row.coins, xp: row.xp, streak: row.streak, level: row.level,
        family_id: active?.familyId ?? null,
        auth_user_id: user?.id ?? null,
      }])
      .select()
      .single();
    if (error || !data) { console.warn('[familyStore] addMember:', error?.message); return; }
    const added = fromRow(data);
    const next = dedupeMembers([...get().members, added]);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  addPendingMember: async (name, role, relationship, dateOfBirth, email) => {
    const active = get().members.find(m => m.id === get().activeMemberId);
    if (!active?.familyId) { console.warn('[familyStore] addPendingMember: no active familyId'); return null; }
    const dbRole = role === 'kid' ? 'child' : role === 'teen' ? 'teenager' : role === 'senior' ? 'grandparent' : role;
    // No auth_user_id yet — this row isn't claimed by anyone until the code
    // is redeemed. RLS's members_insert policy also accepts
    // family_id = current_user_family_id() (not just auth_user_id = uid()),
    // which is what lets a parent insert a row for someone else here.
    // id has no DB-side default on this table (confirmed live: "null value
    // in column id... violates not-null constraint") — every other insert
    // into members either relies on a default that doesn't actually exist
    // or generates its own id client-side; this one didn't, so it always
    // failed. Same genId() fallback already used in choreStore.ts/
    // temporaryApproverStore.ts.
    const { data, error } = await supabase
      .from('members')
      .insert([{
        id: genId(),
        name: name.trim(),
        role: dbRole,
        relationship: relationship ?? null,
        date_of_birth: dateOfBirth ?? null,
        email: email?.trim() ? email.trim().toLowerCase() : null,
        avatar: role === 'kid' ? '🧒' : role === 'teen' ? '🧑' : role === 'senior' ? '🧓' : '👤',
        coins: 0, xp: 0, level: 1, max_xp: 100, streak: 0,
        family_id: active.familyId,
        invite_status: 'pending',
      }])
      .select()
      .single();
    if (error || !data) {
      console.warn('[familyStore] addPendingMember failed', error?.message);
      return null;
    }
    const added = fromRow(data);
    const next = dedupeMembers([...get().members, added]);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return added;
  },

  updateMember: async (id, updates) => {
    const before = get().members.find(m => m.id === id);
    if (!before) return;
    const updated = { ...before, ...updates };
    // DB-is-truth: await the write before reflecting it locally — was
    // optimistic (set immediately, "surfaced" the error via a console
    // warning but never actually rolled local state back on failure).
    const { error } = await supabase.from('members').update(toRow(updated)).eq('id', id);
    if (error) {
      console.warn('[familyStore] updateMember failed', error.message);
      throw error;
    }
    const next = get().members.map(m => m.id === id ? updated : m);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    // Role change (kid→teen, promoted to parent, etc) is permission/
    // security-relevant, unlike the cosmetic fields (name/avatar/DOB/quiet
    // hours/notification prefs) this same action also carries — every other
    // caller of updateMember only ever changes those, so gating narrowly on
    // "did `role` actually change" keeps this from firing on the vast
    // majority of unrelated saves (own-profile edits, notification-pref
    // toggles, etc). Excludes the acting member — activeMemberId is who is
    // physically driving this device right now, which for the shared-device
    // "parent edits a different member's role" flow (RosterTab/
    // ProfileSettingsScreen's EditMemberModal) is genuinely the actor, not
    // the member being edited. Non-blocking: never delays/blocks the write
    // above.
    if (updates.role && updates.role !== before.role) {
      const actor = get().activeMemberId ?? id;
      const familyId = updated?.familyId ?? before.familyId ?? get().members[0]?.familyId;
      const recipients = otherParentIds(next, actor);
      if (familyId && recipients.length) {
        const byName = next.find(m => m.id === actor)?.name;
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'member_role_changed',
            familyId,
            memberIds: recipients,
            excludeMemberId: actor,
            persist: true,
            payload: { memberId: id, memberName: updated?.name, byName, oldRole: before.role, newRole: updates.role },
          },
        }).catch((e: any) => console.warn('[familyStore] updateMember role-change notify failed', e?.message));
      }
    }
  },

  removeMember: async (id) => {
    const prev = get().members;
    const prevActiveId = get().activeMemberId;
    const prevActiveFamilyId = get().activeFamilyId;
    const prevMyFamilies = get().myFamilies;

    // Spec 9.1 — eligibility recompute before removal. chore_tasks.
    // assigned_to_id has ON DELETE SET NULL (Postgres won't block the
    // delete), so without this a removed member's in-flight chores would
    // silently end up assigned_to_id=null while still sitting at status
    // 'todo'/'in_progress' — invisible to the pool (isPool wasn't set) and
    // liable to break any `members.find(m => m.id === assignedToId)` UI
    // that assumed a non-null assignedToId always resolves to someone real.
    // calendar_events.member_id/memberIds and parent_quest_assignments.
    // assigned_to/assigned_by have NO FK at all, so those would dangle
    // forever with zero DB-level signal. Release everything to pool/
    // unassigned FIRST so the member row has nothing live still pointing at
    // it by the time the delete below runs.
    try {
      const { useChoreStore } = require('./choreStore');
      const choreState = useChoreStore.getState();
      const orphanedChores = choreState.chores.filter((c: any) =>
        c.assignedToId === id && !['approved', 'auto_approved', 'completed', 'declined', 'expired', 'cancelled'].includes(c.status)
      );
      for (const c of orphanedChores) {
        choreState.updateChore(c.id, { assignedToId: undefined, isPool: true, status: 'todo' });
      }
      const orphanedAssignments = choreState.parentAssignments.filter((a: any) =>
        (a.assignedTo === id || a.assignedBy === id) &&
        ['PENDING', 'ACCEPTED', 'SNOOZED', 'PARKED'].includes(a.status)
      );
      // Not routed through recallParentQuest — that action requires the
      // recaller to BE the original delegator (assignedBy), which doesn't
      // hold when the removed member is the assignedTo side. This is a
      // distinct case (member removal, not a user-initiated recall): just
      // close the assignment out directly, same DECLINED-terminal shape
      // recallParentQuest itself writes. The underlying chore was already
      // released to pool above.
      for (const a of orphanedAssignments) {
        useChoreStore.setState((s: any) => ({
          parentAssignments: s.parentAssignments.map((x: any) =>
            x.id === a.id ? { ...x, status: 'DECLINED', isLocked: false, updatedAt: new Date().toISOString() } : x
          ),
        }));
        supabase.from('parent_quest_assignments')
          .update({ status: 'DECLINED', is_locked: false, updated_at: new Date().toISOString() })
          .eq('id', a.id)
          .then(({ error }: any) => { if (error) console.warn('[familyStore] removeMember assignment cleanup', error.message); });
      }
    } catch (e) {
      console.warn('[familyStore] removeMember chore cleanup failed', e);
    }
    try {
      const { useEventStore } = require('./eventStore');
      const eventState = useEventStore.getState();
      const orphanedEvents = eventState.events.filter((e: any) =>
        (e.memberId === id || e.memberIds?.includes(id)) && !e.approvalPending
      );
      for (const ev of orphanedEvents) {
        const nextIds = (ev.memberIds ?? []).filter((mid: string) => mid !== id);
        eventState.updateEvent(ev.id, {
          memberId: ev.memberId === id ? undefined : ev.memberId,
          memberIds: nextIds.length ? nextIds : undefined,
        });
      }
    } catch (e) {
      console.warn('[familyStore] removeMember event cleanup failed', e);
    }

    // Soft-delete, not hard-delete — same pattern as Profile's own danger
    // zone (features/profile), so a member removed from Roster and one
    // removed from their own account settings behave identically: 7 days
    // to be restored (PIN re-entry for a non-auth member, a fresh login
    // for an auth-linked one — see setActiveMember/app/_layout.tsx), then
    // member-purge-sweep permanently deletes the row. This also sidesteps
    // the audit-trail-FK failures the old hard-delete could hit (comment
    // this replaced) since the row isn't actually removed yet.
    const removedMember = prev.find(m => m.id === id);
    const deletedAtIso = new Date().toISOString();
    const next = prev.map(m => m.id === id ? { ...m, deletedAt: deletedAtIso } : m);
    const activeIdChanging = prevActiveId === id;
    const nextActiveId = activeIdChanging ? (next.find(m => !m.deletedAt)?.id ?? next[0]?.id ?? null) : prevActiveId;
    set({
      members: next,
      activeMemberId: nextActiveId,
      // Multi-family membership — this reassigns activeMemberId directly
      // (a soft-delete forcing a switch away from the removed member),
      // bypassing setActiveMember's own atomic myFamilies/activeFamilyId
      // reset entirely. Without this, removing the active member (a
      // multi-family grandparent whose OTHER households were already
      // populated into myFamilies) would leave that family list lingering
      // and attributed to whoever becomes newly active — the exact
      // cross-person leak setActiveMember's own reset exists to prevent.
      // Only reset when the active member is actually changing; removing
      // some OTHER member (the common case) leaves the current person's
      // own multi-family state untouched.
      ...(activeIdChanging ? { activeFamilyId: null, myFamilies: [] } : {}),
    });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    const { error } = await supabase.from('members')
      .update({ deleted_at: deletedAtIso })
      .eq('id', id);
    if (error) {
      console.warn('[familyStore] removeMember (soft-delete) failed:', error.message);
      // Restore myFamilies/activeFamilyId too, not just members/
      // activeMemberId — the optimistic reset above (when the removed
      // member WAS the active one) must fully unwind on failure, or a
      // multi-family grandparent's own family list stays incorrectly
      // empty after a removal that never actually happened.
      set({ members: prev, activeMemberId: prevActiveId, activeFamilyId: prevActiveFamilyId, myFamilies: prevMyFamilies });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
      throw error;
    }

    // Notify the rest of the family this member will be permanently
    // deleted in 7 days unless restored. Sent to every remaining member
    // (not just parents) — a removed kid's siblings/grandparent may also
    // want to know/react, and this is a low-frequency, high-significance
    // event where over-notifying the family is the safer default versus a
    // kid's account quietly vanishing with only parents ever told.
    if (removedMember) {
      const familyId = removedMember.familyId ?? get().members[0]?.familyId;
      const remainingMemberIds = next.filter(m => m.id !== id && !m.deletedAt).map(m => m.id);
      if (familyId && remainingMemberIds.length) {
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'custom',
            familyId,
            memberIds: remainingMemberIds,
            payload: {
              title: 'Profile removed',
              body: `${removedMember.name}'s profile will be permanently deleted in 7 days unless restored.`,
              data: { screen: 'Roster', memberId: id },
            },
          },
        }).catch((e: any) => console.warn('[familyStore] removeMember notify failed', e?.message));
      }
    }
  },

  awardCoins: async (memberId, amount, wallet) => {
    const before = get().members.find(m => m.id === memberId);
    const nextValue = Math.max(0, (before?.[wallet] ?? 0) + amount);
    // DB-is-truth: await the column write before reflecting the new
    // balance locally — was optimistic (set immediately, no rollback on
    // failure). Column-only patch, not a full-row toRow() push — a full
    // row would overwrite coins/xp with whatever stale value this device
    // last cached, clobbering the RPC-driven awards other devices made in
    // the meantime.
    const column = wallet === 'mainCoins' ? 'main_coins' : 'gp_coins';
    const { error } = await supabase.from('members').update({ [column]: nextValue }).eq('id', memberId);
    if (error) {
      console.warn('[familyStore] awardCoins', error.message);
      return;
    }
    const next = get().members.map(m => m.id === memberId ? { ...m, [wallet]: nextValue } : m);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Spec 4.8/8.1: every coin movement — including a manual parent
    // spot-bonus or a GP cheer — belongs in the one shared, unified ledger
    // so the other parent isn't surprised by an unexplained balance change.
    // Previously awardCoins only ever touched the members.main_coins/
    // gp_coins column with no point_transactions row at all — quest-approval
    // payouts (choreStore.awardPoints) write one, but every call through
    // this function (spot bonuses, GP SendBonusCard/CheerSquad) did not,
    // so those transactions were invisible outside the granting device's
    // own ephemeral session state. Log it the same shape choreStore uses.
    if (amount > 0) {
      supabase.from('point_transactions').insert({
        id: 'tx' + Date.now() + Math.random().toString(36).slice(2, 8),
        user_id: memberId,
        amount,
        transaction_type: 'ADMIN_ADJUSTMENT',
        notes: wallet === 'gpCoins' ? 'Grandparent bonus' : 'Bonus coins',
        created_at: new Date().toISOString(),
      }).then(({ error: e2 }) => { if (e2) console.warn('[familyStore] awardCoins ledger insert', e2.message); });
    }
  },

  deductCoins: async (memberId, amount, wallet) => {
    // Store-screen redemption race: two devices (or two rapid taps) reading
    // the same stale local balance could both pass their own client-side
    // "can afford it" check and both call deductCoins before either write
    // round-trips — a conditional write, guarded on the exact prior value
    // this deduction was computed from, ensures only the deduction that
    // still finds a sufficient balance in Postgres actually lands.
    // DB-is-truth: await the CAS write and only reflect the deduction
    // locally once it's confirmed — was optimistic (set immediately, rolled
    // back on a lost race).
    const before = get().members.find(m => m.id === memberId);
    const priorValue = before?.[wallet] ?? 0;
    const nextValue = Math.max(0, priorValue - amount);
    const column = wallet === 'mainCoins' ? 'main_coins' : 'gp_coins';
    const { data, error } = await supabase.from('members')
      .update({ [column]: nextValue })
      .eq('id', memberId)
      .gte(column, amount) // only succeeds if the DB's current balance can still cover this deduction
      .select('id');
    if (error) {
      console.warn('[familyStore] deductCoins', error.message);
      return;
    }
    if (!data || data.length === 0) {
      console.warn('[familyStore] deductCoins lost the race on', memberId, wallet);
      return;
    }
    const next = get().members.map(m => m.id === memberId ? { ...m, [wallet]: nextValue } : m);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  // deductCoins' .gte(column, amount) guard exists to stop a genuine RACE
  // (two simultaneous spends double-counting one balance) — but a clawback
  // (reversing a payout already spent elsewhere, e.g. a teen dropping a
  // ride after spending its coins in the Store) is not a race: the balance
  // legitimately can't cover the full amount, and deductCoins' race guard
  // treated that identically to "lost the race," silently rolling back to
  // ZERO deduction and letting the teen keep the full payout for a ride
  // they backed out of (QA sweep, teen-role audit, Critical). This clamps
  // to 0 instead of refusing — takes whatever's left, never rolls back.
  clawbackCoins: async (memberId, amount, wallet) => {
    const before = get().members.find(m => m.id === memberId);
    const priorValue = before?.[wallet] ?? 0;
    const nextValue = Math.max(0, priorValue - amount);
    // DB-is-truth: await the write before reflecting the clawback locally.
    const column = wallet === 'mainCoins' ? 'main_coins' : 'gp_coins';
    const { error } = await supabase.from('members').update({ [column]: nextValue }).eq('id', memberId);
    if (error) {
      console.warn('[familyStore] clawbackCoins', error.message);
      return;
    }
    const next = get().members.map(m => m.id === memberId ? { ...m, [wallet]: nextValue } : m);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  setMemberPin: async (id, pin, actingMemberId) => {
    const before = get().members.find(m => m.id === id);
    const hadPin = !!before?.pin;
    const next = get().members.map(m =>
      m.id === id ? { ...m, pin: pin ?? undefined, pinEnabled: pin !== null } : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Was an unchecked await — a failed write (RLS, network) still left the
    // optimistic local state saying the PIN was changed while the DB kept
    // the old one, so the member couldn't log in with the PIN they were
    // just told was set, with zero indication anywhere of why. Roll back
    // local state and surface the error to the caller (both RosterTab.tsx
    // and ProfileSettingsScreen.tsx's PIN sheets now route through here and
    // rely on this throwing to show a real error instead of a false
    // "PIN saved").
    const { error } = await supabase.from('members').update({ pin: pin ?? null }).eq('id', id);
    if (error) {
      console.warn('[familyStore] setMemberPin failed', error.message);
      set({ members: get().members.map(m => m.id === id ? { ...m, pin: before?.pin, pinEnabled: !!before?.pin } : m) });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().members));
      throw error;
    }

    // Security-relevant event — notify the other parent(s) whenever this
    // PIN change was made BY someone other than the member it's being made
    // FOR (a parent resetting a kid's forgotten PIN, or one parent
    // resetting another parent's PIN). A member changing their OWN PIN
    // needs no notification — that's expected self-service, not a
    // co-parent-should-know moment. Non-blocking: never let a failed notify
    // undo or delay the PIN write above, which has already landed.
    const actor = actingMemberId ?? id;
    if (actor !== id) {
      const target = before;
      const familyId = target?.familyId ?? get().members[0]?.familyId;
      const recipients = otherParentIds(next, actor);
      if (familyId && recipients.length) {
        const byName = next.find(m => m.id === actor)?.name;
        const action = pin === null ? 'removed' : hadPin ? 'changed' : 'added';
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'member_pin_changed',
            familyId,
            memberIds: recipients,
            excludeMemberId: actor,
            persist: true,
            payload: { memberId: id, memberName: target?.name, byName, action },
          },
        }).catch((e: any) => console.warn('[familyStore] setMemberPin notify failed', e?.message));
      }
    }
  },

  loadFromStorage: async () => {
    set({ familyLoadStatus: 'loading' });
    try {
      const [raw, activeId, { data: { user } }] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
        supabase.auth.getUser(),
      ]);
      const cached = raw ? (JSON.parse(raw) as FamilyMember[]) : null;
      const realAuthMemberId = user ? cached?.find(m => m.authUserId === user.id)?.id ?? null : null;
      if (cached && cached.length > 0) {
        const resolvedActiveId = applyActive(cached, activeId, null, realAuthMemberId);
        // Security: this resolves activeMemberId directly (not through
        // setActiveMember), which would otherwise skip its keepGrant guard
        // entirely — a PIN-verified grant token lives in memory only and is
        // never re-checked here, so if this resolves to someone OTHER than
        // whoever the current in-memory grant was minted for, a stale
        // grant (valid up to 30 days from a much earlier PIN entry) would
        // silently keep riding along on every request as that person,
        // with no fresh PIN check. Live-reported: a co-parent's request
        // got attributed to the OTHER parent this way with no PIN
        // re-entry. Clearing here mirrors setActiveMember's own guard.
        const keepGrant = get().activeMemberGrantToken && resolvedActiveId === get().activeMemberGrantMemberId;
        set({
          members: cached,
          activeMemberId: resolvedActiveId,
          activeMemberGrantToken: keepGrant ? get().activeMemberGrantToken : null,
          activeMemberGrantExpiresAt: keepGrant ? get().activeMemberGrantExpiresAt : null,
          activeMemberGrantMemberId: keepGrant ? get().activeMemberGrantMemberId : null,
          loaded: true,
          familyLoadStatus: 'confirmed',
        });
        // Multi-family membership — same grandparent-only + real-login-only
        // gate as setActiveMember's own (see its comment): only populate
        // the OTHER-families list when the member this load resolved to is
        // genuinely this device's own real auth session (never a cached
        // PIN-switch grant riding along from a previous launch) AND holds
        // the 'senior' role.
        if (realAuthMemberId && resolvedActiveId === realAuthMemberId) {
          const resolvedMember = cached.find(m => m.id === resolvedActiveId);
          if (resolvedMember?.role === 'senior') get().refreshMyFamilies();
        }
        // Refresh in background
        get().syncFromDB();
        return;
      }
    } catch {}
    // No cache — try the real family from the DB. Never fall back to fake
    // demo data: a sync failure (offline, RLS ambiguity, auth not ready
    // yet) used to seed AsyncStorage with a hardcoded "Alex (Dad)"/"Sam"/
    // etc. demo family, which then got read back on every future launch
    // BEFORE syncFromDB() even ran again — permanently masking the real
    // family with fake data until the cache was manually cleared. Leaving
    // members empty on a failed sync is the honest state; the UI should
    // show a loading/retry state instead of silently substituting fake
    // people.
    //
    // Short retry with backoff for the "no cache AND the fetch came back
    // empty" case — bridges a brief auth-propagation window right after a
    // fresh sign-in where a real, already-onboarded family can transiently
    // read back as empty. Without this, loaded:true + members:[] after one
    // attempt looked identical to "genuinely no family," which sent an
    // already-onboarded user through onboarding's Create/Join Family
    // screen (reported live).
    // 5 attempts / up to ~6s total (500ms, 1000ms, 1500ms, 2000ms between
    // tries) — widened from 3 attempts/~1.5s after a live-reported race:
    // signing back in immediately after signing out (fresh JWT/RLS
    // propagation, cold Supabase connection) could still read back empty
    // past the old, tighter budget, which reached 'confirmed' anyway and
    // sent an already-onboarded user with a real family into onboarding.
    for (let attempt = 0; attempt < 5; attempt++) {
      await get().syncFromDB();
      if (get().members.length > 0) break;
      if (attempt < 4) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    // Reached unconditionally once the bounded loop above ends — this is
    // what guarantees familyLoadStatus always resolves to 'confirmed' in
    // bounded time (≤3 attempts, ≤~1.5s backoff) regardless of what the
    // query returned, so consumers gating on 'confirmed' can never be
    // blocked indefinitely (unlike a since-reverted fix attempt that added
    // an unbounded "can't verify, don't touch state" bail-out and caused a
    // genuine infinite loop).
    set({ loaded: true, familyLoadStatus: 'confirmed' });
  },

  syncFromDB: async () => {
    try {
      // Scope by the family we already know about (from cache or a prior
      // sync) so this doesn't fetch every family in the database — RLS
      // already prevents another family's rows from actually coming back,
      // but an unscoped fetch here still meant every syncFromDB() call
      // (there are 3 independent call sites: ChildChoreBoard.tsx,
      // ParentReviewDeck.tsx, and familyStore's own loadFromStorage) pulled
      // the caller's own family over and over with no query-level bound.
      const knownFamilyId = get().members.find(m => m.familyId)?.familyId;
      // Multi-family membership — generation guard. Re-read after the
      // query resolves (see below) and bail if it changed: setActiveFamily
      // calls syncFromDB for a NEWLY active family, and a foreground/
      // realtime-triggered syncFromDB for the family being switched AWAY
      // FROM could otherwise land its (now-stale) response after the
      // switch — genuinely the wrong family's roster overwriting the
      // correct one, not just a redundant refetch. Before this feature,
      // every syncFromDB call was implicitly for the same one family a
      // session ever had, so a stale response was harmless; that's no
      // longer true once a family switch can happen mid-flight.
      const knownFamilyIdAtStart = knownFamilyId;
      // Cache-empty case (e.g. right after familyStore.reset() on sign-out)
      // falls through to an unscoped select('*') — this is still fully
      // protected by Postgres RLS (which scopes by auth.uid() server-side
      // regardless of any client-side filter), so it's safe on its own;
      // the actual bug (see below) was a caller treating an empty RESULT
      // as certain truth, not the query being unscoped.
      const [activeId, { data, error }] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_KEY),
        // Secondary .order('id') breaks ties — two parents created in the
        // same request/batch (plausible during family onboarding) share an
        // identical created_at with no ordering guarantee from Postgres on
        // ties alone. ChatScreen.tsx's viewerGpSide derivation (parents[0]/
        // parents[1] → maternal/paternal side) needs the SAME ordering the
        // server-side RLS function (is_chat_channel_participant, ordered by
        // id asc) uses, or a tie could make the client show/hide the wrong
        // seniors_a/seniors_b tab compared to what the server actually
        // enforces (live-DB QA verification finding, this session).
        knownFamilyId
          ? supabase.from('members').select('*').eq('family_id', knownFamilyId).order('created_at').order('id')
          : supabase.from('members').select('*').order('created_at').order('id'),
      ]);
      if (error || !data) return;
      // Bail if the family this query was scoped to is no longer the one
      // in flight — see knownFamilyIdAtStart's own comment. get().members
      // reflects whatever the MOST RECENT settled call (or a switch)
      // already committed; if that's now a different family than the one
      // THIS call queried for, this response is stale and must not
      // overwrite it. Only checked when the query was actually scoped
      // (knownFamilyIdAtStart set) — the unscoped select('*') case has no
      // "wrong family" to detect against.
      if (knownFamilyIdAtStart) {
        const currentKnownFamilyId = get().members.find(m => m.familyId)?.familyId;
        if (currentKnownFamilyId && currentKnownFamilyId !== knownFamilyIdAtStart) return;
      }
      const members = dedupeMembers(data.map(fromRow));
      // Logged QA gap, fixed: a member's school schedule/homework (local-
      // only AsyncStorage data — schoolStore has no server table at all)
      // was never cleaned up on removal, the same dangling-reference class
      // of bug already fixed elsewhere this session for chores/events/
      // locations. removeMember()'s own soft-delete can't purge this yet —
      // the 7-day restore window means their row (and by extension their
      // school data) needs to survive until the member-purge-sweep cron
      // actually removes them server-side. This is the correct hook point:
      // any previously-known member id that's now genuinely gone from the
      // server's response (not soft-deleted, actually purged) gets their
      // local school data cleared here, on the next sync after that happens.
      // Guarded on members.length > 0 — an empty/short result from a
      // transient sync race (the exact "no cache AND the fetch came back
      // empty" scenario documented above) must never be trusted enough to
      // wipe local data; only a genuine, populated member list is used to
      // detect who's actually gone.
      if (members.length > 0) {
        const prevIds = new Set(get().members.map(m => m.id));
        const stillPresentIds = new Set(members.map(m => m.id));
        const trulyGoneIds = [...prevIds].filter(id => !stillPresentIds.has(id));
        if (trulyGoneIds.length) {
          import('@/store/schoolStore').then(({ useSchoolStore }) => {
            for (const id of trulyGoneIds) useSchoolStore.getState().removeSchedule(id);
          }).catch(() => {});
        }
      }
      {
        const resolvedActiveId = applyActive(members, activeId, get().activeMemberId);
        // Same grant-clearing guard as loadFromStorage's own call above —
        // syncFromDB runs on every members-realtime update and app
        // foreground, not just boot, so this direct set() needed the same
        // fix to stop a stale in-memory PIN grant from silently riding
        // along for a member other than the one it was minted for.
        const keepGrant = get().activeMemberGrantToken && resolvedActiveId === get().activeMemberGrantMemberId;
        set({
          members,
          activeMemberId: resolvedActiveId,
          activeMemberGrantToken: keepGrant ? get().activeMemberGrantToken : null,
          activeMemberGrantExpiresAt: keepGrant ? get().activeMemberGrantExpiresAt : null,
          activeMemberGrantMemberId: keepGrant ? get().activeMemberGrantMemberId : null,
        });
      }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(members));

      // Warm up custom category + suggestion caches in background
      const familyId = members[0]?.familyId;
      if (familyId) {
        import('@/lib/familyCustomCategories').then(({ warmupCustomCache }) => {
          warmupCustomCache(familyId).catch(() => {});
        });
        ensureRealtime(familyId, set, get);

        // familyName was previously stuck at its 'Our Family' store default
        // forever — nothing ever fetched families.name (the actual name set
        // during onboarding) or wrote it back into this store. Fetched here
        // so every screen reading useFamilyStore().familyName (TodayView,
        // AppHeader, ProfilePickerScreen, the widget sync) shows the real
        // name instead of the fallback for the rest of the app's lifetime.
        supabase.from('families').select('name').eq('id', familyId).maybeSingle()
          .then(({ data: family, error: familyErr }) => {
            if (familyErr) { console.warn('[familyStore] family name fetch failed', familyErr.message); return; }
            if (family?.name) set({ familyName: family.name });
          });
      }
    } catch (e) {
      console.warn('[familyStore] syncFromDB:', e);
    }
  },

  reset: async () => {
    if (_rtChannel) {
      supabase.removeChannel(_rtChannel);
      _rtChannel = null;
      _rtFamilyId = '';
    }
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEY),
      AsyncStorage.removeItem(ACTIVE_KEY),
    ]);
    set({ members: [], activeMemberId: null, loaded: false, familyLoadStatus: 'idle', familyName: '', activeFamilyId: null, myFamilies: [] });
  },
}));
