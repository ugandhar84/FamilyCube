/**
 * DescribeComposer — the "describe it" rhythm shared by every Ask-Parent
 * form, copied from the parent's JustDescribeItEventScreen.tsx (Schedule
 * tab's own composer, confirmed by the user as "already working 100%"):
 * one free-text box, mic + explicit "AI fill" button (never live-per-
 * keystroke), a resting empty-state card before anything is typed, a
 * one-line "Detected" hint once detectLocalTask() finds something, and a
 * single CTA that reveals the rest of the form. The caller owns the
 * actual fields and what "fill" does with the detected/AI result — this
 * component only owns the box + reveal gate, matching
 * JustDescribeItEventScreen's own separation (its own handleAiAutoFill /
 * openInlineForm stay in the screen, not in a shared component, so this
 * mirrors that shape instead of inventing a new one).
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Mic, Square } from 'lucide-react-native';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { detectLocalTask } from '@/features/tasks/lib/localTaskDetection';
import { familyAi } from '@/lib/familyAiService';
import { useFamilyStore } from '@/store/familyStore';
import { TYPO, RADIUS } from '@/constants/theme';
import { GEMINI } from '@/constants/geminiRhythm';

export function DescribeComposer({
  placeholder, ctaLabel = 'Fill in details →', onReveal, colors, isDark, accent,
}: {
  placeholder: string;
  ctaLabel?: string;
  // Called once, exactly when the kid explicitly asks to proceed (CTA tap,
  // or voice-stop immediately opening the form) — never on every keystroke.
  // `text` is whatever is in the box at that moment; `aiResult` is set only
  // when the AI-fill button was used (null for local-only/voice-only CTA).
  onReveal: (text: string, aiResult: Awaited<ReturnType<typeof familyAi.extractResponsibility>> | null) => void;
  colors: any; isDark: boolean; accent: string;
}) {
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const dictation = useVoiceDictation();
  const members = useFamilyStore(s => s.members);
  const listening = dictation.state === 'listening';
  const hasInput = input.trim().length > 0;
  const detected = hasInput ? detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role }))) : null;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const border = isDark ? colors.border : GEMINI.border;
  const titleColor = isDark ? colors.textPrimary : GEMINI.titleColor;
  const bodyColor = isDark ? colors.textSecondary : GEMINI.bodyColorLight;

  const handleStopVoice = async () => {
    const t = await dictation.stop();
    if (t) { setInput(t); onReveal(t, null); }
  };

  const handleAiFill = async () => {
    if (!input.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const result = await familyAi.extractResponsibility(
        input.trim(), members.map(m => ({ id: m.id, name: m.name, role: m.role }))
      );
      onReveal(input.trim(), result);
    } catch {
      onReveal(input.trim(), null);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{
        backgroundColor: cardBg, borderRadius: 20,
        borderWidth: listening ? 2 : 1, borderColor: listening ? accent : border,
        padding: 18, gap: 10,
        ...cardShadow,
      }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: bodyColor }}>
          {listening ? 'Editable transcript · listening' : 'Tell us what you need'}
        </Text>
        <TextInput
          value={listening ? dictation.liveTranscript : input}
          onChangeText={setInput}
          editable={!listening}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline
          style={{ fontSize: 18, fontWeight: '500', lineHeight: 25, color: titleColor, minHeight: 30 }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {hasInput && !listening && (
              <TouchableOpacity
                onPress={handleAiFill}
                disabled={aiLoading}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8,
                  paddingHorizontal: 8, paddingVertical: 4, backgroundColor: accent + '18' }}>
                {aiLoading ? <ActivityIndicator size="small" color={accent} /> : <Text style={{ fontSize: 11 }}>✨</Text>}
                <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>{aiLoading ? 'Filling…' : 'AI fill'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={listening ? handleStopVoice : () => dictation.start()}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: accent + '18',
              borderWidth: listening ? 2 : 0, borderColor: accent, alignItems: 'center', justifyContent: 'center' }}>
            {listening ? <Square size={18} color={accent} fill={accent} /> : <Mic size={20} color={accent} />}
          </TouchableOpacity>
        </View>
      </View>

      {!listening && hasInput && detected && (
        <Text style={{ fontSize: 12, color: bodyColor, paddingHorizontal: 4 }}>
          Detected · adjust in the form below
        </Text>
      )}

      {!listening && !hasInput && (
        <View style={{ backgroundColor: isDark ? colors.surface : colors.amberLight, borderRadius: 20,
          borderWidth: 1, borderColor: border, padding: 18, gap: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: titleColor }}>One sentence is enough</Text>
          <Text style={{ fontSize: 13, color: bodyColor, lineHeight: 19 }}>
            Type it or tap the mic to speak it. We'll fill in what we can below.
          </Text>
        </View>
      )}

      {!listening && hasInput && (
        <TouchableOpacity
          onPress={() => onReveal(input.trim(), null)}
          style={{ height: 50, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
