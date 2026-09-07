/**
 * KioskRedoReasonDialog — kiosk-native "send this chore back" reason
 * picker, for a parent declining a kid's pending_approval submission.
 *
 * Real mobile equivalent: features/quests/components/DeclineModal.tsx —
 * same preset list (its own DECLINE_PRESETS, unexported so reconstructed
 * here verbatim) plus a custom-text fallback, same 200-char cap. Same
 * shape KioskCantDoThisDialog already established for the kid-side "Can't
 * do this" reason picker — this is that same pattern for the parent-side
 * Redo action, which had no kiosk surface at all (Chores-tab mobile-parity
 * audit, finding A1): the board's own canApprove branch rendered only
 * Approve, with no paired way to send a submission back with a reason —
 * a kiosk parent had to finish that decision on their phone.
 *
 * Calls the exact real store path (via choreAdapter's declineQuest ->
 * choreStore.requestRedo), same as the phone's own DeclineModal ->
 * QuestsScreen.tsx's handleDeclineConfirm.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { RotateCcw } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { kioskOnAccent, type KioskColors } from '../kioskPalette';
import { KioskFormDrawer } from './KioskFormDrawer';

/** Verbatim from DeclineModal.tsx's own DECLINE_PRESETS. */
const REASONS = [
  "The chore wasn't done properly — please redo it",
  'Photo proof is missing or unclear',
  "You didn't complete all the steps",
  'Please try again before tonight',
];

export function KioskRedoReasonDialog({ visible, choreTitle, k, onClose, onSend }: {
  visible: boolean;
  choreTitle: string;
  k: KioskColors;
  onClose: () => void;
  onSend: (reason: string) => void;
}) {
  const [preset, setPreset] = useState('');
  const [custom, setCustom] = useState('');

  const reason = (custom.trim() || preset).trim();
  const close = () => { setPreset(''); setCustom(''); onClose(); };
  const submit = () => {
    if (!reason) return;
    onSend(reason);
    close();
  };

  return (
    <KioskFormDrawer
      visible={visible}
      title="Send back for a redo"
      subtitle={choreTitle}
      accent={k.gold}
      Icon={RotateCcw}
      k={k}
      onClose={close}
      variant="dialog"
      submitLabel="Send Back"
      onSubmit={submit}
      canSubmit={!!reason}
      footerNote="The kid sees this reason and can try again."
    >
      <Text style={[s.prompt, { color: k.textMuted }]}>What needs fixing?</Text>
      <View style={s.presetWrap}>
        {REASONS.map(r => {
          const on = preset === r;
          return (
            <Pressable
              key={r}
              onPress={() => { setPreset(on ? '' : r); if (!on) setCustom(''); }}
              style={({ pressed }) => [
                s.preset,
                on ? { backgroundColor: k.gold, borderColor: k.gold } : { backgroundColor: k.well, borderColor: k.cardBorder },
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={r}
            >
              <Text style={[s.presetText, { color: on ? kioskOnAccent(k, k.gold) : k.text }]} numberOfLines={2}>{r}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={custom}
        onChangeText={t => { setCustom(t.slice(0, 200)); if (t) setPreset(''); }}
        placeholder="Or write your own…"
        placeholderTextColor={k.textFaint}
        multiline maxLength={200}
        style={[s.input, { backgroundColor: k.well, borderColor: k.cardBorder, color: k.text }]}
        accessibilityLabel="Your own reason"
      />
      <Text style={[s.charCount, { color: k.textFaint }]}>{custom.length}/200</Text>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  prompt: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs, marginTop: KIOSK_SPACE.sm },
  preset: { minHeight: KIOSK_HIT.min, justifyContent: 'center', paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.xs, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5, maxWidth: '100%' },
  presetText: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  input: {
    marginTop: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control + 12, fontSize: KIOSK_TYPO.body, fontWeight: '600', textAlignVertical: 'top',
  },
  charCount: { fontSize: KIOSK_TYPO.micro, textAlign: 'right', marginTop: 2 },
});
