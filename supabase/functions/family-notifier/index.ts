// FamilyCube — Edge Function: family-notifier
// Delivers push notifications via Expo Push API and persists them to the
// notifications table. Supports per-type routing so callers don't need to
// know the notification shape — just pass the type + payload.
//
// Deploy: supabase functions deploy family-notifier
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// DB required:
//   notifications(id uuid default gen_random_uuid(), family_id text,
//     member_id text, type text, title text, body text, data jsonb,
//     read bool default false, created_at timestamptz default now())

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ─── Per-device token resolution (member_device_tokens) ───────────────────────
// members.expo_push_token is a single column per member row — on a shared
// device (PIN-switched by several family members through the day) it can
// only ever hold the most-recently-active member's token, so every other
// member's stored token goes stale. member_device_tokens keys tokens on
// (member_id, device_id) instead, so a member gets one row per real device
// they've been active on (all of which should receive the push — correct
// multi-device behavior). Falls back to members.expo_push_token only for a
// member with zero rows in the new table yet (pre-migration device that
// hasn't re-registered under the new scheme).
async function resolveTokensForMembersDetailed(
  supabase: ReturnType<typeof createClient>,
  memberIds: string[],
): Promise<{ tokens: string[]; tokensByMember: Map<string, Set<string>> }> {
  if (!memberIds.length) return { tokens: [], tokensByMember: new Map() };

  const { data: deviceRows } = await supabase
    .from('member_device_tokens')
    .select('member_id, expo_push_token')
    .in('member_id', memberIds);

  const tokensByMember = new Map<string, Set<string>>();
  for (const row of (deviceRows ?? []) as any[]) {
    if (!row.expo_push_token) continue;
    const set = tokensByMember.get(row.member_id) ?? new Set<string>();
    set.add(row.expo_push_token);
    tokensByMember.set(row.member_id, set);
  }

  const membersWithNoDeviceRows = memberIds.filter(id => !tokensByMember.has(id));
  if (membersWithNoDeviceRows.length) {
    const { data: fallbackMembers } = await supabase
      .from('members')
      .select('id, expo_push_token')
      .in('id', membersWithNoDeviceRows)
      .not('expo_push_token', 'is', null);
    for (const m of (fallbackMembers ?? []) as any[]) {
      if (!m.expo_push_token) continue;
      const set = tokensByMember.get(m.id) ?? new Set<string>();
      set.add(m.expo_push_token);
      tokensByMember.set(m.id, set);
    }
  }

  const all = new Set<string>();
  for (const set of tokensByMember.values()) for (const t of set) all.add(t);
  return { tokens: [...all], tokensByMember };
}

async function resolveTokensForMembers(
  supabase: ReturnType<typeof createClient>,
  memberIds: string[],
): Promise<string[]> {
  return (await resolveTokensForMembersDetailed(supabase, memberIds)).tokens;
}

// ─── Notification type definitions ────────────────────────────────────────────
// Each type maps to a canonical title + body template.
// Caller passes `payload` which fills the template variables.

type NotifType =
  | 'quest_approved'
  | 'quest_declined'
  | 'quest_claimed'
  | 'quest_submitted'
  | 'bonus_activated'
  | 'bonus_expiring'
  | 'bonus_expired_penalty'
  | 'deadline_reminder'
  | 'deadline_overdue'
  | 'penalty_applied'
  | 'force_assigned'
  | 'geofence_exit'
  | 'geofence_arrive'
  | 'low_battery'
  | 'chat_mention'
  // Plain (non-@mention) chat messages previously sent ZERO push
  // notifications at all — chatStore.ts's sendMessage only ever fired
  // mention-notify, and only when the text actually contained an @handle.
  // Live-reported: "why chat notifications are not coming." Broadcasts to
  // the other channel/DM participants (excluding the sender), same
  // channel-membership resolution mention-notify already does server-side.
  | 'chat_message'
  | 'coins_awarded'
  | 'chore_ghosted'
  // Master-flow spec's "Gone quiet — still on?" check-in — fires once,
  // shortly before a claimed chore's due time, distinct from chore_ghosted
  // (which fires hours later, after real silence). Auto-releases the chore
  // back to the pool if there's still no answer — see chore-noshow-release.
  | 'chore_still_on'
  | 'chore_auto_released'
  | 'help_requested'
  | 'help_resolved'
  // store/helpStore.ts audit (2026-08-29) — selfAssign/offerToMembers/
  // acceptOffer/declineOffer previously updated status with zero
  // notification; a requester had no way to know their help request had
  // been picked up, offered to someone else, or turned down short of
  // manually reopening the Help screen.
  | 'help_offered'
  | 'help_accepted'
  | 'help_declined'
  | 'reward_redeemed'
  | 'reward_decision'
  // store/rewardStore.ts's deleteReward — reward/store audit pass. A parent
  // deleted a reward out from under a kid's still-pending redemption; coins
  // are refunded, this just tells them why it's gone.
  | 'reward_removed'
  | 'kid_request'
  | 'kid_request_decision'
  // store/kidRequestStore.ts's assignRequest/completeRequest/approveItems/
  // rejectItems — kid-request audit pass. assignRequest's kid-facing leg
  // reuses kid_request_decision above (assigning a helper IS the approval);
  // these three cover the gaps that had none: the helper being told they
  // were volunteered by someone else, the kid being told the (already-
  // approved) request was actually finished, and the kid being told which
  // specific grocery/supplies items were approved/rejected rather than the
  // whole request at once.
  | 'kid_request_helper_assigned'
  | 'kid_request_completed'
  | 'kid_request_items_decision'
  | 'schedule_conflict'
  // Master-flow spec, two of the still-missing nudge timings, added by
  // chore-deadline-notifier: a pooled/open chore unclaimed with under 30
  // minutes to its due time gets one urgent broadcast to the whole
  // eligible pool plus a parent alert; a parent-approval-pending chore
  // (kid-proposed, GP redo-dispute, etc.) unanswered near its own cutoff
  // gets one nudge, escalating to the co-parent if still unanswered past
  // the cutoff.
  | 'pool_unclaimed_urgent'
  | 'approval_cutoff_nudge'
  | 'approval_cutoff_escalated'
  // Ride equivalents of the two above — chore_tasks had this urgency
  // machinery, calendar_events/rides had none at all (master-flow-v2 QA
  // audit, gap #4/#26/#27) until ride-deadline-notifier added it.
  | 'ride_pool_unclaimed_urgent'
  | 'ride_still_on'
  // Chore handoff (offer/accept/decline a chore to a specific person, master
  // flow's "hand it to someone" path) — previously fired zero notifications
  // at all; see store/choreStore.ts's offerChoreHandoff/acceptChoreHandoff/
  // declineChoreHandoff.
  | 'chore_handoff_offered'
  | 'chore_handoff_accepted'
  | 'chore_handoff_declined'
  // Ride/driver assignment ping-pong (store/eventStore.ts's updateEvent) —
  // parent-to-parent offer/accept/decline on a driver or helper assignment,
  // plus a final one-time confirmation to the requesting kid.
  | 'ride_assignment_offered'
  | 'ride_assignment_accepted'
  | 'ride_assignment_declined'
  | 'ride_confirmed_for_kid'
  // A parent flips isOpenToGrandparents/isOpenToTeens false→true on an
  // event (store/eventStore.ts's updateEvent) — previously only wrote a
  // silent activity_log row (logUpdateActivity's gp_welcome_changed/
  // teen_welcome_changed); nobody eligible was ever told the ride pool just
  // gained a new claimable slot. Broadcast to every senior (GP) or
  // hasCar:true teen in the family, same eligibility gates their own pool
  // views already use (SeniorView's isOpenToGrandparents filter,
  // TeenView's hasCar-gated pool).
  | 'ride_pool_opened'
  // Full choreStore/eventStore notification-coverage audit (2026-08-28/29)
  // — a batch of previously-silent state changes across store/choreStore.ts
  // and store/eventStore.ts, added together. See each call site's own
  // comment in those files for the specific gap being closed.
  | 'chore_deleted'
  | 'bounty_claim_approved'
  | 'bounty_claim_declined'
  | 'chore_redo_disputed'
  | 'chore_redo_dispute_resolved'
  | 'chore_later_date_proposed'
  | 'chore_later_date_approved'
  | 'chore_later_date_declined'
  | 'chore_terms_change_rejected'
  | 'grandparent_quest_routed'
  | 'grandparent_quest_declined_by_parent'
  | 'approval_reversed'
  | 'approval_reversal_cosigned'
  | 'cashout_requested'
  | 'cashout_settled'
  | 'cashout_approved'
  | 'cashout_denied'
  | 'parent_quest_delegated'
  | 'parent_quest_lock_cancelled'
  | 'grandparent_quest_needs_review'
  | 'event_assigned'
  | 'event_deleted'
  | 'event_rsvp_response'
  // Profile/account/security audit (2026-08-29) — store/familyStore.ts's
  // PIN-change and role-change paths previously notified no one; a co-parent
  // could have another member's PIN reset, or a member's role changed
  // (kid→teen, promoted to parent, etc), with zero visibility into it
  // happening. Excludes the acting member; never blocks the underlying
  // write if the notify call itself fails (non-blocking .catch()).
  | 'member_pin_changed'
  | 'member_role_changed'
  // store/temporaryApproverStore.ts — granting approval authority to a
  // non-parent is a real (if bounded/auto-expiring) privilege escalation;
  // previously only a chat DM to the grantee, invisible if their app is
  // backgrounded, and co-parents had no visibility into the grant at all.
  | 'temp_approver_granted'
  | 'temp_approver_revoked'
  // store/tripStore.ts's "Pick-up Radar" — dispatch/overdue previously only
  // posted to family chat (useChatStore.sendMessage), invisible to anyone
  // with the app backgrounded or closed. Real push+persist alongside the
  // existing chat broadcast, not a replacement for it.
  | 'trip_started'
  | 'trip_overdue'
  // features/vault/tabs/MemoriesTab.tsx's postMemory/heartMemory — a new
  // photo posted, or someone hearting an existing one, previously notified
  // no one; a family member could post/react and nobody else would ever
  // know unless they happened to open the Memories tab themselves.
  | 'memory_posted'
  | 'memory_liked'
  // family_meals.start_time (MealsTab's Add/Edit Meal, optional time field)
  // — a planned meal previously had no reminder at all; meal-reminders
  // fires this to parents 1hr before, same T-1h pattern as schedule-alerts.
  | 'meal_reminder'
  // grocery-reminders — was routed through 'custom' (routing/dedup by
  // payload.data.type only), which meant this function's own dedup check
  // (querying notifications.type directly) could never find its own prior
  // fire, since every 'custom' call persists with type='custom' regardless
  // of payload.data.type — confirmed live: a 1hr-before run reminder fired
  // 4 times across 2 sweeps for the same run before this was given its own
  // real NotifType.
  | 'grocery_daily_digest'
  | 'grocery_run_reminder'
  // join-family/accept-member-invite — a new member joining previously
  // routed through 'custom' with NO memberIds at all, so despite both
  // functions' own comments claiming to "notify existing parents," this
  // reached literally no one (custom isn't in NOTIFY_PARENTS/SPECIFIC, so
  // resolvedMemberIds stayed empty). Broadcasts to the WHOLE family
  // (parents and kids alike — direct report: "if new pers[on] enter[s] by
  // parent it should notify the kids so they will aware"), excluding the
  // joiner themselves.
  | 'member_joined'
  // store/rewardStore.ts's updateReward/toggleAvailability — a parent
  // changing a perk's price, availability, or eligibility previously
  // notified no one; kids/teens who could redeem it had no way to know it
  // changed short of happening to reopen the Store tab. Direct report: "if
  // parent changes any perk that also should trigger that notify for
  // kids/teens."
  | 'perk_updated'
  // HealthTab.tsx's addMed — a parent can add a medication for a DIFFERENT
  // member (kid, senior) than themselves; that member previously had no way
  // to know a new medication was added to their own record. Also
  // med-reminders' missed-dose escalation to parents.
  | 'medication_added'
  | 'medication_missed'
  // lib/storeGeofencing.ts's geofence-enter handler — was a LOCAL-only
  // notification to whoever's device entered a pinned store's radius,
  // invisible to the rest of the family. Direct report: "when the parent in
  // the near proximity of the grocery stores then they should get notify"
  // (the OTHER parent, not just the one who's there).
  | 'store_proximity_arrived'
  | 'custom';

