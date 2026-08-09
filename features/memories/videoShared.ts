/**
 * Shared constants and types for the Year-in-Review video feature.
 * Imported by VideoScreen and its extracted slide components.
 */
import { Dimensions } from 'react-native';

export const { width, height } = Dimensions.get('window');
export const SLIDE_MS = 5000;
export const FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
export const MONTHLY_CELL = Math.floor(width / 3);
export const YEAR = new Date().getFullYear();

export const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', playful: '🎉', tired: '😴',
  anxious: '😰', grumpy: '😾', calm: '😌', excited: '🤩',
};

export interface GalleryPhoto {
  id: string; url: string; taken_at: string;
  mood_score?: number; mood_label?: string;
}
export interface MilestoneRow {
  id: string; title: string; emoji?: string; achieved_at: string;
}

export interface YIRData {
  totalPhotos: number; totalMoods: number;
  totalMilestones: number; daysTogetherThisYear: number;
  bestPhoto: GalleryPhoto | null;
  monthlyHighlights: { month: string; photo: GalleryPhoto }[];
  topMoods: { label: string; emoji: string; pct: number; color: string }[];
  milestonesThisYear: MilestoneRow[];
  bestMoments: GalleryPhoto[];
  dominantMoodLabel: string | null;
  musicUrl: string | null;
}

export type SType = 'cover' | 'stats' | 'magazine' | 'triptych' | 'filmstrip' | 'moment' | 'moods' | 'milestones' | 'monthly' | 'closing';
export interface Slide { type: SType; photos?: GalleryPhoto[]; }

export function buildSlides(d: YIRData): Slide[] {
  const pool = d.bestMoments.length > 0 ? d.bestMoments : (d.bestPhoto ? [d.bestPhoto] : []);
  const slides: Slide[] = [{ type: 'cover', photos: d.bestPhoto ? [d.bestPhoto] : [] }];
  slides.push({ type: 'stats' });

  const layouts: Array<{ type: SType; count: number }> = [
    { type: 'magazine',  count: 5 },
    { type: 'triptych',  count: 3 },
    { type: 'filmstrip', count: 5 },
  ];
  let li = 0;
  let i = 0;
  while (i < pool.length) {
    const remaining = pool.length - i;
    if (remaining === 1) {
      slides.push({ type: 'moment', photos: pool.slice(i, i + 1) }); i += 1;
    } else {
      const lay = layouts[li % layouts.length];
      const take = Math.min(lay.count, remaining);
      slides.push({ type: lay.type, photos: pool.slice(i, i + take) });
      i += take; li++;
    }
  }

  if (d.topMoods.length) slides.push({ type: 'moods' });
  if (d.milestonesThisYear.length) slides.push({ type: 'milestones' });
  if (d.monthlyHighlights.length >= 3) slides.push({ type: 'monthly' });
  slides.push({ type: 'closing' });
  return slides;
}
