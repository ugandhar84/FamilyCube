/**
 * AiConflictBanner — collapsed-by-default AI conflict-scan pill, mirroring
 * features/quests/components/AiEngineBanner.tsx's collapse/expand pattern.
 * Presentation only: the actual conflict-detection algorithm
 * (simulateConflictDetection) and all state (aiResult/isAnalyzing/
 * showAiPanel/appliedSwaps) still live in CalendarScreen — this component
 * just renders the pill + expanded results panel from props/callbacks.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { TYPO } from '@/constants/theme';

const BotIcon = ({ c, size = 15 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M3 8h18a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2v-9a2 2 0 012-2z" stroke={c} strokeWidth={2} fill="none" />
    <Path d="M9 3h6M12 3v5" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    <Circle cx={9} cy={14} r={1.5} fill={c} />
    <Circle cx={15} cy={14} r={1.5} fill={c} />
    <Path d="M9 18c0-1 1.3-2 3-2s3 1 3 2" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
  </Svg>
);
const AlertTriangleIcon = ({ c, size = 13 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M10.3 3.5L1.5 19a2 2 0 001.7 3h19.6a2 2 0 001.7-3L15.7 3.5a2 2 0 00-3.4 0z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
    <Path d="M12 9v5M12 17v1" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
  </Svg>
);
const ShieldIcon = ({ c, size = 13 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 22C12 22 4 18 4 12V5l8-3 8 3v7c0 6-8 10-8 10z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
    <Path d="M9 12l2 2 4-4" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const ArrowsIcon = ({ c, size = 11 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const XIcon = ({ c, size = 11 }: { c: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth={2.5} strokeLinecap="round" fill="none" />
  </Svg>
);

export interface AiConflict {
  description: string;
  eventsInvolved: string[];
  suggestedFix?: string;
  recommendedDriverSwap?: string;
  // Real event id(s) this conflict is actually about — lets Apply Swap
  // patch the correct event(s) directly instead of re-guessing from title
  // text or a stale `.conflict` flag.
  eventIds?: string[];
}
export interface AiResult {
  summary: string;
  conflictsFound: boolean;
  conflicts: AiConflict[];
}

interface Props {
  hasConflicts: boolean;
  isAnalyzing: boolean;
  showAiPanel: boolean;
  aiResult: AiResult | null;
  appliedSwaps: Record<string, boolean>;
  onRunScan: () => void;
  onClosePanel: () => void;
  onApplySwap: (idx: number, conflict: AiConflict) => void;
  colors: any;
  isDark: boolean;
}

export function AiConflictBanner({
  hasConflicts, isAnalyzing, showAiPanel, aiResult, appliedSwaps,
  onRunScan, onClosePanel, onApplySwap, colors,
}: Props) {
  if (!hasConflicts && !showAiPanel) return null;

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 8 }}>
      {/* Pill button — collapsed by default, same shell as AiEngineBanner */}
      {hasConflicts && (
        <View style={{ alignItems: 'flex-start' }}>
          <TouchableOpacity onPress={onRunScan} activeOpacity={0.85} style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.card, borderRadius: 999,
            borderWidth: 1, borderColor: colors.danger + '40',
            paddingHorizontal: 12, paddingVertical: 9,
          }}>
            <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: colors.dangerLight, alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangleIcon c={colors.danger} size={14} />
            </View>
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.danger }}>Conflict detected</Text>
            {isAnalyzing
              ? <ActivityIndicator size="small" color={colors.danger} style={{ marginLeft: 2 }} />
              : <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger, opacity: 0.75 }}>Review →</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Results panel — expands below the pill */}
      {showAiPanel && (
        <View style={{
          borderRadius: 24, borderWidth: 1, padding: 14,
          backgroundColor: colors.primaryLight, borderColor: colors.primary + '40',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <BotIcon c={colors.primary} size={15} />
            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: colors.primary }} numberOfLines={1}>
              Schedule Conflicts & Recommendations
            </Text>
            <TouchableOpacity
              onPress={onClosePanel}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: colors.primary + '20' }}>
              <XIcon c={colors.primary} size={11} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.primary }}>Close</Text>
            </TouchableOpacity>
          </View>

          {isAnalyzing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={{ fontSize: TYPO.label, color: colors.primary, fontWeight: '700' }}>
                Scanning for time overlaps, missing drivers, and travel conflicts...
              </Text>
            </View>
          ) : aiResult ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 16 }}>{aiResult.summary}</Text>
              {aiResult.conflictsFound ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <ShieldIcon c={colors.warning} size={13} />
                    <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.warning }}>
                      {aiResult.conflicts.length} Logistics Conflict(s) Detected:
                    </Text>
                  </View>
                  {aiResult.conflicts.map((c, idx) => (
                    <View key={idx} style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.warning + '40', padding: 10, backgroundColor: colors.warningLight }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.warningDark, marginBottom: 3 }}>{c.description}</Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.warning }}>Affected: {c.eventsInvolved.join(' & ')}</Text>
                      {c.suggestedFix && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                          <Text style={{ fontSize: TYPO.label, color: colors.success, fontWeight: '700', flex: 1 }}>
                            💡 {c.suggestedFix}
                          </Text>
                          {c.recommendedDriverSwap && (
                            appliedSwaps[`swap_${idx}`] ? (
                              <View style={{ backgroundColor: colors.successDark, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.textInverse }}>✓ Swapped to {c.recommendedDriverSwap}</Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}
                                onPress={() => onApplySwap(idx, c)}>
                                <ArrowsIcon c={colors.textInverse} size={11} />
                                <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.textInverse }}>⚡ Apply Swap to {c.recommendedDriverSwap}</Text>
                              </TouchableOpacity>
                            )
                          )}
                        </View>
                      )}
                    </View>
                  ))}
                </>
              ) : (
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.success + '60', padding: 10, backgroundColor: colors.successLight }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.successDark, textAlign: 'center' }}>
                    ✅ No schedule conflicts! All drivers and events smoothly covered.
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
