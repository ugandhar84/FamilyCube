import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Medal, HeartPulse, BookOpen, Calendar, Car, CheckCircle2, HandHelping, Repeat, MapPinCheck, Flag } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import { fmtTime } from '../hubUtils';
import { parseRideMeta, plus90Minutes, forkRideLegs } from './rideLegs';
import { PickupTimeStepper } from './PickupTimeStepper';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// A non-Ride event (Sports/Study/Medical/etc) that separately flagged
// "needs a ride" (rideRequired) — distinct from RideRequestCard, which only
// ever handles category:'Ride' events using the helper/helperStatus field
// pair. This uses driverName/driverStatus instead, and deliberately shows
// the REAL event title ("Cricket match", not generic "Ride needed") since
// what the event actually is matters when a parent is deciding whether to
// volunteer to drive.
//
// Now also decodes the same RIDE: leg encoding RideRequestCard reads (drop-
// off / pickup / both-ways) via the shared rideLegs module — this is the
// card the redesigned kid request flow actually routes to (rideRequired is
// now set true for every kid ride request), so it needs the same leg
// awareness, not just a flat "needs a ride" flag.
const DROPOFF_GREEN = '#10B981';
const PICKUP_INDIGO = '#6366F1';

export function RideRequiredEventCard({ ev, active, colors, isDark, updateEvent, updateEventScoped, addEvent }: {
  ev: FamilyEvent; active: FamilyMember; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  updateEventScoped?: (id: string, patch: Partial<FamilyEvent>, scope: 'this' | 'following' | 'all') => void;
  addEvent: (ev: Omit<FamilyEvent, 'id'>) => string;
}) {
  const CatIcon = ev.category === 'Sports' ? Medal : ev.category === 'Medical' ? HeartPulse : ev.category === 'Study' ? BookOpen : Calendar;
  const rideMeta = parseRideMeta(ev.returnTime, ev.date);
  const { isBothWays, isDropoff, isPickup, pickupLabel: returnTimeStr } = rideMeta;
  const [pickupTimeOverride, setPickupTimeOverride] = useState<string | null>(null);

  // Naming yourself as the driver here IS the "yes, I'm driving this
  // series going forward" moment — propagates to future occurrences the
  // same way RideRequestCard's own "I'll Drive" does for Ride events. A
  // later one-off swap for just one occurrence happens through
  // HelperEventCard's Take-Over action instead, which stays scoped to
  // 'this' only.
  const iDrive = () => {
    const patch = { driverName: active.name, driverStatus: 'confirmed' as const };
    if (ev.seriesId && updateEventScoped) updateEventScoped(ev.id, patch, 'following');
    else updateEvent(ev.id, patch);
  };

  // A parent who can't drive this themselves previously had no path at
  // all — this card offered only "I'll Drive," a dead end. RideRequestCard
  // (the category:'Ride' equivalent) already pairs its own "I'll Drive"
  // with "Open to Helpers"; this mirrors that for the driverName/
  // driverStatus field pair (QA Round 11, High Finding H1). Deliberately
  // NOT scoped to the series — opening just this occurrence to helpers
  // isn't a fixed assignment worth forcing onto every future date, same
  // reasoning RideRequestCard's own openToHelpers already documents.
  const openToHelpers = () => {
    updateEvent(ev.id, { isOpenToGrandparents: true, isOpenToTeens: true, driverName: undefined, driverStatus: undefined });
  };

  const forkRide = (selfDrive: boolean) => {
    forkRideLegs({
      ev, selfDrive,
      assigneePatch: (confirmed) => ({
        driverName: confirmed ? active.name : undefined,
        driverStatus: confirmed ? 'confirmed' : undefined,
        rideRequired: true,
      }),
      updateEvent, addEvent, tryAutoDispatch: () => {},
      pickupTimeOverride: pickupTimeOverride ?? undefined,
    });
  };

  return (
    <CollapsibleCard flat accent={colors.warning} colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isBothWays ? <Repeat size={16} color={colors.warning} /> : isDropoff ? <MapPinCheck size={16} color={colors.warning} /> : isPickup ? <Flag size={16} color={colors.warning} /> : <CatIcon size={16} color={colors.warning} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.warning }} numberOfLines={1}>
              {ev.title}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.warning, opacity: 0.8 }}>
              {ev.time ? fmtTime(ev.time) : 'time TBD'}{ev.location ? ` · ${ev.location}` : ''}
              {isBothWays && returnTimeStr ? ` · pickup ${returnTimeStr}` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.warning + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Car size={11} color={colors.warning} />
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.warning }}>Needs a ride</Text>
          </View>
        </View>
      }>
      {ev.notes && (
        <View style={{ backgroundColor: isDark ? '#1e293b' : '#fefce8', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.warning, marginBottom: 8 }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{ev.notes}"</Text>
        </View>
      )}

      {isBothWays ? (
        <View style={{ gap: 8 }}>
          <View style={{ backgroundColor: isDark ? '#0f2a20' : '#ecfdf5', borderRadius: 10, padding: 10, gap: 4, borderWidth: 1, borderColor: `${DROPOFF_GREEN}30` }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <MapPinCheck size={12} color={DROPOFF_GREEN} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: DROPOFF_GREEN }}>Drop-off · {ev.time ? fmtTime(ev.time) : 'time TBD'}</Text>
            </View>
            {returnTimeStr ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <Flag size={12} color={PICKUP_INDIGO} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: PICKUP_INDIGO }}>Pickup · {returnTimeStr}</Text>
              </View>
            ) : (
              <View style={{ marginTop: 4 }}>
                <PickupTimeStepper
                  value={pickupTimeOverride ?? plus90Minutes(ev.time)}
                  onChange={setPickupTimeOverride}
                  accentColor={PICKUP_INDIGO} colors={colors}
                />
              </View>
            )}
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4 }}>
              Creates 2 cards — GP or teen first to claim each leg wins.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => forkRide(false)}
              style={{ flex: 2, backgroundColor: DROPOFF_GREEN, paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color="#fff" />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Approve & Split</Text>
            </Pressable>
            <Pressable onPress={() => forkRide(true)}
              style={{ flex: 1, backgroundColor: `${DROPOFF_GREEN}20`, borderWidth: 1, borderColor: `${DROPOFF_GREEN}40`, paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
              <Car size={13} color={DROPOFF_GREEN} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: DROPOFF_GREEN }}>I'll Drive</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={iDrive}
            style={{ flex: 1, backgroundColor: colors.warning, paddingVertical: 11, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <CheckCircle2 size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
          </Pressable>
          <Pressable onPress={openToHelpers}
            style={{ flex: 1, backgroundColor: colors.warning + '20', borderWidth: 1.5, borderColor: colors.warning + '50', paddingVertical: 11, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
            <HandHelping size={14} color={colors.warning} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.warning }}>Open to Helpers</Text>
          </Pressable>
        </View>
      )}
    </CollapsibleCard>
  );
}
