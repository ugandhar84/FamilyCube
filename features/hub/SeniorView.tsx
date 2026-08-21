import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Gift, ChevronRight } from 'lucide-react-native';
import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useEventStore, isEventSensitive, canViewSensitiveEventDetail, eventAssignee } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import type { ChoreTask } from '@/store/choreStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { ParentReviewDeck } from '@/features/chores/ParentReviewDeck';
import type { FamilyMember } from '@/store/familyStore';
import { localToday, isWorkEvent, hoursUntilEvent } from './hubUtils';
import { withinLast24h } from '@/lib/dates';
import { useUpcomingOpenEvents } from './useUpcomingOpenEvents';

import { GroupBand } from './senior/seniorTheme';
import { EmergencySosCard } from './senior/EmergencySosCard';
import { YourRidesSection } from './senior/YourRidesSection';
import { MedicationsCard, type Medication } from './senior/MedicationsCard';
import { LendAHandCard } from './senior/LendAHandCard';
import { CheerSquadSection } from './senior/CheerSquadSection';
import { SendBonusCard } from './senior/SendBonusCard';
import { SponsorQuestsSection } from './senior/sponsor/SponsorQuestsSection';
import { SavingsMatchModal } from './senior/SavingsMatchModal';
import { CreateQuestModal } from './senior/CreateQuestModal';
import { MySponsoredQuestsSection } from './senior/MySponsoredQuestsSection';
import { ReceiptSubmissionModal } from './senior/ReceiptSubmissionModal';
import { FamilyMemoriesCard } from './senior/FamilyMemoriesCard';
import { PickupRadarStatus } from './hubComponents';

