/**
 * KioskAmbientOverlay — the fullscreen ambient "standby" display: the calm
 * state between an actively-used kiosk and a locked one.
 *
 * A wall-mounted tablet spends the overwhelming majority of its life
 * untouched. Before the prior pass, that majority state was "whatever
 * screen the last person left open, at full brightness, forever" — which
 * reads as an abandoned app rather than a deliberate display, and burns a
 * static UI into a panel that is by definition always on.
 *
 * Kiosk therefore has three states, not two (see kioskTheme's note):
 *   active → (90s untouched) → ambient → (idle timeout) → locked
 *
 * ── This pass ───────────────────────────────────────────────────────────
 * Rebuilt to the reference mockup's standby screen: a giant floating clock
 * that drifts slowly, and a glass status panel along the bottom carrying
 * what's next. Two deliberate departures from that mockup:
 *
 *   · NO WEATHER. The mockup shows "72°F Sunny in Celina · High 84° / Low
 *     65°". There is no weather API anywhere in this codebase and no key to
 *     call one with, so any temperature rendered here would be a fabricated
 *     number presented as a live reading, on a screen a family would
 *     reasonably trust for exactly that. The slot is given to the next
 *     event instead, which is real. If weather is wanted later it needs a
 *     provider decision and a key, not a placeholder.
 *
 *   · TITLES ARE SHOWN, DELIBERATELY, WITH A CAVEAT. The previous version
 *     showed counts only ("3 events today") on the grounds that a room may
 *     contain guests. That was over-cautious to the point of uselessness:
 *     "1 event today" tells the household nothing, and the mockup's whole
 *     value is the next-event card. The compromise: the next event's title
 *     and time are shown, because that is the single most useful thing a
 *     kitchen display can say — but anything the app itself marks sensitive
 *     (isEventSensitive: medical, therapy, etc.) is reduced to "Something
 *     scheduled" instead. Ambient is still NOT the privacy boundary; the
 *     lock screen is, and it still fires on its own longer timer beneath
 *     this.
 *
 * Still a plain absolutely-positioned View, NOT a Modal — the deliberate
 * opposite of KioskLockScreen's choice, for the opposite reason. The lock
 * screen must cover an open sheet; this must not. If someone leaves the
 * event editor open and walks away, the veil should settle over the
 * dashboard BEHIND that sheet rather than hiding their work and eating the
 * first tap they aim at the form.
 *
 * pointerEvents="none" throughout: the veil never intercepts a touch. The
 * root SafeAreaView's own onTouchStart clears it, so the first tap both
 * dismisses ambient AND lands on what the person was aiming at — no wasted
 * wake-up tap, which matters on a device you walk up to and use in one
 * motion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import { CalendarDays, ClipboardCheck, Moon } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_AMBIENT_FADE_MS } from './kioskTheme';
import { useKioskColors } from './kioskPalette';

export interface AmbientNextUp {
  /** Display time, already formatted ("4:45 PM") or undefined for all-day. */
  time?: string;
  /** Event title — or a redacted stand-in when the event is sensitive. */
  title: string;
  /** Who it involves, first name only. Omitted for a redacted event. */
  who?: string;
}

