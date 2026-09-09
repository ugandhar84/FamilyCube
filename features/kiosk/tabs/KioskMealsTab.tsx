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
 * One deliberate scope decision remains:
 *   · NO stove/oven timer widget. The mockup has one; the owner ruled it
 *     out of scope. Nothing here schedules or counts anything.
 *
 * AI meal generation (MealsTab's CubeAI planner: the family-ai edge
 * function, the multi-step select-and-confirm phase) was originally scoped
 * OUT for the same "doesn't shrink onto a glanceable kitchen panel usefully"
 * reasoning as the timer — reversed on request, matching the same
 * treatment KioskAiChoresEngine already gives the Chores tab's own CubeAI
 * engine [live-requested: "need to ai section similar to the chores ,, to
 * match the mobile functionality"]. It lives behind a "Plan with AI"
 * button (parent-only) that opens KioskAiMealsEngine as a right-side
 * drawer — not inline on the panel — so the glanceable meal-plan/grocery
 * view stays the default state, and the considered multi-step flow only
 * takes over the screen when a parent deliberately asks for it.
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
  findNodeHandle, UIManager, Alert, useWindowDimensions,
} from 'react-native';
import { Plus, Check, ListPlus, Store, ChevronDown, ChevronUp, Sparkles, MapPin, RotateCcw, ScanLine, Pencil, Search, X as XIcon, Lock } from 'lucide-react-native';
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { useGroceryStore, type GroceryItem, type GroceryRun } from '@/store/groceryStore';
import { useKidRequestStore, type KidRequestItem } from '@/store/kidRequestStore';
import { useEventStore } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { localDateStr } from '@/lib/dates';
import { categorizeItem, DAYS as MEAL_DAYS } from '@/features/vault/tabs/meals/types';
import { KioskMealFormDrawer, type MealFormPatch } from '../components/KioskMealFormDrawer';
import { CAT_ICON, itemEmoji, mapBoughtRow } from '@/features/grocery/components/types';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { WidgetCard, PanelHead, Well, TabTitle, EmptyNote } from '../components/KioskOS';
import { useKioskMeals, daysFromToday, todayMealDay } from '../useKioskMeals';
import { KioskAiMealsEngine } from '../components/KioskAiMealsEngine';
import { useKioskActivity } from '../KioskActivityContext';
import { KioskRecipeDrawer } from '../components/KioskRecipeDrawer';
import { KioskGroceryItemSheet } from '../components/KioskGroceryItemSheet';
import { KioskStoreMoveSheet } from '../components/KioskStoreMoveSheet';
import { KioskDraggableItemRow } from '../components/KioskDraggableItemRow';
import { KioskPinStoreLocationSheet } from '../components/KioskPinStoreLocationSheet';
import { KioskReceiptScanSheet } from '../components/KioskReceiptScanSheet';
import { KioskGroceryPresenceStrip } from '../components/KioskGroceryPresenceStrip';
import { KioskRunDetailSheet } from '../components/KioskRunDetailSheet';
import { useFeatureFlag } from '@/lib/featureFlags';
import { registerStoreGeofences } from '@/lib/storeGeofencing';

// 6 rows visible per store section before it scrolls [live-requested:
// "in meals groceries make the scroll after 6 items per store"].
const STORE_SECTION_VISIBLE_ROWS = 6;

// Same real marker KidModals.tsx's own SUPPLIES_PREFIX uses to tell a
// supplies request apart from a grocery request (both are
// type: 'delegation' with item rows) — duplicated here rather than
// imported, same as KioskGroceryRequestSheet.tsx's own copy, to stay
// byte-identical without pulling in KidModals.tsx's other exports.
const SUPPLIES_PREFIX = 'SUPPLIES_REQUEST:';

