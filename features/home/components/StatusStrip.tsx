import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';

interface StatusStripProps {
  tasksDone: number;
  tasksTotal: number;
  mealsCount: number;
  todayEntryCount: number;
  scheduleCount: number;
  isGlobal?: boolean;
  stripFade: Animated.Value;
  stripY: Animated.Value;
  colors: any;
  s: any;
  /** When true renders as a compact 2×2 widget tile (no outer margin) */
  compact?: boolean;
}

interface StatTileProps {
  icon: string;
  label: string;
  value: string | number;
  sub: string;
  iconColor: string;
  colors: any;
  onPress: () => void;
  valueSuffix?: string;
}

function StatTile({ icon, label, value, sub, iconColor, colors, onPress, valueSuffix }: StatTileProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 9,
        gap: 2,
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={icon as any} size={13} color={iconColor} />
        <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, lineHeight: 23 }} numberOfLines={1}>
        {value}
        {valueSuffix ? <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.textSecondary }}>{valueSuffix}</Text> : null}
      </Text>
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{sub}</Text>
    </TouchableOpacity>
  );
}

export const StatusStrip = React.memo(function StatusStrip({
  tasksDone, tasksTotal, mealsCount, todayEntryCount, scheduleCount,
  isGlobal, stripFade, stripY, colors, s, compact,
}: StatusStripProps) {

  if (compact) {
    // ── Compact 2×2 grid — rendered inside weather+status row ──
    return (
      <Animated.View style={{ flex: 1, opacity: stripFade, transform: [{ translateY: stripY }] }}>
        {isGlobal && (
          <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
            All pets · today
          </Text>
        )}
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            <StatTile
              icon="checkbox-outline"
              label="Tasks"
              value={tasksDone}
              valueSuffix={`/${tasksTotal || '–'}`}
              sub="done today"
              iconColor={colors.primaryText ?? colors.primary}
              colors={colors}
              onPress={() => router.push({ pathname: '/(tabs)/care', params: { section: 'today' } } as any)}
            />
            <StatTile
              icon="restaurant-outline"
              label="Meals"
              value={mealsCount}
              sub="logged"
              iconColor={colors.success ?? '#22C55E'}
              colors={colors}
              onPress={() => router.push({ pathname: '/(tabs)/care', params: { section: 'today' } } as any)}
            />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            <StatTile
              icon="book-outline"
              label="Journal"
              value={todayEntryCount}
              sub="entries"
              iconColor={colors.info}
              colors={colors}
              onPress={() => router.push({ pathname: '/(tabs)/care', params: { section: 'notes' } } as any)}
            />
            <StatTile
              icon="calendar-outline"
              label="Schedule"
              value={scheduleCount}
              sub="today"
              iconColor={colors.primary}
              colors={colors}
              onPress={() => router.push({ pathname: '/(tabs)/care', params: { section: 'health' } } as any)}
            />
          </View>
        </View>
      </Animated.View>
    );
  }

  // ── Legacy full-width strip (kept for backward compat) ──
  return (
    <Animated.View style={{ opacity: stripFade, transform: [{ translateY: stripY }] }}>
      {isGlobal && (
        <Text style={{ fontSize: TYPO.label, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: 16, marginBottom: 4 }}>
          All pets · today
        </Text>
      )}
      <View style={s.summaryRow}>
        <TouchableOpacity style={s.summaryTile} onPress={() => router.push({ pathname: '/(tabs)/care', params: { section: 'today' } } as any)}>
          <View style={s.summaryTileHead}>
            <Ionicons name="checkbox-outline" size={15} color={colors.primaryText ?? colors.primary} />
            <Text style={s.summaryTileLabel}>TASKS</Text>
          </View>
          <Text style={s.summaryTileValue}>
            {tasksDone}
            <Text style={s.summaryTileDivider}>/{tasksTotal || '–'}</Text>
          </Text>
          <Text style={s.summaryTileSub}>done today</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.summaryTile} onPress={() => router.push({ pathname: '/(tabs)/care', params: { section: 'today' } } as any)}>
          <View style={s.summaryTileHead}>
            <Ionicons name="restaurant-outline" size={15} color={colors.success ?? '#22C55E'} />
            <Text style={s.summaryTileLabel}>MEALS</Text>
          </View>
          <Text style={[s.summaryTileValue, { color: mealsCount ? colors.success : undefined }]}>
            {mealsCount}
          </Text>
          <Text style={s.summaryTileSub}>logged today</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.summaryTile} onPress={() => router.push({ pathname: '/(tabs)/care', params: { section: 'notes' } } as any)}>
          <View style={s.summaryTileHead}>
            <Ionicons name="book-outline" size={15} color={colors.info} />
            <Text style={s.summaryTileLabel}>JOURNAL</Text>
          </View>
          <Text style={s.summaryTileValue}>{todayEntryCount}</Text>
          <Text style={s.summaryTileSub}>logged</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.summaryTile} onPress={() => router.push({ pathname: '/(tabs)/care', params: { section: 'health' } } as any)}>
          <View style={s.summaryTileHead}>
            <Ionicons name="calendar-outline" size={15} color={colors.primary} />
            <Text style={s.summaryTileLabel}>SCHEDULE</Text>
          </View>
          <Text style={s.summaryTileValue}>{scheduleCount}</Text>
          <Text style={s.summaryTileSub}>today</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});
