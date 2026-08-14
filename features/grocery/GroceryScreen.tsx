/**
 * GroceryScreen — collaborative family grocery list & runs.
 *
 * Tabs:
 *  "List"  — all pending items grouped by store preference
 *  "Runs"  — shopping sessions (draft / active / done)
 *
 * From anywhere:
 *  FAB (+) → add item bottom sheet
 *  "New run" → create run sheet → pick items from pool
 *  Active run card → RunDetailSheet (live check-off)
 */
import { useEffect, useRef, useState, useCallback, useMemo, ComponentType } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert, Animated,
  FlatList, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import {
  Apple, Milk, Wheat, Beef, Carrot, Cookie, Coffee, Snowflake,
  ShoppingBasket, Salad, Sandwich, Wine, Croissant, Egg, Fish,
  Grape, Banana, Cake, Nut, Pizza, ShoppingCart,
} from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useGroceryStore, GroceryItem, GroceryRun, GroceryRunItem } from '@/store/groceryStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Category suggestions ─────────────────────────────────────────────────────

const CATEGORIES = ['Produce', 'Dairy', 'Grains', 'Spices', 'Meat', 'Snacks', 'Beverages', 'Frozen', 'Cleaning', 'Personal Care', 'Bakery', 'Seafood', 'Deli', 'Frozen Meals', 'Other'];
const CAT_ICON: Record<string, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Produce:        Carrot,
  Dairy:          Milk,
  Grains:         Wheat,
  Spices:         Apple,       // closest available; spice jar not in lucide
  Meat:           Beef,
  Snacks:         Cookie,
  Beverages:      Wine,
  Frozen:         Snowflake,
  Cleaning:       ShoppingBasket,
  'Personal Care': Nut,
  Bakery:         Croissant,
  Seafood:        Fish,
  Deli:           Sandwich,
  'Frozen Meals': Snowflake,
  Other:          ShoppingCart,
};
const CAT_EMOJI: Record<string, string> = {
  Produce: '🥦', Dairy: '🥛', Grains: '🌾', Spices: '🌶️', Meat: '🥩',
  Snacks: '🍿', Beverages: '🧃', Frozen: '🧊', Cleaning: '🧹', 'Personal Care': '🧴',
  Bakery: '🥐', Seafood: '🐟', Deli: '🥪', 'Frozen Meals': '🧊', Other: '📦',
};

function CatIcon({ category, size = 20, color = '#7C3AED' }: { category?: string; size?: number; color?: string }) {
  const Ic = CAT_ICON[category ?? 'Other'] ?? ShoppingCart;
  return <Ic size={size} color={color} strokeWidth={1.8} />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000)   return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Add Item Sheet ───────────────────────────────────────────────────────────

