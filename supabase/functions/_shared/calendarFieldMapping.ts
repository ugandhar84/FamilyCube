// Shared portable-field boundary for PERSONAL-purpose 2-way calendar sync
// (Google + Outlook). Work-purpose connections never use this file at all
// — they only ever call FreeBusy (calendar-freebusy-sync), which returns
// no event content to map in the first place.
//
// This is the ONE place FamilyEvent <-> external-provider-event mapping
// happens, in both directions, for a personal connection — every push/pull
// path imports from here so the boundary can't silently drift.
//
// Portable fields (both directions): title, date, time, endTime, allDay,
// location, notes, category-derived color. FamilyCube-specific fields
// (ride/helper/driver/RSVP/GP-sharing semantics — ~30 columns on
// calendar_events) are NEVER read from an external event on inbound sync,
// and NEVER expected to exist on an external event at all. An event whose
// `type` carries FamilyCube-specific meaning (e.g. a ride-sharing request)
// still gets pushed out, just stripped down to the portable fields only —
// see calendar-sync-push's own comment for the rationale.

export interface PortableEvent {
  id: string;               // calendar_events.id (local)
  title: string;
  date: string;             // 'YYYY-MM-DD', local
  startTime: string | null; // 'HH:MM' 24h, local — null for an all-day event
  endTime: string | null;   // 'HH:MM' 24h, local
  allDay: boolean;
  location: string | null;
  notes: string | null;
  // Present only for a series ANCHOR event — pushed as one native
  // recurring external event (RRULE for Google, structured
  // pattern/range for Outlook) rather than pushing every individually
  // materialized occurrence row as its own event. Plain occurrence rows
  // never reach this mapper at all (they don't call addEvent/dbUpdate, so
  // calendar-sync-push is never invoked for them in the first place).
  recurrenceRule: NonNullable<LocalEventRow['recurrence_rule']> | null;
}

