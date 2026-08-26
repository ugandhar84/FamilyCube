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
  loaded: boolean;
  familyName: string;

  setMembers: (members: FamilyMember[]) => void;
  setActiveMember: (id: string) => void;
  setFamilyName: (name: string) => void;
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
  awardCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => void;
  deductCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => void;
  // Reverses an earlier award (e.g. a teen dropping a ride after being
  // paid for claiming it) — unlike deductCoins, always takes effect, up to
  // whatever balance is actually there, and never rolls back. See
  // clawbackCoins's own comment for why deductCoins is wrong for this.
  clawbackCoins: (memberId: string, amount: number, wallet: 'mainCoins' | 'gpCoins') => void;
  setMemberPin: (id: string, pin: string | null) => Promise<void>;
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
    notification_prefs: m.notificationPrefs ?? {},
    quiet_hours_enabled: m.quietHoursEnabled ?? false,
    quiet_hours_start:   m.quietHoursStart ?? null,
    quiet_hours_end:     m.quietHoursEnd ?? null,
    timezone:            m.timezone ?? null,
    call_alerts_enabled: m.callAlertsEnabled ?? true,
    invite_status:       m.inviteStatus ?? 'active',
  };
}

function applyActive(members: FamilyMember[], cached: string | null, current: string | null) {
  if (current && members.some(m => m.id === current)) return current;
  if (cached  && members.some(m => m.id === cached))  return cached;
  // Prefer first parent over first member (DB order may vary)
  return (members.find(m => m.role === 'parent') ?? members[0])?.id ?? null;
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  members: [],
  activeMemberId: null,
  loaded: false,
  familyName: 'Our Family',

  setFamilyName: (name) => set({ familyName: name }),

  setMembers: (members) => {
    const deduped = dedupeMembers(members);
    set({ members: deduped });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  },

  setActiveMember: (id) => {
    set({ activeMemberId: id });
    AsyncStorage.setItem(ACTIVE_KEY, id);
    // Save push token to the newly active member row
    import('@/lib/notifications').then(({ saveTokenToMember }) => {
      saveTokenToMember(id).catch(() => {});
    });
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
    const next = get().members.map(m => m.id === id ? { ...m, ...updates } : m);
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const updated = next.find(m => m.id === id);
    if (updated) {
      // This was a silent await with no error check — every caller of
      // updateMember (GP dispatch prefs, linked_parent_id, role edits,
      // etc.) could fail the DB write with zero indication anywhere, which
      // is exactly the shape of bug found repeatedly this session
      // (RosterTab's saveMember, choreStore's award payouts). Surface it.
      const { error } = await supabase.from('members').update(toRow(updated)).eq('id', id);
      if (error) console.warn('[familyStore] updateMember failed', error.message);
    }
  },

  removeMember: async (id) => {
    const prev = get().members;
    const prevActiveId = get().activeMemberId;

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
    set({ members: next, activeMemberId: prevActiveId === id ? (next.find(m => !m.deletedAt)?.id ?? next[0]?.id ?? null) : prevActiveId });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    const { error } = await supabase.from('members')
      .update({ deleted_at: deletedAtIso })
      .eq('id', id);
    if (error) {
      console.warn('[familyStore] removeMember (soft-delete) failed:', error.message);
      set({ members: prev, activeMemberId: prevActiveId });
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

  awardCoins: (memberId, amount, wallet) => {
    const next = get().members.map(m =>
      m.id === memberId ? { ...m, [wallet]: Math.max(0, (m[wallet] ?? 0) + amount) } : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const updated = next.find(m => m.id === memberId);
    // Column-only patch, not a full-row toRow() push — a full row would
    // overwrite coins/xp with whatever stale value this device last cached,
    // clobbering the RPC-driven awards other devices made in the meantime.
    if (updated) {
      supabase.from('members')
        .update({ [wallet === 'mainCoins' ? 'main_coins' : 'gp_coins']: updated[wallet] })
        .eq('id', memberId)
        .then(({ error }) => { if (error) console.warn('[familyStore] awardCoins', error.message); });
    }
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
      }).then(({ error }) => { if (error) console.warn('[familyStore] awardCoins ledger insert', error.message); });
    }
  },

  deductCoins: (memberId, amount, wallet) => {
    // Store-screen redemption race: two devices (or two rapid taps) reading
    // the same stale local balance could both pass their own client-side
    // "can afford it" check and both call deductCoins before either write
    // round-trips — the previous plain `.update()` had no WHERE guard tying
    // it to the balance it was actually computed against, so the second
    // write would just silently re-subtract from whatever the first write
    // already left, letting a kid redeem more than their real balance ever
    // covered. Same class of gap as claimBounty's pool-claim race: a
    // conditional write, guarded on the exact prior value this deduction
    // was computed from, so only the deduction that still finds a
    // sufficient balance in Postgres actually lands; the loser's optimistic
    // local deduction is rolled back instead of silently overwriting.
    const before = get().members.find(m => m.id === memberId);
    const priorValue = before?.[wallet] ?? 0;
    const next = get().members.map(m =>
      m.id === memberId ? { ...m, [wallet]: Math.max(0, (m[wallet] ?? 0) - amount) } : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const updated = next.find(m => m.id === memberId);
    if (!updated) return;
    const column = wallet === 'mainCoins' ? 'main_coins' : 'gp_coins';
    supabase.from('members')
      .update({ [column]: updated[wallet] })
      .eq('id', memberId)
      .gte(column, amount) // only succeeds if the DB's current balance can still cover this deduction
      .select('id')
      .then(({ data, error }) => {
        if (error) { console.warn('[familyStore] deductCoins', error.message); return; }
        if (!data || data.length === 0) {
          console.warn('[familyStore] deductCoins lost the race on', memberId, wallet, '— rolling back local deduction');
          set(s => ({
            members: s.members.map(m =>
              m.id === memberId ? { ...m, [wallet]: priorValue } : m
            ),
          }));
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().members));
        }
      });
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
  clawbackCoins: (memberId, amount, wallet) => {
    const before = get().members.find(m => m.id === memberId);
    const priorValue = before?.[wallet] ?? 0;
    const nextValue = Math.max(0, priorValue - amount);
    const next = get().members.map(m =>
      m.id === memberId ? { ...m, [wallet]: nextValue } : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const column = wallet === 'mainCoins' ? 'main_coins' : 'gp_coins';
    supabase.from('members').update({ [column]: nextValue }).eq('id', memberId)
      .then(({ error }) => { if (error) console.warn('[familyStore] clawbackCoins', error.message); });
  },

  setMemberPin: async (id, pin) => {
    const next = get().members.map(m =>
      m.id === id ? { ...m, pin: pin ?? undefined, pinEnabled: pin !== null } : m
    );
    set({ members: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    await supabase.from('members').update({ pin: pin ?? null }).eq('id', id);
  },

  loadFromStorage: async () => {
    try {
      const [raw, activeId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
      ]);
      const cached = raw ? (JSON.parse(raw) as FamilyMember[]) : null;
      if (cached && cached.length > 0) {
        set({
          members: cached,
          activeMemberId: applyActive(cached, activeId, null),
          loaded: true,
        });
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
    for (let attempt = 0; attempt < 3; attempt++) {
      await get().syncFromDB();
      if (get().members.length > 0) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    set({ loaded: true });
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
      const members = dedupeMembers(data.map(fromRow));
      set({
        members,
        activeMemberId: applyActive(members, activeId, get().activeMemberId),
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(members));

      // Warm up custom category + suggestion caches in background
      const familyId = members[0]?.familyId;
      if (familyId) {
        import('@/lib/familyCustomCategories').then(({ warmupCustomCache }) => {
          warmupCustomCache(familyId).catch(() => {});
        });
        ensureRealtime(familyId, set, get);
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
    set({ members: [], activeMemberId: null, loaded: false, familyName: '' });
  },
}));
