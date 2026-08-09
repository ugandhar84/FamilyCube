import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SymptomSection } from './SymptomSection';
import { BulletRow } from './BulletRow';
import { makeStyles } from './symptomScanStyles';
import { URGENCY_CONFIG, PastScan } from './symptomScanUtils';
import { TYPO } from '@/constants/theme';

interface Props {
  filteredScans: PastScan[];
  totalCount: number;
  dateFilter: 'all' | '7d' | '30d';
  onDateFilter: (f: 'all' | '7d' | '30d') => void;
  expandedScan: string | null;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  onLightbox: (uri: string) => void;
  colors: any;
  isDark: boolean;
}

export const PastScansSection = React.memo(function PastScansSection({
  filteredScans, totalCount, dateFilter, onDateFilter,
  expandedScan, onToggleExpand, onDelete, onLightbox,
  colors, isDark,
}: Props) {
  const s = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={[s.label, { color: colors.textSecondary, flex: 1, marginBottom: 0 }]}>
          PAST SCANS ({filteredScans.length})
        </Text>
        {(['all', '7d', '30d'] as const).map(f => (
          <TouchableOpacity key={f} onPress={() => onDateFilter(f)}
            style={[s.filterChip, { backgroundColor: dateFilter === f ? colors.primary : colors.card,
              borderColor: dateFilter === f ? colors.primary : colors.border }]}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: dateFilter === f ? '#fff' : colors.textSecondary }}>
              {f === 'all' ? 'All' : f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredScans.length === 0 && (
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', paddingVertical: 16 }}>
          No scans in this period
        </Text>
      )}

      {filteredScans.map(scan => {
        const conf       = URGENCY_CONFIG[scan.urgency as keyof typeof URGENCY_CONFIG] ?? URGENCY_CONFIG.monitor;
        const isExpanded = expandedScan === scan.id;
        const sr         = scan.result;
        const dateStr    = new Date(scan.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        return (
          <TouchableOpacity
            key={scan.id}
            onPress={() => onToggleExpand(scan.id)}
            activeOpacity={0.85}
            style={[s.pastCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {/* ── Header row ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {scan.photo_url ? (
                <TouchableOpacity onPress={() => onLightbox(scan.photo_url!)} activeOpacity={0.85}>
                  <Image source={{ uri: scan.photo_url }} cachePolicy="memory-disk" style={s.pastThumb} />
                </TouchableOpacity>
              ) : (
                <View style={[s.pastDotWrap, { backgroundColor: `${conf.color}18` }]}>
                  <Text style={{ fontSize: TYPO.subheading }}>{conf.icon}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }} numberOfLines={isExpanded ? undefined : 2}>
                  {scan.symptoms_text ?? 'Symptom scan'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <View style={[s.urgencyPill, { backgroundColor: `${conf.color}18` }]}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: conf.color }}>{conf.label}</Text>
                  </View>
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{dateStr}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity onPress={() => onDelete(scan.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
              </View>
            </View>

            {isExpanded && (
              <View style={{ marginTop: 14 }}>
                <View style={[s.urgencyBanner, { backgroundColor: conf.bg, borderRadius: 12, marginBottom: 10 }]}>
                  <Text style={{ fontSize: TYPO.heading }}>{conf.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.urgencyLabel, { color: conf.color }]}>{conf.label}</Text>
                    {sr.urgency_label ? <Text style={{ fontSize: TYPO.body, color: conf.color, opacity: 0.85 }}>{sr.urgency_label}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Confidence</Text>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: conf.color }}>{sr.confidence}%</Text>
                  </View>
                </View>

                {scan.photo_url && (
                  <TouchableOpacity onPress={() => onLightbox(scan.photo_url!)} activeOpacity={0.85} style={{ marginBottom: 10 }}>
                    <Image source={{ uri: scan.photo_url }} cachePolicy="memory-disk" style={s.pastExpandedPhoto} contentFit="cover" />
                    <View style={s.photoZoomBadge}>
                      <Ionicons name="expand-outline" size={12} color="#fff" />
                      <Text style={{ fontSize: TYPO.body, color: '#fff', fontWeight: '700' }}>Tap to zoom</Text>
                    </View>
                  </TouchableOpacity>
                )}

                <Text style={[s.sectionText, { paddingHorizontal: 0, paddingVertical: 4, fontSize: TYPO.body, color: colors.textPrimary }]}>{sr.summary}</Text>

                {sr.possible_causes?.length > 0 && (
                  <SymptomSection title="Possible Causes" icon="help-circle-outline" color={colors}>
                    {sr.possible_causes.map((c, i) => <BulletRow key={i} text={c} colors={colors} />)}
                  </SymptomSection>
                )}
                {sr.home_care?.length > 0 && (
                  <SymptomSection title="Home Care Steps" icon="home-outline" color={colors}>
                    {sr.home_care.map((c, i) => <BulletRow key={i} text={c} icon="checkmark-circle-outline" colors={colors} />)}
                  </SymptomSection>
                )}
                {sr.what_to_watch?.length > 0 && (
                  <SymptomSection title="Watch For (go to vet if...)" icon="warning-outline" color={colors}>
                    {sr.what_to_watch.map((c, i) => <BulletRow key={i} text={c} icon="alert-circle-outline" iconColor="#D97706" colors={colors} />)}
                  </SymptomSection>
                )}
                <View style={[s.disclaimerBox, { backgroundColor: isDark ? '#1a1a1a' : '#F8F8F8', borderColor: colors.border, marginTop: 10 }]}>
                  <Text style={{ fontSize: TYPO.body }}>🐾</Text>
                  <Text style={[s.disclaimerText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '700' }}>AI-generated guidance only.</Text>
                    {' '}Not a diagnosis or vet replacement. Always consult your vet for professional advice.
                  </Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});
