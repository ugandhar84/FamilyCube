import { View, Text } from 'react-native';
import { Award, CheckCircle2, Check } from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { GP } from '../seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Green — "completed/verified" accent, distinct from brand teal used
// elsewhere in this tree. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const COMPLETED_GREEN = '#22c55e';

// Sponsored quests that are done and verified. Team quests (shared
// teamGroupId) render once with all participating kids' avatars stacked.
export function CompletedCard({ done, allChores, kids, allNames, colors, isDark, active }: {
  done: ChoreTask[]; allChores: ChoreTask[];
  kids: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  active?: { name: string };
}) {
  if (!done.length) return null;
  const actorName = active?.name ?? 'senior';

  const seenTeams = new Set<string>();
  const cards = done.filter(c => {
    if (!c.teamGroupId) return true;
    if (seenTeams.has(c.teamGroupId)) return false;
    seenTeams.add(c.teamGroupId);
    return true;
  });
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${actorName} list=CompletedCard.cards totalSource=${done.length} afterFilter=${cards.length} [features/hub/senior/sponsor/CompletedCard.tsx:27]`);

  return (
    <View style={{ gap: 8, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CheckCircle2 size={13} color={colors.textTertiary} />
        <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.8 }}>Completed</Text>
      </View>
      {cards.map(c => {
        const team = c.teamGroupId ? allChores.filter(x => x.teamGroupId === c.teamGroupId) : [c];
        const teamKids = team.map(m => kids.find(k => k.id === m.assignedToId)).filter(Boolean) as typeof kids;
        return (
          <View key={c.teamGroupId ?? c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            padding: 12, borderRadius: 12,
            backgroundColor: isDark ? '#14291a' : '#F0FDF4',
            borderWidth: 1, borderColor: COMPLETED_GREEN + '40' }}>
            <Award size={18} color={COMPLETED_GREEN} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
              <Text style={{ fontSize: GP.tiny, color: colors.textSecondary }}>
                {team.length > 1
                  ? `${teamKids.map(k => k.name.split(' ')[0]).join(' & ')} completed it together`
                  : `${teamKids[0]?.name.split(' ')[0] ?? 'Grandchild'} completed it`}
              </Text>
            </View>
            {team.length > 1 && (
              <View style={{ flexDirection: 'row' }}>
                {teamKids.map((k, i) => (
                  <View key={k.id} style={{ marginLeft: i > 0 ? -10 : 0 }}>
                    <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl} siblings={allNames} size={26}
                      ringColor={isDark ? '#14291a' : '#F0FDF4'} ringWidth={2} />
                  </View>
                ))}
              </View>
            )}
            <View style={{ backgroundColor: COMPLETED_GREEN + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: COMPLETED_GREEN }}>Done</Text>
              <Check size={11} color={COMPLETED_GREEN} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
