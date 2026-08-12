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
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert, Animated,
  FlatList, ActivityIndicator, SectionList, Switch,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useGroceryStore, GroceryItem, GroceryRun, GroceryRunItem } from '@/store/groceryStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Category suggestions ─────────────────────────────────────────────────────

const CATEGORIES = ['Produce', 'Dairy', 'Grains', 'Spices', 'Meat', 'Snacks', 'Beverages', 'Frozen', 'Cleaning', 'Personal Care', 'Other'];
const CAT_EMOJI: Record<string, string> = {
  Produce: '🥦', Dairy: '🥛', Grains: '🌾', Spices: '🌶️', Meat: '🥩',
  Snacks: '🍿', Beverages: '🧃', Frozen: '🧊', Cleaning: '🧹', 'Personal Care': '🧴', Other: '📦',
};

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

function AddItemSheet({ visible, onClose, familyId, memberId, colors, isDark }: {
  visible: boolean; onClose: () => void;
  familyId: string; memberId: string;
  colors: any; isDark: boolean;
}) {
  const addItem = useGroceryStore(s => s.addItem);
  const [name, setName]   = useState('');
  const [qty,  setQty]    = useState('');
  const [cat,  setCat]    = useState('');
  const [store, setStore] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(''); setQty(''); setCat(''); setStore(''); setNotes(''); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await addItem({
      familyId, name: name.trim(), quantity: qty.trim() || undefined,
      category: cat || undefined, storePreference: store.trim() || undefined,
      addedBy: memberId, notes: notes.trim() || undefined,
    });
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
          <Text style={[sh.title, { color: colors.textPrimary }]}>Add Item</Text>

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
                  <Text style={{ fontSize: 12, color: cat === c ? '#FFF' : colors.textSecondary }}>
                    {CAT_EMOJI[c]} {c}
                  </Text>
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
              : <Text style={sh.btnText}>Add to List</Text>}
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
  const [runItems,  setRunItems]  = useState<GroceryRunItem[]>([]);
  const [adding,    setAdding]    = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [tab,       setTab]       = useState<'items' | 'add'>('items');

  // Realtime subscription for run items
  const runItemSubRef = useRef<any>(null);

  useEffect(() => {
    if (!run || !visible) return;

    loadRunDetail(run.id).then(detail => {
      setRunItems(detail?.runItems ?? []);
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
              {(['items', 'add'] as const).map(t => (
                <Pressable key={t} onPress={() => setTab(t)} style={[rd.tabBtn, tab === t && { backgroundColor: colors.primary }]}>
                  <Text style={[rd.tabText, { color: tab === t ? '#FFF' : colors.textSecondary }]}>
                    {t === 'items' ? `List (${runItems.length})` : '+ Add Items'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Items list */}
          {tab === 'items' && (
            <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {runItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🛒</Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>No items yet. Add items from the pool.</Text>
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

function ItemCard({ item, memberId, onBuy, onRemove, colors, isDark }: {
  item: GroceryItem; memberId: string;
  onBuy: () => void; onRemove: () => void;
  colors: any; isDark: boolean;
}) {
  const cardBg  = isDark ? '#1F1F38' : '#FFFFFF';
  const border  = isDark ? '#2D2D4E' : '#E5E7EB';

  return (
    <View style={[ic.card, { backgroundColor: cardBg, borderColor: border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[ic.name, { color: colors.textPrimary }]}>{item.name}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
          {item.quantity && <Text style={[ic.tag, { color: colors.textSecondary }]}>📦 {item.quantity}</Text>}
          {item.category && <Text style={[ic.tag, { color: colors.textSecondary }]}>{CAT_EMOJI[item.category] ?? '•'} {item.category}</Text>}
          {item.storePreference && <Text style={[ic.tag, { color: colors.textSecondary }]}>🏪 {item.storePreference}</Text>}
          {item.aiGenerated && <View style={[ic.aiBadge, { backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}><Text style={{ fontSize: 10, color: colors.primary }}>✨ AI</Text></View>}
        </View>
        {item.notes && <Text style={[ic.notes, { color: colors.textMuted ?? '#9CA3AF' }]} numberOfLines={1}>{item.notes}</Text>}
        <Text style={[ic.ago, { color: colors.textMuted ?? '#9CA3AF' }]}>{fmtDate(item.createdAt)}</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Pressable onPress={onBuy} style={[ic.buyBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="checkmark" size={14} color="#FFF" />
        </Pressable>
        <Pressable onPress={onRemove} style={[ic.delBtn, { borderColor: isDark ? '#4B5563' : '#E5E7EB' }]}>
          <Ionicons name="trash-outline" size={14} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Run Card ─────────────────────────────────────────────────────────────────

function RunCard({ run, onPress, onDelete, colors, isDark }: {
  run: GroceryRun; onPress: () => void; onDelete: () => void;
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
        {!isActive && (
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

const AI_QUICK_PROMPTS = [
  '🍝 Pasta night for 4',
  '🥗 Healthy week meals',
  '🎉 Weekend BBQ party',
  '🥞 Weekend breakfast',
  '🧁 Baking supplies',
];

function AiGrocerySheet({ visible, onClose, existingItems, familyId, memberId, colors, isDark }: {
  visible: boolean; onClose: () => void;
  existingItems: GroceryItem[];
  familyId: string; memberId: string;
  colors: any; isDark: boolean;
}) {
  const { addItem } = useGroceryStore();
  const [prompt, setPrompt]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestedItem[]>([]);
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [summary, setSummary]       = useState('');
  const [adding, setAdding]         = useState(false);

  const existingNames = useMemo(
    () => new Set(existingItems.map(i => i.name.toLowerCase().trim())),
    [existingItems],
  );

  const reset = () => {
    setPrompt(''); setSuggestions([]); setSelected(new Set()); setSummary(''); setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const runAi = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setSuggestions([]);
    setSummary('');
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          action: 'grocery_ai',
          prompt: text.trim(),
          existingItems: existingItems.map(i => i.name),
        },
      });
      if (error) throw error;
      const items: AiSuggestedItem[] = (data?.items ?? []).map((item: AiSuggestedItem) => ({
        ...item,
        isDuplicate: existingNames.has(item.name.toLowerCase().trim()),
      }));
      setSuggestions(items);
      setSummary(data?.summary ?? '');
      // Pre-select all non-duplicates
      const presel = new Set<number>();
      items.forEach((item, i) => { if (!item.isDuplicate) presel.add(i); });
      setSelected(presel);
    } catch (e: any) {
      Alert.alert('AI Error', e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleAdd = async () => {
    const toAdd = suggestions.filter((_, i) => selected.has(i));
    if (!toAdd.length) return;
    setAdding(true);
    try {
      await Promise.all(toAdd.map(item => addItem({
        familyId, name: item.name,
        quantity: item.quantity,
        category: item.category,
        storePreference: item.storePreference,
        notes: item.notes,
        addedBy: memberId,
        aiGenerated: true,
      })));
      handleClose();
    } finally {
      setAdding(false);
    }
  };

  const bg     = isDark ? '#0f0a1e' : '#f5f3ff';
  const border = isDark ? '#4C1D95' : '#DDD6FE';
  const P      = colors.primary;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
        <View style={[sh.sheet, { backgroundColor: isDark ? '#1a1035' : '#fff', borderColor: border, maxHeight: '88%' }]}>
          <View style={sh.handle} />
          <Text style={[sh.title, { color: colors.textPrimary }]}>✨ AI Grocery List</Text>

          {/* Quick prompts */}
          {!suggestions.length && !loading && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                {AI_QUICK_PROMPTS.map(p => (
                  <Pressable key={p} onPress={() => { setPrompt(p); runAi(p); }}
                    style={{ backgroundColor: bg, borderColor: border, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 13, color: P, fontWeight: '600' }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Text input */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TextInput
              value={prompt} onChangeText={setPrompt}
              placeholder="Describe what you need…"
              placeholderTextColor={colors.placeholder}
              style={[sh.input, { flex: 1, color: colors.textPrimary, borderColor: border, backgroundColor: bg, marginBottom: 0 }]}
              returnKeyType="go"
              onSubmitEditing={() => runAi(prompt)}
            />
            <Pressable
              onPress={() => runAi(prompt)}
              disabled={!prompt.trim() || loading}
              style={{ backgroundColor: prompt.trim() ? P : colors.border, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' }}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="sparkles" size={18} color="#fff" />
              }
            </Pressable>
          </View>

          {/* Loading state */}
          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator color={P} size="large" />
              <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>Thinking…</Text>
            </View>
          )}

          {/* Results */}
          {!loading && suggestions.length > 0 && (
            <>
              {!!summary && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 12, lineHeight: 18 }}>{summary}</Text>
              )}
              <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 }}>
                {selected.size} OF {suggestions.length} SELECTED
              </Text>
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {suggestions.map((item, i) => (
                  <Pressable key={i} onPress={() => !item.isDuplicate && toggleItem(i)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
                      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border,
                      opacity: item.isDuplicate ? 0.5 : 1 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                      borderColor: item.isDuplicate ? colors.border : (selected.has(i) ? P : colors.border),
                      backgroundColor: selected.has(i) && !item.isDuplicate ? P : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {selected.has(i) && !item.isDuplicate && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{item.name}</Text>
                        {item.isDuplicate && (
                          <View style={{ backgroundColor: isDark ? '#1e293b' : '#F1F5F9', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '700' }}>HAVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {[item.quantity, item.category, item.storePreference].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                onPress={handleAdd}
                disabled={!selected.size || adding}
                style={[sh.btn, { backgroundColor: selected.size ? P : colors.border, marginTop: 16 }]}
              >
                {adding
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={sh.btnText}>Add {selected.size} item{selected.size !== 1 ? 's' : ''} to list</Text>
                }
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GroceryScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const { items, runs, loading, load, addItem, buyItem, removeItem, deleteRun } = useGroceryStore();

  const [tab, setTab]             = useState<'list' | 'runs'>('list');
  const [showAddItem, setShowAddItem]   = useState(false);
  const [showNewRun,  setShowNewRun]    = useState(false);
  const [showAi,      setShowAi]        = useState(false);
  const [selectedRun, setSelectedRun]  = useState<GroceryRun | null>(null);

  const activeMember = members.find(m => m.id === activeMemberId);
  const familyId = members[0]?.id ? 'family-1' : 'family-1'; // TODO: real family id from store

  useEffect(() => {
    load(familyId);
  }, [familyId]);

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
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>🛒 Groceries</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {items.length > 0 && (
            <View style={[s.countBadge, { backgroundColor: P }]}>
              <Text style={s.countText}>{items.length}</Text>
            </View>
          )}
          <Pressable onPress={() => setShowAi(true)} style={[s.headerBtn, { borderColor: border }]}>
            <Text style={{ fontSize: 14 }}>✨</Text>
            <Text style={[s.headerBtnText, { color: P }]}>AI</Text>
          </Pressable>
          <Pressable onPress={() => setShowNewRun(true)} style={[s.headerBtn, { borderColor: border }]}>
            <Ionicons name="cart-outline" size={18} color={P} />
            <Text style={[s.headerBtnText, { color: P }]}>New Run</Text>
          </Pressable>
        </View>
      </View>

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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🛒</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Nothing on the list</Text>
              <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>Tap + to add items. Anyone in the family can add when they think of something.</Text>
            </View>
          ) : (
            groupedItems.map(([store, storeItems]) => (
              <View key={store} style={{ marginBottom: 20 }}>
                <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>
                  {store === 'Any store' ? '🏪 No store preference' : `🏪 ${store}`}
                </Text>
                {storeItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    memberId={activeMemberId ?? ''}
                    onBuy={() => handleBuyItem(item)}
                    onRemove={() => removeItem(item.id)}
                    colors={colors}
                    isDark={isDark}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
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
                    <RunCard key={run.id} run={run} onPress={() => setSelectedRun(run)} onDelete={() => handleDeleteRun(run)} colors={colors} isDark={isDark} />
                  ))}
                </>
              )}
              {draftRuns.length > 0 && (
                <>
                  <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>DRAFT</Text>
                  {draftRuns.map(run => (
                    <RunCard key={run.id} run={run} onPress={() => setSelectedRun(run)} onDelete={() => handleDeleteRun(run)} colors={colors} isDark={isDark} />
                  ))}
                </>
              )}
              {doneRuns.length > 0 && (
                <>
                  <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>COMPLETED</Text>
                  {doneRuns.map(run => (
                    <RunCard key={run.id} run={run} onPress={() => setSelectedRun(run)} onDelete={() => handleDeleteRun(run)} colors={colors} isDark={isDark} />
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
        onClose={() => setShowAddItem(false)}
        familyId={familyId}
        memberId={activeMemberId ?? ''}
        colors={colors}
        isDark={isDark}
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
      <AiGrocerySheet
        visible={showAi}
        onClose={() => setShowAi(false)}
        existingItems={items}
        familyId={familyId}
        memberId={activeMemberId ?? ''}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
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
  card:    { flexDirection: 'row', borderRadius: RADIUS.md ?? 10, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 8, gap: 12 },
  name:    { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  tag:     { fontSize: 12 },
  aiBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  notes:   { fontSize: 12, marginTop: 3 },
  ago:     { fontSize: 11, marginTop: 4 },
  buyBtn:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  delBtn:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
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
