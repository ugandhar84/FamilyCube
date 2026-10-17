/**
 * KioskAreaMenu — the left area menu shared by the kiosk School and Memories
 * pages: a pastel icon tile and label per area, the active one filled blue.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';

export interface AreaItem<T extends string> { id: T; label: string; Icon: LucideIcon; badge?: number }

export function KioskAreaMenu<T extends string>({ title, items, area, onPick }: {
  title: string; items: AreaItem<T>[]; area: T; onPick: (a: T) => void;
}) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  return (
    <View style={[s.menu, { borderRightColor: k.cardBorder }]}>
      <Text style={[s.title, { color: k.text }]}>{title}</Text>
      {items.map((it, i) => {
        const on = area === it.id;
        const tone = pastels[i % pastels.length];
        return (
          <Pressable key={it.id} onPress={() => onPick(it.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={it.label}
            style={[s.item, { backgroundColor: on ? k.primary : 'transparent' }]}>
            <View style={[s.tile, { backgroundColor: on ? 'rgba(255,255,255,0.22)' : tone.card }]}>
              <it.Icon size={19} color={on ? k.onPrimary : tone.fg} strokeWidth={2.2} />
            </View>
            <Text style={[s.label, { color: on ? k.onPrimary : k.text }]} numberOfLines={2}>{it.label}</Text>
            {!!it.badge && <View style={[s.badge, { backgroundColor: on ? k.onPrimary : k.primary }]}><Text style={[s.badgeText, { color: on ? k.primary : k.onPrimary }]}>{it.badge}</Text></View>}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  menu: { width: 250, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: KIOSK_SPACE.md, paddingTop: KIOSK_SPACE.md, gap: 6 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6, paddingHorizontal: 8, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 10 },
  tile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800' },
});