function AddItemSheet({ visible, onClose, familyId, memberId, colors, isDark, editItem }: {
  visible: boolean; onClose: () => void;
  familyId: string; memberId: string;
  colors: any; isDark: boolean;
  editItem?: GroceryItem;
}) {
  const addItem = useGroceryStore(s => s.addItem);
  const isEdit = !!editItem;

  const [name, setName]   = useState('');
  const [qty,  setQty]    = useState('');
  const [cat,  setCat]    = useState('');
  const [store, setStore] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

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

  const sheetBg = isDark ? '#1A1A2E' : '#FFFFFF';
  const border  = isDark ? '#2D2D4E' : '#E5E7EB';
  const inputBg = isDark ? '#252540' : '#F9FAFB';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[sh.sheet, { backgroundColor: sheetBg, borderColor: border }]}>
          <View style={sh.handle} />
          <Text style={[sh.title, { color: colors.textPrimary }]}>{isEdit ? 'Edit Item' : 'Add Item'}</Text>

          <TextInput
            style={[sh.input, { backgroundColor: inputBg, borderColor: border, color: colors.textPrimary }]}
            placeholder="Item name (e.g. Atta, Milk, Turmeric)"
            placeholderTextColor={colors.textMuted ?? '#9CA3AF'}
            value={name} onChangeText={setName} autoFocus
          />
          <TextInput
            style={[sh.input, { backgroundColor: inputBg, borderColor: border, color: colors.textPrimary }]}
            placeholder="Quantity (e.g. 2 kg, 1 dozen, 3 packets)"
            placeholderTextColor={colors.textMuted ?? '#9CA3AF'}
            value={qty} onChangeText={setQty}
          />
          <TextInput
            style={[sh.input, { backgroundColor: inputBg, borderColor: border, color: colors.textPrimary }]}
            placeholder="Store (e.g. Costco, Patel Brothers) — optional"
            placeholderTextColor={colors.textMuted ?? '#9CA3AF'}
            value={store} onChangeText={setStore}
          />

          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
              {CATEGORIES.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setCat(cat === c ? '' : c)}
                  style={[sh.catChip, {
                    backgroundColor: cat === c ? colors.primary : inputBg,
                    borderColor: cat === c ? colors.primary : border,
                  }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <CatIcon category={c} size={13} color={cat === c ? '#FFF' : colors.textSecondary} />
                    <Text style={{ fontSize: 12, color: cat === c ? '#FFF' : colors.textSecondary }}>{c}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <TextInput
            style={[sh.input, { backgroundColor: inputBg, borderColor: border, color: colors.textPrimary, height: 60 }]}
            placeholder="Notes (e.g. get the organic one, only from Patel's)"
            placeholderTextColor={colors.textMuted ?? '#9CA3AF'}
            value={notes} onChangeText={setNotes} multiline
          />

          <Pressable
            onPress={handleSave}
            disabled={!name.trim() || saving}
            style={[sh.btn, { backgroundColor: (!name.trim() || saving) ? '#9CA3AF' : colors.primary }]}
          >
            {saving
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={sh.btnText}>{isEdit ? 'Save Changes' : 'Add to List'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Create Run Sheet ─────────────────────────────────────────────────────────

function CreateRunSheet({ visible, onClose, familyId, memberId, colors, isDark, onCreated }: {
  visible: boolean; onClose: () => void;
  familyId: string; memberId: string;
  colors: any; isDark: boolean;
  onCreated: (run: GroceryRun) => void;
}) {
  const createRun = useGroceryStore(s => s.createRun);
  const [name,    setName]   = useState('');
  const [store,   setStore]  = useState('');
  const [saving,  setSaving] = useState(false);

  const STORE_SUGGESTIONS = ['Costco', 'Walmart', 'Whole Foods', 'Trader Joe\'s', 'Patel Brothers', 'Aldi', 'Target', 'Kroger', 'Sprouts'];

  const handleSave = async () => {
    if (!store.trim()) return;
    setSaving(true);
    const run = await createRun({
      familyId,
      name: name.trim() || `${store.trim()} run`,
      store: store.trim(),
      createdBy: memberId,
      shopperId: memberId,
    });
    setSaving(false);
    if (run) { setName(''); setStore(''); onCreated(run); }
  };

  const sheetBg = isDark ? '#1A1A2E' : '#FFFFFF';
  const border  = isDark ? '#2D2D4E' : '#E5E7EB';
  const inputBg = isDark ? '#252540' : '#F9FAFB';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[sh.sheet, { backgroundColor: sheetBg, borderColor: border }]}>
          <View style={sh.handle} />
          <Text style={[sh.title, { color: colors.textPrimary }]}>New Shopping Run</Text>

          <TextInput
            style={[sh.input, { backgroundColor: inputBg, borderColor: border, color: colors.textPrimary }]}
            placeholder="Store name (e.g. Costco, Patel Brothers)"
            placeholderTextColor={colors.textMuted ?? '#9CA3AF'}
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
                  <Text style={{ fontSize: 12, color: store === s ? '#FFF' : colors.textSecondary }}>🛒 {s}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <TextInput
            style={[sh.input, { backgroundColor: inputBg, borderColor: border, color: colors.textPrimary }]}
            placeholder="Run name (optional — e.g. Diwali party groceries)"
            placeholderTextColor={colors.textMuted ?? '#9CA3AF'}
            value={name} onChangeText={setName}
          />

          <Pressable
            onPress={handleSave}
            disabled={!store.trim() || saving}
            style={[sh.btn, { backgroundColor: (!store.trim() || saving) ? '#9CA3AF' : colors.primary }]}
          >
            {saving
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={sh.btnText}>Create Run</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Run Detail Sheet ─────────────────────────────────────────────────────────

function RunDetailSheet({ run, visible, onClose, memberId, pendingItems, colors, isDark }: {
  run: GroceryRun | null; visible: boolean; onClose: () => void;
  memberId: string; pendingItems: GroceryItem[];
  colors: any; isDark: boolean;
}) {
  const { checkRunItem, uncheckRunItem, addItemToRun, removeItemFromRun, startRun, completeRun, loadRunDetail } = useGroceryStore();
  const [runItems,         setRunItems]         = useState<GroceryRunItem[]>([]);
  const [adding,           setAdding]           = useState(false);
  const [loadingId,        setLoadingId]        = useState<string | null>(null);
  const [tab,              setTab]              = useState<'items' | 'add' | 'receipt'>('items');
  const [receiptUri,       setReceiptUri]       = useState<string | null>(null);
  const [receiptAnalysis,  setReceiptAnalysis]  = useState<any | null>(null);
  const [analyzingReceipt, setAnalyzingReceipt] = useState(false);

  const pickReceipt = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, base64: true, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
      await analyzeReceipt(result.assets[0].base64 ?? '');
    }
  };

  const analyzeReceipt = async (base64: string) => {
    if (!base64) return;
    setAnalyzingReceipt(true); setReceiptAnalysis(null);
    try {
      const runItems_ = runItems.map(ri => ri.item?.name ?? ri.itemId);
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: { action: 'analyze_receipt', imageBase64: base64, runItems: runItems_ },
      });
      if (error) throw error;
      setReceiptAnalysis(data);
    } catch (e: any) {
      Alert.alert('Receipt error', e?.message ?? 'Could not analyze receipt.');
    } finally { setAnalyzingReceipt(false); }
  };

  // Realtime subscription for run items
  const runItemSubRef = useRef<any>(null);

  useEffect(() => {
    if (!run || !visible) return;

    loadRunDetail(run.id).then(detail => {
      const items = detail?.runItems ?? [];
      setRunItems(items);
      if (items.length === 0) setTab('add');
    });

    // Subscribe to check-off changes for this run
    const sub = supabase
      .channel(`run_items:${run.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'grocery_run_items', filter: `run_id=eq.${run.id}` },
        (payload: any) => {
          setRunItems(prev => prev.map(ri =>
            ri.itemId === payload.new.item_id
              ? { ...ri, checkedInRun: payload.new.checked_in_run, checkedBy: payload.new.checked_by, checkedAt: payload.new.checked_at }
              : ri
          ));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'grocery_run_items', filter: `run_id=eq.${run.id}` },
        async (_payload: any) => {
          // Reload to get the joined item data
          const detail = await loadRunDetail(run.id);
          setRunItems(detail?.runItems ?? []);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'grocery_run_items', filter: `run_id=eq.${run.id}` },
        (payload: any) => {
          setRunItems(prev => prev.filter(ri => ri.itemId !== payload.old.item_id));
        })
      .subscribe();

    runItemSubRef.current = sub;
    return () => { supabase.removeChannel(sub); runItemSubRef.current = null; };
  }, [run?.id, visible]);

  if (!run) return null;

  const sheetBg  = isDark ? '#1A1A2E' : '#FFFFFF';
  const border   = isDark ? '#2D2D4E' : '#E5E7EB';
  const rowBg    = isDark ? '#1F1F38' : '#F9FAFB';
  const checkedColor = isDark ? '#22C55E' : '#16A34A';

  const checkedCount = runItems.filter(ri => ri.checkedInRun).length;
  const isActive = run.status === 'active';
  const isDone   = run.status === 'done';

  // Items not already in this run
  const notInRun = pendingItems.filter(item => !runItems.find(ri => ri.itemId === item.id));

  const toggleCheck = async (ri: GroceryRunItem) => {
    if (isDone) return;
    setLoadingId(ri.itemId);
    if (ri.checkedInRun) {
      await uncheckRunItem(run.id, ri.itemId);
      setRunItems(prev => prev.map(r => r.itemId === ri.itemId ? { ...r, checkedInRun: false } : r));
    } else {
      await checkRunItem(run.id, ri.itemId, memberId);
      setRunItems(prev => prev.map(r => r.itemId === ri.itemId ? { ...r, checkedInRun: true, checkedBy: memberId } : r));
    }
    setLoadingId(null);
  };

  const handleAddToRun = async (itemId: string) => {
    setAdding(true);
    await addItemToRun(run.id, itemId);
    const detail = await loadRunDetail(run.id);
    setRunItems(detail?.runItems ?? []);
    setTab('items');
    setAdding(false);
  };

  const handleComplete = () => {
    Alert.alert('Complete Run', `Mark all ${checkedCount} checked items as bought?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', style: 'default', onPress: async () => { await completeRun(run.id); onClose(); } },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={[sh.sheet, { backgroundColor: sheetBg, borderColor: border, maxHeight: '90%' }]}>
          <View style={sh.handle} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={[sh.title, { color: colors.textPrimary, marginBottom: 2 }]}>{run.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[rd.statusBadge, { backgroundColor: isActive ? '#DCFCE7' : isDone ? '#F3F4F6' : '#EEF2FF' }]}>
                  <Text style={[rd.statusText, { color: isActive ? '#16A34A' : isDone ? '#6B7280' : colors.primary }]}>
                    {isActive ? '🛒 Shopping now' : isDone ? '✅ Done' : '📋 Draft'}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>🏪 {run.store}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={rd.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Progress bar */}
          {runItems.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <View style={[rd.progressBar, { backgroundColor: isDark ? '#252540' : '#E5E7EB' }]}>
                <View style={[rd.progressFill, { width: `${runItems.length ? (checkedCount / runItems.length) * 100 : 0}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                {checkedCount} of {runItems.length} items
              </Text>
            </View>
          )}

          {/* Sub-tabs */}
          {!isDone && (
            <View style={[rd.tabRow, { borderColor: border, backgroundColor: isDark ? '#252540' : '#F3F4F6' }]}>
              {(['items', 'add', 'receipt'] as const).map(t => (
                <Pressable key={t} onPress={() => setTab(t)} style={[rd.tabBtn, tab === t && { backgroundColor: colors.primary }]}>
                  <Text style={[rd.tabText, { color: tab === t ? '#FFF' : colors.textSecondary }]}>
                    {t === 'items' ? `List (${runItems.length})` : t === 'add' ? '+ Add' : '🧾 Receipt'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Items list */}
          {tab === 'items' && (
            <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {runItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
                  <Text style={{ fontSize: 40 }}>🛒</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>No items yet</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>Tap "+ Add" above to add items from your grocery list.</Text>
                  <Pressable onPress={() => setTab('add')} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, marginTop: 4 }}>
                    <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>+ Add Items</Text>
                  </Pressable>
                </View>
              ) : (
                runItems.map(ri => (
                  <Pressable
                    key={ri.itemId}
                    onPress={() => !isDone && toggleCheck(ri)}
                    style={[rd.itemRow, { backgroundColor: rowBg, borderColor: border }]}
                  >
                    <View style={[rd.checkbox, {
                      borderColor: ri.checkedInRun ? checkedColor : border,
                      backgroundColor: ri.checkedInRun ? checkedColor : 'transparent',
                    }]}>
                      {ri.checkedInRun && <Ionicons name="checkmark" size={14} color="#FFF" />}
                      {loadingId === ri.itemId && <ActivityIndicator size="small" color={colors.primary} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[rd.itemName, { color: colors.textPrimary, textDecorationLine: ri.checkedInRun ? 'line-through' : 'none', opacity: ri.checkedInRun ? 0.5 : 1 }]}>
                        {ri.item?.name ?? ri.itemId}
                      </Text>
                      {ri.item?.quantity && (
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>{ri.item.quantity}</Text>
                      )}
                    </View>
                    {!isDone && (
                      <Pressable onPress={() => removeItemFromRun(run.id, ri.itemId)} style={{ padding: 4 }}>
                        <Ionicons name="close-circle-outline" size={18} color={colors.textMuted ?? '#9CA3AF'} />
                      </Pressable>
                    )}
                  </Pressable>
                ))
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}

          {/* Add pool items to run */}
          {tab === 'add' && (
            <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {notInRun.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>All pending items are already in this run.</Text>
                </View>
              ) : (
                notInRun.map(item => (
                  <Pressable
                    key={item.id}
                    onPress={() => !adding && handleAddToRun(item.id)}
                    style={[rd.itemRow, { backgroundColor: rowBg, borderColor: border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, color: colors.textPrimary }}>{item.name}</Text>
                      {item.quantity && <Text style={{ fontSize: 12, color: colors.textSecondary }}>{item.quantity}</Text>}
                      {item.storePreference && <Text style={{ fontSize: 11, color: colors.textMuted ?? '#9CA3AF' }}>🏪 {item.storePreference}</Text>}
                    </View>
                    <View style={[rd.addBtn, { borderColor: colors.primary }]}>
                      <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>+ Add</Text>
                    </View>
                  </Pressable>
                ))
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}

          {/* Receipt tab */}
          {tab === 'receipt' && (
            <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {!receiptUri ? (
                <Pressable onPress={pickReceipt}
                  style={{ borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 14, padding: 32,
                    alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Text style={{ fontSize: 36 }}>🧾</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>Upload Receipt</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>Tap to pick from your photo library. AI will analyze it.</Text>
                </Pressable>
              ) : (
                <View style={{ gap: 12 }}>
                  <Image source={{ uri: receiptUri }} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="cover" />
                  {analyzingReceipt && (
                    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                      <ActivityIndicator color={colors.primary} size="large" />
                      <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Analyzing receipt…</Text>
                    </View>
                  )}
                  {receiptAnalysis && !analyzingReceipt && (
                    <View style={{ backgroundColor: isDark ? '#1a1035' : '#f5f3ff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                      {receiptAnalysis.total && (
                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 }}>
                          Total: ${receiptAnalysis.total}
                        </Text>
                      )}
                      {(receiptAnalysis.items ?? []).map((ri: any, idx: number) => (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
                          borderBottomWidth: idx < receiptAnalysis.items.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                          <Text style={{ fontSize: 13, color: colors.textPrimary, flex: 1 }}>{ri.name}</Text>
                          {ri.price && <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '600' }}>${ri.price}</Text>}
                        </View>
                      ))}
                    </View>
                  )}
                  <Pressable onPress={() => { setReceiptUri(null); setReceiptAnalysis(null); }}
                    style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Upload different receipt</Text>
                  </Pressable>
                </View>
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}

          {/* Actions */}
          {!isDone && (
            <View style={{ gap: 8, marginTop: 12 }}>
              {run.status === 'draft' && (
                <Pressable
                  onPress={() => startRun(run.id, memberId)}
                  style={[sh.btn, { backgroundColor: '#16A34A' }]}
                >
                  <Text style={sh.btnText}>🛒 Start Shopping</Text>
                </Pressable>
              )}
              {isActive && checkedCount > 0 && (
                <Pressable onPress={handleComplete} style={[sh.btn, { backgroundColor: colors.primary }]}>
                  <Text style={sh.btnText}>✅ Complete Run ({checkedCount} bought)</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────

const CAT_DOT_COLOR: Record<string, string> = {
  Produce: '#14B8A6', Dairy: '#14B8A6', Meat: '#14B8A6', Frozen: '#14B8A6',
  Grains: '#F59E0B', Snacks: '#F59E0B', Beverages: '#F59E0B',
  Cleaning: '#7C3AED', 'Personal Care': '#7C3AED', Spices: '#7C3AED',
  Other: '#9CA3AF',
};

function fmtProvenance(item: GroceryItem, members: any[]) {
  const time = new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dateStr = fmtDate(item.createdAt);
  if (item.aiGenerated) return `Added by ✨ AI · ${dateStr} ${time}`;
  const member = members.find(m => m.id === item.addedBy);
  const name   = member?.name?.split(' ')[0] ?? 'Someone';
  return `Added by ${name} · ${dateStr}`;
}

function ItemCard({ item, members, selected, selecting, onBuy, onLongPress, onToggleSelect, onPress, onEdit, onDelete, colors, isDark, priceInfo, isLast }: {
  item: GroceryItem; members: any[];
  selected: boolean; selecting: boolean; isLast?: boolean;
  onBuy: () => void; onLongPress: () => void; onToggleSelect: () => void;
  onPress: () => void; onEdit: () => void; onDelete?: () => void;
  colors: any; isDark: boolean;
  priceInfo?: { price: number | null; unit: string | null; source: 'kroger' | 'estimate' | 'unknown' };
}) {
  const dotColor = CAT_DOT_COLOR[item.category ?? 'Other'] ?? '#9CA3AF';
  const isBought = item.isBought;
  const sepColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';

  return (
    <Pressable
      onPress={selecting ? onToggleSelect : onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 11, paddingHorizontal: 16,
        backgroundColor: pressed ? (isDark ? 'rgba(124,58,237,0.07)' : '#FAF8FF') : 'transparent',
        opacity: isBought ? 0.45 : 1,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: sepColor,
      })}
    >
      {/* Left: checkbox or dot */}
      <View style={{ width: 28, alignItems: 'center', marginRight: 12 }}>
        {selecting ? (
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? '#7C3AED' : (isDark ? '#475569' : '#CBD5E1'), backgroundColor: selected ? '#7C3AED' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: (CAT_DOT_COLOR[item.category ?? 'Other'] ?? '#9CA3AF') + '1A', alignItems: 'center', justifyContent: 'center' }}>
            <CatIcon category={item.category} size={18} color={CAT_DOT_COLOR[item.category ?? 'Other'] ?? '#9CA3AF'} />
          </View>
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: isBought ? colors.textTertiary : colors.textPrimary, textDecorationLine: isBought ? 'line-through' : 'none' }} numberOfLines={1}>
          {item.name}
        </Text>
        {/* Subtitle: qty · store · AI badge */}
        {(item.quantity || item.storePreference || item.aiGenerated || item.notes) && (
          <Text style={{ fontSize: 12, color: isDark ? '#64748B' : '#94A3B8', marginTop: 2 }} numberOfLines={1}>
            {[
              item.quantity,
              item.storePreference,
              item.aiGenerated ? '✨ AI' : null,
              item.notes,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {/* Right: price + buy */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {priceInfo?.price != null && (
          <Text style={{ fontSize: 12, fontWeight: '800', color: priceInfo.source === 'kroger' ? '#15803D' : '#B45309' }}>
            ${priceInfo.price.toFixed(2)}
          </Text>
        )}
        <Pressable onPress={onBuy} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: isBought ? (isDark ? '#064E3B' : '#D1FAE5') : (isDark ? '#0F172A' : '#F1F5F9'), alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: isBought ? '#10B981' : (isDark ? '#1E293B' : '#E2E8F0') }}>
          <Ionicons name="checkmark" size={15} color={isBought ? '#10B981' : (isDark ? '#475569' : '#CBD5E1')} />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Run Card ─────────────────────────────────────────────────────────────────

function RunCard({ run, onPress, onDelete, colors, isDark }: {
  run: GroceryRun; onPress: () => void; onDelete?: () => void;
  colors: any; isDark: boolean;
}) {
  const cardBg = isDark ? '#1F1F38' : '#FFFFFF';
  const border = isDark ? '#2D2D4E' : '#E5E7EB';
  const isActive = run.status === 'active';
  const isDone   = run.status === 'done';

  return (
    <Pressable onPress={onPress} style={[rc.card, { backgroundColor: cardBg, borderColor: isActive ? colors.primary : border }]}>
      {isActive && <View style={[rc.activePulse, { borderColor: colors.primary }]} />}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[rc.name, { color: colors.textPrimary }]}>{run.name}</Text>
          <View style={[rc.badge, { backgroundColor: isActive ? '#DCFCE7' : isDone ? '#F3F4F6' : '#EEF2FF' }]}>
            <Text style={[rc.badgeText, { color: isActive ? '#16A34A' : isDone ? '#6B7280' : colors.primary }]}>
              {isActive ? 'LIVE' : isDone ? 'DONE' : 'DRAFT'}
            </Text>
          </View>
        </View>
        <Text style={[rc.store, { color: colors.textSecondary }]}>🏪 {run.store}</Text>
        {run.plannedAt && <Text style={[rc.store, { color: colors.textMuted ?? '#9CA3AF' }]}>📅 {new Date(run.plannedAt).toLocaleDateString()}</Text>}
        <Text style={[rc.ago, { color: colors.textMuted ?? '#9CA3AF' }]}>{fmtDate(run.createdAt)}</Text>
      </View>
      <View style={{ gap: 6, alignItems: 'flex-end' }}>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted ?? '#9CA3AF'} />
        {!isActive && onDelete && (
          <Pressable onPress={onDelete} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

// ─── AI Grocery Sheet ─────────────────────────────────────────────────────────

interface AiSuggestedItem {
  name: string;
  quantity?: string;
  category?: string;
  storePreference?: string;
  notes?: string;
  isDuplicate?: boolean;
}

const AI_QUICK_PROMPTS = ['Weekly staples', 'Healthy breakfast', 'School lunch', 'Weekend BBQ', 'Party for 12', 'Sunday cooking'];

// Inline AI panel — shown inside the List tab ScrollView (CubeAI-style banner)
function AiPanel({ familyId, memberId, existingItems, colors, isDark, onClose, onAdded }: {
  familyId: string; memberId: string; existingItems: GroceryItem[];
  colors: any; isDark: boolean; onClose: () => void; onAdded: () => void;
}) {
  const { addItem } = useGroceryStore();
  const [aiPrompt, setAiPrompt]         = useState('');
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiSuggested, setAiSuggested]   = useState<AiSuggestedItem[]>([]);
  const [aiSelected, setAiSelected]     = useState<Set<number>>(new Set());
  const [aiSummary, setAiSummary]       = useState('');
  const [aiEditingIdx, setAiEditingIdx] = useState<number | null>(null);
  const [aiEditName, setAiEditName]     = useState('');
  const [aiEditQty, setAiEditQty]       = useState('');
  const [adding, setAdding]             = useState(false);

  const existingNames = useMemo(() => new Set(existingItems.map(i => i.name.toLowerCase().trim())), [existingItems]);
  const P      = colors.primary;
  const panelBg = isDark ? '#1a1035' : '#f5f3ff';
  const chipBg  = isDark ? '#2d1a5e' : '#ede9fe';
  const border  = isDark ? '#4C1D95' : '#DDD6FE';

  const runAiGenerate = async (text: string) => {
    if (!text.trim()) return;
    setAiLoading(true); setAiSuggested([]); setAiSummary('');
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: { action: 'grocery_suggest', prompt: text.trim(),
          existingItems: existingItems.map(i => i.name),
          localeHint: Intl.DateTimeFormat().resolvedOptions().locale },
      });
      if (error) throw error;
      const items: AiSuggestedItem[] = (data?.items ?? []).map((item: AiSuggestedItem) => ({
        ...item, isDuplicate: existingNames.has(item.name.toLowerCase().trim()),
      }));
      setAiSuggested(items);
      setAiSummary(data?.summary ?? '');
      const presel = new Set<number>();
      items.forEach((item, i) => { if (!item.isDuplicate) presel.add(i); });
      setAiSelected(presel);
    } catch (e: any) {
      Alert.alert('AI Error', e?.message ?? 'Something went wrong. Try again.');
    } finally { setAiLoading(false); }
  };

  const toggleAi = (i: number) => setAiSelected(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const handleAdd = async () => {
    const toAdd = aiSuggested.filter((_, i) => aiSelected.has(i));
    if (!toAdd.length) return;
    setAdding(true);
    try {
      await Promise.all(toAdd.map(item => addItem({
        familyId, name: item.name, quantity: item.quantity,
        category: item.category, storePreference: item.storePreference,
        notes: item.notes, addedBy: memberId, aiGenerated: true,
      })));
      setAiSuggested([]); setAiSelected(new Set()); setAiPrompt(''); setAiSummary('');
      onAdded();
    } finally { setAdding(false); }
  };

  return (
    <View style={{ backgroundColor: panelBg, borderRadius: 16, borderWidth: 1.5, borderColor: border, padding: 14, marginBottom: 16 }}>
      {/* Banner header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: P + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>🤖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>CubeAI</Text>
            <View style={{ backgroundColor: P, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>ACTIVE</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>Suggest items for your list</Text>
        </View>
        <Pressable onPress={onClose} style={{ padding: 6 }}>
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Quick prompts */}
      {!aiSuggested.length && !aiLoading && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, paddingRight: 4 }}>
            {AI_QUICK_PROMPTS.map(p => (
              <Pressable key={p} onPress={() => { setAiPrompt(p); runAiGenerate(p); }}
                style={{ backgroundColor: chipBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, color: P, fontWeight: '600' }}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Input row */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput
          value={aiPrompt} onChangeText={setAiPrompt}
          placeholder="Describe what you need…"
          placeholderTextColor={colors.placeholder}
          style={{ flex: 1, backgroundColor: isDark ? '#2d1a5e' : '#fff', borderRadius: 10, borderWidth: 1, borderColor: border,
            paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.textPrimary }}
          returnKeyType="go" onSubmitEditing={() => runAiGenerate(aiPrompt)}
        />
        <Pressable onPress={() => runAiGenerate(aiPrompt)} disabled={!aiPrompt.trim() || aiLoading}
          style={{ backgroundColor: aiPrompt.trim() && !aiLoading ? P : colors.border, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
          {aiLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Go</Text>}
        </Pressable>
      </View>

      {/* Suggestions */}
      {aiSuggested.map((item, i) => (
        <View key={i}>
          {aiEditingIdx === i ? (
            <View style={{ backgroundColor: isDark ? '#2d1a5e' : '#fff', borderRadius: 10, borderWidth: 1, borderColor: border, padding: 10, marginBottom: 6 }}>
              <TextInput value={aiEditName} onChangeText={setAiEditName}
                style={{ fontSize: 14, color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: border, paddingBottom: 4, marginBottom: 8 }} />
              <TextInput value={aiEditQty} onChangeText={setAiEditQty} placeholder="Qty"
                placeholderTextColor={colors.placeholder}
                style={{ fontSize: 13, color: colors.textSecondary }} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => {
                  const updated = [...aiSuggested];
                  updated[i] = { ...updated[i], name: aiEditName.trim() || updated[i].name, quantity: aiEditQty.trim() || updated[i].quantity };
                  setAiSuggested(updated); setAiEditingIdx(null);
                }} style={{ flex: 1, backgroundColor: P, borderRadius: 8, paddingVertical: 7, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Save</Text>
                </Pressable>
                <Pressable onPress={() => setAiEditingIdx(null)}
                  style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => !item.isDuplicate && toggleAi(i)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
                borderBottomWidth: i < aiSuggested.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: border,
                opacity: item.isDuplicate ? 0.5 : 1 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                borderColor: item.isDuplicate ? colors.border : (aiSelected.has(i) ? P : colors.border),
                backgroundColor: aiSelected.has(i) && !item.isDuplicate ? P : 'transparent',
                alignItems: 'center', justifyContent: 'center' }}>
                {aiSelected.has(i) && !item.isDuplicate && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{[item.quantity, item.category].filter(Boolean).join(' · ')}</Text>
              </View>
              {!item.isDuplicate && (
                <>
                  <Pressable onPress={() => { setAiEditingIdx(i); setAiEditName(item.name); setAiEditQty(item.quantity ?? ''); }}
                    style={{ padding: 6 }}>
                    <Ionicons name="pencil-outline" size={15} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => { setAiSuggested(prev => prev.filter((_, j) => j !== i)); setAiSelected(prev => { const n = new Set(prev); n.delete(i); return n; }); }}
                    style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={15} color="#ef4444" />
                  </Pressable>
                </>
              )}
            </Pressable>
          )}
        </View>
      ))}

      {/* Add button */}
      {aiSuggested.length > 0 && (
        <Pressable onPress={handleAdd} disabled={!aiSelected.size || adding}
          style={{ backgroundColor: aiSelected.size ? '#10b981' : colors.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 }}>
          {adding
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add {aiSelected.size} item{aiSelected.size !== 1 ? 's' : ''} to list</Text>
          }
        </Pressable>
      )}
    </View>
  );
}

// ─── Item Detail Sheet ────────────────────────────────────────────────────────

function ItemDetailSheet({ item, members, onClose, onEdit, onBuy, onDelete, colors, isDark, priceInfo }: {
  item: GroceryItem | null; members: any[];
  onClose: () => void; onEdit: () => void; onBuy: () => void; onDelete?: () => void;
  colors: any; isDark: boolean;
  priceInfo?: { price: number | null; unit: string | null; source: 'kroger' | 'estimate' | 'unknown' };
}) {
  if (!item) return null;
  const dotColor = CAT_DOT_COLOR[item.category ?? 'Other'] ?? '#9CA3AF';
  const sheetBg  = isDark ? '#1A1F35' : '#FFFFFF';

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} />
      <View style={{ backgroundColor: sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 36 }}>
        {/* Handle */}
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: isDark ? '#334155' : '#E2E8F0' }} />
        </View>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: dotColor + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: dotColor + '30' }}>
            <CatIcon category={item.category} size={24} color={dotColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#F8FAFC' : '#1E2D6B' }}>{item.name}</Text>
            {item.category && (
              <Text style={{ fontSize: 12, fontWeight: '700', color: dotColor, marginTop: 1 }}>{item.category}</Text>
            )}
          </View>
          {priceInfo?.price != null && (
            <View style={{ backgroundColor: priceInfo.source === 'kroger' ? '#DCFCE7' : '#FEF3C7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: priceInfo.source === 'kroger' ? '#6EE7B7' : '#FCD34D' }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: priceInfo.source === 'kroger' ? '#15803D' : '#B45309' }}>${priceInfo.price.toFixed(2)}</Text>
              <Text style={{ fontSize: 9, fontWeight: '700', color: priceInfo.source === 'kroger' ? '#16A34A' : '#D97706' }}>{priceInfo.source === 'kroger' ? 'Kroger' : '~est'}</Text>
            </View>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', marginHorizontal: 20, marginBottom: 14 }} />

        {/* Details */}
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {item.quantity && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#64748B' : '#94A3B8', width: 70 }}>Quantity</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F1F5F9' : '#1E293B' }}>{item.quantity}</Text>
            </View>
          )}
          {item.storePreference && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#64748B' : '#94A3B8', width: 70 }}>Store</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F1F5F9' : '#1E293B' }}>{item.storePreference}</Text>
            </View>
          )}
          {item.notes && (
            <View style={{ backgroundColor: isDark ? '#1E1B4B' : '#F5F3FF', borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: '#7C3AED' }}>
              <Text style={{ fontSize: 12, color: isDark ? '#C4B5FD' : '#4338CA', fontStyle: 'italic' }}>"{item.notes}"</Text>
            </View>
          )}
          <Text style={{ fontSize: 11, color: isDark ? '#475569' : '#94A3B8', marginTop: 2 }}>
            {fmtProvenance(item, members)}
          </Text>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 18 }}>
          {onDelete && (
            <Pressable onPress={() => { onDelete(); onClose(); }} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? '#450A0A' : '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </Pressable>
          )}
          <Pressable onPress={() => { onEdit(); onClose(); }} style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderRadius: 14, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => { onBuy(); onClose(); }} style={{ flex: 2, backgroundColor: '#10B981', borderRadius: 14, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>✓ Mark Bought</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GroceryScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const { items, runs, loading, load, addItem, buyItem, removeItem, deleteRun } = useGroceryStore();

  const [tab, setTab]                   = useState<'list' | 'runs'>('list');
  const [showAddItem, setShowAddItem]   = useState(false);
  const [editingItem, setEditingItem]   = useState<GroceryItem | undefined>(undefined);
  const [detailItem,  setDetailItem]    = useState<GroceryItem | null>(null);
  const [showNewRun,  setShowNewRun]    = useState(false);
  const [showAiPanel, setShowAiPanel]   = useState(false);
  const [selectedRun, setSelectedRun]  = useState<GroceryRun | null>(null);

  // Price comparison state
  const [priceMap, setPriceMap]         = useState<Record<string, { price: number | null; unit: string | null; source: 'kroger' | 'estimate' | 'unknown' }>>({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [pricesLoaded, setPricesLoaded] = useState(false);

  const checkPrices = async () => {
    const unbought = items.filter(i => !i.isBought);
    // Only fetch delta items — skip those already priced
    const toFetch = unbought.filter(i => !priceMap[i.name]);
    if (!toFetch.length) return;
    setPriceLoading(true);
    try {
      // Get live location for country + zip — 5s timeout
      let country = 'US';
      let zipCode: string | undefined;
      try {
        const { getLocationAPI } = await import('@/lib/location');
        const locationAPI = getLocationAPI();
        if (locationAPI) {
          const status = await Promise.race([
            locationAPI.requestForegroundPermissionsAsync().then(r => r.status),
            new Promise<string>(res => setTimeout(() => res('denied'), 5000)),
          ]);
          if (status === 'granted') {
            const loc = await Promise.race([
              locationAPI.getCurrentPositionAsync({ accuracy: locationAPI.Accuracy.Low }),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
            ]);
            const [place] = await locationAPI.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            country = place?.isoCountryCode ?? 'US';
            zipCode = place?.postalCode ?? undefined;
          }
        }
      } catch (locErr) {
        console.warn('[GroceryScreen] location lookup failed:', String(locErr));
      }

      const timer = setTimeout(() => {}, 20_000);
      try {
        const { data, error } = await supabase.functions.invoke('kroger-prices', {
          body: { items: toFetch.map(i => i.name), country, zipCode },
        });
        if (error) console.error('[GroceryScreen] kroger-prices error:', error);
        if (data?.prices) {
          const newEntries: typeof priceMap = {};
          for (const p of data.prices) {
            newEntries[p.name] = { price: p.krogerPrice ?? p.fallbackEstimate, unit: p.unit, source: p.source };
          }
          // Merge with existing prices (don't overwrite already-priced items)
          setPriceMap(prev => ({ ...prev, ...newEntries }));
          setPricesLoaded(true);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.error('[GroceryScreen] checkPrices() uncaught error:', String(err));
    }
    setPriceLoading(false);
  };
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const isSelecting = selectedIds.size > 0;

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isKid = (activeMember as any)?.role === 'kid';
  const familyId = (activeMember as any)?.familyId ?? 'family-1';

  useEffect(() => {
    load(familyId);
  }, [familyId]);

  // Prices are fetched on demand only (user taps "Estimate Prices" button)

  const cartTotal = useMemo(() => {
    return items
      .filter(i => !i.isBought)
      .reduce((sum, i) => sum + (priceMap[i.name]?.price ?? 0), 0);
  }, [items, priceMap]);

  // Group items by store preference
  const groupedItems = useMemo(() => {
    const groups: Record<string, GroceryItem[]> = {};
    for (const item of items) {
      const key = item.storePreference || 'Any store';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b));
  }, [items]);

  const activeRuns = runs.filter(r => r.status === 'active');
  const draftRuns  = runs.filter(r => r.status === 'draft');
  const doneRuns   = runs.filter(r => r.status === 'done');

  const bg       = isDark ? '#0F0F1E' : '#F8F9FA';
  const card     = isDark ? '#1F1F38' : '#FFFFFF';
  const border   = isDark ? '#2D2D4E' : '#E5E7EB';
  const P        = colors.primary;

  const handleBuyItem = (item: GroceryItem) => {
    Alert.alert('Mark as bought?', `"${item.name}"`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Bought ✓', onPress: () => buyItem(item.id, activeMemberId ?? '') },
    ]);
  };

  const handleDeleteRun = (run: GroceryRun) => {
    Alert.alert('Delete run?', `"${run.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRun(run.id) },
    ]);
  };

  return (
    <View style={[s.root, { backgroundColor: bg }]}>

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: card, borderBottomColor: border }]}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>🛒 Groceries</Text>
          {items.length > 0 && (
            <View style={[s.countBadge, { backgroundColor: '#7C3AED' }]}>
              <Text style={s.countText}>{items.length}</Text>
            </View>
          )}
        </View>
        {/* Action buttons row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => setShowAiPanel(v => !v)}
            style={[s.headerBtn, { borderColor: showAiPanel ? '#7C3AED' : 'rgba(124,58,237,0.3)', backgroundColor: showAiPanel ? 'rgba(124,58,237,0.15)' : 'transparent' }]}>
            <Text style={{ fontSize: 14 }}>✨</Text>
            <Text style={[s.headerBtnText, { color: '#7C3AED' }]}>AI</Text>
          </Pressable>
          <Pressable onPress={checkPrices} disabled={priceLoading}
            style={[s.headerBtn, { borderColor: pricesLoaded ? '#10B981' : 'rgba(124,58,237,0.3)', backgroundColor: pricesLoaded ? 'rgba(16,185,129,0.12)' : 'transparent' }]}>
            {priceLoading
              ? <ActivityIndicator size="small" color="#7C3AED" />
              : <><Ionicons name="pricetag-outline" size={16} color={pricesLoaded ? '#10B981' : '#7C3AED'} />
                  <Text style={[s.headerBtnText, { color: pricesLoaded ? '#10B981' : '#7C3AED' }]}>
                    {pricesLoaded ? 'Prices ✓' : 'Prices'}
                  </Text></>}
          </Pressable>
          <Pressable onPress={() => setShowNewRun(true)}
            style={[s.headerBtn, { borderColor: 'rgba(124,58,237,0.3)', backgroundColor: 'transparent' }]}>
            <Ionicons name="cart-outline" size={16} color="#7C3AED" />
            <Text style={[s.headerBtnText, { color: '#7C3AED' }]}>New Run</Text>
          </Pressable>
        </View>
      </View>

      {/* Cart total */}
      {cartTotal > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 10,
          backgroundColor: isDark ? '#1A1A2E' : '#F0EEFF',
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>
            🛒 Estimated cart total ({items.filter(i => !i.isBought).length} items)
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '900', color: P }}>
            ${cartTotal.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Active run banner */}
      {activeRuns.length > 0 && (
        <Pressable
          onPress={() => setSelectedRun(activeRuns[0])}
          style={[s.activeBanner, { backgroundColor: '#DCFCE7', borderColor: '#16A34A' }]}
        >
          <View style={s.activeDot} />
          <Text style={s.activeBannerText}>
            Shopping now at {activeRuns[0].store}
          </Text>
          <Text style={[s.activeBannerText, { fontWeight: '600' }]}>Tap to open →</Text>
        </Pressable>
      )}

      {/* Tab bar */}
      <View style={[s.tabRow, { backgroundColor: card, borderBottomColor: border }]}>
        {(['list', 'runs'] as const).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.tabBtn, tab === t && { borderBottomColor: P }]}>
            <Text style={[s.tabLabel, { color: tab === t ? P : colors.textSecondary }]}>
              {t === 'list' ? `Shopping List${items.length ? ` (${items.length})` : ''}` : `Runs${runs.length ? ` (${runs.length})` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={P} />
      ) : tab === 'list' ? (
        <>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {/* Inline AI panel */}
          {showAiPanel && (
            <AiPanel
              familyId={familyId} memberId={activeMemberId ?? ''}
              existingItems={items} colors={colors} isDark={isDark}
              onClose={() => setShowAiPanel(false)}
              onAdded={() => setShowAiPanel(false)}
            />
          )}

          {items.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🛒</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Nothing on the list</Text>
              <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>Tap + to add items or use ✨ AI to suggest.</Text>
            </View>
          ) : (
            groupedItems.map(([store, storeItems]) => (
              <View key={store} style={{ marginBottom: 22 }}>
                {/* Section header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="storefront-outline" size={12} color="#7C3AED" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 0.7 }}>
                      {store === 'Any store' ? 'Any Store' : store}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#475569' : '#94A3B8' }}>
                    {storeItems.filter(i => !i.isBought).length} left
                  </Text>
                </View>
                {/* Inset grouped list */}
                <View style={{ backgroundColor: isDark ? '#1A1F35' : '#FFFFFF', borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: isDark ? 'rgba(124,58,237,0.15)' : '#EDE9FE' }}>
                  {storeItems.map((item, idx) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      members={members}
                      selected={selectedIds.has(item.id)}
                      selecting={isSelecting}
                      isLast={idx === storeItems.length - 1}
                      priceInfo={priceMap[item.name]}
                      onPress={() => setDetailItem(item)}
                      onBuy={() => handleBuyItem(item)}
                      onLongPress={() => setSelectedIds(prev => { const n = new Set(prev); n.add(item.id); return n; })}
                      onToggleSelect={() => setSelectedIds(prev => {
                        const n = new Set(prev);
                        n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                        return n;
                      })}
                      onEdit={() => { setDetailItem(null); setEditingItem(item); setShowAddItem(true); }}
                      onDelete={isKid ? undefined : () => Alert.alert('Remove item?', `"${item.name}"`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => removeItem(item.id) },
                      ])}
                      colors={colors}
                      isDark={isDark}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Bulk action toolbar */}
        {isSelecting && (
          <View style={{ position: 'absolute', bottom: 90, left: 16, right: 16,
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: '#1A0A3D', borderRadius: 20,
            paddingVertical: 10, paddingHorizontal: 16, gap: 10,
            shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#FFF' }}>
              {selectedIds.size} selected
            </Text>
            <Pressable onPress={() => setSelectedIds(new Set(items.map(i => i.id)))}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Select All</Text>
            </Pressable>
            {!isKid && (
              <Pressable onPress={() => Alert.alert('Delete items?', `Remove ${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''} from the list?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: `Delete (${selectedIds.size})`, style: 'destructive', onPress: () => {
                  selectedIds.forEach(id => removeItem(id));
                  setSelectedIds(new Set());
                }},
              ])}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#EF4444' }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Delete ({selectedIds.size})</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setSelectedIds(new Set())}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        )}
        </>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {runs.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🗓️</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No runs yet</Text>
              <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>Create a run when you're heading to a store. Items in your list will be ready to add.</Text>
            </View>
          ) : (
            <>
              {activeRuns.length > 0 && (
                <>
                  <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>ACTIVE</Text>
                  {activeRuns.map(run => (
                    <RunCard key={run.id} run={run} onPress={() => setSelectedRun(run)} onDelete={isKid ? undefined : () => handleDeleteRun(run)} colors={colors} isDark={isDark} />
                  ))}
                </>
              )}
              {draftRuns.length > 0 && (
                <>
                  <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>DRAFT</Text>
                  {draftRuns.map(run => (
                    <RunCard key={run.id} run={run} onPress={() => setSelectedRun(run)} onDelete={isKid ? undefined : () => handleDeleteRun(run)} colors={colors} isDark={isDark} />
                  ))}
                </>
              )}
              {doneRuns.length > 0 && (
                <>
                  <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>COMPLETED</Text>
                  {doneRuns.map(run => (
                    <RunCard key={run.id} run={run} onPress={() => setSelectedRun(run)} onDelete={isKid ? undefined : () => handleDeleteRun(run)} colors={colors} isDark={isDark} />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <Pressable
        onPress={() => setShowAddItem(true)}
        style={[s.fab, { backgroundColor: P, bottom: insets.bottom + 80 }]}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </Pressable>

      {/* Sheets */}
      <AddItemSheet
        visible={showAddItem}
        onClose={() => { setShowAddItem(false); setEditingItem(undefined); }}
        familyId={familyId}
        memberId={activeMemberId ?? ''}
        colors={colors}
        isDark={isDark}
        editItem={editingItem}
      />
      <CreateRunSheet
        visible={showNewRun}
        onClose={() => setShowNewRun(false)}
        familyId={familyId}
        memberId={activeMemberId ?? ''}
        colors={colors}
        isDark={isDark}
        onCreated={(run) => { setShowNewRun(false); setSelectedRun(run); setTab('runs'); }}
      />
      <RunDetailSheet
        run={selectedRun}
        visible={!!selectedRun}
        onClose={() => setSelectedRun(null)}
        memberId={activeMemberId ?? ''}
        pendingItems={items}
        colors={colors}
        isDark={isDark}
      />
      <ItemDetailSheet
        item={detailItem}
        members={members}
        onClose={() => setDetailItem(null)}
        onEdit={() => { setEditingItem(detailItem ?? undefined); setShowAddItem(true); }}
        onBuy={() => detailItem && handleBuyItem(detailItem)}
        onDelete={isKid ? undefined : () => detailItem && Alert.alert('Remove item?', `"${detailItem.name}"`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeItem(detailItem.id) },
        ])}
        priceInfo={detailItem ? priceMap[detailItem.name] : undefined}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'column', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle:   { fontSize: TYPO.heading, fontWeight: '700' },
  countBadge:    { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText:     { color: '#FFF', fontSize: 12, fontWeight: '700' },
  headerBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: RADIUS.md ?? 10, paddingVertical: 6, paddingHorizontal: 10 },
  headerBtnText: { fontSize: 13, fontWeight: '600' },
  activeBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1.5 },
  activeDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  activeBannerText: { fontSize: 13, color: '#16A34A' },
  tabRow:        { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:        { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel:      { fontSize: 14, fontWeight: '600' },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  empty:         { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji:    { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyDesc:     { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  fab:           { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
});

const sh = StyleSheet.create({
  sheet:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 20, paddingBottom: 32 },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  title:    { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input:    { borderWidth: 1.5, borderRadius: RADIUS.md ?? 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  catChip:  { borderWidth: 1.5, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  btn:      { borderRadius: RADIUS.md ?? 10, paddingVertical: 14, alignItems: 'center' },
  btnText:  { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

const ic = StyleSheet.create({
  card:        { flexDirection: 'row', borderRadius: RADIUS.md ?? 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 8, gap: 10, alignItems: 'center' },
  name:        { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  tag:         { fontSize: 11 },
  notes:       { fontSize: 11, marginTop: 3 },
  ago:         { fontSize: 10, marginTop: 4 },
  buyBtn:      { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#10B981' },
  delBtn:      { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#EF4444' },
  priceBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  priceText:   { fontSize: 13, fontWeight: '800' },
  priceSource: { fontSize: 10, fontWeight: '700' },
  catChip:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,184,166,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  catChipText: { fontSize: 11, fontWeight: '600', color: '#14B8A6' },
  qtyChip:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  qtyChipText: { fontSize: 11, fontWeight: '600', color: '#F59E0B' },
});

const rc = StyleSheet.create({
  card:        { flexDirection: 'row', borderRadius: RADIUS.md ?? 10, borderWidth: 1.5, padding: 14, marginBottom: 10, gap: 12 },
  activePulse: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: RADIUS.md ?? 10, borderWidth: 2, opacity: 0.4 },
  name:        { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  badge:       { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  store:       { fontSize: 13, marginBottom: 2 },
  ago:         { fontSize: 11, marginTop: 4 },
});

const rd = StyleSheet.create({
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 12, fontWeight: '600' },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: 3 },
  tabRow:      { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, marginBottom: 4 },
  tabBtn:      { flex: 1, paddingVertical: 8, alignItems: 'center' },
  tabText:     { fontSize: 13, fontWeight: '600' },
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 8 },
  checkbox:    { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemName:    { fontSize: 14, fontWeight: '500' },
  addBtn:      { borderWidth: 1.5, borderRadius: 16, paddingVertical: 4, paddingHorizontal: 10 },
});
