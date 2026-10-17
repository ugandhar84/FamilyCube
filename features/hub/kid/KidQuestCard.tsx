import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  Clock, CheckCircle2, Ban, Zap, Coins, ClipboardList, Sparkles, Trophy, Camera, Target, RotateCcw, History,
} from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { fmtDateTime, fmtDateShort, parseLocalDate } from '@/lib/dates';
import { KID } from './kidTheme';
import { QuestLiveness } from '../hubComponents';
import { BonusCoinBadge } from './BonusCoinBadge';
import { FlashBonusBadge } from '@/features/quests/components/FlashBonusBadge';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';
import { deriveQuestActions } from '@/features/tasks/lib/deriveCardActions';
import { useChoreStore } from '@/store/choreStore';
import { useShallow } from 'zustand/react/shallow';
import { ChoreHistorySheet } from '@/features/tasks/components/ChoreHistorySheet';

// Money-green — "approved / bounty" positive accent, distinct from brand
// teal (used elsewhere in this card for in-progress/claimed state). Not
// colors.success (which IS brand teal in this app) — kept as one constant.
const MONEY_GREEN = '#10B981';
// Muted blue — primary CTA fill (Claim/Start/Mark Done/etc.) [live-requested:
// "make the CTA buttons to muted blue color in fill"]. No brand token for
// this exists in constants/colors.ts, so kept as a local constant, same
// pattern as MONEY_GREEN above — a softer, desaturated blue rather than
// GEMINI.blue (which is a punchier link/banner-icon blue elsewhere).
const CTA_BLUE = '#5B7FA6';

function questStatusMeta(q: Quest, colors: any) {
  const isPool = q.isPool && q.status === 'todo';
  if (q.status === 'pending_approval') return { Icon: Clock, label: 'IN REVIEW', color: BRAND.amber };
  if (q.status === 'approved' || q.status === 'done') return { Icon: CheckCircle2, label: 'APPROVED', color: MONEY_GREEN };
  if (q.status === 'cancelled') return { Icon: Ban, label: 'CANCELLED', color: colors.danger };
  // Was also colors.danger — "cancelled" (a parent closed this, nothing to
  // do) and "declined" (kid needs to redo it, an action IS required) read
  // as the exact same red pill with only 11px label text telling them
  // apart. amber matches IN REVIEW's own "still active, needs attention"
  // tone instead of looking like a second flavor of "this is over".
  if (q.status === 'declined') return { Icon: RotateCcw, label: 'NEEDS ANOTHER TRY', color: BRAND.amber };
  if (q.status === 'in_progress') return { Icon: Zap, label: 'IN PROGRESS', color: BRAND.teal };
  if (q.status === 'claimed') return { Icon: Zap, label: 'CLAIMED', color: BRAND.teal };
  if (isPool) return { Icon: Coins, label: 'BOUNTY', color: MONEY_GREEN };
  return { Icon: ClipboardList, label: 'TO DO', color: BRAND.purple };
}

