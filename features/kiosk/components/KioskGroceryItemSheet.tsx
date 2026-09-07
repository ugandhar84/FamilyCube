/**
 * KioskGroceryItemSheet — kiosk-native add/edit/delete for one grocery item,
 * closing the last real CRUD gap between kiosk and the phone's own
 * GroceryScreen (features/grocery/GroceryScreen.tsx + AddItemSheet.tsx).
 *
 * Before this, kiosk could only Create (a bare name via the inline add row)
 * and Buy/Read. The phone's own list additionally lets you edit an item's
 * quantity/category/store/notes (and, via a raw Supabase call the phone's
 * AddItemSheet makes that bypasses the store, its name) and delete it
 * outright with a confirm step. Live-requested: "100% parity except start
 * run, since it stays at kitchen" — kiosk is a fixed kitchen display, so the
 * one real phone affordance intentionally NOT ported is starting/opening a
 * shopping run (CreateRunSheet/RunDetailSheet) — everything else about a
 * single grocery item is now here.
 *
 * ── Store parity note ───────────────────────────────────────────────────
 * store/groceryStore.ts's updateItem originally only patched quantity/
 * category/storePreference/notes — its own type excluded `name`, because
 * the phone's AddItemSheet edits a name by writing straight to
 * `grocery_items` itself rather than going through the store. That was a
 * real gap in the shared store, not a kiosk-specific one, so updateItem's
 * patch type was widened here to include `name` — this sheet is the first
 * caller to use it, and the phone could switch to it too without any
 * behavior change (same table, same column).
 *
 * ── Delete parity ───────────────────────────────────────────────────────
 * The phone confirms via Alert.alert('Remove item?', `"${name}"`, [Cancel,
 * destructive Remove]) before calling removeItem. Reproduced here as an
 * in-sheet two-step (tap Delete → the button itself turns into a Confirm
 * delete state) rather than a native Alert, since a kiosk's Modal-in-Modal
 * stacking is exactly what KioskFormDrawer's own header already flags as
 * the reason every other kiosk form avoids nesting a second native dialog.
 *
 * ── Shape: 'drawer', same as the kid's own grocery-request form ─────────
 * Live-requested: "we can use the side narrow form similar to the school
 * supplies in the kids account" — a narrow right-anchored drawer, not a
 * centered dialog. The closer, same-domain reference actually already in
 * this file is KioskGroceryRequestSheet (a kid's own "Request Groceries"
 * form): same 'drawer' shape, and this sheet reuses that file's exact
 * store-picker pattern — a real pill row sourced from
 * groceryStore.pastStores merged with DEFAULT_GROCERY_STORES, the same
 * two sources AddItemSheet's own store-suggestion chips pull from on the
 * phone — rather than a bare free-text field.
 *
 * The shape call itself matches KioskFormDrawer's own stated rule: this
 * form has real length (name, quick-suggestions, quantity+store, a store
 * pill row, category pills, notes) rather than the short fixed two-or-
 * three-field case a dialog suits, so 'drawer' is correct by the same
 * reasoning KioskGroceryRequestSheet and KioskSuppliesRequestSheet both
 * already document.
 *
 * ── Not ported: AddItemSheet's AI quick-suggestions strip ───────────────
 * That calls the grocery-ai-suggest edge function for personalized
 * autocomplete while typing a NEW item's name — a nice-to-have for typing
 * speed on a phone keyboard, not a CRUD operation. Kiosk's existing plain
 * quick-add row (KioskMealsTab/KioskOverviewTab) stays as is; this sheet
 * is reached from an existing row (edit) or a blank add (create), and its
 * own QUICK_SUGGESTIONS strip (the same static table AddItemSheet falls
 * back to before AI suggestions load) covers create mode.
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ShoppingCart, Trash2 } from 'lucide-react-native';
import type { GroceryItem } from '@/store/groceryStore';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { CATEGORIES, CAT_EMOJI, QUICK_SUGGESTIONS } from '@/features/grocery/components/types';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';

export function KioskGroceryItemSheet({ visible, onClose, familyId, memberId, item }: {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  memberId: string;
  /** Omit for "add a new item"; pass a real item for "edit this item". */
  item?: GroceryItem;
}) {
  const { k } = useKioskColors();
  const addItem = useGroceryStore(s => s.addItem);
  const updateItem = useGroceryStore(s => s.updateItem);
  const removeItem = useGroceryStore(s => s.removeItem);
  const pastStores = useGroceryStore(s => s.pastStores);
  const isEdit = !!item;
  const accent = k.sage;

  // Same store-pill source as KioskGroceryRequestSheet/AddItemSheet: real
  // past-run stores first (what this family actually shops at), the app's
  // generic defaults filling in the rest.
  const storePool = [...new Set([...pastStores, ...DEFAULT_GROCERY_STORES])].slice(0, 8);

  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [cat, setCat] = useState('');
  const [store, setStore] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Same populate-on-open/reset-on-open pattern as AddItemSheet.
  useEffect(() => {
    if (!visible) return;
    if (item) {
      setName(item.name);
      setQty(item.quantity ?? '');
      setCat(item.category ?? '');
      setStore(item.storePreference ?? '');
      setNotes(item.notes ?? '');
    } else {
      setName(''); setQty(''); setCat(''); setStore(''); setNotes('');
    }
    setConfirmingDelete(false);
  }, [visible, item]);

  const input = kioskInputStyle(k);
  const canSubmit = name.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    if (isEdit && item) {
      await updateItem(item.id, {
        name: name.trim(),
        quantity: qty.trim() || undefined,
        category: cat || undefined,
        storePreference: store.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      await addItem({
        familyId, name: name.trim(),
        quantity: qty.trim() || undefined,
        category: cat || undefined,
        storePreference: store.trim() || undefined,
        addedBy: memberId,
        notes: notes.trim() || undefined,
      });
    }
    setSaving(false);
    onClose();
  };

  const handleDeletePress = async () => {
    if (!item) return;
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setDeleting(true);
    await removeItem(item.id);
    setDeleting(false);
    onClose();
  };

  const filteredSuggestions = name.trim().length > 0
    ? QUICK_SUGGESTIONS.filter(su => su.name.toLowerCase().startsWith(name.toLowerCase()))
    : QUICK_SUGGESTIONS;

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title={isEdit ? 'Edit Item' : 'Add to List'}
      subtitle={isEdit ? 'Update item details' : 'Type a name or tap a suggestion'}
      accent={accent}
      Icon={ShoppingCart}
      k={k}
      onClose={onClose}
      onSubmit={submit}
      canSubmit={canSubmit}
      submitting={saving}
      submitLabel={isEdit ? 'Save Changes' : 'Add to List'}
      headerRight={isEdit ? (
        <Pressable
          onPress={handleDeletePress}
          disabled={deleting}
          style={({ pressed }) => [
            s.deleteBtn,
            {
              backgroundColor: confirmingDelete ? k.danger : (pressed ? k.cardHover : k.well),
              borderColor: confirmingDelete ? k.danger : k.cardBorder,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={confirmingDelete ? 'Confirm delete item' : 'Delete item'}
          accessibilityHint={confirmingDelete ? 'Tap again to permanently remove this item' : 'Removes this item from the list'}
        >
          <Trash2 size={18} color={confirmingDelete ? k.onAccent : k.textMuted} />
          {confirmingDelete && (
            <Text style={[s.deleteConfirmText, { color: k.onAccent }]} numberOfLines={1}>Confirm?</Text>
          )}
        </Pressable>
      ) : undefined}
    >
      {/* ── Name ── */}
      <View style={s.section}>
        <KioskFieldLabel k={k}>ITEM NAME</KioskFieldLabel>
        <TextInput
          style={input}
          placeholder="e.g. Milk, Rice, Turmeric"
          placeholderTextColor={k.textFaint}
          value={name}
          onChangeText={setName}
          autoFocus={!isEdit}
          accessibilityLabel="Item name"
        />
      </View>

      {/* ── Quick suggestions — create mode only, same as AddItemSheet ── */}
      {!isEdit && filteredSuggestions.length > 0 && (
        <View style={s.section}>
          <KioskFieldLabel k={k}>QUICK ADD</KioskFieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} keyboardShouldPersistTaps="always">
            {filteredSuggestions.slice(0, 14).map(su => (
              <KioskPill
                key={su.name}
                label={`${su.emoji} ${su.name}`}
                selected={name === su.name}
                accent={accent}
                k={k}
                onPress={() => { setName(su.name); setCat(su.cat); }}
                hint="Fills the item name and category"
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Quantity + Store ── */}
      <View style={s.row}>
        <View style={[s.section, { flex: 1 }]}>
          <KioskFieldLabel k={k}>QUANTITY</KioskFieldLabel>
          <TextInput
            style={input}
            placeholder="2 kg, 1 dozen…"
            placeholderTextColor={k.textFaint}
            value={qty}
            onChangeText={setQty}
            accessibilityLabel="Quantity"
          />
        </View>
        <View style={[s.section, { flex: 1.2 }]}>
          <KioskFieldLabel k={k}>STORE (OPTIONAL)</KioskFieldLabel>
          <TextInput
            style={input}
            placeholder="Costco, Target…"
            placeholderTextColor={k.textFaint}
            value={store}
            onChangeText={setStore}
            accessibilityLabel="Preferred store"
          />
        </View>
      </View>

      {/* Same store-pill row as KioskGroceryRequestSheet's own store
          picker — a real remembered/default store is one tap, typing
          stays available above for anything not in the pool. */}
      {storePool.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} keyboardShouldPersistTaps="always">
          {storePool.map(st => (
            <KioskPill
              key={st}
              label={`🏪 ${st}`}
              selected={store === st}
              accent={accent}
              k={k}
              onPress={() => setStore(store === st ? '' : st)}
              hint="Sets the preferred store — tap again to clear"
            />
          ))}
        </ScrollView>
      )}

      {/* ── Category ── */}
      <View style={s.section}>
        <KioskFieldLabel k={k}>CATEGORY</KioskFieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} keyboardShouldPersistTaps="always">
          {CATEGORIES.map(c => (
            <KioskPill
              key={c}
              label={`${CAT_EMOJI[c] ?? '📦'} ${c}`}
              selected={cat === c}
              accent={accent}
              k={k}
              onPress={() => setCat(cat === c ? '' : c)}
            />
          ))}
        </ScrollView>
      </View>

      {/* ── Notes ── */}
      <View style={s.section}>
        <KioskFieldLabel k={k}>NOTES (OPTIONAL)</KioskFieldLabel>
        <TextInput
          style={[input, { minHeight: 72, textAlignVertical: 'top' }]}
          placeholder="e.g. organic only, from Patel's"
          placeholderTextColor={k.textFaint}
          value={notes}
          onChangeText={setNotes}
          multiline
          accessibilityLabel="Notes"
        />
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
  row: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  chipRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, paddingRight: KIOSK_SPACE.md },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
  },
  deleteConfirmText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
});
