import { useState, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Clock } from 'lucide-react-native';
import { TimelineCard, LiveDot, SectionCard } from './hubComponents';
import { TYPO } from '@/constants/theme';
import { isWorkEvent, hoursUntilEvent } from './hubUtils';
import { localDateStr } from '@/lib/dates';
import { isEventSensitive, eventAssignee } from '@/store/eventStore';
import { detectAssigneeConflicts } from './lib/detectAssigneeConflicts';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Same "Today" vertical-rail timeline Parent's Hub leads with (TodayView.tsx),
// scoped to this member: their own events (assignee/helper/driver), plus
// family-wide events with no specific assignee (e.g. "Family Dinner"), plus
// any OTHER member's event that isn't actually sensitive (isEventSensitive —
// not Medical/private/Ride, no rideRequired). A kid or teen still shouldn't
// see a sibling's Medical appointment or ride request just because it's the
// same day — those stay hidden unless a parent explicitly flips
// sharedWithSiblings on that one event. Parents keep the full household view
// via ParentView/TodayView, which doesn't use this component.
export function HubTimelineSection({ active, members, events, updateEvent, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; events: FamilyEvent[];
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  colors: any; isDark: boolean;
}) {
  const [showPast, setShowPast] = useState(false);
  const allNames = members.map(m => m.name);
  const today = localDateStr(new Date());
  const now = new Date();
  // Same assignee-double-booked signal ParentView/TodayView show a
  // parent — computed over ALL events (not just belongsToMe-filtered
  // ones below), since the conflict is about the DRIVER/helper's own
  // schedule, which may span an event that doesn't itself belong to this
  // viewer. Was entirely missing here — TimelineCard already supported a
  // conflictReason prop (TodayView passes it), but this kid/teen/senior
  // timeline never computed or passed one at all (live direction: kids
  // whose ride is conflicted should see the same badge on their own
  // Today's Timeline card).
  const conflictReasons = useMemo(() => detectAssigneeConflicts(events), [events]);

  const belongsToMe = (e: FamilyEvent) => {
    const hasAnyAssignee = !!e.memberId || !!e.memberIds?.length;
    if (!hasAnyAssignee) return true; // family-wide event, e.g. "Family Dinner"
    if (e.memberId === active.id) return true;
    if (e.memberIds?.includes(active.id)) return true;
    // id-based — a name-string compare breaks silently on rename or two
    // members sharing a first name; falls back to name only when the
    // assignee has no member id at all (an external, non-member name).
    const assignee = eventAssignee(e);
    if (assignee.id ? assignee.id === active.id : assignee.name === active.name) return true;
    // A sibling's event that ISN'T actually sensitive (not Medical/private/
    // Ride, no rideRequired) is ordinary family awareness, not something
    // that needs hiding — matches canViewSensitiveEventDetail's own "hidden
    // by default only for sensitive events" rule (eventStore.ts). A
    // sensitive event stays hidden unless the parent explicitly flipped
    // sharedWithSiblings for it — the same opt-in that already governs
    // whether a sibling sees the event's full DETAIL elsewhere in the app.
    if (!isEventSensitive(e)) return true;
    if (e.sharedWithSiblings) return true;
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
    <View style={{ paddingHorizontal: 16 }}>
      {/* Same collapsible SectionCard shell Parent's TodayView uses — Kid's
          Today previously had its own fixed (non-collapsible) header,
          reported live as inconsistent with Parent's Hub. */}
      <SectionCard
        icon={<Clock size={16} color={colors.primary} />}
        title="Today"
        subtitle={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        accent={colors.primary}
        badge={upcoming.length} badgeLabel={upcoming.length === 1 ? 'Event' : 'Events'} badgeColor={colors.primary}
        collapsible defaultExpanded={todayEvents.length > 0}
        colors={colors} isDark={isDark}>
      {todayEvents.length === 0 ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
          Nothing on the calendar today — enjoy the breathing room.
        </Text>
      ) : (
        <>
          {/* "Live now" marker — sits above the next upcoming event, i.e.
              where "now" actually falls in the day's schedule. Only shown
              once there's something left today; a day that's entirely
              past just falls straight into the "completed" section. */}
          {upcoming.length > 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              marginBottom: 10,
            }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: colors.success + '18', borderRadius: 20,
                paddingVertical: 5, paddingHorizontal: 10,
              }}>
                <LiveDot color={colors.success} />
                <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.success, letterSpacing: 0.3 }}>
                  LIVE NOW · {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.success + '30' }} />
            </View>
          )}

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
              updateEvent={updateEvent} activeName={active.name} activeMemberId={active.id}
              isFirst={idx === 0} isLast={idx === upcoming.length - 1}
              conflictReason={conflictReasons.get(ev.id)}
            />
          ))}

          {/* Completed events stay out of the way once there's something
              still ahead today — no point scrolling past what's done to
              get to what's next. Only surfaced (via the toggle) once the
              day has nothing left upcoming. */}
          {past.length > 0 && upcoming.length === 0 && (
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
                  updateEvent={updateEvent} activeName={active.name} activeMemberId={active.id}
                  isFirst={idx === 0} isLast={idx === past.length - 1}
                />
              ))}
            </>
          )}
        </>
      )}
      </SectionCard>
    </View>
  );
}
