/**
 * yir-video-gen — AI-curated Year-in-Review slideshow
 *
 * Uses Gemini Flash to:
 *   1. Analyse all photos + pet metadata
 *   2. Pick the best 6-8 photos in emotional order
 *   3. Write a personal caption for each
 *   4. Generate an opening title line and a closing message
 *
 * Returns a curated slide list the app plays as a full-screen
 * animated slideshow — no Veo / video file needed.
 */

import { fetchWithTimeout, VISION_TIMEOUT_MS } from '../_shared/fetchWithTimeout.ts';
import { getChainConfig } from '../_shared/getChainConfig.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface CuratedSlide {
  photoUrl: string;
  caption: string;
  mood?: string;
}

interface CurationResult {
  openingLine: string;
  closingMessage: string;
  slides: CuratedSlide[];
}

async function fetchBase64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const mime = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
    const buf  = await r.arrayBuffer();
    const b64  = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return { data: b64, mime };
  } catch { return null; }
}

async function curateWithGemini(
  geminiKey: string,
  petName: string,
  petSpecies: string,
  year: number,
  photos: Array<{ url: string; takenAt?: string; mood?: string; data?: string; mime?: string }>,
  topMoods: string[],
  milestones: string[],
): Promise<CurationResult> {

  console.log(`[yir] curating for ${petName} (${petSpecies}) year=${year} photos=${photos.length}`);

  const moodSummary = topMoods.length   ? `Overall mood this year: ${topMoods.slice(0, 3).join(', ')}.` : '';
  const msSummary   = milestones.length ? `Milestones: ${milestones.slice(0, 4).join('; ')}.` : '';

  // Build interleaved parts: label text → image → label text → image …
  const parts: unknown[] = [];
  parts.push({ text: `You are creating a warm ${year} Year-in-Review for a ${petSpecies} named ${petName}.\n${moodSummary}\n${msSummary}\n\nLook at each photo carefully and describe what you actually see.` });

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const dateStr = p.takenAt ? new Date(p.takenAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null;
    const meta = [dateStr && `Date: ${dateStr}`, p.mood && `Mood: ${p.mood}`].filter(Boolean).join(', ');
    parts.push({ text: `\n--- Photo ${i} (${meta || 'no metadata'}) ---` });
    if (p.data && p.mime) {
      parts.push({ inlineData: { mimeType: p.mime, data: p.data } });
    }
  }

  parts.push({ text: `\nNow respond ONLY with this exact JSON (no markdown, no extra text):
{
  "openingLine": "punchy celebratory line about ${petName}'s ${year}, max 10 words",
  "closingMessage": "heartfelt forward-looking line for ${petName}, max 18 words",
  "slides": [
    { "index": 0, "caption": "describe what you SEE in photo 0 in a warm way, max 10 words" }
  ]
}
Rules:
- Pick 6–8 photos. Order emotionally: warm start → highlights → heartfelt end.
- Captions MUST describe what is visually in the photo (sleeping dog, playing in grass, etc.).
- Do NOT invent activities. If you see a dog sleeping, write about sleeping.
- Max 10 words per caption. No date prefixes. Warm, personal tone.` });

  const reqBody = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
  });

  const primaryModel = visionModels[0] ?? 'gemini-2.5-flash';
  console.log(`[yir] sending ${photos.length} photos to ${primaryModel}`);
  const r = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${geminiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody },
    VISION_TIMEOUT_MS,
  );
  console.log(`[yir] status=${r.status}`);

  if (r.ok) {
    const d = await r.json();
    const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log(`[yir] finishReason=${d?.candidates?.[0]?.finishReason} raw:`, raw?.slice(0, 300) ?? '(null)');
    if (raw) {
      try {
        const clean  = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(clean);
        if (parsed.slides?.length) {
          return {
            openingLine:    parsed.openingLine?.trim()    || `What a year for ${petName}! 🐾`,
            closingMessage: parsed.closingMessage?.trim() || `Here's to ${year + 1} and every adventure ahead.`,
            slides: (parsed.slides as Array<{ index: number; caption: string }>).map(s => ({
              photoUrl: (photos[s.index] ?? photos[0]).url,
              caption:  s.caption?.trim() || `A wonderful moment 🐾`,
            })),
          };
        }
      } catch (e) { console.log(`[yir] parse error:`, e); }
    }
  } else {
    const err = await r.text();
    console.log(`[yir] gemini error:`, err);
  }

  // Fallback: all photos in order, mood-based captions
  console.log(`[yir] using fallback captions`);
  const MOOD_LINES: Record<string, string> = {
    happy: 'Pure happiness 🐾', playful: 'Full play mode activated.',
    calm: 'Perfectly at peace.', excited: 'Maximum excitement!',
    tired: 'Rest well earned.', anxious: 'Brave face, big heart.',
    grumpy: 'Not a morning pet.',
  };
  return {
    openingLine:    `What a year for ${petName}! 🐾`,
    closingMessage: `Here's to ${year + 1} and every adventure still to come.`,
    slides: photos.slice(0, 8).map(p => ({
      photoUrl: p.url,
      caption:  (p.mood && MOOD_LINES[p.mood]) ?? `A favourite moment 🐾`,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) return json({ fallback: true }, 500);
  const visionModels = (await getChainConfig()).general_vision
    .filter(s => s.provider === 'gemini' || s.provider === 'custom').map(s => s.model);

  let body: {
    petName: string; petSpecies: string; year: number;
    photos: Array<{ url: string; takenAt?: string; mood?: string }>;
    topMoods: string[]; milestones: string[];
  };

  try { body = await req.json(); }
  catch { return json({ fallback: true }, 400); }

  const { petName, petSpecies, year, photos, topMoods, milestones } = body;
  console.log(`[yir] request: pet="${petName}" year=${year} photos=${photos?.length} topMoods=[${topMoods}] milestones=${milestones?.length}`);
  if (!photos?.length) return json({ fallback: true }, 400);

  try {
    const raw = photos.slice(0, 12);
    console.log(`[yir] fetching ${raw.length} images as base64`);
    const pool = (await Promise.all(
      raw.map(async p => {
        const img = await fetchBase64(p.url);
        return { url: p.url, takenAt: p.takenAt, mood: p.mood, ...(img ?? {}) };
      })
    ));
    console.log(`[yir] fetched ${pool.filter(p => p.data).length}/${pool.length} images successfully`);

    if (!pool.length) return json({ fallback: true }, 422);

    const result = await curateWithGemini(
      geminiKey, petName, petSpecies, year,
      pool, topMoods, milestones,
    );

    console.log(`[yir] done: slides=${result.slides.length} captions:`, result.slides.map(s => s.caption));
    return json(result);
  } catch (e) {
    console.log(`[yir] top-level error:`, e);
    return json({ fallback: true }, 503);
  }
});
