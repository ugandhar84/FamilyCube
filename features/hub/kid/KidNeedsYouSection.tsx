import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import {
  X, AlertTriangle, Clock, RotateCcw, PartyPopper, ThumbsUp, CheckCircle2, XCircle, Car,
  UserCheck, Check, Navigation, MapPin,
} from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import { useCelebrationStore } from '@/store/celebrationStore';
import { fmtTime, hoursUntilEvent } from '../hubUtils';
import { parseDbTime } from '@/lib/dates';
import { eventAssignee } from '@/store/eventStore';
import { driverLabelByName } from '@/lib/format';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Quest, QuestCheer } from '@/store/questStore';

// Money-green — positive/confirmed accent used throughout this section
// (approved quest, cheer, confirmed pickup, en-route trip). Not
// colors.success (which IS brand teal in this app) — kept as one local
// constant, matching every component this section merges.
const MONEY_GREEN = '#10B981';

// ─── Shared row shell ──────────────────────────────────────────────────────
// Every "Needs You" row — alert, reply, ride banner, awaiting-driver,
// live trip — renders through this one shell so the merged list reads as
// ONE consistent kind of thing, not four components stitched together.
function NeedsYouRow({ Icon, accent, colors, isDark, title, detail, onPress, onDismiss, tone = 'flat', children }: {
  Icon: typeof AlertTriangle; accent: string; colors: any; isDark: boolean; title: string; detail?: string;
  onPress?: () => void; onDismiss?: () => void;
  // 'flat' — tinted background (default, matches old AlertRow/reply cards).
  // 'solid' — full-color background with white text, reserved for the ride
  // banner's overdue/here states which need to read as more urgent/alive
  // than a flat tinted row.
  tone?: 'flat' | 'solid';
  children?: React.ReactNode;
}) {
  const Wrapper = onPress ? Pressable : View;
  const solid = tone === 'solid';
  return (
    // Tighter padding/gaps and a smaller inline icon (no separate chip
    // circle) than before — these are temporary "heads up" notifications,
    // not primary content, so the card shouldn't take as much vertical
    // space as an actual action tile.
    <View style={{ borderRadius: 14, backgroundColor: solid ? accent : (isDark ? colors.card : accent + '14'),
      borderWidth: 1.5, borderColor: solid ? accent : accent + '50', padding: 10, gap: 6 }}>
      <Wrapper onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Icon size={16} color={solid ? '#fff' : accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: KID.sub, fontWeight: '900', color: solid ? '#fff' : accent }} numberOfLines={2}>{title}</Text>
          {!!detail && <Text style={{ fontSize: KID.tiny, color: solid ? 'rgba(255,255,255,0.85)' : colors.textSecondary, marginTop: 1 }} numberOfLines={2}>{detail}</Text>}
        </View>
        {onDismiss && (
          <Pressable onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={15} color={solid ? '#fff' : colors.textTertiary} />
          </Pressable>
        )}
      </Wrapper>
      {children}
    </View>
  );
}

// ─── Live Pick-up Radar row — was PickupRadarStatus (hubComponents.tsx) ────
// Not dismissible — it reflects a trip that's actually in progress right
// now, not a stale notification; it disappears on its own once the trip
// ends (activeTrips no longer includes it), same as before.
function NeedsYouTripRow({ colors, isDark, activeTrip }: {
  colors: any; isDark: boolean;
  activeTrip: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; etaMinutes: number; startedAtMs?: number };
}) {
  const elapsedMin = activeTrip.startedAtMs ? (Date.now() - activeTrip.startedAtMs) / 60_000 : 0;
  const isOverdue = elapsedMin - activeTrip.etaMinutes >= 5;
  const activeColor = isOverdue ? colors.danger : MONEY_GREEN;

  return (
    <NeedsYouRow
      Icon={Navigation} accent={activeColor} colors={colors} isDark={isDark}
      title={`${activeTrip.driverName} picking up ${activeTrip.kidName}`}
      detail={isOverdue ? 'Running behind — trip is still on the way' : 'En route now'}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 18 }}>{activeTrip.driverEmoji ?? '🚗'}</Text>
        <MapPin size={12} color={activeColor} />
        <Text style={{ fontSize: 18 }}>{activeTrip.kidEmoji ?? '🧒'}</Text>
      </View>
    </NeedsYouRow>
  );
}

