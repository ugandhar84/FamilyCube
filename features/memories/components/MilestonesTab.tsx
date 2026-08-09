/**
 * MilestonesTab — day-count milestone grid + AI-generated moments.
 * Shown inside the Memories screen when the "Milestones" tab is active.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { ha } from '@/features/memories/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_COUNT_DEFS = [
  { day: 1,    label: 'First day home',         icon: 'home-outline'     },
  { day: 7,    label: 'One week together',      icon: 'paw-outline'      },
  { day: 30,   label: 'One month together',     icon: 'moon-outline'     },
  { day: 100,  label: '100 days of memories',   icon: 'star-outline'     },
  { day: 180,  label: 'Half a year together',   icon: 'leaf-outline'     },
  { day: 365,  label: 'First full year',        icon: 'calendar-outline' },
  { day: 500,  label: '500 days together',      icon: 'heart-outline'    },
  { day: 730,  label: 'Two years of love',      icon: 'infinite-outline' },
  { day: 1000, label: '1000 days — legendary!', icon: 'trophy-outline'   },
] as const;

const CARD_GAP = 8;
const CARD_COLS = 3;
import { SPACING, TYPO} from '@/constants/theme';
const { width } = Dimensions.get('window');
const CARD_W = Math.floor((width - 32 - CARD_GAP * (CARD_COLS - 1)) / CARD_COLS);
const CARD_H = Math.round(CARD_W * 1.25);

// ── Props ─────────────────────────────────────────────────────────────────────

interface GalleryPhoto { id: string; url: string; taken_at: string; }

interface MilestonesTabProps {
  pet: any;
  milestones: { id: string; day_count: number; title: string; achieved_at: string; emoji?: string; milestone_type?: string; created_at?: string }[];
  gallery: GalleryPhoto[];
  generatingMilestones: boolean;
  milestoneNextAllowed: Date | null;
  skeletonAnim: Animated.Value;
  colors: any;
  userTier: string;
  activePetId: string;
  onGenerateAI: () => void;
  onNavigateTimeline: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const MilestonesTab = React.memo(function MilestonesTab({
  pet, milestones, gallery, generatingMilestones,
  milestoneNextAllowed, skeletonAnim, colors, userTier,
  activePetId, onGenerateAI, onNavigateTimeline,
}: MilestonesTabProps) {
  const daysHome = pet?.adoption_date
    ? differenceInCalendarDays(new Date(), parseISO(pet.adoption_date))
    : 0;

  const galleryTimestamps = useMemo(
    () => gallery.map(p => ({ photo: p, ms: p.taken_at ? parseISO(p.taken_at).getTime() : null })),
    [gallery],
  );
  const photoNear = useMemo(() => (dateStr: string) => {
    const target = parseISO(dateStr).getTime();
    const THIRTY_DAYS = 30 * 86400000;
    let best: { photo: GalleryPhoto; dist: number } | null = null;
    for (const { photo, ms } of galleryTimestamps) {
      if (ms === null) continue;
      const dist = Math.abs(ms - target);
      if (dist <= THIRTY_DAYS && (best === null || dist < best.dist)) {
        best = { photo, dist };
      }
    }
    return best?.photo ?? null;
  }, [galleryTimestamps]);

  const dayCountMilestones = milestones.filter(m => !m.milestone_type || m.milestone_type === 'day_count');
  const aiMilestones = milestones
    .filter(m => m.milestone_type === 'ai')
    .slice()
    .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at));
  const hasAI = aiMilestones.length > 0;

  return (
    <>
      {/* Day-count milestone grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
        {DAY_COUNT_DEFS.map(({ day, label, icon }) => {
          const achieved  = dayCountMilestones.find(m => m.day_count === day);
          const daysUntil = day - daysHome;
          const isNext    = !achieved && daysUntil > 0 && daysUntil <= 30;
          const isFuture  = !achieved && daysUntil > 30;
          const nearPhoto = achieved ? photoNear(achieved.achieved_at) : null;

          if (achieved) {
            return (
              <View key={day} style={ms.card}>
                {nearPhoto
                  ? <Image source={{ uri: nearPhoto.url }} cachePolicy="memory-disk" style={StyleSheet.absoluteFillObject} contentFit="cover" />
                  : <LinearGradient colors={[ha(colors.primary, 0.8), ha(colors.accent, 0.6)]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject} />
                }
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={[StyleSheet.absoluteFillObject]} />
                {!nearPhoto && (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={icon as any} size={44} color="rgba(255,255,255,0.55)" />
                  </View>
                )}
                <View style={ms.dayBadge}><Text style={ms.dayBadgeText}>Day {day}</Text></View>
                <View style={ms.cardBottom}>
                  <Text style={ms.cardTitle} numberOfLines={2}>{label}</Text>
                  <Text style={ms.cardDate}>{format(parseISO(achieved.achieved_at), 'MMM d, yyyy')}</Text>
                </View>
              </View>
            );
          }
          if (isNext) {
            return (
              <View key={day} style={[ms.card, ms.cardUpcoming, { borderColor: ha(colors.primary, 0.38), backgroundColor: ha(colors.primary, 0.07) }]}>
                <View style={[ms.countdownRing, { backgroundColor: ha(colors.primary, 0.15) }]}>
                  <Text style={[ms.countdownNum, { color: colors.primaryText ?? colors.primary }]}>{daysUntil}</Text>
                  <Text style={[ms.countdownSub, { color: colors.primaryText ?? colors.primary }]}>days</Text>
                </View>
                <Text style={[ms.upcomingTitle, { color: colors.textPrimary }]}>Day {day}</Text>
                <Text style={[ms.upcomingSub, { color: colors.textSecondary }]}>{label}</Text>
              </View>
            );
          }
          if (isFuture || daysHome === 0) {
            return (
              <View key={day} style={[ms.card, ms.cardUpcoming, { borderColor: ha(colors.border, 0.38), backgroundColor: ha(colors.card, 0.5), opacity: 0.5 }]}>
                <Ionicons name={icon as any} size={26} color={colors.textTertiary} />
                <Text style={[ms.upcomingTitle, { color: colors.textSecondary, fontSize: TYPO.body }]}>Day {day}</Text>
                <Text style={[ms.upcomingSub, { color: colors.textSecondary }]}>{label}</Text>
              </View>
            );
          }
          return null;
        })}
      </View>

      {/* AI-generated moments section */}
      <View style={ms.aiHeader}>
        <Text style={[ms.aiHeaderTitle, { color: colors.textPrimary }]}>
          ✨ {pet?.name ?? 'Your pet'}'s moments
        </Text>
        <TouchableOpacity
          onPress={onGenerateAI}
          disabled={generatingMilestones || !!milestoneNextAllowed}
          activeOpacity={0.75}
          style={[ms.generateBtn, {
            backgroundColor: (generatingMilestones || milestoneNextAllowed) ? colors.inputBg : colors.primary,
            opacity: milestoneNextAllowed ? 0.6 : 1,
          }]}>
          {generatingMilestones
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name={milestoneNextAllowed ? 'time-outline' : 'sparkles-outline'} size={13} color="#fff" />}
          <Text style={ms.generateBtnText}>
            {generatingMilestones
              ? 'Generating…'
              : milestoneNextAllowed
                ? `Available ${format(milestoneNextAllowed, 'MMM d')}`
                : hasAI ? 'Refresh' : 'Generate'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Skeleton cards while generating */}
      {generatingMilestones && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <Animated.View key={i} style={[ms.card, {
              backgroundColor: colors.card,
              opacity: skeletonAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
              overflow: 'hidden',
            }]}>
              <LinearGradient colors={[ha(colors.primary, 0.13), ha(colors.accent, 0.09)]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject} />
              <View style={[ms.cardBottom, { gap: 5 }]}>
                <View style={{ height: 10, width: '80%', borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                <View style={{ height: 8,  width: '50%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' }} />
              </View>
            </Animated.View>
          ))}
        </View>
      )}

      {/* AI milestone cards */}
      {hasAI && !generatingMilestones && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP }}>
          {aiMilestones.map(m => {
            const nearPhoto = photoNear(m.achieved_at);
            return (
              <View key={m.id} style={ms.card}>
                {nearPhoto
                  ? <Image source={{ uri: nearPhoto.url }} cachePolicy="memory-disk" style={StyleSheet.absoluteFillObject} contentFit="cover" />
                  : <LinearGradient colors={[ha(colors.accent, 0.8), ha(colors.primary, 0.6)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                }
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFillObject} />
                {!nearPhoto && (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 40 }}>{m.emoji ?? '🐾'}</Text>
                  </View>
                )}
                <View style={ms.dayBadge}>
                  <Text style={[ms.dayBadgeText, { fontSize: TYPO.body }]}>{m.emoji ?? '🐾'}</Text>
                </View>
                <View style={ms.cardBottom}>
                  <Text style={ms.cardTitle} numberOfLines={2}>{m.title}</Text>
                  <Text style={ms.cardDate}>{format(parseISO(m.achieved_at), 'MMM d, yyyy')}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* AI Timeline link (pro-gated) */}
      {pet && (
        <TouchableOpacity onPress={onNavigateTimeline}
          style={{
            marginHorizontal: 0, marginTop: 16, marginBottom: 8,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: userTier !== 'free' ? colors.card : colors.background,
            borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
            opacity: userTier !== 'free' ? 1 : 0.7,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10,
              backgroundColor: userTier !== 'free' ? colors.primaryLight : colors.card,
              alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={userTier !== 'free' ? 'sparkles' : 'lock-closed'} size={18}
                color={userTier !== 'free' ? colors.primary : colors.textTertiary} />
            </View>
            <View>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: userTier !== 'free' ? colors.textPrimary : colors.textSecondary }}>
                {pet.name}'s AI Timeline
              </Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>
                {userTier !== 'free' ? 'Year-in-review · Pro' : 'Upgrade to Pro to unlock'}
              </Text>
            </View>
          </View>
          <Ionicons name={userTier !== 'free' ? 'chevron-forward' : 'lock-closed-outline'} size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      )}
    </>
  );
});

export default MilestonesTab;

// ── Styles ────────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  card:           { width: CARD_W, height: CARD_H, borderRadius: 18, overflow: 'hidden' },
  cardUpcoming:   { borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  dayBadge:       { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 },
  dayBadgeText:   { fontSize: TYPO.caption, fontWeight: '700', color: '#fff' },
  cardBottom:     { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8 },
  cardTitle:      { fontSize: TYPO.caption, fontWeight: '700', color: '#fff', lineHeight: 14 },
  cardDate:       { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  countdownRing:  { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  countdownNum:   { fontSize: 16, fontWeight: '800', lineHeight: 18 },
  countdownSub:   { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  upcomingTitle:  { fontSize: TYPO.caption, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
  upcomingSub:    { fontSize: 11, textAlign: 'center', lineHeight: 13 },
  aiHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 },
  aiHeaderTitle:  { fontSize: TYPO.body, fontWeight: '700' },
  generateBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  generateBtnText:{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
});
