import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useSchoolStore } from '@/store/schoolStore';
import { getTodayPeriodStatus } from '@/lib/schoolPeriodNow';
import { useEventStore } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { KIOSK_SPACE, KIOSK_TYPO, KIOSK_RADIUS } from '../kioskTheme';
import { WidgetCard, PanelHead, EmptyNote } from './KioskOS';
import { KioskEventDetailSheet } from './KioskEventDetailSheet';
import type { KioskColors } from '../kioskPalette';

export function KioskSchoolTodayWidget({ kids, members, k, isDark, active }: {
  kids: FamilyMember[]; members: FamilyMember[]; k: KioskColors; isDark: boolean; active: FamilyMember;
}) {
  const { schedules, loaded, loadFromStorage } = useSchoolStore();
  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  const { events } = useEventStore();
  // Same tap-to-detail as the Hub's SchoolTodaySection — [live-requested:
  // "if they tap on that schedule card it should open details bottom
  // sheet"]. onEditFull just closes back to this glance widget rather
  // than opening the full KioskEventEditor drawer — this widget is
  // meant to stay a lightweight glance surface, not become a full
  // schedule editor.
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const detailEvent = detailEventId ? events.find(e => e.id === detailEventId) ?? null : null;

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
          <Pressable
            key={kid.id}
            disabled={!status?.period.linkedEventId}
            onPress={() => status?.period.linkedEventId && setDetailEventId(status.period.linkedEventId)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingHorizontal: 10, paddingVertical: 8,
              borderRadius: KIOSK_RADIUS.sm,
              backgroundColor: status?.isNow ? k.sage + '18' : k.well,
              borderWidth: status?.isNow ? 1 : 0,
              borderColor: k.sage + '40',
            }}>
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
                paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
                backgroundColor: k.sage,
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                <Text style={{ fontSize: KIOSK_TYPO.micro, fontWeight: '800', color: '#fff', letterSpacing: 0.3 }}>NOW</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
      <KioskEventDetailSheet
        event={detailEvent}
        active={active}
        members={members}
        onClose={() => setDetailEventId(null)}
        onEditFull={() => setDetailEventId(null)}
      />
    </WidgetCard>
  );
}
