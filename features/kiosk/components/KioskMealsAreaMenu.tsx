/**
 * KioskMealsAreaMenu — the left area menu of the kiosk Meals & Groceries page.
 * Every phone feature lives behind one of these areas, each a pastel icon tile
 * with a one-line status. Tonight's dinner and the live shopping trip stay
 * pinned at the bottom. A kid or teen only gets the read-only areas.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CalendarDays, BookOpen, Sparkles, ShoppingCart, Truck, History, BarChart3, ShoppingBasket } from 'lucide-react-native';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { kioskPastels, type KioskColors } from '../kioskPalette';

export type MealsArea = 'plan' | 'recipes' | 'ai' | 'list' | 'runs' | 'history' | 'insights';

const AREAS: { id: MealsArea; label: string; Icon: typeof CalendarDays; parentOnly?: boolean; group: 'MEALS' | 'GROCERIES'; tone: number }[] = [
  { id: 'plan', label: 'Week plan', Icon: CalendarDays, group: 'MEALS', tone: 1 },
  { id: 'recipes', label: 'Recipe book', Icon: BookOpen, group: 'MEALS', tone: 3 },
  { id: 'ai', label: 'AI planner', Icon: Sparkles, parentOnly: true, group: 'MEALS', tone: 2 },
  { id: 'list', label: 'Shopping list', Icon: ShoppingCart, group: 'GROCERIES', tone: 0 },
  { id: 'runs', label: 'Runs', Icon: Truck, parentOnly: true, group: 'GROCERIES', tone: 1 },
  { id: 'history', label: 'History', Icon: History, parentOnly: true, group: 'GROCERIES', tone: 3 },
  { id: 'insights', label: 'Insights', Icon: BarChart3, parentOnly: true, group: 'GROCERIES', tone: 2 },
];

export function KioskMealsAreaMenu({ area, setArea, isKidOrTeen, k, sub, badges, tonight, onTonight, shopping, onShopping }: {
  area: MealsArea; setArea: (a: MealsArea) => void; isKidOrTeen: boolean; k: KioskColors;
  sub: Partial<Record<MealsArea, string>>; badges: Partial<Record<MealsArea, number>>;
  tonight: Meal | null; onTonight: (m: Meal) => void; shopping: string | null; onShopping: () => void;
}) {
  const pastels = kioskPastels(k);
  return (
    <View style={[s.menu, { borderRightColor: k.cardBorder }]}>
      <Text style={[s.title, { color: k.text }]}>Meals & Groceries</Text>
      {(['MEALS', 'GROCERIES'] as const).map(g => (
        <View key={g} style={{ gap: 4 }}>
          <Text style={[s.group, { color: k.textFaint }]}>{g}</Text>
          {AREAS.filter(a => a.group === g && !(a.parentOnly && isKidOrTeen)).map(a => {
            const on = area === a.id;
            const tone = pastels[a.tone];
            const n = badges[a.id] ?? 0;
            return (
              <Pressable key={a.id} onPress={() => setArea(a.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a.label}
                style={[s.item, { backgroundColor: on ? k.primary : 'transparent' }]}>
                <View style={[s.tile, { backgroundColor: on ? 'rgba(255,255,255,0.22)' : tone.card }]}>
                  <a.Icon size={20} color={on ? k.onPrimary : tone.fg} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.label, { color: on ? k.onPrimary : k.text }]} numberOfLines={1}>{a.label}</Text>
                  {!!sub[a.id] && <Text style={[s.sub, { color: on ? k.onPrimary : k.textMuted, opacity: on ? 0.85 : 1 }]} numberOfLines={1}>{sub[a.id]}</Text>}
                </View>
                {n > 0 && <View style={[s.badge, { backgroundColor: on ? k.onPrimary : k.primary }]}><Text style={[s.badgeText, { color: on ? k.primary : k.onPrimary }]}>{n}</Text></View>}
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ flex: 1 }} />
      <View style={s.mini}>
        {!!tonight && (
          <Pressable onPress={() => onTonight(tonight)} accessibilityRole="button" style={[s.tonight, { backgroundColor: k.pastelSage }]}>
            <Text style={{ fontSize: 28 }}>{tonight.emoji ?? '🍽️'}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.sub, { color: k.sage, fontWeight: '800' }]} numberOfLines={1}>TONIGHT{tonight.start_time ? ` · ${tonight.start_time}` : ''}</Text>
              <Text style={[s.label, { color: k.text }]} numberOfLines={1}>{tonight.title}</Text>
            </View>
          </Pressable>
        )}
        {!!shopping && (
          <Pressable onPress={onShopping} accessibilityRole="button" style={[s.shop, { backgroundColor: k.pastelAmber }]}>
            <ShoppingBasket size={16} color={k.gold} />
            <Text style={[s.sub, { color: k.gold, fontWeight: '800', flex: 1 }]} numberOfLines={2}>{shopping}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  menu: { width: 262, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: KIOSK_SPACE.md, paddingTop: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, paddingHorizontal: 8 },
  group: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1.2, paddingHorizontal: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 56, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 10 },
  tile: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  sub: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800' },
  mini: { gap: 8 },
  tonight: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 10 },
  shop: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 10 },
});
