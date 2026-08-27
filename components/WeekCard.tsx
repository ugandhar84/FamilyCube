import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, isToday } from 'date-fns';

type Props = {
  weekStart: Date;
  /** Selected day as 'yyyy-MM-dd' string */
  selectedDate: string;
  accentColor: string;
  colors: any;
  /** Called when the user taps ← (previous week) */
  onPrevWeek: () => void;
  /** Called when the user taps → (next week) */
  onNextWeek: () => void;
  /** When true the → arrow is greyed-out and non-interactive */
  nextWeekDisabled: boolean;
  /** Called with the tapped day's 'yyyy-MM-dd' key */
  onSelectDay: (dateKey: string) => void;
  /** Opens the full-month calendar picker */
  onOpenCalendar: () => void;
  /**
   * Optional: return an array of hex color strings for the dots shown below
   * each day circle. Pass nothing (or return []) for no dots.
   */
  getDots?: (dateKey: string) => string[];
};

function dateKey(d: Date) { return format(d, 'yyyy-MM-dd'); }

export default function WeekCard({
  weekStart, selectedDate, accentColor, colors,
  onPrevWeek, onNextWeek, nextWeekDisabled,
  onSelectDay, onOpenCalendar, getDots,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isTodaySelected = selectedDate === dateKey(new Date());

  return (
    <View style={[s.card, { backgroundColor: colors.card }]}>
      {/* ── Nav row ── */}
      <View style={s.navRow}>
        <TouchableOpacity
          style={s.arrow}
          onPress={onPrevWeek}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={s.dateBtn} onPress={onOpenCalendar} activeOpacity={0.7}>
          <Text style={[s.dateLabel, { color: colors.textPrimary }]}>
            {isTodaySelected ? 'Today' : format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d')}
          </Text>
          <Ionicons name="calendar-outline" size={14} color={accentColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.arrow}
          disabled={nextWeekDisabled}
          onPress={onNextWeek}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
            style={{ opacity: nextWeekDisabled ? 0.2 : 1 }}
          />
        </TouchableOpacity>
      </View>

      {/* ── 7-day strip ── */}
      <View style={s.stripRow}>
        {days.map(day => {
          const key   = dateKey(day);
          const isSel = key === selectedDate;
          const isTod = isToday(day);
          const isFut = day > new Date() && !isTod;
          const dots  = (!isFut && getDots) ? getDots(key) : [];
          return (
            <TouchableOpacity
              key={key}
              style={s.cell}
              onPress={() => onSelectDay(key)}
              disabled={isFut}
              activeOpacity={0.7}>
              <Text style={[s.dow, {
                color: isSel ? accentColor : (colors.textTertiary ?? colors.textSecondary),
                opacity: isFut ? 0.3 : 1,
              }]}>
                {format(day, 'EEE').toUpperCase().slice(0, 2)}
              </Text>
              <View style={[s.circle, {
                backgroundColor: isSel ? accentColor : isTod ? accentColor + '18' : 'transparent',
                borderWidth: isTod && !isSel ? 1.5 : 0,
                borderColor: accentColor,
              }]}>
                <Text style={[s.num, {
                  color: isSel ? '#fff' : isTod ? accentColor : colors.textPrimary,
                  fontWeight: (isSel || isTod) ? '700' : '400',
                  opacity: isFut ? 0.3 : 1,
                }]}>{format(day, 'd')}</Text>
              </View>
              {dots.length > 0 && (
                <View style={s.dotRow}>
                  {dots.slice(0, 3).map((c, i) => (
                    <View key={i} style={[s.dot, { backgroundColor: c }]} />
                  ))}
                  {dots.length > 3 && (
                    <View style={[s.dot, { backgroundColor: colors.textTertiary ?? colors.textSecondary }]} />
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Was elevation: 0 — deliberately zeroed Android's depth cue while iOS
  // got a (subtle) shadow, so this card read as visually flatter on
  // Android than iOS for no apparent reason. Small, matched elevation
  // instead so both platforms show the same subtle lift.
  card:    { marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1 },
  navRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  arrow:   { padding: 4 },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dateLabel:{ fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  stripRow:{ flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 10 },
  cell:    { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  dow:     { fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  circle:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  num:     { fontSize: 14 },
  dotRow:  { flexDirection: 'row', gap: 2, height: 5, alignItems: 'center' },
  dot:     { width: 4, height: 4, borderRadius: 2 },
});
