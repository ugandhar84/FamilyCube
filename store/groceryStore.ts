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

    const optimistic: GroceryItem = {
      id, familyId: params.familyId, name: params.name,
      quantity: params.quantity, category: params.category,
      storePreference: params.storePreference, addedBy: params.addedBy,
      isBought: false, notes: params.notes, aiGenerated: params.aiGenerated ?? false,
      createdAt: now,
    };
    set(s => ({ items: [optimistic, ...s.items] }));

    const { error } = await supabase.from('grocery_items').insert(row);
    if (error) {
      console.warn('[groceryStore] addItem error', error);
      set(s => ({ items: s.items.filter(i => i.id !== id) }));
      return null;
    }
    return optimistic;
  },

  updateItem: async (itemId, patch) => {
    set(s => ({ items: s.items.map(i => i.id === itemId ? { ...i, ...patch } : i) }));
    const row: Record<string, unknown> = {};
    if ('quantity' in patch) row.quantity = patch.quantity ?? null;
    if ('category' in patch) row.category = patch.category ?? null;
    if ('storePreference' in patch) row.store_preference = patch.storePreference ?? null;
    if ('notes' in patch) row.notes = patch.notes ?? null;
    const { error } = await supabase.from('grocery_items').update(row).eq('id', itemId);
    if (error) console.warn('[groceryStore] updateItem error', error);
  },

  removeItem: async (itemId) => {
    set(s => ({ items: s.items.filter(i => i.id !== itemId) }));
    await supabase.from('grocery_items').delete().eq('id', itemId);
  },

  buyItem: async (itemId, memberId) => {
    const now = new Date().toISOString();
    set(s => ({ items: s.items.filter(i => i.id !== itemId) }));
    await supabase.from('grocery_items').update({ is_bought: true, bought_by: memberId, bought_at: now }).eq('id', itemId);
  },

  restoreItem: async (itemId) => {
    await supabase.from('grocery_items').update({ is_bought: false, bought_by: null, bought_at: null }).eq('id', itemId);
    // Realtime will re-add it to the list
  },

  markReturning: async (itemIds, questId) => {
    await supabase.from('grocery_items')
      .update({ is_returning: true, return_quest_id: questId })
      .in('id', itemIds);
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

    const optimistic: GroceryRun = {
      id, familyId: params.familyId, name: params.name, store: params.store,
      status: 'draft', shopperId: params.shopperId, linkedEventId: params.linkedEventId,
      linkedQuestId: params.linkedQuestId, plannedAt: params.plannedAt,
      createdBy: params.createdBy, createdAt: now,
    };
    set(s => ({ runs: [optimistic, ...s.runs] }));

    const { error } = await supabase.from('grocery_runs').insert(row);
    if (error) {
      console.warn('[groceryStore] createRun error', error);
      set(s => ({ runs: s.runs.filter(r => r.id !== id) }));
      return null;
    }
    return optimistic;
  },

  startRun: async (runId, shopperId) => {
    set(s => ({ runs: s.runs.map(r => r.id === runId ? { ...r, status: 'active', shopperId } : r) }));
    await supabase.from('grocery_runs').update({ status: 'active', shopper_id: shopperId }).eq('id', runId);
  },

  completeRun: async (runId) => {
    const now = new Date().toISOString();
    set(s => ({ runs: s.runs.map(r => r.id === runId ? { ...r, status: 'done', completedAt: now } : r) }));
    await supabase.from('grocery_runs').update({ status: 'done', completed_at: now }).eq('id', runId);
    // Mark checked items as bought — but skip returning items (they stay on the list)
    const { data } = await supabase
      .from('grocery_run_items')
      .select('item_id, checked_by, is_returning')
      .eq('run_id', runId)
      .eq('checked_in_run', true);
    const bought = (data ?? []).filter(ri => !ri.is_returning);
    if (bought.length) {
      for (const ri of bought) {
        await supabase.from('grocery_items').update({ is_bought: true, bought_by: ri.checked_by, bought_at: now }).eq('id', ri.item_id);
      }
      set(s => ({ items: s.items.filter(i => !bought.find(d => d.item_id === i.id)) }));
    }
  },

  deleteRun: async (runId) => {
    set(s => ({ runs: s.runs.filter(r => r.id !== runId) }));
    // grocery_items are never deleted here — returning items naturally stay on the list
    await supabase.from('grocery_run_items').delete().eq('run_id', runId);
    await supabase.from('grocery_runs').delete().eq('id', runId);
  },

  // ── Run items ─────────────────────────────────────────────────────────────

  addItemToRun: async (runId, itemId) => {
    await supabase.from('grocery_run_items').upsert({ run_id: runId, item_id: itemId, checked_in_run: false }, { onConflict: 'run_id,item_id' });
  },

  removeItemFromRun: async (runId, itemId) => {
    await supabase.from('grocery_run_items').delete().eq('run_id', runId).eq('item_id', itemId);
  },

  checkRunItem: async (runId, itemId, memberId) => {
    const now = new Date().toISOString();
    await supabase.from('grocery_run_items').update({ checked_in_run: true, checked_by: memberId, checked_at: now }).eq('run_id', runId).eq('item_id', itemId);
  },

  uncheckRunItem: async (runId, itemId) => {
    await supabase.from('grocery_run_items').update({ checked_in_run: false, checked_by: null, checked_at: null }).eq('run_id', runId).eq('item_id', itemId);
  },

  loadRunDetail: async (runId) => {
    const { data, error } = await supabase
      .from('grocery_run_items')
      .select('*')
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
}));
