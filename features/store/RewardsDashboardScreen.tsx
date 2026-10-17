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
  View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useRewardStore, Reward, Redemption } from '@/store/rewardStore';
import { showToast } from '@/components/AppToast';
import {
  CheckCircle, XCircle, ChevronRight, ShoppingBag, Flame, Coins,
} from 'lucide-react-native';
import NotificationPanel from '@/components/NotificationPanel';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import StoreScreen from './StoreScreen';
import FullPageOverlay from '@/components/FullPageOverlay';
import { PageHeading } from '@/components/PageHeading';

// ─── "Gemini rhythm" tokens (CLAUDE.md rule 6 exception, 2026-10-10) — same
// palette SchoolHomeScreen.tsx uses; see that file's own comment for the
// full rationale. ──────────────────────────────────────────────────────────
const CANVAS = '#ECE6DE';
const TITLE_CLR = '#0D1210';
const BODY_CLR = '#3D4D47';
const BODY_CLR_LIGHT = '#4E5C56';
// Muted blue — same CTA_BLUE used on Kid Hub's quest detail CTAs
// (KidQuestDetailScreen.tsx/KidQuestCard.tsx), kept local here for the
// same no-brand-token reason [live-requested: "muted blue color"].
const BLUE = '#5B7FA6';
const LINK_BLUE = '#23352B';
const BORDER = '#DDD6CC';
const CARD_BG = '#FFFFFF';
const SURFACE = '#F0EDE6';
const CARD_SHADOW = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } as const;
const GREEN_TXT = '#1B7A54';
const AMBER_TXT = '#B5720A';
const RED_TXT = '#C0392B';
const PURPLE_TXT = '#6A4FBF';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso: string | undefined) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtDateTime(iso: string | undefined) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return 'Unknown date';
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
      borderWidth: isDark ? 1 : 0, borderColor: colors.border, borderRadius: 18,
      backgroundColor: isDark ? colors.card : CARD_BG, overflow: 'hidden',
    }, !isDark && CARD_SHADOW, style]}>
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

