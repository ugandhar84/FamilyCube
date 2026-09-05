/**
 * KioskAskFamDrawer — the mockup's right-hand "Ask Fam" assistant drawer.
 *
 * Answers come from features/kiosk/askFam.ts, which is a rule-based lookup
 * over the family's OWN store data, not a language model — see that file's
 * header for the full reasoning. That distinction is surfaced to the person
 * using it, in the drawer's own subtitle, in plain language: this is not a
 * chatbot wearing an AI badge, and it must not present itself as one. If a
 * real model is ever wired in behind this, that line is the first thing
 * that has to change.
 *
 * Parents also still get the app's genuine AI surface (AskCubeChat, backed
 * by the `family-ai` edge function) from the header's sparkle button —
 * KioskScreen renders both. This drawer is the instant, offline, everyone-
 * can-use-it sibling.
 *
 * Idle-lock participation: wrapped in KioskModalHost, so touches inside the
 * native Modal window register as kiosk activity and the lock is held while
 * the drawer is open. Without it, a conversation here reads to the idle
 * timer as total inactivity — the exact bug KioskActivityContext exists to
 * fix.
 */
import { useCallback, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Sparkles, X, Send } from 'lucide-react-native';
import { KioskModalHost } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { answerAskFam, ASK_FAM_SUGGESTIONS, type AskFamTurn } from '../askFam';
import { useKioskMeals } from '../useKioskMeals';

export function KioskAskFamDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { k } = useKioskColors();
  const { meals } = useKioskMeals();
  const [turns, setTurns] = useState<AskFamTurn[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const seq = useRef(0);

  const ask = useCallback((question: string) => {
    const text = question.trim();
    if (!text) return;
    const answer = answerAskFam(text, meals);
    setTurns(prev => [
      ...prev,
      { id: `q${++seq.current}`, role: 'you', text },
      { id: `a${++seq.current}`, role: 'fam', text: answer },
    ]);
    setDraft('');
    // Scroll after the new turns have laid out.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [meals]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KioskModalHost style={s.host}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Ask Fam"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.right}
          pointerEvents="box-none"
        >
          <View style={[s.panel, { backgroundColor: k.card, borderLeftColor: k.cardBorder }]}>
            {/* ── Head ── */}
            <View style={[s.head, { borderBottomColor: k.cardBorder }]}>
              <View style={[s.headIcon, { backgroundColor: k.purpleSoft, borderColor: k.purpleEdge }]}>
                <Sparkles size={22} color={k.purple} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityRole="header" accessibilityLabel="Ask Fam">
                <Text style={[s.title, { color: k.text }]} numberOfLines={1}>Ask Fam</Text>
                {/* The honesty line. Do not soften this into "AI assistant". */}
                <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={2}>
                  Looks up your family's own schedule, chores and meals
                </Text>
              </View>
              <Pressable
                onPress={onClose} hitSlop={12}
                style={[s.closeBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]}
                accessibilityRole="button" accessibilityLabel="Close"
              >
                <X size={20} color={k.textMuted} />
              </Pressable>
            </View>

            {/* ── Conversation ── */}
            <ScrollView
              ref={scrollRef}
              style={s.body}
              contentContainerStyle={s.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {turns.length === 0 ? (
                <View style={[s.intro, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
                  <Text style={[s.introText, { color: k.textMuted }]}>
                    Ask about tonight's dinner, today's schedule, who still has chores, the
                    grocery list, or how many coins the kids have.
                  </Text>
                  <Text style={[s.introFine, { color: k.textFaint }]}>
                    Answers come straight from your family's data on this device — nothing is
                    made up, and nothing is sent to an AI service.
                  </Text>
                </View>
              ) : (
                turns.map(t => {
                  const mine = t.role === 'you';
                  return (
                    <View
                      key={t.id}
                      style={[
                        s.bubble,
                        mine
                          ? { alignSelf: 'flex-end', backgroundColor: k.primary, borderColor: k.primary, borderTopRightRadius: 4 }
                          : { alignSelf: 'flex-start', backgroundColor: k.well, borderColor: k.cardBorder, borderTopLeftRadius: 4 },
                      ]}
                      accessible
                      accessibilityLabel={`${mine ? 'You asked' : 'Answer'}: ${t.text}`}
                    >
                      <Text style={[s.bubbleText, { color: mine ? k.onPrimary : k.text }]}>{t.text}</Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* ── Suggestions + composer ── */}
            <View style={[s.foot, { borderTopColor: k.cardBorder }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chips}
                keyboardShouldPersistTaps="handled"
              >
                {ASK_FAM_SUGGESTIONS.map(sug => (
                  <Pressable
                    key={sug}
                    onPress={() => ask(sug)}
                    style={({ pressed }) => [
                      s.chip,
                      { backgroundColor: pressed ? k.cardHover : k.purpleSoft, borderColor: k.purpleEdge },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={sug}
                  >
                    <Text style={[s.chipText, { color: k.purple }]} numberOfLines={1}>{sug}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={s.composer}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={() => ask(draft)}
                  placeholder="Ask about your family…"
                  placeholderTextColor={k.textFaint}
                  style={[s.input, { backgroundColor: k.well, borderColor: k.cardBorder, color: k.text }]}
                  returnKeyType="send"
                  accessibilityLabel="Your question"
                />
                <Pressable
                  onPress={() => ask(draft)}
                  disabled={!draft.trim()}
                  style={({ pressed }) => [
                    s.sendBtn,
                    { backgroundColor: k.purple },
                    (pressed || !draft.trim()) && { opacity: draft.trim() ? 0.75 : 0.4 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Ask"
                  accessibilityState={{ disabled: !draft.trim() }}
                >
                  <Send size={20} color={k.onAccent} />
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </KioskModalHost>
    </Modal>
  );
}

const s = StyleSheet.create({
  host: { flex: 1 },
  right: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  panel: { width: 480, maxWidth: '100%', height: '100%', borderLeftWidth: 1 },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    padding: KIOSK_SPACE.lg, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headIcon: {
    width: 48, height: 48, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  closeBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  bodyContent: { padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.sm },
  intro: { borderRadius: KIOSK_RADIUS.md, borderWidth: 1, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  introText: { fontSize: KIOSK_TYPO.body, fontWeight: '600', lineHeight: KIOSK_TYPO.body * 1.5 },
  introFine: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', lineHeight: KIOSK_TYPO.caption * 1.5 },
  bubble: {
    maxWidth: '88%', borderRadius: KIOSK_RADIUS.lg, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
  },
  bubbleText: { fontSize: KIOSK_TYPO.body, fontWeight: '600', lineHeight: KIOSK_TYPO.body * 1.45 },
  foot: { borderTopWidth: StyleSheet.hairlineWidth, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  chips: { gap: KIOSK_SPACE.xs, paddingRight: KIOSK_SPACE.md },
  chip: {
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: 38, justifyContent: 'center',
  },
  chipText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  input: {
    flex: 1, minHeight: KIOSK_HIT.primary, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, fontSize: KIOSK_TYPO.body, fontWeight: '600',
  },
  sendBtn: {
    width: KIOSK_HIT.primary, height: KIOSK_HIT.primary, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
});
