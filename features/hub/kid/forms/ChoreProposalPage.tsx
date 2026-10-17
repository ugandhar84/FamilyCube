/**
 * ChoreProposalPage — full-page replacement for
 * features/hub/kid/KidChoreProposalModal.tsx's bottom sheet. A kid
 * proposing a chore for themselves or a sibling (recipient picker,
 * filtered to kid/teen roles). Never carries a coin amount — a parent
 * sets the real reward at approval time. Logic ported verbatim
 * (useSubmitGuard double-tap protection, propose_kid_chore RPC with the
 * same params) — only the layout changed, to the shared Figma field-card
 * rhythm (FieldCard/FieldCardSection/BeforeYouSendBox/SentConfirmation).
 */
import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { TYPO } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';
import { FieldCard, FieldCardSection } from './shared/FieldCard';
import { BeforeYouSendBox } from './shared/BeforeYouSendBox';
import { SentConfirmation } from './shared/SentConfirmation';
import { DropRow } from './shared/DropRow';
import { DescribeComposer } from './shared/DescribeComposer';
import { TextInput } from 'react-native';

export function ChoreProposalPage({ active, members, familyId, onClose }: {
  active: FamilyMember; members: FamilyMember[]; familyId: string; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [revealed, setRevealed] = useState(false);
  const [title, setTitle] = useState('');
  const [forId, setForId] = useState(active.id);
  const { submitting, guard } = useSubmitGuard();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const pickableMembers = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const accent = BRAND.purple;
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);

  const canvas = isDark ? colors.background : GEMINI.canvas;

  const submit = guard(async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const target = members.find(m => m.id === forId);
    if (!target || (target.role !== 'kid' && target.role !== 'teen')) {
      setError('Chores can only be for you or a brother/sister.');
      return;
    }
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
      setError(null);
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't send that — try again.");
    }
  });

  const close = () => { setRevealed(false); setTitle(''); setForId(active.id); setSent(false); onClose(); };
  const handleReveal = (typed: string) => { setTitle(typed); setRevealed(true); };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          title="Propose a Chore"
          subtitle={sent ? undefined : 'A parent reviews it and sets the reward'}
          accent="pink"
          Icon={ClipboardList}
          topInset={insets.top}
          eyebrow="FAMILY CUBE · ASK PARENT"
          onTitlePress={onClose}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 48, gap: 12 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ gap: 12 }}>
        {sent ? (
          <SentConfirmation
            title="Sent · awaiting a reply"
            message={`Proposal delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}. They'll set the coin reward.`}
            onReturn={close}
            colors={colors}
          />
        ) : !revealed ? (
          <DescribeComposer
            placeholder={`"Wash the car for 20 coins"`}
            ctaLabel="Fill in details →"
            onReveal={handleReveal}
            colors={colors} isDark={isDark} accent={accent}
          />
        ) : (
          <>
            <FieldCardSection title="What's the chore?" colors={colors} isDark={isDark}>
              <FieldCard label="Chore" focused={title.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                  value={title} onChangeText={setTitle} placeholder="e.g. Wash the car"
                  placeholderTextColor={colors.textTertiary}
                />
              </FieldCard>

              <DropRow
                label="Who's this for?"
                value={forId}
                options={pickableMembers.map(m => ({ key: m.id, label: m.id === active.id ? 'Me' : m.name.split(' ')[0] }))}
                onSelect={setForId}
                isDark={isDark} colors={colors}
              />

              {error && (
                <Text style={{ fontSize: TYPO.label, color: colors.danger, fontWeight: '600' }}>{error}</Text>
              )}
            </FieldCardSection>

            <BeforeYouSendBox
              recipientLabel={`To ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}`}
              note="A parent will set the coin reward when they approve it."
              colors={colors}
            />

            <Pressable onPress={submit} disabled={!title.trim() || submitting}
              style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                backgroundColor: title.trim() ? accent : (isDark ? '#2A2A3E' : '#E0E0F0') }}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
                <Text style={{ fontSize: 15, fontWeight: '900', color: title.trim() ? '#fff' : colors.textTertiary }}>
                  Send chore proposal
                </Text>
              )}
            </Pressable>

            <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                Cancel · return unchanged
              </Text>
            </Pressable>
          </>
        )}
        </View>
        </TouchableWithoutFeedback>
      </ScrollView>
    </View>
  );
}
