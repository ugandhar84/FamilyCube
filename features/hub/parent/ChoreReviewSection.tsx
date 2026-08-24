import { useState } from 'react';
import { View, Text, Pressable, Alert, TextInput } from 'react-native';
import { ClipboardList, Laptop, Leaf, HeartHandshake, CheckCircle2, HandCoins, Camera, MessageCircle, Coins, X, Hand, PartyPopper, Clock3 } from 'lucide-react-native';
import { TYPO, RADIUS } from '@/constants/theme';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';
import { ParentReviewDeck } from '@/features/chores/ParentReviewDeck';
import { GpOfferReviewCard } from './GpOfferReviewCard';
import { KidProposedChoreCard } from './KidProposedChoreCard';
import { SectionCard } from '../hubComponents';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// Money-green — "Save" jar accent in the coin-split preview, distinct from
// brand teal used for this card's header. Not colors.success (which IS
// brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

function GpSafetyReviewCard({ c, members, colors, isDark, approveGrandparentQuestAsParent, declineGrandparentQuestAsParent, active }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  approveGrandparentQuestAsParent: (choreId: string, parentId: string) => void;
  declineGrandparentQuestAsParent: (choreId: string, parentId: string, reason: string) => void;
}) {
  const sponsor = members.filter(m => m.role === 'senior').find(s => s.id === c.sponsorUserId);
  const linkedParent = sponsor?.linkedParentId ? members.find(m => m.id === sponsor.linkedParentId) : undefined;
  // Before approval nothing is assigned yet — targetChildIds is the only
  // record of who this was meant for. A 2+ target quest becomes a bounty
  // (full points each, independent) once approved.
  const targetKids = (c.targetChildIds?.length ? c.targetChildIds : c.assignedToId ? [c.assignedToId] : [])
    .map(id => members.find(m => m.id === id))
    .filter((m): m is FamilyMember => !!m);
  const pts = c.basePoints;

  return (
    <View style={{ borderRadius: 16, overflow: 'hidden',
      borderWidth: 1.5, borderColor: colors.parent + '40',
      backgroundColor: isDark ? colors.parent + '08' : colors.parent + '06' }}>
      <View style={{ backgroundColor: colors.parent, paddingHorizontal: 14, paddingVertical: 8,
        flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {c.questMode === 'virtual' ? <Laptop size={15} color="#fff" /> : <Leaf size={15} color="#fff" />}
        <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>
          {c.questMode === 'virtual' ? 'Virtual' : 'In-Person'} Quest · {pts} pts
        </Text>
        <Text style={{ fontSize: TYPO.micro, color: '#fff', opacity: 0.8 }}>
          from {sponsor?.name.split(' ')[0] ?? 'Grandparent'}{linkedParent ? ` (${linkedParent.name.split(' ')[0]}'s parent)` : ''}
        </Text>
      </View>
      <View style={{ padding: 14, gap: 8 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
        {c.description ? (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 18 }}>{c.description}</Text>
        ) : null}
        {targetKids.length > 0 ? (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
            For: {targetKids.map(k => k.name.split(' ')[0]).join(', ')}
            {targetKids.length > 1 ? ` — ${pts} pts each, independently` : ''}
          </Text>
        ) : (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>No kid picked — goes to the bounty pool</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { label: 'Spend', val: Math.floor(pts * 0.5), color: colors.kid },
            { label: 'Save',  val: Math.floor(pts * 0.4), color: MONEY_GREEN },
            { label: 'Give',  val: pts - Math.floor(pts * 0.5) - Math.floor(pts * 0.4), color: colors.primary },
          ].map(j => (
            <View key={j.label} style={{ flex: 1, alignItems: 'center', borderRadius: 8,
              backgroundColor: j.color + '12', paddingVertical: 6,
              borderWidth: 1, borderColor: j.color + '20' }}>
              <Text style={{ fontSize: TYPO.micro }}>{j.label}</Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: j.color }}>{j.val}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => declineGrandparentQuestAsParent(c.id, active.id, 'Not suitable')}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
              borderWidth: 1.5, borderColor: colors.border }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={() => approveGrandparentQuestAsParent(c.id, active.id)}
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.parent }}>
            <CheckCircle2 size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Approve & Publish to Kid</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Scenario 1.6 — a grandparent/senior offered to handle an openToGP chore
// ("I'll Handle It") and it's sitting in gp_offer_pending until a parent
// decides. Nothing is assigned yet (gpOfferById only, not assignedToId) —
// Accept makes it real (assignedToId + in_progress), Decline sends it back
// to the open pool for any GP to pick up again.
// A GP-sponsored quest the child already submitted proof for — waiting on
// the SPONSOR grandparent to verify (pending_grandparent_approval), not the
// parent. Previously invisible to the parent entirely: if the sponsoring
// grandparent went quiet (traveling, not opening the app), the submission
// just sat there forever with no parent-side visibility or way to unstick
// it. This card gives the parent a nudge action (chat DM to the sponsor)
// and a fallback Approve & Pay so a stuck review never blocks the kid's
// payout indefinitely.
function GpAwaitingSponsorCard({ c, members, colors, isDark, active, grandparentApproveAndCheer }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  grandparentApproveAndCheer: (choreId: string, grandparentId: string, sticker?: string) => void;
}) {
  const sponsor = members.find(m => m.id === c.sponsorUserId);
  const kid = members.find(m => m.id === c.assignedToId);

  const nudgeSponsor = () => {
    if (!sponsor) return;
    const msg = `👋 ${kid?.name.split(' ')[0] ?? 'Your grandchild'} submitted "${c.title}" a bit ago — it's waiting on you to review and cheer!`;
    useChatStore.getState().sendMessage(sponsor.id, active.id, msg);
    Alert.alert('Nudge sent!', `A reminder was sent to ${sponsor.name.split(' ')[0]}.`);
  };

  const fallbackApprove = () => Alert.alert(
    'Approve on behalf of ' + (sponsor?.name.split(' ')[0] ?? 'the grandparent') + '?',
    `"${c.title}" will be marked verified and ${kid?.name.split(' ')[0] ?? 'the kid'} will be paid. Use this only if ${sponsor?.name.split(' ')[0] ?? 'they'} can't review it themselves.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve & Pay', onPress: () => grandparentApproveAndCheer(c.id, active.id) },
    ],
  );

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? colors.teal + '10' : colors.tealLight,
      borderWidth: 1.5, borderColor: colors.teal + '40' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Camera size={15} color={colors.teal} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
            {kid?.name.split(' ')[0] ?? 'Kid'} submitted proof · waiting on {sponsor?.name.split(' ')[0] ?? 'grandparent'} to verify
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={nudgeSponsor}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.teal + '60' }}>
          <MessageCircle size={13} color={colors.teal} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.teal }}>Nudge {sponsor?.name.split(' ')[0] ?? 'GP'}</Text>
        </Pressable>
        <Pressable onPress={fallbackApprove}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            paddingVertical: 10, borderRadius: 10, backgroundColor: colors.teal }}>
          <CheckCircle2 size={13} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Approve & Pay</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GpTurnedDownCard({ c, members, colors, isDark }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sponsor = members.find(m => m.id === c.sponsorUserId);
  const kid = members.find(m => m.id === c.assignedToId);
  const otherKids = members.filter(m => m.role === 'kid' && m.id !== c.assignedToId);

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? `${colors.danger}10` : colors.dangerLight,
      borderWidth: 1.5, borderColor: `${colors.danger}30` }}>
      <View>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
          {kid?.name.split(' ')[0] ?? 'Kid'} can't take this{sponsor ? ` · from ${sponsor.name.split(' ')[0]}` : ''}
        </Text>
      </View>
      {c.rejectionReason ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textPrimary, fontStyle: 'italic' }}>"{c.rejectionReason}"</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setExpanded(e => !e)}
          style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
            borderWidth: 1.5, borderColor: colors.warning + '60' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.warning }}>Reassign</Text>
        </Pressable>
        <Pressable onPress={() => useChoreStore.getState().updateChore(c.id, {
          status: 'todo', isPool: true, assignedToId: undefined,
          targetChildIds: [], rejectionReason: undefined,
        })}
          style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.parent }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Open to Any Kid</Text>
        </Pressable>
      </View>
      {expanded && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
          {otherKids.map(k => (
            <Pressable key={k.id} onPress={() => {
              useChoreStore.getState().updateChore(c.id, {
                status: 'todo', isPool: false, assignedToId: k.id,
                targetChildIds: [k.id], rejectionReason: undefined,
              });
            }}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                borderWidth: 1.5, borderColor: colors.warning + '50', backgroundColor: colors.warning + '10' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warning }}>{k.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// Scenario 1.13 — a Teen self-created a quest with a coin reward above the
// household's teenRewardCoSignThreshold. The task itself is already
// live/workable (status stays 'todo' throughout) — this card only gates the
// REWARD: Approve Reward pays what was requested, Adjust Reward lets a
// parent set a different amount and approve that instead, Decline zeroes
// the reward but leaves the task itself untouched.
function TeenRewardReviewCard({ c, members, colors, isDark, active, approveTeenReward, adjustTeenReward, declineTeenReward }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  approveTeenReward: (choreId: string, approverId: string) => void;
  adjustTeenReward: (choreId: string, approverId: string, newAmount: number) => void;
  declineTeenReward: (choreId: string, approverId: string, reason?: string) => void;
}) {
  const teen = members.find(m => m.id === c.createdById);
  const [adjusting, setAdjusting] = useState(false);
  const [amount, setAmount] = useState(String(c.coinsReward));
  const requested = c.coinsReward + (c.bonusCoins ?? 0);

  const confirmAdjust = () => {
    const parsed = parseInt(amount, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    adjustTeenReward(c.id, active.id, parsed);
    setAdjusting(false);
  };

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? colors.amber + '10' : colors.amberLight,
      borderWidth: 1.5, borderColor: colors.amber + '40' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Coins size={15} color={colors.amber} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
            {teen?.name.split(' ')[0] ?? 'Teen'} requested {requested} coins — task already in progress, only the reward needs review
          </Text>
        </View>
      </View>

      {adjusting ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            autoFocus
            style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: colors.amber + '60',
              backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 8,
              fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}
          />
          <Pressable onPress={() => setAdjusting(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color={colors.textTertiary} />
          </Pressable>
          <Pressable onPress={confirmAdjust}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.amber }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => Alert.prompt
              ? Alert.prompt('Decline Reward',
                  `${teen?.name.split(' ')[0] ?? 'The teen'}'s requested reward for "${c.title}" will be declined — the task itself is unaffected.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Decline', style: 'destructive', onPress: (reason?: string) => declineTeenReward(c.id, active.id, reason?.trim() || undefined) },
                  ],
                  'plain-text')
              : declineTeenReward(c.id, active.id)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
              borderWidth: 1.5, borderColor: colors.danger + '50' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger }}>Decline</Text>
          </Pressable>
          <Pressable onPress={() => setAdjusting(true)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
              borderWidth: 1.5, borderColor: colors.amber + '60' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.amber }}>Adjust</Text>
          </Pressable>
          <Pressable onPress={() => approveTeenReward(c.id, active.id)}
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 10, borderRadius: 10, backgroundColor: colors.amber }}>
            <CheckCircle2 size={13} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Approve {requested} 🪙</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Scenario 4.7 — an already-approved-and-paid chore a co-parent disagrees
