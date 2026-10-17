/**
 * KioskWeekPlan — the "Week plan" area of the kiosk Meals page: a horizontal
 * board of day columns (this week and next) that opens scrolled so TODAY is the
 * first column on screen. Earlier days are one swipe back; nothing is hidden.
 * Each meal is a pastel card by type; tapping opens the recipe drawer, and a
 * parent gets a + under every day. Search still covers every past week.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator, type LayoutChangeEvent } from 'react-native';
import { Plus, Search, X, ShoppingCart, Sparkles, CalendarDays } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { localDateStr } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KioskAvatar } from './KioskAvatar';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const COL_W = 176;
const GAP = KIOSK_SPACE.sm;

const cap = (t?: string | null) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
const typeIdx = (t?: string | null) => { const i = TYPE_ORDER.indexOf((t ?? '').toLowerCase()); return i < 0 ? 9 : i; };

export function KioskWeekPlan({
  meals, nextMeals, week, nextWeek, loading, members, isKidOrTeen,
  onOpenMeal, onAddMeal, onAddWeekToList, onOpenAi,
  query, setQuery, searchResults, searchLoading,
}: {
  meals: Meal[]; nextMeals: Meal[]; week: string; nextWeek: string; loading: boolean;
  members: FamilyMember[]; isKidOrTeen: boolean;
  onOpenMeal: (m: Meal) => void;
  /** Add a meal on this day of the given Monday-based week. */
  onAddMeal: (day: string, weekOf: string) => void;
  onAddWeekToList: () => void;
  onOpenAi: () => void;
  query: string; setQuery: (q: string) => void;
  searchResults: Meal[] | null; searchLoading: boolean;
}) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const scrollRef = useRef<ScrollView>(null);
  const [boardW, setBoardW] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const days = useMemo(() => {
    const out: { key: string; day: string; weekOf: string; date: Date; meals: Meal[] }[] = [];
    [[week, meals], [nextWeek, nextMeals]].forEach(([w, list]) => {
      const base = new Date((w as string) + 'T00:00:00');
      DAY_NAMES.forEach((day, i) => {
        const date = new Date(base); date.setDate(base.getDate() + i);
        out.push({
          key: `${w}-${day}`, day, weekOf: w as string, date,
          meals: (list as Meal[]).filter(m => m.day === day).sort((a, b) => typeIdx(a.type) - typeIdx(b.type)),
        });
      });
    });
    return out;
  }, [week, nextWeek, meals, nextMeals]);

  const todayStr = localDateStr();
  const todayIdx = Math.max(0, days.findIndex(d => localDateStr(d.date) === todayStr));
  const planned = meals.length + nextMeals.length;

  // Land on today: it is the first column in view; earlier days are scroll-back.
  const goToday = (animated = true) => scrollRef.current?.scrollTo({ x: todayIdx * (COL_W + GAP), animated });
  useEffect(() => { if (boardW > 0 && !loading) goToday(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [boardW, loading, todayIdx]);
  const awayFromToday = Math.abs(scrollX - todayIdx * (COL_W + GAP)) > COL_W / 2;

  const rangeLabel = `${days[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[13].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const chef = (id?: string | null) => (id ? members.find(m => m.id === id) : undefined);

  const typeTone = (t?: string | null) => {
    const i = typeIdx(t);
    return i === 0 ? pastels[2] : i === 1 ? pastels[3] : i === 2 ? pastels[1] : pastels[0];
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={[s.title, { color: k.text }]}>Week plan</Text>
        <View style={[s.range, { backgroundColor: k.well }]}><CalendarDays size={15} color={k.textMuted} /><Text style={[s.rangeText, { color: k.textMuted }]}>{rangeLabel}</Text></View>
        <Text style={[s.count, { color: k.textFaint }]}>{planned} planned</Text>
        <View style={{ flex: 1 }} />
        {!isKidOrTeen && (
          <>
            <Pressable onPress={onAddWeekToList} accessibilityRole="button" accessibilityLabel="Add this week's ingredients to the grocery list" style={[s.btn, { backgroundColor: k.well }]}>
              <ShoppingCart size={18} color={k.text} /><Text style={[s.btnText, { color: k.text }]}>Add week to list</Text>
            </Pressable>
            <Pressable onPress={onOpenAi} accessibilityRole="button" accessibilityLabel="Plan the week with AI" style={[s.btn, { backgroundColor: k.pastelLavCard }]}>
              <Sparkles size={18} color={k.purple} /><Text style={[s.btnText, { color: k.purple }]}>AI planner</Text>
            </Pressable>
            <Pressable onPress={() => onAddMeal(days[todayIdx].day, days[todayIdx].weekOf)} accessibilityRole="button" accessibilityLabel="Add a meal" style={[s.btn, { backgroundColor: k.primary }]}>
              <Plus size={18} color={k.onPrimary} strokeWidth={2.5} /><Text style={[s.btnText, { color: k.onPrimary }]}>Add meal</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={[s.search, { backgroundColor: k.well }]}>
        <Search size={16} color={k.textFaint} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search meals or a date, including past weeks…" placeholderTextColor={k.textFaint}
          style={[s.searchInput, { color: k.text }]} returnKeyType="search" accessibilityLabel="Search meal plan" />
        {!!query && <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search"><X size={16} color={k.textFaint} /></Pressable>}
      </View>

      {query.trim() ? (
        searchLoading ? <ActivityIndicator color={k.gold} style={{ marginTop: KIOSK_SPACE.xl }} />
        : !searchResults?.length ? <Text style={[s.empty, { color: k.textMuted }]}>No meals match “{query.trim()}”.</Text>
        : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.xl }}>
            {searchResults.map((m, i) => {
              const tone = typeTone(m.type);
              const d = new Date(m.week_of + 'T00:00:00'); d.setDate(d.getDate() + Math.max(0, DAY_NAMES.indexOf(m.day)));
              return (
                <Pressable key={m.id} onPress={() => onOpenMeal(m)} accessibilityRole="button" accessibilityLabel={`${m.title}`}
                  style={[s.resRow, { backgroundColor: tone.col, borderColor: tone.card }]}>
                  <View style={[s.resEmoji, { backgroundColor: tone.card }]}><Text style={{ fontSize: 24 }}>{m.emoji ?? '🍽️'}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={1}>{m.title}</Text>
                    <Text style={[s.cardMeta, { color: k.textMuted }]} numberOfLines={1}>
                      {[d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), cap(m.type), chef(m.chef_id)?.name.trim().split(' ')[0]].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )
      ) : loading ? (
        <ActivityIndicator color={k.gold} style={{ marginTop: KIOSK_SPACE.xl }} />
      ) : (
        <View style={{ flex: 1, minHeight: 0 }} onLayout={(e: LayoutChangeEvent) => setBoardW(e.nativeEvent.layout.width)}>
          <ScrollView
            ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
            snapToInterval={COL_W + GAP} decelerationRate="fast"
            onScroll={e => setScrollX(e.nativeEvent.contentOffset.x)} scrollEventThrottle={32}
            contentContainerStyle={{ gap: GAP, paddingBottom: KIOSK_SPACE.md }}
          >
            {days.map((d, i) => {
              const isToday = i === todayIdx;
              const past = i < todayIdx;
              return (
                <View key={d.key} style={[s.col, { width: COL_W, backgroundColor: isToday ? k.primarySoft : k.well, opacity: past ? 0.7 : 1 }]}>
                  <View style={s.colHead}>
                    <Text style={[s.dow, { color: isToday ? k.primary : k.textMuted }]}>{isToday ? 'TODAY' : d.day.toUpperCase()}</Text>
                    <Text style={[s.dnum, { color: k.text }]}>{d.date.getDate()}</Text>
                    {d.date.getDate() === 1 || i === 0 || i === 7 ? <Text style={[s.mon, { color: k.textFaint }]}>{d.date.toLocaleDateString('en-US', { month: 'short' })}</Text> : null}
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                    {d.meals.map(m => {
                      const tone = typeTone(m.type);
                      const c = chef(m.chef_id);
                      return (
                        <Pressable key={m.id} onPress={() => onOpenMeal(m)} accessibilityRole="button" accessibilityLabel={`${m.title} ${cap(m.type)}`}
                          style={({ pressed }) => [s.card, { backgroundColor: tone.card }, pressed && { opacity: 0.75 }]}>
                          <Text style={[s.type, { color: tone.fg }]}>{(m.type ?? 'Meal').toUpperCase()}</Text>
                          <Text style={{ fontSize: 26 }}>{m.emoji ?? '🍽️'}</Text>
                          <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={2}>{m.title}</Text>
                          <View style={s.chefRow}>
                            {c ? <KioskAvatar name={c.name} emoji={c.emoji} avatarUrl={c.avatarUrl} size={20} bgColor={k.card} k={k} /> : null}
                            <Text style={[s.cardMeta, { color: k.textMuted }]} numberOfLines={1}>
                              {[c ? c.name.trim().split(' ')[0] : 'No chef', m.start_time].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                    {!isKidOrTeen && (
                      <Pressable onPress={() => onAddMeal(d.day, d.weekOf)} accessibilityRole="button" accessibilityLabel={`Add a meal for ${d.day} ${d.date.getDate()}`}
                        style={[s.add, { borderColor: k.cardBorder }]}>
                        <Plus size={18} color={k.textFaint} />
                      </Pressable>
                    )}
                    {isKidOrTeen && d.meals.length === 0 && <Text style={[s.none, { color: k.textFaint }]}>Nothing planned</Text>}
                  </ScrollView>
                </View>
              );
            })}
          </ScrollView>
          {awayFromToday && (
            <Pressable onPress={() => goToday()} accessibilityRole="button" accessibilityLabel="Jump to today" style={[s.todayBtn, { backgroundColor: k.primary }]}>
              <Text style={[s.todayText, { color: k.onPrimary }]}>Today</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm, minHeight: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  range: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7 },
  rangeText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  count: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 46, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 14 },
  btnText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, paddingHorizontal: 16, minHeight: 44 },
  searchInput: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '600', paddingVertical: 8 },
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.xl },
  col: { borderRadius: KIOSK_RADIUS.xl, padding: 8, gap: 8, minHeight: 0 },
  colHead: { alignItems: 'center', paddingTop: 2 },
  dow: { fontSize: KIOSK_TYPO.label, fontWeight: '800', letterSpacing: 0.8 },
  dnum: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  mon: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  card: { borderRadius: KIOSK_RADIUS.lg, padding: 10, gap: 3 },
  type: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  cardTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', lineHeight: 18 },
  cardMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '700', flexShrink: 1 },
  chefRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  add: { minHeight: 46, borderRadius: KIOSK_RADIUS.md, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  none: { fontSize: KIOSK_TYPO.label, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.md },
  todayBtn: { position: 'absolute', right: 10, bottom: KIOSK_SPACE.lg, minHeight: 44, borderRadius: 100, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  todayText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1.5, padding: 10 },
  resEmoji: { width: 48, height: 48, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});
