import React, { useState, useEffect, useRef } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, ScrollView, Dimensions, Platform, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { registerVideo, unregisterVideo } from '@/lib/videoVisibility';
import { saveMediaToDevice } from '@/lib/saveMedia';
import LazyImage from '@/components/LazyImage';
import { showAlert } from '@/components/AppAlert';

const MEDIA_RADIUS = 0;

// ── AutoplayVideo ──────────────────────────────────────────────────────────────

function AutoplayVideoBase({ uri, id, globalMuted, onToggleMute, onExpand, onDoubleTap }: {
  uri: string; id: string; globalMuted: boolean; onToggleMute: () => void; onExpand?: () => void; onDoubleTap?: () => void;
}) {
  const player = useVideoPlayer(uri, p => { p.loop = false; p.muted = globalMuted; });
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const viewRef = useRef<View>(null);

  useEffect(() => {
    registerVideo(id, viewRef, setIsVisible);
    return () => unregisterVideo(id);
  }, [id]);

  useEffect(() => {
    if (isVisible) {
      if (player.duration > 0 && player.currentTime >= player.duration - 0.05) {
        player.currentTime = 0;
      }
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, player]);

  useEffect(() => { player.muted = globalMuted; }, [globalMuted, player]);

  useEffect(() => {
    const sub = player.addListener('playingChange', (e: { isPlaying: boolean }) => setIsPlaying(e.isPlaying));
    return () => sub.remove();
  }, [player]);

  const togglePlay = () => {
    if (player.currentTime >= player.duration - 0.05 && player.duration > 0) {
      player.currentTime = 0;
      player.play();
    } else if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const videoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoLastTap  = useRef(0);
  const handleVideoTap = () => {
    const now = Date.now();
    if (videoTapTimer.current && now - videoLastTap.current < 400) {
      clearTimeout(videoTapTimer.current);
      videoTapTimer.current = null;
      onDoubleTap?.();
    } else {
      videoLastTap.current = now;
      videoTapTimer.current = setTimeout(() => {
        videoTapTimer.current = null;
        togglePlay();
      }, 400);
    }
  };

  return (
    <View ref={viewRef} collapsable={false}
      style={{ width: '100%', height: '100%', borderRadius: MEDIA_RADIUS, overflow: 'hidden' }}>
      <VideoView player={player} style={{ width: '100%', height: '100%', borderRadius: MEDIA_RADIUS }}
        contentFit="cover" nativeControls={false} />
      <TouchableOpacity onPress={handleVideoTap} activeOpacity={0.9}
        style={StyleSheet.absoluteFillObject}>
        {!isPlaying && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name={player.currentTime >= player.duration - 0.05 && player.duration > 0 ? 'refresh' : 'play'}
                size={26} color="#fff" style={{ marginLeft: player.currentTime >= player.duration - 0.05 ? 0 : 3 }} />
            </View>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onToggleMute}
        style={{
          position: 'absolute', bottom: 10, right: 10,
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
        }}>
        <Ionicons name={globalMuted ? 'volume-mute' : 'volume-high'} size={17} color="#fff" />
      </TouchableOpacity>
      {onExpand && (
        <TouchableOpacity
          onPress={onExpand}
          style={{
            position: 'absolute', bottom: 10, left: 10,
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
          }}>
          <Ionicons name="expand-outline" size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

export const AutoplayVideo = React.memo(AutoplayVideoBase);

// ── MediaViewer ────────────────────────────────────────────────────────────────

function MediaViewerBase({ visible, mediaType, uri, onClose, urls, startIndex, onDoubleTap }: {
  visible: boolean; mediaType: 'photo' | 'video'; uri: string | null; onClose: () => void;
  urls?: string[]; startIndex?: number; onDoubleTap?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const viewerPlayer = useVideoPlayer(null, p => { p.loop = true; });
  const screenW = Dimensions.get('window').width;
  const multiImages = !!(urls && urls.length > 1);
  const [page, setPage] = useState(startIndex ?? 0);
  const pageScrollRef = useRef<ScrollView>(null);

  const dtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dtLast  = useRef(0);
  const handleSingleTap = () => {
    if (!onDoubleTap) { onClose(); return; }
    const now = Date.now();
    if (dtTimer.current && now - dtLast.current < 400) {
      clearTimeout(dtTimer.current);
      dtTimer.current = null;
      onDoubleTap();
    } else {
      dtLast.current = now;
      dtTimer.current = setTimeout(() => { dtTimer.current = null; onClose(); }, 400);
    }
  };

  useEffect(() => {
    if (visible && mediaType === 'video' && uri) {
      viewerPlayer.replace(uri);
      viewerPlayer.play();
    } else {
      viewerPlayer.pause();
    }
  }, [visible, mediaType, uri]);

  useEffect(() => {
    if (!visible) return;
    const idx = startIndex ?? 0;
    setPage(idx);
    if (multiImages) {
      setTimeout(() => pageScrollRef.current?.scrollTo({ x: idx * screenW, animated: false }), 50);
    }
  }, [visible, startIndex, multiImages, screenW]);

  return (
    <Modal visible={visible} animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {multiImages ? (
          <ScrollView
            ref={pageScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / screenW))}
            style={{ flex: 1 }}>
            {urls!.map((u, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={1}
                onPress={onClose}
                style={{ width: screenW, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: u }} style={{ width: screenW, height: '100%' }}
                  contentFit="contain" cachePolicy="memory-disk" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <TouchableOpacity activeOpacity={1} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onPress={handleSingleTap}>
            {uri && mediaType === 'video' ? (
              <VideoView player={viewerPlayer} style={{ width: '100%', height: '100%' }}
                contentFit="contain" nativeControls />
            ) : uri ? (
              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory-disk" />
            ) : null}
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onClose}
          style={{
            position: 'absolute', top: insets.top + 10, left: 16,
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
          }}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>

        {multiImages && (
          <>
            <View style={{ position: 'absolute', top: insets.top + 10, right: 16,
              backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '600' }}>{page + 1} / {urls!.length}</Text>
            </View>
            <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0,
              flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {urls!.map((_, i) => (
                <View key={i} style={{
                  width: i === page ? 18 : 6, height: 6, borderRadius: 3,
                  backgroundColor: i === page ? '#fff' : 'rgba(255,255,255,0.4)',
                }} />
              ))}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

export const MediaViewer = React.memo(MediaViewerBase);

// ── PhotoGrid — horizontal carousel with dot indicators ───────────────────────

const MIN_ASPECT = 3 / 4;
const MAX_ASPECT = 1.91;
const DEFAULT_ASPECT = 4 / 5;

function PhotoGridBase({ urls, onPress, onDoubleTap }: { urls: string[]; onPress?: (url: string, index: number) => void; onDoubleTap?: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const measured = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const tapTimers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});
  const lastTaps  = useRef<Record<number, number>>({});
  const screenW = Dimensions.get('window').width;
  const slideW = screenW;
  const slideH = slideW / aspect;

  useEffect(() => {
    if (measured.current || !urls[0]) return;
    RNImage.getSize(urls[0], (w, h) => {
      measured.current = true;
      setAspect(Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, w / h)));
    }, () => {});
  }, [urls[0]]);

  const makeTapHandler = (u: string, i: number) => () => {
    if (!onDoubleTap) { onPress?.(u, i); return; }
    const now = Date.now();
    const timer   = tapTimers.current[i] ?? null;
    const lastTap = lastTaps.current[i]  ?? 0;
    if (timer && now - lastTap < 300) {
      clearTimeout(timer);
      tapTimers.current[i] = null;
      onDoubleTap();
    } else {
      lastTaps.current[i]  = now;
      tapTimers.current[i] = setTimeout(() => {
        tapTimers.current[i] = null;
        onPress?.(u, i);
      }, 300);
    }
  };

  const onScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / slideW);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  if (urls.length === 1) {
    return (
      <TouchableOpacity activeOpacity={0.95} onPress={makeTapHandler(urls[0], 0)}
        style={{ overflow: 'hidden', marginBottom: 4 }}>
        <LazyImage uri={urls[0]} style={{ width: '100%', aspectRatio: aspect }} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ width: slideW, height: slideH, backgroundColor: '#000' }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ overflow: 'hidden' }}
        contentContainerStyle={{ gap: 0 }}
      >
        {urls.map((u, i) => (
          <TouchableOpacity
            key={u + i}
            activeOpacity={0.88}
            onPress={makeTapHandler(u, i)}
            style={{ width: slideW, height: slideH, overflow: 'hidden' }}
          >
            <LazyImage uri={u} style={{ width: slideW, height: slideH }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Dots overlaid at bottom of image — same as MediaViewer fullscreen */}
      <View pointerEvents="none" style={{
        position: 'absolute', bottom: 10, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
      }}>
        {urls.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === activeIndex ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.4)',
            }}
          />
        ))}
      </View>
    </View>
  );
}

export const PhotoGrid = React.memo(PhotoGridBase);

// ── PostMedia — canonical single + multi photo renderer ───────────────────────
// Used by BOTH PostCard (feed) and PostDetailCard (detail) so they always match.

import { LinearGradient } from 'expo-linear-gradient';

const { width: PM_SW } = Dimensions.get('window');

interface PostMediaProps {
  photoUrl?: string | null;
  photoUrls?: string[] | null;
  fitFrame?: boolean;
  captionOverlay?: boolean;
  overlayCaption?: string | null;
  caption?: string | null;
  colors: any;
  onPress?: (url: string, index?: number, urls?: string[]) => void;
  onDoubleTap?: () => void;
}

// Single slide — renders one photo at its natural clamped ratio.
// Used for both standalone single-photo posts and each slide in the multi-photo carousel.
function PhotoSlide({
  uri, fitFrame, onTap, width,
}: {
  uri: string; fitFrame?: boolean; onTap: () => void; width: number;
}) {
  const [ratio, setRatio] = useState(1);
  const clampedRatio = Math.min(Math.max(ratio, 3 / 4), 1.91);

  return (
    <TouchableOpacity activeOpacity={0.95} onPress={onTap} style={{ width }}>
      <View style={{ width, aspectRatio: fitFrame ? 1 : clampedRatio, backgroundColor: '#000' }}>
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%', backgroundColor: fitFrame ? '#000' : undefined }}
          contentFit={fitFrame ? 'contain' : 'cover'}
          contentPosition={fitFrame ? 'center' : 'top'}
          cachePolicy="memory-disk"
          transition={180}
          onLoad={(e: any) => {
            const w = e.source?.width ?? e.nativeEvent?.width;
            const h = e.source?.height ?? e.nativeEvent?.height;
            if (w && h) setRatio(w / h);
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

function PostMediaBase({
  photoUrl, photoUrls, fitFrame, captionOverlay, overlayCaption, caption, colors,
  onPress, onDoubleTap,
}: PostMediaProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Shared aspect ratio derived from the first image — all slides use the same height
  const [sharedRatio, setSharedRatio] = useState(4 / 5);
  const measuredRatio = useRef(false);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  const allUrls = photoUrls && photoUrls.length > 1 ? photoUrls : photoUrl ? [photoUrl] : [];

  // Measure first image once to get a consistent container height for all slides
  useEffect(() => {
    if (measuredRatio.current || !allUrls[0]) return;
    RNImage.getSize(allUrls[0], (w, h) => {
      if (w && h) {
        measuredRatio.current = true;
        setSharedRatio(Math.min(Math.max(w / h, 3 / 4), 1.91));
      }
    }, () => {});
  }, [allUrls[0]]);

  if (allUrls.length === 0) return null;

  const makeTapHandler = (url: string, index: number, urls?: string[]) => () => {
    const now = Date.now();
    if (onDoubleTap && singleTapTimer.current && now - lastTap.current < 300) {
      // Second tap within 300ms — cancel the pending open and fire double-tap instead
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
      onDoubleTap();
    } else {
      lastTap.current = now;
      if (onDoubleTap) {
        // Only delay when double-tap-to-like is active — wait to see if second tap comes
        singleTapTimer.current = setTimeout(() => {
          singleTapTimer.current = null;
          onPress?.(url, index, urls);
        }, 300);
      } else {
        // No double-tap handler — open immediately
        onPress?.(url, index, urls);
      }
    }
  };

  const onScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / PM_SW);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  const isMulti = allUrls.length > 1;
  const slideH = PM_SW / sharedRatio;

  return (
    <View style={{ width: PM_SW }}>
      {isMulti ? (
        <View style={{ width: PM_SW, height: slideH, backgroundColor: '#000' }}>
          <ScrollView
            horizontal pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll} scrollEventThrottle={16}
            style={{ flex: 1 }}
          >
            {allUrls.map((u, i) => (
              <TouchableOpacity
                key={u + i}
                activeOpacity={0.95}
                onPress={makeTapHandler(u, i, allUrls)}
                style={{ width: PM_SW, height: slideH }}
              >
                <Image
                  source={{ uri: u }}
                  style={{ width: PM_SW, height: slideH }}
                  contentFit={fitFrame ? 'contain' : 'cover'}
                  contentPosition="center"
                  cachePolicy="memory-disk"
                  transition={180}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Caption overlay inside the image container so bottom:0 anchors correctly */}
          {!!captionOverlay && !!(overlayCaption || caption) && activeIndex === 0 && (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 64, paddingBottom: 36, paddingHorizontal: 16 }}
              pointerEvents="none">
              <Text style={{ color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '600', letterSpacing: 0.1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }} numberOfLines={4}>
                {overlayCaption || caption}
              </Text>
            </LinearGradient>
          )}
        </View>
      ) : (
        <PhotoSlide uri={allUrls[0]} fitFrame={fitFrame} width={PM_SW}
          onTap={makeTapHandler(allUrls[0], 0)} />
      )}

      {/* Caption overlay for single image — PhotoSlide has no inner overlay so we keep this here */}
      {!isMulti && !!captionOverlay && !!(overlayCaption || caption) && (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 64, paddingBottom: 20, paddingHorizontal: 16 }}
          pointerEvents="none">
          <Text style={{ color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '600', letterSpacing: 0.1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }} numberOfLines={4}>
            {overlayCaption || caption}
          </Text>
        </LinearGradient>
      )}

      {/* Expand icon */}
      <View style={{ position: 'absolute', top: 12, right: 12 }} pointerEvents="none">
        <Ionicons name="expand-outline" size={16} color="rgba(255,255,255,0.7)" />
      </View>

      {/* Carousel dots */}
      {isMulti && (
        <View pointerEvents="none" style={{
          position: 'absolute', bottom: 10, left: 0, right: 0,
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
        }}>
          {allUrls.map((_, i) => (
            <View key={i} style={{
              width: i === activeIndex ? 18 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.4)',
            }} />
          ))}
        </View>
      )}

      {/* Caption below for multi-photo when not using overlay */}
      {isMulti && !!caption && !captionOverlay && (
        <Text style={{ fontSize: TYPO.body, lineHeight: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, color: colors.textPrimary }} numberOfLines={0}>
          {caption}
        </Text>
      )}
    </View>
  );
}

export const PostMedia = React.memo(PostMediaBase);
