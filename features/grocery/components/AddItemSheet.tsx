import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform, Keyboard, StyleSheet, TouchableOpacity,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useGroceryStore, GroceryItem } from '@/store/groceryStore';
import { CATEGORIES, CAT_EMOJI, QUICK_SUGGESTIONS } from './types';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';

// ─── Add Item Sheet ───────────────────────────────────────────────────────────

export function AddItemSheet({ visible, onClose, familyId, memberId, colors, isDark, editItem }: {
  visible: boolean; onClose: () => void;
  familyId: string; memberId: string;
  colors: any; isDark: boolean;
  editItem?: GroceryItem;
}) {
  const addItem = useGroceryStore(s => s.addItem);
  const pastStores = useGroceryStore(s => s.pastStores);
  const isEdit = !!editItem;

  const [name, setName]   = useState('');
  const [qty,  setQty]    = useState('');
  const [cat,  setCat]    = useState('');
  const [store, setStore] = useState('');
  const [storeFocused, setStoreFocused] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ name: string; cat: string; emoji: string }[]>(QUICK_SUGGESTIONS);
  const [aiLoading, setAiLoading] = useState(false);

  // Load personalised AI suggestions when sheet opens
  useEffect(() => {
    if (!visible || isEdit || !familyId) return;
    setAiLoading(true);
    supabase.functions.invoke('grocery-ai-suggest', { body: { familyId, limit: 16 } })
      .then(({ data }) => {
        if (data?.items?.length) {
          setAiSuggestions(data.items.map((i: any) => ({
            name: i.name,
            cat: i.category ?? 'Other',
            emoji: CAT_EMOJI[i.category] ?? '🛒',
          })));
        }
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [visible, familyId, isEdit]);

  // Populate fields when editing
  useEffect(() => {
    if (visible && editItem) {
      setName(editItem.name);
      setQty(editItem.quantity ?? '');
      setCat(editItem.category ?? '');
      setStore(editItem.storePreference ?? '');
      setNotes(editItem.notes ?? '');
    } else if (visible && !editItem) {
      setName(''); setQty(''); setCat(''); setStore(''); setNotes('');
    }
  }, [visible, editItem]);

  const reset = () => { setName(''); setQty(''); setCat(''); setStore(''); setNotes(''); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    if (isEdit && editItem) {
      await supabase.from('grocery_items').update({
        name: name.trim(),
        quantity: qty.trim() || null,
        category: cat || null,
        store_preference: store.trim() || null,
        notes: notes.trim() || null,
      }).eq('id', editItem.id);
    } else {
      await addItem({
        familyId, name: name.trim(), quantity: qty.trim() || undefined,
        category: cat || undefined, storePreference: store.trim() || undefined,
        addedBy: memberId, notes: notes.trim() || undefined,
      });
    }
    setSaving(false);
    reset();
    onClose();
  };

  const sheetBg = colors.card;
  const border  = colors.border;
  const inputBg = colors.surface;
  const P = colors.primary;

  // Filter suggestions by typed name
  const filteredSuggestions = name.trim().length > 0
    ? aiSuggestions.filter(s => s.name.toLowerCase().startsWith(name.toLowerCase()))
    : aiSuggestions;

  const dismiss = () => { Keyboard.dismiss(); onClose(); };

  // Same two sources AskCubeProposalCard's own store picker and
  // AddQuestGrocerySection's inline chips both pull from — real past runs
  // first (what this family actually shops at), the app's generic default
  // list filling in the rest. Filtered by typed text, own current value
  // excluded so it doesn't suggest re-picking what's already typed.
  const storePool = [...new Set([...pastStores, ...DEFAULT_GROCERY_STORES])];
  const storeSuggestions = storePool
    .filter(s => s.toLowerCase() !== store.trim().toLowerCase() && (store.trim().length === 0 || s.toLowerCase().includes(store.toLowerCase())))
    .slice(0, 8);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: sheetBg }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>
                  {isEdit ? 'Edit Item' : 'Add to List'}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: P }}>
                  {isEdit ? 'Update item details' : 'Type a name or tap a suggestion'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>
          {/* Name input */}
          <View style={{ backgroundColor: inputBg, borderRadius: 14, borderWidth: 1, borderColor: border,
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 10 }}>
            <Ionicons name="search-outline" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 12 }}
              placeholder="Item name (e.g. Atta, Milk, Turmeric)"
              placeholderTextColor={colors.textTertiary}
              value={name} onChangeText={setName} autoFocus
            />
            {name.length > 0 && (
              <Pressable onPress={() => setName('')}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* AI quick suggestions — hidden in edit mode */}
          {!isEdit && filteredSuggestions.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primaryLight,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9 }}>✨</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5 }}>
                  {aiLoading ? 'Loading suggestions…' : 'QUICK ADD'}
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {filteredSuggestions.slice(0, 14).map(sug => (
                    <Pressable key={sug.name} onPress={() => { setName(sug.name); setCat(sug.cat); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: name === sug.name ? P + '25' : colors.surface,
                        borderWidth: 1, borderColor: name === sug.name ? P : 'transparent' }}>
                      <Text style={{ fontSize: 15 }}>{sug.emoji}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: name === sug.name ? P : colors.textPrimary }}>
                        {sug.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Quantity + Store row */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1, backgroundColor: inputBg, borderRadius: 12, borderWidth: 1, borderColor: border,
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginRight: 6 }}>📦</Text>
              <TextInput
                style={{ flex: 1, fontSize: 14, color: colors.textPrimary, paddingVertical: 10 }}
                placeholder="Qty (2 kg, 1 doz…)"
                placeholderTextColor={colors.textTertiary}
                value={qty} onChangeText={setQty}
              />
            </View>
            <View style={{ flex: 1.3, backgroundColor: inputBg, borderRadius: 12, borderWidth: 1, borderColor: border,
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginRight: 6 }}>🏪</Text>
              <TextInput
                style={{ flex: 1, fontSize: 14, color: colors.textPrimary, paddingVertical: 10 }}
                placeholder="Store (optional)"
                placeholderTextColor={colors.textTertiary}
                value={store} onChangeText={setStore}
                onFocus={() => setStoreFocused(true)}
                onBlur={() => setStoreFocused(false)}
              />
            </View>
          </View>

          {/* Store suggestions — past-run stores + app defaults, filtered by
              typed text. Was plain free-text with no suggestions at all;
              a user had to remember/retype the exact same store name every
              time to keep grocery dedupe (name+store match) actually
              merging instead of splitting into near-duplicate rows. */}
          {storeFocused && storeSuggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, marginTop: -4 }}>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                {storeSuggestions.map(s => (
                  <Pressable key={s} onPress={() => setStore(s)}
                    style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
                      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 7, paddingVertical: 2 }}>
              {CATEGORIES.map(c => (
                <Pressable key={c} onPress={() => setCat(cat === c ? '' : c)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
                    backgroundColor: cat === c ? P : colors.surface,
                    borderWidth: 1, borderColor: cat === c ? P : 'transparent' }}>
                  <Text style={{ fontSize: 13 }}>{CAT_EMOJI[c] ?? '📦'}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: cat === c ? colors.textInverse : colors.textSecondary }}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Notes input */}
          <View style={{ backgroundColor: inputBg, borderRadius: 12, borderWidth: 1, borderColor: border,
            paddingHorizontal: 14, marginBottom: 16 }}>
            <TextInput
              style={{ fontSize: 14, color: colors.textPrimary, paddingVertical: 10, minHeight: 50 }}
              placeholder="Notes — e.g. organic only, from Patel's (optional)"
              placeholderTextColor={colors.textTertiary}
              value={notes} onChangeText={setNotes} multiline
            />
          </View>
            </ScrollView>

            {/* Sticky footer */}
            <View style={{ padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable onPress={handleSave} disabled={!name.trim() || saving}
                style={{ borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: (!name.trim() || saving) ? colors.textDisabled : P,
                  shadowColor: P, shadowOpacity: name.trim() ? 0.4 : 0, shadowRadius: 10, elevation: 4 }}>
                {saving
                  ? <ActivityIndicator color={colors.textInverse} size="small" />
                  : <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textInverse, letterSpacing: 0.3 }}>
                      {isEdit ? '✅ Save Changes' : '+ Add to List'}
                    </Text>}
              </Pressable>
            </View>

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
