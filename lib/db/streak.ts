import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

/**
 * Call after ANY care action for a pet (checklist, mood scan, feeding, grooming, vet visit).
 * - Same day as last_care_date → no change (already counted today)
 * - Yesterday was last_care_date → increment streak
 * - Older / null → reset to 1
 * Returns the new streak value.
 */
export async function touchCareStreak(petId: string): Promise<number> {
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: pet, error } = await supabase
    .from('pets')
    .select('care_streak, last_care_date')
    .eq('id', petId)
    .single();

  if (error || !pet) return 0;

  const last: string | null = pet.last_care_date;

  // Already logged today — don't double-count
  if (last === today) return pet.care_streak ?? 0;

  const yesterday = format(new Date(Date.now() - 86_400_000), 'yyyy-MM-dd');
  const newStreak = last === yesterday ? (pet.care_streak ?? 0) + 1 : 1;

  await supabase
    .from('pets')
    .update({ care_streak: newStreak, last_care_date: today })
    .eq('id', petId);

  return newStreak;
}

/** Fetch current streak for a pet */
export async function getCareStreak(petId: string): Promise<number> {
  const { data } = await supabase
    .from('pets')
    .select('care_streak, last_care_date')
    .eq('id', petId)
    .single();
  if (!data) return 0;
  // If last_care_date is not today or yesterday, streak is effectively broken
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86_400_000), 'yyyy-MM-dd');
  if (data.last_care_date !== today && data.last_care_date !== yesterday) return 0;
  return data.care_streak ?? 0;
}
