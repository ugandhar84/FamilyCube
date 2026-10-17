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
import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import MealsTabComp, { type MealFormState, type MealRecipeState } from './MealsTab';
import MealFormSheet from './meals/MealFormSheet';
import RecipeModal from './meals/RecipeModal';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useUIStore } from '@/store/uiStore';
import { localDateStr } from '@/lib/dates';
import { GEMINI } from '@/constants/geminiRhythm';

function weekOf(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
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

  useEffect(() => {
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => {
      // Returning to MealsScreen (still on meals tab) — keep tab bar hidden
      hideTabBar();
      useUIStore.getState().setFullBleedScreenActive(false);
    };
  }, []);


  // Form state lifted from MealsTab — when set, render the form as a full page
  const [formState, setFormState] = useState<MealFormState | null>(null);

  // Recipe detail state lifted from MealsTab — rendered as a sibling at
  // this root level (not nested inside MealsTabComp's own flex:1 region)
  // so RecipeModal's full-page overlay covers this screen's own header +
  // week-navigator strip too, not just the day-card list beneath them
  // [live-requested: "why is this recipie not opening as overlay instead
  // opening the inline page"].
  const [recipeState, setRecipeState] = useState<MealRecipeState | null>(null);

  // "Gemini rhythm" canvas (CLAUDE.md rule 6 exception, extended per
  // explicit request — see Home Care/Grocery/MealsScreen's own identical
  // comment).
  const canvas = isDark ? colors.background : GEMINI.canvas;

  // Early-return: show add/edit form as a full standalone page with swipe-back support
  if (formState) {
    return (
      <SwipeBackWrapper onDismiss={formState.onClose} backgroundColor={canvas}>
        <MealFormSheet
          visible
          day={formState.addDay}
          editingMeal={formState.editMeal}
          familyId={formState.familyId}
          colors={colors} isDark={isDark}
          onClose={formState.onClose}
          onSave={formState.onSave}
          saving={formState.saving}
        />
      </SwipeBackWrapper>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>

      {/* ── ReviewInbox-style header ── */}
      <View style={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(88,114,196,0.08)',
        backgroundColor: canvas,
        gap: 8,
      }}>
        {/* Family chrome */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: isDark ? colors.textSecondary : GEMINI.bodyColorLight }}>
            FAMILY CUBE / {familyName.toUpperCase()}
          </Text>
          {activeMember && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
              {(activeMember as any).name} · {(activeMember as any).role === 'parent' ? 'Parent / Admin' : 'Member'}
            </Text>
          )}
        </View>

        {/* Title — tapping it goes back, no separate breadcrumb link above
            it [live-requested pattern, same as Grocery's sub-screens]. */}
        <Pressable onPress={onClose} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: isDark ? colors.textPrimary : GEMINI.titleColor }}>
            A week at the table
          </Text>
        </Pressable>
      </View>

      {/* Week navigator */}
      <View style={{
        paddingHorizontal: 20, paddingVertical: 12,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(88,114,196,0.06)',
      }}>
        <Pressable allowRapidPress onPress={() => setWeekOffset(w => w - 1)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: 20, color: P, fontWeight: '500' }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor, flex: 1 }}>
          {weekRange}
        </Text>
        <Pressable allowRapidPress onPress={() => setWeekOffset(w => w + 1)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: 20, color: P, fontWeight: '500' }}>›</Text>
        </Pressable>
      </View>

      {/* MealsTab fills the rest — manages its own scroll, AI banner, day cards */}
      <View style={{ flex: 1 }}>
        <MealsTabComp
          colors={colors}
          isDark={isDark}
          weekOverride={currentWeek}
          onFormStateChange={setFormState}
          onRecipeChange={setRecipeState}
          showAddButton
        />
      </View>

      {/* ── Recipe Detail — full-page overlay, lifted to this screen's own
          root so it covers the header + week-nav above, not just MealsTab's
          body. ── */}
      <RecipeModal meal={recipeState?.meal ?? null} visible={!!recipeState}
        onClose={() => setRecipeState(null)}
        onEdit={recipeState?.onEdit}
        onAddToGrocery={recipeState?.onAddToGrocery ?? (async () => {})}
        senderId={recipeState?.senderId ?? ''}
        hideAddToGrocery={recipeState?.hideAddToGrocery}
        colors={colors} isDark={isDark} />

    </View>
  );
}
