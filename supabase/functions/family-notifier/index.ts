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
async function resolveTokensForMembers(
  supabase: ReturnType<typeof createClient>,
  memberIds: string[],
): Promise<string[]> {
  if (!memberIds.length) return [];

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
  return [...all];
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
  | 'reward_redeemed'
  | 'reward_decision'
  | 'kid_request'
  | 'kid_request_decision'
  | 'custom';

// Category a member's notification_prefs toggles by — coarser than
// NotifType's 20+ individual values, since that's the granularity a person
// actually thinks in terms of ("chores", not "bonus_expired_penalty").
type NotifCategory = 'chores' | 'family' | 'chat' | 'rewards' | 'requests' | 'grocery';

const CATEGORY_BY_TYPE: Partial<Record<NotifType, NotifCategory>> = {
  quest_approved: 'chores', quest_declined: 'chores', quest_claimed: 'chores',
  quest_submitted: 'chores', bonus_activated: 'chores', bonus_expiring: 'chores',
  bonus_expired_penalty: 'chores', deadline_reminder: 'chores', deadline_overdue: 'chores',
  penalty_applied: 'chores', force_assigned: 'chores', chore_ghosted: 'chores',
  chore_still_on: 'chores', chore_auto_released: 'chores',
  geofence_exit: 'family', geofence_arrive: 'family', low_battery: 'family',
  chat_mention: 'chat',
  coins_awarded: 'rewards', reward_redeemed: 'rewards', reward_decision: 'rewards',
  help_requested: 'requests', help_resolved: 'requests',
  kid_request: 'requests', kid_request_decision: 'requests',
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
    case 'kid_request_decision':
      return {
        title: p.decision === 'approved' ? '✅ Request Approved!' : '❌ Request Declined',
        body: p.decision === 'approved'
          ? `Your request was approved!${p.note ? ` "${p.note}"` : ''}`
          : `Your request was declined${p.note ? `: ${p.note}` : ''}`,
        data: { screen: 'Requests', requestId: p.requestId, fromMemberId: p.fromMemberId },
      };

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

async function sendExpoPush(tokens: string[], message: NotifShape): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (!tokens.length) return { sent: 0, failed: 0, errors: [] };

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
      for (const ticket of (result.data ?? [])) {
        if (ticket.status === 'ok') sent++;
        else { failed++; if (ticket.message) errors.push(ticket.message); }
      }
    } catch (e: any) {
      failed += chunk.length;
      errors.push(e.message);
    }
  }

  return { sent, failed, errors };
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
    const NOTIFY_SPECIFIC = ['help_resolved', 'reward_decision', 'kid_request_decision', 'quest_approved', 'quest_declined', 'quest_assigned', 'force_assigned', 'bonus_activated', 'coins_awarded', 'penalty_applied', 'deadline_reminder', 'deadline_overdue'];

    if (!pushTokens.length && !resolvedMemberIds.length && familyId) {
      if (NOTIFY_PARENTS.includes(type)) {
        // Raw DB role values, not app-level names — see
        // store/familyStore.ts fromRow()/toRow() for the mapping. The DB
        // never stores 'senior', only 'grandparent'.
        const { data: parents } = await supabase
          .from('members')
          .select('id')
          .eq('family_id', familyId)
          .in('role', ['parent', 'grandparent']);
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

    if (!pushTokens.length && pushEligibleIds.length) {
      pushTokens = await resolveTokensForMembers(supabase, pushEligibleIds);
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
      : { sent: 0, failed: 0, errors: ['No push tokens provided'] };

    // Persist to notifications table (so in-app bell shows it even if push fails)
    if (persist !== false && familyId) {
      const persistIds = (resolvedMemberIds.length ? resolvedMemberIds : [payload.memberId as string])
        .filter(Boolean)
        .filter((id: string) => id !== excludeMemberId);
      const rows = persistIds.map((memberId: string) => ({
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
      }));
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
