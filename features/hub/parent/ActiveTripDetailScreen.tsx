import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, TextInput, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Car } from 'lucide-react-native';
import { OverlayHeading } from '@/components/OverlayPage';
import { useTheme } from '@/lib/ThemeContext';
import { useTripStore, type TripPhase } from '@/store/tripStore';
import { useEventStore } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { GEMINI } from '@/constants/geminiRhythm';

const STAGES: { phase: TripPhase; label: string }[] = [
  { phase: 'assigned',  label: 'Confirmed'  },
  { phase: 'en_route',  label: 'On the way' },
  { phase: 'picked_up', label: 'Got them'   },
  { phase: 'arrived',   label: 'Home'       },
];

function phaseIndex(phase: TripPhase): number {
  return STAGES.findIndex(s => s.phase === phase);
}

// CLAUDE.md §9 — 12h human format, never raw ISO/24h. trip.startedAt/
// completedAt are full ISO timestamps (not the HH:MM/YYYY-MM-DD strings
// hubUtils.ts's fmtTime/fmtHumanDateShort expect), so this reads a Date
// directly instead of forcing those through a string-split helper that
// isn't shaped for them.
function fmtTripTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

export function ActiveTripDetailScreen({ tripId, onClose }: {
  tripId: string;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const activeTrips = useTripStore(s => s.activeTrips);
  // History rows (RidesControlRoomScreen) route here too now — a finished
  // trip is never in activeTrips (removed the moment completedAt is set),
  // so it has to be looked up in completedTrips as well, or every "View
  // full details" tap on a History row would hit the "Trip not found"
  // branch below [live-requested: "why we are not showing the full
  // details upon clicking on it?"].
  const completedTrips = useTripStore(s => s.completedTrips);
  const advancePhase = useTripStore(s => s.advancePhase);
  const events = useEventStore(s => s.events);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyName = useFamilyStore(s => s.familyName);
  const activeMember = members.find(m => m.id === activeMemberId);
  const [etaNote, setEtaNote] = useState('');
  const sendRequest = useKidRequestStore(s => s.sendRequest);
  const [passengerSent, setPassengerSent] = useState<'ready' | 'late' | null>(null);

  const trip = activeTrips.find(t => t.id === tripId) ?? completedTrips.find(t => t.id === tripId);
  const isCompleted = !!trip?.completedAt;
  const borderColor = isDark ? colors.border : GEMINI.border;

  if (!trip) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.background : GEMINI.canvas }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Text style={{ color: colors.textTertiary, fontSize: 15 }}>Trip not found</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>← Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const linkedEvent = trip.eventId
    ? Object.values(events).flat().find(e => e.id === trip.eventId)
    : undefined;

  const driver = members.find(m => m.id === trip.driverMemberId);
  const driverName = driver?.name ?? 'Driver';
  const driverInitial = driverName[0]?.toUpperCase() ?? '?';

  const pickupMember = members.find(m => m.id === trip.pickupMemberId);
  const pickupName = pickupMember?.name ?? linkedEvent?.title ?? 'Family';

  const activeIdx = phaseIndex(trip.phase);
  const canDrive = !isCompleted
    && (activeMemberId === trip.driverMemberId || activeMember?.role === 'parent');
  const nextStage = canDrive ? STAGES[activeIdx + 1] : undefined;
  const isPassenger = !!activeMemberId && activeMemberId === trip.pickupMemberId;
  const statusLine =
    trip.phase === 'assigned' ? `${driverName} hasn't left yet`
    : trip.phase === 'en_route' ? `${driverName} is on the way${isPassenger ? ' — get ready' : ''}`
    : trip.phase === 'picked_up' ? `${pickupName} is picked up, heading home`
    : `Arrived`;

  async function handleAdvance() {
    if (!nextStage || !trip) return;
    await advancePhase(trip.id, nextStage.phase, etaNote || undefined);
    if (nextStage.phase === 'arrived') onClose();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.background : GEMINI.canvas }} edges={['top', 'bottom']}>
      <OverlayHeading
        eyebrow="FAMILY CUBE · RIDES"
        title={linkedEvent?.title ?? `Picking up ${pickupName}`}
        subtitle="Trip details and live progress."
        accent="sky"
        Icon={Car}
        onTitlePress={onClose}
        topInset={0}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 24, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Active/completed badge */}
        <View style={{ alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5,
          backgroundColor: isCompleted ? colors.tealLight : colors.primaryLight }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: isCompleted ? colors.teal : colors.primary }}>
            {isCompleted ? 'Completed' : 'Active now'}
          </Text>
        </View>

        {/* Route schematic — pastel tealLight */}
        <View style={[s.card, { backgroundColor: colors.tealLight, borderColor: colors.teal + '30' }]}>
          <Text style={[s.overline, { color: colors.teal }]}>ROUTE</Text>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal }} />
              <Text style={{ fontSize: 13, fontWeight: '500', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>Departure</Text>
            </View>
            <View style={{ width: 2, height: 16, backgroundColor: `${colors.teal}50`, marginLeft: 4 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.primary }} />
              <Text style={{ fontSize: 13, fontWeight: '500', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>
                {linkedEvent?.location ?? 'Destination'}
              </Text>
            </View>
          </View>
          <View style={{ backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 22 }}>🕐</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>
              {isCompleted
                ? `Started ${fmtTripTime(trip.startedAt)} · Arrived ${fmtTripTime(trip.completedAt)}`
                : `ETA: ${trip.etaMinutes} min${trip.etaMinutes === 1 ? '' : 's'}${trip.driverNotes ? ` · ${trip.driverNotes}` : ''}`}
            </Text>
          </View>
        </View>

        {/* Progress track — pastel primaryLight */}
        <View style={[s.card, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30', gap: 10 }]}>
          <Text style={[s.overline, { color: colors.primary }]}>PROGRESS</Text>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {STAGES.map((stage, i) => (
              <View key={stage.phase} style={{
                flex: 1, height: 5, borderRadius: 2.5,
                backgroundColor: i < activeIdx
                  ? colors.teal
                  : i === activeIdx
                    ? colors.primary
                    : 'rgba(88,114,196,0.18)',
              }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row' }}>
            {STAGES.map((stage, i) => (
              <Text key={stage.phase} style={{
                flex: 1, textAlign: 'center', fontSize: 10, fontWeight: i === activeIdx ? '700' : '400',
                color: i <= activeIdx ? (isDark ? colors.textPrimary : GEMINI.titleColor) : colors.textTertiary,
              }}>
                {stage.label}
              </Text>
            ))}
          </View>
        </View>

        {/* People card — pastel card */}
        <View style={[s.card, { backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderColor }]}>
          <Text style={[s.overline, { color: colors.textTertiary }]}>PEOPLE</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>{driverInitial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{driverName}</Text>
              <Text style={{ fontSize: 12, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>{isCompleted ? 'Drove them' : 'Taking them'}</Text>
            </View>
            <View style={{ backgroundColor: colors.tealLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>Driver</Text>
            </View>
          </View>

          {pickupMember && (
            <>
              <View style={{ height: 1, backgroundColor: isDark ? colors.border : GEMINI.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{(pickupMember.name[0] ?? '?').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{pickupMember.name}</Text>
                  <Text style={{ fontSize: 11, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>{isCompleted ? 'Picked up' : 'Being picked up'}</Text>
                </View>
                <View style={{ backgroundColor: colors.amberLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.amber }}>Passenger</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Driver update field — pastel surface. Hidden for a completed
            trip (read-only history view, nothing left to update)
            [live-requested: "why we are not showing the full details upon
            clicking on it?" — reuse this screen but drop the in-progress
            action controls for a finished ride]. */}
        {!isCompleted && !canDrive && (
          <View style={[s.card, { backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderColor }]}>
            <Text style={[s.overline, { color: colors.textTertiary }]}>STATUS</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{statusLine}</Text>
          </View>
        )}

        {isPassenger && !isCompleted && trip.phase !== 'arrived' && (
          <View style={{ gap: 10 }}>
            {([
              { key: 'ready' as const, label: passengerSent === 'ready' ? "Sent · you're ready ✓" : "I'm ready / outside",
                detail: `I'm ready for pickup! 🎒 (${driverName} is driving)`, urgency: 'normal' as const },
              { key: 'late' as const, label: passengerSent === 'late' ? 'Sent · running late ✓' : 'Running late',
                detail: `Running a bit late 🏃 — ${driverName}, please wait`, urgency: 'soon' as const },
            ]).map(a => (
              <TouchableOpacity
                key={a.key}
                disabled={passengerSent === a.key}
                onPress={() => {
                  if (!activeMemberId) return;
                  sendRequest({ type: 'checkin', fromMemberId: activeMemberId, detail: a.detail, urgency: a.urgency });
                  setPassengerSent(a.key);
                }}
                style={[s.btnPrimary, { backgroundColor: a.key === 'ready' ? colors.teal : colors.amber, opacity: passengerSent === a.key ? 0.6 : 1 }]}
                activeOpacity={0.85}
              >
                <Text style={s.btnPrimaryText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {canDrive && (
          <View style={[s.card, { backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderColor }]}>
            <Text style={[s.overline, { color: colors.textTertiary }]}>DRIVER UPDATE</Text>
            <TextInput
              value={etaNote}
              onChangeText={setEtaNote}
              placeholder="e.g. 5 minutes away, stuck at lights…"
              placeholderTextColor={colors.textTertiary}
              style={{
                backgroundColor: isDark ? colors.surface : GEMINI.canvas, borderRadius: 12, padding: 14,
                fontSize: 15, color: (isDark ? colors.textPrimary : GEMINI.titleColor),
                borderWidth: 1, borderColor,
              }}
            />
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>Optional — sent to family when you advance the phase</Text>
          </View>
        )}

        {isCompleted && trip.driverNotes && (
          <View style={[s.card, { backgroundColor: isDark ? colors.card : GEMINI.cardBg, borderColor }]}>
            <Text style={[s.overline, { color: colors.textTertiary }]}>DRIVER NOTE</Text>
            <Text style={{ fontSize: 14, color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{trip.driverNotes}</Text>
          </View>
        )}

        {/* Primary action CTA */}
        {nextStage && (
          <TouchableOpacity
            onPress={handleAdvance}
            style={[s.btnPrimary, { backgroundColor: colors.pink }]}
            activeOpacity={0.85}
          >
            <Text style={s.btnPrimaryText}>
              {nextStage.phase === 'en_route'  ? "I'm on my way →"          :
               nextStage.phase === 'picked_up' ? "Got them, heading home →" :
               nextStage.phase === 'arrived'   ? "We're home →"             :
               `${nextStage.label} →`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Skip to complete */}
        {canDrive && trip.phase !== 'arrived' && (
          <TouchableOpacity
            onPress={async () => {
              await advancePhase(trip.id, 'arrived', etaNote || undefined);
              onClose();
            }}
            style={[s.btnOutline, { backgroundColor: isDark ? colors.surface : GEMINI.canvas, borderColor }]}
            activeOpacity={0.85}
          >
            <Text style={[s.btnOutlineText, { color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }]}>Mark as complete</Text>
          </TouchableOpacity>
        )}

        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, textAlign: 'center', letterSpacing: 0.3 }}>
          Connect. Organize. Care. Grow.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    gap: 12,
  },
  overline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  btnPrimary: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnOutline: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnOutlineText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
