// FamilyCube — Edge Function: visit-audio-sweeper
// Appointment recordings are uploaded (unencrypted) to the private `medical-audio` bucket when recording stops, and the
// app deletes them once the AI summary is approved. This nightly sweep is the safety net for everything the app could
// not finish:
//   • an approved visit whose audio delete failed (file_path still set)  -> delete the file, clear the reference
//   • a recording nobody submitted or deleted for more than 7 days         -> delete the file AND the empty record
// Cron: nightly (see the migration that schedules it). Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STALE_DAYS = 7;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  const { data: rows, error } = await admin.from('medical_records')
    .select('id, file_path, ai_analyzed, created_at')
    .eq('tag', 'visit_recording').not('file_path', 'is', null);
  if (error) return json({ ok: false, error: error.message }, 500);

  let clearedApproved = 0, deletedStale = 0, failed = 0;
  for (const r of rows ?? []) {
    const stale = !r.ai_analyzed && r.created_at < cutoff;
    if (!r.ai_analyzed && !stale) continue; // still waiting for the person to submit or delete it
    const { error: rmErr } = await admin.storage.from('medical-audio').remove([r.file_path]);
    if (rmErr) { failed++; continue; }
    if (r.ai_analyzed) {
      await admin.from('medical_records').update({ file_path: null, file_name: null, file_size: null }).eq('id', r.id);
      clearedApproved++;
    } else {
      await admin.from('medical_records').delete().eq('id', r.id);
      deletedStale++;
    }
  }
  return json({ ok: true, scanned: rows?.length ?? 0, clearedApproved, deletedStale, failed });
});
