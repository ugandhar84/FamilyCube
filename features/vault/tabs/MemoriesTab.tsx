/**
 * MemoriesTab — private family keepsake album, deliberately NOT styled
 * like a social feed (no "Post," no full-bleed hero, no Instagram-style
 * caption row) — a physical-album metaphor instead: a tilted photo/video
 * card with corner-mount styling, a handwritten-style note underneath,
 * who-was-there tagging, and an occasion label. Up to 6 mixed photo/video
 * slots per memory (video capped at 2 minutes, compressed on upload,
 * muted-autoplay in the feed — tap the speaker to unmute); multi-media
 * memories render as a swipeable carousel (MemoryMedia — capped height,
 * cropped to fill) plus a small tilted "pile of prints" row for anything
 * past the hero slot. Not a public social feed — no comments-from-
 * strangers, no discovery, just the family's own scrapbook. Seniors get
 * read-only access (readOnly prop).
 */
import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image as RNImage, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform, Keyboard, Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ImageIcon, Heart, Trash2, Camera, ImagePlus, X, Download, Layers } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { todayLocal, fmtDateShort } from '@/lib/dates';
import { supabase, uploadFamilyMemoryPhoto, uploadFamilyMemoryVideo } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { MediaViewer, AutoplayVideo } from '@/components/MediaComponents';
import { saveMediaToDevice } from '@/lib/saveMedia';
import CubeSpinner from '@/components/CubeSpinner';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';
import { EmptyState } from './shared';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

const { width: SCREEN_W } = Dimensions.get('window');
// Fixed cap instead of PostMedia's dynamic source-ratio sizing — a tall
// portrait photo was filling almost the entire screen height, which reads
// as "one giant photo," not a scrollable feed. Every post gets the same
// height regardless of source aspect ratio, cropped to fill (cover).
const MEDIA_HEIGHT = 340;

export interface MemoryMediaHandle { scrollToIndex: (i: number) => void; }

// ─── MemoryMedia — capped-height photo/carousel for the feed card ─────────────
const MemoryMedia = forwardRef<MemoryMediaHandle, {
  urls: string[]; mediaTypes?: string[] | null; captionOverlay: boolean; caption: string | null;
  onPress: (index: number) => void;
  // Was hardcoded to SCREEN_W - 32 (the OLD card's edge-to-edge photo, zero
  // inner padding) — the keepsake card wraps everything in its own 14px
  // padding, so that fixed width overflowed past the card's frame instead
  // of sitting inside it (live-reported: "view image is full bleed to the
  // edges... i want original way of viewing" — the photo needs to stay
  // CONTAINED within the keepsake border, matching the composer's own
  // hero-photo treatment, not bleed past it). Callers now size this to
  // their own actual available width.
  width?: number;
  // Lets a caller (the thumbnail row below) know which slide is active and
  // jump the carousel to a tapped thumbnail — exposed via ref instead of a
  // controlled-index prop since the scroll position itself is imperative
  // (ScrollView.scrollTo), not something React state alone drives.
  onIndexChange?: (i: number) => void;
}>(function MemoryMedia({ urls, mediaTypes, captionOverlay, caption, onPress, width, onIndexChange }, ref) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Starts muted, same default every other AutoplayVideo in the app opens
  // with — tap the speaker on the active slide to enable sound.
  const [globalMuted, setGlobalMuted] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const slideW = width ?? SCREEN_W - 32;
  const typeAt = (i: number): 'photo' | 'video' => (mediaTypes?.[i] === 'video' ? 'video' : 'photo');

  useImperativeHandle(ref, () => ({
    scrollToIndex: (i: number) => {
      scrollRef.current?.scrollTo({ x: i * slideW, animated: true });
      setActiveIndex(i);
      onIndexChange?.(i);
    },
  }), [slideW, onIndexChange]);

  const onScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideW);
    if (idx !== activeIndex) { setActiveIndex(idx); onIndexChange?.(idx); }
  };

  // Only the active carousel slide plays — AutoplayVideo's own visibility
  // tracking (registerVideo) is built for the vertical feed scroll, not
  // paging within one card's horizontal carousel, so gate on activeIndex
  // directly instead: a video slide swiped away renders as a static first
  // frame (AutoplayVideo pauses itself once its own isVisible flips false
  // via registerVideo, but never becomes visible here in the first place
  // unless it's the one actually on screen).
  const renderSlide = (u: string, i: number, w: number, h: number) =>
    typeAt(i) === 'video' ? (
      <View style={{ width: w, height: h }}>
        <AutoplayVideo uri={u} id={`memory-${u}-${i}`} globalMuted={globalMuted}
          onToggleMute={() => setGlobalMuted(v => !v)} onDoubleTap={() => onPress(i)} />
      </View>
    ) : (
      <TouchableOpacity activeOpacity={0.95} onPress={() => onPress(i)} style={{ width: w, height: h }}>
        <ExpoImage source={{ uri: u }} style={{ width: w, height: h }}
          contentFit="cover" cachePolicy="memory-disk" transition={180} />
      </TouchableOpacity>
    );

  return (
    <View style={{ width: slideW, height: MEDIA_HEIGHT, backgroundColor: '#00000010' }}>
      {urls.length > 1 ? (
        <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onScroll={onScroll} scrollEventThrottle={16} style={{ flex: 1 }}>
          {urls.map((u, i) => (
            <View key={u + i}>{renderSlide(u, i, slideW, MEDIA_HEIGHT)}</View>
          ))}
        </ScrollView>
      ) : (
        renderSlide(urls[0], 0, slideW, MEDIA_HEIGHT)
      )}

      {captionOverlay && !!caption && (activeIndex === 0 || urls.length === 1) && (
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 14 }}
          pointerEvents="none">
          <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '600' }} numberOfLines={3}>
            {caption}
          </Text>
        </LinearGradient>
      )}

      {urls.length > 1 && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 10, left: 0, right: 0,
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
          {urls.map((_, i) => (
            <View key={i} style={{ width: i === activeIndex ? 16 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.4)' }} />
          ))}
        </View>
      )}
    </View>
  );
});

