// FamilyCube — Edge Function: chore-streak-cron
// Runs daily at 11:59 PM to evaluate each child's streak for the day.
// A day "counts" when the child completed at least one citizenship OR routine
// chore. If they did, increment streak_count; otherwise reset to 0.
// Also awards streak badges at milestones (3, 7, 14, 30 days).
//
// Cron schedule (Supabase Dashboard → Edge Functions → Schedule):
//   59 23 * * *   (11:59 PM UTC daily)
//
// Deploy: supabase functions deploy chore-streak-cron
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STREAK_MILESTONES = [3, 7, 14, 30];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false, familyId, targetDate } = body as {
      dryRun?: boolean; familyId?: string; targetDate?: string;
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = targetDate ?? new Date().toISOString().split('T')[0];
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd   = `${today}T23:59:59.999Z`;

    // ── 1. Fetch all kid/teen members ─────────────────────────────────────────
    let mq = supabase
      .from('family_members')
      .select('id, family_id, streak_count, badges')
      .in('role', ['kid', 'teen']);

    if (familyId) mq = mq.eq('family_id', familyId);

    const { data: members, error: memberErr } = await mq;
    if (memberErr) throw memberErr;
    if (!members || members.length === 0) return json({ processed: 0 });

    const results: Array<{ memberId: string; newStreak: number; badgeAwarded?: string }> = [];

    for (const member of members) {
      // ── 2. Check if they completed a citizenship or routine chore today ─────
      const { data: completions, error: choreErr } = await supabase
        .from('chores')
        .select('id')
        .eq('assigned_to_id', member.id)
        .eq('status', 'approved')
        .in('category_type', ['citizenship', 'routine'])
        .gte('reviewed_at', todayStart)
        .lte('reviewed_at', todayEnd)
        .limit(1);

      if (choreErr) {
        console.warn(`[streak-cron] member ${member.id} chore fetch error:`, choreErr.message);
        continue;
      }

      const completedToday = (completions?.length ?? 0) > 0;
      const currentStreak  = member.streak_count ?? 0;
      const newStreak      = completedToday ? currentStreak + 1 : 0;

      // ── 3. Check badge milestone ──────────────────────────────────────────
      let badgeAwarded: string | undefined;
      if (completedToday && STREAK_MILESTONES.includes(newStreak)) {
        badgeAwarded = `streak_${newStreak}`;
      }

      if (!dryRun) {
        const existingBadges: string[] = member.badges ?? [];
        const updatedBadges = badgeAwarded && !existingBadges.includes(badgeAwarded)
          ? [...existingBadges, badgeAwarded]
          : existingBadges;

        const { error: updateErr } = await supabase
          .from('family_members')
          .update({
            streak_count: newStreak,
            badges: updatedBadges,
          })
          .eq('id', member.id);

        if (updateErr) {
          console.warn(`[streak-cron] update failed for ${member.id}:`, updateErr.message);
          continue;
        }

        // ── 4. Send push notification for badge milestone ─────────────────
        if (badgeAwarded) {
          const baseUrl = Deno.env.get('SUPABASE_URL')!;
          const authHeader = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          };
          await fetch(`${baseUrl}/functions/v1/family-notifier`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
              userId: member.id,
              familyId: member.family_id,
              type: 'streak_badge',
              title: `🔥 ${newStreak}-Day Streak!`,
              body: `You've kept your streak going for ${newStreak} days in a row. Keep it up!`,
              meta: { streak: newStreak, badge: badgeAwarded },
            }),
          }).catch(e => console.warn('[streak-cron] notify failed:', e.message));
        }
      }

      results.push({ memberId: member.id, newStreak, badgeAwarded });
    }

    console.log(`[chore-streak-cron] processed=${results.length} dryRun=${dryRun} date=${today}`);
    return json({ processed: results.length, results, dryRun });

  } catch (err: any) {
    console.error('[chore-streak-cron] fatal:', err);
    return json({ error: err.message ?? String(err) }, 500);
  }
});
