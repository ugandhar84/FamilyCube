import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type Partner } from '@/lib/discovery';
import { TYPO } from '@/constants/theme';

const CATEGORY_VARIANTS: Record<string, { emoji: string; grad: [string, string] }[]> = {
  vet:      [{ emoji: '🏥', grad: ['#C9B8EC','#7C5CBF'] }, { emoji: '🩺', grad: ['#B8D4EC','#3A7BD5'] }, { emoji: '❤️', grad: ['#F5B8C8','#D5314A'] }],
  grooming: [{ emoji: '✂️', grad: ['#F5C9A8','#FF8C55'] }, { emoji: '🛁', grad: ['#A8D4F5','#4A9FD5'] }, { emoji: '🪮', grad: ['#F5A8D0','#D5317A'] }],
  food:     [{ emoji: '🦴', grad: ['#A8E6DA','#4ECDC4'] }, { emoji: '🛒', grad: ['#B8F5A8','#3FAF2A'] }, { emoji: '🥩', grad: ['#F5A8A8','#D53030'] }],
  boarding: [{ emoji: '🏠', grad: ['#F5DCA8','#E8A320'] }, { emoji: '🐕', grad: ['#C4D4F5','#4A6FD5'] }, { emoji: '🌙', grad: ['#C4A8F5','#7040D5'] }],
  training: [{ emoji: '🎾', grad: ['#A8F0C6','#2ECC71'] }, { emoji: '🌳', grad: ['#B8F5A8','#2F9E1A'] }],
  other:    [{ emoji: '🐾', grad: ['#C9B8EC','#7C5CBF'] }],
};

function placeVariant(id: string, cat: string) {
  const variants = CATEGORY_VARIANTS[cat] ?? CATEGORY_VARIANTS.other;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return variants[hash % variants.length];
}

function distLabel(km: number | null, useMetric: boolean): string | null {
  if (km == null) return null;
  if (useMetric) return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  const miles = km * 0.621371;
  return miles < 0.1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`;
}

export const PlaceCard = React.memo(function PlaceCard({ place, cardWidth, colors, isDark, useMetric }: {
  place: Partner; cardWidth: number; colors: any; isDark: boolean; useMetric: boolean;
}) {
  const scaleAnim   = useRef(new Animated.Value(0.94)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const variant     = placeVariant(place.id, place.category);
  const accent      = place.accent_color ?? variant.grad[1];
  const dist        = distLabel(place.distance_km, useMetric);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim,   { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ width: cardWidth, marginBottom: 10, transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
      <View style={[s.card, { backgroundColor: isDark ? '#1A1530' : '#fff', borderColor: isDark ? '#2A2045' : '#EDEBF5' }]}>
        {/* Compact banner */}
        <LinearGradient colors={variant.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
          {place.image_url
            ? <Animated.Image source={{ uri: place.image_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            : <Text style={s.bannerEmoji}>{variant.emoji}</Text>
          }
          {/* Top-right: rating or 24h */}
          {place.is_24h
            ? <View style={[s.badge, { backgroundColor: '#16A34A' }]}><Text style={s.badgeTxt}>24h</Text></View>
            : place.rating != null
              ? <View style={[s.badge, { backgroundColor: '#00000055' }]}><Text style={s.badgeTxt}>★{place.rating.toFixed(1)}</Text></View>
              : null
          }
          {/* Bottom-left: distance */}
          {!!dist && (
            <View style={s.distBadge}>
              <Ionicons name="location" size={8} color="#fff" />
              <Text style={s.distTxt}>{dist}</Text>
            </View>
          )}
        </LinearGradient>

        {/* Info */}
        <View style={s.info}>
          <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={2}>{place.name}</Text>
          {!!place.city && (
            <Text style={[s.city, { color: colors.textSecondary }]} numberOfLines={1}>{place.city}</Text>
          )}
        </View>

        {/* CTA row — directions bottom-left, call bottom-right */}
        <View style={s.ctaRow}>
          {/* Directions — always left */}
          {place.cta_url ? (
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: accent + '18' }]}
              onPress={() => Linking.openURL(place.cta_url!).catch(() => {})}
              activeOpacity={0.75}
            >
              <Ionicons name="navigate-outline" size={17} color={accent} />
            </TouchableOpacity>
          ) : (
            <View style={[s.ctaBtn, { backgroundColor: colors.border + '60' }]}>
              <Ionicons name="navigate-outline" size={17} color={colors.textTertiary ?? colors.textSecondary} />
            </View>
          )}

          {/* Phone — always right */}
          {place.phone ? (
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: accent + '18' }]}
              onPress={() => Linking.openURL(`tel:${place.phone}`).catch(() => {})}
              activeOpacity={0.75}
            >
              <Ionicons name="call-outline" size={17} color={accent} />
            </TouchableOpacity>
          ) : (
            <View style={[s.ctaBtn, { backgroundColor: colors.border + '60' }]}>
              <Ionicons name="call-outline" size={17} color={colors.textTertiary ?? colors.textSecondary} opacity={0.35} />
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
});

const s = StyleSheet.create({
  card:         { flex: 1, borderRadius: 14, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  banner:       { height: 100, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bannerEmoji:  { fontSize: 40, opacity: 0.88 },
  badge:        { position: 'absolute', top: 7, right: 7, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  badgeTxt:     { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  distBadge:    { position: 'absolute', bottom: 6, left: 7, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#00000055', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  distTxt:      { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  info:         { padding: 9, gap: 2 },
  name:         { fontSize: TYPO.body, fontWeight: '700', lineHeight: 16 },
  city:         { fontSize: TYPO.body, fontWeight: '500' },
  ctaRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 9, paddingBottom: 9 },
  ctaBtn:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
