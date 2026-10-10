// FamilyCube — Edge Function: parse-flyer
// Accepts 1-3 base64 images/PDF of a school flyer and returns one of three
// structured responses based on what the flyer contains:
//   "timetable" — a class schedule / timetable
//   "calendar"  — a school calendar with multiple events/holidays
//   "event"     — a single activity/sports/event flyer
//
// Deploy: supabase functions deploy parse-flyer

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a family calendar assistant. You are given 1-3 images of a school flyer, notice, or calendar.

First determine what type of document this is, then extract the relevant data.

## Types

### type: "timetable"
Use this when the document shows a student's class schedule / timetable — a grid or list of subjects with times and days.

Return:
{
  "type": "timetable",
  "timetable": {
    "student": "student full name if visible, else null",
    "school": "school name if visible, else null",
    "grade": "grade/year/class label if visible e.g. '7th Grade', else null",
    "periods": [
      {
        "periodName": "period label e.g. '1', 'A', 'Homeroom' — free text",
        "subject": "subject or class name",
        "teacher": "teacher name or null",
        "room": "room number/name or null",
        "startTime": "HH:MM 24h or null",
        "endTime": "HH:MM 24h or null",
        "days": only the days this period occurs — an array of day keys from [mon,tue,wed,thu,fri,sat,sun]. If a subject only runs on specific days (e.g. Science on Mon/Wed/Fri), list only those days. If it runs every school day, use ["mon","tue","wed","thu","fri"],
        "term": "term label if the schedule has multiple terms e.g. 'Q1', 'Q2', 'Q3', 'Q4', 'Fall', 'Spring', 'Term 1' — or null if no terms",
        "isLunch": true if this is a lunch/break period
      }
    ]
  }
}

### type: "calendar"
Use this when the document is a school calendar, newsletter, or term planner with MULTIPLE dates/events (holidays, early release days, sports fixtures, school events, etc.).

Return:
{
  "type": "calendar",
  "calendar": {
    "school": "school name if visible, else null",
    "events": [
      {
        "title": "event name",
        "category": one of: Medical, Sports, Study, Ride, Event, Birthday, Errand, Other — use Study for school/academic activities (classes, homework, school events, holidays/breaks on a school calendar), Event for general gatherings/celebrations that aren't school-specific, Other only if nothing else fits,
        "date": "YYYY-MM-DD or null",
        "time": "HH:MM 24h or null",
        "end_time": "HH:MM 24h or null",
        "location": "venue or null",
        "notes": "any special instructions or null",
        "recurring": false,
        "recurrence_desc": null
      }
    ]
  }
}

### type: "event"
Use this for a single activity flyer — one specific event (sports game, school play, fundraiser, excursion, permission slip, etc.).

Return:
{
  "type": "event",
  "event": {
    "title": "event name",
    "category": one of: Medical, Sports, Study, Ride, Event, Birthday, Errand, Other — use Study for school/academic activities, Birthday for birthday parties, Event for general gatherings/celebrations, Other only if nothing else fits,
    "date": "YYYY-MM-DD or null",
    "time": "HH:MM 24h or null",
    "end_time": "HH:MM 24h or null",
    "location": "venue or null",
    "organizer": "who is hosting or null",
    "description": "1-2 sentence summary",
    "rsvp_deadline": "YYYY-MM-DD or null",
    "cost": numeric dollar amount or null,
    "notes": "what to bring, dress code, etc. or null",
    "recurring": true/false,
    "recurrence_desc": "recurrence pattern or null"
  }
}

## Reading times and locations — do this BEFORE returning null

Only use null for startTime/endTime/time/end_time/location/room if you have
genuinely scanned the ENTIRE image and the information is not present
anywhere, in any form. Do not default to null just because it isn't in an
obvious dedicated column or field.

Times and locations appear in many formats and places on a real flyer —
actively look for ALL of these before giving up:
- A dedicated "Time" or "When" column or row in a table/grid.
- Inline within the subject/event text itself, e.g. "Soccer practice 3:00-4:30pm",
  "Doors open 6pm", "Starts at 9", "9-10:15am Science".
- A header or footer line separate from the main grid, e.g. "School hours: 8:20am–3:05pm",
  "All classes 45 minutes unless noted".
- Times written in 12h format with or without am/pm, with a dash, "to", "–", "-", or "until"
  between start and end (e.g. "3-4", "3:00 to 4:00", "15:00-16:00") — convert ALL of these to 24h HH:MM.
- A single time with an implied duration (e.g. "1 hour session at 4pm" → startTime "16:00", endTime "17:00").
- Locations/rooms similarly: look for "Room 204", "Gym", "Cafeteria", "Main Hall", "Field B",
  address lines, "@ <venue>", or a venue name near the title — not just a field literally labeled "Location".
