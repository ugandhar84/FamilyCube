/**
 * KidModals — standalone kid-facing request bottom sheets.
 *
 * Structure mirrors EventFormModal exactly:
 *   Modal > KeyboardAvoidingView > backdrop View >
 *     TouchableOpacity (dismiss) + sheet View
 *       fixed header (outside ScrollView)
 *       ScrollView keyboardShouldPersistTaps="always"
 *         form fields + suggestion chips (TouchableOpacity, never Pressable)
 *
 * Suggestions are ALWAYS visible (never gated on focus state) so that
 * onBlur from the TextInput never hides chips before onPress fires.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Modal, KeyboardAvoidingView, Platform, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { FamilyMember } from '@/store/familyStore';

// ─── Encoding helpers (re-exported so HelpDispatchQueue can import them) ──────

export const GROCERY_PREFIX = 'GROCERY_REQUEST:';
export const SUPPLIES_PREFIX = 'SUPPLIES_REQUEST:';

export function encodeGroceryRequest(p: { name: string; qty: string; category: string; notes: string }) {
  return `${GROCERY_PREFIX}${JSON.stringify(p)}`;
}
export function decodeGroceryRequest(detail: string): { name: string; qty: string; category: string; notes: string } | null {
  if (!detail.startsWith(GROCERY_PREFIX)) return null;
  try { return JSON.parse(detail.slice(GROCERY_PREFIX.length)); } catch { return null; }
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const GROCERY_CATEGORIES = ['Snacks', 'Produce', 'Dairy & Eggs', 'Pantry', 'Frozen', 'Bakery', 'Household', 'Other'];

const ALL_GROCERY_SUGGESTIONS: { name: string; emoji: string; category: string }[] = [
  // Snacks
  { name: 'Oreos',               emoji: '🍪', category: 'Snacks' },
  { name: 'Chips',               emoji: '🍟', category: 'Snacks' },
  { name: 'Fruit Snacks',        emoji: '🍬', category: 'Snacks' },
  { name: 'Granola Bars',        emoji: '🌾', category: 'Snacks' },
  { name: 'Popcorn',             emoji: '🍿', category: 'Snacks' },
  { name: 'String Cheese',       emoji: '🧀', category: 'Snacks' },
  { name: 'Gummy Bears',         emoji: '🐻', category: 'Snacks' },
  { name: 'Goldfish',            emoji: '🐠', category: 'Snacks' },
  { name: 'Pretzels',            emoji: '🥨', category: 'Snacks' },
  { name: 'Cheez-Its',           emoji: '🧆', category: 'Snacks' },
  { name: 'Animal Crackers',     emoji: '🦁', category: 'Snacks' },
  { name: 'Crackers',            emoji: '🍘', category: 'Snacks' },
  { name: 'Trail Mix',           emoji: '🌰', category: 'Snacks' },
  { name: 'Veggie Straws',       emoji: '🌿', category: 'Snacks' },
  { name: 'Doritos',             emoji: '🔺', category: 'Snacks' },
  { name: 'Pringles',            emoji: '🥫', category: 'Snacks' },
  { name: 'Rice Cakes',          emoji: '⭕', category: 'Snacks' },
  { name: 'Hummus',              emoji: '🫘', category: 'Snacks' },
  { name: 'Nutella',             emoji: '🍫', category: 'Snacks' },
  { name: 'Fruit Roll-Ups',      emoji: '🌀', category: 'Snacks' },
  { name: 'SunChips',            emoji: '☀️', category: 'Snacks' },
  { name: 'Peanut Butter Cups',  emoji: '🥜', category: 'Snacks' },
  // Produce
  { name: 'Apples',              emoji: '🍎', category: 'Produce' },
  { name: 'Bananas',             emoji: '🍌', category: 'Produce' },
  { name: 'Grapes',              emoji: '🍇', category: 'Produce' },
  { name: 'Strawberries',        emoji: '🍓', category: 'Produce' },
  { name: 'Blueberries',         emoji: '🫐', category: 'Produce' },
  { name: 'Watermelon',          emoji: '🍉', category: 'Produce' },
  { name: 'Oranges',             emoji: '🍊', category: 'Produce' },
  { name: 'Carrots',             emoji: '🥕', category: 'Produce' },
  { name: 'Cucumber',            emoji: '🥒', category: 'Produce' },
  { name: 'Cherry Tomatoes',     emoji: '🍅', category: 'Produce' },
  { name: 'Mangoes',             emoji: '🥭', category: 'Produce' },
  { name: 'Peaches',             emoji: '🍑', category: 'Produce' },
  { name: 'Pineapple',           emoji: '🍍', category: 'Produce' },
  // Dairy & Eggs
  { name: 'Chocolate Milk',      emoji: '🍫', category: 'Dairy & Eggs' },
  { name: 'Gogurt',              emoji: '🥛', category: 'Dairy & Eggs' },
  { name: 'Yogurt',              emoji: '🫙', category: 'Dairy & Eggs' },
  { name: 'Cheese Sticks',       emoji: '🧀', category: 'Dairy & Eggs' },
  { name: 'Eggs',                emoji: '🥚', category: 'Dairy & Eggs' },
  { name: 'Butter',              emoji: '🧈', category: 'Dairy & Eggs' },
  { name: 'Cream Cheese',        emoji: '🧀', category: 'Dairy & Eggs' },
  // Pantry
  { name: 'Peanut Butter',       emoji: '🥜', category: 'Pantry' },
  { name: 'Jelly',               emoji: '🫙', category: 'Pantry' },
  { name: 'Syrup',               emoji: '🍯', category: 'Pantry' },
  { name: 'Mac & Cheese',        emoji: '🧀', category: 'Pantry' },
  { name: 'Cereal',              emoji: '🥣', category: 'Pantry' },
  { name: 'Oatmeal',             emoji: '🥣', category: 'Pantry' },
  { name: 'Pancake Mix',         emoji: '🥞', category: 'Pantry' },
  { name: 'Ketchup',             emoji: '🍅', category: 'Pantry' },
  { name: 'Apple Juice',         emoji: '🧃', category: 'Pantry' },
  { name: 'Orange Juice',        emoji: '🍊', category: 'Pantry' },
  { name: 'Lemonade',            emoji: '🍋', category: 'Pantry' },
  { name: 'Capri Sun',           emoji: '🧃', category: 'Pantry' },
  { name: 'Sports Drink',        emoji: '🏃', category: 'Pantry' },
  // Frozen
  { name: 'Ice Cream',           emoji: '🍦', category: 'Frozen' },
  { name: 'Waffles',             emoji: '🧇', category: 'Frozen' },
  { name: 'Frozen Pizza',        emoji: '🍕', category: 'Frozen' },
  { name: 'Popsicles',           emoji: '🧊', category: 'Frozen' },
  { name: 'Chicken Nuggets',     emoji: '🍗', category: 'Frozen' },
  { name: 'Fish Sticks',         emoji: '🐟', category: 'Frozen' },
  { name: 'Tater Tots',          emoji: '🥔', category: 'Frozen' },
  // Bakery
  { name: 'Bread',               emoji: '🍞', category: 'Bakery' },
  { name: 'Bagels',              emoji: '🥯', category: 'Bakery' },
  { name: 'Muffins',             emoji: '🧁', category: 'Bakery' },
  { name: 'Donuts',              emoji: '🍩', category: 'Bakery' },
  { name: 'Cookies',             emoji: '🍪', category: 'Bakery' },
  // Household
  { name: 'Paper Towels',        emoji: '🧻', category: 'Household' },
  { name: 'Dish Soap',           emoji: '🧴', category: 'Household' },
  { name: 'Shampoo',             emoji: '🚿', category: 'Household' },
  { name: 'Toothpaste',          emoji: '🪥', category: 'Household' },
  { name: 'Hand Soap',           emoji: '🧼', category: 'Household' },
  { name: 'Toilet Paper',        emoji: '🧻', category: 'Household' },
  { name: 'Trash Bags',          emoji: '🗑️', category: 'Household' },
  { name: 'Ziploc Bags',         emoji: '📦', category: 'Household' },
];

const QTY_PICKS = ['1', '2', '3', '6', '1 pack', '1 box', '1 bag', '1 bottle', '1 dozen', '1 lb'];

const SUPPLIES_SUGGESTIONS: { name: string; emoji: string }[] = [
  { name: 'Pencils',             emoji: '✏️' },
  { name: 'Pens',                emoji: '🖊️' },
  { name: 'Eraser',              emoji: '🧹' },
  { name: 'Notebook',            emoji: '📓' },
  { name: 'Composition Book',    emoji: '📔' },
  { name: 'Spiral Notebook',     emoji: '🗒️' },
  { name: 'Folder',              emoji: '📁' },
  { name: 'Binder',              emoji: '📒' },
  { name: 'Glue Stick',          emoji: '🖇️' },
  { name: 'Scissors',            emoji: '✂️' },
  { name: 'Markers',             emoji: '🖍️' },
  { name: 'Crayons',             emoji: '🖍️' },
  { name: 'Ruler',               emoji: '📏' },
  { name: 'Protractor',          emoji: '📐' },
  { name: 'Highlighters',        emoji: '✨' },
  { name: 'Index Cards',         emoji: '🗂️' },
  { name: 'Colored Pencils',     emoji: '🎨' },
  { name: 'Calculator',          emoji: '🔢' },
  { name: 'Compass',             emoji: '🧭' },
  { name: 'Pencil Case',         emoji: '🎒' },
  { name: 'Backpack',            emoji: '🎒' },
  { name: 'Tape',                emoji: '📦' },
  { name: 'Stapler',             emoji: '📌' },
  { name: 'Paper Clips',         emoji: '📎' },
  { name: 'Sticky Notes',        emoji: '🗒️' },
  { name: 'White-Out',           emoji: '🔵' },
  { name: 'Pencil Sharpener',    emoji: '✏️' },
  { name: 'Flash Cards',         emoji: '🃏' },
  { name: 'Graph Paper',         emoji: '📊' },
  { name: 'Construction Paper',  emoji: '🎨' },
  { name: 'Watercolors',         emoji: '🎨' },
  { name: 'Poster Board',        emoji: '🖼️' },
  { name: 'Science Goggles',     emoji: '🥽' },
  { name: 'Earbuds',             emoji: '🎧' },
  { name: 'USB Drive',           emoji: '💾' },
];

// ─── Shared sheet shell styles (same dimensions as EventFormModal) ────────────

const f = StyleSheet.create({
  backdrop:   { flex: 1, justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 0, maxHeight: '75%' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 14 },
  title:      { fontSize: 17, fontWeight: '900' },
  label:      { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6, marginTop: 8 },
  pill:       { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0 },
  submitBtn:  { borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
});

// ─── GroceryModal ─────────────────────────────────────────────────────────────

export function GroceryModal({ visible, onClose, active }: {
  visible: boolean; onClose: () => void; active: FamilyMember;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest } = useKidRequestStore();

  const [name,  setName]  = useState('');
  const [qty,   setQty]   = useState('');
  const [cat,   setCat]   = useState('Snacks');
  const [notes, setNotes] = useState('');

  const reset   = () => { setName(''); setQty(''); setCat('Snacks'); setNotes(''); };
  const dismiss = () => { reset(); onClose(); };
  const canSubmit = name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    sendRequest({
      type: 'delegation', fromMemberId: active.id, urgency: 'normal',
      detail: encodeGroceryRequest({ name: name.trim(), qty: qty.trim(), category: cat, notes: notes.trim() }),
    });
    dismiss();
    Alert.alert('Request sent! 🛒', `"${name.trim()}" sent to parent for approval.`);
  };

  // Suggestions always visible — never gated on focus so chips can't disappear before onPress fires
  const nameSuggestions = name.trim()
    ? ALL_GROCERY_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 20)
    : ALL_GROCERY_SUGGESTIONS.slice(0, 20);

  const inp = {
    borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: colors.textPrimary,
    backgroundColor: isDark ? colors.surface : '#F9FAFB',
    borderColor: colors.border,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          {/* Tap above sheet to dismiss */}
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />

          <View style={[f.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[f.handle, { backgroundColor: colors.border }]} />

            {/* Fixed header — stays above ScrollView */}
            <View style={f.header}>
              <View style={{ flex: 1 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>🛒 Request Grocery Item</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '600', marginTop: 2, color: BRAND.teal }}>
                  Parent approves before it's added to the list
                </Text>
              </View>
              <TouchableOpacity onPress={dismiss} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable form */}
            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}>

              {/* Item name */}
              <Text style={[f.label, { color: colors.textSecondary }]}>What do you need? *</Text>
              <TextInput value={name} onChangeText={setName} style={inp}
                placeholder="Type to search or pick below…" placeholderTextColor={colors.textTertiary}
                returnKeyType="next" autoFocus />
              {nameSuggestions.length > 0 && (
                <View style={{ marginTop: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 6, fontWeight: '600' }}>
                    {name.trim() ? 'Matching — tap to fill' : 'Quick picks'}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                    <View style={{ flexDirection: 'row', gap: 7 }}>
                      {nameSuggestions.map(s => (
                        <TouchableOpacity key={s.name} onPress={() => { setName(s.name); setCat(s.category); }}
                          style={[f.pill, {
                            backgroundColor: name === s.name ? BRAND.teal + '20' : (isDark ? colors.surface : '#F5F4FA'),
                            borderColor: name === s.name ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                          }]}>
                          <Text style={{ fontSize: TYPO.label }}>{s.emoji}</Text>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginLeft: 4,
                            color: name === s.name ? BRAND.teal : colors.textSecondary }} numberOfLines={1}>{s.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Quantity */}
              <Text style={[f.label, { color: colors.textSecondary }]}>Quantity / Amount</Text>
              <TextInput value={qty} onChangeText={setQty} style={inp}
                placeholder="e.g. 2 boxes, 1 pack…" placeholderTextColor={colors.textTertiary}
                returnKeyType="next" />
              <View style={{ marginTop: 8, marginBottom: 4 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {QTY_PICKS.map(q => (
                      <TouchableOpacity key={q} onPress={() => setQty(q)}
                        style={[f.pill, {
                          backgroundColor: qty === q ? BRAND.amber + '20' : (isDark ? colors.surface : '#F5F4FA'),
                          borderColor: qty === q ? BRAND.amber : (isDark ? colors.border : '#E2E8F0'),
                        }]}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                          color: qty === q ? BRAND.amber : colors.textSecondary }}>{q}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Category */}
              <Text style={[f.label, { color: colors.textSecondary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
                style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {GROCERY_CATEGORIES.map(c => (
                    <TouchableOpacity key={c} onPress={() => setCat(c)}
                      style={[f.pill, {
                        backgroundColor: cat === c ? BRAND.teal + '20' : (isDark ? colors.surface : '#F5F4FA'),
                        borderColor: cat === c ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                      }]}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                        color: cat === c ? BRAND.teal : colors.textSecondary }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Note */}
              <Text style={[f.label, { color: colors.textSecondary }]}>Note for parent (optional)</Text>
              <TextInput value={notes} onChangeText={setNotes} style={[inp, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="e.g. the blue pack, not red" placeholderTextColor={colors.textTertiary} multiline />

              {/* Submit */}
              <TouchableOpacity onPress={submit} disabled={!canSubmit}
                style={[f.submitBtn, { backgroundColor: canSubmit ? BRAND.teal : (isDark ? '#2A2A3E' : '#E0E0F0'), marginTop: 12 }]}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: canSubmit ? '#fff' : colors.textTertiary }}>
                  Send to Parent for Approval →
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── SuppliesModal ────────────────────────────────────────────────────────────

export function SuppliesModal({ visible, onClose, active }: {
  visible: boolean; onClose: () => void; active: FamilyMember;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest } = useKidRequestStore();

  const [items,   setItems]   = useState<{ name: string; qty: string }[]>([{ name: '', qty: '' }]);
  const [urgency, setUrgency] = useState<'normal' | 'soon'>('normal');
  const [notes,   setNotes]   = useState('');

  const reset   = () => { setItems([{ name: '', qty: '' }]); setUrgency('normal'); setNotes(''); };
  const dismiss = () => { reset(); onClose(); };
  const validItems = items.filter(i => i.name.trim());
  const canSubmit  = validItems.length > 0;

  const updateItem = (idx: number, field: 'name' | 'qty', val: string) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  const addRow    = () => setItems(prev => [...prev, { name: '', qty: '' }]);
  const removeRow = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const submit = () => {
    if (!canSubmit) return;
    sendRequest({
      type: 'delegation', fromMemberId: active.id, urgency,
      detail: `${SUPPLIES_PREFIX}${JSON.stringify({ items: validItems, notes: notes.trim(), urgency })}`,
    });
    dismiss();
    Alert.alert('Sent! 📚', `${validItems.length} item${validItems.length > 1 ? 's' : ''} sent to parent for approval.`);
  };

  const inp = {
    borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: colors.textPrimary,
    backgroundColor: isDark ? colors.surface : '#F9FAFB',
    borderColor: colors.border,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />

          <View style={[f.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[f.handle, { backgroundColor: colors.border }]} />

            {/* Fixed header */}
            <View style={f.header}>
              <View style={{ flex: 1 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>📚 School Supplies</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '600', marginTop: 2, color: '#6366F1' }}>
                  Parent approves and picks these up for you
                </Text>
              </View>
              <TouchableOpacity onPress={dismiss} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}>

              {/* Urgency */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {(['normal', 'soon'] as const).map(u => (
                  <TouchableOpacity key={u} onPress={() => setUrgency(u)}
                    style={{ flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5,
                      backgroundColor: urgency === u ? (u === 'soon' ? '#EF444418' : '#6366F118') : (isDark ? colors.surface : '#F5F4FA'),
                      borderColor: urgency === u ? (u === 'soon' ? '#EF4444' : '#6366F1') : (isDark ? colors.border : '#E2E8F0') }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                      color: urgency === u ? (u === 'soon' ? '#EF4444' : '#6366F1') : colors.textSecondary }}>
                      {u === 'soon' ? '🔴 Need Soon' : '📋 No Rush'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Per-row items with per-row filtered suggestions — always visible */}
              <Text style={[f.label, { color: colors.textSecondary }]}>Items needed *</Text>
              {items.map((item, idx) => {
                const q = item.name.trim().toLowerCase();
                const filtered = q
                  ? SUPPLIES_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(q) && !items.some((it, ii) => ii !== idx && it.name === s.name))
                  : SUPPLIES_SUGGESTIONS.filter(s => !items.some((it, ii) => ii !== idx && it.name === s.name)).slice(0, 18);
                return (
                  <View key={idx} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TextInput value={item.name} onChangeText={v => updateItem(idx, 'name', v)}
                        placeholder={`Item ${idx + 1} — type or pick below`}
                        placeholderTextColor={colors.textTertiary}
                        returnKeyType="next"
                        style={[inp, { flex: 2 }]}
                      />
                      <TextInput value={item.qty} onChangeText={v => updateItem(idx, 'qty', v)}
                        placeholder="Qty" placeholderTextColor={colors.textTertiary}
                        style={[inp, { flex: 1 }]} />
                      {items.length > 1 && (
                        <TouchableOpacity onPress={() => removeRow(idx)} style={{ padding: 6 }}>
                          <Text style={{ fontSize: 18, color: '#EF4444' }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {filtered.length > 0 && (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 6, fontWeight: '600' }}>
                          {q ? 'Matching — tap to fill' : 'Quick picks'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                          <View style={{ flexDirection: 'row', gap: 7 }}>
                            {filtered.map(s => (
                              <TouchableOpacity key={s.name} onPress={() => updateItem(idx, 'name', s.name)}
                                style={[f.pill, {
                                  backgroundColor: item.name === s.name ? '#6366F120' : (isDark ? colors.surface : '#F5F4FA'),
                                  borderColor: item.name === s.name ? '#6366F1' : (isDark ? colors.border : '#E2E8F0'),
                                }]}>
                                <Text style={{ fontSize: TYPO.label }}>{s.emoji}</Text>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginLeft: 4,
                                  color: item.name === s.name ? '#6366F1' : colors.textSecondary }} numberOfLines={1}>{s.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    )}
                  </View>
                );
              })}
              <TouchableOpacity onPress={addRow}
                style={{ borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#6366F150', paddingVertical: 10, alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#6366F1' }}>+ Add another item</Text>
              </TouchableOpacity>

              {/* Note */}
              <Text style={[f.label, { color: colors.textSecondary }]}>Note for parent (optional)</Text>
              <TextInput value={notes} onChangeText={setNotes}
                style={[inp, { minHeight: 56, textAlignVertical: 'top' }]}
                placeholder="e.g. for science project due Friday"
                placeholderTextColor={colors.textTertiary} multiline />

              <TouchableOpacity onPress={submit} disabled={!canSubmit}
                style={[f.submitBtn, { backgroundColor: canSubmit ? '#6366F1' : (isDark ? '#2A2A3E' : '#E0E0F0'), marginTop: 12 }]}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: canSubmit ? '#fff' : colors.textTertiary }}>
                  Send to Parent ({validItems.length} item{validItems.length !== 1 ? 's' : ''}) →
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── AskModal ─────────────────────────────────────────────────────────────────

const ASK_META = {
  permission: { emoji: '🔓', label: 'Ask Permission',  hint: "e.g. Can I go to Jake's house?",          accent: BRAND.purple },
  question:   { emoji: '❓', label: 'Ask a Question',   hint: 'e.g. Can you bring money for the field trip?', accent: '#3B82F6' },
  medication: { emoji: '💊', label: 'Medication Alert', hint: "e.g. I didn't take my morning pill yet",   accent: '#EF4444' },
} as const;

export function AskModal({ visible, onClose, type, active }: {
  visible: boolean; onClose: () => void;
  type: keyof typeof ASK_META; active: FamilyMember;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest } = useKidRequestStore();
  const [text, setText] = useState('');

  const meta    = ASK_META[type];
  const dismiss = () => { setText(''); onClose(); };
  const submit  = () => {
    if (!text.trim()) return;
    sendRequest({ type, fromMemberId: active.id, detail: text.trim(), urgency: type === 'medication' ? 'urgent' : 'normal' });
    dismiss();
    Alert.alert('Sent! 👋', 'Your parent has been notified.');
  };

  const inp = {
    borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: colors.textPrimary,
    backgroundColor: isDark ? colors.surface : '#F9FAFB',
    borderColor: colors.border,
    minHeight: 90, textAlignVertical: 'top' as const,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />

          <View style={[f.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[f.handle, { backgroundColor: colors.border }]} />

            {/* Fixed header */}
            <View style={f.header}>
              <View style={{ flex: 1 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>{meta.emoji} {meta.label}</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '600', marginTop: 2, color: meta.accent }}>
                  Sent directly to your parent
                </Text>
              </View>
              <TouchableOpacity onPress={dismiss} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? colors.surface : '#F1F5F9' }}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingBottom: 8 }}>
              <TextInput value={text} onChangeText={setText} style={inp}
                placeholder={meta.hint} placeholderTextColor={colors.textTertiary}
                autoFocus multiline numberOfLines={4} />
              <TouchableOpacity onPress={submit} disabled={!text.trim()}
                style={[f.submitBtn, { backgroundColor: text.trim() ? meta.accent : (isDark ? '#2A2A3E' : '#E0E0F0'), marginTop: 12 }]}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: text.trim() ? '#fff' : colors.textTertiary }}>
                  Send to Parent →
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
