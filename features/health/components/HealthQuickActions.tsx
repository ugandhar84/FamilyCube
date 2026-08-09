import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { showAlert } from '@/components/AppAlert';
import { permissionDeniedMsg } from '@/lib/permissions';

interface HealthQuickActionsProps {
  perms: { canLogHealth: boolean };
  tier: string;
  accent: string;
  colors: any;
  s: any;
  healthRecordsEnabled: boolean;
  onLogWeight: () => void;
  onAddAppt: () => void;
  onVetReport: () => void;
}

export const HealthQuickActions = React.memo(function HealthQuickActions({
  perms, tier, accent, colors, s, healthRecordsEnabled, onLogWeight, onAddAppt, onVetReport,
}: HealthQuickActionsProps) {
  return (
    <View style={[s.qaStrip, { marginTop: 16 }]}>
      <TouchableOpacity style={s.qaCard} activeOpacity={0.7}
        onPress={() => { if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('log weight')); return; } onLogWeight(); }}>
        <Ionicons name="scale-outline" size={24} color={colors.textSecondary} />
        <Text style={s.qaLabel}>Log weight</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.qaCard, !perms.canLogHealth && { opacity: 0.45 }]}
        activeOpacity={0.7}
        onPress={() => { if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('add appointments')); return; } onAddAppt(); }}>
        <Ionicons name="calendar-number-outline" size={24} color={colors.textSecondary} />
        <Text style={s.qaLabel}>Add appt</Text>
        {!perms.canLogHealth && <Ionicons name="lock-closed" size={10} color={colors.textSecondary} style={{ position: 'absolute', top: 6, right: 6 }} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.qaCard, !perms.canLogHealth && { opacity: 0.45 }]}
        activeOpacity={0.7}
        onPress={() => { if (!perms.canLogHealth) { showAlert('No permission', permissionDeniedMsg('log vaccines')); return; } router.push('/health/vaccines'); }}>
        <Ionicons name="fitness-outline" size={24} color={colors.textSecondary} />
        <Text style={s.qaLabel}>Log vaccine</Text>
        {!perms.canLogHealth && <Ionicons name="lock-closed" size={10} color={colors.textSecondary} style={{ position: 'absolute', top: 6, right: 6 }} />}
      </TouchableOpacity>

      {healthRecordsEnabled && (
        <TouchableOpacity style={s.qaCard} activeOpacity={0.7} onPress={() => router.push('/health/records')}>
          <Ionicons name={tier === 'free' ? 'document-text-outline' : 'sparkles-outline'} size={24} color={accent} />
          <Text style={[s.qaLabel, { color: accent, fontWeight: '700' }]}>
            {tier === 'free' ? 'Health\nDocuments' : 'Analyze with\nFurAI'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.qaCard} activeOpacity={0.7} onPress={onVetReport}>
        <Ionicons name="share-outline" size={24} color={colors.info} />
        <Text style={[s.qaLabel, { color: colors.info, fontWeight: '700' }]}>{'Vet\nReport'}</Text>
      </TouchableOpacity>
    </View>
  );
});
