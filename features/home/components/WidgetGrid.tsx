import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '@/components/AppAlert';
import { TogethernessBadge } from '@/components/home/BondAnimations';
import { MOOD_EMOJI, MOOD_COLOR, TYPO} from '@/constants/theme';
import { LIMITS } from '@/lib/subscription';
import { toTitle } from '@/lib/format';

// ── MoodTile — in global mode cycles pets that have a mood today (from DB) ──────
function MoodTile({ isGlobal, sortedPets, pet, mood, isLost, scanMaxed,
  todayPhotoScanCount, tier, ac, moodColor, moodEmoji, scanPulse, moodEmojiScale,
  colors, s, onOpenScan, globalPetMoods = [] }: any) {

  // Only cycle through pets that actually have a mood today
  const moodsWithData = isGlobal
    ? (globalPetMoods as any[])
    : [];

  const [moodPetIdx, setMoodPetIdx] = useState(0);
  const fadeNext = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isGlobal || moodsWithData.length <= 1) return;
    const t = setInterval(() => {
      Animated.timing(fadeNext, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setMoodPetIdx(i => (i + 1) % moodsWithData.length);
        fadeNext.setValue(1);
      });
    }, 3000);
    return () => clearInterval(t);
  }, [isGlobal, moodsWithData.length]);

  const displayMood = isGlobal
    ? (moodsWithData[moodPetIdx] ?? null)
    : mood;
  const displayPetName = isGlobal
    ? (displayMood?.pet_name ?? null)
    : pet?.name ?? null;
  const displayEmoji = displayMood ? (MOOD_EMOJI[displayMood.mood_label] ?? '😊') : null;
  const displayColor = displayMood ? (MOOD_COLOR[displayMood.mood_label] ?? ac) : colors.textTertiary;
  const hasPhoto = !isLost && !!displayMood?.photo_url;

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={isLost
          ? () => showAlert('Pet is lost', `Find ${pet?.name} first before scanning mood.`, [{ text: 'OK' }])
          : onOpenScan}
        disabled={scanMaxed && !isLost}
        style={[s.widgetTile, { flex: 1, backgroundColor: colors.card, borderColor: isLost ? '#E74C3C40' : displayColor + '40' }]}
      >
        {hasPhoto && (
          <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, overflow: 'hidden', opacity: isGlobal ? fadeNext : 1 }}>
            <Image source={{ uri: displayMood.photo_url }} cachePolicy="memory-disk" style={{ width: '100%', height: '100%' }} contentFit="cover" />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000055' }} />
          </Animated.View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[s.widgetLabel, { color: hasPhoto ? '#FFFFFFCC' : (isLost ? '#E74C3C' : displayColor) }]}>MOOD</Text>
            {isGlobal && displayPetName && (
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: hasPhoto ? '#FFFFFFAA' : displayColor, opacity: 0.8 }}>{displayPetName}</Text>
            )}
          </View>
          <Animated.View style={[
            s.widgetScanBadge,
            { backgroundColor: isLost ? '#E74C3C18' : (scanMaxed ? colors.border : ac + '18') },
            (!isLost && !scanMaxed) ? { transform: [{ scale: scanPulse }] } : undefined,
          ]}>
            <Ionicons name="camera-outline" size={16} color={isLost ? '#E74C3C' : (scanMaxed ? colors.textTertiary : ac)} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: isLost ? '#E74C3C' : (scanMaxed ? colors.textTertiary : ac) }}>
              {isLost ? 'Lost' : (scanMaxed ? 'Max' : `${todayPhotoScanCount}/${LIMITS[tier as keyof typeof LIMITS].moodScansPerDay}`)}
            </Text>
          </Animated.View>
        </View>
        {(isLost || displayEmoji || (!isGlobal && !displayMood)) && (
          <Animated.Text style={{ fontSize: TYPO.hero, marginTop: 6, marginBottom: 2, transform: [{ scale: moodEmojiScale }] }}>
            {isLost ? '🔴' : (displayEmoji ?? '📷')}
          </Animated.Text>
        )}
        {(isLost || displayMood || (!isGlobal && !displayMood)) && (
          <Text style={[s.widgetMoodLabel, { color: hasPhoto ? '#FFFFFF' : (isLost ? '#E74C3C' : (displayMood ? colors.textPrimary : colors.textTertiary)) }]} numberOfLines={1}>
            {isLost ? 'Find first' : (displayMood ? toTitle(displayMood.mood_label) : 'Tap to scan')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

interface NextVet { label: string; timeLabel: string; daysUntil: number }
interface LastVet  { label: string; daysAgo: number }

interface WidgetGridProps {
  pet: any;
  activePetId: string | null;
  ac: string;
  days: number;
  bondDisplay: number;
  streak: number;
  petAvatarUrl: string | null;
  profile: any;
  mood: any;
  todayPhotoScanCount: number;
  tier: string;
  scanPulse: Animated.Value;
  moodEmojiScale: Animated.Value;
  activeLostAlert: any;
  nextVet: NextVet | null;
  lastVet: LastVet | null;
  colors: any;
  s: any;
  onOpenScan: () => void;
  onOpenVetSheet: () => void;
  onSummaryAction: (route: string) => void;
  // global mode
  isGlobal?: boolean;
  sortedPets?: any[];
  daysWithPet?: (id: string) => number;
  streaks?: Record<string, number>;
  globalPetMoods?: any[];
}

export const WidgetGrid = React.memo(function WidgetGrid({
  pet, activePetId, ac,
  days, bondDisplay, streak,
  petAvatarUrl, profile, mood,
  todayPhotoScanCount, tier,
  scanPulse, moodEmojiScale,
  activeLostAlert,
  nextVet, lastVet,
  colors, s,
  onOpenScan, onOpenVetSheet, onSummaryAction,
  isGlobal, sortedPets = [], daysWithPet, streaks = {},
  globalPetMoods = [],
}: WidgetGridProps) {
  const isLost   = !!activeLostAlert;
  const scanMaxed = todayPhotoScanCount >= LIMITS[tier as keyof typeof LIMITS].moodScansPerDay;
  const moodColor = mood ? (MOOD_COLOR[mood.mood_label] ?? ac) : colors.textTertiary;
  const moodEmoji = mood ? (MOOD_EMOJI[mood.mood_label] ?? '😊') : '📷';

  // Global bond carousel — 20 s per pet, soft crossfade in/out
  const [bondPetIdx, setBondPetIdx] = useState(0);
  const bondFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isGlobal || sortedPets.length <= 1) return;
    const t = setInterval(() => {
      Animated.timing(bondFade, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
        setBondPetIdx(i => (i + 1) % sortedPets.length);
        Animated.timing(bondFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      });
    }, 20000);
    return () => clearInterval(t);
  }, [isGlobal, sortedPets.length]);

  const bondPet   = isGlobal && sortedPets.length > 0 ? sortedPets[bondPetIdx] : pet;
  const bondAc    = (bondPet?.accent_color ?? ac) as string;
  const bondDays  = isGlobal && daysWithPet ? daysWithPet(bondPet?.id ?? '') : days;
  const bondStreak = isGlobal ? (streaks[bondPet?.id ?? ''] ?? 0) : streak;
  const bondAvatar = bondPet?.avatar_url ?? null;

  return (
    <View style={s.widgetGrid}>
      {/* ── Left: Bond tile (tall) ── */}
      <View style={s.widgetColLeft}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => isGlobal ? onSummaryAction('/pet') : router.push(`/pet/${bondPet?.id ?? activePetId}` as any)}
          style={[s.widgetTileTall, { backgroundColor: colors.card, borderColor: bondAc + '40' }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Text style={[s.widgetLabel, { color: bondAc }]}>BOND</Text>
            {isGlobal && bondPet?.name && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: bondAc, opacity: 0.7 }} numberOfLines={1}>
                  {bondPet.name}
                </Text>
                {bondStreak >= 1 && (
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.warning, marginTop: 2 }}>
                    🔥 {bondStreak}d streak
                  </Text>
                )}
              </View>
            )}
          </View>
          <Animated.View style={{ opacity: isGlobal ? bondFade : 1 }}>
            {bondDays >= 365 ? (() => {
              const yrs = Math.floor(bondDays / 365);
              const mos = Math.floor((bondDays % 365) / 30);
              return (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 3 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[s.widgetBigNum, { color: bondAc, fontSize: TYPO.title, lineHeight: 28 }]}>{yrs}</Text>
                    <Text style={[s.widgetSub, { color: colors.textSecondary }]}>YR</Text>
                  </View>
                  {mos > 0 && <View style={{ alignItems: 'center' }}>
                    <Text style={[s.widgetBigNum, { color: bondAc, fontSize: TYPO.title, lineHeight: 28 }]}>{mos}</Text>
                    <Text style={[s.widgetSub, { color: colors.textSecondary }]}>MO</Text>
                  </View>}
                </View>
              );
            })() : (
              <>
                <Text style={[s.widgetBigNum, { color: bondAc }]}>{bondDays}</Text>
                <Text style={[s.widgetSub, { color: colors.textSecondary }]}>days together</Text>
              </>
            )}

            {!isGlobal && bondStreak >= 1 && (
              <View style={[s.widgetStreakPill, { backgroundColor: colors.warning + '22', marginTop: 4 }]}>
                <Text style={[s.widgetStreakText, { color: colors.warning }]}>🔥 {bondStreak} day{bondStreak !== 1 ? 's' : ''}</Text>
              </View>
            )}

            <View style={{ height: 6 }} />

            <TogethernessBadge
              days={bondDays}
              petUri={bondAvatar}
              userUri={profile?.avatar_url ?? null}
              petAccent={bondAc}
              petEmoji={(bondPet as any)?.emoji ?? '🐾'}
              petName={bondPet?.name ?? ''}
              fg={bondAc}
              sub={colors.textSecondary}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* ── Right column ── */}
      <View style={s.widgetColRight}>
        {/* Mood tile */}
        <MoodTile
          isGlobal={isGlobal}
          sortedPets={sortedPets}
          globalPetMoods={globalPetMoods}
          pet={pet}
          mood={mood}
          isLost={isLost}
          scanMaxed={scanMaxed}
          todayPhotoScanCount={todayPhotoScanCount}
          tier={tier}
          ac={ac}
          moodColor={moodColor}
          moodEmoji={moodEmoji}
          scanPulse={scanPulse}
          moodEmojiScale={moodEmojiScale}
          colors={colors}
          s={s}
          onOpenScan={onOpenScan}
        />

        {/* Vet tile */}
        <View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => isGlobal ? onSummaryAction('/health/appointments') : onOpenVetSheet()}
            style={[s.widgetTile, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[s.widgetLabel, { color: colors.textSecondary }]}>NEXT VET</Text>
            {nextVet ? (
              <>
                <Text style={[s.widgetApptName, { color: colors.warning }]} numberOfLines={1}>{nextVet.label}</Text>
                <Text style={[s.widgetSub, { color: colors.textSecondary }]}>{nextVet.timeLabel}</Text>
                <Text style={[s.widgetSub, { color: colors.textSecondary }]}>in {nextVet.daysUntil}d</Text>
              </>
            ) : lastVet ? (
              <>
                <Text style={[s.widgetApptName, { color: colors.textSecondary }]} numberOfLines={1}>{lastVet.label}</Text>
                <Text style={[s.widgetSub, { color: colors.textSecondary }]}>{lastVet.daysAgo === 0 ? 'today' : `${lastVet.daysAgo}d ago`}</Text>
              </>
            ) : (
              <Text style={[s.widgetSub, { color: colors.textSecondary, marginTop: 4 }]}>None booked</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});
