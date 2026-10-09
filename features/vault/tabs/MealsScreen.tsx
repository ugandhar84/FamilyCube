import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CalendarDays, Sparkles, ShoppingBag } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useFamilyStore } from '@/store/familyStore';
import FullPageOverlay from '@/components/FullPageOverlay';
import MealsWeekPage from './MealsWeekPage';

export default function MealsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const P = colors.primary;

  const [showWeekPlan, setShowWeekPlan] = useState(false);
  const aiTriggerRef = useRef<(() => void) | null>(null);
  const handleAiReady = useCallback((fn: () => void) => { aiTriggerRef.current = fn; }, []);

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
        {/* Family chrome */}
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

        {/* Title row */}
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
              {/* Icon pill */}
              <View style={{
                width: 52, height: 52, borderRadius: 14,
                backgroundColor: cat.bg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={24} color={cat.color} strokeWidth={1.8} />
              </View>

              {/* Text */}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  {cat.title}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
                  {cat.subtitle}
                </Text>
              </View>

              {/* Chevron */}
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
