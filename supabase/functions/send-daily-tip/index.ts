// PawBond — Edge Function: send-daily-tip
// Runs hourly. Delivers one AI-personalised care tip per owner per day at 8 AM local time.
//
// AI chain:
//   1. DeepSeek (deepseek-chat) — primary, fast & cheap
//   2. Google Gemini 2.5 Flash  — fallback if DeepSeek fails
//
// Tips are personalised using pet's species, breed, age, active medications,
// upcoming appointments, and recent activity.
//
// Deploy:  supabase functions deploy send-daily-tip
// Cron:    0 * * * *

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';
import { getBlockedPetIds, isBlocked } from '../_shared/petStatus.ts';

const EXPO_PUSH_URL  = 'https://exp.host/--/api/v2/push/send';
const DEEPSEEK_URL   = 'https://api.deepseek.com/v1/chat/completions';
const GEMINI_MODEL   = 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function isCronAuthorized(req: Request): boolean {
  const auth  = req.headers.get('authorization') ?? '';
  const token = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return auth === `Bearer ${token}`;
}

function localHour(tz: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC',
    }).formatToParts(new Date());
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  } catch { return new Date().getUTCHours(); }
}

function localDateStr(tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}

function ageStr(birthday: string | null | undefined): string | null {
  if (!birthday) return null;
  const months = Math.floor((Date.now() - new Date(birthday).getTime()) / (30.44 * 86400000));
  if (months < 1)  return 'newborn';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} old`;
  const years = Math.floor(months / 12);
  const rem   = months % 12;
  return rem > 0
    ? `${years}yr ${rem}mo old`
    : `${years} year${years === 1 ? '' : 's'} old`;
}

// ── Build rich pet context ────────────────────────────────────────────────────

async function buildPetContext(supabase: any, ownerId: string): Promise<{
  contextStr: string;
  petName: string;
  petEmoji: string;
}> {
  const { data: pets } = await supabase
    .from('pets')
    .select('id, name, emoji, species, breed, birthday')
    .eq('owner_id', ownerId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (!pets?.length) return { contextStr: 'a pet', petName: 'your pet', petEmoji: '🐾' };

  const allIds = pets.map((p: any) => p.id);
  const blockedSets = await getBlockedPetIds(supabase, allIds);
  const activePets = pets.filter((p: any) => !isBlocked(p.id, blockedSets));
  // If all pets are lost/deceased, skip the tip entirely
  if (!activePets.length) return { contextStr: '', petName: '', petEmoji: '' };
  const petIds = activePets.map((p: any) => p.id);

  const [{ data: meds }, { data: appts }, { data: activities }, { data: weights }] = await Promise.all([
    supabase.from('medications').select('name, frequency').in('pet_id', petIds).eq('is_active', true).limit(5),
    supabase.from('appointments').select('title, scheduled_at')
      .in('pet_id', petIds)
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', new Date(Date.now() + 14 * 86400000).toISOString())
      .order('scheduled_at', { ascending: true }).limit(3),
    supabase.from('activity_logs').select('activity_type, duration_minutes')
      .in('pet_id', petIds)
      .gte('logged_at', new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10))
      .order('logged_at', { ascending: false }).limit(5),
    supabase.from('weight_logs').select('weight_kg').in('pet_id', petIds)
      .order('logged_at', { ascending: false }).limit(1),
  ]);

  const lines: string[] = [];

  for (const pet of activePets) {
    const parts = [pet.name, pet.species, pet.breed ? `(${pet.breed})` : null, ageStr(pet.birthday)].filter(Boolean);
    lines.push(parts.join(' '));
  }
  if (meds?.length)       lines.push(`Medications: ${meds.map((m: any) => `${m.name} (${m.frequency})`).join(', ')}`);
  if (appts?.length)      lines.push(`Upcoming: ${appts.map((a: any) => `${a.title} on ${new Date(a.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`).join(', ')}`);
  if (activities?.length) lines.push(`Recent activity: ${activities.map((a: any) => a.duration_minutes ? `${a.activity_type} ${a.duration_minutes}min` : a.activity_type).join(', ')}`);
  if (weights?.[0])       lines.push(`Weight: ${weights[0].weight_kg} kg`);

  return {
    contextStr: lines.join('. '),
    petName:    pets[0].name,
    petEmoji:   pets[0].emoji ?? '🐾',
  };
}

// ── Build the prompt ──────────────────────────────────────────────────────────

function buildPrompt(context: string, recentTips: string[]): string {
  const avoidClause = recentTips.length
    ? `\n\nDo NOT repeat or closely paraphrase these recent tips:\n${recentTips.slice(0, 15).map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : '';

  return `You are a friendly pet care assistant sending a daily tip push notification to a pet owner.

Pet details: ${context}${avoidClause}

Write ONE concise, practical daily care tip (1–2 sentences, max 120 characters) that is specifically relevant to this pet's species, breed, age, medications, or upcoming appointments. Be specific — not generic. Warm, encouraging tone. No hashtags, no emoji. Output ONLY the tip text.`;
}

