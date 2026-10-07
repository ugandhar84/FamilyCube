import { useState } from 'react';
import {
  View, Text, Pressable, TextInput,
  Modal, KeyboardAvoidingView, ScrollView, Platform, Keyboard, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Clock, Construction, Repeat, MessageCircle, X, XCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { useFamilyStore } from '@/store/familyStore';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

export function PushbackSheet({ target, onClose, respondToParentQuest }: {
  target: { assignmentId: string; choreTitle: string; assignedBy?: string; assignedTo?: string } | null;
  onClose: () => void;
  respondToParentQuest: (assignmentId: string, response: { action: 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS' | 'DECLINE'; details?: string }) => void;
}) {
  const { colors, isDark } = useTheme();
  const [detail, setDetail] = useState('');

  const handle = (action: 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS' | 'DECLINE') => {
    if (!target) return;
    respondToParentQuest(target.assignmentId, { action, details: detail.trim() || undefined });
    if (action === 'DECLINE' && target.assignedBy && target.assignedTo) {
      const assignee = useFamilyStore.getState().members.find(m => m.id === target.assignedTo);
      useChatStore.getState().sendMessage(target.assignedBy, target.assignedTo,
        `🙅 ${assignee?.name?.split(' ')[0] ?? 'They'} can't take "${target.choreTitle}"${detail.trim() ? ` — "${detail.trim()}"` : ''}`);
    }
    setDetail('');
    onClose();
  };

  const dismiss = () => { Keyboard.dismiss(); setDetail(''); onClose(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(75, 90);
  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  const ACTIONS = [
    { action: 'SNOOZE',  label: 'Snooze 48h',   Icon: Clock,         tint: colors.pink    },
    { action: 'BLOCKER', label: 'Blocker',        Icon: Construction,  tint: colors.danger  },
    { action: 'TRADE',   label: 'Trade tasks',    Icon: Repeat,        tint: colors.amber   },
    { action: 'DISCUSS', label: 'Discuss later',  Icon: MessageCircle, tint: colors.teal    },
    { action: 'DECLINE', label: "Can't do it",    Icon: XCircle,       tint: colors.textTertiary },
  ] as const;

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.50)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{
            borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '75%', backgroundColor: colors.card,
          }}>
            {/* Drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 22, paddingBottom: 14,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>RESPOND TO TASK</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: colors.textPrimary }}>
                  {target?.choreTitle ?? ''}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.amber, marginTop: 2 }}>
                  2 bounces locks this for an offline chat
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: colors.surface, marginLeft: 12 }}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 22, paddingBottom: 40, gap: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Details input */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.9, color: colors.textTertiary }}>DETAILS (OPTIONAL)</Text>
                <TextInput
                  style={{
                    borderRadius: 14, borderWidth: 1, borderColor,
                    backgroundColor: colors.surface,
                    padding: 14, fontSize: TYPO.caption, color: colors.textPrimary,
                    minHeight: 60,
                  }}
                  placeholder="Add context…"
                  placeholderTextColor={colors.textTertiary}
                  value={detail}
                  onChangeText={setDetail}
                  multiline
                />
              </View>

              {/* Action tiles */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {ACTIONS.map(({ action, label, Icon, tint }) => (
                  <Pressable
                    key={action}
                    onPress={() => handle(action)}
                    style={({ pressed }) => ({
                      flex: 1, minWidth: '45%',
                      borderRadius: 18, paddingVertical: 16,
                      alignItems: 'center', gap: 6,
                      borderWidth: 1, borderColor: `${tint}40`,
                      backgroundColor: `${tint}14`,
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Icon size={18} color={tint} />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: tint }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

