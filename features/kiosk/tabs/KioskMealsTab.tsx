/**
 * KioskMealsTab — "Meals & Grocery", the mockup's kitchen tab.
 *
 * This is the one genuinely NEW kiosk tab. Meals and grocery are both real,
 * long-standing features of this app (features/vault/tabs/MealsTab.tsx over
 * the `family_meals` table; features/grocery/GroceryScreen.tsx over
 * store/groceryStore.ts) that had no kiosk surface at all — which is a
 * strange gap, since a wall-mounted screen in the kitchen is the single
 * most obvious place in the product for both.
 *
 * No new store was created for either. Meals come through useKioskMeals,
 * which runs the same `family_meals` query MealsTab runs and reuses its own
 * Meal type/weekOf helper. Grocery goes straight through the existing
 * useGroceryStore — including its realtime subscription, so a partner
 * checking items off at the store updates this screen live, and its
 * addItem/updateItem/removeItem/buyItem actions, so any change here is a
 * real DB write another device sees, not local state.
 *
 * Grocery CRUD is full parity with the phone's own GroceryScreen (live-
 * requested: "100% parity except start run, since it stays at kitchen") —
 * Create (quick-add row, or KioskGroceryItemSheet for the full field set),
 * Read (realtime list), Update (KioskGroceryItemSheet in edit mode, opened
 * by tapping a row), Delete (same sheet's confirm-to-delete), and Buy
 * (the row's own checkbox). The one real phone affordance NOT ported is
 * starting/opening a shopping run (CreateRunSheet/RunDetailSheet) — a
 * fixed kitchen display isn't the device you carry to the store, so kiosk
 * only ever READS run status (the "Shopping now at {store}" banner above).
 *
 * Two deliberate scope decisions:
 *   · NO stove/oven timer widget. The mockup has one; the owner ruled it
 *     out of scope. Nothing here schedules or counts anything.
 *   · NO AI meal generation. That flow (MealsTab's CubeAI planner, the
 *     family-ai edge function, a multi-step select-and-confirm phase) is a
 *     considered, multi-screen interaction that does not shrink onto a
 *     glanceable kitchen panel usefully. Kiosk READS the plan and manages
 *     the grocery list against it; planning the week stays on the phone.
 *     The empty state says so rather than dead-ending.
 *
 * Role scoping: adding, editing, deleting, and checking off grocery items
 * is open to everyone (a kid noticing the milk is gone is exactly the
 * behavior a family list wants, and it's how the phone's own grocery
 * screen already behaves) — EXCEPT a kid's own already-approved requests,
 * which stay read-only on kiosk (they can see it made the list, not
 * manage it), same scoping the phone's own isKid-gated onDelete/onMoveStore
 * already use.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator,
  findNodeHandle, UIManager, Dimensions, Alert,
} from 'react-native';
import { Plus, Check, ListPlus, Store, ChevronDown, ChevronUp, Sparkles, MapPin, RotateCcw, ScanLine } from 'lucide-react-native';
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { useGroceryStore, type GroceryItem } from '@/store/groceryStore';
import { categorizeItem } from '@/features/vault/tabs/meals/types';
import { CAT_ICON, itemEmoji, mapBoughtRow } from '@/features/grocery/components/types';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { WidgetCard, PanelHead, Well, TabTitle, EmptyNote } from '../components/KioskOS';
import { useKioskMeals, daysFromToday, todayMealDay } from '../useKioskMeals';
import { useKioskActivity } from '../KioskActivityContext';
import { KioskRecipeDrawer } from '../components/KioskRecipeDrawer';
import { KioskGroceryItemSheet } from '../components/KioskGroceryItemSheet';
import { KioskStoreMoveSheet } from '../components/KioskStoreMoveSheet';
import { KioskDraggableItemRow } from '../components/KioskDraggableItemRow';
import { KioskPinStoreLocationSheet } from '../components/KioskPinStoreLocationSheet';
import { KioskReceiptScanSheet } from '../components/KioskReceiptScanSheet';
import { useFeatureFlag } from '@/lib/featureFlags';
import { registerStoreGeofences } from '@/lib/storeGeofencing';

export function KioskMealsTab({ active, members }: { active: FamilyMember; members: FamilyMember[] }) {
  const { k, isDark } = useKioskColors();
  const { meals, loading, week } = useKioskMeals();
  const { registerActivity } = useKioskActivity();
  // The full household grocery list is hidden from kids on kiosk
  // specifically (live-reported: "remove groceries for kids" — a kiosk-
  // only scope decision, the phone's own GroceryScreen still shows kids
  // the whole list with reduced permissions). A kid still sees and can
  // check off whatever THEY themselves added, per the follow-up ("his own
  // approved groceries can show") — there's no separate approval flag on
  // a grocery item (unlike quests/chores), so "his own" is simply
  // addedBy === this kid, same identity GroceryScreen's own kid-request
  // grouping already keys off.
  const isKid = active.role === 'kid';
  // Meal lines were read-only — tapping one now opens its full recipe in
  // the same side drawer the Overview hero's Breakfast/Lunch/Dinner cards
  // already use (KioskRecipeDrawer), so the two surfaces that both show a
  // meal behave identically rather than one being tappable and one not.
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);

  // Full CRUD parity with the phone's own grocery list (live-requested:
  // "100% parity except start run, since it stays at kitchen") — undefined
  // = add-new mode, a real item = edit mode. Same dual-mode sheet the
  // phone's AddItemSheet uses, gated the same isKid way as the inline
  // quick-add row: a kid manages their own already-approved items read-only
  // on kiosk, same as everywhere else on this screen.
  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GroceryItem | undefined>(undefined);

  // Quick "move to a different store" without opening the full edit sheet —
  // see KioskStoreMoveSheet's own header for why this mirrors the phone's
  // ItemCard.tsx onMoveStore button rather than its drag-and-drop layer.
  const [movingItem, setMovingItem] = useState<GroceryItem | undefined>(undefined);

  // Bulk multi-select for delete — same real long-press-to-select mode
  // BulkSelectToolbar.tsx gates on (isSelecting = selectedIds.size > 0),
  // not a separate boolean flag.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelecting = selectedIds.size > 0;
  const toggleSelectItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const removeItem = useGroceryStore(s => s.removeItem);

  // "user can put the location fence here also .. like in mobile so user
  // can add their frequent shopping address" — same real feature and same
  // OFF-by-default feature flag GroceryScreen.tsx itself gates this
  // behind (store_proximity_reminders isn't released to anyone yet, on
  // any platform), so this stays invisible today and appears on kiosk and
  // phone together the moment that flag ships, rather than kiosk shipping
  // ahead of the phone's own rollout.
  const geofencingEnabled = useFeatureFlag('store_proximity_reminders');
  const [pinningStore, setPinningStore] = useState<string | null>(null);
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const pinStoreLocation = useGroceryStore(s => s.pinStoreLocation);
  const pinnedStores = useGroceryStore(s => s.pinnedStores);
  const loadPinnedStores = useGroceryStore(s => s.loadPinnedStores);

  const items = useGroceryStore(s => s.items);
  const load = useGroceryStore(s => s.load);
  const addItem = useGroceryStore(s => s.addItem);
  const buyItem = useGroceryStore(s => s.buyItem);
  // Live-requested: "can we make undo already bought one to put back to
  // original store?" — restoreItem is a real, already-correct store
  // action (writes is_bought:false back to Postgres, same realtime path
  // as every other write here) that genuinely has NO caller anywhere in
  // this app today, phone included (grepped the whole repo) — not a
  // phone feature kiosk was missing, a real capability nobody had wired a
  // button to yet. The item's storePreference was never touched by
  // buying it, so restoring naturally puts it back in the same store
  // section it came from — no extra bookkeeping needed for "original
  // store."
  const restoreItem = useGroceryStore(s => s.restoreItem);
  const runs = useGroceryStore(s => s.runs);

  const visibleItems = useMemo(
    () => isKid ? items.filter(it => it.addedBy === active.id) : items,
    [items, isKid, active.id],
  );

  // Real phone grouping (features/grocery/GroceryScreen.tsx's
  // categorisedItems + groupedItems, read in full) — live-reported: "i
  // dont see the the store/cat[egory] grouping ?? like in mobile," so this
  // reproduces both, not an approximation:
  //   1. Category buckets first — Supplies and Clothing get their own
  //      section, everything else falls into Groceries. Same match rule
  //      (category === 'Supplies'/'School Supplies' or 'Clothing'/
  //      'Clothes'; everything else, including no category, is groceries).
  //   2. Only the Groceries bucket is then further grouped by store
  //      preference, "Any store" always sorted last — the phone's own
  //      groupedItems does the identical two-step, not a flat list.
  // The phone's separate kidGroceryGroups step (its OWN "requests from
  // Priya" style section, splitting kid-added items out of the store
  // groups entirely) is not reproduced — kiosk already scopes kid items a
  // different real way (isKid limits visibleItems to that kid's own
  // additions above), so there is no separate "whose request" grouping
  // left to show once that filter has already applied.
  const categorisedItems = useMemo(() => {
    const buckets: { groceries: GroceryItem[]; supplies: GroceryItem[]; clothing: GroceryItem[] } = { groceries: [], supplies: [], clothing: [] };
    for (const it of visibleItems) {
      const cat = it.category;
      if (cat === 'Supplies' || cat === 'School Supplies') buckets.supplies.push(it);
      else if (cat === 'Clothing' || cat === 'Clothes') buckets.clothing.push(it);
      else buckets.groceries.push(it);
    }
    return buckets;
  }, [visibleItems]);

  const groupedGroceries = useMemo(() => {
    const groups: Record<string, GroceryItem[]> = {};
    for (const it of categorisedItems.groceries) {
      const key = it.storePreference || 'Any store';
      (groups[key] ??= []).push(it);
    }
    return Object.entries(groups).sort(([a], [b]) =>
      a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b));
  }, [categorisedItems.groceries]);

  // ── Drag-and-drop between store sections ─────────────────────────────────
  // Live-requested on top of the tap-based KioskStoreMoveSheet already
  // shipped: "Yes, add real drag-and-drop." Ported from
  // features/grocery/components/GroceryItemsSection.tsx's own drag system —
  // read in full, including its crash-history comments, since this exact
  // feature has a documented SIGSEGV history on the phone even in its
  // mature, previously-shipped form.
  const updateItem = useGroceryStore(s => s.updateItem);
  const itemsById = useMemo(() => Object.fromEntries(visibleItems.map(it => [it.id, it])), [visibleItems]);

  // Each store section's on-screen Y range, measured in ABSOLUTE window
  // coordinates (not onLayout's scroll-content-relative ones) so it's
  // directly comparable to dragAbsoluteY, which KioskDraggableItemRow
  // reports from the gesture's own e.absoluteY — same reasoning as the
  // phone's own UIManager.measureInWindow choice over onLayout here.
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
  const [viewportHeight] = useState(() => Dimensions.get('window').height);

  const updateHoveredStore = useCallback((y: number) => {
    setHoveredStore(storeAtY(y));
  }, [storeAtY]);

  // Auto-scroll for THIS screen's own top-level ScrollView (mealsScrollRef
  // below) — same setInterval-driven relative-scroll pattern
  // GroceryScreen.tsx's own handleAutoScroll uses, since RN's ScrollView
  // only exposes an absolute scrollTo, never a relative "scroll by."
  const mealsScrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScrollDelta = useRef(0);
  const handleAutoScroll = useCallback((delta: number | null) => {
    if (delta === null) {
      if (autoScrollTimer.current) { clearInterval(autoScrollTimer.current); autoScrollTimer.current = null; }
      return;
    }
    autoScrollDelta.current = delta;
    if (autoScrollTimer.current) return;
    autoScrollTimer.current = setInterval(() => {
      scrollYRef.current = Math.max(0, scrollYRef.current + autoScrollDelta.current);
      mealsScrollRef.current?.scrollTo({ y: scrollYRef.current, animated: false });
    }, 16);
  }, []);

  const HOVER_CHECK_THRESHOLD = 8;
  useAnimatedReaction(
    () => ({ y: dragAbsoluteY.value, dragging: draggingId.value !== null }),
    (curr, prev) => {
      if (!curr.dragging) {
        if (prev?.dragging) {
          runOnJS(setHoveredStore)(null);
          runOnJS(handleAutoScroll)(null);
        }
        return;
      }
      const movedEnough = !prev?.dragging || Math.abs(curr.y - prev.y) >= HOVER_CHECK_THRESHOLD;
      if (movedEnough) runOnJS(updateHoveredStore)(curr.y);
      if (viewportHeight > 0) {
        if (curr.y < AUTOSCROLL_EDGE) runOnJS(handleAutoScroll)(-AUTOSCROLL_SPEED);
        else if (curr.y > viewportHeight - AUTOSCROLL_EDGE) runOnJS(handleAutoScroll)(AUTOSCROLL_SPEED);
        else runOnJS(handleAutoScroll)(null);
      }
    },
    [viewportHeight, updateHoveredStore, handleAutoScroll],
  );

  const handleDrop = useCallback((itemId: string, pageY: number) => {
    setHoveredStore(null);
    handleAutoScroll(null);
    const item = itemsById[itemId];
    if (!item) return;
    const store = storeAtY(pageY);
    if (!store || store === (item.storePreference ?? 'Any store')) return;
    const target = store === 'Any store' ? undefined : store;
    // Same deferred-mutation fix GroceryItemsSection.tsx's own handleDrop
    // comment documents: moving the last item out of a section collapses
    // groupedGroceries by one section on the very next render, unmounting
    // every OTHER KioskDraggableItemRow in that now-empty section in the
    // same synchronous update that runs while this gesture's onEnd
    // callback is still on the stack — the still-live version of the
    // SIGSEGV this whole file's header references. Deferring the actual
    // store write lets onEnd fully return control to the native gesture
    // handler first.
    setTimeout(() => updateItem(itemId, { storePreference: target }), 0);
  }, [itemsById, updateItem, storeAtY, handleAutoScroll]);

  // Drag only makes sense with more than one store section to drop into,
  // and never for a kid (matches the phone's own dragEnabled formula).
  const dragEnabled = !isKid && !isSelecting && groupedGroceries.length > 1;

  // Same read-only mirror of the real phone's "Shopping now at {store}"
  // banner as Overview's Grocery card (features/grocery/GroceryScreen.tsx:
  // activeRuns = runs.filter(status === 'active')) — kiosk can't start or
  // open a run, so no tap target, just the status glance. Shown to
  // everyone, not just !isKid — a kid on kiosk can already see the whole
  // household list's status, this isn't the add/buy surface that's scoped.
  const activeRun = useMemo(() => runs.find(r => r.status === 'active'), [runs]);
  const activeRunShopper = useMemo(
    () => activeRun ? members.find(m => m.id === activeRun.shopperId)?.name?.trim().split(' ')[0] : undefined,
    [activeRun, members],
  );

  const familyId = (members[0] as any)?.familyId as string | undefined;

  // Same load call GroceryScreen makes on mount. Idempotent — the store's
  // own guard short-circuits if it's already subscribed for this family, so
  // this costs nothing when the phone's grocery screen already loaded it.
  useEffect(() => { if (familyId) load(familyId); }, [familyId, load]);

  useEffect(() => {
    if (!familyId || !geofencingEnabled) return;
    loadPinnedStores(familyId);
  }, [familyId, geofencingEnabled, loadPinnedStores]);

  // "where is the purchase history?" — the real phone feature this answers
  // is RecentlyBoughtSection.tsx (last 7 days of is_bought=true rows), not
  // HistoryTab.tsx's scanned-RECEIPT history (grocery_receipts — a table
  // that only ever gets rows from the phone's camera-based receipt scan,
  // which kiosk has no hardware for). Reused verbatim: same query shape,
  // same 7-day window, same mapBoughtRow() this file already imports from
  // the real shared types module rather than a kiosk-local reimplementation.
  const [boughtItems, setBoughtItems] = useState<GroceryItem[]>([]);
  const [boughtExpanded, setBoughtExpanded] = useState(false);
  useEffect(() => {
    if (!familyId) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('grocery_items')
      .select('*').eq('family_id', familyId).eq('is_bought', true)
      .gte('bought_at', since).order('bought_at', { ascending: false }).limit(50)
      .then(({ data }) => setBoughtItems((data ?? []).map(mapBoughtRow)));
  }, [familyId, items.length]); // items.length: re-check after any buy this session, same as GroceryScreen's setTimeout(refreshBought,600) after handleBuyItem

  // Price estimate — same GroceryScreen.tsx checkPrices(): the kroger-prices
  // edge function, called on demand (never automatically), using the same
  // getLocationAPI() safe wrapper already ported into kiosk for weather.
  // Persists estimated_price to grocery_items on success so a later kiosk
  // session (or the phone) sees the same number without re-fetching.
  const [priceMap, setPriceMap] = useState<Record<string, { price: number | null; source: string }>>({});
  const [priceLoading, setPriceLoading] = useState(false);
  useEffect(() => {
    if (!visibleItems.length) return;
    const seeded: typeof priceMap = {};
    for (const it of visibleItems) {
      if (it.estimatedPrice == null) continue;
      const isReceipt = it.priceSource === 'receipt';
      if (isReceipt && priceMap[it.name]?.source !== 'receipt') seeded[it.name] = { price: it.estimatedPrice, source: 'receipt' };
      else if (!isReceipt && !priceMap[it.name]) seeded[it.name] = { price: it.estimatedPrice, source: 'estimate' };
    }
    if (Object.keys(seeded).length) setPriceMap(prev => ({ ...prev, ...seeded }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  const cartTotal = useMemo(
    () => visibleItems.reduce((sum, it) => sum + (priceMap[it.name]?.price ?? 0), 0),
    [visibleItems, priceMap],
  );

  const checkPrices = async () => {
    const toFetch = visibleItems.filter(it => !priceMap[it.name] && it.priceSource !== 'receipt');
    if (!toFetch.length || priceLoading) return;
    setPriceLoading(true);
    try {
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
        console.warn('[KioskMealsTab] location lookup failed:', String(locErr));
      }
      const { data, error } = await supabase.functions.invoke('kroger-prices', {
        body: { items: toFetch.map(it => it.name), country, zipCode },
      });
      if (error) console.error('[KioskMealsTab] kroger-prices error:', error);
      if (data?.prices) {
        const newEntries: typeof priceMap = {};
        for (const p of data.prices) newEntries[p.name] = { price: p.krogerPrice ?? p.fallbackEstimate, source: p.source };
        setPriceMap(prev => ({ ...prev, ...newEntries }));
        const updates = toFetch
          .filter(it => newEntries[it.name]?.price != null)
          .map(it => supabase.from('grocery_items').update({ estimated_price: newEntries[it.name].price }).eq('id', it.id));
        Promise.allSettled(updates).catch(() => {});
      }
    } catch (err) {
      console.error('[KioskMealsTab] checkPrices() uncaught error:', String(err));
    }
    setPriceLoading(false);
  };

  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const submitItem = async () => {
    const name = draft.trim();
    if (!name || !familyId || adding) return;
    setAdding(true);
    // Category is inferred with the SAME categorizeItem the meals feature
    // uses for its AI grocery hand-off, so an item added from the kitchen
    // wall groups identically to one added from a recipe.
    await addItem({ familyId, name, category: categorizeItem(name), addedBy: active.id });
    setDraft('');
    setAdding(false);
  };

  // Days ordered from today forward, so a kitchen display opens on tonight
  // rather than on Monday. Only days with a planned meal are rendered —
  // seven mostly-empty day cards is what the phone's full planner is for.
  const byDay = useMemo(() => {
    const map = new Map<string, typeof meals>();
    for (const m of meals) {
      const list = map.get(m.day) ?? [];
      list.push(m);
      map.set(m.day, list);
    }
    return daysFromToday()
      .map(day => ({ day, meals: map.get(day) ?? [] }))
      .filter(d => d.meals.length > 0);
  }, [meals]);

  const today = todayMealDay();

  return (
    <>
    <ScrollView
      ref={mealsScrollRef}
      onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={registerActivity}
    >
      <TabTitle
        title="Meals & Grocery"
        subtitle={`This week's plan and the household list · week of ${week}`}
        k={k}
      />

      <View style={s.columns}>
        {/* ══ MEAL PLAN ═══════════════════════════════════════════════ */}
        <View style={s.colWide}>
          <WidgetCard k={k} isDark={isDark}>
            <PanelHead
              title="What we're eating"
              k={k}
              right={meals.length > 0
                ? <Text style={[s.panelCount, { color: k.textFaint }]}>{meals.length} planned</Text>
                : undefined}
            />

            {loading ? (
              <ActivityIndicator color={k.gold} style={{ marginVertical: KIOSK_SPACE.xl }} />
            ) : byDay.length === 0 ? (
              <EmptyNote
                text="No meals planned for this week yet. Plan the week from the Meals screen on a phone — the plan appears here automatically."
                k={k}
              />
            ) : (
              <View style={{ gap: KIOSK_SPACE.sm }}>
                {byDay.map(({ day, meals: dayMeals }) => (
                  <Well
                    key={day}
                    k={k}
                    accent={day === today ? k.gold : undefined}
                    style={s.dayRow}
                  >
                    <View style={s.dayLabelCol}>
                      <Text
                        style={[s.dayLabel, { color: day === today ? k.gold : k.textMuted }]}
                        numberOfLines={1}
                      >
                        {day === today ? 'TONIGHT' : day.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {dayMeals.map((m, i) => (
                        <View key={m.id}>
                          {i > 0 && <View style={[s.mealDivider, { backgroundColor: k.cardBorder }]} />}
                          <Pressable
                            onPress={() => setOpenMeal(m)}
                            style={({ pressed }) => [s.mealLine, pressed && { opacity: 0.7 }]}
                            accessibilityRole="button"
                            accessibilityLabel={`${m.title} recipe`}
                            accessibilityHint="See ingredients and prep steps"
                          >
                            <Text style={s.mealEmoji}>{m.emoji ?? '🍽️'}</Text>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[s.mealTitle, { color: k.text }]} numberOfLines={2}>
                                {m.title}
                              </Text>
                              <Text style={[s.mealMeta, { color: k.textMuted }]} numberOfLines={1}>
                                {[
                                  m.type ? cap(m.type) : null,
                                  m.start_time || null,
                                  m.prep_minutes ? `${m.prep_minutes} min` : null,
                                  chefName(m.chef_id, members),
                                ].filter(Boolean).join(' · ') || 'No details yet'}
                              </Text>
                            </View>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </Well>
                ))}
              </View>
            )}
          </WidgetCard>
        </View>

        {/* ══ GROCERY LIST ════════════════════════════════════════════ */}
        <View style={s.colNarrow}>
          <WidgetCard k={k} isDark={isDark}>
            <PanelHead
              title={isKid ? 'My grocery items' : 'Grocery list'}
              k={k}
              right={
                <View style={s.panelHeadRight}>
                  {!isKid && (
                    <Pressable
                      onPress={() => setShowReceiptScan(true)}
                      hitSlop={8}
                      style={s.scanBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Scan a receipt"
                      accessibilityHint="Scans a paper receipt and adds the items to the list"
                    >
                      <ScanLine size={14} color={k.gold} />
                    </Pressable>
                  )}
                  {visibleItems.length > 0 && (
                    <Text style={[s.panelCount, { color: k.textFaint }]}>{visibleItems.length}</Text>
                  )}
                </View>
              }
            />

            {activeRun && (
              <View style={[s.runBanner, { backgroundColor: k.sage + (isDark ? '26' : '1A'), borderColor: k.sage + '40' }]}>
                <View style={[s.runDot, { backgroundColor: k.sage }]} />
                <Text style={[s.runBannerText, { color: k.sage }]} numberOfLines={1}>
                  Shopping now at {activeRun.store}{activeRunShopper ? ` · ${activeRunShopper}` : ''}
                </Text>
              </View>
            )}

            {/* Same GroceryScreen.tsx price-estimate strip: an on-demand
                "Check Prices" action (never automatic — a live Kroger
                lookup per unpriced item), and the running estimated total
                once at least one price is known. Hidden for a kid — this
                is money/budget information, same spirit as the phone's
                own isKid-gated affordances elsewhere on this screen. */}
            {!isKid && visibleItems.length > 0 && (
              <Pressable
                onPress={checkPrices}
                disabled={priceLoading}
                style={({ pressed }) => [
                  s.priceStrip,
                  { backgroundColor: k.well, borderColor: k.cardBorder },
                  pressed && !priceLoading && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={cartTotal > 0 ? `Estimated total ${cartTotal.toFixed(2)} dollars` : 'Check prices'}
                accessibilityHint="Looks up an estimated price for each item on the list"
              >
                <Sparkles size={14} color={k.textMuted} />
                <Text style={[s.priceStripText, { color: k.textMuted }]} numberOfLines={1}>
                  {priceLoading ? 'Checking prices…' : cartTotal > 0 ? `Estimated total (${visibleItems.length} items)` : 'Check Prices'}
                </Text>
                {priceLoading ? (
                  <ActivityIndicator size="small" color={k.textMuted} />
                ) : cartTotal > 0 ? (
                  <Text style={[s.priceStripTotal, { color: k.primary }]}>${cartTotal.toFixed(2)}</Text>
                ) : null}
              </Pressable>
            )}

            {/* Add. Deliberately the first thing under the header: the
                overwhelmingly common kitchen interaction is "we just ran
                out of X", and it should be one tap plus typing, never a
                navigation. Hidden for kids — this box writes straight to
                groceryStore, bypassing the real kid→parent approval flow
                (kidRequestStore + KioskGroceryRequestSheet) a kid's
                request normally goes through; a kid asks via that flow
                instead, from the header's Ask Fam/Ask Parent affordance. */}
            {!isKid && (
              <View style={s.addRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={submitItem}
                  onFocus={registerActivity}
                  placeholder="Add an item…"
                  placeholderTextColor={k.textFaint}
                  style={[s.addInput, { backgroundColor: k.well, borderColor: k.cardBorder, color: k.text }]}
                  returnKeyType="done"
                  editable={!!familyId}
                  accessibilityLabel="New grocery item"
                />
                <Pressable
                  onPress={submitItem}
                  disabled={!draft.trim() || adding || !familyId}
                  style={({ pressed }) => [
                    s.addBtn,
                    { backgroundColor: k.sage },
                    (pressed || !draft.trim() || adding) && { opacity: draft.trim() && !adding ? 0.75 : 0.4 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Add to grocery list"
                  accessibilityState={{ disabled: !draft.trim() || adding }}
                >
                  {adding
                    ? <ActivityIndicator size="small" color={k.onAccent} />
                    : <Plus size={22} color={k.onAccent} />}
                </Pressable>
                {/* Full-field parity entry point: the phone's AddItemSheet
                    also takes quantity/category/store/notes, which this
                    one-line quick-add intentionally doesn't ask for on
                    every add. Opens the same sheet an edit uses, in
                    create mode.
                    Live-reported: SlidersHorizontal (a real "filter"
                    glyph) read as a list filter here and confused a tap
                    that actually opens the add form — there's no filter
                    anywhere on this list to confuse it with. Swapped for
                    ListPlus, the same icon ParentQuickActions.tsx already
                    uses for "add a grocery item" elsewhere in this app. */}
                <Pressable
                  onPress={() => { setEditingItem(undefined); setItemSheetOpen(true); }}
                  style={({ pressed }) => [
                    s.moreBtn,
                    { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Add item with more details"
                  accessibilityHint="Opens a form with quantity, category, store, and notes"
                >
                  <ListPlus size={18} color={k.textMuted} />
                </Pressable>
              </View>
            )}

            {visibleItems.length === 0 ? (
              <EmptyNote
                text={isKid
                  ? "None of your grocery requests have been approved yet."
                  : "Nothing on the list. Add something above."}
                k={k}
              />
            ) : (
              <View style={{ marginTop: KIOSK_SPACE.sm, gap: KIOSK_SPACE.md }}>
                {categorisedItems.supplies.length > 0 && (
                  <GroceryCategorySection
                    label="Supplies" emoji="📚" items={categorisedItems.supplies}
                    k={k} isDark={isDark} isKid={isKid} active={active}
                    priceMap={priceMap}
                    buyItem={buyItem}
                    onEditItem={it => { setEditingItem(it); setItemSheetOpen(true); }}
                    onMoveItem={it => setMovingItem(it)}
                    isSelecting={isSelecting}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelectItem}
                  />
                )}
                {categorisedItems.clothing.length > 0 && (
                  <GroceryCategorySection
                    label="Clothing" emoji="👕" items={categorisedItems.clothing}
                    k={k} isDark={isDark} isKid={isKid} active={active}
                    priceMap={priceMap}
                    buyItem={buyItem}
                    onEditItem={it => { setEditingItem(it); setItemSheetOpen(true); }}
                    onMoveItem={it => setMovingItem(it)}
                    isSelecting={isSelecting}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelectItem}
                  />
                )}
                {groupedGroceries.map(([store, storeItems]) => (
                  <View
                    key={store}
                    ref={el => registerSectionLayout(store, el)}
                    style={[s.storeSection, hoveredStore === store && { backgroundColor: k.primary + '14' }]}
                  >
                    {/* Same store-header shape as GroceryItemsSection.tsx's
                        real sub-header, minus the live per-store "N left"
                        count (redundant here — every item shown is
                        already unbought, so the section's own row count
                        already reads at a glance). The pin affordance
                        below WAS scoped out here as "irrelevant to a
                        stationary kiosk" — corrected on request: pinning
                        just writes a {lat,lng} for the store name, and
                        which device did the pinning has no bearing on
                        which family member's own phone later geofences
                        against it, so a kiosk pinning "where Costco is"
                        once from the kitchen wall is exactly as valid as
                        a phone doing it. Same real gate as the phone's
                        own onPinStore condition: only for a real store
                        (not "Any store"), only once it has 2+ unbought
                        items, only if not already pinned. */}
                    <View style={s.storeHeadRow}>
                      <Text style={[s.storeLabel, { color: k.primary, flex: 1 }]} numberOfLines={1}>
                        {store === 'Any store' ? 'ANY STORE' : store.toUpperCase()}
                      </Text>
                      {geofencingEnabled && !isKid && store !== 'Any store'
                        && storeItems.filter(i => !i.isBought).length >= 2
                        && !pinnedStores?.[store] && (
                        <Pressable
                          onPress={() => setPinningStore(store)}
                          hitSlop={8}
                          style={s.pinBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Pin ${store}'s location`}
                          accessibilityHint="Sets this store's map location for nearby reminders"
                        >
                          <MapPin size={13} color={k.textFaint} />
                          <Text style={[s.pinBtnText, { color: k.textFaint }]}>Pin</Text>
                        </Pressable>
                      )}
                    </View>
                    {storeItems.map((it, i) => (
                      <KioskDraggableItemRow
                        key={it.id}
                        itemId={it.id}
                        k={k}
                        dragEnabled={dragEnabled}
                        draggingId={draggingId}
                        dragAbsoluteY={dragAbsoluteY}
                        onDrop={handleDrop}
                      >
                        <GroceryRow
                          item={it}
                          priceInfo={priceMap[it.name]}
                          k={k}
                          isDark={isDark}
                          divider={i > 0}
                          onBuy={isKid ? undefined : () => buyItem(it.id, active.id)}
                          onEdit={isKid ? undefined : () => { setEditingItem(it); setItemSheetOpen(true); }}
                          onMove={isKid ? undefined : () => setMovingItem(it)}
                          selecting={isSelecting}
                          selected={selectedIds.has(it.id)}
                          onToggleSelect={isKid ? undefined : () => toggleSelectItem(it.id)}
                          onLongPress={isKid ? undefined : () => toggleSelectItem(it.id)}
                        />
                      </KioskDraggableItemRow>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* "where is the purchase history?" — RecentlyBoughtSection.tsx's
                real shape: collapsed by default (last-7-days is a glance
                feature, not something that should push the active list
                down every time it's non-empty), who bought it and when.
                The phone's own Return-to-store flow (multi-select bought
                items → assign a return chore) is NOT reproduced — that is
                a genuinely separate feature (creates a quest, opens an
                assignee picker) beyond "show me what we bought," and this
                screen has no assignee-picker primitive to build it on yet. */}
            {boughtItems.length > 0 && (
              <View style={[s.boughtSection, { borderTopColor: k.cardBorder }]}>
                <Pressable
                  onPress={() => setBoughtExpanded(e => !e)}
                  style={s.boughtHeader}
                  accessibilityRole="button"
                  accessibilityLabel="Recently bought"
                  accessibilityState={{ expanded: boughtExpanded }}
                  accessibilityHint={boughtExpanded ? 'Collapses the recently bought list' : 'Shows the last 7 days of bought items'}
                >
                  <View style={[s.boughtIcon, { backgroundColor: k.sage + (isDark ? '26' : '1A') }]}>
                    <Check size={14} color={k.sage} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.boughtTitle, { color: k.textMuted }]} numberOfLines={1}>RECENTLY BOUGHT</Text>
                    <Text style={[s.boughtMeta, { color: k.textFaint }]} numberOfLines={1}>Last 7 days · {boughtItems.length} items</Text>
                  </View>
                  {boughtExpanded ? <ChevronUp size={16} color={k.textFaint} /> : <ChevronDown size={16} color={k.textFaint} />}
                </Pressable>
                {boughtExpanded && (
                  <View style={{ marginTop: KIOSK_SPACE.xs }}>
                    {boughtItems.map((it, i) => {
                      const buyer = members.find(m => m.id === it.boughtBy)?.name?.trim().split(' ')[0];
                      const when = it.boughtAt ? new Date(it.boughtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
                      return (
                        <View
                          key={it.id}
                          style={[s.boughtRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[s.boughtName, { color: k.textMuted }]} numberOfLines={1}>
                              {it.name}{it.quantity ? ` × ${it.quantity}` : ''}
                            </Text>
                            <Text style={[s.boughtWhen, { color: k.textFaint }]} numberOfLines={1}>
                              {[buyer, when].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          {!isKid && (
                            <Pressable
                              onPress={async () => {
                                await restoreItem(it.id);
                                setBoughtItems(prev => prev.filter(b => b.id !== it.id));
                              }}
                              style={({ pressed }) => [s.undoBtn, { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder }]}
                              accessibilityRole="button"
                              accessibilityLabel={`Undo — put ${it.name} back on the list`}
                              accessibilityHint="Marks this item as not bought, returning it to its original store section"
                            >
                              <RotateCcw size={12} color={k.textMuted} />
                              <Text style={[s.undoBtnText, { color: k.textMuted }]}>Undo</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </WidgetCard>
        </View>
      </View>
    </ScrollView>

    {/* Same real shape as BulkSelectToolbar.tsx: a floating bar while any
        item is selected — count, Select All, destructive Delete (N) with
        a confirm step, Cancel. Live-requested: "i want delete potion from
        the grocery list" → confirmed as this separate long-press select
        mode, distinct from the existing single-item delete already in
        KioskGroceryItemSheet. */}
    {isSelecting && (
      <View style={[s.bulkBar, { backgroundColor: k.primary }]}>
        <Text style={[s.bulkCount, { color: k.onAccent }]}>{selectedIds.size} selected</Text>
        <Pressable
          onPress={() => setSelectedIds(new Set(visibleItems.map(it => it.id)))}
          style={[s.bulkBtn, { borderColor: k.onAccent + '4D' }]}
          accessibilityRole="button"
          accessibilityLabel="Select all"
        >
          <Text style={[s.bulkBtnText, { color: k.onAccent }]}>Select All</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const ids = Array.from(selectedIds);
            Alert.alert('Delete items?', `Remove ${ids.length} item${ids.length !== 1 ? 's' : ''} from the list?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: `Delete (${ids.length})`, style: 'destructive', onPress: () => {
                  ids.forEach(id => removeItem(id));
                  setSelectedIds(new Set());
                },
              },
            ]);
          }}
          style={[s.bulkBtn, { backgroundColor: k.danger, borderColor: k.danger }]}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${selectedIds.size} items`}
        >
          <Text style={[s.bulkBtnText, { color: k.onAccent }]}>Delete ({selectedIds.size})</Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedIds(new Set())}
          style={[s.bulkBtn, { borderColor: k.onAccent + '4D' }]}
          accessibilityRole="button"
          accessibilityLabel="Cancel selection"
        >
          <Text style={[s.bulkBtnText, { color: k.onAccent }]}>Cancel</Text>
        </Pressable>
      </View>
    )}

    <KioskRecipeDrawer
      visible={!!openMeal}
      onClose={() => setOpenMeal(null)}
      meal={openMeal}
      members={members}
      k={k}
    />

    {!!familyId && (
      <KioskGroceryItemSheet
        visible={itemSheetOpen}
        onClose={() => { setItemSheetOpen(false); setEditingItem(undefined); }}
        familyId={familyId}
        memberId={active.id}
        item={editingItem}
      />
    )}

    {!!movingItem && (
      <KioskStoreMoveSheet
        visible={!!movingItem}
        onClose={() => setMovingItem(undefined)}
        itemId={movingItem.id}
        itemName={movingItem.name}
        currentStore={movingItem.storePreference}
      />
    )}

    {geofencingEnabled && (
      <KioskPinStoreLocationSheet
        visible={!!pinningStore}
        store={pinningStore ?? ''}
        onClose={() => setPinningStore(null)}
        onPin={async (lat, lng) => {
          if (!pinningStore || !familyId) return;
          await pinStoreLocation({ familyId, store: pinningStore, latitude: lat, longitude: lng, pinnedBy: active.id });
          registerStoreGeofences(familyId, active.id).catch(() => {});
        }}
      />
    )}

    {!!familyId && (
      <KioskReceiptScanSheet
        visible={showReceiptScan}
        onClose={() => setShowReceiptScan(false)}
        familyId={familyId}
        memberId={active.id}
        memberName={active.name?.trim().split(' ')[0]}
        onSuccess={() => load(familyId)}
      />
    )}
    </>
  );
}

/**
 * One list row — matches features/grocery/components/ItemCard.tsx's real
 * shape: an icon square (per-item emoji when the name matches a known
 * ingredient, falling back to a category-level icon — itemEmoji()/CAT_ICON,
 * the same real functions ItemCard.tsx itself calls, not a kiosk
 * reimplementation), name + quantity, an optional estimated price, an
 * optional move-to-store button, then the buy checkbox.
 *
 * Tap targets match the phone's own DraggableItemRow split: the checkbox is
 * its own buy target (direct, no confirm — matches the phone's onBuy), the
 * row BODY opens the edit sheet (edit/delete live there), and the move
 * button is a third, independent target for KioskStoreMoveSheet.
 *
 * onBuy/onEdit/onMove all optional: a kid's own already-approved request
 * renders fully read-only (no checkbox, no edit or move access) — they can
 * see it made the list, not manage it themselves.
 *
 * Bulk multi-select (live-requested: "i want delete potion from the
 * grocery list" → confirmed as the phone's separate long-press select
 * mode, not the existing single-item delete already in
 * KioskGroceryItemSheet): while `selecting`, the icon square is replaced
 * by a selection circle and the row's own press toggles selection instead
 * of opening the edit sheet — same behavior swap ItemCard.tsx's real
 * `selecting ? onToggleSelect : onPress` makes.
 */
function GroceryRow({ item, priceInfo, k, isDark, divider, onBuy, onEdit, onMove, selecting, selected, onToggleSelect, onLongPress }: {
  item: GroceryItem;
  priceInfo?: { price: number | null; source: string };
  k: KioskColors; isDark: boolean; divider?: boolean;
  onBuy?: () => void; onEdit?: () => void; onMove?: () => void;
  selecting?: boolean; selected?: boolean;
  onToggleSelect?: () => void; onLongPress?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const readOnly = !onBuy;
  const emoji = itemEmoji(item.name);
  const CatIcon = CAT_ICON[item.category ?? 'Other'] ?? CAT_ICON.Other;
  const iconTint = kioskCatColor(k, item.category);
  const canPress = selecting ? !!onToggleSelect : !!onEdit;
  return (
    <Pressable
      onPress={selecting ? onToggleSelect : onEdit}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!canPress}
      style={({ pressed }) => [
        s.groceryRow,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder },
        selected && { backgroundColor: k.primary + '10' },
        pressed && canPress && { opacity: 0.7 },
      ]}
      accessibilityRole={selecting ? 'checkbox' : onEdit ? 'button' : undefined}
      accessibilityState={selecting ? { checked: !!selected } : undefined}
      accessibilityLabel={item.quantity ? `${item.name}, ${item.quantity}` : item.name}
      accessibilityHint={selecting ? 'Toggles selection for bulk delete' : onEdit ? 'Opens this item to edit or delete it' : undefined}
    >
      {selecting ? (
        <View style={[s.selectCircle, { borderColor: selected ? k.primary : k.cardBorder, backgroundColor: selected ? k.primary : 'transparent' }]}>
          {selected && <Check size={12} color={k.onAccent} />}
        </View>
      ) : (
        <View style={[s.itemIcon, { backgroundColor: iconTint + (isDark ? '26' : '1A') }]}>
          {emoji ? <Text style={s.itemEmojiText}>{emoji}</Text> : <CatIcon size={16} color={iconTint} strokeWidth={1.8} />}
        </View>
      )}
      <Text style={[s.groceryName, { color: k.text }]} numberOfLines={1}>{item.name}</Text>
      {!!item.quantity && (
        <Text style={[s.groceryQty, { color: k.textFaint }]} numberOfLines={1}>{item.quantity}</Text>
      )}
      {priceInfo?.price != null && (
        <Text style={[s.priceTag, { color: priceInfo.source === 'kroger' || priceInfo.source === 'receipt' ? k.sage : k.gold }]}>
          ${priceInfo.price.toFixed(2)}
        </Text>
      )}
      {!selecting && !!onMove && (
        <Pressable
          onPress={onMove}
          hitSlop={10}
          style={s.moveIconBtn}
          accessibilityRole="button"
          accessibilityLabel={`Move ${item.name} to a different store`}
        >
          <Store size={15} color={k.textFaint} />
        </Pressable>
      )}
      {!selecting && !readOnly && (
        <Pressable
          onPress={async () => { if (busy) return; setBusy(true); await onBuy(); setBusy(false); }}
          hitSlop={10}
          style={[s.checkbox, { borderColor: k.cardBorder }, busy && { opacity: 0.5 }]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: false, disabled: busy }}
          accessibilityLabel={`Mark ${item.name} as bought`}
          accessibilityHint="Marks as bought and removes it from the list"
        >
          {busy && <Check size={13} color={k.sage} />}
        </Pressable>
      )}
    </Pressable>
  );
}

/**
 * A category section (Supplies/Clothing) — matches
 * features/grocery/components/CategorySection.tsx's real shape: a labeled
 * header, then store-grouped rows within it, with the store sub-header
 * shown only when the category actually spans more than one store (the
 * phone's own `storeGroups.length > 1` gate — a single-store category
 * doesn't need to repeat its one store name under every item).
 */
function GroceryCategorySection({ label, emoji, items, k, isDark, isKid, active, priceMap, buyItem, onEditItem, onMoveItem, isSelecting, selectedIds, onToggleSelect }: {
  label: string; emoji: string; items: GroceryItem[];
  k: KioskColors; isDark: boolean; isKid: boolean; active: FamilyMember;
  priceMap: Record<string, { price: number | null; source: string }>;
  buyItem: (itemId: string, memberId: string) => Promise<void>;
  onEditItem: (item: GroceryItem) => void;
  onMoveItem: (item: GroceryItem) => void;
  isSelecting: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const storeGroups = useMemo(() => {
    const groups: Record<string, GroceryItem[]> = {};
    for (const it of items) (groups[it.storePreference || 'Any store'] ??= []).push(it);
    return Object.entries(groups).sort(([a], [b]) =>
      a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b));
  }, [items]);
  return (
    <View>
      <Text style={[s.categoryLabel, { color: k.text }]} numberOfLines={1}>{emoji} {label}</Text>
      {storeGroups.map(([store, storeItems]) => (
        <View key={store}>
          {storeGroups.length > 1 && (
            <Text style={[s.storeLabel, { color: k.primary }]} numberOfLines={1}>
              {store === 'Any store' ? 'ANY STORE' : store.toUpperCase()}
            </Text>
          )}
          {storeItems.map((it, i) => (
            <GroceryRow
              key={it.id}
              item={it}
              priceInfo={priceMap[it.name]}
              k={k}
              isDark={isDark}
              divider={i > 0}
              onBuy={isKid ? undefined : () => buyItem(it.id, active.id)}
              onEdit={isKid ? undefined : () => onEditItem(it)}
              onMove={isKid ? undefined : () => onMoveItem(it)}
              selecting={isSelecting}
              selected={selectedIds.has(it.id)}
              onToggleSelect={isKid ? undefined : () => onToggleSelect(it.id)}
              onLongPress={isKid ? undefined : () => onToggleSelect(it.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Kiosk-side equivalent of features/grocery/components/types.tsx's
 * catDotColor(colors) — same category→hue grouping (produce/dairy/meat/
 * frozen read as one family, grains/snacks/beverages as another, etc.),
 * rebuilt on KioskColors' own tokens (k.sage/k.gold/k.primary/k.textFaint)
 * since that function's real implementation is keyed to phone theme tokens
 * (colors.teal/colors.amber/colors.primary) that don't exist on this
 * screen's palette.
 */
function kioskCatColor(k: KioskColors, category?: string): string {
  switch (category) {
    case 'Produce': case 'Dairy': case 'Meat': case 'Frozen': case 'Seafood': case 'Deli': case 'Frozen Meals':
      return k.sage;
    case 'Grains': case 'Snacks': case 'Beverages': case 'Bakery':
      return k.gold;
    case 'Cleaning': case 'Personal Care': case 'Spices': case 'Supplies': case 'Clothing':
      return k.primary;
    default:
      return k.textFaint;
  }
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const chefName = (id: string | null | undefined, members: FamilyMember[]) => {
  const n = members.find(m => m.id === id)?.name?.trim().split(' ')[0];
  return n ? `Chef: ${n}` : null;
};

const s = StyleSheet.create({
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  // Two columns on a wide screen, stacked on a narrow/portrait one — by
  // flexWrap + flexBasis rather than a measured breakpoint, so it reflows
  // by construction (the same principle the prior pass applied to the Hub
  // grid after its clipping bug).
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  colWide: { flexGrow: 2, flexBasis: 440, minWidth: 0 },
  colNarrow: { flexGrow: 1, flexBasis: 340, minWidth: 0 },

  // Mock-exact .panel-head right-slot value: a small faint count, same
  // convention as Overview's own panelCount (approvals/sharing readouts).
  panelCount: { fontSize: 11 },
  panelHeadRight: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  scanBtn: { padding: 2 },

  // Mock-exact active-run banner, same shape/colors as Overview's Grocery
  // card so the two surfaces read as one feature, not two.
  runBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10,
  },
  runDot: { width: 8, height: 8, borderRadius: 4 },
  runBannerText: { flex: 1, fontSize: 12, fontWeight: '700' },

  dayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.md },
  dayLabelCol: { width: 74 },
  // Mock-exact .panel-title convention (uppercase, wide tracking, faint)
  // applied to a day label rather than a section title — the same visual
  // grammar, a different piece of text.
  dayLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, paddingTop: 3 },
  mealLine: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs },
  mealDivider: { height: StyleSheet.hairlineWidth },
  mealEmoji: { fontSize: 24 },
  // Mock-exact .jar-name/.jar-meta convention (13.5/700 primary line,
  // 11.5 meta) — the same pairing Overview's Coin Jars and Meals This
  // Week rows use for "a name/label plus a dim detail line."
  mealTitle: { fontSize: 13.5, fontWeight: '700' },
  mealMeta: { fontSize: 11.5, marginTop: 2 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.xs },
  addInput: {
    flex: 1, minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, fontSize: KIOSK_TYPO.body, fontWeight: '600',
  },
  addBtn: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  moreBtn: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },

  // Mock-exact .grocery-row convention: a plain unfilled checkbox square,
  // no card-shaped well around each row (Overview's own Grocery list rows
  // are the same flat hairline-divided rows, not individually boxed).
  groceryRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control, paddingVertical: KIOSK_SPACE.sm,
  },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  // Same 28px footprint as itemIcon so a row's layout doesn't jump when
  // toggling into/out of select mode.
  selectCircle: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  groceryName: { flex: 1, fontSize: 13, fontWeight: '600' },
  groceryQty: { fontSize: 11.5, fontWeight: '700' },
  // Real phone's ItemCard.tsx icon-square convention (32px tinted rounded
  // square holding either a per-item emoji or a category icon).
  itemIcon: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  itemEmojiText: { fontSize: 15 },
  priceTag: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  moveIconBtn: { padding: 4 },

  // Real phone's CategorySection.tsx header convention (emoji + label,
  // 14/800) — one per category bucket (Supplies/Clothing).
  categoryLabel: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  // Real phone's store sub-header convention (11/800, uppercase, wide
  // tracking, tinted) — GroceryItemsSection.tsx's own storefront label,
  // minus its icon (a kitchen-wall glance doesn't need the icon to read
  // "this is a store name," the all-caps label already does that).
  storeLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginBottom: 4, marginTop: 4 },
  // Same live hover-highlight GroceryItemsSection.tsx's own store
  // sub-header background does while a drag is over this section —
  // borderRadius/padding only actually visible once the tint applies.
  storeSection: { borderRadius: KIOSK_RADIUS.sm, marginHorizontal: -6, paddingHorizontal: 6 },
  storeHeadRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  pinBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2 },
  pinBtnText: { fontSize: 10.5, fontWeight: '700' },

  // Real phone's price-estimate strip (GroceryScreen.tsx's "Estimated
  // total" row + its GroceryAiBanner "Check Prices" action, merged into
  // one tappable strip here rather than two separate widgets).
  priceStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10,
  },
  priceStripText: { flex: 1, fontSize: 12, fontWeight: '700' },
  priceStripTotal: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },

  // Real phone's RecentlyBoughtSection.tsx convention: a collapsed-by-
  // default header row, expanding to a plain struck-through-free list
  // (kiosk shows a bought item's name plainly, not struck through — it's
  // already segregated into its own section, unlike the phone's inline
  // treatment inside the same list it buys from).
  boughtSection: { marginTop: KIOSK_SPACE.md, paddingTop: KIOSK_SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth },
  boughtHeader: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  boughtIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  boughtTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  boughtMeta: { fontSize: 11, marginTop: 1 },
  boughtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: KIOSK_SPACE.sm },
  boughtName: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  boughtWhen: { fontSize: 11 },
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.full,
    paddingHorizontal: 9, paddingVertical: 5, flexShrink: 0,
  },
  undoBtnText: { fontSize: 11, fontWeight: '700' },

  // Same real shape as BulkSelectToolbar.tsx's floating bar, positioned
  // relative to this tab's own root rather than the whole-screen absolute
  // coordinates the phone uses (kiosk has no floating tab bar to clear).
  bulkBar: {
    position: 'absolute', left: KIOSK_SPACE.lg, right: KIOSK_SPACE.lg, bottom: KIOSK_SPACE.lg,
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.lg, paddingVertical: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.md,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  bulkCount: { flex: 1, fontSize: 13, fontWeight: '700' },
  bulkBtn: {
    borderWidth: 1, borderRadius: KIOSK_RADIUS.full,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 7,
  },
  bulkBtnText: { fontSize: 12, fontWeight: '700' },
});
