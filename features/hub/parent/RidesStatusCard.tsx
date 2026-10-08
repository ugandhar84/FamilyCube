/**
 * RidesStatusCard — Hub home screen summary card for rides, linking to
 * RidesControlRoomScreen (already built, was unreachable from anywhere on
 * the Hub before this).
 *
 * Uses the SAME TripPhase stages and labels as RidesControlRoomScreen's
 * own PHASE_STAGES (assigned→"Confirmed", en_route→"On the way",
 * picked_up→"Got them", arrived→"Home") — an earlier version of this card
 * invented its own stage names ('requested'/'confirmed'/'en_route'/
 * 'arrived', guessed from elapsed time) that didn't match the real
 * tripStore.TripPhase values or the full screen's own labels, so the
 * teaser card and the screen it links to showed different progress
 * models for the same trip. A ride that's merely requested (no trip
 * dispatched yet — pendingRideRequiredEvents) has no real phase, shown as
 * "Needs a driver" instead of pretending it's on the same 4-stage track.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Car } from 'lucide-react-native';
import type { TripPhase } from '@/store/tripStore';

const PHASE_STAGES: { phase: TripPhase; label: string }[] = [
  { phase: 'assigned',  label: 'Confirmed'  },
  { phase: 'en_route',  label: 'On the way' },
  { phase: 'picked_up', label: 'Got them'   },
  { phase: 'arrived',   label: 'Home'       },
];

export function RidesStatusCard({
  colors, isDark, pendingCount, withoutDriverCount, ongoingCount, activeTripLabel, activePhase, onPress,
}: {
  colors: any; isDark: boolean;
  // Count of everything else needing a decision (other pending ride
  // requests + other active trips beyond the one shown in detail).
  pendingCount: number;
  // Live direction: "show what are the rides pending (without driver)
  // ongoing and upcoming" — a real breakdown instead of one headline item
  // + a vague "N more" count. withoutDriverCount = pendingRideRequiredEvents
  // (no driver assigned yet); ongoingCount = dispatched trips actually in
  // progress right now. Both optional so existing callers that don't pass
  // them yet don't break.
  withoutDriverCount?: number;
  ongoingCount?: number;
  activeTripLabel?: string;
  // undefined = headline item is a ride REQUEST with no trip dispatched
  // yet (not on the 4-stage track at all), not stage 0 of it.
  activePhase?: TripPhase;
  onPress: () => void;
}) {
  // Live-reported bug: "I asked you to add the full width card saying
  // Rides and progress on the hub" — this used to return null whenever
  // there was no active trip AND no other pending ride, so the card
  // silently vanished instead of being the always-there entry point into
  // Rides it was actually asked to be (same "always visible" pattern as
  // the Quick Actions tiles). Now always renders; an idle state gets its
  // own quiet "No rides right now" row instead of disappearing.
  const idle = pendingCount === 0 && !activeTripLabel;
  const stageIndex = activePhase ? PHASE_STAGES.findIndex(s => s.phase === activePhase) : -1;
  const needsDriver = !activePhase;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        marginHorizontal: 20, marginTop: 14,
        backgroundColor: isDark ? colors.card : '#FFFFFF',
        borderRadius: 16, padding: 16, gap: 10,
        borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 11,
          backgroundColor: idle ? colors.skyLight : needsDriver ? (isDark ? colors.danger + '22' : '#FFE8E3') : colors.skyLight,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Car size={18} color={idle ? colors.sky : needsDriver ? colors.danger : colors.sky} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
            {idle ? 'Rides' : activeTripLabel ?? 'Rides'}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
            {idle
              ? 'No rides right now'
              : pendingCount > 0 ? `${pendingCount} more need${pendingCount === 1 ? 's' : ''} you` : ''}
          </Text>
        </View>
        {!idle && (
          <View style={{
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100,
            backgroundColor: needsDriver ? (isDark ? colors.danger + '22' : '#FFE8E3') : colors.skyLight,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: needsDriver ? colors.danger : colors.sky }}>
              {needsDriver ? "Who's driving?" : PHASE_STAGES[stageIndex]?.label ?? 'Confirmed'}
            </Text>
          </View>
        )}
      </View>

      {/* Breakdown row — without driver / ongoing, always shown (even
          while idle, where both read 0) so this card actually answers
          "what's the state of rides right now" at a glance instead of
          only ever naming the single headline item. */}
      {((withoutDriverCount ?? 0) > 0 || (ongoingCount ?? 0) > 0) && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(withoutDriverCount ?? 0) > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
              backgroundColor: isDark ? colors.danger + '18' : '#FFE8E3' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.danger }}>{withoutDriverCount}</Text>
              <Text style={{ fontSize: 11, color: colors.danger }}>need a driver</Text>
            </View>
          )}
          {(ongoingCount ?? 0) > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
              backgroundColor: colors.skyLight }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.sky }}>{ongoingCount}</Text>
              <Text style={{ fontSize: 11, color: colors.sky }}>on the road</Text>
            </View>
          )}
        </View>
      )}

      {/* Trip progress — same 4-segment bar + labels as
          RidesControlRoomScreen's own ProgressTrack, only rendered once
          this ride actually has a dispatched trip with a real phase. */}
      {!idle && !needsDriver && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {PHASE_STAGES.map((s, i) => (
            <View key={s.phase} style={{ flex: 1, gap: 6 }}>
              <View style={{
                height: 4, borderRadius: 2,
                backgroundColor: i <= stageIndex ? colors.sky : (isDark ? colors.border : '#DFE5EF'),
              }} />
              <Text style={{ fontSize: 9, color: i <= stageIndex ? colors.sky : colors.textTertiary }} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}
