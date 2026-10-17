/**
 * KioskHomeBoard — the kitchen-display Home, laid out like the Figma mock:
 * left column weather → tonight's meal → today's meals; right column
 * "Today, together" timeline → "Around the household" → Intercom row.
 * Everything is real data (weather, family_meals, today's events,
 * member_locations sharing flag). Times are always 12h (rule 9).
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { AudioLines, Cloud } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { localDateStr } from '@/lib/dates';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskWeather } from '../useKioskWeather';
import { useKioskMeals, todayMealDay } from '../useKioskMeals';

/** "17:00" → "5:00 PM"; already-12h strings pass through. */
function fmt12(t?: string | null): string {
  if (!t) return '';
  if (/am|pm/i.test(t)) return t.replace(/\s*(am|pm)/i, (_, x) => ` ${x.toUpperCase()}`);
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}
const toMin = (t?: string | null) => {
  if (!t) return 9999;
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(t);
  if (!m) return 9999;
  let h = Number(m[1]) % 12;
  if (m[3] ? m[3].toLowerCase() === 'pm' : Number(m[1]) >= 12) h += 12;
  return h * 60 + Number(m[2]);
};

export function KioskHomeBoard({ members, onIntercom, onLock, familyName, active }: {
  active?: FamilyMember; members: FamilyMember[]; onIntercom: () => void; onLock?: () => void; familyName?: string;
}) {
  const { k } = useKioskColors();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const weather = useKioskWeather();
  const { meals } = useKioskMeals();
  const dayEvents = useEventStore(s => s.dayEvents);
  const { quests } = useQuestStore();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(i); }, []);
  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const longDate = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const [sharing, setSharing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let off = false;
    supabase.from('member_locations').select('member_id, share_location_enabled').then(({ data }) => {
      if (off || !data) return;
      const m: Record<string, boolean> = {};
      (data as any[]).forEach(r => { m[r.member_id] = r.share_location_enabled !== false; });
      setSharing(m);
    });
    return () => { off = true; };
  }, []);

  const todayMeals = useMemo(
    () => meals.filter(m => m.day === todayMealDay()).sort((a, b) => toMin(a.start_time) - toMin(b.start_time)),
    [meals],
  );
  const tonight = todayMeals.find(m => /dinner/i.test(m.type)) ?? todayMeals[todayMeals.length - 1] ?? null;
  const plans = useMemo(
    () => [...dayEvents].sort((a, b) => toMin(a.time) - toMin(b.time)).slice(0, 5),
    [dayEvents],
  );
  const tints = [
    { bg: k.sageSoft, fg: k.sage }, { bg: k.primarySoft, fg: k.primary },
    { bg: k.purpleSoft, fg: k.purple }, { bg: k.goldSoft, fg: k.gold },
  ];
  const people = members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending');
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const openChores = quests.filter((q: any) => active && q.assignedToId === active.id && ['todo', 'claimed', 'in_progress', 'declined'].includes(q.status)).length;
  const summary = [
    openChores > 0 ? `${openChores} chore${openChores === 1 ? '' : 's'} to do` : 'No chores waiting',
    `${dayEvents.length} plan${dayEvents.length === 1 ? '' : 's'} today`,
  ].join(' · ');
  const chorePeople = useMemo(() => {
    const today = localDateStr();
    return people.map(m => {
      const mine = quests.filter((q: any) => q.assignedToId === m.id && !q.isPool && (!q.dueDate || q.dueDate <= today));
      const done = mine.filter((q: any) => ['pending_approval', 'approved', 'done'].includes(q.status)).length;
      return { m, total: mine.length, done };
    });
  }, [people, quests]);
  const nameOf = (id?: string) => members.find(m => m.id === id)?.name?.trim().split(' ')[0];

  const card = { backgroundColor: k.card, borderColor: k.cardBorder };

  const left = (
    <View style={s.col}>
      {tonight && (
        <View style={[s.panel, card, { flex: 1 }]}>
          <View style={[s.hero, { backgroundColor: k.sageSoft }]}>
            <Text style={{ fontSize: 44 }}>{tonight.emoji ?? '🍽️'}</Text>
          </View>
          <Text style={[s.eyebrow, { color: k.sage }]}>
            TONIGHT{tonight.start_time ? ` / ${fmt12(tonight.start_time).toUpperCase()}` : ''}
          </Text>
          <Text style={[s.mealTitle, { color: k.text }]} numberOfLines={2}>{tonight.title}</Text>
          {!!nameOf(tonight.chef_id ?? undefined) && (
            <Text style={[s.sub, { color: k.textMuted }]}>{nameOf(tonight.chef_id ?? undefined)} cooks</Text>
          )}
        </View>
      )}
      {todayMeals.length > 0 && (
        <View style={[s.panel, { backgroundColor: k.sageSoft }]}>
          <Text style={[s.h2, { color: k.text }]}>Today’s meals</Text>
          {todayMeals.map(m => (
            <Text key={m.id} style={[s.mealLine, { color: k.text }]} numberOfLines={1}>
              {m.start_time ? `${fmt12(m.start_time)} · ` : ''}{m.title}
            </Text>
          ))}
        </View>
      )}
    </View>
  );

  const mid = (
    <View style={s.col}>
      <View style={[s.panel, card, { flex: 1 }]}>
        <View style={s.headRow}>
          <Text style={[s.h1, { color: k.text }]}>Today, together</Text>
          <View style={[s.pill, { backgroundColor: k.primarySoft }]}>
            <Text style={[s.pillText, { color: k.primary }]}>{dayEvents.length} shared plan{dayEvents.length === 1 ? '' : 's'}</Text>
          </View>
        </View>
        {plans.length === 0 && <Text style={[s.sub, { color: k.textMuted }]}>Nothing today</Text>}
        {plans.map((e, i) => {
          const t = tints[i % tints.length];
          const who = [nameOf(e.memberId), ...(e.memberIds ?? []).map(nameOf)].filter((x, j, a) => x && a.indexOf(x) === j).join(' + ');
          return (
            <View key={e.id} style={[s.planRow, { backgroundColor: t.bg }]}>
              <Text style={[s.planTime, { color: t.fg }]}>{e.allDay ? 'All day' : fmt12(e.time)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.planTitle, { color: k.text }]} numberOfLines={1}>{e.title}</Text>
                <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={1}>
                  {[who, e.endTime ? `until ${fmt12(e.endTime)}` : ''].filter(Boolean).join(' · ') || ''}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

    </View>
  );

  const side = (
    <View style={s.col}>
      {chorePeople.some(c => c.total > 0) && (
        <View style={[s.panel, card]}>
          <View style={s.headRow}>
            <Text style={[s.h2, { color: k.text }]}>Chores today</Text>
          </View>
          {chorePeople.filter(c => c.total > 0).map((c, i) => {
            const t = tints[i % tints.length];
            return (
              <View key={c.m.id} style={s.progRow}>
                <View style={[s.initial, { backgroundColor: t.bg }]}>
                  <Text style={[s.initialText, { color: t.fg }]}>{(c.m.name?.[0] ?? '?').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[s.planTitle, { color: k.text }]} numberOfLines={1}>{c.m.name?.trim().split(' ')[0]}</Text>
                  <View style={[s.track, { backgroundColor: k.well }]}>
                    <View style={[s.fill, { backgroundColor: t.fg, width: `${Math.round((c.done / c.total) * 100)}%` }]} />
                  </View>
                </View>
                <Text style={[s.pillText, { color: c.done === c.total ? k.sage : k.textMuted }]}>
                  {c.done === c.total ? 'All done ✓' : `${c.done} of ${c.total}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={[s.panel, card]}>
        <View style={s.headRow}>
          <Text style={[s.h2, { color: k.text }]}>Around the household</Text>
        </View>
        <View style={s.chips}>
          {people.map((m, i) => {
            const on = sharing[m.id] === true;
            const t = on ? tints[0] : tints[1];
            return (
              <View key={m.id} style={[s.chip, { backgroundColor: t.bg }]}>
                <Text style={[s.chipName, { color: t.fg }]} numberOfLines={1}>{m.name?.trim().split(' ')[0]}</Text>
                <Text style={[s.chipName, { color: t.fg }]}>{on ? '●' : '○'}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={s.intercomRow}>
        <AudioLines size={28} color={k.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[s.h2, { color: k.text, fontWeight: '500' }]}>Intercom</Text>
        </View>
        <Pressable
          onPress={onIntercom}
          accessibilityRole="button"
          style={[s.intercomBtn, { backgroundColor: k.primary }]}
        >
          <Text style={[s.intercomText, { color: k.onPrimary }]}>Talk</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={s.wrap}>
      <View style={s.topRow}>
        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          <Text style={[s.brandTitle, { color: k.text }]} numberOfLines={1}>
            {greeting}{active ? `, ${active.name?.trim().split(' ')[0]}` : ''}
          </Text>
          <View style={s.pillRow}>
            <View style={[s.pill, { backgroundColor: k.primarySoft }]}>
              <Text style={[s.pillText, { color: k.primary }]}>{summary}</Text>
            </View>
            {weather && (
              <View style={[s.pill, { backgroundColor: k.well }]}>
                <Text style={[s.pillText, { color: k.textMuted }]}>{Math.round(weather.temperature)}{weather.unit} · {weather.condition}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.bigClock, { color: k.text }]}>{clock}</Text>
          <Text style={[s.sub, { color: k.textMuted }]}>{longDate}</Text>
        </View>
      </View>
      <View style={[s.wrap, wide && s.wrapWide]}>
        <View style={wide ? { flex: 1 } : undefined}>{left}</View>
        <View style={wide ? { flex: 1.25 } : undefined}>{mid}</View>
        <View style={wide ? { flex: 1 } : undefined}>{side}</View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  progRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  initial: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  pillRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  logo: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoGlyph: { fontSize: 20, fontWeight: '800' },
  brandTitle: { fontSize: 26, letterSpacing: -0.5, fontWeight: '800' },
  bigClock: { fontSize: 34, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  footRow: { flexDirection: 'row', alignItems: 'center' },
  lockBtn: { borderWidth: 1, borderRadius: KIOSK_RADIUS.md, paddingVertical: 14, paddingHorizontal: 24 },
  lockText: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  fine: { fontSize: KIOSK_TYPO.label, fontWeight: '600' },
  wrap: { gap: 16, flex: 1 },
  wrapWide: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  col: { gap: 16, flex: 1 },
  panel: { borderRadius: 28, padding: 20, overflow: 'hidden', gap: KIOSK_SPACE.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  wRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md },
  temp: { fontSize: 44, fontWeight: '800', letterSpacing: -2 },
  hero: { flex: 1, minHeight: 90, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: KIOSK_TYPO.label, fontWeight: '800', letterSpacing: 0.6 },
  mealTitle: { fontSize: 32, fontWeight: '800' },
  mealLine: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 17, fontWeight: '500' },
  h1: { fontSize: 32, fontWeight: '800' },
  h2: { fontSize: KIOSK_TYPO.heading, fontWeight: '700' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIOSK_SPACE.sm },
  pill: { borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6 },
  pillText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.lg, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 20 },
  planTime: { width: 104, fontSize: 16, fontWeight: '600' },
  planTitle: { fontSize: 16, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  chip: { flexGrow: 1, flexBasis: '45%', borderRadius: 16, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  chipName: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  intercomRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, paddingHorizontal: KIOSK_SPACE.sm },
  intercomBtn: { borderRadius: KIOSK_RADIUS.md, paddingVertical: 18, paddingHorizontal: 32 },
  intercomText: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
});
