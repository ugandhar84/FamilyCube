/**
 * KioskKidQuickActions — the kid Hub's quick-action row, ported to kiosk.
 *
 * The phone's kid Hub (features/hub/kid/KidMoreRow.tsx) gives a kid six
 * tiles: Piggy Bank, Rewards, Leaderboard, Cheer Squad, My Requests, Full
 * Calendar. On kiosk, Rewards, Leaderboard and Full Calendar are dropped —
 * unlike the phone's cramped 5-tab bar, kiosk's nav rail already has Store
 * and Schedule as persistent, always-visible destinations one tap away
 * (and Tasks carries the leaderboard/pool content), so a second entry
 * point to the same screens here would be redundant. What remains are the
 * kid actions with NO rail equivalent — eleven of them now, as ONE labeled
 * "Your stuff" card, in two sub-groups inside that single card:
 *
 *   Piggy Bank · Cheer Squad · My Requests
 *       the kid's own state, each opening a kiosk-scaled sheet below
 *
 *   ASK A PARENT — the eight destinations from AskParentSheet.tsx, each as
 *       its OWN tile: Ask for a Ride · Ask Permission · Ask a Question ·
 *       Medication Alert · Request Grocery · School Supplies · Suggest a
 *       Chore · Propose a Chore. Tapping one opens its real destination
 *       modal directly — there is deliberately NO picker step here. The
 *       "ASK A PARENT" text is a sub-label, not a control. State and modals
 *       come from useKioskAskParent, shared with KioskTasksTab (which keeps
 *       its single button + the phone picker, driving the same eight).
 *
 * Check In is NOT in this card: it is exported separately as
 * KioskKidCheckInTile and promoted into KioskOverviewTab's hero quick row
 * next to Intercom — everything here is something a kid browses to, while a
 * check-in is tapped once on the way past, in a hurry.
 *
 * ── Why this is a labeled section, not tiles in the hero row ────────────
 * These briefly rendered inline in the hero's quick-action strip alongside
 * Intercom. At three tiles that was fine; at eleven it would be an
 * undifferentiated wall mixing one household action (Intercom, which every
 * role gets) with a dozen personal to the kid standing there. So the widget
 * card is back, with the header it originally had — "Just for you / Your
 * stuff" — sitting directly under the hero rather than down in the widget
 * deck, so it keeps the prominence the inline version had.
 *
 * Each tile reads the SAME store the phone does — no second source, no
 * reinvented scoring:
 *
 *   phone                          kiosk here          real source
 *   ─────────────────────────────────────────────────────────────────────
 *   PiggyBankSheet                 KidPiggyBankSheet   familyStore coins +
 *                                                      choreStore
 *                                                      .transactions /
 *                                                      .householdSettings
 *   CheerSquadSection              KidCheerSheet       choreAdapter quests +
 *                                                      cheerQuest (→
 *                                                      choreStore.cheerChore)
 *   KidRequestHistoryModal         KidRequestsSheet    kidRequestStore
 *                                                      .requests
 *   AskParentSheet's 8 options     8 tiles →           the SAME six modal
 *                                  useKioskAskParent   components the phone
 *                                                      and Tasks tab mount
 *   KidCheckinRow /                KidCheckinSheet     kidRequestStore
 *   KidView.sendCheckin                                .sendRequest +
 *                                                      chatStore.sendMessage
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
  PiggyBank, ClipboardList, PartyPopper, X, Receipt, Trophy,
  Flame, CheckCircle2, Clock3, XCircle,
  Hand, Home, Backpack, Timer,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import type { FamilyMember } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useKidRequestStore, REQUEST_META } from '@/store/kidRequestStore';
import { useChatStore } from '@/store/chatStore';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { parseDbTime } from '@/lib/dates';
import { showToast } from '@/components/AppToast';

import { KioskModalHost, useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, kioskOnAccent, type KioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Well, Chip, ActionButton, EmptyNote } from './KioskOS';
import { useKioskAskParent, ASK_PARENT_OPTIONS } from './KioskAskParentFlow';

type SheetKey = 'piggy' | 'cheer' | 'requests' | 'checkin';

/** Same 24h window the phone's siblingCheerable filter uses. */
function withinLast24h(iso?: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t <= 24 * 60 * 60 * 1000;
}

