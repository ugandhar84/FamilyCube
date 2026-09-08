/**
 * KioskStoreMoveSheet — kiosk-native quick "move to store," matching the
 * real intent behind features/grocery/components/ItemCard.tsx's onMoveStore
 * button + StorePickerSheet.tsx: a one-tap way to reassign a single item's
 * store WITHOUT opening the full edit sheet for a change that's really just
 * "this belongs at Costco, not Target."
 *
 * ItemCard.tsx's own comment on onMoveStore explains why the phone prefers
 * a tap-a-button-then-pick-from-a-list model over a drag gesture: "dragging
 * a row between store sections that may be scrolled off-screen is fragile
 * on a phone; tapping a fixed button and picking from a list works the same
 * regardless of scroll position." That reasoning applies even more directly
 * to a kiosk (no drag affordance is discoverable on a wall-mounted display,
 * and a family member's hands are often full) — so kiosk gets the SAME tap-
 * to-pick model, not the phone's separate drag-and-drop layer
 * (GroceryItemsSection.tsx's DraggableItemRow), which is real but purely a
 * power-user shortcut on top of the same underlying store write.
 *
 * Actually reassigning uses the same real store/groceryStore.ts action this
 * whole feature set already runs on — updateItem(itemId, { storePreference
 * }) — the exact write StorePickerSheet.tsx's own handleStoreSelect makes.
 * A dedicated small dialog rather than reusing KioskGroceryItemSheet's full
 * edit form: this is a single-field, single-tap decision, which is the
 * short/fixed case KioskFormDrawer's own header calls out for its 'dialog'
 * variant (as opposed to KioskGroceryItemSheet's 'drawer', which is right
 * for that form's real length).
 *
 * Not ported: StorePickerSheet's free-text search input and "add a brand-
 * new store name" flow. A kiosk pill grid of the real known stores
 * (pastStores + DEFAULT_GROCERY_STORES, the same pool every other kiosk
 * grocery form already draws from) covers the same real stores a family
 * actually uses; typing a wholly new store name for a single-item move is
 * a rare enough case that KioskGroceryItemSheet's own store TextInput
 * (which this quick sheet intentionally doesn't duplicate) already covers
 * it during a full edit.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Store } from 'lucide-react-native';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, KioskPill } from './KioskFormDrawer';

export function KioskStoreMoveSheet({ visible, onClose, itemId, itemIds, itemName, currentStore }: {
  visible: boolean;
  onClose: () => void;
  /** Single-item move (existing per-row "Move" action). */
  itemId?: string;
  /** Multi-item move — the long-press bulk-select toolbar's own "Move"
   * action [live-requested: "then introduce multiple items move like we
   * have long press already use it" — the store-section scroll cap
   * disables per-row drag-to-move-store once a section overflows, so
   * that same real bulk-select mode (already built for Delete) needed a
   * Move action too, rather than leaving move unreachable for a long
   * store section]. Takes priority over `itemId` when both are passed. */
  itemIds?: string[];
  itemName: string;
  currentStore?: string;
}) {
  const { k } = useKioskColors();
  const updateItem = useGroceryStore(s => s.updateItem);
  const pastStores = useGroceryStore(s => s.pastStores);
  const accent = k.primary;
  const targetIds = itemIds && itemIds.length > 0 ? itemIds : (itemId ? [itemId] : []);

  const storePool = useMemo(
    () => [...new Set([...pastStores, ...DEFAULT_GROCERY_STORES])],
    [pastStores],
  );

  const move = async (store: string | undefined) => {
    await Promise.all(targetIds.map(id => updateItem(id, { storePreference: store })));
    onClose();
  };

  return (
    <KioskFormDrawer
      visible={visible}
      variant="dialog"
      title="Move to Store"
      subtitle={itemName}
      accent={accent}
      Icon={Store}
      k={k}
      onClose={onClose}
    >
      <View style={s.section}>
        <KioskFieldLabel k={k}>PICK A STORE</KioskFieldLabel>
        <ScrollView contentContainerStyle={s.grid} keyboardShouldPersistTaps="always">
          {!!currentStore && (
            <KioskPill
              label="Any store (no preference)"
              selected={false}
              accent={accent}
              k={k}
              onPress={() => move(undefined)}
              hint="Clears this item's store preference"
            />
          )}
          {storePool.filter(st => st !== currentStore).map(st => (
            <KioskPill
              key={st}
              label={`🏪 ${st}`}
              selected={false}
              accent={accent}
              k={k}
              onPress={() => move(st)}
            />
          ))}
        </ScrollView>
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
});
