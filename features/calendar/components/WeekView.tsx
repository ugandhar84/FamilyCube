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
import { BRAND } from '@/components/FamilyCubeLogo';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { EventCardRow } from './EventCard';
import { toDateStr, addDays, DAY_SHORT } from './calendarDateHelpers';

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
            backgroundColor: isToday ? colors.pinkLight : colors.card,
            borderWidth: 1, borderColor: isToday ? colors.pink + '50' : (isDark ? colors.border : 'rgba(223,97,60,0.08)'),
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Figma week-day: "MON" + circle date */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ minWidth: 48, minHeight: 48, borderRadius: 14, backgroundColor: isDark ? colors.surface : '#F4F3F7', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: isToday ? colors.pink : colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {DAY_SHORT[(day.getDay() + 6) % 7]}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: isToday ? colors.pink : colors.textPrimary, marginTop: 2 }}>{day.getDate()}</Text>
                </View>
              </View>
              {onAddDay ? (
                <TouchableOpacity onPress={() => onAddDay(dateKey)}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.pink }}>+ Add</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary }}>
                  {dayEvs.length === 0 ? 'No events' : `${dayEvs.length} event${dayEvs.length === 1 ? '' : 's'}`}
                </Text>
              )}
            </View>

            {/* Reference's per-event row: border + light tint together
                (not just a tinted background), same role-color pairing —
                now the shared EventCardRow('inline') component. */}
            {dayEvs.length === 0 ? (
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontStyle: 'italic' }}>No events</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {dayEvs.map(ev => (
                  <EventCardRow
                    key={ev.id}
                    ev={ev}
                    members={members}
                    colors={colors} isDark={isDark}
                    onPress={() => onSelectEvent(ev)}
                    onLongPress={onLongPressEvent ? () => onLongPressEvent(ev) : undefined}
                    timeStyle="inline"
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
