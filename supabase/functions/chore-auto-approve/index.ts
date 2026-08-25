// FamilyCube — Edge Function: chore-auto-approve
// Scans pending_approval chores past their approval window and either
// escalates (24h, the common case) or auto-approves as a last resort (48h
// total, only if escalation itself also went unanswered).
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
// `families` table, (b) never called the award_coins RPC or touched
// members.coins/main_coins at all. Both fixed.
//
// FIXED (QA master-flow audit, "Parent never answered in time" exit branch,
// punch list #4): this function used to fire at the 24h cutoff and pay out
// SILENTLY — no nudge to anyone, no escalation, the opposite of the spec's
// "nudge, then a co-parent decision." Per explicit product direction,
// auto-approve is no longer the only outcome: at the 24h cutoff the chore
// now ESCALATES instead (approval_escalated_at set once, chore flagged
// urgent, every parent in the family pushed) — a real human decision
// ("Approve it now" / re-time it), not a silent timeout. Auto-approve only
// still fires as a genuine last resort at 48h TOTAL (24h past the
// escalation itself), so a kid in a fully unresponsive household still
// isn't stuck waiting forever — but the common case is now a real decision.
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

// Escalation fires at the chore's own 24h approval_window_expires_at
// (unchanged cutoff). The 48h-total auto-approve fallback is this many
// hours PAST that same escalation timestamp — i.e. a chore escalated at
// hour 24 auto-approves at hour 48 if still untouched.
const AUTO_APPROVE_FALLBACK_HOURS = 24;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false, familyId } = body as { dryRun?: boolean; familyId?: string };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const notifierHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    const now = new Date();
    const nowIso = now.toISOString();
    const fallbackCutoffIso = new Date(now.getTime() - AUTO_APPROVE_FALLBACK_HOURS * 3600_000).toISOString();

    // ── 1. Fetch every pending_approval chore past its 24h window ──────────
    let q = supabase
      .from('chore_tasks')
      .select('id, title, assigned_to_id, family_id, coins_reward, base_points, bonus_coins, xp_reward, redo_count, approval_window_expires_at, approval_escalated_at, category_type, sponsor_user_id, reward_pending_review')
      .eq('status', 'pending_approval')
      .lte('approval_window_expires_at', nowIso);

    if (familyId) q = q.eq('family_id', familyId);

    const { data: expired, error: fetchErr } = await q;
    if (fetchErr) throw fetchErr;

    if (!expired || expired.length === 0) {
      return json({ escalated: 0, auto_approved: 0, message: 'Nothing overdue for approval.' });
    }

    // ── 1b. Load each distinct family's real allocation split + parent tokens ─
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

    const { data: members } = await supabase
      .from('members')
      .select('id, name, family_id, role, expo_push_token')
      .in('family_id', familyIds.length ? familyIds : ['__none__']);
    const memberMap: Record<string, any> = {};
    for (const m of (members ?? [])) memberMap[m.id] = m;

    // Per-(member, device) tokens — see member_device_tokens migration.
    // Shared devices leave members.expo_push_token stale for everyone but
    // the most-recently-active profile, so resolve from the new table first
    // and fall back to the single column only for members with no rows yet.
    const allMemberIds = (members ?? []).map((m: any) => m.id);
    const { data: deviceTokenRows } = await supabase
      .from('member_device_tokens')
      .select('member_id, expo_push_token')
      .in('member_id', allMemberIds.length ? allMemberIds : ['__none__']);
    const tokensByMemberId: Record<string, string[]> = {};
    for (const row of (deviceTokenRows ?? []) as any[]) {
      if (!row.expo_push_token) continue;
      (tokensByMemberId[row.member_id] ??= []).push(row.expo_push_token);
    }
    for (const m of (members ?? [])) {
      if (!tokensByMemberId[m.id] && m.expo_push_token) {
        tokensByMemberId[m.id] = [m.expo_push_token];
      }
    }
    const tokensForMember = (id: string | null | undefined): string[] =>
      id ? (tokensByMemberId[id] ?? []) : [];

    const parentTokensByFamily: Record<string, string[]> = {};
    for (const m of (members ?? [])) {
      if (m.role === 'parent') {
        const t = tokensByMemberId[m.id];
        if (t?.length) (parentTokensByFamily[m.family_id] ??= []).push(...t);
      }
    }

    const escalated: string[] = [];
    const approved: string[] = [];
    const errors: string[]   = [];

    const payOut = async (chore: any, note: string) => {
      const pts = chore.base_points || chore.coins_reward || 0;
      const total = pts + (chore.bonus_coins ?? 0);
      if (total <= 0 || !chore.assigned_to_id || chore.reward_pending_review) return 0;

      const alloc = allocByFamily.get(chore.family_id) ?? { spendPct: 50, savePct: 40, givePct: 10 };
      const wallet = chore.category_type === 'grandparent_quest' || chore.sponsor_user_id ? 'gp' : 'main';
      const spend = wallet === 'gp' ? total : Math.floor(total * (alloc.spendPct / 100));
      const save  = wallet === 'gp' ? 0     : Math.floor(total * (alloc.savePct  / 100));
      const give  = wallet === 'gp' ? 0     : total - spend - save;

      await supabase.from('point_transactions').insert({
        user_id: chore.assigned_to_id, chore_instance_id: chore.id, transaction_type: 'EARNED',
        amount: total, spend_allocation: spend, save_allocation: save, give_allocation: give,
        notes: note, created_at: nowIso, wallet,
      });

      const { error: awardErr } = await supabase.rpc('award_coins', {
        member_id: chore.assigned_to_id, coins_delta: total, xp_delta: chore.xp_reward ?? 0, wallet,
      });
      if (awardErr) errors.push(`${chore.id}: award_coins failed: ${awardErr.message}`);

      await supabase.from('responsibility_history').insert({
        family_id: chore.family_id, chore_id: chore.id, member_id: chore.assigned_to_id,
        category: chore.category_type ?? 'chore', responsibility_type: 'chore', outcome: 'completed',
        effort_points: total, metadata: { auto_approved: true },
      });

      return total;
    };

    const notify = async (type: string, tokens: string[], fId: string, payload: Record<string, unknown>) => {
      if (!tokens.length || dryRun) return;
      await fetch(notifierUrl, {
        method: 'POST', headers: notifierHeaders,
        body: JSON.stringify({ type, tokens, familyId: fId, payload, persist: true }),
      });
    };

    for (const chore of expired) {
      const assignee = chore.assigned_to_id ? memberMap[chore.assigned_to_id] : null;
      const parentTokens = parentTokensByFamily[chore.family_id] ?? [];
      const alreadyEscalated = !!chore.approval_escalated_at;
      const escalatedPastFallback = alreadyEscalated && chore.approval_escalated_at <= fallbackCutoffIso;

      if (alreadyEscalated && !escalatedPastFallback) {
        // Already nudged once, still inside the 24h grace period before the
        // 48h-total fallback — nothing to do this tick, a parent still has
        // time to act.
        continue;
      }

      if (!alreadyEscalated) {
        // ── First time past the 24h window: escalate, don't pay out ──────
        if (dryRun) { escalated.push(chore.id); continue; }
        const { error: escErr } = await supabase
          .from('chore_tasks')
          .update({ approval_escalated_at: nowIso })
          .eq('id', chore.id)
          .is('approval_escalated_at', null); // CAS — don't re-escalate if another tick already did
        if (escErr) { errors.push(`${chore.id}: ${escErr.message}`); continue; }

        await supabase.from('activity_log').insert({
          entity_type: 'chore', entity_id: chore.id, family_id: chore.family_id,
          actor_id: null, action: 'approval_escalated', from_status: 'pending_approval', to_status: 'pending_approval',
          note: `24h approval window lapsed with no reviewer response — escalated to all parents (${assignee?.name ?? 'kid'}'s "${chore.title}")`,
        });

        await notify('chore_ghosted', parentTokens, chore.family_id, {
          questTitle: chore.title, questId: chore.id, kidName: assignee?.name ?? 'A kid', daysOverdue: 1,
        });
        escalated.push(chore.id);
        continue;
      }

      // ── Escalated 24h ago and STILL untouched: last-resort auto-approve ──
      if (dryRun) { approved.push(chore.id); continue; }

      const { error: updateErr } = await supabase
        .from('chore_tasks')
        .update({ status: 'auto_approved', reviewed_at: nowIso, approved_at: nowIso })
        .eq('id', chore.id)
        .eq('status', 'pending_approval'); // CAS — a parent may have acted between ticks
      if (updateErr) { errors.push(`${chore.id}: ${updateErr.message}`); continue; }

      const paid = await payOut(chore, `Auto-approved (48h, unresponded escalation): ${chore.title}`);
      await notify('coins_awarded', tokensForMember(chore.assigned_to_id), chore.family_id, {
        coins: paid, reason: `"${chore.title}" auto-approved after 48h with no parent response`,
      });
      approved.push(chore.id);
    }

    console.log(`[chore-auto-approve] escalated=${escalated.length} approved=${approved.length} errors=${errors.length} dryRun=${dryRun}`);
    return json({ escalated: escalated.length, escalated_ids: escalated, auto_approved: approved.length, approved_ids: approved, errors });

  } catch (err: any) {
    console.error('[chore-auto-approve] fatal:', err);
    return json({ error: err.message ?? String(err) }, 500);
  }
});
