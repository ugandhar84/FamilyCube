/**
 * Rewards Dashboard — ReviewInbox-style header + full-width Figma cards.
 * No AppHeader, no bottom tab bar. Same rhythm as MealsScreen.
 *
 * Kid/teen: balance hero → "You earned a choice" CTA → perk list → receipts.
 * Parent: pending approvals → history → browse store link.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, Alert,
  StyleSheet, Platform,
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

// ─── Palette (matches screenshot) ───────────────────────────────────────────
const AMBER_BG   = '#FDF3D8';
const AMBER_TXT  = '#B5720A';
const GREEN_TXT  = '#1B7A54';
const BLUE_BTN   = '#345DE3';
const BLUE_LIGHT = '#EEF1FC';
const RED_TXT    = '#C0392B';
const PURPLE_TXT = '#6A4FBF';
const BORDER     = '#DFE5EF';

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

// ─── Full-width card shell ────────────────────────────────────────────────────
function Card({ children, bg, style, colors, isDark }: {
  children: React.ReactNode; bg?: string; style?: object; colors: any; isDark: boolean;
}) {
  return (
    <View style={[{
      borderRadius: 22, overflow: 'hidden',
      backgroundColor: isDark ? colors.card : (bg ?? '#fff'),
      ...Platform.select({
        ios: {
          shadowColor: colors.navy ?? '#2C2722',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.2 : 0.09,
          shadowRadius: 14,
        },
        android: { elevation: isDark ? 0 : 3 },
      }),
    }, style]}>
      {children}
    </View>
  );
}

// ─── Section heading inside a card ───────────────────────────────────────────
function CardSection({ label, accent, children }: {
  label: string; accent: string; children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: accent }} />
        <Text style={{ fontSize: 12, fontWeight: '800', color: accent,
          textTransform: 'uppercase', letterSpacing: 0.7 }}>
          {label}
        </Text>
      </View>
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
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
      backgroundColor: c + '22' }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: c }}>{m.label}</Text>
    </View>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
function Divider({ colors, isDark }: { colors: any; isDark: boolean }) {
  return <View style={{ height: StyleSheet.hairlineWidth,
    backgroundColor: isDark ? colors.border : BORDER }} />;
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function RewardsDashboardScreen({
  hideHeader = false,
  onClose,
  backLabel = 'Hub',
}: {
  hideHeader?: boolean;
  onClose?: () => void;
  /** Text after the "←" in the top-left back link — defaults to 'Hub'
   *  (opened from HubScreen's coin pill/quick-access pill/kid cards), but
   *  FamilyScreen passes 'Family' when it opens this as its own
   *  FullPageOverlay [live-requested: "Back swipe of reward should go to
   *  family"] so the visible breadcrumb matches where swipe-back/onClose
   *  actually lands. */
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
  const P = colors.primary;

  const myMainCoins = (activeMember as any)?.mainCoins ?? 0;
  const myGpCoins   = (activeMember as any)?.gpCoins   ?? 0;
  const myCoins     = myMainCoins + myGpCoins;

  const canvas = isDark ? colors.background : '#F3F5F2';

  // Hide tab bar while this screen is mounted
  useEffect(() => {
    hideTabBar();
    return () => { showTabBar(); };
  }, []);

  // Available perks
  const availableRewards = useMemo(() =>
    rewards.filter(r => r.available).sort((a, b) => a.cost - b.cost),
    [rewards]
  );

  const featuredReward = availableRewards.find(r => myCoins >= r.cost && !r.requiresApproval)
    ?? availableRewards[0];
  const listRewards = availableRewards.filter(r => r.id !== featuredReward?.id).slice(0, 8);

  // Own receipts
  const myReceipts = useMemo(() =>
    redemptions
      .filter(r => r.memberId === activeMember?.id)
      .sort((a, b) => (b.redeemedAt ?? '').localeCompare(a.redeemedAt ?? ''))
      .slice(0, 10),
    [redemptions, activeMember?.id]
  );

  // Pending (parent)
  const pendingApprovals = redemptions.filter(r => r.status === 'pending');

  // History last 10 (parent)
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

      {/* Store overlay */}
      <FullPageOverlay visible={storeOpen} onDismiss={() => setStoreOpen(false)} zIndex={60}>
        <StoreScreen hideHeader={false} />
      </FullPageOverlay>

      {/* ── ReviewInbox-style header ── */}
      {!hideHeader && (
        <View style={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
          paddingBottom: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
          backgroundColor: canvas,
          gap: 6,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5,
              color: colors.textSecondary }}>
              FAMILY CUBE / {familyName.toUpperCase()}
            </Text>
            {activeMember && (
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
                {(activeMember as any).name} · {isParent ? 'Parent' : 'Member'}
              </Text>
            )}
          </View>

          {onClose && (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← {backLabel}</Text>
            </TouchableOpacity>
          )}

          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34,
            letterSpacing: -0.5, color: colors.textPrimary }}>
            {canRedeemSelf ? 'You earned a choice' : 'Family Rewards'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
            {canRedeemSelf
              ? "Spend your coins on perks you've earned."
              : 'Review requests, track redemptions, and manage the perks store.'}
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 20,
          gap: 14,
          paddingBottom: insets.bottom + 40,
        }}>

        {/* ══════════════════════════════════════════
            KID / TEEN / SENIOR VIEW
        ══════════════════════════════════════════ */}
        {canRedeemSelf && (
          <>
            {/* Balance hero card */}
            <Card bg={isDark ? colors.card : AMBER_BG} colors={colors} isDark={isDark}>
              <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 22 }}>🪙</Text>
                    <Text style={{ fontSize: 32, fontWeight: '900',
                      color: isDark ? colors.amber : AMBER_TXT }}>
                      {myCoins} coins
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                    Available to spend
                  </Text>
                  {myGpCoins > 0 && (
                    <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>
                      {myMainCoins} main · {myGpCoins} grandparent bonus
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setStoreOpen(true)}
                  style={{ padding: 10, borderRadius: 12,
                    backgroundColor: (isDark ? colors.amber : AMBER_TXT) + '20' }}>
                  <ShoppingBag size={22} color={isDark ? colors.amber : AMBER_TXT} />
                </TouchableOpacity>
              </View>
            </Card>

            {/* Featured reward CTA */}
            {featuredReward && (
              <Card bg={isDark ? colors.card : AMBER_BG} colors={colors} isDark={isDark}>
                <View style={{ padding: 20 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5,
                    color: isDark ? colors.amber : AMBER_TXT, marginBottom: 8 }}>
                    {featuredReward.cost} coins · available now
                  </Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', lineHeight: 28,
                    color: colors.textPrimary, marginBottom: 6 }}>
                    {featuredReward.emoji} {featuredReward.title}
                  </Text>
                  {featuredReward.description ? (
                    <Text style={{ fontSize: 14, color: colors.textSecondary,
                      lineHeight: 20, marginBottom: 18 }}>
                      {featuredReward.description}
                    </Text>
                  ) : <View style={{ height: 12 }} />}
                  <TouchableOpacity onPress={() => handleRedeem(featuredReward)}
                    style={{ backgroundColor: BLUE_BTN, borderRadius: 14,
                      paddingVertical: 15, alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                      Redeem · {featuredReward.cost} coins
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>
            )}

            {/* Perk list */}
            {listRewards.length > 0 && (
              <Card bg="#fff" colors={colors} isDark={isDark}>
                <View style={{ paddingVertical: 6 }}>
                  {listRewards.map((reward, i) => {
                    const canAfford = myCoins >= reward.cost;
                    let statusLabel = canAfford ? 'can afford' : `need ${reward.cost - myCoins} more`;
                    let statusColor = canAfford
                      ? (isDark ? colors.amber : AMBER_TXT)
                      : (isDark ? colors.danger : RED_TXT);
                    if (reward.requiresApproval && canAfford) {
                      statusLabel = 'parent approval needed';
                      statusColor = isDark ? colors.pink : PURPLE_TXT;
                    }
                    return (
                      <View key={reward.id}>
                        {i > 0 && <Divider colors={colors} isDark={isDark} />}
                        <TouchableOpacity onPress={() => handleRedeem(reward)}
                          style={{ paddingHorizontal: 18, paddingVertical: 15,
                            flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700',
                              color: colors.textPrimary }} numberOfLines={1}>
                              {reward.emoji} {reward.title} · {reward.cost}
                            </Text>
                            <Text style={{ fontSize: 13, marginTop: 3, color: statusColor }}>
                              {reward.cost} coins ·{' '}
                              {!reward.requiresApproval ? 'instant · ' : ''}{statusLabel}
                            </Text>
                          </View>
                          <ChevronRight size={16} color={colors.textTertiary} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {/* Browse all perks link */}
            <TouchableOpacity onPress={() => setStoreOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 18, paddingVertical: 14,
                borderRadius: 14,
                backgroundColor: isDark ? colors.card : BLUE_LIGHT,
                borderWidth: 1, borderColor: isDark ? colors.border : '#C5CEF5' }}>
              <Text style={{ fontSize: 14, fontWeight: '700',
                color: isDark ? colors.primary : BLUE_BTN }}>
                Browse all perks in the store
              </Text>
              <ChevronRight size={16} color={isDark ? colors.primary : BLUE_BTN} />
            </TouchableOpacity>

            {/* My receipts */}
            {myReceipts.length > 0 && (
              <Card bg="#fff" colors={colors} isDark={isDark}>
                <CardSection label="My Receipts" accent={isDark ? colors.pink : PURPLE_TXT}>
                  {myReceipts.map((rd, i) => {
                    const reward = rewards.find(r => r.id === rd.rewardId);
                    return (
                      <View key={rd.id}>
                        {i > 0 && <View style={{ height: StyleSheet.hairlineWidth,
                          backgroundColor: isDark ? colors.border : BORDER,
                          marginVertical: 4 }} />}
                        <View style={{ flexDirection: 'row', alignItems: 'center',
                          paddingVertical: 10, gap: 10 }}>
                          <Text style={{ fontSize: 20 }}>{reward?.emoji ?? '🎁'}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700',
                              color: colors.textPrimary }} numberOfLines={1}>
                              {reward?.title ?? rd.rewardTitle ?? 'Perk'}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                              {rd.deductedCoins} coins · {fmtDateTime(rd.redeemedAt)}
                            </Text>
                          </View>
                          <StatusPill status={rd.status} colors={colors} isDark={isDark} />
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ height: 10 }} />
                </CardSection>
              </Card>
            )}

            {availableRewards.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                <Text style={{ fontSize: 42 }}>🎁</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  No perks yet
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
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
              <Card bg="#fff" colors={colors} isDark={isDark}>
                <CardSection label="Kids' Piggy Banks" accent={isDark ? colors.teal : GREEN_TXT}>
                  <View style={{ gap: 10, paddingBottom: 6 }}>
                    {members
                      .filter(m => m.role === 'kid' || m.role === 'teen')
                      .map((kid, i, arr) => {
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
                            {/* Full-width piggy bank row */}
                            <View style={{ flexDirection: 'row', alignItems: 'center',
                              paddingVertical: 12, gap: 14 }}>
                              {/* Avatar */}
                              <View style={{ width: 52, height: 52, borderRadius: 16,
                                backgroundColor: isDark ? colors.card : '#D5EFE4',
                                alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 26 }}>{(kid as any).emoji ?? '🙂'}</Text>
                              </View>
                              {/* Name + streak + goal */}
                              <View style={{ flex: 1, gap: 3 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 15, fontWeight: '800',
                                    color: colors.textPrimary }}>
                                    {(kid as any).name?.split(' ')[0]}
                                  </Text>
                                  {streak > 0 && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                                      borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
                                      backgroundColor: colors.amberLight }}>
                                      <Flame size={10} color={colors.amber} />
                                      <Text style={{ fontSize: 10, fontWeight: '800',
                                        color: colors.amber }}>
                                        {streak}-day
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                {goal ? (
                                  <>
                                    <Text style={{ fontSize: 12, color: colors.textSecondary }}
                                      numberOfLines={1}>
                                      Goal: {goal.title}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      <View style={{ flex: 1, height: 5, borderRadius: 3,
                                        backgroundColor: isDark ? colors.surface : '#DCF0E8',
                                        overflow: 'hidden' }}>
                                        <View style={{ height: '100%', width: `${pct * 100}%`,
                                          borderRadius: 3,
                                          backgroundColor: isDark ? colors.teal : GREEN_TXT }} />
                                      </View>
                                      <Text style={{ fontSize: 11, fontWeight: '700',
                                        color: isDark ? colors.teal : GREEN_TXT, minWidth: 32,
                                        textAlign: 'right' }}>
                                        {Math.round(pct * 100)}%
                                      </Text>
                                    </View>
                                  </>
                                ) : (
                                  <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                                    No goal set
                                  </Text>
                                )}
                              </View>
                              {/* Coin total */}
                              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                                  <Text style={{ fontSize: 22, fontWeight: '900',
                                    color: isDark ? colors.amber : AMBER_TXT }}>
                                    {total}
                                  </Text>
                                  <Text style={{ fontSize: 14 }}>🪙</Text>
                                </View>
                                {gpCoins > 0 && (
                                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                                    +{gpCoins} GP
                                  </Text>
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
              <Card bg="#fff" colors={colors} isDark={isDark}>
                <CardSection
                  label={`Pending Requests · ${pendingApprovals.length}`}
                  accent={isDark ? colors.amber : AMBER_TXT}>
                  {pendingApprovals.map((rd, i) => {
                    const reward = rewards.find(r => r.id === rd.rewardId);
                    const kid    = members.find(m => m.id === rd.memberId);
                    return (
                      <View key={rd.id}>
                        {i > 0 && <Divider colors={colors} isDark={isDark} />}
                        <View style={{ flexDirection: 'row', alignItems: 'center',
                          paddingVertical: 12, gap: 10 }}>
                          <View style={{ width: 40, height: 40, borderRadius: 12,
                            backgroundColor: isDark ? colors.amberLight : AMBER_BG,
                            alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 20 }}>{reward?.emoji ?? '🎁'}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700',
                              color: colors.textPrimary }} numberOfLines={1}>
                              {reward?.title ?? rd.rewardTitle ?? 'Perk'}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                              {kid?.name?.split(' ')[0] ?? rd.memberName?.split(' ')[0] ?? 'Kid'} · {rd.deductedCoins} coins
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => handleReject(rd.id)}
                            style={{ width: 36, height: 36, borderRadius: 10,
                              backgroundColor: (isDark ? colors.danger : RED_TXT) + '18',
                              alignItems: 'center', justifyContent: 'center' }}>
                            <XCircle size={18} color={isDark ? colors.danger : RED_TXT} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleApprove(rd.id)}
                            style={{ width: 36, height: 36, borderRadius: 10,
                              backgroundColor: (isDark ? colors.teal : GREEN_TXT) + '18',
                              alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle size={18} color={isDark ? colors.teal : GREEN_TXT} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ height: 10 }} />
                </CardSection>
              </Card>
            )}

            {/* History */}
            {history.length > 0 && (
              <Card bg="#fff" colors={colors} isDark={isDark}>
                <CardSection label="Recent Transactions" accent={isDark ? colors.pink : PURPLE_TXT}>
                  {history.map((rd, i) => {
                    const reward = rewards.find(r => r.id === rd.rewardId);
                    const kid    = members.find(m => m.id === rd.memberId);
                    return (
                      <View key={rd.id}>
                        {i > 0 && <Divider colors={colors} isDark={isDark} />}
                        <View style={{ flexDirection: 'row', alignItems: 'center',
                          paddingVertical: 12, gap: 10 }}>
                          <View style={{ width: 38, height: 38, borderRadius: 11,
                            backgroundColor: isDark ? colors.surface : '#F0F2F7',
                            alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 18 }}>{reward?.emoji ?? '🎁'}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700',
                              color: colors.textPrimary }} numberOfLines={1}>
                              {reward?.title ?? rd.rewardTitle ?? 'Perk'}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                              {kid?.name?.split(' ')[0] ?? rd.memberName?.split(' ')[0] ?? 'Member'} · {rd.deductedCoins} coins · {fmtDate(rd.redeemedAt)}
                            </Text>
                          </View>
                          <StatusPill status={rd.status} colors={colors} isDark={isDark} />
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ height: 10 }} />
                </CardSection>
              </Card>
            )}

            {/* Browse store CTA */}
            <TouchableOpacity onPress={() => setStoreOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                borderRadius: 22, overflow: 'hidden',
                backgroundColor: isDark ? colors.card : '#fff',
                paddingHorizontal: 18, paddingVertical: 18,
                ...Platform.select({
                  ios: {
                    shadowColor: colors.navy ?? '#2C2722',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: isDark ? 0.2 : 0.09,
                    shadowRadius: 14,
                  },
                  android: { elevation: isDark ? 0 : 3 },
                }),
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14,
                  backgroundColor: BLUE_BTN, alignItems: 'center', justifyContent: 'center' }}>
                  <ShoppingBag size={24} color="#fff" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>
                    Perks Store
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 1 }}>
                    {rewards.filter(r => r.available).length} perks · manage & add
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </TouchableOpacity>

            {pendingApprovals.length === 0 && history.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                <Text style={{ fontSize: 36 }}>🎁</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  No activity yet
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                  Add perks in the store and kids can start redeeming their coins.
                </Text>
              </View>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}
