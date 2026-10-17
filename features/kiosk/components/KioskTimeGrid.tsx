/**
 * KioskTimeGrid — the wall display's calendar time grid: a column per day (Week)
 * or per person (By member), an hour axis, an all-day row, pastel event blocks
 * coloured by who the event is for, and a red "now" line on today.
 *
 * Presentation only. KioskScheduleTab owns fetching, the scope / member
 * filters and the privacy rules (hidden / busy-block via
 * canViewSensitiveEventDetail is re-applied here so a sensitive title can't
 * leak through a new view). Times are 12h (CLAUDE.md rule 9).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native';
import type { FamilyMember } from '@/store/familyStore';
import { canViewSensitiveEventDetail, type FamilyEvent } from '@/store/eventStore';
import { fmtTime } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { fmt12, useNow } from './KioskHomeParts';

export interface GridColumn {
  key: string;
  label: string;
  /** Small trailing text, e.g. the day number badge or "3 plans". */
  badge?: string;
  isToday?: boolean;
  /** Accent for the column title (By member). */
  color?: string;
  events: FamilyEvent[];
}

const AXIS_W = 56;
const toMin = (t?: string | null): number | null => {
  const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;

type Placed = { ev: FamilyEvent; start: number; end: number; lane: number; lanes: number; busy: boolean };

/** Greedy side-by-side lane assignment for overlapping events in one column. */
function place(events: FamilyEvent[], active: FamilyMember): { timed: Placed[]; allDay: FamilyEvent[] } {
  const allDay: FamilyEvent[] = [];
  const items: { ev: FamilyEvent; start: number; end: number; busy: boolean }[] = [];
  for (const ev of events) {
    const vis = canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name);
    if (vis === 'hidden') continue;
    const start = ev.allDay ? null : toMin(ev.time);
    if (start == null) { allDay.push(ev); continue; }
    const end = Math.max(start + 30, toMin(ev.endTime) ?? start + 60);
    items.push({ ev, start, end, busy: vis === 'busy-block' });
  }
  items.sort((a, b) => a.start - b.start || b.end - a.end);
  const ends: number[] = [];
  const laned = items.map(it => {
    let lane = ends.findIndex(e => e <= it.start);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = it.end;
    return { ...it, lane };
  });
  const lanes = Math.max(1, ends.length);
  return { timed: laned.map(l => ({ ...l, lanes })), allDay };
}

