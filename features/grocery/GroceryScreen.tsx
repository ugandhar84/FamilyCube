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
import { useEffect, useRef, useState, useMemo } from 'react';
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
import { useQuestStore } from '@/store/choreAdapter';
import { registerStoreGeofences } from '@/lib/storeGeofencing';
import { PinStoreLocationSheet } from './components/PinStoreLocationSheet';
import { useFeatureFlag } from '@/lib/featureFlags';

import { AddItemSheet } from './components/AddItemSheet';
import { CreateRunSheet } from './components/CreateRunSheet';
import { RunDetailSheet } from './components/RunDetailSheet';
import { ItemDetailSheet } from './components/ItemDetailSheet';
import { CategorySection } from './components/CategorySection';
import { HistoryTab } from './components/HistoryTab';
import { InsightsTab } from './components/InsightsTab';
import { GroceryAiBanner } from './components/GroceryAiBanner';
import { KidRequestsSection } from './components/KidRequestsSection';
import { GroceryItemsSection } from './components/GroceryItemsSection';
import { RecentlyBoughtSection } from './components/RecentlyBoughtSection';
import { ReturnModeToolbar, BulkSelectToolbar } from './components/SelectionToolbars';
import { RunsTabBody } from './components/RunsTabBody';
import { mapBoughtRow } from './components/types';
import { s } from './components/styles';

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GroceryScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const { items, runs, loading, load, addItem, buyItem, removeItem, deleteRun, markReturning, loadPinnedStores, pinnedStores, pinStoreLocation } = useGroceryStore();

  const [tab, setTab]                   = useState<'list' | 'runs' | 'history' | 'insights'>('list');
  const [showAddItem, setShowAddItem]   = useState(false);
  const [editingItem, setEditingItem]   = useState<GroceryItem | undefined>(undefined);
  const [detailItem,  setDetailItem]    = useState<GroceryItem | null>(null);
  const [showNewRun,  setShowNewRun]    = useState(false);
  const [showAiPanel, setShowAiPanel]   = useState(false);
  const [selectedRun, setSelectedRun]  = useState<GroceryRun | null>(null);
  const [showReceiptScan, setShowReceiptScan] = useState(false);

  // Price comparison state
  const [priceMap, setPriceMap]         = useState<Record<string, { price: number | null; unit: string | null; source: 'kroger' | 'estimate' | 'unknown' }>>({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // Seed priceMap from stored estimatedPrice whenever items load
  useEffect(() => {
    if (!items.length) return;
    const seeded: typeof priceMap = {};
    let any = false;
    for (const item of items) {
      if (item.estimatedPrice != null && !priceMap[item.name]) {
        seeded[item.name] = { price: item.estimatedPrice, unit: null, source: 'estimate' };
        any = true;
      }
    }
    if (any) {
      setPriceMap(prev => ({ ...seeded, ...prev }));
      setPricesLoaded(true);
    }
  }, [items]);

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
  const familyId = (activeMember as any)?.familyId ?? 'family-1';

  const geofencingEnabled = useFeatureFlag('store_proximity_reminders');
  const [pinningStore, setPinningStore] = useState<string | null>(null);

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

  const bg       = colors.background;
  const card     = colors.card;
  const border   = colors.border;
  const P        = colors.primary;

  const handleBuyItem = (item: GroceryItem) => {
    Alert.alert('Mark as bought?', `"${item.name}"`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Bought ✓', onPress: () => { buyItem(item.id, activeMemberId ?? ''); setTimeout(refreshBought, 600); } },
    ]);
  };

  const handleDeleteRun = (run: GroceryRun) => {
    Alert.alert('Delete run?', `"${run.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRun(run.id) },
    ]);
  };

  // ── Return mode (multi-select on bought items) ────────────────────────────
  const [returnMode, setReturnMode] = useState(false);
  const [returnIds, setReturnIds] = useState<Set<string>>(new Set());

  const handleCreateReturn = (assigneeId: string) => {
    const selectedItems = boughtItems.filter(i => returnIds.has(i.id));
    if (selectedItems.length === 0) return;
    const itemLabel = selectedItems.length === 1
      ? `"${selectedItems[0].name}"`
      : `${selectedItems.length} items`;
    const quest = useQuestStore.getState().addQuest({
      title: `↩️ Return ${itemLabel} to the store`,
      description: selectedItems.map(i => `• ${i.name}${i.quantity ? ' (' + i.quantity + ')' : ''}`).join('\n'),
      assignedToId: assigneeId,
      assignedToIds: [assigneeId],
      isPool: false,
      category: 'Shopping',
      priority: 'medium',
      coins: 10,
      xpReward: 5,
      isDaily: false,
      recurrence: 'once',
      status: 'todo',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      photoRequired: false,
      isAdultTask: false,
    });
    markReturning(Array.from(returnIds), quest.id);
    setReturnIds(new Set());
    setReturnMode(false);
    setTimeout(refreshBought, 600);
    Alert.alert('↩️ Return Quest Created', `${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''} queued for return and assigned to ${members.find(m => m.id === assigneeId)?.name ?? 'a member'}.`);
  };

  const scrollRef = useRef<ScrollView>(null);
  const [showFab, setShowFab] = useState(false);
  const fabOpacity = useRef(new Animated.Value(0)).current;
  const onScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const visible = y > 200;
    if (visible !== showFab) {
      setShowFab(visible);
      Animated.timing(fabOpacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    }
  };

  return (
    <View style={[s.root, { backgroundColor: bg }]}>

      {/* ── Fixed header + sticky tile nav ── */}
      <View style={{ backgroundColor: card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border,
        paddingTop: hideHeader ? 8 : insets.top + 8 }}>
        {/* Title row */}
        {!hideHeader && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 10 }}>
          <Ionicons name="cart" size={22} color={P} />
          <Text style={[s.headerTitle, { color: colors.textPrimary, flex: 1 }]}>Groceries</Text>
          {items.length > 0 && (
            <View style={[s.countBadge, { backgroundColor: P }]}>
              <Text style={[s.countText, { color: colors.textInverse }]}>{items.length}</Text>
            </View>
          )}
        </View>
        )}

        {/* 1×4 sticky tile nav */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 }}>
          {([
            { key: 'list',     icon: 'list' as const,          label: 'List',     badge: items.filter(i => !i.isBought).length },
            { key: 'runs',     icon: 'walk' as const,          label: 'Trips',    badge: runs.filter(r => r.status === 'active').length },
            { key: 'history',  icon: 'receipt-outline' as const, label: 'History',  badge: 0 },
            { key: 'insights', icon: 'bar-chart' as const,     label: 'Insights', badge: 0 },
          ] as const).map(t => {
            const active = tab === t.key;
            const isRuns = t.key === 'runs';
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14,
                  backgroundColor: active ? P : colors.surface,
                  borderWidth: active ? 0 : StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                  shadowColor: P, shadowOpacity: active ? 0.35 : 0, shadowRadius: 8, elevation: active ? 4 : 0 }}>
                <Ionicons name={t.icon} size={20} color={active ? colors.textInverse : colors.textSecondary} style={{ marginBottom: 3 }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? colors.textInverse : colors.textSecondary }}>
                  {t.label}
                </Text>
                {t.badge > 0 && (
                  <View style={{ position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16,
                    borderRadius: 8, backgroundColor: active ? 'rgba(255,255,255,0.35)' : P,
                    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textInverse }}>{t.badge}</Text>
                  </View>
                )}
                {isRuns && (
                  <Pressable
                    onPress={e => { e.stopPropagation(); setShowNewRun(true); }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={{ position: 'absolute', bottom: 5, right: 5, width: 18, height: 18,
                      borderRadius: 9, backgroundColor: active ? 'rgba(255,255,255,0.30)' : P,
                      alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="add" size={12} color={colors.textInverse} />
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* AI banner + cart total + active run */}
        <View>
          <GroceryAiBanner
            isDark={isDark} colors={colors}
            onScan={() => setShowReceiptScan(true)}
            onPriceCheck={() => checkPrices()}
            pricesLoaded={pricesLoaded} priceLoading={priceLoading}
          />

          {cartTotal > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 10,
              backgroundColor: colors.primaryLight,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="cart-outline" size={14} color={P} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>
                  Estimated total ({items.filter(i => !i.isBought).length} items)
                </Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '900', color: P }}>${cartTotal.toFixed(2)}</Text>
            </View>
          )}

          {activeRuns.length > 0 && (
            <Pressable onPress={() => setSelectedRun(activeRuns[0])}
              style={[s.activeBanner, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
              <View style={[s.activeDot, { backgroundColor: colors.success }]} />
              <Text style={[s.activeBannerText, { color: colors.success }]}>Shopping now at {activeRuns[0].store}</Text>
              <Text style={[s.activeBannerText, { color: colors.success, fontWeight: '600' }]}>Tap to open →</Text>
            </Pressable>
          )}
        </View>

        {/* Tab content */}
        {tab === 'history' ? (
          <HistoryTab familyId={familyId} memberId={activeMemberId ?? ''} colors={colors} isDark={isDark} />
        ) : tab === 'insights' ? (
          <InsightsTab familyId={familyId} colors={colors} isDark={isDark} />
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={P} />
        ) : tab === 'list' ? (
        <>
          <PartnerStatusBar familyId={familyId} currentMemberId={activeMemberId ?? ''} colors={colors} isDark={isDark} />
          <SmartRestockBanner familyId={familyId} colors={colors} isDark={isDark}
            onAddItem={(name, category) => addItem({ familyId, addedBy: activeMemberId ?? '', name, category })} />
          <View style={{ padding: 16 }}>

          {/* Supplies section */}
          {categorisedItems.supplies.length > 0 && (
            <CategorySection label="Supplies" emoji="📚" color="#6366F1"
              items={categorisedItems.supplies} isDark={isDark} colors={colors}
              isKid={isKid} onBuy={handleBuyItem} members={members} />
          )}

          {/* Clothing section */}
          {categorisedItems.clothing.length > 0 && (
            <CategorySection label="Clothing" emoji="👕" color={colors.amber}
              items={categorisedItems.clothing} isDark={isDark} colors={colors}
              isKid={isKid} onBuy={handleBuyItem} members={members} />
          )}

          <KidRequestsSection
            kidGroceryGroups={kidGroceryGroups}
            isKid={isKid}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            isSelecting={isSelecting}
            priceMap={priceMap}
            setDetailItem={setDetailItem}
            handleBuyItem={handleBuyItem}
            setEditingItem={setEditingItem}
            setShowAddItem={setShowAddItem}
            removeItem={removeItem}
            members={members}
            colors={colors}
            isDark={isDark}
          />

          <GroceryItemsSection
            groceryItems={groceryItems}
            groupedItems={groupedItems}
            hasSuppliesOrClothing={categorisedItems.supplies.length > 0 || categorisedItems.clothing.length > 0}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            isSelecting={isSelecting}
            priceMap={priceMap}
            setDetailItem={setDetailItem}
            handleBuyItem={handleBuyItem}
            setEditingItem={setEditingItem}
            setShowAddItem={setShowAddItem}
            removeItem={removeItem}
            isKid={isKid}
            members={members}
            colors={colors}
            isDark={isDark}
            pinnedStores={geofencingEnabled ? pinnedStores : undefined}
            onPinStore={geofencingEnabled ? (store) => setPinningStore(store) : undefined}
          />

          <RecentlyBoughtSection
            boughtItems={boughtItems}
            boughtExpanded={boughtExpanded}
            setBoughtExpanded={setBoughtExpanded}
            returnMode={returnMode}
            setReturnMode={setReturnMode}
            returnIds={returnIds}
            setReturnIds={setReturnIds}
            isKid={isKid}
            members={members}
            colors={colors}
            isDark={isDark}
          />
        </View>

        <ReturnModeToolbar
          returnMode={returnMode}
          returnIds={returnIds}
          members={members}
          colors={colors}
          handleCreateReturn={handleCreateReturn}
        />

        <BulkSelectToolbar
          isSelecting={isSelecting}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          items={items}
          boughtItems={boughtItems}
          removeItem={removeItem}
          isKid={isKid}
          colors={colors}
          P={P}
        />
        </>
      ) : (
        <RunsTabBody
          runs={runs}
          activeRuns={activeRuns}
          draftRuns={draftRuns}
          doneRuns={doneRuns}
          setSelectedRun={setSelectedRun}
          handleDeleteRun={handleDeleteRun}
          isKid={isKid}
          colors={colors}
          isDark={isDark}
          P={P}
        />
      )}

      </ScrollView>

      {/* Go-to-top FAB */}
      <Animated.View style={{
        position: 'absolute', bottom: insets.bottom + 144, right: 20,
        opacity: fabOpacity, pointerEvents: showFab ? 'auto' : 'none',
      }}>
        <Pressable
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color={P} />
        </Pressable>
      </Animated.View>

      {/* Add FAB */}
      <Pressable
        onPress={() => setShowAddItem(true)}
        style={[s.fab, { backgroundColor: P, bottom: insets.bottom + 80 }]}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </Pressable>

      {/* Sheets */}
      <ReceiptScanSheet
        visible={showReceiptScan}
        onClose={() => setShowReceiptScan(false)}
        familyId={familyId}
        memberId={activeMemberId ?? ''}
        colors={colors}
        isDark={isDark}
        onSuccess={() => load(familyId)}
      />
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
        onCreated={(run) => { setShowNewRun(false); setSelectedRun(run); setTab('runs' as any); }}
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
      {geofencingEnabled && (
        <PinStoreLocationSheet
          visible={!!pinningStore}
          store={pinningStore ?? ''}
          onClose={() => setPinningStore(null)}
          onPin={async (lat, lng) => {
            if (!pinningStore || !activeMemberId) return;
            await pinStoreLocation({ familyId, store: pinningStore, latitude: lat, longitude: lng, pinnedBy: activeMemberId });
            registerStoreGeofences(familyId, activeMemberId).catch(() => {});
          }}
        />
      )}
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
