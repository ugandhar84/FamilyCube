/**
 * eventStore — production-grade calendar data layer
 *
 * Architecture:
 *  • Day detail  — full rows for one date, paginated (PAGE_SIZE = 30, cursor = start_time)
 *  • Strip map   — lightweight `date + category` only, for the day strip dot indicators
 *  • Prefetch    — adjacent ±1 day pre-loaded so swiping is instant
 *  • SWR cache   — stale-while-revalidate with per-entry TTL (day=5 min, strip=15 min)
 *  • Dedup       — in-flight request set; identical calls coalesce
 *  • Abort       — in-flight day requests cancelled when user changes date
 *  • Optimistic  — add/update/delete reflected instantly; rolled back on DB error
 *  • Realtime    — single Postgres Changes channel per family; updates strip + current day
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { logActivity, type ActivityAction } from '@/lib/activityLog';
import { showToast } from '@/components/AppToast';
import type { FamilyMember } from '@/store/familyStore';

// ── Public types ──────────────────────────────────────────────────────────────
export type EventType    = 'event' | 'reminder' | 'appointment' | 'birthday';
export type HelperStatus = 'pending' | 'confirmed' | 'rejected';

// Weekly-on-specific-weekdays is the primary real-world case this exists
// for (a school class or practice on Mon/Wed/Fri) — daily and monthly are
// supported too since they're simple variations of the same generator, but
// weekly+days is the one with actual UI for picking which days. 0 = Sunday,
// matching Date.getDay().
export interface EventRecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  days?: number[];      // weekly only — which weekdays (0=Sun..6=Sat), e.g. [1,3,5] for Mon/Wed/Fri
  endDate?: string;      // 'YYYY-MM-DD' — repeat until (and including) this date; omitted = no end date
  occurrences?: number;  // alternative to endDate — repeat this many times total, then stop
}

export interface FamilyEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  // Lifecycle status of the event itself — distinct from helperStatus/
  // driverStatus (a participant's assignment status) and from the
  // pre-existing DB `status` column (an unrelated approval-workflow value,
  // always 'approved' today — this maps to completion_status instead to
  // avoid colliding with it). Flips to 'completed' automatically once the
  // event is over (end_time, or start_time + 1h if no end_time is set) via
  // the event-completion-sweep cron job — never set directly by client
  // code today.
  completionStatus?: 'scheduled' | 'completed';
  memberId?: string;
  memberIds?: string[];
  type: EventType;
  color?: string;
  location?: string;
  notes?: string;
  allDay?: boolean;
  category?: string;
  helper?: string;
  // Real member id for the helper assignment — compare against THIS, never
  // against `helper` (a display-name string), for "is this assigned to
  // me" checks. helper stays as the display string (also covers an
  // external non-member helper with no id). Undefined for such an
  // external helper, or when no helper is assigned at all.
  helperId?: string;
  helperStatus?: HelperStatus;
  declineReason?: string;
  declinedBy?: string;
  helperRequestedBy?: string;
  pickupLocation?: string;
  dropLocation?: string;
  returnTime?: string;
  doctorName?: string;
  subject?: string;
  coachName?: string;
  conflict?: boolean;
  // A parent dismissed a scheduling-conflict alert for this event as not
  // actually a problem (e.g. the same parent doing two nearby drop-offs
  // at the same time) — see AlertBanner's Dismiss action. Distinct from
  // `conflict` above (a separate, currently client-unwritten column).
  conflictAcknowledged?: boolean;
  // Manual dismiss for the Hub's "Trip Never Started" banner
  // (neverDispatchedOverdue in ParentView.tsx), alongside its existing
  // 1-hour auto-clear — per-occurrence (this row only), not per-series, so
  // dismissing today's overdue banner on a recurring event doesn't
  // suppress tomorrow's.
  tripAlertDismissedAt?: string;
  tripAlertDismissedBy?: string;
  approvalPending?: boolean;
  isOpenToGrandparents?: boolean;
  grandparentPassedIds?: string[];  // seniors who tapped Pass — hidden from their feed
  teenPassedIds?: string[];         // teens who tapped Pass — hidden from their own pool, symmetric with grandparentPassedIds
  isOpenToTeens?: boolean;          // parent flag — shows in teen Junior Dispatch pool
  rideCoins?: number;               // optional coins reward set by parent — visible to teens only, never GPs

  // Drive assignment — separate from `helper` (tutor/escort/coach) for events
  // where an external tutor/escort/coach can be set while transport is a
  // distinct, parent-decided need (e.g. Ms. Rao tutors, Dad drives).
  rideRequired?: boolean;
  driverName?: string;
  // Real member id for the driver assignment — same rationale as helperId
  // above. Undefined for an external non-member driver, or when no driver
  // is assigned.
  driverId?: string;
  driverStatus?: HelperStatus;

  // A both-ways ride request forks into 2 fully independent rows (Drop-off
  // leg + Pickup leg, see rideLegs.ts's forkRideLegs) — this points each
  // leg at the other's id, so any card rendering just one leg can show a
  // "paired with the other leg" indicator instead of looking like an
  // unrelated one-off event (QA sweep UI pass, High Finding #4).
  linkedLegId?: string;

  // A ride request previously fell through to ordinary sibling visibility
  // — "All" on a kid/teen's Schedule tab showed every sibling's ride
  // request (pickup location, timing, notes) with no way to turn that off.
  // A ride is between the requesting kid and their parent, not something a
  // sibling should see by default, unless a parent has actually delegated
  // a helping/driving role to that sibling (explicit user direction).
  // Parent-settable opt-in, same shape as sharedWithGPForCare below.
  sharedWithSiblings?: boolean;

  // "Helper confirmed" (helperStatus === 'confirmed') only means the driver
  // agreed to do the run — it says nothing about whether the pickup actually
  // happened. This is that separate, later signal: either the rider or the
  // driver can set it, whichever acts first.
  pickupConfirmedAt?: string;
  pickupConfirmedBy?: string;

  // Audit trail — who created/last-edited/deleted this event, and when.
  // For triage/reference, not shown as primary UI; updatedBy/updatedAt are
  // stamped explicitly in updateEvent() rather than trigger-maintained, so
  // a bulk/system sync can choose not to touch them.
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  deletedBy?: string;

  // Call-style reminder — opt-in per event, same pattern as ChoreTask.
  // Fires a ringing (CallKit) alert to memberId/memberIds this many minutes
  // before `time`. 0 = "on time".
  alertCall?: boolean;
  alertCallLeadMinutes?: number;

  // Recurrence — materialized-rows model (see the migration comment in
  // supabase/migrations/*_calendar_events_recurrence.sql). seriesId links
  // every occurrence generated from the same recurring event; it's the
  // first-created occurrence's own id, reused as the anchor. recurrenceRule
  // is only ever populated on the anchor row (isSeriesAnchor === true) —
  // other occurrences carry seriesId to be findable/editable-as-a-series
  // but don't duplicate the rule itself.
  seriesId?: string;
  recurrenceRule?: EventRecurrenceRule;
  isSeriesAnchor?: boolean;

  // Multi-member attendee acknowledgment — memberIds of everyone (other
  // than the named driver/helper, which already has its own full accept/
  // decline flow via EventAssignmentCard-equivalent status fields) who has
  // tapped "Acknowledge" to confirm they've seen this event and know
  // they're attending. Purely informational, no accept/decline branching —
  // a plain attendee doesn't own the event the way a driver does.
  acknowledgedBy?: string[];

  // ── Privacy/sensitivity tagging (scenarios 2.6, 2.10, 5.4, 5.5) ──────────
  // 'normal' (default) — visible per the ordinary assignee/family-wide
  // rules everywhere already in place.
  // 'private' — an explicit privacy tag (2.6 medical appointment, 5.4 a
  // teen's own social plan) OR implicitly true for any Medical-category
  // event even without the toggle (5.5's "medical defaults to minimal
  // necessary exposure" rule) — see isEventSensitive() below, which is the
  // ONE place every visibility filter in the app should call rather than
  // re-deriving this condition ad hoc. When sensitive: both parents and the
  // subject (memberId/memberIds) always see full detail; siblings (any
  // other kid/teen) are hidden entirely; GP sees a busy-block only (no
  // title/notes/doctorName) UNLESS explicitly shared for a specific
  // caregiving occasion via sharedWithGPForCare.
  // Named privacyLevel, not "sensitivity" — calendar_events already has an
  // unrelated `sensitivity` DB column (Responsibility Engine fairness/
  // effort scoring, a 4-value enum) from a much earlier migration; this is
  // a deliberately distinct field/column to avoid colliding with it.
  privacyLevel?: 'normal' | 'private';
  // 5.5's caregiver-mode override — a parent explicitly shares ONE private/
  // medical event with GP for a specific occasion (e.g. GP is babysitting
  // and needs the medication schedule) without lifting privacy generally.
  sharedWithGPForCare?: boolean;

  // ── RSVP / attendance confirmation (scenario 2.11) ───────────────────────
  // Genuinely distinct from acknowledgedBy above — RSVP needs a real
  // Going/Not-Going/Maybe headcount signal for an OPTIONAL group event
  // (e.g. "cousin's graduation party"), which a binary "I've seen this"
  // acknowledge can't express. Only meaningful when isOptionalRsvp is set
  // by the creator; a mandatory logistics event (a ride, a doctor's
  // appointment) keeps using acknowledgedBy/driver-accept as before — this
  // is additive, not a replacement.
  isOptionalRsvp?: boolean;
  // memberId → response. Only present for members who have actually
  // responded — someone invited but silent simply has no key here (renders
  // as "awaiting" rather than defaulting to any particular answer).
  rsvps?: Record<string, 'going' | 'not_going' | 'maybe'>;
  // Set only when this event's last change came from an inbound
  // personal-calendar sync (calendar-webhook-google/outlook) — powers a
  // small "updated from Google/Outlook" indicator on the event card.
  // Undefined for an event that's never had an inbound sync apply to it.
  lastExternalSyncAt?: string;
  lastExternalSyncProvider?: 'google' | 'outlook' | 'apple';
  // The connected account's own email (e.g. "priya@gmail.com") — more
  // specific than the provider alone once someone can connect the same
  // provider twice (a work Gmail and a separate personal Gmail). Live-
  // requested: "we can show alias name of that account."
  lastExternalSyncAccount?: string;
  // Live-requested: the "synced from X" badge should show a real provider
  // icon + the FAMILY MEMBER's initials (e.g. "UN" for Ugandhar), not a
  // raw email — resolved client-side from this id via FamilyAvatar's own
  // initials logic. Also the only "whose" signal Apple sync has at all,
  // since a device-local EventKit calendar has no email/account concept.
  lastExternalSyncMemberId?: string;
}

// Scenario 5.5 generalizes 2.6's rule to "any medical/health-tagged item,"
// so a Medical-category event is treated as sensitive even if the creator
// never touched the explicit privacy toggle — the two conditions OR
// together rather than requiring both.
// Ride requests count as sensitive too — see sharedWithSiblings above for
// why. Needs rideRequired/category alongside the existing checks, so the
// Pick type widens to match.
// `members` is optional (defaults to skipping the kid/teen-default-private
// check when unavailable) so every existing call site keeps compiling —
// pass it wherever the caller already has the family's member list handy,
// same list the RLS-mirroring rule at the database level (migration
// 20260930510000) checks against, so client and server logic agree.
export function isEventSensitive(
  e: Pick<FamilyEvent, 'privacyLevel' | 'category' | 'rideRequired' | 'memberId' | 'memberIds'>,
  members?: Pick<FamilyMember, 'id' | 'role'>[],
): boolean {
  if (e.privacyLevel === 'private' || e.category === 'Medical' || e.category === 'Ride' || !!e.rideRequired) return true;
  // A kid/teen's own single-subject personal event defaults to sensitive
  // too — same "you shouldn't have to remember to ask for privacy"
  // principle already applied to parent-owned chores/events earlier this
  // session, extended to the other side of the family.
  if (members && e.memberId && !(e.memberIds?.length)) {
    const subject = members.find(m => m.id === e.memberId);
    if (subject?.role === 'kid' || subject?.role === 'teen') return true;
  }
  return false;
}

// A category:'Ride' event's assignee lives in helper/helperStatus. A
// rideRequired event on any OTHER category (Sports/Study/Medical/etc,
// created with a driver need — see EventFormModal's kidRideNeeded/
// driverName paths) lives in the separate driverName/driverStatus pair
// instead. Every role-specific Hub surface (SeniorView, TeenView,
// KidView, ParentView's backlog, the shared EventDetailSheet) was built
// reading ONLY helper/helperStatus, so a rideRequired event's assignee was
// completely invisible everywhere except the parent-only
// RideRequiredEventCard that creates it — the assigned driver had no
// confirm/decline surface anywhere, and the event stayed advertised as
// open to every other candidate indefinitely since their pool filters
// never saw a driver had already been named (QA Round 11, Critical
// Finding C2). This normalizes both field pairs into one shape so a
// filter/component only has to check one thing.
export function eventAssignee(e: Pick<FamilyEvent, 'helper' | 'helperId' | 'helperStatus' | 'driverName' | 'driverId' | 'driverStatus'>): {
  name: string | undefined;
  // Real member id, when the assignee is a real family member (undefined
  // for an external non-member name typed into the free-text fallback).
  // "Is this assigned to ME" checks (e.g. classifyEventUrgency.ts) must
  // compare id-to-id, never name-to-name — a name-string compare is
  // fragile (a rename, two members sharing a first name, or any drift
  // between what's stored and a member's current display name all break
  // it silently) and was never the intended design; it only existed
  // because calendar_events had no id column for driver/helper until
  // migration 20260930240000 added one.
  id: string | undefined;
  status: HelperStatus | undefined;
} {
  if (e.helper) return { name: e.helper, id: e.helperId, status: e.helperStatus };
  if (e.driverName) return { name: e.driverName, id: e.driverId, status: e.driverStatus };
  return { name: undefined, id: undefined, status: undefined };
}

// Scenario 2.6/5.4/5.5 — the single shared visibility predicate every
// calendar/hub surface should call for a sensitive event, instead of each
// screen re-deriving its own version of "am I allowed to see this."
//
// Live QA audit found the previous plain-boolean version was consumed
// identically to a hard include/exclude filter at all 4 call sites — the
// promised "GP sees a busy block, not nothing" behavior (the actual UI copy
// in EventFormModal says exactly this) was never implemented; a GP with
// `sharedWithGPForCare` unset just had the event vanish from their calendar
// entirely, same as an uninvolved sibling kid/teen, risking a real-world
// double-booked pickup since they had no signal the slot was occupied at
// all. Now a real 3-state result so callers can tell the two "false" cases
// apart: 'full' (render normally), 'busy-block' (render a stripped
// placeholder — no title/notes/doctorName, just that the time is taken),
// 'hidden' (omit entirely, unchanged for kid/teen siblings).
export type SensitiveEventVisibility = 'full' | 'busy-block' | 'hidden';

export function canViewSensitiveEventDetail(
  e: Pick<FamilyEvent, 'memberId' | 'memberIds' | 'sharedWithGPForCare' | 'sharedWithSiblings' | 'helper' | 'driverName'>,
  viewerRole: 'parent' | 'kid' | 'teen' | 'senior' | undefined,
  viewerId: string | undefined,
  // Needed to match helper/driverName (display-name fields, not ids)
  // against the viewer — optional so existing call sites that only pass
  // an id still compile; those simply don't get the assignee carve-out.
  viewerName?: string,
): SensitiveEventVisibility {
  if (viewerRole === 'parent') return 'full'; // both legal guardians always see full detail
  const isSubject = !!viewerId && (e.memberId === viewerId || !!e.memberIds?.includes(viewerId));
  if (isSubject) return 'full'; // never hidden from the person it's about
  // The person actually asked to drive/help must see what they're driving
  // TO — this predicate previously only ever considered the event's
  // SUBJECT, never who was assigned to it, so a GP asked to drive a
  // grandchild to a Medical appointment got a mystery busy-block with no
  // address, same class of gap the parent_only_quest fix closed for
  // chores earlier this session (QA Round 9, Medium Finding 5).
  const isAssignee = !!viewerName && (e.helper === viewerName || e.driverName === viewerName);
  if (isAssignee) return 'full';
  if (viewerRole === 'senior') return e.sharedWithGPForCare ? 'full' : 'busy-block'; // GP: busy-block unless explicitly shared
  // Sibling kid/teen: hidden by default (a sibling's ride request or
  // private/Medical event is between them and their parent), UNLESS a
  // parent has explicitly delegated by flipping sharedWithSiblings — the
  // path for "parent asks an older sibling to help with a younger one's
  // ride." No busy-block carve-out here (unlike GP) — a sibling doesn't
  // need "someone's busy at this time" awareness the way a GP driving
  // pool coordinator does.
  return e.sharedWithSiblings ? 'full' : 'hidden';
}

export type StripMap = Record<string, string[]>;   // date → unique category[]

// One lightweight row per event, kept alongside stripMap so the month
// grid's dots can be re-filtered per member entirely client-side (no
// re-fetch) when the "All Family / Alex / Maya / ..." chip changes —
// stripMap itself stays family-wide/unfiltered as the base data.
export interface StripRow { date: string; category: string; memberId?: string; helper?: string; driverName?: string; }

// ── Cache entry ───────────────────────────────────────────────────────────────
interface DayCacheEntry {
  events:    FamilyEvent[];
  cursor:    string | null;  // last start_time seen; null = all loaded
  hasMore:   boolean;
  fetchedAt: number;         // Date.now()
}

// ── Store shape ───────────────────────────────────────────────────────────────
interface EventState {
  // Current day
  currentDate: string;
  dayEvents:   FamilyEvent[];
  dayLoading:  boolean;
  hasMore:     boolean;        // more pages exist for currentDate

  // Strip
  stripMap:     StripMap;
  stripRows:    StripRow[];
  stripLoading: boolean;

  // In-memory SWR cache (date → entry)
  _dayCache: Record<string, DayCacheEntry>;

  // Range fetch (Week/Agenda views) — full rows across a date span, not
  // paginated like day detail since these windows (a week, a few upcoming
  // weeks) are small. Keyed by "from:to" so Week and Agenda's differently-
  // sized windows don't thrash a single shared cache slot.
  rangeEvents:  FamilyEvent[];
  rangeLoading: boolean;
  _rangeCache:  Record<string, { events: FamilyEvent[]; fetchedAt: number }>;

  // Legacy alias used by CalendarScreen without changes
  events: FamilyEvent[];
  loaded: boolean;

  // API
  selectDate:    (date: string, force?: boolean) => Promise<void>;
  loadMoreDay:   () => Promise<void>;
  loadStrip:     (dates: string[]) => Promise<void>;
  loadRange:     (from: string, to: string, force?: boolean) => Promise<void>;
  prefetchDate:  (date: string) => void;

  // Compat shims
  loadFromStorage: (force?: boolean) => Promise<void>;
  syncFromDB:      () => Promise<void>;

  // Mutations (optimistic)
  addEvent:    (e: Omit<FamilyEvent, 'id'>) => Promise<string>;
  updateEvent: (id: string, updates: Partial<FamilyEvent>) => Promise<void>;
  deleteEvent: (id: string) => void;

  // Creates a recurring event: the first occurrence (on `first.date`) plus
  // every future occurrence implied by `rule`, materialized as real rows up
  // to a rolling window (see generateOccurrenceDates's own comment for why
  // a window instead of generating to endDate/occurrences all at once).
  // Returns the id of the first (anchor) occurrence.
  addRecurringEvent: (first: Omit<FamilyEvent, 'id'>, rule: EventRecurrenceRule) => Promise<string>;

  // Extends an existing series' materialized rows further into the future —
  // call periodically (e.g. on Calendar tab focus) so an ongoing "every
  // Mon/Wed/Fri" class always has upcoming occurrences visible, not just
  // whatever existed at creation time.
  extendRecurringSeries: (seriesId: string) => void;

  // Edit/delete scope for a recurring occurrence — mirrors the standard
  // calendar UX choice ("This event" / "This and following" / "All events").
  updateEventScoped: (id: string, updates: Partial<FamilyEvent>, scope: 'this' | 'following' | 'all') => void;
  deleteEventScoped: (id: string, scope: 'this' | 'following' | 'all') => void;

  // Race-safe claim of an open helper/driver slot (GP "I'll Drive" on an
  // isOpenToGrandparents ride, Teen "I'll take it" on an isOpenToTeens
  // pickup, etc.) — see claimHelperSlot's own comment for why this can't
  // just be a plain updateEvent() call.
  claimHelperSlot: (
    id: string,
    role: 'helper' | 'driver',
    claimantName: string,
    extra?: Partial<FamilyEvent>,
    onWon?: () => void,
    // Fires when the DB write itself is rejected (not the same as losing
    // the claim race) — e.g. the server-side weekly ride cap trigger. The
    // caller can surface this as a real message instead of the claim
    // silently rolling back with no explanation.
    onError?: (message: string) => void,
  ) => void;

  // Scenario 2.11 — a member's Going/Not-Going/Maybe response to an
  // isOptionalRsvp event. Plain optimistic + DB write (no CAS needed — an
  // RSVP is a per-member key in a shared map, so two different members
  // responding concurrently can't collide, and one member re-responding is
  // just overwriting their own prior answer, not racing anyone else).
  respondToRsvp: (id: string, memberId: string, response: 'going' | 'not_going' | 'maybe') => void;

  // Single shared "reassign this event's driver/helper to someone else"
  // action — was independently hand-duplicated in HelperEventCard.tsx,
  // RideRequiredEventCard.tsx, and EventDetailSheet (hubComponents.tsx),
  // each calling the reassign_event RPC and then GUESSING the resulting
  // local patch instead of re-reading the real row, and each with its own
  // slightly different copy of the same comments/bugs. Any one of the
  // three could drift from the others (exactly the "why does the Hub
  // still show the old assignee after I reassigned from Schedule" class
  // of report). One function, one re-fetch, used everywhere.
  reassignEvent: (eventId: string, newMemberId: string, role: 'driver' | 'helper', actorId: string) => Promise<boolean>;

  // Same consolidation as reassignEvent, for the OTHER two duplicated
  // event-assignment actions — confirmEventAssignment was independently
  // hand-copied in HelperEventCard.tsx (using the series-forward RPC
  // variant), EventDetailSheet/YourRidesSection/TeenView (all three using
  // the plain single-event variant instead) — meaning confirming the
  // SAME kind of assignment behaved differently (propagated through a
  // recurring series, or didn't) purely depending on which screen you
  // happened to tap Confirm from. This function makes that choice ONCE,
  // consistently, based on whether the event actually has a seriesId —
  // every caller gets the same behavior automatically.
  confirmEventAssignment: (eventId: string, memberId: string, role: 'driver' | 'helper') => Promise<boolean>;
  declineEventAssignment: (eventId: string, memberId: string, role: 'driver' | 'helper', reason?: string) => Promise<boolean>;

  // Live-caught: the "Remind" button (both HelperEventCard.tsx and
  // EventDetailSheet) only ever showed a "Reminder sent ✓" toast — no
  // push, no chat message, nothing actually sent to anyone. Pure UI
  // theater, copied from one file into the other without either ever
  // having been wired to a real notification. This sends an actual
  // family-notifier push+persisted nudge to the pending assignee.
  remindEventAssignee: (eventId: string, assigneeId: string, assigneeName: string, fromMemberId: string) => Promise<boolean>;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZE   = 30;           // events per page within a day
const DAY_TTL_MS  = 5 * 60_000;  // 5 min — revalidate day cache
const STRIP_TTL_MS = 15 * 60_000; // 15 min — revalidate strip cache

const DISK_STRIP  = '@fc_strip_v1';
const DISK_DAY    = '@fc_day_v1';  // stores { date, events } for last-viewed day

// ── In-flight deduplication ───────────────────────────────────────────────────
const _inFlight = new Set<string>();           // keys: 'day:YYYY-MM-DD', 'strip:from:to'
let   _dayAbort: AbortController | null = null; // cancel stale day request on date change

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFamilyId(): string | null {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const s = useFamilyStore.getState();
    const m = s.members.find((m: any) => m.id === s.activeMemberId) ?? s.members[0];
    return (m as any)?.familyId ?? null;
  } catch { return null; }
}

// Same reach-into-useFamilyStore pattern as getFamilyId() above — checks
// whether a specific member has opted into Apple/EventKit 2-way sync
// (off by default) before ever touching the device calendar on their behalf.
function isAppleCalendarSyncEnabled(memberId: string): boolean {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const s = useFamilyStore.getState();
    const m = s.members.find((mem: any) => mem.id === memberId);
    return !!(m as any)?.appleCalendarSyncEnabled;
  } catch { return false; }
}

// Same reach-into-useFamilyStore pattern as getFamilyId() above — avoids
// threading an actor id through every addEvent/updateEvent/deleteEvent call
// site across the app just to stamp who made the change.
function getActiveMemberId(): string | null {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const s = useFamilyStore.getState();
    return s.activeMemberId ?? s.members[0]?.id ?? null;
  } catch { return null; }
}

// ─── Ride/driver assignment notifications ──────────────────────────────────────
// updateEvent is the single place every driver/helper assignment change flows
// through (offer, accept, decline) — previously the only signal anyone got
// was a chat message on decline; assignment/reassignment and acceptance sent
// nothing, and the requesting kid was never told once a ride was actually
// locked in. Routes through the same family-notifier pipeline as every other
// real notification (rewardStore/helpStore/choreStore), best-effort, never
// blocking the actual event update.
function memberById(memberId: string | undefined | null): { id: string; name: string; role: string } | null {
  if (!memberId) return null;
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const m = useFamilyStore.getState().members.find((mm: any) => mm.id === memberId);
    return m ? { id: m.id, name: m.name, role: m.role } : null;
  } catch { return null; }
}

// "Other parents" for a ride ping-pong — every parent in the family besides
// the actor themselves. Mirrors hubComponents.tsx's own
// `members.filter(m => m.role === 'parent' && ...)` pattern for resolving
// co-parents.
function otherParentIds(excludeIds: (string | null | undefined)[]): string[] {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const members = useFamilyStore.getState().members as any[];
    const exclude = new Set(excludeIds.filter(Boolean) as string[]);
    return members.filter(m => m.role === 'parent' && !exclude.has(m.id)).map(m => m.id);
  } catch { return []; }
}

function notifyRideAssignment(
  type: 'ride_assignment_offered' | 'ride_assignment_accepted' | 'ride_assignment_declined' | 'ride_confirmed_for_kid' | 'ride_pool_opened',
  memberIds: string[],
  excludeMemberId: string | null,
  payload: Record<string, unknown>,
) {
  const familyId = getFamilyId();
  const recipients = memberIds.filter(id => id && id !== excludeMemberId);
  if (!familyId || !recipients.length) return;
  supabase.functions.invoke('family-notifier', {
    body: {
      type, familyId, memberIds: recipients, payload, persist: true,
      excludeMemberId: excludeMemberId ?? undefined,
    },
  }).catch(e => console.warn('[eventStore] ride notify failed:', e?.message));
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Diffs a small set of user-meaningful fields between the pre-update event
// and what actually changed, logging one activity_log row per field —
// deliberately NOT a generic "log every prop" diff, since most of
// FamilyEvent's ~80 columns changing would be noise nobody wants to read
// in a history sheet. Covers exactly what the user asked to see: date/
// time, recurrence, driver/helper assignment, GP/Teen welcome, notes.
function logUpdateActivity(prevEvent: FamilyEvent, updates: Partial<FamilyEvent>, updated: FamilyEvent) {
  const familyId = getFamilyId();
  const actorId = updated.updatedBy ?? getActiveMemberId();
  const push = (action: ActivityAction, field: string, oldValue: unknown, newValue: unknown, note?: string) => {
    logActivity({
      entityType: 'event', entityId: updated.id, familyId, actorId, action, field,
      oldValue: oldValue == null ? null : String(oldValue),
      newValue: newValue == null ? null : String(newValue),
      note,
    });
  };

  if ('date' in updates && updates.date !== prevEvent.date) push('date_changed', 'date', prevEvent.date, updated.date);
  if ('time' in updates && updates.time !== prevEvent.time) push('time_changed', 'time', prevEvent.time, updated.time);
  if ('recurrenceRule' in updates) {
    if (updates.recurrenceRule && !prevEvent.recurrenceRule) push('recurrence_changed', 'recurrenceRule', null, JSON.stringify(updates.recurrenceRule));
    else if (!updates.recurrenceRule && prevEvent.recurrenceRule) push('recurrence_cancelled', 'recurrenceRule', JSON.stringify(prevEvent.recurrenceRule), null);
    else if (updates.recurrenceRule) push('recurrence_changed', 'recurrenceRule', JSON.stringify(prevEvent.recurrenceRule), JSON.stringify(updates.recurrenceRule));
  }
  if ('helper' in updates && updates.helper !== prevEvent.helper) {
    push(!prevEvent.helper ? 'driver_assigned' : !updates.helper ? 'driver_removed' : 'driver_reassigned', 'helper', prevEvent.helper, updated.helper);
  }
  if ('driverName' in updates && updates.driverName !== prevEvent.driverName) {
    push(!prevEvent.driverName ? 'driver_assigned' : !updates.driverName ? 'driver_removed' : 'driver_reassigned', 'driverName', prevEvent.driverName, updated.driverName);
  }
  if ('isOpenToGrandparents' in updates && updates.isOpenToGrandparents !== prevEvent.isOpenToGrandparents) {
    push('gp_welcome_changed', 'isOpenToGrandparents', prevEvent.isOpenToGrandparents, updated.isOpenToGrandparents);
  }
  if ('isOpenToTeens' in updates && updates.isOpenToTeens !== prevEvent.isOpenToTeens) {
    push('teen_welcome_changed', 'isOpenToTeens', prevEvent.isOpenToTeens, updated.isOpenToTeens);
  }
  if ('notes' in updates && updates.notes !== prevEvent.notes) push('notes_changed', 'notes', prevEvent.notes, updated.notes);
}

function sortByTime(evs: FamilyEvent[]): FamilyEvent[] {
  return [...evs].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
}

export function fromRow(row: any): FamilyEvent {
  return {
    id:                row.id,
    title:             row.title,
    date:              String(row.date ?? '').slice(0, 10),
    time:              row.start_time ?? undefined,
    endTime:           row.end_time ?? undefined,
    completionStatus:  row.completion_status ?? 'scheduled',
    allDay:            row.all_day ?? false,
    type:              row.type ?? 'event',
    category:          row.category ?? 'Event',
    color:             row.color ?? undefined,
    memberId:          row.member_id ?? undefined,
    memberIds:         row.member_ids ?? undefined,
    location:          row.location ?? undefined,
    notes:             row.notes ?? undefined,
    helper:            row.helper_name ?? undefined,
    helperId:          row.helper_id ?? undefined,
    helperStatus:      row.helper_status ?? undefined,
    helperRequestedBy: row.helper_requested_by ?? undefined,
    declineReason:     row.helper_decline_reason ?? undefined,
    declinedBy:        row.helper_declined_by ?? undefined,
    doctorName:        row.doctor_name ?? undefined,
    subject:           row.subject ?? undefined,
    coachName:         row.coach_name ?? undefined,
    pickupLocation:    row.pickup_location ?? undefined,
    dropLocation:      row.drop_location ?? undefined,
    approvalPending:        row.approval_pending ?? false,
    conflict:               row.conflict ?? false,
    conflictAcknowledged:   row.conflict_acknowledged ?? false,
    tripAlertDismissedAt:   row.trip_alert_dismissed_at ?? undefined,
    tripAlertDismissedBy:   row.trip_alert_dismissed_by ?? undefined,
    isOpenToGrandparents:   row.is_open_to_grandparents ?? false,
    grandparentPassedIds:   row.grandparent_passed_ids ?? [],
    teenPassedIds:          row.teen_passed_ids ?? [],
    isOpenToTeens:          row.is_open_to_teens ?? false,
    rideCoins:              row.ride_coins ?? undefined,
    rideRequired:           row.ride_required ?? false,
    driverName:             row.driver_name ?? undefined,
    driverId:               row.driver_id ?? undefined,
    driverStatus:           row.driver_status ?? undefined,
    pickupConfirmedAt:      row.pickup_confirmed_at ?? undefined,
    pickupConfirmedBy:      row.pickup_confirmed_by ?? undefined,
    createdBy:              row.created_by ?? undefined,
    createdAt:              row.created_at ?? undefined,
    updatedBy:              row.updated_by ?? undefined,
    updatedAt:              row.updated_at ?? undefined,
    deletedBy:              row.deleted_by ?? undefined,
    alertCall:              row.alert_call ?? false,
    alertCallLeadMinutes:   row.alert_call_lead_minutes ?? 10,
    seriesId:               row.series_id ?? undefined,
    recurrenceRule:         (typeof row.recurrence_rule === 'object' && row.recurrence_rule) ? row.recurrence_rule : undefined,
    isSeriesAnchor:         row.is_series_anchor ?? false,
    acknowledgedBy:         Array.isArray(row.acknowledged_by) ? row.acknowledged_by : [],
    privacyLevel:           row.privacy_level === 'private' ? 'private' : 'normal',
    sharedWithGPForCare:    row.shared_with_gp_for_care ?? false,
    sharedWithSiblings:     row.shared_with_siblings ?? false,
    isOptionalRsvp:         row.is_optional_rsvp ?? false,
    rsvps:                  (typeof row.rsvps === 'object' && row.rsvps) ? row.rsvps : undefined,
    // Set by calendar-webhook-google/outlook whenever a personal-calendar
    // inbound sync auto-applies a change from that provider — powers a
    // "from Google/Outlook" indicator on the event card (live-requested:
    // "Show on the email indicator that it is coming from where").
    lastExternalSyncAt:       row.last_external_sync_at ?? undefined,
    lastExternalSyncProvider: row.last_external_sync_provider ?? undefined,
    lastExternalSyncAccount: row.last_external_sync_account ?? undefined,
    lastExternalSyncMemberId: row.last_external_sync_member_id ?? undefined,
    linkedLegId:            row.linked_leg_id ?? undefined,
  };
}

function toRow(ev: FamilyEvent): Record<string, unknown> {
  return {
    id:                    ev.id,
    family_id:             getFamilyId(),
    title:                 ev.title,
    date:                  ev.date,
    start_time:            ev.time ?? null,
    end_time:              ev.endTime ?? null,
    all_day:               ev.allDay ?? false,
    type:                  ev.type,
    category:              ev.category ?? 'Event',
    color:                 ev.color ?? null,
    member_id:             ev.memberId ?? null,
    member_ids:            ev.memberIds ?? [],
    location:              ev.location ?? null,
    notes:                 ev.notes ?? null,
    helper_name:           ev.helper ?? null,
    helper_id:             ev.helperId ?? null,
    helper_status:         ev.helperStatus ?? null,
    helper_requested_by:   ev.helperRequestedBy ?? null,
    helper_decline_reason: ev.declineReason ?? null,
    helper_declined_by:    ev.declinedBy ?? null,
    doctor_name:           ev.doctorName ?? null,
    subject:               ev.subject ?? null,
    coach_name:            ev.coachName ?? null,
    pickup_location:       ev.pickupLocation ?? null,
    drop_location:         ev.dropLocation ?? null,
    approval_pending:           ev.approvalPending ?? false,
    conflict:                   ev.conflict ?? false,
    conflict_acknowledged:      ev.conflictAcknowledged ?? false,
    trip_alert_dismissed_at:    ev.tripAlertDismissedAt ?? null,
    trip_alert_dismissed_by:    ev.tripAlertDismissedBy ?? null,
    is_open_to_grandparents:    ev.isOpenToGrandparents ?? false,
    grandparent_passed_ids:     ev.grandparentPassedIds ?? [],
    teen_passed_ids:            ev.teenPassedIds ?? [],
    is_open_to_teens:           ev.isOpenToTeens ?? false,
    ride_coins:                 ev.rideCoins ?? null,
    ride_required:              ev.rideRequired ?? false,
    driver_name:                ev.driverName ?? null,
    driver_id:                  ev.driverId ?? null,
    driver_status:              ev.driverStatus ?? null,
    pickup_confirmed_at:        ev.pickupConfirmedAt ?? null,
    pickup_confirmed_by:        ev.pickupConfirmedBy ?? null,
    created_by:                 ev.createdBy ?? null,
    created_at:                 ev.createdAt ?? null,
    updated_by:                 ev.updatedBy ?? null,
    updated_at:                 ev.updatedAt ?? null,
    deleted_by:                 ev.deletedBy ?? null,
    alert_call:                 ev.alertCall ?? false,
    alert_call_lead_minutes:    ev.alertCallLeadMinutes ?? 10,
    // start_time is a local wall-clock value with no offset of its own —
    // calendar_events.timezone existed as a column but was never populated
    // by the app, silently defaulting to 'UTC'. call-reminder-sweeper (a
    // Deno edge function running in UTC) parsed it as if it WERE UTC, so
    // any family not literally in UTC got the wrong absolute ring time —
    // see the matching, more detailed comment in choreStore.ts's addChore.
    timezone:                   Intl.DateTimeFormat().resolvedOptions().timeZone,
    series_id:                  ev.seriesId ?? null,
    recurrence_rule:            ev.recurrenceRule ?? null,
    is_series_anchor:           ev.isSeriesAnchor ?? false,
    acknowledged_by:            ev.acknowledgedBy ?? [],
    privacy_level:              ev.privacyLevel ?? 'normal',
    shared_with_gp_for_care:    ev.sharedWithGPForCare ?? false,
    shared_with_siblings:       ev.sharedWithSiblings ?? false,
    is_optional_rsvp:           ev.isOptionalRsvp ?? false,
    rsvps:                      ev.rsvps ?? {},
    linked_leg_id:              ev.linkedLegId ?? null,
  };
}

// This file's own header comment claims "Optimistic — ... rolled back on DB
// error" as an architectural principle, but this helper itself never did
// that — only console.warn'd. Every call site applies its own optimistic
// local state change before calling this, so a failed write (RLS, network)
// left local state showing a change that was never actually persisted,
// with nothing reverting it or telling the user. `onFailure` is optional
// and additive — existing behavior is unchanged for a caller that doesn't
// pass one; call sites are being migrated one at a time to pass a rollback
// that restores the pre-update local state, plus a shared failure toast so
// the failure is at least visible before every site has real rollback.
function dbUpdate(id: string, patch: Record<string, unknown>, onFailure?: () => void, onSuccess?: () => void) {
  supabase.from('calendar_events').update(patch).eq('id', id).then(({ error }) => {
    if (error) {
      console.warn('[eventStore] update failed', id, error.message);
      onFailure?.();
      showToast("Couldn't save — check your connection and try again", 'error');
    } else {
      onSuccess?.();
    }
  });
}

// Extracted from updateEvent so it can run AFTER the DB write is confirmed
// (DB-is-truth: `updated` here is always the server's own returned row,
// never a local guess) — every branch's transition-detection (justDeclined
// etc.) is computed by the caller by comparing `updates` (what was asked
// for) against `prevEvent` (what existed before), which doesn't change
// under this principle; only WHEN this runs, and what `updated` actually
// is, changed.
function updateEventNotifications(
  prevEvent: FamilyEvent | undefined,
  updates: Partial<FamilyEvent>,
  updated: FamilyEvent,
  flags: {
    justDeclined: boolean; justDeclinedDriver: boolean;
    justAssignedHelper: boolean; justAssignedDriver: boolean;
    justConfirmed: boolean; justConfirmedDriver: boolean;
  },
) {
  const { justDeclined, justDeclinedDriver, justAssignedHelper, justAssignedDriver, justConfirmed, justConfirmedDriver } = flags;
  const declinerName = justDeclinedDriver ? prevEvent?.driverName : prevEvent?.helper;
  const actorId = getActiveMemberId();

  // Was: a decline silently reopened the pool with zero signal to anyone
  // — the assigning parent found out only if they happened to see a Hub
  // banner, and the requesting kid was never told at all (QA sweep C1).
  // Notify whoever last assigned this driver/helper (prevEvent.updatedBy
  // — stamped by the assignment action itself) and the requesting kid,
  // skipping whichever of those is the declining actor themselves.
  if (justDeclined) {
    try {
      const { useChatStore } = require('@/store/chatStore');
      const msg = `🚫 ${declinerName ?? 'The driver'} can't make "${updated.title}" — it's back open for someone else.`;
      const recipients = new Set<string>();
      if (prevEvent?.updatedBy && prevEvent.updatedBy !== actorId) recipients.add(prevEvent.updatedBy);
      if (updated.memberId && updated.memberId !== actorId) recipients.add(updated.memberId);
      for (const recipientId of recipients) {
        useChatStore.getState().sendMessage(recipientId, actorId ?? recipientId, msg);
      }
    } catch (e) {
      console.warn('[eventStore] decline notification failed', e);
    }
  }

  // ── Real family-notifier notifications ────────────────────────────────────
  // The chat message above is kept as-is (it's an existing, presumably
  // still-wanted in-thread record of the decline) — this ADDS a real
  // bell/push notification alongside it via family-notifier, same
  // recipients, since a chat message alone is easy to miss and doesn't
  // populate the notification bell.

  // 1. Offered/reassigned — a new driver/helper name was just set.
  // Notify the newly-assigned person (only if they're a parent — a
  // kid/teen/GP self-claim goes through claimHelperSlot, a separate
  // path this task deliberately doesn't touch). Also ping whichever
  // OTHER parent was the one who made this assignment (prevEvent's
  // last editor), if that's a different parent than the new assignee —
  // the "other parent" stakeholder side of the ping-pong.
  if ((justAssignedHelper || justAssignedDriver) && !justDeclined) {
    const newAssigneeName = justAssignedDriver ? updates.driverName : updates.helper;
    // updates.driverId/helperId is set directly by every caller that
    // assigns a new driver/helper name (alongside the display name) —
    // prefer it over a name lookup, which is fragile (rename, two
    // parents sharing a first name) and only needed as a fallback for
    // a caller that hasn't been updated to also send the id.
    const newAssigneeId = justAssignedDriver ? updates.driverId : updates.helperId;
    const newAssignee = (() => {
      try {
        const { useFamilyStore } = require('@/store/familyStore');
        const members = useFamilyStore.getState().members as any[];
        if (newAssigneeId) return members.find(m => m.role === 'parent' && m.id === newAssigneeId) ?? null;
        return members.find(m => m.role === 'parent' && m.name === newAssigneeName) ?? null;
      } catch { return null; }
    })();
    const recipientIds = new Set<string>();
    if (newAssignee?.id) recipientIds.add(newAssignee.id);
    // The other parent(s) — whoever isn't the actor and isn't the new
    // assignee — get a heads-up too, mirroring hubComponents.tsx's own
    // conflict-banner resolution of "other parents".
    for (const pid of otherParentIds([actorId, newAssignee?.id])) recipientIds.add(pid);
    if (recipientIds.size) {
      notifyRideAssignment('ride_assignment_offered', [...recipientIds], actorId, {
        eventTitle: updated.title, eventId: updated.id, eventTime: updated.time,
        byName: memberById(actorId)?.name,
      });
    }
  }

  // 2. Accepted/confirmed — status just transitioned to 'confirmed'.
  // Notify the other parent(s) (not the confirmer, not the requesting
  // kid — the kid gets its own single, distinct notification below).
  if (justConfirmed) {
    const confirmerName = justConfirmedDriver ? updated.driverName : updated.helper;
    const recipients = otherParentIds([actorId]);
    if (recipients.length) {
      notifyRideAssignment('ride_assignment_accepted', recipients, actorId, {
        eventTitle: updated.title, eventId: updated.id, byName: confirmerName ?? memberById(actorId)?.name,
      });
    }
  }

  // 3. Declined — real notification alongside the chat message above,
  // same recipients (prevEvent.updatedBy), excluding the actor.
  if (justDeclined) {
    const recipients = new Set<string>();
    if (prevEvent?.updatedBy && prevEvent.updatedBy !== actorId) recipients.add(prevEvent.updatedBy);
    if (recipients.size) {
      // Live QA finding: every push fires at the same delivery priority
      // regardless of urgency (Expo's own transport has no higher tier
      // than 'high', which every notification already uses) — a driver
      // bailing 10 minutes before pickup looked identical, at the
      // recipient's phone, to a routine confirmation. Since the
      // transport priority can't go any higher, the fix is making a
      // near-term decline READ as urgent — a distinct title/copy the
      // family-notifier case below branches on.
      let minutesUntil: number | undefined;
      if (updated.date && updated.time) {
        const [h, m] = updated.time.split(':').map(Number);
        const at = new Date(`${updated.date}T00:00:00`);
        at.setHours(h, m, 0, 0);
        minutesUntil = (at.getTime() - Date.now()) / 60000;
      }
      notifyRideAssignment('ride_assignment_declined', [...recipients], actorId, {
        eventTitle: updated.title, eventId: updated.id, byName: declinerName,
        imminent: minutesUntil !== undefined && minutesUntil >= 0 && minutesUntil <= 60,
      });
    }
  }

  // 4. Final confirmation to the kid — exactly once, only on the actual
  // transition INTO 'confirmed', never on intermediate offer/decline
  // steps or on a later unrelated updateEvent call while it's already
  // confirmed (justConfirmed is already gated on prevEvent's status
  // being something other than 'confirmed', so this can't refire for
  // the same confirmation).
  if (justConfirmed) {
    const driverOrHelperName = justConfirmedDriver ? updated.driverName : updated.helper;
    const kidId = updated.memberId;
    const kid = memberById(kidId);
    // Treat 'kid' and 'teen' as one notifiable "child" recipient
    // category, consistent with the rest of the app (e.g.
    // EventFormModal's role checks) — a senior/grandparent-owned event
    // (rare, but memberId isn't restricted to kids) doesn't get this
    // "ride confirmed" framing.
    if (kidId && kidId !== actorId && kid && (kid.role === 'kid' || kid.role === 'teen')) {
      notifyRideAssignment('ride_confirmed_for_kid', [kidId], actorId, {
        eventTitle: updated.title, eventId: updated.id, eventTime: updated.time,
        driverName: driverOrHelperName,
      });
    }
  }

  // 5. Pool opened to grandparents/teens — a parent flipping
  // isOpenToGrandparents/isOpenToTeens false→true previously only wrote
  // a silent activity_log row (logUpdateActivity's gp_welcome_changed/
  // teen_welcome_changed below) with no signal to anyone actually
  // eligible to claim the new slot. Only the transition matters (not
  // "was already true" — that would refire on every unrelated
  // updateEvent call while the flag stays on), same shape as
  // justDeclined/justConfirmed above. Gated the same way each pool's
  // own view is: SeniorView shows any isOpenToGrandparents event to
  // every 'senior' member, TeenView's pool is hasCar-gated, so a
  // teen who opted out of having a car couldn't claim it anyway and
  // shouldn't be pinged as if they could.
  const justOpenedToGrandparents = updates.isOpenToGrandparents === true && prevEvent?.isOpenToGrandparents !== true;
  const justOpenedToTeens = updates.isOpenToTeens === true && prevEvent?.isOpenToTeens !== true;
  if (justOpenedToGrandparents || justOpenedToTeens) {
    try {
      const { useFamilyStore } = require('@/store/familyStore');
      const members = useFamilyStore.getState().members as any[];
      const recipientIds = new Set<string>();
      if (justOpenedToGrandparents) {
        for (const m of members) if (m.role === 'senior' && m.id !== actorId) recipientIds.add(m.id);
      }
      if (justOpenedToTeens) {
        for (const m of members) if (m.role === 'teen' && m.hasCar && m.id !== actorId) recipientIds.add(m.id);
      }
      if (recipientIds.size) {
        notifyRideAssignment('ride_pool_opened', [...recipientIds], actorId, {
          eventTitle: updated.title, eventId: updated.id, eventTime: updated.time,
        });
      }
    } catch (e) {
      console.warn('[eventStore] pool-opened notification failed', e);
    }
  }
}

// Maps FamilyEvent keys to their calendar_events column names — the same
// mapping toRow() uses, but exposed so a partial patch can be built from
// only the keys a caller actually intended to change, without pulling in
// toRow()'s unconditional full-row serialization (see toRowPartial below).
const EVENT_COLUMN: Partial<Record<keyof FamilyEvent, string>> = {
  title: 'title', date: 'date', time: 'start_time', endTime: 'end_time', allDay: 'all_day',
  type: 'type', category: 'category', color: 'color', memberId: 'member_id', memberIds: 'member_ids',
  location: 'location', notes: 'notes',
  helper: 'helper_name', helperId: 'helper_id', helperStatus: 'helper_status', helperRequestedBy: 'helper_requested_by',
  declineReason: 'helper_decline_reason', declinedBy: 'helper_declined_by',
  doctorName: 'doctor_name', subject: 'subject', coachName: 'coach_name',
  pickupLocation: 'pickup_location', dropLocation: 'drop_location',
  approvalPending: 'approval_pending', conflict: 'conflict', conflictAcknowledged: 'conflict_acknowledged',
  tripAlertDismissedAt: 'trip_alert_dismissed_at', tripAlertDismissedBy: 'trip_alert_dismissed_by',
  isOpenToGrandparents: 'is_open_to_grandparents', grandparentPassedIds: 'grandparent_passed_ids', teenPassedIds: 'teen_passed_ids',
  isOpenToTeens: 'is_open_to_teens', rideCoins: 'ride_coins', rideRequired: 'ride_required',
  driverName: 'driver_name', driverId: 'driver_id', driverStatus: 'driver_status',
  pickupConfirmedAt: 'pickup_confirmed_at', pickupConfirmedBy: 'pickup_confirmed_by',
  createdBy: 'created_by', createdAt: 'created_at', updatedBy: 'updated_by', updatedAt: 'updated_at',
  deletedBy: 'deleted_by', alertCall: 'alert_call', alertCallLeadMinutes: 'alert_call_lead_minutes',
  seriesId: 'series_id', recurrenceRule: 'recurrence_rule', isSeriesAnchor: 'is_series_anchor',
  acknowledgedBy: 'acknowledged_by', privacyLevel: 'privacy_level',
  sharedWithGPForCare: 'shared_with_gp_for_care', sharedWithSiblings: 'shared_with_siblings',
  isOptionalRsvp: 'is_optional_rsvp', rsvps: 'rsvps', linkedLegId: 'linked_leg_id',
};

// A DB write scoped to only the fields a caller actually intended to
// change — unlike toRow(updated), which serializes the ENTIRE local
// FamilyEvent object unconditionally. QA Round 21 (High) found that
// full-row overwrite let a stale client (one that missed another parent's
// realtime update, e.g. Parent-A editing a ride's location right after
// Parent-B opened it to the grandparent pool) silently clobber every
// column back to its own outdated snapshot, including fields it never
// meant to touch. Building the patch from `keys` (the update's own field
// list, plus whatever stamped always adds) means a write can only ever
// affect columns the caller actually named.
function toRowPartial(ev: FamilyEvent, keys: Iterable<keyof FamilyEvent>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    const col = EVENT_COLUMN[key];
    if (!col) continue;
    patch[col] = (ev as any)[key] ?? null;
  }
  return patch;
}

// ── Realtime ──────────────────────────────────────────────────────────────────
let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';
// Buffers rangeEvents-side realtime payloads so a burst (e.g. every row of a
// bulk recurring-series edit) applies as one setState instead of one per row.
let _rtRangeBuffer: any[] = [];
let _rtRangeFlushTimer: ReturnType<typeof setTimeout> | null = null;
// Same buffering for the dayEvents/stripMap side's "date not in view, just
// invalidate its cache entry" path — a bulk edit spanning many dates none of
// which match currentDate would otherwise still fire one setState per row.
let _rtCacheInvalidateBuffer: string[] = [];
let _rtCacheInvalidateFlushTimer: ReturnType<typeof setTimeout> | null = null;
// Buffers the dayEvents-side handler's OWN payloads too (rows matching
// currentDate) — this branch previously applied each incoming row via its
// own immediate setState, same unbuffered shape the rangeEvents handler
// below was already fixed for. A scoped bulk update (e.g.
// updateEventScoped's "This and following" propagating a driver
// confirmation across a recurring series) is one batched SQL statement,
// but Postgres/realtime still delivers one UPDATE payload per affected row
// — if more than one of those rows happens to match currentDate, or
// deliveries arrive in a tight burst, each fired its own synchronous
// setState here, live-crashing "Maximum update depth exceeded" the same
// way the already-buffered rangeEvents handler used to.
let _rtDayBuffer: any[] = [];
let _rtDayFlushTimer: ReturnType<typeof setTimeout> | null = null;
// Buffers the strip-map (day-strip dot indicators) update too — this ran
// BEFORE the currentDate check above and BEFORE _rtDayBuffer existed, so it
// fired its own synchronous setState for every single non-delete row
// unconditionally (every date, not just currentDate) — still live-crashing
// "Maximum update depth exceeded" on a bulk scoped update even after the
// dayEvents/rangeEvents buffers were added, since this branch runs first
// and never went through either of them. Buffers both the cheap in-memory
// append path (non-delete) and the async re-query path (delete) so a burst
// across many dates settles into one setState instead of one per row.
let _rtStripBuffer: any[] = [];
let _rtStripFlushTimer: ReturnType<typeof setTimeout> | null = null;

function ensureRealtime(
  familyId: string,
  getState: () => EventState,
  setState: (s: Partial<EventState>) => void,
) {
  if (_rtFamilyId === familyId && _rtChannel) return; // already subscribed for this family
  if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; }
  // Same hot-reload defensive sweep as choreStore.ts's/familyStore.ts's/
  // kidRequestStore.ts's ensureRealtime — this store was missing it,
  // leaving it exposed to the dev-mode "cannot add postgres_changes
  // callbacks ... after subscribe()" crash a prior session fixed elsewhere.
  const staleTopic = `realtime:cal:${familyId}`;
  const stale = supabase.getChannels().filter(c => c.topic === staleTopic);
  if (stale.length > 0) stale.forEach(c => supabase.removeChannel(c));
  _rtFamilyId = familyId;

  _rtChannel = supabase
    .channel(`cal:${familyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'calendar_events', filter: `family_id=eq.${familyId}` },
      (payload) => {
        const { currentDate } = getState();
        const newRow  = payload.new as any;
        const oldRow  = payload.old as any;
        const rowDate: string = (newRow?.date ?? oldRow?.date ?? '').slice(0, 10);

        // ── Strip map update ───────────────────────────────────────────────
        // Was: fired its OWN synchronous setState per row here, unconditionally
        // (every date, not just currentDate, and running before the
        // currentDate check/buffers below even apply) — a scoped bulk update
        // across many rows (e.g. "This and following" propagating a driver
        // confirmation across a recurring series) still live-crashed
        // "Maximum update depth exceeded" through this path even after the
        // dayEvents/rangeEvents handlers were buffered, since this branch
        // never went through either buffer. Buffer here too; the delete
        // sub-case's re-query is deduped to one query per distinct affected
        // date instead of one per event.
        if (rowDate) {
          _rtStripBuffer.push(payload);
          if (_rtStripFlushTimer) clearTimeout(_rtStripFlushTimer);
          _rtStripFlushTimer = setTimeout(async () => {
            const payloads = _rtStripBuffer.splice(0, _rtStripBuffer.length);
            _rtStripFlushTimer = null;

            let stripMap = getState().stripMap;
            let stripRows = getState().stripRows;

            const deletedDates = new Set<string>();
            for (const p of payloads) {
              const pNewRow = p.new as any;
              const pOldRow = p.old as any;
              const pRowDate: string = (pNewRow?.date ?? pOldRow?.date ?? '').slice(0, 10);
              if (!pRowDate) continue;
              const pIsDeleted = !!pNewRow?.deleted_at;
              if (p.eventType === 'DELETE' || pIsDeleted) {
                deletedDates.add(pRowDate);
              } else if (pNewRow?.category) {
                const cat = pNewRow.category as string;
                if (!stripMap[pRowDate]?.includes(cat)) {
                  stripMap = { ...stripMap, [pRowDate]: [...(stripMap[pRowDate] ?? []), cat] };
                }
                stripRows = [...stripRows, {
                  date: pRowDate, category: cat, memberId: pNewRow?.member_id ?? undefined,
                  helper: pNewRow?.helper_name ?? undefined, driverName: pNewRow?.driver_name ?? undefined,
                }];
              }
            }

            // One re-query per distinct deleted-from date (still lightweight
            // — 5 narrow columns), not one per event.
            for (const d of deletedDates) {
              const { data } = await supabase
                .from('calendar_events')
                .select('category,member_id,helper_name,driver_name')
                .eq('family_id', familyId)
                .eq('date', d)
                .is('deleted_at', null);
              if (!data) continue;
              const cats = [...new Set(data.map((r: any) => r.category).filter(Boolean))];
              stripMap = { ...stripMap, [d]: cats };
              const rows: StripRow[] = data.map((r: any) => ({
                date: d, category: r.category, memberId: r.member_id ?? undefined,
                helper: r.helper_name ?? undefined, driverName: r.driver_name ?? undefined,
              }));
              stripRows = stripRows.filter(r => r.date !== d).concat(rows);
            }

            setState({ stripMap, stripRows });
            AsyncStorage.setItem(DISK_STRIP, JSON.stringify(stripMap));
          }, 150);
        }

        // ── Day events update (only if rowDate === currentDate) ────────────
        if (rowDate !== currentDate) {
          // Invalidate prefetch cache for that date so next visit re-fetches.
          // Buffered same as the rangeEvents handler below — a bulk edit
          // across many dates (recurring series, none matching currentDate)
          // would otherwise fire one setState per row here too.
          if (rowDate) _rtCacheInvalidateBuffer.push(rowDate);
          if (_rtCacheInvalidateFlushTimer) clearTimeout(_rtCacheInvalidateFlushTimer);
          _rtCacheInvalidateFlushTimer = setTimeout(() => {
            const dates = _rtCacheInvalidateBuffer.splice(0, _rtCacheInvalidateBuffer.length);
            _rtCacheInvalidateFlushTimer = null;
            const newCache = { ...getState()._dayCache };
            for (const d of dates) delete newCache[d];
            setState({ _dayCache: newCache });
          }, 150);
          return;
        }

        // Buffer and apply as one batch after a short quiet window, same
        // pattern as the rangeEvents handler below — see _rtDayBuffer's
        // comment for why a single batched write can still deliver many
        // rapid-fire payloads here.
        _rtDayBuffer.push(payload);
        if (_rtDayFlushTimer) clearTimeout(_rtDayFlushTimer);
        _rtDayFlushTimer = setTimeout(() => {
          const payloads = _rtDayBuffer.splice(0, _rtDayBuffer.length);
          _rtDayFlushTimer = null;
          let next = getState().dayEvents;
          for (const p of payloads) {
            const pNewRow = p.new as any;
            const pOldRow = p.old as any;
            const pIsDeleted = !!pNewRow?.deleted_at;
            if (p.eventType === 'INSERT' && !pIsDeleted) {
              const ev = fromRow(pNewRow);
              if (next.find(e => e.id === ev.id)) continue;
              next = [...next, ev];
            } else if (p.eventType === 'UPDATE') {
              if (pIsDeleted) {
                next = next.filter(e => e.id !== pNewRow.id);
              } else {
                const ev = fromRow(pNewRow);
                next = next.map(e => e.id === ev.id ? ev : e);
              }
            } else if (p.eventType === 'DELETE') {
              next = next.filter(e => e.id !== pOldRow.id);
            }
          }
          next = sortByTime(next);
          setState({ dayEvents: next, events: next });
          const entry = getState()._dayCache[currentDate];
          if (entry) {
            setState({ _dayCache: { ...getState()._dayCache, [currentDate]: { ...entry, events: next } } });
          }
          AsyncStorage.setItem(DISK_DAY, JSON.stringify({ date: currentDate, events: next }));
        }, 150);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'calendar_events', filter: `family_id=eq.${familyId}` },
      (payload) => {
        // Keeps Week/Agenda's rangeEvents in sync with changes made
        // elsewhere (another family member's device/session, or a change
        // that doesn't route through this store's own updateEvent/addEvent
        // actions) — without this, a helper/driver assignment made by
        // someone else never appears in Agenda until the 5-minute cache
        // TTL expires or the user leaves and re-enters the view.
        //
        // Was: applied each incoming row via its own setState call,
        // immediately — a bulk edit across a recurring series (up to 84
        // rows, RECURRENCE_WINDOW_DAYS) fires one realtime event PER ROW
        // even when the write itself was a single batched SQL statement,
        // so this handler alone could fire 84 synchronous setStates in a
        // burst, each triggering a re-render of every Week/Agenda-
        // subscribed component — enough to trip React's "Maximum update
        // depth exceeded" guard (live-reported). Buffers incoming payloads
        // and applies them all in one setState after a short quiet window
        // instead of one setState per row.
        _rtRangeBuffer.push(payload);
        if (_rtRangeFlushTimer) clearTimeout(_rtRangeFlushTimer);
        _rtRangeFlushTimer = setTimeout(() => {
          const payloads = _rtRangeBuffer.splice(0, _rtRangeBuffer.length);
          _rtRangeFlushTimer = null;
          let next = getState().rangeEvents;
          for (const p of payloads) {
            const newRow = p.new as any;
            const oldRow = p.old as any;
            const isDeleted = !!newRow?.deleted_at;
            if (p.eventType === 'INSERT' && !isDeleted) {
              const ev = fromRow(newRow);
              if (next.find(e => e.id === ev.id)) continue;
              // Only append if it falls within the currently-loaded range —
              // matching addEvent's own optimistic-append reasoning (a date
              // outside the loaded window just won't show in these views
              // anyway, and we don't know the exact loaded bounds here).
              next = [...next, ev];
            } else if (p.eventType === 'UPDATE') {
              if (isDeleted) {
                next = next.filter(e => e.id !== newRow.id);
              } else {
                const ev = fromRow(newRow);
                // Only patch if this event is already part of the loaded
                // range — an UPDATE to a row outside the window shouldn't
                // pull it in.
                if (!next.find(e => e.id === ev.id)) continue;
                next = next.map(e => e.id === ev.id ? ev : e);
              }
            } else if (p.eventType === 'DELETE') {
              next = next.filter(e => e.id !== oldRow.id);
            }
          }
          // Invalidate the range cache too so a fresh loadRange() call
          // (e.g. switching view modes) doesn't clobber this with a stale
          // cached copy before the TTL naturally expires.
          setState({ rangeEvents: sortByTime(next), _rangeCache: {} });
        }, 150);
      }
    )
    .subscribe((status) => {
      console.log('[eventStore] realtime', status, familyId);
      // Same fix as choreStore.ts's ensureRealtime — this channel silently
      // dies on app backgrounding (iOS suspends the socket), and the guard
      // above (`_rtFamilyId === familyId && _rtChannel`) only checks
      // "does a channel object exist," not "is it alive," so every later
      // call kept skipping resubscription against a dead channel forever.
      // Confirmed via QA audit as a live, unfixed gap in this sibling
      // system after the chore-side fix. Clearing on a terminal bad status
      // makes the next ensureRealtime() call actually resubscribe.
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`[eventStore] realtime cal:${familyId} unhealthy (${status}) — clearing so the next sync resubscribes`);
        if (_rtFamilyId === familyId) { _rtChannel = null; _rtFamilyId = ''; }
      }
    });
}

// ── Fetch one page of events for a date ───────────────────────────────────────
async function fetchDayPage(
  familyId: string,
  date: string,
  cursor: string | null,  // start_time of last event seen; null = first page
): Promise<{ events: FamilyEvent[]; nextCursor: string | null; hasMore: boolean }> {
  let q = supabase
    .from('calendar_events')
    .select('*')
    .eq('family_id', familyId)
    .eq('date', date)
    .is('deleted_at', null)
    .order('start_time', { ascending: true, nullsFirst: true })
    .limit(PAGE_SIZE);

  if (cursor) {
    q = q.gt('start_time', cursor);
  }

  const { data, error } = await q;
  if (error) throw error;

  const events    = (data ?? []).map(fromRow);
  const hasMore   = events.length === PAGE_SIZE;
  const lastTime  = events[events.length - 1]?.time ?? null;
  return { events, nextCursor: hasMore ? lastTime : null, hasMore };
}

// ═════════════════════════════════════════════════════════════════════════════
export const useEventStore = create<EventState>((set, get) => ({
  currentDate: '',
  dayEvents:   [],
  dayLoading:  false,
  hasMore:     false,
  stripMap:    {},
  stripRows:   [],
  stripLoading: false,
  _dayCache:   {},
  rangeEvents:  [],
  rangeLoading: false,
  _rangeCache:  {},
  events:      [],   // legacy alias
  loaded:      false, // legacy alias

  // ── selectDate ─────────────────────────────────────────────────────────────
  selectDate: async (date: string, force?: boolean) => {
    // Was: this SWR cache guard skipped the entire fetch — including the
    // DB hit — whenever today's date was already loaded, no matter how
    // stale. HubScreen's post-poll loadEvents() call (added earlier this
    // session to fix a stale-read race) hit this exact guard and did
    // nothing, since dayEvents was already non-empty from before the
    // poll ran — live-reported: a Google-side delete correctly removed
    // the row server-side (confirmed via CalendarScreen's own agenda
    // view, which goes through a different fetch path), yet the Hub's
    // "Today's Timeline" card kept showing the deleted event
    // indefinitely, because nothing ever re-hit the DB for it again.
    // force bypasses the cache/TTL check entirely for exactly this case
    // — a caller that just ran an external sync and needs the freshest
    // possible local state, not the merely-recent-enough one this guard
    // was designed to satisfy for a plain screen mount.
    if (!force && date === get().currentDate && !get().dayLoading && get().dayEvents.length > 0) return;

    // Cancel any in-flight request for the previous date
    _dayAbort?.abort();
    _dayAbort = new AbortController();
    const signal = _dayAbort.signal;

    const key = `day:${date}`;
    set({ currentDate: date, dayLoading: true });

    // ── Serve from SWR cache ──────────────────────────────────────────────
    const cached = get()._dayCache[date];
    const isFresh = !force && cached && (Date.now() - cached.fetchedAt) < DAY_TTL_MS;
    if (cached) {
      set({ dayEvents: cached.events, events: cached.events, hasMore: cached.hasMore, dayLoading: isFresh ? false : true, loaded: true });
      if (isFresh) return;
    } else {
      // Try disk cache for immediate paint
      try {
        const raw = await AsyncStorage.getItem(DISK_DAY);
        if (raw) {
          const { date: cd, events: ce } = JSON.parse(raw);
          if (cd === date) set({ dayEvents: ce, events: ce, loaded: true });
        }
      } catch { /* ignore */ }
    }

    if (signal.aborted) return;

    // ── Fetch from DB (page 1) ────────────────────────────────────────────
    if (_inFlight.has(key)) return;
    _inFlight.add(key);
    try {
      const familyId = getFamilyId();
      if (!familyId) {
        // Cold-launch race: CalendarScreen's mount effect calls selectDate()
        // immediately, before familyStore.loadFromStorage() (async — awaits
        // AsyncStorage + supabase.auth.getUser(), sometimes a multi-second
        // retry loop) has hydrated `members`/`activeMemberId`. Was: this
        // silently no-op'd and NOTHING ever retried once family data did
        // arrive — live-reported as an event only appearing after
        // navigating away and back (which just happens to issue a fresh
        // selectDate call later, by which point familyStore has resolved).
        // familyLoadStatus is guaranteed to eventually settle to 'confirmed'
        // (see loadFromStorage's own comment), so wait for exactly that
        // transition and retry this same date once, instead of leaving the
        // UI stuck on a false "no events" until the user happens to
        // navigate elsewhere and back.
        set({ dayLoading: false, loaded: true });
        const { useFamilyStore } = require('@/store/familyStore');
        if (useFamilyStore.getState().familyLoadStatus !== 'confirmed') {
          const unsub = useFamilyStore.subscribe((s: any) => {
            if (s.familyLoadStatus === 'confirmed') {
              unsub();
              if (get().currentDate === date) get().selectDate(date, true);
            }
          });
        }
        return;
      }

      const { events, nextCursor, hasMore } = await fetchDayPage(familyId, date, null);
      if (signal.aborted) return;

      const entry: DayCacheEntry = { events, cursor: nextCursor, hasMore, fetchedAt: Date.now() };
      set({
        dayEvents:  events,
        events,
        hasMore,
        dayLoading: false,
        loaded:     true,
        _dayCache:  { ...get()._dayCache, [date]: entry },
      });
      AsyncStorage.setItem(DISK_DAY, JSON.stringify({ date, events }));
      ensureRealtime(familyId, get, s => set(s as any));

      // Prefetch adjacent dates silently
      get().prefetchDate(offsetDate(date, -1));
      get().prefetchDate(offsetDate(date,  1));
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.warn('[eventStore] selectDate failed', e);
      set({ dayLoading: false, loaded: true });
    } finally {
      _inFlight.delete(key);
    }
  },

  // ── loadMoreDay — next page for current date ───────────────────────────────
  loadMoreDay: async () => {
    const { currentDate, hasMore, _dayCache, dayLoading } = get();
    if (!hasMore || dayLoading || !currentDate) return;
    const entry = _dayCache[currentDate];
    if (!entry?.cursor) return;

    const key = `day:${currentDate}:more`;
    if (_inFlight.has(key)) return;
    _inFlight.add(key);
    set({ dayLoading: true });
    try {
      const familyId = getFamilyId();
      if (!familyId) return;
      const { events: page, nextCursor, hasMore: more } = await fetchDayPage(familyId, currentDate, entry.cursor);
      const merged = sortByTime([...get().dayEvents, ...page]);
      const newEntry: DayCacheEntry = { events: merged, cursor: nextCursor, hasMore: more, fetchedAt: entry.fetchedAt };
      set({
        dayEvents:  merged,
        events:     merged,
        hasMore:    more,
        dayLoading: false,
        _dayCache:  { ...get()._dayCache, [currentDate]: newEntry },
      });
    } catch (e) {
      console.warn('[eventStore] loadMoreDay failed', e);
      set({ dayLoading: false });
    } finally {
      _inFlight.delete(key);
    }
  },

  // ── loadStrip — lightweight date → category[] for visible strip range ──────
  loadStrip: async (dates: string[]) => {
    if (!dates.length) return;

    // Serve disk cache immediately
    try {
      const raw = await AsyncStorage.getItem(DISK_STRIP);
      if (raw) set({ stripMap: { ...JSON.parse(raw), ...get().stripMap } });
    } catch { /* ignore */ }

    const from = dates[0];
    const to   = dates[dates.length - 1];
    const key  = `strip:${from}:${to}`;
    if (_inFlight.has(key)) return;

    // TTL: check if all dates are already fresh (use fetchedAt stored in _dayCache or a strip TTL flag)
    // Simple approach: track last strip fetch time per range using a single timestamp
    const stripTs = (get() as any)._stripFetchedAt as number | undefined;
    if (stripTs && Date.now() - stripTs < STRIP_TTL_MS) return;

    _inFlight.add(key);
    set({ stripLoading: true });
    try {
      const familyId = getFamilyId();
      if (!familyId) { set({ stripLoading: false }); return; }

      // member_id/helper_name/driver_name added (still a lightweight query,
      // just 3 more narrow columns) so the month grid can filter its dots
      // per member client-side — previously this only carried date+category,
      // so switching the "All Family / Alex / Maya / ..." chip never
      // affected which days showed dots at all, even when the filtered
      // member had zero events that day.
      const { data, error } = await supabase
        .from('calendar_events')
        .select('date,category,member_id,helper_name,driver_name')
        .eq('family_id', familyId)
        .gte('date', from)
        .lte('date', to)
        .is('deleted_at', null);

      if (error || !data) { set({ stripLoading: false }); return; }

      const map: StripMap = {};
      const rows: StripRow[] = [];
      for (const row of data) {
        const d = String(row.date).slice(0, 10);
        const c = row.category as string;
        if (!c || !d) continue;
        if (!map[d]) map[d] = [];
        if (!map[d].includes(c)) map[d].push(c);
        rows.push({
          date: d, category: c,
          memberId: (row as any).member_id ?? undefined,
          helper: (row as any).helper_name ?? undefined,
          driverName: (row as any).driver_name ?? undefined,
        });
      }
      // Every date in [from, to] is authoritatively refreshed by this fetch
      // — start from the old map, but explicitly clear each date in range
      // before re-applying `map`, so a date whose last event got deleted
      // (map has no entry for it) actually loses its stale strip dots
      // instead of keeping whatever was cached from before.
      const next = { ...get().stripMap };
      for (const d of dates) delete next[d];
      Object.assign(next, map);
      const nextRows = get().stripRows.filter(r => !dates.includes(r.date)).concat(rows);
      set({ stripMap: next, stripRows: nextRows, stripLoading: false, _stripFetchedAt: Date.now() } as any);
      AsyncStorage.setItem(DISK_STRIP, JSON.stringify(next));
    } catch (e) {
      console.warn('[eventStore] loadStrip failed', e);
      set({ stripLoading: false });
    } finally {
      _inFlight.delete(key);
    }
  },

  // ── loadRange — full event rows across a date span (Week/Agenda views) ─────
  // Unlike day detail this isn't paginated — a week or a few upcoming weeks
  // is a small enough result set to fetch in one shot. SWR-cached per exact
  // [from,to] key so switching between Week's 7-day window and Agenda's
  // wider window doesn't evict each other.
  loadRange: async (from: string, to: string, force?: boolean) => {
    const key = `${from}:${to}`;
    const cached = get()._rangeCache[key];
    // force bypasses the freshness check entirely — same fix, same
    // reasoning as selectDate's own force param: a caller that just ran
    // an external calendar sync (Google poll, Apple reconcile) needs the
    // freshest possible data, not merely "recent enough for a plain
    // screen mount." Without this, a user who stayed on Schedule without
    // navigating away could hit the same up-to-5-minute staleness window
    // Hub's Today's Timeline card was just fixed for.
    const isFresh = !force && cached && Date.now() - cached.fetchedAt < DAY_TTL_MS;
    if (cached && !force) set({ rangeEvents: cached.events });
    if (isFresh) return;

    const fetchKey = `range:${key}`;
    if (_inFlight.has(fetchKey)) return;
    _inFlight.add(fetchKey);
    set({ rangeLoading: true });
    try {
      const familyId = getFamilyId();
      if (!familyId) { set({ rangeLoading: false }); return; }

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('family_id', familyId)
        .gte('date', from)
        .lte('date', to)
        .is('deleted_at', null)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: true });

      if (error || !data) { set({ rangeLoading: false }); return; }

      const rangeEvents = data.map(fromRow);
      const nextCache = { ...get()._rangeCache, [key]: { events: rangeEvents, fetchedAt: Date.now() } };
      set({ rangeEvents, rangeLoading: false, _rangeCache: nextCache });
    } catch (e) {
      console.warn('[eventStore] loadRange failed', e);
      set({ rangeLoading: false });
    } finally {
      _inFlight.delete(fetchKey);
    }
  },

  // ── prefetchDate — silent background load into SWR cache ──────────────────
  prefetchDate: (date: string) => {
    const existing = get()._dayCache[date];
    if (existing && Date.now() - existing.fetchedAt < DAY_TTL_MS) return; // still fresh
    const key = `day:${date}`;
    if (_inFlight.has(key)) return;
    _inFlight.add(key);
    const familyId = getFamilyId();
    if (!familyId) { _inFlight.delete(key); return; }
    fetchDayPage(familyId, date, null)
      .then(({ events, nextCursor, hasMore }) => {
        const entry: DayCacheEntry = { events, cursor: nextCursor, hasMore, fetchedAt: Date.now() };
        set({ _dayCache: { ...get()._dayCache, [date]: entry } });
      })
      .catch(() => { /* silent */ })
      .finally(() => _inFlight.delete(key));
  },

  // ── Compat shims ──────────────────────────────────────────────────────────
  loadFromStorage: async (force?: boolean) => get().selectDate(today(), force),
  syncFromDB:      async () => {
    const cur = get().currentDate || today();
    // Invalidate cache for current date so selectDate re-fetches
    const newCache = { ...get()._dayCache };
    delete newCache[cur];
    set({ _dayCache: newCache });
    get().selectDate(cur);
  },

  // ── Mutations ─────────────────────────────────────────────────────────────
  addEvent: async (e) => {
    const draft: FamilyEvent = {
      ...e, id: 'ev' + Date.now(),
      // Untrimmed titles (stray leading/trailing/double spaces, e.g. from a
      // photo-parsed or voice-dictated appointment) render verbatim
      // everywhere the title is shown — cards, calendar, and push
      // notifications ("Lab -Blood " with a trailing space, live-reported).
      // Normalize once here rather than at every display site.
      title: e.title?.trim() ?? e.title,
      createdBy: e.createdBy ?? getActiveMemberId() ?? undefined,
      createdAt: e.createdAt ?? new Date().toISOString(),
    };

    // DB-is-truth: await the insert and only render the row the server
    // actually persisted (its own id, timestamps, and any server-side
    // defaults) — never the client-generated draft. The local id above
    // exists only to build the outgoing row; the server's returned row is
    // what every list/cache below is populated from.
    const { data: row, error } = await supabase.from('calendar_events').insert([toRow(draft)]).select().maybeSingle();
    if (error || !row) {
      console.warn('[eventStore] insert failed', error?.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return '';
    }
    const event = fromRow(row);

    if (event.date === get().currentDate) {
      const next = sortByTime([...get().dayEvents, event]);
      set({ dayEvents: next, events: next });
      const entry = get()._dayCache[event.date];
      if (entry) set({ _dayCache: { ...get()._dayCache, [event.date]: { ...entry, events: next } } });
    } else {
      // Was: a request created for any date OTHER than whatever the
      // Schedule tab currently has open (e.g. a kid submitting from the Hub
      // tab, which never touched currentDate this session, or the Schedule
      // tab having a stale 5-min SWR cache entry for that date already)
      // silently skipped BOTH the live view update above AND this cache —
      // navigating to that date afterward would keep serving the stale
      // cached list for up to DAY_TTL_MS, with the kid's own brand-new
      // request nowhere on screen. Patch the target date's cache entry
      // directly (if one exists) so it's correct the moment they get there,
      // without waiting for a real refetch.
      const entry = get()._dayCache[event.date];
      if (entry) {
        const next = sortByTime([...entry.events, event]);
        set({ _dayCache: { ...get()._dayCache, [event.date]: { ...entry, events: next } } });
      }
    }

    // Add to rangeEvents (Week/Agenda) if it falls in the currently loaded
    // window — safe to always append+resort since a date outside the
    // loaded range just wouldn't be shown by those views' own filtering
    // anyway.
    const rangeNext = sortByTime([...get().rangeEvents, event]);
    set({ rangeEvents: rangeNext });
    // Same staleness gap as _dayCache above, for Week/Agenda's own SWR
    // cache — without this, a component remount that re-triggers loadRange
    // for a window covering this date would read the pre-insert cached
    // list and clobber the live rangeEvents update just made above.
    const rc = get()._rangeCache;
    let rangeCacheChanged = false;
    const nextRangeCache = { ...rc };
    for (const key of Object.keys(rc)) {
      const [from, to] = key.split(':');
      if (event.date >= from && event.date <= to) {
        nextRangeCache[key] = { ...rc[key], events: sortByTime([...rc[key].events, event]) };
        rangeCacheChanged = true;
      }
    }
    if (rangeCacheChanged) set({ _rangeCache: nextRangeCache });

    // Update strip map
    const cat = event.category;
    if (cat) {
      const sm = { ...get().stripMap };
      if (!sm[event.date]?.includes(cat)) {
        sm[event.date] = [...(sm[event.date] ?? []), cat];
      }
      const stripRows = [...get().stripRows, {
        date: event.date, category: cat, memberId: event.memberId,
        helper: event.helper, driverName: event.driverName,
      }];
      set({ stripMap: sm, stripRows });
    }

    logActivity({ entityType: 'event', entityId: event.id, familyId: getFamilyId(), actorId: event.createdBy, action: 'created' });
    // Audit finding — same gap as choreStore.ts's addChore direct-
    // assignment bug this whole audit started from: a parent creating
    // an event FOR someone else (memberId set to a kid/co-parent, not
    // the creator) sent that person zero signal. Only fires for a real
    // "this is about someone other than the creator" event — a plain
    // event the creator made for themselves needs no ping.
    const familyId = getFamilyId();
    if (event.memberId && event.memberId !== event.createdBy && familyId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'event_assigned', familyId, memberIds: [event.memberId], persist: true,
          excludeMemberId: event.createdBy ?? undefined,
          payload: { eventId: event.id, eventTitle: event.title, eventTime: event.time, byName: memberById(event.createdBy)?.name },
        },
      }).catch(err => console.warn('[eventStore] addEvent notify failed:', err?.message));
    }
    // Personal-calendar 2-way sync — pushes this event to every active
    // PERSONAL-purpose Google/Outlook connection the CREATOR has
    // (fire-and-forget, same shape as the family-notifier call above).
    // Work-purpose connections are never pushed to — see
    // calendar-sync-push's own header comment.
    if (familyId && event.createdBy) {
      supabase.functions.invoke('calendar-sync-push', {
        body: { eventId: event.id, familyId, memberId: event.createdBy, action: 'create' },
      }).catch(err => console.warn('[eventStore] addEvent calendar-sync-push failed:', err?.message));
    }
    // Apple/EventKit 2-way sync — device-local, gated behind the
    // creator's own opt-in preference (off by default).
    if (event.createdBy && isAppleCalendarSyncEnabled(event.createdBy)) {
      import('@/lib/calendarSync2Way').then(({ pushEventToAppleCalendar }) =>
        pushEventToAppleCalendar(event.createdBy!, event, event.id, 'create')
      ).catch(err => console.warn('[eventStore] addEvent Apple sync failed:', err?.message));
    }

    return event.id;
  },

  updateEvent: async (id, updatesIn) => {
    // Same untrimmed-title normalization as addEvent — an edit can
    // reintroduce stray whitespace just as easily as creation can.
    const updates = 'title' in updatesIn && typeof updatesIn.title === 'string'
      ? { ...updatesIn, title: updatesIn.title.trim() }
      : updatesIn;
    const prevEvent = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    // Logged QA gap, fixed: two co-parents editing the same free-text
    // field on the same event within the same instant used to silently
    // last-write-win with zero warning — the same class of bug already
    // fixed for chores via a compare-and-set RPC. When the patch touches
    // ONLY the collision-prone text/date-time fields a person types
    // directly into an edit sheet, route through that same style of check
    // BEFORE any of the elaborate status-transition logic below runs (this
    // function also handles decline-reopen/auto-confirm/notifications,
    // which a broad version-check could break — scoped narrowly on
    // purpose, see the migration's own comment).
    const TEXT_CHECKED_FIELDS = ['title', 'notes', 'location', 'date', 'time', 'endTime'] as const;
    const updateKeys = Object.keys(updates);
    if (prevEvent && updateKeys.length > 0 && updateKeys.every(k => (TEXT_CHECKED_FIELDS as readonly string[]).includes(k))) {
      const { error } = await supabase.rpc('update_calendar_event_text_checked', {
        p_event_id: id,
        p_title: 'title' in updates ? (updates as any).title ?? null : null,
        p_has_title: 'title' in updates,
        p_notes: 'notes' in updates ? (updates as any).notes ?? null : null,
        p_has_notes: 'notes' in updates,
        p_location: 'location' in updates ? (updates as any).location ?? null : null,
        p_has_location: 'location' in updates,
        p_date: 'date' in updates ? (updates as any).date ?? null : null,
        p_has_date: 'date' in updates,
        p_start_time: 'time' in updates ? (updates as any).time ?? null : null,
        p_has_start_time: 'time' in updates,
        p_end_time: 'endTime' in updates ? (updates as any).endTime ?? null : null,
        p_has_end_time: 'endTime' in updates,
        p_expected_updated_at: prevEvent.updatedAt ?? null,
      });
      if (error) {
        console.warn('[eventStore] update_calendar_event_text_checked FAILED', error.message);
        const isStale = error.message?.includes('stale_write');
        showToast(isStale ? "Someone else already changed this — refresh to see their update" : "Couldn't save — check your connection and try again", 'error');
        get().syncFromDB();
        return;
      }
      const stamped = { ...updates, updatedAt: new Date().toISOString() };
      set(s => ({
        dayEvents: sortByTime(s.dayEvents.map(e => e.id === id ? { ...e, ...stamped } : e)),
        events: sortByTime(s.events.map(e => e.id === id ? { ...e, ...stamped } : e)),
        rangeEvents: sortByTime(s.rangeEvents.map(e => e.id === id ? { ...e, ...stamped } : e)),
      }));
      // Was a bare `return` — this fast path handles the single most
      // common real edit shape (title/date/time/location/notes only,
      // exactly what EventFormModal's edit save sends for a plain text/
      // time change) and skipped calendar-sync-push/Apple push entirely,
      // since those calls only exist later in this function, after the
      // TEXT_CHECKED_FIELDS branch's own early return. Live-reported:
      // edited an event's time in the app, checked Google Calendar
      // directly, the edit was never there — outbound sync silently
      // never even attempted for the majority of real-world edits.
      const merged = { ...prevEvent, ...stamped };
      const familyIdFast = getFamilyId();
      if (familyIdFast && merged.createdBy) {
        supabase.functions.invoke('calendar-sync-push', {
          body: { eventId: id, familyId: familyIdFast, memberId: merged.createdBy, action: 'update' },
        }).catch(e => console.warn('[eventStore] updateEvent(text-checked) calendar-sync-push failed:', e?.message));
      }
      if (merged.createdBy && isAppleCalendarSyncEnabled(merged.createdBy)) {
        import('@/lib/calendarSync2Way').then(({ pushEventToAppleCalendar }) =>
          pushEventToAppleCalendar(merged.createdBy!, merged, id, 'update')
        ).catch(e => console.warn('[eventStore] updateEvent(text-checked) Apple sync failed:', e?.message));
      }
      return;
    }
    // A parent-assigned ride that gets declined shouldn't just sit there —
    // auto-open it to the GP/Teen pool so it's immediately claimable by
    // someone else, instead of requiring the creating parent to notice the
    // decline and manually flip the toggles themselves.
    //
    // Was: only fired for category==='Ride' and only ever watched
    // helperStatus — a rideRequired event on any OTHER category (Sports,
    // Study, Medical, etc, using driverName/driverStatus instead) never
    // reopened on decline, staying permanently stuck with no driver and no
    // path back to the claimable pool (QA Round 11, High Finding H5).
    const justDeclinedHelper = updates.helperStatus === 'rejected' && prevEvent?.helperStatus !== 'rejected';
    const justDeclinedDriver = updates.driverStatus === 'rejected' && prevEvent?.driverStatus !== 'rejected';
    const justDeclined = justDeclinedHelper || justDeclinedDriver;
    // Parent-to-parent assignment ping-pong (offer/accept/confirm) — mirrors
    // the shape of the justDeclined* checks above, but for the two other
    // transitions that previously sent zero real notifications: a new
    // driver/helper name just being set (an offer/reassignment), and a
    // status transitioning INTO 'confirmed' (an acceptance). Both are
    // "changed to X, wasn't X before" checks against prevEvent, same as
    // justDeclinedHelper/justDeclinedDriver.
    const justAssignedHelper = !!updates.helper && updates.helper !== prevEvent?.helper;
    const justAssignedDriver = !!updates.driverName && updates.driverName !== prevEvent?.driverName;
    const justConfirmedHelper = updates.helperStatus === 'confirmed' && prevEvent?.helperStatus !== 'confirmed';
    const justConfirmedDriver = updates.driverStatus === 'confirmed' && prevEvent?.driverStatus !== 'confirmed';
    const justConfirmed = justConfirmedHelper || justConfirmedDriver;
    // Was: reopened the pool but left the declined person's name/status
    // sitting in helper/driverName — eventAssignee() (which prefers name
    // truthiness) then kept reporting them as the assignee everywhere,
    // even though the ride was simultaneously reopened to the pool (QA
    // sweep C2, a genuine data/UI contradiction, not just cosmetic). Clear
    // the stale name alongside reopening.
    const autoOpenOnDecline = justDeclined && (prevEvent?.category === 'Ride' || prevEvent?.rideRequired)
      ? { isOpenToGrandparents: true, isOpenToTeens: true }
      : {};
    // Was: helperStatus/driverStatus stayed at 'rejected' even after
    // "reopening" the pool — claimHelperSlot's compare-and-swap only
    // matches a still-NULL status column (.is(dbStatusCol, null)), so a
    // ride "reopened" this way could never actually be re-claimed by
    // anyone; the only reason TeenView's dropPickup worked at all was a
    // separate workaround that cleared helper/helperStatus directly instead
    // of going through the normal decline path, which every OTHER decline
    // site (GP, hubComponents.tsx) does not do (QA sweep H3). Clearing the
    // stale name+status here, after updates so it isn't clobbered back to
    // 'rejected', makes decline-and-reopen actually reopen for every caller
    // uniformly, and lets dropPickup drop its own workaround.
    const clearOnDecline = justDeclined
      ? {
          ...(justDeclinedHelper ? { helper: undefined, helperStatus: undefined } : {}),
          ...(justDeclinedDriver ? { driverName: undefined, driverStatus: undefined } : {}),
        }
      : {};
    const stamped = {
      ...autoOpenOnDecline,
      ...updates,
      ...clearOnDecline,
      updatedBy: updates.updatedBy ?? getActiveMemberId() ?? undefined,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    };
    // DB-is-truth: await the write and derive `updated` (and every
    // notification branch below) from the row the server actually
    // persisted, never from a local guess applied ahead of it. This
    // replaces the old optimistic-merge-then-write-then-rollback-on-
    // failure shape — there's nothing left to roll back, since nothing
    // renders until the write is confirmed.
    const patch = toRowPartial(stamped as FamilyEvent, Object.keys(stamped) as (keyof FamilyEvent)[]);
    const { data: row, error } = await supabase.from('calendar_events').update(patch).eq('id', id).select().maybeSingle();
    if (error || !row) {
      console.warn('[eventStore] update failed', id, error?.message);
      showToast("Couldn't save — check your connection and try again", 'error');
      return;
    }
    const updated = fromRow(row);
    const next = sortByTime(get().dayEvents.map(e => e.id === id ? updated : e));
    set({ dayEvents: next, events: next });
    set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === id ? updated : e)) });

    // Personal-calendar 2-way sync — only push once the write is
    // CONFIRMED, matching the original ordering (this always ran only
    // on success before too).
    const familyId = getFamilyId();
    if (familyId && updated.createdBy) {
      supabase.functions.invoke('calendar-sync-push', {
        body: { eventId: id, familyId, memberId: updated.createdBy, action: 'update' },
      }).catch(e => console.warn('[eventStore] updateEvent calendar-sync-push failed:', e?.message));
    }
    if (updated.createdBy && isAppleCalendarSyncEnabled(updated.createdBy)) {
      import('@/lib/calendarSync2Way').then(({ pushEventToAppleCalendar }) =>
        pushEventToAppleCalendar(updated.createdBy!, updated, id, 'update')
      ).catch(e => console.warn('[eventStore] updateEvent Apple sync failed:', e?.message));
    }
    if (prevEvent) logUpdateActivity(prevEvent, updates, updated);

    updateEventNotifications(prevEvent, updates, updated, {
      justDeclined, justDeclinedDriver, justAssignedHelper, justAssignedDriver,
      justConfirmed, justConfirmedDriver,
    });
  },

  // Scenario 2.11 — RSVP is its own per-member map, not a status field on
  // the whole event, so this goes through updateEvent's normal optimistic
  // + DB-write path with just the one key changed rather than duplicating
  // that plumbing here.
  respondToRsvp: async (id, memberId, response) => {
    const existing = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    if (!existing) return;
    await get().updateEvent(id, { rsvps: { ...(existing.rsvps ?? {}), [memberId]: response } });
    // Audit finding — an RSVP change only ever touches the `rsvps` map, so
    // none of updateEvent's own notification branches above (which all key
    // off helper/driverName/status/GP-welcome fields) ever fire for it —
    // the event creator got zero signal someone responded. Only notifies
    // when there's a real creator to tell and it isn't the responder's own
    // event.
    if (existing.createdBy && existing.createdBy !== memberId) {
      const familyId = getFamilyId();
      if (familyId) {
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'event_rsvp_response', familyId, memberIds: [existing.createdBy], persist: true,
            excludeMemberId: memberId,
            payload: { eventId: id, eventTitle: existing.title, response, memberName: memberById(memberId)?.name },
          },
        }).catch(e => console.warn('[eventStore] respondToRsvp notify failed:', e?.message));
      }
    }
  },

  // ── reassignEvent — the ONE place a driver/helper reassignment happens ────
  // Previously hand-duplicated in HelperEventCard.tsx ("Take Over"),
  // RideRequiredEventCard.tsx (its own Reassign picker), and
  // EventDetailSheet (hubComponents.tsx) — each called the reassign_event
  // RPC and then wrote its own GUESSED local patch afterward, instead of
  // trusting the server's actual result. Three independent copies of the
  // same "assign X as driver/helper" logic will drift from each other by
  // construction; this collapses them into one function every surface
  // calls, so a reassignment made from Schedule and one made from the Hub
  // behave — and render — identically, always.
  reassignEvent: async (eventId, newMemberId, role, actorId) => {
    const { error } = await supabase.rpc('reassign_event', {
      p_event_id: eventId, p_new_member_id: newMemberId, p_role: role, p_actor_id: actorId,
    });
    if (error) {
      console.warn('[eventStore] reassignEvent failed', eventId, error.message);
      showToast("Couldn't reassign — please try again", 'error');
      return false;
    }
    // DB-is-truth: re-fetch the real row instead of guessing what the RPC
    // just wrote (its exact status rule — 'confirmed' only when assigning
    // to yourself, 'pending' otherwise — lives server-side; duplicating
    // that rule client-side is exactly how the three old copies drifted).
    const { data: row } = await supabase.from('calendar_events').select('*').eq('id', eventId).single();
    if (row) {
      const fresh = fromRow(row);
      const nextDay = sortByTime(get().dayEvents.map(e => e.id === eventId ? fresh : e));
      set({ dayEvents: nextDay, events: nextDay });
      set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === eventId ? fresh : e)) });
      // Live-reported gap: Praveena reassigned this ride to Ugandhar, it
      // showed up correctly on Ugandhar's Hub, but he got no push/bell at
      // all — updateEvent's own updateEventNotifications only fires for
      // assignments made through updateEvent itself; every reassignEvent
      // caller (RideRequiredEventCard, HelperEventCard, hubComponents.tsx,
      // CalendarScreen's swap, FamilyNeedsHandSection) goes through the
      // reassign_event RPC directly and never touched family-notifier at
      // all. Only notify when the new assignee is someone OTHER than the
      // actor — a self-claim needs no "you were assigned" ping.
      if (newMemberId !== actorId) {
        notifyRideAssignment('ride_assignment_offered', [newMemberId], actorId, {
          eventTitle: fresh.title, eventId: fresh.id, eventTime: fresh.time,
          byName: memberById(actorId)?.name,
        });
      }
    }
    showToast(`Reassigned ✓`);
    return true;
  },

  // ── confirmEventAssignment — the ONE place "yes, I'll do it" happens ──────
  // Was independently hand-copied in HelperEventCard.tsx (using
  // confirm_event_assignment_series_forward, which also sweeps forward
  // through a recurring series) and in EventDetailSheet/YourRidesSection/
  // TeenView (all three using the plain single-event confirm_event_
  // assignment instead, with NO series propagation at all) — the exact
  // same tap, "Confirm I'll do it," behaved differently purely depending
  // on which screen it was tapped from. This function decides which RPC
  // to use ONCE, based on whether the row actually has a seriesId, so
  // every caller gets identical behavior.
  confirmEventAssignment: async (eventId, memberId, role) => {
    const target = get().dayEvents.find(e => e.id === eventId) ?? get().rangeEvents.find(e => e.id === eventId);
    const useSeriesForward = !!target?.seriesId;
    const { error } = await supabase.rpc(
      useSeriesForward ? 'confirm_event_assignment_series_forward' : 'confirm_event_assignment',
      { p_event_id: eventId, p_member_id: memberId, p_role: role },
    );
    if (error) {
      console.warn('[eventStore] confirmEventAssignment failed', eventId, error.message);
      showToast("Couldn't confirm — please try again", 'error');
      return false;
    }
    // DB-is-truth: re-fetch rather than guess. The series-forward RPC may
    // have confirmed multiple future occurrences, not just this one — a
    // single-row re-fetch would miss those — so re-fetch every row in the
    // same series instead of just eventId when that path was used.
    if (useSeriesForward && target?.seriesId) {
      const { data: rows } = await supabase.from('calendar_events')
        .select('*').eq('series_id', target.seriesId).is('deleted_at', null);
      if (rows) {
        const byId = new Map(rows.map(row => [row.id, fromRow(row)]));
        const patchOne = (e: FamilyEvent) => byId.get(e.id) ?? e;
        set({
          dayEvents: sortByTime(get().dayEvents.map(patchOne)),
          events: sortByTime(get().events.map(patchOne)),
          rangeEvents: sortByTime(get().rangeEvents.map(patchOne)),
        });
      }
    } else {
      const { data: row } = await supabase.from('calendar_events').select('*').eq('id', eventId).single();
      if (row) {
        const fresh = fromRow(row);
        set({ dayEvents: sortByTime(get().dayEvents.map(e => e.id === eventId ? fresh : e)) });
        set({ events: sortByTime(get().events.map(e => e.id === eventId ? fresh : e)) });
        set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === eventId ? fresh : e)) });
      }
    }
    // Same notification gap as reassignEvent above — this RPC path never
    // went through updateEvent's own updateEventNotifications, so nobody
    // but the confirmer ever heard about it. Mirrors updateEvent's own
    // justConfirmed branch: other parents get a heads-up, and the
    // requesting kid/teen gets the "you're covered" ping.
    const confirmed = get().dayEvents.find(e => e.id === eventId) ?? get().rangeEvents.find(e => e.id === eventId);
    if (confirmed) {
      const recipients = otherParentIds([memberId]);
      if (recipients.length) {
        notifyRideAssignment('ride_assignment_accepted', recipients, memberId, {
          eventTitle: confirmed.title, eventId: confirmed.id, byName: memberById(memberId)?.name,
        });
      }
      const kidId = confirmed.memberId;
      const kid = memberById(kidId);
      if (kidId && kidId !== memberId && kid && (kid.role === 'kid' || kid.role === 'teen')) {
        notifyRideAssignment('ride_confirmed_for_kid', [kidId], memberId, {
          eventTitle: confirmed.title, eventId: confirmed.id, eventTime: confirmed.time,
          driverName: memberById(memberId)?.name,
        });
      }
    }
    showToast(useSeriesForward ? 'Confirmed — future rides too ✓' : 'Confirmed ✓');
    return true;
  },

  // ── declineEventAssignment — the ONE place "I can't do this" happens ─────
  // Same consolidation — was independently hand-copied in the same 4
  // files as confirmEventAssignment above.
  declineEventAssignment: async (eventId, memberId, role, reason) => {
    const prevEvent = get().dayEvents.find(e => e.id === eventId) ?? get().rangeEvents.find(e => e.id === eventId);
    const { error } = await supabase.rpc('decline_event_assignment', {
      p_event_id: eventId, p_member_id: memberId, p_role: role, p_reason: reason ?? null,
    });
    if (error) {
      console.warn('[eventStore] declineEventAssignment failed', eventId, error.message);
      showToast("Couldn't do that — please try again", 'error');
      return false;
    }
    const { data: row } = await supabase.from('calendar_events').select('*').eq('id', eventId).single();
    let fresh: FamilyEvent | undefined;
    if (row) {
      fresh = fromRow(row);
      set({ dayEvents: sortByTime(get().dayEvents.map(e => e.id === eventId ? fresh! : e)) });
      set({ events: sortByTime(get().events.map(e => e.id === eventId ? fresh! : e)) });
      set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === eventId ? fresh! : e)) });
    }
    // Same notification gap as reassignEvent/confirmEventAssignment above —
    // this RPC path never went through updateEvent's own
    // updateEventNotifications, so whoever assigned this ride never heard
    // it was just declined. Mirrors updateEvent's own justDeclined branch:
    // notify whoever last assigned it (prevEvent.updatedBy) and the
    // requesting kid, excluding the decliner.
    if (fresh) {
      const declinerName = memberById(memberId)?.name;
      const recipients = new Set<string>();
      if (prevEvent?.updatedBy && prevEvent.updatedBy !== memberId) recipients.add(prevEvent.updatedBy);
      if (fresh.memberId && fresh.memberId !== memberId) recipients.add(fresh.memberId);
      if (recipients.size) {
        let minutesUntil: number | undefined;
        if (fresh.date && fresh.time) {
          const [h, m] = fresh.time.split(':').map(Number);
          const at = new Date(`${fresh.date}T00:00:00`);
          at.setHours(h, m, 0, 0);
          minutesUntil = (at.getTime() - Date.now()) / 60000;
        }
        notifyRideAssignment('ride_assignment_declined', [...recipients], memberId, {
          eventTitle: fresh.title, eventId: fresh.id, byName: declinerName,
          imminent: minutesUntil !== undefined && minutesUntil >= 0 && minutesUntil <= 60,
        });
      }
    }
    return true;
  },

  // ── remindEventAssignee — an actual push, not a fake toast ────────────────
  // Live-caught bug: "Remind" (HelperEventCard.tsx and EventDetailSheet)
  // only ever showed "Reminder sent ✓" — nothing was actually sent to
  // anyone, no push, no chat message, no DB row. One file's stub got
  // copied into the other with the fakeness intact. This sends a real
  // family-notifier push + persisted in-app notification to the pending
  // assignee, same delivery path every other real notification in this
  // app already uses (choreStore's notifyChorePing, family-notifier's own
  // 'custom' type).
  remindEventAssignee: async (eventId, assigneeId, assigneeName, fromMemberId) => {
    const familyId = getFamilyId();
    if (!familyId || !assigneeId || assigneeId === fromMemberId) {
      showToast("Couldn't send — please try again", 'error');
      return false;
    }
    const target = get().dayEvents.find(e => e.id === eventId) ?? get().rangeEvents.find(e => e.id === eventId);
    const fromName = memberById(fromMemberId)?.name ?? 'A parent';
    const { error } = await supabase.functions.invoke('family-notifier', {
      body: {
        type: 'custom', familyId, memberIds: [assigneeId], persist: true,
        excludeMemberId: fromMemberId,
        payload: {
          title: '🔔 Reminder',
          body: `${fromName} is checking in on "${target?.title ?? 'a ride'}" — still good to go?`,
          data: { screen: 'Schedule', eventId },
        },
      },
    });
    if (error) {
      console.warn('[eventStore] remindEventAssignee failed', eventId, error.message);
      showToast("Couldn't send — please try again", 'error');
      return false;
    }
    showToast(`Reminder sent to ${assigneeName.split(' ')[0]} ✓`);
    return true;
  },

  // ── claimHelperSlot — compare-and-swap claim of an open GP/Teen slot ───────
  // Two grandparents both looking at the same isOpenToGrandparents ride (or
  // a GP and a teen both eligible for the same isOpenToTeens pickup) can
  // both tap "I'll Drive"/"I'll take it" within the same round-trip window.
  // Routing that through the plain updateEvent()/dbUpdate() path — an
  // unconditional `UPDATE ... WHERE id = ?` — means Postgres just
  // last-writer-wins with no error surfaced to the loser: both devices'
  // optimistic local state would show themselves as the confirmed
  // helper/driver, but only one of them actually "won" server-side, and the
  // loser would silently keep believing they're on the hook for a ride they
  // aren't actually assigned to. Same race shape as choreStore.ts's
  // claimBounty() (search `.is('assigned_to_id', null)` there) — mirrors
  // that pattern: apply the optimistic update locally exactly like
  // updateEvent would, but send the real DB write with a conditional WHERE
  // that only the current still-open state (both statuses currently unset)
  // can satisfy, and roll back the optimistic claim if the 0-row result
  // shows someone else already landed first.
  // Now backed by the claim_event_slot Postgres RPC (see migration
  // 20260905110000_event_participant_rpcs.sql) instead of a hand-rolled
  // .is(dbStatusCol, null) conditional UPDATE — the RPC's insert into
  // event_participants under a unique constraint is a real CAS the
  // database itself enforces, not a client-side race against a nullable
  // column. Same public signature/behavior (optimistic update, rollback on
  // loss/rejection, onWon/onError callbacks, series propagation, creator
  // notification) so no caller needs to change.
  claimHelperSlot: async (id, role, claimantName, extra, onWon, onError) => {
    const statusField = role === 'driver' ? 'driverStatus' : 'helperStatus';
    const nameField    = role === 'driver' ? 'driverName'   : 'helper';
    const claimantId = getActiveMemberId();

    // DB-is-truth: the RPC's own CAS insert (unique constraint on
    // event_participants) is what actually decides "first tap wins," same
    // as before — the local claim is no longer applied before knowing the
    // outcome, so there's nothing to roll back on a loss/error, and the
    // winner's screen renders the server's own confirmed row directly.
    const { data, error } = await supabase.rpc('claim_event_slot', {
      p_event_id: id, p_member_id: claimantId, p_role: role, p_actor_id: claimantId,
    });
    if (error) {
      console.warn('[eventStore] claimHelperSlot RPC failed', id, error.message);
      onError?.(
        error.message.includes('gp_weekly_ride_cap_exceeded')
          ? "You've reached your weekly ride limit."
          // Server-side backstop for a ride that isn't actually open to
          // this claimant's role — should never fire from the normal UI
          // (the pool/picker already only offers open rides), but can
          // if the underlying row changed between load and claim.
          : error.message.includes('not_open_to_grandparents') || error.message.includes('not_open_to_teens')
          ? "This ride isn't open to you anymore — it may have changed since you last checked."
          : "Couldn't confirm this — please try again."
      );
      return;
    }
    const won = Array.isArray(data) ? data[0]?.claimed : (data as any)?.claimed;
    // Either way (won or lost), re-fetch the real row and render exactly
    // what the server has — for a loser this shows who actually won; for
    // the winner this is the server's own confirmed row, not a guess.
    const { data: row } = await supabase.from('calendar_events').select('*').eq('id', id).single();
    if (row) {
      const fresh = fromRow(row);
      const nextDay = sortByTime(get().dayEvents.map(e => e.id === id ? fresh : e));
      set({ dayEvents: nextDay, events: nextDay });
      set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === id ? fresh : e)) });
    }
    if (!won) {
      console.warn('[eventStore] claimHelperSlot lost the race on', id);
      return;
    }
    // Claim actually landed in the DB — safe for the caller to do
    // anything gated on genuinely winning (e.g. awarding ride coins),
    // instead of doing it optimistically before the outcome is known.
    onWon?.();

    // extra carries fields the RPC itself doesn't know about (e.g.
    // pickup notes) — same scoped-write pattern as before: only write
    // the keys extra actually names, never a full-row snapshot.
    if (extra) {
      const merged = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
      if (merged) {
        const dbPatch = toRowPartial(merged, Object.keys(extra) as (keyof FamilyEvent)[]);
        const { data: extraRow, error: extraErr } = await supabase.from('calendar_events').update(dbPatch).eq('id', id).select().maybeSingle();
        if (extraErr) {
          console.warn('[eventStore] claimHelperSlot extra-fields write failed', id, extraErr.message);
        } else if (extraRow) {
          const fresh = fromRow(extraRow);
          const nextDay = sortByTime(get().dayEvents.map(e => e.id === id ? fresh : e));
          set({ dayEvents: nextDay, events: nextDay });
          set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === id ? fresh : e)) });
        }
      }
    }

    // Recurring QA sweep found the "initial accept propagates to the
    // series" rule (Round 7) only ever applied to the parent-assignment
    // path (RideRequestCard/RideRequiredEventCard/HelperEventCard all
    // call updateEventScoped(..., 'following')) — a GP/teen self-claim
    // via this function never propagated at all, silently leaving every
    // later occurrence unassigned/open even though the same driver just
    // confirmed for the first one. Mirror the parent-assignment
    // behavior here so both paths agree.
    const wonRow = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    if (wonRow?.seriesId) {
      await get().updateEventScoped(id, { [nameField]: claimantName, [statusField]: 'confirmed' } as Partial<FamilyEvent>, 'following');
    }

    // Notify the event creator their open slot was just filled — this
    // only runs on the confirmed winner's branch (a lost race returns
    // above and never reaches here), so exactly one notification fires
    // per slot. Same require()-based cross-store call as choreStore.ts's
    // declineGrandparentQuest/recallParentQuest (no static import, to
    // avoid a store-to-store import cycle).
    //
    // Was: chat-only — the creator's own bell/push never fired, only a
    // thread message easy to miss (same "chat instead of a real
    // notification" gap updateEvent's decline/confirm paths above had).
    // The chat message is kept as an in-thread record; a real
    // family-notifier call is added alongside it. Also — was: the
    // requesting kid was never told at all that a GP/teen self-claim
    // (as opposed to a parent-driven reassignment via updateEvent)
    // just confirmed their ride. A parent reassignment and a GP/teen
    // self-claim are two different code paths that both end in "a
    // driver is now confirmed," so this reuses updateEvent's own
    // 'ride_confirmed_for_kid' type rather than inventing a
    // near-duplicate — same title/body the kid would get either way.
    try {
      const merged = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
      const creatorId = merged?.createdBy;
      if (creatorId && creatorId !== claimantId) {
        const { useChatStore } = require('@/store/chatStore');
        const roleLabel = role === 'driver' ? 'driver' : 'helper';
        useChatStore.getState().sendMessage(creatorId, claimantId ?? creatorId,
          `✅ ${claimantName} confirmed as ${roleLabel} for "${merged?.title ?? 'your event'}"`);
        notifyRideAssignment('ride_assignment_accepted', [creatorId], claimantId, {
          eventTitle: merged?.title, eventId: id, byName: claimantName,
        });
      }
      const kidId = merged?.memberId;
      const kid = memberById(kidId);
      if (kidId && kidId !== claimantId && kid && (kid.role === 'kid' || kid.role === 'teen')) {
        notifyRideAssignment('ride_confirmed_for_kid', [kidId], claimantId, {
          eventTitle: merged?.title, eventId: id, eventTime: merged?.time,
          driverName: claimantName,
        });
      }
    } catch (e) {
      console.warn('[eventStore] claimHelperSlot creator notification failed', e);
    }
  },

  deleteEvent: async (id) => {
    const prev = get().dayEvents;
    const prevRange = get().rangeEvents;
    const deletedEvent = prev.find(e => e.id === id) ?? prevRange.find(e => e.id === id);
    const actorId = getActiveMemberId();
    // DB-is-truth: await the soft-delete and only remove the event from
    // local state (and fire the activity log / notifications below) once
    // the server has actually confirmed it — previously those all fired
    // unconditionally, before the write's own outcome was known, so a
    // rejected delete could still notify people the event was gone and log
    // a "deleted" activity row for something that, server-side, never
    // actually got deleted.
    const { error } = await supabase.from('calendar_events')
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
      .eq('id', id);
    if (error) {
      console.warn('[eventStore] deleteEvent failed', id, error.message);
      showToast("Couldn't delete — check your connection and try again", 'error');
      return;
    }
    const next = prev.filter(e => e.id !== id);
    set({ dayEvents: next, events: next });
    set({ rangeEvents: prevRange.filter(e => e.id !== id) });

    // Personal-calendar 2-way sync — only push the delete once confirmed,
    // same reasoning as updateEvent's own sync push.
    const familyId = getFamilyId();
    if (familyId && deletedEvent?.createdBy) {
      supabase.functions.invoke('calendar-sync-push', {
        body: { eventId: id, familyId, memberId: deletedEvent.createdBy, action: 'delete' },
      }).catch(e => console.warn('[eventStore] deleteEvent calendar-sync-push failed:', e?.message));
    }
    if (deletedEvent?.createdBy && isAppleCalendarSyncEnabled(deletedEvent.createdBy)) {
      import('@/lib/calendarSync2Way').then(({ pushEventToAppleCalendar }) =>
        pushEventToAppleCalendar(deletedEvent.createdBy!, null, id, 'delete')
      ).catch(e => console.warn('[eventStore] deleteEvent Apple sync failed:', e?.message));
    }

    logActivity({ entityType: 'event', entityId: id, familyId: getFamilyId(), actorId, action: 'deleted' });
    // Audit finding — deleting an event told nobody it was gone: not the
    // person it was for (memberId), not a confirmed driver/helper. Same
    // "this left your hands with zero signal" gap as choreStore.ts's
    // deleteChore. eventAssignee() now returns a real member id directly
    // (driver_id/helper_id columns) — was resolving by name via a members
    // lookup, fragile (rename, shared first name) and no longer necessary.
    if (deletedEvent) {
      if (familyId) {
        const recipientIds = new Set<string>();
        if (deletedEvent.memberId && deletedEvent.memberId !== actorId) recipientIds.add(deletedEvent.memberId);
        try {
          const assignee = eventAssignee(deletedEvent);
          let assigneeId = assignee.id;
          // Fallback only for an external, non-member assignee with no id
          // at all (or an older row from before the id columns existed).
          if (!assigneeId && assignee.name) {
            const { useFamilyStore } = require('@/store/familyStore');
            const members = useFamilyStore.getState().members as any[];
            assigneeId = members.find(m => m.name === assignee.name)?.id;
          }
          if (assigneeId && assigneeId !== actorId) recipientIds.add(assigneeId);
        } catch (e) {
          console.warn('[eventStore] deleteEvent assignee lookup failed', e);
        }
        if (recipientIds.size) {
          supabase.functions.invoke('family-notifier', {
            body: {
              type: 'event_deleted', familyId, memberIds: [...recipientIds], persist: true,
              excludeMemberId: actorId ?? undefined,
              payload: { eventId: id, eventTitle: deletedEvent.title, byName: memberById(actorId)?.name },
            },
          }).catch(e => console.warn('[eventStore] deleteEvent notify failed:', e?.message));
        }
      }
    }
    // Also refresh strip for that date (category count may drop to zero)
    const ev = prev.find(e => e.id === id);
    if (ev?.date && ev.category) {
      const remaining = next.filter(e => e.date === ev.date && e.category === ev.category);
      if (remaining.length === 0) {
        const sm = { ...get().stripMap };
        sm[ev.date] = (sm[ev.date] ?? []).filter(c => c !== ev.category);
        set({ stripMap: sm });
        AsyncStorage.setItem(DISK_STRIP, JSON.stringify(sm));
      }
      // Drop this event's row from stripRows too — otherwise a deleted
      // event keeps producing a per-member dot forever.
      set({ stripRows: get().stripRows.filter(r =>
        !(r.date === ev.date && r.category === ev.category && r.memberId === ev.memberId)) });
    }
  },

  addRecurringEvent: async (first, rule) => {
    // DB-is-truth: addEvent is awaited and returns the id the SERVER
    // assigned to the confirmed anchor row (addEvent itself is now
    // server-first — see its own comment).
    const anchorId = await get().addEvent({ ...first, recurrenceRule: rule, isSeriesAnchor: true });
    if (!anchorId) return '';

    const dates = generateOccurrenceDates(first.date, rule, 1);
    // A daily rule with no end date generates up to RECURRENCE_WINDOW_DAYS
    // (84) occurrence dates — live-tested crash: looping get().addEvent()
    // once per date fired 84 separate rounds of ~5 synchronous set() calls
    // each (dayEvents/rangeEvents/_rangeCache/stripMap/stripRows), well
    // over 400 store updates in one tight synchronous loop, which blew
    // React's "Maximum update depth exceeded" render-depth guard. Each
    // occurrence is still a full independent row (editing one, e.g. adding
    // a note to Wednesday's class only, must never touch the others — same
    // independence guarantee the chore team-clone pattern established
    // elsewhere), but they're now built as one batch and applied to local
    // state / the DB in a single round-trip, not one at a time — and (per
    // the DB-is-truth conversion) only AFTER that round-trip confirms, from
    // the server's own returned rows, never from the client-built draft.
    const now = new Date().toISOString();
    const createdBy = first.createdBy ?? getActiveMemberId() ?? undefined;
    // Same untrimmed-title normalization as addEvent — this batch path
    // spreads `first` directly rather than going through addEvent per
    // occurrence (see comment above), so every occurrence after the
    // anchor needs its own copy of the trim.
    const trimmedTitle = first.title?.trim() ?? first.title;
    const draftOccurrences: FamilyEvent[] = dates.map((date, i) => ({
      ...first,
      title: trimmedTitle,
      id: `ev${Date.now()}_${i}`,
      date,
      seriesId: anchorId,
      isSeriesAnchor: false,
      recurrenceRule: undefined,
      createdBy,
      createdAt: now,
    }));

    if (draftOccurrences.length > 0) {
      const { data: rows, error } = await supabase.from('calendar_events').insert(draftOccurrences.map(toRow)).select();
      if (error || !rows) {
        console.warn('[eventStore] batched recurring insert failed', error?.message);
        showToast("Couldn't save the recurring series — check your connection and try again", 'error');
        return anchorId;
      }
      const occurrences = rows.map(fromRow);

      const currentDate = get().currentDate;
      const sameDayOccurrences = occurrences.filter(ev => ev.date === currentDate);
      if (sameDayOccurrences.length > 0) {
        const next = sortByTime([...get().dayEvents, ...sameDayOccurrences]);
        set({ dayEvents: next, events: next });
        const entry = get()._dayCache[currentDate];
        if (entry) set({ _dayCache: { ...get()._dayCache, [currentDate]: { ...entry, events: next } } });
      }

      const rangeNext = sortByTime([...get().rangeEvents, ...occurrences]);
      set({ rangeEvents: rangeNext });
      const rc = get()._rangeCache;
      let rangeCacheChanged = false;
      const nextRangeCache = { ...rc };
      for (const key of Object.keys(rc)) {
        const [from, to] = key.split(':');
        const inRange = occurrences.filter(ev => ev.date >= from && ev.date <= to);
        if (inRange.length > 0) {
          nextRangeCache[key] = { ...rc[key], events: sortByTime([...rc[key].events, ...inRange]) };
          rangeCacheChanged = true;
        }
      }
      if (rangeCacheChanged) set({ _rangeCache: nextRangeCache });

      const cat = first.category;
      if (cat) {
        const sm = { ...get().stripMap };
        const stripRows = [...get().stripRows];
        for (const ev of occurrences) {
          if (!sm[ev.date]?.includes(cat)) sm[ev.date] = [...(sm[ev.date] ?? []), cat];
          stripRows.push({ date: ev.date, category: cat, memberId: ev.memberId, helper: ev.helper, driverName: ev.driverName });
        }
        set({ stripMap: sm, stripRows });
      }
    }

    // seriesId is stamped as a follow-up updateEvent rather than folded into
    // the initial addEvent() call because the anchor's own id (what
    // seriesId needs to be) doesn't exist until addEvent creates it.
    // updateEvent is itself now server-first (awaited here too) so this
    // function's own return only happens once every write it depends on
    // has actually been confirmed by the database.
    await get().updateEvent(anchorId, { seriesId: anchorId });
    return anchorId;
  },

  extendRecurringSeries: async (seriesId) => {
    const anchor = get().dayEvents.find(e => e.id === seriesId && e.isSeriesAnchor)
      ?? get().rangeEvents.find(e => e.id === seriesId && e.isSeriesAnchor);
    if (!anchor?.recurrenceRule) {
      console.warn('[eventStore] extendRecurringSeries: anchor not loaded or not a series anchor', seriesId);
      return;
    }
    const { data: latestRows } = await supabase.from('calendar_events')
      .select('date')
      .eq('series_id', seriesId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(1);
    const latestDate = latestRows?.[0]?.date ?? anchor.date;
    const { count } = await supabase.from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('series_id', seriesId)
      .is('deleted_at', null);
    const dates = generateOccurrenceDates(latestDate, anchor.recurrenceRule!, count ?? 1);
    if (dates.length === 0) return;
    const { id: _anchorId, ...anchorRest } = anchor;
    // Was: get().addEvent(...) looped once per generated date — same
    // unbatched shape addRecurringEvent's own header comment documents
    // already live-crashing "Maximum update depth exceeded" for (one
    // INSERT + several synchronous set() calls PER occurrence, plus a
    // realtime echo per row). Mirrors addRecurringEvent's already-fixed
    // batching: build every occurrence in memory, write to the DB once,
    // and (per the DB-is-truth conversion) apply local state only AFTER
    // that write confirms, from the server's own returned rows.
    const now = new Date().toISOString();
    const createdBy = anchor.createdBy ?? getActiveMemberId() ?? undefined;
    const draftOccurrences: FamilyEvent[] = dates.map((date, i) => ({
      ...anchorRest,
      id: `ev${Date.now()}_${i}`,
      date, seriesId, isSeriesAnchor: false, recurrenceRule: undefined,
      createdBy, createdAt: now,
    }));

    const { data: rows, error } = await supabase.from('calendar_events').insert(draftOccurrences.map(toRow)).select();
    if (error || !rows) {
      console.warn('[eventStore] extendRecurringSeries: batched insert failed', error?.message);
      return;
    }
    const occurrences = rows.map(fromRow);

    const currentDate = get().currentDate;
    const sameDayOccurrences = occurrences.filter(ev => ev.date === currentDate);
    if (sameDayOccurrences.length > 0) {
      const next = sortByTime([...get().dayEvents, ...sameDayOccurrences]);
      set({ dayEvents: next, events: next });
      const entry = get()._dayCache[currentDate];
      if (entry) set({ _dayCache: { ...get()._dayCache, [currentDate]: { ...entry, events: next } } });
    }

    const rangeNext = sortByTime([...get().rangeEvents, ...occurrences]);
    set({ rangeEvents: rangeNext });
    const rc = get()._rangeCache;
    let rangeCacheChanged = false;
    const nextRangeCache = { ...rc };
    for (const key of Object.keys(rc)) {
      const [from, to] = key.split(':');
      const inRange = occurrences.filter(ev => ev.date >= from && ev.date <= to);
      if (inRange.length > 0) {
        nextRangeCache[key] = { ...rc[key], events: sortByTime([...rc[key].events, ...inRange]) };
        rangeCacheChanged = true;
      }
    }
    if (rangeCacheChanged) set({ _rangeCache: nextRangeCache });

    const cat = anchor.category;
    if (cat) {
      const sm = { ...get().stripMap };
      const stripRows = [...get().stripRows];
      for (const ev of occurrences) {
        if (!sm[ev.date]?.includes(cat)) sm[ev.date] = [...(sm[ev.date] ?? []), cat];
        stripRows.push({ date: ev.date, category: cat, memberId: ev.memberId, helper: ev.helper, driverName: ev.driverName });
      }
      set({ stripMap: sm, stripRows });
    }
  },

  updateEventScoped: (id, updates, scope) => {
    if (scope === 'this') {
      // Deliberately does NOT clear seriesId — every occurrence needs to
      // stay findable-as-part-of-the-series (extendRecurringSeries,
      // deleteEventScoped's anchor-promotion, and this function's own
      // 'following'/'all' branches below all locate occurrences via
      // `.eq('series_id', ...)`; detaching this row would make it
      // invisible to a legitimate later bulk edit/delete across the whole
      // series, and to the anchor-promotion logic if this happened to be
      // the next occurrence after a deleted anchor). A prior version of
      // this comment claimed a 'this' edit detaches the row from the
      // series — that was never actually implemented, and turned out to
      // be the wrong fix on inspection: it would have broken more than it
      // fixed. The real, narrower risk this comment used to describe (a
      // later 'following' assignment sweeping in and overwriting a
      // one-off 'this'-scoped assignee change on the same series) is real
      // but rare — flagged here rather than "fixed" with an unverified
      // change (QA sweep, parent-role audit, Medium M1 — re-assessed).
      get().updateEvent(id, updates);
      return;
    }
    const target = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    if (!target?.seriesId) { get().updateEvent(id, updates); return; }

    // Same untrimmed-title normalization as updateEvent — this bulk path
    // bypasses updateEvent entirely (see comment below), so it needs its
    // own copy of the trim rather than inheriting it.
    if ('title' in updates && typeof updates.title === 'string') {
      updates = { ...updates, title: updates.title.trim() };
    }

    (async () => {
      const { data, error: lookupError } = await supabase.from('calendar_events')
        .select('id, date')
        .eq('series_id', target.seriesId)
        .is('deleted_at', null);
      if (lookupError || !data) { console.warn('[eventStore] updateEventScoped: series lookup failed', lookupError?.message); return; }
      const ids = (scope === 'all' ? data : data.filter(r => r.date >= target.date)).map(r => r.id);
      if (ids.length === 0) return;
      // Was: for (const rowId of ids) get().updateEvent(rowId, updates) —
      // a daily series materializes up to 84 rows (RECURRENCE_WINDOW_DAYS),
      // so "This and following"/"All events" fired up to 84 separate
      // updateEvent calls, each doing 2 synchronous set()s PLUS its own
      // DB write, PLUS the resulting ~84 realtime echo-backs each calling
      // setState again — enough rapid-fire React re-renders in one tick
      // to trip "Maximum update depth exceeded" and crash (live-reported).
      // updateEvent's per-row side effects (decline auto-reopen, activity
      // log, chat notification) only make sense for a single occurrence's
      // status change anyway, not a bulk date/time shift — so this skips
      // them here and does one batched DB write instead of looping the
      // single-row path.
      const idSet = new Set(ids);
      // Assignment status (confirmed/pending/rejected) is a per-
      // OCCURRENCE decision, not a bulk property of the series — live-
      // reported bug: editing ONE recurring Ride while self-assigned as
      // helper/driver correctly auto-confirms (per the self-assignment
      // rule elsewhere in this file), but that confirm then got bulk-
      // applied to all ~84 occurrences via a single 'following'/'all'
      // edit, retroactively confirming rides months out that were never
      // individually reviewed. Drop the incoming status here — a
      // genuine per-occurrence confirm/decline still goes through
      // updateEvent (scope 'this') or the RPCs (confirm/decline/
      // reassign_event), never this batched path. If the bulk patch DOES
      // change who the helper/driver actually is, every occurrence's
      // status resets to 'pending' instead (never silently keeping
      // whatever the PREVIOUS assignee's status happened to be, which
      // would otherwise misattribute a stale 'confirmed' to someone new
      // who never confirmed anything) — otherwise status is left alone.
      // The ONE exception, carrying forward this session's live-reported
      // self-assignment fix: the caller assigning THEMSELVES with an
      // explicit 'confirmed' status is trusted, same as every other
      // self-assignment path in the app — everyone else's assignment still
      // resets to 'pending' unconditionally.
      const { helperStatus: _hs, driverStatus: _ds, ...restUpdates } = updates;
      const callerId = getActiveMemberId();
      const isSelfDriverAssign = ('driverId' in updates || 'driverName' in updates)
        && updates.driverId != null && updates.driverId === callerId && updates.driverStatus === 'confirmed';
      const isSelfHelperAssign = ('helperId' in updates || 'helper' in updates)
        && updates.helperId != null && updates.helperId === callerId && updates.helperStatus === 'confirmed';
      const statusReset = {
        ...(('helperId' in updates || 'helper' in updates)
          ? { helperStatus: isSelfHelperAssign ? 'confirmed' as const : 'pending' as const } : {}),
        ...(('driverId' in updates || 'driverName' in updates)
          ? { driverStatus: isSelfDriverAssign ? 'confirmed' as const : 'pending' as const } : {}),
      };
      const stamped = { ...restUpdates, ...statusReset, updatedBy: callerId ?? undefined, updatedAt: new Date().toISOString() };
      const patch = toRowPartial(stamped as FamilyEvent, Object.keys(stamped) as (keyof FamilyEvent)[]);
      // DB-is-truth: the write is awaited and its own confirmed rows drive
      // local state — nothing here is a guess about what the server will
      // decide. This closes the exact bug this function used to have (no
      // rollback at all on write failure — local state stayed "success"
      // even when the DB write silently failed).
      const { data: updatedRows, error: updateError } = await supabase.from('calendar_events')
        .update(patch).in('id', ids).select();
      if (updateError || !updatedRows) {
        console.warn('[eventStore] updateEventScoped: bulk update failed', updateError?.message);
        return;
      }
      const byId = new Map(updatedRows.map(row => [row.id, fromRow(row)]));
      const patchOne = (e: FamilyEvent) => idSet.has(e.id) ? (byId.get(e.id) ?? e) : e;
      set({
        dayEvents:   sortByTime(get().dayEvents.map(patchOne)),
        events:      sortByTime(get().events.map(patchOne)),
        rangeEvents: sortByTime(get().rangeEvents.map(patchOne)),
      });
    })();
  },

  deleteEventScoped: async (id, scope) => {
    if (scope === 'this') {
      // Deleting just the ANCHOR occurrence used to silently end the whole
      // series — recurrenceRule lives ONLY on the anchor row, and both
      // extendRecurringSeries and CalendarScreen's auto-extend sweep can
      // only find a live series by querying is_series_anchor=true. With no
      // promotion, the other occurrences stayed independently intact (they
      // don't reference the anchor for anything at read time) but the
      // series silently stopped generating new future rows once the
      // rolling RECURRENCE_WINDOW_DAYS horizon was reached — no error, no
      // signal, just quietly ending months later (QA Round 7, finding B3).
      const target = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
      if (target?.isSeriesAnchor && target.seriesId && target.recurrenceRule) {
        const { data } = await supabase.from('calendar_events')
          .select('id, date')
          .eq('series_id', target.seriesId)
          .neq('id', id)
          .is('deleted_at', null)
          .order('date', { ascending: true })
          .limit(1);
        const heir = data?.[0];
        // Promote the heir BEFORE deleting the old anchor — deleteEvent
        // and updateEvent are both server-first now, so awaiting this
        // order guarantees a real anchor exists at every point in time,
        // never a window with none.
        if (heir) await get().updateEvent(heir.id, { isSeriesAnchor: true, recurrenceRule: target.recurrenceRule });
        await get().deleteEvent(id);
        return;
      }
      await get().deleteEvent(id);
      return;
    }
    const target = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    if (!target?.seriesId) { await get().deleteEvent(id); return; }

    const { data, error } = await supabase.from('calendar_events')
      .select('id, date')
      .eq('series_id', target.seriesId)
      .is('deleted_at', null);
    if (error || !data) { console.warn('[eventStore] deleteEventScoped: series lookup failed', error?.message); return; }
    const ids = (scope === 'all' ? data : data.filter(r => r.date >= target.date)).map(r => r.id);
    if (ids.length === 0) return;
    // Live-crashed: "Maximum update depth exceeded" from
    // Promise.all(ids.map(deleteEvent)) — a large series (up to 84 rows)
    // fired 84 CONCURRENT calls into deleteEvent, each snapshotting
    // dayEvents/rangeEvents at its own entry time and then calling set()
    // from that now-stale snapshot once its own DB write resolved. Besides
    // the render storm (84 rapid-fire store updates in one burst, tripping
    // React's render-depth guard), this was a genuine correctness race —
    // two concurrent deletes computing `next` from the same stale `prev`
    // could each "resurrect" a row the other had just removed. Same root
    // cause, same fix shape as addRecurringEvent's own comment above:
    // await every DB write first, then apply exactly ONE local-state
    // commit from the current (not stale) state, instead of N racing ones.
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const actorId = getActiveMemberId();
    const deletedEvents = ids
      .map(rowId => get().dayEvents.find(e => e.id === rowId) ?? get().rangeEvents.find(e => e.id === rowId))
      .filter((e): e is FamilyEvent => !!e);
    const results = await Promise.all(ids.map(rowId =>
      supabase.from('calendar_events').update({ deleted_at: now, deleted_by: actorId }).eq('id', rowId)
    ));
    const failedIds = new Set(ids.filter((_, i) => results[i].error));
    if (failedIds.size > 0) {
      console.warn('[eventStore] deleteEventScoped: some deletes failed', [...failedIds]);
      showToast("Couldn't delete some occurrences — please try again", 'error');
    }
    const confirmedIds = new Set([...idSet].filter(rowId => !failedIds.has(rowId)));
    if (confirmedIds.size === 0) return;
    const nextDay = get().dayEvents.filter(e => !confirmedIds.has(e.id));
    const nextRange = get().rangeEvents.filter(e => !confirmedIds.has(e.id));
    set({ dayEvents: nextDay, events: nextDay, rangeEvents: nextRange });

    const familyId = getFamilyId();
    for (const deletedEvent of deletedEvents) {
      if (!confirmedIds.has(deletedEvent.id)) continue;
      logActivity({ entityType: 'event', entityId: deletedEvent.id, familyId, actorId, action: 'deleted' });
      if (familyId && deletedEvent.createdBy) {
        supabase.functions.invoke('calendar-sync-push', {
          body: { eventId: deletedEvent.id, familyId, memberId: deletedEvent.createdBy, action: 'delete' },
        }).catch(e => console.warn('[eventStore] deleteEventScoped calendar-sync-push failed:', e?.message));
      }
    }
  },
}));

