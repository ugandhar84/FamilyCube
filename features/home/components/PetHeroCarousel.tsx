import React, { useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import LazyImage from '@/components/LazyImage';
import { lightenHex } from '@/lib/homeUtils';
import { toTitle } from '@/lib/format';
import { usePetStore } from '@/store/petStore';
import { MOOD_EMOJI, TYPO} from '@/constants/theme';
import { todayLocal } from '@/lib/dates';
import { computeCareProgress, careProgressColor } from '@/lib/careProgress';

const CARD_H = 224;
const RING_R = 20, RING_SZ = 48, RING_C2 = 2 * Math.PI * RING_R;
// Pet card avatar ring constants
const AV_SZ = 84, AV_R = 36, AV_C2 = 2 * Math.PI * AV_R;


function PetRing({ pet, pct, ac, colors, isDark }: { pet: any; pct: number; ac: string; colors: any; isDark: boolean }) {
  // Reactive — re-renders when moodLogs store updates
  const moodLogs = usePetStore(s => s.moodLogs);
  const today = todayLocal();
  const todayMood = (moodLogs[pet.id] ?? []).find((l: any) => l.date === today);
  const moodEmoji = todayMood ? (MOOD_EMOJI[todayMood.mood_label] ?? '😊') : null;
  const trackColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const progressColor = careProgressColor(pct);
  const badgeBg    = careProgressColor(pct);

  return (
    <View style={{ alignItems: 'center', gap: 5 }}>
      <View style={{ width: RING_SZ, height: RING_SZ }}>
        <Svg width={RING_SZ} height={RING_SZ} style={{ position: 'absolute' }}>
          <Circle cx={RING_SZ/2} cy={RING_SZ/2} r={RING_R} stroke={trackColor} strokeWidth={4} fill="none" />
          <Circle
            cx={RING_SZ/2} cy={RING_SZ/2} r={RING_R}
            stroke={progressColor} strokeWidth={4} fill="none"
            strokeDasharray={`${RING_C2}`}
            strokeDashoffset={RING_C2 * (1 - pct / 100)}
            strokeLinecap="round"
            rotation={-90} origin={`${RING_SZ/2},${RING_SZ/2}`}
          />
        </Svg>
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          {pet.avatar_url
            ? <Image source={{ uri: pet.avatar_url }} cachePolicy="memory-disk" style={{ width: 44, height: 44, borderRadius: 22 }} />
            : <Text style={{ fontSize: TYPO.title }}>{pet.emoji ?? '🐾'}</Text>
          }
        </View>
        <View style={{ position: 'absolute', bottom: -4, alignSelf: 'center', backgroundColor: badgeBg, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>{pct}%</Text>
        </View>
        {moodEmoji && (
          <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.95)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: TYPO.caption }}>{moodEmoji}</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }} numberOfLines={1}>{pet.name}</Text>
    </View>
  );
}

