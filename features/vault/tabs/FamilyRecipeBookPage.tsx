/**
 * FamilyRecipeBookPage — "Family recipe book" full-page screen.
 * Reads/writes from the dedicated `family_recipes` table (not family_meals).
 * "Add to week" copies the recipe row into family_meals for a chosen day.
 * The + button opens a full-page add-recipe form with mic + AI refine.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  TextInput, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, Plus, Sparkles, ChefHat, Search, Check, Trash2, Mic, Wand2, Camera, ImagePlus, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { supabase } from '@/lib/supabase';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useUIStore } from '@/store/uiStore';
import type { Meal } from './meals/types';
import { DAYS, weekOf } from './meals/types';
import RecipeModal from './meals/RecipeModal';

type FamilyRecipe = {
  id: string;
  family_id: string;
  title: string;
  emoji?: string | null;
  image_url?: string | null;
  ingredients: string[];
  prep_steps: string[];
  dietary_tags: string[];
  prep_minutes?: number | null;
  servings?: number | null;
  ai_refined?: boolean;
  created_by?: string | null;
  created_at?: string;
};
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

  const [recipes, setRecipes]         = useState<FamilyRecipe[]>([]);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');
  const [activeRecipe, setActiveRecipe] = useState<FamilyRecipe | null>(null);

  // Add recipe form state
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [newTitle, setNewTitle]           = useState('');
  const [newEmoji, setNewEmoji]           = useState('');
  const [newIngredients, setNewIngredients] = useState<string[]>(['']);
  // Steps as one big text block — user types/dictates; AI parses into array on refine
  const [newStepsText, setNewStepsText]   = useState('');
  const [newPrepMins, setNewPrepMins]     = useState('');
  const [newTags, setNewTags]             = useState('');
  const [newImageUrl, setNewImageUrl]     = useState<string | null>(null);
  const [savingRecipe, setSavingRecipe]   = useState(false);
  const [refining, setRefining]           = useState(false);
  const [aiTip, setAiTip]                = useState<string | null>(null);

  const resetAddRecipeForm = () => {
    setNewTitle(''); setNewEmoji(''); setNewIngredients(['']);
    setNewStepsText(''); setNewPrepMins(''); setNewTags('');
    setAiTip(null); setNewImageUrl(null);
  };

  const refineWithAi = async () => {
    if (!newTitle.trim() && !newStepsText.trim() && newIngredients.filter(Boolean).length === 0) {
      showToast('Add a title or some ingredients first');
      return;
    }
    setRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          action: 'refine_recipe',
          title: newTitle.trim(),
          ingredients: newIngredients.map(s => s.trim()).filter(Boolean),
          steps: newStepsText.split('\n').map(s => s.trim()).filter(Boolean),
          dietaryTags: newTags.split(',').map(s => s.trim()).filter(Boolean),
          prepMinutes: newPrepMins ? parseInt(newPrepMins, 10) : undefined,
          familyId: familyId ?? '',
        },
      });
      if (error) throw error;
      const r = (data as any)?.result ?? data;
      if (r?.title) setNewTitle(r.title);
      if (r?.emoji) setNewEmoji(r.emoji);
      if (r?.ingredients?.length) setNewIngredients(r.ingredients);
      if (r?.steps?.length) setNewStepsText(r.steps.join('\n'));
      if (r?.dietaryTags?.length) setNewTags(r.dietaryTags.join(', '));
      if (r?.prepMinutes) setNewPrepMins(String(r.prepMinutes));
      if (r?.tip) setAiTip(r.tip);
      if (r?.imageUrl) setNewImageUrl(r.imageUrl);
      showToast('Recipe refined by Cube AI ✨');
    } catch {
      showToast('AI refinement failed — try again');
    } finally {
      setRefining(false);
    }
  };

  const saveNewRecipe = async () => {
    if (!newTitle.trim() || !familyId) return;
    setSavingRecipe(true);
    try {
      const ingredients = newIngredients.map(s => s.trim()).filter(Boolean);
      const prepSteps   = newStepsText.split('\n').map(s => s.trim()).filter(Boolean);
      const dietaryTags = newTags.split(',').map(s => s.trim()).filter(Boolean);
      const id = `${familyId}-recipe-${Date.now()}`;
      const { data, error } = await supabase.from('family_recipes').insert({
        id, family_id: familyId,
        title: newTitle.trim(),
        emoji: newEmoji.trim() || null,
        image_url: newImageUrl ?? null,
        ingredients, prep_steps: prepSteps,
        dietary_tags: dietaryTags,
        prep_minutes: newPrepMins ? parseInt(newPrepMins, 10) : null,
        created_by: activeMember?.id ?? null,
        ai_refined: false,
      }).select().single();
      if (!error && data) {
        setRecipes(prev => [data as FamilyRecipe, ...prev]);
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
  const [addTarget, setAddTarget]     = useState<FamilyRecipe | null>(null);
  const [pickerDay, setPickerDay]     = useState<string>('Mon');
  const [pickerType, setPickerType]   = useState<string>('Dinner');
  const [saving, setSaving]           = useState(false);

  // Hide FAB + tab bar whenever any sub-overlay is open inside this page
  useEffect(() => {
    const anyOpen = showAddRecipe || !!addTarget || !!activeRecipe;
    if (anyOpen) {
      hideTabBar();
      useUIStore.getState().setFullBleedScreenActive(true);
    } else {
      showTabBar();
      useUIStore.getState().setFullBleedScreenActive(false);
    }
    return () => {
      showTabBar();
      useUIStore.getState().setFullBleedScreenActive(false);
    };
  }, [showAddRecipe, addTarget, activeRecipe]);

  useEffect(() => {
    if (!familyId) { setLoading(false); return; }
    supabase
      .from('family_recipes')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setRecipes(data as FamilyRecipe[]);
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
        chef_id: null,
        ai_generated: false,
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

  const chefLabel = (recipe: FamilyRecipe) => {
    if (!recipe.created_by) return null;
    const name = members.find(m => m.id === recipe.created_by)?.name?.split(' ')[0];
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

        {/* Add a recipe CTA card */}
        {isParent && (
          <Pressable
            onPress={() => { resetAddRecipeForm(); setShowAddRecipe(true); }}
            style={({ pressed }) => ({
              backgroundColor: colors.amberLight, borderRadius: 18, padding: 18,
              flexDirection: 'row', alignItems: 'center', gap: 14,
              opacity: pressed ? 0.85 : 1,
              borderWidth: 1.5, borderColor: colors.amber + '30',
            })}>
            <View style={{ width: 48, height: 48, borderRadius: 14,
              backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.7)',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Plus size={24} color={colors.amber} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                Add a family recipe
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 }}>
                Record ingredients and steps — Cube AI can clean it up and generate a photo.
              </Text>
            </View>
            <Text style={{ fontSize: 20, color: colors.amber }}>›</Text>
          </Pressable>
        )}

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
                onPress={() => setActiveRecipe(recipe as FamilyRecipe)}
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

          {/* ── Hero photo — full-bleed, Figma rhythm (no horizontal padding) ── */}
          {newImageUrl ? (
            <View style={{ position: 'relative' }}>
              <Image
                source={{ uri: newImageUrl }}
                style={{ width: '100%', height: 240 }}
                resizeMode="cover"
              />
              {/* Gradient-style overlay at bottom */}
              <View style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
                paddingHorizontal: 14, paddingBottom: 12,
              }}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.48)', borderRadius: 8,
                  paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>
                    AI-generated · review before sharing
                  </Text>
                </View>
                <Pressable
                  onPress={() => setNewImageUrl(null)}
                  style={{ backgroundColor: 'rgba(0,0,0,0.48)', borderRadius: 8,
                    paddingHorizontal: 8, paddingVertical: 4,
                    flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={11} color="#fff" strokeWidth={2.2} />
                  <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            /* Empty photo slot — browse or AI banner */
            <Pressable
              onPress={() => showToast('Photo library coming soon')}
              style={{
                height: 180, marginHorizontal: 20, borderRadius: 18, marginTop: 4,
                borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
                backgroundColor: isDark ? colors.surface : colors.surface,
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <Camera size={28} color={colors.textTertiary} strokeWidth={1.6} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>
                Add a photo
              </Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 28 }}>
                Browse your library, or refine with Cube AI below to auto-generate one.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: colors.primaryLight, borderRadius: 20,
                paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 }}>
                <ImagePlus size={15} color={P} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: P }}>Browse library</Text>
              </View>
            </Pressable>
          )}

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

            {/* Steps — one big text block, mic to dictate */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.pink }}>
                  HOW TO MAKE IT
                </Text>
                {/* Mic button — dictate the procedure */}
                <Pressable
                  onPress={() => showToast('Voice dictation coming soon')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: colors.pinkLight, borderRadius: 20,
                    paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Mic size={14} color={colors.pink} strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.pink }}>Dictate</Text>
                </Pressable>
              </View>
              <TextInput
                value={newStepsText}
                onChangeText={setNewStepsText}
                placeholder={"Describe how to make it — one step per line, or just write naturally.\n\nAI can help clean this up when you tap Refine."}
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
                style={{ minHeight: 140, borderRadius: 14,
                  backgroundColor: isDark ? colors.surface : colors.surface,
                  paddingHorizontal: 14, paddingVertical: 12,
                  fontSize: 15, color: colors.textPrimary, lineHeight: 22 }}
              />
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
              onPress={refineWithAi}
              disabled={refining}
              style={({ pressed }) => ({
                backgroundColor: colors.pinkLight, borderRadius: 16, padding: 16,
                flexDirection: 'row', alignItems: 'center', gap: 14,
                opacity: pressed ? 0.82 : 1,
              })}>
              <View style={{ width: 40, height: 40, borderRadius: 12,
                backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.6)',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {refining
                  ? <ActivityIndicator size="small" color={colors.pink} />
                  : <Wand2 size={20} color={colors.pink} strokeWidth={1.8} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                  {refining ? 'Cube AI is refining…' : 'Refine with Cube AI'}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 }}>
                  {refining
                    ? 'Cleaning up steps, quantities, and tags…'
                    : 'Tap to let AI clean up your steps, suggest quantities, emoji, and dietary notes.'}
                </Text>
              </View>
            </Pressable>

            {/* AI tip — appears after refinement */}
            {aiTip ? (
              <View style={{ backgroundColor: colors.tealLight, borderRadius: 14, padding: 14,
                flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Sparkles size={16} color={colors.teal} strokeWidth={1.8} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                  {aiTip}
                </Text>
              </View>
            ) : null}

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
          meal={activeRecipe ? {
            id: activeRecipe.id,
            family_id: activeRecipe.family_id,
            week_of: '', day: 'Mon', type: 'dinner',
            title: activeRecipe.title,
            emoji: activeRecipe.emoji ?? undefined,
            ingredients: activeRecipe.ingredients,
            prep_steps: activeRecipe.prep_steps,
            dietary_tags: activeRecipe.dietary_tags,
            prep_minutes: activeRecipe.prep_minutes ?? undefined,
            chef_id: activeRecipe.created_by ?? undefined,
            ai_generated: false,
            start_time: undefined,
          } as Meal : null}
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
