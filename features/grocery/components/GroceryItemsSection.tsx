import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Alert, Pressable, findNodeHandle, UIManager, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { GroceryItem, useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { FlatSectionHeader } from './FlatSectionHeader';
import { DraggableItemRow } from './DraggableItemRow';
import { StorePickerSheet } from './StorePickerSheet';
import { s } from './styles';

// ─── Main store-grouped grocery list (with empty state) ───────────────────────

export function GroceryItemsSection({
  groceryItems, groupedItems, hasSuppliesOrClothing,
  selectedIds, setSelectedIds, isSelecting, priceMap,
  setDetailItem, handleBuyItem, setEditingItem, setShowAddItem, removeItem,
  isKid, members, colors, isDark,
  pinnedStores, onPinStore, onAutoScroll,
  familyId, activeMemberId,
}: {
  groceryItems: GroceryItem[];
  groupedItems: [string, GroceryItem[]][];
  hasSuppliesOrClothing: boolean;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isSelecting: boolean;
  priceMap: Record<string, { price: number | null; unit: string | null; source: 'kroger' | 'receipt' | 'estimate' | 'unrecognized' | 'unknown' }>;
  setDetailItem: (item: GroceryItem | null) => void;
  handleBuyItem: (item: GroceryItem) => void;
  setEditingItem: (item: GroceryItem | undefined) => void;
  setShowAddItem: (v: boolean) => void;
  removeItem: (id: string) => void;
  isKid: boolean;
  members: any[];
  colors: any; isDark: boolean;
  // store_proximity_reminders (feature-flagged) — omitted entirely when the
  // flag is off, so no pin affordance renders and this section behaves
  // exactly as it did before the feature existed.
  pinnedStores?: Record<string, { lat: number; lng: number }>;
  onPinStore?: (store: string) => void;
  // Called with a signed px delta (+down/-up) while a drag's finger is near
  // the top/bottom of the viewport, so the parent's ScrollView can nudge
  // itself — this component has no ref to that ScrollView, only the
  // screen that owns it does. Pass null to stop scrolling.
  onAutoScroll?: (delta: number | null) => void;
  // Needed to persist a brand-new store name typed into StorePickerSheet
  // into family_store_preferences (live-requested).
  familyId: string;
  activeMemberId: string;
}) {
  const P = colors.primary;
  const updateItem = useGroceryStore(s => s.updateItem);
  const pastStores = useGroceryStore(s => s.pastStores);
  const savedStorePrefs = useGroceryStore(s => s.savedStorePrefs);
  const loadSavedStores = useGroceryStore(s => s.loadSavedStores);
  const addSavedStore = useGroceryStore(s => s.addSavedStore);

  // Every store currently in play on this list, plus past-run stores, the
  // family's own saved preferences, and the app defaults — the full pool a
  // "move to store" picker should offer, not just the handful already
  // grouped here. savedStorePrefs first — a family's own curated additions
  // are the most likely re-pick, ahead of static app defaults.
  const knownStores = [...new Set([
    ...groupedItems.map(([store]) => store).filter(s => s !== 'Any store'),
    ...savedStorePrefs,
    ...pastStores,
    ...DEFAULT_GROCERY_STORES,
  ])];

  useEffect(() => { if (familyId) loadSavedStores(familyId); }, [familyId, loadSavedStores]);

  const [pickerTarget, setPickerTarget] = useState<GroceryItem | null>(null);
  const promptMoveStore = (item: GroceryItem) => setPickerTarget(item);

  const handleStoreSelect = (store: string | undefined) => {
    if (!pickerTarget) return;
    updateItem(pickerTarget.id, { storePreference: store });
    // A brand-new store name (not already in knownStores) gets saved for
    // future suggestion — the actual "add new store" half of the request.
    if (store && !knownStores.some(s => s.toLowerCase() === store.toLowerCase())) {
      addSavedStore({ familyId, name: store, createdBy: activeMemberId });
    }
    setPickerTarget(null);
  };

  // ── Drag-and-drop between store sections ─────────────────────────────────
  const itemsById = Object.fromEntries(groceryItems.map(i => [i.id, i]));

  // Each store section's on-screen Y range, measured on layout. A plain ref
  // (not state) — written on every layout pass, only ever read synchronously
  // from the drag-end/hover callbacks below, never needs its own re-render.
  const sectionBounds = useRef<Record<string, { top: number; bottom: number }>>({});
  const registerSectionLayout = useCallback((store: string, ref: View | null) => {
    if (!ref) return;
    const handle = findNodeHandle(ref);
    if (!handle) return;
    UIManager.measureInWindow(handle, (x, y, width, height) => {
      sectionBounds.current[store] = { top: y, bottom: y + height };
    });
  }, []);

  const storeAtY = useCallback((pageY: number): string | null => {
    for (const [store, bounds] of Object.entries(sectionBounds.current)) {
      if (pageY >= bounds.top && pageY <= bounds.bottom) return store;
    }
    return null;
  }, []);

  const draggingId = useSharedValue<string | null>(null);
  const dragAbsoluteY = useSharedValue(0);
  const [hoveredStore, setHoveredStore] = useState<string | null>(null);

  const AUTOSCROLL_EDGE = 110;
  const AUTOSCROLL_SPEED = 10;
  // Screen height as a stand-in for "visible scroll viewport" — close
  // enough for edge detection (header/tab-bar chrome eat a bit of it,
  // making the effective edge zone slightly generous — not a problem here)
  // without plumbing a separate onLayout down from the screen just to
  // measure the ScrollView's own rendered height.
  const [viewportHeight] = useState(() => Dimensions.get('window').height);

  // Live hover highlight + edge auto-scroll while a drag is in flight —
  // runs as a UI-thread reaction on dragAbsoluteY (updated every pan frame
  // by DraggableItemRow) rather than polling, so the highlighted section
  // and the auto-scroll both track the finger smoothly. storeAtY/onAutoScroll
  // themselves are plain JS, hence the runOnJS hops.
  useAnimatedReaction(
    () => ({ y: dragAbsoluteY.value, dragging: draggingId.value !== null }),
    (curr, prev) => {
      if (!curr.dragging) {
        if (prev?.dragging) {
          runOnJS(setHoveredStore)(null);
          if (onAutoScroll) runOnJS(onAutoScroll)(null);
        }
        return;
      }
      runOnJS((y: number) => setHoveredStore(storeAtY(y)))(curr.y);
      if (onAutoScroll && viewportHeight > 0) {
        if (curr.y < AUTOSCROLL_EDGE) runOnJS(onAutoScroll)(-AUTOSCROLL_SPEED);
        else if (curr.y > viewportHeight - AUTOSCROLL_EDGE) runOnJS(onAutoScroll)(AUTOSCROLL_SPEED);
        else runOnJS(onAutoScroll)(null);
      }
    },
    [viewportHeight]
  );

  const handleDrop = useCallback((itemId: string, pageY: number) => {
    setHoveredStore(null);
    onAutoScroll?.(null);
    const item = itemsById[itemId];
    if (!item) return;
    const store = storeAtY(pageY);
    if (!store || store === (item.storePreference ?? 'Any store')) return;
    const target = store === 'Any store' ? undefined : store;
    updateItem(itemId, { storePreference: target });
  }, [itemsById, updateItem, storeAtY, onAutoScroll]);

  if (groceryItems.length === 0 && !hasSuppliesOrClothing) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyEmoji}>🛒</Text>
        <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Nothing on the list</Text>
        <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>Tap + to add items or use ✨ AI to suggest.</Text>
      </View>
    );
  }

  if (groceryItems.length === 0) return null;

  const dragEnabled = !isKid && !isSelecting && groupedItems.length > 1;

  return (
    <>
      <FlatSectionHeader emoji="🛒" title="Groceries" accent={colors.success} colors={colors}
        badge={`${groceryItems.filter(i => !i.isBought).length} left`} />
      {groupedItems.map(([store, storeItems]) => (
        <View key={store} style={{ marginBottom: 18 }} ref={(ref) => registerSectionLayout(store, ref)}>
          {/* Store sub-header — highlights while a dragged item is hovering over this section */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4,
            backgroundColor: hoveredStore === store ? P + '18' : 'transparent',
            borderRadius: 8, paddingHorizontal: hoveredStore === store ? 6 : 0, paddingVertical: hoveredStore === store ? 3 : 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="storefront-outline" size={12} color={P} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: P, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                {store === 'Any store' ? 'Any Store' : store}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {onPinStore && store !== 'Any store' && storeItems.filter(i => !i.isBought).length >= 2 && !pinnedStores?.[store] && (
                <Pressable onPress={() => onPinStore(store)} hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="location-outline" size={11} color={colors.textTertiary} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary }}>Pin</Text>
                </Pressable>
              )}
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary }}>
                {storeItems.filter(i => !i.isBought).length} left
              </Text>
            </View>
          </View>
          <View>
            {storeItems.map((item, idx) => (
              <DraggableItemRow
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
                onMoveStore={isKid ? undefined : () => promptMoveStore(item)}
                colors={colors}
                isDark={isDark}
                dragEnabled={dragEnabled}
                draggingId={draggingId}
                dragAbsoluteY={dragAbsoluteY}
                onDrop={handleDrop}
              />
            ))}
          </View>
        </View>
      ))}

      <StorePickerSheet
        visible={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        onSelect={handleStoreSelect}
        currentStore={pickerTarget?.storePreference}
        knownStores={knownStores}
        colors={colors}
        isDark={isDark}
      />
    </>
  );
}
