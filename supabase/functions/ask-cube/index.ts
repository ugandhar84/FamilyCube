// FamilyCube — Edge Function: ask-cube
// Agentic chat: answers "what's going on" across the family's schedule and
// chores, and can propose creating events/quests via tool-calling. Separate
// from family-ai's single-shot actions because this is a fundamentally
// different shape — multi-turn, stateful (persisted conversation), and uses
// real function-calling instead of one prompt -> one JSON reply.
//
// Model strategy: Gemini 2.5 Flash primary (functionDeclarations) — cheaper
// and faster than DeepSeek for this workload — DeepSeek fallback (OpenAI-
// compatible tools API) if Gemini's call fails for any reason.
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

// ─── Place aliasing (privacy) ────────────────────────────────────────────
// get_location's safe_zone_name (a free-text label a parent set up in the
// GPS tab's geofence editor — "Lincoln Elementary", "Grandma's House",
// "Dad's Office") is exactly as identifying as a real name, but was being
// sent to the LLM provider verbatim with no aliasing at all — the only
// privacy protection get_location actually had was dropping raw lat/lng
// and the encrypted street address, which the safe-zone label bypassed
// entirely. Same stable, deterministic, reversible scheme as buildAliasMap:
// built fresh per request from whatever zone names are actually present in
// this family's location rows, sorted for determinism. "Home" is kept
// as-is — it's a relative, non-identifying label every family shares, not
// a specific place — matching how the manual GPS UI already treats it as
// the default/fallback zone name.
type PlaceAliasMap = { toAlias: Map<string, string>; toReal: Map<string, string> };

function buildPlaceAliasMap(zoneNames: (string | null)[]): PlaceAliasMap {
  const toAlias = new Map<string, string>();
  const toReal = new Map<string, string>();
  const distinct = [...new Set(zoneNames.filter((z): z is string => !!z && z !== 'Home'))].sort();
  distinct.forEach((name, i) => {
    const alias = `Place ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`;
    toAlias.set(name, alias);
    toReal.set(alias, name);
  });
  return { toAlias, toReal };
}

function placeToAlias(map: PlaceAliasMap, name: string | null): string | null {
  if (!name) return name;
  return map.toAlias.get(name) ?? name; // 'Home' (or anything not in the map) passes through unchanged
}

