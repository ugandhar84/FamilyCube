// PawBond — Edge Function: purge-deleted-accounts
// Runs daily via pg_cron. Permanently deletes accounts that were soft-deleted
// more than 30 days ago and whose owners never logged back in.
//
// Schedule (run once after deploying):
//   SELECT cron.schedule(
//     'purge-deleted-accounts',
//     '0 3 * * *',
//     $$SELECT net.http_post(
//       url := current_setting('app.supabase_url') || '/functions/v1/purge-deleted-accounts',
//       headers := jsonb_build_object(
//         'Content-Type','application/json',
//         'Authorization','Bearer ' || current_setting('app.service_role_key')
//       ),
//       body := '{}'::jsonb
//     )$$
//   );
//
// Deploy: supabase functions deploy purge-deleted-accounts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  // Only accept calls bearing the service role key or a dedicated CRON_SECRET
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CRON_SECRET  = Deno.env.get('CRON_SECRET');
  const incoming     = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const validToken   = CRON_SECRET ? incoming === CRON_SECRET : incoming === SERVICE_KEY;
  if (!validToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    // Find accounts soft-deleted more than 30 days ago
    const { data: expired, error } = await db
      .from('profiles')
      .select('id')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff);

    if (error) throw error;
    if (!expired?.length) {
      console.log('[purge-deleted-accounts] nothing to purge');
      return new Response(JSON.stringify({ purged: 0 }), { status: 200 });
    }

    console.log(`[purge-deleted-accounts] purging ${expired.length} account(s)`);

    // Helper: list and remove all files under a storage prefix
    const purgePrefix = async (bucket: string, prefix: string) => {
      const { data: files } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
      if (!files?.length) return;
      const paths = files.map((f: { name: string }) => `${prefix}/${f.name}`);
      await db.storage.from(bucket).remove(paths);
    };

    let purged = 0;
    for (const { id: userId } of expired) {
      try {
        // Fetch pets for storage cleanup
        const { data: pets } = await db
          .from('pets')
          .select('id')
          .eq('owner_id', userId);

        const petIds: string[] = (pets ?? []).map((p: { id: string }) => p.id);

        // Delete storage: pets bucket (avatars + gallery per pet + user avatar)
        for (const petId of petIds) {
          await purgePrefix('pets', `${petId}/avatar`);
          await purgePrefix('pets', `${petId}/gallery`);
        }
        await purgePrefix('pets', `${userId}/avatar`);

        // Delete storage: health records + social photos (both stored in 'pets' bucket)
        await purgePrefix('health-records', userId);
        // Social photos are in pets bucket at users/<userId>/social/
        await purgePrefix('pets', `users/${userId}/social`);
        // User avatar in pets bucket at users/<userId>/avatar/
        await purgePrefix('pets', `users/${userId}/avatar`);

        // Hard-delete auth user — cascades all DB rows via ON DELETE CASCADE
        const { error: deleteErr } = await db.auth.admin.deleteUser(userId);
        if (deleteErr) {
          console.error(`[purge-deleted-accounts] deleteUser(${userId}) failed:`, deleteErr.message);
          continue;
        }

        purged++;
        console.log(`[purge-deleted-accounts] ✅ purged user=${userId}`);
      } catch (e: any) {
        console.error(`[purge-deleted-accounts] error for user=${userId}:`, e.message);
      }
    }

    return new Response(JSON.stringify({ purged }), { status: 200 });
  } catch (err: any) {
    console.error('[purge-deleted-accounts] fatal error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
