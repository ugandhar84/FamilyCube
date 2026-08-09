import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';

function SkeletonPulse({ style }: { style: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return <Animated.View style={[style, { opacity }]} />;
}

function PostSkeleton({ colors, isDark }: { colors: any; isDark: boolean }) {
  const bg = isDark ? '#2A2040' : '#E8E3F5';
  const bgDim = isDark ? '#1E1530' : '#F0EDF9';

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {/* Header: avatar + name + follow pill */}
      <View style={s.header}>
        <SkeletonPulse style={[s.avatar, { backgroundColor: bg }]} />
        <View style={s.headerText}>
          <SkeletonPulse style={[s.line, { width: 120, backgroundColor: bg }]} />
          <SkeletonPulse style={[s.line, { width: 72, marginTop: 6, backgroundColor: bgDim }]} />
        </View>
        <SkeletonPulse style={[s.pill, { backgroundColor: bgDim }]} />
      </View>

      {/* Caption lines */}
      <SkeletonPulse style={[s.line, { width: '92%', backgroundColor: bg, marginTop: 12 }]} />
      <SkeletonPulse style={[s.line, { width: '65%', backgroundColor: bgDim, marginTop: 6 }]} />

      {/* Photo placeholder */}
      <SkeletonPulse style={[s.photo, { backgroundColor: bg }]} />

      {/* Action bar */}
      <View style={s.actions}>
        <SkeletonPulse style={[s.actionBtn, { backgroundColor: bgDim }]} />
        <SkeletonPulse style={[s.actionBtn, { backgroundColor: bgDim }]} />
        <SkeletonPulse style={[s.actionBtn, { backgroundColor: bgDim }]} />
      </View>
    </View>
  );
}

export default function FeedSkeleton({ count = 4 }: { count?: number }) {
  const { colors, isDark } = useTheme();
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} colors={colors} isDark={isDark} />
      ))}
    </>
  );
}

const s = StyleSheet.create({
  card:       { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:     { width: 42, height: 42, borderRadius: 21 },
  headerText: { flex: 1, gap: 0 },
  line:       { height: 13, borderRadius: 7 },
  pill:       { width: 68, height: 28, borderRadius: 14 },
  photo:      { width: '100%', height: 220, borderRadius: 14, marginTop: 12 },
  actions:    { flexDirection: 'row', gap: 18, marginTop: 14 },
  actionBtn:  { width: 56, height: 28, borderRadius: 8 },
});