- If a time is only given as a start with no visible end (e.g. "doors 6pm"), set only startTime
  and leave endTime null — do not invent an end time, but DO still report the start time you found.

Re-read the image a second time specifically hunting for these patterns before
settling on null for any time or location field — a flyer that mentions a
time or place anywhere in its text should almost never produce a fully-null
schedule.

Return ONLY valid JSON — no markdown fences, no explanation. If a field is unknown after this careful search, use null.
For timetable periods: always specify the exact days each period occurs. If a subject appears on different days in different weeks or terms, create a separate period entry per term and set the "term" field accordingly.
For rotating/block schedules: each day-block (A/B/C etc.) gets separate period entries with the days array set to only the days that block runs.
For calendar events: extract ALL visible events, even if there are 20+.`;

// ── Gemini vision call ────────────────────────────────────────────────────────
async function callGemini(key: string, images: { data: string; mimeType: string }[]): Promise<string> {
  const imageParts = images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } }));

  // gemini-1.5-flash-8b and gemini-1.5-flash are both retired on the
  // current v1beta API surface (live-reported elsewhere in this app via
  // edge logs: "HTTP 404: models/gemini-1.5-flash is not found for API
  // version v1beta") — neither fallback slot could ever have succeeded.
  // Retrying gemini-2.5-flash itself is a real retry against a transient
  // failure instead of falling through to dead model names.
  const MODELS = [
    { name: 'gemini-2.5-flash', thinking: true  },
    { name: 'gemini-2.5-flash', thinking: false },
    { name: 'gemini-2.5-flash', thinking: false },
  ];
  let lastErr = '';
  for (const m of MODELS) {
    try {
      // Bug fixed here: this was backwards — thinkingBudget: 0 DISABLES
      // extended reasoning, but it was only ever set when m.thinking was
      // true, so the "thinking" attempt actually had thinking OFF, and the
      // "non-thinking" retries got Gemini's normal (non-zero) default
      // budget instead. For a task that depends on carefully re-scanning
      // an image for scattered times/locations rather than giving up with
      // null [live-reported: "scanner is not decoding the start/end
      // times and locations"], thinking genuinely enabled should be tried
      // first, not accidentally suppressed.
      const generationConfig: Record<string, unknown> = { temperature: 0.1, maxOutputTokens: 16384 };
      if (!m.thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
      const reqBody = JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [
            ...imageParts,
            { text: 'Determine the document type and extract all details. Return compact JSON only (no pretty-printing, no extra whitespace).' },
          ],
        }],
        generationConfig,
      });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m.name}:generateContent?key=${key}`;
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody }, 35_000);
      const j = await res.json();
      if (!res.ok || j.error) {
        lastErr = j.error?.message ?? `HTTP ${res.status}`;
        console.error(`[parse-flyer] ${m.name} failed: ${lastErr}`);
        continue;
      }
      const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      console.log(`[parse-flyer] ${m.name} ok, length=${text.length}`);
      return text;
    } catch (e) {
      lastErr = String(e);
      console.error(`[parse-flyer] ${m.name} threw: ${lastErr}`);
    }
  }
  throw new Error(`Gemini failed: ${lastErr}`);
}

// ── JSON extraction ───────────────────────────────────────────────────────────
function extractJson(raw: string): Record<string, unknown> {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found. Raw (first 300): ${clean.slice(0, 300)}`);
  }
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch (e) {
    const snippet = clean.slice(start, start + 500);
    throw new Error(`JSON parse failed: ${String(e)} | snippet: ${snippet}`);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY not set' }, 503);

    const body = await req.json();
    const images: { data: string; mimeType: string }[] = body.images ?? [];

    console.log(`[parse-flyer] received ${images.length} image(s), sizes: ${images.map(i => i.data.length).join(', ')} chars, mimes: ${images.map(i => i.mimeType).join(', ')}`);

    if (!images.length || images.length > 3) {
      return json({ error: 'Provide 1–3 images' }, 400);
    }
    for (const img of images) {
      if (!img.data || !img.mimeType) return json({ error: 'Each image needs data and mimeType' }, 400);
    }

    const raw    = await callGemini(geminiKey, images);
    console.log(`[parse-flyer] gemini raw (first 300): ${raw.slice(0, 300)}`);
    const parsed = extractJson(raw);

    // Validate type field
    const type = parsed.type as string;
    console.log(`[parse-flyer] detected type: ${type}`);
    if (!['timetable', 'calendar', 'event'].includes(type)) {
      throw new Error(`Unexpected response type: ${type}`);
    }

    return json({ ok: true, type, ...parsed });
  } catch (e) {
    console.error('[parse-flyer] handler error:', e);
    return json({ error: String(e) }, 500);
  }
});
