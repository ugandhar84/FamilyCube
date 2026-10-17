/**
 * KioskWeekPlan — the "Week plan" area of the kiosk Meals page: a horizontal
 * board of day columns (this week and next) that opens scrolled so TODAY is the
 * first column on screen. Earlier days are one swipe back; nothing is hidden.
 * Each meal is a pastel card by type; tapping opens the recipe drawer, and a
 * parent gets a + under every day. Search still covers every past week.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator, type LayoutChangeEvent } from 'react-native';
import { Plus, Search, X, ShoppingCart, Sparkles, CalendarDays, Trash2 } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
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

type Rect = { x: number; y: number; w: number; h: number };

/** A meal card a parent can press-and-hold to drag onto another day or the remove bar. */
function DragCard({ m, tone, chefName, chefAvatar, canDrag, onOpen, onRemove, onStart, onMove, onEnd }: {
  m: Meal; tone: { card: string; fg: string }; chefName: string; chefAvatar: React.ReactNode; canDrag: boolean;
  onOpen: () => void; onRemove: () => void;
  onStart: (m: Meal, x: number, y: number) => void; onMove: (x: number, y: number) => void; onEnd: (x: number, y: number) => void;
}) {
  const { k } = useKioskColors();
  const pan = Gesture.Pan().enabled(canDrag).activateAfterLongPress(280)
    .onStart(e => { runOnJS(onStart)(m, e.absoluteX, e.absoluteY); })
    .onUpdate(e => { runOnJS(onMove)(e.absoluteX, e.absoluteY); })
    .onEnd(e => { runOnJS(onEnd)(e.absoluteX, e.absoluteY); });
  return (
    <GestureDetector gesture={pan}>
      <View>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${m.title} ${cap(m.type)}`} accessibilityHint={canDrag ? 'Press and hold to move to another day' : undefined}
          style={({ pressed }) => [s.card, { backgroundColor: tone.card }, pressed && { opacity: 0.75 }]}>
          <Text style={[s.type, { color: tone.fg }]}>{(m.type ?? 'Meal').toUpperCase()}</Text>
          <Text style={{ fontSize: 26 }}>{m.emoji ?? '🍽️'}</Text>
          <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={2}>{m.title}</Text>
          <View style={s.chefRow}>
            {chefAvatar}
            <Text style={[s.cardMeta, { color: k.textMuted }]} numberOfLines={1}>{[chefName, m.start_time].filter(Boolean).join(' · ')}</Text>
          </View>
        </Pressable>
        {canDrag && (
          <Pressable onPress={onRemove} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Remove ${m.title}`} style={[s.x, { backgroundColor: k.card }]}>
            <X size={14} color={k.textMuted} strokeWidth={2.6} />
          </Pressable>
        )}
      </View>
    </GestureDetector>
  );
}

