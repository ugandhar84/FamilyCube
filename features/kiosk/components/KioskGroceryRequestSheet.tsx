/**
 * KioskGroceryRequestSheet — kiosk-native replacement for KidModals.tsx's
 * GroceryModal.
 *
 * Same request, same store writes, narrow right-anchored drawer instead of
 * a full-bleed phone bottom sheet. The phone component is untouched and
 * still serves every phone caller; this exists because a phone Modal's
 * backdrop is sized by the native modal window and therefore cannot be
 * narrowed from the kiosk side (see KioskFormDrawer's header).
 *
 * ── Submission parity with GroceryModal (verified line by line) ─────────
 *   • builds KidRequestItem[] from the non-blank lines, with the SAME
 *     shape: id `item-${Date.now()}-${i}`, trimmed name/qty, category
 *     falling back to the global category, store trimmed-or-undefined,
 *     emoji, status 'pending', requestedBy active.id.
 *   • looks for an existing PENDING delegation request from this member
 *     that has items and is NOT a supplies request (same predicate,
 *     including the SUPPLIES_PREFIX exclusion) and appendItems() onto it
 *     rather than opening a second one.
 *   • otherwise sendRequest({ type:'delegation', urgency:'normal',
 *     detail: encodeGroceryRequest({ name: joined names, qty:'',
 *     category:'Multi', notes }), items }) — the same encoder the parent's
 *     HelpDispatchQueue/history decode with, so a kiosk request is
 *     indistinguishable from a phone one in the approval flow.
 *   • approval-pending semantics unchanged: items go out as 'pending' and
 *     a parent still approves each one.
 *
 * ── What is intentionally NOT ported ────────────────────────────────────
 * The phone row's inline MIC is a real feature, not decorative — each row
 * mounts its own useVoiceDictation() session (ItemNameField in
 * KidModals.tsx) so a kid can speak item names. It is dropped for v1 here
 * on purpose: dictation needs a mic permission prompt and a per-user
 * speech session, and a kiosk is a SHARED, wall-mounted device that is
 * frequently out of arm's reach and in a noisy kitchen — the failure mode
 * (a half-captured item on a device nobody is holding) is worse than
 * typing on a large on-screen keyboard. Nothing about the submission
 * depends on it. If it is wanted later, the hook is portable as-is.
 *
 * Quick picks are the same hardcoded ALL_GROCERY_SUGGESTIONS table the
 * phone uses (a static list in KidModals.tsx, not data-driven) — re-exported
 * from there would mean importing the phone module, so kiosk keeps a
 * category-tagged copy of the same names below. The store quick-pick row IS
 * data-driven: it reads groceryStore.pastStores merged with
 * DEFAULT_GROCERY_STORES, exactly as the phone does.
 *
 * ── Shape: 'drawer' (deliberately NOT shrunk) ───────────────────────────
 * Reviewed in the dialog/drawer resize pass and kept full-height — this is
 * the heaviest of the non-wizard forms. Above the item list alone there is
 * a full wrapped CATEGORY pill row; each item row then carries name + qty
 * + remove plus its own suggestion strip, and "Add item" grows the list
 * without limit. This is the case the shared shell's sticky footer was
 * built for. A centered dialog here would sit at maxHeight from the second
 * item onward, so the drawer is the honest shape.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { ShoppingCart, X, Plus } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { KidRequestItem } from '@/store/kidRequestStore';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';

// Same prefix constant KidModals.tsx defines. Duplicated rather than
// imported so kiosk carries no import edge into the phone modal module;
// the value is a wire format shared with the parent's decoders, so it must
// stay byte-identical to KidModals.tsx's SUPPLIES_PREFIX.
const SUPPLIES_PREFIX = 'SUPPLIES_REQUEST:';
const GROCERY_PREFIX = 'GROCERY_REQUEST:';

/** Byte-identical to KidModals.tsx's encodeGroceryRequest. */
function encodeGroceryRequest(p: { name: string; qty: string; category: string; notes: string }) {
  return `${GROCERY_PREFIX}${JSON.stringify(p)}`;
}

const CATEGORIES = ['Snacks', 'Produce', 'Dairy & Eggs', 'Pantry', 'Frozen', 'Bakery', 'Household', 'Other'];

