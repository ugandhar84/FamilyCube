/**
 * WeekView — one card per day, chronological events inside. Extracted 1:1
 * from CalendarScreen.tsx's inline WeekView function; per-event rows now
 * render through the shared EventCardRow('inline') instead of hand-rolled
 * markup, matching Month/Agenda/DaySlot's card treatment.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import { fmtDateShort } from '@/lib/dates';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { toDateStr, addDays, DAY_SHORT } from './calendarDateHelpers';

// Figma .week-events span color palette — matches .mint/.lavender/.peach/.sky/.butter
const WEEK_EVENT_BG: Record<string, { light: string; dark: string }> = {
  Sports:  { light: '#e5f3ed', dark: 'rgba(61,122,90,0.28)'   }, // mint
  Medical: { light: '#f9ebe7', dark: 'rgba(223,97,60,0.25)'   }, // peach
  Ride:    { light: '#e5f3ed', dark: 'rgba(61,122,90,0.28)'   }, // mint
  Work:    { light: '#eeebf9', dark: 'rgba(123,94,167,0.28)'  }, // lavender
  Study:   { light: '#e8f1f8', dark: 'rgba(59,130,246,0.25)'  }, // sky
  School:  { light: '#e8f1f8', dark: 'rgba(59,130,246,0.25)'  }, // sky
  Event:   { light: '#fff2cf', dark: 'rgba(217,119,6,0.25)'   }, // butter
  default: { light: '#eeebf9', dark: 'rgba(123,94,167,0.28)'  }, // lavender
};

import Svg, { Path } from 'react-native-svg';
const ChevronLeft = ({ c, size = 16 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M15 18l-6-6 6-6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const ChevronRight = ({ c, size = 16 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 6l6 6-6 6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// ─── Week view — one card per day, chronological events inside ────────────────
// Simple day-cards rather than an hour grid (that's what Family view is
// for) — this is the "what's the shape of the week" overview: 7 cards,
// today highlighted, each showing its events as compact rows colored by
// who they're for.
export default function WeekView({
  weekStart, events, members, colors, isDark, onSelectEvent, onLongPressEvent, onNavigateWeek, onAddDay,
}: {
  weekStart: Date; events: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelectEvent: (ev: FamilyEvent) => void;
  // Long-press → edit (date/time/recurrence/driver/delete) — parent edit
  // access must be consistent across every calendar view, not just Month.
  onLongPressEvent?: (ev: FamilyEvent) => void;
  onNavigateWeek: (delta: number) => void;
  onAddDay?: (dateKey: string) => void;
}) {
  const todayStr = toDateStr(new Date());
  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 9 }}>
      {/* Figma week nav: ← 5–11 October → */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <TouchableOpacity onPress={() => onNavigateWeek(-1)}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: colors.border }}>
          <ChevronLeft c={colors.textSecondary} size={16} />
        </TouchableOpacity>
        <Text style={{ fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: colors.textPrimary }}>
          {fmtDateShort(toDateStr(weekStart))} – {fmtDateShort(toDateStr(weekEnd))}
        </Text>
        <TouchableOpacity onPress={() => onNavigateWeek(1)}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: colors.border }}>
          <ChevronRight c={colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {days.map(day => {
        const dateKey = toDateStr(day);
        const isToday = dateKey === todayStr;
        const dayEvs = events.filter(e => e.date === dateKey && e.category !== 'Holiday')
          .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

        return (
          <View key={dateKey} style={{
            borderRadius: 19, padding: 12, gap: 8,
            backgroundColor: isToday ? (isDark ? '#253862' : '#e9efff') : colors.card,
            borderWidth: 1, borderColor: isToday ? (isDark ? '#344a7a' : '#c5d0f5') : (isDark ? colors.border : 'rgba(223,97,60,0.08)'),
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Figma week-day: "MON" + circle date */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ minWidth: 48, minHeight: 48, borderRadius: 14, backgroundColor: isDark ? colors.surface : '#F4F3F7', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: isToday ? (isDark ? '#99b3ff' : '#294fc7') : colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {DAY_SHORT[(day.getDay() + 6) % 7]}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: isToday ? (isDark ? '#99b3ff' : '#294fc7') : colors.textPrimary, marginTop: 2 }}>{day.getDate()}</Text>
                </View>
              </View>
              {onAddDay ? (
                <TouchableOpacity onPress={() => onAddDay(dateKey)}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: isDark ? '#99b3ff' : '#294fc7' }}>+ Add</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary }}>
                  {dayEvs.length === 0 ? 'No events' : `${dayEvs.length} event${dayEvs.length === 1 ? '' : 's'}`}
                </Text>
              )}
            </View>

            {/* Figma .week-events span — minHeight 34, borderRadius 10, colored bg pill */}
            {dayEvs.length === 0 ? (
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontStyle: 'italic' }}>No events</Text>
            ) : (
              <View style={{ gap: 5 }}>
                {dayEvs.map(ev => {
                  const cat = ev.category ?? 'default';
                  const palette = WEEK_EVENT_BG[cat] ?? WEEK_EVENT_BG.default;
                  const bg = isDark ? palette.dark : palette.light;
                  const timeStr = ev.time ? ev.time.slice(0, 5) : '';
                  return (
                    <TouchableOpacity
                      key={ev.id}
                      onPress={() => onSelectEvent(ev)}
                      onLongPress={onLongPressEvent ? () => onLongPressEvent(ev) : undefined}
                      activeOpacity={0.78}
                      style={{ minHeight: 34, borderRadius: 10, backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#FDFCF9' : '#2C2722' }} numberOfLines={1}>
                        {timeStr ? `${timeStr} · ${ev.title}` : ev.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
