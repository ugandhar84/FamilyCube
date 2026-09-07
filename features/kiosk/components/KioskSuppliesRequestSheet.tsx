/**
 * KioskSuppliesRequestSheet — kiosk-native replacement for KidModals.tsx's
 * SuppliesModal. Narrow right-anchored drawer; identical submission.
 *
 * ── Submission parity with SuppliesModal (verified line by line) ────────
 *   • KidRequestItem[] from non-blank rows: id `item-${Date.now()}-${i}`,
 *     trimmed name/qty, category 'Supplies', status 'pending', requestedBy
 *     active.id.
 *   • appendItems() onto an existing PENDING delegation request from this
 *     member whose detail startsWith SUPPLIES_PREFIX, rather than opening
 *     a second one — same predicate.
 *   • otherwise sendRequest({ type:'delegation', urgency, detail:
 *     `SUPPLIES_REQUEST:${JSON.stringify({ items: validItems, notes,
 *     urgency })}`, items }) — byte-identical encoding, including the fact
 *     that `items` inside the JSON is the raw {name, qty} rows (NOT the
 *     KidRequestItem[]), which is what the parent's decoder reads.
 *   • urgency 'normal' | 'soon' is carried both on the request and inside
 *     the encoded detail, exactly as the phone does.
 *
 * The phone's per-row mic (useVoiceDictation) is deliberately not ported —
 * see KioskGroceryRequestSheet's header for the reasoning. Quick picks are
 * the same static SUPPLIES_SUGGESTIONS table.
 *
 * ── Shape: 'drawer' (deliberately NOT shrunk) ───────────────────────────
 * Reviewed in the dialog/drawer resize pass and kept full-height. Unlike
 * the Ask/proposal forms, this one's body GROWS without bound: "Add item"
 * appends another row, each row carrying a name field, a qty field, a
 * remove button and its own wrapped strip of quick-pick suggestions. A kid
 * listing a term's worth of supplies produces a genuinely long form, and
 * the sticky footer is what keeps Send reachable through it. A centered
 * dialog would spend most of a real session pinned at maxHeight with an
 * internally-scrolling body, which is a worse version of the same thing.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { BookOpen, X, Plus } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { KidRequestItem } from '@/store/kidRequestStore';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';

/** Must stay byte-identical to KidModals.tsx's SUPPLIES_PREFIX — wire format. */
const SUPPLIES_PREFIX = 'SUPPLIES_REQUEST:';

// Same names/emoji as KidModals.tsx's SUPPLIES_SUGGESTIONS.
const SUGGESTIONS: { name: string; emoji: string }[] = [
  { name: 'Pencils', emoji: '✏️' },
  { name: 'Pens', emoji: '🖊️' },
  { name: 'Eraser', emoji: '🧹' },
  { name: 'Notebook', emoji: '📓' },
  { name: 'Composition Book', emoji: '📔' },
  { name: 'Spiral Notebook', emoji: '🗒️' },
  { name: 'Folder', emoji: '📁' },
  { name: 'Binder', emoji: '📒' },
  { name: 'Glue Stick', emoji: '🖇️' },
  { name: 'Scissors', emoji: '✂️' },
  { name: 'Markers', emoji: '🖍️' },
  { name: 'Crayons', emoji: '🖍️' },
  { name: 'Ruler', emoji: '📏' },
  { name: 'Protractor', emoji: '📐' },
  { name: 'Highlighters', emoji: '✨' },
  { name: 'Index Cards', emoji: '🗂️' },
  { name: 'Colored Pencils', emoji: '🎨' },
  { name: 'Calculator', emoji: '🔢' },
  { name: 'Compass', emoji: '🧭' },
  { name: 'Pencil Case', emoji: '🎒' },
  { name: 'Backpack', emoji: '🎒' },
  { name: 'Tape', emoji: '📦' },
  { name: 'Stapler', emoji: '📌' },
  { name: 'Paper Clips', emoji: '📎' },
  { name: 'Sticky Notes', emoji: '🗒️' },
  { name: 'Graph Paper', emoji: '📊' },
  { name: 'Construction Paper', emoji: '🎨' },
  { name: 'Poster Board', emoji: '🖼️' },
  { name: 'Science Goggles', emoji: '🥽' },
  { name: 'Earbuds', emoji: '🎧' },
  { name: 'USB Drive', emoji: '💾' },
];

