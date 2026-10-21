import { View } from 'react-native';
import { gpSideMembers } from '@/lib/gpSide';
import { useMemo } from 'react';
import { isWorkEvent, hoursUntilEvent } from './hubUtils';
import { localDateStr } from '@/lib/dates';
import { isEventSensitive, eventAssignee, useEventStore } from '@/store/eventStore';
import { detectAssigneeConflicts } from './lib/detectAssigneeConflicts';
import { NextUpTimeline } from './parent/NextUpCard';
import { SchoolDayCard } from './kid/SchoolDayCard';
import { HubMyList } from './HubMyList';
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
export function HubTimelineSection({ active, members, events, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; events: FamilyEvent[];
  colors: any; isDark: boolean;
}) {
  // Read directly from the store rather than threading a new prop through
  // every caller (TeenView/KidTodaySection/KidView/SeniorView) — was:
  // "Nothing on the calendar today" rendered the instant events was
  // empty, with no check for whether the initial fetch had actually
  // finished, so a fresh unlock/foreground briefly flashed the empty
  // state even on a day with real events before snapping to the correct
  // list (live-reported: "events not showing afterwards it is coming
  // back"). Same fix as TodayView's own dayLoading check just above.
  const dayLoading = useEventStore(s => s.dayLoading);
  const today = localDateStr(new Date());
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
    // A grandparent also sees their same-side partner's events (both paternal / both maternal).
    const sideIds = gpSideMembers(active.id, members).map(m => m.id);
    if (e.memberId && sideIds.includes(e.memberId)) return true;
    if (e.memberIds?.some(id => sideIds.includes(id))) return true;
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
    if (!isEventSensitive(e, members)) return true;
    if (e.sharedWithSiblings) return true;
    return false;
  };

  const todayEvents = useMemo(() =>
    events
      .filter(e => e.date === today && !isWorkEvent(e) && belongsToMe(e))
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [events, today, active.id, active.name]
  );

  // Up to 3 upcoming (not-yet-passed) events — same slice NextUpTimeline
  // itself applies for Parent's Hub, kept here too so the loading/empty
  // states below can tell "nothing left today" apart from "still loading."
  const upcoming = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) > -0.5);

  if (todayEvents.length === 0 && dayLoading) {
    // Keep the space while the day's events load (a quiet placeholder), so the sections below don't jump down when they arrive.
    return <View style={{ marginHorizontal: 20, marginTop: 14, height: 76, borderRadius: 22, backgroundColor: colors.surface, opacity: 0.5 }} />;
  }

  return (
    <>
      <NextUpTimeline
        colors={colors} isDark={isDark}
        events={upcoming}
        conflictReasons={conflictReasons}
      />
      {(active.role === 'kid' || active.role === 'teen') && <SchoolDayCard memberId={active.id} colors={colors} isDark={isDark} />}
      <HubMyList active={active} colors={colors} isDark={isDark} />
    </>
  );
}
