/**
 * QuestProposalPage — full-page replacement for KidModals.tsx's
 * QuestProposalModal bottom sheet. Self-only (no recipient picker): kid
 * proposes a chore title + their own suggested coin amount, sent as a
 * kid_requests row (type: 'quest_proposal'); a parent later converts it
 * into a real quest (see QuestProposalReviewCard). Logic ported verbatim —
 * only the layout changed to the shared Figma field-card rhythm
 * (FieldCard/FieldCardSection/BeforeYouSendBox/SentConfirmation).
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HelpCircle, X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { TYPO } from '@/constants/theme';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { FieldCard, FieldCardSection } from './shared/FieldCard';
import { BeforeYouSendBox } from './shared/BeforeYouSendBox';
import { SentConfirmation } from './shared/SentConfirmation';
import { DescribeComposer } from './shared/DescribeComposer';

export function QuestProposalPage({ active, onClose }: {
  active: FamilyMember; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest } = useKidRequestStore();
  const members = useFamilyStore(s => s.members);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);
  const [revealed, setRevealed] = useState(false);
  const [title, setTitle] = useState('');
  const [coins, setCoins] = useState('15');
  const [sent, setSent] = useState(false);
  const accent = BRAND.purple;

  const canvas = isDark ? colors.background : GEMINI.canvas;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const rewardCoins = Math.max(0, Math.round(parseInt(coins, 10) || 0));
    sendRequest({
      type: 'quest_proposal',
      fromMemberId: active.id,
      detail: trimmed,
      rewardCoins,
      urgency: 'normal',
    });
    setSent(true);
  };

  const close = () => { setRevealed(false); setTitle(''); setCoins('15'); setSent(false); onClose(); };
  const handleReveal = (typed: string) => { setTitle(typed); setRevealed(true); };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          title="Suggest a Chore"
          subtitle={sent ? undefined : 'Sent to a parent to review'}
          accent="pink"
          Icon={HelpCircle}
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
                  value={title} onChangeText={setTitle} placeholder="e.g. Wash the car"
                  placeholderTextColor={colors.textTertiary}
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                />
              </FieldCard>

              <FieldCard label="How many coins? (parent can change this)" focused={coins.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  value={coins}
                  onChangeText={t => setCoins(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                  placeholder="15"
                  placeholderTextColor={colors.textTertiary}
                />
              </FieldCard>
            </FieldCardSection>

            <BeforeYouSendBox
              recipientLabel={`To ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}`}
              note="A parent will set the final coin reward when they approve it."
              colors={colors}
            />

            <Pressable onPress={submit} disabled={!title.trim()}
              style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                backgroundColor: title.trim() ? accent : colors.surface }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: title.trim() ? '#fff' : colors.textTertiary }}>
                Send chore idea
              </Text>
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
