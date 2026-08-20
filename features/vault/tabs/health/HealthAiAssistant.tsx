import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Animated } from 'react-native';
import { Check, Stethoscope, Send, MessageSquare, ScanLine, Syringe, X } from 'lucide-react-native';
import AskCubeMessageText from '@/components/AskCubeMessageText';
import { BRAND } from '../shared';
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
              backgroundColor: colors.primary + '18',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Stethoscope size={14} color={colors.primary} />
            </View>
            {!aiOpen && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '900', color: colors.primary }}>CubeAI Health</Text>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
                {(aiLoading || scanning) && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 2 }} />}
              </>
            )}
            {aiOpen && <X size={13} color={colors.primary} />}
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
                  backgroundColor: scanning ? colors.primary : colors.primary + '18',
                  borderWidth: 1, borderColor: colors.primary + (scanning ? '' : '40'),
                }}>
                {scanning
                  ? <ActivityIndicator size="small" color={colors.textInverse} />
                  : <ScanLine size={13} color={colors.primary} />}
                <Text style={{ fontSize: 11, fontWeight: '800', color: scanning ? colors.textInverse : colors.primary }}>Scan Rx</Text>
              </TouchableOpacity>

              {/* Scan Vaccine */}
              <TouchableOpacity
                disabled={scanning}
                onPress={() => { onScanVaccine(); toggleAiOpen(false); }}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: BRAND.teal + '18',
                  borderWidth: 1, borderColor: BRAND.teal + '40',
                }}>
                <Syringe size={13} color={BRAND.teal} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.teal }}>Scan Vaccine</Text>
              </TouchableOpacity>

              {/* Ask AI */}
              <TouchableOpacity
                onPress={() => { setAiQuery(''); }}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: colors.primary + '18',
                  borderWidth: 1, borderColor: colors.primary + '40',
                }}>
                <MessageSquare size={13} color={colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>Ask AI</Text>
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
                    backgroundColor: colors.primary + '14',
                    borderWidth: 1, borderColor: colors.primary + '35',
                  }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>{p}</Text>
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
              style={[h.aiSendBtn, { backgroundColor: colors.primary, opacity: aiQuery.trim() ? 1 : 0.35 }]}>
              {aiLoading ? <ActivityIndicator size="small" color={colors.textInverse} /> : <Send size={16} color={colors.textInverse} />}
            </TouchableOpacity>
          </View>

          {/* Result */}
          {(aiLoading || aiResult) ? (
            <View style={{
              borderRadius: 14, borderWidth: 1,
              borderColor: colors.primary + '35',
              backgroundColor: colors.primary + '12',
              padding: 14,
            }}>
              {aiLoading
                ? <View style={{ alignItems: 'center', paddingVertical: 8, gap: 8 }}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>Consulting Health AI…</Text>
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
                      <X size={13} color={colors.primary} />
                    </TouchableOpacity>
                    <View style={{ paddingRight: 24 }}>
                      <AskCubeMessageText content={aiResult} color={colors.textPrimary}
                        urgentColor={BRAND.rose} soonColor={BRAND.amber} />
                    </View>
                    <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                      {aiShared
                        ? <View style={[h.sharedBtn, { backgroundColor: BRAND.emerald }]}>
                            <Check size={13} color={colors.textInverse} />
                            <Text style={{ fontSize: 12, fontWeight: '900', color: colors.textInverse }}>Posted to Family Chat</Text>
                          </View>
                        : <TouchableOpacity onPress={shareAiToChat} style={[h.sharedBtn, { backgroundColor: colors.primary }]}>
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
