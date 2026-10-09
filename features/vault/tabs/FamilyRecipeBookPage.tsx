/**
 * FamilyRecipeBookPage — "Family recipe book" full-page screen.
 * Shows family_meals that have recorded ingredients / steps / recipe_text.
 * Each recipe card has:
 *   - Tap → RecipeModal (detail, add to grocery, share)
 *   - "Add to week" → inline day + meal-type picker → saves to family_meals
 * Parents can also record new recipes (+ button, opens MealFormSheet).
 * "Refine with AI" tip card explains how AI refinement works from RecipeModal.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  TextInput, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, Plus, Sparkles, ChefHat, Search, Check, Trash2, Mic, Wand2 } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { supabase } from '@/lib/supabase';
import type { Meal } from './meals/types';
import { DAYS, weekOf } from './meals/types';
import RecipeModal from './meals/RecipeModal';
import FullPageOverlay from '@/components/FullPageOverlay';
import { useGroceryStore } from '@/store/groceryStore';
import { showToast } from '@/components/AppToast';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const DAY_FULL: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

export default function FamilyRecipeBookPage({ onClose }: { onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const familyId   = (members[0] as any)?.familyId as string | undefined;
  const isParent   = (activeMember as any)?.role === 'parent';
  const P = colors.primary;

  const [recipes, setRecipes]         = useState<Meal[]>([]);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');
  const [activeRecipe, setActiveRecipe] = useState<Meal | null>(null);

  // Add recipe form state
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [newTitle, setNewTitle]           = useState('');
  const [newEmoji, setNewEmoji]           = useState('');
  const [newIngredients, setNewIngredients] = useState<string[]>(['']);
  const [newSteps, setNewSteps]           = useState<string[]>(['']);
  const [newPrepMins, setNewPrepMins]     = useState('');
  const [newTags, setNewTags]             = useState('');
  const [savingRecipe, setSavingRecipe]   = useState(false);

  const resetAddRecipeForm = () => {
    setNewTitle(''); setNewEmoji(''); setNewIngredients(['']);
    setNewSteps(['']); setNewPrepMins(''); setNewTags('');
  };

  const saveNewRecipe = async () => {
    if (!newTitle.trim() || !familyId) return;
    setSavingRecipe(true);
    try {
      const ingredients = newIngredients.map(s => s.trim()).filter(Boolean);
      const prepSteps   = newSteps.map(s => s.trim()).filter(Boolean);
      const dietaryTags = newTags.split(',').map(s => s.trim()).filter(Boolean);
      const id = `${familyId}-recipe-${Date.now()}`;
      const { data, error } = await supabase.from('family_meals').insert({
        id, family_id: familyId,
        week_of: weekOf(),
        day: 'Mon', type: 'dinner',
        title: newTitle.trim(),
        emoji: newEmoji.trim() || null,
        ingredients, prep_steps: prepSteps,
        dietary_tags: dietaryTags,
        prep_minutes: newPrepMins ? parseInt(newPrepMins, 10) : null,
        chef_id: activeMember?.id ?? null,
        ai_generated: false,
      }).select().single();
      if (!error && data) {
        setRecipes(prev => {
          const seen = new Set(prev.map(r => r.title.toLowerCase().trim()));
          const m = data as Meal;
          return seen.has(m.title.toLowerCase().trim()) ? prev : [m, ...prev];
        });
        showToast(`${newTitle.trim()} added to recipe book`);
        resetAddRecipeForm();
        setShowAddRecipe(false);
      } else {
        showToast('Could not save recipe — try again');
      }
    } catch {
      showToast('Could not save recipe — try again');
    } finally {
      setSavingRecipe(false);
    }
  };

  // "Add to week" picker state
  const [addTarget, setAddTarget]     = useState<Meal | null>(null);  // recipe being scheduled
  const [pickerDay, setPickerDay]     = useState<string>('Mon');
  const [pickerType, setPickerType]   = useState<string>('Dinner');
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!familyId) { setLoading(false); return; }
    supabase
      .from('family_meals')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const withRecipe = (data as Meal[]).filter(m =>
            (m.ingredients && m.ingredients.length > 0) ||
            (m.prep_steps && m.prep_steps.length > 0) ||
            !!(m as any).recipe_text
          );
          const seen = new Set<string>();
          setRecipes(withRecipe.filter(m => {
            const key = m.title.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key); return true;
          }));
        }
        setLoading(false);
      });
  }, [familyId]);

  const addGroceryItems = useCallback(async (names: string[], note?: string) => {
    const { addItem, items: existing } = useGroceryStore.getState();
    names.forEach(name => {
      const clean = name.trim();
      if (clean && !existing.some(e => e.name.toLowerCase() === clean.toLowerCase()))
        addItem({ name: clean, category: 'Other', notes: note, familyId: familyId ?? '', addedBy: activeMember?.id ?? '' });
    });
  }, []);

  // Save recipe to chosen day/type in the current week
  const addToWeek = async () => {
    if (!addTarget || !familyId) return;
    setSaving(true);
    try {
      const week = weekOf();
      const newId = `${familyId}-${week}-${pickerDay}-recipe-${Date.now()}`;
      await supabase.from('family_meals').insert({
        id: newId, family_id: familyId,
        week_of: week, day: pickerDay,
        title: addTarget.title, type: pickerType.toLowerCase(),
        emoji: addTarget.emoji ?? null,
        ingredients: addTarget.ingredients ?? [],
        prep_steps: addTarget.prep_steps ?? [],
        dietary_tags: addTarget.dietary_tags ?? [],
        prep_minutes: addTarget.prep_minutes ?? null,
        chef_id: null, ai_generated: false,
      });
      showToast(`${addTarget.title} added to ${DAY_FULL[pickerDay]} ${pickerType.toLowerCase()}`);
      setAddTarget(null);
    } catch {
      showToast('Could not add to week — try again');
    } finally {
      setSaving(false);
    }
  };

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardBg  = isDark ? colors.card : '#FFFFFF';
  const pillBg  = (active: boolean) =>
    active ? P : (isDark ? colors.surface : colors.surface);
  const pillText = (active: boolean) =>
    active ? '#FFFFFF' : colors.textSecondary;

  const filtered = query.trim()
    ? recipes.filter(r =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.ingredients?.some(i => i.toLowerCase().includes(query.toLowerCase()))
      )
    : recipes;

  const chefLabel = (meal: Meal) => {
    if (!meal.chef_id) return null;
    const name = members.find(m => m.id === meal.chef_id)?.name?.split(' ')[0];
    return name ? `${name}'s recipe` : null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>

      {/* ── ReviewInbox-style header ── */}
      <View style={{
        paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas, gap: 8,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
            FAMILY CUBE / {familyName.toUpperCase()}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
            {(activeMember as any)?.name} · {isParent ? 'Parent / Admin' : 'Member'}
          </Text>
        </View>

        <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Meals</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
            Family recipe book
          </Text>
          {isParent && (
            <Pressable
              onPress={() => { resetAddRecipeForm(); setShowAddRecipe(true); }}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight,
                alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
              <Plus size={20} color={P} strokeWidth={2.2} />
            </Pressable>
          )}
        </View>

        <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
          Recipes your family has made and loved. Add any recipe to this week's plan.
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 80 }}>

        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 }}>
          <Search size={16} color={colors.textTertiary} strokeWidth={2} />
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="Search recipes or ingredients…"
            placeholderTextColor={colors.textTertiary}
            style={{ flex: 1, fontSize: 15, color: colors.textPrimary }}
          />
        </View>

        {/* AI refine tip */}
        <View style={{ backgroundColor: colors.pinkLight, borderRadius: 16, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Sparkles size={20} color={colors.pink} strokeWidth={1.8} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
              Refine with Cube AI
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: 2 }}>
              Open any recipe and tap "Refine with AI" to improve steps, adjust servings, or add dietary notes.
            </Text>
          </View>
        </View>

        {/* Recipe list */}
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={P} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ backgroundColor: cardBg, borderRadius: 18, padding: 24,
            alignItems: 'center', gap: 12,
            ...Platform.select({ ios: { shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 } }) }}>
            <BookOpen size={36} color={colors.textTertiary} strokeWidth={1.4} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
              {query ? 'No recipes match that search' : 'No recipes yet'}
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              {query
                ? 'Try a different ingredient or meal name.'
                : 'Meals with ingredients and steps will appear here automatically. Plan a meal with steps to get started.'}
            </Text>
          </View>
        ) : (
          filtered.map(recipe => (
            <View key={recipe.id} style={{
              backgroundColor: cardBg, borderRadius: 18, overflow: 'hidden',
              ...Platform.select({
                ios: { shadowColor: colors.navy, shadowOpacity: isDark ? 0.14 : 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
                android: { elevation: 2 },
              }),
            }}>
              {/* Tap row → opens RecipeModal */}
              <Pressable
                onPress={() => setActiveRecipe(recipe)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  padding: 16, opacity: pressed ? 0.86 : 1,
                })}
              >
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.amberLight,
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {recipe.emoji
                    ? <Text style={{ fontSize: 28 }}>{recipe.emoji}</Text>
                    : <ChefHat size={26} color={colors.amber} strokeWidth={1.6} />}
                </View>

                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                    {recipe.title}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={1}>
                    {[
                      chefLabel(recipe),
                      recipe.prep_minutes ? `${recipe.prep_minutes} min` : null,
                      recipe.ingredients?.length ? `${recipe.ingredients.length} ingredients` : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  {(recipe.dietary_tags?.length ?? 0) > 0 && (
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                      {recipe.dietary_tags!.slice(0, 3).map(tag => (
                        <View key={tag} style={{ backgroundColor: colors.tealLight, borderRadius: 6,
                          paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <Text style={{ fontSize: 20, color: colors.textTertiary }}>›</Text>
              </Pressable>

              {/* "Add to week" CTA */}
              <Pressable
                onPress={() => { setAddTarget(recipe); setPickerDay('Mon'); setPickerType('Dinner'); }}
                style={({ pressed }) => ({
                  marginHorizontal: 16, marginBottom: 14,
                  borderRadius: 12, paddingVertical: 11, alignItems: 'center',
                  backgroundColor: pressed ? colors.tealLight : colors.tealLight,
                  borderWidth: 1, borderColor: colors.teal + '40',
                })}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}>
                  + Add to this week
                </Text>
              </Pressable>
            </View>
          ))
        )}

      </ScrollView>

      {/* ── Add new recipe — full-page overlay ── */}
      <FullPageOverlay visible={showAddRecipe} onDismiss={() => setShowAddRecipe(false)} zIndex={90}>
        <View style={{ flex: 1, backgroundColor: canvas }}>
          {/* Header */}
          <View style={{
            paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
            backgroundColor: canvas, gap: 8,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                FAMILY CUBE / {familyName.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
                {(activeMember as any)?.name}
              </Text>
            </View>
            <Pressable onPress={() => setShowAddRecipe(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Recipe book</Text>
            </Pressable>
            <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
              New recipe
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: insets.bottom + 110 }}
            keyboardShouldPersistTaps="handled">

            {/* Emoji + Title row */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.primary }}>
                RECIPE NAME
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TextInput
                  value={newEmoji} onChangeText={setNewEmoji}
                  placeholder="🍽️" placeholderTextColor={colors.textTertiary}
                  style={{ width: 52, height: 52, borderRadius: 14,
                    backgroundColor: colors.amberLight, textAlign: 'center', fontSize: 26 }}
                  maxLength={4}
                />
                <TextInput
                  value={newTitle} onChangeText={setNewTitle}
                  placeholder="e.g. Lemon chicken bowls"
                  placeholderTextColor={colors.textTertiary}
                  style={{ flex: 1, height: 52, borderRadius: 14,
                    backgroundColor: isDark ? colors.surface : colors.surface,
                    paddingHorizontal: 14, fontSize: 16, fontWeight: '600',
                    color: colors.textPrimary }}
                />
                {/* Mic button — voice input for title */}
                <Pressable
                  onPress={() => showToast('Voice input coming soon')}
                  style={{ width: 52, height: 52, borderRadius: 14,
                    backgroundColor: colors.pinkLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Mic size={22} color={colors.pink} strokeWidth={1.8} />
                </Pressable>
              </View>
            </View>

            {/* Prep time */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.teal }}>
                PREP TIME (MINUTES)
              </Text>
              <TextInput
                value={newPrepMins} onChangeText={setNewPrepMins}
                placeholder="e.g. 30"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={{ height: 48, borderRadius: 14,
                  backgroundColor: isDark ? colors.surface : colors.surface,
                  paddingHorizontal: 14, fontSize: 15, color: colors.textPrimary }}
              />
            </View>

            {/* Ingredients */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.amber }}>
                INGREDIENTS
              </Text>
              {newIngredients.map((val, idx) => (
                <View key={idx} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    value={val}
                    onChangeText={text => {
                      const next = [...newIngredients];
                      next[idx] = text;
                      setNewIngredients(next);
                    }}
                    placeholder={`Ingredient ${idx + 1}`}
                    placeholderTextColor={colors.textTertiary}
                    style={{ flex: 1, height: 44, borderRadius: 12,
                      backgroundColor: isDark ? colors.surface : colors.surface,
                      paddingHorizontal: 12, fontSize: 15, color: colors.textPrimary }}
                    onSubmitEditing={() => setNewIngredients(prev => [...prev, ''])}
                    returnKeyType="next"
                  />
                  {newIngredients.length > 1 && (
                    <Pressable onPress={() => setNewIngredients(prev => prev.filter((_, i) => i !== idx))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Trash2 size={16} color={colors.textTertiary} strokeWidth={1.8} />
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable onPress={() => setNewIngredients(prev => [...prev, ''])}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                <Plus size={15} color={colors.teal} strokeWidth={2.2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.teal }}>Add ingredient</Text>
              </Pressable>
            </View>

            {/* Steps */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.pink }}>
                STEPS
              </Text>
              {newSteps.map((val, idx) => (
                <View key={idx} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, marginTop: 9,
                    backgroundColor: colors.pinkLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.pink }}>{idx + 1}</Text>
                  </View>
                  <TextInput
                    value={val}
                    onChangeText={text => {
                      const next = [...newSteps];
                      next[idx] = text;
                      setNewSteps(next);
                    }}
                    placeholder={`Step ${idx + 1}…`}
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={{ flex: 1, minHeight: 44, borderRadius: 12,
                      backgroundColor: isDark ? colors.surface : colors.surface,
                      paddingHorizontal: 12, paddingVertical: 10,
                      fontSize: 15, color: colors.textPrimary }}
                  />
                  {newSteps.length > 1 && (
                    <Pressable onPress={() => setNewSteps(prev => prev.filter((_, i) => i !== idx))}
                      style={{ marginTop: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Trash2 size={16} color={colors.textTertiary} strokeWidth={1.8} />
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable onPress={() => setNewSteps(prev => [...prev, ''])}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                <Plus size={15} color={colors.pink} strokeWidth={2.2} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.pink }}>Add step</Text>
              </Pressable>
            </View>

            {/* Dietary tags */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.teal }}>
                DIETARY TAGS (OPTIONAL)
              </Text>
              <TextInput
                value={newTags} onChangeText={setNewTags}
                placeholder="e.g. gluten-free, kid-friendly, high-protein"
                placeholderTextColor={colors.textTertiary}
                style={{ height: 48, borderRadius: 14,
                  backgroundColor: isDark ? colors.surface : colors.surface,
                  paddingHorizontal: 14, fontSize: 15, color: colors.textPrimary }}
              />
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>Separate tags with commas</Text>
            </View>

            {/* Refine with AI card */}
            <Pressable
              onPress={() => showToast('AI recipe refinement coming soon')}
              style={{ backgroundColor: colors.pinkLight, borderRadius: 16, padding: 16,
                flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12,
                backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.6)',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Wand2 size={20} color={colors.pink} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                  Refine with Cube AI
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 }}>
                  Tap to let AI clean up your steps, suggest servings, and add dietary notes automatically.
                </Text>
              </View>
            </Pressable>

          </ScrollView>

          {/* Fixed footer */}
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingBottom: insets.bottom + 8, paddingTop: 12, paddingHorizontal: 20,
            backgroundColor: canvas, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
            gap: 10,
          }}>
            <Pressable
              onPress={saveNewRecipe}
              disabled={savingRecipe || !newTitle.trim()}
              style={({ pressed }) => ({
                borderRadius: 16, paddingVertical: 17, alignItems: 'center',
                backgroundColor: newTitle.trim() ? (pressed ? P + 'CC' : P) : colors.border,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              })}>
              {savingRecipe
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Check size={17} color="#fff" strokeWidth={2.5} />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Save to recipe book</Text>
                  </>}
            </Pressable>
            <Pressable onPress={() => setShowAddRecipe(false)} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: P }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </FullPageOverlay>

      {/* ── "Add to week" — full-page overlay (no bottom sheets) ── */}
      <FullPageOverlay visible={!!addTarget} onDismiss={() => setAddTarget(null)} zIndex={80}>
        <View style={{ flex: 1, backgroundColor: canvas }}>
          {/* Header */}
          <View style={{
            paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
            backgroundColor: canvas, gap: 8,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                FAMILY CUBE / {familyName.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
                {(activeMember as any)?.name}
              </Text>
            </View>
            <Pressable onPress={() => setAddTarget(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Recipe book</Text>
            </Pressable>
            <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
              Add to this week
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 100 }}>

            {/* Recipe preview */}
            {addTarget && (
              <View style={{ backgroundColor: colors.amberLight, borderRadius: 18, padding: 18,
                flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {addTarget.emoji
                  ? <Text style={{ fontSize: 32 }}>{addTarget.emoji}</Text>
                  : <ChefHat size={28} color={colors.amber} strokeWidth={1.6} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>
                    {addTarget.title}
                  </Text>
                  {addTarget.prep_minutes != null && (
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 3 }}>
                      {addTarget.prep_minutes} min prep · {addTarget.ingredients?.length ?? 0} ingredients
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Day picker */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.teal }}>
                WHICH DAY?
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DAYS.map(day => (
                  <Pressable key={day} onPress={() => setPickerDay(day)}
                    style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24,
                      backgroundColor: pillBg(pickerDay === day) }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: pillText(pickerDay === day) }}>
                      {DAY_FULL[day]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Meal type picker */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.amber }}>
                WHICH MEAL?
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MEAL_TYPES.map(type => (
                  <Pressable key={type} onPress={() => setPickerType(type)}
                    style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24,
                      backgroundColor: pillBg(pickerType === type) }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: pillText(pickerType === type) }}>
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Inline confirmation note */}
            <View style={{ backgroundColor: colors.tealLight, borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                This will add <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{addTarget?.title}</Text> to{' '}
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{DAY_FULL[pickerDay]} {pickerType.toLowerCase()}</Text> in the current week.
                Chef assignment can be set from the week plan.
              </Text>
            </View>

          </ScrollView>

          {/* Fixed footer */}
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingBottom: insets.bottom + 8, paddingTop: 12, paddingHorizontal: 20,
            backgroundColor: canvas, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
            gap: 10,
          }}>
            <Pressable onPress={addToWeek} disabled={saving}
              style={({ pressed }) => ({
                borderRadius: 16, paddingVertical: 17, alignItems: 'center',
                backgroundColor: pressed ? P + 'CC' : P,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              })}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Check size={17} color="#fff" strokeWidth={2.5} />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                      Add to {DAY_FULL[pickerDay]} {pickerType.toLowerCase()}
                    </Text>
                  </>}
            </Pressable>
            <Pressable onPress={() => setAddTarget(null)} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: P }}>Cancel · keep week unchanged</Text>
            </Pressable>
          </View>
        </View>
      </FullPageOverlay>

      {/* ── Recipe detail overlay ── */}
      <FullPageOverlay visible={!!activeRecipe} onDismiss={() => setActiveRecipe(null)} zIndex={70}>
        <RecipeModal
          meal={activeRecipe}
          visible={!!activeRecipe}
          onClose={() => setActiveRecipe(null)}
          onAddToGrocery={(names) => addGroceryItems(names, activeRecipe ? `From ${activeRecipe.title}` : undefined)}
          senderId={activeMember?.id ?? ''}
          hideAddToGrocery={!isParent}
          colors={colors} isDark={isDark}
        />
      </FullPageOverlay>

    </View>
  );
}
