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
      const aName = eventAssignee(a).name, bName = eventAssignee(b).name;
      if (aName !== bName) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const label = `${aName!.split(' ')[0]} assigned to 2 events`;
        if (!reasons.has(a.id)) reasons.set(a.id, label);
        if (!reasons.has(b.id)) reasons.set(b.id, label);
      }
    }
  }
  return reasons;
}
