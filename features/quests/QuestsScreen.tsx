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
  TextInput, Modal, ActivityIndicator, Alert, Platform, Image, Animated, Switch, KeyboardAvoidingView,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/questStore';
import type { Quest, QuestCategory, QuestDifficulty } from '@/store/questStore';
import AppHeader from '@/components/AppHeader';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { fmtDateShort, todayLocal, localDateStr } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/store/chatStore';
import { fetchCustomCategories, fetchCustomSuggestions, recordCustomSuggestion, CustomCategory } from '@/lib/familyCustomCategories';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_ITEMS, DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { AiEngineBanner, AiTool } from './components/AiEngineBanner';
import { QuestFilters, TabStatus } from './components/QuestFilters';

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  PlusCircle: ({ c }: { c: string }) => (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,16 M8,12 L16,12" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  ThumbsUp: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M14,9 V5 C14,3.3 12.7,2 11,2 L7,13 V22 H18.3 C19.3,22 20.1,21.3 20.3,20.3 L21.7,12.3 C21.9,11 20.9,10 19.6,10 H14 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M7,13 H4 C2.9,13 2,13.9 2,15 V20 C2,21.1 2.9,22 4,22 H7" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Camera: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M23,19 C23,20.1 22.1,21 21,21 H3 C1.9,21 1,20.1 1,19 V8 C1,6.9 1.9,6 3,6 H7 L9,3 H15 L17,6 H21 C22.1,6 23,6.9 23,8 Z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={4} stroke={c} strokeWidth={2} fill="none" />
    </Svg>
  ),
  CheckCircle: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8,13 L11,16 L16,8" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Bot: ({ c }: { c: string }) => (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={3} y={8} width={18} height={13} rx={2} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M9,3 L12,3 M12,3 L15,3 M12,3 L12,8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={9} cy={14} r={1.5} fill={c} />
      <Circle cx={15} cy={14} r={1.5} fill={c} />
      <Path d="M9,18 C9,17 10.3,16 12,16 C13.7,16 15,17 15,18" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Sparkles: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12,2 L14.5,9.5 L22,12 L14.5,14.5 L12,22 L9.5,14.5 L2,12 L9.5,9.5 Z" stroke={c} strokeWidth={1.5} fill={c} strokeLinejoin="round" />
    </Svg>
  ),
  Flame: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12,22 C8.7,22 6,19.3 6,16 C6,12 9,9 10,8 C10,10 12,11 12,13 C13.5,11.5 14,9.5 13,8 C15,9 18,12 18,16 C18,19.3 15.3,22 12,22 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  Award: ({ c }: { c: string }) => (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={6} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M8.2,14.2 L6,22 L12,19 L18,22 L15.8,14.2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  AlertCircle: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12,8 L12,13 M12,16 L12,17" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  RotateCcw: ({ c }: { c: string }) => (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M1,4 L1,10 L7,10" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M3.5,15 C4.8,18.3 8,20.5 11.8,20.5 C16.8,20.5 20.8,16.5 20.8,11.5 C20.8,6.5 16.8,2.5 11.8,2.5 C8,2.5 4.8,4.7 3.5,8 L1,4" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  X: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6,6 L18,18 M18,6 L6,18" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Check: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5,13 L9,17 L19,7" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Zap: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13,2 L4.5,13.5 H11 L11,22 L19.5,10.5 H13 L13,2 Z" stroke={c} strokeWidth={1.5} fill={c} strokeLinejoin="round" />
    </Svg>
  ),
  Coins: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={9} r={7} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M15.5,5.5 C18.5,6.5 20.5,9.3 20.5,12.5 C20.5,16.6 17.1,20 13,20 C10.5,20 8.3,18.8 7,17" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M9,6.5 L9,9 L11,9.5" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Photo: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M23,19 C23,20.1 22.1,21 21,21 H3 C1.9,21 1,20.1 1,19 V8 C1,6.9 1.9,6 3,6 H7 L9,3 H15 L17,6 H21 C22.1,6 23,6.9 23,8 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={4} stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Trash: ({ c, size = 14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3,6 L21,6 M19,6 L18,20 C18,21.1 17.1,22 16,22 H8 C6.9,22 6,21.1 6,20 L5,6" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M9,6 L9,4 C9,3.4 9.4,3 10,3 H14 C14.6,3 15,3.4 15,4 L15,6" stroke={c} strokeWidth={1.5} fill="none" />
    </Svg>
  ),
  Mail: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4,4 H20 C21.1,4 22,4.9 22,6 V18 C22,19.1 21.1,20 20,20 H4 C2.9,20 2,19.1 2,18 V6 C2,4.9 2.9,4 4,4 Z" stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M22,6 L12,13 L2,6" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  ChevronUp: ({ c, size = 16 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18,15 L12,9 L6,15" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  ChevronDown: ({ c, size = 16 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6,9 L12,15 L18,9" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  User: ({ c, size = 13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={c} strokeWidth={1.5} fill="none" />
      <Path d="M4,20 C4,16.7 7.6,14 12,14 C16.4,14 20,16.7 20,20" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Edit2: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M11,4 H4 C2.9,4 2,4.9 2,6 V20 C2,21.1 2.9,22 4,22 H18 C19.1,22 20,21.1 20,20 V13" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d="M18.5,2.5 C19.3,1.7 20.7,1.7 21.5,2.5 C22.3,3.3 22.3,4.7 21.5,5.5 L12,15 L8,16 L9,12 L18.5,2.5 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  ),
  AlertTriangle: ({ c, size = 12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10.3,3.3 L2.2,18 C1.7,18.9 2.4,20 3.5,20 H20.5 C21.6,20 22.3,18.9 21.8,18 L13.7,3.3 C13.2,2.4 10.8,2.4 10.3,3.3 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d="M12,9 L12,13 M12,16 L12,17" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
};

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
      ? Math.max(0, Math.floor((now - new Date(q.dueDate).getTime()) / 86400_000))
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
      ? Math.max(0, Math.floor((now - new Date(q.dueDate).getTime()) / 86400_000))
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
    ? 'All quests are on track! You can still add flash bonuses to pool bounties to drive faster claims.'
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

// ─── DECLINE PRESETS ──────────────────────────────────────────────────────────
const DECLINE_PRESETS = [
  'The chore wasn\'t done properly — please redo it',
  'Photo proof is missing or unclear',
  'You didn\'t complete all the steps',
  'Please try again before tonight',
];

// ─── Decline Modal ─────────────────────────────────────────────────────────────
function DeclineModal({ visible, questTitle, onConfirm, onCancel, colors, isDark }: {
  visible: boolean; questTitle: string;
  onConfirm: (reason: string) => void; onCancel: () => void;
  colors: any; isDark: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom]     = useState('');
  const finalReason = custom.trim() || selected;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={dm.backdrop}>
        <View style={[dm.sheet, { backgroundColor: colors.card }]}>
          <View style={[dm.handle, { backgroundColor: colors.border }]} />
          <Text style={[dm.title, { color: colors.textPrimary }]}>Decline Quest</Text>
          <Text style={[dm.sub, { color: colors.textSecondary }]} numberOfLines={1}>"{questTitle}"</Text>

          <Text style={[dm.label, { color: colors.textSecondary }]}>Select a reason:</Text>
          {DECLINE_PRESETS.map(r => (
            <TouchableOpacity
              key={r}
              style={[dm.preset, { borderColor: selected === r ? '#EF4444' : colors.border, backgroundColor: selected === r ? '#FEE2E230' : 'transparent' }]}
              onPress={() => { setSelected(r); setCustom(''); }}
            >
              <Text style={[dm.presetText, { color: selected === r ? '#EF4444' : colors.textSecondary }]}>{r}</Text>
            </TouchableOpacity>
          ))}

          <Text style={[dm.label, { color: colors.textSecondary, marginTop: 8 }]}>Or write your own:</Text>
          <TextInput
            style={[dm.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Explain to the kid why you're declining..."
            placeholderTextColor={colors.textTertiary}
            value={custom}
            onChangeText={t => { setCustom(t.slice(0, 200)); setSelected(''); }}
            multiline maxLength={200}
          />
          <Text style={[dm.charCount, { color: colors.textTertiary }]}>{custom.length}/200</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[dm.btn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={onCancel}>
              <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: TYPO.caption }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dm.btn, { flex: 2, backgroundColor: finalReason ? '#EF4444' : colors.border }]}
              onPress={() => finalReason && onConfirm(finalReason)}
              disabled={!finalReason}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.caption }}>Decline Quest</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const dm = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:       { fontSize: TYPO.subheading, fontWeight: '900', marginBottom: 2 },
  sub:         { fontSize: TYPO.label, marginBottom: 14 },
  label:       { fontSize: TYPO.label, fontWeight: '700', marginBottom: 6 },
  preset:      { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 7 },
  presetText:  { fontSize: TYPO.caption, fontWeight: '600' },
  input:       { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: TYPO.caption, minHeight: 60, marginTop: 4 },
  charCount:   { fontSize: TYPO.micro + 1, textAlign: 'right', marginTop: 2 },
  btn:         { borderRadius: 14, padding: 13, alignItems: 'center' },
});

// ─── Add Quest Modal ──────────────────────────────────────────────────────────
const ALL_CATEGORIES: QuestCategory[] = ['Kitchen', 'Room', 'Yard', 'School', 'Pet', 'Living Room', 'Garage', 'Bathroom', 'Laundry', 'Errand', 'Tech', 'Finance', 'Health', 'Garden', 'Car', 'Shopping', 'Cooking', 'Social', 'Creative', 'Other'];


// ─── Collapsible quest card — header always visible, body expands on tap ─────
function CollapsibleQuestCard({
  accentColor, cardBg, cardBord, header, children, onDoubleTap,
}: {
  accentColor: string; cardBg: string; cardBord: string;
  header: React.ReactNode; children: React.ReactNode;
  onDoubleTap?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastTap = React.useRef(0);
  const handlePress = () => {
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < 320) {
      onDoubleTap();
    } else {
      setExpanded(e => !e);
    }
    lastTap.current = now;
  };
  return (
    <View style={[s.questCard, { backgroundColor: cardBg, borderColor: cardBord }]}>
      <View style={[s.accentBar, { backgroundColor: accentColor }]} />
      <View style={{ flex: 1 }}>
        <Pressable onPress={handlePress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingBottom: expanded ? 0 : 14 }}>
          <View style={{ flex: 1 }}>{header}</View>
          {expanded ? <I.ChevronUp c={accentColor} /> : <I.ChevronDown c={accentColor} />}
        </Pressable>
        {expanded && (
          <View style={{ padding: 14, paddingTop: 10 }}>
            {children}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Quest title suggestion bank (category-tagged for auto-select) ────────────
const QUEST_SUGGESTIONS: { title: string; category: QuestCategory; coins: number; desc: string }[] = [
  // Kitchen
  { title: 'Wash the dishes',          category: 'Kitchen',     coins: 20, desc: 'Wash all dishes in the sink, rinse and leave them to dry.' },
  { title: 'Load the dishwasher',      category: 'Kitchen',     coins: 15, desc: 'Load all dirty dishes and run the dishwasher.' },
  { title: 'Unload the dishwasher',    category: 'Kitchen',     coins: 15, desc: 'Put away all clean dishes from the dishwasher.' },
  { title: 'Wipe down the counters',   category: 'Kitchen',     coins: 15, desc: 'Wipe all kitchen counters clean with a cloth.' },
  { title: 'Clean the stovetop',       category: 'Kitchen',     coins: 25, desc: 'Scrub and wipe the stovetop until grease-free.' },
  { title: 'Empty the trash',          category: 'Kitchen',     coins: 10, desc: 'Empty the kitchen trash bin and replace the bag.' },
  { title: 'Take out recycling',       category: 'Kitchen',     coins: 10, desc: 'Collect and take out all recyclables to the bin.' },
  { title: 'Mop the kitchen floor',    category: 'Kitchen',     coins: 30, desc: 'Sweep then mop the kitchen floor until clean.' },
  { title: 'Clean the microwave',      category: 'Kitchen',     coins: 20, desc: 'Wipe inside and outside the microwave thoroughly.' },
  { title: 'Refill the water filter',  category: 'Kitchen',     coins: 10, desc: 'Refill the water filter pitcher and put it back.' },
  // Room / Bedroom
  { title: 'Make your bed',            category: 'Room',        coins: 10, desc: 'Make the bed neatly with pillows in place.' },
  { title: 'Tidy your room',           category: 'Room',        coins: 20, desc: 'Pick up clutter, put items away, and straighten up the room.' },
  { title: 'Vacuum your bedroom',      category: 'Room',        coins: 25, desc: 'Vacuum the entire bedroom floor including under the bed.' },
  { title: 'Organize your closet',     category: 'Room',        coins: 30, desc: 'Sort and organize clothes and items in the closet.' },
  { title: 'Put away clean clothes',   category: 'Room',        coins: 15, desc: 'Fold and put away all clean laundry in the right places.' },
  // Living Room
  { title: 'Vacuum the living room',   category: 'Living Room', coins: 25, desc: 'Vacuum the entire living room including under cushions.' },
  { title: 'Dust the shelves',         category: 'Living Room', coins: 20, desc: 'Dust all shelves, surfaces, and decorative items.' },
  { title: 'Tidy the couch cushions',  category: 'Living Room', coins: 10, desc: 'Fluff and arrange all couch cushions neatly.' },
  { title: 'Wipe down the TV stand',   category: 'Living Room', coins: 15, desc: 'Wipe the TV stand and tidy up cables.' },
  // Bathroom
  { title: 'Clean the toilet',         category: 'Bathroom',    coins: 30, desc: 'Scrub and disinfect the toilet bowl, seat, and exterior.' },
  { title: 'Scrub the bathtub',        category: 'Bathroom',    coins: 35, desc: 'Scrub the bathtub and rinse until clean.' },
  { title: 'Wipe the bathroom mirror', category: 'Bathroom',    coins: 15, desc: 'Clean the bathroom mirror until streak-free.' },
  { title: 'Replace toilet paper',     category: 'Bathroom',    coins: 5,  desc: 'Replace empty rolls and stock spare toilet paper.' },
  { title: 'Empty bathroom trash',     category: 'Bathroom',    coins: 10, desc: 'Empty the bathroom bin and replace the bag.' },
  // Laundry
  { title: 'Do a load of laundry',     category: 'Laundry',     coins: 25, desc: 'Sort, wash, and start a full load of laundry.' },
  { title: 'Move laundry to dryer',    category: 'Laundry',     coins: 10, desc: 'Transfer wet clothes from washer to dryer and start it.' },
  { title: 'Fold the laundry',         category: 'Laundry',     coins: 20, desc: 'Fold all clean dry laundry and set aside for putting away.' },
  { title: 'Iron the clothes',         category: 'Laundry',     coins: 30, desc: 'Iron all clothes that need it and hang them up.' },
  // Yard / Garden
  { title: 'Mow the lawn',             category: 'Yard',        coins: 50, desc: 'Mow the entire lawn and collect the clippings.' },
  { title: 'Rake the leaves',          category: 'Yard',        coins: 40, desc: 'Rake all fallen leaves and bag them for disposal.' },
  { title: 'Water the plants',         category: 'Garden',      coins: 15, desc: 'Water all indoor and outdoor plants thoroughly.' },
  { title: 'Pull out weeds',           category: 'Garden',      coins: 35, desc: 'Pull weeds from the garden beds and dispose of them.' },
  { title: 'Sweep the porch',          category: 'Yard',        coins: 20, desc: 'Sweep the front and back porch clean.' },
  { title: 'Take out the garbage bins',category: 'Yard',        coins: 15, desc: 'Wheel garbage and recycling bins to the curb for pickup.' },
  // Pet
  { title: 'Feed the dog',             category: 'Pet',         coins: 15, desc: 'Give the dog the correct portion of food and fresh water.' },
  { title: 'Walk the dog',             category: 'Pet',         coins: 25, desc: 'Take the dog for a 20–30 minute walk.' },
  { title: 'Clean the litter box',     category: 'Pet',         coins: 20, desc: 'Scoop and clean the litter box, replace litter if needed.' },
  { title: 'Bathe the dog',            category: 'Pet',         coins: 40, desc: 'Give the dog a bath and dry them off properly.' },
  { title: 'Refill pet water bowl',    category: 'Pet',         coins: 10, desc: 'Clean and refill the pet water bowl with fresh water.' },
  // School
  { title: 'Finish homework',          category: 'School',      coins: 30, desc: 'Complete all assigned homework and pack it in the school bag.' },
  { title: 'Read for 20 minutes',      category: 'School',      coins: 20, desc: 'Read a book or assignment for at least 20 minutes.' },
  { title: 'Study for the test',       category: 'School',      coins: 35, desc: 'Study the relevant material for the upcoming test.' },
  { title: 'Organize school bag',      category: 'School',      coins: 10, desc: 'Pack the school bag with everything needed for tomorrow.' },
  // Errands / Shopping
  { title: 'Grocery run',              category: 'Shopping',    coins: 40, desc: 'Go to the grocery store and pick up the items on the list.' },
  { title: 'Pick up dry cleaning',     category: 'Errand',      coins: 20, desc: 'Pick up the dry cleaning and bring it home.' },
  { title: 'Drop off package',         category: 'Errand',      coins: 15, desc: 'Drop off the package at the post office or shipping location.' },
  { title: 'Return library books',     category: 'Errand',      coins: 15, desc: 'Return all overdue or finished library books.' },
  // Cooking
  { title: 'Cook dinner tonight',      category: 'Cooking',     coins: 50, desc: 'Plan and cook a full dinner for the family.' },
  { title: 'Make breakfast',           category: 'Cooking',     coins: 25, desc: 'Prepare a proper breakfast for everyone.' },
  { title: 'Pack school lunches',      category: 'Cooking',     coins: 20, desc: 'Pack healthy lunches for school tomorrow.' },
  { title: 'Bake something special',   category: 'Cooking',     coins: 40, desc: 'Bake a treat or dessert for the family to enjoy.' },
  // Car / Garage
  { title: 'Wash the car',             category: 'Car',         coins: 40, desc: 'Wash and rinse the exterior of the car thoroughly.' },
  { title: 'Vacuum the car interior',  category: 'Car',         coins: 30, desc: 'Vacuum all seats and floor mats inside the car.' },
  { title: 'Organize the garage',      category: 'Garage',      coins: 50, desc: 'Sort and organize items in the garage, clear walkways.' },
  // Tech / Finance / Health
  { title: 'Charge all devices',       category: 'Tech',        coins: 10, desc: 'Plug in and charge all family devices overnight.' },
  { title: 'Back up family photos',    category: 'Tech',        coins: 20, desc: 'Back up recent photos to the cloud or external drive.' },
  { title: 'Pay a bill online',        category: 'Finance',     coins: 15, desc: 'Log in and pay the specified bill before the due date.' },
  { title: 'Go for a 30-min walk',     category: 'Health',      coins: 25, desc: 'Go outside for a brisk 30-minute walk.' },
  // Social / Creative
  { title: 'Write a thank-you card',   category: 'Social',      coins: 20, desc: 'Write a heartfelt thank-you card and send or deliver it.' },
  { title: 'Draw or paint something',  category: 'Creative',    coins: 20, desc: 'Create a drawing or painting to share with the family.' },
];

// Format a Date as "June 25, 2026"
function fmtDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
// Format a Date as "3:30 PM"
function fmtTimeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
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

// ── Quest progress stepper ────────────────────────────────────────────────────
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtDuration(a: string, b: string) {
  const mins = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface StepperProps {
  claimedAt?:   string | null;
  submittedAt?: string | null;
  approvedAt?:  string | null;
  declinedAt?:  string | null;
  declineReason?: string | null;
  accentColor:  string;
  isDark:       boolean;
  colors:       ReturnType<typeof useTheme>['colors'];
}
// ─── Flash Bonus Badge ────────────────────────────────────────────────────────
function FlashBonusBadge({ bonusCoins, expiresAt }: { bonusCoins: number; expiresAt: string }) {
  const [remaining, setRemaining] = useState('');
  const [isCritical, setIsCritical] = useState(false);
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const calc = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setRemaining(''); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setIsCritical(ms < 3600000);
      const sPad = s.toString().padStart(2, '0');
      setRemaining(h > 0 ? `${h}h ${m}m ${sPad}s` : m > 0 ? `${m}m ${sPad}s` : `${sPad}s`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    const speed = isCritical ? 600 : 1100;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.07, duration: speed, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.75, duration: speed, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.00, duration: speed, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1.00, duration: speed, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isCritical]);

  if (!remaining) return null;

  const bg     = isCritical ? '#EF4444' : '#F59E0B';
  const shadow = isCritical ? '#EF4444' : '#F59E0B';

  return (
    <Animated.View style={{
      transform: [{ scale }], opacity,
      shadowColor: shadow, shadowOpacity: 0.65, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
      elevation: 6,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={{ fontSize: 14 }}>🔥</Text>
        <View>
          <Text style={{ fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.8, textTransform: 'uppercase' }}>Bonus ends in</Text>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 0.3, fontVariant: ['tabular-nums'] }}>+{bonusCoins}🪙 · {remaining}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function QuestStepper({ claimedAt, submittedAt, approvedAt, declinedAt, declineReason, accentColor, isDark, colors, isAssigned }: StepperProps & { isAssigned?: boolean }) {
  if (!isAssigned && !claimedAt && !submittedAt && !approvedAt && !declinedAt) return null;

  const finalAt = approvedAt ?? declinedAt;
  const isDeclined = !!declinedAt && !approvedAt;

  type Step = { label: string; time?: string; color: string; done: boolean };

  // When quest is assigned but not yet claimed, show a leading "Assigned" pending step
  const assignedStep: Step | null = isAssigned ? {
    label: 'Assigned',
    time:  undefined,
    color: isDark ? '#334155' : '#CBD5E1',
    done:  false,
  } : null;

  const steps: Step[] = [
    ...(assignedStep ? [assignedStep] : []),
    {
      label: 'Claimed',
      time:  claimedAt  ? fmtTime(claimedAt)  : undefined,
      color: claimedAt  ? accentColor : (isDark ? '#334155' : '#CBD5E1'),
      done:  !!claimedAt,
    },
    {
      label: 'Submitted',
      time:  submittedAt ? fmtTime(submittedAt) : undefined,
      color: submittedAt ? '#818CF8' : (isDark ? '#334155' : '#CBD5E1'),
      done:  !!submittedAt,
    },
    {
      label: isDeclined ? 'Declined' : 'Approved',
      time:  finalAt ? fmtTime(finalAt) : undefined,
      color: isDeclined ? '#EF4444' : (finalAt ? '#10B981' : (isDark ? '#334155' : '#CBD5E1')),
      done:  !!finalAt,
    },
  ];

  // durations between consecutive done steps
  const dur01 = (claimedAt && submittedAt) ? fmtDuration(claimedAt, submittedAt) : null;
  const dur12 = (submittedAt && finalAt)   ? fmtDuration(submittedAt, finalAt)   : null;
  // If assignedStep is inserted at index 0, connectors shift by one position
  const durations = assignedStep ? [null, dur01, dur12] : [dur01, dur12];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, marginBottom: 4 }}>
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          {/* Step node */}
          <View style={{ alignItems: 'center', minWidth: 64 }}>
            {/* Dot */}
            <View style={{
              width: 10, height: 10, borderRadius: 5,
              backgroundColor: step.done ? step.color : 'transparent',
              borderWidth: 1.5,
              borderColor: step.done ? step.color : (isDark ? '#334155' : '#CBD5E1'),
              marginBottom: 4,
            }} />
            {/* Label */}
            <Text style={{ fontSize: 9, fontWeight: '700', color: step.done ? step.color : (isDark ? '#475569' : '#94A3B8'), textAlign: 'center', letterSpacing: 0.3 }}>
              {step.label}
            </Text>
            {/* Time */}
            {step.time ? (
              <Text style={{ fontSize: 9, color: step.done ? step.color : (isDark ? '#475569' : '#94A3B8'), textAlign: 'center', opacity: 0.85 }}>
                {step.time}
              </Text>
            ) : null}
          </View>

          {/* Connector + duration */}
          {i < steps.length - 1 && (
            <View style={{ flex: 1, alignItems: 'center', paddingTop: 4 }}>
              <View style={{ height: 1.5, width: '100%', backgroundColor: durations[i] ? accentColor + '50' : (isDark ? '#1E293B' : '#E2E8F0') }} />
              {durations[i] && (
                <Text style={{ fontSize: 8, color: isDark ? '#64748B' : '#94A3B8', marginTop: 2, fontStyle: 'italic' }}>
                  {durations[i]}
                </Text>
              )}
            </View>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function AddQuestModal({ visible, onClose, activeMemberId }: {
  visible: boolean; onClose: () => void; activeMemberId: string;
}) {
  const { colors, isDark } = useTheme();
  const { addQuest, createParticipants } = useQuestStore();
  const members = useFamilyStore(s => s.members);
  const kids    = members.filter(m => m.role === 'kid');

  const [title,        setTitle]        = useState('');
  const [coins,        setCoins]        = useState('30');
  const [category,     setCategory]     = useState<QuestCategory>('Kitchen');
  const [assignIds,    setAssignIds]    = useState<string[]>([]);
  const [isPool,       setIsPool]       = useState(false);
  const [maxClaimants, setMaxClaimants] = useState<number>(1); // pool: how many kids can claim
  const [photoReq,     setPhotoReq]     = useState(false);
  const [desc,         setDesc]         = useState('');
  const [difficulty,   setDifficulty]   = useState<QuestDifficulty | ''>('');
  const [bonusCoins,   setBonusCoins]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [isAdultTask,       setIsAdultTask]       = useState(false);
  const [customCategories,  setCustomCategories]  = useState<CustomCategory[]>([]);
  const [customSuggestions, setCustomSuggestions] = useState<{ title: string; hint: string }[]>([]);

  // Grocery run attachment (Errand / Shopping categories)
  const [linkGroceries,    setLinkGroceries]    = useState(false);
  const [groceryItems,     setGroceryItems]     = useState<{ id: string; name: string; quantity?: string; storePreference?: string }[]>([]);
  const [selectedItemIds,  setSelectedItemIds]  = useState<Set<string>>(new Set());
  const [newGroceryLines,  setNewGroceryLines]  = useState<{ name: string; qty: string; store: string }[]>([]);
  const [loadingGroceries, setLoadingGroceries] = useState(false);
  const [focusedLineIdx,   setFocusedLineIdx]   = useState<number | null>(null);
  const [focusedField,     setFocusedField]     = useState<'name' | 'store' | null>(null);
  const { pastStores: cachedStores, pastItemNames: cachedItemNames, appendToCache } = useGroceryStore();
  const suggPressing = React.useRef(false);

  const activeMember = members.find(m => m.id === activeMemberId);
  const familyId = activeMember?.familyId ?? '';

  useEffect(() => {
    if (!familyId) return;
    fetchCustomCategories(familyId, 'quest').then(setCustomCategories);
  }, [familyId]);

  useEffect(() => {
    if (!familyId || category !== 'Other') return;
    fetchCustomSuggestions(familyId, 'quest', 'Other').then(setCustomSuggestions);
  }, [familyId, category]);

  const isGroceryCategory = category === 'Errand' || category === 'Shopping';

  useEffect(() => {
    if (!linkGroceries || !familyId) return;
    setLoadingGroceries(true);
    supabase.from('grocery_items')
      .select('id, name, quantity, store_preference')
      .eq('family_id', familyId).eq('is_bought', false).order('store_preference')
      .then(({ data }) => {
        setGroceryItems((data ?? []).map((r: any) => ({
          id: r.id, name: r.name, quantity: r.quantity ?? undefined, storePreference: r.store_preference ?? undefined,
        })));
        setLoadingGroceries(false);
      });
  }, [linkGroceries, familyId]);

  // Dynamic suggestions: system bank for system categories; DB suggestions for Other/custom
  const suggestions = useMemo(() => {
    const isCustomCat = customCategories.some(cc => cc.key === category);
    if (isCustomCat || category === 'Other') {
      const q = title.trim().toLowerCase();
      if (!q) return customSuggestions.slice(0, 8);
      return customSuggestions.filter(s => s.title.toLowerCase().includes(q)).slice(0, 8);
    }
    const q = title.trim().toLowerCase();
    if (!q) return QUEST_SUGGESTIONS.slice(0, 8);
    const words = q.split(/\s+/);
    return QUEST_SUGGESTIONS
      .filter(s => words.every(w => s.title.toLowerCase().includes(w)))
      .slice(0, 8);
  }, [title, category, customSuggestions, customCategories]);

  const applySuggestion = (s: typeof QUEST_SUGGESTIONS[0]) => {
    suggPressing.current = false;
    setTitle(s.title);
    setCategory(s.category);
    setCoins(String(s.coins));
    setDesc(s.desc);
    setTitleFocused(false);
  };

  // Due date/time — default to tomorrow 6 PM
  const defaultDue = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d; };
  const [dueDate,      setDueDate]      = useState<Date>(defaultDue);
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);

  const onDateChange = (_: any, selected?: Date) => {
    setShowDatePick(Platform.OS === 'ios'); // keep open on iOS (inline), close on Android
    if (selected) {
      const merged = new Date(selected);
      merged.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
      setDueDate(merged);
    }
  };

  const onTimeChange = (_: any, selected?: Date) => {
    setShowTimePick(Platform.OS === 'ios');
    if (selected) {
      const merged = new Date(dueDate);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setDueDate(merged);
    }
  };

  const reset = () => {
    setTitle(''); setDesc(''); setCoins('30'); setBonusCoins(''); setDifficulty('');
    setCategory('Kitchen');
    setAssignIds([]); setIsPool(false); setMaxClaimants(1);
    setPhotoReq(false); setDueDate(defaultDue()); setIsAdultTask(false);
    setShowDatePick(false); setShowTimePick(false);
    setLinkGroceries(false); setGroceryItems([]); setSelectedItemIds(new Set()); setNewGroceryLines([]);
    setFocusedLineIdx(null); setFocusedField(null);
  };

  // When adult task toggled on: clear kids from selection, disable pool
  const toggleAdultTask = (val: boolean) => {
    setIsAdultTask(val);
    if (val) {
      setIsPool(false);
      setAssignIds(prev => prev.filter(id => members.find(m => m.id === id)?.role === 'parent'));
    }
  };

  const submit = async () => {
    if (!title.trim() || !desc.trim()) return;
    setSaving(true);
    const bonus       = parseInt(bonusCoins) || 0;
    const isMulti     = !isPool && assignIds.length > 1;
    const newQ = await addQuest({
      title: title.trim(), description: desc.trim(), category, priority: 'medium', difficulty: difficulty || undefined,
      coins: parseInt(coins) || 30, xpReward: 20,
      assignedToId: isPool || isMulti ? undefined : (assignIds[0] || undefined),
      assignedToIds: isMulti ? assignIds : [],
      isPool: !isAdultTask && (isPool || assignIds.length === 0), isDaily: false, recurrence: 'once', status: 'todo',
      dueDate: localDateStr(dueDate),
      dueTime: fmtTimeLabel(dueDate),
      photoRequired: photoReq,
      createdById: activeMemberId,
      isAdultTask,
    });
    if (newQ?.id) {
      if (bonus > 0) useQuestStore.getState().updateQuest(newQ.id, { bonusCoins: bonus });
      // Create participant rows: multi-assign → one per kid; pool → none (kids create on claim)
      if (isMulti && assignIds.length > 0) {
        await createParticipants(newQ.id, assignIds);
      }
      // Store maxClaimants for pool quests
      if (isPool) {
        useQuestStore.getState().updateQuest(newQ.id, { maxClaimants });
      }
    }
    // Record custom suggestion for this family if it's a custom/Other category
    const isCustomCat = customCategories.some(cc => cc.key === category) || category === 'Other';
    if (isCustomCat && title.trim() && familyId) {
      recordCustomSuggestion(familyId, 'quest', category, title.trim());
    }

    // Create grocery run(s) if grocery list was linked
    if (isGroceryCategory && linkGroceries && familyId) {
      const validNewLines = newGroceryLines.filter(l => l.name.trim());
      const hasExisting = selectedItemIds.size > 0;
      if (hasExisting || validNewLines.length > 0) {
        try {
          const newItemsByStore: Record<string, string[]> = {};
          for (const line of validNewLines) {
            const store = line.store.trim() || 'Any store';
            const { data: inserted } = await supabase
              .from('grocery_items')
              .insert({ family_id: familyId, name: line.name.trim(), quantity: line.qty.trim() || null, store_preference: line.store.trim() || null, added_by: activeMemberId, is_bought: false, ai_generated: false })
              .select('id').single();
            if (inserted?.id) {
              if (!newItemsByStore[store]) newItemsByStore[store] = [];
              newItemsByStore[store].push(inserted.id);
            }
          }
          const existingByStore: Record<string, string[]> = {};
          for (const id of selectedItemIds) {
            const item = groceryItems.find(i => i.id === id);
            const store = item?.storePreference || 'Any store';
            if (!existingByStore[store]) existingByStore[store] = [];
            existingByStore[store].push(id);
          }
          const allStores = new Set([...Object.keys(existingByStore), ...Object.keys(newItemsByStore)]);
          for (const store of allStores) {
            const itemIds = [...(existingByStore[store] ?? []), ...(newItemsByStore[store] ?? [])];
            if (!itemIds.length) continue;
            const { data: runRow, error: runErr } = await supabase
              .from('grocery_runs')
              .insert({ family_id: familyId, name: title.trim(), store: store === 'Any store' ? 'Store' : store, status: 'draft', created_by: activeMemberId, planned_at: localDateStr(dueDate) })
              .select('id').single();
            if (!runErr && runRow?.id) {
              await supabase.from('grocery_run_items').insert(itemIds.map(itemId => ({ run_id: runRow.id, item_id: itemId, checked_in_run: false })));
            }
          }
          const newNames  = validNewLines.map(l => l.name.trim()).filter(Boolean);
          const newStores = [...allStores].filter(s => s !== 'Any store');
          if (newNames.length || newStores.length) appendToCache(newNames, newStores);
        } catch (e: any) {
          console.warn('[AddQuestModal] grocery run creation failed', e?.message);
        }
      }
    }

    setSaving(false);
    reset();
    onClose();
  };

  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={aq.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={[aq.sheet, { backgroundColor: colors.card, minHeight: '75%', maxHeight: '92%' }]}>

            {/* ── Fixed: drag handle + header ── */}
            <View style={[aq.handle, { backgroundColor: colors.border }]} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View>
                <Text style={[aq.title, { color: colors.textPrimary }]}>New Quest</Text>
                <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontWeight: '700', marginTop: 1 }}>Assign a chore, bounty, or task</Text>
              </View>
              <TouchableOpacity
                onPress={() => { reset(); onClose(); }}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}
              >
                <I.X c={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Scrollable body ── */}
            <ScrollView keyboardShouldPersistTaps="always" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

            {/* Title */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title *</Text>
            <TextInput
              style={[aq.input, { color: colors.textPrimary, borderColor: title.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
              placeholder="e.g. Wash the dishes, Take out trash…"
              placeholderTextColor={colors.textTertiary}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
              returnKeyType="next"
            />
            {/* Dynamic suggestion pills — always visible */}
            {suggestions.length > 0 && (
              <View style={{ marginTop: -6, marginBottom: 12 }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginBottom: 5, fontWeight: '600' }}>
                  {title.trim() ? 'Matching suggestions' : 'Quick picks — tap to fill'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {suggestions.map((s, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[aq.suggPill, {
                          backgroundColor: title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple + '25' : colors.surface,
                          borderColor:     title.toLowerCase() === s.title.toLowerCase() ? BRAND.purple : colors.border,
                        }]}
                        onPress={() => 'coins' in s ? applySuggestion(s) : setTitle(s.title)}
                      >
                        <Text style={{ fontSize: TYPO.micro + 1, color: colors.textSecondary, fontWeight: '600' }} numberOfLines={1}>
                          {s.title}
                        </Text>
                        {'coins' in s && (
                        <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginLeft: 5 }}>
                          +{s.coins}🪙
                        </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Description — mandatory, max 150 chars */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>
              Description *{'  '}
              <Text style={{ fontWeight: '400', color: colors.textTertiary }}>what needs to be done</Text>
            </Text>
            <TextInput
              style={[aq.input, aq.descInput, { color: colors.textPrimary, borderColor: desc.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
              placeholder="Describe exactly what's expected so there's no confusion…"
              placeholderTextColor={colors.textTertiary}
              value={desc}
              onChangeText={t => setDesc(t.slice(0, 150))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={{ fontSize: TYPO.micro, color: desc.length > 130 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 12 }}>
              {desc.length}/150
            </Text>

            {/* ── Grocery list attachment (Errand / Shopping) ── */}
            {isGroceryCategory && (
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: linkGroceries ? 8 : 0 }}>
                  <Text style={[aq.label, { color: colors.textSecondary, marginBottom: 0 }]}>🛍️ Attach grocery list</Text>
                  <Switch value={linkGroceries} onValueChange={setLinkGroceries}
                    trackColor={{ false: colors.border, true: BRAND.purple + '80' }}
                    thumbColor={linkGroceries ? BRAND.purple : colors.textTertiary} />
                </View>
                {linkGroceries && (
                  <>
                    {/* Existing pending items grouped by store */}
                    {loadingGroceries ? (
                      <ActivityIndicator color={BRAND.purple} style={{ marginVertical: 8 }} />
                    ) : groceryItems.length > 0 ? (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>From your list</Text>
                          <Pressable onPress={() => {
                            if (selectedItemIds.size === groceryItems.length) setSelectedItemIds(new Set());
                            else setSelectedItemIds(new Set(groceryItems.map(i => i.id)));
                          }}>
                            <Text style={{ fontSize: 12, color: BRAND.purple, fontWeight: '700' }}>
                              {selectedItemIds.size === groceryItems.length ? 'Deselect all' : 'Select all'}
                            </Text>
                          </Pressable>
                        </View>
                        {(() => {
                          const groups: Record<string, typeof groceryItems> = {};
                          for (const item of groceryItems) {
                            const key = item.storePreference || 'Any store';
                            if (!groups[key]) groups[key] = [];
                            groups[key].push(item);
                          }
                          return Object.entries(groups)
                            .sort(([a], [b]) => a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b))
                            .map(([store, items]) => {
                              const storeSelected = items.every(i => selectedItemIds.has(i.id));
                              const storePartial  = !storeSelected && items.some(i => selectedItemIds.has(i.id));
                              return (
                                <View key={store} style={{ marginBottom: 10 }}>
                                  <Pressable
                                    onPress={() => {
                                      const next = new Set(selectedItemIds);
                                      if (storeSelected) items.forEach(i => next.delete(i.id));
                                      else items.forEach(i => next.add(i.id));
                                      setSelectedItemIds(next);
                                    }}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                                      backgroundColor: storeSelected ? BRAND.purple + '15' : (storePartial ? BRAND.purple + '08' : isDark ? '#252540' : '#F3F4F6'),
                                      borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 3,
                                      borderWidth: 1, borderColor: storeSelected ? BRAND.purple + '60' : (storePartial ? BRAND.purple + '30' : colors.border) }}
                                  >
                                    <Text style={{ fontSize: 14 }}>🏪</Text>
                                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: storeSelected ? BRAND.purple : colors.textPrimary }}>{store}</Text>
                                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{items.filter(i => selectedItemIds.has(i.id)).length}/{items.length}</Text>
                                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                                      borderColor: (storeSelected || storePartial) ? BRAND.purple : colors.border,
                                      backgroundColor: storeSelected ? BRAND.purple : 'transparent',
                                      alignItems: 'center', justifyContent: 'center' }}>
                                      {storeSelected && <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>✓</Text>}
                                      {storePartial && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND.purple }} />}
                                    </View>
                                  </Pressable>
                                  {items.map(item => {
                                    const selected = selectedItemIds.has(item.id);
                                    return (
                                      <Pressable key={item.id}
                                        onPress={() => { const next = new Set(selectedItemIds); selected ? next.delete(item.id) : next.add(item.id); setSelectedItemIds(next); }}
                                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, paddingLeft: 26,
                                          backgroundColor: selected ? BRAND.purple + '10' : colors.surface,
                                          borderRadius: 8, marginBottom: 2, borderWidth: 1, borderColor: selected ? BRAND.purple + '40' : colors.border }}
                                      >
                                        <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                                          borderColor: selected ? BRAND.purple : colors.border,
                                          backgroundColor: selected ? BRAND.purple : 'transparent',
                                          alignItems: 'center', justifyContent: 'center', marginRight: 9 }}>
                                          {selected && <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>✓</Text>}
                                        </View>
                                        <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: selected ? '600' : '400' }}>{item.name}</Text>
                                        {item.quantity ? <Text style={{ fontSize: 11, color: colors.textSecondary }}>{item.quantity}</Text> : null}
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              );
                            });
                        })()}
                      </>
                    ) : null}

                    {/* New items inline */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: groceryItems.length > 0 ? 8 : 0, marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Add new items</Text>
                      <Pressable onPress={() => setNewGroceryLines(prev => [{ name: '', qty: '', store: '' }, ...prev])}
                        style={{ backgroundColor: BRAND.purple, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 }}>
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>+ Add item</Text>
                      </Pressable>
                    </View>
                    {newGroceryLines.length === 0 ? (
                      <Pressable onPress={() => setNewGroceryLines([{ name: '', qty: '', store: '' }])}
                        style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: BRAND.purple + '60', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                        <Text style={{ color: BRAND.purple, fontSize: 13 }}>+ Tap to add grocery items</Text>
                      </Pressable>
                    ) : newGroceryLines.map((line, idx) => {
                      const allItemPool = [...new Set([...cachedItemNames, ...DEFAULT_GROCERY_ITEMS])];
                      const allStorePool = [...new Set([...cachedStores, ...DEFAULT_GROCERY_STORES])];
                      const nameSuggs  = line.name.trim().length > 0
                        ? allItemPool.filter(n => n.toLowerCase().includes(line.name.toLowerCase()) && n.toLowerCase() !== line.name.toLowerCase()).slice(0, 6)
                        : [];
                      const storeSuggs = line.store.trim().length === 0
                        ? allStorePool.slice(0, 6)
                        : allStorePool.filter(s => s.toLowerCase().includes(line.store.toLowerCase()) && s.toLowerCase() !== line.store.toLowerCase()).slice(0, 6);
                      const showNameSuggs  = focusedLineIdx === idx && focusedField === 'name'  && nameSuggs.length > 0;
                      const showStoreSuggs = focusedLineIdx === idx && focusedField === 'store' && storeSuggs.length > 0;
                      return (
                        <View key={idx} style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                            <TextInput
                              style={[aq.input, { flex: 2.5, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'name' ? BRAND.purple : colors.border, marginBottom: 0 }]}
                              placeholder="Item name" placeholderTextColor={colors.textTertiary}
                              value={line.name}
                              onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, name: v } : l))}
                              onFocus={() => { setFocusedLineIdx(idx); setFocusedField('name'); }}
                              onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                            />
                            <TextInput
                              style={[aq.input, { flex: 1, color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 0 }]}
                              placeholder="Qty" placeholderTextColor={colors.textTertiary}
                              value={line.qty}
                              onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: v } : l))}
                            />
                            <Pressable onPress={() => setNewGroceryLines(prev => prev.filter((_, i) => i !== idx))} style={{ padding: 6 }}>
                              <Text style={{ color: colors.textTertiary, fontSize: 18 }}>×</Text>
                            </Pressable>
                          </View>
                          {showNameSuggs && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginBottom: 4 }}>
                              {nameSuggs.map(s => (
                                <Pressable key={s} onPress={() => { setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, name: s } : l)); setFocusedField(null); }}
                                  style={{ backgroundColor: BRAND.purple + '15', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginRight: 6, borderWidth: 1, borderColor: BRAND.purple + '40' }}>
                                  <Text style={{ fontSize: 12, color: BRAND.purple, fontWeight: '600' }}>{s}</Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          )}
                          <TextInput
                            style={[aq.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: focusedLineIdx === idx && focusedField === 'store' ? BRAND.purple : colors.border, marginBottom: 0 }]}
                            placeholder="🏪 Store (e.g. Walmart)" placeholderTextColor={colors.textTertiary}
                            value={line.store}
                            onChangeText={v => setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, store: v } : l))}
                            onFocus={() => { setFocusedLineIdx(idx); setFocusedField('store'); }}
                            onBlur={() => { setFocusedLineIdx(null); setFocusedField(null); }}
                          />
                          {showStoreSuggs && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 4 }}>
                              {storeSuggs.map(s => (
                                <Pressable key={s} onPress={() => { setNewGroceryLines(prev => prev.map((l, i) => i === idx ? { ...l, store: s } : l)); setFocusedField(null); }}
                                  style={{ backgroundColor: isDark ? '#252540' : '#F3F4F6', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginRight: 6, borderWidth: 1, borderColor: colors.border }}>
                                  <Text style={{ fontSize: 12, color: colors.textPrimary }}>🏪 {s}</Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            )}

            {/* Coins + Photo proof row */}
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 90 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Coins 🪙</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                  keyboardType="number-pad" value={coins} onChangeText={setCoins}
                />
              </View>
              <View style={{ flex: 1, paddingTop: 22 }}>
                <TouchableOpacity
                  style={[aq.toggleRow, { borderColor: photoReq ? BRAND.purple : pillBdr, backgroundColor: photoReq ? BRAND.purple + '18' : pillBg }]}
                  onPress={() => setPhotoReq(p => !p)}
                >
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: photoReq ? BRAND.purple : colors.textSecondary }}>
                    {photoReq ? '📷 Photo Required' : '📷 Photo Optional'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Hardness + Bonus — same row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Hardness <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
                <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                  {([
                    { key: 'easy',   label: '😊',  color: '#10B981' },
                    { key: 'medium', label: '💪',  color: BRAND.amber },
                    { key: 'hard',   label: '🔥',  color: '#EF4444' },
                    { key: 'hero',   label: '⚡',  color: BRAND.purple },
                  ] as { key: QuestDifficulty; label: string; color: string }[]).map(d => (
                    <TouchableOpacity
                      key={d.key}
                      style={[aq.diffChip, {
                        borderColor: difficulty === d.key ? d.color : pillBdr,
                        backgroundColor: difficulty === d.key ? d.color + '22' : pillBg,
                      }]}
                      onPress={() => setDifficulty(prev => prev === d.key ? '' : d.key)}
                    >
                      <Text style={{ fontSize: TYPO.label }}>{d.label}</Text>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: difficulty === d.key ? d.color : colors.textTertiary, marginLeft: 2 }}>
                        {d.key.charAt(0).toUpperCase() + d.key.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ width: 90 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Bonus 🎉</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: bonusCoins ? BRAND.amber : colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
                  keyboardType="number-pad"
                  placeholder="+coins"
                  placeholderTextColor={colors.textTertiary}
                  value={bonusCoins}
                  onChangeText={t => setBonusCoins(t.replace(/[^0-9]/g, ''))}
                />
                {!!bonusCoins && parseInt(bonusCoins) > 0 && (
                  <Text style={{ fontSize: TYPO.micro, color: BRAND.amber, fontWeight: '700', marginTop: 3 }}>
                    Total: {(parseInt(coins)||0)+(parseInt(bonusCoins)||0)}🪙
                  </Text>
                )}
              </View>
            </View>

            {/* Category */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[...ALL_CATEGORIES, ...customCategories.filter(cc => !ALL_CATEGORIES.includes(cc.key as QuestCategory)).map(cc => cc.key as QuestCategory)].map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[aq.catChip, { borderColor: pillBdr, backgroundColor: pillBg },
                      category === c && { backgroundColor: BRAND.purple, borderColor: BRAND.purple }]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '700', color: category === c ? '#fff' : colors.textSecondary }}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Due Date + Time */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Due Date & Time</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {/* Date pill */}
              <TouchableOpacity
                style={[aq.datePill, { backgroundColor: showDatePick ? BRAND.purple + '20' : pillBg, borderColor: showDatePick ? BRAND.purple : pillBdr }]}
                onPress={() => { setShowDatePick(p => !p); setShowTimePick(false); }}
              >
                <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>📅</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showDatePick ? BRAND.purple : colors.textPrimary }}>
                  {fmtDateLabel(dueDate)}
                </Text>
              </TouchableOpacity>

              {/* Time pill */}
              <TouchableOpacity
                style={[aq.datePill, { backgroundColor: showTimePick ? BRAND.purple + '20' : pillBg, borderColor: showTimePick ? BRAND.purple : pillBdr }]}
                onPress={() => { setShowTimePick(p => !p); setShowDatePick(false); }}
              >
                <Text style={{ fontSize: TYPO.label, marginRight: 4 }}>🕐</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: showTimePick ? BRAND.purple : colors.textPrimary }}>
                  {fmtTimeLabel(dueDate)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Picker overlay — floats above form, no layout shift */}
            {(showDatePick || showTimePick) && (
              <Modal transparent animationType="fade" visible onRequestClose={() => { setShowDatePick(false); setShowTimePick(false); }}>
                <TouchableOpacity style={aq.pickerOverlay} activeOpacity={1} onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                  <TouchableOpacity activeOpacity={1} style={[aq.pickerCard, { backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: colors.textPrimary }}>
                        {showDatePick ? '📅 Pick a Date' : '🕐 Pick a Time'}
                      </Text>
                      <TouchableOpacity onPress={() => { setShowDatePick(false); setShowTimePick(false); }}>
                        <Text style={{ color: BRAND.purple, fontWeight: '900', fontSize: TYPO.body }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    {showDatePick && (
                      <DateTimePicker
                        value={dueDate}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={onDateChange}
                        textColor={colors.textPrimary}
                        style={{ height: 180, width: '100%' }}
                      />
                    )}
                    {showTimePick && (
                      <DateTimePicker
                        value={dueDate}
                        mode="time"
                        display="spinner"
                        is24Hour={false}
                        onChange={onTimeChange}
                        textColor={colors.textPrimary}
                        style={{ height: 180, width: '100%' }}
                      />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}

            {/* Adult Task toggle */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginBottom: 14,
                backgroundColor: isAdultTask ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? colors.surface : '#F8FAFC'),
                borderWidth: 1.5, borderColor: isAdultTask ? BRAND.purple : colors.border }}
              onPress={() => toggleAdultTask(!isAdultTask)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: isAdultTask ? BRAND.purple : colors.textPrimary }}>
                  👨‍👩 Adult Task
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  Only visible to parents — hidden from kids
                </Text>
              </View>
              <View style={{ width: 44, height: 26, borderRadius: 13,
                backgroundColor: isAdultTask ? BRAND.purple : (isDark ? '#334155' : '#CBD5E1'),
                justifyContent: 'center', paddingHorizontal: 3 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                  alignSelf: isAdultTask ? 'flex-end' : 'flex-start' }} />
              </View>
            </TouchableOpacity>

            {/* Assign To — avatar circles, multi-select */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>
              Assign To{'  '}
              <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
                {isPool ? 'open to anyone' : assignIds.length === 0 ? 'tap to select' : assignIds.length > 1 ? `${assignIds.length} selected` : '1 selected'}
              </Text>
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ flexDirection: 'row', gap: 12, paddingRight: 4 }}>
              {/* Open Bounty — hidden for adult tasks */}
              {!isAdultTask && <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} onPress={() => { setIsPool(true); setAssignIds([]); }}>
                <View style={{ position: 'relative' }}>
                  <FamilyAvatar
                    name="Bounty"
                    emoji="⚡"
                    size={40}
                    ringColor={BRAND.amber}
                    ringWidth={isPool ? 2.5 : 1}
                    bgColor={isPool ? BRAND.amber + '30' : pillBg}
                  />
                  {isPool && (
                    <View style={[aq.avatarCheck, { backgroundColor: BRAND.amber }]}>
                      <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: isPool ? BRAND.amber : colors.textTertiary }}>Bounty</Text>
              </TouchableOpacity>}

              {/* Family members — parents only for adult tasks */}
              {members
                .filter(m => isAdultTask ? m.role === 'parent' : (m.role === 'kid' || m.role === 'parent' || m.role === 'senior'))
                .map(m => {
                  const sel       = assignIds.includes(m.id) && !isPool;
                  const roleColor = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? '#0EA5E9' : '#10B981';
                  const siblings  = members.map(x => x.name);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={{ alignItems: 'center', gap: 4 }}
                      onPress={() => {
                        setIsPool(false);
                        setAssignIds(prev =>
                          prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                        );
                      }}
                    >
                      <View style={{ position: 'relative' }}>
                        <FamilyAvatar
                          name={m.name}
                          emoji={m.emoji}
                          avatarUrl={(m as any).avatarUrl}
                          siblings={siblings}
                          size={40}
                          ringColor={roleColor}
                          ringWidth={sel ? 2.5 : 1}
                          bgColor={sel ? roleColor + '25' : pillBg}
                        />
                        {sel && (
                          <View style={[aq.avatarCheck, { backgroundColor: roleColor }]}>
                            <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? roleColor : colors.textTertiary }} numberOfLines={1}>
                        {m.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            {/* Pool: max claimants picker */}
            {isPool && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>
                  How many kids can claim?{'  '}
                  <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
                    {maxClaimants === 0 ? 'unlimited' : maxClaimants === 1 ? 'first come, first served' : `up to ${maxClaimants} kids`}
                  </Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[1, 2, 3, 0].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', borderWidth: 1.5,
                        borderColor: maxClaimants === n ? BRAND.amber : isDark ? '#1E293B' : '#E2E8F0',
                        backgroundColor: maxClaimants === n ? BRAND.amber + '20' : isDark ? '#0F172A' : '#F8FAFC' }}
                      onPress={() => setMaxClaimants(n)}
                    >
                      <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: maxClaimants === n ? BRAND.amber : colors.textSecondary }}>
                        {n === 0 ? '∞' : n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Multi-assign notice */}
            {!isPool && assignIds.length > 1 && (
              <View style={{ marginBottom: 14, padding: 10, borderRadius: 12, backgroundColor: isDark ? '#0F172A' : '#F0FDF4', borderWidth: 1, borderColor: '#10B98130' }}>
                <Text style={{ fontSize: TYPO.label, color: '#059669', fontWeight: '700' }}>
                  ✅ {assignIds.length} kids assigned — each tracked independently
                </Text>
                <Text style={{ fontSize: TYPO.micro + 1, color: isDark ? '#6EE7B7' : '#047857', marginTop: 2 }}>
                  Each earns +{coins || '30'}🪙 when their own submission is approved
                </Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[aq.submitBtn, { backgroundColor: title.trim() && desc.trim() ? '#059669' : colors.border, opacity: saving ? 0.6 : 1 }]}
              onPress={submit} disabled={saving || !title.trim() || !desc.trim()}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>Add Quest to Board</Text>
                    <Text style={{ color: '#A7F3D0', fontSize: TYPO.label, marginTop: 2 }}>
                      Due {fmtDateLabel(dueDate)} at {fmtTimeLabel(dueDate)}
                    </Text>
                  </>}
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const aq = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12 },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title:      { fontSize: TYPO.subheading, fontWeight: '900' },
  label:      { fontSize: TYPO.label, fontWeight: '700', marginBottom: 5 },
  input:      { borderWidth: 1, borderRadius: 12, padding: 10, fontSize: TYPO.caption, marginBottom: 12 },
  catChip:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  toggleRow:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  avatarCheck:{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  datePill:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flex: 1 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  pickerCard:    { borderRadius: 20, overflow: 'hidden', paddingBottom: 12 },
  suggPill:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 220 },
  diffChip:   { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5 },
  descInput:  { minHeight: 72, marginBottom: 4 },
  submitBtn:  { borderRadius: 14, padding: 14, alignItems: 'center' },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

