import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Car, PartyPopper, AlertTriangle, Check, X } from 'lucide-react-native';
import { fmtTime } from '../hubUtils';
import { KID } from './kidTheme';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';

// Money-green — "ride here / on the way" positive accent, distinct from
// brand teal used elsewhere in the kid hub. Not colors.success (which IS
// brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// A ride goes through four states, not one steady display:
//   counting down  -> the normal "picks you up in Nm" view
//   here            -> arrived (<=2 min either side of scheduled time)
//   overdue         -> scheduled time passed, nobody confirmed pickup yet —
//                      this escalates on its own, no tap required, distinct
//                      from the kid's separate "notify my parent" button
//   dismissible     -> 30+ min past scheduled time, regardless of whether
//                      pickup was ever confirmed — stops blocking the Hub
//                      forever if nobody acted, but only after a real grace
//                      window, and only as an explicit close, not a silent vanish
function rideState(rideCountdown: number, confirmed: boolean) {
  if (confirmed) return 'confirmed' as const;
  if (rideCountdown > 15) return 'counting' as const;
  if (rideCountdown > -2) return 'here' as const;
  if (rideCountdown > -30) return 'overdue' as const;
  return 'stale' as const;
}

// Full-width "your ride is coming" banner — separate from the hero card's own
// mini countdown so it stays visible even after scrolling past the hero.
export function KidRideBanner({ ev, rideCountdown, colors, isDark, active, onConfirmPickup, onDismiss }: {
  ev: FamilyEvent; rideCountdown: number; colors: any; isDark: boolean;
  active: FamilyMember;
  onConfirmPickup: (ev: FamilyEvent) => void;
  onDismiss: (evId: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const confirmed = !!ev.pickupConfirmedAt;
  const state = rideState(rideCountdown, confirmed);
  if (state === 'stale' && !confirmed) return null; // nothing left to say, no dismiss needed — it's just gone

  const rideHere   = state === 'here';
  const isOverdue  = state === 'overdue';
  const canDismiss = rideCountdown <= -30 || confirmed;

  const Icon = confirmed ? Check : isOverdue ? AlertTriangle : rideHere ? PartyPopper : Car;
  const iconColor = confirmed ? MONEY_GREEN : isOverdue ? colors.danger : rideHere ? '#6EE7B7' : MONEY_GREEN;

  const headline = confirmed
    ? `Pickup confirmed — you're all set`
    : isOverdue
      ? `${ev.helper?.split(' ')[0] ?? 'Your ride'} hasn't arrived yet`
      : rideHere
        ? `${ev.helper?.split(' ')[0]} is HERE!`
        : rideCountdown <= 15
          ? `${ev.helper?.split(' ')[0]} arrives in ${rideCountdown} min!`
          : rideCountdown < 60
            ? `${ev.helper?.split(' ')[0]} picks you up in ${rideCountdown}m`
            : `${ev.helper?.split(' ')[0]} picks you up at ${fmtTime(ev.time)}`;

  const dismiss = () => { setDismissed(true); onDismiss(ev.id); };

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
      <View style={{ borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: confirmed ? (isDark ? '#0F2A20' : '#ECFDF5') : isOverdue ? '#7C2D12' : rideHere ? '#064E3B' : (isDark ? '#0F2A20' : '#ECFDF5'),
        borderWidth: 1.5, borderColor: confirmed ? `${MONEY_GREEN}50` : isOverdue ? colors.danger : rideHere ? MONEY_GREEN : `${MONEY_GREEN}50` }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: iconColor + '25', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KID.body, fontWeight: '900', color: iconColor }}>{headline}</Text>
          <Text style={{ fontSize: KID.tiny, color: confirmed ? colors.textTertiary : '#34D399', marginTop: 2 }}>
            {ev.title} · {fmtTime(ev.time)}
          </Text>
        </View>
        {!confirmed && (rideHere || isOverdue) && (
          <Pressable onPress={() => onConfirmPickup(ev)}
            style={{ backgroundColor: isOverdue ? colors.danger : MONEY_GREEN, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: '#fff' }}>I'm picked up</Text>
          </Pressable>
        )}
        {canDismiss && (
          <Pressable onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={18} color={confirmed ? colors.textTertiary : '#fff'} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
