import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GroceryItem } from '@/store/groceryStore';
import { CatIcon, catDotColor } from './types';

// ─── Item Card ────────────────────────────────────────────────────────────────

export function ItemCard({ item, members, selected, selecting, onBuy, onLongPress, onToggleSelect, onPress, onEdit, onDelete, colors, isDark, priceInfo, isLast }: {
  item: GroceryItem; members: any[];
  selected: boolean; selecting: boolean; isLast?: boolean;
  onBuy: () => void; onLongPress: () => void; onToggleSelect: () => void;
  onPress: () => void; onEdit: () => void; onDelete?: () => void;
  colors: any; isDark: boolean;
  priceInfo?: { price: number | null; unit: string | null; source: 'kroger' | 'estimate' | 'unknown' };
}) {
  const dotColor = catDotColor(colors)[item.category ?? 'Other'] ?? colors.textTertiary;
  const isBought = item.isBought;
  const sepColor = colors.border;

  return (
    <Pressable
      onPress={selecting ? onToggleSelect : onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 11, paddingHorizontal: 16,
        backgroundColor: pressed ? (isDark ? colors.primary + '12' : colors.primaryLight) : 'transparent',
        opacity: isBought ? 0.45 : 1,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: sepColor,
      })}
    >
      {/* Left: checkbox or dot */}
      <View style={{ width: 28, alignItems: 'center', marginRight: 12 }}>
        {selecting ? (
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {selected && <Ionicons name="checkmark" size={12} color={colors.textInverse} />}
          </View>
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: (catDotColor(colors)[item.category ?? 'Other'] ?? colors.textTertiary) + '1A', alignItems: 'center', justifyContent: 'center' }}>
            <CatIcon category={item.category} size={18} color={catDotColor(colors)[item.category ?? 'Other'] ?? colors.textTertiary} />
          </View>
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: isBought ? colors.textTertiary : colors.textPrimary, textDecorationLine: isBought ? 'line-through' : 'none' }} numberOfLines={1}>
          {item.name}
        </Text>
        {/* Subtitle: qty · store · AI badge */}
        {(item.quantity || item.storePreference || item.aiGenerated || item.notes) && (
          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
            {[
              item.quantity,
              item.storePreference,
              item.aiGenerated ? '✨ AI' : null,
              item.notes,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {/* Right: price + buy */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {priceInfo?.price != null && (
          <Text style={{ fontSize: 12, fontWeight: '800', color: priceInfo.source === 'kroger' ? colors.success : colors.warningDark }}>
            ${priceInfo.price.toFixed(2)}
          </Text>
        )}
        <Pressable onPress={onBuy} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: isBought ? colors.successLight : colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: isBought ? colors.success : colors.border }}>
          <Ionicons name="checkmark" size={15} color={isBought ? colors.success : colors.textTertiary} />
        </Pressable>
      </View>
    </Pressable>
  );
}
