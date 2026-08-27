import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { AlertCircle, ChevronUp, ChevronDown, Send, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { ChoreTask, ParentQuestAssignment } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import { showToast } from '@/components/AppToast';

// A task that bounced (Blocker/Trade/Discuss) and is now locked — previously
// a permanent dead end with no button at all once both parents had "the
// offline conversation" this label points to. Either side can reopen it:
// hand it to someone else, or cancel it back to the open pool.
export function LockedAssignmentCard({ a, chore, active, members, colors, isDark, onDelegate, cancelLockedAssignment }: {
  a: ParentQuestAssignment; chore: ChoreTask; active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onDelegate: (choreId: string, title: string) => void;
  cancelLockedAssignment: (assignmentId: string, byMemberId: string) => void;
}) {
  const [isExp, setExp] = useState(false);
  const other = members.find(m => m.id === (a.assignedBy === active.id ? a.assignedTo : a.assignedBy));

  const cancel = () => {
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Reopen" on "${chore.title}" (id=${a.id}) [features/hub/parent/backlog/LockedAssignmentCard.tsx:22]`);
    Alert.alert(
    'Reopen this task?',
    `"${chore.title}" will go back to the open pool for anyone to take.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reopen', onPress: () => {
        console.log(`[UserAction] screen=Hub role=parent member=${active.name} confirmed "Reopen" on "${chore.title}" (id=${a.id}) → cancelLockedAssignment [features/hub/parent/backlog/LockedAssignmentCard.tsx:27]`);
        cancelLockedAssignment(a.id, active.id);
        showToast('Reopened ✓');
        // Neither cancelLockedAssignment nor DelegateSheet's reassign path
        // notify the OTHER party in this negotiation — a task Marcus was
        // mid-discussion on would just silently vanish from his card with
        // no explanation the next time he opened the app.
        if (other) {
          useChatStore.getState().sendMessage(other.id, active.id,
            `↩️ ${active.name.split(' ')[0]} reopened "${chore.title}" back to the pool.`);
        }
      } },
    ]
  );
  };

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1.5, borderColor: `${colors.danger}40`,
      backgroundColor: isDark ? `${colors.danger}10` : colors.dangerLight, overflow: 'hidden',
    }}>
      <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "${isExp ? 'Collapse' : 'Expand'}" on "${chore.title}" (id=${a.id}) [features/hub/parent/backlog/LockedAssignmentCard.tsx:46]`); setExp(e => !e); }} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, paddingBottom: 8 }}>
        <AlertCircle size={16} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{chore.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.danger, marginTop: 2 }}>
            Discuss offline with {other?.name?.split(' ')[0] ?? 'partner'} — bounced
          </Text>
        </View>
        {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
      </Pressable>
      {isExp && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
          {a.pushbackDetails ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{a.pushbackDetails}"</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Reassign" on "${chore.title}" (id=${a.id}) → onDelegate [features/hub/parent/backlog/LockedAssignmentCard.tsx:62]`); onDelegate(chore.id, chore.title); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                backgroundColor: colors.parent, borderRadius: 10, paddingVertical: 8 }}>
              <Send size={13} color="#fff" />
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Reassign</Text>
            </Pressable>
            <Pressable onPress={cancel} /* logging inside cancel() */
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                borderWidth: 1.5, borderColor: colors.danger + '60', borderRadius: 10, paddingVertical: 8 }}>
              <X size={13} color={colors.danger} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>Reopen</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
