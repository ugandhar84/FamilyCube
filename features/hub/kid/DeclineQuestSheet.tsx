import { useState } from 'react';
import {
  View, Text, Pressable, TextInput, Modal,
  KeyboardAvoidingView, ScrollView, Platform, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import { KID } from './kidTheme';
import type { FamilyMember } from '@/store/familyStore';

const PRESETS = ['Too busy today', 'Need help with it', 'Already done', 'Not sure how'];

// Declining a quest assigned directly to this kid/teen. Two different
// underlying actions share this one sheet, branched by the target chore's
// own categoryType (not by a caller-passed flag, so KidView/TeenView don't
// need two separate sheets or two separate pieces of state):
//   - grandparent_quest at 'todo'  -> declineGrandparentQuest (releases back
//     to the pool, DMs the sponsor)
//   - a plain household chore ('todo'/'in_progress', not GP, not pool) ->
//     reassignQuest(id, '', by) (same "send back to pool" store call
//     QuestCard.tsx's canKidDecline uses on the Chores tab) — this used to
//     have NO button anywhere in the Hub at all: MyQuestsSection only ever
//     passed a plain household chore's todo card through KidQuestCard's
//     isGpTodo branch, which never rendered for a non-GP chore, so a kid or
//     teen with a directly-assigned chore they genuinely can't do had no
//     way to send it back except from the separate Chores tab.
export function DeclineQuestSheet({ target, active, members, colors, isDark, onClose, declineGrandparentQuest }: {
  target: { id: string; title: string } | null;
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  onClose: () => void;
  declineGrandparentQuest: (choreId: string, by: string, reason: string) => void;
}) {
  const [note, setNote] = useState('');
  const close = () => { setNote(''); onClose(); };
  const dismiss = () => { Keyboard.dismiss(); close(); };

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Pressable style={{ flex: 1 }} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Not this one?</Text>
                {target?.title ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: colors.danger }}>{target.title}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "close" on "DeclineQuestSheet" (id=${target?.id}) [features/hub/kid/DeclineQuestSheet.tsx:57]`); dismiss(); }}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}>
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: KID.sub, color: colors.textSecondary }}>
                  Tell them why — it goes back to whoever set the quest, and a grown-up can reassign it.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {PRESETS.map(preset => (
                    <Pressable key={preset} onPress={() => { console.log(`[UserAction] FORM screen=Hub role=kid member=${active.name} selected "${preset}" for "decline reason preset" on "${target?.title}" (id=${target?.id}) [features/hub/kid/DeclineQuestSheet.tsx:75]`); setNote(preset); }}
                      style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
                        backgroundColor: note === preset ? colors.danger : (isDark ? colors.surface : '#FEF2F2'),
                        borderWidth: 1.5, borderColor: note === preset ? colors.danger : `${colors.danger}30` }}>
                      <Text style={{ fontSize: KID.tiny, fontWeight: '700', color: note === preset ? '#fff' : colors.danger }}>{preset}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0',
                  backgroundColor: isDark ? colors.surface : '#FAFAFA', paddingHorizontal: 12, paddingVertical: 10 }}>
                  <TextInput value={note} onChangeText={setNote}
                    onBlur={() => { console.log(`[UserAction] FORM screen=Hub role=kid member=${active.name} field="decline reason" on "${target?.title}" (id=${target?.id}) newValue=${note} [features/hub/kid/DeclineQuestSheet.tsx:88]`); }}
                    placeholder="Add your own reason…" placeholderTextColor={colors.textTertiary}
                    style={{ fontSize: KID.body, color: colors.textPrimary, minHeight: 44 }} multiline />
                </View>
                <Pressable
                  disabled={!note.trim()}
                  onPress={() => {
                    if (!target) return;
                    const finalNote = note.trim();
                    console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "Send it back" on "${target.title}" (id=${target.id}) reason="${finalNote}" [features/hub/kid/DeclineQuestSheet.tsx:91]`);
                    const chore = useChoreStore.getState().chores.find(c => c.id === target.id);
                    if (chore?.categoryType === 'grandparent_quest') {
                      // declineGrandparentQuest now sends the sponsor DM
                      // itself (centralized in choreStore.ts so no caller
                      // can forget it) — only need the family-wide fallback
                      // here for the no-sponsor case, which the store
                      // action doesn't cover.
                      declineGrandparentQuest(target.id, active.id, finalNote);
                      if (!chore.sponsorUserId) {
                        useChatStore.getState().sendMessage('all', active.id,
                          `🙏 ${active.name.split(' ')[0]} can't take "${target.title}" — "${finalNote}"`);
                      }
                    } else if (chore?.teamGroupId && chore?.targetChildIds?.length) {
                      // Team-clone chore (createParticipants fanned this out
                      // to a shortlist of kids, each their own row sharing
                      // teamGroupId) — releasing to the FAMILY-WIDE pool
                      // would expose it to kids who were never targeted,
                      // losing the shortlist framing. Decline this one clone
                      // only (mirrors declineGrandparentQuest's own
                      // targetChildIds branch); the other targets' clones
                      // are separate rows, untouched either way.
                      useChoreStore.getState().updateChore(target.id, {
                        status: 'declined', assignedToId: undefined,
                      });
                      useChatStore.getState().sendMessage('all', active.id,
                        `🙏 ${active.name.split(' ')[0]} can't take "${target.title}" — "${finalNote}"`);
                    } else {
                      // Plain (non-team) household chore — send back to the
                      // pool, same store call the Chores tab's "Can't do
                      // this" uses. No parentAssignments/System-A row exists
                      // for a System-B chore, so this is a direct unassign,
                      // not a negotiation — matches the "flat decline, no
                      // back-and-forth" design already documented for kids.
                      // rejectionReason/declinedAt (spec 1.10) record WHO
                      // declined and WHY so the creator sees it re-enter the
                      // pool as "declined by X" instead of looking like a
                      // brand new unclaimed task — PoolQuestCard reads these.
                      useChoreStore.getState().updateChore(target.id, {
                        assignedToId: undefined, isPool: true, status: 'todo',
                        rejectionReason: `Declined by ${active.name.split(' ')[0]}: "${finalNote}"`,
                        declinedAt: new Date().toISOString(),
                      });
                      useChatStore.getState().sendMessage('all', active.id,
                        `🙏 ${active.name.split(' ')[0]} can't take "${target.title}" — "${finalNote}"`);
                    }
                    close();
                  }}
                  style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                    backgroundColor: note.trim() ? colors.danger : colors.border,
                    opacity: note.trim() ? 1 : 0.5 }}>
                  <Text style={{ fontSize: KID.body, fontWeight: '900', color: '#fff' }}>Send it back</Text>
                </Pressable>
              </View>
            </ScrollView>

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
