import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { CheckCircle, Plus, Trash2 } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KidSectionHeader } from '../kid/KidSectionHeader';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { GP } from './seniorTheme';
import AddMedModal from '@/features/vault/tabs/health/AddMedModal';
import FamilyAvatar from '@/components/FamilyAvatar';
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
  active: { id: string; name: string; emoji?: string; avatarUrl?: string };
  // Full family, so AddMedModal's member picker has more than one option
  // and so each row can show WHO added it when it wasn't the viewer
  // themselves (this card's list itself stays filtered to just `active`'s
  // own meds — a kid's Hub never shows anyone else's medications, only who
  // added their own).
  // Widened from {id, name} — callers already pass the full family member
  // objects (which carry emoji/avatarUrl), but this type previously
  // dropped them, which is why each row fell back to a generic Pill icon
  // instead of the medication's own member avatar even when one was set
  // (live-reported: "on medical card we are not showing the avatar even
  // it is available").
  allMembers: { id: string; name: string; emoji?: string; avatarUrl?: string }[];
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

  const title = isDark ? colors.textPrimary : GEMINI.titleColor;
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const shadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const left = meds.filter(m => !medsTaken[m.id]).length;

  return (
    <View style={{ gap: RHYTHM.item }}>
      <View style={{ paddingHorizontal: 16 }}>
        <KidSectionHeader label="MEDICATIONS" accent={colors.pink} colors={colors} />
        <Text style={{ fontSize: GP.body, fontWeight: '700', color: body }}>
          {meds.length === 0 ? 'No medications yet' : left === 0 ? 'All taken for today' : `${left} still to take today`}
        </Text>
      </View>

      {meds.map(med => {
        const taken = !!medsTaken[med.id];
        const scheduleLine = [
          med.dosage ? `${med.dosage}${med.dosage_unit ? ' ' + med.dosage_unit : ''}` : null,
          FREQ_LABELS[med.frequency] ?? med.frequency,
        ].filter(Boolean).join(' · ');
        const addedByOther = med.assigned_by && med.assigned_by !== active.id;
        const addedByName = addedByOther ? allMembers.find(m => m.id === med.assigned_by)?.name?.split(' ')[0] : null;
        const medMember = allMembers.find(m => m.id === med.member_id) ?? active;
        const times = med.frequency_times?.length ? med.frequency_times : [null];
        const multiDose = (med.frequency_times?.length ?? 0) > 1;
        const doseState = (time: string | null) => {
          const doseTaken = multiDose ? (med.taken_dates ?? []).includes(encodeTakenEntry(todayLocalStr(), time)) : taken;
          return { doseTaken, overdue: !doseTaken && isDoseOverdue(time) };
        };
        const rowOverdue = times.some(t => doseState(t).overdue);
        const cardBg = taken ? colors.tealLight : rowOverdue ? colors.dangerLight : colors.pinkLight;
        return (
          <View key={med.id} style={{ marginHorizontal: 16, borderRadius: 22, padding: RHYTHM.card, gap: RHYTHM.item, backgroundColor: cardBg,
            borderWidth: 1, borderColor: taken ? colors.teal + '40' : rowOverdue ? colors.danger + '50' : colors.pink + '40', ...shadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <FamilyAvatar name={medMember.name} emoji={medMember.emoji} avatarUrl={medMember.avatarUrl}
                siblings={allMembers.map(m => m.name)} size={44} ringColor={taken ? colors.teal : rowOverdue ? colors.danger : colors.pink} ringWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: GP.title, fontWeight: '800', color: title }} numberOfLines={2}>{med.name}</Text>
                <Text style={{ fontSize: GP.sub, fontWeight: '600', color: body, marginTop: 2 }}>
                  {scheduleLine || 'Any time'}{addedByName ? ` · Added by ${addedByName}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => Alert.alert('Remove Medication', `Remove "${med.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => onRemoveMed(med.id) },
              ])} accessibilityRole="button" accessibilityLabel={`Remove ${med.name}`} hitSlop={8}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
                <Trash2 size={16} color={colors.textTertiary} />
              </Pressable>
            </View>

            <View style={{ gap: 8 }}>
              {times.map((time, idx) => {
                const { doseTaken, overdue } = doseState(time);
                const when = time ? formatDoseTime(time) : 'Today';
                return (
                  <Pressable key={time ?? idx}
                    onPress={() => {
                      const toggle = () => toggleMed(med, multiDose ? time : null);
                      // Undoing a dose that is already marked taken needs a confirmation (a stray tap shouldn't un-take it).
                      if (doseTaken) Alert.alert('Undo this dose?', `${med.name} · ${when} will be marked as not taken.`, [
                        { text: 'Keep as taken', style: 'cancel' },
                        { text: 'Undo', style: 'destructive', onPress: toggle },
                      ]);
                      else toggle();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${med.name} ${when} ${doseTaken ? 'taken' : 'mark taken'}`}
                    style={{ minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16,
                      backgroundColor: doseTaken ? colors.card : overdue ? colors.danger : colors.primary,
                      borderWidth: doseTaken ? 1 : 0, borderColor: colors.teal + '50' }}>
                    {doseTaken ? <CheckCircle size={20} color={colors.teal} /> : null}
                    <Text style={{ fontSize: GP.body, fontWeight: '800', color: doseTaken ? colors.teal : colors.textInverse }}>
                      {doseTaken ? `Taken · ${when}` : overdue ? `Overdue · ${when} · tap when taken` : `Mark taken · ${when}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <Pressable onPress={() => setShowAddMed(true)} accessibilityRole="button" accessibilityLabel="Add medication"
        style={{ marginHorizontal: 16, minHeight: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary + '40' }}>
        <Plus size={18} color={colors.primary} />
        <Text style={{ fontSize: GP.body, fontWeight: '800', color: colors.primary }}>Add medication</Text>
      </Pressable>

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
