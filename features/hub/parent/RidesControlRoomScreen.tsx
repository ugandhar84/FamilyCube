import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useTripStore, type Trip, type TripPhase } from '@/store/tripStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';

type FilterKey = 'active' | 'upcoming' | 'history';

const PHASE_STAGES: { phase: TripPhase; label: string }[] = [
  { phase: 'assigned',  label: 'Confirmed'  },
  { phase: 'en_route',  label: 'On the way' },
  { phase: 'picked_up', label: 'Got them'   },
  { phase: 'arrived',   label: 'Home'       },
];

function phaseIndex(phase: TripPhase): number {
  return PHASE_STAGES.findIndex(s => s.phase === phase);
}

function memberName(id: string | undefined, members: FamilyMember[]): string {
  if (!id) return 'Unassigned';
  return members.find(m => m.id === id)?.name ?? 'Unassigned';
}

function memberInitial(id: string | undefined, members: FamilyMember[]): string {
  return memberName(id, members)[0]?.toUpperCase() ?? '?';
}

function ProgressTrack({ phase }: { phase: TripPhase }) {
  const { colors } = useTheme();
  const current = phaseIndex(phase);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {PHASE_STAGES.map((s, i) => (
          <View key={s.phase} style={{
            flex: 1, height: 4, borderRadius: 2,
            backgroundColor: i < current ? colors.teal : i === current ? colors.primary : colors.surface,
          }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {PHASE_STAGES.map((s, i) => (
          <Text key={s.phase} style={{
            flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '400',
            color: i <= current ? colors.textSecondary : colors.textTertiary,
          }}>
            {s.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TripCard({ trip, members, onSelect }: {
  trip: Trip; members: FamilyMember[]; onSelect: (id: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const driver = members.find(m => m.id === trip.driverMemberId);
  const pickup = members.find(m => m.id === trip.pickupMemberId);
  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  return (
    <Pressable
      onPress={() => onSelect(trip.id)}
      style={[s.card, { backgroundColor: colors.card, borderColor }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
            {memberInitial(trip.driverMemberId, members)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
            {pickup ? `Picking up ${pickup.name.split(' ')[0]}` : 'Family pickup'}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
            {driver?.name ?? 'Unassigned'} · {trip.etaMinutes} min ETA
            {trip.driverNotes ? ` · ${trip.driverNotes}` : ''}
          </Text>
        </View>
        <View style={{ backgroundColor: colors.primaryLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>Live</Text>
        </View>
      </View>
      <ProgressTrack phase={trip.phase} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal, textAlign: 'right' }}>
        View details →
      </Text>
    </Pressable>
  );
}

function EventCard({ event, members, onDispatch }: {
  event: FamilyEvent; members: FamilyMember[]; onDispatch?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const driverId = event.driverId ?? event.helperId;
  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: driverId ? colors.teal : colors.surface,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: driverId ? '#FFFFFF' : colors.textTertiary }}>
            {memberInitial(driverId, members)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>{event.title}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
            {[event.time, event.location].filter(Boolean).join(' · ') || 'No time set'}
          </Text>
        </View>
        <View style={{ backgroundColor: colors.amberLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.amber }}>Upcoming</Text>
        </View>
      </View>
      <ProgressTrack phase="assigned" />
      {!driverId && (
        <Pressable
          onPress={onDispatch}
          style={{ borderRadius: 12, paddingVertical: 10, backgroundColor: colors.primary, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Set up this ride →</Text>
        </Pressable>
      )}
    </View>
  );
}

export function RidesControlRoomScreen({
  onClose,
  onSelectTrip,
}: {
  onClose: () => void;
  onSelectTrip?: (tripId: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const [filter, setFilter] = useState<FilterKey>('active');

  const { activeTrips } = useTripStore();
  const events   = useEventStore(s => s.events);
  const members  = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const familyName = useFamilyStore(s => s.familyName);
  const activeMember = members.find(m => m.id === activeMemberId);

  const allEvents = useMemo(() => Object.values(events).flat(), [events]);

  const liveTrips = useMemo(() => activeTrips.filter(t => !t.completedAt), [activeTrips]);

  const activeTripEventIds = new Set(liveTrips.map(t => t.eventId).filter(Boolean) as string[]);
  const upcomingEvents = useMemo(
    () => allEvents.filter(e => e.rideRequired && !activeTripEventIds.has(e.id)),
    [allEvents, activeTripEventIds],
  );

  const completedTrips = useMemo(
    () => [...activeTrips].filter(t => !!t.completedAt)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [activeTrips],
  );

  const firstLive = liveTrips[0];
  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  const pills: { key: FilterKey; label: string; count: number }[] = [
    { key: 'active',   label: 'Active',   count: liveTrips.length },
    { key: 'upcoming', label: 'Upcoming', count: upcomingEvents.length },
    { key: 'history',  label: 'History',  count: completedTrips.length },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* ── Fixed page header ── */}
      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)', gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textTertiary }}>
            {familyName?.toUpperCase() ?? 'FAMILY'}
          </Text>
          {activeMember ? (
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>
              {activeMember.name} · {activeMember.role}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={onClose} style={{ alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>← Hub</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 29, fontWeight: '700', letterSpacing: -0.5, lineHeight: 34, marginTop: 4, color: colors.textPrimary }}>
              Family rides
            </Text>
          </View>
          <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
            <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Active ride alert */}
        {firstLive && (
          <Pressable
            onPress={() => onSelectTrip?.(firstLive.id)}
            style={[s.card, { backgroundColor: colors.primaryLight, borderColor }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                  {memberInitial(firstLive.driverMemberId, members)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary }}>Active ride in progress</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
                  {members.find(m => m.id === firstLive.driverMemberId)?.name ?? 'Driver'} · {firstLive.etaMinutes} min ETA
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal, textAlign: 'right' }}>
              View live detail →
            </Text>
          </Pressable>
        )}

        {/* Filter pills */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, padding: 4, gap: 4, alignSelf: 'flex-start' }}>
          {pills.map(p => {
            const isActive = p.key === filter;
            return (
              <Pressable
                key={p.key}
                onPress={() => setFilter(p.key)}
                style={{ borderRadius: 100, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: isActive ? colors.primaryLight : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontWeight: isActive ? '600' : '400', color: isActive ? colors.primary : colors.textSecondary }}>
                  {p.label}{p.count > 0 ? ` · ${p.count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Lists */}
        {filter === 'active' && (
          liveTrips.length === 0
            ? <Text style={{ color: colors.textTertiary, fontSize: 15, textAlign: 'center', paddingVertical: 32 }}>No active rides right now</Text>
            : liveTrips.map(trip => <TripCard key={trip.id} trip={trip} members={members} onSelect={id => onSelectTrip?.(id)} />)
        )}

        {filter === 'upcoming' && (
          upcomingEvents.length === 0
            ? <Text style={{ color: colors.textTertiary, fontSize: 15, textAlign: 'center', paddingVertical: 32 }}>No upcoming rides</Text>
            : upcomingEvents.map(event => <EventCard key={event.id} event={event} members={members} />)
        )}

        {filter === 'history' && (
          completedTrips.length === 0
            ? <Text style={{ color: colors.textTertiary, fontSize: 15, textAlign: 'center', paddingVertical: 32 }}>No ride history yet</Text>
            : completedTrips.map(trip => (
                <View key={trip.id} style={[s.card, { backgroundColor: colors.card, borderColor }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textTertiary }}>
                        {memberInitial(trip.driverMemberId, members)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                        {members.find(m => m.id === trip.pickupMemberId)?.name ?? 'Family'} pickup
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
                        With {members.find(m => m.id === trip.driverMemberId)?.name ?? '—'}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: colors.tealLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>Arrived ✓</Text>
                    </View>
                  </View>
                  <ProgressTrack phase="arrived" />
                </View>
              ))
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
});
