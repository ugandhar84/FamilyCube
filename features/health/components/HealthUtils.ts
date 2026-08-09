/**
 * HealthUtils.ts — pure data-shaping utilities for the Health screen timeline.
 *
 * Exports:
 *  - `TLEvent` / `TLType`  — typed event shape consumed by MonthAccordionTimeline.
 *  - `VaxRow`              — minimal vaccine shape used by vaxStatus.
 *  - `getTypeCfg()`        — colour/icon config per event type, keyed by TLType.
 *  - `getDotColors()`      — accent colours per event type for timeline dot indicators.
 *  - `vaxStatus()`         — derives overdue / due_soon / up_to_date label + colours.
 *  - `safeISO()`           — safely parses an ISO date string; returns null on invalid input.
 *  - `buildTimeline()`     — merges all health record types into a sorted TLEvent[].
 *
 * `buildTimeline` intentionally excludes future/upcoming appointments — only past
 * and completed appointments appear in the history timeline. Upcoming ones are
 * shown separately in the Today and Health overview cards.
 *
 * No React imports — pure TypeScript so this file can be tested without a RN environment.
 */
import { format, parseISO, differenceInDays, isValid } from 'date-fns';
import { formatTime } from '@/lib/units';
import { toTitle } from '@/lib/format';
import type { Appointment, Allergy, LabResult, Medication } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal vaccine shape used by vaxStatus — avoids importing the full Vaccine type. */
export interface VaxRow {
  id: string;
  name: string;
  /** ISO date string of the next due date, or null when not scheduled. */
  next_due: string | null;
  /** ISO date string of when the vaccine was last administered. */
  last_given: string | null;
}

/** All event categories rendered in the health timeline. */
export type TLType = 'appointment' | 'vaccine' | 'medication' | 'lab' | 'weight' | 'allergy';

