import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Animated, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChefHat, Trash2, Check, X, RefreshCw, Send, MessageSquare,
  Timer, Star, Sparkles, BookOpen, ShoppingBag, ChevronDown, ChevronUp,
  Plus, Pencil,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useQuestStore } from '@/store/questStore';
import { SCard, CardHeader, AddBtn, EmptyState, BRAND } from './shared';
import { localDateStr } from '@/lib/dates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meal {
  id: string; day: string; title: string; type: string;
  ingredients: string[]; chef_id: string | null; week_of: string;
  emoji?: string | null; prep_minutes?: number | null; dietary_tags?: string[];
  kid_friendly_rating?: number | null; prep_steps?: string[];
  ai_generated?: boolean;
}

interface AiMealOption {
  mealName: string; emoji?: string; prepMinutes: number;
  dietaryTags: string[]; kidFriendlyRating: number; ingredientsList: string[];
  prepSteps?: string[];
}

interface AiDayOptions {
  day: string;
  options: AiMealOption[];
}

interface AiMealResult {
  weeklyOptions: AiDayOptions[];
  groceryAutoList: string[];
  nutritionCoachingTip: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEAL_CACHE_KEY = 'cubeai_meal_plan_cache_v2';
const CACHE_TTL_MS   = 6 * 60 * 60 * 1000;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Parse which days the user is asking about from their prompt
function detectDays(prompt: string): string[] {
  const p = prompt.toLowerCase();
  const todayJs = new Date().getDay(); // 0=Sun
  const todayIdx = todayJs === 0 ? 6 : todayJs - 1; // Mon=0 … Sun=6

  if (/\btoday\b/.test(p))    return [DAYS[todayIdx]];
  if (/\btomorrow\b/.test(p)) return [DAYS[(todayIdx + 1) % 7]];
  if (/\bweekend\b/.test(p))  return ['Sat', 'Sun'];
  if (/\bweekdays?\b/.test(p)) return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  const dayMap: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
    friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu',
    fri: 'Fri', sat: 'Sat', sun: 'Sun',
  };
  const mentioned = Object.entries(dayMap)
    .filter(([k]) => new RegExp(`\\b${k}\\b`).test(p))
    .map(([, v]) => v);
  const unique = [...new Set(mentioned)];
  if (unique.length) return unique;

  const nextMatch = p.match(/next\s+(\d+)\s+days?/);
  if (nextMatch) {
    const n = Math.min(parseInt(nextMatch[1]), 7);
    return Array.from({ length: n }, (_, i) => DAYS[(todayIdx + i) % 7]);
  }

  return DAYS; // default: full week
}
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const categorizeItem = (name: string): string => {
  const n = name.toLowerCase();
  if (/chicken|beef|turkey|pork|salmon|shrimp|lamb|tuna|meat|sausage/.test(n)) return 'Meat';
  if (/milk|cheese|cheddar|parmesan|yogurt|butter|cream|dairy/.test(n)) return 'Dairy';
  if (/potato|zucchini|broccoli|carrot|lettuce|tomato|onion|garlic|pepper|spinach|apple|banana|fruit|veggie/.test(n)) return 'Produce';
  return 'Pantry';
};

const weekOf = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1);
  return localDateStr(d);
};

// ─── Recipe Modal ─────────────────────────────────────────────────────────────

function RecipeModal({ meal, visible, onClose, onAddToGrocery, senderId, colors, isDark }: {
  meal: Meal | null; visible: boolean; onClose: () => void;
  onAddToGrocery: (items: string[]) => Promise<void>;
  senderId: string; colors: any; isDark: boolean;
}) {
  const [addingCart, setAddingCart] = useState(false);
  const [cartDone,   setCartDone]   = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) { setCartDone(false); }
  }, [visible]);

  if (!meal) return null;

  const steps = meal.prep_steps?.length ? meal.prep_steps : [
    `Gather all ingredients: ${meal.ingredients.slice(0, 3).join(', ')}${meal.ingredients.length > 3 ? ' and more' : ''}.`,
    `Prep and chop any vegetables. Season protein if applicable.`,
    `Cook for approximately ${Math.round((meal.prep_minutes ?? 30) * 0.6)} minutes.`,
    `Combine all components and cook ${Math.round((meal.prep_minutes ?? 30) * 0.3)} more minutes until done.`,
    `Plate and serve hot. Enjoy your ${meal.title}!`,
  ];

  const handleAddToCart = async () => {
    setAddingCart(true);
    await onAddToGrocery(meal.ingredients);
    setAddingCart(false);
    setCartDone(true);
    setTimeout(() => onClose(), 1200);
  };

  const shareRecipe = () => {
    const stars = '⭐'.repeat(meal.kid_friendly_rating ?? 3);
    const msg = `@all 🍽️ *${meal.title}* ${meal.emoji ?? ''}\n⏱ ${meal.prep_minutes ?? '?'} min · ${stars}\n\n*Ingredients:*\n${meal.ingredients.map(i => `• ${i}`).join('\n')}`;
    useChatStore.getState().sendMessage('all', senderId, msg);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[rm.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
        {/* Header */}
        <View style={[rm.header, { borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
            {meal.emoji ? <Text style={{ fontSize: 36, lineHeight: 44 }}>{meal.emoji}</Text> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary, lineHeight: 23 }} numberOfLines={3}>
                {meal.title}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.amber, marginTop: 3 }}>
                {meal.day} · {meal.prep_minutes ?? '?'} min prep
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4, marginLeft: 8 }}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
          {/* Tags */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(meal.kid_friendly_rating ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {Array.from({ length: meal.kid_friendly_rating! }).map((_, i) => (
                  <Star key={i} size={13} fill={BRAND.amber} color={BRAND.amber} />
                ))}
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber, marginLeft: 3 }}>Kid Approved</Text>
              </View>
            )}
            {(meal.dietary_tags ?? []).map(tag => (
              <View key={tag} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: BRAND.teal + '20' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.teal }}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Ingredients */}
          <View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginBottom: 8 }}>Ingredients</Text>
            <View style={{ gap: 6 }}>
              {meal.ingredients.map((ing, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.teal }} />
                  <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '600' }}>{ing}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Steps */}
          <View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginBottom: 8 }}>Step-by-Step</Text>
            <View style={{ gap: 10 }}>
              {steps.map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Footer buttons */}
        <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 16, right: 16, flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={handleAddToCart} disabled={addingCart || cartDone}
            style={[rm.fab, { backgroundColor: cartDone ? BRAND.emerald : BRAND.teal, flex: 1 }]}>
            {addingCart
              ? <ActivityIndicator size="small" color="#fff" />
              : cartDone
                ? <><Check size={15} color="#fff" /><Text style={rm.fabTxt}>Added to Grocery!</Text></>
                : <><ShoppingBag size={15} color="#fff" /><Text style={rm.fabTxt}>Add to Grocery</Text></>}
          </TouchableOpacity>
          <TouchableOpacity onPress={shareRecipe} style={[rm.fab, { backgroundColor: BRAND.purple, flex: 1 }]}>
            <Send size={15} color="#fff" />
            <Text style={rm.fabTxt}>Share Recipe</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Edit Meal Modal ──────────────────────────────────────────────────────────

