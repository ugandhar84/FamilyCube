/**
 * spokenVerdict — a spoken "yes" or "no" to a draft Ask Cube just showed. Deterministic on purpose (no AI): only a SHORT message that
 * is nothing but a confirmation or a refusal counts, so "yes, and move it to 5" still goes to the assistant as a normal request.
 */
const YES = new Set([
  'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'confirm', 'confirmed', 'do it', 'go ahead', 'go for it', 'looks good',
  'thats right', 'that is right', 'correct', 'send it', 'add it', 'save it', 'please do', 'yes please', 'sounds good', 'perfect',
  'yes do it', 'yes confirm', 'yes go ahead', 'sure do it', 'ok do it', 'okay do it', 'confirm it', 'make it so', 'absolutely', 'definitely',
]);
const NO = new Set([
  'no', 'nope', 'cancel', 'cancel it', 'discard', 'discard it', 'never mind', 'nevermind', 'forget it', 'dont', 'do not', 'stop',
  'no thanks', 'no thank you', 'not now', 'no dont', 'no cancel', 'scratch that',
]);

export function spokenVerdict(text: string): 'yes' | 'no' | null {
  const t = text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 4) return null;
  if (YES.has(t)) return 'yes';
  if (NO.has(t)) return 'no';
  return null;
}
