import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useEventStore } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import type { ChoreTask } from '@/store/choreStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import type { FamilyMember } from '@/store/familyStore';
import { localToday, isWorkEvent, hoursUntilEvent } from './hubUtils';
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

export function SeniorView({ active, members, colors, isDark, onHelpRequest, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
  onEnRoute: () => void;
}) {
  const { events, updateEvent } = useEventStore();
  // Live, multi-day, cross-viewer-consistent feed for the "open to
  // helpers" dispatch lists below — see useUpcomingOpenEvents' header
  // comment for why the day-cached `events` above can't be reused for
  // these specifically (only ever showed "today", and claims by another
  // grandparent on a different day never disappeared live).
  const { events: upcomingEvents } = useUpcomingOpenEvents((active as any).familyId);
  const { awardCoins, updateMember } = useFamilyStore();
  const {
    chores, updateChore, grandparentMatches, grandparentApproveAndCheer, requestGrandparentRedo, createGrandparentQuest,
    addGrandparentMatch, claimGPErrand, submitGPErrandReceipt, cheerChore,
  } = useChoreStore();
  const { requests: kidRequests, assignRequest, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests } = useKidRequestStore();
  const gpWelcomeRequests = kidRequests.filter(r =>
    r.openToGP && r.status === 'approved' && !r.assignedHelper
  );
  // Partner chores flagged openToGP — GP can buy supplies + scan receipt
  const gpWelcomeChores = chores.filter(c =>
    (c as any).openToGP && (c.status === 'todo' || c.status === 'in_progress')
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
    if ((c.cheers ?? []).some(ch => ch.memberId === active.id)) return false;
    // A quest this GP sponsored (and already personally approved via
    // "Approve & Cheer") shouldn't also prompt them to cheer it again here —
    // that action already happened as part of reviewing it.
    if (c.categoryType === 'grandparent_quest' && c.sponsorUserId === active.id) return false;
    const when = c.approvedAt ?? c.reviewedAt ?? c.createdAt;
    return !!when && when.slice(0, 10) === today;
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

  const pendingGpApproval = chores.filter(c => c.status === 'pending_grandparent_approval' && c.sponsorUserId === active.id);
  const [cheerSticker, setCheerSticker] = useState('⭐');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchKidId, setMatchKidId] = useState('');
  const [matchType, setMatchType] = useState<'FIXED_PERCENTAGE' | 'FIXED_AMOUNT'>('FIXED_PERCENTAGE');
  const [matchValue, setMatchValue] = useState('10');
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
  // and fall within their configured availability window
  const openRides = upcomingEvents.filter(e =>
    e.isOpenToGrandparents &&
    e.helperStatus !== 'confirmed' &&
    !(e.grandparentPassedIds ?? []).includes(active.id) &&
    !cheerleaderMode &&
    !isPastEvent(e) &&
    withinDriveWindow(e)
  );

  // Rides this senior has already claimed (confirmed helper)
  const myClaimedRides = upcomingEvents.filter(e =>
    e.isOpenToGrandparents &&
    e.helper && (e.helper.includes(active.name) || active.name.includes(e.helper.split(' ')[0])) &&
    e.helperStatus === 'confirmed'
  );
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
    updateEvent(evId, { helper: active.name, helperStatus: 'confirmed' });
    const ev = events.find(e => e.id === evId);
    if (ev) addToDeviceCalendar(ev);
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
      maxMonthlyContribution: 500,
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

  const myDrivingToday = events.filter(e =>
    e.date === today && e.helper === active.name &&
    e.helperStatus === 'confirmed' && !isWorkEvent(e) && !isPastEvent(e)
  );
  // Assigned to me but I haven't replied yet — not Work events
  const myPendingAssignments = events.filter(e =>
    e.date === today && e.helper === active.name &&
    e.helperStatus === 'pending' && !e.approvalPending && !isWorkEvent(e) && !isPastEvent(e)
  );
  // Kid-initiated requests that need a volunteer (no helper yet, family approval pending) — not Work
  const openRequests = events.filter(e =>
    e.date === today && e.approvalPending && !e.helper && !isWorkEvent(e) && !isPastEvent(e)
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
    driveAlerts > 0
  ) && !cheerleaderMode;
  useEffect(() => { if (hasDispatchItems) setHelperDispatchExpanded(true); }, []);

  const dispatchBadgeCount = dedupOpenRides.length
    + gpInvitations.filter(c => !passedInvitations.includes(c.id)).length
    + driveAlerts;

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

      <MedicationsCard meds={meds} medsTaken={medsTaken} toggleMed={toggleMed} colors={colors} isDark={isDark} />

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
        cheerChore={cheerChore} awardCoins={awardCoins} active={active}
      />

      <SendBonusCard
        kids={kids} allNames={allNames} colors={colors} isDark={isDark}
        gpKid={gpKid} setGpKid={setGpKid}
        gpAmount={gpAmount} setGpAmount={setGpAmount}
        gpNote={gpNote} setGpNote={setGpNote}
        gpSent={gpSent}
        onSend={handleSendBonus}
      />

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
