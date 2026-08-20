import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { previewAssignment, resolveDomainFromLooseLabel, type AssignmentSuggestion } from '@/lib/responsibilityCategories';
import type { EventCategory } from './types';

// ─── Assignment suggestion — calls the live Responsibility Engine
//      (process-task-assignment) so a parent can see who this would
//      likely go to before saving. Always a dry run — nothing is
//      assigned or written until the form is actually submitted. ──
export default function AssignmentSuggestionCard({
  colors, isDark, familyId, category, subcategoryId,
  loadingSuggestion, setLoadingSuggestion,
  assignmentSuggestion, setAssignmentSuggestion,
}: {
  colors: any; isDark: boolean; familyId: string;
  category: EventCategory; subcategoryId: string | null;
  loadingSuggestion: boolean; setLoadingSuggestion: (v: boolean) => void;
  assignmentSuggestion: AssignmentSuggestion | null; setAssignmentSuggestion: (v: AssignmentSuggestion | null) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <TouchableOpacity
        onPress={async () => {
          setLoadingSuggestion(true);
          setAssignmentSuggestion(null);
          const result = await previewAssignment({
            taskId: `preview-${Date.now()}`,
            taskType: 'event',
            familyId,
            category: subcategoryId ?? resolveDomainFromLooseLabel(category),
          });
          setAssignmentSuggestion(result);
          setLoadingSuggestion(false);
        }}
        disabled={loadingSuggestion}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          borderRadius: 14, paddingVertical: 11, borderWidth: 1.5, borderStyle: 'dashed',
          borderColor: BRAND.purple + '60', backgroundColor: isDark ? colors.surface : '#F8F5FF',
          opacity: loadingSuggestion ? 0.6 : 1,
        }}
      >
        {loadingSuggestion
          ? <ActivityIndicator size="small" color={BRAND.purple} />
          : <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>
              ✨ Who would this go to?
            </Text>
        }
      </TouchableOpacity>

      {assignmentSuggestion && (
        <View style={{
          marginTop: 8, borderRadius: 14, padding: 12,
          backgroundColor: isDark ? colors.surface : '#F8FAFC',
          borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
        }}>
          {assignmentSuggestion.error ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
              {assignmentSuggestion.error}
            </Text>
          ) : assignmentSuggestion.decisionType === 'blocked' ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
              {assignmentSuggestion.reason ?? 'No eligible family member found for this.'}
            </Text>
          ) : (
            <>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                {assignmentSuggestion.decisionType === 'auto' ? '✅ Would auto-assign to ' :
                 assignmentSuggestion.decisionType === 'suggest' ? '💡 Suggested: ' : '🤔 Close call — '}
                {assignmentSuggestion.explanation.selected ?? '—'}
              </Text>
              {assignmentSuggestion.candidates.filter(c => !c.excluded).length > 1 && (
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 3 }}>
                  {assignmentSuggestion.candidates
                    .filter(c => !c.excluded)
                    .map(c => `${c.memberName} (${Math.round(c.score)})`)
                    .join(' · ')}
                </Text>
              )}
              {assignmentSuggestion.explanation.excludedReasons.length > 0 && (
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4 }}>
                  {assignmentSuggestion.explanation.excludedReasons.map(e => `${e.member}: ${e.reason}`).join(' · ')}
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}
