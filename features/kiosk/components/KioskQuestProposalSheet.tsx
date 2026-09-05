/**
 * KioskQuestProposalSheet — kiosk-native replacement for KidModals.tsx's
 * QuestProposalModal ("Suggest a Chore": for YOURSELF, and the kid picks
 * the coin amount they think it's worth).
 *
 * ── Submission parity with QuestProposalModal ───────────────────────────
 *   sendRequest({ type: 'quest_proposal', fromMemberId: active.id,
 *                 detail: title.trim(),
 *                 rewardCoins: Math.max(0, Math.round(parseInt(coins,10) || 0)),
 *                 urgency: 'normal' })
 * — same kid_requests row shape, so QuestProposalReviewCard picks it up
 * with zero extra plumbing. Coins default to '15' and are digit-filtered on
 * entry exactly as the phone does; approval (which is what actually creates
 * the live quest, via choreStore.addChore on the parent's side) is
 * unchanged.
 *
 * Distinct from KioskChoreProposalSheet, which targets a sibling and never
 * carries a coin amount — same distinction the two phone modals draw.
 */
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';

// Kiosk-only convenience: one-tap coin amounts, so a kid at a wall-mounted
// tablet does not have to summon a number keypad for the common cases. The
// free-entry field is still the source of truth and still accepts anything.
const COIN_PICKS = ['5', '10', '15', '25', '50'];

export function KioskQuestProposalSheet({ visible, onClose, active }: {
  visible: boolean; onClose: () => void; active: FamilyMember;
}) {
  const { k } = useKioskColors();
  const sendRequest = useKidRequestStore(s => s.sendRequest);
  const [title, setTitle] = useState('');
  const [coins, setCoins] = useState('15');
  const [busy, setBusy] = useState(false);

  const accent = k.primary;
  const input = kioskInputStyle(k);

  const dismiss = () => { setTitle(''); setCoins('15'); setBusy(false); onClose(); };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const rewardCoins = Math.max(0, Math.round(parseInt(coins, 10) || 0));
    try {
      await sendRequest({
        type: 'quest_proposal',
        fromMemberId: active.id,
        detail: trimmed,
        rewardCoins,
        urgency: 'normal',
      });
      dismiss();
      Alert.alert('Sent! 🧩', 'Your parent will review your chore idea.');
    } catch {
      setBusy(false);
      Alert.alert("Couldn't send", 'Try that again in a moment.');
    }
  };

  return (
    <KioskFormDrawer
      visible={visible}
      title="Suggest a Chore"
      subtitle="Sent to a parent to review"
      accent={accent}
      Icon={Lightbulb}
      k={k}
      onClose={dismiss}
      onSubmit={submit}
      canSubmit={!!title.trim()}
      submitting={busy}
      submitLabel="Send to Parent"
      footerNote="A parent can change the coin amount when they approve it"
    >
      <View style={s.section}>
        <KioskFieldLabel k={k}>WHAT'S THE CHORE?</KioskFieldLabel>
        <TextInput
          style={[input, { minHeight: 88, textAlignVertical: 'top' }]}
          placeholder="e.g. Wash the car"
          placeholderTextColor={k.textFaint}
          value={title}
          onChangeText={setTitle}
          multiline
          accessibilityLabel="Chore description"
        />
      </View>

      <View style={s.section}>
        <KioskFieldLabel k={k}>HOW MANY COINS?</KioskFieldLabel>
        <View style={s.wrap}>
          {COIN_PICKS.map(c => (
            <KioskPill
              key={c} label={`🪙 ${c}`} selected={coins === c} accent={accent} k={k}
              onPress={() => setCoins(c)}
              hint="Sets the suggested coin reward"
            />
          ))}
        </View>
        <TextInput
          style={[input, { width: 140 }]}
          value={coins}
          onChangeText={t => setCoins(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="15"
          placeholderTextColor={k.textFaint}
          accessibilityLabel="Coin amount"
          accessibilityHint="Type a different coin amount"
        />
        <Text style={[s.hint, { color: k.textFaint }]} numberOfLines={2}>
          This is your suggestion — a parent sets the real reward.
        </Text>
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  hint: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
});
