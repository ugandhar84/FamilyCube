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
  memberId?: string;
  memberIds?: string[];
  type: EventType;
  color?: string;
  location?: string;
  notes?: string;
  allDay?: boolean;
  category?: string;
  helper?: string;
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
  approvalPending?: boolean;
  isOpenToGrandparents?: boolean;
  grandparentPassedIds?: string[];  // seniors who tapped Pass — hidden from their feed
  isOpenToTeens?: boolean;          // parent flag — shows in teen Junior Dispatch pool
  rideCoins?: number;               // optional coins reward set by parent — visible to teens only, never GPs

  // Drive assignment — separate from `helper` (tutor/escort/coach) for events
  // where an external tutor/escort/coach can be set while transport is a
  // distinct, parent-decided need (e.g. Ms. Rao tutors, Dad drives).
  rideRequired?: boolean;
  driverName?: string;
  driverStatus?: HelperStatus;

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
}

// Scenario 5.5 generalizes 2.6's rule to "any medical/health-tagged item,"
// so a Medical-category event is treated as sensitive even if the creator
// never touched the explicit privacy toggle — the two conditions OR
// together rather than requiring both.
export function isEventSensitive(e: Pick<FamilyEvent, 'privacyLevel' | 'category'>): boolean {
  return e.privacyLevel === 'private' || e.category === 'Medical';
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
  e: Pick<FamilyEvent, 'memberId' | 'memberIds' | 'sharedWithGPForCare' | 'helper' | 'driverName'>,
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
  return 'hidden'; // sibling kid/teen: hidden entirely, no busy-block
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
  selectDate:    (date: string) => Promise<void>;
  loadMoreDay:   () => Promise<void>;
  loadStrip:     (dates: string[]) => Promise<void>;
  loadRange:     (from: string, to: string) => Promise<void>;
  prefetchDate:  (date: string) => void;

  // Compat shims
  loadFromStorage: () => Promise<void>;
  syncFromDB:      () => Promise<void>;

  // Mutations (optimistic)
  addEvent:    (e: Omit<FamilyEvent, 'id'>) => string;
  updateEvent: (id: string, updates: Partial<FamilyEvent>) => void;
  deleteEvent: (id: string) => void;

  // Creates a recurring event: the first occurrence (on `first.date`) plus
  // every future occurrence implied by `rule`, materialized as real rows up
  // to a rolling window (see generateOccurrenceDates's own comment for why
  // a window instead of generating to endDate/occurrences all at once).
  // Returns the id of the first (anchor) occurrence.
  addRecurringEvent: (first: Omit<FamilyEvent, 'id'>, rule: EventRecurrenceRule) => string;

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
  ) => void;

  // Scenario 2.11 — a member's Going/Not-Going/Maybe response to an
  // isOptionalRsvp event. Plain optimistic + DB write (no CAS needed — an
  // RSVP is a per-member key in a shared map, so two different members
  // responding concurrently can't collide, and one member re-responding is
  // just overwriting their own prior answer, not racing anyone else).
  respondToRsvp: (id: string, memberId: string, response: 'going' | 'not_going' | 'maybe') => void;
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

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
    allDay:            row.all_day ?? false,
    type:              row.type ?? 'event',
    category:          row.category ?? 'Event',
    color:             row.color ?? undefined,
    memberId:          row.member_id ?? undefined,
    memberIds:         row.member_ids ?? undefined,
    location:          row.location ?? undefined,
    notes:             row.notes ?? undefined,
    helper:            row.helper_name ?? undefined,
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
    isOpenToGrandparents:   row.is_open_to_grandparents ?? false,
    grandparentPassedIds:   row.grandparent_passed_ids ?? [],
    isOpenToTeens:          row.is_open_to_teens ?? false,
    rideCoins:              row.ride_coins ?? undefined,
    rideRequired:           row.ride_required ?? false,
    driverName:             row.driver_name ?? undefined,
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
    isOptionalRsvp:         row.is_optional_rsvp ?? false,
    rsvps:                  (typeof row.rsvps === 'object' && row.rsvps) ? row.rsvps : undefined,
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
    is_open_to_grandparents:    ev.isOpenToGrandparents ?? false,
    grandparent_passed_ids:     ev.grandparentPassedIds ?? [],
    is_open_to_teens:           ev.isOpenToTeens ?? false,
    ride_coins:                 ev.rideCoins ?? null,
    ride_required:              ev.rideRequired ?? false,
    driver_name:                ev.driverName ?? null,
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
    is_optional_rsvp:           ev.isOptionalRsvp ?? false,
    rsvps:                      ev.rsvps ?? {},
  };
}

