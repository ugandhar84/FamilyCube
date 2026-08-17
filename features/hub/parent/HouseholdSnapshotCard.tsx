import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, Trophy, Flame } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
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
  const [open, setOpen] = useState(false);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
      overflow: 'hidden', marginBottom: 12,
    }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: open ? 1 : 0, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
        {[
          { label: 'Reviewed', value: String(reviewedToday), color: MONEY_GREEN },
          { label: 'Avg Streak', value: `${avgStreak}d`, color: STREAK_ORANGE },
          { label: 'Cash-outs', value: String(pendingCashOutsCount), color: BRAND.amber },
        ].map((s, i, arr) => (
          <View key={s.label} style={{
            flex: 1, alignItems: 'center', paddingVertical: 14,
            borderRightWidth: i < arr.length - 1 ? 1 : 0,
            borderRightColor: isDark ? colors.border : '#F1F5F9',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {s.label === 'Avg Streak' && <Flame size={15} color={s.color} fill={s.color} />}
              <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: s.color }}>{s.value}</Text>
            </View>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '600', color: colors.textTertiary, marginTop: 2 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={() => setOpen(o => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
        <Trophy size={16} color={BRAND.amber} fill={BRAND.amber + '30'} />
        <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>
          Family Leaderboard
        </Text>
        {leaderboardKids.length > 0 && (
          <View style={{ backgroundColor: BRAND.purple, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>{leaderboardKids.length}</Text>
          </View>
        )}
        {open ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
      </Pressable>

      {open && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 6 }}>
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
                  ? (isDark ? BRAND.amber + '15' : BRAND.amber + '10')
                  : (isDark ? colors.surface : '#F8FAFC'),
                borderRadius: 12,
                borderWidth: idx === 0 ? 1 : 0,
                borderColor: BRAND.amber + '40',
              }}>
                {/* intentional: 18 sits between TYPO.subheading(17) and TYPO.heading(20); kept as this card's medal-emoji size */}
                <Text style={{ fontSize: 18, width: 24 }}>{medals[idx] ?? '·'}</Text>
                <FamilyAvatar
                  name={kid.name} emoji={(kid as any).emoji} avatarUrl={(kid as any).avatarUrl}
                  siblings={allNames} size={30}
                  ringColor={idx === 0 ? BRAND.amber : BRAND.purple} ringWidth={1.5}
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
                  <View style={{ backgroundColor: BRAND.amber, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>Top</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                  backgroundColor: BRAND.amber + '18', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
                  <Text style={{ fontSize: TYPO.label }}>🪙</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.amber }}>{kidCoins}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
