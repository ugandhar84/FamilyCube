import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Pressable } from 'react-native';
import { DEFAULT_GROCERY_ITEMS, DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { X } from './Icons';
import { f } from './styles';

export interface GroceryItem {
  id: string; name: string; quantity?: string; category?: string; storePreference?: string;
}
export interface NewGroceryLine { name: string; qty: string; store: string; }

// ─── "Attach grocery list" section — Errand category only ─────────────────────
// Toggle + existing pending items (grouped by store, tap-to-select) + inline
// "add new item" rows with name/store autocomplete from cached history.
export default function GroceryLinkSection({
  colors, isDark, catColor,
  linkGroceries, setLinkGroceries,
  loadingGroceries, groceryItems,
  selectedItemIds, setSelectedItemIds,
  newGroceryLines, setNewGroceryLines,
  focusedLineIdx, setFocusedLineIdx,
  focusedField, setFocusedField,
  generalLocation,
  cachedItemNames, cachedStores,
}: {
  colors: any; isDark: boolean; catColor: string;
  linkGroceries: boolean; setLinkGroceries: (v: boolean) => void;
  loadingGroceries: boolean; groceryItems: GroceryItem[];
  selectedItemIds: Set<string>; setSelectedItemIds: (s: Set<string>) => void;
  newGroceryLines: NewGroceryLine[]; setNewGroceryLines: React.Dispatch<React.SetStateAction<NewGroceryLine[]>>;
  focusedLineIdx: number | null; setFocusedLineIdx: (i: number | null) => void;
  focusedField: 'name' | 'store' | null; setFocusedField: (f: 'name' | 'store' | null) => void;
  generalLocation: string;
  cachedItemNames: string[]; cachedStores: string[];
}) {
  return (
    <>
      {/* ── Link grocery list ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={[f.label, { color: colors.textSecondary, marginBottom: 0 }]}>🛍️ Attach grocery list</Text>
        <Switch
          value={linkGroceries}
          onValueChange={setLinkGroceries}
          trackColor={{ false: colors.border, true: catColor + '80' }}
          thumbColor={linkGroceries ? catColor : colors.textTertiary}
        />
      </View>

      {linkGroceries && (
        <>
          {/* ── Existing pending items ── */}
          {loadingGroceries ? (
            <ActivityIndicator color={catColor} style={{ marginVertical: 8 }} />
          ) : groceryItems.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  From your list
                </Text>
                <Pressable onPress={() => {
                  if (selectedItemIds.size === groceryItems.length) setSelectedItemIds(new Set());
                  else setSelectedItemIds(new Set(groceryItems.map(i => i.id)));
                }}>
                  <Text style={{ fontSize: 12, color: catColor, fontWeight: '700' }}>
                    {selectedItemIds.size === groceryItems.length ? 'Deselect all' : 'Select all'}
                  </Text>
                </Pressable>
              </View>
              {(() => {
                const groups: Record<string, typeof groceryItems> = {};
                for (const item of groceryItems) {
                  const key = item.storePreference || 'Any store';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(item);
                }
                return Object.entries(groups)
                  .sort(([a], [b]) => a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b))
                  .map(([store, items]) => {
                    const storeSelected = items.every(i => selectedItemIds.has(i.id));
                    const storePartial  = !storeSelected && items.some(i => selectedItemIds.has(i.id));
                    return (
                      <View key={store} style={{ marginBottom: 10 }}>
                        <Pressable
                          onPress={() => {
                            const next = new Set(selectedItemIds);
                            if (storeSelected) items.forEach(i => next.delete(i.id));
                            else items.forEach(i => next.add(i.id));
                            setSelectedItemIds(next);
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                            backgroundColor: storeSelected ? catColor + '15' : (storePartial ? catColor + '08' : isDark ? '#252540' : '#F3F4F6'),
                            borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 3,
                            borderWidth: 1, borderColor: storeSelected ? catColor + '60' : (storePartial ? catColor + '30' : colors.border) }}
                        >
                          <Text style={{ fontSize: 14 }}>🏪</Text>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: storeSelected ? catColor : colors.textPrimary }}>{store}</Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                            {items.filter(i => selectedItemIds.has(i.id)).length}/{items.length}
                          </Text>
                          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                            borderColor: (storeSelected || storePartial) ? catColor : colors.border,
                            backgroundColor: storeSelected ? catColor : 'transparent',
                            alignItems: 'center', justifyContent: 'center' }}>
                            {storeSelected && <Text style={{ color: colors.textInverse, fontSize: 10, fontWeight: '900' }}>✓</Text>}
                            {storePartial && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: catColor }} />}
                          </View>
                        </Pressable>
                        {items.map(item => {
                          const selected = selectedItemIds.has(item.id);
                          return (
                            <Pressable
                              key={item.id}
                              onPress={() => {
                                const next = new Set(selectedItemIds);
                                selected ? next.delete(item.id) : next.add(item.id);
                                setSelectedItemIds(next);
                              }}
                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12,
                                paddingLeft: 26, backgroundColor: selected ? catColor + '10' : colors.surface,
                                borderRadius: 8, marginBottom: 2,
                                borderWidth: 1, borderColor: selected ? catColor + '40' : colors.border }}
                            >
                              <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                                borderColor: selected ? catColor : colors.border,
                                backgroundColor: selected ? catColor : 'transparent',
                                alignItems: 'center', justifyContent: 'center', marginRight: 9 }}>
                                {selected && <Text style={{ color: colors.textInverse, fontSize: 9, fontWeight: '900' }}>✓</Text>}
                              </View>
                              <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: selected ? '600' : '400' }}>{item.name}</Text>
                              {item.quantity ? <Text style={{ fontSize: 11, color: colors.textSecondary }}>{item.quantity}</Text> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  });
              })()}
            </>
          ) : null}

          {/* ── New items typed inline ── */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: groceryItems.length > 0 ? 10 : 0, marginBottom: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Add new items
            </Text>
            <Pressable onPress={() => setNewGroceryLines(prev => [...prev, { name: '', qty: '', store: generalLocation.trim() || '' }])}
              style={{ backgroundColor: catColor, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ color: colors.textInverse, fontSize: 12, fontWeight: '700' }}>+ Add item</Text>
            </Pressable>
          </View>
          {newGroceryLines.length === 0 ? (
            <Pressable onPress={() => setNewGroceryLines([{ name: '', qty: '', store: generalLocation.trim() || '' }])}
              style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: catColor + '60', borderRadius: 10,
                paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: catColor, fontSize: 13 }}>+ Tap to add grocery items</Text>
            </Pressable>
          ) : (
            newGroceryLines.map((line, idx) => {
              const allItemPool = [...new Set([...cachedItemNames, ...DEFAULT_GROCERY_ITEMS])];
              const allStorePool = [...new Set([...cachedStores, ...DEFAULT_GROCERY_STORES])];
              const nameSuggs = line.name.trim().length > 0
                ? allItemPool.filter(n => n.toLowerCase().includes(line.name.toLowerCase()) && n.toLowerCase() !== line.name.toLowerCase()).slice(0, 6)
                : [];
              const storeSuggs = line.store.trim().length === 0
                ? allStorePool.slice(0, 6)
                : allStorePool.filter(s => s.toLowerCase().includes(line.store.toLowerCase()) && s.toLowerCase() !== line.store.toLowerCase()).slice(0, 6);
              const showNameSuggs  = focusedLineIdx === idx && focusedField === 'name'  && nameSuggs.length > 0;
              const showStoreSuggs = focusedLineIdx === idx && focusedField === 'store' && storeSuggs.length > 0;

              return (
                <View key={idx} style={{ marginBottom: 8 }}>
                  {/* Row 1: name + qty + delete */}
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <TextInput
                      style={[f.input, { flex: 2.5, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'name' ? catColor : colors.borderMed, marginBottom: 0 }]}
                      placeholder="Item name" placeholderTextColor={colors.textTertiary}
                      value={line.name}
                      onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, name: v } : l))}
                      onFocus={() => { setFocusedLineIdx(idx); setFocusedField('name'); }}
                      onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                    />
                    <TextInput
                      style={[f.input, { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed, marginBottom: 0 }]}
                      placeholder="Qty" placeholderTextColor={colors.textTertiary}
                      value={line.qty}
                      onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: v } : l))}
                    />
                    <Pressable onPress={() => setNewGroceryLines(prev => prev.filter((_, i) => i !== idx))} style={{ padding: 6 }}>
                      <X c={colors.textTertiary} size={16} />
                    </Pressable>
                  </View>
                  {/* Name suggestions */}
                  {showNameSuggs && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginBottom: 4 }}>
                      {nameSuggs.map(s => (
                        <Pressable key={s} onPress={() => { setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, name: s } : l)); setFocusedField(null); }}
                          style={{ backgroundColor: catColor + '15', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginRight: 6, borderWidth: 1, borderColor: catColor + '40' }}>
                          <Text style={{ fontSize: 12, color: catColor, fontWeight: '600' }}>{s}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                  {/* Row 2: store field */}
                  <TextInput
                    style={[f.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'store' ? catColor : colors.borderMed, marginBottom: 0 }]}
                    placeholder="🏪 Store (e.g. Walmart, Costco)" placeholderTextColor={colors.textTertiary}
                    value={line.store}
                    onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, store: v } : l))}
                    onFocus={() => { setFocusedLineIdx(idx); setFocusedField('store'); }}
                    onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                  />
                  {/* Store suggestions */}
                  {showStoreSuggs && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 4 }}>
                      {storeSuggs.map(s => (
                        <Pressable key={s} onPress={() => { setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, store: s } : l)); setFocusedField(null); }}
                          style={{ backgroundColor: isDark ? '#252540' : '#F3F4F6', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginRight: 6, borderWidth: 1, borderColor: colors.border }}>
                          <Text style={{ fontSize: 12, color: colors.textPrimary }}>🏪 {s}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </View>
              );
            })
          )}
        </>
      )}
    </>
  );
}
