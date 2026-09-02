/**
 * calendarSync2Way — Apple Calendar (device EventKit) 2-way sync.
 *
 * Parallel to, not a rewrite of, lib/calendarSync.ts's existing one-way
 * "add this one PawBond vet appointment to whatever calendar app is on
 * the phone" helper, which stays untouched for its current callers.
 *
 * Apple has no calendar OAuth API at all — there's no server-side
 * equivalent of calendar-sync-push/calendar-webhook-* for this provider.
 * Real bidirectional sync is only possible via the device's own EventKit
 * (expo-calendar), which already keeps the phone's Calendar app in sync
 * with iCloud on its own — writing to/reading from it IS effectively
 * syncing with iCloud, just one layer removed.
 *
 * Two directions:
 *  - FamilyCube -> device calendar: same create/update/delete hook points
 *    as the server-side push (store/eventStore.ts), gated behind the
 *    member's own apple_calendar_sync_enabled preference. The local
 *    familyEventId -> deviceCalendarEventId map lives in AsyncStorage
 *    (not Postgres) since it's a purely on-device concept with no server
 *    visibility or meaning for any other family member's device.
 *  - Device calendar -> FamilyCube: periodic RECONCILIATION SWEEP, not
 *    per-change — expo-calendar has no reliable cross-platform
 *    fine-grained change-observation API (nothing finer than "something
 *    somewhere changed," same shape as Google's own webhook ping), so a
 *    push-based design isn't possible here. Runs on app foreground
 *    (throttled) and on-demand (e.g. Schedule pull-to-refresh).
 */
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FamilyEvent } from '@/store/eventStore';

const MAP_KEY_PREFIX = 'apple_calendar_sync_map_'; // + memberId
const LAST_SWEEP_KEY_PREFIX = 'apple_calendar_sync_last_sweep_'; // + memberId
const SWEEP_THROTTLE_MS = 15 * 60_000; // matches the plan's "not more than once per 15 minutes"
const SYNC_CALENDAR_NAME = 'FamilyCube';
// TestFlight/production builds have no Metro console — every failure in
// this file previously went to console.warn only, meaning "still not
// synced, no idea why" (live-reported) was structurally undiagnosable
// outside a dev build. Persists the most recent real failure so
// CalendarSyncScreen can surface it directly in the UI.
const LAST_ERROR_KEY_PREFIX = 'apple_calendar_sync_last_error_'; // + memberId

async function recordSyncError(memberId: string, context: string, e: unknown): Promise<void> {
  try {
    const message = e instanceof Error ? e.message : String(e);
    await AsyncStorage.setItem(LAST_ERROR_KEY_PREFIX + memberId, JSON.stringify({ context, message, at: new Date().toISOString() }));
  } catch { /* best-effort only */ }
}