// Same names/emoji/categories as KidModals.tsx's ALL_GROCERY_SUGGESTIONS.
const SUGGESTIONS: { name: string; emoji: string; category: string }[] = [
  { name: 'Oreos', emoji: '🍪', category: 'Snacks' },
  { name: 'Chips', emoji: '🍟', category: 'Snacks' },
  { name: 'Fruit Snacks', emoji: '🍬', category: 'Snacks' },
  { name: 'Granola Bars', emoji: '🌾', category: 'Snacks' },
  { name: 'Popcorn', emoji: '🍿', category: 'Snacks' },
  { name: 'String Cheese', emoji: '🧀', category: 'Snacks' },
  { name: 'Gummy Bears', emoji: '🐻', category: 'Snacks' },
  { name: 'Goldfish', emoji: '🐠', category: 'Snacks' },
  { name: 'Pretzels', emoji: '🥨', category: 'Snacks' },
  { name: 'Cheez-Its', emoji: '🧆', category: 'Snacks' },
  { name: 'Trail Mix', emoji: '🌰', category: 'Snacks' },
  { name: 'Doritos', emoji: '🔺', category: 'Snacks' },
  { name: 'Pringles', emoji: '🥫', category: 'Snacks' },
  { name: 'Nutella', emoji: '🍫', category: 'Snacks' },
  { name: 'Apples', emoji: '🍎', category: 'Produce' },
  { name: 'Bananas', emoji: '🍌', category: 'Produce' },
  { name: 'Grapes', emoji: '🍇', category: 'Produce' },
  { name: 'Strawberries', emoji: '🍓', category: 'Produce' },
  { name: 'Blueberries', emoji: '🫐', category: 'Produce' },
  { name: 'Watermelon', emoji: '🍉', category: 'Produce' },
  { name: 'Oranges', emoji: '🍊', category: 'Produce' },
  { name: 'Carrots', emoji: '🥕', category: 'Produce' },
  { name: 'Cucumber', emoji: '🥒', category: 'Produce' },
  { name: 'Cherry Tomatoes', emoji: '🍅', category: 'Produce' },
  { name: 'Chocolate Milk', emoji: '🍫', category: 'Dairy & Eggs' },
  { name: 'Gogurt', emoji: '🥛', category: 'Dairy & Eggs' },
  { name: 'Yogurt', emoji: '🫙', category: 'Dairy & Eggs' },
  { name: 'Cheese Sticks', emoji: '🧀', category: 'Dairy & Eggs' },
  { name: 'Eggs', emoji: '🥚', category: 'Dairy & Eggs' },
  { name: 'Butter', emoji: '🧈', category: 'Dairy & Eggs' },
  { name: 'Peanut Butter', emoji: '🥜', category: 'Pantry' },
  { name: 'Jelly', emoji: '🫙', category: 'Pantry' },
  { name: 'Mac & Cheese', emoji: '🧀', category: 'Pantry' },
  { name: 'Cereal', emoji: '🥣', category: 'Pantry' },
  { name: 'Apple Juice', emoji: '🧃', category: 'Pantry' },
  { name: 'Orange Juice', emoji: '🍊', category: 'Pantry' },
  { name: 'Capri Sun', emoji: '🧃', category: 'Pantry' },
  { name: 'Ice Cream', emoji: '🍦', category: 'Frozen' },
  { name: 'Waffles', emoji: '🧇', category: 'Frozen' },
  { name: 'Frozen Pizza', emoji: '🍕', category: 'Frozen' },
  { name: 'Popsicles', emoji: '🧊', category: 'Frozen' },
  { name: 'Chicken Nuggets', emoji: '🍗', category: 'Frozen' },
  { name: 'Bread', emoji: '🍞', category: 'Bakery' },
  { name: 'Bagels', emoji: '🥯', category: 'Bakery' },
  { name: 'Muffins', emoji: '🧁', category: 'Bakery' },
  { name: 'Donuts', emoji: '🍩', category: 'Bakery' },
  { name: 'Cookies', emoji: '🍪', category: 'Bakery' },
  { name: 'Paper Towels', emoji: '🧻', category: 'Household' },
  { name: 'Dish Soap', emoji: '🧴', category: 'Household' },
  { name: 'Shampoo', emoji: '🚿', category: 'Household' },
  { name: 'Toothpaste', emoji: '🪥', category: 'Household' },
  { name: 'Toilet Paper', emoji: '🧻', category: 'Household' },
  { name: 'Trash Bags', emoji: '🗑️', category: 'Household' },
];

