import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MOOD_COLOR , TYPO } from '@/constants/theme';
import { ScoreRing } from './ScoreRing';
import { BarRow } from './BarRow';
import { makeStyles } from './moodCameraStyles';
import { MoodLabel, MoodResult, MoodResult as MR, MOOD_EMOJI_MAP, MOOD_GRADIENT } from './moodCameraUtils';

interface Props {
  result: MR;
  moodColor: string;
  moodGrad: [string, string];
  colors: any;
  isDark: boolean;
  ac: string;
  selectedMood: MoodLabel | null;
  setSelectedMood: (m: MoodLabel | null) => void;
  saving: boolean;
  onSave: (mood?: MoodLabel) => void;
  onRetake: () => void;
}

export const MoodResultCard = React.memo(function MoodResultCard({
  result, moodColor, moodGrad, colors, isDark, ac,
  selectedMood, setSelectedMood, saving, onSave, onRetake,
}: Props) {
  const s = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={[s.resultCard, { backgroundColor: colors.card, borderColor: `${moodColor}30` }]}>

      <LinearGradient colors={moodGrad} style={s.moodHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={s.moodMainRow}>
          <View>
            <Text style={s.moodEmoji}>{MOOD_EMOJI_MAP[result.mood_label]}</Text>
            <Text style={s.moodLabel}>
              {result.mood_label.charAt(0).toUpperCase() + result.mood_label.slice(1)}
            </Text>
            <Text style={s.moodSub}>mood detected</Text>
          </View>
          <ScoreRing score={result.mood_score} color="rgba(255,255,255,0.95)" size={90} />
        </View>
      </LinearGradient>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Ionicons name="bar-chart-outline" size={14} color={colors.textSecondary} />
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>EMOTION BREAKDOWN</Text>
        </View>
        <BarRow label="Happy"   pct={result.happy_pct}   color={colors.primaryText ?? colors.primary}     delay={0}   />
        <BarRow label="Playful" pct={result.playful_pct} color={colors.accent}       delay={120} />
        <BarRow label="Tired"   pct={result.tired_pct}   color={colors.textTertiary} delay={240} />
        <BarRow label="Anxious" pct={result.anxious_pct} color={colors.danger}       delay={360} />
      </View>

      <View style={[s.notesBox, { backgroundColor: `${moodColor}12`, borderColor: `${moodColor}25` }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color={moodColor} />
        <Text style={[s.notesText, { color: colors.textPrimary }]}>{result.notes}</Text>
      </View>

      {(result.situation || (result.advice?.length ?? 0) > 0) && (
        <View style={s.section}>
          {result.situation && (
            <View style={[s.situationBox, { backgroundColor: isDark ? colors.surface : colors.primaryLight, borderColor: `${moodColor}20` }]}>
              <Text style={{ fontSize: TYPO.body }}>💡</Text>
              <Text style={[s.situationTxt, { color: colors.textPrimary }]}>{result.situation}</Text>
            </View>
          )}
          {(result.advice?.length ?? 0) > 0 && (
            <View style={{ gap: 8, marginTop: 4 }}>
              <View style={s.sectionHeader}>
                <Ionicons name="list-outline" size={14} color={colors.textSecondary} />
                <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>WHAT YOU CAN DO</Text>
              </View>
              {result.advice!.map((item, i) => {
                const pc = item.priority === 'now' ? colors.danger : item.priority === 'today' ? '#F59E0B' : moodColor;
                return (
                  <View key={i} style={[s.adviceRow, { backgroundColor: isDark ? colors.surface : `${pc}08`, borderColor: `${pc}25` }]}>
                    <View style={[s.priorityDot, { backgroundColor: pc }]}>
                      <Text style={s.priorityLabel}>
                        {item.priority === 'now' ? '!' : item.priority === 'today' ? '·' : '↻'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.adviceAction, { color: colors.textPrimary }]}>{item.action}</Text>
                      <Text style={[s.adviceDetail, { color: colors.textSecondary }]}>{item.detail}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {(result as any)?._logId ? (
        <TouchableOpacity
          style={[s.saveBtn, { backgroundColor: moodColor }]}
          onPress={() => router.navigate({ pathname: '/(tabs)/care', params: { section: 'notes' } } as any)}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
          <Text style={s.saveBtnTxt}>Done — Saved automatically</Text>
        </TouchableOpacity>
      ) : (
        <>
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>ADJUST MOOD IF NEEDED</Text>
            <View style={s.moodPills}>
              {(['happy','playful','calm','tired','anxious','grumpy'] as MoodLabel[]).map(m => {
                const active = (selectedMood ?? result.mood_label) === m;
                const mc = MOOD_COLOR[m] ?? ac;
                return (
                  <TouchableOpacity key={m} onPress={() => setSelectedMood(m)}
                    style={[s.moodPill, { backgroundColor: active ? mc : `${mc}18`, borderColor: active ? mc : `${mc}35` }]}>
                    <Text style={{ fontSize: TYPO.body }}>{MOOD_EMOJI_MAP[m]}</Text>
                    <Text style={[s.moodPillTxt, { color: active ? '#fff' : mc }]}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[s.retakeBtn, { backgroundColor: isDark ? colors.surface : colors.inputBg, borderColor: colors.border }]}
              onPress={onRetake}>
              <Ionicons name="camera-reverse-outline" size={16} color={colors.textSecondary} />
              <Text style={[s.retakeTxt, { color: colors.textSecondary }]}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { flex: 2, backgroundColor: MOOD_COLOR[selectedMood ?? result.mood_label] ?? moodColor, opacity: saving ? 0.75 : 1 }]}
              onPress={() => onSave(selectedMood ?? undefined)} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={s.saveBtnTxt}>Save to Memories</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
});
