import React, { useState, useRef } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

const MEDIA_RADIUS = 14;

function PostVideoPlayerBase({ uri, onDoubleTap }: { uri: string; onDoubleTap?: () => void }) {
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; p.play(); });

  const tapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap   = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    if (tapTimer.current && now - lastTap.current < 400) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      onDoubleTap?.();
    } else {
      lastTap.current = now;
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        // single tap — toggle play/pause
        if (player.playing) { player.pause(); setPlaying(false); }
        else                 { player.play();  setPlaying(true);  }
      }, 400);
    }
  };

  return (
    <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: MEDIA_RADIUS, overflow: 'hidden', backgroundColor: '#000' }}>
      <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      {/* Double-tap / play-pause overlay */}
      <TouchableOpacity onPress={handleTap} activeOpacity={0.9}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 40 }} />
      {!playing && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 40,
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <View style={{ width: 52, height: 52, borderRadius: 26,
            backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>
      )}
      {/* Mute button */}
      <TouchableOpacity
        style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 6 }}
        onPress={() => { player.muted = !player.muted; setMuted(m => !m); }}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export const PostVideoPlayer = React.memo(PostVideoPlayerBase);