export function KidQuestCard({
  q, active, members, allQuests, colors, isDark,
  onClaim, onStart, onSubmit, onAcceptGpQuest, onDeclineGpQuest, onOpenDetail,
}: {
  q: Quest; active: FamilyMember; members: FamilyMember[]; allQuests: Quest[]; colors: any; isDark: boolean;
  onClaim: (id: string) => void;
  onStart: (id: string) => void;
  onSubmit: (q: Quest) => void;
  onAcceptGpQuest: (id: string) => void;
  onDeclineGpQuest: (q: Quest) => void;
  onOpenDetail?: (q: Quest) => void;
}) {
  // Selected individually (not destructured from the whole store) — Zustand
  // actions are stable references, so this subscribes to nothing and never
  // re-renders on unrelated store changes. Destructuring the whole store
  // here caused a real infinite-render crash (live-tested on device): this
  // card ALSO subscribes below via a selector that returns a fresh object
  // literal every call, so any store update — including this component's
  // own resulting re-render — kept re-triggering itself.
  const acceptTermsChange = useChoreStore(s => s.acceptTermsChange);
  const rejectTermsChange = useChoreStore(s => s.rejectTermsChange);
  const isPool = q.isPool && q.status === 'todo';
  const isClaimed = q.status === 'claimed';
  const isDeclined = q.status === 'declined';
  const isActionable = ['todo', 'claimed', 'in_progress', 'declined'].includes(q.status);
  const meta = questStatusMeta(q, colors);
  // Button-visibility now comes from the same shared derivation QuestCard.tsx
  // (the Chores tab's card) calls — this card used to hand-roll its own
  // isGpTodo/canDeclinePlain here, which is exactly what caused two
  // documented drift bugs vs. the Chores tab (a dead decline-branch on
  // claimed chores, an overdue-badge mismatch) — see
  // features/tasks/lib/deriveCardActions.ts for the full rule set.
  // useShallow — the raw selector below returns a fresh object literal on
  // every call, which without shallow comparison always looks "different"
  // to Zustand's default reference-equality check, re-triggering a render
  // on every store update forever. Combined with the acceptTermsChange/
  // rejectTermsChange fix above, this caused a real "Maximum update depth
  // exceeded" crash live-tested on a physical device.
  const choreExtra = useChoreStore(useShallow(s => {
    const c = s.chores.find(c => c.id === q.id);
    return c ? { categoryType: c.categoryType, status: c.status } : undefined;
  }));
  const { canClaim, canSubmit, canResubmit, canKidDecline, canAcceptGp } = deriveQuestActions(
    q,
    { id: active.id, role: active.role },
    choreExtra,
  );
  const isGpTodo = canAcceptGp;
  const canDeclinePlain = canKidDecline;
  // Bounty offered to a shortlist of siblings — each earns the full coins
  // independently; nobody's payout depends on the others finishing.
  const teamMates = q.teamGroupId ? allQuests.filter(t => t.teamGroupId === q.teamGroupId && t.id !== q.id) : [];
  // Coordinated live-DB QA (launch-readiness round) found this Hub card had
  // zero due-date awareness at all, while the same chore's Chores-tab
  // QuestCard.tsx flags it with a red "⚠ Overdue" badge — same kid, same
  // chore, two different pictures depending which tab they're on. Mirrors
  // QuestCard.tsx's isOverdue definition exactly (date-only compare against
  // the start of today, excluded once done/declined).
  const isDoneCard = q.status === 'approved' || q.status === 'done';
  const dueMs = q.dueDate ? parseLocalDate(q.dueDate).getTime() : null;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const isOverdue = !!dueMs && dueMs < todayStart.getTime() && !isDoneCard && !isDeclined;
  // Multi-slot bounties share one due date across every claimant — see
  // QuestCard.tsx's identical isMultiSlot note (QA Round 19, High).
  const isMultiSlot = (q.maxClaimants ?? 1) > 1;
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    // Plain, always-expanded card — no inline accordion. Tapping the title/
    // badges row still opens the full KidQuestDetailScreen (same navigation
    // as before), but everything that used to be hidden behind
    // CollapsibleCard's chevron is now always visible: once the detail page
    // existed, the inline expand/collapse was just extra friction hiding
    // info the kid could already see one tap away [live-requested: "why dod
    // we need the expanded cards just plain make it"]. Styling (white card,
    // accent border/shadow) replicates CollapsibleCard's own `flatBg` look
    // so this card still matches its CollapsibleCard-using siblings visually
    // — only the toggle behavior is dropped, scoped to this file only.
    <View style={{
      borderRadius: 16, borderWidth: 1, backgroundColor: colors.card, borderColor: meta.color + '40',
      overflow: 'hidden', padding: 12, gap: 8,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => onOpenDetail?.(q)} disabled={!onOpenDetail}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: KID.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>{q.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              <Text style={{ fontSize: KID.tiny }}>🪙</Text>
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.amber }}>{q.coins}</Text>
            </View>
            {/* Was: always the plain, no-countdown BonusCoinBadge — but
                chore bonuses DO carry a real fixed 24h expiry
                (bonusExpiresAt, choreStore.ts:2028/1654), the same field
                the Quests tab's FlashBonusBadge already renders a live
                countdown for. The Hub card silently dropped that
                information [live-reported: "where is the 24h bonus timer
                countdown?"] — show the same countdown badge here whenever
                an expiry actually exists, falling back to the plain pill
                only for a bonus with none. */}
            {q.bonusCoins > 0 && (
              q.bonusExpiresAt
                ? <FlashBonusBadge bonusCoins={q.bonusCoins} expiresAt={q.bonusExpiresAt} />
                : <BonusCoinBadge bonusCoins={q.bonusCoins} />
            )}
            <View style={{ backgroundColor: meta.color + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <meta.Icon size={11} color={meta.color} />
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: meta.color }}>{meta.label}</Text>
            </View>
            {isOverdue && (
              <View style={{ backgroundColor: colors.danger + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: colors.danger }}>
                  {isMultiSlot ? '⚠ Chore overdue' : `⚠ ${fmtDateShort(q.dueDate!)}`}
                </Text>
              </View>
            )}
            {q.rewardPendingReview && (
              <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock size={11} color={BRAND.amber} />
                <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.amber }}>Reward pending review</Text>
              </View>
            )}
            {q.status === 'cancelled' && q.cancelledAt && (
              <Text style={{ fontSize: KID.tiny, color: colors.textTertiary }}>{fmtDateTime(q.cancelledAt)}</Text>
            )}
            <Pressable onPress={() => setHistoryOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <History size={14} color={colors.textTertiary} />
            </Pressable>
          </View>
          {/* Full claimed → submitted → approved timeline — previously only
              the approved timestamp showed, and only for a fully-done
              quest. A parent/kid scanning claimed/in-progress/submitted
              quests had no visibility into when each step actually
              happened. Shown whenever any timestamp exists, not just once
              the quest is fully done. */}
          {(q.claimedAt || q.submittedAt || q.approvedAt) && (
            <Text style={{ fontSize: KID.tiny, color: colors.textTertiary }} numberOfLines={1}>
              {q.claimedAt && `Claimed ${fmtDateTime(q.claimedAt)}`}
              {q.claimedAt && (q.submittedAt || q.approvedAt) ? ' → ' : ''}
              {q.submittedAt && `Submitted ${fmtDateTime(q.submittedAt)}`}
              {q.submittedAt && q.approvedAt ? ' → ' : ''}
              {q.approvedAt && `Approved ${fmtDateTime(q.approvedAt)}`}
            </Text>
          )}
          <QuestLiveness history={q.history} members={members} colors={colors} />
        </View>
      </Pressable>
      {q.description ? (
        <Text style={{ fontSize: KID.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>"{q.description}"</Text>
      ) : null}
      {q.status === 'pending_approval' && (
        <Text style={{ fontSize: KID.body, color: BRAND.amber }}>
          {q.questType === 'grandparent_quest'
            ? 'Waiting on a grandparent to review this chore.'
            : 'Waiting on a parent to review this chore.'}
        </Text>
      )}
      {q.rewardPendingReview && (
        <Text style={{ fontSize: KID.body, color: BRAND.amber }}>
          Your requested reward ({q.coins} 🪙) needs a parent's OK since it's above the household limit — go ahead and start the chore, the reward will be confirmed separately.
        </Text>
      )}
      {isDeclined && q.declineReason && (
        <Text style={{ fontSize: KID.body, color: colors.danger }}>
          "{q.declineReason}"
        </Text>
      )}
      {q.pendingTerms && (
        <View style={{ backgroundColor: BRAND.amber + '14', borderRadius: 10, padding: 10, gap: 4 }}>
          <Text style={{ fontSize: KID.body, fontWeight: '800', color: BRAND.amber }}>The terms changed</Text>
          {q.pendingTerms.old.coinsReward !== q.pendingTerms.new.coinsReward && (
            <Text style={{ fontSize: KID.body, color: colors.textSecondary }}>
              Coins: <Text style={{ textDecorationLine: 'line-through', color: colors.textTertiary }}>{q.pendingTerms.old.coinsReward}</Text> → {q.pendingTerms.new.coinsReward} 🪙
            </Text>
          )}
          {q.pendingTerms.old.dueDate !== q.pendingTerms.new.dueDate && (
            <Text style={{ fontSize: KID.body, color: colors.textSecondary }}>
              Due: <Text style={{ textDecorationLine: 'line-through', color: colors.textTertiary }}>{q.pendingTerms.old.dueDate ?? 'none'}</Text> → {q.pendingTerms.new.dueDate ?? 'none'}
            </Text>
          )}
        </View>
      )}
      {q.teamGroupId && teamMates.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <Target size={14} color={BRAND.amber} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: KID.body, fontWeight: '700', color: BRAND.amber }}>
            Also offered to {teamMates.map(t => members.find(m => m.id === t.assignedToId)?.name.split(' ')[0] ?? 'a sibling').join(' & ')} — everyone who finishes gets the full {q.coins} 🪙
          </Text>
        </View>
      )}
      {/* Action buttons (Claim/Start/Mark Done/Decline/etc.) removed from
          this card — they now live only on KidQuestDetailScreen's own CTA
          row [live-requested: "remove the CTA buttons on the quest card
          and i said CTA button on the Quest details page"]. Tapping this
          card's title/summary row above still opens that detail page via
          onOpenDetail. */}
      {historyOpen && (
        <ChoreHistorySheet choreId={q.id} title={q.title} members={members} onClose={() => setHistoryOpen(false)} />
      )}
    </View>
  );
}
