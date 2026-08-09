import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import LazyImage from '@/components/LazyImage';

interface PostPhotoGridProps {
  urls: string[];
  onPress?: (url: string) => void;
  onDoubleTap?: () => void;
}

function PostPhotoGridBase({ urls, onPress, onDoubleTap }: PostPhotoGridProps) {
  const count = Math.min(urls.length, 4);
  const show = urls.slice(0, 4);
  const R = 16;

  // Per-photo tap refs — prevents cross-photo double-tap from triggering a like
  const tapTimers = React.useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const lastTaps  = React.useRef<Record<string, number>>({});

  const makeTapHandler = (u: string) => () => {
    if (!onDoubleTap) { onPress?.(u); return; }
    const now     = Date.now();
    const timer   = tapTimers.current[u] ?? null;
    const lastTap = lastTaps.current[u]  ?? 0;
    if (timer && now - lastTap < 400) {
      clearTimeout(timer);
      tapTimers.current[u] = null;
      onDoubleTap();
    } else {
      lastTaps.current[u]  = now;
      tapTimers.current[u] = setTimeout(() => {
        tapTimers.current[u] = null;
        onPress?.(u);
      }, 400);
    }
  };

  const cell = (u: string, style: any) => (
    <TouchableOpacity key={u} activeOpacity={0.88} onPress={makeTapHandler(u)} style={style}>
      <LazyImage uri={u} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </TouchableOpacity>
  );

  if (count === 2) {
    return (
      <View style={{ flexDirection: 'row', gap: 3, aspectRatio: 5 / 4, borderRadius: R, overflow: 'hidden', marginBottom: 10 }}>
        {show.map(u => cell(u, { flex: 1 }))}
      </View>
    );
  }

  if (count === 3) {
    return (
      <View style={{ flexDirection: 'row', gap: 3, aspectRatio: 5 / 4, borderRadius: R, overflow: 'hidden', marginBottom: 10 }}>
        {cell(show[0], { flex: 1 })}
        <View style={{ flex: 1, gap: 3 }}>
          {cell(show[1], { flex: 1 })}
          {cell(show[2], { flex: 1 })}
        </View>
      </View>
    );
  }

  const extra = urls.length - 4;
  return (
    <View style={{ aspectRatio: 1, borderRadius: R, overflow: 'hidden', marginBottom: 10 }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
        {cell(show[0], { flex: 1 })}
        {cell(show[1], { flex: 1 })}
      </View>
      <View style={{ height: 3 }} />
      <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
        {cell(show[2], { flex: 1 })}
        <View style={{ flex: 1 }}>
          {cell(show[3], { flex: 1, width: '100%', height: '100%' })}
          {extra > 0 && (
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: TYPO.title, fontWeight: '800' }}>+{extra}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export const PostPhotoGrid = React.memo(PostPhotoGridBase);
