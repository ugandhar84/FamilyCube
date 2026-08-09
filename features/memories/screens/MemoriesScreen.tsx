/**
 * MemoriesScreen — photo gallery + milestones for the active pet.
 *
 * Tab: Moments (photo grid, date filter, lightbox, upload)
 * Tab: Milestones (day-count achievements + AI-generated moments)
 *
 * Heavy sub-components live in features/memories/components/:
 *   TimelineEventGroup  — single date group in the photo grid
 *   EmptyState          — zero-state illustration
 *   MilestonesTab       — full milestones tab content
 *   CaptionSheet        — caption input modal before upload
 *   PhotoLightbox       — full-screen photo viewer
 */

import { showAlert } from '@/components/AppAlert';
import PetHeaderChip from '@/components/PetHeaderChip';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, ActivityIndicator, RefreshControl, Modal,
  Animated,
} from 'react-native';
import PawBondLoader from '@/components/PawBondLoader';
import LazyImage from '@/components/LazyImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { saveMediaToDevice } from '@/lib/saveMedia';
import * as ImagePicker from 'expo-image-picker';
import { supabase, uploadPetGalleryPhoto, deletePetGalleryPhotos, GALLERY_DAILY_LIMIT } from '@/lib/supabase';
import { showPickerLoading, hidePickerLoading } from '@/lib/pickerLoading';
import { getAppSettings } from '@/lib/db/appSettings';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { getPermissions, permissionDeniedMsg } from '@/lib/permissions';
import { useTheme } from '@/lib/ThemeContext';
import { todayLocal } from '@/lib/dates';
import { SPACING, TYPO} from '@/constants/theme';
import { format, parseISO, differenceInYears } from 'date-fns';
import { ImagesIcon, FilmIcon, TrophyIcon } from '@/components/ui/FureverIcons';
import { showUpgradeAlert, LIMITS } from '@/lib/subscription';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { usePaywall } from '@/lib/hooks/usePaywall';
import TeaserGate from '@/components/TeaserGate';
import { useActiveLostAlert } from '@/lib/hooks/useActiveLostAlert';
import CalendarFilter, { type DateFilter as CalDateFilter } from '@/components/CalendarFilter';

import TimelineEventGroup from '@/features/memories/components/TimelineEventGroup';
import EmptyState         from '@/features/memories/components/EmptyState';
import MilestonesTab      from '@/features/memories/components/MilestonesTab';
import CaptionSheet       from '@/features/memories/components/CaptionSheet';
import PhotoLightbox      from '@/features/memories/components/PhotoLightbox';
import { makeStyles }     from '@/features/memories/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const { width } = Dimensions.get('window');
const GRID_GAP  = 4;
const THUMB4    = (width - SPACING.lg * 2 - GRID_GAP * 3) / 4;

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', playful: '🎉', tired: '😴', anxious: '😰',
  grumpy: '😾', calm: '😌', excited: '🤩',
};

type Tab = 'moments' | 'milestones';

