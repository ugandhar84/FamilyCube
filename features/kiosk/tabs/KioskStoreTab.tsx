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
 *
 * ── Hub-OS migration ────────────────────────────────────────────────────
 * Restyled onto the kiosk palette + KioskOS primitives (WidgetCard /
 * WidgetHeader / Well / Chip / TabTitle / ActionButton), matching Overview,
 * Schedule and Meals. Business logic is untouched — same redeemReward RPC,
 * same jar-selection branch, same confirm-before-approve audit fix.
 *
 * Two structural changes, both because the old shape was phone-shaped:
 *   · The three sections (approvals / my redemptions / perks) were bare
 *     uppercase captions over loose rows. They are now real widgets, so the
 *     screen parses as three zones from across the room, which is the whole
 *     point of the Hub-OS card language.
 *   · The jar picker was a hand-rolled absolute-fill overlay INSIDE the tab
 *     — it therefore scrolled with content and, being a plain View rather
 *     than a Modal, sat under the header. It's now a real centered dialog
 *     over a palette scrim. It keeps useKioskLockSuspended (it is not a
 *     native Modal, so touches DO bubble to the root, but the suspension is
 *     what stops the idle lock discarding a half-made choice).
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, StyleSheet } from 'react-native';
import { Gift, Coins, ClipboardCheck, History, Check, X } from 'lucide-react-native';
import { useRewardStore, Reward } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS, kioskElevation } from '../kioskTheme';
import { useKioskColors, kioskOnAccent, type KioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Well, Chip, TabTitle, EmptyNote } from '../components/KioskOS';

