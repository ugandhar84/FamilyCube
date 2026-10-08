/**
 * DaySlotView — proportional time-grid day view (5am–11pm).
 * Events are positioned by actual start time and duration.
 * Conflicting events render side-by-side (Apple Calendar style).
 * Visual rhythm matches the Figma "agenda-list" design:
 *   - Pastel role-tinted card, borderRadius 16, padding 12
 *   - Left: time column (start + duration label)
 *   - Right: bold title + subtitle row (location · who · status)
 *   - Now marker: terracotta pill chip + line
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { assigneeStyle } from './EventCard';
import { timeToMinutes } from './calendarDateHelpers';

const SLOT_START = 5;   // 5 AM
const SLOT_END   = 23;  // 11 PM
const HOUR_H     = 64;  // px per hour — slightly taller for Figma rhythm
const TOTAL_H    = (SLOT_END - SLOT_START) * HOUR_H;

type LayoutEvent = FamilyEvent & { col: number; colCount: number; top: number; height: number };

function layoutEvents(events: FamilyEvent[]): LayoutEvent[] {
  const sorted = [...events].sort((a, b) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0));
  const laid: LayoutEvent[] = sorted.map(ev => {
    const startMin = timeToMinutes(ev.time) ?? (SLOT_START * 60);
    const durationMin = (ev as any).durationMinutes ?? 60;
    const top = Math.max(0, startMin - SLOT_START * 60);
    const height = Math.max(40, durationMin * (HOUR_H / 60));
    return { ...ev, col: 0, colCount: 1, top, height };
  });

  let i = 0;
  while (i < laid.length) {
    let groupEnd = laid[i].top + laid[i].height;
    let j = i + 1;
    while (j < laid.length && laid[j].top < groupEnd) {
      groupEnd = Math.max(groupEnd, laid[j].top + laid[j].height);
      j++;
    }
    const group = laid.slice(i, j);
    group.forEach((ev, idx) => { ev.col = idx; ev.colCount = group.length; });
    i = j;
  }
  return laid;
}

function fmt12h(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function fmtDuration(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Live "you are here" pulse — a soft expanding ring behind a solid dot,
// looped forever, so the now-marker reads as a real-time indicator instead
// of a static line that happens to sit at today's current hour.
function PulseDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, { toValue: 2.2, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={{ width: 9, height: 9, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: 9, height: 9, borderRadius: 4.5,
        backgroundColor: color, opacity, transform: [{ scale }],
      }} />
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
    </View>
  );
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

  // Was a one-shot useMemo computed at mount with no deps — the "now" line
  // never actually moved as real time passed; a day view left open for 20
  // minutes still showed the line where it was when the screen first
  // rendered. Ticks every 30s so the line (and its time label) track the
  // real clock while the screen stays mounted.
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  const nowTop = (nowMin - SLOT_START * 60) * (HOUR_H / 60);
  const showNow = nowTop >= 0 && nowTop <= TOTAL_H;

  const TIME_COL = 52; // px — left time-label column width
  const TRACK_L  = TIME_COL + 8;
  const TRACK_R  = 16;
  const GAP      = 4;

  return (
    <View style={{ paddingTop: 8 }}>
      <View style={{ position: 'relative', height: TOTAL_H + 40 }}>

        {/* Hour grid lines + labels */}
        {hours.map(hour => {
          const top = (hour - SLOT_START) * HOUR_H;
          const label = hour === 0 ? 'Midnight'
            : hour < 12 ? `${hour} AM`
            : hour === 12 ? 'Noon'
            : `${hour - 12} PM`;
          return (
            <View key={hour} style={{ position: 'absolute', top, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ width: TIME_COL, fontSize: 10, fontWeight: '700', color: colors.textTertiary, textAlign: 'right', paddingRight: 8 }}>
                {label}
              </Text>
              <View style={{ flex: 1, height: StyleSheet_hairline, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(44,39,34,0.07)', marginRight: TRACK_R }} />
            </View>
          );
        })}

        {/* Now marker — pulsing live dot + terracotta line, ticks every 30s
            (Figma .now-marker, made real-time). */}
        {showNow && (
          <View style={{ position: 'absolute', top: nowTop - 4, left: 0, right: TRACK_R, flexDirection: 'row', alignItems: 'center', zIndex: 20 }}>
            <View style={{ width: TIME_COL, alignItems: 'flex-end', paddingRight: 6 }}>
              <View style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 8, fontWeight: '800', color: colors.primary }}>{fmt12h(nowMin)}</Text>
              </View>
            </View>
            <PulseDot color={colors.primary} />
            <View style={{ flex: 1, height: 1.5, backgroundColor: colors.primary, opacity: 0.7 }} />
          </View>
        )}

        {/* Event blocks */}
        <View style={{ position: 'absolute', top: 0, left: TRACK_L, right: TRACK_R, height: TOTAL_H + 40 }}>
          {laid.map(ev => {
            const assignee = members.find(m => m.id === ev.memberId);
            const allAssignees = ev.memberIds?.map(id => members.find(m => m.id === id)).filter(Boolean) as FamilyMember[] ?? (assignee ? [assignee] : []);
            const rs = assigneeStyle(assignee, colors, isDark);

            const isConflict = ev.colCount > 1;
            const colWidthPct = (100 - (ev.colCount - 1) * GAP) / ev.colCount;
            const leftPct = ev.col * (colWidthPct + GAP);

            // Pastel tint bg — matches Figma .mint/.lavender/.peach per role
            const bgColor = isDark ? rs.dot + '28' : rs.badge;
            const accentColor = rs.dot;

            const startMin = timeToMinutes(ev.time) ?? 0;
            const durationMin = (ev as any).durationMinutes ?? 60;
            const endMin = startMin + durationMin;
            const isTall = ev.height >= 72;  // enough room for subtitle row
            const isShort = ev.height < 44;  // compact: title only, no subtitle

            // Subtitle: location OR who + status
            const whoLabel = allAssignees.length > 0
              ? allAssignees.slice(0, 2).map(m => m.name.split(' ')[0]).join(' · ')
              : null;
            const subtitle = [
              ev.location ? `📍 ${ev.location}` : null,
              whoLabel,
              (ev as any).status === 'pending' ? 'Needs confirmation' : null,
            ].filter(Boolean).join('  ·  ');

            return (
              <TouchableOpacity
                key={ev.id}
                onPress={() => onSelect(ev)}
                onLongPress={onLongPressEvent ? () => onLongPressEvent(ev) : undefined}
                delayLongPress={450}
                activeOpacity={0.82}
                style={{
                  position: 'absolute',
                  top: ev.top + 2,
                  height: Math.max(36, ev.height - 4),
                  left: `${leftPct}%` as any,
                  width: `${colWidthPct}%` as any,
                  borderRadius: 14,
                  backgroundColor: bgColor,
                  borderLeftWidth: 3,
                  borderLeftColor: accentColor,
                  overflow: 'hidden',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  opacity: isConflict && ev.col > 0 ? 0.75 : 1,
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                {/* Time range — small, top */}
                {!isShort && (
                  <Text style={{ fontSize: 9, fontWeight: '700', color: accentColor, letterSpacing: 0.2, marginBottom: 3 }}>
                    {fmt12h(startMin)} – {fmt12h(endMin)}
                  </Text>
                )}

                {/* Bold title */}
                <Text style={{ fontSize: isShort ? 11 : 13, fontWeight: '700', color: isDark ? '#fff' : colors.textPrimary, lineHeight: 16 }} numberOfLines={isShort ? 1 : 2}>
                  {ev.title}
                </Text>

                {/* Subtitle — location · who · status */}
                {isTall && subtitle ? (
                  <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}

                {/* Duration chip — bottom-right corner for tall cards */}
                {isTall && (
                  <View style={{ position: 'absolute', bottom: 6, right: 8, backgroundColor: accentColor + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: accentColor }}>{fmtDuration(durationMin)}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {/* + Add — thin strip at the bottom of each hour, zIndex 1 so event blocks (zIndex 2) always win */}
          {hours.map(hour => {
            const slotTop  = (hour - SLOT_START) * HOUR_H;
            const timeKey  = `${String(hour).padStart(2, '0')}:00`;
            return (
              <TouchableOpacity
                key={`add-${hour}`}
                onPress={() => onAddAtTime(timeKey)}
                hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
                style={{
                  position: 'absolute',
                  top: slotTop + HOUR_H - 18,
                  left: 0, right: 0,
                  height: 18,
                  zIndex: 1,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 9, color: colors.textTertiary, fontWeight: '600', opacity: 0.7 }}>+ Add</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// hairline thickness helper (avoids importing StyleSheet just for this)
const StyleSheet_hairline = 1;
