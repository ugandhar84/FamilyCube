import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Animated, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/lib/ThemeContext';
import { SPACING, RADIUS, TYPO} from '@/constants/theme';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { usePaywall } from '@/lib/hooks/usePaywall';
import { LIMITS, showUpgradeAlert } from '@/lib/subscription';
import { UltimateGate } from '@/components/FeatureGate';
import PetHeaderChip from '@/components/PetHeaderChip';
import { format, parseISO } from 'date-fns';
import { toTitle } from '@/lib/format';
import { FilmIcon } from '@/components/ui/FureverIcons';
import { assignTemplate, type YIRTemplate } from '@/lib/yirTemplates';
import { saveMediaToDevice } from '@/lib/saveMedia';

import {
  FILL, SLIDE_MS, YEAR, MOOD_EMOJI, width,
  buildSlides, type YIRData,
} from '@/features/memories/videoShared';
import { fetchYIRData, isYIRLocked } from '@/features/memories/videoUtils';
import { s, ss } from '@/features/memories/components/videoStyles';
import { SlideContent } from '@/features/memories/components/SlideshowSlides';
import { AIVideoModal } from '@/features/memories/components/AIVideoModal';

// ─── slideshow modal ──────────────────────────────────────────────────────────

function SlideshowModal({ visible, onClose, data, pet, t }: {
  visible: boolean; onClose: () => void; data: YIRData; pet: any; t: YIRTemplate;
}) {
  const insets = useSafeAreaInsets();
  const slides = useMemo(() => buildSlides(data), [data]);
  const [current, setCurrent] = useState(0);
  const [muted, setMuted]     = useState(false);
  const opacity   = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted   = useRef(true);
  const soundRef  = useRef<AudioPlayer | null>(null);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!visible || !data.musicUrl) return;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    const player = createAudioPlayer({ uri: data.musicUrl });
    player.volume = 0.7;
    player.loop = true;
    player.muted = muted;
    player.play();
    soundRef.current = player;
    return () => {
      player.remove();
      soundRef.current = null;
    };
  }, [visible, data.musicUrl]);

  useEffect(() => {
    if (soundRef.current) soundRef.current.muted = muted;
  }, [muted]);

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= slides.length) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      if (!mounted.current) return;
      setCurrent(idx);
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    });
  }, [slides.length, opacity]);

  useEffect(() => {
    if (!visible) return;
    setCurrent(0); opacity.setValue(1);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    timerRef.current = setTimeout(() => {
      if (current < slides.length - 1) goTo(current + 1);
    }, SLIDE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, visible, slides.length, goTo]);

  const slide = slides[Math.min(current, slides.length - 1)];
  const hasMusic = !!data.musicUrl;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[FILL, { backgroundColor: '#000' }]}>
        <Animated.View style={[FILL, { opacity }]}>
          <SlideContent slide={slide} data={data} pet={pet} t={t} />
        </Animated.View>

        <View style={[ss.progressRow, { top: insets.top + 10 }]}>
          {slides.map((_, i) => (
            <View key={i} style={[ss.progressSeg, { backgroundColor: i <= current ? t.accent : 'rgba(255,255,255,0.3)' }]} />
          ))}
        </View>

        <View style={[ss.controls, { top: insets.top + 6 }]}>
          {hasMusic && (
            <TouchableOpacity style={ss.controlBtn} onPress={() => setMuted(m => !m)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={muted ? 'volume-mute' : 'musical-notes'} size={18} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={ss.controlBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={[FILL, { flexDirection: 'row' }]} pointerEvents="box-none">
          <TouchableOpacity style={{ flex: 1 }} onPress={() => goTo(current - 1)} activeOpacity={1} />
          <TouchableOpacity style={{ flex: 2 }} onPress={() => current < slides.length - 1 ? goTo(current + 1) : onClose()} activeOpacity={1} />
        </View>
      </View>
    </Modal>
  );
}

// ─── main screen ──────────────────────────────────────────────────────────────

export default function YearInReviewScreen() {
  const { colors } = useTheme();
  const { activePet } = usePetStore(useShallow(s => ({ activePet: s.activePet })));
  const pet = activePet();
  const accent = (pet as any)?.accent_color ?? colors.primary;

  const videoEnabled = useFeatureFlag('memories_video_enabled', true);
  const { tier } = usePaywall();
  const blocked = !videoEnabled || LIMITS[tier as keyof typeof LIMITS]?.videoPostsPerMonth === 0;

  const [loading, setLoading]             = useState(true);
  const [data, setData]                   = useState<YIRData | null>(null);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [showAIVideo, setShowAIVideo]     = useState(false);
  const [aiGenerated, setAIGenerated]     = useState(false);
  const [saving, setSaving]               = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const template = useMemo<YIRTemplate | null>(
    () => pet?.id ? assignTemplate(pet.id, YEAR) : null,
    [pet?.id],
  );

  useEffect(() => {
    if (pet?.id) isYIRLocked(pet.id).then(setAIGenerated);
  }, [pet?.id]);

  useEffect(() => {
    if (!pet?.id || blocked) { setLoading(false); return; }
    fetchYIRData(pet.id, pet)
      .then(d => { if (mounted.current) { setData(d); setLoading(false); } })
      .catch(() => { if (mounted.current) setLoading(false); });
  }, [pet?.id, blocked]);

  const THUMB_SZ = Math.floor((width - SPACING.lg * 2 - 12) / 4);

  const downloadBestPhoto = useCallback(async (mode: 'save' | 'share') => {
    const photo = data?.bestMoments[0] ?? data?.bestPhoto;
    if (!photo?.url) { showAlert('No photo', 'No best photo found for this year.'); return; }
    setSaving(true);
    try {
      if (mode === 'save') {
        await saveMediaToDevice(photo.url, 'photo');
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(photo.url, { mimeType: 'image/jpeg', UTI: 'public.image', dialogTitle: `${pet?.name}'s ${YEAR} in Review` });
      }
    } catch { showAlert('Oops', 'Could not download. Try again.'); }
    finally { setSaving(false); }
  }, [data, pet]);

  const onPageDownloadPress = useCallback(() => {
    showAlert(
      `${pet?.name}'s ${YEAR} Best Moment`,
      'Save or share the top photo from this year.',
      [
        { text: 'Save to Photos', onPress: () => downloadBestPhoto('save') },
        { text: 'Share', onPress: () => downloadBestPhoto('share') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [downloadBestPhoto, pet]);

  if (blocked) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <UltimateGate icon="film-outline" featureName="Year in Review"
          tagline={`A curated slideshow of ${pet?.name ?? 'your pet'}'s best moments`}
          perks={['Best moments auto-curated', 'Animated slideshow with effects', 'Mood & milestone highlights']}
          currentTier={tier} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={[s.title, { color: colors.textPrimary }]}>Year in Review</Text>
          <PetHeaderChip pet={pet as any} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primaryText ?? colors.primary} size="large" />
          <Text style={{ color: colors.textSecondary, fontSize: TYPO.body }}>Curating your {YEAR}…</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {template ? (
            <LinearGradient colors={[...template.bg]} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              {data?.bestPhoto
                ? <Image source={{ uri: data.bestPhoto.url }} cachePolicy="memory-disk" style={[FILL, { opacity: 0.3, borderRadius: RADIUS.xl }]} contentFit="cover" />
                : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FilmIcon color={template.accent} size={13} strokeWidth={2} />
                <Text style={[s.heroBadge, { color: template.accent }]}>✦  {YEAR} IN REVIEW  ·  {template.name.toUpperCase()}</Text>
              </View>
              <Text style={s.heroName}>{pet?.name ?? 'Your Pet'}</Text>
              {data ? (
                <View style={s.heroStats}>
                  {[
                    { v: data.totalPhotos,    l: 'photos' },
                    { v: data.totalMoods,     l: 'moods' },
                    { v: data.totalMilestones,l: 'milestones' },
                  ].map((item, i, arr) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={s.heroStat}>
                        <Text style={s.heroStatVal}>{item.v}</Text>
                        <Text style={[s.heroStatLbl, { color: template.subText }]}>{item.l}</Text>
                      </View>
                      {i < arr.length - 1 && <View style={s.heroDiv} />}
                    </View>
                  ))}
                </View>
              ) : null}
            </LinearGradient>
          ) : null}

          {data && data.totalPhotos === 0 && data.totalMoods === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 44 }}>📸</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No memories yet this year</Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                Capture photos and mood check-ins throughout {YEAR} — they'll all appear here.
              </Text>
            </View>
          ) : data ? (
            <>
              {data.bestMoments.length > 0 && (
                <>
                  <Text style={[s.section, { color: colors.textPrimary }]}>Best moments</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {data.bestMoments.map(p => (
                      <View key={p.id} style={{ width: THUMB_SZ, height: THUMB_SZ, borderRadius: 10, overflow: 'hidden' }}>
                        <Image source={{ uri: p.url }} cachePolicy="memory-disk" style={FILL} contentFit="cover" />
                        {p.mood_label
                          ? <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={[FILL, { justifyContent: 'flex-end', padding: 5 }]}>
                              <Text style={{ fontSize: TYPO.body }}>{MOOD_EMOJI[p.mood_label] ?? '🐾'}</Text>
                            </LinearGradient>
                          : null}
                      </View>
                    ))}
                  </View>
                </>
              )}

              {data.topMoods.length > 0 && (
                <>
                  <Text style={[s.section, { color: colors.textPrimary, marginTop: 22 }]}>Mood journey</Text>
                  <View style={[s.card, { backgroundColor: colors.card }]}>
                    {data.topMoods.map((m, i) => (
                      <View key={i} style={[s.moodRow, i < data.topMoods.length - 1 && { marginBottom: 16 }]}>
                        <Text style={{ fontSize: TYPO.title, width: 32 }}>{m.emoji}</Text>
                        <View style={{ flex: 1, gap: 5 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={[s.moodLabel, { color: colors.textPrimary }]}>{toTitle(m.label)}</Text>
                            <Text style={[s.moodPct, { color: m.color }]}>{m.pct}%</Text>
                          </View>
                          <View style={[s.moodTrack, { backgroundColor: colors.border }]}>
                            <View style={[s.moodFill, { width: `${m.pct}%` as any, backgroundColor: m.color }]} />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {data.milestonesThisYear.length > 0 && (
                <>
                  <Text style={[s.section, { color: colors.textPrimary, marginTop: 22 }]}>Milestones this year</Text>
                  <View style={[s.card, { backgroundColor: colors.card, padding: 0, overflow: 'hidden' }]}>
                    {data.milestonesThisYear.slice(0, 4).map((m, i, arr) => (
                      <View key={m.id} style={[s.msRow, i < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
                        <View style={[s.msIcon, { backgroundColor: `${accent}18` }]}>
                          <Text style={{ fontSize: TYPO.heading }}>{m.emoji ?? '🏆'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.msTitle, { color: colors.textPrimary }]}>{m.title}</Text>
                          <Text style={[s.msMeta, { color: colors.textSecondary }]}>{format(parseISO(m.achieved_at), 'MMMM d, yyyy')}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {data.monthlyHighlights.length > 0 && (
                <>
                  <Text style={[s.section, { color: colors.textPrimary, marginTop: 22 }]}>By month</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}>
                    {data.monthlyHighlights.map((m, i) => (
                      <View key={i} style={s.monthCell}>
                        <Image source={{ uri: m.photo.url }} cachePolicy="memory-disk" style={FILL} contentFit="cover" />
                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={[FILL, { justifyContent: 'flex-end', padding: 8 }]}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>{m.month}</Text>
                        </LinearGradient>
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}

              {data.musicUrl && (
                <View style={[s.musicHint, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="musical-notes" size={14} color={colors.textSecondary} />
                  <Text style={[s.musicHintText, { color: colors.textSecondary }]}>
                    Background music ready — plays in slideshow
                  </Text>
                </View>
              )}

              {tier === 'free' ? (
                <TouchableOpacity
                  style={[s.playCta, { backgroundColor: '#6b7280' }]}
                  onPress={() => showUpgradeAlert({ title: 'AI Year in Review', requiredTier: 'pro' })}
                  activeOpacity={0.85}>
                  <Ionicons name="lock-closed" size={18} color="#fff" />
                  <Text style={s.playCtaText}>AI Video  ✨  — Pro only</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.playCta, { backgroundColor: aiGenerated ? '#4c1d95' : '#7c3aed' }]}
                  onPress={() => setShowAIVideo(true)}
                  activeOpacity={0.85}>
                  <Ionicons name={aiGenerated ? 'checkmark-circle' : 'sparkles'} size={20} color="#fff" />
                  <Text style={s.playCtaText}>{aiGenerated ? `${YEAR} Story Ready` : 'Create AI Video  ✨'}</Text>
                </TouchableOpacity>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[s.playCta, { flex: 1, marginTop: 0, backgroundColor: template?.accent ?? accent, opacity: 0.9 }]}
                  onPress={() => setShowSlideshow(true)}
                  activeOpacity={0.85}>
                  <Ionicons name="play-circle" size={20} color="#fff" />
                  <Text style={[s.playCtaText, { fontSize: TYPO.body }]}>Slideshow</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.playCta, { flex: 1, marginTop: 0, backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border }]}
                  onPress={onPageDownloadPress}
                  disabled={saving}
                  activeOpacity={0.85}>
                  {saving
                    ? <ActivityIndicator size="small" color={colors.textSecondary} />
                    : <Ionicons name="download-outline" size={20} color={colors.textPrimary} />}
                  <Text style={[s.playCtaText, { fontSize: TYPO.body, color: colors.textPrimary }]}>Download</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

      {data && template ? (
        <SlideshowModal visible={showSlideshow} onClose={() => setShowSlideshow(false)} data={data} pet={pet} t={template} />
      ) : null}
      {data ? (
        <AIVideoModal visible={showAIVideo} onClose={() => setShowAIVideo(false)} data={data} pet={pet} />
      ) : null}
    </SafeAreaView>
  );
}
