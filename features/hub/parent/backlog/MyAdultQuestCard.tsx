import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { ChevronUp, ChevronDown, Check, Send, MessageCircle } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { useChoreStore } from '@/store/choreStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import type { Quest } from '@/store/questStore';
import type { ParentQuestAssignment } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import { fmtDate } from '@/lib/dates';

// A parent-only quest assigned to the current parent — mark it done (closing
// the linked assignment too, if one exists, or a second "Done" card would
// resurface after this one disappears) or hand it off to a co-parent.
export function MyAdultQuestCard({ q, parentAssignments, active, members, colors, isDark, completeParentQuest, updateQuest, onDelegate, onLongPress }: {
  q: Quest; parentAssignments: ParentQuestAssignment[]; active: { id: string };
  members: FamilyMember[];
  colors: any; isDark: boolean;
  completeParentQuest: (assignmentId: string, completedBy: string) => void;
  updateQuest: (id: string, patch: Partial<Quest>) => void;
  onDelegate: (choreId: string, title: string) => void;
  // Optional — only the Chores tab wires this (edit-quest flow); Household
  // Backlog has no separate edit modal for this card today.
  onLongPress?: () => void;
}) {
  const [isExp, setExp] = useState(false);

  // Previously this card showed only "Done / Reassign" with zero indication
  // of whether the task was self-created or handed to you by a co-parent —
  // a real gap noticed in actual use, not caught by any spec-conformance
  // audit since "who assigned this" isn't a numbered requirement, just a
  // thing a person looking at two identical-looking cards on two different
  // parents' phones would reasonably want to know. Mirrors the "→ Partner"
  // line and Nudge action OthersAdultQuestCard (the read-only view of a
  // task assigned to a co-parent) already has, so this reads as the mirror
  // image of that card instead of two visually unrelated things.
  // Same shared lookup DelegateSheet/HouseholdBacklogSection use — was its
  // own hand-rolled predicate here (status !== 'COMPLETED' && !== 'DECLINED',
  // a THIRD distinct status list from what DelegateSheet's own copy used),
  // one of several independent re-derivations of "which assignment is
  // currently live on this chore" that drifted apart from each other.
  // useChoreStore(s => ...) (not .getState()) so this stays reactive —
  // a plain getState() read here wouldn't re-render when parentAssignments
  // changes out from under an already-mounted card.
  const linkedAssignment = useChoreStore(s => s.getLiveAssignmentForChore(q.id));
  const assignerId = linkedAssignment?.assignedBy ?? (q.createdById !== active.id ? q.createdById : undefined);
  const assigner = assignerId && assignerId !== active.id ? members.find(m => m.id === assignerId) : undefined;

  const sendNudgeBack = () => {
    if (!assigner) return;
    const msg = `👋 Just a heads up — I'm on "${q.title}", will handle it soon!`;
    // Was an unconditional "Sent!" alert fired right after the
    // fire-and-forget call, regardless of whether it actually succeeded —
    // now gated on the real outcome.
    useChatStore.getState().sendMessage(assigner.id, active.id, msg)
      .then(() => showToast(`${assigner.name.split(' ')[0]} was notified you're on it ✓`))
      .catch((e: any) => {
        console.warn('[MyAdultQuestCard] sendNudgeBack failed', e?.message ?? e);
        Alert.alert('Could not send', "The nudge didn't go through — check your connection and try again.");
      });
    // Live-reported: "Nudge also should trigger the push along sending the
    // chat" — was chat-DM-only. Chat message above stays as the in-thread
    // record; this adds a real push alongside it.
    const familyId = useChoreStore.getState().chores.find(c => c.id === q.id)?.familyId;
    if (familyId) {
      supabase.functions.invoke('family-notifier', {
        body: {
          type: 'custom', familyId, memberIds: [assigner.id], persist: true,
          excludeMemberId: active.id,
          payload: { title: '👋 Nudge', body: msg, data: { screen: 'Quests', questId: q.id } },
        },
      }).catch((e: any) => console.warn('[MyAdultQuestCard] nudge push failed', e?.message));
    }
  };

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF', overflow: 'hidden',
      borderLeftWidth: 3, borderLeftColor: colors.primary,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => setExp(e => !e)} onLongPress={onLongPress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
          {assigner ? (
            <Text style={{ fontSize: TYPO.label, color: colors.warning, marginTop: 2, fontWeight: '600' }}>
              ← from {assigner.name.split(' ')[0]}{q.dueDate ? ` · Due ${fmtDate(q.dueDate)}` : ''}
            </Text>
          ) : q.dueDate && !isExp ? (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>Due {fmtDate(q.dueDate)}</Text>
          ) : null}
        </View>
        {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        <Pressable onPress={() => {
          const a = useChoreStore.getState().getLiveAssignmentForChore(q.id);
          if (a) completeParentQuest(a.id, active.id);
          else updateQuest(q.id, { status: 'done' });
        }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.parent, borderRadius: 10, paddingVertical: 8 }}>
          <Check size={13} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Done</Text>
        </Pressable>
        <Pressable onPress={() => onDelegate(q.id, q.title)}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderColor: colors.warning + '60', borderRadius: 10, paddingVertical: 8 }}>
          <Send size={12} color={colors.warning} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warning }}>Reassign</Text>
        </Pressable>
      </View>
      {assigner && (
        <Pressable onPress={sendNudgeBack}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingBottom: 12 }}>
          <MessageCircle size={12} color={colors.textTertiary} />
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Let {assigner.name.split(' ')[0]} know you're on it</Text>
        </Pressable>
      )}
      {isExp && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.primary + '30', padding: 12, gap: 6 }}>
          {q.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{q.description}</Text> : null}
          {q.dueDate ? <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Due {fmtDate(q.dueDate)}</Text> : null}
          {/* Lifecycle timestamps — previously this card showed no dates
              at all beyond a due date, so there was no way to tell when
              this adult task was actually created or claimed/started. */}
          {((q as any).createdAt || q.claimedAt) && (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>
              {(q as any).createdAt && `Assigned ${new Date((q as any).createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              {(q as any).createdAt && q.claimedAt ? ' → ' : ''}
              {q.claimedAt && `Started ${new Date(q.claimedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${new Date(q.claimedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
