// FamilyCube — Edge Function: ask-cube
// Agentic chat: answers "what's going on" across the family's schedule and
// chores, and can propose creating events/quests via tool-calling. Separate
// from family-ai's single-shot actions because this is a fundamentally
// different shape — multi-turn, stateful (persisted conversation), and uses
// real function-calling instead of one prompt -> one JSON reply.
//
// Model strategy matches family-ai: DeepSeek primary (OpenAI-compatible
// tools API), Gemini fallback (functionDeclarations) — same provider order,
// same reasoning (DeepSeek is cheaper/faster for text-only work).
//
// Deploy: supabase functions deploy ask-cube
// Secrets required: GEMINI_API_KEY, DEEPSEEK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

// ─── Name aliasing (privacy) ─────────────────────────────────────────────
// Real names (and anything else identifying, like home addresses baked into
// a "current location" string) never reach the LLM provider for sensitive
// tools (location, health). Each member gets a stable alias — "Person A",
// "Person B" — deterministic from a sorted member-id list, so the same
// person is "Person A" on every call within a family instead of the model
// re-learning a fresh mapping each turn. The mapping never leaves this
// function: tool args coming back from the model are de-aliased before any
// DB query, and the final answer text has aliases swapped back to real
// names before it's ever sent to the client.
type AliasMap = { toAlias: Map<string, string>; toReal: Map<string, string> };

function buildAliasMap(members: { id: string; name: string }[]): AliasMap {
  const toAlias = new Map<string, string>();
  const toReal = new Map<string, string>();
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
  sorted.forEach((m, i) => {
    const alias = `Person ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`;
    toAlias.set(m.id, alias);
    toReal.set(alias, m.name);
  });
  return { toAlias, toReal };
}

function realNameToAlias(map: AliasMap, members: { id: string; name: string }[], text: string): string {
  let out = text;
  for (const m of members) {
    const alias = map.toAlias.get(m.id);
    if (!alias) continue;
    // Longest-name-first isn't needed here since each replace is scoped to
    // one member's exact name string, not a shared prefix.
    out = out.split(m.name).join(alias);
    const firstName = m.name.split(' ')[0];
    if (firstName !== m.name) out = out.split(firstName).join(alias);
  }
  return out;
}

function aliasToRealName(map: AliasMap, text: string | null | undefined): string {
  if (!text) return text ?? '';
  let out = text;
  for (const [alias, real] of map.toReal) out = out.split(alias).join(real);
  return out;
}

function memberIdForAlias(map: AliasMap, alias: string): string | null {
  const real = map.toReal.get(alias.trim());
  if (!real) return null;
  for (const [id, a] of map.toAlias) if (a === alias.trim()) return id;
  return null;
}

