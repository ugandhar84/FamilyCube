// FamilyCube — Edge Function: chore-deadline-notifier
// Called on a schedule (or on-demand) to sweep quests and fire reminders.
// Handles: due-today reminders, overdue warnings, ghosted-claim alerts.
//
// Deploy: supabase functions deploy chore-deadline-notifier
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Call family-notifier to actually deliver the push.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { familyId, dryRun = false } = body as { familyId?: string; dryRun?: boolean };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = new Date().toISOString().split('T')[0];
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const notifierHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    // ── Fetch quests that need attention ─────────────────────────────────────
    let questQuery = supabase
      .from('quests')
      .select('id, title, coins, priority, status, due_date, assigned_to_id, claimed_at, bonus_coins, bonus_expires_at, is_pool, family_id')
      .in('status', ['todo', 'claimed', 'in_progress'])
      .lte('due_date', today)
      .not('due_date', 'is', null);

    if (familyId) questQuery = questQuery.eq('family_id', familyId);
    const { data: quests, error: qErr } = await questQuery;
    if (qErr) throw new Error(`Quest fetch failed: ${qErr.message}`);

    // ── Fetch members for push token resolution ───────────────────────────────
    const familyIds = [...new Set((quests ?? []).map((q: any) => q.family_id).filter(Boolean))];
    const { data: members } = await supabase
      .from('members')
      .select('id, name, role, family_id, expo_push_token')
      .in('family_id', familyIds.length ? familyIds : ['__none__']);

    const memberMap: Record<string, any> = {};
    for (const m of (members ?? [])) memberMap[m.id] = m;

    // Collect parent tokens per family (for overdue/ghost alerts to parent)
    const parentTokensByFamily: Record<string, string[]> = {};
    for (const m of (members ?? [])) {
      if (m.role === 'parent' && m.expo_push_token) {
        if (!parentTokensByFamily[m.family_id]) parentTokensByFamily[m.family_id] = [];
        parentTokensByFamily[m.family_id].push(m.expo_push_token);
      }
    }

    const notifications: { type: string; questTitle: string; to: string; dryRun: boolean }[] = [];

    const now = Date.now();
    // `soft` — spec 7.5's "softer, delayed" tone for the minor+same-day
    // parent escalation: no sound, unlike every other push this sweeper
    // sends. family-notifier's buildMessage() only applies `sound:
    // 'default'` when the caller's payload doesn't already carry a sound
    // key for types that hardcode it in the switch (deadline_overdue does),
    // so this alone isn't enough to silence deadline_overdue's own
    // hardcoded sound — passed through as an explicit payload field so a
    // future softer-tone rendering can key off it without new plumbing.
    const fire = async (type: string, tokens: string[], fId: string, payload: Record<string, unknown>, opts?: { soft?: boolean }) => {
      notifications.push({ type, questTitle: payload.questTitle as string, to: tokens.join(','), dryRun });
      if (dryRun) return;
      await fetch(notifierUrl, {
        method: 'POST',
        headers: notifierHeaders,
        body: JSON.stringify({
          type, tokens, familyId: fId,
          payload: opts?.soft ? { ...payload, soft: true } : payload,
          persist: true,
        }),
      });
    };

    for (const q of (quests ?? [])) {
      const assignee = q.assigned_to_id ? memberMap[q.assigned_to_id] : null;
      const daysOverdue = Math.max(0, Math.floor((now - new Date(q.due_date).getTime()) / 86400_000));
      const isHighPriority = q.priority === 'urgent' || q.priority === 'high';
      // 7.5 — parent escalation is about WHO holds the chore and HOW LATE
      // it is, not how the chore happened to be flagged. Raw DB role
      // values (see store/familyStore.ts fromRow()/toRow()): a minor is
      // 'child' or 'teenager', never the app-level 'kid'/'teen'.
      const assigneeIsMinor = assignee?.role === 'child' || assignee?.role === 'teenager';
      const isSameDayMiss = daysOverdue === 0 || (q.due_date === today);
      const shouldEscalateToParent = assigneeIsMinor && isSameDayMiss;
      const parentTokens = parentTokensByFamily[q.family_id] ?? [];
      const kidTokens = assignee?.expo_push_token ? [assignee.expo_push_token] : [];

      // ── status=todo, not pool, due today or overdue → remind the kid ────────
      if (q.status === 'todo' && !q.is_pool) {
        if (daysOverdue === 0) {
          await fire('deadline_reminder', kidTokens, q.family_id, { questTitle: q.title, questId: q.id, coins: q.coins });
        } else {
          // Overdue + unstarted → warn kid + a softer, delayed heads-up to
          // parents, but only when the assignee is a minor and the miss is
          // same-day — a next-week chore that's merely high-priority
          // shouldn't escalate, and a parent/senior's own self-assigned
          // task never should.
          await fire('deadline_overdue', kidTokens, q.family_id, { questTitle: q.title, questId: q.id, daysOverdue });
          if (shouldEscalateToParent) {
            await fire('deadline_overdue', parentTokens, q.family_id, { questTitle: q.title, questId: q.id, daysOverdue, kidName: assignee?.name ?? 'A kid' }, { soft: true });
          }
        }
      }

      // ── status=claimed + overdue → ghosting alert ─────────────────────────
      if (q.status === 'claimed') {
        await fire('chore_ghosted', parentTokens, q.family_id, {
          questTitle: q.title, questId: q.id,
          kidName: assignee?.name ?? 'A kid', daysOverdue,
        });
        // Poke the kid too — they may have forgotten
        if (kidTokens.length) {
          await fire('deadline_overdue', kidTokens, q.family_id, { questTitle: q.title, questId: q.id, daysOverdue });
        }
      }

      // ── status=in_progress + stuck >4h + overdue ──────────────────────────
      if (q.status === 'in_progress' && q.claimed_at) {
        const hoursStuck = (now - new Date(q.claimed_at).getTime()) / 3600_000;
        if (hoursStuck > 4) {
          await fire('deadline_overdue', kidTokens, q.family_id, { questTitle: q.title, questId: q.id, daysOverdue });
          if (isHighPriority && parentTokens.length) {
            await fire('chore_ghosted', parentTokens, q.family_id, {
              questTitle: q.title, questId: q.id,
              kidName: assignee?.name ?? 'A kid', daysOverdue,
            });
          }
        }
      }

      // ── bonus expiring soon (<30 min) → urgency push ─────────────────────
      if (q.bonus_coins > 0 && q.bonus_expires_at) {
        const msLeft = new Date(q.bonus_expires_at).getTime() - now;
        if (msLeft > 0 && msLeft < 30 * 60_000) {
          const minutesLeft = Math.ceil(msLeft / 60_000);
          await fire('bonus_expiring', kidTokens, q.family_id, { questTitle: q.title, questId: q.id, minutesLeft, bonusCoins: q.bonus_coins });
        }
      }
    }

    return json({ ok: true, swept: (quests ?? []).length, notifications, dryRun });

  } catch (e: any) {
    console.error('[chore-deadline-notifier]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
