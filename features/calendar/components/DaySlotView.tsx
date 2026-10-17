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
import { eventAssignee, eventDisplayLocation } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { timeToMinutes, toDateStr } from './calendarDateHelpers';
import { GEMINI } from '@/constants/geminiRhythm';
import { detectAssigneeConflicts } from '@/features/hub/lib/detectAssigneeConflicts';

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
  Medical: { light: '#f9ebe7', dark: 'rgba(223,97,60,0.25)',  accent: '#B4532F' }, // peach
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

// `joinedWithNext`/`joinedWithPrev` mark a both-ways ride's two independent
// legs (linkedLegId points each at the other — see eventStore.ts:146-151)
// when they sit back-to-back in time with no real event between them. Each
// leg stays its own full event (own tap target, own edit/delete/confirm —
// forkRideLegs intentionally keeps them as 2 rows, not 1), but the render
// below closes the gap and drops a connecting notch between them so they
// read as one trip instead of two unrelated blocks [live-reported: "can we
// show the pickup and drop on same card to block the slots if it is same hr
// not spread the multiple hrs" — tried a true data-merge first, but the two
// legs are deliberately independent events, so visually joining them while
// keeping them separately tappable is the right fix].
type LayoutEvent = FamilyEvent & { col: number; colCount: number; top: number; height: number; joinedWithNext?: boolean; joinedWithPrev?: boolean };

function layoutEvents(events: FamilyEvent[]): LayoutEvent[] {
  const sorted = [...events].sort((a, b) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0));
  const laid: LayoutEvent[] = sorted.map(ev => {
    const startMin = timeToMinutes(ev.time) ?? (SLOT_START * 60);
    const durationMin = eventDurationMin(ev);
    // top/height must both be in px (scaled by HOUR_H/60), not raw minutes —
    // was storing `top` as unconverted minutes while `height` was correctly
    // scaled, so a 4:45 PM start (705 "minutes" past 5 AM) rendered at
    // 705px, landing almost exactly on the 4 PM gridline (704px) instead of
    // 45 minutes below it [live-reported: "it appears like event starts at
    // 4.00"]. Coincidentally close to right before because HOUR_H (64) is
    // near 60, which is exactly what hid the bug.
    const top = Math.max(0, (startMin - SLOT_START * 60) * (HOUR_H / 60));
    const height = Math.max(36, durationMin * (HOUR_H / 60));
    return { ...ev, col: 0, colCount: 1, top, height };
  });

  // Back-to-back events (one starts exactly when the previous ends — e.g. a
  // ride's pickup leg starting at the main event's end time) were still
  // splitting into side-by-side columns, because `height` here is the
  // padded block height (min 36px) rather than the event's real duration,
  // so a short block's padded bottom edge could creep past the next
  // event's start [live-reported: "why do we need to show the side by
  // side.. as it is 4:45 - 6" — the pickup leg has no real time overlap
  // with the class it follows]. Compare real end-of-event minutes (next
  // event's own start, not the rendered box height) so adjacency never
  // counts as overlap — only true time conflicts split into columns.
  let i = 0;
  while (i < laid.length) {
    let groupEndMin = (timeToMinutes(laid[i].time) ?? 0) + eventDurationMin(laid[i]);
    let j = i + 1;
    while (j < laid.length && (timeToMinutes(laid[j].time) ?? 0) < groupEndMin) {
      groupEndMin = Math.max(groupEndMin, (timeToMinutes(laid[j].time) ?? 0) + eventDurationMin(laid[j]));
      j++;
    }
    const group = laid.slice(i, j);
    group.forEach((ev, idx) => { ev.col = idx; ev.colCount = group.length; });
    i = j;
  }

  // Mark adjacent linked-leg pairs so the render pass can close the gap
  // between them and draw a connecting notch instead of leaving the normal
  // spacing — only when they're truly back-to-back (not split across
  // columns and not separated by another event in between).
  for (let k = 0; k < laid.length - 1; k++) {
    const a = laid[k], b = laid[k + 1];
    if (a.linkedLegId === b.id || b.linkedLegId === a.id) {
      a.joinedWithNext = true;
      b.joinedWithPrev = true;
    }
  }
  return laid;
}

