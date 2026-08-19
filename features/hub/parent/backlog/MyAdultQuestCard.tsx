import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronUp, ChevronDown, Check, Send } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import type { Quest } from '@/store/questStore';
import type { ParentQuestAssignment } from '@/store/choreStore';

// A parent-only quest assigned to the current parent — mark it done (closing
// the linked assignment too, if one exists, or a second "Done" card would
// resurface after this one disappears) or hand it off to a co-parent.
export function MyAdultQuestCard({ q, parentAssignments, active, colors, isDark, completeParentQuest, updateQuest, onDelegate }: {
  q: Quest; parentAssignments: ParentQuestAssignment[]; active: { id: string };
  colors: any; isDark: boolean;
  completeParentQuest: (assignmentId: string, completedBy: string) => void;
  updateQuest: (id: string, patch: Partial<Quest>) => void;
  onDelegate: (choreId: string, title: string) => void;
}) {
  const [isExp, setExp] = useState(false);

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF', overflow: 'hidden',
      borderLeftWidth: 3, borderLeftColor: colors.primary,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => setExp(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
          {q.dueDate && !isExp ? (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>Due {q.dueDate}</Text>
          ) : null}
        </View>
        {isExp ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        <Pressable onPress={() => {
          const a = parentAssignments.find(x => x.choreId === q.id && x.status !== 'COMPLETED' && x.status !== 'DECLINED');
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
      {isExp && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.primary + '30', padding: 12, gap: 6 }}>
          {q.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{q.description}</Text> : null}
          {q.dueDate ? <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Due {q.dueDate}</Text> : null}
        </View>
      )}
    </View>
  );
}
