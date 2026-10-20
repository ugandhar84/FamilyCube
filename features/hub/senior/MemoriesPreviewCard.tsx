import { View, Text, Image } from 'react-native';
import { Images } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { useKioskPhotos } from '@/features/kiosk/useKioskPhotos';
import { useUIStore } from '@/store/uiStore';
import { GEMINI } from '@/constants/geminiRhythm';
import { GP } from './seniorTheme';

// "Memories" preview at the end of the Hub — same shell and tap-through as the dinner ("Tonight") card on the other Hubs:
// the newest family photo as a hero with its title, or a soft prompt when nothing is posted yet. Tap opens Memories.
const SLIDE_H = 160;

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MemoriesPreviewCard({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { photos } = useKioskPhotos();
  const open = () => useUIStore.getState().setOpenMemoriesScreenRequested(true);
  const latest = photos[0];
  const shell = {
    borderRadius: 22, overflow: 'hidden' as const,
    backgroundColor: isDark ? colors.card : GEMINI.cardBg,
    borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
    ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow),
  };

  if (!latest) {
    return (
      <AnimatedPressable onPress={open} accessibilityRole="button" accessibilityLabel="Open memories"
        style={{ ...shell, flexDirection: 'row', padding: 18, alignItems: 'center', gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pinkLight }}>
          <Images size={28} color={colors.pink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>No memories yet</Text>
          <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.primary, marginTop: 6 }}>Share the first photo →</Text>
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable onPress={open} accessibilityRole="button" accessibilityLabel="Open memories" style={{ ...shell, height: SLIDE_H }}>
      <Image source={{ uri: latest.url }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
      <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.pinkLight }}>
        <Images size={14} color={colors.pink} />
        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.pink }}>MEMORIES</Text>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: isDark ? colors.card : GEMINI.cardBg, opacity: 0.96 }}>
        <Text style={{ fontSize: GP.body, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }} numberOfLines={1}>{latest.title}</Text>
        <Text style={{ fontSize: GP.sub, fontWeight: '600', color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 2 }}>
          {fmtDate(latest.date)}{photos.length > 1 ? `${latest.date ? ' · ' : ''}${photos.length} photos · See all →` : ' · See all →'}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