export function KioskStoreTab({ active }: { active: FamilyMember }) {
  const { k, isDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
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

  const mine = useMemo(() => {
    if (!canRedeemSelf) return [];
    return redemptions
      .filter(r => r.memberId === active.id)
      .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
      .slice(0, 5);
  }, [canRedeemSelf, redemptions, active.id]);

  const statusMeta: Record<string, { label: string; accent: string }> = {
    pending:   { label: 'Pending',   accent: k.gold },
    approved:  { label: 'Fulfilled', accent: k.sage },
    rejected:  { label: 'Declined',  accent: k.danger },
    cancelled: { label: 'Cancelled', accent: k.textFaint },
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={registerActivity}
      >
        <TabTitle
          title="Reward Store"
          subtitle="Perks the family has earned — redeem, and approve what's waiting"
          k={k}
          right={canRedeemSelf ? (
            <View
              style={[s.coinPill, { backgroundColor: k.gold + (isDark ? '24' : '1A'), borderColor: k.gold + (isDark ? '4D' : '3D') }]}
              accessible
              accessibilityLabel={`${totalCoins} coins for ${active.name.split(' ')[0]}`}
            >
              <Coins size={18} color={k.gold} />
              <Text style={[s.coinText, { color: k.gold }]} numberOfLines={1}>
                {totalCoins} · {active.name.split(' ')[0]}
              </Text>
            </View>
          ) : undefined}
        />

        {/* ══ PENDING APPROVALS (parent only) ═══════════════════════════ */}
        {isParent && pending.length > 0 && (
          <WidgetCard k={k} isDark={isDark} accent={k.gold} style={s.section}>
            <WidgetHeader
              Icon={ClipboardCheck} eyebrow="Needs you" title="Pending approvals"
              accent={k.gold} k={k} isDark={isDark}
              right={<Chip label={`${pending.length}`} accent={k.gold} isDark={isDark} k={k} />}
            />
            <View style={{ gap: KIOSK_SPACE.sm }}>
              {pending.map(rd => {
                const reward = rewards.find(r => r.id === rd.rewardId);
                const kid = members.find(m => m.id === rd.memberId);
                const label = reward?.title ?? rd.rewardTitle ?? 'Perk';
                const who = kid?.name.split(' ')[0] ?? rd.memberName?.split(' ')[0] ?? 'A kid';
                return (
                  <Well key={rd.id} k={k} accent={k.gold} style={s.row}>
                    <Text style={s.rowEmoji}>{reward?.emoji ?? '🎁'}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.rowTitle, { color: k.text }]} numberOfLines={2}>{label}</Text>
                      <Text style={[s.rowMeta, { color: k.textMuted }]} numberOfLines={1}>
                        {who} · {rd.deductedCoins} coins
                      </Text>
                    </View>
                    <IconAction
                      Icon={X} accent={k.danger} k={k} isDark={isDark}
                      label={`Decline ${label} for ${who}`}
                      onPress={() => confirmApproval(rd.id, label, who, false)}
                    />
                    <IconAction
                      Icon={Check} accent={k.sage} k={k} isDark={isDark} filled
                      label={`Approve ${label} for ${who}`}
                      onPress={() => confirmApproval(rd.id, label, who, true)}
                    />
                  </Well>
                );
              })}
            </View>
          </WidgetCard>
        )}

        {/* ══ MY REDEMPTIONS ════════════════════════════════════════════ */}
        {mine.length > 0 && (
          <WidgetCard k={k} isDark={isDark} style={s.section}>
            <WidgetHeader
              Icon={History} eyebrow="Recent" title="My redemptions"
              accent={k.purple} k={k} isDark={isDark}
            />
            <View style={{ gap: KIOSK_SPACE.xs }}>
              {mine.map(rd => {
                const reward = rewards.find(r => r.id === rd.rewardId);
                const meta = statusMeta[rd.status] ?? statusMeta.pending;
                return (
                  <Well key={rd.id} k={k} style={s.row}>
                    <Text style={s.rowEmojiSm}>{reward?.emoji ?? '🎁'}</Text>
                    <Text style={[s.rowTitle, { flex: 1, color: k.text }]} numberOfLines={1}>
                      {reward?.title ?? rd.rewardTitle ?? 'Perk'}
                    </Text>
                    <Chip label={meta.label} accent={meta.accent} isDark={isDark} k={k} />
                  </Well>
                );
              })}
            </View>
          </WidgetCard>
        )}

        {/* ══ AVAILABLE PERKS ═══════════════════════════════════════════ */}
        <WidgetCard k={k} isDark={isDark} style={s.section}>
          <WidgetHeader
            Icon={Gift} eyebrow="Catalog" title="Available perks"
            accent={k.primary} k={k} isDark={isDark}
            right={eligible.length > 0
              ? <Chip label={`${eligible.length}`} accent={k.primary} isDark={isDark} k={k} />
              : undefined}
          />
          {eligible.length === 0 ? (
            <Well k={k} style={s.emptyWell}>
              <Gift size={30} color={k.textFaint} />
              <EmptyNote
                text="No rewards available right now. A parent can add perks from the Store screen on a phone."
                k={k}
                style={{ textAlign: 'center', maxWidth: 380 }}
              />
            </Well>
          ) : (
            <View style={s.grid}>
              {eligible.map(r => {
                const affordable = canRedeemSelf && maxAffordable >= r.cost;
                const dim = canRedeemSelf && !affordable;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => canRedeemSelf && onRedeem(r)}
                    disabled={!canRedeemSelf}
                    style={({ pressed }) => [
                      s.perk,
                      {
                        backgroundColor: pressed ? k.cardHover : k.well,
                        borderColor: affordable ? k.primaryEdge : k.cardBorder,
                        opacity: dim ? 0.55 : 1,
                      },
                      affordable && kioskElevation(k.primary, isDark),
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.title}, ${r.cost} coins`}
                    accessibilityState={{ disabled: !canRedeemSelf }}
                    accessibilityHint={
                      !canRedeemSelf ? undefined
                        : affordable ? 'Redeem this reward'
                        : `Not enough coins yet, ${r.cost - maxAffordable} more needed`
                    }
                  >
                    <Text style={s.perkEmoji}>{r.emoji}</Text>
                    <Text style={[s.perkTitle, { color: k.text }]} numberOfLines={2}>{r.title}</Text>
                    <Chip label={`${r.cost} coins`} accent={k.gold} isDark={isDark} k={k} />
                    {dim && (
                      <Text style={[s.needMore, { color: k.textFaint }]} numberOfLines={1}>
                        Need {r.cost - maxAffordable} more
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </WidgetCard>
      </ScrollView>

      {/* Jar picker — same choice StoreScreen's JarPickerModal offers when
          neither wallet alone covers the cost, or both do. Rendered as a
          sibling of the ScrollView (not inside it) so it floats over the
          tab rather than scrolling with the content. */}
      {jarPicker && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
            onPress={() => setJarPicker(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss jar picker"
          />
          <View style={s.dialogWrap} pointerEvents="box-none">
            <View
              style={[
                s.dialog,
                { backgroundColor: k.card, borderColor: k.cardBorderStrong },
                kioskElevation(k.primary, isDark, 2),
              ]}
            >
              <Text style={[s.dialogTitle, { color: k.text }]} accessibilityRole="header">
                Pay with which jar?
              </Text>
              <Text style={[s.dialogBody, { color: k.textMuted }]} numberOfLines={2}>
                "{jarPicker.title}" costs {jarPicker.cost} coins
              </Text>
              {[
                { key: 'mainCoins' as const, label: 'Main Coins', balance: mainCoins },
                { key: 'gpCoins' as const, label: 'Grandparent Bonus', balance: gpCoins },
              ].map(j => {
                const canPay = j.balance >= jarPicker.cost;
                return (
                  <Pressable
                    key={j.key}
                    disabled={!canPay}
                    onPress={() => { redeemFrom(jarPicker, j.key); setJarPicker(null); }}
                    style={({ pressed }) => [
                      s.jar,
                      {
                        borderColor: canPay ? k.sageEdge : k.cardBorder,
                        backgroundColor: pressed ? k.cardHover : canPay ? k.sageSoft : k.well,
                        opacity: canPay ? 1 : 0.55,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${j.label}, ${j.balance} coins available`}
                    accessibilityState={{ disabled: !canPay }}
                    accessibilityHint={canPay ? `Redeem ${jarPicker.title} from this jar` : undefined}
                  >
                    <Text style={[s.jarLabel, { color: k.text }]} numberOfLines={1}>{j.label}</Text>
                    <Text style={[s.jarMeta, { color: k.textMuted }]} numberOfLines={1}>
                      {j.balance} coins available{!canPay ? ' — not enough' : ''}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setJarPicker(null)}
                style={s.dialogCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[s.dialogCancelText, { color: k.textMuted }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * A square icon-only action. Kept local rather than added to KioskOS: the
 * approve/decline pair is the only place in kiosk that wants an icon with
 * no label, and every other surface should be using ActionButton's labelled
 * form instead of reaching for this.
 */
function IconAction({ Icon, accent, k, isDark, label, onPress, filled = false }: {
  Icon: typeof Check; accent: string; k: KioskColors; isDark: boolean;
  label: string; onPress: () => void; filled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.iconBtn,
        filled
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: accent + (isDark ? '24' : '1A'), borderColor: accent + (isDark ? '4D' : '3D') },
        pressed && { opacity: 0.75 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={22} color={filled ? kioskOnAccent(k, accent) : accent} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  section: { marginBottom: KIOSK_SPACE.md },

  coinPill: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
  },
  coinText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingVertical: KIOSK_SPACE.sm, minHeight: KIOSK_HIT.control,
  },
  rowEmoji: { fontSize: 26 },
  rowEmojiSm: { fontSize: 20 },
  rowTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  rowMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  iconBtn: {
    width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_RADIUS.md,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  perk: {
    width: 190, maxWidth: '100%', minHeight: 180, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1,
    padding: KIOSK_SPACE.md, alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm,
  },
  perkEmoji: { fontSize: 40 },
  perkTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', textAlign: 'center' },
  needMore: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  emptyWell: { alignItems: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xl },

  dialogWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  dialog: {
    width: 420, maxWidth: '90%', borderRadius: KIOSK_RADIUS.xl, borderWidth: 1,
    padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.md,
  },
  dialogTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '900', letterSpacing: -0.3 },
  dialogBody: { fontSize: KIOSK_TYPO.body, fontWeight: '600', marginTop: -KIOSK_SPACE.xs },
  jar: { borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, padding: KIOSK_SPACE.md, minHeight: KIOSK_HIT.control, justifyContent: 'center' },
  jarLabel: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  jarMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  dialogCancel: { alignItems: 'center', justifyContent: 'center', minHeight: KIOSK_HIT.min },
  dialogCancelText: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
});