// ─── Field card for the receipt detail page — same shape as the Perks
// Store's own PerkDetailScreen DetailField (StoreScreen.tsx) ───────────────
function DetailField({ label, value, colors, isDark }: {
  label: string; value: string; colors: any; isDark: boolean;
}) {
  return (
    <View style={{ borderWidth: isDark ? 1 : 0, borderColor: colors.border, borderRadius: 16,
      backgroundColor: isDark ? colors.card : CARD_BG, paddingHorizontal: 16, paddingVertical: 14,
      ...(!isDark ? CARD_SHADOW : {}) }}>
      <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : BODY_CLR, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 15, color: isDark ? colors.textPrimary : TITLE_CLR, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

// ─── Receipt detail page — "my requests also should open the dedicated
// page" [live-requested], same rhythm as StoreScreen's PerkDetailScreen:
// warm-cream canvas, shadowed white field cards, pastel status pill. ───────
function RedemptionDetailScreen({ redemption, reward, colors, isDark, onClose, onCancel, members }: {
  redemption: Redemption | null; reward: Reward | undefined; colors: any; isDark: boolean; onClose: () => void;
  onCancel?: (id: string) => void; members: any[];
}) {
  const insets = useSafeAreaInsets();
  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  // Parity with the parent-facing RewardReviewScreen's Activity Log —
  // live-reported: "why this page is diffrent than the parents approval
  // ?? this should show complete details and approvals history and proper
  // date time approved by/declined by etc.." — this screen only showed a
  // bare "Approved"/timestamp row with no actor name, no balance
  // before/after; the data (approvedBy/rejectedBy/balanceBefore/After) has
  // existed in the store since the audit-trail migration, it just wasn't
  // rendered here.
  const resolvedByMember = redemption
    ? members.find(m => m.id === (redemption.approvedBy ?? redemption.rejectedBy))
    : undefined;

  return (
    <FullPageOverlay visible={!!redemption} onDismiss={onClose} zIndex={65}>
      {(requestAnimatedClose) => (
        <View style={{ flex: 1, backgroundColor: canvas }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
            {redemption && (
              <TouchableOpacity onPress={requestAnimatedClose} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? colors.card : '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center', ...(!isDark ? CARD_SHADOW : {}) }}>
                  <Text style={{ fontSize: 20 }}>{reward?.emoji ?? '🎁'}</Text>
                </View>
                <Text style={{ fontSize: 26, fontWeight: '700', color: titleC, flex: 1, lineHeight: 32 }}>
                  {reward?.title ?? redemption.rewardTitle ?? 'Perk'}
                </Text>
              </TouchableOpacity>
            )}
            {redemption && (
              <View style={{ marginTop: 10 }}>
                <StatusPill status={redemption.status} colors={colors} isDark={isDark} />
              </View>
            )}
          </View>

          {redemption && (
            <ScrollView showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 48, gap: 10 }}>

              <DetailField label="Coin cost" value={`${redemption.deductedCoins} coins 🪙`} colors={colors} isDark={isDark} />

              <DetailField label="Requested" value={fmtDateTime(redemption.redeemedAt)} colors={colors} isDark={isDark} />

              {redemption.kidNote && (
                <DetailField label="Your note" value={redemption.kidNote} colors={colors} isDark={isDark} />
              )}

              {redemption.respondedAt && (
                <DetailField
                  label={redemption.status === 'rejected' ? 'Declined' : redemption.status === 'cancelled' ? 'Cancelled' : 'Approved'}
                  value={`${fmtDateTime(redemption.respondedAt)}${resolvedByMember ? ` · by ${resolvedByMember.name}` : ''}`}
                  colors={colors} isDark={isDark}
                />
              )}

              {(redemption.balanceBefore !== undefined && redemption.balanceAfter !== undefined) && (
                <DetailField
                  label="Coin balance"
                  value={`${redemption.balanceBefore} → ${redemption.balanceAfter} coins`}
                  colors={colors} isDark={isDark}
                />
              )}

              {redemption.note && (
                <DetailField label="Note from parent" value={redemption.note} colors={colors} isDark={isDark} />
              )}

              {redemption.status === 'pending' && (
                <>
                  <Text style={{ fontSize: 13, color: bodyC, textAlign: 'center', marginTop: 4 }}>
                    Waiting for a parent to approve this request.
                  </Text>
                  {/* Kids should see the same review-style screen a parent
                      does and be able to cancel their own still-pending
                      request before a parent acts on it [live-requested:
                      "kids should see same screen like parents.. pending
                      approvals they can cancel before parent approves
                      it"] — cancelRedemption already existed in the store
                      (used elsewhere) but wasn't wired into this screen. */}
                  {onCancel && (
                    <TouchableOpacity
                      onPress={() => { onCancel(redemption.id); requestAnimatedClose(); }}
                      activeOpacity={0.85}
                      style={{
                        marginTop: 10, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                        borderWidth: 1, borderColor: isDark ? colors.border : BORDER,
                        backgroundColor: isDark ? colors.card : '#FFFFFF',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.danger }}>Cancel request</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      )}
    </FullPageOverlay>
  );
}

// ─── Reward detail page — kid taps a reward card/row → open this full page
// first, with a Redeem CTA + optional inline Notes field, instead of
// redeeming instantly on tap [live-requested: "when kid taps on the
// rewards card to redeem it should first open full page with rewards and
// then show the CTA button to redeem with oprion inline Notes button"].
// Mirrors StoreScreen's PerkDetailScreen layout/field shape. ───────────────
function RewardDetailScreen({ reward, colors, isDark, myCoins, isGoal, onClose, onRedeem }: {
  reward: Reward | null; colors: any; isDark: boolean; myCoins: number; isGoal: boolean;
  onClose: () => void; onRedeem: (reward: Reward, note?: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const canvas = isDark ? colors.background : CANVAS;
  const titleC = isDark ? colors.textPrimary : TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : BODY_CLR;
  const border = isDark ? colors.border : BORDER;
  const cardBg = isDark ? colors.card : CARD_BG;
  const [note, setNote] = useState('');

  useEffect(() => { if (reward) setNote(''); }, [reward?.id]);

  const canAfford = !!reward && myCoins >= reward.cost;
  const coinsToGo = reward ? Math.max(0, reward.cost - myCoins) : 0;

  return (
    <FullPageOverlay visible={!!reward} onDismiss={onClose} zIndex={65}>
      {(requestAnimatedClose) => (
        <View style={{ flex: 1, backgroundColor: canvas }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
            {reward && (
              <TouchableOpacity onPress={requestAnimatedClose} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? colors.card : '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center', ...(!isDark ? CARD_SHADOW : {}) }}>
                  <Text style={{ fontSize: 20 }}>{reward.emoji ?? '🎁'}</Text>
                </View>
                <Text style={{ fontSize: 26, fontWeight: '700', color: titleC, flex: 1, lineHeight: 32 }}>{reward.title}</Text>
              </TouchableOpacity>
            )}
            {reward && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {isGoal && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: isDark ? colors.amberLight : '#FDF3D8' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.amber : AMBER_TXT }}>⭐ Your goal</Text>
                  </View>
                )}
                {reward.requiresApproval && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: isDark ? colors.pinkLight : '#EDE4F7' }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? colors.pink : PURPLE_TXT }}>Needs approval</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {reward && (
            <ScrollView showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 48, gap: 10 }}>

              <DetailField label="Coin cost" value={`${reward.cost} coins 🪙`} colors={colors} isDark={isDark} />

              {reward.description ? (
                <DetailField label="Description" value={reward.description} colors={colors} isDark={isDark} />
              ) : null}

              <DetailField
                label="Your balance"
                value={canAfford ? `${myCoins} coins · you can afford this` : `${myCoins} coins · ${coinsToGo} coins to go`}
                colors={colors} isDark={isDark}
              />

              <View style={{ borderWidth: isDark ? 1 : 0, borderColor: border, borderRadius: 16,
                backgroundColor: cardBg, paddingHorizontal: 16, paddingVertical: 14, ...(!isDark ? CARD_SHADOW : {}) }}>
                <Text style={{ fontSize: 12, color: bodyC, marginBottom: 6 }}>Note (optional)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note for your parent…"
                  placeholderTextColor={isDark ? colors.textTertiary : '#A69A8A'}
                  multiline
                  style={{ fontSize: 15, color: titleC, padding: 0, minHeight: 44, textAlignVertical: 'top' }}
                />
              </View>

              <TouchableOpacity
                disabled={!canAfford}
                onPress={() => { onRedeem(reward, note.trim() || undefined); requestAnimatedClose(); }}
                style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: canAfford ? BLUE : (isDark ? colors.surface : SURFACE), marginTop: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: canAfford ? '#FFFFFF' : bodyC }}>
                  {canAfford ? `Redeem · ${reward.cost} coins` : `Need ${coinsToGo} more coins`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      )}
    </FullPageOverlay>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function RewardsDashboardScreen({
  hideHeader = false,
  onClose,
}: {
  hideHeader?: boolean;
  onClose?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const { rewards, redemptions, redeemReward, approveRedemption, rejectRedemption, cancelRedemption } = useRewardStore();

  const [notifOpen, setNotifOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [detailRedemption, setDetailRedemption] = useState<Redemption | null>(null);
  const [detailReward, setDetailReward] = useState<Reward | null>(null);

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

  // The kid's own chosen goal/favorite reward (goalRewardId, set via "Set
  // as My Goal" on StoreScreen's perk detail) takes priority as the
  // featured card over the generic cheapest-affordable pick, so the
  // dashboard actually reflects what they're saving toward
  // [live-requested: "they have option to target perticular item that
  // right? so we can show that x coins to go rredeem"].
  const goalReward = (activeMember as any)?.goalRewardId
    ? availableRewards.find(r => r.id === (activeMember as any).goalRewardId)
    : undefined;
  const featuredReward = goalReward
    ?? availableRewards.find(r => myCoins >= r.cost && !r.requiresApproval)
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

  const handleRedeem = async (reward: Reward, note?: string) => {
    if (!activeMember) return;
    if (myCoins < reward.cost) {
      Alert.alert('Not enough coins', `You need ${reward.cost - myCoins} more coins.`);
      return;
    }
    const wallet = myMainCoins >= reward.cost ? 'mainCoins' : 'gpCoins';
    const ok = await redeemReward(reward.id, activeMember.id, wallet, note);
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
        {(requestAnimatedClose) => (
          <StoreScreen hideHeader={false} onClose={requestAnimatedClose} />
        )}
      </FullPageOverlay>

      <RedemptionDetailScreen
        redemption={detailRedemption}
        reward={rewards.find(r => r.id === detailRedemption?.rewardId)}
        colors={colors} isDark={isDark}
        onClose={() => setDetailRedemption(null)}
        onCancel={canRedeemSelf ? (id) => { cancelRedemption(id); setDetailRedemption(null); } : undefined}
        members={members}
      />

      <RewardDetailScreen
        reward={detailReward}
        colors={colors} isDark={isDark}
        myCoins={myCoins}
        isGoal={!!detailReward && (activeMember as any)?.goalRewardId === detailReward.id}
        onClose={() => setDetailReward(null)}
        onRedeem={(reward, note) => handleRedeem(reward, note)}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {!hideHeader && (
          <PageHeading
            eyebrow="FAMILY CUBE · REWARDS"
            title={canRedeemSelf ? 'You earned a choice' : 'Family Rewards'}
            subtitle={canRedeemSelf
              ? "Spend your coins on perks you've earned."
              : 'Review requests, track redemptions, and manage the perks store.'}
            accent="amber"
            Icon={Coins}
            onTitlePress={onClose}
            topInset={insets.top}
          />
        )}

        <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 12 }}>

          {/* ══════════════════════════════════════════
              KID / TEEN / SENIOR VIEW
          ══════════════════════════════════════════ */}
          {canRedeemSelf && (
            <>
              {/* Balance card — amber pastel banner, not flat white, per
                  Figma's "nice color banners and pastels" rhythm. */}
              <View style={{ borderRadius: 20, backgroundColor: isDark ? colors.surface : colors.amberLight,
                borderWidth: isDark ? 1 : 0, borderColor: colors.border, overflow: 'hidden', ...(!isDark ? CARD_SHADOW : {}) }}>
                <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 52, height: 52, borderRadius: 16, marginRight: 14,
                    backgroundColor: isDark ? colors.card : '#FFFFFF',
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24 }}>🪙</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: isDark ? colors.amber : AMBER_TXT }}>
                      {myCoins} coins
                    </Text>
                    <Text style={{ fontSize: 13, color: bodyC, marginTop: 2 }}>Available to spend</Text>
                    {myGpCoins > 0 && (
                      <Text style={{ fontSize: 12, color: isDark ? colors.textTertiary : BODY_CLR, marginTop: 4 }}>
                        {myMainCoins} main · {myGpCoins} grandparent bonus
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setStoreOpen(true)}
                    style={{ padding: 10, borderRadius: 12, backgroundColor: isDark ? colors.card : '#FFFFFF' }}>
                    <ShoppingBag size={20} color={isDark ? colors.teal : GREEN_TXT} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Featured reward — bright white card lifted off the pastel
                  canvas with a real shadow, blue CTA fill. */}
              {featuredReward && (
                <TouchableOpacity activeOpacity={0.85} onPress={() => setDetailReward(featuredReward)}>
                  <Card colors={colors} isDark={isDark} style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                        backgroundColor: isDark ? colors.amberLight : '#FDF3D8' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.3,
                          color: isDark ? colors.amber : AMBER_TXT }}>
                          {featuredReward.cost} coins · {myCoins >= featuredReward.cost ? 'available now' : `${featuredReward.cost - myCoins} to go`}
                        </Text>
                      </View>
                      {goalReward?.id === featuredReward.id && (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                          backgroundColor: isDark ? colors.amberLight : '#FDF3D8' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.amber : AMBER_TXT }}>⭐ Goal</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '800', lineHeight: 26, color: titleC, marginBottom: 6 }}>
                      {featuredReward.emoji} {featuredReward.title}
                    </Text>
                    {featuredReward.description ? (
                      <Text style={{ fontSize: 14, color: bodyC, lineHeight: 20, marginBottom: 14 }}>
                        {featuredReward.description}
                      </Text>
                    ) : <View style={{ height: 10 }} />}
                    <View
                      style={{ height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE,
                        shadowColor: BLUE, shadowOpacity: isDark ? 0 : 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: isDark ? 0 : 3 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                        View · {featuredReward.cost} coins
                      </Text>
                    </View>
                  </Card>
                </TouchableOpacity>
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
                          <TouchableOpacity onPress={() => setDetailReward(reward)}
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
                          <TouchableOpacity onPress={() => setDetailRedemption(rd)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 }}>
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
                          </TouchableOpacity>
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
                          <TouchableOpacity onPress={() => setDetailRedemption(rd)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 }}>
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
                          </TouchableOpacity>
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
