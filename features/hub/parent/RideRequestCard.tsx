import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Hand, Car, Repeat, MapPinCheck, Flag, HandHelping, CheckCircle2 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import { fmtTime } from '../hubUtils';
import { applyAssignment } from '@/lib/responsibilityCategories';
import { parseRideMeta, plus90Minutes, forkRideLegs } from './rideLegs';
import { PickupTimeStepper } from './PickupTimeStepper';
import { showToast } from '@/components/AppToast';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// This card deliberately uses two distinct hues for the two legs of a
// both-ways ride — money-green for "drop-off" and indigo for "pickup" — so
// they stay visually distinguishable at a glance. Not colors.success
// (brand teal) or BRAND.purple: collapsing either would erase the
// leg-vs-leg distinction, so both are kept as named local constants.
const DROPOFF_GREEN = '#10B981';
const PICKUP_INDIGO = '#6366F1';

export function RideRequestCard({ ev, active, members, colors, isDark, updateEvent, addEvent, updateEventScoped }: {
  ev: FamilyEvent; active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  addEvent: (ev: Omit<FamilyEvent, 'id'>) => string;
  // A recurring ride series previously required assigning a driver
  // separately on EVERY materialized occurrence — the anchor got a helper,
  // every future occurrence stayed stuck on "No driver assigned" forever.
  // Assigning here now carries the SAME driver forward to every future
  // occurrence in the series via updateEventScoped('following'), so one
  // assignment covers the whole recurring ride, not just today's instance.
  // Optional so any other call site that hasn't been updated still compiles.
  updateEventScoped?: (id: string, patch: Partial<FamilyEvent>, scope: 'this' | 'following' | 'all') => void;
}) {
  const familyId = (active as any).familyId as string | undefined;

  // Zero-touch dispatch: once a ride is opened to helpers, ask the real
  // engine for real (non-dry-run) whether one candidate is a confident
  // AUTO pick. Only self-apply when that pick is specifically a
  // grandparent — teens are eligible candidates too, but "auto-confirm
  // without asking" is scoped to the GP dispatch-board zero-touch goal,
  // not to silently signing a teen up for a driving commitment. SUGGEST/ASK
  // (or an AUTO landing on a teen) leaves the ride in the normal open/claim
  // list exactly as before — this only ever adds a confirmation, it never
  // removes the manual path.
  const tryAutoDispatchToGrandparent = (eventId: string) => {
    if (!familyId) return;
    // targetField was missing entirely — the engine's default ('assignee')
    // resolves to calendar_events.member_id for taskType:'event', which is
    // the RIDE'S SUBJECT (the kid needing the ride), not the driver. Every
    // zero-touch AUTO dispatch was silently overwriting who the ride was
    // FOR with the winning grandparent's id (QA Round 9, Critical Finding 1
    // — reproduced live, confirmed the corrupted member_id then wrongly
    // excluded that GP from a later, unrelated dispatch via a phantom
    // calendar conflict).
    applyAssignment({ taskId: eventId, taskType: 'event', familyId, category: 'transport', targetField: 'helper' })
      .then(res => {
        if (res?.decisionType !== 'auto' || !res.selectedMemberId) return;
        const winner = members.find(m => m.id === res.selectedMemberId);
        if (winner?.role !== 'senior') return;
        updateEvent(eventId, {
          helper: winner.name, helperStatus: 'confirmed',
          isOpenToGrandparents: false, isOpenToTeens: false,
        });
      });
  };
  const [coinsStr, setCoinsStr] = useState('');
  const requester = ev.helperRequestedBy ?? members.find(m => m.id === ev.memberId)?.name ?? 'Kid';
  const rideMeta = parseRideMeta(ev.returnTime, ev.date);
  const { isBothWays, isDropoff, isPickup, pickupLabel: returnTimeStr } = rideMeta;

  const coinsVal   = coinsStr.trim() ? parseInt(coinsStr, 10) : undefined;
  const splitCoins = coinsVal ? Math.floor(coinsVal / 2) : undefined;

  // Open to ALL helpers (GP + teen) — first to claim wins, unless the engine
  // is confident enough to zero-touch dispatch it to a GP right away.
  const openToHelpers = (rideCoins?: number) => {
    const patch = {
      approvalPending: false, helperStatus: undefined, returnTime: undefined,
      isOpenToGrandparents: true, isOpenToTeens: true, rideCoins,
    };
    // Only the anchor occurrence gets opened to helpers here — future
    // occurrences aren't touched, since "open to whoever claims it" isn't a
    // fixed assignment worth forcing onto every future date the way a
    // confirmed named driver is. A parent who wants recurring open-to-help
    // can reopen each occurrence, or the auto-dispatched GP pick below will
    // naturally repeat if the same GP keeps claiming it.
    updateEvent(ev.id, patch);
    tryAutoDispatchToGrandparent(ev.id);
    showToast('Opened to helpers ✓');
  };

  // A kid's ride request never includes a pickup TIME (the redesigned
  // KidRequestModal deliberately drops that field — a kid usually doesn't
  // know precisely when practice ends). This is the one-tap fill-in at
  // approval time: pre-filled at drop-off + 90 minutes, adjustable before
  // forking. Only relevant when there IS a pickup leg with no time yet.
  const [pickupTimeOverride, setPickupTimeOverride] = useState<string | null>(null);

  // Fork both-ways ride → 2 separate event cards. Pickup leg now inherits
  // the SAME category as the original event via forkRideLegs (was always
  // hardcoded to 'Ride', which is correct here since this card only ever
  // handles category:'Ride' events anyway — kept via the shared helper so
  // RideRequiredEventCard's own fork behaves the same way for its events).
  const forkRide = (selfDrive: boolean) => {
    forkRideLegs({
      ev, selfDrive, splitCoins,
      assigneePatch: (confirmed) => ({
        helper: confirmed ? active.name : undefined,
        helperStatus: confirmed ? 'confirmed' : undefined,
      }),
      updateEvent, addEvent, tryAutoDispatch: tryAutoDispatchToGrandparent,
      pickupTimeOverride: pickupTimeOverride ?? undefined,
    });
    showToast(selfDrive ? "You're driving ✓" : 'Split into 2 legs ✓');
  };

  return (
    <CollapsibleCard flat accent={colors.warning} colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isBothWays ? <Repeat size={16} color={colors.warning} /> : isDropoff ? <MapPinCheck size={16} color={colors.warning} /> : isPickup ? <Flag size={16} color={colors.warning} /> : <Car size={16} color={colors.warning} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.warning }} numberOfLines={1}>
              {isBothWays ? 'Both ways · ' : isDropoff ? 'Drop-off · ' : isPickup ? 'Pickup · ' : 'Ride · '}{ev.title}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.warning, opacity: 0.8 }}>
              {requester} · {ev.time ? fmtTime(ev.time) : 'time TBD'}{ev.location ? ` · ${ev.location}` : ''}
              {isBothWays && returnTimeStr ? ` · pickup ${returnTimeStr}` : ''}
            </Text>
          </View>
          <View style={{ backgroundColor: colors.warning + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.warning }}>Pending</Text>
          </View>
        </View>
      }>

      {ev.notes && (
        <View style={{ backgroundColor: isDark ? '#1e293b' : '#fefce8', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.warning }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{ev.notes}"</Text>
        </View>
      )}

      {members.some(m => m.role === 'teen') && (
        <View style={{ borderRadius: 10, borderWidth: 1,
          borderColor: isDark ? '#334155' : '#E2E8F0',
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 }}>
          <Text style={{ fontSize: TYPO.body }}>🪙</Text>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, flex: 1 }}>
            Coins for teen driver
            {isBothWays && coinsVal ? ` (split ${splitCoins}+${splitCoins})` : ''}
          </Text>
          <TextInput
            value={coinsStr}
            onChangeText={v => setCoinsStr(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="optional"
            placeholderTextColor={colors.textTertiary}
            style={{ width: 72, textAlign: 'right', fontSize: TYPO.caption, fontWeight: '800', color: colors.warning, paddingVertical: 10 }}
          />
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
              // No pickup time came with the request (a kid's ride request
              // never includes one) — one-tap fill-in, pre-filled at
              // drop-off + 90 min, before approving/forking.
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
              {splitCoins ? ` +${splitCoins} coins each leg.` : ''}
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
          <Pressable
            onPress={() => {
              const patch = { approvalPending: false, helperStatus: 'confirmed' as const, helper: active.name, returnTime: undefined };
              if (ev.seriesId && updateEventScoped) updateEventScoped(ev.id, patch, 'following');
              else updateEvent(ev.id, patch);
              showToast("You're driving ✓");
            }}
            style={{ flex: 1, backgroundColor: DROPOFF_GREEN, paddingVertical: 11, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Car size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
          </Pressable>
          <Pressable
            onPress={() => openToHelpers(coinsVal)}
            style={{ flex: 1, backgroundColor: colors.warning + '20', borderWidth: 1.5, borderColor: colors.warning + '50', paddingVertical: 11, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
            <HandHelping size={14} color={colors.warning} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.warning }}>Open to Helpers</Text>
          </Pressable>
        </View>
      )}
    </CollapsibleCard>
  );
}
