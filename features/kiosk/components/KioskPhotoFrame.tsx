/**
 * KioskPhotoFrame — the full-screen gold-framed memory slideshow with a small clock pill. Used by the idle
 * screen and, over the lock screen, until someone touches it. Pass `onPress` to make it tappable.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KioskPhotoFade } from './KioskPhotoFade';

export function KioskPhotoFrame({ active = true, nextLine, onPress, familyName }: { active?: boolean; nextLine?: string; onPress?: () => void; familyName?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20_000); return () => clearInterval(t); }, []);
  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel="Touch to unlock" style={s.root}>
      <View style={s.frameWrap} pointerEvents="none">
        <LinearGradient colors={['#F3D98B', '#C9A24B', '#8F6B1F', '#D9B45B', '#F3D98B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.goldOuter}>
          <View style={s.goldBevel}>
            <LinearGradient colors={['#B98A2E', '#F0D27A', '#A57A22']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={s.goldLip}>
              <View style={s.matte}><KioskPhotoFade style={s.photo} active={active} caption /></View>
            </LinearGradient>
          </View>
        </LinearGradient>
      </View>
      {!!familyName && <Text style={s.family} pointerEvents="none">{familyName.toUpperCase()}</Text>}
      <View style={s.pill} pointerEvents="none">
        <Text style={s.clock}>{clock}</Text>
        <Text style={s.date}>{date}</Text>
        {!!nextLine && <Text style={s.next} numberOfLines={1}>{nextLine}</Text>}
        {!!onPress && <Text style={s.hint}>Touch to unlock</Text>}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A0910' },
  frameWrap: { ...StyleSheet.absoluteFillObject, padding: 56, paddingTop: 84, paddingBottom: 96, alignItems: 'center', justifyContent: 'center' },
  goldOuter: { flex: 1, alignSelf: 'stretch', padding: 14, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.65, shadowRadius: 34, shadowOffset: { width: 0, height: 18 }, elevation: 14 },
  goldBevel: { flex: 1, borderRadius: 4, borderWidth: 3, borderColor: 'rgba(90,60,10,0.55)', padding: 4, backgroundColor: 'rgba(90,60,10,0.25)' },
  goldLip: { flex: 1, padding: 5, borderRadius: 2 },
  matte: { flex: 1, backgroundColor: '#F7F2EA', padding: 16, borderWidth: 2, borderColor: 'rgba(120,90,30,0.35)' },
  photo: { flex: 1, borderRadius: 2 },
  family: { position: 'absolute', top: 40, left: 60, color: '#D9B45B', fontSize: 14, fontWeight: '900', letterSpacing: 2.4 },
  pill: { position: 'absolute', right: 70, bottom: 118, backgroundColor: 'rgba(10,9,16,0.62)', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'flex-end' },
  clock: { color: '#FFFFFF', fontSize: 40, fontWeight: '300', fontVariant: ['tabular-nums'] },
  date: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
  next: { color: '#E8C375', fontSize: 14, fontWeight: '800', marginTop: 4, maxWidth: 320 },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', marginTop: 4 },
});
