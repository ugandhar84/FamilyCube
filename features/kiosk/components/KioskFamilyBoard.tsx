/**
 * KioskFamilyBoard — today as one board: a column per person, hour by hour, with
 * a "now" line the board scrolls to. Events are pastel blocks (an event shared by
 * several people shows in each column); chores due at a time sit in the owner's
 * column as small chips. Tapping an event or a chore opens its details.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import { localDateStr } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KioskAvatar } from './KioskAvatar';
import { fmt12, toMin, firstName } from './KioskHomeParts';
import { KIOSK_FONT } from '../kioskFonts';

const H0 = 7;      // first hour shown
const HOURS = 15;  // 7 AM .. 10 PM
const HH = 56;     // px per hour (roomy enough to read at a glance)
const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

export function KioskFamilyBoard({ people, events, chores, onOpenEvent, onOpenChore }: {
  people: FamilyMember[];
  events: FamilyEvent[];
  chores: { id: string; title: string; assignedToId?: string; dueTime?: string; dueDate?: string; status: string }[];
  onOpenEvent: (e: FamilyEvent) => void;
  onOpenChore: (id: string) => void;
}) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const ref = useRef<ScrollView>(null);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = localDateStr();
  // The "now" bar: a pill with the time and a line that gently pulses; the board glides to it on open.
  const pulse = useRef(new Animated.Value(0)).current;
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.timing(grow, { toValue: 1, duration: 700, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [pulse, grow]);
  useEffect(() => { const t = setTimeout(() => ref.current?.scrollTo({ y: Math.max(0, ((nowMin / 60) - H0 - 2) * HH), animated: true }), 450); return () => clearTimeout(t); }, [nowMin]);

  const cols = useMemo(() => people.map((m, i) => {
    const ev = events.filter(e => !e.allDay && e.time && [e.memberId, ...(e.memberIds ?? [])].includes(m.id));
    const ch = chores.filter(c => c.assignedToId === m.id && c.dueTime && (!c.dueDate || c.dueDate === today));
    return { m, tone: pastels[i % 4], ev, ch };
  }), [people, events, chores, pastels, today]);
  const allDay = events.filter(e => e.allDay);
  const top = (min: number) => ((min / 60) - H0) * HH;

  return (
    <View style={[s.board, { backgroundColor: k.well }]}>
      <View style={s.head}>
        <View style={s.gutter} />
        {cols.map(c => (
          <View key={c.m.id} style={[s.pHead, { backgroundColor: c.tone.card }]}>
            <KioskAvatar name={c.m.name} emoji={c.m.emoji} avatarUrl={c.m.avatarUrl} size={26} bgColor={k.card} k={k} />
            <Text style={[s.pName, { color: k.text }]} numberOfLines={1}>{firstName(c.m)}</Text>
          </View>
        ))}
      </View>
      {allDay.length > 0 && <Text style={[s.allDay, { color: k.textMuted, backgroundColor: k.card }]} numberOfLines={1}>All day · {allDay.map(e => e.title).join(' · ')}</Text>}
      <ScrollView ref={ref} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', height: HOURS * HH }}>
          <View style={s.gutter}>
            {Array.from({ length: HOURS }, (_, i) => <Text key={i} style={[s.hr, { color: k.textFaint, top: i * HH - 6 }]}>{hourLabel(H0 + i)}</Text>)}
          </View>
          {cols.map(c => (
            <View key={c.m.id} style={[s.col, { borderLeftColor: k.cardBorder }]}>
              {Array.from({ length: HOURS }, (_, i) => <View key={i} style={[s.line, { top: i * HH, backgroundColor: k.cardBorder }]} />)}
              {c.ev.map(e => {
                const st = toMin(e.time); const en = e.endTime ? toMin(e.endTime) : st + 60;
                return (
                  <Pressable key={e.id} onPress={() => onOpenEvent(e)} accessibilityRole="button" accessibilityLabel={`${e.title}, ${fmt12(e.time)}`}
                    style={[s.blk, { top: top(st), height: Math.max(30, ((en - st) / 60) * HH - 3), backgroundColor: c.tone.card, opacity: en < nowMin ? 0.55 : 1 }]}>
                    <Text style={[s.bT, { color: k.text }]} numberOfLines={2}>{e.title}</Text>
                    <Text style={[s.bS, { color: k.textMuted }]} numberOfLines={1}>{fmt12(e.time)}</Text>
                  </Pressable>
                );
              })}
              {c.ch.map(q => {
                const done = ['pending_approval', 'approved', 'done'].includes(q.status);
                return (
                  <Pressable key={q.id} onPress={() => onOpenChore(q.id)} accessibilityRole="button" accessibilityLabel={`${q.title}, chore`} style={[s.chip, { top: top(toMin(q.dueTime)), backgroundColor: k.card, borderColor: c.tone.fg }]}>
                    <Text style={{ fontSize: 12 }}>{done ? '✅' : '⬜'}</Text>
                    <Text style={[s.cT, { color: k.text, textDecorationLine: done ? 'line-through' : 'none' }]} numberOfLines={1}>{q.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {nowMin >= H0 * 60 && nowMin <= (H0 + HOURS) * 60 && (
            <View pointerEvents="none" style={[s.nowWrap, { top: top(nowMin) }]}>
              <Animated.View style={[s.nowPill, { backgroundColor: k.primary, opacity: grow, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }]}>
                <Text style={[s.nowT, { color: k.onPrimary }]}>{fmt12(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)}</Text>
              </Animated.View>
              <Animated.View style={[s.nowLine, { backgroundColor: k.primary, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }), transform: [{ scaleX: grow }] }]} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  board: { flex: 1, flexBasis: 0, minWidth: 0, borderRadius: 26, minHeight: 0, overflow: 'hidden' },
  head: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6 },
  gutter: { width: 52 },
  pHead: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 6 },
  pName: { fontSize: 20, fontFamily: KIOSK_FONT.hand.bold, flexShrink: 1 },
  allDay: { marginHorizontal: 8, marginBottom: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5, fontSize: 17, fontFamily: KIOSK_FONT.hand.bold },
  hr: { position: 'absolute', left: 0, fontSize: 16, fontFamily: KIOSK_FONT.hand.semibold },
  col: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, marginLeft: 6, position: 'relative' },
  line: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  blk: { position: 'absolute', left: 3, right: 3, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  bT: { fontSize: 19, lineHeight: 20, fontFamily: KIOSK_FONT.hand.bold },
  bS: { fontSize: 15, fontFamily: KIOSK_FONT.hand.semibold },
  chip: { position: 'absolute', left: 3, right: 3, height: 30, borderRadius: 12, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7 },
  cT: { flex: 1, fontSize: 17, fontFamily: KIOSK_FONT.hand.bold },
  nowWrap: { position: 'absolute', left: 0, right: 0, height: 0, zIndex: 5, flexDirection: 'row', alignItems: 'center' },
  nowPill: { position: 'absolute', left: -2, top: -11, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, width: 58, alignItems: 'center' },
  nowT: { fontSize: 11, fontWeight: '800' },
  nowLine: { position: 'absolute', left: 56, right: 0, top: -1.5, height: 3, borderRadius: 2 },
});