// Category a member's notification_prefs toggles by — coarser than
// NotifType's 20+ individual values, since that's the granularity a person
// actually thinks in terms of ("chores", not "bonus_expired_penalty").
// 'mentions' split out from 'chat' (live-requested: "user can choose notify
// when mentioned" as its OWN toggle, independent from general chat message
// pushes) — someone can now get all chat activity but skip mention pings,
// or the reverse.
type NotifCategory = 'chores' | 'family' | 'chat' | 'mentions' | 'rewards' | 'requests' | 'grocery';

const CATEGORY_BY_TYPE: Partial<Record<NotifType, NotifCategory>> = {
  quest_approved: 'chores', quest_declined: 'chores', quest_claimed: 'chores',
  quest_submitted: 'chores', bonus_activated: 'chores', bonus_expiring: 'chores',
  bonus_expired_penalty: 'chores', deadline_reminder: 'chores', deadline_overdue: 'chores',
  penalty_applied: 'chores', force_assigned: 'chores', chore_ghosted: 'chores',
  chore_still_on: 'chores', chore_auto_released: 'chores',
  geofence_exit: 'family', geofence_arrive: 'family', low_battery: 'family',
  chat_mention: 'mentions', chat_message: 'chat',
  coins_awarded: 'rewards', reward_redeemed: 'rewards', reward_decision: 'rewards', reward_removed: 'rewards',
  help_requested: 'requests', help_resolved: 'requests',
  help_offered: 'requests', help_accepted: 'requests', help_declined: 'requests',
  kid_request: 'requests', kid_request_decision: 'requests',
  kid_request_helper_assigned: 'requests', kid_request_completed: 'requests', kid_request_items_decision: 'requests',
  schedule_conflict: 'family',
  pool_unclaimed_urgent: 'chores', approval_cutoff_nudge: 'chores', approval_cutoff_escalated: 'chores',
  chore_handoff_offered: 'chores', chore_handoff_accepted: 'chores', chore_handoff_declined: 'chores',
  ride_assignment_offered: 'family', ride_assignment_accepted: 'family', ride_assignment_declined: 'family',
  ride_confirmed_for_kid: 'family', ride_pool_opened: 'family',
  chore_deleted: 'chores', bounty_claim_approved: 'chores', bounty_claim_declined: 'chores',
  chore_redo_disputed: 'chores', chore_redo_dispute_resolved: 'chores',
  chore_later_date_proposed: 'chores', chore_later_date_approved: 'chores', chore_later_date_declined: 'chores',
  chore_terms_change_rejected: 'chores',
  grandparent_quest_routed: 'chores', grandparent_quest_declined_by_parent: 'chores',
  grandparent_quest_needs_review: 'chores',
  approval_reversed: 'chores', approval_reversal_cosigned: 'chores',
  cashout_requested: 'rewards', cashout_settled: 'rewards', cashout_approved: 'rewards', cashout_denied: 'rewards',
  parent_quest_delegated: 'chores', parent_quest_lock_cancelled: 'chores',
  event_assigned: 'family', event_deleted: 'family', event_rsvp_response: 'family',
  member_pin_changed: 'family', member_role_changed: 'family',
  temp_approver_granted: 'family', temp_approver_revoked: 'family',
  trip_started: 'family', trip_overdue: 'family',
  memory_posted: 'family', memory_liked: 'family',
  meal_reminder: 'family',
  grocery_daily_digest: 'grocery', grocery_run_reminder: 'grocery',
  member_joined: 'family',
  perk_updated: 'rewards',
  medication_added: 'family', medication_missed: 'family',
  store_proximity_arrived: 'grocery',
  // 'custom' has no fixed category — only two callers exist today
  // (groceryStore.ts's shopping-trip-started push, familyStore.ts's
  // profile-removed safety notice), discriminated below by payload shape
  // rather than lumped into one bucket, since they mean very different
  // things to a user picking what to mute.
};

