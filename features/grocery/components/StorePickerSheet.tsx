/**
 * StorePickerSheet — replaces the "Move to Store" native Alert.alert list
 * (a plain iOS action-sheet button stack, no search, capped usability once
 * a family accumulates more than a handful of stores) with a real bottom
 * sheet: searchable, and lets the user add a brand-new store name that's
 * saved to family_store_preferences for future suggestion, not just used
 * once and forgotten (live-requested).
 */
import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppBottomSheet from '@/components/AppBottomSheet';

export function StorePickerSheet({
  visible, onClose, onSelect, currentStore, knownStores, colors, isDark,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (store: string | undefined) => void; // undefined = "Any store"
  currentStore?: string;
  knownStores: string[];
  colors: any; isDark: boolean;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const others = knownStores.filter(s => s !== currentStore);
    if (!q) return others;
    return others.filter(s => s.toLowerCase().includes(q));
  }, [knownStores, currentStore, query]);

  // Offer "add <query> as a new store" only when it's a real new name, not
  // a re-typing of a store that's already in the list (case-insensitive).
  const trimmedQuery = query.trim();
  const canAddNew = trimmedQuery.length > 0
    && !knownStores.some(s => s.toLowerCase() === trimmedQuery.toLowerCase());

  const handleClose = () => { setQuery(''); onClose(); };
  const select = (store: string | undefined) => { setQuery(''); onSelect(store); };

  return (
    <AppBottomSheet visible={visible} onClose={handleClose} title="Move to Store"
      subtitle="Search or add where this belongs" minHeight="55%" maxHeight="85%">
      <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          value={query} onChangeText={setQuery}
          placeholder="Search stores or type a new one"
          placeholderTextColor={colors.textTertiary}
          style={[s.searchInput, { color: colors.textPrimary }]}
          autoCapitalize="words" autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {canAddNew && (
        <Pressable onPress={() => select(trimmedQuery)}
          style={[s.row, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}>
          <Ionicons name="add-circle" size={20} color={colors.primary} />
          <Text style={[s.rowText, { color: colors.primary, fontWeight: '800' }]}>
            Add "{trimmedQuery}" as a new store
          </Text>
        </Pressable>
      )}

      {!query && currentStore && (
        <Pressable onPress={() => select(undefined)} style={[s.row, { borderColor: colors.border }]}>
          <Ionicons name="apps-outline" size={18} color={colors.textSecondary} />
          <Text style={[s.rowText, { color: colors.textPrimary }]}>Any store (no preference)</Text>
        </Pressable>
      )}

      <FlatList
        data={filtered}
        keyExtractor={item => item}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
        ListEmptyComponent={!canAddNew ? (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 20, fontSize: 13 }}>
            No matching stores yet — type a name above to add one.
          </Text>
        ) : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => select(item)} style={[s.row, { borderColor: colors.border }]}>
            <Ionicons name="storefront-outline" size={18} color={colors.textSecondary} />
            <Text style={[s.rowText, { color: colors.textPrimary }]}>{item}</Text>
          </Pressable>
        )}
      />
    </AppBottomSheet>
  );
}

const s = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
  rowText: { fontSize: 15, fontWeight: '600' },
});
