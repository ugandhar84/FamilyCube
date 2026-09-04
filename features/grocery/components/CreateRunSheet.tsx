import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  Modal, Platform, Keyboard, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGroceryStore, GroceryRun } from '@/store/groceryStore';
import { sh } from './styles';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import PickerOverlay from '@/features/calendar/components/eventForm/PickerOverlay';

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
  const [plannedAt, setPlannedAt] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<'none' | 'date' | 'time'>('none');

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
      plannedAt: plannedAt?.toISOString(),
    });
    setSaving(false);
    if (run) { setName(''); setStore(''); setPlannedAt(null); onCreated(run); }
  };

  const inputBg = colors.surface;
  const border  = colors.border;
  const dismiss = () => { Keyboard.dismiss(); onClose(); };
  // Live-requested: "apply same fixes in all bottomsheets - don't forget
  // 75% is max but fit to the content" — was 90%.
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(75, 90);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', paddingBottom: keyboardHeight }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '75%', backgroundColor: colors.card }}>

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

          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
            When are you going? (optional)
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <Pressable
              onPress={() => setPickerMode('date')}
              style={[sh.catChip, { flex: 1, backgroundColor: inputBg, borderColor: border, alignItems: 'center' }]}
            >
              <Text style={{ fontSize: 12, color: plannedAt ? colors.textPrimary : colors.textTertiary }}>
                📅 {plannedAt ? plannedAt.toLocaleDateString() : 'Pick a date'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPickerMode('time')}
              style={[sh.catChip, { flex: 1, backgroundColor: inputBg, borderColor: border, alignItems: 'center' }]}
            >
              <Text style={{ fontSize: 12, color: plannedAt ? colors.textPrimary : colors.textTertiary }}>
                🕐 {plannedAt ? plannedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Pick a time'}
              </Text>
            </Pressable>
            {plannedAt && (
              <Pressable onPress={() => setPlannedAt(null)} style={{ justifyContent: 'center', paddingHorizontal: 4 }}>
                <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>
              {/* Live-requested: "add buttons also in the scroll view" —
                  was a separate fixed footer below the ScrollView. */}
              <Pressable
                onPress={handleSave}
                disabled={!store.trim() || saving}
                style={[sh.btn, { backgroundColor: (!store.trim() || saving) ? colors.textDisabled : colors.primary }]}
              >
                {saving
                  ? <ActivityIndicator color={colors.textInverse} size="small" />
                  : <Text style={[sh.btnText, { color: colors.textInverse }]}>Start Trip</Text>}
              </Pressable>
            </ScrollView>

          </View>
          {keyboardHeight > 0 && (
            <View pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: keyboardHeight, backgroundColor: colors.card }} />
          )}
        </View>

      <PickerOverlay
        showDate={pickerMode === 'date'}
        showTime={pickerMode === 'time'}
        value={plannedAt ?? new Date()}
        onChangeDate={(d) => setPlannedAt(prev => {
          const next = prev ? new Date(prev) : new Date();
          next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
          return next;
        })}
        onChangeTime={(d) => setPlannedAt(prev => {
          const next = prev ? new Date(prev) : new Date();
          next.setHours(d.getHours(), d.getMinutes(), 0, 0);
          return next;
        })}
        onDone={() => setPickerMode('none')}
        accentColor={colors.primary}
        colors={colors}
        dateLabel="📅 When are you going?"
        timeLabel="🕐 What time?"
      />
    </Modal>
  );
}
