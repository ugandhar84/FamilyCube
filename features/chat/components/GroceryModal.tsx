import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ScrollView } from 'react-native';
import { X, ShoppingCart, Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { GroceryCategory, useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { GROCERY_CATS } from './constants';

// ─── Grocery modal ────────────────────────────────────────────────────────────

export function GroceryModal({ visible, initialName, onClose, onAdd }: {
  visible: boolean; initialName: string;
  onClose: () => void;
  // Was (item: any) with the modal building its own storePreference/addedBy
  // keys that never actually matched groceryStore.addItem's real param
  // shape (it sent `store`/`estimatedPrice`/`addedByMemberId`, none of
  // which addItem reads) — item silently landed with no store and no
  // addedBy every time. Now hands back exactly addItem's own partial
  // param shape so the caller can spread it straight in.
  onAdd: (item: { name: string; quantity?: string; category?: string; storePreference?: string }) => void;
}) {
  const { colors } = useTheme();
  const pastStores = useGroceryStore(s => s.pastStores);
  const storePool = [...new Set([...pastStores, ...DEFAULT_GROCERY_STORES])].slice(0, 9);
  const [name,  setName]  = useState(initialName);
  const [qty,   setQty]   = useState('1');
  const [cat,   setCat]   = useState<GroceryCategory>('Household');
  const [store, setStore] = useState('');
  useEffect(() => { if (visible) setName(initialName); }, [visible, initialName]);
  const submit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), quantity: qty, category: cat, storePreference: store.trim() || undefined });
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 16,
          borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={20} color={colors.teal} />
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>Add to Shopping List</Text>
            </View>
            <Pressable onPress={onClose}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <View>
            <Text style={gm.label(colors)}>Item Name</Text>
            <TextInput style={gm.input(colors)} value={name} onChangeText={setName} autoFocus />
          </View>
          <View>
            <Text style={gm.label(colors)}>Quantity</Text>
            <TextInput style={gm.input(colors)} value={qty} onChangeText={setQty} />
          </View>
          <View>
            <Text style={gm.label(colors)}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {GROCERY_CATS.map(c => (
                <Pressable key={c} onPress={() => setCat(c)}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5,
                    backgroundColor: cat===c ? '#10b98120' : colors.surface, borderColor: cat===c ? '#10b981' : colors.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: cat===c ? '#10b981' : colors.textSecondary }}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View>
            <Text style={gm.label(colors)}>Store (optional)</Text>
            <TextInput style={gm.input(colors)} value={store} onChangeText={setStore} placeholder="Type a store or pick below" placeholderTextColor={colors.textTertiary} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
              {storePool.map(s => (
                <Pressable key={s} onPress={() => setStore(store === s ? '' : s)}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5,
                    backgroundColor: store===s ? colors.primaryLight : colors.surface, borderColor: store===s ? colors.primary : colors.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: store===s ? colors.primary : colors.textSecondary }}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surface }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#10b981', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Plus size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800' }}>Save to List</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const gm = {
  label: (c: any) => ({ fontSize: 11, fontWeight: '700' as const, color: c.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 6 }),
  input: (c: any) => ({ backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 10, fontSize: 14, color: c.textPrimary }),
};
