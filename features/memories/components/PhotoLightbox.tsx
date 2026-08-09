/**
 * PhotoLightbox — full-screen photo viewer with prev/next navigation and download.
 */

import React from 'react';
import {
  View, Text, Modal, TouchableOpacity, Animated, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LazyImage from '@/components/LazyImage';
import { MOOD_COLOR, TYPO} from '@/constants/theme';
import { toTitle } from '@/lib/format';

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', playful: '🎉', tired: '😴',
  anxious: '😰', grumpy: '😾', calm: '😌', excited: '🤩',
};

interface GalleryPhoto {
  id: string;
  url: string;
  caption?: string;
  mood_label?: string;
  taken_at: string;
}

interface PhotoLightboxProps {
  lightbox: GalleryPhoto | null;
  lightboxIndex: number;
  totalPhotos: number;
  photoOpacity: Animated.Value;
  downloading: boolean;
  insetTop: number;
  insetBottom: number;
  onClose: () => void;
  onNavigate: (direction: 'next' | 'prev') => void;
  onDownload: (photo: GalleryPhoto) => void;
}

const PhotoLightbox = React.memo(function PhotoLightbox({
  lightbox, lightboxIndex, totalPhotos, photoOpacity,
  downloading, insetTop, insetBottom,
  onClose, onNavigate, onDownload,
}: PhotoLightboxProps) {
  return (
    <Modal visible={!!lightbox} transparent animationType="none" onRequestClose={onClose}>
      <View style={lb.bg}>
        {/* Top bar */}
        <View style={[lb.topBar, { paddingTop: insetTop + 8 }]}>
          <TouchableOpacity style={lb.btn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {totalPhotos > 0 && lightboxIndex >= 0 && (
            <Text style={lb.counter}>{lightboxIndex + 1} / {totalPhotos}</Text>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[lb.downloadBtn, downloading && { opacity: 0.5 }]}
            onPress={() => lightbox && onDownload(lightbox)} disabled={downloading}>
            {downloading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="arrow-down-circle-outline" size={20} color="#fff" />}
            <Text style={lb.downloadText}>{downloading ? 'Saving…' : 'Save photo'}</Text>
          </TouchableOpacity>
        </View>

        {/* Photo */}
        {lightbox && (
          <Animated.View style={[{ opacity: photoOpacity }, StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
            <LazyImage uri={lightbox.url} style={lb.img} resizeMode="contain" />
          </Animated.View>
        )}

        {/* Prev / Next */}
        {totalPhotos > 1 && lightboxIndex > 0 && (
          <TouchableOpacity style={[lb.navBtn, lb.navPrev]} onPress={() => onNavigate('prev')}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
        )}
        {totalPhotos > 1 && lightboxIndex < totalPhotos - 1 && (
          <TouchableOpacity style={[lb.navBtn, lb.navNext]} onPress={() => onNavigate('next')}>
            <Ionicons name="chevron-forward" size={28} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Mood label */}
        {lightbox?.mood_label && (
          <View style={[lb.meta, { bottom: insetBottom + 32 }]}>
            <Text style={lb.emoji}>{MOOD_EMOJI[lightbox.mood_label] ?? '🐾'}</Text>
            <Text style={[lb.moodLabel, { color: (MOOD_COLOR as any)[lightbox.mood_label] ?? '#fff' }]}>
              {toTitle(lightbox.mood_label)}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
});

export default PhotoLightbox;

const lb = StyleSheet.create({
  bg:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  topBar:      { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  btn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  counter:     { fontSize: TYPO.body, fontWeight: '600', color: '#fff', marginLeft: 12 },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  downloadText:{ fontSize: TYPO.caption, fontWeight: '600', color: '#fff' },
  img:         { width: '100%', height: '100%' },
  navBtn:      { position: 'absolute', top: '50%', zIndex: 10, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  navPrev:     { left: 16 },
  navNext:     { right: 16 },
  meta:        { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 4 },
  emoji:       { fontSize: TYPO.hero },
  moodLabel:   { fontSize: TYPO.subheading, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
});
