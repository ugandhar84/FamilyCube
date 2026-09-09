/**
 * KioskChoreProposalSheet — kiosk-native replacement for
 * features/hub/kid/KidChoreProposalModal.tsx ("Propose a Chore": for
 * YOURSELF or a SIBLING, and the kid never sets a coin amount — a parent
 * does at approval time).
 *
 * ── Submission parity with KidChoreProposalModal ────────────────────────
 * This one does NOT go through kidRequestStore. It calls the same Supabase
 * RPC directly:
 *
 *   supabase.rpc('propose_kid_chore', {
 *     p_family_id: familyId, p_proposer_id: active.id,
 *     p_for_member_id: forId, p_title: trimmed,
 *     p_description: null, p_category: 'other',
 *   })
 *
 * with the same client-side guard first — the target must exist and be a
 * kid or teen, else the same inline error ("Chores can only be for you or a
 * brother/sister."); the RPC also rejects a parent/senior target
 * server-side. Same recipient filter (role kid|teen, self included, shown
 * as "Me"), same default target (self), same submitting-disabled/error
 * handling, same success alert. A kiosk proposal is therefore the same row
 * KidProposedChoreCard reviews.
 *
 * ── Shape: 'dialog' ─────────────────────────────────────────────────────
 * Two fields — a 110px title textarea and a one-row recipient picker. The
 * picker is technically data-driven (one pill per kid/teen) but a family's
 * kid count is small and single-digit, so the pills wrap to at most two
 * short rows; that is not the open-ended growth that earns a full-height
 * panel. Content-sized centered dialog, and it caps at maxHeight anyway in
 * the pathological case.
 */
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { ClipboardList } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_TYPO, KIOSK_SPACE } from '../kioskTheme';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';

export function KioskChoreProposalSheet({ visible, onClose, active, members, familyId }: {
  visible: boolean; onClose: () => void;
  active: FamilyMember | undefined | null; members: FamilyMember[]; familyId: string;
}) {
  const { k } = useKioskColors();
  const [title, setTitle] = useState('');
  const [forId, setForId] = useState(active?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = k.purple;
  const input = kioskInputStyle(k);

  // Hooks are all above this guard, matching the phone modal's own
  // early-return-after-hooks shape.
  if (!active) return null;

  const pickable = members.filter(m => m.role === 'kid' || m.role === 'teen');

  const dismiss = () => {
    setTitle(''); setForId(active.id); setError(null); setBusy(false); onClose();
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    const target = members.find(m => m.id === forId);
    if (!target || (target.role !== 'kid' && target.role !== 'teen')) {
      setError('Chores can only be for you or a brother/sister.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('propose_kid_chore', {
        p_family_id: familyId,
        p_proposer_id: active.id,
        p_for_member_id: forId,
        p_title: trimmed,
        p_description: null,
        p_category: 'other',
      });
      if (rpcError) throw rpcError;
      dismiss();
      Alert.alert('Sent! ✅', 'Your parent will review it and set a coin reward.');
    } catch (e: any) {
      setError(e?.message ?? "Couldn't send that — try again.");
      setBusy(false);
    }
  };

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title="Propose a Chore"
      subtitle="A parent reviews it and sets the reward"
      accent={accent}
      Icon={ClipboardList}
      k={k}
      onClose={dismiss}
      onSubmit={submit}
      canSubmit={!!title.trim()}
      submitting={busy}
      error={error}
      submitLabel="Send to Parent"
    >
      <View style={s.section}>
        <KioskFieldLabel k={k}>WHAT'S THE CHORE?</KioskFieldLabel>
        <TextInput
          style={[input, { minHeight: 110, textAlignVertical: 'top' }]}
          placeholder="e.g. Wash the car"
          placeholderTextColor={k.textFaint}
          value={title}
          onChangeText={setTitle}
          multiline
          accessibilityLabel="Chore description"
        />
      </View>

      <View style={s.section}>
        <KioskFieldLabel k={k}>WHO'S THIS FOR?</KioskFieldLabel>
        <View style={s.wrap}>
          {pickable.map(m => (
            <KioskPill
              key={m.id}
              label={m.id === active.id ? 'Me' : m.name.split(' ')[0]}
              selected={forId === m.id}
              accent={accent}
              k={k}
              onPress={() => { setForId(m.id); setError(null); }}
              hint="Chooses who this chore is proposed for"
            />
          ))}
        </View>
        <Text style={[s.hint, { color: k.textFaint }]} numberOfLines={2}>
          A parent will set the coin reward when they approve it.
        </Text>
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  section: { gap: KIOSK_SPACE.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs },
  hint: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', fontStyle: 'italic' },
});
