import { todayLocal } from '@/lib/dates';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Medication {
  id: string;
  member_id: string;
  assigned_by: string | null;
  modified_by: string | null;
  name: string;
  dosage: string;
  dosage_unit: string;
  frequency: string;
  frequency_times: string[];
  category: string;
  prescribing_doctor: string | null;
  pharmacy: string | null;
  refill_date: string | null;
  pills_remaining: number | null;
  is_ongoing: boolean;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  taken_date: string | null;
  // Real DB column (family_medications.taken_dates, JSONB array of
  // YYYY-MM-DD strings), present in the schema since this table was
  // created but never read or written by any app code until now — every
  // "mark taken" write only ever touched the single taken_date field.
  // This is the actual adherence history: every day this med was marked
  // taken, not just today's [live-requested: "we must show the active
  // medication history like day and take and missing.. for yestdays one
  // we should show missd right if they really missed"].
  taken_dates: string[];
  escalation_enabled: boolean;
  escalation_after_min: number;
  escalation_to: string[];
  notes: string | null;
  updated_at: string | null;
}

export interface Vaccine {
  id: string;
  member_id: string;
  added_by: string | null;
  title: string;
  vaccine_type: string | null;
  date: string;
  next_due_date: string | null;
  done: boolean;
  series_current: number;
  series_total: number;
  administered_by: string | null;
  location: string | null;
  notes: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

export const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily', twice_daily: '2× Daily', weekly: 'Weekly', as_needed: 'As Needed',
};
// Was a static object built from the hardcoded PawBond-era BRAND palette
// (BRAND.purple/teal/emerald/amber/blue) — a module-level const can't read
// useTheme(), so callers each need `colors` in scope to build the real,
// theme-aware mapping.
export function getCatColors(colors: any): Record<string, string> {
  return {
    prescription: colors.accent, otc: colors.teal, vitamin: colors.success,
    supplement: colors.amber, other: colors.info,
  };
}

export const today = () => todayLocal();

