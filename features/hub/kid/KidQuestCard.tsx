import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  Clock, CheckCircle2, Ban, Zap, Coins, ClipboardList, Sparkles, Trophy, Camera, Target, RotateCcw, History,
} from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { fmtDateTime, fmtDateShort, parseLocalDate } from '@/lib/dates';
import { KID } from './kidTheme';
import { CollapsibleCard, QuestLiveness } from '../hubComponents';
import { BonusCoinBadge } from './BonusCoinBadge';
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

function questStatusMeta(q: Quest, colors: any) {
  const isPool = q.isPool && q.status === 'todo';
  if (q.status === 'pending_approval') return { Icon: Clock, label: 'IN REVIEW', color: BRAND.amber };
  if (q.status === 'approved' || q.status === 'done') return { Icon: CheckCircle2, label: 'APPROVED', color: MONEY_GREEN };
  if (q.status === 'cancelled') return { Icon: Ban, label: 'CANCELLED', color: colors.danger };
  if (q.status === 'declined') return { Icon: RotateCcw, label: 'NEEDS ANOTHER TRY', color: colors.danger };
  if (q.status === 'in_progress') return { Icon: Zap, label: 'IN PROGRESS', color: BRAND.teal };
  if (q.status === 'claimed') return { Icon: Zap, label: 'CLAIMED', color: BRAND.teal };
  if (isPool) return { Icon: Coins, label: 'BOUNTY', color: MONEY_GREEN };
  return { Icon: ClipboardList, label: 'TO DO', color: BRAND.purple };
}