export async function getLastAppleSyncError(memberId: string): Promise<{ context: string; message: string; at: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ERROR_KEY_PREFIX + memberId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function clearLastAppleSyncError(memberId: string): Promise<void> {
  try { await AsyncStorage.removeItem(LAST_ERROR_KEY_PREFIX + memberId); } catch { /* best-effort */ }
}

type IdMap = Record<string, string>; // familyEventId -> deviceCalendarEventId

async function loadMap(memberId: string): Promise<IdMap> {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY_PREFIX + memberId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveMap(memberId: string, map: IdMap): Promise<void> {
  try {
    await AsyncStorage.setItem(MAP_KEY_PREFIX + memberId, JSON.stringify(map));
  } catch (e) {
    console.warn('[calendarSync2Way] saveMap failed', e);
  }
}

async function ensurePermission(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Calendar.requestCalendarPermissionsAsync();
  return req.status === 'granted';
}

// A dedicated "FamilyCube" calendar on the device, separate from the
// user's own default calendar — writing every FamilyCube event straight
// into someone's personal default calendar (mixing with their own
// unrelated events) would be far more intrusive than opting into a
// clearly-labeled, easy-to-hide-or-delete calendar of its own. Created
// once per device, reused after.
//
// Exported (as ensureSyncCalendarIdForUI) so CalendarSyncScreen's toggle
// handler can verify creation actually succeeded before claiming "Apple
// Calendar sync on" — this can fail silently for device-specific reasons
// (no usable calendar source, iCloud not signed in) and previously did so
// with zero feedback to the member at all.
export { ensureSyncCalendarId as ensureSyncCalendarIdForUI };
async function ensureSyncCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find(c => c.title === SYNC_CALENDAR_NAME);
  if (existing) return existing.id;

  try {
    if (Platform.OS === 'ios') {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
      if (!defaultCal?.source) {
        console.warn('[calendarSync2Way] getDefaultCalendarAsync returned no usable source', defaultCal);
        return null;
      }
      return await Calendar.createCalendarAsync({
        title: SYNC_CALENDAR_NAME,
        color: '#DF613C',
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: defaultCal.source.id,
        source: defaultCal.source,
        name: SYNC_CALENDAR_NAME,
        ownerAccount: SYNC_CALENDAR_NAME,
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
      });
    }
    // Android needs a real account-backed source — reuse whatever source
    // the device's existing calendars already use rather than fabricating one.
    const source = calendars[0]?.source;
    if (!source) {
      console.warn('[calendarSync2Way] no existing calendar source found on Android to attach the sync calendar to');
      return null;
    }
    return await Calendar.createCalendarAsync({
      title: SYNC_CALENDAR_NAME,
      color: '#DF613C',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: source.id,
      source,
      name: SYNC_CALENDAR_NAME,
      ownerAccount: SYNC_CALENDAR_NAME,
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  } catch (e) {
    // Was a silent catch-and-return-null — the ONE call site
    // (CalendarSyncScreen's toggle handler) has no visibility into why
    // "nothing shows up on-device at all" happens, since every failure
    // here looks identical from the caller's side. Logging the real
    // error is the only way to diagnose this without a device debugger.
    console.warn('[calendarSync2Way] could not create sync calendar', e instanceof Error ? e.message : e);
    return null;
  }
}

// expo-calendar's createEventAsync/updateEventAsync take startDate/endDate
// — this previously built start/end instead, a field-name mismatch that
// meant the native EventKit bridge never received a start date at all,
// failing with its own "No start date has been set" error on every single
// push since this feature was built (live-reported, surfaced only once
// the temporary error-recording added elsewhere this session made the
// failure visible at all — the outer catch had been swallowing it
// silently before that).
function toPortable(event: FamilyEvent): { title: string; startDate: Date; endDate: Date; allDay: boolean; location?: string; notes?: string } {
  const [y, m, d] = event.date.split('-').map(Number);
  if (event.allDay || !event.time) {
    const startDate = new Date(y, m - 1, d);
    const endDate = new Date(y, m - 1, d + 1);
    return { title: event.title, startDate, endDate, allDay: true, location: event.location, notes: event.notes };
  }
  const [sh, sm] = event.time.split(':').map(Number);
  const startDate = new Date(y, m - 1, d, sh, sm);
  const [eh, em] = (event.endTime ?? event.time).split(':').map(Number);
  const endDate = event.endTime ? new Date(y, m - 1, d, eh, em) : new Date(startDate.getTime() + 60 * 60_000);
  return { title: event.title, startDate, endDate, allDay: false, location: event.location, notes: event.notes };
}

/** FamilyCube -> device calendar. Called after a confirmed create/update/delete, same as the server-side push. */
export async function pushEventToAppleCalendar(memberId: string, event: FamilyEvent | null, eventId: string, action: 'create' | 'update' | 'delete'): Promise<void> {
  try {
    if (!(await ensurePermission())) {
      await recordSyncError(memberId, 'push', new Error('Calendar permission not granted'));
      return;
    }
    const map = await loadMap(memberId);

    if (action === 'delete') {
      const deviceId = map[eventId];
      if (!deviceId) return;
      try { await Calendar.deleteEventAsync(deviceId); } catch { /* already gone on-device — fine */ }
      delete map[eventId];
      await saveMap(memberId, map);
      await clearLastAppleSyncError(memberId);
      return;
    }

    if (!event) return;
    const calendarId = await ensureSyncCalendarId();
    if (!calendarId) {
      await recordSyncError(memberId, 'push', new Error('Could not create/find the FamilyCube device calendar'));
      return;
    }
    const portable = toPortable(event);
    const existingDeviceId = map[eventId];

    if (existingDeviceId) {
      try {
        await Calendar.updateEventAsync(existingDeviceId, portable);
        await clearLastAppleSyncError(memberId);
        return;
      } catch {
        // The device event may have been deleted independently — fall
        // through to create a fresh one rather than silently dropping it.
        delete map[eventId];
      }
    }
    const newDeviceId = await Calendar.createEventAsync(calendarId, portable);
    map[eventId] = newDeviceId;
    await saveMap(memberId, map);
    await clearLastAppleSyncError(memberId);
  } catch (e) {
    console.warn('[calendarSync2Way] pushEventToAppleCalendar failed', e);
    await recordSyncError(memberId, 'push', e);
  }
}

/**
 * Device calendar -> FamilyCube. A periodic reconciliation sweep (no
 * per-change push is possible for a local device calendar) — diffs the
 * FamilyCube sync calendar's own events against the stored id map and
 * applies create/update/delete + the same "local wins on a tie" conflict
 * rule the server-side sync uses, via the passed-in addEvent/updateEvent/
 * deleteEvent callbacks (kept as params rather than importing
 * useEventStore directly, so this file has no React/Zustand dependency).
 */
export async function reconcileAppleCalendar(
  memberId: string,
  familyId: string,
  currentEvents: FamilyEvent[],
  callbacks: {
    addEvent: (e: Omit<FamilyEvent, 'id'>) => Promise<string>;
    updateEvent: (id: string, patch: Partial<FamilyEvent>) => Promise<void>;
    deleteEvent: (id: string) => void;
  },
  options?: { force?: boolean },
): Promise<void> {
  try {
    if (!options?.force) {
      const lastRaw = await AsyncStorage.getItem(LAST_SWEEP_KEY_PREFIX + memberId);
      if (lastRaw && Date.now() - Number(lastRaw) < SWEEP_THROTTLE_MS) return;
    }
    await AsyncStorage.setItem(LAST_SWEEP_KEY_PREFIX + memberId, String(Date.now()));

    if (!(await ensurePermission())) {
      await recordSyncError(memberId, 'reconcile', new Error('Calendar permission not granted'));
      return;
    }
    const calendarId = await ensureSyncCalendarId();
    if (!calendarId) {
      await recordSyncError(memberId, 'reconcile', new Error('Could not create/find the FamilyCube device calendar'));
      return;
    }

    const map = await loadMap(memberId);
    const reverseMap = new Map(Object.entries(map).map(([fcId, devId]) => [devId, fcId]));

    // Was 30 days ahead — live-reported: an event added to the device
    // calendar for November (2+ months out from a September sweep) never
    // showed up in the app at all, correctly per the old window but not
    // what's actually wanted. Widened to 365 days to match Outlook's own
    // inbound delta window (calendar-webhook-outlook's initial
    // calendarView/delta call), so all three providers cover roughly the
    // same forward range. Unlike Google (which only bounds its FIRST
    // full sync to 90 days — every poll after that uses an unbounded
    // sync_token with no date limit at all), this sweep has no
    // equivalent "unlimited via token" mechanism; it's a fresh windowed
    // query every time, so this window is the real, permanent limit —
    // there's no cheaper way to ask EventKit "what changed" the way a
    // server-side delta/sync-token API can.
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 1);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + 365);
    const deviceEvents = await Calendar.getEventsAsync([calendarId], windowStart, windowEnd);

    for (const deviceEvent of deviceEvents) {
      const familyEventId = reverseMap.get(deviceEvent.id);
      const start = new Date(deviceEvent.startDate);
      const end = new Date(deviceEvent.endDate);
      const patch: Partial<FamilyEvent> = {
        title: deviceEvent.title || 'Untitled event',
        date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
        time: deviceEvent.allDay ? undefined : `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
        endTime: deviceEvent.allDay ? undefined : `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
        allDay: !!deviceEvent.allDay,
        location: deviceEvent.location || undefined,
        notes: deviceEvent.notes || undefined,
      };

      // EventCard.tsx's "synced from X" badge reads lastExternalSyncProvider/
      // lastExternalSyncAccount — Google/Outlook's own inbound reconcile
      // (googleReconcile.ts/calendar-webhook-outlook) always stamps these,
      // but this Apple path never did at all, live-reported as an
      // Apple-Calendar-added event showing a "Google Calendar" badge (a
      // stale value left over from some earlier, unrelated sync on the
      // same row — this reconcile simply never overwrote it with the
      // correct provider). Stamping 'apple' here, always, means a genuine
      // Apple-originated create/update can no longer inherit a stale
      // label from a different provider.
      // lastExternalSyncMemberId (paired with lastExternalSyncProvider)
      // lets the badge show the actual FAMILY MEMBER's initials instead
      // of a raw email — Apple has no email/account concept at all
      // (device-local EventKit calendar), so memberId (whoever's device
      // this sweep is running for) is the only meaningful "whose" signal
      // available for this provider.
      const syncFields = { lastExternalSyncProvider: 'apple' as const, lastExternalSyncAccount: undefined, lastExternalSyncMemberId: memberId };

      if (familyEventId) {
        const localEvent = currentEvents.find(e => e.id === familyEventId);
        if (!localEvent) continue; // locally deleted already — outbound delete will clean up the device side
        const deviceModified = deviceEvent.lastModifiedDate ? new Date(deviceEvent.lastModifiedDate).getTime() : 0;
        // No local updatedAt is passed in here (currentEvents is a plain
        // snapshot) — conservatively only overwrite when the device event
        // actually differs, avoiding a spurious update loop on every sweep.
        const changed = localEvent.title !== patch.title || localEvent.date !== patch.date
          || localEvent.time !== patch.time || localEvent.location !== patch.location || localEvent.notes !== patch.notes;
        if (changed && deviceModified > 0) await callbacks.updateEvent(familyEventId, { ...patch, ...syncFields });
      } else {
        // Genuinely new — added directly in the device Calendar app.
        const newId = await callbacks.addEvent({ ...patch, ...syncFields, title: patch.title!, date: patch.date!, type: 'event', category: 'Event', memberId } as Omit<FamilyEvent, 'id'>);
        map[newId] = deviceEvent.id;
      }
    }

    // Was: anything in the map whose device event wasn't found in THIS
    // sweep's date window (-1 to +30 days) was treated as "deleted
    // directly on-device" and the local FamilyCube row was deleted to
    // match. Live-reported data-loss bug: editing just the TIME on an
    // Apple Calendar event made the whole event disappear from the app —
    // getEventsAsync only returns events whose occurrence falls inside
    // the queried window, so an edit that shifts an event near the
    // window's edges (or any EventKit id change some edits can trigger)
    // read identically to "gone" here, with no way to tell the two apart
    // from a single windowed sweep.
    //
    // Fixed by checking each MISSING-from-this-sweep mapped event
    // directly via getEventAsync(deviceId) — a per-id lookup, not a
    // windowed query, so it can only ever be wrong if the id itself
    // still resolves to a genuinely different (renamed-into) event,
    // which EventKit does not do. Only delete the local row when this
    // direct check ALSO confirms the device event is gone; skip (leave
    // both sides alone) if the lookup still succeeds — the windowed
    // sweep's own absence was a false positive from something outside
    // this run's -1/+30 day range, not a real deletion.
    for (const [familyEventId, deviceId] of Object.entries(map)) {
      if (deviceEvents.some(e => e.id === deviceId) || !currentEvents.some(e => e.id === familyEventId)) continue;
      try {
        await Calendar.getEventAsync(deviceId);
        // Still resolves — genuinely not deleted, just outside this
        // sweep's window (e.g. moved further out). Leave it alone.
      } catch {
        callbacks.deleteEvent(familyEventId);
        delete map[familyEventId];
      }
    }

    await saveMap(memberId, map);
    await clearLastAppleSyncError(memberId);
  } catch (e) {
    console.warn('[calendarSync2Way] reconcileAppleCalendar failed', e);
    await recordSyncError(memberId, 'reconcile', e);
  }
}
