import { create } from 'zustand';
import { todayLocal, localDateStr, parseLocalDate } from '@/lib/dates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEventStore, type FamilyEvent } from './eventStore';

// 'mon'|'tue'|... (ClassPeriod.days) -> 0=Sun..6=Sat (EventRecurrenceRule.days)
const DAY_NAME_TO_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// ─── Domain types ─────────────────────────────────────────────────────────────

export type LunchPeriod = 'A' | 'B' | 'C' | 'D';
export type Semester    = 'Fall' | 'Spring' | 'Summer' | 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4';
export type DayType     = 'Regular' | 'Block-A' | 'Block-B' | 'Half-Day' | 'No School' | 'Early Release' | 'Late Start';
export type HomeworkStatus = 'todo' | 'in_progress' | 'done' | 'overdue';
export type HomeworkPriority = 'low' | 'medium' | 'high';

export interface ClassPeriod {
  id:         string;
  period:     number;      // 0 = lunch/break, 1–8 = period numbers
  subject:    string;
  room:       string;
  teacher?:   string;
  startTime:  string;      // 'HH:MM' 24h
  endTime:    string;
  isLunch?:   boolean;
  isBreak?:   boolean;
  gradeLevel?: string;     // e.g. '7th Grade', 'AP'
  notes?:     string;
  days?:      string[];    // ['mon','tue','wed','thu','fri'] — which days this period occurs
  term?:      string;      // e.g. 'Q1', 'Q2', 'Fall', 'Spring' — optional term grouping
  // Materialized calendar_events series-anchor id (store/eventStore.ts's
  // addRecurringEvent) — device-local like the rest of this store today
  // (School has no Supabase table yet), so the linked event only exists on
  // whichever device the period was entered on. Skipped entirely for
  // lunch/break rows (isLunch/isBreak) — those aren't "my class," just a
  // schedule marker with nothing meaningful to sync.
  linkedEventId?: string;
}

export interface Homework {
  id:                  string;
  memberId:            string;
  subject:             string;
  title:               string;
  description?:        string;
  dueDate:             string;   // ISO date YYYY-MM-DD
  estimatedMinutes?:   number;
  priority:            HomeworkPriority;
  status:              HomeworkStatus;
  createdAt:           string;
  startedAt?:          string;
  completedAt?:        string;
  periodId?:           string;   // link to the class period for context
  questId?:            string;   // if linked to a homework quest
  attachmentUrls?:     string[];
}

export interface SchoolHoliday {
  id:        string;
  startDate: string;   // 'YYYY-MM-DD'
  endDate:   string;   // 'YYYY-MM-DD', inclusive
  reason:    string;   // e.g. "Winter Break"
}