// ─── Confirmed-ride row — was KidRideBanner.tsx ────────────────────────────
function rideState(rideCountdown: number, confirmed: boolean) {
  if (confirmed) return 'confirmed' as const;
  if (rideCountdown > 15) return 'counting' as const;
  if (rideCountdown > -2) return 'here' as const;
  if (rideCountdown > -30) return 'overdue' as const;
  return 'stale' as const;
}

function NeedsYouRideRow({ ev, rideCountdown, colors, isDark, active, members, onConfirmPickup, onDismiss, onSendDriverLate, lateNudgeSent, conflictReason, driverDispatched }: {
  ev: FamilyEvent; rideCountdown: number; colors: any; isDark: boolean;
  active: FamilyMember; members: FamilyMember[];
  onConfirmPickup: (ev: FamilyEvent) => void;
  onDismiss: (evId: string) => void;
  onSendDriverLate?: (ev: FamilyEvent) => void;
  lateNudgeSent?: Record<string, boolean>;
  // Same assignee-double-booked signal ParentView shows a parent — the
  // kid's driver is also assigned to a different event around the same
  // time. Purely informational here (no reassign action — that's a
  // parent-only decision), just so the kid isn't blindsided if the ride
  // ends up late/needs a swap.
  conflictReason?: string;
  // Real Pick-up Radar signal (an active, undispatched-yet trip exists
  // for this ride's driver), not just the scheduled clock — same
  // master-flow-audit fix as KidRideBanner.tsx's own driverDispatched
  // prop (Teen/Senior use that component directly; this row duplicates
  // its state machine for Kid, so needs the signal passed in separately).
  driverDispatched?: boolean;
}) {
  const confirmed = !!ev.pickupConfirmedAt;
  const state = rideState(rideCountdown, confirmed);
  if (state === 'stale' && !confirmed) return null; // nothing left to say, no dismiss needed — it's just gone

  const rideHere   = state === 'here';
  // A genuinely dispatched driver is never "overdue" — they're actively
  // en route, a materially less alarming situation than the clock alone
  // passing with nobody having said anything.
  const isOverdue  = state === 'overdue' && !driverDispatched;
  const onTheWay   = !!driverDispatched && !confirmed && !rideHere;

  const Icon = confirmed ? Check : isOverdue ? AlertTriangle : (rideHere || onTheWay) ? PartyPopper : Car;
  const accent = confirmed ? MONEY_GREEN : isOverdue ? colors.danger : MONEY_GREEN;
  const tone: 'flat' | 'solid' = (isOverdue || rideHere) ? 'solid' : 'flat';

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

  const alertSent = !!lateNudgeSent?.[ev.id];

  return (
    <NeedsYouRow
      Icon={Icon} accent={accent} colors={colors} isDark={isDark} tone={tone}
      title={headline} detail={`${ev.title} · ${fmtTime(ev.time)}`}
      // Always dismissible — this is meant to be a temporary "heads up"
      // banner, not a fixture sitting on screen for hours until the ride
      // is overdue. Dismissal is per-item and DB-backed
      // (dismissedHubItemsStore), so dismissing an early reminder doesn't
      // lose anything — the ride itself is still on Timeline/Schedule.
      onDismiss={() => { onDismiss(ev.id); }}
    >
      {!confirmed && conflictReason && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <AlertTriangle size={12} color={tone === 'solid' ? '#fff' : colors.danger} />
          <Text style={{ fontSize: KID.sub, fontWeight: '800', color: tone === 'solid' ? '#fff' : colors.danger }}>
            {conflictReason}
          </Text>
        </View>
      )}
      {!confirmed && (rideHere || isOverdue || onTheWay) && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => { onConfirmPickup(ev); }}
            style={{ flex: 1, backgroundColor: tone === 'solid' ? 'rgba(255,255,255,0.9)' : MONEY_GREEN, borderRadius: 12, paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: tone === 'solid' ? accent : '#fff' }}>I'm picked up</Text>
          </Pressable>
          {onSendDriverLate && (
            <Pressable onPress={() => { onSendDriverLate(ev); }}
              style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: tone === 'solid' ? 'rgba(255,255,255,0.6)' : accent + '60', borderRadius: 12, paddingVertical: 9, alignItems: 'center', opacity: alertSent ? 0.7 : 1 }}>
              <Text style={{ fontSize: KID.sub, fontWeight: '900', color: tone === 'solid' ? '#fff' : accent }}>{alertSent ? 'Sent ✓' : 'Alert my parent'}</Text>
            </Pressable>
          )}
        </View>
      )}
    </NeedsYouRow>
  );
}

