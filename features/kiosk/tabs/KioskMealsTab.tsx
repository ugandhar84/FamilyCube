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
import { Plus, Check } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { useGroceryStore } from '@/store/groceryStore';
import { categorizeItem } from '@/features/vault/tabs/meals/types';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { WidgetCard, PanelHead, Well, Chip, TabTitle, EmptyNote } from '../components/KioskOS';
import { useKioskMeals, daysFromToday, todayMealDay } from '../useKioskMeals';
import { useKioskActivity } from '../KioskActivityContext';
import { KioskRecipeDrawer } from '../components/KioskRecipeDrawer';

export function KioskMealsTab({ active, members }: { active: FamilyMember; members: FamilyMember[] }) {
  const { k, isDark } = useKioskColors();
  const { meals, loading, week } = useKioskMeals();
  const { registerActivity } = useKioskActivity();
  // The full household grocery list is hidden from kids on kiosk
  // specifically (live-reported: "remove groceries for kids" — a kiosk-
  // only scope decision, the phone's own GroceryScreen still shows kids
  // the whole list with reduced permissions). A kid still sees and can
  // check off whatever THEY themselves added, per the follow-up ("his own
  // approved groceries can show") — there's no separate approval flag on
  // a grocery item (unlike quests/chores), so "his own" is simply
  // addedBy === this kid, same identity GroceryScreen's own kid-request
  // grouping already keys off.
  const isKid = active.role === 'kid';
  // Meal lines were read-only — tapping one now opens its full recipe in
  // the same side drawer the Overview hero's Breakfast/Lunch/Dinner cards
  // already use (KioskRecipeDrawer), so the two surfaces that both show a
  // meal behave identically rather than one being tappable and one not.
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);

  const items = useGroceryStore(s => s.items);
  const load = useGroceryStore(s => s.load);
  const addItem = useGroceryStore(s => s.addItem);
  const buyItem = useGroceryStore(s => s.buyItem);
  const runs = useGroceryStore(s => s.runs);

  const visibleItems = useMemo(
    () => isKid ? items.filter(it => it.addedBy === active.id) : items,
    [items, isKid, active.id],
  );

  // Same read-only mirror of the real phone's "Shopping now at {store}"
  // banner as Overview's Grocery card (features/grocery/GroceryScreen.tsx:
  // activeRuns = runs.filter(status === 'active')) — kiosk can't start or
  // open a run, so no tap target, just the status glance. Shown to
  // everyone, not just !isKid — a kid on kiosk can already see the whole
  // household list's status, this isn't the add/buy surface that's scoped.
  const activeRun = useMemo(() => runs.find(r => r.status === 'active'), [runs]);
  const activeRunShopper = useMemo(
    () => activeRun ? members.find(m => m.id === activeRun.shopperId)?.name?.trim().split(' ')[0] : undefined,
    [activeRun, members],
  );

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
    <>
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
          <WidgetCard k={k} isDark={isDark}>
            <PanelHead
              title="What we're eating"
              k={k}
              right={meals.length > 0
                ? <Text style={[s.panelCount, { color: k.textFaint }]}>{meals.length} planned</Text>
                : undefined}
            />

            {loading ? (
              <ActivityIndicator color={k.gold} style={{ marginVertical: KIOSK_SPACE.xl }} />
            ) : byDay.length === 0 ? (
              <EmptyNote
                text="No meals planned for this week yet. Plan the week from the Meals screen on a phone — the plan appears here automatically."
                k={k}
              />
            ) : (
              <View style={{ gap: KIOSK_SPACE.sm }}>
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
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {dayMeals.map((m, i) => (
                        <View key={m.id}>
                          {i > 0 && <View style={[s.mealDivider, { backgroundColor: k.cardBorder }]} />}
                          <Pressable
                            onPress={() => setOpenMeal(m)}
                            style={({ pressed }) => [s.mealLine, pressed && { opacity: 0.7 }]}
                            accessibilityRole="button"
                            accessibilityLabel={`${m.title} recipe`}
                            accessibilityHint="See ingredients and prep steps"
                          >
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
                          </Pressable>
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
          <WidgetCard k={k} isDark={isDark}>
            <PanelHead
              title={isKid ? 'My grocery items' : 'Grocery list'}
              k={k}
              right={visibleItems.length > 0
                ? <Text style={[s.panelCount, { color: k.textFaint }]}>{visibleItems.length}</Text>
                : undefined}
            />

            {activeRun && (
              <View style={[s.runBanner, { backgroundColor: k.sage + (isDark ? '26' : '1A'), borderColor: k.sage + '40' }]}>
                <View style={[s.runDot, { backgroundColor: k.sage }]} />
                <Text style={[s.runBannerText, { color: k.sage }]} numberOfLines={1}>
                  Shopping now at {activeRun.store}{activeRunShopper ? ` · ${activeRunShopper}` : ''}
                </Text>
              </View>
            )}

            {/* Add. Deliberately the first thing under the header: the
                overwhelmingly common kitchen interaction is "we just ran
                out of X", and it should be one tap plus typing, never a
                navigation. Hidden for kids — this box writes straight to
                groceryStore, bypassing the real kid→parent approval flow
                (kidRequestStore + KioskGroceryRequestSheet) a kid's
                request normally goes through; a kid asks via that flow
                instead, from the header's Ask Fam/Ask Parent affordance. */}
            {!isKid && (
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
            )}

            {visibleItems.length === 0 ? (
              <EmptyNote
                text={isKid
                  ? "None of your grocery requests have been approved yet."
                  : "Nothing on the list. Add something above."}
                k={k}
              />
            ) : (
              <View style={{ marginTop: KIOSK_SPACE.sm }}>
                {visibleItems.map((it, i) => (
                  <GroceryRow
                    key={it.id}
                    name={it.name}
                    quantity={it.quantity}
                    category={it.category}
                    k={k}
                    isDark={isDark}
                    divider={i > 0}
                    // Once approved, a kid's own request is read-only on
                    // kiosk — they can see it landed on the list, not check
                    // it off themselves.
                    onBuy={isKid ? undefined : () => buyItem(it.id, active.id)}
                  />
                ))}
              </View>
            )}
          </WidgetCard>
        </View>
      </View>
    </ScrollView>

    <KioskRecipeDrawer
      visible={!!openMeal}
      onClose={() => setOpenMeal(null)}
      meal={openMeal}
      members={members}
      k={k}
    />
    </>
  );
}

/**
 * One checkable list row. Tapping it calls the real groceryStore.buyItem,
 * which writes `is_bought` to Postgres — the item then disappears from
 * every device via the store's own realtime subscription, including the
 * phone of whoever is standing in the aisle. The mockup's checkbox was a
 * plain unbacked <input>.
 *
 * onBuy is optional: a kid's own already-approved request renders read-only
 * (no checkbox, no press) — they can see it made the list, not check it off
 * themselves.
 */
function GroceryRow({ name, quantity, category, k, isDark, divider, onBuy }: {
  name: string; quantity?: string; category?: string;
  k: KioskColors; isDark: boolean; divider?: boolean; onBuy?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const readOnly = !onBuy;
  return (
    <Pressable
      onPress={readOnly ? undefined : async () => { if (busy) return; setBusy(true); await onBuy(); setBusy(false); }}
      disabled={readOnly}
      style={({ pressed }) => [
        s.groceryRow,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder },
        pressed && !readOnly && { opacity: 0.7 },
        busy && { opacity: 0.5 },
      ]}
      accessibilityRole={readOnly ? undefined : 'checkbox'}
      accessibilityState={readOnly ? undefined : { checked: false, disabled: busy }}
      accessibilityLabel={quantity ? `${name}, ${quantity}` : name}
      accessibilityHint={readOnly ? undefined : 'Mark as bought and remove from the list'}
    >
      {!readOnly && (
        <View style={[s.checkbox, { borderColor: k.cardBorder }]}>
          {busy && <Check size={13} color={k.sage} />}
        </View>
      )}
      <Text style={[s.groceryName, { color: k.text }]} numberOfLines={1}>{name}</Text>
      {!!quantity && (
        <Text style={[s.groceryQty, { color: k.textFaint }]} numberOfLines={1}>{quantity}</Text>
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

  // Mock-exact .panel-head right-slot value: a small faint count, same
  // convention as Overview's own panelCount (approvals/sharing readouts).
  panelCount: { fontSize: 11 },

  // Mock-exact active-run banner, same shape/colors as Overview's Grocery
  // card so the two surfaces read as one feature, not two.
  runBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10,
  },
  runDot: { width: 8, height: 8, borderRadius: 4 },
  runBannerText: { flex: 1, fontSize: 12, fontWeight: '700' },

  dayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.md },
  dayLabelCol: { width: 74 },
  // Mock-exact .panel-title convention (uppercase, wide tracking, faint)
  // applied to a day label rather than a section title — the same visual
  // grammar, a different piece of text.
  dayLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, paddingTop: 3 },
  mealLine: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs },
  mealDivider: { height: StyleSheet.hairlineWidth },
  mealEmoji: { fontSize: 24 },
  // Mock-exact .jar-name/.jar-meta convention (13.5/700 primary line,
  // 11.5 meta) — the same pairing Overview's Coin Jars and Meals This
  // Week rows use for "a name/label plus a dim detail line."
  mealTitle: { fontSize: 13.5, fontWeight: '700' },
  mealMeta: { fontSize: 11.5, marginTop: 2 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.xs },
  addInput: {
    flex: 1, minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, fontSize: KIOSK_TYPO.body, fontWeight: '600',
  },
  addBtn: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },

  // Mock-exact .grocery-row convention: a plain unfilled checkbox square,
  // no card-shaped well around each row (Overview's own Grocery list rows
  // are the same flat hairline-divided rows, not individually boxed).
  groceryRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control, paddingVertical: KIOSK_SPACE.sm,
  },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  groceryName: { flex: 1, fontSize: 13, fontWeight: '600' },
  groceryQty: { fontSize: 11.5, fontWeight: '700' },
});
