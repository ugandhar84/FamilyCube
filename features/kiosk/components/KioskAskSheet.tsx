/**
 * KioskAskSheet — kiosk-native replacement for KidModals.tsx's AskModal,
 * covering the same THREE Ask-Parent destinations from one component:
 * permission · question · medication.
 *
 * One component with a `type` prop rather than three files, mirroring the
 * phone's own structure: AskModal branches purely on copy (emoji, title,
 * placeholder hint, accent) and on ONE behavioural difference — medication
 * sends at urgency 'urgent', the other two at 'normal'.
 *
 * ── Submission parity with AskModal ─────────────────────────────────────
 *   sendRequest({ type, fromMemberId: active.id, detail: text.trim(),
 *                 urgency: type === 'medication' ? 'urgent' : 'normal' })
 * — the request `type` IS the destination key, exactly as on the phone, so
 * the parent's queue routes it identically. Validation is the same: a
 * non-empty trimmed body is required and nothing else.
 *
 * The phone uses VoiceTextField (a dictation-capable textarea) for the
 * body; kiosk uses a plain large TextInput — same value, same trim, same
 * submit. See KioskGroceryRequestSheet's header for why dictation is not
 * ported to a shared wall-mounted device.
 *
 * ── Shape: 'dialog' ─────────────────────────────────────────────────────
 * This is the sheet that triggered the whole resize pass. Its ENTIRE body
 * is one label plus one 160px textarea — about 300px of content — and it
 * was shipping as a full-height right-anchored drawer, which on a real
 * tablet read as a mostly-empty column of card. The content is fixed: it
 * cannot grow, no matter what the kid types (the textarea is a fixed
 * minHeight and scrolls internally). That is the exact definition of a
 * content-sized centered dialog, so it is one.
 */
import { useState } from 'react';
import { View, TextInput, StyleSheet, Alert } from 'react-native';
import { Unlock, HelpCircle, Pill } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useKioskColors } from '../kioskPalette';
import type { KioskColors } from '../kioskPalette';
import { KIOSK_SPACE } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, kioskInputStyle } from './KioskFormDrawer';

export type KioskAskType = 'permission' | 'question' | 'medication';

// Same three variants ASK_META defines, with kiosk-palette accents in place
// of the phone's app-palette hexes so both appearances resolve correctly.
const META: Record<KioskAskType, {
  label: string; hint: string; prompt: string;
  Icon: LucideIcon; accent: (k: KioskColors) => string;
}> = {
  permission: {
    label: 'Ask Permission',
    hint: "e.g. Can I go to Jake's house?",
    prompt: 'WHAT DO YOU WANT TO DO?',
    Icon: Unlock, accent: k => k.purple,
  },
  question: {
    label: 'Ask a Question',
    hint: 'e.g. Can you bring money for the field trip?',
    prompt: 'WHAT DO YOU WANT TO ASK?',
    Icon: HelpCircle, accent: k => k.blue,
  },
  medication: {
    label: 'Medication Alert',
    hint: "e.g. I didn't take my morning pill yet",
    prompt: "WHAT'S GOING ON?",
    Icon: Pill, accent: k => k.danger,
  },
};

export function KioskAskSheet({ visible, onClose, type, active }: {
  visible: boolean; onClose: () => void; type: KioskAskType; active: FamilyMember;
}) {
  const { k } = useKioskColors();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const sendRequest = useKidRequestStore(s => s.sendRequest);

  const meta = META[type];
  const accent = meta.accent(k);
  const input = kioskInputStyle(k);

  const dismiss = () => { setText(''); setBusy(false); onClose(); };

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await sendRequest({
        type,
        fromMemberId: active.id,
        detail: text.trim(),
        urgency: type === 'medication' ? 'urgent' : 'normal',
      });
      dismiss();
      Alert.alert('Sent! 👋', 'Your parent has been notified.');
    } catch {
      setBusy(false);
      Alert.alert("Couldn't send", 'Try that again in a moment.');
    }
  };

  return (
    <KioskFormDrawer
      visible={visible}
      variant="dialog"
      title={meta.label}
      subtitle="Sent directly to your parent"
      accent={accent}
      Icon={meta.Icon}
      k={k}
      onClose={dismiss}
      onSubmit={submit}
      canSubmit={!!text.trim()}
      submitting={busy}
      submitLabel="Send to Parent"
      footerNote={type === 'medication' ? 'Sent as urgent' : undefined}
    >
      <View style={s.section}>
        <KioskFieldLabel k={k}>{meta.prompt}</KioskFieldLabel>
        <TextInput
          style={[input, { minHeight: 160, textAlignVertical: 'top' }]}
          placeholder={meta.hint}
          placeholderTextColor={k.textFaint}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus={false}
          accessibilityLabel={meta.label}
          accessibilityHint="Type your message to a parent"
        />
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
});