export function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fmtDateDisplay(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Add-Medication form types ─────────────────────────────────────────────────

export interface MedForm {
  name: string; dosage: string; dosage_unit: string;
  frequency: string; category: string; prescribing_doctor: string;
  pharmacy: string; refill_date: string; pills_remaining: string;
  instructions: string; notes: string;
  escalation_enabled: boolean; escalation_after_min: string;
  // Reminder scheduling — start_date/end_date/frequency_times already
  // exist as DB columns on Medication (types.ts's Medication interface).
  // reminder_times holds one time-of-day per dose — length 1 for
  // daily/weekly/as_needed, length 2 for twice_daily (live-reported: "2x
  // Daily" only ever asked for ONE time, silently meaning the second dose
  // never got its own reminder at all). Each entry materializes its own
  // independent recurring calendar event (see useMedications.ts's addMed —
  // addRecurringEvent is called once per entry, not once per medication).
  // alert_call opts into the existing CallKit-style ringing reminder (same
  // alertCall/alertCallLeadMinutes pattern FamilyEvent already uses for
  // chores/events) instead of a plain push, applied to every dose time.
  start_date: string; end_date: string; reminder_times: string[];
  alert_call: boolean;
}
// Number of reminder times FREQUENCY implies — daily/weekly/as_needed are
// one dose, twice_daily is two. Used both to size BLANK_MED's initial
// array and to grow/shrink reminder_times when the user changes frequency
// after already picking times (never silently discards an already-set
// time — see AddMedModal's frequency-change handler).
export function doseCountForFrequency(frequency: string): number {
  return frequency === 'twice_daily' ? 2 : 1;
}

// ─── Medication adherence history ──────────────────────────────────────────
// Real per-day (and, for a multi-dose med, per-dose-time) taken/missed
// history, built entirely from real data already on the row: taken_dates
// (the real DB column, present since this table was created but never
// actually read/written until now — every prior write only touched the
// single taken_date field), start_date/end_date, and frequency_times
// [live-requested: "we must show the active medication history like day
// and take and missing.. for yestdays one we should show missd right if
// they really missed" / "add extensive like which time slot / part of
// day they missed"]. No new table — taken_dates already held exactly
// this, just disconnected from every write path.
//
// Entry format: a plain "YYYY-MM-DD" for a single-dose med (frequency !==
// 'twice_daily'); "YYYY-MM-DD|HH:MM" for a multi-dose med, one entry per
// dose actually taken, HH:MM matching one of frequency_times. Backward-
// compatible: any already-existing plain-date entry (from before this
// fix, or on a med that was single-dose when taken) still parses as
// "taken", just without a specific time slot to attribute it to.
export interface DoseAdherence {
  date: string;         // YYYY-MM-DD
  time: string | null;  // one of frequency_times, or null if untracked/single-dose
  status: 'taken' | 'missed' | 'upcoming';
}

export function encodeTakenEntry(date: string, time: string | null): string {
  return time ? `${date}|${time}` : date;
}

// "08:00" -> "8:00 AM" — used to label each per-dose-time button/row so a
// twice-daily med's two slots read as times, not raw 24h strings.
export function formatDoseTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function decodeTakenEntry(entry: string): { date: string; time: string | null } {
  const [date, time] = entry.split('|');
  return { date, time: time ?? null };
}

// Every scheduled dose from start_date through min(end_date, today),
// each marked taken/missed/upcoming against the real taken_dates array.
// "Missed" only for a dose whose scheduled date+time has genuinely
// passed and isn't in taken_dates — today's own not-yet-due doses (or a
// dose later today) are "upcoming," not "missed", matching the real
// distinction the owner drew ("today we show overdue bit for yestdays
// one we should show missd right if they really missed").
export function medicationAdherenceHistory(med: Medication, daysBack = 14): DoseAdherence[] {
  const times = med.frequency_times?.length ? med.frequency_times : ['08:00'];
  const multiDose = times.length > 1;
  const takenSet = new Set(med.taken_dates ?? []);
  const nowStr = today();
  const now = new Date();

  const start = med.start_date ? new Date(med.start_date + 'T00:00:00') : new Date(nowStr + 'T00:00:00');
  const earliestWindow = new Date(now);
  earliestWindow.setDate(earliestWindow.getDate() - daysBack);
  const windowStart = start > earliestWindow ? start : earliestWindow;
  const end = med.end_date ? new Date(med.end_date + 'T00:00:00') : now;
  const windowEnd = end < now ? end : now;

  const out: DoseAdherence[] = [];
  for (let d = new Date(windowStart); d <= windowEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = fmtDate(d);
    for (const time of times) {
      const isTaken = multiDose
        ? takenSet.has(encodeTakenEntry(dateStr, time)) || takenSet.has(dateStr)
        : takenSet.has(dateStr) || takenSet.has(encodeTakenEntry(dateStr, time));
      let status: DoseAdherence['status'];
      if (isTaken) {
        status = 'taken';
      } else {
        const [h, m] = time.split(':').map(Number);
        const doseAt = new Date(d);
        doseAt.setHours(h || 0, m || 0, 0, 0);
        status = doseAt.getTime() <= now.getTime() ? 'missed' : 'upcoming';
      }
      out.push({ date: dateStr, time: multiDose ? time : null, status });
    }
  }
  return out.reverse(); // newest first
}

// Doses grouped by day, newest day first, so a history view reads as a
// real day-by-day log instead of one flat list of dose rows — shared by
// mobile's own drawer (HealthRecordsList.tsx) and kiosk's side-drawer
// version, both built off the same medicationAdherenceHistory() output
// [live-requested: "we must show the active medication history like day
// and take and missing.." / "show that history side bar"].
export function groupHistoryByDay(doses: DoseAdherence[]): { date: string; doses: DoseAdherence[] }[] {
  const byDate = new Map<string, DoseAdherence[]>();
  for (const d of doses) {
    const list = byDate.get(d.date) ?? [];
    list.push(d);
    byDate.set(d.date, list);
  }
  return Array.from(byDate.entries()).map(([date, doses]) => ({ date, doses }));
}
export const BLANK_MED: MedForm = {
  name: '', dosage: '', dosage_unit: 'tablet', frequency: 'daily',
  category: 'prescription', prescribing_doctor: '', pharmacy: '',
  refill_date: '', pills_remaining: '', instructions: '', notes: '',
  escalation_enabled: false, escalation_after_min: '60',
  start_date: today(), end_date: '', reminder_times: ['08:00'],
  alert_call: false,
};

// Quick pick suggestions by medication category
export const MED_SUGGESTIONS: Record<string, { name: string; hint: string }[]> = {
  prescription: [
    { name: 'Lisinopril',    hint: 'Blood pressure' },
    { name: 'Metformin',     hint: 'Diabetes' },
    { name: 'Atorvastatin',  hint: 'Cholesterol' },
    { name: 'Levothyroxine', hint: 'Thyroid' },
    { name: 'Amlodipine',    hint: 'Blood pressure' },
    { name: 'Metoprolol',    hint: 'Heart rate' },
  ],
  otc: [
    { name: 'Tylenol',    hint: 'Pain / fever' },
    { name: 'Ibuprofen',  hint: 'Anti-inflammatory' },
    { name: 'Benadryl',   hint: 'Allergy' },
    { name: 'Claritin',   hint: 'Allergy' },
    { name: 'Robitussin', hint: 'Cough' },
    { name: 'Pepto-Bismol', hint: 'Stomach' },
  ],
  vitamin: [
    { name: 'Vitamin D3',  hint: '1000–5000 IU' },
    { name: 'Vitamin C',   hint: 'Immune support' },
    { name: 'Vitamin B12', hint: 'Energy' },
    { name: 'Folate',      hint: 'Prenatal / nerve' },
    { name: 'Iron',        hint: 'Blood health' },
  ],
  supplement: [
    { name: 'Fish Oil',   hint: 'Omega-3' },
    { name: 'Magnesium',  hint: 'Sleep / muscle' },
    { name: 'Probiotics', hint: 'Gut health' },
    { name: 'Zinc',       hint: 'Immune support' },
    { name: 'Melatonin',  hint: 'Sleep' },
  ],
  other: [],
};

// ─── Add-Vaccine form types ─────────────────────────────────────────────────────

export const VAX_TYPES = ['flu', 'covid', 'tdap', 'mmr', 'varicella', 'hpv', 'hepatitis-a', 'hepatitis-b', 'pneumonia', 'meningitis', 'shingles', 'polio'];
export const VAX_SUGGESTIONS: { name: string; hint: string }[] = [
  { name: 'Flu Shot',         hint: 'Annual' },
  { name: 'COVID-19 Booster', hint: 'mRNA / bivalent' },
  { name: 'Tdap',             hint: 'Tetanus / pertussis' },
  { name: 'MMR',              hint: 'Measles / mumps / rubella' },
  { name: 'Varicella',        hint: 'Chicken pox' },
  { name: 'HPV',              hint: 'Gardasil 9' },
  { name: 'Hepatitis A',      hint: 'Travel / routine' },
  { name: 'Hepatitis B',      hint: 'HBV series' },
  { name: 'Pneumonia',        hint: 'Prevnar / Pneumovax' },
  { name: 'Meningitis',       hint: 'MenACWY' },
  { name: 'Shingles',         hint: 'Shingrix (50+)' },
];

export interface VaxForm {
  title: string; vaccine_type: string; date: string;
  next_due_date: string; series_current: string; series_total: string;
  administered_by: string; location: string; notes: string;
}
export const BLANK_VAX: VaxForm = {
  title: '', vaccine_type: '', date: today(),
  next_due_date: '', series_current: '1', series_total: '1',
  administered_by: '', location: '', notes: '',
};

// ─── Shared bottom-sheet-modal styles (used by AddMedModal / AddVaxModal) ──────
import { StyleSheet } from 'react-native';

export const aStyles = StyleSheet.create({
  // Bottom-sheet layout (matches EventFormModal)
  backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:         { borderTopLeftRadius: 28, borderTopRightRadius: 28,
                   paddingHorizontal: 20, paddingTop: 6, paddingBottom: 0,
                   maxHeight: '92%' },
  // Static StyleSheet (no useTheme() access) and no theme token closely
  // matches this neutral slate — documented hardcoded swatch.
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' },
  closeBtn:      { padding: 8, borderRadius: 20, backgroundColor: 'rgba(100,116,139,0.12)' },

  // Form atoms
  label:         { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  sectionLabel:  { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  inp:           { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10,
                   fontSize: 14, fontWeight: '600' },
  chipSmall:     { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 4 },
  suggPill:      { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5,
                   paddingHorizontal: 12, paddingVertical: 6 },

  // Date button (matches EventFormModal f.dateBtn)
  dateBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
                   paddingHorizontal: 12, paddingVertical: 10 },

  // Date picker modal (nested floating picker)
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 },

  // Escalation box
  escBox:        { borderRadius: 14, borderWidth: 1.5, padding: 14 },

  // Footer
  saveRow:       { flexDirection: 'row', gap: 10, paddingHorizontal: 0,
                   paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn:     { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:       { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },

  // Validation error text — no `color` here (was BRAND.rose, a module-
  // level const with no useTheme() access); callers apply colors.danger
  // inline via a style array instead.
  errText:       { fontSize: 11, fontWeight: '700', marginTop: 4, marginLeft: 2 },

  // Kept for legacy (filter toggles in sheet use hf.toggle)
  memberChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5,
                   paddingHorizontal: 10, paddingVertical: 6 },
  toggle:        { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb:   { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                   shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
});
