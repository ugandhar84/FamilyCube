// FamilyCube — Edge Function: calendar-conflict-detector
// Cross-references family events for time overlaps and driver conflicts.
// Uses real member IDs from the payload — no hardcoded IDs.
// For AI-powered resolution suggestions, delegates to family-ai/conflict_check.
//
// Deploy: supabase functions deploy calendar-conflict-detector
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface CalendarEvent {
  id:                  string;
  title:               string;
  date:                string;       // YYYY-MM-DD
  startTime:           string;       // HH:MM (24h)
  endTime:             string;       // HH:MM (24h)
  assignedMemberIds:   string[];
  driverId?:           string;
  isWorkMeeting?:      boolean;
  isPickupOrDropoff?:  boolean;
}

interface FamilyMember {
  id:    string;
  name:  string;
  role:  string;       // 'parent' | 'kid' | 'senior'
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function overlaps(a: CalendarEvent, b: CalendarEvent): boolean {
  if (a.date !== b.date) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd   = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd   = timeToMinutes(b.endTime);
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Find a parent who is NOT assigned to any conflicting event at this time window.
 * Returns the first free parent, or null if everyone is busy.
 */
function findFreeParent(members: FamilyMember[], events: CalendarEvent[], busyEvent: CalendarEvent, excludeMemberId?: string): FamilyMember | null {
  const parents = members.filter(m => m.role === 'parent' && m.id !== excludeMemberId);
  for (const parent of parents) {
    const isBusy = events.some(e =>
      e.id !== busyEvent.id &&
      e.assignedMemberIds.includes(parent.id) &&
      overlaps(e, busyEvent)
    );
    if (!isBusy) return parent;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { events, members, useAi = false } = await req.json() as {
      events:   CalendarEvent[];
      members:  FamilyMember[];
      useAi?:   boolean;
    };

    if (!events?.length) return json({ status: 'ok', totalEvents: 0, conflictsFoundCount: 0, conflicts: [] });

    const workEvents    = events.filter(e => e.isWorkMeeting);
    const pickupEvents  = events.filter(e => e.isPickupOrDropoff);

    // ── 1. Driver conflicts (assigned driver has overlapping work meeting) ────
    const driverConflicts = [];
    for (const pickup of pickupEvents) {
      if (!pickup.driverId) continue;
      const blocker = workEvents.find(w =>
        w.assignedMemberIds.includes(pickup.driverId!) && overlaps(w, pickup)
      );
      if (blocker) {
        const conflictedMember = members.find(m => m.id === pickup.driverId);
        const suggestedDriver  = findFreeParent(members, events, pickup, pickup.driverId);
        driverConflicts.push({
          type:                'driver_conflict',
          pickupEventId:       pickup.id,
          pickupTitle:         pickup.title,
          workEventTitle:      blocker.title,
          conflictedDriverId:  pickup.driverId,
          conflictedDriverName: conflictedMember?.name ?? pickup.driverId,
          suggestedDriverId:   suggestedDriver?.id ?? null,
          suggestedDriverName: suggestedDriver?.name ?? 'No free parent found — manual resolution needed',
          eventDate:           pickup.date,
          timeWindow:          `${pickup.startTime} – ${pickup.endTime}`,
        });
      }
    }

    // ── 2. Double-booking (same member assigned to two overlapping events) ───
    const doubleBookings = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i], b = events[j];
        if (!overlaps(a, b)) continue;
        const sharedMembers = a.assignedMemberIds.filter(id => b.assignedMemberIds.includes(id));
        for (const memberId of sharedMembers) {
          const member = members.find(m => m.id === memberId);
          doubleBookings.push({
            type:       'double_booked',
            memberId,
            memberName: member?.name ?? memberId,
            eventAId:   a.id, eventATitle: a.title,
            eventBId:   b.id, eventBTitle: b.title,
            date:       a.date,
            timeWindow: `${a.startTime}–${a.endTime} overlaps ${b.startTime}–${b.endTime}`,
            suggestion: `${member?.name ?? 'This member'} cannot attend both. Consider delegating one event to another family member.`,
          });
        }
      }
    }

    // ── 3. Pickup/dropoff events with no assigned driver ─────────────────────
    const unassignedPickups = pickupEvents
      .filter(e => !e.driverId)
      .map(e => {
        const suggested = findFreeParent(members, events, e);
        return {
          type:              'no_driver',
          eventId:           e.id,
          eventTitle:        e.title,
          date:              e.date,
          timeWindow:        `${e.startTime} – ${e.endTime}`,
          suggestedDriverId:   suggested?.id ?? null,
          suggestedDriverName: suggested?.name ?? 'No free parent found',
        };
      });

    const allConflicts = [...driverConflicts, ...doubleBookings, ...unassignedPickups];

    // ── 4. Optional: AI-powered resolution via family-ai ────────────────────
    let aiResolutions: unknown = null;
    if (useAi && allConflicts.length > 0) {
      try {
        const aiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-ai`;
        const res = await fetch(aiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ action: 'conflict_check', events }),
        });
        const data = await res.json();
        aiResolutions = data?.result ?? null;
      } catch (e) {
        console.warn('[calendar-conflict-detector] AI call failed:', (e as Error).message);
      }
    }

    return json({
      status:              'analyzed',
      totalEvents:         events.length,
      conflictsFoundCount: allConflicts.length,
      driverConflicts,
      doubleBookings,
      unassignedPickups,
      aiResolutions,
      processedAt:         new Date().toISOString(),
    });

  } catch (e: any) {
    console.error('[calendar-conflict-detector]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