export function SeniorView({ active, members, colors, isDark, onHelpRequest, onEnRoute, activeTrip }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
  onEnRoute: () => void;
  // Family-wide Pick-up Radar state, synced from tripStore — read-only here.
  activeTrip?: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; etaMinutes: number; startedAtMs?: number } | null;
}) {
  const { events, updateEvent } = useEventStore();
  // Scenarios 9.2/9.3 — caregiver mode: if a parent has granted this GP
  // temporary approval access, isActiveApprover flips true and the review
  // deck below appears. loadFromStorage may not have run yet if SeniorView
  // mounts before ParentView ever has (GP opens the app directly) — hydrate
  // it here too, same reasoning as kidRequestStore's own defensive load.
  const { loaded: approverGrantsLoaded, loadFromStorage: loadApproverGrants, isActiveApprover, getActiveGrantFor } = useTemporaryApproverStore();
  useEffect(() => { if (!approverGrantsLoaded) loadApproverGrants(); }, [approverGrantsLoaded]);
  const hasCaregiverAccess = isActiveApprover(active.id);
  const caregiverGrant = getActiveGrantFor(active.id);
  // Live, multi-day, cross-viewer-consistent feed for the "open to
  // helpers" dispatch lists below — see useUpcomingOpenEvents' header
  // comment for why the day-cached `events` above can't be reused for
  // these specifically (only ever showed "today", and claims by another
  // grandparent on a different day never disappeared live).
  const { events: upcomingEvents } = useUpcomingOpenEvents((active as any).familyId);
  const { awardCoins, updateMember } = useFamilyStore();
  const {
    chores, updateChore, grandparentMatches, grandparentApproveAndCheer, requestGrandparentRedo, createGrandparentQuest,
    addGrandparentMatch, claimGPErrand, withdrawGPOffer, submitGPErrandReceipt, cheerChore,
  } = useChoreStore();
  const { requests: kidRequests, assignRequest, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests } = useKidRequestStore();
  const gpWelcomeRequests = kidRequests.filter(r =>
    r.openToGP && r.status === 'approved' && !r.assignedHelper
  );
  // Partner chores flagged openToGP — GP can buy supplies + scan receipt
  const gpWelcomeChores = chores.filter(c =>
    (c as any).openToGP && (c.status === 'todo' || c.status === 'in_progress')
  );
  // Scenario 1.6 — offers THIS GP made that are still waiting on a parent
  // to Accept/Decline (see claimGPErrand/PendingOffersSection).
  const myPendingOffers = chores.filter(c =>
    c.status === 'gp_offer_pending' && c.gpOfferById === active.id
  );

  const kids    = members.filter(m => m.role === 'kid');
  const allNames = members.map(m => m.name);
  const today   = localToday();

  // Cheer Squad — today's finished grandkid chores that still need a cheer from
  // me. Cheered ones drop off the list; the point of the section is the pending
  // action, not a history feed.
  const kidsCheerable = chores.filter(c => {
    if (!['approved', 'auto_approved', 'completed'].includes(c.status)) return false;
    if (!c.assignedToId || !kids.some(k => k.id === c.assignedToId)) return false;
    // The "already cheered" check right above already covers a quest this
    // GP approved themselves via "Approve & Cheer" (that action writes a
    // cheer), so it correctly drops off here without needing a separate
    // sponsor-based exclusion. A blanket "I sponsored it" exclusion was
    // wrong: a GP-sponsored quest a PARENT approved (not the GP's own
    // Approve & Cheer) never got an actual cheer, so it was being silently
    // hidden from the GP's cheer opportunity forever.
    if ((c.cheers ?? []).some(ch => ch.memberId === active.id)) return false;
    const when = c.approvedAt ?? c.reviewedAt ?? c.createdAt;
    return withinLast24h(when);
  });

  const [sosActive, setSosActive]   = useState(false);
  const [declineId,  setDeclineId]  = useState<string | null>(null);
  const [declineText, setDeclineText] = useState('');
  const [gpKid, setGpKid]           = useState<FamilyMember | null>(null);
  const [gpAmount, setGpAmount]   = useState<15 | 25 | 50>(25);
  const [gpNote, setGpNote]       = useState('');
  const [gpSent, setGpSent]       = useState(false);
  const [medsTaken, setMedsTaken] = useState<Record<string, boolean>>({});
  const [meds, setMeds] = useState<Medication[]>([]);
  const MEDS_KEY = `@familycube_meds_${active.id}`;
  const MEDS_TAKEN_KEY = `@familycube_meds_taken_${active.id}_${today}`;

  // SeniorView can render without ParentView ever having mounted this session,
  // so it must hydrate the kid request store itself (GP Welcome requests etc.)
  useEffect(() => {
    if (!kidRequestsLoaded) loadKidRequests();
  }, [kidRequestsLoaded]);

  useEffect(() => {
    AsyncStorage.multiGet([MEDS_KEY, MEDS_TAKEN_KEY]).then(([[, medsJson], [, takenJson]]) => {
      if (medsJson) setMeds(JSON.parse(medsJson));
      else setMeds([
        { id: 'med1', name: 'Blood pressure pill', time: '8:00 AM' },
        { id: 'med2', name: 'Vitamin D',           time: '8:00 AM' },
        { id: 'med3', name: 'Omega-3',             time: '12:00 PM' },
      ]);
      if (takenJson) setMedsTaken(JSON.parse(takenJson));
    });
  }, [active.id]);

  const toggleMed = useCallback(async (id: string) => {
    const next = (prev: Record<string, boolean>) => ({ ...prev, [id]: !prev[id] });
    setMedsTaken(prev => {
      const updated = next(prev);
      AsyncStorage.setItem(MEDS_TAKEN_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [MEDS_TAKEN_KEY]);

  const addMed = useCallback((name: string, time: string) => {
    setMeds(prev => {
      const updated = [...prev, { id: 'med' + Date.now(), name, time }];
      AsyncStorage.setItem(MEDS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [MEDS_KEY]);

  const removeMed = useCallback((id: string) => {
    setMeds(prev => {
      const updated = prev.filter(m => m.id !== id);
      AsyncStorage.setItem(MEDS_KEY, JSON.stringify(updated));
      return updated;
    });
    setMedsTaken(prev => {
      if (!(id in prev)) return prev;
      const { [id]: _removed, ...rest } = prev;
      AsyncStorage.setItem(MEDS_TAKEN_KEY, JSON.stringify(rest));
      return rest;
    });
  }, [MEDS_KEY, MEDS_TAKEN_KEY]);

  const pendingGpApproval = chores.filter(c => c.status === 'pending_grandparent_approval' && c.sponsorUserId === active.id);
  const [cheerSticker, setCheerSticker] = useState('⭐');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchKidId, setMatchKidId] = useState('');
  const [matchType, setMatchType] = useState<'FIXED_PERCENTAGE' | 'FIXED_AMOUNT'>('FIXED_PERCENTAGE');
  const [matchValue, setMatchValue] = useState('10');
  const [maxMonthly, setMaxMonthly] = useState('500');
  const [showCreateQuestModal, setShowCreateQuestModal] = useState(false);
  const [newQuestTitle,  setNewQuestTitle]  = useState('');
  const [newQuestDesc,   setNewQuestDesc]   = useState('');
  const [newQuestPoints, setNewQuestPoints] = useState('350');
  const [newQuestKidIds, setNewQuestKidIds] = useState<string[]>([]);
  const [newQuestMode,   setNewQuestMode]   = useState<'local' | 'virtual'>('local');
  const [newQuestPhoto,  setNewQuestPhoto]  = useState(true);
  // Set only while editing an already-sponsored quest that's still awaiting
  // parent review — a GP can freely revise anything up to that point since
  // the parent hasn't acted on it yet. Once a parent approves/declines it,
  // there's no edit path — that's the safety gate doing its job.
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);

  // My own sponsored quests still awaiting the parent's safety review —
  // previously invisible to the GP entirely between "I created it" and "a
  // parent acted on it."
  const myPendingSponsoredQuests = chores.filter(c =>
    c.categoryType === 'grandparent_quest' &&
    c.status === 'pending_parent_approval' &&
    c.sponsorUserId === active.id
  );

  const openEditSponsoredQuest = (c: ChoreTask) => {
    setEditingQuestId(c.id);
    setNewQuestTitle(c.title);
    setNewQuestDesc(c.description ?? '');
    setNewQuestPoints(String(c.basePoints || 350));
    setNewQuestKidIds(c.targetChildIds ?? []);
    setNewQuestMode(c.questMode ?? 'local');
    setNewQuestPhoto(c.requiresPhotoProof ?? true);
    setShowCreateQuestModal(true);
  };

  // ── Receipt submission modal ───────────────────────────────────────────────
  const [receiptChoreId,   setReceiptChoreId]   = useState<string | null>(null);
  const [receiptPhotoUri,  setReceiptPhotoUri]  = useState<string | null>(null);
  const [receiptAmountStr, setReceiptAmountStr] = useState('');
  const [receiptNote,      setReceiptNote]      = useState('');

  const openReceiptModal = (choreId: string) => {
    setReceiptChoreId(choreId);
    setReceiptPhotoUri(null);
    setReceiptAmountStr('');
    setReceiptNote('');
  };
  const closeReceiptModal = () => setReceiptChoreId(null);

  const pickReceiptFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to attach a receipt.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]) setReceiptPhotoUri(result.assets[0].uri);
  };

  const takeReceiptPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to scan a receipt.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]) setReceiptPhotoUri(result.assets[0].uri);
  };

  const handleSubmitReceipt = () => {
    if (!receiptChoreId) return;
    const amount = parseFloat(receiptAmountStr);
    submitGPErrandReceipt(receiptChoreId, {
      receiptPhotoUrl: receiptPhotoUri ?? undefined,
      receiptAmount:   isNaN(amount) ? undefined : amount,
      receiptNote:     receiptNote.trim() || undefined,
    });
    closeReceiptModal();
    Alert.alert('Receipt submitted!', 'Parents will see your receipt and reimburse you shortly. Thank you! 💙');
  };

  // GP-claimed errands currently in progress (inviteGrandparents tasks assigned to this GP)
  const myActiveErrands = chores.filter(c =>
    c.inviteGrandparents &&
    c.status === 'in_progress' &&
    c.assignedToId === active.id
  );

  // ── Helper Dispatch / Availability (persisted in FamilyMember) ──────────────
  const cheerleaderMode  = active.gpCheerleaderMode  ?? false;
  const driveWindowDays  = active.gpDriveWindowDays  ?? [2, 4];
  const driveWindowStart = active.gpDriveWindowStart ?? '14:00';
  const driveWindowEnd   = active.gpDriveWindowEnd   ?? '17:30';
  const weeklyRideCap    = active.gpWeeklyRideCap    ?? 2;

  const setCheerleaderMode  = (v: boolean | ((prev: boolean) => boolean)) =>
    updateMember(active.id, { gpCheerleaderMode: typeof v === 'function' ? v(cheerleaderMode) : v });
  const setDriveWindowDays  = (v: number[] | ((prev: number[]) => number[])) =>
    updateMember(active.id, { gpDriveWindowDays: typeof v === 'function' ? v(driveWindowDays) : v });
  const setDriveWindowStart = (v: string) => updateMember(active.id, { gpDriveWindowStart: v });
  const setDriveWindowEnd   = (v: string) => updateMember(active.id, { gpDriveWindowEnd: v });
  const setWeeklyRideCap    = (v: number) => updateMember(active.id, { gpWeeklyRideCap: v });
  const [availSettingsOpen, setAvailSettingsOpen] = useState(false);

  // Quests parents have flagged as open for grandparent to claim (Workflow 2)
  const gpInvitations = chores.filter(c =>
    c.inviteGrandparents && c.status === 'todo' && !c.sponsorUserId
  );
  const [passedInvitations, setPassedInvitations] = useState<string[]>([]);

  // Checks whether an event falls inside the GP's configured drive window
  const withinDriveWindow = useCallback((ev: typeof events[0]): boolean => {
    if (!ev.date) return true; // no date set — show it
    const evDayOfWeek = new Date(ev.date + 'T12:00').getDay();
    if (!driveWindowDays.includes(evDayOfWeek)) return false;
    if (!ev.time) return true; // no time — day matches, show it
    const [evH, evM] = ev.time.split(':').map(Number);
    const evMins = evH * 60 + evM;
    const [startH, startM] = driveWindowStart.split(':').map(Number);
    const [endH, endM]     = driveWindowEnd.split(':').map(Number);
    return evMins >= startH * 60 + startM && evMins <= endH * 60 + endM;
  }, [driveWindowDays, driveWindowStart, driveWindowEnd]);

  // A ride whose slot has already passed must not keep offering "I'll drive" /
  // "Pass" — dispatch is a to-do list, not a log.
  const isPastEvent = useCallback((e: { date?: string; time?: string }): boolean => {
    if (!e.date) return false;
    if (e.date < today) return true;
    if (e.date > today) return false;
    return e.time ? hoursUntilEvent(e.date, e.time) < 0 : false;
  }, [today]);

  // Events open to grandparents that this senior hasn't passed, hasn't claimed,
  // and fall within their configured availability window.
  //
  // Previously only excluded helperStatus==='confirmed' — a ride another
  // GP had already claimed but not yet confirmed (helper set, status
  // 'pending') still showed here as a live "I'll Drive" claimable, and a
  // 'rejected' ride (already excluded on the teen side, per M1) stayed
  // stuck advertised here too. Excluding !!e.helper entirely closes both
  // (QA Round 11, Critical Finding C1 / Medium M1).
  // QA sweep Critical Finding C3 — this was helper-only, so a
  // rideRequired:true request from KidRequestModal (which always writes
  // driverName/driverStatus, never helper/helperStatus) never showed up
  // here at all: a GP could not browse or claim a kid's ride request. Using
  // eventAssignee() covers both field pairs the same way myDrivingToday/
  // myPendingAssignments already do further down this file.
  const openRides = upcomingEvents.filter(e =>
    e.isOpenToGrandparents &&
    !eventAssignee(e).name &&
    !(e.grandparentPassedIds ?? []).includes(active.id) &&
    !cheerleaderMode &&
    !isPastEvent(e) &&
    withinDriveWindow(e)
  );

  // Rides this senior has already claimed (confirmed helper) — exact name
  // match. The previous fuzzy includes()-based match let two grandparents
  // sharing a first name/honorific ("Grandma Mary" / "Mary Johnson", or
  // both literally named the same first token) collide: each saw the
  // OTHER's claimed ride as their own, including a working "Can't Make It"
  // decline button on a ride that was never theirs (QA Round 9, High
  // Finding 4 — reproduced live, both directions matched true).
  const myClaimedRides = upcomingEvents.filter(e => {
    if (!e.isOpenToGrandparents) return false;
    const a = eventAssignee(e);
    return a.name === active.name && a.status === 'confirmed';
  });
  // Weekly cap counts everything claimed this week, past included; the list
  // shown in dispatch only carries what's still ahead.
  const upcomingClaimedRides = myClaimedRides.filter(e => !isPastEvent(e));

  // Weekly claim count (current calendar week)
  const weekStart = (() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10);
  })();
  const weekEnd = (() => {
    const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().slice(0, 10);
  })();
  const ridesThisWeek = myClaimedRides.filter(e => e.date >= weekStart && e.date <= weekEnd).length;
  const atWeeklyCap   = ridesThisWeek >= weeklyRideCap;
  const [helperDispatchExpanded, setHelperDispatchExpanded] = useState(false);

  // Adds the ride to the GP's device calendar (best-effort, silent on failure)
  const addToDeviceCalendar = useCallback(async (ev: typeof events[0]) => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') return;

      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      // Prefer a writable default; fall back to first writable calendar
      const target = cals.find(c => c.allowsModifications && c.isPrimary)
        ?? cals.find(c => c.allowsModifications);
      if (!target) return;

      const kid = members.find(m => m.id === ev.memberId);
      const [y, mo, d] = (ev.date ?? today).split('-').map(Number);
      const [h, mi]    = (ev.time ?? '12:00').split(':').map(Number);
      const start = new Date(y, mo - 1, d, h, mi);
      const end   = new Date(start.getTime() + 60 * 60 * 1000); // default 1-hr slot

      await Calendar.createEventAsync(target.id, {
        title:    `🚗 ${ev.title}${kid ? ` — ${kid.name.split(' ')[0]}` : ''}`,
        startDate: start,
        endDate:   end,
        notes:    [ev.notes, ev.pickupLocation && `From: ${ev.pickupLocation}`, ev.dropLocation && `To: ${ev.dropLocation}`].filter(Boolean).join('\n'),
        alarms:   [{ relativeOffset: -30 }],
      });
    } catch {
      // calendar sync is best-effort; never block the claim flow
    }
  }, [events, members, today]);

  const handleClaimRide = (evId: string) => {
    if (atWeeklyCap) {
      Alert.alert('Weekly cap reached', `You've set a limit of ${weeklyRideCap} rides/week. Update your availability settings to take more.`);
      return;
    }
    // Was a plain updateEvent() — two grandparents tapping "I'll Drive" on
    // the same ride within the same round-trip window meant whoever's
    // write landed last simply overwrote the other's, both devices showing
    // themselves as confirmed with no signal to the loser. claimHelperSlot
    // does the same conditional (only-if-still-unclaimed) DB write the
    // teen claim path already used — the teen side had this from the
    // start, the GP side never did (QA Round 11, Critical Finding C1).
    // QA sweep C3 — was hardcoded 'helper', so claiming a rideRequired:true
    // (non-Ride-category) request — the field pair every kid ride request
    // now uses — wrote to the wrong column pair entirely and never actually
    // claimed the slot the GP was looking at.
    const target = upcomingEvents.find(e => e.id === evId) ?? events.find(e => e.id === evId);
    const role: 'helper' | 'driver' = target?.rideRequired && target.category !== 'Ride' ? 'driver' : 'helper';
    useEventStore.getState().claimHelperSlot(evId, role, active.name, undefined, () => {
      const ev = events.find(e => e.id === evId);
      if (ev) addToDeviceCalendar(ev);
    }, (message) => {
      // The client-side atWeeklyCap check above is a fast local estimate
      // (only counts events already loaded into upcomingEvents) — the
      // server-side trigger is the real enforcement boundary and can still
      // reject a claim this check didn't catch (e.g. a ride confirmed on
      // another device in between). Surface it instead of the claim
      // silently rolling back with no explanation (QA sweep,
      // grandparent-role live-DB verification — the cap was previously
      // enforced client-side only).
      Alert.alert('Weekly cap reached', message);
    });
  };

  const handlePassRide = (evId: string) => {
    const ev = events.find(e => e.id === evId);
    if (!ev) return;
    updateEvent(evId, { grandparentPassedIds: [...(ev.grandparentPassedIds ?? []), active.id] });
  };

  const handleApproveAndCheer = (choreId: string) => {
    grandparentApproveAndCheer(choreId, active.id, cheerSticker);
  };

  const handleRequestGpRedo = (choreId: string, reason: string) => {
    requestGrandparentRedo(choreId, active.id, reason);
  };

  const handleSaveMatch = () => {
    if (!matchKidId) return;
    addGrandparentMatch({
      familyId:        (active as any).familyId ?? 'family-1',
      grandparentId:   active.id,
      childId:         matchKidId,
      matchType,
      matchValue:      parseFloat(matchValue) || 10,
      matchJar:        'SAVE',
      maxMonthlyContribution: parseFloat(maxMonthly) || 500,
      isActive:        true,
    });
    setShowMatchModal(false);
  };

  const handleCreateQuest = () => {
    if (!newQuestTitle.trim()) return;
    if (editingQuestId) {
      // Only reachable while the quest is still pending_parent_approval
      // (openEditSponsoredQuest only offers this for quests in that state) —
      // a parent hasn't acted on it yet, so the GP can freely revise it.
      updateChore(editingQuestId, {
        title:              newQuestTitle.trim(),
        description:        newQuestDesc.trim() || undefined,
        basePoints:         parseInt(newQuestPoints, 10) || 350,
        targetChildIds:     newQuestKidIds,
        questMode:          newQuestMode,
        requiresPhotoProof: newQuestPhoto,
      });
      setEditingQuestId(null);
    } else {
      createGrandparentQuest({
        title:         newQuestTitle.trim(),
        description:   newQuestDesc.trim() || undefined,
        basePoints:    parseInt(newQuestPoints, 10) || 350,
        // Store semantics (approveGrandparentQuestAsParent): 0 kids → bounty pool,
        // 1 kid → assigned directly, 2+ kids → team job. Picking 0 used to fan
        // out to every grandchild, silently turning a single-kid quest into an
        // unwanted team job — see the label above the picker for what each choice does.
        childIds:      newQuestKidIds,
        sponsorId:     active.id,
        mode:          newQuestMode,
        requiresPhoto: newQuestPhoto,
      });
    }
    setNewQuestTitle('');
    setNewQuestDesc('');
    setNewQuestPoints('350');
    setNewQuestKidIds([]);
    setNewQuestMode('local');
    setNewQuestPhoto(true);
    setShowCreateQuestModal(false);
  };

  // Both widened from `events` (today-only, single-day cache) to
  // `upcomingEvents` (multi-day live feed) — a GP asked to drive tomorrow
  // (or any day within the window) had literally no "please confirm"
  // surface until the morning of, since `events` never contained it and
  // myClaimedRides/openRides right above already correctly use
  // upcomingEvents for the exact same reason (QA Round 9, Medium Finding
  // 7 — verified live with a future-dated pending assignment invisible
  // under the old `date === today` + `events` combination).
  // Checks BOTH helper/helperStatus (category:'Ride') and
  // driverName/driverStatus (a rideRequired event on any other category)
  // via eventAssignee — previously only the former, so a GP asked to
  // drive a Sports/Study/Medical event's own ride need had no confirm
  // surface here at all (QA Round 11, Critical Finding C2).
  const myDrivingToday = upcomingEvents.filter(e => {
    const a = eventAssignee(e);
    return a.name === active.name && a.status === 'confirmed' && !isWorkEvent(e) && !isPastEvent(e);
  });
  // Assigned to me but I haven't replied yet — not Work events
  const myPendingAssignments = upcomingEvents.filter(e => {
    const a = eventAssignee(e);
    return a.name === active.name && a.status === 'pending' && !e.approvalPending && !isWorkEvent(e) && !isPastEvent(e);
  });
  // Spec 2.4: a kid/teen's still-pending request (approvalPending === true)
  // has not been reviewed by a parent yet — GP should not see it as an
  // actionable "family needs a hand" item at all, let alone be able to
  // claim/pass on it. This previously filtered FOR approvalPending, which
  // is backwards: it surfaced exactly the unapproved requests GP shouldn't
  // see, and "I'll Drive" on one of these called claimHelperSlot with
  // { approvalPending: false }, letting a grandparent silently clear a
  // parent's approval gate on a minor's social/logistics request. The
  // volunteerPool below (line ~421) already correctly excludes
  // approvalPending items — this brings openRequests in line with it.
  // Scenarios 2.6/5.5 — a sensitive/private/Medical event with no helper
  // assigned yet is hidden from GP's open-requests browsing entirely
  // (busy-block-only, not even offered as a claimable "needs a hand" item)
  // unless a parent explicitly shared it for this GP's care occasion.
  const openRequests = events.filter(e =>
    e.date === today && !e.approvalPending && !e.helper && !isWorkEvent(e) && !isPastEvent(e) &&
    // A claimable "needs a hand" opportunity is meaningless as a busy-block
    // stub (can't volunteer for a mystery slot) — this one stays a hard
    // exclude unless truly shared, unlike the Day/Week/Agenda calendar
    // views (CalendarScreen.tsx), which now correctly show a busy-block
    // placeholder for an already-scheduled event instead of hiding it.
    (!isEventSensitive(e) || canViewSensitiveEventDetail(e, 'senior', active.id, active.name) === 'full')
  );
  // Urgent pending: I still haven't replied and < 1 hr to go
  const urgentPending = myPendingAssignments.filter(e =>
    hoursUntilEvent(e.date, e.time) < 1 && hoursUntilEvent(e.date, e.time) >= 0
  );

  // GP volunteer pool: someone else is assigned (pending, not me) within 0–4 hrs
  // Exclude events where I'm already confirmed as driver within 30 min (would create a conflict)
  const myConfirmedTimes = myDrivingToday
    .filter(e => !!e.time)
    .map(e => { const [h, m] = e.time!.split(':').map(Number); return h * 60 + m; });

  const volunteerPool = events.filter(e => {
    if (!e.date || e.date !== today) return false;
    if (isWorkEvent(e)) return false;
    if (!e.helper || e.helperStatus !== 'pending') return false;
    if (e.helper === active.name) return false;      // already assigned to me
    if (e.approvalPending) return false;             // kid-initiated, parent hasn't approved
    // Scenarios 2.6/5.5 — same sensitive-event gate as openRequests above.
    if (isEventSensitive(e) && canViewSensitiveEventDetail(e, 'senior', active.id, active.name) !== 'full') return false;
    const hrs = hoursUntilEvent(e.date, e.time);
    if (hrs < 0 || hrs > 4) return false;            // only 0–4 hr window
    // Don't offer if I'd create a driver conflict with my confirmed drives
    if (e.time) {
      const [h, m] = e.time.split(':').map(Number);
      const evMin = h * 60 + m;
      if (myConfirmedTimes.some(ct => Math.abs(ct - evMin) < 30)) return false;
    }
    return true;
  });

  // Driving Duty was a separate section from Helper Dispatch but drew from the
  // same events, so the same ride could show twice under different framing.
  // Both are now one "Helper Dispatch" section — dedupe by event id, most
  // specific/urgent framing wins (today + personally-assigned first).
  const shownRideIds = new Set<string>();
  const dedupe = <T extends { id: string }>(list: T[]): T[] => {
    const out = list.filter(e => !shownRideIds.has(e.id));
    out.forEach(e => shownRideIds.add(e.id));
    return out;
  };
  const dedupMyPendingAssignments = dedupe(myPendingAssignments);
  const dedupMyDrivingToday       = dedupe(myDrivingToday);
  const dedupOpenRequests         = dedupe(openRequests);
  const dedupVolunteerPool        = dedupe(volunteerPool);
  const dedupOpenRides            = dedupe(openRides);
  const dedupMyClaimedRides       = dedupe(upcomingClaimedRides);

  // Rides already on GP's plate moved to the Today group, so Help Out counts
  // only what still needs a volunteer.
  const driveAlerts = dedupOpenRequests.length + dedupVolunteerPool.length
    + gpWelcomeRequests.length + gpWelcomeChores.length;

  // Expand Helper Dispatch on first load when there's anything actionable
  const hasDispatchItems = (
    dedupOpenRides.length > 0 ||
    gpInvitations.filter(c => !passedInvitations.includes(c.id)).length > 0 ||
    driveAlerts > 0 ||
    myPendingOffers.length > 0
  ) && !cheerleaderMode;
  useEffect(() => { if (hasDispatchItems) setHelperDispatchExpanded(true); }, []);

  const dispatchBadgeCount = dedupOpenRides.length
    + gpInvitations.filter(c => !passedInvitations.includes(c.id)).length
    + driveAlerts
    + myPendingOffers.length;

  const handleSendBonus = () => {
    if (!gpKid) return;
    awardCoins(gpKid.id, gpAmount, 'gpCoins');
    setGpSent(true);
    setTimeout(() => { setGpSent(false); setGpKid(null); setGpNote(''); }, 2500);
  };

  return (
    <>
      {/* ══ TODAY ══ */}
      <GroupBand label="Today" color={BRAND.teal} colors={colors} />

      <EmergencySosCard sosActive={sosActive} setSosActive={setSosActive} colors={colors} isDark={isDark} />

      {/* Scenarios 9.2/9.3 — visible ONLY while a parent-granted caregiver
          window is active; disappears the instant it expires or is
          revoked, same ParentReviewDeck a parent's own Hub uses (its
          Approve/Decline actions now route through choreStore.canApprove,
          which recognizes this grant). A small transparency indicator
          matches the spec's "kids see who's in charge this week" rule. */}
      {hasCaregiverAccess && (
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
            backgroundColor: isDark ? BRAND.purple + '18' : BRAND.purple + '10',
            borderRadius: 12, padding: 10, borderWidth: 1, borderColor: BRAND.purple + '30' }}>
            <Text style={{ fontSize: 16 }}>🔑</Text>
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: BRAND.purple }}>
              You're the temporary approver{caregiverGrant ? ` until ${new Date(caregiverGrant.expiresAt).toLocaleString()}` : ''} — you can approve/decline chore submissions below.
            </Text>
          </View>
          <ParentReviewDeck parent={active} members={members} colors={colors} isDark={isDark} />
        </View>
      )}

      {activeTrip && <PickupRadarStatus colors={colors} isDark={isDark} activeTrip={activeTrip} />}

      <YourRidesSection
        myPendingAssignments={dedupMyPendingAssignments}
        myDrivingToday={dedupMyDrivingToday}
        myClaimedRides={dedupMyClaimedRides}
        urgentPending={urgentPending}
        active={active} members={members} colors={colors} isDark={isDark}
        declineId={declineId} declineText={declineText}
        setDeclineId={setDeclineId} setDeclineText={setDeclineText}
        updateEvent={updateEvent} onEnRoute={onEnRoute}
      />

      <MedicationsCard meds={meds} medsTaken={medsTaken} toggleMed={toggleMed} onAddMed={addMed} onRemoveMed={removeMed} colors={colors} isDark={isDark} />

      {/* ══ HELP OUT ══ */}
      <GroupBand label="Help Out" color={BRAND.amber} colors={colors} />

      <LendAHandCard
        cheerleaderMode={cheerleaderMode} setCheerleaderMode={setCheerleaderMode}
        driveWindowDays={driveWindowDays} setDriveWindowDays={setDriveWindowDays}
        driveWindowStart={driveWindowStart} setDriveWindowStart={setDriveWindowStart}
        driveWindowEnd={driveWindowEnd} setDriveWindowEnd={setDriveWindowEnd}
        weeklyRideCap={weeklyRideCap} setWeeklyRideCap={setWeeklyRideCap}
        ridesThisWeek={ridesThisWeek} atWeeklyCap={atWeeklyCap}
        helperDispatchExpanded={helperDispatchExpanded} setHelperDispatchExpanded={setHelperDispatchExpanded}
        availSettingsOpen={availSettingsOpen} setAvailSettingsOpen={setAvailSettingsOpen}
        hasDispatchItems={hasDispatchItems} dispatchBadgeCount={dispatchBadgeCount}
        openRides={dedupOpenRides} gpInvitations={gpInvitations}
        passedInvitations={passedInvitations} setPassedInvitations={setPassedInvitations}
        myActiveErrands={myActiveErrands} onOpenReceiptModal={openReceiptModal}
        onMarkDoneNoReceipt={(choreId) => submitGPErrandReceipt(choreId, {})}
        myPendingOffers={myPendingOffers} onWithdrawOffer={(choreId) => withdrawGPOffer(choreId, active.id)}
        openRequests={dedupOpenRequests} gpWelcomeRequests={gpWelcomeRequests}
        gpWelcomeChores={gpWelcomeChores} volunteerPool={dedupVolunteerPool}
        active={active} members={members} allNames={allNames} colors={colors} isDark={isDark}
        updateEvent={updateEvent} updateChore={updateChore} assignRequest={assignRequest}
        claimGPErrand={claimGPErrand}
        onClaimRide={handleClaimRide} onPassRide={handlePassRide} onHelpRequest={onHelpRequest}
      />

      <MySponsoredQuestsSection
        quests={myPendingSponsoredQuests} colors={colors} isDark={isDark}
        onEdit={openEditSponsoredQuest}
      />

      {/* ══ MY GRANDKIDS ══ */}
      <GroupBand label="My Grandkids" color={BRAND.purple} colors={colors} />

      <CheerSquadSection
        kidsCheerable={kidsCheerable} kids={kids} allNames={allNames} colors={colors} isDark={isDark}
        cheerChore={cheerChore} active={active}
      />

      <SendBonusCard
        kids={kids} allNames={allNames} colors={colors} isDark={isDark}
        gpKid={gpKid} setGpKid={setGpKid}
        gpAmount={gpAmount} setGpAmount={setGpAmount}
        gpNote={gpNote} setGpNote={setGpNote}
        gpSent={gpSent}
        onSend={handleSendBonus}
      />

      {/* Perks — a senior's own Store redemption (canRedeemSelf, "My
          Redemptions" — built this session) had no reachable path at all:
          seniors get Memories instead of Apps in their 5th tab slot
          (deliberate simplification), and Store's own Vault-tile entry
          point is parent/kid-only. Rather than restructure the tab bar,
          this is the same pattern every other senior feature already uses
          — a Hub card that opens the screen directly (QA sweep,
          grandparent-role audit, Critical C2). */}
      <Pressable onPress={() => router.push('/(tabs)/store' as any)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: isDark ? colors.card : '#fff', borderRadius: 16,
          borderWidth: 1, borderColor: colors.border, padding: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#7C3AED20',
          alignItems: 'center', justifyContent: 'center' }}>
          <Gift size={20} color="#7C3AED" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>Perks</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
            {(active as any).gpCoins ?? 0} 🪙 · redeem a reward
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textTertiary} />
      </Pressable>

      <SponsorQuestsSection
        active={active} kids={kids} members={members} allNames={allNames} colors={colors} isDark={isDark}
        chores={chores} grandparentMatches={grandparentMatches} pendingGpApproval={pendingGpApproval}
        cheerSticker={cheerSticker} setCheerSticker={setCheerSticker}
        updateChore={updateChore} updateMember={updateMember} handleApproveAndCheer={handleApproveAndCheer}
        handleRequestGpRedo={handleRequestGpRedo}
        onOpenMatchModal={() => setShowMatchModal(true)}
        onOpenCreateQuestModal={() => setShowCreateQuestModal(true)}
      />

      <SavingsMatchModal
        visible={showMatchModal} onClose={() => setShowMatchModal(false)}
        kids={kids} colors={colors} isDark={isDark}
        matchKidId={matchKidId} setMatchKidId={setMatchKidId}
        matchType={matchType} setMatchType={setMatchType}
        matchValue={matchValue} setMatchValue={setMatchValue}
        maxMonthly={maxMonthly} setMaxMonthly={setMaxMonthly}
        onSave={handleSaveMatch}
      />

      <CreateQuestModal
        visible={showCreateQuestModal} onClose={() => { setShowCreateQuestModal(false); setEditingQuestId(null); }}
        editing={!!editingQuestId}
        kids={kids} colors={colors} isDark={isDark}
        newQuestMode={newQuestMode} setNewQuestMode={setNewQuestMode}
        newQuestTitle={newQuestTitle} setNewQuestTitle={setNewQuestTitle}
        newQuestDesc={newQuestDesc} setNewQuestDesc={setNewQuestDesc}
        newQuestPoints={newQuestPoints} setNewQuestPoints={setNewQuestPoints}
        newQuestKidIds={newQuestKidIds} setNewQuestKidIds={setNewQuestKidIds}
        newQuestPhoto={newQuestPhoto} setNewQuestPhoto={setNewQuestPhoto}
        onCreate={handleCreateQuest}
      />

      <ReceiptSubmissionModal
        visible={!!receiptChoreId} onClose={closeReceiptModal}
        colors={colors} isDark={isDark}
        receiptPhotoUri={receiptPhotoUri} setReceiptPhotoUri={setReceiptPhotoUri}
        receiptAmountStr={receiptAmountStr} setReceiptAmountStr={setReceiptAmountStr}
        receiptNote={receiptNote} setReceiptNote={setReceiptNote}
        onTakePhoto={takeReceiptPhoto} onPickFromGallery={pickReceiptFromGallery}
        onSubmit={handleSubmitReceipt}
      />

      {/* ══ MEMORIES ══ */}
      <GroupBand label="Memories" color={BRAND.pink} colors={colors} />

      <FamilyMemoriesCard colors={colors} isDark={isDark} />
    </>
  );
}
