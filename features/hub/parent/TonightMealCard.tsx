import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, Image, ScrollView, TouchableOpacity } from 'react-native';
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
      // Carousel order is the order of the day, not relevance to the current hour.
      const ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
      setMeals([...rows].sort((a, b) => {
        const ai = ORDER.indexOf(a.type?.toLowerCase()); const bi = ORDER.indexOf(b.type?.toLowerCase());
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }));
      void sorted;
    })();
    return () => { cancelled = true; };
  }, [familyId]);

  const hasMeals = !!meals && meals.length > 0;
  const SLIDE_H = 160;
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const userMoved = useRef(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 5 * 60_000); return () => clearInterval(t); }, []);
  // The meal that belongs to this part of the day. If that type is not planned, the next one coming up, else the last.
  const focusIndex = (() => {
    if (!meals || meals.length === 0) return 0;
    const d = new Date(clock);
    const mins = d.getHours() * 60 + d.getMinutes();
    const want = mins < 10 * 60 + 30 ? 'breakfast' : mins < 15 * 60 ? 'lunch' : mins < 17 * 60 + 30 ? 'snack' : 'dinner';
    const ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
    const exact = meals.findIndex(m => m.type?.toLowerCase() === want);
    if (exact >= 0) return exact;
    const next = meals.findIndex(m => ORDER.indexOf(m.type?.toLowerCase()) > ORDER.indexOf(want));
    return next >= 0 ? next : meals.length - 1;
  })();
  // Auto-focus: follow the clock until the person swipes to a different meal themselves.
  useEffect(() => {
    if (!hasMeals || userMoved.current) return;
    setPage(focusIndex);
    setTimeout(() => scrollRef.current?.scrollTo({ y: focusIndex * SLIDE_H, animated: false }), 0);
  }, [hasMeals, focusIndex]);
  const goTo = (i: number) => { userMoved.current = true; setPage(i); scrollRef.current?.scrollTo({ y: i * SLIDE_H, animated: true }); };

  const open = () => useUIStore.getState().setOpenMealsScreenRequested(true);
  const cardShell = {
    marginHorizontal: 20, marginTop: 14, marginBottom: 20,
    borderRadius: 22, overflow: 'hidden' as const,
    backgroundColor: isDark ? colors.card : GEMINI.cardBg,
    borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
    shadowColor: colors.navy, shadowOffset: { width: 0, height: 7 },
    shadowOpacity: isDark ? 0 : 0.055, shadowRadius: 24,
  };

  if (!hasMeals) {
    return (
      <AnimatedPressable onPress={open} style={{ ...cardShell, flexDirection: 'row', padding: 18, alignItems: 'center', gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.amberLight }}>
          <Text style={{ fontSize: 28, opacity: 0.7 }}>🍽️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>No meals planned yet</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary, marginTop: 6 }}>Plan today's meals →</Text>
        </View>
      </AnimatedPressable>
    );
  }

  return (
    // iOS Smart-Stack style: the meals sit in the same spot and a vertical swipe pages from one to the next.
    <View style={{ ...cardShell, height: SLIDE_H }}>
      <ScrollView
        ref={scrollRef}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        decelerationRate="fast"
        snapToInterval={SLIDE_H}
        onScrollBeginDrag={() => { userMoved.current = true; }}
        onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.y / SLIDE_H))}
        scrollEventThrottle={32}
      >
        {meals!.map(m => (
          <MealSlide key={m.id} meal={m} height={SLIDE_H} colors={colors} isDark={isDark} members={members}
            pulseAnim={pulseAnim} onPress={open} />
        ))}
      </ScrollView>
      {meals!.length > 1 && (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center', gap: 6 }}>
          {meals!.map((m, i) => (
            <TouchableOpacity key={m.id} hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }} onPress={() => goTo(i)}
              accessibilityRole="button" accessibilityLabel={`Show ${m.type}`}>
              <View style={{ width: 6, height: i === page ? 16 : 6, borderRadius: 3, backgroundColor: i === page ? colors.teal : colors.border }} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function MealSlide({ meal, height, colors, isDark, members, pulseAnim, onPress }: {
  meal: TodayMeal; height: number; colors: any; isDark: boolean; members: FamilyMember[];
  pulseAnim: Animated.Value; onPress: () => void;
}) {
  const chef = meal.chef_id ? members.find(m => m.id === meal.chef_id) : undefined;
  const foodImage = useUnsplashMealImage(meal.title ?? '');
  const t = (meal.type ?? '').toLowerCase();
  // Named after the meal's real type, never the time of day (a dinner viewed at noon is still "Dinner").
  const label = t === 'breakfast' ? "TODAY'S BREAKFAST" : t === 'lunch' ? "TODAY'S LUNCH" : t === 'dinner' ? "TONIGHT'S DINNER" : t === 'snack' ? "TODAY'S SNACK" : "TODAY'S MEAL";
  return (
    <AnimatedPressable onPress={onPress} style={{ height, flexDirection: 'row' }}>
      <View style={{ width: 110, height, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.tealLight }}>
        {foodImage
          ? <Image source={{ uri: foodImage }} style={{ width: 110, height: '100%' as any }} resizeMode="cover" />
          : <Text style={{ fontSize: 38 }}>{TYPE_EMOJI[t] ?? '🍽️'}</Text>}
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 26 }}>
        <View style={{ alignSelf: 'flex-start', marginBottom: 4 }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.teal, marginBottom: 5, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>{label}</Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '600', color: isDark ? colors.textPrimary : GEMINI.titleColor, marginBottom: 3 }} numberOfLines={2}>
          {meal.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {chef ? (
            <FamilyAvatar name={chef.name} emoji={(chef as any).emoji} avatarUrl={(chef as any).avatarUrl}
              siblings={members.map(m => m.name)} size={24} ringWidth={0} />
          ) : (
            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.surface : colors.tealLight }}>
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
          {meal.prep_minutes ? (
            <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>· ~{meal.prep_minutes} min</Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary, marginTop: 8 }}>See full week →</Text>
      </View>
    </AnimatedPressable>
  );
}
