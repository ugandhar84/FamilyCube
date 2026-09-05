/**
 * KioskKidQuickActions — the kid Hub's quick-action row, ported to kiosk.
 *
 * The phone's kid Hub (features/hub/kid/KidMoreRow.tsx) gives a kid six
 * tiles: Piggy Bank, Rewards, Leaderboard, Cheer Squad, My Requests, Full
 * Calendar. The kiosk Overview had no kid-specific anything — its quick
 * row is the mockup's fixed household set (Schedule / Grocery / Meals /
 * Intercom), which is a parent's set of errands, not a kid's. A kid
 * standing at the kitchen tablet had no way to reach their own balance,
 * their standing, their siblings' wins, or their own asks.
 *
 * Two of the six are pure navigation and need nothing new (Rewards →
 * the kiosk `store` tab, Full Calendar → the kiosk `schedule` tab). The
 * other four open something on the phone, so each gets a kiosk-sized
 * sheet here. Every one of them reads the SAME store the phone sheet
 * reads — no second source, no reinvented scoring:
 *
 *   phone                          kiosk here          real source
 *   ─────────────────────────────────────────────────────────────────────
 *   PiggyBankSheet                 KidPiggyBankSheet   familyStore coins +
 *                                                      choreStore
 *                                                      .transactions /
 *                                                      .householdSettings
 *   KidLeaderboard                 KidLeaderboardSheet familyStore members'
 *                                                      mainCoins/streak
 *   CheerSquadSection              KidCheerSheet       choreAdapter quests +
 *                                                      cheerQuest (→
 *                                                      choreStore.cheerChore)
 *   KidRequestHistoryModal         KidRequestsSheet    kidRequestStore
 *                                                      .requests
 *
 * The phone components themselves are NOT reused: each is written against
 * the phone palette and the phone type scale (KID.tiny is 11px), which is
 * exactly what kioskTheme's header says not to put on a wall tablet. The
 * DATA and the derivations are what's shared.
 *
 * Every sheet is a native Modal wrapped in <KioskModalHost>, the same
 * pattern KioskQuestEditor/KioskEventEditor use — a Modal's touches never
 * reach KioskScreen's root onTouchStart, so without it the idle lock would
 * fire on a kid mid-read and throw them back to the lock screen.
 */
import { useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import {
  PiggyBank, Gift, ClipboardList, Calendar, Trophy, PartyPopper, X, Receipt,
  Flame, CheckCircle2, Clock3, XCircle,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import type { FamilyMember } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useKidRequestStore, REQUEST_META } from '@/store/kidRequestStore';
import { parseDbTime } from '@/lib/dates';

import { KioskModalHost, useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, kioskOnAccent, type KioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Well, Chip, ActionButton, EmptyNote } from './KioskOS';

type SheetKey = 'piggy' | 'leaderboard' | 'cheer' | 'requests';

/** Same 24h window the phone's siblingCheerable filter uses. */
function withinLast24h(iso?: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t <= 24 * 60 * 60 * 1000;
}

const coinsOf = (m: FamilyMember) => (m as any).mainCoins ?? (m as any).coins ?? 0;

// ── The row itself ──────────────────────────────────────────────────────
export function KioskKidQuickActions({
  active, members, onNavigate,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  onNavigate: (tab: 'store' | 'schedule') => void;
}) {
  const { k, isDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const [sheet, setSheet] = useState<SheetKey | null>(null);

  // Hold the idle lock for as long as any of these sheets is open — they
  // are native Modals, so their touches never reach the kiosk root.
  useKioskLockSuspended(sheet !== null);

  // choreAdapter's useQuestStore is a plain hook (no selector arg).
  const { quests } = useQuestStore();

  const siblingKids = useMemo(
    () => members.filter(m =>
      !m.deletedAt && m.inviteStatus !== 'pending' && m.role === 'kid' && m.id !== active.id),
    [members, active.id],
  );

  // Exactly KidView.tsx's siblingCheerable filter — today's sibling wins
  // that still need a cheer from me, dropping off once cheered.
  const cheerable = useMemo(() => quests.filter(q => {
    if (!['approved', 'done'].includes(q.status) || q.isAdultTask) return false;
    if (!q.assignedToId || !siblingKids.some(sib => sib.id === q.assignedToId)) return false;
    if ((q.cheers ?? []).some(c => c.memberId === active.id)) return false;
    return withinLast24h(q.approvedAt ?? q.completedAt);
  }).slice(0, 5), [quests, siblingKids, active.id]);

  const myPendingRequests = useKidRequestStore(
    s => s.requests.filter(r => r.fromMemberId === active.id && r.status === 'pending').length,
  );

  const open = (key: SheetKey) => { registerActivity(); setSheet(key); };

  const tiles: {
    Icon: LucideIcon; label: string; accent: string; onPress: () => void;
    badge?: number; hint: string;
  }[] = [
    { Icon: PiggyBank, label: 'Piggy Bank', accent: k.gold, onPress: () => open('piggy'),
      hint: 'See your coin balance and recent activity' },
    { Icon: Gift, label: 'Rewards', accent: k.purple, onPress: () => { registerActivity(); onNavigate('store'); },
      hint: 'Open the reward store' },
    { Icon: Trophy, label: 'Leaderboard', accent: k.primary, onPress: () => open('leaderboard'),
      hint: 'See how everyone is doing this week' },
    { Icon: PartyPopper, label: 'Cheer Squad', accent: k.sage, onPress: () => open('cheer'),
      badge: cheerable.length || undefined,
      hint: 'High-five what your brothers and sisters finished' },
    { Icon: ClipboardList, label: 'My Requests', accent: k.blue, onPress: () => open('requests'),
      badge: myPendingRequests || undefined,
      hint: 'See what you asked a grown-up for and what they said' },
    { Icon: Calendar, label: 'Full Calendar', accent: k.sage, onPress: () => { registerActivity(); onNavigate('schedule'); },
      hint: 'Open the family schedule' },
  ];

  return (
    <>
      <WidgetCard k={k} isDark={isDark}>
        <WidgetHeader
          Icon={Trophy} eyebrow="Just for you" title="Your stuff"
          accent={k.primary} k={k} isDark={isDark}
        />
        <View style={s.row}>
          {tiles.map(({ Icon, label, accent, onPress, badge, hint }) => (
            <Pressable
              key={label}
              onPress={onPress}
              style={({ pressed }) => [
                s.tile,
                {
                  backgroundColor: accent + (isDark ? '1F' : '14'),
                  borderColor: accent + (isDark ? '45' : '38'),
                },
                pressed && { opacity: 0.72 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={badge ? `${label}, ${badge} waiting` : label}
              accessibilityHint={hint}
            >
              <View style={[s.tileChip, { backgroundColor: accent }]}>
                <Icon size={22} color={kioskOnAccent(k, accent)} />
              </View>
              <Text style={[s.tileLabel, { color: accent }]} numberOfLines={2}>{label}</Text>
              {badge !== undefined && (
                <View style={[s.tileBadge, { backgroundColor: accent, borderColor: k.card }]}>
                  <Text style={[s.tileBadgeText, { color: kioskOnAccent(k, accent) }]} numberOfLines={1}>
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </WidgetCard>

      {sheet === 'piggy' && (
        <KidPiggyBankSheet active={active} k={k} isDark={isDark} onClose={() => setSheet(null)} />
      )}
      {sheet === 'leaderboard' && (
        <KidLeaderboardSheet
          active={active} siblingKids={siblingKids} k={k} isDark={isDark}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'cheer' && (
        <KidCheerSheet
          active={active} siblingKids={siblingKids} cheerable={cheerable}
          k={k} isDark={isDark} onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'requests' && (
        <KidRequestsSheet
          active={active} members={members} k={k} isDark={isDark} onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

// ── Shared kiosk sheet frame ────────────────────────────────────────────
function KioskSheet({
  title, subtitle, accent, Icon, k, isDark, onClose, children,
}: {
  title: string; subtitle?: string; accent: string; Icon: LucideIcon;
  k: KioskColors; isDark: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KioskModalHost style={[s.overlay, { backgroundColor: k.scrim }]}>
        <View
          style={[s.sheet, { backgroundColor: k.card, borderColor: k.cardBorder }]}
          accessibilityViewIsModal
          accessibilityLabel={title}
        >
          <View style={s.sheetHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <WidgetHeader
                Icon={Icon} eyebrow={subtitle ?? 'Just for you'} title={title}
                accent={accent} k={k} isDark={isDark}
              />
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              style={[s.closeBtn, { backgroundColor: k.well }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={22} color={k.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={s.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KioskModalHost>
    </Modal>
  );
}

// ── Piggy Bank ──────────────────────────────────────────────────────────
/**
 * The phone's PiggyBankSheet, kiosk-scaled. Reads the same three things it
 * does: the member's own mainCoins/gpCoins, the family's real
 * pointsToFiatRatio/currencySymbol (NOT a hardcoded rate — that was a live
 * bug the phone sheet already fixed), and the viewer's OWN
 * point_transactions rows for recent activity. Balances are clamped at 0
 * for the same reason the phone sheet clamps them.
 *
 * Scoped to the active member only. A kiosk is a shared surface, and
 * sibling-balance privacy is the same rule the Overview's coin-jar widget
 * is parent-gated for.
 */
function KidPiggyBankSheet({ active, k, isDark, onClose }: {
  active: FamilyMember; k: KioskColors; isDark: boolean; onClose: () => void;
}) {
  const transactions = useChoreStore(s => s.transactions);
  const householdSettings = useChoreStore(s => s.householdSettings);
  const ratio = householdSettings.pointsToFiatRatio;
  const symbol = householdSettings.currencySymbol;
  const coinsPerUnit = ratio > 0 ? Math.round(1 / ratio) : 100;

  const mainCoins = Math.max(0, (active as any).mainCoins ?? (active as any).coins ?? 0);
  const gpCoins = Math.max(0, (active as any).gpCoins ?? 0);
  const streak = (active as any).streak ?? 0;

  const mine = useMemo(
    () => transactions
      .filter(t => t.userId === active.id && !(t.notes ?? '').includes('[Denied]'))
      .slice(0, 8),
    [transactions, active.id],
  );

  return (
    <KioskSheet
      title="Piggy Bank" subtitle="Your coins" accent={k.gold} Icon={PiggyBank}
      k={k} isDark={isDark} onClose={onClose}
    >
      <Well k={k} accent={k.gold} style={s.balanceWell}>
        <Text style={[s.balanceNum, { color: k.gold }]} numberOfLines={1}>{mainCoins}</Text>
        <Text style={[s.balanceLabel, { color: k.textMuted }]} numberOfLines={1}>Main store coins</Text>
        {gpCoins > 0 && (
          <Chip label={`+${gpCoins} grandparent bonus`} accent={k.purple} isDark={isDark} k={k} />
        )}
      </Well>

      <View style={s.statRow}>
        <StatTile
          label="Cash value" value={`${symbol}${((mainCoins + gpCoins) * ratio).toFixed(2)}`}
          accent={k.sage} k={k}
        />
        <StatTile label="Day streak" value={`${streak}`} accent={k.primary} k={k} Icon={Flame} />
      </View>

      <Text style={[s.note, { color: k.textMuted }]} numberOfLines={2}>
        {coinsPerUnit} coins = {symbol}1.00 of real allowance.
      </Text>

      {mine.length > 0 && (
        <WidgetCard k={k} isDark={isDark} style={{ marginTop: KIOSK_SPACE.sm }}>
          <WidgetHeader
            Icon={Receipt} eyebrow="History" title="Recent activity"
            accent={k.textMuted} k={k} isDark={isDark}
          />
          <View style={{ gap: KIOSK_SPACE.xs }}>
            {mine.map(t => {
              const out = t.amount < 0 || t.transactionType === 'CASH_OUT' || t.transactionType === 'SPENT';
              const sign = t.amount < 0 ? '' : out ? '-' : '+';
              return (
                <View key={t.id} style={s.txRow}>
                  <Text style={[s.txNote, { color: k.textMuted }]} numberOfLines={1}>
                    {t.notes || (t.transactionType === 'EARNED' ? 'Chore reward' : t.transactionType)}
                  </Text>
                  <Text style={[s.txAmount, { color: out ? k.danger : k.sage }]} numberOfLines={1}>
                    {sign}{Math.abs(t.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        </WidgetCard>
      )}
    </KioskSheet>
  );
}

function StatTile({ label, value, accent, k, Icon }: {
  label: string; value: string; accent: string; k: KioskColors; Icon?: LucideIcon;
}) {
  return (
    <Well k={k} style={s.statTile}>
      {Icon && <Icon size={18} color={accent} />}
      <Text style={[s.statValue, { color: accent }]} numberOfLines={1}>{value}</Text>
      <Text style={[s.statLabel, { color: k.textFaint }]} numberOfLines={1}>{label}</Text>
    </Well>
  );
}

// ── Leaderboard ─────────────────────────────────────────────────────────
/**
 * The phone's KidLeaderboard, kiosk-scaled: the same ranking (kids sorted
 * by mainCoins, medals for the top three, the viewer highlighted) off the
 * same familyStore fields. No scoring logic is invented here — coins are
 * awarded by choreStore's payout path and simply read back.
 *
 * Sibling COIN BALANCES are visible here, and deliberately so: this is the
 * kid's own leaderboard, the phone shows exactly the same numbers to the
 * same audience, and a leaderboard with the scores hidden is not one. It
 * differs from the Overview's parent-only coin-jar widget in that it is
 * behind a deliberate tap by a signed-in kid rather than sitting on an
 * always-on wall display.
 */
function KidLeaderboardSheet({ active, siblingKids, k, isDark, onClose }: {
  active: FamilyMember; siblingKids: FamilyMember[]; k: KioskColors; isDark: boolean;
  onClose: () => void;
}) {
  const MEDALS = ['🥇', '🥈', '🥉'];
  const ranked = useMemo(
    () => [active, ...siblingKids].sort((a, b) => coinsOf(b) - coinsOf(a)),
    [active, siblingKids],
  );

  return (
    <KioskSheet
      title="Family Leaderboard" subtitle="Standings" accent={k.primary} Icon={Trophy}
      k={k} isDark={isDark} onClose={onClose}
    >
      {ranked.length <= 1 ? (
        <EmptyNote text="You're the only one on the board right now — keep stacking those coins!" k={k} />
      ) : (
        <View style={{ gap: KIOSK_SPACE.sm }}>
          {ranked.map((kid, i) => {
            const isMe = kid.id === active.id;
            const streak = (kid as any).streak ?? 0;
            return (
              <Well
                key={kid.id} k={k} accent={isMe ? k.primary : undefined}
                style={s.lbRow}
              >
                <Text style={s.lbMedal} numberOfLines={1}>{MEDALS[i] ?? `${i + 1}`}</Text>
                <Text style={s.lbEmoji} numberOfLines={1}>{kid.emoji ?? '🧒'}</Text>
                <Text
                  style={[s.lbName, { color: isMe ? k.primary : k.text, fontWeight: isMe ? '900' : '700' }]}
                  numberOfLines={1}
                >
                  {kid.name?.trim().split(' ')[0]}{isMe ? ' (you)' : ''}
                </Text>
                {streak > 0 && (
                  <View style={s.lbStreak}>
                    <Flame size={15} color={k.gold} />
                    <Text style={[s.lbStreakText, { color: k.gold }]} numberOfLines={1}>{streak}d</Text>
                  </View>
                )}
                <Text style={[s.lbCoins, { color: k.gold }]} numberOfLines={1}>
                  {coinsOf(kid)}
                  <Text style={[s.lbCoinsUnit, { color: k.textMuted }]}> coins</Text>
                </Text>
              </Well>
            );
          })}
        </View>
      )}
    </KioskSheet>
  );
}

// ── Cheer Squad ─────────────────────────────────────────────────────────
/**
 * The phone's CheerSquadSection, kiosk-scaled, writing through the SAME
 * cheerQuest action (choreAdapter → choreStore.cheerChore) the phone and
 * KioskTasksTab's GP view already call — so the cheer notification, the
 * dedupe on `cheers`, and everything else that action does are unchanged.
 * Cheered items drop out of the list because the filter that produced them
 * excludes anything already cheered by this member.
 */
function KidCheerSheet({ active, siblingKids, cheerable, k, isDark, onClose }: {
  active: FamilyMember; siblingKids: FamilyMember[];
  cheerable: { id: string; title: string; assignedToId?: string }[];
  k: KioskColors; isDark: boolean; onClose: () => void;
}) {
  const { cheerQuest } = useQuestStore();
  const { registerActivity } = useKioskActivity();

  return (
    <KioskSheet
      title="Cheer Squad" subtitle="Their wins" accent={k.sage} Icon={PartyPopper}
      k={k} isDark={isDark} onClose={onClose}
    >
      {cheerable.length === 0 ? (
        <EmptyNote text="Nobody's finished anything new to cheer yet. Check back later 🌱" k={k} />
      ) : (
        <View style={{ gap: KIOSK_SPACE.sm }}>
          {cheerable.map(q => {
            const sib = siblingKids.find(x => x.id === q.assignedToId);
            const who = sib?.name?.trim().split(' ')[0] ?? 'They';
            return (
              <Well key={q.id} k={k} accent={k.sage} style={s.cheerRow}>
                <Text style={s.lbEmoji} numberOfLines={1}>{sib?.emoji ?? '🧒'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.cheerTitle, { color: k.text }]} numberOfLines={2}>{q.title}</Text>
                  <Text style={[s.cheerSub, { color: k.sage }]} numberOfLines={1}>
                    {who} finished it!
                  </Text>
                </View>
                <ActionButton
                  label="Cheer" Icon={PartyPopper} accent={k.sage} k={k} isDark={isDark}
                  variant="solid"
                  accessibilityHint={`Send ${who} a cheer for ${q.title}`}
                  onPress={() => { registerActivity(); cheerQuest(q.id, active.id); }}
                />
              </Well>
            );
          })}
        </View>
      )}
    </KioskSheet>
  );
}

// ── My Requests ─────────────────────────────────────────────────────────
/**
 * The phone's KidRequestHistoryModal, reduced to the part that matters on
 * a kitchen tablet: the kid's own asks and what a grown-up said back.
 * Reads kidRequestStore.requests, filtered to `fromMemberId === active.id`
 * exactly as the phone modal does, over the phone modal's own DEFAULT
 * window (last 7 days) — the phone's date-range pickers and per-item
 * expansion are deliberately not ported, because a range picker is a
 * phone-in-hand interaction and this surface is a glance.
 */
function KidRequestsSheet({ active, members, k, isDark, onClose }: {
  active: FamilyMember; members: FamilyMember[]; k: KioskColors; isDark: boolean;
  onClose: () => void;
}) {
  const requests = useKidRequestStore(s => s.requests);

  const mine = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return requests
      .filter(r => r.fromMemberId === active.id && !!r.requestedAt)
      .filter(r => parseDbTime(r.requestedAt).getTime() >= since)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [requests, active.id]);

  const statusOf = (status: string): { label: string; accent: string; Icon: LucideIcon } => {
    if (status === 'approved' || status === 'completed') return { label: 'Approved', accent: k.sage, Icon: CheckCircle2 };
    if (status === 'declined' || status === 'cancelled') return { label: status === 'declined' ? 'Declined' : 'Cancelled', accent: k.danger, Icon: XCircle };
    if (status === 'partial') return { label: 'Partly approved', accent: k.gold, Icon: CheckCircle2 };
    if (status === 'expired') return { label: 'Expired', accent: k.textFaint, Icon: Clock3 };
    return { label: 'Waiting', accent: k.blue, Icon: Clock3 };
  };

  const nameOf = (id?: string) => members.find(m => m.id === id)?.name?.trim().split(' ')[0];

  return (
    <KioskSheet
      title="My Requests" subtitle="Last 7 days" accent={k.blue} Icon={ClipboardList}
      k={k} isDark={isDark} onClose={onClose}
    >
      {mine.length === 0 ? (
        <EmptyNote text="You haven't asked for anything this week." k={k} />
      ) : (
        <View style={{ gap: KIOSK_SPACE.sm }}>
          {mine.map(r => {
            const st = statusOf(r.status);
            const meta = REQUEST_META[r.type];
            const answered = nameOf(r.respondedBy);
            return (
              <Well key={r.id} k={k} accent={st.accent} style={s.reqRow}>
                <View style={s.reqTop}>
                  <Text style={s.lbEmoji} numberOfLines={1}>{meta?.emoji ?? '📋'}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.reqTitle, { color: k.text }]} numberOfLines={2}>
                      {r.detail || meta?.label || 'Request'}
                    </Text>
                    <Text style={[s.reqMeta, { color: k.textFaint }]} numberOfLines={1}>
                      {meta?.label ?? 'Request'}
                      {r.scheduledTime ? ` · ${r.scheduledTime}` : ''}
                      {answered ? ` · ${answered} answered` : ''}
                    </Text>
                  </View>
                  <Chip label={st.label} accent={st.accent} isDark={isDark} k={k} />
                </View>
                {!!r.parentNote && (
                  <Text style={[s.reqNote, { color: k.textMuted }]} numberOfLines={3}>
                    “{r.parentNote}”
                  </Text>
                )}
              </Well>
            );
          })}
        </View>
      )}
    </KioskSheet>
  );
}

const s = StyleSheet.create({
  // Row. Wraps to 3-up / 2-up by construction (flexBasis + flexWrap), the
  // same reflow-by-construction approach the Overview hero uses, so it
  // never needs a measured breakpoint.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.sm },
  tile: {
    flexGrow: 1, flexBasis: 130, minWidth: 0,
    minHeight: KIOSK_HIT.primary + 34, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm,
  },
  tileChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '800', textAlign: 'center' },
  tileBadge: {
    position: 'absolute', top: 8, right: 10, minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2,
  },
  tileBadgeText: { fontSize: KIOSK_TYPO.micro, fontWeight: '900' },

  // Sheet frame.
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: KIOSK_SPACE.lg },
  sheet: {
    width: 620, maxWidth: '94%', maxHeight: '88%',
    borderRadius: KIOSK_RADIUS.xl, borderWidth: 1, overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    paddingHorizontal: KIOSK_SPACE.lg, paddingTop: KIOSK_SPACE.lg,
  },
  closeBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetBody: { padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.sm },

  // Piggy bank.
  balanceWell: { alignItems: 'center', gap: KIOSK_SPACE.xs, paddingVertical: KIOSK_SPACE.lg },
  balanceNum: { fontSize: KIOSK_TYPO.hero, fontWeight: '900', fontVariant: ['tabular-nums'] },
  balanceLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm },
  statTile: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: KIOSK_SPACE.md },
  statValue: { fontSize: KIOSK_TYPO.heading, fontWeight: '900' },
  statLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },
  note: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, minHeight: 26 },
  txNote: { flex: 1, fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  txAmount: { fontSize: KIOSK_TYPO.caption, fontWeight: '900', fontVariant: ['tabular-nums'] },

  // Leaderboard.
  lbRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control,
  },
  lbMedal: { fontSize: 22, width: 30, textAlign: 'center' },
  lbEmoji: { fontSize: 24 },
  lbName: { flex: 1, fontSize: KIOSK_TYPO.body, minWidth: 0 },
  lbStreak: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lbStreakText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  lbCoins: { fontSize: KIOSK_TYPO.subheading, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lbCoinsUnit: { fontSize: KIOSK_TYPO.micro, fontWeight: '700' },

  // Cheer.
  cheerRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.primary,
  },
  cheerTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  cheerSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: 2 },

  // Requests.
  reqRow: { gap: KIOSK_SPACE.xs },
  reqTop: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.sm },
  reqTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  reqMeta: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2 },
  reqNote: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', fontStyle: 'italic' },
});
