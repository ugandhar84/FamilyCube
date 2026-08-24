import { View, Text } from 'react-native';
import { Leaf, Laptop, Check } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from '../seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// My quests approved by a parent, waiting for a grandchild to claim them.
export function ApprovedWaitingClaimCard({ quests, kids, colors, isDark }: {
  quests: ChoreTask[]; kids: FamilyMember[]; colors: any; isDark: boolean;
}) {
  if (!quests.length) return null;

  return (
    <View style={{ gap: 8, marginBottom: 12 }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: 0.8 }}>Waiting for Kid to Claim</Text>
      {quests.map(c => {
        const kid = kids.find(k => k.id === c.assignedToId);
        return (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            padding: 12, borderRadius: 12,
            backgroundColor: isDark ? BRAND.purple + '12' : BRAND.purple + '14',
            borderWidth: 1, borderColor: BRAND.purple + '30' }}>
            {c.questMode === 'virtual' ? <Laptop size={18} color={BRAND.purple} /> : <Leaf size={18} color={BRAND.purple} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
              <Text style={{ fontSize: GP.tiny, color: colors.textSecondary }}>
                {kid ? kid.name.split(' ')[0] : 'Any grandchild'} · {c.basePoints} pts
              </Text>
            </View>
            <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: BRAND.purple }}>Approved</Text>
              <Check size={11} color={BRAND.purple} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
