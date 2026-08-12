// FamilyCube — Edge Function: family-ai
// Multi-action AI endpoint with real FOMO escalation logic.
//
// Model strategy:
//   - Text-only actions  → DeepSeek (primary), Gemini (fallback)
//   - OCR / image actions (flyer_scan) → Gemini only
//
// Deploy: supabase functions deploy family-ai
// Secrets required: GEMINI_API_KEY, DEEPSEEK_API_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const GEMINI_KEY    = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_URL    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DEEPSEEK_KEY  = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
const DEEPSEEK_URL  = 'https://api.deepseek.com/chat/completions';

// ─── Model calls ──────────────────────────────────────────────────────────────

async function callGemini(prompt: string, imageBase64?: string, imageMimeType?: string, jsonMode = true): Promise<string> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  const parts: unknown[] = [];
  if (imageBase64) parts.push({ inlineData: { mimeType: imageMimeType ?? 'image/jpeg', data: imageBase64 } });
  parts.push({ text: prompt });
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      ...(jsonMode ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callDeepSeek(prompt: string, jsonMode = true): Promise<string> {
  if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY not configured');
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('DeepSeek returned empty response');
  return text;
}

async function callAI(prompt: string, jsonMode = true): Promise<string> {
  try { return await callDeepSeek(prompt, jsonMode); }
  catch (err) {
    console.warn('[family-ai] DeepSeek failed, falling back to Gemini:', (err as Error).message);
    return callGemini(prompt, undefined, undefined, jsonMode);
  }
}

function parseJson<T>(text: string, fallback: T): T {
  try { return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim()) as T; }
  catch { return fallback; }
}

// ─── FOMO helpers ─────────────────────────────────────────────────────────────

/**
 * Weighted-random fair pick for force-assign target.
 * Lighter quest load = higher probability, but it IS random — nobody is certain.
 * Excludes the current assignee and any kid with 5+ open quests.
 */
