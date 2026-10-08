import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ─── CubeAI Grocery Banner — Figma white card style ──────────────────────────

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
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#DFE5EF',
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
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Pressable onPress={onScan}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#FFFFFF',
              borderWidth: 1, borderColor: '#DFE5EF' }}>
            <Ionicons name="receipt-outline" size={16} color={P} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: P }}>Scan Receipt</Text>
          </Pressable>
          <Pressable onPress={onPriceCheck} disabled={priceLoading}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, paddingVertical: 12, borderRadius: 14,
              backgroundColor: pricesLoaded ? colors.tealLight : '#FFFFFF',
              borderWidth: 1, borderColor: pricesLoaded ? colors.teal : '#DFE5EF' }}>
            {priceLoading
              ? <ActivityIndicator size="small" color={P} />
              : <Ionicons name="pricetag-outline" size={16} color={pricesLoaded ? colors.teal : P} />}
            <Text style={{ fontSize: 13, fontWeight: '700', color: pricesLoaded ? colors.teal : P }}>
              {pricesLoaded ? 'Prices ✓' : 'Price Check'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
