import { supabase } from '@/lib/supabase';
import { localDateStr, parseDbTime } from '@/lib/dates';
import { formatTime } from '@/lib/units';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type EntryType = 'note' | 'mood' | 'meal' | 'grooming' | 'weight' | 'vet' | 'milestone' | 'checklist' | 'medication' | 'vaccine' | 'appointment';
export type FilterType = 'all' | EntryType;

export interface JournalEntry {
  id: string; rawId: string; type: EntryType;
  timestamp: string; date: string;
  title: string; subtitle?: string;
  chip?: { emoji: string; label: string };
  authorId?: string; authorName?: string;
  petName: string; petEmoji: string;
  canEdit: boolean; canDelete: boolean;
  isPrivate?: boolean; editedAt?: string;
  // Rich per-type fields
  moodScore?: number;
  moodHappy?: number; moodPlayful?: number; moodTired?: number; moodAnxious?: number;
  moodSituation?: string;
  moodAdvice?: { action: string; detail: string; priority: 'now' | 'today' | 'ongoing' }[];
  photoUrl?: string;
  weightKg?: number; prevWeightKg?: number;
  groomType?: string;
  mealType?: string; amountGrams?: number; foodType?: string;
  vetName?: string; clinicName?: string; diagnosis?: string;
  dayCount?: number;
}

export function getTypeColors(colors: any, isDark = false): Record<EntryType, string> {
  // In dark mode avoid purple variants — use bright non-purple colors for text/icons
  if (isDark) {
    return {
      note:        '#B8C4D8',   // cool blue-gray
      mood:        '#FCD34D',   // warm yellow
      meal:        colors.accent ?? '#FF9D6E',
      grooming:    '#4ECDC4',
      weight:      '#4ADE80',
      vet:         '#F87171',
      milestone:   '#FBBF24',
      checklist:   '#94A3B8',
      medication:  '#FBBF24',
      vaccine:     '#4ADE80',
      appointment: '#60A5FA',
    };
  }
  return {
    note:        colors.primaryText ?? colors.primary,
    mood:        colors.info,
    meal:        colors.accent      ?? '#FF8C55',
    grooming:    '#4ECDC4',
    weight:      colors.success,
    vet:         colors.danger,
    milestone:   colors.warning,
    checklist:   colors.textTertiary ?? colors.textSecondary,
    medication:  colors.warning,
    vaccine:     colors.success,
    appointment: colors.info,
  };
}

export const TYPE_LABEL: Record<EntryType, string> = {
  note: 'Note', mood: 'Mood scan', meal: 'Meal', grooming: 'Grooming',
  weight: 'Weight', vet: 'Vet visit', milestone: 'Milestone', checklist: 'Task done',
  medication: 'Medication', vaccine: 'Vaccine', appointment: 'Appointment',
};

export const TYPE_ICON: Record<EntryType, React.ComponentProps<typeof Ionicons>['name']> = {
  note: 'document-text-outline', mood: 'happy-outline', meal: 'restaurant-outline',
  grooming: 'cut-outline', weight: 'scale-outline', vet: 'pulse-outline',
  milestone: 'star-outline', checklist: 'checkbox-outline',
  medication: 'medical-outline', vaccine: 'shield-checkmark-outline', appointment: 'calendar-outline',
};

export const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', playful: '🎉', tired: '😴',
  anxious: '😰', grumpy: '😾', calm: '😌', excited: '🤩',
};

export const GROOM_LABEL: Record<string, string> = {
  bath: 'Bath 🛁', trim: 'Haircut ✂️', nails: 'Nails 💅', brush: 'Brushing 🪮', ear_clean: 'Ear clean 👂',
};

export const MEAL_EMOJI: Record<string, string> = {
  meal: '🍚', breakfast: '🍳', lunch: '🥘', dinner: '🍗', treat: '🦴', water: '💧',
};

