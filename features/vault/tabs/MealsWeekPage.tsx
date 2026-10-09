/**
 * MealsWeekPage — "A week at the table" full-page screen.
 * Opened from MealsScreen's landing card via FullPageOverlay.
 * Matches the Figma "A week at the table" design:
 *   ReviewInbox header (FAMILY CUBE / PARKER · ← Meals · title)
 *   Week navigator strip
 *   AI banner (lavender card → triggers AI planner in MealsTab)
 *   "Add meal" CTA
 *   Day cards (via MealsTab)
 */
import { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import MealsTabComp from './MealsTab';

function weekOf(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fmtWeekRange(weekOf: string): string {
  const d = new Date(weekOf + 'T00:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const startStr = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const endStr   = end.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${startStr}–${endStr}`;
}

export default function MealsWeekPage({
  onClose,
  onAiReady,
}: {
  onClose: () => void;
  onAiReady?: (trigger: () => void) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const P = colors.primary;

  const [weekOffset, setWeekOffset] = useState(0);
  const currentWeek = weekOf(weekOffset);
  const weekRange   = fmtWeekRange(currentWeek);

  // AI trigger — wired from MealsTab via onAiReady
  const aiTriggerRef = useRef<(() => void) | null>(null);
  const handleAiReady = useCallback((fn: () => void) => {
    aiTriggerRef.current = fn;
    onAiReady?.(fn);
  }, [onAiReady]);

  // Add meal trigger — MealsTab exposes this via onAddReady
  const addMealTriggerRef = useRef<((day?: string) => void) | null>(null);
  const handleAddReady = useCallback((fn: (day?: string) => void) => {
    addMealTriggerRef.current = fn;
  }, []);

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';

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
            FAMILY CUBE / {familyName.toUpperCase()}
          </Text>
          {activeMember && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
              {(activeMember as any).name} · {(activeMember as any).role === 'parent' ? 'Parent / Admin' : 'Member'}
            </Text>
          )}
        </View>

        {/* Breadcrumb */}
        <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Meals</Text>
        </Pressable>

        {/* Title */}
        <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
          A week at the table
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >

        {/* ── Week navigator ── */}
        <View style={{
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4,
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}>
          <Pressable onPress={() => setWeekOffset(w => w - 1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 20, color: P, fontWeight: '500' }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
            {weekRange}
          </Text>
          <Pressable onPress={() => setWeekOffset(w => w + 1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 20, color: P, fontWeight: '500' }}>›</Text>
          </Pressable>
        </View>

        <Text style={{
          fontSize: 13, fontWeight: '500', color: colors.textSecondary,
          paddingHorizontal: 20, marginBottom: 14, lineHeight: 18,
        }}>
          Shared with the {familyName}s · tap any slot to edit. An open slot is an invitation, not a missed task.
        </Text>

        {/* ── AI suggestions card (lavender) — matches Figma ── */}
        <View style={{
          marginHorizontal: 20, marginBottom: 16,
          backgroundColor: colors.pinkLight, borderRadius: 18, padding: 18, gap: 6,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
            Want a few meal ideas?
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
            Optional suggestions that fit the week. Review before adding anything.
          </Text>
          <Pressable style={{ marginTop: 2 }} onPress={() => aiTriggerRef.current?.()}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.pink }}>
              Preview AI meal plan →
            </Text>
          </Pressable>
        </View>

        {/* ── Add meal button — matches Figma ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <Pressable
            onPress={() => addMealTriggerRef.current?.()}
            style={({ pressed }) => ({
              borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              backgroundColor: pressed ? P + 'CC' : P,
            })}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Add meal</Text>
          </Pressable>
        </View>

        {/* ── Day cards ── */}
        <View style={{ paddingHorizontal: 20 }}>
          <MealsTabComp
            colors={colors}
            isDark={isDark}
            weekOverride={currentWeek}
            onAiReady={handleAiReady}
            onAddReady={handleAddReady}
          />
        </View>

      </ScrollView>
    </View>
  );
}
