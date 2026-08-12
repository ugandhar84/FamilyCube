// FamilyCube — Edge Function: quest-sweep-cron
// Runs on a schedule (every hour via Supabase cron or pg_cron).
// Sweeps ALL families for:
//   - overdue / ghosted / stuck quests  → chore-deadline-notifier
//   - bonus expiring <30min             → bonus_expiring push
//   - bonus expired but quest undone    → mark for FOMO escalation
//   - completed quests older than 7d   → auto-archive
//
// Cron schedule (set in Supabase Dashboard → Edge Functions → Schedule):
//   every hour: 0 * * * *
//   morning FOMO sweep: 0 9 * * *
//
// Deploy: supabase functions deploy quest-sweep-cron
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false, familyId } = body as { dryRun?: boolean; familyId?: string };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now   = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const baseUrl = Deno.env.get('SUPABASE_URL')!;
    const authHeader = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` };

    const call = (fn: string, body: unknown) =>
      dryRun ? Promise.resolve() :
      fetch(`${baseUrl}/functions/v1/${fn}`, { method: 'POST', headers: authHeader, body: JSON.stringify(body) })
        .catch(e => console.warn(`[sweep] ${fn} failed:`, e.message));

    // ── 1. Fetch all open quests ──────────────────────────────────────────────
    let q = supabase
      .from('quests')
      .select('id, title, coins, priority, status, due_date, assigned_to_id, claimed_at, bonus_coins, bonus_expires_at, is_pool, family_id, completed_at, deleted_at')
      .in('status', ['todo', 'claimed', 'in_progress', 'done', 'approved'])
      .is('deleted_at', null);
    if (familyId) q = q.eq('family_id', familyId);
    const { data: quests, error } = await q;
    if (error) throw new Error(`Quest fetch: ${error.message}`);

    const report = {
      total: quests?.length ?? 0,
      deadlineSwept:   0,
      bonusExpiring:   0,
      bonusExpiredFlag: 0,
      autoArchived:    0,
      fomoEscalated:   0,
      dryRun,
    };

    // Group by family for deadline notifier
    const byFamily: Record<string, any[]> = {};
    for (const quest of (quests ?? [])) {
      if (!byFamily[quest.family_id]) byFamily[quest.family_id] = [];
      byFamily[quest.family_id].push(quest);
    }

    for (const [fId, fQuests] of Object.entries(byFamily)) {
      // ── 2. Deadline / ghost sweep per family ─────────────────────────────
      const hasIssues = fQuests.some(q =>
        ['todo', 'claimed', 'in_progress'].includes(q.status) && q.due_date && q.due_date <= today
      );
      if (hasIssues) {
        await call('chore-deadline-notifier', { familyId: fId, dryRun });
        report.deadlineSwept++;
      }

      for (const q of fQuests) {
        // ── 3. Bonus expiring <30 min → already handled in chore-deadline-notifier
        //       but flag in report
        if (q.bonus_coins > 0 && q.bonus_expires_at) {
          const msLeft = new Date(q.bonus_expires_at).getTime() - now;
          if (msLeft > 0 && msLeft < 30 * 60_000) report.bonusExpiring++;

          // ── 4. Bonus expired + quest still not done → mark for FOMO escalation
          //       We don't auto-apply penalty here — that's parent-triggered via AI button.
          //       But we log it so the parent sees the badge next time they open Quests.
          if (msLeft <= 0 && ['todo', 'claimed', 'in_progress'].includes(q.status)) {
            report.bonusExpiredFlag++;
            // Optionally: fire a parent notification that the bonus expired unfulfilled
            await call('family-notifier', {
              type: 'bonus_expired_penalty',
              memberIds: [], // will look up parents by familyId inside notifier
              familyId: fId,
              persist: true,
              payload: {
                questId: q.id, questTitle: q.title,
                coinPenalty: 0, // informational only — parent decides penalty via AI
              },
            });
          }
        }

        // ── 5. Auto-archive done/approved quests older than 7 days ─────────
        if ((q.status === 'done' || q.status === 'approved') && q.completed_at) {
          const age = (now - new Date(q.completed_at).getTime()) / 86400_000;
          if (age >= 7) {
            report.autoArchived++;
            if (!dryRun) {
              await supabase
                .from('quests')
                .update({ status: 'archived', archived_at: new Date().toISOString() })
                .eq('id', q.id);
            }
          }
        }
      }
    }

    console.log('[quest-sweep-cron]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });

  } catch (e: any) {
    console.error('[quest-sweep-cron]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
