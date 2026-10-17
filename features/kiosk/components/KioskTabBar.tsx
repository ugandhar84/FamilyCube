/**
 * KioskTabBar — the phone's bottom tab bar, scaled up for the wall display.
 * Replaces the old left rail and the parent / kid sidebar columns. Shows the
 * role's first six tabs; anything beyond that (a parent has eleven) sits
 * behind a "More" button that opens a small grid above the bar. Role tab
 * order and availability still come from kioskTabs.railForRole.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { BlurView } from 'expo-blur';
import type { KioskRailItem, KioskTabKey } from '../kioskTabs';

const BAR_SLOTS = 6;

export function KioskTabBar({ items, active, onSelect, badges, leading, trailing, hidden }: {
  items: KioskRailItem[];
  active: KioskTabKey;
  onSelect: (tab: KioskTabKey) => void;
  badges?: Partial<Record<KioskTabKey, number>>;
  /** Rendered before the first tab (the avatar / system-menu button). */
  leading?: ReactNode;
  /** Rendered after the last tab (clock + weather). */
  trailing?: ReactNode;
  /** Slide the bar out of the way (a page is being scrolled) and give its space to the page. */
  hidden?: boolean;
}) {
  const { k, isDark } = useKioskColors();
  const [moreOpen, setMoreOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const [barH, setBarH] = useState(70);
  useEffect(() => {
    Animated.timing(slide, { toValue: hidden ? 1 : 0, duration: 220, useNativeDriver: false }).start();
    if (hidden) setMoreOpen(false);
  }, [hidden, slide]);
  const needMore = items.length > BAR_SLOTS + 1;
  const main = needMore ? items.slice(0, BAR_SLOTS) : items;
  const rest = needMore ? items.slice(BAR_SLOTS) : [];
  const activeInRest = rest.some(r => r.key === active);
  const moreBadge = rest.reduce((n, r) => n + (badges?.[r.key] ?? 0), 0);

  const select = (key: KioskTabKey) => { setMoreOpen(false); onSelect(key); };

  const pastels = kioskPastels(k);
  const toneFor = (key: string) => pastels[Math.max(0, items.findIndex(i => i.key === key)) % 4];

  const renderTab = (
    { key, label, Icon }: KioskRailItem, on: boolean, onPress: () => void, badge?: number,
  ) => {
    const tone = toneFor(key);
    return (
    <Pressable
      key={key} onPress={onPress}
      style={({ pressed }) => [s.tab, pressed && { opacity: 0.7 }]}
      accessibilityRole="tab" accessibilityState={{ selected: on }}
      accessibilityLabel={badge ? `${label}, ${badge} waiting` : label}
    >
      {on && <View style={[s.indicator, { backgroundColor: k.primary }]} />}
      <View style={[s.tile, { backgroundColor: on ? k.primary : tone.card }]}>
        <Icon size={22} color={on ? k.onPrimary : tone.fg} strokeWidth={2.2} />
        {!!badge && (
          <View style={[s.badge, { backgroundColor: k.primary, borderColor: k.card }]}>
            <Text style={[s.badgeText, { color: k.onPrimary }]}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[s.label, { color: on ? k.primary : k.textMuted }]} numberOfLines={1}>
        {label === 'Overview' ? 'Home' : label}
      </Text>
    </Pressable>
    );
  };

  return (
    <Animated.View
      onLayout={e => { if (!hidden) setBarH(e.nativeEvent.layout.height); }}
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[
        s.bar, { backgroundColor: isDark ? 'rgba(95,163,125,0.20)' : 'rgba(198,226,208,0.62)', borderTopColor: isDark ? 'rgba(95,163,125,0.35)' : 'rgba(255,255,255,0.75)' },
        // Margin gives the page the bar's height back; translate carries the
        // bar (and the bottom safe-area strip) fully off screen.
        { marginBottom: slide.interpolate({ inputRange: [0, 1], outputRange: [0, -barH] }),
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, barH + 80] }) }] },
      ]}
    >
      {/* Frosted sage glass: the page shows faintly through a blurred, sage-tinted strip. */}
      <BlurView intensity={55} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {moreOpen && (
        <View style={[s.more, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
          {rest.map(({ key, label, Icon }) => {
            const on = active === key;
            const b = badges?.[key];
            return (
              <Pressable
                key={key} onPress={() => select(key)}
                style={({ pressed }) => [s.moreItem, { backgroundColor: on ? k.primarySoft : toneFor(key).col }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button" accessibilityLabel={label}
              >
                <Icon size={22} color={on ? k.primary : toneFor(key).fg} />
                <Text style={[s.moreLabel, { color: on ? k.primary : k.text }]}>{label}</Text>
                {!!b && <Text style={[s.moreBadge, { color: k.primary }]}>{b}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
      {leading}
      {main.map(it => renderTab(it, active === it.key, () => select(it.key), badges?.[it.key]))}
      {needMore && renderTab(
        { key: 'profile' as KioskTabKey, label: 'More', Icon: MoreHorizontal as any },
        activeInRest || moreOpen,
        () => setMoreOpen(o => !o),
        moreBadge,
      )}
      {trailing}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: KIOSK_SPACE.lg,
    zIndex: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6, minHeight: 64 },
  tile: { width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', top: 0, left: '24%', right: '24%', height: 3, borderRadius: 2 },
  label: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  badge: {
    position: 'absolute', top: -6, right: -10, minWidth: 20, height: 20, borderRadius: 10,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
  more: {
    position: 'absolute', right: KIOSK_SPACE.lg, bottom: '100%', marginBottom: 8,
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, width: 420,
    borderRadius: KIOSK_RADIUS.xl, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  moreItem: {
    width: '30.5%', minHeight: 84, borderRadius: KIOSK_RADIUS.lg, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  moreLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  moreBadge: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
});
