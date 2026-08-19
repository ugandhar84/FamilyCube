// Fast, local, no-network profanity/slur check — runs synchronously before
// a message ever leaves the device. This is layer 1 of two: an obvious-word
// blocklist that blocks the send outright (nothing reaches the server), and
// a separate slower AI pass (moderate-message edge function) that runs
// AFTER send for subtler issues a keyword list can't catch (harassment/
// bullying tone), flagging the message for parents only rather than
// blocking it.
//
// The list intentionally stays short and high-confidence — this is meant to
// catch clearly inappropriate language a family app shouldn't allow, not to
// police every borderline word. False positives on a strict child-safety
// app are worse than a rare miss the AI layer can still catch.

const BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'piss',
  'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut',
];

// Matches the word with common leetspeak substitutions and optional
// plural/suffix, as a whole word (not inside an unrelated longer word).
function buildPattern(word: string): RegExp {
  const escaped = word
    .replace(/a/g, '[a@4]')
    .replace(/i/g, '[i1!]')
    .replace(/o/g, '[o0]')
    .replace(/e/g, '[e3]')
    .replace(/s/g, '[s$5]');
  return new RegExp(`\\b${escaped}\\w{0,3}\\b`, 'i');
}

const PATTERNS = BLOCKED_WORDS.map(w => ({ word: w, re: buildPattern(w) }));

export interface ModerationResult {
  blocked: boolean;
  matches: string[];
}

export function checkProfanity(text: string): ModerationResult {
  if (!text?.trim()) return { blocked: false, matches: [] };
  const matches = PATTERNS.filter(p => p.re.test(text)).map(p => p.word);
  return { blocked: matches.length > 0, matches };
}
