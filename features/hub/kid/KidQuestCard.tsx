import { View, Text, Pressable } from 'react-native';
import {
  Clock, CheckCircle2, Ban, Zap, Coins, ClipboardList, Sparkles, Trophy, Camera, Target, RotateCcw,
} from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { fmtDateTime } from '@/lib/dates';
import { KID } from './kidTheme';
import { CollapsibleCard, QuestLiveness } from '../hubComponents';
import { BonusCoinBadge } from './BonusCoinBadge';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

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
  const isPool = q.isPool && q.status === 'todo';
  const isClaimed = q.status === 'claimed';
  const isDeclined = q.status === 'declined';
  const isActionable = ['todo', 'claimed', 'in_progress', 'declined'].includes(q.status);
  const meta = questStatusMeta(q, colors);
  // A grandparent quest waits on the kid's yes/no before it counts as started.
  const isGpTodo = q.questType === 'grandparent_quest' && q.status === 'todo' && !isPool;
  // Bounty offered to a shortlist of siblings — each earns the full coins
  // independently; nobody's payout depends on the others finishing.
  const teamMates = q.teamGroupId ? allQuests.filter(t => t.teamGroupId === q.teamGroupId && t.id !== q.id) : [];

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
            {(q.status === 'approved' || q.status === 'done') && q.approvedAt && (
              <Text style={{ fontSize: KID.tiny, color: colors.textTertiary }}>{fmtDateTime(q.approvedAt)}</Text>
            )}
            {q.status === 'cancelled' && q.cancelledAt && (
              <Text style={{ fontSize: KID.tiny, color: colors.textTertiary }}>{fmtDateTime(q.cancelledAt)}</Text>
            )}
          </View>
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
      {isDeclined && q.declineReason && (
        <Text style={{ fontSize: KID.body, color: colors.danger }}>
          "{q.declineReason}"
        </Text>
      )}
      {q.teamGroupId && teamMates.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <Target size={14} color={BRAND.amber} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: KID.body, fontWeight: '700', color: BRAND.amber }}>
            Also offered to {teamMates.map(t => members.find(m => m.id === t.assignedToId)?.name.split(' ')[0] ?? 'a sibling').join(' & ')} — everyone who finishes gets the full {q.coins} 🪙
          </Text>
        </View>
      )}
      {isActionable && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {isGpTodo ? (
            <>
              <Pressable onPress={() => onAcceptGpQuest(q.id)}
                style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 10, backgroundColor: MONEY_GREEN, paddingVertical: 13 }}>
                <Sparkles size={15} color="#fff" />
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>I'll take it</Text>
              </Pressable>
              <Pressable onPress={() => onDeclineGpQuest(q)}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: `${colors.danger}50`, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.danger }}>Decline</Text>
              </Pressable>
            </>
          ) : isPool ? (
            <Pressable onPress={() => onClaim(q.id)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 10, backgroundColor: BRAND.purple, paddingVertical: 13 }}>
              <Trophy size={15} color="#fff" />
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>Claim (+{q.coins} 🪙)</Text>
            </Pressable>
          ) : isClaimed ? (
            <Pressable onPress={() => onStart(q.id)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 10, backgroundColor: BRAND.teal, paddingVertical: 13 }}>
              <Zap size={15} color="#fff" fill="#ffffff30" />
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>Start Quest</Text>
            </Pressable>
          ) : isDeclined ? (
            <Pressable onPress={() => onSubmit(q)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 10, backgroundColor: colors.danger, paddingVertical: 13 }}>
              <RotateCcw size={15} color="#fff" />
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: '#fff' }}>↩ Revise & Resubmit</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => onSubmit(q)}
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
    </CollapsibleCard>
  );
}
