/**
 * Shared "what class is happening right now / next today" logic for a
 * KidSchedule, used by both the Hub's SchoolTodaySection and kiosk
 * Overview's equivalent widget so the two never silently disagree on
 * what counts as "happening now".
 */
import type { ClassPeriod, KidSchedule } from '@/store/schoolStore';

const DAY_NAME_TO_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_INDEX_TO_NAME = Object.fromEntries(Object.entries(DAY_NAME_TO_INDEX).map(([k, v]) => [v, k]));

export interface TodayPeriodStatus {
  period: ClassPeriod;
  isNow: boolean;
}

/** Periods in `schedule` scheduled for today, sorted by start time. */
function periodsToday(schedule: KidSchedule, todayName: string): ClassPeriod[] {
  return schedule.periods
    .filter(p => !p.isLunch && !p.isBreak && p.days?.includes(todayName))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * Returns the class currently in session for this schedule right now, or
 * the next upcoming one today, or null if the school day is over/empty.
 */
export function getTodayPeriodStatus(schedule: KidSchedule, now: Date = new Date()): TodayPeriodStatus | null {
  const todayName = DAY_INDEX_TO_NAME[now.getDay()];
  const todays = periodsToday(schedule, todayName);
  if (todays.length === 0) return null;

  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const current = todays.find(p => nowHHMM >= p.startTime && nowHHMM < p.endTime);
  if (current) return { period: current, isNow: true };

  const next = todays.find(p => p.startTime > nowHHMM);
  if (next) return { period: next, isNow: false };

  return null;
}
