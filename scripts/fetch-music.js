/**
 * One-time script: downloads ~100 royalty-free tracks from Pixabay Music
 * (CC0, no attribution, commercial use OK) and uploads them to Supabase Storage.
 *
 * Usage:
 *   PIXABAY_KEY=your_key SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=service_role_key node scripts/fetch-music.js
 *
 * After running:
 *   1. Rows will be inserted into the `music_tracks` table.
 *   2. Files will live at storage bucket "music" → /tracks/<category>/<id>.mp3
 *
 * Requires:
 *   npm install node-fetch @supabase/supabase-js
 */

const fetch      = (...a) => import('node-fetch').then(m => m.default(...a));
const { createClient } = require('@supabase/supabase-js');

const PIXABAY_KEY      = process.env.PIXABAY_KEY;
const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;

if (!PIXABAY_KEY || !SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('Missing env: PIXABAY_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// Pixabay category → our mood category + search term
const CATEGORIES = [
  { mood: 'upbeat',    query: 'happy upbeat fun',       perPage: 25 },
  { mood: 'calm',      query: 'relaxing calm peaceful',  perPage: 25 },
  { mood: 'nostalgic', query: 'nostalgic cinematic',     perPage: 25 },
  { mood: 'tender',    query: 'soft tender emotional',   perPage: 25 },
];

async function fetchPixabayMusic(query, perPage) {
  const url = `https://pixabay.com/api/music/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=${perPage}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay error: ${res.status}`);
  const { hits } = await res.json();
  return hits ?? [];
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function run() {
  let totalUploaded = 0;

  for (const cat of CATEGORIES) {
    console.log(`\n📂  Fetching ${cat.perPage} ${cat.mood} tracks…`);
    let hits;
    try {
      hits = await fetchPixabayMusic(cat.query, cat.perPage);
    } catch (e) {
      console.error(`  ✗ Pixabay fetch failed: ${e.message}`);
      continue;
    }
    console.log(`  Found ${hits.length} tracks from Pixabay`);

    for (const hit of hits) {
      const audioUrl = hit.audio ?? hit.previewURL;
      if (!audioUrl) continue;

      const trackId = String(hit.id);
      const storagePath = `tracks/${cat.mood}/${trackId}.mp3`;

      // Check if already uploaded
      const { data: existing } = await supabase
        .from('music_tracks')
        .select('id')
        .eq('storage_path', storagePath)
        .maybeSingle();
      if (existing) {
        console.log(`  ↷  ${hit.title} (already stored)`);
        continue;
      }

      // Download the file
      let buffer;
      try {
        buffer = await downloadBuffer(audioUrl);
      } catch (e) {
        console.error(`  ✗  ${hit.title}: download failed — ${e.message}`);
        continue;
      }

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('music')
        .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: false });
      if (uploadErr) {
        console.error(`  ✗  ${hit.title}: upload failed — ${uploadErr.message}`);
        continue;
      }

      // Insert DB row
      const { error: dbErr } = await supabase.from('music_tracks').insert({
        category:         cat.mood,
        title:            hit.title ?? 'Untitled',
        artist:           hit.userName ?? null,
        duration_seconds: hit.duration ?? null,
        storage_path:     storagePath,
      });
      if (dbErr) {
        console.error(`  ✗  ${hit.title}: DB insert failed — ${dbErr.message}`);
        continue;
      }

      console.log(`  ✓  ${hit.title} (${Math.round(buffer.length / 1024)} KB)`);
      totalUploaded++;

      // Polite delay to avoid rate-limiting
      await new Promise(r => setTimeout(r, 600));
    }
  }

  console.log(`\n✅  Done — ${totalUploaded} new tracks uploaded.`);
}

run().catch(e => { console.error(e); process.exit(1); });
