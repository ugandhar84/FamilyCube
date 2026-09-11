import { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useSchoolStore } from '@/store/schoolStore';
import { getTodayPeriodStatus } from '@/lib/schoolPeriodNow';
import type { FamilyMember } from '@/store/familyStore';
import { KIOSK_SPACE, KIOSK_TYPO } from '../kioskTheme';
import { WidgetCard, PanelHead, EmptyNote } from './KioskOS';
import type { KioskColors } from '../kioskPalette';

export function KioskSchoolTodayWidget({ kids, k, isDark }: {
  kids: FamilyMember[]; k: KioskColors; isDark: boolean;
}) {
  const { schedules, loaded, loadFromStorage } = useSchoolStore();
  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => kids
    .map(kid => {
      const schedule = schedules.find(s => s.memberId === kid.id);
      if (!schedule) return null;
      return { kid, status: getTodayPeriodStatus(schedule, now) };
    })
    .filter((r): r is { kid: FamilyMember; status: ReturnType<typeof getTodayPeriodStatus> } => r !== null),
    [kids, schedules, now]);

  if (rows.length === 0) return null;

  return (
    <WidgetCard k={k} isDark={isDark}>
      <PanelHead title="School today" k={k} />
      <View style={{ gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.xs }}>
        {rows.map(({ kid, status }) => (
          <View key={kid.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={(kid as any).avatarUrl} size={32} ringColor={k.gold} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: KIOSK_TYPO.body, fontWeight: '700', color: k.text }}>
                {kid.name.split(' ')[0]}
              </Text>
              {status ? (
                <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.textFaint, marginTop: 1 }}>
                  {status.period.subject}{status.period.room ? ` · Rm ${status.period.room}` : ''} · {status.period.startTime}–{status.period.endTime}
                </Text>
              ) : (
                <Text style={{ fontSize: KIOSK_TYPO.caption, color: k.textFaint, marginTop: 1 }}>
                  No more classes today
                </Text>
              )}
            </View>
            {status?.isNow && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
                backgroundColor: k.sage + '22',
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k.sage }} />
                <Text style={{ fontSize: KIOSK_TYPO.micro, fontWeight: '700', color: k.sage }}>NOW</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </WidgetCard>
  );
}
