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
async function ensureSyncCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find(c => c.title === SYNC_CALENDAR_NAME);
  if (existing) return existing.id;

  try {
    if (Platform.OS === 'ios') {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
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
    if (!source) return null;
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
    console.warn('[calendarSync2Way] could not create sync calendar', e);
    return null;
  }
}

function toPortable(event: FamilyEvent): { title: string; start: Date; end: Date; allDay: boolean; location?: string; notes?: string } {
  const [y, m, d] = event.date.split('-').map(Number);
  if (event.allDay || !event.time) {
    const start = new Date(y, m - 1, d);
    const end = new Date(y, m - 1, d + 1);
    return { title: event.title, start, end, allDay: true, location: event.location, notes: event.notes };
  }
  const [sh, sm] = event.time.split(':').map(Number);
  const start = new Date(y, m - 1, d, sh, sm);
  const [eh, em] = (event.endTime ?? event.time).split(':').map(Number);
  const end = event.endTime ? new Date(y, m - 1, d, eh, em) : new Date(start.getTime() + 60 * 60_000);
  return { title: event.title, start, end, allDay: false, location: event.location, notes: event.notes };
}

/** FamilyCube -> device calendar. Called after a confirmed create/update/delete, same as the server-side push. */
export async function pushEventToAppleCalendar(memberId: string, event: FamilyEvent | null, eventId: string, action: 'create' | 'update' | 'delete'): Promise<void> {
  try {
    if (!(await ensurePermission())) return;
    const map = await loadMap(memberId);

    if (action === 'delete') {
      const deviceId = map[eventId];
      if (!deviceId) return;
      try { await Calendar.deleteEventAsync(deviceId); } catch { /* already gone on-device — fine */ }
      delete map[eventId];
      await saveMap(memberId, map);
      return;
    }

    if (!event) return;
    const calendarId = await ensureSyncCalendarId();
    if (!calendarId) return;
    const portable = toPortable(event);
    const existingDeviceId = map[eventId];

    if (existingDeviceId) {
      try {
        await Calendar.updateEventAsync(existingDeviceId, portable);
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
  } catch (e) {
    console.warn('[calendarSync2Way] pushEventToAppleCalendar failed', e);
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
    addEvent: (e: Omit<FamilyEvent, 'id'>) => string;
    updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
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

    if (!(await ensurePermission())) return;
    const calendarId = await ensureSyncCalendarId();
    if (!calendarId) return;

    const map = await loadMap(memberId);
    const reverseMap = new Map(Object.entries(map).map(([fcId, devId]) => [devId, fcId]));

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 1);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + 30);
    const deviceEvents = await Calendar.getEventsAsync([calendarId], windowStart, windowEnd);
    const deviceEventIds = new Set(deviceEvents.map(e => e.id));

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

      if (familyEventId) {
        const localEvent = currentEvents.find(e => e.id === familyEventId);
        if (!localEvent) continue; // locally deleted already — outbound delete will clean up the device side
        const deviceModified = deviceEvent.lastModifiedDate ? new Date(deviceEvent.lastModifiedDate).getTime() : 0;
        // No local updatedAt is passed in here (currentEvents is a plain
        // snapshot) — conservatively only overwrite when the device event
        // actually differs, avoiding a spurious update loop on every sweep.
        const changed = localEvent.title !== patch.title || localEvent.date !== patch.date
          || localEvent.time !== patch.time || localEvent.location !== patch.location || localEvent.notes !== patch.notes;
        if (changed && deviceModified > 0) callbacks.updateEvent(familyEventId, patch);
      } else {
        // Genuinely new — added directly in the device Calendar app.
        const newId = callbacks.addEvent({ ...patch, title: patch.title!, date: patch.date!, type: 'event', category: 'Event', memberId } as Omit<FamilyEvent, 'id'>);
        map[newId] = deviceEvent.id;
      }
    }

    // Anything in the map whose device event no longer exists was deleted
    // directly on-device — remove the local FamilyCube event to match.
    for (const [familyEventId, deviceId] of Object.entries(map)) {
      if (!deviceEventIds.has(deviceId) && currentEvents.some(e => e.id === familyEventId)) {
        callbacks.deleteEvent(familyEventId);
        delete map[familyEventId];
      }
    }

    await saveMap(memberId, map);
  } catch (e) {
    console.warn('[calendarSync2Way] reconcileAppleCalendar failed', e);
  }
}
