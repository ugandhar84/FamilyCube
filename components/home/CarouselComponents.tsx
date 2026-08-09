/**
 * CarouselComponents — reusable carousel primitives for the Home screen.
 *
 * Exports:
 *  - `useCarousel`            — hook that manages scroll position, auto-advance timer,
 *                               pause-on-video, and card width derived from screen width.
 *  - `CarouselDots`           — animated pagination dots that interpolate width/opacity
 *                               from the carousel's scrollX value.
 *  - `YouTubeEmbed`           — WebView wrapper for YouTube embed URLs.
 *  - `ProductCard`            — one card in the AI-recommended products carousel;
 *                               supports native video (expo-video), YouTube embed, image, or emoji.
 *  - `RecommendationCarousel` — horizontal ScrollView of ProductCards with auto-advance.
 *  - `SponsoredCard`          — partner/brand ad card; same media options as ProductCard.
 *  - `SponsoredBanner`        — horizontal ScrollView of SponsoredCards with auto-advance.
 *
 * Video behaviour: cards auto-play muted when active. The carousel timer pauses while
 * a video plays and resumes when it ends — `onVideoEnd` triggers `advanceToNext`.
 * On Android, `.mov` files fall back to `android_video_url` or are skipped entirely.
 */
import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Animated, Platform,
  StyleSheet, Share, Modal, Linking,
} from 'react-native';
import { useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import LazyImage from '@/components/LazyImage';
import { LinearGradient } from 'expo-linear-gradient';
import { extractYouTubeId, PROD_CAT_COLOR, PROD_CAT_EMOJI, CATEGORY_COLOR } from '@/lib/homeUtils';
import type { ProductPick, Partner } from '@/lib/discovery';

export const CARD_GAP = 12;

// ── CarouselDots ──────────────────────────────────────────────────────────────
// Uses Animated.Value interpolation so dots expand/fade without triggering JS-thread
// re-renders — the native driver handles the animation entirely.
export const CarouselDots = memo(function CarouselDots({ scrollX, count, CARD_W, color }: {
  /** Animated scroll offset from the carousel's onScroll handler. */
  scrollX: Animated.Value;
  /** Total number of cards — fewer than 2 renders nothing. */
  count: number;
  /** Card width used to compute per-dot inputRanges. */
  CARD_W: number;
  /** Dot fill colour, typically the pet accent or theme primary. */
  color: string;
}) {
  if (count < 2) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 10 }}>
      {Array.from({ length: count }).map((_, i) => {
        const inputRange = [(i - 1) * (CARD_W + CARD_GAP), i * (CARD_W + CARD_GAP), (i + 1) * (CARD_W + CARD_GAP)];
        const width   = scrollX.interpolate({ inputRange, outputRange: [6, 20, 6],    extrapolate: 'clamp' });
        const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
        return <Animated.View key={i} style={{ height: 6, borderRadius: 3, backgroundColor: color, width, opacity }} />;
      })}
    </View>
  );
});