/** Normalised event shape used by MonthAccordionTimeline — all record types map to this. */
export interface TLEvent {
  /** Unique string id, e.g. "appt-<uuid>" or "vax-<uuid>", to avoid cross-type collisions. */
  id: string;
  type: TLType;
  /** ISO date string used for grouping by month and ordering within a day. */
  date: string;
  /** Primary label text for the event row. */
  title: string;
  /** Optional secondary text (notes, dose line, protected-until, etc.). */
  body?: string;
  /** For appointments: formatted "Dr. X · Clinic" string. */
  clinic?: string;
  /** Short badge text shown on the right of the row (e.g. "Overdue", "9:30 AM"). */
  badge?: string;
  /** Colour for the badge pill border and text. */
  badgeColor?: string;
  /** The raw DB row — used by SingleItemDetail to render type-specific extra fields. */
  raw: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config factories
// ─────────────────────────────────────────────────────────────────────────────
export function getTypeCfg(colors: any): Record<TLType, { label: string; color: string; bg: string; icon: string }> {
  return {
    vaccine:     { label: 'Vaccine',     color: colors.success,       bg: colors.successLight,  icon: 'shield-checkmark-outline' },
    lab:         { label: 'Lab result',  color: colors.info,          bg: colors.infoLight,     icon: 'flask-outline'            },
    medication:  { label: 'Medication',  color: colors.primary,       bg: colors.primaryLight,  icon: 'medical-outline'          },
    weight:      { label: 'Weight',      color: colors.textSecondary, bg: colors.surface,       icon: 'scale-outline'            },
    appointment: { label: 'Appointment', color: colors.warning,       bg: colors.warningLight,  icon: 'calendar-outline'         },
    allergy:     { label: 'Allergy',     color: colors.danger,        bg: colors.dangerLight,   icon: 'warning-outline'          },
  };
}

export function getDotColors(colors: any): Record<TLType, string> {
  return {
    vaccine:     colors.success,
    lab:         colors.info,
    medication:  colors.primary,
    weight:      colors.textDisabled,
    appointment: colors.warning,
    allergy:     colors.danger,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Derives a display label and colours for a vaccine's due-date status.
 * @param next_due ISO date string of the next required dose, or null if unscheduled.
 */
export function vaxStatus(
  next_due: string | null,
  colors: any,
): { label: string; color: string; bg: string } {
  if (!next_due) return { label: 'No date',    color: colors.textSecondary, bg: colors.surface      };
  const d = differenceInDays(parseISO(next_due), new Date());
  if (d < 0)   return { label: 'Overdue',    color: colors.danger,        bg: colors.dangerLight  };
  if (d <= 30) return { label: 'Due soon',   color: colors.warning,       bg: colors.warningLight };
  return             { label: 'Up to date', color: colors.success,       bg: colors.successLight };
}

/** Parses an ISO date string safely; returns null instead of an Invalid Date on bad input. */
export function safeISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

export function buildTimeline(
  appts: Appointment[],
  vaxes: VaxRow[],
  meds: Medication[],
  labs: LabResult[],
  weights: { id: string; logged_at: string; weight_kg: number }[],
  allergies: Allergy[],
  colors: any,
): TLEvent[] {
  const ev: TLEvent[] = [];
  const now = new Date();

  appts.forEach(a => {
    const apptDate = parseISO(a.scheduled_at);
    const isPast = apptDate < now;
    const isCompleted = a.status === 'completed';
    if (!isPast && !isCompleted) return;
    const clinicParts = [
      a.vet_name ? `Dr. ${a.vet_name.replace(/^Dr\.?\s*/i, '')}` : null,
      a.clinic_name,
    ].filter(Boolean);
    ev.push({
      id: `appt-${a.id}`, type: 'appointment', date: a.scheduled_at,
      title: a.title,
      body: a.notes ?? undefined,
      clinic: clinicParts.join(' · ') || undefined,
      badge: formatTime(apptDate), badgeColor: colors.warning,
      raw: a,
    });
  });

  vaxes.forEach(v => {
    const dateStr = v.last_given ?? v.next_due;
    if (!dateStr) return;
    const st = vaxStatus(v.next_due, colors);
    ev.push({
      id: `vax-${v.id}`, type: 'vaccine', date: dateStr,
      title: v.name,
      body: v.next_due ? `Protected until ${format(parseISO(v.next_due), 'MMMM yyyy')}.` : undefined,
      badge: st.label, badgeColor: st.color,
      raw: v,
    });
  });

  meds.forEach(m => {
    if (m.is_active) return;
    const dateStr = (m as any).end_date ?? (m as any).start_date ?? m.created_at;
    const doseLine = [
      (m as any).dosage,
      (m as any).frequency ? toTitle((m as any).frequency.replace(/_/g, ' ')) : null,
    ].filter(Boolean).join(' ');
    ev.push({
      id: `med-${m.id}`, type: 'medication', date: dateStr,
      title: `${m.name} stopped`,
      body: [doseLine, (m as any).notes].filter(Boolean).join('. ') || undefined,
      badge: 'Stopped', badgeColor: colors.textSecondary,
      raw: m,
    });
  });

  labs.forEach(l => {
    const result = l.result_value ? `Result: ${l.result_value}${l.unit ? ' ' + l.unit : ''}.` : '';
    ev.push({
      id: `lab-${l.id}`, type: 'lab', date: l.tested_at,
      title: l.test_name,
      body: [result, l.notes].filter(Boolean).join(' ') || undefined,
      badge: l.is_abnormal ? 'Abnormal' : 'Normal',
      badgeColor: l.is_abnormal ? colors.danger : colors.success,
      raw: l,
    });
  });

  weights.forEach(w => ev.push({
    id: `wt-${w.id}`, type: 'weight', date: w.logged_at,
    title: `Weighed in at ${w.weight_kg} kg`,
    raw: w,
  }));

  allergies.forEach(a => {
    const col =
      a.severity === 'severe' || a.severity === 'life_threatening' ? colors.danger
      : a.severity === 'moderate' ? colors.warning : colors.success;
    ev.push({
      id: `alg-${a.id}`, type: 'allergy', date: a.diagnosed_date ?? a.created_at,
      title: a.allergen, body: a.symptoms ?? undefined,
      badge: a.severity, badgeColor: col, raw: a,
    });
  });

  return ev.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Re-applies theme colors to a pre-built timeline without rebuilding event data.
 * Use as a second useMemo so data changes and theme changes don't both rebuild.
 */
export function applyTimelineColors(events: TLEvent[], colors: any): TLEvent[] {
  return events.map(ev => {
    switch (ev.type) {
      case 'appointment': return { ...ev, badgeColor: colors.warning };
      case 'vaccine': {
        const st = vaxStatus(ev.raw.next_due, colors);
        return { ...ev, badge: st.label, badgeColor: st.color };
      }
      case 'medication': return { ...ev, badgeColor: colors.textSecondary };
      case 'lab': return { ...ev, badgeColor: ev.raw.is_abnormal ? colors.danger : colors.success };
      case 'allergy': {
        const col =
          ev.raw.severity === 'severe' || ev.raw.severity === 'life_threatening' ? colors.danger
          : ev.raw.severity === 'moderate' ? colors.warning : colors.success;
        return { ...ev, badgeColor: col };
      }
      default: return ev;
    }
  });
}
