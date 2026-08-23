import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, Check, MessageCircle, Hand } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';

// Money-green — "Accept" action accent, distinct from brand amber used
// elsewhere in this card. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// A co-parent directly assigned this to you — accept it, or push back
// (snooze / blocker / trade / discuss) via the pushback sheet.
export function DirectPendingCard({ a, chore, members, colors, isDark, respondToParentQuest, onRespond }: {
  a: ParentQuestAssignment; chore: ChoreTask; members: FamilyMember[]; colors: any; isDark: boolean;
  respondToParentQuest: (id: string, response: { action: 'ACCEPT' }) => void;
  onRespond: (assignmentId: string, choreTitle: string, assignedBy: string, assignedTo: string) => void;
}) {
  const [isExp, setExp] = useState(false);
  const assigner = members.find(m => m.id === a.assignedBy);
  const assignee = members.find(m => m.id === a.assignedTo);

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF', overflow: 'hidden',
      borderLeftWidth: 3, borderLeftColor: colors.warning,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent tapped "${isExp ? 'Collapse' : 'Expand'}" on "${chore.title}" (id=${a.id}) [features/hub/parent/backlog/DirectPendingCard.tsx:34]`); setExp(e => !e); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.warning, marginTop: 2 }}>
            From {assigner?.name ?? 'Partner'}
          </Text>
          {a.note ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' }} numberOfLines={isExp ? undefined : 1}>
              "{a.note}"
            </Text>
          ) : null}
          {a.status === 'PARKED' && a.pushbackDetails ? (
            <Text style={{ fontSize: TYPO.label, color: colors.danger, marginTop: 2, fontStyle: 'italic' }} numberOfLines={isExp ? undefined : 1}>
              Bounced: "{a.pushbackDetails}"
            </Text>
          ) : null}
        </View>
        {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        <Pressable onPress={() => {
          console.log(`[UserAction] screen=Hub role=parent tapped "Accept" on "${chore.title}" from ${assigner?.name ?? 'partner'} (id=${a.id}) → respondToParentQuest [features/hub/parent/backlog/DirectPendingCard.tsx:55]`);
          respondToParentQuest(a.id, { action: 'ACCEPT' });
          // System A never notifies the assigner of Accept/Decline/Complete
          // on its own (respondToParentQuest has no sendMessage call) — the
          // assigner otherwise only finds out by noticing the card changed
          // next time they happen to open the app.
          useChatStore.getState().sendMessage(a.assignedBy, a.assignedTo,
            `✅ ${assignee?.name?.split(' ')[0] ?? 'They'} accepted "${chore.title}"`);
        }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            backgroundColor: MONEY_GREEN, borderRadius: 10, paddingVertical: 8 }}>
          <Check size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Accept</Text>
        </Pressable>
        <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent tapped "Respond" on "${chore.title}" from ${assigner?.name ?? 'partner'} (id=${a.id}) → onRespond [features/hub/parent/backlog/DirectPendingCard.tsx:69]`); onRespond(a.id, chore.title, a.assignedBy, a.assignedTo); }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            borderWidth: 1.5, borderColor: colors.warning + '60',
            borderRadius: 10, paddingVertical: 8 }}>
          <MessageCircle size={14} color={colors.warning} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warning }}>Respond</Text>
        </Pressable>
      </View>
      {/* Quick "saw it, will get to it" ping — separate from Accept (which
          also flips the assignment to ACCEPTED). Lets the assignee let the
          assigner know they're on it without committing to the formal
          accept/status change yet, mirroring MyAdultQuestCard's own
          "Let X know you're on it" nudge for the already-accepted case. */}
      <Pressable onPress={() => {
        console.log(`[UserAction] screen=Hub role=parent tapped "I'm on it" on "${chore.title}" from ${assigner?.name ?? 'partner'} (id=${a.id}) → sendMessage [features/hub/parent/backlog/DirectPendingCard.tsx:97]`);
        useChatStore.getState().sendMessage(a.assignedBy, a.assignedTo,
          `👋 ${assignee?.name?.split(' ')[0] ?? 'They'} saw "${chore.title}" — on it!`);
      }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
          marginHorizontal: 12, marginBottom: 12, paddingVertical: 8, borderRadius: 10 }}>
        <Hand size={12} color={colors.textTertiary} />
        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Let {assigner?.name?.split(' ')[0] ?? 'them'} know you're on it</Text>
      </Pressable>
      {isExp && chore.description && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.warning + '30', padding: 12 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chore.description}</Text>
        </View>
      )}
    </View>
  );
}