// ─── Tool schema (OpenAI/DeepSeek function-calling shape) ──────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_schedule',
      description: "Get calendar events in a date range. Use for questions about what's on today/this week/tomorrow, or a specific date.",
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
          endDate:   { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quests',
      description: 'Get quest/chore state, optionally filtered by status or member. Use for "what chores are pending", "is anyone overdue", "what has X done".',
      parameters: {
        type: 'object',
        properties: {
          status:   { type: 'string', enum: ['todo', 'in_progress', 'pending_approval', 'approved', 'done', 'declined', 'any'] },
          memberName: { type: 'string', description: 'Filter to one family member by name, or omit for everyone' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chore_history',
      description: 'Get completed/approved chores in a date range. Use for "has anyone done X this week", "what did we get done".',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          endDate:   { type: 'string', description: 'YYYY-MM-DD' },
          memberName: { type: 'string' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_location',
      description: 'Get a family member\'s current/last-known location status (e.g. "at home", "in transit", "at School", distance from home). Use for "where is X", "is everyone home", "has X left yet".',
      parameters: {
        type: 'object',
        properties: {
          memberName: { type: 'string', description: 'Whose location to check — omit for everyone' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_health_summary',
      description: 'Get a family member\'s active medications and upcoming/overdue vaccines. Use for "what meds is X on", "any vaccines due", "when\'s the next refill".',
      parameters: {
        type: 'object',
        properties: {
          memberName: { type: 'string', description: 'Whose health info to check — required, this is sensitive data' },
        },
        required: ['memberName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_event',
      description: 'Propose creating a calendar event. Does NOT create it — returns a proposal the user must confirm. Use when the user asks to add/schedule something with a specific date/time, appointment, or ride.',
      parameters: {
        type: 'object',
        properties: {
          title:      { type: 'string' },
          category:   { type: 'string', enum: ['Medical', 'Sports', 'Study', 'Ride', 'Work', 'Event', 'Birthday', 'Errand', 'Other'] },
          startAt:    { type: 'string', description: 'ISO 8601 date+time' },
          memberName: { type: 'string', description: 'Which family member this is for, if named' },
          notes:      { type: 'string' },
        },
        required: ['title', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_quest',
      description: 'Propose creating a quest/chore. Does NOT create it — returns a proposal the user must confirm. Use for choreable to-dos with no fixed appointment time.',
      parameters: {
        type: 'object',
        properties: {
          title:         { type: 'string' },
          coins:         { type: 'number' },
          memberName:    { type: 'string', description: 'Who this is assigned to, if named — omit for the open pool' },
          dueDate:       { type: 'string', description: 'YYYY-MM-DD, if a deadline was implied' },
          photoRequired: { type: 'boolean' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_grocery_items',
      description: 'Propose adding one or more items to the shared grocery list. Does NOT add them — returns a proposal the user must confirm. Use when the user asks to add groceries, e.g. "add milk and eggs" or "we need stuff for tacos".',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:     { type: 'string' },
                quantity: { type: 'string', description: 'Free text, e.g. "2 lbs", "1 dozen" — omit if not implied' },
                category: { type: 'string', enum: ['Produce', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen', 'Household', 'Snacks', 'Pharmacy', 'Pet Store', 'Other'] },
              },
              required: ['name'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_meal',
      description: 'Propose adding ONE specific meal to the weekly meal plan (the user already named a dish, or you are proposing a single confirmed idea). Does NOT add it — returns a proposal card the user must confirm. Call this MULTIPLE TIMES in the same turn (one call per dish) when the user wants a few ideas to choose from, e.g. "suggest a high-protein dinner for tonight" -> call this 2-3 times with different dish ideas, don\'t ask a clarifying question first.',
      parameters: {
        type: 'object',
        properties: {
          title:        { type: 'string', description: 'The dish name — invent a specific, appealing one yourself if the user only described a craving/goal (e.g. "more protein") rather than naming a dish. Prefer a well-known, commonly photographed dish name (e.g. "Grilled Chicken Caesar Salad" not an invented fusion name) since you will also provide a real photo URL for it.' },
          day:          { type: 'string', description: 'Day name, e.g. "Monday", "Tuesday" — if the user said "tonight"/"today", resolve it to the actual weekday name yourself using the current date' },
          mealType:     { type: 'string', enum: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] },
          emoji:        { type: 'string', description: 'One food emoji representing the dish, used as a fallback if the photo fails to load' },
          imageUrl:     { type: 'string', description: 'A real, direct, public photo URL of this exact dish from Wikimedia Commons (upload.wikimedia.org) — only include this if you are confident a real Commons photo exists for this specific dish; omit entirely rather than guessing or inventing a URL' },
          prepMinutes:  { type: 'number' },
          ingredients:  { type: 'array', items: { type: 'string' } },
          prepSteps:    { type: 'array', items: { type: 'string' }, description: 'Short numbered cooking steps (3-6 steps), each one clear instruction — always include these, not just ingredients' },
          chefName:     { type: 'string', description: 'Who is cooking, if named' },
        },
        required: ['title', 'day'],
      },
    },
  },
];

// ─── Model calls ─────────────────────────────────────────────────────────

async function callDeepSeek(messages: unknown[], tools: unknown[]) {
  if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY not configured');
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages, tools, tool_choice: 'auto', temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message;
}

// Gemini fallback — converts the OpenAI-shape message history + tool result
// into Gemini's functionDeclarations/functionResponse shape. Kept minimal
// (text + tool loop only, no streaming) since it's the fallback path, not
// the primary one.
async function callGemini(messages: any[], tools: unknown[]) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  const systemMsg = messages.find(m => m.role === 'system');
  const history = messages.filter(m => m.role !== 'system').map(m => {
    if (m.role === 'tool') {
      return { role: 'function', parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }] };
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return { role: 'model', parts: m.tool_calls.map((tc: any) => ({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) } })) };
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content ?? '' }] };
  });
  const geminiTools = [{ functionDeclarations: tools.map((t: any) => t.function) }];
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: history,
      tools: geminiTools,
      systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const fnCall = parts.find((p: any) => p.functionCall);
  if (fnCall) {
    return {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: `gemini_${Date.now()}`, type: 'function',
        function: { name: fnCall.functionCall.name, arguments: JSON.stringify(fnCall.functionCall.args ?? {}) } }],
    };
  }
  const text = parts.map((p: any) => p.text ?? '').join('');
  return { role: 'assistant', content: text };
}

async function callModel(messages: unknown[], tools: unknown[]) {
  try { return await callDeepSeek(messages, tools); }
  catch (err) {
    console.warn('[ask-cube] DeepSeek failed, falling back to Gemini:', (err as Error).message);
    return callGemini(messages as any[], tools);
  }
}

// ─── Tool execution (server-side, real data) ────────────────────────────

// name here may be a real name OR an alias ("Person A") — the model only
// ever sees aliases for sensitive tools, but for schedule/quest tools it
// still sees real names today, so this resolves either.
async function resolveMemberId(supabase: any, familyId: string, name: string, aliasMap?: AliasMap): Promise<string | null> {
  if (aliasMap) {
    const byAlias = memberIdForAlias(aliasMap, name);
    if (byAlias) return byAlias;
  }
  const { data } = await supabase.from('members').select('id, name').eq('family_id', familyId);
  const lower = name.toLowerCase().trim();
  const match = (data ?? []).find((m: any) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase().split(' ')[0]));
  return match?.id ?? null;
}

// Viewer-role scoping — matches HubTimelineSection's belongsToMe: a kid/teen
// only sees their own events + family-wide (no-assignee) events, never a
// sibling's personal schedule. Parents/seniors see everything.
function scopeEventsToViewer(events: any[], viewerRole: string, viewerId: string) {
  if (viewerRole === 'parent' || viewerRole === 'senior') return events;
  return events.filter(e => {
    const hasAssignee = e.member_id || (e.member_ids && e.member_ids.length);
    if (!hasAssignee) return true;
    if (e.member_id === viewerId) return true;
    if (e.member_ids?.includes(viewerId)) return true;
    return false;
  });
}

async function executeTool(
  supabase: any, name: string, args: any,
  familyId: string, viewerId: string, viewerRole: string, viewerName: string,
  aliasMap: AliasMap, members: { id: string; name: string }[],
) {
  if (name === 'get_schedule') {
    const { data, error } = await supabase.from('calendar_events')
      .select('title, category, date, start_time, member_id, member_ids, helper_name, helper_status')
      .eq('family_id', familyId)
      .gte('date', args.startDate).lte('date', args.endDate)
      .is('deleted_at', null)
      .order('date').order('start_time');
    if (error) return { error: error.message };
    const scoped = scopeEventsToViewer(data ?? [], viewerRole, viewerId);
    return { events: scoped.map((e: any) => ({
      title: e.title, category: e.category, date: e.date, time: e.start_time,
      helper: e.helper_name ? realNameToAlias(aliasMap, members, e.helper_name) : null,
      helperStatus: e.helper_status,
    })) };
  }

  if (name === 'get_quests') {
    let query = supabase.from('chore_tasks').select('title, status, coins_reward, due_date, assigned_to_id').eq('family_id', familyId);
    if (args.status && args.status !== 'any') query = query.eq('status', args.status);
    if (args.memberName) {
      const id = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
      if (id) query = query.eq('assigned_to_id', id);
    }
    // Non-parent viewers only see their own quests + the open pool, same
    // privacy boundary as the schedule scoping above.
    const { data, error } = await query.order('due_date', { nullsFirst: false }).limit(50);
    if (error) return { error: error.message };
    let rows = data ?? [];
    if (viewerRole !== 'parent' && viewerRole !== 'senior') {
      rows = rows.filter((r: any) => !r.assigned_to_id || r.assigned_to_id === viewerId);
    }
    return { quests: rows };
  }

  if (name === 'get_chore_history') {
    let query = supabase.from('chore_tasks').select('title, status, coins_reward, completed_at, assigned_to_id')
      .eq('family_id', familyId).in('status', ['completed', 'auto_approved'])
      .gte('completed_at', args.startDate).lte('completed_at', args.endDate + 'T23:59:59');
    if (args.memberName) {
      const id = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
      if (id) query = query.eq('assigned_to_id', id);
    }
    const { data, error } = await query.order('completed_at', { ascending: false }).limit(50);
    if (error) return { error: error.message };
    let rows = data ?? [];
    if (viewerRole !== 'parent' && viewerRole !== 'senior') {
      rows = rows.filter((r: any) => !r.assigned_to_id || r.assigned_to_id === viewerId);
    }
    return { completed: rows };
  }

  if (name === 'get_location') {
    if (viewerRole !== 'parent') return { error: 'Location is only available to parents.' };
    let query = supabase.from('member_locations').select('member_id, status, address, safe_zone_name, distance_from_home_miles, updated_at').eq('family_id', familyId);
    if (args.memberName) {
      const id = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
      if (id) query = query.eq('member_id', id);
    }
    const { data, error } = await query;
    if (error) return { error: error.message };
    // Only ever aliased status/zone info leaves this function — no raw
    // lat/lng and no home address, just the derived human-readable status.
    return {
      locations: (data ?? []).map((r: any) => ({
        person: aliasMap.toAlias.get(r.member_id) ?? 'Unknown',
        status: r.status, place: r.safe_zone_name ?? null,
        distanceFromHomeMiles: r.distance_from_home_miles ?? null,
        updatedAt: r.updated_at,
      })),
    };
  }

  if (name === 'get_health_summary') {
    if (viewerRole !== 'parent') return { error: 'Health information is only available to parents.' };
    const id = args.memberName ? await resolveMemberId(supabase, familyId, args.memberName, aliasMap) : null;
    if (!id) return { error: 'Could not identify which family member.' };
    const [medsRes, vaxRes] = await Promise.all([
      supabase.from('family_medications').select('name, dosage, dosage_unit, frequency, refill_date, pills_remaining, is_active')
        .eq('family_id', familyId).eq('member_id', id).eq('is_active', true),
      supabase.from('family_vaccines').select('title, next_due_date, done')
        .eq('family_id', familyId).eq('member_id', id).eq('done', false).not('next_due_date', 'is', null),
    ]);
    return {
      person: aliasMap.toAlias.get(id) ?? 'Unknown',
      medications: (medsRes.data ?? []).map((m: any) => ({
        name: m.name, dosage: `${m.dosage ?? ''}${m.dosage_unit ?? ''}`.trim(), frequency: m.frequency,
        refillDate: m.refill_date, pillsRemaining: m.pills_remaining,
      })),
      upcomingVaccines: (vaxRes.data ?? []).map((v: any) => ({ title: v.title, dueDate: v.next_due_date })),
    };
  }

  if (name === 'propose_event') {
    let memberId: string | null = null;
    if (args.memberName) memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
    return {
      __proposal: 'event',
      title: args.title, category: args.category ?? 'Other',
      startAt: args.startAt ?? null, memberId, notes: args.notes ?? null,
    };
  }

  if (name === 'propose_quest') {
    let memberId: string | null = null;
    if (args.memberName) memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
    return {
      __proposal: 'quest',
      title: args.title, coins: args.coins ?? 20, memberId,
      dueDate: args.dueDate ?? null, photoRequired: args.photoRequired ?? false,
    };
  }

  if (name === 'propose_grocery_items') {
    return {
      __proposal: 'grocery',
      items: (args.items ?? []).map((it: any) => ({
        name: it.name, quantity: it.quantity ?? null, category: it.category ?? 'Other',
      })),
    };
  }

  if (name === 'propose_meal') {
    let chefId: string | null = null;
    if (args.chefName) chefId = await resolveMemberId(supabase, familyId, args.chefName, aliasMap);
    // Only ever pass through an image URL from a small trusted-host
    // allowlist — the model's imageUrl is untrusted input, and rendering an
    // arbitrary URL client-side would be an easy image-based tracking/abuse
    // vector. Wikimedia Commons is the only source the model is asked for.
    let imageUrl: string | null = null;
    if (typeof args.imageUrl === 'string') {
      try {
        const u = new URL(args.imageUrl);
        if (u.protocol === 'https:' && (u.hostname === 'upload.wikimedia.org' || u.hostname.endsWith('.wikimedia.org'))) {
          imageUrl = u.toString();
        }
      } catch { /* not a valid URL — drop it */ }
    }
    return {
      __proposal: 'meal',
      title: args.title, day: args.day, mealType: args.mealType ?? 'Dinner',
      emoji: args.emoji ?? null, imageUrl, prepMinutes: args.prepMinutes ?? null,
      ingredients: args.ingredients ?? [], prepSteps: args.prepSteps ?? [], chefId,
    };
  }

  return { error: `Unknown tool: ${name}` };
}

// ─── Main loop ───────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 4; // guard against a runaway tool-call loop

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

    // Service-role client for the actual data reads — RLS on calendar_events/
    // chores is family-scoped already, but the tool functions above also do
    // their own viewer-role filtering on top, so a service-role client here
    // just avoids re-deriving the caller's session per query.
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json() as {
      conversationId?: string;
      memberId: string;
      message: string;
    };
    if (!body.memberId || !body.message?.trim()) return json({ error: 'memberId and message required' }, 400);

    const { data: member } = await supabase.from('members').select('id, name, role, family_id').eq('id', body.memberId).single();
    if (!member) return json({ error: 'Member not found' }, 404);

    const { data: allMembers } = await supabase.from('members').select('id, name').eq('family_id', member.family_id);
    const aliasMap = buildAliasMap(allMembers ?? []);
    const viewerAlias = aliasMap.toAlias.get(member.id) ?? member.name;

    // Load or create the conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      const { data: conv, error: convErr } = await supabase.from('ask_cube_conversations')
        .insert({ family_id: member.family_id, member_id: member.id, title: body.message.slice(0, 60) })
        .select('id').single();
      if (convErr) return json({ error: convErr.message }, 500);
      conversationId = conv.id;
    }

    const { data: priorMessages } = await supabase.from('ask_cube_messages')
      .select('role, content, tool_calls, tool_call_id, tool_name')
      .eq('conversation_id', conversationId).order('created_at').limit(30);

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `You are Cube, the family's assistant inside FamilyCube. Today is ${today}.
You're talking to ${viewerAlias} (role: ${member.role}).
Family members are referred to only by alias in this conversation (${viewerAlias}, etc) — never ask for or expect
real names, and always use the alias exactly as given in tool results and messages.
Answer questions about the family's schedule and chores using the tools available — always call a tool to check
real data before answering "what's going on" type questions; never guess or make up events/chores.
Location and health tools are sensitive and parent-only — if a non-parent asks, explain you can't share that.

When the user wants to add/schedule/plan something, DO NOT interrogate them with clarifying questions one field at a
time — that's slow and annoying in a chat. Instead, fill in every reasonable default yourself and call the propose
tool(s) immediately in the SAME turn, so the user reviews a real draft card and adjusts it there instead of answering
a Q&A. Only ask a clarifying question first if the request is genuinely ambiguous between two very different things
(e.g. "add the appointment" with no other context at all). Concretely:
- A vague craving/goal ("something with more protein", "a quick dinner") -> immediately call propose_meal 2-3 times
  with different specific dish ideas of your own invention (real dish names, real ingredient lists, realistic prep
  times, AND 3-6 short numbered prepSteps — always include cooking steps, not just a title and ingredient list)
  for the user to pick from — never ask "what dish?" first. Prefer well-known, classic dish names for these so a
  real Wikimedia Commons photo is likely to exist, and include imageUrl whenever you're confident one does.
- "tonight"/"today"/"tomorrow"/"this weekend" -> resolve to the real day name yourself using today's date, don't ask.
- No coin amount mentioned for a quest -> use a reasonable default (10-30 based on effort), don't ask.
- No specific person named -> propose it unassigned/for the open pool rather than asking who.
When the user asks to add/schedule something, use propose_event, propose_quest, propose_grocery_items, or propose_meal
as appropriate — these only PROPOSE, they do not create anything.
CRITICAL: after calling a propose_* tool, your reply text must be SHORT — one sentence like "Here's an idea for
tonight — take a look below" or "I've drafted a few options below, pick one that sounds good." The app already shows
a rich visual card with the full title/ingredients/details right under your message, so NEVER restate the dish name,
ingredient list, or any other proposal field in your reply text — that just duplicates the card and reads as clutter.
After a tool call returns, you MUST respond with a normal natural-language sentence summarizing the result for a
person to read. NEVER reply with raw JSON, a code block, or the tool's output verbatim — always turn it into plain
conversational text (e.g. "Nothing on the calendar today" or "${viewerAlias} has 2 chores approved and 1 pending").
Keep answers concise and conversational, not a bulleted data dump unless the user asked for a list.`;

    const aliasedMessage = realNameToAlias(aliasMap, allMembers ?? [], body.message);

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...(priorMessages ?? []).map(m => {
        if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, name: m.tool_name, content: m.content };
        if (m.tool_calls) return { role: 'assistant', content: m.content, tool_calls: m.tool_calls };
        return { role: m.role, content: m.content };
      }),
      { role: 'user', content: aliasedMessage },
    ];

    await supabase.from('ask_cube_messages').insert({ conversation_id: conversationId, role: 'user', content: body.message });

    // Collected across the WHOLE loop, not just the final round — a single
    // turn can call propose_meal several times (a few dish options for the
    // user to pick from), and each one needs its own card client-side.
    let proposals: { kind: 'event' | 'quest' | 'grocery' | 'meal'; data: any }[] = [];
    let finalText = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const reply = await callModel(messages, TOOLS);
      if (!reply) return json({ error: 'Model returned no reply' }, 502);

      if (reply.tool_calls?.length) {
        messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: reply.tool_calls });
        await supabase.from('ask_cube_messages').insert({
          conversation_id: conversationId, role: 'assistant', content: reply.content ?? null, tool_calls: reply.tool_calls,
        });

        for (const call of reply.tool_calls) {
          const args = JSON.parse(call.function.arguments || '{}');
          const result = await executeTool(supabase, call.function.name, args, member.family_id, member.id, member.role, member.name, aliasMap, allMembers ?? []);

          if (result.__proposal) {
            proposals.push({ kind: result.__proposal, data: result });
          }

          const resultStr = JSON.stringify(result);
          messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: resultStr });
          await supabase.from('ask_cube_messages').insert({
            conversation_id: conversationId, role: 'tool', tool_call_id: call.id, tool_name: call.function.name,
            content: resultStr, proposal: result.__proposal ? result : null,
            proposal_status: result.__proposal ? 'pending' : null,
          });
        }
        continue; // let the model see the tool results and respond
      }

      finalText = reply.content ?? '';
      break;
    }

    // Safety net: if the model ignored the system prompt and echoed a raw
    // tool payload back as its answer, don't ship that to the chat UI.
    const looksLikeRawJson = /^\s*[{[]/.test(finalText) && (() => { try { JSON.parse(finalText); return true; } catch { return false; } })();
    if (looksLikeRawJson || !finalText.trim()) {
      finalText = proposals.length
        ? (proposals.length > 1 ? "I've drafted a few options below — take a look and pick one." : "I've drafted that for you — take a look below and confirm if it looks right.")
        : "Here's what I found — let me know if you'd like more detail.";
    }
    finalText = aliasToRealName(aliasMap, finalText);

    await supabase.from('ask_cube_messages').insert({
      conversation_id: conversationId, role: 'assistant', content: finalText,
      proposal: proposals.length ? proposals : null, proposal_status: proposals.length ? 'pending' : null,
    });
    await supabase.from('ask_cube_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

    return json({ conversationId, answer: finalText, proposals });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});
