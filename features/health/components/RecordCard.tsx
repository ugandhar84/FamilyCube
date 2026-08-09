import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator } from 'react-native';
import { format, parseISO } from 'date-fns';
import { showUpgradeAlert } from '@/lib/subscription';
import { formatTime } from '@/lib/units';
import { TYPO } from '@/constants/theme';

type DocType = 'lab' | 'prescription' | 'discharge' | 'vaccination' | 'xray' | 'invoice' | 'other';

const DOC_TYPES: { key: DocType; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'lab',          label: 'Lab Report',   icon: 'flask-outline',            color: '#0C447C', bg: '#E6F1FB' },
  { key: 'prescription', label: 'Prescription', icon: 'medical-outline',          color: '#3C3489', bg: '#EEEDFE' },
  { key: 'discharge',    label: 'Discharge',    icon: 'document-text-outline',    color: '#854F0B', bg: '#FAEEDA' },
  { key: 'vaccination',  label: 'Vaccination',  icon: 'shield-checkmark-outline', color: '#0F6E56', bg: '#E1F5EE' },
  { key: 'xray',         label: 'X-Ray / Scan', icon: 'scan-outline',             color: '#6B21A8', bg: '#F3E8FF' },
  { key: 'invoice',      label: 'Invoice',      icon: 'receipt-outline',          color: '#92400E', bg: '#FEF3C7' },
  { key: 'other',        label: 'Other',        icon: 'folder-outline',           color: '#475569', bg: '#F1F5F9' },
];

interface HealthRecord {
  id: string;
  file_name: string;
  file_type: 'pdf' | 'image';
  status: 'raw' | 'processing' | 'done' | 'error';
  source: 'upload' | 'camera';
  extraction_count: number;
  page_count: number;
  auto_saved: boolean;
  doc_type: DocType | null;
  created_at: string;
}

