/**
 * KioskCantDoThisDialog — the kiosk-native "Can't do this" reason picker.
 *
 * ── Why not port CantMakeItSheet ────────────────────────────────────────
 * features/tasks/components/CantMakeItSheet.tsx is the phone's version of
 * this: a THREE-step bottom sheet (reason → outcome → optional date
 * picker) offering four outcomes — put it back for anyone, hand it to a
 * named sibling, ask a parent for a later date (with a native
 * DateTimePicker), or cancel it outright. Three of those four are wrong or
 * unusable on a shared wall tablet:
 *
 *  · "Hand it to someone specific" starts a named handoff negotiation the
 *    receiver answers on their OWN device. A kid at the counter picking a
 *    sibling from a kiosk is choosing on behalf of someone who isn't there.
 *  · "Ask for a later time" needs @react-native-community/datetimepicker,
 *    a phone-native modal that would sit on a wall tablet until someone
 *    dismissed it — the same reason KidCheckinSheet swapped Alert.alert
 *    for showToast.
 *  · "It's not needed anymore" is creator/parent-only and is rejected
 *    server-side for a kid, so on a kid-role kiosk it is a button whose
 *    only possible outcome is silent failure.
 *
 * What's left — and what a kid standing at the kiosk actually means by
 * "can't do this" — is the 'pool' outcome: give a reason, put it back.
 * So this is ONE step, not three: pick or type a reason, confirm.
 *
 * It is NOT a reimplementation of the decline itself. It calls the exact
 * same resolveCantMakeIt(target, 'pool', reason, byMemberId) dispatch the
 * phone sheet calls, which delegates to choreStore.declineChoreAssignment
 * — the same store action, the same 3-way GP-quest / team-clone / plain
 * chore handling, no kiosk-side re-derivation.
 *
 * Idle lock: built on KioskFormDrawer, which wraps KioskModalHost, so the
 * lock is suspended while this is open exactly the way every other kiosk
 * sheet does it. Nothing extra to declare here.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { CircleSlash } from 'lucide-react-native';

import { useChoreStore } from '@/store/choreStore';
import { resolveCantMakeIt } from '@/features/tasks/lib/cantMakeIt';
import { showToast } from '@/components/AppToast';

import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { kioskOnAccent, type KioskColors } from '../kioskPalette';
import { KioskFormDrawer } from './KioskFormDrawer';

/** Verbatim from CantMakeItSheet's REASONS — one shared vocabulary. */
const REASONS = ['Something came up', 'Not feeling well', 'No ride', 'Need more time', 'Too hard, need help'];

export function KioskCantDoThisDialog({
  visible, choreId, choreTitle, byMemberId, k, onClose,
}: {
  visible: boolean;
  /** The quest/chore id — looked up in choreStore to build the real target. */
  choreId: string;
  choreTitle: string;
  byMemberId: string;
  k: KioskColors;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState('');
  const [custom, setCustom] = useState('');

  const reason = (preset || custom).trim();

  const close = () => { setPreset(''); setCustom(''); onClose(); };

  const submit = () => {
    if (!reason) return;
    // The dispatch takes the real ChoreTask, not just an id — same lookup
    // KidView does before opening the phone sheet. If the row has vanished
    // out from under this dialog (a parent reassigned it mid-flow on
    // another device) there is nothing to decline: close quietly rather
    // than claiming a success that never happened.
    const chore = useChoreStore.getState().chores.find(c => c.id === choreId);
    if (!chore) { showToast('That chore is no longer yours.'); close(); return; }
    resolveCantMakeIt({ kind: 'chore', item: chore }, 'pool', reason, byMemberId);
    showToast("Marked — you're off this one ✓");
    close();
  };

  return (
    <KioskFormDrawer
      visible={visible}
      title="Can't do this?"
      subtitle={choreTitle}
      accent={k.danger}
      Icon={CircleSlash}
      k={k}
      onClose={close}
      variant="dialog"
      submitLabel="Put it back for anyone"
      onSubmit={submit}
      canSubmit={!!reason}
      footerNote="It goes back up for grabs and a parent is told why."
    >
      <Text style={[s.prompt, { color: k.textMuted }]} numberOfLines={2}>
        What came up?
      </Text>

      <View style={s.presetWrap}>
        {REASONS.map(r => {
          const on = preset === r;
          return (
            <Pressable
              key={r}
              onPress={() => { setPreset(on ? '' : r); if (!on) setCustom(''); }}
              style={({ pressed }) => [
                s.preset,
                on
                  ? { backgroundColor: k.danger, borderColor: k.danger }
                  : { backgroundColor: k.well, borderColor: k.cardBorder },
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={r}
              accessibilityHint={`Use "${r}" as your reason`}
            >
              <Text
                style={[s.presetText, { color: on ? kioskOnAccent(k, k.danger) : k.text }]}
                numberOfLines={1}
              >
                {r}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={custom}
        onChangeText={t => { setCustom(t); if (t) setPreset(''); }}
        placeholder="Or say it in your own words…"
        placeholderTextColor={k.textFaint}
        multiline
        style={[s.input, { backgroundColor: k.well, borderColor: k.cardBorder, color: k.text }]}
        accessibilityLabel="Your own reason"
        accessibilityHint="Type a reason instead of picking one above"
      />
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  prompt: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  presetWrap: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: KIOSK_SPACE.xs, marginTop: KIOSK_SPACE.sm,
  },
  preset: {
    minHeight: KIOSK_HIT.min, justifyContent: 'center',
    paddingHorizontal: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.full, borderWidth: 1.5,
  },
  presetText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  input: {
    marginTop: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.md, borderWidth: 1.5,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.control + 12,
    fontSize: KIOSK_TYPO.body, fontWeight: '600', textAlignVertical: 'top',
  },
});
