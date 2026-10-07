import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { weekOf, DAYS } from '@/features/vault/tabs/meals/types';
import type { FamilyMember } from '@/store/familyStore';
import { AnimatedPressable } from '@/components/AnimatedPressable';

/**
 * TonightMealCard — pixel-faithful rebuild of the Figma Make prototype's
 * `.evening` card (design/Scrollable Content Design/src/App.tsx lines
 * 247-257, src/index.css lines 440-481): 110px photo on the left, dish
 * name + detail + link on the right, white card, radius 22.
 *
 * Reads the real family_meals table directly (same query shape MealsTab.tsx
 * already uses). Deviation from the mock, by necessity: no photo field
 * exists on the Meal row today, so the 110px slot shows the meal's emoji on
 * a tinted background instead of a real photo.
 */
export function TonightMealCard({
  colors, isDark, familyId, members,
}: {
  colors: any; isDark: boolean;
  familyId?: string;
  members: FamilyMember[];
}) {
  const [meal, setMeal] = useState<{ title: string; emoji?: string | null; chef_id: string | null; start_time?: string | null } | null | undefined>(undefined);

  useEffect(() => {
    if (!familyId) { setMeal(null); return; }
    let cancelled = false;
    const today = DAYS[(new Date().getDay() + 6) % 7];
    (async () => {
      const { data, error } = await supabase
        .from('family_meals')
        .select('title, emoji, chef_id, start_time, type')
        .eq('family_id', familyId)
        .eq('week_of', weekOf())
        .eq('day', today)
        .eq('type', 'dinner')
        .maybeSingle();
      if (cancelled) return;
      if (error) { console.warn('[TonightMealCard] fetch failed', error.message); setMeal(null); return; }
      setMeal(data ?? null);
    })();
    return () => { cancelled = true; };
  }, [familyId]);

  const chef = meal?.chef_id ? members.find(m => m.id === meal!.chef_id) : undefined;
  const detailParts = meal ? [meal.start_time, chef ? `${chef.name.split(' ')[0]} cooking` : undefined].filter(Boolean) : [];

  return (
    <View style={{
      marginHorizontal: 20, marginTop: 14, marginBottom: 20,
      flexDirection: 'row', gap: 0,
      borderRadius: 22, overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
      shadowColor: colors.navy, shadowOffset: { width: 0, height: 7 }, shadowOpacity: isDark ? 0 : 0.055, shadowRadius: 24,
    }}>
      <View style={{
        width: 110, minHeight: 145,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.tealLight,
      }}>
        <Text style={{ fontSize: 40 }}>{meal?.emoji ?? '🍽️'}</Text>
      </View>
      <AnimatedPressable
        onPress={() => router.push('/(tabs)/meals' as any)}
        style={{ flex: 1, justifyContent: 'center', paddingTop: 14, paddingBottom: 14, paddingRight: 14, paddingLeft: 14 }}
      >
        <View style={{ alignSelf: 'flex-start' }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.teal, marginBottom: 6, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>TONIGHT</Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '400', color: colors.textPrimary, marginTop: 5, marginBottom: 5 }} numberOfLines={1}>
          {meal?.title ?? 'No dinner planned yet'}
        </Text>
        {detailParts.length > 0 && (
          <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 15 }} numberOfLines={1}>
            {detailParts.join(' · ')}
          </Text>
        )}
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary, marginTop: 10 }}>
          {meal ? 'See meal plan →' : 'Plan dinner →'}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
