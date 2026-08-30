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

// viewer.name is only used as a display-name fallback for the rare case
// an assignee has no real member id (an external, non-member name typed
// into the free-text fallback field) — the actual "is this ME" check
// below compares viewer.id against a.id, never viewer.name against
// a.name. A name compare is fragile (a rename, two members sharing a
// first name, or any drift between what's stored and a member's current
// display name all break it silently) and was only ever a stand-in for a
// real id column, which calendar_events now has (driver_id/helper_id,
// migration 20260930240000).
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
      // Action Needed is for "figure this out soon," not a preview of every
      // unassigned event on the calendar — an unassigned ride 5 months out
      // (e.g. a school-calendar flyer import) has no business competing for
      // attention there yet. Bounded to the next 48h; anything further out
      // still shows up fine on its actual date via Schedule.
      const h = hoursUntilEvent(e.date, e.time);
      if (h >= 0 && h <= 48) unassigned.push(e);
      continue;
    }

    // id-based when the assignee is a real member (the normal case); only
    // an external, non-member assignee (no id at all) falls back to a
    // name compare, since there's nothing else to compare against for
    // someone with no member row.
    const isViewer = a.id ? a.id === viewer.id : a.name === viewer.name;
    if (isViewer) {
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