// 'custom' payloads carry no NotifType-level signal, only whatever the
// caller put in payload.data — resolve by the same markers those two
// callers already set. Falls back to 'family' (never silently suppressed)
// for any future custom caller that doesn't match a known shape, since an
// unrecognized account-safety-adjacent notice is the wrong thing to risk
// dropping.
function categoryFor(type: NotifType, payload: Record<string, unknown>): NotifCategory {
  const known = CATEGORY_BY_TYPE[type];
  if (known) return known;
  const data = (payload?.data ?? {}) as Record<string, unknown>;
  if (data.type === 'shopping_trip_started' || data.type === 'store_proximity') return 'grocery';
  if (data.screen === 'Roster') return 'family';
  return 'family';
}

// True if right now, converted into the member's own IANA timezone (set
// alongside quiet_hours_start/end whenever the Profile page's time picker
// is used — the picker itself shows the device's local clock, so the HH:MM
// values are only meaningful paired with that zone, never as bare UTC).
// Falls back to UTC only if a member enabled quiet hours before this field
// existed and hasn't touched the picker since — same graceful-degrade
// PawBond's own inQuietHours() in supabase/functions/_shared/prefs.ts uses
// when no timezone is on file, not a design choice specific to this file.
// Handles the overnight-wraparound case (e.g. 21:00–07:00).
function inQuietWindow(start: string, end: string, timezone: string | null): boolean {
  const now = new Date();
  let nowMins: number;
  if (timezone) {
    try {
      const parts = Intl.DateTimeFormat('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
      }).formatToParts(now);
      const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
      const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
      nowMins = h * 60 + m;
    } catch {
      nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    }
  } else {
    nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (startMins >= endMins) return nowMins >= startMins || nowMins < endMins;
  return nowMins >= startMins && nowMins < endMins;
}

interface NotifShape {
  title: string;
  body: string;
  sound?: 'default' | null;
  badge?: number;
  data?: Record<string, unknown>;
}

// A kid_request's `detail` field is sometimes an internal-only encoded
// string (KidModals.tsx's encodeGroceryRequest/encodeRideLate — a
// "PREFIX:{...json...}" convention used to smuggle structured data through
// one plain-text column), never meant to reach a human directly. Passing it
// straight through as the push/notification body showed the raw prefix +
// JSON verbatim (live-reported: "i see the grocery list is raw json").
// Mirrors the decode logic in features/hub/KidModals.tsx (can't import a
// .tsx file from this Deno function, so it's duplicated narrowly here).
function decodeRequestDetail(detail: string | undefined): string {
  if (!detail) return '';
  if (detail.startsWith('GROCERY_REQUEST:')) {
    try {
      const p = JSON.parse(detail.slice('GROCERY_REQUEST:'.length));
      return `Grocery request: ${p.name}${p.qty ? ` (${p.qty})` : ''}`;
    } catch { /* fall through to raw detail below */ }
  }
  if (detail.startsWith('SUPPLIES_REQUEST:')) {
    try {
      const p = JSON.parse(detail.slice('SUPPLIES_REQUEST:'.length));
      const names = Array.isArray(p.items) ? p.items.map((i: any) => i.name ?? i).join(', ') : '';
      return `Supplies request: ${names}`;
    } catch { /* fall through */ }
  }
  if (detail.startsWith('RIDE_LATE:')) {
    try {
      const p = JSON.parse(detail.slice('RIDE_LATE:'.length));
      return `${p.driver ?? 'Your ride'} hasn't arrived for "${p.title ?? 'pickup'}"`;
    } catch { /* fall through */ }
  }
  return detail;
}

