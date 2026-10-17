/**
 * KioskHomeKid — a kid or teen's wall-display Home. Same phone-Hub cards as
 * the parent's, but only their own world: My Pulse (chore ring, coins,
 * streak, next event), a big tap-to-finish My Day list, Next Up, Tonight,
 * and two ask-for-help buttons. Kids can only tick their own chores — every
 * approval and edit stays with a parent.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { KIOSK_TYPO, KIOSK_SPACE } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { useKioskWeather } from '../useKioskWeather';
import { useKioskMeals, todayMealDay } from '../useKioskMeals';
import type { KioskTabKey } from '../kioskTabs';
import { KioskSimpleChecklist, useKidDay } from './KioskSimpleChecklist';
import { KioskKidCheckInTile } from './KioskKidQuickActions';
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

  return (
    <View style={s.wrap}>
      <View>
        <Text style={[s.greet, { color: k.text }]} numberOfLines={1}>{greetingFor(now)}, {firstName(active)}</Text>
        <View style={s.chips}>
          {chip(left ? `${left} chore${left === 1 ? '' : 's'} to do today` : 'All chores done', k.purpleSoft, k.purple)}
          {chip(`🪙 ${coins} coins`, k.goldSoft, k.gold)}
          {weather && chip(`${Math.round(weather.temperature)}${weather.unit} · ${weather.condition}`, k.well, k.textMuted)}
        </View>
      </View>

      <View style={s.cols}>
        <View style={s.col}>
          <Section label="MY PULSE" accent={k.sage} k={k}>
            <PulseCard k={k} isDark={isDark}>
              <View style={s.pulseTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.pulseTitle, { color: k.text }]}>
                    {left ? `${left} chore${left === 1 ? '' : 's'} to go` : 'You’re on fire today! 🔥'}
                  </Text>
                  {streak > 0 && <Text style={[s.sub, { color: k.textMuted }]}>🔥 {streak}-day streak</Text>}
                  <View style={s.coinLine}>
                    <Text style={[s.coinNum, { color: k.text }]}>{coins}</Text>
                    <Text style={[s.sub, { color: k.textMuted, marginTop: 0 }]}>coins</Text>
                  </View>
                </View>
                <Dial
                  pct={total ? done.length / total : 0} value={`${done.length}/${total}`} caption="chores"
                  color={k.sage} track={k.sageEdge} inner={k.sageSoft} k={k}
                />
              </View>
              {nextEvent && (
                <View style={[s.nextChip, { backgroundColor: k.card }]}>
                  <Text style={{ fontSize: 18 }}>📅</Text>
                  <Text style={[s.nextText, { color: k.sage }]} numberOfLines={1}>
                    {nextEvent.title} at {fmt12(nextEvent.time)}
                  </Text>
                </View>
              )}
            </PulseCard>
          </Section>

          <Section label="MY DAY" accent={k.primary} k={k} flex>
            <RaisedCard k={k} isDark={isDark} style={{ flex: 1, minHeight: 0, padding: KIOSK_SPACE.sm }}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 4 }}>
                <KioskSimpleChecklist
                  bare active={active} members={members} k={k} isDark={isDark}
                  onOpenTasks={() => onNavigate('tasks')}
                />
              </ScrollView>
            </RaisedCard>
          </Section>
        </View>

        <View style={s.col}>
          <Section label="NEXT UP" accent={k.primary} k={k} right={`${mine.length} today`}>
            <NextUpTimeline events={mine} members={members} k={k} isDark={isDark} onOpen={() => onNavigate('schedule')} />
          </Section>
          <Section label={`TONIGHT${tonight?.start_time ? ` · ${fmt12(tonight.start_time).toUpperCase()}` : ''}`} accent={k.sage} k={k}>
            <TonightCard meal={tonight} cook={cook} k={k} isDark={isDark} onOpen={() => onNavigate('meals')} />
          </Section>
          <View style={s.asks}>
            <ActionTile row emoji="🙋" label="Ask a parent" bg={k.purpleSoft} fg={k.purple} onPress={openPicker} />
            <KioskKidCheckInTile active={active} />
          </View>
        </View>
      </View>
      {askNode}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: KIOSK_SPACE.md, paddingHorizontal: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md },
  greet: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  chips: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  chip: { borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7 },
  chipText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  cols: { flex: 1, flexDirection: 'row', gap: KIOSK_SPACE.lg, minHeight: 0 },
  col: { flex: 1, gap: KIOSK_SPACE.md, minHeight: 0 },
  pulseTop: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  pulseTitle: { fontSize: KIOSK_TYPO.heading + 2, fontWeight: '800', letterSpacing: -0.4 },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  coinLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  coinNum: { fontSize: KIOSK_TYPO.hero, fontWeight: '800' },
  nextChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12 },
  nextText: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  asks: { flexDirection: 'row', gap: 10 },
});
