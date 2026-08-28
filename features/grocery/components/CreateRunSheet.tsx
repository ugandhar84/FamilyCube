import { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform, Keyboard, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGroceryStore, GroceryRun } from '@/store/groceryStore';
import { sh } from './styles';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

// ─── Create Run Sheet ─────────────────────────────────────────────────────────

export function CreateRunSheet({ visible, onClose, familyId, memberId, colors, isDark, onCreated }: {
  visible: boolean; onClose: () => void;
  familyId: string; memberId: string;
  colors: any; isDark: boolean;
  onCreated: (run: GroceryRun) => void;
}) {
  const createRun = useGroceryStore(s => s.createRun);
  const pastStores = useGroceryStore(s => s.pastStores);
  const [name,    setName]   = useState('');
  const [store,   setStore]  = useState('');
  const [saving,  setSaving] = useState(false);

  const DEFAULT_STORE_SUGGESTIONS = ['Costco', 'Walmart', 'Whole Foods', 'Trader Joe\'s', 'Patel Brothers', 'Aldi', 'Target', 'Kroger', 'Sprouts'];
  const STORE_SUGGESTIONS = [...new Set([...pastStores, ...DEFAULT_STORE_SUGGESTIONS])].slice(0, 9);

  const handleSave = async () => {
    if (!store.trim()) return;
    setSaving(true);
    const run = await createRun({
      familyId,
      name: name.trim() || `${store.trim()} trip`,
      store: store.trim(),
      createdBy: memberId,
      shopperId: memberId,
    });
    setSaving(false);
    if (run) { setName(''); setStore(''); onCreated(run); }
  };

  const inputBg = colors.surface;
  const border  = colors.border;
  const dismiss = () => { Keyboard.dismiss(); onClose(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '90%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Start a Shopping Trip</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Which store are you heading to?</Text>
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
          <TextInput
            style={[sh.input, { backgroundColor: inputBg, borderColor: border, color: colors.textPrimary }]}
            placeholder="Store name (e.g. Costco, Patel Brothers)"
            placeholderTextColor={colors.textTertiary}
            value={store} onChangeText={setStore} autoFocus
          />

          {/* Store suggestions */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
              {STORE_SUGGESTIONS.map(s => (
                <Pressable
                  key={s}
                  onPress={() => setStore(s)}
                  style={[sh.catChip, { backgroundColor: store === s ? colors.primary : inputBg, borderColor: store === s ? colors.primary : border }]}
                >
                  <Text style={{ fontSize: 12, color: store === s ? colors.textInverse : colors.textSecondary }}>🛒 {s}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <TextInput
            style={[sh.input, { backgroundColor: inputBg, borderColor: border, color: colors.textPrimary }]}
            placeholder="Give this trip a name (optional — e.g. Diwali party groceries)"
            placeholderTextColor={colors.textTertiary}
            value={name} onChangeText={setName}
          />
            </ScrollView>

            {/* Sticky footer */}
            <View style={{ padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable
                onPress={handleSave}
                disabled={!store.trim() || saving}
                style={[sh.btn, { backgroundColor: (!store.trim() || saving) ? colors.textDisabled : colors.primary }]}
              >
                {saving
                  ? <ActivityIndicator color={colors.textInverse} size="small" />
                  : <Text style={[sh.btnText, { color: colors.textInverse }]}>Start Trip</Text>}
              </Pressable>
            </View>

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
