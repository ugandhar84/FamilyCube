/**
 * QuestsScreen — 100% port of gemini-code QuestsView to React Native.
 *
 * RBAC rules enforced:
 *  - Parent:  full access — add, approve, decline, reopen, reassign, see AI Engine
 *  - Senior:  can approve / decline / reopen — no AI Engine banner, no + Quest
 *  - Kid:     can claim open bounties, submit their own quests only; sees decline reason
 *
 * Real-world edge cases handled:
 *  - Submit Proof gated to `assignedToId === activeMemberId` (can't submit someone else's quest)
 *  - Pool quests lock after first claim (store sets isPool=false, status=claimed)
 *  - Decline flow with 4 preset reasons + custom text (max 200 chars)
 *  - Reopen lets parent give kid another attempt after decline
 *  - Photo-required badge warns kid before they submit
 *  - Decline reason shown inline on kid's declined card
 *  - Senior sees approve/decline but NOT AI engine or + Quest button
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/lib/ThemeContext';
import { useLocalSearchParams } from 'expo-router';
import { useFamilyStore } from '@/store/familyStore';
// questStore commented out — chores system is the single source of truth
// import { useQuestStore } from '@/store/questStore';
import { useQuestStore } from '@/store/choreAdapter';
import type { Quest } from '@/store/questStore';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { todayLocal, parseLocalDate, withinLast24h, parseTimeInput } from '@/lib/dates';
import { useChatStore } from '@/store/chatStore';
import { useChoreStore, type ChoreTask } from '@/store/choreStore';
import { supabase } from '@/lib/supabase';
import { AiEngineBanner, AiTool } from './components/AiEngineBanner';
import { QuestFilters, TabStatus } from './components/QuestFilters';
import { QuestSearchBar, type DateRange } from './components/QuestSearchBar';
import { I } from './components/icons';
import { s } from './components/questCardStyles';
import { DeclineModal } from './components/DeclineModal';
import { CantMakeItSheet } from '../tasks/components/CantMakeItSheet';
import { AddQuestModal } from './components/AddQuestModal';
import { EditQuestModal } from './components/EditQuestModal';
import { CreateQuestModal } from '../hub/senior/CreateQuestModal';
import { AutoBalanceCard, FomoCard, AdviceCard } from './components/AiFeatureCards';
import {
  callAutoBalance, callAutoBalanceFallback,
  buildAdviceFallback, callAdvice,
  buildFomoResult, callFomo,
} from './components/questAiFallbacks';
import { FamilyKudosStrip } from './components/FamilyKudosStrip';
import { SiblingCheerPanel } from './components/SiblingCheerPanel';
import { QuestCard } from './components/QuestCard';
import { DirectPendingCard } from '../hub/parent/backlog/DirectPendingCard';
import { OutgoingPendingCard } from '../hub/parent/backlog/OutgoingPendingCard';
import { LockedAssignmentCard } from '../hub/parent/backlog/LockedAssignmentCard';
import { MyAdultQuestCard } from '../hub/parent/backlog/MyAdultQuestCard';
import { OthersAdultQuestCard } from '../hub/parent/backlog/OthersAdultQuestCard';
import { DelegateSheet } from '../hub/parent/DelegateSheet';
import { PushbackSheet } from '../hub/parent/PushbackSheet';
import { SubmitQuestSheet } from './components/SubmitQuestSheet';
import { DelegateQuestSheet } from './components/DelegateQuestSheet';
import { KudosSheet } from './components/KudosSheet';

// Re-export AddQuestModal so existing external imports of
// `import { AddQuestModal } from '@/features/quests/QuestsScreen'` keep working.
export { AddQuestModal };

// ─── Main Screen ──────────────────────────────────────────────────────────────
// TabStatus and AiTool are imported from ./components/QuestFilters and ./components/AiEngineBanner

export default function QuestsScreen() {
  const { colors, isDark } = useTheme();
  const { questId } = useLocalSearchParams<{ questId?: string }>();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const { quests, claimQuest, submitQuest, approveQuest, declineQuest, reopenQuest, updateQuest, deleteQuest, approveParticipant, declineParticipant, reopenParticipant, reassignQuest, cheerQuest } = useQuestStore();

  const activeMember = members.find(m => m.id === activeMemberId)
    ?? members.find(m => m.role === 'parent') ?? members[0];
  const isParent         = activeMember?.role === 'parent';
  // A co-parent's direct assignment to me needs Accept/Respond here too —
  // Household Backlog already has this via DirectPendingCard/PushbackSheet;
  // the Chores tab reuses the exact same components AND the same
  // choreStore selectors (not independently re-derived filters) so the two
  // screens can never silently drift apart on what counts as pending/
  // locked/outgoing.
  const parentAssignments = useChoreStore(s => s.parentAssignments);
  const chores             = useChoreStore(s => s.chores);
  const respondToParentQuest = useChoreStore(s => s.respondToParentQuest);
  const cancelLockedAssignment = useChoreStore(s => s.cancelLockedAssignment);
  const recallParentQuest = useChoreStore(s => s.recallParentQuest);
  const addParentQuest = useChoreStore(s => s.addParentQuest);
  const getMyDirectPending = useChoreStore(s => s.getMyDirectPending);
  const getMyLockedItems   = useChoreStore(s => s.getMyLockedItems);
  const getMyOutgoingPending = useChoreStore(s => s.getMyOutgoingPending);
  const getActiveAssignmentChoreIds = useChoreStore(s => s.getActiveAssignmentChoreIds);
  const myDirectPending    = isParent && activeMember ? getMyDirectPending(activeMember.id) : [];
  const myLockedItems      = isParent && activeMember ? getMyLockedItems(activeMember.id) : [];
  const myOutgoingPending  = isParent && activeMember ? getMyOutgoingPending(activeMember.id) : [];
  // Same "mine assigned / assigned to another parent" split Household
  // Backlog uses, rendered via the exact same MyAdultQuestCard/
  // OthersAdultQuestCard components — previously the Chores tab rendered
  // these through the generic QuestCard instead, which has no Nudge/
  // Reclaim action at all for "assigned to a co-parent," so accepting a
  // delegated task made it show correctly on the Hub but effectively
  // actionless (and for the assigner, silently unreadable) in this tab.
  const completeParentQuest = useChoreStore(s => s.completeParentQuest);
  // A chore can carry a stale assignedToId while a NEWER System-A
  // delegation (parentAssignments row) is actually live/pending on someone
  // else — DelegateSheet's reassign flow creates a fresh PENDING row
  // without touching assignedToId. Without excluding these, the PREVIOUS
  // assignee kept showing up here with Nudge/Reclaim actions even after
  // they'd already reassigned the task away (same bug, same fix, as
  // ParentView.tsx's Household Backlog — see its comment for the full
  // repro). getActiveAssignmentChoreIds() below is used elsewhere in this
  // file for the same "has a live System-A row" purpose.
  const myAdultQuestsAssignmentIds = getActiveAssignmentChoreIds();
  const myAdultQuests = isParent && activeMember ? quests.filter(q =>
    !['done', 'approved', 'archived', 'cancelled', 'completed'].includes(q.status) &&
    q.isAdultTask && q.assignedToId === activeMember.id && !myAdultQuestsAssignmentIds.has(q.id)
  ) : [];
  const othersAdultQuests = isParent && activeMember ? quests.filter(q =>
    !['done', 'approved', 'archived', 'cancelled', 'completed'].includes(q.status) &&
    q.isAdultTask && q.assignedToId && q.assignedToId !== activeMember.id && !myAdultQuestsAssignmentIds.has(q.id)
  ) : [];
  const adultQuestCardIds = new Set([...myAdultQuests, ...othersAdultQuests].map(q => q.id));
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);
  const [pushbackSheet, setPushbackSheet] = useState<{ assignmentId: string; choreTitle: string; assignedBy: string; assignedTo: string } | null>(null);
  const [delegateFromLocked, setDelegateFromLocked] = useState<{ choreId: string; choreTitle: string } | null>(null);
  const isSenior         = activeMember?.role === 'senior';
  const isTeen           = activeMember?.role === 'teen';
  const isKid            = activeMember?.role === 'kid';
  const isKidOrTeen      = isKid || isTeen;        // same visibility as kids — sees all household quests + can claim
  const isParentOrSenior = isParent || isSenior;   // RBAC: approve/decline/reopen (teens excluded)
  // "kids" here means the filter-chip roster, not the literal role — teens
  // get the same household-quest visibility as kids (isKidOrTeen above), so
  // a parent filtering "by kid" needs to be able to pick a teen too.
  const kids              = members.filter(m => m.role === 'kid' || m.role === 'teen');
  const myId             = activeMember?.id;
  const isAssignedTo     = (q: typeof quests[0], memberId: string) =>
    q.assignedToId === memberId ||
    (q.assignedToIds?.length > 0 && q.assignedToIds.includes(memberId));

  const [kidFilter,      setKidFilter]      = useState('all');
  const [tabStatus,      setTabStatus]      = useState<TabStatus>('all');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [dateRange,      setDateRange]      = useState<DateRange>(null);
  const [showAiTool,     setShowAiTool]     = useState<AiTool>('none');
  const [isAiLoading,    setIsAiLoading]    = useState(false);
  const [autoBalResult,  setAutoBalResult]  = useState<any>(null);
  const [fomoResult,     setFomoResult]     = useState<any>(null);
  const [adviceResult,   setAdviceResult]   = useState<any>(null);
  const [appliedActions, setAppliedActions] = useState<Record<string, boolean>>({});
  const [isClaiming,     setIsClaiming]     = useState<Record<string, boolean>>({});
  const [isApproving,    setIsApproving]    = useState<Record<string, boolean>>({});
  const [isDeclining,    setIsDeclining]    = useState<Record<string, boolean>>({});
  const [isReopening,    setIsReopening]    = useState<Record<string, boolean>>({});
  const [declineTarget,  setDeclineTarget]  = useState<{ id: string; title: string; memberId?: string } | null>(null);
  // Kid/teen's own "Can't do this" — see QuestCard.tsx's onCantMakeIt prop
  // comment for why this is separate from declineTarget/DeclineModal.
  const [cantMakeItTarget, setCantMakeItTarget] = useState<ChoreTask | null>(null);
  const [editTarget,     setEditTarget]     = useState<Quest | null>(null);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [addPrefill, setAddPrefill] = useState<{
    title: string; category?: string; memberId?: string; startAt?: string;
    notes?: string; coins?: number; photoRequired?: boolean;
  } | undefined>(undefined);
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  // Sponsor-a-Quest form state — mirrors SeniorView's identically so both
  // entry points (Hub and this Quests tab) produce the exact same safe,
  // two-gate (parent reviews → kid claims) quest via createGrandparentQuest,
  // instead of the Quests tab silently using a different, less complete form.
  const [newQuestMode,   setNewQuestMode]   = useState<'local' | 'virtual'>('local');
  const [newQuestTitle,  setNewQuestTitle]  = useState('');
  const [newQuestDesc,   setNewQuestDesc]   = useState('');
  const [newQuestPoints, setNewQuestPoints] = useState('350');
  const [newQuestKidIds, setNewQuestKidIds] = useState<string[]>([]);
  const [newQuestPhoto,  setNewQuestPhoto]  = useState(true);
  const handleCreateSponsorQuest = () => {
    if (!newQuestTitle.trim() || !activeMember?.id) return;
    useChoreStore.getState().createGrandparentQuest({
      title:         newQuestTitle.trim(),
      description:   newQuestDesc.trim() || undefined,
      basePoints:    parseInt(newQuestPoints, 10) || 350,
      childIds:      newQuestKidIds,
      sponsorId:     activeMember.id,
      mode:          newQuestMode,
      requiresPhoto: newQuestPhoto,
    });
    setNewQuestTitle('');
    setNewQuestDesc('');
    setNewQuestPoints('350');
    setNewQuestKidIds([]);
    setNewQuestMode('local');
    setNewQuestPhoto(true);
    setShowSponsorModal(false);
  };
  const [delegateTarget, setDelegateTarget] = useState<{ id: string; title: string } | null>(null);
  const [kudosTarget,    setKudosTarget]    = useState<Quest | null>(null);
  const [kudosNote,      setKudosNote]      = useState('');
  const [kudosIncludeCoins, setKudosIncludeCoins] = useState(false);
  const [kudosCoinAmount,   setKudosCoinAmount]   = useState(10);
  const [kudosCustomCoins,  setKudosCustomCoins]  = useState(false);
  const [kudosCustomText,   setKudosCustomText]   = useState('');
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<Quest | null>(null);
  const [submissionPhotoUri, setSubmissionPhotoUri] = useState<string | null>(null);
  const [submissionNote, setSubmissionNote] = useState('');
  const [proofPhotoViewerUri, setProofPhotoViewerUri] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  const closeSubmitSheet = () => {
    setSubmitTarget(null);
    setSubmissionPhotoUri(null);
    setSubmissionNote('');
  };

  const openSubmitSheet = (quest: Quest) => {
    setSubmitTarget(quest);
    setSubmissionPhotoUri(null);
    setSubmissionNote('');
  };

  const selectProofPhoto = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to attach proof.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setSubmissionPhotoUri(result.assets[0].uri);
  };

  const submitWithProof = async () => {
    if (!submitTarget) return;
    if (submitTarget.photoRequired && !submissionPhotoUri) {
      Alert.alert('📸 Photo required', 'Add a photo before submitting this chore for review.');
      return;
    }

    // The image picker only ever hands back a local device URI (file://,
    // ph://…) — storing that directly as proof means the photo only ever
    // renders on the submitting device, in the same app session. A parent
    // reviewing on their own phone, or the same kid opening the app again
    // after the OS evicts its cache, gets a broken image. Upload to the
    // same family-media bucket ReceiptScanSheet.tsx already uses for proof
    // photos, and submit the resulting public URL instead.
    let photoUrl: string | undefined;
    if (submissionPhotoUri) {
      setIsUploadingProof(true);
      try {
        const familyId = activeMember?.familyId;
        const path = `chore-proofs/${familyId ?? 'unknown'}/${submitTarget.id}-${Date.now()}.jpg`;
        const blob = await (await fetch(submissionPhotoUri)).blob();
        const { error: upErr } = await supabase.storage.from('family-media').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('family-media').getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      } catch (e) {
        console.warn('[QuestsScreen] proof photo upload failed', e);
        setIsUploadingProof(false);
        Alert.alert('Upload failed', "Couldn't upload the photo — check your connection and try again.");
        return;
      }
      setIsUploadingProof(false);
    }

    const ok = submitQuest(submitTarget.id, {
      photoUrl,
      note: submissionNote.trim() || undefined,
    }, activeMemberId ?? undefined);
    if (!ok) {
      Alert.alert('Not due yet', "This chore's next turn hasn't started yet — check back on its due date.");
      return;
    }
    closeSubmitSheet();
  };

  // Scroll ref — used to reset position on persona switch
  const scrollRef = useRef<ScrollView>(null);

  // Pull-to-refresh — syncFromDB normally has a 5-minute TTL guard, so a
  // change made outside the app (another device, a direct DB edit) can sit
  // unseen for up to 5 minutes with no way to force it short of restarting
  // the app. force=true here bypasses that guard.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await useChoreStore.getState().syncFromDB(true);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Reset all view state when persona switches ────────────────────────────
  const prevMemberIdRef = useRef(activeMemberId);
  useEffect(() => {
    if (prevMemberIdRef.current === activeMemberId) return;
    prevMemberIdRef.current = activeMemberId;

    // Reset filters to role-appropriate defaults
    setKidFilter('all');
    setTabStatus('all');

    // Close AI panel + clear in-flight loading
    setShowAiTool('none');
    setIsAiLoading(false);

    // Close any open modals
    setDeclineTarget(null);
    setEditTarget(null);
    setShowAddModal(false);

    // Clear per-quest action loading states
    setIsClaiming({});
    setIsApproving({});
    setIsDeclining({});
    setIsReopening({});

    // Scroll back to top — expanded cards are remounted via listKey below
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeMemberId]);

  // Live clock — ticks every second so bonus countdowns update in real time
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-expire: clear bonuses whose timer has run out (sweep every 30s)
  useEffect(() => {
    const sweep = () => {
      const ts = Date.now();
      quests.forEach(q => {
        if (q.bonusCoins > 0 && q.bonusExpiresAt && new Date(q.bonusExpiresAt).getTime() <= ts) {
          updateQuest(q.id, { bonusCoins: 0, bonusExpiresAt: undefined });
        }
      });
    };
    sweep(); // run immediately on mount / when quests change
    const id = setInterval(sweep, 30_000);
    return () => clearInterval(id);
  }, [quests]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI result caching — skip re-analysis if quests haven't changed ──────────
  const aiQuestHash = useRef<Record<AiTool, string>>({ autobalance: '', spark: '', advice: '', none: '' });
  const [aiFromCache, setAiFromCache] = useState<Record<AiTool, boolean>>({ autobalance: false, spark: false, advice: false, none: false });

  const buildQuestHash = (qs: Quest[]) =>
    qs.map(q => `${q.id}:${q.status}:${q.assignedToId ?? ''}:${q.bonusCoins}`).join('|');

  // ── AI Handlers ──────────────────────────────────────────────────────────────
  const runAI = async (tool: AiTool) => {
    // Toggle off if already showing; block re-run while loading
    if (isAiLoading) return;
    if (showAiTool === tool) { setShowAiTool('none'); return; }

    const currentHash = buildQuestHash(quests);
    const lastHash    = aiQuestHash.current[tool];

    // Quests unchanged since last run — show cached result immediately
    if (lastHash && currentHash === lastHash) {
      setShowAiTool(tool);
      setAiFromCache(p => ({ ...p, [tool]: true }));
      return;
    }

    setIsAiLoading(true);
    setShowAiTool(tool);
    setAiFromCache(p => ({ ...p, [tool]: false }));
    if (tool === 'autobalance') {
      try { const r = await callAutoBalance(quests, kids); setAutoBalResult(r); }
      catch (e) { console.warn('[AutoBalance] AI failed, using local fallback:', e);
        const r = await callAutoBalanceFallback(quests, kids); setAutoBalResult(r); }
    } else if (tool === 'spark') {
      try { const r = await callFomo(quests, kids); setFomoResult(r); }
      catch (e) { console.warn('[FOMO] AI failed, using local fallback:', e);
        setFomoResult(buildFomoResult(quests, kids)); }
    } else if (tool === 'advice') {
      try { const r = await callAdvice(quests, kids); setAdviceResult(r); }
      catch (e) { console.warn('[Advice] AI failed, using local fallback:', e);
        setAdviceResult(buildAdviceFallback(quests, kids)); }
    }
    aiQuestHash.current[tool] = currentHash;
    setIsAiLoading(false);
  };

  const handleApply = (key: string, item: any, type = 'assign') => {
    setAppliedActions(p => ({ ...p, [key]: true }));
    const store = useQuestStore.getState();

    if (type === 'spark') {
      // Flash bonus: update the real quest with bonusCoins + expiry
      if (item.questId) {
        store.updateQuest(
          item.questId,
          { bonusCoins: item.bonusCoins, bonusExpiresAt: item.bonusExpiresAt },
          activeMember?.id,
        );
      }
    } else if (type === 'penalty') {
      // Force-assign: reassign the quest to the target kid
      if (item.questId && item.targetKidId) {
        store.reassignQuest(item.questId, item.targetKidId, activeMember?.id);
        // Live QA audit found this coin penalty (shown to the parent in the
        // Force Assign confirmation dialog, e.g. "-25🪙 deduction") was
        // never actually applied — reassignQuest only moves the assignee,
        // it has no payout side effect. Follows the same negative-awardPoints
        // clawback pattern _executeReversal already uses elsewhere in
        // choreStore.ts for the same kind of "remove coins that were never
        // truly earned" case.
        if (item.coinPenalty > 0 && item.currentKidId) {
          useChoreStore.getState().awardPoints(item.currentKidId, item.questId, -item.coinPenalty, 0);
        }
      }
    } else if (type === 'bounty') {
      const goPool = !item.assignedToId;
      store.addQuest({
        title: item.title, category: 'Other', priority: 'medium',
        coins: item.coins ?? 20, xpReward: 15,
        isPool: goPool, isDaily: false,
        recurrence: 'once', status: 'todo',
        assignedToIds: goPool ? [] : [item.assignedToId],
        isAdultTask: false,
        dueDate: todayLocal(), photoRequired: false,
        createdById: activeMember?.id,
      });
    } else if (type === 'reassign') {
      // Auto-balance: reassign existing quest to recommended kid
      if (item.questId && item.recommendedKidId) {
        store.reassignQuest(item.questId, item.recommendedKidId, activeMember?.id);
      }
    }
    if (key === 'advice_chat') {
      // Format a rich chat message and post to family group
      const notes = Object.entries(item.kidEncouragementNotes ?? {})
        .map(([name, note]) => `👤 *${name}*\n${note}`)
        .join('\n\n');
      const rules = (item.suggestedRuleUpdates ?? [])
        .map((r: string) => `→ ${r}`)
        .join('\n');
      const cheat = item.cheatPatternAlert ? `\n\n⚠️ *Pattern Alert*\n${item.cheatPatternAlert}` : '';
      const top   = item.topPerformer ? `\n\n🏆 *Top Performer this week: ${item.topPerformer}*` : '';
      const msg = [
        `✨ *AI Family Coaching Report*`,
        ``,
        `💡 ${item.familyCoachingTip}`,
        top,
        cheat,
        notes ? `\n📋 *Kid Notes*\n\n${notes}` : '',
        rules ? `\n📌 *Suggested Rules*\n${rules}` : '',
      ].filter(Boolean).join('\n');
      useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
    }
    // 'assign' and other types: just mark applied (future use)
  };

  // ── Quest filtering ───────────────────────────────────────────────────────────
  const filteredQuests = useMemo(() => {
    // A chore with ANY live System-A assignment (PENDING, SNOOZED, ACCEPTED,
    // or locked/PARKED) must never also render as a plain open/pool
    // QuestCard with Take It/Delegate-equivalent actions — QuestCard has no
    // concept of parentAssignments, so without this exclusion a co-parent
    // (or the assigner themselves) could "Take It" out from under a pending
    // DIRECT assignment. Whoever it belongs to sees it instead via the
    // dedicated DirectPendingCard/LockedAssignmentCard/OutgoingPendingCard
    // blocks rendered above this list.
    const activeAssignmentChoreIds = getActiveAssignmentChoreIds();
    // Adult tasks assigned to a specific parent (mine or a co-parent's) are
    // rendered via MyAdultQuestCard/OthersAdultQuestCard above this list
    // instead — QuestCard has no Nudge/Reclaim action and, until the
    // isTodoCard fix, didn't even render an in_progress adult quest at all.
    let list = quests.filter(q => !activeAssignmentChoreIds.has(q.id) && !adultQuestCardIds.has(q.id));

    // Build set of parent/senior member IDs for role-based hiding
    const adultMemberIds = new Set(members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.id));

    const myId = activeMember?.id;

    // Helper: is this quest assigned to a specific member (single or multi-assign)?
    const isAssignedTo = (q: typeof quests[0], memberId: string) =>
      q.assignedToId === memberId ||
      (q.assignedToIds?.length > 0 && q.assignedToIds.includes(memberId));

    if (isKidOrTeen) {
      // Kids only ever see:
      //  1. Quests assigned specifically to them (single or multi-assign)
      //  2. Open pool quests (shown only in Bounty tab below)
      // Never: adult tasks, other kids' quests, parent/senior quests,
      // or a grandparent_quest still awaiting the parent's safety review
      // (it must not be visible/claimable until a parent has actually
      // approved it — see choreAdapter's awaitingParentApproval).
      list = list.filter(q => {
        if (q.isAdultTask) return false;
        if (q.awaitingParentApproval) return false;
        if (q.assignedToId && adultMemberIds.has(q.assignedToId)) return false;
        if (q.isPool) return true; // pool quests filtered to Bounty tab below
        return myId ? isAssignedTo(q, myId) : false;
      });
    }

    // GP scope: their own assigned quests, and quests sponsored specifically
    // for grandkids. No GP-welcome flag exists on bounty/pool quests today,
    // so the general kids' bounty board is NOT included here — a bounty
    // only becomes visible to GP once it's an inviteGrandparents adult task
    // or an actual grandparent_quest, not just by being open/unclaimed.
    // The old `!q.isAdultTask` catch-all showed every kid's regular household
    // chore — noise that had nothing to do with what a GP actually manages.
    // Teens behave like kids for filtering (handled by isKidOrTeen above)
    if (!isParent && !isKidOrTeen) {
      list = list.filter(q =>
        (myId ? isAssignedTo(q, myId) : false) ||
        (q.questType === 'grandparent_quest' && q.sponsorUserId === myId) ||
        // Matches SeniorView's Hub `gpInvitations` filter exactly (no
        // isAdultTask requirement there) — a GP-invited pool chore must be
        // reachable from the dedicated Quests tab too, not just the Hub card.
        (q.inviteGrandparents === true && q.status === 'todo' && !q.sponsorUserId)
      );
    }

    if (kidFilter === 'adults') {
      list = list.filter(q => q.isAdultTask);
    } else if (kidFilter === 'pool') {
      // A pool quest another kid just claimed must vanish from this tab
      // immediately (spec 1.1 "Claimed" stage / 3.1 race resolution) — the
      // "All Family" branch below already excludes claimed items via
      // !q.assignedToId, but this dedicated Pool tab was missing the same
      // check, so a sibling's just-claimed bounty stayed visible/tappable
      // here until the next full reload.
      list = list.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask && !q.assignedToId);
    } else if (isKidOrTeen && kidFilter === 'all') {
      // Kid/Teen "All Family" — their own directly assigned quests, plus any
      // unclaimed bounty task (open to anyone to claim, so it's relevant to
      // "all family" the same way it already is for a parent's All Family
      // view below). Adult tasks stay excluded — those were never meant to
      // be kid-visible regardless of pool status.
      list = list.filter(q =>
        (myId && isAssignedTo(q, myId)) ||
        (q.isPool && q.status === 'todo' && !q.isAdultTask && !q.assignedToId)
      );
    } else if (!isKidOrTeen && kidFilter !== 'all' && kidFilter !== 'cheer') {
      // Parent filtered by specific kid — also keep unassigned pool quests (backlog)
      list = list.filter(q => (!q.isAdultTask && q.isPool && !q.assignedToId) || (isAssignedTo(q, kidFilter) && !q.isAdultTask));
    } else if (!isKidOrTeen && kidFilter === 'all') {
      // Parent "All Family" — all quests including adult tasks
      // (adult tasks are hidden from kids above; parents see everything)
    }

    if (kidFilter !== 'cheer' && tabStatus !== 'all') {
      if (tabStatus === 'todo')      list = list.filter(q => q.status === 'todo' || q.status === 'claimed');
      else if (tabStatus === 'review')    list = list.filter(q => q.status === 'pending_approval');
      else if (tabStatus === 'completed') list = list.filter(q => q.status === 'approved' || q.status === 'done');
    }
    // Hub decision banners can open one specific quest for the kid to review.
    if (questId) list = list.filter(q => q.id === questId);
    // Text search — title/description, case-insensitive.
    if (searchQuery.trim()) {
      const needle = searchQuery.trim().toLowerCase();
      list = list.filter(q =>
        q.title.toLowerCase().includes(needle) ||
        (q.description ?? '').toLowerCase().includes(needle));
    }
    // Date-range filter — by due date, inclusive on both ends. A quest with
    // no due date never matches a range filter (nothing to compare against).
    if (dateRange) {
      list = list.filter(q => !!q.dueDate && q.dueDate >= dateRange.from && q.dueDate <= dateRange.to);
    }
    // "All Family" reads as a due-date worklist — soonest due first, no-due-
    // date quests after everything with a real deadline — with approved/done
    // quests sinking to the very bottom regardless of due date, since they're
    // finished business, not upcoming work. A stable sort keeps same-due-date
    // ties in their original relative order.
    const isDone = (q: typeof list[number]) => q.status === 'approved' || q.status === 'done';
    const dueMs = (q: typeof list[number]) => {
      if (!q.dueDate) return Infinity;
      const ms = parseLocalDate(q.dueDate).getTime();
      if (!q.dueTime) return ms;
      const parsed = parseTimeInput(q.dueTime);
      if (!parsed) return ms;
      const [h, m] = parsed.split(':').map(Number);
      return ms + (h * 60 + m) * 60_000;
    };
    // Among done items specifically, due date is meaningless (the deadline
    // is moot once it's finished) — sort by when it actually CLOSED
    // instead, most-recent first, so the Completed tab reads as a log of
    // what just happened rather than a stale worklist ordering.
    const closedMs = (q: typeof list[number]) => {
      const iso = (q as any).completedAt ?? (q as any).approvedAt ?? q.submittedAt;
      return iso ? new Date(iso).getTime() : 0;
    };
    list = [...list].sort((a, b) => {
      const doneDiff = Number(isDone(a)) - Number(isDone(b));
      if (doneDiff !== 0) return doneDiff;
      if (isDone(a) && isDone(b)) return closedMs(b) - closedMs(a);
      return dueMs(a) - dueMs(b);
    });
    return list;
  }, [quests, parentAssignments, kidFilter, tabStatus, isKidOrTeen, activeMember, questId, searchQuery, dateRange]);

  // ── Kid grouped sections (spec §4 dashboard layout) ───────────────────────────
  const kidSections = React.useMemo(() => {
    if (!isKidOrTeen || tabStatus !== 'todo') return null;
    const citizenship    = filteredQuests.filter(q => q.questType === 'citizenship');
    const routines       = filteredQuests.filter(q => q.questType === 'routine' || (q.questType === 'general' && q.isDaily && !q.isPool));
    const bountyBoard    = filteredQuests.filter(q => q.isPool && q.status === 'todo');
    const grandparent    = filteredQuests.filter(q => q.questType === 'grandparent_quest');
    const other          = filteredQuests.filter(q =>
      !citizenship.find(x => x.id === q.id) &&
      !routines.find(x => x.id === q.id) &&
      !bountyBoard.find(x => x.id === q.id) &&
      !grandparent.find(x => x.id === q.id)
    );
    return { citizenship, routines, bountyBoard, grandparent, other };
  }, [filteredQuests, isKidOrTeen, tabStatus]);

  // ── Family Kudos — today's completed quests from kids, cheerable by GP.
  // Kid/teen siblings get the same job done by the dedicated "Sibling Cheer"
  // tab below (with its own animation + own-quest filtering) — showing both
  // here too would be redundant for them.
  const todaysKudos = React.useMemo(() => {
    if (!isSenior) return [];
    return quests
      .filter(q =>
        (q.status === 'done' || q.status === 'approved') && !q.isAdultTask &&
        q.assignedToId !== myId &&  // never show my own completed quests — I can't cheer myself
        // The "already cheered" check below already covers a GP-sponsored
        // quest THEY approved themselves via "Approve & Cheer" (that action
        // writes a cheer). A blanket sponsorUserId-based exclusion was
        // wrong (same bug fixed in SeniorView.tsx's kidsCheerable): a
        // GP-sponsored quest a PARENT approved instead never got an actual
        // cheer, so it was being silently hidden from this GP forever.
        withinLast24h(q.completedAt ?? q.approvedAt) &&
        !(q.cheers ?? []).some(c => c.memberId === myId)
      )
      .sort((a, b) => (b.completedAt ?? b.approvedAt ?? '').localeCompare(a.completedAt ?? a.approvedAt ?? ''))
      .slice(0, 10);
  }, [quests, isSenior, myId]);

  const handleKudosTap = (q: Quest) => {
    setKudosTarget(q);
    setKudosNote('');
    setKudosIncludeCoins(false);
    setKudosCoinAmount(10);
    setKudosCustomCoins(false);
    setKudosCustomText('');
  };

  const closeKudosSheet = () => setKudosTarget(null);

  const handleSendKudos = () => {
    if (!kudosTarget) return;
    const resolvedAmount = kudosCustomCoins ? (parseInt(kudosCustomText, 10) || 0) : kudosCoinAmount;
    const coins = isSenior && kudosIncludeCoins && resolvedAmount > 0 ? resolvedAmount : undefined;
    // cheerChore (via cheerQuest) now credits opts.coins to gpCoins itself —
    // this used to ALSO award the same amount directly here, double-paying
    // every kudos-with-coins sent from this screen.
    cheerQuest(kudosTarget.id, myId ?? '', { note: kudosNote.trim() || undefined, coins });
    closeKudosSheet();
  };

  // ── Action handlers ───────────────────────────────────────────────────────────
  const handleClaim = async (id: string) => {
    if (isClaiming[id]) return;
    setIsClaiming(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 700));
    // Spec 3.1/3.4 — distinguish a lost claim race (someone else claimed
    // it) from a claim landing on an already-deleted quest, instead of a
    // silent no-op either way.
    claimQuest(id, activeMember?.id ?? '', (reason) => {
      Alert.alert(
        reason === 'deleted' ? 'No longer available' : 'Someone beat you to it!',
        reason === 'deleted'
          ? 'This quest was just removed by a parent.'
          : 'Someone else already claimed this quest — check the pool for others.',
      );
    });
    setIsClaiming(p => ({ ...p, [id]: false }));
  };

  const handleApproveQuest = async (id: string) => {
    if (isApproving[id]) return;
    setIsApproving(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 800));
    approveQuest(id, activeMember?.id ?? '');
    setIsApproving(p => ({ ...p, [id]: false }));
  };

  const handleDeclineConfirm = async (reason: string) => {
    if (!declineTarget) return;
    const { id, memberId } = declineTarget;
    setDeclineTarget(null);
    setIsDeclining(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 300));
    // A kid OR teen turning down a grandparent quest releases it back to the
    // family pool rather than killing it — siblings can still pick it up.
    // This must match isKidOrTeen (same widened gate QuestCard.tsx's
    // canKidDecline/canAcceptGp use), not isKid alone — a teen tapping
    // "Decline" on a GP quest at status 'todo' hit the isKid-only branch's
    // else path below, which calls declineQuest -> requestRedo, a no-op
    // whenever status !== 'pending_approval'. The sheet closed as if it
    // worked, but the chore stayed exactly as-is: still assigned to the
    // teen, sponsor never notified, nothing released to the pool.
    const chore = useChoreStore.getState().chores.find(c => c.id === id);
    if (!memberId && isKidOrTeen && chore?.categoryType === 'grandparent_quest' && chore.status === 'todo') {
      // declineGrandparentQuest now sends the sponsor DM itself
      // (centralized in choreStore.ts) — only the no-sponsor family-wide
      // fallback is still this caller's responsibility.
      useChoreStore.getState().declineGrandparentQuest(id, activeMember?.id ?? '', reason);
      if (!chore.sponsorUserId) {
        useChatStore.getState().sendMessage('all', activeMember?.id ?? '',
          `🙏 ${activeMember?.name.split(' ')[0]} can't take "${chore.title}" — "${reason}"`);
      }
      setIsDeclining(p => ({ ...p, [id]: false }));
      return;
    }
    if (memberId) {
      // Per-participant decline
      declineParticipant(id, memberId, activeMember?.id ?? '', reason, 'custom');
    } else if (isKidOrTeen && chore && chore.status !== 'pending_approval') {
      // Kid/teen tapping "Can't do this" on their own assigned household
      // chore (QuestCard's canKidDecline — status is 'todo'/'in_progress',
      // never 'pending_approval') is NOT the same action as a parent
      // declining a submission. declineQuest -> requestRedo only fires on
      // status === 'pending_approval' and silently no-ops otherwise, which
      // is exactly canKidDecline's target state -- the button appeared to
      // work (sheet closed, no error) but never actually released the
      // chore.
      //
      // Was a bare reassignQuest(id, '', ...) — pool-release only, which
      // silently skipped the GP-quest (sponsor DM) and team-clone
      // (decline-this-clone-only) branches Hub's CantMakeItSheet already
      // handles correctly via the same store action. A kid declining the SAME GP
      // quest from this tab instead of Hub got the wrong behavior (no
      // sponsor notified, or the whole team-clone shortlist affected).
      // declineChoreAssignment centralizes the 3-way dispatch so both
      // entry points now agree.
      useChoreStore.getState().declineChoreAssignment(id, activeMember?.id ?? '', reason);
    } else {
      // Parent/senior declining a kid's pending_approval submission — a
      // real Redo request, requestRedo's actual intended target state.
      declineQuest(id, activeMember?.id ?? '', reason, 'custom');
    }
    setIsDeclining(p => ({ ...p, [id]: false }));
  };

  const handleReopen = async (id: string) => {
    if (isReopening[id]) return;
    setIsReopening(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 600));
    reopenQuest(id, activeMember?.id ?? '');
    setIsReopening(p => ({ ...p, [id]: false }));
  };

  const cardBg   = colors.card;
  const cardBord = colors.border;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name}
        memberRole={activeMember?.role === 'kid' ? 'kid' : activeMember?.role === 'teen' ? 'teen' : activeMember?.role === 'senior' ? 'senior' : 'parent'}
        notifCount={unreadNotifCount}
        onPersonaPress={undefined}
        onBellPress={() => setNotifPanelOpen(true)}
      />
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* ── Title ── */}
        <View style={[s.titleRow, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.textPrimary }]}>
              {isKid ? 'My Chores' : 'Household Chores'}
            </Text>
            {isParent && (
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple, marginTop: 1 }}>
                Add quests, approve chores & distribute coins
              </Text>
            )}
          </View>
        </View>

        {/* ── AI toggle + search/filter + add-chore, one shared row (wraps
            to a second line if things are expanded at once) ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 14, marginBottom: 10, gap: 8 }}>
          {isParent && (
            <AiEngineBanner
              showAiTool={showAiTool}
              isAiLoading={isAiLoading}
              onRunAI={runAI}
              colors={colors}
              isDark={isDark}
            />
          )}
          <QuestSearchBar
            query={searchQuery} onQueryChange={setSearchQuery}
            range={dateRange} onRangeChange={setDateRange}
            colors={colors} isDark={isDark}
          />
          {/* Scenario 1.5 — a Teen has the same self-creation rights as a
              parent (broad autonomy; only 1.13's reward co-sign threshold
              gates a high-value payout, not creation itself). */}
          {(isParent || isTeen) && (
            <TouchableOpacity onPress={() => setShowAddModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <I.PlusCircle c={colors.success} />
              <Text style={{ color: colors.success, fontSize: TYPO.label, fontWeight: '900' }}>+ Quest</Text>
            </TouchableOpacity>
          )}
          {isSenior && (
            <TouchableOpacity onPress={() => setShowSponsorModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <I.PlusCircle c={colors.teal} />
              <Text style={{ color: colors.teal, fontSize: TYPO.label, fontWeight: '900' }}>Sponsor Chore</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Family Kudos — today's completed quests, tap to cheer ── */}
        <FamilyKudosStrip
          todaysKudos={todaysKudos}
          members={members}
          isSenior={isSenior}
          colors={colors}
          onKudosTap={handleKudosTap}
        />

        {/* ── AI Loading + Results (parent ONLY) ── */}
        {isParent && isAiLoading && (
          <View style={[s.aiLoadingBox, { marginHorizontal: 14, marginBottom: 12, backgroundColor: colors.primaryLight, borderColor: colors.primary + '40' }]}>
            <ActivityIndicator color={BRAND.purple} size="small" />
            <Text style={[s.aiLoadingText, { color: colors.primary }]}>CubeAI is analysing your household quests...</Text>
          </View>
        )}
        {isParent && !isAiLoading && showAiTool !== 'none' && aiFromCache[showAiTool] && (
          <View style={{ marginHorizontal: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 13 }}>ℹ️</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, flex: 1 }}>No changes since last analysis — showing cached results.</Text>
          </View>
        )}
        {isParent && !isAiLoading && showAiTool === 'autobalance' && autoBalResult && (
          <AutoBalanceCard result={autoBalResult} onApply={handleApply} appliedActions={appliedActions} onClose={() => setShowAiTool('none')} isDark={isDark} colors={colors} kids={kids} />
        )}
        {isParent && !isAiLoading && showAiTool === 'spark' && fomoResult && (
          <FomoCard result={fomoResult} onApply={handleApply} appliedActions={appliedActions} onClose={() => setShowAiTool('none')} isDark={isDark} colors={colors} kids={kids} />
        )}
        {isParent && !isAiLoading && showAiTool === 'advice' && adviceResult && (
          <AdviceCard result={adviceResult} appliedActions={appliedActions} onApply={handleApply} onClose={() => setShowAiTool('none')} isDark={isDark} colors={colors} />
        )}

        {/* ── Member / Filter Pills + Status Tabs ── */}
        <QuestFilters
          kidFilter={kidFilter}
          tabStatus={tabStatus}
          isKid={isKid}
          isParentOrSenior={isParentOrSenior}
          isSenior={isSenior}
          kids={kids as any[]}
          isDark={isDark}
          colors={colors}
          onSetKidFilter={setKidFilter}
          onSetTabStatus={setTabStatus}
        />

        {/* ── Sibling Cheer Panel — kid/teen only, see QuestFilters ── */}
        {kidFilter === 'cheer' && !isParentOrSenior ? (
          <SiblingCheerPanel
            quests={quests}
            members={members}
            myId={myId}
            celebratingId={celebratingId}
            setCelebratingId={setCelebratingId}
            cheerQuest={cheerQuest}
            cardBg={cardBg}
            cardBord={cardBord}
            colors={colors}
          />
        ) : (
          <>

            {/* ── Quest Cards — keyed by activeMemberId so expanded state resets on persona switch ── */}
            <View key={activeMemberId ?? 'default'} style={{ paddingHorizontal: 14, gap: 10, marginTop: 12 }}>
              {filteredQuests.length === 0 && (
                <View style={[s.emptyBox, { backgroundColor: cardBg, borderColor: cardBord }]}>
                  <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                    {tabStatus === 'todo'        ? 'All caught up! No tasks pending 🎉'
                     : tabStatus === 'review'    ? 'No chores awaiting review'
                     : tabStatus === 'completed' ? 'No completed chores yet'
                     : 'No chores found for this filter'}
                  </Text>
                </View>
              )}

              {/* ── Kid grouped section headers (spec §4) ── */}
              {kidSections && kidSections.citizenship.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: -4 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.danger + '20' }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: colors.dangerLight, borderRadius: 20,
                    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.danger + '30' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.danger }}>🏛 Citizenship</Text>
                    <View style={{ backgroundColor: colors.danger, borderRadius: 10, minWidth: 18, alignItems: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.textInverse }}>{kidSections.citizenship.length}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.danger + '20' }} />
                </View>
              )}

              {kidSections && kidSections.routines.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: -4 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.primary + '20' }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: colors.primaryLight, borderRadius: 20,
                    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.primary + '30' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.primary }}>⭐ Routines</Text>
                    <View style={{ backgroundColor: colors.primary, borderRadius: 10, minWidth: 18, alignItems: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.textInverse }}>{kidSections.routines.length}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.primary + '20' }} />
                </View>
              )}

              {kidSections && kidSections.bountyBoard.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: -4 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.amber + '20' }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: colors.amberLight, borderRadius: 20,
                    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.amber + '30' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.amber }}>🎯 Bounty Board</Text>
                    <View style={{ backgroundColor: colors.amber, borderRadius: 10, minWidth: 18, alignItems: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.textInverse }}>{kidSections.bountyBoard.length}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.amber + '20' }} />
                </View>
              )}

              {kidSections && kidSections.grandparent.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: -4 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.teal + '20' }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: colors.tealLight, borderRadius: 20,
                    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.teal + '30' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: colors.teal }}>👴 Grandparent Quests</Text>
                    <View style={{ backgroundColor: colors.teal, borderRadius: 10, minWidth: 18, alignItems: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.textInverse }}>{kidSections.grandparent.length}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.teal + '20' }} />
                </View>
              )}

              {myAdultQuests.length > 0 && activeMember && myAdultQuests.map(q => (
                <MyAdultQuestCard key={q.id} q={q} parentAssignments={parentAssignments} active={activeMember} members={members}
                  colors={colors} isDark={isDark} completeParentQuest={completeParentQuest}
                  updateQuest={updateQuest} onDelegate={(choreId, choreTitle) => setDelegateFromLocked({ choreId, choreTitle })}
                  onLongPress={() => setEditTarget(q)} />
              ))}

              {othersAdultQuests.length > 0 && activeMember && othersAdultQuests.map(q => (
                <OthersAdultQuestCard key={q.id} q={q} active={activeMember} members={members} colors={colors} isDark={isDark} updateQuest={updateQuest}
                  onLongPress={() => setEditTarget(q)} />
              ))}

              {myDirectPending.length > 0 && myDirectPending.map(a => {
                const chore = chores.find(c => c.id === a.choreId);
                if (!chore) return null;
                return (
                  <DirectPendingCard key={a.id} a={a} chore={chore} members={members} colors={colors} isDark={isDark}
                    respondToParentQuest={respondToParentQuest}
                    onRespond={(assignmentId, choreTitle, assignedBy, assignedTo) => setPushbackSheet({ assignmentId, choreTitle, assignedBy, assignedTo })} />
                );
              })}

              {myOutgoingPending.length > 0 && myOutgoingPending.map(a => {
                const chore = chores.find(c => c.id === a.choreId);
                if (!chore) return null;
                return (
                  <OutgoingPendingCard key={a.id} a={a} chore={chore} members={members} active={activeMember!} colors={colors} isDark={isDark}
                    onRecall={a.status === 'PENDING' ? () => recallParentQuest(a.id, activeMember!.id) : undefined} />
                );
              })}

              {myLockedItems.length > 0 && myLockedItems.map(a => {
                const chore = chores.find(c => c.id === a.choreId);
                if (!chore || !activeMember) return null;
                return (
                  <LockedAssignmentCard key={a.id} a={a} chore={chore} active={activeMember} members={members}
                    colors={colors} isDark={isDark}
                    onDelegate={(choreId, choreTitle) => setDelegateFromLocked({ choreId, choreTitle })}
                    cancelLockedAssignment={cancelLockedAssignment} />
                );
              })}

              {/* Render all quests — section headers above serve as visual anchors */}
              {(kidSections
                ? [
                    ...kidSections.citizenship,
                    ...kidSections.routines,
                    ...kidSections.bountyBoard,
                    ...kidSections.grandparent,
                    ...kidSections.other,
                  ]
                : filteredQuests
              ).map(q => (
                <QuestCard
                  key={q.id}
                  q={q}
                  now={now}
                  questId={questId}
                  members={members}
                  colors={colors}
                  isDark={isDark}
                  cardBg={cardBg}
                  cardBord={cardBord}
                  isParent={isParent}
                  isSenior={isSenior}
                  isKid={isKid}
                  isKidOrTeen={isKidOrTeen}
                  isParentOrSenior={isParentOrSenior}
                  myId={myId}
                  activeMember={activeMember}
                  isAssignedTo={isAssignedTo}
                  isClaiming={isClaiming}
                  handleClaim={handleClaim}
                  openSubmitSheet={openSubmitSheet}
                  setDeclineTarget={setDeclineTarget}
                  onCantMakeIt={setCantMakeItTarget}
                  approveQuest={approveQuest}
                  reassignQuest={reassignQuest}
                  approveParticipant={approveParticipant}
                  reopenParticipant={reopenParticipant}
                  updateQuest={updateQuest}
                  deleteQuest={deleteQuest}
                  setEditTarget={setEditTarget}
                  setDelegateTarget={setDelegateTarget}
                  setProofPhotoViewerUri={setProofPhotoViewerUri}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <SubmitQuestSheet
        submitTarget={submitTarget}
        closeSubmitSheet={closeSubmitSheet}
        submissionNote={submissionNote}
        setSubmissionNote={setSubmissionNote}
        submissionPhotoUri={submissionPhotoUri}
        setSubmissionPhotoUri={setSubmissionPhotoUri}
        selectProofPhoto={selectProofPhoto}
        submitWithProof={submitWithProof}
        isUploadingProof={isUploadingProof}
        proofPhotoViewerUri={proofPhotoViewerUri}
        setProofPhotoViewerUri={setProofPhotoViewerUri}
        colors={colors}
        isDark={isDark}
      />

      {/* Parent or Teen (Scenario 1.5): Add Quest modal */}
      {(isParent || isTeen) && (
        <AddQuestModal visible={showAddModal}
          onClose={() => { setShowAddModal(false); setAddPrefill(undefined); }}
          activeMemberId={activeMember?.id ?? ''}
          prefill={addPrefill ? {
            title: addPrefill.title,
            coins: addPrefill.coins,
            assignedToId: addPrefill.memberId,
            photoRequired: addPrefill.photoRequired,
            dueDate: addPrefill.startAt ? addPrefill.startAt.slice(0, 10) : undefined,
          } : undefined}
        />
      )}

      {/* Grandparent: Sponsor Quest modal — same CreateQuestModal +
          createGrandparentQuest flow as the Hub's "Sponsor a Quest", so
          both entry points behave identically (parent safety-review gate,
          50/40/10 split preview, mode/kid picker) instead of diverging. */}
      {isSenior && (
        <CreateQuestModal
          visible={showSponsorModal} onClose={() => setShowSponsorModal(false)}
          kids={kids as any[]} colors={colors} isDark={isDark}
          newQuestMode={newQuestMode} setNewQuestMode={setNewQuestMode}
          newQuestTitle={newQuestTitle} setNewQuestTitle={setNewQuestTitle}
          newQuestDesc={newQuestDesc} setNewQuestDesc={setNewQuestDesc}
          newQuestPoints={newQuestPoints} setNewQuestPoints={setNewQuestPoints}
          newQuestKidIds={newQuestKidIds} setNewQuestKidIds={setNewQuestKidIds}
          newQuestPhoto={newQuestPhoto} setNewQuestPhoto={setNewQuestPhoto}
          onCreate={handleCreateSponsorQuest}
        />
      )}

      {/* Parent-only: Edit unclaimed quest modal */}
      {isParent && editTarget && (
        <EditQuestModal
          quest={editTarget}
          activeMemberId={activeMember?.id ?? ''}
          // Full edit is about whether anything has actually happened yet
          // (status === 'todo' — not claimed/started/submitted), not about
          // whether it's pre-assigned. An AI/voice-created quest is often
          // created with assignedToId already set (the requester named a
          // kid) but is still status 'todo' — the old `!assignedToId` gate
          // wrongly downgraded those straight to restricted mode on first
          // open, with no way to see/edit the AI-populated fields at all.
          editMode={editTarget.status === 'todo' ? 'full' : 'restricted'}
          onClose={() => setEditTarget(null)}
          onSave={(id, patch) => {
            // Notify assignee via their 1:1 DM (not the family-wide channel)
            // when a parent modifies an active quest.
            const assigneeId = editTarget.assignedToId;
            if (assigneeId && (editTarget.status === 'in_progress' || editTarget.status === 'pending_approval')) {
              const parentName = activeMember?.name?.split(' ')[0] ?? 'A parent';
              const msg = `📝 ${parentName} updated "${editTarget.title}" — check your quest for the latest details.`;
              useChatStore.getState().sendMessage(assigneeId, activeMember?.id ?? '', msg);
            }
            updateQuest(id, patch, activeMember?.id);
            setEditTarget(null);
          }}
          onDelete={(id) => {
            // Notify assignee via their 1:1 DM when a quest is deleted while active
            const assigneeId = editTarget.assignedToId;
            if (assigneeId && (editTarget.status === 'in_progress' || editTarget.status === 'pending_approval')) {
              const parentName = activeMember?.name?.split(' ')[0] ?? 'A parent';
              const msg = `🗑️ ${parentName} removed the quest "${editTarget.title}" that was assigned to you.`;
              useChatStore.getState().sendMessage(assigneeId, activeMember?.id ?? '', msg);
            }
            deleteQuest(id);
            setEditTarget(null);
          }}
        />
      )}

      {/* Decline modal — appears when parent/senior taps Decline */}
      <DeclineModal
        visible={!!declineTarget}
        questTitle={declineTarget?.title ?? ''}
        onConfirm={handleDeclineConfirm}
        onCancel={() => setDeclineTarget(null)}
        colors={colors}
        isDark={isDark}
      />

      <CantMakeItSheet
        target={cantMakeItTarget ? { kind: 'chore', item: cantMakeItTarget } : null}
        byMemberId={activeMember?.id ?? ''}
        members={members}
        onClose={() => setCantMakeItTarget(null)}
      />

      <PushbackSheet
        target={pushbackSheet} colors={colors} isDark={isDark}
        onClose={() => setPushbackSheet(null)}
        respondToParentQuest={respondToParentQuest}
      />

      {activeMember && (
        <DelegateSheet
          target={delegateFromLocked} colors={colors} isDark={isDark}
          questPool={chores}
          members={members} active={activeMember}
          onClose={() => setDelegateFromLocked(null)}
          updateQuest={updateQuest}
          addParentQuest={addParentQuest}
        />
      )}

      <DelegateQuestSheet
        delegateTarget={delegateTarget}
        setDelegateTarget={setDelegateTarget}
        members={members}
        updateQuest={updateQuest}
        activeMemberId={activeMember?.id}
        colors={colors}
        isDark={isDark}
      />

      <KudosSheet
        kudosTarget={kudosTarget}
        closeKudosSheet={closeKudosSheet}
        members={members}
        kudosNote={kudosNote}
        setKudosNote={setKudosNote}
        isSenior={isSenior}
        kudosIncludeCoins={kudosIncludeCoins}
        setKudosIncludeCoins={setKudosIncludeCoins}
        kudosCoinAmount={kudosCoinAmount}
        setKudosCoinAmount={setKudosCoinAmount}
        kudosCustomCoins={kudosCustomCoins}
        setKudosCustomCoins={setKudosCustomCoins}
        kudosCustomText={kudosCustomText}
        setKudosCustomText={setKudosCustomText}
        handleSendKudos={handleSendKudos}
        colors={colors}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}
