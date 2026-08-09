import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Animated, Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/lib/ThemeContext';
import { format } from 'date-fns';

// ── Wheel picker item height ────────────────────────────────────────────────
const ITEM_H = 44;
const VISIBLE = 5; // odd number so middle item is the selection

function range(start: number, end: number) {
  const arr: number[] = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
}

interface WheelProps {
  items: { label: string; value: number }[];
  selected: number;
  onChange: (v: number) => void;
  accent: string;
  colors: any;
}

function Wheel({ items, selected, onChange, accent, colors }: WheelProps) {
  const idx = Math.max(0, items.findIndex(i => i.value === selected));
  const ref = useRef<ScrollView>(null);
  const scrollY = useRef(idx * ITEM_H);

  useEffect(() => {
    ref.current?.scrollTo({ y: idx * ITEM_H, animated: false });
  }, []);

  const onMomentumEnd = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const i = Math.round(y / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    scrollY.current = clamped * ITEM_H;
    ref.current?.scrollTo({ y: clamped * ITEM_H, animated: true });
    onChange(items[clamped].value);
  };

  const onScrollEnd = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const i = Math.round(y / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    if (Math.abs(y - clamped * ITEM_H) > 2) {
      ref.current?.scrollTo({ y: clamped * ITEM_H, animated: true });
      onChange(items[clamped].value);
    }
  };

  const containerH = ITEM_H * VISIBLE;
  const padding = ITEM_H * Math.floor(VISIBLE / 2);

  return (
    <View style={{ height: containerH, overflow: 'hidden' }}>
      {/* selection highlight */}
      <View pointerEvents="none" style={[sw.selBar, {
        top: padding,
        borderColor: accent + '40',
        backgroundColor: accent + '12',
      }]} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: padding }}
        onMomentumScrollEnd={onMomentumEnd}
        onScrollEndDrag={onScrollEnd}
      >
        {items.map((item, i) => {
          const isSelected = item.value === selected;
          return (
            <TouchableOpacity
              key={item.value}
              activeOpacity={0.7}
              onPress={() => {
                onChange(item.value);
                ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              }}
              style={sw.item}
            >
              <Text style={[sw.itemText, {
                color: isSelected ? accent : colors.textSecondary,
                fontWeight: isSelected ? '700' : '400',
                fontSize: isSelected ? 18 : 15,
              }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const sw = StyleSheet.create({
  selBar:  { position: 'absolute', left: 0, right: 0, height: ITEM_H, borderTopWidth: 1, borderBottomWidth: 1, borderRadius: 10 },
  item:    { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText:{ letterSpacing: 0.3 },
});

// ── Month names ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const HOURS_12 = range(1, 12).map(h => ({ label: String(h), value: h }));
const MINUTES  = range(0, 59).map(m => ({ label: String(m).padStart(2, '0'), value: m }));
const AMPM = [{ label: 'AM', value: 0 }, { label: 'PM', value: 1 }];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// ── Android custom picker modal ─────────────────────────────────────────────
interface AndroidPickerProps {
  visible: boolean;
  value: Date;
  mode: 'date' | 'time';
  minimumDate?: Date;
  maximumDate?: Date;
  accent: string;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

function AndroidPicker({ visible, value, mode, minimumDate, maximumDate, accent, onConfirm, onCancel }: AndroidPickerProps) {
  const { colors, isDark } = useTheme();

  // Date state
  const [year,  setYear]  = useState(value.getFullYear());
  const [month, setMonth] = useState(value.getMonth());
  const [day,   setDay]   = useState(value.getDate());

  // Time state
  const rawH = value.getHours();
  const [hour12, setHour12] = useState(rawH === 0 ? 12 : rawH > 12 ? rawH - 12 : rawH);
  const [minute, setMinute] = useState(value.getMinutes());
  const [ampm,   setAmpm]   = useState(rawH < 12 ? 0 : 1);

  // Reset when value changes
  useEffect(() => {
    setYear(value.getFullYear());
    setMonth(value.getMonth());
    setDay(value.getDate());
    const h = value.getHours();
    setHour12(h === 0 ? 12 : h > 12 ? h - 12 : h);
    setMinute(value.getMinutes());
    setAmpm(h < 12 ? 0 : 1);
  }, [value, visible]);

  const currentYear = new Date().getFullYear();
  const minYear = minimumDate ? minimumDate.getFullYear() : currentYear - 30;
  const maxYear = maximumDate ? maximumDate.getFullYear() : currentYear + 10;
  const years  = range(minYear, maxYear).map(y => ({ label: String(y), value: y }));
  const months = MONTHS.map((m, i) => ({ label: m, value: i }));
  const numDays = daysInMonth(year, month);
  const days = range(1, numDays).map(d => ({ label: String(d), value: d }));

  const handleConfirm = () => {
    let result: Date;
    if (mode === 'date') {
      const safeDay = Math.min(day, numDays);
      result = new Date(year, month, safeDay, 12, 0, 0);
    } else {
      let h24 = hour12 % 12 + (ampm === 1 ? 12 : 0);
      result = new Date(value.getFullYear(), value.getMonth(), value.getDate(), h24, minute, 0);
    }
    onConfirm(result);
  };

  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(300);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
      </Animated.View>

      <Animated.View style={[ap.sheet, {
        backgroundColor: colors.card,
        transform: [{ translateY: slideAnim }],
      }]}>
        {/* Header */}
        <View style={[ap.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onCancel} style={ap.headerBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[ap.headerTitle, { color: colors.textPrimary }]}>
            {mode === 'date' ? 'Select Date' : 'Select Time'}
          </Text>
          <TouchableOpacity onPress={handleConfirm} style={ap.headerBtn}>
            <Text style={{ color: accent, fontSize: 15, fontWeight: '700' }}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Wheels */}
        <View style={ap.wheels}>
          {mode === 'date' ? (
            <>
              <View style={{ flex: 1.4 }}>
                <Wheel items={months} selected={month} onChange={setMonth} accent={accent} colors={colors} />
              </View>
              <View style={{ flex: 0.8 }}>
                <Wheel items={days} selected={Math.min(day, numDays)} onChange={setDay} accent={accent} colors={colors} />
              </View>
              <View style={{ flex: 1.2 }}>
                <Wheel items={years} selected={year} onChange={setYear} accent={accent} colors={colors} />
              </View>
            </>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <Wheel items={HOURS_12} selected={hour12} onChange={setHour12} accent={accent} colors={colors} />
              </View>
              <Text style={[ap.colon, { color: colors.textPrimary }]}>:</Text>
              <View style={{ flex: 1 }}>
                <Wheel items={MINUTES} selected={minute} onChange={setMinute} accent={accent} colors={colors} />
              </View>
              <View style={{ flex: 0.9 }}>
                <Wheel items={AMPM} selected={ampm} onChange={setAmpm} accent={accent} colors={colors} />
              </View>
            </>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const ap = StyleSheet.create({
  sheet:       { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerBtn:   { minWidth: 60, paddingVertical: 4 },
  wheels:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  colon:       { fontSize: 22, fontWeight: '700', alignSelf: 'center', marginHorizontal: 2 },
});

// ── Public API ───────────────────────────────────────────────────────────────

export interface AppDateTimePickerProps {
  /** Whether to show the picker */
  visible: boolean;
  /** Current selected value */
  value: Date;
  /** 'date' or 'time' */
  mode: 'date' | 'time';
  /** Called when user confirms a value */
  onConfirm: (date: Date) => void;
  /** Called when user cancels or dismisses */
  onCancel: () => void;
  /** Accent / brand color for highlights */
  accent?: string;
  /** Minimum selectable date (date mode only) */
  minimumDate?: Date;
  /** Maximum selectable date (date mode only) */
  maximumDate?: Date;
  /** Dark/light theme variant for iOS (defaults to auto) */
  themeVariant?: 'dark' | 'light';
}

/**
 * Cross-platform date/time picker.
 * - iOS date: native inline calendar — tapping a day confirms immediately, no Set button.
 * - iOS time: spinner with Cancel / Done.
 * - Android: polished scroll-wheel modal (no vanilla system dialog).
 */
export default function AppDateTimePicker({
  visible, value, mode, onConfirm, onCancel,
  accent = '#7C5CBF', minimumDate, maximumDate, themeVariant,
}: AppDateTimePickerProps) {
  const { colors, isDark } = useTheme();
  const [iosTimeTemp, setIosTimeTemp] = useState(value);

  useEffect(() => { setIosTimeTemp(value); }, [value, visible]);

  if (!visible) return null;

  if (Platform.OS === 'android') {
    return (
      <AndroidPicker
        visible={visible}
        value={value}
        mode={mode}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        accent={accent}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
  }

  // iOS: both date and time in a bottom Modal so they never render inline or block touches
  const safeValue = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();
  const safeTemp  = iosTimeTemp instanceof Date && !isNaN(iosTimeTemp.getTime()) ? iosTimeTemp : new Date();
  const themeVar  = themeVariant ?? (isDark ? 'dark' : 'light');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={onCancel} />
      <View style={[ios.sheet, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }]}>
        {/* Header */}
        <View style={[ios.header, { borderBottomColor: isDark ? '#38383A' : '#C6C6C8' }]}>
          <TouchableOpacity onPress={onCancel} style={ios.headerBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
            {mode === 'date' ? 'Select Date' : 'Select Time'}
          </Text>
          <TouchableOpacity
            onPress={() => onConfirm(mode === 'date' ? safeValue : safeTemp)}
            style={ios.headerBtn}>
            <Text style={{ color: accent, fontSize: 15, fontWeight: '700' }}>Done</Text>
          </TouchableOpacity>
        </View>

        {mode === 'date' ? (
          <DateTimePicker
            value={safeValue}
            mode="date"
            display="inline"
            themeVariant={themeVar}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            accentColor={accent}
            onChange={(_, d) => { if (d) onConfirm(d); }}
            style={{ width: '100%' }}
          />
        ) : (
          <DateTimePicker
            value={safeTemp}
            mode="time"
            display="spinner"
            themeVariant={themeVar}
            onChange={(_, d) => { if (d) setIosTimeTemp(d); }}
            style={{ width: '100%' }}
          />
        )}
      </View>
    </Modal>
  );
}

const ios = StyleSheet.create({
  sheet:     { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, overflow: 'hidden' },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { minWidth: 60, paddingVertical: 4 },
});
