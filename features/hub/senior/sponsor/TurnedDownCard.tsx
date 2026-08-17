import { View, Text, Pressable } from 'react-native';
import { HandHeart } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from '../seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Quests the grandchild turned down — GP sees the reason in their own words
// and can reopen it to any grandchild.
export function TurnedDownCard({ quests, members, colors, isDark, updateChore }: {
  quests: ChoreTask[]; members: FamilyMember[]; colors: any; isDark: boolean;
  updateChore: (id: string, patch: Partial<ChoreTask>) => void;
}) {
  if (!quests.length) return null;

  return (
    <View style={{ gap: 8, marginBottom: 12 }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: 0.8 }}>Turned Down</Text>
      {quests.map(c => {
        const kid = members.find(m => m.id === c.assignedToId);
        return (
          <View key={c.id} style={{ padding: 14, borderRadius: 14, gap: 8,
            backgroundColor: isDark ? colors.danger + '10' : '#FEF2F2',
            borderWidth: 1.5, borderColor: colors.danger + '30' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <HandHeart size={18} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.body, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
                <Text style={{ fontSize: GP.sub, color: colors.textSecondary, marginTop: 2 }}>
                  {kid?.name.split(' ')[0] ?? 'Your grandchild'} can't take this one
                </Text>
              </View>
            </View>
            {c.rejectionReason ? (
              <Text style={{ fontSize: GP.body, color: colors.textPrimary, fontStyle: 'italic' }}>
                "{c.rejectionReason}"
              </Text>
            ) : null}
            <Pressable onPress={() => updateChore(c.id, {
              status: 'todo', isPool: true, assignedToId: undefined,
              targetChildIds: [], rejectionReason: undefined,
            })}
              style={{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: BRAND.teal }}>
              <Text style={{ fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
                Open it to any grandchild
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
