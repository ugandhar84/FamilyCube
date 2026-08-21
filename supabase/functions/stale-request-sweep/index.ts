// FamilyCube — Edge Function: stale-request-sweep
// Runs on a schedule (Supabase cron). Deletes a kid's ride/event request
// (KidRequestModal / EventFormModal's isKid path) that a parent never
// approved AND whose own event time has already passed by more than 24
// hours — the request is stale (the moment it was for has come and gone
// with nobody acting on it), so it's cleaned up rather than sitting
// forever in approvalPending limbo. Only ever touches rows that are still
// approvalPending=true — anything a parent has approved, declined, or
// otherwise acted on is untouched no matter how old.
//
// Cron schedule (set in Supabase Dashboard → Edge Functions → Schedule):
//   every hour: 0 * * * *
//
// Deploy: supabase functions deploy stale-request-sweep
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

    const now = Date.now();
    const GRACE_MS = 24 * 60 * 60_000;

    // Only still-pending requests are ever candidates — an approved/
    // declined/otherwise-actioned event is never touched by this sweep,
    // regardless of age.
    let q = supabase
      .from('calendar_events')
      .select('id, title, date, start_time, member_id, family_id, approval_pending')
      .eq('approval_pending', true)
      .is('deleted_at', null);
    if (familyId) q = q.eq('family_id', familyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(`fetch: ${error.message}`);

    const stale = (rows ?? []).filter(r => {
      if (!r.date) return false;
      const eventMs = new Date(`${r.date}T${r.start_time ?? '00:00'}:00`).getTime();
      if (Number.isNaN(eventMs)) return false;
      return now - eventMs > GRACE_MS;
    });

    const report = { scanned: rows?.length ?? 0, deleted: 0, dryRun };

    for (const r of stale) {
      report.deleted++;
      if (dryRun) continue;
      const { error: delErr } = await supabase.from('calendar_events').delete().eq('id', r.id);
      if (delErr) { console.warn('[stale-request-sweep] delete failed', r.id, delErr.message); continue; }
      // Best-effort audit trail entry — matches the shared activity_log
      // system (lib/activityLog.ts) other event mutations already write
      // to, so a parent looking at a kid's history isn't left wondering
      // where an old request went.
      await supabase.from('activity_log').insert({
        entity_type: 'event', entity_id: r.id, family_id: r.family_id,
        actor_id: null, action: 'deleted', note: 'Auto-removed: never approved, 24h past its time',
      }).then(() => {}).catch(() => {});
    }

    console.log('[stale-request-sweep]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });

  } catch (e: any) {
    console.error('[stale-request-sweep]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
