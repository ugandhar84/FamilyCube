/**
 * PartnerComponents — nearby partner/service cards for the Home screen Discover section.
 *
 * Exports:
 *  - `PartnerCardItem`  — single partner card with entrance animation (scale + fade),
 *                         banner image/gradient, rating badge, distance label, and CTA buttons.
 *  - `NearbyCarousel`   — horizontal ScrollView of PartnerCardItems; derives the
 *                         visual variant per card from the place id hash so each
 *                         partner in the same category gets a distinct look.
 */
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, ScrollView, Linking, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import LazyImage from '@/components/LazyImage';
import { formatDist } from '@/lib/units';
import { placeVariant, lightenHex } from '@/lib/homeUtils';

// ── PartnerCardItem ───────────────────────────────────────────────────────────
interface PartnerCardItemProps {
  /** Raw partner DB row (typed loosely to avoid coupling to a generated type). */
  p: any;
  /** Position index in the carousel — used to stagger the entrance animation delay. */
  idx: number;
  /** Visual variant (emoji + gradient) computed from the partner's id hash and category. */
  variant: { emoji: string; grad: [string, string] };
  /** Formatted distance string (e.g. "1.2 km") or null when location is unavailable. */
  dist: string | null;
  /** Accent colour for CTA buttons — derived from the partner's accent_color or the variant. */
  accentCol: string;
  /** Banner gradient colours: [light, dark]. Derived from accent_color or variant.grad. */
  bannerGrad: [string, string];
  /** Called when the card is tapped — parent handles navigation or detail sheet. */
  onPress: () => void;
  /** StyleSheet reference passed down from the parent to keep styles co-located there. */
  s: any;
}

export const PartnerCardItem = memo(function PartnerCardItem({
  p, idx, variant, dist, accentCol, bannerGrad, onPress, s,
}: PartnerCardItemProps) {
  const scaleAnim   = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Stagger the entrance animation by 50 ms per card so cards cascade in sequentially
  // rather than all appearing at the same time.
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(scaleAnim,   { toValue: 1, duration: 400, delay: idx * 50, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, delay: idx * 50, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);

  const { colors } = useTheme();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
      <TouchableOpacity style={s.partnerCard} activeOpacity={0.75} onPress={onPress}>
        <LinearGradient colors={bannerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.partnerBanner}>
          {p.image_url
            ? <LazyImage uri={p.image_url} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            : <Text style={{ fontSize: 52, position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -34, opacity: 0.85 }}>{variant.emoji}</Text>
          }
          {p.sponsored && (
            <View style={s.sponsoredTag}>
              <Text style={s.sponsoredTagText}>Sponsored</Text>
            </View>
          )}
          {p.is_24h ? (
            <View style={s.openTag}><Text style={s.openTagText}>● Open</Text></View>
          ) : !p.sponsored && p.rating != null ? (
            <View style={s.ratingTag}><Text style={s.ratingTagText}>★ {p.rating.toFixed(1)}</Text></View>
          ) : null}
        </LinearGradient>

        <View style={s.partnerBody}>
          <Text style={s.partnerName} numberOfLines={1}>{p.name}</Text>
          {!!p.subtitle && <Text style={s.partnerSub} numberOfLines={1}>{p.subtitle}</Text>}
          <View style={s.partnerMetaRow}>
            {p.sponsored && p.rating != null && (
              <Text style={s.partnerRating}>★ {p.rating.toFixed(1)}</Text>
            )}
            {dist
              ? <Text style={s.partnerMeta}>📍 {dist}</Text>
              : p.city ? <Text style={s.partnerMeta}>{p.city}</Text> : null}
            {p.eta_minutes != null && (
              <Text style={s.partnerMeta}>🚗 {p.eta_minutes} min</Text>
            )}
            {p.price_from != null && (
              <Text style={s.partnerPrice}>from ${p.price_from}</Text>
            )}
          </View>
          {(p.phone || p.cta_url || p.address) && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              {/* Directions — left */}
              {(p.cta_url || p.address) ? (
                <TouchableOpacity
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentCol + '22', alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.75}
                  onPress={() => {
                    const addr = p.address ? encodeURIComponent(p.address) : null;
                    const mapsUrl = addr ? `maps://?q=${addr}` : p.cta_url;
                    Linking.openURL(mapsUrl!).catch(() => {
                      if (p.cta_url) Linking.openURL(p.cta_url).catch(() => {});
                    });
                  }}
                >
                  <Ionicons name="navigate-outline" size={17} color={accentCol} />
                </TouchableOpacity>
              ) : <View style={{ width: 36 }} />}
              {/* Phone — right */}
              {!!p.phone ? (
                <TouchableOpacity
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentCol + '22', alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.65}
                  onPress={() => Alert.alert(p.name, p.phone, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Call', onPress: () => Linking.openURL(`tel:${p.phone}`).catch(() => {}) },
                  ])}
                >
                  <Ionicons name="call-outline" size={17} color={accentCol} />
                </TouchableOpacity>
              ) : <View style={{ width: 36 }} />}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ── NearbyCarousel ────────────────────────────────────────────────────────────
interface NearbyCarouselProps {
  /** Sorted list of partner rows to render — typically filtered by the active category chip. */
  partners: any[];
  /** Theme colour tokens. */
  colors: any;
  /** StyleSheet reference from the parent screen. */
  s: any;
  /** Called when a card is pressed — parent handles routing or sheet presentation. */
  onPress: (p: any) => void;
}

export const NearbyCarousel = memo(function NearbyCarousel({ partners, colors, s, onPress }: NearbyCarouselProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.cardRow}
    >
      {partners.map((p, idx) => {
        const catIndex  = partners.filter((x, i) => x.category === p.category && i < idx).length;
        const variant   = placeVariant(p.id, p.category, catIndex);
        const dist      = formatDist(p.distance_km);
        const accentCol = p.accent_color ?? variant.grad[1];
        const bannerGrad: [string, string] = p.accent_color
          ? [lightenHex(p.accent_color, 0.22), p.accent_color]
          : variant.grad;
        return (
          <PartnerCardItem
            key={p.id}
            p={p}
            idx={idx}
            variant={variant}
            dist={dist}
            accentCol={accentCol}
            bannerGrad={bannerGrad}
            onPress={() => onPress(p)}
            s={s}
          />
        );
      })}
    </ScrollView>
  );
});
