import { View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GroceryItem } from '@/store/groceryStore';
import { CatIcon, catDotColor, fmtProvenance } from './types';

// ─── Item Detail Sheet ────────────────────────────────────────────────────────

export function ItemDetailSheet({ item, members, onClose, onEdit, onBuy, onDelete, colors, isDark, priceInfo }: {
  item: GroceryItem | null; members: any[];
  onClose: () => void; onEdit: () => void; onBuy: () => void; onDelete?: () => void;
  colors: any; isDark: boolean;
  priceInfo?: { price: number | null; unit: string | null; source: 'kroger' | 'receipt' | 'estimate' | 'unrecognized' | 'unknown' };
}) {
  if (!item) return null;
  const dotColor = catDotColor(colors)[item.category ?? 'Other'] ?? colors.textTertiary;
  const sheetBg  = colors.card;

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} />
      <View style={{ backgroundColor: sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 36 }}>
        {/* Handle */}
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: dotColor + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: dotColor + '30' }}>
            <CatIcon category={item.category} size={24} color={dotColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>{item.name}</Text>
            {item.category && (
              <Text style={{ fontSize: 12, fontWeight: '700', color: dotColor, marginTop: 1 }}>{item.category}</Text>
            )}
          </View>
          {priceInfo?.price != null ? (() => {
            const trusted = priceInfo.source === 'kroger' || priceInfo.source === 'receipt';
            const label = priceInfo.source === 'kroger' ? 'Kroger' : priceInfo.source === 'receipt' ? 'Receipt' : '~est';
            return (
              <View style={{ backgroundColor: trusted ? colors.successLight : colors.warningLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: trusted ? colors.success : colors.warning }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: trusted ? colors.success : colors.warningDark }}>${priceInfo.price.toFixed(2)}</Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: trusted ? colors.success : colors.warningDark }}>{label}</Text>
              </View>
            );
          })() : priceInfo?.source === 'unrecognized' ? (
            // Same "say so, don't stay blank" fix as ItemCard.tsx — the
            // price-fetch ran and explicitly couldn't recognize this as a
            // real shopping item, rather than still being in progress.
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: colors.border, maxWidth: 120 }}>
              <Ionicons name="help-circle-outline" size={16} color={colors.textTertiary} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary, textAlign: 'center' }}>not recognized</Text>
            </View>
          ) : null}
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 20, marginBottom: 14 }} />

        {/* Details */}
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {item.quantity && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, width: 70 }}>Quantity</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{item.quantity}</Text>
            </View>
          )}
          {item.storePreference && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, width: 70 }}>Store</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{item.storePreference}</Text>
            </View>
          )}
          {item.notes && (
            <View style={{ backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
              <Text style={{ fontSize: 12, color: colors.primary, fontStyle: 'italic' }}>"{item.notes}"</Text>
            </View>
          )}
          <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
            {fmtProvenance(item, members)}
          </Text>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 18 }}>
          {onDelete && (
            <Pressable onPress={() => { onDelete(); onClose(); }} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.dangerLight, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          )}
          <Pressable onPress={() => { onEdit(); onClose(); }} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => { onBuy(); onClose(); }} style={{ flex: 2, backgroundColor: colors.success, borderRadius: 14, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textInverse }}>✓ Mark Bought</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
