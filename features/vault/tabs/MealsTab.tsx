import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChefHat, ShoppingCart, Plus, Trash2, Check, Square, CheckSquare,
  X, RefreshCw, Leaf, Package, Send, MessageSquare, Beef,
  Timer, Star, Sparkles, BookOpen, ShoppingBag, ChevronDown, ChevronUp,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import { useGroceryStore } from '@/store/groceryStore';
import { SCard, CardHeader, AddBtn, EmptyState, BRAND } from './shared';
import { localDateStr } from '@/lib/dates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meal {
  id: string; day: string; title: string; type: string;
  ingredients: string[]; chef_id: string | null; week_of: string;
}

interface GroceryItem {
  id: string; name: string; category: string; quantity: string;
  bought: boolean; store_preference: string | null; ai_generated: boolean;
}

interface AiMeal {
  day: string; mealName: string; emoji?: string; prepMinutes: number;
  dietaryTags: string[]; kidFriendlyRating: number; ingredientsList: string[];
  prepSteps?: string[];
}

interface AiMealResult {
  weeklyMeals: AiMeal[];
  groceryAutoList: string[];
  nutritionCoachingTip: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEAL_CACHE_KEY = 'cubeai_meal_plan_cache';
const CACHE_TTL_MS   = 6 * 60 * 60 * 1000; // 6 hours

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const AISLE_ICONS: Record<string, any> = {
  Produce: Leaf, Meat: Beef, Dairy: Package,
  Pantry: Package, Frozen: Package, Other: Package,
};
const AISLE_COLORS: Record<string, string> = {
  Produce: BRAND.emerald, Meat: BRAND.rose, Dairy: BRAND.blue,
  Pantry: BRAND.amber, Frozen: BRAND.teal, Other: BRAND.purple,
};

// Auto-categorize grocery items by keyword
const categorizeItem = (name: string): string => {
  const n = name.toLowerCase();
  if (/chicken|beef|turkey|pork|salmon|shrimp|lamb|tuna|meat|sausage/.test(n)) return 'Meat';
  if (/milk|cheese|cheddar|parmesan|yogurt|butter|cream|dairy/.test(n)) return 'Dairy';
  if (/potato|zucchini|salsa|fruit|salad|veggie|broccoli|carrot|lettuce|tomato|onion|garlic|pepper|spinach|apple|banana/.test(n)) return 'Produce';
  if (/pasta|penne|tortilla|breadcrumb|bread|flour|rice|grain|oat/.test(n)) return 'Pantry';
  if (/frozen/.test(n)) return 'Frozen';
  return 'Pantry';
};

const MEAL_EMOJIS = ['🍳', '🌮', '🍝', '🍗', '🥗', '🍜', '🥘'];

const weekOf = () => {
  const d = new Date();
  // Use local date arithmetic — d.getDay() is already local
  d.setDate(d.getDate() - d.getDay() + 1);
  return localDateStr(d);
};

const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

// ─── Recipe Modal ─────────────────────────────────────────────────────────────

function RecipeModal({ meal, visible, onClose, onAddToGrocery, senderId, colors, isDark }: {
  meal: AiMeal | null; visible: boolean; onClose: () => void;
  onAddToGrocery: (items: string[]) => Promise<void>;
  senderId: string; colors: any; isDark: boolean;
}) {
  const [timerSec, setTimerSec]     = useState<number | null>(null);
  const [running, setRunning]       = useState(false);
  const [addingCart, setAddingCart] = useState(false);
  const [cartDone, setCartDone]     = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      setTimerSec(null); setRunning(false); setCartDone(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [visible]);

  useEffect(() => {
    if (running && timerSec !== null && timerSec > 0) {
      intervalRef.current = setInterval(() => setTimerSec(s => (s ?? 1) - 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerSec === 0) setRunning(false);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, timerSec]);

  const insets = useSafeAreaInsets();

  if (!meal) return null;

  const startTimer = () => { setTimerSec(meal.prepMinutes * 60); setRunning(true); };

  const handleAddToCart = async () => {
    setAddingCart(true);
    await onAddToGrocery(meal.ingredientsList);
    setAddingCart(false);
    setCartDone(true);
    setTimeout(() => onClose(), 1200);
  };

  const shareRecipe = () => {
    const stars = '⭐'.repeat(meal.kidFriendlyRating);
    const steps = meal.prepSteps?.length
      ? `\n\n*Steps:*\n${meal.prepSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '';
    const msg = `@all What do you think about this recipe? 🍽️\n\n👩‍🍳 *${meal.mealName}* ${meal.emoji ?? ''}\n⏱ ${meal.prepMinutes} min prep · ${stars} kid approved\n\n*Ingredients:*\n${meal.ingredientsList.map(i => `• ${i}`).join('\n')}${steps}`;
    useChatStore.getState().sendMessage('all', senderId, msg);
    onClose();
  };

  const steps = meal.prepSteps?.length ? meal.prepSteps : [
    `Gather all ingredients: ${meal.ingredientsList.slice(0, 3).join(', ')}${meal.ingredientsList.length > 3 ? ' and more' : ''}.`,
    `Prep and chop any vegetables. Season the main protein if applicable.`,
    `Cook for approximately ${Math.round(meal.prepMinutes * 0.6)} minutes using your preferred method.`,
    `Combine all components and cook for a further ${Math.round(meal.prepMinutes * 0.3)} minutes until done.`,
    `Plate and serve hot. Enjoy your ${meal.mealName}!`,
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[am.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
        {/* Header */}
        <View style={[am.header, { borderColor: colors.border, alignItems: 'flex-start' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
            {meal.emoji ? (
              <Text style={{ fontSize: 36, lineHeight: 44 }}>{meal.emoji}</Text>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary, lineHeight: 23, flexShrink: 1 }}
                numberOfLines={3}>{meal.mealName}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.amber, marginTop: 3 }}>
                {meal.day} · {meal.prepMinutes} min prep
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4, marginLeft: 8 }}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>

        {/* Kid rating + dietary tags */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={14}
                  fill={i < meal.kidFriendlyRating ? BRAND.amber : 'none'}
                  color={i < meal.kidFriendlyRating ? BRAND.amber : colors.border} />
              ))}
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND.amber, marginLeft: 4 }}>Kid Approved</Text>
            </View>
            {meal.dietaryTags.map(tag => (
              <View key={tag} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: BRAND.teal + '20' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.teal }}>{tag}</Text>
              </View>
            ))}
          </View>


          {/* Ingredients */}
          <View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginBottom: 8 }}>
              Ingredients
            </Text>
            <View style={{ gap: 6 }}>
              {meal.ingredientsList.map((ing, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.teal }} />
                  <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '600' }}>{ing}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Step-by-step */}
          <View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginBottom: 8 }}>
              Step-by-Step Instructions
            </Text>
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

        {/* Floating FAB row */}
        <View style={{
          position: 'absolute', bottom: insets.bottom + 16, left: 16, right: 16,
          flexDirection: 'row', gap: 10,
        }}>
          <TouchableOpacity onPress={handleAddToCart} disabled={addingCart || cartDone}
            style={[rc.fab, { backgroundColor: cartDone ? BRAND.emerald : BRAND.teal, flex: 1 }]}>
            {addingCart
              ? <ActivityIndicator size="small" color="#fff" />
              : cartDone
                ? <><Check size={15} color="#fff" /><Text style={rc.footerBtnTxt}>Added to Grocery!</Text></>
                : <><ShoppingBag size={15} color="#fff" /><Text style={rc.footerBtnTxt}>Add to Grocery</Text></>}
          </TouchableOpacity>
          <TouchableOpacity onPress={shareRecipe}
            style={[rc.fab, { backgroundColor: BRAND.purple, flex: 1 }]}>
            <Send size={15} color="#fff" />
            <Text style={rc.footerBtnTxt}>Share Recipe</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add-Meal Modal ────────────────────────────────────────────────────────────

function AddMealModal({ visible, onClose, onSave, members, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSave: (form: { day: string; title: string; type: string; chef_id: string; ingredients: string }) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
}) {
  const [day, setDay]       = useState('Mon');
  const [title, setTitle]   = useState('');
  const [type, setType]     = useState('Dinner');
  const [chefId, setChefId] = useState(members[0]?.id ?? '');
  const [ingStr, setIngStr] = useState('');
  const [saving, setSaving] = useState(false);

  const inp = [am.inp, { backgroundColor: isDark ? colors.card : '#F5F3FF', borderColor: colors.border, color: colors.textPrimary }];

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ day, title: title.trim(), type, chef_id: chefId, ingredients: ingStr });
    setSaving(false); setTitle(''); setIngStr(''); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[am.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
          <View style={[am.header, { borderColor: colors.border }]}>
            <Text style={[am.title, { color: colors.textPrimary }]}>Add Meal</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {DAYS.map(d => (
                    <TouchableOpacity key={d} onPress={() => setDay(d)}
                      style={[am.chip, { backgroundColor: day === d ? BRAND.purple : 'transparent', borderColor: day === d ? BRAND.purple : colors.border }]}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: day === d ? '#fff' : colors.textSecondary }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Meal Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MEAL_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setType(t)}
                    style={[am.chip, { backgroundColor: type === t ? BRAND.amber : 'transparent', borderColor: type === t ? BRAND.amber : colors.border }]}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: type === t ? '#fff' : colors.textSecondary }}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Meal Name *</Text>
              <TextInput value={title} onChangeText={setTitle}
                placeholder="e.g. Spaghetti Bolognese" placeholderTextColor={colors.textTertiary} style={inp} />
            </View>
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Ingredients (comma separated)</Text>
              <TextInput value={ingStr} onChangeText={setIngStr}
                placeholder="pasta, ground beef, tomato sauce…" placeholderTextColor={colors.textTertiary}
                style={[inp, { height: 72 }]} multiline textAlignVertical="top" />
            </View>
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Chef (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {members.map(m => (
                    <TouchableOpacity key={m.id} onPress={() => setChefId(m.id)}
                      style={[am.chip, { backgroundColor: chefId === m.id ? BRAND.teal : 'transparent', borderColor: chefId === m.id ? BRAND.teal : colors.border }]}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: chefId === m.id ? '#fff' : colors.textSecondary }}>
                        {m.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </ScrollView>
          <View style={[am.footer, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={[am.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[am.saveBtn, { backgroundColor: BRAND.purple }]} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Add Meal</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add-Grocery Modal ────────────────────────────────────────────────────────

function AddGroceryModal({ visible, onClose, onSave, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSave: (items: { name: string; category: string; quantity: string; store: string }[]) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [rows, setRows] = useState([{ name: '', category: 'Other', quantity: '1', store: '' }]);
  const [saving, setSaving] = useState(false);
  const addRow = () => setRows(r => [...r, { name: '', category: 'Other', quantity: '1', store: '' }]);
  const removeRow = (i: number) => setRows(r => r.filter((_, j) => j !== i));
  const editRow = (i: number, key: string, val: string) =>
    setRows(r => r.map((row, j) => j === i ? { ...row, [key]: val } : row));
  const inp = [am.inp, { backgroundColor: isDark ? colors.card : '#F5F3FF', borderColor: colors.border, color: colors.textPrimary }];
  const handleSave = async () => {
    const valid = rows.filter(r => r.name.trim());
    if (!valid.length) return;
    setSaving(true);
    await onSave(valid);
    setSaving(false);
    setRows([{ name: '', category: 'Other', quantity: '1', store: '' }]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[am.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
          <View style={[am.header, { borderColor: colors.border }]}>
            <Text style={[am.title, { color: colors.textPrimary }]}>Add Groceries</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
            {rows.map((row, i) => (
              <View key={i} style={[ml.groceryRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1, gap: 8 }}>
                  <TextInput value={row.name} onChangeText={v => editRow(i, 'name', v)}
                    placeholder="Item name *" placeholderTextColor={colors.textTertiary} style={inp} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput value={row.quantity} onChangeText={v => editRow(i, 'quantity', v)}
                      placeholder="Qty" placeholderTextColor={colors.textTertiary}
                      style={[inp, { flex: 1 }]} keyboardType="numeric" />
                    <TextInput value={row.store} onChangeText={v => editRow(i, 'store', v)}
                      placeholder="Store (optional)" placeholderTextColor={colors.textTertiary}
                      style={[inp, { flex: 2 }]} />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {Object.keys(AISLE_COLORS).map(cat => (
                        <TouchableOpacity key={cat} onPress={() => editRow(i, 'category', cat)}
                          style={[am.chip, {
                            backgroundColor: row.category === cat ? AISLE_COLORS[cat] : 'transparent',
                            borderColor: row.category === cat ? AISLE_COLORS[cat] : colors.border, paddingVertical: 4,
                          }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: row.category === cat ? '#fff' : colors.textTertiary }}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                {rows.length > 1 && (
                  <TouchableOpacity onPress={() => removeRow(i)} style={{ padding: 6 }}>
                    <X size={16} color={BRAND.rose} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity onPress={addRow}
              style={[ml.addRowBtn, { borderColor: BRAND.teal + '50', backgroundColor: BRAND.teal + '08' }]}>
              <Plus size={14} color={BRAND.teal} /><Text style={{ fontSize: 13, fontWeight: '700', color: BRAND.teal }}>Add Another Item</Text>
            </TouchableOpacity>
          </ScrollView>
          <View style={[am.footer, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={[am.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[am.saveBtn, { backgroundColor: BRAND.teal }]} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save Items</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main MealsTab ────────────────────────────────────────────────────────────

export default function MealsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  const [meals, setMeals]           = useState<Meal[]>([]);
  const [grocery, setGrocery]       = useState<GroceryItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showMeal, setShowMeal]     = useState(false);
  const [showGroc, setShowGroc]     = useState(false);

  // AI recipe state
  const [aiOpen, setAiOpen]         = useState(false);
  const [aiError, setAiError]       = useState<string | null>(null);
  const [cachedAt, setCachedAt]     = useState<Date | null>(null);
  const [cachedPref, setCachedPref] = useState<string | null>(null);
  // Load cached meal plan on mount
  useEffect(() => {
    AsyncStorage.getItem(MEAL_CACHE_KEY).then(raw => {
      if (!raw) return;
      try {
        const { result, pref, savedAt } = JSON.parse(raw);
        if (Date.now() - savedAt < CACHE_TTL_MS && result?.weeklyMeals?.length) {
          setAiResult(result);
          setCachedAt(new Date(savedAt));
          setCachedPref(pref);
          setAiPref(pref);
          setAiOpen(true);
        }
      } catch {}
    });
  }, []);

  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 2.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0,   duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1,   duration: 0,   useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0,   useNativeDriver: true }),
        ]),
        Animated.delay(400),
      ])
    ).start();
  }, []);
  const [aiPref, setAiPref]         = useState('Kid-friendly, high-protein, 30 min max');
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiResult, setAiResult]     = useState<AiMealResult | null>(null);
  const [activeRecipe, setActiveRecipe] = useState<AiMeal | null>(null);
  const [addedAllCart, setAddedAllCart] = useState(false);
  const [groceryShared, setGroceryShared] = useState(false);

  const curWeek = weekOf();

  const load = useCallback(async () => {
    setLoading(true);
    const [mealsRes, grocRes] = await Promise.all([
      supabase.from('family_meals').select('*').eq('week_of', curWeek).order('day'),
      supabase.from('grocery_items').select('*').eq('family_id', familyId).order('category').order('name'),
    ]);
    if (mealsRes.data) setMeals(mealsRes.data as Meal[]);
    if (grocRes.data)  setGrocery(grocRes.data as GroceryItem[]);
    setLoading(false);
  }, [familyId, curWeek]);

  useEffect(() => { load(); }, [load]);

  const addMeal = async (form: any) => {
    const ings = form.ingredients.split(',').map((s: string) => s.trim()).filter(Boolean);
    const { data } = await supabase.from('family_meals').insert({
      family_id: familyId, week_of: curWeek,
      day: form.day, title: form.title, type: form.type,
      chef_id: form.chef_id || null, ingredients: ings,
    }).select().single();
    if (data) setMeals(prev => [...prev, data as Meal]);
  };

  const deleteMeal = async (id: string) => {
    await supabase.from('family_meals').delete().eq('id', id);
    setMeals(prev => prev.filter(m => m.id !== id));
  };

  const addGroceryItems = async (names: string[]) => {
    const { addItem, items: existingItems, familyId: storeFamilyId } = useGroceryStore.getState();
    const effectiveFamilyId = storeFamilyId ?? familyId;
    const existingNames = new Set(existingItems.map(i => i.name.toLowerCase().trim()));
    const toAdd = names.filter(n => !existingNames.has(n.toLowerCase().trim()));
    for (const name of toAdd) {
      await addItem({
        familyId: effectiveFamilyId, name, quantity: '1',
        category: categorizeItem(name),
        addedBy: activeMember?.id ?? '',
        aiGenerated: true,
      });
    }
  };

  const addGroceries = async (items: { name: string; category: string; quantity: string; store: string }[]) => {
    const rows = items.map(it => ({
      name: it.name, category: it.category, quantity: it.quantity,
      store_preference: it.store || null, bought: false,
      family_id: familyId, ai_generated: false,
    }));
    const { data } = await supabase.from('grocery_items').insert(rows).select();
    if (data) setGrocery(prev => [...(data as GroceryItem[]), ...prev]);
  };

  const toggleBought = async (item: GroceryItem) => {
    const { error } = await supabase.from('grocery_items').update({ bought: !item.bought }).eq('id', item.id);
    if (!error) setGrocery(prev => prev.map(g => g.id === item.id ? { ...g, bought: !g.bought } : g));
  };

  const deleteGrocery = async (id: string) => {
    await supabase.from('grocery_items').delete().eq('id', id);
    setGrocery(prev => prev.filter(g => g.id !== id));
  };

  // ── AI recipe + meal plan generation ─────────────────────────────────────────
  const generateAiRecipes = async () => {
    // If same query and cached result still valid — just show it, skip AI call
    if (aiResult && cachedPref === aiPref.trim() && cachedAt && Date.now() - cachedAt.getTime() < CACHE_TTL_MS) {
      setAiOpen(true);
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    setAiError(null);
    setAddedAllCart(false);
    setGroceryShared(false);
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          action: 'meal_plan',
          preferences: aiPref.trim() || 'Kid-friendly, balanced, under 35 min prep',
          days: 3,
          members: members.map(m => ({ name: (m as any).name, role: (m as any).role })),
        },
      });
      if (error) throw new Error(error.message);
      const result = data?.result ?? data;
      if (result?.weeklyMeals?.length) {
        setAiResult(result as AiMealResult);
        const now = Date.now();
        AsyncStorage.setItem(MEAL_CACHE_KEY, JSON.stringify({ result, pref: aiPref.trim(), savedAt: now }));
        setCachedAt(new Date(now));
        setCachedPref(aiPref.trim());
      } else {
        setAiError('AI couldn\'t generate a plan right now. Please try again in a moment.');
      }
    } catch (err: any) {
      setAiError('Unable to reach the AI chef. Check your connection and try again.');
    }
    setAiLoading(false);
  };

  const addAllToCart = async () => {
    if (!aiResult?.groceryAutoList) return;
    await addGroceryItems(aiResult.groceryAutoList);
    setAddedAllCart(true);
  };

  const shareGroceryToChat = () => {
    const pending = grocery.filter(g => !g.bought);
    if (!pending.length) return;
    const lines = pending.map(g => `• ${g.name} ×${g.quantity}`).join('\n');
    const msg = `🛒 *Grocery List — Week of ${curWeek}*\n\n${lines}`;
    useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
    setGroceryShared(true);
  };

  const grouped = useMemo(() => {
    const map: Record<string, GroceryItem[]> = {};
    grocery.forEach(g => { (map[g.category] = map[g.category] ?? []).push(g); });
    return map;
  }, [grocery]);

  const mealsByDay = useMemo(() => {
    const map: Record<string, Meal[]> = {};
    meals.forEach(m => { (map[m.day] = map[m.day] ?? []).push(m); });
    return map;
  }, [meals]);

  // Aisle-group the AI grocery list
  const aiGroceryByAisle = useMemo(() => {
    if (!aiResult?.groceryAutoList) return [];
    const map: Record<string, string[]> = {};
    aiResult.groceryAutoList.forEach(item => {
      const cat = categorizeItem(item);
      (map[cat] = map[cat] ?? []).push(item);
    });
    return Object.entries(map);
  }, [aiResult]);

  const pendingCount = grocery.filter(g => !g.bought).length;

  if (loading) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={ChefHat} iconColor={BRAND.amber} title="Meals & Grocery" colors={colors} />
      <ActivityIndicator color={BRAND.amber} style={{ marginVertical: 24 }} />
    </SCard>
  );

  return (
    <>
      {/* ── CubeAI Recipe Planner — Quests-style dark banner ── */}
      <View style={{
        marginBottom: 12,
        backgroundColor: '#0D1424',
        borderRadius: 20,
        borderWidth: 1, borderColor: '#1E2A42',
        overflow: 'hidden',
      }}>
        {/* Header row — always visible */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setAiOpen(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
        >
          {/* Icon box with pulsing dot */}
          <View style={{ width: 32, height: 32 }}>
            <View style={{
              width: 32, height: 32, borderRadius: 10,
              backgroundColor: 'rgba(124,58,237,0.25)',
              borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <ChefHat size={16} color="#C4B5FD" />
            </View>
            {/* Pulsing online dot — top-right of icon */}
            <View style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{
                position: 'absolute', width: 10, height: 10, borderRadius: 5,
                backgroundColor: '#10B981', opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
              }} />
              <View style={{
                width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981',
                shadowColor: '#10B981', shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
              }} />
            </View>
          </View>

          {/* Title + subtitle */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#C4B5FD' }}>CubeAI Recipe Planner</Text>
              {aiLoading && <ActivityIndicator size="small" color="#A78BFA" style={{ marginLeft: 2 }} />}
            </View>
            <Text style={{ fontSize: 11, color: 'rgba(196,181,253,0.65)', marginTop: 1 }}>
              Meal plan · Recipes · Grocery list
            </Text>
          </View>

          {/* Collapse / Tools toggle */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(255,255,255,0.09)',
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#A78BFA' }}>
              {aiOpen ? 'Collapse' : 'Tools'}
            </Text>
            {aiOpen ? <ChevronUp size={12} color="#A78BFA" /> : <ChevronDown size={12} color="#A78BFA" />}
          </View>
        </TouchableOpacity>

        {/* Expanded body */}
        {aiOpen && (
          <View style={{ borderTopWidth: 1, borderTopColor: '#1E2A42', padding: 14, gap: 12 }}>

            {/* Tool buttons row */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={generateAiRecipes} disabled={aiLoading}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                  paddingVertical: 10, borderRadius: 14,
                  backgroundColor: aiLoading ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.15)',
                  borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)',
                }}>
                {aiLoading
                  ? <ActivityIndicator size="small" color="#C4B5FD" />
                  : <Sparkles size={13} color="#C4B5FD" />}
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#C4B5FD' }}>
                  {aiResult ? 'Regenerate' : 'Generate Plan'}
                </Text>
              </TouchableOpacity>

              {aiResult && (
                <TouchableOpacity onPress={() => { setAiResult(null); setAddedAllCart(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                  }}>
                  <X size={13} color="#94A3B8" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#94A3B8' }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Quick preference chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['Kid-friendly', 'Vegetarian', 'High-protein', 'Under 20 min', 'Healthy breakfast', 'Weekend BBQ'].map(chip => (
                  <TouchableOpacity key={chip} onPress={() => setAiPref(chip)}
                    style={{
                      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                      backgroundColor: aiPref === chip ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.18)',
                      borderWidth: 1, borderColor: aiPref === chip ? 'rgba(167,139,250,0.7)' : 'rgba(167,139,250,0.3)',
                    }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#C4B5FD' }}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Preferences input */}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-end', gap: 8,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 14, borderWidth: 1, borderColor: '#2A3555',
              paddingHorizontal: 12, paddingVertical: 8,
            }}>
              <TextInput
                value={aiPref}
                onChangeText={setAiPref}
                placeholder="e.g. Kid-friendly, high-protein, 30 min max…"
                placeholderTextColor="rgba(196,181,253,0.4)"
                style={{ flex: 1, fontSize: 13, color: '#E2D9FD', minHeight: 22 }}
                multiline
                onSubmitEditing={generateAiRecipes}
              />
              <TouchableOpacity onPress={generateAiRecipes} disabled={aiLoading || !aiPref.trim()}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center',
                  opacity: aiPref.trim() ? 1 : 0.35,
                }}>
                <Sparkles size={15} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Error */}
            {aiError && (
              <View style={{
                borderRadius: 14, borderWidth: 1,
                borderColor: 'rgba(239,68,68,0.35)',
                backgroundColor: 'rgba(239,68,68,0.12)',
                padding: 14,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#FCA5A5', marginBottom: 4 }}>⚠ Couldn't load recipes</Text>
                <Text style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 18, opacity: 0.8 }}>{aiError}</Text>
                <TouchableOpacity onPress={generateAiRecipes} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#FCA5A5', textDecorationLine: 'underline' }}>Try again →</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        )}
      </View>

      {/* ── AI Meal Plan Result — separate inline card (Quests AiCard style) ── */}
      {aiLoading && (
        <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 14, paddingVertical: 12,
          backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF',
          borderRadius: 16, borderWidth: 1, borderColor: isDark ? BRAND.purple + '40' : '#C7D2FE' }}>
          <ActivityIndicator color={BRAND.purple} size="small" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#A78BFA' : '#4338CA' }}>
            CubeAI is crafting your family meal plan…
          </Text>
        </View>
      )}

      {aiResult && !aiLoading && (
        <View style={{
          borderRadius: 20, borderWidth: 1,
          backgroundColor: isDark ? colors.surface : colors.background,
          borderColor: BRAND.purple + '55',
          padding: 14, marginBottom: 12, gap: 12,
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BRAND.purple + '30' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.purple + '22', alignItems: 'center', justifyContent: 'center' }}>
              <ChefHat size={20} color={BRAND.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: BRAND.purple }}>AI Meal Plan</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }} numberOfLines={1}>
                {cachedAt
                  ? `Cached ${cachedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · "${cachedPref}"`
                  : 'Powered by DeepSeek AI · tap a meal to cook'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { setAiResult(null); setAddedAllCart(false); setCachedAt(null); AsyncStorage.removeItem(MEAL_CACHE_KEY); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Nutrition tip */}
          <View style={{ borderRadius: 14, backgroundColor: BRAND.teal + '18', borderWidth: 1, borderColor: BRAND.teal + '35', padding: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? BRAND.teal : '#0F766E', lineHeight: 20 }}>
              💡 {aiResult.nutritionCoachingTip}
            </Text>
          </View>

          <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textSecondary, letterSpacing: 0.5 }}>
            RECOMMENDED DINNERS — TAP TO COOK
          </Text>

          {/* Meal cards */}
          {aiResult.weeklyMeals.map((meal, i) => (
            <TouchableOpacity key={i} onPress={() => setActiveRecipe(meal)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: isDark ? colors.card : '#FFFBEB',
                borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                padding: 10,
              }}>
              <Text style={{ fontSize: 32 }}>{meal.emoji ?? MEAL_EMOJIS[i % MEAL_EMOJIS.length]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>{meal.mealName}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Timer size={10} color={BRAND.amber} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber }}>{meal.prepMinutes} min</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {Array.from({ length: meal.kidFriendlyRating }).map((_, si) => (
                      <Star key={si} size={9} fill={BRAND.amber} color={BRAND.amber} />
                    ))}
                  </View>
                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>{meal.day}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                  {meal.ingredientsList.slice(0, 3).join(', ')}{meal.ingredientsList.length > 3 ? '…' : ''}
                </Text>
              </View>
              <View style={[ml.cookBtn, { backgroundColor: BRAND.purple + '15', borderColor: BRAND.purple + '30' }]}>
                <BookOpen size={11} color={BRAND.purple} />
                <Text style={{ fontSize: 10, fontWeight: '900', color: BRAND.purple }}>Cook</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Smart grocery list */}
          <View style={{ borderTopWidth: 1, borderTopColor: BRAND.purple + '25', paddingTop: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textSecondary, letterSpacing: 0.5 }}>
                SMART GROCERY LIST
              </Text>
              <TouchableOpacity onPress={addAllToCart} disabled={addedAllCart}
                style={[ml.aiBtn, {
                  borderColor: addedAllCart ? BRAND.emerald + '50' : BRAND.teal + '50',
                  backgroundColor: addedAllCart ? BRAND.emerald + '15' : BRAND.teal + '15',
                }]}>
                {addedAllCart
                  ? <><Check size={11} color={BRAND.emerald} /><Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.emerald }}>Added!</Text></>
                  : <><ShoppingBag size={11} color={BRAND.teal} /><Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.teal }}>Add All to Cart</Text></>}
              </TouchableOpacity>
            </View>
            {aiGroceryByAisle.map(([cat, items]) => {
              const AisleIcon = AISLE_ICONS[cat] ?? Package;
              const ac = AISLE_COLORS[cat] ?? BRAND.purple;
              return (
                <View key={cat} style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <AisleIcon size={11} color={ac} />
                    <Text style={{ fontSize: 11, fontWeight: '900', color: ac }}>{cat}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {items.map((item, idx) => (
                      <View key={idx} style={[ml.grocTag, { backgroundColor: ac + '15', borderColor: ac + '30' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textPrimary }}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Share footer */}
          <View style={{ alignItems: 'flex-end' }}>
            <TouchableOpacity
              onPress={() => {
                if (!aiResult) return;
                const mealLines = aiResult.weeklyMeals.map(m => `${m.emoji ?? '🍽'} *${m.mealName}* (${m.day}, ${m.prepMinutes} min)`).join('\n');
                const grocLines = aiResult.groceryAutoList.slice(0, 10).map(g => `• ${g}`).join('\n');
                const msg = `@all What do you all think about this week's meal plan? Any meals you'd like to swap? 🙌\n\n👩‍🍳 *Family Meal Plan*\n\n${mealLines}\n\n🛒 *Grocery List (top 10):*\n${grocLines}`;
                useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: BRAND.purple }}>
              <MessageSquare size={13} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>Share with Family</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Meal Planner ─────────────────────────────── */}
      <SCard colors={colors} isDark={isDark}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardHeader Icon={ChefHat} iconColor={BRAND.amber} title="Meal Planner"
            badge={`Wk of ${curWeek}`} badgeColor={BRAND.amber} colors={colors} />
          <TouchableOpacity onPress={load}><RefreshCw size={14} color={BRAND.amber} /></TouchableOpacity>
        </View>

        {DAYS.map(day => {
          const dayMeals = mealsByDay[day] ?? [];
          return (
            <View key={day} style={[ml.dayRow, { borderColor: colors.border }]}>
              <Text style={[ml.dayLabel, { color: BRAND.amber }]}>{day}</Text>
              <View style={{ flex: 1, gap: 4 }}>
                {dayMeals.length === 0
                  ? <Text style={{ fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' }}>No meals planned</Text>
                  : dayMeals.map(m => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[ml.mealTypeTag, { backgroundColor: BRAND.amber + '20' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: BRAND.amber }}>{m.type}</Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>{m.title}</Text>
                      <TouchableOpacity onPress={() => deleteMeal(m.id)}>
                        <Trash2 size={13} color={BRAND.rose + 'AA'} />
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            </View>
          );
        })}

        <AddBtn label="Add Meal" onPress={() => setShowMeal(true)} color={BRAND.amber} />
      </SCard>

      {/* ── Grocery List ─────────────────────────────── */}
      <SCard colors={colors} isDark={isDark}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardHeader Icon={ShoppingCart} iconColor={BRAND.teal} title="Grocery List"
            badge={pendingCount > 0 ? `${pendingCount} left` : 'Done!'} badgeColor={pendingCount > 0 ? BRAND.teal : BRAND.emerald}
            colors={colors} />
          <TouchableOpacity onPress={shareGroceryToChat}
            style={[ml.aiBtn, { borderColor: groceryShared ? BRAND.emerald + '50' : BRAND.purple + '50', backgroundColor: groceryShared ? BRAND.emerald + '10' : BRAND.purple + '10' }]}>
            {groceryShared
              ? <><Check size={12} color={BRAND.emerald} /><Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.emerald }}>Shared</Text></>
              : <><MessageSquare size={12} color={BRAND.purple} /><Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>Share</Text></>}
          </TouchableOpacity>
        </View>

        {grocery.length === 0
          ? <EmptyState Icon={ShoppingCart} label="Add items or generate an AI recipe to fill your cart" colors={colors} />
          : Object.entries(grouped).map(([cat, items]) => {
            const AisleIcon = AISLE_ICONS[cat] ?? Package;
            const ac = AISLE_COLORS[cat] ?? BRAND.purple;
            return (
              <View key={cat} style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <AisleIcon size={13} color={ac} />
                  <Text style={{ fontSize: 12, fontWeight: '900', color: ac }}>{cat}</Text>
                </View>
                {items.map(item => (
                  <View key={item.id} style={[ml.grocItem, { borderColor: item.bought ? colors.border + '50' : colors.border, opacity: item.bought ? 0.55 : 1 }]}>
                    <TouchableOpacity onPress={() => toggleBought(item)}>
                      {item.bought
                        ? <CheckSquare size={18} color={BRAND.emerald} />
                        : <Square size={18} color={colors.textTertiary} />}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, textDecorationLine: item.bought ? 'line-through' : 'none' }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                        ×{item.quantity}{item.ai_generated ? ' · AI' : ''}{item.store_preference ? ` · ${item.store_preference}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteGrocery(item.id)}>
                      <Trash2 size={13} color={BRAND.rose + 'AA'} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          })}

        <AddBtn label="Add Items" onPress={() => setShowGroc(true)} color={BRAND.teal} />
      </SCard>

      {/* Modals */}
      <AddMealModal visible={showMeal} onClose={() => setShowMeal(false)}
        onSave={addMeal} members={members} colors={colors} isDark={isDark} />
      <AddGroceryModal visible={showGroc} onClose={() => setShowGroc(false)}
        onSave={addGroceries} colors={colors} isDark={isDark} />
      <RecipeModal
        meal={activeRecipe} visible={!!activeRecipe}
        onClose={() => setActiveRecipe(null)}
        onAddToGrocery={async (items) => { await addGroceryItems(items); }}
        senderId={activeMember?.id ?? ''}
        colors={colors} isDark={isDark} />
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const ml = StyleSheet.create({
  aiBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  dayRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 10 },
  dayLabel:   { fontSize: 13, fontWeight: '900', width: 36 },
  mealTypeTag:{ borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  grocItem:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 6 },
  groceryRow: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10, flexDirection: 'row', alignItems: 'flex-start' },
  addRowBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' },
  tipBox:     { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 10 },
  recipeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 8 },
  cookBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6 },
  grocTag:    { borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
});

const am = StyleSheet.create({
  modal:     { flex: 1 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title:     { fontSize: 18, fontWeight: '900', flex: 1, paddingRight: 8 },
  label:     { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  inp:       { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, fontWeight: '600' },
  chip:      { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  footer:    { flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:   { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});

const rc = StyleSheet.create({
  timerBox:     { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  timerBtn:     { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  fab:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 20, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  footerBtnTxt: { fontSize: 14, fontWeight: '900', color: '#fff' },
});
