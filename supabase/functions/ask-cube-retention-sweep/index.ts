// FamilyCube — Edge Function: ask-cube-retention-sweep
// Runs on a schedule (Supabase pg_cron, see
// supabase/migrations/20260901100000_ask_cube_retention_sweep_cron.sql).
// HARD DELETES ask_cube_conversations rows older than each family's
// configured retention window (families.ask_cube_retention_days, default 7)
// — not a soft-hide, and not a read-time filter, per explicit product
// decision: old Ask Cube history should actually stop existing, freeing
// storage, rather than just being hidden from the list UI.
//
// ask_cube_messages cascades automatically (ON DELETE CASCADE FK to
// ask_cube_conversations.id — see 20260818233000_ask_cube_conversations.sql),
// so deleting the conversation row is sufficient; no explicit message delete
// needed.
//
// "Older than" is judged by updated_at (last activity), not created_at — an
// active back-and-forth conversation shouldn't get swept out from under the
// user just because it started 8 days ago; only a conversation that's been
// untouched for the full window is stale.
//
// Cron schedule: daily at 03:30 UTC (ask-cube-retention-sweep-daily).
// Deploy: supabase functions deploy ask-cube-retention-sweep
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const DEFAULT_RETENTION_DAYS = 7;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false, familyId } = body as { dryRun?: boolean; familyId?: string };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Per-family retention window — most families use the default, but this
    // reads whatever's actually configured rather than hardcoding 7 here too.
    let famQuery = supabase.from('families').select('id, ask_cube_retention_days');
    if (familyId) famQuery = famQuery.eq('id', familyId);
    const { data: families, error: famErr } = await famQuery;
    if (famErr) throw new Error(`families fetch: ${famErr.message}`);

    const report = { familiesScanned: families?.length ?? 0, conversationsDeleted: 0, dryRun };

    // Was one SELECT + one DELETE per family, every run, regardless of
    // whether that family actually has anything stale — ~2×(family count)
    // round-trips daily. Nearly every family uses the default retention
    // window, so split into: one batched query covering every
    // default-retention family (single cutoff, .in('family_id', ids)), and
    // a per-family loop only for the rare custom-retention override —
    // every family still gets the exact same cutoff logic it did before,
    // just batched wherever the cutoff is shared.
    const defaultFamilyIds: string[] = [];
    const customFamilies: { id: string; retentionDays: number }[] = [];
    for (const fam of families ?? []) {
      if (fam.ask_cube_retention_days == null || fam.ask_cube_retention_days === DEFAULT_RETENTION_DAYS) {
        defaultFamilyIds.push(fam.id);
      } else {
        customFamilies.push({ id: fam.id, retentionDays: fam.ask_cube_retention_days });
      }
    }

    const deleteStaleForCutoff = async (familyIds: string[], cutoff: string) => {
      if (familyIds.length === 0) return;
      const { data: stale, error: staleErr } = await supabase
        .from('ask_cube_conversations')
        .select('id')
        .in('family_id', familyIds)
        .lt('updated_at', cutoff);
      if (staleErr) { console.warn('[ask-cube-retention-sweep] scan failed', staleErr.message); return; }
      if (!stale?.length) return;

      report.conversationsDeleted += stale.length;
      if (dryRun) return;

      const { error: delErr } = await supabase
        .from('ask_cube_conversations')
        .delete()
        .in('id', stale.map(s => s.id));
      if (delErr) console.warn('[ask-cube-retention-sweep] delete failed', delErr.message);
    };

    if (defaultFamilyIds.length > 0) {
      const cutoff = new Date(Date.now() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60_000).toISOString();
      await deleteStaleForCutoff(defaultFamilyIds, cutoff);
    }
    for (const fam of customFamilies) {
      const cutoff = new Date(Date.now() - fam.retentionDays * 24 * 60 * 60_000).toISOString();
      await deleteStaleForCutoff([fam.id], cutoff);
    }

    console.log('[ask-cube-retention-sweep]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });
  } catch (e: any) {
    console.error('[ask-cube-retention-sweep] error', e?.message);
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});
