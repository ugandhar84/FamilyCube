/**
 * KioskHomeKid — a kid or teen's wall-display Home. Same phone-Hub cards as
 * the parent's, but only their own world: My Pulse (chore ring, coins,
 * streak, next event), a big tap-to-finish My Day list, Next Up, Tonight,
 * and two ask-for-help buttons. Kids can only tick their own chores — every
 * approval and edit stays with a parent.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { KIOSK_TYPO, KIOSK_SPACE } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { useKioskWeather } from '../useKioskWeather';
import { useKioskMeals, todayMealDay } from '../useKioskMeals';
import type { KioskTabKey } from '../kioskTabs';
import { KioskSimpleChecklist, useKidDay } from './KioskSimpleChecklist';
import { KioskKidCheckInTile } from './KioskKidQuickActions';
import { FamilyNowCard, HomeChatsCard, HomeMedsCard, StickyNotesCard, HomeMemoriesCard } from './KioskHomeWidgets';
import { useQuestStore } from '@/store/choreAdapter';
import { useKioskAskParent } from './KioskAskParentFlow';
import {
  Section, Dial, PulseCard, RaisedCard, NextUpTimeline, TonightCard, ActionTile,
  fmt12, toMin, firstName, greetingFor, useNow,
} from './KioskHomeParts';

export function KioskHomeKid({ active, members, onNavigate }: {
  active: FamilyMember; members: FamilyMember[]; onNavigate: (tab: KioskTabKey) => void;
}) {
  const { k, isDark } = useKioskColors();
  const now = useNow();
  const weather = useKioskWeather();
  const dayEvents = useEventStore(s => s.dayEvents);
  const { meals } = useKioskMeals();
  const { todo, done, total } = useKidDay(active, members);
  const { openPicker, node: askNode } = useKioskAskParent({ active, members, withPicker: true });

  const coins = (active as any).mainCoins ?? (active as any).coins ?? 0;
  const streak = (active as any).streak ?? 0;
  // Their own plans, plus anything for the whole family (no assignee).
  const mine = useMemo(
    () => dayEvents.filter(e => {
      const ids = [e.memberId, ...(e.memberIds ?? [])].filter(Boolean);
      return ids.length === 0 || ids.includes(active.id);
    }),
    [dayEvents, active.id],
  );
  const nextEvent = useMemo(() => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return [...mine].sort((a, b) => toMin(a.time) - toMin(b.time)).find(e => !e.allDay && toMin(e.time) >= nowMin);
  }, [mine, now]);
  const tonight = useMemo(() => {
    const td = meals.filter(m => m.day === todayMealDay()).sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    return td.find(m => /dinner/i.test(m.type)) ?? td[td.length - 1] ?? null;
  }, [meals]);
  const cook = tonight?.chef_id ? firstName(members.find(m => m.id === tonight.chef_id)) : undefined;
  const left = todo.length;

  const chip = (text: string, bg: string, fg: string) => (
    <View style={[s.chip, { backgroundColor: bg }]}><Text style={[s.chipText, { color: fg }]}>{text}</Text></View>
  );

  // One vertical timeline: their events as blocks, their chores dropped in at the time they are due.
  const { quests } = useQuestStore();
  const timeline = useMemo(() => {
    const evs = mine.filter(e => !e.allDay && e.time).map(e => ({ k: 'e' as const, id: e.id, min: toMin(e.time), end: e.endTime ? toMin(e.endTime) : toMin(e.time) + 60, title: e.title, sub: `${fmt12(e.time)}${e.endTime ? ` – ${fmt12(e.endTime)}` : ''}`, done: false }));
    const chs = [...todo, ...done].filter((q: any) => q.dueTime).map((q: any) => ({ k: 'c' as const, id: q.id, min: toMin(q.dueTime), end: toMin(q.dueTime), title: q.title, sub: fmt12(q.dueTime), done: done.some((d: any) => d.id === q.id), coins: q.coins }));
    return [...evs, ...chs].sort((a, b) => a.min - b.min);
  }, [mine, todo, done]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowAt = timeline.findIndex(x => x.min > nowMin);
  const pastels = kioskPastels(k);
  void quests;

  const qbtn = (label: string, emoji: string, bg: string, fg: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[s.qb, { backgroundColor: bg }]}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text><Text style={[s.qbT, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
  const pct = total ? done.length / total : 0;

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[s.greet, { color: k.text }]} numberOfLines={1}>{greetingFor(now)}, {firstName(active)}</Text>
          <View style={s.chips}>
            {chip(left ? `${left} to do today` : 'All chores done', k.purpleSoft, k.purple)}
            {chip(`🪙 ${coins} coins`, k.goldSoft, k.gold)}
            {weather && chip(`${Math.round(weather.temperature)}${weather.unit} · ${weather.condition}`, k.well, k.textMuted)}
          </View>
        </View>
        <View style={s.qa}>{qbtn('Ask a parent', '🙋', k.primary, k.onPrimary, openPicker)}</View>
      </View>

      <View style={s.cols}>
        <ScrollView style={s.col} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
          <PulseCard k={k} isDark={isDark}>
            <View style={s.pulseTop}>
              <Dial pct={pct} value={`${done.length}/${total}`} caption="done" color={k.sage} track={k.sageEdge} inner={k.sageSoft} k={k} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.pulseTitle, { color: k.text }]}>{left ? `${left} to do today` : 'You’re on fire today! 🔥'}</Text>
                {streak > 0 && <Text style={[s.sub, { color: k.textMuted }]}>🔥 {streak}-day streak</Text>}
              </View>
              <View style={[s.jar, { backgroundColor: k.pastelAmber, borderColor: k.pastelAmberCard }]}>
                <Text style={{ fontSize: 34 }}>🫙</Text>
                <View><Text style={[s.coinNum, { color: k.text }]}>{coins}</Text><Text style={[s.sub, { color: k.gold, marginTop: 0 }]}>coins</Text></View>
              </View>
            </View>
          </PulseCard>
          <Section label="MY TO-DO" accent={k.primary} k={k}>
            <RaisedCard k={k} isDark={isDark} style={{ padding: KIOSK_SPACE.sm }}>
              <KioskSimpleChecklist bare active={active} members={members} k={k} isDark={isDark} onOpenTasks={() => onNavigate('tasks')} />
            </RaisedCard>
          </Section>
          <HomeMedsCard active={active} members={members} ownOnly />
          <StickyNotesCard active={active} members={members} />
        </ScrollView>

        <ScrollView style={s.col} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
          <Section label="TODAY’S TIMELINE" accent={k.sage} k={k} right={`${mine.length} today`}>
            <View style={{ gap: 8 }}>
              {timeline.length === 0 && <Text style={[s.sub, { color: k.textMuted }]}>Nothing planned today</Text>}
              {timeline.map((x, i) => {
                const tone = pastels[i % 4];
                const past = (x.k === 'e' ? x.end : x.min) <= nowMin;
                return (
                  <View key={`${x.k}-${x.id}`}>
                    {i === nowAt && <View style={s.nowRow}><View style={[s.nowPill, { backgroundColor: k.primary }]}><Text style={[s.nowT, { color: k.onPrimary }]}>{fmt12(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)}</Text></View><View style={[s.nowLine, { backgroundColor: k.primary }]} /></View>}
                    <View style={s.tRow}>
                      <Text style={[s.tTime, { color: k.textMuted }]}>{fmt12(`${String(Math.floor(x.min / 60)).padStart(2, '0')}:${String(x.min % 60).padStart(2, '0')}`)}</Text>
                      <View style={[s.tDot, { backgroundColor: x.k === 'c' ? (x.done ? k.sage : k.card) : tone.card, borderColor: tone.fg }]} />
                      {x.k === 'e' ? (
                        <Pressable onPress={() => onNavigate('schedule')} accessibilityRole="button" style={[s.tCard, { backgroundColor: tone.col, borderColor: tone.card, opacity: past ? 0.55 : 1 }]}>
                          <Text style={[s.tTitle, { color: k.text }]} numberOfLines={1}>{x.title}</Text>
                          <Text style={[s.sub, { color: k.textMuted, marginTop: 0 }]}>{x.sub}</Text>
                        </Pressable>
                      ) : (
                        <View style={[s.tChore, { backgroundColor: k.card, borderColor: k.pastelPrimaryCard }]}>
                          <Text style={{ fontSize: 15 }}>{x.done ? '✅' : '⬜'}</Text>
                          <Text style={[s.tTitle, { color: k.text, flex: 1, textDecorationLine: x.done ? 'line-through' : 'none' }]} numberOfLines={1}>{x.title}</Text>
                          <View style={[s.coinPill, { backgroundColor: k.pastelAmberCard }]}><Text style={[s.sub, { color: k.gold, marginTop: 0 }]}>🪙 {(x as any).coins}</Text></View>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
              {nowAt === -1 && timeline.length > 0 && <View style={s.nowRow}><View style={[s.nowPill, { backgroundColor: k.primary }]}><Text style={[s.nowT, { color: k.onPrimary }]}>Now</Text></View><View style={[s.nowLine, { backgroundColor: k.primary }]} /></View>}
            </View>
          </Section>
          <Section label={`TONIGHT${tonight?.start_time ? ` · ${fmt12(tonight.start_time).toUpperCase()}` : ''}`} accent={k.gold} k={k}>
            <TonightCard meal={tonight} cook={cook} k={k} isDark={isDark} onOpen={() => onNavigate('meals')} />
          </Section>
          <FamilyNowCard members={members} onOpenMap={() => onNavigate('findfam')} />
          <HomeChatsCard active={active} members={members} />
          <HomeMemoriesCard onOpen={() => onNavigate('memories')} />
          <KioskKidCheckInTile active={active} />
        </ScrollView>
      </View>
      {askNode}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: KIOSK_SPACE.md, paddingHorizontal: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md },
  greet: { fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  chip: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  cols: { flex: 1, flexDirection: 'row', gap: KIOSK_SPACE.lg, minHeight: 0 },
  col: { flex: 1, gap: KIOSK_SPACE.md, minHeight: 0 },
  pulseTop: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  pulseTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  coinLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  coinNum: { fontSize: 26, fontWeight: '800' },
  nextChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12 },
  nextText: { flex: 1, fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  asks: { flexDirection: 'row', gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  qa: { marginLeft: 'auto', flexDirection: 'row', gap: 10 },
  qb: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 18, paddingHorizontal: 16 },
  qbT: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  jar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 22, borderWidth: 1.5, padding: 10 },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tTime: { width: 70, textAlign: 'right', fontSize: 12.5, fontWeight: '800' },
  tDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 3 },
  tCard: { flex: 1, borderRadius: 18, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8 },
  tChore: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 7 },
  tTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  coinPill: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  nowPill: { width: 70, borderRadius: 100, paddingVertical: 3, alignItems: 'center' },
  nowT: { fontSize: 11.5, fontWeight: '800' },
  nowLine: { flex: 1, height: 3, borderRadius: 2 },
});
