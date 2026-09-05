/**
 * KioskAmbientOverlay — the calm "nobody's touching it" state that sits
 * between an actively-used kiosk and a locked one.
 *
 * A wall-mounted tablet spends the overwhelming majority of its life
 * untouched. Before this, that majority state was simply "whatever screen
 * the last person left open, at full brightness and full detail, forever"
 * — which reads as an app someone abandoned mid-task rather than a
 * deliberate ambient display, and burns a static UI into the panel of a
 * device that is by definition always on.
 *
 * So kiosk now has three states, not two (see kioskTheme's own note):
 *   active → (90s untouched) → ambient → (idle timeout) → locked
 *
 * Ambient is explicitly NOT a privacy boundary — any touch dismisses it
 * instantly with no authentication, and it deliberately shows only what's
 * safe to display to a room: the time, the date, and a count of what's
 * on today. The lock screen remains the actual privacy boundary and still
 * fires on its own separate, longer timer underneath this.
 *
 * Rendered as a plain absolutely-positioned View, NOT a Modal — the
 * opposite of KioskLockScreen's deliberate choice, and for the opposite
 * reason. The lock screen must cover any open sheet, so it needs the
 * native modal layer. This must NOT: if someone leaves the event editor
 * open and walks away, the ambient veil should settle over the dashboard
 * *behind* that sheet rather than covering the sheet itself, which would
 * both hide their work and make a dismissable-on-touch overlay eat the
 * first tap they aimed at the form.
 *
 * pointerEvents="none" throughout: the veil never intercepts a touch. The
 * root SafeAreaView's own onTouchStart is what clears it, so the very
 * first tap both dismisses the ambient state AND lands on whatever the
 * person was actually aiming at — no wasted "wake up" tap, which matters
 * on a device you walk up to and use in one motion.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import { CalendarDays, ClipboardCheck } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_AMBIENT_FADE_MS } from './kioskTheme';

export function KioskAmbientOverlay({
  visible, familyName, eventCount, choreCount, colors,
}: {
  visible: boolean;
  familyName: string;
  /** Events remaining today — a count only, never titles: this is visible
   *  to anyone in the room, including guests. */
  eventCount: number;
  /** Chores still open — same "count, never content" rule. */
  choreCount: number;
  colors: any;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  // Kept mounted through the fade-OUT so the exit animation can actually
  // play; unmounted once it finishes so an invisible full-screen view
  // isn't left in the tree indefinitely.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    const anim = Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: KIOSK_AMBIENT_FADE_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => anim.stop();
  }, [visible, fade]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!mounted) return;
    // Only ticks while actually on screen — no background interval on a
    // device that spends all day in this component's "off" state.
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, [mounted]);

  if (!mounted) return null;

  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, s.root, { backgroundColor: colors.background, opacity: fade }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={s.inner}>
        <Text style={[s.eyebrow, { color: colors.textTertiary }]} numberOfLines={1}>
          {familyName.toUpperCase()}
        </Text>
        <Text
          style={[s.clock, { color: colors.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {clock}
        </Text>
        <Text style={[s.date, { color: colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
          {date}
        </Text>

        {(eventCount > 0 || choreCount > 0) && (
          <View style={s.pillRow}>
            {eventCount > 0 && (
              <View style={[s.pill, { backgroundColor: colors.primaryLight }]}>
                <CalendarDays size={22} color={colors.primary} />
                <Text style={[s.pillText, { color: colors.primary }]} numberOfLines={1}>
                  {eventCount} {eventCount === 1 ? 'event' : 'events'} today
                </Text>
              </View>
            )}
            {choreCount > 0 && (
              <View style={[s.pill, { backgroundColor: colors.amberLight }]}>
                <ClipboardCheck size={22} color={colors.amber} />
                <Text style={[s.pillText, { color: colors.amber }]} numberOfLines={1}>
                  {choreCount} {choreCount === 1 ? 'chore' : 'chores'} open
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={[s.hint, { color: colors.textTertiary }]} numberOfLines={1}>
          Touch anywhere to continue
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', paddingHorizontal: KIOSK_SPACE.xxl, maxWidth: '100%' },
  eyebrow: { fontSize: KIOSK_TYPO.sectionLabel, fontWeight: '800', letterSpacing: 2.5, marginBottom: KIOSK_SPACE.md },
  clock: {
    fontSize: KIOSK_TYPO.clock, fontWeight: '200', letterSpacing: -2,
    fontVariant: ['tabular-nums'], lineHeight: KIOSK_TYPO.clock * 1.05,
  },
  date: { fontSize: KIOSK_TYPO.heading, fontWeight: '500', marginTop: KIOSK_SPACE.xs },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.xl },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.full, paddingHorizontal: KIOSK_SPACE.lg, paddingVertical: KIOSK_SPACE.sm,
  },
  pillText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  hint: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: KIOSK_SPACE.xxl, letterSpacing: 0.5 },
});
