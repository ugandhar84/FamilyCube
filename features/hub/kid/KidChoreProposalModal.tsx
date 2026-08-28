import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, TouchableOpacity, Keyboard, Alert, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO, RADIUS } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import { VoiceTextField } from './VoiceTextField';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

// Matches the same bottom-sheet chrome every other kid-facing request modal
// in KidModals.tsx uses (that file's own local `f` isn't exported).
const f = StyleSheet.create({
  backdrop:   { flex: 1, justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 0, maxHeight: '75%', overflow: 'hidden' },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 14 },
  title:      { fontSize: TYPO.heading, fontWeight: '900' },
  submitBtn:  { borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
});

// A kid (not teen/parent/senior) proposing a simple chore for themselves or
// a sibling — the one genuinely new capability AskParentSheet's stacked
// list didn't have a precedent for. Distinct from QuestProposalModal (self
// only, kid suggests their own coin amount): this can target a sibling and
// NEVER carries a coin amount from the kid — a parent sets the real reward
// at approval time (KidProposedChoreCard.tsx). Recipient picker is filtered
// to kid/teen roles + self only; the propose_kid_chore RPC also rejects a
// parent/senior target server-side.
export function KidChoreProposalModal({ visible, onClose, active, members, familyId }: {
  visible: boolean; onClose: () => void; active: FamilyMember | undefined | null; members: FamilyMember[]; familyId: string;
}) {
  const { colors, isDark } = useTheme();
  const [title, setTitle] = useState('');
  const [forId, setForId] = useState(active?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!active) return null;

  const pickableMembers = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const accent = BRAND.purple;

  const dismiss = () => { setTitle(''); setForId(active.id); setError(null); setSubmitting(false); onClose(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(75);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    const target = members.find(m => m.id === forId);
    if (!target || (target.role !== 'kid' && target.role !== 'teen')) {
      setError('Chores can only be for you or a brother/sister.');
      return;
    }
    setSubmitting(true);
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
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={f.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={[f.sheet, { backgroundColor: colors.card, maxHeight: keyboardAwareMaxHeight ?? '75%' }]}>
            <View style={[f.handle, { backgroundColor: colors.border }]} />
            <View style={f.header}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[f.title, { color: colors.textPrimary }]}>✅ Propose a Chore</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 2, color: accent }}>
                  A parent reviews it and sets the reward
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              onScrollBeginDrag={Keyboard.dismiss}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48, gap: 14 }}>
              <VoiceTextField
                value={title} onChangeText={setTitle} placeholder="e.g. Wash the car"
                colors={colors} isDark={isDark} accent={accent} minHeight={90}
              />

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Who's this for?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {pickableMembers.map(m => {
                    const sel = forId === m.id;
                    return (
                      <Pressable key={m.id} onPress={() => setForId(m.id)}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1.5,
                          backgroundColor: sel ? accent + '20' : (isDark ? colors.surface : colors.card),
                          borderColor: sel ? accent : colors.border }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? accent : colors.textSecondary }}>
                          {m.id === active.id ? 'Me' : m.name.split(' ')[0]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontStyle: 'italic' }}>
                  A parent will set the coin reward when they approve it.
                </Text>
              </View>

              {error && (
                <Text style={{ fontSize: TYPO.label, color: colors.danger, fontWeight: '600' }}>{error}</Text>
              )}

              <TouchableOpacity onPress={submit} disabled={!title.trim() || submitting}
                style={[f.submitBtn, { backgroundColor: title.trim() ? accent : (isDark ? '#2A2A3E' : '#E0E0F0') }]}>
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={{ fontSize: 15, fontWeight: '900', color: title.trim() ? '#fff' : colors.textTertiary }}>
                    Send to Parent →
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
