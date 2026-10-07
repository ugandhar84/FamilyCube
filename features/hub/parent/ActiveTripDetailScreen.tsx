import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useTripStore, type TripPhase } from '@/store/tripStore';
import { useEventStore } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { RADIUS } from '@/constants/theme';

const STAGES: { phase: TripPhase; label: string }[] = [
  { phase: 'assigned',  label: 'Confirmed'  },
  { phase: 'en_route',  label: 'On the way' },
  { phase: 'picked_up', label: 'Got them'   },
  { phase: 'arrived',   label: 'Home'       },
];

function phaseIndex(phase: TripPhase): number {
  return STAGES.findIndex(s => s.phase === phase);
}

function MemberAvatar({ name, size, bg }: { name: string; size: number; bg: string }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.4, fontWeight: '700' }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function ActiveTripDetailScreen({ tripId, onClose }: {
  tripId: string;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const activeTrips = useTripStore(s => s.activeTrips);
  const advancePhase = useTripStore(s => s.advancePhase);
  const events = useEventStore(s => s.events);
  const members = useFamilyStore(s => s.members);
  const [etaNote, setEtaNote] = useState('');

  const trip = activeTrips.find(t => t.id === tripId);

  const cardBorder = {
    borderWidth: 1,
    borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
  };

  if (!trip) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.textTertiary, fontSize: 15 }}>Trip not found</Text>
        <Pressable onPress={onClose} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Find linked event if any
  const linkedEvent = trip.eventId
    ? Object.values(events).flat().find(e => e.id === trip.eventId)
    : undefined;

  const driver = members.find(m => m.id === trip.driverMemberId);
  const driverName = driver?.name ?? 'Driver';

  const pickupMember = members.find(m => m.id === trip.pickupMemberId);
  const pickupName = pickupMember?.name ?? linkedEvent?.title ?? 'Family';

  const activeIdx = phaseIndex(trip.phase);

  // Next phase for the CTA
  const nextStage = STAGES[activeIdx + 1];

  async function handleAdvance() {
    if (!nextStage || !trip) return;
    await advancePhase(trip.id, nextStage.phase, etaNote || undefined);
    if (nextStage.phase === 'arrived') onClose();
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back link */}
      <Pressable onPress={onClose}>
        <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '500' }}>← Active trip</Text>
      </Pressable>

      {/* Title + status */}
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 29, fontWeight: '700', letterSpacing: -0.5, lineHeight: 36 }}>
          {linkedEvent?.title ?? `Picking up ${pickupName}`}
        </Text>
        <View style={{
          alignSelf: 'flex-start',
          backgroundColor: colors.primaryLight,
          borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5,
        }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Active now</Text>
        </View>
      </View>

      {/* Route schematic card */}
      <View style={{
        backgroundColor: colors.tealLight, borderRadius: RADIUS.xxl,
        padding: 20, gap: 12, ...cardBorder,
      }}>
        <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '600' }}>Route</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal }} />
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Departure</Text>
        </View>

        <View style={{ width: 2, height: 20, backgroundColor: colors.border, marginLeft: 3 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.primary }} />
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            {linkedEvent?.location ?? 'Destination'}
          </Text>
        </View>

        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '500', marginTop: 4 }}>
          ETA: {trip.etaMinutes} min{trip.etaMinutes === 1 ? '' : 's'}{trip.driverNotes ? ` · ${trip.driverNotes}` : ''}
        </Text>
      </View>

      {/* Progress track */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {STAGES.map((s, i) => (
            <View key={s.phase} style={{
              flex: 1, height: 4, borderRadius: 2,
              backgroundColor: i < activeIdx
                ? colors.teal
                : i === activeIdx
                  ? colors.primary
                  : colors.surface,
            }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row' }}>
          {STAGES.map((s, i) => (
            <Text key={s.phase} style={{
              flex: 1, textAlign: 'center',
              fontSize: 9, fontWeight: '400',
              color: i <= activeIdx ? colors.textSecondary : colors.textTertiary,
            }}>
              {s.label}
            </Text>
          ))}
        </View>
      </View>

      {/* People card */}
      <View style={{
        backgroundColor: colors.card, borderRadius: RADIUS.xxl,
        padding: 18, gap: 12, ...cardBorder,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <MemberAvatar name={driverName} size={36} bg={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{driverName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Taking them</Text>
          </View>
          <View style={{
            backgroundColor: colors.primaryLight, borderRadius: 100,
            paddingHorizontal: 8, paddingVertical: 3,
          }}>
            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>With them</Text>
          </View>
        </View>

        {pickupMember && (
          <>
            <View style={{ height: 1, backgroundColor: isDark ? colors.border : 'rgba(44,39,34,0.06)' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MemberAvatar name={pickupMember.name} size={28} bg={colors.surface} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }}>
                  {pickupMember.name}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Being picked up</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* ETA / note field */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
          Driver update (optional)
        </Text>
        <TextInput
          value={etaNote}
          onChangeText={setEtaNote}
          placeholder="e.g. 5 minutes away, stuck at lights…"
          placeholderTextColor={colors.textTertiary}
          style={{
            backgroundColor: colors.surface, borderRadius: RADIUS.md,
            padding: 12, fontSize: 15, color: colors.textPrimary,
            ...cardBorder,
          }}
        />
      </View>

      {/* Primary action — advance to next phase */}
      {nextStage && (
        <Pressable
          onPress={handleAdvance}
          style={{
            backgroundColor: colors.primary, borderRadius: RADIUS.md,
            paddingVertical: 16, alignItems: 'center',
            shadowColor: colors.primary, shadowOpacity: 0.25,
            shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>
            {nextStage.phase === 'en_route'  ? "I'm on my way →"     :
             nextStage.phase === 'picked_up' ? "Got them, heading home →" :
             nextStage.phase === 'arrived'   ? "We're home →"            :
             `${nextStage.label} →`}
          </Text>
        </Pressable>
      )}

      {/* Direct complete — skip remaining phases */}
      {trip.phase !== 'arrived' && (
        <Pressable
          onPress={async () => {
            await advancePhase(trip.id, 'arrived', etaNote || undefined);
            onClose();
          }}
          style={{
            backgroundColor: colors.surface, borderRadius: RADIUS.md,
            paddingVertical: 14, alignItems: 'center',
            borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>
            Mark as complete
          </Text>
        </Pressable>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}