const RRULE_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Builds an RFC 5545 RRULE VALUE (e.g. "FREQ=DAILY;UNTIL=20261231T000000Z")
// from this app's own EventRecurrenceRule shape — both Google and Outlook
// accept standard RRULE syntax, just wrapped slightly differently (see
// portableToGoogleBody/portableToOutlookBody).
export function buildRRule(rule: NonNullable<LocalEventRow['recurrence_rule']>): string {
  const parts = [`FREQ=${rule.frequency.toUpperCase()}`];
  if (rule.frequency === 'weekly' && rule.days?.length) {
    parts.push(`BYDAY=${rule.days.map(d => RRULE_DAY[d]).join(',')}`);
  }
  if (rule.endDate) {
    const [y, m, d] = rule.endDate.split('-').map(Number);
    const until = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
    parts.push(`UNTIL=${until.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
  } else if (rule.occurrences) {
    parts.push(`COUNT=${rule.occurrences}`);
  }
  return parts.join(';');
}

// A local calendar_events row, as selected with `select('*')` — only the
// portable-relevant columns are typed here; everything else on the row is
// ignored by this mapper by design (that's the whole point of the boundary).
export interface LocalEventRow {
  id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean | null;
  location: string | null;
  notes: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  is_series_anchor?: boolean | null;
  recurrence_rule?: { frequency: 'daily' | 'weekly' | 'monthly'; days?: number[]; endDate?: string; occurrences?: number } | null;
}

export function localRowToPortable(row: LocalEventRow): PortableEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    startTime: row.all_day ? null : row.start_time,
    endTime: row.all_day ? null : row.end_time,
    allDay: !!row.all_day,
    location: row.location,
    notes: row.notes,
    recurrenceRule: row.is_series_anchor && row.recurrence_rule ? row.recurrence_rule : null,
  };
}

// Combines a local YYYY-MM-DD date + HH:MM time into a real Date, in the
// given IANA timezone. Falls back to UTC interpretation if timezone is
// omitted (better than throwing — an event still gets pushed, just
// potentially off by the viewer's own UTC offset until timezone is set).
export function toZonedDate(date: string, time: string | null, timezone: string | null): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time ?? '00:00').split(':').map(Number);
  if (!timezone) return new Date(Date.UTC(y, m - 1, d, h, min));
  const approx = new Date(Date.UTC(y, m - 1, d, h, min));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(approx);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const asIfUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const offsetMs = asIfUTC - approx.getTime();
  return new Date(approx.getTime() - offsetMs);
}

// ── Google Calendar event body ──────────────────────────────────────────────

export interface GoogleEventBody {
  summary: string;
  location?: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
}

export function portableToGoogleBody(e: PortableEvent, timezone: string | null): GoogleEventBody {
  const recurrence = e.recurrenceRule ? [`RRULE:${buildRRule(e.recurrenceRule)}`] : undefined;
  if (e.allDay || !e.startTime) {
    const start = e.date;
    const [y, m, d] = e.date.split('-').map(Number);
    const endDate = new Date(Date.UTC(y, m - 1, d + 1));
    const end = endDate.toISOString().slice(0, 10);
    return {
      summary: e.title, location: e.location ?? undefined, description: e.notes ?? undefined,
      start: { date: start }, end: { date: end }, recurrence,
    };
  }
  const startDt = toZonedDate(e.date, e.startTime, timezone);
  const endDt = e.endTime ? toZonedDate(e.date, e.endTime, timezone) : new Date(startDt.getTime() + 60 * 60_000);
  return {
    summary: e.title, location: e.location ?? undefined, description: e.notes ?? undefined,
    start: { dateTime: startDt.toISOString(), timeZone: timezone ?? 'UTC' },
    end: { dateTime: endDt.toISOString(), timeZone: timezone ?? 'UTC' },
    recurrence,
  };
}

// Inbound: Google event body -> the portable fields only, ready to merge
// into a partial patch. Never returns anything beyond PortableEvent's shape.
export function googleBodyToPortablePatch(body: any): Partial<Omit<PortableEvent, 'id'>> {
  const isAllDay = !!body.start?.date && !body.start?.dateTime;
  if (isAllDay) {
    return {
      title: body.summary ?? 'Untitled event',
      date: body.start.date,
      startTime: null, endTime: null, allDay: true,
      location: body.location ?? null, notes: body.description ?? null,
    };
  }
  const start = new Date(body.start.dateTime);
  const end = body.end?.dateTime ? new Date(body.end.dateTime) : null;
  const tz = body.start.timeZone ?? 'UTC';
  const toLocalParts = (dt: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(dt);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
  };
  const startParts = toLocalParts(start);
  return {
    title: body.summary ?? 'Untitled event',
    date: startParts.date,
    startTime: startParts.time,
    endTime: end ? toLocalParts(end).time : null,
    allDay: false,
    location: body.location ?? null, notes: body.description ?? null,
  };
}

// ── Microsoft Graph (Outlook) event body ────────────────────────────────────

export interface OutlookEventBody {
  subject: string;
  location?: { displayName: string };
  body?: { contentType: 'text'; content: string };
  isAllDay: boolean;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: {
    pattern: { type: 'daily' | 'weekly' | 'absoluteMonthly'; interval: number; daysOfWeek?: string[] };
    range: { type: 'endDate' | 'numbered' | 'noEnd'; startDate: string; endDate?: string; numberOfOccurrences?: number };
  };
}

const GRAPH_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function buildOutlookRecurrence(rule: NonNullable<LocalEventRow['recurrence_rule']>, startDate: string): OutlookEventBody['recurrence'] {
  const pattern: OutlookEventBody['recurrence']['pattern'] = {
    type: rule.frequency === 'monthly' ? 'absoluteMonthly' : rule.frequency === 'weekly' ? 'weekly' : 'daily',
    interval: 1,
    ...(rule.frequency === 'weekly' && rule.days?.length ? { daysOfWeek: rule.days.map(d => GRAPH_DAY[d]) } : {}),
  };
  const range: OutlookEventBody['recurrence']['range'] = rule.endDate
    ? { type: 'endDate', startDate, endDate: rule.endDate }
    : rule.occurrences
    ? { type: 'numbered', startDate, numberOfOccurrences: rule.occurrences }
    : { type: 'noEnd', startDate };
  return { pattern, range };
}

export function portableToOutlookBody(e: PortableEvent, timezone: string | null): OutlookEventBody {
  const tz = timezone ?? 'UTC';
  const recurrence = e.recurrenceRule ? buildOutlookRecurrence(e.recurrenceRule, e.date) : undefined;
  if (e.allDay || !e.startTime) {
    const [y, m, d] = e.date.split('-').map(Number);
    const endDate = new Date(Date.UTC(y, m - 1, d + 1));
    return {
      subject: e.title,
      location: e.location ? { displayName: e.location } : undefined,
      body: e.notes ? { contentType: 'text', content: e.notes } : undefined,
      isAllDay: true,
      start: { dateTime: `${e.date}T00:00:00`, timeZone: tz },
      end: { dateTime: `${endDate.toISOString().slice(0, 10)}T00:00:00`, timeZone: tz },
      recurrence,
    };
  }
  const endTime = e.endTime ?? addOneHour(e.startTime);
  return {
    subject: e.title,
    location: e.location ? { displayName: e.location } : undefined,
    body: e.notes ? { contentType: 'text', content: e.notes } : undefined,
    isAllDay: false,
    recurrence,
    start: { dateTime: `${e.date}T${e.startTime}:00`, timeZone: tz },
    end: { dateTime: `${e.date}T${endTime}:00`, timeZone: tz },
  };
}

export function outlookBodyToPortablePatch(body: any): Partial<Omit<PortableEvent, 'id'>> {
  if (body.isAllDay) {
    return {
      title: body.subject ?? 'Untitled event',
      date: String(body.start?.dateTime ?? '').slice(0, 10),
      startTime: null, endTime: null, allDay: true,
      location: body.location?.displayName ?? null,
      notes: body.body?.content ?? null,
    };
  }
  const startStr = String(body.start?.dateTime ?? '');
  const endStr = String(body.end?.dateTime ?? '');
  return {
    title: body.subject ?? 'Untitled event',
    date: startStr.slice(0, 10),
    startTime: startStr.slice(11, 16) || null,
    endTime: endStr.slice(11, 16) || null,
    allDay: false,
    location: body.location?.displayName ?? null,
    notes: body.body?.content ?? null,
  };
}

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
