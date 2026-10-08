import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Check, HeartHandshake } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import type { FamilyMember } from '@/store/familyStore';
import type { ChoreTask } from '@/store/choreStore';

// GP Welcome toggle accent — deliberately distinct from brand pink/lavender
// so the grandparent-facing toggle reads as its own state color.
const GP_VIOLET = '#8B5CF6';

export function DelegateSheet({ target, questPool, members, active, onClose, updateQuest, addParentQuest }: {
  target: { choreId: string; choreTitle: string } | null;
  questPool: (ChoreTask & { _isQuestRow?: boolean })[];
  members: FamilyMember[]; active: FamilyMember;
  onClose: () => void;
  updateQuest: (id: string, patch: Record<string, any>) => void;
  addParentQuest: (choreId: string, assignedBy: string, assignedTo: string, mode: 'DIRECT', note?: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const liveChore = useChoreStore(s => s.chores.find(c => c.id === target?.choreId));
  const isGPOpen = !!liveChore?.inviteGrandparents;
  const [note, setNote] = useState('');
  const hasGrandparents = members.some(m => m.role === 'senior');
  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';
  // Delegating to a parent/senior strips the coin reward (adults don't earn
  // coins) — that's a real, silent data loss on a single tap if committed
  // immediately, so a coin-bearing chore stops here and asks for an
  // explicit confirm instead of stripping+delegating on the first tap.
  const [pendingTarget, setPendingTarget] = useState<FamilyMember | null>(null);
  const hadCoins = (liveChore?.coinsReward ?? 0) > 0;

  function commitDelegate(m: FamilyMember) {
    if (!target) return;
    const priorAssignment = useChoreStore.getState().getLiveAssignmentForChore(target.choreId);
    const priorAssigneeId = priorAssignment
      ? (priorAssignment.assignedTo === active.id ? priorAssignment.assignedBy : priorAssignment.assignedTo)
      : undefined;
    const isQRow = questPool.find(c => c.id === target.choreId && (c as any)._isQuestRow);
    // Delegate targets are already restricted to parent/senior (see the
    // .filter() below) — this whole sheet only ever hands a chore to an
    // adult, yet previously never touched coinsReward at all: a chore
    // delegated here with coins still set kept paying them out on
    // approval, a real path for a parent/senior to earn coins. Same
    // coinsDisabled rule Add/EditQuestModal and QuestDetailModal's own
    // reassign flow already enforce — zeroed unconditionally, no toggle,
    // since there's no legitimate "keep the coins" option for an adult.
    if (isQRow) {
      supabase.rpc('reassign_chore', {
        p_chore_id: target.choreId, p_new_member_id: m.id, p_by_member_id: active.id,
      }).then(({ error }) => {
        if (error) { console.warn('[DelegateSheet] reassign_chore failed', error.message); return; }
        if (hadCoins) {
          useChoreStore.getState().updateChore(target.choreId, { coinsReward: 0, basePoints: 0, bonusCoins: 0 });
        }
        showToast(hadCoins
          ? `Delegated to ${m.name.split(' ')[0]} ✓ — coin reward removed (adults don't earn coins)`
          : `Delegated to ${m.name.split(' ')[0]} ✓`);
        supabase.functions.invoke('quest-event-notifier', {
          body: {
            event: 'quest_reassigned', questId: target.choreId, questTitle: target.choreTitle,
            familyId: liveChore?.familyId, triggeredById: active.id,
            assigneeId: priorAssigneeId, newAssigneeId: m.id, coins: hadCoins ? 0 : liveChore?.coinsReward,
          },
        }).catch((e: any) => console.warn('[DelegateSheet] reassign notify failed', e?.message));
      });
    } else {
      addParentQuest(target.choreId, active.id, m.id, 'DIRECT', note.trim() || undefined);
      if (hadCoins) {
        useChoreStore.getState().updateChore(target.choreId, { coinsReward: 0, basePoints: 0, bonusCoins: 0 });
      }
      showToast(hadCoins
        ? `Delegated to ${m.name.split(' ')[0]} ✓ — coin reward removed (adults don't earn coins)`
        : `Delegated to ${m.name.split(' ')[0]} ✓`);
    }
    if (priorAssigneeId && priorAssigneeId !== m.id && priorAssigneeId !== active.id) {
      useChatStore.getState().sendMessage(priorAssigneeId, active.id,
        `↪️ ${active.name.split(' ')[0]} reassigned "${target.choreTitle}" to ${m.name.split(' ')[0]}.`);
    }
    setNote('');
    setPendingTarget(null);
    onClose();
  }

  function handlePick(m: FamilyMember) {
    if (hadCoins) { setPendingTarget(m); return; }
    commitDelegate(m);
  }

  return (
    <AppBottomSheet
      visible={!!target}
      onClose={() => { setNote(''); onClose(); }}
      title={`Delegate: ${target?.choreTitle ?? ''}`}
      subtitle="Assign to a parent or grandparent"
      accentColor={colors.teal}
      minHeight="40%"
      maxHeight="70%"
    >
      <View style={{ gap: 12 }}>
        {/* Note field */}
        <View style={{ gap: 6 }}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>NOTE (OPTIONAL)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Why you're passing this along…"
            placeholderTextColor={colors.textTertiary}
            multiline
            style={{
              fontSize: TYPO.label, color: colors.textPrimary, minHeight: 44,
              borderRadius: 14, borderWidth: 1, borderColor,
              backgroundColor: colors.surface,
              paddingHorizontal: 14, paddingVertical: 12,
            }}
          />
        </View>

        {/* Member chips */}
        <View style={{ gap: 6 }}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>ASSIGN TO</Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {members
              .filter(m =>
                // Excludes the viewer and whoever this chore is already
                // assigned to — delegating to the current assignee is a
                // no-op, not a real reassign target.
                m.id !== active.id &&
                m.id !== liveChore?.assignedToId &&
                (m.role === 'parent' || (m.role === 'senior' && isGPOpen)))
              .map(m => (
                <Pressable
                  key={m.id}
                  onPress={() => handlePick(m)}
                  style={({ pressed }) => ({
                    alignItems: 'center', gap: 6,
                    paddingVertical: 14, paddingHorizontal: 18,
                    borderRadius: 18, borderWidth: pendingTarget?.id === m.id ? 2 : 1,
                    borderColor: pendingTarget?.id === m.id ? colors.danger : borderColor,
                    backgroundColor: isDark ? colors.surface : colors.card,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text style={{ fontSize: 40 }}>{m.emoji || '👤'}</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{m.name.split(' ')[0]}</Text>
                </Pressable>
              ))
            }
          </View>

          {/* Coin-strip confirm — delegating to a parent/senior removes the
              coin reward (adults don't earn coins); a single tap committing
              that destructively with no undo was the gap, so this now stops
              and asks before actually stripping + delegating. */}
          {pendingTarget && (
            <View style={{ gap: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.danger + '40',
              backgroundColor: colors.danger + '0E', padding: 14 }}>
              <Text style={{ fontSize: 13, color: colors.danger, fontWeight: '600', lineHeight: 18 }}>
                ⚠ {pendingTarget.name.split(' ')[0]} is a {pendingTarget.role} — delegating will remove the {liveChore?.coinsReward} coin reward. Parents/seniors don't earn coins.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setPendingTarget(null)}
                  style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor,
                    alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => commitDelegate(pendingTarget)}
                  style={{ flex: 2, height: 40, borderRadius: 10, backgroundColor: colors.danger,
                    alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Remove coins & delegate</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* GP Welcome toggle */}
        {hasGrandparents && (
          <Pressable
            onPress={() => {
              if (!target) return;
              useChoreStore.getState().updateChore(target.choreId, { inviteGrandparents: !isGPOpen } as any);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
              marginTop: 4,
              borderRadius: 18, borderWidth: 1,
              borderColor: isGPOpen ? GP_VIOLET : borderColor,
              backgroundColor: isGPOpen ? `${GP_VIOLET}18` : colors.surface,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              borderWidth: 2,
              borderColor: isGPOpen ? GP_VIOLET : (isDark ? colors.border : 'rgba(223,97,60,0.20)'),
              backgroundColor: isGPOpen ? GP_VIOLET : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {isGPOpen
                ? <Check size={20} color="#fff" />
                : <HeartHandshake size={20} color={isDark ? colors.textTertiary : 'rgba(223,97,60,0.40)'} />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>GP Welcome</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Grandparents can see and claim this task</Text>
            </View>
          </Pressable>
        )}
      </View>
    </AppBottomSheet>
  );
}

const s = StyleSheet.create({
  overline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
});
