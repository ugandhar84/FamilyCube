import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, Image, ActivityIndicator, TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFamilyStore } from '@/store/familyStore';
import { useGroceryStore, GroceryItem, GroceryRun, GroceryRunItem } from '@/store/groceryStore';
import { useQuestStore } from '@/store/choreAdapter';
import { showToast } from '@/components/AppToast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sh, rd } from './styles';
import AiConsentSheet, { useAiConsent } from '@/components/AiConsentGate';

// ─── Run Detail Sheet ─────────────────────────────────────────────────────────

export function RunDetailSheet({ run, visible, onClose, memberId, pendingItems, colors, isDark }: {
  run: GroceryRun | null; visible: boolean; onClose: () => void;
  memberId: string; pendingItems: GroceryItem[];
  colors: any; isDark: boolean;
}) {
  const { members } = useFamilyStore();
  const { checkRunItem, uncheckRunItem, addItem, addItemToRun, removeItemFromRun, startRun, completeRun, deleteRun, loadRunDetail } = useGroceryStore();
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
  const [startingRun,      setStartingRun]      = useState(false);
  // Quick-add — live-reported: "+ Add" only ever offered items already in
  // the family's shared grocery pool, with no way to type something new on
  // the spot while mid-shop. addItem() itself already tags the new row with
  // this trip's store and auto-joins any open run at that store (see
  // groceryStore.ts's own addItem — the same auto-join createRun uses), so
  // this doesn't need a separate addItemToRun call after creating it.
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAdding,  setQuickAdding]  = useState(false);
  // Live-requested: "apply same fixes in all bottomsheets - don't forget
  // 75% is max but fit to the content" — was a flat 90%, no keyboard
  // awareness at all despite the "add" tab's own TextInput.
  const insets = useSafeAreaInsets();
  const { checked: consentChecked, consented, showSheet: showConsent, setShowSheet: setShowConsent, markConsented } = useAiConsent(memberId);
  const pendingScanAction = useRef<(() => void) | null>(null);

  const pickReceipt = () => {
    const action = async () => {
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
    if (!consentChecked || consented) { action(); return; }
    pendingScanAction.current = action;
    setShowConsent(true);
  };

  const analyzeReceipt = async (base64: string) => {
    if (!base64 || !run) return;
    setAnalyzingReceipt(true); setReceiptAnalysis(null);
    try {
      // Was calling family-ai with action: 'analyze_receipt' — that action
      // doesn't exist in family-ai's ACTIONS map at all (live-reported:
      // "Edge Function returned a non-2xx status code", a 400 Unknown
      // action). The real, already-built receipt parser is its own
      // dedicated function with a different request/response shape
      // entirely (familyId/scannedById/imageBase64 in, {total, items:
      // [{name, totalPrice, ...}]} out, persisted to grocery_receipts).
      const { data, error } = await supabase.functions.invoke('parse-grocery-receipt', {
        body: { familyId: run.familyId, scannedById: memberId, imageBase64: base64, store: run.store ?? undefined },
      });
      if (error) throw error;
      setReceiptAnalysis(data);
    } catch (e: any) {
      Alert.alert('Receipt error', e?.message ?? 'Could not analyze receipt.');
    } finally { setAnalyzingReceipt(false); }
  };

  // Realtime subscription for run items
  const runItemSubRef = useRef<any>(null);
  const didInitTab = useRef(false);
  useEffect(() => { if (!visible) didInitTab.current = false; }, [visible]);

  const refetch = useCallback(() => {
    if (!run || !visible) return;
    loadRunDetail(run.id).then(detail => {
      const items = detail?.runItems ?? [];
      setRunItems(items);
      if (items.length === 0 && !didInitTab.current) setTab('add');
      didInitTab.current = true;
    });
  }, [run?.id, visible, loadRunDetail]);

  useEffect(() => {
    if (!run || !visible) return;

    refetch();

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

  // checkRunItem/uncheckRunItem/addItemToRun/removeItemFromRun write straight
  // to Supabase without touching useGroceryStore's `runs` — only
  // loadRunDetail (called above, and from groceryStore's own realtime
  // handlers) refreshes `runs[].runItems` — so this sheet's separate
  // `runItems` useState only ever hears about a same-session change made
  // elsewhere (e.g. another sheet instance, or a future call site that goes
  // through the store instead of this sheet's local optimistic setRunItems)
  // via this sheet's own realtime round-trip. Subscribing to the store
  // directly closes that gap, matching useUpcomingOpenEvents.ts's pattern.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = useGroceryStore.subscribe((state, prevState) => {
      if (state.runs === prevState.runs) return;
      const sig = (st: typeof state) => JSON.stringify(
        (st.runs.find(r => r.id === run?.id)?.runItems ?? []).map(ri => [ri.itemId, ri.checkedInRun]),
      );
      if (sig(state) === sig(prevState)) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { debounceRef.current = null; refetch(); }, 200);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refetch, run?.id]);

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
    // Was: setTab('items') here, bouncing the user to the List tab after
    // every single tap — live-reported as unwanted when adding several
    // suggested items in a row from the + Add tab. Stay put; the user can
    // switch tabs themselves when done adding.
    setAdding(false);
  };

  // Creates a brand-new item (not yet in the family's grocery pool) tagged
  // to this trip's store, and relies on addItem's own auto-join for
  // matching open runs rather than a separate addItemToRun call.
  const handleQuickAdd = async () => {
    const trimmed = quickAddName.trim();
    if (!trimmed || quickAdding) return;
    setQuickAdding(true);
    const created = await addItem({
      familyId: run.familyId, name: trimmed, storePreference: run.store ?? undefined, addedBy: memberId,
    });
    if (created) {
      const detail = await loadRunDetail(run.id);
      setRunItems(detail?.runItems ?? []);
      setQuickAddName('');
      showToast('Item added');
    } else {
      showToast("Couldn't add item — try again", 'info');
    }
    setQuickAdding(false);
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
      '↩️ Return Chore Created',
      `"Return items to ${run?.store}" added to ${assignee?.name ?? 'their'} To-Do list.\n\nItems:\n${itemList}`,
      [{ text: 'OK' }]
    );
  };

  // Partial complete — only checked items marked bought, unchecked stay on list
  // Live-reported: starting a trip with nothing checked off yet had no way
  // to stop — "Done" only ever appears once checkedCount > 0 (see the
  // Actions section below), and the × just dismisses the sheet without
  // ending the trip, leaving it stuck "Shopping now" in the background.
  // Cancelling deletes the run itself, not the underlying grocery_items —
  // deleteRun's own comment confirms items "naturally stay on the list."
  const handleCancelTrip = () => {
    Alert.alert('Stop shopping?', `"${run.name}" will be cancelled. Items stay on your grocery list for next time.`, [
      { text: 'Keep Shopping', style: 'cancel' },
      {
        text: 'Stop Shopping', style: 'destructive', onPress: async () => {
          await deleteRun(run.id);
          showToast('Trip cancelled');
          onClose();
        },
      },
    ]);
  };

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
    <AiConsentSheet
      visible={showConsent}
      memberId={memberId}
      familyId={run?.familyId}
      colors={colors}
      isDark={isDark}
      onAgree={() => {
        setShowConsent(false);
        markConsented();
        pendingScanAction.current?.();
        pendingScanAction.current = null;
      }}
      onDecline={() => { setShowConsent(false); pendingScanAction.current = null; }}
    />
    <View style={{ flex: 1, backgroundColor: colors.card }}>
      {/* Full-page header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border,
        flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.surface, marginRight: 12 }}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>Shopping Trip</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>{run.name}</Text>
        </View>
        <View style={{ backgroundColor: isActive ? colors.tealLight : isDone ? colors.surface : colors.primaryLight,
          borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? colors.teal : isDone ? colors.textSecondary : colors.primary }}>
            {isActive ? '🛒 Shopping now' : isDone ? '✅ Done' : '📋 Draft'}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1, padding: 16 }}>
          {/* Progress bar */}
          {runItems.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ height: 6, borderRadius: 3, width: `${(checkedCount / runItems.length) * 100}%`, backgroundColor: colors.teal }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textSecondary }}>
                  {checkedCount} of {runItems.length} items checked
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}>
                  {runItems.length > 0 ? Math.round((checkedCount / runItems.length) * 100) : 0}%
                </Text>
              </View>
            </View>
          )}

          {/* Sub-tabs — Figma toolbar style */}
          {!isDone && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {(['items', 'add', 'receipt'] as const).map(t => {
                const active = tab === t;
                return (
                  <Pressable key={t} onPress={() => setTab(t)}
                    style={{ flex: 1, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: active ? colors.primary : colors.card,
                      borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? (colors.textInverse ?? '#FFFFFF') : colors.primary }}>
                      {t === 'items' ? `List (${runItems.length})` : t === 'add' ? '+ Add' : '🧾 Receipt'}
                    </Text>
                  </Pressable>
                );
              })}
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
                  <Pressable onPress={() => setTab('add')} style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 24, marginTop: 4 }}>
                    <Text style={{ color: colors.textInverse, fontWeight: '700', fontSize: 14 }}>+ Add Items</Text>
                  </Pressable>
                </View>
              ) : (
                runItems.map((ri) => {
                  const isNotFound = notFoundIds.has(ri.itemId);
                  return (
                    <Pressable
                      key={ri.itemId}
                      onPress={() => !isDone && !isDraft && !isNotFound && toggleCheck(ri)}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center',
                        paddingVertical: 12, paddingHorizontal: 12,
                        backgroundColor: pressed ? (isDark ? colors.primary + '12' : colors.primaryLight)
                          : isNotFound ? colors.dangerLight : colors.card,
                        opacity: isNotFound ? 0.85 : isDraft ? 0.6 : 1,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isNotFound ? colors.danger : colors.border,
                        marginBottom: 8,
                        shadowColor: isDark ? 'transparent' : '#000',
                        shadowOpacity: isDark ? 0 : 0.04,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 0,
                        minHeight: 56,
                      })}
                    >
                      {/* Checkbox */}
                      <View style={{
                        width: 20, height: 20, borderRadius: 10, marginRight: 12,
                        borderWidth: 1.8,
                        borderColor: isNotFound ? colors.danger : ri.checkedInRun ? colors.teal : colors.textSecondary,
                        backgroundColor: ri.checkedInRun ? colors.teal + '20' : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isNotFound
                          ? <Text style={{ fontSize: 9, color: colors.danger }}>✕</Text>
                          : ri.checkedInRun
                            ? <Ionicons name="checkmark" size={11} color={colors.teal} />
                            : loadingId === ri.itemId
                              ? <ActivityIndicator size="small" color={colors.primary} />
                              : null}
                      </View>

                      {/* Item info */}
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: 16, fontWeight: '600',
                          color: isNotFound ? colors.danger : ri.checkedInRun ? colors.textTertiary : colors.textPrimary,
                          textDecorationLine: ri.checkedInRun ? 'line-through' : 'none',
                        }}>
                          {ri.item?.name ?? ri.itemId}
                        </Text>
                        {isNotFound
                          ? <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600', marginTop: 2 }}>Not found — stays on list</Text>
                          : ri.item?.quantity
                            ? <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textTertiary, marginTop: 2 }}>{ri.item.quantity}</Text>
                            : null}
                      </View>

                      {/* Right actions */}
                      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                        {ri.checkedInRun && !isNotFound && (
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
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100,
                              backgroundColor: colors.amberLight,
                              borderWidth: 1, borderColor: colors.amber,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.amber }}>↩️</Text>
                          </Pressable>
                        )}
                        {!isDone && !isDraft && !ri.checkedInRun && (
                          <Pressable
                            onPress={() => markNotFound(ri)}
                            hitSlop={6}
                            style={{
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100,
                              backgroundColor: isNotFound ? colors.dangerLight : colors.surface,
                              borderWidth: 1,
                              borderColor: isNotFound ? colors.danger : colors.border,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: isNotFound ? colors.danger : colors.textTertiary }}>
                              {isNotFound ? 'Undo' : 'Not here'}
                            </Text>
                          </Pressable>
                        )}
                        {!isDone && (
                          <Pressable onPress={() => removeItemFromRun(run.id, ri.itemId)} hitSlop={6} style={{ padding: 4 }}>
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
            <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Quick-add — a brand-new item not yet in the family's pool,
                  typed on the spot mid-shop. Tagged with this trip's store
                  so it lands directly in this run (addItem's own auto-join). */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TextInput
                  style={[sh.input, { flex: 1, marginBottom: 0, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  placeholder="Add a new item…"
                  placeholderTextColor={colors.textTertiary}
                  value={quickAddName}
                  onChangeText={setQuickAddName}
                  onSubmitEditing={handleQuickAdd}
                  returnKeyType="done"
                  editable={!quickAdding}
                />
                <Pressable
                  onPress={handleQuickAdd}
                  disabled={!quickAddName.trim() || quickAdding}
                  style={{ borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: quickAddName.trim() && !quickAdding ? colors.primary : colors.border }}
                >
                  {quickAdding
                    ? <ActivityIndicator size="small" color={colors.textInverse} />
                    : <Text style={{ color: colors.textInverse, fontWeight: '700', fontSize: 14 }}>Add</Text>}
                </Pressable>
              </View>
              {notInRun.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>All pending items are already in this run.</Text>
                </View>
              ) : (
                notInRun.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => !adding && handleAddToRun(item.id)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: 12, paddingHorizontal: 12,
                      backgroundColor: pressed ? colors.primaryLight : '#FFFFFF',
                      borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                      marginBottom: 8, minHeight: 56,
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{item.name}</Text>
                      {item.quantity && <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textTertiary, marginTop: 2 }}>{item.quantity}</Text>}
                      {item.storePreference && <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>🏪 {item.storePreference}</Text>}
                    </View>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                      backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary }}>
                      <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>+ Add</Text>
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
                    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 24,
                      shadowColor: '#172337', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
                      {!!receiptAnalysis.total && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Receipt Total</Text>
                          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary }}>
                            ${Number(receiptAnalysis.total).toFixed(2)}
                          </Text>
                        </View>
                      )}
                      {/* parse-grocery-receipt's own ExtractedItem shape —
                          totalPrice, not price. */}
                      {(receiptAnalysis.items ?? []).map((ri: any, idx: number) => (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                          paddingVertical: 8,
                          borderBottomWidth: idx < receiptAnalysis.items.length - 1 ? StyleSheet.hairlineWidth : 0,
                          borderBottomColor: colors.border }}>
                          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 }}>{ri.name}</Text>
                          {!!ri.totalPrice && <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>${Number(ri.totalPrice).toFixed(2)}</Text>}
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
                <Pressable onPress={async () => { setStartingRun(true); await startRun(run.id, memberId); setStartingRun(false); }}
                  disabled={startingRun} style={[sh.btn, { backgroundColor: colors.success, opacity: startingRun ? 0.7 : 1 }]}>
                  {startingRun
                    ? <ActivityIndicator color={colors.textInverse} size="small" />
                    : <Text style={[sh.btnText, { color: colors.textInverse }]}>🛒 Start Shopping</Text>}
                </Pressable>
              )}

              {isActive && (
                <>
                  {/* Quick actions row */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={handleSwitchStore}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        borderWidth: 1, borderColor: colors.border,
                        borderRadius: 14, paddingVertical: 12,
                        backgroundColor: isDark ? colors.surface : '#FFFFFF' }}>
                      <Text style={{ fontSize: 14 }}>🏪</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Switch Store</Text>
                    </Pressable>
                    <Pressable onPress={handleHandOff}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        borderWidth: 1, borderColor: colors.border,
                        borderRadius: 14, paddingVertical: 12,
                        backgroundColor: isDark ? colors.surface : '#FFFFFF' }}>
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

                  {checkedCount > 0 ? (
                    <Pressable onPress={handleComplete} style={[sh.btn, { backgroundColor: colors.primary }]}>
                      <Text style={[sh.btnText, { color: colors.textInverse }]}>✅ Done — {checkedCount} bought{notFoundIds.size > 0 ? `, ${notFoundIds.size} skipped` : ''}</Text>
                    </Pressable>
                  ) : (
                    // Nothing bought yet — "Done" has no meaning here, but the
                    // trip still needs a way to end without a purchase.
                    <Pressable onPress={handleCancelTrip}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        borderWidth: 1, borderColor: colors.danger, borderRadius: 14, paddingVertical: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>Stop Shopping (no purchase)</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </>);
}
