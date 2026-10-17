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
import { Image as ImageIcon, Heart, Trash2, Camera, ImagePlus, X, Download, Layers, Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { todayLocal, fmtDateShort } from '@/lib/dates';
import { RADIUS } from '@/constants/theme';
import { GEMINI } from '@/constants/geminiRhythm';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import FullPageOverlay from '@/components/FullPageOverlay';
import { MediaViewer, AutoplayVideo } from '@/components/MediaComponents';
import { saveMediaToDevice } from '@/lib/saveMedia';
import CubeSpinner from '@/components/CubeSpinner';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';
import { EmptyState } from './shared';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { useFamilyMemories, canDeleteMemory, type Memory as FamilyMemory } from './useFamilyMemories';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';

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

// The row shape (and every query/mutation over it) now lives in the shared
// useFamilyMemories hook — see that file's header for why it was lifted
// out of this component.
type Memory = FamilyMemory;

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

/**
 * Exported (it was module-private) so the kiosk Memories tab can mount the
 * SAME composer rather than growing a second one. Kiosk previously reached
 * it indirectly, by flipping useUIStore's openMemoryComposerRequested flag
 * and letting an embedded MemoriesTab react — but kiosk no longer embeds
 * MemoriesTab (it renders its own 2-column KioskMemoryFeed), so there is no
 * longer anything on that side listening for the flag. Exporting is purely
 * additive: nothing about this component changes, and MemoriesTab still
 * renders it exactly as before.
 */
// renderShell lets kiosk swap this bottom sheet for its own right-side
// KioskFormDrawer around the exact same real body/state/logic
// [live-requested: "add memory also should be side form for kiosek"],
// without this mobile-owned file importing any kiosk component (same
// fork-when-needed shape as ProfileSettingsScreen.tsx's NotificationsSheet/
// EditMyProfileSheet). Default (renderShell omitted, as every existing
// mobile call site does) is byte-identical to before this prop existed —
// the header row, backdrop, handle and KeyboardAvoidingView-wrapped Modal
// stay exactly as they were.
export function ComposeMemoryModal({ visible, onClose, onPost, members, myId, colors, isDark, renderShell }: {
  visible: boolean; onClose: () => void;
  onPost: (media: ComposedMedia[], caption: string, captionOverlay: boolean, taggedMemberIds: string[], tag: string | null) => Promise<void>;
  members: FamilyMember[]; myId: string;
  colors: any; isDark: boolean;
  renderShell?: (visible: boolean, onClose: () => void, children: React.ReactNode) => React.ReactNode;
}) {
  // Mixed photo/video slots, index 0 is always the hero. Was a bare
  // string[] (photo URIs only) — a typed slot per item so the keepsake
  // card and filmstrip know whether to render a still or an autoplaying
  // (muted-by-default) video.
  const [media, setMedia] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
  const [caption, setCaption] = useState('');
  const [captionOverlay, setCaptionOverlay] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  // Defaults to just the poster themselves — "who was there" starts
  // pre-filled with an obvious true fact, not empty.
  const [taggedIds, setTaggedIds] = useState<string[]>(myId ? [myId] : []);
  const [occasion, setOccasion]   = useState<string | null>(null);
  // "Custom" occasion chip — lets a moment be tagged outside the preset
  // list (e.g. "Lost tooth") [live-requested: "give the custom memory type
  // option"]. occasion itself stays a free-form string (family_memories.tag
  // was already untyped), so no schema change is needed.
  const [customOccasionActive, setCustomOccasionActive] = useState(false);
  const [customOccasionText, setCustomOccasionText] = useState('');
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  // Starts muted — same default AutoplayVideo uses everywhere else in the
  // app (feed autoplay never opens with sound), tap the speaker to enable.
  const [heroMuted, setHeroMuted] = useState(true);
  // Inline "add media" chooser (Take Photo / Record Video / Choose from
  // Gallery) — replaces the old scattered add buttons (empty hero only
  // offered gallery + a video-only camera shortcut; the filled-hero
  // "Retake" button was photo-camera only; the prints-row "+" was gallery
  // only — none of the three offered all three options) [live-requested:
  // "we should have the video camera or gallary same way for the photo ..
  // we should have an option user to choose inline options"]. One popover,
  // opened from every add entry point.
  const [showMediaOptions, setShowMediaOptions] = useState(false);

  const MAX_VIDEO_SECONDS = 120;

  const reset = () => {
    setPostError(null);
    setMedia([]); setCaption(''); setCaptionOverlay(false);
    setTaggedIds(myId ? [myId] : []); setOccasion(null); setPreviewIdx(null);
    setCustomOccasionActive(false); setCustomOccasionText('');
    setShowMediaOptions(false);
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

  const openMediaOption = (opt: 'photo' | 'video' | 'library') => {
    setShowMediaOptions(false);
    if (opt === 'photo') takePhoto();
    else if (opt === 'video') takeVideo();
    else pickFromLibrary();
  };

  const friendlyPostError = (msg?: string) => {
    const m = (msg ?? '').toLowerCase();
    if (m.includes('row-level security') || m.includes('permission')) return 'You do not have permission to post this memory.';
    if (m.includes('network') || m.includes('fetch') || m.includes('timed out')) return 'No connection. Check the internet and try again. Your photos are still here.';
    if (m.includes('payload') || m.includes('too large') || m.includes('size')) return 'One of the files is too large to upload. Remove it or pick a smaller one.';
    return `Could not post this memory. ${msg ?? 'Please try again.'}`;
  };
  const handlePost = async () => {
    setPostError(null);
    if (media.length === 0) { setPostError('Add at least one photo or video to keep this memory.'); return; }
    console.log('[ComposeMemoryModal] handlePost tapped, media:', media, 'caption:', caption);
    setPosting(true);
    try {
      await onPost(media, caption.trim(), captionOverlay, taggedIds, occasion);
      console.log('[ComposeMemoryModal] onPost resolved ok, closing composer. media was:', media);
      reset();
      onClose();
    } catch (e: any) {
      console.error('[ComposeMemoryModal] ❌ post failed:', e?.message, e);
      setPostError(friendlyPostError(e?.message));
    } finally {
      setPosting(false);
    }
  };

  const dismiss = () => { Keyboard.dismiss(); reset(); onClose(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(88);
  const composerInsets = useSafeAreaInsets();
  const hero = media[0] ?? null;
  const rest = media.slice(1);

  // Static-height sheet (fixed maxHeight %, no content-driven measurement) —
  // same pattern as TeenTileSheet/EventFormModal, which don't get shoved
  // upward past their cap when the keyboard opens the way AppBottomSheet's
  // dynamically-measured height does.
  //
  // Mobile-only title row — NOT part of `fieldsBody` below, since
  // KioskFormDrawer's own shell already renders a title/subtitle/close
  // header (KioskFormDrawer's `title`/`Icon` props, wired at the kiosk call
  // site). Passing this row into renderShell too would stack two headers.
  const mobileHeader = (
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
  );

  // `fieldsBody` is the real form content — every real field, picker call
  // and the sticky footer — extracted so a caller's renderShell can wrap it
  // in a different chrome (kiosk's full-height KioskFormDrawer, which
  // supplies its own header/close/scroll) while the JSX inside stays byte-
  // identical to what mobile renders in its own ScrollView below. Same
  // reuse-logic-not-fork pattern as ProfileSettingsScreen.tsx's
  // NotificationsSheetBody.
  const fieldsBody = (
    <>
      <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 8 }}>

              {/* ── Hero photo field card — Gemini-rhythm straight-edge
                  card (white bg, real border/shadow) instead of the old
                  tilted amber "keepsake" card, matching
                  CreateScheduleScreen.tsx's field-card language. ── */}
              <View style={withAndroidShadowFix({
                backgroundColor: isDark ? colors.card : GEMINI.cardBg,
                borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
                borderRadius: RADIUS.lg, padding: 14,
                paddingBottom: 18, marginBottom: rest.length ? 6 : 22,
                ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) })}>
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
                    <TouchableOpacity onPress={() => setShowMediaOptions(true)}
                      style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(14,12,19,0.65)',
                        flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
                      <Camera size={12} color="#fff" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Replace</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 3, overflow: 'hidden',
                    backgroundColor: isDark ? '#2b2436' : colors.border + '40' }}>
                    <TouchableOpacity onPress={() => setShowMediaOptions(true)}
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10,
                        borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 3 }}>
                      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary + '20',
                        alignItems: 'center', justifyContent: 'center' }}>
                        <ImagePlus size={20} color={colors.primary} />
                      </View>
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.textTertiary }}>Tap to add a photo or video</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Inline add-media chooser — same three options (camera
                    photo, camera video, gallery) no matter which entry
                    point opened it. */}
                {showMediaOptions && (
                  <View style={{ marginTop: 12, borderRadius: RADIUS.md, borderWidth: 1,
                    borderColor: isDark ? colors.border : GEMINI.border,
                    backgroundColor: isDark ? colors.card : GEMINI.cardBg, overflow: 'hidden' }}>
                    {([
                      { key: 'photo', icon: <Camera size={16} color={colors.primary} />, label: 'Take a photo' },
                      { key: 'video', icon: <Text style={{ fontSize: 15 }}>🎥</Text>, label: 'Record a video' },
                      { key: 'library', icon: <ImagePlus size={16} color={colors.primary} />, label: 'Choose from gallery' },
                    ] as const).map((opt, i) => (
                      <TouchableOpacity key={opt.key} onPress={() => openMediaOption(opt.key)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingHorizontal: 14, paddingVertical: 13,
                          borderTopWidth: i === 0 ? 0 : 1,
                          borderTopColor: isDark ? colors.border : GEMINI.border }}>
                        {opt.icon}
                        <Text style={{ fontSize: 13.5, fontWeight: '600', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={() => setShowMediaOptions(false)}
                      style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1,
                        borderTopColor: isDark ? colors.border : GEMINI.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textTertiary }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TextInput value={caption} onChangeText={setCaption}
                  placeholder="Write what made this moment worth keeping…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  style={{ fontSize: 15, fontWeight: '600',
                    lineHeight: 21, color: isDark ? colors.textPrimary : GEMINI.titleColor, marginTop: 14, minHeight: 26, padding: 0 }} />
                <View style={{ height: 1, marginTop: 8, backgroundColor: isDark ? colors.border : GEMINI.border }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginTop: 10 }}>
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
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? colors.textTertiary : GEMINI.bodyColorLight }}>
                        {rest.length} more from the same {rest.length === 1 ? 'shot' : 'afternoon'}
                      </Text>
                    </View>
                  )}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 14, paddingHorizontal: 6, paddingVertical: 8 }}>
                    {rest.map((m, i) => (
                      <TouchableOpacity key={m.uri + i} onPress={() => promoteToHero(i + 1)}
                        style={{ width: 84, height: 84, borderRadius: RADIUS.sm, backgroundColor: isDark ? colors.card : GEMINI.surface,
                          padding: 5, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
                          ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
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
                      <TouchableOpacity onPress={() => setShowMediaOptions(true)}
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

              {/* ── Who was there — name pills instead of avatar circles
                  [live-requested: "change the ppl to the name pills instead
                  of the avatars"]. Unselected members stay visible, just
                  dimmed, so presence reads as optional rather than a roll
                  call. ── */}
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
                color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginBottom: 10 }}>Who was there</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 22 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {members.map(m => {
                    const sel = taggedIds.includes(m.id);
                    return (
                      <TouchableOpacity key={m.id} onPress={() => toggleTag(m.id)}
                        style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                          borderColor: sel ? colors.amber : (isDark ? colors.border : GEMINI.border),
                          backgroundColor: sel ? colors.amber + '18' : 'transparent' }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: sel ? colors.amber : (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
                          {m.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* ── Occasion — quiet categorization, not hashtags. A
                  "Custom" chip reveals a free-text field so an occasion
                  outside the presets (e.g. "Lost tooth") can still be
                  tagged [live-requested: "give the custom memory type
                  option"]. ── */}
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
                color: isDark ? colors.textTertiary : GEMINI.bodyColorLight, marginBottom: 10 }}>What kind of moment</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {OCCASIONS.map(o => {
                    const sel = occasion === o.key;
                    return (
                      <TouchableOpacity key={o.key} onPress={() => { setOccasion(sel ? null : o.key); setCustomOccasionActive(false); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8,
                          borderRadius: 999, borderWidth: 1.5,
                          borderColor: sel ? colors.pink : (isDark ? colors.border : GEMINI.border),
                          backgroundColor: sel ? colors.pink + '18' : 'transparent' }}>
                        <Text style={{ fontSize: 13 }}>{o.emoji}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? colors.pink : (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity onPress={() => { setCustomOccasionActive(true); setOccasion(customOccasionText.trim() || null); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8,
                      borderRadius: 999, borderWidth: 1.5,
                      borderColor: customOccasionActive ? colors.pink : (isDark ? colors.border : GEMINI.border),
                      backgroundColor: customOccasionActive ? colors.pink + '18' : 'transparent' }}>
                    <Text style={{ fontSize: 13 }}>✏️</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: customOccasionActive ? colors.pink : (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>
                      Custom
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              {customOccasionActive && (
                <TextInput
                  value={customOccasionText}
                  onChangeText={(t) => { setCustomOccasionText(t); setOccasion(t.trim() || null); }}
                  placeholder="Name this kind of moment…"
                  placeholderTextColor={isDark ? colors.textTertiary : GEMINI.bodyColorLight}
                  maxLength={40}
                  style={{ marginTop: 10, fontSize: 13, fontWeight: '600', borderRadius: 12, borderWidth: 1.5,
                    borderColor: isDark ? colors.border : GEMINI.border,
                    color: isDark ? colors.textPrimary : GEMINI.titleColor,
                    paddingHorizontal: 13, paddingVertical: 10 }}
                />
              )}
            </ScrollView>

            {/* Sticky footer — was inside the ScrollView, could scroll out
                of view once who-was-there/occasion pushed content taller. */}
            {!!postError && (
              <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginHorizontal: 20, marginBottom: 4, borderRadius: 14, padding: 14,
                backgroundColor: isDark ? colors.danger + '22' : '#FFE8E3', borderWidth: 1.5, borderColor: colors.danger }}>
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 20, color: colors.danger }}>{postError}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, padding: 20, paddingTop: 14,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDark ? colors.border : GEMINI.border,
              backgroundColor: isDark ? colors.background : GEMINI.canvas }}>
              <TouchableOpacity onPress={dismiss}
                style={{ flex: 0.85, borderRadius: 16, borderWidth: 1.5, borderColor: isDark ? colors.border : GEMINI.border,
                  alignItems: 'center', justifyContent: 'center', paddingVertical: 15 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? colors.textSecondary : GEMINI.bodyColor }}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePost}
                style={{ flex: 2, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 15,
                  backgroundColor: GEMINI.blue, opacity: posting ? 0.5 : 1 }}
                disabled={posting}>
                {posting
                  ? <CubeSpinner size={18} />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Keep this memory</Text>}
              </TouchableOpacity>
            </View>
    </>
  );

  const previewer = previewIdx !== null && media[previewIdx] && (
    <MediaViewer visible mediaType={media[previewIdx].type} uri={media[previewIdx].uri}
      onClose={() => setPreviewIdx(null)} />
  );

  if (renderShell) {
    return (
      <>
        {renderShell(visible, dismiss, fieldsBody)}
        {previewer}
      </>
    );
  }

  // Mobile default shell — a dedicated full-page overlay in the Gemini
  // rhythm (same FullPageOverlay + literal-hex shell as
  // school/CreateScheduleScreen.tsx), replacing the old bottom-sheet
  // Modal [live-requested: "open a dedicated overlay page to create the
  // post... see the previous create post, and adapt to the figma
  // rhythm"]. fieldsBody itself (every real field + the sticky footer) is
  // untouched — only the chrome around it changed.
  return (
    <>
      <FullPageOverlay visible={visible} onDismiss={dismiss} zIndex={60}>
        {(requestAnimatedClose) => (
          <View style={{ flex: 1, backgroundColor: isDark ? colors.background : GEMINI.canvas }}>
            <View style={{ paddingTop: composerInsets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
              <TouchableOpacity onPress={requestAnimatedClose} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <Text style={{ fontSize: 29, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor, lineHeight: 36 }}>
                  Tuck away a memory
                </Text>
              </TouchableOpacity>
              <View style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5,
                borderRadius: 8, backgroundColor: isDark ? colors.surface : GEMINI.surface }}>
                <Text style={{ fontSize: 12, color: isDark ? colors.primary : GEMINI.linkBlue, fontWeight: '600' }}>
                  for the family album
                </Text>
              </View>
            </View>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              {fieldsBody}
            </KeyboardAvoidingView>
          </View>
        )}
      </FullPageOverlay>
      {previewer}
    </>
  );
}

// ─── Feed card — keepsake style: tilted photo/video card, note-style
// caption, who-was-there + occasion, matching the composer's own header
// treatment ───

function MemoryPostCard({ mem, myId, poster, allMembers, siblings, colors, isDark, highlighted, onHeart, onDelete, onOpenViewer }: {
  mem: Memory; myId: string; poster?: FamilyMember; allMembers: FamilyMember[]; siblings: string[]; colors: any; isDark: boolean;
  highlighted?: boolean;
  onHeart: () => void; onDelete: () => void;
  onOpenViewer: (urls: string[], startIndex: number, types?: ('photo' | 'video')[]) => void;
}) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const mediaRef = useRef<MemoryMediaHandle>(null);
  const hearted = mem.hearted_by?.includes(myId);
  // Poster-or-parent only — the identical rule, now shared with the kiosk
  // card via canDeleteMemory so the two cannot drift. See that helper's own
  // note for the bug it fixed.
  const canDelete = canDeleteMemory(mem, myId, allMembers);
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
  // Temporary diagnostic for the still-open "video playback is still not
  // working" bug — confirms whether this card's own media_types actually
  // came back from Supabase as a video, right before AutoplayVideo mounts.
  if (mem.media_types?.some(t => t === 'video')) {
    console.log('[MemoryPostCard] video memory render:', mem.id, 'allUrls:', allUrls, 'media_types:', mem.media_types);
  }

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

  // Album date-stamp — "Saturday, August 29 · 6:42pm", the handwritten-
  // ledger detail from the mock. Weekday+full date comes from mem.date
  // (a plain YYYY-MM-DD, no time); the clock time comes from created_at,
  // the one column that actually has a timestamp — shown only when present
  // rather than fabricating a time the DB never recorded.
  const [dsY, dsM, dsD] = mem.date.split('-').map(Number);
  const dsDate = dsY && dsM && dsD ? new Date(dsY, dsM - 1, dsD) : null;
  const dsDateLabel = dsDate && !isNaN(dsDate.getTime())
    ? dsDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : fmtDateShort(mem.date);
  const dsTimeLabel = mem.created_at
    ? new Date(mem.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
    : null;

  // Title line for the card — the occasion label when tagged ("A
  // milestone"), falling back to a generic "A family moment" otherwise.
  // Matches the mockup's bold non-serif title above the meta line, in
  // place of the old italic-eyebrow+name-date header row.
  const OCCASION_TITLE: Record<string, string> = {
    milestone: 'A milestone', everyday: 'Just an everyday moment',
    celebration: 'A celebration', just_because: 'Just because',
  };
  const cardTitle = mem.tag && OCCASION_TITLE[mem.tag] ? OCCASION_TITLE[mem.tag] : 'A family moment';
  const metaParts = [
    `Added by ${poster?.name?.split(' ')[0] ?? 'Family'}`,
    `${allUrls.length} photo${allUrls.length === 1 ? '' : 's'}`,
    'household only',
  ];
  // Gemini-rhythm card tokens (light mode only) — Memories joined
  // School/Home Care/Rewards/member-profile's named exception to CLAUDE.md
  // rule 6's pure-white default [live-requested: "make the rythem of the
  // gemini and borders and etc", "shads too"]: bright white card against
  // the warm-cream canvas with a real drop shadow (not a flat 1px border),
  // deep forest-slate title/body text. Dark mode is untouched — normal
  // colors.* theme object.
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const cardBorder = isDark ? colors.border : GEMINI.border;
  const titleClr = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyClr = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const metaClr = isDark ? colors.textTertiary : GEMINI.bodyColorLight;

  return (
    // Clean-card style, matching the "Memories" mockup's rhythm: straight-
    // edge card, pill-shaped date badge over the photo, bold title, a
    // "Added by X · N photos · household only" meta line, and a plain
    // (non-serif) caption — replacing the earlier tilted/corner-mounted
    // scrapbook treatment [live-requested full visual redesign, "it is
    // just moments so no tab is required"].
    <View style={{ marginHorizontal: 2, marginBottom: 18 }}>
      <View style={withAndroidShadowFix({ backgroundColor: cardBg, borderRadius: RADIUS.lg, overflow: 'hidden',
        borderWidth: 1, borderColor: cardBorder,
        ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow),
        // Momentary highlight ring when this is the memory a push
        // notification deep-linked to, so the auto-scroll lands somewhere
        // visibly confirmable rather than an unmarked card among many.
        ...(highlighted ? { borderWidth: 2, borderColor: colors.primary } : null) })}>

        {/* Media — capped height, cropped to fill, pill date badge
            floating over the top-left corner (mockup's "Sunday, 4
            October" treatment) instead of a separate header row above
            the photo. */}
        <View style={{ position: 'relative' }}>
          <MemoryMedia ref={mediaRef} urls={allUrls} mediaTypes={mem.media_types} captionOverlay={mem.caption_overlay} caption={mem.description}
            width={SCREEN_W - 32} onIndexChange={setActiveSlide}
            onPress={(index) => onOpenViewer(allUrls, index, allUrls.map((_, i) => typeAtIdx(i)))} />
          <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 12,
            backgroundColor: 'rgba(14,12,19,0.65)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{dsDateLabel}</Text>
          </View>
          {canDelete && (
            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(14,12,19,0.55)',
                borderRadius: 999, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Thumbnail row — only for multi-media memories. Tapping one
            jumps the main carousel above to that slide for a quick
            preview. */}
        {allUrls.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingTop: 10, paddingHorizontal: 14 }}>
            {allUrls.map((u, i) => (
              <TouchableOpacity key={u + i} onPress={() => mediaRef.current?.scrollToIndex(i)}
                style={{ width: 48, height: 48, borderRadius: RADIUS.sm, overflow: 'hidden',
                  borderWidth: activeSlide === i ? 2 : 0, borderColor: colors.primary }}>
                <ExpoImage source={{ uri: u }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
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

        <View style={{ padding: 14 }}>
          {/* Title + meta line — "A milestone" / "Added by Maya · 14
              photos · household only", matching the mockup's bold title
              + light meta-line pairing in place of the old avatar+name
              header row. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <FamilyAvatar name={poster?.name ?? 'Family'} emoji={poster?.emoji} avatarUrl={poster?.avatarUrl}
              siblings={siblings} size={28} ringColor={posterColor} ringWidth={1.5} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: titleClr, letterSpacing: -0.2 }} numberOfLines={1}>
                {cardTitle}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: metaClr, marginTop: 1 }} numberOfLines={1}>
                {metaParts.join(' · ')}
              </Text>
            </View>
          </View>

          {/* Caption — plain (non-serif) body text, not a handwritten-
              style note. */}
          {showBelowCaption && (
            <TouchableOpacity activeOpacity={1} onPress={() => setCaptionExpanded(v => !v)}
              style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', lineHeight: 20, color: bodyClr }}
                numberOfLines={captionExpanded ? 0 : 3}>
                {mem.description}
              </Text>
              {!captionExpanded && (mem.description?.length ?? 0) > 90 && (
                <Text style={{ fontSize: 12, color: posterColor, marginTop: 2, fontWeight: '700' }}>more</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Who was there — name chips instead of avatars [live-requested:
              "the tags we can have the names instead of the avatars"] */}
          {taggedMembers.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {taggedMembers.map(m => (
                <View key={m.id} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: isDark ? colors.amber + '22' : GEMINI.surface,
                  borderWidth: 1, borderColor: isDark ? colors.amber + '44' : GEMINI.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? colors.amber : GEMINI.bodyColor }}>
                    {m.name.split(' ')[0]}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Loved-by — a heart tap and a quiet "N loved this" instead of
              a raw like-button row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
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
                <Text style={{ fontSize: 12, fontWeight: '700', color: metaClr }}>
                  {mem.hearts} loved this
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── MemoriesTab ────────────────────────────────────────────────────────────────

export default function MemoriesTab({ colors, isDark, readOnly = false, focusMemoryId, onFocusMemoryLayout, onLoadMoreReady, onComposerPortal }: {
  colors: any; isDark: boolean; readOnly?: boolean;
  // Tapping a memory_posted/memory_liked push should land on this screen
  // scrolled straight to the memory the alert was about, not just the tab
  // root (live-reported: "go to respective memory auto scroll"). This tab
  // renders inside the SCREEN's own ScrollView (MemoriesScreen.tsx), not
  // its own — so it can't scroll itself; it just reports the matching
  // card's measured Y offset back up via onFocusMemoryLayout, and the
  // screen (which owns the ScrollView ref) does the actual scrollTo.
  focusMemoryId?: string | null;
  onFocusMemoryLayout?: (y: number) => void;
  // Same "screen owns the ScrollView" story as focusMemoryId above — this
  // tab has its own real pagination (loadMore), but only the screen can
  // detect "user scrolled near the bottom" since it owns the actual
  // ScrollView's onScroll. Hands the loadMore function up once so the
  // screen can call it from its own scroll handler.
  onLoadMoreReady?: (fn: () => void) => void;
  // ComposeMemoryModal's default (non-kiosk) shell is a FullPageOverlay,
  // which is position:'absolute' filling its NEAREST parent — rendering it
  // from here, inside the screen's own ScrollView, made it fill just the
  // ScrollView's content area instead of the real screen, so it opened
  // "inline" on the feed instead of as a full-page cover [live-reported:
  // "the Tuckaway memory is opening inline to the Memories landing page"].
  // Same "only the screen can own the right container" story as
  // onFocusMemoryLayout/onLoadMoreReady above — hand the modal's JSX up so
  // MemoriesScreen can render it as a sibling of its ScrollView instead.
  onComposerPortal?: (node: React.ReactNode) => void;
}) {
  const { members } = useFamilyStore();
  // Every piece of family_memories data and mutation this tab used to own
  // inline now lives in useFamilyMemories, so the kiosk's own 2-column
  // feed drives the SAME query, realtime subscription, pagination cursor,
  // heart/post/delete and notification side effects rather than a fork of
  // them. This component's rendering is unchanged — it still owns its own
  // composer-open flag, its MediaViewer state, and MemoryPostCard.
  const {
    memories, loading, loadingMore, myId, loadMore,
    postMemory, heartMemory, deleteMemory,
  } = useFamilyMemories({ focusMemoryId });

  const [showModal, setShowModal] = useState(false);

  // Hands the composer's JSX up to MemoriesScreen so it can be rendered as
  // a sibling of the screen's own ScrollView instead of nested inside it —
  // see onComposerPortal's own comment above for why that nesting broke
  // FullPageOverlay's full-screen cover.
  useEffect(() => {
    onComposerPortal?.(
      <ComposeMemoryModal visible={showModal} onClose={() => setShowModal(false)}
        onPost={postMemory} members={members} myId={myId} colors={colors} isDark={isDark} />
    );
  }, [onComposerPortal, showModal, postMemory, members, myId, colors, isDark]);

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

  // The screen owns the ScrollView, so it's the one that can detect "user
  // scrolled near the bottom" — hand the hook's loadMore up to it, exactly
  // as before the extraction.
  useEffect(() => { onLoadMoreReady?.(loadMore); }, [onLoadMoreReady, loadMore]);

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
      {/* Top-of-feed banner — the composer used to be reachable only
          through the shared FAB's hidden "+" face (openMemoryComposerRequested),
          which left no visible way to start a post from this screen itself
          [live-requested: "where is the create post? ... banner at the top"]. */}
      <TouchableOpacity onPress={() => setShowModal(true)} activeOpacity={0.85}
        style={withAndroidShadowFix({
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          backgroundColor: isDark ? colors.card : GEMINI.cardBg,
          borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
          borderRadius: RADIUS.lg, paddingVertical: 14, marginBottom: 14,
          ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) })}>
        <Plus size={18} color={isDark ? colors.pink : GEMINI.titleColor} />
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>
          Add a photo or a little story
        </Text>
      </TouchableOpacity>

      {memories.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <EmptyState Icon={ImageIcon} label="Post your first family memory" colors={colors} />
        </View>
      ) : (
        <View>
          {memories.map(mem => (
            <View key={mem.id}
              onLayout={mem.id === focusMemoryId ? (e) => onFocusMemoryLayout?.(e.nativeEvent.layout.y) : undefined}>
              <MemoryPostCard mem={mem} myId={myId}
                poster={members.find(m => m.id === mem.created_by)} allMembers={members} siblings={members.map(m => m.name)}
                colors={colors} isDark={isDark} highlighted={mem.id === focusMemoryId}
                onHeart={() => heartMemory(mem)} onDelete={() => deleteMemory(mem.id)}
                onOpenViewer={openViewer} />
            </View>
          ))}
          {loadingMore && (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <CubeSpinner size={22} />
            </View>
          )}
        </View>
      )}

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
