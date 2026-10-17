import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, Image } from 'react-native';
import { useUnsplashMealImage } from '@/lib/hooks/useUnsplashMealImage';
import { useUIStore } from '@/store/uiStore';
import { supabase } from '@/lib/supabase';
import { weekOf, DAYS } from '@/features/vault/tabs/meals/types';
import type { FamilyMember } from '@/store/familyStore';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import FamilyAvatar from '@/components/FamilyAvatar';
import { GEMINI } from '@/constants/geminiRhythm';

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
        .eq('week_of', weekOf())
        .eq('day', today)
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
      onPress={() => useUIStore.getState().setOpenMealsScreenRequested(true)}
      style={{
        marginHorizontal: 20, marginTop: 14, marginBottom: 20,
        flexDirection: 'row', gap: 0,
        borderRadius: 22, overflow: 'hidden',
        backgroundColor: isDark ? colors.card : GEMINI.cardBg,
        borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
        shadowColor: colors.navy, shadowOffset: { width: 0, height: 7 },
        shadowOpacity: isDark ? 0 : 0.055, shadowRadius: 24,
      }}>
      {/* Left food image slot */}
      <View style={{
        width: 110, minHeight: 145,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        backgroundColor: hasMeals ? colors.tealLight : colors.amberLight,
      }}>
        {foodImage ? (
          <Image source={{ uri: foodImage }} style={{ width: 110, height: '100%' as any }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: 38, opacity: hasMeals ? 1 : 0.6 }}>🍽️</Text>
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
            {(() => {
              // Named after the meal's real type, never the time of day (a dinner viewed at noon is still "Dinner").
              const t = (primary?.type ?? '').toLowerCase();
              return t === 'breakfast' ? "TODAY'S BREAKFAST" : t === 'lunch' ? "TODAY'S LUNCH" : t === 'dinner' ? "TONIGHT'S DINNER" : t === 'snack' ? "TODAY'S SNACK" : "TODAY'S MEAL";
            })()}
          </Text>
        </View>

        {hasMeals ? (
          <>
            {/* Primary meal */}
            <Text style={{ fontSize: 17, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor),
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

            {/* Chef: avatar and name when assigned, an explicit "No chef yet" when not, plus the prep time. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              {chef ? (
                <FamilyAvatar name={chef.name} emoji={(chef as any).emoji} avatarUrl={(chef as any).avatarUrl}
                  siblings={members.map(m => m.name)} size={24} ringWidth={0} />
              ) : (
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? colors.surface : colors.tealLight }}>
                  <Text style={{ fontSize: 13 }}>👩‍🍳</Text>
                </View>
              )}
              {chef ? (
                <Animated.Text style={{ fontSize: 13, fontWeight: '700',
                  color: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.teal, colors.primary] }) }}>
                  {chef.name.split(' ')[0]} is cooking
                </Animated.Text>
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textTertiary }}>No chef yet</Text>
              )}
              {primary?.prep_minutes ? (
                <Text style={{ fontSize: 12, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>· ~{primary.prep_minutes} min</Text>
              ) : null}
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 17, fontWeight: '400', color: (isDark ? colors.textPrimary : GEMINI.titleColor),
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
