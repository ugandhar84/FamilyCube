import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Pill, CheckCircle, Plus, Trash2 } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { SectionCard } from '../hubComponents';
import { GP } from './seniorTheme';
import AddMedModal from '@/features/vault/tabs/health/AddMedModal';
import { Medication, FREQ_LABELS } from '@/features/vault/tabs/health/types';

// Money-green — "taken" status accent, distinct from brand teal used
// elsewhere in this card. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

export function MedicationsCard({ meds, medsTaken, toggleMed, onAddMed, onRemoveMed, colors, isDark, active }: {
  meds: Medication[];
  medsTaken: Record<string, boolean>;
  toggleMed: (med: Medication) => void;
  // Real dosage/frequency/schedule form (AddMedModal, the same one
  // HealthTab.tsx's Health screen uses) instead of the old name+time-only
  // stub — a medication feature with no dosage, recurrence, or start/end
  // date wasn't a real medication tracker (live-reported: "not a good
  // form... like any generic app does").
  onAddMed: (form: any) => Promise<void>;
  onRemoveMed: (id: string) => void;
  colors: any; isDark: boolean;
  active: { id: string; name: string };
}) {
  const [showAddMed, setShowAddMed] = useState(false);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        large
        icon={<Pill size={18} color={colors.danger} />}
        title="Today's Medications"
        badge={meds.filter(m => !medsTaken[m.id]).length || undefined} badgeColor={colors.danger}
        collapsible defaultExpanded={meds.some(m => !medsTaken[m.id])}
        colors={colors} isDark={isDark}>
        {meds.map((med, i) => {
          const taken = !!medsTaken[med.id];
          const scheduleLine = [
            med.dosage ? `${med.dosage}${med.dosage_unit ? ' ' + med.dosage_unit : ''}` : null,
            FREQ_LABELS[med.frequency] ?? med.frequency,
          ].filter(Boolean).join(' · ');
          return (
            <View key={med.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i < meds.length - 1 ? 1 : 0, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
              <Pill size={22} color={taken ? colors.textTertiary : BRAND.teal} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.sub, fontWeight: '700', color: taken ? colors.textTertiary : colors.textPrimary, textDecorationLine: taken ? 'line-through' : 'none' }}>{med.name}</Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary }}>
                  {med.frequency_times?.length ? med.frequency_times.join(' & ') : 'Anytime'}{scheduleLine ? ` · ${scheduleLine}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => toggleMed(med)} style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: taken ? MONEY_GREEN + '20' : BRAND.teal, borderWidth: taken ? 1 : 0, borderColor: MONEY_GREEN + '40' }}>
                <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: taken ? MONEY_GREEN : '#fff' }}>
                  {taken ? 'Taken' : 'Mark Taken'}
                </Text>
              </Pressable>
              {/* Extra left margin (was flush against "Mark Taken") — a
                  stray tap near two adjacent controls, one destructive, one
                  the primary action, is a real risk for a medication list
                  specifically. The confirm Alert is the real safety net,
                  but more separation reduces how often it even needs to
                  catch a mis-tap. */}
              <Pressable onPress={() => Alert.alert('Remove Medication', `Remove "${med.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => onRemoveMed(med.id) },
              ])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
                <Trash2 size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          );
        })}

        <Pressable onPress={() => setShowAddMed(true)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 }}>
          <Plus size={15} color={BRAND.teal} />
          <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: BRAND.teal }}>Add Medication</Text>
        </Pressable>

        {meds.length > 0 && meds.every(m => medsTaken[m.id]) && (
          <View style={{ alignItems: 'center', paddingVertical: 13, gap: 4 }}>
            <CheckCircle size={26} color={MONEY_GREEN} />
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: MONEY_GREEN }}>All done for today!</Text>
          </View>
        )}
      </SectionCard>

      <AddMedModal
        visible={showAddMed}
        onClose={() => setShowAddMed(false)}
        // AddMedModal's own onSave signature is (memberId, form) — it
        // supports picking who a medication is for when given multiple
        // members, but this card is scoped to ONE person (the active Hub
        // profile), so only [active] is ever passed below and the picker
        // never actually appears; memberId here is always active.id.
        onSave={async (_memberId, form) => { await onAddMed(form); setShowAddMed(false); }}
        members={[active]}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
}