export function KioskMealsTab({ active, members }: { active: FamilyMember; members: FamilyMember[] }) {
  const { k, isDark } = useKioskColors();
  const { meals, loading, week, reload: reloadMeals } = useKioskMeals();
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
  // Meal add/edit/delete AND grocery add/edit/checkoff/move are now
  // parent-only — widened from the old isKid-only restriction to also
  // cover teen [live-requested: "remove meal editing /add/delete only
  // give readonly access .. with recipie share.. kube ai we can blur and
  // show the overleay parents ony access? / even mobile should do same" /
  // "as i said we shoun't give the access to grocey add in the melas page
  // they just can see their approved groceries by parents / kids and
  // teens both"] — a deliberate divergence from real mobile's own
  // isKid-only gate (which gave teen full edit access), not a kiosk-only
  // fork left unexplained.
  const isKidOrTeen = active.role === 'kid' || active.role === 'teen';
  // Meal lines were read-only — tapping one now opens its full recipe in
  // the same side drawer the Overview hero's Breakfast/Lunch/Dinner cards
  // already use (KioskRecipeDrawer), so the two surfaces that both show a
  // meal behave identically rather than one being tappable and one not.
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);

  // Manual Add/Edit meal — real mobile-parity affordances (MealsTab.tsx's
  // own AddMealSheet/EditMealModal, unified into MealFormSheet.tsx), forked
  // into KioskMealFormDrawer as a right-side drawer [live-requested:
  // "there should be manual addition/view/edit/delete right similar to
  // the mobile but side forms here in kiosk" / "edit / add also sidebar
  // treatment please"]. addDay set = add mode for that day; editingMeal
  // set = edit mode — same dual-mode contract MealFormSheet.tsx itself uses.
  const [addDay, setAddDay] = useState<string | null>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [savingMeal, setSavingMeal] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);

  // Meal-plan search — real, new capability (useKioskMeals only ever loads
  // THIS week; MealsTab.tsx's own view is the same single-week window) —
  // queries family_meals across every week for this family, matching the
  // meal name or its real calendar date, INCLUDING past weeks
  // (live-requested: "lets also add the search function in what we are
  // eating results should be with date and the meals..including past").
  // Debounced and only runs while the box has real text — the default,
  // empty-query view stays the current day-grouped `byDay` list untouched.
  const [mealQuery, setMealQuery] = useState('');
  const [mealSearchResults, setMealSearchResults] = useState<Meal[] | null>(null);
  const [mealSearchLoading, setMealSearchLoading] = useState(false);

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
  // Bulk move — reuses the same KioskStoreMoveSheet, just with multiple
  // ids instead of one [live-requested: "then introduce multiple items
  // move like we have long press already use it"].
  const [bulkMoving, setBulkMoving] = useState(false);

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
  const [viewingRun, setViewingRun] = useState<GroceryRun | null>(null);
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

  // Real, new feature (mobile's own GroceryScreen has no search at all) —
  // matches name, store, AND notes, so a meal-sourced item ("From Grilled
  // Chicken & Veggies", written by KioskRecipeDrawer's own Add to Grocery)
  // is findable by the meal's name, not just the ingredient's own name
  // (live-requested: "in the groceries we should be able to search with
  // meal name" / "or any search we should hae that").
  const [groceryQuery, setGroceryQuery] = useState('');

  const visibleItems = useMemo(() => {
    const scoped = isKid ? items.filter(it => it.addedBy === active.id) : items;
    const q = groceryQuery.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(it =>
      it.name.toLowerCase().includes(q) ||
      (it.notes ?? '').toLowerCase().includes(q) ||
      (it.storePreference ?? '').toLowerCase().includes(q)
    );
  }, [items, isKid, active.id, groceryQuery]);

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
  // Was `useState(() => Dimensions.get('window').height)` — a one-time
  // snapshot taken only at mount, frozen forever after that: rotating the
  // device mid-session left this stale until the tab happened to unmount/
  // remount (e.g. switching tabs and back), which is exactly why the drag
  // auto-scroll's edge zone kept using the pre-rotation viewport height
  // [live-reported: "when i do a orientation quickly the comonents are not
  // adjusting based on orientation if i switch tabs it is coming back to
  // notmal shapes"]. useWindowDimensions() is the reactive equivalent every
  // other kiosk tab already uses for this exact reason (KioskOverviewTab,
  // KioskFindFamTab, KioskHealthTab, KioskHubTab, KioskTasksTab,
  // KioskMemoryFeed, KioskMemoryGrid) — it re-renders the component on a
  // real rotation/resize event instead of needing a remount to pick one up.
  const { height: viewportHeight } = useWindowDimensions();

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

  // ── Manual meal Add/Edit/Delete — ported verbatim from MealsTab.tsx's
  // own identically-named functions (read in full before writing this),
  // relocated here so KioskMealFormDrawer can call the same real
  // family_meals table / calendar-sync / cooking-quest logic instead of a
  // second implementation. MealsTab.tsx itself is untouched.

  // "6:00 PM" -> "18:00" (24h, for calendar_events.start_time).
  const parseTimeLabelTo24h = (label: string | null | undefined): string | null => {
    if (!label) return null;
    const m = label.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    if (m[3] === 'PM' && h !== 12) h += 12;
    if (m[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };

  const addMinutesToTime = (hhmm: string, minutes: number): string => {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  // Shared "Mon"/"Tue"/etc -> real YYYY-MM-DD for THIS week.
  const dayNameToDate = (day: string): string => {
    const DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIdx = new Date().getDay(); // 0=Sun
    const dayIdx = DAYS_ORDER.indexOf(day);
    const daysUntil = ((dayIdx - (todayIdx === 0 ? 6 : todayIdx - 1) + 7) % 7);
    const d = new Date();
    d.setDate(d.getDate() + daysUntil);
    return localDateStr(d);
  };

  // Same day-name -> real date derivation as dayNameToDate above, but
  // anchored on a meal's own `week_of` (that week's real Monday) instead
  // of "today" — dayNameToDate only ever resolves to THIS week, which is
  // wrong for a search result from a past (or future) week's plan.
  const weekOfAndDayToDate = (weekOfStr: string, day: string): Date => {
    const DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayIdx = Math.max(0, DAYS_ORDER.indexOf(day));
    const d = new Date(weekOfStr + 'T00:00:00');
    d.setDate(d.getDate() + dayIdx);
    return d;
  };

  // Materializes/updates/removes a meal's linked calendar_events row —
  // same "funnel every syncable domain through calendar_events" pattern
  // chores' addChore/updateChore/deleteChore got, so a timed meal rides
  // the existing 2-way calendar sync engine for free.
  const syncMealCalendarEvent = async (meal: { id: string; day: string; title: string; start_time?: string | null; prep_minutes?: number | null; linked_event_id?: string | null }): Promise<string | null> => {
    const time24 = parseTimeLabelTo24h(meal.start_time);
    const { addEvent, updateEvent, deleteEvent } = useEventStore.getState();

    if (!time24) {
      if (meal.linked_event_id) deleteEvent(meal.linked_event_id);
      return null;
    }
    const date = dayNameToDate(meal.day);
    const endTime = addMinutesToTime(time24, meal.prep_minutes || 30);
    if (meal.linked_event_id) {
      updateEvent(meal.linked_event_id, { title: meal.title, date, time: time24, endTime });
      return meal.linked_event_id;
    }
    return addEvent({
      title: meal.title, date, time: time24, endTime,
      type: 'reminder', category: 'Meal',
      createdBy: active.id,
    });
  };

  const createCookingQuest = (mealTitle: string, chefId: string, day: string, prepMins?: number | null) => {
    const dueDate = dayNameToDate(day);
    useQuestStore.getState().addQuest({
      title:            `🍳 Cook ${mealTitle}`,
      description:      `Prepare ${mealTitle} for the family on ${day}.`,
      category:         'Cooking',
      priority:         'medium',
      coins:            15,
      xpReward:         20,
      assignedToId:     chefId,
      assignedToIds:    [chefId],
      isPool:           false,
      isDaily:          false,
      recurrence:       'once',
      status:           'todo',
      dueDate,
      estimatedMinutes: prepMins ?? undefined,
      createdById:      active.id,
      photoRequired:    false,
      isAdultTask:      members.find(m => m.id === chefId)?.role === 'parent' || members.find(m => m.id === chefId)?.role === 'senior',
    });
  };

  const saveMeal = async (patch: MealFormPatch) => {
    if (!familyId) return;
    setSavingMeal(true);
    try {
      if (editingMeal) {
        const prevChefId = editingMeal.chef_id;
        const linkedEventId = await syncMealCalendarEvent({ ...editingMeal, ...patch });
        const fullPatch = { ...patch, linked_event_id: linkedEventId };
        await supabase.from('family_meals').update(fullPatch).eq('id', editingMeal.id);
        if (patch.chef_id && patch.chef_id !== prevChefId) {
          createCookingQuest(patch.title, patch.chef_id, editingMeal.day, patch.prep_minutes);
        }
        setEditingMeal(null);
      } else if (addDay) {
        const newId = `${familyId}-${week}-${addDay}-manual-${Date.now()}`;
        const linkedEventId = await syncMealCalendarEvent({ id: newId, day: addDay, title: patch.title, start_time: patch.start_time, prep_minutes: patch.prep_minutes, linked_event_id: null });
        await supabase.from('family_meals').insert({
          id: newId,
          family_id: familyId, week_of: week, day: addDay,
          ...patch, ai_generated: false, linked_event_id: linkedEventId,
        });
        if (patch.chef_id) createCookingQuest(patch.title, patch.chef_id, addDay, patch.prep_minutes);
        setAddDay(null);
      }
      reloadMeals();
    } finally {
      setSavingMeal(false);
    }
  };

  const deleteMeal = async (meal: Meal) => {
    if (meal.linked_event_id) useEventStore.getState().deleteEvent(meal.linked_event_id);
    await supabase.from('family_meals').delete().eq('id', meal.id);
    reloadMeals();
  };

  // Meal-plan search — debounced (same 400ms window useKioskMeals' own
  // realtime reload uses), queries EVERY week's family_meals row for this
  // family (no .eq('week_of', ...) filter — that's the whole point,
  // reaching past weeks useKioskMeals never loads), matched by meal
  // title. A typed date-like query (e.g. "Mar 12", "3/12", "12") also
  // matches via the real per-row date derived below, so "search with
  // date and the meals" works both ways — search a meal to find its date,
  // or search a date to find what was eaten.
  useEffect(() => {
    const q = mealQuery.trim();
    if (!q || !familyId) { setMealSearchResults(null); return; }
    setMealSearchLoading(true);
    const t = setTimeout(() => {
      // One bounded fetch (last 400 rows across every week for this
      // family — comfortably years of meals at 1-2/day), filtered client-
      // side against BOTH the meal title and its real derived date, so
      // "search with date and the meals" works either direction: search a
      // meal name to find when it was eaten, or search a date/day (e.g.
      // "Mar 12", "Wed") to find what was eaten then.
      supabase.from('family_meals')
        .select('*').eq('family_id', familyId)
        .order('week_of', { ascending: false })
        .limit(400)
        .then(({ data, error }) => {
          if (error) {
            console.warn('[KioskMealsTab] meal search failed', error.message);
            setMealSearchResults([]);
          } else {
            const qLower = q.toLowerCase();
            const hits = ((data ?? []) as Meal[]).filter(m => {
              if (m.title.toLowerCase().includes(qLower)) return true;
              const d = weekOfAndDayToDate(m.week_of, m.day);
              const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase();
              return label.includes(qLower) || m.day.toLowerCase().includes(qLower);
            });
            setMealSearchResults(hits.sort((a, b) => b.week_of.localeCompare(a.week_of)));
          }
          setMealSearchLoading(false);
        });
    }, 400);
    return () => clearTimeout(t);
  }, [mealQuery, familyId]);

  // Same load call GroceryScreen makes on mount. Idempotent — the store's
  // own guard short-circuits if it's already subscribed for this family, so
  // this costs nothing when the phone's grocery screen already loaded it.
  useEffect(() => { if (familyId) load(familyId); }, [familyId, load]);
  // groceryStore's two channels now clear their own `_itemSub`/`_runSub` on
  // CLOSED/CHANNEL_ERROR/TIMED_OUT (see groceryStore.ts's own subscribe
  // status handlers), but nothing was left to actually notice a dead socket
  // and re-trigger load() on kiosk — a phone recovers this for free on its
  // next background/foreground cycle (there is no AppState listener for
  // grocery specifically, but re-opening GroceryScreen re-runs its own mount
  // effect), while a wall-mounted kiosk tab can sit open for hours with
  // nobody to background/foreground it back to life. Same kiosk-appropriate
  // mount+interval pattern as KioskTasksTab.tsx's choreStore fix — 5 minutes
  // is frequent enough to notice a dead socket well within a normal cooking/
  // shopping session without adding meaningful load beyond the realtime
  // channel that already covers the common case.
  useEffect(() => {
    if (!familyId) return;
    const id = setInterval(() => load(familyId), 5 * 60_000);
    return () => clearInterval(id);
  }, [familyId, load]);

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
  // rather than on Monday. Was filtered to only days with a planned meal —
  // reversed to show all 7, each with its own Add affordance, matching
  // real mobile functionality (DayCard.tsx renders all of DAYS, every one
  // with an onAdd) now that manual add/edit/delete lives on kiosk too
  // (live-requested: "we must match the mobile app functionality and
  // experiance except visual of kiosk").
  const byDay = useMemo(() => {
    const map = new Map<string, typeof meals>();
    for (const m of meals) {
      const list = map.get(m.day) ?? [];
      list.push(m);
      map.set(m.day, list);
    }
    return daysFromToday()
      .map(day => ({ day, meals: map.get(day) ?? [] }));
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
          {/* ── CubeAI Meal Planner ──────────────────────────────────────
              Inline strip above the plan, same as mobile's own always-
              inline placement — NOT a side drawer (live-clarified: "oh Ai
              repose can be inline but the open and view the recipies
              should be side form"). Same column width as "What we're
              eating" right below it — live-requested: "cube meal planner
              section length should match to the what weare eating" — so
              it sits inside colWide instead of spanning the full row.
              Parent-only action, but kid/teen still SEE the panel —
              visually obscured with a "Parents only" overlay rather than
              hidden outright [live-requested: "kube ai we can blur and
              show the overleay parents ony access?"]. Not a literal
              expo-blur BlurView: KioskScheduleTab.tsx's own header
              comment documents that kiosk's whole design layer
              deliberately avoids frosted glass ("reads as mud on the
              kiosk's warm near-black dark ground") in favor of solid
              fills — this reduces opacity + disables touch instead,
              staying consistent with that same rule while still reading
              as "there but off-limits." */}
          {!!familyId && (
            <WidgetCard k={k} isDark={isDark} style={s.aiStripCard}>
              <View pointerEvents={isKidOrTeen ? 'none' : 'auto'} style={isKidOrTeen ? s.aiStripLocked : undefined}>
                <KioskAiMealsEngine
                  familyId={familyId}
                  members={members}
                  onPlanSaved={() => reloadMeals()}
                />
              </View>
              {isKidOrTeen && (
                <View style={s.aiStripOverlay} pointerEvents="none">
                  <Lock size={18} color={k.card} />
                  <Text style={[s.aiStripOverlayText, { color: k.card }]}>Parents only</Text>
                </View>
              )}
            </WidgetCard>
          )}

          <WidgetCard k={k} isDark={isDark}>
            <PanelHead
              title="What we're eating"
              k={k}
              right={meals.length > 0
                ? <Text style={[s.panelCount, { color: k.textFaint }]}>{meals.length} planned</Text>
                : undefined}
            />

            {/* Search — real, new capability (mobile's own MealsTab has no
                search at all): matches meal name OR date/day, across every
                week including past ones, not just the current-week list
                below (live-requested: "lets also add the search function
                in what we are eating results should be with date and the
                meals..including past"). Empty query keeps the normal
                day-grouped view untouched. */}
            <View style={[s.searchRow, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
              <Search size={14} color={k.textFaint} />
              <TextInput
                value={mealQuery}
                onChangeText={setMealQuery}
                onFocus={registerActivity}
                placeholder="Search meals or a date…"
                placeholderTextColor={k.textFaint}
                style={[s.searchInput, { color: k.text }]}
                returnKeyType="search"
                accessibilityLabel="Search meal plan"
              />
              {!!mealQuery && (
                <Pressable onPress={() => setMealQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                  <XIcon size={14} color={k.textFaint} />
                </Pressable>
              )}
            </View>

            {mealQuery.trim() ? (
              mealSearchLoading ? (
                <ActivityIndicator color={k.gold} style={{ marginVertical: KIOSK_SPACE.xl }} />
              ) : !mealSearchResults?.length ? (
                <EmptyNote text={`No meals match "${mealQuery.trim()}".`} k={k} />
              ) : (
                <View style={{ gap: KIOSK_SPACE.xs }}>
                  {mealSearchResults.map((m, i) => {
                    const d = weekOfAndDayToDate(m.week_of, m.day);
                    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => setOpenMeal(m)}
                        style={({ pressed }) => [s.mealLine, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${m.title} on ${dateLabel}`}
                      >
                        <Text style={s.mealEmoji}>{m.emoji ?? '🍽️'}</Text>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.mealTitle, { color: k.text }]} numberOfLines={1}>{m.title}</Text>
                          <Text style={[s.mealMeta, { color: k.textMuted }]} numberOfLines={1}>
                            {[dateLabel, m.type ? cap(m.type) : null, chefName(m.chef_id, members)].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )
            ) : loading ? (
              <ActivityIndicator color={k.gold} style={{ marginVertical: KIOSK_SPACE.xl }} />
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
                      {/* Per-day add — real mobile parity (DayCard.tsx's own
                          onAdd, present on every day including empty ones),
                          not just a top-level "Add Meal" button
                          [live-requested: "we must match the mobile app
                          functionality and experiance except visual of
                          kiosk"]. Parent-only (widened from kid-only to
                          also cover teen — "remove meal editing
                          /add/delete only give readonly access"). */}
                      {!isKidOrTeen && (
                        <Pressable
                          onPress={() => setAddDay(day)}
                          hitSlop={10}
                          style={s.dayAddBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Add a meal for ${day}`}
                        >
                          <Plus size={13} color={k.textFaint} />
                        </Pressable>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {dayMeals.length === 0 ? (
                        <Pressable
                          onPress={() => !isKidOrTeen && setAddDay(day)}
                          disabled={isKidOrTeen}
                          style={({ pressed }) => [s.mealLine, pressed && !isKidOrTeen && { opacity: 0.7 }]}
                        >
                          <Text style={[s.mealMeta, { color: k.textFaint }]}>
                            {isKidOrTeen ? 'Nothing planned' : 'Nothing planned — tap to add'}
                          </Text>
                        </Pressable>
                      ) : dayMeals.map((m, i) => (
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
          {/* Kid/teen: read-only "My requested groceries" — their own
              grocery-type kidRequestStore requests with per-item pending/
              approved/declined status, and bought-or-not once approved
              [live-requested: "as i said we shoun't give the access to
              grocey add in the melas page they just can see their
              approved groceries by parents / kids and teens both" /
              "and that item status if the parent or someone brought
              that"] — NOT the shared live grocery_items list (no add,
              search, receipt scan, price-check, or drag-to-move for
              these two roles at all). Parent (and senior — this whole
              tab is already unreachable for senior on kiosk per
              kioskTabs.ts's RAIL_SENIOR) keeps the full live panel below,
              unchanged. */}
          {isKidOrTeen ? (
            <KidGroceryRequestsPanel active={active} k={k} isDark={isDark} groceryItems={items} boughtItems={boughtItems} members={members} />
          ) : (
          <WidgetCard k={k} isDark={isDark}>
            <PanelHead
              title="Grocery list"
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

            {/* Search — matches item name, store, AND notes (which now
                carries "From {meal title}" for anything added via a
                recipe's Add to Grocery, or "CubeAI weekly plan" for the
                AI planner's own bulk add) — a real, new capability mobile
                doesn't have (live-requested: "in the groceries we should
                be able to search with meal name" / "or any search we
                should hae that"). Shown to everyone, including a kid
                searching their own already-approved items. */}
            {items.length > 0 && (
              <View style={[s.searchRow, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
                <Search size={14} color={k.textFaint} />
                <TextInput
                  value={groceryQuery}
                  onChangeText={setGroceryQuery}
                  onFocus={registerActivity}
                  placeholder="Search groceries or meals…"
                  placeholderTextColor={k.textFaint}
                  style={[s.searchInput, { color: k.text }]}
                  returnKeyType="search"
                  accessibilityLabel="Search grocery list"
                />
                {!!groceryQuery && (
                  <Pressable onPress={() => setGroceryQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                    <XIcon size={14} color={k.textFaint} />
                  </Pressable>
                )}
              </View>
            )}

            {/* Live-asked: "does the kiosk person see other person is
                live in shopping?" — separate, ephemeral signal from the
                run-status banner right below (that one reflects a
                CREATED run; this one is pure "someone has the grocery
                screen open right now," watch-only per the confirmed
                choice — see KioskGroceryPresenceStrip's own header). */}
            <KioskGroceryPresenceStrip familyId={familyId} excludeMemberId={active.id} />

            {/* Tappable — opens KioskRunDetailSheet's live item list.
                Live-requested: "if other person added to that shop it
                should live reflect in to the list of that run direcly"
                — the banner alone only ever showed the store name, never
                the run's actual items. */}
            {activeRun && (
              <Pressable
                onPress={() => setViewingRun(activeRun)}
                style={({ pressed }) => [
                  s.runBanner,
                  { backgroundColor: k.sage + (isDark ? '26' : '1A'), borderColor: k.sage + '40' },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Shopping now at ${activeRun.store}`}
                accessibilityHint="Opens the live item list for this trip"
              >
                <View style={[s.runDot, { backgroundColor: k.sage }]} />
                <Text style={[s.runBannerText, { color: k.sage }]} numberOfLines={1}>
                  Shopping now at {activeRun.store}{activeRunShopper ? ` · ${activeRunShopper}` : ''}
                </Text>
                <Text style={[s.runBannerLink, { color: k.sage }]}>View list →</Text>
              </Pressable>
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
                text={groceryQuery.trim()
                  ? `No items match "${groceryQuery.trim()}".`
                  : isKid
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
                    {/* Cap to 6 rows visible, rest scroll [live-requested:
                        "in meals groceries make the scroll after 6 items
                        per store"]. Drag-to-move-store measures absolute
                        page Y across every section (registerSectionLayout/
                        dragAbsoluteY), which a per-section scroll would
                        throw off the moment that section scrolls — so drag
                        is disabled for a store's rows once it grows past
                        the visible cap (still fully reachable via each
                        row's own Move sheet, onMove above), matching a
                        deliberate scroll-vs-drag tradeoff rather than
                        leaving drag silently broken for a long list. */}
                    {(() => {
                      const overflowing = storeItems.length > STORE_SECTION_VISIBLE_ROWS;
                      const rows = storeItems.map((it, i) => (
                        <KioskDraggableItemRow
                          key={it.id}
                          itemId={it.id}
                          k={k}
                          dragEnabled={dragEnabled && !overflowing}
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
                      ));
                      return overflowing ? (
                        <ScrollView style={s.storeSectionScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                          {rows}
                        </ScrollView>
                      ) : rows;
                    })()}
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
          )}
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
        {/* Move — same real updateItem(storePreference) write per-row
            "Move" already makes, just applied to every selected id
            [live-requested: "then introduce multiple items move like we
            have long press already use it"] — the alternative to
            drag-to-move-store once a store section's own scroll cap
            disables that gesture for it. */}
        <Pressable
          onPress={() => setBulkMoving(true)}
          style={[s.bulkBtn, { borderColor: k.onAccent + '4D' }]}
          accessibilityRole="button"
          accessibilityLabel={`Move ${selectedIds.size} items to a different store`}
        >
          <Text style={[s.bulkBtnText, { color: k.onAccent }]}>Move ({selectedIds.size})</Text>
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
      onEdit={isKidOrTeen ? undefined : (m) => { setOpenMeal(null); setEditingMeal(m); }}
      onDelete={isKidOrTeen ? undefined : (m) => { setOpenMeal(null); deleteMeal(m); }}
      hideAddToGrocery={isKidOrTeen}
      familyId={familyId}
      senderId={active.id}
    />

    <KioskMealFormDrawer
      visible={!!addDay || !!editingMeal}
      day={addDay}
      editingMeal={editingMeal}
      members={members}
      colors={{
        accent: k.purple, background: k.bg, border: k.cardBorder,
        danger: k.danger, surface: k.well, teal: k.sage, amber: k.gold,
        textPrimary: k.text, textSecondary: k.textMuted, textTertiary: k.textFaint,
      }}
      isDark={isDark}
      onClose={() => { setAddDay(null); setEditingMeal(null); }}
      onSave={saveMeal}
      saving={savingMeal}
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

    {bulkMoving && (
      <KioskStoreMoveSheet
        visible={bulkMoving}
        onClose={() => { setBulkMoving(false); setSelectedIds(new Set()); }}
        itemIds={Array.from(selectedIds)}
        itemName={`${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''}`}
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

    <KioskRunDetailSheet
      visible={!!viewingRun}
      run={viewingRun}
      active={active}
      members={members}
      onClose={() => setViewingRun(null)}
    />

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
// ════════════════════════════════════════════════════════════════════════
// KidGroceryRequestsPanel — the whole shared live grocery_items list
// replaced with a read-only view of THIS kid/teen's own grocery-type
// kidRequestStore requests [live-requested: "as i said we shoun't give
// the access to grocey add in the melas page they just can see their
// approved groceries by parents / kids and teens both"]. Real per-item
// data only: KidRequestItem.status (pending/approved/rejected, set by the
// real parent approveItemsAndSync/rejectItems flow — ParentView.tsx/
// KioskOverviewTab.tsx's own approveItemsAndSync), and — once approved —
// whether the matching real grocery_items row has since been bought and
// by whom [live-requested: "and that item status if the parent or
// someone brought that"]. There is no stored link from a KidRequestItem
// to the grocery_items row it produced (approveItemsAndSync just calls
// addItem with the same name/addedBy — verified by reading it), so the
// match here is the same normalized-name + addedBy key addItem's own
// dedupe already uses: exact enough for a real family's actual list
// (two different people rarely request the identically-named item on the
// same request), and never invents a status when it can't find a match.
// ════════════════════════════════════════════════════════════════════════

function KidGroceryRequestsPanel({ active, k, isDark, groceryItems, boughtItems, members }: {
  active: FamilyMember;
  k: KioskColors;
  isDark: boolean;
  groceryItems: GroceryItem[];
  boughtItems: GroceryItem[];
  members: FamilyMember[];
}) {
  const requests = useKidRequestStore(s => s.requests);
  const nameOf = (id?: string) => members.find(m => m.id === id)?.name?.trim().split(' ')[0];
  const norm = (s: string) => s.toLowerCase().trim();

  // Real grocery requests: type === 'delegation' with real item rows, NOT
  // a supplies request (same isGrocery derivation ActionNeededSection.tsx
  // already uses — grocery/supplies share the same 'delegation' type and
  // are told apart only by the SUPPLIES_PREFIX marker on `detail`; there
  // is no dedicated 'grocery' RequestType). Every item THIS member sent,
  // newest request first — flattened from KidRequest.items rather than
  // one row per request, since a single grocery request usually bundles
  // several items each with their own independent approve/reject status.
  const myItems = useMemo(() => {
    const mine = requests
      .filter(r => r.type === 'delegation' && !r.detail.startsWith(SUPPLIES_PREFIX)
        && r.fromMemberId === active.id && !!r.items?.length)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return mine.flatMap(r => (r.items ?? []).map(it => ({ reqId: r.id, requestedAt: r.requestedAt, item: it })));
  }, [requests, active.id]);

  const findLiveStatus = (it: KidRequestItem): { bought: boolean; boughtBy?: string } | null => {
    const key = norm(it.name);
    const pending = groceryItems.find(g => g.addedBy === active.id && norm(g.name) === key);
    if (pending) return { bought: false };
    const bought = boughtItems.find(g => g.addedBy === active.id && norm(g.name) === key);
    if (bought) return { bought: true, boughtBy: bought.boughtBy };
    return null; // approved but not yet matched (e.g. bought >7 days ago) — status unknown, not claimed either way
  };

  return (
    <WidgetCard k={k} isDark={isDark}>
      <PanelHead
        title="My requested groceries"
        k={k}
        right={myItems.length > 0 ? <Text style={[s.panelCount, { color: k.textFaint }]}>{myItems.length}</Text> : undefined}
      />
      {myItems.length === 0 ? (
        <EmptyNote text="Ask a parent to add something and it'll show up here." k={k} />
      ) : (
        <ScrollView style={s.myGroceryScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {myItems.map(({ reqId, item }, i) => {
            const live = item.status === 'approved' ? findLiveStatus(item) : null;
            const statusLabel = item.status === 'pending'
              ? 'Waiting on a parent'
              : item.status === 'rejected'
                ? `Declined${item.rejectedBy ? ` by ${nameOf(item.rejectedBy)}` : ''}`
                : live?.bought
                  ? `Bought${live.boughtBy ? ` by ${nameOf(live.boughtBy)}` : ''}`
                  : `Approved${item.approvedBy ? ` by ${nameOf(item.approvedBy)}` : ''}`;
            const statusColor = item.status === 'pending' ? k.gold
              : item.status === 'rejected' ? k.danger
              : live?.bought ? k.sage
              : k.blue;
            return (
              <View key={`${reqId}-${item.id}`} style={[s.myGroceryRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                <Text style={s.myGroceryEmoji} numberOfLines={1}>{item.emoji ?? itemEmoji(item.name) ?? '🛒'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.myGroceryName, { color: k.text }]} numberOfLines={1}>
                    {item.name}{item.qty ? ` · ${item.qty}` : ''}
                  </Text>
                  <Text style={[s.myGroceryStatus, { color: statusColor }]} numberOfLines={1}>{statusLabel}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </WidgetCard>
  );
}

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
  // KidGroceryRequestsPanel — 6 rows visible, rest scroll, same convention
  // as the other bounded kid/teen sideCol lists.
  myGroceryScroll: { maxHeight: 312 },
  myGroceryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingVertical: 11, minHeight: KIOSK_HIT.control,
  },
  myGroceryEmoji: { fontSize: 20 },
  myGroceryName: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  myGroceryStatus: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: 2 },
  scanBtn: { padding: 2 },
  aiStripCard: { marginBottom: KIOSK_SPACE.md, position: 'relative', overflow: 'hidden' },
  // Content stays clearly visible underneath (a teaser, not a blackout)
  // [live-reported: "ai whatever you show banner is fully dark not like
  // a teaser"] — the overlay's own translucent scrim is what carries the
  // "off-limits" read, not darkening the real content itself.
  aiStripLocked: { opacity: 0.55 },
  aiStripOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#00000066',
  },
  aiStripOverlayText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  dayAddBtn: {
    alignSelf: 'flex-start', marginTop: 4, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  // Mock-exact active-run banner, same shape/colors as Overview's Grocery
  // card so the two surfaces read as one feature, not two.
  runBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10,
  },
  runDot: { width: 8, height: 8, borderRadius: 4 },
  runBannerText: { flex: 1, fontSize: 12, fontWeight: '700' },
  runBannerLink: { fontSize: 11, fontWeight: '800', flexShrink: 0 },

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
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 8,
    marginBottom: KIOSK_SPACE.sm,
  },
  searchInput: { flex: 1, fontSize: KIOSK_TYPO.caption, padding: 0 },
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
  // 6 rows visible (~52px each) before a store section scrolls the rest.
  storeSectionScroll: { maxHeight: 312 },
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
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
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
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 7,
  },
  bulkBtnText: { fontSize: 12, fontWeight: '700' },
});
