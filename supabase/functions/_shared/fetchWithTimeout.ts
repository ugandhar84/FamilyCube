/**
 * Wraps fetch with an AbortController timeout.
 * Throws a named TimeoutError when the deadline is exceeded so callers
 * can distinguish a slow provider from a hard API error.
 *
 * Recommended timeouts:
 *   VISION_TIMEOUT_MS  (55 s) — image-in-prompt calls (receipt, mood, health records)
 *   TEXT_TIMEOUT_MS    (50 s) — text-only AI calls (vet-chat, symptom-scan, voice, tips)
 *   NOTIFY_TIMEOUT_MS  (10 s) — push / webhook calls that should be instant
 */
export const VISION_TIMEOUT_MS = 55_000;
export const TEXT_TIMEOUT_MS   = 50_000;
export const NOTIFY_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Request to ${new URL(url).hostname} timed out after ${ms / 1000}s`);
    this.name = 'TimeoutError';
  }
}

export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal })
    .catch(err => {
      if (err?.name === 'AbortError') throw new TimeoutError(url, ms);
      throw err;
    })
    .finally(() => clearTimeout(timer));
}
