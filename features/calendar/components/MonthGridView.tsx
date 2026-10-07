/**
 * MonthGridView — Apple Calendar style month sheet (weekday header, 6-row
 * grid, up to 3 category dots per day) plus DayEventsSummaryCard, the
 * "Events for X" card rendered below the grid for the selected day.
 * Extracted 1:1 from CalendarScreen.tsx's inline MonthGridView/
 * DayEventsSummaryCard functions — pure structural move, no behavior change.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import { fmtTimeParts } from '@/lib/dates';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { toDateStr, parseDate, DAY_SHORT, CAT_DOT, MONTH_LABELS, buildMonthGrid } from './calendarDateHelpers';
import { eventAssignee } from '@/store/eventStore';

// ─── Icons (chevron-left/right only — kept local to avoid pulling in
// CalendarScreen's full icon set for two glyphs) ───────────────────────────
import Svg, { Path } from 'react-native-svg';
const ChevronLeft = ({ c, size = 18 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M15 18l-6-6 6-6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const ChevronRight = ({ c, size = 18 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 6l6 6-6 6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

// Figma color class → bg hex (light mode). Maps event category to the
// Figma .mint/.lavender/.peach/.sky/.butter palette.
// Module-level safe — no hooks, just a lookup table.
const AGENDA_BG: Record<string, { light: string; dark: string; text: string }> = {
  Sports:   { light: '#e5f3ed', dark: 'rgba(61,122,90,0.22)',  text: '#3D7A5A' }, // mint
  Medical:  { light: '#f9ebe7', dark: 'rgba(223,97,60,0.20)',  text: '#965F54' }, // peach
  Ride:     { light: '#e5f3ed', dark: 'rgba(61,122,90,0.22)',  text: '#3D7A5A' }, // mint
  Work:     { light: '#eeebf9', dark: 'rgba(123,94,167,0.22)', text: '#7B5EA7' }, // lavender
  Study:    { light: '#e8f1f8', dark: 'rgba(59,130,246,0.20)', text: '#2563EB' }, // sky
  School:   { light: '#e8f1f8', dark: 'rgba(59,130,246,0.20)', text: '#2563EB' }, // sky
  Event:    { light: '#fff2cf', dark: 'rgba(217,119,6,0.20)',  text: '#92600A' }, // butter
  default:  { light: '#eeebf9', dark: 'rgba(123,94,167,0.22)', text: '#7B5EA7' }, // lavender
};

// Figma .agenda-list below the month grid.
// Layout: .section-title (OVERLINE + h2) then .agenda-list articles:
//   grid 48px time | 1fr content | auto action — minHeight 76 — borderRadius 18 — colored bg
export function DayEventsSummaryCard({
  dateLabel, events, members, colors, isDark, onSelectEvent, onLongPressEvent, loading, isViewerParent,
}: {
  dateLabel: string; events: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelectEvent: (ev: FamilyEvent) => void;
  isViewerParent?: boolean;
  onLongPressEvent?: (ev: FamilyEvent) => void;
  loading?: boolean;
}) {
  const shown = events.filter(ev => ev.category !== 'Holiday');

  // Figma .section-title: "TUESDAY 6 OCTOBER" overline + "N things today" h2
  const count = shown.length;
  const countLabel = count === 0 ? 'Nothing scheduled'
    : count === 1 ? 'One thing today'
    : count === 2 ? 'Two things today'
    : count === 3 ? 'Three things today'
    : count === 4 ? 'Four things today'
    : `${count} things today`;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
      {/* Figma .section-title */}
      <View style={{ marginTop: 22, marginBottom: 0 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: colors.textTertiary, textTransform: 'uppercase' }}>
          {dateLabel.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary, marginTop: 4 }}>
          {loading ? '…' : countLabel}
        </Text>
      </View>

      {/* Figma .agenda-list */}
      <View style={{ gap: 9, marginTop: 11 }}>
        {loading && shown.length === 0 ? (
          [76, 76].map((h, i) => (
            <View key={i} style={{ height: h, borderRadius: 18, backgroundColor: colors.surface, opacity: 0.5 + i * 0.15 }} />
          ))
        ) : shown.length === 0 ? (
          <View style={{ borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.08)', padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.textTertiary }}>No scheduled events. Tap + to add one.</Text>
          </View>
        ) : (
          shown.map(ev => {
            const { time, ampm } = fmtTimeParts(ev.time);
            const cat = ev.category ?? 'default';
            const palette = AGENDA_BG[cat] ?? AGENDA_BG.default;
            const bg = isDark ? palette.dark : palette.light;

            // subtitle: assignee names + location + driver
            const assigneeNames = ev.memberIds?.length
              ? ev.memberIds.map(id => members.find(m => m.id === id)?.name?.split(' ')[0]).filter(Boolean).join(' + ')
              : members.find(m => m.id === ev.memberId)?.name?.split(' ')[0] ?? '';
            const driver = eventAssignee(ev);
            const driverPart = driver.name ? `· ${driver.name.split(' ')[0]} driving` : '';
            const locationPart = ev.location ? `· ${ev.location}` : '';
            const subtitle = [assigneeNames, locationPart, driverPart].filter(Boolean).join(' ').trim();

            const hasConflict = ev.conflict || ev.approvalPending || ev.helperStatus === 'pending';

            return (
              <TouchableOpacity
                key={ev.id}
                onPress={() => onSelectEvent(ev)}
                onLongPress={onLongPressEvent ? () => onLongPressEvent(ev) : undefined}
                activeOpacity={0.78}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  minHeight: 76, padding: 13, borderRadius: 18,
                  backgroundColor: bg,
                }}
              >
                {/* 48px time column */}
                <View style={{ width: 48, alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: palette.text, lineHeight: 14 }}>
                    {time || '—'}
                  </Text>
                  {ampm ? (
                    <Text style={{ fontSize: 9, fontWeight: '600', color: palette.text, opacity: 0.7 }}>{ampm}</Text>
                  ) : null}
                </View>

                {/* Content column */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  {subtitle ? (
                    <Text style={{ fontSize: 11, color: '#707688', marginTop: 3 }} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>

                {/* Action column — "Review" link for conflicts */}
                {hasConflict && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#5C6EB5' }}>Review</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

// ─── Month grid — Apple Calendar style ─────────────────────────────────────
// A real month sheet: weekday header, 6-row grid, up to 3 category dots per
// day from the lightweight stripMap (no full event fetch needed to paint
// it). Tapping a day sets selectedDate, which drives the agenda list
// rendered below by the caller — the grid itself never renders events.
export default function MonthGridView({
  monthDate, selected, stripMap, colors, isDark, onSelectDay, onChangeMonth,
}: {
  monthDate: Date; selected: string; stripMap: Record<string, string[]>; colors: any; isDark: boolean;
  onSelectDay: (d: string) => void;
  onChangeMonth: (delta: number) => void;
}) {
  const todayStr = toDateStr(new Date());
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      {/* Figma month title row: ← October 2026 → */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <TouchableOpacity onPress={() => onChangeMonth(-1)}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: colors.border }}>
          <ChevronLeft c={colors.textSecondary} size={18} />
        </TouchableOpacity>
        <Text style={{ fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: colors.textPrimary }}>
          {MONTH_LABELS[month]} {year}
        </Text>
        <TouchableOpacity onPress={() => onChangeMonth(1)}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: colors.border }}>
          <ChevronRight c={colors.textSecondary} size={18} />
        </TouchableOpacity>
      </View>

      {/* Figma: MTWTFSS header — 10px 700 uppercase */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {DAY_SHORT.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5 }}>
            {d[0]}
          </Text>
        ))}
      </View>

      {/* Figma: white card containing the grid */}
      <View style={{ borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.08)', padding: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (!d) return <View key={i} style={{ width: `${100/7}%`, height: 46 }} />;
            const date = parseDate(d);
            const isSel = d === selected;
            const isToday = d === todayStr;
            const cats = stripMap[d] ?? [];
            const dotColors = cats.map(c => CAT_DOT[c] ?? colors.teal).filter((c, idx, a) => a.indexOf(c) === idx).slice(0, 3);
            return (
              <TouchableOpacity key={d} onPress={() => onSelectDay(d)}
                style={{ width: `${100/7}%`, height: 46, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSel ? (isDark ? '#5265b1' : '#5265b1') : isToday ? (isDark ? 'rgba(102,119,189,0.25)' : '#e9edfb') : 'transparent',
                }}>
                  <Text style={{
                    fontSize: 13, fontWeight: isToday || isSel ? '700' : '400',
                    color: isSel ? '#fff' : isToday ? (isDark ? '#A89CD0' : '#5265b1') : colors.textPrimary,
                  }}>
                    {date.getDate()}
                  </Text>
                </View>
                {dotColors.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 2, position: 'absolute', bottom: 3, alignItems: 'center' }}>
                    {dotColors.map((c, idx) => (
                      <View key={idx} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: c }} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}