// ── The "Your stuff" card ───────────────────────────────────────────────
export function KioskKidQuickActions({
  active, members, style,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  /** Layout slot from the mounting screen (KioskOverviewTab). */
  style?: any;
}) {
  const { k, isDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const [sheet, setSheet] = useState<SheetKey | null>(null);

  // The eight Ask-Parent destinations. `open(key)` goes STRAIGHT to one —
  // there is deliberately no picker step here, each option is its own tile
  // below. The state for all six modals, and their idle-lock suspension,
  // live inside the hook (shared with KioskTasksTab, which uses the same
  // hook with its picker enabled).
  const { open: openAsk, node: askNode } = useKioskAskParent({ active, members });

  // Hold the idle lock for as long as any of these sheets is open — they
  // are native Modals, so their touches never reach the kiosk root.
  // (useKioskAskParent suspends the lock for its own seven states.)
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

  // "Mine" — the three things that show the kid their OWN state. Check In
  // is deliberately absent: it's promoted into the Overview hero row
  // (KioskKidCheckInTile below), being the one action someone walks up to
  // the tablet specifically to do, in a hurry.
  const mineTiles: {
    Icon: LucideIcon; label: string; accent: string; onPress: () => void;
    badge?: number; hint: string;
  }[] = [
    { Icon: PiggyBank, label: 'Piggy Bank', accent: k.gold, onPress: () => open('piggy'),
      hint: 'See your coin balance and recent activity' },
    { Icon: PartyPopper, label: 'Cheer Squad', accent: k.sage, onPress: () => open('cheer'),
      badge: cheerable.length || undefined,
      hint: 'High-five what your brothers and sisters finished' },
    { Icon: ClipboardList, label: 'My Requests', accent: k.blue, onPress: () => open('requests'),
      badge: myPendingRequests || undefined,
      hint: 'See what you asked a grown-up for and what they said' },
  ];

  return (
    <>
      {/* "Your stuff" — the kid's own actions, grouped and labeled rather
          than mixed into the hero's household quick-action strip. Sits
          directly under the hero (see KioskOverviewTab), so it keeps the
          prominence an inline row had, without pretending Intercom and
          Piggy Bank are the same kind of thing.
          Two sub-groups inside the ONE card: the kid's own state first,
          then the eight asks under a plain inline sub-label. The sub-label
          is a label, NOT a tap — every one of the eight opens its real
          destination directly, with no picker screen in between. */}
      <WidgetCard k={k} isDark={isDark} style={style}>
        <WidgetHeader
          Icon={Trophy} eyebrow="Just for you" title="Your stuff"
          accent={k.primary} k={k} isDark={isDark}
        />
        <View style={s.row}>
          {mineTiles.map(t => (
            <QuickTile key={t.label} {...t} k={k} isDark={isDark} />
          ))}
        </View>

        <Text style={[s.groupLabel, { color: k.textFaint }]} numberOfLines={1}>
          ASK A PARENT
        </Text>
        <View style={s.row}>
          {ASK_PARENT_OPTIONS.map(({ key, label, desc, Icon, accent }) => (
            <QuickTile
              key={key}
              Icon={Icon}
              label={label}
              accent={accent(k)}
              hint={desc}
              onPress={() => { registerActivity(); openAsk(key); }}
              k={k}
              isDark={isDark}
            />
          ))}
        </View>
      </WidgetCard>

      {/* The eight destination modals — the SAME six components, and the
          same state, the Tasks tab's own "Ask Parent" button drives. */}
      {askNode}

      {sheet === 'piggy' && (
        <KidPiggyBankSheet active={active} k={k} isDark={isDark} onClose={() => setSheet(null)} />
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

/** One tile in the "Your stuff" grid. */
function QuickTile({ Icon, label, accent, onPress, badge, hint, k, isDark }: {
  Icon: LucideIcon; label: string; accent: string; onPress: () => void;
  badge?: number; hint: string; k: KioskColors; isDark: boolean;
}) {
  return (
    <Pressable
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
        <Icon size={16} color={kioskOnAccent(k, accent)} />
      </View>
      <Text style={[s.tileLabel, { color: accent }]} numberOfLines={1}>{label}</Text>
      {badge !== undefined && (
        <View style={[s.tileBadge, { backgroundColor: accent }]}>
          <Text style={[s.tileBadgeText, { color: kioskOnAccent(k, accent) }]} numberOfLines={1}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Check In — promoted to the Overview hero row
// ════════════════════════════════════════════════════════════════════════
/**
 * The one kid action that belongs at hero prominence rather than in the
 * "Your stuff" grid below: everything in that grid is something a kid
 * browses to, while a check-in is what someone walks in the door and taps
 * once, in a hurry, without reading the screen. So it renders as a tile in
 * the hero's own quick-action strip (KioskOverviewTab's `quickRow`, shaped
 * by that file's `quick` style, which this mirrors), next to Intercom.
 *
 * Tapping it opens a three-option sheet — the phone's KidCheckinRow, at
 * kiosk scale. Picking one performs KidView.sendCheckin's EXACT two writes.
 */
export function KioskKidCheckInTile({ active }: { active: FamilyMember }) {
  const { k, isDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const [open, setOpen] = useState(false);

  // The sheet is a native Modal — its touches never reach the kiosk root,
  // so the idle lock has to be held explicitly while it's up.
  useKioskLockSuspended(open);

  const accent = k.purple;
  return (
    <>
      <Pressable
        onPress={() => { registerActivity(); setOpen(true); }}
        style={({ pressed }) => [
          s.heroQuick,
          {
            backgroundColor: accent + (isDark ? '1F' : '14'),
            borderColor: accent + (isDark ? '45' : '38'),
          },
          pressed && { opacity: 0.72 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Check In"
        accessibilityHint="Tell the family you are home, ready for pickup, or running late"
      >
        <Hand size={22} color={accent} />
        <Text style={[s.heroQuickLabel, { color: accent }]} numberOfLines={1}>Check In</Text>
      </Pressable>

      {open && <KidCheckinSheet active={active} k={k} isDark={isDark} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The phone's KidCheckinRow (features/hub/kid/KidCheckinRow.tsx), kiosk-
 * scaled, writing through KidView.sendCheckin's exact two writes.
 *
 * The message templates below are copied VERBATIM from that function
 * (KidView.tsx ~line 311-328) so a kiosk check-in and a phone check-in read
 * identically in Family Chat — including the optional context (the
 * confirmed ride's title for "ready", the next event's title for "late").
 *
 * Both writes matter and both are real:
 *
 *   1. sendRequest({ type: 'checkin', ... })  — kidRequestStore, the SAME
 *      store "My Requests" reads. This is what fires the "Kid Request" push.
 *   2. sendMessage('all', ..., true)          — chatStore, a visible record
 *      in Family Chat. The trailing `true` is `suppressPush`, and it is
 *      LOAD-BEARING: sendRequest above already pushed, and without this the
 *      one tap produced two notifications (live-reported bug: "I'm home!"
 *      produced both a Family Chat push and a Kid Request push). Do not
 *      drop it.
 *
 * Colors: KidCheckinRow's own scheme (money-green / amber / danger),
 * translated to kiosk tokens rather than reused as raw hex — the phone's
 * MONEY_GREEN and BRAND.amber are app-palette values with no dark variant
 * for the kiosk surface. k.sage / k.gold / k.danger are the closest kiosk
 * roles and each resolves correctly in both modes.
 */
function KidCheckinSheet({ active, k, isDark, onClose }: {
  active: FamilyMember; k: KioskColors; isDark: boolean; onClose: () => void;
}) {
  const { sendRequest } = useKidRequestStore();
  const { sendMessage } = useChatStore();
  const dayEvents = useEventStore(s => s.dayEvents);

  // Optional message context. KidView derives these from its own
  // myUpcomingEvents/todayEvents; the kiosk equivalent is dayEvents (today,
  // already loaded by this same Overview) filtered by the SAME
  // "is this event this member's" test the Schedule tab and KidTodayWidget
  // use, so the three never disagree about whose event something is.
  const { confirmedRide, nextEvent } = useMemo(() => {
    const mine = dayEvents
      .filter(ev => {
        const ids = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
        return ids.includes(active.id);
      })
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    return {
      confirmedRide: mine.find(ev => {
        const a = eventAssignee(ev);
        return !!a.name && a.status === 'confirmed';
      }),
      nextEvent: mine.find(ev => eventAssignee(ev).status !== 'rejected'),
    };
  }, [dayEvents, active.id]);

  const send = (type: 'home' | 'ready' | 'late') => {
    // Verbatim from KidView.sendCheckin — same emoji, same context.
    const messages: Record<string, { detail: string; chatMsg: string; emoji: string }> = {
      home:  { detail: "I'm home! 🏠", chatMsg: `${active.name.split(' ')[0]} is home! 🏠`, emoji: "🏠 I'm home!" },
      ready: { detail: `I'm ready for pickup! 🎒${confirmedRide ? ` (${confirmedRide.title})` : ''}`,
               chatMsg: `${active.name.split(' ')[0]} is ready for pickup! 🎒${confirmedRide ? ` (${confirmedRide.title})` : ''}`, emoji: "🎒 I'm ready!" },
      late:  { detail: `Running a bit late 🏃${nextEvent ? ` for ${nextEvent.title}` : ''}`,
               chatMsg: `${active.name.split(' ')[0]} is running late 🏃${nextEvent ? ` for ${nextEvent.title}` : ''}`, emoji: '🏃 Running late!' },
    };
    const m = messages[type];
    sendRequest({ type: 'checkin', fromMemberId: active.id, detail: m.detail, urgency: type === 'late' ? 'soon' : 'normal' });
    // Trailing `true` is suppressPush — see this component's doc comment.
    sendMessage('all', active.id, m.chatMsg, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
    onClose();
    // Kiosk confirms with the shared toast, the same way this screen's
    // other write actions do (KioskTasksTab's claim/submit/approve) —
    // Alert.alert, which the phone uses here, is a phone-native modal that
    // would sit on a wall tablet until someone dismissed it.
    showToast(`${m.emoji} Family has been notified!`);
  };

  const options: { type: 'home' | 'ready' | 'late'; label: string; sub: string; Icon: LucideIcon; accent: string }[] = [
    { type: 'home',  label: "I'm Home!",     sub: 'Let everyone know you made it', Icon: Home,    accent: k.sage },
    { type: 'ready', label: "I'm Ready!",    sub: confirmedRide ? confirmedRide.title : 'Ready for pickup', Icon: Backpack, accent: k.gold },
    { type: 'late',  label: 'Running Late',  sub: nextEvent ? `for ${nextEvent.title}` : 'On your way, just behind', Icon: Timer, accent: k.danger },
  ];

  return (
    <KioskSheet
      title="Let family know" subtitle="Check in" accent={k.purple} Icon={Hand}
      k={k} isDark={isDark} onClose={onClose}
    >
      <View style={s.checkinRow}>
        {options.map(({ type, label, sub, Icon, accent }) => (
          <Pressable
            key={type}
            onPress={() => send(type)}
            style={({ pressed }) => [
              s.checkinBtn,
              {
                backgroundColor: accent + (isDark ? '1F' : '14'),
                borderColor: accent + (isDark ? '4D' : '40'),
              },
              pressed && { opacity: 0.72 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={`Tells the family: ${sub}`}
          >
            <Icon size={28} color={accent} strokeWidth={2.2} />
            <Text style={[s.checkinLabel, { color: accent }]} numberOfLines={1}>{label}</Text>
            <Text style={[s.checkinSub, { color: k.textMuted }]} numberOfLines={2}>{sub}</Text>
          </Pressable>
        ))}
      </View>
    </KioskSheet>
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
  // Row. Wraps 5-up / 3-up / 2-up by construction (flexBasis + flexWrap),
  // the same reflow-by-construction approach the Overview hero uses, so it
  // never needs a measured breakpoint.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.sm },
  // Shrunk from a 130-wide/tall vertical card to a compact horizontal chip
  // (icon left, label right, single line) — at ~12 tiles in one card, the
  // taller vertical shape read as a crowded wall of icons rather than a
  // tidy strip. Still meets KIOSK_HIT.min for the tap target as a whole.
  tile: {
    flexGrow: 1, flexBasis: 148, minWidth: 0,
    minHeight: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs,
  },
  tileChip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { flex: 1, fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  tileBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  tileBadgeText: { fontSize: KIOSK_TYPO.micro, fontWeight: '900' },

  // Sub-group label inside the one card. A LABEL, not a control — every
  // tile under it opens its destination directly, with no picker step.
  groupLabel: {
    fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 0.8,
    marginTop: KIOSK_SPACE.md,
  },

  // Hero-row tile. Mirrors KioskOverviewTab's own `quick`/`quickLabel`
  // exactly, because KioskKidCheckInTile renders inside that hero strip
  // next to Intercom and has to be the same shape as its sibling.
  heroQuick: {
    flexGrow: 1, flexBasis: 110, minWidth: 0,
    minHeight: 76, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.sm,
  },
  heroQuickLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },

  // Check-in sheet — three big targets, one row, wrapping on a narrow panel.
  checkinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  checkinBtn: {
    flexGrow: 1, flexBasis: 150, minWidth: 0,
    minHeight: KIOSK_HIT.primary + 40, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.md,
  },
  checkinLabel: { fontSize: KIOSK_TYPO.body, fontWeight: '900', textAlign: 'center' },
  checkinSub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', textAlign: 'center' },

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

  // Shared 24px emoji glyph — used by both the cheer row and requests list.
  lbEmoji: { fontSize: 24 },

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
