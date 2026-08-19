// FamilyCube — Edge Function: moderate-message
// Layer 2 of content moderation. The client-side blocklist (lib/contentModeration.ts)
// already blocks obvious profanity before send; this catches subtler issues
// a keyword list can't — harassment/bullying tone, exclusion, threats —
// by asking the model to judge the MESSAGE, not just scan for bad words.
// Called fire-and-forget AFTER a message is already sent (never blocks
// delivery), and only ever writes a flag for parents to see — never a
// public callout on the message itself.
//
// Deploy: supabase functions deploy moderate-message
// Secrets required: DEEPSEEK_API_KEY, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const GEMINI_KEY   = Deno.env.get('GEMINI_API_KEY') ?? '';
const DEEPSEEK_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
const GEMINI_URL   = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const PROMPT = (text: string) => `You moderate messages in a family app used by parents and children together.
Judge ONLY the message below for: harassment, bullying, threats, exclusion ("nobody likes you"), or other tone that
would concern a parent — NOT profanity (already filtered separately) and NOT normal sibling bickering or jokes.
Message: """${text}"""
Reply with ONLY compact JSON, no other text: {"flagged": boolean, "severity": "low"|"medium"|"high", "reason": string}
If nothing concerning, reply {"flagged": false, "severity": "low", "reason": ""}`;

async function callDeepSeek(text: string) {
  if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY not configured');
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: PROMPT(text) }], temperature: 0.1 }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content as string;
}

async function callGemini(text: string) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(text) }] }], generationConfig: { temperature: 0.1 } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') as string;
}

function parseVerdict(raw: string | undefined): { flagged: boolean; severity: string; reason: string } {
  if (!raw) return { flagged: false, severity: 'low', reason: '' };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    return { flagged: !!parsed.flagged, severity: parsed.severity ?? 'low', reason: parsed.reason ?? '' };
  } catch {
    return { flagged: false, severity: 'low', reason: '' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await authClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json() as { table: 'chat_messages' | 'ask_cube_messages'; messageId: string; text: string };
    if (!body.text?.trim() || !body.messageId || !body.table) return json({ ok: true, skipped: true });
    if (body.table !== 'chat_messages' && body.table !== 'ask_cube_messages') return json({ error: 'Invalid table' }, 400);

    let raw: string | undefined;
    try { raw = await callDeepSeek(body.text); }
    catch { raw = await callGemini(body.text).catch(() => undefined); }

    const verdict = parseVerdict(raw);
    if (!verdict.flagged) return json({ ok: true, flagged: false });

    await supabase.from(body.table).update({
      moderation_flag: { severity: verdict.severity, reason: verdict.reason, flagged_at: new Date().toISOString() },
    }).eq('id', body.messageId);

    return json({ ok: true, flagged: true });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});