export const FILTER_OPTIONS: { key: FilterType; label: string; emoji: string }[] = [
  { key: 'all',         label: 'All',         emoji: '📋' },
  { key: 'note',        label: 'Notes',       emoji: '📝' },
  { key: 'mood',        label: 'Mood',        emoji: '😊' },
  { key: 'meal',        label: 'Meals',       emoji: '🍽' },
  { key: 'grooming',    label: 'Grooming',    emoji: '✂️' },
  { key: 'weight',      label: 'Weight',      emoji: '⚖️' },
  { key: 'medication',  label: 'Medications', emoji: '💊' },
  { key: 'vaccine',     label: 'Vaccines',    emoji: '🛡️' },
  { key: 'appointment', label: 'Appointments',emoji: '📅' },
  { key: 'vet',         label: 'Vet',         emoji: '🩺' },
  { key: 'checklist',   label: 'Activities',  emoji: '🏃' },
  { key: 'milestone',   label: 'Milestones',  emoji: '🏆' },
];

export const ADD_TYPES: { type: EntryType; label: string; sub: string }[] = [
  { type: 'note',     label: 'Note',      sub: 'Observation or thought'  },
  { type: 'meal',     label: 'Meal',      sub: 'Food, treat or water'    },
  { type: 'grooming', label: 'Grooming',  sub: 'Bath, nails, brushing…'  },
  { type: 'weight',   label: 'Weight',    sub: 'Log current weight'       },
  { type: 'vet',      label: 'Vet visit', sub: 'Clinic visit record'      },
  { type: 'mood',     label: 'Mood scan', sub: 'AI mood analysis'         },
];

// ── Fetch ─────────────────────────────────────────────────────────────────────

export function personLabel(uid: string | null | undefined, currentUserId: string, nameMap: Record<string, string>): string | undefined {
  if (!uid) return undefined;
  if (uid === currentUserId) return 'You';
  const name = nameMap[uid];
  return name ? name.split(' ')[0] : undefined;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
// Per-pet in-memory cache with a 30-second TTL. Avoids redundant fetches when
// the user switches tabs and comes back immediately.
export const journalCache = new Map<string, { ts: number; entries: JournalEntry[]; cursor: string | null; hasMore: boolean }>();
export const CACHE_TTL_MS = 30_000;
export const PAGE_SIZE    = 60;

export function getCached(petId: string) {
  const hit = journalCache.get(petId);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) { journalCache.delete(petId); return null; }
  return hit;
}
export function setCache(petId: string, entries: JournalEntry[], cursor: string | null, hasMore: boolean) {
  journalCache.set(petId, { ts: Date.now(), entries, cursor, hasMore });
}
export function invalidateJournalCache(petId?: string) {
  if (petId) journalCache.delete(petId);
  else journalCache.clear();
}

