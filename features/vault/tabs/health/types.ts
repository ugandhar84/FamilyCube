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
  // exist as DB columns on Medication (types.ts's Medication interface)
  // but were never exposed in the add-form; reminder_time is the single
  // time-of-day used to materialize a recurring calendar reminder
  // (multiple daily times aren't supported yet — frequency_times stays a
  // 1-element array until that's needed). alert_call opts into the
  // existing CallKit-style ringing reminder (same alertCall/
  // alertCallLeadMinutes pattern FamilyEvent already uses for chores/
  // events) instead of a plain push.
  start_date: string; end_date: string; reminder_time: string;
  alert_call: boolean;
}
export const BLANK_MED: MedForm = {
  name: '', dosage: '', dosage_unit: 'tablet', frequency: 'daily',
  category: 'prescription', prescribing_doctor: '', pharmacy: '',
  refill_date: '', pills_remaining: '', instructions: '', notes: '',
  escalation_enabled: false, escalation_after_min: '60',
  start_date: today(), end_date: '', reminder_time: '08:00',
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
