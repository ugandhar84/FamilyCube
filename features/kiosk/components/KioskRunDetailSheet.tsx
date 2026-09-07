/**
 * KioskRunDetailSheet — kiosk-native port of
 * features/grocery/components/RunDetailSheet.tsx's live item list for an
 * active shopping run, opened by tapping the "Shopping now at {store}"
 * banner already on kiosk's Grocery cards.
 *
 * Live-requested: "when user is in the live in shopping - if other person
 * added to that shop it should live reflect in to the list of that run
 * direcly ... and added by and time ago." Two real, already-correct halves
 * this brings together for the first time on kiosk:
 *
 *   1. The WRITE side already exists and needed nothing new: groceryStore.ts's
 *      addItem() already finds any open run at the matching store and
 *      upserts a grocery_run_items row for it (its own "auto-join" comment,
 *      confirmed by reading it) — so an item added from ANY device,
 *      kiosk's own KioskGroceryItemSheet included, already lands in an
 *      active run's item pool today. Nothing to build there.
 *   2. The READ side had no kiosk surface at all — kiosk could only show
 *      the one-line "Shopping now at {store}" banner, never the run's
 *      actual item list. This component is that missing surface, using
 *      the SAME run_items:{runId} realtime channel RunDetailSheet.tsx
 *      itself subscribes to (postgres_changes on grocery_run_items —
 *      INSERT/UPDATE/DELETE), so an item someone adds mid-trip appears
 *      here within the same live round-trip the phone gets.
 *
 * "Added by X · N ago" is real, existing formatting — fmtProvenance()
 * from features/grocery/components/types.tsx, which the PHONE'S OWN
 * RunDetailSheet.tsx doesn't actually call (it only shows name/quantity)
 * even though ri.item carries the real addedBy/createdAt fields needed.
 * Live-requested as new kiosk-side value on top of the ported view, using
 * a function that already existed for exactly this purpose.
 *
 * ── What's ported vs. deliberately not ──────────────────────────────────
 * Ported: live item list, check/uncheck (checkRunItem/uncheckRunItem —
 * confirmed 'full run detail, check-off included' scope), remove from run.
 * NOT ported: "Not Found here" (RunDetailSheet.tsx's own notFoundIds is
 * local component state, never persisted to the DB — a personal marker
 * for whoever is physically in the aisle right then, not real cross-
 * device data, so there's nothing for a stationary kiosk to meaningfully
 * show or set) and the Return-to-store flow (a separate feature — quest
 * creation + assignee picker — matching the same scope line already drawn
 * for kiosk's Recently Bought section). Receipt-scan-from-a-run isn't
 * ported either: kiosk's own KioskReceiptScanSheet already covers receipt
 * scanning generally, a second run-scoped entry point isn't this ask.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Check, X, ShoppingCart } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useGroceryStore, type GroceryRun, type GroceryRunItem } from '@/store/groceryStore';
import type { FamilyMember } from '@/store/familyStore';
import { fmtProvenance } from '@/features/grocery/components/types';
import { useKioskColors, type KioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer } from './KioskFormDrawer';

export function KioskRunDetailSheet({ visible, run, active, members, onClose }: {
  visible: boolean;
  run: GroceryRun | null;
  /** Whoever is checking items off is credited as this kiosk's current active member. */
  active: FamilyMember;
  members: FamilyMember[];
  onClose: () => void;
}) {
  const { k } = useKioskColors();
  const checkRunItem = useGroceryStore(s => s.checkRunItem);
  const uncheckRunItem = useGroceryStore(s => s.uncheckRunItem);
  const removeItemFromRun = useGroceryStore(s => s.removeItemFromRun);
  const loadRunDetail = useGroceryStore(s => s.loadRunDetail);

  const [runItems, setRunItems] = useState<GroceryRunItem[]>(run?.runItems ?? []);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Same real_items:{runId} realtime channel RunDetailSheet.tsx subscribes
  // to — an item added/checked/removed on ANY device (including this
  // kiosk's own KioskGroceryItemSheet elsewhere on the same screen)
  // appears here live, not just on next mount.
  useEffect(() => {
    if (!run || !visible) return;
    loadRunDetail(run.id).then(detail => setRunItems(detail?.runItems ?? []));

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
        async () => {
          const detail = await loadRunDetail(run.id);
          setRunItems(detail?.runItems ?? []);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'grocery_run_items', filter: `run_id=eq.${run.id}` },
        (payload: any) => {
          setRunItems(prev => prev.filter(ri => ri.itemId !== payload.old.item_id));
        })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [run?.id, visible, loadRunDetail]);

  if (!run) return null;

  const toggleCheck = async (ri: GroceryRunItem, memberId: string) => {
    if (loadingId) return;
    setLoadingId(ri.itemId);
    try {
      if (ri.checkedInRun) {
        await uncheckRunItem(run.id, ri.itemId);
        setRunItems(prev => prev.map(r => r.itemId === ri.itemId ? { ...r, checkedInRun: false } : r));
      } else {
        await checkRunItem(run.id, ri.itemId, memberId);
        setRunItems(prev => prev.map(r => r.itemId === ri.itemId ? { ...r, checkedInRun: true, checkedBy: memberId } : r));
      }
    } finally {
      setLoadingId(null);
    }
  };

  const checkedCount = runItems.filter(ri => ri.checkedInRun).length;

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title={`Shopping at ${run.store}`}
      subtitle={`${checkedCount} of ${runItems.length} bought`}
      accent={k.sage}
      Icon={ShoppingCart}
      k={k}
      onClose={onClose}
    >
      {runItems.length === 0 ? (
        <View style={s.empty}>
          <ShoppingCart size={32} color={k.textFaint} />
          <Text style={[s.emptyText, { color: k.textFaint }]}>
            No items on this trip yet — anything added to the list at {run.store} will appear here live.
          </Text>
        </View>
      ) : (
        runItems.map((ri, i) => {
          const busy = loadingId === ri.itemId;
          const addedBy = ri.item ? fmtProvenance(ri.item, members) : undefined;
          return (
            <View
              key={ri.itemId}
              style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
            >
              <Pressable
                onPress={() => toggleCheck(ri, active.id)}
                disabled={busy}
                hitSlop={8}
                style={[s.checkbox, { borderColor: ri.checkedInRun ? k.sage : k.cardBorder, backgroundColor: ri.checkedInRun ? k.sage : 'transparent' }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ri.checkedInRun, disabled: busy }}
                accessibilityLabel={`Mark ${ri.item?.name ?? 'item'} as ${ri.checkedInRun ? 'not bought' : 'bought'}`}
              >
                {busy ? <ActivityIndicator size="small" color={k.sage} /> : ri.checkedInRun ? <Check size={14} color={k.onAccent} /> : null}
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[s.itemName, { color: k.text, textDecorationLine: ri.checkedInRun ? 'line-through' : 'none', opacity: ri.checkedInRun ? 0.5 : 1 }]}
                  numberOfLines={1}
                >
                  {ri.item?.name ?? ri.itemId}
                </Text>
                <Text style={[s.itemMeta, { color: k.textFaint }]} numberOfLines={1}>
                  {[ri.item?.quantity, addedBy].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Pressable
                onPress={() => removeItemFromRun(run.id, ri.itemId)}
                hitSlop={10}
                style={s.removeBtn}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${ri.item?.name ?? 'item'} from this trip`}
                accessibilityHint="Removes it from this run only, not the grocery list"
              >
                <X size={16} color={k.textFaint} />
              </Pressable>
            </View>
          );
        })
      )}
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xl },
  emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: KIOSK_SPACE.lg },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control, paddingVertical: KIOSK_SPACE.sm,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  itemName: { fontSize: 14, fontWeight: '700' },
  itemMeta: { fontSize: 11.5, marginTop: 2 },
  removeBtn: { padding: 4 },
});
