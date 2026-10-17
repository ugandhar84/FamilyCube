/**
 * TeenTutorPage — full-page Figma/Gemini-rhythm replacement for
 * TeenTutorSection's old TeenTileSheet bottom sheet ["touturing and
 * cashout should be full page overlay with figma /gemini rythem"].
 * Plain View-rooted — no self FullPageOverlay wrap; KidOverlays applies
 * that, matching every Ask-Parent form's own convention.
 */
import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { PageHeading } from '@/components/PageHeading';
import { TYPO } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import type { KidRequest } from '@/store/kidRequestStore';
import { FieldCard, FieldCardSection } from '../kid/forms/shared/FieldCard';
import { BeforeYouSendBox } from '../kid/forms/shared/BeforeYouSendBox';
import { SentConfirmation } from '../kid/forms/shared/SentConfirmation';

export function TeenTutorPage({
  siblings, pendingOffers, onSend, onCancel, onClose,
}: {
  siblings: FamilyMember[]; pendingOffers: KidRequest[];
  onSend: (kid: FamilyMember, subject: string, note: string) => void;
  onCancel: (id: string) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [tutorKid, setTutorKid] = useState<FamilyMember | null>(null);
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const canvas = isDark ? colors.background : GEMINI.canvas;

  const submit = () => {
    if (!tutorKid || !subject.trim()) return;
    onSend(tutorKid, subject.trim(), note.trim());
    setSent(true);
  };

  const close = () => { setTutorKid(null); setSubject(''); setNote(''); setSent(false); onClose(); };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <PageHeading
          eyebrow="FAMILY CUBE · TUTORING"
          title="Tutor a Sibling"
          subtitle={sent ? undefined : 'Offer your time to help with homework or studying.'}
          accent="pink"
          Icon={BookOpen}
          onTitlePress={onClose}
          topInset={insets.top}
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
            title="Offer sent · awaiting a reply"
            message={`Your offer to help ${tutorKid?.name.split(' ')[0] ?? 'a sibling'} is on its way to a parent.`}
            onReturn={close}
            colors={colors}
          />
        ) : (
          <>
            {pendingOffers.length > 0 && (
              <FieldCardSection title="Waiting on parent" colors={colors} isDark={isDark}>
                {pendingOffers.map(r => (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
                    <BookOpen size={14} color={colors.pink} />
                    <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary }} numberOfLines={2}>{r.detail}</Text>
                    <Pressable onPress={() => onCancel(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
                      <X size={16} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                ))}
              </FieldCardSection>
            )}

            <FieldCardSection title="Who needs help?" colors={colors} isDark={isDark}>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {siblings.map(k => (
                  <Pressable key={k.id} onPress={() => setTutorKid(k)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
                      borderRadius: 12, borderWidth: 1.5,
                      borderColor: tutorKid?.id === k.id ? colors.pink : colors.border,
                      backgroundColor: tutorKid?.id === k.id ? colors.pinkLight : 'transparent' }}>
                    <Text style={{ fontSize: 16 }}>{k.emoji ?? '👤'}</Text>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                      color: tutorKid?.id === k.id ? colors.pink : colors.textPrimary }}>{k.name.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </View>

              <FieldCard label="Subject" focused={subject.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0 }}
                  placeholder="e.g. Math, Science"
                  placeholderTextColor={colors.textTertiary}
                  value={subject} onChangeText={setSubject}
                />
              </FieldCard>

              <FieldCard label="Note to sibling (optional)" focused={note.length > 0} colors={colors} isDark={isDark}>
                <TextInput
                  style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, padding: 0, minHeight: 50, textAlignVertical: 'top' }}
                  placeholder="Anything they should know"
                  placeholderTextColor={colors.textTertiary}
                  value={note} onChangeText={setNote} multiline
                />
              </FieldCard>
            </FieldCardSection>

            <BeforeYouSendBox
              recipientLabel="To your parents"
              note="Sending shares the offer; it doesn't schedule anything on its own."
              colors={colors}
            />

            <Pressable onPress={submit} disabled={!tutorKid || !subject.trim()}
              style={{ borderRadius: 16, paddingVertical: 15, alignItems: 'center',
                backgroundColor: (tutorKid && subject.trim()) ? colors.pink : colors.surface }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: (tutorKid && subject.trim()) ? '#fff' : colors.textTertiary }}>
                Offer help
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
