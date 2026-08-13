import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  ChefHat, ShoppingCart, Plus, Trash2, Check, Square, CheckSquare,
  X, RefreshCw, Leaf, Package, Send, MessageSquare, Beef,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import { SCard, CardHeader, AddBtn, EmptyState, BRAND } from './shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meal {
  id: string; day: string; title: string; type: string;
  ingredients: string[]; chef_id: string | null; week_of: string;
}

interface GroceryItem {
  id: string; name: string; category: string; quantity: string;
  bought: boolean; store_preference: string | null; ai_generated: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const AISLE_ICONS: Record<string, any> = {
  Produce:  Leaf,
  Meat:     Beef,
  Dairy:    Package,
  Pantry:   Package,
  Frozen:   Package,
  Other:    Package,
};
const AISLE_COLORS: Record<string, string> = {
  Produce: BRAND.emerald, Meat: BRAND.rose, Dairy: BRAND.blue,
  Pantry: BRAND.amber, Frozen: BRAND.teal, Other: BRAND.purple,
};

const weekOf = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().slice(0, 10);
};

// ─── Add-Meal Modal ────────────────────────────────────────────────────────────

function AddMealModal({ visible, onClose, onSave, members, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onSave: (form: { day: string; title: string; type: string; chef_id: string; ingredients: string }) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
}) {
  const [day, setDay]         = useState('Mon');
  const [title, setTitle]     = useState('');
  const [type, setType]       = useState('Dinner');
  const [chefId, setChefId]   = useState(members[0]?.id ?? '');
  const [ingStr, setIngStr]   = useState('');
  const [saving, setSaving]   = useState(false);

  const inp = [am.inp, {
    backgroundColor: isDark ? colors.card : '#F5F3FF',
    borderColor: colors.border, color: colors.textPrimary,
  }];

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ day, title: title.trim(), type, chef_id: chefId, ingredients: ingStr });
    setSaving(false);
    setTitle(''); setIngStr('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[am.modal, { backgroundColor: isDark ? colors.background : '#FAF8FF' }]}>
          <View style={am.header}>
            <Text style={[am.title, { color: colors.textPrimary }]}>Add Meal</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
            {/* Day picker */}
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Day of Week</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {DAYS.map(d => (
                    <TouchableOpacity key={d} onPress={() => setDay(d)}
                      style={[am.chip, {
                        backgroundColor: day === d ? BRAND.purple : 'transparent',
                        borderColor: day === d ? BRAND.purple : colors.border,
                      }]}>
                      <Text style={{ fontSize: 13, fontWeight: '800',
                        color: day === d ? '#fff' : colors.textSecondary }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Meal type */}
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Meal Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MEAL_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setType(t)}
                    style={[am.chip, {
                      backgroundColor: type === t ? BRAND.amber : 'transparent',
                      borderColor: type === t ? BRAND.amber : colors.border,
                    }]}>
                    <Text style={{ fontSize: 13, fontWeight: '800',
                      color: type === t ? '#fff' : colors.textSecondary }}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Meal title */}
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Meal Name *</Text>
              <TextInput value={title} onChangeText={setTitle}
                placeholder="e.g. Spaghetti Bolognese" placeholderTextColor={colors.textTertiary}
                style={inp} />
            </View>

            {/* Ingredients */}
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Ingredients (comma separated)</Text>
              <TextInput value={ingStr} onChangeText={setIngStr}
                placeholder="pasta, ground beef, tomato sauce…" placeholderTextColor={colors.textTertiary}
                style={[inp, { height: 72 }]} multiline textAlignVertical="top" />
            </View>

            {/* Chef selector */}
            <View>
              <Text style={[am.label, { color: colors.textSecondary }]}>Chef (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {members.map(m => (
                    <TouchableOpacity key={m.id} onPress={() => setChefId(m.id)}
                      style={[am.chip, {
                        backgroundColor: chefId === m.id ? BRAND.teal : 'transparent',
                        borderColor: chefId === m.id ? BRAND.teal : colors.border,
                      }]}>
                      <Text style={{ fontSize: 12, fontWeight: '800',
                        color: chefId === m.id ? '#fff' : colors.textSecondary }}>
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
            <TouchableOpacity onPress={handleSave}
              style={[am.saveBtn, { backgroundColor: BRAND.purple }]} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Add Meal</Text>}
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

  const inp = [am.inp, {
    backgroundColor: isDark ? colors.card : '#F5F3FF',
    borderColor: colors.border, color: colors.textPrimary,
  }];

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
          <View style={am.header}>
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
                  {/* Aisle picker */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {Object.keys(AISLE_COLORS).map(cat => (
                        <TouchableOpacity key={cat} onPress={() => editRow(i, 'category', cat)}
                          style={[am.chip, {
                            backgroundColor: row.category === cat ? AISLE_COLORS[cat] : 'transparent',
                            borderColor: row.category === cat ? AISLE_COLORS[cat] : colors.border,
                            paddingVertical: 4,
                          }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700',
                            color: row.category === cat ? '#fff' : colors.textTertiary }}>{cat}</Text>
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
              <Plus size={14} color={BRAND.teal} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND.teal }}>Add Another Item</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={[am.footer, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={[am.cancelBtn, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave}
              style={[am.saveBtn, { backgroundColor: BRAND.teal }]} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save Items</Text>}
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

  const [meals, setMeals]       = useState<Meal[]>([]);
  const [grocery, setGrocery]   = useState<GroceryItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showMeal, setShowMeal] = useState(false);
  const [showGroc, setShowGroc] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiShared, setAiShared]   = useState(false);

  const curWeek = weekOf();

  const load = useCallback(async () => {
    setLoading(true);
    const [mealsRes, grocRes] = await Promise.all([
      supabase.from('family_meals').select('*')
        .eq('week_of', curWeek).order('day'),
      supabase.from('grocery_items').select('*')
        .eq('family_id', familyId).order('category').order('name'),
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
    const { error } = await supabase.from('grocery_items')
      .update({ bought: !item.bought }).eq('id', item.id);
    if (!error) setGrocery(prev => prev.map(g => g.id === item.id ? { ...g, bought: !g.bought } : g));
  };

  const deleteGrocery = async (id: string) => {
    await supabase.from('grocery_items').delete().eq('id', id);
    setGrocery(prev => prev.filter(g => g.id !== id));
  };

  // AI meal plan generation
  const generateMealPlan = async () => {
    setAiLoading(true);
    try {
      const { data } = await supabase.functions.invoke('family-ai', {
        body: {
          tool: 'meal_plan',
          family_size: members.length,
          week_of: curWeek,
          existing_meals: meals.map(m => m.title),
        },
      });
      if (data?.meals) {
        // Insert generated meals
        const rows = data.meals.map((m: any) => ({
          family_id: familyId, week_of: curWeek,
          day: m.day, title: m.title, type: m.type || 'Dinner',
          ingredients: m.ingredients ?? [], chef_id: null,
        }));
        const { data: inserted } = await supabase.from('family_meals').insert(rows).select();
        if (inserted) setMeals(prev => [...prev, ...(inserted as Meal[])]);
      }
    } catch { /* ignore */ }
    setAiLoading(false);
  };

  const shareGroceryToChat = () => {
    const pending = grocery.filter(g => !g.bought);
    if (!pending.length) return;
    const grouped = Object.entries(
      pending.reduce((acc, g) => {
        (acc[g.category] = acc[g.category] ?? []).push(`${g.name} ×${g.quantity}`);
        return acc;
      }, {} as Record<string, string[]>)
    ).map(([cat, items]) => `🛒 *${cat}*\n${items.map(i => `• ${i}`).join('\n')}`).join('\n\n');
    const msg = `📋 *Grocery List — Week of ${curWeek}*\n\n${grouped}`;
    useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
    setAiShared(true);
  };

  // Group grocery by aisle
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

  const pendingCount = grocery.filter(g => !g.bought).length;

  if (loading) return (
    <SCard colors={colors} isDark={isDark}>
      <CardHeader Icon={ChefHat} iconColor={BRAND.amber} title="Meals & Grocery" colors={colors} />
      <ActivityIndicator color={BRAND.amber} style={{ marginVertical: 24 }} />
    </SCard>
  );

  return (
    <>
      {/* ── Meal Planner ─────────────────────────────── */}
      <SCard colors={colors} isDark={isDark}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardHeader Icon={ChefHat} iconColor={BRAND.amber} title="Meal Planner"
            badge={`Wk of ${curWeek}`} badgeColor={BRAND.amber} colors={colors} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={load}>
              <RefreshCw size={14} color={BRAND.amber} />
            </TouchableOpacity>
            <TouchableOpacity onPress={generateMealPlan} disabled={aiLoading}
              style={[ml.aiBtn, { borderColor: BRAND.purple + '50', backgroundColor: BRAND.purple + '10' }]}>
              {aiLoading
                ? <ActivityIndicator size="small" color={BRAND.purple} />
                : <>
                    <ChefHat size={12} color={BRAND.purple} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>AI Plan</Text>
                  </>}
            </TouchableOpacity>
          </View>
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
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>
                        {m.title}
                      </Text>
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
            style={[ml.aiBtn, { borderColor: BRAND.purple + '50', backgroundColor: aiShared ? BRAND.emerald + '10' : BRAND.purple + '10' }]}>
            {aiShared
              ? <><Check size={12} color={BRAND.emerald} /><Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.emerald }}>Shared</Text></>
              : <><MessageSquare size={12} color={BRAND.purple} /><Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>Share</Text></>}
          </TouchableOpacity>
        </View>

        {grocery.length === 0
          ? <EmptyState Icon={ShoppingCart} label="Add items to your grocery list" colors={colors} />
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
                  <View key={item.id} style={[ml.grocItem, {
                    borderColor: item.bought ? colors.border + '50' : colors.border,
                    opacity: item.bought ? 0.55 : 1,
                  }]}>
                    <TouchableOpacity onPress={() => toggleBought(item)}>
                      {item.bought
                        ? <CheckSquare size={18} color={BRAND.emerald} />
                        : <Square size={18} color={colors.textTertiary} />}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary,
                        textDecorationLine: item.bought ? 'line-through' : 'none' }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                        ×{item.quantity}{item.store_preference ? ` · ${item.store_preference}` : ''}
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
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const ml = StyleSheet.create({
  aiBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1,
               paddingHorizontal: 9, paddingVertical: 5 },
  dayRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: StyleSheet.hairlineWidth,
               paddingTop: 10, marginTop: 10 },
  dayLabel:  { fontSize: 13, fontWeight: '900', width: 36 },
  mealTypeTag:{ borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  grocItem:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1,
               padding: 10, marginTop: 6 },
  groceryRow:{ borderRadius: 14, borderWidth: 1, padding: 12, gap: 10, flexDirection: 'row', alignItems: 'flex-start' },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
               paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' },
});

const am = StyleSheet.create({
  modal:     { flex: 1 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
               borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB' },
  title:     { fontSize: 18, fontWeight: '900' },
  label:     { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  inp:       { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10,
               fontSize: 14, fontWeight: '600' },
  chip:      { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  footer:    { flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:   { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});