// eventTime arrives as the raw DB column value ("HH:MM", 24-hour) — every
// notification copy that interpolates it read "at 20:00" instead of the
// app's own 12-hour convention used everywhere else (lib/units.ts's
// formatTime, every date/time picker in the app). Live-reported.
function to12Hour(time: string | undefined | null): string | undefined {
  if (!time) return undefined;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  const h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

function buildMessage(type: NotifType, payload: Record<string, unknown>): NotifShape {
  const p = payload;
  switch (type) {
    case 'quest_approved':
      return {
        title: '✅ Chore Approved!',
        body: `"${p.questTitle}" was approved${p.coins ? ` — +${p.coins}🪙 added to your wallet!` : ''}`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'quest_declined':
      return {
        title: '❌ Chore Needs Redo',
        body: `"${p.questTitle}" was declined${p.reason ? `: ${p.reason}` : ' — check the feedback and try again.'}`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'quest_claimed':
      return {
        title: '🙋 Chore Claimed',
        body: `${p.kidName} just claimed "${p.questTitle}"`,
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'quest_submitted':
      return {
        title: '📬 Submission Ready',
        body: `${p.kidName} submitted "${p.questTitle}" for review`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'bonus_activated':
      return {
        title: '🔥 Flash Bonus Activated!',
        body: `"${p.questTitle}" now has +${p.bonusCoins}🪙 bonus — expires in ${p.expiresInHours}h!`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'bonus_expiring':
      return {
        title: '⏰ Bonus Ending Soon!',
        body: `"${p.questTitle}" bonus expires in ${p.minutesLeft}min — claim it now!`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'bonus_expired_penalty':
      return {
        title: '⚠️ Bonus Ignored — Penalty',
        body: `The flash bonus on "${p.questTitle}" expired unclaimed${p.coinPenalty ? ` — ${p.coinPenalty}🪙 deducted` : ''}`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'deadline_reminder':
      return {
        title: '📅 Chore Due Today',
        body: `Don't forget: "${p.questTitle}" (+${p.coins}🪙) is due today!`,
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'deadline_overdue':
      // 7.5 — the minor+same-day parent escalation (chore-deadline-notifier)
      // wants a softer, delayed "heads up, not yet done" tone rather than
      // the same urgent/sound delivery as the assignee's own overdue push —
      // signaled via payload.soft so this one type can render two ways
      // without a new notification type.
      return p.soft
        ? {
            title: '👀 Heads Up',
            body: `${p.kidName ?? 'Your child'} hasn't finished "${p.questTitle}" yet (due today) — no need to step in yet, just flagging it.`,
            sound: null,
            data: { screen: 'Quests', questId: p.questId },
          }
        : {
            title: '🚨 Chore Overdue',
            body: `"${p.questTitle}" is ${p.daysOverdue}d overdue — finish it or it will be reassigned!`,
            sound: 'default',
            data: { screen: 'Quests', questId: p.questId },
          };
    case 'penalty_applied':
      return {
        title: '🪙 Coins Deducted',
        body: `${p.coinPenalty}🪙 deducted because "${p.questTitle}" was claimed but never completed.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'force_assigned':
      return {
        title: '📋 New Chore Assigned',
        body: `A parent reassigned "${p.questTitle}" to you — complete it to earn ${p.coins}🪙!`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'geofence_exit':
      return {
        title: `📍 ${p.memberName} left ${p.zoneName}`,
        body: `${p.memberName} left ${p.zoneName} at ${p.time}`,
        data: { screen: 'Hearth', memberId: p.memberId },
      };
    case 'geofence_arrive':
      return {
        title: `🏠 ${p.memberName} arrived at ${p.zoneName}`,
        body: `${p.memberName} is safely at ${p.zoneName}`,
        data: { screen: 'Hearth', memberId: p.memberId },
      };
    case 'low_battery':
      return {
        title: `🔋 ${p.memberName}'s battery is low`,
        body: `${p.memberName} is at ${p.batteryLevel}% battery — they may go offline soon`,
        data: { screen: 'Hearth', memberId: p.memberId },
      };
    case 'chat_mention':
      return {
        title: `💬 ${p.senderName} mentioned you`,
        body: p.preview as string ?? 'You were mentioned in family chat',
        sound: 'default',
        data: { screen: 'Chat', channelId: p.channelId },
      };
    case 'chat_message':
      return {
        title: `💬 ${p.senderName}${p.channelLabel ? ` in ${p.channelLabel}` : ''}`,
        body: p.preview as string ?? 'Sent a message',
        sound: 'default',
        data: { screen: 'Chat', channelId: p.channelId },
      };
    case 'coins_awarded':
      return {
        title: '🪙 Coins Awarded!',
        body: `+${p.coins}🪙 added to your wallet — ${p.reason ?? 'great work!'}`,
        data: { screen: 'Hub' },
      };
    case 'chore_ghosted':
      return {
        title: '👻 Chore Ghosted',
        body: `${p.kidName} claimed "${p.questTitle}" but hasn't started — it may be reassigned`,
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_still_on':
      return {
        title: '👋 Still on?',
        body: `"${p.questTitle}" is due soon — tap to confirm you've got it.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_auto_released':
      return {
        title: '🔓 Released back to the pool',
        body: `You didn't confirm "${p.questTitle}" in time, so it's open for anyone else to take now.`,
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_handoff_offered':
      return {
        title: '🤝 Chore Handoff',
        body: `${p.byName ?? 'Someone'} wants to hand off "${p.questTitle}" to you${p.reason ? `: ${p.reason}` : ''}`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_handoff_accepted':
      return {
        title: '🤝 Handoff Accepted',
        body: `${p.byName ?? 'They'} accepted "${p.questTitle}" — you're all set.`,
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_handoff_declined':
      return {
        title: '↩️ Handoff Declined',
        body: `${p.byName ?? 'They'} couldn't take "${p.questTitle}" — it's back in the pool.`,
        data: { screen: 'Quests', questId: p.questId },
      };

    // ── Help requests ─────────────────────────────────────────────────────────
    case 'help_requested':
      return {
        title: `🆘 Help Needed — ${p.category ?? ''}`,
        body: `${p.requesterName} needs help: "${p.title}"${p.urgency === 'High' ? ' (Urgent!)' : ''}`,
        sound: 'default',
        data: { screen: 'Help', requestId: p.requestId },
      };
    case 'help_resolved':
      return {
        title: p.outcome === 'completed' ? '✅ Help Completed' : '❌ Help Request Rejected',
        body: p.outcome === 'completed'
          ? `"${p.title}" was completed by ${p.byName} — great teamwork! 🎉`
          : `"${p.title}" was rejected${p.reason ? `: ${p.reason}` : ''}`,
        data: { screen: 'Help', requestId: p.requestId },
      };
    case 'help_offered':
      // Two distinct audiences share this type: the requester being told
      // someone picked up their request (selfAssign — has helperName, no
      // note), vs. the person(s) a request was routed TO, being asked if
      // they'll take it (offerToMembers — carries `note` as the ask/context,
      // even when empty string, which selfAssign's payload never sets).
      return p.note !== undefined
        ? {
            title: `🙋 ${p.helperName ?? 'Someone'} could use your help`,
            body: (p.note as string) ? `"${p.title}" — ${p.note}` : `Can you help with "${p.title}"?`,
            sound: 'default',
            data: { screen: 'Help', requestId: p.requestId },
          }
        : {
            title: '🙋 Someone\'s helping!',
            body: `${p.helperName} is taking care of "${p.title}"`,
            data: { screen: 'Help', requestId: p.requestId },
          };
    case 'help_accepted':
      return {
        title: '✅ Help Offer Accepted',
        body: `${p.helperName} accepted and will help with "${p.title}"`,
        data: { screen: 'Help', requestId: p.requestId },
      };
    case 'help_declined': {
      // Live QA finding: a decline comment was captured client-side and
      // saved to the DB, but never reached this notification — the
      // requester was told only "can't help right now," with no reason
      // even when one was given.
      const suffix = p.comment ? ` — "${p.comment}"` : '';
      return {
        title: '👋 Help Offer Declined',
        body: p.backToPending
          ? `${p.byName} can't help with "${p.title}" right now${suffix} — it's back open for anyone else.`
          : `${p.byName} can't help with "${p.title}" right now${suffix}.`,
        data: { screen: 'Help', requestId: p.requestId },
      };
    }

    // ── Rewards ───────────────────────────────────────────────────────────────
    case 'reward_redeemed':
      return {
        title: `${p.rewardEmoji ?? '🎁'} Reward Request`,
        body: `Someone wants to redeem "${p.rewardTitle}" for ${p.cost}🪙 — approve or decline`,
        sound: 'default',
        data: { screen: 'Rewards', redemptionId: p.redemptionId },
      };
    case 'reward_decision':
      return {
        title: p.decision === 'approved' ? `${p.rewardEmoji ?? '🎁'} Reward Approved!` : `${p.rewardEmoji ?? '🎁'} Reward Declined`,
        body: p.decision === 'approved'
          ? `"${p.rewardTitle}" approved! Enjoy it 🎉${p.note ? ` — ${p.note}` : ''}`
          : `"${p.rewardTitle}" was declined${p.note ? `: ${p.note}` : ''}`,
        sound: 'default',
        data: { screen: 'Rewards', redemptionId: p.redemptionId },
      };
    // store/rewardStore.ts's deleteReward — a parent removed a reward from
    // the catalog while the kid still had a pending (not yet approved)
    // redemption of it. Their coins are refunded (see deleteReward's own
    // comment) but the reward itself is gone, so they need to know why it
    // disappeared from "My Redemptions" instead of just vanishing.
    case 'reward_removed':
      return {
        title: `${p.rewardEmoji ?? '🎁'} Reward No Longer Available`,
        body: `"${p.rewardTitle}" was removed from the store — your ${p.cost}🪙 has been refunded.`,
        sound: 'default',
        data: { screen: 'Rewards', redemptionId: p.redemptionId },
      };

    // ── Kid requests ──────────────────────────────────────────────────────────
    case 'kid_request': {
      const urgencyPrefix = p.urgency === 'emergency' ? '🚨 EMERGENCY: ' : p.urgency === 'urgent' ? '⚡ Urgent: ' : '';
      const typeEmoji: Record<string, string> = {
        ride: '🚗', tutor: '🎒', cheer: '✋', emergency: '🚨',
        question: '❓', permission: '🔓', appointment: '📅',
        delegation: '📋', checkin: '📞', medication: '💊',
      };
      return {
        title: `${typeEmoji[p.requestType as string] ?? '📣'} ${urgencyPrefix}Kid Request`,
        body: decodeRequestDetail(p.detail as string),
        sound: 'default',
        data: { screen: 'Requests', requestId: p.requestId, fromMemberId: p.fromMemberId },
      };
    }
    case 'kid_request_decision': {
      // Was a flat "Your request was approved!" regardless of what the
      // request actually was — a check-in ("I'm home!"/"I'm ready for
      // pickup!") got acknowledged with the exact same generic copy as a
      // permission ask or a tutoring request, giving the kid no real
      // signal about what specifically landed. Live-reported. checkin
      // requests are auto/parent-acknowledged rather than a real ask-and-
      // decide, so their approved copy reads as a plain acknowledgment
      // ("Got it — you're home!") rather than "approved," which would
      // read oddly for something that was never really in question.
      const requestType = p.requestType as string | undefined;
      const detail = decodeRequestDetail(p.detail as string);
      const approved = p.decision === 'approved';
      if (requestType === 'checkin') {
        return {
          title: approved ? '👍 Seen!' : '❌ Check-in Declined',
          body: approved
            ? `${detail || 'Check-in received'}${p.note ? ` — ${p.note}` : ''}`
            : `Your check-in wasn't acknowledged${p.note ? `: ${p.note}` : ''}`,
          data: { screen: 'Requests', requestId: p.requestId, fromMemberId: p.fromMemberId },
        };
      }
      const typeLabel: Record<string, string> = {
        ride: 'ride request', tutor: 'tutoring offer', cheer: 'cheer request',
        emergency: 'alert', question: 'question', permission: 'permission request',
        appointment: 'appointment request', delegation: 'request', medication: 'medication request',
      };
      const label = (requestType && typeLabel[requestType]) || 'request';
      return {
        title: approved ? '✅ Request Approved!' : '❌ Request Declined',
        body: approved
          ? `Your ${label}${detail ? ` ("${detail}")` : ''} was approved!${p.note ? ` "${p.note}"` : ''}`
          : `Your ${label}${detail ? ` ("${detail}")` : ''} was declined${p.note ? `: ${p.note}` : ''}`,
        data: { screen: 'Requests', requestId: p.requestId, fromMemberId: p.fromMemberId },
      };
    }
    // store/kidRequestStore.ts's assignRequest — the ADULT who got
    // volunteered by someone else (not a self-assign), separate from the
    // kid_request_decision the requesting kid gets on the same action.
    case 'kid_request_helper_assigned':
      return {
        title: '🙋 You Were Assigned',
        body: `${p.byName ?? 'Someone'} asked you to help with${p.detail ? `: "${decodeRequestDetail(p.detail as string)}"` : ' a request'}${p.note ? ` — ${p.note}` : ''}`,
        sound: 'default',
        data: { screen: 'Requests', requestId: p.requestId },
      };
    // store/kidRequestStore.ts's completeRequest — the helper marked an
    // already-approved/assigned request as actually done.
    case 'kid_request_completed': {
      const detail = decodeRequestDetail(p.detail as string);
      return {
        title: '✅ Request Completed',
        body: `${p.byName ?? 'Someone'} marked${detail ? ` "${detail}"` : ' your request'} as done — all set! 🎉`,
        data: { screen: 'Requests', requestId: p.requestId, fromMemberId: p.fromMemberId },
      };
    }
    // store/kidRequestStore.ts's approveItems/rejectItems — per-item
    // grocery/supplies decisions, distinct from kid_request_decision since
    // only some items in a multi-item request may have been acted on.
    case 'kid_request_items_decision': {
      const names = Array.isArray(p.itemNames) ? (p.itemNames as string[]) : [];
      const list = names.length ? names.join(', ') : 'items';
      return {
        title: p.decision === 'approved' ? '✅ Items Approved' : '❌ Items Declined',
        body: p.decision === 'approved'
          ? `${list} approved from your request${p.note ? ` — ${p.note}` : ''}`
          : `${list} declined from your request${p.note ? `: ${p.note}` : ''}`,
        data: { screen: 'Requests', requestId: p.requestId, fromMemberId: p.fromMemberId },
      };
    }
    case 'schedule_conflict':
      // p.reason mirrors ParentView.tsx's own conflict-reason strings
      // (e.g. "Priya assigned to 2 events") — same wording client-side and
      // server-side so a parent isn't confused seeing different language
      // in the push vs. the Hub banner for the same conflict.
      return {
        title: '⚠️ Schedule Conflict',
        body: (p.reason as string) ?? 'Two of your events overlap — check your schedule.',
        sound: 'default',
        data: { type: 'schedule_conflict', eventIds: p.eventIds },
      };

    // ── Ride/driver assignment (store/eventStore.ts's updateEvent) ────────────
    case 'ride_assignment_offered': {
      const t = to12Hour(p.eventTime as string);
      return {
        title: '🚗 Pickup/Drop-off Assigned',
        body: `${p.byName ?? 'A parent'} assigned you for pickup/drop-off — "${p.eventTitle}"${t ? ` at ${t}` : ''}.`,
        sound: 'default',
        data: { screen: 'Schedule', eventId: p.eventId },
      };
    }
    case 'ride_assignment_accepted':
      return {
        title: '🚗 Pickup/Drop-off Confirmed',
        body: `${p.byName ?? 'They'} confirmed "${p.eventTitle}" — you're covered.`,
        data: { screen: 'Schedule', eventId: p.eventId },
      };
    case 'ride_assignment_declined':
      // Live QA finding: this used to be identical, delivery-wise, to a
      // routine confirmation — Expo's push priority is already maxed at
      // 'high' for every notification this function sends, so there's no
      // higher transport tier to reach for. The fix is in the copy itself:
      // a decline within the hour of the ride now reads as genuinely
      // urgent, not just informational.
      return p.imminent
        ? {
            title: '🚨 Urgent — No Driver!',
            body: `${p.byName ?? 'They'} just dropped "${p.eventTitle}" — it's happening soon and still needs someone!`,
            sound: 'default',
            data: { screen: 'Schedule', eventId: p.eventId },
          }
        : {
            title: '🚫 Pickup/Drop-off Declined',
            body: `${p.byName ?? 'They'} can't make the pickup/drop-off for "${p.eventTitle}" — it's back open for someone else.`,
            sound: 'default',
            data: { screen: 'Schedule', eventId: p.eventId },
          };
    case 'ride_confirmed_for_kid': {
      const t = to12Hour(p.eventTime as string);
      return {
        title: '🚗 Ride Confirmed',
        body: `${p.driverName ?? 'Someone'} is handling your pickup/drop-off for "${p.eventTitle}"${t ? ` at ${t}` : ''}.`,
        sound: 'default',
        data: { screen: 'Schedule', eventId: p.eventId },
      };
    }
    case 'ride_pool_opened': {
      const t = to12Hour(p.eventTime as string);
      return {
        title: '🚗 Pickup/Drop-off Needed',
        body: `"${p.eventTitle}"${t ? ` at ${t}` : ''} needs a pickup/drop-off — tap to help.`,
        sound: 'default',
        data: { screen: 'Schedule', eventId: p.eventId },
      };
    }

    case 'pool_unclaimed_urgent':
      // p.forParent distinguishes the pool broadcast copy (to eligible
      // grandparents/teens: "come claim this") from the parent alert copy
      // ("nobody's taken this yet, cover it or bump the time") — same
      // event, two different audiences, two different asks.
      return p.forParent
        ? {
            title: '⚠️ Still Unclaimed',
            body: `Nobody's taken "${p.questTitle}" yet — due in ${p.minutesUntilDue}min. Cover it yourself, or move the time?`,
            sound: 'default',
            data: { screen: 'Quests', questId: p.questId },
          }
        : {
            title: '🙋 Needed Soon',
            body: `"${p.questTitle}" is still open — due in ${p.minutesUntilDue}min!`,
            sound: 'default',
            data: { screen: 'Quests', questId: p.questId },
          };
    case 'ride_pool_unclaimed_urgent':
      // Same forParent split as pool_unclaimed_urgent, for a ride instead
      // of a chore.
      return p.forParent
        ? {
            title: '⚠️ Ride Still Unclaimed',
            body: `Nobody's picked up "${p.eventTitle}" yet — due in ${p.minutesUntilDue}min. Cover it yourself, or move the time?`,
            sound: 'default',
            data: { screen: 'Schedule', eventId: p.eventId },
          }
        : {
            title: '🚗 Ride Needed Soon',
            body: `"${p.eventTitle}" still needs a driver — due in ${p.minutesUntilDue}min!`,
            sound: 'default',
            data: { screen: 'Schedule', eventId: p.eventId },
          };
    case 'ride_still_on':
      return {
        title: '👋 Still on?',
        body: `"${p.eventTitle}" is due in ${p.minutesUntilDue}min — tap to confirm you're on your way.`,
        sound: 'default',
        data: { screen: 'Schedule', eventId: p.eventId },
      };
    case 'approval_cutoff_nudge':
      return {
        title: '📋 Waiting on Your Yes or No',
        body: `"${p.questTitle}" needs your approval — due in ${p.minutesUntilDue}min.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'approval_cutoff_escalated':
      // Two audiences again: the co-parent picking it up, and (soft, no
      // sound) the original parent + asker being told it moved.
      return p.forCoParent
        ? {
            title: '📋 Needs Your Approval',
            body: `${p.originalParentName ?? 'The other parent'} hasn't answered "${p.questTitle}" in time — it's yours to approve or decline now.`,
            sound: 'default',
            data: { screen: 'Quests', questId: p.questId },
          }
        : {
            title: '📋 Sent to the Other Parent',
            body: `"${p.questTitle}" wasn't answered in time — ${p.coParentName ?? 'the other parent'} can approve it now.`,
            data: { screen: 'Quests', questId: p.questId },
          };

    // ── ChoreStore/EventStore full coverage audit (2026-08-28/29) ─────────────
    case 'chore_deleted':
      return {
        title: '🗑️ Chore Removed',
        body: `${p.byName ?? 'A parent'} deleted "${p.questTitle}" — nothing left to do here.`,
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'bounty_claim_approved':
      return {
        title: '✅ Claim Approved!',
        body: `Your claim on "${p.questTitle}" was approved${p.coins ? ` — +${p.coins}🪙!` : ''}`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'bounty_claim_declined':
      return {
        title: '❌ Claim Declined',
        body: `Your claim on "${p.questTitle}" was declined${p.reason ? `: ${p.reason}` : ''}`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_redo_disputed':
      return {
        title: '🙋 Second Opinion Needed',
        body: `${p.kidName ?? 'A kid'} is asking another parent to look at the redo on "${p.questTitle}"`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_redo_dispute_resolved':
      return p.pay
        ? {
            title: '✅ Dispute Resolved — Approved!',
            body: `A second parent reviewed "${p.questTitle}" and approved it${p.coins ? ` — +${p.coins}🪙!` : ''}`,
            sound: 'default',
            data: { screen: 'Quests', questId: p.questId },
          }
        : {
            title: '↩️ Dispute Resolved — Redo Stands',
            body: `A second parent looked at "${p.questTitle}" and agrees it needs a redo.`,
            sound: 'default',
            data: { screen: 'Quests', questId: p.questId },
          };
    case 'chore_later_date_proposed':
      return {
        title: '📅 Reschedule Requested',
        body: `${p.byName ?? 'Someone'} asked to push "${p.questTitle}" to ${p.newDate}${p.reason ? ` — "${p.reason}"` : ''}`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_later_date_approved':
      return {
        title: '📅 Reschedule Approved',
        body: `"${p.questTitle}" is now due ${p.newDate} — you're all set.`,
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_later_date_declined':
      return {
        title: '📅 Reschedule Declined',
        body: `Your request to push back "${p.questTitle}" wasn't approved — original due date stands.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'chore_terms_change_rejected':
      return {
        title: '↩️ Terms Change Turned Down',
        body: `${p.byName ?? 'The claimant'} handed "${p.questTitle}" back rather than accept the new terms — it's open again.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'grandparent_quest_routed':
      return {
        title: '✅ Your Chore Was Approved',
        body: `A parent approved "${p.questTitle}" — it's ${p.routedToPool ? 'in the bounty pool now' : 'assigned and ready'}.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'grandparent_quest_declined_by_parent':
      return {
        title: '❌ Chore Declined',
        body: `A parent declined "${p.questTitle}"${p.reason ? `: ${p.reason}` : ''}`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'grandparent_quest_needs_review':
      return {
        title: '🙋 Grandparent Chore Needs Review',
        body: `${p.gpName ?? 'A grandparent'} posted "${p.questTitle}" — review and approve or decline.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'approval_reversed':
      return {
        title: '⚠️ Approval Reversed',
        body: `${p.byName ?? 'A parent'} reversed your approval of "${p.questTitle}"${p.reason ? ` — "${p.reason}"` : ''}.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'approval_reversal_cosigned':
      return {
        title: '✅ Reversal Co-Signed',
        body: `Your reversal request for "${p.questTitle}" was co-signed — the payout was clawed back.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'cashout_requested':
      return {
        title: '💵 Cash-Out Requested',
        body: `${p.kidName ?? 'A kid'} requested a ${p.points}🪙 cash-out — review it.`,
        sound: 'default',
        data: { screen: 'Rewards' },
      };
    case 'cashout_settled':
      return {
        title: '💵 Cash-Out Settled',
        body: `Your ${p.points}🪙 cash-out was settled${p.method ? ` (${p.method})` : ''}.`,
        data: { screen: 'Rewards' },
      };
    case 'cashout_approved':
      return {
        title: '✅ Cash-Out Approved',
        body: `Your ${p.points}🪙 cash-out was approved.`,
        sound: 'default',
        data: { screen: 'Rewards' },
      };
    case 'cashout_denied':
      return {
        title: '❌ Cash-Out Denied',
        body: `Your ${p.points}🪙 cash-out request was denied${p.refunded ? ' — the coins were refunded to your balance.' : '.'}`,
        sound: 'default',
        data: { screen: 'Rewards' },
      };
    case 'parent_quest_delegated':
      return {
        title: '📋 New Task Delegated to You',
        body: `${p.byName ?? 'Someone'} handed you "${p.questTitle}"${p.note ? ` — "${p.note}"` : ''} — accept or decline.`,
        sound: 'default',
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'parent_quest_lock_cancelled':
      return {
        title: '↩️ Assignment Cancelled',
        body: `${p.byName ?? 'They'} cancelled the locked assignment for "${p.questTitle}" — it's reopened.`,
        data: { screen: 'Quests', questId: p.questId },
      };
    case 'event_assigned': {
      const t = to12Hour(p.eventTime as string);
      return {
        title: '📅 New Event Assigned',
        body: `${p.byName ?? 'A parent'} assigned you to "${p.eventTitle}"${t ? ` at ${t}` : ''}.`,
        sound: 'default',
        data: { screen: 'Schedule', eventId: p.eventId },
      };
    }
    case 'event_deleted':
      return {
        title: '🗑️ Event Removed',
        body: `${p.byName ?? 'A parent'} deleted "${p.eventTitle}" — it's off the schedule.`,
        data: { screen: 'Schedule' },
      };
    case 'event_rsvp_response':
      return {
        title: `${p.response === 'going' ? '✅' : p.response === 'not_going' ? '❌' : '🤔'} RSVP Update`,
        body: `${p.memberName ?? 'Someone'} responded ${p.response === 'going' ? "they're going" : p.response === 'not_going' ? "they can't make it" : 'maybe'} to "${p.eventTitle}".`,
        data: { screen: 'Schedule', eventId: p.eventId },
      };

    case 'member_pin_changed':
      return {
        title: '🔐 PIN Changed',
        body: `${p.byName ?? 'A parent'} ${p.action === 'removed' ? 'removed the PIN on' : p.action === 'added' ? 'set a PIN on' : 'changed the PIN for'} ${p.memberName ?? 'a family member'}'s profile.`,
        sound: 'default',
        data: { screen: 'Roster', memberId: p.memberId },
      };
    case 'member_role_changed':
      return {
        title: '👤 Role Changed',
        body: `${p.byName ?? 'A parent'} changed ${p.memberName ?? 'a family member'}'s role from ${p.oldRole ?? 'their old role'} to ${p.newRole ?? 'a new role'}.`,
        sound: 'default',
        data: { screen: 'Roster', memberId: p.memberId },
      };
    case 'temp_approver_granted':
      return p.toSelf
        ? {
            title: '🔑 Approval Access Granted',
            body: `${p.byName ?? 'A parent'} gave you approval access until ${p.untilLabel} — you can approve/decline routine chore submissions until then.`,
            sound: 'default',
            data: { screen: 'Roster' },
          }
        : {
            title: '🔑 Temporary Approver Granted',
            body: `${p.byName ?? 'A parent'} gave ${p.granteeName ?? 'a family member'} approval access until ${p.untilLabel}.`,
            data: { screen: 'Roster' },
          };
    case 'temp_approver_revoked':
      return p.toSelf
        ? {
            title: '🔒 Approval Access Ended',
            body: `${p.byName ?? 'A parent'} ended your temporary approval access early.`,
            data: { screen: 'Roster' },
          }
        : {
            title: '🔒 Temporary Approver Revoked',
            body: `${p.byName ?? 'A parent'} ended ${p.granteeName ?? 'a family member'}'s temporary approval access early.`,
            data: { screen: 'Roster' },
          };

    case 'trip_started':
      return {
        title: `🚗 ${p.driverName ?? 'A parent'} is en route`,
        body: `Heading to pick up ${p.kidName ?? 'the kids'} · ETA ${p.etaMinutes} min`,
        data: { screen: 'Hub', tripId: p.tripId },
      };
    case 'trip_overdue':
      return {
        title: '🚨 Pickup not confirmed yet',
        body: `${p.driverName ?? 'The driver'} was due to pick up ${p.kidName ?? 'the kids'} ${p.etaMinutes} min ago`,
        sound: 'default',
        data: { screen: 'Hub', tripId: p.tripId },
      };
    case 'memory_posted':
      return {
        title: `📸 ${p.posterName ?? 'Someone'} shared a new memory`,
        body: (p.caption as string) || 'Tap to see what they posted.',
        data: { screen: 'Memories', memoryId: p.memoryId },
      };
    case 'memory_liked':
      return {
        title: `❤️ ${p.likerName ?? 'Someone'} loved your memory`,
        body: (p.caption as string) ? `On "${p.caption}"` : 'Tap to see the reaction.',
        data: { screen: 'Memories', memoryId: p.memoryId },
      };
    case 'grocery_daily_digest':
      return {
        title: '🛒 Grocery list check-in',
        body: (p.body as string) ?? `${p.count} item${p.count === 1 ? '' : 's'} waiting on the grocery list`,
        data: { screen: 'Grocery' },
      };
    case 'grocery_run_reminder':
      return {
        title: (p.title as string) ?? `🛒 ${p.store ?? 'Shopping'} run planned in 1 hour`,
        body: (p.body as string) ?? `${p.runName ?? 'Your trip'} — don't forget to add anything you need before they head out.`,
        data: { screen: 'Grocery', runId: p.run_id },
      };
    case 'member_joined':
      return {
        title: `👋 ${p.memberName ?? 'Someone'} joined the family!`,
        body: `${p.memberName ?? 'A new member'} just joined ${p.familyName ?? 'your family'}${p.role ? ` as a ${p.role}` : ''}.`,
        data: { screen: 'Roster' },
      };
    case 'perk_updated': {
      const changeLabel = p.change === 'unavailable' ? 'is no longer available'
        : p.change === 'available' ? 'is back and available'
        : p.change === 'price' ? `now costs ${p.cost}🪙`
        : 'was updated';
      return {
        title: `🎁 "${p.rewardTitle}" ${changeLabel}`,
        body: p.change === 'price'
          ? `The price changed to ${p.cost}🪙 in the Store.`
          : `Check the Store for the latest details.`,
        data: { screen: 'Store', rewardId: p.rewardId },
      };
    }
    case 'medication_added':
      return {
        title: `💊 New medication added`,
        body: `${p.byName ?? 'A parent'} added "${p.medName}" to your medications${p.dosage ? ` (${p.dosage})` : ''}.`,
        sound: 'default',
        data: { screen: 'Health', memberId: p.memberId },
      };
    case 'medication_missed':
      return {
        title: `⏰ Missed medication — ${p.memberName ?? 'a family member'}`,
        body: `"${p.medName}" hasn't been logged as taken, ${p.minutesLate ?? 30}+ min past the scheduled time.`,
        sound: 'default',
        data: { screen: 'Health', memberId: p.subjectMemberId },
      };
    case 'store_proximity_arrived': {
      const list = p.itemNames as string | undefined;
      return {
        title: `📍 ${p.memberName ?? 'Someone'} is near ${p.store ?? 'a store'}`,
        body: list
          ? `${list}${(p.extraCount as number) > 0 ? ` + ${p.extraCount} more` : ''} on the list — good time to add anything else you need.`
          : `They're near ${p.store} — good time to add anything else you need to the list.`,
        data: { screen: 'Grocery', store: p.store },
      };
    }
    case 'meal_reminder': {
      const emoji = p.mealType === 'breakfast' ? '🌅' : p.mealType === 'lunch' ? '☀️' : p.mealType === 'snack' ? '🍎' : '🌙';
      return {
        title: `${emoji} ${p.mealTitle ?? 'A meal'} in 1 hour`,
        body: `${p.day ?? 'Today'}'s ${p.mealType ?? 'meal'}${p.chefName ? ` — ${p.chefName} is cooking` : ''} at ${p.timeLabel ?? 'the planned time'}.`,
        data: { screen: 'Vault', tab: 'Meals', mealId: p.mealId },
      };
    }

    case 'custom':
    default:
      return {
        title: (p.title as string) ?? 'FamilyCube',
        body:  (p.body as string)  ?? '',
        sound: 'default',
        data:  (p.data  as Record<string, unknown>) ?? {},
      };
  }
}

// ─── Expo push delivery ───────────────────────────────────────────────────────

async function sendExpoPush(tokens: string[], message: NotifShape): Promise<{ sent: number; failed: number; errors: string[]; ticketsByToken: Map<string, string> }> {
  // ticketsByToken maps each Expo push token -> the Expo ticket/receipt id
  // Expo returned for it (only populated for status:'ok' tickets — that id
  // is what notification-health-check later polls via getReceipts to learn
  // whether the OS actually accepted the push, e.g. DeviceNotRegistered).
  // Previously this function only returned aggregate counts, so the caller
  // had no receipt id to persist onto the notifications row — the health
  // check's own `.not('expo_receipt_id', 'is', null)` query always came back
  // empty (confirmed live: 0 of the last 63 notifications had one set), so
  // the daily 6am stale-token sweep has been running against zero rows since
  // it was deployed, silently doing nothing.
  const ticketsByToken = new Map<string, string>();
  if (!tokens.length) return { sent: 0, failed: 0, errors: [], ticketsByToken };

  // Chunk into batches of 100 (Expo limit)
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));

  let sent = 0, failed = 0;
  const errors: string[] = [];

  for (const chunk of chunks) {
    const messages = chunk.map(token => ({
      to: token,
      title: message.title,
      body: message.body,
      sound: message.sound ?? 'default',
      badge: message.badge,
      data: message.data ?? {},
      priority: 'high',
      channelId: 'default',
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) { failed += chunk.length; errors.push(`Expo HTTP ${res.status}`); continue; }

      const result = await res.json();
      const tickets = (result.data ?? []) as Array<{ status: string; id?: string; message?: string }>;
      // Expo returns tickets in the exact same order as the request array,
      // so index i of `tickets` corresponds to index i of `chunk` (the token
      // it was sent to) — documented Expo push API behavior, not an
      // assumption; this is the only way to associate a ticket id back to
      // the token it belongs to since the response itself doesn't echo `to`.
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          sent++;
          if (ticket.id) ticketsByToken.set(chunk[i], ticket.id);
        } else {
          failed++;
          if (ticket.message) errors.push(ticket.message);
        }
      });
    } catch (e: any) {
      failed += chunk.length;
      errors.push(e.message);
    }
  }

  return { sent, failed, errors, ticketsByToken };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const {
      type,       // NotifType
      tokens,     // string[] — Expo push tokens of recipients
      memberIds,  // string[] — used to look up tokens from DB if tokens not provided
      familyId,   // string  — used for DB lookup + notification persistence
      payload,    // Record<string, unknown> — template variables
      persist,    // bool — whether to write to notifications table (default true)
      excludeMemberId, // string — the member whose own action triggered this; never notify them about it
    } = await req.json() as {
      type: NotifType;
      tokens?: string[];
      memberIds?: string[];
      familyId?: string;
      payload: Record<string, unknown>;
      persist?: boolean;
      excludeMemberId?: string;
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve push tokens — caller can pass directly or let us look them up
    let pushTokens: string[] = tokens ?? [];
    let resolvedMemberIds: string[] = memberIds ?? [];

    // Auto-route: if no memberIds passed, resolve by type
    const NOTIFY_PARENTS = ['help_requested', 'reward_redeemed', 'kid_request', 'quest_claimed', 'quest_submitted', 'chore_ghosted', 'bonus_expired_penalty'];
    const NOTIFY_SPECIFIC = ['help_resolved', 'help_offered', 'help_accepted', 'help_declined', 'reward_decision', 'reward_removed', 'kid_request_decision', 'kid_request_helper_assigned', 'kid_request_completed', 'kid_request_items_decision', 'quest_approved', 'quest_declined', 'quest_assigned', 'force_assigned', 'bonus_activated', 'coins_awarded', 'penalty_applied', 'deadline_reminder', 'deadline_overdue', 'medication_added'];

    // kid_request fans out to every parent, but not every request TYPE is
    // something a grandparent could act on — grocery/supplies (type
    // 'delegation'), 'permission', 'appointment', and the RIDE_LATE
    // escalation (detail-encoded, not its own type) are parent-only asks.
    // Only these subtypes are things a GP could plausibly help with
    // directly. Reported live: a GP's notification tray was filling up with
    // grocery lists and "hasn't arrived" alerts for a pickup they had
    // nothing to do with.
    const GP_RELEVANT_REQUEST_TYPES = ['ride', 'cheer', 'emergency', 'checkin'];
    const detail = typeof payload.detail === 'string' ? payload.detail : '';
    const isRideLateEscalation = detail.startsWith('RIDE_LATE:');
    const includeGrandparents = type !== 'kid_request' ||
      (!isRideLateEscalation && GP_RELEVANT_REQUEST_TYPES.includes(payload.requestType as string));

    if (!pushTokens.length && !resolvedMemberIds.length && familyId) {
      if (NOTIFY_PARENTS.includes(type)) {
        // Raw DB role values, not app-level names — see
        // store/familyStore.ts fromRow()/toRow() for the mapping. The DB
        // never stores 'senior', only 'grandparent'.
        const roles = includeGrandparents ? ['parent', 'grandparent'] : ['parent'];
        const { data: parents } = await supabase
          .from('members')
          .select('id')
          .eq('family_id', familyId)
          .in('role', roles);
        resolvedMemberIds = (parents ?? []).map((m: any) => m.id);
        // pushTokens deliberately left empty here — resolved from
        // member_device_tokens (with expo_push_token fallback) further down,
        // after the category-preference filter has had a chance to narrow
        // resolvedMemberIds.
      } else if (NOTIFY_SPECIFIC.includes(type)) {
        // For member-specific types, the payload should carry memberId or fromMemberId
        const specificId = (payload.memberId ?? payload.fromMemberId ?? payload.assigneeId) as string | undefined;
        if (specificId) {
          resolvedMemberIds = [specificId];
        }
      }
    }

    // Never notify the member whose own action triggered this — applies
    // regardless of whether recipients came from explicit memberIds/tokens
    // or one of the auto-route branches above, so a caller only ever has to
    // pass excludeMemberId once instead of remembering to filter it out of
    // every possible recipient list itself.
    if (excludeMemberId) {
      resolvedMemberIds = resolvedMemberIds.filter(id => id !== excludeMemberId);
    }

    // Per-member category opt-out (Profile page's notification settings —
    // was previously a UI-only toggle with no real backing at all). A
    // missing key defaults to enabled (get(prefs, category, true) below),
    // matching every member's existing behavior until they explicitly mute
    // a category, not an opt-in that would silently break notifications for
    // everyone who already had a members row before this column existed.
    if (resolvedMemberIds.length) {
      const category = categoryFor(type, payload ?? {});
      const { data: prefRows } = await supabase
        .from('members')
        .select('id, notification_prefs')
        .in('id', resolvedMemberIds);
      const allowedIds = new Set(
        (prefRows ?? [])
          .filter((m: any) => (m.notification_prefs ?? {})[category] !== false)
          .map((m: any) => m.id)
      );
      // Any id with no matching row at all (shouldn't happen, but don't let
      // a lookup gap silently drop a real recipient) stays included.
      const rowIds = new Set((prefRows ?? []).map((m: any) => m.id));
      resolvedMemberIds = resolvedMemberIds.filter(id => allowedIds.has(id) || !rowIds.has(id));
      // pushTokens may already be populated from an earlier branch (explicit
      // tokens passed, or an auto-route branch above) — re-derive from the
      // now-filtered id list instead of trying to filter tokens directly,
      // since a token can't be mapped back to which member opted out of what.
      pushTokens = [];
    }

    // Quiet hours — suppresses the PUSH only, not the in-app notifications-
    // table row (persisted below regardless), so a muted push during quiet
    // hours still shows up in the bell once the recipient opens the app.
    // Deliberately a SEPARATE id list from resolvedMemberIds (which still
    // feeds the persist step further down unfiltered by quiet hours) — a
    // person shouldn't lose the notification entirely just because it
    // arrived at 2am, only the buzz/sound.
    let pushEligibleIds = resolvedMemberIds;
    if (pushEligibleIds.length) {
      const { data: quietRows } = await supabase
        .from('members')
        .select('id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone')
        .in('id', pushEligibleIds);
      pushEligibleIds = pushEligibleIds.filter(id => {
        const m = (quietRows ?? []).find((r: any) => r.id === id);
        if (!m?.quiet_hours_enabled || !m.quiet_hours_start || !m.quiet_hours_end) return true;
        return !inQuietWindow(m.quiet_hours_start, m.quiet_hours_end, m.timezone ?? null);
      });
      pushTokens = [];
    }

    let pushTokensByMember = new Map<string, Set<string>>();
    if (!pushTokens.length && pushEligibleIds.length) {
      const resolved = await resolveTokensForMembersDetailed(supabase, pushEligibleIds);
      pushTokens = resolved.tokens;
      pushTokensByMember = resolved.tokensByMember;
    } else if (excludeMemberId && tokens?.length) {
      // Caller passed raw tokens directly (rare path) — can't map a token
      // back to a member id here to exclude by id, so exclude by re-deriving
      // from that member's known tokens (member_device_tokens, falling back
      // to members.expo_push_token) instead when this happens; in practice
      // every current caller passes memberIds, not raw tokens, so this is a
      // defensive fallback rather than a hit path.
      const excludedTokens = await resolveTokensForMembers(supabase, [excludeMemberId]);
      if (excludedTokens.length) {
        pushTokens = pushTokens.filter(t => !excludedTokens.includes(t));
      }
    }

    // Build the notification shape from type + payload
    const message = buildMessage(type, payload ?? {});

    // Send push
    const delivery = pushTokens.length > 0
      ? await sendExpoPush(pushTokens, message)
      : { sent: 0, failed: 0, errors: ['No push tokens provided'], ticketsByToken: new Map<string, string>() };

    // Persist to notifications table (so in-app bell shows it even if push fails)
    if (persist !== false && familyId) {
      const persistIds = (resolvedMemberIds.length ? resolvedMemberIds : [payload.memberId as string])
        .filter(Boolean)
        .filter((id: string) => id !== excludeMemberId);
      const rows = persistIds.map((memberId: string) => {
        // Best-effort: pick any one of this member's tokens that actually
        // got an Expo ticket id back, so notification-health-check's daily
        // sweep has something to poll (previously nothing here ever wrote
        // expo_receipt_id, so that sweep always found 0 rows — see the
        // comment on sendExpoPush). A member with multiple real devices only
        // gets one receipt tracked per notification row (the table's grain
        // is per-member, not per-device), which is a reasonable trade: a
        // DeviceNotRegistered receipt on the tracked device's token still
        // gets that stale token cleared by the sweep; an untracked second
        // device's own staleness would surface on a later notification that
        // happens to pick its ticket instead.
        const memberTokens = pushTokensByMember.get(memberId);
        let receiptId: string | null = null;
        if (memberTokens) {
          for (const t of memberTokens) {
            const id = delivery.ticketsByToken.get(t);
            if (id) { receiptId = id; break; }
          }
        }
        return {
          family_id:     familyId,
          member_id:     memberId,
          target_member: memberId,
          type,
          title:         message.title,
          message:       message.body,
          body:          message.body,
          data:          { ...message.data, ...payload },
          meta:          { ...message.data, ...payload },
          timestamp:     new Date().toISOString(),
          read:          false,
          expo_receipt_id: receiptId,
        };
      });
      if (rows.length) {
        const { error } = await supabase.from('notifications').insert(rows);
        if (error) console.warn('[family-notifier] DB insert failed:', error.message);
      }
    }

    console.log(`[family-notifier] type=${type} sent=${delivery.sent} failed=${delivery.failed}`);
    return json({ ok: true, type, delivery, title: message.title, body: message.body });

  } catch (e: any) {
    console.error('[family-notifier]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
