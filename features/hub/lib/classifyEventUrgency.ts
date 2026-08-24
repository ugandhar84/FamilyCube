/**
 * classifyEventUrgency — single per-event classification pass for the parent
 * Hub's 3 urgency-adjacent sections (Action Needed, Household Backlog,
 * AlertBanner). Replaces 4 independently-derived filters that used to live
 * in ParentView.tsx (pendingRequests, pendingRideRequiredEvents,
 * myHelperEvents, familyRideCoordination) — each event now lands in exactly
 * one bucket, closing two real bugs found live: the same unconfirmed ride
 * showing twice (once in AlertBanner, once in Action Needed, each with a
 * different card/action set), and myHelperEvents reading raw e.helper only
 * (never driverName), which silently dropped rideRequired events assigned
 * to the viewing parent out of their own Household Backlog.
 *
 * Ownership partition rule: once an event has ANY named assignee —
 * pending, confirmed, or rejected, even the viewer themselves — it is out
 * of "Action Needed" territory (that's for genuinely open, first-to-claim
 * items only). It moves to Household Backlog, either as the viewer's own
 * pending commitment (myPending) or as read-only awareness of a co-parent's
 * outstanding assignment (coParentPending) — the latter is a superset of
 * the old familyRideCoordination (which only covered GP/teen-pool-opened
 * rides) broadened to also cover a plain co-parent self-claim, closing a
 * regression from an earlier pass that removed the only surface showing
 * that case to the other parent.
 *
 * Conflict/never-dispatched detection deliberately stays in ParentView.tsx
 * — those are pairwise/multi-event scans (double-booking across the whole
 * day), structurally different from this per-event classification.
 */
import type { FamilyEvent } from '@/store/eventStore';
import { eventAssignee } from '@/store/eventStore';
import { isWorkEvent, hoursUntilEvent } from '../hubUtils';

export function classifyEventUrgency(
  events: FamilyEvent[],
  viewer: { id: string; name: string },
  today: string,
): {
  unassigned: FamilyEvent[];
  myPending: FamilyEvent[];
  coParentPending: FamilyEvent[];
} {
  const unassigned: FamilyEvent[] = [];
  const myPending: FamilyEvent[] = [];
  const coParentPending: FamilyEvent[] = [];

  for (const e of events) {
    if (isWorkEvent(e)) continue;
    const a = eventAssignee(e);

    if (!a.name) {
      if (hoursUntilEvent(e.date, e.time) >= 0) unassigned.push(e);
      continue;
    }

    if (a.name === viewer.name) {
      // Mirrors the original myHelperEvents' date-only bound (no upper
      // hoursUntilEvent cutoff) and its exclusion of confirmed/rejected —
      // a settled commitment belongs in Schedule, not Backlog; a
      // self-rejected assignment was already excluded before this
      // refactor too (it resurfaces once decline_event_assignment's
      // auto-reopen clears the assignee entirely, landing it back in
      // `unassigned` on the next pass).
      if ((e.date ?? '') >= today && a.status !== 'confirmed' && a.status !== 'rejected') {
        myPending.push(e);
      }
      continue;
    }

    // Someone else is assigned — read-only awareness for the viewer,
    // regardless of whether it's pending or rejected (a co-parent's
    // declined ride is still worth knowing about) or how it got assigned
    // (self-claimed, opened to GP/teen, or directly reassigned).
    if (a.status !== 'confirmed' && hoursUntilEvent(e.date, e.time) >= 0) {
      coParentPending.push(e);
    }
  }

  return { unassigned, myPending, coParentPending };
}
