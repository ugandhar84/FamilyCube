import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import {
  FileText, Calendar, Lock, Sparkles, ChevronDown, ChevronUp,
  Trash2, CheckCircle, AlertTriangle, ArrowRight, Square, CheckSquare, FileX,
} from 'lucide-react-native';
import { BRAND, StatusPill } from '../tabs/shared';
import { MedRecord, TAG_MAP, URGENCY_META, memberColor, fmtSize } from './types';

interface Props {
  rec:          MedRecord;
  memberName:   string;
  memberIdx:    number;
  onDelete:     () => void;
  onAnalyze:    () => void;
  onOpenReview: () => void;
  analyzing:    boolean;
  hasPending:   boolean;
  selectable:    boolean;
  selected:      boolean;
  onToggleSelect: () => void;
  notMedicalMsg?: string;
  colors:        any;
  isDark:        boolean;
}

export default function RecordCard({
  rec, memberName, memberIdx,
  onDelete, onAnalyze, onOpenReview,
  analyzing, hasPending, notMedicalMsg,
  selectable, selected, onToggleSelect,
  colors, isDark,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const tag    = TAG_MAP[rec.tag] ?? TAG_MAP.other;
  const TIcon  = tag.Icon;
  const mColor = memberColor(memberIdx);
  const stored  = rec.ai_analysis_json;
  const urgency = stored?.urgency ?? 'routine';
  const urgMeta = URGENCY_META[urgency];

  const cardBorderColor = urgency === 'urgent'    ? BRAND.rose + '80'
    : urgency === 'attention' ? BRAND.amber + '60'
    : colors.border;

  return (
    <View style={[s.card, {
      backgroundColor: isDark ? colors.card + 'CC' : '#FFFFFF',
      borderColor: selected ? BRAND.teal : cardBorderColor,
      borderWidth: selected ? 2 : 1.5,
    }]}>
      {/* Header row — always visible */}
      <TouchableOpacity
        onPress={() => selectable ? onToggleSelect() : setExpanded(e => !e)}
        onLongPress={() => !selectable && onToggleSelect()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {/* Checkbox in select mode, tag icon otherwise */}
        {selectable ? (
          <View style={[s.tagIcon, {
            backgroundColor: selected ? BRAND.teal + '25' : (isDark ? colors.surface : '#F1F5F9'),
            borderWidth: 1.5, borderColor: selected ? BRAND.teal : colors.border,
          }]}>
            {selected
              ? <CheckSquare size={18} color={BRAND.teal} />
              : <Square size={18} color={colors.textTertiary} />}
          </View>
        ) : (
          <View style={[s.tagIcon, { backgroundColor: tag.color + '20' }]}>
            <TIcon size={16} color={tag.color} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
            {rec.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Calendar size={10} color={colors.textTertiary} />
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>{rec.record_date}</Text>
            <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: colors.textTertiary }} />
            <View style={[s.memberDot, { backgroundColor: mColor + '30', borderColor: mColor + '60' }]}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: mColor }}>{memberName.split(' ')[0]}</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Pending badge on collapsed card */}
          {hasPending && !rec.ai_analyzed && (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.amber }} />
          )}
          {urgency !== 'routine' && <StatusPill label={urgMeta.label} color={urgMeta.color} />}
          <StatusPill label={tag.label} color={tag.color} />
          {expanded
            ? <ChevronUp size={14} color={colors.textTertiary} />
            : <ChevronDown size={14} color={colors.textTertiary} />}
        </View>
      </TouchableOpacity>

      {/* Expanded body */}
      {expanded && (
        <View style={{ marginTop: 12, gap: 10 }}>
          {/* File row */}
          {rec.file_name && (
            <View style={[s.fileRow, { backgroundColor: isDark ? colors.surface : '#F1F5F9', borderColor: colors.border }]}>
              <FileText size={14} color={BRAND.teal} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, flex: 1 }} numberOfLines={1}>
                {rec.file_name}
              </Text>
              {rec.file_size != null && (
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>{fmtSize(rec.file_size)}</Text>
              )}
              <Lock size={11} color={BRAND.teal} />
            </View>
          )}

          {/* User notes */}
          {rec.notes ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>{rec.notes}</Text>
          ) : null}

          {/* Pending → tap to open review sheet */}
          {hasPending && !rec.ai_analyzed && (
            <TouchableOpacity onPress={onOpenReview}
              style={[s.actionRow, { borderColor: BRAND.amber + '70', backgroundColor: BRAND.amber + '12' }]}>
              <Sparkles size={13} color={BRAND.amber} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: BRAND.amber }}>
                  AI analysis ready — tap to review
                </Text>
                <Text style={{ fontSize: 10, color: BRAND.amber + 'AA', marginTop: 1 }}>
                  Review findings and approve to save to vault
                </Text>
              </View>
              <ArrowRight size={14} color={BRAND.amber} />
            </TouchableOpacity>
          )}

          {/* Approved — compact summary strip */}
          {rec.ai_analyzed && stored && !hasPending && (
            <View style={[s.aiBox, { backgroundColor: BRAND.teal + '10', borderColor: BRAND.teal + '35' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <Sparkles size={12} color={BRAND.teal} />
                <Text style={{ fontSize: 10, fontWeight: '900', color: BRAND.teal, letterSpacing: 0.6, flex: 1 }}>
                  AI SUMMARY
                </Text>
                {urgency !== 'routine' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: urgMeta.color + '20', borderRadius: 6,
                    paddingHorizontal: 7, paddingVertical: 3 }}>
                    <AlertTriangle size={9} color={urgMeta.color} />
                    <Text style={{ fontSize: 9, fontWeight: '800', color: urgMeta.color }}>{urgMeta.label}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                  backgroundColor: BRAND.teal + '20', borderRadius: 6,
                  paddingHorizontal: 6, paddingVertical: 3 }}>
                  <Lock size={8} color={BRAND.teal} />
                  <Text style={{ fontSize: 9, fontWeight: '800', color: BRAND.teal }}>VAULT</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }} numberOfLines={3}>
                {stored.summary}
              </Text>
              {stored.tags?.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {stored.tags.map(t => (
                    <View key={t} style={[s.tag, { backgroundColor: BRAND.teal + '20', borderColor: BRAND.teal + '40' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.teal }}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <CheckCircle size={10} color={BRAND.teal} />
                <Text style={{ fontSize: 10, color: BRAND.teal, fontWeight: '700' }}>
                  Approved · encrypted in vault
                </Text>
              </View>
            </View>
          )}

          {/* Not a medical document — inline rejection */}
          {notMedicalMsg && !rec.ai_analyzed && !hasPending && (
            <View style={[s.actionRow, { borderColor: BRAND.amber + '60', backgroundColor: BRAND.amber + '10', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <FileX size={14} color={BRAND.amber} />
                <Text style={{ fontSize: 12, fontWeight: '900', color: BRAND.amber }}>
                  Not a medical document
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16 }}>
                {notMedicalMsg}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                Only human clinical reports (lab results, prescriptions, discharge summaries, etc.) can be analyzed.
              </Text>
            </View>
          )}

          {/* No analysis yet */}
          {!rec.ai_analyzed && !hasPending && !notMedicalMsg && (
            <TouchableOpacity onPress={onAnalyze} disabled={analyzing}
              style={[s.actionRow, {
                borderColor: analyzing ? colors.border : BRAND.teal + '60',
                backgroundColor: analyzing ? colors.surface : BRAND.teal + '10',
              }]}>
              {analyzing
                ? <ActivityIndicator size="small" color={BRAND.teal} />
                : <Sparkles size={13} color={BRAND.teal} />}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800',
                  color: analyzing ? colors.textTertiary : BRAND.teal }}>
                  {analyzing ? 'Analyzing…' : 'Analyze with AI'}
                </Text>
                {!analyzing && (
                  <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>
                    {rec.file_path ? 'Reads the actual document · name anonymized' : 'Based on title & notes'}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* Footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={{ fontSize: 10, color: colors.textTertiary, fontStyle: 'italic' }}>
              Added {new Date(rec.created_at).toLocaleDateString()}
            </Text>
            <TouchableOpacity onPress={onDelete}
              style={[s.deleteBtn, { borderColor: BRAND.rose + '40', backgroundColor: BRAND.rose + '08' }]}>
              <Trash2 size={12} color={BRAND.rose} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card:      { borderRadius: 16, borderWidth: 1.5, padding: 13 },
  tagIcon:   { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  memberDot: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  fileRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 9 },
  aiBox:     { borderRadius: 14, borderWidth: 1.5, padding: 13 },
  tag:       { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5,
               paddingHorizontal: 12, paddingVertical: 10 },
  deleteBtn: { width: 30, height: 30, borderRadius: 10, borderWidth: 1,
               alignItems: 'center', justifyContent: 'center' },
});
