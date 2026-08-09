import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, TYPO} from '@/constants/theme';

interface EventChatInputProps {
  isEventOver: boolean;
  isParticipant: boolean;
  draft: string;
  sending: boolean;
  profanityWarning: boolean;
  ac: string;
  colors: any;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onDismissProfanityWarning: () => void;
}

function EventChatInputBase({
  isEventOver, isParticipant, draft, sending, profanityWarning,
  ac, colors, onChangeText, onSend, onDismissProfanityWarning,
}: EventChatInputProps) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {isEventOver ? (
        <View style={[s.lockedBar, { backgroundColor: colors.inputBg, borderTopColor: colors.border }]}>
          <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
          <Text style={[s.lockedText, { color: colors.textSecondary }]}>
            This event has ended · chat is read-only
          </Text>
        </View>
      ) : !isParticipant ? (
        <View style={[s.lockedBar, { backgroundColor: colors.inputBg, borderTopColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textTertiary} />
          <Text style={[s.lockedText, { color: colors.textSecondary }]}>
            RSVP to join the conversation
          </Text>
        </View>
      ) : (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          {profanityWarning && (
            <View style={[s.profanityBar, { backgroundColor: '#FFF3CD' }]}>
              <Ionicons name="warning-outline" size={14} color="#856404" />
              <Text style={[s.profanityText, { color: '#856404' }]}>
                Offensive language removed. Please keep it respectful 🐾
              </Text>
              <TouchableOpacity onPress={onDismissProfanityWarning} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={14} color="#856404" />
              </TouchableOpacity>
            </View>
          )}
          <View style={[s.inputRow, { backgroundColor: colors.background }]}>
            <TextInput
              style={[s.input, {
                backgroundColor: colors.inputBg,
                borderColor: profanityWarning ? '#F59E0B' : colors.border,
                color: colors.textPrimary,
              }]}
              placeholder="Message everyone…"
              placeholderTextColor={colors.placeholder}
              value={draft}
              onChangeText={t => { onChangeText(t); if (profanityWarning) onDismissProfanityWarning(); }}
              multiline
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={onSend}
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: draft.trim() ? ac : colors.inputBg }]}
              onPress={onSend}
              disabled={!draft.trim() || sending}>
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={17} color={draft.trim() ? '#fff' : colors.textTertiary} />
              }
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

export const EventChatInput = React.memo(EventChatInputBase);

const s = StyleSheet.create({
  lockedBar:    { flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  lockedText:   { fontSize: TYPO.body },
  profanityBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  profanityText:{ flex: 1, fontSize: TYPO.body, fontWeight: '600' },
  inputRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  input:        { flex: 1, borderRadius: RADIUS.lg, borderWidth: 1,
                  paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
                  fontSize: TYPO.body, maxHeight: 120 },
  sendBtn:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
