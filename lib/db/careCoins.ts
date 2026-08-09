/**
 * Care gamification coin awards.
 * Called after care log actions — fire-and-forget (never block UI).
 *
 * Coins per action (enforced server-side):
 *   care_meal          3 coins · 2×/day per pet
 *   care_mood          5 coins · 1×/day per pet
 *   care_walk          5 coins · 1×/day per pet
 *   care_groom         8 coins · 1×/day per pet
 *   care_day_complete  20 coins · 1×/day per pet (ring hits 100%)
 *   care_streak_3/7/30 15/50/200 coins (consecutive 100% days)
 */

import { awardCoins } from './rewards';
import { supabase } from '@/lib/supabase';
import { todayLocal } from '@/lib/dates';

type CareAction = 'care_meal' | 'care_mood' | 'care_walk' | 'care_groom' | 'care_day_complete';

export function awardCareCoins(
  userId: string,
  action: CareAction,
  petId: string,
): void {
  awardCoins(userId, action as any, petId as any).catch(() => {});
}

/**
 * Call after saveCareScore when score reaches 100.
 * Updates the pet's care streak and fires milestone coin awards.
 */
export async function onCareDayComplete(
  userId: string,
  petId: string,
  score: number,
): Promise<void> {
  if (score < 100) return;

  // Award daily completion coins
  await awardCoins(userId, 'care_day_complete' as any, petId as any).catch(() => {});

  // Update care streak
  try {
    const today = todayLocal();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const { data } = await supabase
      .from('pet_care_streaks')
      .select('current_streak, longest_streak, last_complete_date')
      .eq('pet_id', petId)
      .single();

    const last = data?.last_complete_date ?? null;
    if (last === today) return; // already counted today

    const current = last === yesterdayStr ? (data?.current_streak ?? 0) + 1 : 1;
    const longest  = Math.max(current, data?.longest_streak ?? 0);

    await supabase.from('pet_care_streaks').upsert({
      pet_id: petId, user_id: userId,
      current_streak: current, longest_streak: longest,
      last_complete_date: today, updated_at: new Date().toISOString(),
    }, { onConflict: 'pet_id' });

    // Streak milestone coins
    if (current === 3)  await awardCoins(userId, 'care_streak_3'  as any).catch(() => {});
    if (current === 7)  await awardCoins(userId, 'care_streak_7'  as any).catch(() => {});
    if (current === 30) await awardCoins(userId, 'care_streak_30' as any).catch(() => {});
  } catch {
    // non-fatal
  }
}
