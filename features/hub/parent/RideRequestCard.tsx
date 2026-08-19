import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Hand, Car, Repeat, MapPinCheck, Flag, HandHelping, CheckCircle2 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import { fmtTime } from '../hubUtils';
import { applyAssignment } from '@/lib/responsibilityCategories';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// This card deliberately uses two distinct hues for the two legs of a
// both-ways ride — money-green for "drop-off" and indigo for "pickup" — so
// they stay visually distinguishable at a glance. Not colors.success
// (brand teal) or BRAND.purple: collapsing either would erase the
// leg-vs-leg distinction, so both are kept as named local constants.
const DROPOFF_GREEN = '#10B981';
const PICKUP_INDIGO = '#6366F1';

const to24HourTime = (raw: string): string | undefined => {
  const normalized = raw.trim();
  if (/^\d{2}:\d{2}$/.test(normalized)) return normalized;
  const m = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return undefined;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const meridiem = m[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (meridiem === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

function parseRideMeta(encoded: string | undefined, fallbackDate?: string) {
  const rideCode = encoded?.startsWith('RIDE:') ? encoded : null;
  const isBothWays = rideCode === 'RIDE:both' || rideCode?.startsWith('RIDE:both:');
  const isDropoff  = rideCode === 'RIDE:dropoff';
  const isPickup   = rideCode === 'RIDE:pickup' || rideCode?.startsWith('RIDE:pickup:');
  let pickupDate = fallbackDate;
  let pickupTime: string | undefined;

  if (rideCode?.startsWith('RIDE:both:') || rideCode?.startsWith('RIDE:pickup:')) {
    const payload = rideCode.slice(rideCode.indexOf(':', 5) + 1).trim();
    const localStamp = payload.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
    if (localStamp) {
      pickupDate = localStamp[1];
      pickupTime = localStamp[2];
    } else {
      pickupTime = to24HourTime(payload);
    }
  }

  return { isBothWays, isDropoff, isPickup, pickupDate, pickupTime, pickupLabel: pickupTime ? fmtTime(pickupTime) : undefined };
}

export function RideRequestCard({ ev, active, members, colors, isDark, updateEvent, addEvent }: {
  ev: FamilyEvent; active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  addEvent: (ev: Omit<FamilyEvent, 'id'>) => string;
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
    applyAssignment({ taskId: eventId, taskType: 'event', familyId, category: 'transport' })
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
    updateEvent(ev.id, {
      approvalPending: false, helperStatus: undefined, returnTime: undefined,
      isOpenToGrandparents: true, isOpenToTeens: true, rideCoins,
    });
    tryAutoDispatchToGrandparent(ev.id);
  };

  // Fork both-ways ride → 2 separate event cards
  const forkRide = (selfDrive: boolean) => {
    updateEvent(ev.id, {
      approvalPending: false,
      helper: selfDrive ? active.name : undefined,
      helperStatus: selfDrive ? 'confirmed' : undefined,
      returnTime: undefined,
      title: `${ev.title} — Drop-off`,
      notes: ev.notes,
      color: DROPOFF_GREEN,
      isOpenToGrandparents: !selfDrive,
      isOpenToTeens: !selfDrive,
      rideCoins: selfDrive ? undefined : splitCoins,
      pickupLocation: ev.pickupLocation,
      dropLocation: ev.dropLocation,
    });
    if (!selfDrive) tryAutoDispatchToGrandparent(ev.id);
    const pickupId = addEvent({
      title: `${ev.title} — Pickup`,
      date: rideMeta.pickupDate ?? ev.date,
      time: rideMeta.pickupTime ?? ev.time,
      type: 'event', category: 'Ride', allDay: false, memberId: ev.memberId,
      approvalPending: false, conflict: false,
      helper: selfDrive ? active.name : undefined,
      helperStatus: selfDrive ? 'confirmed' : undefined,
      notes: ev.notes ? `(Return) ${ev.notes}` : `Pickup leg for "${ev.title}"`,
      color: PICKUP_INDIGO,
      isOpenToGrandparents: !selfDrive,
      isOpenToTeens: !selfDrive,
      rideCoins: selfDrive ? undefined : splitCoins,
      pickupLocation: ev.dropLocation,
      dropLocation: ev.pickupLocation,
    });
    if (!selfDrive) tryAutoDispatchToGrandparent(pickupId);
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Flag size={12} color={PICKUP_INDIGO} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: PICKUP_INDIGO }}>Pickup · {returnTimeStr ?? 'time TBD'}</Text>
            </View>
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
            onPress={() => updateEvent(ev.id, { approvalPending: false, helperStatus: 'confirmed', helper: active.name, returnTime: undefined })}
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
