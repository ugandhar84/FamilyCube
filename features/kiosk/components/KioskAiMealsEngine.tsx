/**
 * KioskAiMealsEngine — the Cube meal planner on the kiosk, matching the phone's
 * AI planner end to end:
 *   · Generate (family-ai `meal_plan`): 3 options for each day, from the family's
 *     preferences. The last suggestions are cached for the family in
 *     `family_ai_meal_cache` (DB first, AsyncStorage as the offline fallback), so
 *     opening the planner again shows what was generated, not a blank page.
 *   · Pick any options. Each picked option is scheduled on any day this week (a past
 *     day rolls to the same day next week, as on the phone) and given a meal type
 *     (breakfast, lunch, dinner, snack). A type already used by another pick on the
 *     same day is disabled, so a day can hold up to three or four meals.
 *   · Save a suggestion to the family recipe book, or open its recipe inline.
 *   · Confirm replaces this week's earlier AI meals with the picks (same as the
 *     phone), writes them to family_meals with the chosen date and type, and clears
 *     the cache.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Sparkles, Check, ShoppingCart, BookMarked, ChevronDown, ChevronUp } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { localDateStr } from '@/lib/dates';
import { AiDayOptions, AiMealResult, Meal, detectDays, weekOf } from '@/features/vault/tabs/meals/types';
import type { FamilyMember } from '@/store/familyStore';
import { useGroceryStore } from '@/store/groceryStore';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const TYPE_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PREFS = ['Kid-friendly', 'High-protein', '30 min max', 'Vegetarian nights', 'Use leftovers', 'Budget friendly'];

function dayDate(day: string, weekOffset = 0): Date {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
  const d = new Date(monday);
  d.setDate(monday.getDate() + Math.max(0, DAYS_ORDER.indexOf(day)));
  return d;
}
function dayInfo(day: string, weekOffset = 0) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = dayDate(day, weekOffset);
  return { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isPast: d < today };
}
const MealTypesIdx = (t: string) => MEAL_TYPES.indexOf(t as MealType);
const defaultDay = (aiDay: string) => (dayInfo(aiDay).isPast ? `next-${aiDay}` : aiDay);
const resolveDay = (key: string) => (key.startsWith('next-') ? { day: key.slice(5), offset: 1 } : { day: key, offset: 0 });

export function KioskAiMealsEngine({ familyId, members, existingMeals, onPlanSaved }: {
  familyId: string;
  members: FamilyMember[];
  /** This week's and next week's meals, to show what a day already has. */
  existingMeals: Meal[];
  onPlanSaved?: () => void;
}) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const curWeek = weekOf();
  const localKey = `cubeai_meal_suggestions_${familyId}_${curWeek}`;

  const [aiPref, setAiPref] = useState('Kid-friendly, high-protein, 30 min max');
  const [aiLoading, setAiLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [groceryList, setGroceryList] = useState<string[]>([]);
  const [tip, setTip] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [options, setOptions] = useState<AiDayOptions[] | null>(null);
  const [selected, setSelected] = useState<Record<string, number[]>>({});
  const [dayOverrides, setDayOverrides] = useState<Record<string, string>>({});
  const [mealTypes, setMealTypes] = useState<Record<string, MealType>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [savedToBook, setSavedToBook] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const adopt = (opts: AiDayOptions[]) => {
    setOptions(opts);
    setSelected({});
    setMealTypes({});
    const d: Record<string, string> = {};
    opts.forEach(day => day.options.forEach((_, i) => { d[`${day.day}-${i}`] = defaultDay(day.day); }));
    setDayOverrides(d);
  };

  // Last saved suggestions: the family's DB cache first, then this device's.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('family_ai_meal_cache').select('suggestions, tip, grocery_list, preferences, generated_at')
          .eq('family_id', familyId).eq('week_of', curWeek).maybeSingle();
        if (alive && !error && data?.suggestions?.length) {
          adopt(data.suggestions as AiDayOptions[]);
          setGroceryList((data.grocery_list as string[]) ?? []); setTip(data.tip ?? null);
          if (data.preferences) setAiPref(data.preferences);
          setGeneratedAt(data.generated_at ?? null);
          setCacheLoading(false);
          return;
        }
        const raw = await AsyncStorage.getItem(localKey);
        if (alive && raw) {
          const c = JSON.parse(raw);
          if (c?.suggestions?.length) {
            adopt(c.suggestions); setGroceryList(c.groceryList ?? []); setTip(c.tip ?? null);
            if (c.preferences) setAiPref(c.preferences);
          }
        }
      } catch { /* no cache */ }
      if (alive) setCacheLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  const generate = async () => {
    setAiLoading(true); setAiError(null);
    try {
      const localeRegion = Intl.DateTimeFormat().resolvedOptions().locale?.split('-').pop()?.toUpperCase() ?? 'US';
      const { data, error } = await supabase.functions.invoke('family-ai', { body: {
        action: 'meal_plan',
        preferences: aiPref.trim() || 'Kid-friendly, balanced, under 35 min prep',
        dayNames: detectDays(aiPref),
        members: members.map(m => ({ name: (m as any).name, role: (m as any).role })),
        useMetric: !['US', 'LR', 'MM'].includes(localeRegion), region: localeRegion,
      } });
      if (error) throw new Error(error.message);
      const result: AiMealResult = data?.result ?? data;
      if (!result?.weeklyOptions?.length) throw new Error('No options returned');
      adopt(result.weeklyOptions);
      setGroceryList(result.groceryAutoList ?? []); setTip(result.nutritionCoachingTip ?? null);
      const now = new Date().toISOString(); setGeneratedAt(now);
      AsyncStorage.setItem(localKey, JSON.stringify({ suggestions: result.weeklyOptions, tip: result.nutritionCoachingTip ?? null, groceryList: result.groceryAutoList ?? [], preferences: aiPref.trim() })).catch(() => {});
      supabase.from('family_ai_meal_cache').upsert({
        family_id: familyId, week_of: curWeek, suggestions: result.weeklyOptions, tip: result.nutritionCoachingTip ?? null,
        grocery_list: result.groceryAutoList ?? [], preferences: aiPref.trim(), generated_at: now,
      }, { onConflict: 'family_id,week_of' }).then(() => {});
    } catch { setAiError('Couldn\'t generate a plan. Check the connection and try again.'); }
    setAiLoading(false);
  };

  const typeOf = (rowKey: string): MealType => mealTypes[rowKey] ?? 'dinner';
  const isPicked = (day: string, i: number) => (selected[day] ?? []).includes(i);
  const assignedOf = (day: string, i: number) => dayOverrides[`${day}-${i}`] ?? defaultDay(day);
  const all = useMemo(() => (options ?? []).flatMap(d => d.options.map((o, i) => ({ ...o, day: d.day, i }))), [options]);
  /** Types already used by another picked option on this assigned day. */
  const takenOn = (assigned: string, exceptKey: string) => {
    const set = new Set<string>(all.filter(s => `${s.day}-${s.i}` !== exceptKey && isPicked(s.day, s.i) && assignedOf(s.day, s.i) === assigned).map(s => typeOf(`${s.day}-${s.i}`)));
    // Also what the week already has on that day (this week's earlier AI meals are replaced on confirm, so they don't count).
    const { day, offset } = resolveDay(assigned);
    const wk = localDateStr(dayDate('Mon', offset));
    existingMeals.filter(m => m.week_of === wk && m.day === day && !(m.ai_generated && wk === curWeek)).forEach(m => set.add((m.type ?? '').toLowerCase()));
    return set;
  };
  const picked = Object.values(selected).reduce((n, a) => n + a.length, 0);

  /** Live view of the two weeks as they will look after Confirm: what is planned now plus every pick. */
  const preview = useMemo(() => {
    const todayStr = localDateStr(new Date());
    return [0, 1].flatMap(offset => DAYS_ORDER.map((dn, i) => {
      const date = dayDate(dn, offset);
      const wk = localDateStr(dayDate('Mon', offset));
      const have = existingMeals.filter(m => m.week_of === wk && m.day === dn && !(m.ai_generated && wk === curWeek))
        .map(m => ({ title: m.title, type: (m.type ?? 'dinner').toLowerCase(), emoji: m.emoji ?? '🍽️', mine: false }));
      const mine = all.filter(s => isPicked(s.day, s.i)).filter(s => {
        const r = resolveDay(assignedOf(s.day, s.i));
        return r.day === dn && r.offset === offset;
      }).map(s => ({ title: s.mealName, type: typeOf(`${s.day}-${s.i}`), emoji: s.emoji ?? '🍽️', mine: true }));
      const list = [...have, ...mine].sort((a, b) => MEAL_TYPES.indexOf(a.type as MealType) - MealTypesIdx(b.type));
      return { key: `${offset}-${dn}`, dn, date, today: localDateStr(date) === todayStr, list };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, selected, dayOverrides, mealTypes, existingMeals]);

  const toggle = (day: string, i: number) => {
    const rowKey = `${day}-${i}`;
    setSelected(p => {
      const cur = p[day] ?? [];
      return { ...p, [day]: cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort() };
    });
    // Move to a free type when the default is already taken that day.
    const taken = takenOn(assignedOf(day, i), rowKey);
    if (taken.has(typeOf(rowKey))) setMealTypes(p => ({ ...p, [rowKey]: MEAL_TYPES.find(t => !taken.has(t)) ?? 'dinner' }));
  };
  const setDay = (day: string, i: number, newDay: string) => {
    const rowKey = `${day}-${i}`;
    setDayOverrides(p => ({ ...p, [rowKey]: newDay }));
    const taken = takenOn(newDay, rowKey);
    if (taken.has(typeOf(rowKey))) setMealTypes(p => ({ ...p, [rowKey]: MEAL_TYPES.find(t => !taken.has(t)) ?? 'dinner' }));
  };

  const saveToBook = async (o: typeof all[number]) => {
    const rowKey = `${o.day}-${o.i}`;
    const { error } = await supabase.from('family_recipes').insert({
      id: `recipe-ai-${familyId}-${Date.now()}-${o.i}`, family_id: familyId, title: o.mealName, emoji: o.emoji ?? null,
      ingredients: o.ingredientsList ?? [], prep_steps: o.prepSteps ?? [], dietary_tags: o.dietaryTags ?? [], prep_minutes: o.prepMinutes ?? null,
      ai_refined: true, created_by: members[0]?.id ?? '',
    });
    if (error) { showToast(`Could not save: ${error.message}`); return; }
    setSavedToBook(p => new Set([...p, rowKey])); showToast(`"${o.mealName}" saved to the recipe book`);
  };

  const confirm = async () => {
    if (!options || picked === 0 || saving) return;
    setSaving(true);
    const rows = all.filter(s => isPicked(s.day, s.i)).map((s, n) => {
      const key = `${s.day}-${s.i}`;
      const { day, offset } = resolveDay(assignedOf(s.day, s.i));
      const monday = dayDate('Mon', offset);
      const wk = localDateStr(monday);
      return {
        id: `${familyId}-${wk}-${day}-${n}-${Date.now()}`, family_id: familyId, week_of: wk, day,
        title: s.mealName, type: typeOf(key), chef_id: null, ingredients: s.ingredientsList, emoji: s.emoji ?? null,
        prep_minutes: s.prepMinutes, dietary_tags: s.dietaryTags, kid_friendly_rating: s.kidFriendlyRating, prep_steps: s.prepSteps ?? [], ai_generated: true,
      };
    });
    try {
      await supabase.from('family_meals').delete().eq('family_id', familyId).eq('week_of', curWeek).eq('ai_generated', true);
      const { data: inserted, error } = await supabase.from('family_meals').insert(rows).select();
      if (error) throw new Error(error.message);
      AsyncStorage.removeItem(localKey).catch(() => {});
      supabase.from('family_ai_meal_cache').delete().eq('family_id', familyId).eq('week_of', curWeek).then(() => {});
      showToast(`${inserted?.length ?? 0} meal${(inserted?.length ?? 0) === 1 ? '' : 's'} added to your week`);
      setOptions(null); setSelected({}); setGeneratedAt(null);
      onPlanSaved?.();
    } catch (e: any) { Alert.alert('Save failed', e?.message ?? 'Something went wrong.'); }
    setSaving(false);
  };

  const addListToGrocery = () => {
    const { addItem, items } = useGroceryStore.getState();
    let n = 0;
    groceryList.forEach(name => {
      if (!items.some(e => !e.isBought && e.name.toLowerCase() === name.toLowerCase())) { addItem({ name, category: 'Other', notes: 'Cube weekly plan', familyId, addedBy: members[0]?.id ?? '', aiGenerated: true }); n++; }
    });
    showToast(n ? `${n} ingredients added to the list` : 'Everything is already on the list');
  };
  const togglePref = (p: string) => setAiPref(cur => (cur.toLowerCase().includes(p.toLowerCase())
    ? cur.split(',').map(x => x.trim()).filter(x => x && x.toLowerCase() !== p.toLowerCase()).join(', ')
    : [cur.trim(), p].filter(Boolean).join(', ')));
  const planned = (assigned: string) => {
    const { day, offset } = resolveDay(assigned);
    const wk = localDateStr(dayDate('Mon', offset));
    return existingMeals.filter(m => m.week_of === wk && m.day === day).length;
  };
  const when = generatedAt ? new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : null;

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[s.h1, { color: k.text }]}>AI planner</Text>
        <View style={[s.hero, { backgroundColor: k.pastelLav, borderColor: k.pastelLavCard }]}>
          <View style={[s.heroIc, { backgroundColor: k.pastelLavCard }]}><Sparkles size={30} color={k.purple} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.heroT, { color: k.text }]}>Plan the week with Cube</Text>
            <Text style={[s.sub, { color: k.textMuted }]}>Tell it what the family likes. Pick the meals you want, choose the day (this week or next) and the meal type for each, then Confirm plan.</Text>
          </View>
        </View>
        <View style={s.qa}>
          <TextInput value={aiPref} onChangeText={setAiPref} placeholder="e.g. Kid-friendly, high-protein, 30 min max…" placeholderTextColor={k.textFaint}
            style={[s.input, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder }]} accessibilityLabel="Preferences" />
          <Pressable onPress={generate} disabled={aiLoading} accessibilityRole="button" accessibilityLabel={options ? 'Regenerate' : 'Generate a plan'} style={[s.gen, { backgroundColor: k.primary }]}>
            {aiLoading ? <ActivityIndicator size="small" color={k.onPrimary} /> : <Sparkles size={18} color={k.onPrimary} />}
            <Text style={[s.genT, { color: k.onPrimary }]}>{aiLoading ? 'Thinking…' : options ? 'Regenerate' : 'Generate'}</Text>
          </Pressable>
        </View>
        <View style={s.chips}>
          {PREFS.map((p, i) => {
            const on = aiPref.toLowerCase().includes(p.toLowerCase());
            return (
              <Pressable key={p} onPress={() => togglePref(p)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, { backgroundColor: on ? k.primary : pastels[i % 4].card }]}>
                <Text style={[s.chipT, { color: on ? k.onPrimary : pastels[i % 4].fg }]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>
        {!!aiError && <Text style={[s.sub, { color: k.danger }]}>{aiError}</Text>}
        {cacheLoading && <ActivityIndicator color={k.gold} />}
        {!!options && !!when && <Text style={[s.sub, { color: k.textFaint }]}>Last suggestions from {when}. They stay here until you confirm a plan or regenerate.</Text>}

        {!!options && (
          <View style={{ gap: 8 }}>
            <Text style={[s.eb, { color: k.purple }]}>YOUR WEEKS · UPDATES AS YOU PICK</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {preview.map(d => (
                <View key={d.key} style={[s.pvCol, { backgroundColor: d.today ? k.primarySoft : k.well }]}>
                  <Text style={[s.pvHead, { color: k.textFaint }]}>{d.dn.toUpperCase()} {d.date.getDate()}</Text>
                  {d.list.length === 0 ? <Text style={[s.pvEmpty, { color: k.textFaint }]}>Free</Text> : d.list.map((m, mi) => (
                    <View key={mi} style={[s.pvMeal, { backgroundColor: m.mine ? k.pastelLavCard : k.card, borderColor: m.mine ? k.primary : 'transparent' }]}>
                      <Text style={[s.pvType, { color: k.textFaint }]}>{m.type.toUpperCase()}{m.mine ? ' · NEW' : ''}</Text>
                      <Text style={[s.pvTitle, { color: k.text }]} numberOfLines={2}>{m.emoji} {m.title}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {options?.map((d, di) => (
          <View key={d.day} style={{ gap: 8 }}>
            <Text style={[s.eb, { color: k.purple }]}>{d.day.toUpperCase()} · {dayInfo(d.day, dayInfo(d.day).isPast ? 1 : 0).date.toUpperCase()}</Text>
            <View style={s.opts}>
              {d.options.map((o, oi) => {
                const rowKey = `${d.day}-${oi}`;
                const on = isPicked(d.day, oi);
                const tone = pastels[(di + oi) % 4];
                const assigned = assignedOf(d.day, oi);
                const taken = takenOn(assigned, rowKey);
                const isOpen = !!open[rowKey];
                return (
                  <View key={oi} style={[s.opt, { backgroundColor: tone.col, borderColor: on ? k.primary : tone.card }]}>
                    <Text style={{ fontSize: 40 }}>{o.emoji ?? '🍽️'}</Text>
                    <Text style={[s.optT, { color: k.text }]} numberOfLines={2}>{o.mealName}</Text>
                    <Text style={[s.sub, { color: k.textMuted }]}>{[o.prepMinutes ? `${o.prepMinutes} min` : '', o.kidFriendlyRating >= 4 ? 'Kid-friendly ⭐' : '', (o.dietaryTags ?? []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</Text>
                    <View style={s.rowBtns}>
                      <Pressable onPress={() => setOpen(p => ({ ...p, [rowKey]: !p[rowKey] }))} accessibilityRole="button" style={s.linkBtn}>
                        <Text style={[s.linkT, { color: k.sage }]}>Recipe</Text>{isOpen ? <ChevronUp size={14} color={k.sage} /> : <ChevronDown size={14} color={k.sage} />}
                      </Pressable>
                      <Pressable onPress={() => !savedToBook.has(rowKey) && saveToBook({ ...o, day: d.day, i: oi })} accessibilityRole="button" style={[s.savePill, { backgroundColor: savedToBook.has(rowKey) ? k.pastelSageCard : k.pastelAmberCard }]}>
                        <BookMarked size={12} color={savedToBook.has(rowKey) ? k.sage : k.gold} />
                        <Text style={[s.linkT, { color: savedToBook.has(rowKey) ? k.sage : k.gold }]}>{savedToBook.has(rowKey) ? 'Saved' : 'Save recipe'}</Text>
                      </Pressable>
                    </View>
                    {isOpen && (
                      <View style={[s.recipe, { backgroundColor: k.card }]}>
                        <Text style={[s.eb, { color: k.gold }]}>INGREDIENTS</Text>
                        {(o.ingredientsList ?? []).map((g, gi) => <Text key={gi} style={[s.sub, { color: k.text }]}>• {g}</Text>)}
                        <Text style={[s.eb, { color: k.purple, marginTop: 6 }]}>STEPS</Text>
                        {(o.prepSteps ?? []).map((st, si) => <Text key={si} style={[s.sub, { color: k.text }]}>{si + 1}. {st}</Text>)}
                      </View>
                    )}
                    <Pressable onPress={() => toggle(d.day, oi)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.pickBtn, { backgroundColor: on ? k.primary : k.well }]}>
                      {on && <Check size={18} color={k.onPrimary} strokeWidth={3} />}
                      <Text style={[s.genT, { color: on ? k.onPrimary : k.text }]}>{on ? 'Picked' : 'Pick'}</Text>
                    </Pressable>
                    {on && (
                      <View style={{ gap: 8 }}>
                        <Text style={[s.eb, { color: k.textFaint }]}>SCHEDULE FOR</Text>
                        <View style={s.chips}>
                          {DAYS_ORDER.map(dn => {
                            const thisW = dayInfo(dn, 0);
                            const key = thisW.isPast ? `next-${dn}` : dn;
                            const info = thisW.isPast ? dayInfo(dn, 1) : thisW;
                            const act = assigned === key;
                            return (
                              <Pressable key={key} onPress={() => setDay(d.day, oi, key)} accessibilityRole="button" accessibilityState={{ selected: act }} style={[s.dayPill, { backgroundColor: act ? k.primary : thisW.isPast ? k.well : k.pastelSage }]}>
                                <Text style={[s.dayT, { color: act ? k.onPrimary : thisW.isPast ? k.textMuted : k.sage }]}>{dn}</Text>
                                <Text style={[s.dayD, { color: act ? k.onPrimary : k.textFaint }]}>{info.date}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        {planned(assigned) > 0 && <Text style={[s.sub, { color: k.textFaint }]}>{planned(assigned)} meal{planned(assigned) === 1 ? '' : 's'} already planned that day.</Text>}
                        <Text style={[s.eb, { color: k.textFaint }]}>MEAL TYPE</Text>
                        <View style={s.chips}>
                          {MEAL_TYPES.map(t => {
                            const act = typeOf(rowKey) === t; const isTaken = taken.has(t);
                            return (
                              <Pressable key={t} disabled={isTaken} onPress={() => setMealTypes(p => ({ ...p, [rowKey]: t }))} accessibilityRole="button" accessibilityState={{ selected: act, disabled: isTaken }}
                                style={[s.chip, { backgroundColor: act ? k.primary : k.well, opacity: isTaken ? 0.35 : 1 }]}>
                                <Text style={[s.chipT, { color: act ? k.onPrimary : k.textMuted }]}>{TYPE_LABEL[t]}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        {!!options && !!tip && <View style={[s.hero, { backgroundColor: k.pastelAmber, borderColor: k.pastelAmberCard }]}><Text style={[s.sub, { color: k.text, flex: 1 }]}>💡 {tip}</Text></View>}
        {!!options && groceryList.length > 0 && (
          <Pressable onPress={addListToGrocery} accessibilityRole="button" style={[s.pickBtn, { backgroundColor: k.well, alignSelf: 'flex-start', paddingHorizontal: 18 }]}>
            <ShoppingCart size={18} color={k.text} /><Text style={[s.genT, { color: k.text }]}>Add the plan's ingredients to the list</Text>
          </Pressable>
        )}
      </ScrollView>
      {!!options && (
        <Pressable onPress={confirm} disabled={saving || picked === 0} accessibilityRole="button" accessibilityLabel="Confirm plan"
          style={[s.confirm, { backgroundColor: k.primary, opacity: saving || picked === 0 ? 0.5 : 1 }]}>
          {saving ? <ActivityIndicator color={k.onPrimary} /> : <Text style={[s.genT, { color: k.onPrimary }]}>Confirm plan ({picked})</Text>}
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: KIOSK_SPACE.xl, paddingBottom: 140, gap: KIOSK_SPACE.md },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, borderRadius: 26, borderWidth: 1.5, padding: 18 },
  heroIc: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  heroT: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 2 },
  sub: { fontSize: KIOSK_TYPO.label, fontWeight: '700', lineHeight: 19 },
  qa: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  gen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 20 },
  genT: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, borderRadius: 100, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chipT: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  eb: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1 },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, alignItems: 'flex-start' },
  opt: { flexGrow: 1, flexBasis: 260, maxWidth: '32.5%', borderRadius: 24, borderWidth: 2, padding: 14, gap: 8 },
  optT: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', lineHeight: 21 },
  rowBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  linkT: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  savePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6 },
  recipe: { borderRadius: 14, padding: 12, gap: 4 },
  pickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: KIOSK_RADIUS.md },
  dayPill: { minWidth: 58, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center' },
  dayT: { fontSize: 12, fontWeight: '800' },
  dayD: { fontSize: 10.5, fontWeight: '700' },
  pvCol: { width: 132, borderRadius: 18, padding: 8, gap: 6 },
  pvHead: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  pvEmpty: { fontSize: 12, fontWeight: '700', paddingVertical: 6 },
  pvMeal: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 6 },
  pvType: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  pvTitle: { fontSize: 12.5, fontWeight: '800' },
  confirm: { position: 'absolute', right: 22, bottom: 14, minHeight: 54, borderRadius: KIOSK_RADIUS.lg, paddingHorizontal: 26, alignItems: 'center', justifyContent: 'center' },
});