// ─── Edit Quest Modal (parent, unclaimed quests only) ────────────────────────
function EditQuestModal({ quest, activeMemberId, onClose, onSave, onDelete, editMode = 'full' }: {
  quest: Quest;
  activeMemberId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Quest>) => void;
  onDelete?: (id: string) => void;
  editMode?: 'full' | 'restricted'; // restricted = assigned todo — only coins + reassign editable
}) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const kids    = members.filter(m => m.role === 'kid');

  const [title,      setTitle]      = useState(quest.title);
  const [desc,       setDesc]       = useState(quest.description ?? '');
  const [coins,      setCoins]      = useState(String(quest.coins));
  const [bonusCoins, setBonusCoins] = useState(quest.bonusCoins > 0 ? String(quest.bonusCoins) : '');
  const [category,   setCategory]   = useState<QuestCategory>(quest.category);
  const [difficulty, setDifficulty] = useState<QuestDifficulty | ''>(quest.difficulty ?? '');
  const [forceId,    setForceId]    = useState<string>(quest.assignedToId ?? '');
  const [saving,     setSaving]     = useState(false);

  const isForceAssign = !!forceId;
  const pillBg  = isDark ? colors.surface : '#F1F5F9';
  const pillBdr = isDark ? colors.border  : '#E2E8F0';

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const patch: Partial<Quest> = {
      title: title.trim(),
      description: desc.trim() || undefined,
      coins: parseInt(coins) || quest.coins,
      bonusCoins: parseInt(bonusCoins) || 0,
      category,
      difficulty: difficulty || undefined,
      assignedToId: forceId || undefined,
      isPool: !forceId,
      // Force-assign badge: tag in history via lastModifiedById (done by updateQuest)
    };
    onSave(quest.id, patch);
    setSaving(false);
  };

  const siblings = members.map(m => m.name);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={aq.backdrop}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}>
          <View style={[aq.sheet, { backgroundColor: colors.card }]}>
            <View style={[aq.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[aq.title, { color: colors.textPrimary }]}>
                  {editMode === 'restricted' ? 'Adjust Quest' : 'Edit Quest'}
                </Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 1, color:
                  editMode === 'restricted' ? '#D97706' : isForceAssign ? '#EF4444' : BRAND.purple }}>
                  {editMode === 'restricted'
                    ? '📋 Assigned quest — only coins & reassign editable'
                    : isForceAssign ? '🔒 Force assigned — modified by you' : 'Editing open bounty'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}
              >
                <I.X c={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Title — locked when assigned */}
            {editMode === 'restricted' ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title <Text style={{ color: colors.textTertiary, fontWeight: '400' }}>— locked once assigned</Text></Text>
                <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#1E293B' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{quest.title}</Text>
                  {quest.description ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 4 }}>{quest.description}</Text> : null}
                </View>
              </View>
            ) : (
              <>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Quest Title *</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: title.trim() ? colors.border : '#EF444480', backgroundColor: colors.surface }]}
                  value={title} onChangeText={setTitle} returnKeyType="next"
                />
                {/* Description */}
                <Text style={[aq.label, { color: colors.textSecondary }]}>Description
                  <Text style={{ fontWeight: '400', color: colors.textTertiary }}> (what needs to be done)</Text>
                </Text>
                <TextInput
                  style={[aq.input, aq.descInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={desc} onChangeText={t => setDesc(t.slice(0, 150))}
                  multiline numberOfLines={3} textAlignVertical="top"
                />
                <Text style={{ fontSize: TYPO.micro, color: desc.length > 130 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: 12 }}>
                  {desc.length}/150
                </Text>
              </>
            )}

            {/* Coins + Bonus row */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Coins 🪙</Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
                  keyboardType="number-pad" value={coins} onChangeText={setCoins}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[aq.label, { color: colors.textSecondary }]}>Bonus 🎉 <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
                <TextInput
                  style={[aq.input, { color: colors.textPrimary, borderColor: bonusCoins ? BRAND.amber : colors.border, backgroundColor: colors.surface, marginBottom: 0 }]}
                  keyboardType="number-pad" placeholder="+coins" placeholderTextColor={colors.textTertiary}
                  value={bonusCoins} onChangeText={t => setBonusCoins(t.replace(/[^0-9]/g, ''))}
                />
              </View>
            </View>

            {/* Hardness */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>Hardness <Text style={{ fontWeight: '400', color: colors.textTertiary }}>optional</Text></Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {([
                { key: 'easy', label: '😊 Easy', color: '#10B981' },
                { key: 'medium', label: '💪 Medium', color: BRAND.amber },
                { key: 'hard', label: '🔥 Hard', color: '#EF4444' },
                { key: 'hero', label: '⚡ Hero', color: BRAND.purple },
              ] as { key: QuestDifficulty; label: string; color: string }[]).map(d => (
                <TouchableOpacity
                  key={d.key}
                  style={[aq.diffChip, { borderColor: difficulty === d.key ? d.color : pillBdr, backgroundColor: difficulty === d.key ? d.color + '22' : pillBg }]}
                  onPress={() => setDifficulty(p => p === d.key ? '' : d.key)}
                >
                  <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: difficulty === d.key ? d.color : colors.textTertiary }}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Force Assign — avatar row */}
            <Text style={[aq.label, { color: colors.textSecondary }]}>
              Force Assign{' '}
              <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
                {forceId ? '🔒 will badge as Force Assigned' : 'optional — leave blank to keep as open bounty'}
              </Text>
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ flexDirection: 'row', gap: 12 }}>
              {/* Clear / Open Bounty */}
              <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} onPress={() => setForceId('')}>
                <View style={[aq.avatar, { backgroundColor: !forceId ? BRAND.amber + '30' : pillBg, borderColor: !forceId ? BRAND.amber : pillBdr, borderWidth: !forceId ? 2.5 : 1.5 }]}>
                  <Text style={{ fontSize: 18 }}>⚡</Text>
                  {!forceId && <View style={[aq.avatarCheck, { backgroundColor: BRAND.amber }]}><Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text></View>}
                </View>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: !forceId ? BRAND.amber : colors.textTertiary }}>Bounty</Text>
              </TouchableOpacity>

              {kids.map(k => {
                const sel = forceId === k.id;
                return (
                  <TouchableOpacity key={k.id} style={{ alignItems: 'center', gap: 4 }} onPress={() => setForceId(sel ? '' : k.id)}>
                    <View style={{ position: 'relative' }}>
                      <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} siblings={siblings} size={40} ringColor="#EF4444" ringWidth={sel ? 2.5 : 1} bgColor={sel ? '#EF444425' : pillBg} />
                      {sel && <View style={[aq.avatarCheck, { backgroundColor: '#EF4444' }]}><Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text></View>}
                    </View>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? '#EF4444' : colors.textTertiary }} numberOfLines={1}>{k.name.split(' ')[0]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Modified by notice */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: TYPO.micro + 1, color: colors.textTertiary }}>
                ✏️ Modified by{' '}
                <Text style={{ fontWeight: '700', color: BRAND.purple }}>
                  {members.find(m => m.id === activeMemberId)?.name ?? 'you'}
                </Text>
                {' '}· saved automatically
              </Text>
            </View>

            {/* Actions row — Save + Delete */}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
              {onDelete && (
                <TouchableOpacity
                  style={{ paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A560', backgroundColor: isDark ? '#2D1515' : '#FEF2F2' }}
                  onPress={() => Alert.alert(
                    'Delete Quest',
                    `Remove "${quest.title}"? This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => { onDelete(quest.id); onClose(); } },
                    ]
                  )}
                >
                  <I.X c="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: TYPO.micro, fontWeight: '700', marginTop: 2 }}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[aq.submitBtn, { flex: 1, backgroundColor: title.trim() ? (isForceAssign ? '#EF4444' : '#059669') : colors.border, opacity: saving ? 0.6 : 1 }]}
                onPress={save} disabled={saving || !title.trim()}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.body }}>
                        {isForceAssign ? '🔒 Save & Force Assign' : '💾 Save Changes'}
                      </Text>
                      {isForceAssign && (
                        <Text style={{ color: '#FECACA', fontSize: TYPO.label, marginTop: 2 }}>
                          A "Force Assigned" badge will appear on the card
                        </Text>
                      )}
                    </>}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── AI Result Cards ──────────────────────────────────────────────────────────
function AiCard({ children, accentColor, isDark, colors, onClose }: any) {
  const bg     = isDark ? colors.surface  : colors.background;
  const border = accentColor + '55';
  const divBg  = accentColor + '22';
  return (
    <View style={{ borderRadius: 20, borderWidth: 1, backgroundColor: bg, borderColor: border, padding: 14, marginHorizontal: 14, marginBottom: 12, gap: 8 }}>
      {children}
    </View>
  );
}

function AiCardHeader({ icon, title, accentColor, onClose }: any) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: accentColor + '40', paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
        {icon}
        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: accentColor, flex: 1 }}>{title}</Text>
      </View>
      <TouchableOpacity onPress={onClose} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <I.X c={accentColor} size={12} />
        <Text style={{ color: accentColor, fontSize: TYPO.micro + 1 }}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

function AiSectionDivider({ label, color, icon }: { label: string; color: string; icon?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: color + '40' }} />
      {icon}
      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: color + '40' }} />
    </View>
  );
}

function AiRow({ isDark, colors, children }: any) {
  return (
    <View style={{ borderRadius: 12, backgroundColor: isDark ? colors.surface : colors.background, borderWidth: 1, borderColor: colors.border, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {children}
    </View>
  );
}

function AutoBalanceCard({ result, onApply, appliedActions, onClose, isDark, colors, kids }: any) {
  const accent = BRAND.purple;
  // Local editable state for each suggestion
  const [assignEdits, setAssignEdits] = React.useState<Record<number, string>>(() =>
    Object.fromEntries((result.assignments ?? []).map((a: any, i: number) => [i, a.recommendedKidId ?? '']))
  );
  const [bountyEdits, setBountyEdits] = React.useState<Record<number, { coins: number; kidId: string }>>(() =>
    Object.fromEntries((result.newSuggestedQuests ?? []).map((q: any, i: number) => [i, { coins: q.coins ?? 20, kidId: '' }]))
  );

  const surfaceBg = isDark ? '#1A1040' : '#F5F3FF';
  const greenBg   = isDark ? '#0B2218' : '#F0FDF4';

  return (
    <AiCard accentColor={accent} isDark={isDark} colors={colors} onClose={onClose}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: accent + '30' }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>
          <I.Sparkles c={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: accent }}>AI Chore Balancer</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>Powered by AI · adjust before applying</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <I.X c={colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {/* Summary bubble */}
      <View style={{ borderRadius: 14, backgroundColor: accent + '18', borderWidth: 1, borderColor: accent + '35', padding: 14 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: isDark ? '#C4B5FD' : '#5B21B6', lineHeight: 22 }}>✨ {result.summary}</Text>
      </View>

      {/* Reassignment section */}
      {(result.assignments ?? []).length > 0 && (
        <>
          <AiSectionDivider label="Reassign Suggestions" color={BRAND.amber} icon={<I.RotateCcw c={BRAND.amber} />} />
          {(result.assignments ?? []).map((item: any, idx: number) => {
            const applied = appliedActions[`bal_${idx}`];
            const selectedKidId = assignEdits[idx] ?? '';
            return (
              <View key={idx} style={{ borderRadius: 16, backgroundColor: surfaceBg, borderWidth: 1, borderColor: accent + '30', overflow: 'hidden' }}>
                <View style={{ padding: 14, paddingBottom: 10 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{item.questTitle}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: accent, marginTop: 4, lineHeight: 19 }}>💡 {item.reason}</Text>
                </View>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>→</Text>
                    {/* Pool chip */}
                    <TouchableOpacity disabled={applied} onPress={() => setAssignEdits(p => ({ ...p, [idx]: '' }))}
                      style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: selectedKidId === '' ? '#64748B' : (isDark ? '#1E293B' : '#E2E8F0'), borderWidth: 1.5, borderColor: selectedKidId === '' ? '#64748B' : colors.border }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: selectedKidId === '' ? '#fff' : colors.textSecondary }}>🌊</Text>
                    </TouchableOpacity>
                    {/* Kid emoji chips */}
                    {kids.map((k: any) => {
                      const sel = selectedKidId === k.id;
                      const isAiPick = k.id === item.recommendedKidId;
                      return (
                        <TouchableOpacity key={k.id} disabled={applied} onPress={() => setAssignEdits(p => ({ ...p, [idx]: k.id }))}
                          style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: sel ? accent : (isDark ? '#1E293B' : '#E2E8F0'), borderWidth: 1.5, borderColor: sel ? accent : (isAiPick ? accent + '60' : colors.border) }}>
                          <Text style={{ fontSize: 14 }}>{k.emoji ?? '👤'}</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>{k.name}</Text>
                          {isAiPick && !sel && <Text style={{ fontSize: 10 }}>⭐</Text>}
                        </TouchableOpacity>
                      );
                    })}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {applied
                        ? <View style={{ backgroundColor: '#059669', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>✓ Done</Text>
                          </View>
                        : <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 5 }}
                            onPress={() => onApply(`bal_${idx}`, { ...item, recommendedKidId: selectedKidId || null, isPool: !selectedKidId }, 'reassign')}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>Apply ⚡</Text>
                          </TouchableOpacity>}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* New bounties section */}
      {(result.newSuggestedQuests ?? []).length > 0 && (
        <>
          <AiSectionDivider label="New Bounties" color="#10B981" icon={<I.Zap c="#10B981" size={12} />} />
          {(result.newSuggestedQuests ?? []).map((q: any, idx: number) => {
            const applied = appliedActions[`bounty_${idx}`];
            const edit = bountyEdits[idx] ?? { coins: q.coins ?? 20, kidId: '' };
            return (
              <View key={idx} style={{ borderRadius: 16, backgroundColor: greenBg, borderWidth: 1, borderColor: '#10B98140', overflow: 'hidden' }}>
                <View style={{ padding: 14, paddingBottom: 10 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#059669' }}>{q.title}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: '#34D399', marginTop: 4, lineHeight: 19 }}>💡 {q.reason}</Text>
                </View>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                  {/* Coin stepper */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>Coins:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.amber + '22', borderRadius: 24, borderWidth: 1.5, borderColor: BRAND.amber + '50', overflow: 'hidden' }}>
                      <TouchableOpacity disabled={applied}
                        onPress={() => setBountyEdits(p => ({ ...p, [idx]: { ...edit, coins: Math.max(5, edit.coins - 5) } }))}
                        style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: BRAND.amber, fontWeight: '900', fontSize: 20 }}>−</Text>
                      </TouchableOpacity>
                      <Text style={{ color: BRAND.amber, fontWeight: '900', fontSize: TYPO.body, minWidth: 48, textAlign: 'center' }}>{edit.coins}🪙</Text>
                      <TouchableOpacity disabled={applied}
                        onPress={() => setBountyEdits(p => ({ ...p, [idx]: { ...edit, coins: Math.min(200, edit.coins + 5) } }))}
                        style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: BRAND.amber, fontWeight: '900', fontSize: 20 }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* Kid picker + Add button — compact emoji chips in one row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>→</Text>
                    <TouchableOpacity disabled={applied} onPress={() => setBountyEdits(p => ({ ...p, [idx]: { ...edit, kidId: '' } }))}
                      style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: edit.kidId === '' ? '#64748B' : (isDark ? '#1E293B' : '#E2E8F0'), borderWidth: 1.5, borderColor: edit.kidId === '' ? '#64748B' : colors.border }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: edit.kidId === '' ? '#fff' : colors.textSecondary }}>🌊</Text>
                    </TouchableOpacity>
                    {kids.map((k: any) => {
                      const sel = edit.kidId === k.id;
                      return (
                        <TouchableOpacity key={k.id} disabled={applied} onPress={() => setBountyEdits(p => ({ ...p, [idx]: { ...edit, kidId: k.id } }))}
                          style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: sel ? '#10B981' : (isDark ? '#1E293B' : '#E2E8F0'), borderWidth: 1.5, borderColor: sel ? '#10B981' : colors.border }}>
                          <Text style={{ fontSize: 14 }}>{k.emoji ?? '👤'}</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>{k.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {applied
                        ? <View style={{ backgroundColor: '#059669', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>✓ Added</Text>
                          </View>
                        : <TouchableOpacity style={{ backgroundColor: '#10B981', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}
                            onPress={() => onApply(`bounty_${idx}`, { ...q, coins: edit.coins, assignedToId: edit.kidId || null, isPool: !edit.kidId }, 'bounty')}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>➕ Add</Text>
                          </TouchableOpacity>}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}
    </AiCard>
  );
}

function FomoCard({ result, onApply, appliedActions, onClose, isDark, colors, kids }: any) {
  const amber = BRAND.amber;
  const allActive = result.urgentAlerts.length > 0 &&
    result.urgentAlerts.every((a: any, i: number) => a.alreadyHasBonus || appliedActions[`fomo_${i}`]);

  const [bonusEdits, setBonusEdits] = React.useState<Record<number, number>>(() =>
    Object.fromEntries((result.urgentAlerts ?? []).map((a: any, i: number) => [i, a.bonusCoins]))
  );
  const [penEdits, setPenEdits] = React.useState<Record<number, string>>(() =>
    Object.fromEntries((result.penaltiesAndForceAssigns ?? []).map((p: any, i: number) => [i, p.targetKidId ?? '']))
  );

  return (
    <AiCard accentColor={amber} isDark={isDark} colors={colors} onClose={onClose}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: amber + '30' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: amber + '22', alignItems: 'center', justifyContent: 'center' }}>
          <I.Flame c={amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: amber }}>Spark Engine</Text>
          <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>Flash bonuses · penalties · force-assign</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <I.X c={colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={{ borderRadius: 14, backgroundColor: amber + '18', borderWidth: 1, borderColor: amber + '35', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <I.Flame c={amber} />
        <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '600', color: isDark ? '#FDE68A' : '#92400E', lineHeight: 22 }}>
          {result.fomoNudgeSummary}
        </Text>
        {allActive && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <I.CheckCircle c="#10B981" />
            <Text style={{ fontSize: TYPO.caption, color: '#10B981', fontWeight: '700' }}>All bonuses active</Text>
          </View>
        )}
      </View>

      {/* Flash bonuses */}
      {(result.urgentAlerts ?? []).length > 0 && (
        <>
          <AiSectionDivider label="Flash Bonuses" color={amber} icon={<I.Sparkles c={amber} />} />
          {(result.urgentAlerts ?? []).map((alert: any, idx: number) => {
            const isActive = alert.alreadyHasBonus || appliedActions[`spark_${idx}`];
            const editedCoins = bonusEdits[idx] ?? alert.bonusCoins;
            return (
              <View key={idx} style={{ borderRadius: 16, borderWidth: 1, backgroundColor: isDark ? '#1C1200' : '#FFFBEB', borderColor: isActive ? amber + '80' : amber + '35', overflow: 'hidden' }}>
                <View style={{ padding: 14, paddingBottom: 10 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{alert.questTitle}</Text>
                  <Text style={{ fontSize: TYPO.caption, color: isDark ? '#FDE68A' : '#92400E', marginTop: 4, lineHeight: 19 }}>{alert.fomoMessage}</Text>
                </View>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  {isActive
                    ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: amber + '25', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5, borderColor: amber, alignSelf: 'flex-start' }}>
                        <I.Sparkles c={amber} />
                        <Text style={{ color: amber, fontSize: TYPO.caption, fontWeight: '900' }}>+{editedCoins} coins Active!</Text>
                      </View>
                    : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>Bonus:</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: amber + '22', borderRadius: 24, borderWidth: 1.5, borderColor: amber + '50', overflow: 'hidden' }}>
                          <TouchableOpacity onPress={() => setBonusEdits(p => ({ ...p, [idx]: Math.max(5, editedCoins - 5) }))}
                            style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: amber, fontWeight: '900', fontSize: 20 }}>−</Text>
                          </TouchableOpacity>
                          <Text style={{ color: amber, fontWeight: '900', fontSize: TYPO.body, minWidth: 48, textAlign: 'center' }}>+{editedCoins}</Text>
                          <TouchableOpacity onPress={() => setBonusEdits(p => ({ ...p, [idx]: Math.min(100, editedCoins + 5) }))}
                            style={{ width: 40, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: amber, fontWeight: '900', fontSize: 20 }}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: amber, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 }}
                            onPress={() => Alert.alert(
                              'Activate Spark Bonus?',
                              `Add +${editedCoins} coin spark bonus to "${alert.questTitle}"?\n\nMotivates kids to act now. Cannot be reversed.`,
                              [{ text: 'Cancel', style: 'cancel' }, { text: 'Activate', onPress: () => onApply(`spark_${idx}`, { ...alert, bonusCoins: editedCoins }, 'spark') }]
                            )}>
                            <I.Sparkles c="#0F172A" />
                            <Text style={{ color: '#0F172A', fontSize: TYPO.caption, fontWeight: '900' }}>Activate</Text>
                          </TouchableOpacity>
                        </View>
                      </View>}
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Force assigns */}
      {(result.penaltiesAndForceAssigns ?? []).length > 0 && (
        <>
          <AiSectionDivider label="Overdue Actions" color="#EF4444" icon={<I.AlertTriangle c="#EF4444" size={12} />} />
          {(result.penaltiesAndForceAssigns ?? []).map((pen: any, idx: number) => {
            const applied = appliedActions[`pen_${idx}`];
            const selectedKidId = penEdits[idx] ?? pen.targetKidId ?? '';
            return (
              <View key={idx} style={{ borderRadius: 16, borderWidth: 1, backgroundColor: isDark ? '#200808' : '#FEF2F2', borderColor: '#EF444450', overflow: 'hidden' }}>
                <View style={{ padding: 14, paddingBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, flex: 1 }}>{pen.questTitle}</Text>
                    <View style={{ backgroundColor: '#EF444422', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#EF4444' }}>🔴 {pen.daysOverdue}d overdue</Text>
                    </View>
                  </View>
                  {pen.penaltyReason && (
                    <Text style={{ fontSize: TYPO.caption, color: '#EF4444', lineHeight: 19 }}>{pen.penaltyReason}</Text>
                  )}
                </View>
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>→</Text>
                    {kids.map((k: any) => {
                      const sel = selectedKidId === k.id;
                      const isAiPick = k.id === pen.targetKidId;
                      return (
                        <TouchableOpacity key={k.id} disabled={applied} onPress={() => setPenEdits(p => ({ ...p, [idx]: k.id }))}
                          style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: sel ? '#EF4444' : (isDark ? '#1E293B' : '#E2E8F0'), borderWidth: 1.5, borderColor: sel ? '#EF4444' : (isAiPick ? '#EF444460' : colors.border) }}>
                          <Text style={{ fontSize: 14 }}>{k.emoji ?? '👤'}</Text>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? '#fff' : colors.textSecondary }}>{k.name}</Text>
                          {isAiPick && !sel && <Text style={{ fontSize: 10 }}>⭐</Text>}
                        </TouchableOpacity>
                      );
                    })}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {applied
                        ? <View style={{ backgroundColor: '#EF4444', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>Assigned</Text>
                          </View>
                        : <TouchableOpacity style={{ backgroundColor: '#EF4444', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 }}
                            onPress={() => Alert.alert(
                              'Force Assign?',
                              `Force-assign "${pen.questTitle}" to ${kids.find((k: any) => k.id === selectedKidId)?.name ?? 'this kid'}?\n\nThis overrides the current assignment.`,
                              [{ text: 'Cancel', style: 'cancel' }, { text: 'Force Assign', style: 'destructive', onPress: () => onApply(`pen_${idx}`, { ...pen, targetKidId: selectedKidId }, 'penalty') }]
                            )}>
                            <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '800' }}>Force ⚡</Text>
                          </TouchableOpacity>}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}
    </AiCard>
  );
}

function AdviceCard({ result, appliedActions, onApply, onClose, isDark, colors }: any) {
  const accent  = '#6366F1';
  const indigo  = isDark ? '#1E1B4B' : '#EEF2FF';
  const entries = Object.entries(result.kidEncouragementNotes ?? {});
  const ruleUpdates: string[] = result.suggestedRuleUpdates ?? [];

  return (
    <AiCard accentColor={accent} isDark={isDark} colors={colors} onClose={onClose}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: accent + '30' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>
          <I.Award c={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: accent }}>Family Advisor</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>AI coaching based on real quest data</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <I.X c={colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {/* Coaching tip */}
      <View style={{ borderRadius: 14, backgroundColor: accent + '18', borderWidth: 1, borderColor: accent + '35', padding: 14 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: accent, marginBottom: 6 }}>💡 Family Coaching Tip</Text>
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: isDark ? '#C7D2FE' : '#3730A3', lineHeight: 22 }}>{result.familyCoachingTip}</Text>
      </View>

      {/* Cheat pattern alert */}
      {result.cheatPatternAlert && (
        <View style={{ borderRadius: 14, backgroundColor: '#EF444418', borderWidth: 1, borderColor: '#EF444440', padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <I.AlertTriangle c="#EF4444" size={12} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: '#EF4444' }}>Pattern Detected</Text>
          </View>
          <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: isDark ? '#FCA5A5' : '#991B1B', lineHeight: 22 }}>{result.cheatPatternAlert}</Text>
        </View>
      )}

      {/* Top performer */}
      {result.topPerformer && (
        <View style={{ borderRadius: 14, backgroundColor: BRAND.amber + '18', borderWidth: 1, borderColor: BRAND.amber + '35', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 28 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: BRAND.amber }}>Top Performer This Week</Text>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: isDark ? '#FDE68A' : '#92400E', marginTop: 3 }}>{result.topPerformer}</Text>
          </View>
        </View>
      )}

      {/* Per-kid notes */}
      {entries.length > 0 && (
        <>
          <AiSectionDivider label="Kid Notes" color={accent} icon={<I.User c={accent} size={12} />} />
          {entries.map(([kid, note]: [string, any]) => (
            <View key={kid} style={{ borderRadius: 14, backgroundColor: indigo, borderWidth: 1, borderColor: accent + '30', padding: 14 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: accent, marginBottom: 5 }}>{kid}</Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '400', color: colors.textSecondary, lineHeight: 22 }}>{note}</Text>
            </View>
          ))}
        </>
      )}

      {/* Suggested rule updates */}
      {ruleUpdates.length > 0 && (
        <>
          <AiSectionDivider label="Suggested Rules" color="#10B981" icon={<I.CheckCircle c="#10B981" />} />
          {ruleUpdates.map((rule, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4 }}>
              <Text style={{ color: '#10B981', fontWeight: '900', fontSize: TYPO.body, marginTop: 2 }}>→</Text>
              <Text style={{ flex: 1, fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 22 }}>{rule}</Text>
            </View>
          ))}
        </>
      )}

      {/* Share to family chat */}
      <View style={{ alignItems: 'flex-end', marginTop: 4 }}>
        {appliedActions['advice_chat']
          ? <View style={{ backgroundColor: accent, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '900' }}>✓ Posted to Family Chat</Text>
            </View>
          : <TouchableOpacity
              style={{ backgroundColor: accent, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }}
              onPress={() => onApply('advice_chat', result)}
            >
              <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '900' }}>📢 Share with Family</Text>
            </TouchableOpacity>}
      </View>
    </AiCard>
  );
}

const ai = StyleSheet.create({
  card:       { borderRadius: 24, borderWidth: 1, backgroundColor: '#0F172A', padding: 14, marginHorizontal: 14, marginBottom: 12, gap: 8 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 8 },
  headerText: { fontSize: TYPO.label, fontWeight: '900', flex: 1 },
  summary:    { fontSize: TYPO.label, fontWeight: '600', lineHeight: 16, color: '#CBD5E1' },
  infoBox:    { borderRadius: 14, borderWidth: 1, padding: 10 },
  sectionLabel: { fontSize: TYPO.micro + 1, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, color: '#94A3B8' },
  row:        { borderRadius: 14, backgroundColor: '#1E293B', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fomoRow:    { borderRadius: 14, borderWidth: 1, padding: 10, backgroundColor: '#1C1000', borderColor: '#FCD34D40', marginBottom: 6 },
  rowTitle:   { fontSize: TYPO.label, fontWeight: '700' },
  rowSub:     { fontSize: TYPO.micro + 1, marginTop: 2 },
  chip:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  chipText:   { fontSize: TYPO.micro + 1, fontWeight: '900' },
  doneChip:   { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  doneText:   { color: '#fff', fontSize: TYPO.micro + 1, fontWeight: '900' },
  applyBtn:   { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  applyText:  { color: '#fff', fontSize: TYPO.micro + 1, fontWeight: '900' },
  divider:    { borderTopWidth: 1, marginVertical: 2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
// TabStatus and AiTool are imported from ./components/QuestFilters and ./components/AiEngineBanner

export default function QuestsScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const { quests, claimQuest, submitQuest, approveQuest, declineQuest, reopenQuest, updateQuest, deleteQuest, approveParticipant, declineParticipant, reopenParticipant } = useQuestStore();

  const activeMember = members.find(m => m.id === activeMemberId)
    ?? members.find(m => m.role === 'parent') ?? members[0];
  const isParent         = activeMember?.role === 'parent';
  const isSenior         = activeMember?.role === 'senior';
  const isKid            = activeMember?.role === 'kid';
  const isParentOrSenior = isParent || isSenior;   // RBAC: approve/decline/reopen
  const kids             = members.filter(m => m.role === 'kid');

  const [kidFilter,      setKidFilter]      = useState('all');
  const [tabStatus,      setTabStatus]      = useState<TabStatus>('all');
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

    // Kids (and non-parent/senior roles) never see adult tasks
    if (isKid) {
      list = list.filter(q => !q.isAdultTask);
    }

    if (kidFilter === 'adults') {
      // Adults filter — only parent-only tasks
      list = list.filter(q => q.isAdultTask);
    } else if (kidFilter === 'pool') {
      // ⚡ Bounty tab — open pool quests (non-adult)
      list = list.filter(q => q.isPool && q.status === 'todo' && !q.isAdultTask);
    } else if (isKid && kidFilter === 'all') {
      // Kid "My Quests" — their own assigned quests only
      list = list.filter(q => q.assignedToId === activeMember?.id);
    } else if (!isKid && kidFilter !== 'all' && kidFilter !== 'cheer') {
      // Parent filtered by specific kid — exclude adult tasks
      list = list.filter(q => q.assignedToId === kidFilter && !q.isAdultTask);
    } else if (!isKid && kidFilter === 'all') {
      // Parent "All Family" — exclude adult tasks (they live in the Adults tab)
      list = list.filter(q => !q.isAdultTask);
    }

    if (kidFilter !== 'cheer' && tabStatus !== 'all') {
      if (tabStatus === 'todo')      list = list.filter(q => q.status === 'todo' || q.status === 'claimed');
      else if (tabStatus === 'review')    list = list.filter(q => q.status === 'pending_approval');
      else if (tabStatus === 'completed') list = list.filter(q => q.status === 'approved' || q.status === 'done' || q.status === 'declined');
    }
    return list;
  }, [quests, kidFilter, tabStatus, isKid, activeMember]);

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

  const cardBg   = isDark ? '#131927' : '#FFFFFF';
  const cardBord = isDark ? '#1E293B' : '#E2E8F0';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name}
        memberRole={activeMember?.role === 'kid' ? 'kid' : activeMember?.role === 'senior' ? 'senior' : 'parent'}
        notifCount={0}
        onPersonaPress={undefined}
        onBellPress={() => {}}
      />

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Title + Add Quest (parent ONLY) ── */}
        <View style={[s.titleRow, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: isDark ? colors.textPrimary : '#1E2D6B' }]}>
              {isKid ? 'My Quests' : 'Household Quests'}
            </Text>
            {isParent && (
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple, marginTop: 1 }}>
                Add quests, approve chores & distribute coins
              </Text>
            )}
          </View>
          {isParent && (
            <TouchableOpacity style={[s.headerBtn, { backgroundColor: '#059669' }]} onPress={() => setShowAddModal(true)}>
              <I.PlusCircle c="#fff" />
              <Text style={{ color: '#fff', fontSize: TYPO.label, fontWeight: '900' }}>+ Quest</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── AI Engine Banner (parent ONLY) ── */}
        {isParent && (
          <AiEngineBanner
            showAiTool={showAiTool}
            isAiLoading={isAiLoading}
            onRunAI={runAI}
          />
        )}

        {/* ── Senior context banner ── */}
        {isSenior && (
          <View style={[s.seniorBanner, { marginHorizontal: 14, marginBottom: 12 }]}>
            <Text style={s.seniorBannerText}>
              👴 Grandparent View — You can review and approve chore submissions, but quest creation is managed by the parents.
            </Text>
          </View>
        )}

        {/* ── AI Loading + Results (parent ONLY) ── */}
        {isParent && isAiLoading && (
          <View style={[s.aiLoadingBox, { marginHorizontal: 14, marginBottom: 12, backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: isDark ? '#6D28D940' : '#C7D2FE' }]}>
            <ActivityIndicator color={BRAND.purple} size="small" />
            <Text style={[s.aiLoadingText, { color: isDark ? '#A78BFA' : '#4338CA' }]}>CubeAI is analysing your household quests...</Text>
          </View>
        )}
        {isParent && !isAiLoading && showAiTool !== 'none' && aiFromCache[showAiTool] && (
          <View style={{ marginHorizontal: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderRadius: 10, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}>
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
          kids={kids as any[]}
          isDark={isDark}
          colors={colors}
          onSetKidFilter={setKidFilter}
          onSetTabStatus={setTabStatus}
        />

        {/* ── Sibling Cheer Panel ── */}
        {kidFilter === 'cheer' ? (
          <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBord, marginHorizontal: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <I.ThumbsUp c="#6366F1" />
              <Text style={[s.cardTitle, { color: isDark ? '#818CF8' : '#4338CA' }]}>Sibling Praise & High-Five Board</Text>
            </View>
            <Text style={[s.cardSub, { color: colors.textSecondary, marginBottom: 12 }]}>
              Send instant High Fives and peer encouragement to your brothers or sisters!
            </Text>
            {kids.map(k => (
              <View key={k.id} style={[s.cheerRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: cardBord }]}>
                <Text style={[s.cheerName, { color: colors.textPrimary }]}>{k.emoji ?? '🧒'} Cheer {k.name} on chores today!</Text>
                <TouchableOpacity
                  style={[s.highFiveBtn, { backgroundColor: '#4338CA' }]}
                  onPress={() => Alert.alert('🖐️ High Five Sent!', `You cheered for ${k.name}!`)}
                >
                  <Text style={{ color: '#fff', fontSize: TYPO.label, fontWeight: '700' }}>🖐️ High Five!</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <>

            {/* ── Quest Cards — keyed by activeMemberId so expanded state resets on persona switch ── */}
            <View key={activeMemberId ?? 'default'} style={{ paddingHorizontal: 14, gap: 10, marginTop: 12 }}>
              {filteredQuests.length === 0 && (
                <View style={[s.emptyBox, { backgroundColor: cardBg, borderColor: cardBord }]}>
                  <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                    {tabStatus === 'todo'        ? 'All caught up! No tasks pending 🎉'
                     : tabStatus === 'review'    ? 'No quests awaiting review'
                     : tabStatus === 'completed' ? 'No completed quests yet'
                     : 'No quests found for this filter'}
                  </Text>
                </View>
              )}

              {filteredQuests.map(q => {
                const assignee = members.find(m => m.id === q.assignedToId);
                const isPoolCard = q.isPool && q.status === 'todo';
                const isTodoCard = (q.status === 'todo' || q.status === 'claimed') && !isPoolCard;
                const isReview   = q.status === 'pending_approval';
                const isDoneCard = q.status === 'approved' || q.status === 'done';
                const isDeclined = q.status === 'declined';

                // RBAC checks
                const canClaim   = isKid && isPoolCard;
                // Submit: kid and it's their own quest
                const canSubmit  = isKid && isTodoCard && q.assignedToId === activeMember?.id;
                // Approve/Decline: parent or senior, quest in review
                const canApprove = isParentOrSenior && isReview;
                // Reopen: parent or senior, quest was declined
                const canReopen  = isParentOrSenior && isDeclined;
                // Full edit: pool quest only — all fields (title, desc, coins, category, difficulty, assign)
                const canEditFull       = isParent && isPoolCard;
                // Restricted edit: assigned todo not yet submitted — coins + reassign ONLY, title/desc locked
                const canEditRestricted = isParent && q.status === 'todo' && !!q.assignedToId;
                const canEdit           = canEditFull || canEditRestricted;
                // Delete: parent only, quest not yet submitted (pool, or assigned/unassigned todo)
                const canDelete  = isParent && (isPoolCard || q.status === 'todo');

                // Accent colour by status
                const accentColor =
                  isPoolCard    ? BRAND.amber :
                  isDeclined    ? '#EF4444' :
                  isDoneCard    ? '#10B981' :
                  isReview      ? BRAND.purple :
                  q.priority === 'urgent' ? '#EF4444' : BRAND.purple;

                const hasBonus = q.bonusCoins > 0 && (!q.bonusExpiresAt || new Date(q.bonusExpiresAt).getTime() > now);

                // ── Collapsed header ────────────────────────────────────────────
                const claimantIds    = q.assignedToIds?.length ? q.assignedToIds : (q.assignedToId ? [q.assignedToId] : []);
                const claimants      = claimantIds.map(id => members.find(m => m.id === id)).filter((m): m is typeof members[0] => !!m);
                const avatarSiblings = members.map(m => m.name);
                const AVSIZE    = 30;
                const AVOVERLAP = 16;
                const stackW    = claimants.length > 0 ? AVSIZE + (claimants.length - 1) * AVOVERLAP : 0;

                // Due date chip — urgency coloring
                const dueMsRaw    = q.dueDate ? new Date(q.dueDate).getTime() : null;
                const todayEnd    = new Date(); todayEnd.setHours(23, 59, 59, 999);
                const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
                const isOverdue   = !!dueMsRaw && dueMsRaw < Date.now() && !isDoneCard && !isDeclined;
                const isDueToday  = !!dueMsRaw && dueMsRaw <= todayEnd.getTime() && !isOverdue;
                const isDueTomorrow = !!dueMsRaw && dueMsRaw <= tomorrowEnd.getTime() && !isDueToday && !isOverdue;
                const dueBg    = isOverdue    ? (isDark ? '#450A0A' : '#FEE2E2')
                               : isDueToday  ? (isDark ? '#1C1000' : '#FFF7ED')
                               : isDark ? '#1E293B' : '#F1F5F9';
                const dueColor = isOverdue ? '#DC2626' : isDueToday ? '#D97706' : colors.textSecondary;
                const dueLabel = isOverdue    ? `⚠ ${q.dueDate ? fmtDateShort(q.dueDate) : 'Overdue'}`
                               : isDueToday  ? '⚡ Today'
                               : isDueTomorrow ? 'Tomorrow'
                               : q.dueDate ? fmtDateShort(q.dueDate) : 'Tonight';

                // Status line — concise, no "due" repetition (due is in chip on right)
                const bonusMs = hasBonus && q.bonusExpiresAt ? new Date(q.bonusExpiresAt).getTime() - Date.now() : 0;
                const bonusStatusSuffix = hasBonus && bonusMs > 0
                  ? ` · ⚡ Grab it before bonus ends!`
                  : '';

                const statusLine = isReview
                  ? `Submitted ${q.submittedAt ? new Date(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'for review'}`
                  : isDoneCard
                    ? 'Approved'
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
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                          {statusLine}
                        </Text>
                      </View>

                      {/* Right: due chip + coins only */}
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {(isTodoCard || isPoolCard || isReview) && (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: dueBg }}>
                            <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: dueColor }}>{dueLabel}</Text>
                          </View>
                        )}
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontWeight: '600' }}>
                          +{hasBonus ? q.coins + q.bonusCoins : q.coins}🪙
                        </Text>
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
                      style={{ width: 72, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EF4444', borderRadius: 18, marginLeft: 8, marginBottom: 10 }}
                      onPress={() => Alert.alert(
                        'Delete Quest',
                        `Remove "${q.title}"? This cannot be undone.`,
                        [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteQuest(q.id) }]
                      )}
                    >
                      <Animated.View style={{ alignItems: 'center', transform: [{ scale }] }}>
                        <I.Trash c="#fff" size={20} />
                        <Text style={{ color: '#fff', fontSize: TYPO.micro, fontWeight: '800', marginTop: 2 }}>Delete</Text>
                      </Animated.View>
                    </TouchableOpacity>
                  );
                };

                return (
                  <Swipeable
                    key={q.id}
                    renderRightActions={canDelete ? swipeDeleteAction : undefined}
                    overshootRight={false}
                    friction={2}
                  >
                  <CollapsibleQuestCard accentColor={accentColor} cardBg={cardBg} cardBord={cardBord}
                    onDoubleTap={canEdit ? () => setEditTarget(q) : undefined}
                    header={cardHeader}
                  >
                    {/* ── Expanded body — NO title/coin repeat, header already shows them ── */}

                      {/* Progress stepper — single-kid quests only (multi-kid gets per-row stepper below) */}
                      {q.participants.length <= 1 && (!!q.assignedToId || q.claimedAt || q.submittedAt || (q as any).approvedAt || (q as any).declinedAt) && (
                        <QuestStepper
                          claimedAt={q.claimedAt}
                          submittedAt={q.submittedAt}
                          approvedAt={(q as any).approvedAt}
                          declinedAt={(q as any).declinedAt}
                          declineReason={q.declineReason}
                          accentColor={accentColor}
                          isDark={isDark}
                          colors={colors}
                          isAssigned={!!q.assignedToId && !q.claimedAt}
                        />
                      )}

                      {/* Description */}
                      {q.description ? (
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, lineHeight: 20, marginBottom: 10 }}>
                          {q.description}
                        </Text>
                      ) : null}

                      {/* Submitted time + photo proof — for In Review */}
                      {isReview && q.submittedAt && (
                        <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: isDark ? BRAND.purple + '40' : '#C7D2FE', overflow: 'hidden', backgroundColor: isDark ? BRAND.purple + '12' : '#EEF2FF' }}>
                          {/* Submitted banner */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
                            <I.Mail c={isDark ? '#A78BFA' : '#4338CA'} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#A78BFA' : '#4338CA' }}>
                                {assignee?.name ?? 'Kid'} submitted for review
                              </Text>
                              <Text style={{ fontSize: TYPO.micro + 1, color: isDark ? '#818CF8' : '#6366F1' }}>
                                {new Date(q.submittedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                {' · '}
                                {new Date(q.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </Text>
                            </View>
                            {q.photoRequired && !q.photoUrl && (
                              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D' }}>
                                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: '#D97706' }}>No photo</Text>
                              </View>
                            )}
                          </View>
                          {/* Photo thumbnail */}
                          {q.photoUrl ? (
                            <TouchableOpacity onPress={() => Alert.alert('Photo Proof', `"${q.title}" was submitted with photo proof.`)}>
                              <Image
                                source={{ uri: q.photoUrl }}
                                style={{ width: '100%', height: 160, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }}
                                resizeMode="cover"
                              />
                              <View style={{ position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                <Text style={{ fontSize: TYPO.micro, color: '#fff', fontWeight: '700' }}>Tap to enlarge</Text>
                              </View>
                            </TouchableOpacity>
                          ) : q.photoRequired ? (
                            <View style={{ height: 80, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: isDark ? '#1C1200' : '#FFF7ED' }}>
                              <I.Photo c="#D97706" size={28} />
                              <Text style={{ fontSize: TYPO.label, color: '#D97706', fontWeight: '600' }}>Photo proof missing</Text>
                            </View>
                          ) : null}
                          {/* Completion note */}
                          {q.completionNote ? (
                            <View style={{ padding: 10, paddingTop: 4 }}>
                              <Text style={{ fontSize: TYPO.label, color: isDark ? '#A78BFA' : '#4338CA', fontStyle: 'italic' }}>
                                "{q.completionNote}"
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      )}

                      {/* ── Badge strip ── */}
                      <>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                        <View style={[s.badge, { backgroundColor: isDark ? '#2D1B69' : '#EEF2FF', borderColor: isDark ? '#4338CA40' : '#C7D2FE' }]}>
                          <Text style={[s.badgeText, { color: isDark ? '#818CF8' : '#4338CA' }]}>{q.category}</Text>
                        </View>
                        {q.priority === 'urgent' && (
                          <View style={[s.badge, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                            <Text style={[s.badgeText, { color: '#DC2626' }]}>🔴 Urgent</Text>
                          </View>
                        )}
                        {q.difficulty && (
                          <View style={[s.badge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
                            <Text style={[s.badgeText, { color: colors.textSecondary }]}>
                              {q.difficulty === 'easy' ? '😊' : q.difficulty === 'medium' ? '💪' : q.difficulty === 'hard' ? '🔥' : '⚡'}{' '}
                              {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
                            </Text>
                          </View>
                        )}
                        {isPoolCard && (
                          <View style={[s.badge, { backgroundColor: isDark ? '#1C1000' : '#FFFBEB', borderColor: BRAND.amber + '60' }]}>
                            <Text style={[s.badgeText, { color: BRAND.amber }]}>⚡ Open Bounty</Text>
                          </View>
                        )}
                        {q.photoRequired && (isTodoCard || isPoolCard) && (
                          <View style={[s.badge, { backgroundColor: isDark ? '#1C1700' : '#FFFBEB', borderColor: '#FCD34D60' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <I.Photo c="#D97706" size={11} />
                              <Text style={[s.badgeText, { color: '#D97706' }]}>Photo proof</Text>
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
                            <View style={[s.badge, { backgroundColor: '#FCD34D18', borderColor: '#FCD34D60' }]}>
                              <Text style={[s.badgeText, { color: '#F59E0B', fontWeight: '900' }]}>
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
                        <View style={[s.declineBox, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderColor: '#FCA5A5' }]}>
                          <I.AlertCircle c="#EF4444" />
                          <Text style={[s.declineText, { color: '#EF4444', flex: 1 }]}>{q.declineReason}</Text>
                        </View>
                      )}

                      </>{/* end badge strip */}

                    {/* ── Participant tracker — multi-kid only (single-kid: header + stepper covers it) ── */}
                    {q.participants.length > 1 && (
                      <View style={{ marginBottom: 4 }}>
                        {q.participants.map(p => {
                          const pm = members.find(m => m.id === p.memberId);
                          if (!pm) return null;
                          const pSiblings = members.map(m => m.name);
                          const pIsMe = p.memberId === activeMember?.id;
                          const pStatusColor =
                            p.status === 'approved'          ? '#10B981'
                            : p.status === 'pending_approval' ? BRAND.purple
                            : p.status === 'declined'         ? '#EF4444'
                            : p.status === 'in_progress'      ? BRAND.amber
                            : colors.textTertiary;
                          const pStatusLabel =
                            p.status === 'approved'          ? `✅ Approved · +${p.coinsAwarded ?? q.coins}🪙`
                            : p.status === 'pending_approval' ? `📬 Submitted${p.submittedAt ? ' · ' + new Date(p.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''}`
                            : p.status === 'declined'         ? `❌ Declined${p.declineReason ? ' — ' + p.declineReason : ''}`
                            : p.status === 'in_progress'      ? `🏃 In progress${p.claimedAt ? ' · ' + timeAgo(p.claimedAt) : ''}`
                            : '○ Not started';
                          return (
                            <View key={p.id} style={{ borderTopWidth: 1, borderTopColor: isDark ? '#1E293B' : '#F0F4F8', paddingTop: 10, paddingBottom: 6 }}>
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
                                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF4444' }}
                                      onPress={() => setDeclineTarget({ id: q.id, title: q.title, memberId: p.memberId })}
                                    >
                                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#EF4444' }}>Decline</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#05906920', borderWidth: 1, borderColor: '#059669' }}
                                      onPress={() => approveParticipant(q.id, p.memberId, activeMember?.id ?? '')}
                                    >
                                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#059669' }}>Approve ✓</Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                                {isParentOrSenior && p.status === 'declined' && (
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderWidth: 1, borderColor: colors.border }}
                                    onPress={() => reopenParticipant(q.id, p.memberId, activeMember?.id)}
                                  >
                                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textSecondary }}>Reopen</Text>
                                  </TouchableOpacity>
                                )}
                                {/* Kid's own submit button */}
                                {pIsMe && (p.status === 'todo' || p.status === 'in_progress') && (
                                  <TouchableOpacity
                                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: BRAND.purple + '20', borderWidth: 1, borderColor: BRAND.purple }}
                                    onPress={() => Alert.alert(
                                      'Submit Quest',
                                      `Submit "${q.title}" for review?`,
                                      [{ text: 'Cancel', style: 'cancel' }, { text: 'Submit', onPress: () => submitQuest(q.id) }]
                                    )}
                                  >
                                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Submit</Text>
                                  </TouchableOpacity>
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
                    <View style={[s.actionStrip, { borderTopColor: isDark ? '#1E293B' : '#F0F4F8' }]}>

                      {/* Kid: Claim open bounty */}
                      {canClaim && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: BRAND.amber, opacity: isClaiming[q.id] ? 0.6 : 1 }]}
                          onPress={() => handleClaim(q.id)}
                          disabled={isClaiming[q.id]}
                        >
                          {isClaiming[q.id]
                            ? <ActivityIndicator color="#0F172A" size="small" />
                            : <Text style={[s.actionBtnText, { color: '#0F172A' }]}>Claim Quest</Text>}
                        </TouchableOpacity>
                      )}

                      {/* Parent/Senior view of open bounty — show claimant count vs cap */}
                      {isPoolCard && isParentOrSenior && (
                        <View style={[s.paidBadge, { backgroundColor: isDark ? '#1C1000' : '#FFFBEB', borderColor: BRAND.amber + '50' }]}>
                          <Text style={[s.paidText, { color: BRAND.amber }]}>
                            {q.participants.length === 0
                              ? 'Waiting for a kid to claim'
                              : q.maxClaimants && q.participants.length >= q.maxClaimants
                                ? `Full — ${q.participants.length}/${q.maxClaimants} claimed`
                                : `${q.participants.length} claimed${q.maxClaimants ? ` · ${q.maxClaimants - q.participants.length} spots left` : ''}`}
                          </Text>
                        </View>
                      )}

                      {/* Completed badge — only when ALL participants approved */}
                      {isDoneCard && (
                        <View style={[s.paidBadge, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderColor: isDark ? '#10B981' : '#6EE7B7' }]}>
                          <I.CheckCircle c="#10B981" />
                          <Text style={[s.paidText, { color: '#10B981' }]}>
                            All done · {q.participants.length > 1 ? `${q.participants.length} kids paid` : `+${q.coins}🪙 paid`}
                          </Text>
                        </View>
                      )}

                      {/* Parent: double-tap to edit hint */}
                      {canEdit && !canClaim && !isDoneCard && (
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: TYPO.micro, color: isDark ? '#475569' : '#94A3B8', fontStyle: 'italic' }}>double-tap to edit</Text>
                        </View>
                      )}
                    </View>{/* action strip */}
                  </CollapsibleQuestCard>
                  </Swipeable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Parent-only: Add Quest modal */}
      {isParent && (
        <AddQuestModal visible={showAddModal} onClose={() => setShowAddModal(false)} activeMemberId={activeMember?.id ?? ''} />
      )}

      {/* Parent-only: Edit unclaimed quest modal */}
      {isParent && editTarget && (
        <EditQuestModal
          quest={editTarget}
          activeMemberId={activeMember?.id ?? ''}
          editMode={editTarget?.isPool ? 'full' : 'restricted'}
          onClose={() => setEditTarget(null)}
          onSave={(id, patch) => { updateQuest(id, patch, activeMember?.id); setEditTarget(null); }}
          onDelete={(id) => { deleteQuest(id); setEditTarget(null); }}
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  titleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title:       { fontSize: TYPO.heading, fontWeight: '900' },
  headerBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },


  seniorBanner:     { borderRadius: 20, borderWidth: 1, borderColor: '#92400E60', backgroundColor: '#1C1000', padding: 12 },
  seniorBannerText: { fontSize: TYPO.label, color: '#FCD34D', fontWeight: '600', lineHeight: 16 },

  aiLoadingBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0F172A', borderRadius: 20, borderWidth: 1, borderColor: '#6D28D940', padding: 14 },
  aiLoadingText: { fontSize: TYPO.label, fontWeight: '700', color: '#A78BFA', flex: 1 },


  statusTabs:  { flexDirection: 'row', borderBottomWidth: 1, gap: 4 },
  tabItem:     { paddingBottom: 8, paddingHorizontal: 4, position: 'relative' },
  tabText:     { fontSize: TYPO.caption, fontWeight: '700' },
  tabLine:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },

  card:        { borderRadius: 24, borderWidth: 1, padding: 14 },
  cardTitle:   { fontSize: TYPO.caption, fontWeight: '700' },
  cardSub:     { fontSize: TYPO.label, lineHeight: 16 },
  cheerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1, padding: 10, marginBottom: 8 },
  cheerName:   { fontSize: TYPO.caption, fontWeight: '700', flex: 1 },
  highFiveBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },

  // ── Quest card ──────────────────────────────────────────────────────────────
  questCard:   {
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 0,
    // subtle shadow
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  accentBar:   { width: 4, borderRadius: 0 },
  coinPill:    {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 8,
    minWidth: 56,
  },
  coinPillSm:  {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  badge:       { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:   { fontSize: TYPO.micro, fontWeight: '700' },
  questTitle:  { fontSize: TYPO.subheading, fontWeight: '800', lineHeight: 22 },
  metaRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  metaAvatar:  { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  declineBox:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderRadius: 12, borderWidth: 1, padding: 8, marginTop: 6 },
  declineText: { fontSize: TYPO.label, fontWeight: '600', lineHeight: 18 },
  actionStrip: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  actionBtnText: { fontSize: TYPO.label, fontWeight: '800', color: '#fff' },
  paidBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  paidText:    { fontSize: TYPO.label, fontWeight: '700' },
  emptyBox:    { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyText:   { fontSize: TYPO.caption, textAlign: 'center' },
  // ── Cheer card ──────────────────────────────────────────────────────────────
  catBadge:    { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  catText:     { fontSize: TYPO.micro, fontWeight: '700' },
  coinAmt:     { fontSize: TYPO.label, fontWeight: '900', textAlign: 'right' },
  metaText:    { fontSize: TYPO.micro + 1 },
  metaVal:     { fontWeight: '700' },
});
