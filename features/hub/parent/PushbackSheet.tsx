import { useState } from 'react';
import {
  View, Text, Pressable, TextInput,
  Modal, KeyboardAvoidingView, ScrollView, Platform, Keyboard, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Clock, Construction, Repeat, MessageCircle, X, XCircle } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { useFamilyStore } from '@/store/familyStore';

// Violet — "Snooze" action accent, deliberately distinct from BRAND.purple
// (#9261C7) so each of these four response actions reads as its own color;
// kept as one local constant instead of a repeated bare hex.
const SNOOZE_VIOLET = '#8B5CF6';

export function PushbackSheet({ target, colors, isDark, onClose, respondToParentQuest }: {
  target: { assignmentId: string; choreTitle: string; assignedBy?: string; assignedTo?: string } | null;
  colors: any; isDark: boolean;
  onClose: () => void;
  respondToParentQuest: (assignmentId: string, response: { action: 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS' | 'DECLINE'; details?: string }) => void;
}) {
  const [detail, setDetail] = useState('');

  const handle = (action: 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS' | 'DECLINE') => {
    if (!target) return;
    console.log(`[UserAction] screen=Hub role=parent tapped "${action}" on "${target.choreTitle}" (id=${target.assignmentId}) → respondToParentQuest [features/hub/parent/PushbackSheet.tsx:26]`);
    respondToParentQuest(target.assignmentId, { action, details: detail.trim() || undefined });
    // System A never notifies the assigner of a Decline on its own
    // (respondToParentQuest has no sendMessage call) — without this the
    // assigner only learns their delegation was refused by noticing the
    // card gone next time they happen to open the app.
    if (action === 'DECLINE' && target.assignedBy && target.assignedTo) {
      const assignee = useFamilyStore.getState().members.find(m => m.id === target.assignedTo);
      useChatStore.getState().sendMessage(target.assignedBy, target.assignedTo,
        `🙅 ${assignee?.name?.split(' ')[0] ?? 'They'} can't take "${target.choreTitle}"${detail.trim() ? ` — "${detail.trim()}"` : ''}`);
    }
    setDetail('');
    onClose();
  };

  const dismiss = () => {
    console.log(`[UserAction] screen=Hub role=parent tapped "Dismiss" on PushbackSheet for "${target?.choreTitle ?? ''}" (id=${target?.assignmentId ?? 'n/a'}) [features/hub/parent/PushbackSheet.tsx:40]`);
    Keyboard.dismiss(); setDetail(''); onClose();
  };

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12,
            maxHeight: '90%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>
                  {`Respond: ${target?.choreTitle ?? ''}`}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: colors.warning }}>
                  2 bounces locks this task for an offline chat
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>
      <View style={{ gap: 16 }}>
        <TextInput
          style={{
            borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
            backgroundColor: isDark ? colors.surface : '#F8FAFC',
            padding: 12, fontSize: TYPO.caption, color: colors.textPrimary,
            minHeight: 60,
          }}
          placeholder="Add details (optional)…"
          placeholderTextColor={colors.textTertiary}
          value={detail}
          onChangeText={setDetail}
          onBlur={() => { console.log(`[UserAction] FORM screen=Hub role=parent field="detail" on PushbackSheet for "${target?.choreTitle ?? ''}" (id=${target?.assignmentId ?? 'n/a'}) newValue=${detail} [features/hub/parent/PushbackSheet.tsx:87]`); }}
          multiline
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {([
            { action: 'SNOOZE',  label: 'Snooze 48h',   Icon: Clock,        color: SNOOZE_VIOLET },
            { action: 'BLOCKER', label: 'Blocker',       Icon: Construction, color: colors.danger },
            { action: 'TRADE',   label: 'Trade tasks',   Icon: Repeat,       color: colors.warning },
            { action: 'DISCUSS', label: 'Discuss later', Icon: MessageCircle, color: colors.parent },
            { action: 'DECLINE', label: "Can't do it",   Icon: XCircle,      color: colors.textTertiary },
          ] as const).map(({ action, label, Icon, color }) => (
            <Pressable key={action} onPress={() => { console.log(`[UserAction] FORM screen=Hub role=parent selected "${label}" for "Pushback Action" on "${target?.choreTitle ?? ''}" (id=${target?.assignmentId ?? 'n/a'}) [features/hub/parent/PushbackSheet.tsx:97]`); handle(action); }}
              style={{
                flex: 1, minWidth: '45%', borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', gap: 5, borderWidth: 1.5,
                borderColor: color + '50', backgroundColor: color + '12',
              }}>
              <Icon size={16} color={color} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
