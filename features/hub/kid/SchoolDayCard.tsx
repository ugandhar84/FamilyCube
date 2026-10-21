import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSchoolStore } from '@/store/schoolStore';
import { useFamilyStore } from '@/store/familyStore';
import { supabase } from '@/lib/supabase';
import { subjectTone, timeToMins, fmtTime12 } from '@/features/vault/tabs/school/ClassRow';
import { prettySubject } from '@/features/vault/tabs/school/schoolUtils';
import { termsOf, guessCurrentTerm, periodsInTerm } from '@/features/vault/tabs/school/schoolUtils';
import { KidSectionHeader } from './KidSectionHeader';
import { RHYTHM } from '@/constants/theme';
import { GEMINI } from '@/constants/geminiRhythm';

const GAP = 6;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type HolidayDay = { date: string; reason: string };
type Break = { reason: string; start: string; end: string };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDiff = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);
const baseTitle = (t: string) => t.toLowerCase().replace(/\(.*?\)|day \d+|\bday\b|[-:]\s*\d+/g, '').replace(/\s+/g, ' ').trim();
function fmtD(iso: string) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtDY(iso: string) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

/** Single holiday days (from a linked school calendar) become breaks: the same name on consecutive school days, a weekend allowed between, is one break "from – to". */
function groupBreaks(days: HolidayDay[]): Break[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out: (Break & { key: string })[] = [];
  for (const d of sorted) {
    const key = baseTitle(d.reason);
    const last = out[out.length - 1];
    if (last && last.key === key && dayDiff(last.end, d.date) <= 3) last.end = d.date;
    else out.push({ reason: d.reason.replace(/\s*\(.*?\)\s*/g, ' ').trim(), start: d.date, end: d.date, key });
  }
  return out.map(({ key: _k, ...b }) => b);
}

