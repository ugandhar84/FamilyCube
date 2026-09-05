/**
 * KioskStoreTab — reward grid for kiosk mode: bigger cards than the phone's
 * StoreScreen since there's width to spare, same redeem flow as
 * StoreScreen.tsx (features/store/StoreScreen.tsx) — reuses the actual
 * rewardStore.redeemReward RPC (which atomically checks balance + deducts
 * server-side, see redeem_reward in store/rewardStore.ts:396-409) rather
 * than reimplementing the coin math. No admin/edit affordances for the
 * reward catalog itself (managing perks stays a phone/parent-profile
 * action), but parent approval of pending redemptions — a real mobile
 * capability (StoreScreen.tsx's "Pending Approvals" section, ~line 678) —
 * is wired in here too, since a kiosk parent needs the same ability to
 * approve/decline without switching to their phone.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet } from 'react-native';
import { useRewardStore, Reward } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';

export function KioskStoreTab({ active, colors, isDark }: {
  active: FamilyMember; colors: any; isDark: boolean;
}) {
  const { rewards, redemptions, redeemReward, approveRedemption, rejectRedemption } = useRewardStore();
  const { members } = useFamilyStore();

  const eligible = useMemo(
    () => rewards.filter(r => r.available && (!r.eligibleMemberIds || r.eligibleMemberIds.includes(active.id))),
    [rewards, active.id],
  );

  // Same pooled-for-display / single-jar-for-redemption split StoreScreen.tsx
  // uses (see its myCoins vs myMaxAffordable, ~line 484-499) — a reward can
  // only ever be paid from ONE wallet at a time (redeem_reward requires one
  // jar alone to cover the cost), so "can afford" must check the larger
  // single jar, not the pooled total, or a card would show as redeemable
  // and then fail every time.
  const mainCoins = (active as any).mainCoins ?? 0;
  const gpCoins = (active as any).gpCoins ?? 0;
  const totalCoins = mainCoins + gpCoins;
  const maxAffordable = Math.max(mainCoins, gpCoins);

  const isParent = active.role === 'parent';
  const canRedeemSelf = active.role === 'kid' || active.role === 'teen' || active.role === 'senior';

  const [jarPicker, setJarPicker] = useState<Reward | null>(null);

  // redeemReward(rewardId, memberId, wallet) already deducts the coins
  // atomically server-side (rewardStore.ts:396's redeem_reward RPC) — no
  // separate awardCoins/deductCoins call is needed (or correct: doing so
  // would double-charge on top of what the RPC already took, exactly the
  // bug StoreScreen.tsx's redeemFrom comment at ~line 519-529 documents
  // having fixed once already).
  const redeemFrom = async (reward: Reward, wallet: 'mainCoins' | 'gpCoins') => {
    const ok = await redeemReward(reward.id, active.id, wallet);
    if (!ok) { Alert.alert('Unable to Redeem', 'This perk is no longer available.'); return; }
    Alert.alert('Redeemed!', `"${reward.title}" redeemed for ${reward.cost} coins.`);
  };

  const onRedeem = (reward: Reward) => {
    if (totalCoins < reward.cost) {
      Alert.alert('Not enough coins', `${reward.title} costs ${reward.cost} coins — ${active.name.split(' ')[0]} has ${totalCoins}.`);
      return;
    }
    // Same jar-selection logic as StoreScreen.handleRedeem: no real choice
    // if only one jar can cover it, otherwise let the person pick.
    if (gpCoins === 0 || mainCoins >= reward.cost) {
      Alert.alert('Redeem this reward?', `Spend ${reward.cost} coins on "${reward.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem', onPress: () => redeemFrom(reward, 'mainCoins') },
      ]);
      return;
    }
    if (mainCoins === 0) {
      Alert.alert('Redeem this reward?', `Spend ${reward.cost} coins from the Grandparent Bonus jar on "${reward.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem', onPress: () => redeemFrom(reward, 'gpCoins') },
      ]);
      return;
    }
    setJarPicker(reward);
  };

  // Pending Approvals — real, DB-synced capability on mobile (StoreScreen.tsx
  // ~line 678-718) that had NO kiosk equivalent at all; a parent standing at
  // the kitchen tablet had no way to approve/decline a kid's redemption
  // without switching to their phone.
  const pending = isParent ? redemptions.filter(r => r.status === 'pending') : [];

  useKioskLockSuspended(jarPicker !== null);

  // AUDIT FIX: approve/reject fired instantly on a single tap of a 40px
  // icon button. On a phone that's defensible — it's your own device in
  // your hand. On a wall-mounted kiosk it is not: the parent profile stays
  // active for up to the full 30-minute idle window, during which anyone
  // walking past the counter can approve their own pending redemption, and
  // rejecting refunds coins and cannot be undone from this screen. Both
  // now confirm first, matching how every other irreversible kiosk action
  // (chore delete, event delete) already behaves.
  const confirmApproval = (id: string, label: string, who: string, approve: boolean) => {
    Alert.alert(
      approve ? 'Approve this reward?' : 'Decline this reward?',
      approve
        ? `Mark "${label}" as fulfilled for ${who}?`
        : `Decline "${label}" for ${who}? Their coins will be refunded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Approve' : 'Decline',
          style: approve ? 'default' : 'destructive',
          onPress: () => approve ? approveRedemption(id, active.id) : rejectRedemption(id, active.id),
        },
      ],
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Reward Store</Text>
        {canRedeemSelf && (
          <View style={[s.coinPill, { backgroundColor: colors.amberLight }]}>
            <Text style={[s.coinText, { color: colors.amber }]}>{totalCoins} coins · {active.name.split(' ')[0]}</Text>
          </View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {isParent && pending.length > 0 && (
          <View style={{ marginBottom: 22 }}>
            <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
              Pending Approvals ({pending.length})
            </Text>
            <View style={{ gap: 10 }}>
              {pending.map(rd => {
                const reward = rewards.find(r => r.id === rd.rewardId);
                const kid = members.find(m => m.id === rd.memberId);
                const label = reward?.title ?? rd.rewardTitle ?? 'Perk';
                const who = kid?.name.split(' ')[0] ?? rd.memberName?.split(' ')[0] ?? 'A kid';
                return (
                  <View key={rd.id} style={[s.approvalRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={{ fontSize: 26 }}>{reward?.emoji ?? '🎁'}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.approvalTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                        {label}
                      </Text>
                      <Text style={[s.approvalMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {who} · {rd.deductedCoins} coins
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => confirmApproval(rd.id, label, who, false)}
                      style={[s.approvalBtn, { backgroundColor: colors.danger + '18' }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Decline ${label} for ${who}`}
                    >
                      <Text style={{ fontSize: 20, color: colors.danger }}>✕</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmApproval(rd.id, label, who, true)}
                      style={[s.approvalBtn, { backgroundColor: colors.teal + '18' }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Approve ${label} for ${who}`}
                    >
                      <Text style={{ fontSize: 20, color: colors.teal }}>✓</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {canRedeemSelf && (() => {
          const mine = redemptions
            .filter(r => r.memberId === active.id)
            .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
            .slice(0, 5);
          if (mine.length === 0) return null;
          const statusMeta: Record<string, { label: string; color: string }> = {
            pending:   { label: 'Pending',   color: colors.warning ?? colors.amber },
            approved:  { label: 'Fulfilled', color: colors.success },
            rejected:  { label: 'Declined',  color: colors.danger },
            cancelled: { label: 'Cancelled', color: colors.textTertiary },
          };
          return (
            <View style={{ marginBottom: 22 }}>
              <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>My Redemptions</Text>
              <View style={{ gap: 8 }}>
                {mine.map(rd => {
                  const reward = rewards.find(r => r.id === rd.rewardId);
                  const meta = statusMeta[rd.status] ?? statusMeta.pending;
                  return (
                    <View key={rd.id} style={[s.approvalRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={{ fontSize: 20 }}>{reward?.emoji ?? '🎁'}</Text>
                      <Text style={{ flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                        {reward?.title ?? rd.rewardTitle ?? 'Perk'}
                      </Text>
                      <View style={{ backgroundColor: meta.color + '20', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: meta.color }}>{meta.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Available Perks</Text>
        <View style={s.grid}>
          {eligible.map(r => {
            const affordable = canRedeemSelf && maxAffordable >= r.cost;
            return (
              <Pressable
                key={r.id}
                onPress={() => canRedeemSelf && onRedeem(r)}
                disabled={!canRedeemSelf}
                style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: canRedeemSelf && !affordable ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`${r.title}, ${r.cost} coins`}
                accessibilityState={{ disabled: !canRedeemSelf }}
                accessibilityHint={
                  !canRedeemSelf ? undefined
                    : affordable ? 'Redeem this reward'
                    : `Not enough coins yet, ${r.cost - maxAffordable} more needed`
                }
              >
                <Text style={s.emoji}>{r.emoji}</Text>
                <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{r.title}</Text>
                <View style={[s.costPill, { backgroundColor: colors.amberLight }]}>
                  <Text style={[s.costText, { color: colors.amber }]}>{r.cost} coins</Text>
                </View>
                {canRedeemSelf && !affordable && (
                  <Text style={[s.needMore, { color: colors.textTertiary }]} numberOfLines={1}>
                    Need {r.cost - maxAffordable} more
                  </Text>
                )}
              </Pressable>
            );
          })}
          {eligible.length === 0 && (
            <Text style={[s.empty, { color: colors.textTertiary }]}>No rewards available right now</Text>
          )}
        </View>
      </ScrollView>

      {/* Jar picker — same choice StoreScreen's JarPickerModal offers when
          neither wallet alone covers the cost, or both do. */}
      {jarPicker && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center' }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setJarPicker(null)} />
          {/* width capped — left/right:24 alone would stretch edge-to-edge
              on a wide kiosk landscape screen; centered + maxWidth keeps it
              a proper dialog regardless of screen width. */}
          <View style={{ position: 'absolute', width: 420, maxWidth: '90%', top: '30%',
            backgroundColor: colors.card, borderRadius: 20, padding: 22, gap: 14,
            borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>Pay with which jar?</Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>
              "{jarPicker.title}" costs {jarPicker.cost} coins
            </Text>
            {[
              { key: 'mainCoins' as const, label: 'Main Coins', balance: mainCoins },
              { key: 'gpCoins' as const, label: 'Grandparent Bonus', balance: gpCoins },
            ].map(j => {
              const canPay = j.balance >= jarPicker.cost;
              return (
                <Pressable key={j.key} disabled={!canPay}
                  onPress={() => { redeemFrom(jarPicker, j.key); setJarPicker(null); }}
                  style={{ borderRadius: 14, borderWidth: 1.5, padding: 16, opacity: canPay ? 1 : 0.5,
                    borderColor: colors.teal, backgroundColor: colors.teal + '12' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>{j.label}</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                    {j.balance} coins available{!canPay ? ' — not enough' : ''}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setJarPicker(null)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// Scaled to the kiosk ladder. Reward cards in particular go 180 -> 240
// wide with a much larger emoji: this is the screen kids browse from
// across the kitchen, and the perk art is the thing they navigate by.
const s = StyleSheet.create({
  root: { flex: 1, padding: KIOSK_SPACE.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  title: { fontSize: KIOSK_TYPO.title, fontWeight: '800', letterSpacing: -0.6 },
  coinPill: { paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.full },
  coinText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  sectionLabel: {
    fontSize: KIOSK_TYPO.sectionLabel, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: KIOSK_SPACE.sm,
  },
  approvalRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1, padding: KIOSK_SPACE.md, minHeight: KIOSK_HIT.primary,
  },
  approvalTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  approvalMeta: { fontSize: KIOSK_TYPO.caption, marginTop: 2 },
  approvalBtn: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  card: {
    width: 190, maxWidth: '100%', minHeight: 180, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1,
    padding: KIOSK_SPACE.lg, alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm,
  },
  emoji: { fontSize: 40 },
  cardTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', textAlign: 'center' },
  costPill: { paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.full },
  costText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  needMore: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  empty: { fontSize: KIOSK_TYPO.subheading, fontWeight: '600', textAlign: 'center', width: '100%', marginTop: KIOSK_SPACE.xxl },
});
