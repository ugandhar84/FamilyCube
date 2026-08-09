import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { getTimelineEntries, generatePetTimeline, createTimelineShare, getGenerationCountsPerYear } from '@/lib/db/timeline';
import { showAlert } from '@/components/AppAlert';

interface TimelineEntry {
  id: string;
  title: string;
  description: string;
  event_date: string;
  category: 'milestone' | 'health' | 'achievement' | 'moment';
  is_pinned: boolean;
}

function getCatColor(colors: any): Record<string, string> {
  return {
    milestone:   colors.primary,
    health:      colors.danger,
    achievement: colors.warning,
    moment:      colors.info,
  };
}
function getCatBg(colors: any): Record<string, string> {
  return {
    milestone:   colors.primaryLight,
    health:      colors.dangerLight,
    achievement: colors.warningLight,
    moment:      colors.infoLight,
  };
}
const CAT_ICON: Record<string, string> = {
  milestone:   'star',
  health:      'heart',
  achievement: 'checkmark-circle',
  moment:      'camera',
};

const MAX_ATTEMPTS = 2;

function getAvailableYears(): number[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const lastComplete = (now.getMonth() === 11 && now.getDate() === 31)
    ? currentYear
    : currentYear - 1;
  return [lastComplete, lastComplete - 1].filter(y => y >= 2020);
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch { return dateStr; }
}