export async function fetchEntries(
  petId: string, userId: string, ownerId: string, petName: string, petEmoji: string,
  cursor?: string | null,
): Promise<{ entries: JournalEntry[]; nextCursor: string | null; hasMore: boolean }> {
  const out: JournalEntry[] = [];

  const { data: rpc, error: rpcErr } = await supabase.rpc('get_pet_journal', {
    p_pet_id: petId,
    p_limit:  PAGE_SIZE,
    ...(cursor ? { p_cursor: cursor } : {}),
  });
  if (rpcErr) {
    console.warn('[Journal] RPC get_pet_journal failed:', rpcErr.message);
    return { entries: out, nextCursor: null, hasMore: false };
  }

  let data: any;
  try { data = typeof rpc === 'string' ? JSON.parse(rpc) : rpc; } catch { return { entries: out, nextCursor: null, hasMore: false }; }
  if (!data) return { entries: out, nextCursor: null, hasMore: false };
  console.log('[Journal] RPC keys:', Object.keys(data), 'moods:', data.moods?.length, 'appts:', data.appointments?.length, 'tasks:', data.tasks?.length);

  const nameMap: Record<string, string> = {};
  for (const p of data.profiles ?? []) if (p.full_name) nameMap[p.id] = p.full_name;
  const who = (uid?: string | null) => personLabel(uid, userId, nameMap);

  const MEAL_ACTION: Record<string, string> = {
    breakfast: 'had breakfast', lunch: 'had lunch', dinner: 'had dinner',
    treat: 'got a treat', water: 'had water', meal: 'was fed',
  };
  const GROOM_ACTION: Record<string, string> = {
    bath: 'got a bath', trim: 'got a haircut', nails: 'got nails trimmed',
    brush: 'was brushed', ear_clean: 'got ears cleaned',
  };
  const ACTIVITY_ACTION: Record<string, string> = {
    walk: 'went for a walk', park: 'went to the park', play: 'had playtime',
    outdoor: 'went outside', cuddle: 'had cuddle time',
    training: 'had training', medicine: 'took medicine', vet: 'visited the vet',
  };

  for (const n of data.notes ?? []) {
    const ts = n.noted_at ?? n.created_at;
    out.push({ id: `note-${n.id}`, rawId: n.id, type: 'note', timestamp: ts, date: localDateStr(parseDbTime(ts)),
      title: n.content, authorId: n.author_id, authorName: who(n.author_id),
      canEdit: n.author_id === userId, canDelete: n.author_id === userId || ownerId === userId,
      isPrivate: n.is_private, editedAt: n.updated_at ?? undefined, petName, petEmoji });
  }

  for (const m of data.moods ?? []) {
    const cap   = m.mood_label.charAt(0).toUpperCase() + m.mood_label.slice(1);
    const emoji = MOOD_EMOJI[m.mood_label.toLowerCase()] ?? '🐾';
    out.push({ id: `mood-${m.id}`, rawId: m.id, type: 'mood', timestamp: m.created_at, date: m.date,
      title: `${cap} mood`, subtitle: m.notes || undefined,
      chip: { emoji, label: cap }, authorId: m.scanned_by ?? undefined, authorName: who(m.scanned_by),
      canEdit: false, canDelete: true, petName, petEmoji,
      moodScore: m.mood_score, moodHappy: m.happy_pct, moodPlayful: m.playful_pct,
      moodTired: m.tired_pct, moodAnxious: m.anxious_pct, photoUrl: m.photo_url ?? undefined,
      moodSituation: m.situation ?? undefined, moodAdvice: m.advice ?? undefined });
  }

  for (const f of data.meals ?? []) {
    const details = [f.food_type, f.amount_grams ? `${f.amount_grams} g` : null].filter(Boolean).join(' · ');
    out.push({ id: `meal-${f.id}`, rawId: f.id, type: 'meal', timestamp: f.fed_at, date: f.date,
      title: `${petName} ${MEAL_ACTION[f.meal_type] ?? 'was fed'}`,
      subtitle: details || undefined, authorId: f.fed_by ?? undefined, authorName: who(f.fed_by),
      canEdit: false, canDelete: true, petName, petEmoji,
      mealType: f.meal_type, amountGrams: f.amount_grams ?? undefined, foodType: f.food_type ?? undefined,
      photoUrl: f.photo_url ?? undefined });
  }

  for (const g of data.grooming ?? []) {
    const ts = g.done_at_time ?? (g.done_at?.includes('T') ? g.done_at : `${g.done_at}T09:00:00`);
    // done_at is already a local calendar date — only derive from the timestamp when we have a real one
    const gDate = g.done_at && !g.done_at.includes('T')
      ? g.done_at
      : localDateStr(parseDbTime(ts));
    out.push({ id: `groom-${g.id}`, rawId: g.id, type: 'grooming', timestamp: ts, date: gDate,
      title: `${petName} ${GROOM_ACTION[g.type] ?? 'was groomed'}`,
      subtitle: g.notes ?? undefined,
      authorId: g.done_by ?? undefined, authorName: who(g.done_by),
      canEdit: false, canDelete: true, petName, petEmoji, groomType: g.type,
      photoUrl: g.photo_url ?? undefined });
  }

  for (const t of data.tasks ?? []) {
    const ts = t.completed_at ?? `${t.date}T12:00:00`;
    out.push({ id: `task-${t.id}`, rawId: t.id, type: 'checklist', timestamp: ts, date: t.date,
      title: t.type === 'medicine' && t.label
        ? `${petName} took ${t.label}`
        : ACTIVITY_ACTION[t.type] ? `${petName} ${ACTIVITY_ACTION[t.type]}` : t.label,
      subtitle: t.notes ?? undefined,
      authorId: t.completed_by ?? undefined, authorName: who(t.completed_by),
      // Medicine completion records are the source of truth for "given today" —
      // deleting them would revert the medication back to pending in today's schedule.
      canEdit: false, canDelete: t.type !== 'medicine', petName, petEmoji,
      photoUrl: t.photo_url ?? undefined });
  }

  for (const v of data.vet_visits ?? []) {
    out.push({ id: `vet-${v.id}`, rawId: v.id, type: 'vet', timestamp: `${v.visit_date}T09:00:00`, date: v.visit_date,
      title: v.reason ? `Vet visit — ${v.reason}` : 'Vet visit',
      subtitle: v.diagnosis ?? undefined,
      canEdit: false, canDelete: true, petName, petEmoji,
      vetName: v.vet_name ?? undefined, clinicName: v.clinic_name ?? undefined, diagnosis: v.diagnosis ?? undefined });
  }

  const weights: any[] = data.weights ?? [];
  for (let i = 0; i < weights.length; i++) {
    const w  = weights[i];
    const ts = w.logged_at?.includes('T') ? w.logged_at : `${w.logged_at}T08:00:00`;
    const wDate = w.logged_at?.includes('T') ? localDateStr(parseDbTime(w.logged_at)) : w.logged_at;
    out.push({ id: `w-${w.id}`, rawId: w.id, type: 'weight', timestamp: ts, date: wDate,
      title: `${petName} weighed in`, subtitle: w.notes ?? undefined,
      authorId: w.logged_by ?? undefined, authorName: who(w.logged_by),
      canEdit: false, canDelete: true, petName, petEmoji,
      weightKg: w.weight_kg, prevWeightKg: weights[i + 1]?.weight_kg ?? undefined });
  }

  for (const ms of data.milestones ?? []) {
    out.push({ id: `ms-${ms.id}`, rawId: ms.id, type: 'milestone', timestamp: `${ms.achieved_at}T00:00:00`, date: ms.achieved_at,
      title: ms.title, canEdit: false, canDelete: false, petName, petEmoji, dayCount: ms.day_count });
  }

  for (const med of data.medications ?? []) {
    const ts = med.start_date ? `${med.start_date}T08:00:00` : med.created_at;
    const medDate = med.start_date ?? localDateStr(parseDbTime(med.created_at));
    const dose = [med.dosage, med.frequency?.replace('_', ' ')].filter(Boolean).join(' · ');
    out.push({ id: `med-${med.id}`, rawId: med.id, type: 'medication', timestamp: ts, date: medDate,
      title: `${petName} prescribed ${med.name}`, subtitle: dose || undefined,
      canEdit: false, canDelete: false, petName, petEmoji });
  }

  for (const vax of data.vaccines ?? []) {
    if (!vax.last_given) continue;
    const ts = `${vax.last_given}T09:00:00`;
    const sub = [vax.vet_name ? `Dr. ${vax.vet_name}` : null, vax.clinic].filter(Boolean).join(' · ');
    out.push({ id: `vax-${vax.id}`, rawId: vax.id, type: 'vaccine', timestamp: ts, date: vax.last_given,
      title: `${petName} received ${vax.name}`, subtitle: sub || undefined,
      canEdit: false, canDelete: false, petName, petEmoji });
  }

  for (const appt of data.appointments ?? []) {
    const ts = appt.scheduled_at;
    const sub = [appt.vet_name ? `Dr. ${appt.vet_name}` : null, appt.clinic_name, appt.notes].filter(Boolean).join(' · ');
    out.push({ id: `appt-${appt.id}`, rawId: appt.id, type: 'appointment', timestamp: ts, date: localDateStr(parseDbTime(ts)),
      title: appt.title || 'Appointment', subtitle: sub || undefined,
      canEdit: false, canDelete: false, petName, petEmoji });
  }

  const sorted = out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const hasMore = out.length >= PAGE_SIZE;
  const nextCursor = hasMore && sorted.length > 0 ? sorted[sorted.length - 1].timestamp : null;
  return { entries: sorted, nextCursor, hasMore };
}

export const DELETE_TABLE: Partial<Record<EntryType, string>> = {
  note: 'pet_notes', mood: 'mood_logs', meal: 'feeding_logs',
  grooming: 'grooming_logs', vet: 'vet_visits', weight: 'weight_logs', checklist: 'daily_checklist',
  // medication, vaccine, appointment — managed via their own pages, not deletable from journal
};
