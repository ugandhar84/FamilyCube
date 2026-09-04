import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, StyleSheet,
  Modal, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { ShoppingCart } from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { CAT_ICON, CAT_EMOJI } from './types';

// Groups a receipt's line items by category — live-requested: "Put
// category wise" — so a scanned receipt mixing groceries with supplies or
// clothing reads as clearly segregated sections instead of one flat list.
// Order follows a rough "most items first" convention rather than
// alphabetical, with 'Other' always last since it's the least specific.
function groupItemsByCategory(items: any[]): [string, any[]][] {
  const byCategory: Record<string, any[]> = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  return Object.entries(byCategory).sort(([a], [b]) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return byCategory[b].length - byCategory[a].length;
  });
}

// ─── History Tab ──────────────────────────────────────────────────────────────

export function HistoryTab({ familyId, memberId, colors, isDark }: { familyId: string; memberId: string; colors: any; isDark: boolean }) {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailReceipt, setDetailReceipt] = useState<any | null>(null);
  const { members } = useFamilyStore();
  const addQuest = useQuestStore().addQuest;

  useEffect(() => {
    if (!familyId) return;
    async function fetch() {
      const { data } = await supabase
        .from('grocery_receipts')
        .select('id,store,receipt_date,total,created_at,image_url,grocery_receipt_items(name,category,quantity,total_price)')
        .eq('family_id', familyId)
        .order('receipt_date', { ascending: false })
        .limit(30);
      setReceipts(data ?? []);
      setLoading(false);
    }
    fetch();
  }, [familyId]);

  const handleReturnItem = (item: any, store: string) => {
    const options = members.length > 0 ? members : [{ id: memberId, name: 'Me', emoji: '👤' }];
    Alert.alert(
      '↩️ Return Item',
      `Who will return "${item.name}" to ${store || 'the store'}?`,
      [
        ...options.map((m: any) => ({
          text: `${m.emoji ?? '👤'} ${m.name}`,
          onPress: () => {
            addQuest({
              title: `Return ${item.name} to ${store || 'store'}`,
              description: `Item: ${item.name}${item.quantity ? ` (${item.quantity})` : ''}\nFrom receipt scan`,
              category: 'Shopping',
              priority: 'medium',
              status: 'todo',
              assignedToId: m.id,
              assignedToIds: [m.id],
              dueDate: undefined,
              coins: 10,
              xpReward: 0,
              recurrence: 'once',
              isPool: false,
              isAdultTask: false,
              photoRequired: false,
              isDaily: false,
            });
            Alert.alert('↩️ Chore Created', `${m.name} will return ${item.name}`);
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const border = colors.border;
  const card = colors.card;

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />;
  if (receipts.length === 0) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>🧾</Text>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>No receipts yet</Text>
      <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 }}>Scan a receipt to track spending and learn your staples.</Text>
    </View>
  );

  return (
    <>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      {receipts.map((r, rIdx) => {
        const isOpen = expanded === r.id;
        const dateStr = r.receipt_date ? new Date(r.receipt_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date';
        const items: any[] = r.grocery_receipt_items ?? [];
        return (
          <View key={r.id}
            style={{ borderBottomWidth: rIdx < receipts.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
            {/* Receipt header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
              {/* Receipt avatar — tap to open full receipt detail modal */}
              <Pressable onPress={() => setDetailReceipt(r)}
                style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden',
                  backgroundColor: colors.primary + '18',
                  alignItems: 'center', justifyContent: 'center' }}>
                {r.image_url
                  ? <Image source={{ uri: r.image_url }} style={{ width: 44, height: 44 }} resizeMode="cover" />
                  : <Text style={{ fontSize: 22 }}>🧾</Text>}
              </Pressable>
              <Pressable onPress={() => setExpanded(isOpen ? null : r.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{r.store ?? 'Unknown Store'}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{dateStr} · {items.length} items</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: colors.primary }}>${(r.total ?? 0).toFixed(2)}</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
            {/* Expanded item list — grouped by category */}
            {isOpen && items.length > 0 && (
              <View style={{ paddingBottom: 8 }}>
                {groupItemsByCategory(items).map(([category, catItems], gIdx, groups) => (
                  <View key={category} style={{ marginBottom: gIdx < groups.length - 1 ? 12 : 0 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: colors.primary, textTransform: 'uppercase',
                      letterSpacing: 0.6, marginBottom: 4 }}>
                      {CAT_EMOJI[category] ?? '📦'} {category} ({catItems.length})
                    </Text>
                    {catItems.map((item: any, idx: number) => {
                      const CatIcon = CAT_ICON[item.category as keyof typeof CAT_ICON] ?? ShoppingCart;
                      return (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
                          borderBottomWidth: idx < catItems.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                          {/* Category SVG icon thumbnail */}
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface,
                            alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <CatIcon size={16} color={colors.primary} strokeWidth={1.8} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600' }}>{item.name}</Text>
                            {item.quantity ? <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{item.quantity}</Text> : null}
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginRight: 10 }}>
                            ${(item.total_price ?? 0).toFixed(2)}
                          </Text>
                          {/* Return to quest button */}
                          <Pressable onPress={() => handleReturnItem(item, r.store ?? '')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.surface,
                              alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 14 }}>↩️</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>

    {/* ── Receipt detail modal ── */}
    <Modal visible={!!detailReceipt} transparent animationType="slide" onRequestClose={() => setDetailReceipt(null)}>
      {detailReceipt && (() => {
        const dr = detailReceipt;
        const drItems: any[] = dr.grocery_receipt_items ?? [];
        const drDate = dr.receipt_date ? new Date(dr.receipt_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown date';
        return (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDetailReceipt(null)} />
              <View style={{ backgroundColor: card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
                maxHeight: '85%', paddingBottom: 24 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: border, alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, gap: 12 }}>
                    {dr.image_url ? (
                    <Image source={{ uri: dr.image_url }} style={{ width: 64, height: 64, borderRadius: 12 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primary + '20',
                      borderWidth: 1.5, borderColor: colors.primary + '50', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28 }}>🧾</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>{dr.store ?? 'Unknown Store'}</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{drDate}</Text>
                  </View>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: colors.primary }}>${(dr.total ?? 0).toFixed(2)}</Text>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                  {groupItemsByCategory(drItems).map(([category, catItems], gIdx, groups) => (
                    <View key={category} style={{ marginBottom: gIdx < groups.length - 1 ? 14 : 0 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase',
                        letterSpacing: 0.6, marginBottom: 6 }}>
                        {CAT_EMOJI[category] ?? '📦'} {category} ({catItems.length})
                      </Text>
                      {catItems.map((item: any, idx: number) => {
                        const CatIcon = CAT_ICON[item.category as keyof typeof CAT_ICON] ?? ShoppingCart;
                        return (
                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                            borderBottomWidth: idx < catItems.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: border, gap: 10 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface,
                              alignItems: 'center', justifyContent: 'center' }}>
                              <CatIcon size={18} color={colors.primary} strokeWidth={1.8} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{item.name}</Text>
                              {item.quantity ? <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{item.quantity}</Text> : null}
                            </View>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>${(item.total_price ?? 0).toFixed(2)}</Text>
                            <Pressable onPress={() => { setDetailReceipt(null); setTimeout(() => handleReturnItem(item, dr.store ?? ''), 300); }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface,
                                alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 15 }}>↩️</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        );
      })()}
    </Modal>
    </>
  );
}
