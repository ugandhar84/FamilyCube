import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  format, isToday, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, isSameMonth,
} from 'date-fns';
import { TypeIcon } from './TypeIcon';
import { type EntryType, TYPE_LABEL } from './journalTypes';
import { TYPO } from '@/constants/theme';

export const FullMonthCalendar = React.memo(function FullMonthCalendar({ month, selected, entryMap, accentColor, colors, typeColors, onDayPress, onPrevMonth, onNextMonth }: {
  month: Date; selected: Date; entryMap: Map<string, EntryType[]>;
  accentColor: string; colors: any; typeColors: Record<EntryType, string>;
  onDayPress: (d: Date) => void; onPrevMonth: () => void; onNextMonth: () => void;
}) {
  const today = new Date();
  const days  = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const pad   = (getDay(days[0]) + 6) % 7;
  const cells = [...Array(pad).fill(null), ...days];

  return (
    <View>
      {/* Month navigation */}
      <View style={mc.nav}>
        <TouchableOpacity onPress={onPrevMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[mc.monthTitle, { color: colors.textPrimary }]}>{format(month, 'MMMM yyyy')}</Text>
        <TouchableOpacity
          onPress={onNextMonth} disabled={isSameMonth(month, today)}
          style={{ opacity: isSameMonth(month, today) ? 0.2 : 1 }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary ?? colors.textSecondary }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day cells */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          if (!day) return <View key={`p-${i}`} style={{ width: `${100/7}%`, height: 50 }} />;
          const key    = format(day, 'yyyy-MM-dd');
          const types  = entryMap.get(key) ?? [];
          const isSel  = isSameDay(day, selected);
          const isTod  = isToday(day);
          const isFut  = day > today && !isTod;
          const dotClr = [...new Set(types)].slice(0, 3).map(t => typeColors[t]);
          return (
            <TouchableOpacity key={key} disabled={isFut} activeOpacity={0.7}
              onPress={() => onDayPress(day)}
              style={{ width: `${100/7}%`, height: 50, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSel ? accentColor : isTod ? `${accentColor}18` : 'transparent',
                borderWidth: isTod && !isSel ? 1.5 : 0, borderColor: accentColor,
              }}>
                <Text style={{
                  fontSize: TYPO.body, fontWeight: (isSel || isTod) ? '700' : '400',
                  color: isSel ? '#fff' : isFut ? (colors.textTertiary ?? '#999') : isTod ? accentColor : colors.textPrimary,
                  opacity: isFut ? 0.3 : 1,
                }}>{format(day, 'd')}</Text>
              </View>
              {dotClr.length > 0 && !isFut && (
                <View style={{ flexDirection: 'row', gap: 2, position: 'absolute', bottom: 3 }}>
                  {dotClr.map((c, di) => <View key={di} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSel ? 'rgba(255,255,255,0.85)' : c }} />)}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 12, paddingBottom: 4 }}>
        {(Object.entries(typeColors) as [EntryType, string][]).map(([t, c]) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{TYPE_LABEL[t]}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

const mc = StyleSheet.create({
  nav:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  monthTitle: { fontSize: TYPO.subheading, fontWeight: '800' },
});
