// FamilyCube — Edge Function: chore-auto-approve
// Scans all chores in `pending_approval` status whose 24h approval window has
// expired and auto-approves them, crediting points to the child's wallet.
//
// FIXED (was querying a `chores` table that does not exist anywhere in the
// live schema — confirmed via information_schema.tables, zero rows — plus a
// `reviewer_id`/`auto_approved`/`base_points` column set that doesn't exist
// on the real table either, and an insert into point_transactions using
// transaction_type='EARN' which violates that table's own check constraint
// (only 'EARNED' is valid) and a family_id column point_transactions doesn't
// have. This function has been silently no-op/erroring on every cron run
// since deployment — real chores were never actually auto-approved by it.
// Rewritten against chore_tasks (this app's real chore table) with verified
// column names.
//
// Cron schedule (Supabase Dashboard → Edge Functions → Schedule):
//   every 30 minutes: */30 * * * *
//
// Deploy: supabase functions deploy chore-auto-approve
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

    const now = new Date().toISOString();

    // ── 1. Fetch expired pending_approval chores ──────────────────────────────
    let q = supabase
      .from('chore_tasks')
      .select('id, title, assigned_to_id, family_id, coins_reward, redo_count, approval_window_expires_at, category_type')
      .eq('status', 'pending_approval')
      .lte('approval_window_expires_at', now);

    if (familyId) q = q.eq('family_id', familyId);

    const { data: expired, error: fetchErr } = await q;
    if (fetchErr) throw fetchErr;

    if (!expired || expired.length === 0) {
      return json({ auto_approved: 0, message: 'Nothing to auto-approve.' });
    }

    const approved: string[] = [];
    const errors: string[]   = [];

    for (const chore of expired) {
      if (dryRun) {
        approved.push(chore.id);
        continue;
      }

      // Mark chore as approved. reviewed_by_id stays null — an auto-approval
      // has no human reviewer, distinct from a parent explicitly approving.
      const { error: updateErr } = await supabase
        .from('chore_tasks')
        .update({
          status: 'auto_approved',
          reviewed_at: now,
          approved_at: now,
        })
        .eq('id', chore.id);

      if (updateErr) {
        errors.push(`${chore.id}: ${updateErr.message}`);
        continue;
      }

      // Credit points — split 50/40/10 Spend/Save/Give per spec
      const pts = chore.coins_reward ?? 0;
      if (pts > 0 && chore.assigned_to_id) {
        const spend = Math.round(pts * 0.5);
        const save  = Math.round(pts * 0.4);
        const give  = pts - spend - save;

        await supabase.from('point_transactions').insert({
          user_id:           chore.assigned_to_id,
          chore_instance_id: chore.id,
          transaction_type:  'EARNED',
          amount:            pts,
          spend_allocation:  spend,
          save_allocation:   save,
          give_allocation:   give,
          notes:             `Auto-approved: ${chore.title}`,
          created_at:        now,
        });

        // responsibility_history — same append-only audit trail the
        // Responsibility Engine writes to on every assignment/completion,
        // so an auto-approved chore shows up in fairness/effort scoring
        // the same as a manually-approved one.
        await supabase.from('responsibility_history').insert({
          family_id: chore.family_id,
          chore_id: chore.id,
          member_id: chore.assigned_to_id,
          category: chore.category_type ?? 'chore',
          responsibility_type: 'chore',
          outcome: 'completed',
          effort_points: pts,
          metadata: { auto_approved: true },
        });
      }

      approved.push(chore.id);
    }

    console.log(`[chore-auto-approve] approved=${approved.length} errors=${errors.length} dryRun=${dryRun}`);
    return json({ auto_approved: approved.length, approved_ids: approved, errors });

  } catch (err: any) {
    console.error('[chore-auto-approve] fatal:', err);
    return json({ error: err.message ?? String(err) }, 500);
  }
});