type Line = { name: string; qty: string; category: string; emoji: string; store: string };
const emptyLine = (category = 'Snacks'): Line => ({ name: '', qty: '', category, emoji: '🛒', store: '' });

export function KioskGroceryRequestSheet({ visible, onClose, active }: {
  visible: boolean; onClose: () => void; active: FamilyMember;
}) {
  const { k } = useKioskColors();
  const { sendRequest, requests, appendItems } = useKidRequestStore();
  const pastStores = useGroceryStore(st => st.pastStores);
  const storePool = [...new Set([...pastStores, ...DEFAULT_GROCERY_STORES])].slice(0, 6);

  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [globalCat, setGlobalCat] = useState('Snacks');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const accent = k.sage;
  const input = kioskInputStyle(k);

  const validLines = lines.filter(l => l.name.trim());
  const canSubmit = validLines.length > 0;

  const reset = () => { setLines([emptyLine()]); setGlobalCat('Snacks'); setNotes(''); setBusy(false); };
  const dismiss = () => { reset(); onClose(); };

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const addLine = () => setLines(prev => [...prev, emptyLine(globalCat)]);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    const newItems: KidRequestItem[] = validLines.map((l, i) => ({
      id: `item-${Date.now()}-${i}`,
      name: l.name.trim(),
      qty: l.qty.trim(),
      category: l.category || globalCat,
      store: l.store.trim() || undefined,
      emoji: l.emoji,
      status: 'pending',
      requestedBy: active.id,
    }));
    // Same append-to-existing predicate GroceryModal uses.
    const existing = requests.find(r =>
      r.fromMemberId === active.id && r.status === 'pending' &&
      r.type === 'delegation' && (r.items?.length ?? 0) > 0 &&
      !r.detail.startsWith(SUPPLIES_PREFIX)
    );
    const n = newItems.length;
    const plural = n > 1 ? 's' : '';
    try {
      if (existing) {
        await appendItems(existing.id, newItems);
        dismiss();
        Alert.alert('Added! 🛒', `${n} item${plural} added to your existing grocery request.`);
      } else {
        await sendRequest({
          type: 'delegation',
          fromMemberId: active.id,
          urgency: 'normal',
          detail: encodeGroceryRequest({
            name: validLines.map(l => l.name.trim()).join(', '),
            qty: '',
            category: 'Multi',
            notes: notes.trim(),
          }),
          items: newItems,
        });
        dismiss();
        Alert.alert('Request sent! 🛒', `${n} item${plural} sent to parent for approval.`);
      }
    } catch {
      setBusy(false);
      Alert.alert("Couldn't send", 'Try that again in a moment.');
    }
  };

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title="Request Groceries"
      subtitle={canSubmit
        ? `${validLines.length} item${validLines.length > 1 ? 's' : ''} · parent approves each one`
        : 'Parent approves before items are added'}
      accent={accent}
      Icon={ShoppingCart}
      k={k}
      onClose={dismiss}
      onSubmit={submit}
      canSubmit={canSubmit}
      submitting={busy}
      submitLabel={canSubmit
        ? `Send ${validLines.length} item${validLines.length > 1 ? 's' : ''} to Parent`
        : 'Add at least one item'}
    >
      {/* ── Category ── */}
      <View style={s.section}>
        <KioskFieldLabel k={k}>CATEGORY</KioskFieldLabel>
        <View style={s.wrap}>
          {CATEGORIES.map(c => (
            <KioskPill
              key={c} label={c} selected={globalCat === c} accent={accent} k={k}
              onPress={() => setGlobalCat(c)}
              hint="Sets the category for new items"
            />
          ))}
        </View>
      </View>

      {/* ── Items ── */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <KioskFieldLabel k={k}>ITEMS LIST</KioskFieldLabel>
          <Pressable
            onPressIn={addLine}
            style={({ pressed }) => [s.addBtn, { backgroundColor: pressed ? k.cardHover : accent + '1F', borderColor: accent + '3D' }]}
            accessibilityRole="button"
            accessibilityLabel="Add item"
            accessibilityHint="Adds another blank item row"
          >
            <Plus size={16} color={accent} />
            <Text style={[s.addText, { color: accent }]} numberOfLines={1}>Add item</Text>
          </Pressable>
        </View>

        {lines.length === 0 ? (
          <Pressable
            onPressIn={addLine}
            style={[s.empty, { borderColor: accent + '55' }]}
            accessibilityRole="button"
            accessibilityLabel="Tap to add grocery items"
          >
            <Text style={[s.emptyText, { color: accent }]}>+ Tap to add grocery items</Text>
          </Pressable>
        ) : lines.map((line, idx) => {
          const q = line.name.trim().toLowerCase();
          const picks = q
            ? SUGGESTIONS.filter(su => su.name.toLowerCase().includes(q) && su.name.toLowerCase() !== q).slice(0, 8)
            : SUGGESTIONS.filter(su => su.category === globalCat).slice(0, 10);
          return (
            <View key={idx} style={[s.lineCard, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
              <View style={s.lineRow}>
                <TextInput
                  style={[input, { flex: 2.4, backgroundColor: k.card }]}
                  placeholder="Item name"
                  placeholderTextColor={k.textFaint}
                  value={line.name}
                  onChangeText={v => updateLine(idx, { name: v })}
                  accessibilityLabel={`Item ${idx + 1} name`}
                />
                <TextInput
                  style={[input, { flex: 1, backgroundColor: k.card }]}
                  placeholder="Qty"
                  placeholderTextColor={k.textFaint}
                  value={line.qty}
                  onChangeText={v => updateLine(idx, { qty: v })}
                  accessibilityLabel={`Item ${idx + 1} quantity`}
                />
                <Pressable
                  onPressIn={() => removeLine(idx)}
                  hitSlop={10}
                  style={[s.removeBtn, { borderColor: k.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove item ${idx + 1}`}
                >
                  <X size={18} color={k.textMuted} />
                </Pressable>
              </View>

              {storePool.length > 0 && (
                <ScrollView
                  horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chipRow} keyboardShouldPersistTaps="always"
                >
                  {storePool.map(st => (
                    <KioskPill
                      key={st} label={`🏪 ${st}`} selected={line.store === st} accent={accent} k={k}
                      onPress={() => updateLine(idx, { store: line.store === st ? '' : st })}
                      hint="Optional preferred store — tap again to clear"
                    />
                  ))}
                </ScrollView>
              )}

              {picks.length > 0 && (
                <View style={{ gap: KIOSK_SPACE.xs }}>
                  <Text style={[s.pickLabel, { color: k.textFaint }]} numberOfLines={1}>
                    {q ? 'Matching — tap to fill' : 'Quick picks'}
                  </Text>
                  <ScrollView
                    horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.chipRow} keyboardShouldPersistTaps="always"
                  >
                    {picks.map(su => (
                      <KioskPill
                        key={su.name} label={`${su.emoji} ${su.name}`} selected={line.name === su.name}
                        accent={accent} k={k}
                        onPress={() => updateLine(idx, { name: su.name, emoji: su.emoji, category: su.category })}
                        hint="Fills this item row"
                      />
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* ── Note ── */}
      <View style={s.section}>
        <KioskFieldLabel k={k}>NOTE FOR PARENT (OPTIONAL)</KioskFieldLabel>
        <TextInput
          style={[input, { minHeight: 88, textAlignVertical: 'top' }]}
          placeholder="e.g. get the name-brand ones, not store brand"
          placeholderTextColor={k.textFaint}
          value={notes}
          onChangeText={setNotes}
          multiline
          accessibilityLabel="Note for parent"
        />
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIOSK_SPACE.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  chipRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, paddingRight: KIOSK_SPACE.md },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.md,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
  },
  addText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  empty: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: KIOSK_RADIUS.md,
    paddingVertical: KIOSK_SPACE.lg, alignItems: 'center',
  },
  emptyText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  lineCard: {
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    padding: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm,
  },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  removeBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  pickLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 0.4 },
});
