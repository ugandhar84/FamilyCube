/**
 * RidesControlRoomScreen — parent overview of all family rides.
 *
 * Active: live trips from useTripStore (en_route / picked_up)
 * Upcoming: calendar_events with rideRequired=true, no active trip linked
 * History: completed trips (completedAt != null)
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useTripStore, type Trip, type TripPhase } from '@/store/tripStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { TYPO, RADIUS } from '@/constants/theme';

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
  const m = members.find(m => m.id === id);
  return m?.name ?? 'Unassigned';
}

function memberInitial(id: string | undefined, members: FamilyMember[]): string {
  const n = memberName(id, members);
  return n[0]?.toUpperCase() ?? '?';
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
            flex: 1, textAlign: 'center',
            fontSize: 9, fontWeight: '400',
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
  const driverInitial = memberInitial(trip.driverMemberId, members);
  const pickup = members.find(m => m.id === trip.pickupMemberId);

  return (
    <Pressable
      onPress={() => onSelect(trip.id)}
      style={{
        backgroundColor: colors.card, borderRadius: RADIUS.xxl,
        padding: 18, gap: 12,
        borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
        {pickup ? `Picking up ${pickup.name.split(' ')[0]}` : 'Family pickup'}
      </Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
        {trip.etaMinutes} min ETA{trip.driverNotes ? ` · ${trip.driverNotes}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{driverInitial}</Text>
        </View>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.textPrimary }}>
          {driver?.name ?? 'Unassigned'}
        </Text>
      </View>
      <ProgressTrack phase={trip.phase} />
      <Text style={{ fontSize: 12, fontWeight: '500', color: colors.teal, textAlign: 'right' }}>
        View details →
      </Text>
    </Pressable>
  );
}

function EventCard({ event, members }: { event: FamilyEvent; members: FamilyMember[] }) {
  const { colors, isDark } = useTheme();
  const driverId = event.driverId ?? event.helperId;
  const driverInitial = memberInitial(driverId, members);
  const driverDisplayName = memberName(driverId, members);

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: RADIUS.xxl,
      padding: 18, gap: 12,
      borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
    }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{event.title}</Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
        {[event.time, event.location].filter(Boolean).join(' · ') || 'No time set'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: driverId ? colors.primary : colors.surface,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{driverInitial}</Text>
        </View>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.textPrimary }}>
          {driverId ? `Going with ${driverDisplayName}` : 'No one assigned yet'}
        </Text>
      </View>
      {/* Static "assigned" progress for upcoming */}
      <ProgressTrack phase="assigned" />
      <Pressable style={{
        marginTop: 4, borderRadius: RADIUS.md, paddingVertical: 10,
        paddingHorizontal: 16, backgroundColor: colors.primary, alignItems: 'center',
      }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#FFFFFF' }}>
          Set up this ride →
        </Text>
      </Pressable>
    </View>
  );
}

function FilterPills({ active, onSelect }: { active: FilterKey; onSelect: (k: FilterKey) => void }) {
  const { colors } = useTheme();
  const pills: { key: FilterKey; label: string }[] = [
    { key: 'active',   label: 'Active'   },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'history',  label: 'History'  },
  ];
  return (
    <View style={{
      flexDirection: 'row', backgroundColor: colors.surface,
      borderRadius: 14, padding: 4, gap: 4, alignSelf: 'flex-start',
    }}>
      {pills.map(p => {
        const isActive = p.key === active;
        return (
          <Pressable
            key={p.key}
            onPress={() => onSelect(p.key)}
            style={{
              borderRadius: 100, paddingVertical: 7, paddingHorizontal: 14,
              backgroundColor: isActive ? colors.primaryLight : 'transparent',
            }}
          >
            <Text style={{
              fontSize: TYPO.caption,
              fontWeight: isActive ? '600' : '400',
              color: isActive ? colors.primary : colors.textSecondary,
            }}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
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
  const events  = useEventStore(s => s.events);
  const members = useFamilyStore(s => s.members);

  // Flatten all events
  const allEvents = useMemo(
    () => Object.values(events).flat(),
    [events],
  );

  // Active = live trips not yet completed
  const liveTrips = useMemo(
    () => activeTrips.filter(t => !t.completedAt),
    [activeTrips],
  );

  // Upcoming = ride-required events that don't have a matching active trip
  const activeTripEventIds = new Set(liveTrips.map(t => t.eventId).filter(Boolean) as string[]);
  const upcomingEvents = useMemo(
    () => allEvents.filter(e =>
      e.rideRequired && !activeTripEventIds.has(e.id)
    ),
    [allEvents, activeTripEventIds],
  );

  // History = completed trips from store (completedAt set)
  const completedTrips = useMemo(
    () => [...activeTrips].filter(t => !!t.completedAt)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [activeTrips],
  );

  const firstLive = liveTrips[0];
  const cardBorder = { borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)' };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back link */}
      <Pressable onPress={onClose}>
        <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '500' }}>← Rides</Text>
      </Pressable>

      {/* Title */}
      <Text style={{ color: colors.textPrimary, fontSize: 29, fontWeight: '700', letterSpacing: -0.5 }}>
        Rides control room
      </Text>

      {/* Active alert */}
      {firstLive && (
        <Pressable
          onPress={() => onSelectTrip?.(firstLive.id)}
          style={{ backgroundColor: colors.primaryLight, borderRadius: RADIUS.xxl, padding: 18, ...cardBorder }}
        >
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
            Active ride in progress
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
            {members.find(m => m.id === firstLive.driverMemberId)?.name ?? 'Driver'} is on the way
            · {firstLive.etaMinutes} min ETA
          </Text>
          <Text style={{ color: colors.teal, fontSize: 12, fontWeight: '500', marginTop: 8 }}>
            View live detail →
          </Text>
        </Pressable>
      )}

      {/* Filter pills */}
      <FilterPills active={filter} onSelect={setFilter} />

      {/* Trip / event list */}
      {filter === 'active' && (
        liveTrips.length === 0
          ? <Text style={{ color: colors.textTertiary, fontSize: 15, textAlign: 'center', paddingVertical: 32 }}>
              No active rides right now
            </Text>
          : liveTrips.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                members={members}
                onSelect={id => onSelectTrip?.(id)}
              />
            ))
      )}

      {filter === 'upcoming' && (
        upcomingEvents.length === 0
          ? <Text style={{ color: colors.textTertiary, fontSize: 15, textAlign: 'center', paddingVertical: 32 }}>
              No upcoming rides
            </Text>
          : upcomingEvents.map(event => (
              <EventCard key={event.id} event={event} members={members} />
            ))
      )}

      {filter === 'history' && (
        completedTrips.length === 0
          ? <Text style={{ color: colors.textTertiary, fontSize: 15, textAlign: 'center', paddingVertical: 32 }}>
              No ride history yet
            </Text>
          : completedTrips.map(trip => (
              <View key={trip.id} style={{
                backgroundColor: colors.card, borderRadius: RADIUS.xxl,
                padding: 18, gap: 8, ...cardBorder,
              }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
                  {members.find(m => m.id === trip.pickupMemberId)?.name ?? 'Family'} pickup
                </Text>
                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
                  With {members.find(m => m.id === trip.driverMemberId)?.name ?? '—'}
                </Text>
                <ProgressTrack phase="arrived" />
              </View>
            ))
      )}
    </ScrollView>
  );
}
