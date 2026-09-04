import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { PiggyBank, Star, Target, CheckCircle2, Flame, Zap, Lightbulb, Receipt } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import AppBottomSheet from '@/components/AppBottomSheet';
import type { Reward } from '@/store/rewardStore';
import { useChoreStore } from '@/store/choreStore';

const COIN_VAL = 0.10;

// Money-green — "cash value" accent, distinct from brand teal used
// elsewhere in this sheet. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';
// Streak-orange — fire/streak accent, not present in the brand palette;
// left as a distinct literal per design (see final report).
const STREAK_ORANGE = '#FF6600';

// Scenario 8.1 — a real "Recent Activity" list reading straight from
// choreStore.transactions (backed by the actual point_transactions table —
// the same audit-trail row every quest approval, bonus, and GP match
// already writes). The former standalone Vault → Ledger tab that used to
// serve this purpose was removed in this redesign pass (see
// features/store/StoreScreen.tsx's own comment on the replacement Piggy
// Banks summary), leaving no live transaction-history surface anywhere in
// the app — this restores a real one, scoped to the viewer's OWN
// transactions only (5.3's sibling-balance-privacy rule), inside the one
// screen a kid already checks their own balance from.
function RecentActivityList({ colors, isDark, memberId }: { colors: any; isDark: boolean; memberId: string }) {
  const transactions = useChoreStore(s => s.transactions);
  const mine = transactions
    .filter(t => t.userId === memberId && !(t.notes ?? '').includes('[Denied]'))
    .slice(0, 8);

  if (mine.length === 0) return null;

  return (
    <View style={{ borderRadius: 14, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Receipt size={14} color={colors.textPrimary} />
        <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.textPrimary }}>Recent Activity</Text>
      </View>
      {mine.map(t => {
        const isNegative = t.amount < 0 || t.transactionType === 'CASH_OUT' || t.transactionType === 'SPENT';
        const sign = t.amount < 0 ? '' : (t.transactionType === 'CASH_OUT' || t.transactionType === 'SPENT') ? '-' : '+';
        return (
          <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: KID.tiny, color: colors.textSecondary, flex: 1, marginRight: 8 }} numberOfLines={1}>
              {t.notes || (t.transactionType === 'EARNED' ? 'Chore reward' : t.transactionType)}
            </Text>
            <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: isNegative ? colors.danger : '#10B981' }}>
              {sign}{Math.abs(t.amount)} 🪙
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function PiggyBankSheet({
  visible, onClose, colors, isDark, mainCoins, gpCoins, almostAffordable, doneToday, streak, level, memberId, goalReward,
}: {
  visible: boolean; onClose: () => void; colors: any; isDark: boolean;
  mainCoins: number; gpCoins: number; almostAffordable: Reward[];
  doneToday: number; streak: number; level: number;
  // Scenario 8.1 — whose transactions to show in Recent Activity. Optional
  // so existing call sites that haven't been updated yet don't break; the
  // section simply doesn't render without it.
  memberId?: string;
  // The kid's own explicitly-chosen goal (set via "Set as My Goal" in the
  // Store) — takes priority over the auto-derived "Almost there" list below,
  // since a picked goal is a real signal the kid cares about, not a guess.
  goalReward?: Reward;
}) {
  // Displayed balances/cash-value are clamped at 0 — a real data glitch, a
  // pending penalty, or a race in coin-award logic could in principle
  // produce a negative stored value, and this sheet had no floor anywhere,
  // meaning a coin count or cash-out dollar figure could render as
  // negative directly to a kid with no guard or explanation. Clamping once
  // here covers every downstream display (balance number, cash-value math)
  // instead of needing the same floor repeated at each call site.
  mainCoins = Math.max(0, mainCoins);
  gpCoins = Math.max(0, gpCoins);
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Piggy Bank"
      subtitle="Your coin balance & cash-out value"
      accentColor={BRAND.amber}
      minHeight="55%">
      <View style={{ gap: 10 }}>
        <View style={{ borderRadius: 18, padding: 16, alignItems: 'center', gap: 5, backgroundColor: isDark ? '#1A1000' : '#FFF8E8', borderWidth: 1.5, borderColor: BRAND.amber + '50' }}>
          <PiggyBank size={34} color={BRAND.amber} />
          <Text style={{ fontSize: KID.hero, fontWeight: '900', color: BRAND.amber, lineHeight: 36 }}>{mainCoins}</Text>
          <Text style={{ fontSize: KID.tiny, color: colors.textTertiary, fontWeight: '600' }}>Main Store Coins</Text>
          {gpCoins > 0 && (
            <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Star size={12} color={BRAND.purple} fill={BRAND.purple} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.purple }}>+{gpCoins} Grandparent Bonus</Text>
            </View>
          )}
        </View>

        <View style={{ borderRadius: 14, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: KID.tiny, color: colors.textSecondary }}>Main coins</Text>
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: MONEY_GREEN }}>${(mainCoins * COIN_VAL).toFixed(2)}</Text>
          </View>
          {gpCoins > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: KID.tiny, color: colors.textSecondary }}>GP bonus</Text>
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: BRAND.purple }}>${(gpCoins * COIN_VAL).toFixed(2)}</Text>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#F1F5F9' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '700', color: colors.textPrimary }}>Total 💰</Text>
            <Text style={{ fontSize: KID.title, fontWeight: '900', color: BRAND.amber }}>${((mainCoins + gpCoins) * COIN_VAL).toFixed(2)}</Text>
          </View>
        </View>

        {goalReward && (() => {
          const remaining = Math.max(goalReward.cost - mainCoins, 0);
          const pct = Math.min(mainCoins / goalReward.cost, 1);
          return (
            <Pressable onPress={() => { onClose(); router.push('/(tabs)/store' as any); }}
              style={{ borderRadius: 14, padding: 13, backgroundColor: BRAND.purple + '10', borderWidth: 1.5, borderColor: BRAND.purple + '50', gap: 9 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Target size={14} color={BRAND.purple} />
                <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.purple }}>My Goal</Text>
              </View>
              {/* Title gets flexShrink so it actually gives way to the
                  trailing badge instead of both competing for the row's
                  width with no clear priority — was flex:1 with no shrink
                  behavior specified, which could let a long title crowd
                  the "N more" text instead of truncating cleanly first. */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.textPrimary, flex: 1, flexShrink: 1 }} numberOfLines={1}>
                  {goalReward.emoji} {goalReward.title}
                </Text>
                <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: BRAND.purple, flexShrink: 0 }} numberOfLines={1}>
                  {remaining > 0 ? `${remaining} more 🪙` : 'Ready! 🎉'}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: isDark ? colors.surface : '#F1F5F9', overflow: 'hidden' }}>
                <View style={{ height: 8, borderRadius: 4, width: `${Math.round(pct * 100)}%` as any, backgroundColor: BRAND.purple }} />
              </View>
              <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.textTertiary, alignSelf: 'flex-end' }}>
                {Math.round(pct * 100)}%
              </Text>
            </Pressable>
          );
        })()}

        {!goalReward && almostAffordable.length > 0 && (
          <View style={{ borderRadius: 14, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Target size={14} color={colors.textPrimary} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.textPrimary }}>Almost there!</Text>
            </View>
            {almostAffordable.slice(0, 2).map(r => {
              const pct = Math.min(mainCoins / r.cost, 1);
              return (
                <View key={r.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: KID.tiny, color: colors.textSecondary, flex: 1, flexShrink: 1 }} numberOfLines={1}>{r.emoji} {r.title}</Text>
                    <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: BRAND.amber, flexShrink: 0 }} numberOfLines={1}>Need {r.cost - mainCoins} more 🪙</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? colors.surface : '#F1F5F9', overflow: 'hidden' }}>
                    <View style={{ height: 6, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: BRAND.amber }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { Icon: CheckCircle2, value: doneToday,    label: 'Done Today', color: MONEY_GREEN },
            { Icon: Flame,        value: streak,       label: 'Day Streak', color: STREAK_ORANGE },
            { Icon: Zap,          value: `Lv ${level}`, label: 'Level',     color: BRAND.purple },
          ].map(({ Icon, value, label, color }) => (
            <View key={label} style={{ flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', alignItems: 'center', gap: 4 }}>
              <Icon size={18} color={color} />
              <Text style={{ fontSize: KID.sub, fontWeight: '900', color }}>{value}</Text>
              <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: colors.textTertiary }}>{label}</Text>
            </View>
          ))}
        </View>

        {memberId && <RecentActivityList colors={colors} isDark={isDark} memberId={memberId} />}

        <View style={{ borderRadius: 14, padding: 13, backgroundColor: BRAND.teal + '12', borderWidth: 1, borderColor: BRAND.teal + '40' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Lightbulb size={14} color={BRAND.teal} />
            <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.teal }}>How cash-outs work</Text>
          </View>
          <Text style={{ fontSize: KID.tiny, color: colors.textSecondary, lineHeight: 16 }}>
            10 Coins = $1.00 real allowance! Ask at{' '}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Friday Family Dinner</Text>
            {' '}to cash out.
          </Text>
        </View>
      </View>
    </AppBottomSheet>
  );
}
