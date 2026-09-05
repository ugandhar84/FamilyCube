/**
 * KioskIntercomModal — "House Intercom": broadcast an announcement from the
 * kitchen to every family phone.
 *
 * Reproduces the mockup's intercom dialog (four one-tap presets + close) and
 * adds the two things it was missing to be real: a free-text field for
 * anything the presets don't cover, and honest feedback about what actually
 * happened — how many phones it went to, and whether the push failed.
 *
 * Wrapped in KioskModalHost, which is load-bearing and not optional: a React
 * Native <Modal> renders into its own native window, so touches inside it
 * never reach KioskScreen's root onTouchStart and the idle lock would
 * otherwise count typing an announcement as total inactivity and fire
 * mid-sentence. KioskModalHost both registers those touches AND holds the
 * lock for as long as the sheet is mounted (capped by SUSPEND_MAX_MS, so a
 * sheet abandoned on the counter still eventually locks). This is the same
 * pattern KioskEventEditor/KioskQuestEditor already use — see
 * KioskActivityContext.tsx's header for the bug it fixes.
 */
import { useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ScrollView,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Megaphone, X, Send, Check, AlertTriangle } from 'lucide-react-native';
import { KioskModalHost } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { useKioskIntercom, INTERCOM_PRESETS, type IntercomResult } from '../useKioskIntercom';

export function KioskIntercomModal({ visible, onClose, fromMemberId }: {
  visible: boolean;
  onClose: () => void;
  fromMemberId: string;
}) {
  const { k, isDark } = useKioskColors();
  const { broadcast, sending } = useKioskIntercom();
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<IntercomResult | null>(null);

  const send = async (text: string) => {
    const r = await broadcast(text, fromMemberId);
    setResult(r);
    if (r.ok) setDraft('');
  };

  const close = () => { setResult(null); setDraft(''); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KioskModalHost style={s.host}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close intercom"
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.center} pointerEvents="box-none">
          <View style={[s.sheet, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
            <View style={s.head}>
              <View style={[s.headIcon, { backgroundColor: k.primarySoft, borderColor: k.primaryEdge }]}>
                <Megaphone size={24} color={k.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityRole="header" accessibilityLabel="House intercom">
                <Text style={[s.title, { color: k.text }]} numberOfLines={1}>House Intercom</Text>
                <Text style={[s.sub, { color: k.textMuted }]} numberOfLines={2}>
                  Send an announcement to everyone's phone
                </Text>
              </View>
              <Pressable
                onPress={close} hitSlop={12}
                style={[s.closeBtn, { backgroundColor: k.well, borderColor: k.cardBorder }]}
                accessibilityRole="button" accessibilityLabel="Close"
              >
                <X size={20} color={k.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              style={s.body}
              contentContainerStyle={{ gap: KIOSK_SPACE.md }}
              keyboardShouldPersistTaps="handled"
            >
              {/* One-tap presets — the fast path, and the whole reason an
                  intercom beats picking up a phone. */}
              <View style={s.presets}>
                {INTERCOM_PRESETS.map(p => (
                  <Pressable
                    key={p.text}
                    disabled={sending}
                    onPress={() => send(`${p.emoji} ${p.text}`)}
                    style={({ pressed }) => [
                      s.preset,
                      { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
                      sending && { opacity: 0.5 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={p.text}
                    accessibilityHint="Broadcast this announcement to every family phone"
                    accessibilityState={{ disabled: sending }}
                  >
                    <Text style={s.presetEmoji}>{p.emoji}</Text>
                    <Text style={[s.presetText, { color: k.text }]} numberOfLines={2}>{p.text}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Free text — the mockup has no equivalent, but a preset-only
                  intercom fails the moment someone needs to say anything the
                  four buttons don't cover. */}
              <View style={s.composer}>
                <TextInput
                  value={draft}
                  onChangeText={t => { setDraft(t); if (result) setResult(null); }}
                  placeholder="Or type your own announcement…"
                  placeholderTextColor={k.textFaint}
                  style={[s.input, { backgroundColor: k.well, borderColor: k.cardBorder, color: k.text }]}
                  multiline
                  maxLength={200}
                  editable={!sending}
                  accessibilityLabel="Announcement text"
                  returnKeyType="send"
                />
                <Pressable
                  onPress={() => send(draft)}
                  disabled={sending || !draft.trim()}
                  style={({ pressed }) => [
                    s.sendBtn,
                    { backgroundColor: k.primary },
                    (pressed || sending || !draft.trim()) && { opacity: draft.trim() && !sending ? 0.75 : 0.4 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Send announcement"
                  accessibilityState={{ disabled: sending || !draft.trim() }}
                >
                  {sending
                    ? <ActivityIndicator size="small" color={k.onPrimary} />
                    : <Send size={20} color={k.onPrimary} />}
                </Pressable>
              </View>

              {/* Honest result. The mockup showed a toast that said the same
                  thing whether anything was sent or not; this reports the
                  real recipient count and surfaces a partial failure (chat
                  written, push refused) rather than claiming success. */}
              {result && (
                <View
                  style={[
                    s.result,
                    result.error
                      ? { backgroundColor: k.goldSoft, borderColor: k.goldEdge }
                      : { backgroundColor: k.sageSoft, borderColor: k.sageEdge },
                  ]}
                  accessibilityLiveRegion="polite"
                >
                  {result.error
                    ? <AlertTriangle size={18} color={k.gold} />
                    : <Check size={18} color={k.sage} />}
                  <Text
                    style={[s.resultText, { color: result.error ? k.gold : k.sage }]}
                    numberOfLines={3}
                  >
                    {result.error
                      ? result.error
                      : result.recipients > 0
                        ? `Sent to ${result.recipients} ${result.recipients === 1 ? 'phone' : 'phones'} and posted in family chat.`
                        : 'Posted in family chat. Nobody else has a phone set up yet.'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </KioskModalHost>
    </Modal>
  );
}

const s = StyleSheet.create({
  host: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: KIOSK_SPACE.lg },
  sheet: {
    width: 560, maxWidth: '100%', maxHeight: '86%',
    borderRadius: KIOSK_RADIUS.xl, borderWidth: 1, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.md,
  },
  headIcon: {
    width: 52, height: 52, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },
  closeBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  body: { paddingHorizontal: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.lg },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  preset: {
    flexGrow: 1, flexBasis: '46%', minWidth: 0,
    minHeight: 78, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.xs, justifyContent: 'center',
  },
  presetEmoji: { fontSize: 24 },
  presetText: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: KIOSK_SPACE.sm },
  input: {
    flex: 1, minHeight: KIOSK_HIT.primary, maxHeight: 120,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm,
    fontSize: KIOSK_TYPO.body, fontWeight: '600',
  },
  sendBtn: {
    width: KIOSK_HIT.primary, height: KIOSK_HIT.primary, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  result: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1, padding: KIOSK_SPACE.md,
  },
  resultText: { flex: 1, fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
});
