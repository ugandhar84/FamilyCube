import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GroceryItem } from '@/store/groceryStore';
import { CatIcon, catDotColor, fmtProvenance } from './types';

// ─── Item Detail — full-page screen (replaces modal sheet) ───────────────────

export function ItemDetailSheet({ item, members, onClose, onEdit, onBuy, onDelete, colors, isDark, priceInfo }: {
  item: GroceryItem | null; members: any[];
  onClose: () => void; onEdit: () => void; onBuy: () => void; onDelete?: () => void;
  colors: any; isDark: boolean;
  priceInfo?: { price: number | null; unit: string | null; source: 'kroger' | 'receipt' | 'estimate' | 'unrecognized' | 'unknown' };
}) {
  const insets = useSafeAreaInsets();
  if (!item) return null;
  const dotColor = catDotColor(colors)[item.category ?? 'Other'] ?? colors.textTertiary;
  const trusted = priceInfo?.source === 'kroger' || priceInfo?.source === 'receipt';

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.surface, marginRight: 12 }}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>Groceries</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>{item.name}</Text>
        </View>
        {priceInfo?.price != null && (
          <View style={{ backgroundColor: trusted ? colors.tealLight : colors.amberLight, borderRadius: 12,
            paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: trusted ? colors.teal : colors.amber }}>
              ${priceInfo.price.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: trusted ? colors.teal : colors.amber }}>
              {priceInfo.source === 'kroger' ? 'Kroger' : priceInfo.source === 'receipt' ? 'Receipt' : '~est'}
            </Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} showsVerticalScrollIndicator={false}>
        {/* Category icon card */}
        <View style={{ backgroundColor: dotColor + '12', borderRadius: 22, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: dotColor + '20',
            alignItems: 'center', justifyContent: 'center' }}>
            <CatIcon category={item.category} size={24} color={dotColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary }}>{item.name}</Text>
            {item.category && (
              <Text style={{ fontSize: 13, fontWeight: '500', color: dotColor }}>{item.category}</Text>
            )}
          </View>
        </View>

        {/* Detail fields */}
        {item.quantity ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 56 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>Quantity</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{item.quantity}</Text>
          </View>
        ) : null}

        {item.storePreference ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 56 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>Store</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{item.storePreference}</Text>
          </View>
        ) : null}

        {item.notes ? (
          <View style={{ backgroundColor: colors.primaryLight, borderRadius: 22, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, lineHeight: 22 }}>"{item.notes}"</Text>
          </View>
        ) : null}

        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
          {fmtProvenance(item, members)}
        </Text>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          {onDelete && (
            <Pressable onPress={() => { onDelete(); onClose(); }}
              style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.dangerLight,
                alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          )}
          <Pressable onPress={() => { onEdit(); onClose(); }}
            style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF', borderRadius: 14, height: 48,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary }}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => { onBuy(); onClose(); }}
            style={{ flex: 2, backgroundColor: colors.teal, borderRadius: 14, height: 48,
              alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>✓ Mark Bought</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
