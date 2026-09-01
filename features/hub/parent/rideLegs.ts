import { fmtTime } from '../hubUtils';
import type { FamilyEvent } from '@/store/eventStore';

// ─── Shared ride-leg parsing/forking ────────────────────────────────────────
// Both RideRequestCard (category:'Ride', helper/helperStatus field pair) and
// RideRequiredEventCard (any other category with rideRequired=true,
// driverName/driverStatus field pair) need the exact same "drop-off vs
// pickup vs both-ways" decoding and forking logic — previously only
// RideRequestCard had it, so a kid's Sports/Study/etc ride request (which
// always uses the driverName pair) rendered through the wrong card, wrote
// to fields nothing downstream read, and a both-ways fork orphaned a
// second event with the wrong category. Extracted here so both cards use
// one correct implementation.

const to24HourTime = (raw: string): string | undefined => {
  const normalized = raw.trim();
  if (/^\d{2}:\d{2}$/.test(normalized)) return normalized;
  const m = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return undefined;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const meridiem = m[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (meridiem === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// A kid choosing "Both ways / a different day" (multi-day trip — sleepaway
// camp, etc) knows the pickup DATE but never a time — this sentinel keeps
// that state distinguishable from "time already known" (a parent-created
// both-ways request) and from "nothing known yet" (same-day, the common
// case), so the pickup date shows up for the parent without falsely
// implying a time has already been set.
const UNKNOWN_TIME = '__unknown__';

export function parseRideMeta(encoded: string | undefined, fallbackDate?: string) {
  const rideCode = encoded?.startsWith('RIDE:') ? encoded : null;
  const isBothWays = rideCode === 'RIDE:both' || rideCode?.startsWith('RIDE:both:');
  const isDropoff  = rideCode === 'RIDE:dropoff';
  const isPickup   = rideCode === 'RIDE:pickup' || rideCode?.startsWith('RIDE:pickup:');
  let pickupDate = fallbackDate;
  let pickupTime: string | undefined;
  let pickupDateKnownOnly = false;

  if (rideCode?.startsWith('RIDE:both:') || rideCode?.startsWith('RIDE:pickup:')) {
    const payload = rideCode.slice(rideCode.indexOf(':', 5) + 1).trim();
    const localStamp = payload.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}|__unknown__)$/);
    if (localStamp) {
      pickupDate = localStamp[1];
      if (localStamp[2] === UNKNOWN_TIME) pickupDateKnownOnly = true;
      else pickupTime = localStamp[2];
    } else {
      pickupTime = to24HourTime(payload);
    }
  }

  return {
    isBothWays, isDropoff, isPickup, pickupDate, pickupTime, pickupDateKnownOnly,
    pickupLabel: pickupTime ? fmtTime(pickupTime) : undefined,
  };
}

export { UNKNOWN_TIME as RIDE_PICKUP_TIME_UNKNOWN };

// Adds 90 minutes to a 24h "HH:MM" time string, wrapping past midnight.
export function plus90Minutes(time: string | undefined): string {
  if (!time) return '17:30';
  const [h, m] = time.split(':').map(Number);
  const total = ((h ?? 0) * 60 + (m ?? 0) + 90) % (24 * 60);
  const wrapped = total < 0 ? total + 24 * 60 : total;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// Forks a both-ways ride request into 2 separate events — the drop-off leg
// (the original row, retitled) and a new pickup leg. `assigneePatch` lets
// the caller supply either the helper/helperStatus pair (Ride category) or
// driverName/driverStatus pair (rideRequired category) for the "self-drive"
// case, keeping this function field-pair-agnostic. The pickup leg always
// inherits the ORIGINAL event's category (previously hardcoded to 'Ride',
// which orphaned a kid's Sports/Study request into an unrelated-looking
// second calendar entry).
export async function forkRideLegs({
  ev, selfDrive, splitCoins, assigneePatch, updateEvent, addEvent, tryAutoDispatch, pickupTimeOverride,
}: {
  ev: FamilyEvent; selfDrive: boolean; splitCoins?: number;
  assigneePatch: (confirmed: boolean) => Partial<FamilyEvent>;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => Promise<void>;
  addEvent: (ev: Omit<FamilyEvent, 'id'>) => Promise<string>;
  tryAutoDispatch: (eventId: string) => void;
  // A kid's ride request carries no pickup TIME (see KidRequestModal) — the
  // parent supplies it via PickupTimeStepper right before forking. Falls
  // back to whatever parseRideMeta decoded (a parent-created both-ways
  // request DOES include a timestamp) when not provided.
  pickupTimeOverride?: string;
}) {
  const DROPOFF_GREEN = '#10B981';
  const PICKUP_INDIGO = '#6366F1';
  const rideMeta = parseRideMeta(ev.returnTime, ev.date);
  const pickupTime = pickupTimeOverride ?? rideMeta.pickupTime ?? ev.time;

  // The 2 legs are otherwise fully independent rows with no way for any
  // role encountering just one of them (e.g. in Schedule's Agenda/Week/Day,
  // or a GP who wasn't around for the other leg) to know a companion leg
  // exists elsewhere (QA sweep UI pass, High Finding #4). linkedLegId
  // points each leg at the other's id — the pickup leg is created first so
  // its id is known when the drop-off leg (ev.id, already exists) is
  // updated in the same pass; the pickup leg then gets a 2nd small patch
  // pointing back, since addEvent can't self-reference an id that doesn't
  // exist yet at call time.
  const pickupId = await addEvent({
    title: `${ev.title} — Pickup`,
    date: rideMeta.pickupDate ?? ev.date,
    time: pickupTime,
    type: 'event', category: ev.category, allDay: false, memberId: ev.memberId,
    approvalPending: false, conflict: false,
    ...assigneePatch(selfDrive),
    notes: ev.notes ? `(Return) ${ev.notes}` : `Pickup leg for "${ev.title}"`,
    color: PICKUP_INDIGO,
    isOpenToGrandparents: !selfDrive,
    isOpenToTeens: !selfDrive,
    rideCoins: selfDrive ? undefined : splitCoins,
    pickupLocation: ev.dropLocation,
    dropLocation: ev.pickupLocation,
    linkedLegId: ev.id,
  });
  if (!selfDrive) tryAutoDispatch(pickupId);

  await updateEvent(ev.id, {
    approvalPending: false,
    ...assigneePatch(selfDrive),
    returnTime: undefined,
    title: `${ev.title} — Drop-off`,
    notes: ev.notes,
    color: DROPOFF_GREEN,
    isOpenToGrandparents: !selfDrive,
    isOpenToTeens: !selfDrive,
    rideCoins: selfDrive ? undefined : splitCoins,
    pickupLocation: ev.pickupLocation,
    dropLocation: ev.dropLocation,
    linkedLegId: pickupId,
  });
  if (!selfDrive) tryAutoDispatch(ev.id);
}
