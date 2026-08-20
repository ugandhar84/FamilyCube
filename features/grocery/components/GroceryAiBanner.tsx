import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ─── CubeAI Grocery Banner ───────────────────────────────────────────────────

export function GroceryAiBanner({ isDark, colors, onScan, onPriceCheck, pricesLoaded, priceLoading }: {
  isDark: boolean; colors: any;
  onScan: () => void; onPriceCheck: () => void;
  pricesLoaded: boolean; priceLoading: boolean;
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
    <View style={{ paddingHorizontal: 16, paddingTop: 4, marginBottom: 6 }}>
      {/* Header row */}
      <Pressable onPress={() => setExpanded(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
        {/* Bot icon + pulse */}
        <View style={{ width: 28, height: 28 }}>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: P + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={14} color={P} />
          </View>
          <View style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }} />
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
          </View>
        </View>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          CubeAI Shopping
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: P }}>{expanded ? 'Collapse' : 'Tools'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={P} />
        </View>
      </Pressable>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />

      <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: expanded ? 12 : 0 }}>
        Scan receipts · estimate prices
      </Text>

      {/* Expanded tools */}
      {expanded && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Scan Receipt */}
          <Pressable onPress={onScan} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 14, backgroundColor: P + '15', borderWidth: 1, borderColor: P + '40' }}>
            <Ionicons name="receipt-outline" size={14} color={P} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: P }}>Scan Receipt</Text>
          </Pressable>
          {/* Price Estimate */}
          <Pressable onPress={onPriceCheck} disabled={priceLoading} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 14, backgroundColor: pricesLoaded ? colors.successLight : colors.surface, borderWidth: 1, borderColor: pricesLoaded ? colors.success : colors.border }}>
            {priceLoading
              ? <ActivityIndicator size="small" color={P} />
              : <Ionicons name="pricetag-outline" size={14} color={pricesLoaded ? colors.success : P} />}
            <Text style={{ fontSize: 12, fontWeight: '800', color: pricesLoaded ? colors.success : P }}>
              {pricesLoaded ? 'Prices ✓' : 'Price Check'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
