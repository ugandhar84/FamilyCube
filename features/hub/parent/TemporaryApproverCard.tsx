import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Key, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { SectionCard } from '../hubComponents';
import type { FamilyMember } from '@/store/familyStore';
import type { TemporaryApproverGrant } from '@/store/temporaryApproverStore';

const WINDOWS = [
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 24 * 7 },
  { label: '2 weeks', hours: 24 * 14 },
] as const;

// Scenarios 9.2/9.3 — a parent grants (or revokes) temporary approval
// authority to a trusted adult (GP, or another parent-equivalent) for a
// bounded window. Deliberately not "make them a parent" — this only
// unlocks approve/decline/review capability (see choreStore.canApprove);
// member management, settings, and financial thresholds are untouched.
export function TemporaryApproverCard({
  active, members, colors, isDark, activeGrants,
  grantTemporaryApprover, revokeTemporaryApprover,
}: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  activeGrants: TemporaryApproverGrant[];
  grantTemporaryApprover: (memberId: string, byId: string, expiresAt: string) => void;
  revokeTemporaryApprover: (grantId: string) => void;
}) {
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  // Eligible grantees — any adult who isn't already a parent (GP is the
  // primary real-world case; a household could also delegate to a Teen).
  const eligible = members.filter(m => m.role === 'senior' || m.role === 'teen');

  if (eligible.length === 0 && activeGrants.length === 0) return null;

  const grant = (memberId: string, hours: number) => {
    const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
    grantTemporaryApprover(memberId, active.id, expiresAt);
    setPickingFor(null);
  };

  return (
    <SectionCard
      icon={<Key size={16} color={colors.primary} />}
      title="Temporary Approver"
      subtitle={activeGrants.length > 0 ? `${activeGrants.length} active` : 'None active'}
      accent={colors.primary}
      collapsible defaultExpanded={activeGrants.length > 0}
      colors={colors} isDark={isDark}>
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginBottom: 10 }}>
        Grant a trusted adult the ability to approve/decline chore submissions for a set time — useful while you're
        traveling or unreachable. This doesn't give them member management or settings access.
      </Text>

      {activeGrants.length > 0 && (
        <View style={{ gap: 8, marginBottom: 12 }}>
          {activeGrants.map(g => {
            const grantee = members.find(m => m.id === g.grantedToMemberId);
            return (
              <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: isDark ? colors.primary + '12' : colors.primaryLight,
                borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.primary + '30' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                    {grantee?.name.split(' ')[0] ?? 'Member'}
                  </Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                    Until {new Date(g.expiresAt).toLocaleString(undefined, { hour12: true })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => Alert.alert('Revoke Access', `End ${grantee?.name.split(' ')[0] ?? 'their'} temporary approval access now?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Revoke', style: 'destructive', onPress: () => revokeTemporaryApprover(g.id) },
                  ])}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 6, borderRadius: 8, backgroundColor: colors.danger + '15' }}>
                  <X size={14} color={colors.danger} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {eligible.filter(m => !activeGrants.some(g => g.grantedToMemberId === m.id)).map(m => (
        <View key={m.id} style={{ marginBottom: 8 }}>
          {pickingFor === m.id ? (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {WINDOWS.map(w => (
                <Pressable key={w.hours} onPress={() => grant(m.id, w.hours)}
                  style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                    backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40' }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary }}>{w.label}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setPickingFor(null)}
                style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.surface }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setPickingFor(m.id)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10,
                backgroundColor: isDark ? colors.surface : '#F8FAFC', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>
                {m.name.split(' ')[0]} ({m.role === 'senior' ? 'Grandparent' : 'Teen'})
              </Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.primary }}>Grant Access</Text>
            </Pressable>
          )}
        </View>
      ))}
    </SectionCard>
  );
}
