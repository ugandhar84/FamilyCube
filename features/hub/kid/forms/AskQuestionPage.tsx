/**
 * AskQuestionPage — dedicated full page replacing AskModal's
 * type:'question' variant. Standalone component (not shared with
 * AskPermissionPage/MedicationAlertPage) per explicit instruction — the 3
 * pages are near-identical today, duplication across them is intentional.
 *
 * Plain View-rooted — no self FullPageOverlay wrap; the parent (KidView)
 * applies that. Same submit logic as AskModal: sendRequest({ type:
 * 'question', fromMemberId, detail, urgency: 'normal' }).
 */
import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HelpCircle, X } from 'lucide-react-native';
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
import { DropRow } from './shared/DropRow';
import { DescribeComposer } from './shared/DescribeComposer';

const REPLY_PREFERENCE_OPTIONS = [
  { key: 'app_no_rush', label: 'In Family Cube · no urgent deadline' },
  { key: 'app_today', label: 'In Family Cube · today if possible' },
  { key: 'call_me', label: 'Call me when you can' },
];

// Matches AskModal's own ASK_META.question.accent — a dedicated blue not
// in the brand palette or a semantic token, kept as one named constant.
const QUESTION_ACCENT = '#4A7FA5';

export function AskQuestionPage({ active, onClose }: {
  active: FamilyMember; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest } = useKidRequestStore();
  const members = useFamilyStore(s => s.members);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);
  const [revealed, setRevealed] = useState(false);
  const [text, setText] = useState('');
  const [replyPreference, setReplyPreference] = useState(REPLY_PREFERENCE_OPTIONS[0].key);
  const [sent, setSent] = useState(false);

  const accent = QUESTION_ACCENT;
  const canvas = isDark ? colors.background : GEMINI.canvas;

  const submit = () => {
    if (!text.trim()) return;
    const prefLabel = REPLY_PREFERENCE_OPTIONS.find(o => o.key === replyPreference)?.label;
    const detail = prefLabel ? `${text.trim()}\n\nReply preference: ${prefLabel}` : text.trim();
    sendRequest({ type: 'question', fromMemberId: active.id, detail, urgency: 'normal' });
    setSent(true);
  };

  const close = () => { setRevealed(false); setText(''); setReplyPreference(REPLY_PREFERENCE_OPTIONS[0].key); setSent(false); onClose(); };

  // Question has no AI-schema field to borrow from (extractResponsibility
  // is title/startAt-shaped, not useful for a free-form question) — the
  // describe box's text just becomes the question verbatim.
  const handleReveal = (typed: string) => { setText(typed); setRevealed(true); };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          title="Ask a Question"
          subtitle={sent ? undefined : 'Your idea matters. Give a parent the details.'}
          accent="sky"
          Icon={HelpCircle}
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
            message={`Question delivered to ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}. A reply will appear on your Hub.`}
            onReturn={close}
            colors={colors}
          />
        ) : !revealed ? (
          <DescribeComposer
            placeholder={`"Can you bring money for the field trip?"`}
            ctaLabel="Fill in details →"
            onReveal={handleReveal}
            colors={colors} isDark={isDark} accent={accent}
          />
        ) : (
          <>
            <FieldCardSection title="What's on your mind?" colors={colors} isDark={isDark}>
              <FieldCard label="Your question" focused={text.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, minHeight: 60, textAlignVertical: 'top' }}
                  placeholder="e.g. Can you bring money for the field trip?"
                  placeholderTextColor={colors.textTertiary}
                  value={text} onChangeText={setText} multiline
                />
              </FieldCard>

              <DropRow
                label="Reply preference"
                value={replyPreference}
                options={REPLY_PREFERENCE_OPTIONS}
                onSelect={setReplyPreference}
                isDark={isDark} colors={colors}
              />
            </FieldCardSection>

            <BeforeYouSendBox
              recipientLabel={`To ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}`}
              note="Only the family recipients shown here see this request."
              colors={colors}
            />

            <Pressable onPress={submit} disabled={!text.trim()}
              style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                backgroundColor: text.trim() ? accent : colors.surface }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: text.trim() ? '#fff' : colors.textTertiary }}>
                Send question
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
