import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { ChevronUp, ChevronDown, Clock, Undo2, MessageCircle } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { showToast } from '@/components/AppToast';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';

// A task I delegated that's still waiting on the other parent. Still
// PENDING (not yet accepted/bounced) gets a Recall action — the delegator
// can always take a still-open delegation back, per spec 1.3/6.5; once
// bounced/accepted there's a live negotiation or commitment in progress,
// so recall isn't offered (reassign via DelegateSheet is the equivalent
// action for those states). Also gets a Nudge action — every other
// "someone else is holding this up" card in the app (OthersAdultQuestCard,
// MyAdultQuestCard's own nudge-back) already has one; this was the one
// place a delegator was told who they're waiting on with no way to
// actually remind that person, noticed while confirming today's
// reassignment-visibility fix looked right in the app.
export function OutgoingPendingCard({ a, chore, members, active, colors, isDark, onRecall, onRespond }: {
  a: ParentQuestAssignment; chore: ChoreTask; members: FamilyMember[]; active: FamilyMember; colors: any; isDark: boolean;
  onRecall?: () => void;
  // QA exploratory finding — once a delegation bounces (PARKED, not yet
  // locked), the RPC happily accepts a counter-pushback from the assigner
  // (respond_to_parent_quest has no assignedBy/assignedTo asymmetry), but
  // this card never offered a button to do it — only Nudge. The assignee's
  // own DirectPendingCard already has this exact "Respond" affordance;
  // mirroring it here closes the gap rather than leaving the assigner with
  // no in-app way to continue a negotiation they're a full party to.
  onRespond?: (assignmentId: string, choreTitle: string, assignedBy: string, assignedTo: string) => void;
}) {
  const [isExp, setExp] = useState(false);
  const assignee = members.find(m => m.id === a.assignedTo);

  const sendNudge = () => {
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Nudge" on "${chore.title}" waiting on ${assignee?.name ?? 'partner'} (id=${a.id}) → sendMessage [features/hub/parent/backlog/OutgoingPendingCard.tsx:28]`);
    const msg = `👋 Hey ${assignee?.name?.split(' ')[0] ?? 'there'}, just a nudge — "${chore.title}" is still waiting on you. Need any help?`;
    useChatStore.getState().sendMessage(a.assignedTo, active.id, msg)
      .then(() => showToast(`Nudge sent to ${assignee?.name?.split(' ')[0] ?? 'them'} ✓`))
      .catch((e: any) => {
        console.warn('[OutgoingPendingCard] sendNudge failed', e?.message ?? e);
        Alert.alert('Could not send', "The nudge didn't go through — check your connection and try again.");
      });
  };
  const isSnoozed = a.status === 'SNOOZED' && a.snoozeUntil && a.snoozeUntil > new Date().toISOString();
  const isBounced = a.status === 'PARKED';

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF', overflow: 'hidden',
      borderLeftWidth: 3, borderLeftColor: colors.textTertiary,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "${isExp ? 'Collapse' : 'Expand'}" on "${chore.title}" (id=${a.id}) [features/hub/parent/backlog/OutgoingPendingCard.tsx:44]`); setExp(e => !e); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
        <Clock size={14} color={colors.textTertiary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: isBounced ? colors.danger : colors.textTertiary, marginTop: 2 }}>
            {isBounced
              ? `${assignee?.name ?? 'Partner'} pushed back — waiting on your response`
              : isSnoozed
                ? `Snoozed by ${assignee?.name ?? 'partner'} — waiting`
                : `Waiting on ${assignee?.name ?? 'partner'} to accept`}
          </Text>
          {isBounced && a.pushbackDetails ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' }} numberOfLines={isExp ? undefined : 1}>
              "{a.pushbackDetails}"
            </Text>
          ) : null}
        </View>
        {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
      </Pressable>
      {isExp && chore.description && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 12, paddingBottom: !isSnoozed ? 0 : 12 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text>
        </View>
      )}
      {!isSnoozed && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: isExp && chore.description ? 8 : 0 }}>
          <Pressable onPress={sendNudge} /* logging inside sendNudge() */
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderRadius: 10, borderWidth: 1, borderColor: colors.warning + '60', paddingVertical: 8 }}>
            <MessageCircle size={13} color={colors.warning} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warning }}>Nudge</Text>
          </Pressable>
          {isBounced && onRespond && (
            <Pressable
              onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Respond" on "${chore.title}" bounced by ${assignee?.name ?? 'partner'} (id=${a.id}) → onRespond`); onRespond(a.id, chore.title, a.assignedBy, a.assignedTo); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 10, borderWidth: 1, borderColor: colors.primary + '60', paddingVertical: 8 }}>
              <MessageCircle size={13} color={colors.primary} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary }}>Respond</Text>
            </Pressable>
          )}
          {onRecall && (
            <Pressable
              onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Recall" on "${chore.title}" from ${assignee?.name ?? 'partner'} (id=${a.id}) [features/hub/parent/backlog/OutgoingPendingCard.tsx:79]`); Alert.alert(
                'Take this back?',
                `"${chore.title}" will be un-delegated and assigned back to you. ${assignee?.name?.split(' ')[0] ?? 'They'} will be notified.`,
                [{ text: 'Cancel', style: 'cancel' }, { text: 'Recall', onPress: () => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} confirmed "Recall" on "${chore.title}" (id=${a.id}) → onRecall [features/hub/parent/backlog/OutgoingPendingCard.tsx:82]`); onRecall?.(); } }],
              ); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 8 }}>
              <Undo2 size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Recall</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
