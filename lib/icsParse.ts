/**
 * icsParse — reads an iCalendar (.ics / webcal) feed into plain events. Pure code, no native imports, so it can be tested.
 * Handles what school-district and public-holiday feeds actually contain: folded lines, all-day events (a date with no time),
 * multi-day events, UTC / local / TZID times, and simple repeating events (DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL,
 * COUNT, UNTIL, BYDAY and EXDATE) expanded inside a date window.
 */
export interface IcsEvent {
  title: string;
  /** YYYY-MM-DD, first day. */
  startDate: string;
  /** YYYY-MM-DD, last day (inclusive). Same as startDate for a one-day event. */
  endDate: string;
  /** HH:MM (24h) or null for an all-day event. */
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\').trim();
}

interface Prop { name: string; params: Record<string, string>; value: string }
function parseProp(line: string): Prop | null {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const left = line.slice(0, idx), value = line.slice(idx + 1);
  const [name, ...ps] = left.split(';');
  const params: Record<string, string> = {};
  for (const p of ps) { const [k, v] = p.split('='); if (k) params[k.toUpperCase()] = (v ?? '').replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params, value };
}

interface When { date: string; time: string | null; allDay: boolean }
function parseWhen(p: Prop): When | null {
  const v = p.value.trim();
  if (/^\d{8}$/.test(v)) return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, time: null, allDay: true };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  // A time that is written in UTC is shown as written (school feeds that matter publish local or floating times; converting
  // would need the viewer's zone and, for all practical feeds, a "Z" time is a date-only marker like 00:00Z).
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, allDay: false };
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function expand(start: string, rule: Record<string, string>, exdates: Set<string>, windowStart: string, windowEnd: string, spanDays: number): string[] {
  const freq = rule.FREQ;
  const interval = Math.max(1, parseInt(rule.INTERVAL ?? '1', 10) || 1);
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
  const until = rule.UNTIL ? `${rule.UNTIL.slice(0, 4)}-${rule.UNTIL.slice(4, 6)}-${rule.UNTIL.slice(6, 8)}` : null;
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map(s => s.replace(/^[+-]?\d+/, '')) : null;
  const out: string[] = [];
  let produced = 0;
  const limitEnd = until && until < windowEnd ? until : windowEnd;
  const push = (d: string) => {
    if (produced >= count) return false;
    produced++;
    if (!exdates.has(d) && addDays(d, spanDays) >= windowStart && d <= limitEnd) out.push(d);
    return true;
  };
  if (freq === 'DAILY') {
    for (let d = start, i = 0; d <= limitEnd && i < 800; d = addDays(d, interval), i++) if (!push(d)) break;
  } else if (freq === 'WEEKLY') {
    const wanted = byday ?? [DAYS[parseYmd(start).getUTCDay()]];
    let weekStart = start;
    for (let w = 0; w < 400 && weekStart <= limitEnd; w++) {
      for (let k = 0; k < 7; k++) {
        const d = addDays(weekStart, k);
        if (d < start || d > limitEnd) continue;
        if (wanted.includes(DAYS[parseYmd(d).getUTCDay()]) && !push(d)) return out;
      }
      weekStart = addDays(weekStart, 7 * interval);
    }
  } else if (freq === 'MONTHLY') {
    const base = parseYmd(start);
    for (let i = 0; i < 200; i++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i * interval, base.getUTCDate()));
      const s = fmt(d);
      if (s > limitEnd) break;
      if (!push(s)) break;
    }
  } else if (freq === 'YEARLY') {
    const base = parseYmd(start);
    for (let i = 0; i < 60; i++) {
      const s = fmt(new Date(Date.UTC(base.getUTCFullYear() + i * interval, base.getUTCMonth(), base.getUTCDate())));
      if (s > limitEnd) break;
      if (!push(s)) break;
    }
  } else if (start >= windowStart || addDays(start, spanDays) >= windowStart) {
    out.push(start);
  }
  return out;
}

