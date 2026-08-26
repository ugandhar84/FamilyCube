import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Flame, Leaf, Laptop, Phone } from 'lucide-react-native';
import { GP } from '../seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Green — "in progress" accent, distinct from brand teal used elsewhere in
// this tree. Not colors.success (which IS brand teal in this app) — kept
// as one local constant.
const IN_PROGRESS_GREEN = '#10B981';

// Quests the grandchild is currently working on.
export function InProgressCard({ quests, kids, colors, isDark, active }: {
  quests: ChoreTask[]; kids: FamilyMember[]; colors: any; isDark: boolean;
  active?: { name: string };
}) {
  if (!quests.length) return null;
  const actorName = active?.name ?? 'senior';

  return (
    <View style={{ gap: 8, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Flame size={13} color={colors.textTertiary} />
        <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.8 }}>In Progress</Text>
      </View>
      {quests.map(c => {
        const kid = kids.find(k => k.id === c.assignedToId);
        return (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            padding: 12, borderRadius: 12,
            backgroundColor: isDark ? IN_PROGRESS_GREEN + '15' : '#ECFDF5',
            borderWidth: 1, borderColor: IN_PROGRESS_GREEN + '30' }}>
            {c.questMode === 'virtual' ? <Laptop size={18} color={IN_PROGRESS_GREEN} /> : <Leaf size={18} color={IN_PROGRESS_GREEN} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
              <Text style={{ fontSize: GP.tiny, color: colors.textSecondary }}>
                {kid?.name.split(' ')[0] ?? 'Grandchild'} is working on it · {c.basePoints} pts
              </Text>
            </View>
            {c.questMode === 'virtual' && (
              // Bumped padding/text/icon size and added hitSlop — a "join a
              // video call" action has a more significant consequence than
              // a plain status chip, and was previously noticeably smaller
              // than the 13-16px padding used almost everywhere else on
              // this screen.
              <Pressable style={{ backgroundColor: IN_PROGRESS_GREEN, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => router.push('/(tabs)/chat')}>
                <Phone size={14} color="#fff" />
                <Text style={{ fontSize: GP.tiny, fontWeight: '900', color: '#fff' }}>Join</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}