// ─── Main merged section ────────────────────────────────────────────────────
// Merges what were 4 separate conditionally-rendered pieces (KidUrgentAlerts,
// KidRideBanner, AwaitingDriverBanner, PickupRadarStatus) into ONE "Needs
// You" list — every entry here is fundamentally "something needs the kid's
// attention," just triggered by a different condition. Renders nothing (no
// empty state / no header) when there's nothing to show, so it never takes
// up space on a quiet day.
export function KidNeedsYouSection({
  declinedRides, pendingRides, declinedQuests, approvedQuests, cheersForMe, recentReplies,
  confirmedRide, rideCountdown, confirmedRideConflict, confirmedRideDispatched, awaitingDriverRide, activeTrips,
  active, members, colors, isDark, dismissedIds, onDismiss,
  onConfirmPickup, onSendDriverLate, lateNudgeSent,
}: {
  declinedRides: FamilyEvent[]; pendingRides: FamilyEvent[];
  declinedQuests: Quest[]; approvedQuests: Quest[];
  cheersForMe: { quest: Quest; cheer: QuestCheer }[];
  recentReplies: any[];
  confirmedRide: FamilyEvent | undefined; rideCountdown: number | null;
  // Assignee-double-booked reason (e.g. "Priya assigned to 2 events") if
  // confirmedRide's driver is also on another event around the same time
  // — see detectAssigneeConflicts.ts, shared with ParentView's own
  // conflict detection.
  confirmedRideConflict?: string;
  // Real Pick-up Radar signal — see NeedsYouRideRow's own doc comment.
  confirmedRideDispatched?: boolean;
  awaitingDriverRide: FamilyEvent | undefined;
  activeTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number }[];
  members: FamilyMember[]; active: FamilyMember; colors: any; isDark: boolean;
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
  onConfirmPickup: (ev: FamilyEvent) => void;
  onSendDriverLate: (ev: FamilyEvent) => void;
  lateNudgeSent: Record<string, boolean>;
}) {
  const filteredDeclinedRides = declinedRides.filter(ev => !dismissedIds.has(`ride-${ev.id}`));
  const filteredPendingRides  = pendingRides.filter(ev => !dismissedIds.has(`pending-${ev.id}`));
  const filteredDeclinedQuests = declinedQuests.filter(q => !dismissedIds.has(`quest-${q.id}`));
  const filteredApprovedQuests = approvedQuests.filter(q => !dismissedIds.has(`quest-approved-${q.id}`));
  const filteredCheersForMe = cheersForMe.filter(({ quest, cheer }) => !dismissedIds.has(`cheer-${quest.id}-${cheer.memberId}`));

  // Full-screen celebration (same one Parent's chore-approval flow uses —
  // GlobalCelebration, mounted once at HubScreen's root) instead of the old
  // small in-row confetti burst, which looked cramped/"dumping" confined to
  // a single list row. Fires once per genuinely congratulatory item the kid
  // hasn't already seen: a cheer landing, a chore/quest getting approved,
  // or a permission request getting approved (declines/other reply types
  // don't celebrate — nothing to celebrate there).
  //
  // celebratedKeys alone used to be the ONLY guard — an in-memory ref that
  // resets to empty on every fresh mount (app relaunch, or re-entering
  // this profile), so anything still un-dismissed replayed its
  // celebration every single time, even with nothing new to celebrate
  // (live-reported: "even there is no latest approvals or good news then
  // animation still playing"). Fixed with a real watermark:
  // active.lastCelebrationSeenAt, persisted to members — only an item
  // whose own timestamp (approvedAt/cheer.at/respondedAt) is NEWER than
  // the watermark celebrates; anything older is treated as already seen
  // regardless of dismiss state. celebratedKeys stays as the within-
  // session guard (avoids a double-trigger from a re-render before the
  // watermark write round-trips), the watermark is what survives a
  // restart.
  const celebratedKeys = useRef<Set<string>>(new Set());
  const approvedPermissionReplies = recentReplies.filter(r => r.status === 'approved' && r.type === 'permission');
  const seenWatermark = active.lastCelebrationSeenAt ? parseDbTime(active.lastCelebrationSeenAt).getTime() : 0;
  useEffect(() => {
    const freshItems = [
      ...filteredCheersForMe.map(({ quest, cheer }) => ({ key: `cheer-${quest.id}-${cheer.memberId}`, at: cheer.at })),
      ...filteredApprovedQuests.map(q => ({ key: `quest-approved-${q.id}`, at: q.approvedAt })),
      ...approvedPermissionReplies.map(r => ({ key: `reply-${r.id}`, at: r.respondedAt })),
    ];
    let played = false;
    for (const { key, at } of freshItems) {
      if (celebratedKeys.current.has(key)) continue;
      // Postgres sends timestamps as "2026-08-24 19:53:09.967932+00" (space
      // separator, 2-digit UTC offset) — new Date() on React Native's JS
      // engine returns NaN for that exact shape. NaN <= anything is always
      // false in JS, so the "already seen" skip below silently never fired
      // for ANY item with this timestamp shape — confirmed live, itemMs=NaN
      // on every single quest-approved item, which is why the watermark
      // fix never actually stopped the replay. parseDbTime (lib/dates.ts)
      // is this codebase's existing, already-correct normalizer for
      // exactly this shape — use it instead of trusting the raw string.
      const itemMs = at ? parseDbTime(at).getTime() : 0;
      const validItemMs = Number.isFinite(itemMs) ? itemMs : 0;
      if (validItemMs <= seenWatermark) continue; // already seen in an earlier session, even if never dismissed
      celebratedKeys.current.add(key);
      useCelebrationStore.getState().trigger();
      played = true;
    }
    if (played) {
      const nowIso = new Date().toISOString();
      useFamilyStore.getState().updateMember(active.id, { lastCelebrationSeenAt: nowIso })
        .catch(e => console.warn('[KidNeedsYouSection] update lastCelebrationSeenAt failed', e));
    }
  }, [
    filteredCheersForMe.map(({ quest, cheer }) => `${quest.id}-${cheer.memberId}`).join(','),
    filteredApprovedQuests.map(q => q.id).join(','),
    approvedPermissionReplies.map(r => r.id).join(','),
    seenWatermark,
  ]);

  const showConfirmedRide = !!confirmedRide && rideCountdown !== null && rideCountdown > -180 && !dismissedIds.has(confirmedRide.id);
  const showAwaitingDriver = !confirmedRide && !!awaitingDriverRide && !dismissedIds.has(`awaiting-${awaitingDriverRide.id}`);

  const hasAnything = filteredDeclinedRides.length > 0 || filteredPendingRides.length > 0 ||
    filteredDeclinedQuests.length > 0 || filteredApprovedQuests.length > 0 || filteredCheersForMe.length > 0 ||
    recentReplies.length > 0 || showConfirmedRide || showAwaitingDriver || !!activeTrips?.length;

  if (!hasAnything) return null;

  return (
    // marginBottom bumped from 4 to 14 — these cards sat almost flush
    // against the action-tile row directly below (KidTodaySection),
    // reading as if they were part of the same group rather than two
    // distinct sections.
    <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 14 }}>
      {showConfirmedRide && (
        <NeedsYouRideRow
          ev={confirmedRide!} rideCountdown={rideCountdown!} colors={colors} isDark={isDark}
          active={active} members={members}
          onConfirmPickup={onConfirmPickup}
          onDismiss={(id) => onDismiss(id)}
          onSendDriverLate={onSendDriverLate} lateNudgeSent={lateNudgeSent}
          conflictReason={confirmedRideConflict}
          driverDispatched={confirmedRideDispatched}
        />
      )}

      {showAwaitingDriver && (() => {
        const driverFirst = eventAssignee(awaitingDriverRide!).name?.split(' ')[0] ?? 'Someone';
        return (
          <NeedsYouRow
            Icon={UserCheck} accent={BRAND.purple} colors={colors} isDark={isDark}
            title={`${driverFirst} was asked to drive you`}
            detail={`${awaitingDriverRide!.title} · ${fmtTime(awaitingDriverRide!.time)} · waiting for ${driverFirst} to confirm`}
            onDismiss={() => { onDismiss(`awaiting-${awaitingDriverRide!.id}`); }}
          />
        );
      })()}

      {activeTrips?.map(trip => (
        <NeedsYouTripRow key={trip.tripId} colors={colors} isDark={isDark} activeTrip={trip} />
      ))}

      {filteredDeclinedRides.map(ev => (
        <NeedsYouRow key={ev.id} Icon={Car} accent={colors.danger} colors={colors} isDark={isDark}
          title={`No driver — ${ev.title}`}
          detail={ev.declinedBy ? `${ev.declinedBy} can't make it` : 'Your parent is finding someone'}
          onDismiss={() => { onDismiss(`ride-${ev.id}`); }} />
      ))}

      {filteredPendingRides.map(ev => {
        const h = hoursUntilEvent(ev.date, ev.time);
        const isUrgent = h >= 0 && h < 2;
        return (
          <NeedsYouRow key={ev.id} Icon={isUrgent ? AlertTriangle : Clock} accent={isUrgent ? colors.danger : BRAND.amber} colors={colors} isDark={isDark}
            title={isUrgent ? 'Still no driver — getting close!' : 'Waiting on driver…'}
            detail={`${ev.title} · ${fmtTime(ev.time)}`}
            onDismiss={() => { onDismiss(`pending-${ev.id}`); }} />
        );
      })}

      {filteredDeclinedQuests.map(q => {
        const note = q.history?.slice().reverse().find((h: any) => h.action === 'declined')?.note;
        return (
          <NeedsYouRow key={q.id} Icon={RotateCcw} accent={BRAND.purple} colors={colors} isDark={isDark}
            title="Quest sent back" detail={note ? `"${note}"` : q.title}
            onPress={() => { router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any); onDismiss(`quest-${q.id}`); }}
            onDismiss={() => { onDismiss(`quest-${q.id}`); }} />
        );
      })}

      {filteredApprovedQuests.map(q => (
        <NeedsYouRow key={`approved-${q.id}`} Icon={PartyPopper} accent={MONEY_GREEN} colors={colors} isDark={isDark}
          title="Quest approved!" detail={`${q.title} · +${q.coins} coins`}
          onPress={() => { router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any); onDismiss(`quest-approved-${q.id}`); }}
          onDismiss={() => { onDismiss(`quest-approved-${q.id}`); }} />
      ))}

      {filteredCheersForMe.map(({ quest, cheer }) => {
        const cheerer = members.find(m => m.id === cheer.memberId);
        const key = `cheer-${quest.id}-${cheer.memberId}`;
        return (
          <NeedsYouRow key={key} Icon={PartyPopper} accent={BRAND.purple} colors={colors} isDark={isDark}
            title={`${cheerer?.name?.split(' ')[0] ?? 'Someone'} cheered for you!`}
            detail={`${quest.title}${cheer.coins ? ` · +${cheer.coins} bonus 🪙` : ''}`}
            onDismiss={() => { onDismiss(key); }} />
        );
      })}

      {recentReplies.map(r => {
        const approved = r.status === 'approved';
        const isCheckin = r.type === 'checkin';
        const accent = isCheckin ? BRAND.teal : approved ? MONEY_GREEN : colors.danger;
        const ReplyIcon = isCheckin ? ThumbsUp : approved ? CheckCircle2 : XCircle;
        const label = isCheckin ? 'Seen!' : approved ? 'Yes!' : 'No';
        const typeLabel = isCheckin ? 'Check-in' : r.type === 'medication' ? 'Medical' : r.type === 'permission' ? 'Permission'
          : r.type === 'tutor' ? 'Tutor Offer' : r.type === 'cheer' ? 'Cheer' : 'Question';
        const responder = r.respondedBy ? members.find(m => m.id === r.respondedBy) : null;
        const responderName = responder ? responder.name.split(' ')[0] : 'Parent';
        let timeAgo = '';
        if (r.respondedAt) {
          const diffMins = Math.floor((Date.now() - parseDbTime(r.respondedAt).getTime()) / 60000);
          if (Number.isFinite(diffMins)) {
            timeAgo = diffMins < 60 ? `${diffMins}m ago` : diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` : `${Math.floor(diffMins / 1440)}d ago`;
          }
        }
        return (
          <NeedsYouRow key={r.id} Icon={ReplyIcon} accent={accent} colors={colors} isDark={isDark}
            title={`${label} — ${typeLabel}`}
            onDismiss={() => { onDismiss(r.id); }}
          >
            <View>
              <Text style={{ fontSize: KID.tiny, color: colors.textTertiary }}>
                {responderName}{timeAgo && ` · ${timeAgo}`}
              </Text>
              <Text style={{ fontSize: KID.sub, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>"{r.detail}"</Text>
              {r.parentNote ? (
                <Text style={{ fontSize: KID.sub, fontStyle: 'italic', marginTop: 4 }}>
                  <Text style={{ color: accent, fontStyle: 'normal', fontWeight: '700' }}>Parent: </Text>
                  <Text style={{ color: colors.textPrimary }}>"{r.parentNote}"</Text>
                </Text>
              ) : null}
            </View>
          </NeedsYouRow>
        );
      })}
    </View>
  );
}