/** One child's school day: which day to show (today while school is on, else the next school day), its classes, and any holiday today. */
export function useSchoolDay(memberId: string) {
  const { schedules, loaded, loadFromStorage } = useSchoolStore();
  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const schedule = schedules.find(s => s.memberId === memberId);
  const familyId = useFamilyStore(st => (st.members.find(m => m.id === memberId) as any)?.familyId as string | undefined);
  // Holidays from a linked school calendar are calendar events (category Holiday), not part of the schedule: read them too.
  const [calHolidays, setCalHolidays] = useState<HolidayDay[]>([]);
  useEffect(() => {
    if (!familyId) return;
    const from = new Date(); from.setDate(from.getDate() - 21);
    const to = new Date(); to.setDate(to.getDate() + 45);
    supabase.from('calendar_events').select('date,title').eq('family_id', familyId).eq('category', 'Holiday').is('deleted_at', null)
      .gte('date', ymd(from)).lte('date', ymd(to)).then(({ data }) => setCalHolidays((data ?? []).map((r: any) => ({ date: r.date, reason: r.title }))));
  }, [familyId]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayKey = now.toDateString();
  // Every break/holiday we know: the schedule's own ranges plus the linked school calendar's days grouped into breaks.
  const breaks: Break[] = useMemo(() => [
    ...(schedule?.holidays ?? []).map(h => ({ reason: h.reason, start: h.startDate, end: h.endDate })),
    ...groupBreaks(calHolidays),
  ], [schedule, calHolidays]);
  const todayBreak = breaks.find(b => ymd(now) >= b.start && ymd(now) <= b.end);
  // Which day to show: today while school is still on, otherwise the next day that has classes and is not a holiday.
  const target = useMemo(() => {
    if (!schedule) return null;
    const term = guessCurrentTerm(termsOf(schedule.periods));
    for (let i = 0; i < 21; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (breaks.some(b => ds >= b.start && ds <= b.end)) continue;
      const ps = periodsInTerm(schedule.periods, term)
        .filter(p => !p.isLunch && (p.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']).includes(DAY_KEYS[d.getDay()]))
        .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
      if (ps.length === 0) continue;
      if (i === 0 && nowMin >= timeToMins(ps[ps.length - 1].endTime)) continue; // today's school is over
      return { offset: i, label: i === 0 ? 'SCHOOL TODAY' : i === 1 ? 'SCHOOL TOMORROW' : `NEXT SCHOOL DAY · ${d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}`, periods: ps };
    }
    return null;
  }, [schedule, breaks, dayKey, nowMin >= 1440 ? 0 : Math.floor(nowMin / 5)]);
  const periods = target?.periods ?? [];
  const isToday = target?.offset === 0;

  return { schedule, now, nowMin, target, todayBreak, periods, isToday };
}

/**
 * SchoolDayCard — a kid's or teen's school timetable for today, on the Hub under "Your day": one pastel row per class (time, subject,
 * room, teacher), the current class marked NOW and finished ones dimmed. Shows a calm "No school today" on a holiday, and nothing at
 * all when there is no schedule or no classes today.
 */
export function SchoolDayCard({ memberId, colors, isDark, collapseAfter, hideHeader, bare }: {
  memberId: string; colors: any; isDark: boolean;
  /** Show only this many classes (from the current one) with a "+N more" link. Default: every class. */
  collapseAfter?: number;
  /** Hide the section heading (the parent Hub shows its own above the kid tabs). */
  hideHeader?: boolean;
  /** No outer margins (when placed inside another card). */
  bare?: boolean;
}) {
  const { schedule, now, nowMin, target, todayBreak, periods, isToday } = useSchoolDay(memberId);
  const tone = (subject: string) => subjectTone(subject, colors);
  // The class in session, else the next upcoming one, else the last.
  const focusIdx = !isToday ? 0 : (() => {
    const cur = periods.findIndex(p => nowMin >= timeToMins(p.startTime) && nowMin < timeToMins(p.endTime));
    if (cur >= 0) return cur;
    const next = periods.findIndex(p => timeToMins(p.startTime) > nowMin);
    return next >= 0 ? next : Math.max(0, periods.length - 1);
  })();
  const [expanded, setExpanded] = useState(false);
  const shown = collapseAfter && !expanded ? periods.slice(focusIdx, focusIdx + collapseAfter) : periods;
  const hidden = periods.length - shown.length;

  if (!schedule || (!target && !todayBreak)) return null;

  const celebrate = todayBreak ? (
    <View style={{ borderRadius: 22, padding: RHYTHM.card, gap: 4, backgroundColor: colors.amberLight, borderWidth: 1, borderColor: colors.amber + '55' }}>
      <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 0.8, color: colors.amber }}>🎉 HOLIDAY TODAY</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>{todayBreak.reason}</Text>
      {todayBreak.start !== todayBreak.end ? (
        <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>
          {fmtD(todayBreak.start)} to {fmtDY(todayBreak.end)} · {dayDiff(ymd(now), todayBreak.end) + 1} more day{dayDiff(ymd(now), todayBreak.end) === 0 ? '' : 's'} off
        </Text>
      ) : null}
      <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>Enjoy the day off! 🥳</Text>
    </View>
  ) : null;

  return (
    <View style={{ marginHorizontal: bare ? 0 : 16, marginTop: bare ? 0 : 14, gap: RHYTHM.item }}>
      {celebrate}
      {target ? (
        <>
          {!hideHeader && <KidSectionHeader label={todayBreak ? `BACK TO SCHOOL · ${new Date(target.periods.length ? ymd(new Date(Date.now() + target.offset * 86_400_000)) + 'T12:00:00' : '').toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}` : target.label} accent={colors.teal} colors={colors} />}
        <View style={{ gap: GAP }}>
          {shown.map(p => {
            const isNow = isToday && nowMin >= timeToMins(p.startTime) && nowMin < timeToMins(p.endTime);
            const past = isToday && nowMin >= timeToMins(p.endTime);
            return (
              // One compact line per class: class name and room.
              <View key={p.id} style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 12, opacity: past ? 0.7 : 1,
                backgroundColor: tone(p.subject).fg + (isDark ? '33' : '33'), borderWidth: isNow ? 2 : 0, borderColor: tone(p.subject).fg }}>
                <View style={{ width: 62 }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: isDark ? colors.textPrimary : GEMINI.titleColor, fontVariant: ['tabular-nums'] }}>{fmtTime12(p.startTime)}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>{timeToMins(p.endTime) - timeToMins(p.startTime)} min</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }} numberOfLines={1}>{prettySubject(p.subject)}</Text>
                {p.room ? <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: isDark ? tone(p.subject).fg + '55' : '#FFFFFF' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: tone(p.subject).fg }}>{String(p.room).replace(/^room\s*/i, '')}</Text>
                </View> : null}
              </View>
            );
          })}
          {collapseAfter && periods.length > collapseAfter && (
            <TouchableOpacity onPress={() => setExpanded(v => !v)} accessibilityRole="button" accessibilityLabel={expanded ? 'Show fewer classes' : 'Show more classes'}
              style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>{expanded ? 'Show less' : `+${hidden} more`}</Text>
            </TouchableOpacity>
          )}
          {periods.length > 0 && (
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? colors.textSecondary : GEMINI.bodyColor, paddingHorizontal: 4, paddingTop: 2 }}>
              🏠 Dismissal around {fmtTime12(periods[periods.length - 1].endTime)}
            </Text>
          )}
        </View>
        </>
      ) : null}
    </View>
  );
}