export default function PetTimeline({
  petId,
  petName,
  isProUser,
}: {
  petId: string;
  petName: string;
  isProUser: boolean;
}) {
  const { colors, isDark } = useTheme();
  const years = getAvailableYears();
  const [selectedYear, setSelectedYear] = useState(years[0]);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [genCounts, setGenCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [data, counts] = await Promise.all([
        getTimelineEntries(petId, selectedYear),
        getGenerationCountsPerYear(petId),
      ]);
      setEntries(data);
      setGenCounts(counts);
    } catch (err: any) {
      console.error('[PetTimeline]', err);
    } finally {
      setLoading(false);
    }
  }, [petId, selectedYear]);

  useEffect(() => { load(); }, [load]);

  const attemptsUsed = genCounts[selectedYear] ?? 0;
  const attemptsLeft = MAX_ATTEMPTS - attemptsUsed;
  const isExhausted  = attemptsLeft <= 0;
  const hasEntries   = entries.length > 0;

  const handleGenerate = useCallback(async () => {
    if (!isProUser) {
      showAlert('Pro feature', 'Timeline generation is available for Pro users.');
      return;
    }
    if (isExhausted) return;

    const doGenerate = async () => {
      try {
        setGenerating(true);
        await generatePetTimeline(petId, selectedYear);
        await load();
      } catch (err: any) {
        showAlert('Error', err.message ?? 'Failed to generate timeline');
      } finally {
        setGenerating(false);
      }
    };

    if (attemptsLeft === 1) {
      showAlert(
        hasEntries ? 'Regenerate timeline?' : 'Generate timeline?',
        `This is your last attempt for ${selectedYear}. After this, the timeline will be locked for this year.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: hasEntries ? 'Regenerate' : 'Generate', onPress: doGenerate }],
      );
    } else {
      doGenerate();
    }
  }, [isProUser, isExhausted, hasEntries, attemptsLeft, selectedYear, petId, load]);

  const handleShare = useCallback(async () => {
    if (!isProUser) return;
    try {
      setGenerating(true);
      const token = await createTimelineShare(petId);
      const url = `https://pawbond.app/timeline/${token}`;
      await Share.share({ message: `Check out ${petName}'s ${selectedYear} timeline! 🐾\n\n${url}`, url });
    } catch (err: any) {
      showAlert('Error', err.message ?? 'Failed to share');
    } finally {
      setGenerating(false);
    }
  }, [isProUser, petId, petName, selectedYear]);

  return (
    <View style={[s.container, { backgroundColor: colors.card }]}>

      {/* Header */}
      <View style={s.headerRow}>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{petName}'s story</Text>
        {isProUser && hasEntries && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: colors.border }]}
              onPress={handleShare}
              disabled={generating}>
              <Ionicons name="share-social-outline" size={15} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: colors.border }]}
              onPress={() => showAlert('Coming soon', 'PDF export will be available soon!')}>
              <Ionicons name="document-outline" size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Year selector */}
      <View style={s.yearRow}>
        {years.map(yr => {
          const used     = genCounts[yr] ?? 0;
          const done     = used >= MAX_ATTEMPTS;
          const isActive = yr === selectedYear;
          return (
            <TouchableOpacity
              key={yr}
              onPress={() => setSelectedYear(yr)}
              style={[
                s.yearBtn,
                { borderColor: isActive ? colors.primary : colors.border },
                isActive  && { backgroundColor: isDark ? colors.surface : colors.primaryLight },
                !isActive && { backgroundColor: colors.background },
                done && !isActive && { opacity: 0.5 },
              ]}>
              <Text style={[s.yearLabel, { color: isActive ? colors.primary : colors.textPrimary }]}>{yr}</Text>
              <Text style={[s.yearSub, { color: isActive ? colors.primary : colors.textTertiary }]}>
                {done ? 'Generated ✓' : used === 1 ? '1 attempt left' : 'Not yet'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Timeline title */}
      {hasEntries && (
        <Text style={[s.timelineHeading, { color: colors.textPrimary, borderBottomColor: colors.border }]}>
          {petName.toUpperCase()}'S {selectedYear}
        </Text>
      )}

      {/* Content */}
      {loading ? (
        <View style={{ paddingVertical: 28, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.primaryText ?? colors.primary} />
        </View>
      ) : !hasEntries ? (
        /* ── Empty state ── */
        <View style={[s.emptyBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Ionicons name="albums-outline" size={30} color={colors.textTertiary} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No {selectedYear} timeline yet</Text>
          <Text style={[s.emptySub, { color: colors.textSecondary }]}>
            AI will scan {petName}'s {selectedYear} journal — notes, vet visits, moods — and pick the moments worth remembering.
          </Text>
          {isProUser && !isExhausted && (
            <TouchableOpacity
              style={[s.generateBtn, { backgroundColor: colors.primary }]}
              onPress={handleGenerate}
              disabled={generating}>
              {generating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                  <Text style={s.generateBtnText}>Generate {selectedYear}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* ── Vertical timeline ── */
        <View style={{ paddingTop: 8 }}>
          {entries.map((entry, idx) => {
            const isLast  = idx === entries.length - 1;
            const color   = getCatColor(colors)[entry.category] ?? colors.primary;
            const bg      = getCatBg(colors)[entry.category]    ?? colors.primaryLight;
            const icon    = CAT_ICON[entry.category]  ?? 'star';

            return (
              <View key={entry.id} style={s.row}>
                {/* Left — date */}
                <Text style={[s.entryDate, { color: colors.textTertiary }]}>{formatDate(entry.event_date)}</Text>

                {/* Centre — dot + vertical line */}
                <View style={s.lineCol}>
                  <View style={[s.dot, { backgroundColor: bg, borderColor: color }]}>
                    <Ionicons name={icon as any} size={13} color={color} />
                  </View>
                  {!isLast && <View style={[s.line, { backgroundColor: colors.border }]} />}
                </View>

                {/* Right — title + description */}
                <View style={[s.entryBody, { paddingBottom: isLast ? 0 : 20 }]}>
                  <Text style={[s.entryTitle, { color: colors.textPrimary }]}>{entry.title}</Text>
                  {entry.description ? (
                    <Text style={[s.entryDesc, { color: colors.textSecondary }]}>{entry.description}</Text>
                  ) : null}
                  <View style={[s.catBadge, { backgroundColor: bg }]}>
                    <Text style={[s.catText, { color }]}>{entry.category}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Footer — attempt counter + action */}
      {isProUser && (
        <View style={[s.footer, { borderTopColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {[0, 1].map(i => (
              <View key={i} style={[s.dot2, { backgroundColor: i < attemptsUsed ? colors.primary : colors.border }]} />
            ))}
            <Text style={[s.footerLabel, { color: colors.textTertiary }]}>
              {isExhausted ? 'Max attempts reached' : attemptsUsed === 0 ? '2 attempts available' : '1 attempt left'}
            </Text>
          </View>

          {isExhausted ? (
            <View style={[s.lockedBadge, { backgroundColor: isDark ? colors.surface : colors.primaryLight }]}>
              <Ionicons name="lock-closed" size={11} color={colors.primaryText ?? colors.primary} />
              <Text style={{ color: colors.primaryText ?? colors.primary, fontSize: 14, fontWeight: '600' }}>Locked</Text>
            </View>
          ) : hasEntries ? (
            <TouchableOpacity
              style={[s.regenBtn, { backgroundColor: colors.border }]}
              onPress={handleGenerate}
              disabled={generating}>
              <Ionicons name="refresh" size={12} color={colors.textSecondary} />
              <Text style={[s.regenText, { color: colors.textSecondary }]}>
                {generating ? 'Regenerating…' : 'Regenerate'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:       { marginHorizontal: 12, marginTop: 16, borderRadius: 14, padding: 14 },
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:    { fontSize: 15, fontWeight: '700' },
  iconBtn:         { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  yearRow:         { flexDirection: 'row', gap: 8, marginBottom: 14 },
  yearBtn:         { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  yearLabel:       { fontSize: 14, fontWeight: '700' },
  yearSub:         { fontSize: 14, fontWeight: '500', marginTop: 2 },
  timelineHeading: { fontSize: 15, fontWeight: '800', letterSpacing: 1, textAlign: 'center',
                     paddingBottom: 14, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  /* empty */
  emptyBox:        { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', padding: 20, alignItems: 'center', gap: 8, marginTop: 4 },
  emptyTitle:      { fontSize: 14, fontWeight: '600', marginTop: 4 },
  emptySub:        { fontSize: 14, textAlign: 'center', lineHeight: 17, maxWidth: 240 },
  generateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6,
                     paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, marginTop: 4 },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  /* vertical timeline */
  row:             { flexDirection: 'row', alignItems: 'flex-start' },
  entryDate:       { width: 48, fontSize: 14, fontWeight: '600', paddingTop: 6, textAlign: 'right', paddingRight: 10, flexShrink: 0 },
  lineCol:         { alignItems: 'center', width: 30, flexShrink: 0 },
  dot:             { width: 30, height: 30, borderRadius: 9, borderWidth: 1.5,
                     alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  line:            { width: 1.5, flex: 1, minHeight: 20 },
  entryBody:       { flex: 1, paddingLeft: 10 },
  entryTitle:      { fontSize: 15, fontWeight: '700', lineHeight: 18, marginBottom: 4 },
  entryDesc:       { fontSize: 14, lineHeight: 17, marginBottom: 6 },
  catBadge:        { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  catText:         { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  /* footer */
  footer:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                     marginTop: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  dot2:            { width: 8, height: 8, borderRadius: 4 },
  footerLabel:     { fontSize: 14, fontWeight: '500' },
  regenBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  regenText:       { fontSize: 14, fontWeight: '600' },
  lockedBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
});
