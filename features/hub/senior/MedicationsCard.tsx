import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Pill, CheckCircle, Plus, Trash2 } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { SectionCard } from '../hubComponents';
import { GP } from './seniorTheme';
import AddMedModal from '@/features/vault/tabs/health/AddMedModal';
import { Medication, FREQ_LABELS, encodeTakenEntry, formatDoseTime, today as todayLocalStr } from '@/features/vault/tabs/health/types';

// Money-green — "taken" status accent, distinct from brand teal used
// elsewhere in this card. Not colors.success (which IS brand teal in this
// app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// A dose whose scheduled frequency_times slot has already passed today,
// and isn't marked taken, was indistinguishable from any other pending
// dose — same teal "Mark Taken" pill whether it's due in 6 hours or was
// due 6 hours ago [live-requested: "should show on hub with red tint
// card if it is overdue"]. time is "HH:MM" (24h, as stored in
// frequency_times); compares against the real current wall-clock time,
// not just the date, so a dose due later today never reads as overdue
// early.
function isDoseOverdue(time: string | null): boolean {
  if (!time) return false;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const now = new Date();
  const due = new Date();
  due.setHours(h, m, 0, 0);
  return now.getTime() > due.getTime();
}

export function MedicationsCard({ meds, medsTaken, toggleMed, onAddMed, onRemoveMed, colors, isDark, active, allMembers }: {
  meds: Medication[];
  medsTaken: Record<string, boolean>;
  toggleMed: (med: Medication, time: string | null) => void;
  // Real dosage/frequency/schedule form (AddMedModal, the same one
  // HealthTab.tsx's Health screen uses) instead of the old name+time-only
  // stub — a medication feature with no dosage, recurrence, or start/end
  // date wasn't a real medication tracker (live-reported: "not a good
  // form... like any generic app does"). Second arg lets a parent target a
  // DIFFERENT family member than the active profile — was always [active]
  // only, so the "Assigned To" picker never appeared here even though
  // AddMedModal/useMedications both support it (direct report: "can we
  // also add medicines for others in the family from parents?").
  onAddMed: (form: any, targetMemberId?: string) => Promise<void>;
  onRemoveMed: (id: string) => void;
  colors: any; isDark: boolean;
  active: { id: string; name: string };
  // Full family, so AddMedModal's member picker has more than one option
  // and so each row can show WHO added it when it wasn't the viewer
  // themselves (this card's list itself stays filtered to just `active`'s
  // own meds — a kid's Hub never shows anyone else's medications, only who
  // added their own).
  allMembers: { id: string; name: string }[];
}) {
  const [showAddMed, setShowAddMed] = useState(false);

  // Whether any dose is overdue still expands the section by default (a
  // real "needs attention" signal), but the red tint itself belongs on
  // just that ONE medication's row — tinting the whole card also
  // highlighted already-taken, unrelated medications [live-reported:
  // "why whole section red it should show only the overdue card red
  // tinted"].
  const hasOverdueDose = meds.some(med => {
    if (medsTaken[med.id]) return false;
    const times = med.frequency_times?.length ? med.frequency_times : [null];
    return times.some(time => {
      const multiDose = (med.frequency_times?.length ?? 0) > 1;
      const doseTaken = multiDose
        ? (med.taken_dates ?? []).includes(encodeTakenEntry(todayLocalStr(), time))
        : medsTaken[med.id];
      return !doseTaken && isDoseOverdue(time);
    });
  });

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
          // Only shown when someone ELSE added it — self-added meds (the
          // common case) stay uncluttered. Was invisible either way before;
          // now that a parent can add a med here for a different member
          // (see onAddMed above), the receiving member's own Hub should be
          // able to tell it wasn't something they added themselves.
          const addedByOther = med.assigned_by && med.assigned_by !== active.id;
          const addedByName = addedByOther ? allMembers.find(m => m.id === med.assigned_by)?.name?.split(' ')[0] : null;
          // Was tinting the WHOLE card red whenever ANY medication had an
          // overdue dose, which also highlighted unrelated, already-taken
          // medications in the same list [live-reported: "why whole
          // section red it should show only the overdue card red
          // tinted"]. Scoped down to just this one row.
          const rowOverdue = !taken && (med.frequency_times?.length ? med.frequency_times : [null]).some(time => {
            const multiDose = (med.frequency_times?.length ?? 0) > 1;
            const doseTaken = multiDose ? (med.taken_dates ?? []).includes(encodeTakenEntry(todayLocalStr(), time)) : taken;
            return !doseTaken && isDoseOverdue(time);
          });
          return (
            <View key={med.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
              paddingHorizontal: rowOverdue ? 10 : 0,
              borderRadius: rowOverdue ? 12 : 0,
              backgroundColor: rowOverdue ? colors.danger + '14' : 'transparent',
              borderWidth: rowOverdue ? 1 : 0, borderColor: rowOverdue ? colors.danger + '40' : 'transparent',
              marginBottom: rowOverdue ? 4 : 0,
              borderBottomWidth: rowOverdue ? 1 : (i < meds.length - 1 ? 1 : 0),
              borderBottomColor: rowOverdue ? colors.danger + '40' : (isDark ? colors.border : '#F1F5F9'),
            }}>
              <Pill size={22} color={taken ? colors.textTertiary : BRAND.teal} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.sub, fontWeight: '700', color: taken ? colors.textTertiary : colors.textPrimary, textDecorationLine: taken ? 'line-through' : 'none' }}>{med.name}</Text>
                <Text style={{ fontSize: GP.tiny, color: colors.textTertiary }}>
                  {med.frequency_times?.length ? med.frequency_times.join(' & ') : 'Anytime'}{scheduleLine ? ` · ${scheduleLine}` : ''}
                  {addedByName ? ` · Added by ${addedByName}` : ''}
                </Text>
              </View>
              {/* One button per dose time for a multi-dose med (e.g.
                  twice_daily) instead of one button standing in for the
                  whole day [live-requested: "add extensive like which time
                  slot / part of day they missed", confirmed: "Add one
                  button per dose time"]. */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(med.frequency_times?.length ? med.frequency_times : [null]).map((time, idx) => {
                  const multiDose = (med.frequency_times?.length ?? 0) > 1;
                  const doseTaken = multiDose
                    ? (med.taken_dates ?? []).includes(encodeTakenEntry(todayLocalStr(), time))
                    : taken;
                  const overdue = !doseTaken && isDoseOverdue(time);
                  return (
                    <Pressable key={time ?? idx} onPress={() => toggleMed(med, multiDose ? time : null)}
                      style={{
                        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
                        backgroundColor: doseTaken ? MONEY_GREEN + '20' : overdue ? colors.danger : BRAND.teal,
                        borderWidth: doseTaken ? 1 : 0, borderColor: MONEY_GREEN + '40',
                      }}>
                      <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: doseTaken ? MONEY_GREEN : '#fff' }}>
                        {multiDose ? `${formatDoseTime(time as string)}${doseTaken ? ' ✓' : overdue ? ' ⚠' : ''}` : (doseTaken ? 'Taken' : overdue ? 'Overdue' : 'Mark Taken')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
        // Full family, not just [active] — AddMedModal's own "Assigned To"
        // picker now actually appears, and the picked memberId is threaded
        // through to onAddMed as an explicit target (undefined when it's
        // still `active` themselves, since that's this hook's own default).
        onSave={async (memberId, form) => {
          await onAddMed(form, memberId !== active.id ? memberId : undefined);
          setShowAddMed(false);
        }}
        members={allMembers}
        colors={colors}
        isDark={isDark}
      />
    </View>
  );
}
