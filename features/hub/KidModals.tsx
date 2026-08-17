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

import { useState, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Pressable, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useTheme } from '@/lib/ThemeContext';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { KidRequestItem } from '@/store/kidRequestStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { fmtDateTime, parseDbTime } from '@/lib/dates';

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

// "My driver hasn't arrived" — carries the ride's details so the parent's Action
// Needed card can show the situation at a glance instead of a bare sentence.
export const RIDE_LATE_PREFIX = 'RIDE_LATE:';

export interface RideLatePayload {
  eventId:   string;
  title:     string;
  time?:     string;   // scheduled pickup, "15:30"
  driver?:   string;   // assigned helper name
  location?: string;
  dropLocation?: string;
  sentAt:    string;   // ISO — how long the kid has been waiting
}

export function encodeRideLate(p: RideLatePayload) {
  return `${RIDE_LATE_PREFIX}${JSON.stringify(p)}`;
}
export function decodeRideLate(detail: string): RideLatePayload | null {
  if (!detail?.startsWith(RIDE_LATE_PREFIX)) return null;
  try { return JSON.parse(detail.slice(RIDE_LATE_PREFIX.length)); } catch { return null; }
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
  title:      { fontSize: TYPO.heading, fontWeight: '900' },
  label:      { fontSize: TYPO.caption, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6, marginTop: 8 },
  pill:       { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0 },
  submitBtn:  { borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
});

// ─── GroceryModal — multi-item (EventFormModal style) ────────────────────────

type GroceryLine = { name: string; qty: string; category: string; emoji: string };
const emptyLine = (): GroceryLine => ({ name: '', qty: '', category: 'Snacks', emoji: '🛒' });

