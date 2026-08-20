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
// FIXED (round 3 audit): this function also (a) hardcoded a 50/40/10
// Spend/Save/Give split instead of reading each family's actual
// spend_allocation_pct/save_allocation_pct/give_allocation_pct from the
// `families` table — a parent-approved chore (store/choreStore.ts
// awardPoints → calculateJarSplit) always used the family's live settings,
// but a chore that instead timed out and was auto-approved by this cron
// silently used the default split forever, even after a parent changed
// their household's allocation percentages. This only ever showed up once a
// family strayed from the 50/40/10 default, which is exactly why it went
// unnoticed. (b) never called the award_coins RPC or touched
// members.coins/main_coins at all — it only inserted a point_transactions
// row, so an auto-approved chore's points showed up in the jar-balance view
// (which sums point_transactions) but never actually credited the kid's
// spendable Perks Store wallet (members.main_coins), permanently
// under-crediting it relative to a manually-approved chore, which pays out
// through both paths via choreStore's awardPoints. Both are fixed below:
// the split now reads the family's row from `families`, and each payout now
// also calls award_coins so member.coins/main_coins/xp move in lockstep
// with a manual approval, exactly like migration 20260817000007 established.
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

    // ── 1b. Load each distinct family's real allocation split ────────────────
    // Previously hardcoded to 50/40/10 regardless of what a parent actually
    // configured in Household Settings (families.spend/save/give_allocation_pct).
    const familyIds = [...new Set(expired.map(c => c.family_id).filter(Boolean))];
    const { data: families, error: famErr } = familyIds.length
      ? await supabase
          .from('families')
          .select('id, spend_allocation_pct, save_allocation_pct, give_allocation_pct')
          .in('id', familyIds)
      : { data: [], error: null };
    if (famErr) console.warn('[chore-auto-approve] failed to load family allocation settings:', famErr.message);
    const allocByFamily = new Map<string, { spendPct: number; savePct: number; givePct: number }>(
      (families ?? []).map(f => [f.id, {
        spendPct: f.spend_allocation_pct ?? 50,
        savePct:  f.save_allocation_pct  ?? 40,
        givePct:  f.give_allocation_pct  ?? 10,
      }]),
    );

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

      // Credit points — split using the family's real, current allocation
      // settings (falls back to the 50/40/10 default only if the family row
      // wasn't found/loaded, matching HouseholdSettings' own defaults).
      const pts = chore.coins_reward ?? 0;
      if (pts > 0 && chore.assigned_to_id) {
        const alloc = allocByFamily.get(chore.family_id) ?? { spendPct: 50, savePct: 40, givePct: 10 };
        const spend = Math.floor(pts * (alloc.spendPct / 100));
        const save  = Math.floor(pts * (alloc.savePct  / 100));
        const give  = pts - spend - save; // remainder ensures sum = pts, same as calculateJarSplit client-side

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

        // Actually credit the kid's spendable wallet. point_transactions
        // alone only feeds the jar-balance view (getMemberBalance sums it) —
        // members.coins/main_coins (what the Perks Store and Kid Hub
        // balance actually read) is a separate column the award_coins RPC
        // is responsible for, and this function used to never call it,
        // silently leaving an auto-approved chore's payout invisible in the
        // Store while still counting in the jar-balance breakdown.
        const { error: awardErr } = await supabase.rpc('award_coins', {
          member_id:   chore.assigned_to_id,
          coins_delta: pts,
          xp_delta:    0,
        });
        if (awardErr) errors.push(`${chore.id}: award_coins failed: ${awardErr.message}`);

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
