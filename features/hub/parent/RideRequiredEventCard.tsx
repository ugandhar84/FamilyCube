import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Medal, HeartPulse, BookOpen, Calendar, Car, CheckCircle2, HandHelping, Repeat, MapPinCheck, Flag, UserCog, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard, notifyTakeover } from '../hubComponents';
import { fmtTime, fmtHumanDateShort } from '../hubUtils';
import { parseRideMeta, plus90Minutes, forkRideLegs } from './rideLegs';
import { PickupTimeStepper } from './PickupTimeStepper';
import { showToast } from '@/components/AppToast';
import { useChatStore } from '@/store/chatStore';
import { deriveEventActions } from '@/features/tasks/lib/deriveCardActions';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';

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

export function RideRequiredEventCard({ ev, active, members, colors, isDark, updateEvent, updateEventScoped, addEvent }: {
  ev: FamilyEvent; active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => Promise<void>;
  updateEventScoped?: (id: string, patch: Partial<FamilyEvent>, scope: 'this' | 'following' | 'all') => void;
  addEvent: (ev: Omit<FamilyEvent, 'id'>) => Promise<string>;
}) {
  const CatIcon = ev.category === 'Sports' ? Medal : ev.category === 'Medical' ? HeartPulse : ev.category === 'Study' ? BookOpen : Calendar;
  const rideMeta = parseRideMeta(ev.returnTime, ev.date);
  const { isBothWays, isDropoff, isPickup, pickupDateKnownOnly, pickupLabel: returnTimeStr } = rideMeta;
  const pickupIsDifferentDay = rideMeta.pickupDate && rideMeta.pickupDate !== ev.date;
  const [pickupTimeOverride, setPickupTimeOverride] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const otherParents = members.filter(m => m.role === 'parent' && m.id !== active.id);
  // Live-reported: "Helpers" (open to GP/teen pool) showed even in a
  // family with zero teen or grandparent members — nobody could ever act
  // on it, so offering it was pure dead-end UI. Only show it when there's
  // at least one real candidate who could actually claim it; hasCar isn't
  // checked here (unlike SeniorView's/TeenView's own claim-list gating)
  // since a family might add a car later, and this button just opens the
  // pool rather than claiming anything itself.
  const hasEligibleHelpers = members.some(m => m.role === 'teen' || m.role === 'senior');
  // Shared gating logic (deriveCardActions.ts) instead of the naive
  // otherParents.length > 0 check this card had before — without it, a
  // driver who'd already CONFIRMED could still be silently reassigned via
  // this card's Reassign button, the exact case showReassign's
  // !helperConfirmed guard exists elsewhere to prevent.
  const { showReassign } = deriveEventActions(
    ev, { id: active.id, name: active.name, role: active.role, hasCar: active.hasCar },
  );

  // Naming yourself as the driver here IS the "yes, I'm driving this
  // series going forward" moment — propagates to future occurrences the
  // same way RideRequestCard's own "I'll Drive" does for Ride events. A
  // later one-off swap for just one occurrence happens through
  // HelperEventCard's Take-Over action instead, which stays scoped to
  // 'this' only.
  const iDrive = async () => {
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "I'll Drive" on "${ev.title}" (id=${ev.id}) → reassign_event(driver) [features/hub/parent/RideRequiredEventCard.tsx:47]`);
    // Routed through the ONE shared reassignEvent (store/eventStore.ts) —
    // every surface that can reassign a driver/helper now calls the same
    // function and renders the server's own confirmed row, instead of
    // each hand-guessing its own local patch.
    const ok = await useEventStore.getState().reassignEvent(ev.id, active.id, 'driver', active.id);
    if (ok && ev.seriesId && updateEventScoped) {
      // Naming yourself as the driver IS the "yes, I'm driving this series
      // going forward" moment — propagate to future occurrences.
      updateEventScoped(ev.id, { driverName: active.name, driverId: active.id, driverStatus: 'confirmed' }, 'following');
    }
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
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Open to Helpers" on "${ev.title}" (id=${ev.id}) → updateEvent(openToGrandparents/openToTeens) [features/hub/parent/RideRequiredEventCard.tsx:61]`);
    // approvalPending: false was missing here (unlike RideRequestCard's own
    // openToHelpers) — a kid-initiated ride request (always approvalPending:
    // true per KidRequestModal) stayed flagged as "awaiting parent approval"
    // forever after being opened to helpers, inflating TodayView's
    // needsAttention badge count indefinitely even though the ride was
    // already correctly open and claimable.
    updateEvent(ev.id, { isOpenToGrandparents: true, isOpenToTeens: true, driverName: undefined, driverId: undefined, driverStatus: undefined, approvalPending: false });
    showToast('Opened to helpers ✓');
  };

  // Live QA finding: there was NO way for a parent to turn down a kid's
  // ride request at all except deleting the event outright via the
  // Calendar tab — a plain "Delete Event?" confirmation with no reason
  // field, no notification, and no explanation reaching the kid; the
  // request just silently vanished from their Schedule. Only meaningful
  // for a genuinely kid-initiated request — approvalPending is only ever
  // true for those (KidRequestModal always sets it; a parent creating
  // their own ride never does), so this button only shows for that case.
  const declineRequest = (reason?: string) => {
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Decline" on "${ev.title}" (id=${ev.id}) → updateEvent(declined) [features/hub/parent/RideRequiredEventCard.tsx]`);
    updateEvent(ev.id, { approvalPending: false, driverStatus: 'rejected', driverName: undefined, driverId: undefined, notes: reason ? `Declined: ${reason}` : ev.notes });
    try {
      if (ev.memberId && ev.memberId !== active.id) {
        const msg = reason
          ? `🚫 "${ev.title}" wasn't approved — ${reason}`
          : `🚫 "${ev.title}" wasn't approved this time.`;
        useChatStore.getState().sendMessage(ev.memberId, active.id, msg);
      }
    } catch (e) {
      console.warn('[RideRequiredEventCard] decline notification failed', e);
    }
    showToast('Declined');
  };

  // Parent-to-parent handoff — a third option alongside "I'll Drive"
  // (keep it) and "Open to Helpers" (open to GP/teen pool). Same
  // reassign_event RPC + notifyTakeover flow EventDetailSheet's own
  // DriverChipRow already uses for this exact case: reassigning to
  // someone other than yourself starts 'pending' (the RPC's own status
  // logic), requiring the new parent's own confirm, not auto-confirmed
  // the way "I'll Drive" is.
  const reassignTo = async (m: FamilyMember) => {
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Reassign to ${m.name}" on "${ev.title}" (id=${ev.id}) → reassign_event(driver) [features/hub/parent/RideRequiredEventCard.tsx]`);
    notifyTakeover(ev, m.name, members, active.name, active.id);
    // Routed through the ONE shared reassignEvent — see iDrive's comment
    // above. A parent-to-parent handoff starts 'pending' (the new parent
    // still needs to confirm) — that rule lives server-side in
    // reassign_event itself, not duplicated here.
    await useEventStore.getState().reassignEvent(ev.id, m.id, 'driver', active.id);
    setReassignOpen(false);
  };

  const forkRide = async (selfDrive: boolean) => {
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "${selfDrive ? "I'll Drive" : 'Approve & Split'}" on "${ev.title}" (id=${ev.id}) selfDrive=${selfDrive} → forkRideLegs [features/hub/parent/RideRequiredEventCard.tsx:65]`);
    await forkRideLegs({
      ev, selfDrive,
      assigneePatch: (confirmed) => ({
        driverName: confirmed ? active.name : undefined,
        driverStatus: confirmed ? 'confirmed' : undefined,
        rideRequired: true,
      }),
      updateEvent, addEvent, tryAutoDispatch: () => {},
      pickupTimeOverride: pickupTimeOverride ?? undefined,
    });
    showToast(selfDrive ? "You're driving ✓" : 'Split into 2 legs ✓');
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
              {/* isPickup-only's relevant time IS the pickup time (in
                  returnTimeStr, from the kid's own time picker), not
                  ev.time (the underlying activity's start) — previously
                  only shown for isBothWays, so a pickup-only card's summary
                  line showed the activity's start time and never the
                  actual pickup time a parent needs to plan around. */}
              {fmtHumanDateShort(ev.date)} · {isPickup && returnTimeStr ? `Pickup · ${returnTimeStr}` : ev.time ? fmtTime(ev.time) : 'time TBD'}
              {ev.location ? ` · ${ev.location}` : ''}
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
            {pickupIsDifferentDay && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <Calendar size={12} color={PICKUP_INDIGO} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: PICKUP_INDIGO }}>
                  Pickup is a different day — {rideMeta.pickupDate}
                </Text>
              </View>
            )}
            {returnTimeStr && !pickupDateKnownOnly ? (
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
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable onPress={iDrive}
              style={{ flex: 1, backgroundColor: colors.warning, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 3 }}>
              <CheckCircle2 size={12} color="#fff" />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }} numberOfLines={1}>I'll Drive</Text>
            </Pressable>
            {showReassign && otherParents.length > 0 && (
              <Pressable onPress={() => setReassignOpen(v => !v)}
                style={{ flex: 1, backgroundColor: reassignOpen ? colors.parent + '20' : colors.warning + '20', borderWidth: 1.5, borderColor: reassignOpen ? colors.parent + '50' : colors.warning + '50', paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 3 }}>
                <UserCog size={12} color={reassignOpen ? colors.parent : colors.warning} />
                <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: reassignOpen ? colors.parent : colors.warning }} numberOfLines={1}>Reassign</Text>
              </Pressable>
            )}
            {hasEligibleHelpers && (
              <Pressable onPress={openToHelpers}
                style={{ flex: 1, backgroundColor: colors.warning + '20', borderWidth: 1.5, borderColor: colors.warning + '50', paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 3 }}>
                <HandHelping size={12} color={colors.warning} />
                <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.warning }} numberOfLines={1}>Helpers</Text>
              </Pressable>
            )}
          </View>
          {ev.approvalPending && (
            <Pressable
              onPress={() => Alert.prompt(
                'Decline Request',
                `Let ${(members.find(m => m.id === ev.memberId)?.name ?? 'them').split(' ')[0]} know why (optional).`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Decline', style: 'destructive', onPress: (reason?: string) => declineRequest(reason?.trim() || undefined) },
                ],
                'plain-text',
              )}
              style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4, paddingVertical: 7 }}>
              <X size={11} color={colors.danger} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.danger }}>Decline this request</Text>
            </Pressable>
          )}
          {reassignOpen && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {otherParents.map(m => (
                <Pressable key={m.id} onPress={() => reassignTo(m)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9,
                    borderRadius: 999, borderWidth: 1.5, borderColor: colors.parent + '50', backgroundColor: colors.parent + '14' }}>
                  <UserCog size={13} color={colors.parent} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.parent }}>{m.name.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </CollapsibleCard>
  );
}