function PetCardWrapper({ cardW, onDoubleTap, children }: { cardW: number; onDoubleTap: () => void; children: React.ReactNode }) {
  const lastTap   = useRef(0);
  const navigating = useRef(false);
  return (
    <TouchableOpacity
      activeOpacity={0.97}
      style={{ width: cardW }}
      onPress={() => {
        const now = Date.now();
        if (now - lastTap.current < 350) {
          if (navigating.current) return;
          navigating.current = true;
          onDoubleTap();
          // reset after transition completes so back-navigation works normally
          setTimeout(() => { navigating.current = false; }, 1000);
        }
        lastTap.current = now;
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

interface PetHeroCarouselProps {
  sortedPets: any[];
  activePetId: string | null;
  setActivePet: (id: string) => void;
  clearActivePet: () => void;
  heroCardWidth: number;
  petHeroRef: React.RefObject<ScrollView | null>;
  swipeDidSetPet: React.MutableRefObject<boolean>;
  isDark: boolean;
  colors: any;
  daysWithPet: (id: string) => number;
  streaks: Record<string, number>;
  moodLogs: Record<string, any[]>;
  vetVisits: Record<string, any[]>;
  vaccines: Record<string, any[]>;
  totalLogs: number;
  dailyScores?: Record<string, number>;
  lostPetIds?: string[];
  nextApptByPet?: Record<string, { label: string; timeLabel: string; type: 'appointment' | 'medication' }>;
  goAddPet: () => void;
  onSummaryCardChange?: (isOnSummary: boolean) => void;
}

export const PetHeroCarousel = React.memo(function PetHeroCarousel({
  sortedPets, activePetId, setActivePet, clearActivePet,
  heroCardWidth, petHeroRef, swipeDidSetPet,
  isDark, colors,
  daysWithPet, streaks, moodLogs, vetVisits, vaccines,
  totalLogs, dailyScores = {}, lostPetIds = [], nextApptByPet = {}, goAddPet,
  onSummaryCardChange,
}: PetHeroCarouselProps) {
  const checklist = usePetStore(s => s.checklist);
  const feedingLogs = usePetStore(s => s.feedingLogs ?? {});
  const today = todayLocal();

  // Per-pet daily completion % — always computed from live store state so care actions
  // reflect instantly without waiting for a DB score refresh.
  const petCompletion = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of sortedPets) {
      out[p.id] = Math.round(computeCareProgress({ petId: p.id, today, species: p.species, checklist, feedingLogs, moodLogs }) * 100);
    }
    return out;
  }, [sortedPets, feedingLogs, checklist, moodLogs, today]);

  // Aggregate stats across all pets
  const totalStreak  = sortedPets.reduce((s, p) => s + (streaks[p.id] ?? 0), 0);
  const totalMoods   = sortedPets.reduce((s, p) => s + (moodLogs[p.id] ?? []).filter((l: any) => l.date === today).length, 0);
  const avgComplete  = sortedPets.length > 0
    ? Math.round(sortedPets.reduce((s, p) => s + (petCompletion[p.id] ?? 0), 0) / sortedPets.length)
    : 0;

  const cardW = heroCardWidth;
  // Summary card only shown when 2+ pets — single-pet users start on their pet card
  const showSummary = sortedPets.length >= 2;
  const totalCards = showSummary ? sortedPets.length + 1 : sortedPets.length;

  // Visual index tracks what's actually visible on screen — used only for dots.
  // activePetId stays set when on summary card so app state is preserved.
  const [visualIndex, setVisualIndex] = React.useState(() =>
    activePetId ? sortedPets.findIndex(p => p.id === activePetId) + (showSummary ? 1 : 0) : 0
  );

  const handleScroll = (x: number) => {
    const idx = Math.round(x / (cardW + 12));
    setVisualIndex(idx);
    if (showSummary && idx === 0) {
      swipeDidSetPet.current = true;
      onSummaryCardChange?.(true);
    } else {
      const petIdx = showSummary ? idx - 1 : idx;
      const pet = sortedPets[petIdx];
      if (pet && pet.id !== activePetId) {
        swipeDidSetPet.current = true;
        setActivePet(pet.id);
      }
      onSummaryCardChange?.(false);
    }
  };

  return (
    <View style={{ marginBottom: 4 }}>
      <ScrollView
        ref={petHeroRef}
        horizontal
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={cardW + 12}
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 16, paddingRight: 16, gap: 12, alignItems: 'flex-start' }}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => handleScroll(e.nativeEvent.contentOffset.x)}
        onScrollEndDrag={(e) => handleScroll(e.nativeEvent.contentOffset.x)}
      >

        {/* ── Card 0: Summary — only shown for 2+ pets ── */}
        {showSummary && <View style={{ width: cardW }}>
          <LinearGradient
            colors={isDark ? ['#0F172A', '#1E293B'] : ['#1E293B', '#0F172A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 20, padding: 16, height: CARD_H, justifyContent: 'space-between' }}
          >
            {/* Top row: label + avg completion arc */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1 }}>Daily Overview</Text>
                <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 50, height: 50 }}>
                  <Svg width={50} height={50} style={{ position: 'absolute' }}>
                    <Circle cx={25} cy={25} r={20} stroke="rgba(255,255,255,0.1)" strokeWidth={4} fill="none" />
                    <Circle cx={25} cy={25} r={20}
                      stroke={careProgressColor(avgComplete)}
                      strokeWidth={4} fill="none"
                      strokeDasharray={`${2 * Math.PI * 20}`}
                      strokeDashoffset={2 * Math.PI * 20 * (1 - avgComplete / 100)}
                      strokeLinecap="round" rotation={-90} origin="25,25"
                    />
                  </Svg>
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>{avgComplete}%</Text>
                  </View>
                </View>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>done</Text>
              </View>
            </View>

            {/* Pet rings row */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {sortedPets.slice(0, 5).map((p) => (
                <PetRing key={p.id} pet={p} pct={petCompletion[p.id] ?? 0} ac={p.accent_color ?? colors.primary} colors={colors} isDark={true} />
              ))}
            </View>

            {/* Bottom stats */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 11, padding: 10 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Logs</Text>
                <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: '#fff', marginTop: 3 }}>{totalLogs}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 11, padding: 10 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Streak</Text>
                <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: totalStreak > 0 ? '#FB923C' : 'rgba(255,255,255,0.45)', marginTop: 3 }}>
                  {totalStreak > 0 ? `🔥 ${totalStreak}` : '–'}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 11, padding: 10 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Moods</Text>
                <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: totalMoods > 0 ? '#A78BFA' : 'rgba(255,255,255,0.45)', marginTop: 3 }}>{totalMoods}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>}

        {/* ── Cards 1..N: Individual pet cards ── */}
        {sortedPets.map((p) => {
          const isActive = activePetId === p.id;
          const ac: string = p.accent_color ?? (p.species === 'cat' ? colors.primary : colors.accent);
          const avatarUrl: string | null = p.avatar_url ?? null;
          const petDays = daysWithPet(p.id);
          const petStreak = streaks[p.id] ?? 0;
          const pct = petCompletion[p.id] ?? 0;
          const grad1 = lightenHex(ac, 0.42);
          const grad2 = lightenHex(ac, 0.08);

          // Today's feeding
          const feeds = feedingLogs[`${p.id}:${today}`] ?? [];
          const mealFeeds = feeds.filter((f: any) => f.meal_type !== 'water');
          // Mood
          const todayMood = (moodLogs[p.id] ?? []).find((l: any) => l.date === today);
          const moodEmoji = todayMood ? (MOOD_EMOJI[todayMood.mood_label] ?? '😊') : null;

          // Age string
          const ageYrs = p.birthday
            ? Math.max(0, Math.floor((Date.now() - new Date(p.birthday).getTime()) / (365.25 * 86400000)))
            : null;
          const ageMos = p.birthday && ageYrs === 0
            ? Math.max(0, Math.floor((Date.now() - new Date(p.birthday).getTime()) / (30.44 * 86400000)))
            : null;
          const ageStr = ageYrs != null
            ? ageMos != null ? `${ageMos}mo` : `${ageYrs}yr`
            : null;

          const infoLine = [
            p.breed ? toTitle(p.breed) : toTitle(p.species ?? ''),
            ageStr,
            p.gender ? (p.gender === 'male' ? '♂' : p.gender === 'female' ? '♀' : null) : null,
          ].filter(Boolean).join(' · ');

          // Progress ring dash
          const ringDash = AV_C2 * (1 - pct / 100);

          // Lost status
          const isLost = lostPetIds.includes(p.id);

          return (
            <PetCardWrapper key={p.id} cardW={cardW} onDoubleTap={() => { setActivePet(p.id); router.push(`/pet/${p.id}` as any); }}>
              <LinearGradient
                colors={[grad1, grad2]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 20, padding: 14,
                  height: CARD_H, justifyContent: 'space-between',
                  borderWidth: isLost ? 2 : isActive ? 2 : 1,
                  borderColor: isLost ? '#EF4444' : isActive ? ac : ac + '50',
                }}
              >
                {/* ── Top: avatar ring + name/info ── */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  {/* Avatar with progress ring — dark plate ensures ring always visible */}
                  <View style={{ width: AV_SZ, height: AV_SZ }}>
                    {/* Dark disc so ring has guaranteed contrast vs any card gradient */}
                    <View style={{
                      position: 'absolute', inset: 0,
                      borderRadius: AV_SZ / 2,
                      backgroundColor: 'rgba(0,0,0,0.28)',
                    }} />
                    <Svg width={AV_SZ} height={AV_SZ} style={{ position: 'absolute' }}>
                      {/* Track */}
                      <Circle cx={AV_SZ/2} cy={AV_SZ/2} r={AV_R}
                        stroke="rgba(0,0,0,0.35)" strokeWidth={5} fill="none" />
                      {/* Progress */}
                      <Circle cx={AV_SZ/2} cy={AV_SZ/2} r={AV_R}
                        stroke={careProgressColor(pct)}
                        strokeWidth={5} fill="none"
                        strokeDasharray={`${AV_C2}`}
                        strokeDashoffset={ringDash}
                        strokeLinecap="round"
                        rotation={-90} origin={`${AV_SZ/2},${AV_SZ/2}`}
                      />
                    </Svg>
                    {/* Avatar image */}
                    <View style={{
                      position: 'absolute', inset: 0,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {avatarUrl
                        ? <LazyImage uri={avatarUrl} style={{ width: 70, height: 70, borderRadius: 35 }} />
                        : <Text style={{ fontSize: 36 }}>{p.emoji ?? '🐾'}</Text>
                      }
                    </View>
                    {/* Completion % badge — bottom centre */}
                    <View style={{
                      position: 'absolute', bottom: -4, alignSelf: 'center',
                      backgroundColor: careProgressColor(pct),
                      borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
                    }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>{pct}%</Text>
                    </View>
                    {/* Mood badge — top right */}
                    {moodEmoji && (
                      <View style={{
                        position: 'absolute', top: -2, right: -2,
                        backgroundColor: 'rgba(255,255,255,0.95)',
                        borderRadius: 11, width: 22, height: 22,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                      }}>
                        <Text style={{ fontSize: TYPO.caption }}>{moodEmoji}</Text>
                      </View>
                    )}
                  </View>

                  {/* Name + info */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: '#fff', letterSpacing: -0.5, flex: 1 }} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {isLost && (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => { setActivePet(p.id); router.push('/(tabs)/sos' as any); }}
                          style={{ backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                        >
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>LOST</Text>
                          <Ionicons name="chevron-forward" size={12} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </View>
                    {infoLine ? (
                      <Text style={{ fontSize: TYPO.body, color: 'rgba(255,255,255,0.75)', fontWeight: '500' }} numberOfLines={1}>
                        {infoLine}
                      </Text>
                    ) : null}
                    {petStreak >= 1 && (
                      <View style={{
                        alignSelf: 'flex-start', marginTop: 2,
                        backgroundColor: 'rgba(0,0,0,0.25)',
                        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                      }}>
                        <Text style={{ fontSize: TYPO.caption }}>🔥</Text>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
                          {petStreak} day streak
                        </Text>
                      </View>
                    )}
                    <Text style={{ fontSize: TYPO.caption, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                      {petDays === 1 ? '1 day together' : petDays >= 1000 ? `${(petDays / 1000).toFixed(1)}k days together` : `${petDays} days together`}
                    </Text>
                  </View>
                </View>

                {/* ── Bottom: last meal · next appt · streak ── */}
                {(() => {
                  // Last meal — formatted as "Jan 25 · 2:30 PM" or "Today · 2:30 PM"
                  const lastFeedItem = mealFeeds.sort((a: any, b: any) =>
                    new Date(b.fed_at ?? b.created_at ?? 0).getTime() -
                    new Date(a.fed_at ?? a.created_at ?? 0).getTime()
                  )[0];
                  const lastMealStr = lastFeedItem ? (() => {
                    const d = new Date(lastFeedItem.fed_at ?? lastFeedItem.created_at);
                    const isToday = d.toDateString() === new Date().toDateString();
                    const datePart = isToday
                      ? 'Today'
                      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    return `${datePart}\n${timePart}`;
                  })() : null;

                  // Next appointment / medication
                  const appt = nextApptByPet[p.id];
                  const apptIcon = appt?.type === 'medication' ? '💊' : '📅';
                  const apptLine1 = appt ? appt.label : 'Nothing';
                  const apptLine2 = appt ? appt.timeLabel : 'upcoming';

                  const statSep = { width: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 4 };

                  return (
                    <View style={{
                      flexDirection: 'row',
                      backgroundColor: 'rgba(0,0,0,0.22)',
                      borderRadius: 12, paddingVertical: 8, paddingHorizontal: 4,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                    }}>
                      {/* Last meal */}
                      <View style={{ flex: 3, alignItems: 'center', gap: 2 }}>
                        <Text style={{ fontSize: TYPO.body }}>🍽</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: lastMealStr ? '#fff' : 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 14 }} numberOfLines={2}>
                          {lastMealStr ?? 'No meals\nlogged'}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '600', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 }}>LAST MEAL</Text>
                      </View>
                      <View style={statSep} />
                      {/* Next appt */}
                      <View style={{ flex: 3, alignItems: 'center', gap: 2 }}>
                        <Text style={{ fontSize: TYPO.body }}>{apptIcon}</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: appt ? '#fff' : 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 14 }} numberOfLines={1}>
                          {apptLine1}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, color: appt ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.3)', textAlign: 'center' }} numberOfLines={1}>
                          {apptLine2}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '600', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 }}>UPCOMING</Text>
                      </View>
                      <View style={statSep} />
                      {/* Streak */}
                      <View style={{ flex: 2, alignItems: 'center', gap: 2 }}>
                        <Text style={{ fontSize: TYPO.body }}>🔥</Text>
                        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: petStreak > 0 ? '#FB923C' : 'rgba(255,255,255,0.45)', lineHeight: 22 }}>
                          {petStreak > 0 ? petStreak : '–'}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '600', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.3 }}>STREAK</Text>
                      </View>
                    </View>
                  );
                })()}
              </LinearGradient>
            </PetCardWrapper>
          );
        })}

        {/* Add baby card */}
        <TouchableOpacity
          onPress={() => goAddPet()}
          activeOpacity={0.8}
          style={{
            width: cardW * 0.45,
            height: CARD_H,
            borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed',
            borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
            alignItems: 'center', justifyContent: 'center',
            gap: 8,
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}
        >
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="add-outline" size={15} color={colors.textTertiary} />
          </View>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textSecondary }}>Add baby</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Dots below — index 0 = summary, 1..N = pets */}
      {totalCards > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 8 }}>
          {/* Summary dot */}
          <View style={{
            height: 5,
            width: visualIndex === 0 ? 18 : 5,
            borderRadius: 3,
            backgroundColor: visualIndex === 0
              ? colors.primary
              : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'),
          }} />
          {/* Per-pet dots */}
          {sortedPets.map((p, i) => (
            <View key={p.id} style={{
              height: 5,
              width: visualIndex === i + 1 ? 18 : 5,
              borderRadius: 3,
              backgroundColor: visualIndex === i + 1
                ? (p.accent_color ?? colors.primary)
                : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'),
            }} />
          ))}
        </View>
      )}
    </View>
  );
});
