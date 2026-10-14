/**
 * SuppliesRequestPage — full-page replacement for KidModals.tsx's
 * SuppliesModal bottom sheet. Logic ported verbatim (urgency toggle,
 * per-row items with per-row filtered suggestions, add/remove rows,
 * notes, submit/append-to-existing-pending logic) — only the layout
 * changed to the shared Figma field-card rhythm (FieldCard/
 * FieldCardSection/BeforeYouSendBox/SentConfirmation).
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { TYPO } from '@/constants/theme';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { KidRequestItem } from '@/store/kidRequestStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { SUPPLIES_SUGGESTIONS, ItemNameField } from '@/features/hub/KidModals';
import { FieldCard, FieldCardSection } from './shared/FieldCard';
import { BeforeYouSendBox } from './shared/BeforeYouSendBox';
import { SentConfirmation } from './shared/SentConfirmation';

const INDIGO_ACCENT = '#6366F1';

export function SuppliesRequestPage({ active, onClose }: {
  active: FamilyMember; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest, requests, appendItems: appendToRequest } = useKidRequestStore();
  const members = useFamilyStore(s => s.members);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);

  const [items, setItems] = useState<{ name: string; qty: string }[]>([{ name: '', qty: '' }]);
  const [urgency, setUrgency] = useState<'normal' | 'soon'>('normal');
  const [notes, setNotes] = useState('');
  const [sent, setSent] = useState(false);
  const [appended, setAppended] = useState(false);

  const canvas = isDark ? colors.background : GEMINI.canvas;
  const cardWhiteBg = isDark ? colors.card : GEMINI.cardBg;

  const validItems = items.filter(i => i.name.trim());
  const canSubmit = validItems.length > 0;

  const updateItem = (idx: number, field: 'name' | 'qty', val: string) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  const addRow = () => setItems(prev => [...prev, { name: '', qty: '' }]);
  const removeRow = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const submit = () => {
    if (!canSubmit) return;
    const newItems: KidRequestItem[] = validItems.map((it, i) => ({
      id: `item-${Date.now()}-${i}`,
      name: it.name.trim(),
      qty: it.qty.trim(),
      category: 'Supplies',
      status: 'pending',
      requestedBy: active.id,
    }));
    const existing = requests.find(r =>
      r.fromMemberId === active.id && r.status === 'pending' && r.type === 'supplies'
    );
    if (existing) {
      appendToRequest(existing.id, newItems);
      setAppended(true);
    } else {
      sendRequest({
        type: 'supplies', fromMemberId: active.id, urgency,
        detail: validItems.map(i => i.name.trim()).join(', ') + (notes.trim() ? ` — ${notes.trim()}` : ''),
        items: newItems,
      });
      setAppended(false);
    }
    setSent(true);
  };

  const close = () => {
    setItems([{ name: '', qty: '' }]); setUrgency('normal'); setNotes(''); setSent(false); setAppended(false);
    onClose();
  };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        {!sent && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: insets.top + 8 }}>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>‹ Ask Parent</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}
        <PageHeading
          title="School Supplies"
          subtitle={sent ? undefined : 'Parent approves and picks these up for you'}
          accent="sky"
          Icon={BookOpen}
          topInset={0}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 16 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ gap: 16 }}>
        {sent ? (
          <SentConfirmation
            title="Sent · awaiting a reply"
            message={appended
              ? `${validItems.length} item${validItems.length > 1 ? 's' : ''} added to your existing supplies request.`
              : `Request delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}. They'll approve each item.`}
            onReturn={close}
            colors={colors}
          />
        ) : (
          <>
            <FieldCardSection title="How urgent?" colors={colors} isDark={isDark}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['normal', 'soon'] as const).map(u => (
                  <TouchableOpacity key={u} onPress={() => setUrgency(u)}
                    style={{ flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5,
                      backgroundColor: urgency === u ? (u === 'soon' ? '#EF444418' : colors.sky + '18') : cardWhiteBg,
                      borderColor: urgency === u ? (u === 'soon' ? '#EF4444' : colors.sky) : colors.border }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                      color: urgency === u ? (u === 'soon' ? '#EF4444' : colors.sky) : colors.textSecondary }}>
                      {u === 'soon' ? '🔴 Need Soon' : '📋 No Rush'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FieldCardSection>

            <FieldCardSection title="Items needed" colors={colors} isDark={isDark}>
              {items.map((item, idx) => {
                const q = item.name.trim().toLowerCase();
                const filtered = q
                  ? SUPPLIES_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(q) && !items.some((it, ii) => ii !== idx && it.name === s.name))
                  : SUPPLIES_SUGGESTIONS.filter(s => !items.some((it, ii) => ii !== idx && it.name === s.name)).slice(0, 18);
                return (
                  <FieldCard key={idx} label={`Item ${idx + 1}`} focused={item.name.length > 0} colors={colors} isDark={isDark}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <ItemNameField
                        value={item.name} onChangeText={v => updateItem(idx, 'name', v)}
                        placeholder="Type or pick below"
                        style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                        flex={2} accent={INDIGO_ACCENT} colors={colors} isDark={isDark}
                      />
                      <TextInput value={item.qty} onChangeText={v => updateItem(idx, 'qty', v)}
                        placeholder="Qty" placeholderTextColor={colors.textTertiary}
                        style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, flex: 1 }} />
                      {items.length > 1 && (
                        <TouchableOpacity onPress={() => removeRow(idx)} style={{ padding: 6 }}>
                          <Text style={{ fontSize: 18, color: colors.danger }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {filtered.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {filtered.map(s => (
                            <TouchableOpacity key={s.name} onPress={() => updateItem(idx, 'name', s.name)}
                              style={{
                                flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1.5,
                                paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0,
                                backgroundColor: item.name === s.name ? colors.sky + '20' : cardWhiteBg,
                                borderColor: item.name === s.name ? colors.sky : colors.border,
                              }}>
                              <Text style={{ fontSize: TYPO.micro }}>{s.emoji}</Text>
                              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', marginLeft: 4,
                                color: item.name === s.name ? colors.sky : colors.textSecondary }} numberOfLines={1}>{s.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    )}
                  </FieldCard>
                );
              })}

              <TouchableOpacity onPress={addRow}
                style={{ borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.sky + '50', paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.sky }}>+ Add another item</Text>
              </TouchableOpacity>

              <FieldCard label="Note for parent (optional)" focused={notes.length > 0} colors={colors} isDark={isDark}>
                <TextInput value={notes} onChangeText={setNotes}
                  style={{ fontSize: TYPO.body, color: colors.textPrimary, padding: 0, minHeight: 44, textAlignVertical: 'top' }}
                  placeholder="e.g. for science project due Friday"
                  placeholderTextColor={colors.textTertiary} multiline />
              </FieldCard>
            </FieldCardSection>

            <BeforeYouSendBox
              recipientLabel={`To ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}`}
              note="A parent approves and picks these up for you."
              colors={colors}
            />

            <Pressable onPress={submit} disabled={!canSubmit}
              style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                backgroundColor: canSubmit ? colors.sky : colors.surface }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: canSubmit ? '#fff' : colors.textTertiary }}>
                Send {validItems.length} item{validItems.length !== 1 ? 's' : ''} to parent
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
