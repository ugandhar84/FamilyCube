/**
 * MemoriesTab — private family photo feed. Post up to 2 photos + a caption;
 * multi-photo posts render as a swipeable carousel (MemoryMedia — capped
 * height, cropped to fill, unlike the social feed's PostMedia which sizes
 * to the source photo's own aspect ratio) with dot indicators. Not a public
 * social feed — no comments-from-strangers, no discovery, just the family's
 * own scrapbook. Seniors get read-only access (readOnly prop).
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image as RNImage, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform, Keyboard, Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Image as ImageIcon, Heart, Trash2, Calendar, Camera, ImagePlus, X, Download, Layers } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { todayLocal, fmtDateShort } from '@/lib/dates';
import { supabase, uploadFamilyMemoryPhoto } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useUIStore } from '@/store/uiStore';
import { MediaViewer } from '@/components/MediaComponents';
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

// ─── MemoryMedia — capped-height photo/carousel for the feed card ─────────────
function MemoryMedia({ urls, captionOverlay, caption, onPress }: {
  urls: string[]; captionOverlay: boolean; caption: string | null;
  onPress: (index: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const slideW = SCREEN_W - 32; // matches the card's own 16px side margins

  const onScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideW);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  return (
    <View style={{ width: slideW, height: MEDIA_HEIGHT, backgroundColor: '#00000010' }}>
      {urls.length > 1 ? (
        <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onScroll={onScroll} scrollEventThrottle={16} style={{ flex: 1 }}>
          {urls.map((u, i) => (
            <TouchableOpacity key={u + i} activeOpacity={0.95} onPress={() => onPress(i)} style={{ width: slideW, height: MEDIA_HEIGHT }}>
              <ExpoImage source={{ uri: u }} style={{ width: slideW, height: MEDIA_HEIGHT }}
                contentFit="cover" cachePolicy="memory-disk" transition={180} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <TouchableOpacity activeOpacity={0.95} onPress={() => onPress(0)} style={{ width: slideW, height: MEDIA_HEIGHT }}>
          <ExpoImage source={{ uri: urls[0] }} style={{ width: slideW, height: MEDIA_HEIGHT }}
            contentFit="cover" cachePolicy="memory-disk" transition={180} />
        </TouchableOpacity>
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
}

interface Memory {
  id: string; family_id: string; title: string; description: string | null;
  date: string; photo_url: string | null; photo_urls: string[] | null;
  caption_overlay: boolean;
  hearts: number; hearted_by: string[]; created_by: string | null;
}

// ─── Compose sheet — pick up to 2 photos + a caption ───────────────────────────

function ComposeMemoryModal({ visible, onClose, onPost, colors, isDark }: {
  visible: boolean; onClose: () => void;
  onPost: (uris: string[], caption: string, captionOverlay: boolean) => Promise<void>;
  colors: any; isDark: boolean;
}) {
  const [uris, setUris]       = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [captionOverlay, setCaptionOverlay] = useState(false);
  const [posting, setPosting] = useState(false);

  const reset = () => { setUris([]); setCaption(''); setCaptionOverlay(false); };

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
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setUris(prev => [...prev, res.assets[0].uri].slice(0, 2));
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to take a photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: true, aspect: [4, 3] });
    if (res.canceled || !res.assets?.[0]) return;
    setUris(prev => [...prev, res.assets[0].uri].slice(0, 2));
  };

  const removeAt = (i: number) => setUris(prev => prev.filter((_, idx) => idx !== i));

  const handlePost = async () => {
    if (uris.length === 0) return;
    console.log('[ComposeMemoryModal] handlePost tapped, uris:', uris, 'caption:', caption);
    setPosting(true);
    try {
      await onPost(uris, caption.trim(), captionOverlay);
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
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(80);

  // Static-height sheet (fixed maxHeight %, no content-driven measurement) —
  // same pattern as TeenTileSheet/EventFormModal, which don't get shoved
  // upward past their cap when the keyboard opens the way AppBottomSheet's
  // dynamically-measured height does.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={md.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={[md.sheet, { backgroundColor: isDark ? colors.card : colors.accentLight, maxHeight: keyboardAwareMaxHeight ?? '80%' }]}>
            <View style={[md.handle, { backgroundColor: colors.border }]} />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[md.title, { color: colors.textPrimary, flex: 1 }]}>New Memory</Text>
              <TouchableOpacity onPress={dismiss} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: colors.surface }}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 16, paddingBottom: 12 }}>
              {/* Photo previews */}
              {uris.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {uris.map((u, i) => (
                    <View key={u + i} style={{ position: 'relative' }}>
                      <RNImage source={{ uri: u }} style={{ width: 100, height: 100, borderRadius: 14 }} />
                      <TouchableOpacity onPress={() => removeAt(i)}
                        style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
                          backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                        <X size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Photo pickers */}
              {uris.length < 2 && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={pickFromLibrary}
                    style={[md.pickBtn, { borderColor: colors.accent + '50', backgroundColor: colors.accent + '10' }]}>
                    <ImagePlus size={20} color={colors.accent} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent }}>
                      {uris.length === 0 ? 'Choose Photo' : 'Add Another'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={takePhoto}
                    style={[md.pickBtn, { borderColor: colors.border, backgroundColor: isDark ? colors.card : colors.surface }]}>
                    <Camera size={20} color={colors.textSecondary} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary }}>Take Photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View>
                <Text style={[md.label, { color: colors.textSecondary }]}>Caption</Text>
                <TextInput value={caption} onChangeText={setCaption}
                  placeholder="What made this moment special?" placeholderTextColor={colors.textTertiary}
                  style={[md.inp, { backgroundColor: isDark ? colors.card : colors.surface, borderColor: colors.border, color: colors.textPrimary, height: 80 }]}
                  multiline textAlignVertical="top" />
              </View>

              {caption.trim() && uris.length > 0 && (
                <TouchableOpacity onPress={() => setCaptionOverlay(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
                    borderColor: captionOverlay ? colors.accent : colors.border,
                    backgroundColor: captionOverlay ? colors.accent + '10' : 'transparent',
                    paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Layers size={16} color={captionOverlay ? colors.accent : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: captionOverlay ? colors.accent : colors.textPrimary }}>
                      Show caption on photo
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>
                      {captionOverlay ? 'Caption overlays the photo' : 'Caption shows below the photo'}
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

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={dismiss} style={[md.cancelBtn, { borderColor: colors.border }]}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePost}
                  style={[md.saveBtn, { backgroundColor: colors.accent, opacity: uris.length === 0 ? 0.5 : 1 }]}
                  disabled={posting || uris.length === 0}>
                  {posting
                    ? <CubeSpinner size={18} />
                    : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Post Memory</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Feed card — Instagram-style: header, full-bleed photo, actions, caption ───

function MemoryPostCard({ mem, myId, poster, allMembers, siblings, colors, isDark, onHeart, onDelete, onOpenViewer }: {
  mem: Memory; myId: string; poster?: FamilyMember; allMembers: FamilyMember[]; siblings: string[]; colors: any; isDark: boolean;
  onHeart: () => void; onDelete: () => void;
  onOpenViewer: (urls: string[], startIndex: number) => void;
}) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
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

  // Same suppression rule as the social feed's PostCard: when the caption
  // is shown as an overlay ON the photo, don't also repeat it below —
  // only show the below-image block when there's no overlay, or the
  // overlay didn't actually have text to show.
  const showBelowCaption = !!mem.description && !mem.caption_overlay;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 16, borderRadius: 22, overflow: 'hidden',
      backgroundColor: colors.card, borderWidth: 1.5, borderColor: posterColor + (isDark ? '35' : '25'),
      shadowColor: posterColor, shadowOpacity: isDark ? 0 : 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3 }}>
      {/* Frosted-glass wash, matching the app's established glass-card pattern
          (VaultScreen tiles / MemberCard / SCard) instead of a plain white
          box — keeps this feeling like part of THIS app, not a generic
          social-media clone. Tinted to the poster's own role color so the
          feed reads as "who posted" at a glance, not one flat accent wash. */}
      <LinearGradient colors={[posterColor + '14', posterColor + '00']}
        start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={14} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.card + (isDark ? 'CC' : 'E6') }]} pointerEvents="none" />
      )}

      {/* Header — avatar + name + date, standing clear of the media below */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
        <FamilyAvatar name={poster?.name ?? 'Family'} emoji={poster?.emoji} avatarUrl={poster?.avatarUrl}
          siblings={siblings} size={38} ringColor={posterColor} ringWidth={1.5} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
            {poster?.name?.split(' ')[0] ?? 'Family'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
            <Calendar size={10} color={colors.textTertiary} />
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtDateShort(mem.date)}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Trash2 size={15} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Photo — capped height (MEDIA_HEIGHT), cropped to fill, clipped to
          the card's own rounded corners */}
      <View style={{ alignItems: 'center' }}>
        <MemoryMedia urls={allUrls} captionOverlay={mem.caption_overlay} caption={mem.description}
          onPress={(index) => onOpenViewer(allUrls, index)} />
      </View>

      {/* Action row — heart toggle + who-hearted (tap the names/avatars to
          see who, mem.hearted_by already stores the member ids). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12 }}>
        <TouchableOpacity onPress={onHeart} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Heart size={22} color={heartColor} fill={hearted ? colors.danger : 'transparent'} />
        </TouchableOpacity>
        {mem.hearts > 0 && (
          <TouchableOpacity
            onPress={() => {
              const names = (mem.hearted_by ?? [])
                .map(id => allMembers.find(m => m.id === id)?.name?.split(' ')[0])
                .filter(Boolean);
              Alert.alert('Hearted by', names.length ? names.join(', ') : `${mem.hearts} ${mem.hearts === 1 ? 'person' : 'people'}`);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row' }}>
              {(mem.hearted_by ?? []).slice(0, 3).map((id, i) => {
                const m = allMembers.find(x => x.id === id);
                if (!m) return null;
                return (
                  <View key={id} style={{ marginLeft: i > 0 ? -8 : 0, borderRadius: 12, borderWidth: 2, borderColor: colors.card }}>
                    <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl}
                      siblings={siblings} size={20} ringColor={colors.danger} ringWidth={1} />
                  </View>
                );
              })}
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>
              {mem.hearts} {mem.hearts === 1 ? 'heart' : 'hearts'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Below-image caption — Instagram style: bold name + text, expandable */}
      {showBelowCaption && (
        <TouchableOpacity activeOpacity={1} onPress={() => setCaptionExpanded(v => !v)}
          style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14 }}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.textPrimary }} numberOfLines={captionExpanded ? 0 : 3}>
            <Text style={{ fontWeight: '800' }}>{poster?.name?.split(' ')[0] ?? 'Family'} </Text>
            {mem.description}
          </Text>
          {!captionExpanded && (mem.description?.length ?? 0) > 90 && (
            <Text style={{ fontSize: 12, color: posterColor, marginTop: 2, fontWeight: '700' }}>more</Text>
          )}
        </TouchableOpacity>
      )}
      {!showBelowCaption && <View style={{ height: 14 }} />}
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

  const postMemory = async (uris: string[], caption: string, captionOverlay: boolean) => {
    const urls = await Promise.all(uris.map((u, i) => uploadFamilyMemoryPhoto(familyId, u, uris.length > 1 ? i : undefined)));
    // No title field in the photo-first compose flow — `title` is NOT NULL
    // at the DB level, so fall back to something reasonable when there's no
    // caption to reuse. `description` is the actual caption text.
    const { data, error } = await supabase.from('family_memories').insert({
      family_id: familyId, created_by: myId,
      title: caption || 'Family memory', description: caption || null,
      date: todayLocal(),
      photo_url: urls[0], photo_urls: urls.length > 1 ? urls : null,
      caption_overlay: captionOverlay,
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

  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const openViewer = (urls: string[], startIndex: number) => setViewer({ urls, index: startIndex });

  const handleSave = async () => {
    if (!viewer) return;
    setSaving(true);
    try {
      const result = await saveMediaToDevice(viewer.urls[viewer.index], 'photo');
      if (result === 'saved') Alert.alert('Saved', 'Photo saved to your library.');
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
        onPost={postMemory} colors={colors} isDark={isDark} />

      {/* Fullscreen viewer with save-to-device */}
      {viewer && (
        <>
          <MediaViewer visible mediaType="photo" uri={viewer.urls[viewer.index]}
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
