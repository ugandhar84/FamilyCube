import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';

interface PetLike {
  name: string;
  emoji?: string | null;
  avatar_url?: string | null;
  accent_color?: string | null;
}

interface Props {
  pet: PetLike | null | undefined;
  /** extra text appended after the name, e.g. "Labrador · 3 yrs" or "Playdate" */
  meta?: string | null;
}

/** Small avatar (photo or emoji) + name row used under a header title — matches SOS/Care headers. */
export default function PetIdentityRow({ pet, meta }: Props) {
  const { colors } = useTheme();
  if (!pet) return null;
  const ac = pet.accent_color ?? colors.primary;
  return (
    <View style={s.row}>
      <View style={[s.avatar, { backgroundColor: ac + '18' }]}>
        {pet.avatar_url
          ? <Image source={{ uri: pet.avatar_url }} style={s.avatarImg} resizeMode="cover" />
          : <Text style={s.avatarEmoji}>{pet.emoji ?? '🐾'}</Text>}
      </View>
      <Text style={[s.line, { color: colors.textSecondary }]} numberOfLines={1}>
        <Text style={[s.line, { color: colors.textPrimary, fontWeight: '600' }]}>{pet.name}</Text>
        {meta ? `  ·  ${meta}` : ''}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  avatar: {
    width: 28, height: 28, borderRadius: 14, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarImg:   { width: 28, height: 28 },
  avatarEmoji: { fontSize: 17, lineHeight: 20, textAlign: 'center' },
  line:   { fontSize: 14, flexShrink: 1 },
});
