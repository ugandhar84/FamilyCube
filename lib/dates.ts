// Date helpers that respect the user's LOCAL timezone.
//
// IMPORTANT: `new Date().toISOString().slice(0, 10)` returns the UTC date, which
// is wrong for anyone west of UTC in the evening (e.g. a mood logged at 8pm on
// Jul 1 in America/Chicago becomes "Jul 2" in UTC). Always use these helpers for
// any date that represents "the day this happened" from the user's perspective —
// journal entries, mood logs, feeding logs, checklists, daily quotas, streaks.

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's local calendar date as YYYY-MM-DD. */
export function todayLocal(): string {
  return localDateStr(new Date());
}

/**
 * Parse a DB timestamp safely. Postgres may return "2026-07-01T20:15:00" or
 * "2026-07-01 20:15:00" with NO timezone suffix — JS then parses that as LOCAL
 * time even though the stored value is UTC, shifting evening entries to the
 * next day. Treat suffix-less timestamps as UTC.
 */
export function parseDbTime(ts: string): Date {
  if (!ts) return new Date(NaN);
  const normalized = ts.replace(' ', 'T');
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized);
  return new Date(hasZone ? normalized : `${normalized}Z`);
}

/** format() wrapper that returns `fallback` for null/undefined/NaN dates instead of throwing. */
export function safeFmt(ts: string | null | undefined, fmt: string, fallback = '—'): string {
  if (!ts) return fallback;
  const d = parseDbTime(ts);
  if (isNaN(d.getTime())) return fallback;
  try {
    const { format } = require('date-fns');
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

/**
 * Format a UTC DB timestamp for display in the given IANA timezone.
 * Falls back to the device's local timezone when tz is null/undefined/invalid.
 *
 * Examples:
 *   formatInTz('2026-07-01T20:00:00Z', 'America/New_York', { hour: '2-digit', minute: '2-digit' })
 *   → "4:00 PM"
 *
 *   formatInTz('2026-07-01T20:00:00Z', null, { dateStyle: 'medium', timeStyle: 'short' })
 *   → "Jul 1, 2026, 8:00 PM"  (device local time)
 */
export function formatInTz(
  ts: string | Date,
  tz: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = typeof ts === 'string' ? parseDbTime(ts) : ts;
  if (isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).format(date);
  } catch {
    // Invalid timezone string — fall back to device local
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}
