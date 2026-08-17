import { View, Text, Pressable } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { fmtDateTime } from '@/lib/dates';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

function questStatusMeta(q: Quest) {
  const isPool = q.isPool && q.status === 'todo';
  if (q.status === 'pending_approval') return { icon: '⏳', label: 'IN REVIEW',  color: BRAND.amber };
  if (q.status === 'approved' || q.status === 'done') return { icon: '✅', label: 'APPROVED',  color: '#10B981' };
  if (q.status === 'cancelled') return { icon: '🚫', label: 'CANCELLED', color: '#EF4444' };
  if (q.status === 'in_progress') return { icon: '⚡', label: 'IN PROGRESS', color: BRAND.teal };
  if (q.status === 'claimed') return { icon: '⚡', label: 'CLAIMED', color: BRAND.teal };
  if (isPool) return { icon: '💰', label: 'BOUNTY', color: '#10B981' };
  return { icon: '📋', label: 'TO DO', color: BRAND.purple };
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
  const isActionable = ['todo', 'claimed', 'in_progress'].includes(q.status);
  const meta = questStatusMeta(q);
  // A grandparent quest waits on the kid's yes/no before it counts as started.
  const isGpTodo = q.questType === 'grandparent_quest' && q.status === 'todo' && !isPool;
  // Bounty offered to a shortlist of siblings — each earns the full coins
  // independently; nobody's payout depends on the others finishing.
  const teamMates = q.teamGroupId ? allQuests.filter(t => t.teamGroupId === q.teamGroupId && t.id !== q.id) : [];

  return (
    <CollapsibleCard accent={meta.color} colors={colors} isDark={isDark} defaultExpanded={false}
      summary={
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              <Text style={{ fontSize: 10 }}>🪙</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.amber }}>{q.coins}</Text>
            </View>
            <View style={{ backgroundColor: meta.color + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: meta.color }}>{meta.icon} {meta.label}</Text>
            </View>
            {(q.status === 'approved' || q.status === 'done') && q.approvedAt && (
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtDateTime(q.approvedAt)}</Text>
            )}
            {q.status === 'cancelled' && q.cancelledAt && (
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtDateTime(q.cancelledAt)}</Text>
            )}
          </View>
        </View>
      }>
      {q.description ? (
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>"{q.description}"</Text>
      ) : null}
      {q.status === 'pending_approval' && (
        <Text style={{ fontSize: TYPO.body, color: BRAND.amber }}>Waiting on a parent to review this quest.</Text>
      )}
      {q.teamGroupId && teamMates.length > 0 && (
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: BRAND.amber }}>
          🎯 Also offered to {teamMates.map(t => members.find(m => m.id === t.assignedToId)?.name.split(' ')[0] ?? 'a sibling').join(' & ')} — everyone who finishes gets the full {q.coins} 🪙
        </Text>
      )}
      {isActionable && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {isGpTodo ? (
            <>
              <Pressable onPress={() => onAcceptGpQuest(q.id)}
                style={{ flex: 2, borderRadius: 10, backgroundColor: '#10B981', paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>🙌 I'll take it</Text>
              </Pressable>
              <Pressable onPress={() => onDeclineGpQuest(q)}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#EF444450', paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>Decline</Text>
              </Pressable>
            </>
          ) : isPool ? (
            <Pressable onPress={() => onClaim(q.id)}
              style={{ flex: 1, borderRadius: 10, backgroundColor: BRAND.purple, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>🏆 Claim (+{q.coins} 🪙)</Text>
            </Pressable>
          ) : isClaimed ? (
            <Pressable onPress={() => onStart(q.id)}
              style={{ flex: 1, borderRadius: 10, backgroundColor: BRAND.teal, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>⚡ Start Quest</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => onSubmit(q)}
              style={{ flex: 1, borderRadius: 10, backgroundColor: '#10B981', paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
                {q.photoRequired ? '📸 Take Photo to Get Paid' : '✅ Mark Done → Get Paid'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </CollapsibleCard>
  );
}
