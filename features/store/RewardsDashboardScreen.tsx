/**
 * Rewards Dashboard — rebuilt to School's flat field-card rhythm
 * (SchoolHomeScreen.tsx): FAMILY CUBE / FAMILY eyebrow + role label,
 * breadcrumb, 29px title, bordered flat cards (no shadows/colored
 * backgrounds), full-width action buttons [live-requested: "make rewards
 * module similar to school"]. Same data/behavior as before — balance,
 * featured perk, perk list, receipts (kid/teen/senior) or piggy banks,
 * pending approvals, history (parent) — only the visual shell changed.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useRewardStore, Reward } from '@/store/rewardStore';
import { showToast } from '@/components/AppToast';
import {
  CheckCircle, XCircle, ChevronRight, ShoppingBag, Flame,
} from 'lucide-react-native';
import NotificationPanel from '@/components/NotificationPanel';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import StoreScreen from './StoreScreen';
import FullPageOverlay from '@/components/FullPageOverlay';

// ─── Figma tokens — same palette SchoolHomeScreen.tsx uses ──────────────────
const CANVAS = '#FFFFFF';
const TITLE_CLR = '#172337';
const BODY_CLR = '#657185';
const BLUE = '#345DE3';
const LINK_BLUE = '#294FC7';
const BORDER = '#E8EBF0';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F5F7FB';
const GREEN_TXT = '#1B7A54';
const AMBER_TXT = '#B5720A';
const RED_TXT = '#C0392B';
const PURPLE_TXT = '#6A4FBF';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const date = fmtDate(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} · ${time}`;
}

// ─── Flat bordered card shell — School's rhythm, no shadows ─────────────────
function Card({ children, colors, isDark, style }: {
  children: React.ReactNode; colors: any; isDark: boolean; style?: object;
}) {
  return (
    <View style={[{
      borderWidth: 1, borderColor: isDark ? colors.border : BORDER, borderRadius: 16,
      backgroundColor: isDark ? colors.card : CARD_BG, overflow: 'hidden',
    }, style]}>
      {children}
    </View>
  );
}

// ─── Section heading inside a card ───────────────────────────────────────────
// Plain bold section heading — School's actual rhythm (SchoolDayScreen.tsx/
// HomeownerNotesTab.tsx: fontSize 15, weight 700, no uppercase, no accent
// bar, no colored text) [live-requested: "Why section heading not Figma
// styles"] — was a leftover dashboard-style uppercase green label with a
// colored accent bar, never actually matched School's own heading style.
function CardSection({ label, colors, isDark, children }: {
  label: string; colors: any; isDark: boolean; children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.textPrimary : TITLE_CLR, marginBottom: 10 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ status, colors, isDark }: { status: string; colors: any; isDark: boolean }) {
  const map: Record<string, { label: string; light: string; dark: string }> = {
    pending:   { label: 'Pending',   light: AMBER_TXT,  dark: colors.amber  },
    approved:  { label: 'Fulfilled', light: GREEN_TXT,  dark: colors.teal   },
    rejected:  { label: 'Declined',  light: RED_TXT,    dark: colors.danger },
    cancelled: { label: 'Cancelled', light: '#666',     dark: colors.textTertiary },
  };
  const m = map[status] ?? map.pending;
  const c = isDark ? m.dark : m.light;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: c + '22' }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: c }}>{m.label}</Text>
    </View>
  );
}

function Divider({ colors, isDark }: { colors: any; isDark: boolean }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: isDark ? colors.border : BORDER }} />;
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function RewardsDashboardScreen({
  hideHeader = false,
  onClose,
  backLabel = 'Hub',
}: {
  hideHeader?: boolean;
  onClose?: () => void;
  /** Text after the "‹" in the top-left back link — defaults to 'Hub'
   *  (opened from HubScreen's coin pill/quick-access pill/kid cards), but
   *  FamilyScreen passes 'Family' when it opens this as its own
   *  FullPageOverlay so the visible breadcrumb matches where swipe-back/
   *  onClose actually lands. */
  backLabel?: string;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const { rewards, redemptions, redeemReward, approveRedemption, rejectRedemption } = useRewardStore();

  const [notifOpen, setNotifOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);

  const activeMember  = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent      = activeMember?.role === 'parent';
  const canRedeemSelf = activeMember?.role === 'kid' || activeMember?.role === 'teen' || activeMember?.role === 'senior';

  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const parentLabel = activeMember ? `${activeMember.name.split(' ')[0]} · ${
    activeMember.role === 'parent' ? 'Parent' : activeMember.role === 'teen' ? 'Teen' : activeMember.role === 'senior' ? 'Grandparent' : 'Kid'
  }` : '';

  const myMainCoins = (activeMember as any)?.mainCoins ?? 0;
  const myGpCoins   = (activeMember as any)?.gpCoins   ?? 0;
  const myCoins     = myMainCoins + myGpCoins;

  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;

  useEffect(() => {
    hideTabBar();
    return () => { showTabBar(); };
  }, []);

  const availableRewards = useMemo(() =>
    rewards.filter(r => r.available).sort((a, b) => a.cost - b.cost),
    [rewards]
  );

  const featuredReward = availableRewards.find(r => myCoins >= r.cost && !r.requiresApproval)
    ?? availableRewards[0];
  const listRewards = availableRewards.filter(r => r.id !== featuredReward?.id).slice(0, 8);

  const myReceipts = useMemo(() =>
    redemptions
      .filter(r => r.memberId === activeMember?.id)
      .sort((a, b) => (b.redeemedAt ?? '').localeCompare(a.redeemedAt ?? ''))
      .slice(0, 10),
    [redemptions, activeMember?.id]
  );

  const pendingApprovals = redemptions.filter(r => r.status === 'pending');

  const history = useMemo(() =>
    redemptions
      .filter(r => r.status !== 'pending')
      .sort((a, b) => (b.respondedAt ?? b.redeemedAt ?? '').localeCompare(a.respondedAt ?? a.redeemedAt ?? ''))
      .slice(0, 10),
    [redemptions]
  );

  const handleRedeem = async (reward: Reward) => {
    if (!activeMember) return;
    if (myCoins < reward.cost) {
      Alert.alert('Not enough coins', `You need ${reward.cost - myCoins} more coins.`);
      return;
    }
    const wallet = myMainCoins >= reward.cost ? 'mainCoins' : 'gpCoins';
    const ok = await redeemReward(reward.id, activeMember.id, wallet);
    if (!ok) { showToast('Unable to redeem — try again'); return; }
    showToast(reward.requiresApproval
      ? '⏳ Requested — waiting for parent approval'
      : `${reward.emoji} Redeemed!`);
  };

  const handleApprove = (id: string) => {
    approveRedemption(id, activeMemberId ?? '');
    showToast('Approved ✓');
  };
  const handleReject = (id: string) => {
    rejectRedemption(id, activeMemberId ?? '');
    showToast('Declined');
  };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <NotificationPanel visible={notifOpen} onClose={() => setNotifOpen(false)} />

      <FullPageOverlay visible={storeOpen} onDismiss={() => setStoreOpen(false)} zIndex={60}>
        <StoreScreen hideHeader={false} />
      </FullPageOverlay>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {!hideHeader && (
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: bodyC }}>
                FAMILY CUBE / {familyName.toUpperCase()}
              </Text>
              {!!parentLabel && (
                <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC }}>{parentLabel}</Text>
              )}
            </View>
            {onClose && (
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? BLUE : LINK_BLUE, marginTop: 10 }}>
                  ‹ {backLabel}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
              {canRedeemSelf ? 'You earned a choice' : 'Family Rewards'}
            </Text>
            <Text style={{ fontSize: 14, color: bodyC, marginTop: 4, lineHeight: 20 }}>
              {canRedeemSelf
                ? "Spend your coins on perks you've earned."
                : 'Review requests, track redemptions, and manage the perks store.'}
            </Text>
          </View>
        )}

        <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 12 }}>

          {/* ══════════════════════════════════════════
              KID / TEEN / SENIOR VIEW
          ══════════════════════════════════════════ */}
          {canRedeemSelf && (
            <>
              {/* Balance card */}
              <Card colors={colors} isDark={isDark}>
                <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 20 }}>🪙</Text>
                      <Text style={{ fontSize: 28, fontWeight: '800', color: isDark ? colors.amber : AMBER_TXT }}>
                        {myCoins} coins
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: bodyC }}>Available to spend</Text>
                    {myGpCoins > 0 && (
                      <Text style={{ fontSize: 12, color: isDark ? colors.textTertiary : BODY_CLR, marginTop: 4 }}>
                        {myMainCoins} main · {myGpCoins} grandparent bonus
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setStoreOpen(true)}
                    style={{ padding: 10, borderRadius: 12, backgroundColor: isDark ? colors.surface : SURFACE }}>
                    <ShoppingBag size={20} color={isDark ? colors.teal : GREEN_TXT} />
                  </TouchableOpacity>
                </View>
              </Card>

              {/* Featured reward */}
              {featuredReward && (
                <Card colors={colors} isDark={isDark} style={{ padding: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5,
                    color: isDark ? colors.amber : AMBER_TXT, marginBottom: 8 }}>
                    {featuredReward.cost} coins · available now
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', lineHeight: 26, color: titleC, marginBottom: 6 }}>
                    {featuredReward.emoji} {featuredReward.title}
                  </Text>
                  {featuredReward.description ? (
                    <Text style={{ fontSize: 14, color: bodyC, lineHeight: 20, marginBottom: 14 }}>
                      {featuredReward.description}
                    </Text>
                  ) : <View style={{ height: 10 }} />}
                  <TouchableOpacity onPress={() => handleRedeem(featuredReward)}
                    style={{ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                      Redeem · {featuredReward.cost} coins
                    </Text>
                  </TouchableOpacity>
                </Card>
              )}

              {/* Perk list */}
              {listRewards.length > 0 && (
                <Card colors={colors} isDark={isDark}>
                  <View style={{ paddingVertical: 2 }}>
                    {listRewards.map((reward, i) => {
                      const canAfford = myCoins >= reward.cost;
                      let statusLabel = canAfford ? 'can afford' : `need ${reward.cost - myCoins} more`;
                      let statusColor = canAfford
                        ? (isDark ? colors.teal : GREEN_TXT)
                        : (isDark ? colors.danger : RED_TXT);
                      if (reward.requiresApproval && canAfford) {
                        statusLabel = 'parent approval needed';
                        statusColor = isDark ? colors.pink : PURPLE_TXT;
                      }
                      return (
                        <View key={reward.id}>
                          {i > 0 && <Divider colors={colors} isDark={isDark} />}
                          <TouchableOpacity onPress={() => handleRedeem(reward)}
                            style={{ paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }} numberOfLines={1}>
                                {reward.emoji} {reward.title} · {reward.cost}
                              </Text>
                              <Text style={{ fontSize: 12, marginTop: 2, color: statusColor }}>
                                {reward.cost} coins · {!reward.requiresApproval ? 'instant · ' : ''}{statusLabel}
                              </Text>
                            </View>
                            <ChevronRight size={16} color={isDark ? colors.textTertiary : BODY_CLR} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              )}

              {/* Browse all perks */}
              <TouchableOpacity onPress={() => setStoreOpen(true)}
                style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                  borderWidth: 1.5, borderColor: BLUE, backgroundColor: isDark ? colors.surface : '#EEF3FB' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? BLUE : LINK_BLUE }}>
                  Browse all perks in the store →
                </Text>
              </TouchableOpacity>

              {/* My receipts */}
              {myReceipts.length > 0 && (
                <Card colors={colors} isDark={isDark}>
                  <CardSection label="My Receipts" colors={colors} isDark={isDark}>
                    {myReceipts.map((rd, i) => {
                      const reward = rewards.find(r => r.id === rd.rewardId);
                      return (
                        <View key={rd.id}>
                          {i > 0 && <Divider colors={colors} isDark={isDark} />}
                          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 }}>
                            <Text style={{ fontSize: 18 }}>{reward?.emoji ?? '🎁'}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }} numberOfLines={1}>
                                {reward?.title ?? rd.rewardTitle ?? 'Perk'}
                              </Text>
                              <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>
                                {rd.deductedCoins} coins · {fmtDateTime(rd.redeemedAt)}
                              </Text>
                            </View>
                            <StatusPill status={rd.status} colors={colors} isDark={isDark} />
                          </View>
                        </View>
                      );
                    })}
                    <View style={{ height: 8 }} />
                  </CardSection>
                </Card>
              )}

              {availableRewards.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                  <Text style={{ fontSize: 36 }}>🎁</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>No perks yet</Text>
                  <Text style={{ fontSize: 14, color: bodyC, textAlign: 'center' }}>
                    Ask a parent to add perks to the store.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════
              PARENT VIEW
          ══════════════════════════════════════════ */}
          {isParent && (
            <>
              {/* Kids' Piggy Banks */}
              {members.filter(m => m.role === 'kid' || m.role === 'teen').length > 0 && (
                <Card colors={colors} isDark={isDark}>
                  <CardSection label="Kids' Piggy Banks" colors={colors} isDark={isDark}>
                    <View style={{ paddingBottom: 4 }}>
                      {members
                        .filter(m => m.role === 'kid' || m.role === 'teen')
                        .map((kid, i) => {
                          const mainCoins = (kid as any).mainCoins ?? 0;
                          const gpCoins   = (kid as any).gpCoins   ?? 0;
                          const total     = mainCoins + gpCoins;
                          const streak    = (kid as any).streak ?? 0;
                          const goal = rewards
                            .filter(r => r.available && r.cost > 0 &&
                              (!r.eligibleMemberIds || r.eligibleMemberIds.includes(kid.id)))
                            .sort((a, b) => a.cost - b.cost)
                            .find(r => r.cost > 0) ?? null;
                          const maxAffordable = Math.max(mainCoins, gpCoins);
                          const pct = goal ? Math.min(maxAffordable / goal.cost, 1) : 0;
                          return (
                            <View key={kid.id}>
                              {i > 0 && <Divider colors={colors} isDark={isDark} />}
                              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 }}>
                                <View style={{ width: 44, height: 44, borderRadius: 13,
                                  backgroundColor: isDark ? colors.surface : SURFACE,
                                  alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 22 }}>{(kid as any).emoji ?? '🙂'}</Text>
                                </View>
                                <View style={{ flex: 1, gap: 3 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: titleC }}>
                                      {(kid as any).name?.split(' ')[0]}
                                    </Text>
                                    {streak > 0 && (
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                                        borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
                                        backgroundColor: isDark ? colors.amberLight : '#FEF3D8' }}>
                                        <Flame size={10} color={isDark ? colors.amber : AMBER_TXT} />
                                        <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? colors.amber : AMBER_TXT }}>
                                          {streak}-day
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                  {goal ? (
                                    <>
                                      <Text style={{ fontSize: 12, color: bodyC }} numberOfLines={1}>
                                        Goal: {goal.title}
                                      </Text>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={{ flex: 1, height: 5, borderRadius: 3,
                                          backgroundColor: isDark ? colors.surface : SURFACE, overflow: 'hidden' }}>
                                          <View style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 3,
                                            backgroundColor: isDark ? colors.teal : GREEN_TXT }} />
                                        </View>
                                        <Text style={{ fontSize: 11, fontWeight: '700',
                                          color: isDark ? colors.teal : GREEN_TXT, minWidth: 32, textAlign: 'right' }}>
                                          {Math.round(pct * 100)}%
                                        </Text>
                                      </View>
                                    </>
                                  ) : (
                                    <Text style={{ fontSize: 12, color: isDark ? colors.textTertiary : BODY_CLR }}>No goal set</Text>
                                  )}
                                </View>
                                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                                    <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? colors.amber : AMBER_TXT }}>
                                      {total}
                                    </Text>
                                    <Text style={{ fontSize: 13 }}>🪙</Text>
                                  </View>
                                  {gpCoins > 0 && (
                                    <Text style={{ fontSize: 10, color: isDark ? colors.textTertiary : BODY_CLR }}>+{gpCoins} GP</Text>
                                  )}
                                </View>
                              </View>
                            </View>
                          );
                        })}
                    </View>
                  </CardSection>
                </Card>
              )}

              {/* Pending approvals */}
              {pendingApprovals.length > 0 && (
                <Card colors={colors} isDark={isDark}>
                  <CardSection label={`Pending Requests · ${pendingApprovals.length}`} colors={colors} isDark={isDark}>
                    {pendingApprovals.map((rd, i) => {
                      const reward = rewards.find(r => r.id === rd.rewardId);
                      const kid    = members.find(m => m.id === rd.memberId);
                      return (
                        <View key={rd.id}>
                          {i > 0 && <Divider colors={colors} isDark={isDark} />}
                          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 }}>
                            <View style={{ width: 38, height: 38, borderRadius: 11,
                              backgroundColor: isDark ? colors.surface : SURFACE,
                              alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 18 }}>{reward?.emoji ?? '🎁'}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }} numberOfLines={1}>
                                {reward?.title ?? rd.rewardTitle ?? 'Perk'}
                              </Text>
                              <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>
                                {kid?.name?.split(' ')[0] ?? rd.memberName?.split(' ')[0] ?? 'Kid'} · {rd.deductedCoins} coins
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => handleReject(rd.id)}
                              style={{ width: 34, height: 34, borderRadius: 10,
                                backgroundColor: (isDark ? colors.danger : RED_TXT) + '18',
                                alignItems: 'center', justifyContent: 'center' }}>
                              <XCircle size={16} color={isDark ? colors.danger : RED_TXT} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleApprove(rd.id)}
                              style={{ width: 34, height: 34, borderRadius: 10, marginLeft: 8,
                                backgroundColor: (isDark ? colors.teal : GREEN_TXT) + '18',
                                alignItems: 'center', justifyContent: 'center' }}>
                              <CheckCircle size={16} color={isDark ? colors.teal : GREEN_TXT} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    <View style={{ height: 8 }} />
                  </CardSection>
                </Card>
              )}

              {/* History */}
              {history.length > 0 && (
                <Card colors={colors} isDark={isDark}>
                  <CardSection label="Recent Transactions" colors={colors} isDark={isDark}>
                    {history.map((rd, i) => {
                      const reward = rewards.find(r => r.id === rd.rewardId);
                      const kid    = members.find(m => m.id === rd.memberId);
                      return (
                        <View key={rd.id}>
                          {i > 0 && <Divider colors={colors} isDark={isDark} />}
                          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 10,
                              backgroundColor: isDark ? colors.surface : SURFACE,
                              alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 17 }}>{reward?.emoji ?? '🎁'}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: titleC }} numberOfLines={1}>
                                {reward?.title ?? rd.rewardTitle ?? 'Perk'}
                              </Text>
                              <Text style={{ fontSize: 12, color: bodyC, marginTop: 2 }}>
                                {kid?.name?.split(' ')[0] ?? rd.memberName?.split(' ')[0] ?? 'Member'} · {rd.deductedCoins} coins · {fmtDate(rd.redeemedAt)}
                              </Text>
                            </View>
                            <StatusPill status={rd.status} colors={colors} isDark={isDark} />
                          </View>
                        </View>
                      );
                    })}
                    <View style={{ height: 8 }} />
                  </CardSection>
                </Card>
              )}

              {/* Browse store */}
              <TouchableOpacity onPress={() => setStoreOpen(true)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: cardBg,
                  paddingHorizontal: 16, paddingVertical: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 13,
                    backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
                    <ShoppingBag size={22} color="#fff" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>Perks Store</Text>
                    <Text style={{ fontSize: 12, color: bodyC, marginTop: 1 }}>
                      {rewards.filter(r => r.available).length} perks · manage & add
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} color={isDark ? colors.textTertiary : BODY_CLR} />
              </TouchableOpacity>

              {pendingApprovals.length === 0 && history.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                  <Text style={{ fontSize: 32 }}>🎁</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: titleC }}>No activity yet</Text>
                  <Text style={{ fontSize: 14, color: bodyC, textAlign: 'center', lineHeight: 20 }}>
                    Add perks in the store and kids can start redeeming their coins.
                  </Text>
                </View>
              )}
            </>
          )}

        </View>
      </ScrollView>
    </View>
  );
}
