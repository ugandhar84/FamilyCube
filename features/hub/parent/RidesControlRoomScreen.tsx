/**
 * RidesControlRoomScreen — parent sees all ride-required events grouped
 * as Active / Upcoming / History, with a 4-stage progress track per trip.
 *
 * rideStatus and passengers are not part of the core FamilyEvent type;
 * they may exist on specific events. All access is via optional chaining.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useFamilyStore, type FamilyMember } from '@/store/familyStore';
import { TYPO, RADIUS } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type RideStatus = 'assigned' | 'en_route' | 'picked_up' | 'arrived';
type FilterKey  = 'active' | 'upcoming' | 'history';

// FamilyEvent with the optional ride-tracking extensions used by this screen.
type RideEvent = FamilyEvent & {
  rideStatus?: RideStatus;
  passengers?: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberFirstName(id: string | undefined, members: FamilyMember[]): string {
  if (!id) return 'Unassigned';
  const m = members.find(m => m.id === id);
  return m ? (m.name.split(' ')[0] ?? m.name) : 'Unassigned';
}

function memberInitial(id: string | undefined, members: FamilyMember[]): string {
  if (!id) return '?';
  const m = members.find(m => m.id === id);
  return m ? (m.name[0] ?? '?').toUpperCase() : '?';
}

const RIDE_STAGES: { key: RideStatus | 'unassigned'; label: string }[] = [
  { key: 'assigned',  label: 'Assigned' },
  { key: 'en_route',  label: 'En route' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'arrived',   label: 'Arrived' },
];

function stageIndex(status: RideStatus | undefined): number {
  if (!status) return 0;
  const i = RIDE_STAGES.findIndex(s => s.key === status);
  return i < 0 ? 0 : i;
}

function isRideRequired(e: FamilyEvent): boolean {
  return !!e.rideRequired || e.category === 'Ride';
}

// ─── Progress track ───────────────────────────────────────────────────────────

interface ProgressTrackProps {
  rideStatus?: RideStatus;
}

function ProgressTrack({ rideStatus }: ProgressTrackProps) {
  const { colors } = useTheme();
  const current = stageIndex(rideStatus);

  return (
    <View style={{ gap: 4 }}>
      {/* Segments */}
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {RIDE_STAGES.map((stage, i) => {
          const done   = i < current;
          const active = i === current;
          return (
            <View
              key={stage.key}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: done ? colors.teal : active ? colors.primary : colors.surface,
              }}
            />
          );
        })}
      </View>
      {/* Labels */}
      <View style={{ flexDirection: 'row' }}>
        {RIDE_STAGES.map((stage, i) => (
          <View key={stage.key} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: '400', color: colors.textTertiary }}>
              {stage.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Trip card ────────────────────────────────────────────────────────────────

interface TripCardProps {
  event: RideEvent;
  members: FamilyMember[];
  isUpcoming: boolean;
}

function TripCard({ event, members, isUpcoming }: TripCardProps) {
  const { colors } = useTheme();
  const driverId  = event.driverId ?? event.helperId;
  const driverName = memberFirstName(driverId, members);
  const initial   = memberInitial(driverId, members);

  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: RADIUS.xxl,
      padding: 18,
      gap: 12,
      borderWidth: 1,
      borderColor: `rgba(223,97,60,0.10)`,
    }}>
      {/* Title */}
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
        {event.title}
      </Text>

      {/* Time + location */}
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
        {[event.time, event.location].filter(Boolean).join(' · ') || 'No time set'}
      </Text>

      {/* Driver row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
            {initial}
          </Text>
        </View>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.textPrimary }}>
          Driver: {driverName}
        </Text>
      </View>

      {/* Progress track */}
      <ProgressTrack rideStatus={event.rideStatus} />

      {/* Arrange button for upcoming */}
      {isUpcoming && (
        <Pressable
          style={({ pressed }) => ({
            marginTop: 4,
            borderRadius: RADIUS.md,
            paddingVertical: 10,
            paddingHorizontal: 16,
            backgroundColor: colors.primary,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#FFFFFF' }}>
            Arrange ride →
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Filter pills ─────────────────────────────────────────────────────────────

interface FilterPillsProps {
  active: FilterKey;
  onSelect: (k: FilterKey) => void;
}

function FilterPills({ active, onSelect }: FilterPillsProps) {
  const { colors } = useTheme();
  const pills: { key: FilterKey; label: string }[] = [
    { key: 'active',   label: 'Active' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'history',  label: 'History' },
  ];

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 4,
      gap: 4,
      alignSelf: 'flex-start',
    }}>
      {pills.map(pill => {
        const isActive = pill.key === active;
        return (
          <Pressable
            key={pill.key}
            onPress={() => onSelect(pill.key)}
            style={({ pressed }) => ({
              borderRadius: 100,
              paddingVertical: 7,
              paddingHorizontal: 14,
              backgroundColor: isActive ? colors.primaryLight : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{
              fontSize: TYPO.caption,
              fontWeight: isActive ? '600' : '400',
              color: isActive ? colors.primary : colors.textSecondary,
            }}>
              {pill.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function RidesControlRoomScreen({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<FilterKey>('upcoming');

  const events  = useEventStore(s => s.events) as RideEvent[];
  const members = useFamilyStore(s => s.members);

  const rideEvents = useMemo<RideEvent[]>(
    () => events.filter(e => isRideRequired(e)),
    [events],
  );

  const activeRides = useMemo(
    () => rideEvents.filter(e => e.rideStatus === 'en_route' || e.rideStatus === 'picked_up'),
    [rideEvents],
  );

  const upcomingRides = useMemo(
    () => rideEvents.filter(e => !e.rideStatus || e.rideStatus === 'assigned'),
    [rideEvents],
  );

  const historyRides = useMemo(
    () => rideEvents.filter(e => e.rideStatus === 'arrived'),
    [rideEvents],
  );

  const visibleRides: RideEvent[] = filter === 'active'
    ? activeRides
    : filter === 'upcoming'
      ? upcomingRides
      : historyRides;

  const firstActive = activeRides[0];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back link */}
      <Pressable onPress={onClose} hitSlop={12}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '500', color: colors.teal }}>
          ← Rides
        </Text>
      </Pressable>

      {/* Title */}
      <Text style={{ fontSize: 29, fontWeight: '700', color: colors.textPrimary }}>
        Rides control room
      </Text>

      {/* Filter pills */}
      <FilterPills active={filter} onSelect={setFilter} />

      {/* Active ride alert */}
      {firstActive && (
        <View style={{
          backgroundColor: colors.primaryLight,
          borderRadius: RADIUS.xxl,
          padding: 18,
          borderWidth: 1,
          borderColor: `rgba(223,97,60,0.10)`,
          gap: 6,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>
            Active ride in progress
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
            {firstActive.location ?? firstActive.title}
          </Text>
        </View>
      )}

      {/* Trip cards */}
      {visibleRides.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 32 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textTertiary }}>
            No rides in this view
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {visibleRides.map(event => (
            <TripCard
              key={event.id}
              event={event}
              members={members}
              isUpcoming={filter === 'upcoming'}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
