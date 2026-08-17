import { View, Text } from 'react-native';
import { Coins } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from '../seniorTheme';
import type { FamilyMember } from '@/store/familyStore';
import type { GrandparentMatch } from '@/store/choreStore';

// Active savings-match rules this grandparent has set up ("50% match on
// whatever they save this month" style).
export function MatchRulesCard({ myMatches, kids, colors, isDark }: {
  myMatches: GrandparentMatch[];
  kids: FamilyMember[]; colors: any; isDark: boolean;
}) {
  if (myMatches.length === 0) return null;

  return (
    <View style={{ marginBottom: 10, gap: 6 }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 }}>
        Your active match rules
      </Text>
      {myMatches.map(m => {
        const kid = kids.find(k => k.id === m.childId);
        const pctUsed = m.maxMonthlyContribution
          ? Math.min((m.monthlyContributedYtd / m.maxMonthlyContribution) * 100, 100)
          : 0;
        return (
          <View key={m.id} style={{
            borderRadius: 10, borderWidth: 1, borderColor: BRAND.purple + '30',
            backgroundColor: isDark ? BRAND.purple + '10' : BRAND.purple + '06',
            padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            <Coins size={18} color={BRAND.purple} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: GP.body, fontWeight: '700', color: colors.textPrimary }}>
                {kid?.name.split(' ')[0] ?? 'Grandchild'} ·{' '}
                {m.matchType === 'FIXED_PERCENTAGE'
                  ? `${m.matchValue}% match`
                  : `${m.matchValue} pts/earn`}
                {' '}→ Save Jar
              </Text>
              {m.maxMonthlyContribution ? (
                <>
                  <View style={{ height: 4, backgroundColor: BRAND.purple + '30', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                    <View style={{ height: '100%', width: `${pctUsed}%`, backgroundColor: BRAND.purple, borderRadius: 2 }} />
                  </View>
                  <Text style={{ fontSize: GP.tiny, color: colors.textTertiary, marginTop: 2 }}>
                    {m.monthlyContributedYtd} of {m.maxMonthlyContribution} pts this month
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
