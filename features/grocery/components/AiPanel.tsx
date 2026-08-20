import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useGroceryStore, GroceryItem } from '@/store/groceryStore';
import { AiSuggestedItem, AI_QUICK_PROMPTS } from './types';

// ─── AI Grocery Sheet ─────────────────────────────────────────────────────────

// Inline AI panel — shown inside the List tab ScrollView (CubeAI-style banner)
export function AiPanel({ familyId, memberId, existingItems, colors, isDark, onClose, onAdded }: {
  familyId: string; memberId: string; existingItems: GroceryItem[];
  colors: any; isDark: boolean; onClose: () => void; onAdded: () => void;
}) {
  const { addItem } = useGroceryStore();
  const [aiPrompt, setAiPrompt]         = useState('');
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiSuggested, setAiSuggested]   = useState<AiSuggestedItem[]>([]);
  const [aiSelected, setAiSelected]     = useState<Set<number>>(new Set());
  const [aiSummary, setAiSummary]       = useState('');
  const [aiEditingIdx, setAiEditingIdx] = useState<number | null>(null);
  const [aiEditName, setAiEditName]     = useState('');
  const [aiEditQty, setAiEditQty]       = useState('');
  const [adding, setAdding]             = useState(false);

  const existingNames = useMemo(() => new Set(existingItems.map(i => i.name.toLowerCase().trim())), [existingItems]);
  const P      = colors.primary;
  const panelBg = colors.primaryLight;
  const chipBg  = colors.primaryLight;
  const border  = colors.border;

  const runAiGenerate = async (text: string) => {
    if (!text.trim()) return;
    setAiLoading(true); setAiSuggested([]); setAiSummary('');
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: { action: 'grocery_suggest', prompt: text.trim(),
          existingItems: existingItems.map(i => i.name),
          localeHint: Intl.DateTimeFormat().resolvedOptions().locale },
      });
      if (error) throw error;
      const items: AiSuggestedItem[] = (data?.items ?? []).map((item: AiSuggestedItem) => ({
        ...item, isDuplicate: existingNames.has(item.name.toLowerCase().trim()),
      }));
      setAiSuggested(items);
      setAiSummary(data?.summary ?? '');
      const presel = new Set<number>();
      items.forEach((item, i) => { if (!item.isDuplicate) presel.add(i); });
      setAiSelected(presel);
    } catch (e: any) {
      Alert.alert('AI Error', e?.message ?? 'Something went wrong. Try again.');
    } finally { setAiLoading(false); }
  };

  const toggleAi = (i: number) => setAiSelected(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const handleAdd = async () => {
    const toAdd = aiSuggested.filter((_, i) => aiSelected.has(i));
    if (!toAdd.length) return;
    setAdding(true);
    try {
      await Promise.all(toAdd.map(item => addItem({
        familyId, name: item.name, quantity: item.quantity,
        category: item.category, storePreference: item.storePreference,
        notes: item.notes, addedBy: memberId, aiGenerated: true,
      })));
      setAiSuggested([]); setAiSelected(new Set()); setAiPrompt(''); setAiSummary('');
      onAdded();
    } finally { setAdding(false); }
  };

  return (
    <View style={{ backgroundColor: panelBg, borderRadius: 16, borderWidth: 1.5, borderColor: border, padding: 14, marginBottom: 16 }}>
      {/* Banner header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: P + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>🤖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>CubeAI</Text>
            <View style={{ backgroundColor: P, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 9, color: colors.textInverse, fontWeight: '700' }}>ACTIVE</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>Suggest items for your list</Text>
        </View>
        <Pressable onPress={onClose} style={{ padding: 6 }}>
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Quick prompts */}
      {!aiSuggested.length && !aiLoading && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, paddingRight: 4 }}>
            {AI_QUICK_PROMPTS.map(p => (
              <Pressable key={p} onPress={() => { setAiPrompt(p); runAiGenerate(p); }}
                style={{ backgroundColor: chipBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, color: P, fontWeight: '600' }}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Input row */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput
          value={aiPrompt} onChangeText={setAiPrompt}
          placeholder="Describe what you need…"
          placeholderTextColor={colors.placeholder}
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: border,
            paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.textPrimary }}
          returnKeyType="go" onSubmitEditing={() => runAiGenerate(aiPrompt)}
        />
        <Pressable onPress={() => runAiGenerate(aiPrompt)} disabled={!aiPrompt.trim() || aiLoading}
          style={{ backgroundColor: aiPrompt.trim() && !aiLoading ? P : colors.border, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
          {aiLoading ? <ActivityIndicator color={colors.textInverse} size="small" /> : <Text style={{ color: colors.textInverse, fontWeight: '700' }}>Go</Text>}
        </Pressable>
      </View>

      {/* Suggestions */}
      {aiSuggested.map((item, i) => (
        <View key={i}>
          {aiEditingIdx === i ? (
            <View style={{ backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: border, padding: 10, marginBottom: 6 }}>
              <TextInput value={aiEditName} onChangeText={setAiEditName}
                style={{ fontSize: 14, color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: border, paddingBottom: 4, marginBottom: 8 }} />
              <TextInput value={aiEditQty} onChangeText={setAiEditQty} placeholder="Qty"
                placeholderTextColor={colors.placeholder}
                style={{ fontSize: 13, color: colors.textSecondary }} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => {
                  const updated = [...aiSuggested];
                  updated[i] = { ...updated[i], name: aiEditName.trim() || updated[i].name, quantity: aiEditQty.trim() || updated[i].quantity };
                  setAiSuggested(updated); setAiEditingIdx(null);
                }} style={{ flex: 1, backgroundColor: P, borderRadius: 8, paddingVertical: 7, alignItems: 'center' }}>
                  <Text style={{ color: colors.textInverse, fontWeight: '700', fontSize: 13 }}>Save</Text>
                </Pressable>
                <Pressable onPress={() => setAiEditingIdx(null)}
                  style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => !item.isDuplicate && toggleAi(i)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
                borderBottomWidth: i < aiSuggested.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: border,
                opacity: item.isDuplicate ? 0.5 : 1 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                borderColor: item.isDuplicate ? colors.border : (aiSelected.has(i) ? P : colors.border),
                backgroundColor: aiSelected.has(i) && !item.isDuplicate ? P : 'transparent',
                alignItems: 'center', justifyContent: 'center' }}>
                {aiSelected.has(i) && !item.isDuplicate && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{item.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{[item.quantity, item.category].filter(Boolean).join(' · ')}</Text>
              </View>
              {!item.isDuplicate && (
                <>
                  <Pressable onPress={() => { setAiEditingIdx(i); setAiEditName(item.name); setAiEditQty(item.quantity ?? ''); }}
                    style={{ padding: 6 }}>
                    <Ionicons name="pencil-outline" size={15} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => { setAiSuggested(prev => prev.filter((_, j) => j !== i)); setAiSelected(prev => { const n = new Set(prev); n.delete(i); return n; }); }}
                    style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  </Pressable>
                </>
              )}
            </Pressable>
          )}
        </View>
      ))}

      {/* Add button */}
      {aiSuggested.length > 0 && (
        <Pressable onPress={handleAdd} disabled={!aiSelected.size || adding}
          style={{ backgroundColor: aiSelected.size ? colors.success : colors.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 }}>
          {adding
            ? <ActivityIndicator color={colors.textInverse} size="small" />
            : <Text style={{ color: colors.textInverse, fontWeight: '700', fontSize: 14 }}>Add {aiSelected.size} item{aiSelected.size !== 1 ? 's' : ''} to list</Text>
          }
        </Pressable>
      )}
    </View>
  );
}
