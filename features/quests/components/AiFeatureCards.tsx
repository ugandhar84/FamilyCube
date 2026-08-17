import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { I } from './icons';
import { AiCard, AiSectionDivider } from './AiPanelPrimitives';

export function AutoBalanceCard({ result, onApply, appliedActions, onClose, isDark, colors, kids }: any) {
  const accent = BRAND.purple;
  // Local editable state for each suggestion
  const [assignEdits, setAssignEdits] = React.useState<Record<number, string>>(() =>
    Object.fromEntries((result.assignments ?? []).map((a: any, i: number) => [i, a.recommendedKidId ?? '']))
  );
  const [bountyEdits, setBountyEdits] = React.useState<Record<number, { coins: number; kidId: string }>>(() =>
    Object.fromEntries((result.newSuggestedQuests ?? []).map((q: any, i: number) => [i, { coins: q.coins ?? 20, kidId: '' }]))
  );

  const surfaceBg = isDark ? '#1A1040' : '#F5F3FF';
  const greenBg   = isDark ? '#0B2218' : '#F0FDF4';

  return (
    <AiCard accentColor={accent} isDark={isDark} colors={colors} onClose={onClose}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: accent + '30' }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>
          <I.Sparkles c={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: accent }}>AI Chore Balancer</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>Powered by AI · adjust before applying</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <I.X c={colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {/* Summary bubble */}
      <View style={{ borderRadius: 14, backgroundColor: accent + '18', borderWidth: 1, borderColor: accent + '35', padding: 14 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: isDark ? '#C4B5FD' : '#5B21B6', lineHeight: 22 }}>✨ {result.summary}</Text>
      </View>

      {/* Reassignment section */}
      {(result.assignments ?? []).length > 0 && (
        <>
          <AiSectionDivider label="Reassign Suggestions" color={BRAND.amber} icon={<I.RotateCcw c={BRAND.amber} />} />
          {(result.assignments ?? []).map((item: any, idx: number) => {
            const applied = appliedActions[`bal_${idx}`];
            const selectedKidId = assignEdits[idx] ?? '';
            return (
              <View key={idx} style={{ borderRadius: 16, backgroundColor: surfaceBg, borderWidth: 1, borderColor: accent + '30', overflow: 'hidden' }}>
                <View style={{ padding: 14, paddingBottom: 10 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{item.questTitle}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: accent, marginTop: 4, lineHeight: 19 }}>💡 {item.reason}</Text>
                </View>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>→</Text>
                    {/* Pool chip */}
                    <TouchableOpacity disabled={applied} onPress={() => setAssignEdits(p => ({ ...p, [idx]: '' }))}
                      style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: selectedKidId === '' ? '#64748B' : (isDark ? '#1E293B' : '#E2E8F0'), borderWidth: 1.5, borderColor: selectedKidId === '' ? '#64748B' : colors.border }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: selectedKidId === '' ? '#fff' : colors.textSecondary }}>🌊</Text>
                    </TouchableOpacity>
                    {/* Kid avatar chips */}
                    {kids.map((k: any) => {
                      const sel = selectedKidId === k.id;
                      const isAiPick = k.id === item.recommendedKidId;
                      return (
                        <TouchableOpacity key={k.id} disabled={applied} onPress={() => setAssignEdits(p => ({ ...p, [idx]: k.id }))}
                          style={{ position: 'relative' }}>
                          <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} size={36}
                            ringColor={sel ? accent : (isAiPick ? accent : colors.border)} ringWidth={sel ? 2.5 : (isAiPick ? 1.5 : 1)} />
                          {isAiPick && !sel && <Text style={{ position: 'absolute', top: -4, right: -4, fontSize: 10 }}>⭐</Text>}
                        </TouchableOpacity>
                      );
                    })}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {applied
                        ? <View style={{ backgroundColor: '#059669', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>✓ Done</Text>
                          </View>
                        : <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 5 }}
                            onPress={() => onApply(`bal_${idx}`, { ...item, recommendedKidId: selectedKidId || null, isPool: !selectedKidId }, 'reassign')}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>Apply ⚡</Text>
                          </TouchableOpacity>}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* New bounties section */}
      {(result.newSuggestedQuests ?? []).length > 0 && (
        <>
          <AiSectionDivider label="New Bounties" color="#10B981" icon={<I.Zap c="#10B981" size={12} />} />
          {(result.newSuggestedQuests ?? []).map((q: any, idx: number) => {
            const applied = appliedActions[`bounty_${idx}`];
            const edit = bountyEdits[idx] ?? { coins: q.coins ?? 20, kidId: '' };
            return (
              <View key={idx} style={{ borderRadius: 16, backgroundColor: greenBg, borderWidth: 1, borderColor: '#10B98140', overflow: 'hidden' }}>
                <View style={{ padding: 14, paddingBottom: 10 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#059669' }}>{q.title}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: '#34D399', marginTop: 4, lineHeight: 19 }}>💡 {q.reason}</Text>
                </View>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                  {/* Coin stepper */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>Coins:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.amber + '22', borderRadius: 24, borderWidth: 1.5, borderColor: BRAND.amber + '50', overflow: 'hidden' }}>
                      <TouchableOpacity disabled={applied}
                        onPress={() => setBountyEdits(p => ({ ...p, [idx]: { ...edit, coins: Math.max(5, edit.coins - 5) } }))}
                        style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: BRAND.amber, fontWeight: '900', fontSize: 20 }}>−</Text>
                      </TouchableOpacity>
                      <Text style={{ color: BRAND.amber, fontWeight: '900', fontSize: TYPO.body, minWidth: 48, textAlign: 'center' }}>{edit.coins}🪙</Text>
                      <TouchableOpacity disabled={applied}
                        onPress={() => setBountyEdits(p => ({ ...p, [idx]: { ...edit, coins: Math.min(200, edit.coins + 5) } }))}
                        style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: BRAND.amber, fontWeight: '900', fontSize: 20 }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* Kid picker + Add button — compact emoji chips in one row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>→</Text>
                    <TouchableOpacity disabled={applied} onPress={() => setBountyEdits(p => ({ ...p, [idx]: { ...edit, kidId: '' } }))}
                      style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: edit.kidId === '' ? '#64748B' : (isDark ? '#1E293B' : '#E2E8F0'), borderWidth: 1.5, borderColor: edit.kidId === '' ? '#64748B' : colors.border }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: edit.kidId === '' ? '#fff' : colors.textSecondary }}>🌊</Text>
                    </TouchableOpacity>
                    {kids.map((k: any) => {
                      const sel = edit.kidId === k.id;
                      return (
                        <TouchableOpacity key={k.id} disabled={applied} onPress={() => setBountyEdits(p => ({ ...p, [idx]: { ...edit, kidId: k.id } }))}>
                          <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} size={36}
                            ringColor={sel ? '#10B981' : colors.border} ringWidth={sel ? 2.5 : 1} />
                        </TouchableOpacity>
                      );
                    })}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {applied
                        ? <View style={{ backgroundColor: '#059669', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>✓ Added</Text>
                          </View>
                        : <TouchableOpacity style={{ backgroundColor: '#10B981', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}
                            onPress={() => onApply(`bounty_${idx}`, { ...q, coins: edit.coins, assignedToId: edit.kidId || null, isPool: !edit.kidId }, 'bounty')}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>➕ Add</Text>
                          </TouchableOpacity>}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}
    </AiCard>
  );
}

export function FomoCard({ result, onApply, appliedActions, onClose, isDark, colors, kids }: any) {
  const amber = BRAND.amber;
  const allActive = result.urgentAlerts.length > 0 &&
    result.urgentAlerts.every((a: any, i: number) => a.alreadyHasBonus || appliedActions[`fomo_${i}`]);

  const [bonusEdits, setBonusEdits] = React.useState<Record<number, number>>(() =>
    Object.fromEntries((result.urgentAlerts ?? []).map((a: any, i: number) => [i, a.bonusCoins]))
  );
  const [penEdits, setPenEdits] = React.useState<Record<number, string>>(() =>
    Object.fromEntries((result.penaltiesAndForceAssigns ?? []).map((p: any, i: number) => [i, p.targetKidId ?? '']))
  );

  return (
    <AiCard accentColor={amber} isDark={isDark} colors={colors} onClose={onClose}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: amber + '30' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: amber + '22', alignItems: 'center', justifyContent: 'center' }}>
          <I.Flame c={amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: amber }}>Spark Engine</Text>
          <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>Flash bonuses · penalties · force-assign</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <I.X c={colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={{ borderRadius: 14, backgroundColor: amber + '18', borderWidth: 1, borderColor: amber + '35', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <I.Flame c={amber} />
        <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '600', color: isDark ? '#FDE68A' : '#92400E', lineHeight: 22 }}>
          {result.fomoNudgeSummary}
        </Text>
        {allActive && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <I.CheckCircle c="#10B981" />
            <Text style={{ fontSize: TYPO.caption, color: '#10B981', fontWeight: '700' }}>All bonuses active</Text>
          </View>
        )}
      </View>

      {/* Flash bonuses */}
      {(result.urgentAlerts ?? []).length > 0 && (
        <>
          <AiSectionDivider label="Flash Bonuses" color={amber} icon={<I.Sparkles c={amber} />} />
          {(result.urgentAlerts ?? []).map((alert: any, idx: number) => {
            const isActive = alert.alreadyHasBonus || appliedActions[`spark_${idx}`];
            const editedCoins = bonusEdits[idx] ?? alert.bonusCoins;
            return (
              <View key={idx} style={{ borderRadius: 16, borderWidth: 1, backgroundColor: isDark ? '#1C1200' : '#FFFBEB', borderColor: isActive ? amber + '80' : amber + '35', overflow: 'hidden' }}>
                <View style={{ padding: 14, paddingBottom: 10 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{alert.questTitle}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: isDark ? '#FDE68A' : '#92400E', marginTop: 4, lineHeight: 19 }}>{alert.fomoMessage}</Text>
                </View>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  {isActive
                    ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: amber + '25', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5, borderColor: amber, alignSelf: 'flex-start' }}>
                        <I.Sparkles c={amber} />
                        <Text style={{ color: amber, fontSize: TYPO.caption, fontWeight: '900' }}>+{editedCoins} coins Active!</Text>
                      </View>
                    : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>Bonus:</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: amber + '22', borderRadius: 24, borderWidth: 1.5, borderColor: amber + '50', overflow: 'hidden' }}>
                          <TouchableOpacity onPress={() => setBonusEdits(p => ({ ...p, [idx]: Math.max(5, editedCoins - 5) }))}
                            style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: amber, fontWeight: '900', fontSize: 20 }}>−</Text>
                          </TouchableOpacity>
                          <Text style={{ color: amber, fontWeight: '900', fontSize: TYPO.body, minWidth: 48, textAlign: 'center' }}>+{editedCoins}</Text>
                          <TouchableOpacity onPress={() => setBonusEdits(p => ({ ...p, [idx]: Math.min(100, editedCoins + 5) }))}
                            style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: amber, fontWeight: '900', fontSize: 20 }}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: amber, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 }}
                            onPress={() => Alert.alert(
                              'Activate Spark Bonus?',
                              `Add +${editedCoins} coin spark bonus to "${alert.questTitle}"?\n\nMotivates kids to act now. Cannot be reversed.`,
                              [{ text: 'Cancel', style: 'cancel' }, { text: 'Activate', onPress: () => onApply(`spark_${idx}`, { ...alert, bonusCoins: editedCoins }, 'spark') }]
                            )}>
                            <I.Sparkles c="#0F172A" />
                            <Text style={{ color: '#0F172A', fontSize: TYPO.caption, fontWeight: '900' }}>Activate</Text>
                          </TouchableOpacity>
                        </View>
                      </View>}
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Force assigns */}
      {(result.penaltiesAndForceAssigns ?? []).length > 0 && (
        <>
          <AiSectionDivider label="Overdue Actions" color="#EF4444" icon={<I.AlertTriangle c="#EF4444" size={12} />} />
          {(result.penaltiesAndForceAssigns ?? []).map((pen: any, idx: number) => {
            const applied = appliedActions[`pen_${idx}`];
            const selectedKidId = penEdits[idx] ?? pen.targetKidId ?? '';
            return (
              <View key={idx} style={{ borderRadius: 16, borderWidth: 1, backgroundColor: isDark ? '#200808' : '#FEF2F2', borderColor: '#EF444450', overflow: 'hidden' }}>
                <View style={{ padding: 14, paddingBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, flex: 1 }}>{pen.questTitle}</Text>
                    <View style={{ backgroundColor: '#EF444422', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#EF4444' }}>🔴 {pen.daysOverdue}d overdue</Text>
                    </View>
                  </View>
                  {pen.penaltyReason && (
                    <Text style={{ fontSize: TYPO.caption, color: '#EF4444', lineHeight: 19 }}>{pen.penaltyReason}</Text>
                  )}
                </View>
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>→</Text>
                    {kids.map((k: any) => {
                      const sel = selectedKidId === k.id;
                      const isAiPick = k.id === pen.targetKidId;
                      return (
                        <TouchableOpacity key={k.id} disabled={applied} onPress={() => setPenEdits(p => ({ ...p, [idx]: k.id }))}
                          style={{ position: 'relative' }}>
                          <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} size={36}
                            ringColor={sel ? '#EF4444' : (isAiPick ? '#EF4444' : colors.border)} ringWidth={sel ? 2.5 : (isAiPick ? 1.5 : 1)} />
                          {isAiPick && !sel && <Text style={{ position: 'absolute', top: -4, right: -4, fontSize: 10 }}>⭐</Text>}
                        </TouchableOpacity>
                      );
                    })}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {applied
                        ? <View style={{ backgroundColor: '#EF4444', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>Assigned</Text>
                          </View>
                        : <TouchableOpacity style={{ backgroundColor: '#EF4444', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}
                            onPress={() => Alert.alert(
                              'Force Assign?',
                              `Force-assign "${pen.questTitle}" to ${kids.find((k: any) => k.id === selectedKidId)?.name ?? 'this kid'}?\n\nThis overrides the current assignment.`,
                              [{ text: 'Cancel', style: 'cancel' }, { text: 'Force Assign', style: 'destructive', onPress: () => onApply(`pen_${idx}`, { ...pen, targetKidId: selectedKidId }, 'penalty') }]
                            )}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>Force ⚡</Text>
                          </TouchableOpacity>}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}
    </AiCard>
  );
}

export function AdviceCard({ result, appliedActions, onApply, onClose, isDark, colors }: any) {
  const accent  = '#6366F1';
  const indigo  = isDark ? '#1E1B4B' : '#EEF2FF';
  const entries = Object.entries(result.kidEncouragementNotes ?? {});
  const ruleUpdates: string[] = result.suggestedRuleUpdates ?? [];

  return (
    <AiCard accentColor={accent} isDark={isDark} colors={colors} onClose={onClose}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: accent + '30' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>
          <I.Award c={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: accent }}>Family Advisor</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>AI coaching based on real quest data</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <I.X c={colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {/* Coaching tip */}
      <View style={{ borderRadius: 14, backgroundColor: accent + '18', borderWidth: 1, borderColor: accent + '35', padding: 14 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: accent, marginBottom: 6 }}>💡 Family Coaching Tip</Text>
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: isDark ? '#C7D2FE' : '#3730A3', lineHeight: 22 }}>{result.familyCoachingTip}</Text>
      </View>

      {/* Cheat pattern alert */}
      {result.cheatPatternAlert && (
        <View style={{ borderRadius: 14, backgroundColor: '#EF444418', borderWidth: 1, borderColor: '#EF444440', padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <I.AlertTriangle c="#EF4444" size={12} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: '#EF4444' }}>Pattern Detected</Text>
          </View>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: isDark ? '#FCA5A5' : '#991B1B', lineHeight: 22 }}>{result.cheatPatternAlert}</Text>
        </View>
      )}

      {/* Top performer */}
      {result.topPerformer && (
        <View style={{ borderRadius: 14, backgroundColor: BRAND.amber + '18', borderWidth: 1, borderColor: BRAND.amber + '35', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 28 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: BRAND.amber }}>Top Performer This Week</Text>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: isDark ? '#FDE68A' : '#92400E', marginTop: 3 }}>{result.topPerformer}</Text>
          </View>
        </View>
      )}

      {/* Per-kid notes */}
      {entries.length > 0 && (
        <>
          <AiSectionDivider label="Kid Notes" color={accent} icon={<I.User c={accent} size={12} />} />
          {entries.map(([kid, note]: [string, any]) => (
            <View key={kid} style={{ borderRadius: 14, backgroundColor: indigo, borderWidth: 1, borderColor: accent + '30', padding: 14 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: accent, marginBottom: 5 }}>{kid}</Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '400', color: colors.textSecondary, lineHeight: 22 }}>{note}</Text>
            </View>
          ))}
        </>
      )}

      {/* Suggested rule updates */}
      {ruleUpdates.length > 0 && (
        <>
          <AiSectionDivider label="Suggested Rules" color="#10B981" icon={<I.CheckCircle c="#10B981" />} />
          {ruleUpdates.map((rule, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4 }}>
              <Text style={{ color: '#10B981', fontWeight: '900', fontSize: TYPO.body, marginTop: 2 }}>→</Text>
              <Text style={{ flex: 1, fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 22 }}>{rule}</Text>
            </View>
          ))}
        </>
      )}

      {/* Share to family chat */}
      <View style={{ alignItems: 'flex-end', marginTop: 4 }}>
        {appliedActions['advice_chat']
          ? <View style={{ backgroundColor: accent, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '900' }}>✓ Posted to Family Chat</Text>
            </View>
          : <TouchableOpacity
              style={{ backgroundColor: accent, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }}
              onPress={() => onApply('advice_chat', result)}
            >
              <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '900' }}>📢 Share with Family</Text>
            </TouchableOpacity>}
      </View>
    </AiCard>
  );
}