export function KioskTimeGrid({ columns, members, active, involvedFor, onEventPress, onEventLongPress, hourHeight, startHour, endHour, autoScrollToNow, detailed }: {
  columns: GridColumn[];
  members: FamilyMember[];
  active: FamilyMember;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void;
  onEventLongPress?: (ev: FamilyEvent) => void;
  /** Fixed hour height (px). Omit to fit the whole range on screen. */
  hourHeight?: number;
  /** Force the visible hour range (e.g. 6 and 23 for a full day). */
  startHour?: number;
  endHour?: number;
  /** Scroll so the current time sits near the top third when today is shown. */
  autoScrollToNow?: boolean;
  /** Wider blocks: add who / where under the time. */
  detailed?: boolean;
}) {
  const { k, isDark } = useKioskColors();
  const pastels = kioskPastels(k);
  const [bodyH, setBodyH] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const nowDate = useNow();
  const pastelFor = (ev: FamilyEvent) => {
    const who = involvedFor(ev)[0];
    if (!who) return { col: k.well, card: k.well, fg: k.textMuted };
    return pastels[Math.max(0, members.findIndex(m => m.id === who.id)) % pastels.length];
  };

  const placed = useMemo(() => columns.map(c => place(c.events, active)), [columns, active]);

  // Visible hour range: 8 AM–7 PM by default, widened to fit any event.
  const { h0, h1 } = useMemo(() => {
    let lo = 8, hi = 19;
    for (const p of placed) for (const t of p.timed) {
      lo = Math.min(lo, Math.floor(t.start / 60));
      hi = Math.max(hi, Math.ceil(t.end / 60));
    }
    return { h0: startHour ?? Math.max(5, lo), h1: endHour ?? Math.min(24, hi) };
  }, [placed, startHour, endHour]);
  const hours = h1 - h0;
  const hourH = hourHeight ?? Math.max(40, bodyH > 0 ? bodyH / hours : 46);
  const contentH = hours * hourH;

  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  const showNow = nowMin >= h0 * 60 && nowMin <= h1 * 60;
  const hasAllDay = placed.some(p => p.allDay.length > 0);
  const todayShown = columns.some(c => c.isToday);

  // Land on "now" whenever the view opens or the day changes to today.
  const dayKey = columns.map(c => c.key).join('|');
  useEffect(() => {
    if (!autoScrollToNow || !todayShown || bodyH <= 0) return;
    const y = ((nowMin - h0 * 60) / 60) * hourH - bodyH * 0.3;
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true }), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScrollToNow, todayShown, bodyH, dayKey, h0, hourH]);

  return (
    <View style={s.wrap}>
      <View style={[s.row, { marginLeft: AXIS_W }]}>
        {columns.map(c => (
          <View key={c.key} style={s.colHead}>
            <Text style={[s.colTitle, { color: c.color ?? (c.isToday ? k.primary : k.text) }]} numberOfLines={1}>{c.label}</Text>
            {!!c.badge && (
              <View style={[s.badge, { backgroundColor: k.primary }]}><Text style={[s.badgeText, { color: k.onPrimary }]}>{c.badge}</Text></View>
            )}
          </View>
        ))}
      </View>

      {hasAllDay && (
        <View style={[s.row, s.allDayRow, { marginLeft: AXIS_W, borderBottomColor: k.cardBorder }]}>
          {columns.map((c, i) => (
            <View key={c.key} style={s.allDayCell}>
              {placed[i].allDay.map(ev => {
                const tone = pastelFor(ev);
                return (
                  <Pressable key={ev.id} onPress={() => onEventPress(ev)} accessibilityRole="button" accessibilityLabel={`${ev.title}, all day`}
                    style={[s.allDayChip, { backgroundColor: tone.card }]}>
                    <Text style={[s.allDayText, { color: tone.fg }]} numberOfLines={1}>{ev.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        onLayout={(e: LayoutChangeEvent) => setBodyH(e.nativeEvent.layout.height)}
      >
        <View style={{ height: contentH }}>
          {Array.from({ length: hours + 1 }, (_, i) => (
            <View key={i} style={[s.hourLine, { top: i * hourH, borderTopColor: k.cardBorder }]}>
              <Text style={[s.hourText, { color: k.textFaint }]}>{hourLabel(h0 + i)}</Text>
            </View>
          ))}
          <View style={s.cols} pointerEvents="box-none">
          {columns.map((c, ci) => (
            <View key={c.key} style={[s.colBody, { borderLeftColor: k.cardBorder }]} pointerEvents="box-none">
              {placed[ci].timed.map(({ ev, start, end, lane, lanes, busy }) => {
                const tone = busy ? { col: k.well, card: k.well, fg: k.textMuted } : pastelFor(ev);
                const top = ((start - h0 * 60) / 60) * hourH;
                const height = Math.max(34, ((end - start) / 60) * hourH - 3);
                const w = 100 / lanes;
                const who = involvedFor(ev);
                return (
                  <Pressable
                    key={ev.id}
                    onPress={() => onEventPress(ev)}
                    onLongPress={onEventLongPress ? () => onEventLongPress(ev) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={`${busy ? 'Busy' : ev.title}, ${fmtTime(ev.time ?? '')}`}
                    style={({ pressed }) => [s.event, {
                      top, height, left: `${lane * w}%`, width: `${w}%`,
                      backgroundColor: tone.card, opacity: pressed ? 0.75 : 1,
                    }]}
                  >
                    <Text style={[s.evTitle, { color: k.text }]} numberOfLines={height > 56 ? 2 : 1}>{busy ? '🔒 Busy' : ev.title}</Text>
                    <Text style={[s.evTime, { color: k.textMuted }]} numberOfLines={1}>
                      {fmtTime(ev.time ?? '')}{ev.endTime ? ` – ${fmtTime(ev.endTime)}` : ''}
                    </Text>
                    {detailed && !busy && height >= 66 && (
                      <Text style={[s.evTime, { color: k.textMuted }]} numberOfLines={1}>
                        {[who.map(w => w.name.trim().split(' ')[0]).join(', '), (ev as any).location || (ev as any).venueLocation || ''].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    {!busy && lanes < 3 && who[0] && height >= 50 && (
                      <View style={[s.dot, { backgroundColor: k.card }]}>
                        <Text style={[s.dotText, { color: tone.fg }]}>{who[0].name.trim().charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
          </View>
          {showNow && todayShown && (
            <View pointerEvents="none" style={[s.nowWrap, { top: ((nowMin - h0 * 60) / 60) * hourH }]}>
              <View style={[s.nowPill, { backgroundColor: k.primary }]}>
                <Text style={[s.nowPillText, { color: k.onPrimary }]} numberOfLines={1}>{fmt12(`${nowDate.getHours()}:${String(nowDate.getMinutes()).padStart(2, '0')}`)}</Text>
              </View>
              <View style={[s.nowLine, { backgroundColor: k.primary }]} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: KIOSK_SPACE.md },
  row: { flexDirection: 'row' },
  colHead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, minHeight: 36 },
  colTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 11.5, fontWeight: '800' },
  allDayRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 6 },
  allDayCell: { flex: 1, paddingHorizontal: 4, gap: 4 },
  allDayChip: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5, minHeight: 26, justifyContent: 'center' },
  allDayText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  hourLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  hourText: { position: 'absolute', left: 0, width: AXIS_W - 8, textAlign: 'right', top: -8, fontSize: 11.5, fontWeight: '700' },
  cols: { position: 'absolute', left: AXIS_W, right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  colBody: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, paddingHorizontal: 3 },
  event: { position: 'absolute', borderRadius: 13, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  evTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  evTime: { fontSize: KIOSK_TYPO.label, fontWeight: '600', marginTop: 1 },
  dot: { position: 'absolute', right: 6, bottom: 5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontSize: 10.5, fontWeight: '800' },
  nowWrap: { position: 'absolute', left: 0, right: 0, height: 22, marginTop: -11, flexDirection: 'row', alignItems: 'center', zIndex: 5 },
  nowPill: { width: AXIS_W - 2, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nowPillText: { fontSize: 10.5, fontWeight: '800' },
  nowLine: { flex: 1, height: 2 },
});