// with. Only shown to parents (never the kid — spec: no visibility into
// the parents' disagreement). Three sub-states render different actions:
//  - not disputed yet, viewer isn't the original approver → Flag / Request Reversal
//  - disputeStatus 'flagged', viewer IS the original approver → Discuss (chat) / Stand By Approval
//  - disputeStatus 'reversal_requested', viewer IS the original approver → Co-Sign Reversal / Stand By Approval
function DisputeApprovalCard({ c, members, colors, isDark, active, flagApprovalForDiscussion, standByApproval, requestApprovalReversal, coSignReversal, acknowledgeRecentApproval }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  flagApprovalForDiscussion: (choreId: string, byParentId: string, note?: string) => void;
  standByApproval: (choreId: string, byParentId: string) => void;
  requestApprovalReversal: (choreId: string, byParentId: string, reason: string) => void;
  coSignReversal: (choreId: string, coSigningParentId: string) => void;
  acknowledgeRecentApproval?: (choreId: string, byParentId: string) => void;
}) {
  const kid = members.find(m => m.id === c.assignedToId);
  const approver = members.find(m => m.id === c.reviewedById);
  const isOriginalApprover = active.id === c.reviewedById;
  const totalCoins = (c.basePoints > 0 ? c.basePoints : c.coinsReward) + (c.bonusCoins ?? 0);

  if (c.disputeStatus === 'reversal_requested' && isOriginalApprover) {
    return (
      <View style={{ borderRadius: 14, padding: 12, gap: 8,
        backgroundColor: isDark ? colors.danger + '12' : colors.danger + '08',
        borderWidth: 1.5, borderColor: colors.danger + '50' }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>
          Reversal requested — "{c.title}"
        </Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
          A co-parent wants to reverse this {totalCoins}-coin payout to {kid?.name.split(' ')[0] ?? 'them'}
          {c.disputeReason ? ` — "${c.disputeReason}"` : ''}. Nothing changes unless you co-sign.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => standByApproval(c.id, active.id)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
              backgroundColor: `${colors.parent}15`, borderWidth: 1, borderColor: `${colors.parent}40` }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.parent }}>Stand By Approval</Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert(
              'Co-Sign Reversal',
              `This will remove ${totalCoins} coins from ${kid?.name.split(' ')[0] ?? 'their'} balance and mark "${c.title}" as declined. This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Co-Sign & Reverse', style: 'destructive', onPress: () => coSignReversal(c.id, active.id) },
              ],
            )}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: colors.danger }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Co-Sign & Reverse</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (c.disputeStatus === 'flagged' && isOriginalApprover) {
    return (
      <View style={{ borderRadius: 14, padding: 12, gap: 8,
        backgroundColor: isDark ? colors.warning + '12' : colors.warningLight,
        borderWidth: 1.5, borderColor: colors.warning + '50' }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.warningDark }}>
          Flagged for discussion — "{c.title}"
        </Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
          A co-parent flagged your approval{c.disputeReason ? ` — "${c.disputeReason}"` : ''}. No coins have moved.
        </Text>
        <Pressable onPress={() => standByApproval(c.id, active.id)}
          style={{ alignItems: 'center', paddingVertical: 9, borderRadius: 10,
            backgroundColor: `${colors.parent}15`, borderWidth: 1, borderColor: `${colors.parent}40` }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.parent }}>Stand By Approval</Text>
        </Pressable>
      </View>
    );
  }

  if (c.disputeStatus) {
    // Viewer isn't the original approver — a request/flag they raised is
    // already pending the other parent's response. No further action here.
    return (
      <View style={{ borderRadius: 14, padding: 12, gap: 4,
        backgroundColor: isDark ? colors.surface : '#F8FAFC', borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{c.title}</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
          {c.disputeStatus === 'reversal_requested' ? 'Waiting on' : 'Flagged for'} {approver?.name.split(' ')[0] ?? 'the other parent'} to respond.
        </Text>
      </View>
    );
  }

  // Not disputed yet. The original approver has nothing to flag/reverse on
  // their own approval, but still gets a Dismiss so their own "Recently
  // Approved" list doesn't keep showing chores they already know about.
  if (isOriginalApprover) {
    if (!acknowledgeRecentApproval) return null;
    return (
      <View style={{ borderRadius: 14, padding: 12, gap: 8,
        backgroundColor: isDark ? colors.surface : '#F8FAFC', borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Coins size={14} color={colors.textTertiary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
              {kid?.name.split(' ')[0] ?? 'Kid'} earned {totalCoins} coins · approved by you
            </Text>
          </View>
          <Pressable onPress={() => acknowledgeRecentApproval(c.id, active.id)}
            hitSlop={8}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
              backgroundColor: isDark ? colors.card : '#EEF2F7' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary }}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? colors.surface : '#F8FAFC', borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Coins size={14} color={colors.textTertiary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
            Approved by {approver?.name.split(' ')[0] ?? 'a parent'} · {kid?.name.split(' ')[0] ?? 'kid'} earned {totalCoins} coins
          </Text>
        </View>
        {acknowledgeRecentApproval && (
          <Pressable onPress={() => acknowledgeRecentApproval(c.id, active.id)}
            hitSlop={8}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
              backgroundColor: isDark ? colors.card : '#EEF2F7' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary }}>Dismiss</Text>
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => Alert.prompt(
            'Flag for Discussion',
            `Let ${approver?.name.split(' ')[0] ?? 'the other parent'} know why you want to discuss "${c.title}" (optional).`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Flag', onPress: (note?: string) => flagApprovalForDiscussion(c.id, active.id, note?.trim() || undefined) },
            ],
            'plain-text',
          )}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
            backgroundColor: `${colors.warning}15`, borderWidth: 1, borderColor: `${colors.warning}40` }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.warningDark }}>Flag for Discussion</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.prompt(
            'Request Reversal',
            `This asks ${approver?.name.split(' ')[0] ?? 'the other parent'} to co-sign reversing the ${totalCoins}-coin payout for "${c.title}". Nothing changes until they agree. Why?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Request', style: 'destructive', onPress: (reason?: string) => requestApprovalReversal(c.id, active.id, reason?.trim() || 'No reason given') },
            ],
            'plain-text',
          )}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
            backgroundColor: `${colors.danger}15`, borderWidth: 1, borderColor: `${colors.danger}40` }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger }}>Request Reversal</Text>
        </Pressable>
      </View>
    </View>
  );
}

