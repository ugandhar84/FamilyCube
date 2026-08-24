/**
 * VoicePrefillBox — the "🎙️ Or just say it — Cube will fill this in"
 * capture box that opens the What step of both create forms.
 *
 * This was the single most literally-duplicated block between
 * AddEventModal and AddQuestModal: same collapsed prompt row, same expanded
 * card with a record/stop button, live transcript, editable review text,
 * and Discard/Send pair — differing only in accent color and which
 * setter the resulting transcript feeds. Same interaction contract as Ask
 * Cube's mic in both: tap to record, the transcript lands in an editable
 * box when you stop, and only an explicit "Send" tap fires the AI call —
 * never automatic on speech-end. Speech-to-text is on-device; only the
 * transcript TEXT the user approved is ever sent, never audio.
 *
 * Owns no state — `voice` (useVoiceDictation), the draft, and the
 * in-flight flag all stay in the caller so its own reset() keeps working.
 */
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

export function VoicePrefillBox({
  voice, voiceDraft, setVoiceDraft,
  isPrefilling, onSend,
  accentColor, colors, isDark,
}: {
  // useVoiceDictation()'s return value — kept structurally typed so this
  // component doesn't need to import the hook's internals.
  voice: {
    state: string;
    liveTranscript: string;
    error?: string | null;
    start: () => void;
    stop: () => void;
    reset: () => void;
  };
  voiceDraft: string;
  setVoiceDraft: React.Dispatch<React.SetStateAction<string>>;
  isPrefilling: boolean;
  onSend: (transcript: string) => void;
  accentColor: string;
  colors: any; isDark: boolean;
}) {
  const listening = voice.state === 'listening';

  return (
    <>
      {!listening && !voiceDraft && (
        <TouchableOpacity
          onPress={() => voice.start()}
          disabled={isPrefilling}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -6, marginBottom: 12,
            borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 13, paddingVertical: 11,
            borderColor: accentColor + '45',
            backgroundColor: isDark ? accentColor + '1c' : '#F8F5FF',
          }}
        >
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accentColor + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mic" size={13} color={accentColor} />
          </View>
          <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: accentColor }} numberOfLines={1}>
            🎙️ Or just say it — Cube will fill this in
          </Text>
        </TouchableOpacity>
      )}

      {(listening || voiceDraft) && (
        <View style={{
          marginTop: -6, marginBottom: 12, borderRadius: 14, borderWidth: 1.5,
          borderColor: listening ? colors.danger + '60' : accentColor + '45',
          backgroundColor: listening ? colors.danger + '14' : (isDark ? accentColor + '1c' : '#F8F5FF'),
          padding: 12, gap: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                if (listening) {
                  const transcript = voice.liveTranscript;
                  voice.stop();
                  if (transcript.trim()) setVoiceDraft(transcript);
                  return;
                }
                voice.start();
              }}
              style={{
                width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                backgroundColor: listening ? colors.danger + '30' : accentColor + '22',
              }}
            >
              {listening
                ? <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.danger }} />
                : <Ionicons name="mic" size={13} color={accentColor} />}
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: TYPO.micro, fontWeight: '700', color: listening ? colors.danger : colors.textTertiary }}>
              {listening ? 'Listening… tap to stop' : 'Review and edit, then send'}
            </Text>
          </View>

          <TextInput
            value={listening ? (voice.liveTranscript || '') : voiceDraft}
            onChangeText={setVoiceDraft}
            editable={!listening && !isPrefilling}
            placeholder="Listening…"
            placeholderTextColor={colors.textTertiary}
            multiline
            style={{ fontSize: TYPO.body, color: colors.textPrimary, minHeight: 44, textAlignVertical: 'top' }}
          />

          {!listening && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => { setVoiceDraft(''); voice.reset(); }}
                disabled={isPrefilling}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onSend(voiceDraft)}
                disabled={isPrefilling || !voiceDraft.trim()}
                style={{
                  flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 9, borderRadius: 10,
                  backgroundColor: !voiceDraft.trim() || isPrefilling ? colors.border : accentColor,
                }}
              >
                {isPrefilling
                  ? <ActivityIndicator size="small" color={colors.textInverse} />
                  : <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: !voiceDraft.trim() ? colors.textTertiary : colors.textInverse }}>Send</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {voice.state === 'error' && !!voice.error && (
        <Text style={{ fontSize: TYPO.micro, color: colors.danger, marginTop: -8, marginBottom: 12 }}>
          {voice.error}
        </Text>
      )}
    </>
  );
}
