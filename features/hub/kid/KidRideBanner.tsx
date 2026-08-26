import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Car, PartyPopper, AlertTriangle, Check, X } from 'lucide-react-native';
import { fmtTime } from '../hubUtils';
import { KID } from './kidTheme';
import { eventAssignee } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { driverLabelByName } from '@/lib/format';

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
export function KidRideBanner({ ev, rideCountdown, colors, isDark, active, members, onConfirmPickup, onDismiss, onSendDriverLate, lateNudgeSent, driverDispatched, conflictReason }: {
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
  // Whether tripStore has an ACTIVE trip (dispatched, not yet completed)
  // for this ride's driver — the real Pick-up Radar signal, not just the
  // scheduled clock. Master-flow audit finding: this banner previously
  // derived "here"/"overdue" purely from rideCountdown, so it could say
  // "HERE!" purely because the clock hit zero regardless of whether the
  // driver ever tapped Dispatch, and couldn't reflect an early dispatch
  // either. Passing the real signal lets the copy be accurate in both
  // directions without changing the underlying state machine's shape.
  driverDispatched?: boolean;
  // Same assignee-double-booked signal ParentView/KidNeedsYouSection
  // already show — SeniorView (the only real consumer of this banner
  // besides TeenView) had no conflict-detection wiring at all until this
  // fix. Purely informational — no reassign action here, same as
  // KidNeedsYouSection's own use of this signal.
  conflictReason?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const confirmed = !!ev.pickupConfirmedAt;
  const state = rideState(rideCountdown, confirmed);
  if (state === 'stale' && !confirmed) return null; // nothing left to say, no dismiss needed — it's just gone

  const rideHere   = state === 'here';
  // A genuinely dispatched driver is never "overdue" from the kid's point
  // of view, even if the clock says the scheduled time passed — they're
  // actively en route, which is a materially different (less alarming)
  // situation than "scheduled time passed, nobody's said anything."
  const isOverdue  = state === 'overdue' && !driverDispatched;
  // Dispatched but not yet in the clock-based "here" window — the one
  // genuinely NEW state this fix adds, distinct from both the plain
  // countdown and "HERE!" so the copy doesn't claim arrival prematurely.
  const onTheWay   = !!driverDispatched && !confirmed && !rideHere;
  const canDismiss = rideCountdown <= -30 || confirmed;

  const Icon = confirmed ? Check : isOverdue ? AlertTriangle : (rideHere || onTheWay) ? PartyPopper : Car;
  const iconColor = isOverdue ? colors.danger : colors.teal;

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
      : onTheWay
        ? `${driverFirst ?? 'Your ride'} is on the way!`
      : rideHere
        ? `${driverFirst ?? 'Your ride'} is HERE!`
        : rideCountdown <= 15
          ? `${driverFirst ?? 'Your ride'} arrives in ${rideCountdown} min!`
          : rideCountdown < 60
            ? `${driverFirst ?? 'Your ride'} picks you up in ${rideCountdown}m`
            : `${driverFirst ?? 'Your ride'} picks you up at ${fmtTime(ev.time)}`;

  const dismiss = () => { setDismissed(true); onDismiss(ev.id); };

  const alertSent = !!lateNudgeSent?.[ev.id];

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <View style={{ borderRadius: 18, padding: 14, gap: 10,
        // Overdue's solid #7C2D12 background at full opacity, paired with
        // headline text colored iconColor (== colors.danger, a red-on-
        // red combo), was hard to read. Reduced to a translucent danger
        // tint (matches the confirmed/here cards' own lower-opacity
        // treatment) with the headline in plain white instead.
        backgroundColor: isOverdue ? colors.danger + '55' : rideHere ? colors.teal : (isDark ? colors.teal + '22' : colors.tealLight),
        borderWidth: 1.5, borderColor: isOverdue ? colors.danger : colors.teal + '50' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: iconColor + '25', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={22} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: KID.body, fontWeight: '900', color: isOverdue ? '#fff' : iconColor }}>{headline}</Text>
            <Text style={{ fontSize: KID.tiny, color: confirmed ? colors.textTertiary : isOverdue ? 'rgba(255,255,255,0.85)' : '#34D399', marginTop: 2 }}>
              {ev.title} · {fmtTime(ev.time)}
            </Text>
          </View>
          {canDismiss && (
            <Pressable onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color={confirmed ? colors.textTertiary : '#fff'} />
            </Pressable>
          )}
        </View>

        {!confirmed && conflictReason && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={12} color={isOverdue ? '#fff' : colors.danger} />
            <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: isOverdue ? '#fff' : colors.danger }}>
              {conflictReason}
            </Text>
          </View>
        )}

        {/* Was split across two different states with two different
            labels ("Not here yet" while 'here', "Alert my parent" once
            'overdue') — confusing and inconsistent. Simplified per direct
            feedback: both "I'm picked up" and "Alert my parent" show
            together the entire time pickup isn't confirmed (here AND
            overdue), same two buttons throughout — a kid should never
            have to wait for the app to decide something's "overdue"
            before they're allowed to say so themselves. */}
        {!confirmed && (rideHere || isOverdue || onTheWay) && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => { onConfirmPickup(ev); }}
              style={{ flex: 1, backgroundColor: colors.teal, borderRadius: 12, paddingVertical: 9, alignItems: 'center' }}>
              <Text style={{ fontSize: KID.sub, fontWeight: '900', color: '#fff' }}>I'm picked up</Text>
            </Pressable>
            {onSendDriverLate && (
              <Pressable onPress={() => { onSendDriverLate(ev); }}
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
