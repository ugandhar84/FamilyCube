import { View, Text, TextInput, Pressable } from 'react-native';
import { Mic } from 'lucide-react-native';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';

// One free-text input with a mic button, shared by every kid-facing
// single-field form (AskModal, QuestProposalModal, KidChoreProposalModal)
// that had no voice input at all — matches the same live-transcript/red-
// stop-indicator pattern the Ride form (KidRequestModal's useVoiceIntake
// header mic) and the Parent's SmartTaskComposer already use, just wired
// to the simpler "mic → plain text" useVoiceDictation hook instead of
// useVoiceIntake's AI task-extraction, since these fields don't need
// date/category/member parsing — just the words the kid said.
export function VoiceTextField({
  value, onChangeText, placeholder, colors, isDark, accent, multiline = true, minHeight = 100,
}: {
  value: string; onChangeText: (t: string) => void; placeholder: string;
  colors: any; isDark: boolean; accent: string; multiline?: boolean; minHeight?: number;
}) {
  const dictation = useVoiceDictation();

  return (
    <View style={{ gap: 6 }}>
      <View style={{ position: 'relative' }}>
        <TextInput
          value={dictation.state === 'listening' ? dictation.liveTranscript : value}
          onChangeText={onChangeText}
          editable={dictation.state !== 'listening'}
          style={{
            borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, paddingRight: 48,
            fontSize: 15, color: colors.textPrimary,
            backgroundColor: isDark ? colors.surface : '#F9FAFB',
            borderColor: dictation.state === 'listening' ? colors.danger : (value.trim() ? accent + '80' : colors.border),
            minHeight, textAlignVertical: multiline ? 'top' : 'center',
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline={multiline}
        />
        <Pressable
          onPress={async () => {
            if (dictation.state === 'listening') {
              const finalTranscript = await dictation.stop();
              if (finalTranscript) onChangeText(finalTranscript);
            } else {
              dictation.start();
            }
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ position: 'absolute', right: 10, top: 10, width: 28, height: 28, borderRadius: 14,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: dictation.state === 'listening' ? colors.danger : accent + '18' }}>
          {dictation.state === 'listening'
            ? <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#fff' }} />
            : <Mic size={14} color={accent} />}
        </Pressable>
      </View>
      {dictation.state === 'listening' && (
        <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '700' }}>
          Listening… tap ■ to stop and edit
        </Text>
      )}
      {dictation.error && (
        <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '600' }}>{dictation.error}</Text>
      )}
    </View>
  );
}
