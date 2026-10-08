import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  Keyboard, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useGroceryStore, GroceryItem } from '@/store/groceryStore';
import { CATEGORIES, CAT_EMOJI, QUICK_SUGGESTIONS, guessCategory } from './types';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { showToast } from '@/components/AppToast';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';

// ─── Add Item Sheet ───────────────────────────────────────────────────────────

export function AddItemSheet({ visible, onClose, familyId, memberId, colors, isDark, editItem }: {
  visible: boolean; onClose: () => void;
  familyId: string; memberId: string;
  colors: any; isDark: boolean;
  editItem?: GroceryItem;
}) {
  const addItem = useGroceryStore(s => s.addItem);
  const pastStores = useGroceryStore(s => s.pastStores);
  const pastItemNames = useGroceryStore(s => s.pastItemNames);
  const isEdit = !!editItem;
  const nameRef = useRef<TextInput>(null);

  const [name, setName]   = useState('');
  const [qty,  setQty]    = useState('');
  const [cat,  setCat]    = useState('');
  const [store, setStore] = useState('');
  const [storeFocused, setStoreFocused] = useState(false);
  const [notes, setNotes] = useState('');
  // Was a plain `saving` state — a fast double-tap could fire this twice,
  // adding the same grocery item twice [live-requested app-wide: "We
  // should avoid double tab submit for all the app wide"].
  const { submitting: saving, guard } = useSubmitGuard();
  const [aiSuggestions, setAiSuggestions] = useState<{ name: string; cat: string; emoji: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Build suggestion pills: staples from grocery_staples table + pastItemNames fallback
  useEffect(() => {
    if (!visible || isEdit || !familyId) return;

    // Seed immediately from pastItemNames (zero latency) so pills appear at once
    const fromHistory = pastItemNames.slice(0, 20).map(n => ({
      name: n,
      cat: guessCategory(n),
      emoji: CAT_EMOJI[guessCategory(n)] ?? '🛒',
    }));
    // Merge with QUICK_SUGGESTIONS for any gaps
    const seenNames = new Set(fromHistory.map(s => s.name.toLowerCase()));
    const merged = [
      ...fromHistory,
      ...QUICK_SUGGESTIONS.filter(s => !seenNames.has(s.name.toLowerCase())),
    ];
    setAiSuggestions(merged);

    // Then enrich with grocery_staples (sorted by most-bought)
    setAiLoading(true);
    Promise.resolve(
      supabase
        .from('grocery_staples')
        .select('name, category, times_bought')
        .eq('family_id', familyId)
        .order('times_bought', { ascending: false })
        .limit(20)
    ).then(({ data }) => {
      if (data?.length) {
        const fromStaples = data.map((s: any) => ({
          name: s.name,
          cat: s.category ?? guessCategory(s.name),
          emoji: CAT_EMOJI[s.category ?? guessCategory(s.name)] ?? '🛒',
        }));
        const stapleNames = new Set(fromStaples.map((s: any) => s.name.toLowerCase()));
        setAiSuggestions([
          ...fromStaples,
          ...merged.filter(s => !stapleNames.has(s.name.toLowerCase())),
        ]);
      }
    }).catch(() => {}).finally(() => setAiLoading(false));
  }, [visible, familyId, isEdit, pastItemNames]);

  // Populate fields when editing; auto-focus name input after overlay animates in
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

  const handleSave = guard(async () => {
    if (!name.trim()) return;
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
        category: (cat || guessCategory(name.trim())) || undefined,
        storePreference: store.trim() || undefined,
        addedBy: memberId, notes: notes.trim() || undefined,
      });
    }
    showToast(isEdit ? 'Item updated' : 'Item added');
    reset();
    onClose();
  });

  const insets = useSafeAreaInsets();
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

  if (!visible) return null;

  return (
    <Pressable style={{ flex: 1, backgroundColor: sheetBg }} onPress={Keyboard.dismiss}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={dismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.surface, marginRight: 12 }}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>
            {isEdit ? 'Edit Item' : 'Add to List'}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 1 }}>
            {isEdit ? 'Update item details' : 'Type a name or tap a suggestion'}
          </Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 40, gap: 12 }}
        showsVerticalScrollIndicator={false}>

          {/* Status pill */}
          {!isEdit && (
            <View style={{ alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: P }}>
                {aiLoading ? 'Loading suggestions…' : 'Quick capture'}
              </Text>
            </View>
          )}

          {/* Name field — Figma "active field" style when focused */}
          <FieldCard label="Item name" focused={name.length > 0} colors={colors}>
            <TextInput
              ref={nameRef}
              style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 24 }}
              placeholder="e.g. Atta, Milk, Turmeric"
              placeholderTextColor={colors.textTertiary}
              value={name} onChangeText={setName}
            />
            {name.length > 0 && (
              <Pressable onPress={() => setName('')} style={{ position: 'absolute', top: 14, right: 14 }}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </FieldCard>

          {/* AI quick suggestions — hidden in edit mode */}
          {!isEdit && filteredSuggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always" style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                {filteredSuggestions.slice(0, 14).map(sug => (
                  <Pressable key={sug.name}
                    onPress={() => { setName(sug.name); setCat(sug.cat); nameRef.current?.focus(); }}
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
          )}

          {/* Qty field */}
          <FieldCard label="Quantity" focused={qty.length > 0} colors={colors}>
            <TextInput
              style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 24 }}
              placeholder="e.g. 2 kg, 1 dozen"
              placeholderTextColor={colors.textTertiary}
              value={qty} onChangeText={setQty}
            />
          </FieldCard>

          {/* Store field */}
          <FieldCard label="Store" focused={storeFocused || store.length > 0} colors={colors}>
            <TextInput
              style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 24 }}
              placeholder="e.g. Costco, Any store"
              placeholderTextColor={colors.textTertiary}
              value={store} onChangeText={setStore}
              onFocus={() => setStoreFocused(true)}
              onBlur={() => setStoreFocused(false)}
            />
          </FieldCard>

          {/* Store suggestions inline chips */}
          {storeFocused && storeSuggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always" style={{ marginTop: -4 }}>
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

          {/* Category field */}
          <FieldCard label="Category" focused={!!cat} colors={colors}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                {CATEGORIES.map(c => (
                  <Pressable key={c} onPress={() => setCat(cat === c ? '' : c)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                      backgroundColor: cat === c ? P : colors.surface,
                      borderWidth: 1, borderColor: cat === c ? P : colors.border }}>
                    <Text style={{ fontSize: 13 }}>{CAT_EMOJI[c] ?? '📦'}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: cat === c ? colors.textInverse : colors.textSecondary }}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </FieldCard>

          {/* Notes field */}
          <FieldCard label="Notes (optional)" focused={notes.length > 0} colors={colors}>
            <TextInput
              style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 24, minHeight: 48 }}
              placeholder="e.g. organic only, from Patel's"
              placeholderTextColor={colors.textTertiary}
              value={notes} onChangeText={setNotes} multiline
            />
          </FieldCard>

          {/* Tip card */}
          <View style={{ backgroundColor: colors.tealLight, borderRadius: 22, padding: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal, lineHeight: 20 }}>
              Tip: Add the store so your list stays organized by where you shop.
            </Text>
          </View>

          <Pressable onPress={handleSave} disabled={!name.trim() || saving}
            style={withAndroidShadowFix({ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
              backgroundColor: (!name.trim() || saving) ? colors.border : P,
              shadowColor: P, shadowOpacity: name.trim() ? 0.3 : 0, shadowRadius: 10, elevation: 4 })}>
            {saving
              ? <ActivityIndicator color={colors.textInverse} size="small" />
              : <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textInverse }}>
                  {isEdit ? 'Save Changes' : 'Add to List'}
                </Text>}
          </Pressable>
      </ScrollView>
    </Pressable>
  );
}

// ─── Figma "Labeled field" card ───────────────────────────────────────────────
function FieldCard({ label, focused, children, colors }: { label: string; focused?: boolean; children: React.ReactNode; colors: any }) {
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: focused ? 2 : 1,
      borderColor: focused ? colors.primary : colors.border,
      padding: 14,
      minHeight: 88,
      gap: 4,
    }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 }}>{label}</Text>
      {children}
    </View>
  );
}
