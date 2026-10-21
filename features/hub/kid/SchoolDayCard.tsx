import { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useSchoolStore } from '@/store/schoolStore';
import { ClassRow, timeToMins } from '@/features/vault/tabs/school/ClassRow';
import { termsOf, guessCurrentTerm, periodsInTerm } from '@/features/vault/tabs/school/schoolUtils';
import { KidSectionHeader } from './KidSectionHeader';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * SchoolDayCard — a kid's or teen's school timetable for today, on the Hub under "Your day": one pastel row per class (time, subject,
 * room, teacher), the current class marked NOW and finished ones dimmed. Shows a calm "No school today" on a holiday, and nothing at
 * all when there is no schedule or no classes today.
 */
export function SchoolDayCard({ memberId, colors, isDark }: { memberId: string; colors: any; isDark: boolean }) {
  const { schedules, loaded, loadFromStorage } = useSchoolStore();
  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const schedule = schedules.find(s => s.memberId === memberId);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const holiday = schedule?.holidays?.find(h => todayStr >= h.startDate && todayStr <= h.endDate);
  const periods = useMemo(() => {
    if (!schedule) return [];
    const day = DAY_KEYS[now.getDay()];
    return periodsInTerm(schedule.periods, guessCurrentTerm(termsOf(schedule.periods)))
      .filter(p => !p.isLunch && !p.isBreak && (p.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']).includes(day))
      .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  }, [schedule, now.getDay()]);

  if (!schedule || (periods.length === 0 && !holiday)) return null;
  const nowM = now.getHours() * 60 + now.getMinutes();
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;

  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, gap: RHYTHM.item }}>
      <KidSectionHeader label="SCHOOL TODAY" accent={colors.teal} colors={colors} />
      {holiday ? (
        <View style={{ borderRadius: 18, padding: RHYTHM.card, backgroundColor: colors.amberLight }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>🎉 No school today</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: body, marginTop: 2 }}>{holiday.reason}</Text>
        </View>
      ) : periods.map(p => {
        const isNow = nowM >= timeToMins(p.startTime) && nowM < timeToMins(p.endTime);
        const past = nowM >= timeToMins(p.endTime);
        return (
          <View key={p.id} style={{ opacity: past ? 0.8 : 1 }}>
            <ClassRow p={p} colors={colors} isDark={isDark} now={isNow} />
          </View>
        );
      })}
    </View>
  );
}
