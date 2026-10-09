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
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useUIStore } from '@/store/uiStore';
import { ReceiptScanSheet } from './components/ReceiptScanSheet';
import { SmartRestockBanner } from './components/SmartRestockBanner';
import { PartnerStatusBar } from './components/PartnerStatusBar';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Alert, Animated, ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useGroceryStore, GroceryItem, GroceryRun } from '@/store/groceryStore';
import { useKidRequestStore, type KidRequestItem } from '@/store/kidRequestStore';
import { useQuestStore } from '@/store/choreAdapter';
import { registerStoreGeofences } from '@/lib/storeGeofencing';
import { PinStoreLocationSheet } from './components/PinStoreLocationSheet';
import { useFeatureFlag } from '@/lib/featureFlags';
import { showAlert } from '@/components/AppAlert';
import { localDateStr } from '@/lib/dates';

import { AddItemSheet } from './components/AddItemSheet';
import { CreateRunSheet } from './components/CreateRunSheet';
import { RunDetailSheet } from './components/RunDetailSheet';
import { ItemDetailSheet } from './components/ItemDetailSheet';
import { CategorySection } from './components/CategorySection';
import { HistoryTab } from './components/HistoryTab';
import { InsightsTab } from './components/InsightsTab';
import { GroceryAiBanner } from './components/GroceryAiBanner';
import { AiSuggestionsScreen } from './components/AiSuggestionsScreen';
import { KidRequestsSection } from './components/KidRequestsSection';
import { GroceryItemsSection } from './components/GroceryItemsSection';
import { RecentlyBoughtSection } from './components/RecentlyBoughtSection';
import { ReturnModeToolbar, BulkSelectToolbar } from './components/SelectionToolbars';
import AssigneePickerSheet from './components/AssigneePickerSheet';
import { RunsTabBody } from './components/RunsTabBody';
import { mapBoughtRow, itemEmoji } from './components/types';
import { s } from './components/styles';
import { showToast } from '@/components/AppToast';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import FullPageOverlay from '@/components/FullPageOverlay';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GroceryScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId, familyName } = useFamilyStore();
  const { items, runs, loading, load, addItem, buyItem, removeItem, deleteRun, markReturning, loadPinnedStores, pinnedStores, pinStoreLocation, unpinStoreLocation } = useGroceryStore();

  const [tab, setTab]                   = useState<'list' | 'runs' | 'history' | 'insights' | null>(null);
  const [showAddItem, setShowAddItem]   = useState(false);

  // Shared FAB's Grocery-tab "+" face (app/(tabs)/_layout.tsx) fires this
  // one-shot flag instead of opening Ask Cube — same pattern
  // MemoriesTab.tsx uses for openMemoryComposerRequested. Replaces this
  // screen's own previously-separate always-"+" local FAB.
  const openGroceryComposerRequested = useUIStore(s => s.openGroceryComposerRequested);
  useEffect(() => {
    if (openGroceryComposerRequested) {
      useUIStore.getState().setOpenGroceryComposerRequested(false);
      setShowAddItem(true);
    }
  }, [openGroceryComposerRequested]);
  useFocusEffect(useCallback(() => {
    if (useUIStore.getState().openGroceryComposerRequested) {
      useUIStore.getState().setOpenGroceryComposerRequested(false);
      setShowAddItem(true);
    }
  }, []));
  const [editingItem, setEditingItem]   = useState<GroceryItem | undefined>(undefined);
  const [detailItem,  setDetailItem]    = useState<GroceryItem | null>(null);
  const [showNewRun,  setShowNewRun]    = useState(false);
  const [showAiPanel, setShowAiPanel]   = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  // Was a frozen GroceryRun snapshot captured once at selection time — once
  // startRun/completeRun updated the run in the store, RunDetailSheet kept
  // rendering the stale status forever (button stayed "Start Shopping"
  // with zero feedback after tapping it, live-reported). Track just the id
  // and re-derive the live object from `runs` on every render instead, so
  // the sheet always reflects the store's current state.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null;
  const setSelectedRun = (run: GroceryRun | null) => setSelectedRunId(run?.id ?? null);
  const [showReceiptScan, setShowReceiptScan] = useState(false);

  // Price comparison state
  const [priceMap, setPriceMap]         = useState<Record<string, { price: number | null; unit: string | null; source: 'kroger' | 'receipt' | 'estimate' | 'unrecognized' | 'unknown' }>>({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // Seed priceMap from stored estimatedPrice whenever items load. A
  // receipt-sourced price (parse-grocery-receipt matched this item to a
  // real scanned purchase) always wins over whatever's already in
  // priceMap, including a previously-fetched AI guess — live-requested:
  // "actuals right from receipt instead displaying estimated." A plain
  // AI-estimate re-seed still only fills gaps, same as before.
  useEffect(() => {
    if (!items.length) return;
    const seeded: typeof priceMap = {};
    let any = false;
    for (const item of items) {
      if (item.estimatedPrice == null) continue;
      const isReceipt = item.priceSource === 'receipt';
      if (isReceipt && priceMap[item.name]?.source !== 'receipt') {
        seeded[item.name] = { price: item.estimatedPrice, unit: null, source: 'receipt' };
        any = true;
      } else if (!isReceipt && !priceMap[item.name]) {
        seeded[item.name] = { price: item.estimatedPrice, unit: null, source: 'estimate' };
        any = true;
      }
    }
    if (any) {
      setPriceMap(prev => ({ ...prev, ...seeded }));
      setPricesLoaded(true);
    }
  }, [items]);

  const checkPrices = async () => {
    const unbought = items.filter(i => !i.isBought);
    // Only fetch delta items — skip those already priced, and never
    // re-fetch an AI guess for something a real receipt already priced.
    const toFetch = unbought.filter(i => !priceMap[i.name] && i.priceSource !== 'receipt');
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
          // Persist prices to DB so future sessions skip the AI call
          const updates = toFetch
            .filter(i => newEntries[i.name]?.price != null)
            .map(i => supabase.from('grocery_items').update({ estimated_price: newEntries[i.name].price }).eq('id', i.id));
          Promise.allSettled(updates).catch(() => {});
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
  // Read-only for kid AND teen now — widened from the old isKid-only
  // restriction [live-requested: "as i said we shoun't give the access to
  // grocey add in the melas page they just can see their approved
  // groceries by parents / kids and teens both" / "even mobile should do
  // same"]. See KidGroceryRequestsView below for the actual replacement
  // screen this renders instead of everything below.
  const isKidOrTeen = isKid || (activeMember as any)?.role === 'teen';
  const familyId = (activeMember as any)?.familyId ?? 'family-1';
  // TEMP diagnostic — live-reported: kiosk-added grocery items never show
  // on mobile. Suspect: this fallback masking activeMember.familyId being
  // unset here, so mobile silently reads/writes against the fake
  // 'family-1' bucket instead of the real family kiosk uses. Remove once
  // confirmed.
  if (__DEV__ && !(activeMember as any)?.familyId) {
    console.warn('[GroceryScreen] activeMember.familyId is missing — falling back to family-1', { activeMemberId, activeMember });
  }

  const geofencingEnabled = useFeatureFlag('store_proximity_reminders');
  const [pinningStore, setPinningStore] = useState<string | null>(null);

  // Was no way to remove a store's pin once set (live-requested: "once
  // pin is set we should be able to modify it or delete it") — "modify"
  // is already covered by re-opening PinStoreLocationSheet (its onPin is
  // an upsert), this is the missing "delete" half. Re-registers geofences
  // afterward so the removed region actually stops monitoring — same
  // pattern the pin flow itself already uses.
  const handleUnpinStore = (store: string) => {
    showAlert('Remove pin?', `${store} will no longer notify nearby family members.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await unpinStoreLocation({ familyId, store });
          if (activeMemberId) registerStoreGeofences(familyId, activeMemberId).catch(() => {});
        },
      },
    ]);
  };

  useEffect(() => {
    load(familyId);
    if (!geofencingEnabled) return;
    loadPinnedStores(familyId);
    if (activeMemberId) registerStoreGeofences(familyId, activeMemberId).catch(() => {});
  }, [familyId, activeMemberId, geofencingEnabled]);

  // Recently bought items (last 7 days)
  const [boughtItems, setBoughtItems]       = useState<GroceryItem[]>([]);
  const [boughtExpanded, setBoughtExpanded] = useState(false);

  const refreshBought = () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('grocery_items')
      .select('*').eq('family_id', familyId).eq('is_bought', true)
      .gte('bought_at', since).order('bought_at', { ascending: false }).limit(50)
      .then(({ data }) => setBoughtItems((data ?? []).map(mapBoughtRow)));
  };

  useEffect(() => {
    if (familyId) refreshBought();
  }, [familyId]);

  // Prices are fetched on demand only (user taps "Estimate Prices" button)

  const cartTotal = useMemo(() => {
    return items
      .filter(i => !i.isBought)
      .reduce((sum, i) => sum + (priceMap[i.name]?.price ?? 0), 0);
  }, [items, priceMap]);

  // Category buckets — order matters for display
  const CATEGORY_SECTIONS = [
    { key: 'groceries', label: 'Groceries',  emoji: '🛒', color: '#10B981', match: (c?: string) => !c || (!['Supplies','School Supplies','Clothing','Clothes'].includes(c ?? '') && !['Clothing','Clothes'].includes(c ?? '')) },
    { key: 'supplies',  label: 'Supplies',   emoji: '📚', color: '#6366F1', match: (c?: string) => c === 'Supplies' || c === 'School Supplies' },
    { key: 'clothing',  label: 'Clothing',   emoji: '👕', color: '#F59E0B', match: (c?: string) => c === 'Clothing' || c === 'Clothes' },
  ] as const;

  const categorisedItems = useMemo(() => {
    const buckets: Record<string, GroceryItem[]> = { groceries: [], supplies: [], clothing: [], other: [] };
    for (const item of items) {
      const cat = item.category;
      if (cat === 'Supplies' || cat === 'School Supplies') buckets.supplies.push(item);
      else if (cat === 'Clothing' || cat === 'Clothes') buckets.clothing.push(item);
      else buckets.groceries.push(item);
    }
    return buckets;
  }, [items]);

  const groceryItems = categorisedItems.groceries;

  // Items a kid asked for get their own group, separate from the store-grouped
  // list below — easy to see who originated a request and grab their whole
  // batch at once (e.g. right before a run) instead of hunting through by store.
  const kidGroceryGroups = useMemo(() => {
    const groups: Record<string, { kid: any; items: GroceryItem[] }> = {};
    for (const item of groceryItems) {
      const requester = members.find(m => m.id === item.addedBy);
      if (requester?.role !== 'kid') continue;
      if (!groups[requester.id]) groups[requester.id] = { kid: requester, items: [] };
      groups[requester.id].items.push(item);
    }
    return Object.values(groups).sort((a, b) => a.kid.name.localeCompare(b.kid.name));
  }, [groceryItems, members]);
  const kidGroceryItemIds = useMemo(
    () => new Set(kidGroceryGroups.flatMap(g => g.items.map(i => i.id))),
    [kidGroceryGroups]
  );

  // Group the remaining (non-kid-requested) grocery items by store preference
  const groupedItems = useMemo(() => {
    const groups: Record<string, GroceryItem[]> = {};
    for (const item of groceryItems) {
      if (kidGroceryItemIds.has(item.id)) continue;
      const key = item.storePreference || 'Any store';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b));
  }, [groceryItems, kidGroceryItemIds]);

  const activeRuns = runs.filter(r => r.status === 'active');
  const draftRuns  = runs.filter(r => r.status === 'draft');
  const doneRuns   = runs.filter(r => r.status === 'done');

  // Always hide tab bar + FAB on every focus (covers Hub→Grocery→back→Grocery re-entry)
  useFocusEffect(useCallback(() => {
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => {
      showTabBar();
      useUIStore.getState().setFullBleedScreenActive(false);
    };
  }, []));

  const bg       = isDark ? '#0E0C13' : '#FFFFFF';
  const card     = colors.card;
  const border   = colors.border;
  const P        = colors.primary;

  const handleBuyItem = (item: GroceryItem) => {
    Alert.alert('Mark as bought?', `"${item.name}"`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Bought ✓', onPress: () => { buyItem(item.id, activeMemberId ?? ''); showToast('Marked as bought'); setTimeout(refreshBought, 600); } },
    ]);
  };

  const handleDeleteRun = (run: GroceryRun) => {
    Alert.alert('Delete run?', `"${run.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteRun(run.id); showToast('Run deleted'); } },
    ]);
  };

  // ── Return mode (multi-select on bought items) ────────────────────────────
  const [returnMode, setReturnMode] = useState(false);
  const [returnIds, setReturnIds] = useState<Set<string>>(new Set());
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);

  const handleCreateReturn = async (assigneeId: string) => {
    const selectedItems = boughtItems.filter(i => returnIds.has(i.id));
    if (selectedItems.length === 0) return;
    const itemLabel = selectedItems.length === 1
      ? `"${selectedItems[0].name}"`
      : `${selectedItems.length} items`;
    // Live-requested: "remove coins for grocery hardcoded" — a store
    // return isn't a gamified chore for anyone, kid included; no assignee
    // earns coins/xp for it regardless of role. isAdultTask still flips
    // for a parent/senior assignee (this app's own "no coin economy
    // applies" concept for adult-assigned chores elsewhere), so the
    // assignment surfaces correctly as a plain task rather than a
    // kid-quest-styled reward-bearing card.
    const assignee = members.find(m => m.id === assigneeId);
    const isAdultAssignee = assignee?.role === 'parent' || assignee?.role === 'senior';
    const quest = await useQuestStore.getState().addQuest({
      title: `↩️ Return ${itemLabel} to the store`,
      description: selectedItems.map(i => `• ${i.name}${i.quantity ? ' (' + i.quantity + ')' : ''}`).join('\n'),
      assignedToId: assigneeId,
      assignedToIds: [assigneeId],
      isPool: false,
      category: 'Shopping',
      priority: 'medium',
      coins: 0,
      xpReward: 0,
      isDaily: false,
      recurrence: 'once',
      status: 'todo',
      dueDate: localDateStr(new Date(Date.now() + 7 * 86400000)),
      photoRequired: false,
      isAdultTask: isAdultAssignee,
    });
    markReturning(Array.from(returnIds), quest.id);
    setReturnIds(new Set());
    setReturnMode(false);
    setTimeout(refreshBought, 600);
    Alert.alert('↩️ Return Chore Created', `${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''} queued for return and assigned to ${members.find(m => m.id === assigneeId)?.name ?? 'a member'}.`);
  };

  const scrollRef = useRef<ScrollView>(null);
  const [showFab, setShowFab] = useState(false);
  const fabOpacity = useRef(new Animated.Value(0)).current;
  const scrollYRef = useRef(0);
  const onScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollYRef.current = y;
    const visible = y > 200;
    if (visible !== showFab) {
      setShowFab(visible);
      Animated.timing(fabOpacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    }
  };

  // Auto-scroll while dragging a grocery item between store sections
  // (GroceryItemsSection has no ref to this ScrollView, only this screen
  // does) — a fixed-interval nudge relative to the last known scroll
  // offset, since RN's ScrollView only exposes an absolute scrollTo, not a
  // relative "scroll by" call.
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScrollDelta = useRef(0);
  const handleAutoScroll = (delta: number | null) => {
    if (delta === null) {
      if (autoScrollTimer.current) { clearInterval(autoScrollTimer.current); autoScrollTimer.current = null; }
      return;
    }
    autoScrollDelta.current = delta;
    if (autoScrollTimer.current) return; // already running — direction/speed read fresh from the ref each tick
    autoScrollTimer.current = setInterval(() => {
      scrollYRef.current = Math.max(0, scrollYRef.current + autoScrollDelta.current);
      scrollRef.current?.scrollTo({ y: scrollYRef.current, animated: false });
    }, 16);
  };

  // Kid/teen: the whole List/Runs/History/Insights screen below is
  // replaced with one simple read-only view of their own grocery
  // requests and status — not a live editable list at all
  // [live-requested: "Replace with their own request/approval history
  // only"]. Every hook/effect above this point still runs unconditionally
  // (React hook-order rules — this is a return-only branch, not an early
  // bail before the hooks), so nothing here risks a hook-count mismatch;
  // the state those hooks populate (items, boughtItems, etc.) just goes
  // unused for this branch, same cost as any other unrendered prop.
  if (isKidOrTeen) {
    return (
      <KidGroceryRequestsView
        activeMemberId={activeMember?.id ?? ''}
        members={members}
        colors={colors}
        isDark={isDark}
        hideHeader={hideHeader}
        insets={insets}
      />
    );
  }

  const pendingCount = items.filter(i => !i.isBought).length;
  const activeRunCount = runs.filter(r => r.status === 'active').length;

  const landingCards: { key: typeof tab; title: string; subtitle: string; iconName: string; color: string; bg: string; count: number }[] = [
    {
      key: 'list', title: 'Shopping List',
      subtitle: pendingCount > 0 ? `${pendingCount} item${pendingCount !== 1 ? 's' : ''} to buy` : 'List is clear',
      iconName: 'list-outline', color: colors.primary, bg: colors.primaryLight, count: pendingCount,
    },
    {
      key: 'runs', title: 'Shopping Trips',
      subtitle: activeRunCount > 0 ? `${activeRunCount} trip${activeRunCount !== 1 ? 's' : ''} in progress` : runs.length > 0 ? `${runs.length} total trips` : 'No trips yet',
      iconName: 'cart-outline', color: colors.teal, bg: colors.tealLight, count: activeRunCount,
    },
    {
      key: 'history', title: 'Purchase History',
      subtitle: 'Recently bought items',
      iconName: 'time-outline', color: colors.amber, bg: colors.amberLight, count: 0,
    },
    {
      key: 'insights', title: 'Insights',
      subtitle: 'Spending & trends',
      iconName: 'bar-chart-outline', color: colors.pink, bg: colors.pinkLight, count: 0,
    },
  ];

  return (
    <View style={[s.root, { backgroundColor: bg }]}>

      {/* ── Header — ReviewInbox pattern ── */}
      <View style={{
        paddingHorizontal: 20,
        paddingTop: hideHeader ? 8 : insets.top + 12,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: isDark ? colors.surface : '#FFFFFF',
        gap: 8,
      }}>
        {!hideHeader && (
          <>
            {/* Chrome row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary, lineHeight: 15 }}>
                {(familyName ?? 'FAMILY SPACE').toUpperCase()}
              </Text>
              {activeMember && (
                <Text style={{ fontSize: 13, fontWeight: '500', color: P, lineHeight: 18 }}>
                  {activeMember.name}
                </Text>
              )}
            </View>

            {/* Title + add button */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
              <Text style={{ flex: 1, fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
                Groceries
              </Text>
              <Pressable onPress={() => setShowAddItem(true)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface,
                  alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Ionicons name="add" size={20} color={P} />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* ── Landing cards ── */}
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 48 }}
        style={{ flex: 1 }}
      >
        {/* Active run inline alert card */}
        {activeRuns.length > 0 && (
          <Pressable onPress={() => setSelectedRun(activeRuns[0])}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: colors.tealLight, borderRadius: 16, padding: 16,
              opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? colors.surface : '#FFFFFF',
              alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cart" size={22} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>Shopping now</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 2 }}>
                {activeRuns[0].store} · Tap to open →
              </Text>
            </View>
            <View style={{ minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7,
              backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{activeRuns.length}</Text>
            </View>
          </Pressable>
        )}

        {/* AI tools card */}
        <GroceryAiBanner
          isDark={isDark} colors={colors}
          onScan={() => setShowReceiptScan(true)}
          onPriceCheck={() => checkPrices()}
          pricesLoaded={pricesLoaded} priceLoading={priceLoading}
        />

        {/* Estimated cart total pill */}
        {cartTotal > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: colors.primaryLight, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="pricetag-outline" size={14} color={P} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
                Estimated total · {items.filter(i => !i.isBought).length} items
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: P }}>${cartTotal.toFixed(2)}</Text>
          </View>
        )}

        {/* Category landing cards — ReviewInbox style */}
        {landingCards.map(card => (
          <Pressable
            key={card.key}
            onPress={() => setTab(card.key)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 14,
              backgroundColor: card.bg, borderRadius: 16, padding: 16,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? colors.card : '#FFFFFF',
              alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={card.iconName as any} size={22} color={card.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>{card.title}</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 2 }}>{card.subtitle}</Text>
            </View>
            {card.count > 0 && (
              <View style={{ minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7,
                backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{card.count}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Sub-screen overlays (landing card → dedicated page) ── */}

      {/* List sub-screen */}
      <FullPageOverlay visible={tab === 'list'} onDismiss={() => setTab(null)} zIndex={40}>
        <View style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }}>
          <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
            backgroundColor: isDark ? '#0E0C13' : '#FFFFFF', gap: 10 }}>
            {/* Family chrome */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                {(familyName ?? 'FAMILY SPACE').toUpperCase()}
              </Text>
              {activeMember && <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>{activeMember.name}</Text>}
            </View>
            {/* Breadcrumb + title */}
            <View style={{ gap: 4 }}>
              <Pressable onPress={() => setTab(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Groceries</Text>
              </Pressable>
              <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
                Shared groceries
              </Text>
            </View>
            {/* Figma subtitle */}
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
              Shared with all {members.length} {familyName ? familyName.split(' ')[0] + 's' : 'members'} · updated {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </Text>
            {/* Figma: Add item + AI suggestions pill buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setShowAddItem(true)}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: P,
                  paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: P }}>Add item</Text>
              </Pressable>
              <Pressable onPress={() => setShowAiSuggestions(true)}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: P,
                  paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: P }}>AI suggestions</Text>
              </Pressable>
            </View>
            {/* Figma: estimated total summary */}
            {cartTotal > 0 && (
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                {pendingCount} approved item{pendingCount !== 1 ? 's' : ''} · estimated ${cartTotal.toFixed(2)}
              </Text>
            )}
          </View>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
            <PartnerStatusBar familyId={familyId} currentMemberId={activeMemberId ?? ''} colors={colors} isDark={isDark} />
            <SmartRestockBanner familyId={familyId} colors={colors} isDark={isDark}
              onAddItem={(name, category) => addItem({ familyId, addedBy: activeMemberId ?? '', name, category })} />
            <View style={{ padding: 20, gap: 14 }}>
              {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={P} /> : (
                <>
                  {categorisedItems.supplies.length > 0 && (
                    <CategorySection label="Supplies" emoji="📚" color="#6366F1"
                      items={categorisedItems.supplies} isDark={isDark} colors={colors}
                      isKid={isKid} onBuy={handleBuyItem} members={members} />
                  )}
                  {categorisedItems.clothing.length > 0 && (
                    <CategorySection label="Clothing" emoji="👕" color={colors.amber}
                      items={categorisedItems.clothing} isDark={isDark} colors={colors}
                      isKid={isKid} onBuy={handleBuyItem} members={members} />
                  )}
                  <KidRequestsSection
                    kidGroceryGroups={kidGroceryGroups} isKid={isKid}
                    selectedIds={selectedIds} setSelectedIds={setSelectedIds} isSelecting={isSelecting}
                    priceMap={priceMap} setDetailItem={setDetailItem} handleBuyItem={handleBuyItem}
                    setEditingItem={setEditingItem} setShowAddItem={setShowAddItem}
                    removeItem={removeItem} members={members} colors={colors} isDark={isDark}
                  />
                  <GroceryItemsSection
                    groceryItems={groceryItems} groupedItems={groupedItems}
                    hasSuppliesOrClothing={categorisedItems.supplies.length > 0 || categorisedItems.clothing.length > 0}
                    selectedIds={selectedIds} setSelectedIds={setSelectedIds} isSelecting={isSelecting}
                    priceMap={priceMap} setDetailItem={setDetailItem} handleBuyItem={handleBuyItem}
                    setEditingItem={setEditingItem} setShowAddItem={setShowAddItem}
                    removeItem={removeItem} isKid={isKid} members={members} colors={colors} isDark={isDark}
                    pinnedStores={pinnedStores}
                    onPinStore={(store) => setPinningStore(store)}
                    onUnpinStore={handleUnpinStore}
                    onAutoScroll={handleAutoScroll} familyId={familyId} activeMemberId={activeMemberId ?? ''}
                  />
                  <RecentlyBoughtSection
                    boughtItems={boughtItems} boughtExpanded={boughtExpanded} setBoughtExpanded={setBoughtExpanded}
                    returnMode={returnMode} setReturnMode={setReturnMode}
                    returnIds={returnIds} setReturnIds={setReturnIds}
                    isKid={isKid} members={members} colors={colors} isDark={isDark}
                  />
                  {/* Figma: bottom teal link cards */}
                  <View style={{ gap: 10, marginTop: 6 }}>
                    <Pressable onPress={() => setShowAiSuggestions(true)}
                      style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                        padding: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>Smart restock →</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowReceiptScan(true)}
                      style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                        padding: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>Scan receipt →</Text>
                    </Pressable>
                    <Pressable onPress={() => { setTab(null); setTimeout(() => setTab('history'), 50); }}
                      style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                        padding: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>History & insights →</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
          <ReturnModeToolbar returnMode={returnMode} returnIds={returnIds} colors={colors}
            onOpenAssigneePicker={() => setShowAssigneePicker(true)} />
          <AssigneePickerSheet
            visible={showAssigneePicker} onClose={() => setShowAssigneePicker(false)}
            title="Assign Return To" subtitle="Who will take these items back to the store?"
            members={members.filter((m: any) => m.role !== 'kid')}
            onSelect={(memberId) => { setShowAssigneePicker(false); handleCreateReturn(memberId); }}
          />
          <BulkSelectToolbar
            isSelecting={isSelecting} selectedIds={selectedIds} setSelectedIds={setSelectedIds}
            items={items} boughtItems={boughtItems} removeItem={removeItem}
            isKid={isKid} colors={colors} P={P}
          />
        </View>
      </FullPageOverlay>

      {/* Runs sub-screen */}
      <FullPageOverlay visible={tab === 'runs'} onDismiss={() => setTab(null)} zIndex={41}>
        <View style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }}>
          <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
            backgroundColor: isDark ? '#0E0C13' : '#FFFFFF', gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                {(familyName ?? 'FAMILY SPACE').toUpperCase()}
              </Text>
              {activeMember && <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>{activeMember.name}</Text>}
            </View>
            <View style={{ gap: 4 }}>
              <Pressable onPress={() => setTab(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Groceries</Text>
              </Pressable>
              <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
                Shopping Trips
              </Text>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
            <RunsTabBody
              runs={runs} activeRuns={activeRuns} draftRuns={draftRuns} doneRuns={doneRuns}
              setSelectedRun={setSelectedRun} handleDeleteRun={handleDeleteRun}
              onNewRun={() => setShowNewRun(true)}
              isKid={isKid} colors={colors} isDark={isDark} P={P}
            />
          </ScrollView>
        </View>
      </FullPageOverlay>

      {/* History sub-screen */}
      <FullPageOverlay visible={tab === 'history'} onDismiss={() => setTab(null)} zIndex={42}>
        <View style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }}>
          <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
            backgroundColor: isDark ? '#0E0C13' : '#FFFFFF', gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                {(familyName ?? 'FAMILY SPACE').toUpperCase()}
              </Text>
              {activeMember && <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>{activeMember.name}</Text>}
            </View>
            <View style={{ gap: 4 }}>
              <Pressable onPress={() => setTab(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Groceries</Text>
              </Pressable>
              <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
                Purchase History
              </Text>
            </View>
          </View>
          <HistoryTab familyId={familyId} memberId={activeMemberId ?? ''} colors={colors} isDark={isDark} />
        </View>
      </FullPageOverlay>

      {/* Insights sub-screen */}
      <FullPageOverlay visible={tab === 'insights'} onDismiss={() => setTab(null)} zIndex={43}>
        <View style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }}>
          <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
            backgroundColor: isDark ? '#0E0C13' : '#FFFFFF', gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                {(familyName ?? 'FAMILY SPACE').toUpperCase()}
              </Text>
              {activeMember && <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>{activeMember.name}</Text>}
            </View>
            <View style={{ gap: 4 }}>
              <Pressable onPress={() => setTab(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Groceries</Text>
              </Pressable>
              <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
                Insights
              </Text>
            </View>
          </View>
          <InsightsTab familyId={familyId} colors={colors} isDark={isDark} />
        </View>
      </FullPageOverlay>

      {/* Full-page overlays (no Modals) */}
      <FullPageOverlay visible={showReceiptScan} onDismiss={() => setShowReceiptScan(false)} zIndex={50}>
        <ReceiptScanSheet
          visible={showReceiptScan}
          onClose={() => setShowReceiptScan(false)}
          familyId={familyId}
          memberId={activeMemberId ?? ''}
          colors={colors}
          isDark={isDark}
          onSuccess={() => load(familyId)}
        />
      </FullPageOverlay>
      <FullPageOverlay visible={showAddItem} onDismiss={() => { setShowAddItem(false); setEditingItem(undefined); }} zIndex={51}>
        <AddItemSheet
          visible={showAddItem}
          onClose={() => { setShowAddItem(false); setEditingItem(undefined); }}
          familyId={familyId}
          memberId={activeMemberId ?? ''}
          colors={colors}
          isDark={isDark}
          editItem={editingItem}
        />
      </FullPageOverlay>
      <FullPageOverlay visible={showNewRun} onDismiss={() => setShowNewRun(false)} zIndex={52}>
        <CreateRunSheet
          visible={showNewRun}
          onClose={() => setShowNewRun(false)}
          familyId={familyId}
          memberId={activeMemberId ?? ''}
          colors={colors}
          isDark={isDark}
          onCreated={(run) => { setShowNewRun(false); setSelectedRun(run); }}
          pendingItems={items}
          members={members}
          onPinStore={(storeName) => setPinningStore(storeName)}
        />
      </FullPageOverlay>
      <FullPageOverlay visible={!!selectedRun} onDismiss={() => setSelectedRun(null)} zIndex={53}>
        <RunDetailSheet
          run={selectedRun}
          visible={!!selectedRun}
          onClose={() => setSelectedRun(null)}
          memberId={activeMemberId ?? ''}
          pendingItems={items}
          colors={colors}
          isDark={isDark}
        />
      </FullPageOverlay>
      <FullPageOverlay visible={!!pinningStore} onDismiss={() => setPinningStore(null)} zIndex={55}>
        <PinStoreLocationSheet
          visible={!!pinningStore}
          store={pinningStore ?? ''}
          onClose={() => setPinningStore(null)}
          onPin={async (lat, lng) => {
            if (!pinningStore || !activeMemberId) return;
            await pinStoreLocation({ familyId, store: pinningStore, latitude: lat, longitude: lng, pinnedBy: activeMemberId });
            if (geofencingEnabled) registerStoreGeofences(familyId, activeMemberId).catch(() => {});
          }}
        />
      </FullPageOverlay>
      {/* AI Suggestions full-page overlay */}
      <FullPageOverlay visible={showAiSuggestions} onDismiss={() => setShowAiSuggestions(false)} zIndex={56}>
        <AiSuggestionsScreen
          visible={showAiSuggestions}
          onClose={() => setShowAiSuggestions(false)}
          familyId={familyId}
          memberId={activeMemberId ?? ''}
          existingItems={items}
          colors={colors}
          isDark={isDark}
          onAdded={(count) => {
            showToast(`Added ${count} item${count !== 1 ? 's' : ''} to your list`);
            load(familyId);
          }}
        />
      </FullPageOverlay>

      <FullPageOverlay visible={!!detailItem} onDismiss={() => setDetailItem(null)} zIndex={54}>
        <ItemDetailSheet
          item={detailItem}
          members={members}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setEditingItem(detailItem ?? undefined); setShowAddItem(true); }}
          onBuy={() => detailItem && handleBuyItem(detailItem)}
          onDelete={isKid ? undefined : () => detailItem && Alert.alert('Remove item?', `"${detailItem.name}"`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => { removeItem(detailItem.id); showToast('Item removed'); } },
          ])}
          priceInfo={detailItem ? priceMap[detailItem.name] : undefined}
          colors={colors}
          isDark={isDark}
        />
      </FullPageOverlay>
    </View>
  );
}

// ─── Kid/teen read-only grocery view ────────────────────────────────────
// Replaces the whole List/Runs/History/Insights screen for these two
// roles [live-requested: "as i said we shoun't give the access to grocey
// add in the melas page they just can see their approved groceries by
// parents / kids and teens both" / "and that item status if the parent
// or someone brought that"]. Real per-item data only: KidRequestItem
// .status (pending/approved/rejected, set by the real parent
// approveItemsAndSync/rejectItems flow — ParentView.tsx's own
// approveItemsAndSync), and — once approved — whether the matching real
// grocery_items row has since been bought and by whom. There is no
// stored link from a KidRequestItem to the grocery_items row it produced
// (approveItemsAndSync just calls addItem with the same name/addedBy —
// verified by reading it), so the match here is the same normalized-name
// + addedBy key addItem's own dedupe already uses — same approach as
// kiosk's own KidGroceryRequestsPanel (features/kiosk/tabs/
// KioskMealsTab.tsx), kept in sync with that one deliberately.
const SUPPLIES_PREFIX = 'SUPPLIES_REQUEST:';

function KidGroceryRequestsView({ activeMemberId, members, colors, isDark, hideHeader, insets }: {
  activeMemberId: string;
  members: any[];
  colors: any;
  isDark: boolean;
  hideHeader: boolean;
  insets: { top: number };
}) {
  const familyId = (members.find(m => m.id === activeMemberId) as any)?.familyId ?? 'family-1';
  const groceryItems = useGroceryStore(s => s.items);
  const load = useGroceryStore(s => s.load);
  const requests = useKidRequestStore(s => s.requests);
  const [boughtItems, setBoughtItems] = useState<GroceryItem[]>([]);

  useEffect(() => { if (familyId) load(familyId); }, [familyId, load]);

  useEffect(() => {
    if (!familyId) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('grocery_items')
      .select('*').eq('family_id', familyId).eq('is_bought', true)
      .gte('bought_at', since).order('bought_at', { ascending: false }).limit(50)
      .then(({ data }) => setBoughtItems((data ?? []).map(mapBoughtRow)));
  }, [familyId, groceryItems.length]);

  const nameOf = (id?: string) => members.find((m: any) => m.id === id)?.name?.trim().split(' ')[0];
  const norm = (str: string) => str.toLowerCase().trim();

  const myItems = useMemo(() => {
    const mine = requests
      .filter(r => r.type === 'delegation' && !r.detail.startsWith(SUPPLIES_PREFIX)
        && r.fromMemberId === activeMemberId && !!r.items?.length)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return mine.flatMap(r => (r.items ?? []).map(it => ({ reqId: r.id, item: it })));
  }, [requests, activeMemberId]);

  const findLiveStatus = (it: KidRequestItem): { bought: boolean; boughtBy?: string } | null => {
    const key = norm(it.name);
    const pending = groceryItems.find(g => g.addedBy === activeMemberId && norm(g.name) === key);
    if (pending) return { bought: false };
    const bought = boughtItems.find(g => g.addedBy === activeMemberId && norm(g.name) === key);
    if (bought) return { bought: true, boughtBy: bought.boughtBy };
    return null;
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {!hideHeader && (
        <View style={{ backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingTop: insets.top + 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Ionicons name="cart" size={22} color={colors.primary} />
            <Text style={[s.headerTitle, { color: colors.textPrimary, flex: 1 }]}>My Requested Groceries</Text>
          </View>
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
        {myItems.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
            <Ionicons name="cart-outline" size={32} color={colors.textTertiary} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textTertiary, textAlign: 'center' }}>
              Ask a parent to add something and it'll show up here.
            </Text>
          </View>
        ) : myItems.map(({ reqId, item }) => {
          const live = item.status === 'approved' ? findLiveStatus(item) : null;
          const statusLabel = item.status === 'pending'
            ? 'Waiting on a parent'
            : item.status === 'rejected'
              ? `Declined${item.rejectedBy ? ` by ${nameOf(item.rejectedBy)}` : ''}`
              : live?.bought
                ? `Bought${live.boughtBy ? ` by ${nameOf(live.boughtBy)}` : ''}`
                : `Approved${item.approvedBy ? ` by ${nameOf(item.approvedBy)}` : ''}`;
          const statusColor = item.status === 'pending' ? colors.amber
            : item.status === 'rejected' ? colors.danger
            : live?.bought ? colors.success
            : colors.accent;
          return (
            <View key={`${reqId}-${item.id}`} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
              paddingVertical: 12, paddingHorizontal: 14,
            }}>
              <Text style={{ fontSize: 22 }}>{item.emoji ?? itemEmoji(item.name) ?? '🛒'}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                  {item.name}{item.qty ? ` · ${item.qty}` : ''}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor, marginTop: 2 }} numberOfLines={1}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
