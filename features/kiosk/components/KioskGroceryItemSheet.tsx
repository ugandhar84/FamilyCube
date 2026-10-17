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
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { ShoppingCart, Trash2, Sparkles } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { showToast } from '@/components/AppToast';
import type { GroceryItem } from '@/store/groceryStore';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { CATEGORIES, CAT_EMOJI, QUICK_SUGGESTIONS } from '@/features/grocery/components/types';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, kioskInputStyle } from './KioskFormDrawer';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';

/* Module-level so a re-render never remounts it (and drops the keyboard). */
function PChip({ label, on, onPress, tone }: { label: string; on: boolean; onPress: () => void; tone: { card: string; fg: string } }) {
  const { k } = useKioskColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={[s.pchip, { backgroundColor: on ? k.primary : tone.card }]}>
      <Text style={[s.pchipT, { color: on ? k.onPrimary : tone.fg }]}>{label}</Text>
    </Pressable>
  );
}

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
  const pastels = kioskPastels(k);
  const members = useFamilyStore(st => st.members);
  const pinned = useGroceryStore(st => st.pinnedStores);
  const [staples, setStaples] = useState<{ name: string; cat: string; emoji: string }[]>([]);

  // Same store-pill source as KioskGroceryRequestSheet/AddItemSheet: real
  // past-run stores first (what this family actually shops at), the app's
  // generic defaults filling in the rest.
  const storePool = [...new Set([...Object.keys(pinned ?? {}), ...pastStores, ...DEFAULT_GROCERY_STORES])]
    .sort((a, b) => Number(!!pinned?.[b]) - Number(!!pinned?.[a])).slice(0, 9);

  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [cat, setCat] = useState('');
  const [store, setStore] = useState('');
  const [notes, setNotes] = useState('');
  // Had a manual `if (!canSubmit || saving) return;` — still just a
  // `useState` read, not synchronous, so a fast double-tap on "Add to
  // List"/"Save Changes" could fire addItem/updateItem twice, adding the
  // same grocery item twice [live-requested app-wide: "We should avoid
  // double tab submit for all the app wide"]. Same fix as AddItemSheet.tsx's
  // own copy of this state.
  const { submitting: saving, guard } = useSubmitGuard();
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

  useEffect(() => {
    if (!visible || isEdit || !familyId) return;
    Promise.resolve(supabase.from('grocery_staples').select('name, category, times_bought').eq('family_id', familyId).order('times_bought', { ascending: false }).limit(20))
      .then(({ data }) => setStaples((data ?? []).map((x: any) => ({ name: x.name, cat: x.category ?? '', emoji: CAT_EMOJI[x.category ?? ''] ?? '🛒' }))))
      .catch(() => {});
  }, [visible, isEdit, familyId]);

  const input = kioskInputStyle(k);
  const canSubmit = name.trim().length > 0;

  const submit = guard(async () => {
    if (!canSubmit) return;
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
    showToast(isEdit ? 'Item updated' : 'Item added');
    onClose();
  });

  const handleDeletePress = async () => {
    if (!item) return;
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setDeleting(true);
    await removeItem(item.id);
    setDeleting(false);
    onClose();
  };

  const suggestionPool = (() => {
    const seen = new Set(staples.map(x => x.name.toLowerCase()));
    return [...staples, ...QUICK_SUGGESTIONS.filter(x => !seen.has(x.name.toLowerCase()))];
  })();
  const filteredSuggestions = name.trim().length > 0
    ? suggestionPool.filter(su => su.name.toLowerCase().startsWith(name.toLowerCase()))
    : suggestionPool;
  const adder = members.find(m => m.id === item?.addedBy);

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title={isEdit ? (item?.name ?? 'Edit item') : 'Add to List'}
      subtitle={isEdit ? [item?.quantity, adder ? `added by ${adder.name.split(' ')[0]}` : ''].filter(Boolean).join(' · ') || 'Update item details' : 'Type a name or tap a suggestion'}
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
      {isEdit && item?.aiGenerated && (
        <View style={[s.banner, { backgroundColor: k.pastelLavCard }]}>
          <Sparkles size={18} color={k.purple} />
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerT, { color: k.purple }]}>Suggested by AI</Text>
            <Text style={[s.bannerS, { color: k.textMuted }]}>From your staples and recent receipts</Text>
          </View>
        </View>
      )}

      {/* ── Name ── */}
      <View style={s.section}>
        <KioskFieldLabel k={k}>ITEM NAME</KioskFieldLabel>
        <TextInput
          style={input}
          placeholder="e.g. Milk, Rice, Turmeric"
          placeholderTextColor={k.textFaint}
          value={name}
          onChangeText={setName}
          // Kiosk forms shouldn't pop the on-screen keyboard on open — the
          // wall-mounted tablet is usually walked up to, not typed on
          // immediately (live-reported: "on the forms dont auto focus on
          // the texts inputs and open keyboard"). Matches KioskAskSheet's
          // own explicit autoFocus={false}.
          autoFocus={false}
          accessibilityLabel="Item name"
        />
      </View>

      {/* ── Quick suggestions — create mode only, same as AddItemSheet ── */}
      {!isEdit && filteredSuggestions.length > 0 && (
        <View style={s.section}>
          <KioskFieldLabel k={k}>QUICK ADD</KioskFieldLabel>
          <View style={s.chipRow}>
            {filteredSuggestions.slice(0, 14).map((su, i) => (
              <PChip key={su.name} label={`${su.emoji} ${su.name}`} on={name === su.name} tone={pastels[i % 4]} onPress={() => { setName(su.name); setCat(su.cat); }} />
            ))}
          </View>
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
        <View style={s.chipRow}>
          {storePool.map((st, i) => (
            <PChip key={st} label={`${pinned?.[st] ? '📍' : '🏪'} ${st}`} on={store === st} tone={pastels[(i + 1) % 4]} onPress={() => setStore(store === st ? '' : st)} />
          ))}
        </View>
      )}

      {/* ── Category ── */}
      <View style={s.section}>
        <KioskFieldLabel k={k}>CATEGORY</KioskFieldLabel>
        <View style={s.chipRow}>
          {CATEGORIES.map((c, i) => (
            <PChip key={c} label={`${CAT_EMOJI[c] ?? '📦'} ${c}`} on={cat === c} tone={pastels[i % 4]} onPress={() => setCat(cat === c ? '' : c)} />
          ))}
        </View>
      </View>

      {isEdit && item?.estimatedPrice != null && (
        <View style={s.section}>
          <KioskFieldLabel k={k}>PRICE</KioskFieldLabel>
          <View style={[s.banner, { backgroundColor: k.pastelSageCard, justifyContent: 'space-between' }]}>
            <Text style={[s.priceBig, { color: k.text }]}>${item.estimatedPrice.toFixed(2)}</Text>
            <View style={[s.pill2, { backgroundColor: k.card }]}><Text style={[s.bannerS, { color: k.textMuted, fontWeight: '800' }]}>{item.priceSource === 'receipt' ? 'From a receipt' : 'Estimated'}</Text></View>
          </View>
        </View>
      )}

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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  pchip: { minHeight: 44, borderRadius: 100, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  pchipT: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 12 },
  bannerT: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  bannerS: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  priceBig: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  pill2: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
  },
  deleteConfirmText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
});
