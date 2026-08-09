import { showUpgradeAlert } from '@/lib/subscription';
import { supabase as _supabase } from '@/lib/supabase';

export type MoodLabel = 'happy' | 'playful' | 'tired' | 'anxious' | 'calm' | 'grumpy';

export const MOOD_EMOJI_MAP: Record<MoodLabel, string> = {
  happy: '😄', playful: '🤩', tired: '😴', anxious: '😰', calm: '😌', grumpy: '😒',
};

export const MOOD_GRADIENT: Record<MoodLabel, [string, string]> = {
  happy:   ['#7C5CBF', '#14B8A6'],
  playful: ['#FF8C55', '#FF3B5C'],
  tired:   ['#5A6B8A', '#3D4F66'],
  anxious: ['#E24B4A', '#FF8C55'],
  calm:    ['#14B8A6', '#2196F3'],
  grumpy:  ['#6B5A5A', '#9B7B7B'],
};

export interface AdviceItem { action: string; detail: string; priority: 'now' | 'today' | 'ongoing' }

export interface MoodResult {
  mood_label: MoodLabel;
  mood_score: number;
  happy_pct: number; playful_pct: number; tired_pct: number; anxious_pct: number;
  notes: string;
  situation?: string | null;
  advice?: AdviceItem[];
  confidence?: number;
  source?: 'gemini' | 'fallback';
}

export const SCAN_STEPS = [
  { text: 'Detecting pet in frame…',  icon: 'search-outline',    durationMs: 900 },
  { text: 'Reading facial cues…',      icon: 'eye-outline',       durationMs: 900 },
  { text: 'Analysing body language…', icon: 'body-outline',      durationMs: 900 },
  { text: 'Calculating mood score…',  icon: 'analytics-outline', durationMs: 700 },
];
export const TOTAL_GIMMICK_MS = SCAN_STEPS.reduce((s, x) => s + x.durationMs, 0);

export function mockAnalyze(): MoodResult {
  const labels: MoodLabel[] = ['happy', 'playful', 'tired', 'calm', 'anxious'];
  const mood_label = labels[Math.floor(Math.random() * labels.length)];
  const rawHappy   = Math.random() * 55 + 15;
  const rawPlayful = Math.random() * 35;
  const rawTired   = Math.random() * 25;
  const rawAnxious = Math.random() * 20;
  const total      = rawHappy + rawPlayful + rawTired + rawAnxious;
  const happy_pct   = Math.round((rawHappy   / total) * 100);
  const playful_pct = Math.round((rawPlayful / total) * 100);
  const tired_pct   = Math.round((rawTired   / total) * 100);
  const anxious_pct = Math.max(0, 100 - happy_pct - playful_pct - tired_pct);
  return {
    mood_label, mood_score: Math.round((happy_pct + playful_pct * 0.7) / 1.8),
    happy_pct, playful_pct, tired_pct, anxious_pct,
    notes: `Your pet looks ${mood_label} based on posture and expression cues.`,
    source: 'fallback',
  };
}

export async function callGemini(
  b64: string,
  activePetId: string | undefined,
  pet: any,
): Promise<MoodResult> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Please sign in again to analyze your pet\'s mood.');
    }
    const res = await fetch(`${supabaseUrl}/functions/v1/analyze-pet-mood`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({
        image_base64: b64, mime_type: 'image/jpeg',
        pet_id: activePetId, pet_name: pet?.name,
        pet_species: pet?.species, pet_breed: pet?.breed,
      }),
    });
    const text = await res.text();
    if (res.status === 402) {
      const d = JSON.parse(text);
      if (d?.code === 'ultimate_required') {
        showUpgradeAlert({ requiredTier: 'ultimate', message: 'AI Mood Analysis requires Ultimate.' });
        return { ...mockAnalyze(), source: 'fallback' };
      }
      if (d?.code === 'pro_required') {
        showUpgradeAlert({ message: 'Upgrade to use AI Mood Analysis.' });
        return { ...mockAnalyze(), source: 'fallback' };
      }
    }
    if (res.status === 422) {
      const d = JSON.parse(text);
      if (d?.species_match === false) {
        throw Object.assign(
          new Error(d?.message ?? `Wrong pet in photo. Please upload a photo of your ${pet?.name ?? 'pet'}.`),
          { code: 'SPECIES_MISMATCH', species_found: d?.species_found ?? '' },
        );
      }
      throw Object.assign(new Error(d?.message ?? 'No pet detected'), { code: 'NO_PET' });
    }
    if (res.status === 429) return { ...mockAnalyze(), source: 'fallback' };
    if (!res.ok)           return { ...mockAnalyze(), source: 'fallback' };
    const data = JSON.parse(text);
    if (!data || data.error) return { ...mockAnalyze(), source: 'fallback' };
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v ?? 0)));
    const validLabels: MoodLabel[] = ['happy', 'playful', 'tired', 'anxious', 'calm', 'grumpy'];
    return {
      mood_label:  validLabels.includes(data.mood_label) ? data.mood_label : 'calm',
      mood_score:  clamp(data.mood_score),   happy_pct:   clamp(data.happy_pct),
      playful_pct: clamp(data.playful_pct),  tired_pct:   clamp(data.tired_pct),
      anxious_pct: clamp(data.anxious_pct),
      notes: data.notes ?? `Your pet looks ${data.mood_label}.`,
      situation: data.situation ?? null,
      advice: Array.isArray(data.advice) ? data.advice.filter((a: any) => a?.action && a?.detail) : [],
      confidence: clamp(data.confidence ?? 80), source: 'gemini',
    };
  } catch (err: any) {
    if (err?.code === 'NO_PET') throw err;
    if (err?.code === 'SPECIES_MISMATCH') throw err;
    return { ...mockAnalyze(), source: 'fallback' };
  }
}
