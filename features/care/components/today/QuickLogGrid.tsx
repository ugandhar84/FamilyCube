import React from 'react';
import { View, Text, TouchableOpacity, Alert, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

const TILE_PCT = '23%';

interface Props {
  feedingLogs:  Record<string, any[]>;
  checklist:    Record<string, any[]>;
  todayNotes:   Record<string, string>;
  activeId:     string | null;
  today:        string;
  colors:       any;
  pulseAnim:    Animated.Value;
  onMeal:       () => void;
  onTreat:      () => void;
  onWater:      () => void;
  onMood:       () => void;
  onGroom:      () => void;
  onWalk:       () => void;
  onBathroom:   () => void;
  onNote:       () => void;
}

export default function QuickLogGrid({
  feedingLogs, checklist, todayNotes, activeId, today, colors, pulseAnim,
  onMeal, onTreat, onWater, onMood, onGroom, onWalk, onBathroom, onNote,
}: Props) {
  const waterCount = activeId
    ? (feedingLogs[`${activeId}:${today}`] ?? []).filter((f: any) => f.meal_type === 'water').length : 0;

  const walkDone = activeId
    ? (checklist[activeId] ?? []).some((i: any) => i.type === 'walk' && i.completed) : false;

  const bathroomItems = activeId
    ? (checklist[activeId] ?? []).filter((i: any) => i.type === 'bathroom' && i.completed) : [];
  const bathroomColor = bathroomItems.some((i: any) => i.notes === 'blood') ? colors.danger
    : bathroomItems.some((i: any) => i.notes === 'soft' || i.notes === 'hard') ? colors.warning
    : bathroomItems.length > 0 ? ((colors as any).success ?? '#22C55E') : null;

  const hasNote = activeId ? !!todayNotes[activeId] : false;

  const tiles = [
    { icon: 'restaurant-outline', label: 'Meal',     onPress: onMeal,  iconColor: colors.primary },
    { icon: 'fast-food-outline',  label: 'Treat',    onPress: onTreat, iconColor: colors.warning },
    {
      icon: 'water-outline', label: 'Water', onPress: onWater,
      iconColor: (colors as any).info ?? '#3B82F6',
      badge: waterCount > 0 ? String(waterCount) : undefined,
    },
    { icon: 'happy-outline', label: 'Mood', onPress: onMood, iconColor: (colors as any).info ?? '#3B82F6' },
    { icon: 'cut-outline',   label: 'Groom', onPress: onGroom, iconColor: (colors as any).success ?? '#22C55E' },
    {
      icon: 'walk-outline', label: walkDone ? 'Walk ✓' : 'Walk', onPress: onWalk,
      iconColor: walkDone ? ((colors as any).success ?? '#22C55E') : colors.textSecondary,
    },
    {
      icon: 'partly-sunny-outline', label: 'Bathroom', onPress: onBathroom,
      iconColor: bathroomColor ?? colors.textSecondary,
    },
    {
      icon: 'document-text-outline', label: 'Note', onPress: onNote,
      iconColor: hasNote ? colors.primary : colors.textSecondary,
      badge: hasNote ? '●' : undefined,
    },
  ] as { icon: string; label: string; onPress: () => void; iconColor: string; badge?: string }[];

  return (
    <View style={s.section}>
      <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Quick log</Text>
      <View style={s.quickGrid}>
        {tiles.map(({ icon, label, onPress, iconColor, badge }) => (
          <TouchableOpacity key={label} onPress={onPress} activeOpacity={0.65}
            style={[s.quickTile, { backgroundColor: iconColor + '28', borderColor: iconColor + '60' }]}>
            <Animated.View style={[s.quickIcon, { backgroundColor: iconColor + '45', opacity: pulseAnim }]}>
              <Ionicons name={icon as any} size={20} color={iconColor} />
              {badge ? (
                <View style={[s.quickBadge, { backgroundColor: iconColor }]}>
                  <Text style={s.quickBadgeText}>{badge}</Text>
                </View>
              ) : null}
            </Animated.View>
            <Text style={[s.quickLabel, { color: colors.textPrimary }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section:        { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  sectionLabel:   { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  quickGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  quickTile:      { width: TILE_PCT, flexDirection: 'column', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 6 },
  quickIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  quickLabel:     { fontSize: TYPO.label, fontWeight: '700', textAlign: 'center', lineHeight: 13 },
  quickBadge:     { position: 'absolute', top: -4, right: -4, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  quickBadgeText: { fontSize: TYPO.micro, fontWeight: '800', color: '#fff' },
});
