/**
 * HomeownerNotesSection — Hub card linking to the parent-only home
 * maintenance tracker. Replaces the earlier Smart Hub card (thermostat
 * vendor integration, dropped — see homeownerNotesStore.ts's own comment).
 */
import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useHomeownerNotesStore } from '@/store/homeownerNotesStore';

export function HomeownerNotesSection({ colors }: { colors: any }) {
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyId = (members.find(m => m.id === activeMemberId) as any)?.familyId ?? (members[0] as any)?.familyId ?? null;
  const notes = useHomeownerNotesStore(s => s.notes);
  const loadNotes = useHomeownerNotesStore(s => s.loadNotes);

  useEffect(() => {
    if (familyId) loadNotes(familyId);
  }, [familyId]);

  const overdueCount = notes.filter(n => !n.completedAt && n.dueDate && new Date(n.dueDate) < new Date(new Date().toDateString())).length;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
      <Text style={{ fontSize: TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Home Maintenance
      </Text>
      <Pressable
        onPress={() => router.push('/hub/homeowner-notes' as any)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.card, padding: 14,
        }}
      >
        <View style={{
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.tealLight,
        }}>
          <Text style={{ fontSize: 20 }}>🏠</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
            Homeowner Notes
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            {overdueCount > 0 ? `${overdueCount} overdue · ` : ''}Maintenance, warranties, contacts
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
