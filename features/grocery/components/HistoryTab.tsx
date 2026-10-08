import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  Alert, ActivityIndicator, Image, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { ShoppingCart } from 'lucide-react-native';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/choreAdapter';
import { CAT_ICON, CAT_EMOJI } from './types';
import FullPageOverlay from '@/components/FullPageOverlay';

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

// Figma shows "Mon 5 Oct · 12:08" — we use 12h per CLAUDE.md rule 9
function fmtReceiptHeadline(iso?: string) {
  if (!iso) return 'Unknown date';
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${weekday} ${day} ${month} · ${time}`;
}

function fmtMonthYear(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── History Tab — Figma layout ──────────────────────────────────────────────

export function HistoryTab({ familyId, memberId, colors, isDark }: { familyId: string; memberId: string; colors: any; isDark: boolean }) {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailReceipt, setDetailReceipt] = useState<any | null>(null);
  const { members } = useFamilyStore();
  const addQuest = useQuestStore().addQuest;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!familyId) return;
    supabase
      .from('grocery_receipts')
      .select('id,store,receipt_date,total,created_at,image_url,grocery_receipt_items(name,category,quantity,total_price)')
      .eq('family_id', familyId)
      .order('receipt_date', { ascending: false })
      .limit(30)
      .then(({ data }) => { setReceipts(data ?? []); setLoading(false); });
  }, [familyId]);

  // Monthly spend summary
  const monthSummary = useMemo(() => {
    const now = new Date();
    const thisMonth = receipts.filter(r => {
      if (!r.receipt_date) return false;
      const d = new Date(r.receipt_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const total = thisMonth.reduce((s, r) => s + (r.total ?? 0), 0);
    const avg = thisMonth.length > 0 ? total / thisMonth.length : 0;
    return { count: thisMonth.length, total, avg };
  }, [receipts]);

  const handleReturnItem = (item: any, store: string) => {
    const options = members.length > 0 ? members : [{ id: memberId, name: 'Me', emoji: '👤' }];
    Alert.alert('↩️ Return Item', `Who will return "${item.name}" to ${store || 'the store'}?`, [
      ...options.map((m: any) => ({
        text: `${m.emoji ?? '👤'} ${m.name}`,
        onPress: () => {
          addQuest({
            title: `Return ${item.name} to ${store || 'store'}`,
            description: `Item: ${item.name}${item.quantity ? ` (${item.quantity})` : ''}\nFrom receipt scan`,
            category: 'Shopping', priority: 'medium', status: 'todo',
            assignedToId: m.id, assignedToIds: [m.id],
            dueDate: undefined, coins: 10, xpReward: 0, recurrence: 'once',
            isPool: false, isAdultTask: false, photoRequired: false, isDaily: false,
          });
          Alert.alert('↩️ Chore Created', `${m.name} will return ${item.name}`);
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />;

  if (receipts.length === 0) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>🧾</Text>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>No receipts yet</Text>
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 }}>
        Scan a receipt to track spending and learn your staples.
      </Text>
    </View>
  );

  const firstDate = receipts[0]?.receipt_date;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

        {/* Figma: subtitle line under page title */}
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
          After receipt confirmation · {fmtMonthYear(firstDate)} · {monthSummary.count} completed run{monthSummary.count !== 1 ? 's' : ''}
        </Text>

        {/* Figma: amber monthly summary card */}
        {monthSummary.count > 0 && (
          <View style={{ backgroundColor: colors.amberLight, borderRadius: 22, padding: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
              ${monthSummary.total.toFixed(2)} this month
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>
              {monthSummary.count} run{monthSummary.count !== 1 ? 's' : ''} · ${monthSummary.avg.toFixed(2)} average per run
            </Text>
          </View>
        )}

        {/* Figma: receipt rows — date as headline, standalone white shadow cards */}
        {receipts.map((r) => {
          const isOpen = expanded === r.id;
          const items: any[] = r.grocery_receipt_items ?? [];
          return (
            <View key={r.id}>
              {/* Receipt card */}
              <Pressable onPress={() => setExpanded(isOpen ? null : r.id)}
                style={({ pressed }) => ({
                  backgroundColor: colors.card, borderRadius: 14,
                  borderWidth: 1, borderColor: colors.border, padding: 16,
                  shadowColor: isDark ? 'transparent' : '#172337', shadowOpacity: isDark ? 0 : 0.06,
                  shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
                  opacity: pressed ? 0.9 : 1,
                })}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>
                  {fmtReceiptHeadline(r.receipt_date)}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                  {r.store ?? 'Unknown Store'} · {items.length} items · ${(r.total ?? 0).toFixed(2)}
                </Text>
              </Pressable>

              {/* Figma: inline receipt detail below the card */}
              {isOpen && (
                <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                  marginTop: 2, padding: 20, gap: 12,
                  shadowColor: isDark ? 'transparent' : '#172337', shadowOpacity: isDark ? 0 : 0.05,
                  shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
                    {fmtReceiptHeadline(r.receipt_date)} · receipt detail
                  </Text>
                  {items.map((item: any, idx: number) => (
                    <View key={idx}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                            {item.name}{item.quantity ? ` · ${item.quantity}` : ''}
                          </Text>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 2 }}>
                            ${(item.total_price ?? 0).toFixed(2)}
                          </Text>
                        </View>
                        <Pressable onPress={() => handleReturnItem(item, r.store ?? '')}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.amberLight,
                            alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 14 }}>↩️</Text>
                        </Pressable>
                      </View>
                      {idx < items.length - 1 && (
                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 10 }} />
                      )}
                    </View>
                  ))}
                  {/* Confirmed total */}
                  <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>
                      Confirmed total · ${(r.total ?? 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Figma: "Simple spending insights →" link card */}
        <Pressable style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
          padding: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>Simple spending insights →</Text>
        </Pressable>

        {/* Figma: footer note */}
        <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
          Pending requests and active runs are not completed purchases. Open receipt to correct a price with an appended audit note.
        </Text>

      </ScrollView>

      {/* Receipt image detail overlay */}
      <FullPageOverlay visible={!!detailReceipt} onDismiss={() => setDetailReceipt(null)} zIndex={60}>
        {detailReceipt && (() => {
          const dr = detailReceipt;
          const drItems: any[] = dr.grocery_receipt_items ?? [];
          return (
            <View style={{ flex: 1, backgroundColor: colors.card }}>
              <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
                borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
                flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable onPress={() => setDetailReceipt(null)}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface,
                    alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>Receipt</Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>{dr.store ?? 'Unknown Store'}</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.primary }}>${(dr.total ?? 0).toFixed(2)}</Text>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 40 }}>
                {dr.image_url && (
                  <Image source={{ uri: dr.image_url }} style={{ width: '100%', height: 200, borderRadius: 14 }} resizeMode="cover" />
                )}
                {groupItemsByCategory(drItems).map(([category, catItems]) => (
                  <View key={category} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary,
                        textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        {CAT_EMOJI[category] ?? '📦'} {category} ({catItems.length})
                      </Text>
                    </View>
                    {catItems.map((item: any, idx: number) => {
                      const CatIcon = CAT_ICON[item.category as keyof typeof CAT_ICON] ?? ShoppingCart;
                      return (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingVertical: 10, paddingHorizontal: 14,
                          borderTopWidth: idx > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border }}>
                          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface,
                            alignItems: 'center', justifyContent: 'center' }}>
                            <CatIcon size={18} color={colors.primary} strokeWidth={1.8} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{item.name}</Text>
                            {item.quantity && <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>{item.quantity}</Text>}
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>
                            ${(item.total_price ?? 0).toFixed(2)}
                          </Text>
                          <Pressable onPress={() => { setDetailReceipt(null); setTimeout(() => handleReturnItem(item, dr.store ?? ''), 300); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.amberLight,
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
          );
        })()}
      </FullPageOverlay>
    </>
  );
}