export interface KidSchedule {
  memberId:    string;
  memberName:  string;
  semester:    Semester;
  year:        number;
  gradeYear?:  string;       // e.g. '7th Grade'
  school?:     string;       // school name
  lunchPeriod: LunchPeriod;
  dayType:     DayType;
  periods:     ClassPeriod[];
  // Date ranges (with a reason) that suppress class-period materialization
  // — e.g. Winter Break, a teacher in-service day. Per-kid, not a shared
  // family-wide list, matching this store's existing per-schedule scope.
  holidays?:   SchoolHoliday[];
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface SchoolState {
  schedules:  KidSchedule[];
  homeworks:  Homework[];
  loaded:     boolean;

  loadFromStorage: () => Promise<void>;

  // Schedule CRUD
  addSchedule:    (schedule: KidSchedule) => void;
  updateSchedule: (memberId: string, updates: Partial<KidSchedule>) => void;
  removeSchedule: (memberId: string) => void;

  // Period CRUD
  addPeriod:      (memberId: string, period: Omit<ClassPeriod, 'id'>) => void;
  updatePeriod:   (memberId: string, periodId: string, updates: Partial<Omit<ClassPeriod, 'id'>>) => void;
  deletePeriod:   (memberId: string, periodId: string) => void;
  reorderPeriods: (memberId: string, periods: ClassPeriod[]) => void;

  // Holiday CRUD — date ranges (with a reason) that suppress class-period
  // materialization. addHoliday clears already-materialized occurrences
  // in the new range; removeHoliday re-materializes what that specific
  // range had cleared (explicit product decision — not just a
  // going-forward no-op).
  addHoliday:    (memberId: string, holiday: Omit<SchoolHoliday, 'id'>) => Promise<void>;
  removeHoliday: (memberId: string, holidayId: string) => Promise<void>;

  // Homework CRUD
  addHomework:    (hw: Omit<Homework, 'id' | 'createdAt' | 'status'>) => Homework;
  updateHomework: (id: string, updates: Partial<Omit<Homework, 'id' | 'createdAt'>>) => void;
  deleteHomework: (id: string) => void;
  markHomeworkDone:   (id: string) => void;
  markHomeworkStarted:(id: string) => void;
  getHomeworkForMember: (memberId: string) => Homework[];
  getOverdueHomework: (memberId: string) => Homework[];
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const today    = todayLocal();
const tomorrow = localDateStr(new Date(Date.now() + 86400_000));

const SEED_SCHEDULES: KidSchedule[] = [
  {
    memberId: 'kid-1', memberName: 'Leo',
    semester: 'Fall', year: 2026, gradeYear: '7th Grade', school: 'Riverside Middle School',
    lunchPeriod: 'B', dayType: 'Regular',
    periods: [
      { id: 'p1', period: 1, subject: 'Math',       room: 'B-204', teacher: 'Mr. Thompson',  startTime: '08:00', endTime: '08:50', gradeLevel: '7th' },
      { id: 'p2', period: 2, subject: 'English',    room: 'A-112', teacher: 'Ms. Rivera',    startTime: '08:55', endTime: '09:45' },
      { id: 'p3', period: 3, subject: 'Science',    room: 'C-301', teacher: 'Dr. Patel',     startTime: '09:50', endTime: '10:40', gradeLevel: 'Advanced' },
      { id: 'p4', period: 0, subject: 'Lunch B',    room: 'Cafeteria',                        startTime: '10:45', endTime: '11:15', isLunch: true },
      { id: 'p5', period: 4, subject: 'History',    room: 'A-108', teacher: 'Mr. Davis',     startTime: '11:20', endTime: '12:10' },
      { id: 'p6', period: 5, subject: 'PE',         room: 'Gym',   teacher: 'Coach Kim',     startTime: '12:15', endTime: '13:05' },
      { id: 'p7', period: 6, subject: 'Spanish',    room: 'B-110', teacher: 'Señora Lopez',  startTime: '13:10', endTime: '14:00' },
      { id: 'p8', period: 7, subject: 'Study Hall', room: 'Library',                          startTime: '14:05', endTime: '14:55' },
    ],
  },
  {
    memberId: 'kid-2', memberName: 'Maya',
    semester: 'Fall', year: 2026, gradeYear: '5th Grade', school: 'Riverside Elementary',
    lunchPeriod: 'A', dayType: 'Regular',
    periods: [
      { id: 'm1', period: 1, subject: 'Art',            room: 'D-101', teacher: 'Ms. Chen',     startTime: '08:00', endTime: '08:50' },
      { id: 'm2', period: 2, subject: 'Math',           room: 'B-206', teacher: 'Ms. Williams', startTime: '08:55', endTime: '09:45' },
      { id: 'm3', period: 0, subject: 'Lunch A',        room: 'Cafeteria',                       startTime: '09:50', endTime: '10:20', isLunch: true },
      { id: 'm4', period: 3, subject: 'Reading',        room: 'A-114', teacher: 'Mr. Johnson',  startTime: '10:25', endTime: '11:15' },
      { id: 'm5', period: 4, subject: 'Science',        room: 'C-302', teacher: 'Dr. Patel',    startTime: '11:20', endTime: '12:10' },
      { id: 'm6', period: 5, subject: 'Music',          room: 'E-201', teacher: 'Mr. Garcia',   startTime: '12:15', endTime: '13:05' },
      { id: 'm7', period: 6, subject: 'Social Studies', room: 'A-110', teacher: 'Ms. Brown',    startTime: '13:10', endTime: '14:00' },
    ],
  },
];

const SEED_HOMEWORKS: Homework[] = [
  {
    id: 'hw1', memberId: 'kid-1', subject: 'Math', title: 'Chapter 4 Problems',
    description: 'Problems 1-20 on page 87', dueDate: today, estimatedMinutes: 30,
    priority: 'high', status: 'todo', createdAt: today, periodId: 'p1',
  },
  {
    id: 'hw2', memberId: 'kid-1', subject: 'Science', title: 'Lab Report Write-Up',
    description: 'Summarize the ecosystem experiment results', dueDate: tomorrow,
    estimatedMinutes: 45, priority: 'medium', status: 'in_progress', createdAt: today,
    startedAt: today, periodId: 'p3',
  },
  {
    id: 'hw3', memberId: 'kid-2', subject: 'Reading', title: 'Read Ch. 5-7',
    dueDate: today, estimatedMinutes: 20, priority: 'medium', status: 'todo', createdAt: today, periodId: 'm4',
  },
];

// ─── Persistence ──────────────────────────────────────────────────────────────

const SCHED_KEY = '@familycube_school_schedules_v2';
const HW_KEY    = '@familycube_school_homeworks_v2';

const save = (schedules: KidSchedule[], homeworks: Homework[]) => {
  AsyncStorage.setItem(SCHED_KEY, JSON.stringify(schedules));
  AsyncStorage.setItem(HW_KEY,    JSON.stringify(homeworks));
};

// ─── Subject color palette ────────────────────────────────────────────────────

const SUBJECT_COLORS: Record<string, string> = {
  Math:             '#6366F1',
  English:          '#3B82F6',
  Science:          '#10B981',
  History:          '#F59E0B',
  PE:               '#EF4444',
  Spanish:          '#EC4899',
  French:           '#F43F5E',
  German:           '#E879F9',
  Art:              '#8B5CF6',
  Music:            '#F97316',
  Reading:          '#14B8A6',
  'Social Studies': '#84CC16',
  'Study Hall':     '#94A3B8',
  Technology:       '#0EA5E9',
  Drama:            '#A855F7',
  'Lunch A':        '#F59E0B',
  'Lunch B':        '#F59E0B',
  'Lunch C':        '#F59E0B',
  'Lunch D':        '#F59E0B',
};

export function subjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? '#6366F1';
}

// Materializes a class period as a weekly-recurring calendar_events series
// (store/eventStore.ts's addRecurringEvent) — same "funnel every syncable
// domain through calendar_events" pattern Chores/Meals got, so a class
// period rides the existing 2-way calendar sync engine for free. Lunch/
// break periods are skipped (isLunch/isBreak) — a schedule marker, not a
// real class, nothing meaningful to put on an external calendar. Returns
// the new series anchor id, or undefined if this period shouldn't
// materialize (lunch/break, or no real days set).
async function materializePeriodEvent(memberId: string, period: Omit<ClassPeriod, 'id'> & { id: string }, holidays?: SchoolHoliday[]): Promise<string | undefined> {
  if (period.isLunch || period.isBreak) return undefined;
  const days = (period.days ?? []).map(d => DAY_NAME_TO_INDEX[d.toLowerCase()]).filter(d => d !== undefined);
  if (!days.length) return undefined;
  // Holiday ranges (Winter Break, a teacher in-service day, ...) suppress
  // materialization for any date inside them — honored by BOTH this
  // initial batch and every later window-extension, since both funnel
  // through generateOccurrenceDates (eventStore.ts).
  const excludeRanges = holidays?.length
    ? holidays.map(h => ({ start: h.startDate, end: h.endDate }))
    : undefined;
  return useEventStore.getState().addRecurringEvent(
    {
      title: period.subject,
      date: todayLocal(),
      time: period.startTime,
      endTime: period.endTime,
      memberId,
      type: 'reminder',
      category: 'School',
      location: period.room || undefined,
      notes: period.teacher ? `Teacher: ${period.teacher}` : undefined,
    },
    { frequency: 'weekly', days, excludeRanges },
  );
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSchoolStore = create<SchoolState>((set, get) => ({
  schedules: SEED_SCHEDULES,
  homeworks: SEED_HOMEWORKS,
  loaded:    false,

  loadFromStorage: async () => {
    try {
      const [sRaw, hwRaw] = await Promise.all([
        AsyncStorage.getItem(SCHED_KEY),
        AsyncStorage.getItem(HW_KEY),
      ]);
      const schedules = sRaw  ? (JSON.parse(sRaw)  as KidSchedule[]) : SEED_SCHEDULES;
      const homeworks = hwRaw ? (JSON.parse(hwRaw) as Homework[])    : SEED_HOMEWORKS;
      if (!sRaw)  AsyncStorage.setItem(SCHED_KEY, JSON.stringify(SEED_SCHEDULES));
      if (!hwRaw) AsyncStorage.setItem(HW_KEY,    JSON.stringify(SEED_HOMEWORKS));
      set({ schedules, homeworks, loaded: true });
    } catch {
      set({ schedules: SEED_SCHEDULES, homeworks: SEED_HOMEWORKS, loaded: true });
    }
  },

  // ─── Schedule CRUD ──────────────────────────────────────────────────────────

  addSchedule: (schedule) => {
    const next = [...get().schedules.filter(s => s.memberId !== schedule.memberId), schedule];
    set({ schedules: next }); save(next, get().homeworks);
  },

  updateSchedule: (memberId, updates) => {
    const next = get().schedules.map(s => s.memberId === memberId ? { ...s, ...updates } : s);
    set({ schedules: next }); save(next, get().homeworks);
  },

  // Logged QA gap, fixed: this previously only ever dropped the member's
  // schedule, never their homework rows (memberId-keyed, same table) —
  // familyStore.removeMember() didn't call this at all until this fix, so
  // both were left dangling in AsyncStorage forever, the same
  // orphaned-on-member-removal class of bug already fixed elsewhere this
  // session for chores/events/locations, just local-storage-scoped here.
  removeSchedule: (memberId) => {
    const nextSchedules = get().schedules.filter(s => s.memberId !== memberId);
    const nextHomeworks = get().homeworks.filter(h => h.memberId !== memberId);
    set({ schedules: nextSchedules, homeworks: nextHomeworks });
    save(nextSchedules, nextHomeworks);
  },

  // ─── Period CRUD ────────────────────────────────────────────────────────────

  addPeriod: async (memberId, period) => {
    const holidays = get().schedules.find(s => s.memberId === memberId)?.holidays;
    const linkedEventId = await materializePeriodEvent(memberId, { ...period, id: '' }, holidays);
    const withLink = linkedEventId ? { ...period, linkedEventId } : period;
    const next = get().schedules.map(s =>
      s.memberId !== memberId ? s : {
        ...s,
        periods: [...s.periods, { ...withLink, id: 'p' + Date.now() }]
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }
    );
    set({ schedules: next }); save(next, get().homeworks);
  },

  updatePeriod: async (memberId, periodId, updates) => {
    // Re-materialization is an async side effect (deletes the old linked
    // event, awaits the new one's server-confirmed id) — resolved BEFORE
    // the synchronous schedule map below, since a plain .map() callback
    // can't itself be awaited mid-array.
    const schedule = get().schedules.find(s => s.memberId === memberId);
    const existingPeriod = schedule?.periods.find(p => p.id === periodId);
    let materializedLinkedEventId: string | undefined;
    if (existingPeriod) {
      const merged = { ...existingPeriod, ...updates };
      // Only re-materialize when a field the calendar event actually
      // cares about changed — avoids a needless delete+recreate churn
      // on every unrelated edit (e.g. just the room number).
      const relevantChanged = ['subject', 'startTime', 'endTime', 'days', 'isLunch', 'isBreak'].some(k => k in updates);
      if (relevantChanged) {
        // Whole-SERIES delete, not deleteEvent(linkedEventId) (anchor-only
        // — logged bug, fixed here: that left every other occurrence in
        // the series orphaned, still live with a seriesId pointing at a
        // now-deleted anchor, since materializePeriodEvent's
        // addRecurringEvent writes one real row per weekly occurrence,
        // not a single expandable row).
        if (existingPeriod.linkedEventId) {
          await useEventStore.getState().deleteEventScoped(existingPeriod.linkedEventId, 'all');
        }
        materializedLinkedEventId = await materializePeriodEvent(memberId, merged, schedule?.holidays);
      }
    }
    const next = get().schedules.map(s => {
      if (s.memberId !== memberId) return s;
      return {
        ...s, periods: s.periods.map(p => {
          if (p.id !== periodId) return p;
          const merged = { ...p, ...updates };
          const relevantChanged = ['subject', 'startTime', 'endTime', 'days', 'isLunch', 'isBreak'].some(k => k in updates);
          if (relevantChanged) {
            return { ...merged, linkedEventId: materializedLinkedEventId };
          }
          return merged;
        }),
      };
    });
    set({ schedules: next }); save(next, get().homeworks);
  },

  deletePeriod: (memberId, periodId) => {
    const target = get().schedules.find(s => s.memberId === memberId)?.periods.find(p => p.id === periodId);
    // Whole-SERIES delete, not the old anchor-only deleteEvent — same
    // orphaned-occurrences fix as updatePeriod above. Fire-and-forget
    // (matches this action's existing sync signature/callers), not
    // awaited — the local schedule removal below doesn't depend on it.
    if (target?.linkedEventId) useEventStore.getState().deleteEventScoped(target.linkedEventId, 'all');
    const next = get().schedules.map(s =>
      s.memberId !== memberId ? s : { ...s, periods: s.periods.filter(p => p.id !== periodId) }
    );
    set({ schedules: next }); save(next, get().homeworks);
  },

  reorderPeriods: (memberId, periods) => {
    const next = get().schedules.map(s => s.memberId === memberId ? { ...s, periods } : s);
    set({ schedules: next }); save(next, get().homeworks);
  },

  // ─── Holiday CRUD ───────────────────────────────────────────────────────────

  addHoliday: async (memberId, holiday) => {
    const schedule = get().schedules.find(s => s.memberId === memberId);
    if (!schedule) return;
    const newHoliday: SchoolHoliday = { ...holiday, id: 'h' + Date.now() };
    const nextHolidays = [...(schedule.holidays ?? []), newHoliday];
    const next = get().schedules.map(s => s.memberId === memberId ? { ...s, holidays: nextHolidays } : s);
    set({ schedules: next }); save(next, get().homeworks);

    // Retroactively clear already-materialized occurrences in the new
    // range, for every real (non-lunch/break) period on this schedule —
    // future materialization is already covered going forward since
    // materializePeriodEvent now reads schedule.holidays on every
    // add/update, but this range's PAST inserts (already sitting in
    // calendar_events from before the holiday existed) need their own
    // sweep.
    const eventStore = useEventStore.getState();
    await Promise.all(
      schedule.periods
        .filter(p => p.linkedEventId)
        .map(p => eventStore.deleteSeriesOccurrencesInRange(p.linkedEventId!, newHoliday.startDate, newHoliday.endDate))
    );
  },

  removeHoliday: async (memberId, holidayId) => {
    const schedule = get().schedules.find(s => s.memberId === memberId);
    const removed = schedule?.holidays?.find(h => h.id === holidayId);
    if (!schedule || !removed) return;
    const nextHolidays = (schedule.holidays ?? []).filter(h => h.id !== holidayId);
    const next = get().schedules.map(s => s.memberId === memberId ? { ...s, holidays: nextHolidays } : s);
    set({ schedules: next }); save(next, get().homeworks);

    // Re-materialize whatever THIS SPECIFIC range had cleared — explicit
    // product decision (removing a holiday restores the class periods it
    // suppressed, not just a going-forward no-op). Deliberately NOT a
    // fresh materializePeriodEvent() call per period — that always
    // creates a brand-new anchor/series via addRecurringEvent, which
    // would duplicate the OTHER, still-live occurrences in the existing
    // series rather than just filling the gap. Instead, insert one plain
    // occurrence row per matching weekday-in-range, tagged onto the
    // EXISTING series (seriesId = the period's own linkedEventId,
    // isSeriesAnchor: false) — a targeted backfill, not a new series.
    const eventStore = useEventStore.getState();
    const inserts: Promise<unknown>[] = [];
    for (const period of schedule.periods) {
      if (period.isLunch || period.isBreak || !period.linkedEventId || !period.days?.length) continue;
      const days = period.days.map(d => DAY_NAME_TO_INDEX[d.toLowerCase()]).filter(d => d !== undefined);
      if (!days.length) continue;
      // Skip any date that already has a LIVE occurrence in this series —
      // a failed delete (addHoliday's own retroactive clear can partially
      // fail) or an overlapping holiday range restored separately would
      // otherwise get a duplicate row inserted on top of it.
      const alreadyLive = await eventStore.getLiveSeriesDatesInRange(period.linkedEventId, removed.startDate, removed.endDate);
      // Y/M/D component stepping, not epoch-ms + 86400_000 — the latter
      // is DST-unsafe (confirmed via direct execution against the actual
      // Nov 2026 US fall-back transition: adding 24h in ms to a local-
      // midnight Date can fail to advance the calendar date across that
      // boundary, silently double-processing one date). Mirrors
      // eventStore.ts's own offsetDate() helper, which steps via
      // `new Date(y, m-1, d+days)` for exactly this reason.
      let cursor = removed.startDate;
      while (cursor <= removed.endDate) {
        const thisDate = cursor;
        const cursorDate = parseLocalDate(thisDate);
        const dow = cursorDate.getDay();
        const [y, m, d] = thisDate.split('-').map(Number);
        cursor = localDateStr(new Date(y, m - 1, d + 1));
        if (!days.includes(dow) || alreadyLive.has(thisDate)) continue;
        inserts.push(eventStore.addEvent({
          title: period.subject,
          date: thisDate,
          time: period.startTime,
          endTime: period.endTime,
          memberId,
          type: 'reminder',
          category: 'School',
          location: period.room || undefined,
          notes: period.teacher ? `Teacher: ${period.teacher}` : undefined,
          seriesId: period.linkedEventId,
          isSeriesAnchor: false,
        } as Omit<FamilyEvent, 'id'>));
      }
    }
    await Promise.all(inserts);
  },

  // ─── Homework CRUD ──────────────────────────────────────────────────────────

  addHomework: (hw) => {
    const homework: Homework = {
      ...hw, id: 'hw' + Date.now(), createdAt: new Date().toISOString(), status: 'todo',
    };
    const next = [...get().homeworks, homework];
    set({ homeworks: next }); save(get().schedules, next);
    return homework;
  },

  updateHomework: (id, updates) => {
    const next = get().homeworks.map(h => h.id === id ? { ...h, ...updates } : h);
    set({ homeworks: next }); save(get().schedules, next);
  },

  deleteHomework: (id) => {
    const next = get().homeworks.filter(h => h.id !== id);
    set({ homeworks: next }); save(get().schedules, next);
  },

  markHomeworkDone: (id) => {
    const now = new Date().toISOString();
    const next = get().homeworks.map(h =>
      h.id === id ? { ...h, status: 'done' as HomeworkStatus, completedAt: now } : h
    );
    set({ homeworks: next }); save(get().schedules, next);
  },

  markHomeworkStarted: (id) => {
    const now = new Date().toISOString();
    const next = get().homeworks.map(h =>
      h.id === id ? { ...h, status: 'in_progress' as HomeworkStatus, startedAt: now } : h
    );
    set({ homeworks: next }); save(get().schedules, next);
  },

  getHomeworkForMember: (memberId) => get().homeworks.filter(h => h.memberId === memberId),

  getOverdueHomework: (memberId) => {
    const today    = todayLocal();
    return get().homeworks.filter(h =>
      h.memberId === memberId && h.status !== 'done' && h.dueDate < today
    );
  },
}));