interface Memory {
  id: string; family_id: string; title: string; description: string | null;
  date: string; photo_url: string | null; photo_urls: string[] | null;
  caption_overlay: boolean;
  hearts: number; hearted_by: string[]; created_by: string | null;
  tagged_member_ids?: string[]; tag?: string | null;
  media_types?: string[] | null;
}

// ─── Compose sheet — pick up to 2 photos + a caption ───────────────────────────

// Occasion chips — maps onto family_memories.tag, a column that pre-
// existed unused before this feature.
const OCCASIONS: { key: string; label: string; emoji: string }[] = [
  { key: 'milestone',    label: 'Milestone',    emoji: '🎂' },
  { key: 'everyday',     label: 'Everyday',     emoji: '☀️' },
  { key: 'celebration',  label: 'Celebration',  emoji: '🎉' },
  { key: 'just_because', label: 'Just because', emoji: '🌙' },
];

// Deterministic per-member color for the wax-seal circles — same
// hash-to-hue approach AddMealSheet.tsx's chef avatars already use in
// this codebase, so a given person's seal color stays stable across opens.
function sealColor(name: string): string {
  const hue = name.charCodeAt(0) % 360;
  return `hsl(${hue},55%,48%)`;
}

interface ComposedMedia { uri: string; type: 'photo' | 'video'; }

