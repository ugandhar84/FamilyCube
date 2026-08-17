import { View, Text, Pressable } from 'react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

// Today's sibling wins still waiting on a cheer from me — drops off the list
// once cheered (or once the day passes), so this stays a to-do, not a feed.
export function CheerSquadSection({ cheerable, siblingKids, colors, isDark, onCheer }: {
  cheerable: Quest[]; siblingKids: FamilyMember[]; colors: any; isDark: boolean;
  onCheer: (questId: string) => void;
}) {
  if (cheerable.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
      <View style={{ borderRadius: 18, backgroundColor: isDark ? colors.card : '#fff',
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', padding: 14, gap: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textPrimary }}>🎉 Cheer Squad</Text>
        {cheerable.map(q => {
          const sib = siblingKids.find(s => s.id === q.assignedToId);
          return (
            <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14,
              backgroundColor: isDark ? '#052E16' : '#F0FDF4', borderWidth: 1, borderColor: '#10B98130', padding: 10 }}>
              <FamilyAvatar name={sib?.name ?? 'Kid'} emoji={sib?.emoji} avatarUrl={(sib as any)?.avatarUrl} size={30}
                ringColor="#10B981" ringWidth={0} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>{q.title}</Text>
                <Text style={{ fontSize: 10, color: '#10B981' }}>{sib?.name?.split(' ')[0] ?? 'They'} finished it! ✅</Text>
              </View>
              <Pressable onPress={() => onCheer(q.id)}
                style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#10B981' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>🎉 Cheer</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
