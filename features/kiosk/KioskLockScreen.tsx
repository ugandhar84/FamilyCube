/**
 * KioskLockScreen — shown after idle timeout or a manual lock. Live-flagged
 * gap this closes: the previous version was an ambient clock that unlocked
 * on any tap, straight back into whichever profile was last active — so
 * "locking" the kiosk didn't actually hide anyone's Hub, chores, or chat
 * from a passerby; it just dimmed to a clock for a moment. A real lock has
 * to require picking (and, where set, authenticating as) a profile before
 * revealing ANY member's Hub — this now mirrors the phone app's own
 * full-screen ProfilePickerScreen: a grid of every family member, tap to
 * select, PIN required only for members who have one set
 * (`pinEnabled && pin`, the same rule the phone app and KioskHeader's own
 * switcher use), via the same PinEntryModal.
 *
 * The clock stays as a small ambient strip above the grid — still useful
 * for the "wall-mounted tablet" glance-at-a-distance case — but is no
 * longer the whole screen, and no longer what unlocks it.
 *
 * Rendered inside its own native Modal, not a plain absolutely-positioned
 * View — the composer/editor sheets (KioskQuestComposer, KioskEventEditor,
 * etc.) and AskCubeChat all present via a real Modal too, which always
 * sits in its own native layer ABOVE ordinary views regardless of z-index.
 * A plain View here would render invisibly behind whichever of those
 * happened to still be open when the idle timer fired, leaving someone's
 * private chore edit or AI conversation visible through/under "locked."
 * Modal presentation order is last-in-on-top, so mounting this one fresh
 * exactly when `locked` flips true guarantees it wins regardless of what
 * else was already open.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from './kioskTheme';
import { useKioskColors } from './kioskPalette';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { useKioskWeather } from './useKioskWeather';
import { KioskPhotoFrame } from './components/KioskPhotoFrame';
import { useKioskPhotos } from './useKioskPhotos';
import { useKioskMeals, todayMealDay } from './useKioskMeals';

export function KioskLockScreen({ familyName, members, onUnlock, colors, nextUp }: {
  familyName: string;
  /** The day's next event, shown under the clock. */
  nextUp?: { time?: string; title: string; who?: string };
  members: FamilyMember[];
  /** Called once a profile has been selected (and PIN-verified, if it has
   * one) — the caller is responsible for setActiveMember + actually
   * dropping the lock. */
  onUnlock: (memberId: string) => void;
  colors: any;
}) {
  const { k } = useKioskColors();
  const { isDark } = useTheme();
  const canvas = k.bg;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const ink = isDark ? colors.textPrimary : GEMINI.titleColor;
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const weather = useKioskWeather();
  // The lock screen opens as the gold photo frame; a touch reveals the real lock (unchanged below), and it
  // returns to the frame after a minute without a touch. With no memory photos it is just the lock.
  const { photos } = useKioskPhotos();
  const [showFrame, setShowFrame] = useState(true);
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armFrame = () => {
    if (frameTimer.current) clearTimeout(frameTimer.current);
    frameTimer.current = setTimeout(() => setShowFrame(true), 60_000);
  };
  useEffect(() => () => { if (frameTimer.current) clearTimeout(frameTimer.current); }, []);
  const framed = showFrame && photos.length > 0;
  const { meals } = useKioskMeals();
  const [now, setNow] = useState(new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const visibleMembers = members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending');
  const selected = visibleMembers.find(m => m.id === selectedId) ?? null;
  const needsPin = !!selected?.pinEnabled && !!selected?.pin;

  // Next shared meal — only meal title/time, same data the Hub already
  // shows; nothing private is revealed on the locked display.
  const nextMeal = useMemo(() => {
    const today = meals.filter(m => m.day === todayMealDay());
    return today.find(m => /dinner/i.test(m.type)) ?? today[0] ?? null;
  }, [meals]);

  const confirm = () => {
    if (!selected) return;
    if (needsPin) setPinTarget(selected);
    else onUnlock(selected.id);
  };

  const leftCol = (
    <View style={[s.left, !wide && s.leftNarrow]}>
      <Text style={[s.brand, { color: ink }]} numberOfLines={1}>
        Welcome to {familyName}
      </Text>
      <Text
        style={[s.clock, { color: ink }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityRole="header"
      >
        {clock}
      </Text>
      <Text style={[s.date, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {date}
      </Text>
      {weather && (
        <Text style={[s.weather, { color: body }]}>
          {Math.round(weather.temperature)}{weather.unit} · {weather.condition}
        </Text>
      )}
      {nextUp && (
        <View style={[s.mealCard, cardShadow, { backgroundColor: cardBg, borderColor: isDark ? colors.border : GEMINI.border }]}>
          <Text style={[s.mealEyebrow, { color: colors.textTertiary }]}>NEXT EVENT{nextUp.time ? ` · ${nextUp.time.toUpperCase()}` : ''}</Text>
          <Text style={[s.mealTitle, { color: ink }]} numberOfLines={2}>{nextUp.title}{nextUp.who ? ` · ${nextUp.who}` : ''}</Text>
        </View>
      )}
      {nextMeal && (
        <View style={[s.mealCard, cardShadow, { backgroundColor: cardBg, borderColor: isDark ? colors.border : GEMINI.border }]}>
          <Text style={[s.mealEyebrow, { color: colors.textTertiary }]}>NEXT SHARED MEAL</Text>
          <Text style={[s.mealTitle, { color: ink }]} numberOfLines={2}>
            {nextMeal.title}{nextMeal.start_time ? ` · ${nextMeal.start_time}` : ''}
          </Text>
        </View>
      )}
      <Text style={[s.fine, { color: colors.textTertiary }]}>
        Agenda, household presence and messages are hidden while the display is locked.
      </Text>
    </View>
  );

  const rightCol = (
    <View style={[s.card, cardShadow, { backgroundColor: cardBg, borderColor: isDark ? colors.border : GEMINI.border }]}>
      <Lock size={22} color={k.primary} />
      <Text style={[s.cardTitle, { color: ink }]}>Hello again. Who's here?</Text>
      <Text style={[s.cardBody, { color: body }]}>
        Choose your name, then confirm{`\u00A0`}with your personal PIN if you have one.
      </Text>

      <ScrollView horizontal={false} style={s.chipScroll} contentContainerStyle={s.chips} showsVerticalScrollIndicator={false}>
        {visibleMembers.map(m => {
          const firstName = m.name?.trim().split(' ')[0] || 'Family member';
          const active = m.id === selectedId;
          return (
            <Pressable
              key={m.id}
              onPress={() => setSelectedId(m.id)}
              style={s.chip}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={firstName}
            >
              <View style={[s.initial, { backgroundColor: active ? k.primary : k.well, borderColor: active ? k.primary : k.cardBorder }]}>
                <Text style={[s.initialText, { color: active ? k.onPrimary : k.text }]}>
                  {(firstName[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <Text style={[s.chipName, { color: active ? k.primary : colors.textPrimary }]} numberOfLines={1}>
                {firstName}
              </Text>
            </Pressable>
          );
        })}
        {visibleMembers.length === 0 && (
          <Text style={[s.emptyState, { color: colors.textTertiary }]}>
            No family profiles are set up yet. Add one from the Family Cube app on a phone.
          </Text>
        )}
      </ScrollView>

      <Pressable
        onPress={confirm}
        disabled={!selected}
        style={[s.primaryBtn, { backgroundColor: k.primary, opacity: selected ? 1 : 0.4 }]}
        accessibilityRole="button"
      >
        <Text style={s.primaryBtnText}>
          {!selected ? 'Choose your name' : needsPin ? 'Enter personal PIN' : `Unlock as ${selected.name?.trim().split(' ')[0]}`}
        </Text>
      </Pressable>
      {selected && needsPin && (
        <Pressable
          onPress={() => setPinTarget(selected)}
          style={[s.secondaryBtn, { borderColor: k.cardBorderStrong }]}
          accessibilityRole="button"
        >
          <Text style={[s.secondaryBtnText, { color: k.text }]}>Use personal PIN instead</Text>
        </Pressable>
      )}
      <Text style={[s.fine, { color: colors.textTertiary, marginTop: KIOSK_SPACE.sm }]}>
        Auto-locked after 2 minutes. Health, private records and precise location stay on trusted personal devices.
      </Text>
    </View>
  );

  return (
    <Modal supportedOrientations={['portrait', 'landscape']} visible transparent={false} animationType="fade">
      <View style={[s.root, { backgroundColor: canvas }]} onTouchStart={armFrame}>
        <SafeAreaView style={s.safe}>
          <ScrollView contentContainerStyle={[s.content, wide && s.contentWide]} showsVerticalScrollIndicator={false}>
            {leftCol}
            {rightCol}
          </ScrollView>
        </SafeAreaView>
      </View>

      {framed && <KioskPhotoFrame familyName={familyName} nextLine={nextUp ? `Next · ${nextUp.time ? `${nextUp.time} ` : ''}${nextUp.title}` : undefined} onPress={() => { setShowFrame(false); armFrame(); }} />}

      <PinEntryModal
        inline
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={(member) => { onUnlock(member.id); setPinTarget(null); }}
        onCancel={() => setPinTarget(null)}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flexGrow: 1, padding: KIOSK_SPACE.xl, gap: KIOSK_SPACE.xl, justifyContent: 'center' },
  contentWide: { flexDirection: 'row', alignItems: 'center' },
  left: { flex: 1.1, gap: KIOSK_SPACE.sm },
  leftNarrow: { flex: 0 },
  brand: { fontSize: KIOSK_TYPO.subheading, fontWeight: '700' },
  clock: {
    fontSize: KIOSK_TYPO.clock, fontWeight: '800', letterSpacing: -2,
    fontVariant: ['tabular-nums'], lineHeight: KIOSK_TYPO.clock * 1.1, marginTop: KIOSK_SPACE.md,
  },
  date: { fontSize: KIOSK_TYPO.heading, fontWeight: '700' },
  weather: { fontSize: KIOSK_TYPO.body, fontWeight: '600' },
  mealCard: {
    marginTop: KIOSK_SPACE.md, padding: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.md,
    borderWidth: 1, gap: 4,
  },
  mealEyebrow: { fontSize: KIOSK_TYPO.label, fontWeight: '800', letterSpacing: 0.6 },
  mealTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '700' },
  fine: { fontSize: KIOSK_TYPO.label, lineHeight: 18, marginTop: KIOSK_SPACE.md },
  card: {
    flex: 1, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1, padding: KIOSK_SPACE.lg,
    gap: KIOSK_SPACE.sm, maxWidth: 560, width: '100%', alignSelf: 'center',
  },
  cardTitle: { fontSize: KIOSK_TYPO.title, fontWeight: '800' },
  cardBody: { fontSize: KIOSK_TYPO.body, lineHeight: 22 },
  chipScroll: { maxHeight: 240, flexGrow: 0, marginVertical: KIOSK_SPACE.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  chip: { alignItems: 'center', gap: 6, width: 84 },
  initial: { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  chipName: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', textAlign: 'center' },
  primaryBtn: {
    minHeight: 52, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: KIOSK_SPACE.lg,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  secondaryBtn: { minHeight: 52, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  emptyState: { fontSize: KIOSK_TYPO.body, fontWeight: '600', paddingVertical: KIOSK_SPACE.md },
});
