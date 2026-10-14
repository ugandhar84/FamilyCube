/**
 * AskPermissionPage — dedicated full page replacing AskModal's
 * type:'permission' variant. Standalone component (not shared with
 * AskQuestionPage/MedicationAlertPage) per explicit instruction — the 3
 * pages are near-identical today, duplication across them is intentional.
 *
 * Plain View-rooted — no self FullPageOverlay wrap; the parent (KidView)
 * applies that. Same submit logic as AskModal: sendRequest({ type:
 * 'permission', fromMemberId, detail, urgency: 'normal' }).
 */
import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Unlock, X } from 'lucide-react-native';
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

export function AskPermissionPage({ active, onClose }: {
  active: FamilyMember; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendRequest } = useKidRequestStore();
  const members = useFamilyStore(s => s.members);
  const parentNames = members.filter(m => m.role === 'parent').map(m => m.name.split(' ')[0]);
  const [revealed, setRevealed] = useState(false);
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [whereWith, setWhereWith] = useState('');
  const [getHome, setGetHome] = useState('');
  const [sent, setSent] = useState(false);

  const accent = BRAND.purple;
  const canvas = isDark ? colors.background : GEMINI.canvas;

  const submit = () => {
    if (!text.trim()) return;
    const parts = [text.trim()];
    if (when.trim()) parts.push(`When: ${when.trim()}`);
    if (whereWith.trim()) parts.push(`Where and who with: ${whereWith.trim()}`);
    if (getHome.trim()) parts.push(`How I'll get home: ${getHome.trim()}`);
    sendRequest({ type: 'permission', fromMemberId: active.id, detail: parts.join('\n\n'), urgency: 'normal' });
    setSent(true);
  };

  const close = () => { setRevealed(false); setText(''); setWhen(''); setWhereWith(''); setGetHome(''); setSent(false); onClose(); };

  // One-shot fill — called exactly once when the kid taps the composer's
  // CTA, stops voice dictation, or taps "AI fill", never on every
  // keystroke. AI's extractResponsibility is event/quest-shaped (title +
  // startAt), so it fills `text`+`when`; "where and who with"/"how you'll
  // get home" are this form's own fields with no AI-schema equivalent —
  // left for the kid to fill in below, same as JustDescribeItEventScreen
  // leaves non-title/time fields for manual entry after its own AI fill.
  const handleReveal = (typed: string, aiResult: Awaited<ReturnType<typeof import('@/lib/familyAiService').familyAi.extractResponsibility>> | null) => {
    setText(typed);
    if (aiResult?.task?.startAt) {
      const d = new Date(aiResult.task.startAt);
      if (!Number.isNaN(d.getTime())) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const h = d.getHours(); const ampm = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
        setWhen(`${months[d.getMonth()]} ${d.getDate()} · ${h12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`);
      }
    }
    setRevealed(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        {!sent && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: insets.top + 8 }}>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>‹ Ask Parent</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}
        <PageHeading
          title="Ask Permission"
          subtitle={sent ? undefined : 'Your idea matters. Give a parent the details.'}
          accent="pink"
          Icon={Unlock}
          topInset={0}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ gap: 16 }}>
        {sent ? (
          <SentConfirmation
            title="Sent · awaiting a reply"
            message="Permission request sent. Wait for a parent's decision before going."
            onReturn={close}
            colors={colors}
          />
        ) : !revealed ? (
          <DescribeComposer
            placeholder={`"Can I go to Jake's house Wed after school?"`}
            ctaLabel="Fill in details →"
            onReveal={handleReveal}
            colors={colors} isDark={isDark} accent={accent}
          />
        ) : (
          <>
            <FieldCardSection title="Tell us your plan" colors={colors} isDark={isDark}>
              <FieldCard label="What would you like to do?" focused={text.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, minHeight: 50, textAlignVertical: 'top' }}
                  placeholder="e.g. Can I go to Jake's house?"
                  placeholderTextColor={colors.textTertiary}
                  value={text} onChangeText={setText} multiline
                />
              </FieldCard>

              <FieldCard label="When" focused={when.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                  placeholder="e.g. Wed after school, 4–5:30"
                  placeholderTextColor={colors.textTertiary}
                  value={when} onChangeText={setWhen}
                />
              </FieldCard>

              <FieldCard label="Where and who with" focused={whereWith.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                  placeholder="e.g. Jake's house · his mum will be home"
                  placeholderTextColor={colors.textTertiary}
                  value={whereWith} onChangeText={setWhereWith}
                />
              </FieldCard>

              <FieldCard label="How you'll get home" focused={getHome.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                  placeholder="e.g. Please pick me up at 5:30"
                  placeholderTextColor={colors.textTertiary}
                  value={getHome} onChangeText={setGetHome}
                />
              </FieldCard>
            </FieldCardSection>

            <BeforeYouSendBox
              recipientLabel={`To ${parentNames.length > 0 ? parentNames.join(' and ') : 'your parents'}`}
              note="Sending keeps a dated request; it does not grant permission or award coins."
              colors={colors}
            />

            <Pressable onPress={submit} disabled={!text.trim()}
              style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                backgroundColor: text.trim() ? accent : colors.surface }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: text.trim() ? '#fff' : colors.textTertiary }}>
                Send permission request
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
