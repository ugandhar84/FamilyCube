import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const CAPABILITIES = [
  { icon: 'shield-checkmark-outline', label: 'Vaccines' },
  { icon: 'medical-outline',          label: 'Medications' },
  { icon: 'flask-outline',            label: 'Lab results' },
  { icon: 'calendar-outline',         label: 'Follow-ups' },
];

interface RecordsHeroCardProps {
  tier: string;
  accent: string;
  limitReached: boolean;
  canLogHealth: boolean;
  s: any;
  onScanPress: () => void;
  onPdfPress: () => void;
}

export const RecordsHeroCard = React.memo(function RecordsHeroCard({
  tier, accent, limitReached, canLogHealth, s, onScanPress, onPdfPress,
}: RecordsHeroCardProps) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
      <LinearGradient
        colors={[accent, accent + 'CC', accent + '88']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.heroCard}>

        {/* Top row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 }}>
          <View style={s.heroIconWrap}>
            <Ionicons name={tier === 'free' ? 'document-text-outline' : 'sparkles-outline'} size={26} color={accent} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.heroTitle}>{tier === 'free' ? 'Health Documents' : 'FurAI Health Scan'}</Text>
            <Text style={s.heroSub}>
              {tier === 'free'
                ? 'Upload vet documents — stored safely and organised by date.'
                : 'Upload any vet document — FurAI reads it and extracts everything automatically.'}
            </Text>
          </View>
        </View>

        {/* Capability pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {(tier === 'free' ? [
            { icon: 'document-text-outline', label: 'PDF' },
            { icon: 'camera-outline',        label: 'Camera' },
            { icon: 'images-outline',        label: 'Gallery' },
            { icon: 'calendar-outline',      label: 'Date sorted' },
          ] : CAPABILITIES).map(c => (
            <View key={c.label} style={s.capPill}>
              <Ionicons name={c.icon as any} size={12} color="rgba(255,255,255,0.9)" />
              <Text style={s.capPillText}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* Action buttons */}
        {canLogHealth && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              disabled={limitReached}
              style={[s.heroBtnPrimary, limitReached && { backgroundColor: 'rgba(255,255,255,0.35)' }]}
              onPress={onScanPress}>
              <Ionicons name={limitReached ? 'ban-outline' : 'scan-outline'} size={16} color={limitReached ? 'rgba(255,255,255,0.5)' : accent} />
              <Text style={[s.heroBtnPrimaryText, { color: limitReached ? 'rgba(255,255,255,0.5)' : accent }]}>
                {limitReached ? 'Limit reached' : 'Scan pages'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={limitReached}
              style={[s.heroBtnSecondary, limitReached && { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.15)' }]}
              onPress={onPdfPress}>
              <Ionicons name="document-text-outline" size={16} color={limitReached ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.9)'} />
              <Text style={[s.heroBtnSecondaryText, limitReached && { color: 'rgba(255,255,255,0.35)' }]}>Upload PDF</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
    </View>
  );
});