function ComposeMemoryModal({ visible, onClose, onPost, members, myId, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onPost: (media: ComposedMedia[], caption: string, captionOverlay: boolean, taggedMemberIds: string[], tag: string | null) => Promise<void>;
  members: FamilyMember[]; myId: string;
  colors: any; isDark: boolean;
}) {
  // Mixed photo/video slots, index 0 is always the hero. Was a bare
  // string[] (photo URIs only) — a typed slot per item so the keepsake
  // card and filmstrip know whether to render a still or an autoplaying
  // (muted-by-default) video.
  const [media, setMedia] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
  const [caption, setCaption] = useState('');
  const [captionOverlay, setCaptionOverlay] = useState(false);
  const [posting, setPosting] = useState(false);
  // Defaults to just the poster themselves — "who was there" starts
  // pre-filled with an obvious true fact, not empty.
  const [taggedIds, setTaggedIds] = useState<string[]>(myId ? [myId] : []);
  const [occasion, setOccasion]   = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  // Starts muted — same default AutoplayVideo uses everywhere else in the
  // app (feed autoplay never opens with sound), tap the speaker to enable.
  const [heroMuted, setHeroMuted] = useState(true);

  const MAX_VIDEO_SECONDS = 120;

  const reset = () => {
    setMedia([]); setCaption(''); setCaptionOverlay(false);
    setTaggedIds(myId ? [myId] : []); setOccasion(null); setPreviewIdx(null);
  };

  const toggleTag = (id: string) =>
    setTaggedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Tapping a print in the row promotes it to the hero (lead) position —
  // swaps places rather than needing a separate "set as cover" control.
  const promoteToHero = (idx: number) => {
    if (idx === 0) return;
    setMedia(prev => { const next = [...prev]; const [picked] = next.splice(idx, 1); return [picked, ...next]; });
  };

  const removeAt = (i: number) => setMedia(prev => prev.filter((_, idx) => idx !== i));

  // No allowsEditing here — every other library-picker call in this codebase
  // (ComposeSheet.tsx) skips it too; allowsEditing is only ever paired with
  // launchCameraAsync elsewhere. Combining it with launchImageLibraryAsync
  // froze the whole app (native picker never returned control to RN) —
  // matching the codebase's proven working pattern instead of the
  // untested combination.
  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo access needed', 'Allow photo library access in Settings to add pictures.');
      return;
    }
    // Mixed picker — a family memory is just as often a short video as a
    // photo. duration comes back in milliseconds for a library pick.
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'], quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const isVideo = asset.type === 'video' || (asset.duration ?? 0) > 0;
    if (isVideo && (asset.duration ?? 0) / 1000 > MAX_VIDEO_SECONDS) {
      Alert.alert('Video too long', `Memories can hold up to ${MAX_VIDEO_SECONDS / 60} minutes of video — trim it and try again.`);
      return;
    }
    setMedia(prev => [...prev, { uri: asset.uri, type: (isVideo ? 'video' : 'photo') as 'video' | 'photo' }].slice(0, 6));
  };

  const takeVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to record a video.');
      return;
    }
    // videoMaxDuration enforces the cap natively during recording, unlike
    // a library pick where an already-long video has to be checked after
    // the fact — same option ChatScreen.tsx's own video capture uses.
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'], videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setMedia(prev => [...prev, { uri: res.assets[0].uri, type: 'video' as const }].slice(0, 6));
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to take a photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: true, aspect: [4, 3] });
    if (res.canceled || !res.assets?.[0]) return;
    // Cap raised 2 -> 6 for the keepsake redesign's "pile of prints" row —
    // a handful of extra shots from the same moment (the realistic case)
    // now has somewhere to go besides being dropped.
    setMedia(prev => [...prev, { uri: res.assets[0].uri, type: 'photo' as const }].slice(0, 6));
  };

  const handlePost = async () => {
    if (media.length === 0) return;
    console.log('[ComposeMemoryModal] handlePost tapped, media:', media, 'caption:', caption);
    setPosting(true);
    try {
      await onPost(media, caption.trim(), captionOverlay, taggedIds, occasion);
      console.log('[ComposeMemoryModal] onPost resolved ok');
      reset();
      onClose();
    } catch (e: any) {
      console.error('[ComposeMemoryModal] ❌ post failed:', e?.message, e);
      Alert.alert('Couldn\'t post', e?.message ?? 'Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const dismiss = () => { Keyboard.dismiss(); reset(); onClose(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(88);
  const hero = media[0] ?? null;
  const rest = media.slice(1);

  // Static-height sheet (fixed maxHeight %, no content-driven measurement) —
  // same pattern as TeenTileSheet/EventFormModal, which don't get shoved
  // upward past their cap when the keyboard opens the way AppBottomSheet's
  // dynamically-measured height does.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={md.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={[md.sheet, { backgroundColor: colors.surface, maxHeight: keyboardAwareMaxHeight ?? '88%' }]}>
            <View style={[md.handle, { backgroundColor: colors.border }]} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontStyle: 'italic', color: colors.primary, marginBottom: 2, fontWeight: '600' }}>
                  for the family album
                </Text>
                <Text style={{ fontSize: 19, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.2 }}>
                  Tuck away a memory
                </Text>
              </View>
              <TouchableOpacity onPress={dismiss} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 8 }}>

              {/* ── The keepsake card — hero photo + handwritten-style note,
                  tucked into corner mounts like an album page, not a
                  full-bleed feed hero competing for attention. ── */}
              <View style={{ backgroundColor: isDark ? '#26222E' : '#F2ECE1', borderRadius: 4, padding: 14,
                paddingBottom: 18, marginHorizontal: 8, marginBottom: rest.length ? 6 : 22,
                transform: [{ rotate: '-0.6deg' }],
                shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}>
                {hero ? (
                  <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 3, overflow: 'hidden',
                    backgroundColor: isDark ? '#2b2436' : colors.border + '40' }}>
                    {hero.type === 'video' ? (
                      <AutoplayVideo uri={hero.uri} id="compose-hero" globalMuted={heroMuted}
                        onToggleMute={() => setHeroMuted(v => !v)} onExpand={() => setPreviewIdx(0)} />
                    ) : (
                      <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewIdx(0)} style={{ flex: 1 }}>
                        <RNImage source={{ uri: hero.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={takePhoto}
                      style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(14,12,19,0.65)',
                        flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
                      <Camera size={12} color="#fff" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Retake</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 3, overflow: 'hidden',
                    backgroundColor: isDark ? '#2b2436' : colors.border + '40' }}>
                    <TouchableOpacity onPress={pickFromLibrary}
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10,
                        borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 3 }}>
                      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary + '20',
                        alignItems: 'center', justifyContent: 'center' }}>
                        <ImagePlus size={20} color={colors.primary} />
                      </View>
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.textTertiary }}>Tap to add a photo or video</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={takeVideo}
                      style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(14,12,19,0.55)',
                        flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 }}>
                      <Text style={{ fontSize: 11 }}>🎥</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Record video</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TextInput value={caption} onChangeText={setCaption}
                  placeholder="Write what made this moment worth keeping…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  style={{ fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 16, fontWeight: '500',
                    lineHeight: 22, color: colors.textPrimary, marginTop: 16, marginHorizontal: 4, minHeight: 26, padding: 0 }} />
                <View style={{ height: 1, marginTop: 8, marginHorizontal: 4, backgroundColor: colors.border }} />
                <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic',
                  fontSize: 11, color: colors.textTertiary, marginTop: 10, marginHorizontal: 4 }}>
                  {fmtDateShort(todayLocal())}
                </Text>
              </View>

              {/* ── Extra prints — small tilted photos, tap to add, tap
                  one to promote it to the hero, ✕ to remove. Deliberately
                  NOT a grid — a couple of loose photos fanned out from the
                  same moment reads as a pile of prints, not a gallery. ── */}
              {hero && (
                <View style={{ marginHorizontal: 2, marginBottom: 22 }}>
                  {rest.length > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 8 }}>
                      <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic',
                        fontSize: 12, color: colors.textTertiary }}>
                        {rest.length} more from the same {rest.length === 1 ? 'shot' : 'afternoon'}
                      </Text>
                    </View>
                  )}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 14, paddingHorizontal: 6, paddingVertical: 8 }}>
                    {rest.map((m, i) => (
                      <TouchableOpacity key={m.uri + i} onPress={() => promoteToHero(i + 1)}
                        style={{ width: 84, height: 84, borderRadius: 4, backgroundColor: isDark ? '#26222E' : '#F2ECE1',
                          padding: 5, transform: [{ rotate: i % 2 === 0 ? '-3deg' : '2.5deg' }],
                          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
                        {/* Filmstrip prints stay static (no autoplay) even
                            for a video slot — several muted autoplaying
                            videos in a tiny row at once is noisy, not
                            tactile. A play badge signals it's a video;
                            tapping promotes it to the hero, where it does
                            autoplay. */}
                        <RNImage source={{ uri: m.uri }} style={{ width: '100%', height: '100%', borderRadius: 2 }} resizeMode="cover" />
                        {m.type === 'video' && (
                          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            alignItems: 'center', justifyContent: 'center' }}>
                            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(14,12,19,0.55)',
                              alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 11, color: '#fff', marginLeft: 1 }}>▶</Text>
                            </View>
                          </View>
                        )}
                        <TouchableOpacity onPress={() => removeAt(i + 1)}
                          style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9,
                            backgroundColor: 'rgba(14,12,19,0.85)', alignItems: 'center', justifyContent: 'center',
                            borderWidth: 1.5, borderColor: colors.surface }}>
                          <X size={9} color="#fff" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                    {media.length < 6 && (
                      <TouchableOpacity onPress={pickFromLibrary}
                        style={{ width: 84, height: 84, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border }}>
                        <Text style={{ fontSize: 22, fontWeight: '300', color: colors.textTertiary }}>＋</Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              )}

              {caption.trim() && media.length > 0 && (
                <TouchableOpacity onPress={() => setCaptionOverlay(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
                    borderColor: captionOverlay ? colors.accent : colors.border,
                    backgroundColor: captionOverlay ? colors.accent + '10' : 'transparent',
                    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 20 }}>
                  <Layers size={16} color={captionOverlay ? colors.accent : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: captionOverlay ? colors.accent : colors.textPrimary }}>
                      Show note on photo
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>
                      {captionOverlay ? 'Note overlays the photo' : 'Note shows below the photo'}
                    </Text>
                  </View>
                  <View style={{ width: 38, height: 22, borderRadius: 11,
                    backgroundColor: captionOverlay ? colors.accent : colors.border,
                    justifyContent: 'center', paddingHorizontal: 2 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                      alignSelf: captionOverlay ? 'flex-end' : 'flex-start' }} />
                  </View>
                </TouchableOpacity>
              )}

              {/* ── Who was there — wax-seal circles, not checkboxes.
                  Unselected members stay visible, just dimmed, so presence
                  reads as optional rather than a roll call. ── */}
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
                color: colors.textTertiary, marginBottom: 10 }}>Who was there</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 22 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {members.map(m => {
                    const sel = taggedIds.includes(m.id);
                    return (
                      <TouchableOpacity key={m.id} onPress={() => toggleTag(m.id)}
                        style={{ alignItems: 'center', gap: 6, opacity: sel ? 1 : 0.5 }}>
                        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: sealColor(m.name),
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: sel ? 2 : 0, borderColor: colors.amber }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                            {m.name.charAt(0).toUpperCase()}
                          </Text>
                          {sel && (
                            <View style={{ position: 'absolute', bottom: -3, right: -3, width: 16, height: 16, borderRadius: 8,
                              backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center',
                              borderWidth: 2, borderColor: colors.surface }}>
                              <Text style={{ fontSize: 9, fontWeight: '900', color: colors.card }}>✓</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: sel ? colors.amber : colors.textSecondary }}>
                          {m.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* ── Occasion — quiet categorization, not hashtags. ── */}
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
                color: colors.textTertiary, marginBottom: 10 }}>What kind of moment</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {OCCASIONS.map(o => {
                  const sel = occasion === o.key;
                  return (
                    <TouchableOpacity key={o.key} onPress={() => setOccasion(sel ? null : o.key)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8,
                        borderRadius: 999, borderWidth: 1.5,
                        borderColor: sel ? colors.pink : colors.border,
                        backgroundColor: sel ? colors.pink + '18' : 'transparent' }}>
                      <Text style={{ fontSize: 13 }}>{o.emoji}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? colors.pink : colors.textSecondary }}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Sticky footer — was inside the ScrollView, could scroll out
                of view once who-was-there/occasion pushed content taller. */}
            <View style={{ flexDirection: 'row', gap: 10, padding: 20, paddingTop: 14,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity onPress={dismiss}
                style={{ flex: 0.85, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
                  alignItems: 'center', justifyContent: 'center', paddingVertical: 15 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePost}
                style={{ flex: 2, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 15,
                  backgroundColor: colors.primary, opacity: media.length === 0 ? 0.5 : 1 }}
                disabled={posting || media.length === 0}>
                {posting
                  ? <CubeSpinner size={18} />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Keep this memory</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {previewIdx !== null && media[previewIdx] && (
        <MediaViewer visible mediaType={media[previewIdx].type} uri={media[previewIdx].uri}
          onClose={() => setPreviewIdx(null)} />
      )}
    </Modal>
  );
}

// ─── Feed card — keepsake style: tilted photo/video card, note-style
// caption, who-was-there + occasion, matching the composer's own header
// treatment ───

function MemoryPostCard({ mem, myId, poster, allMembers, siblings, colors, isDark, onHeart, onDelete, onOpenViewer }: {
  mem: Memory; myId: string; poster?: FamilyMember; allMembers: FamilyMember[]; siblings: string[]; colors: any; isDark: boolean;
  onHeart: () => void; onDelete: () => void;
  onOpenViewer: (urls: string[], startIndex: number, types?: ('photo' | 'video')[]) => void;
}) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const mediaRef = useRef<MemoryMediaHandle>(null);
  const hearted = mem.hearted_by?.includes(myId);
  const heartColor = hearted ? colors.danger : colors.textSecondary;
  // Each card picks up the poster's own role color instead of one flat
  // accent tint for every post — parent posts read sage, kid posts read
  // amber, teen/senior (no dedicated role token) fall back to accent.
  const posterColor = poster?.role === 'parent' ? colors.parent
    : poster?.role === 'kid' ? colors.kid
    : colors.accent;
  // PostMedia treats photoUrl (singular) and photoUrls (plural) as separate
  // props — its own internal allUrls only uses photoUrls when it has 2+
  // entries, otherwise it falls back to photoUrl. Passing a single-item
  // array as photoUrls left it with neither, so single-photo posts
  // silently rendered nothing.
  const hasMulti = !!mem.photo_urls?.length && mem.photo_urls.length > 1;
  if (!mem.photo_url && !hasMulti) return null;
  const allUrls = hasMulti ? mem.photo_urls! : [mem.photo_url!];
  const typeAtIdx = (i: number): 'photo' | 'video' => (mem.media_types?.[i] === 'video' ? 'video' : 'photo');

  // Same suppression rule as the social feed's PostCard: when the caption
  // is shown as an overlay ON the photo, don't also repeat it below —
  // only show the below-image block when there's no overlay, or the
  // overlay didn't actually have text to show.
  const showBelowCaption = !!mem.description && !mem.caption_overlay;

  const OCCASION_LABEL: Record<string, string> = {
    milestone: '🎂 a milestone', everyday: '☀️ just an everyday moment',
    celebration: '🎉 a celebration', just_because: '🌙 just because',
  };
  // Composer defaults "who was there" to just the poster (taggedIds starts
  // as [myId]), so a solo post ends up tagging its own poster — showing
  // that name again right under the header (which already names them) read
  // as a duplicate, not information. Only show people OTHER than the poster.
  const taggedMembers = (mem.tagged_member_ids ?? [])
    .filter(id => id !== mem.created_by)
    .map(id => allMembers.find(m => m.id === id))
    .filter((m): m is FamilyMember => !!m);

  return (
    // Keepsake card — matches the composer's own "photo in an album page,
    // not a feed post" language instead of the generic Instagram-style
    // header/media/actions/caption stack this used to be. Slight tilt +
    // corner mounts on the media, note-style caption in a serif face,
    // hearts read as "N loved this" rather than a raw like-button row.
    <View style={{ marginHorizontal: 16, marginBottom: 22 }}>
      <View style={{ backgroundColor: isDark ? '#26222E' : '#F2ECE1', borderRadius: 4, padding: 14, paddingBottom: 16,
        transform: [{ rotate: '-0.4deg' }],
        shadowColor: '#000', shadowOpacity: isDark ? 0.35 : 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}>

        {/* Header — same eyebrow/title treatment as the composer's own
            header ("for the family album" / "Tuck away a memory"): a small
            italic serif eyebrow line above a bolder title, not just a
            plain name+date row. Eyebrow reads the occasion when tagged,
            falling back to a generic keepsake framing otherwise. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <FamilyAvatar name={poster?.name ?? 'Family'} emoji={poster?.emoji} avatarUrl={poster?.avatarUrl}
            siblings={siblings} size={34} ringColor={posterColor} ringWidth={1.5} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic',
              fontSize: 12, fontWeight: '600', color: colors.primary, marginBottom: 1 }} numberOfLines={1}>
              {mem.tag && OCCASION_LABEL[mem.tag] ? OCCASION_LABEL[mem.tag] : 'a kept moment'}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
              {poster?.name?.split(' ')[0] ?? 'Family'} · {fmtDateShort(mem.date)}
            </Text>
          </View>
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Trash2 size={14} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Media — capped height, cropped to fill, framed like a print
            rather than a full-bleed feed hero. Width matches the card's
            own available space (screen - 16px outer margin*2 - 14px inner
            padding*2) so the photo stays CONTAINED inside the keepsake
            frame instead of overflowing past it. */}
        <View style={{ borderRadius: 3, overflow: 'hidden', alignItems: 'center' }}>
          <MemoryMedia ref={mediaRef} urls={allUrls} mediaTypes={mem.media_types} captionOverlay={mem.caption_overlay} caption={mem.description}
            width={SCREEN_W - 60} onIndexChange={setActiveSlide}
            onPress={(index) => onOpenViewer(allUrls, index, allUrls.map((_, i) => typeAtIdx(i)))} />
        </View>

        {/* Thumbnail row — same tilted "pile of prints" language as the
            composer, so a posted memory with several photos/videos looks
            like the same object the person built, not a different
            component once it's live in the feed. Tapping one jumps the
            main carousel above to that slide for a quick preview. */}
        {allUrls.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingTop: 10, paddingHorizontal: 2 }}>
            {allUrls.map((u, i) => (
              <TouchableOpacity key={u + i} onPress={() => mediaRef.current?.scrollToIndex(i)}
                style={{ width: 52, height: 52, borderRadius: 3, backgroundColor: isDark ? '#1c1924' : '#e8e0d2',
                  padding: 3, transform: [{ rotate: i % 2 === 0 ? '-2.5deg' : '2deg' }],
                  borderWidth: activeSlide === i ? 1.5 : 0, borderColor: colors.primary,
                  shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
                <ExpoImage source={{ uri: u }} style={{ width: '100%', height: '100%', borderRadius: 2 }} contentFit="cover" cachePolicy="memory-disk" />
                {typeAtIdx(i) === 'video' && (
                  <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(14,12,19,0.55)',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 8, color: '#fff', marginLeft: 1 }}>▶</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Note — the caption, written like something under a photo in an
            album, not an Instagram-style "name: text" line */}
        {showBelowCaption && (
          <TouchableOpacity activeOpacity={1} onPress={() => setCaptionExpanded(v => !v)}
            style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 15, fontWeight: '500',
              lineHeight: 21, color: colors.textPrimary }} numberOfLines={captionExpanded ? 0 : 3}>
              {mem.description}
            </Text>
            {!captionExpanded && (mem.description?.length ?? 0) > 90 && (
              <Text style={{ fontSize: 12, color: posterColor, marginTop: 2, fontWeight: '700' }}>more</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Who was there — small overlapping avatars, only when tagged */}
        {taggedMembers.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <View style={{ flexDirection: 'row' }}>
              {taggedMembers.slice(0, 4).map((m, i) => (
                <View key={m.id} style={{ marginLeft: i > 0 ? -8 : 0, borderRadius: 12, borderWidth: 2, borderColor: isDark ? '#26222E' : '#F2ECE1' }}>
                  <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
                    siblings={siblings} size={20} ringColor={colors.amber} ringWidth={1} />
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary }}>
              {taggedMembers.map(m => m.name.split(' ')[0]).join(', ')}
            </Text>
          </View>
        )}

        {/* Loved-by — a heart tap and a quiet "N loved this" instead of a
            raw like-button row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <TouchableOpacity onPress={onHeart} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Heart size={19} color={heartColor} fill={hearted ? colors.danger : 'transparent'} />
          </TouchableOpacity>
          {mem.hearts > 0 && (
            <TouchableOpacity
              onPress={() => {
                const names = (mem.hearted_by ?? [])
                  .map(id => allMembers.find(m => m.id === id)?.name?.split(' ')[0])
                  .filter(Boolean);
                Alert.alert('Loved by', names.length ? names.join(', ') : `${mem.hearts} ${mem.hearts === 1 ? 'person' : 'people'}`);
              }}>
              <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic',
                fontSize: 12, color: colors.textTertiary }}>
                {mem.hearts} loved this
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── MemoriesTab ────────────────────────────────────────────────────────────────

export default function MemoriesTab({ colors, isDark, readOnly = false }: {
  colors: any; isDark: boolean; readOnly?: boolean;
}) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId = (members[0] as any)?.familyId ?? 'family-1';
  const myId = activeMemberId ?? members[0]?.id ?? '';

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Shared FAB's Memories-tab "+" face (app/(tabs)/_layout.tsx) fires this
  // one-shot flag instead of opening Ask Cube — same pattern
  // TasksScreen.tsx uses for openTaskComposerRequested.
  const openMemoryComposerRequested = useUIStore(s => s.openMemoryComposerRequested);
  useEffect(() => {
    if (openMemoryComposerRequested) {
      useUIStore.getState().setOpenMemoryComposerRequested(false);
      setShowModal(true);
    }
  }, [openMemoryComposerRequested]);

  useFocusEffect(useCallback(() => {
    if (useUIStore.getState().openMemoryComposerRequested) {
      useUIStore.getState().setOpenMemoryComposerRequested(false);
      setShowModal(true);
    }
  }, []));

  const load = useCallback(async () => {
    setLoading(true);
    // `date` alone (day-granularity, no time) ties for every post made the
    // same day — order by created_at too so same-day posts still sort
    // newest-first instead of an unspecified tie order.
    // Was unbounded — every memory ever posted loaded on every screen visit,
    // an ever-growing feed with no cap. Capped at a generous recent window;
    // real pagination/"load more" UI is a separate follow-up, not just a
    // query tweak, since this screen has no infinite-scroll affordance today.
    const { data, error } = await supabase.from('family_memories')
      .select('*').eq('family_id', familyId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) console.error('[MemoriesTab] load failed:', error.message, error);
    if (data) setMemories(data as Memory[]);
    setLoading(false);
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  const postMemory = async (media: { uri: string; type: 'photo' | 'video' }[], caption: string, captionOverlay: boolean, taggedMemberIds: string[], tag: string | null) => {
    // Mixed photo/video upload — each slot routes to its own upload
    // function (uploadFamilyMemoryVideo compresses via react-native-
    // compressor; uploadFamilyMemoryPhoto compresses via compressImage) but
    // both land in the same signed-URL shape, so photo_urls/media_types
    // stay simple parallel arrays regardless of what's in each slot.
    const urls = await Promise.all(media.map((m, i) =>
      m.type === 'video'
        ? uploadFamilyMemoryVideo(familyId, m.uri, media.length > 1 ? i : undefined)
        : uploadFamilyMemoryPhoto(familyId, m.uri, media.length > 1 ? i : undefined)
    ));
    const mediaTypes = media.map(m => m.type);
    // No title field in the photo-first compose flow — `title` is NOT NULL
    // at the DB level, so fall back to something reasonable when there's no
    // caption to reuse. `description` is the actual caption text.
    const { data, error } = await supabase.from('family_memories').insert({
      family_id: familyId, created_by: myId,
      title: caption || 'Family memory', description: caption || null,
      date: todayLocal(),
      photo_url: urls[0], photo_urls: urls.length > 1 ? urls : null,
      media_types: mediaTypes,
      caption_overlay: captionOverlay,
      tagged_member_ids: taggedMemberIds, tag,
      hearts: 0, hearted_by: [],
    }).select().single();
    // Previously this discarded `error` and just checked `if (data)` — an
    // RLS-denied insert returns data:null with no thrown exception, so the
    // compose sheet closed as if it had succeeded while nothing was ever
    // saved. Throw so the caller's catch block surfaces the real cause.
    if (error) {
      console.error('[MemoriesTab] postMemory insert failed:', error.message, error);
      throw new Error(error.message);
    }
    if (data) setMemories(prev => [data as Memory, ...prev]);

    const posterName = members.find(m => m.id === myId)?.name ?? 'Someone';
    const recipientIds = members.filter(m => m.id !== myId).map(m => m.id);
    if (recipientIds.length) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'memory_posted', familyId, memberIds: recipientIds,
          payload: { posterName, caption: caption || undefined, memoryId: data?.id },
          persist: true, excludeMemberId: myId,
        },
      }).catch(e => console.warn('[MemoriesTab] postMemory notify failed:', e?.message));
    }
  };

  const heartMemory = async (mem: Memory) => {
    const alreadyHearted = mem.hearted_by?.includes(myId);
    const newHearts = alreadyHearted ? mem.hearts - 1 : mem.hearts + 1;
    const newHearted = alreadyHearted
      ? mem.hearted_by.filter(id => id !== myId)
      : [...(mem.hearted_by ?? []), myId];
    const { error } = await supabase.from('family_memories')
      .update({ hearts: newHearts, hearted_by: newHearted }).eq('id', mem.id);
    if (!error) {
      setMemories(prev => prev.map(m =>
        m.id === mem.id ? { ...m, hearts: newHearts, hearted_by: newHearted } : m
      ));

      // Only the like transition notifies (not unliking), and only the
      // memory's own poster — not a broadcast to everyone else, unlike
      // postMemory above.
      if (!alreadyHearted && mem.created_by && mem.created_by !== myId) {
        const likerName = members.find(m => m.id === myId)?.name ?? 'Someone';
        supabase.functions.invoke('family-notifier', {
          body: {
            type: 'memory_liked', familyId, memberIds: [mem.created_by],
            payload: { likerName, caption: mem.description || undefined, memoryId: mem.id },
            persist: true, excludeMemberId: myId,
          },
        }).catch(e => console.warn('[MemoriesTab] heartMemory notify failed:', e?.message));
      }
    }
  };

  const deleteMemory = (id: string) => {
    Alert.alert('Remove memory', 'Delete this post? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('family_memories').delete().eq('id', id);
        setMemories(prev => prev.filter(m => m.id !== id));
      }},
    ]);
  };

  const [viewer, setViewer] = useState<{ urls: string[]; types: ('photo' | 'video')[]; index: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const openViewer = (urls: string[], startIndex: number, types?: ('photo' | 'video')[]) =>
    setViewer({ urls, types: types ?? urls.map(() => 'photo'), index: startIndex });

  const handleSave = async () => {
    if (!viewer) return;
    setSaving(true);
    try {
      const activeType = viewer.types[viewer.index] ?? 'photo';
      const result = await saveMediaToDevice(viewer.urls[viewer.index], activeType);
      if (result === 'saved') Alert.alert('Saved', `${activeType === 'video' ? 'Video' : 'Photo'} saved to your library.`);
    } catch (e: any) {
      Alert.alert('Couldn\'t save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <View style={{ alignItems: 'center', marginVertical: 40 }}>
      <CubeSpinner size={28} />
    </View>
  );

  return (
    <>
      {memories.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <EmptyState Icon={ImageIcon} label="Post your first family memory" colors={colors} />
        </View>
      ) : (
        <View>
          {memories.map(mem => (
            <MemoryPostCard key={mem.id} mem={mem} myId={myId}
              poster={members.find(m => m.id === mem.created_by)} allMembers={members} siblings={members.map(m => m.name)}
              colors={colors} isDark={isDark}
              onHeart={() => heartMemory(mem)} onDelete={() => deleteMemory(mem.id)}
              onOpenViewer={openViewer} />
          ))}
        </View>
      )}

      <ComposeMemoryModal visible={showModal} onClose={() => setShowModal(false)}
        onPost={postMemory} members={members} myId={myId} colors={colors} isDark={isDark} />

      {/* Fullscreen viewer with save-to-device */}
      {viewer && (
        <>
          <MediaViewer visible mediaType={viewer.types[viewer.index] ?? 'photo'} uri={viewer.urls[viewer.index]}
            urls={viewer.urls.length > 1 ? viewer.urls : undefined} startIndex={viewer.index}
            onClose={() => setViewer(null)} />
          <TouchableOpacity onPress={handleSave} disabled={saving}
            style={{ position: 'absolute', bottom: 50, alignSelf: 'center', zIndex: 100,
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12 }}>
            {saving ? <CubeSpinner size={16} /> : <Download size={16} color="#fff" />}
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
              {saving ? 'Saving…' : 'Save to Photos'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

const md = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '80%', overflow: 'hidden' },
  handle:    { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title:     { fontSize: 18, fontWeight: '900' },
  label:     { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  inp:       { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 10,
               fontSize: 14, fontWeight: '600' },
  pickBtn:   { flex: 1, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
               gap: 6, paddingVertical: 20 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  saveBtn:   { flex: 2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});
