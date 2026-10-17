/**
 * GroceryRequestPage — full-page replacement for KidModals.tsx's
 * GroceryModal bottom sheet. Logic ported verbatim (category selector,
 * multi-line item list with per-line ItemNameField voice mic field, store
 * chips, name suggestion chips, notes, submit/append-to-existing-pending
 * logic) — only the layout changed to the shared Figma field-card rhythm
 * (FieldCard/FieldCardSection/BeforeYouSendBox/SentConfirmation).
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Pressable, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShoppingCart, X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { TYPO } from '@/constants/theme';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { KidRequestItem } from '@/store/kidRequestStore';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import {
  GROCERY_CATEGORIES, ALL_GROCERY_SUGGESTIONS, ItemNameField,
} from '@/features/hub/KidModals';
import { FieldCard, FieldCardSection } from './shared/FieldCard';
import { BeforeYouSendBox } from './shared/BeforeYouSendBox';
import { SentConfirmation } from './shared/SentConfirmation';

type GroceryLine = { name: string; qty: string; category: string; emoji: string; store: string };
const emptyLine = (): GroceryLine => ({ name: '', qty: '', category: 'Snacks', emoji: '🛒', store: '' });

export function GroceryRequestPage({ active, onClose }: {
  active: FamilyMember; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest, requests, appendItems } = useKidRequestStore();
  const members = useFamilyStore(s => s.members);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);
  const pastStores = useGroceryStore(s => s.pastStores);
  const storePool = [...new Set([...pastStores, ...DEFAULT_GROCERY_STORES])].slice(0, 6);

  const [lines, setLines] = useState<GroceryLine[]>([emptyLine()]);
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<'name' | null>(null);
  const [globalCat, setGlobalCat] = useState('Snacks');
  const [notes, setNotes] = useState('');
  const [sent, setSent] = useState(false);
  const [appended, setAppended] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  const canvas = isDark ? colors.background : GEMINI.canvas;
  const cardWhiteBg = isDark ? colors.card : GEMINI.cardBg;

  const validLines = lines.filter(l => l.name.trim());
  const canSubmit = validLines.length > 0;

  const updateLine = (idx: number, patch: Partial<GroceryLine>) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) =>
    setLines(prev => prev.filter((_, i) => i !== idx));
  const addLine = () =>
    setLines(prev => [...prev, { ...emptyLine(), category: globalCat }]);

  const submit = () => {
    if (!canSubmit) return;
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
    const existing = requests.find(r =>
      r.fromMemberId === active.id && r.status === 'pending' && r.type === 'grocery'
    );
    setSentCount(newItems.length);
    if (existing) {
      appendItems(existing.id, newItems);
      setAppended(true);
    } else {
      sendRequest({
        type: 'grocery',
        fromMemberId: active.id,
        urgency: 'normal',
        detail: validLines.map(l => l.name.trim()).join(', ') + (notes.trim() ? ` — ${notes.trim()}` : ''),
        items: newItems,
      });
      setAppended(false);
    }
    setSent(true);
  };

  const close = () => {
    setLines([emptyLine()]); setGlobalCat('Snacks'); setNotes(''); setSent(false); setAppended(false);
    onClose();
  };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          title="Request Groceries"
          subtitle={sent ? undefined : (canSubmit ? `${validLines.length} item${validLines.length > 1 ? 's' : ''} · parent approves each one` : 'Parent approves before items are added')}
          accent="teal"
          Icon={ShoppingCart}
          topInset={insets.top}
          eyebrow="FAMILY CUBE · ASK PARENT"
          onTitlePress={onClose}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 48, gap: 12 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ gap: 12 }}>
        {sent ? (
          <SentConfirmation
            title="Sent · awaiting a reply"
            message={appended
              ? `${sentCount} item${sentCount > 1 ? 's' : ''} added to your existing grocery request.`
              : `${sentCount} item${sentCount > 1 ? 's' : ''} sent to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'} for approval.`}
            onReturn={close}
            colors={colors}
          />
        ) : (
          <>
            <FieldCardSection title="Category" colors={colors} isDark={isDark}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {GROCERY_CATEGORIES.map(c => {
                    const isActive = globalCat === c;
                    return (
                      <TouchableOpacity key={c} onPress={() => setGlobalCat(c)}
                        style={{ borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8,
                          alignItems: 'center', gap: 3, minWidth: 56,
                          backgroundColor: isActive ? BRAND.teal + '18' : cardWhiteBg,
                          borderColor: isActive ? BRAND.teal : colors.border }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                          color: isActive ? BRAND.teal : colors.textSecondary }}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </FieldCardSection>

            <FieldCardSection title="Items list" colors={colors} isDark={isDark}>
              {lines.length === 0 ? (
                <Pressable onPress={addLine}
                  style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.teal + '60', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: BRAND.teal, fontSize: 13 }}>+ Tap to add grocery items</Text>
                </Pressable>
              ) : (
                lines.map((line, idx) => {
                  const q = line.name.trim().toLowerCase();
                  const nameSuggs = q
                    ? ALL_GROCERY_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q).slice(0, 8)
                    : ALL_GROCERY_SUGGESTIONS.filter(s => !globalCat || s.category === globalCat || globalCat === 'All').slice(0, 10);
                  const showNameSuggs = nameSuggs.length > 0;

                  return (
                    <FieldCard key={idx} label={`Item ${idx + 1}`} focused={line.name.length > 0} colors={colors} isDark={isDark}>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <ItemNameField
                          style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                          value={line.name}
                          onChangeText={v => updateLine(idx, { name: v })}
                          onFocus={() => { setFocusedLineIdx(idx); setFocusedField('name'); }}
                          onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                          accent={BRAND.teal} colors={colors} isDark={isDark}
                        />
                        <TextInput
                          style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, width: 56 }}
                          placeholder="Qty" placeholderTextColor={colors.textTertiary}
                          value={line.qty}
                          onChangeText={v => updateLine(idx, { qty: v })}
                        />
                        <Pressable onPress={() => removeLine(idx)} style={{ padding: 6 }}>
                          <Text style={{ fontSize: 16, color: colors.textTertiary }}>✕</Text>
                        </Pressable>
                      </View>
                      {storePool.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {storePool.map(st => {
                              const picked = line.store === st;
                              return (
                                <Pressable key={st} onPress={() => updateLine(idx, { store: picked ? '' : st })}
                                  style={{ borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4,
                                    backgroundColor: picked ? BRAND.teal + '20' : cardWhiteBg,
                                    borderWidth: 1, borderColor: picked ? BRAND.teal : colors.border }}>
                                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: picked ? BRAND.teal : colors.textSecondary }}>🏪 {st}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </ScrollView>
                      )}
                      {showNameSuggs && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontWeight: '700', marginBottom: 8, letterSpacing: 0.4 }}>
                            {q ? 'Matching — tap to fill' : 'Quick picks'}
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {nameSuggs.map(s => (
                                <Pressable key={s.name}
                                  onPress={() => updateLine(idx, { name: s.name, emoji: s.emoji, category: s.category })}
                                  style={{ backgroundColor: line.name === s.name ? BRAND.teal + '20' : cardWhiteBg,
                                    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5,
                                    borderColor: line.name === s.name ? BRAND.teal : colors.border }}>
                                  <Text style={{ fontSize: TYPO.micro, color: line.name === s.name ? BRAND.teal : colors.textSecondary, fontWeight: '700' }}>
                                    {s.emoji} {s.name}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      )}
                    </FieldCard>
                  );
                })
              )}

              <TouchableOpacity onPress={addLine}
                style={{ borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.teal + '50', paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.teal }}>+ Add item</Text>
              </TouchableOpacity>

              <FieldCard label="Note for parent (optional)" focused={notes.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, color: colors.textPrimary, padding: 0, minHeight: 44, textAlignVertical: 'top' }}
                  placeholder="e.g. get the name-brand ones, not store brand"
                  placeholderTextColor={colors.textTertiary}
                  value={notes} onChangeText={setNotes} multiline
                />
              </FieldCard>
            </FieldCardSection>

            <BeforeYouSendBox
              recipientLabel={`To ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}`}
              note="A parent approves each item before it's added to the list."
              colors={colors}
            />

            <Pressable onPress={submit} disabled={!canSubmit}
              style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                backgroundColor: canSubmit ? BRAND.teal : colors.surface }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: canSubmit ? '#fff' : colors.textTertiary }}>
                {canSubmit ? `Send ${validLines.length} item${validLines.length > 1 ? 's' : ''} to parent` : 'Add at least one item'}
              </Text>
            </Pressable>

            <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                Cancel · return unchanged
              </Text>
            </Pressable>
          </>
        )}
        </View>
        </TouchableWithoutFeedback>
      </ScrollView>
    </View>
  );
}
