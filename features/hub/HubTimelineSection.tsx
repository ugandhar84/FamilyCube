import { useState, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TimelineCard } from './hubComponents';
import { TYPO } from '@/constants/theme';
import { isWorkEvent, hoursUntilEvent } from './hubUtils';
import { localDateStr } from '@/lib/dates';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Same "Today" vertical-rail timeline Parent's Hub leads with (TodayView.tsx),
// but scoped to this member: their own events (assignee or helper) plus
// family-wide events with no specific assignee (e.g. "Family Dinner"). A kid
// or teen shouldn't see a sibling's personal/medical appointment on their own
// Hub just because it happened to be on the same day. Parents keep the full
// household view via ParentView/TodayView, which doesn't use this component.
export function HubTimelineSection({ active, members, events, updateEvent, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; events: FamilyEvent[];
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  colors: any; isDark: boolean;
}) {
  const [showPast, setShowPast] = useState(false);
  const allNames = members.map(m => m.name);
  const today = localDateStr(new Date());
  const now = new Date();

  const belongsToMe = (e: FamilyEvent) => {
    const hasAnyAssignee = !!e.memberId || !!e.memberIds?.length;
    if (!hasAnyAssignee) return true; // family-wide event, e.g. "Family Dinner"
    if (e.memberId === active.id) return true;
    if (e.memberIds?.includes(active.id)) return true;
    if (e.helper === active.name) return true;
    return false;
  };

  const todayEvents = useMemo(() =>
    events
      .filter(e => e.date === today && !isWorkEvent(e) && belongsToMe(e))
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [events, today, active.id, active.name]
  );

  const upcoming = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) > -0.5);
  const past     = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) <= -0.5);

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
        <View>
          <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>Today</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 1 }}>
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/calendar')}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>Full schedule →</Text>
        </Pressable>
      </View>

      {todayEvents.length === 0 ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: isDark ? colors.card : '#fff', borderRadius: 14,
          borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          paddingVertical: 12, paddingHorizontal: 14,
        }}>
          <Text style={{ fontSize: 16 }}>✨</Text>
          <Text style={{ fontSize: TYPO.label, fontWeight: '600', color: colors.textTertiary }}>
            Nothing on the calendar today — enjoy the breathing room.
          </Text>
        </View>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <View style={{
              backgroundColor: isDark ? colors.card : '#f0fdf4',
              borderRadius: 14, padding: 14, marginBottom: 8,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Text style={{ fontSize: 18 }}>✅</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#10B981' }}>
                All done for today!
              </Text>
            </View>
          ) : upcoming.map((ev, idx) => (
            <TimelineCard
              key={ev.id} ev={ev} members={members} allNames={allNames}
              colors={colors} isDark={isDark}
              updateEvent={updateEvent} activeName={active.name}
              isFirst={idx === 0} isLast={idx === upcoming.length - 1}
            />
          ))}

          {past.length > 0 && (
            <>
              <Pressable
                onPress={() => setShowPast(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>
                  {showPast ? 'Hide' : `${past.length} completed`} {showPast ? '▴' : '▾'}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              </Pressable>
              {showPast && past.map((ev, idx) => (
                <TimelineCard
                  key={ev.id} ev={ev} members={members} allNames={allNames}
                  colors={colors} isDark={isDark}
                  updateEvent={updateEvent} activeName={active.name}
                  isFirst={idx === 0} isLast={idx === past.length - 1}
                />
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}
