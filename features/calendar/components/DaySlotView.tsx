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
import { View, Text, TouchableOpacity, Pressable, Animated, Easing, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import type { FamilyEvent } from '@/store/eventStore';
import { eventAssignee } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { timeToMinutes, toDateStr } from './calendarDateHelpers';
import { GEMINI } from '@/constants/geminiRhythm';

// Street-only label for the subtitle row — full address is still what gets
// sent to the maps app on tap, this just keeps the chip from overflowing
// into "4127 Revard Rd, Celina, TX, United States" the way EventCard's own
// shortAddress() avoids on the detail screen.
function streetOnly(addr: string): string {
  return addr.split(',')[0].trim();
}
function openInMaps(addr: string) {
  const encoded = encodeURIComponent(addr);
  const url = Platform.OS === 'ios'
    ? `https://maps.apple.com/?q=${encoded}`
    : `https://maps.google.com/?q=${encoded}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${encoded}`));
}

// Same category palette as WeekView's WEEK_EVENT_BG — Day view now colors
// blocks by category (not assignee) so the two views read as one system.
// Each entry adds an accent (strip/time-label/duration-chip color) on top
// of WeekView's light/dark tint, picked to match each pastel's hue family.
const DAY_EVENT_STYLE: Record<string, { light: string; dark: string; accent: string }> = {
  Sports:  { light: '#e5f3ed', dark: 'rgba(61,122,90,0.28)',  accent: '#3D7A5A' }, // mint
  Medical: { light: '#f9ebe7', dark: 'rgba(223,97,60,0.25)',  accent: '#DF613C' }, // peach
  Ride:    { light: '#e5f3ed', dark: 'rgba(61,122,90,0.28)',  accent: '#3D7A5A' }, // mint
  Work:    { light: '#eeebf9', dark: 'rgba(123,94,167,0.28)', accent: '#7B5EA7' }, // lavender
  Study:   { light: '#e8f1f8', dark: 'rgba(59,130,246,0.25)', accent: '#3B82F6' }, // sky
  School:  { light: '#e8f1f8', dark: 'rgba(59,130,246,0.25)', accent: '#3B82F6' }, // sky
  Event:   { light: '#fff2cf', dark: 'rgba(217,119,6,0.25)',  accent: '#D97706' }, // butter
  default: { light: '#eeebf9', dark: 'rgba(123,94,167,0.28)', accent: '#7B5EA7' }, // lavender
};
function dayEventStyle(category: string | undefined, isDark: boolean) {
  const c = DAY_EVENT_STYLE[category ?? 'default'] ?? DAY_EVENT_STYLE.default;
  return { bg: isDark ? c.dark : c.light, accent: c.accent };
}

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
  dayEvents, members, selectedDate, colors, isDark, onSelect, onLongPressEvent, onAddAtTime,
}: {
  dayEvents: FamilyEvent[]; members: FamilyMember[]; selectedDate: string; colors: any; isDark: boolean;
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
  const isToday = selectedDate === toDateStr(new Date());
  const showNow = isToday && nowTop >= 0 && nowTop <= TOTAL_H;

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
              <Text style={{ width: TIME_COL, fontSize: 10, fontWeight: '700', color: isDark ? '#fff' : GEMINI.titleColor, textAlign: 'right', paddingRight: 8 }}>
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
            // `memberIds` can be an empty array (not just undefined) when an
            // event only has a single legacy `memberId` set — `??` doesn't
            // fall through for `[]`, so that case silently dropped the
            // assignee name from the subtitle. Fall back whenever the
            // mapped list is empty, not just when memberIds is nullish.
            const mappedAssignees = ev.memberIds?.map(id => members.find(m => m.id === id)).filter(Boolean) as FamilyMember[] | undefined;
            const allAssignees = mappedAssignees && mappedAssignees.length > 0 ? mappedAssignees : (assignee ? [assignee] : []);

            const isConflict = ev.colCount > 1;
            const colWidthPct = (100 - (ev.colCount - 1) * GAP) / ev.colCount;
            const leftPct = ev.col * (colWidthPct + GAP);

            // Category-tinted bg — same palette as WeekView so Day/Week read
            // as one color system instead of two (was assignee-tinted here).
            const { bg: bgColor, accent: accentColor } = dayEventStyle((ev as any).category, isDark);

            const startMin = timeToMinutes(ev.time) ?? 0;
            const durationMin = (ev as any).durationMinutes ?? 60;
            const endMin = startMin + durationMin;
            const isShort = ev.height < 44;  // compact: title only, no subtitle

            // Subtitle: location + who. A ride event's driver lives in
            // ev.driverName/driverId, not memberId/memberIds — EventCard.tsx
            // reads it the same way via eventAssignee(), so mirror that here
            // instead of only looking at the member-id fields (which was why
            // "Drop off ... at airport"-style ride events showed no name at
            // all: they're assigned via driverName, with memberIds empty).
            // A ride can ALSO have other people coming (the kid being driven,
            // a helper, etc in memberId/memberIds/helper) — show those too,
            // not just the driver, so the card doesn't read as "only the
            // driver is involved" when someone's actually riding along.
            const driver = eventAssignee(ev);
            const ridingNames = allAssignees
              .map(m => m.name.split(' ')[0])
              .filter(n => n !== driver.name?.split(' ')[0]);
            if (ev.helper && !ridingNames.includes(ev.helper.split(' ')[0]) && ev.helper !== driver.name) {
              ridingNames.push(ev.helper.split(' ')[0]);
            }
            const whoLabel = ev.driverName
              ? [ridingNames.length > 0 ? ridingNames.join(', ') : null, `${driver.name?.split(' ')[0]} Driving`]
                  .filter(Boolean).join('  ·  ')
              : allAssignees.length > 0
                ? allAssignees.map(m => m.name.split(' ')[0]).join(' · ')
                : null;
            const statusLabel = (ev as any).status === 'pending' ? 'Needs confirmation' : null;
            const hasSubtitle = !!(ev.location || whoLabel || statusLabel);

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
                {/* Time range — small, top — dark for readability against the pastel tint */}
                {!isShort && (
                  <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? '#fff' : GEMINI.titleColor, letterSpacing: 0.2, marginBottom: 3 }}>
                    {fmt12h(startMin)} – {fmt12h(endMin)}
                  </Text>
                )}

                {/* Bold title */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  {!!ev.seriesId && (
                    <Pressable
                      onPress={() => router.push({ pathname: '/calendar/series/[seriesId]', params: { seriesId: ev.seriesId! } })}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={{ marginRight: 3 }}
                    >
                      <Text style={{ fontSize: isShort ? 11 : 13 }} accessibilityLabel="Manage recurring series">🔄</Text>
                    </Pressable>
                  )}
                  <Text style={{ fontSize: isShort ? 11 : 13, fontWeight: '700', color: isDark ? '#fff' : (isDark ? colors.textPrimary : GEMINI.titleColor), lineHeight: 16 }} numberOfLines={isShort ? 1 : 2}>
                    {ev.title}
                  </Text>
                </View>

                {/* Subtitle — location · who · status. Shown whenever there's
                    room for a second line (not gated to tall blocks only
                    anymore, so person/location metadata is visible on most
                    default-duration events too). */}
                {!isShort && hasSubtitle ? (
                  <Text style={{ fontSize: 10, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), marginTop: 3 }} numberOfLines={1}>
                    {ev.location ? (
                      <Text
                        onPress={() => openInMaps(ev.location!)}
                        style={{ textDecorationLine: 'underline', color: accentColor, fontWeight: '700' }}
                      >
                        📍 {streetOnly(ev.location)}
                      </Text>
                    ) : null}
                    {ev.location && (whoLabel || statusLabel) ? '  ·  ' : null}
                    {whoLabel}
                    {whoLabel && statusLabel ? '  ·  ' : null}
                    {statusLabel}
                  </Text>
                ) : null}

                {/* Duration chip — bottom-right corner for tall cards */}
                {ev.height >= 72 && (
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