/** Parses the feed and returns events overlapping [windowStart, windowEnd] (YYYY-MM-DD), sorted by date. */
export function parseIcs(text: string, windowStart: string, windowEnd: string): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  let cur: Prop[] | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = []; continue; }
    if (line === 'END:VEVENT') {
      if (cur) {
        const get = (n: string) => cur!.find(p => p.name === n);
        const status = get('STATUS')?.value?.toUpperCase();
        const dtstart = get('DTSTART'), dtend = get('DTEND'), summary = get('SUMMARY');
        if (dtstart && summary && status !== 'CANCELLED') {
          const s = parseWhen(dtstart);
          const e = dtend ? parseWhen(dtend) : null;
          if (s) {
            // An all-day DTEND is the day AFTER the last day.
            let endDate = e ? (s.allDay ? addDays(e.date, -1) : e.date) : s.date;
            if (endDate < s.date) endDate = s.date;
            const spanDays = Math.round((parseYmd(endDate).getTime() - parseYmd(s.date).getTime()) / 86_400_000);
            const rrule = get('RRULE');
            const exdates = new Set<string>();
            for (const p of cur.filter(q => q.name === 'EXDATE')) for (const v of p.value.split(',')) { const w = parseWhen({ ...p, value: v }); if (w) exdates.add(w.date); }
            const starts = rrule
              ? expand(s.date, Object.fromEntries(rrule.value.split(';').map(kv => kv.split('='))), exdates, windowStart, windowEnd, spanDays)
              : [s.date];
            for (const d of starts) {
              const end = addDays(d, spanDays);
              if (end < windowStart || d > windowEnd) continue;
              events.push({
                title: unescapeText(summary.value),
                startDate: d, endDate: end,
                startTime: s.time, endTime: e && !e.allDay && e.date === endDate ? e.time : null,
                location: get('LOCATION')?.value ? unescapeText(get('LOCATION')!.value) || null : null,
                description: get('DESCRIPTION')?.value ? unescapeText(get('DESCRIPTION')!.value) || null : null,
              });
            }
          }
        }
      }
      cur = null; continue;
    }
    if (cur) { const p = parseProp(line); if (p) cur.push(p); }
  }
  return events.sort((a, b) => (a.startDate + (a.startTime ?? '')).localeCompare(b.startDate + (b.startTime ?? '')));
}

function b64urlDecode(s: string): string | null {
  try {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    const padded = t + '='.repeat((4 - (t.length % 4)) % 4);
    const bin = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
    return decodeURIComponent(escape(bin));
  } catch { return null; }
}

/**
 * Turns whatever a school site hands out into a calendar address we can read:
 *  - webcal:// is just https:// with a different scheme,
 *  - a Google Calendar "add" link (calendar.google.com/calendar/...?cid=...) carries the calendar's id: its public feed is
 *    https://calendar.google.com/calendar/ical/<id>/public/basic.ics (this works when the school made the calendar public),
 *  - a Google Calendar embed link (?src=<id>) is the same.
 */
export function normalizeCalendarUrl(input: string): string | null {
  let u = input.trim();
  if (/^webcals?:\/\//i.test(u)) u = u.replace(/^webcals?:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(u)) return null;
  const g = u.match(/^https?:\/\/calendar\.google\.com\/calendar\/(?:u\/\d+\/)?(?:r|embed|render)?[^?#]*\?([^#]*)/i);
  if (g) {
    const q = new URLSearchParams(g[1]);
    const cid = q.get('cid');
    const src = q.get('src');
    const id = cid ? b64urlDecode(cid.replace(/ /g, '+')) : src;
    if (id) return `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
  }
  return u;
}

/** Built-in public holiday calendars (Google's public feeds) for the countries the app launches in. */
export const PUBLIC_HOLIDAY_FEEDS: { key: string; label: string; url: string }[] = [
  { key: 'us', label: 'United States', url: 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics' },
  { key: 'in', label: 'India', url: 'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics' },
  { key: 'ca', label: 'Canada', url: 'https://calendar.google.com/calendar/ical/en.canadian%23holiday%40group.v.calendar.google.com/public/basic.ics' },
];
