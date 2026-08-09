/**
 * rescheduleAllMedNotifications
 *
 * Called when the user updates their home timezone from the travel banner.
 * Cancels every existing medication local notification and reschedules fresh
 * ones so the OS records them with the current timezone context.
 *
 * On iOS/Android, CalendarTrigger times are in LOCAL device time, so they
 * already shift with the timezone. Explicit rescheduling clears any stale
 * identifiers stored in the DB and guarantees a clean state after the switch.
 */

import { supabase } from '@/lib/supabase';
import { setMedicationNotifId } from '@/lib/db/medications';
import { usePreferenceStore } from '@/store/preferenceStore';

let Notifs: typeof import('expo-notifications') | null = null;
try { Notifs = require('expo-notifications'); } catch {}

interface MedRow {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string;
  remind_time: string | null;
  notif_id: string | null;
  start_date: string | null;
  pet_name: string;
}

export async function rescheduleAllMedNotifications(userId: string): Promise<void> {
  if (!Notifs) return;

  const prefs = usePreferenceStore.getState();
  if (!prefs.notifHealth) return;

  // Fetch all pets for this user
  const { data: pets } = await supabase
    .from('pets')
    .select('id, name')
    .eq('owner_id', userId)
    .eq('is_active', true);

  if (!pets?.length) return;

  // Fetch all active meds with a remind_time across all pets
  const petIds = pets.map((p: any) => p.id);
  const petNameMap = Object.fromEntries(pets.map((p: any) => [p.id, p.name]));

  const { data: meds } = await supabase
    .from('medications')
    .select('id, pet_id, name, dosage, frequency, remind_time, notif_id, start_date')
    .in('pet_id', petIds)
    .eq('is_active', true)
    .not('remind_time', 'is', null)
    .neq('frequency', 'as_needed');

  if (!meds?.length) return;

  const rows: MedRow[] = (meds as any[]).map(m => ({
    ...m,
    pet_name: petNameMap[m.pet_id] ?? 'your pet',
  }));

  await Promise.allSettled(
    rows.map(async med => {
      // Cancel old notification
      if (med.notif_id) {
        try { await Notifs!.cancelScheduledNotificationAsync(med.notif_id); } catch {}
      }

      const [h, m] = (med.remind_time as string).split(':').map(Number);
      const title = `💊 Time for ${med.name}`;
      const body  = med.dosage ? `${med.dosage} · ${med.pet_name}` : med.pet_name;

      const refDate = med.start_date ? new Date(med.start_date + 'T12:00:00') : new Date();
      const weekday = refDate.getDay() + 1; // JS 0=Sun → Expo 1=Sun
      const dayOfMonth = refDate.getDate();

      let trigger: any;
      if (med.frequency === 'daily')        trigger = { hour: h, minute: m, repeats: true };
      else if (med.frequency === 'weekly')  trigger = { weekday, hour: h, minute: m, repeats: true };
      else if (med.frequency === 'monthly') trigger = { day: dayOfMonth, hour: h, minute: m, repeats: true };
      else return;

      try {
        const newId = await Notifs!.scheduleNotificationAsync({
          content: { title, body, data: { type: 'medication_reminder', med_id: med.id }, sound: true },
          trigger,
        });
        await setMedicationNotifId(med.id, newId);
      } catch (e) {
        console.warn('[reschedule] failed for med', med.id, e);
      }
    }),
  );

  console.log(`[reschedule] rescheduled ${rows.length} medication notification(s)`);
}