export function KioskSuppliesRequestSheet({ visible, onClose, active }: {
  visible: boolean; onClose: () => void; active: FamilyMember;
}) {
  const { k } = useKioskColors();
  const { sendRequest, requests, appendItems } = useKidRequestStore();

  const [items, setItems] = useState<{ name: string; qty: string }[]>([{ name: '', qty: '' }]);
  const [urgency, setUrgency] = useState<'normal' | 'soon'>('normal');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const accent = k.blue;
  const input = kioskInputStyle(k);

  const validItems = items.filter(i => i.name.trim());
  const canSubmit = validItems.length > 0;

  const reset = () => { setItems([{ name: '', qty: '' }]); setUrgency('normal'); setNotes(''); setBusy(false); };
  const dismiss = () => { reset(); onClose(); };

  const updateItem = (idx: number, field: 'name' | 'qty', val: string) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: val } : it)));
  const addRow = () => setItems(prev => [...prev, { name: '', qty: '' }]);
  const removeRow = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    const newItems: KidRequestItem[] = validItems.map((it, i) => ({
      id: `item-${Date.now()}-${i}`,
      name: it.name.trim(),
      qty: it.qty.trim(),
      category: 'Supplies',
      status: 'pending',
      requestedBy: active.id,
    }));
    const existing = requests.find(r =>
      r.fromMemberId === active.id && r.status === 'pending' &&
      r.type === 'delegation' && r.detail.startsWith(SUPPLIES_PREFIX)
    );
    const n = newItems.length;
    const plural = n > 1 ? 's' : '';
    try {
      if (existing) {
        await appendItems(existing.id, newItems);
        dismiss();
        Alert.alert('Added! 📚', `${n} item${plural} added to your existing supplies request.`);
      } else {
        await sendRequest({
          type: 'delegation',
          fromMemberId: active.id,
          urgency,
          detail: `${SUPPLIES_PREFIX}${JSON.stringify({ items: validItems, notes: notes.trim(), urgency })}`,
          items: newItems,
        });
        dismiss();
        Alert.alert('Sent! 📚', `${n} item${plural} sent to parent for approval.`);
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
      title="School Supplies"
      subtitle="Parent approves and picks these up for you"
      accent={accent}
      Icon={BookOpen}
      k={k}
      onClose={dismiss}
      onSubmit={submit}
      canSubmit={canSubmit}
      submitting={busy}
      submitLabel={`Send to Parent (${validItems.length} item${validItems.length !== 1 ? 's' : ''})`}
    >
      {/* ── Urgency ── */}
      <View style={s.section}>
        <KioskFieldLabel k={k}>HOW SOON?</KioskFieldLabel>
        <View style={s.row}>
          {(['normal', 'soon'] as const).map(u => {
            const sel = urgency === u;
            const tone = u === 'soon' ? k.danger : accent;
            return (
              <Pressable
                key={u}
                onPressIn={() => setUrgency(u)}
                style={({ pressed }) => [
                  s.urgBtn,
                  {
                    backgroundColor: sel ? tone + '1F' : (pressed ? k.cardHover : k.well),
                    borderColor: sel ? tone : k.cardBorder,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={u === 'soon' ? 'Need soon' : 'No rush'}
              >
                <Text style={[s.urgText, { color: sel ? tone : k.textMuted }]} numberOfLines={1}>
                  {u === 'soon' ? '🔴 Need Soon' : '📋 No Rush'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Items ── */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <KioskFieldLabel k={k}>ITEMS NEEDED</KioskFieldLabel>
          <Pressable
            onPressIn={addRow}
            style={({ pressed }) => [s.addBtn, { backgroundColor: pressed ? k.cardHover : accent + '1F', borderColor: accent + '3D' }]}
            accessibilityRole="button"
            accessibilityLabel="Add another item"
          >
            <Plus size={16} color={accent} />
            <Text style={[s.addText, { color: accent }]} numberOfLines={1}>Add item</Text>
          </Pressable>
        </View>

        {items.map((item, idx) => {
          const q = item.name.trim().toLowerCase();
          const picks = (q
            ? SUGGESTIONS.filter(su => su.name.toLowerCase().includes(q))
            : SUGGESTIONS
          ).filter(su => !items.some((it, ii) => ii !== idx && it.name === su.name)).slice(0, 18);
          return (
            <View key={idx} style={[s.lineCard, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
              <View style={s.lineRow}>
                <TextInput
                  style={[input, { flex: 2.4, backgroundColor: k.card }]}
                  placeholder={`Item ${idx + 1} — type or pick below`}
                  placeholderTextColor={k.textFaint}
                  value={item.name}
                  onChangeText={v => updateItem(idx, 'name', v)}
                  accessibilityLabel={`Item ${idx + 1} name`}
                />
                <TextInput
                  style={[input, { flex: 1, backgroundColor: k.card }]}
                  placeholder="Qty"
                  placeholderTextColor={k.textFaint}
                  value={item.qty}
                  onChangeText={v => updateItem(idx, 'qty', v)}
                  accessibilityLabel={`Item ${idx + 1} quantity`}
                />
                {items.length > 1 && (
                  <Pressable
                    onPressIn={() => removeRow(idx)}
                    hitSlop={10}
                    style={[s.removeBtn, { borderColor: k.cardBorder }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${idx + 1}`}
                  >
                    <X size={18} color={k.textMuted} />
                  </Pressable>
                )}
              </View>
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
                        key={su.name} label={`${su.emoji} ${su.name}`} selected={item.name === su.name}
                        accent={accent} k={k}
                        onPress={() => updateItem(idx, 'name', su.name)}
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
          placeholder="e.g. for science project due Friday"
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
  row: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  chipRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, paddingRight: KIOSK_SPACE.md },
  urgBtn: {
    flex: 1, minHeight: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.sm,
  },
  urgText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    minHeight: KIOSK_HIT.min, paddingHorizontal: KIOSK_SPACE.md,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
  },
  addText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
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
