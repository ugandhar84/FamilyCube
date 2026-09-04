import { useRef, useState, useEffect } from 'react';
import { registerForPushNotifications } from '@/shared/services/notifications.service';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import {
  IlloWelcome, IlloHealth, IlloReminders, IlloAIHealth,
  IlloSocial, IlloAI, IlloGetStarted, IlloPlaydates,
} from '@/features/onboarding/components/OnboardingIllos';
import { TYPO } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

// ─── Slide data — one per real Family Cube feature (see the 7-tab layout in
// CLAUDE.md), illustrated with our own SVG scenes (OnboardingIllos.tsx)
// instead of stock photography. Built from useTheme() inside the component
// below (not a module-level const) so each slide's accent maps to the
// actual current brand token for its feature — primary for Welcome/Ask
// Cube/Get Started, amber for Quests/Store (ORGANIZE), teal for GPS
// (CONNECT), pink/accent for Chat/Care — instead of fixed hex literals.
function buildSlides(colors: any) {
  return [
    {
      key: 'welcome',
      illustration: IlloWelcome,
      gradientColors: [colors.primary, colors.primaryLight] as [string, string],
      chip: 'CONNECT · ORGANIZE · CARE · GROW',
      title: 'One family.\nOne cube.',
      sub: 'Everyone in your household — parents, kids, teens, grandparents — in one place, sharing one home base.',
      btnColor: colors.primary,
      btnLabel: "Let's go",
    },
    {
      key: 'quests',
      illustration: IlloHealth,
      gradientColors: [colors.amber, colors.amberLight] as [string, string],
      chip: 'Chores',
      title: 'Chores become\nworth doing.',
      sub: 'Assign, claim, and approve chores together. Every completed chore earns real coins toward real rewards.',
      btnColor: colors.amber,
      btnLabel: 'Next',
    },
    {
      key: 'schedule',
      illustration: IlloReminders,
      gradientColors: [colors.teal, colors.tealLight] as [string, string],
      chip: 'Schedule',
      title: 'Never miss\nwhat matters.',
      sub: 'One shared calendar for practices, pickups, and appointments — everyone sees the same day.',
      btnColor: colors.teal,
      btnLabel: 'Next',
    },
    {
      key: 'chat',
      illustration: IlloAIHealth,
      gradientColors: [colors.pink, colors.pinkLight] as [string, string],
      chip: 'Chat',
      title: 'Talk like\na family again.',
      sub: 'A group chat just for your household — reactions, photos, and no strangers scrolling past.',
      btnColor: colors.pink,
      btnLabel: 'Next',
    },
    {
      key: 'gps',
      illustration: IlloSocial,
      gradientColors: [colors.teal, colors.tealLight] as [string, string],
      chip: 'GPS',
      title: 'Know they\nmade it home.',
      sub: 'See where everyone is on one family map — peace of mind without checking in every ten minutes.',
      btnColor: colors.teal,
      btnLabel: 'Next',
    },
    {
      key: 'store',
      illustration: IlloPlaydates,
      gradientColors: [colors.amberLight, colors.amber] as [string, string],
      chip: 'Store',
      title: 'Coins earned.\nRewards claimed.',
      sub: 'Kids cash in quest coins for real rewards parents set — screen time, treats, or something bigger.',
      btnColor: colors.amber,
      btnLabel: 'Next',
    },
    {
      key: 'askcube',
      illustration: IlloAI,
      gradientColors: [colors.primary, colors.accent] as [string, string],
      chip: 'Ask Fam',
      title: 'Your family\'s\nsmart assistant.',
      sub: 'Ask Fam helps schedule events, assign chores, and answer "what\'s happening today?" in seconds.',
      btnColor: colors.primary,
      btnLabel: 'Next',
    },
    {
      key: 'getstarted',
      illustration: IlloGetStarted,
      gradientColors: [colors.primary, colors.pink] as [string, string],
      chip: 'Ready when you are',
      title: 'Let\'s build your\nfamily cube.',
      sub: '30 seconds to create your family or join one — then everyone\'s in the same place.',
      btnColor: colors.primary,
      btnLabel: 'Begin',
    },
  ];
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme();
  const SLIDES = buildSlides(colors);
  const [index, setIndex] = useState(0);
  const illoScrollRef  = useRef<ScrollView>(null);
  const cardScrollRef  = useRef<ScrollView>(null);
  // Terms are now accepted via the checkbox on the signup screen itself —
  // the dedicated full-screen Terms wall this used to route to
  // unconditionally is a fallback now, not the default path. Most users
  // reaching this tour already have terms_accepted=true and should go
  // straight to family setup; /onboarding/terms stays reachable for any
  // path that didn't go through the checkbox (e.g. an existing account
  // from before this change, or an OAuth signup not yet wired to it).
  const afterTour = () => {
    const accepted = useAuthStore.getState().profile?.terms_accepted;
    router.replace(accepted ? '/onboarding/family-choice' : '/onboarding/terms');
  };

  const goTo = (i: number) => {
    setIndex(i);
    illoScrollRef.current?.scrollTo({ x: i * width, animated: true });
    cardScrollRef.current?.scrollTo({ x: i * width, animated: true });
  };

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      // On the second-to-last slide (before the final CTA), silently request
      // notification permission so the OS prompt appears at peak engagement.
      if (index === SLIDES.length - 2) {
        registerForPushNotifications().catch(() => {});
      }
      goTo(index + 1);
    } else {
      afterTour();
    }
  };

  const handleBack = () => { if (index > 0) goTo(index - 1); };

  const slide = SLIDES[index];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Full-bleed illustration scenes — each fills the whole screen ── */}
      <ScrollView
        ref={illoScrollRef}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) {
            setIndex(i);
            cardScrollRef.current?.scrollTo({ x: i * width, animated: true });
          }
        }}
        style={StyleSheet.absoluteFillObject}
        scrollEnabled
      >
        {SLIDES.map((sl) => {
          const Illo = sl.illustration;
          return (
            <View key={sl.key} style={{ width, height }}>
              <LinearGradient colors={sl.gradientColors} style={StyleSheet.absoluteFillObject}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                  <Illo isDark={false} />
                </View>
              </LinearGradient>
              {/* Gradient: starts at bottom of illustration zone, fades down to text area */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.92)']}
                locations={[0, 0.35, 0.68, 1]}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.52 }}
                pointerEvents="none"
              />
            </View>
          );
        })}
      </ScrollView>

      {/* ── Skip / Back top bar ── */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View style={s.topBar}>
          <TouchableOpacity
            onPress={handleBack}
            style={[s.floatBtn, { opacity: index === 0 ? 0 : 1 }]}
            disabled={index === 0}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {index < SLIDES.length - 1 && (
            <TouchableOpacity onPress={afterTour} style={s.floatBtn}>
              <Text style={s.skipTxt}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* ── Text + CTA overlay — floats over image at the bottom ── */}
      <SafeAreaView edges={['bottom']} style={s.overlay} pointerEvents="box-none">

        {/* Dots */}
        <View style={s.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goTo(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <View style={[
                s.dot,
                i === index
                  ? { width: 28, backgroundColor: slide.btnColor }
                  : { width: 8, backgroundColor: 'rgba(255,255,255,0.35)' },
              ]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Swipeable copy */}
        <ScrollView
          ref={cardScrollRef}
          horizontal pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          scrollEnabled={false}
          style={{ width }}
        >
          {SLIDES.map((sl) => (
            <View key={sl.key} style={s.copyPanel}>
              {/* Pill chip */}
              <View style={[s.chip, { backgroundColor: sl.btnColor + 'CC' }]}>
                <Text style={s.chipTxt}>{sl.chip}</Text>
              </View>
              {/* Title — always white over dark gradient */}
              <Text style={s.title}>{sl.title}</Text>
              {/* Subtitle */}
              <Text style={s.sub}>{sl.sub}</Text>
            </View>
          ))}
        </ScrollView>

        {/* CTA row */}
        <View style={s.ctaRow}>
          <TouchableOpacity
            onPress={handleBack}
            style={[s.backCircle, { opacity: index === 0 ? 0 : 1 }]}
            disabled={index === 0}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, { backgroundColor: slide.btnColor }]}
            onPress={handleNext}
            activeOpacity={0.85}>
            <Text style={s.btnTxt}>{slide.btnLabel}</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#000' },
  topBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  floatBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.30)', alignItems: 'center', justifyContent: 'center' },
  skipTxt:    { fontSize: TYPO.body, fontWeight: '600', color: '#fff' },

  // Entire overlay floats at bottom over the image — no solid card
  overlay:    { position: 'absolute', bottom: 0, left: 0, right: 0 },

  dots:       { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingBottom: 14 },
  dot:        { height: 7, borderRadius: 3.5 } as any,

  copyPanel:  { width, paddingHorizontal: 28, gap: 10 },
  chip:       { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 2 },
  chipTxt:    { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.4, color: '#fff' },
  title:      { fontSize: TYPO.hero, fontWeight: '900', lineHeight: 38, letterSpacing: -0.8, color: '#fff',
                textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  sub:        { fontSize: TYPO.body, lineHeight: 23, fontWeight: '400', color: 'rgba(255,255,255,0.82)' },

  ctaRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 8 },
  backCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.18)' },
  btn:        { flex: 1, paddingVertical: 17, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  btnTxt:     { color: '#fff', fontSize: TYPO.subheading, fontWeight: '800', letterSpacing: 0.2 },
});
