import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Car, PartyPopper, AlertTriangle, Check, X } from 'lucide-react-native';
import { fmtTime } from '../hubUtils';
import { KID } from './kidTheme';
import { eventAssignee } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { driverLabelByName } from '@/lib/format';

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
export function KidRideBanner({ ev, rideCountdown, colors, isDark, active, members, onConfirmPickup, onDismiss, onSendDriverLate, lateNudgeSent }: {
  ev: FamilyEvent; rideCountdown: number; colors: any; isDark: boolean;
  active: FamilyMember; members: FamilyMember[];
  onConfirmPickup: (ev: FamilyEvent) => void;
  onDismiss: (evId: string) => void;
  // Was a separate duplicate banner in KidUrgentAlerts.tsx ("Driver hasn't
  // arrived!") firing in the same overdue window as this banner's own
  // 'overdue' state, both saying essentially the same thing with two
  // different actions — live-reported as confusing double alerts for one
  // ride. Folded "Alert my parent" into this banner's overdue state
  // instead, so there's exactly one ride-status banner per ride that
  // seamlessly carries through counting → here → overdue → confirmed.
  onSendDriverLate?: (ev: FamilyEvent) => void;
  lateNudgeSent?: Record<string, boolean>;
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

  // Was ev.helper?.split(' ')[0] everywhere — undefined for every
  // driverName-based kid ride request (KidRequestModal's own shape), so
  // this banner literally rendered "undefined is HERE!" for the exact ride
  // type this session's redesign was built around (QA sweep, kid-role
  // audit, High). eventAssignee() covers both field pairs. driverLabelByName
  // shows a parent as just "Dad"/"Mom", anyone else as "Name (Relation)".
  const driverFirst = driverLabelByName(eventAssignee(ev).name, members);
  const headline = confirmed
    ? `Pickup confirmed — you're all set`
    : isOverdue
      ? `${driverFirst ?? 'Your ride'} hasn't arrived yet`
      : rideHere
        ? `${driverFirst ?? 'Your ride'} is HERE!`
        : rideCountdown <= 15
          ? `${driverFirst ?? 'Your ride'} arrives in ${rideCountdown} min!`
          : rideCountdown < 60
            ? `${driverFirst ?? 'Your ride'} picks you up in ${rideCountdown}m`
            : `${driverFirst ?? 'Your ride'} picks you up at ${fmtTime(ev.time)}`;

  const dismiss = () => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "dismiss" on "KidRideBanner" (id=${ev.id}) → onDismiss("${ev.id}") [features/hub/kid/KidRideBanner.tsx:73]`); setDismissed(true); onDismiss(ev.id); };

  const alertSent = !!lateNudgeSent?.[ev.id];

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <View style={{ borderRadius: 18, padding: 14, gap: 10,
        backgroundColor: confirmed ? (isDark ? '#0F2A20' : '#ECFDF5') : isOverdue ? '#7C2D12' : rideHere ? '#064E3B' : (isDark ? '#0F2A20' : '#ECFDF5'),
        borderWidth: 1.5, borderColor: confirmed ? `${MONEY_GREEN}50` : isOverdue ? colors.danger : rideHere ? MONEY_GREEN : `${MONEY_GREEN}50` }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: iconColor + '25', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={22} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: KID.body, fontWeight: '900', color: iconColor }}>{headline}</Text>
            <Text style={{ fontSize: KID.tiny, color: confirmed ? colors.textTertiary : '#34D399', marginTop: 2 }}>
              {ev.title} · {fmtTime(ev.time)}
            </Text>
          </View>
          {canDismiss && (
            <Pressable onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color={confirmed ? colors.textTertiary : '#fff'} />
            </Pressable>
          )}
        </View>

        {/* Was split across two different states with two different
            labels ("Not here yet" while 'here', "Alert my parent" once
            'overdue') — confusing and inconsistent. Simplified per direct
            feedback: both "I'm picked up" and "Alert my parent" show
            together the entire time pickup isn't confirmed (here AND
            overdue), same two buttons throughout — a kid should never
            have to wait for the app to decide something's "overdue"
            before they're allowed to say so themselves. */}
        {!confirmed && (rideHere || isOverdue) && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "I'm picked up" on "${ev.title}" (id=${ev.id}) → onConfirmPickup [features/hub/kid/KidRideBanner.tsx]`); onConfirmPickup(ev); }}
              style={{ flex: 1, backgroundColor: MONEY_GREEN, borderRadius: 12, paddingVertical: 9, alignItems: 'center' }}>
              <Text style={{ fontSize: KID.sub, fontWeight: '900', color: '#fff' }}>I'm picked up</Text>
            </Pressable>
            {onSendDriverLate && (
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid member=${active.name} tapped "${alertSent ? 'Sent' : 'Alert my parent'}" on "${ev.title}" (id=${ev.id}) → onSendDriverLate [features/hub/kid/KidRideBanner.tsx]`); onSendDriverLate(ev); }}
                style={{ flex: 1, backgroundColor: isOverdue ? colors.danger : 'transparent', borderWidth: isOverdue ? 0 : 1.5, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 12, paddingVertical: 9, alignItems: 'center', opacity: alertSent ? 0.7 : 1 }}>
                <Text style={{ fontSize: KID.sub, fontWeight: '900', color: '#fff' }}>{alertSent ? 'Sent ✓' : 'Alert my parent'}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
