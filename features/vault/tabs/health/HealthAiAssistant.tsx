import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Animated } from 'react-native';
import { Check, Stethoscope, Send, MessageSquare, ScanLine, Syringe, X } from 'lucide-react-native';
import AskCubeMessageText from '@/components/AskCubeMessageText';
import { h } from './styles';

const QUICK_PROMPTS = [
  'Missed dose guidance for common meds',
  'When to visit ER vs urgent care?',
  'Flu vs cold — what to watch for?',
  'Safe OTC meds for kids under 12',
];

export default function HealthAiAssistant({
  colors, isDark, aiOpen, toggleAiOpen, aiSlideAnim,
  scanning, onScanRx, onScanVaccine,
  aiQuery, setAiQuery, aiLoading, aiResult, setAiResult, aiShared, setAiShared,
  askAI, shareAiToChat,
}: {
  colors: any;
  isDark: boolean;
  aiOpen: boolean;
  toggleAiOpen: (next: boolean) => void;
  aiSlideAnim: Animated.Value;
  scanning: boolean;
  onScanRx: () => void;
  onScanVaccine: () => void;
  aiQuery: string;
  setAiQuery: (v: string) => void;
  aiLoading: boolean;
  aiResult: string;
  setAiResult: (v: string) => void;
  aiShared: boolean;
  setAiShared: (v: boolean) => void;
  askAI: (q?: string) => void;
  shareAiToChat: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'flex-start' }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: colors.card, borderRadius: 999,
          borderWidth: 1, borderColor: colors.border,
        }}>
          {/* Pill button — always visible, bot icon + label. Tapping slides
              the tool row open to the right instead of a full-width banner. */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => toggleAiOpen(!aiOpen)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9 }}
          >
            <View style={{
              width: 24, height: 24, borderRadius: 8,
              backgroundColor: colors.accent + '18',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Stethoscope size={14} color={colors.accent} />
            </View>
            {!aiOpen && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '900', color: colors.accent }}>CubeAI Health</Text>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
                {(aiLoading || scanning) && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 2 }} />}
              </>
            )}
            {aiOpen && <X size={13} color={colors.accent} />}
          </TouchableOpacity>

          {/* ── Tool row — all three inline in one row, sliding in from the pill ── */}
          {aiOpen && (
            <Animated.View style={{
              flexDirection: 'row', gap: 6, paddingRight: 8,
              opacity: aiSlideAnim,
              transform: [{ translateX: aiSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
            }}>
              {/* Scan Medication Rx */}
              <TouchableOpacity
                disabled={scanning}
                onPress={() => { onScanRx(); toggleAiOpen(false); }}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: scanning ? colors.accent : colors.accent + '18',
                  borderWidth: 1, borderColor: colors.accent + (scanning ? '' : '40'),
                }}>
                {scanning
                  ? <ActivityIndicator size="small" color={colors.textInverse} />
                  : <ScanLine size={13} color={colors.accent} />}
                <Text style={{ fontSize: 11, fontWeight: '800', color: scanning ? colors.textInverse : colors.accent }}>Scan Rx</Text>
              </TouchableOpacity>

              {/* Scan Vaccine */}
              <TouchableOpacity
                disabled={scanning}
                onPress={() => { onScanVaccine(); toggleAiOpen(false); }}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: colors.teal + '18',
                  borderWidth: 1, borderColor: colors.teal + '40',
                }}>
                <Syringe size={13} color={colors.teal} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.teal }}>Scan Vaccine</Text>
              </TouchableOpacity>

              {/* Ask AI */}
              <TouchableOpacity
                onPress={() => { setAiQuery(''); }}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: colors.accent + '18',
                  borderWidth: 1, borderColor: colors.accent + '40',
                }}>
                <MessageSquare size={13} color={colors.accent} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.accent }}>Ask AI</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </View>

      {aiOpen && (
        <View style={{ gap: 12 }}>
          {/* Quick prompts */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {QUICK_PROMPTS.map(p => (
                <TouchableOpacity key={p} onPress={() => askAI(p)}
                  style={{
                    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                    backgroundColor: colors.accent + '14',
                    borderWidth: 1, borderColor: colors.accent + '35',
                  }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Input row */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-end', gap: 8,
            backgroundColor: isDark ? colors.card : '#fff',
            borderRadius: 14, borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: 12, paddingVertical: 8,
          }}>
            <TextInput
              value={aiQuery}
              onChangeText={setAiQuery}
              placeholder="Ask a health question…"
              placeholderTextColor={colors.textTertiary}
              style={[h.aiInput, { color: colors.textPrimary, flex: 1 }]}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => askAI()}
            />
            <TouchableOpacity onPress={() => askAI()} disabled={aiLoading || !aiQuery.trim()}
              style={[h.aiSendBtn, { backgroundColor: colors.accent, opacity: aiQuery.trim() ? 1 : 0.35 }]}>
              {aiLoading ? <ActivityIndicator size="small" color={colors.textInverse} /> : <Send size={16} color={colors.textInverse} />}
            </TouchableOpacity>
          </View>

          {/* Result */}
          {(aiLoading || aiResult) ? (
            <View style={{
              borderRadius: 14, borderWidth: 1,
              borderColor: colors.accent + '35',
              backgroundColor: colors.accent + '12',
              padding: 14,
            }}>
              {aiLoading
                ? <View style={{ alignItems: 'center', paddingVertical: 8, gap: 8 }}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={{ fontSize: 12, color: colors.accent, fontWeight: '700' }}>Consulting Health AI…</Text>
                  </View>
                : <>
                    <TouchableOpacity
                      onPress={() => { setAiResult(''); setAiShared(false); setAiQuery(''); }}
                      style={{
                        position: 'absolute', top: 10, right: 10, zIndex: 1,
                        width: 24, height: 24, borderRadius: 12,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: colors.card,
                      }}>
                      <X size={13} color={colors.accent} />
                    </TouchableOpacity>
                    <View style={{ paddingRight: 24 }}>
                      <AskCubeMessageText content={aiResult} color={colors.textPrimary}
                        urgentColor={colors.danger} soonColor={colors.amber} />
                    </View>
                    <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                      {aiShared
                        ? <View style={[h.sharedBtn, { backgroundColor: colors.success }]}>
                            <Check size={13} color={colors.textInverse} />
                            <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textInverse }}>Posted to Family Chat</Text>
                          </View>
                        : <TouchableOpacity onPress={shareAiToChat} style={[h.sharedBtn, { backgroundColor: colors.accent }]}>
                            <MessageSquare size={13} color={colors.textInverse} />
                            <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textInverse }}>Share with Family</Text>
                          </TouchableOpacity>}
                    </View>
                  </>}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
