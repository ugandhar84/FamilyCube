import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal, Alert, Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFamilyStore } from '@/store/familyStore';
import { useGroceryStore, GroceryItem, GroceryRun, GroceryRunItem } from '@/store/groceryStore';
import { useQuestStore } from '@/store/choreAdapter';
import { sh, rd } from './styles';

// ─── Run Detail Sheet ─────────────────────────────────────────────────────────

export function RunDetailSheet({ run, visible, onClose, memberId, pendingItems, colors, isDark }: {
  run: GroceryRun | null; visible: boolean; onClose: () => void;
  memberId: string; pendingItems: GroceryItem[];
  colors: any; isDark: boolean;
}) {
  const { members } = useFamilyStore();
  const { checkRunItem, uncheckRunItem, addItemToRun, removeItemFromRun, startRun, completeRun, loadRunDetail } = useGroceryStore();
  const addQuest = useQuestStore().addQuest;
  const [runItems,         setRunItems]         = useState<GroceryRunItem[]>([]);
  const [adding,           setAdding]           = useState(false);
  const [loadingId,        setLoadingId]        = useState<string | null>(null);
  const [notFoundIds,      setNotFoundIds]      = useState<Set<string>>(new Set());
  const [returnIds,        setReturnIds]        = useState<Set<string>>(new Set());
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  const [tab,              setTab]              = useState<'items' | 'add' | 'receipt'>('items');
  const [receiptUri,       setReceiptUri]       = useState<string | null>(null);
  const [receiptAnalysis,  setReceiptAnalysis]  = useState<any | null>(null);
  const [analyzingReceipt, setAnalyzingReceipt] = useState(false);

  const pickReceipt = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    // Pick at low quality — base64 only needed for AI, full res not needed
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, base64: false, quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setReceiptUri(uri);
      // Compress to max 800px wide, JPEG quality 0.5 (~100-200 KB)
      const ImageManipulator = await import('expo-image-manipulator');
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      await analyzeReceipt(compressed.base64 ?? '');
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

  const sheetBg  = colors.card;
  const border   = colors.border;
  const checkedColor = colors.success;

  const checkedCount = runItems.filter(ri => ri.checkedInRun).length;
  const isActive = run.status === 'active';
  const isDone   = run.status === 'done';
  // Was: check-off/"not here"/remove were only gated on !isDone, so a
  // still-draft trip (before "Start Shopping" is tapped) let you check
  // items off before the trip had even begun — live-reported. Checking off
  // is a shopping-in-progress action; it shouldn't be reachable until the
  // trip is actually active.
  const isDraft  = run.status === 'draft';

  // Items not already in this run
  const notInRun = pendingItems.filter(item => !runItems.find(ri => ri.itemId === item.id));

  const toggleCheck = async (ri: GroceryRunItem) => {
    if (isDone || isDraft) return;
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

  // "Not found here" — marks item unavailable at current store, keeps it on list
  const markNotFound = (ri: GroceryRunItem) => {
    const newSet = new Set(notFoundIds);
    if (newSet.has(ri.itemId)) {
      newSet.delete(ri.itemId);
    } else {
      newSet.add(ri.itemId);
    }
    setNotFoundIds(newSet);
  };

  // Switch store mid-run without losing progress
  const handleSwitchStore = async () => {
    const CHAIN_DEFAULTS = ['Costco', 'Walmart', 'Whole Foods', 'Trader Joe\'s', 'Patel Brothers', 'Aldi', 'Target', 'Kroger', 'Sprouts', 'H-E-B', 'Sam\'s Club', 'Meijer', 'Food Lion', 'Publix', 'Safeway', 'Smith\'s', 'King Soopers', 'WinCo', 'Lidl', 'Giant'];

    const doSwitch = async (storeName: string) => {
      await supabase.from('grocery_runs').update({ store: storeName }).eq('id', run.id);
    };

    // Pull stores this family has used before (most recent first)
    const { data: pastRows } = await supabase
      .from('grocery_runs')
      .select('store')
      .eq('family_id', run.familyId)
      .not('store', 'is', null)
      .order('created_at', { ascending: false })
      .limit(40);

    const pastStores: string[] = [];
    const seen = new Set<string>();
    for (const row of pastRows ?? []) {
      const s = (row.store as string | null)?.trim();
      if (s && !seen.has(s)) { seen.add(s); pastStores.push(s); }
    }

    // Merge: past stores first, then chain defaults not already shown
    const allSuggestions = [
      ...pastStores,
      ...CHAIN_DEFAULTS.filter(c => !seen.has(c)),
    ].filter(s => s !== run.store).slice(0, 7);

    const options: any[] = [
      {
        text: '✏️ Type store name…',
        onPress: () => {
          Alert.prompt(
            'Store Name',
            'Enter the store you\'re heading to:',
            async (name: string) => { if (name?.trim()) await doSwitch(name.trim()); },
            'plain-text',
            run.store ?? '',
          );
        },
      },
      ...allSuggestions.map(store => ({
        text: pastStores.includes(store) ? `⭐ ${store}` : store,
        onPress: () => doSwitch(store),
      })),
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert('Switch Store', `Currently at: ${run.store ?? 'Unknown'}\nChoose where you\'re heading:`, options);
  };

  // Hand off run to another family member
  const handleHandOff = () => {
    const others = members.filter(m => m.id !== memberId);
    if (others.length === 0) { Alert.alert('No other family members'); return; }
    Alert.alert(
      'Hand Off Trip',
      'Who is taking over this shopping trip?',
      [
        ...others.map(m => ({
          text: `${m.emoji ?? '👤'} ${m.name}`,
          onPress: async () => {
            await supabase.from('grocery_runs').update({ shopper_id: m.id }).eq('id', run.id);
            Alert.alert('Handed off', `${m.name} is now the shopper`);
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Create a return quest assigned to chosen member
  const createReturnQuest = (assigneeId: string, specificItems?: typeof runItems) => {
    const itemsToReturn = specificItems ?? runItems.filter(ri => returnIds.has(ri.itemId));
    if (itemsToReturn.length === 0) return;
    const itemList = itemsToReturn.map(ri => `• ${ri.item?.name ?? ri.itemId}${ri.item?.quantity ? ` (${ri.item.quantity})` : ''}`).join('\n');
    const assignee = members.find(m => m.id === assigneeId);

    addQuest({
      title: `Return items to ${run?.store ?? 'store'}`,
      description: `Items to return:\n${itemList}`,
      category: 'Shopping',
      priority: 'medium',
      status: 'todo',
      assignedToId: assigneeId,
      assignedToIds: [assigneeId],
      dueDate: undefined,
      coins: 10,
      xpReward: 0,
      recurrence: 'once',
      isPool: false,
      isAdultTask: false,
      photoRequired: false,
      isDaily: false,
    });

    setReturnIds(new Set());
    setShowReturnPicker(false);
    Alert.alert(
      '↩️ Return Quest Created',
      `"Return items to ${run?.store}" added to ${assignee?.name ?? 'their'} To-Do list.\n\nItems:\n${itemList}`,
      [{ text: 'OK' }]
    );
  };

  // Partial complete — only checked items marked bought, unchecked stay on list
  const handleComplete = () => {
    const notFoundCount = notFoundIds.size;
    const msg = notFoundCount > 0
      ? `${checkedCount} items will be marked bought. ${notFoundCount} "not found" item${notFoundCount > 1 ? 's' : ''} stay on your list for next time.`
      : `${checkedCount} items will be marked bought.`;

    Alert.alert('Finish Trip', msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish', style: 'default', onPress: async () => {
          // Remove "not found" items from this run so they stay on the list
          for (const itemId of notFoundIds) {
            await removeItemFromRun(run.id, itemId);
          }
          await completeRun(run.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <>
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={[sh.sheet, { backgroundColor: sheetBg, borderColor: border, maxHeight: '90%', minHeight: '72%', flex: 1 }]}>
          <View style={[sh.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={[sh.title, { color: colors.textPrimary, marginBottom: 2 }]}>{run.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[rd.statusBadge, { backgroundColor: isActive ? colors.successLight : isDone ? colors.surface : colors.primaryLight }]}>
                  <Text style={[rd.statusText, { color: isActive ? colors.success : isDone ? colors.textSecondary : colors.primary }]}>
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
              <View style={[rd.progressBar, { backgroundColor: colors.surface }]}>
                <View style={[rd.progressFill, { width: `${runItems.length ? (checkedCount / runItems.length) * 100 : 0}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                {checkedCount} of {runItems.length} items
              </Text>
            </View>
          )}

          {/* Sub-tabs */}
          {!isDone && (
            <View style={[rd.tabRow, { borderColor: border, backgroundColor: colors.surface }]}>
              {(['items', 'add', 'receipt'] as const).map(t => (
                <Pressable key={t} onPress={() => setTab(t)} style={[rd.tabBtn, tab === t && { backgroundColor: colors.primary }]}>
                  <Text style={[rd.tabText, { color: tab === t ? colors.textInverse : colors.textSecondary }]}>
                    {t === 'items' ? `List (${runItems.length})` : t === 'add' ? '+ Add' : '🧾 Receipt'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Items list */}
          {tab === 'items' && (
            <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {isDraft && runItems.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface,
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10 }}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary }}>
                    Tap "Start Shopping" below to check items off
                  </Text>
                </View>
              )}
              {runItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
                  <Text style={{ fontSize: 40 }}>🛒</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>No items yet</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>Tap "+ Add" above to add items from your grocery list.</Text>
                  <Pressable onPress={() => setTab('add')} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, marginTop: 4 }}>
                    <Text style={{ color: colors.textInverse, fontWeight: '700', fontSize: 14 }}>+ Add Items</Text>
                  </Pressable>
                </View>
              ) : (
                runItems.map((ri, riIdx) => {
                  const isNotFound = notFoundIds.has(ri.itemId);
                  return (
                    <Pressable
                      key={ri.itemId}
                      onPress={() => !isDone && !isDraft && !isNotFound && toggleCheck(ri)}
                      style={[rd.itemRow, {
                        backgroundColor: isNotFound ? colors.dangerLight : 'transparent',
                        borderBottomColor: border,
                        borderBottomWidth: riIdx < runItems.length - 1 ? StyleSheet.hairlineWidth : 0,
                        opacity: isNotFound ? 0.75 : isDraft ? 0.55 : 1,
                      }]}
                    >
                      {/* Checkbox */}
                      <View style={[rd.checkbox, {
                        borderColor: isNotFound ? colors.danger : ri.checkedInRun ? checkedColor : border,
                        backgroundColor: isNotFound ? colors.dangerLight : ri.checkedInRun ? checkedColor : 'transparent',
                      }]}>
                        {isNotFound
                          ? <Text style={{ fontSize: 10 }}>✕</Text>
                          : ri.checkedInRun
                            ? <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                            : loadingId === ri.itemId
                              ? <ActivityIndicator size="small" color={colors.primary} />
                              : null}
                      </View>

                      {/* Item info */}
                      <View style={{ flex: 1 }}>
                        <Text style={[rd.itemName, {
                          color: isNotFound ? colors.danger : colors.textPrimary,
                          textDecorationLine: ri.checkedInRun ? 'line-through' : 'none',
                          opacity: ri.checkedInRun ? 0.5 : 1,
                        }]}>
                          {ri.item?.name ?? ri.itemId}
                        </Text>
                        {isNotFound
                          ? <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '600', marginTop: 1 }}>Not found here — stays on list</Text>
                          : ri.item?.quantity
                            ? <Text style={{ fontSize: 12, color: colors.textSecondary }}>{ri.item.quantity}</Text>
                            : null}
                      </View>

                      {/* Actions */}
                      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                        {/* Return — one tap, pick who, quest created instantly */}
                        {(ri.checkedInRun || isDone) && !isNotFound && (
                          <Pressable
                            onPress={() => {
                              const itemName = ri.item?.name ?? ri.itemId;
                              const qty = ri.item?.quantity ? ` (${ri.item.quantity})` : '';
                              Alert.alert(
                                '↩️ Return Item',
                                `Who will return "${itemName}${qty}" to ${run?.store ?? 'the store'}?`,
                                [
                                  ...members.map(m => ({
                                    text: m.name,
                                    onPress: () => createReturnQuest(m.id, [ri]),
                                  })),
                                  { text: 'Cancel', style: 'cancel' },
                                ]
                              );
                            }}
                            hitSlop={6}
                            style={{
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                              backgroundColor: colors.warningLight,
                              borderWidth: 1, borderColor: colors.warning,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.warningDark }}>↩️ Return</Text>
                          </Pressable>
                        )}
                        {/* Not found toggle — only once shopping has started */}
                        {!isDone && !isDraft && !ri.checkedInRun && (
                          <Pressable
                            onPress={() => markNotFound(ri)}
                            hitSlop={6}
                            style={{
                              paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8,
                              backgroundColor: isNotFound ? colors.dangerLight : colors.surface,
                              borderWidth: 1,
                              borderColor: isNotFound ? colors.danger : colors.border,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: isNotFound ? colors.danger : colors.textTertiary }}>
                              {isNotFound ? 'Undo' : 'Not here'}
                            </Text>
                          </Pressable>
                        )}
                        {/* Remove — still allowed while planning a draft trip
                            (that's just editing the list, not shopping) */}
                        {!isDone && (
                          <Pressable onPress={() => removeItemFromRun(run.id, ri.itemId)} style={{ padding: 4 }}>
                            <Ionicons name="close-circle-outline" size={18} color={colors.textTertiary} />
                          </Pressable>
                        )}
                      </View>
                    </Pressable>
                  );
                })
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
                notInRun.map((item, itemIdx) => (
                  <Pressable
                    key={item.id}
                    onPress={() => !adding && handleAddToRun(item.id)}
                    style={[rd.itemRow, { borderBottomColor: border, borderBottomWidth: itemIdx < notInRun.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, color: colors.textPrimary }}>{item.name}</Text>
                      {item.quantity && <Text style={{ fontSize: 12, color: colors.textSecondary }}>{item.quantity}</Text>}
                      {item.storePreference && <Text style={{ fontSize: 11, color: colors.textTertiary }}>🏪 {item.storePreference}</Text>}
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
                    <View style={{ backgroundColor: colors.primaryLight, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
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
                <Pressable onPress={() => startRun(run.id, memberId)} style={[sh.btn, { backgroundColor: colors.success }]}>
                  <Text style={[sh.btnText, { color: colors.textInverse }]}>🛒 Start Shopping</Text>
                </Pressable>
              )}

              {isActive && (
                <>
                  {/* Quick actions row */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={handleSwitchStore}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        borderWidth: 1.5, borderColor: colors.border,
                        borderRadius: 10, paddingVertical: 10,
                        backgroundColor: colors.surface }}>
                      <Text style={{ fontSize: 14 }}>🏪</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Switch Store</Text>
                    </Pressable>
                    <Pressable onPress={handleHandOff}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        borderWidth: 1.5, borderColor: colors.border,
                        borderRadius: 10, paddingVertical: 10,
                        backgroundColor: colors.surface }}>
                      <Text style={{ fontSize: 14 }}>🤝</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Hand Off</Text>
                    </Pressable>
                  </View>

                  {/* Not-found summary */}
                  {notFoundIds.size > 0 && (
                    <View style={{ backgroundColor: colors.dangerLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                      borderWidth: 1, borderColor: colors.danger }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>
                        ⚠️ {notFoundIds.size} item{notFoundIds.size > 1 ? 's' : ''} not found at {run.store} — will stay on your list
                      </Text>
                    </View>
                  )}

                  {checkedCount > 0 && (
                    <Pressable onPress={handleComplete} style={[sh.btn, { backgroundColor: colors.primary }]}>
                      <Text style={[sh.btnText, { color: colors.textInverse }]}>✅ Done — {checkedCount} bought{notFoundIds.size > 0 ? `, ${notFoundIds.size} skipped` : ''}</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>

    </>
  );
}
