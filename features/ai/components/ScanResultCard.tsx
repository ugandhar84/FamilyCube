import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SymptomSection } from './SymptomSection';
import { BulletRow } from './BulletRow';
import { makeStyles } from './symptomScanStyles';
import { URGENCY_CONFIG, ScanResult } from './symptomScanUtils';
import { TYPO } from '@/constants/theme';

interface Props {
  result: ScanResult;
  colors: any;
  isDark: boolean;
}

export const ScanResultCard = React.memo(function ScanResultCard({ result, colors, isDark }: Props) {
  const s = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const urgencyConf = URGENCY_CONFIG[result.urgency] ?? URGENCY_CONFIG.monitor;

  return (
    <View style={[s.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>

      <View style={[s.urgencyBanner, { backgroundColor: urgencyConf.bg }]}>
        <Text style={{ fontSize: TYPO.title }}>{urgencyConf.icon}</Text>
        <View>
          <Text style={[s.urgencyLabel, { color: urgencyConf.color }]}>{urgencyConf.label}</Text>
          <Text style={{ fontSize: TYPO.body, color: urgencyConf.color, opacity: 0.85 }}>{result.urgency_label}</Text>
        </View>
        <View style={{ marginLeft: 'auto' }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>Confidence</Text>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: urgencyConf.color }}>{result.confidence}%</Text>
        </View>
      </View>

      <Text style={[s.sectionText, { color: colors.textPrimary }]}>{result.summary}</Text>

      <SymptomSection title="Possible Causes" icon="help-circle-outline" color={colors}>
        {result.possible_causes.map((c, i) => <BulletRow key={i} text={c} colors={colors} />)}
      </SymptomSection>

      <SymptomSection title="Home Care Steps" icon="home-outline" color={colors}>
        {result.home_care.map((c, i) => <BulletRow key={i} text={c} icon="checkmark-circle-outline" colors={colors} />)}
      </SymptomSection>

      <SymptomSection title="Watch For (go to vet if...)" icon="warning-outline" color={colors}>
        {result.what_to_watch.map((c, i) => <BulletRow key={i} text={c} icon="alert-circle-outline" iconColor="#D97706" colors={colors} />)}
      </SymptomSection>

      <TouchableOpacity
        onPress={() => {
          const ctx = encodeURIComponent(JSON.stringify({
            urgency:         result.urgency,
            urgency_label:   result.urgency_label,
            summary:         result.summary,
            possible_causes: result.possible_causes,
            home_care:       result.home_care,
            what_to_watch:   result.what_to_watch,
            vet_needed:      result.vet_needed,
            confidence:      result.confidence,
          }));
          router.push({ pathname: '/ai/vet-chat', params: { scan_ctx: ctx } } as any);
        }}
        style={[s.chatBtn, { borderColor: colors.primary }]}>
        <Ionicons name="chatbubble-outline" size={16} color={colors.primaryText ?? colors.primary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.primaryText ?? colors.primary }}>Ask PetDoc a follow-up</Text>
      </TouchableOpacity>

      <View style={[s.disclaimerBox, { backgroundColor: isDark ? '#1a1a1a' : '#F8F8F8', borderColor: colors.border }]}>
        <Text style={{ fontSize: TYPO.body }}>🐾</Text>
        <Text style={[s.disclaimerText, { color: colors.textPrimary }]}>
          <Text style={{ fontWeight: '700' }}>AI-generated guidance only.</Text>
          {' '}This is not a veterinary diagnosis or a substitute for professional care. Your vet knows your pet best — always consult them when in doubt, especially for emergencies.
        </Text>
      </View>
    </View>
  );
});
