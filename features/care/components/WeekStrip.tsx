import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, addDays } from 'date-fns';
import { type EntryType } from './journalTypes';

interface WeekStripProps {
  weekStart: Date;
  selected: Date;
  entryMap: Map<string, EntryType[]>;
  typeColors: Record<EntryType, string>;
  accentColor: string;
  colors: any;
  s: any;
  hasMore: boolean;
  entries: { date: string }[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onSelectDay: (day: Date) => void;
  onOpenCalendar: () => void;
  onLoadMore: () => void;
}

export const WeekStrip = React.memo(function WeekStrip({
  weekStart, selected, entryMap, typeColors, accentColor, colors, s,
  hasMore, entries, onPrevWeek, onNextWeek, onSelectDay, onOpenCalendar, onLoadMore,
}: WeekStripProps) {
  const selStr = format(selected, 'yyyy-MM-dd');
  const nextWeekDisabled = addDays(weekStart, 6) >= new Date();

  return (
    <View style={[s.weekCard, { backgroundColor: colors.card }]}>
      <View style={s.weekNavRow}>
        <TouchableOpacity style={s.weekNavArrow} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => {
            onPrevWeek();
            if (hasMore && entries.length > 0) {
              const oldest = entries[entries.length - 1].date;
              if (format(addDays(weekStart, -7), 'yyyy-MM-dd') <= oldest) onLoadMore();
            }
          }}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={s.weekNavCenter} onPress={onOpenCalendar} activeOpacity={0.7}>
          <Text style={[s.weekNavLabel, { color: colors.textPrimary }]}>
            {isToday(selected) ? 'Today' : format(selected, 'EEE, MMM d')}
          </Text>
          <Ionicons name="calendar-outline" size={14} color={accentColor} />
        </TouchableOpacity>

        <TouchableOpacity style={s.weekNavArrow} disabled={nextWeekDisabled}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onNextWeek}>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary}
            style={{ opacity: nextWeekDisabled ? 0.2 : 1 }} />
        </TouchableOpacity>
      </View>

      <View style={s.weekStripRow}>
        {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(day => {
          const key   = format(day, 'yyyy-MM-dd');
          const isSel = key === selStr;
          const isTod = isToday(day);
          const isFut = day > new Date() && !isTod;
          const types = isFut ? [] : (entryMap.get(key) ?? []);
          const dots  = [...new Set(types)].map(t => typeColors[t]).filter(Boolean) as string[];
          return (
            <TouchableOpacity key={key} style={s.weekStripCell} disabled={isFut} activeOpacity={0.7}
              onPress={() => onSelectDay(day)}>
              <Text style={[s.weekStripDow, {
                color: isSel ? accentColor : (colors.textTertiary ?? colors.textSecondary),
                opacity: isFut ? 0.3 : 1,
              }]}>
                {format(day, 'EEE').toUpperCase().slice(0, 2)}
              </Text>
              <View style={[s.weekStripCircle, {
                backgroundColor: isSel ? accentColor : isTod ? accentColor + '18' : 'transparent',
                borderWidth: isTod && !isSel ? 1.5 : 0,
                borderColor: accentColor,
              }]}>
                <Text style={[s.weekStripNum, {
                  color: isSel ? '#fff' : isTod ? accentColor : colors.textPrimary,
                  fontWeight: (isSel || isTod) ? '700' : '400',
                  opacity: isFut ? 0.3 : 1,
                }]}>{format(day, 'd')}</Text>
              </View>
              {dots.length > 0 && (
                <View style={s.weekStripDotRow}>
                  {dots.slice(0, 3).map((c, di) => (
                    <View key={di} style={[s.weekStripDot, { backgroundColor: c }]} />
                  ))}
                  {dots.length > 3 && <View style={[s.weekStripDot, { backgroundColor: colors.textSecondary }]} />}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});
