/**
 * Model and provider names (Gemini, DeepSeek, Claude…) are not shown to people using the app. Server errors sometimes carry
 * them ("Gemini 429: …"), so anything about to be shown passes through this first.
 */
const NAMES = /\b(google\s+)?(gemini(?:[-\s]?[\d.]+)?(?:[-\s]?(?:flash|pro|vision))?|deepseek(?:[-\s]?\w+)?|anthropic|claude(?:[-\s]?\w+)?|openai|chat\s?gpt|gpt[-\s]?[\d.]+\w*|llama[-\s]?\d*|mistral)\b/gi;

export function hideAiNames<T extends string | undefined | null>(text: T): T {
  if (!text) return text;
  return (text as string).replace(NAMES, 'the AI service') as T;
}
