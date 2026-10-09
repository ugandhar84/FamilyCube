import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CalendarDays, Sparkles, ShoppingBag, ChefHat } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useFamilyStore } from '@/store/familyStore';
import FullPageOverlay from '@/components/FullPageOverlay';
import MealsWeekPage from './MealsWeekPage';
import { supabase } from '@/lib/supabase';
import type { Meal } from './meals/types';

function todayDayAbbr(): string {
  const ABBRS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return ABBRS[new Date().getDay()];
}

function currentWeekOf(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function MealsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const familyId = (members[0] as any)?.familyId as string | undefined;
  const P = colors.primary;

  const [showWeekPlan, setShowWeekPlan] = useState(false);
  const aiTriggerRef = useRef<(() => void) | null>(null);
  const handleAiReady = useCallback((fn: () => void) => { aiTriggerRef.current = fn; }, []);

  // Fetch tonight's dinner to show in the hero card
  const [tonightMeal, setTonightMeal] = useState<Meal | null>(null);
  useEffect(() => {
    if (!familyId) return;
    const today = todayDayAbbr();
    const week  = currentWeekOf();
    supabase
      .from('family_meals')
      .select('*')
      .eq('family_id', familyId)
      .eq('week_of', week)
      .eq('day', today)
      .in('type', ['dinner', 'Dinner'])
      .limit(1)
      .then(({ data }) => { if (data?.[0]) setTonightMeal(data[0] as Meal); });
  }, [familyId]);

  // Chef name for tonight's meal
  const chefName = tonightMeal?.chef_id
    ? members.find(m => m.id === tonightMeal.chef_id)?.name?.split(' ')[0] ?? null
    : null;

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardBg = isDark ? colors.card : '#FFFFFF';

  const categories = [
    {
      key: 'week',
      title: "This week's meals",
      subtitle: "Plan, edit and view the family's weekly dinner schedule",
      icon: CalendarDays,
      color: colors.primary,
      bg: colors.primaryLight,
      onPress: () => setShowWeekPlan(true),
    },
    {
      key: 'ai',
      title: 'AI meal planner',
      subtitle: 'Get personalised suggestions for open slots — review before adding',
      icon: Sparkles,
      color: colors.pink,
      bg: colors.pinkLight,
      onPress: () => { setShowWeekPlan(true); setTimeout(() => aiTriggerRef.current?.(), 400); },
    },
    {
      key: 'grocery',
      title: 'Shared groceries',
      subtitle: "See what's on the list and add missing ingredients",
      icon: ShoppingBag,
      color: colors.teal,
      bg: colors.tealLight,
      onPress: () => router.push('/(tabs)/grocery' as any),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>

      {/* ── ReviewInbox-style header ── */}
      <View style={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas,
        gap: 8,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
            {familyName.toUpperCase()}
          </Text>
          {activeMember && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
              {(activeMember as any).name}
            </Text>
          )}
        </View>

        <View style={{ gap: 4, marginTop: 2 }}>
          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
            Meals
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
            Plan the week, explore recipes, and keep the list stocked.
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 80 }}
      >

        {/* ── Tonight's dinner hero card ── */}
        <Pressable
          onPress={() => setShowWeekPlan(true)}
          style={({ pressed }) => ({
            borderRadius: 22, overflow: 'hidden',
            backgroundColor: isDark ? colors.card : '#FFFFFF',
            opacity: pressed ? 0.88 : 1,
            ...Platform.select({
              ios: {
                shadowColor: colors.navy,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.22 : 0.10,
                shadowRadius: 14,
              },
              android: { elevation: 4 },
            }),
          })}
        >
          {/* Pastel top band */}
          <View style={{
            backgroundColor: colors.primaryLight,
            paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16,
            flexDirection: 'row', alignItems: 'center', gap: 14,
          }}>
            {/* Emoji bubble */}
            <View style={{
              width: 72, height: 72, borderRadius: 20,
              backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.75)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {tonightMeal?.emoji ? (
                <Text style={{ fontSize: 38 }}>{tonightMeal.emoji}</Text>
              ) : (
                <ChefHat size={32} color={colors.primary} strokeWidth={1.6} />
              )}
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.primary }}>
                TONIGHT'S DINNER
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, lineHeight: 25 }}
                numberOfLines={2}>
                {tonightMeal?.title ?? 'No dinner planned yet'}
              </Text>
            </View>
          </View>

          {/* Bottom info strip */}
          <View style={{
            paddingHorizontal: 18, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <View style={{ gap: 2 }}>
              {tonightMeal?.start_time ? (
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                  {tonightMeal.start_time}
                  {chefName ? ` · ${chefName} cooks` : ''}
                </Text>
              ) : chefName ? (
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                  {chefName} cooks tonight
                </Text>
              ) : (
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  Tap to plan the week
                </Text>
              )}
              {tonightMeal?.prep_minutes != null && (
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {tonightMeal.prep_minutes} min prep
                  {tonightMeal.dietary_tags?.length ? ' · ' + tonightMeal.dietary_tags.slice(0, 2).join(', ') : ''}
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 22, color: colors.primary }}>›</Text>
          </View>
        </Pressable>

        {/* ── Category cards (ReviewInbox style) ── */}
        {categories.map(cat => {
          const Icon = cat.icon;
          return (
            <Pressable
              key={cat.key}
              onPress={cat.onPress}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 16,
                backgroundColor: cardBg,
                borderRadius: 18, padding: 18,
                opacity: pressed ? 0.85 : 1,
                ...Platform.select({
                  ios: {
                    shadowColor: colors.navy,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isDark ? 0.16 : 0.07,
                    shadowRadius: 10,
                  },
                  android: { elevation: 2 },
                }),
              })}
            >
              <View style={{
                width: 52, height: 52, borderRadius: 14,
                backgroundColor: cat.bg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={24} color={cat.color} strokeWidth={1.8} />
              </View>

              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  {cat.title}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
                  {cat.subtitle}
                </Text>
              </View>

              <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
            </Pressable>
          );
        })}

      </ScrollView>

      {/* ── Week plan full-page overlay ── */}
      <FullPageOverlay
        visible={showWeekPlan}
        onDismiss={() => setShowWeekPlan(false)}
        zIndex={50}
      >
        <MealsWeekPage
          onClose={() => setShowWeekPlan(false)}
          onAiReady={handleAiReady}
        />
      </FullPageOverlay>

    </View>
  );
}