function dbUpdate(id: string, patch: Record<string, unknown>) {
  supabase.from('calendar_events').update(patch).eq('id', id).then(({ error }) => {
    if (error) console.warn('[eventStore] update failed', id, error.message);
  });
}

// ── Realtime ──────────────────────────────────────────────────────────────────
let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

function ensureRealtime(
  familyId: string,
  getState: () => EventState,
  setState: (s: Partial<EventState>) => void,
) {
  if (_rtFamilyId === familyId && _rtChannel) return; // already subscribed for this family
  if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; }
  _rtFamilyId = familyId;

  _rtChannel = supabase
    .channel(`cal:${familyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'calendar_events', filter: `family_id=eq.${familyId}` },
      (payload) => {
        const { currentDate, dayEvents, stripMap, _dayCache } = getState();
        const newRow  = payload.new as any;
        const oldRow  = payload.old as any;
        const rowDate: string = (newRow?.date ?? oldRow?.date ?? '').slice(0, 10);
        const isDeleted = !!newRow?.deleted_at;
        const cat: string = newRow?.category ?? '';

        // ── Strip map update ───────────────────────────────────────────────
        if (rowDate) {
          if (payload.eventType === 'DELETE' || isDeleted) {
            // Re-query that date's rows (still lightweight — 5 narrow columns)
            supabase
              .from('calendar_events')
              .select('category,member_id,helper_name,driver_name')
              .eq('family_id', familyId)
              .eq('date', rowDate)
              .is('deleted_at', null)
              .then(({ data }) => {
                if (!data) return;
                const cats = [...new Set(data.map((r: any) => r.category).filter(Boolean))];
                const next = { ...getState().stripMap, [rowDate]: cats };
                const rows: StripRow[] = data.map((r: any) => ({
                  date: rowDate, category: r.category, memberId: r.member_id ?? undefined,
                  helper: r.helper_name ?? undefined, driverName: r.driver_name ?? undefined,
                }));
                const nextRows = getState().stripRows.filter(r => r.date !== rowDate).concat(rows);
                setState({ stripMap: next, stripRows: nextRows });
                AsyncStorage.setItem(DISK_STRIP, JSON.stringify(next));
              });
          } else if (cat) {
            const next = stripMap[rowDate]?.includes(cat)
              ? stripMap
              : { ...stripMap, [rowDate]: [...(stripMap[rowDate] ?? []), cat] };
            const newRowEntry: StripRow = {
              date: rowDate, category: cat, memberId: newRow?.member_id ?? undefined,
              helper: newRow?.helper_name ?? undefined, driverName: newRow?.driver_name ?? undefined,
            };
            const nextRows = [...getState().stripRows, newRowEntry];
            setState({ stripMap: next, stripRows: nextRows });
            AsyncStorage.setItem(DISK_STRIP, JSON.stringify(next));
          }
        }

        // ── Day events update (only if rowDate === currentDate) ────────────
        if (rowDate !== currentDate) {
          // Invalidate prefetch cache for that date so next visit re-fetches
          const newCache = { ..._dayCache };
          delete newCache[rowDate];
          setState({ _dayCache: newCache });
          return;
        }

        let next: FamilyEvent[];
        if (payload.eventType === 'INSERT' && !isDeleted) {
          const ev = fromRow(newRow);
          if (dayEvents.find(e => e.id === ev.id)) return;
          next = sortByTime([...dayEvents, ev]);
        } else if (payload.eventType === 'UPDATE') {
          if (isDeleted) {
            next = dayEvents.filter(e => e.id !== newRow.id);
          } else {
            const ev = fromRow(newRow);
            next = sortByTime(dayEvents.map(e => e.id === ev.id ? ev : e));
          }
        } else if (payload.eventType === 'DELETE') {
          next = dayEvents.filter(e => e.id !== oldRow.id);
        } else return;

        setState({ dayEvents: next, events: next });
        // Update cache entry
        const entry = getState()._dayCache[currentDate];
        if (entry) {
          setState({ _dayCache: { ...getState()._dayCache, [currentDate]: { ...entry, events: next } } });
        }
        AsyncStorage.setItem(DISK_DAY, JSON.stringify({ date: currentDate, events: next }));
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
        const { rangeEvents } = getState();
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        const isDeleted = !!newRow?.deleted_at;

        let next: FamilyEvent[];
        if (payload.eventType === 'INSERT' && !isDeleted) {
          const ev = fromRow(newRow);
          if (rangeEvents.find(e => e.id === ev.id)) return;
          // Only append if it falls within the currently-loaded range —
          // matching addEvent's own optimistic-append reasoning (a date
          // outside the loaded window just won't show in these views
          // anyway, and we don't know the exact loaded bounds here).
          next = sortByTime([...rangeEvents, ev]);
        } else if (payload.eventType === 'UPDATE') {
          if (isDeleted) {
            next = rangeEvents.filter(e => e.id !== newRow.id);
          } else {
            const ev = fromRow(newRow);
            // Only patch if this event is already part of the loaded range —
            // an UPDATE to a row outside the window shouldn't pull it in.
            if (!rangeEvents.find(e => e.id === ev.id)) return;
            next = sortByTime(rangeEvents.map(e => e.id === ev.id ? ev : e));
          }
        } else if (payload.eventType === 'DELETE') {
          next = rangeEvents.filter(e => e.id !== oldRow.id);
        } else return;

        setState({ rangeEvents: next });
        // Invalidate the range cache too so a fresh loadRange() call
        // (e.g. switching view modes) doesn't clobber this with a stale
        // cached copy before the TTL naturally expires.
        setState({ _rangeCache: {} });
      }
    )
    .subscribe((status) => {
      console.log('[eventStore] realtime', status, familyId);
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
  selectDate: async (date: string) => {
    if (date === get().currentDate && !get().dayLoading && get().dayEvents.length > 0) return;

    // Cancel any in-flight request for the previous date
    _dayAbort?.abort();
    _dayAbort = new AbortController();
    const signal = _dayAbort.signal;

    const key = `day:${date}`;
    set({ currentDate: date, dayLoading: true });

    // ── Serve from SWR cache ──────────────────────────────────────────────
    const cached = get()._dayCache[date];
    const isFresh = cached && (Date.now() - cached.fetchedAt) < DAY_TTL_MS;
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
      if (!familyId) { set({ dayLoading: false, loaded: true }); return; }

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
  loadRange: async (from: string, to: string) => {
    const key = `${from}:${to}`;
    const cached = get()._rangeCache[key];
    const isFresh = cached && Date.now() - cached.fetchedAt < DAY_TTL_MS;
    if (cached) set({ rangeEvents: cached.events });
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
  loadFromStorage: async () => get().selectDate(today()),
  syncFromDB:      async () => {
    const cur = get().currentDate || today();
    // Invalidate cache for current date so selectDate re-fetches
    const newCache = { ...get()._dayCache };
    delete newCache[cur];
    set({ _dayCache: newCache });
    get().selectDate(cur);
  },

  // ── Mutations ─────────────────────────────────────────────────────────────
  addEvent: (e) => {
    const event: FamilyEvent = {
      ...e, id: 'ev' + Date.now(),
      createdBy: e.createdBy ?? getActiveMemberId() ?? undefined,
      createdAt: e.createdAt ?? new Date().toISOString(),
    };

    // Optimistic: add to current day if same date
    if (event.date === get().currentDate) {
      const next = sortByTime([...get().dayEvents, event]);
      set({ dayEvents: next, events: next });
      const entry = get()._dayCache[event.date];
      if (entry) set({ _dayCache: { ...get()._dayCache, [event.date]: { ...entry, events: next } } });
    }

    // Optimistic: add to rangeEvents (Week/Agenda) if it falls in the
    // currently loaded window — safe to always append+resort since a date
    // outside the loaded range just wouldn't be shown by those views' own
    // filtering anyway.
    const rangeNext = sortByTime([...get().rangeEvents, event]);
    set({ rangeEvents: rangeNext });

    // Optimistic: update strip map
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

    supabase.from('calendar_events').insert([toRow(event)]).then(({ error }) => {
      if (error) {
        console.warn('[eventStore] insert failed', error.message);
        // Rollback
        const rolledBack = get().dayEvents.filter(e => e.id !== event.id);
        set({ dayEvents: rolledBack, events: rolledBack });
        set({ rangeEvents: get().rangeEvents.filter(e => e.id !== event.id) });
      }
    });

    return event.id;
  },

  updateEvent: (id, updates) => {
    const prevEvent = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    // A parent-assigned ride that gets declined shouldn't just sit there —
    // auto-open it to the GP/Teen pool so it's immediately claimable by
    // someone else, instead of requiring the creating parent to notice the
    // decline and manually flip the toggles themselves.
    const justDeclined = updates.helperStatus === 'rejected' && prevEvent?.helperStatus !== 'rejected';
    const autoOpenOnDecline = justDeclined && prevEvent?.category === 'Ride'
      ? { isOpenToGrandparents: true, isOpenToTeens: true }
      : {};
    const stamped = {
      ...autoOpenOnDecline,
      ...updates,
      updatedBy: updates.updatedBy ?? getActiveMemberId() ?? undefined,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    };
    const prev = get().dayEvents;
    const next = sortByTime(prev.map(e => e.id === id ? { ...e, ...stamped } : e));
    set({ dayEvents: next, events: next });
    set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === id ? { ...e, ...stamped } : e)) });
    const updated = next.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    if (updated) {
      dbUpdate(id, toRow(updated));
    }
  },

  // Scenario 2.11 — RSVP is its own per-member map, not a status field on
  // the whole event, so this goes through updateEvent's normal optimistic
  // + DB-write path with just the one key changed rather than duplicating
  // that plumbing here.
  respondToRsvp: (id, memberId, response) => {
    const existing = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    if (!existing) return;
    get().updateEvent(id, { rsvps: { ...(existing.rsvps ?? {}), [memberId]: response } });
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
  claimHelperSlot: (id, role, claimantName, extra, onWon) => {
    const statusField = role === 'driver' ? 'driverStatus' : 'helperStatus';
    const nameField    = role === 'driver' ? 'driverName'   : 'helper';
    const dbStatusCol  = role === 'driver' ? 'driver_status' : 'helper_status';
    const dbNameCol    = role === 'driver' ? 'driver_name'   : 'helper_name';

    const patch: Partial<FamilyEvent> = {
      ...extra,
      [nameField]:   claimantName,
      [statusField]: 'confirmed',
      updatedBy: getActiveMemberId() ?? undefined,
      updatedAt: new Date().toISOString(),
    };

    const prevDay = get().dayEvents;
    const nextDay = sortByTime(prevDay.map(e => e.id === id ? { ...e, ...patch } : e));
    set({ dayEvents: nextDay, events: nextDay });
    set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === id ? { ...e, ...patch } : e)) });

    const dbPatch: Record<string, unknown> = { [dbNameCol]: claimantName, [dbStatusCol]: 'confirmed' };
    if (extra) {
      const merged = nextDay.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
      if (merged) Object.assign(dbPatch, toRow(merged));
    }

    supabase.from('calendar_events')
      .update(dbPatch)
      .eq('id', id)
      .is(dbStatusCol, null)
      .select('id')
      .then(({ data, error }) => {
        if (error) {
          console.warn('[eventStore] claimHelperSlot DB update failed', id, error.message);
          return;
        }
        if (!data || data.length === 0) {
          console.warn('[eventStore] claimHelperSlot lost the race on', id, '— rolling back local claim');
          // Re-fetch the row so the loser's UI reflects who actually won,
          // instead of just reverting to an unassigned/open state that no
          // longer matches the DB either.
          supabase.from('calendar_events').select('*').eq('id', id).single().then(({ data: row }) => {
            if (!row) return;
            const fresh = fromRow(row);
            const rollbackDay = get().dayEvents.map(e => e.id === id ? fresh : e);
            set({ dayEvents: sortByTime(rollbackDay), events: sortByTime(rollbackDay) });
            set({ rangeEvents: sortByTime(get().rangeEvents.map(e => e.id === id ? fresh : e)) });
            return;
          });
          return;
        }
        // Claim actually landed in the DB — safe for the caller to do
        // anything gated on genuinely winning (e.g. awarding ride coins),
        // instead of doing it optimistically before the outcome is known.
        onWon?.();

        // Notify the event creator their open slot was just filled — this
        // only runs on the confirmed winner's branch (0-row losers return
        // above and never reach here), so exactly one notification fires
        // per slot, not one per optimistic local claim. Same
        // require()-based cross-store call as choreStore.ts's
        // declineGrandparentQuest/recallParentQuest (no static import, to
        // avoid a store-to-store import cycle).
        try {
          const merged = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
          const creatorId = merged?.createdBy;
          const claimantId = getActiveMemberId();
          if (creatorId && creatorId !== claimantId) {
            const { useChatStore } = require('@/store/chatStore');
            const roleLabel = role === 'driver' ? 'driver' : 'helper';
            useChatStore.getState().sendMessage(creatorId, claimantId ?? creatorId,
              `✅ ${claimantName} confirmed as ${roleLabel} for "${merged?.title ?? 'your event'}"`);
          }
        } catch (e) {
          console.warn('[eventStore] claimHelperSlot creator notification failed', e);
        }
      });
  },

  deleteEvent: (id) => {
    const prev = get().dayEvents;
    const next = prev.filter(e => e.id !== id);
    set({ dayEvents: next, events: next });
    set({ rangeEvents: get().rangeEvents.filter(e => e.id !== id) });
    dbUpdate(id, { deleted_at: new Date().toISOString(), deleted_by: getActiveMemberId() });
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

  addRecurringEvent: (first, rule) => {
    const anchorId = get().addEvent({ ...first, recurrenceRule: rule, isSeriesAnchor: true });
    // seriesId is stamped as a follow-up updateEvent rather than folded into
    // the initial addEvent() call because the anchor's own id (what
    // seriesId needs to be) doesn't exist until addEvent creates it.
    get().updateEvent(anchorId, { seriesId: anchorId });

    const dates = generateOccurrenceDates(first.date, rule, 1);
    for (const date of dates) {
      // Each occurrence is a full independent row — editing/completing one
      // (e.g. adding a note to Wednesday's class only) never touches the
      // others, same independence guarantee the chore team-clone pattern
      // established elsewhere in this app. Only seriesId links them; the
      // rule itself lives solely on the anchor.
      get().addEvent({ ...first, date, seriesId: anchorId, isSeriesAnchor: false, recurrenceRule: undefined });
    }
    return anchorId;
  },

  extendRecurringSeries: (seriesId) => {
    const anchor = get().dayEvents.find(e => e.id === seriesId && e.isSeriesAnchor)
      ?? get().rangeEvents.find(e => e.id === seriesId && e.isSeriesAnchor);
    if (!anchor?.recurrenceRule) {
      console.warn('[eventStore] extendRecurringSeries: anchor not loaded or not a series anchor', seriesId);
      return;
    }
    supabase.from('calendar_events')
      .select('date')
      .eq('series_id', seriesId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const latestDate = data?.[0]?.date ?? anchor.date;
        supabase.from('calendar_events')
          .select('id', { count: 'exact', head: true })
          .eq('series_id', seriesId)
          .is('deleted_at', null)
          .then(({ count }) => {
            const dates = generateOccurrenceDates(latestDate, anchor.recurrenceRule!, count ?? 1);
            const { id: _anchorId, ...anchorRest } = anchor;
            for (const date of dates) {
              get().addEvent({
                ...anchorRest, date, seriesId, isSeriesAnchor: false, recurrenceRule: undefined,
              });
            }
          });
      });
  },

  updateEventScoped: (id, updates, scope) => {
    if (scope === 'this') {
      // A single-occurrence edit that touches recurrence-defining fields
      // (making it its own thing) should detach it from the series rather
      // than silently leaving a stray seriesId pointing at rows it no
      // longer resembles — mirrors how team-clone chores are independent
      // rows sharing only a teamGroupId, not additional constraints.
      get().updateEvent(id, updates);
      return;
    }
    const target = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    if (!target?.seriesId) { get().updateEvent(id, updates); return; }

    supabase.from('calendar_events')
      .select('id, date')
      .eq('series_id', target.seriesId)
      .is('deleted_at', null)
      .then(({ data, error }) => {
        if (error || !data) { console.warn('[eventStore] updateEventScoped: series lookup failed', error?.message); return; }
        const ids = (scope === 'all' ? data : data.filter(r => r.date >= target.date)).map(r => r.id);
        for (const rowId of ids) get().updateEvent(rowId, updates);
      });
  },

  deleteEventScoped: (id, scope) => {
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
        supabase.from('calendar_events')
          .select('id, date')
          .eq('series_id', target.seriesId)
          .neq('id', id)
          .is('deleted_at', null)
          .order('date', { ascending: true })
          .limit(1)
          .then(({ data }) => {
            const heir = data?.[0];
            if (heir) get().updateEvent(heir.id, { isSeriesAnchor: true, recurrenceRule: target.recurrenceRule });
            get().deleteEvent(id);
          });
        return;
      }
      get().deleteEvent(id);
      return;
    }
    const target = get().dayEvents.find(e => e.id === id) ?? get().rangeEvents.find(e => e.id === id);
    if (!target?.seriesId) { get().deleteEvent(id); return; }

    supabase.from('calendar_events')
      .select('id, date')
      .eq('series_id', target.seriesId)
      .is('deleted_at', null)
      .then(({ data, error }) => {
        if (error || !data) { console.warn('[eventStore] deleteEventScoped: series lookup failed', error?.message); return; }
        const ids = (scope === 'all' ? data : data.filter(r => r.date >= target.date)).map(r => r.id);
        for (const rowId of ids) get().deleteEvent(rowId);
      });
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
