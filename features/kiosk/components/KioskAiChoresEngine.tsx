/**
 * KioskAiChoresEngine — kiosk mount of the real CubeAI Chores Engine
 * (AutoBalance / Spark / Advice), entirely absent from kiosk before this
 * [GAP — Chores-tab mobile-parity audit, D3]. Confirmed by grep: zero
 * references anywhere in KioskTasksTab.tsx to AiEngineBanner, AiTool,
 * AutoBalanceCard, FomoCard, AdviceCard, callAutoBalance, callFomo,
 * callAdvice, or family-ai — a parent standing at kiosk had no access to
 * any of it, while the phone's own Chores toolbar shows a prominent,
 * always-visible "CubeAI" pill.
 *
 * Reuses the real components directly rather than re-implementing them —
 * AiEngineBanner (the pill + 3-tool row) and AutoBalanceCard/FomoCard/
 * AdviceCard (the actual result panels, from features/quests/components/
 * AiFeatureCards.tsx) are all genuinely exported, self-contained
 * components taking plain `colors`/`isDark` props, same pattern this
 * session already established for GpOfferReviewCard — mounted with the
 * phone `colors` prop threaded through, not restyled, matching this
 * file's own header-comment precedent (SmartTaskComposer/AddQuestModal
 * are used the same way).
 *
 * The orchestration logic below (runAI's cache-hash/loading state,
 * handleApply's real store mutations) is ported from QuestsScreen.tsx's
 * own runAI/handleApply (read in full before writing this) — plain
 * logic with no React-screen coupling, just relocated to a kiosk-owned
 * component so it can call the same real functions
 * (callAutoBalance/callFomo/callAdvice + their local fallbacks from
 * features/quests/components/questAiFallbacks.ts) against kiosk's own
 * `quests`/`kids` data instead of duplicating a second implementation.
 */
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { AiEngineBanner, type AiTool } from '@/features/quests/components/AiEngineBanner';
import { AutoBalanceCard, FomoCard, AdviceCard } from '@/features/quests/components/AiFeatureCards';
import {
  callAutoBalance, callAutoBalanceFallback, callFomo, buildFomoResult, callAdvice, buildAdviceFallback,
} from '@/features/quests/components/questAiFallbacks';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import type { Quest } from '@/store/questStore';
import type { FamilyMember } from '@/store/familyStore';
import { todayLocal } from '@/lib/dates';

