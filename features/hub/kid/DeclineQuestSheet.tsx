import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import { KID } from './kidTheme';
import type { FamilyMember } from '@/store/familyStore';

const PRESETS = ['Too busy today', 'Need help with it', 'Already done', 'Not sure how'];

// Declining a grandparent quest, with a note back to GP + parent — posted to
// family chat, which is where both will actually see it.
export function DeclineQuestSheet({ target, active, members, colors, isDark, onClose, declineGrandparentQuest }: {
  target: { id: string; title: string } | null;
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  onClose: () => void;
  declineGrandparentQuest: (choreId: string, by: string, reason: string) => void;
}) {
  const [note, setNote] = useState('');
  const close = () => { setNote(''); onClose(); };

  return (
    <AppBottomSheet
      visible={!!target}
      onClose={close}
      title="Not this one?"
      subtitle={target?.title}
      accentColor={colors.danger}
      minHeight="45%"
      bodyPaddingBottom={16}
    >
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: KID.sub, color: colors.textSecondary }}>
          Tell them why — it goes back to whoever set the quest, and a grown-up can reassign it.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map(preset => (
            <Pressable key={preset} onPress={() => setNote(preset)}
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
            placeholder="Add your own reason…" placeholderTextColor={colors.textTertiary}
            style={{ fontSize: KID.body, color: colors.textPrimary, minHeight: 44 }} multiline />
        </View>
        <Pressable
          disabled={!note.trim()}
          onPress={() => {
            if (!target) return;
            const finalNote = note.trim();
            declineGrandparentQuest(target.id, active.id, finalNote);
            const sponsor = useChoreStore.getState().chores.find(c => c.id === target.id)?.sponsorUserId;
            const sponsorName = members.find(m => m.id === sponsor)?.name.split(' ')[0];
            useChatStore.getState().sendMessage('all', active.id,
              `🙏 ${active.name.split(' ')[0]} can't take "${target.title}"${sponsorName ? ` from ${sponsorName}` : ''} — "${finalNote}"`);
            close();
          }}
          style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
            backgroundColor: note.trim() ? colors.danger : colors.border,
            opacity: note.trim() ? 1 : 0.5 }}>
          <Text style={{ fontSize: KID.body, fontWeight: '900', color: '#fff' }}>Send it back</Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}
