import { eventAssignee } from '@/store/eventStore';
import { localToday, hoursUntilEvent, isWorkEvent, minutesBetween, isHomeLocation } from '../../hubUtils';
import { classifyEventUrgency } from '../../lib/classifyEventUrgency';
import { useUpcomingOpenEvents } from '../../useUpcomingOpenEvents';
import { usePendingUnconfirmedEvents } from '../../usePendingUnconfirmedEvents';
import { detectAssigneeConflicts, detectWorkConflicts } from '../../lib/detectAssigneeConflicts';
import { dedupeRideSeries } from '../../lib/dedupeRideSeries';
import { decodeRideLate } from '../../KidModals';
import type { FamilyMember } from '@/store/familyStore';

// The event classification + schedule-conflict-detection block for
// ParentView. This is the densest, most comment-heavy part of the original
// file — every comment below documents a specific, previously-live bug and
// is preserved verbatim from ParentView.tsx. Do not "clean up" any of this
// without re-reading the history it references.
export function useParentEventClassification(
  active: FamilyMember,
  members: FamilyMember[],
  events: any[],
  activeTrip: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number } | null | undefined,
  otherActiveTrips: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number }[] | undefined,
  kidRequests: any[],
) {
  // events (from selectDate) is scoped to a single day tied to whatever
  // date the Calendar tab last had open — a ride/helper assignment made
  // for any OTHER date never reached Household Backlog's "is this
  // assigned to me" check at all, live or otherwise (confirmed live:
  // "Pick up from Office," assigned days out, never appeared on the
  // Hub). KidView/TeenView/SeniorView already solved this correctly via
  // useUpcomingOpenEvents (its own real-time-subscribed, multi-day
  // window, independent of the Calendar tab's single selected date) —
  // ParentView was the one view still missing it. Matching that existing,
  // proven pattern here instead of introducing a fourth different
  // data-fetching mechanism.
  const { events: backlogWindowEvents } = useUpcomingOpenEvents((active as any).familyId);
  // useUpcomingOpenEvents' 14-day cap is right for the near-term dispatch
  // cards it also feeds (LendAHandCard/RideRequestCard), but myPending/
  // coParentPending have no natural date ceiling — a self/co-parent
  // assignment still awaiting confirmation shouldn't vanish from the Hub
  // just because the event is months out (live-reported: a Google-synced
  // appointment 67 days out, self-assigned and still pending, was
  // invisible everywhere on the Hub). Merged into the classifier's input
  // below rather than widening useUpcomingOpenEvents itself.
  const { events: pendingUnconfirmedEvents } = usePendingUnconfirmedEvents((active as any).familyId);

  const today = localToday();

  // All events today (sorted) — Work events hidden from timeline but used for conflict detection
  const allTodayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const workEvents    = allTodayEvents.filter(e => isWorkEvent(e));
  const todayEvents   = allTodayEvents.filter(e => !isWorkEvent(e));

  // Single classification pass replacing 4 independently-derived filters
  // that used to live here (pendingRequests, pendingRideRequiredEvents,
  // myHelperEvents, familyRideCoordination) — see classifyEventUrgency.ts
  // for the unassigned/myPending/coParentPending bucket rules and the field-
  // pair-consistency bugs this closed (myHelperEvents used to read raw
  // e.helper only, silently dropping driverName-paired events from a
  // parent's own Household Backlog; the same unconfirmed ride could
  // previously show in both AlertBanner and Action Needed at once).
  // upcomingEvents may be briefly empty right after mount (its own fetch
  // hasn't resolved yet) — fall back to the day-scoped `events` rather
  // than showing an empty backlog for a moment; it settles to the real,
  // wider data within one render once useUpcomingOpenEvents' fetch lands.
  // pendingUnconfirmedEvents merged in (deduped by id) so a far-future
  // pending assignment outside the 14-day window still reaches
  // classifyEventUrgency — see usePendingUnconfirmedEvents.ts.
  const classifierSource = (() => {
    const base = backlogWindowEvents.length > 0 ? backlogWindowEvents : events;
    const seen = new Set(base.map(e => e.id));
    const extra = pendingUnconfirmedEvents.filter(e => !seen.has(e.id));
    return extra.length > 0 ? [...base, ...extra] : base;
  })();
  const { unassigned, myPending, coParentPending } = classifyEventUrgency(
    classifierSource, { id: active.id, name: active.name }, today,
  );
  // ActionNeededSection still renders 2 distinct card types (RideRequestCard
  // vs RideRequiredEventCard) — this split is purely about which card to
  // render, not which events are in-scope, so it stays here rather than
  // inside the classifier.
  const pendingRequests = unassigned.filter(e => e.category === 'Ride' && !e.rideRequired);
  // Also catches a non-Ride event with a real away-from-home location that
  // never had rideRequired explicitly flagged at creation (e.g. a Sports/
  // Study/Medical event created without ever typing a driver name) —
  // previously surfaced via AlertBanner's own unassignedUrgent escalation,
  // which this session's dedup removed; the only place left to notice it
  // was EventDetailSheet's helperMissing check, reactive only (a parent had
  // to already have the specific event open). RideRequiredEventCard already
  // writes rideRequired:true on any action taken from it regardless of
  // whether the flag was set going in, so it's safe to render for this case.
  //
  // Live-reported bug: a plain category:'Event' item with no location
  // (e.g. "Pick up kid from school" typed as a generic event, not a Ride)
  // that HAD a real helper assigned — then declined via "Can't" — fell
  // through both this filter and the Ride one above: category !== 'Ride',
  // rideRequired never got set (only ever written when a driver NAME is
  // typed at creation, not a helper), and location was never set either.
  // decline_event_assignment correctly cleared helper_name/helper_status
  // server-side, correctly landing the event in `unassigned`, but it then
  // rendered NOWHERE on either parent's Hub — an event that once had a
  // real assignee and lost it silently vanished instead of surfacing as
  // needing a new one. helperId/driverId are never cleared by the decline
  // RPC (only the *_name/*_status columns are), so a lingering id with no
  // name is a reliable signal "this slot was filled and is now open again"
  // — catch it here regardless of category/location.
  const pendingRideRequiredEvents = unassigned.filter(e =>
    e.rideRequired
    || (e.category !== 'Ride' && !!e.location && !isHomeLocation(e.location))
    || !!e.helperId || !!e.driverId
  );
  // pending_approval and pending_grandparent_approval both collapse to the
  // same client-side status (choreAdapter's choreStatusToQuestStatus) — a
  // grandparent_quest awaiting its sponsor's review must NOT show up in the
  // parent's own queue, that review belongs to the grandparent who created it.
  // Quest/chore approvals live ONLY in "Chore Reviews" (ParentReviewDeck) —
  // previously also duplicated here in "Action Needed" with a different
  // card design for the exact same item. actionCount below intentionally
  // excludes these; ChoreReviewSection's own badge covers them.

  // ── Conflict detection ────────────────────────────────────────────────────
  const conflictReasons = new Map<string, string>(); // eventId → reason label
  const upcomingEvents = todayEvents.filter(e => hoursUntilEvent(e.date, e.time) >= 0);

  // A: kid double-booked (same memberId, same date, <30 min, non-Work)
  const timedMemberEvents = upcomingEvents.filter(e => !!e.time && !!e.memberId);
  for (let i = 0; i < timedMemberEvents.length; i++) {
    for (let j = i + 1; j < timedMemberEvents.length; j++) {
      const a = timedMemberEvents[i], b = timedMemberEvents[j];
      if (a.memberId !== b.memberId) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const kidName = members.find(m => m.id === a.memberId)?.name.split(' ')[0] ?? 'Kid';
        const label = `${kidName} double-booked`;
        if (!conflictReasons.has(a.id)) conflictReasons.set(a.id, label);
        if (!conflictReasons.has(b.id)) conflictReasons.set(b.id, label);
      }
    }
  }

  // B: helper/driver double-booked — extracted to detectAssigneeConflicts.ts
  // so KidView can surface the same signal on a kid's own ride banner
  // (their driver being double-booked matters to them too, not just the
  // parent). Was raw e.helper-only — missed a conflict between two
  // driverName-paired (rideRequired) events, or one of each pair, since
  // only eventAssignee() checks both field pairs.
  for (const [id, label] of detectAssigneeConflicts(upcomingEvents)) {
    if (!conflictReasons.has(id)) conflictReasons.set(id, label);
  }

  // C + D: family event vs. a Work event (real, hand-typed OR auto-synced
  // from a connected calendar's FreeBusy blocks — see
  // calendar-freebusy-sync) — extracted to detectWorkConflicts so every
  // role's Hub view can show the same "conflicts with a parent's work"
  // signal, not just the parent Hub banner (live direction: "Kid's also
  // show on their card parent is conflict with work").
  const upcomingWorkEvents = workEvents.filter(e => hoursUntilEvent(e.date, e.time) >= 0);
  for (const [id, label] of detectWorkConflicts(upcomingEvents, upcomingWorkEvents, members)) {
    if (!conflictReasons.has(id)) conflictReasons.set(id, label);
  }

  // Other parents' Work events today, for the read-only coordination strip
  // on TodayView — never the viewer's own (they don't need to be told about
  // their own work block).
  const otherParentsWorkToday = workEvents
    .filter(e => e.memberId && e.memberId !== active.id)
    .map(e => ({
      id: e.id, title: e.title,
      time: e.time, ownerName: members.find(m => m.id === e.memberId)?.name.split(' ')[0] ?? 'Parent',
    }));

  const conflictEventIds = new Set(conflictReasons.keys());
  // conflictAcknowledged lets a parent dismiss a conflict that isn't
  // actually a problem (e.g. the same parent doing two nearby drop-offs
  // at the same time) — see AlertBanner's Dismiss action. Excluded here so
  // a dismissed cluster stops counting toward showBanner too, not just
  // rendering hidden.
  const conflictEvents = todayEvents.filter(e =>
    (e.conflict || conflictEventIds.has(e.id)) && !e.conflictAcknowledged
  );

  // Escalation: driver CONFIRMED, scheduled time already passed by 5+ min,
  // but no trip was ever dispatched for this pickup — a case neither
  // ActionNeededSection's pending/unassigned/rejected cards nor a plain
  // 'pending' status catch, since this ride went all the way to
  // "confirmed" and then nobody actually tapped Dispatch/En Route for it.
  // Invisible to every parent-facing escalation —
  // and to the OTHER parent specifically, since only the driving parent's
  // own device runs HubScreen's TripEffects overdue timer, and that timer
  // only exists once a trip row exists at all. The kid still gets a manual
  // "driver hasn't arrived" alert (KidUrgentAlerts) they can tap to send,
  // but nothing pushes to the parents automatically. Matches tripStore's
  // own 5-minute overdue grace window for consistency.
  // (Direct question: "does the app escalate if either side fails to
  // confirm" — this was the one path with no escalation on either side.)
  const activeTripDriverNames = new Set(
    [activeTrip, ...(otherActiveTrips ?? [])]
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map(t => t.driverName)
  );
  const neverDispatchedOverdue = todayEvents.filter(e => {
    const a = eventAssignee(e);
    if (!a.name || a.status !== 'confirmed' || e.approvalPending) return false;
    // Was missing entirely — a ride whose pickup was already confirmed
    // (kid or driver tapped "I'm picked up") still showed as "Trip Never
    // Started" forever, since this filter only ever checked assignment
    // status + elapsed time, never whether the pickup itself had already
    // happened. Live-reported/DB-confirmed: today's ride had a real
    // pickup_confirmed_at timestamp, yet the banner stayed stuck.
    if (e.pickupConfirmedAt) return false;
    if (e.tripAlertDismissedAt) return false; // manually dismissed via the banner's own Dismiss button
    if (activeTripDriverNames.has(a.name)) return false; // a trip IS running, just use the normal overdue path
    const h = hoursUntilEvent(e.date, e.time);
    return h < 0 && h > -1; // 1hr outer bound — auto-clears itself instead of lingering all day
  });

  const showBanner     = conflictEvents.length > 0 || neverDispatchedOverdue.length > 0;
  // Kids currently being picked up in an ACTIVE trip — a "my driver hasn't
  // arrived" alert for one of them is stale the moment a trip actually
  // starts, even though nobody tapped that card's own "I'm on my way"
  // button (the parent instead dispatched normally via Pickup Radar/
  // EnRouteBanner, a different action entirely). Reported live: starting
  // En Route for a kid left their "still waiting" card stuck in Action
  // Needed with no way to clear it short of the card's own button. If the
  // trip goes overdue, neverDispatchedOverdue/EnRouteBanner's own overdue
  // state picks it back up — this only suppresses the redundant alert
  // while a trip is genuinely in progress.
  const activeTripKidNames = new Set(
    [activeTrip, ...(otherActiveTrips ?? [])]
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map(t => t.kidName)
  );
  const pendingKidRequests = kidRequests.filter(r => {
    const rideLate = decodeRideLate(r.detail);
    if (rideLate) {
      const kidFirstName = members.find(m => m.id === r.fromMemberId)?.name.split(' ')[0];
      if (kidFirstName && activeTripKidNames.has(kidFirstName)) return false;
    }
    // Coordinated live-DB QA (Round 20, High) — a multi-item grocery/
    // supplies request transitions to 'partial' the moment any item is
    // decided while others remain undecided (kidRequestStore.ts's
    // approveItems/rejectItems). This filter only ever matched 'pending',
    // so a request with one genuinely still-open item vanished from BOTH
    // parents' Action Needed the instant the first item was decided — with
    // no history view on the parent side to ever find it again.
    if (!['pending', 'partial'].includes(r.status)) return false;
    // 'partial' is genuinely ambiguous — kidRequestStore.ts sets it both
    // for "some items still undecided" (still actionable) AND "every item
    // decided, but a mixed approve/reject outcome" (fully resolved, nothing
    // left to do). GroceryRequestCard's card never hides itself once
    // resolved (its header always reads "Pending" regardless), so a fully-
    // resolved mixed request sat in Action Needed forever (reported live —
    // parent approved 2 items, declined 1, card never left the list). Only
    // a request with at least one item still genuinely pending belongs here.
    if (r.status === 'partial' && (r.items?.length ?? 0) > 0 && !r.items!.some((it: any) => it.status === 'pending')) return false;
    // Auto-expire checkin requests older than 2 hours
    if (r.type === 'checkin') {
      const ageHours = (Date.now() - new Date(r.requestedAt).getTime()) / 3_600_000;
      if (ageHours > 2) return false;
    }
    // Hide grocery/supplies delegation cards that have no items — nothing
    // actionable to show. A cash-out request is ALSO type 'delegation' but
    // is plain text with no items by design (see TeenView's requestCashOut)
    // — this filter used to drop those silently before they ever reached
    // the parent's Action Needed feed at all.
    if (r.type === 'delegation' && (r.items?.length ?? 0) === 0 && !r.detail.startsWith('💵')) return false;
    return true;
  });
  // Approved ride/help requests still pending a helper — parent can flag these for GP
  const approvedRideRequests = kidRequests.filter(r =>
    r.status === 'approved' &&
    ['ride', 'tutor', 'cheer'].includes(r.type) &&
    !r.assignedHelper
  );
  // Runs through the exact same dedupeRideSeries helper ActionNeededSection
  // itself renders from — this badge count and the actual card list can no
  // longer structurally diverge (previously two independently-written
  // dedup passes that happened to agree today; the "12 pending, but only 3
  // cards" bug this could cause had already happened once).
  const [dedupedPendingForCount, dedupedRideRequiredForCount] =
    dedupeRideSeries(pendingRequests, pendingRideRequiredEvents);
  const actionCount = dedupedPendingForCount.length + dedupedRideRequiredForCount.length + pendingKidRequests.length;

  return {
    today, allTodayEvents, workEvents, todayEvents,
    unassigned, myPending, coParentPending,
    pendingRequests, pendingRideRequiredEvents,
    conflictReasons, upcomingEvents,
    otherParentsWorkToday,
    conflictEvents,
    neverDispatchedOverdue,
    showBanner,
    pendingKidRequests,
    approvedRideRequests,
    actionCount,
  };
}