const ai = StyleSheet.create({
  card:       { borderRadius: 24, borderWidth: 1, backgroundColor: '#0F172A', padding: 14, marginHorizontal: 14, marginBottom: 12, gap: 8 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 8 },
  headerText: { fontSize: TYPO.label, fontWeight: '900', flex: 1 },
  summary:    { fontSize: TYPO.label, fontWeight: '600', lineHeight: 16, color: '#CBD5E1' },
  infoBox:    { borderRadius: 14, borderWidth: 1, padding: 10 },
  sectionLabel: { fontSize: TYPO.micro + 1, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, color: '#94A3B8' },
  row:        { borderRadius: 14, backgroundColor: '#1E293B', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fomoRow:    { borderRadius: 14, borderWidth: 1, padding: 10, backgroundColor: '#1C1000', borderColor: '#FCD34D40', marginBottom: 6 },
  rowTitle:   { fontSize: TYPO.label, fontWeight: '700' },
  rowSub:     { fontSize: TYPO.micro + 1, marginTop: 2 },
  chip:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  chipText:   { fontSize: TYPO.micro + 1, fontWeight: '900' },
  doneChip:   { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  doneText:   { color: '#fff', fontSize: TYPO.micro + 1, fontWeight: '900' },
  applyBtn:   { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  applyText:  { color: '#fff', fontSize: TYPO.micro + 1, fontWeight: '900' },
  divider:    { borderTopWidth: 1, marginVertical: 2 },
});