interface RecordCardProps {
  rec: HealthRecord;
  isExpanded: boolean;
  isDark: boolean;
  accent: string;
  canDelete: boolean;
  colors: any;
  s: any;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const RecordCard = React.memo(function RecordCard({
  rec, isExpanded, isDark, accent, canDelete, colors, s, onToggle, onDelete,
}: RecordCardProps) {
  const isDone = rec.status === 'done';
  const isErr  = rec.status === 'error';
  const isProc = rec.status === 'processing';
  const isRaw  = rec.status === 'raw';

  const iconName  = rec.source === 'camera' ? 'scan-outline' : rec.file_type === 'pdf' ? 'document-text-outline' : 'images-outline';
  const iconBg    = isDark ? colors.primaryLight : rec.file_type === 'pdf' ? '#EEEDFE' : '#E1F5EE';
  const iconColor = rec.file_type === 'pdf' ? colors.primary : (isDark ? '#4ADE80' : '#0F6E56');

  return (
    <View style={[s.recCard, { backgroundColor: colors.card, borderColor: isExpanded ? accent + '60' : colors.border }]}>
      {/* Collapsed header row */}
      <TouchableOpacity
        onPress={() => onToggle(rec.id)}
        onLongPress={() => onDelete(rec.id)}
        activeOpacity={0.75}
        style={s.recRow}>

        <View style={[s.recIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName as any} size={22} color={iconColor} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.recName, { color: colors.textPrimary }]} numberOfLines={1}>{rec.file_name}</Text>
          <Text style={[s.recMeta, { color: colors.textSecondary }]}>
            {format(parseISO(rec.created_at), 'MMM d, yyyy')}
            {rec.page_count > 1 ? ` · ${rec.page_count} pages` : ''}
            {isDone && rec.extraction_count > 0 ? ` · ${rec.extraction_count} items found` : ''}
          </Text>
          {/* Doc type tag */}
          {rec.doc_type && rec.doc_type !== 'other' && (() => {
            const dt = DOC_TYPES.find(d => d.key === rec.doc_type);
            if (!dt) return null;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
                alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
                borderRadius: 10, backgroundColor: dt.bg }}>
                <Ionicons name={dt.icon as any} size={10} color={dt.color} />
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: dt.color }}>{dt.label}</Text>
              </View>
            );
          })()}
          {/* Status pill */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
            {isProc && (
              <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(255,179,71,0.18)' : '#FAEEDA' }]}>
                <ActivityIndicator size={10} color={isDark ? '#FFB347' : '#854F0B'} style={{ marginRight: 4 }} />
                <Text style={[s.statusText, { color: isDark ? '#FFB347' : '#854F0B' }]}>Analyzing…</Text>
              </View>
            )}
            {isDone && !rec.auto_saved && (
              <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(96,165,250,0.18)' : '#E6F1FB' }]}>
                <Ionicons name="eye-outline" size={11} color={isDark ? '#60A5FA' : '#185FA5'} />
                <Text style={[s.statusText, { color: isDark ? '#60A5FA' : '#185FA5' }]}>Review & save</Text>
              </View>
            )}
            {isDone && rec.auto_saved && (
              <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(74,222,128,0.18)' : '#E1F5EE' }]}>
                <Ionicons name="checkmark-circle" size={11} color={isDark ? '#4ADE80' : '#0F6E56'} />
                <Text style={[s.statusText, { color: isDark ? '#4ADE80' : '#0F6E56' }]}>Saved to profile</Text>
              </View>
            )}
            {isRaw && (
              <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : '#F1F5F9' }]}>
                <Ionicons name="document-outline" size={11} color={isDark ? '#94A3B8' : '#64748B'} />
                <Text style={[s.statusText, { color: isDark ? '#94A3B8' : '#64748B' }]}>Raw document</Text>
              </View>
            )}
            {isErr && (
              <View style={[s.statusPill, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="alert-circle-outline" size={11} color={colors.danger} />
                <Text style={[s.statusText, { color: colors.danger }]}>Analysis failed</Text>
              </View>
            )}
          </View>
        </View>

        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16} color={isExpanded ? accent : colors.textTertiary} />
      </TouchableOpacity>

      {/* Expanded details */}
      {isExpanded && (
        <View style={[s.recExpanded, { borderTopColor: colors.border }]}>
          <View style={s.recDetailRow}>
            <Ionicons name="calendar-outline" size={13} color={colors.textTertiary} />
            <Text style={[s.recDetailText, { color: colors.textSecondary }]}>
              Scanned {format(parseISO(rec.created_at), 'MMMM d, yyyy')} · {formatTime(parseISO(rec.created_at))}
            </Text>
          </View>
          <View style={s.recDetailRow}>
            <Ionicons name={rec.file_type === 'pdf' ? 'document-text-outline' : 'image-outline'} size={13} color={colors.textTertiary} />
            <Text style={[s.recDetailText, { color: colors.textSecondary }]}>
              {rec.file_type.toUpperCase()} · {rec.page_count} page{rec.page_count !== 1 ? 's' : ''} · via {rec.source}
            </Text>
          </View>
          {isDone && rec.extraction_count > 0 && (
            <View style={s.recDetailRow}>
              <Ionicons name="sparkles-outline" size={13} color={accent} />
              <Text style={[s.recDetailText, { color: accent }]}>
                {rec.extraction_count} health item{rec.extraction_count !== 1 ? 's' : ''} extracted by FurAI
              </Text>
            </View>
          )}
          {isRaw && (
            <TouchableOpacity
              style={[s.recActionBtn, { backgroundColor: '#7C3AED', marginBottom: 8 }]}
              onPress={() => showUpgradeAlert({ message: 'Upgrade to Pro — FurAI extracts vaccines, medications, lab results and appointments automatically.' })}>
              <Ionicons name="sparkles-outline" size={13} color="#fff" />
              <Text style={s.recActionBtnText}>Upgrade to analyse with FurAI</Text>
            </TouchableOpacity>
          )}
          <View style={s.recActions}>
            <TouchableOpacity
              style={[s.recActionBtn, { backgroundColor: accent }]}
              onPress={() => router.push(`/health/record/${rec.id}`)}>
              <Ionicons name={isRaw ? 'document-outline' : 'sparkles-outline'} size={13} color="#fff" />
              <Text style={s.recActionBtnText}>
                {isDone ? 'View analysis' : isProc ? 'View progress' : isRaw ? 'View document' : 'Open record'}
              </Text>
            </TouchableOpacity>
            {canDelete && (
              <TouchableOpacity
                style={[s.recActionBtn, { backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: colors.danger + '40' }]}
                onPress={() => onDelete(rec.id)}>
                <Ionicons name="trash-outline" size={13} color={colors.danger} />
                <Text style={[s.recActionBtnText, { color: colors.danger }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
});
