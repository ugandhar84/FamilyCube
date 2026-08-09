import { format } from 'date-fns';
import type { Pet } from '@/lib/types';

export const dateStr = (d: Date) => format(d, 'yyyy-MM-dd');

export type Urgency = 'critical' | 'warn' | 'suggest';
export const URGENCY_ORDER: Record<Urgency, number> = { critical: 0, warn: 1, suggest: 2 };

export interface PriorityCard {
  id: string; petId: string; urgency: Urgency;
  emoji: string; title: string; subtitle: string;
  actionLabel: string; onAction: () => void;
}

export type DoneSource = 'feeding' | 'mood' | 'grooming' | 'checklist';

export interface DoneEntry {
  id: string;
  rawId: string;
  source: DoneSource;
  itemType?: string;
  pet: Pet;
  emoji: string;
  label: string;
  time: string;
}

export const URGENCY_GROUPS: { key: Urgency; label: string; emoji: string }[] = [
  { key: 'critical', label: 'Critical', emoji: '🚨' },
  { key: 'warn',     label: 'Watch',    emoji: '⚠️'  },
  { key: 'suggest',  label: 'Later',    emoji: '💡' },
];

export const GROOM_META: Record<string, { label: string; emoji: string }> = {
  bath:      { label: 'Bath',      emoji: '🛁' },
  trim:      { label: 'Haircut',   emoji: '✂️'  },
  nails:     { label: 'Nails',     emoji: '💅' },
  brush:     { label: 'Brushing',  emoji: '🪮' },
  ear_clean: { label: 'Ear Clean', emoji: '👂' },
  dental:    { label: 'Dental',    emoji: '🦷' },
  hoof_trim: { label: 'Hoof trim', emoji: '🐴' },
  mane_tail: { label: 'Mane & tail', emoji: '✂️' },
  cage_clean:{ label: 'Cage clean', emoji: '🧹' },
};

export const GROOM_SPECIES_DEFAULTS: Record<string, Record<string, number>> = {
  dog:    { brush: 2, bath: 14, nails: 14, ear_clean: 7,  trim: 42 },
  cat:    { brush: 2, bath: 30, nails: 14, ear_clean: 14, dental: 7 },
  rabbit: { brush: 2, nails: 30 },
  bird:   { nails: 30, bath: 7 },
};
export const GROOM_GLOBAL: Record<string, number> = {
  brush: 2, bath: 14, nails: 14, ear_clean: 7, trim: 42, dental: 7,
};

export function groomInterval(
  petId: string, type: string, species: string | undefined,
  groomSettings: Record<string, Record<string, number>>,
): number {
  return groomSettings[petId]?.[type]
    ?? GROOM_SPECIES_DEFAULTS[species ?? '']?.[type]
    ?? GROOM_GLOBAL[type] ?? 14;
}
