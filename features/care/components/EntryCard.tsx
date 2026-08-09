import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LazyImage from '@/components/LazyImage';
import { showAlert } from '@/components/AppAlert';
import { MOOD_COLOR, TYPO} from '@/constants/theme';
import { format, parseISO } from 'date-fns';
import { formatTime } from '@/lib/units';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TypeIcon } from './TypeIcon';
import {
  type EntryType, type JournalEntry,
  TYPE_LABEL, MOOD_EMOJI, GROOM_LABEL, MEAL_EMOJI,
} from './journalTypes';

export const EntryCard = React.memo(function EntryCard({ entry, colors, isDark, typeColors, onEdit, onDelete }: {
  entry: JournalEntry; colors: any; isDark: boolean; typeColors: Record<EntryType, string>;
  onEdit?: () => void; onDelete?: () => void;
}) {
  const tc = typeColors[entry.type];
  const [photoError, setPhotoError]       = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [aiExpanded, setAiExpanded]       = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState(false);
  const insets = useSafeAreaInsets();

  const timeStr = (() => {
    try {
      const ts = entry.timestamp;
      if (!ts.includes('T')) return null; // date-only string (e.g. grooming done_at)
      if (/T(00|08|09|12):00:00/.test(ts)) return null;
      return formatTime(parseISO(ts));
    } catch { return null; }
  })();

  const metaParts = [
    timeStr,
    entry.authorName ? `by ${entry.authorName}` : null,
    entry.editedAt ? 'edited' : null,
  ].filter(Boolean).join('  ·  ');

  if (entry.type === 'milestone') {
    return (
      <LinearGradient
        colors={[`${tc}20`, `${tc}08`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[ec.card, { borderWidth: 1.5, borderColor: `${tc}50` }]}>
        <View style={ec.content}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: TYPO.title }}>🏆</Text>
            <View style={{ flex: 1 }}>
              <Text style={[ec.title, { color: tc }]}>{entry.title}</Text>
              {entry.dayCount != null && <Text style={{ fontSize: TYPO.body, color: `${tc}99`, fontWeight: '600', marginTop: 1 }}>Day {entry.dayCount} milestone</Text>}
            </View>
          </View>
          {metaParts ? <Text style={[ec.meta, { color: colors.textSecondary, marginTop: 6 }]}>{metaParts}</Text> : null}
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={[ec.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={ec.content}>

        {/* Type badge row + actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View style={[ec.typeBadge, { backgroundColor: `${tc}16` }]}>
            <TypeIcon type={entry.type} color={tc} size={12} />
            <Text style={[ec.typeBadgeText, { color: tc }]}>{TYPE_LABEL[entry.type]}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {entry.canEdit && onEdit && (
            <TouchableOpacity style={[ec.actionBtn, { backgroundColor: `${tc}16`, marginRight: 6 }]} onPress={onEdit}>
              <Ionicons name="pencil-outline" size={13} color={tc} />
            </TouchableOpacity>
          )}
          {entry.canDelete && onDelete && (
            <TouchableOpacity style={[ec.actionBtn, { backgroundColor: colors.danger + '18' }]} onPress={onDelete}>
              <Ionicons name="trash-outline" size={13} color={colors.danger} />
            </TouchableOpacity>
          )}
          {!entry.canDelete && entry.type === 'checklist' && (
            <TouchableOpacity
              style={[ec.actionBtn, { backgroundColor: colors.border }]}
              onPress={() => showAlert('Medical record', 'Medication logs are permanent records and cannot be deleted.')}
            >
              <Ionicons name="lock-closed-outline" size={13} color={colors.textTertiary ?? colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Title — hidden for mood (rendered inside mood header row instead) */}
        {entry.type !== 'mood' && (
          <Text style={[ec.title, { color: colors.textPrimary }]} numberOfLines={entry.type === 'note' ? 6 : 2}>
            {entry.title}{entry.isPrivate ? '  🔒' : ''}
          </Text>
        )}

        {/* Type-specific rich content */}
        {entry.type === 'mood' && (() => {
          const moodLabel = entry.title?.toLowerCase().replace(/\s+mood$/, '') ?? '';
          const mc = MOOD_COLOR[moodLabel] ?? tc;
          const moodEmoji = MOOD_EMOJI[moodLabel] ?? '🐾';
          return (
          <View style={{ gap: 8, marginTop: 4 }}>
            {/* Header row: emoji icon + score pill + small photo thumb */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${mc}18`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: TYPO.title }}>{moodEmoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: mc }}>{entry.title}</Text>
                {metaParts ? <Text style={[ec.meta, { color: colors.textSecondary, marginTop: 0 }]}>{metaParts}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {entry.moodScore != null && (
                  <View style={{ backgroundColor: `${mc}14`, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: mc }}>{entry.moodScore}</Text>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '500', color: mc }}>/100</Text>
                  </View>
                )}
                {entry.photoUrl && !photoError && (
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setPhotoLightbox(true)}>
                    <LazyImage uri={entry.photoUrl} style={[ec.moodThumb, { borderColor: `${mc}40` }]} onError={() => setPhotoError(true)} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Notes — always visible, collapsible */}
            {entry.subtitle ? (
              <View style={{ gap: 4 }}>
                <Text style={[ec.sub, { color: colors.textSecondary }]} numberOfLines={notesExpanded ? undefined : 3}>
                  {entry.subtitle}
                </Text>
                {!notesExpanded && (
                  <TouchableOpacity onPress={() => setNotesExpanded(true)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: mc }}>Read more ▼</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            {/* Breakdown bars — always visible */}
            {entry.moodHappy != null && (
              <View style={{ gap: 5 }}>
                {([
                  { label: 'Happy',   v: entry.moodHappy,   c: colors.success },
                  { label: 'Playful', v: entry.moodPlayful, c: colors.info },
                  { label: 'Tired',   v: entry.moodTired,   c: colors.textTertiary ?? '#999' },
                  { label: 'Anxious', v: entry.moodAnxious, c: colors.danger },
                ] as { label: string; v: number | undefined; c: string }[]).filter(b => (b.v ?? 0) > 0).map(b => (
                  <View key={b.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary, width: 50 }}>{b.label}</Text>
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                      <View style={{ height: '100%', borderRadius: 3, width: `${b.v ?? 0}%`, backgroundColor: b.c }} />
                    </View>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: b.c, width: 32, textAlign: 'right' }}>{b.v}%</Text>
                  </View>
                ))}
              </View>
            )}

            {/* More ▼ — situation + advice, independent of notes toggle */}
            {(entry.moodSituation || (entry.moodAdvice?.length ?? 0) > 0) && (
              <TouchableOpacity onPress={() => setAiExpanded(e => !e)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: mc }}>{aiExpanded ? 'Less ▲' : 'More ▼'}</Text>
              </TouchableOpacity>
            )}

            {aiExpanded && (
              <View style={{ gap: 8 }}>
                {entry.moodSituation ? (
                  <View style={{ backgroundColor: `${mc}0D`, borderWidth: 1, borderColor: `${mc}25`, borderRadius: 10, padding: 10, gap: 4 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>📍 Situation</Text>
                    <Text style={{ fontSize: TYPO.body, lineHeight: 18, color: colors.textPrimary }}>{entry.moodSituation}</Text>
                  </View>
                ) : null}
                {(entry.moodAdvice?.length ?? 0) > 0 && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary }}>💡 Tips</Text>
                    {entry.moodAdvice!.map((item: any, i) => {
                      const isObj = item && typeof item === 'object';
                      const action = isObj ? item.action : item;
                      const detail = isObj ? item.detail : null;
                      return (
                        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: mc, lineHeight: 20 }}>•</Text>
                          <View style={{ flex: 1 }}>
                            {action ? <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{action}</Text> : null}
                            {detail ? <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1, lineHeight: 17 }}>{detail}</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
          );
        })()}

        {/* Mood photo lightbox — exact same structure as memories lightbox */}
        {entry.type === 'mood' && entry.photoUrl && !photoError && (
          <Modal visible={photoLightbox} transparent animationType="none" onRequestClose={() => setPhotoLightbox(false)}>
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
              {/* Top bar */}
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12, zIndex: 10 }}>
                <TouchableOpacity style={{ padding: 8 }} onPress={() => setPhotoLightbox(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              {/* Image */}
              <LazyImage
                uri={entry.photoUrl}
                style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').width * 1.2, maxHeight: '72%' } as any}
                resizeMode="contain"
              />
              {/* Bottom meta — exact memories lightboxMeta style */}
              <View style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                paddingVertical: 24, paddingHorizontal: 20,
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: isDark ? 'rgba(14,10,24,0.95)' : 'rgba(255,245,230,0.95)',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                borderTopWidth: 1,
                borderTopColor: isDark ? 'rgba(160,125,212,0.2)' : 'rgba(255,193,7,0.2)',
                paddingBottom: insets.bottom + 32,
              }}>
                <Text style={{ fontSize: 40 }}>{MOOD_EMOJI[entry.title?.toLowerCase().replace(/\s+mood$/, '') ?? ''] ?? '🐾'}</Text>
                <View>
                  <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: MOOD_COLOR[entry.title?.toLowerCase().replace(/\s+mood$/, '') ?? ''] ?? colors.textPrimary }}>
                    {entry.title}
                  </Text>
                  {entry.timestamp ? (
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 3, fontWeight: '600' }}>
                      {format(parseISO(entry.timestamp), 'MMMM d, yyyy')}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </Modal>
        )}

        {entry.type === 'weight' && entry.weightKg != null && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <Text style={{ fontSize: TYPO.hero, fontWeight: '800', color: tc }}>{entry.weightKg} kg</Text>
            {entry.prevWeightKg != null && (() => {
              const diff = +(entry.weightKg! - entry.prevWeightKg!).toFixed(2);
              if (diff === 0) return null;
              const up = diff > 0;
              const diffColor = up ? colors.danger : colors.success;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${diffColor}20`, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                  <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={diffColor} />
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: diffColor }}>{Math.abs(diff)} kg</Text>
                </View>
              );
            })()}
          </View>
        )}

        {entry.type === 'meal' && (
          <View style={{ marginTop: 4, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: TYPO.title }}>{MEAL_EMOJI[entry.mealType ?? ''] ?? '🍽'}</Text>
              <View>
                {entry.foodType ? <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '500' }}>{entry.foodType}</Text> : null}
                {entry.amountGrams ? <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary }}>{entry.amountGrams} g</Text> : null}
              </View>
            </View>
            {entry.photoUrl && !photoError && (
              <LazyImage uri={entry.photoUrl} style={ec.dailyPhoto} onError={() => setPhotoError(true)} />
            )}
          </View>
        )}

        {entry.type === 'grooming' && entry.groomType && (
          <View style={{ marginTop: 4, gap: 6 }}>
            <View style={[ec.chip, { backgroundColor: `${tc}14`, alignSelf: 'flex-start' }]}>
              <Text style={[ec.chipText, { color: tc }]}>{GROOM_LABEL[entry.groomType] ?? entry.groomType}</Text>
            </View>
            {entry.subtitle ? <Text style={[ec.sub, { color: colors.textSecondary }]} numberOfLines={2}>{entry.subtitle}</Text> : null}
            {entry.photoUrl && !photoError && (
              <LazyImage uri={entry.photoUrl} style={ec.dailyPhoto} onError={() => setPhotoError(true)} />
            )}
          </View>
        )}

        {entry.type === 'checklist' && (entry.subtitle || entry.photoUrl) && (
          <View style={{ marginTop: 6, gap: 6 }}>
            {entry.subtitle && (
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '500' }}>{entry.subtitle}</Text>
            )}
            {entry.photoUrl && !photoError && (
              <LazyImage uri={entry.photoUrl} style={ec.dailyPhoto} onError={() => setPhotoError(true)} />
            )}
          </View>
        )}

        {entry.type === 'vet' && (
          <View style={{ gap: 4, marginTop: 4 }}>
            {entry.diagnosis ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                <Ionicons name="medical-outline" size={13} color={tc} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: TYPO.body, color: tc, fontWeight: '600', flex: 1 }} numberOfLines={2}>{entry.diagnosis}</Text>
              </View>
            ) : null}
            {[entry.vetName, entry.clinicName].filter(Boolean).join(' · ') ? (
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{[entry.vetName, entry.clinicName].filter(Boolean).join(' · ')}</Text>
            ) : null}
          </View>
        )}

        {/* Mood chip — hidden for mood type (emoji shown in header row) */}
        {entry.chip && entry.type !== 'mood' && (
          <View style={[ec.chip, { backgroundColor: `${tc}14`, marginTop: 6 }]}>
            <Text style={[ec.chipText, { color: tc }]}>{entry.chip.emoji}  {entry.chip.label}</Text>
          </View>
        )}

        {/* Meta — hidden for mood (shown in header row) */}
        {metaParts && entry.type !== 'mood' ? <Text style={[ec.meta, { color: colors.textSecondary, marginTop: 6 }]}>{metaParts}</Text> : null}
      </View>
    </View>
  );
});

const ec = StyleSheet.create({
  card:         { flexDirection: 'row', borderRadius: 16, marginBottom: 10, borderWidth: 1, shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: 'hidden' },
  content:      { flex: 1, paddingTop: 12, paddingBottom: 13, paddingHorizontal: 13 },
  typeBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  typeBadgeText:{ fontSize: TYPO.body, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  title:        { fontSize: TYPO.body, fontWeight: '700', lineHeight: 21 },
  sub:          { fontSize: TYPO.body, lineHeight: 19 },
  meta:         { fontSize: TYPO.body, lineHeight: 16 },
  chip:         { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  chipText:     { fontSize: TYPO.body, fontWeight: '600' },
  actionBtn:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  scoreTrack:   { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  scoreFill:    { height: '100%', borderRadius: 3 },
  moodPhoto:    { width: '100%', height: 140, borderRadius: 10, marginTop: 4 },
  moodThumb:    { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5 },
  dailyPhoto:   { width: '100%', height: 160, borderRadius: 10, resizeMode: 'cover' },
});
