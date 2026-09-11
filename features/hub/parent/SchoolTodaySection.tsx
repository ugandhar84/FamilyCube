import { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { GraduationCap } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { SectionCard } from '../hubComponents';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useSchoolStore } from '@/store/schoolStore';
import { getTodayPeriodStatus } from '@/lib/schoolPeriodNow';
import type { FamilyMember } from '@/store/familyStore';

export function SchoolTodaySection({ members, colors, isDark }: {
  members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { schedules, loaded, loadFromStorage } = useSchoolStore();
  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);

  // Re-derive every minute so "happening now" and the current/next period
  // stay accurate while the Hub screen stays mounted.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const kids = members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending' && (m.role === 'kid' || m.role === 'teen'));

  const rows = useMemo(() => kids
    .map(kid => {
      const schedule = schedules.find(s => s.memberId === kid.id);
      if (!schedule) return null;
      const status = getTodayPeriodStatus(schedule, now);
      return { kid, status };
    })
    .filter((r): r is { kid: FamilyMember; status: ReturnType<typeof getTodayPeriodStatus> } => r !== null),
    [kids, schedules, now]);

  if (rows.length === 0) return null;

  return (
    <SectionCard
      icon={<GraduationCap size={16} color={colors.teal} />}
      title="School Today"
      accent={colors.teal}
      colors={colors} isDark={isDark}
    >
      <View style={{ gap: 10 }}>
        {rows.map(({ kid, status }) => (
          <View key={kid.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={(kid as any).avatarUrl} size={36} ringColor={colors.kid} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                {kid.name.split(' ')[0]}
              </Text>
              {status ? (
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 1 }}>
                  {status.period.subject}{status.period.room ? ` · Rm ${status.period.room}` : ''} · {status.period.startTime}–{status.period.endTime}
                </Text>
              ) : (
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>
                  No more classes today
                </Text>
              )}
            </View>
            {status?.isNow && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
                backgroundColor: colors.tealLight,
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal }} />
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.teal }}>NOW</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </SectionCard>
  );
}
