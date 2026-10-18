// Deterministic pre-pass for Ask Cube. Runs BEFORE the model: it works out who and when a message is about, using fixed
// rules, so the model is handed answers instead of being asked to guess. Pure functions only (no network, no Deno APIs),
// so they can be tested anywhere.

export type Person = { id: string; name: string };

export type Intent =
  | 'greeting' | 'identity' | 'cancel_all_day' | 'cancel_one' | 'reschedule' | 'assign_driver' | 'approve'
  | 'create_event' | 'create_chore' | 'read_schedule' | 'read_chores' | 'grocery' | 'meal' | 'health' | 'location' | null;

export interface Resolution {
  /** People named in the message (real first or full names, any case, with or without 's). */
  mentionedIds: string[];
  /** "me", "my", "I" refer to the person asking. */
  selfRef: boolean;
  /** "his/her/him/them" with nobody named: the person from earlier in this conversation. */
  pronounId: string | null;
  /** Pronoun used but there is nobody to point to. */
  pronounUnresolved: boolean;
  /** Dates the message names, resolved from today. */
  dates: { phrase: string; date: string }[];
  /** A fixed-pattern read of what the message is asking for. */
  intent: Intent;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayOf(iso: string): number {
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

/** Dates the text names, resolved from `today` (YYYY-MM-DD, the family's local day). */
export function resolveDates(text: string, today: string): { phrase: string; date: string }[] {
  const t = ' ' + text.toLowerCase().replace(/[’']/g, "'") + ' ';
  const out: { phrase: string; date: string }[] = [];
  const add = (phrase: string, date: string) => { if (!out.some(o => o.date === date)) out.push({ phrase, date }); };
  if (/\bday after tomorrow\b/.test(t)) add('day after tomorrow', addDays(today, 2));
  else if (/\btomorrow\b/.test(t)) add('tomorrow', addDays(today, 1));
  if (/\b(today|tonight)\b/.test(t)) add(/\btonight\b/.test(t) ? 'tonight' : 'today', today);
  if (/\byesterday\b/.test(t)) add('yesterday', addDays(today, -1));
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\b(next\\s+)?${DAYS[i]}\\b`);
    const m = t.match(re);
    if (!m) continue;
    let delta = (i - weekdayOf(today) + 7) % 7;
    if (delta === 0) delta = 7;                 // a bare weekday name means the UPCOMING one
    if (m[1]) delta += 7;                        // "next Monday" is a week after that
    add(m[0].trim(), addDays(today, delta));
  }
  return out;
}

/** Names, self references and pronouns, matched on whole words so "Ana" never matches "Anna". */
export function resolvePeople(
  text: string, members: Person[], lastMemberId: string | null,
): Pick<Resolution, 'mentionedIds' | 'selfRef' | 'pronounId' | 'pronounUnresolved'> {
  const t = ' ' + text.toLowerCase().replace(/[’']s\b/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ') + ' ';
  const mentionedIds: string[] = [];
  for (const m of members) {
    const first = m.name.toLowerCase().trim().split(/\s+/)[0];
    const full = m.name.toLowerCase().trim();
    if (!first) continue;
    if (new RegExp(`\\s${escapeRe(full)}\\s`).test(t) || new RegExp(`\\s${escapeRe(first)}\\s`).test(t)) mentionedIds.push(m.id);
  }
  const selfRef = /\s(me|my|mine|myself|i)\s/.test(t);
  const hasPronoun = /\s(his|her|hers|him|their|theirs|them)\s/.test(t);
  const pronounId = hasPronoun && mentionedIds.length === 0 && !selfRef ? lastMemberId : null;
  const pronounUnresolved = hasPronoun && mentionedIds.length === 0 && !selfRef && !lastMemberId;
  return { mentionedIds: [...new Set(mentionedIds)], selfRef, pronounId, pronounUnresolved };
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim().replace(/[’]/g, "'");
  if (/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening)|what'?s up|thanks?|thank you|ok|okay|cool|got it|bye|night)[\s!.,?]*$/.test(t)) return 'greeting';
  if (/\b(who am i|what'?s my role|my role|what can i do|my permissions)\b/.test(t)) return 'identity';
  if (/\b(cancel|clear|remove|delete|wipe)\b/.test(t) && !/\b(chore|task|quest|reward|grocery|groceries|list|item)\b/.test(t)) {
    if (/\b(all|everything|whole|every|entire)\b/.test(t) || /\bclear (my|his|her|their|the)? ?(day|schedule)\b/.test(t)) return 'cancel_all_day';
    return 'cancel_one';
  }
  if (/\b(reschedule|postpone|push back|move|change the time|shift)\b/.test(t)) return 'reschedule';
  if (/\b(driver|drive|driving|ride|pick ?up|drop ?off)\b/.test(t) && /\b(assign|who|need|set|make|put)\b/.test(t)) return 'assign_driver';
  if (/\b(approve|decline|reject|send back)\b/.test(t) || /\bmark\b.*\b(done|complete|completed|finished)\b/.test(t)) return 'approve';
  if (/\b(location|where is|where'?s|whereabouts)\b/.test(t)) return 'location';
  if (/\b(medic\w*|vaccin\w*|doses?|health|pharmac\w*|prescription\w*)\b/.test(t) && /\b(what|when|list|show|any|due|missed|miss|did|does|has|have)\b/.test(t)) return 'health';
  if (/\b(grocery|groceries|shopping list|buy|add .* to (the )?list)\b/.test(t)) return 'grocery';
  if (/\b(dinner|lunch|breakfast|meal|recipe|cook)\b/.test(t)) return 'meal';
  if (/\b(chore|chores|task|tasks|quest|overdue|to-?do)\b/.test(t) && /\b(what|which|any|list|show|who|how many|overdue|late|open|left)\b/.test(t)) return 'read_chores';
  // A question word first means a read, even when the noun "schedule" appears ("what's on Cherry's schedule").
  const asking = /^(what|what's|whats|which|who|when|where|how|is|are|do|does|any|show|list|tell me|check)\b/.test(t) || /\?\s*$/.test(t);
  if (/\b(add|create|make|new|book|set up|remind me|put)\b/.test(t) && /\b(chore|task|quest)\b/.test(t) && !asking) return 'create_chore';
  if (asking && /\b(schedule|calendar|events?|appointments?|plans?|on today|on tomorrow|going on|happening|free|busy|rides?)\b/.test(t)) return 'read_schedule';
  if (/^(add|create|book|set up|schedule|remind|put|plan)\b/.test(t) || (/\b(remind me|set up|book)\b/.test(t) && !asking)) return 'create_event';
  if (asking || /\b(anything|going on|happening|calendar|schedule)\b/.test(t)) return 'read_schedule';
  return null;
}

export function resolveMessage(text: string, members: Person[], today: string, lastMemberId: string | null): Resolution {
  return { ...resolvePeople(text, members, lastMemberId), dates: resolveDates(text, today), intent: detectIntent(text) };
}

/** The block handed to the model: facts, already worked out, in the model's own (alias) vocabulary. */
export function describeResolution(
  r: Resolution, toAlias: (id: string) => string, viewerAlias: string,
): string {
  const lines: string[] = [];
  const who = r.mentionedIds.length ? r.mentionedIds : (r.pronounId ? [r.pronounId] : []);
  if (who.length) lines.push(`The message is about: ${who.map(toAlias).join(', ')}${r.pronounId && !r.mentionedIds.length ? ' (a pronoun such as "his" or "her" in the message refers to this person from earlier in the conversation)' : ''}.`);
  if (r.selfRef) lines.push(`"me"/"my" means ${viewerAlias}.`);
  if (r.pronounUnresolved) lines.push('The message uses a pronoun but nobody was named earlier. Ask ONE short question: who do you mean?');
  for (const d of r.dates) lines.push(`"${d.phrase}" is ${d.date}. Use exactly this date.`);
  if (r.intent && FOCUS[r.intent]) lines.push(FOCUS[r.intent]!);
  if (r.intent === 'cancel_all_day' && who.length === 1 && r.dates.length === 1) {
    lines.push(`This is a request to cancel everything on one day. Call propose_cancel_event ONCE with memberName="${toAlias(who[0])}" and allOnDate="${r.dates[0].date}". Do not look anything up first and do not call it more than once.`);
  }
  return lines.join('\n');
}

/** Short, intent-specific instructions appended for THIS message only, so the model gets the relevant rules up front. */
const FOCUS: Partial<Record<NonNullable<Intent>, string>> = {
  greeting: 'This is a greeting or thank-you. Reply with ONE short warm line using their first name. Call no tool. Add no suggestions.',
  identity: 'This is about the asker themselves. Answer from what you already know about their role. Call no tool.',
  cancel_one: 'This is a request to cancel ONE event. Call propose_cancel_event with the best title words and the person. If several match, ask which one in a short question that lists the choices with day and time.',
  reschedule: 'This is a request to move or change the time of something that already exists. Use propose_update (never create a new item). Keep every unchanged field as it is.',
  assign_driver: 'This is about who is driving. Use get_schedule for the day first to see the real ride, then propose the assignment. Never invent a ride that was not returned.',
  approve: 'This is about approving, declining or completing something that already exists. Look it up first, then propose exactly one action per item. Parents only.',
  create_event: 'This is a new calendar item. Use the resolved date and time exactly. If the time or person is missing, ask ONE short question; do not guess.',
  create_chore: 'This is a new chore. Use the resolved due date and person exactly. If the person or due date is missing, ask ONE short question; do not guess.',
  read_schedule: 'This is a schedule question. Call get_schedule for the resolved person and dates. The app draws the events as cards under your message, so do NOT list them. Write ONE or TWO short sentences: the count, then the one thing that needs attention (a ride with nobody driving, a clash, something overdue). If nothing is on, say so plainly and mention the next thing coming up if you know it. Never write section headings such as "Calendar:" or "Chores:". If the question also covers chores, call get_quests too: the app draws both the chores and the schedule as separate cards, so do not list either. Say nothing about chores when there are none.',
  read_chores: 'This is a chores question. Call get_quests. The app draws the open chores as a card under your message, so do NOT list them. Write ONE or TWO short sentences: the count and what is overdue. If there are none, say so plainly. Only call a chore overdue when its overdue field is true; a finished or approved chore is done, never overdue or pending.',
  grocery: 'This is about the grocery list. Use the grocery tools only; propose additions as drafts.',
  meal: 'This is about meals. Use the meal tools and recipes already known to the family before suggesting new ones.',
  health: 'This is about health or medicine. Parents only. Report what is recorded; give no medical advice.',
  location: 'This is about location. Parents only. Report what is recorded; never guess.',
};

/** What to remember for the next message: the last person and date the conversation was about. */
export function nextContext(
  prev: { lastMemberId?: string | null; lastDate?: string | null },
  r: Resolution,
): { lastMemberId: string | null; lastDate: string | null } {
  const lastMemberId = r.mentionedIds.length ? r.mentionedIds[r.mentionedIds.length - 1] : (prev.lastMemberId ?? null);
  const lastDate = r.dates.length ? r.dates[r.dates.length - 1].date : (prev.lastDate ?? null);
  return { lastMemberId, lastDate };
}