export function KioskAiChoresEngine({ quests, kids, activeMemberId, colors, isDark }: {
  quests: Quest[];
  kids: FamilyMember[];
  activeMemberId: string;
  colors: any;
  isDark: boolean;
}) {
  const [showAiTool, setShowAiTool] = useState<AiTool>('none');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [autoBalResult, setAutoBalResult] = useState<any>(null);
  const [fomoResult, setFomoResult] = useState<any>(null);
  const [adviceResult, setAdviceResult] = useState<any>(null);
  const [appliedActions, setAppliedActions] = useState<Record<string, boolean>>({});

  // Same real result-caching hash QuestsScreen.tsx's own runAI uses — skip
  // re-analysis (and the network round-trip) if quests haven't changed
  // since the tool's own last run.
  const aiQuestHash = useRef<Record<AiTool, string>>({ autobalance: '', spark: '', advice: '', none: '' });
  const buildQuestHash = (qs: Quest[]) => qs.map(q => `${q.id}:${q.status}:${q.assignedToId ?? ''}:${q.bonusCoins}`).join('|');

  const runAI = async (tool: AiTool) => {
    if (isAiLoading) return;
    if (showAiTool === tool) { setShowAiTool('none'); return; }

    const currentHash = buildQuestHash(quests);
    const lastHash = aiQuestHash.current[tool];
    if (lastHash && currentHash === lastHash) {
      setShowAiTool(tool);
      return;
    }

    setIsAiLoading(true);
    setShowAiTool(tool);
    if (tool === 'autobalance') {
      try { setAutoBalResult(await callAutoBalance(quests, kids)); }
      catch (e) { console.warn('[KioskAiChoresEngine] AutoBalance AI failed, using local fallback:', e); setAutoBalResult(await callAutoBalanceFallback(quests, kids)); }
    } else if (tool === 'spark') {
      try { setFomoResult(await callFomo(quests, kids)); }
      catch (e) { console.warn('[KioskAiChoresEngine] Spark AI failed, using local fallback:', e); setFomoResult(buildFomoResult(quests, kids)); }
    } else if (tool === 'advice') {
      try { setAdviceResult(await callAdvice(quests, kids)); }
      catch (e) { console.warn('[KioskAiChoresEngine] Advice AI failed, using local fallback:', e); setAdviceResult(buildAdviceFallback(quests, kids)); }
    }
    aiQuestHash.current[tool] = currentHash;
    setIsAiLoading(false);
  };

  // Same real store mutations QuestsScreen.tsx's own handleApply performs
  // for each apply type — no new logic invented, just relocated.
  const handleApply = (key: string, item: any, type: string) => {
    setAppliedActions(p => ({ ...p, [key]: true }));
    const store = useQuestStore.getState();

    if (type === 'spark') {
      if (item.questId) {
        store.updateQuest(item.questId, { bonusCoins: item.bonusCoins, bonusExpiresAt: item.bonusExpiresAt }, activeMemberId);
      }
    } else if (type === 'penalty') {
      if (item.questId && item.targetKidId) {
        store.reassignQuest(item.questId, item.targetKidId, activeMemberId);
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
        createdById: activeMemberId,
      });
    } else if (type === 'reassign') {
      if (item.questId && item.recommendedKidId) {
        store.reassignQuest(item.questId, item.recommendedKidId, activeMemberId);
      }
    }
    if (key === 'advice_chat') {
      const notes = Object.entries(item.kidEncouragementNotes ?? {}).map(([name, note]) => `👤 *${name}*\n${note}`).join('\n\n');
      const rules = (item.suggestedRuleUpdates ?? []).map((r: string) => `→ ${r}`).join('\n');
      const cheat = item.cheatPatternAlert ? `\n\n⚠️ *Pattern Alert*\n${item.cheatPatternAlert}` : '';
      const top = item.topPerformer ? `\n\n🏆 *Top Performer this week: ${item.topPerformer}*` : '';
      const msg = [
        '✨ *AI Family Coaching Report*', '',
        `💡 ${item.familyCoachingTip}`, top, cheat,
        notes ? `\n📋 *Kid Notes*\n\n${notes}` : '',
        rules ? `\n📌 *Suggested Rules*\n${rules}` : '',
      ].filter(Boolean).join('\n');
      useChatStore.getState().sendMessage('all', activeMemberId, msg);
    }
  };

  return (
    <View>
      <AiEngineBanner
        showAiTool={showAiTool}
        isAiLoading={isAiLoading}
        onRunAI={runAI}
        colors={colors}
        isDark={isDark}
      />
      {showAiTool === 'autobalance' && !!autoBalResult && (
        <AutoBalanceCard
          result={autoBalResult} onApply={handleApply} appliedActions={appliedActions}
          onClose={() => setShowAiTool('none')} isDark={isDark} colors={colors} kids={kids}
        />
      )}
      {showAiTool === 'spark' && !!fomoResult && (
        <FomoCard
          result={fomoResult} onApply={handleApply} appliedActions={appliedActions}
          onClose={() => setShowAiTool('none')} isDark={isDark} colors={colors} kids={kids}
        />
      )}
      {showAiTool === 'advice' && !!adviceResult && (
        <AdviceCard
          result={adviceResult} onApply={handleApply} appliedActions={appliedActions}
          onClose={() => setShowAiTool('none')} isDark={isDark} colors={colors}
        />
      )}
    </View>
  );
}
