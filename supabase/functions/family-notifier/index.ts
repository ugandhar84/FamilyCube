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
  | 'help_requested'
  | 'help_resolved'
  | 'reward_redeemed'
  | 'reward_decision'
  | 'kid_request'
  | 'kid_request_decision'
  | 'custom';

interface NotifShape {
  title: string;
  body: string;
  sound?: 'default' | null;
  badge?: number;
  data?: Record<string, unknown>;
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
        body: p.detail as string,
        sound: 'default',
        data: { screen: 'Requests', requestId: p.requestId },
      };
    }
    case 'kid_request_decision':
      return {
        title: p.decision === 'approved' ? '✅ Request Approved!' : '❌ Request Declined',
        body: p.decision === 'approved'
          ? `Your request was approved!${p.note ? ` "${p.note}"` : ''}`
          : `Your request was declined${p.note ? `: ${p.note}` : ''}`,
        data: { screen: 'Requests', requestId: p.requestId },
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
    } = await req.json() as {
      type: NotifType;
      tokens?: string[];
      memberIds?: string[];
      familyId?: string;
      payload: Record<string, unknown>;
      persist?: boolean;
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
          .select('id, expo_push_token')
          .eq('family_id', familyId)
          .in('role', ['parent', 'grandparent'])
          .not('expo_push_token', 'is', null);
        resolvedMemberIds = (parents ?? []).map((m: any) => m.id);
        pushTokens = (parents ?? []).map((m: any) => m.expo_push_token).filter(Boolean);
      } else if (NOTIFY_SPECIFIC.includes(type)) {
        // For member-specific types, the payload should carry memberId or fromMemberId
        const specificId = (payload.memberId ?? payload.fromMemberId ?? payload.assigneeId) as string | undefined;
        if (specificId) {
          const { data: member } = await supabase
            .from('members')
            .select('id, expo_push_token')
            .eq('id', specificId)
            .single();
          if (member?.expo_push_token) {
            resolvedMemberIds = [member.id];
            pushTokens = [member.expo_push_token];
          }
        }
      }
    }

    if (!pushTokens.length && resolvedMemberIds.length) {
      const { data: members } = await supabase
        .from('members')
        .select('expo_push_token')
        .in('id', resolvedMemberIds)
        .not('expo_push_token', 'is', null);
      pushTokens = (members ?? []).map((m: any) => m.expo_push_token).filter(Boolean);
    }

    // Build the notification shape from type + payload
    const message = buildMessage(type, payload ?? {});

    // Send push
    const delivery = pushTokens.length > 0
      ? await sendExpoPush(pushTokens, message)
      : { sent: 0, failed: 0, errors: ['No push tokens provided'] };

    // Persist to notifications table (so in-app bell shows it even if push fails)
    if (persist !== false && familyId) {
      const rows = (resolvedMemberIds.length ? resolvedMemberIds : [payload.memberId as string]).filter(Boolean).map((memberId: string) => ({
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
