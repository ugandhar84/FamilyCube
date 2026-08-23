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

export interface ExtractedDateTime { date: string | null; time: string | null }

// "today"/"tonight"/"tomorrow", weekday names (with optional "next"), and
// clock times like "4pm"/"2:30pm" — only fills a field when it finds an
// explicit signal, never a guess.
export function extractDateTime(input: string): ExtractedDateTime {
  const today = new Date();
  const result: ExtractedDateTime = { date: null, time: null };
  let daysAhead: number | null = null;
  if (/\btonight\b|\btoday\b/.test(input)) daysAhead = 0;
  else if (/\btomorrow\b/.test(input)) daysAhead = 1;
  else {
    const d = extractDayOfWeek(input);
    if (d !== null) daysAhead = d;
  }
  if (daysAhead !== null) {
    const d = new Date(today);
    d.setDate(d.getDate() + daysAhead);
    result.date = d.toISOString().slice(0, 10);
  }
  const timeMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const mer = timeMatch[3].toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    result.time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
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
const PICKUP_CONTEXT_RE = /\b(?:pick(?:ing)?\s?up|picked up|collect(?:ing)?|leaving|coming)\b[^.,;]{0,40}\bfrom\s+([a-z0-9' ]+?)(?:\s+(?:at|on|by|before|after)\b|[.,;]|$)/i;

export function extractLocations(rawInput: string): ExtractedLocations {
  let pickup: string | null = null, dropoff: string | null = null;
  let m = rawInput.match(/\bfrom\s+([a-z0-9' ]+?)\s+to\s+([a-z0-9' ]+?)(?:\s+(?:at|on|by|before|after)\b|[.,]|$)/i);
  if (m) {
    pickup = m[1].trim();
    dropoff = m[2].trim();
  } else {
    m = rawInput.match(PICKUP_CONTEXT_RE);
    if (m) pickup = m[1].trim();
    m = rawInput.match(/\b(?:drop(?:ping)?(?:\s|-)?off(?:\s+\w+)?\s+at|take (?:her|him|them) to)\s+([a-z0-9' ]+?)(?:\s+(?:at|on|by|before|after)\b|[.,]|$)/i);
    if (m) dropoff = m[1].trim();
  }
  const clean = (s: string | null) => s ? s.replace(/\s+/g, ' ').trim().replace(/^\w/, c => c.toUpperCase()) : null;
  return { pickup: clean(pickup), dropoff: clean(dropoff) };
}

// "the driver should be Priya" / "driven by Priya" / "Priya should drive" /
// "Priya is driving" — the adult who's actually behind the wheel, distinct
// from who the ride is FOR (extractPerson/extractMemberNames). Returns the
// matching family member's full name so it can be resolved straight to a
// MemberPicker selection.
export function extractDriver(rawInput: string, members: { id: string; name: string; role: string }[]): string | null {
  const adults = members.filter(m => m.role === 'parent' || m.role === 'senior');
  for (const m of adults) {
    const first = escapeRegex(m.name.split(' ')[0]);
    const patterns = [
      '(?:driver|driving)\\s+(?:should\\s+be|would\\s+be|is|will\\s+be)\\s+' + first,
      'driven\\s+by\\s+' + first,
      first + '\\s+(?:should\\s+drive|is\\s+driving|will\\s+drive|would\\s+drive|to\\s+drive)',
    ];
    if (patterns.some(p => new RegExp('\\b' + p + '\\b', 'i').test(rawInput))) return m.name;
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
    if (locs.pickup && locs.dropoff) return (person ? `Pick up ${person}` : 'Ride') + ` from ${locs.pickup} to ${locs.dropoff}`;
    if (locs.pickup) return (person ? `Pick up ${person}` : 'Pickup') + ` from ${locs.pickup}`;
    if (locs.dropoff) return (person ? `Drop off ${person}` : 'Drop-off') + ` at ${locs.dropoff}`;
  }
  t = t.replace(LEADING_FRAME_RE, '');
  const cutoffRe = /\b(today|tonight|tomorrow|next\s+\w+|every\s+\w+|daily|weekly|monthly|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|at\s+\d{1,2}(:\d{2})?\s?(am|pm)?|about\s*\$\s?\d+(\.\d+)?|for all kids|for the kids|for kids|for the whole family|for everyone|for family|urgent|asap|as soon as possible|right away|immediately)\b/i;
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

const DAY_TOKEN_MAP: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

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
  const pickupTargetsPerson = members.some(m => {
    const first = m.name.split(' ')[0].toLowerCase();
    return new RegExp('\\b(?:pick(?:ing)?\\s?up|drop(?:ping)?\\s?off)\\s+' + escapeRegex(first) + '\\b').test(input)
      || new RegExp('\\b(?:pick(?:ing)?\\s?up|drop(?:ping)?\\s?off)\\s+(?:her|him|them)\\b').test(input);
  });

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

  const confidence = bestScore < MIN_CONFIDENT_SCORE ? 0 : scoreToConfidence(bestScore);
  // A below-threshold match still displaying its specific category chip
  // ("🚗 Ride" at 22% confidence) contradicts the "wasn't totally clear"
  // warning shown alongside it — fall back to the neutral general_task
  // entry for anything not confident enough to act on.
  const entry = (bestKey && confidence > 0) ? CATEGORY_DB[bestKey] : CATEGORY_DB.general_task;

  let kindOverride: DetectionKind | null = null;
  if (QUEST_VERB_RE.test(input)) kindOverride = 'quest';
  else if (EVENT_VERB_RE.test(input)) kindOverride = 'event';

  const when = extractDateTime(input);
  const locations = extractLocations(rawInput);
  const person = extractPerson(rawInput);
  const driverName = extractDriver(rawInput, members);
  // The driver isn't also an assignee — "the driver should be Priya" names
  // Priya as who's DOING the driving, not who the ride is for. Without
  // this exclusion she'd land in both the driver picker AND the "For"
  // multi-select simultaneously, which is exactly the bug this fixes.
  const memberNames = extractMemberNames(rawInput, members).filter(n => n !== driverName);
  const amount = extractAmount(rawInput);
  const urgent = URGENT_RE.test(input);

  // "every monday"/"weekly on tues" is real recurrence; a bare "Thursday
  // 2pm" (no "every"/"weekly"/plural-day framing) is a one-time event on
  // that specific day — the old version matched any weekday mention at
  // all, misclassifying every one-time weekday appointment as weekly.
  let recurrence: LocalDetectionResult['recurrence'] = 'once';
  const recurrenceDays: number[] = [];
  if (/\bdaily\b|\bevery day\b/.test(input)) {
    recurrence = 'daily';
  } else if (/\bmonthly\b|\bevery month\b/.test(input)) {
    recurrence = 'monthly';
  } else if (/\bweekly\b|\bevery week\b|\bevery\s+(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(day)?s?\b/.test(input)) {
    recurrence = 'weekly';
    Object.entries(DAY_TOKEN_MAP).forEach(([token, num]) => {
      if (new RegExp('\\b' + token + '\\b').test(input) && !recurrenceDays.includes(num)) recurrenceDays.push(num);
    });
  }

  return {
    category: entry,
    confidence,
    title: suggestTitle(rawInput, entry, person, locations),
    when,
    locations,
    memberNames,
    amount,
    recurrence,
    recurrenceDays,
    urgent,
    kindOverride,
    driverName,
  };
}
