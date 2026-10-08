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
import { useLiveTripEta } from '@/lib/hooks/useLiveTripEta';

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

// Spec's "Workflow status" pill is per-item state, not a static "Live"
// label on every card regardless of phase or overdue-ness — this builds
// the real label + tone from the trip's actual phase and overdue flag.
function tripStatusCopy(trip: Trip, colors: any, isDark: boolean): { label: string; color: string; bg: string } {
  if (trip.overdueAlertSent) {
    return { label: 'Running late', color: colors.danger, bg: isDark ? colors.danger + '22' : '#FFE8E3' };
  }
  switch (trip.phase) {
    case 'arrived':   return { label: 'Arrived', color: colors.teal, bg: colors.tealLight };
    case 'picked_up': return { label: 'Heading home', color: colors.teal, bg: colors.tealLight };
    case 'en_route':  return { label: 'On the way', color: colors.primary, bg: colors.primaryLight };
    default:          return { label: 'Confirmed', color: colors.sky, bg: colors.skyLight };
  }
}

function TripCard({ trip, members, onSelect }: {
  trip: Trip; members: FamilyMember[]; onSelect: (id: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const driver = members.find(m => m.id === trip.driverMemberId);
  const pickup = members.find(m => m.id === trip.pickupMemberId);
  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';
  const status = tripStatusCopy(trip, colors, isDark);
  const driverFirst = driver?.name?.split(' ')[0] ?? 'Someone';
  const pickupFirst = pickup?.name?.split(' ')[0];

  // Live ETA from the driver's actual GPS position (member_locations) to
  // the trip's pinned pickup point — only available for a trip that has
  // one AND is still heading there (en_route); falls back to the static
  // dispatch-time number otherwise, same as before this existed.
  const liveEta = useLiveTripEta(
    trip.phase === 'en_route' ? trip.driverMemberId : undefined,
    trip.pickupLat, trip.pickupLng,
  );
  const etaMinutes = liveEta?.minutes ?? trip.etaMinutes;

  // Spec's "Explanation" text — a real sentence describing what's
  // happening, built from this trip's own phase/ETA, not a flat "Driver ·
  // ETA" line that reads the same regardless of what stage the trip is in.
  const explanation = trip.overdueAlertSent
    ? `${driverFirst} is past the expected ETA${pickupFirst ? ` picking up ${pickupFirst}` : ''} — check in with them.`
    : trip.phase === 'arrived'
      ? `${driverFirst} arrived${pickupFirst ? ` with ${pickupFirst}` : ''}.`
      : trip.phase === 'picked_up'
        ? `${driverFirst} has ${pickupFirst ?? 'them'} and is heading back, ~${trip.etaMinutes} min.`
        : trip.phase === 'en_route'
          ? `${driverFirst} is on the way${pickupFirst ? ` to get ${pickupFirst}` : ''}, ~${etaMinutes} min${liveEta ? ' (live)' : ' ETA'}.`
          : `${driverFirst} confirmed${pickupFirst ? ` for ${pickupFirst}'s pickup` : ''} — ${trip.etaMinutes} min ETA.`;

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
            {pickup ? `Picking up ${pickupFirst}` : 'Family pickup'}
          </Text>
          {trip.driverNotes ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>"{trip.driverNotes}"</Text>
          ) : null}
        </View>
        <View style={{ backgroundColor: status.bg, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: status.color }}>{status.label}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
        {explanation}
      </Text>
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
  const driver = driverId ? members.find(m => m.id === driverId) : undefined;
  const borderColor = isDark ? colors.border : 'rgba(223,97,60,0.10)';

  // Was a static "Upcoming" pill + ProgressTrack hard-coded to phase=
  // "assigned" on EVERY card, even one with no driver at all — a ride that
  // still needs a driver isn't "confirmed," it just happened to render the
  // same filled first bar segment as one that genuinely was. Status +
  // explanation now reflect whether a driver is actually assigned yet.
  const statusLabel = driverId ? 'Confirmed' : 'Needs a driver';
  const statusColor = driverId ? colors.sky : colors.danger;
  const statusBg    = driverId ? colors.skyLight : (isDark ? colors.danger + '22' : '#FFE8E3');
  const explanation = driverId
    ? `${driver?.name?.split(' ')[0] ?? 'A driver'} is confirmed${event.time ? ` for ${event.time}` : ''}${event.location ? ` at ${event.location}` : ''}.`
    : `No driver yet${event.time ? ` — ${event.time}` : ''}${event.location ? ` at ${event.location}` : ''}. Set one up before it's needed.`;

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
        </View>
        <View style={{ backgroundColor: statusBg, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: statusColor }}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, lineHeight: 18 }}>
        {explanation}
      </Text>
      {driverId && <ProgressTrack phase="assigned" />}
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

        {/* Filter segments — Figma spec's "View filters": full-width equal
            segments in a #E9EDF5-equivalent track (colors.surface), 4px
            padding, 4px gap, active segment white with 11px radius, 40px
            tall. Was a content-width pill row (borderRadius:100, tinted
            active bg) reused from elsewhere — different shape entirely
            from the spec's actual segmented control. */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, gap: 4 }}>
          {pills.map(p => {
            const isActive = p.key === filter;
            return (
              <Pressable
                key={p.key}
                onPress={() => setFilter(p.key)}
                style={{ flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isActive ? colors.card : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '400', color: isActive ? colors.teal : colors.textSecondary }}>
                  {p.label}{p.count > 0 ? ` · ${p.count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Explanation line — spec's own per-segment "Explanation" text
            block: a one-line description of what this filter actually
            shows right now, built from real counts/state, not a static
            caption. */}
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: -8 }}>
          {filter === 'active'
            ? (liveTrips.length > 0
                ? `${liveTrips.length} ride${liveTrips.length === 1 ? '' : 's'} on the road right now.`
                : 'Nothing moving right now — dispatch a ride to see it here.')
            : filter === 'upcoming'
              ? (upcomingEvents.length > 0
                  ? `${upcomingEvents.length} ride${upcomingEvents.length === 1 ? '' : 's'} still need${upcomingEvents.length === 1 ? 's' : ''} a driver.`
                  : 'Every upcoming ride already has a driver.')
              : (completedTrips.length > 0
                  ? `Last ${completedTrips.length} completed ride${completedTrips.length === 1 ? '' : 's'}, most recent first.`
                  : 'No completed rides yet.')}
        </Text>

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
