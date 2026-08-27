// FamilyCube — Edge Function: quest-sweep-cron
// Runs on a schedule (every hour via Supabase cron or pg_cron).
// Sweeps ALL families for overdue / ghosted / stuck chores, delegating the
// actual reminder logic to chore-deadline-notifier (which already handles
// due-today, overdue, claimed-but-silent, and ghosted-claim cases itself).
//
// FIXED (same class of bug as chore-deadline-notifier's own header comment
// documents fixing for itself): this function queried a table literally
// named `quests`, which no client code anywhere in the app ever reads from
// or writes to — the app's real chore table has always been `chore_tasks`
// (store/choreStore.ts). Rewritten against chore_tasks with verified
// column names. The old bonus-expiring/FOMO-escalation/auto-archive
// branches read columns (`coins`, `priority`, `bonus_coins`,
// `bonus_expires_at`, `archived_at`) that don't exist on chore_tasks at
// all — those were `quests`-table-only concepts from before the app
// migrated to chore_tasks, with no real equivalent today, so they're
// dropped entirely rather than ported onto columns that don't exist.
// chore-deadline-notifier is the one part of this sweep that already
// targets the real table correctly — this function's only remaining job is
// to notice which families have anything overdue and delegate to it.
//
// Cron schedule (set in Supabase Dashboard → Edge Functions → Schedule):
//   every hour: 0 * * * *
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

    const today = new Date().toISOString().split('T')[0];
    const baseUrl = Deno.env.get('SUPABASE_URL')!;
    const authHeader = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` };

    const call = (fn: string, body: unknown) =>
      dryRun ? Promise.resolve() :
      fetch(`${baseUrl}/functions/v1/${fn}`, { method: 'POST', headers: authHeader, body: JSON.stringify(body) })
        .catch(e => console.warn(`[sweep] ${fn} failed:`, e.message));

    // ── 1. Fetch all open chores ────────────────────────────────────────────
    let q = supabase
      .from('chore_tasks')
      .select('id, title, status, due_date, family_id')
      .in('status', ['todo', 'in_progress']);
    if (familyId) q = q.eq('family_id', familyId);
    const { data: chores, error } = await q;
    if (error) throw new Error(`Chore fetch: ${error.message}`);

    const report = {
      total: chores?.length ?? 0,
      deadlineSwept: 0,
      dryRun,
    };

    // Group by family for deadline notifier
    const byFamily: Record<string, any[]> = {};
    for (const chore of (chores ?? [])) {
      if (!byFamily[chore.family_id]) byFamily[chore.family_id] = [];
      byFamily[chore.family_id].push(chore);
    }

    for (const [fId, fChores] of Object.entries(byFamily)) {
      // ── 2. Deadline / ghost sweep per family ─────────────────────────────
      const hasIssues = fChores.some(c => c.due_date && c.due_date <= today);
      if (hasIssues) {
        await call('chore-deadline-notifier', { familyId: fId, dryRun });
        report.deadlineSwept++;
      }
    }

    console.log('[quest-sweep-cron]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });

  } catch (e: any) {
    console.error('[quest-sweep-cron]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
