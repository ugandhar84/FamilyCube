import { useState, useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DotConfig {
  /** YYYY-MM-DD dates that have data */
  dates: string[];
  color: string;
  key: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export type DateFilter = { type: 'single'; date: string } | { type: 'range'; range: DateRange } | null;

interface Props {
  dots: DotConfig[];
  filter: DateFilter;
  onFilter: (f: DateFilter) => void;
  accent?: string;
  /** Start expanded (e.g. when rendered inside a modal) */
  initialExpanded?: boolean;
  /** Hide the outer card wrapper (e.g. when host already provides a card) */
  noCard?: boolean;
}

function datesBetween(start: string, end: string): string[] {
  const result: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    result.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function formatLabel(filter: DateFilter): string {
  if (!filter) return 'Filter by date';
  if (filter.type === 'single') return `Day: ${filter.date}`;
  return `Range: ${filter.range.start} → ${filter.range.end}`;
}

export default function CalendarFilter({ dots, filter, onFilter, accent: accentProp, initialExpanded = false, noCard = false }: Props) {
  const { colors } = useTheme();
  const accent = accentProp ?? colors.primary;
  const [expanded, setExpanded] = useState(initialExpanded);
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [rangeStart, setRangeStart] = useState<string | null>(null);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };

  const clear = () => {
    setRangeStart(null);
    onFilter(null);
  };

  const switchMode = (m: 'single' | 'range') => {
    setMode(m);
    setRangeStart(null);
    onFilter(null);
  };

  const handleDay = (day: { dateString: string }) => {
    const d = day.dateString;
    if (mode === 'single') {
      const current = filter?.type === 'single' ? filter.date : null;
      onFilter(current === d ? null : { type: 'single', date: d });
      return;
    }
    // range mode: first tap = start, second tap = end (or reset if same)
    if (!rangeStart) {
      setRangeStart(d);
      onFilter({ type: 'range', range: { start: d, end: d } });
    } else if (d === rangeStart) {
      setRangeStart(null);
      onFilter(null);
    } else {
      const [s, e] = d < rangeStart ? [d, rangeStart] : [rangeStart, d];
      setRangeStart(null);
      onFilter({ type: 'range', range: { start: s, end: e } });
    }
  };

  const markedDates = useMemo(() => {
    const map: Record<string, any> = {};

    // dot indicators for data presence
    for (const cfg of dots) {
      for (const d of cfg.dates) {
        if (!map[d]) map[d] = { dots: [] };
        map[d].dots = [...(map[d].dots ?? []), { color: cfg.color, key: cfg.key }];
      }
    }

    if (filter?.type === 'single') {
      const d = filter.date;
      map[d] = { ...(map[d] ?? {}), selected: true, selectedColor: accent };
    } else if (filter?.type === 'range') {
      const { start, end } = filter.range;
      const days = datesBetween(start, end);
      for (let i = 0; i < days.length; i++) {
        const d = days[i];
        const isFirst = i === 0;
        const isLast = i === days.length - 1;
        map[d] = {
          ...(map[d] ?? {}),
          color: accent,
          textColor: '#fff',
          startingDay: isFirst,
          endingDay: isLast,
        };
      }
    } else if (rangeStart) {
      // mid-selection: highlight start
      map[rangeStart] = { ...(map[rangeStart] ?? {}), selected: true, selectedColor: accent + 'AA' };
    }

    return map;
  }, [dots, filter, rangeStart, accent]);

  const markingType = filter?.type === 'range' || rangeStart ? 'period' : 'multi-dot';

  return (
    <View style={noCard ? undefined : [s.wrapper, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <TouchableOpacity style={s.header} onPress={toggle} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={16} color={filter ? accent : colors.textSecondary} />
        <Text style={[s.label, { color: filter ? accent : colors.textPrimary }]}>
          {formatLabel(filter)}
        </Text>
        {filter && (
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={clear}>
            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textSecondary}
          style={{ marginLeft: 'auto' }}
        />
      </TouchableOpacity>

      {expanded && (
        <>
          {/* Mode toggle */}
          <View style={[s.modeRow, { borderColor: colors.border }]}>
            {(['single', 'range'] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[s.modeBtn, mode === m && { backgroundColor: accent }]}
                onPress={() => switchMode(m)}
              >
                <Text style={[s.modeTxt, { color: mode === m ? '#fff' : colors.textSecondary }]}>
                  {m === 'single' ? 'Single day' : 'Date range'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {mode === 'range' && !filter && rangeStart && (
            <Text style={[s.hint, { color: colors.textSecondary }]}>
              Tap end date to complete range
            </Text>
          )}
          <Calendar
            key={markingType}
            markingType={markingType}
            markedDates={markedDates}
            onDayPress={handleDay}
            theme={{
              backgroundColor: colors.card,
              calendarBackground: colors.card,
              textSectionTitleColor: colors.textSecondary,
              selectedDayBackgroundColor: accent,
              selectedDayTextColor: '#fff',
              todayTextColor: accent,
              dayTextColor: colors.textPrimary,
              textDisabledColor: colors.textSecondary + '60',
              dotColor: accent,
              selectedDotColor: '#fff',
              arrowColor: accent,
              monthTextColor: colors.textPrimary,
              indicatorColor: accent,
            }}
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: { fontSize: 14, fontWeight: '500' },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  modeTxt: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 14, textAlign: 'center', paddingBottom: 6 },
});