// QA punch list #5 — the kid disputed a redo request instead of just
// resubmitting ("I did do it right the first time"). A DIFFERENT parent
// than whoever requested the redo (reviewedById) reviews the ORIGINAL
// submission (photo/note survive the redo transition untouched) and either
// approves it as-is (real payout) or sides with the original redo request.
function RedoDisputeCard({ c, members, colors, isDark, active, resolveRedoDispute }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  resolveRedoDispute: (choreId: string, reviewerId: string, pay: boolean) => void;
}) {
  const kid = members.find(m => m.id === c.assignedToId);
  const originalReviewer = members.find(m => m.id === c.reviewedById);
  const isSameReviewer = active.id === c.reviewedById;
  const totalCoins = (c.basePoints > 0 ? c.basePoints : c.coinsReward) + (c.bonusCoins ?? 0);

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? colors.primary + '10' : colors.primaryLight,
      borderWidth: 1.5, borderColor: colors.primary + '40' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MessageCircle size={15} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
            {kid?.name.split(' ')[0] ?? 'Kid'} disagrees with {originalReviewer?.name.split(' ')[0] ?? 'the'} redo request — asking you to take a look
          </Text>
        </View>
      </View>
      {c.rejectionReason ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>
          Redo reason: "{c.rejectionReason}"
        </Text>
      ) : null}
      {c.submissionNote ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textPrimary }}>
          Original note: "{c.submissionNote}"
        </Text>
      ) : null}
      {isSameReviewer ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontStyle: 'italic' }}>
          You requested this redo — a different parent needs to review the dispute.
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => resolveRedoDispute(c.id, active.id, false)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
              borderWidth: 1.5, borderColor: colors.border }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Side with the redo</Text>
          </Pressable>
          <Pressable
            onPress={() => resolveRedoDispute(c.id, active.id, true)}
            style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 11, borderRadius: 12, backgroundColor: colors.primary }}>
            <CheckCircle2 size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Pay it ({totalCoins}🪙)</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// A kid tapped "Can't make it" → "Ask for a later time" on their own
