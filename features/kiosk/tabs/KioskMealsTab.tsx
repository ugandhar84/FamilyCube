/**
 * KioskMealsTab — "Meals & Grocery", the mockup's kitchen tab.
 *
 * This is the one genuinely NEW kiosk tab. Meals and grocery are both real,
 * long-standing features of this app (features/vault/tabs/MealsTab.tsx over
 * the `family_meals` table; features/grocery/GroceryScreen.tsx over
 * store/groceryStore.ts) that had no kiosk surface at all — which is a
 * strange gap, since a wall-mounted screen in the kitchen is the single
 * most obvious place in the product for both.
 *
 * No new store was created for either. Meals come through useKioskMeals,
 * which runs the same `family_meals` query MealsTab runs and reuses its own
 * Meal type/weekOf helper. Grocery goes straight through the existing
 * useGroceryStore — including its realtime subscription, so a partner
 * checking items off at the store updates this screen live, and its
 * addItem/buyItem actions, so a check-off here is a real DB write another
 * device sees, not local state.
 *
 * Two deliberate scope decisions:
 *   · NO stove/oven timer widget. The mockup has one; the owner ruled it
 *     out of scope. Nothing here schedules or counts anything.
 *   · NO AI meal generation. That flow (MealsTab's CubeAI planner, the
 *     family-ai edge function, a multi-step select-and-confirm phase) is a
 *     considered, multi-screen interaction that does not shrink onto a
 *     glanceable kitchen panel usefully. Kiosk READS the plan and manages
 *     the grocery list against it; planning the week stays on the phone.
 *     The empty state says so rather than dead-ending.
 *
 * Role scoping: adding and checking off grocery items is open to everyone
 * (a kid noticing the milk is gone is exactly the behavior a family list
 * wants, and it's how the phone's own grocery screen already behaves).
 * Nothing here deletes.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { ChefHat, ShoppingCart, Plus, Check, Circle } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useGroceryStore } from '@/store/groceryStore';
import { categorizeItem } from '@/features/vault/tabs/meals/types';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Well, Chip, TabTitle, EmptyNote } from '../components/KioskOS';
import { useKioskMeals, daysFromToday, todayMealDay } from '../useKioskMeals';
import { useKioskActivity } from '../KioskActivityContext';

export function KioskMealsTab({ active, members }: { active: FamilyMember; members: FamilyMember[] }) {
  const { k, isDark } = useKioskColors();
  const { meals, loading, week } = useKioskMeals();
  const { registerActivity } = useKioskActivity();

  const items = useGroceryStore(s => s.items);
  const load = useGroceryStore(s => s.load);
  const addItem = useGroceryStore(s => s.addItem);
  const buyItem = useGroceryStore(s => s.buyItem);

  const familyId = (members[0] as any)?.familyId as string | undefined;

  // Same load call GroceryScreen makes on mount. Idempotent — the store's
  // own guard short-circuits if it's already subscribed for this family, so
  // this costs nothing when the phone's grocery screen already loaded it.
  useEffect(() => { if (familyId) load(familyId); }, [familyId, load]);

  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const submitItem = async () => {
    const name = draft.trim();
    if (!name || !familyId || adding) return;
    setAdding(true);
    // Category is inferred with the SAME categorizeItem the meals feature
    // uses for its AI grocery hand-off, so an item added from the kitchen
    // wall groups identically to one added from a recipe.
    await addItem({ familyId, name, category: categorizeItem(name), addedBy: active.id });
    setDraft('');
    setAdding(false);
  };

  // Days ordered from today forward, so a kitchen display opens on tonight
  // rather than on Monday. Only days with a planned meal are rendered —
  // seven mostly-empty day cards is what the phone's full planner is for.
  const byDay = useMemo(() => {
    const map = new Map<string, typeof meals>();
    for (const m of meals) {
      const list = map.get(m.day) ?? [];
      list.push(m);
      map.set(m.day, list);
    }
    return daysFromToday()
      .map(day => ({ day, meals: map.get(day) ?? [] }))
      .filter(d => d.meals.length > 0);
  }, [meals]);

  const today = todayMealDay();

  return (
    <ScrollView
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={registerActivity}
    >
      <TabTitle
        title="Meals & Grocery"
        subtitle={`This week's plan and the household list · week of ${week}`}
        k={k}
      />

      <View style={s.columns}>
        {/* ══ MEAL PLAN ═══════════════════════════════════════════════ */}
        <View style={s.colWide}>
          <WidgetCard k={k} isDark={isDark} padded={false} style={s.panel}>
            <View style={s.panelPad}>
              <WidgetHeader
                Icon={ChefHat} eyebrow="Week plan" title="What we're eating"
                accent={k.gold} k={k} isDark={isDark}
                right={meals.length > 0
                  ? <Chip label={`${meals.length} planned`} accent={k.gold} isDark={isDark} k={k} />
                  : undefined}
              />
            </View>

            {loading ? (
              <ActivityIndicator color={k.gold} style={{ marginVertical: KIOSK_SPACE.xl }} />
            ) : byDay.length === 0 ? (
              <View style={s.panelPad}>
                <Well k={k} style={{ alignItems: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xl }}>
                  <ChefHat size={30} color={k.textFaint} />
                  <EmptyNote
                    text="No meals planned for this week yet. Plan the week from the Meals screen on a phone — the plan appears here automatically."
                    k={k}
                    style={{ textAlign: 'center', maxWidth: 380 }}
                  />
                </Well>
              </View>
            ) : (
              <View style={[s.panelPad, { paddingTop: 0, gap: KIOSK_SPACE.sm }]}>
                {byDay.map(({ day, meals: dayMeals }) => (
                  <Well
                    key={day}
                    k={k}
                    accent={day === today ? k.gold : undefined}
                    style={s.dayRow}
                  >
                    <View style={s.dayLabelCol}>
                      <Text
                        style={[s.dayLabel, { color: day === today ? k.gold : k.textMuted }]}
                        numberOfLines={1}
                      >
                        {day === today ? 'TONIGHT' : day.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: KIOSK_SPACE.xs }}>
                      {dayMeals.map(m => (
                        <View key={m.id} style={s.mealLine}>
                          <Text style={s.mealEmoji}>{m.emoji ?? '🍽️'}</Text>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[s.mealTitle, { color: k.text }]} numberOfLines={2}>
                              {m.title}
                            </Text>
                            <Text style={[s.mealMeta, { color: k.textMuted }]} numberOfLines={1}>
                              {[
                                m.type ? cap(m.type) : null,
                                m.start_time || null,
                                m.prep_minutes ? `${m.prep_minutes} min` : null,
                                chefName(m.chef_id, members),
                              ].filter(Boolean).join(' · ') || 'No details yet'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </Well>
                ))}
              </View>
            )}
          </WidgetCard>
        </View>

        {/* ══ GROCERY LIST ════════════════════════════════════════════ */}
        <View style={s.colNarrow}>
          <WidgetCard k={k} isDark={isDark} padded={false} style={s.panel}>
            <View style={s.panelPad}>
              <WidgetHeader
                Icon={ShoppingCart} eyebrow="Household" title="Grocery list"
                accent={k.sage} k={k} isDark={isDark}
                right={items.length > 0
                  ? <Chip label={`${items.length}`} accent={k.sage} isDark={isDark} k={k} />
                  : undefined}
              />

              {/* Add. Deliberately the first thing under the header: the
                  overwhelmingly common kitchen interaction is "we just ran
                  out of X", and it should be one tap plus typing, never a
                  navigation. */}
              <View style={s.addRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={submitItem}
                  onFocus={registerActivity}
                  placeholder="Add an item…"
                  placeholderTextColor={k.textFaint}
                  style={[s.addInput, { backgroundColor: k.well, borderColor: k.cardBorder, color: k.text }]}
                  returnKeyType="done"
                  editable={!!familyId}
                  accessibilityLabel="New grocery item"
                />
                <Pressable
                  onPress={submitItem}
                  disabled={!draft.trim() || adding || !familyId}
                  style={({ pressed }) => [
                    s.addBtn,
                    { backgroundColor: k.sage },
                    (pressed || !draft.trim() || adding) && { opacity: draft.trim() && !adding ? 0.75 : 0.4 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Add to grocery list"
                  accessibilityState={{ disabled: !draft.trim() || adding }}
                >
                  {adding
                    ? <ActivityIndicator size="small" color={k.onAccent} />
                    : <Plus size={22} color={k.onAccent} />}
                </Pressable>
              </View>
            </View>

            {items.length === 0 ? (
              <View style={s.panelPad}>
                <EmptyNote text="Nothing on the list. Add something above." k={k} />
              </View>
            ) : (
              <View style={[s.panelPad, { paddingTop: 0, gap: KIOSK_SPACE.xs }]}>
                {items.map(it => (
                  <GroceryRow
                    key={it.id}
                    name={it.name}
                    quantity={it.quantity}
                    category={it.category}
                    k={k}
                    isDark={isDark}
                    onBuy={() => buyItem(it.id, active.id)}
                  />
                ))}
              </View>
            )}
          </WidgetCard>
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * One checkable list row. Tapping it calls the real groceryStore.buyItem,
 * which writes `is_bought` to Postgres — the item then disappears from
 * every device via the store's own realtime subscription, including the
 * phone of whoever is standing in the aisle. The mockup's checkbox was a
 * plain unbacked <input>.
 */
function GroceryRow({ name, quantity, category, k, isDark, onBuy }: {
  name: string; quantity?: string; category?: string;
  k: KioskColors; isDark: boolean; onBuy: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      onPress={async () => { if (busy) return; setBusy(true); await onBuy(); setBusy(false); }}
      style={({ pressed }) => [
        s.groceryRow,
        { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
        busy && { opacity: 0.5 },
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: false, disabled: busy }}
      accessibilityLabel={quantity ? `${name}, ${quantity}` : name}
      accessibilityHint="Mark as bought and remove from the list"
    >
      <View style={[s.checkbox, { borderColor: k.sage }]}>
        {busy ? <Check size={16} color={k.sage} /> : <Circle size={0} color="transparent" />}
      </View>
      <Text style={[s.groceryName, { color: k.text }]} numberOfLines={2}>{name}</Text>
      {!!quantity && (
        <Text style={[s.groceryQty, { color: k.textMuted }]} numberOfLines={1}>{quantity}</Text>
      )}
      {!!category && <Chip label={category} accent={k.gold} isDark={isDark} k={k} />}
    </Pressable>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const chefName = (id: string | null | undefined, members: FamilyMember[]) => {
  const n = members.find(m => m.id === id)?.name?.trim().split(' ')[0];
  return n ? `Chef: ${n}` : null;
};

const s = StyleSheet.create({
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  // Two columns on a wide screen, stacked on a narrow/portrait one — by
  // flexWrap + flexBasis rather than a measured breakpoint, so it reflows
  // by construction (the same principle the prior pass applied to the Hub
  // grid after its clipping bug).
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  colWide: { flexGrow: 2, flexBasis: 440, minWidth: 0 },
  colNarrow: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
  panel: { overflow: 'hidden' },
  panelPad: { padding: KIOSK_SPACE.md },

  dayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.md },
  dayLabelCol: { width: 74 },
  dayLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 1, paddingTop: 3 },
  mealLine: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.sm },
  mealEmoji: { fontSize: 24 },
  mealTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  mealMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.xs },
  addInput: {
    flex: 1, minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, fontSize: KIOSK_TYPO.body, fontWeight: '600',
  },
  addBtn: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },

  groceryRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  groceryName: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  groceryQty: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
});
