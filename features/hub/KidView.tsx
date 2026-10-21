import { useState, useEffect, useRef } from 'react';
import { View, Alert, Animated, Easing } from 'react-native';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import type { Quest } from '@/store/questStore';
import { useEventStore, isEventSensitive, canViewSensitiveEventDetail, eventAssignee } from '@/store/eventStore';
import { dedupeRideSeries } from './lib/dedupeRideSeries';
import { useRewardStore } from '@/store/rewardStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useDismissedHubItemsStore } from '@/store/dismissedHubItemsStore';
import { withinLast24h } from '@/lib/dates';
import { useChatStore } from '@/store/chatStore';
import { localToday, fmtTime, hoursUntilEvent, useCountdown, isWorkEvent } from './hubUtils';
import { parseLocalDate } from '@/lib/dates';
import { detectAssigneeConflicts, detectWorkConflicts } from './lib/detectAssigneeConflicts';
import { driverLabelByName } from '@/lib/format';
import { BRAND } from '@/components/FamilyCubeLogo';

// Encoding helpers and modals live in KidModals.tsx
export { GROCERY_PREFIX, SUPPLIES_PREFIX, encodeGroceryRequest, decodeGroceryRequest } from './KidModals';
import { SUPPLIES_PREFIX, encodeRideLate, decodeRideLate } from './KidModals';
import { useUpcomingOpenEvents } from './useUpcomingOpenEvents';

import { MedicationsCard } from './senior/MedicationsCard';
import { useMedications } from '@/features/vault/tabs/health/useMedications';
import { KidHeroCard } from './kid/KidHeroCard';
import { KidNeedsYouSection } from './kid/KidNeedsYouSection';
import { KidTodaySection } from './kid/KidTodaySection';
import { KidChoresNeedsYouCard } from './kid/KidChoresNeedsYouCard';
import { KidActionGrid, KidCheckinRow } from './kid/KidMoreRow';
import { RideStatusCard } from './kid/RideStatusCard';
import { CantMakeItSheet } from '../tasks/components/CantMakeItSheet';
import { TonightMealCard } from './parent/TonightMealCard';