// assigned chore (features/tasks/lib/cantMakeIt.ts's 'later' outcome) —
// stays assigned to them, status resets to 'todo', reason recorded, but
// previously had NO dedicated parent-facing surface: it just blended into
// the plain chore list with no visible reason and no reassign/coin-bump
// action. Reported live (user: "too hard, need help... assigned to Leo...
// what it suppose to... that request must go to parent... if they want to
// increase coins they can do right?"). Distinguished from a plain
// declined-to-pool chore (declineChoreAssignment's 'Declined by X:' prefix,
// assignedToId cleared) by still having a real assignee.
function CantMakeItLaterCard({ c, members, colors, isDark, active, reassignChore, updateChoreCoins, dismissLaterRequest }: {
  c: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean; active: FamilyMember;
  reassignChore: (choreId: string, newMemberId: string, byMemberId: string, reason?: string) => void;
  updateChoreCoins: (choreId: string, coins: number) => void;
  dismissLaterRequest: (choreId: string) => void;
}) {
  const kid = members.find(m => m.id === c.assignedToId);
  const [reassigning, setReassigning] = useState(false);
  const [bumping, setBumping] = useState(false);
  const [coins, setCoins] = useState(String((c.basePoints > 0 ? c.basePoints : c.coinsReward) ?? 0));
  const eligibleSiblings = members.filter(m => (m.role === 'kid' || m.role === 'teen') && m.id !== c.assignedToId);

  const confirmBump = () => {
    const parsed = parseInt(coins, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    updateChoreCoins(c.id, parsed);
    setBumping(false);
  };

  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 8,
      backgroundColor: isDark ? colors.amber + '10' : colors.amberLight,
      borderWidth: 1.5, borderColor: colors.amber + '40' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Clock3 size={15} color={colors.amber} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{c.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
            {kid?.name.split(' ')[0] ?? 'Kid'} asked for a later time
          </Text>
        </View>
      </View>
      {c.rejectionReason ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textPrimary, fontStyle: 'italic' }}>"{c.rejectionReason}"</Text>
      ) : null}

      {bumping ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Coins size={14} color={colors.amber} />
          <TextInput
            value={coins} onChangeText={setCoins} keyboardType="number-pad" autoFocus
            style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: colors.amber + '60',
              backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 8,
              fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}
          />
          <Pressable onPress={() => setBumping(false)} style={{ paddingHorizontal: 10, paddingVertical: 9 }}>
            <X size={16} color={colors.textTertiary} />
          </Pressable>
          <Pressable onPress={confirmBump}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.amber }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Save</Text>
          </Pressable>
        </View>
      ) : reassigning ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Reassign to</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {eligibleSiblings.map(m => (
              <Pressable key={m.id}
                onPress={() => { reassignChore(c.id, m.id, active.id, c.rejectionReason); setReassigning(false); }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1.5,
                  backgroundColor: isDark ? colors.surface : colors.card, borderColor: colors.border }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{m.name.split(' ')[0]}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setReassigning(false)} style={{ alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable onPress={() => dismissLaterRequest(c.id)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
              borderWidth: 1.5, borderColor: colors.border }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Leave as-is</Text>
          </Pressable>
          <Pressable onPress={() => setBumping(true)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
              borderWidth: 1.5, borderColor: colors.amber + '60' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.amber }}>Bump coins</Text>
          </Pressable>
          {eligibleSiblings.length > 0 && (
            <Pressable onPress={() => setReassigning(true)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.amber }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Reassign</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export function ChoreReviewSection({
  active, members, colors, isDark, chores, pendingReviewsCount,
  approveGrandparentQuestAsParent, declineGrandparentQuestAsParent,
  grandparentApproveAndCheer,
  approveTeenReward, adjustTeenReward, declineTeenReward,
  acceptGPOffer, declineGPOffer,
  approveKidProposedChore, declineKidProposedChore,
  resolveRedoDispute,
  flagApprovalForDiscussion, standByApproval, requestApprovalReversal, coSignReversal,
  acknowledgeRecentApproval,
}: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  chores: ChoreTask[]; pendingReviewsCount: number;
  approveGrandparentQuestAsParent: (choreId: string, parentId: string) => void;
  declineGrandparentQuestAsParent: (choreId: string, parentId: string, reason: string) => void;
  grandparentApproveAndCheer: (choreId: string, grandparentId: string, sticker?: string) => void;
  approveTeenReward: (choreId: string, approverId: string) => void;
  adjustTeenReward: (choreId: string, approverId: string, newAmount: number) => void;
  declineTeenReward: (choreId: string, approverId: string, reason?: string) => void;
  acceptGPOffer: (choreId: string, parentId: string) => void;
  declineGPOffer: (choreId: string, parentId: string, reason?: string) => void;
  approveKidProposedChore: (choreId: string, reviewerId: string, coins: number) => void;
  declineKidProposedChore: (choreId: string, reviewerId: string, reason?: string) => void;
  resolveRedoDispute: (choreId: string, reviewerId: string, pay: boolean) => void;
  flagApprovalForDiscussion?: (choreId: string, byParentId: string, note?: string) => void;
  standByApproval?: (choreId: string, byParentId: string) => void;
  requestApprovalReversal?: (choreId: string, byParentId: string, reason: string) => void;
  coSignReversal?: (choreId: string, coSigningParentId: string) => void;
  acknowledgeRecentApproval?: (choreId: string, byParentId: string) => void;
}) {
  // QA punch list #5 — kid disputed a redo request, waiting on a second
  // parent (not whoever requested the redo) to review the original
  // submission directly.
  const redoDisputed = chores.filter(c => c.status === 'kid_disputed_redo');
  // A kid tapped "Can't make it" → "Ask for a later time" on their own
  // chore (cantMakeIt.ts's 'later' outcome — stays assigned to them,
  // status resets to 'todo', a real rejectionReason recorded) — reported
  // live as having no visible parent-facing surface at all. Distinguished
  // from a plain declined-to-pool chore by still having a real
  // assignedToId (a pool-declined chore always clears it) and NOT starting
  // with declineChoreAssignment's "Declined by X:" prefix. reviewAckIds
  // (the same "Dismiss" mechanism recentlyApproved already uses below)
  // lets this parent clear it from their own list without affecting a
  // co-parent's view.
  const laterRequests = chores.filter(c =>
    c.status === 'todo' && c.assignedToId && c.rejectionReason && c.declinedAt &&
    !c.rejectionReason.startsWith('Declined by') &&
    !(c.reviewAckIds ?? []).includes(active.id)
  );
  const gpPending = chores.filter(c => c.categoryType === 'grandparent_quest' && c.status === 'pending_parent_approval');
  const gpDeclined = chores.filter(c => c.categoryType === 'grandparent_quest' && c.status === 'declined');
  // Submitted by the kid, waiting on the SPONSOR grandparent to verify —
  // distinct from gpPending (which waits on the parent's safety gate before
  // publishing). Surfaced here so a parent has visibility + a fallback if
  // the sponsoring grandparent is unreachable — see GpAwaitingSponsorCard.
  const gpAwaitingSponsor = chores.filter(c => c.categoryType === 'grandparent_quest' && c.status === 'pending_grandparent_approval');
  // Scenario 1.13 — Teen-created quest whose reward exceeded the household
  // threshold. Shown regardless of the task's own status (todo/in_progress/
  // pending_approval/approved) since the flag is specifically about the
  // payout, not the work — a teen can be mid-task or already done while
  // this still needs a parent's decision.
  const teenRewardPending = chores.filter(c => c.rewardPendingReview);
  // Scenario 1.6 — a GP offer waiting on a parent's Accept/Decision. Filtered
  // on the real ChoreStatus ('gp_offer_pending'), not the Quest-shim status
  // it maps to (which is shared with ordinary kid submissions).
  const gpOffersPending = chores.filter(c => c.status === 'gp_offer_pending');
  // A kid proposed this chore for themselves/a sibling — real DB status
  // (see 20260907120000_kid_proposed_chore_rpcs.sql), invisible everywhere
  // else via awaitingParentApproval until the parent Approves/Declines here.
  const kidProposedChores = chores.filter(c => c.status === 'pending_kid_proposal');
  // Scenario 4.7 — approved-in-the-last-7-days chores, so a co-parent
  // catching up after being away still has a reasonable window to dispute
  // something they missed, without surfacing every approval ever made.
  const recentlyApproved = chores.filter(c => {
    if (!['approved', 'auto_approved'].includes(c.status) && !c.disputeStatus) return false;
    if (!c.reviewedById) return false;
    // A live dispute always stays visible, even to the viewer who dismissed
    // it earlier — dismissing isn't a way to duck an active Flag/Reversal
    // conversation, only to clear a settled approval you've already seen.
    if (c.disputeStatus) return true;
    if ((c.reviewAckIds ?? []).includes(active.id)) return false;
    const t = c.approvedAt ? new Date(c.approvedAt).getTime() : 0;
    return t > 0 && (Date.now() - t) < 7 * 24 * 3600_000;
  });
  const disputeBadgeCount = recentlyApproved.filter(c =>
    c.disputeStatus === 'reversal_requested' && c.reviewedById === active.id,
  ).length;
  // Coordinated live-DB QA (Round 19, Critical) — a multi-slot bounty's
  // per-claim submissions never touch the parent chore's own status, so
  // pendingReviewsCount (sourced from getParentReviewDeck's status-based
  // filter) can't see them. This badge is the parent's primary "does
  // anything need me" signal — it must count what ParentReviewDeck (below)
  // actually renders, or a parent can have real pending work with a badge
  // reading 0.
  const pendingBountyClaimsCount = chores.reduce(
    (n, c) => n + (c.claims ?? []).filter(cl => cl.status === 'pending_approval').length, 0,
  );
  const badgeCount = pendingReviewsCount + gpPending.length + teenRewardPending.length + gpOffersPending.length + kidProposedChores.length + redoDisputed.length + laterRequests.length + disputeBadgeCount + pendingBountyClaimsCount;
  // badgeCount deliberately only counts items needing a decision — but
  // gpDeclined/gpAwaitingSponsor/recentlyApproved all render real visible
  // content below (informational, not "pending"), so a card with only
  // those still had genuine content while badgeCount stayed 0, defaulting
  // to collapsed even though there was something to see. Same pattern
  // Household Backlog's own defaultExpanded fix addressed.
  // ParentReviewDeck's own totalCount includes cash-out requests, which
  // aren't tracked anywhere in this section's own filters — reported back
  // via onContentCountChange so the empty state doesn't fire while the deck
  // still has a cash-out card visible underneath it.
  const [deckContentCount, setDeckContentCount] = useState(0);
  const hasContent = badgeCount > 0 || gpDeclined.length > 0 || gpAwaitingSponsor.length > 0 || recentlyApproved.length > 0 || deckContentCount > 0;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={<ClipboardList size={16} color={colors.parent} />}
        title="Chore Reviews"
        subtitle={badgeCount === 0 ? 'All caught up' : undefined}
        accent={colors.parent}
        badge={badgeCount} badgeLabel="Pending" badgeColor={colors.parent}
        // Was `badgeCount > 0` — see hasContent above for why that missed
        // real content in this card.
        collapsible defaultExpanded={hasContent}
        colors={colors} isDark={isDark}>
          <View style={{ gap: 8 }}>
            {teenRewardPending.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Coins size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Teen Quests — High-Value Reward Review
                  </Text>
                </View>
                {teenRewardPending.map(c => (
                  <TeenRewardReviewCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    approveTeenReward={approveTeenReward} adjustTeenReward={adjustTeenReward} declineTeenReward={declineTeenReward} />
                ))}
              </View>
            )}

            {gpOffersPending.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Hand size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Grandparent Offers — Accept or Decline
                  </Text>
                </View>
                {gpOffersPending.map(c => (
                  <GpOfferReviewCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    acceptGPOffer={acceptGPOffer} declineGPOffer={declineGPOffer} />
                ))}
              </View>
            )}

            {kidProposedChores.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <ClipboardList size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Kid-Proposed Chores
                  </Text>
                </View>
                {kidProposedChores.map(c => (
                  <KidProposedChoreCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    approveKidProposedChore={approveKidProposedChore} declineKidProposedChore={declineKidProposedChore} />
                ))}
              </View>
            )}

            {laterRequests.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Clock3 size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Asked for a Later Time
                  </Text>
                </View>
                {laterRequests.map(c => (
                  <CantMakeItLaterCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    reassignChore={(choreId, newMemberId, byMemberId, reason) => {
                      supabase.rpc('reassign_chore', { p_chore_id: choreId, p_new_member_id: newMemberId, p_by_member_id: byMemberId, p_reason: reason ?? null })
                        .then(({ error }: any) => { if (error) console.warn('[ChoreReviewSection] reassign_chore failed', error.message); else useChoreStore.getState().syncFromDB(true); });
                    }}
                    updateChoreCoins={(choreId, coins) => useChoreStore.getState().updateChore(choreId, { coinsReward: coins, basePoints: coins })}
                    dismissLaterRequest={(choreId) => {
                      const chore = chores.find(x => x.id === choreId);
                      useChoreStore.getState().updateChore(choreId, { reviewAckIds: [...(chore?.reviewAckIds ?? []), active.id] });
                    }}
                  />
                ))}
              </View>
            )}

            {redoDisputed.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <MessageCircle size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Redo Disputes — Second Opinion Needed
                  </Text>
                </View>
                {redoDisputed.map(c => (
                  <RedoDisputeCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    resolveRedoDispute={resolveRedoDispute} />
                ))}
              </View>
            )}

            {gpPending.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <HeartHandshake size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Grandparent Quests — Safety Review
                  </Text>
                </View>
                {gpPending.map(c => (
                  <GpSafetyReviewCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    approveGrandparentQuestAsParent={approveGrandparentQuestAsParent}
                    declineGrandparentQuestAsParent={declineGrandparentQuestAsParent} />
                ))}
              </View>
            )}

            {/* Grandparent quest a kid turned down — GP sees this too (their own
                Hub), shown here so the parent isn't relying on chat alone to
                notice and can reassign or open it up without leaving the Hub. */}
            {gpDeclined.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <HandCoins size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Grandparent Quests — Turned Down
                  </Text>
                </View>
                {gpDeclined.map(c => (
                  <GpTurnedDownCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} />
                ))}
              </View>
            )}

            {/* Submitted by the kid, waiting on the sponsoring grandparent to
                verify — not the parent's queue, but visible here so a
                parent can nudge or step in if the GP goes quiet. */}
            {gpAwaitingSponsor.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Camera size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Grandparent Quests — Awaiting Grandparent Review
                  </Text>
                </View>
                {gpAwaitingSponsor.map(c => (
                  <GpAwaitingSponsorCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    grandparentApproveAndCheer={grandparentApproveAndCheer} />
                ))}
              </View>
            )}

            {/* Scenario 4.7 — recently-approved chores a co-parent can flag
                or request a reversal on. Only rendered when the caller
                (ParentView) wired the dispute actions through — a household
                that hasn't loaded them yet simply doesn't show this row
                rather than rendering dead buttons. */}
            {flagApprovalForDiscussion && standByApproval && requestApprovalReversal && coSignReversal && recentlyApproved.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Coins size={12} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Recently Approved
                  </Text>
                </View>
                {recentlyApproved.map(c => (
                  <DisputeApprovalCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                    flagApprovalForDiscussion={flagApprovalForDiscussion} standByApproval={standByApproval}
                    requestApprovalReversal={requestApprovalReversal} coSignReversal={coSignReversal}
                    acknowledgeRecentApproval={acknowledgeRecentApproval} />
                ))}
              </View>
            )}

            <ParentReviewDeck parent={active} members={members} colors={colors} isDark={isDark} hideEmptyState
              onContentCountChange={setDeckContentCount} />

            {/* Single empty state for the whole section — was previously
                duplicated with ParentReviewDeck's own "All caught up" (now
                suppressed via hideEmptyState above), which showed two
                near-identical empty messages stacked whenever both had
                nothing. Gated on hasContent (not just badgeCount === 0) so
                it stays hidden if any informational-only sub-list (turned
                down, awaiting sponsor, recently approved) has real content. */}
            {!hasContent && (
              <View style={{ alignItems: 'center', paddingVertical: 12, gap: 4 }}>
                <PartyPopper size={18} color={colors.textTertiary} />
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center' }}>
                  Reviews are clear
                </Text>
              </View>
            )}
          </View>
      </SectionCard>
    </View>
  );
}
