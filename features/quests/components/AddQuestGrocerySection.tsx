import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Pressable, Switch } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { DEFAULT_GROCERY_ITEMS, DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { aq } from './AddQuestModal';

// ─── Grocery list attachment (Errand / Shopping categories) ───────────────────
// Extracted verbatim from AddQuestModal's linkGroceries block — purely
// presentational, all state lives in the parent (same pattern as
// HealthRecordsList / GroceryScreen's extracted sections).
export function AddQuestGrocerySection({
  colors, isDark,
  linkGroceries, setLinkGroceries, setGroceryListOpen,
  loadingGroceries, groceryItems,
  expandedStores, setExpandedStores,
  selectedItemIds, setSelectedItemIds,
  newGroceryLines, setNewGroceryLines,
  focusedLineIdx, setFocusedLineIdx,
  focusedField, setFocusedField,
  cachedItemNames, cachedStores,
}: {
  colors: any; isDark: boolean;
  linkGroceries: boolean; setLinkGroceries: (v: boolean) => void; setGroceryListOpen: (v: boolean) => void;
  loadingGroceries: boolean;
  groceryItems: { id: string; name: string; quantity?: string; storePreference?: string }[];
  expandedStores: Set<string>; setExpandedStores: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedItemIds: Set<string>; setSelectedItemIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  newGroceryLines: { name: string; qty: string; store: string }[];
  setNewGroceryLines: React.Dispatch<React.SetStateAction<{ name: string; qty: string; store: string }[]>>;
  focusedLineIdx: number | null; setFocusedLineIdx: (v: number | null) => void;
  focusedField: 'name' | 'store' | null; setFocusedField: (v: 'name' | 'store' | null) => void;
  cachedItemNames: string[]; cachedStores: string[];
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: linkGroceries ? 8 : 0 }}>
        <Text style={[aq.label, { color: colors.textSecondary, marginBottom: 0 }]}>🛍️ Attach grocery list</Text>
        <Switch value={linkGroceries} onValueChange={v => { setLinkGroceries(v); if (!v) setGroceryListOpen(false); }}
          trackColor={{ false: colors.border, true: BRAND.purple + '80' }}
          thumbColor={linkGroceries ? BRAND.purple : colors.textTertiary} />
      </View>
      {linkGroceries && (
        <>
          {/* Existing pending items grouped by store — collapsible */}
          {loadingGroceries ? (
            <ActivityIndicator color={BRAND.purple} style={{ marginVertical: 8 }} />
          ) : groceryItems.length > 0 ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                From your list ({groceryItems.length})
              </Text>
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
                    const storeOpen     = expandedStores.has(store);
                    const storeSelected = items.every(i => selectedItemIds.has(i.id));
                    const storePartial  = !storeSelected && items.some(i => selectedItemIds.has(i.id));
                    const toggleStore = () => setExpandedStores(prev => {
                      const next = new Set(prev);
                      storeOpen ? next.delete(store) : next.add(store);
                      return next;
                    });
                    return (
                      <View key={store} style={{ marginBottom: 4 }}>
                        {/* Store header — tap to expand/collapse */}
                        <Pressable onPress={toggleStore}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                            backgroundColor: storeSelected ? BRAND.purple + '15' : (storePartial ? BRAND.purple + '14' : isDark ? '#252540' : '#F3F4F6'),
                            borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
                            borderWidth: 1, borderColor: storeSelected ? BRAND.purple + '60' : (storePartial ? BRAND.purple + '30' : colors.border) }}
                        >
                          <Text style={{ fontSize: 14 }}>🏪</Text>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: storeSelected ? BRAND.purple : colors.textPrimary }}>{store}</Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginRight: 6 }}>{items.filter(i => selectedItemIds.has(i.id)).length}/{items.length}</Text>
                          {/* Select-all checkbox */}
                          <Pressable
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 0 }}
                            onPress={() => {
                              const next = new Set(selectedItemIds);
                              if (storeSelected) items.forEach(i => next.delete(i.id));
                              else items.forEach(i => next.add(i.id));
                              setSelectedItemIds(next);
                            }}>
                            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                              borderColor: (storeSelected || storePartial) ? BRAND.purple : colors.border,
                              backgroundColor: storeSelected ? BRAND.purple : 'transparent',
                              alignItems: 'center', justifyContent: 'center' }}>
                              {storeSelected && <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>✓</Text>}
                              {storePartial && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND.purple }} />}
                            </View>
                          </Pressable>
                          <Text style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 4 }}>{storeOpen ? '▲' : '▼'}</Text>
                        </Pressable>
                        {/* Items — shown only when store expanded */}
                        {storeOpen && items.map(item => {
                          const selected = selectedItemIds.has(item.id);
                          return (
                            <Pressable key={item.id}
                              onPress={() => { const next = new Set(selectedItemIds); selected ? next.delete(item.id) : next.add(item.id); setSelectedItemIds(next); }}
                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, paddingLeft: 26,
                                backgroundColor: selected ? BRAND.purple + '10' : colors.surface,
                                borderRadius: 8, marginTop: 2, borderWidth: 1, borderColor: selected ? BRAND.purple + '40' : colors.border }}
                            >
                              <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                                borderColor: selected ? BRAND.purple : colors.border,
                                backgroundColor: selected ? BRAND.purple : 'transparent',
                                alignItems: 'center', justifyContent: 'center', marginRight: 9 }}>
                                {selected && <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>✓</Text>}
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

          {/* New items inline */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: groceryItems.length > 0 ? 8 : 0, marginBottom: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Add new items</Text>
            <Pressable onPress={() => setNewGroceryLines(prev => [{ name: '', qty: '', store: '' }, ...prev])}
              style={{ backgroundColor: BRAND.purple, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>+ Add item</Text>
            </Pressable>
          </View>
          {newGroceryLines.length === 0 ? (
            <Pressable onPress={() => setNewGroceryLines([{ name: '', qty: '', store: '' }])}
              style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.purple + '60', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: BRAND.purple, fontSize: 13 }}>+ Tap to add grocery items</Text>
            </Pressable>
          ) : newGroceryLines.map((line, idx) => {
            const allItemPool = [...new Set([...cachedItemNames, ...DEFAULT_GROCERY_ITEMS])];
            const allStorePool = [...new Set([...cachedStores, ...DEFAULT_GROCERY_STORES])];
            const nameSuggs  = line.name.trim().length > 0
              ? allItemPool.filter(n => n.toLowerCase().includes(line.name.toLowerCase()) && n.toLowerCase() !== line.name.toLowerCase()).slice(0, 6)
              : [];
            const storeSuggs = line.store.trim().length === 0
              ? allStorePool.slice(0, 6)
              : allStorePool.filter(s => s.toLowerCase().includes(line.store.toLowerCase()) && s.toLowerCase() !== line.store.toLowerCase()).slice(0, 6);
            const showNameSuggs  = focusedLineIdx === idx && focusedField === 'name'  && nameSuggs.length > 0;
            const showStoreSuggs = focusedLineIdx === idx && focusedField === 'store' && storeSuggs.length > 0;
            return (
              <View key={idx} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <TextInput
                    style={[aq.input, { flex: 2.5, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'name' ? BRAND.purple : colors.borderMed, marginBottom: 0 }]}
                    placeholder="Item name" placeholderTextColor={colors.textTertiary}
                    value={line.name}
                    onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, name: v } : l))}
                    onFocus={() => { setFocusedLineIdx(idx); setFocusedField('name'); }}
                    onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                  />
                  <TextInput
                    style={[aq.input, { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.borderMed, marginBottom: 0 }]}
                    placeholder="Qty" placeholderTextColor={colors.textTertiary}
                    value={line.qty}
                    onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: v } : l))}
                  />
                  <Pressable onPress={() => setNewGroceryLines(prev => prev.filter((_, i) => i !== idx))} style={{ padding: 6 }}>
                    <Text style={{ color: colors.textTertiary, fontSize: 18 }}>×</Text>
                  </Pressable>
                </View>
                {showNameSuggs && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginBottom: 4 }}>
                    {nameSuggs.map(s => (
                      <Pressable key={s} onPress={() => { setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, name: s } : l)); setFocusedField(null); }}
                        style={{ backgroundColor: BRAND.purple + '15', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginRight: 6, borderWidth: 1, borderColor: BRAND.purple + '40' }}>
                        <Text style={{ fontSize: 12, color: BRAND.purple, fontWeight: '600' }}>{s}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'store' ? BRAND.purple : colors.borderMed, marginBottom: 0 }]}
                  placeholder="🏪 Store (e.g. Walmart)" placeholderTextColor={colors.textTertiary}
                  value={line.store}
                  onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, store: v } : l))}
                  onFocus={() => { setFocusedLineIdx(idx); setFocusedField('store'); }}
                  onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                />
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
          })}
        </>
      )}
    </View>
  );
}
