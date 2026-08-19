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
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, Alert, Platform, Image, Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/lib/ThemeContext';
import { useLocalSearchParams } from 'expo-router';
import AppBottomSheet from '@/components/AppBottomSheet';
import CelebrationBurst from '@/components/CelebrationBurst';
import AddIntakeChooser from '@/components/AddIntakeChooser';
import { useFamilyStore } from '@/store/familyStore';
// questStore commented out — chores system is the single source of truth
// import { useQuestStore } from '@/store/questStore';
import { useQuestStore } from '@/store/choreAdapter';
import type { Quest } from '@/store/questStore';
import AppHeader from '@/components/AppHeader';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { fmtDateShort, todayLocal, localDateStr, fmtDateTime, parseLocalDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/store/chatStore';
import { fetchCustomCategories, fetchCustomSuggestions, recordCustomSuggestion, CustomCategory } from '@/lib/familyCustomCategories';
import { useGroceryStore } from '@/store/groceryStore';
import { useChoreStore } from '@/store/choreStore';
import { DEFAULT_GROCERY_ITEMS, DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { AiEngineBanner, AiTool } from './components/AiEngineBanner';
import { QuestFilters, TabStatus } from './components/QuestFilters';
import { QuestSearchBar, type DateRange } from './components/QuestSearchBar';
import { I } from './components/icons';
import { s } from './components/questCardStyles';
import { DeclineModal } from './components/DeclineModal';
import { CollapsibleQuestCard } from './components/CollapsibleQuestCard';
import { FlashBonusBadge } from './components/FlashBonusBadge';
import { QuestStepper } from './components/QuestStepper';
import { AddQuestModal, aq } from './components/AddQuestModal';
import { EditQuestModal } from './components/EditQuestModal';
import { ParentSelfNoteRow } from './components/ParentSelfNoteRow';
import { CreateQuestModal } from '../hub/senior/CreateQuestModal';
import { AutoBalanceCard, FomoCard, AdviceCard } from './components/AiFeatureCards';

// Re-export AddQuestModal so existing external imports of
// `import { AddQuestModal } from '@/features/quests/QuestsScreen'` keep working.
export { AddQuestModal };

// "2h ago", "3d ago", "just now"
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── AI Simulation helpers ────────────────────────────────────────────────────

function callAutoBalanceFallback(quests: any[], kids: any[]) {
  const today = todayLocal();
  const openCount = (id: string) => quests.filter(q => q.assignedToId === id && q.status !== 'done' && q.status !== 'approved').length;
  const sorted = [...kids].sort((a, b) => openCount(a.id) - openCount(b.id));
  const assignments = quests
    .filter(q => q.status === 'todo' && q.assignedToId)
    .slice(0, 3)
    .map((q, i) => {
      const recommended = sorted[i % sorted.length];
      return { questId: q.id, questTitle: q.title, currentKidId: q.assignedToId, recommendedKidId: recommended.id, recommendedKid: recommended.name, reason: `${recommended.name} has fewer open quests right now` };
    });
  return Promise.resolve({ summary: `Analyzed ${quests.length} quests across ${kids.length} kids — redistributing for better balance.`, assignments, newSuggestedQuests: [], balanceReport: {} });
}

function buildAdviceFallback(quests: any[], kids: any[]) {
  const today = todayLocal();
  const kidStats = kids.map((k: any) => {
    const assigned   = quests.filter(q => q.assignedToId === k.id);
    const done       = assigned.filter(q => q.status === 'done' || q.status === 'approved').length;
    const overdue    = assigned.filter(q => q.dueDate && q.dueDate <= today && q.status !== 'done' && q.status !== 'approved').length;
    const ghosted    = assigned.filter(q => q.status === 'claimed' && q.dueDate && q.dueDate <= today).length;
    const inProgress = assigned.filter(q => q.status === 'in_progress').length;
    return { ...k, done, overdue, ghosted, inProgress };
  });
  const topKid = kidStats.reduce((best: any, k: any) => (!best || k.done > best.done) ? k : best, null);
  const cheaters = kidStats.filter((k: any) => k.ghosted > 0);
  const coachingTip = cheaters.length > 0
    ? `${cheaters.map((k: any) => k.name).join(', ')} claimed quests without completing them. Consider a family rule: uncompleted claimed quests lose 10🪙 after 24h.`
    : 'Try a weekend "Power Hour" — everyone does chores together. Kids finish 3× more when parents join in!';
  const kidEncouragementNotes = Object.fromEntries(kidStats.map((k: any) => {
    const note = k.ghosted > 0
      ? `${k.name} claimed ${k.ghosted} quest${k.ghosted > 1 ? 's' : ''} but never finished. This blocks others from grabbing those bounties.`
      : k.done > 2
      ? `Amazing work, ${k.name}! ${k.done} quests completed — keep that streak!`
      : `Great effort ${k.name}! ${k.inProgress > 0 ? `${k.inProgress} in progress — finish strong!` : 'Almost there!'}`;
    return [k.name, note];
  }));
  return { familyCoachingTip: coachingTip, topPerformer: topKid?.name ?? '', kidEncouragementNotes, suggestedRuleUpdates: [], cheatPatternAlert: null };
}

async function callAutoBalance(quests: any[], kids: any[]) {
  // Alias kid names before sending to AI
  const aliasMap: Record<string, string> = {};
  const reverseAlias: Record<string, string> = {};
  const aliasedKids = kids.map((k, i) => {
    const alias = `Kid${String.fromCharCode(65 + i)}`; // KidA, KidB, …
    aliasMap[k.id] = alias;
    reverseAlias[alias] = k.name;
    return { id: k.id, alias, age: k.age ?? null, role: k.role };
  });

  const aliasedQuests = quests.map(q => ({
    id: q.id,
    title: q.title,
    status: q.status,
    coins: q.coins,
    assignedToAlias: q.assignedToId ? (aliasMap[q.assignedToId] ?? null) : null,
    dueDate: q.dueDate ?? null,
    difficulty: q.difficulty ?? null,
    category: q.category ?? null,
    isPool: q.isPool ?? false,
  }));

  const { data, error } = await supabase.functions.invoke('family-ai', {
    body: { action: 'chore_balance', members: aliasedKids.map(k => ({ ...k, name: k.alias, role: 'kid' })), quests: aliasedQuests },
  });
  if (error) throw error;
  const result = data?.result ?? data;

  // De-alias: replace alias names with real names in AI response
  const deAlias = (s: string) =>
    Object.entries(reverseAlias).reduce((acc, [alias, real]) => acc.replaceAll(alias, real), s);

  return {
    summary: deAlias(result.summary ?? ''),
    assignments: (result.assignments ?? []).map((a: any) => {
      const recommendedKid = kids.find(k => aliasMap[k.id] === a.recommendedKidName) ?? kids.find(k => k.id === a.recommendedKidId);
      const currentKid     = kids.find(k => aliasMap[k.id] === a.currentKidName);
      return {
        questId:          a.questId,
        questTitle:       a.questTitle,
        currentKidId:     currentKid?.id ?? null,
        recommendedKidId: recommendedKid?.id ?? null,
        recommendedKid:   recommendedKid?.name ?? deAlias(a.recommendedKidName ?? ''),
        reason:           deAlias(a.reason ?? ''),
      };
    }),
    newSuggestedQuests: (result.newSuggestedQuests ?? []).map((q: any) => ({
      title:      q.title,
      coins:      q.coins ?? 20,
      reason:     deAlias(q.reason ?? ''),
      ageMin:     q.ageMin ?? null,
      ageMax:     q.ageMax ?? null,
      difficulty: q.difficulty ?? null,
    })),
    balanceReport: result.balanceReport
      ? Object.fromEntries(
          Object.entries(result.balanceReport).map(([alias, v]) => [reverseAlias[alias] ?? alias, v])
        )
      : {},
  };
}

// FOMO engine — references real quest IDs so Apply can write to DB
// ── Real FOMO engine — no fake data, reads live quest state ──────────────────
function buildFomoResult(quests: any[], kids: any[]) {
  const now   = Date.now();
  const today = todayLocal();

  // ── BONUS targets: need positive motivation (no one has acted yet) ──────────
  // Pool bounties with zero claimants — incentivise first grab
  const unclaimedPool = quests.filter(q =>
    q.isPool && q.status === 'todo' && q.participants.length === 0
  );
  // Assigned quests not yet started (status=todo) that are overdue
  const assignedNotStarted = quests.filter(q =>
    !q.isPool && q.status === 'todo' && q.dueDate && q.dueDate <= today
  );

  // ── PENALTY targets: someone dropped the ball after claiming ────────────────
  // Kid claimed the quest (blocked others), then ghosted it → overdue
  const claimedAndGhosted = quests.filter(q =>
    !q.isPool && q.status === 'claimed' && q.dueDate && q.dueDate <= today
  );
  // Kid started (in_progress) but stuck >4h AND already overdue — won't finish
  const stuckOverdue = quests.filter(q =>
    q.status === 'in_progress' && q.claimedAt && q.dueDate && q.dueDate <= today &&
    (now - new Date(q.claimedAt).getTime()) > 4 * 3600_000
  );

  // Flash bonus candidates — only true "no-one-acted" cases, up to 4
  const flashCandidates = [...unclaimedPool, ...assignedNotStarted].slice(0, 4);
  const urgentAlerts = flashCandidates.map((q, i) => {
    const rawBonus    = Math.max(10, Math.min(50, Math.round((q.coins * 0.25) / 5) * 5));
    const hoursLeft   = i < 2 ? 2 : 4;
    const expiresAt   = new Date(now + hoursLeft * 3600_000).toISOString();
    const alreadyHasBonus = q.bonusCoins > 0 && q.bonusExpiresAt && new Date(q.bonusExpiresAt) > new Date();
    const daysOverdue = q.dueDate
      ? Math.max(0, Math.floor((now - parseLocalDate(q.dueDate).getTime()) / 86400_000))
      : 0;
    const fomoMessage = q.isPool
      ? `⚡ Nobody has claimed this yet — +${rawBonus}🪙 flash bonus expires in ${hoursLeft}h!`
      : daysOverdue > 1
        ? `🚨 ${daysOverdue}d overdue and not even started — flash bonus to motivate action in ${hoursLeft}h.`
        : `⏰ Due today and not started — flash bonus expires in ${hoursLeft}h!`;
    return { questId: q.id, questTitle: q.title, bonusCoins: rawBonus, bonusExpiresAt: expiresAt, fomoMessage, alreadyHasBonus };
  });

  // Penalty candidates — ghosted-after-claiming + stuck-overdue, priority-sorted
  const priorityRank = (p: string) => p === 'urgent' ? 3 : p === 'high' ? 2 : p === 'medium' ? 1 : 0;
  const penaltyCandidates = [...claimedAndGhosted, ...stuckOverdue]
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
    .slice(0, 3);

  const penaltyKids = [...kids].sort((a, b) => {
    const load = (k: any) => quests.filter(x => x.assignedToId === k.id && x.status !== 'done' && x.status !== 'approved').length;
    return load(a) - load(b);
  });

  const penaltiesAndForceAssigns = penaltyCandidates.map(q => {
    const currentAssignee = kids.find((k: any) => k.id === q.assignedToId);
    const reassignTarget  = penaltyKids.find((k: any) => k.id !== currentAssignee?.id) ?? penaltyKids[0];
    const daysOver = q.dueDate
      ? Math.max(0, Math.floor((now - parseLocalDate(q.dueDate).getTime()) / 86400_000))
      : 0;
    const isGhosted = q.status === 'claimed';
    return {
      questId:        q.id,
      questTitle:     q.title,
      targetKidId:    reassignTarget?.id,
      targetKidName:  reassignTarget?.name ?? 'the least busy kid',
      currentKidName: currentAssignee?.name,
      daysOverdue:    daysOver,
      penaltyReason:  isGhosted
        ? `${currentAssignee?.name ?? 'A kid'} claimed this quest ${daysOver}d ago then did nothing — blocking others from grabbing it.`
        : `${currentAssignee?.name ?? 'A kid'} started this ${daysOver}d ago and hasn't submitted — now overdue.`,
      action: currentAssignee
        ? `${isGhosted ? 'Ghosted' : 'Stuck'} ${daysOver}d — reassign from ${currentAssignee.name} to ${reassignTarget?.name ?? 'least busy kid'}`
        : `${daysOver}d overdue, no assignee — force-assign to ${reassignTarget?.name ?? 'least busy kid'}`,
    };
  });

  const totalBonus    = flashCandidates.length;
  const totalPenalty  = penaltyCandidates.length;
  const totalIssues   = totalBonus + totalPenalty;
  const fomoNudgeSummary = totalIssues === 0
    ? 'All chores are on track! You can still add flash bonuses to pool bounties to drive faster claims.'
    : `${totalIssues} quest${totalIssues > 1 ? 's need' : ' needs'} attention — ${totalBonus} need a bonus nudge, ${totalPenalty} need a penalty action.`;

  return { fomoNudgeSummary, urgentAlerts, penaltiesAndForceAssigns };
}

async function callFomo(quests: any[], kids: any[]) {
  // Alias kid names before sending
  const aliasMap: Record<string, string> = {};
  const reverseAlias: Record<string, string> = {};
  kids.forEach((k, i) => {
    const alias = `Kid${String.fromCharCode(65 + i)}`;
    aliasMap[k.id] = alias;
    reverseAlias[alias] = k.name;
  });

  const aliasedQuests = quests.map(q => ({
    ...q,
    assignedToId: q.assignedToId ? (aliasMap[q.assignedToId] ?? q.assignedToId) : null,
    participants: (q.participants ?? []).map((p: any) => aliasMap[p] ?? p),
  }));

  const aliasedMembers = kids.map(k => ({ ...k, name: aliasMap[k.id], role: 'kid' }));

  const { data, error } = await supabase.functions.invoke('family-ai', {
    body: { action: 'fomo_engine', quests: aliasedQuests, members: aliasedMembers },
  });
  if (error) throw error;
  const result = data?.result ?? data;

  const deAlias = (s: string) =>
    Object.entries(reverseAlias).reduce((acc, [alias, real]) => acc.replaceAll(alias, real), s ?? '');

  // Re-attach real kid IDs to penalty targets using the alias → id reverse map
  const idByAlias = Object.fromEntries(kids.map(k => [aliasMap[k.id], k.id]));

  return {
    fomoNudgeSummary: deAlias(result.fomoNudgeSummary ?? ''),
    urgentAlerts: (result.urgentAlerts ?? []).map((a: any) => ({
      ...a,
      fomoMessage: deAlias(a.fomoMessage ?? ''),
    })),
    penaltiesAndForceAssigns: (result.penaltiesAndForceAssigns ?? []).map((p: any) => ({
      ...p,
      targetKidId:    idByAlias[p.targetKidId] ?? p.targetKidId,
      currentKidId:   idByAlias[p.currentKidId] ?? p.currentKidId,
      targetKidName:  reverseAlias[p.targetKidName] ?? p.targetKidName,
      currentKidName: reverseAlias[p.currentKidName] ?? p.currentKidName,
      penaltyReason:  deAlias(p.penaltyReason ?? ''),
      action:         deAlias(p.action ?? ''),
      selectionNote:  deAlias(p.selectionNote ?? ''),
    })),
  };
}

async function callAdvice(quests: any[], kids: any[]) {
  const today = todayLocal();

  // Alias kid names before sending to AI
  const aliasMap: Record<string, string> = {};
  const reverseAlias: Record<string, string> = {};
  kids.forEach((k, i) => {
    const alias = `Kid${String.fromCharCode(65 + i)}`;
    aliasMap[k.id] = alias;
    reverseAlias[alias] = k.name;
  });

  // Pre-compute real stats (so AI gets structured data, not raw quests)
  const aliasedMembers = kids.map(k => {
    const assigned   = quests.filter(q => q.assignedToId === k.id);
    const done       = assigned.filter(q => q.status === 'done' || q.status === 'approved').length;
    const overdue    = assigned.filter(q => q.dueDate && q.dueDate <= today && q.status !== 'done' && q.status !== 'approved').length;
    const ghosted    = assigned.filter(q => q.status === 'claimed' && q.dueDate && q.dueDate <= today).length;
    const inProgress = assigned.filter(q => q.status === 'in_progress').length;
    return { name: aliasMap[k.id], age: k.age ?? null, role: 'kid', done, overdue, ghosted, inProgress, totalAssigned: assigned.length };
  });

  const { data, error } = await supabase.functions.invoke('family-ai', {
    body: { action: 'chores_advice', members: aliasedMembers, quests: [] },
  });
  if (error) throw error;
  const result = data?.result ?? data;

  const deAlias = (s: string) =>
    Object.entries(reverseAlias).reduce((acc, [alias, real]) => acc.replaceAll(alias, real), s);

  const rawNotes: Record<string, string> = result.kidEncouragementNotes ?? {};
  const kidEncouragementNotes = Object.fromEntries(
    Object.entries(rawNotes).map(([alias, note]) => [reverseAlias[alias] ?? alias, deAlias(note as string)])
  );

  return {
    familyCoachingTip:    deAlias(result.familyCoachingTip ?? ''),
    topPerformer:         reverseAlias[result.topPerformer] ?? result.topPerformer ?? '',
    kidEncouragementNotes,
    suggestedRuleUpdates: (result.suggestedRuleUpdates ?? []).map(deAlias),
    cheatPatternAlert:    result.cheatPatternAlert ? deAlias(result.cheatPatternAlert) : null,
  };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
// TabStatus and AiTool are imported from ./components/QuestFilters and ./components/AiEngineBanner

export default function QuestsScreen() {
  const { colors, isDark } = useTheme();
  const { questId } = useLocalSearchParams<{ questId?: string }>();
  const { members, activeMemberId, setActiveMember, awardCoins } = useFamilyStore();
  const { quests, claimQuest, submitQuest, approveQuest, declineQuest, reopenQuest, updateQuest, deleteQuest, approveParticipant, declineParticipant, reopenParticipant, reassignQuest, cheerQuest } = useQuestStore();

  const activeMember = members.find(m => m.id === activeMemberId)
    ?? members.find(m => m.role === 'parent') ?? members[0];
  const isParent         = activeMember?.role === 'parent';
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
  const [editTarget,     setEditTarget]     = useState<Quest | null>(null);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [showAddChooser, setShowAddChooser] = useState(false);
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

  const submitWithProof = () => {
    if (!submitTarget) return;
    if (submitTarget.photoRequired && !submissionPhotoUri) {
      Alert.alert('📸 Photo required', 'Add a photo before submitting this chore for review.');
      return;
    }
    submitQuest(submitTarget.id, {
      photoUrl: submissionPhotoUri ?? undefined,
      note: submissionNote.trim() || undefined,
    });
    closeSubmitSheet();
  };

  // Scroll ref — used to reset position on persona switch
  const scrollRef = useRef<ScrollView>(null);

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
    let list = quests;

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

    // GP scope: their own quests, the quests they've sponsored for grandkids,
    // and pool quests (visible only via the Bounty tab below, same as kids).
    // The old `!q.isAdultTask` catch-all showed every kid's regular household
    // chore — noise that had nothing to do with what a GP actually manages.
    // Teens behave like kids for filtering (handled by isKidOrTeen above)
    if (!isParent && !isKidOrTeen) {
      list = list.filter(q =>
        q.isPool ||
        (myId ? isAssignedTo(q, myId) : false) ||
        (q.questType === 'grandparent_quest' && q.sponsorUserId === myId)
      );
    }

    if (kidFilter === 'adults') {
      list = list.filter(q => q.isAdultTask);
    } else if (kidFilter === 'pool') {
      list = list.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask);
    } else if (isKidOrTeen && kidFilter === 'all') {
      // Kid/Teen "My Quests" — only their directly assigned quests (no pool here)
      list = list.filter(q => !q.isPool && myId && isAssignedTo(q, myId));
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
      const [h, m] = q.dueTime.split(':').map(Number);
      return ms + (h * 60 + m) * 60_000;
    };
    list = [...list].sort((a, b) => {
      const doneDiff = Number(isDone(a)) - Number(isDone(b));
      if (doneDiff !== 0) return doneDiff;
      return dueMs(a) - dueMs(b);
    });
    return list;
  }, [quests, kidFilter, tabStatus, isKidOrTeen, activeMember, questId, searchQuery, dateRange]);

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

  // ── Grandparent: sponsored quests (GP-only) ───────────────────────────────────
  const grandparentData = React.useMemo(() => {
    if (!isSenior) return null;
    // The full card for a quest already renders in the list below. This strip is
    // a roll-up for the ones the current filter/tab hides — listing everything
    // showed each sponsored quest twice.
    // createGrandparentQuest never sets createdById (only sponsorUserId) — this
    // strip matched on the wrong field and has been silently empty for every GP.
    const visibleBelow = new Set(filteredQuests.map(q => q.id));
    const sponsored = quests.filter(q =>
      q.questType === 'grandparent_quest' &&
      q.sponsorUserId === myId &&
      !visibleBelow.has(q.id)
    );
    return { sponsored };
  }, [quests, filteredQuests, isSenior, myId]);

  // ── Family Kudos — today's completed quests from kids, cheerable by GP.
  // Kid/teen siblings get the same job done by the dedicated "Sibling Cheer"
  // tab below (with its own animation + own-quest filtering) — showing both
  // here too would be redundant for them.
  const todaysKudos = React.useMemo(() => {
    if (!isSenior) return [];
    const today = todayLocal();
    return quests
      .filter(q =>
        (q.status === 'done' || q.status === 'approved') && !q.isAdultTask &&
        q.assignedToId !== myId &&  // never show my own completed quests — I can't cheer myself
        // Nor a quest this GP sponsored themselves — reviewing it via
        // "Approve & Cheer" already covers the cheer, this list is for
        // celebrating OTHER people's completions, not a second prompt for
        // the same action on your own sponsored quest.
        !(q.questType === 'grandparent_quest' && q.sponsorUserId === myId) &&
        (q.completedAt ?? q.approvedAt ?? '').startsWith(today) &&
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
    cheerQuest(kudosTarget.id, myId ?? '', { note: kudosNote.trim() || undefined, coins });
    if (coins && kudosTarget.assignedToId) awardCoins(kudosTarget.assignedToId, coins, 'gpCoins');
    closeKudosSheet();
  };

  // ── Action handlers ───────────────────────────────────────────────────────────
  const handleClaim = async (id: string) => {
    if (isClaiming[id]) return;
    setIsClaiming(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 700));
    claimQuest(id, activeMember?.id ?? '');
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
    // A kid turning down a grandparent quest releases it back to the family
    // pool rather than killing it — siblings can still pick it up.
    const chore = useChoreStore.getState().chores.find(c => c.id === id);
    if (!memberId && isKid && chore?.categoryType === 'grandparent_quest' && chore.status === 'todo') {
      useChoreStore.getState().declineGrandparentQuest(id, activeMember?.id ?? '', reason);
      // Match the Hub's decline flow: chat is where both the parent and the
      // sponsoring GP will actually see it — the chore's rejectionReason
      // alone (surfaced only in each Hub's own review section) isn't a nudge.
      const sponsorName = members.find(m => m.id === chore.sponsorUserId)?.name.split(' ')[0];
      useChatStore.getState().sendMessage('all', activeMember?.id ?? '',
        `🙏 ${activeMember?.name.split(' ')[0]} can't take "${chore.title}"${sponsorName ? ` from ${sponsorName}` : ''} — "${reason}"`);
      setIsDeclining(p => ({ ...p, [id]: false }));
      return;
    }
    if (memberId) {
      // Per-participant decline
      declineParticipant(id, memberId, activeMember?.id ?? '', reason, 'custom');
    } else {
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
        memberRole={activeMember?.role === 'kid' || activeMember?.role === 'teen' ? 'kid' : activeMember?.role === 'senior' ? 'senior' : 'parent'}
        notifCount={0}
        onPersonaPress={undefined}
        onBellPress={() => {}}
      />

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

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
          {isParent && (
            <TouchableOpacity onPress={() => setShowAddChooser(true)}
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
        {todaysKudos.length > 0 && (
          <View style={{ marginHorizontal: 14, marginBottom: 12 }}>
            <View style={{ backgroundColor: colors.tealLight, borderRadius: 20, borderWidth: 1, borderColor: colors.teal + '30', padding: 14 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: colors.teal, marginBottom: 2 }}>🎉 Family Kudos</Text>
              <Text style={{ fontSize: TYPO.micro, color: colors.success, marginBottom: 10 }}>
                {isSenior ? 'Tap a chore to cheer — with a note, or bonus coins' : 'Tap a chore to send a kudos note'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
                  {todaysKudos.map(q => {
                    const kid = members.find(m => m.id === q.assignedToId);
                    return (
                      <TouchableOpacity key={q.id} onPress={() => handleKudosTap(q)}
                        style={{ backgroundColor: colors.successLight, borderRadius: 16, padding: 10, width: 130, gap: 4 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.success }}>✅ Done</Text>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{q.title}</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.success }}>{kid?.emoji ?? '🧒'} {kid?.name ?? 'Kid'}</Text>
                        {q.coins > 0 && <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.warning }}>+{q.coins} coins</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        )}

        {/* ── Grandparent: Sponsored Quests ── */}
        {isSenior && grandparentData && (
          <View style={{ marginHorizontal: 14, marginBottom: 12, gap: 10 }}>
            {grandparentData.sponsored.length > 0 && (
              <View style={{ backgroundColor: colors.infoLight, borderRadius: 20, borderWidth: 1, borderColor: colors.info + '20', padding: 14 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: colors.info, marginBottom: 8 }}>👴 My Sponsored Chores · elsewhere</Text>
                {grandparentData.sponsored.map(q => {
                  const kid = members.find(m => m.id === q.assignedToId);
                  const statusColor = q.status === 'done' ? colors.success : q.status === 'pending_approval' ? colors.warning : colors.info;
                  return (
                    <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{kid?.emoji ?? '🧒'} {kid?.name ?? 'Unassigned'} · {q.coins} coins</Text>
                      </View>
                      <View style={{ backgroundColor: statusColor + '20', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: statusColor }}>{q.status}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {grandparentData.sponsored.length === 0 && todaysKudos.length === 0 && (
              <View style={[s.seniorBanner, { marginHorizontal: 0 }]}>
                <Text style={s.seniorBannerText}>👴 Tap "Sponsor Chore" to fund a special chore for the grandkids!</Text>
              </View>
            )}
          </View>
        )}

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
          <View style={{ paddingHorizontal: 14, gap: 10 }}>
            {/* Submitted quests waiting for approval — GP/siblings can encourage */}
            {(() => {
              const pendingKidQuests = quests.filter(q =>
                q.status === 'pending_approval' && !q.isAdultTask &&
                q.assignedToId && q.assignedToId !== myId &&
                !members.find(m => m.id === q.assignedToId && (m.role === 'parent' || m.role === 'senior')) &&
                !(q.cheers ?? []).some(c => c.memberId === myId)
              );
              const doneKidQuests = quests.filter(q =>
                (q.status === 'approved' || q.status === 'done') && !q.isAdultTask &&
                q.assignedToId && q.assignedToId !== myId &&
                !members.find(m => m.id === q.assignedToId && (m.role === 'parent' || m.role === 'senior')) &&
                !(q.cheers ?? []).some(c => c.memberId === myId)
              ).slice(0, 5);

              return (
                <>
                  {pendingKidQuests.length > 0 && (
                    <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBord }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Text style={{ fontSize: 16 }}>📬</Text>
                        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Awaiting Review</Text>
                        <View style={{ marginLeft: 'auto', backgroundColor: colors.primary + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.primary }}>{pendingKidQuests.length}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 10 }}>
                        These quests are submitted — send a cheer while the parent reviews!
                      </Text>
                      {pendingKidQuests.map(q => {
                        const kid = members.find(m => m.id === q.assignedToId);
                        return (
                          <View key={q.id} style={{ position: 'relative' }}>
                            {/* Cheer fires after the burst finishes — the store update removes
                                this row from the list, so it must outlive the animation. */}
                            <CelebrationBurst visible={celebratingId === q.id}
                              onDone={() => { cheerQuest(q.id, myId ?? ''); setCelebratingId(null); }} />
                            <View style={[s.cheerRow, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
                                  {kid?.emoji ?? '🧒'} {q.title}
                                </Text>
                                <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
                                  {kid?.name ?? 'Kid'} submitted · {q.coins > 0 ? `${q.coins}🪙` : ''}
                                </Text>
                              </View>
                              <TouchableOpacity disabled={celebratingId === q.id}
                                style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8, opacity: celebratingId === q.id ? 0.6 : 1 }}
                                onPress={() => setCelebratingId(q.id)}
                              >
                                <Text style={{ color: colors.textInverse, fontSize: TYPO.caption, fontWeight: '800' }}>🎉 Cheer!</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {doneKidQuests.length > 0 && (
                    <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBord }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <Text style={{ fontSize: 16 }}>🏆</Text>
                        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Recently Completed</Text>
                      </View>
                      {doneKidQuests.map(q => {
                        const kid = members.find(m => m.id === q.assignedToId);
                        return (
                          <View key={q.id} style={{ position: 'relative' }}>
                            <CelebrationBurst visible={celebratingId === q.id}
                              onDone={() => { cheerQuest(q.id, myId ?? ''); setCelebratingId(null); }} />
                            <View style={[s.cheerRow, { backgroundColor: colors.successLight, borderColor: colors.success + '30' }]}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
                                  {kid?.emoji ?? '🧒'} {q.title}
                                </Text>
                                <Text style={{ fontSize: TYPO.caption, color: colors.success, marginTop: 2 }}>
                                  ✅ {kid?.name ?? 'Kid'} earned {q.coins > 0 ? `+${q.coins}🪙` : 'it'}!
                                </Text>
                                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                                  {fmtDateTime(q.approvedAt ?? q.completedAt)}
                                </Text>
                              </View>
                              <TouchableOpacity disabled={celebratingId === q.id}
                                style={{ backgroundColor: colors.success, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8, opacity: celebratingId === q.id ? 0.6 : 1 }}
                                onPress={() => setCelebratingId(q.id)}
                              >
                                <Text style={{ color: colors.textInverse, fontSize: TYPO.caption, fontWeight: '800' }}>🖐️ High Five!</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {pendingKidQuests.length === 0 && doneKidQuests.length === 0 && (
                    <View style={[s.emptyBox, { backgroundColor: cardBg, borderColor: cardBord }]}>
                      <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>🌟</Text>
                      <Text style={[s.emptyText, { color: colors.textTertiary, textAlign: 'center' }]}>
                        No quests to cheer yet — check back when the kids get busy!
                      </Text>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
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
              ).map(q => {
                const assignee = members.find(m => m.id === q.assignedToId);
                const isPoolCard = q.isPool && q.status === 'todo';
                const isTodoCard = (q.status === 'todo' || q.status === 'claimed') && !isPoolCard;
                const isReview   = q.status === 'pending_approval';
                const isDoneCard = q.status === 'approved' || q.status === 'done';
                const isDeclined = q.status === 'declined';
                const choreData  = useChoreStore.getState().chores.find(c => c.id === q.id);

                // RBAC checks
                const canClaim   = isKidOrTeen && isPoolCard;
                // Submit: kid/teen and it's their own quest
                const canSubmit  = isKidOrTeen && isTodoCard && !!myId && isAssignedTo(q, myId);
                // A declined chore is represented as redo_requested by the
                // chore adapter. The assignee can correct it and submit again.
                const canResubmit = isKidOrTeen && isDeclined && !!myId && isAssignedTo(q, myId);
                // Kid can refuse — teens CANNOT decline (no decline authority)
                const canKidDecline = isKid && isTodoCard && !q.isPool && !!myId && isAssignedTo(q, myId);
                // GP quest sitting at todo — the kid accepts it before it counts as started
                const canAcceptGp = isKid && !!myId && isAssignedTo(q, myId) &&
                  choreData?.categoryType === 'grandparent_quest' && choreData?.status === 'todo';
                // Approve/Decline: parent or senior, quest in review
                const canApprove = isParentOrSenior && isReview;
                // Reopen: parent or senior, quest was declined
                const canReopen  = isParentOrSenior && isDeclined;
                // Full edit: unassigned (no one has claimed it yet) — all fields incl. coins
                const canEditFull       = isParent && (isPoolCard || (q.status === 'todo' && !q.assignedToId));
                // Restricted edit: quest is claimed/in-progress/pending — due date + reassign only, no coins/title
                const canEditRestricted = isParent && !isDoneCard && !isDeclined &&
                  (q.status === 'in_progress' || q.status === 'pending_approval' || (q.status === 'todo' && !!q.assignedToId));
                const canEdit           = isParent && !isDoneCard && !isDeclined;
                // Delete: parent always; GP too, but only their own sponsorship
                // and only before it's done — a kid's completed/paid work isn't theirs to erase.
                const canDelete  = (isParent || (isSenior && q.questType === 'grandparent_quest' && q.sponsorUserId === myId)) && !isDoneCard;

                // Accent colour by status
                const accentColor =
                  isPoolCard    ? BRAND.amber :
                  isDeclined    ? colors.danger :
                  isDoneCard    ? colors.success :
                  isReview      ? BRAND.purple :
                  q.priority === 'urgent' ? colors.danger : BRAND.purple;

                const hasBonus = q.bonusCoins > 0 && (!q.bonusExpiresAt || new Date(q.bonusExpiresAt).getTime() > now);

                // Whether the action strip has ANYTHING to render — with the
                // redundant Edit button gone (long-press covers it now), an
                // otherwise-inert card would show a bare empty divider bar
                // without this gate.
                const hasActionStripContent =
                  canClaim || canAcceptGp ||
                  (canSubmit && !canAcceptGp && q.participants.length <= 1) ||
                  canResubmit || canKidDecline ||
                  (canApprove && q.participants.length <= 1) ||
                  (isPoolCard && isParentOrSenior) ||
                  (isParent && q.isAdultTask && isTodoCard && !q.assignedToId) ||
                  (isSenior && q.questType === 'grandparent_quest' && isTodoCard && !q.assignedToId) ||
                  (isSenior && q.questType === 'grandparent_quest' && isTodoCard && q.assignedToId === activeMember?.id);

                // ── Collapsed header ────────────────────────────────────────────
                const claimantIds    = q.assignedToIds?.length ? q.assignedToIds : (q.assignedToId ? [q.assignedToId] : []);
                const claimants      = claimantIds.map(id => members.find(m => m.id === id)).filter((m): m is typeof members[0] => !!m);
                const avatarSiblings = members.map(m => m.name);
                const AVSIZE    = 30;
                const AVOVERLAP = 16;
                const stackW    = claimants.length > 0 ? AVSIZE + (claimants.length - 1) * AVOVERLAP : 0;

                // Due date chip — urgency coloring
                const dueMsRaw    = q.dueDate ? parseLocalDate(q.dueDate).getTime() : null;
                const todayStart  = new Date(); todayStart.setHours(0, 0, 0, 0);
                const todayEnd    = new Date(); todayEnd.setHours(23, 59, 59, 999);
                const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
                // dueMsRaw is a date-only value parsed at midnight — compare
                // against the start of today (not Date.now()) so a chore
                // due today isn't flagged "overdue" the instant midnight
                // passes, only once its due date is actually in the past.
                const isOverdue   = !!dueMsRaw && dueMsRaw < todayStart.getTime() && !isDoneCard && !isDeclined;
                const isDueToday  = !!dueMsRaw && dueMsRaw <= todayEnd.getTime() && !isOverdue;
                const isDueTomorrow = !!dueMsRaw && dueMsRaw <= tomorrowEnd.getTime() && !isDueToday && !isOverdue;
                const dueColor = isOverdue ? colors.danger : isDueToday ? colors.warning : colors.textSecondary;
                const dueLabel = isOverdue    ? `⚠ ${q.dueDate ? fmtDateShort(q.dueDate) : 'Overdue'}`
                               : isDueToday  ? '⚡ Today'
                               : isDueTomorrow ? 'Tomorrow'
                               : q.dueDate ? fmtDateShort(q.dueDate) : 'Tonight';

                // Status line — concise, no "due" repetition (due is in chip on right)
                const bonusMs = hasBonus && q.bonusExpiresAt ? new Date(q.bonusExpiresAt).getTime() - Date.now() : 0;
                const bonusStatusSuffix = hasBonus && bonusMs > 0
                  ? ` · ⚡ Grab it before bonus ends!`
                  : '';

                const paidSuffix = q.participants.length > 1 ? ` · ${q.participants.length} paid` : q.coins > 0 ? ` · +${q.coins} paid` : '';
                const statusLine = isReview
                  ? `Submitted ${q.submittedAt ? new Date(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'for review'}`
                  : isDoneCard
                    ? `Approved${paidSuffix}`
                    : isDeclined
                      ? 'Declined ❌'
                      : isPoolCard && claimants.length > 1
                        ? `${claimants.length} kids racing for it${bonusStatusSuffix}`
                        : isPoolCard && claimants.length === 1
                          ? `${claimants[0].name} claimed it`
                          : isPoolCard
                            ? `Open — claim it now${bonusStatusSuffix}`
                            : q.claimedAt
                              ? `In progress · ${timeAgo(q.claimedAt)}`
                              : hasBonus
                                ? `Not started${bonusStatusSuffix}`
                                : (q as any).createdAt
                                  ? `Added ${timeAgo((q as any).createdAt)}`
                                  : 'Not started';

                const cardHeader = (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 }}>
                      {/* Overlapping avatar stack */}
                      {claimants.length > 0 && (
                        <View style={{ width: stackW, height: AVSIZE, flexShrink: 0 }}>
                          {claimants.slice(0, 4).map((m, i) => (
                            <View key={m.id} style={{ position: 'absolute', left: i * AVOVERLAP, zIndex: claimants.length - i }}>
                              <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={avatarSiblings} size={AVSIZE} ringColor={accentColor} ringWidth={1.5} />
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Title + status */}
                      <View style={{ flex: 1 }}>
                        <Text style={[s.questTitle, { color: colors.textPrimary }]} numberOfLines={1}>{q.title}</Text>
                        <Text style={{ fontSize: TYPO.label, color: isDoneCard ? colors.success : colors.textSecondary, fontWeight: isDoneCard ? '700' : '400', marginTop: 3 }} numberOfLines={1}>
                          {statusLine}
                        </Text>
                      </View>

                      {/* Right: due chip + coins (done cards show their pill
                          pinned to the card's bottom-right instead — see
                          below — so this column only carries the due chip
                          and in-progress coin pill here). */}
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {(isTodoCard || isPoolCard || isReview) && (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                            backgroundColor: dueColor + '14', borderWidth: 1, borderColor: dueColor + '30' }}>
                            <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: dueColor, letterSpacing: 0.2 }}>{dueLabel}</Text>
                          </View>
                        )}
                        {!isDoneCard && q.coins > 0 && (() => {
                          const role = members.find(m => m.id === q.assignedToId)?.role;
                          const isAdult = role === 'parent' || role === 'senior';
                          const isGPQuest = q.questType === 'grandparent_quest';
                          if (isAdult || isGPQuest || q.isAdultTask) return null;
                          const coinAmt = hasBonus ? q.coins + q.bonusCoins : q.coins;
                          const locked = isReview;
                          const coinColor = locked ? BRAND.purple : BRAND.amber;
                          return (
                            <View style={{
                              flexDirection: 'row', alignItems: 'center', gap: 3,
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
                              backgroundColor: coinColor + '14', borderWidth: 1, borderColor: coinColor + '30',
                            }}>
                              <Text style={{ fontSize: 11 }}>{locked ? '🔒' : '🪙'}</Text>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: coinColor }}>{coinAmt}</Text>
                            </View>
                          );
                        })()}
                      </View>
                    </View>


                    {/* Flash bonus badge — full width, below header row so it never overlaps title */}
                    {hasBonus && q.bonusExpiresAt && (
                      <View style={{ marginTop: 6 }}>
                        <FlashBonusBadge bonusCoins={q.bonusCoins} expiresAt={q.bonusExpiresAt} />
                      </View>
                    )}
                  </View>
                );

                const swipeDeleteAction = (_prog: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
                  const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
                  return (
                    <TouchableOpacity
                      style={{ width: 72, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.danger, borderRadius: 18, marginLeft: 8, marginBottom: 10 }}
                      onPress={() => Alert.alert(
                        'Delete Chore',
                        `Remove "${q.title}"? This cannot be undone.`,
                        [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteQuest(q.id) }]
                      )}
                    >
                      <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
                        <I.Trash c={colors.textInverse} size={20} />
                        <Text style={{ color: colors.textInverse, fontSize: TYPO.micro, fontWeight: '800', marginTop: 2 }}>Delete</Text>
                      </Animated.View>
                    </TouchableOpacity>
                  );
                };

                return (
                  <View key={q.id}>
                  <Swipeable
                    renderRightActions={canDelete ? swipeDeleteAction : undefined}
                    overshootRight={false}
                    friction={2}
                  >
                  <CollapsibleQuestCard accentColor={accentColor} cardBg={cardBg} cardBord={cardBord}
                    onDoubleTap={canEdit ? () => setEditTarget(q) : undefined}
                    onLongPress={canEdit ? () => setEditTarget(q) : undefined}
                    initiallyExpanded={q.id === questId}
                    header={cardHeader}
                    dimmed={isDoneCard}
                  >
                    {/* ── Expanded body — NO title/coin repeat, header already shows them ── */}

                      {/* Progress stepper — single-kid quests only (multi-kid gets per-row stepper below).
                          Once fully settled (approved/declined) the 3-node stepper is past business —
                          a compact one-line summary keeps that history without the tall spread. */}
                      {q.participants.length <= 1 && (!!q.assignedToId || q.claimedAt || q.submittedAt || (q as any).approvedAt || (q as any).declinedAt) && (
                        isDoneCard && (q as any).approvedAt ? (
                          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 2, marginBottom: 6 }}>
                            {q.claimedAt && `Claimed ${new Date(q.claimedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                            {q.claimedAt && (q.submittedAt || (q as any).approvedAt) ? ' → ' : ''}
                            {q.submittedAt && `Submitted ${new Date(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                            {q.submittedAt && (q as any).approvedAt ? ' → ' : ''}
                            {(q as any).approvedAt && `Approved ${new Date((q as any).approvedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                          </Text>
                        ) : (
                          <QuestStepper
                            claimedAt={q.claimedAt}
                            submittedAt={q.submittedAt}
                            approvedAt={(q as any).approvedAt}
                            declinedAt={(q as any).declinedAt}
                            declineReason={q.declineReason}
                            reviewerName={members.find(m => m.id === q.reviewedById)?.name.split(' ')[0]}
                            accentColor={accentColor}
                            isDark={isDark}
                            colors={colors}
                            isAssigned={!!q.assignedToId && !q.claimedAt}
                          />
                        )
                      )}

                      {/* Description */}
                      {q.description ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 20, marginBottom: 10 }}>
                          {q.description}
                        </Text>
                      ) : null}

                      {/* Shopping item list — sourced from chore row (choreStore) or quest row (questStore) */}
                      {(() => {
                        const si = choreData?.shoppingItems ?? q.shoppingItems;
                        const ss = choreData?.shoppingStore ?? q.shoppingStore;
                        const sb = choreData?.shoppingBudget ?? q.shoppingBudget;
                        return (si?.length || ss || sb != null) ? (
                        <View style={{ marginBottom: 10, borderRadius: 10, borderWidth: 1,
                          borderColor: colors.teal + '40',
                          backgroundColor: colors.tealLight, overflow: 'hidden' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
                            borderBottomWidth: si?.length ? 1 : 0,
                            borderBottomColor: colors.teal + '30' }}>
                            <Text style={{ fontSize: 14 }}>🛍️</Text>
                            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.teal }}>
                              {ss ? `Shop at ${ss}` : 'Shopping List'}
                            </Text>
                            {sb != null && (
                              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                                backgroundColor: colors.successLight, borderWidth: 1, borderColor: colors.success }}>
                                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.successDark }}>
                                  Budget ${sb}
                                </Text>
                              </View>
                            )}
                          </View>
                          {si?.map((item, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                              paddingHorizontal: 12, paddingVertical: 7,
                              borderBottomWidth: i < (si.length - 1) ? 1 : 0,
                              borderBottomColor: colors.teal + '20' }}>
                              <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5,
                                borderColor: colors.teal, backgroundColor: 'transparent' }} />
                              <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
                            </View>
                          ))}
                        </View>
                        ) : null;
                      })()}

                      {/* Submitted time + photo proof — stays visible after
                          approval too (not just while In Review), so the
                          proof photo remains available for future reference
                          instead of vanishing the moment a quest is done. */}
                      {(isReview || isDoneCard) && q.submittedAt && (
                        <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.primary + '40', overflow: 'hidden', backgroundColor: colors.primaryLight }}>
                          {/* Submitted banner */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
                            <I.Mail c={colors.primary} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.primary }}>
                                {isDoneCard
                                  ? `${assignee?.name ?? 'Kid'} submitted this`
                                  : `${assignee?.name ?? 'Kid'} submitted for review`}
                              </Text>
                              <Text style={{ fontSize: TYPO.micro + 1, color: colors.primaryDark }}>
                                {fmtDateTime(q.submittedAt)}
                              </Text>
                            </View>
                            {q.photoRequired && !q.photoUrl && (
                              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.warningLight, borderWidth: 1, borderColor: colors.warning }}>
                                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.warningDark }}>No photo</Text>
                              </View>
                            )}
                          </View>
                          {/* Photo thumbnail */}
                          {q.photoUrl ? (
                            <TouchableOpacity onPress={() => setProofPhotoViewerUri(q.photoUrl!)}>
                              <Image
                                source={{ uri: q.photoUrl }}
                                style={{ width: '100%', height: 160, backgroundColor: colors.surface }}
                                resizeMode="cover"
                              />
                              <View style={{ position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                <Text style={{ fontSize: TYPO.micro, color: colors.textInverse, fontWeight: '700' }}>Tap to enlarge</Text>
                              </View>
                            </TouchableOpacity>
                          ) : q.photoRequired ? (
                            <View style={{ height: 80, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.warningLight }}>
                              <I.Photo c={colors.warningDark} size={28} />
                              <Text style={{ fontSize: TYPO.label, color: colors.warningDark, fontWeight: '600' }}>Photo proof missing</Text>
                            </View>
                          ) : null}
                          {/* Completion note */}
                          {q.completionNote ? (
                            <View style={{ padding: 10, paddingTop: 4 }}>
                              <Text style={{ fontSize: TYPO.label, color: colors.primary, fontStyle: 'italic' }}>
                                "{q.completionNote}"
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      )}

                      {/* ── Badge strip — settled/paid cards skip this entirely;
                          category/difficulty/etc are no longer live info
                          once a chore is done, and the header pill already
                          says everything that still matters. ── */}
                      {!isDoneCard && (
                      <>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
                        <View style={[s.badge, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '40' }]}>
                          <Text style={[s.badgeText, { color: colors.primary }]}>{q.category}</Text>
                        </View>
                        {q.priority === 'urgent' && (
                          <View style={[s.badge, { backgroundColor: colors.dangerLight, borderColor: colors.danger + '40' }]}>
                            <Text style={[s.badgeText, { color: colors.danger }]}>🔴 Urgent</Text>
                          </View>
                        )}
                        {q.difficulty && (
                          <View style={[s.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[s.badgeText, { color: colors.textSecondary }]}>
                              {q.difficulty === 'easy' ? '😊' : q.difficulty === 'medium' ? '💪' : q.difficulty === 'hard' ? '🔥' : '⚡'}{' '}
                              {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
                            </Text>
                          </View>
                        )}
                        {isPoolCard && (
                          <View style={[s.badge, { backgroundColor: colors.warningLight, borderColor: BRAND.amber + '60' }]}>
                            <Text style={[s.badgeText, { color: BRAND.amber }]}>⚡ Open Bounty</Text>
                          </View>
                        )}
                        {q.photoRequired && (isTodoCard || isPoolCard) && (
                          <View style={[s.badge, { backgroundColor: colors.warningLight, borderColor: colors.warning + '60' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <I.Photo c={colors.warningDark} size={11} />
                              <Text style={[s.badgeText, { color: colors.warningDark }]}>Photo proof</Text>
                            </View>
                          </View>
                        )}
                        {hasBonus && (() => {
                          let countdownLabel = '';
                          if (q.bonusExpiresAt) {
                            const secsLeft = Math.max(0, Math.floor((new Date(q.bonusExpiresAt).getTime() - now) / 1000));
                            const h = Math.floor(secsLeft / 3600);
                            const m = Math.floor((secsLeft % 3600) / 60);
                            const s = secsLeft % 60;
                            if (h > 0) countdownLabel = ` · ${h}h ${m}m left`;
                            else if (m > 0) countdownLabel = ` · ${m}m ${s}s left`;
                            else countdownLabel = secsLeft > 0 ? ` · ${s}s left` : ' · expired';
                          }
                          return (
                            <View style={[s.badge, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '60' }]}>
                              <Text style={[s.badgeText, { color: colors.warning, fontWeight: '900' }]}>
                                🔥 +{q.bonusCoins}🪙 BONUS{countdownLabel}
                              </Text>
                            </View>
                          );
                        })()}
                      </View>

                      {/* edited-by notice — only when modified */}
                      {q.lastModifiedById && (
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <I.Edit2 c={colors.textTertiary} size={10} />
                          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                            edited by {members.find(m => m.id === q.lastModifiedById)?.name ?? 'parent'}
                          </Text>
                        </View>
                        </Text>
                      )}

                      {/* ── Decline reason ── */}
                      {isDeclined && q.declineReason && (
                        <View style={[s.declineBox, { backgroundColor: colors.dangerLight, borderColor: colors.danger + '60' }]}>
                          <I.AlertCircle c={colors.danger} />
                          <Text style={[s.declineText, { color: colors.danger, flex: 1 }]}>{q.declineReason}</Text>
                        </View>
                      )}

                      </>
                      )}{/* end badge strip */}

                    {/* Parent's private note — inside the expandable body
                        (not a pinned footer) so it only shows once someone
                        actually opens the card, per collapsed-card density. */}
                    {isParent && isDoneCard && (
                      <View style={{ marginBottom: 8 }}>
                        <ParentSelfNoteRow choreId={q.id} initialNote={choreData?.parentNote} colors={colors} isDark={isDark} />
                      </View>
                    )}

                    {/* ── Participant tracker — multi-kid only (single-kid: header + stepper covers it) ── */}
                    {q.participants.length > 1 && (
                      <View style={{ marginBottom: 4 }}>
                        {q.participants.filter(p =>
                          // Kids only see their own participant row; parents/seniors see all
                          isParentOrSenior || p.memberId === activeMember?.id
                        ).map(p => {
                          const pm = members.find(m => m.id === p.memberId);
                          if (!pm) return null;
                          const pSiblings = members.map(m => m.name);
                          const pIsMe = p.memberId === activeMember?.id;
                          const pStatusColor =
                            p.status === 'approved'          ? colors.success
                            : p.status === 'pending_approval' ? BRAND.purple
                            : p.status === 'declined'         ? colors.danger
                            : p.status === 'in_progress'      ? BRAND.amber
                            : colors.textTertiary;
                          const pStatusLabel =
                            p.status === 'approved'          ? `✅ Approved · +${p.coinsAwarded ?? q.coins}🪙`
                            : p.status === 'pending_approval' ? `📬 Submitted${p.submittedAt ? ' · ' + new Date(p.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''}`
                            : p.status === 'declined'         ? `❌ Declined${p.declineReason ? ' — ' + p.declineReason : ''}`
                            : p.status === 'in_progress'      ? `🏃 In progress${p.claimedAt ? ' · ' + timeAgo(p.claimedAt) : ''}`
                            : '○ Not started';
                          return (
                            <View key={p.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, paddingBottom: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <FamilyAvatar name={pm.name} emoji={pm.emoji} avatarUrl={(pm as any).avatarUrl} siblings={pSiblings} size={30} ringColor={pStatusColor} ringWidth={1.5} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }}>{pm.name}</Text>
                                  <Text style={{ fontSize: TYPO.micro + 1, color: pStatusColor }}>{pStatusLabel}</Text>
                                </View>
                                {/* Per-kid actions for parent/senior */}
                                {isParentOrSenior && p.status === 'pending_approval' && (
                                  <View style={{ flexDirection: 'row', gap: 6 }}>
                                    <TouchableOpacity
                                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger }}
                                      onPress={() => setDeclineTarget({ id: q.id, title: q.title, memberId: p.memberId })}
                                    >
                                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>Decline</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success }}
                                      onPress={() => approveParticipant(q.id, p.memberId, activeMember?.id ?? '')}
                                    >
                                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.success }}>Approve ✓</Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                                {isParentOrSenior && p.status === 'declined' && (
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                                    onPress={() => reopenParticipant(q.id, p.memberId, activeMember?.id)}
                                  >
                                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textSecondary }}>Reopen</Text>
                                  </TouchableOpacity>
                                )}
                                {/* Kid's own submit + send-back buttons */}
                                {pIsMe && (p.status === 'todo' || p.status === 'in_progress') && (
                                  <View style={{ flexDirection: 'row', gap: 6 }}>
                                    <TouchableOpacity
                                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '40' }}
                                      onPress={() => Alert.alert(
                                        "Can't do this?",
                                        `Send "${q.title}" back to the family pool so a parent can reassign it?`,
                                        [
                                          { text: 'Keep it', style: 'cancel' },
                                          { text: 'Send back', style: 'destructive', onPress: () => reassignQuest(q.id, '', activeMember?.id) },
                                        ]
                                      )}
                                    >
                                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>Can't do this</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: BRAND.purple + '20', borderWidth: 1, borderColor: BRAND.purple }}
                                      onPress={() => openSubmitSheet(q)}
                                    >
                                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Submit</Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </View>
                              {/* Per-kid progress stepper */}
                              {(p.claimedAt || p.submittedAt || p.approvedAt || p.declinedAt) && (
                                <View style={{ marginLeft: 40, marginTop: 6 }}>
                                  <QuestStepper
                                    claimedAt={p.claimedAt}
                                    submittedAt={p.submittedAt}
                                    approvedAt={p.approvedAt}
                                    declinedAt={p.declinedAt}
                                    declineReason={p.declineReason}
                                    reviewerName={members.find(m => m.id === p.approvedById)?.name.split(' ')[0]}
                                    accentColor={pStatusColor}
                                    isDark={isDark}
                                    colors={colors}
                                  />
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Action strip — pool claim + single-kid fallback + edit hint */}
                    {hasActionStripContent && (
                    <View style={[s.actionStrip, { borderTopColor: colors.border }]}>

                      {/* Kid: Claim open bounty */}
                      {canClaim && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: BRAND.amber, opacity: isClaiming[q.id] ? 0.6 : 1 }]}
                          onPress={() => handleClaim(q.id)}
                          disabled={isClaiming[q.id]}
                        >
                          {isClaiming[q.id]
                            ? <ActivityIndicator color={colors.textInverse} size="small" />
                            : <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Claim Quest</Text>}
                        </TouchableOpacity>
                      )}

                      {/* Kid: opt in to a grandparent quest before working it */}
                      {canAcceptGp && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: colors.success }]}
                          onPress={() => useChoreStore.getState().startGrandparentQuest(q.id, myId ?? '')}
                        >
                          <Text style={[s.actionBtnText, { color: colors.textInverse }]}>🙌 I'll take it</Text>
                        </TouchableOpacity>
                      )}

                      {/* Kid: Submit single-assign quest (multi-assign submits via participant row) */}
                      {canSubmit && !canAcceptGp && q.participants.length <= 1 && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: BRAND.purple }]}
                          onPress={() => openSubmitSheet(q)}
                        >
                          <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Submit for Review</Text>
                        </TouchableOpacity>
                      )}

                      {/* Kid / teen: revise a parent-declined quest and send it back */}
                      {canResubmit && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: BRAND.purple }]}
                          onPress={() => openSubmitSheet(q)}
                        >
                          <Text style={[s.actionBtnText, { color: colors.textInverse }]}>↩ Revise & Resubmit</Text>
                        </TouchableOpacity>
                      )}

                      {/* Kid: Decline / refuse an assigned quest — same label as the Hub's
                          GP-quest card ("Decline") when this is that same choice */}
                      {canKidDecline && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.danger }]}
                          onPress={() => setDeclineTarget({ id: q.id, title: q.title, memberId: undefined })}
                        >
                          <Text style={[s.actionBtnText, { color: colors.danger }]}>{canAcceptGp ? 'Decline' : "Can't do this"}</Text>
                        </TouchableOpacity>
                      )}

                      {/* Parent/senior: Approve + Redo — same actions the Hub's
                          Chore Review board offers, so a parent doesn't have
                          to leave the Quests tab to actually review a
                          submission. Multi-kid quests get this per-row above
                          instead (each participant reviewed independently). */}
                      {canApprove && q.participants.length <= 1 && (
                        <>
                          <TouchableOpacity
                            style={[s.actionBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.danger }]}
                            onPress={() => setDeclineTarget({ id: q.id, title: q.title, memberId: undefined })}
                          >
                            <Text style={[s.actionBtnText, { color: colors.danger }]}>↩ Redo</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, { flex: 2, backgroundColor: colors.success }]}
                            onPress={() => approveQuest(q.id, activeMember?.id ?? '')}
                          >
                            <Text style={[s.actionBtnText, { color: colors.textInverse }]}>✓ Approve</Text>
                          </TouchableOpacity>
                        </>
                      )}

                      {/* A parent-claimable "I'll do this" on a kid bounty
                          pool card was removed — a bounty pool is
                          specifically kid-earning-coins territory; a parent
                          wanting to do the task themselves should mark it
                          Parent Only at creation, not self-claim a kid's
                          chore. Parents/seniors still see the status badge
                          below (claimant count), just no claim action. */}

                      {/* Parent/Senior view of open bounty — show claimant count vs cap */}
                      {isPoolCard && isParentOrSenior && (
                        <View style={[s.paidBadge, { backgroundColor: colors.warningLight, borderColor: BRAND.amber + '50' }]}>
                          <Text style={[s.paidText, { color: BRAND.amber }]}>
                            {q.participants.length === 0
                              ? 'Waiting for a kid to claim'
                              : q.maxClaimants && q.participants.length >= q.maxClaimants
                                ? `Full — ${q.participants.length}/${q.maxClaimants} claimed`
                                : `${q.participants.length} claimed${q.maxClaimants ? ` · ${q.maxClaimants - q.participants.length} spots left` : ''}`}
                          </Text>
                        </View>
                      )}

                      {/* Parent: Take It (self-assign) + Delegate on unassigned adult tasks */}
                      {isParent && q.isAdultTask && isTodoCard && !q.assignedToId && (
                        <>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: BRAND.purple + '18', borderWidth: 1.5, borderColor: BRAND.purple + '50', flex: 1 }]}
                            onPress={() => Alert.alert(
                              'Take It',
                              `Assign "${q.title}" to yourself?`,
                              [{ text: 'Cancel', style: 'cancel' }, {
                                text: "✋ Take It",
                                onPress: () => updateQuest(q.id, { assignedToId: activeMember?.id, isPool: false }, activeMember?.id),
                              }]
                            )}
                          >
                            <Text style={[s.actionBtnText, { color: BRAND.purple }]}>✋ Take It</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, { borderWidth: 1.5, borderColor: BRAND.amber + '60', backgroundColor: 'transparent', flex: 1 }]}
                            onPress={() => setDelegateTarget({ id: q.id, title: q.title })}
                          >
                            <Text style={[s.actionBtnText, { color: BRAND.amber }]}>📤 Delegate</Text>
                          </TouchableOpacity>
                        </>
                      )}

                      {/* GP (senior): claim a grandparent_quest errand */}
                      {isSenior && q.questType === 'grandparent_quest' && isTodoCard && !q.assignedToId && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: BRAND.amber + '18', borderWidth: 1.5, borderColor: BRAND.amber + '60' }]}
                          onPress={() => Alert.alert(
                            'Claim Errand',
                            `Take on "${q.title}"?`,
                            [{ text: 'Cancel', style: 'cancel' }, {
                              text: "I'll take it 👴",
                              onPress: () => updateQuest(q.id, { assignedToId: activeMember?.id, isPool: false }, activeMember?.id),
                            }]
                          )}
                        >
                          <Text style={[s.actionBtnText, { color: BRAND.amber }]}>I'll take it 👴</Text>
                        </TouchableOpacity>
                      )}

                      {/* GP: submit their claimed errand */}
                      {isSenior && q.questType === 'grandparent_quest' && isTodoCard && q.assignedToId === activeMember?.id && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: BRAND.teal }]}
                          onPress={() => openSubmitSheet(q)}
                        >
                          <Text style={[s.actionBtnText, { color: colors.textInverse }]}>Done · Submit</Text>
                        </TouchableOpacity>
                      )}

                      {/* "All done · paid" moved up into the collapsed header
                          (bottom-right, next to the coin/due chips) — no
                          longer duplicated down here in the action strip. */}

                      {/* Edit is reachable via long-press on the card itself
                          (CollapsibleQuestCard's onLongPress) — no separate
                          button needed, one less thing competing for space. */}
                    </View>
                    )}{/* action strip */}
                  </CollapsibleQuestCard>
                  </Swipeable>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <AppBottomSheet
        visible={!!submitTarget}
        onClose={closeSubmitSheet}
        title="Submit quest"
        subtitle={submitTarget?.photoRequired ? 'A photo is required for this chore.' : 'Add a completion note or photo if helpful.'}
        accentColor={BRAND.purple}
        minHeight="75%"
        maxHeight="75%"
        footer={
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TouchableOpacity
              onPress={submitWithProof}
              disabled={submitTarget?.photoRequired && !submissionPhotoUri}
              style={{ alignItems: 'center', borderRadius: 14, paddingVertical: 14,
                backgroundColor: submitTarget?.photoRequired && !submissionPhotoUri ? colors.border : BRAND.purple }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: submitTarget?.photoRequired && !submissionPhotoUri ? colors.textTertiary : '#fff' }}>
                Submit for review
              </Text>
            </TouchableOpacity>
          </View>
        }>
        <View style={{ gap: 14 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>
            {submitTarget?.title}
          </Text>

          <View>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
              Completion note (optional)
            </Text>
            <TextInput
              value={submissionNote}
              onChangeText={setSubmissionNote}
              placeholder="Tell your family what you finished…"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={{ minHeight: 80, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
                backgroundColor: isDark ? colors.surface : '#F8FAFC', padding: 13,
                fontSize: TYPO.body, color: colors.textPrimary, textAlignVertical: 'top' }}
            />
          </View>

          <View>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>
              Photo proof {submitTarget?.photoRequired ? '(required)' : '(optional)'}
            </Text>
            {submissionPhotoUri ? (
              <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                <Image source={{ uri: submissionPhotoUri }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
                <TouchableOpacity onPress={() => setSubmissionPhotoUri(null)}
                  style={{ alignItems: 'center', paddingVertical: 10, backgroundColor: isDark ? colors.surface : '#F8FAFC' }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>Remove photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ borderRadius: 14, padding: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: submitTarget?.photoRequired ? '#F59E0B' : colors.border,
                backgroundColor: submitTarget?.photoRequired ? '#FEF3C710' : 'transparent' }}>
                <Text style={{ fontSize: TYPO.label, color: submitTarget?.photoRequired ? '#D97706' : colors.textTertiary, textAlign: 'center' }}>
                  {submitTarget?.photoRequired ? 'Attach a photo to unlock submission.' : 'No photo attached yet.'}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity onPress={() => selectProofPhoto(true)}
                style={{ flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 12 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>📷 Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => selectProofPhoto(false)}
                style={{ flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 12 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>🖼️ Gallery</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </AppBottomSheet>

      {/* Full-screen review of a submitted photo proof */}
      <Modal
        visible={!!proofPhotoViewerUri}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setProofPhotoViewerUri(null)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setProofPhotoViewerUri(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center', alignItems: 'center' }}>
          {proofPhotoViewerUri && (
            <Image source={{ uri: proofPhotoViewerUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          )}
          <View style={{ position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>Close ✕</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Parent-only: Add Quest modal */}
      {isParent && (
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

      {/* "+" Quest button opens the Speak it/Type it chooser first, matching
          the Hub's own quick-action entry point. */}
      {isParent && (
        <AddIntakeChooser
          visible={showAddChooser}
          kind="quest"
          members={members}
          activeMemberId={activeMember?.id ?? ''}
          onClose={() => setShowAddChooser(false)}
          onTypeManually={(prefill) => {
            setShowAddChooser(false);
            setAddPrefill(prefill);
            setShowAddModal(true);
          }}
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
          editMode={
            editTarget.status === 'todo' && !editTarget.assignedToId ? 'full' :
            editTarget.isPool && editTarget.status === 'todo' ? 'full' : 'restricted'
          }
          onClose={() => setEditTarget(null)}
          onSave={(id, patch) => {
            // Notify assignee via chat when a parent modifies an active quest
            const assigneeId = editTarget.assignedToId;
            if (assigneeId && (editTarget.status === 'in_progress' || editTarget.status === 'pending_approval')) {
              const parentName = activeMember?.name?.split(' ')[0] ?? 'A parent';
              const msg = `📝 ${parentName} updated "${editTarget.title}" — check your quest for the latest details.`;
              useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
            }
            updateQuest(id, patch, activeMember?.id);
            setEditTarget(null);
          }}
          onDelete={(id) => {
            // Notify assignee via chat when a quest is deleted while active
            const assigneeId = editTarget.assignedToId;
            if (assigneeId && (editTarget.status === 'in_progress' || editTarget.status === 'pending_approval')) {
              const parentName = activeMember?.name?.split(' ')[0] ?? 'A parent';
              const msg = `🗑️ ${parentName} removed the quest "${editTarget.title}" that was assigned to you.`;
              useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
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

      {/* Delegate sheet — AppBottomSheet, parents only, no GP force-assign */}
      <AppBottomSheet
        visible={!!delegateTarget}
        onClose={() => setDelegateTarget(null)}
        title={`Delegate: ${delegateTarget?.title ?? ''}`}
        subtitle="Assign to a parent · GPs self-claim"
        accentColor={BRAND.teal}
        minHeight="40%"
        maxHeight="70%">
        <View style={{ gap: 10 }}>
          {members.filter(m => m.role === 'parent').map(m => (
            <Pressable key={m.id} onPress={() => {
              if (delegateTarget) {
                updateQuest(delegateTarget.id, { assignedToId: m.id, isPool: false }, activeMember?.id);
                setDelegateTarget(null);
              }
            }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
              borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
              backgroundColor: isDark ? colors.surface : '#F8FAFC' }}>
              <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
                siblings={members.map(x => x.name)} size={44} ringColor={BRAND.purple} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Parent</Text>
              </View>
              <Text style={{ fontSize: TYPO.caption, color: BRAND.teal, fontWeight: '800' }}>Assign →</Text>
            </Pressable>
          ))}
        </View>
      </AppBottomSheet>

      {/* Kudos sheet — note + (GP-only) optional bonus coins.
          Save button lives inside the scroll body (not a sticky footer) to
          match AddQuestModal/EditQuestModal — that's the pattern AppBottomSheet
          keyboard-avoids correctly; a fixed footer fights the keyboard instead. */}
      <AppBottomSheet
        visible={!!kudosTarget}
        onClose={closeKudosSheet}
        title={`🎉 Kudos for ${members.find(m => m.id === kudosTarget?.assignedToId)?.name?.split(' ')[0] ?? 'them'}`}
        subtitle={kudosTarget?.title}
        accentColor="#00BBA4"
        minHeight="45%">
        <Text style={[aq.label, { color: colors.textSecondary }]}>Kudos note (optional)</Text>
        <TextInput
          value={kudosNote}
          onChangeText={setKudosNote}
          placeholder="Great job on this one!"
          placeholderTextColor={colors.textTertiary}
          multiline maxLength={140}
          style={[aq.input, { color: colors.textPrimary, borderColor: colors.border,
            backgroundColor: colors.surface, minHeight: 80, textAlignVertical: 'top' }]}
        />

        {isSenior && (
          <>
            <Pressable onPress={() => setKudosIncludeCoins(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                padding: 12, borderRadius: 14, borderWidth: 1.5, marginBottom: 12,
                borderColor: kudosIncludeCoins ? '#F59E0B' : colors.border,
                backgroundColor: kudosIncludeCoins ? '#F59E0B18' : 'transparent' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: kudosIncludeCoins ? '#F59E0B' : colors.textPrimary }}>
                  🪙 Include bonus coins
                </Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary, marginTop: 1 }}>Optional — paid from your GP wallet</Text>
              </View>
              <View style={{ width: 40, height: 24, borderRadius: 12,
                backgroundColor: kudosIncludeCoins ? '#F59E0B' : (isDark ? '#334155' : '#CBD5E1'),
                justifyContent: 'center', paddingHorizontal: 3 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                  alignSelf: kudosIncludeCoins ? 'flex-end' : 'flex-start' }} />
              </View>
            </Pressable>
            {kudosIncludeCoins && (
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([5, 10, 20] as const).map(amt => (
                    <Pressable key={amt} onPress={() => { setKudosCoinAmount(amt); setKudosCustomCoins(false); }}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                        borderWidth: 1.5,
                        borderColor: !kudosCustomCoins && kudosCoinAmount === amt ? '#F59E0B' : colors.border,
                        backgroundColor: !kudosCustomCoins && kudosCoinAmount === amt ? '#F59E0B' : 'transparent' }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900',
                        color: !kudosCustomCoins && kudosCoinAmount === amt ? '#fff' : colors.textSecondary }}>+{amt} 🪙</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => setKudosCustomCoins(true)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: kudosCustomCoins ? '#F59E0B' : colors.border,
                      backgroundColor: kudosCustomCoins ? '#F59E0B' : 'transparent' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '900',
                      color: kudosCustomCoins ? '#fff' : colors.textSecondary }}>Custom</Text>
                  </Pressable>
                </View>
                {kudosCustomCoins && (
                  <TextInput
                    style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 10, marginBottom: 0 }]}
                    keyboardType="number-pad"
                    placeholder="Enter coin amount"
                    placeholderTextColor={colors.textTertiary}
                    value={kudosCustomText}
                    onChangeText={t => setKudosCustomText(t.replace(/[^0-9]/g, ''))}
                    autoFocus
                  />
                )}
              </View>
            )}
          </>
        )}

        <TouchableOpacity onPress={handleSendKudos}
          style={{ backgroundColor: '#00BBA4', borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '900' }}>
            Send Kudos {isSenior && kudosIncludeCoins && (kudosCustomCoins ? kudosCustomText : kudosCoinAmount)
              ? `· +${kudosCustomCoins ? (parseInt(kudosCustomText, 10) || 0) : kudosCoinAmount} 🪙` : '🎉'}
          </Text>
        </TouchableOpacity>
      </AppBottomSheet>
    </SafeAreaView>
  );
}