export function KidQuestCard({
  q, active, members, allQuests, colors, isDark,
  onClaim, onStart, onSubmit, onAcceptGpQuest, onDeclineGpQuest,
}: {
  q: Quest; active: FamilyMember; members: FamilyMember[]; allQuests: Quest[]; colors: any; isDark: boolean;
  onClaim: (id: string) => void;
  onStart: (id: string) => void;
  onSubmit: (q: Quest) => void;
  onAcceptGpQuest: (id: string) => void;
  onDeclineGpQuest: (q: Quest) => void;
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
  console.log(`[UserAction] FILTER screen=Hub role=kid member=${active.name} list=teamMates totalSource=${allQuests.length} afterFilter=${teamMates.length} [features/hub/kid/KidQuestCard.tsx:59]`);

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
    <CollapsibleCard accent={meta.color} colors={colors} isDark={isDark} defaultExpanded={false}
      summary={
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: KID.body, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              <Text style={{ fontSize: KID.tiny }}>🪙</Text>
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: BRAND.amber }}>{q.coins}</Text>
            </View>
            {q.bonusCoins > 0 && <BonusCoinBadge bonusCoins={q.bonusCoins} />}
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
      }>
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
          Your requested reward ({q.coins} 🪙) needs a parent's OK since it's above the household limit — go ahead and start the quest, the reward will be confirmed separately.
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
      {q.pendingTerms ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Still fine by me" on "${q.title}" (id=${q.id}) → acceptTermsChange`); acceptTermsChange(q.id, active.id); }}
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderRadius: 10, backgroundColor: MONEY_GREEN, paddingVertical: 13 }}>
            <CheckCircle2 size={15} color="#fff" />
            <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>Still fine by me</Text>
          </Pressable>
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Hand it back" on "${q.title}" (id=${q.id}) → rejectTermsChange`); rejectTermsChange(q.id, active.id); }}
            style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: `${colors.danger}50`, paddingVertical: 13, alignItems: 'center' }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.danger }}>Hand it back</Text>
          </Pressable>
        </View>
      ) : isActionable && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {isGpTodo ? (
            <>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "I'll take it" on "${q.title}" (id=${q.id}) → onAcceptGpQuest("${q.id}") [features/hub/kid/KidQuestCard.tsx:156]`); onAcceptGpQuest(q.id); }}
                style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 10, backgroundColor: MONEY_GREEN, paddingVertical: 13 }}>
                <Sparkles size={15} color="#fff" />
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>I'll take it</Text>
              </Pressable>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Decline" on "${q.title}" (id=${q.id}) → onDeclineGpQuest [features/hub/kid/KidQuestCard.tsx:162]`); onDeclineGpQuest(q); }}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: `${colors.danger}50`, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.danger }}>Decline</Text>
              </Pressable>
            </>
          ) : isPool ? (
            <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Claim" on "${q.title}" (id=${q.id}) → onClaim("${q.id}") [features/hub/kid/KidQuestCard.tsx:168]`); onClaim(q.id); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 10, backgroundColor: BRAND.purple, paddingVertical: 13 }}>
              <Trophy size={15} color="#fff" />
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>Claim (+{q.coins} 🪙)</Text>
            </Pressable>
          ) : isClaimed ? (
            // Was Start-only — canDeclinePlain (below) already includes
            // 'claimed' in its own status check to offer a decline here,
            // matching the Chores tab's canSubmit/canKidDecline (both true
            // simultaneously for a claimed quest there), but this branch
            // order meant isClaimed always won first, making that decline
            // path dead code — a kid who claimed a pool quest and changed
            // their mind could back out from the Chores tab but not from
            // the identical card on the Hub (QA sweep, kid-role audit,
            // Medium).
            <>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Start Quest" on "${q.title}" (id=${q.id}) → onStart("${q.id}") [features/hub/kid/KidQuestCard.tsx:185]`); onStart(q.id); }}
                style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 10, backgroundColor: BRAND.teal, paddingVertical: 13 }}>
                <Zap size={15} color="#fff" fill="#ffffff30" />
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>Start Quest</Text>
              </Pressable>
              {canDeclinePlain && (
                <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Can't do this" on "${q.title}" (id=${q.id}) → onDeclineGpQuest [features/hub/kid/KidQuestCard.tsx:192]`); onDeclineGpQuest(q); }}
                  style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: `${colors.danger}50`, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.danger }}>Can't do this</Text>
                </Pressable>
              )}
            </>
          ) : canDeclinePlain ? (
            <>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "${q.photoRequired ? 'Take Photo to Get Paid' : 'Mark Done → Get Paid'}" on "${q.title}" (id=${q.id}) → onSubmit [features/hub/kid/KidQuestCard.tsx:200]`); onSubmit(q); }}
                style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 10, backgroundColor: MONEY_GREEN, paddingVertical: 13 }}>
                {q.photoRequired ? <Camera size={15} color="#fff" /> : <CheckCircle2 size={15} color="#fff" />}
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>
                  {q.photoRequired ? 'Take Photo to Get Paid' : 'Mark Done → Get Paid'}
                </Text>
              </Pressable>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Can't do this" on "${q.title}" (id=${q.id}) → onDeclineGpQuest [features/hub/kid/KidQuestCard.tsx:208]`); onDeclineGpQuest(q); }}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: `${colors.danger}50`, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.danger }}>Can't do this</Text>
              </Pressable>
            </>
          ) : q.kidDisputedRedo ? (
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: KID.body, color: colors.textTertiary, fontStyle: 'italic' }}>
                Waiting on a second parent to take a look…
              </Text>
            </View>
          ) : isDeclined ? (
            <>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Revise & Resubmit" on "${q.title}" (id=${q.id}) → onSubmit [features/hub/kid/KidQuestCard.tsx:214]`); onSubmit(q); }}
                style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 10, backgroundColor: colors.danger, paddingVertical: 13 }}>
                <RotateCcw size={15} color="#fff" />
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>↩ Revise & Resubmit</Text>
              </Pressable>
              {/* QA punch list #5 — pre-payout dispute: "I did do it right the
                  first time" instead of resubmitting. Only offered on a real
                  redo_requested (not while already disputed). */}
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "I did do it" on "${q.title}" (id=${q.id}) → disputeRedo`); useChoreStore.getState().disputeRedo(q.id, active.id); }}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: `${BRAND.purple}50`, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: BRAND.purple }}>I did do it</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "${q.photoRequired ? 'Take Photo to Get Paid' : 'Mark Done → Get Paid'}" on "${q.title}" (id=${q.id}) → onSubmit [features/hub/kid/KidQuestCard.tsx:221]`); onSubmit(q); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 10, backgroundColor: MONEY_GREEN, paddingVertical: 13 }}>
              {q.photoRequired ? <Camera size={15} color="#fff" /> : <CheckCircle2 size={15} color="#fff" />}
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>
                {q.photoRequired ? 'Take Photo to Get Paid' : 'Mark Done → Get Paid'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {historyOpen && (
        <ChoreHistorySheet choreId={q.id} title={q.title} members={members} onClose={() => setHistoryOpen(false)} />
      )}
    </CollapsibleCard>
  );
}
