/**
 * AddIntakeChooser — "How would you like to enter the details?" step that
 * opens BEFORE either the manual form or voice capture, matching the
 * existing pet-appointment voice flow (features/health/screens/HealthScreen.tsx's
 * apptInputSheet) instead of burying a mic icon inside the manual form.
 *
 * Speak it  -> records, calls family-ai's extract_responsibility, shows
 *              VoiceIntakeReviewSheet to confirm/edit before creating.
 * Type it   -> closes this chooser and hands off to the caller's own manual
 *              form (AddEventModal / AddQuestModal) via onTypeManually.
 */
import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Mic, PenLine, AlertTriangle } from 'lucide-react-native';
import AppBottomSheet from './AppBottomSheet';
import VoiceIntakeReviewSheet from './VoiceIntakeReviewSheet';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { useVoiceIntake } from '@/lib/hooks/useVoiceIntake';
import type { ExtractResponsibilityResult } from '@/lib/familyAiService';
import type { FamilyMember } from '@/store/familyStore';

export default function AddIntakeChooser({
  visible, kind, members, activeMemberId, onClose, onTypeManually, onCreated,
}: {
  visible: boolean;
  kind: 'event' | 'quest';
  members: FamilyMember[];
  activeMemberId: string;
  onClose: () => void;
  // Called both for the plain "Type it" tile (no prefill) and for
  // VoiceIntakeReviewSheet's "Adjust in full form" handoff (with prefill) —
  // the caller opens the real AddEventModal/AddQuestModal either way.
  onTypeManually: (prefill?: {
    title: string; category?: string; memberId?: string; startAt?: string;
    notes?: string; coins?: number; photoRequired?: boolean;
  }) => void;
  onCreated?: (kind: 'event' | 'quest') => void;
}) {
  const { colors, isDark } = useTheme();
  const [voiceReview, setVoiceReview] = useState<ExtractResponsibilityResult | null>(null);
  const voice = useVoiceIntake((result) => setVoiceReview(result));

  const memberList = members.map(m => ({ id: m.id, name: m.name }));
  const label = kind === 'event' ? 'Event' : 'Quest';
  const examplePrompt = kind === 'event'
    ? '"Pick up Maya from soccer at 5" or "Dentist appointment Thursday 2pm"'
    : '"Clean the garage this weekend" or "Take out the trash tonight"';

  const closeAll = () => {
    voice.cancel();
    setVoiceReview(null);
    onClose();
  };

  // If voice review is already showing, let it own the screen — the
  // chooser itself stays mounted underneath so state doesn't reset.
  if (voiceReview?.task) {
    return (
      <VoiceIntakeReviewSheet
        visible
        result={voiceReview}
        members={members}
        activeMemberId={activeMemberId}
        onClose={() => setVoiceReview(null)}
        onCreated={(k) => { setVoiceReview(null); voice.reset(); onCreated?.(k); onClose(); }}
        onEditInFullForm={(_k, prefill) => { setVoiceReview(null); voice.reset(); onTypeManually(prefill); }}
      />
    );
  }

  const showTileGrid = voice.state === 'idle' || voice.state === 'error';

  return (
    <AppBottomSheet visible={visible} onClose={closeAll} title={`Add ${label}`} subtitle="How would you like to enter the details?"
      minHeight="28%" maxHeight="45%">
      <View style={{ gap: 10 }}>
        {showTileGrid && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => voice.start(memberList)}
              style={{ flex: 1, alignItems: 'center', gap: 10,
                backgroundColor: colors.primary + '14', borderRadius: 16, paddingVertical: 20, paddingHorizontal: 10,
                borderWidth: 1.5, borderColor: colors.primary + '40' }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary + '22',
                alignItems: 'center', justifyContent: 'center' }}>
                <Mic size={24} color={colors.primary} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Speak it 🎙️</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2, textAlign: 'center' }}>
                  AI fills it in for you
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => { voice.cancel(); setVoiceReview(null); onTypeManually(); }}
              style={{ flex: 1, alignItems: 'center', gap: 10,
                backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 10,
                borderWidth: 1.5, borderColor: colors.border }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.card,
                alignItems: 'center', justifyContent: 'center' }}>
                <PenLine size={24} color={colors.textSecondary} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Type it</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2, textAlign: 'center' }}>
                  Fill in the form
                </Text>
              </View>
            </Pressable>
          </View>
        )}

        {voice.state === 'listening' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
            backgroundColor: colors.danger + '14', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16,
            borderWidth: 1.5, borderColor: colors.danger }}>
            <ActivityIndicator color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Listening… speak now</Text>
              {/* Live on-device transcript as the user talks — no AI involved
                  in this step, just @react-native-voice/voice's own speech
                  recognition surfaced instead of hidden behind a spinner. */}
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
                {voice.liveTranscript || examplePrompt}
              </Text>
            </View>
            <Pressable onPress={() => voice.stop(memberList)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.danger + '30', borderRadius: 10 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>Done</Text>
            </Pressable>
          </View>
        )}

        {voice.state === 'processing' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
            backgroundColor: isDark ? colors.surface : colors.inputBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16,
            borderWidth: 1.5, borderColor: colors.border }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>Figuring out what you need…</Text>
          </View>
        )}

        {voice.state === 'error' && voice.error && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.danger + '12', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.danger + '40' }}>
            <AlertTriangle size={15} color={colors.danger} />
            <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.danger }}>{voice.error}</Text>
          </View>
        )}
      </View>
    </AppBottomSheet>
  );
}
