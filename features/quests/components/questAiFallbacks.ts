import { todayLocal, parseLocalDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

// "2h ago", "3d ago", "just now"
// "HH:MM" (24h, as stored on the quest) → "3:30 PM"
export function fmt12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function timeAgo(iso: string): string {
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

export function callAutoBalanceFallback(quests: any[], kids: any[]) {
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

export function buildAdviceFallback(quests: any[], kids: any[]) {
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

export async function callAutoBalance(quests: any[], kids: any[]) {
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
export function buildFomoResult(quests: any[], kids: any[]) {
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

export async function callFomo(quests: any[], kids: any[]) {
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

export async function callAdvice(quests: any[], kids: any[]) {
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
