import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ─── CubeAI Grocery Banner — Figma white card style ──────────────────────────

export function GroceryAiBanner({
  isDark, colors, onPriceCheck, pricesLoaded, priceLoading,
  cartTotal, cartItemCount, canCheckPrices,
}: {
  isDark: boolean; colors: any;
  onPriceCheck: () => void;
  pricesLoaded: boolean; priceLoading: boolean;
  // Estimated total — was its own separate pill below this banner;
  // merged in here next to the Price Check action so the total and the
  // button that produces it live in one place [live-requested: "we
  // should have the estimated price in the banner with the check price
  // AI button"].
  cartTotal: number;
  cartItemCount: number;
  // false hides the Price Check button entirely — nothing new for it to
  // do (every unbought item already priced, and the last check was
  // within 24h) [live-requested: "if there is no new items added or we
  // ran last 24hs display the button for ai query"].
  canCheckPrices: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(pulseScale,   { toValue: 2.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(pulseScale,   { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
      ]),
      Animated.delay(300),
    ])).start();
  }, []);

  const P = colors.primary;

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      padding: 16,
      shadowColor: '#172337', shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    }}>
      {/* Header row */}
      <Pressable onPress={() => setExpanded(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Sparkles icon + live dot */}
        <View style={{ width: 44, height: 44 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: P + '15',
            alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={22} color={P} />
          </View>
          <View style={{ position: 'absolute', top: 0, right: 0, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5,
              backgroundColor: colors.success, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }} />
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>CubeAI Shopping</Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 2 }}>
            Scan receipts · estimate prices
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
      </Pressable>

      {/* Expanded tools */}
      {expanded && (
        <View style={{ marginTop: 14, gap: 10 }}>
          {cartTotal > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: colors.primaryLight, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="pricetag-outline" size={14} color={P} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
                  Estimated total · {cartItemCount} item{cartItemCount !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '900', color: P }}>${cartTotal.toFixed(2)}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {canCheckPrices && (
              <Pressable onPress={onPriceCheck} disabled={priceLoading}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 12, borderRadius: 14,
                  backgroundColor: pricesLoaded ? colors.tealLight : '#FFFFFF',
                  borderWidth: 1, borderColor: pricesLoaded ? colors.teal : colors.border }}>
                {priceLoading
                  ? <ActivityIndicator size="small" color={P} />
                  : <Ionicons name="pricetag-outline" size={16} color={pricesLoaded ? colors.teal : P} />}
                <Text style={{ fontSize: 13, fontWeight: '700', color: pricesLoaded ? colors.teal : P }}>
                  {pricesLoaded ? 'Prices ✓' : 'Price Check'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
