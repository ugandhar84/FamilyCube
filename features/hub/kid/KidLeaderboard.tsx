import { View, Text } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';

const MEDALS = ['🥇', '🥈', '🥉'];

export function KidLeaderboard({ activeId, kids, colors, isDark }: {
  activeId: string; kids: FamilyMember[]; colors: any; isDark: boolean;
}) {
  if (kids.length <= 1) return null;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
      <View style={{ borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff',
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', padding: 14, gap: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>🏅 Family Leaderboard</Text>
        {kids.map((k, i) => {
          const isMe = k.id === activeId;
          const kCoins = (k as any).mainCoins ?? (k as any).coins ?? 0;
          return (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12,
              backgroundColor: isMe ? BRAND.purple + '18' : 'transparent', borderWidth: isMe ? 1.5 : 0, borderColor: BRAND.purple + '40' }}>
              <Text style={{ fontSize: 18, width: 26 }}>{MEDALS[i] ?? `${i + 1}.`}</Text>
              <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} size={30}
                ringColor={BRAND.purple} ringWidth={isMe ? 2 : 0} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: isMe ? '900' : '700', color: isMe ? BRAND.purple : colors.textPrimary }}>
                {k.name.split(' ')[0]}{isMe ? ' (you)' : ''}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND.amber }}>🪙 {kCoins}</Text>
              {(k as any).streak > 0 && <Text style={{ fontSize: 11, color: '#FF6600' }}>🔥{(k as any).streak}d</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}
