import { View, Text } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { KID } from './kidTheme';
import type { FamilyMember } from '@/store/familyStore';

// Streak-orange — fire/streak accent, not present in the brand palette;
// left as a distinct literal per design (see final report).
const STREAK_ORANGE = '#FF6600';

// Medals stay as emoji — 🥇🥈🥉 read instantly as "rank" in a way a line icon
// can't match; everything else in this card is deliberate vector icons.
const MEDALS = ['🥇', '🥈', '🥉'];

export function KidLeaderboard({ activeId, kids, colors, isDark }: {
  activeId: string; kids: FamilyMember[]; colors: any; isDark: boolean;
}) {
  if (kids.length <= 1) return null;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
      <View style={{ borderRadius: 18, backgroundColor: colors.card,
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Trophy size={17} color={BRAND.amber} fill={BRAND.amber} fillOpacity={0.2} />
          <Text style={{ fontSize: KID.body, fontWeight: '900', color: colors.textPrimary }}>Family Leaderboard</Text>
        </View>
        {kids.map((k, i) => {
          const isMe = k.id === activeId;
          const kCoins = (k as any).mainCoins ?? (k as any).coins ?? 0;
          return (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 12,
              backgroundColor: isMe ? BRAND.purple + '18' : 'transparent', borderWidth: isMe ? 1.5 : 0, borderColor: BRAND.purple + '40' }}>
              <Text style={{ fontSize: KID.title, width: 26 }}>{MEDALS[i] ?? `${i + 1}.`}</Text>
              <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} size={32}
                ringColor={BRAND.purple} ringWidth={isMe ? 2 : 0} />
              <Text style={{ flex: 1, fontSize: KID.body, fontWeight: isMe ? '900' : '700', color: isMe ? BRAND.purple : colors.textPrimary }}>
                {k.name.split(' ')[0]}{isMe ? ' (you)' : ''}
              </Text>
              <Text style={{ fontSize: KID.body, fontWeight: '800', color: BRAND.amber }}>🪙 {kCoins}</Text>
              {(k as any).streak > 0 && <Text style={{ fontSize: KID.tiny, color: STREAK_ORANGE }}>🔥{(k as any).streak}d</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}
