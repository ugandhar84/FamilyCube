/**
 * KioskDayMealsDrawer — tapping "What's for dinner" on Overview used to do
 * nothing at all: the hero's meal card only had an onPress in its EMPTY
 * state (nothing planned → navigate to Meals), and none once a real meal
 * was showing — live-reported as "the popup with the dinner details" never
 * opening. This is that popup, widened at the owner's request from "just
 * tonight's recipe" to the day's full meal plan (breakfast/lunch/dinner/
 * snack can all exist for one day in family_meals), as scrollable cards.
 *
 * Data: filters useKioskMeals()'s already-loaded week down to `day` — no
 * new query, no new store, same source KioskOverviewTab's own `tonight`
 * card and the Meals tab both already read, so this can never disagree
 * with either about what's actually planned.
 *
 * Shell: KioskFormDrawer with no onSubmit (renders no footer) — this is a
 * display surface, not a form, but still gets the narrow right-anchored
 * drawer, the scrim, the KeyboardAvoidingView (harmless with no inputs)
 * and — the part that actually matters here — KioskModalHost, so opening
 * it counts as kiosk activity and doesn't get silently timed out by the
 * idle lock the way a bare custom Modal would.
 */
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { ChefHat, Clock3, UserRound, Sparkles } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { KioskFormDrawer } from './KioskFormDrawer';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { type KioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Well, EmptyNote } from './KioskOS';

const TYPE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

function typeAccent(k: KioskColors, type: string): string {
  return type === 'breakfast' ? k.gold
    : type === 'lunch' ? k.sage
    : type === 'snack' ? k.blue
    : k.purple; // dinner, and anything unrecognized
}

export function KioskDayMealsDrawer({
  visible, onClose, dayLabel, meals, members, k, isDark,
}: {
  visible: boolean;
  onClose: () => void;
  /** Human day label for the title, e.g. "Today" or "Saturday". */
  dayLabel: string;
  /** Already filtered to one `day` by the caller. */
  meals: Meal[];
  members: FamilyMember[];
  k: KioskColors;
  isDark: boolean;
}) {
  // Dinner-first, then whatever else, mirroring the hero card's own lead
  // (a kitchen display opens on tonight's dinner, not on breakfast) —
  // matches useKioskMeals.daysFromToday's "forward from now" reasoning.
  const ordered = [...meals].sort((a, b) => {
    const rank = (t: string) => (t === 'dinner' ? 0 : t === 'lunch' ? 1 : t === 'breakfast' ? 2 : 3);
    return rank(a.type) - rank(b.type);
  });

  return (
    <KioskFormDrawer
      visible={visible}
      onClose={onClose}
      title={`${dayLabel}'s Meals`}
      subtitle={meals.length > 0 ? `${meals.length} planned` : 'Nothing planned yet'}
      accent={k.gold}
      Icon={ChefHat}
      k={k}
    >
      {ordered.length === 0 ? (
        <EmptyNote text="No meals planned for this day yet — open Meals to add one." k={k} />
      ) : (
        <ScrollView
          style={{ maxHeight: '100%' }}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        >
          {ordered.map(meal => {
            const accent = typeAccent(k, meal.type);
            const chef = members.find(m => m.id === meal.chef_id)?.name?.trim().split(' ')[0];
            return (
              <WidgetCard key={meal.id} k={k} isDark={isDark} style={s.card}>
                <WidgetHeader
                  Icon={ChefHat}
                  eyebrow={TYPE_LABEL[meal.type] ?? meal.type}
                  title={meal.title}
                  accent={accent}
                  k={k}
                  isDark={isDark}
                />

                <View style={s.metaRow}>
                  {!!meal.start_time && (
                    <View style={s.metaChip}>
                      <Clock3 size={14} color={k.textMuted} />
                      <Text style={[s.metaText, { color: k.textMuted }]} numberOfLines={1}>{meal.start_time}</Text>
                    </View>
                  )}
                  {!!meal.prep_minutes && (
                    <View style={s.metaChip}>
                      <Sparkles size={14} color={k.textMuted} />
                      <Text style={[s.metaText, { color: k.textMuted }]} numberOfLines={1}>{meal.prep_minutes} min prep</Text>
                    </View>
                  )}
                  {!!chef && (
                    <View style={s.metaChip}>
                      <UserRound size={14} color={k.textMuted} />
                      <Text style={[s.metaText, { color: k.textMuted }]} numberOfLines={1}>{chef}</Text>
                    </View>
                  )}
                </View>

                {meal.ingredients?.length > 0 && (
                  <Well k={k} accent={accent} style={s.section}>
                    <Text style={[s.sectionTitle, { color: accent }]} numberOfLines={1}>Ingredients</Text>
                    {meal.ingredients.map((ing, i) => (
                      <Text key={i} style={[s.line, { color: k.text }]} numberOfLines={2}>• {ing}</Text>
                    ))}
                  </Well>
                )}

                {meal.prep_steps?.length ? (
                  <Well k={k} accent={accent} style={s.section}>
                    <Text style={[s.sectionTitle, { color: accent }]} numberOfLines={1}>Steps</Text>
                    {meal.prep_steps.map((step, i) => (
                      <Text key={i} style={[s.line, { color: k.text }]} numberOfLines={4}>{i + 1}. {step}</Text>
                    ))}
                  </Well>
                ) : null}
              </WidgetCard>
            );
          })}
        </ScrollView>
      )}
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  list: { gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.lg },
  card: { gap: KIOSK_SPACE.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  section: { gap: 4 },
  sectionTitle: { fontSize: KIOSK_TYPO.label, fontWeight: '900', marginBottom: 2 },
  line: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', lineHeight: KIOSK_TYPO.caption * 1.4 },
});
