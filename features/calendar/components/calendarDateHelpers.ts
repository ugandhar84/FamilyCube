// Shared date/format helpers used by CalendarScreen.tsx and its extracted
// view-mode components (MonthGridView/WeekView/AgendaView/DaySlotView) —
// kept in one place so both sides stay in sync instead of drifting.
export function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
}

// Whether an event's date/time has already passed — drives the dimmed
// treatment for completed/past events across every view (Day, Agenda, etc).
export function isEventPast(date: string, time?: string | null): boolean {
  const today = toDateStr(new Date());
  if (date < today) return true;
  if (date > today) return false;
  if (!time) return false;
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
}

// Whether an event is happening right now — start time has arrived but its
// end (or, when no endTime is set, a 10-minute default window) hasn't.
// Drives the "live now" glow treatment on event cards.
export function isEventNow(date: string, time?: string | null, endTime?: string | null): boolean {
  if (!time) return false;
  const today = toDateStr(new Date());
  if (date !== today) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = time.split(':').map(Number);
  const startMin = sh * 60 + (sm || 0);
  let endMin: number;
  if (endTime) {
    const [eh, em] = endTime.split(':').map(Number);
    endMin = eh * 60 + (em || 0);
  } else {
    endMin = startMin + 10;
  }
  return nowMin >= startMin && nowMin < endMin;
}
// Mon-first ordering
export const DAY_SHORT = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

// Category → dot color map (used only in strips — no full event objects needed)
export const CAT_DOT: Record<string, string> = {
  Medical:  '#EF4444',
  Work:     '#A855F7',
  Sports:   '#F59E0B',
  Study:    '#3B82F6',
  Ride:     '#10B981',
  Event:    '#10B981',
  Birthday: '#F59E0B',
  Holiday:  '#F59E0B',
};

// ─── Month grid — Apple Calendar style ─────────────────────────────────────
export const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function buildMonthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Mon-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: string[] = [];
  for (let i = 0; i < startOffset; i++) cells.push('');
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateStr(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push('');
  return cells;
}

// Shared by DaySlotView (hour-slot placement) — parses "HH:MM" into
// minutes-since-midnight.
export function timeToMinutes(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}
