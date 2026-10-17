import { localDateStr } from '@/lib/dates';

/**
 * localTaskDetection — pure client-side "just describe it" classifier,
 * ported from the reference mock's categoryDB/scoreCategory/entity-
 * extraction logic (family-os-task-creator.html). No network call: this is
 * what SmartTaskComposer runs live on every keystroke. The real AI engine
 * (familyAi.extractResponsibility) stays available separately via the
 * composer's mic/voice button — an explicit, deliberate action — not the
 * default typing path.
 *
 * Every category entry maps to this app's own vocabulary: `kind` picks
 * Event vs Quest, `eventCategory`/`questCategory` map to the real
 * EventCategory (features/calendar/components/eventForm/types.ts) /
 * QuestCategory (store/questStore.ts) enums other screens already use —
 * so a locally-detected task lands in exactly the same category system
 * the full forms and AI path already write to, not a third parallel one.
 */

export type DetectionKind = 'event' | 'quest';

export interface CategoryEntry {
  key: string;
  label: string;
  emoji: string;
  kind: DetectionKind;
  eventCategory?: string;  // EventCategory value, only when kind==='event'
  questCategory?: string;  // QuestCategory value, only when kind==='quest'
  kw: string[];
}

// Condensed from the mock's ~120-entry categoryDB down to the groups that
// map onto real categories this app actually has — the mock's granular
// medical/school/sport/music subtypes all collapse onto this app's own
// coarser category enums (e.g. every sport collapses to Sports, not a
// separate soccer/basketball/tennis entry each), since a finer split here
// would just be discarded at the eventCategory/questCategory mapping step.
export const CATEGORY_DB: Record<string, CategoryEntry> = {
  medical: {
    key: 'medical', label: 'Medical', emoji: '🏥', kind: 'event', eventCategory: 'Medical',
    kw: ['doctor', 'physician', 'checkup', 'doctor visit', 'doctor appointment', 'dentist', 'dental', 'orthodontist',
      'braces', 'hospital', 'er', 'emergency room', 'urgent care', 'therapy', 'therapist', 'counselor', 'vaccine',
      'vaccination', 'shot', 'immunization', 'eye doctor', 'optometrist', 'eye exam', 'ent', 'hearing test',
      'surgery', 'operation', 'lab test', 'blood test', 'x-ray', 'mri', 'scan', 'physical therapy', 'pt session'],
  },
  school: {
    key: 'school', label: 'School', emoji: '🏫', kind: 'event', eventCategory: 'Study',
    kw: ['school day', 'attendance', 'parent teacher', 'pta', 'conference', 'test', 'exam', 'quiz', 'field trip',
      'tutor', 'tutoring', 'permission slip', 'school supplies', 'sign the form', 'sign up for'],
  },
  homework: {
    key: 'homework', label: 'Homework', emoji: '📝', kind: 'quest', questCategory: 'School',
    kw: ['homework', 'assignment', 'project due', 'essay due', 'study for', 'book report', 'worksheet',
      'reading log', 'study guide', 'finish homework'],
  },
  sports: {
    key: 'sports', label: 'Sports', emoji: '⚽', kind: 'event', eventCategory: 'Sports',
    kw: ['soccer', 'football practice', 'basketball', 'hoops', 'baseball', 'softball', 'little league', 'swim',
      'swimming', 'swim practice', 'swim meet', 'tennis', 'gymnastics', 'karate', 'taekwondo', 'martial arts',
      'hockey', 'ice skating', 'rock climbing', 'track practice', 'cross country', 'running club', 'practice', 'game'],
  },
  music_arts: {
    key: 'music_arts', label: 'Music & Arts', emoji: '🎵', kind: 'event', eventCategory: 'Study',
    kw: ['piano', 'guitar', 'voice lesson', 'singing', 'choir', 'violin', 'orchestra', 'band practice', 'art class',
      'painting', 'drawing lesson', 'dance class', 'ballet', 'theater', 'drama club', 'rehearsal', 'music lesson'],
  },
  ride: {
    key: 'ride', label: 'Ride', emoji: '🚗', kind: 'event', eventCategory: 'Ride',
    kw: ['pick up', 'pickup', 'fetch', 'collect', 'drop off', 'dropoff', 'take to', 'drive to', 'ride to',
      'airport pickup', 'airport dropoff', 'ride to doctor', 'carpool'],
  },
  birthday: {
    key: 'birthday', label: 'Birthday', emoji: '🎂', kind: 'event', eventCategory: 'Birthday',
    kw: ['birthday party', 'birthday dinner', "friend's birthday", 'birthday'],
  },
  event_social: {
    key: 'event_social', label: 'Event', emoji: '🎉', kind: 'event', eventCategory: 'Event',
    kw: ['family game night', 'movie night', 'family dinner', 'weekend outing', 'house party', 'party'],
  },
  errand: {
    key: 'errand', label: 'Errand', emoji: '🛒', kind: 'quest', questCategory: 'Errand',
    kw: ['groceries', 'grocery run', 'grocery shopping', 'costco', "sam's club", 'farmers market', 'library',
      'bookstore', 'return books', 'pharmacy', 'prescription', 'pick up meds', 'refill', 'bank errand',
      'post office', 'hardware store', 'return item', 'exchange', 'gift shopping', 'shopping trip', 'mall'],
  },
  cooking: {
    key: 'cooking', label: 'Cooking', emoji: '🍳', kind: 'quest', questCategory: 'Cooking',
    kw: ['cook dinner', 'make dinner', 'cooking', 'bake', 'baking', 'cake', 'cookies', 'pack lunch', 'meal prep',
      'snacks', 'pizza', 'order food', 'takeout'],
  },
  kitchen: {
    key: 'kitchen', label: 'Kitchen', emoji: '🍽️', kind: 'quest', questCategory: 'Kitchen',
    kw: ['dishes', 'wash dishes', 'dishwasher', 'load dishwasher', 'clean kitchen', 'wipe counters'],
  },
  living_room: {
    key: 'living_room', label: 'Living Room', emoji: '🛋️', kind: 'quest', questCategory: 'Living Room',
    kw: ['vacuum', 'vacuuming', 'sweep', 'mop', 'mopping', 'dust', 'dusting', 'tidy room', 'clean bedroom',
      'organize room', 'windows', 'deep clean'],
  },
  bathroom: {
    key: 'bathroom', label: 'Bathroom', emoji: '🚿', kind: 'quest', questCategory: 'Bathroom',
    kw: ['clean bathroom', 'toilet', 'shower clean'],
  },
  laundry: {
    key: 'laundry', label: 'Laundry', emoji: '🧺', kind: 'quest', questCategory: 'Laundry',
    kw: ['laundry', 'wash clothes', 'washing machine', 'fold clothes', 'folding laundry', 'iron', 'ironing',
      'dry cleaning'],
  },
  yard: {
    key: 'yard', label: 'Yard', emoji: '🌳', kind: 'quest', questCategory: 'Yard',
    kw: ['trash', 'garbage', 'bins', 'take out trash', 'recycling', 'recycle', 'compost', 'mow', 'mowing lawn',
      'rake', 'raking', 'leaves', 'weed', 'weeding', 'pull weeds', 'water plants', 'watering', 'snow', 'shovel',
      'shoveling', 'mulch', 'landscaping'],
  },
  pet: {
    key: 'pet', label: 'Pet', emoji: '🐾', kind: 'quest', questCategory: 'Pet',
    kw: ['walk the dog', 'dog walk', 'feed dog', 'dog food', 'dog bath', 'bathe dog', 'feed cat', 'cat food',
      'litter box', 'clean litter', 'fish tank', 'aquarium', 'pet sit', 'pet sitting'],
  },
  // A vet visit is a scheduled appointment, same as a doctor visit — kept
  // separate from the chore-shaped pet entry above (feeding/walking/litter
  // have no fixed time slot, a vet visit does).
  vet: {
    key: 'vet', label: 'Vet', emoji: '🐾', kind: 'event', eventCategory: 'Medical',
    kw: ['vet', 'veterinarian', 'pet checkup', 'vet appointment', 'vet visit'],
  },
  garage_car: {
    key: 'garage_car', label: 'Garage/Car', emoji: '🚙', kind: 'quest', questCategory: 'Garage',
    kw: ['garage', 'car service', 'oil change', 'car repair', 'mechanic', 'wash the car', 'car wash'],
  },
  tech: {
    key: 'tech', label: 'Tech', emoji: '💻', kind: 'quest', questCategory: 'Tech',
    kw: ['electronics', 'new phone', 'laptop', 'charger', 'wifi', 'router', 'computer'],
  },
  finance: {
    key: 'finance', label: 'Finance', emoji: '💳', kind: 'quest', questCategory: 'Finance',
    kw: ['bills', 'pay bill', 'payment', 'tax', 'taxes', 'insurance', 'insurance claim', 'bank'],
  },
  health_chore: {
    key: 'health_chore', label: 'Health', emoji: '💊', kind: 'quest', questCategory: 'Health',
    kw: ['meds', 'medication', 'pill organizer', 'refill prescription'],
  },
  garden: {
    key: 'garden', label: 'Garden', emoji: '🌱', kind: 'quest', questCategory: 'Garden',
    kw: ['garden', 'gardening', 'plant', 'planting', 'flower bed'],
  },
  shopping: {
    key: 'shopping', label: 'Shopping', emoji: '🛍️', kind: 'quest', questCategory: 'Shopping',
    kw: ['clothes shopping', 'clothing', 'new outfit', 'shoes', 'sneakers', 'toy store', 'toys'],
  },
  creative: {
    key: 'creative', label: 'Creative', emoji: '🎨', kind: 'quest', questCategory: 'Creative',
    kw: ['craft', 'crafting', 'scrapbook', 'art project'],
  },
  social: {
    key: 'social', label: 'Social', emoji: '👋', kind: 'quest', questCategory: 'Social',
    kw: ['call the', 'phone call', 'email', 'send email', 'plan a visit'],
  },
  // Neutral fallback — used only when nothing scores a confident match.
  general_task: {
    key: 'general_task', label: 'General task', emoji: '📋', kind: 'quest', questCategory: 'Other', kw: [],
  },
};

