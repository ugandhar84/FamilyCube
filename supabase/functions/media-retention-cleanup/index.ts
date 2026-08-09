// PawBond — Edge Function: media-retention-cleanup
// Runs nightly via pg_cron. Reads every ENABLED row in media_retention_config
// and, for each one, deletes the storage object + nulls the media column(s)
// on any DB row older than that category's retain_days — the underlying
// record (mood log, feeding log, social post, etc.) is kept; only the media
// attached to it is removed.
//
// This is the first actual consumer of media_retention_config — the admin
// screen (/admin/media-retention) has always let admins configure retention
// rules, but until this function nothing ever enforced them for ANY category.
//
// Schedule (run once after deploying):
//   SELECT cron.schedule(
//     'media-retention-cleanup',
//     '0 0 * * *',  -- every day at 00:00 UTC
//     $$SELECT net.http_post(
//       url := current_setting('app.supabase_url') || '/functions/v1/media-retention-cleanup',
//       headers := jsonb_build_object(
//         'Content-Type','application/json',
//         'Authorization','Bearer ' || current_setting('app.service_role_key')
//       ),
//       body := '{}'::jsonb
//     )$$
//   );
//
// Deploy: supabase functions deploy media-retention-cleanup

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RetentionConfig {
  id: number;
  category: string;
  label: string;
  enabled: boolean;
  retain_days: number;
  table_name: string;
  column_name: string;
  video_column_name: string | null;
  date_column: string;
}

// Extracts the storage path from a public Supabase Storage URL, e.g.
// ".../storage/v1/object/public/pets/users/abc/social/123.mp4" → "users/abc/social/123.mp4"
function pathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CRON_SECRET = Deno.env.get('CRON_SECRET');
  const incoming    = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const validToken  = CRON_SECRET ? incoming === CRON_SECRET : incoming === SERVICE_KEY;
  if (!validToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: configs, error: cfgErr } = await db
      .from('media_retention_config')
      .select('*')
      .eq('enabled', true);
    if (cfgErr) throw cfgErr;

    if (!configs?.length) {
      console.log('[media-retention] no enabled categories — nothing to do');
      return new Response(JSON.stringify({ processed: 0, categories: [] }), { status: 200 });
    }

    const bucket = 'pets'; // all media in this app lives in the 'pets' storage bucket
    const results: Record<string, { rows: number; storageDeleted: number }> = {};

    for (const cfg of configs as RetentionConfig[]) {
      const cutoff = new Date(Date.now() - cfg.retain_days * 24 * 60 * 60 * 1000).toISOString();
      let rowsCleared = 0;
      let storageDeleted = 0;

      try {
        // Build the "has media" filter across whichever column(s) this category uses.
        const orFilter = cfg.video_column_name
          ? `${cfg.column_name}.not.is.null,${cfg.video_column_name}.not.is.null`
          : `${cfg.column_name}.not.is.null`;

        const cols = ['id', cfg.column_name, cfg.date_column];
        if (cfg.video_column_name) cols.push(cfg.video_column_name);

        const { data: rows, error: selErr } = await db
          .from(cfg.table_name)
          .select(cols.join(','))
          .lt(cfg.date_column, cutoff)
          .or(orFilter)
          .limit(500); // one run clears up to 500/category; next night catches the rest

        if (selErr) throw selErr;
        if (!rows?.length) {
          console.log(`[media-retention] ${cfg.category}: nothing older than ${cfg.retain_days}d`);
          results[cfg.category] = { rows: 0, storageDeleted: 0 };
          continue;
        }

        for (const row of rows as any[]) {
          const update: Record<string, null> = {};
          const paths: string[] = [];

          const photoUrl = row[cfg.column_name] as string | null;
          if (photoUrl) {
            const p = pathFromPublicUrl(photoUrl, bucket);
            if (p) paths.push(p);
            update[cfg.column_name] = null;
          }
          if (cfg.video_column_name) {
            const videoUrl = row[cfg.video_column_name] as string | null;
            if (videoUrl) {
              const p = pathFromPublicUrl(videoUrl, bucket);
              if (p) paths.push(p);
              update[cfg.video_column_name] = null;
            }
          }

          if (paths.length) {
            const { error: rmErr } = await db.storage.from(bucket).remove(paths);
            if (rmErr) {
              console.warn(`[media-retention] ${cfg.category}: storage remove failed for row ${row.id}:`, rmErr.message);
              continue; // Don't null the DB column when storage delete failed — file would become an unrecoverable orphan
            }
            storageDeleted += paths.length;
          }

          const { error: updErr } = await db.from(cfg.table_name).update(update).eq('id', row.id);
          if (updErr) console.warn(`[media-retention] ${cfg.category}: DB update failed for row ${row.id}:`, updErr.message);
          else rowsCleared++;
        }

        console.log(`[media-retention] ${cfg.category}: cleared ${rowsCleared} row(s), removed ${storageDeleted} storage object(s)`);
        results[cfg.category] = { rows: rowsCleared, storageDeleted };
      } catch (e: any) {
        console.error(`[media-retention] ${cfg.category} failed:`, e.message);
        results[cfg.category] = { rows: rowsCleared, storageDeleted };
      }
    }

    return new Response(JSON.stringify({ processed: configs.length, results }), { status: 200 });
  } catch (err: any) {
    console.error('[media-retention] fatal error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
