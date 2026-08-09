import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';

export function SkeletonBox({ w, h, r = 8, style }: { w?: number | string; h: number; r?: number; style?: any }) {
  const { isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={[
      { width: w ?? '100%', height: h, borderRadius: r,
        backgroundColor: isDark ? '#2A2040' : '#E8E3F5' },
      style,
      { opacity },
    ]} />
  );
}

// ── Card skeleton — white card with 2-3 rows ────────────────────────────────
function CardSkeleton({ rows = 3 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SkeletonBox h={13} w="70%" r={7} />
      {rows >= 2 && <SkeletonBox h={11} w="45%" r={6} style={{ marginTop: 8 }} />}
      {rows >= 3 && <SkeletonBox h={11} w="55%" r={6} style={{ marginTop: 6 }} />}
    </View>
  );
}

// ── Horizontal stat bar ──────────────────────────────────────────────────────
function StatBarSkeleton({ cols = 3 }: { cols?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[s.statBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {Array.from({ length: cols }).map((_, i) => (
        <View key={i} style={s.statItem}>
          <SkeletonBox h={22} w={44} r={6} />
          <SkeletonBox h={11} w={56} r={5} style={{ marginTop: 5 }} />
        </View>
      ))}
    </View>
  );
}

// ── List row skeleton ────────────────────────────────────────────────────────
function RowSkeleton({ icon = true }: { icon?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[s.row, { borderBottomColor: colors.border }]}>
      {icon && <SkeletonBox w={40} h={40} r={20} />}
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox h={13} w="65%" r={6} />
        <SkeletonBox h={11} w="40%" r={5} />
      </View>
      <SkeletonBox w={60} h={28} r={14} />
    </View>
  );
}

// ── Photo grid skeleton ──────────────────────────────────────────────────────
function PhotoGridSkeleton({ cols = 3, rows = 3 }: { cols?: number; rows?: number }) {
  return (
    <View style={s.grid}>
      {Array.from({ length: cols * rows }).map((_, i) => (
        <SkeletonBox key={i} w={`${100 / cols - 1}%` as any} h={110} r={10} />
      ))}
    </View>
  );
}

// ── Hero profile skeleton ────────────────────────────────────────────────────
function HeroSkeleton() {
  return (
    <View style={s.hero}>
      <SkeletonBox w={88} h={88} r={44} />
      <SkeletonBox h={18} w={140} r={9} style={{ marginTop: 12 }} />
      <SkeletonBox h={13} w={90}  r={6} style={{ marginTop: 6 }} />
    </View>
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/** General-purpose page skeleton: stat bar + N card rows */
export function CardListSkeleton({ cards = 4, statCols = 0, showHero = false }: {
  cards?: number; statCols?: number; showHero?: boolean;
}) {
  return (
    <View style={s.page}>
      {showHero && <HeroSkeleton />}
      {statCols > 0 && <StatBarSkeleton cols={statCols} />}
      {Array.from({ length: cards }).map((_, i) => <CardSkeleton key={i} rows={i === 0 ? 3 : 2} />)}
    </View>
  );
}

/** List rows with icon + two text lines */
export function RowListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={s.page}>
      {Array.from({ length: rows }).map((_, i) => <RowSkeleton key={i} />)}
    </View>
  );
}

/** Photo grid for Memories */
export function MemoriesSkeleton() {
  return (
    <View style={s.page}>
      <StatBarSkeleton cols={3} />
      <PhotoGridSkeleton />
    </View>
  );
}

/** Health Centre — stat bar + event cards */
export function HealthSkeleton() {
  return (
    <View style={s.page}>
      <StatBarSkeleton cols={4} />
      {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} rows={3} />)}
    </View>
  );
}

/** Daily Log — mood bar + task rows */
export function DailySkeleton() {
  return (
    <View style={s.page}>
      <SkeletonBox h={64} r={16} style={{ marginHorizontal: 16, marginBottom: 12 }} />
      {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} icon />)}
    </View>
  );
}

/** Journal — entry cards */
export function JournalSkeleton() {
  return (
    <View style={s.page}>
      {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} rows={3} />)}
    </View>
  );
}

/** Notifications — icon + two text lines per row */
export function NotificationsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={s.page}>
      <SkeletonBox h={11} w={80} r={6} style={{ marginHorizontal: 16, marginBottom: 4 }} />
      {Array.from({ length: count }).map((_, i) => <RowSkeleton key={i} icon />)}
    </View>
  );
}

/** Home screen — hero + 3 section cards */
export function HomeSkeleton() {
  return (
    <View style={s.page}>
      <SkeletonBox h={160} r={20} style={{ marginHorizontal: 16, marginBottom: 16 }} />
      <StatBarSkeleton cols={3} />
      {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
    </View>
  );
}

const s = StyleSheet.create({
  page:    { flex: 1, paddingTop: 12, gap: 10 },
  card:    { marginHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 0 },
  statBar: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  statItem:{ flex: 1, alignItems: 'center', gap: 0 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 16 },
  hero:    { alignItems: 'center', paddingVertical: 24 },
});