function pickPenaltyTarget(kids: any[], quests: any[], excludeId?: string): any | null {
  const openCount = (kidId: string) =>
    quests.filter((q: any) => q.assignedToId === kidId && q.status !== 'done' && q.status !== 'approved').length;

  const eligible = kids
    .filter((k: any) => k.id !== excludeId && openCount(k.id) < 5)
    .map((k: any) => ({ ...k, load: openCount(k.id) }));

  if (!eligible.length) return kids.find((k: any) => k.id !== excludeId) ?? kids[0] ?? null;

  // weight = inverse of load — lighter kids get picked more often but it's still random
  const maxLoad = Math.max(...eligible.map((k: any) => k.load), 0);
  const weighted = eligible.map((k: any) => ({ ...k, weight: maxLoad + 1 - k.load }));
  const total = weighted.reduce((s: number, k: any) => s + k.weight, 0);

  let rand = Math.random() * total;
  for (const k of weighted) {
    rand -= k.weight;
    if (rand <= 0) return k;
  }
  return weighted[weighted.length - 1];
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function flyerScan(body: Record<string, unknown>) {
  const { flyerText, events, imageBase64, imageMimeType } = body as any;
  const hasImage = Boolean(imageBase64);
  const prompt = `You are the AI assistant for a family OS app called FamilyCube.
${hasImage ? 'Carefully read the school flyer in the image.' : `Extract event details from: "${flyerText}"`}
${flyerText && hasImage ? `Additional text context: "${flyerText}"` : ''}
Existing family schedule: ${JSON.stringify(events ?? [])}

Return JSON: { title, date (YYYY-MM-DD), time ("HH:MM AM/PM"), category ("School"|"Sports"|"Work"|"Medical"|"Study"|"Family"|"Activity"), location, member, conflictDetected (bool), suggestedDriver, summary, additionalEvents[] }`;

  const text = hasImage ? await callGemini(prompt, imageBase64, imageMimeType) : await callAI(prompt);
  return parseJson(text, { title: 'Scanned Event', date: new Date().toISOString().slice(0, 10), time: '03:00 PM', category: 'School', location: 'School', member: 'Family', conflictDetected: false, suggestedDriver: '', summary: 'Could not extract event details.', additionalEvents: [] });
}

async function conflictCheck(body: Record<string, unknown>) {
  const { events } = body;
  const prompt = `You are the AI Family Schedule Logistics Agent.
Analyze these family events for conflicts (time overlaps, unassigned drivers, double-booked parents):
${JSON.stringify(events)}

Return JSON: { conflictsFound (bool), conflictSummary, resolutions: [{ eventId, eventTitle, issue, recommendedDriver, reason }], suggestedScheduleAdjustments: string[] }`;

  const text = await callAI(prompt);
  return parseJson(text, { conflictsFound: false, conflictSummary: 'No conflicts detected.', resolutions: [], suggestedScheduleAdjustments: [] });
}

async function choreBalance(body: Record<string, unknown>) {
  const { members, quests } = body;
  const kids = (members as any[]).filter((m: any) => m.role === 'kid' || m.role === 'child');
  const prompt = `You are the AI Household Chore Auto-Balancer for FamilyCube.
Kids: ${JSON.stringify(kids)}
Current quest pool: ${JSON.stringify(quests)}

Rules:
- Distribute by age-appropriateness, difficulty, and coin equity
- Flag any kid who is clearly overloaded vs underloaded
- Suggest 2-3 NEW quest ideas for underloaded kids based on their age

Return JSON: {
  summary: string,
  assignments: [{ questId, questTitle, currentKidName, recommendedKidName, recommendedKidId, reason }],
  newSuggestedQuests: [{ title, category, coins, ageMin, ageMax, suggestedForKidName, reason, difficulty }],
  balanceReport: { [kidName]: { openQuests, coinsPotential, loadRating: "light"|"balanced"|"heavy" } }
}`;

  const text = await callAI(prompt);
  return parseJson(text, { summary: 'Chores auto-balanced.', assignments: [], newSuggestedQuests: [], balanceReport: {} });
}

async function fomoEngine(body: Record<string, unknown>) {
  const { quests, members } = body as { quests: any[]; members: any[] };
  const now   = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const kids  = members.filter((m: any) => m.role === 'kid' || m.role === 'child');

  // ── Classify each quest by state ─────────────────────────────────────────────
  // BONUS candidates: nobody has acted yet
  const unclaimedPool      = quests.filter(q => q.isPool && (q.status === 'todo' || q.status === 'pool') && (!q.participants || q.participants.length === 0));
  const assignedNotStarted = quests.filter(q => !q.isPool && q.status === 'todo' && q.dueDate && q.dueDate <= today);

  // PENALTY candidates: someone dropped the ball
  const claimedGhosted = quests.filter(q => !q.isPool && q.status === 'claimed' && q.dueDate && q.dueDate <= today);
  const stuckOverdue   = quests.filter(q =>
    q.status === 'in_progress' && q.dueDate && q.dueDate <= today &&
    q.claimedAt && (now - new Date(q.claimedAt).getTime()) > 4 * 3600_000
  );

  // ESCALATED: bonus was already given but the quest is still untouched (FOMO ran before → now punishment)
  const bonusIgnored = [...unclaimedPool, ...assignedNotStarted].filter(q =>
    q.bonusCoins > 0 && q.bonusExpiresAt && new Date(q.bonusExpiresAt).getTime() < now
  );

  // Only apply bonus to quests that have NOT had a previous bonus run
  const bonusCandidates   = [...unclaimedPool, ...assignedNotStarted].filter(q => !q.bonusCoins || q.bonusCoins === 0).slice(0, 4);
  const penaltyCandidates = [...bonusIgnored, ...claimedGhosted, ...stuckOverdue]
    .sort((a: any, b: any) => {
      const rank = (p: string) => p === 'urgent' ? 3 : p === 'high' ? 2 : 1;
      return rank(b.priority) - rank(a.priority);
    })
    .slice(0, 3);

  // ── Build bonus alerts ────────────────────────────────────────────────────────
  const urgentAlerts = bonusCandidates.map((q: any, i: number) => {
    const rawBonus    = Math.max(10, Math.min(50, Math.round((q.coins * 0.25) / 5) * 5));
    const hoursLeft   = i < 2 ? 2 : 4;
    const bonusExpiresAt = new Date(now + hoursLeft * 3600_000).toISOString();
    const alreadyHasBonus = Boolean(q.bonusCoins > 0 && q.bonusExpiresAt && new Date(q.bonusExpiresAt).getTime() > now);
    const daysOverdue = q.dueDate ? Math.max(0, Math.floor((now - new Date(q.dueDate).getTime()) / 86400_000)) : 0;
    const fomoMessage = q.isPool
      ? `⚡ Nobody has claimed this yet — +${rawBonus}🪙 flash bonus expires in ${hoursLeft}h!`
      : daysOverdue > 1
        ? `🚨 ${daysOverdue}d overdue and not even started — claim this +${rawBonus}🪙 bonus in ${hoursLeft}h!`
        : `⏰ Due today and not started — flash bonus expires in ${hoursLeft}h!`;
    return { questId: q.id, questTitle: q.title, bonusCoins: rawBonus, bonusExpiresAt, fomoMessage, alreadyHasBonus };
  });

  // ── Build penalty / force-assign actions ─────────────────────────────────────
  const penaltiesAndForceAssigns = penaltyCandidates.map((q: any) => {
    const currentAssignee = kids.find((k: any) => k.id === q.assignedToId);
    const target = pickPenaltyTarget(kids, quests, currentAssignee?.id);
    const daysOver = q.dueDate ? Math.max(0, Math.floor((now - new Date(q.dueDate).getTime()) / 86400_000)) : 0;
    const isEscalated  = bonusIgnored.some((b: any) => b.id === q.id); // had a bonus, still ignored
    const isGhosted    = q.status === 'claimed';

    // Escalated = harsher coin penalty (25% of quest value deducted from offender)
    const coinPenalty  = isEscalated ? Math.round(q.coins * 0.25) : 0;

    const penaltyReason = isEscalated
      ? `${currentAssignee?.name ?? 'A kid'} ignored a FOMO bonus that already expired — escalating to force-assign + ${coinPenalty}🪙 deduction.`
      : isGhosted
        ? `${currentAssignee?.name ?? 'A kid'} claimed this ${daysOver}d ago then ghosted — blocking other kids from grabbing it.`
        : `${currentAssignee?.name ?? 'A kid'} started this ${daysOver}d ago and still hasn't submitted — overdue.`;

    const selectionNote = target
      ? `${target.name} was randomly selected (${target.load ?? 0} open quests — fair load)`
      : 'No eligible kid found';

    return {
      questId:        q.id,
      questTitle:     q.title,
      targetKidId:    target?.id,
      targetKidName:  target?.name ?? 'the lightest-load kid',
      currentKidId:   currentAssignee?.id,
      currentKidName: currentAssignee?.name,
      daysOverdue:    daysOver,
      coinPenalty,
      penaltyReason,
      selectionNote,
      action: currentAssignee
        ? `Force-assign from ${currentAssignee.name} → ${target?.name ?? '?'}${coinPenalty ? ` + deduct ${coinPenalty}🪙` : ''}`
        : `Assign to ${target?.name ?? '?'}`,
    };
  });

  // ── AI-generated nudge messages for bonus alerts ──────────────────────────────
  let aiNudges: Record<string, string> = {};
  if (bonusCandidates.length > 0) {
    const nudgePrompt = `You are the FamilyCube gamification engine. Generate short, fun, age-appropriate FOMO messages for kids to claim these quests:
${JSON.stringify(bonusCandidates.map((q: any) => ({ title: q.title, coins: q.coins, dueDate: q.dueDate })))}

Return JSON: { [questTitle]: "one-line exciting message max 80 chars, use emojis" }`;
    try {
      const t = await callAI(nudgePrompt);
      aiNudges = parseJson<Record<string, string>>(t, {});
    } catch { /* non-blocking */ }
  }

  // Merge AI nudges into urgentAlerts
  const enrichedAlerts = urgentAlerts.map((a: any) => ({
    ...a,
    fomoMessage: aiNudges[a.questTitle] ?? a.fomoMessage,
  }));

  const totalIssues = bonusCandidates.length + penaltyCandidates.length;
  const fomoNudgeSummary = totalIssues === 0
    ? 'All quests are on track! You can still add flash bonuses to pool bounties to drive faster claims.'
    : `${bonusCandidates.length} quest${bonusCandidates.length !== 1 ? 's' : ''} need a bonus nudge — ${penaltyCandidates.length} need a penalty action.${bonusIgnored.length > 0 ? ` ⚠️ ${bonusIgnored.length} ignored a previous bonus — penalties escalated.` : ''}`;

  return { fomoNudgeSummary, urgentAlerts: enrichedAlerts, penaltiesAndForceAssigns };
}

async function symptomCheck(body: Record<string, unknown>) {
  const { symptoms, memberName, age } = body;
  const prompt = `You are a warm, pediatric and senior family health assistant.
Member: ${memberName ?? 'Family member'} (age ${age ?? 'unknown'})
Symptoms: "${symptoms}"

Return JSON: { assessment, urgency ("Low / Home Care"|"Moderate / Monitor"|"High / Consult Pediatrician"), actionItems: string[3], suggestedMeds: string[2], disclaimer }`;

  const text = await callAI(prompt);
  return parseJson(text, { assessment: 'Unable to assess. Please consult a healthcare professional.', urgency: 'Moderate / Monitor', actionItems: ['Monitor symptoms', 'Stay hydrated', 'Rest'], suggestedMeds: ['Consult pharmacist'], disclaimer: 'This is AI-generated information, not medical advice.' });
}

async function milestoneCheck(body: Record<string, unknown>) {
  const { childName, ageYears } = body;
  const prompt = `You are an AI Pediatric Milestone Specialist.
Child: ${childName}, age ${ageYears} years.
Return JSON: { childName, ageYears, expectedMilestones: string[], recommendedActivities: string[], pediatricianCheckupNote }`;

  const text = await callAI(prompt);
  return parseJson(text, { childName, ageYears, expectedMilestones: [], recommendedActivities: [], pediatricianCheckupNote: 'Consult your pediatrician during annual well-child visits.' });
}

async function mealPlan(body: Record<string, unknown>) {
  const { preferences, days, members } = body;
  const prompt = `You are the AI Family Nutrition & Meal Planning Agent.
Preferences: "${preferences ?? 'Kid-friendly, balanced, 30 min prep'}"
Family members: ${JSON.stringify(members ?? [])}
Generate a ${(days as number) || 5}-day family dinner plan.
Return JSON: { weeklyMeals: [{ day, mealName, prepMinutes, dietaryTags: string[], kidFriendlyRating: 1-5, ingredientsList: string[] }], groceryAutoList: string[], nutritionCoachingTip }`;

  const text = await callAI(prompt);
  return parseJson(text, { weeklyMeals: [], groceryAutoList: [], nutritionCoachingTip: 'Involve kids in meal prep to increase acceptance of new foods.' });
}

async function rewardSuggest(body: Record<string, unknown>) {
  const { kids } = body;
  const prompt = `You are the AI Gamification & Reward Strategy Agent for FamilyCube.
Kids profiles: ${JSON.stringify(kids)}
Suggest 3-4 high-motivation experiential perks.
Return JSON: { personalizedPerks: [{ title, coins, category ("Treats"|"Experiences"|"Screen Time"|"Privileges"), targetKid, motivationReason, icon }], incentiveStrategyNote }`;

  const text = await callAI(prompt);
  return parseJson(text, { personalizedPerks: [], incentiveStrategyNote: 'Experiential rewards create lasting behavioral reinforcement.' });
}

async function choresAdvice(body: Record<string, unknown>) {
  const { members, quests } = body as { members: any[]; quests: any[] };
  const today = new Date().toISOString().split('T')[0];
  const kids  = members.filter((m: any) => m.role === 'kid' || m.role === 'child');

  // Pre-compute real stats per kid so AI has structured, accurate data
  const kidStats = kids.map((k: any) => {
    const mine      = quests.filter((q: any) => q.assignedToId === k.id);
    const done      = mine.filter((q: any) => q.status === 'done' || q.status === 'approved').length;
    const overdue   = mine.filter((q: any) => q.dueDate && q.dueDate <= today && q.status !== 'done' && q.status !== 'approved').length;
    const ghosted   = mine.filter((q: any) => q.status === 'claimed' && q.dueDate && q.dueDate <= today).length;
    const inProgress = mine.filter((q: any) => q.status === 'in_progress').length;
    return { name: k.name, age: k.age ?? '?', done, overdue, ghosted, inProgress, totalAssigned: mine.length };
  });

  const prompt = `You are the AI Family Advisor & Parenting Coach for FamilyCube.

Kid stats (real data — do not make up numbers):
${JSON.stringify(kidStats)}

Rules:
- If any kid has ghosted > 0: flag the "claim and ignore" loophole explicitly and suggest a family rule
- If a kid has overdue > 2: suggest breaking tasks into smaller steps
- Top performer = kid with most "done" quests
- Encouragement notes must be specific to each kid's actual numbers

Return JSON: {
  familyCoachingTip: string (specific to actual patterns found),
  topPerformer: string (kid name),
  kidEncouragementNotes: { [kidName]: string },
  suggestedRuleUpdates: string[],
  cheatPatternAlert: string | null (null if no ghost pattern detected)
}`;

  const text = await callAI(prompt);
  return parseJson(text, { familyCoachingTip: 'Great effort this week!', topPerformer: '', kidEncouragementNotes: {}, suggestedRuleUpdates: [], cheatPatternAlert: null });
}

async function parentQa(body: Record<string, unknown>) {
  const { question, role } = body;
  const sanitized = (question as string)
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[PHONE]');
  const prompt = `You are "ParentAI", an empathetic parenting assistant. Role: ${role ?? 'parent'}. Question: "${sanitized}". Provide 3 practical actionable points. Plain text, no JSON.`;
  const text = await callAI(prompt, false);
  return { answer: text, sanitized };
}

async function smartChores(body: Record<string, unknown>) {
  const { category, age } = body;
  const prompt = `Generate 3 age-appropriate chores for a child aged ${age} in category "${category}".
Return JSON array: [{ title, coins (10-60), category, description }]`;
  const text = await callAI(prompt);
  return parseJson(text, []);
}

async function groceryAi(body: Record<string, unknown>) {
  const { prompt, context, existingItems, cultureHint } = body as any;
  const cultureNote = cultureHint === 'indian'
    ? 'Indian cooking traditions. Include atta, dal, rice, ghee, spices, paneer, fresh vegetables, etc. Use kg/g.'
    : cultureHint === 'american'
    ? 'American shopping habits. Include packaged goods, produce by pound, dairy, frozen foods.'
    : 'Common grocery items.';
  const existingNote = existingItems?.length ? `\nAlready in list (mark as duplicate): ${existingItems.join(', ')}` : '';
  const aiPrompt = `You are a smart grocery assistant for FamilyCube.\n${cultureNote}${existingNote}\n${context ? `Context: ${context}\n` : ''}User request: "${prompt}"\n\nReturn JSON: { items: [{ name, quantity, category, storePreference?, notes?, isDuplicate }], summary }`;
  const text = await callAI(aiPrompt);
  return parseJson<{ items: unknown[]; summary: string }>(text, { items: [], summary: 'Could not generate list.' });
}

// ─── Router ───────────────────────────────────────────────────────────────────

const ACTIONS: Record<string, (b: Record<string, unknown>) => Promise<unknown>> = {
  flyer_scan:      flyerScan,
  conflict_check:  conflictCheck,
  chore_balance:   choreBalance,
  fomo_engine:     fomoEngine,
  symptom_check:   symptomCheck,
  milestone_check: milestoneCheck,
  meal_plan:       mealPlan,
  reward_suggest:  rewardSuggest,
  chores_advice:   choresAdvice,
  parent_qa:       parentQa,
  smart_chores:    smartChores,
  grocery_ai:      groceryAi,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body   = await req.json() as Record<string, unknown>;
    const action = body.action as string;
    if (!action || !ACTIONS[action])
      return json({ error: `Unknown action: ${action}. Valid: ${Object.keys(ACTIONS).join(', ')}` }, 400);
    if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY not configured' }, 503);
    if (!DEEPSEEK_KEY) console.warn('[family-ai] DEEPSEEK_API_KEY not set — using Gemini only.');
    const result = await ACTIONS[action](body);
    return json({ ok: true, action, result });
  } catch (e: any) {
    console.error('[family-ai]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
