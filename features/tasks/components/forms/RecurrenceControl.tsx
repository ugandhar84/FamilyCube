/**
 * RecurrenceControl — the ONE weekday-chip + day-of-month-grid recurrence
 * picker, shared by the Schedule and Chores forms.
 *
 * Lifted from two places that already documented mirroring each other:
 * AddEventModal's inline "🔁 Repeats" block and
 * AddQuestRecurrenceSection's recurrence half (whose own comments said the
 * weekday picker exists "so weekly recurrence looks and works identically in
 * both places" — which only held as long as somebody kept editing both).
 *
 * Deliberately NOT lifted: the quest-only routineType chips
 * (citizenship/routine/bounty/shopping), coin-zeroing, and the shopping
 * budget/item list — those stay in AddQuestRecurrenceSection, which now
 * composes this component for the recurrence part.
 *
 * Pure and props-driven. The frequency vocabulary differs slightly between
 * the two callers ('none' vs 'once' for one-time, and quests additionally
 * have 'first_come'), so `freq` is a plain string and the caller maps it.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function WeekdayChips({
  days, setDays, accentColor, colors, isDark,
}: {
  days: number[]; // 0=Sun..6=Sat
  setDays: React.Dispatch<React.SetStateAction<number[]>>;
  accentColor: string;
  colors: any; isDark: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {WEEKDAY_LETTERS.map((label, dow) => {
        const active = days.includes(dow);
        return (
          <TouchableOpacity
            key={dow}
            onPress={() => setDays(prev => active ? prev.filter(d => d !== dow) : [...prev, dow].sort())}
            style={{
              flex: 1, borderRadius: 8, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
              borderColor: active ? accentColor : (isDark ? colors.border : '#E2E8F0'),
              backgroundColor: active ? accentColor : 'transparent',
            }}
          >
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: active ? colors.textInverse : colors.textSecondary }}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Day-of-month grid — 1-28 plus an explicit "Last day" (never a fixed
 * 29/30/31, which silently vanishes or shifts in shorter months).
 */
export function DayOfMonthGrid({
  dayOfMonth, setDayOfMonth, accentColor, colors, isDark,
}: {
  dayOfMonth: number | undefined;
  setDayOfMonth: (v: number | undefined) => void;
  accentColor: string;
  colors: any; isDark: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {Array.from({ length: 28 }, (_, i) => i + 1).map(day => {
        const active = dayOfMonth === day;
        return (
          <TouchableOpacity
            key={day}
            onPress={() => setDayOfMonth(active ? undefined : day)}
            style={{
              width: '12.5%', aspectRatio: 1, borderRadius: 8, borderWidth: 1.5,
              alignItems: 'center', justifyContent: 'center',
              borderColor: active ? accentColor : (isDark ? colors.border : '#E2E8F0'),
              backgroundColor: active ? accentColor : 'transparent',
            }}
          >
            <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: active ? colors.textInverse : colors.textSecondary }}>
              {day}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        onPress={() => setDayOfMonth(dayOfMonth === 31 ? undefined : 31)}
        style={{
          flexGrow: 1, borderRadius: 8, borderWidth: 1.5, paddingVertical: 7,
          alignItems: 'center', justifyContent: 'center', marginTop: 4,
          borderColor: dayOfMonth === 31 ? accentColor : (isDark ? colors.border : '#E2E8F0'),
          backgroundColor: dayOfMonth === 31 ? accentColor : 'transparent',
        }}
      >
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: dayOfMonth === 31 ? colors.textInverse : colors.textSecondary }}>
          Last day
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * The frequency chip row + whichever detail picker the chosen frequency
 * needs (weekday chips for weekly, day-of-month grid for monthly).
 * `options` is the caller's own frequency vocabulary.
 */
export function RecurrenceControl({
  freq, setFreq, options,
  days, setDays, dayOfMonth, setDayOfMonth,
  weeklyKey = 'weekly', monthlyKey = 'monthly',
  accentColor, colors, isDark,
  label, labelHint,
}: {
  freq: string;
  setFreq: (v: any) => void;
  options: readonly { key: string; label: string }[];
  days: number[];
  setDays: React.Dispatch<React.SetStateAction<number[]>>;
  dayOfMonth?: number | undefined;
  setDayOfMonth?: (v: number | undefined) => void;
  weeklyKey?: string;
  monthlyKey?: string;
  accentColor: string;
  colors: any; isDark: boolean;
  label?: string;
  labelHint?: string;
}) {
  return (
    <View>
      {!!label && (
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
          {label}
          {!!labelHint && <Text style={{ fontWeight: '400', color: colors.textTertiary }}>{'  '}{labelHint}</Text>}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {options.map(({ key, label: optLabel }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFreq(key)}
            style={{
              flex: 1, borderRadius: 10, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
              borderColor: freq === key ? accentColor : colors.border,
              backgroundColor: freq === key ? accentColor + '20' : 'transparent',
            }}
          >
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: freq === key ? accentColor : colors.textSecondary }}>
              {optLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {freq === weeklyKey && (
        <View style={{ marginTop: 8 }}>
          <WeekdayChips days={days} setDays={setDays} accentColor={accentColor} colors={colors} isDark={isDark} />
        </View>
      )}

      {freq === monthlyKey && setDayOfMonth && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Which day?{'  '}
            <Text style={{ fontWeight: '400', textTransform: 'none' }}>{!dayOfMonth ? 'day it was first approved' : ''}</Text>
          </Text>
          <DayOfMonthGrid
            dayOfMonth={dayOfMonth} setDayOfMonth={setDayOfMonth}
            accentColor={accentColor} colors={colors} isDark={isDark}
          />
        </View>
      )}
    </View>
  );
}
