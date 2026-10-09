import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, Image } from 'react-native';
import { useUnsplashMealImage } from '@/lib/hooks/useUnsplashMealImage';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { weekOf, DAYS } from '@/features/vault/tabs/meals/types';
import type { FamilyMember } from '@/store/familyStore';
import { AnimatedPressable } from '@/components/AnimatedPressable';

type TodayMeal = {
  id: string; title: string; emoji?: string | null;
  type: string; chef_id: string | null;
  start_time?: string | null; prep_minutes?: number | null;
};

const TYPE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};
const TYPE_EMOJI: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

export function TonightMealCard({
  colors, isDark, familyId, members,
}: {
  colors: any; isDark: boolean;
  familyId?: string;
  members: FamilyMember[];
}) {
  const [meals, setMeals] = useState<TodayMeal[] | undefined>(undefined);

  // Pulse glow on the chef avatar to draw attention
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!familyId) return; // wait — don't set [] yet, familyId may still be loading
    let cancelled = false;
    const today = DAYS[(new Date().getDay() + 6) % 7];
    const hour  = new Date().getHours();
    // Show the most relevant meal slot for the time of day, fall back to all today's meals
    const preferOrder = hour < 10
      ? ['breakfast', 'snack', 'lunch', 'dinner']
      : hour < 15
      ? ['lunch', 'breakfast', 'snack', 'dinner']
      : ['dinner', 'lunch', 'snack', 'breakfast'];
    (async () => {
      const { data, error } = await supabase
        .from('family_meals')
        .select('id, title, emoji, type, chef_id, start_time, prep_minutes')
        .eq('family_id', familyId)
        .gte('week_of', weekOf())
        .eq('day', today)
        .order('week_of', { ascending: true })
        .order('type');
      if (cancelled) return;
      if (error) { setMeals([]); return; }
      const rows = (data as TodayMeal[]) ?? [];
      // Sort by preferred time-of-day order so primary meal is most relevant
      const sorted = [...rows].sort((a, b) => {
        const ai = preferOrder.indexOf(a.type?.toLowerCase());
        const bi = preferOrder.indexOf(b.type?.toLowerCase());
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setMeals(sorted);
    })();
    return () => { cancelled = true; };
  }, [familyId]);

  const hasMeals = meals && meals.length > 0;
  const primary = meals?.[0];
  const chef = primary?.chef_id ? members.find(m => m.id === primary.chef_id) : undefined;
  const foodImage = useUnsplashMealImage(primary?.title ?? '');

  return (
    <AnimatedPressable
      onPress={() => router.push('/(tabs)/meals' as any)}
      style={{
        marginHorizontal: 20, marginTop: 14, marginBottom: 20,
        flexDirection: 'row', gap: 0,
        borderRadius: 22, overflow: 'hidden',
        backgroundColor: colors.card,
        borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
        shadowColor: colors.navy, shadowOffset: { width: 0, height: 7 },
        shadowOpacity: isDark ? 0 : 0.055, shadowRadius: 24,
      }}>
      {/* Left food image slot */}
      <View style={{
        width: 110, minHeight: 145,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        backgroundColor: hasMeals ? colors.tealLight : colors.surface,
      }}>
        {foodImage ? (
          <Image source={{ uri: foodImage }} style={{ width: 110, height: '100%' as any }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: 38, opacity: hasMeals ? 1 : 0.35 }}>🍽️</Text>
        )}
        {hasMeals && meals!.length > 1 && (
          <View style={{ position: 'absolute', bottom: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.teal,
              letterSpacing: 0.3 }}>
              +{meals!.length - 1} more
            </Text>
          </View>
        )}
      </View>

      {/* Right content */}
      <View style={{ flex: 1, justifyContent: 'center',
        paddingTop: 14, paddingBottom: 14, paddingHorizontal: 14 }}>
        {/* Section label */}
        <View style={{ alignSelf: 'flex-start', marginBottom: 4 }}>
          <View style={{ height: 2, borderRadius: 1,
            backgroundColor: colors.teal, marginBottom: 5, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10,
            fontWeight: '700', letterSpacing: 0.9 }}>
            {new Date().getHours() < 10 ? 'THIS MORNING' : new Date().getHours() < 15 ? "TODAY'S LUNCH" : "TONIGHT'S DINNER"}
          </Text>
        </View>

        {hasMeals ? (
          <>
            {/* Primary meal */}
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary,
              marginBottom: 3 }} numberOfLines={1}>
              {primary!.title}
            </Text>

            {/* Extra meals as small pills */}
            {meals!.length > 1 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                {meals!.slice(1).map(m => (
                  <View key={m.id} style={{ borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
                    backgroundColor: colors.amberLight }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.amber }}>
                      {m.title.length > 14 ? m.title.slice(0, 12) + '…' : m.title}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Chef name with pulse flash */}
            {chef && (
              <View style={{ marginTop: 4, marginBottom: 2 }}>
                <Animated.Text style={{ fontSize: 12, fontWeight: '700',
                  color: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.teal, colors.primary] }) }}>
                  {chef.name.split(' ')[0]} is cooking
                </Animated.Text>
                {primary?.prep_minutes ? (
                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                    ~{primary.prep_minutes} min
                  </Text>
                ) : null}
              </View>
            )}
            {!chef && primary?.prep_minutes ? (
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                ~{primary.prep_minutes} min
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={{ fontSize: 17, fontWeight: '400', color: colors.textPrimary,
            marginTop: 5, marginBottom: 5 }}>
            No meals planned yet
          </Text>
        )}

        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary, marginTop: 8 }}>
          {hasMeals ? 'See full week →' : 'Plan today\'s meals →'}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
