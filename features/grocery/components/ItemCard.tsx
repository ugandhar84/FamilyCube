import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GroceryItem } from '@/store/groceryStore';
import { catDotColor } from './types';

// ─── Item Card — Figma "Shared groceries" list row ───────────────────────────

export function ItemCard({ item, members, selected, selecting, onBuy, onLongPress, onToggleSelect, onPress, onEdit, onDelete, onMoveStore, colors, isDark, priceInfo, isLast }: {
  item: GroceryItem; members: any[];
  selected: boolean; selecting: boolean; isLast?: boolean;
  onBuy: () => void; onLongPress: () => void; onToggleSelect: () => void;
  onPress: () => void; onEdit: () => void; onDelete?: () => void;
  onMoveStore?: () => void;
  colors: any; isDark: boolean;
  priceInfo?: { price: number | null; unit: string | null; source: 'kroger' | 'receipt' | 'estimate' | 'unrecognized' | 'unknown' };
}) {
  const isBought = item.isBought;
  const P = colors.primary;

  // "Needed · Maya · 09:10" — added-by member name + time
  const addedByMember = members.find((m: any) => m.id === item.addedBy);
  const addedByName = addedByMember?.name?.split(' ')[0] ?? null;
  const addedTime = item.createdAt
    ? new Date(item.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null;

  const priceStr = priceInfo?.price != null
    ? `$${priceInfo.price.toFixed(2)}`
    : item.estimatedPrice != null
      ? `$${item.estimatedPrice.toFixed(2)}`
      : null;

  // Main label: "Tomatoes" or "Tomatoes · 1 pack · $1.80"
  const titleParts = [item.name];
  if (item.quantity) titleParts.push(item.quantity);
  if (priceStr) titleParts.push(priceStr);

  // Subtitle: "Needed · Maya · 09:10" or notes
  const subtitleParts: string[] = [];
  if (!isBought) subtitleParts.push('Needed');
  if (addedByName) subtitleParts.push(addedByName);
  if (addedTime) subtitleParts.push(addedTime);
  if (item.notes) subtitleParts.push(item.notes);

  return (
    <Pressable
      onPress={selecting ? onToggleSelect : onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 0,
        backgroundColor: pressed ? (isDark ? colors.primary + '10' : colors.primaryLight + '60') : 'transparent',
        opacity: isBought ? 0.45 : 1,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      })}
    >
      {/* Circle checkbox */}
      <Pressable
        onPress={isBought ? undefined : onBuy}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginRight: 14 }}>
        {selecting ? (
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2,
            borderColor: selected ? P : colors.textTertiary,
            backgroundColor: selected ? P : 'transparent',
            alignItems: 'center', justifyContent: 'center' }}>
            {selected && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
          </View>
        ) : (
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
            borderColor: isBought ? colors.success : colors.textTertiary,
            backgroundColor: isBought ? colors.success + '20' : 'transparent',
            alignItems: 'center', justifyContent: 'center' }}>
            {isBought && <Ionicons name="checkmark" size={12} color={colors.success} />}
          </View>
        )}
      </Pressable>

      {/* Body */}
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: 15, fontWeight: '600',
          color: isBought ? colors.textTertiary : colors.textPrimary,
          textDecorationLine: isBought ? 'line-through' : 'none',
        }} numberOfLines={2}>
          {titleParts.join(' · ')}
        </Text>
        {subtitleParts.length > 0 && (
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
            {subtitleParts.join(' · ')}
          </Text>
        )}
        {priceInfo?.source === 'unrecognized' && (
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, fontStyle: 'italic', marginTop: 2 }}>
            not recognized
          </Text>
        )}
      </View>

      {/* Right: move-store + drag handle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {onMoveStore && !isBought && !selecting && (
          <Pressable onPress={onMoveStore} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="storefront-outline" size={15} color={colors.textTertiary} />
          </Pressable>
        )}
        {/* Figma: ⋮⋮ drag handle */}
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ellipsis-vertical" size={16} color={colors.textTertiary} />
        </View>
      </View>
    </Pressable>
  );
}
