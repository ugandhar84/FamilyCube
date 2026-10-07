/**
 * DaySlotView — proportional time-grid Day view (5am–11pm), events positioned
 * by actual start time and duration. Conflicting events render side-by-side
 * in columns (Apple Calendar style): each column is a fraction of the track
 * width, so two events at 1pm–2pm sit next to each other rather than stacking.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { assigneeStyle, MultiPersonTimeFill } from './EventCard';
import { timeToMinutes } from './calendarDateHelpers';

const SLOT_START = 5;   // 5 AM
const SLOT_END   = 23;  // 11 PM
const HOUR_H     = 60;  // px per hour — 1px per minute makes math easy
const TOTAL_H    = (SLOT_END - SLOT_START) * HOUR_H;

// ── Conflict column layout ───────────────────────────────────────────────────
// Group events that overlap in time into "conflict groups," then assign each
// event a column index within its group. The column width = 1 / group_size.
type LayoutEvent = FamilyEvent & { col: number; colCount: number; top: number; height: number };

function layoutEvents(events: FamilyEvent[]): LayoutEvent[] {
  const sorted = [...events].sort((a, b) => {
    const ta = timeToMinutes(a.time) ?? 0;
    const tb = timeToMinutes(b.time) ?? 0;
    return ta - tb;
  });

  const laid: LayoutEvent[] = sorted.map(ev => {
    const startMin = timeToMinutes(ev.time) ?? (SLOT_START * 60);
    const durationMin = (ev as any).durationMinutes ?? 60;
    const top = Math.max(0, (startMin - SLOT_START * 60));
    const height = Math.max(36, durationMin);
    return { ...ev, col: 0, colCount: 1, top, height };
  });

  // Build conflict groups: an event conflicts if it overlaps with any event
  // in the current group.
  let i = 0;
  while (i < laid.length) {
    // Collect all events that overlap with this group's time span
    let groupEnd = laid[i].top + laid[i].height;
    let j = i + 1;
    while (j < laid.length && laid[j].top < groupEnd) {
      groupEnd = Math.max(groupEnd, laid[j].top + laid[j].height);
      j++;
    }
    const group = laid.slice(i, j);
    const colCount = group.length;
    group.forEach((ev, idx) => {
      ev.col = idx;
      ev.colCount = colCount;
    });
    i = j;
  }

  return laid;
}

export default function DaySlotView({
  dayEvents, members, colors, isDark, onSelect, onLongPressEvent, onAddAtTime,
}: {
  dayEvents: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelect: (ev: FamilyEvent) => void;
  onLongPressEvent?: (ev: FamilyEvent) => void;
  onAddAtTime: (hourTimeKey: string) => void;
}) {
  const hours = Array.from({ length: SLOT_END - SLOT_START + 1 }, (_, i) => SLOT_START + i);
  const laid = useMemo(() => layoutEvents(dayEvents), [dayEvents]);

  // Current time indicator
  const nowMin = useMemo(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }, []);
  const nowTop = nowMin - SLOT_START * 60;
  const showNow = nowTop >= 0 && nowTop <= TOTAL_H;

  return (
    <View style={{ paddingHorizontal: 0, paddingTop: 8 }}>
      {/* Time grid */}
      <View style={{ position: 'relative', height: TOTAL_H + 32 }}>
        {/* Hour lines + labels */}
        {hours.map(hour => {
          const top = (hour - SLOT_START) * HOUR_H;
          const label = hour === 0 ? 'Midnight'
            : hour < 12 ? `${hour} AM`
            : hour === 12 ? 'Noon'
            : `${hour - 12} PM`;
          return (
            <View key={hour} style={{ position: 'absolute', top, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' }}>
              {/* Hour label — fixed 52px left column */}
              <Text style={{ width: 52, fontSize: 10, fontWeight: '700', color: colors.textTertiary, textAlign: 'right', paddingRight: 8, lineHeight: 14 }}>
                {label}
              </Text>
              {/* Divider line */}
              <View style={{ flex: 1, height: 1, backgroundColor: isDark ? colors.border : 'rgba(44,39,34,0.07)', marginRight: 16 }} />
            </View>
          );
        })}

        {/* Now indicator */}
        {showNow && (
          <View style={{ position: 'absolute', top: nowTop, left: 52, right: 16, flexDirection: 'row', alignItems: 'center', zIndex: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink }} />
            <View style={{ flex: 1, height: 1.5, backgroundColor: colors.pink }} />
          </View>
        )}


        {/* Render events in a dedicated track container for correct column math */}
        <View style={{ position: 'absolute', top: 0, left: 60, right: 16, height: TOTAL_H + 32 }}>
          {laid.map(ev => {
            const assignee = members.find(m => m.id === ev.memberId);
            const rs = assigneeStyle(assignee, colors, isDark);
            const multiPersonColors = (ev.memberIds?.length ?? 0) > 1
              ? ev.memberIds!.map(id => assigneeStyle(members.find(m => m.id === id), colors, isDark).dot)
              : null;

            const isConflict = ev.colCount > 1;
            const isGhost = isConflict && ev.col < ev.colCount - 1;
            const GAP = 3;
            // Each column: (100% - (colCount-1)*GAP) / colCount wide
            const colWidthPct = (100 - (ev.colCount - 1) * GAP) / ev.colCount;
            const leftPct = ev.col * (colWidthPct + GAP);

            const bgColor = isGhost
              ? (isDark ? rs.dot + '14' : rs.badge + 'CC')
              : (isDark ? rs.dot + '2A' : rs.badge);

            // Format time label: "1 PM – 2 PM"
            const startMin = timeToMinutes(ev.time) ?? 0;
            const endMin = startMin + ((ev as any).durationMinutes ?? 60);
            const fmt = (m: number) => {
              const h = Math.floor(m / 60);
              const suffix = h < 12 ? 'AM' : 'PM';
              const h12 = h % 12 || 12;
              return `${h12}${suffix}`;
            };
            const timeLabel = `${fmt(startMin)}–${fmt(endMin)}`.toLowerCase();

            return (
              <TouchableOpacity
                key={ev.id}
                onPress={() => onSelect(ev)}
                onLongPress={onLongPressEvent ? () => onLongPressEvent(ev) : undefined}
                delayLongPress={450}
                activeOpacity={0.85}
                style={{
                  position: 'absolute',
                  top: ev.top + 1,
                  height: Math.max(28, ev.height - 2),
                  left: `${leftPct}%` as any,
                  width: `${colWidthPct}%` as any,
                  borderRadius: 10,
                  backgroundColor: bgColor,
                  borderLeftWidth: 3,
                  borderLeftColor: rs.dot,
                  // Ghost events get a dashed/muted look
                  opacity: isGhost ? 0.7 : 1,
                  overflow: 'hidden',
                  paddingHorizontal: 7,
                  paddingVertical: 5,
                }}
              >
                {/* Color accent bar already done via borderLeft */}
                <Text style={{ fontSize: 12, fontWeight: '700', color: isGhost ? colors.textSecondary : colors.textPrimary, lineHeight: 15 }} numberOfLines={2}>
                  {ev.title}
                </Text>
                {ev.height >= 44 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    {ev.location ? (
                      <Text style={{ fontSize: 10, color: colors.textTertiary }} numberOfLines={1}>📍 {ev.location}</Text>
                    ) : (
                      <Text style={{ fontSize: 10, color: colors.textTertiary }}>⏰ {timeLabel}</Text>
                    )}
                  </View>
                )}
                {assignee && !isGhost && (
                  <View style={{
                    position: 'absolute', top: 5, right: 5,
                    backgroundColor: rs.dot, borderRadius: 5,
                    paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden',
                  }}>
                    {multiPersonColors && (
                      <MultiPersonTimeFill hexColors={multiPersonColors} scrimColor={rs.dot} size={16} radius={5} />
                    )}
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{assignee.name.split(' ')[0]}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Tap-to-add zones for empty regions — one per hour */}
          {hours.map(hour => {
            const top = (hour - SLOT_START) * HOUR_H;
            const hourTimeKey = `${String(hour).padStart(2, '0')}:00`;
            const hasEvent = laid.some(ev => {
              const evHour = Math.floor(ev.top / HOUR_H) + SLOT_START;
              return evHour === hour;
            });
            if (hasEvent) return null;
            return (
              <TouchableOpacity
                key={`add-${hour}`}
                onPress={() => onAddAtTime(hourTimeKey)}
                style={{
                  position: 'absolute', top: top + 8, left: 0, right: 0, height: HOUR_H - 16,
                  borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
                  borderColor: isDark ? colors.border : 'rgba(44,39,34,0.10)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '600' }}>+ Add</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}