// Real duration from start/end time when both are set — was always `?? 60`,
// so an event WITH an explicit endTime (a ride pickup leg always has `time`
// set to the drop-off's end time and no separate endTime, meant to render
// as a short marker) still drew as a full 60-minute block, visually
// stretching "Pick-up" an hour later/longer than it actually is
// [live-reported: "when creating ride or event with the drop off and
// pickup we should create the exact time no need to give +60 default? as
// it creates the legs wrongly"]. Falls back to 60 only when there's truly
// no endTime to compute from (most non-ride events).
function eventDurationMin(ev: FamilyEvent & { pickupLeg?: FamilyEvent }): number {
  const startMin = timeToMinutes(ev.time);
  // A merged main+pickup card spans from the main event's start through
  // the linked pickup leg's own end, not just the main event's own end —
  // otherwise the card would stop at drop-off and clip the pickup info.
  const leg = ev.pickupLeg;
  const legEndMin = leg ? (timeToMinutes((leg as any).endTime) ?? timeToMinutes(leg.time)) : null;
  const ownEndMin = timeToMinutes((ev as any).endTime);
  const endMin = legEndMin != null ? legEndMin : ownEndMin;
  if (startMin != null && endMin != null && endMin > startMin) return endMin - startMin;
  return (ev as any).durationMinutes ?? 60;
}