interface GalleryPhoto {
  id: string; url: string; caption?: string;
  mood_label?: string; taken_at: string;
  source: 'pet_photos' | 'mood_log';
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MemoriesScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef  = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  const { activePetId, pets, petRoles } = usePetStore(
    useShallow(s => ({ activePetId: s.activePetId, pets: s.pets, petRoles: s.petRoles }))
  );
  const perms = getPermissions(activePetId ? (petRoles[activePetId] ?? 'owner') : 'owner');
  const pet   = useMemo(() => pets.find(p => p.id === activePetId) ?? null, [pets, activePetId]);
  const ac    = (pet as any)?.accent_color ?? colors.primary;
  const petAge = useMemo(() => {
    if (!pet || !(pet as any).birthday) return null;
    const ageYrs = differenceInYears(new Date(), parseISO((pet as any).birthday));
    return `${ageYrs} yr${ageYrs !== 1 ? 's' : ''}`;
  }, [pet]);

  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab]     = useState<Tab>(params.tab === 'milestones' ? 'milestones' : 'moments');
  const [gallery, setGallery] = useState<GalleryPhoto[]>([]);

  const [photoDateFilter,     setPhotoDateFilter]     = useState<CalDateFilter>(null);
  const [showPhotoDatePicker, setShowPhotoDatePicker] = useState(false);

  const [milestones,          setMilestones]          = useState<any[]>([]);
  const [generatingMilestones, setGeneratingMilestones] = useState(false);
  const [milestoneNextAllowed, setMilestoneNextAllowed] = useState<Date | null>(null);

  const [showFab, setShowFab]   = useState(false);
  const fabAnim     = useRef(new Animated.Value(0)).current;
  const skeletonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fabAnim, { toValue: showFab ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [showFab]);

  useEffect(() => {
    if (!generatingMilestones) { skeletonAnim.stopAnimation(); skeletonAnim.setValue(0); return; }
    Animated.loop(Animated.sequence([
      Animated.timing(skeletonAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(skeletonAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [generatingMilestones]);

  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [hasMorePhotos,    setHasMorePhotos]    = useState(false);
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false);
  const photoCursorRef = useRef<string | null>(null);

  const [lightbox,      setLightbox]      = useState<GalleryPhoto | null>(null);
  const [downloading,   setDownloading]   = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [galleryDailyLimit, setGalleryDailyLimit] = useState(GALLERY_DAILY_LIMIT);
  const [userTier,      setUserTier]      = useState<string>('free');
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [deleting,      setDeleting]      = useState(false);
  const selectionMode = selectedIds.size > 0;

  const [pendingAssets,    setPendingAssets]    = useState<ImagePicker.ImagePickerAsset[] | null>(null);
  const [captionInput,     setCaptionInput]     = useState('');
  const [showCaptionSheet, setShowCaptionSheet] = useState(false);

  const videoEnabled   = useFeatureFlag('memories_video_enabled', true);
  const { tier: paywallTier } = usePaywall();
  const activeLostAlert = useActiveLostAlert(activePetId ?? null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!activePetId) { setLoading(false); setRefreshing(false); return; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const [petPhotoRes, msRes, tierRes, limitSettings] = await Promise.all([
        supabase.from('pet_photos').select('id,url,caption,taken_at').eq('pet_id', activePetId).order('taken_at', { ascending: false }).limit(50),
        supabase.from('milestones').select('id,day_count,title,achieved_at,emoji,milestone_type,created_at').eq('pet_id', activePetId).order('achieved_at', { ascending: true }),
        user?.id ? supabase.from('subscriptions').select('tier').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
        getAppSettings(['gallery_daily_limit']),
      ]);
      if (limitSettings['gallery_daily_limit'] !== undefined) setGalleryDailyLimit(limitSettings['gallery_daily_limit'] as number);
      const petPhotos: GalleryPhoto[] = (petPhotoRes.data ?? []).map((r: any) => ({
        id: r.id, url: r.url, caption: r.caption ?? undefined, taken_at: r.taken_at, source: 'pet_photos' as const,
      }));
      if (!isMountedRef.current) return;
      const rows = (petPhotoRes.data ?? []) as any[];
      photoCursorRef.current = rows.length > 0 ? rows[rows.length - 1].taken_at : null;
      setHasMorePhotos(rows.length === 50);
      setGallery(petPhotos);
      const msData = msRes.data ?? [];
      setMilestones(msData);
      const aiRows = msData.filter((m: any) => m.milestone_type === 'ai');
      if (aiRows.length > 0) {
        const latest = aiRows.reduce((a: any, b: any) => a.created_at > b.created_at ? a : b);
        const next = new Date(new Date(latest.created_at).getTime() + 7 * 86_400_000);
        setMilestoneNextAllowed(next > new Date() ? next : null);
      } else {
        setMilestoneNextAllowed(null);
      }
      setUserTier((tierRes as any)?.data?.tier ?? 'free');
    } catch { /* non-fatal */ } finally {
      if (isMountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [activePetId]);

  const loadMorePhotos = useCallback(async () => {
    if (!activePetId || !hasMorePhotos || loadingMorePhotos || !photoCursorRef.current) return;
    setLoadingMorePhotos(true);
    try {
      const { data } = await supabase.from('pet_photos').select('id,url,caption,taken_at')
        .eq('pet_id', activePetId).order('taken_at', { ascending: false })
        .lt('taken_at', photoCursorRef.current!).limit(50);
      const rows = (data ?? []) as any[];
      if (rows.length > 0) photoCursorRef.current = rows[rows.length - 1].taken_at;
      setHasMorePhotos(rows.length === 50);
      const newPhotos: GalleryPhoto[] = rows.map((r: any) => ({
        id: r.id, url: r.url, caption: r.caption ?? undefined, taken_at: r.taken_at, source: 'pet_photos' as const,
      }));
      setGallery(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...newPhotos.filter(p => !seen.has(p.id))];
      });
    } finally { setLoadingMorePhotos(false); }
  }, [activePetId, hasMorePhotos, loadingMorePhotos]);

  const generateAIMilestones = useCallback(async () => {
    if (!activePetId || generatingMilestones || milestoneNextAllowed) return;
    setGeneratingMilestones(true);
    try {
      const res = await supabase.functions.invoke('generate-milestones', { body: { pet_id: activePetId } });
      if (res.error?.message?.includes('quota_exceeded') || (res.data as any)?.error === 'quota_exceeded') {
        const nextAt = (res.data as any)?.next_allowed_at;
        if (nextAt) setMilestoneNextAllowed(new Date(nextAt));
        return;
      }
      if (res.error) throw res.error;
      const { data } = await supabase.from('milestones').select('id,day_count,title,achieved_at,emoji,milestone_type,created_at').eq('pet_id', activePetId).order('achieved_at', { ascending: true });
      const msData = data ?? [];
      setMilestones(msData);
      const aiRows = msData.filter((m: any) => m.milestone_type === 'ai');
      if (aiRows.length > 0) {
        const latest = aiRows.reduce((a: any, b: any) => a.created_at > b.created_at ? a : b);
        setMilestoneNextAllowed(new Date(new Date(latest.created_at).getTime() + 7 * 86_400_000));
      }
    } catch (e: any) {
      console.warn('[Memories] AI milestone generation failed:', e.message);
    } finally { setGeneratingMilestones(false); }
  }, [activePetId, generatingMilestones, milestoneNextAllowed]);

  // ── Upload helpers ────────────────────────────────────────────────────────────

  const checkDailyLimit = useCallback(async (): Promise<number> => {
    if (!activePetId) return 0;
    const today = todayLocal();
    const { count } = await supabase.from('pet_photos').select('id', { count: 'exact', head: true }).eq('pet_id', activePetId).eq('taken_at', today);
    const remaining = Math.max(0, galleryDailyLimit - (count ?? 0));
    if (remaining === 0) showAlert('Daily limit reached', `You can add up to ${galleryDailyLimit} photos per day for ${pet?.name ?? 'this pet'}. Come back tomorrow!`);
    return remaining;
  }, [activePetId, pet?.name, galleryDailyLimit]);

  const existingCaptions = useMemo(() => {
    const seen = new Set<string>();
    return gallery.map(p => p.caption).filter((c): c is string => !!c && !seen.has(c) && seen.add(c) !== undefined).slice(0, 10);
  }, [gallery]);

  const uploadAssets = useCallback(async (assets: ImagePicker.ImagePickerAsset[], caption?: string) => {
    if (!activePetId) return;
    setUploading(true);
    try {
      const today = todayLocal();
      await Promise.all(assets.map(asset =>
        uploadPetGalleryPhoto(activePetId, asset.uri, asset.base64 ?? null, asset.mimeType ?? 'image/jpeg', asset.exif?.DateTimeOriginal?.slice(0, 10) ?? today, caption || undefined)
      ));
      await load();
    } catch (e: any) {
      showAlert('Upload failed', e?.message ?? 'Could not save photos.');
    } finally { setUploading(false); }
  }, [activePetId, load]);

  const openCaptionSheet = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    setPendingAssets(assets); setCaptionInput(''); setShowCaptionSheet(true);
  }, []);

  const submitCaption = useCallback(async (skip = false) => {
    if (!pendingAssets) return;
    setShowCaptionSheet(false);
    await uploadAssets(pendingAssets, skip ? undefined : captionInput.trim());
    setPendingAssets(null);
  }, [pendingAssets, captionInput, uploadAssets]);

  const handleDeleteSelected = useCallback(() => {
    const ids = [...selectedIds];
    showAlert(`Delete ${ids.length} photo${ids.length > 1 ? 's' : ''}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try { await deletePetGalleryPhotos(ids); setSelectedIds(new Set()); await load(); }
        catch (e: any) { showAlert('Delete failed', e?.message ?? 'Please try again.'); }
        finally { setDeleting(false); }
      }},
    ]);
  }, [selectedIds, load]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);

  const handleAddFromGallery = useCallback(async () => {
    if (activeLostAlert) { showAlert('Pet is lost', `Adding memories is paused until ${pet?.name ?? 'your pet'} is found.`); return; }
    try {
    const remaining = await checkDailyLimit();
    if (remaining === 0) return;
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { showAlert('Permission needed', 'Allow photo library access in Settings.'); return; }
      await showPickerLoading();
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.85, base64: true, exif: false });
      hidePickerLoading();
      if (result.canceled || !result.assets.length) return;
      openCaptionSheet(result.assets.slice(0, remaining));
    } catch (e: any) {
      hidePickerLoading();
      if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
        showAlert('Dev build required', 'This feature requires a development build. Run: npx expo run:ios');
      } else { showAlert('Error', e?.message ?? 'Could not open gallery.'); }
    }
  }, [activeLostAlert, pet, checkDailyLimit, openCaptionSheet]);

  const handleTakePhoto = useCallback(async () => {
    if (activeLostAlert) { showAlert('Pet is lost', `Adding memories is paused until ${pet?.name ?? 'your pet'} is found.`); return; }
    try {
    const remaining = await checkDailyLimit();
    if (remaining === 0) return;
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { showAlert('Permission needed', 'Allow camera access in Settings.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, allowsEditing: true, quality: 0.85, base64: true, exif: false });
      if (result.canceled || !result.assets.length) return;
      openCaptionSheet(result.assets);
    } catch (e: any) {
      if (e?.message?.includes('native module') || e?.message?.includes('ExponentImagePicker')) {
        showAlert('Dev build required', 'This feature requires a development build. Run: npx expo run:ios');
      } else { showAlert('Error', e?.message ?? 'Could not open camera.'); }
    }
  }, [activeLostAlert, pet, checkDailyLimit, openCaptionSheet]);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => { load(); }, [load]);

  const mountedRef = useRef(false);
  const lastFetch  = useRef(0);
  useFocusEffect(useCallback(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const now = Date.now();
    if (now - lastFetch.current > 60_000) { lastFetch.current = now; load(); }
  }, [load]));

  // Realtime: reload when a family member adds or deletes a photo or milestone
  useEffect(() => {
    if (!activePetId) return;
    const uid = Date.now();
    const channels = [
      supabase.channel(`memories-photos-${activePetId}-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pet_photos', filter: `pet_id=eq.${activePetId}` },
          () => { lastFetch.current = 0; load(); })
        .subscribe(),
      supabase.channel(`memories-milestones-${activePetId}-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones', filter: `pet_id=eq.${activePetId}` },
          () => { lastFetch.current = 0; load(); })
        .subscribe(),
    ];
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [activePetId, load]);

  useEffect(() => {
    if (params.tab && (['moments', 'milestones'] as Tab[]).includes(params.tab)) setTab(params.tab);
  }, [params.tab]);

  useFocusEffect(useCallback(() => { scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false }); }, []));

  // ── Derived data ─────────────────────────────────────────────────────────────

  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const FREE_MEMORIES_DAYS = 14;

  type EventGroup = { eventLabel: string | null; photos: GalleryPhoto[] };
  type DateGroup  = { dateLabel: string; date: string; events: EventGroup[] };

  const todayStr     = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const yesterdayStr = useMemo(() => format(new Date(Date.now() - 86400000), 'yyyy-MM-dd'), []);

  const { photosByDate, lockedPhotoGroups } = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - FREE_MEMORIES_DAYS);
    const cutoffStr  = format(cutoff, 'yyyy-MM-dd');
    const isFreeTier = paywallTier === 'free';
    const src = photoDateFilter
      ? gallery.filter(p => {
          if (!p.taken_at) return false;
          if (photoDateFilter.type === 'single') return p.taken_at === photoDateFilter.date;
          return p.taken_at >= photoDateFilter.range.start && p.taken_at <= photoDateFilter.range.end;
        })
      : gallery;

    const buildGroups = (photos: GalleryPhoto[]): DateGroup[] => {
      const dateMap: Record<string, DateGroup> = {};
      const dateOrder: string[] = [];
      photos.forEach(p => {
        if (!p.taken_at) return;
        if (!dateMap[p.taken_at]) {
          let dateLabel: string;
          if (p.taken_at === todayStr)          dateLabel = 'Today';
          else if (p.taken_at === yesterdayStr) dateLabel = 'Yesterday';
          else                                  dateLabel = format(parseISO(p.taken_at), 'EEE, MMM d yyyy');
          dateMap[p.taken_at] = { dateLabel, date: p.taken_at, events: [] };
          dateOrder.push(p.taken_at);
        }
        const dg = dateMap[p.taken_at];
        const eKey = p.caption ? p.caption.toLowerCase().trim() : '__none__';
        let eg = dg.events.find(e => (e.eventLabel?.toLowerCase().trim() ?? '__none__') === eKey);
        if (!eg) { eg = { eventLabel: p.caption ?? null, photos: [] }; dg.events.push(eg); }
        eg.photos.push(p);
      });
      return dateOrder.map(d => dateMap[d]);
    };

    const visible = src.filter(p => !isFreeTier || !p.taken_at || p.taken_at >= cutoffStr);
    const locked  = src.filter(p =>  isFreeTier &&  p.taken_at &&  p.taken_at <  cutoffStr);
    return { photosByDate: buildGroups(visible), lockedPhotoGroups: buildGroups(locked) };
  }, [gallery, photoDateFilter, paywallTier, todayStr, yesterdayStr]);

  const allPhotos = useMemo(() => photosByDate.flatMap(g => g.events.flatMap(e => e.photos)), [photosByDate]);
  const lightboxIndex = useMemo(
    () => lightbox ? allPhotos.findIndex(p => p.id === lightbox.id) : -1,
    [allPhotos, lightbox],
  );
  const photoOpacity  = useRef(new Animated.Value(1)).current;

  const navigatePhoto = useCallback((direction: 'next' | 'prev') => {
    const newIndex = direction === 'next' ? lightboxIndex + 1 : lightboxIndex - 1;
    if (newIndex < 0 || newIndex >= allPhotos.length) return;
    Animated.sequence([
      Animated.timing(photoOpacity, { toValue: 0.3, duration: 120, useNativeDriver: true }),
      Animated.timing(photoOpacity, { toValue: 1,   duration: 150, useNativeDriver: true }),
    ]).start();
    setLightbox(allPhotos[newIndex]);
  }, [lightboxIndex, allPhotos, photoOpacity]);

  const handleDownload = async (photo: GalleryPhoto) => {
    setDownloading(true);
    try { await saveMediaToDevice(photo.url, 'photo'); }
    catch (e: any) { showAlert('Could not save photo', e?.message ?? 'Please try again.'); }
    finally { setDownloading(false); }
  };

  const showYIR = useMemo(() => {
    const now = new Date();
    return videoEnabled && now.getMonth() === 11 && now.getDate() >= 25;
  }, [videoEnabled]);

  const TABS = [
    { key: 'moments'    as Tab, label: 'Photos',     Icon: ImagesIcon, count: gallery.length    },
    { key: 'milestones' as Tab, label: 'Milestones', Icon: TrophyIcon, count: milestones.length },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  if (pets.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
            <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 }}>Memories</Text>
          </View>
        </SafeAreaView>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
          <Text style={{ fontSize: 56 }}>📸</Text>
          <Text style={{ fontSize: TYPO.title, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.3 }}>
            No babies yet
          </Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            Add your first pet to start capturing photos, milestones, and precious memories.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/onboarding/add-pet')}
            style={{ marginTop: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Add your first pet →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.safe, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={[s.title, { color: colors.textPrimary }]}>Memories</Text>
              {pet && (
                <Text style={{ fontSize: TYPO.subheading, fontWeight: '600', color: ac, marginTop: 2, letterSpacing: -0.2 }} numberOfLines={1}>
                  {(pet as any).emoji ?? '🐾'}  {pet.name}{petAge ? `  ·  ${petAge}` : ''}
                </Text>
              )}
            </View>
            {pet && <PetHeaderChip pet={pet as any} variant="badge" />}
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        onScroll={({ nativeEvent: { layoutMeasurement, contentOffset, contentSize } }) => {
          const y = contentOffset.y;
          setShowFab(y > 200);
          if (tab === 'moments' && contentSize.height > layoutMeasurement.height &&
              layoutMeasurement.height + y >= contentSize.height - 300) {
            loadMorePhotos();
          }
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} colors={[colors.primary]} />
        }>

        {/* YIR banner (child 0) */}
        <View>
          {showYIR && (
            <TouchableOpacity onPress={() => {
              if (LIMITS[paywallTier as keyof typeof LIMITS]?.videoPostsPerMonth === 0) {
                showUpgradeAlert({ message: 'Upgrade to Pro to create AI highlight videos of your pet.' });
              } else { router.push('/memories/video'); }
            }} activeOpacity={0.9}>
              <LinearGradient
                colors={isDark ? [colors.primaryMid ?? '#5A3A9E', colors.surface ?? '#1A1428'] : [colors.primaryDark ?? '#3D2068', colors.primaryMid ?? '#5A3A9E']}
                style={s.yirBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <View style={[s.yirIconBox, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <FilmIcon color="#fff" size={22} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.yirLabel}>YEAR IN REVIEW</Text>
                  <Text style={s.yirSub}>AI-composed highlights video</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab bar — sticky (child 1) */}
        <View style={{ backgroundColor: colors.background, paddingTop: 4, paddingBottom: 8, paddingLeft: SPACING.lg - 3, paddingRight: SPACING.lg }}>
          <View style={[s.tabSegment, { backgroundColor: colors.card }]}>
            {TABS.map(({ key, label, Icon, count }) => {
              const active = tab === key;
              return (
                <TouchableOpacity key={key} onPress={() => setTab(key)}
                  style={[s.tabSegmentItem, active && { backgroundColor: ac, shadowColor: ac, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }]}>
                  <Icon color={active ? '#fff' : colors.textSecondary} size={14} strokeWidth={active ? 2.4 : 1.8} />
                  <Text style={[s.tabText, { color: active ? '#fff' : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>{label}</Text>
                  {count > 0 && (
                    <View style={[s.tabBadge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.border }]}>
                      <Text style={[s.tabBadgeText, { color: active ? '#fff' : colors.textSecondary }]}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Selection toolbar */}
        {selectionMode && (
          <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
            <TouchableOpacity onPress={() => setSelectedIds(new Set())} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>{selectedIds.size} selected</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteSelected} disabled={deleting}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.danger + '20', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 }}>
              {deleting ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={16} color={colors.danger} />}
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.danger }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tab content (child 2) */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
            <PawBondLoader size={48} isDark={isDark} />
          </View>
        ) : (
          <>
            {/* ── Moments tab ── */}
            {tab === 'moments' && (
              <>
                <View style={s.filterBar}>
                  <TouchableOpacity style={[s.filterBtn, { backgroundColor: colors.card, borderColor: photoDateFilter ? colors.primary : colors.border, flex: 1 }]}
                    onPress={() => setShowPhotoDatePicker(true)} activeOpacity={0.75}>
                    <Ionicons name="calendar-outline" size={14} color={photoDateFilter ? colors.primary : colors.textSecondary} />
                    <Text style={[s.filterBtnText, { color: photoDateFilter ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
                      {!photoDateFilter
                        ? 'Filter by date'
                        : photoDateFilter.type === 'single'
                          ? format(parseISO(photoDateFilter.date), 'MMM d, yyyy')
                          : `${format(parseISO(photoDateFilter.range.start), 'MMM d')} – ${format(parseISO(photoDateFilter.range.end), 'MMM d, yyyy')}`
                      }
                    </Text>
                  </TouchableOpacity>
                  {photoDateFilter && (
                    <TouchableOpacity style={s.filterClear} onPress={() => setPhotoDateFilter(null)}>
                      <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>

                {photosByDate.length === 0 && lockedPhotoGroups.length === 0 && (
                  <EmptyState Icon={ImagesIcon}
                    title={photoDateFilter ? 'No photos in this range' : 'No photos yet'}
                    sub={photoDateFilter ? 'Try a different date or clear the filter' : "Tap 'Add photos from gallery' above or capture a mood photo"}
                    colors={colors} isDark={isDark} />
                )}

                {photosByDate.map(({ dateLabel, date, events }) => (
                  <View key={date} style={{ marginBottom: 24 }}>
                    <View style={s.monthRow}>
                      <Text style={[s.monthLabel, { color: colors.textSecondary }]}>{dateLabel}</Text>
                      <Text style={[s.monthCount, { color: colors.textSecondary ?? colors.textSecondary }]}>
                        {events.reduce((n, e) => n + e.photos.length, 0)} photo{events.reduce((n, e) => n + e.photos.length, 0) !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {events.map((eg, ei) => (
                      <TimelineEventGroup key={eg.eventLabel ?? '__none__'} eg={eg} isLast={ei === events.length - 1}
                        colors={colors} GRID_GAP={GRID_GAP} THUMB4={THUMB4}
                        onOpen={setLightbox} MOOD_EMOJI={MOOD_EMOJI}
                        s={s} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                    ))}
                  </View>
                ))}

                {lockedPhotoGroups.length > 0 && (
                  <TeaserGate locked minHeight={220}
                    headline={`${pet?.name ?? 'Your pet'}'s older memories are waiting`}
                    body={`You have ${lockedPhotoGroups.reduce((n, g) => n + g.events.reduce((m, e) => m + e.photos.length, 0), 0)} photos from more than 14 days ago. Upgrade to Pro to relive every moment.`}
                    ctaLabel="Unlock Full Memory Gallery" petName={pet?.name}
                    perks={['Full photo & mood history — unlimited', 'All milestone memories', 'Unlimited posts & videos', 'Up to 5 pets', 'Family & caretaker sharing']}>
                    {lockedPhotoGroups.slice(0, 3).map(({ dateLabel, date, events }) => (
                      <View key={date} style={{ marginBottom: 20 }}>
                        <View style={s.monthRow}>
                          <Text style={[s.monthLabel, { color: colors.textSecondary }]}>{dateLabel}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
                          {events.flatMap(e => e.photos).slice(0, 8).map(p => (
                            <View key={p.id} style={{ width: THUMB4, height: THUMB4, borderRadius: 8, overflow: 'hidden' }}>
                              <LazyImage uri={p.url} style={s.thumbImg} resizeMode="cover" />
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </TeaserGate>
                )}
              </>
            )}

            {tab === 'moments' && loadingMorePhotos && (
              <ActivityIndicator color={colors.primaryText ?? colors.primary} size="small" style={{ marginVertical: 16 }} />
            )}

            {/* ── Milestones tab ── */}
            {tab === 'milestones' && (
              <MilestonesTab
                pet={pet} milestones={milestones} gallery={gallery}
                generatingMilestones={generatingMilestones}
                milestoneNextAllowed={milestoneNextAllowed}
                skeletonAnim={skeletonAnim} colors={colors}
                userTier={userTier} activePetId={activePetId ?? ''}
                onGenerateAI={generateAIMilestones}
                onNavigateTimeline={() => {
                  if (userTier !== 'free') router.push(`/pet-timeline/${activePetId}`);
                  else showUpgradeAlert({ message: `Upgrade to Pro to generate an AI year-in-review timeline for ${pet?.name}.` });
                }}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* FAB */}
      {tab === 'moments' ? (
        <Animated.View style={[s.fab, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={[s.fabBtn, { width: 56, height: 56, borderRadius: 28, backgroundColor: ac }]}
            onPress={() => {
              if (showFab) { scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: true }); return; }
              if (activeLostAlert) { showAlert('Pet is lost', `Adding memories is paused until ${pet?.name ?? 'your pet'} is found.`); return; }
              if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('upload photos')); return; }
              showAlert('Add Photo', 'Choose a source', [
                { text: 'Camera',  onPress: handleTakePhoto     },
                { text: 'Gallery', onPress: handleAddFromGallery },
                { text: 'Cancel',  style: 'cancel'              },
              ]);
            }} activeOpacity={0.85}>
            {showFab ? <Ionicons name="chevron-up" size={24} color="#fff" /> : <Ionicons name="camera" size={22} color="#fff" />}
          </TouchableOpacity>
        </Animated.View>
      ) : showFab ? (
        <Animated.View pointerEvents="auto"
          style={[s.fab, { bottom: insets.bottom + 16, opacity: fabAnim, transform: [{ scale: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
          <TouchableOpacity style={[s.fabBtn, { width: 56, height: 56, borderRadius: 28, backgroundColor: ac }]}
            onPress={() => scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: true })} activeOpacity={0.85}>
            <Ionicons name="chevron-up" size={24} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* Caption sheet */}
      <CaptionSheet
        visible={showCaptionSheet}
        pendingAssets={pendingAssets}
        captionInput={captionInput}
        existingCaptions={existingCaptions}
        colors={colors}
        onChangeCaption={setCaptionInput}
        onSubmit={submitCaption}
      />

      {/* Date range picker modal */}
      <Modal visible={showPhotoDatePicker} transparent animationType="none" onRequestClose={() => setShowPhotoDatePicker(false)}>
        <TouchableOpacity style={s.dpOverlay} activeOpacity={1} onPress={() => setShowPhotoDatePicker(false)}>
          <View style={[s.dpCard, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8 }}>
              <Text style={[s.dpTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Filter by date</Text>
              <TouchableOpacity onPress={() => setShowPhotoDatePicker(false)}
                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <CalendarFilter
              dots={[{ key: 'photos', dates: gallery.map(p => p.taken_at).filter(Boolean) as string[], color: pet?.accent_color ?? colors.primary }]}
              filter={photoDateFilter}
              onFilter={(f) => { setPhotoDateFilter(f); if (f?.type === 'single' || (f?.type === 'range' && f.range.start !== f.range.end)) setShowPhotoDatePicker(false); }}
              accent={pet?.accent_color ?? colors.primary}
              initialExpanded
              noCard
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Photo lightbox */}
      <PhotoLightbox
        lightbox={lightbox}
        lightboxIndex={lightboxIndex}
        totalPhotos={allPhotos.length}
        photoOpacity={photoOpacity}
        downloading={downloading}
        insetTop={insets.top}
        insetBottom={insets.bottom}
        onClose={() => setLightbox(null)}
        onNavigate={navigatePhoto}
        onDownload={(photo) => { handleDownload(photo as any); }}
      />
    </View>
  );
}
