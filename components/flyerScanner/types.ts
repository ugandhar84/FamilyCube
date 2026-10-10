/**
 * Shared types for the flyer-scanner full-page step screens. Extracted
 * verbatim from the original components/FlyerScannerModal.tsx (was a
 * single-file AppBottomSheet flow) — behavior/shape unchanged, only moved
 * so each step can import just what it needs.
 */

export interface CapturedImage {
  uri:      string;
  base64:   string;
  mimeType: string;
}

export interface ExtractedEvent {
  title:          string;
  category:       string;
  date:           string | null;
  time:           string | null;
  end_time:       string | null;
  location:       string | null;
  organizer:      string | null;
  description:    string | null;
  rsvp_deadline:  string | null;
  cost:           number | null;
  notes:          string | null;
  recurring:      boolean;
  recurrence_desc:string | null;
}

export interface ExtractedPeriod {
  periodName: string;
  subject:    string;
  teacher:    string | null;
  room:       string | null;
  startTime:  string | null;
  endTime:    string | null;
  days:       string[];
  term?:      string | null;
  isLunch?:   boolean;
}

export interface ExtractedTimetable {
  student: string | null;
  school:  string | null;
  grade:   string | null;
  periods: ExtractedPeriod[];
}

export interface ExtractedCalendar {
  school:  string | null;
  events:  ExtractedEvent[];
}

export type FlyerResult =
  | { type: 'event';     event: ExtractedEvent }
  | { type: 'timetable'; timetable: ExtractedTimetable }
  | { type: 'calendar';  calendar: ExtractedCalendar };

export type Step = 'capture' | 'processing' | 'review' | 'timetable' | 'multi';

// Same category vocabulary the rest of the app uses (features/calendar/components/eventForm/types.ts's
// CATEGORIES) — a scanned flyer's category must be one of these or the calendar_events_category_fk
// foreign key rejects the insert.
export const CATEGORIES = ['Medical', 'Sports', 'Study', 'Ride', 'Event', 'Birthday', 'Errand', 'Other'];
export const CAT_EMOJI: Record<string, string> = {
  Medical: '🏥', Sports: '🏅', Study: '📚', Ride: '🚗', Event: '🎉', Birthday: '🎂', Errand: '🛒', Other: '✨',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtDateDisplay(d: string | null) {
  if (!d) return 'Not set';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtTime12(t: string | null) {
  if (!t) return 'Not set';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function parseDateToObj(d: string | null): Date {
  if (!d) return new Date();
  return new Date(d + 'T00:00:00');
}
export function parseTimeToObj(t: string | null): Date {
  const d = new Date();
  if (!t) return d;
  const [h, m] = t.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}
export function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function dateToTimeStr(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