export function KioskAmbientOverlay({
  visible, familyName, eventCount, choreCount, nextUp,
}: {
  visible: boolean;
  familyName: string;
  /** Events remaining today. */
  eventCount: number;
  /** Chores still open. */
  choreCount: number;
  /** The next thing on the calendar, already redacted by the caller if the
   *  event is sensitive. Omit when there's nothing left today. */
  nextUp?: AmbientNextUp;
}) {
  const { k } = useKioskColors();
  const fade = useRef(new Animated.Value(0)).current;
  // A slow vertical drift, the mockup's `animate-float`. This is not
  // decoration on an always-on panel — a clock that never moves a pixel for
  // sixteen hours a day is exactly how OLED/LCD burn-in happens, so the
  // drift is doing real work as well as looking calm.
  const drift = useRef(new Animated.Value(0)).current;

  // Kept mounted through the fade-OUT so the exit can play; unmounted once
  // finished so an invisible fullscreen view isn't left in the tree.
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

  useEffect(() => {
    if (!mounted) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 8000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 8000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); };
  }, [mounted, drift]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!mounted) return;
    // Only ticks while on screen — no background interval on a device that
    // spends most of the day in this component's "off" state.
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, [mounted]);

  const translateY = useMemo(
    () => drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }),
    [drift],
  );

  if (!mounted) return null;

  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Animated.View
      pointerEvents="none"
      // Standby uses its own ground (k.standby) in BOTH light and dark mode,
      // and that is on purpose — see kioskPalette's note on the token. An
      // always-on panel showing a full-brightness white field across a dark
      // kitchen at 2am is a lamp. This is the one place the two appearances
      // deliberately converge; every other kiosk surface differs by mode.
      style={[StyleSheet.absoluteFill, s.root, { backgroundColor: k.standby, opacity: fade }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* ── Corner label ── */}
      <View style={s.corner}>
        <Moon size={16} color={k.gold} />
        <Text style={[s.cornerText, { color: k.gold }]} numberOfLines={1}>
          {familyName.toUpperCase()}
        </Text>
      </View>

      {/* ── The clock ── */}
      <Animated.View style={[s.center, { transform: [{ translateY }] }]}>
        <Text
          style={[s.clock, { color: k.standbyText }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {clock}
        </Text>
        <Text
          style={[s.date, { color: k.standbyTextMuted }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {date}
        </Text>
      </Animated.View>

      {/* ── Glass status panel ── */}
      {(nextUp || eventCount > 0 || choreCount > 0) && (
        <View style={[s.glass, { backgroundColor: k.glass, borderColor: k.glassEdge }]}>
          {nextUp ? (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.glassLabel, { color: k.gold }]} numberOfLines={1}>
                NEXT UP{nextUp.time ? ` · ${nextUp.time}` : ''}
              </Text>
              <Text style={[s.glassTitle, { color: k.standbyText }]} numberOfLines={1}>
                {nextUp.title}
              </Text>
              {!!nextUp.who && (
                <Text style={[s.glassMeta, { color: k.standbyTextMuted }]} numberOfLines={1}>
                  {nextUp.who}
                </Text>
              )}
            </View>
          ) : (
            <Text style={[s.glassTitle, { color: k.standbyText, flex: 1 }]} numberOfLines={1}>
              Nothing left on today's calendar
            </Text>
          )}

          <View style={s.glassCounts}>
            {eventCount > 0 && (
              <View style={s.glassCount}>
                <CalendarDays size={16} color={k.standbyTextMuted} />
                <Text style={[s.glassCountText, { color: k.standbyTextMuted }]} numberOfLines={1}>
                  {eventCount} {eventCount === 1 ? 'event' : 'events'}
                </Text>
              </View>
            )}
            {choreCount > 0 && (
              <View style={s.glassCount}>
                <ClipboardCheck size={16} color={k.standbyTextMuted} />
                <Text style={[s.glassCountText, { color: k.standbyTextMuted }]} numberOfLines={1}>
                  {choreCount} {choreCount === 1 ? 'chore' : 'chores'}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <Text style={[s.hint, { color: k.standbyTextMuted }]} numberOfLines={1}>
        Touch anywhere to continue
      </Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', padding: KIOSK_SPACE.xxl },
  corner: {
    position: 'absolute', top: KIOSK_SPACE.xxl, left: KIOSK_SPACE.xxl,
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
  },
  cornerText: { fontSize: KIOSK_TYPO.label, fontWeight: '900', letterSpacing: 2.4 },
  center: { alignItems: 'center', maxWidth: '100%' },
  clock: {
    fontSize: KIOSK_TYPO.clock, fontWeight: '200', letterSpacing: -3,
    fontVariant: ['tabular-nums'], lineHeight: KIOSK_TYPO.clock * 1.04,
  },
  date: { fontSize: KIOSK_TYPO.title, fontWeight: '400', marginTop: KIOSK_SPACE.xs },
  glass: {
    position: 'absolute', bottom: KIOSK_SPACE.xxl + 28,
    left: KIOSK_SPACE.xxl, right: KIOSK_SPACE.xxl,
    maxWidth: 760, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.lg,
    borderRadius: KIOSK_RADIUS.xl, borderWidth: 1, padding: KIOSK_SPACE.lg,
  },
  glassLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 1.6 },
  glassTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '700', marginTop: 3, letterSpacing: -0.3 },
  glassMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  glassCounts: { gap: KIOSK_SPACE.xs, alignItems: 'flex-end' },
  glassCount: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  glassCountText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  hint: {
    position: 'absolute', bottom: KIOSK_SPACE.xxl - 8,
    fontSize: KIOSK_TYPO.label, fontWeight: '600', letterSpacing: 0.6, opacity: 0.75,
  },
});
