/**
 * KioskMealsAreaMenu — the left area menu of the kiosk Meals & Groceries page.
 * Every phone feature lives behind one of these areas. A kid or teen only gets
 * the read-only areas (week plan, recipe book, their grocery requests).
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CalendarDays, BookOpen, Sparkles, ShoppingCart, Truck, History, BarChart3 } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import type { KioskColors } from '../kioskPalette';

export type MealsArea = 'plan' | 'recipes' | 'ai' | 'list' | 'runs' | 'history' | 'insights';

const AREAS: { id: MealsArea; label: string; Icon: typeof CalendarDays; parentOnly?: boolean; group: 'MEALS' | 'GROCERIES' }[] = [
  { id: 'plan', label: 'Week plan', Icon: CalendarDays, group: 'MEALS' },
  { id: 'recipes', label: 'Recipe book', Icon: BookOpen, group: 'MEALS' },
  { id: 'ai', label: 'AI planner', Icon: Sparkles, parentOnly: true, group: 'MEALS' },
  { id: 'list', label: 'Shopping list', Icon: ShoppingCart, group: 'GROCERIES' },
  { id: 'runs', label: 'Shopping runs', Icon: Truck, parentOnly: true, group: 'GROCERIES' },
  { id: 'history', label: 'History', Icon: History, parentOnly: true, group: 'GROCERIES' },
  { id: 'insights', label: 'Insights', Icon: BarChart3, parentOnly: true, group: 'GROCERIES' },
];

export function KioskMealsAreaMenu({ area, setArea, isKidOrTeen, k, counts }: {
  area: MealsArea; setArea: (a: MealsArea) => void; isKidOrTeen: boolean; isKid: boolean; k: KioskColors;
  counts: { list: number; recipes: number; runs: number };
}) {
  const badge = (id: MealsArea) => (id === 'list' ? counts.list : id === 'runs' ? counts.runs : 0);
  return (
    <View style={[s.menu, { borderRightColor: k.cardBorder }]}>
      {(['MEALS', 'GROCERIES'] as const).map(g => (
        <View key={g} style={{ gap: 6 }}>
          <Text style={[s.group, { color: k.textFaint }]}>{g}</Text>
          {AREAS.filter(a => a.group === g && !(a.parentOnly && isKidOrTeen)).map(a => {
            const on = area === a.id;
            const n = badge(a.id);
            return (
              <Pressable key={a.id} onPress={() => setArea(a.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a.label}
                style={[s.item, { backgroundColor: on ? k.primary : 'transparent' }]}>
                <a.Icon size={20} color={on ? k.onPrimary : k.textMuted} strokeWidth={2.2} />
                <Text style={[s.label, { color: on ? k.onPrimary : k.text }]} numberOfLines={1}>{a.label}</Text>
                {n > 0 && <View style={[s.badge, { backgroundColor: on ? k.onPrimary : k.primary }]}><Text style={[s.badgeText, { color: on ? k.primary : k.onPrimary }]}>{n}</Text></View>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  menu: { width: 224, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: KIOSK_SPACE.md, paddingTop: KIOSK_SPACE.md, gap: KIOSK_SPACE.lg },
  group: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1.2, paddingHorizontal: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 12 },
  label: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800' },
});
