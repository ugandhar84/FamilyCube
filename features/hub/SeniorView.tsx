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
import { useQuestStore } from '@/store/choreAdapter';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';
import { ParentReviewDeck } from '@/features/chores/ParentReviewDeck';
import type { FamilyMember } from '@/store/familyStore';
import { localToday, isWorkEvent, hoursUntilEvent, useCountdown } from './hubUtils';
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
import { SectionCard, PickupRadarStatus } from './hubComponents';
import { KidRideBanner } from './kid/KidRideBanner';
import { DirectPendingCard } from './parent/backlog/DirectPendingCard';
import { OutgoingPendingCard } from './parent/backlog/OutgoingPendingCard';
import { LockedAssignmentCard } from './parent/backlog/LockedAssignmentCard';
import { PushbackSheet } from './parent/PushbackSheet';
import { DelegateSheet } from './parent/DelegateSheet';
import { UserCheck } from 'lucide-react-native';
import SmartTaskComposer from '../tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';

export function SeniorView({ active, members, colors, isDark, onHelpRequest, onEnRoute, activeTrips, familyId, composerVisible, onCloseComposer }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
  onEnRoute: () => void;
  // Family-wide Pick-up Radar state, synced from tripStore — read-only
  // here. Every concurrently active trip is shown, not just one.
  activeTrips?: { tripId: string; kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; pickupMemberId?: string; etaMinutes: number; startedAtMs?: number }[];
  familyId?: string;
  // The Hub-level FAB (HubScreen.tsx) opens the full SmartTaskComposer,
  // unrestricted, same as Teen/Parent — additive alongside the existing
  // separate inline "Sponsor Chore" flow (newQuestTitle/CreateQuestModal
  // below), which is untouched. Floats outside HubScreen's own ScrollView
  // (SeniorView itself is scrolled content, not a positioned ancestor), so
  // only the visibility flag is shared down here.
  composerVisible: boolean;
  onCloseComposer: () => void;
}) {
  const { events, updateEvent } = useEventStore();
  const sendMessage = useChatStore(s => s.sendMessage);
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
    // A grandparent can be directly assigned a parent_only_quest by a
    // parent (or hand one off themselves) via addParentQuest's adult-to-
    // adult delegation — ADULT_ROLES includes 'senior' there — but this
    // Hub had zero rendering path for the resulting pending Accept/Respond
    // card. QuestsScreen.tsx used to have the same gap (fixed alongside
    // this) since its selectors were hard-gated to isParent. Reusing the
    // exact same cards/selectors ParentView's Household Backlog uses keeps
    // this in sync with any future change to the snooze/bounce rules.
    getMyDirectPending, getMyLockedItems, getMyOutgoingPending,
    respondToParentQuest, cancelLockedAssignment, recallParentQuest, addParentQuest,
  } = useChoreStore();
  const { updateQuest } = useQuestStore();
  const [pushbackSheet, setPushbackSheet] = useState<{ assignmentId: string; choreTitle: string; assignedBy: string; assignedTo: string } | null>(null);
  const [delegateSheet, setDelegateSheet] = useState<{ choreId: string; choreTitle: string } | null>(null);
  const myDirectPending   = getMyDirectPending(active.id);
  const myLockedItems     = getMyLockedItems(active.id);
  const myOutgoingPending = getMyOutgoingPending(active.id);
  // Detailed per-action trail — who tapped what, on which chore/event, and
  // what store call it triggered — pairs with choreStore's own
  // "[choreStore] → DB update/insert" lines so a full action is traceable
  // end to end from one console. Grep "[UserAction]".
  const logAction = (action: string, storeCall: string, opts?: { targetTitle?: string; targetId?: string; at?: string }) => {
    console.log(`[UserAction] screen=Hub role=senior member=${active.name} tapped "${action}"${opts?.targetTitle ? ` on "${opts.targetTitle}"` : ''}${opts?.targetId ? ` (id=${opts.targetId})` : ''} → ${storeCall}${opts?.at ? ` [features/hub/SeniorView.tsx:${opts.at}]` : ''}`);
  };
  const { requests: kidRequests, assignRequest, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests } = useKidRequestStore();
  const gpWelcomeRequests = kidRequests.filter(r =>
    r.openToGP && r.status === 'approved' && !r.assignedHelper
  );
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=gpWelcomeRequests totalSource=${kidRequests.length} afterFilter=${gpWelcomeRequests.length}`);
  // Partner chores flagged openToGP — GP can buy supplies + scan receipt.
  // Bug (found via live-DB testing): 'in_progress' alone doesn't mean
  // still-open — it's also the status a chore lands in the MOMENT another
  // GP claims it (claimGPErrand's real work-in-progress state after
  // gp_offer_pending is accepted). Every uninvolved GP's Hub kept showing
  // that already-claimed chore as a live "I'd Love To Help" invitation
  // (QuestInvitationsSection has no claimed-by check of its own) — tapping
  // it silently no-ops (claimGPErrand's own status==='todo' guard blocks
  // it), but the stale card stayed there looking actionable regardless.
  // 'todo' with no assignee is the only genuinely-still-open state.
  // updateChore now writes inviteGrandparents whenever openToGP is set (see
  // its own comment on that mirroring) — the two flags are effectively the
  // same "open to grandparents" state on one chore. Without excluding
  // inviteGrandparents here, a chore toggled via "GP Welcome" (PoolQuestCard/
  // OthersAdultQuestCard) rendered in BOTH this "family could use a hand"
  // list AND QuestInvitationsSection's gpInvitations list below — the same
  // chore showing as two separate cards in this Hub. QuestInvitationsSection
  // is the fuller UI (Accept + Pass), so it wins; this list only picks up
  // the (now effectively unreachable, but safe to keep as a guard) case of
  // openToGP without inviteGrandparents.
  const gpWelcomeChores = chores.filter(c =>
    (c as any).openToGP && !c.inviteGrandparents && c.status === 'todo' && !c.assignedToId
  );
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=gpWelcomeChores totalSource=${chores.length} afterFilter=${gpWelcomeChores.length}`);
  // Scenario 1.6 — offers THIS GP made that are still waiting on a parent
  // to Accept/Decline (see claimGPErrand/PendingOffersSection).
  const myPendingOffers = chores.filter(c =>
    c.status === 'gp_offer_pending' && c.gpOfferById === active.id
  );
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=myPendingOffers totalSource=${chores.length} afterFilter=${myPendingOffers.length}`);

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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=kidsCheerable totalSource=${chores.length} afterFilter=${kidsCheerable.length} [features/hub/SeniorView.tsx:132]`);

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
    logAction('Toggle Medication', 'AsyncStorage.setItem(medsTaken) [local only, no DB write]', { targetId: id, at: '177' });
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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=pendingGpApproval totalSource=${chores.length} afterFilter=${pendingGpApproval.length} [features/hub/SeniorView.tsx:210]`);
  const [cheerSticker, setCheerSticker] = useState('⭐');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchKidId, setMatchKidId] = useState('');
  const [matchType, setMatchType] = useState<'FIXED_PERCENTAGE' | 'FIXED_AMOUNT'>('FIXED_PERCENTAGE');
  const [matchValue, setMatchValue] = useState('10');
  const [maxMonthly, setMaxMonthly] = useState('500');
  // Hub-level FAB's SmartTaskComposer full-form handoff — same shape
  // TasksScreen.tsx wires for Parent. Distinct from the Sponsor Chore
  // flow below (showCreateQuestModal/newQuestTitle etc.), which is a
  // separate, untouched GP-sponsorship concept.
  const [manualQuestPrefill, setManualQuestPrefill] = useState<{
    title?: string; coins?: number; assignedToId?: string; photoRequired?: boolean; dueDate?: string;
  } | undefined>(undefined);
  const [manualEventPrefill, setManualEventPrefill] = useState<{
    title?: string; category?: string; memberId?: string; startAt?: string; notes?: string;
  } | undefined>(undefined);
  const [showManualQuest, setShowManualQuest] = useState(false);
  const [showManualEvent, setShowManualEvent] = useState(false);
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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=myPendingSponsoredQuests totalSource=${chores.length} afterFilter=${myPendingSponsoredQuests.length} [features/hub/SeniorView.tsx:234]`);

  // Coordinated live-DB QA (launch-readiness round) found a sponsored quest
  // vanished from the GP's own Hub the instant a parent approved it — the
  // GP's Quests tab (sponsorUserId scope, no status filter) kept tracking
  // it through every stage, but Hub only ever showed the pre-approval
  // "Awaiting Parent Review" list. A GP watching only Hub had no way to
  // know her grandkid ever accepted, worked on, or finished a quest she
  // sponsored. Mirrors the same sponsorUserId scope, just for the
  // post-approval, not-yet-resolved statuses.
  const mySponsoredQuestsInProgress = chores.filter(c =>
    c.categoryType === 'grandparent_quest' &&
    c.sponsorUserId === active.id &&
    ['todo', 'in_progress', 'pending_approval', 'redo_requested'].includes(c.status)
  );
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=mySponsoredQuestsInProgress totalSource=${chores.length} afterFilter=${mySponsoredQuestsInProgress.length} [features/hub/SeniorView.tsx:248]`);

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
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);

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

  const handleSubmitReceipt = async () => {
    if (!receiptChoreId) return;
    logAction('Submit Receipt', `submitGPErrandReceipt(${receiptChoreId})`, { targetId: receiptChoreId, at: '290' });

    // Same local-URI-only bug as QuestsScreen's proof photos — the image
    // picker only returns a device-local file, which never resolves once a
    // parent opens the receipt on a different device. Upload it first.
    let receiptPhotoUrl: string | undefined;
    if (receiptPhotoUri) {
      setIsSubmittingReceipt(true);
      try {
        const familyId = (active as any).familyId;
        const path = `chore-proofs/${familyId ?? 'unknown'}/receipt-${receiptChoreId}-${Date.now()}.jpg`;
        const blob = await (await fetch(receiptPhotoUri)).blob();
        const { error: upErr } = await supabase.storage.from('family-media').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('family-media').getPublicUrl(path);
        receiptPhotoUrl = urlData.publicUrl;
      } catch (e) {
        console.warn('[SeniorView] receipt photo upload failed', e);
        setIsSubmittingReceipt(false);
        Alert.alert('Upload failed', "Couldn't upload the receipt photo — check your connection and try again.");
        return;
      }
      setIsSubmittingReceipt(false);
    }

    const amount = parseFloat(receiptAmountStr);
    submitGPErrandReceipt(receiptChoreId, {
      receiptPhotoUrl,
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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=myActiveErrands totalSource=${chores.length} afterFilter=${myActiveErrands.length} [features/hub/SeniorView.tsx:303]`);

  // Coordinated live-DB QA (GP receipt round) found this GP's own Hub
  // dropped an errand entirely the moment she submitted its receipt — no
  // section anywhere covered pending_approval for a plain inviteGrandparents
  // errand, so she had zero in-app confirmation the receipt was received or
  // later reimbursed, despite both parents seeing it correctly on their own
  // review deck the whole time. Tracks the same errand through submission
  // and reimbursement, distinct from myActiveErrands' still-shopping state.
  const myErrandsAwaitingReview = chores.filter(c =>
    c.inviteGrandparents &&
    c.status === 'pending_approval' &&
    c.assignedToId === active.id &&
    (!!c.receiptPhotoUrl || c.receiptAmount != null || !!c.receiptNote)
  );
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=myErrandsAwaitingReview totalSource=${chores.length} afterFilter=${myErrandsAwaitingReview.length} [features/hub/SeniorView.tsx:323]`);

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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=gpInvitations totalSource=${chores.length} afterFilter=${gpInvitations.length} [features/hub/SeniorView.tsx:347]`);

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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=openRides totalSource=${upcomingEvents.length} afterFilter=${openRides.length} [features/hub/SeniorView.tsx:391]`);

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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=myClaimedRides totalSource=${upcomingEvents.length} afterFilter=${myClaimedRides.length} [features/hub/SeniorView.tsx:407]`);
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
    logAction("I'll Drive", `claimHelperSlot(${evId})`, { targetId: evId, at: '450' });
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
    logAction('Pass (ride)', `updateEvent(${evId}, {grandparentPassedIds})`, { targetId: evId, at: '484' });
    const ev = events.find(e => e.id === evId);
    if (!ev) return;
    updateEvent(evId, { grandparentPassedIds: [...(ev.grandparentPassedIds ?? []), active.id] });
  };

  const handleApproveAndCheer = (choreId: string) => {
    logAction('Approve & Cheer', `grandparentApproveAndCheer(${choreId})`, { targetId: choreId, at: '490' });
    grandparentApproveAndCheer(choreId, active.id, cheerSticker);
  };

  const handleRequestGpRedo = (choreId: string, reason: string) => {
    logAction('Request Redo', `requestGrandparentRedo(${choreId})`, { targetId: choreId, at: '494' });
    requestGrandparentRedo(choreId, active.id, reason);
  };

  const handleSaveMatch = () => {
    if (!matchKidId) return;
    logAction('Save Savings Match', `addGrandparentMatch(childId=${matchKidId})`, { at: '498' });
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
      logAction('Save Sponsored Quest (edit)', `updateChore(${editingQuestId})`, { targetId: editingQuestId, targetTitle: newQuestTitle.trim(), at: '518' });
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
      logAction('Create Sponsored Quest', `createGrandparentQuest(title=${newQuestTitle.trim()})`, { targetTitle: newQuestTitle.trim(), at: '518' });
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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=myDrivingToday totalSource=${upcomingEvents.length} afterFilter=${myDrivingToday.length} [features/hub/SeniorView.tsx:581]`);
  // Assigned to me but I haven't replied yet — not Work events
  const myPendingAssignments = upcomingEvents.filter(e => {
    const a = eventAssignee(e);
    return a.name === active.name && a.status === 'pending' && !e.approvalPending && !isWorkEvent(e) && !isPastEvent(e);
  });
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=myPendingAssignments totalSource=${upcomingEvents.length} afterFilter=${myPendingAssignments.length} [features/hub/SeniorView.tsx:586]`);
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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=openRequests totalSource=${events.length} afterFilter=${openRequests.length} [features/hub/SeniorView.tsx:606]`);
  // Confirmed ride where THIS grandparent is being picked up (the ride's
  // subject/rider — e.g. a parent or another family member driving them
  // somewhere), not one they're driving. Scoped to memberId/memberIds so
  // it never matches myDrivingToday/myPendingAssignments above, which are
  // matched on driver name instead. Same pattern as KidView/TeenView.
  const [dismissedRideIds, setDismissedRideIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(`dismissed_rides_${active.id}`).then(val => {
      if (val) setDismissedRideIds(new Set(JSON.parse(val)));
    });
  }, [active.id]);
  useEffect(() => {
    AsyncStorage.setItem(`dismissed_rides_${active.id}`, JSON.stringify([...dismissedRideIds]));
  }, [dismissedRideIds, active.id]);

  const confirmedRide = upcomingEvents.find(e => {
    if (e.date < today) return false;
    if (!(e.memberId === active.id || e.memberIds?.includes(active.id))) return false;
    const a = eventAssignee(e);
    return a.name && a.status === 'confirmed';
  });
  const rideCountdown = useCountdown(confirmedRide?.date, confirmedRide?.time);

  // Either side (rider or driver) can confirm a pickup actually happened —
  // mirrors KidView's confirmPickup exactly, scoped to this GP as rider.
  const confirmPickup = (ev: typeof events[0]) => {
    if (ev.pickupConfirmedAt) return;
    logAction('Confirm Pickup', `updateEvent(${ev.id}, {pickupConfirmedAt})`, { targetId: ev.id, targetTitle: ev.title, at: '630' });
    updateEvent(ev.id, { pickupConfirmedAt: new Date().toISOString(), pickupConfirmedBy: active.id });
    sendMessage('all', active.id, `✅ ${active.name.split(' ')[0]} confirmed pickup for "${ev.title}" — all good!`);
  };

  // Urgent pending: I still haven't replied and < 1 hr to go
  const urgentPending = myPendingAssignments.filter(e =>
    hoursUntilEvent(e.date, e.time) < 1 && hoursUntilEvent(e.date, e.time) >= 0
  );
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=urgentPending totalSource=${myPendingAssignments.length} afterFilter=${urgentPending.length} [features/hub/SeniorView.tsx:637]`);

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
  console.log(`[UserAction] FILTER screen=Hub role=senior member=${active.name} list=volunteerPool totalSource=${events.length} afterFilter=${volunteerPool.length} [features/hub/SeniorView.tsx:660]`);

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

  // Expand Helper Dispatch on first load when there's anything actionable.
  // myActiveErrands/myErrandsAwaitingReview weren't counted here — same
  // "has real content but defaults to collapsed" gap fixed elsewhere this
  // session (Household Backlog, Chore Reviews, My Chores).
  const hasDispatchItems = (
    dedupOpenRides.length > 0 ||
    gpInvitations.filter(c => !(c.gpWithdrawnIds ?? []).includes(active.id)).length > 0 ||
    driveAlerts > 0 ||
    myPendingOffers.length > 0 ||
    myActiveErrands.length > 0 ||
    myErrandsAwaitingReview.length > 0
  ) && !cheerleaderMode;
  // Bug (live-repro'd): empty deps meant this only ever checked
  // hasDispatchItems ONCE, at the exact moment of first mount — but chores
  // load asynchronously from choreStore, so on a fresh reload this effect
  // frequently fired before any chores had arrived, saw hasDispatchItems
  // as false, and never ran again (empty deps array). The badge count
  // above recomputes reactively as chores load in, so it correctly showed
  // "1" moments later — but helperDispatchExpanded was already
  // permanently stuck false, hiding the actual invitation card behind a
  // badge that said something was there. Re-run whenever hasDispatchItems
  // actually changes, and only ever auto-expand (never auto-collapse
  // something the GP deliberately closed).
  useEffect(() => { if (hasDispatchItems) setHelperDispatchExpanded(true); }, [hasDispatchItems]);

  const dispatchBadgeCount = dedupOpenRides.length
    + gpInvitations.filter(c => !(c.gpWithdrawnIds ?? []).includes(active.id)).length
    + driveAlerts
    + myPendingOffers.length
    + myActiveErrands.length
    + myErrandsAwaitingReview.length;

  const handleSendBonus = () => {
    if (!gpKid) return;
    logAction('Send Bonus', `awardCoins(${gpKid.id}, ${gpAmount}, gpCoins)`, { targetId: gpKid.id, targetTitle: gpKid.name, at: '719' });
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

      {confirmedRide && rideCountdown !== null && rideCountdown > -30 && !dismissedRideIds.has(confirmedRide.id) && (
        <KidRideBanner
          ev={confirmedRide} rideCountdown={rideCountdown} colors={colors} isDark={isDark}
          active={active}
          onConfirmPickup={confirmPickup}
          onDismiss={(id) => setDismissedRideIds(prev => new Set([...prev, id]))}
        />
      )}

      {/* Bug (reported live): a GP saw every family trip, including rides
          they had zero involvement in — HubScreen passes the full
          family-wide tripViews list to every non-parent view, which is
          correct for kids/teens (the ride is often about/for them) but
          not for a grandparent watching an unrelated parent's pickup. A
          GP only needs to see a trip where they're actually the driver or
          the one being picked up. */}
      {activeTrips?.filter(trip => trip.driverMemberId === active.id || trip.pickupMemberId === active.id).map(trip => (
        <PickupRadarStatus key={trip.tripId} colors={colors} isDark={isDark} activeTrip={trip} />
      ))}

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

      <MedicationsCard meds={meds} medsTaken={medsTaken} toggleMed={toggleMed} onAddMed={addMed} onRemoveMed={removeMed} colors={colors} isDark={isDark} active={active} />

      {/* A parent (or this GP themselves) directly assigned a task via
          addParentQuest — same Accept/Respond, Nudge-back, and locked-item
          cards a parent's Household Backlog shows, since this is the exact
          same underlying System-A flow, just previously unreachable from
          the senior Hub. */}
      {(myDirectPending.length > 0 || myOutgoingPending.length > 0 || myLockedItems.length > 0) && (
        <SectionCard
          icon={<UserCheck size={16} color={colors.primary} />}
          title="Assigned To You"
          badge={myDirectPending.length + myOutgoingPending.length + myLockedItems.length}
          colors={colors} isDark={isDark}
        >
          {myDirectPending.map(a => {
            const chore = chores.find(c => c.id === a.choreId);
            if (!chore) return null;
            return (
              <DirectPendingCard key={a.id} a={a} chore={chore} members={members} colors={colors} isDark={isDark}
                respondToParentQuest={respondToParentQuest}
                onRespond={(assignmentId, choreTitle, assignedBy, assignedTo) => setPushbackSheet({ assignmentId, choreTitle, assignedBy, assignedTo })} />
            );
          })}
          {myOutgoingPending.map(a => {
            const chore = chores.find(c => c.id === a.choreId);
            if (!chore) return null;
            return (
              <OutgoingPendingCard key={a.id} a={a} chore={chore} members={members} active={active} colors={colors} isDark={isDark}
                onRecall={a.status === 'PENDING' ? () => { logAction('Recall', `recallParentQuest(${a.id})`, { targetId: a.choreId, targetTitle: chore.title, at: '828' }); recallParentQuest(a.id, active.id); } : undefined} />
            );
          })}
          {myLockedItems.map(a => {
            const chore = chores.find(c => c.id === a.choreId);
            if (!chore) return null;
            return (
              <LockedAssignmentCard key={a.id} a={a} chore={chore} active={active} members={members}
                colors={colors} isDark={isDark}
                onDelegate={(choreId, choreTitle) => setDelegateSheet({ choreId, choreTitle })}
                cancelLockedAssignment={(assignmentId) => { logAction('Cancel Locked Assignment', `cancelLockedAssignment(${assignmentId})`, { targetId: chore.id, targetTitle: chore.title, at: '838' }); cancelLockedAssignment(assignmentId); }} />
            );
          })}
        </SectionCard>
      )}

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
        myActiveErrands={myActiveErrands} onOpenReceiptModal={openReceiptModal}
        onMarkDoneNoReceipt={(choreId) => { logAction('Mark Done (no receipt)', `submitGPErrandReceipt(${choreId}, {})`, { targetId: choreId, at: '860' }); submitGPErrandReceipt(choreId, {}); }}
        onBackoutErrand={(choreId) => { logAction('Backout', `backoutGpWelcomeChore(${choreId})`, { targetId: choreId, at: '869' }); useChoreStore.getState().backoutGpWelcomeChore(choreId, active.id); }}
        myErrandsAwaitingReview={myErrandsAwaitingReview}
        myPendingOffers={myPendingOffers} onWithdrawOffer={(choreId) => { logAction('Withdraw Offer', `withdrawGPOffer(${choreId})`, { targetId: choreId, at: '862' }); withdrawGPOffer(choreId, active.id); }}
        openRequests={dedupOpenRequests} gpWelcomeRequests={gpWelcomeRequests}
        gpWelcomeChores={gpWelcomeChores} volunteerPool={dedupVolunteerPool}
        active={active} members={members} allNames={allNames} colors={colors} isDark={isDark}
        updateEvent={updateEvent} updateChore={updateChore}
        assignRequest={(id, helperId) => { logAction('Assign Request (accept)', `assignRequest(${id}, ${helperId})`, { targetId: id, at: '866' }); assignRequest(id, helperId); }}
        claimGPErrand={(choreId, gpMemberId) => { logAction('Claim GP Errand', `claimGPErrand(${choreId}, ${gpMemberId})`, { targetId: choreId, at: '867' }); claimGPErrand(choreId, gpMemberId); }}
        onClaimRide={handleClaimRide} onPassRide={handlePassRide} onHelpRequest={onHelpRequest}
      />

      <MySponsoredQuestsSection
        quests={myPendingSponsoredQuests} inProgressQuests={mySponsoredQuestsInProgress}
        colors={colors} isDark={isDark}
        onEdit={openEditSponsoredQuest}
        active={active}
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
        active={active}
      />

      {/* Perks — a senior's own Store redemption (canRedeemSelf, "My
          Redemptions" — built this session) had no reachable path at all:
          seniors get Memories instead of Apps in their 5th tab slot
          (deliberate simplification), and Store's own Vault-tile entry
          point is parent/kid-only. Rather than restructure the tab bar,
          this is the same pattern every other senior feature already uses
          — a Hub card that opens the screen directly (QA sweep,
          grandparent-role audit, Critical C2). */}
      <Pressable onPress={() => { logAction('Perks (navigate to Store)', "router.push('/(tabs)/store') [navigation only, no DB write]", { at: '903' }); router.push('/(tabs)/store' as any); }}
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
        active={active}
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
        isSubmitting={isSubmittingReceipt}
        active={active}
      />

      <PushbackSheet
        target={pushbackSheet} colors={colors} isDark={isDark}
        onClose={() => setPushbackSheet(null)}
        respondToParentQuest={respondToParentQuest}
      />

      {/* questPool intentionally empty here — a locked assignment being
          re-delegated is always a real chore_tasks row (never a
          quest-pool _isQuestRow), so DelegateSheet's addParentQuest
          branch is the only one this ever exercises from SeniorView. */}
      <DelegateSheet
        target={delegateSheet} questPool={[]} members={members} active={active} colors={colors} isDark={isDark}
        onClose={() => setDelegateSheet(null)}
        updateQuest={updateQuest}
        addParentQuest={addParentQuest}
      />

      {/* ══ MEMORIES ══ */}
      <GroupBand label="Memories" color={BRAND.pink} colors={colors} />

      <FamilyMemoriesCard colors={colors} isDark={isDark} />

      <SmartTaskComposer
        visible={composerVisible}
        members={members}
        activeMemberId={active.id}
        familyId={familyId ?? ''}
        onClose={onCloseComposer}
        onCreated={onCloseComposer}
        onOpenFullForm={(kind, prefill) => {
          onCloseComposer();
          if (kind === 'quest') {
            setManualQuestPrefill(prefill as typeof manualQuestPrefill);
            setShowManualQuest(true);
          } else {
            setManualEventPrefill(prefill as typeof manualEventPrefill);
            setShowManualEvent(true);
          }
        }}
      />

      {showManualQuest && (
        <AddQuestModal
          visible={showManualQuest}
          onClose={() => { setShowManualQuest(false); setManualQuestPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={manualQuestPrefill}
        />
      )}

      {showManualEvent && (
        <AddEventModal
          visible={showManualEvent}
          onClose={() => { setShowManualEvent(false); setManualEventPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={manualEventPrefill as any}
        />
      )}
    </>
  );
}