function fmt12h(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
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
  // Anyone with two overlapping events gets a warning mark on both cards.
  const clashing = useMemo(() => detectAssigneeConflicts(dayEvents), [dayEvents]);

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
            const durationMin = eventDurationMin(ev);
            const endMin = startMin + durationMin;
            const isShort = ev.height < 44;  // compact: title only (no inline time, no subtitle) — e.g. a 15-min pickup leg

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
            // A pick-up leg's card should show where the rider is actually
            // being picked up FROM (pickupLocation) — eventDisplayLocation()
            // prioritizes location/dropLocation first, which on a pick-up
            // leg row was shadowing the pickup address entirely
            // [live-reported: "the pickup address should be present on the
            // pickup card"].
            const displayLocation = ev.title?.startsWith('Pick-up')
              ? (ev.pickupLocation || eventDisplayLocation(ev))
              : eventDisplayLocation(ev);
            const hasSubtitle = !!(displayLocation || whoLabel || statusLabel);

            return (
              <TouchableOpacity
                key={ev.id}
                onPress={() => onSelect(ev)}
                onLongPress={onLongPressEvent ? () => onLongPressEvent(ev) : undefined}
                delayLongPress={450}
                activeOpacity={0.82}
                style={{
                  position: 'absolute',
                  top: ev.top + 3,
                  // Card height fits its actual content (title line, plus
                  // subtitle line only when there's room/content for one),
                  // not the full duration-derived slot height — a long event
                  // with a short one-line title no longer drags a tall empty
                  // slab under the text just because its time span was long
                  // [live-reported: "card too tall for its time range", then
                  // "fit card to the content" after the flex-start tweak
                  // alone still left duration-sized blocks]. Caps at the
                  // slot height so it never overflows into the next hour.
                  height: Math.min(Math.max(30, ev.height - 6), !isShort && hasSubtitle ? 42 : 30),
                  left: `${leftPct}%` as any,
                  width: `${colWidthPct}%` as any,
                  borderRadius: 12,
                  backgroundColor: bgColor,
                  overflow: 'hidden',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  opacity: isConflict && ev.col > 0 ? 0.78 : 1,
                  justifyContent: 'flex-start',
                  zIndex: 2,
                }}
              >
                {/* Matches WeekView's flat pastel-pill rows: one line of
                    "time · title", no border/shadow chrome, no separate
                    time-pill or duration-badge competing with the title for
                    space [live-reported: "not at all nicer" / "data
                    squeezed" on a prior pass with heavier card chrome, then
                    "see how weekly event block made i think such away we
                    can use that" — rebuilt to follow WeekView's own simple
                    row shape instead]. Title+time share one line by
                    default; a second line only appears when the block is
                    tall enough to spare it. */}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {!!ev.seriesId && (
                    <Pressable
                      onPress={() => router.push({ pathname: '/calendar/series/[seriesId]', params: { seriesId: ev.seriesId! } })}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={{ marginRight: 4 }}
                    >
                      <Text style={{ fontSize: 11 }} accessibilityLabel="Manage recurring series">🔄</Text>
                    </Pressable>
                  )}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#FDFCF9' : '#2C2722', flexShrink: 1 }} numberOfLines={1}>
                    {clashing.has(ev.id) ? '⚠️ ' : ''}{!isShort ? `${fmt12h(startMin)} · ` : ''}{ev.title}
                  </Text>
                </View>

                {/* Subtitle — location · who · status, only when the block
                    has room below the title row for a second line. */}
                {!isShort && hasSubtitle && ev.height >= 56 ? (
                  <Text style={{ fontSize: 10, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), marginTop: 2, fontWeight: '600' }} numberOfLines={1}>
                    {displayLocation ? (
                      <Text
                        onPress={() => openInMaps(displayLocation)}
                        style={{ color: accentColor, fontWeight: '800' }}
                      >
                        📍 {streetOnly(displayLocation)}
                      </Text>
                    ) : null}
                    {displayLocation && (whoLabel || statusLabel) ? '  ·  ' : null}
                    {whoLabel}
                    {whoLabel && statusLabel ? '  ·  ' : null}
                    {statusLabel}
                  </Text>
                ) : null}

              </TouchableOpacity>
            );
          })}

          {/* Connecting notch between a linked ride pair's two cards — a
              small pill bridging the closed gap, so "drop-off" + "pick-up"
              read as one trip without merging their data (each stays its
              own tappable card — see joinedWithNext/Prev above). */}
          {laid.filter(ev => ev.joinedWithNext).map(ev => (
            <View
              key={`join-${ev.id}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: ev.top + ev.height - 7,
                left: TRACK_L + 14,
                width: 2,
                height: 14,
                backgroundColor: dayEventStyle((ev as any).category, isDark).accent,
                opacity: 0.5,
                zIndex: 3,
              }}
            />
          ))}

          {/* Empty-hour tap targets — was a near-invisible 18px "+ Add" sliver
              at the bottom of every hour, so a fully vacant evening (e.g.
              7 PM–11 PM with nothing scheduled) read as mostly dead space
              with only tiny gray text hinting it was tappable
              [live-reported: "this slot is fully vacant whey dont we show
              the nicer cards... use the space properly on the event
              blocks"]. Each hour with no event now gets its own full-height,
              dashed-border card spanning the whole hour row — same rounded/
              padded shape as a real event block, so the empty grid reads as
              a grid of actionable slots rather than a half-rendered table. */}
          {hours.map(hour => {
            const slotTop  = (hour - SLOT_START) * HOUR_H;
            const timeKey  = `${String(hour).padStart(2, '0')}:00`;
            const isOccupied = laid.some(ev => slotTop < ev.top + ev.height && slotTop + HOUR_H > ev.top);
            if (isOccupied) return null;
            return (
              <TouchableOpacity
                key={`add-${hour}`}
                onPress={() => onAddAtTime(timeKey)}
                activeOpacity={0.6}
                style={{
                  position: 'absolute',
                  top: slotTop + 2,
                  height: HOUR_H - 4,
                  left: 0, right: 0,
                  zIndex: 1,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(44,39,34,0.12)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '700', opacity: 0.6 }}>+ Add event</Text>
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