const synonymMap: Record<string, string> = {
  appt: 'appointment', dr: 'doctor', doc: 'doctor', peds: 'pediatrician doctor', derm: 'dermatologist doctor',
  ortho: 'orthodontist dentist', bloodwork: 'blood test lab', hw: 'homework', bball: 'basketball', hoops: 'basketball',
  footy: 'soccer', groc: 'groceries', meds: 'medication pharmacy prescription', bday: 'birthday',
  ptc: 'parent teacher conference', vax: 'vaccine vaccination', er: 'emergency room',
};

function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, '');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyStemMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  const maxDist = b.length >= 6 ? 2 : (b.length >= 4 ? 1 : 0);
  if (maxDist === 0) return false;
  return levenshtein(a, b) <= maxDist;
}

function expandSynonyms(input: string): string {
  const extra: string[] = [];
  Object.entries(synonymMap).forEach(([abbr, expansion]) => {
    if (new RegExp('\\b' + abbr + '\\b').test(input)) extra.push(expansion);
  });
  return extra.length ? input + ' ' + extra.join(' ') : input;
}

// A negation word up to ~3 words before a matched phrase means the
// sentence is saying that thing does NOT apply ("don't need a ride",
// "no groceries this week", "not going to the dentist") — without this, a
// negated sentence scores identically to a positive one and creates a
// task for the opposite of what was actually said.
const NEGATION_RE = /\b(?:don'?t|doesn'?t|didn'?t|won'?t|can'?t|no longer|not going to|no need for|no|not|never|cancel(?:led|ing)?|skip)\b/;

// "Don't forget to X" / "make sure not to skip X" are double-negative
// idioms that mean DO the thing, not negate it — checked first so they
// aren't caught by the plain negation check below.
const DOUBLE_NEGATIVE_RE = /\b(?:don'?t|do not)\s+forget\b|\bmake sure\b.{0,15}\b(?:not to skip|not to miss)\b/;

function isNegated(input: string, matchIndex: number): boolean {
  // Stop the lookback at the nearest clause boundary (,;.!?) so negation in
  // an earlier clause ("no groceries this week, but pick up the dry
  // cleaning") doesn't bleed into a later, unrelated one.
  let start = Math.max(0, matchIndex - 30);
  const clauseBreak = input.slice(start, matchIndex).search(/[,;.!?](?=[^,;.!?]*$)/);
  if (clauseBreak !== -1) start += clauseBreak + 1;
  const before = input.slice(start, matchIndex);
  if (DOUBLE_NEGATIVE_RE.test(before)) return false;
  return NEGATION_RE.test(before);
}

// Exact phrase match (word-boundary anchored, never raw substring — "er"
// must never match inside "soccer") counts far more than a stray word
// overlap; a close typo of a keyword still contributes, at lower weight.
function scoreCategory(input: string, inputStems: Set<string>, kwList: string[]): number {
  let score = 0;
  kwList.forEach(kw => {
    const phraseRe = new RegExp('\\b' + kw.split(' ').map(escapeRegex).join('\\s+') + '\\b');
    const phraseMatch = phraseRe.exec(input);
    if (phraseMatch) {
      if (isNegated(input, phraseMatch.index)) return; // negated — contributes nothing
      score += kw.split(' ').length * 3;
      return;
    }
    const kwWords = kw.split(' ').filter(w => w.length > 2);
    if (kwWords.length === 0) return;
    let exactCount = 0, fuzzyCount = 0;
    kwWords.forEach(w => {
      const sw = stem(w);
      if (inputStems.has(sw)) { exactCount++; return; }
      for (const is of inputStems) {
        if (fuzzyStemMatch(is, sw)) { fuzzyCount++; return; }
      }
    });
    const matchedCount = exactCount + fuzzyCount;
    if (matchedCount === kwWords.length && fuzzyCount === 0) score += 2;
    else if (matchedCount === kwWords.length) score += 1.4;
    else if (kwWords.length === 1 && exactCount === 1) score += 1;
    else if (kwWords.length === 1 && fuzzyCount === 1) score += 0.6;
  });
  return score;
}

export function scoreToConfidence(score: number): number {
  if (score >= 6) return 95;
  if (score >= 4) return 82;
  if (score >= 2) return 65;
  if (score >= 1) return 40;
  if (score > 0) return 22;
  return 0;
}

function extractDayOfWeek(input: string): number | null {
  const dayMap: Record<string, number> = {
    sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, weds: 3, wed: 3,
    thursday: 4, thurs: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
  };
  const isNext = /\bnext\b/.test(input);
  let found: number | null = null;
  Object.entries(dayMap).forEach(([name, num]) => {
    if (found !== null) return;
    if (new RegExp('\\b' + name + '\\b').test(input)) found = num;
  });
  if (found === null) return null;
  const today = new Date().getDay();
  let diff = ((found as number) - today + 7) % 7;
  if (isNext) diff = diff === 0 ? 7 : diff + 7;
  return diff;
}

export interface ExtractedDateTime {
  date: string | null; time: string | null;
  // A SECOND time in the same sentence, phrased as the return/pickup half
  // of a both-ways ride ("...at 4:45pm and pick up at 6:15pm"). Was
  // silently dropped entirely — the single /\b(\d{1,2})(?::(\d{2}))?\s?
  // (am|pm)\b/ match (no /g/ flag) only ever captured the FIRST time in the
  // sentence, so a genuinely both-ways request ("drop off... at 4:45pm and
  // pick up at 6:15pm") lost the pickup time outright, with no field
  // anywhere in the composer to add it back in manually either — the "+
  // Add a return time" affordance only rendered once a pickup/drop-off
  // LOCATION was filled in, which this exact sentence (a named class, no
  // street address) never had. Null when the sentence only has one time.
  returnTime: string | null;
  // A later time that is when the ride should ARRIVE ("pick her up at 9 from work to soccer at 10"), not a second ride.
  arrivalTime?: string | null;
}


// ── Clock times, read the way people actually say them ─────────────────────────────────────────────────────
// "5:30 PM", "5.30pm", "530pm", "17:30", "at 6", "around 5", "noon", "half past 4", "quarter to 6". A bare hour with no
// am/pm ("pick up Jaswi at 6") is resolved from context: a word like morning/afternoon/evening/tonight, a neighbouring time
// that does say am/pm ("from 3 to 5pm"), or otherwise the next time that hour comes round (later today if no day was given;
// 1-6 means PM and 7-11 means AM for a future day).
function to24(h: number, m: number): string { return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }

function extractTimes(input: string, resolvedDate: string | null): string[] {
  type Hit = { idx: number; h: number; m: number; mer: 'am' | 'pm' | null };
  const hits: Hit[] = [];
  const used: Array<[number, number]> = [];
  const overlaps = (i: number, n: number) => used.some(([a, b]) => i < b && i + n > a);
  const push = (idx: number, len: number, h: number, m: number, mer: 'am' | 'pm' | null) => {
    if (overlaps(idx, len)) return;
    used.push([idx, idx + len]);
    hits.push({ idx, h, m, mer });
  };
  let mt: RegExpExecArray | null;

  // explicit am/pm: 5pm, 5:30 pm, 5.30pm, 530pm, 5 p.m.
  const withMer = /\b(\d{1,2})(?:[:.](\d{2})|(\d{2}))?\s?(a\.?m\.?|p\.?m\.?)(?![a-z])/gi;
  while ((mt = withMer.exec(input))) {
    const h = parseInt(mt[1], 10); const m = mt[2] ? parseInt(mt[2], 10) : mt[3] ? parseInt(mt[3], 10) : 0;
    if (h >= 1 && h <= 12 && m < 60) push(mt.index, mt[0].length, h, m, mt[4].toLowerCase().startsWith('a') ? 'am' : 'pm');
  }
  // 24-hour: 17:30, 07:15
  const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s?(?:a\.?m|p\.?m))/gi;
  while ((mt = h24.exec(input))) {
    const h = parseInt(mt[1], 10); const m = parseInt(mt[2], 10);
    if (mt[1].length === 2 && h >= 13) push(mt.index, mt[0].length, h, m, null); // unambiguous 24h
    else push(mt.index, mt[0].length, h, m, null);                                // 5:30 with no am/pm
  }
  // words
  const noon = /\b(noon|midday)\b/gi; while ((mt = noon.exec(input))) push(mt.index, mt[0].length, 12, 0, 'pm');
  const midn = /\bmidnight\b/gi; while ((mt = midn.exec(input))) push(mt.index, mt[0].length, 12, 0, 'am');
  const half = /\bhalf\s+past\s+(\d{1,2})\b/gi; while ((mt = half.exec(input))) push(mt.index, mt[0].length, parseInt(mt[1], 10), 30, null);
  const qpast = /\bquarter\s+past\s+(\d{1,2})\b/gi; while ((mt = qpast.exec(input))) push(mt.index, mt[0].length, parseInt(mt[1], 10), 15, null);
  const qto = /\bquarter\s+(?:to|till)\s+(\d{1,2})\b/gi;
  while ((mt = qto.exec(input))) { const hh = parseInt(mt[1], 10); push(mt.index, mt[0].length, hh === 1 ? 12 : hh - 1, 45, null); }
  // "o'clock" and bare hours after a time preposition: at 6, around 5, by 4, from 3, until 5
  const oclock = /\b(\d{1,2})\s?o'?clock\b/gi; while ((mt = oclock.exec(input))) push(mt.index, mt[0].length, parseInt(mt[1], 10), 0, null);
  const bare = /\b(?:at|around|by|@|from|until|till|before|after)\s+(\d{1,2})(?![\d:.]|\s?(?:%|\$|st|nd|rd|th|minutes?|mins?|hours?|hrs?|people|kids|items?|coins?|points?|dollars?))/gi;
  while ((mt = bare.exec(input))) {
    const h = parseInt(mt[1], 10);
    if (h >= 1 && h <= 12) push(mt.index + mt[0].length - mt[1].length, mt[1].length, h, 0, null);
  }

  hits.sort((a, b) => a.idx - b.idx);
  if (hits.length === 0) return [];

  // context for resolving a missing am/pm
  const morning = /\b(morning|am\b|breakfast|before school|early)\b/.test(input);
  const evening = /\b(afternoon|evening|tonight|night|dinner|after school|lunch)\b/.test(input);
  const now = new Date();
  const todayStr = localDateStr(now);
  const isToday = !resolvedDate || resolvedDate === todayStr;

  const out: string[] = [];
  hits.forEach((hit, i) => {
    let { h } = hit; const { m } = hit;
    let mer = hit.mer;
    if (!mer && h <= 12 && !(h === 0)) {
      // inherit from the nearest time in the sentence that does say am/pm ("from 3 to 5pm" -> 3pm)
      const neighbour = hits.find((x, j) => j !== i && x.mer && Math.abs(j - i) === 1) ?? hits.find(x => x.mer);
      if (neighbour?.mer) mer = neighbour.mer;
      else if (morning && !evening) mer = 'am';
      else if (evening && !morning) mer = 'pm';
      else if (h === 12) mer = 'pm';
      else if (isToday) {
        // the next time this hour comes round, today
        const am = new Date(now); am.setHours(h % 12, m, 0, 0);
        const pm = new Date(now); pm.setHours((h % 12) + 12, m, 0, 0);
        mer = am.getTime() > now.getTime() ? 'am' : 'pm';
        if (mer === 'pm' && pm.getTime() < now.getTime() && h >= 7) mer = 'am'; // already past both today: show the morning slot
      } else mer = h >= 7 && h <= 11 ? 'am' : 'pm';
    }
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    const t = to24(h, m);
    if (!out.includes(t)) out.push(t);
  });
  return out;
}

// "today"/"tonight"/"tomorrow"/"day after tomorrow", weekday names (with
// optional "next"), and clock times like "4pm"/"2:30pm" — only fills a
// field when it finds an explicit signal, never a guess.
export function extractDateTime(input: string): ExtractedDateTime {
  const today = new Date();
  const result: ExtractedDateTime = { date: null, time: null, returnTime: null };
  let daysAhead: number | null = null;
  // "day after tomorrow" must be checked BEFORE the plain "tomorrow" match
  // below — it contains that same substring, so the bare /tomorrow/ regex
  // would otherwise match first and resolve to +1 day instead of +2.
  if (/\bday after tomorrow\b/.test(input)) daysAhead = 2;
  else if (/\btonight\b|\btoday\b/.test(input)) daysAhead = 0;
  else if (/\btomorrow\b/.test(input)) daysAhead = 1;
  else {
    const d = extractDayOfWeek(input);
    if (d !== null) daysAhead = d;
  }
  if (daysAhead !== null) {
    const d = new Date(today);
    d.setDate(d.getDate() + daysAhead);
    // localDateStr, not toISOString().slice(0,10) — typing "today" late at
    // night in a timezone west of UTC (or "tomorrow" early morning east of
    // UTC) would otherwise resolve to the wrong calendar date entirely.
    result.date = localDateStr(d);
  }
  // Live-requested: "user can mention 615 or 6.15 pm or PM, 405 4:05 pm or
  // PM" — the old pattern only accepted a colon separator ("6:15pm"),
  // silently failing on a period ("6.15pm" — worse, it PARTIALLY matched,
  // treating the digits after the period as a fresh 1-2 digit hour and
  // silently producing nonsense like "15:00" instead of "18:15") and on
  // the compact no-separator shorthand real texting habits actually use
  // ("615pm", "405pm"). Now accepts a colon OR period separator, OR no
  // separator at all with the minutes as a plain trailing 2 digits — all
  // still requiring am/pm, since a bare 1-4 digit number with no meridiem
  // is too ambiguous against other numbers already in the sentence (a
  // dollar amount, a coin count) to safely treat as a time at all.
  const times = extractTimes(input, result.date);
  if (times.length > 0) result.time = times[0];
  // A SECOND, different time is the return half of a both-ways ride ("take Jaswi to dance at 5 and pick her up at 6:30").
  // Needs a drop-off style verb AND a pick-up verb so an unrelated second time ("dinner at 6, movie at 8") is not misread.
  const hasDrop = /\b(?:drop(?:ping)?[\s-]?(?:off|in)?|dropped off|take|taking|bring|drive)\b/i.test(input);
  const hasPick = /\b(?:pick(?:ing)?\s?(?:me|him|her|them|\w+)?\s?up|collect(?:ing)?|return(?:ing)?|get\s+(?:me|him|her|them)\s+back)\b/i.test(input);
  if (times.length > 1 && hasDrop && hasPick) {
    const second = times.find(t => t !== times[0]);
    if (second) result.returnTime = second;
  } else if (times.length > 1 && hasPick && !hasDrop) {
    const second = times.find(t => t > times[0]);
    if (second) result.arrivalTime = second;
  }
  return result;
}

export interface ExtractedLocations { pickup: string | null; dropoff: string | null }

// "from X" / "to Y" style locations for ride-type tasks. The bare "to Y"
// fallback is deliberately NOT a generic \bto\b match — "to" is one of the
// most common words in English (appears in "should be", "want to", etc
// nowhere near a real destination) and matching it unanchored produced
// garbage drop-off values from unrelated later clauses in a longer
// sentence. Only recognized paired with an explicit drop-off verb.
//
// The bare "from X" fallback used to match ANY "from" anywhere in the
// input, including one that had nothing to do with the ride — a dictated
// sentence with an unrelated aside ("...soccer at 4pm, I'm in the living
// room, driver should be Priya") matched "from" against a clause that
// was never a pickup location at all, silently pinning pickupLocation to
// nonsense. Requiring the "from" to sit near a pickup/collect verb (or
// right after the ride's own subject, "pick up Leo from X") keeps this
// scoped to language that's actually describing a ride, not any "from"
// in the sentence.
// "pick(?:ing)? ?up" alone missed the single most common kid phrasing,
// "pick ME up" / "pick HIM up" / "pick THEM up" — the object sits BETWEEN
// pick and up, not adjacent to it like "pickup"/"pick up" are. Without the
// optional (?:me|him|her|them|\w+)\s+ in the middle, "pick me up from
// soccer" matched neither this regex nor PICKUP/DROPOFF verb detection
// below, silently leaving pickup location AND rideDirection both unfilled
// despite the sentence being an unambiguous pickup request.
const PICKUP_CONTEXT_RE = /\b(?:pick(?:ing)?\s?(?:me|him|her|them)?\s?up|picked (?:me|him|her|them)?\s?up|collect(?:ing)?|leaving|coming)\b[^.,;]{0,40}\bfrom\s+([a-z0-9' ]+?)(?:\s+(?:at|on|by|before|after|every|daily|weekly|monthly)\b|[.,;]|$)/i;

// No-preposition fallback: "pick me up soccer" / "drop me off dance class"
// names the place right after the verb with no "from"/"to"/"at" at all —
// live-reported phrasing, not hypothetical. Only fires when the "from"/"to"
// forms above found nothing, so a sentence that DID use a preposition still
// prefers that more explicit match.
// Negative lookahead right after the verb stops "pick me up at 10 pm" (pure
// time, no place at all) from having its cutoff keyword itself captured as
// the location — the lazy `+?` group has nothing to stop on BEFORE "at" when
// "at" is the very next word, so it swallowed "at 10 pm" whole as a bogus
// pickup location (live bug: kid's "Pickup location" field filled with
// "At 10 pm"). Requiring the captured text not START with a cutoff keyword
// forces the regex to fail (and location stays null) instead of matching a
// location-shaped string that's actually just the time.
const PICKUP_NO_PREP_RE = /\b(?:pick(?:ing)?\s?(?:me|him|her|them)?\s?up|picked (?:me|him|her|them)?\s?up)\b\s+(?!(?:at|on|by|before|after|every|daily|weekly|monthly)\b)([a-z0-9' ]+?)(?:\s+(?:at|on|by|before|after|every|daily|weekly|monthly)\b|[.,;]|$)/i;
const DROPOFF_NO_PREP_RE = /\b(?:drop(?:ping)?\s?(?:me|him|her|them)?\s?off|dropped (?:me|him|her|them)?\s?off)\b\s+(?!(?:at|on|by|before|after|every|daily|weekly|monthly)\b)([a-z0-9' ]+?)(?:\s+(?:at|on|by|before|after|every|daily|weekly|monthly)\b|[.,;]|$)/i;

export function extractLocations(rawInput: string): ExtractedLocations {
  let pickup: string | null = null, dropoff: string | null = null;
  let m = rawInput.match(/\bfrom\s+([a-z0-9' ]+?)\s+to\s+([a-z0-9' ]+?)(?:\s+(?:at|on|by|before|after)\b|[.,]|$)/i);
  if (m) {
    pickup = m[1].trim();
    dropoff = m[2].trim();
  } else {
    m = rawInput.match(PICKUP_CONTEXT_RE);
    if (m) pickup = m[1].trim();
    // "drop off X at Y" and "drop off X to Y" are both real phrasings people
    // use for the same thing (live-reported: "drop off jas to dance class
    // at 415pm") — "to" used to be missing from this alternation entirely,
    // so that exact wording fell through to the generic non-ride title path
    // instead of populating a real dropoff location.
    m = rawInput.match(/\b(?:drop(?:ping)?(?:\s|-)?off(?:\s+\w+)?\s+(?:at|to)|take (?:her|him|them) to)\s+([a-z0-9' ]+?)(?:\s+(?:at|on|by|before|after)\b|[.,]|$)/i);
    if (m) dropoff = m[1].trim();
    if (!pickup) {
      m = rawInput.match(PICKUP_NO_PREP_RE);
      if (m) pickup = m[1].trim();
    }
    if (!dropoff) {
      m = rawInput.match(DROPOFF_NO_PREP_RE);
      if (m) dropoff = m[1].trim();
    }
  }
  const clean = (s: string | null) => s ? s.replace(/\s+/g, ' ').trim().replace(/^\w/, c => c.toUpperCase()) : null;
  return { pickup: clean(pickup), dropoff: clean(dropoff) };
}

// "the driver should be Priya" / "driven by Priya" / "Priya should drive" /
// "Priya is driving" — the adult who's actually behind the wheel, distinct
// from who the ride is FOR (extractPerson/extractMemberNames). Returns the
// matching family member's full name so it can be resolved straight to a
// MemberPicker selection.
export function extractDriver(rawInput: string, members: { id: string; name: string; role: string }[]): { id: string; name: string } | null {
  const adults = members.filter(m => m.role === 'parent' || m.role === 'senior');
  for (const m of adults) {
    const first = escapeRegex(m.name.split(' ')[0]);
    const patterns = [
      '(?:driver|driving)\\s+(?:should\\s+be|would\\s+be|is|will\\s+be)\\s+' + first,
      'driven\\s+by\\s+' + first,
      first + '\\s+(?:should\\s+drive|is\\s+driving|will\\s+drive|would\\s+drive|to\\s+drive)',
    ];
    // Matched directly against this member row, so its id is already
    // resolved here — return it alongside the name instead of making a
    // caller re-derive the id from the name later.
    if (patterns.some(p => new RegExp('\\b' + p + '\\b', 'i').test(rawInput))) return { id: m.id, name: m.name };
  }
  return null;
}

// Capitalized name right after "pick up" / "drop off" style phrases —
// matched case-insensitively on the phrase, case-sensitively on the name,
// so "pick up milk" doesn't get mistaken for a person.
export function extractPerson(rawInput: string): string | null {
  const lower = rawInput.toLowerCase();
  const phrases = ['picking up', 'dropping off', 'pick up', 'drop off'];
  for (const p of phrases) {
    const idx = lower.indexOf(p);
    if (idx === -1) continue;
    const after = rawInput.slice(idx + p.length);
    const m = after.match(/^\s+([A-Z][a-z]+)\b/);
    if (m) return m[1];
  }
  return null;
}

// Every name mentioned anywhere in the input that matches a known family
// member — used for "all kids"/"Leo and Maya" multi-assignee resolution.
// Deliberately separate from extractPerson (which is scoped to the
// pick-up/drop-off phrase pattern only) since a chore like "Leo and Maya
// take out the trash" names people with no ride phrase context at all.
export function extractMemberNames(rawInput: string, members: { id: string; name: string; role: string }[]): string[] {
  const lower = rawInput.toLowerCase();
  const found: string[] = [];
  // Bare "kids"/"children" counts as the same group reference as "all
  // kids"/"the kids" — someone writing "for kids" or "kids clean the
  // garage" means every kid/teen just as much as the "all"/"the"-prefixed
  // phrasing did. \b boundaries keep this from matching inside an
  // unrelated word (e.g. "kiddie pool" still won't hit "\bkids\b").
  if (/\bkids?\b|\bchildren\b|\beveryone\b|\bwhole family\b|\bfamily\b/.test(lower)) {
    return members.filter(m => m.role === 'kid' || m.role === 'teen').map(m => m.name);
  }
  for (const m of members) {
    const first = m.name.split(' ')[0];
    if (new RegExp('\\b' + escapeRegex(first.toLowerCase()) + '\\b').test(lower)) found.push(m.name);
  }
  return found;
}

// "$50", "50 dollars", and "20 bucks" all read the same amount — a bare
// "$" prefix was the only form recognized before, missing the equally
// common spelled-out phrasing ("about 50 dollars for the pharmacy run").
export function extractAmount(rawInput: string): number | null {
  const dollarSign = rawInput.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  if (dollarSign) return parseFloat(dollarSign[1]);
  const spelled = rawInput.match(/\b(\d+(?:\.\d{1,2})?)\s?(?:dollars?|bucks?)\b/i);
  return spelled ? parseFloat(spelled[1]) : null;
}

export interface LocalDetectionResult {
  category: CategoryEntry;
  confidence: number;
  title: string;
  when: ExtractedDateTime;
  locations: ExtractedLocations;
  memberNames: string[];
  amount: number | null;
  recurrence: 'once' | 'daily' | 'weekly' | 'monthly';
  recurrenceDays: number[]; // 0=Sun..6=Sat, only meaningful when recurrence==='weekly'
  // Which leg(s) of a ride the sentence actually asked for — null when
  // neither a pickup nor a drop-off verb appears, so the ride form can
  // leave its own chip default untouched instead of guessing wrong.
  rideDirection: 'dropoff' | 'pickup' | 'both' | null;
  // For a both-ways ride: which leg was spoken first.
  firstLeg?: 'pickup' | 'dropoff' | null;
  urgent: boolean;
  // Category-vote kind can be wrong for phrasing the keyword list alone
  // can't disambiguate — "remind me to call the dentist" is a to-do
  // (quest) even though "dentist" votes Medical/event; "schedule a soccer
  // practice" names an event category but the imperative "schedule" is
  // itself an event signal. kindOverride carries that stronger verb-level
  // signal so the caller can trust it over category.kind when set.
  kindOverride: DetectionKind | null;
  // The adult actually driving, distinct from memberNames (who the ride is
  // FOR) — see extractDriver's own comment. Full name, ready to resolve to
  // a MemberPicker selection; null when no driver phrase was found.
  driverName: string | null;
  // Real member id for the same driver, resolved directly by extractDriver
  // (it matched against the actual members array) — prefer this over a
  // name-based members.find() downstream. Null whenever driverName is.
  driverId: string | null;
  // "enable call reminder"/"call notification" typed directly into the
  // free-text box — see CALL_REMINDER_RE.
  alertCall: boolean;
}

// Leading framing phrases stripped entirely before the date/time cutoff
// runs — "Remind me to take out the trash" should title as "Take out the
// trash", not keep the instruction-to-self as part of what the task IS.
const LEADING_FRAME_RE = /^\s*(please\s+)?(remind me to|remember to|don'?t forget to|i need to|we need to|someone needs to|someone should|make sure (?:someone|\w+)\s+)/i;

// Builds a clean, editable starting title — ride tasks get a structured
// "Pick up X from Y" shape, everything else keeps the original phrase
// minus its date/time/recurrence/urgency/group-reference tail.
function suggestTitle(rawInput: string, entry: CategoryEntry, person: string | null, locs: ExtractedLocations): string {
  let t = rawInput.trim();
  if (!t) return '';
  if (entry.key === 'ride') {
    // Live-reported: the title should lead with WHO and use the same
    // to/from preposition the destination actually pairs with — "Drop Jas
    // to Dance Class" / "Pickup Jas from Dance Class" — instead of the
    // previous "Pick up X from A to B" phrasing, which read like a single
    // door-to-door trip rather than naming the drop-off/pickup leg it is.
    if (locs.pickup && locs.dropoff) return (person ? `Drop ${person}` : 'Drop-off') + ` to ${locs.dropoff}, pickup from ${locs.pickup}`;
    if (locs.dropoff) return (person ? `Drop ${person}` : 'Drop-off') + ` to ${locs.dropoff}`;
    if (locs.pickup) return (person ? `Pickup ${person}` : 'Pickup') + ` from ${locs.pickup}`;
  }
  t = t.replace(LEADING_FRAME_RE, '');
  const cutoffRe = /\b(today|tonight|tomorrow|next\s+\w+|every\s+\w+|everyday|each\s+day|daily|weekly|monthly|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|at\s+\d{1,2}(:\d{2})?\s?(am|pm)?|about\s*\$\s?\d+(\.\d+)?|for all kids|for the kids|for kids|for the whole family|for everyone|for family|urgent|asap|as soon as possible|right away|immediately|(?:enable\s+)?call\s+(?:reminder|notification|alert)s?)\b/i;
  const m = cutoffRe.exec(t);
  if (m) t = m.index > 0 ? t.slice(0, m.index) : t.slice(m[0].length);
  t = t.replace(/\s+/g, ' ').trim().replace(/^[,.\-—]+|[,.\-—]+$/g, '').trim();
  if (!t) t = rawInput.trim().replace(LEADING_FRAME_RE, '').trim() || rawInput.trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length > 70) t = t.slice(0, 67).trim() + '…';
  return t;
}

const MIN_CONFIDENT_SCORE = 1.5;

// Imperative/framing verbs that signal "quest" (a to-do, no fixed
// appointment slot) regardless of which category keywords also matched —
// "remind me to call the dentist" votes Medical via "dentist" but is
// clearly a to-do, not a clinic visit; "someone needs to X" is the
// household-pool framing this app's own chore language already uses.
const QUEST_VERB_RE = /\b(remind me to|remember to|need(?:s)? to|someone (?:needs? to|should)|don'?t forget to|make sure (?:someone|\w+) )\b/;

// Explicit scheduling verbs are a stronger "event" signal than category
// alone — "schedule the dentist" and "book a doctor" both should win over
// a borderline category score.
const EVENT_VERB_RE = /\b(schedule|book|set up an? appointment)\b/;

const URGENT_RE = /\b(urgent|asap|as soon as possible|right away|immediately|emergency|now)\b/;

// "enable call reminder"/"call notification"/"call alert" — the composer's
// own alertCall/alertCallLeadMinutes toggle otherwise only ever flips via a
// manual button tap; typing the request directly into the free-text box did
// nothing to it (live-reported). "call" alone is too broad (would misfire on
// "call the dentist," "phone call with tutor," etc. — a chore/event ABOUT a
// phone call, not a request to be called-reminded about THIS one), so this
// requires a reminder/notification/alert word alongside "call".
const CALL_REMINDER_RE = /\b(?:enable\s+)?call\s+(?:reminder|notification|alert)s?\b|\b(?:reminder|notification|alert)s?\s+(?:via\s+)?call\b/;

const DAY_TOKEN_MAP: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

// The location parser can mistake the PERSON or a date word for a place ("pick up Cherry at 5:30" -> pickup "Cherry", "pick up
// Jaswi today" -> "Jaswi today"). Drop those, and when nothing real is left but the sentence says where ("... to dance class",
// "... from school") use that as the venue.
function cleanLocations(locs: ExtractedLocations, rawInput: string, members: { name: string }[]): ExtractedLocations {
  const firsts = members.map(m => m.name.split(' ')[0].toLowerCase()).filter(Boolean);
  const DATE_WORDS = /\b(today|tonight|tomorrow|morning|afternoon|evening|now)\b/gi;
  const clean = (v: string | null): string | null => {
    if (!v) return null;
    let t = v.replace(DATE_WORDS, ' ').replace(/\s+/g, ' ').trim();
    const lower = t.toLowerCase();
    if (!t || firsts.includes(lower) || /^(her|him|them|me|us|school bus)$/.test(lower)) return null;
    for (const f of firsts) if (lower === f || lower.startsWith(f + ' ')) { t = t.slice(f.length).trim(); break; }
    return t && !firsts.includes(t.toLowerCase()) ? t : null;
  };
  const notTime = (v: string | null) => (v && !/^\d/.test(v.trim()) ? v : null);
  let pickup = notTime(clean(locs.pickup));
  let dropoff = notTime(clean(locs.dropoff));
  const saidDrop = /\bdrop(?:ping)?\b|\b(?:take|bring|drive)\s+(?:me|her|him|them|[a-z]+)\s+to\b/i.test(rawInput);
  const saidPick = /\bpick(?:ing)?\s?(?:me|him|her|them|[a-z]+)?\s?up|collect/i.test(rawInput);
  if (saidDrop && !dropoff) {
    let t = ' ' + rawInput.toLowerCase() + ' ';
    for (const f of firsts) t = t.replace(new RegExp('\\b' + escapeRegex(f) + '\\b', 'g'), ' ');
    const dm = t.match(/\b(?:drop(?:ping)?|take|bring|drive)\b[^.,;]*?\b(?:in|at|to|off at|off to)\s+(?:the\s+)?([a-z][a-z' ]{1,30}?)(?=\s+(?:at|on|by|and|today|tomorrow|tonight|every|for)\b|\s*[.,;]|\s*$)/);
    const place = dm ? notTime(clean(dm[1])) : null;
    if (place) dropoff = place;
  }
  // Both ways at one venue: "take Jaswi to dance at 5 and pick her up at 6:30" -> drop at dance, pick up from dance.
  if (saidDrop && saidPick && dropoff && !pickup) pickup = dropoff;
  if (!pickup && !dropoff && (saidPick || saidDrop)) {
    let text = ' ' + rawInput.toLowerCase() + ' ';
    for (const f of firsts) text = text.replace(new RegExp('\\b' + escapeRegex(f) + '\\b', 'g'), ' ');
    const m = text.match(/\b(?:from|to|at)\s+(?:the\s+)?([a-z][a-z' ]{1,30}?)(?=\s+(?:at|on|by|today|tomorrow|tonight|every|and|for)\b|\s*[.,;]|\s*$)/);
    const place = m ? clean(m[1].replace(/\b\d.*$/, '').trim()) : null;
    if (place && !/^(\d|noon|midnight)/.test(place)) {
      const pickingUp = /\bpick(?:ing)?\s?(?:me|him|her|them|[a-z]+)?\s?up|collect/i.test(rawInput);
      if (pickingUp) pickup = place; else dropoff = place;
    }
  }
  return { pickup, dropoff };
}

export function detectLocalTask(rawInput: string, members: { id: string; name: string; role: string }[]): LocalDetectionResult | null {
  const input = rawInput.toLowerCase().trim();
  if (!input) return null;

  const expanded = expandSynonyms(input);
  const inputWords = new Set(expanded.split(/[^a-z]+/).filter(w => w.length > 2));
  const inputStems = new Set([...inputWords].map(stem));

  // "Pick up X"/"Drop off X" only means a RIDE when X is a person — "pick
  // up groceries"/"pick up the dry cleaning" is an errand, not transport,
  // even though "pick up" is also (correctly) one of ride's own keywords.
  // Detected once here so the category scoring below can tell the two
  // apart instead of "pick up"'s 2-word phrase match (worth 6) always
  // outscoring a single-word errand keyword like "groceries" (worth 2).
  // "pick me up"/"drop me off" is the single most common way a kid phrases
  // their own ride request — "me"/"myself" is just as much a real target as
  // a named family member or her/him/them, and previously fell through to
  // the discounted generic-errand branch below, misclassifying "pick me up
  // at 4pm" as a low-confidence chore instead of a Ride.
  // "pick up me" (object after "up") is not how anyone actually phrases
  // this — real phrasing puts the object BETWEEN pick/drop and up/off
  // ("pick me up", "drop me off"), which the original regex never matched
  // at all, silently discounting the ride category's score on the most
  // common ride-request sentence shape a kid would type.
  const pickupTargetsSelf = /\b(?:pick(?:ing)?\s?(?:me|myself)\s?up|drop(?:ping)?\s?(?:me|myself)\s?off)\b/.test(input);
  const pickupTargetsPerson = pickupTargetsSelf || members.some(m => {
    const first = m.name.split(' ')[0].toLowerCase();
    return new RegExp('\\b(?:pick(?:ing)?\\s?up|drop(?:ping)?\\s?off)\\s+' + escapeRegex(first) + '\\b').test(input)
      || new RegExp('\\b(?:pick(?:ing)?\\s?up|drop(?:ping)?\\s?off)\\s+(?:her|him|them)\\b').test(input)
      // "take Jaswi to dance", "bring Cherry to school", "drive Maya to practice", "pick Jaswi up"
      || new RegExp('\\b(?:take|taking|bring|bringing|drive|driving|drop|run)\\s+' + escapeRegex(first) + '\\s+(?:to|at|over)\\b').test(input)
      || new RegExp('\\bpick\\s+' + escapeRegex(first) + '\\s+up\\b').test(input);
  }) || /\b(?:take|bring|drive)\s+(?:me|her|him|them)\s+to\b/.test(input);

  let bestKey: string | null = null;
  let bestScore = 0;
  Object.values(CATEGORY_DB).forEach(entry => {
    if (!entry.kw.length) return;
    let score = scoreCategory(expanded, inputStems, entry.kw);
    // Ride's generic pickup/dropoff/fetch/collect phrases are meaningless
    // on their own (they're just as true of "pick up milk" as "pick up
    // Maya") — only let them carry full weight when a real person was
    // actually named as the target, or a from/to location phrase is
    // present (still transport-shaped even with no name, e.g. "pickup from
    // the airport"). Otherwise heavily discount so an item-shaped errand
    // keyword elsewhere in the same sentence can win instead.
    if (entry.key === 'ride' && !pickupTargetsPerson && !/\bfrom\b/.test(input)) {
      score *= 0.3;
    }
    if (score > bestScore) { bestScore = score; bestKey = entry.key; }
  });

  // "pick up milk" (an item, not a person, and no from/to place) is an errand to do, never a ride.
  if (bestKey === 'ride' && !pickupTargetsPerson && !/\b(?:from|to)\b/.test(input) && CATEGORY_DB.errand) {
    bestKey = 'errand'; bestScore = Math.max(bestScore, MIN_CONFIDENT_SCORE + 0.2);
  }
  const confidence = bestScore < MIN_CONFIDENT_SCORE ? 0 : scoreToConfidence(bestScore);
  // A below-threshold match still displaying its specific category chip
  // ("🚗 Ride" at 22% confidence) contradicts the "wasn't totally clear"
  // warning shown alongside it — fall back to the neutral general_task
  // entry for anything not confident enough to act on.
  const entry = (bestKey && confidence > 0) ? CATEGORY_DB[bestKey] : CATEGORY_DB.general_task;

  // A sentence with a clock time and an event-style noun ("meeting at 3", "dinner at 7 tonight", "recital Friday 6pm") is an
  // event on the calendar, not a to-do, even when no category keyword matched strongly.
  const EVENT_NOUN_RE = /\b(meeting|appointment|dinner|lunch|brunch|party|recital|concert|game|match|practice|rehearsal|class|lesson|visit|call|interview|play ?date|sleepover|checkup|check-up|show|ceremony|graduation|reunion|wedding|trip)\b/;
  let entryFinal = entry;
  if (entry.kind === 'quest' && !QUEST_VERB_RE.test(input) && extractDateTime(input).time && EVENT_NOUN_RE.test(input)) {
    entryFinal = CATEGORY_DB.event_social ?? entry;
  }
  let kindOverride: DetectionKind | null = null;
  if (QUEST_VERB_RE.test(input)) kindOverride = 'quest';
  else if (EVENT_VERB_RE.test(input)) kindOverride = 'event';

  const when = extractDateTime(input);
  const locations = cleanLocations(extractLocations(rawInput), rawInput, members);
  const person = extractPerson(rawInput);
  const driver = extractDriver(rawInput, members);
  const driverName = driver?.name ?? null;
  const driverId = driver?.id ?? null;
  // The driver isn't also an assignee — "the driver should be Priya" names
  // Priya as who's DOING the driving, not who the ride is for. Without
  // this exclusion she'd land in both the driver picker AND the "For"
  // multi-select simultaneously, which is exactly the bug this fixes.
  const memberNames = extractMemberNames(rawInput, members).filter(n => n !== driverName);
  const amount = extractAmount(rawInput);
  const urgent = URGENT_RE.test(input);
  const alertCall = CALL_REMINDER_RE.test(input);

  // "every monday"/"weekly on tues" is real recurrence; a bare "Thursday
  // 2pm" (no "every"/"weekly"/plural-day framing) is a one-time event on
  // that specific day — the old version matched any weekday mention at
  // all, misclassifying every one-time weekday appointment as weekly.
  let recurrence: LocalDetectionResult['recurrence'] = 'once';
  const recurrenceDays: number[] = [];
  // Was a hand-built "(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)
  // (day)?s?" alternation — the "abbreviation + optional 'day' suffix"
  // trick silently breaks for any day whose full spelling ISN'T its
  // abbreviation plus literally "day": wednesday is "wed"+"nesday", not
  // "wed"+"day", and saturday is "sat"+"urday", not "sat"+"day". Every
  // OTHER day (sun→sunday, mon→monday, tue→tuesday, thu→thursday,
  // fri→friday) happens to fit the pattern, which is exactly why this went
  // unnoticed — live-reported: "every Wednesday" wasn't recognized as
  // recurring at all, while "every wed" was. DAY_TOKEN_MAP below already
  // has every correct spelling as its own explicit key (including
  // wednesday/saturday) for the recurrenceDays population two lines down —
  // reusing those same keys here instead of a second, inconsistent
  // hand-written list removes the class of bug entirely rather than just
  // patching this one pair of days.
  const dayTokenAlternation = Object.keys(DAY_TOKEN_MAP).sort((a, b) => b.length - a.length).join('|');
  const weeklyDayRe = new RegExp(`\\bevery\\s+(${dayTokenAlternation})s?\\b`);
  // Live-requested: "identify every weekday" — "every weekday"/"weekdays"
  // is Mon-Fri recurrence, a genuinely different rule from "every day"
  // (7/7) that this detector never recognized as recurring at all before
  // (no keyword here matched "weekday" — daily's own regex only matches
  // the literal word "day", and weeklyDayRe's day-name alternation has no
  // "weekday" entry either, so "school drop-off every weekday" fell
  // through to a one-time detection). Checked BEFORE the plain daily
  // check below, since "weekday" contains "day" as a substring and would
  // otherwise need to avoid a false daily match too — matching first
  // instead is simpler and avoids that ordering trap entirely.
  const weekdayRe = /\bevery\s+weekday|\bweekdays?\b(?!\s*and\s*weekend)/i;
  // "every other day"/"alternate days"/"every alternate day" has no bucket
  // of its own in the once/daily/weekly/monthly model both this form and
  // the ride/quest forms share — closest real bucket is 'daily', since it's
  // still a day-granularity repeat rather than a specific weekday list.
  // Checked first since "every other day" would otherwise also satisfy
  // weeklyDayRe's day-token scan (false positive: "other" isn't a day, but
  // plain "daily"/"every day" checks below it DO literally contain "day").
  const alternateDaysRe = /\bevery\s+other\s+day\b|\balternate\s+days?\b|\bevery\s+alternate\s+day\b/;
  // A bare list/pair of weekday names with no "every"/"weekly" framing at
  // all — "Tue and Thu pickups", "Mon Wed Fri practice" — is still real
  // recurrence, just phrased as a day-list instead of "every <day>". Require
  // at least 2 distinct day tokens so a single bare day name ("Thursday
  // 2pm", a one-time event) is never misread as recurring.
  const bareDayListMatches = Object.entries(DAY_TOKEN_MAP)
    .filter(([token]) => new RegExp('\\b' + token + '\\b').test(input));
  const bareDayListDays = new Set(bareDayListMatches.map(([, num]) => num));
  if (alternateDaysRe.test(input)) {
    recurrence = 'daily';
  } else if (weekdayRe.test(input)) {
    recurrence = 'weekly';
    recurrenceDays.push(1, 2, 3, 4, 5);
  } else if (/\bdaily\b|\bevery\s+day\b|\beveryday\b|\beach\s+day\b/.test(input)) {
    recurrence = 'daily';
  } else if (/\bmonthly\b|\bevery month\b/.test(input)) {
    recurrence = 'monthly';
  } else if (/\bweekly\b|\bevery week\b/.test(input) || weeklyDayRe.test(input) || bareDayListDays.size >= 2) {
    recurrence = 'weekly';
    bareDayListDays.forEach(num => { if (!recurrenceDays.includes(num)) recurrenceDays.push(num); });
  }

  // A kid describing a ride shouldn't also have to manually tap the
  // "Ride needed?" dropoff/pickup/both chip row afterward — "drop me off
  // at X"/"take me to X" means Drop-off, "pick me up from X"/"get me from
  // X" means Pickup, and if a sentence names both verbs it's genuinely
  // Both. Independent of whether extractLocations actually captured a
  // location string, since the verb itself is the real signal here.
  // Same "pick ME up" gap as PICKUP_CONTEXT_RE above — the object (me/him/
  // her/them) sits between "pick" and "up", not adjacent to it.
  const hasPickupVerb = /\b(?:pick(?:ing)?\s?(?:me|him|her|them|[a-z]+)?\s?up|picked (?:me|him|her|them)?\s?up|collect(?:ing)?|get(?:ting)?\s+me)\b/.test(input);
  const hasDropoffVerb = /\bdrop(?:ping)?(?:\s|-)?off\b|\bdrop\s+(?:me|her|him|them|[a-z]+)\s+(?:at|to)\b|\b(?:take|bring|drive)\s+(?:me|her|him|them|[a-z]+)\s+to\b/.test(input);
  const rideDirection: LocalDetectionResult['rideDirection'] =
    hasPickupVerb && hasDropoffVerb ? 'both' : hasDropoffVerb ? 'dropoff' : hasPickupVerb ? 'pickup' : null;

  const pickIdx = input.search(/\bpick(?:ing)?\s?(?:me|him|her|them|[a-z]+)?\s?up|\bcollect/);
  const dropIdx = input.search(/\bdrop(?:ping)?(?:\s|-)?off\b|\bdrop\s|\b(?:take|bring|drive)\s/);
  const firstLeg: LocalDetectionResult['firstLeg'] = rideDirection === 'both' && pickIdx >= 0 && dropIdx >= 0
    ? (pickIdx < dropIdx ? 'pickup' : 'dropoff') : null;

  // Places only mean something for a ride-shaped sentence; a stray "to call mom" is not a drop-off address.
  const rideShaped = hasPickupVerb || hasDropoffVerb;
  const locationsOut = rideShaped ? locations : { pickup: null, dropoff: null };
  return {
    category: entryFinal,
    confidence: entryFinal === entry ? confidence : Math.max(confidence, 0.7),
    title: suggestTitle(rawInput, entryFinal, person, locationsOut),
    when,
    locations: locationsOut,
    memberNames,
    rideDirection,
    firstLeg,
    amount,
    recurrence,
    recurrenceDays,
    urgent,
    kindOverride,
    driverName,
    driverId,
    alertCall,
  };
}