export function KioskWeekPlan({
  meals, nextMeals, week, nextWeek, loading, members, isKidOrTeen,
  onOpenMeal, onAddMeal, onAddWeekToList, onOpenAi, onMoveMeal, onRemoveMeal,
  query, setQuery, searchResults, searchLoading,
}: {
  meals: Meal[]; nextMeals: Meal[]; week: string; nextWeek: string; loading: boolean;
  members: FamilyMember[]; isKidOrTeen: boolean;
  onOpenMeal: (m: Meal) => void;
  /** Add a meal on this day of the given Monday-based week. */
  onAddMeal: (day: string, weekOf: string) => void;
  onAddWeekToList: () => void;
  onOpenAi: () => void;
  /** Drop a meal on another day (this or next week). */
  onMoveMeal: (m: Meal, day: string, weekOf: string) => void;
  /** Remove a meal (the tab confirms first). */
  onRemoveMeal: (m: Meal) => void;
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

  /* ── drag a meal to another day, or onto the remove bar ── */
  const canDrag = !isKidOrTeen;
  const rootRef = useRef<View>(null);
  const colRefs = useRef<Record<string, View | null>>({});
  const removeRef = useRef<View>(null);
  const rects = useRef<{ cols: Record<string, Rect>; remove: Rect | null; root: Rect; scrollX: number; board: Rect }>({ cols: {}, remove: null, root: { x: 0, y: 0, w: 0, h: 0 }, scrollX: 0, board: { x: 0, y: 0, w: 0, h: 0 } });
  const scrollXRef = useRef(0);
  const boardRef = useRef<View>(null);
  const [drag, setDrag] = useState<Meal | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const ghostStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }, { translateY: dragY.value }] }));
  const autoScroll = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastX = useRef(0);

  const measure = (r: View | null) => new Promise<Rect>(res => { if (!r) return res({ x: 0, y: 0, w: 0, h: 0 }); r.measureInWindow((x, y, w, h) => res({ x, y, w, h })); });
  const hit = useCallback((x: number, y: number): string | null => {
    const R = rects.current;
    if (R.remove && x >= R.remove.x && x <= R.remove.x + R.remove.w && y >= R.remove.y && y <= R.remove.y + R.remove.h) return 'remove';
    const shift = R.scrollX - scrollXRef.current;
    for (const [key, c] of Object.entries(R.cols)) {
      const cx = c.x + shift;
      if (x >= cx && x <= cx + c.w && y >= c.y && y <= c.y + c.h) return key;
    }
    return null;
  }, []);
  const stopAuto = () => { if (autoScroll.current) { clearInterval(autoScroll.current); autoScroll.current = null; } };
  const startDrag = useCallback(async (m: Meal, x: number, y: number) => {
    const cols: Record<string, Rect> = {};
    await Promise.all(Object.entries(colRefs.current).map(async ([key, ref]) => { cols[key] = await measure(ref); }));
    const [root, board] = await Promise.all([measure(rootRef.current), measure(boardRef.current)]);
    rects.current = { cols, remove: null, root, board, scrollX: scrollXRef.current };
    setDrag(m); setHover(null);
    dragX.value = x - root.x - 80; dragY.value = y - root.y - 40; lastX.current = x;
    stopAuto();
    autoScroll.current = setInterval(() => {
      const b = rects.current.board; const px = lastX.current;
      if (px < b.x + 70) scrollRef.current?.scrollTo({ x: Math.max(0, scrollXRef.current - 18), animated: false });
      else if (px > b.x + b.w - 70) scrollRef.current?.scrollTo({ x: scrollXRef.current + 18, animated: false });
    }, 16);
    // The remove bar mounts with the drag; measure it on the next frame.
    setTimeout(async () => { rects.current.remove = await measure(removeRef.current); }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const moveDrag = useCallback((x: number, y: number) => {
    dragX.value = x - rects.current.root.x - 80; dragY.value = y - rects.current.root.y - 40; lastX.current = x;
    setHover(hit(x, y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit]);
  const endDrag = useCallback((x: number, y: number) => {
    stopAuto();
    const target = hit(x, y);
    setDrag(cur => {
      if (cur && target) {
        if (target === 'remove') onRemoveMeal(cur);
        else {
          const col = days.find(d => d.key === target);
          if (col && !(col.day === cur.day && col.weekOf === cur.week_of)) onMoveMeal(cur, col.day, col.weekOf);
        }
      }
      return null;
    });
    setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit, days, onMoveMeal, onRemoveMeal]);
  useEffect(() => () => stopAuto(), []);

  const rangeLabel = `${days[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[13].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const chef = (id?: string | null) => (id ? members.find(m => m.id === id) : undefined);

  const typeTone = (t?: string | null) => {
    const i = typeIdx(t);
    return i === 0 ? pastels[2] : i === 1 ? pastels[3] : i === 2 ? pastels[1] : pastels[0];
  };

  return (
    <View ref={rootRef} style={s.wrap} collapsable={false}>
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
        <View ref={boardRef} collapsable={false} style={{ flex: 1, minHeight: 0 }} onLayout={(e: LayoutChangeEvent) => setBoardW(e.nativeEvent.layout.width)}>
          <ScrollView
            ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
            snapToInterval={COL_W + GAP} decelerationRate="fast"
            scrollEnabled={!drag} onScroll={e => { scrollXRef.current = e.nativeEvent.contentOffset.x; setScrollX(e.nativeEvent.contentOffset.x); }} scrollEventThrottle={16}
            contentContainerStyle={{ gap: GAP, paddingBottom: KIOSK_SPACE.md }}
          >
            {days.map((d, i) => {
              const isToday = i === todayIdx;
              const past = i < todayIdx;
              return (
                <View key={d.key} ref={el => { colRefs.current[d.key] = el; }} collapsable={false}
                  style={[s.col, { width: COL_W, backgroundColor: isToday ? k.primarySoft : k.well, opacity: past && hover !== d.key ? 0.7 : 1 }, hover === d.key && { borderWidth: 3, borderColor: k.primary }]}>
                  <View style={s.colHead}>
                    <Text style={[s.dow, { color: isToday ? k.primary : k.textMuted }]}>{isToday ? 'TODAY' : d.day.toUpperCase()}</Text>
                    <Text style={[s.dnum, { color: k.text }]}>{d.date.getDate()}</Text>
                    {d.date.getDate() === 1 || i === 0 || i === 7 ? <Text style={[s.mon, { color: k.textFaint }]}>{d.date.toLocaleDateString('en-US', { month: 'short' })}</Text> : null}
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                    {d.meals.map(m => {
                      const c = chef(m.chef_id);
                      return (
                        <DragCard key={m.id} m={m} tone={typeTone(m.type)} canDrag={canDrag} onOpen={() => onOpenMeal(m)} onRemove={() => onRemoveMeal(m)}
                          chefName={c ? c.name.trim().split(' ')[0] : 'No chef'}
                          chefAvatar={c ? <KioskAvatar name={c.name} emoji={c.emoji} avatarUrl={c.avatarUrl} size={20} bgColor={k.card} k={k} /> : null}
                          onStart={startDrag} onMove={moveDrag} onEnd={endDrag} />
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
          {drag && (
            <View ref={removeRef} collapsable={false} pointerEvents="none"
              style={[s.removeBar, { backgroundColor: hover === 'remove' ? k.danger : k.dangerSoft, borderColor: k.dangerEdge }]}>
              <Trash2 size={20} color={hover === 'remove' ? k.onAccent : k.danger} />
              <Text style={[s.removeT, { color: hover === 'remove' ? k.onAccent : k.danger }]}>Drop here to remove</Text>
            </View>
          )}
          {awayFromToday && !drag && (
            <Pressable onPress={() => goToday()} accessibilityRole="button" accessibilityLabel="Jump to today" style={[s.todayBtn, { backgroundColor: k.primary }]}>
              <Text style={[s.todayText, { color: k.onPrimary }]}>Today</Text>
            </Pressable>
          )}
        </View>
      )}
      {drag && (
        <Animated.View pointerEvents="none" style={[s.ghost, { backgroundColor: typeTone(drag.type).card }, ghostStyle]}>
          <Text style={[s.type, { color: typeTone(drag.type).fg }]}>{(drag.type ?? 'Meal').toUpperCase()}</Text>
          <Text style={{ fontSize: 24 }}>{drag.emoji ?? '🍽️'}</Text>
          <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={2}>{drag.title}</Text>
        </Animated.View>
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
  x: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ghost: { position: 'absolute', left: 0, top: 0, width: 160, borderRadius: KIOSK_RADIUS.lg, padding: 10, gap: 3, opacity: 0.92, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8, zIndex: 50 },
  removeBar: { position: 'absolute', left: 0, right: 0, bottom: 4, minHeight: 64, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 40 },
  removeT: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
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
