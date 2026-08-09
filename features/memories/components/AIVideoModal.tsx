import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, TouchableOpacity, Modal, Animated,
  ActivityIndicator, Platform, ToastAndroid,
} from 'react-native';
import { Image } from 'expo-image';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert } from '@/components/AppAlert';
import { FILL, YEAR, width, type YIRData } from '../videoShared';
import {
  currentHalf, yirCacheHalf, isYIRLocked, markYIRGenerated, simulatedPhotos,
} from '../videoUtils';
import { KenBurnsImage } from './KenBurnsImage';

type AIVideoState = 'idle' | 'generating' | 'ready' | 'error';

interface AISlide { photoUrl: string; caption: string; }
interface AICuration { openingLine: string; closingMessage: string; slides: AISlide[]; }

const AI_STEPS = [
  'Picking your best moments…',
  'Writing personal captions…',
  'Crafting your story…',
  'Almost ready…',
];

const AI_SLIDE_MS = 4500;

interface AIVideoModalProps {
  visible: boolean;
  onClose: () => void;
  data: YIRData;
  pet: any;
}

export function AIVideoModal({ visible, onClose, data, pet }: AIVideoModalProps) {
  const insets     = useSafeAreaInsets();
  const [state, setState]         = useState<AIVideoState>('idle');
  const [locked, setLocked]       = useState(false);
  const [curation, setCuration]   = useState<AICuration | null>(null);
  const [current, setCurrent]     = useState(0);
  const [stepIdx, setStepIdx]     = useState(0);
  const opacity    = useRef(new Animated.Value(1)).current;
  const captionY   = useRef(new Animated.Value(12)).current;
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewShotRef = useRef<InstanceType<typeof ViewShot>>(null);
  const [saving, setSaving] = useState(false);
  const [muted, setMuted]   = useState(false);
  const soundRef = useRef<AudioPlayer | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!visible || !data.musicUrl) return;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    const player = createAudioPlayer({ uri: data.musicUrl });
    player.volume = 0.6;
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

  useEffect(() => {
    if (!visible || !pet?.id) return;
    (async () => {
      const l = await isYIRLocked(pet.id);
      if (!mounted.current) return;
      setLocked(l);
      if (l) {
        const { supabase: sb } = await import('@/lib/supabase');
        const { data: row } = await sb
          .from('yir_cache')
          .select('curation')
          .eq('pet_id', pet.id)
          .eq('period', yirCacheHalf())
          .maybeSingle();
        if (mounted.current && row?.curation) {
          setCuration(row.curation as AICuration);
          setCurrent(0);
          setState('ready');
        }
      }
    })();
  }, [visible, pet?.id]);

  useEffect(() => {
    if (state !== 'generating') return;
    const t = setInterval(() => {
      if (mounted.current) setStepIdx(i => (i + 1) % AI_STEPS.length);
    }, 3_000);
    return () => clearInterval(t);
  }, [state]);

  const generate = useCallback(async () => {
    if (!pet?.id) return;
    setState('generating'); setStepIdx(0);
    const half = currentHalf();
    const halfPhotos = data.bestMoments.filter((p: any) => {
      if (!p.taken_at) return true;
      return half === 'H1' ? p.taken_at <= `${YEAR}-06-30` : true;
    });
    let pool: any[] = halfPhotos.length ? halfPhotos : data.bestPhoto ? [data.bestPhoto] : [];
    if (pool.length < 6) {
      pool = [...pool, ...simulatedPhotos(pet.species ?? 'dog', 6 - pool.length)];
    }
    console.log('[AI-YIR] pool size:', pool.length);
    if (!pool.length) { setState('error'); return; }
    try {
      const { supabase: sb } = await import('@/lib/supabase');
      const { data: fnData, error } = await sb.functions.invoke('yir-video-gen', {
        body: {
          petName:    pet.name ?? 'My Pet',
          petSpecies: pet.species ?? 'dog',
          year:       YEAR,
          half,
          photos:     pool.slice(0, 12).map((p: any) => ({ url: p.url, takenAt: p.taken_at, mood: p.mood_label })),
          topMoods:   data.topMoods.map(m => m.label),
          milestones: data.milestonesThisYear.map(m => m.title),
        },
      });
      if (!mounted.current) return;
      console.log('[AI-YIR] raw response:', JSON.stringify(fnData, null, 2));
      if (error || fnData?.fallback || !fnData?.slides?.length) { setState('error'); return; }
      await sb.from('yir_cache').upsert(
        { pet_id: pet.id, period: yirCacheHalf(), curation: fnData },
        { onConflict: 'pet_id,period' },
      );
      await markYIRGenerated(pet.id);
      setLocked(true);
      setCuration(fnData as AICuration);
      setCurrent(0);
      setState('ready');
    } catch {
      if (mounted.current) setState('error');
    }
  }, [pet, data]);

  useEffect(() => { if (visible && state === 'idle' && !locked) generate(); }, [visible, locked]);

  useEffect(() => {
    if (!visible) { setState('idle'); setCuration(null); setCurrent(0); }
  }, [visible]);

  const goTo = useCallback((idx: number, total: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(opacity,   { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(captionY,  { toValue: 8, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      if (!mounted.current) return;
      setCurrent(idx);
      captionY.setValue(16);
      Animated.parallel([
        Animated.timing(opacity,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(captionY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    });
  }, [opacity, captionY]);

  const allSlides = useMemo(() => {
    if (!curation) return [];
    const mid = curation.slides;
    const result: Array<{
      photoUrl: string; caption: string;
      photos?: string[];
      isTitle?: boolean; isClosing?: boolean;
    }> = [];

    const seen = new Set<string>();
    const unique = mid.filter(s => {
      if (seen.has(s.photoUrl)) return false;
      seen.add(s.photoUrl);
      return true;
    });

    result.push({ photoUrl: unique[0]?.photoUrl ?? '', caption: curation.openingLine, isTitle: true });

    const pool = unique.slice(1);
    let i = 0;
    while (i < pool.length) {
      const remaining = pool.length - i;
      if (remaining <= 2) {
        pool.slice(i).forEach(s => result.push({ photoUrl: s.photoUrl, caption: s.caption }));
        i += remaining;
      } else {
        const size = (Math.floor(i / 2) % 2 === 0) ? 2 : 3;
        const group = pool.slice(i, i + size);
        result.push({
          photoUrl: group[0].photoUrl,
          photos:   group.map(s => s.photoUrl),
          caption:  group[0].caption,
        });
        i += size;
      }
    }

    result.push({ photoUrl: unique[unique.length - 1]?.photoUrl ?? '', caption: curation.closingMessage, isClosing: true });
    return result;
  }, [curation]);

  useEffect(() => {
    if (state !== 'ready' || !allSlides.length) return;
    timerRef.current = setTimeout(() => {
      if (current < allSlides.length - 1) goTo(current + 1, allSlides.length);
      else onClose();
    }, AI_SLIDE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, state, allSlides.length, goTo, onClose]);

  const currentSlide = allSlides[current];
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  const exportAllSlides = useCallback(async (mode: 'save' | 'share') => {
    if (saving || !allSlides.length) return;
    setSaving(true);
    let saved = 0;
    let firstUri: string | null = null;

    let mediaLibAvailable = false;
    if (mode === 'save') {
      try {
        const perm = await MediaLibrary.requestPermissionsAsync(true);
        mediaLibAvailable =
          perm.status === 'granted' ||
          (Platform.OS === 'ios' && (perm as any).accessPrivilege !== 'none');
        if (!mediaLibAvailable && perm.status === 'denied') {
          showAlert(
            'Gallery access needed',
            Platform.OS === 'ios'
              ? 'Go to Settings → PawBond → Photos and allow access.'
              : 'Go to Settings → Apps → PawBond → Permissions → Photos.',
          );
          setSaving(false);
          return;
        }
      } catch {}
    }

    try {
      for (let i = 0; i < allSlides.length; i++) {
        setExportProgress(`Capturing ${i + 1} / ${allSlides.length}`);
        setCurrent(i);
        await new Promise(r => setTimeout(r, 900));
        try {
          const uri = await viewShotRef.current?.capture?.();
          console.log(`[YIR] slide ${i}:`, uri ?? 'null');
          if (!uri) continue;
          if (!firstUri) firstUri = uri;
          if (mode === 'save' && mediaLibAvailable) {
            await MediaLibrary.saveToLibraryAsync(uri);
            saved++;
          }
        } catch (e) {
          console.log(`[YIR] slide ${i} capture/save error:`, e);
        }
      }

      setCurrent(0);

      if (mode === 'share' && firstUri) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(firstUri, { mimeType: 'image/png', UTI: 'public.image', dialogTitle: `${pet?.name}'s ${YEAR} in Review` });
      } else if (mode === 'save') {
        if (!mediaLibAvailable && firstUri) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) await Sharing.shareAsync(firstUri, { mimeType: 'image/png', UTI: 'public.image', dialogTitle: 'Save to your device' });
        } else if (saved === 0) {
          showAlert('Oops', 'Could not capture slides. Try again.');
        } else {
          if (Platform.OS === 'android') {
            ToastAndroid.show(`${saved} slides saved to gallery`, ToastAndroid.SHORT);
          } else {
            showAlert(`${saved} slides saved 🎬`, 'Find them in your Camera Roll. In Photos, select them all and tap Share → Slideshow to play as video.');
          }
        }
      }
    } catch (e) {
      console.log('[YIR export error]', e);
      showAlert('Oops', 'Could not save. Try again.');
    } finally {
      setSaving(false);
      setExportProgress(null);
    }
  }, [saving, allSlides, pet]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[FILL, { backgroundColor: '#000' }]}>

        {state === 'generating' && (
          <View style={[FILL, { justifyContent: 'center', alignItems: 'center', padding: 40, gap: 28 }]}>
            <Text style={{ fontSize: 52 }}>✨</Text>
            <Text style={{ color: '#fff', fontSize: TYPO.title, fontWeight: '800', textAlign: 'center' }}>
              Creating your Story
            </Text>
            <ActivityIndicator size="large" color="#a78bfa" />
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: TYPO.body, textAlign: 'center', lineHeight: 22 }}>
              {AI_STEPS[stepIdx]}
            </Text>
          </View>
        )}

        {locked && state === 'idle' && (
          <View style={[FILL, { justifyContent: 'center', alignItems: 'center', padding: 40, gap: 20 }]}>
            <Text style={{ fontSize: 52 }}>🎬</Text>
            <Text style={{ color: '#fff', fontSize: TYPO.title, fontWeight: '800', textAlign: 'center' }}>
              {YEAR} Story Already Created
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: TYPO.body, textAlign: 'center', lineHeight: 22 }}>
              Your {YEAR} Year in Review is ready.{'\n'}A new one unlocks on January 30, {YEAR + 1}.
            </Text>
            <TouchableOpacity onPress={onClose}
              style={{ backgroundColor: '#7c3aed', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Got it</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'error' && (
          <View style={[FILL, { justifyContent: 'center', alignItems: 'center', padding: 40, gap: 20 }]}>
            <Text style={{ fontSize: 48 }}>🐾</Text>
            <Text style={{ color: '#fff', fontSize: TYPO.heading, fontWeight: '800', textAlign: 'center' }}>
              Couldn't create your story
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: TYPO.body, textAlign: 'center', lineHeight: 20 }}>
              Something went wrong. Try again or use the slideshow below.
            </Text>
            <TouchableOpacity onPress={() => { setState('idle'); generate(); }}
              style={{ backgroundColor: '#a78bfa', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'ready' && currentSlide && (
          <Animated.View style={[FILL, { opacity }]}>
            <ViewShot ref={viewShotRef} style={FILL} options={{ format: 'png', quality: 1 }}>
              {(currentSlide as any).photos?.length > 1 ? (() => {
                const photos: string[] = (currentSlide as any).photos;
                const cardW = width * 0.44;
                const cardH = cardW * 1.25;
                const cardR  = 14;
                const shadow = {
                  shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
                };
                return (
                  <>
                    <Image source={{ uri: photos[0] }} cachePolicy="memory-disk" style={[FILL, { opacity: 0.55 }]} contentFit="cover" />
                    <View style={[FILL, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />

                    {photos.length === 2 ? (
                      <View style={[FILL, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 20 }]}>
                        <View style={[{ width: cardW, height: cardH + 20, borderRadius: cardR, overflow: 'hidden', marginTop: -30 }, shadow]}>
                          <Image source={{ uri: photos[0] }} cachePolicy="memory-disk" style={{ flex: 1 }} contentFit="cover" />
                        </View>
                        <View style={[{ width: cardW, height: cardH + 20, borderRadius: cardR, overflow: 'hidden', marginTop: 30 }, shadow]}>
                          <Image source={{ uri: photos[1] }} cachePolicy="memory-disk" style={{ flex: 1 }} contentFit="cover" />
                        </View>
                      </View>
                    ) : (
                      <View style={[FILL, { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 }]}>
                        <View style={[{ width: cardW * 1.1, height: cardH, borderRadius: cardR, overflow: 'hidden' }, shadow]}>
                          <Image source={{ uri: photos[0] }} cachePolicy="memory-disk" style={{ flex: 1 }} contentFit="cover" />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          {photos.slice(1, 3).map((url, i) => (
                            <View key={i} style={[{ width: cardW * 0.9, height: cardH * 0.75, borderRadius: cardR, overflow: 'hidden' }, shadow]}>
                              <Image source={{ uri: url }} cachePolicy="memory-disk" style={{ flex: 1 }} contentFit="cover" />
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                );
              })() : (
                <KenBurnsImage uri={currentSlide.photoUrl} style={FILL} duration={AI_SLIDE_MS} configIdx={current} blurred />
              )}
              <LinearGradient
                colors={['transparent', 'transparent', 'rgba(0,0,0,0.6)']}
                style={FILL}
              />

              {currentSlide.caption ? (
                <Animated.View style={{
                  position: 'absolute', bottom: insets.bottom + 110,
                  left: 20, right: 20, alignItems: 'center',
                  transform: [{ translateY: captionY }],
                }}>
                  <View style={{
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10,
                    maxWidth: '90%',
                  }}>
                    <Text style={{
                      color: '#fff',
                      fontSize: (currentSlide as any).isTitle ? TYPO.title : (currentSlide as any).isClosing ? TYPO.subheading : TYPO.body,
                      fontWeight: (currentSlide as any).isTitle ? '700' : '400',
                      textAlign: 'center', lineHeight: 22,
                      letterSpacing: 0.1,
                    }}>
                      {currentSlide.caption}
                    </Text>
                  </View>
                </Animated.View>
              ) : null}
            </ViewShot>
          </Animated.View>
        )}

        {state === 'ready' && allSlides.length > 0 && (
          <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 52,
            flexDirection: 'row', gap: 2 }}>
            {allSlides.map((_, i) => (
              <View key={i} style={{ flex: 1, height: 2, borderRadius: 1,
                backgroundColor: i < current ? '#fff' : i === current ? '#fff' : 'rgba(255,255,255,0.35)',
                opacity: i <= current ? 1 : 0.5 }} />
            ))}
          </View>
        )}

        {state === 'ready' && (
          <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 16, right: 16, gap: 6 }}>
            {exportProgress !== null && (
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: TYPO.body, textAlign: 'center' }}>
                {exportProgress}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => exportAllSlides('save')} disabled={saving}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingVertical: 12 }}>
                {saving && exportProgress !== null
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="download-outline" size={16} color="#fff" />}
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: TYPO.body }}>
                  {saving && exportProgress !== null ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => exportAllSlides('share')} disabled={saving}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingVertical: 12 }}>
                <Ionicons name="share-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: TYPO.body }}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {state === 'ready' && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 130, flexDirection: 'row' }} pointerEvents="box-none">
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
              onPress={() => current > 0 && goTo(current - 1, allSlides.length)} />
            <TouchableOpacity style={{ flex: 2 }} activeOpacity={1}
              onPress={() => current < allSlides.length - 1 ? goTo(current + 1, allSlides.length) : onClose()} />
          </View>
        )}

        <View style={{ position: 'absolute', top: insets.top + 6, right: 14, flexDirection: 'row', gap: 8 }}>
          {data.musicUrl && state === 'ready' && (
            <TouchableOpacity onPress={() => setMuted(m => !m)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)',
                alignItems: 'center', justifyContent: 'center' }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={muted ? 'volume-mute' : 'musical-notes'} size={16} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center', justifyContent: 'center' }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