export function GroceryModal({ visible, onClose, active }: {
  visible: boolean; onClose: () => void; active: FamilyMember;
}) {
  const { colors, isDark } = useTheme();
  const { sendRequest, requests, appendItems } = useKidRequestStore();

  const [lines,          setLines]          = useState<GroceryLine[]>([emptyLine()]);
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);
  const [focusedField,   setFocusedField]   = useState<'name' | null>(null);
  const [globalCat,      setGlobalCat]      = useState('Snacks');
  const [notes,          setNotes]          = useState('');

  const reset   = () => { setLines([emptyLine()]); setFocusedLineIdx(null); setFocusedField(null); setGlobalCat('Snacks'); setNotes(''); };
  const dismiss = () => { reset(); onClose(); };

  const validLines = lines.filter(l => l.name.trim());
  const canSubmit  = validLines.length > 0;

  const updateLine = (idx: number, patch: Partial<GroceryLine>) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) =>
    setLines(prev => prev.filter((_, i) => i !== idx));
  const addLine = () =>
    setLines(prev => [...prev, { ...emptyLine(), category: globalCat }]);

  const submit = () => {
    if (!canSubmit) return;
    const newItems: KidRequestItem[] = validLines.map((l, i) => ({
      id: `item-${Date.now()}-${i}`,
      name: l.name.trim(),
      qty: l.qty.trim(),
      category: l.category || globalCat,
      emoji: l.emoji,
      status: 'pending',
      requestedBy: active.id,
    }));
    // Append to existing pending grocery request if one exists
    const existing = requests.find(r =>
      r.fromMemberId === active.id && r.status === 'pending' &&
      r.type === 'delegation' && (r.items?.length ?? 0) > 0 &&
      !r.detail.startsWith(SUPPLIES_PREFIX)
    );
    if (existing) {
      appendItems(existing.id, newItems);
      dismiss();
      Alert.alert('Added! 🛒', `${newItems.length} item${newItems.length > 1 ? 's' : ''} added to your existing grocery request.`);
    } else {
      sendRequest({
        type: 'delegation',
        fromMemberId: active.id,
        urgency: 'normal',
        detail: encodeGroceryRequest({ name: validLines.map(l => l.name.trim()).join(', '), qty: '', category: 'Multi', notes: notes.trim() }),
        items: newItems,
      });
      dismiss();
      Alert.alert('Request sent! 🛒', `${newItems.length} item${newItems.length > 1 ? 's' : ''} sent to parent for approval.`);
    }
  };

  // Same input style as EventFormModal
  const gInput = {
    borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, marginBottom: 0,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={[f.sheet, { backgroundColor: colors.card }]}>
            <View style={[f.handle, { backgroundColor: colors.border }]} />
            <View style={f.header}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>🛒 Request Groceries</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: BRAND.teal }}>
                  {canSubmit ? `${validLines.length} item${validLines.length > 1 ? 's' : ''} · parent approves each one` : 'Parent approves before items are added'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}>
              {/* ── Category selector ── */}
              <Text style={[f.label, { color: colors.textSecondary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {GROCERY_CATEGORIES.map(c => {
                    const active2 = globalCat === c;
                    return (
                      <TouchableOpacity key={c} onPress={() => setGlobalCat(c)}
                        style={{ borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8,
                          alignItems: 'center', gap: 3, minWidth: 56,
                          backgroundColor: active2 ? BRAND.teal + '18' : (isDark ? colors.surface : '#F5F4FA'),
                          borderColor: active2 ? BRAND.teal : (isDark ? colors.border : '#E2E8F0') }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                          color: active2 ? BRAND.teal : colors.textSecondary }}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* ── Items list ── */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[f.label, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>Items list</Text>
                <TouchableOpacity onPress={addLine}
                  style={{ backgroundColor: BRAND.teal, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>+ Add item</Text>
                </TouchableOpacity>
              </View>

              {lines.length === 0 ? (
                <Pressable onPress={addLine}
                  style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.teal + '60', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: BRAND.teal, fontSize: 13 }}>+ Tap to add grocery items</Text>
                </Pressable>
              ) : (
                lines.map((line, idx) => {
                  // Identical to EventFormModal's newGroceryLines block
                  const q = line.name.trim().toLowerCase();
                  const nameSuggs = q
                    ? ALL_GROCERY_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q).slice(0, 8)
                    : ALL_GROCERY_SUGGESTIONS.filter(s => !globalCat || s.category === globalCat || globalCat === 'All').slice(0, 10);
                  const showNameSuggs = nameSuggs.length > 0;

                  return (
                    <View key={idx} style={{ marginBottom: 8 }}>
                      {/* Row 1: name + qty + delete */}
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <TextInput
                          style={[gInput, { flex: 2.5, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'name' ? BRAND.teal : colors.border, marginBottom: 0 }]}
                          placeholder="Item name" placeholderTextColor={colors.textTertiary}
                          value={line.name}
                          onChangeText={v => updateLine(idx, { name: v })}
                          onFocus={() => { setFocusedLineIdx(idx); setFocusedField('name'); }}
                          onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                        />
                        <TextInput
                          style={[gInput, { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 0 }]}
                          placeholder="Qty" placeholderTextColor={colors.textTertiary}
                          value={line.qty}
                          onChangeText={v => updateLine(idx, { qty: v })}
                        />
                        <Pressable onPress={() => removeLine(idx)} style={{ padding: 6 }}>
                          <Text style={{ fontSize: 16, color: colors.textTertiary }}>✕</Text>
                        </Pressable>
                      </View>
                      {/* Name suggestions — always visible */}
                      {showNameSuggs && (
                        <View style={{ marginBottom: 8 }}>
                          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontWeight: '700', marginBottom: 8, letterSpacing: 0.4 }}>
                            {q ? 'Matching — tap to fill' : 'Quick picks'}
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {nameSuggs.map(s => (
                                <Pressable key={s.name}
                                  onPress={() => updateLine(idx, { name: s.name, emoji: s.emoji, category: s.category })}
                                  style={{ backgroundColor: line.name === s.name ? BRAND.teal + '20' : (isDark ? colors.surface : '#F5F4FA'),
                                    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5,
                                    borderColor: line.name === s.name ? BRAND.teal : (isDark ? colors.border : '#E2E8F0') }}>
                                  <Text style={{ fontSize: TYPO.micro, color: line.name === s.name ? BRAND.teal : colors.textSecondary, fontWeight: '700' }}>
                                    {s.emoji} {s.name}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              {/* ── Notes ── */}
              <Text style={[f.label, { color: colors.textSecondary }]}>📝 Note for parent (optional)</Text>
              <TextInput
                style={[gInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, minHeight: 44, textAlignVertical: 'top' }]}
                placeholder="e.g. get the name-brand ones, not store brand"
                placeholderTextColor={colors.textTertiary}
                value={notes} onChangeText={setNotes} multiline
              />

              <TouchableOpacity onPress={submit} disabled={!canSubmit}
                style={[f.submitBtn, { marginTop: 16, backgroundColor: canSubmit ? BRAND.teal : (isDark ? '#2A2A3E' : '#E0E0F0') }]}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: canSubmit ? '#fff' : colors.textTertiary }}>
                  {canSubmit ? `Send ${validLines.length} item${validLines.length > 1 ? 's' : ''} to Parent →` : 'Add at least one item'}
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
  const { sendRequest, requests, appendItems: appendToRequest } = useKidRequestStore();

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
    const newItems: KidRequestItem[] = validItems.map((it, i) => ({
      id: `item-${Date.now()}-${i}`,
      name: it.name.trim(),
      qty: it.qty.trim(),
      category: 'Supplies',
      status: 'pending',
      requestedBy: active.id,
    }));
    // Append to existing pending supplies request if one exists
    const existing = requests.find(r =>
      r.fromMemberId === active.id && r.status === 'pending' &&
      r.type === 'delegation' && r.detail.startsWith(SUPPLIES_PREFIX)
    );
    if (existing) {
      appendToRequest(existing.id, newItems);
      dismiss();
      Alert.alert('Added! 📚', `${newItems.length} item${newItems.length > 1 ? 's' : ''} added to your existing supplies request.`);
    } else {
      sendRequest({
        type: 'delegation', fromMemberId: active.id, urgency,
        detail: `${SUPPLIES_PREFIX}${JSON.stringify({ items: validItems, notes: notes.trim(), urgency })}`,
        items: newItems,
      });
      dismiss();
      Alert.alert('Sent! 📚', `${newItems.length} item${newItems.length > 1 ? 's' : ''} sent to parent for approval.`);
    }
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
          <View style={[f.sheet, { backgroundColor: colors.card }]}>
            <View style={[f.handle, { backgroundColor: colors.border }]} />
            <View style={f.header}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>📚 School Supplies</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: '#6366F1' }}>
                  Parent approves and picks these up for you
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}>
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
                        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginBottom: 8, fontWeight: '700', letterSpacing: 0.4 }}>
                          {q ? 'Matching — tap to fill' : 'Quick picks'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {filtered.map(s => (
                              <TouchableOpacity key={s.name} onPress={() => updateItem(idx, 'name', s.name)}
                                style={[f.pill, {
                                  backgroundColor: item.name === s.name ? '#6366F120' : (isDark ? colors.surface : '#F5F4FA'),
                                  borderColor: item.name === s.name ? '#6366F1' : (isDark ? colors.border : '#E2E8F0'),
                                }]}>
                                <Text style={{ fontSize: TYPO.micro }}>{s.emoji}</Text>
                                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', marginLeft: 4,
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
                style={[f.submitBtn, { marginTop: 16, backgroundColor: canSubmit ? '#6366F1' : (isDark ? '#2A2A3E' : '#E0E0F0') }]}>
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

// ─── KidRequestHistoryModal ───────────────────────────────────────────────────

export function KidRequestHistoryModal({ visible, onClose, active }: {
  visible: boolean; onClose: () => void; active: FamilyMember;
}) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const { requests, deleteRequest } = useKidRequestStore();

  // Last 7 days only — older requests fall off automatically
  const myRequestsRecent = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return requests
      .filter(r => r.fromMemberId === active.id && parseDbTime(r.requestedAt).getTime() > cutoff)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [requests, active.id]);

  const HISTORY_FILTERS = [
    { key: 'all',      label: 'All' },
    { key: 'pending',  label: '⏳ Pending' },
    { key: 'approved', label: '✅ Approved' },
    { key: 'declined', label: '❌ Declined' },
  ] as const;
  type HistoryFilter = typeof HISTORY_FILTERS[number]['key'];
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  const myRequests = useMemo(() => {
    if (historyFilter === 'all') return myRequestsRecent;
    if (historyFilter === 'declined') return myRequestsRecent.filter(r => r.status === 'declined');
    return myRequestsRecent.filter(r => r.status === historyFilter);
  }, [myRequestsRecent, historyFilter]);

  const memberName = (id?: string) => members.find(m => m.id === id)?.name ?? id ?? '—';

  const statusColor = (s: string) =>
    s === 'approved' ? '#10B981' : s === 'rejected' || s === 'declined' ? '#EF4444' : s === 'partial' ? BRAND.amber : '#94A3B8';
  const statusLabel = (s: string) =>
    s === 'approved' ? '✓ Approved' : s === 'rejected' || s === 'declined' ? '✗ Rejected' : s === 'partial' ? '~ Partial' : s === 'pending' ? '⏳ Pending' : s === 'cancelled' ? '— Cancelled' : '✓ Done';
  const statusBg = (s: string) =>
    s === 'approved' ? '#10B98115' : s === 'rejected' || s === 'declined' ? '#EF444415' : s === 'partial' ? BRAND.amber + '15' : '#94A3B815';

  const itemStatusIcon = (s: string) => s === 'approved' ? '✅' : s === 'rejected' ? '❌' : '⏳';

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const formatTimeAgo = (respondedAt: string) => {
    const diffMins = Math.floor((Date.now() - new Date(respondedAt).getTime()) / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="📋 My Requests"
      subtitle={`${myRequestsRecent.length} request${myRequestsRecent.length !== 1 ? 's' : ''} in the last 7 days · tap to see item details`}
      accentColor={BRAND.purple}
      maxHeight="75%"
    >
            {/* Quick filter pills */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {HISTORY_FILTERS.map(f => (
                <TouchableOpacity key={f.key} onPress={() => setHistoryFilter(f.key)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                    backgroundColor: historyFilter === f.key ? BRAND.purple : (isDark ? colors.surface : '#F1F5F9'),
                    borderColor: historyFilter === f.key ? BRAND.purple : (isDark ? colors.border : '#E2E8F0') }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                    color: historyFilter === f.key ? '#fff' : colors.textSecondary }}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {myRequests.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🛒</Text>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                  {historyFilter === 'all' ? 'No requests yet' : `No ${historyFilter} requests`}
                </Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4 }}>
                  {historyFilter === 'all'
                    ? 'Use the Grocery or Supplies buttons to ask for things!'
                    : 'in the last 7 days'}
                </Text>
              </View>
            ) : myRequests.map(req => {
              const isExpanded  = expanded.has(req.id);
              const isSupplies  = req.detail.startsWith(SUPPLIES_PREFIX);
              const isGrocery   = req.type === 'delegation' && !isSupplies;
              const hasItems    = (req.items?.length ?? 0) > 0;
              const approvedCount = req.items?.filter(i => i.status === 'approved').length ?? 0;
              const rejectedCount = req.items?.filter(i => i.status === 'rejected').length ?? 0;
              const pendingCount  = req.items?.filter(i => i.status === 'pending').length ?? 0;

              // Decode supplies detail for display
              const suppliesDetail = isSupplies ? (() => {
                try {
                  const p = JSON.parse(req.detail.slice(SUPPLIES_PREFIX.length));
                  const names = (p.items as { name: string }[]).map(i => i.name).join(', ');
                  return names || req.detail;
                } catch { return req.detail; }
              })() : req.detail;

              return (
                <TouchableOpacity key={req.id} onPress={() => hasItems ? toggle(req.id) : undefined}
                  activeOpacity={hasItems ? 0.7 : 1}
                  style={{
                    borderRadius: 14, borderWidth: 1.5, marginBottom: 10,
                    backgroundColor: statusBg(req.status),
                    borderColor: statusColor(req.status) + '40',
                  }}>
                  {/* Request header row */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: colors.textPrimary }}>
                          {isGrocery ? '🛒 Grocery' : isSupplies ? '📚 Supplies' : req.type === 'delegation' ? '📋 Request' : req.type === 'checkin' ? '🎒 Check-in' : req.type === 'question' ? '❓ Question' : req.type === 'medication' ? '💊 Medical' : req.type === 'tutor' ? '🎒 Tutor Offer' : req.type === 'cheer' ? '✋ Cheer' : req.type === 'ride' ? '🚗 Ride' : '🔓 Permission'}
                          {hasItems ? ` · ${req.items!.length} item${req.items!.length > 1 ? 's' : ''}` : ''}
                        </Text>
                        <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2,
                          backgroundColor: statusColor(req.status) + '20' }}>
                          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: statusColor(req.status) }}>
                            {statusLabel(req.status)}
                          </Text>
                        </View>
                      </View>

                      {hasItems && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                          {approvedCount > 0 && <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: '#10B981' }}>✅ {approvedCount} approved</Text>}
                          {rejectedCount > 0 && <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: '#EF4444' }}>❌ {rejectedCount} rejected</Text>}
                          {pendingCount  > 0 && <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: '#94A3B8' }}>⏳ {pendingCount} waiting</Text>}
                        </View>
                      )}

                      {!hasItems && (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 3, lineHeight: 18 }} numberOfLines={3}>
                          {suppliesDetail}
                        </Text>
                      )}

                      <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 5 }}>
                        {fmtDateTime(req.requestedAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      {hasItems && (
                        <Text style={{ fontSize: 16, color: colors.textTertiary, marginTop: 2 }}>
                          {isExpanded ? '▲' : '▼'}
                        </Text>
                      )}
                      {req.status === 'pending' && (
                        <TouchableOpacity
                          onPress={() => Alert.alert('Remove request?', 'This will delete your request.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteRequest(req.id) },
                          ])}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ padding: 4, borderRadius: 8, backgroundColor: '#EF444415' }}>
                          <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Parent reply section */}
                  {req.respondedAt && (req.respondedBy || req.parentNote) && (
                    <View style={{ borderTopWidth: 1, borderTopColor: statusColor(req.status) + '30', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: isDark ? colors.surface : '#fff', borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: statusColor(req.status) }}>
                        <Text style={{ fontSize: 18, marginTop: 1 }}>{req.status === 'approved' ? '✅' : req.status === 'declined' ? '❌' : '💬'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: statusColor(req.status), marginBottom: 2 }}>
                            Parent Reply {req.respondedBy && `· ${memberName(req.respondedBy)}`}
                          </Text>
                          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: req.parentNote ? 4 : 0 }}>
                            {req.status === 'approved' ? '✓ Approved' : req.status === 'declined' ? '✗ Declined' : 'Replied'} · {formatTimeAgo(req.respondedAt)}
                          </Text>
                          {req.parentNote && (
                            <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary, lineHeight: 18, fontStyle: 'italic' }}>
                              "{req.parentNote}"
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Per-item detail — expandable */}
                  {isExpanded && req.items && (
                    <View style={{ borderTopWidth: 1, borderTopColor: statusColor(req.status) + '30', paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8, gap: 6 }}>
                      {req.items.map((item, i) => (
                        <View key={item.id} style={{
                          flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, paddingHorizontal: 10,
                          borderRadius: 10, backgroundColor: isDark ? colors.surface : '#fff',
                          borderWidth: 1, borderColor: statusColor(item.status) + '40',
                        }}>
                          <Text style={{ fontSize: 18, marginTop: 1 }}>{itemStatusIcon(item.status)}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                              {item.emoji ? `${item.emoji} ` : ''}{item.name}
                              {item.qty ? <Text style={{ fontWeight: '400', color: colors.textSecondary }}> × {item.qty}</Text> : null}
                            </Text>
                            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>{item.category}</Text>
                            {item.parentNote && (
                              <Text style={{ fontSize: TYPO.label, fontStyle: 'italic', color: statusColor(item.status), marginTop: 2 }}>
                                "{item.parentNote}"
                              </Text>
                            )}
                            {item.approvedBy && (
                              <Text style={{ fontSize: TYPO.micro, color: '#10B981', marginTop: 2 }}>
                                Approved by {memberName(item.approvedBy)}
                                {item.approvedAt ? ` · ${fmtDateTime(item.approvedAt)}` : ''}
                              </Text>
                            )}
                            {item.rejectedBy && (
                              <Text style={{ fontSize: TYPO.micro, color: '#EF4444', marginTop: 2 }}>
                                Rejected by {memberName(item.rejectedBy)}
                                {item.rejectedAt ? ` · ${fmtDateTime(item.rejectedAt)}` : ''}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))}
                      {req.parentNote && (
                        <View style={{ borderRadius: 8, padding: 8, backgroundColor: BRAND.purple + '15', marginTop: 4 }}>
                          <Text style={{ fontSize: TYPO.micro, color: BRAND.purple, fontStyle: 'italic' }}>
                            📝 Parent note: "{req.parentNote}"
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
    </AppBottomSheet>
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={[f.sheet, { backgroundColor: colors.card }]}>
            <View style={[f.handle, { backgroundColor: colors.border }]} />
            <View style={f.header}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>{meta.emoji} {meta.label}</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: meta.accent }}>
                  Sent directly to your parent
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                style={{
                  borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
                  fontSize: 15, color: colors.textPrimary,
                  backgroundColor: isDark ? colors.surface : '#F9FAFB',
                  borderColor: text.trim() ? meta.accent + '80' : colors.border,
                  minHeight: 120, textAlignVertical: 'top',
                }}
                placeholder={meta.hint}
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={5}
              />
              <TouchableOpacity onPress={submit} disabled={!text.trim()}
                style={[f.submitBtn, { marginTop: 16, backgroundColor: text.trim() ? meta.accent : (isDark ? '#2A2A3E' : '#E0E0F0') }]}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: text.trim() ? '#fff' : colors.textTertiary }}>
                  Send to Parent →
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