// ── Util ──────────────────────────────────────────────────────────────────────
function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// How far ahead to materialize occurrence rows for an open-ended (or
// long-dated-end) recurring event. A weekly school class run indefinitely
// would otherwise need either an unbounded insert now (most of which the
// family will never see, and which can never pick up a later mid-series
// edit to the rule) or virtual expansion everywhere (the larger-blast-radius
// option deliberately not chosen for this feature — see the migration's own
// comment). A rolling window means extendRecurringSeries just needs calling
// periodically to keep pushing the horizon forward.
const RECURRENCE_WINDOW_DAYS = 84; // 12 weeks

// Every date `rule` implies strictly AFTER `fromDate`, capped by the window,
// rule.endDate, and rule.occurrences (whichever is most restrictive).
function generateOccurrenceDates(fromDate: string, rule: EventRecurrenceRule, existingCount: number): string[] {
  const windowEnd = offsetDate(fromDate, RECURRENCE_WINDOW_DAYS);
  const hardEnd = rule.endDate && rule.endDate < windowEnd ? rule.endDate : windowEnd;
  const remaining = rule.occurrences != null ? Math.max(0, rule.occurrences - existingCount) : Infinity;

  const dates: string[] = [];
  if (rule.frequency === 'daily') {
    let cursor = offsetDate(fromDate, 1);
    while (cursor <= hardEnd && dates.length < remaining) {
      dates.push(cursor);
      cursor = offsetDate(cursor, 1);
    }
  } else if (rule.frequency === 'weekly') {
    const days = rule.days?.length ? rule.days : [new Date(`${fromDate}T00:00:00`).getDay()];
    let cursor = offsetDate(fromDate, 1);
    while (cursor <= hardEnd && dates.length < remaining) {
      const dow = new Date(`${cursor}T00:00:00`).getDay();
      if (days.includes(dow)) dates.push(cursor);
      cursor = offsetDate(cursor, 1);
    }
  } else if (rule.frequency === 'monthly') {
    const [, , dStr] = fromDate.split('-');
    const dayOfMonth = Number(dStr);
    let [y, m] = fromDate.split('-').map(Number);
    while (dates.length < remaining) {
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      // Clamp to the month's actual last day (e.g. rule anchored on the
      // 31st skips to the last day of a 30-day month rather than rolling
      // over into the next month).
      const lastDayOfMonth = new Date(y, m, 0).getDate();
      const day = Math.min(dayOfMonth, lastDayOfMonth);
      const candidate = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (candidate > hardEnd) break;
      dates.push(candidate);
    }
  }
  return dates;
}
