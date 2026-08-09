import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { showAlert } from '@/components/AppAlert';

export async function addAppointmentToCalendar(opts: {
  title: string;
  scheduledAt: string;     // ISO string
  durationMinutes?: number;
  vetName?: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  notes?: string | null;
  petName?: string | null;
}): Promise<boolean> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Calendar access needed', 'Please allow calendar access in Settings to sync appointments.');
      return false;
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

    // Pick the default writable calendar
    let calendarId: string | undefined;
    if (Platform.OS === 'ios') {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
      calendarId = defaultCal?.id;
    } else {
      const primary = calendars.find(c => c.isPrimary && c.allowsModifications);
      calendarId = primary?.id ?? calendars.find(c => c.allowsModifications)?.id;
    }

    if (!calendarId) {
      showAlert('No calendar found', 'Could not find a writable calendar on your device.');
      return false;
    }

    const start = new Date(opts.scheduledAt);
    const end   = new Date(start.getTime() + (opts.durationMinutes ?? 30) * 60 * 1000);

    const petPrefix = opts.petName ? `${opts.petName} — ` : '';
    const title     = `${petPrefix}${opts.title}`;

    const locationParts = [opts.clinicName, opts.clinicAddress].filter(Boolean);
    const location      = locationParts.join(', ') || undefined;

    const notesParts = [
      opts.vetName ? `Vet: ${opts.vetName}` : null,
      opts.notes,
    ].filter(Boolean);
    const notes = notesParts.join('\n') || undefined;

    await Calendar.createEventAsync(calendarId, {
      title,
      startDate: start,
      endDate:   end,
      location,
      notes,
      alarms: [{ relativeOffset: -60 }, { relativeOffset: -1440 }], // 1hr + 1day before
    });

    return true;
  } catch (e: any) {
    showAlert('Calendar error', e?.message ?? 'Could not add event to calendar.');
    return false;
  }
}