// ── AI providers ──────────────────────────────────────────────────────────────

async function tryDeepSeek(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 120,
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) { console.warn('[daily-tip] DeepSeek HTTP', res.status); return null; }
    const text = ((await res.json())?.choices?.[0]?.message?.content ?? '').trim();
    return text.length > 10 ? text : null;
  } catch (e: any) {
    console.warn('[daily-tip] DeepSeek error:', e.message);
    return null;
  }
}

async function tryGemini(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.8 },
      }),
    });
    if (!res.ok) { console.warn('[daily-tip] Gemini HTTP', res.status); return null; }
    const text = ((await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    return text.length > 10 ? text : null;
  } catch (e: any) {
    console.warn('[daily-tip] Gemini error:', e.message);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase    = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY') ?? null;
  const geminiKey   = Deno.env.get('GEMINI_API_KEY') ?? null;

  const { data: owners } = await supabase
    .from('profiles')
    .select('id, timezone')
    .eq('is_active', true);

  if (!owners?.length) return json({ success: true, sent: 0 });

  let totalSent = 0;
  const stats = { deepseek: 0, gemini: 0, skipped: 0 };

  for (const owner of owners as { id: string; timezone: string | null }[]) {
    const h = localHour(owner.timezone);
    if (h < 8 || h >= 9) continue;

    const today = localDateStr(owner.timezone);

    const { count: sentToday } = await supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', owner.id)
      .eq('type', 'daily_tip')
      .contains('data', { date: today });

    if ((sentToday ?? 0) > 0) continue;

    const { allowed } = await filterByPref(supabase, [owner.id], 'notif_daily');
    if (!allowed.length) continue;

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', owner.id)
      .like('token', 'ExponentPushToken%')
      .limit(5);

    if (!tokens?.length) continue;

    // Recent tips to avoid repetition
    const { data: recentLogs } = await supabase
      .from('notification_logs')
      .select('body')
      .eq('user_id', owner.id)
      .eq('type', 'daily_tip')
      .order('created_at', { ascending: false })
      .limit(30);

    const recentTips: string[] = (recentLogs ?? []).map((l: any) => l.body).filter(Boolean);

    const { contextStr, petName, petEmoji } = await buildPetContext(supabase, owner.id);
    if (!petName) { stats.skipped++; continue; } // all pets lost or deceased
    const prompt = buildPrompt(contextStr, recentTips);

    // 1. Try DeepSeek, 2. Try Gemini 2.5 Flash
    let tipText: string | null = null;
    let source = 'deepseek';

    if (deepseekKey) tipText = await tryDeepSeek(deepseekKey, prompt);
    if (!tipText && geminiKey) { tipText = await tryGemini(geminiKey, prompt); source = 'gemini'; }

    if (!tipText) {
      console.error(`[daily-tip] both AI providers failed for ${owner.id}`);
      stats.skipped++;
      continue;
    }

    const title = `${petEmoji} Daily tip for ${petName}`;

    const { error: logErr } = await supabase.from('notification_logs').insert({
      user_id: owner.id, title, body: tipText,
      type: 'daily_tip',
      data: { date: today, source },
    });

    if (logErr) {
      console.error(`[daily-tip] log insert failed for ${owner.id}:`, logErr.message);
      continue;
    }

    const messages = (tokens as { token: string }[]).map(t => ({
      to: t.token, sound: 'default', title, body: tipText,
      data: { type: 'daily_tip' },
      priority: 'normal',
      channelId: 'daily_tips',
    }));

    for (let i = 0; i < messages.length; i += 100) {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
      if (res.ok) {
        const r = await res.json();
        totalSent += (r.data ?? []).filter((d: any) => d.status === 'ok').length;
        if (source === 'deepseek') stats.deepseek++; else stats.gemini++;
      }
    }
  }

  return json({ success: true, sent: totalSent, ...stats });
});