function aliasToPlace(map: PlaceAliasMap, text: string | null | undefined): string {
  if (!text) return text ?? '';
  let out = text;
  for (const [alias, real] of map.toReal) out = out.split(alias).join(real);
  return out;
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
      name: 'get_schedule_conflicts',
      description: 'Find scheduling conflicts (double-bookings) in a date range — the same person or the same helper/driver assigned to two events less than 30 minutes apart. Use for "any conflicts today/this week", "is anyone double-booked".',
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
      name: 'get_free_time',
      description: 'Check who in the family has nothing scheduled at/around a specific date and time, or find a family member\'s open windows on a given day. Use for "who\'s free Saturday afternoon", "is anyone available at 3pm Tuesday", "when is Alex free tomorrow".',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD to check' },
          time: { type: 'string', description: 'HH:MM 24-hour, if a specific time was asked about — omit to just list the day\'s free gaps between events for everyone' },
          memberName: { type: 'string', description: 'Check just this one person\'s availability — omit to check everyone' },
        },
        required: ['date'],
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
      name: 'get_quest_pace',
      description: 'PARENT-ONLY. Compare how long a kid/teen typically takes to complete quests — time from claiming to submitting, plus on-time vs. late rate and current streak. Use for "how is X doing on chores lately", "is X slower than usual", "does X need encouragement" — a factual pace summary for the parent, never shown to or about-to-be-relayed-to the kid themselves.',
      parameters: {
        type: 'object',
        properties: {
          memberName: { type: 'string', description: 'Required — whose pace to check' },
        },
        required: ['memberName'],
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
      name: 'get_rewards',
      description: 'Get the family reward store\'s catalog, optionally for one member (their coin balance and which rewards they can currently afford/are eligible for). Use for "what can I redeem", "how many coins do I have", "what\'s in the reward store".',
      parameters: {
        type: 'object',
        properties: {
          memberName: { type: 'string', description: 'Whose balance/eligibility to check — omit to just list the catalog' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_redemption',
      description: 'Propose redeeming a reward from the store for a family member. Does NOT redeem it — returns a proposal the user must confirm. Use when the user asks to redeem/claim/cash in a reward (e.g. "redeem the movie night reward for Alex").',
      parameters: {
        type: 'object',
        properties: {
          rewardSearch: { type: 'string', description: 'Words to match the reward\'s title, e.g. "movie night"' },
          memberName:   { type: 'string', description: 'Who is redeeming it — required, coins are deducted from this specific person' },
        },
        required: ['rewardSearch', 'memberName'],
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
          alertCallLeadMinutes: {
            type: 'number',
            description: 'If the user wants a call-style reminder for this event, how many minutes before start it should ring (0 = at the exact time). Omit entirely if the user didn\'t ask for a reminder — do not default to one.',
          },
          recurrenceFrequency: {
            type: 'string', enum: ['daily', 'weekly', 'monthly'],
            description: 'Set this whenever the request describes something REPEATING, not a one-off — "every Thursday", "every evening", "every weekday", "each week" all mean this must be set. Omit entirely for a genuinely one-time event.',
          },
          recurrenceDays: {
            type: 'array', items: { type: 'number' },
            description: 'weekly recurrence only — which weekdays it repeats on, 0=Sunday..6=Saturday (e.g. "every Thursday" -> [4], "every weekday" -> [1,2,3,4,5]). Required if recurrenceFrequency is "weekly".',
          },
        },
        required: ['title', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_quest',
      description: 'Propose creating a quest/chore. Does NOT create it — returns a proposal the user must confirm. Use for choreable to-dos, not a fixed calendar appointment — but a quest CAN still carry a specific due time (e.g. "clean the dishwasher at 8 tonight" is a quest due today at 20:00, not a new calendar event).',
      parameters: {
        type: 'object',
        properties: {
          title:         { type: 'string' },
          coins:         { type: 'number' },
          memberName:    { type: 'string', description: 'Who this is assigned to, if named — omit for the open pool' },
          dueDate:       { type: 'string', description: 'YYYY-MM-DD, if a deadline was implied — resolve "today"/"tonight"/"tomorrow" yourself using the current date' },
          dueTime:       { type: 'string', description: 'HH:MM 24-hour, if a specific deadline time was implied (e.g. "at 8 tonight" -> "20:00", "by 5pm" -> "17:00"). Omit if no specific time was mentioned, even if dueDate is set.' },
          photoRequired: { type: 'boolean' },
          alertCallLeadMinutes: {
            type: 'number',
            description: 'If the user wants a call-style reminder for this chore\'s due time, how many minutes before it should ring (0 = at the exact time). Omit entirely if the user didn\'t ask for a reminder — do not default to one.',
          },
          recurrenceFrequency: {
            type: 'string', enum: ['daily', 'weekly', 'monthly'],
            description: 'Set this whenever the request describes something REPEATING, not a one-off — "every evening", "every Thursday", "daily", "each week" all mean this must be set. Omit entirely for a genuinely one-time chore.',
          },
          recurrenceDays: {
            type: 'array', items: { type: 'number' },
            description: 'weekly recurrence only — which weekdays it repeats on, 0=Sunday..6=Saturday. Required if recurrenceFrequency is "weekly".',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_update',
      description: 'Propose a change to an ALREADY-EXISTING event or chore the user refers to by description (e.g. "add a note to the soccer practice", "change the dishwasher chore\'s coins to 30", "move Alex\'s dentist reminder to 30 min before", "the trash chore — make it due Thursday instead"). Looks the record up by title/member/rough date so it is NOT duplicated as a new item — use this instead of propose_event/propose_quest whenever the user is clearly talking about something already created rather than asking to add something new. This also covers reminder-only changes (was a separate tool before — no longer). Does NOT change anything itself — returns a proposal the user must confirm. Only include the fields the user actually asked to change; never invent changes to fields they did not mention.',
      parameters: {
        type: 'object',
        properties: {
          targetType:   { type: 'string', enum: ['event', 'chore'], description: 'Which table to search — infer from context (e.g. "soccer practice"/"appointment" is an event, "dishwasher chore"/"trash duty" is a chore). Ask the user only if genuinely ambiguous.' },
          targetSearch: { type: 'string', description: 'Words to match the existing record\'s title, e.g. "soccer practice" or "dishwasher". For reschedule/move/postpone requests where the user only gave a generic noun ("the appointment", "the meeting"), still pass that generic noun here rather than leaving it blank or switching to propose_event — a weak search is better than silently creating a duplicate.' },
          memberName:   { type: 'string', description: 'Whose event/chore this is, if named — narrows the search when multiple records could match' },
          nearDate:     { type: 'string', description: 'YYYY-MM-DD if a rough date/day was implied ("this week", "Tuesday") — omit if not implied, search proceeds from today forward either way' },
          title:        { type: 'string', description: 'New title, only if the user asked to rename it' },
          date:         { type: 'string', description: 'Event only — new date, YYYY-MM-DD, only if the user asked to reschedule it' },
          time:         { type: 'string', description: 'Event only — new start time, HH:MM 24-hour, only if the user asked to change the time' },
          dueDate:      { type: 'string', description: 'Chore only — new due date, YYYY-MM-DD, only if the user asked to change when it\'s due' },
          dueTime:      { type: 'string', description: 'Chore only — new due time, HH:MM 24-hour, only if the user asked to change it' },
          notes:        { type: 'string', description: 'New notes/description text, only if the user asked to add or change a note — for a chore this is its description field' },
          coins:        { type: 'number', description: 'Chore only — new coin reward, only if the user asked to change it' },
          leadMinutes:  { type: 'number', description: 'New call-reminder lead time in minutes before start/due time (0 = at the exact time), only if the user asked to set/change a reminder. If they asked for a reminder but did not say how far ahead, use 15.' },
        },
        required: ['targetType', 'targetSearch'],
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
                store:    { type: 'string', description: 'Store name, only if the user named one explicitly (e.g. "add milk from Costco") — omit entirely if no store was mentioned, do not guess one' },
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
  {
    type: 'function',
    function: {
      name: 'propose_chore_action',
      description: 'Propose an ACTION on an already-existing chore/quest that changes its status — claiming an open pool chore for yourself, approving or declining a submitted/pending chore (parent/approver only), marking a claimed chore complete/done, or cancelling a chore entirely. Does NOT perform the action — returns a proposal card the user must confirm. Use this whenever the user asks to claim/take/approve/decline/finish/cancel a specific chore by name, e.g. "I\'ll take out the trash chore", "approve Leo\'s dishes", "cancel the garage cleanup", "mark the laundry chore done". Looks the chore up by title/member the same way propose_update does — never guess which chore if more than one matches.',
      parameters: {
        type: 'object',
        properties: {
          action:       { type: 'string', enum: ['claim', 'approve', 'decline', 'complete', 'cancel'], description: 'claim = take an open pool chore for the asking user; approve/decline = a parent/approver reviewing a submitted chore; complete = mark a chore the asking user already holds as done; cancel = remove the chore entirely (creator/parent only)' },
          targetSearch: { type: 'string', description: 'Words to match the chore\'s title, e.g. "trash" or "clean the garage"' },
          memberName:   { type: 'string', description: 'Whose chore this is, if named — narrows the search when multiple chores could match. For "claim", omit this — the chore is claimed for whoever is chatting right now, not a named third party.' },
          reason:       { type: 'string', description: 'decline/cancel only — the reason given, if the user stated one' },
        },
        required: ['action', 'targetSearch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_cancel_event',
      description: 'Propose CANCELLING (deleting) an already-existing calendar event entirely — never for a chore (use propose_chore_action with action: "cancel" for that instead). Does NOT delete anything — returns a proposal card the user must confirm. Use whenever the user asks to cancel/delete/remove an event by description, e.g. "cancel my dentist appointment", "delete the soccer practice on Saturday", "remove Leo\'s orthodontist visit — it\'s not happening". Looks the event up by title/member/rough date the same way propose_update does — never guess which event if more than one matches, and never silently reinterpret this as a reschedule (propose_update) unless the user actually asked to move it to a new date instead of removing it.',
      parameters: {
        type: 'object',
        properties: {
          targetSearch: { type: 'string', description: 'Words to match the event\'s title, e.g. "dentist" or "soccer practice". A generic noun ("the appointment") is fine if that\'s all the user gave — still call this rather than doing nothing.' },
          memberName:   { type: 'string', description: 'Whose event this is, if named — narrows the search when multiple events could match' },
          nearDate:     { type: 'string', description: 'YYYY-MM-DD if a rough date/day was implied ("Saturday", "next week") — omit if not implied' },
          reason:       { type: 'string', description: 'The reason given for cancelling, if the user stated one' },
        },
        required: ['targetSearch'],
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
  // Was .find(...) + a hardcoded single-element tool_calls array — Gemini
  // can return MULTIPLE functionCall parts in one response (e.g. the
  // system prompt's own "call get_schedule AND get_quests together, same
  // turn" instruction for broad questions), and .find() silently dropped
  // every call after the first. The main loop still eventually got a
  // correct answer via extra MAX_TOOL_ROUNDS retries, but that's an
  // accidental safety net, not the intended one-round parallel-call
  // behavior DeepSeek's tool_calls array already supported natively.
  // Collect every functionCall part instead, matching that same shape.
  const fnCalls = parts.filter((p: any) => p.functionCall);
  if (fnCalls.length) {
    return {
      role: 'assistant',
      content: null,
      tool_calls: fnCalls.map((p: any, i: number) => ({
        id: `gemini_${Date.now()}_${i}`, type: 'function',
        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
      })),
    };
  }
  const text = parts.map((p: any) => p.text ?? '').join('');
  return { role: 'assistant', content: text };
}

async function callModel(messages: unknown[], tools: unknown[]) {
  try { return await callGemini(messages as any[], tools); }
  catch (err) {
    console.warn('[ask-cube] Gemini failed, falling back to DeepSeek:', (err as Error).message);
    return callDeepSeek(messages, tools);
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
  // Exact full-name or exact-first-name match only — a plain substring test
  // in either direction (the old behavior) would match "Ana" against
  // "Anna" and vice versa, or "Sam" against "Samantha", silently assigning
  // a proposal to the wrong kid instead of failing to resolve (QA — Ask
  // Cube audit, High: misspelled/wrong-name requests must not silently
  // misassign). A real miss should come back null so the caller can flag
  // "couldn't find that person" instead of guessing.
  const match = (data ?? []).find((m: any) => {
    const full = m.name.toLowerCase().trim();
    const first = full.split(' ')[0];
    return full === lower || first === lower;
  });
  return match?.id ?? null;
}

// Viewer-role scoping — matches HubTimelineSection's belongsToMe: a kid/teen
// only sees their own events + family-wide (no-assignee) events, never a
// sibling's personal schedule. Parents/seniors see everything. Also counts
// as "mine" when the viewer is named as the ride helper or driver on the
// event (helper_name/driver_name are free-text real names, not member ids) —
// belongsToMe checks these too, and without it a teen who's driving a
// sibling to practice wouldn't see that ride at all when asking Ask Cube
// "what's going on this week" (QA — Ask Cube audit).
function scopeEventsToViewer(events: any[], viewerRole: string, viewerId: string, viewerName: string) {
  if (viewerRole === 'parent' || viewerRole === 'senior') return events;
  return events.filter(e => {
    const hasAssignee = e.member_id || (e.member_ids && e.member_ids.length);
    if (!hasAssignee) return true;
    if (e.member_id === viewerId) return true;
    if (e.member_ids?.includes(viewerId)) return true;
    if (e.helper_name === viewerName) return true;
    if (e.driver_name === viewerName) return true;
    return false;
  });
}

async function executeTool(
  supabase: any, name: string, args: any,
  familyId: string, viewerId: string, viewerRole: string, viewerName: string,
  aliasMap: AliasMap, members: { id: string; name: string }[], placeAliasMap: PlaceAliasMap,
  today: string,
) {
  if (name === 'get_schedule') {
    const { data, error } = await supabase.from('calendar_events')
      .select('title, category, date, start_time, member_id, member_ids, helper_name, helper_status, driver_name, driver_status')
      .eq('family_id', familyId)
      .gte('date', args.startDate).lte('date', args.endDate)
      .is('deleted_at', null)
      .order('date').order('start_time');
    if (error) return { error: error.message };
    const scoped = scopeEventsToViewer(data ?? [], viewerRole, viewerId, viewerName);
    return { events: scoped.map((e: any) => ({
      // A parent-written title/notes can freely contain a real name
      // ("Take Sarah to Dr. Patel") — realNameToAlias scrubs it the same
      // way memberName/helper/driver already were, closing a gap where
      // free-text fields bypassed the aliasing scheme entirely.
      title: realNameToAlias(aliasMap, members, e.title), category: e.category, date: e.date, time: e.start_time,
      helper: e.helper_name ? realNameToAlias(aliasMap, members, e.helper_name) : null,
      helperStatus: e.helper_status,
      driver: e.driver_name ? realNameToAlias(aliasMap, members, e.driver_name) : null,
      driverStatus: e.driver_status,
    })) };
  }

  if (name === 'get_schedule_conflicts') {
    const { data, error } = await supabase.from('calendar_events')
      .select('id, title, category, date, start_time, member_id, helper_name, helper_status')
      .eq('family_id', familyId)
      .gte('date', args.startDate).lte('date', args.endDate)
      .is('deleted_at', null).not('start_time', 'is', null)
      .order('date').order('start_time');
    if (error) return { error: error.message };
    const scoped = scopeEventsToViewer(data ?? [], viewerRole, viewerId, viewerName);
    // Same <30-min overlap window and two conflict classes (same person
    // double-booked; same helper/driver assigned twice) ParentView.tsx's
    // own client-side Hub banner already uses — ported here rather than
    // reimplemented differently, so Ask Cube's answer always agrees with
    // what the Hub itself would flag.
    const minutesBetween = (t1: string, t2: string) => {
      const [h1, m1] = t1.split(':').map(Number);
      const [h2, m2] = t2.split(':').map(Number);
      return Math.abs((h1 * 60 + m1) - (h2 * 60 + m2));
    };
    const conflicts: { eventA: string; eventB: string; date: string; reason: string }[] = [];
    const byDate = new Map<string, any[]>();
    for (const e of scoped) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    }
    for (const [date, dayEvents] of byDate) {
      for (let i = 0; i < dayEvents.length; i++) {
        for (let j = i + 1; j < dayEvents.length; j++) {
          const a = dayEvents[i], b = dayEvents[j];
          if (minutesBetween(a.start_time, b.start_time) >= 30) continue;
          if (a.member_id && a.member_id === b.member_id) {
            conflicts.push({
              eventA: realNameToAlias(aliasMap, members, a.title), eventB: realNameToAlias(aliasMap, members, b.title),
              date, reason: `${aliasMap.toAlias.get(a.member_id) ?? 'Someone'} is double-booked`,
            });
          } else if (a.helper_name && a.helper_name === b.helper_name && a.helper_status !== 'rejected' && b.helper_status !== 'rejected') {
            conflicts.push({
              eventA: realNameToAlias(aliasMap, members, a.title), eventB: realNameToAlias(aliasMap, members, b.title),
              date, reason: `${realNameToAlias(aliasMap, members, a.helper_name)} is assigned to both`,
            });
          }
        }
      }
    }
    return { conflicts };
  }

  if (name === 'get_free_time') {
    const { data, error } = await supabase.from('calendar_events')
      .select('title, date, start_time, end_time, member_id, member_ids')
      .eq('family_id', familyId).eq('date', args.date)
      .is('deleted_at', null).not('start_time', 'is', null)
      .order('start_time');
    if (error) return { error: error.message };
    const scoped = scopeEventsToViewer(data ?? [], viewerRole, viewerId, viewerName);
    let targetId: string | null = null;
    if (args.memberName) {
      targetId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
      if (!targetId) return { error: `Couldn't find a family member named "${args.memberName}".` };
    }
    const relevant = targetId
      ? scoped.filter((e: any) => e.member_id === targetId || e.member_ids?.includes(targetId))
      : scoped;
    if (args.time) {
      // "Is X free at 3pm" — busy only if an event's [start, end) window
      // actually covers that instant, not just "something's on that day."
      const askedMinutes = (() => { const [h, m] = args.time.split(':').map(Number); return h * 60 + m; })();
      const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const busyWith = relevant.filter((e: any) => {
        const start = toMinutes(e.start_time);
        const end = e.end_time ? toMinutes(e.end_time) : start + 60; // no end_time on file -> assume 1hr block
        return askedMinutes >= start && askedMinutes < end;
      });
      return {
        checkedTime: args.time,
        busy: busyWith.map((e: any) => ({
          person: e.member_id ? (aliasMap.toAlias.get(e.member_id) ?? 'Someone') : 'Family',
          title: realNameToAlias(aliasMap, members, e.title),
        })),
      };
    }
    // No specific time — list the day's busy blocks so the model can reason
    // about gaps between them itself, rather than this function guessing
    // what counts as a "usable" free window.
    return {
      busyBlocks: relevant.map((e: any) => ({
        person: e.member_id ? (aliasMap.toAlias.get(e.member_id) ?? 'Someone') : 'Family',
        title: realNameToAlias(aliasMap, members, e.title), start: e.start_time, end: e.end_time,
      })),
    };
  }

  if (name === 'get_quest_pace') {
    if (viewerRole !== 'parent') return { error: 'Quest pace is only available to parents.' };
    const id = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
    if (!id) return { error: `Couldn't find a family member named "${args.memberName}".` };
    const { data: recent, error } = await supabase.from('chore_tasks')
      .select('created_at, submitted_at, due_date, status')
      .eq('family_id', familyId).eq('assigned_to_id', id)
      .in('status', ['approved', 'auto_approved', 'completed'])
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false }).limit(20);
    if (error) return { error: error.message };
    const rows = recent ?? [];
    if (rows.length < 3) {
      return { note: 'Not enough completed quest history yet to compare pace meaningfully (fewer than 3 recent completions).' };
    }
    // Split the last 20 into an older baseline half and a recent half —
    // comparing recent pace against the SAME kid's own history, not an
    // arbitrary external standard, so "slower than usual" actually means
    // something for that specific kid's normal rhythm.
    const durationHours = (r: any) => (new Date(r.submitted_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000;
    const mid = Math.floor(rows.length / 2);
    const recentHalf = rows.slice(0, mid);
    const olderHalf = rows.slice(mid);
    const avg = (arr: any[]) => arr.reduce((s, r) => s + durationHours(r), 0) / arr.length;
    const { data: member } = await supabase.from('members').select('streak').eq('id', id).single();
    const lateCount = rows.filter((r: any) => r.due_date && r.submitted_at && r.submitted_at.slice(0, 10) > r.due_date).length;
    return {
      person: aliasMap.toAlias.get(id) ?? 'Unknown',
      recentAvgHoursToComplete: Math.round(avg(recentHalf) * 10) / 10,
      priorAvgHoursToComplete: Math.round(avg(olderHalf) * 10) / 10,
      lateOutOfLast: `${lateCount}/${rows.length}`,
      currentStreak: member?.streak ?? 0,
    };
  }

  if (name === 'get_quests') {
    let query = supabase.from('chore_tasks').select('id, title, status, coins_reward, due_date, assigned_to_id').eq('family_id', familyId);
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
    // assigned_to_id is a raw member id — useless to the model on its own
    // (it can't say WHO a chore belongs to, e.g. "is anyone overdue" has no
    // answer without a name). Resolve it to the same alias the rest of the
    // conversation uses instead of leaking the id or a real name.
    // __choreRefs carries the real (id, title) pairs back to the OUTER loop
    // only — stripped before the result is stringified for the model (see
    // its JSON.stringify call site) so the model itself never sees a raw
    // chore id, same boundary the alias system already enforces for names.
    // The client uses these to turn a chore's title, wherever it appears in
    // the model's own reply text, into a tap-through link to that chore.
    return {
      quests: rows.map((r: any) => ({
        title: realNameToAlias(aliasMap, members, r.title), status: r.status, coins: r.coins_reward, dueDate: r.due_date,
        assignedTo: r.assigned_to_id ? (aliasMap.toAlias.get(r.assigned_to_id) ?? 'Unknown') : null,
      })),
      __choreRefs: rows.map((r: any) => ({ id: r.id, title: r.title })),
    };
  }

  if (name === 'get_chore_history') {
    let query = supabase.from('chore_tasks').select('id, title, status, coins_reward, completed_at, assigned_to_id')
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
    return {
      completed: rows.map((r: any) => ({
        title: realNameToAlias(aliasMap, members, r.title), status: r.status, coins: r.coins_reward, completedAt: r.completed_at,
        assignedTo: r.assigned_to_id ? (aliasMap.toAlias.get(r.assigned_to_id) ?? 'Unknown') : null,
      })),
      __choreRefs: rows.map((r: any) => ({ id: r.id, title: r.title })),
    };
  }

  if (name === 'get_location') {
    if (viewerRole !== 'parent') return { error: 'Location is only available to parents.' };
    // address deliberately not selected — status/safe_zone_name/distance are
    // the only fields this tool has ever returned to the model.
    let query = supabase.from('member_locations').select('member_id, status, safe_zone_name, distance_from_home_miles, updated_at').eq('family_id', familyId);
    if (args.memberName) {
      const id = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
      if (id) query = query.eq('member_id', id);
    }
    const { data, error } = await query;
    if (error) return { error: error.message };
    // Only ever aliased status/zone info leaves this function — no raw
    // lat/lng and no home address, and safe_zone_name (a parent-chosen
    // label like "Lincoln Elementary" or "Grandma's House" — just as
    // identifying as a real name) is now aliased too, via the request-level
    // placeAliasMap so the same "Place A" stays consistent across every
    // get_location call in this turn.
    return {
      locations: (data ?? []).map((r: any) => ({
        person: aliasMap.toAlias.get(r.member_id) ?? 'Unknown',
        status: r.status, place: placeToAlias(placeAliasMap, r.safe_zone_name ?? null),
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

  if (name === 'propose_update') {
    let memberId: string | null = null;
    if (args.memberName) memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
    const search = args.targetSearch ?? '';

    if (args.targetType === 'chore') {
      let query = supabase.from('chore_tasks')
        .select('id, title, status, coins_reward, due_date, due_time, assigned_to_id, description, alert_call, alert_call_lead_minutes')
        .eq('family_id', familyId)
        .ilike('title', `%${search}%`);
      if (memberId) query = query.eq('assigned_to_id', memberId);
      const { data, error } = await query.limit(5);
      if (error) return { error: error.message };
      let candidates = data ?? [];
      if (viewerRole !== 'parent' && viewerRole !== 'senior') {
        candidates = candidates.filter((r: any) => !r.assigned_to_id || r.assigned_to_id === viewerId);
      }
      if (!candidates.length) {
        // Household terms like "trash"/"laundry" can be EITHER a kid's
        // chore or a parent's own calendar event (e.g. logging municipal
        // trash pickup day as a reminder, not a chore) — targetType is a
        // single upfront guess, so a miss here doesn't necessarily mean
        // nothing exists, just that it's filed under the other table.
        // Check before giving up, so "reschedule the trash to Thursday"
        // doesn't fail outright when it's actually an event, not a chore.
        const { data: eventFallback } = await supabase.from('calendar_events')
          .select('id, title, date, start_time')
          .eq('family_id', familyId).is('deleted_at', null)
          .ilike('title', `%${search}%`).gte('date', today).order('date').limit(5);
        if (eventFallback && eventFallback.length > 0) {
          return {
            error: `No chore matched "${search}", but a matching EVENT was found instead. Call propose_update again with targetType: 'event' (not 'chore') for this — do not tell the user nothing was found.`,
            candidates: eventFallback.map((e: any) => ({ title: realNameToAlias(aliasMap, members, e.title), date: e.date, time: e.start_time })),
          };
        }
        return { error: `Couldn't find a chore matching "${search}"${args.memberName ? ` for ${args.memberName}` : ''}. Tell the user plainly that nothing matched — don't guess or update something unrelated.` };
      }
      if (candidates.length > 1) {
        return {
          error: 'Multiple matching chores found — ask the user which one they mean before proposing an update. Do not guess.',
          candidates: candidates.map((c: any) => ({ title: realNameToAlias(aliasMap, members, c.title), dueDate: c.due_date, assignedTo: c.assigned_to_id ? (aliasMap.toAlias.get(c.assigned_to_id) ?? 'Unknown') : null })),
        };
      }
      const chore = candidates[0];
      // Only ever include a field the model actually supplied a value for —
      // an omitted field means "not asked to change," never "clear it."
      const changes: Record<string, any> = {};
      if (typeof args.title === 'string') changes.title = args.title;
      if (typeof args.dueDate === 'string') changes.dueDate = args.dueDate;
      if (typeof args.dueTime === 'string' && /^\d{2}:\d{2}$/.test(args.dueTime)) changes.dueTime = args.dueTime;
      if (typeof args.notes === 'string') changes.description = args.notes;
      // ChoreTask's real field is coinsReward (store/choreStore.ts), not
      // "coins" — updateChore's DB patch builder keys off `'coinsReward' in
      // updates` via plain `in` checks, so a mismatched key here would
      // silently no-op the write with no error at all.
      if (typeof args.coins === 'number') changes.coinsReward = args.coins;
      if (typeof args.leadMinutes === 'number') { changes.alertCall = true; changes.alertCallLeadMinutes = args.leadMinutes; }
      if (!Object.keys(changes).length) {
        return { error: 'No actual field changes were specified — ask the user what they want changed about this chore.' };
      }
      return {
        __proposal: 'update_chore',
        choreId: chore.id, title: realNameToAlias(aliasMap, members, chore.title), status: chore.status,
        currentDueDate: chore.due_date, currentDueTime: chore.due_time, currentCoins: chore.coins_reward,
        changes,
      };
    }

    // targetType === 'event' (default)
    let query = supabase.from('calendar_events')
      .select('id, title, category, date, start_time, member_id, member_ids, helper_name, driver_name, alert_call, alert_call_lead_minutes, notes')
      .eq('family_id', familyId).is('deleted_at', null)
      .ilike('title', `%${search}%`);
    if (args.nearDate) query = query.gte('date', args.nearDate);
    else query = query.gte('date', today); // don't match past events by default, family-local "today"
    if (memberId) query = query.or(`member_id.eq.${memberId},member_ids.cs.{${memberId}}`);
    const { data, error } = await query.order('date').limit(5);
    if (error) return { error: error.message };
    let candidates = scopeEventsToViewer(data ?? [], viewerRole, viewerId, viewerName);
    if (!candidates.length) {
      // Same reciprocal check as the chore branch above — a household term
      // could be filed as a chore instead of an event.
      const { data: choreFallback } = await supabase.from('chore_tasks')
        .select('id, title, due_date, due_time, assigned_to_id')
        .eq('family_id', familyId).ilike('title', `%${search}%`).limit(5);
      if (choreFallback && choreFallback.length > 0) {
        return {
          error: `No event matched "${search}", but a matching CHORE was found instead. Call propose_update again with targetType: 'chore' (not 'event') for this — do not tell the user nothing was found.`,
          candidates: choreFallback.map((c: any) => ({ title: realNameToAlias(aliasMap, members, c.title), dueDate: c.due_date, assignedTo: c.assigned_to_id ? (aliasMap.toAlias.get(c.assigned_to_id) ?? 'Unknown') : null })),
        };
      }
      return { error: `Couldn't find an upcoming event matching "${search}"${args.memberName ? ` for ${args.memberName}` : ''}. Tell the user plainly that nothing matched — don't guess or update something unrelated. Offer to create a new event instead if that seems to be what they actually want.` };
    }
    if (candidates.length > 1) {
      return {
        error: 'Multiple matching events found — ask the user which one they mean before proposing an update. Do not guess.',
        candidates: candidates.map((e: any) => ({ title: realNameToAlias(aliasMap, members, e.title), date: e.date, time: e.start_time })),
      };
    }
    const ev = candidates[0];
    const changes: Record<string, any> = {};
    if (typeof args.title === 'string') changes.title = args.title;
    if (typeof args.date === 'string') changes.date = args.date;
    if (typeof args.time === 'string') changes.time = args.time;
    if (typeof args.notes === 'string') changes.notes = args.notes;
    if (typeof args.leadMinutes === 'number') { changes.alertCall = true; changes.alertCallLeadMinutes = args.leadMinutes; }
    if (!Object.keys(changes).length) {
      return { error: 'No actual field changes were specified — ask the user what they want changed about this event.' };
    }
    return {
      __proposal: 'update_event',
      eventId: ev.id, title: realNameToAlias(aliasMap, members, ev.title), date: ev.date, time: ev.start_time,
      changes,
    };
  }

  if (name === 'propose_cancel_event') {
    let memberId: string | null = null;
    if (args.memberName) memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
    const search = args.targetSearch ?? '';
    let query = supabase.from('calendar_events')
      .select('id, title, category, date, start_time, member_id, member_ids')
      .eq('family_id', familyId).is('deleted_at', null)
      .ilike('title', `%${search}%`);
    if (args.nearDate) query = query.gte('date', args.nearDate);
    else query = query.gte('date', today);
    if (memberId) query = query.or(`member_id.eq.${memberId},member_ids.cs.{${memberId}}`);
    const { data, error } = await query.order('date').limit(5);
    if (error) return { error: error.message };
    let candidates = scopeEventsToViewer(data ?? [], viewerRole, viewerId, viewerName);
    if (!candidates.length) {
      return { error: `Couldn't find an upcoming event matching "${search}"${args.memberName ? ` for ${args.memberName}` : ''}. Tell the user plainly that nothing matched — don't guess or cancel something unrelated.` };
    }
    if (candidates.length > 1) {
      return {
        error: 'Multiple matching events found — ask the user which one they mean before proposing a cancellation. Do not guess.',
        candidates: candidates.map((e: any) => ({ title: realNameToAlias(aliasMap, members, e.title), date: e.date, time: e.start_time })),
      };
    }
    const ev = candidates[0];
    return {
      __proposal: 'cancel_event',
      eventId: ev.id, title: realNameToAlias(aliasMap, members, ev.title), date: ev.date, time: ev.start_time,
      reason: typeof args.reason === 'string' ? args.reason : undefined,
    };
  }

  if (name === 'get_rewards') {
    const { data, error } = await supabase.from('rewards')
      .select('id, title, cost, available, eligible_member_ids, max_per_member')
      .eq('family_id', familyId).eq('available', true);
    if (error) return { error: error.message };
    let memberId: string | null = null;
    let mainCoins: number | null = null;
    if (args.memberName) {
      memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
      if (memberId) {
        const { data: m } = await supabase.from('members').select('main_coins').eq('id', memberId).single();
        mainCoins = m?.main_coins ?? 0;
      }
    }
    return {
      // Same non-name-leak treatment as every other free-text title above.
      rewards: (data ?? []).map((r: any) => ({
        title: realNameToAlias(aliasMap, members, r.title), cost: r.cost,
        eligible: !r.eligible_member_ids?.length || !memberId || r.eligible_member_ids.includes(memberId),
        affordable: mainCoins != null ? mainCoins >= r.cost : null,
      })),
      ...(memberId ? { balance: mainCoins } : {}),
    };
  }

  if (name === 'propose_redemption') {
    const memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
    if (!memberId) {
      return { error: `Couldn't find a family member named "${args.memberName}". Tell the user plainly rather than guessing who they meant.` };
    }
    const search = args.rewardSearch ?? '';
    const { data, error } = await supabase.from('rewards')
      .select('id, title, cost, available, eligible_member_ids, max_per_member')
      .eq('family_id', familyId).eq('available', true).ilike('title', `%${search}%`).limit(5);
    if (error) return { error: error.message };
    const candidates = data ?? [];
    if (!candidates.length) {
      return { error: `Couldn't find an available reward matching "${search}". Tell the user plainly that nothing matched — don't guess.` };
    }
    if (candidates.length > 1) {
      return {
        error: 'Multiple matching rewards found — ask the user which one they mean before proposing a redemption. Do not guess.',
        candidates: candidates.map((r: any) => ({ title: realNameToAlias(aliasMap, members, r.title), cost: r.cost })),
      };
    }
    const reward = candidates[0];
    if (reward.eligible_member_ids?.length && !reward.eligible_member_ids.includes(memberId)) {
      return { error: `"${reward.title}" isn't eligible for ${args.memberName}. Tell the user plainly rather than proposing a redemption that would be rejected.` };
    }
    const { data: m } = await supabase.from('members').select('main_coins').eq('id', memberId).single();
    const balance = m?.main_coins ?? 0;
    if (balance < reward.cost) {
      return { error: `${args.memberName} only has ${balance} coins — "${reward.title}" costs ${reward.cost}. Tell the user plainly rather than proposing a redemption that would fail.` };
    }
    // Client-side redeemReward (store/rewardStore.ts) owns the actual coin
    // deduction/eligibility re-check and insert — this tool only verifies
    // up front so the proposal card the user sees is accurate, same
    // division of responsibility as every other propose_* tool in this file.
    return {
      __proposal: 'redemption',
      rewardId: reward.id, title: realNameToAlias(aliasMap, members, reward.title), cost: reward.cost,
      memberId, memberAlias: aliasMap.toAlias.get(memberId) ?? args.memberName,
      currentBalance: balance,
    };
  }

  if (name === 'propose_event') {
    let memberId: string | null = null;
    // Distinguish "no name given" (fine — open/unassigned) from "a name was
    // given but didn't match anyone" (a misspelling or a name that doesn't
    // exist in this family) — the latter used to fail silently into an
    // unassigned proposal with no signal at all, so a parent could confirm
    // a "clean the dishwasher" card meant for a specific kid and it would
    // quietly land in the open pool instead (QA — Ask Cube audit, High).
    let unresolvedName: string | null = null;
    if (args.memberName) {
      memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
      if (!memberId) unresolvedName = args.memberName;
    }
    // alertCallLeadMinutes is opt-in — undefined/null means "no reminder
    // requested," matching the manual EventFormModal's own alertCall
    // boolean staying false by default. Only set alertCall true when the
    // model actually returned a lead time, never invent one.
    const alertCallLeadMinutes = typeof args.alertCallLeadMinutes === 'number' ? args.alertCallLeadMinutes : null;
    // A request phrased as repeating ("every Thursday", "every evening")
    // previously had nowhere to go — this tool had no recurrence field at
    // all, so it silently became a single one-off event with no signal to
    // the user that the "every ___" part was dropped. Only set a rule when
    // the model actually named a frequency; weekly requires real days.
    const recurrenceRule = args.recurrenceFrequency
      ? {
          frequency: args.recurrenceFrequency,
          ...(args.recurrenceFrequency === 'weekly' && Array.isArray(args.recurrenceDays) && args.recurrenceDays.length
            ? { days: args.recurrenceDays } : {}),
        }
      : null;
    return {
      __proposal: 'event',
      title: args.title, category: args.category ?? 'Other',
      startAt: args.startAt ?? null, memberId, notes: args.notes ?? null,
      alertCall: alertCallLeadMinutes != null, alertCallLeadMinutes,
      recurrenceRule,
      ...(unresolvedName ? { _unresolvedName: unresolvedName } : {}),
    };
  }

  if (name === 'propose_quest') {
    let memberId: string | null = null;
    let unresolvedName: string | null = null;
    if (args.memberName) {
      memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
      if (!memberId) unresolvedName = args.memberName;
    }
    const alertCallLeadMinutes = typeof args.alertCallLeadMinutes === 'number' ? args.alertCallLeadMinutes : null;
    // HH:MM only — anything else the model might send (e.g. "8pm", "20:00:00")
    // gets dropped rather than written as-is, since dueTime feeds a plain
    // time-of-day column with no format validation of its own downstream.
    const dueTime = typeof args.dueTime === 'string' && /^\d{2}:\d{2}$/.test(args.dueTime) ? args.dueTime : null;
    const recurrenceRule = args.recurrenceFrequency
      ? {
          frequency: args.recurrenceFrequency,
          ...(args.recurrenceFrequency === 'weekly' && Array.isArray(args.recurrenceDays) && args.recurrenceDays.length
            ? { days: args.recurrenceDays } : {}),
        }
      : null;
    return {
      __proposal: 'quest',
      title: args.title, coins: args.coins ?? 20, memberId,
      dueDate: args.dueDate ?? null, dueTime, photoRequired: args.photoRequired ?? false,
      alertCall: alertCallLeadMinutes != null, alertCallLeadMinutes,
      recurrenceRule,
      ...(unresolvedName ? { _unresolvedName: unresolvedName } : {}),
    };
  }

  if (name === 'propose_grocery_items') {
    return {
      __proposal: 'grocery',
      items: (args.items ?? []).map((it: any) => ({
        name: it.name, quantity: it.quantity ?? null, category: it.category ?? 'Other',
        store: typeof it.store === 'string' && it.store.trim() ? it.store.trim() : null,
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

  if (name === 'propose_chore_action') {
    const action = args.action as 'claim' | 'approve' | 'decline' | 'complete' | 'cancel';
    let memberId: string | null = null;
    if (args.memberName) memberId = await resolveMemberId(supabase, familyId, args.memberName, aliasMap);
    const search = args.targetSearch ?? '';

    let query = supabase.from('chore_tasks')
      .select('id, title, status, is_pool, assigned_to_id, created_by_id, photo_required')
      .eq('family_id', familyId)
      .ilike('title', `%${search}%`);
    if (memberId) query = query.eq('assigned_to_id', memberId);
    const { data, error } = await query.limit(5);
    if (error) return { error: error.message };
    let candidates = data ?? [];
    if (viewerRole !== 'parent' && viewerRole !== 'senior') {
      candidates = candidates.filter((r: any) => !r.assigned_to_id || r.assigned_to_id === viewerId || r.is_pool);
    }
    if (!candidates.length) {
      return { error: `Couldn't find a chore matching "${search}"${args.memberName ? ` for ${args.memberName}` : ''}. Tell the user plainly that nothing matched — don't guess.` };
    }
    if (candidates.length > 1) {
      return {
        error: 'Multiple matching chores found — ask the user which one they mean before proposing this action. Do not guess.',
        candidates: candidates.map((c: any) => ({ title: realNameToAlias(aliasMap, members, c.title), status: c.status, assignedTo: c.assigned_to_id ? (aliasMap.toAlias.get(c.assigned_to_id) ?? 'Unknown') : null })),
      };
    }
    const chore = candidates[0];

    if (action === 'claim') {
      if (!chore.is_pool || chore.assigned_to_id) {
        return { error: `"${chore.title}" isn't open to claim right now (${chore.assigned_to_id ? 'already taken' : 'not in the open pool'}). Tell the user plainly rather than proposing a claim that would fail.` };
      }
    } else if (action === 'approve' || action === 'decline') {
      if (viewerRole !== 'parent' && viewerRole !== 'senior') {
        return { error: 'Only a parent or approver can approve/decline a chore. Tell the user plainly.' };
      }
      if (chore.status !== 'pending_approval') {
        return { error: `"${chore.title}" isn't waiting for approval right now (status: ${chore.status}). Tell the user plainly rather than proposing an approval that would fail.` };
      }
    } else if (action === 'complete') {
      if (chore.assigned_to_id !== viewerId) {
        return { error: `"${chore.title}" isn't currently held by the person chatting, so they can't mark it complete themselves. Tell the user plainly.` };
      }
      if (chore.photo_required) {
        return { error: `"${chore.title}" requires a photo to submit — that has to be done from the Quests tab, not through chat. Tell the user plainly.` };
      }
    } else if (action === 'cancel') {
      if (viewerRole !== 'parent' && viewerRole !== 'senior' && chore.created_by_id !== viewerId) {
        return { error: `Only "${chore.title}"'s creator or a parent can cancel it. Tell the user plainly.` };
      }
    }

    return {
      __proposal: 'chore_action',
      choreId: chore.id, title: realNameToAlias(aliasMap, members, chore.title), status: chore.status,
      action, reason: typeof args.reason === 'string' ? args.reason : null,
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

    // Deliberately logs the RAW user message and memberId, not the aliased
    // version — this is server-side Deno function log output (Supabase
    // dashboard/CLI only, never sent to the LLM provider or the client),
    // so it's fine for debugging to see real content here. Never log
    // anything AFTER aliasing is applied as if it were the raw input, and
    // never let this log line leak into any response sent back to a client.
    console.log('[ask-cube] request', { memberId: body.memberId, conversationId: body.conversationId ?? '(new)', message: body.message });

    const { data: member } = await supabase.from('members').select('id, name, role, family_id, timezone').eq('id', body.memberId).single();
    if (!member) return json({ error: 'Member not found' }, 404);

    const { data: allMembers } = await supabase.from('members').select('id, name').eq('family_id', member.family_id);
    const aliasMap = buildAliasMap(allMembers ?? []);
    const viewerAlias = aliasMap.toAlias.get(member.id) ?? member.name;

    // Built once per request, from every safe-zone name currently on file for
    // this family, so the SAME alias ("Place A") is used consistently across
    // however many get_location calls happen in this turn's tool loop, and
    // survives to de-alias the final answer text too. Only parents can ever
    // reach get_location (see its own role check below), so this query is
    // skipped entirely for a kid/teen/senior viewer — no location data is
    // read for them at all, not even to build an alias map.
    let placeAliasMap: PlaceAliasMap = { toAlias: new Map(), toReal: new Map() };
    if (member.role === 'parent') {
      const { data: locRows } = await supabase.from('member_locations')
        .select('safe_zone_name').eq('family_id', member.family_id);
      placeAliasMap = buildPlaceAliasMap((locRows ?? []).map((r: any) => r.safe_zone_name));
    }

    // Load or create the conversation. Title is generated once, here, from
    // the first user message — cheap and reliable (no extra model call just
    // for titling) and matches what the history list needs to show a real
    // label instead of "Untitled"/null. Truncated to a word boundary rather
    // than a hard character cut so it doesn't end mid-word in the list.
    let conversationId = body.conversationId;
    if (!conversationId) {
      const rawTitle = body.message.trim().replace(/\s+/g, ' ');
      const title = rawTitle.length <= 60 ? rawTitle : `${rawTitle.slice(0, 60).replace(/\s+\S*$/, '')}…`;
      const { data: conv, error: convErr } = await supabase.from('ask_cube_conversations')
        .insert({ family_id: member.family_id, member_id: member.id, title: title || 'New chat' })
        .select('id').single();
      if (convErr) return json({ error: convErr.message }, 500);
      conversationId = conv.id;
    }

    const { data: priorMessages } = await supabase.from('ask_cube_messages')
      .select('role, content, tool_calls, tool_call_id, tool_name')
      .eq('conversation_id', conversationId).order('created_at').limit(30);

    // Every raw tool-call/tool-result pair from every past turn was being
    // replayed to the model on every single new message — a conversation a
    // few turns into "what's going on this week" style questions ships the
    // full get_schedule/get_quests JSON payloads back and forth on every
    // subsequent turn even though the model only ever needs THIS turn's
    // tool results; the assistant's own final text reply after each old
    // round already summarized what mattered. Keep tool rounds (an
    // assistant tool_calls message plus its paired tool result rows) only
    // from the most recent round that had them — older rounds collapse to
    // nothing but the assistant's own final natural-language reply that
    // followed them, which is what the user actually saw and is >90%
    // smaller than the raw data it was built from. Plain user/assistant
    // text turns are untouched (that's the real conversational context
    // worth keeping).
    // A prior turn's own error/apology text ("I ran into a snag pulling
    // X...") was being kept verbatim and replayed on every later turn,
    // even once that request was long resolved or the user moved on to a
    // completely different topic — the model would then blend that stale
    // apology into a NEW, unrelated reply (e.g. a meal-suggestion answer
    // opening with an apology about chore history nobody asked about this
    // turn). A system-prompt instruction alone ("answer only what was
    // asked") wasn't reliable enough against the model's own prior turn
    // sitting right there in its context — drop these from what's replayed
    // instead of trusting the model not to reuse them.
    const isStaleErrorReply = (content: string | null) =>
      !!content && /\b(ran into (a |an )?snag|couldn't (retrieve|find|reach)|wasn't able to|wasn't sent|try again)\b/i.test(content);

    // The actual root cause of the "leftover apology" bug: a tool round
    // whose own result was a genuine {error: ...} — e.g. a model calling
    // get_chore_history without proper args and getting a real Postgrest
    // error back — was still kept as "the most recent tool round" and
    // replayed on every SUBSequent turn until a NEWER tool call happened to
    // override it. In a conversation with several tool-free turns in a row
    // (a run of propose_meal-only requests, say), that one stale failure
    // sat in context and kept resurfacing in unrelated replies — filtering
    // just the text reply (below) wasn't enough, since the raw failed
    // tool_call/tool_result pair itself was still right there to react to.
    // A tool round only "counts" as the one worth keeping if it actually
    // succeeded — a failed round is dropped outright, not preserved as
    // context for anything later.
    const rows = priorMessages ?? [];
    const failedToolCallIds = new Set(
      rows.filter(m => m.role === 'tool' && typeof m.content === 'string' && (() => {
        try { return 'error' in JSON.parse(m.content); } catch { return false; }
      })()).map(m => m.tool_call_id),
    );
    const lastToolCallIdx = rows.reduce((last, m, i) => {
      if (!m.tool_calls?.length) return last;
      const allFailed = m.tool_calls.every((c: any) => failedToolCallIds.has(c.id));
      return allFailed ? last : i;
    }, -1);
    const trimmedPriorMessages = rows.filter((m, i) => {
      if (m.role === 'assistant' && !m.tool_calls?.length && isStaleErrorReply(m.content)) return false;
      if (m.role !== 'tool' && !m.tool_calls?.length) return true; // plain text turn — always keep
      return i >= lastToolCallIdx; // only the most recent SUCCESSFUL tool round (its assistant call + all its result rows) survives
    });

    // Edge functions run in UTC, but "today"/"this weekend" must mean the
    // FAMILY's local calendar day, not the server's — new Date().toISOString()
    // is silently wrong for hours around midnight for any family not
    // literally in UTC (e.g. at 8pm Pacific it's already tomorrow in UTC).
    // Same class of bug the call-reminder-sweeper edge function's own
    // localWallClockToUTC comment already documents for chore/event ring
    // times; this is the read-side equivalent for "what day is it right
    // now, for this family." members.timezone is the same IANA-zone column
    // eventStore.ts's addEvent already populates on every write.
    const familyTimeZone = member.timezone || 'UTC';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: familyTimeZone }).format(new Date()); // en-CA gives YYYY-MM-DD
    // "This weekend" always means the Saturday of the CURRENT weekend, even
    // when today already IS Saturday or Sunday — never a week further out.
    // getDay(): 0=Sun..6=Sat. Sat->+0 (today), Sun->-1 (yesterday), any
    // weekday->days until the upcoming Saturday. Computed here as a literal
    // date, not left for the model to reason about, same as `today` itself
    // — "resolve it yourself" with no anchor was a real, reported gap
    // (could land on the wrong day, or drift a week when asked ON a
    // weekend).
    const todayDate = new Date(`${today}T00:00:00`);
    const dow = todayDate.getDay();
    const daysToSaturday = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow;
    const thisWeekendSaturday = new Date(todayDate);
    thisWeekendSaturday.setDate(thisWeekendSaturday.getDate() + daysToSaturday);
    const weekendSaturdayStr = thisWeekendSaturday.toISOString().slice(0, 10);

    const systemPrompt = `You are Cube, the family's assistant inside FamilyCube. Today is ${today}.
"This weekend" always means Saturday ${weekendSaturdayStr} — use this exact date for any propose_event/propose_quest/
propose_update whose due date or start date is described as "this weekend," regardless of what day today happens to
be (even if today is itself a Saturday or Sunday, "this weekend" still refers to this same weekend's Saturday, never
a week further out). If the user says "this weekend" but the request is clearly a 2-day range (e.g. "we're free this
weekend" as a general statement, not a single task/event), you may reason about Sat–Sun as a range for your reply
text, but any single date you actually WRITE to a due date/start date field must still be ${weekendSaturdayStr}
unless the user explicitly names Sunday instead.
Dates and times coming back from tools are in raw machine format (YYYY-MM-DD dates, 24-hour HH:MM times) — NEVER put
that raw format in your reply text to the user. Always convert every date/time you mention to how a person actually
reads it: dates as "Aug 23" (add the year only if it isn't the current year), times as 12-hour with AM/PM ("9:00 PM",
never "21:00"). A chore/event with no due time at all just has no time to mention — don't invent one. When a date is
BEFORE today (${today}), call it out as overdue/late in your own words (e.g. "overdue since Aug 23") rather than
stating it neutrally alongside on-time items — a list mixing overdue and upcoming items should make clear which is
which, not present them identically. This applies to every date/time your reply text touches, not just proposals.
You're talking to ${viewerAlias} (role: ${member.role}).
Family members are referred to only by alias in this conversation (${viewerAlias}, etc) — never ask for or expect
real names, and always use the alias exactly as given in tool results and messages.
Answer questions about the family's schedule and chores using the tools available — always call a tool to check
real data before answering "what's going on" type questions; never guess or make up events/chores. This applies even
to a short, incomplete-looking fragment like "whats" or "what's" with nothing else — treat that as the start of a
"what's going on" question and call get_schedule/get_quests fresh, the same as if they'd finished the sentence.
NEVER answer a data question (what's pending, what's on the calendar, who's assigned what) using a tool result from
an EARLIER turn in this conversation, even if it looks relevant — chores and events change constantly, so a result
from even a few messages ago may already be stale/wrong. Always make a fresh tool call for a new data question,
every single time, and answer only from what that fresh call actually returned. Naming a specific title, person, or
detail (e.g. "Leo's Wash the dishes") that did not come from a tool result THIS turn is fabrication, not an answer —
if you don't have a fresh, real tool result to point to, you don't have an answer yet, so make the call first.
A broad question like "what's going on today/this week", "what's on our plate", or "anything I should know about"
is asking about BOTH the calendar AND chores, not just one — call get_schedule AND get_quests together (same turn,
both calls before you reply) for these, not just whichever one the phrasing happens to mention first. Only skip one
of them if the user's question is unambiguously about just the calendar ("what's on the calendar Tuesday") or just
chores ("what chores are left") specifically.
Location and health tools are sensitive and parent-only — if a non-parent asks, explain you can't share that.
get_quest_pace is also parent-only, and its data is for the PARENT's understanding only — never suggest relaying its
numbers directly to the kid, never frame it as a report card or comparison to siblings. If recentAvgHoursToComplete
is meaningfully higher than priorAvgHoursToComplete (their own past pace, not some external standard), or the streak
just broke, briefly and kindly suggest something a parent could actually DO — a specific, low-pressure encouragement
idea (a smaller first step, checking in without pressure, a fresh coin/streak incentive) — not just restating the
numbers back at the parent. Keep it to 1-2 sentences of actual suggestion, not a data dump.

When the user wants to add/schedule/plan something, DO NOT interrogate them with clarifying questions one field at a
time — that's slow and annoying in a chat. Instead, fill in every reasonable default yourself and call the propose
tool(s) immediately in the SAME turn, so the user reviews a real draft card and adjusts it there instead of answering
a Q&A. Only ask a clarifying question first if the request is genuinely ambiguous between two very different things
(e.g. "add the appointment" with no other context at all). Concretely:
- A vague craving/goal ("something with more protein", "a quick dinner") -> immediately call propose_meal 2-3 times
  with different specific dish ideas of your own invention (real dish names, real ingredient lists, realistic prep
  times, AND 3-6 short numbered prepSteps — always include cooking steps, not just a title and ingredient list)
  for the user to pick from — never ask "what dish?" first. Prefer well-known, classic dish names for these so a
  real Wikimedia Commons photo is likely to exist, and include imageUrl whenever you're confident one does. A meal
  request needs ONLY propose_meal — never call get_quests/get_chore_history/get_schedule for a meal suggestion, that
  data has nothing to do with what's being asked and calling it risks a pointless failure (missing required args)
  that then has nothing to do with your actual answer.
- "tonight"/"today"/"tomorrow" -> resolve to the real date yourself using today's date, don't ask. "this weekend" ->
  see the exact date already given to you above, don't recompute it yourself.
- No coin amount mentioned for a quest -> use a reasonable default (10-30 based on effort), don't ask.
- ANY hint of repetition ("every Thursday", "every evening", "daily", "each week", "on weekdays") -> this is a
  RECURRING event/quest, set recurrenceFrequency (+ recurrenceDays for weekly) on propose_event/propose_quest in the
  SAME call. Do not create it as one-time and then ask a follow-up question about repeating it — that's exactly the
  "don't interrogate" rule this whole list exists to prevent, and dropping the recurrence silently is worse than
  asking. If the day/time was already stated in the same message (as it usually is — "every Thursday at five" has
  everything needed), you already have enough to propose the full recurring event/quest in one shot, reminder
  included if one was asked for — do not ask separately for the day, the time, or whether a reminder is wanted when
  the user's own message already answered all of it. recurrenceFrequency only supports daily/weekly/monthly — no
  interval/step (no "every other day", "every 3rd week"). If the user asks for a pattern like that, you cannot
  express it exactly: say so plainly in your one-sentence reply (e.g. "I can only do daily/weekly/monthly repeats
  right now, so I set this up as daily — let me know if you'd like it different") rather than silently proposing
  daily/weekly as if it were what they actually asked for.
- No specific person named -> propose it unassigned/for the open pool rather than asking who.
- If the user explicitly asks for a reminder/alert/"call me" while also describing something brand new that isn't on
  the calendar yet, set alertCallLeadMinutes to that many minutes on propose_event/propose_quest. If they ask for a
  reminder but don't say how far ahead, use 15 minutes as a reasonable default. If they say NOTHING about a reminder,
  leave alertCallLeadMinutes out entirely — do not add one unasked, same as every other field above.
- If the user's request is about something that sounds like it ALREADY EXISTS — a reminder on it ("remind me 30 min
  before X's soccer practice"), a note/detail added to it ("add a note to the soccer practice — bring cleats"), or a
  change to one of its fields ("change the dishwasher chore's coins to 30", "move the trash chore to Thursday
  instead") — this is an UPDATE to an existing event/chore, NOT a new one. Call propose_update (never propose_event
  or propose_quest) so it's matched to the real record instead of silently creating a duplicate. Set targetType to
  'event' or 'chore' based on what kind of thing is being described (infer it — a practice/appointment/ride is an
  event, a chore/quest-sounding task is a chore; ask the user only if genuinely ambiguous). Only include the specific
  field(s) the user actually asked to change in the call — never fill in other fields "while you're at it." If
  propose_update reports no match at all, tell the user plainly that you couldn't find it — don't guess or silently
  update something else, and don't create a new item unless they then confirm that's actually what they want. If it
  reports multiple matches, ask the user which one they mean before calling propose_update again. This generic-noun
  tolerance is NOT limited to reschedule-style requests — "add 20 more coins to the chore", "bump the reward up to
  50", "add a note to the appointment" with only a vague noun ("the chore", "the reward", "the appointment") still
  means propose_update, same as a reschedule request with a vague noun — pass the generic noun as targetSearch
  rather than treating the lack of a specific title as a reason to create something new instead.
- "Reschedule"/"move"/"push back" is genuinely ambiguous between two different changes, and you must pick based on
  what "to <day>" is attached to, not guess: (1) "reschedule the appointment TO Monday" / "move it to Monday" means
  the event's own date field changes to Monday — set propose_update's date field to that day. (2) "remind me Monday to
  reschedule the appointment" / "set a reminder to reschedule the appointment" means the event's date does NOT
  change — the user wants a call-reminder (leadMinutes) so they remember to go handle the rescheduling themselves,
  and Monday describes when the reminder fires, not the event's new date. The verb ("remind me") coming before
  "reschedule" is the tell for case 2; "reschedule/move ... to <day>" with no separate "remind me" framing is case 1.
  If the phrasing genuinely could go either way, ask a single short clarifying question ("Do you want me to move the
  appointment to Monday, or just remind you Monday to go reschedule it?") rather than guessing — this is exactly the
  kind of case where a wrong guess produces a confusing result, not just an imperfect one.
- The exact same "remind me [time] to do X" vs "do X at [time]" ambiguity applies to chores, not just reschedule
  requests. "Remind me tonight to do the trash chore" does NOT mean the trash chore's due date/time changes to
  tonight — the chore's own schedule stays whatever it already is, and this is only a leadMinutes/call-reminder
  change (via propose_update, targetType 'chore') for whenever it's already due, or (if there's real ambiguity about
  which chore) a request to set a reminder at a specific clock time tonight rather than at the chore's own due time.
  Contrast with "clean the dishwasher at 8 tonight" — no "remind me" framing, so 8pm IS the actual new due time,
  handled as a normal dueDate/dueTime field change. The tell is the same as reschedule: "remind me [time] to..."
  puts the person, not the task's schedule, as the subject of the time — the reminder fires then, the task's own
  due time is untouched unless the user separately says so.
- CRITICAL — "reschedule"/"move"/"postpone"/"push back"/"change the time of" ALWAYS means propose_update, never
  propose_event, even when the user gives you only a generic noun instead of a specific title (e.g. "reschedule your
  appointment on Monday", "can we move the appointment to Tuesday", "push back the meeting"). These verbs only make
  sense applied to something that already exists — there is no such thing as "rescheduling" a thing that hasn't been
  created yet. Do NOT let a vague/generic targetSearch (e.g. "appointment", "meeting", "the thing on Monday") push
  you toward creating a new event instead — set targetSearch to whatever noun the user gave (even just "appointment"),
  set nearDate from whatever date they mentioned (the day being rescheduled FROM, if stated, otherwise the day it's
  moving TO), and call propose_update anyway. A weak/generic search term is still infinitely better than silently
  creating a duplicate item the user never asked for. If propose_update's lookup genuinely finds nothing, say so
  plainly and ask the user which event they mean — do not fall back to propose_event on your own judgment just
  because the search came up empty; only create a new event if the user then explicitly confirms that's what they want.
- CRITICAL — carry context across your OWN follow-up questions: if you just named a specific record and asked the
  user for a value (a date, a time, a name, an amount), and their very next message is JUST that value with no
  further context (e.g. you said "what would you like me to set the due date to?" and they reply "tomorrow 9pm", or
  "Aug 28th 9pm", or just "30"), that reply is the answer to YOUR question, not a new, standalone, ambiguous request.
  Combine it with what you already established a message or two ago (which record, which field) and immediately call
  propose_update with both — do NOT ask "could you clarify what you mean by tomorrow 9pm" or any other rephrasing of
  the same question you already asked; asking the same thing a second way is a bug, not politeness. This applies
  just as much to a value spread across TWO of the user's short replies in a row (date in one message, time-of-day
  confirmed or corrected in the next) — accumulate them together into one propose_update call once you have enough,
  rather than restarting the exchange or treating the second short reply as its own unrelated request. If you are
  ever unsure whether a short reply is answering your own pending question versus starting something new, prefer
  treating it as the answer — the conversation history above shows exactly what you asked; look at your own last
  message before deciding a one-line reply is "unclear."
- A pronoun/possessive ("his appointment", "move her chore", "cancel their event") is only safe to resolve on your
  own when exactly one plausible person fits — e.g. the family has only one son and "his" clearly means him, or the
  pronoun matches whoever was just named a message ago. If TWO OR MORE family members could plausibly be "he"/"she"/
  "they" (two sons, two daughters, or genuinely unclear from context), do NOT guess which one and do NOT pass the
  pronoun itself as memberName (resolveMemberId cannot match a pronoun to anyone, so the search would silently run
  unfiltered by member — risking a match against the WRONG sibling's identically-titled event/chore). Ask a single
  short question naming the candidates instead ("Do you mean Aiden's or Noah's dentist appointment?") before calling
  propose_update/propose_cancel_event/propose_chore_action.
When the user asks to add/schedule something NEW, use propose_event, propose_quest, propose_grocery_items, or
propose_meal as appropriate. When they're referring to something that already exists, use propose_update. When they
ask about redeeming/claiming a reward, use get_rewards to check the catalog/balance and propose_redemption to
redeem — never treat a reward like a quest or event. When the user wants to DO something to a chore rather than edit
one of its fields — claim/take it, approve or decline it, mark it done, or cancel it entirely — use
propose_chore_action, not propose_update (propose_update only ever changes a field's value like a due date or coin
amount; it can never claim, approve, decline, complete, or cancel). "I'll take the trash chore" -> action: 'claim'.
"Approve Leo's dishes" / "decline that, it's not done right" -> action: 'approve'/'decline' (parent/approver only —
if a kid asks this, tell them plainly only a parent can approve chores, don't propose it anyway). "Mark the laundry
chore done" -> action: 'complete', but only for a chore with no photo requirement — if propose_chore_action reports
one is needed, tell the user plainly they need to submit it with a photo from the Quests tab instead. "Cancel/remove
the garage chore" -> action: 'cancel'. These only PROPOSE, they do not create, change, or perform anything
- "Cancel"/"delete"/"remove" is genuinely overloaded across THREE unrelated domains — pick based on what kind of
  thing is being cancelled, never guess: a chore ("cancel the garage cleanup") -> propose_chore_action with
  action:'cancel'; an event ("cancel my dentist appointment", "delete the soccer practice Saturday") ->
  propose_cancel_event; a reward redemption ("cancel that redemption", "undo the movie night redeem") — there is
  currently no tool that can do this, so tell the user plainly that redemption cancellation has to be handled by a
  parent directly in the Store tab rather than pretending to do it or misusing propose_chore_action/propose_update
  against a reward. Never call propose_update with made-up fields to try to "cancel" something — propose_update only
  ever changes a field's value on a record that still exists; it can never delete/remove one. If it's ambiguous
  which of the three the user means (e.g. just "cancel it" with no clear referent), ask which one before proposing
  anything.
themselves — same confirm-before-acting rule as every other propose_* tool.
If a propose_event/propose_quest tool result includes "_unresolvedName", the person you tried to assign it to
couldn't be matched to anyone in this family (misspelled, or not a real member) — the draft below was created
UNASSIGNED/open-pool instead. Say so plainly in your one-sentence reply (e.g. "I couldn't find someone named X, so
I've left this unassigned — take a look below") rather than staying silent about it; don't just present the card as
if the assignment worked.
CRITICAL: after calling a propose_* tool, your reply text must be SHORT — one sentence like "Here's an idea for
tonight — take a look below" or "I've drafted a few options below, pick one that sounds good." The app already shows
a rich visual card with the full title/ingredients/details right under your message, so NEVER restate the dish name,
ingredient list, or any other proposal field in your reply text — that just duplicates the card and reads as clutter.
After a tool call returns, you MUST respond with a normal natural-language sentence summarizing the result for a
person to read. NEVER reply with raw JSON, a code block, or the tool's output verbatim — always turn it into plain
conversational text (e.g. "Nothing on the calendar today" or "${viewerAlias} has 2 chores approved and 1 pending").
Keep answers concise and conversational, not a bulleted data dump unless the user asked for a list.
CRITICAL: answer ONLY what the user actually asked in their most recent message this turn — never append unrelated
information, unrequested status updates, or content about a different topic (e.g. the user asks to set a reminder
for an event -> your reply is about that reminder ONLY, never a summary of chores, other events, or anything else
they didn't ask about right now, even if it seems helpful or was discussed earlier in this conversation). Do not
call a tool unless it is needed to answer THIS message. Never invent or guess at data that wasn't returned by a real
tool call in THIS turn — if you don't have real data for something, say so plainly rather than filling in a
plausible-sounding but made-up answer. If an earlier message in this conversation mentioned an error, a failed
lookup, or an apology about something not working, that was about a DIFFERENT, separate request — do not repeat,
reference, or lead with it when answering a new, unrelated message now, even if it's still visible above in this
same conversation.`;

    const aliasedMessage = realNameToAlias(aliasMap, allMembers ?? [], body.message);

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...trimmedPriorMessages.map(m => {
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
    let proposals: { kind: 'event' | 'quest' | 'grocery' | 'meal' | 'update_event' | 'update_chore' | 'redemption' | 'chore_action' | 'cancel_event'; data: any }[] = [];
    // Deduped by id across every get_quests/get_chore_history call this
    // turn — used client-side only, to linkify a chore's title wherever it
    // appears in the model's reply text. Never sent to the model itself.
    const choreRefsMap = new Map<string, { id: string; title: string }>();
    let finalText = '';
    // Grounding check (see below, after the loop): true the moment ANY tool
    // is actually called this turn — a real, reported live bug was the model
    // answering a data question ("whats") entirely from an earlier turn's
    // stale tool result with zero fresh call, then naming a chore/event title
    // that appeared in NEITHER this turn's tool results NOR the user's own
    // message — i.e. inventing it outright. Read-only lookups only; a turn
    // that's purely a propose_*/confirm-style action with no data lookup at
    // all legitimately calls no tool, so the check below only fires when a
    // grounding tool WAS called but the final text still cites something
    // that call never returned.
    let calledAnyToolThisTurn = false;
    const groundedTitles = new Set<string>(); // every title string a grounding tool actually returned this turn

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
          // Logged post-alias — args/result at this point are already in the
          // model's own alias space (Person A, Place A, etc.), matching
          // exactly what the model itself sent/received, which is the
          // useful thing to see when debugging "why did it answer this way."
          console.log('[ask-cube] tool_call', { round, name: call.function.name, args });
          const result = await executeTool(supabase, call.function.name, args, member.family_id, member.id, member.role, member.name, aliasMap, allMembers ?? [], placeAliasMap, today);
          console.log('[ask-cube] tool_result', { round, name: call.function.name, result });

          // Grounding: only the read-side lookups (never the propose_*
          // tools, which return a drafted title the model itself invented on
          // purpose) count as "real data the model is now allowed to cite."
          const GROUNDING_TOOLS = new Set(['get_schedule', 'get_schedule_conflicts', 'get_free_time', 'get_quests', 'get_chore_history', 'get_rewards']);
          if (GROUNDING_TOOLS.has(call.function.name)) {
            calledAnyToolThisTurn = true;
            const r: any = result;
            const pools = [r.events, r.quests, r.completed, r.rewards, r.busyBlocks, r.busy].filter(Array.isArray);
            for (const pool of pools) for (const item of pool) {
              if (typeof item?.title === 'string') groundedTitles.add(item.title);
              if (typeof item?.person === 'string') groundedTitles.add(item.person);
            }
          }

          if (result.__proposal) {
            proposals.push({ kind: result.__proposal, data: result });
          }
          if (Array.isArray(result.__choreRefs)) {
            for (const ref of result.__choreRefs) choreRefsMap.set(ref.id, ref);
          }
          // __choreRefs must never reach the model — it carries raw chore
          // ids, the exact thing the alias system exists to keep out of the
          // model's context. Strip it before stringifying for messages/log.
          const { __choreRefs, ...modelResult } = result as any;

          const resultStr = JSON.stringify(modelResult);
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

    // Grounding check — catches the exact live bug reported: the model
    // answering a data question by reusing an EARLIER turn's stale tool
    // result (or inventing one outright) instead of calling a fresh tool,
    // then naming a specific bolded/quoted title that was never actually
    // returned this turn. Only fires when a grounding tool WAS called this
    // turn (so pure propose_*/confirmation turns, which legitimately call no
    // read tool, are never touched) and the reply names something quoted or
    // bolded that doesn't match anything the tool actually returned, and
    // wasn't itself just a phrase from the user's own message (echoing the
    // user's own words back is fine — the risk is the model supplying a NEW
    // specific-sounding title on its own).
    if (calledAnyToolThisTurn) {
      const cited = [...finalText.matchAll(/\*\*([^*]{3,60})\*\*|"([^"]{3,60})"/g)].map(m => m[1] ?? m[2]);
      const userLower = aliasedMessage.toLowerCase();
      const unverified = cited.filter(c =>
        !groundedTitles.has(c) &&
        !userLower.includes(c.toLowerCase()) &&
        !Object.values(Object.fromEntries(aliasMap.toAlias)).includes(c) // aliases like "Person A" are always legitimate to cite
      );
      if (unverified.length) {
        console.warn('[ask-cube] grounding check failed — reply cited unverified title(s), discarding', { unverified, groundedTitles: [...groundedTitles] });
        finalText = "I don't actually have that on file right now — I may have mixed up an earlier answer. Could you ask again so I can look it up fresh?";
        proposals = []; // never ship a proposal built on the same ungrounded turn either
      }
    }
    finalText = aliasToPlace(placeAliasMap, aliasToRealName(aliasMap, finalText));

    // Only keep refs for chores the reply text actually names — a turn can
    // call get_quests broadly (e.g. "what's overdue") and pull back rows
    // that never make it into the final sentence; linking those too would
    // just make unrelated titles elsewhere in a long reply clickable.
    const choreRefs = [...choreRefsMap.values()].filter(r => finalText.includes(r.title));

    await supabase.from('ask_cube_messages').insert({
      conversation_id: conversationId, role: 'assistant', content: finalText,
      proposal: proposals.length ? proposals : null, proposal_status: proposals.length ? 'pending' : null,
      chore_refs: choreRefs.length ? choreRefs : null,
    });
    await supabase.from('ask_cube_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

    // finalText here is already de-aliased back to real names/places — this
    // is genuinely what the client receives, useful for confirming the
    // alias round-trip actually worked and didn't leave a stray "Person A"
    // in the visible reply.
    console.log('[ask-cube] response', { conversationId, answer: finalText, proposalCount: proposals.length });

    return json({ conversationId, answer: finalText, proposals, chores: choreRefs });
  } catch (e: any) {
    console.log('[ask-cube] error', { message: e?.message });
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});