// ─── Main KidView ──────────────────────────────────────────────────────────────
export function KidView({ focusKey, active, members, colors, isDark, activeTrips, familyId, composerVisible, onCloseComposer, onMyChores, onOpenMyChoresTab, onPiggyBank, onAskParentTile, onAskForRide, onRideStatusOpen }: {
  // Same staggered-entrance trigger ParentView.tsx uses — focusKey=0 means
  // "subpage pop, show immediately," any other value replays the entrance.
  focusKey?: number;
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  // Family-wide Pick-up Radar state, synced from tripStore — shown here
  // read-only (driver controls the ETA/Pickup Done) so a kid can see the
  // same live trip progress the driver's own Hub shows. Every concurrently
  // active trip is shown, not just one, since a trip is visible family-wide
  // regardless of who's driving or who it's for.
  activeTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number }[];
  familyId?: string;
  // The Hub-level FAB (HubScreen.tsx, floats outside its ScrollView) and
  // this smart-ask composer share one visibility flag lifted up to
  // HubScreen — a plain View "FAB" rendered from inside this fragment
  // would scroll away with the page instead of staying pinned, since
  // KidView is itself scrolled content, not a positioned ancestor.
  composerVisible: boolean;
  onCloseComposer: () => void;
  // My Chores / Piggy Bank / Ask Parent now render via KidOverlays, a
  // top-level sibling HubScreen mounts OUTSIDE its own ScrollView (same
  // reasoning as composerVisible above) — this view only owns the tile
  // taps that open them.
  onMyChores: () => void;
  // Needs You card's tap target — opens My Chores landing directly on the
  // given status tab (e.g. 'review' for a submitted item awaiting
  // approval) instead of always defaulting to 'todo'.
  onOpenMyChoresTab: (tab: 'todo' | 'review' | 'done' | 'bounty') => void;
  onPiggyBank: () => void;
  onAskParentTile: () => void;
  // Ride also keeps its own full-width Quick Action card for fast access,
  // opening AskParentUnifiedPage's ride pill directly (via
  // setAskParentDestination('ride') in HubScreen.tsx) — the same
  // destination the Ask Parent hub's own "Ask for a Ride" tile now also
  // leads to (AskParentHubScreen.tsx).
  onAskForRide: () => void;
  // Opens RidesControlRoomScreen (same screen the parent uses for the
  // family-wide fleet view: Active/Upcoming/History tabs, live trip
  // progress, driver ETA) [live-requested: "ask for a ride full width
  // card on the kids hub page should open like the parents page to see
  // their open their ride status and the history progress etc"]. Only
  // used once the kid has an actual ride to look at (pending or
  // confirmed) — with nothing going on yet the card still opens the
  // request form, same as before.
  onRideStatusOpen: () => void;
}) {
  const { quests, submitQuest, claimQuest, cheerQuest } = useQuestStore();
  const startGrandparentQuest = useChoreStore(s => s.startGrandparentQuest);
  const events = useEventStore(s => s.events);
  const updateEvent = useEventStore(s => s.updateEvent);
  const { rewards, redeemReward, getEligibleRewards, redemptions } = useRewardStore();
  const { sendRequest, requests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests, expireStale: expireStaleRequests } = useKidRequestStore();
  const { sendMessage }                                   = useChatStore();

  const [lateNudgeSent,   setLateNudgeSent]   = useState<Record<string, boolean>>({});
  const [declineQuest,    setDeclineQuest]    = useState<ChoreTask | null>(null);

  // KidView can render without ParentView ever having mounted this session
  // (e.g. app opened straight into Kid Mode), so it must hydrate the kid
  // request store itself instead of relying on ParentView to have done it.
  useEffect(() => {
    if (!kidRequestsLoaded) loadKidRequests();
  }, [kidRequestsLoaded]);

  // Lazy client-side sweep for checkin/question requests whose expiresAt
  // has passed (set in kidRequestStore.sendRequest) — closes the gap
  // between hourly server-side sweeps (kid-request-expire-sweep) so a
  // stale request doesn't still show as "pending" on Hub open.
  useEffect(() => {
    if (kidRequestsLoaded) expireStaleRequests();
  }, [kidRequestsLoaded]);

  // My Chores / Piggy Bank / Ask Parent full-bleed + tab-bar handling now
  // lives in HubScreen.tsx's own anyFullBleedOpen effect, alongside
  // KidOverlays (which actually renders these screens, outside this
  // view's ScrollView).

  // Dismiss state for the "Needs You" list — DB-backed (dismissed_hub_items
  // table), not AsyncStorage: survives reinstall and syncs across a
  // shared/second device. dismissItem() is optimistic (updates local state
  // immediately) so a dismissed row disappears instantly, same feel as the
  // old local-only state, just actually persisted now.
  // dismissedLoaded gates KidNeedsYouSection's render below — without it, a
  // profile switch briefly showed every ALREADY-dismissed item for the new
  // member (the store clears dismissedIds synchronously while the DB fetch
  // for the new member is still in flight), including re-triggering
  // celebration animations for things the kid had already seen and
  // dismissed days ago. Confirmed live.
  const { dismissedIds, loaded: dismissedLoaded, load: loadDismissedHubItems, dismissItem } = useDismissedHubItemsStore();
  useEffect(() => {
    loadDismissedHubItems(active.id);
  }, [active.id]);

  const today       = localToday();
  // Was missing entirely from Kid/Teen Hub views — same shared hook
  // ParentView/SeniorView already use, so a kid's own medications (and
  // the overdue red-tint) are visible without needing a parent to check
  // for them [live-requested: "It should also show in kids view right
  // and teens too"].
  const { meds, addMed, toggleMed, deleteMed } = useMedications(familyId, active.id);
  const medsTaken = Object.fromEntries(meds.map(m => [m.id, m.taken_date === today])) as Record<string, boolean>;
  // Scenarios 2.6/5.4/5.5 — a sensitive/private/Medical event about a
  // sibling is hidden from this kid entirely (never even a busy block —
  // 5.4's "no scheduling dependency by default" for siblings). Own events
  // (this kid IS the subject) always pass through unaffected.
  const visibleEvents = events.filter(e =>
    !isEventSensitive(e, members) || canViewSensitiveEventDetail(e, 'kid', active.id, active.name));
  // Was e.memberId-only — a kid tagged via memberIds as "going with" a
  // sibling's ride (KidRequestModal's sibling-tagging feature) was
  // completely absent from their own Hub: no ride banner, no pending/
  // awaiting/confirmed/declined status, despite the Schedule tab correctly
  // showing it (CalendarScreen.tsx already checks memberIds). Live-DB QA,
  // kid-role sweep, High.
  const myEvents    = visibleEvents.filter(e => (e.memberId === active.id || e.memberIds?.includes(active.id) || !e.memberId) && e.category !== 'Work');
  const todayEvents = myEvents.filter(e => e.date === today).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  // Multi-day feed — previously awaitingDriverRide/myDeclinedRides only
  // ever looked at todayEvents, so a driver named (or declining) for a
  // ride tomorrow gave the kid zero signal until the morning of, same
  // today-only gap Round 9 already fixed on the GP side and Round 8 fixed
  // on the teen side (QA Round 11, Medium Finding M2).
  const { events: kidUpcomingEvents } = useUpcomingOpenEvents((active as any).familyId);
  const myUpcomingEvents = kidUpcomingEvents.filter(e =>
    (e.memberId === active.id || e.memberIds?.includes(active.id) || !e.memberId) && e.category !== 'Work' &&
    (!isEventSensitive(e, members) || canViewSensitiveEventDetail(e, 'kid', active.id, active.name)));

  // Confirmed ride — QA sweep Critical Finding C3: these 5 filters were all
  // helper/helperStatus-only, so a kid's OWN ride request (which now always
  // writes driverName/driverStatus via KidRequestModal's rideRequired:true
  // fix) never showed up in any of the kid's own status banners — "awaiting
  // driver," "confirmed," or "declined" all silently stayed invisible for
  // the exact request type this kid actually creates.
  // Was todayEvents-only (Coordinated cross-role QA round, Bug #2, High) —
  // a ride confirmed for tomorrow showed correctly on the Schedule tab but
  // produced zero Hub banner, unlike awaitingDriverRide/myDeclinedRides
  // below which already read from the multi-day feed.
  // Was .find() — trusted array order to land on the SOONEST confirmed
  // ride, but a daily-recurring series materializes many future
  // occurrences that can ALSO carry helper_status='confirmed' (the
  // recurrence-series insert stamps every occurrence with the same
  // assignment). Live-reported/DB-confirmed: today's actual ride
  // (2026-08-24) was correctly confirmed AND pickup-confirmed, yet the
  // Hub kept showing an active/overdue ride banner — .find() had picked
  // tomorrow's (2026-08-25) row instead, which is also 'confirmed' but
  // obviously has no pickup confirmation yet, since it hasn't happened.
  // Explicitly sort by date+time and take the earliest, rather than
  // trusting whatever order the upstream feed happens to return.
  const confirmedRideCandidates = myUpcomingEvents.filter(e => {
    if (e.date < today) return false;
    const a = eventAssignee(e);
    return a.name && a.status === 'confirmed';
  });
  const confirmedRide = confirmedRideCandidates.sort((a, b) =>
    a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date)
  )[0];
  const rideCountdown = useCountdown(confirmedRide?.date, confirmedRide?.time);
  // "I'm ready for pickup!" used to blindly name confirmedRide regardless
  // of how far off it actually was — tapping it at 8am for a 4pm ride (or
  // even a ride days out, since confirmedRideCandidates has no window
  // check at all) still named that ride [live-requested: "when im ready-
  // we should not blicdly pickup ride to show ready for ride-- if they
  // click just bfore x min then we should take that - or it can be
  // generic"]. Scoped to just the check-in message, not confirmedRide
  // itself — the ride BANNER still legitimately shows a ride hours ahead
  // (that's real, useful information), only the "I'm ready" wording is
  // gated to genuinely imminent: within 60 minutes before pickup through
  // 30 minutes after (the same grace window the banner's own overdue
  // state already tolerates before going stale), falling back to generic
  // copy with no ride name outside that window.
  const imminentRide = confirmedRide && rideCountdown !== null && rideCountdown <= 60 && rideCountdown >= -30
    ? confirmedRide
    : undefined;
  // Real Pick-up Radar signal, not just the scheduled clock — master-flow
  // audit finding: the ride banner previously derived "here"/"overdue"
  // purely from rideCountdown, so it could say a ride was overdue while
  // the driver was actually already en route, or say "HERE!" purely
  // because the clock hit zero regardless of whether Dispatch was ever
  // tapped. See KidRideBanner.tsx's driverDispatched prop (same fix,
  // TeenView/SeniorView use that component directly; KidView's own
  // NeedsYouRideRow inside KidNeedsYouSection.tsx duplicates its state
  // machine and needs the same signal passed in separately).
  const confirmedRideDispatched = !!confirmedRide && !!activeTrips?.some(t =>
    t.driverMemberId === eventAssignee(confirmedRide).id
  );
  // Same "driver double-booked" signal ParentView shows the parent —
  // a kid whose ride's driver is also assigned to a different event at
  // roughly the same time deserves to know too, not just the parent
  // (live direction: "conflicted kids should also show the symbol with
  // ride conflict"). Computed over ALL events (not just this kid's own),
  // since the conflict is about the DRIVER's schedule, which spans events
  // that may not even involve this kid.
  const assigneeConflicts = detectAssigneeConflicts(events);
  // Same idea, extended to a connected parent's real work calendar (auto-
  // synced Work events, see calendar-freebusy-sync) — a kid's ride
  // colliding with their driving parent's actual work schedule (live
  // direction: "Kid's also show on their card parent is conflict with work").
  const workConflicts = detectWorkConflicts(events, events.filter(isWorkEvent), members);
  const confirmedRideConflict = confirmedRide
    ? (assigneeConflicts.get(confirmedRide.id) ?? workConflicts.get(confirmedRide.id))
    : undefined;

  // A driver has been named but hasn't confirmed yet — the gap between
  // "nobody's looked at my request" (myPendingRides below, already
  // surfaced) and "confirmed, ride is happening" (confirmedRide above).
  // Previously invisible: a kid whose parent assigned a specific driver
  // had zero indication anyone had even acted on their request until that
  // driver tapped confirm, sometimes hours or days later.
  const awaitingDriverRide = myUpcomingEvents.find(e => { if (e.date < today) return false; const a = eventAssignee(e); return a.name && a.status === 'pending'; });

  // Next upcoming event (any, for countdown on hero if no ride)
  const nextEvent = todayEvents.find(e => hoursUntilEvent(e.date, e.time) > 0 && eventAssignee(e).status !== 'rejected');
  const nextCountdown = useCountdown(nextEvent?.date, nextEvent?.time);

  // dedupeRideSeries applied to both — same fix as ParentView/TeenView/
  // SeniorView's own Hub sections: a recurring ride can otherwise show one
  // card per future occurrence instead of just the soonest. Each list
  // deduped independently (not a shared call) since a series could
  // legitimately have one occurrence rejected and a LATER occurrence
  // still unassigned — each bucket needs its own soonest representative.
  const myDeclinedRidesRaw = myUpcomingEvents.filter(e =>
    e.date >= today && eventAssignee(e).status === 'rejected' && !e.approvalPending && hoursUntilEvent(e.date, e.time) >= -1
  );
  // A kid can name a preferred helper right when creating the ride request
  // (EventFormModal sets both approvalPending=true AND helper/helperStatus
  // in the same insert) — without excluding an already-named assignee here,
  // that single event matched BOTH this "nobody's looked at it yet" filter
  // AND awaitingDriverRide/confirmedRide below at once, rendering two
  // contradictory banners simultaneously (QA Round 7, finding B2). Once an
  // assignee is named, the other filters own communicating status.
  const myPendingRidesRaw = events.filter(e =>
    (e.memberId === active.id || e.memberIds?.includes(active.id)) && e.approvalPending && !eventAssignee(e).name && e.date >= today
  );
  const [myDeclinedRides] = dedupeRideSeries(myDeclinedRidesRaw);
  const [myPendingRides] = dedupeRideSeries(myPendingRidesRaw);

  const myRequests = requests.filter(r => r.fromMemberId === active.id && r.status !== 'cancelled');

  // A grandparent_quest still awaiting the parent's safety review collapses
  // to status 'todo' just like a normal ready quest (see choreAdapter's
  // choreStatusToQuestStatus) — exclude it everywhere here via
  // awaitingParentApproval so it never appears as visible/claimable before
  // a parent has actually signed off.
  // A chore mid-named-handoff stays assigned to the ORIGINAL holder until
  // the receiver actually accepts (offerChoreHandoff's whole point — a
  // real offer, not an immediate reassignment) — so assignedToId alone
  // never matches the receiver. Without this, the receiver's Accept/Pass
  // card (QuestCard.tsx's pendingHandoffTo block) was confirmed via QA
  // audit to be unreachable: the chore simply never appeared in their
  // "my quests" list for that card to render on in the first place.
  const myQuests       = quests.filter(q => (q.assignedToId === active.id || q.assignedToIds?.includes(active.id) || q.pendingHandoffTo === active.id) && !q.awaitingParentApproval);
  // inviteGrandparents-flagged chores stay GP-pool-only even while
  // isPool/todo (e.g. after a GP backs out) — excluded here too.
  // Live QA finding: "teens only" had no working restriction anywhere —
  // a young kid could see and claim a chore a parent meant to reserve for
  // a teenager. isOpenToTeens now means exactly that: excludes it from a
  // kid's own pool (still shows in TeenView's).
  const poolQuests     = quests.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask && !q.awaitingParentApproval && !q.inviteGrandparents && !q.isOpenToTeens);
  const bountyQuests   = poolQuests.filter(q => q.questType === 'bounty');
  // Includes 'declined' ("sent back") chores — a resubmission is still a
  // to-do for the kid, and MyChoresScreen's own To Do tab/counter already
  // folds declinedQuests in (MyChoresScreen.tsx groups:
  // [...todoQuests, ...inProgressQuests, ...declinedQuests]) — the Hub's
  // KidChoresNeedsYouCard "To Do" count/headline was missing them,
  // undercounting vs. the screen it opens into.
  const todoQuests       = myQuests.filter(q => (q.status === 'todo' || q.status === 'declined') && !q.isPool);
  const reviewQuests   = myQuests.filter(q => q.status === 'pending_approval');
  const declinedQuests = myQuests.filter(q => q.status === 'declined');
  const approvedQuests = myQuests.filter(q => ['approved', 'done'].includes(q.status));
  const doneToday      = myQuests.filter(q => ['approved','done'].includes(q.status)).length;
  // Same isOverdue definition as KidQuestCard.tsx / QuestCard.tsx: date-only
  // compare against the start of today, excluded once done/declined.
  const overdueQuestsStart = new Date(); overdueQuestsStart.setHours(0, 0, 0, 0);
  const overdueQuests = myQuests.filter(q => {
    const dueMs = q.dueDate ? parseLocalDate(q.dueDate).getTime() : null;
    return !!dueMs && dueMs < overdueQuestsStart.getTime() && !['approved','done'].includes(q.status) && q.status !== 'declined';
  });
  // Rewards quick-action tile's own stacked counters [live-requested:
  // "pippy back [sic, meant Rewards] card should show the pending rewards
  // request, approved requests today if available"].
  const myRedemptions = redemptions.filter(r => r.memberId === active.id);
  const pendingRedemptions = myRedemptions.filter(r => r.status === 'pending');
  const approvedRedemptionsToday = myRedemptions.filter(r => r.status === 'approved' && r.respondedAt && withinLast24h(r.respondedAt));
  const questGoal      = Math.max(myQuests.filter(q => (q.status as string) !== 'pending_parent_approval').length, 3);
  const questPct       = Math.min(doneToday / questGoal, 1);

  const siblingKids = members.filter(m => m.role === 'kid' && m.id !== active.id);

  // Cheers landed on my own completed quests — surfaced as a celebration banner
  const cheersForMe = myQuests.flatMap(q => (q.cheers ?? []).map(c => ({ quest: q, cheer: c })));
  const eligibleRewards   = getEligibleRewards(active.id);
  const mainCoins  = (active as any).mainCoins ?? (active as any).coins ?? 0;
  const gpCoins    = (active as any).gpCoins ?? 0;
  const streak     = (active as any).streak ?? 0;
  const xp         = (active as any).xp ?? 0;
  // Was reading a stored `level` column that nothing in the app ever
  // increments — awardPoints credits xp on every payout but never touches
  // level, so a kid's XP bar filled, wrapped back to 0%, and repeated
  // forever with the "Lv N" badge frozen at its seed value, no level-up
  // moment ever firing (QA sweep, kid-role audit, Medium). Derived purely
  // from xp instead: level N needs N*100 xp to clear (matching the
  // existing xpForNext = level*100 progression this screen already
  // assumed), so cumulative xp to REACH level N is 100*(N-1)*N/2 — solve
  // for the largest N whose cumulative threshold xp has already cleared.
  const level = (() => {
    let n = 1;
    while (xp >= 100 * n * (n + 1) / 2) n++;
    return n;
  })();
  const xpIntoLevel = xp - 100 * (level - 1) * level / 2;
  const xpForNext  = level * 100;
  const xpPct      = Math.min(xpIntoLevel / xpForNext, 1);
  const almostAffordable = rewards.filter(r => !eligibleRewards.find(e => e.id === r.id) && r.cost > 0 && r.cost - mainCoins <= 30 && r.cost - mainCoins > 0);
  const goalReward = (active as any).goalRewardId
    ? rewards.find(r => r.id === (active as any).goalRewardId && r.available)
    : undefined;

  const sendCheckin = (type: 'home' | 'ready' | 'late') => {
    const messages: Record<string, { detail: string; chatMsg: string; emoji: string }> = {
      home:  { detail: "I'm home! 🏠", chatMsg: `${active.name.split(' ')[0]} is home! 🏠`, emoji: "🏠 I'm home!" },
      ready: { detail: `I'm ready for pickup! 🎒${imminentRide ? ` (${imminentRide.title})` : ''}`,
               chatMsg: `${active.name.split(' ')[0]} is ready for pickup! 🎒${imminentRide ? ` (${imminentRide.title})` : ''}`, emoji: "🎒 I'm ready!" },
      late:  { detail: `Running a bit late 🏃${nextEvent ? ` for ${nextEvent.title}` : ''}`,
               chatMsg: `${active.name.split(' ')[0]} is running late 🏃${nextEvent ? ` for ${nextEvent.title}` : ''}`, emoji: '🏃 Running late!' },
    };
    const m = messages[type];
    sendRequest({ type: 'checkin', fromMemberId: active.id, detail: m.detail, urgency: type === 'late' ? 'soon' : 'normal' });
    // sendRequest above already fires its own "Kid Request" push — the
    // chat message here is just a visible record in Family Chat, so its
    // own separate chat-notify push is suppressed to avoid a duplicate
    // notification for the same one tap (live-reported: "I'm home!"
    // produced both a Family Chat push and a Kid Request push).
    sendMessage('all', active.id, m.chatMsg, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
    Alert.alert(m.emoji, 'Family has been notified!');
  };

  const sendDriverLate = (ev: typeof todayEvents[0]) => {
    // lateNudgeSent alone was local React state — reset on every remount
    // (app background/foreground, screen refocus, tab switch), so the
    // guard only ever blocked a second tap in the SAME session. A
    // remounted Hub let the kid tap "Alert" again, creating a genuine
    // duplicate kid_requests row + duplicate chat message each time —
    // live-reported as multiple "kid not picked up" banners stacking on
    // the parent's side for one ride. Check the actual DB-backed requests
    // array for an existing unresolved (pending) alert for this exact
    // event before creating another one — survives remounts because it's
    // real synced state, not local-only.
    const alreadyPending = requests.some(r =>
      r.fromMemberId === active.id && r.status === 'pending' &&
      decodeRideLate(r.detail)?.eventId === ev.id
    );
    if (lateNudgeSent[ev.id] || alreadyPending) {
      Alert.alert('Already sent', 'You already notified your parent about this.');
      setLateNudgeSent(p => ({ ...p, [ev.id]: true }));
      return;
    }
    sendRequest({
      type: 'emergency', fromMemberId: active.id, urgency: 'urgent',
      // Structured so the parent's Action Needed card can show the ride itself,
      // not just a sentence — see decodeRideLate in KidModals.
      detail: encodeRideLate({
        eventId:      ev.id,
        title:        ev.title,
        time:         ev.time,
        driver:       eventAssignee(ev).name,
        location:     ev.pickupLocation ?? ev.location,
        dropLocation: ev.dropLocation,
        sentAt:       new Date().toISOString(),
      }),
      location:      ev.pickupLocation ?? ev.location,
      scheduledTime: ev.time ? fmtTime(ev.time) : undefined,
    });
    // Was hardcoded "My driver" regardless of who's actually assigned —
    // reads oddly when the driver is a named parent/grandparent ("My
    // driver hasn't arrived" instead of "Dad hasn't arrived"). A parent
    // shows as just their subRole ("Dad"/"Mom") — no ambiguity, every kid's
    // dad is "Dad". Anyone else (grandparent, teen sibling driving, aunt,
    // etc.) shows as "Name (Relation)". Falls back to "My ride" (not
    // "driver") only when nobody's actually assigned.
    const driverLabel = driverLabelByName(eventAssignee(ev).name, members);
    // Same duplicate-push fix as sendCheckin above — the emergency
    // sendRequest already pushed a notification; this chat message is
    // just the visible Family Chat record.
    sendMessage('all', active.id, `⚠️ ${active.name.split(' ')[0]}: ${driverLabel ?? 'My ride'} hasn't arrived yet for "${ev.title}"! Can someone check?`, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
    setLateNudgeSent(p => ({ ...p, [ev.id]: true }));
    Alert.alert('⚠️ Alert sent!', `Your parent has been notified that ${driverLabel ?? 'your ride'} is late.`);
  };

  // Either side (rider or driver) can confirm a pickup actually happened —
  // "helperStatus: confirmed" only ever meant the driver agreed to the run.
  // Whoever taps first closes the loop for everyone and clears the banner.
  const confirmPickup = (ev: typeof todayEvents[0]) => {
    if (ev.pickupConfirmedAt) return;
    updateEvent(ev.id, { pickupConfirmedAt: new Date().toISOString(), pickupConfirmedBy: active.id });
    sendMessage('all', active.id, `✅ ${active.name.split(' ')[0]} confirmed pickup for "${ev.title}" — all good!`);
  };

  // A photoRequired quest's "Take Photo to Get Paid" button is handled
  // entirely inline inside KidQuestDetailScreen/KidQuestCard's own
  // onOpenDetail routing now (a plain View compose block, not a Modal
  // sheet) [live-corrected: "I said don't use bottom sheets use inline
  // photo proof similar to parent" — the earlier SubmitProofSheet modal
  // was the wrong shape]. This handler only ever reaches a non-photo
  // submit, so it just calls submitQuest directly.
  const handleSubmitTap = (q: Quest) => submitQuest(q.id, undefined, active.id);

  const recentReplies = myRequests.filter(r =>
    ['approved', 'declined'].includes(r.status) &&
    ['permission', 'question', 'medication', 'checkin', 'tutor', 'cheer'].includes(r.type) &&
    !dismissedIds.has(r.id) &&
    // Was a raw `new Date(r.respondedAt).getTime() > cutoff` — Postgres
    // timestamps ("2026-08-24 19:53:09+00") return NaN from a raw new
    // Date() on RN's JS engine, and NaN > cutoff is always false, so this
    // silently excluded every reply with that shape no matter how recent
    // (same root cause as the celebration-replay bug this session).
    // withinLast24h already normalizes via parseDbTime and handles the
    // null/NaN cases — no need to hand-roll the cutoff math here too.
    withinLast24h(r.respondedAt)
  );

  // Same staggered-entrance pattern as ParentView.tsx — one Animated.Value
  // pair per top-level section below (Hero / Needs You / Today / Quests /
  // More+Games), driven by focusKey (0 = subpage pop, show immediately).
  const CARD_COUNT = 7;
  // Start barely-faded (opacity 0.4 / translateY 8), NOT fully invisible
  // (0 / 18) — a PIN-switch mounts a brand-new KidView instance without any
  // real tab-focus event (HubScreen's own useFocusEffect never fires for
  // it), so if the mount-triggered Animated.start() below ever gets
  // dropped/raced (confirmed happening in practice — native-driver
  // animations queued right as a navigator stack swaps can silently no-op),
  // the worst case is now cards sitting slightly faded/offset, never a
  // fully blank screen [live-reported repeatedly, incl. "fucking killing
  // the app"]. The real fade+slide-up bounce on load still plays normally
  // every time the effect does fire.
  const opacities = useRef(Array.from({ length: CARD_COUNT }, () => new Animated.Value(1))).current;
  const translateYs = useRef(Array.from({ length: CARD_COUNT }, () => new Animated.Value(8))).current;
  const cardAnims = opacities.map((opacity, i) => ({ opacity, translateY: translateYs[i] }));

  const hasAnimatedIn = useRef(false);
  useEffect(() => {
    // Play the entrance once per mount. Replaying on every refocus reset the cards 8px down and slid them back, which read as a glitch.
    if (hasAnimatedIn.current) return;
    hasAnimatedIn.current = true;
    opacities.forEach(v => v.setValue(1));
    translateYs.forEach(v => v.setValue(8));
    const anims = opacities.map((op, i) =>
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 280, delay: 60 + i * 55, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(translateYs[i], { toValue: 0, duration: 300, delay: 60 + i * 55, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ])
    );
    Animated.parallel(anims).start();
    const failSafe = setTimeout(() => {
      opacities.forEach(v => v.setValue(1));
      translateYs.forEach(v => v.setValue(0));
    }, 900);
    return () => clearTimeout(failSafe);
  }, [focusKey]);

  return (
    <>
      {/* 1. Hero — identity/progress at a glance, plus the single most
          time-sensitive fact (confirmed ride or next event countdown). */}
      <Animated.View style={{ opacity: cardAnims[0].opacity, transform: [{ translateY: cardAnims[0].translateY }] }}>
        <KidHeroCard
          active={active} colors={colors} isDark={isDark}
          mainCoins={mainCoins} gpCoins={gpCoins} streak={streak} level={level}
          doneToday={doneToday} questGoal={questGoal} questPct={questPct}
          confirmedRide={confirmedRide} rideCountdown={rideCountdown} members={members}
          nextEvent={nextEvent} nextCountdown={nextCountdown}
        />
      </Animated.View>

      {/* 2. Today — timeline strip first, right under the hero, matching
          the Parent Hub's own "what's next" rhythm (ride/next-up before
          the inbox-style list below) — moved ahead of My Quests/Needs You
          per the Figma-inspired reorder [live direction: "can we redesign
          it with the inspiration the parents hub rhythm" — mockup's own
          order is hero → ride/next-up → chores-inbox → needs-you]. */}
      <Animated.View style={{ opacity: cardAnims[1].opacity, transform: [{ translateY: cardAnims[1].translateY }] }}>
        <KidTodaySection
          active={active} members={members} events={visibleEvents} updateEvent={updateEvent}
          colors={colors} isDark={isDark}
        />
      </Animated.View>

      {/* 3. Chores Needs You — single most-urgent chore card (submitted >
          to do > unclaimed bounty), same compact rhythm as Parent's own
          NeedsYouCard, replacing the old always-expanded MyQuestsSection
          [live-requested: "lets build need needs you similar to the
          parents needs you.. open the chores and it is todo, submitted,
          approved, bounty etc"]. Tapping it opens My Chores landing
          directly on that item's own status tab. */}
      <Animated.View style={{ opacity: cardAnims[2].opacity, transform: [{ translateY: cardAnims[2].translateY }] }}>
        <KidChoresNeedsYouCard
          colors={colors} isDark={isDark}
          todoQuests={todoQuests} reviewQuests={reviewQuests} bountyQuests={bountyQuests}
          onOpenTab={onOpenMyChoresTab}
        />
      </Animated.View>

      {/* 4. Needs You — merges what were 4 separate pieces (urgent alerts,
          confirmed-ride banner, awaiting-driver banner, live Pick-up Radar)
          into one list. Renders nothing when there's nothing to show.
          -180 (3hr), not -30, on the ride window — a pickup that ran late
          relative to the scheduled time is exactly when this mattered most
          (a parent's "Pickup Done" tap and the kid's actual pickup often
          diverge from the original schedule by more than 30 min), and the
          confirm option was disappearing before a delayed pickup even
          finished. Trip-completion itself isn't a signal this view can
          react to (tripStore.complete() only deletes local state, nothing
          persisted for the kid's Hub to read), so widening the schedule-
          based window is the fix instead of wiring a new signal. */}
      {dismissedLoaded && (
        <Animated.View style={{ opacity: cardAnims[3].opacity, transform: [{ translateY: cardAnims[3].translateY }] }}>
          <KidNeedsYouSection
            declinedRides={myDeclinedRides} pendingRides={myPendingRides}
            declinedQuests={declinedQuests} approvedQuests={approvedQuests}
            cheersForMe={cheersForMe} recentReplies={recentReplies}
            confirmedRide={confirmedRide} rideCountdown={rideCountdown}
            confirmedRideConflict={confirmedRideConflict}
            confirmedRideDispatched={confirmedRideDispatched}
            awaitingDriverRide={awaitingDriverRide} activeTrips={activeTrips}
            active={active} members={members} colors={colors} isDark={isDark}
            dismissedIds={dismissedIds} onDismiss={dismissItem}
            onConfirmPickup={confirmPickup}
            onSendDriverLate={sendDriverLate} lateNudgeSent={lateNudgeSent}
            onOpenHistory={() => onOpenMyChoresTab('review')}
            hasChoresCard={todoQuests.length > 0 || bountyQuests.length > 0}
          />
        </Animated.View>
      )}

      {/* 5. Quick Actions — merged grid (check-ins + Ask Parent + Piggy
          Bank + Rewards), then medication (moved after the action tiles,
          matching the mockup's own "care checklist" placement below its
          quick-actions row), then Family Games. Leaderboard, Cheer Squad,
          My Requests, and Full Calendar were cut as top-level tiles
          entirely [live direction: "need more simpler like the parents"]
          — Calendar is one tab-tap away already, the other three weren't
          essential daily actions. */}
      <Animated.View style={{ opacity: cardAnims[4].opacity, transform: [{ translateY: cardAnims[4].translateY }] }}>
        <KidActionGrid
          onMyChores={onMyChores}
          onAskParent={onAskParentTile}
          onPiggyBank={onPiggyBank}
          choreStats={[
            { label: 'To do',      value: todoQuests.length,     color: colors.amber },
            { label: 'Review',     value: reviewQuests.length,   color: colors.danger },
            { label: 'Approved',   value: doneToday,             color: colors.teal },
            { label: 'Overdue',    value: overdueQuests.length,  color: colors.danger },
          ]}
          rewardStats={pendingRedemptions.length > 0 || approvedRedemptionsToday.length > 0 ? [
            { label: 'Pending',       value: pendingRedemptions.length,       color: colors.amber },
            { label: 'Approved today', value: approvedRedemptionsToday.length, color: colors.teal },
          ].filter(s => s.value > 0) : undefined}
          colors={colors} isDark={isDark}
        />
      </Animated.View>

      <Animated.View style={{ opacity: cardAnims[5].opacity, transform: [{ translateY: cardAnims[5].translateY }] }}>
        <RideStatusCard
          colors={colors} isDark={isDark}
          pendingCount={myPendingRides.length}
          confirmedLabel={confirmedRide ? `Confirmed · ${confirmedRide.title}` : undefined}
          confirmedRideDate={confirmedRide?.date}
          confirmedRideTime={confirmedRide?.time}
          driverName={confirmedRide ? eventAssignee(confirmedRide).name : undefined}
          onPress={confirmedRide || myPendingRides.length > 0 ? onRideStatusOpen : onAskForRide}
        />
        <KidCheckinRow onCheckin={sendCheckin} colors={colors} isDark={isDark} />

        {meds.length > 0 && (
          <View style={{ marginTop: 14, marginBottom: 14 }}>
            <MedicationsCard meds={meds} medsTaken={medsTaken} toggleMed={toggleMed} onAddMed={addMed} onRemoveMed={deleteMed} colors={colors} isDark={isDark} active={active} allMembers={members} />
          </View>
        )}
      </Animated.View>

      {/* Dinner preview — same card/nav as the Parent Hub's "Tonight" slot
          instead of the Play Games tile [live-requested: "instead of
          playgames in the kids hub show the dinner card similar to the
          parent.. and navigate to dinner landing page"]. Opens the
          shared MealsScreen via setOpenMealsScreenRequested, same as
          ParentView — no role-gating on that path, works identically
          for kids. */}
      <Animated.View style={{ opacity: cardAnims[6].opacity, transform: [{ translateY: cardAnims[6].translateY }] }}>
        {/* TonightMealCard hardcodes marginHorizontal: 20 (Parent Hub's own
            card inset) — Kid Hub uses 16 everywhere else, so this wrapper
            pulls it back in by the 4px difference instead of editing the
            shared component (would change Parent's own rhythm) ["dinner
            card left and right paddins are too much to the frame"].
            marginTop stays off this wrapper — TonightMealCard already
            supplies its own. */}
        <View style={{ marginHorizontal: -4 }}>
          <TonightMealCard colors={colors} isDark={isDark} familyId={familyId} members={members} />
        </View>
      </Animated.View>

      <CantMakeItSheet
        target={declineQuest ? { kind: 'chore', item: declineQuest } : null}
        byMemberId={active.id} members={members}
        onClose={() => setDeclineQuest(null)}
      />
      {/* My Chores / Piggy Bank / Ask Parent now render via KidOverlays,
          mounted by HubScreen.tsx as a top-level sibling outside its own
          ScrollView — see onMyChores/onPiggyBank/onAskParentTile props. */}
    </>
  );
}
