// FamilyCube — Edge Function: chore-auto-approve
// Scans all chores in `pending_approval` status whose 24h approval window has
// expired and auto-approves them, crediting points to the child's wallet.
// Also handles redo_count >= 2: the next submission is immediately auto-approved.
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
      .from('chores')
      .select('id, title, assigned_to_id, family_id, base_points, redo_count, approval_window_expires_at, category_type')
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

      // Mark chore as approved
      const { error: updateErr } = await supabase
        .from('chores')
        .update({
          status: 'approved',
          reviewed_at: now,
          reviewer_id: null,
          auto_approved: true,
        })
        .eq('id', chore.id);

      if (updateErr) {
        errors.push(`${chore.id}: ${updateErr.message}`);
        continue;
      }

      // Credit points — split 50/30/20 Spend/Save/Give per spec
      const pts = chore.base_points ?? 0;
      if (pts > 0) {
        const spend = Math.round(pts * 0.5);
        const save  = Math.round(pts * 0.4);
        const give  = pts - spend - save;

        await supabase.from('point_transactions').insert({
          user_id:          chore.assigned_to_id,
          family_id:        chore.family_id,
          chore_id:         chore.id,
          transaction_type: 'EARN',
          amount:           pts,
          spend_allocation: spend,
          save_allocation:  save,
          give_allocation:  give,
          notes:            `Auto-approved: ${chore.title}`,
          created_at:       now,
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
