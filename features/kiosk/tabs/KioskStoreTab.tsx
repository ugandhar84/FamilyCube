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
import { Gift, Coins, Plus, Pencil, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRewardStore, Reward } from '@/store/rewardStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS, kioskElevation } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { useChoreStore } from '@/store/choreStore';
import { showToast } from '@/components/AppToast';
import { KioskAvatar } from '../components/KioskAvatar';
import { Eyebrow } from '../components/KioskHomeParts';
import { KioskAddRewardForm, type RewardFormData } from '../components/KioskAddRewardForm';

export function KioskStoreTab({ active }: { active: FamilyMember }) {
  const { k, isDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const { rewards, redemptions, redeemReward, approveRedemption, rejectRedemption, addReward, updateReward, deleteReward } = useRewardStore();
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

  // Add/edit/delete perk catalog — real StoreScreen.tsx capability
  // (addReward/updateReward/deleteReward, all from useRewardStore()) that
  // kiosk had ZERO UI for at all [live-reported: "i figured out lot of
  // things are missing par with Mobile app store add /mod /del" / "please
  // aling those 2 pages with the exact mobile functionality"]. Parent-only,
  // same as mobile (PerkCard's onLongPress is isParent-gated there too).
  const [rewardFormOpen, setRewardFormOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  useKioskLockSuspended(rewardFormOpen);

  const openAddReward = () => { setEditingReward(null); setRewardFormOpen(true); };
  const openEditReward = (r: Reward) => { setEditingReward(r); setRewardFormOpen(true); };

  // Same real defaulting StoreScreen.tsx's own PerkModal onSave does:
  // create fills in available/requiresApproval/createdAt, edit only ever
  // patches the fields the form actually collects.
  const saveReward = (data: RewardFormData) => {
    if (editingReward) {
      updateReward?.(editingReward.id, data, active.id);
    } else {
      addReward?.({ available: true, requiresApproval: true, createdAt: new Date().toISOString(), ...data } as any);
    }
  };

  const confirmDeleteReward = (r: Reward) => {
    Alert.alert('Delete Perk?', `Remove "${r.title}" from the store?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReward?.(r.id) },
    ]);
  };

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

  const pastels = kioskPastels(k);
  const kidsList = useMemo(() => members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending' && (m.role === 'kid' || m.role === 'teen')), [members]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(eligible.map(r => r.category).filter(Boolean)))], [eligible]);
  const [cat, setCat] = useState('All');
  const shown = cat === 'All' ? eligible : eligible.filter(r => r.category === cat);
  const nextTarget = useMemo(
    () => [...eligible].filter(r => r.cost > maxAffordable).sort((a, b) => a.cost - b.cost)[0],
    [eligible, maxAffordable],
  );

  // Cash-out requests (a kid converting coins to money) — parent-only. Lived
  // on the old full chores board; the Rewards page is its natural home.
  const getPendingCashOuts = useChoreStore(st => st.getPendingCashOuts);
  const approveCashOut = useChoreStore(st => st.approveCashOut);
  const denyCashOut = useChoreStore(st => st.denyCashOut);
  const pointsToFiatRatio = useChoreStore(st => st.householdSettings.pointsToFiatRatio);
  const currencySymbol = useChoreStore(st => st.householdSettings.currencySymbol);
  const transactions = useChoreStore(st => st.transactions);
  const pendingCashOuts = useMemo(() => (isParent ? getPendingCashOuts() : []), [isParent, getPendingCashOuts, transactions]);

  const first = (m?: { name?: string }) => m?.name?.trim().split(' ')[0] ?? '';

  const redeemLabel = (r: Reward) => (maxAffordable >= r.cost ? 'Redeem' : `${r.cost - maxAffordable} to go`);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.page}>
        {/* ── Left: balance / approvals ── */}
        <ScrollView style={s.left} contentContainerStyle={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }} showsVerticalScrollIndicator={false} onScrollBeginDrag={registerActivity}>
          <Text style={[s.title, { color: k.text }]}>{isParent ? 'Rewards store' : 'Rewards'}</Text>

          {canRedeemSelf && (
            <LinearGradient colors={[k.pastelAmberCard, k.pastelPrimaryCard]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
              <Text style={[s.heroLabel, { color: k.textMuted }]}>MY COINS</Text>
              <View style={s.heroRow}>
                <Coins size={40} color={k.gold} strokeWidth={2.2} />
                <Text style={[s.heroNum, { color: k.text }]}>{totalCoins}</Text>
              </View>
              {gpCoins > 0 && <Text style={[s.heroSub, { color: k.textMuted }]}>Main {mainCoins} · Grandparent bonus {gpCoins}</Text>}
              {nextTarget ? (
                <>
                  <View style={[s.track, { backgroundColor: k.card }]}>
                    <View style={[s.fill, { backgroundColor: k.primary, width: `${Math.min(100, Math.round((maxAffordable / nextTarget.cost) * 100))}%` }]} />
                  </View>
                  <Text style={[s.heroSub, { color: k.textMuted }]}>{nextTarget.cost - maxAffordable} more coins to {nextTarget.emoji} {nextTarget.title}</Text>
                </>
              ) : eligible.length > 0 ? (
                <Text style={[s.heroSub, { color: k.textMuted }]}>You can afford everything. Nice work!</Text>
              ) : null}
            </LinearGradient>
          )}

          {isParent && (
            <View style={s.block}>
              <Eyebrow label="WAITING FOR YOUR OK" accent={k.terracotta} k={k} right={pending.length ? `${pending.length}` : undefined} />
              {pending.length === 0 ? (
                <View style={[s.clear, { backgroundColor: k.pastelSage }]}>
                  <Text style={[s.clearTitle, { color: k.sage }]}>All caught up ✓</Text>
                  <Text style={[s.rowMeta, { color: k.textMuted }]}>New reward requests show up here.</Text>
                </View>
              ) : pending.map(rd => {
                const reward = rewards.find(r => r.id === rd.rewardId);
                const kid = members.find(m => m.id === rd.memberId);
                const label = reward?.title ?? rd.rewardTitle ?? 'Perk';
                const who = first(kid) || first({ name: rd.memberName }) || 'A kid';
                return (
                  <View key={rd.id} style={[s.reqCard, { backgroundColor: k.pastelPrimary, borderColor: k.pastelPrimaryCard }]}>
                    <View style={[s.emojiTile, { backgroundColor: k.pastelPrimaryCard }]}><Text style={{ fontSize: 22 }}>{reward?.emoji ?? '🎁'}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.rowTitle, { color: k.text }]} numberOfLines={2}>{who} · {label}</Text>
                      <Text style={[s.rowMeta, { color: k.textMuted }]}>{rd.deductedCoins} coins held</Text>
                    </View>
                    <Pressable onPress={() => confirmApproval(rd.id, label, who, false)} accessibilityRole="button" accessibilityLabel={`Decline ${label} for ${who}`} style={[s.smallBtn, { backgroundColor: k.card }]}>
                      <Text style={[s.smallBtnText, { color: k.text }]}>Decline</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmApproval(rd.id, label, who, true)} accessibilityRole="button" accessibilityLabel={`Approve ${label} for ${who}`} style={[s.smallBtn, { backgroundColor: k.primary }]}>
                      <Text style={[s.smallBtnText, { color: k.onPrimary }]}>Approve</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {isParent && kidsList.length > 0 && (
            <View style={s.block}>
              <Eyebrow label="KID BALANCES" accent={k.gold} k={k} />
              {kidsList.map((m, i) => {
                const tone = pastels[(members.findIndex(x => x.id === m.id)) % pastels.length] ?? pastels[i % 4];
                const bal = ((m as any).mainCoins ?? 0) + ((m as any).gpCoins ?? 0);
                const top = Math.max(1, ...eligible.map(r => r.cost));
                return (
                  <View key={m.id} style={[s.kidCard, { backgroundColor: tone.col }]}>
                    <KioskAvatar name={m.name} emoji={m.emoji} avatarUrl={m.avatarUrl} size={44} bgColor={k.card} k={k} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowTitle, { color: k.text }]}>{first(m)}</Text>
                      <View style={[s.track, { backgroundColor: k.card, height: 8 }]}><View style={[s.fill, { height: 8, backgroundColor: tone.fg, width: `${Math.min(100, Math.round((bal / top) * 100))}%` }]} /></View>
                    </View>
                    <View style={[s.coinPill, { backgroundColor: k.pastelAmberCard }]}><Coins size={15} color={k.gold} /><Text style={[s.coinText, { color: k.gold }]}>{bal}</Text></View>
                  </View>
                );
              })}
            </View>
          )}

          {isParent && pendingCashOuts.length > 0 && (
            <View style={s.block}>
              <Eyebrow label="CASH-OUT REQUESTS" accent={k.sage} k={k} right={`${pendingCashOuts.length}`} />
              {pendingCashOuts.map(req => {
                const member = members.find(m => m.id === req.userId);
                return (
                  <View key={req.id} style={[s.cashCard, { backgroundColor: k.pastelSage, borderColor: k.pastelSageCard }]}>
                    <View style={s.cashHead}>
                      <Text style={[s.rowTitle, { color: k.text, flex: 1 }]} numberOfLines={1}>{first(member) || req.userId} · Cash-out</Text>
                      <Text style={[s.cashTotal, { color: k.sage }]}>{currencySymbol}{(req.amount * pointsToFiatRatio).toFixed(2)}</Text>
                    </View>
                    {([['Spend', req.spendAllocation], ['Save', req.saveAllocation], ['Give', req.giveAllocation]] as const).map(([l, v]) => (
                      <View key={l} style={{ flexDirection: 'row' }}>
                        <Text style={[s.rowMeta, { color: k.textMuted, flex: 1, marginTop: 0 }]}>{l}</Text>
                        <Text style={[s.rowMeta, { color: k.sage, marginTop: 0 }]}>{v} pts ({currencySymbol}{(v * pointsToFiatRatio).toFixed(2)})</Text>
                      </View>
                    ))}
                    <View style={s.cashBtns}>
                      <Pressable
                        onPress={() => { registerActivity(); Alert.alert('Deny Cash-Out?', 'Funds stay in their wallet.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Deny', style: 'destructive', onPress: () => denyCashOut(req.id) }]); }}
                        accessibilityRole="button" accessibilityLabel="Deny this cash-out request" style={[s.smallBtn, { flex: 1, backgroundColor: k.card }]}>
                        <Text style={[s.smallBtnText, { color: k.text }]}>Deny</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { registerActivity(); approveCashOut(req.id); showToast('Payout approved ✓'); }}
                        accessibilityRole="button" accessibilityLabel="Approve this cash-out payout" style={[s.smallBtn, { flex: 1.5, backgroundColor: k.primary }]}>
                        <Text style={[s.smallBtnText, { color: k.onPrimary }]}>Approve payout</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {canRedeemSelf && mine.length > 0 && (
            <View style={s.block}>
              <Eyebrow label="MY REQUESTS" accent={k.purple} k={k} />
              {mine.map(rd => {
                const reward = rewards.find(r => r.id === rd.rewardId);
                const meta = statusMeta[rd.status] ?? statusMeta.pending;
                return (
                  <View key={rd.id} style={[s.reqCard, { backgroundColor: k.pastelLav, borderColor: k.pastelLavCard }]}>
                    <View style={[s.emojiTile, { backgroundColor: k.pastelLavCard }]}><Text style={{ fontSize: 22 }}>{reward?.emoji ?? '🎁'}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.rowTitle, { color: k.text }]} numberOfLines={1}>{reward?.title ?? rd.rewardTitle ?? 'Perk'}</Text>
                      <Text style={[s.rowMeta, { color: k.textMuted }]}>{rd.deductedCoins} coins</Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: meta.accent + '24' }]}><Text style={[s.statusText, { color: meta.accent }]}>{meta.label}</Text></View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* ── Right: catalog ── */}
        <View style={s.right}>
          <View style={s.catRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cats} style={{ flex: 1 }}>
              {categories.map(c => (
                <Pressable key={c} onPress={() => setCat(c)} accessibilityRole="button" accessibilityState={{ selected: cat === c }}
                  style={[s.catChip, { backgroundColor: cat === c ? k.text : k.well }]}>
                  <Text style={[s.catText, { color: cat === c ? k.card : k.textMuted }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {isParent && (
              <Pressable onPress={openAddReward} accessibilityRole="button" accessibilityLabel="Add a perk" style={[s.addBtn, { backgroundColor: k.primary }]}>
                <Plus size={18} color={k.onPrimary} strokeWidth={2.6} />
                <Text style={[s.catText, { color: k.onPrimary }]}>Add perk</Text>
              </Pressable>
            )}
          </View>

          {shown.length === 0 ? (
            <View style={[s.clear, { backgroundColor: k.well, alignItems: 'center' }]}>
              <Gift size={30} color={k.textFaint} />
              <Text style={[s.rowMeta, { color: k.textMuted, textAlign: 'center' }]}>
                {eligible.length === 0 ? 'No rewards available right now. A parent can add perks with Add perk.' : 'Nothing in this category.'}
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.grid}>
              {shown.map((r, i) => {
                const tone = pastels[i % pastels.length];
                const affordable = canRedeemSelf && maxAffordable >= r.cost;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => (canRedeemSelf ? (affordable ? onRedeem(r) : undefined) : isParent ? openEditReward(r) : undefined)}
                    onLongPress={isParent ? () => openEditReward(r) : undefined}
                    disabled={!canRedeemSelf && !isParent}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.title}, ${r.cost} coins`}
                    accessibilityHint={isParent ? 'Edit this perk' : affordable ? 'Redeem this reward' : `Not enough coins yet, ${r.cost - maxAffordable} more needed`}
                    style={({ pressed }) => [s.perk, { backgroundColor: tone.col, borderColor: tone.card }, pressed && { opacity: 0.8 }]}
                  >
                    <View style={s.perkTop}>
                      <View style={[s.perkEmoji, { backgroundColor: tone.card }]}><Text style={{ fontSize: 34 }}>{r.emoji}</Text></View>
                      {isParent && (
                        <Pressable onPress={() => confirmDeleteReward(r)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete ${r.title}`} style={[s.perkDelete, { backgroundColor: k.card }]}>
                          <Trash2 size={14} color={k.danger} />
                        </Pressable>
                      )}
                    </View>
                    <Text style={[s.perkTitle, { color: k.text }]} numberOfLines={2}>{r.title}</Text>
                    <Text style={[s.rowMeta, { color: k.textMuted, marginTop: 0 }]}>{r.category}</Text>
                    <View style={s.perkBottom}>
                      <View style={[s.coinPill, { backgroundColor: k.pastelAmberCard }]}><Coins size={15} color={k.gold} /><Text style={[s.coinText, { color: k.gold }]}>{r.cost}</Text></View>
                      {canRedeemSelf ? (
                        <View style={[s.perkBtn, { backgroundColor: affordable ? k.primary : k.card }]}>
                          <Text style={[s.perkBtnText, { color: affordable ? k.onPrimary : k.textFaint }]}>{redeemLabel(r)}</Text>
                        </View>
                      ) : isParent ? (
                        <View style={[s.perkBtn, { backgroundColor: k.card }]}><Pencil size={15} color={k.text} /><Text style={[s.perkBtnText, { color: k.text }]}>Edit</Text></View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>

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

      <KioskAddRewardForm
        visible={rewardFormOpen}
        editing={editingReward}
        onClose={() => setRewardFormOpen(false)}
        onSave={saveReward}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', gap: KIOSK_SPACE.lg, paddingHorizontal: KIOSK_SPACE.xl, paddingTop: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md, minHeight: 0 },
  left: { width: 360, flexGrow: 0 },
  right: { flex: 1, minWidth: 0, gap: KIOSK_SPACE.md },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  hero: { borderRadius: 26, padding: KIOSK_SPACE.lg, gap: 8 },
  heroLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1.1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroNum: { fontSize: 50, fontWeight: '800', letterSpacing: -2 },
  heroSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  track: { height: 12, borderRadius: 6, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 6 },
  block: { gap: KIOSK_SPACE.sm },
  clear: { borderRadius: KIOSK_RADIUS.xl, padding: KIOSK_SPACE.lg, gap: 4 },
  clearTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '800' },
  reqCard: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1.5, padding: 10 },
  emojiTile: { width: 46, height: 46, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  rowMeta: { fontSize: KIOSK_TYPO.label, fontWeight: '700', marginTop: 2 },
  smallBtn: { minHeight: 44, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  statusPill: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  kidCard: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, padding: 12 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, paddingHorizontal: 11, paddingVertical: 5 },
  coinText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  cashCard: { borderRadius: KIOSK_RADIUS.lg, borderWidth: 1.5, padding: KIOSK_SPACE.md, gap: 6 },
  cashHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cashTotal: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  cashBtns: { flexDirection: 'row', gap: KIOSK_SPACE.sm, marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  cats: { gap: 8, paddingRight: 8 },
  catChip: { minHeight: 44, borderRadius: 100, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  catText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 100, paddingHorizontal: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.xl },
  perk: { width: '32.3%', borderRadius: KIOSK_RADIUS.xl, borderWidth: 1.5, padding: KIOSK_SPACE.md, gap: 6, minHeight: 200 },
  perkTop: { flexDirection: 'row', justifyContent: 'space-between' },
  perkEmoji: { width: 64, height: 64, borderRadius: KIOSK_RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  perkDelete: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  perkTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', lineHeight: 21 },
  perkBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 'auto' },
  perkBtn: { flex: 1, minHeight: 44, borderRadius: KIOSK_RADIUS.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  perkBtnText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },

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
