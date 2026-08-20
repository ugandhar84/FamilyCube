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
 * Parse a date-only string ("YYYY-MM-DD", e.g. a Postgres `date` column like
 * quest/chore due_date) as LOCAL midnight. `new Date("YYYY-MM-DD")` parses it
 * as UTC midnight instead — for anyone west of UTC that instant already fell
 * on the previous local evening, so a quest due "today" reads as overdue
 * since last night, and re-opening it in an edit form shows yesterday's date.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
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

/**
 * True if a DB timestamp falls within the last rolling 24 hours (not
 * "same calendar day") — used for cheer/kudos-style feeds that should stay
 * up exactly one day regardless of what time they happened. A calendar-day
 * check (`ts.slice(0,10) === todayLocal()`) gives wildly inconsistent
 * actual durations: something from 11:58pm survives 2 minutes past
 * midnight, while something from 12:01am survives nearly 24h.
 */
export function withinLast24h(ts: string | null | undefined): boolean {
  if (!ts) return false;
  const d = parseDbTime(ts);
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
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

// ── App-wide display format constants ─────────────────────────────────────────
//
// All user-facing dates use "Jan 1, 2026" and times use 12-hour AM/PM.
// Internal storage stays YYYY-MM-DD and HH:MM (24h) for DB compatibility.

/**
 * Format a YYYY-MM-DD string for display: "Jan 1, 2026".
 * Safe for local date strings (no UTC-shift risk since there's no time component).
 */
export function fmtDate(dateStr: string | null | undefined, fallback = '—'): string {
  if (!dateStr) return fallback;
  // Parse as local midnight by splitting components (avoids UTC-shift)
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return fallback;
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a YYYY-MM-DD string for compact display without year: "Jan 1".
 */
export function fmtDateShort(dateStr: string | null | undefined, fallback = '—'): string {
  if (!dateStr) return fallback;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return fallback;
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a 24h "HH:MM" time string for display: "3:30 PM".
 * Returns fallback for missing/invalid values.
 */
export function fmtTime(timeStr: string | null | undefined, fallback = '—'): string {
  if (!timeStr) return fallback;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return fallback;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Format a 24h "HH:MM" time string as separate parts for layouts that
 * render the time and AM/PM label at different sizes.
 * Returns { time: "3:30", ampm: "PM" }.
 */
export function fmtTimeParts(timeStr: string | null | undefined): { time: string; ampm: string } {
  if (!timeStr) return { time: '--', ampm: '' };
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return { time: '--', ampm: '' };
  return {
    time: `${h % 12 || 12}:${String(m).padStart(2, '0')}`,
    ampm: h >= 12 ? 'PM' : 'AM',
  };
}

/**
 * Parse a "HH:MM" display string entered as "3:30 PM" or "15:30" → "15:30" (24h) for storage.
 * Returns null for unparseable input.
 */
export function parseTimeInput(raw: string): string | null {
  const clean = raw.trim().toUpperCase();
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const min = ampmMatch[2];
    if (ampmMatch[3] === 'PM' && h !== 12) h += 12;
    if (ampmMatch[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  const plain = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) {
    const h = parseInt(plain[1], 10);
    const min = plain[2];
    if (h < 0 || h > 23) return null;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  return null;
}

/**
 * Format a full timestamp for display: "Apr 25, 2026, 2:30 PM".
 * Use for records — submitted/approved/created/cancelled/accepted timestamps,
 * history rows, activity logs — not for compact scheduling chips, calendar
 * day headers, or countdowns (use fmtDate/fmtDateShort/fmtTime there).
 */
export function fmtDateTime(ts: string | null | undefined, tz?: string | null, fallback = '—'): string {
  if (!ts) return fallback;
  const out = formatInTz(ts, tz, { dateStyle: 'medium', timeStyle: 'short' });
  return out || fallback;
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
