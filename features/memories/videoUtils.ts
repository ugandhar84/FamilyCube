import { supabase } from '@/lib/supabase';
import { MOOD_COLOR } from '@/constants/theme';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOOD_TO_MUSIC } from '@/lib/yirTemplates';
import { YEAR, MOOD_EMOJI, type GalleryPhoto, type MilestoneRow, type YIRData } from './videoShared';

export function currentHalf(): 'H1' | 'H2' { return new Date().getMonth() < 6 ? 'H1' : 'H2'; }
export function yirLockKey(petId: string) { return `yir_generated_${petId}_${YEAR}_${currentHalf()}`; }
export function yirCacheHalf(): string { return `${YEAR}_${currentHalf()}`; }

export async function isYIRLocked(petId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(yirLockKey(petId));
    if (!raw) return false;
    const unlock = new Date(YEAR + 1, 0, 30);
    return new Date() < unlock;
  } catch { return false; }
}

export async function markYIRGenerated(petId: string) {
  try { await AsyncStorage.setItem(yirLockKey(petId), new Date().toISOString()); } catch {}
}

export function simulatedPhotos(species: string, count: number): Array<{ url: string; taken_at: string; mood_label: string }> {
  const base = species === 'cat' ? 'https://placekitten.com/400/400?image=' : 'https://placedog.net/400/400?id=';
  const MOODS = ['happy', 'playful', 'calm', 'excited'];
  return Array.from({ length: count }, (_, i) => ({
    url: `${base}${10 + i * 7}`,
    taken_at: new Date(YEAR, i * 2, 14 + i).toISOString(),
    mood_label: MOODS[i % MOODS.length],
  }));
}

export async function fetchYIRData(petId: string, pet: any): Promise<YIRData> {
  const [photoRes, moodRes, msRes] = await Promise.all([
    supabase.from('pet_photos').select('id,url,taken_at').eq('pet_id', petId)
      .gte('taken_at', `${YEAR}-01-01`).lte('taken_at', `${YEAR}-12-31`)
      .order('taken_at', { ascending: false }).limit(200),
    supabase.from('mood_logs').select('id,mood_label,mood_score,date').eq('pet_id', petId)
      .gte('date', `${YEAR}-01-01`).lte('date', `${YEAR}-12-31`),
    supabase.from('milestones').select('id,title,emoji,achieved_at').eq('pet_id', petId)
      .gte('achieved_at', `${YEAR}-01-01`).lte('achieved_at', `${YEAR}-12-31`)
      .order('achieved_at', { ascending: true }),
  ]);

  const photos: GalleryPhoto[] = (photoRes.data ?? []).map((r: any) => ({ id: r.id, url: r.url, taken_at: r.taken_at }));
  const moods: any[] = moodRes.data ?? [];
  const milestones: MilestoneRow[] = (msRes.data ?? []).map((r: any) => ({ id: r.id, title: r.title, emoji: r.emoji, achieved_at: r.achieved_at }));

  const moodMap: Record<string, any> = {};
  moods.forEach(m => { moodMap[m.date] = m; });
  const scored: GalleryPhoto[] = photos.map(p => ({
    ...p, mood_score: moodMap[p.taken_at]?.mood_score, mood_label: moodMap[p.taken_at]?.mood_label,
  }));

  const bestPhoto = scored.reduce<GalleryPhoto | null>(
    (b, p) => !b || (p.mood_score ?? 0) > (b.mood_score ?? 0) ? p : b, null);

  const byMonth: Record<string, GalleryPhoto[]> = {};
  scored.forEach(p => { const k = p.taken_at.slice(0, 7); (byMonth[k] ??= []).push(p); });
  const monthlyHighlights = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([key, arr]) => ({
    month: format(parseISO(`${key}-01`), 'MMM'),
    photo: arr.reduce((b, p) => (p.mood_score ?? 0) > (b.mood_score ?? 0) ? p : b),
  }));

  const mc: Record<string, number> = {};
  moods.forEach(m => { mc[m.mood_label] = (mc[m.mood_label] ?? 0) + 1; });
  const total = Math.max(moods.length, 1);
  const topMoods = Object.entries(mc).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, count]) => ({
    label, emoji: MOOD_EMOJI[label] ?? '🐾',
    pct: Math.round((count / total) * 100),
    color: MOOD_COLOR[label] ?? '#7C5CBF',
  }));

  const bestMoments = [...scored].sort((a, b) => (b.mood_score ?? 0) - (a.mood_score ?? 0)).slice(0, 8);

  const ad = pet?.adoption_date ? parseISO(pet.adoption_date) : null;
  const ys = new Date(YEAR, 0, 1);
  const fromDate = ad && ad > ys ? ad : ys;
  const daysTogetherThisYear = ad ? Math.max(0, differenceInCalendarDays(new Date(), fromDate) + 1) : 0;

  const dominantMoodLabel = topMoods[0]?.label ?? null;

  const FALLBACK_TRACKS: Record<string, string> = {
    upbeat:    'https://cdn.pixabay.com/audio/2023/10/30/audio_0a57e6394c.mp3',
    calm:      'https://cdn.pixabay.com/audio/2024/03/11/audio_5c48cf4c99.mp3',
    nostalgic: 'https://cdn.pixabay.com/audio/2022/10/16/audio_a12b856a4a.mp3',
    tender:    'https://cdn.pixabay.com/audio/2023/04/11/audio_9b4ada3afa.mp3',
  };

  let musicUrl: string | null = null;
  const category = dominantMoodLabel ? (MOOD_TO_MUSIC[dominantMoodLabel] ?? 'nostalgic') : 'nostalgic';
  try {
    const { data: tracks } = await supabase
      .from('music_tracks')
      .select('storage_path')
      .eq('category', category)
      .limit(50);
    if (tracks && tracks.length > 0) {
      let h = 5381;
      const s = petId + String(YEAR);
      for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h |= 0; }
      const track = tracks[Math.abs(h) % tracks.length];
      musicUrl = supabase.storage.from('music').getPublicUrl(track.storage_path).data.publicUrl;
    }
  } catch {}
  if (!musicUrl) musicUrl = FALLBACK_TRACKS[category] ?? FALLBACK_TRACKS.nostalgic;

  return {
    totalPhotos: photos.length, totalMoods: moods.length, totalMilestones: milestones.length,
    daysTogetherThisYear, bestPhoto, monthlyHighlights, topMoods, milestonesThisYear: milestones,
    bestMoments, dominantMoodLabel, musicUrl,
  };
}
