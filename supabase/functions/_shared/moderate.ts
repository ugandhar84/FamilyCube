/**
 * Content moderation for Family Cube AI endpoints.
 *
 * Two-layer approach:
 *   1. Local pattern filter — always runs, zero latency, catches the clearest cases.
 *   2. OpenAI Moderation API — free, highly accurate; runs when OPENAI_API_KEY is set.
 *
 * The app context is pet health/care, so medical language (blood, wounds, vomit, etc.)
 * must pass through; only genuinely harmful or off-topic content is blocked.
 */

export type ModerationReason = 'harmful_content' | 'off_topic';

export interface ModerationResult {
  blocked: boolean;
  reason?: ModerationReason;
}

// ─── Local pattern filter ────────────────────────────────────────────────────

// Content that should never reach an AI — unambiguous harmful intent.
const HARMFUL_PATTERNS: RegExp[] = [
  /\b(suicide|self.?harm|kill (myself|yourself)|end (my|your) life|slit (my|your) wrist)\b/i,
  /\b(child (porn|pornography)|cp |csam|loli(con)?)\b/i,
  /\b(how (to|do I) (make|build|synthesize|manufacture).{0,40}(bomb|explosive|weapon|poison|drug))\b/i,
  /\b(hack(ing)?|phish(ing)?|sql injection|malware|ransomware)\b/i,
];

// Requests that are clearly not pet or health related.
// Keep this narrow — false positives (blocking a real pet question) are worse than
// letting through mild off-topic text that the AI system prompt will redirect anyway.
const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(write (me )?(code|a program|a script|an essay)|debug (my|this) code)\b/i,
  /\b(stock (market|price|tip)|cryptocurrency|bitcoin|invest(ment|ing)?)\b/i,
  /\b(who (is|was) the (president|prime minister|ceo))\b/i,
  /\b(write (me )?(a )?poem|tell me a joke|compose a song)\b/i,
];

function localCheck(text: string): ModerationResult {
  for (const re of HARMFUL_PATTERNS) {
    if (re.test(text)) return { blocked: true, reason: 'harmful_content' };
  }
  for (const re of OFF_TOPIC_PATTERNS) {
    if (re.test(text)) return { blocked: true, reason: 'off_topic' };
  }
  return { blocked: false };
}

// ─── OpenAI Moderation API ───────────────────────────────────────────────────

async function openaiModerate(text: string, apiKey: string): Promise<ModerationResult> {
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) return { blocked: false }; // fail open — don't break the app

    const data = await res.json();
    const result = data?.results?.[0];
    if (!result?.flagged) return { blocked: false };

    // Exclude categories that are expected in a veterinary/pet health context
    const allowedInPetContext = new Set([
      'violence',          // descriptions of injuries/wounds are normal
      'violence/graphic',  // describing a pet's accident
    ]);
    const cats: Record<string, boolean> = result.categories ?? {};
    const reallyFlagged = Object.entries(cats)
      .filter(([k, v]) => v && !allowedInPetContext.has(k))
      .map(([k]) => k);

    if (reallyFlagged.length === 0) return { blocked: false };
    return { blocked: true, reason: 'harmful_content' };
  } catch {
    return { blocked: false }; // network error → fail open
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check `text` for harmful or off-topic content.
 * Pass `openaiKey` to enable the OpenAI Moderation API layer.
 */
export async function moderateContent(
  text: string,
  openaiKey?: string | null,
): Promise<ModerationResult> {
  const local = localCheck(text);
  if (local.blocked) return local;

  if (openaiKey) {
    const remote = await openaiModerate(text, openaiKey);
    if (remote.blocked) return remote;
  }

  return { blocked: false };
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

/** Returns an appropriate 422 response when content is blocked. */
export function blockedResponse(result: ModerationResult): Response {
  const message = result.reason === 'off_topic'
    ? "I'm here to help with your pet's health and care. Please keep questions related to your furry (or feathered!) friend. 🐾"
    : "Your message couldn't be sent because it contains content that doesn't meet our community guidelines. Please rephrase and try again.";
  return new Response(
    JSON.stringify({ error: 'content_moderated', message, reason: result.reason }),
    { status: 422, headers: CORS },
  );
}
