/**
 * MedicationAlertPage — dedicated full page replacing AskModal's
 * type:'medication' variant. Standalone component (not shared with
 * AskPermissionPage/AskQuestionPage) per explicit instruction — the 3
 * pages are near-identical today, duplication across them is intentional.
 *
 * Plain View-rooted — no self FullPageOverlay wrap; the parent (KidView)
 * applies that. Same submit logic as AskModal: sendRequest({ type:
 * 'medication', fromMemberId, detail, urgency: 'urgent' }).
 */
import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pill, X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
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

export function MedicationAlertPage({ active, onClose }: {
  active: FamilyMember; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest } = useKidRequestStore();
  const members = useFamilyStore(s => s.members);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);
  const [revealed, setRevealed] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  const accent = colors.danger;
  const canvas = isDark ? colors.background : GEMINI.canvas;

  const submit = () => {
    if (!text.trim()) return;
    sendRequest({ type: 'medication', fromMemberId: active.id, detail: text.trim(), urgency: 'urgent' });
    setSent(true);
  };

  const close = () => { setRevealed(false); setText(''); setSent(false); onClose(); };
  const handleReveal = (typed: string) => { setText(typed); setRevealed(true); };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          title="Medication Alert"
          subtitle={sent ? undefined : 'Urgent — your parent is notified right away.'}
          accent="primary"
          Icon={Pill}
          topInset={insets.top}
          eyebrow="FAMILY CUBE · ASK PARENT"
          onTitlePress={onClose}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 12, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ gap: 12 }}>
        {sent ? (
          <SentConfirmation
            title="Sent · awaiting a reply"
            message={`Alert delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'} as urgent.`}
            onReturn={close}
            colors={colors}
          />
        ) : !revealed ? (
          <DescribeComposer
            placeholder={`"I didn't take my morning pill yet"`}
            ctaLabel="Fill in details →"
            onReveal={handleReveal}
            colors={colors} isDark={isDark} accent={accent}
          />
        ) : (
          <>
            <FieldCardSection title="What's going on?" colors={colors} isDark={isDark}>
              <FieldCard label="Tell us what's happening" focused={text.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, minHeight: 60, textAlignVertical: 'top' }}
                  placeholder="e.g. I didn't take my morning pill yet"
                  placeholderTextColor={colors.textTertiary}
                  value={text} onChangeText={setText} multiline
                />
              </FieldCard>
            </FieldCardSection>

            <BeforeYouSendBox
              recipientLabel={`To ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}`}
              note="Marked urgent — sent straight to your parent's phone."
              colors={colors}
            />

            <Pressable onPress={submit} disabled={!text.trim()}
              style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                backgroundColor: text.trim() ? accent : colors.surface }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: text.trim() ? '#fff' : colors.textTertiary }}>
                Send urgent alert
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
