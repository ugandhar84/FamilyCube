/**
 * Client-side content filter for AI input fields.
 *
 * Designed for a pet health app — blocks genuinely offensive/harmful words
 * while allowing medical vocabulary (blood, vomit, discharge, etc.).
 *
 * Use `filterText()` in onChangeText to strip flagged words as the user types.
 * Use `isBlocked()` before sending to show a clear error if anything slips through.
 */

// Words that are allowed because pet owners commonly use them to describe
// symptoms, anatomy, or bodily functions — blocking these would make the
// AI tools unusable for their intended purpose.
// Examples: shit/poop (stool), pee/piss (urination), ass/anal/anus (rectal area),
//           vagina/vulva, penis/dick (anatomy), pussy (cat or anatomy),
//           bitch (female dog), balls/testicles, discharge, bloody, mucus.
const PET_HEALTH_ALLOWLIST = new Set([
  'shit', 'shitting', 'shat',          // stool / defecation
  'pee', 'peeing', 'peed', 'piss', 'pissing', 'pissed', // urination
  'ass', 'arse',                        // hindquarters
  'anal', 'anus',                       // rectal area (very common in vet context)
  'vagina', 'vaginal', 'vulva',         // reproductive anatomy
  'penis', 'penile', 'dick',            // reproductive anatomy
  'pussy',                              // cat / genital anatomy
  'bitch',                              // female dog (official term)
  'balls', 'testicles', 'testicle',     // anatomy
  'butt', 'butthole',                   // hindquarters
  'boobs', 'nipple', 'nipples',         // mammary glands (relevant for nursing pets)
  'bloody', 'blood',                    // symptom description
]);

// Core offensive word list — slurs, hate speech, and non-medical harmful content.
// Words in PET_HEALTH_ALLOWLIST are never blocked even if they match a pattern.
const BLOCKED_WORDS: RegExp[] = [
  // Hate speech / slurs
  /\bn+i+g+g+[ae]+r\w*/gi,
  /\bf+a+g+g+[oi]+t\w*/gi,
  /\br+e+t+a+r+d\b/gi,
  /\bk+y+k+e\b/gi,
  /\bs+p+i+c+\b/gi,
  /\bc+h+i+n+k\b/gi,
  // Sexual aggression / non-medical explicit content
  /\b(porn|xxx|onlyfans|sex\s*tape|hentai)\b/gi,
  /\b(fuck\s+you|go\s+fuck|motherfuck\w*)\b/gi,
  // Self-harm phrases
  /\b(kill\s+my\s*self|kill\s+your\s*self|suicide|self.?harm)\b/gi,
];

/** Replace flagged words with asterisks, preserving word length.
 *  Words in PET_HEALTH_ALLOWLIST pass through untouched. */
export function filterText(input: string): string {
  let out = input;
  for (const re of BLOCKED_WORDS) {
    out = out.replace(re, (match) =>
      PET_HEALTH_ALLOWLIST.has(match.toLowerCase()) ? match : '*'.repeat(match.length),
    );
  }
  return out;
}

/** Returns true if the text contains blocked content (ignoring allowed pet-health words). */
export function isBlocked(input: string): boolean {
  for (const re of BLOCKED_WORDS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      if (!PET_HEALTH_ALLOWLIST.has(m[0].toLowerCase())) return true;
    }
  }
  return false;
}