const MEAL_EMOJIS = ['🍗','🥩','🐟','🍣','🍤','🥚','🧆','🌮','🌯','🥗','🍜','🍝','🍛','🍲','🥘','🫕','🥙','🍱','🥞','🫔','🧇','🍔','🍕','🥪','🧋','🥣','🍚','🍙','🍘','🥟'];
const DIETARY_OPTIONS = ['Vegetarian','Vegan','Gluten-Free','Dairy-Free','Nut-Free','High-Protein','Low-Carb','Kid-Friendly'];

function SectionLabel({ label, colors }: { label: string; colors: any }) {
  return <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textTertiary, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 4 }}>{label}</Text>;
}

function EditMealModal({ meal, visible, onClose, onSave, members, colors, isDark }: {
  meal: Meal | null; visible: boolean; onClose: () => void;
  onSave: (id: string, patch: Partial<Meal>) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
}) {
  const [title,       setTitle]       = useState('');
  const [emoji,       setEmoji]       = useState('🍽️');
  const [type,        setType]        = useState('dinner');
  const [chefId,      setChefId]      = useState('');
  const [prepMins,    setPrepMins]    = useState('');
  const [kidRating,   setKidRating]   = useState(3);
  const [dietTags,    setDietTags]    = useState<string[]>([]);
  const [ingredients, setIngredients] = useState('');
  const [prepSteps,   setPrepSteps]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [showEmoji,   setShowEmoji]   = useState(false);

  useEffect(() => {
    if (meal) {
      setTitle(meal.title ?? '');
      setEmoji(meal.emoji ?? '🍽️');
      setType(meal.type ?? 'dinner');
      setChefId(meal.chef_id ?? '');
      setPrepMins(meal.prep_minutes ? String(meal.prep_minutes) : '');
      setKidRating(meal.kid_friendly_rating ?? 3);
      setDietTags(meal.dietary_tags ?? []);
      setIngredients((meal.ingredients ?? []).join('\n'));
      setPrepSteps((meal.prep_steps ?? []).join('\n'));
    }
  }, [meal]);

  const toggleTag = (tag: string) =>
    setDietTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const handleSave = async () => {
    if (!meal || !title.trim()) return;
    setSaving(true);
    await onSave(meal.id, {
      title:               title.trim(),
      emoji,
      type,
      chef_id:             chefId || null,
      prep_minutes:        prepMins ? parseInt(prepMins) : null,
      kid_friendly_rating: kidRating,
      dietary_tags:        dietTags,
      ingredients:         ingredients.split('\n').map(s => s.trim()).filter(Boolean),
      prep_steps:          prepSteps.split('\n').map(s => s.trim()).filter(Boolean),
    });
    setSaving(false);
    onClose();
  };

  if (!meal) return null;

  const inp = {
    borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, fontWeight: '600' as const,
    marginBottom: 10, backgroundColor: isDark ? colors.surface : colors.background,
    borderColor: colors.border, color: colors.textPrimary,
  };
  const typeColor = MEAL_TYPE_COLOR[type] ?? BRAND.amber;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Dark backdrop */}
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

          {/* Bottom sheet */}
          <View style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28,
            paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%',
            backgroundColor: isDark ? colors.card : '#FAFAFA' }}>

            {/* Drag handle */}
            <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border,
              alignSelf: 'center', marginBottom: 14 }} />

            {/* ── Fixed header (does NOT scroll) ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity onPress={() => setShowEmoji(!showEmoji)}
                  style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: typeColor + '20',
                    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: typeColor + '40' }}>
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </TouchableOpacity>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>Edit Meal</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: typeColor, textTransform: 'capitalize', marginTop: 1 }}>
                    {type} · tap emoji to change
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Scrollable body ── */}
            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}>

              {/* Emoji picker drawer */}
              {showEmoji && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderRadius: 16,
                  backgroundColor: isDark ? colors.surface : '#F0EEFF',
                  borderWidth: 1, borderColor: BRAND.purple + '30', marginBottom: 12 }}>
                  {MEAL_EMOJIS.map(e => (
                    <TouchableOpacity key={e} onPress={() => { setEmoji(e); setShowEmoji(false); }}
                      style={{ width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: emoji === e ? BRAND.purple + '25' : 'transparent' }}>
                      <Text style={{ fontSize: 24 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Meal name */}
              <Text style={em.label}>Meal Name</Text>
              <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Salmon & Quinoa Bowl"
                placeholderTextColor={colors.textTertiary} style={[inp, { color: colors.textPrimary }]} />

              {/* Meal type */}
              <Text style={em.label}>Meal Type</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {MEAL_TYPES.map(t => {
                  const tc = MEAL_TYPE_COLOR[t.toLowerCase()] ?? BRAND.amber;
                  const sel = type === t.toLowerCase();
                  return (
                    <TouchableOpacity key={t} onPress={() => setType(t.toLowerCase())}
                      style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 9,
                        alignItems: 'center', gap: 2,
                        backgroundColor: sel ? tc + '18' : 'transparent',
                        borderColor: sel ? tc : colors.border }}>
                      <Text style={{ fontSize: 14 }}>
                        {t === 'Breakfast' ? '🌅' : t === 'Lunch' ? '☀️' : t === 'Dinner' ? '🌙' : '🍎'}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: sel ? tc : colors.textSecondary }}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Chef + prep time */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={em.label}>Who's Cooking</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => setChefId('')}
                        style={{ borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
                          backgroundColor: !chefId ? BRAND.teal + '20' : 'transparent',
                          borderColor: !chefId ? BRAND.teal : colors.border }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: !chefId ? BRAND.teal : colors.textSecondary }}>Anyone</Text>
                      </TouchableOpacity>
                      {members.map(m => {
                        const sel = chefId === m.id;
                        const initials = (m.name as string).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                        const hue = (m.name as string).charCodeAt(0) % 360;
                        const avatarBg = `hsl(${hue},60%,55%)`;
                        return (
                          <TouchableOpacity key={m.id} onPress={() => setChefId(m.id)}
                            style={{ alignItems: 'center', gap: 3 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18,
                              backgroundColor: avatarBg,
                              borderWidth: 2.5, borderColor: sel ? BRAND.teal : 'transparent',
                              alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>{initials}</Text>
                            </View>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: sel ? BRAND.teal : colors.textTertiary }}>
                              {(m.name as string).split(' ')[0]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={em.label}>Prep Time</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 9,
                    backgroundColor: isDark ? colors.surface : colors.background,
                    borderColor: colors.border, marginBottom: 10 }}>
                    <TextInput value={prepMins} onChangeText={setPrepMins} placeholder="30"
                      placeholderTextColor={colors.textTertiary} keyboardType="numeric"
                      style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary }} />
                    <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '700' }}>min</Text>
                  </View>
                </View>
              </View>

              {/* Dietary tags */}
              <Text style={em.label}>Dietary Tags</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                {DIETARY_OPTIONS.map(tag => {
                  const sel = dietTags.includes(tag);
                  return (
                    <TouchableOpacity key={tag} onPress={() => toggleTag(tag)}
                      style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5,
                        backgroundColor: sel ? BRAND.teal + '22' : 'transparent',
                        borderColor: sel ? BRAND.teal : colors.border }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: sel ? BRAND.teal : colors.textSecondary }}>{tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Ingredients */}
              <Text style={em.label}>Ingredients (one per line)</Text>
              <TextInput value={ingredients} onChangeText={setIngredients}
                placeholder={'chicken breast\nquinoa\nlemon\nolive oil'}
                placeholderTextColor={colors.textTertiary} multiline numberOfLines={4}
                style={[inp, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]} />

              {/* Prep steps */}
              <Text style={em.label}>Steps (one per line)</Text>
              <TextInput value={prepSteps} onChangeText={setPrepSteps}
                placeholder={'Season and marinate chicken\nCook quinoa 15 min\nGrill chicken 6 min each side'}
                placeholderTextColor={colors.textTertiary} multiline numberOfLines={5}
                style={[inp, { height: 120, textAlignVertical: 'top', paddingTop: 10 }]} />

            </ScrollView>

            {/* Footer */}
            <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 16,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity onPress={onClose}
                style={{ flex: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 14,
                  alignItems: 'center', borderColor: colors.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={{ flex: 2, borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: BRAND.purple, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save Changes</Text>}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Day Meal Card ────────────────────────────────────────────────────────────

const MEAL_TYPE_COLOR: Record<string, string> = {
  lunch:     BRAND.teal,
  dinner:    BRAND.purple,
  breakfast: BRAND.amber,
  snack:     BRAND.rose,
};

function DayCard({ day, meals, onRecipe, onEdit, onDelete, onAdd, colors, isDark }: {
  day: string; meals: Meal[];
  onRecipe: (m: Meal) => void; onEdit: (m: Meal) => void; onDelete?: (m: Meal) => void; onAdd: () => void;
  colors: any; isDark: boolean;
}) {
  const isToday = new Date().toLocaleDateString('en-US', { weekday: 'short' }) === day;
  const accentColor = isToday ? BRAND.purple : BRAND.amber;

  return (
    <View style={{
      marginTop: 8,
      borderRadius: 16,
      borderWidth: isToday ? 1.5 : StyleSheet.hairlineWidth,
      borderColor: isToday ? BRAND.purple + '60' : colors.border,
      backgroundColor: isToday ? (isDark ? BRAND.purple + '12' : '#FAF8FF') : colors.card,
      overflow: 'hidden',
    }}>
      {/* Day header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 9,
        borderBottomWidth: meals.length > 0 ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: accentColor, letterSpacing: 0.5 }}>{day}</Text>
          {isToday && (
            <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: BRAND.purple + '20' }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: BRAND.purple, letterSpacing: 0.5 }}>TODAY</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onAdd} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 2 }}>
          <Plus size={13} color={accentColor} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Meal rows */}
      {meals.length > 0 && (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          {meals.map((meal, idx) => {
            const typeColor = MEAL_TYPE_COLOR[meal.type?.toLowerCase()] ?? BRAND.amber;
            return (
              <View key={meal.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 8, paddingHorizontal: 10,
                borderRadius: 12,
                backgroundColor: isDark ? colors.surface + 'CC' : colors.background,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: typeColor + '30',
              }}>
                {/* Emoji bubble */}
                <View style={{
                  width: 44, height: 44, borderRadius: 12,
                  backgroundColor: typeColor + '18',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 24 }}>{meal.emoji ?? '🍽️'}</Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
                    {meal.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: typeColor + '22' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: typeColor, textTransform: 'capitalize' }}>
                        {meal.type}
                      </Text>
                    </View>
                    {meal.prep_minutes ? (
                      <Text style={{ fontSize: 10, color: colors.textTertiary }}>⏱ {meal.prep_minutes}m</Text>
                    ) : null}
                    {meal.ai_generated ? (
                      <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.purple }}>✨ AI</Text>
                    ) : null}
                  </View>
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  <TouchableOpacity onPress={() => onRecipe(meal)} style={dc.iconBtn}>
                    <BookOpen size={14} color={BRAND.purple} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onEdit(meal)} style={dc.iconBtn}>
                    <Pencil size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {onDelete && (
                    <TouchableOpacity onPress={() => onDelete(meal)} style={dc.iconBtn}>
                      <Trash2 size={14} color={BRAND.rose + 'AA'} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Main MealsTab ────────────────────────────────────────────────────────────

export default function MealsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId    = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isKid = (activeMember as any)?.role === 'child';
  const curWeek     = weekOf();
  const addQuest    = useQuestStore(s => s.addQuest);

  const [meals, setMeals]       = useState<Meal[]>([]);
  const [loading, setLoading]   = useState(true);

  // AI state
  const [aiOpen, setAiOpen]       = useState(true);
  const [aiPref, setAiPref]       = useState('Kid-friendly, high-protein, 30 min max');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState<string | null>(null);
  const [groceryList, setGroceryList]   = useState<string[]>([]);
  const [addedCart, setAddedCart]       = useState(false);
  const [tip, setTip]                   = useState<string | null>(null);
  // Selection phase: day → array of 3 options; user picks up to 2 per day
  const [pendingOptions, setPendingOptions] = useState<AiDayOptions[] | null>(null);
  const [selected, setSelected]             = useState<Record<string, number[]>>({}); // day → [indices]
  const [savingPlan, setSavingPlan]         = useState(false);

  // Modals
  const [activeRecipe, setActiveRecipe] = useState<Meal | null>(null);
  const [editMeal, setEditMeal]         = useState<Meal | null>(null);
  const [addDay, setAddDay]             = useState<string | null>(null);
  const [addTitle, setAddTitle]         = useState('');
  const [addType, setAddType]           = useState('dinner');
  const [addEmoji, setAddEmoji]         = useState('🍽️');
  const [addChefId, setAddChefId]       = useState('');
  const [addPrepMins, setAddPrepMins]   = useState('');
  const [addKidRating, setAddKidRating] = useState(3);
  const [addDietTags, setAddDietTags]   = useState<string[]>([]);
  const [addIngredients, setAddIngredients] = useState('');
  const [addPrepSteps, setAddPrepSteps]     = useState('');
  const [addShowEmoji, setAddShowEmoji]     = useState(false);

  // Pulse animation for the AI dot
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(pulseScale,   { toValue: 2.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0,   duration: 800, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(pulseScale,   { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
      ]),
      Animated.delay(400),
    ])).start();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('family_meals').select('*').eq('week_of', curWeek).order('day');
    if (data) setMeals(data as Meal[]);
    setLoading(false);
  }, [curWeek]);

  useEffect(() => { load(); }, [load]);

  // Restore cached grocery list
  useEffect(() => {
    AsyncStorage.getItem(MEAL_CACHE_KEY).then(raw => {
      if (!raw) return;
      try {
        const { groceryList: gl, tip: t, savedAt } = JSON.parse(raw);
        if (Date.now() - savedAt < CACHE_TTL_MS) {
          if (gl?.length) setGroceryList(gl);
          if (t) setTip(t);
        }
      } catch {}
    });
  }, []);

  const generateMealPlan = async () => {
    setAiLoading(true);
    setAiError(null);
    setAddedCart(false);
    setPendingOptions(null);
    setSelected({});
    try {
      const localeRegion = Intl.DateTimeFormat().resolvedOptions().locale?.split('-').pop()?.toUpperCase() ?? 'US';
      const useMetric = !['US', 'LR', 'MM'].includes(localeRegion);
      const dayNames = detectDays(aiPref);

      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          action: 'meal_plan',
          preferences: aiPref.trim() || 'Kid-friendly, balanced, under 35 min prep',
          dayNames,
          members: members.map(m => ({ name: (m as any).name, role: (m as any).role })),
          useMetric, region: localeRegion,
        },
      });
      if (error) throw new Error(error.message);
      const result: AiMealResult = data?.result ?? data;
      if (!result?.weeklyOptions?.length) throw new Error('No options returned');

      // Default: first option pre-selected for each day
      const defaults: Record<string, number[]> = {};
      result.weeklyOptions.forEach(d => { defaults[d.day] = [0]; });

      setPendingOptions(result.weeklyOptions);
      setSelected(defaults);
      setGroceryList(result.groceryAutoList ?? []);
      setTip(result.nutritionCoachingTip ?? null);
      setAiOpen(false);
    } catch {
      setAiError('Couldn\'t generate plan. Check connection and try again.');
    }
    setAiLoading(false);
  };

  const confirmPlan = async () => {
    if (!pendingOptions) return;
    setSavingPlan(true);
    const MEAL_TYPE_LABELS = ['lunch', 'dinner'];
    const upserts = pendingOptions.flatMap(dayOpt => {
      const indices = selected[dayOpt.day] ?? [0];
      return indices.map((idx, slot) => {
        const m = dayOpt.options[idx];
        return {
          id: `${familyId}-${curWeek}-${dayOpt.day}-${slot}-${Date.now()}`,
          family_id: familyId, week_of: curWeek,
          day: dayOpt.day,
          title: m.mealName,
          type: indices.length > 1 ? (MEAL_TYPE_LABELS[slot] ?? 'dinner') : 'dinner',
          chef_id: null,
          ingredients:         m.ingredientsList,
          emoji:               m.emoji ?? null,
          prep_minutes:        m.prepMinutes,
          dietary_tags:        m.dietaryTags,
          kid_friendly_rating: m.kidFriendlyRating,
          prep_steps:          m.prepSteps ?? [],
          ai_generated:        true,
        };
      });
    });

    try {
      await supabase.from('family_meals')
        .delete().eq('family_id', familyId).eq('week_of', curWeek).eq('ai_generated', true);

      const { data: inserted, error: insertErr } = await supabase
        .from('family_meals').insert(upserts).select();

      if (insertErr) throw new Error(insertErr.message);

      if (inserted && inserted.length > 0) {
        setMeals(prev => [...prev.filter(m => !m.ai_generated), ...(inserted as Meal[])]);
        setPendingOptions(null);
        setSelected({});
        Alert.alert('Plan Saved', `${inserted.length} meal${inserted.length > 1 ? 's' : ''} added to your week.`);
      } else {
        Alert.alert('Nothing Saved', 'No meals were inserted. Try selecting at least one meal per day.');
      }

      AsyncStorage.setItem(MEAL_CACHE_KEY, JSON.stringify({
        groceryList, tip, savedAt: Date.now(),
      }));
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Something went wrong saving your plan. Please try again.');
    } finally {
      setSavingPlan(false);
    }
  };

  const addGroceryItems = async (names: string[]) => {
    const { addItem, items: existing, familyId: sfId } = useGroceryStore.getState();
    const effectiveFamilyId = sfId ?? familyId;
    const existingNames = new Set(existing.map(i => i.name.toLowerCase().trim()));
    for (const name of names) {
      if (!existingNames.has(name.toLowerCase().trim())) {
        await addItem({ familyId: effectiveFamilyId, name, quantity: '1', category: categorizeItem(name), addedBy: activeMember?.id ?? '', aiGenerated: true });
      }
    }
  };

  const addAllToCart = async () => {
    if (!groceryList.length) return;
    await addGroceryItems(groceryList);
    setAddedCart(true);
  };

  const resetAddForm = () => {
    setAddDay(null); setAddTitle(''); setAddType('dinner'); setAddEmoji('🍽️');
    setAddChefId(''); setAddPrepMins(''); setAddKidRating(3);
    setAddDietTags([]); setAddIngredients(''); setAddPrepSteps(''); setAddShowEmoji(false);
  };

  // Create a cooking quest for the assigned chef
  const createCookingQuest = (mealTitle: string, chefId: string, day: string, prepMins?: number | null) => {
    const DAYS_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const todayIdx = new Date().getDay(); // 0=Sun
    const dayIdx = DAYS_ORDER.indexOf(day);
    // Calculate due date as the day in this week
    const daysUntil = ((dayIdx - (todayIdx === 0 ? 6 : todayIdx - 1) + 7) % 7);
    const due = new Date();
    due.setDate(due.getDate() + daysUntil);
    const dueDate = due.toISOString().split('T')[0];

    addQuest({
      title:            `🍳 Cook ${mealTitle}`,
      description:      `Prepare ${mealTitle} for the family on ${day}.`,
      category:         'Cooking',
      priority:         'medium',
      coins:            15,
      xpReward:         20,
      assignedToId:     chefId,
      assignedToIds:    [chefId],
      isPool:           false,
      isDaily:          false,
      recurrence:       'once',
      status:           'todo',
      dueDate,
      estimatedMinutes: prepMins ?? undefined,
      createdById:      activeMember?.id ?? '',
      photoRequired:    false,
      isAdultTask:      members.find(m => m.id === chefId)?.role === 'parent' || members.find(m => m.id === chefId)?.role === 'senior',
    });
  };

  const addManualMeal = async () => {
    if (!addDay || !addTitle.trim()) return;
    const chefId = addChefId || null;
    const prepMins = addPrepMins ? parseInt(addPrepMins) : null;
    const { data } = await supabase.from('family_meals').insert({
      id: `${familyId}-${curWeek}-${addDay}-manual-${Date.now()}`,
      family_id: familyId, week_of: curWeek,
      day: addDay, title: addTitle.trim(), type: addType,
      emoji: addEmoji,
      chef_id: chefId,
      prep_minutes: prepMins,
      dietary_tags: addDietTags,
      ingredients: addIngredients.split('\n').map(s => s.trim()).filter(Boolean),
      prep_steps: addPrepSteps.split('\n').map(s => s.trim()).filter(Boolean),
      ai_generated: false,
    }).select().single();
    if (data) setMeals(prev => [...prev, data as Meal]);
    if (chefId) createCookingQuest(addTitle.trim(), chefId, addDay, prepMins);
    resetAddForm();
  };

  const updateMeal = async (id: string, patch: Partial<Meal>) => {
    const prev = meals.find(m => m.id === id);
    await supabase.from('family_meals').update(patch).eq('id', id);
    setMeals(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    // Create quest if chef was newly assigned (or changed)
    if (patch.chef_id && patch.chef_id !== prev?.chef_id && prev) {
      const meal = { ...prev, ...patch };
      createCookingQuest(meal.title, patch.chef_id, meal.day, meal.prep_minutes);
    }
  };

  const deleteMeal = async (id: string) => {
    await supabase.from('family_meals').delete().eq('id', id);
    setMeals(prev => prev.filter(m => m.id !== id));
  };

  const mealsByDay = useMemo(() => {
    const map: Record<string, Meal[]> = {};
    meals.forEach(m => {
      (map[m.day] = map[m.day] ?? []).push(m);
    });
    return map;
  }, [meals]);

  if (loading) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={ChefHat} iconColor={BRAND.amber} title="Meal Planner" colors={colors} />
      <ActivityIndicator color={BRAND.amber} style={{ marginVertical: 24 }} />
    </SCard>
  );

  return (
    <>
      {/* ── CubeAI Planner Banner ─────────────────────────────── */}
      <View style={{ marginBottom: 12, backgroundColor: '#0D1424', borderRadius: 20, borderWidth: 1, borderColor: '#1E2A42', overflow: 'hidden' }}>

        {/* Header row */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => setAiOpen(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
          <View style={{ width: 32, height: 32 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.25)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)', alignItems: 'center', justifyContent: 'center' }}>
              <ChefHat size={16} color="#C4B5FD" />
            </View>
            <View style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', opacity: pulseOpacity, transform: [{ scale: pulseScale }] }} />
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#C4B5FD' }}>CubeAI Meal Planner</Text>
            <Text style={{ fontSize: 11, color: 'rgba(196,181,253,0.65)', marginTop: 1 }}>
              Generate a full week plan with recipes
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#A78BFA' }}>{aiOpen ? 'Collapse' : 'Open'}</Text>
            {aiOpen ? <ChevronUp size={12} color="#A78BFA" /> : <ChevronDown size={12} color="#A78BFA" />}
          </View>
        </TouchableOpacity>

        {/* Expanded body */}
        {aiOpen && (
          <View style={{ borderTopWidth: 1, borderTopColor: '#1E2A42', padding: 14, gap: 12 }}>
            {/* Quick chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['Kid-friendly', 'Vegetarian', 'High-protein', 'Under 20 min', 'Healthy', 'Weekend BBQ'].map(chip => (
                  <TouchableOpacity key={chip} onPress={() => setAiPref(chip)}
                    style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                      backgroundColor: aiPref === chip ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.18)',
                      borderWidth: 1, borderColor: aiPref === chip ? 'rgba(167,139,250,0.7)' : 'rgba(167,139,250,0.3)' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#C4B5FD' }}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Input + send */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: '#2A3555', paddingHorizontal: 12, paddingVertical: 8 }}>
              <TextInput
                value={aiPref} onChangeText={setAiPref}
                placeholder="e.g. Kid-friendly, high-protein, 30 min max…"
                placeholderTextColor="rgba(196,181,253,0.4)"
                style={{ flex: 1, fontSize: 13, color: '#E2D9FD', minHeight: 22 }}
                multiline onSubmitEditing={generateMealPlan}
              />
              <TouchableOpacity onPress={generateMealPlan} disabled={aiLoading || !aiPref.trim()}
                style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center', opacity: aiPref.trim() ? 1 : 0.35 }}>
                {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Sparkles size={15} color="#fff" />}
              </TouchableOpacity>
            </View>

            {aiError && (
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.12)', padding: 12 }}>
                <Text style={{ fontSize: 12, color: '#FCA5A5' }}>{aiError}</Text>
                <TouchableOpacity onPress={generateMealPlan} style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#FCA5A5', textDecorationLine: 'underline' }}>Try again →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Meal Selection Phase ─────────────────────────── */}
      {pendingOptions && (
        <View style={{ marginBottom: 12, borderRadius: 20, borderWidth: 1, borderColor: BRAND.purple + '50', backgroundColor: isDark ? colors.surface : colors.background, padding: 14, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: BRAND.purple }}>Pick Your Meals</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Pick up to 2 meals per day, then confirm</Text>
            </View>
            <TouchableOpacity onPress={() => { setPendingOptions(null); setSelected({}); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {tip && (
            <View style={{ borderRadius: 12, backgroundColor: BRAND.teal + '15', borderWidth: 1, borderColor: BRAND.teal + '30', padding: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? BRAND.teal : '#0F766E', lineHeight: 18 }}>💡 {tip}</Text>
            </View>
          )}

          {pendingOptions.map(dayOpt => (
            <View key={dayOpt.day} style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: BRAND.amber, letterSpacing: 0.5 }}>{dayOpt.day.toUpperCase()}</Text>
              {dayOpt.options.map((opt, idx) => {
                const daySel = selected[dayOpt.day] ?? [0];
                const isSelected = daySel.includes(idx);
                const toggleSelect = () => {
                  setSelected(prev => {
                    const cur = prev[dayOpt.day] ?? [0];
                    if (cur.includes(idx)) {
                      // deselect — keep at least 1
                      const next = cur.filter(i => i !== idx);
                      return { ...prev, [dayOpt.day]: next.length ? next : cur };
                    } else if (cur.length < 2) {
                      return { ...prev, [dayOpt.day]: [...cur, idx].sort() };
                    }
                    return prev; // already 2 selected, ignore
                  });
                };
                return (
                  <TouchableOpacity key={idx} activeOpacity={0.8} onPress={toggleSelect}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: isSelected ? 1.5 : 1,
                      borderColor: isSelected ? BRAND.purple : colors.border,
                      backgroundColor: isSelected ? BRAND.purple + '10' : 'transparent', padding: 10 }}>
                    {/* Checkbox */}
                    <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2,
                      borderColor: isSelected ? BRAND.purple : colors.border,
                      backgroundColor: isSelected ? BRAND.purple : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                    </View>
                    <Text style={{ fontSize: 18 }}>{opt.emoji ?? '🍽'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>{opt.mealName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Timer size={10} color={BRAND.amber} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber }}>{opt.prepMinutes}m</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 1 }}>
                          {Array.from({ length: opt.kidFriendlyRating }).map((_, si) => (
                            <Star key={si} size={9} fill={BRAND.amber} color={BRAND.amber} />
                          ))}
                        </View>
                        {opt.dietaryTags.slice(0, 2).map(tag => (
                          <View key={tag} style={{ borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: BRAND.teal + '20' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: BRAND.teal }}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <TouchableOpacity onPress={confirmPlan} disabled={savingPlan}
            style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: BRAND.purple, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {savingPlan
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Check size={16} color="#fff" /><Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Confirm Plan</Text></>}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Weekly Plan Grid ─────────────────────────────── */}
      {aiLoading && (
        <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderRadius: 16, borderWidth: 1, borderColor: isDark ? BRAND.purple + '40' : '#C7D2FE' }}>
          <ActivityIndicator color={BRAND.purple} size="small" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#A78BFA' : '#4338CA' }}>CubeAI is crafting your week plan…</Text>
        </View>
      )}

      <SCard colors={colors} isDark={isDark}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: BRAND.amber + '20', alignItems: 'center', justifyContent: 'center' }}>
              <ChefHat size={16} color={BRAND.amber} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>Week Plan</Text>
            <View style={{ borderRadius: 99, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: BRAND.amber + '20', borderColor: BRAND.amber + '50' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.amber }}>Wk of {curWeek}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={load} style={{ padding: 6, borderRadius: 8, backgroundColor: BRAND.amber + '15' }}>
            <RefreshCw size={14} color={BRAND.amber} />
          </TouchableOpacity>
        </View>

        {/* Nutrition tip */}
        {tip && (
          <View style={{ borderRadius: 12, backgroundColor: BRAND.teal + '15', borderWidth: 1, borderColor: BRAND.teal + '30', padding: 10, marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? BRAND.teal : '#0F766E', lineHeight: 18 }}>💡 {tip}</Text>
          </View>
        )}

        {/* Day cards */}
        <View style={{ gap: 2 }}>
          {DAYS.map(day => (
            <DayCard key={day} day={day} meals={mealsByDay[day] ?? []}
              colors={colors} isDark={isDark}
              onRecipe={m => setActiveRecipe(m)}
              onEdit={m => setEditMeal(m)}
              onDelete={isKid ? undefined : m => deleteMeal(m.id)}
              onAdd={() => { setAddDay(day); setAddTitle(''); setAddType('Dinner'); }}
            />
          ))}
        </View>

        {/* Grocery action row */}
        {groceryList.length > 0 && (
          <View style={{ marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, gap: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textSecondary, letterSpacing: 0.5 }}>
              SMART GROCERY LIST — {groceryList.length} ITEMS
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={addAllToCart} disabled={addedCart}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 12, paddingVertical: 10, borderWidth: 1,
                  borderColor: addedCart ? BRAND.emerald + '50' : BRAND.teal + '50',
                  backgroundColor: addedCart ? BRAND.emerald + '12' : BRAND.teal + '12' }}>
                {addedCart
                  ? <><Check size={13} color={BRAND.emerald} /><Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.emerald }}>Added to Grocery!</Text></>
                  : <><ShoppingBag size={13} color={BRAND.teal} /><Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.teal }}>Add All to Grocery</Text></>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const lines = groceryList.slice(0, 12).map(g => `• ${g}`).join('\n');
                  const msg = `🛒 *Grocery List for the week*\n\n${lines}${groceryList.length > 12 ? `\n…and ${groceryList.length - 12} more` : ''}`;
                  useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1,
                  borderColor: BRAND.purple + '50', backgroundColor: BRAND.purple + '12' }}>
                <MessageSquare size={13} color={BRAND.purple} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SCard>

      {/* ── Add Meal Sheet ─────────────────────────────── */}
      <Modal visible={!!addDay} transparent animationType="slide" onRequestClose={resetAddForm}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={resetAddForm} />
            <View style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28,
              paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%',
              backgroundColor: isDark ? colors.card : '#FAFAFA' }}>

              {/* Drag handle */}
              <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border,
                alignSelf: 'center', marginBottom: 14 }} />

              {/* Fixed header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity onPress={() => setAddShowEmoji(v => !v)}
                    style={{ width: 46, height: 46, borderRadius: 14,
                      backgroundColor: (MEAL_TYPE_COLOR[addType] ?? BRAND.amber) + '20',
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1.5, borderColor: (MEAL_TYPE_COLOR[addType] ?? BRAND.amber) + '40' }}>
                    <Text style={{ fontSize: 26 }}>{addEmoji}</Text>
                  </TouchableOpacity>
                  <View>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>
                      Add Meal — {addDay}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700',
                      color: MEAL_TYPE_COLOR[addType] ?? BRAND.amber,
                      textTransform: 'capitalize', marginTop: 1 }}>
                      {addType} · tap emoji to change
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={resetAddForm}
                  style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                  <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Scrollable body */}
              <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}>

                {/* Emoji picker */}
                {addShowEmoji && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderRadius: 16,
                    backgroundColor: isDark ? colors.surface : '#F0EEFF',
                    borderWidth: 1, borderColor: BRAND.purple + '30', marginBottom: 12 }}>
                    {MEAL_EMOJIS.map(e => (
                      <TouchableOpacity key={e} onPress={() => { setAddEmoji(e); setAddShowEmoji(false); }}
                        style={{ width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: addEmoji === e ? BRAND.purple + '25' : 'transparent' }}>
                        <Text style={{ fontSize: 24 }}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Meal name */}
                <Text style={em.label}>Meal Name</Text>
                <TextInput value={addTitle} onChangeText={setAddTitle}
                  placeholder="e.g. Grilled Chicken & Veggies"
                  placeholderTextColor={colors.textTertiary} autoFocus
                  style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, fontWeight: '600',
                    marginBottom: 10, backgroundColor: isDark ? colors.surface : colors.background,
                    borderColor: colors.border, color: colors.textPrimary }} />

                {/* Meal type */}
                <Text style={em.label}>Meal Type</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  {MEAL_TYPES.map(t => {
                    const tc = MEAL_TYPE_COLOR[t.toLowerCase()] ?? BRAND.amber;
                    const sel = addType === t.toLowerCase();
                    return (
                      <TouchableOpacity key={t} onPress={() => setAddType(t.toLowerCase())}
                        style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 9,
                          alignItems: 'center', gap: 2,
                          backgroundColor: sel ? tc + '18' : 'transparent',
                          borderColor: sel ? tc : colors.border }}>
                        <Text style={{ fontSize: 14 }}>
                          {t === 'Breakfast' ? '🌅' : t === 'Lunch' ? '☀️' : t === 'Dinner' ? '🌙' : '🍎'}
                        </Text>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: sel ? tc : colors.textSecondary }}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Chef + prep time */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={em.label}>Who's Cooking</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => setAddChefId('')}
                          style={{ borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
                            backgroundColor: !addChefId ? BRAND.teal + '20' : 'transparent',
                            borderColor: !addChefId ? BRAND.teal : colors.border }}>
                          <Text style={{ fontSize: 12, fontWeight: '800',
                            color: !addChefId ? BRAND.teal : colors.textSecondary }}>Anyone</Text>
                        </TouchableOpacity>
                        {members.map(m => {
                          const sel = addChefId === m.id;
                          const initials = (m.name as string).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                          const hue = (m.name as string).charCodeAt(0) % 360;
                          const avatarBg = `hsl(${hue},60%,55%)`;
                          return (
                            <TouchableOpacity key={m.id} onPress={() => setAddChefId(m.id)}
                              style={{ alignItems: 'center', gap: 3 }}>
                              <View style={{ width: 36, height: 36, borderRadius: 18,
                                backgroundColor: avatarBg,
                                borderWidth: 2.5, borderColor: sel ? BRAND.teal : 'transparent',
                                alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>{initials}</Text>
                              </View>
                              <Text style={{ fontSize: 9, fontWeight: '700',
                                color: sel ? BRAND.teal : colors.textTertiary }}>
                                {(m.name as string).split(' ')[0]}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={em.label}>Prep Time</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 9,
                      backgroundColor: isDark ? colors.surface : colors.background,
                      borderColor: colors.border, marginBottom: 10 }}>
                      <TextInput value={addPrepMins} onChangeText={setAddPrepMins} placeholder="30"
                        placeholderTextColor={colors.textTertiary} keyboardType="numeric"
                        style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary }} />
                      <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '700' }}>min</Text>
                    </View>
                  </View>
                </View>

                {/* Dietary tags */}
                <Text style={em.label}>Dietary Tags</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                  {DIETARY_OPTIONS.map(tag => {
                    const sel = addDietTags.includes(tag);
                    return (
                      <TouchableOpacity key={tag}
                        onPress={() => setAddDietTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                        style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5,
                          backgroundColor: sel ? BRAND.teal + '22' : 'transparent',
                          borderColor: sel ? BRAND.teal : colors.border }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: sel ? BRAND.teal : colors.textSecondary }}>{tag}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Ingredients */}
                <Text style={em.label}>Ingredients (one per line)</Text>
                <TextInput value={addIngredients} onChangeText={setAddIngredients}
                  placeholder={'chicken breast\nquinoa\nlemon\nolive oil'}
                  placeholderTextColor={colors.textTertiary} multiline numberOfLines={4}
                  style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13,
                    marginBottom: 10, height: 100, textAlignVertical: 'top',
                    backgroundColor: isDark ? colors.surface : colors.background,
                    borderColor: colors.border, color: colors.textPrimary }} />

                {/* Steps */}
                <Text style={em.label}>Steps (one per line)</Text>
                <TextInput value={addPrepSteps} onChangeText={setAddPrepSteps}
                  placeholder={'Season chicken\nBoil quinoa 15 min\nGrill 6 min each side'}
                  placeholderTextColor={colors.textTertiary} multiline numberOfLines={5}
                  style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13,
                    marginBottom: 10, height: 120, textAlignVertical: 'top',
                    backgroundColor: isDark ? colors.surface : colors.background,
                    borderColor: colors.border, color: colors.textPrimary }} />

              </ScrollView>

              {/* Footer */}
              <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 16,
                borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <TouchableOpacity onPress={resetAddForm}
                  style={{ flex: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 14,
                    alignItems: 'center', borderColor: colors.border }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addManualMeal} disabled={!addTitle.trim()}
                  style={{ flex: 2, borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                    backgroundColor: BRAND.purple, opacity: addTitle.trim() ? 1 : 0.4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Add Meal</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modals */}
      <RecipeModal meal={activeRecipe} visible={!!activeRecipe}
        onClose={() => setActiveRecipe(null)}
        onAddToGrocery={addGroceryItems}
        senderId={activeMember?.id ?? ''}
        colors={colors} isDark={isDark} />

      <EditMealModal meal={editMeal} visible={!!editMeal}
        onClose={() => setEditMeal(null)}
        onSave={updateMeal}
        members={members} colors={colors} isDark={isDark} />
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const em = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6, marginTop: 4, color: '#94A3B8' },
});

const dc = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginTop: 6 },
  iconBtn:{ borderRadius: 8, borderWidth: 1, borderColor: 'transparent', padding: 6 },
});

const rm = StyleSheet.create({
  modal:  { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  fab:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 20, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabTxt: { fontSize: 14, fontWeight: '900', color: '#fff' },
});