// ── YouTubeEmbed ──────────────────────────────────────────────────────────────
export const YouTubeEmbed = memo(function YouTubeEmbed({ url, style }: { url: string; style?: any }) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&controls=1&rel=0&modestbranding=1`;
  return (
    <WebView
      source={{ uri: embedUrl }}
      style={[{ flex: 1 }, style]}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      scrollEnabled={false}
    />
  );
});

// ── useCarousel ───────────────────────────────────────────────────────────────
/**
 * Manages carousel state for a horizontal ScrollView of fixed-width cards.
 *
 * @param count       Number of cards in the carousel.
 * @param intervalMs  Auto-advance interval in milliseconds (default 10 s).
 * @param visible     When false, `activeIndex` returns -1 to pause video playback
 *                    in off-screen carousels (e.g. cards hidden inside a collapsed section).
 * @returns Refs, handlers, and state needed to wire up a ScrollView carousel.
 */
export function useCarousel(count: number, intervalMs = 10000, visible = true) {
  const { width: SW } = useWindowDimensions();
  const CARD_W    = SW - 40;
  const scrollX   = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const indexRef  = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // pausedRef mirrors the paused state value so the setInterval closure always
  // reads the current flag without creating a stale-closure bug.
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const next = (indexRef.current + 1) % count;
      indexRef.current = next;
      setActiveIndex(next);
      scrollRef.current?.scrollTo({ x: next * (CARD_W + CARD_GAP), animated: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [count, CARD_W, intervalMs]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: indexRef.current * (CARD_W + CARD_GAP), animated: false });
  }, [CARD_W]);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false },
  );
  const onMomentumScrollEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP));
    indexRef.current = idx;
    setActiveIndex(idx);
  };

  const advanceToNext = useCallback(() => {
    const next = (indexRef.current + 1) % count;
    indexRef.current = next;
    setActiveIndex(next);
    scrollRef.current?.scrollTo({ x: next * (CARD_W + CARD_GAP), animated: true });
  }, [count, CARD_W]);

  const effectiveActiveIndex = visible ? activeIndex : -1;

  return { CARD_W, scrollX, scrollRef, onScroll, onMomentumScrollEnd, activeIndex: effectiveActiveIndex, paused, setPaused, advanceToNext };
}

// ── ProductCard ───────────────────────────────────────────────────────────────
interface ProductCardProps {
  /** The product record from the DB, including optional video/YouTube/image URLs. */
  p: ProductPick;
  /** Calculated card width (screen width minus horizontal padding). */
  CARD_W: number;
  /** Theme colour tokens. */
  colors: any;
  /** True when the app is in dark mode — used for card backgrounds and text colours. */
  isDark: boolean;
  /** True when this card is the currently visible carousel slide; controls video playback. */
  isActive: boolean;
  /** Called with `true` when video starts playing, `false` when it pauses or ends. */
  onPauseChange: (paused: boolean) => void;
  /** Called when the video reaches the end — triggers carousel advance. */
  onVideoEnd: () => void;
}

export const ProductCard = memo(function ProductCard({ p, CARD_W, colors, isDark, isActive, onPauseChange, onVideoEnd }: ProductCardProps) {
  const col = PROD_CAT_COLOR[p.category] ?? colors.primary;
  const pctChange = (p.price != null && p.original_price != null && p.original_price !== 0)
    ? Math.round(((p.price - p.original_price) / p.original_price) * 100)
    : null;
  const dealCfg = p.deal_type === 'clearance'
    ? { label: '🔥 CLEARANCE', bg: '#E24B4A' }
    : p.deal_type === 'rollback'
    ? { label: '↩ ROLLBACK', bg: '#0891B2' }
    : null;

  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);

  // Android does not support .mov — prefer android_video_url when provided;
  // fall back to video_url only if it is not a .mov file.
  const effectiveVideoUrl = (() => {
    if (Platform.OS === 'android') {
      if (p.android_video_url) return p.android_video_url;
      if (!p.video_url || /\.mov($|\?)/i.test(p.video_url)) return null;
      return p.video_url;
    }
    return p.video_url ?? null;
  })();

  const player = useVideoPlayer(effectiveVideoUrl, pl => {
    pl.loop = false;
    pl.muted = true;
    pl.timeUpdateEventInterval = 0.25;
    pl.play();
  });

  useEffect(() => {
    if (!effectiveVideoUrl || !player) return;
    if (isActive) {
      player.currentTime = 0;
      player.muted = true;
      setIsMuted(true);
      setProgress(0);
      setVideoEnded(false);
      player.play();
    } else {
      player.pause();
      player.muted = true;
      setIsMuted(true);
      setVideoEnded(false);
      onPauseChange(false);
    }
  }, [isActive, effectiveVideoUrl, player]);

  useEffect(() => {
    if (!effectiveVideoUrl || !player) return;
    const sub1 = player.addListener('playingChange', (e: { isPlaying: boolean }) => {
      onPauseChange(e.isPlaying);
    });
    const sub2 = player.addListener('playToEnd', () => {
      setProgress(1);
      setVideoEnded(true);
      onPauseChange(false);
      onVideoEnd();
    });
    const sub3 = player.addListener('timeUpdate', (e: { currentTime: number }) => {
      const dur = player.duration;
      if (dur > 0) setProgress(e.currentTime / dur);
    });
    return () => { sub1.remove(); sub2.remove(); sub3.remove(); };
  }, [effectiveVideoUrl, player]);

  const handleReplay = () => {
    player.seekBy(-player.currentTime);
    player.play();
    setProgress(0);
    setVideoEnded(false);
    onPauseChange(true);
  };

  const toggleMute = () => {
    const next = !isMuted;
    player.muted = next;
    setIsMuted(next);
  };

  const openUrl = p.cta_url ? () => Linking.openURL(p.cta_url!).catch(() => {}) : undefined;

  const hasVideo = !!effectiveVideoUrl;
  const Outer = hasVideo ? View : TouchableOpacity;
  const outerProps = hasVideo
    ? {}
    : { activeOpacity: 0.88 as number, onPress: openUrl };

  return (
    <View style={[rc.cardShadow, { width: CARD_W }]}>
      <Outer
        {...outerProps}
        style={[rc.card, { width: CARD_W, backgroundColor: colors.card }]}
      >
        <View style={[rc.thumb, { backgroundColor: col + '18' }]}>
          {hasVideo ? (
            <View style={{ width: '100%', height: '100%' }}>
              <VideoView
                player={player}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                nativeControls={false}
              />
              <View style={rc.progressTrack}>
                <View style={[rc.progressFill, { width: `${progress * 100}%` as any }]} />
              </View>
              {videoEnded && (
                <TouchableOpacity
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
                  onPress={handleReplay}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' }}>
                    <Ionicons name="refresh" size={24} color="#fff" />
                  </View>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 8, letterSpacing: 0.4 }}>Replay</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={rc.muteBtn} onPress={toggleMute} activeOpacity={0.8}>
                <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : p.youtube_url ? (
            <YouTubeEmbed url={p.youtube_url} style={{ width: '100%', height: '100%' }} />
          ) : p.image_url ? (
            <LazyImage uri={p.image_url} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Text style={{ fontSize: 52 }}>{p.emoji ?? PROD_CAT_EMOJI[p.category] ?? '🐾'}</Text>
          )}
        </View>

        {dealCfg ? (
          <View style={[rc.badge, { backgroundColor: dealCfg.bg }]}>
            <Text style={rc.badgeText}>{dealCfg.label}</Text>
          </View>
        ) : p.sponsored ? (
          <View style={[rc.badge, { backgroundColor: col }]}>
            <Text style={rc.badgeText}>Ad</Text>
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.88}
          onPress={openUrl}
          disabled={!p.cta_url}
          style={[rc.body, { backgroundColor: isDark ? '#1E1A2E' : '#fff' }]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[rc.name, { color: isDark ? '#fff' : '#111' }]} numberOfLines={1}>
              {p.brand ? `${p.brand} · ` : ''}{p.name}
            </Text>
            <Text style={[rc.reason, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }]} numberOfLines={1}>{p.reason}</Text>
            {p.price != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Text style={[rc.price, { color: col }]}>${p.price.toFixed(2)}</Text>
                {p.original_price != null && (
                  <Text style={[rc.strike, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }]}>${p.original_price.toFixed(2)}</Text>
                )}
                {pctChange !== null && pctChange !== 0 && (
                  <View style={[rc.pctPill, { backgroundColor: pctChange < 0 ? '#16A34A18' : '#E24B4A18' }]}>
                    <Text style={[rc.pctText, { color: pctChange < 0 ? '#16A34A' : '#E24B4A' }]}>
                      {pctChange > 0 ? '+' : ''}{pctChange}%
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <View style={[rc.cta, { backgroundColor: col }]}>
              <Text style={rc.ctaText}>{p.cta_label}</Text>
            </View>
            <TouchableOpacity
              onPress={() => Share.share({ message: `${p.name}${p.cta_url ? ` — ${p.cta_url}` : ''}` })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 6, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
            >
              <Ionicons name="share-outline" size={17} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Outer>
    </View>
  );
});

// ── RecommendationCarousel ────────────────────────────────────────────────────
interface RecommendationCarouselProps {
  products: ProductPick[];
  petName: string;
  colors: any;
  isDark: boolean;
  onWhyPress: () => void;
  visible?: boolean;
}

export const RecommendationCarousel = memo(function RecommendationCarousel({
  products, petName, colors, isDark, onWhyPress, visible = true,
}: RecommendationCarouselProps) {
  const { CARD_W, scrollX, scrollRef, onScroll, onMomentumScrollEnd, activeIndex, setPaused, advanceToNext } = useCarousel(products.length, 10000, visible);

  useEffect(() => {
    if (activeIndex < 0) return;
    const prod = products[activeIndex];
    const url = Platform.OS === 'android'
      ? (prod?.android_video_url ?? (prod?.video_url && !/\.mov($|\?)/i.test(prod.video_url) ? prod.video_url : null))
      : (prod?.video_url ?? null);
    const isPlayable = !!url;
    if (!isPlayable) setPaused(false);
  }, [activeIndex, products, setPaused]);

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>Picked for {petName}</Text>
        <TouchableOpacity onPress={onWhyPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="information-circle-outline" size={17} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_W + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: CARD_GAP }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {products.map((p, i) => (
          <ProductCard
            key={p.id}
            p={p}
            CARD_W={CARD_W}
            colors={colors}
            isDark={isDark}
            isActive={activeIndex === i}
            onPauseChange={setPaused}
            onVideoEnd={advanceToNext}
          />
        ))}
      </ScrollView>

      <CarouselDots scrollX={scrollX} count={products.length} CARD_W={CARD_W} color={colors.primaryText ?? colors.primary} />
    </View>
  );
});

// ── SponsoredCard ─────────────────────────────────────────────────────────────
interface SponsoredCardProps {
  ad: Partner;
  CARD_W: number;
  colors: any;
  isDark: boolean;
  isActive: boolean;
  onPauseChange: (paused: boolean) => void;
  onVideoEnd: () => void;
}

export const SponsoredCard = memo(function SponsoredCard({
  ad, CARD_W, colors, isDark, isActive, onPauseChange, onVideoEnd,
}: SponsoredCardProps) {
  const accentCol = CATEGORY_COLOR[ad.category] ?? colors.primary;
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const [descModalVisible, setDescModalVisible] = useState(false);

  const player = useVideoPlayer(ad.video_url ?? null, pl => {
    pl.loop = false;
    pl.muted = true;
    pl.timeUpdateEventInterval = 0.25;
    pl.play();
  });

  useEffect(() => {
    if (!ad.video_url || !player) return;
    if (isActive) {
      player.currentTime = 0;
      player.muted = true;
      setIsMuted(true);
      setProgress(0);
      setVideoEnded(false);
      player.play();
    } else {
      player.pause();
      player.muted = true;
      setIsMuted(true);
      setVideoEnded(false);
      onPauseChange(false);
    }
  }, [isActive, ad.video_url, player]);

  useEffect(() => {
    if (!ad.video_url || !player) return;
    const sub1 = player.addListener('playingChange', (e: { isPlaying: boolean }) => {
      onPauseChange(e.isPlaying);
    });
    const sub2 = player.addListener('playToEnd', () => {
      setProgress(1);
      setVideoEnded(true);
      onPauseChange(false);
      onVideoEnd();
    });
    const sub3 = player.addListener('timeUpdate', (e: { currentTime: number }) => {
      const dur = player.duration;
      if (dur > 0) setProgress(e.currentTime / dur);
    });
    return () => { sub1.remove(); sub2.remove(); sub3.remove(); };
  }, [ad.video_url, player]);

  const toggleMute = () => {
    const next = !isMuted;
    player.muted = next;
    setIsMuted(next);
  };

  const handleReplay = () => {
    player.seekBy(-player.currentTime);
    player.play();
    setProgress(0);
    setVideoEnded(false);
    onPauseChange(true);
  };

  const openUrl = ad.cta_url ? () => Linking.openURL(ad.cta_url!).catch(() => {}) : undefined;

  const Outer = ad.video_url ? View : TouchableOpacity;
  const outerProps = ad.video_url
    ? {}
    : { activeOpacity: 0.88 as number, onPress: openUrl };

  return (
    <Outer
      {...outerProps}
      style={[sb.card, { width: CARD_W, backgroundColor: colors.card }]}
    >
      {ad.video_url ? (
        <View style={{ position: 'relative' }}>
          <VideoView player={player} style={sb.cover} contentFit="cover" nativeControls={false} />
          <View style={sb.progressTrack}>
            <View style={[sb.progressFill, { width: `${progress * 100}%` as any }]} />
          </View>
          {videoEnded && (
            <TouchableOpacity
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
              onPress={handleReplay}
              activeOpacity={0.8}
            >
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' }}>
                <Ionicons name="refresh" size={24} color="#fff" />
              </View>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 8, letterSpacing: 0.4 }}>Replay</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={sb.muteBtn} onPress={toggleMute} activeOpacity={0.8}>
            <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : ad.youtube_url ? (
        <View style={[sb.cover, { overflow: 'hidden' }]}>
          <YouTubeEmbed url={ad.youtube_url} style={{ flex: 1 }} />
        </View>
      ) : ad.image_url ? (
        <LazyImage uri={ad.image_url} style={sb.cover} />
      ) : (
        <LinearGradient
          colors={[accentCol + 'CC', accentCol + '66']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[sb.cover, { alignItems: 'center', justifyContent: 'center' }]}
        >
          <Text style={{ fontSize: 44 }}>
            {ad.category === 'vet' ? '🏥' : ad.category === 'food' ? '🥩' : ad.category === 'grooming' ? '✂️' : ad.category === 'boarding' ? '🏠' : ad.category === 'training' ? '🎓' : '📦'}
          </Text>
        </LinearGradient>
      )}

      <View style={[sb.sponsoredTag, { backgroundColor: accentCol }]}>
        <Text style={sb.sponsoredText}>Sponsored</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.88}
        onPress={openUrl}
        disabled={!ad.cta_url}
        style={sb.body}
      >
        <View style={{ flex: 1 }}>
          <Text style={[sb.name, { color: colors.textPrimary }]} numberOfLines={1}>{ad.name}</Text>
          {ad.subtitle ? <Text style={[sb.sub, { color: colors.textSecondary }]} numberOfLines={1}>{ad.subtitle}</Text> : null}
          {(ad as any).description ? (
            <>
              <TouchableOpacity onPress={() => setDescModalVisible(true)} activeOpacity={0.7}>
                <Text style={[sb.sub, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={2}>
                  {(ad as any).description}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: accentCol, marginTop: 2 }}>Read more</Text>
              </TouchableOpacity>
              <Modal
                visible={descModalVisible}
                transparent
                animationType="none"
                onRequestClose={() => setDescModalVisible(false)}
              >
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
                  activeOpacity={1}
                  onPress={() => setDescModalVisible(false)}
                >
                  <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, width: '100%', maxWidth: 360 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 }}>{ad.name}</Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 21 }}>{(ad as any).description}</Text>
                    <TouchableOpacity
                      onPress={() => setDescModalVisible(false)}
                      style={{ marginTop: 16, alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, backgroundColor: accentCol }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Close</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            </>
          ) : null}
          {ad.city ? <Text style={[sb.city, { color: colors.textTertiary ?? colors.textSecondary }]}>📍 {ad.city}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[sb.cta, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', borderColor: accentCol }]}>
            <Text style={[sb.ctaText, { color: accentCol }]}>{ad.cta_label}</Text>
          </View>
          <TouchableOpacity
            onPress={() => Share.share({ message: `${ad.name}${ad.cta_url ? ` — ${ad.cta_url}` : ''}` })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 6, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
          >
            <Ionicons name="share-outline" size={17} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Outer>
  );
});

// ── SponsoredBanner ───────────────────────────────────────────────────────────
interface SponsoredBannerProps {
  ads: Partner[];
  colors: any;
  isDark: boolean;
  visible?: boolean;
}

export const SponsoredBanner = memo(function SponsoredBanner({ ads, colors, isDark, visible = true }: SponsoredBannerProps) {
  const { CARD_W, scrollX, scrollRef, onScroll, onMomentumScrollEnd, activeIndex, setPaused, advanceToNext } = useCarousel(ads.length, 10000, visible);

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>Sponsored</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
          <Text style={{ fontSize: 14, color: colors.textTertiary ?? colors.textSecondary }}>Ad</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_W + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 10, gap: CARD_GAP }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {ads.map((ad, i) => (
          <SponsoredCard
            key={ad.id}
            ad={ad}
            CARD_W={CARD_W}
            colors={colors}
            isDark={isDark}
            isActive={activeIndex === i}
            onPauseChange={setPaused}
            onVideoEnd={advanceToNext}
          />
        ))}
      </ScrollView>

      <CarouselDots scrollX={scrollX} count={ads.length} CARD_W={CARD_W} color={colors.primaryText ?? colors.primary} />
    </View>
  );
});

// ── Shared styles ─────────────────────────────────────────────────────────────
const rc = StyleSheet.create({
  cardShadow: { borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10, elevation: 0 },
  card:     { borderRadius: 18, overflow: 'hidden' },
  thumb:    { width: '100%', height: 150, alignItems: 'center', justifyContent: 'center' },
  badge:    { position: 'absolute', top: 12, right: 12, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  body:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  name:     { fontSize: 14, fontWeight: '700' },
  reason:   { fontSize: 14, marginTop: 1 },
  price:    { fontSize: 15, fontWeight: '800' },
  strike:   { fontSize: 14, textDecorationLine: 'line-through' },
  pctPill:  { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  pctText:  { fontSize: 14, fontWeight: '800' },
  cta:      { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'center', flexShrink: 0 },
  ctaText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill:  { height: 3, backgroundColor: '#fff' },
  muteBtn:  { position: 'absolute', bottom: 10, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});

const sb = StyleSheet.create({
  card:         { borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10, elevation: 4 },
  cover:        { width: '100%', height: 160 },
  sponsoredTag: { position: 'absolute', top: 12, right: 12, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sponsoredText:{ fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  body:         { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  name:         { fontSize: 15, fontWeight: '700' },
  sub:          { fontSize: 14, marginTop: 2 },
  city:         { fontSize: 14, marginTop: 3 },
  cta:          { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'center' },
  ctaText:      { fontSize: 14, fontWeight: '700' },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill:  { height: 3, backgroundColor: '#fff' },
  muteBtn:      { position: 'absolute', bottom: 10, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});

