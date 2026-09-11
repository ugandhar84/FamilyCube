import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { GraduationCap } from 'lucide-react-native';
import { TYPO, RADIUS } from '@/constants/theme';
import { SectionCard, EventDetailSheet } from '../hubComponents';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useSchoolStore } from '@/store/schoolStore';
import { getTodayPeriodStatus, type TodayPeriodStatus, type HolidayStatus } from '@/lib/schoolPeriodNow';

function isHoliday(s: TodayPeriodStatus | HolidayStatus | null): s is HolidayStatus {
  return !!s && 'reason' in s;
}
import { useEventStore } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';

export function SchoolTodaySection({ members, colors, isDark, activeName, activeMemberId }: {
  members: FamilyMember[]; colors: any; isDark: boolean;
  activeName?: string; activeMemberId?: string;
}) {
  const { schedules, loaded, loadFromStorage } = useSchoolStore();
  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  const { events, updateEvent } = useEventStore();
  // Tapping a row opens the SAME EventDetailSheet Hub's timeline/Calendar
  // already use for every other event — a class period is a real
  // materialized calendar_events row (materializePeriodEvent), just
  // looked up via the period's own linkedEventId rather than rendered
  // directly from `events` [live-requested: "if they tap on that
  // schedule card it should open details bottom sheet"].
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const detailEvent = detailEventId ? events.find(e => e.id === detailEventId) : undefined;

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
    // SectionCard's own root is `{ marginBottom: 18 }` only — no
    // horizontal spacing at all. Every other SectionCard consumer in
    // ParentView.tsx (e.g. HouseholdBacklogSection) wraps it in its own
    // paddingHorizontal:16 container; this one didn't, so it rendered
    // flush to the screen edges while FamilyGamesSection/
    // HomeownerNotesSection (which hand-roll their own card, not
    // SectionCard) correctly had marginHorizontal:16 — [live-reported:
    // "this is not aligned padding with other sections"].
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={<GraduationCap size={16} color={colors.teal} />}
        title="School Today"
        accent={colors.teal}
        colors={colors} isDark={isDark}
      >
        <View style={{ gap: 8 }}>
          {rows.map(({ kid, status }) => {
            const holiday = isHoliday(status);
            const periodStatus = holiday ? null : (status as TodayPeriodStatus | null);
            return (
              <Pressable
                key={kid.id}
                disabled={!periodStatus?.period.linkedEventId}
                onPress={() => periodStatus?.period.linkedEventId && setDetailEventId(periodStatus.period.linkedEventId)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderRadius: RADIUS.md,
                  backgroundColor: periodStatus?.isNow ? colors.tealLight : colors.surface,
                  borderWidth: 1,
                  borderColor: periodStatus?.isNow ? colors.teal + '55' : colors.border,
                }}>
                <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={(kid as any).avatarUrl} size={38} ringColor={colors.kid} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                    {kid.name.split(' ')[0]}
                  </Text>
                  {holiday ? (
                    <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>
                      🎉 No school — {(status as HolidayStatus).reason}
                    </Text>
                  ) : periodStatus ? (
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 1 }}>
                      {periodStatus.period.subject}{periodStatus.period.room ? ` · Rm ${periodStatus.period.room}` : ''} · {periodStatus.period.startTime}–{periodStatus.period.endTime}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>
                      No more classes today
                    </Text>
                  )}
                </View>
                {periodStatus?.isNow && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
                    backgroundColor: colors.teal,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff', letterSpacing: 0.3 }}>NOW</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      {detailEvent && (
        <EventDetailSheet
          ev={detailEvent}
          members={members}
          colors={colors} isDark={isDark}
          activeName={activeName}
          activeMemberId={activeMemberId}
          updateEvent={updateEvent}
          onClose={() => setDetailEventId(null)}
        />
      )}
    </View>
  );
}
