/**
 * Shared "assignee double-booked" (case B) conflict detection — same
 * assignee name (helper or driver), two timed events, <30 minutes apart,
 * same day, non-Work, neither rejected. Extracted from ParentView.tsx's
 * own conflict-detection block (case B specifically — cases A/C/D stay
 * inline there, not needed outside the parent Hub) so KidView can show
 * the SAME conflict signal on a kid's own ride banner — a kid whose
 * driver is double-booked has just as much reason to know as the parent
 * does (live direction: "conflicted kids are also should show the symbol
 * with ride conflict").
 */
import type { FamilyEvent } from '@/store/eventStore';
import { eventAssignee } from '@/store/eventStore';

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return Math.abs((ah * 60 + am) - (bh * 60 + bm));
}

/** eventId → conflict reason label, for every event with an assignee double-booked against another same-day event. */
export function detectAssigneeConflicts(events: FamilyEvent[]): Map<string, string> {
  const reasons = new Map<string, string>();
  const timed = events.filter(e =>
    !!e.time && e.category !== 'Work' && !!eventAssignee(e).name && eventAssignee(e).status !== 'rejected'
  );
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j];
      if (a.date !== b.date) continue;
      const assigneeA = eventAssignee(a), assigneeB = eventAssignee(b);
      // id-based — falls back to name only when either side is an
      // external, non-member assignee with no id at all.
      const sameAssignee = assigneeA.id && assigneeB.id
        ? assigneeA.id === assigneeB.id
        : assigneeA.name === assigneeB.name;
      if (!sameAssignee) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const label = `${assigneeA.name!.split(' ')[0]} assigned to 2 events`;
        if (!reasons.has(a.id)) reasons.set(a.id, label);
        if (!reasons.has(b.id)) reasons.set(b.id, label);
      }
    }
  }
  return reasons;
}

/**
 * Shared "family event vs. a connected parent's work calendar" conflict
 * detection — ParentView.tsx's own cases C (event's own memberId is
 * literally at work then) and D (event's assigned helper/driver is at
 * work then), extracted the same way case B was above so every role's
 * Hub view — and any Chore card — can show the same signal, not just the
 * parent Hub banner (live direction: "Kid's also show on their card
 * parent is conflict with work"). `workEvents` is every category:'Work'
 * event for the day, real (manually entered) or auto-synced from a
 * connected calendar's FreeBusy blocks (calendar-freebusy-sync) — this
 * function doesn't care which, both look identical once materialized.
 * `members` is needed for case D, which resolves a helper/driver's NAME
 * (stored on the event as free text) back to a real member id to match
 * against workEv.memberId — same lookup ParentView.tsx's own case D does.
 */
export function detectWorkConflicts(events: FamilyEvent[], workEvents: FamilyEvent[], members: { id: string; name: string }[]): Map<string, string> {
  const reasons = new Map<string, string>();
  const timedMemberEvents = events.filter(e => !!e.time && !!e.memberId && e.category !== 'Work');
  const timedHelperAssignments = events.filter(e =>
    !!e.time && e.category !== 'Work' && !!eventAssignee(e).name && eventAssignee(e).status !== 'rejected'
  );

  // Case C: the event's own person is the one at work (e.g. a teen's own
  // shift overlapping their own ride).
  for (const familyEv of timedMemberEvents) {
    for (const workEv of workEvents) {
      if (familyEv.memberId !== workEv.memberId || familyEv.date !== workEv.date || !workEv.time) continue;
      if (minutesBetween(familyEv.time!, workEv.time) < 30 && !reasons.has(familyEv.id)) {
        const memberName = members.find(m => m.id === familyEv.memberId)?.name.split(' ')[0] ?? 'their';
        reasons.set(familyEv.id, `Conflicts with ${memberName}'s work`);
      }
    }
  }

  // Case D: the event's assigned helper/driver (a display name) is the
  // one at work — resolve the name to a member id first, same as
  // ParentView.tsx's own case D, then match that id against workEv.memberId.
  for (const familyEv of timedHelperAssignments) {
    const assignee = eventAssignee(familyEv);
    // id-based when the assignee is a real member; falls back to name
    // only for an external, non-member assignee with no id at all.
    const helperMember = assignee.id
      ? members.find(m => m.id === assignee.id)
      : members.find(m => m.name === assignee.name);
    if (!helperMember) continue;
    for (const workEv of workEvents) {
      if (workEv.memberId !== helperMember.id || familyEv.date !== workEv.date || !workEv.time) continue;
      if (minutesBetween(familyEv.time!, workEv.time) < 30 && !reasons.has(familyEv.id)) {
        reasons.set(familyEv.id, `Conflicts with ${helperMember.name.split(' ')[0]}'s work`);
      }
    }
  }

  return reasons;
}
