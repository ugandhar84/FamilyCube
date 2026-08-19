import { View, Text } from 'react-native';
import { Trophy, Flame } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import { SectionCard } from '../hubComponents';
import type { FamilyMember } from '@/store/familyStore';

// Money-green — "Reviewed" stat accent, distinct from brand teal used
// elsewhere in the hub. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';
// Streak-orange — fire/streak accent, not present in the brand palette;
// left as a distinct literal per design (see final report).
const STREAK_ORANGE = '#F97316';

// Today's stats + the family coin leaderboard. Collapsed by default — this is
// a "check in when curious" card, not something that needs a decision.
export function HouseholdSnapshotCard({
  colors, isDark, reviewedToday, avgStreak, pendingCashOutsCount, leaderboardKids, allNames,
}: {
  colors: any; isDark: boolean;
  reviewedToday: number; avgStreak: number; pendingCashOutsCount: number;
  leaderboardKids: FamilyMember[]; allNames: string[];
}) {
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <SectionCard
      icon={<Trophy size={16} color={colors.kid} fill={colors.kid + '30'} />}
      title="Family Leaderboard"
      accent={colors.kid}
      badge={leaderboardKids.length} badgeLabel="Kids" badgeColor={colors.kid}
      collapsible defaultExpanded={false}
      colors={colors} isDark={isDark}>
      <View style={{ flexDirection: 'row', borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}>
        {[
          { label: 'Reviewed', value: String(reviewedToday), color: MONEY_GREEN },
          { label: 'Avg Streak', value: `${avgStreak}d`, color: STREAK_ORANGE },
          { label: 'Cash-outs', value: String(pendingCashOutsCount), color: colors.kid },
        ].map((s, i, arr) => (
          <View key={s.label} style={{
            flex: 1, alignItems: 'center', paddingVertical: 14,
            borderRightWidth: i < arr.length - 1 ? 1 : 0,
            borderRightColor: colors.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {s.label === 'Avg Streak' && <Flame size={15} color={s.color} fill={s.color} />}
              <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: s.color }}>{s.value}</Text>
            </View>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '600', color: colors.textTertiary, marginTop: 2 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 6 }}>
          {leaderboardKids.length === 0 ? (
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', paddingVertical: 10 }}>
              No kids added yet
            </Text>
          ) : leaderboardKids.map((kid, idx) => {
            // Same field Kid Hub reads (mainCoins ?? coins) — this used to read a
            // separately-derived ledger total that could show a different number
            // than what the kid saw on their own device.
            const kidCoins = (kid as any).mainCoins ?? (kid as any).coins ?? 0;
            const streak = (kid as any).streak ?? 0;
            return (
              <View key={kid.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 10, paddingHorizontal: 10,
                backgroundColor: idx === 0
                  ? (isDark ? colors.kid + '15' : colors.kid + '10')
                  : colors.surface,
                borderRadius: 12,
                borderWidth: idx === 0 ? 1 : 0,
                borderColor: colors.kid + '40',
              }}>
                {/* intentional: 18 sits between TYPO.subheading(17) and TYPO.heading(20); kept as this card's medal-emoji size */}
                <Text style={{ fontSize: 18, width: 24 }}>{medals[idx] ?? '·'}</Text>
                <FamilyAvatar
                  name={kid.name} emoji={(kid as any).emoji} avatarUrl={(kid as any).avatarUrl}
                  siblings={allNames} size={30}
                  ringColor={idx === 0 ? colors.kid : colors.primary} ringWidth={1.5}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
                    {kid.name.split(' ')[0]}
                  </Text>
                  {streak > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Flame size={11} color={STREAK_ORANGE} fill={STREAK_ORANGE} />
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{streak} day streak</Text>
                    </View>
                  )}
                </View>
                {idx === 0 && (
                  <View style={{ backgroundColor: colors.kid, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>Top</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                  backgroundColor: colors.kid + '18', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
                  <Text style={{ fontSize: TYPO.label }}>🪙</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: colors.kid }}>{kidCoins}</Text>
                </View>
              </View>
            );
          })}
      </View>
    </SectionCard>
  );
}
