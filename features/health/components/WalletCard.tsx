import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { PetInsurance } from '@/lib/db';
import { TYPO } from '@/constants/theme';

function statusOf(policy: PetInsurance): { label: string; color: string } {
  if (!policy.end_date) return { label: 'Active', color: '#16A34A' };
  const days = differenceInDays(parseISO(policy.end_date), new Date());
  if (days < 0)   return { label: 'Expired',    color: '#E24B4A' };
  if (days <= 30) return { label: 'Expiring soon', color: '#E8A320' };
  return               { label: 'Active', color: '#16A34A' };
}

function shade(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const num = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  let r = (num >> 16) + Math.round(255 * amount);
  let g = ((num >> 8) & 0xff) + Math.round(255 * amount);
  let b = (num & 0xff) + Math.round(255 * amount);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const WalletCard = React.memo(function WalletCard({ policy, pet, accent, colors, cardRef, sharing, onShare, onEdit, onDelete }: {
  policy: PetInsurance; pet: any; accent: string; colors: any;
  cardRef: (ref: InstanceType<typeof ViewShot> | null) => void;
  sharing: boolean;
  onShare: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { label, color } = statusOf(policy);
  const stats = [
    policy.deductible != null ? { label: 'Deductible', value: `$${policy.deductible}` } : null,
    policy.reimbursement_percent != null ? { label: 'Reimburse', value: `${policy.reimbursement_percent}%` } : null,
    policy.annual_limit != null ? { label: 'Annual limit', value: `$${policy.annual_limit.toLocaleString()}` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <View style={{ marginBottom: 16 }}>
      <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }}>
        <LinearGradient
          colors={[accent, shade(accent, -0.28)]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={wc.card}>
          <View style={wc.topRow}>
            <View style={wc.petBadge}>
              <Text style={{ fontSize: TYPO.heading }}>{pet?.emoji ?? '🐾'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={wc.petName} numberOfLines={1}>{pet?.name ?? 'My baby'}</Text>
              <Text style={wc.provider} numberOfLines={1}>{policy.provider}</Text>
            </View>
            <View style={[wc.statusPill, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
              <View style={[wc.statusDot, { backgroundColor: color }]} />
              <Text style={wc.statusText}>{label}</Text>
            </View>
          </View>

          {policy.policy_number && (
            <Text style={wc.policyNum}>{policy.policy_number}</Text>
          )}

          {policy.coverage_type && (
            <View style={wc.coverageChip}>
              <Text style={wc.coverageChipText} numberOfLines={1}>{policy.coverage_type}</Text>
            </View>
          )}

          {stats.length > 0 && (
            <View style={wc.statsRow}>
              {stats.map(st => (
                <View key={st.label} style={wc.statItem}>
                  <Text style={wc.statValue}>{st.value}</Text>
                  <Text style={wc.statLabel}>{st.label}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={wc.bottomRow}>
            <View>
              {policy.end_date && (
                <>
                  <Text style={wc.bottomLabel}>VALID UNTIL</Text>
                  <Text style={[wc.bottomValue, {
                    fontSize: TYPO.subheading, fontWeight: '900',
                    color: label === 'Expired' ? '#FF6B6B' : label === 'Expiring soon' ? '#FFD166' : '#fff',
                  }]}>{format(parseISO(policy.end_date), 'MMM d, yyyy')}</Text>
                </>
              )}
            </View>
            {policy.claims_phone && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={wc.bottomLabel}>CLAIMS</Text>
                <Text style={wc.bottomValue}>{policy.claims_phone}</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </ViewShot>

      <View style={wc.actionsRow}>
        <TouchableOpacity style={[wc.actionBtn, { borderColor: colors.border }]} onPress={onShare} disabled={sharing}>
          {sharing
            ? <ActivityIndicator size="small" color={colors.textSecondary} />
            : <Ionicons name="share-outline" size={16} color={colors.textSecondary} />}
          <Text style={[wc.actionText, { color: colors.textSecondary }]}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[wc.actionBtn, { borderColor: colors.border }]} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
          <Text style={[wc.actionText, { color: colors.textSecondary }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[wc.actionBtn, { borderColor: colors.border }]} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={[wc.actionText, { color: colors.danger }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const wc = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, minHeight: 170 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  petBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: TYPO.body, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  provider: { fontSize: TYPO.heading, fontWeight: '800', color: '#fff', marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
  policyNum: { fontSize: TYPO.body, fontWeight: '600', color: 'rgba(255,255,255,0.92)', marginTop: 16, letterSpacing: 1 },
  coverageChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8 },
  coverageChipText: { fontSize: TYPO.body, fontWeight: '600', color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 18, marginTop: 16 },
  statItem: {},
  statValue: { fontSize: TYPO.body, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: TYPO.body, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18 },
  bottomLabel: { fontSize: TYPO.body, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.5 },
  bottomValue: { fontSize: TYPO.body, fontWeight: '700', color: '#fff', marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderWidth: 1, borderRadius: 12 },
  actionText: { fontSize: TYPO.body, fontWeight: '600' },
});
