/**
 * groceryStore — family grocery list with live collaborative check-off.
 *
 * Two layers:
 *   GroceryItem  — persistent pool; lives until bought (then archived)
 *   GroceryRun   — scoped shopping session; snapshot of items to buy at a store
 *
 * Realtime: subscribes to grocery_items + grocery_run_items for the active run
 * so a partner shopping at the store sees live check-offs from home and vice versa.
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

// Legacy type aliases used by ChatScreen's grocery quick-add
export type GroceryCategory = 'Produce' | 'Dairy & Eggs' | 'Bakery' | 'Pantry' | 'Frozen' | 'Household' | 'Snacks' | 'Pharmacy' | 'Pet Store' | 'Other';
export type GroceryStore    = 'Costco' | 'Supermarket' | "Trader Joe's" | 'Target' | 'Pharmacy' | 'Pet Store' | 'Other';

export interface GroceryItem {
  id: string;
  familyId: string;
  name: string;
  quantity?: string;       // free text: "2 kg", "1 dozen", "3 packets"
  category?: string;
  storePreference?: string;
  addedBy: string;         // member id
  isBought: boolean;
  boughtBy?: string;
  boughtAt?: string;
  notes?: string;
  aiGenerated: boolean;
  estimatedPrice?: number;
  // 'receipt' = a real scanned-purchase price (parse-grocery-receipt
  // matched this item by name to a receipt line item) — trusted over any
  // fresh AI/Kroger guess. 'estimate' or undefined = AI-guessed.
  priceSource?: 'receipt' | 'estimate';
  createdAt: string;
  isReturning?: boolean;
  returnQuestId?: string;
}

export interface GroceryRunItem {
  runId: string;
  itemId: string;
  checkedInRun: boolean;
  checkedBy?: string;
  checkedAt?: string;
  // Joined from grocery_items
  item?: GroceryItem;
}

export interface GroceryRun {
  id: string;
  familyId: string;
  name: string;
  store: string;
  status: 'draft' | 'active' | 'done';
  shopperId?: string;
  linkedEventId?: string;
  linkedQuestId?: string;
  linkedChannelId?: string;
  plannedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  // Joined
  runItems?: GroceryRunItem[];
}

// Combines two free-text quantities ("2 kg" + "1 kg") when addItem finds a
// genuine duplicate (same name + same store, still pending). Quantity is
// deliberately free text throughout this store (supports "1 dozen", "3
// packets"), so this can't just add two numbers — it sums leading numeric
// quantities when BOTH sides parse as a bare number (the common case: "2"
// + "1" → "3"), and otherwise falls back to a human-readable combination
// ("2 kg + 1 kg") rather than silently dropping either side.
function mergeQuantities(existing?: string, incoming?: string): string | undefined {
  const a = existing?.trim();
  const b = incoming?.trim();
  if (!b) return a;
  if (!a) return b;
  if (a === b) return a; // identical — nothing to merge
  const numA = /^\d+$/.test(a) ? parseInt(a, 10) : null;
  const numB = /^\d+$/.test(b) ? parseInt(b, 10) : null;
  if (numA !== null && numB !== null) return String(numA + numB);
  return `${a} + ${b}`;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function rowToItem(r: any): GroceryItem {
  return {
    id:              r.id,
    familyId:        r.family_id ?? '',
    name:            r.name,
    quantity:        r.quantity ?? undefined,
    category:        r.category ?? undefined,
    storePreference: r.store_preference ?? undefined,
    // legacy column name support
    addedBy:         r.added_by ?? r.added_by_member_id ?? '',
    isBought:        r.is_bought ?? r.bought ?? false,
    boughtBy:        r.bought_by ?? undefined,
    boughtAt:        r.bought_at ?? undefined,
    notes:           r.notes ?? undefined,
    aiGenerated:     r.ai_generated ?? false,
    estimatedPrice:  r.estimated_price ?? undefined,
    priceSource:     r.price_source ?? undefined,
    createdAt:       r.created_at,
    isReturning:     r.is_returning ?? false,
    returnQuestId:   r.return_quest_id ?? undefined,
  };
}

function rowToRun(r: any): GroceryRun {
  return {
    id:              r.id,
    familyId:        r.family_id,
    name:            r.name,
    store:           r.store,
    status:          r.status ?? 'draft',
    shopperId:       r.shopper_id ?? undefined,
    linkedEventId:   r.linked_event_id ?? undefined,
    linkedQuestId:   r.linked_quest_id ?? undefined,
    linkedChannelId: r.linked_channel_id ?? undefined,
    plannedAt:       r.planned_at ?? undefined,
    completedAt:     r.completed_at ?? undefined,
    createdBy:       r.created_by,
    createdAt:       r.created_at,
  };
}

function rowToRunItem(r: any): GroceryRunItem {
  return {
    runId:        r.run_id,
    itemId:       r.item_id,
    checkedInRun: r.checked_in_run ?? false,
    checkedBy:    r.checked_by ?? undefined,
    checkedAt:    r.checked_at ?? undefined,
    item:         r.grocery_items ? rowToItem(r.grocery_items) : undefined,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

interface GroceryState {
  items:      GroceryItem[];    // pending (not bought) items for the family
  runs:       GroceryRun[];     // all runs (latest first)
  loading:    boolean;
  familyId:   string | null;

  // Autocomplete caches (populated at load time, used by forms)
  pastStores:    string[];   // distinct store names from past runs
  pastItemNames: string[];   // distinct item names ever added (incl. bought)

  // store_proximity_reminders (feature-flagged) — which stores this family
  // has pinned a real-world location for, keyed by store name.
  pinnedStores: Record<string, { lat: number; lng: number }>;

  // family_store_preferences — the family's own curated store list, grown
  // by whoever adds a custom store name in the "move to store" picker.
  // Distinct from pastStores (client-derived from run history, resets to
  // nothing for a brand-new family) and DEFAULT_GROCERY_STORES (static
  // app-wide list) — this is the one that actually persists a family's own
  // additions for future suggestion (live-requested).
  savedStorePrefs: string[];

  // Realtime subscriptions
  _itemSub: any | null;
  _runSub:  any | null;

  // Actions
  load:    (familyId: string) => Promise<void>;
  refresh: () => Promise<void>;
  cleanup: () => void;

  addItem:    (params: { familyId: string; name: string; quantity?: string; category?: string; storePreference?: string; addedBy: string; notes?: string; aiGenerated?: boolean }) => Promise<GroceryItem | null>;
  updateItem:    (itemId: string, patch: Partial<Pick<GroceryItem, 'quantity' | 'category' | 'storePreference' | 'notes'>>) => Promise<void>;
  removeItem:    (itemId: string) => Promise<void>;
  buyItem:       (itemId: string, memberId: string) => Promise<void>;
  restoreItem:   (itemId: string) => Promise<void>;
  markReturning: (itemIds: string[], questId: string) => Promise<void>;

  createRun:    (params: { familyId: string; name: string; store: string; createdBy: string; shopperId?: string; linkedEventId?: string; linkedQuestId?: string; plannedAt?: string }) => Promise<GroceryRun | null>;
  startRun:     (runId: string, shopperId: string) => Promise<void>;
  completeRun:  (runId: string) => Promise<void>;
  deleteRun:    (runId: string) => Promise<void>;

  addItemToRun:      (runId: string, itemId: string) => Promise<void>;
  removeItemFromRun: (runId: string, itemId: string) => Promise<void>;
  checkRunItem:      (runId: string, itemId: string, memberId: string) => Promise<void>;
  uncheckRunItem:    (runId: string, itemId: string) => Promise<void>;

  loadRunDetail: (runId: string) => Promise<GroceryRun | null>;

  // Update autocomplete caches after new items/runs are added externally
  appendToCache: (newItemNames: string[], newStores: string[]) => void;

  loadPinnedStores:  (familyId: string) => Promise<void>;
  pinStoreLocation:  (params: { familyId: string; store: string; latitude: number; longitude: number; pinnedBy: string }) => Promise<void>;

  loadSavedStores: (familyId: string) => Promise<void>;
  addSavedStore:   (params: { familyId: string; name: string; createdBy: string }) => Promise<void>;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGroceryStore = create<GroceryState>((set, get) => ({
  items:         [],
  runs:          [],
  loading:       false,
  familyId:      null,
  pastStores:    [],
  pastItemNames: [],
  pinnedStores:  {},
  savedStorePrefs: [],
  _itemSub:      null,
  _runSub:       null,

  load: async (familyId) => {
    const existing = get();

    // Skip if already loaded for this family — realtime keeps it live
    if (existing.familyId === familyId && existing._itemSub) return;

    // Tear down old subs and wait for removal before creating new ones
    if (existing._itemSub) await supabase.removeChannel(existing._itemSub);
    if (existing._runSub)  await supabase.removeChannel(existing._runSub);
    set({ _itemSub: null, _runSub: null, loading: true, familyId });

    try {
      // Load pending items
      const { data: iData } = await supabase
        .from('grocery_items')
        .select('*')
        .eq('family_id', familyId)
        .eq('is_bought', false)
        .order('created_at', { ascending: false });

      // Load recent runs
      const { data: rData } = await supabase
        .from('grocery_runs')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })
        .limit(30);

      const pendingItems = (iData ?? []).map(rowToItem);
      const recentRuns   = (rData ?? []).map(rowToRun);

      set({ items: pendingItems, runs: recentRuns, loading: false });

      // Build autocomplete caches in the background (non-blocking). Store
      // suggestions used to come ONLY from grocery_runs.store (past
      // shopping TRIPS) — a store a family only ever typed into an ITEM's
      // own store field, without ever turning it into a Run, never
      // surfaced as a suggestion anywhere. Now merges both sources.
      Promise.all([
        supabase.from('grocery_runs').select('store').eq('family_id', familyId).order('created_at', { ascending: false }).limit(100),
        supabase.from('grocery_items').select('name, store_preference').eq('family_id', familyId).order('created_at', { ascending: false }).limit(500),
      ]).then(([storesRes, namesRes]) => {
        const runStores  = (storesRes.data ?? []).map((r: any) => r.store as string);
        const itemStores = (namesRes.data ?? []).map((r: any) => r.store_preference as string | null).filter((s): s is string => !!s);
        const uniqueStores = [...new Set([...runStores, ...itemStores].filter(Boolean))];
        const uniqueNames  = [...new Set((namesRes.data ?? []).map((r: any) => r.name as string).filter(Boolean))];
        set({ pastStores: uniqueStores, pastItemNames: uniqueNames });
      });

      // A per-family (not per-call) channel name collides if load() is ever
      // invoked twice concurrently for the same family before either call's
      // subscription lands in state — the guard above only skips a SECOND
      // call once the FIRST has already finished and been tracked, not
      // while it's still in flight. A random suffix removes the collision
      // entirely regardless of call timing (see the same fix applied to
      // FamilyRadarSection.tsx/GpsTab.tsx for the identical root cause).
      const subSuffix = Math.random().toString(36).slice(2);
      const itemSub = supabase
        .channel(`grocery_items:${familyId}:${subSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_items', filter: `family_id=eq.${familyId}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const item = rowToItem(payload.new);
              if (!item.isBought) {
                set(s => ({ items: [item, ...s.items.filter(i => i.id !== item.id)] }));
              }
            }
            if (payload.eventType === 'UPDATE') {
              const item = rowToItem(payload.new);
              set(s => ({
                items: item.isBought
                  ? s.items.filter(i => i.id !== item.id)
                  : s.items.map(i => i.id === item.id ? item : i),
              }));
            }
            if (payload.eventType === 'DELETE') {
              set(s => ({ items: s.items.filter(i => i.id !== (payload.old as any).id) }));
            }
          })
        .subscribe();

      // Realtime: run changes
      const runSub = supabase
        .channel(`grocery_runs:${familyId}:${subSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_runs', filter: `family_id=eq.${familyId}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const run = rowToRun(payload.new);
              set(s => ({ runs: [run, ...s.runs.filter(r => r.id !== run.id)] }));
            }
            if (payload.eventType === 'UPDATE') {
              const run = rowToRun(payload.new);
              set(s => ({ runs: s.runs.map(r => r.id === run.id ? { ...r, ...run } : r) }));
            }
            if (payload.eventType === 'DELETE') {
              set(s => ({ runs: s.runs.filter(r => r.id !== (payload.old as any).id) }));
            }
          })
        .subscribe();

      set({ _itemSub: itemSub, _runSub: runSub });
    } catch (err) {
      console.warn('[groceryStore] load error', err);
      set({ loading: false });
    }
  },

  refresh: async () => {
    const { familyId } = get();
    if (familyId) await get().load(familyId);
  },

  cleanup: () => {
    const { _itemSub, _runSub } = get();
    if (_itemSub) supabase.removeChannel(_itemSub);
    if (_runSub)  supabase.removeChannel(_runSub);
    set({ _itemSub: null, _runSub: null, items: [], runs: [], familyId: null });
  },

  // ── Items ─────────────────────────────────────────────────────────────────

  addItem: async (params) => {
    // Was name-only, case-insensitive against not-yet-bought items — two
    // real problems: (1) "Milk" for Costco and "Milk" for Walmart are
    // legitimately different pending items (different store, different
    // trip), but got silently collapsed into one; (2) any actual
    // duplicate (same name AND same store) just returned the existing
    // row unchanged — a second "Milk, 2" add after an existing "Milk, 1"
    // dropped the new quantity entirely instead of merging it. Dedupe
    // key is now name + store (normalized; "no store set" is its own
    // bucket, not merged with an explicit store), and a genuine duplicate
    // now merges quantities instead of no-opping.
    const normStore = (s?: string) => (s ?? '').toLowerCase().trim();
    const existing = get().items.find(
      i => !i.isBought
        && i.name.toLowerCase().trim() === params.name.toLowerCase().trim()
        && normStore(i.storePreference) === normStore(params.storePreference)
    );
    if (existing) {
      const mergedQty = mergeQuantities(existing.quantity, params.quantity);
      if (mergedQty !== existing.quantity) {
        await get().updateItem(existing.id, { quantity: mergedQty });
        return { ...existing, quantity: mergedQty };
      }
      return existing;
    }

    const id  = uuid();
    const now = new Date().toISOString();
    const row = {
      id,
      family_id:        params.familyId,
      name:             params.name,
      quantity:         params.quantity ?? null,
      category:         params.category ?? null,
      store_preference: params.storePreference ?? null,
      added_by:         params.addedBy,
      is_bought:        false,
      notes:            params.notes ?? null,
      ai_generated:     params.aiGenerated ?? false,
      created_at:       now,
    };

    // DB-is-truth: await the insert before adding the item to local state.
    const { error } = await supabase.from('grocery_items').insert(row);
    if (error) {
      console.warn('[groceryStore] addItem error', error);
      return null;
    }
    const created: GroceryItem = {
      id, familyId: params.familyId, name: params.name,
      quantity: params.quantity, category: params.category,
      storePreference: params.storePreference, addedBy: params.addedBy,
      isBought: false, notes: params.notes, aiGenerated: params.aiGenerated ?? false,
      createdAt: now,
    };
    set(s => ({ items: [created, ...s.items] }));

    // A new item tagged to a store that already has an open (draft or
    // active) trip should show up in that trip immediately — a partner
    // mid-shop shouldn't need someone to separately remember to "Add to
    // Run" for something added moments ago from the main list. Mirrors
    // createRun's own explicit-store-match auto-join. RunDetailSheet's
    // existing INSERT realtime subscription on grocery_run_items already
    // picks this up live for anyone with that trip open.
    if (params.storePreference) {
      const normStore = (s?: string | null) => (s ?? '').toLowerCase().trim();
      const openRun = get().runs.find(r =>
        r.status !== 'done' && normStore(r.store) === normStore(params.storePreference)
      );
      if (openRun) {
        const { error: joinError } = await supabase.from('grocery_run_items')
          .upsert({ run_id: openRun.id, item_id: id, checked_in_run: false }, { onConflict: 'run_id,item_id' });
          if (joinError) console.warn('[groceryStore] addItem auto-join error', joinError);

        // A push, not just the realtime subscription the comment above
        // relies on — that only helps if the shopper has RunDetailSheet
        // open right now. `active` only (not `draft`): nobody's actually
        // out shopping yet for a draft trip, so there's no one to interrupt
        // mid-aisle. Direct report: "if one partner added the new grocery
        // while the other partner in the live shop then it should also
        // notify."
        if (openRun.status === 'active' && openRun.shopperId && openRun.shopperId !== params.addedBy) {
          supabase.functions.invoke('family-notifier', {
            body: {
              type: 'custom', familyId: params.familyId, memberIds: [openRun.shopperId], persist: true,
              payload: {
                title: `🛒 New item added to your ${openRun.store} trip`,
                body: `"${params.name}" was just added — check the list before you check out.`,
                data: { type: 'grocery_item_added_live', run_id: openRun.id, item_id: id },
              },
            },
          }).catch(e => console.warn('[groceryStore] live-shop notify failed:', e?.message));
        }
      }
    }

    return created;
  },

  updateItem: async (itemId, patch) => {
    const row: Record<string, unknown> = {};
    if ('quantity' in patch) row.quantity = patch.quantity ?? null;
    if ('category' in patch) row.category = patch.category ?? null;
    if ('storePreference' in patch) row.store_preference = patch.storePreference ?? null;
    if ('notes' in patch) row.notes = patch.notes ?? null;
    // DB-is-truth: await the write before reflecting it locally — was
    // optimistic (set immediately, no rollback on failure).
    const { error } = await supabase.from('grocery_items').update(row).eq('id', itemId);
    if (error) { console.warn('[groceryStore] updateItem error', error); return; }
    set(s => ({ items: s.items.map(i => i.id === itemId ? { ...i, ...patch } : i) }));
  },

  removeItem: async (itemId) => {
    const { error } = await supabase.from('grocery_items').delete().eq('id', itemId);
    if (error) { console.warn('[groceryStore] removeItem error', error); return; }
    set(s => ({ items: s.items.filter(i => i.id !== itemId) }));
  },

  buyItem: async (itemId, memberId) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('grocery_items').update({ is_bought: true, bought_by: memberId, bought_at: now }).eq('id', itemId);
    if (error) { console.warn('[groceryStore] buyItem error', error); return; }
    set(s => ({ items: s.items.filter(i => i.id !== itemId) }));
  },

  restoreItem: async (itemId) => {
    // Was relying entirely on realtime to re-add the row to `items` — fine
    // as long as this store's own grocery_items channel is alive, but a
    // dead/slow socket left the item stuck out of the pending list on the
    // acting device itself until an unrelated load() re-ran. GroceryScreen
    // doesn't even read `items` for the bought section (it keeps its own
    // separate boughtItems fetch), but patching here still matters for the
    // canonical store state (`items`) that any other consumer relies on.
    const { data } = await supabase.from('grocery_items')
      .update({ is_bought: false, bought_by: null, bought_at: null })
      .eq('id', itemId)
      .select()
      .single();
    if (data) {
      const restored = rowToItem(data);
      set(s => ({ items: s.items.some(i => i.id === restored.id) ? s.items : [restored, ...s.items] }));
    }
  },

  markReturning: async (itemIds, questId) => {
    // Was DB-write-only — GroceryScreen.tsx's handleCreateReturn papers over
    // this with a guessed `setTimeout(refreshBought, 600)` against its own
    // separate boughtItems fetch, but this store's own `items` state (the
    // canonical source for any other/future consumer) never reflected the
    // is_returning flag itself. Patch it here so the store stays correct
    // regardless of what any particular screen happens to re-fetch.
    const { error } = await supabase.from('grocery_items')
      .update({ is_returning: true, return_quest_id: questId })
      .in('id', itemIds);
    if (error) { console.warn('[groceryStore] markReturning error', error); return; }
    set(s => ({
      items: s.items.map(i => itemIds.includes(i.id) ? { ...i, isReturning: true, returnQuestId: questId } : i),
    }));
  },

  // ── Runs ──────────────────────────────────────────────────────────────────

  createRun: async (params) => {
    const id  = uuid();
    const now = new Date().toISOString();
    const row = {
      id,
      family_id:        params.familyId,
      name:             params.name,
      store:            params.store,
      status:           'draft',
      shopper_id:       params.shopperId ?? null,
      linked_event_id:  params.linkedEventId ?? null,
      linked_quest_id:  params.linkedQuestId ?? null,
      planned_at:       params.plannedAt ?? null,
      created_by:       params.createdBy,
      created_at:       now,
    };

    // DB-is-truth: await the insert before adding the run to local state —
    // was optimistic-insert-then-rollback-on-failure.
    const { error } = await supabase.from('grocery_runs').insert(row);
    if (error) {
      console.warn('[groceryStore] createRun error', error);
      return null;
    }
    const created: GroceryRun = {
      id, familyId: params.familyId, name: params.name, store: params.store,
      status: 'draft', shopperId: params.shopperId, linkedEventId: params.linkedEventId,
      linkedQuestId: params.linkedQuestId, plannedAt: params.plannedAt,
      createdBy: params.createdBy, createdAt: now,
    };
    set(s => ({ runs: [created, ...s.runs] }));

    // Was: every trip started empty — even items already explicitly tagged
    // with this exact store's name had to be manually re-added one at a
    // time from the "Add" tab, live-reported as pointless busywork when the
    // list was already store-aware. Auto-join on creation instead.
    // Deliberately narrow to an EXPLICIT match only, not "no preference ==
    // fits anywhere" — a first attempt at this included untagged items too
    // and a real list (1 item actually tagged Walmart, 50 untagged) dumped
    // all 51 into a Walmart trip, which read as broken grouping rather than
    // helpful (live-reported: "only one item under walmart... why 12
    // pushed?"). Untagged items stay reachable via the Add tab's search,
    // same as items tagged to a genuinely different store.
    const normStore = (s?: string | null) => (s ?? '').toLowerCase().trim();
    const matching = get().items.filter(i =>
      !i.isBought && !!i.storePreference && normStore(i.storePreference) === normStore(params.store)
    );
    if (matching.length) {
      const rows = matching.map(i => ({ run_id: id, item_id: i.id, checked_in_run: false }));
      const { error: joinError } = await supabase.from('grocery_run_items').upsert(rows, { onConflict: 'run_id,item_id' });
      if (joinError) console.warn('[groceryStore] createRun auto-join error', joinError);
    }

    return created;
  },

  startRun: async (runId, shopperId) => {
    const { error } = await supabase.from('grocery_runs').update({ status: 'active', shopper_id: shopperId }).eq('id', runId);
    if (error) { console.warn('[groceryStore] startRun error', error); return; }
    set(s => ({ runs: s.runs.map(r => r.id === runId ? { ...r, status: 'active', shopperId } : r) }));
    // Best-effort — a partner not knowing shopping started shouldn't block
    // the trip itself. Was: no signal at all that shopping had begun; a
    // partner would only find out by opening the app and checking
    // (live-reported: "do the partner get notification if the other
    // partner start shopping?").
    //
    // Originally called a standalone notify-shopping-trip-started function
    // that read push tokens from a `push_tokens` table — that table is a
    // leftover from a different app sharing this Supabase project and is
    // never actually populated for Family Cube; the real per-member token
    // lives on members.expo_push_token, which family-notifier (the
    // function every other Family Cube notification — quests, rewards,
    // help requests, kid requests — already goes through) correctly reads.
    // Reusing it here instead of a bespoke function, via its generic
    // 'custom' type since 'shopping_trip_started' isn't one of its
    // pre-built templates.
    const run = get().runs.find(r => r.id === runId);
    if (run?.familyId) {
      supabase.from('members').select('id').eq('family_id', run.familyId).neq('id', shopperId)
        .then(({ data: others }) => {
          const memberIds = (others ?? []).map((m: any) => m.id);
          if (memberIds.length === 0) return;
          supabase.functions.invoke('family-notifier', {
            body: {
              type: 'custom',
              memberIds,
              familyId: run.familyId,
              payload: {
                title: `🛒 Shopping started at ${run.store}`,
                body: `Add anything you need now — it'll show up on their list live.`,
                data: { type: 'shopping_trip_started', run_id: runId, store: run.store },
              },
              persist: false,
            },
          }).catch(() => {});
        });
    }
  },

  completeRun: async (runId) => {
    const now = new Date().toISOString();
    const { error: completeError } = await supabase.from('grocery_runs').update({ status: 'done', completed_at: now }).eq('id', runId);
    if (completeError) { console.warn('[groceryStore] completeRun error', completeError); return; }
    set(s => ({ runs: s.runs.map(r => r.id === runId ? { ...r, status: 'done', completedAt: now } : r) }));
    // Mark checked items as bought. Was selecting is_returning from
    // grocery_run_items to skip "returning" items — that column only ever
    // existed on grocery_items (set later, by markReturning, once an item
    // is ALREADY bought and flagged to go back) — it never existed on this
    // join table. The query error'd out silently every single time
    // (PostgREST 42703 undefined column), so `data` was always empty and
    // NO item ever got marked bought on trip completion — live-reported
    // ("bought 3 items but list still shows 12"). The "skip returning"
    // intent doesn't even apply here: an item being newly checked off in
    // THIS run can't already be flagged is_returning from a future state.
    const { data, error } = await supabase
      .from('grocery_run_items')
      .select('item_id, checked_by')
      .eq('run_id', runId)
      .eq('checked_in_run', true);
    if (error) console.warn('[groceryStore] completeRun bought-items query error', error);
    const bought = data ?? [];
    if (bought.length) {
      // Was one UPDATE per checked-off item (10-30+ on a real trip) — group
      // by who checked each one off (typically 1-3 people per run, not one
      // per item) and issue one batched .in() update per distinct checker
      // instead, since bought_by varies per group but not per item within it.
      const byChecker = new Map<string, string[]>();
      for (const ri of bought) {
        const key = ri.checked_by ?? '';
        const list = byChecker.get(key) ?? [];
        list.push(ri.item_id);
        byChecker.set(key, list);
      }
      await Promise.all(
        Array.from(byChecker.entries()).map(([checkedBy, itemIds]) =>
          supabase.from('grocery_items')
            .update({ is_bought: true, bought_by: checkedBy || null, bought_at: now })
            .in('id', itemIds),
        ),
      );
      set(s => ({ items: s.items.filter(i => !bought.find(d => d.item_id === i.id)) }));
    }
  },

  deleteRun: async (runId) => {
    // grocery_items are never deleted here — returning items naturally stay on the list
    await supabase.from('grocery_run_items').delete().eq('run_id', runId);
    const { error } = await supabase.from('grocery_runs').delete().eq('id', runId);
    if (error) { console.warn('[groceryStore] deleteRun error', error); return; }
    set(s => ({ runs: s.runs.filter(r => r.id !== runId) }));
  },

  // ── Run items ─────────────────────────────────────────────────────────────

  // grocery_run_items has no realtime subscription anywhere in the app (only
  // grocery_items/grocery_runs do, set up in load() above) — these four
  // actions used to write straight to the DB and return, so `runs[].runItems`
  // in THIS store never reflected the change; the only reason it looked
  // fine in practice is that RunDetailSheet.tsx keeps its own separate
  // useState + manual loadRunDetail() call after every one of these calls.
  // Any other/future consumer of useGroceryStore().runs would see stale
  // run-item state indefinitely. Reusing loadRunDetail's existing correct
  // fetch-and-patch (it already fixes the joined-item-name bug, see its own
  // comment) closes that gap at the store level instead of per-caller.
  addItemToRun: async (runId, itemId) => {
    await supabase.from('grocery_run_items').upsert({ run_id: runId, item_id: itemId, checked_in_run: false }, { onConflict: 'run_id,item_id' });
    await get().loadRunDetail(runId);
  },

  removeItemFromRun: async (runId, itemId) => {
    await supabase.from('grocery_run_items').delete().eq('run_id', runId).eq('item_id', itemId);
    await get().loadRunDetail(runId);
  },

  checkRunItem: async (runId, itemId, memberId) => {
    const now = new Date().toISOString();
    await supabase.from('grocery_run_items').update({ checked_in_run: true, checked_by: memberId, checked_at: now }).eq('run_id', runId).eq('item_id', itemId);
    await get().loadRunDetail(runId);
  },

  uncheckRunItem: async (runId, itemId) => {
    await supabase.from('grocery_run_items').update({ checked_in_run: false, checked_by: null, checked_at: null }).eq('run_id', runId).eq('item_id', itemId);
    await get().loadRunDetail(runId);
  },

  loadRunDetail: async (runId) => {
    // Was select('*') with no join — rowToRunItem's `item` field always
    // reads r.grocery_items, which a bare '*' never populates, so `ri.item`
    // was always undefined and every item row silently fell back to
    // showing its raw UUID instead of its name/quantity (live-reported).
    const { data, error } = await supabase
      .from('grocery_run_items')
      .select('*, grocery_items(*)')
      .eq('run_id', runId);

    if (error) { console.warn('[groceryStore] loadRunDetail error', error); return null; }

    const runItems = (data ?? []).map(rowToRunItem);
    const run = get().runs.find(r => r.id === runId);
    if (!run) return null;

    const updated = { ...run, runItems };
    set(s => ({ runs: s.runs.map(r => r.id === runId ? updated : r) }));
    return updated;
  },

  appendToCache: (newItemNames, newStores) => {
    set(s => ({
      pastItemNames: [...new Set([...newItemNames, ...s.pastItemNames])],
      pastStores:    [...new Set([...newStores,    ...s.pastStores])],
    }));
  },

  loadPinnedStores: async (familyId) => {
    const { data, error } = await supabase
      .from('store_locations')
      .select('store, latitude, longitude')
      .eq('family_id', familyId);
    if (error) { console.warn('[groceryStore] loadPinnedStores error', error); return; }
    const map: Record<string, { lat: number; lng: number }> = {};
    for (const row of data ?? []) map[row.store] = { lat: row.latitude, lng: row.longitude };
    set({ pinnedStores: map });
  },

  pinStoreLocation: async ({ familyId, store, latitude, longitude, pinnedBy }) => {
    set(s => ({ pinnedStores: { ...s.pinnedStores, [store]: { lat: latitude, lng: longitude } } }));
    const { error } = await supabase.from('store_locations').upsert({
      family_id: familyId, store, latitude, longitude, pinned_by: pinnedBy,
    }, { onConflict: 'family_id,store' });
    if (error) console.warn('[groceryStore] pinStoreLocation error', error);
  },

  loadSavedStores: async (familyId) => {
    const { data, error } = await supabase
      .from('family_store_preferences')
      .select('name')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });
    if (error) { console.warn('[groceryStore] loadSavedStores error', error); return; }
    set({ savedStorePrefs: (data ?? []).map(r => r.name) });
  },

  addSavedStore: async ({ familyId, name, createdBy }) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Optimistic — the picker adds it to the suggestion list immediately;
    // the unique(family_id, name) constraint makes a duplicate insert a
    // harmless no-op server-side rather than an error worth surfacing.
    set(s => s.savedStorePrefs.includes(trimmed) ? s : { savedStorePrefs: [...s.savedStorePrefs, trimmed] });
    const { error } = await supabase.from('family_store_preferences')
      .insert({ family_id: familyId, name: trimmed, created_by: createdBy })
      .select().single();
    if (error && error.code !== '23505') console.warn('[groceryStore] addSavedStore error', error);
  },
}));
