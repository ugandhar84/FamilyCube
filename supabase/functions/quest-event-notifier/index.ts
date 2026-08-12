// FamilyCube — Edge Function: quest-event-notifier
// Called fire-and-forget from questStore after every mutation.
// Resolves who to notify (assigner vs assignee vs parents vs seniors),
// builds the right notification type, and delegates delivery to family-notifier.
//
// Deploy: supabase functions deploy quest-event-notifier
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Notification routing matrix ───────────────────────────────────────────────
// event              → who gets notified
// quest_assigned     → assignee (kid)
// quest_claimed      → parents + seniors in family
// quest_submitted    → parents + seniors in family
// quest_approved     → assignee (kid)
// quest_declined     → assignee (kid)
// quest_reopened     → assignee (kid)
// quest_reassigned   → new assignee (kid) + parents
// force_assigned     → new assignee (kid)
// bonus_activated    → assignee (kid), or all kids if pool
// coins_awarded      → assignee (kid)

const NOTIFY_APPROVERS = ['quest_claimed', 'quest_submitted'];
const NOTIFY_ASSIGNEE  = ['quest_assigned', 'quest_approved', 'quest_declined', 'quest_reopened', 'force_assigned', 'bonus_activated', 'coins_awarded'];
const NOTIFY_BOTH      = ['quest_reassigned'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const {
      event,       // string — one of the event names above
      questId,     // string
      questTitle,  // string
      familyId,    // string
      triggeredById, // string — member who caused the change
      assigneeId,  // string | null — current assignee
      newAssigneeId, // string | null — for reassign / force_assign
      coins,       // number — for approved / bonus
      bonusCoins,  // number — for bonus_activated
      bonusExpiresAt, // ISO string
      declineReason, // string — for declined
      coinPenalty, // number — for penalty
    } = await req.json() as Record<string, any>;

    if (!event || !familyId) return json({ ok: false, error: 'event and familyId required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Resolve members ────────────────────────────────────────────────────────
    const { data: members } = await supabase
      .from('members')
      .select('id, name, role, expo_push_token')
      .eq('family_id', familyId);

    const memberMap: Record<string, any> = {};
    for (const m of (members ?? [])) memberMap[m.id] = m;

    const tokens = (ids: (string | undefined | null)[]) =>
      ids.filter(Boolean).map(id => memberMap[id!]?.expo_push_token).filter(Boolean) as string[];

    const memberIds = (ids: (string | undefined | null)[]) =>
      ids.filter(Boolean) as string[];

    const approverIds   = (members ?? []).filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id);
    const triggerer     = triggeredById ? memberMap[triggeredById] : null;
    const assignee      = assigneeId    ? memberMap[assigneeId]    : null;
    const newAssignee   = newAssigneeId ? memberMap[newAssigneeId] : null;

    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const notifierHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    const fire = (type: string, targetIds: string[], payload: Record<string, unknown>) =>
      fetch(notifierUrl, {
        method: 'POST',
        headers: notifierHeaders,
        body: JSON.stringify({
          type,
          tokens: tokens(targetIds),
          memberIds: memberIds(targetIds),
          familyId,
          payload,
          persist: true,
        }),
      }).catch(e => console.warn('[quest-event-notifier] notifier failed:', e.message));

    const base = { questId, questTitle };

    switch (event) {

      case 'quest_assigned':
        // Parent added a new quest and assigned it to a kid
        if (assigneeId) {
          await fire('quest_assigned', [assigneeId], {
            ...base, coins,
            title: '📋 New Quest Assigned!',
            body: `"${questTitle}" was assigned to you — earn ${coins}🪙 by completing it!`,
          });
        }
        break;

      case 'quest_claimed':
        // Kid claimed a pool bounty — tell parents/seniors
        await fire('quest_claimed', approverIds, {
          ...base,
          kidName: assignee?.name ?? 'A kid',
          title: `🙋 ${assignee?.name ?? 'A kid'} claimed a quest`,
          body: `"${questTitle}" was just claimed`,
        });
        break;

      case 'quest_submitted':
        // Kid submitted for review — tell parents/seniors
        await fire('quest_submitted', approverIds, {
          ...base,
          kidName: assignee?.name ?? 'A kid',
          title: `📬 Review needed`,
          body: `${assignee?.name ?? 'A kid'} submitted "${questTitle}" — approve or decline`,
        });
        break;

      case 'quest_approved':
        // Parent/senior approved — tell the kid
        if (assigneeId) {
          const total = (coins ?? 0) + (bonusCoins ?? 0);
          await fire('quest_approved', [assigneeId], { ...base, coins: total });
          if (total > 0) {
            await fire('coins_awarded', [assigneeId], { ...base, coins: total, reason: `"${questTitle}" approved` });
          }
        }
        break;

      case 'quest_declined':
        // Parent/senior declined — tell the kid with reason
        if (assigneeId) {
          await fire('quest_declined', [assigneeId], {
            ...base, reason: declineReason,
          });
        }
        break;

      case 'quest_reopened':
        // Parent gave kid another chance
        if (assigneeId) {
          await fire('quest_reopened', [assigneeId], {
            ...base,
            title: '🔄 Another Chance!',
            body: `"${questTitle}" was reopened — give it another try and earn ${coins}🪙!`,
          });
        }
        break;

      case 'quest_reassigned': {
        // Parent reassigned to another kid (manual, not penalty)
        const prevId = assigneeId;
        const nextId = newAssigneeId;
        // Notify new assignee
        if (nextId) {
          await fire('force_assigned', [nextId], { ...base, coins });
        }
        // Notify parents it happened
        await fire('quest_reassigned', approverIds, {
          ...base,
          title: '🔀 Quest Reassigned',
          body: `"${questTitle}" moved from ${memberMap[prevId ?? '']?.name ?? 'unassigned'} → ${memberMap[nextId ?? '']?.name ?? '?'}`,
        });
        break;
      }

      case 'force_assigned': {
        // AI penalty force-assign — notify new kid + parents
        if (newAssigneeId) {
          await fire('force_assigned', [newAssigneeId], { ...base, coins });
        }
        if (assigneeId && coinPenalty) {
          await fire('penalty_applied', [assigneeId], { ...base, coinPenalty });
        }
        await fire('quest_reassigned', approverIds, {
          ...base,
          title: '⚠️ AI Force-Assigned',
          body: `"${questTitle}" penalty-reassigned to ${newAssignee?.name ?? '?'}${coinPenalty ? ` — ${coinPenalty}🪙 deducted from ${assignee?.name}` : ''}`,
        });
        break;
      }

      case 'bonus_activated': {
        // Parent activated flash bonus — notify assignee (or all kids if pool)
        const kidIds = assigneeId
          ? [assigneeId]
          : (members ?? []).filter((m: any) => m.role === 'kid').map((m: any) => m.id);
        const expiresHours = bonusExpiresAt
          ? Math.round((new Date(bonusExpiresAt).getTime() - Date.now()) / 3600_000)
          : 2;
        await fire('bonus_activated', kidIds, {
          ...base, bonusCoins, expiresInHours: expiresHours,
        });
        break;
      }

      default:
        console.warn('[quest-event-notifier] unknown event:', event);
    }

    return json({ ok: true, event, questId });

  } catch (e: any) {
    console.error('[quest-event-notifier]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
