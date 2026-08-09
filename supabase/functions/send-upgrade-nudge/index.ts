/**
 * send-upgrade-nudge — context-aware Ultimate upgrade push notifications
 *
 * Runs daily at 10:00 AM. Targets free-tier users who have quiz_concerns
 * on any of their pets. Sends ONE nudge per user per interval (deduped),
 * with copy tailored to a concern from their quiz answers.
 *
 * Config keys in app_settings (admin-configurable):
 *   upgrade_nudge_enabled       boolean  — master kill switch (default true)
 *   upgrade_nudge_interval_days number   — min days between nudges (default 1)
 *   upgrade_nudge_concern_mode  string   — "random" | "priority" (default "random")
 *
 * Suppressed by:
 *   • upgrade_nudge_enabled = false
 *   • Quiet hours (local 8AM–9PM check per user timezone)
 *   • Already subscribed (pro / ultimate)
 *   • Nudge sent within interval_days (notification_logs dedup)
 *
 * Deploy:  supabase functions deploy send-upgrade-nudge
 * Cron:    0 10 * * *
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function isCronAuthorized(req: Request): boolean {
  const auth  = req.headers.get('authorization') ?? '';
  const token = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return auth === `Bearer ${token}`;
}

// ── Concern priority + message copy ──────────────────────────────────────────

const CONCERN_PRIORITY = [
  'emergency', 'anxiety', 'stomach', 'skin', 'joints', 'weight', 'dental', 'schedule',
];

const CONCERN_COPY: Record<string, (petName: string) => { title: string; body: string }[]> = {
  emergency: (n) => [
    { title: `🚨 Is ${n} okay right now?`, body: `When something feels wrong at 2 AM, PetDoc AI gives you expert triage in seconds — no waiting room needed.` },
    { title: `🚨 Emergency? Don't wait.`, body: `PetDoc AI triages ${n}'s symptoms instantly and tells you whether it's a vet visit or watch-and-wait.` },
  ],
  anxiety: (n) => [
    { title: `😰 ${n}'s anxiety keeping you up?`, body: `PetDoc AI can assess stress triggers for ${n} 24/7 and tell you if it needs a vet visit.` },
    { title: `😟 Help ${n} stay calm`, body: `Describe ${n}'s anxious behaviour to PetDoc AI and get a personalised calming plan in seconds.` },
  ],
  stomach: (n) => [
    { title: `🤢 Worried about ${n}'s stomach?`, body: `Describe the symptoms to PetDoc AI and get instant triage — before spending $150 at an emergency clinic.` },
    { title: `🤮 ${n} not keeping food down?`, body: `PetDoc AI knows when vomiting is serious — get an expert read any time, day or night.` },
  ],
  skin: (n) => [
    { title: `🩹 Noticed something on ${n}'s skin?`, body: `Upload a photo to PetDoc AI's Symptom Scanner and get an expert read in seconds.` },
    { title: `🔍 Spot, rash, or lump on ${n}?`, body: `PetDoc AI's photo scan can identify common skin conditions and flag anything that needs a vet.` },
  ],
  joints: (n) => [
    { title: `🦴 Is ${n} moving slower lately?`, body: `PetDoc AI can assess joint and mobility symptoms for ${n} — available 24/7, no appointment needed.` },
    { title: `🐾 ${n} limping or stiff?`, body: `Joint issues caught early are easier to treat. PetDoc AI tells you what to watch and when to act.` },
  ],
  weight: (n) => [
    { title: `⚖️ Keeping ${n}'s weight on track?`, body: `PetDoc AI gives personalised diet and activity advice for ${n} based on breed, age, and weight trends.` },
    { title: `🥗 Is ${n}'s diet right for them?`, body: `PetDoc AI analyses ${n}'s weight history and recommends the right calories and food type.` },
  ],
  dental: (n) => [
    { title: `🦷 When did ${n} last have a dental check?`, body: `PetDoc AI can flag dental concerns early for ${n} — before they turn into costly extractions.` },
    { title: `😬 Bad breath from ${n}?`, body: `Dental disease is the #1 hidden health issue in pets. PetDoc AI spots early signs before they hurt.` },
  ],
  schedule: (n) => [
    { title: `🗓️ Staying on top of ${n}'s care?`, body: `Ultimate gives ${n} unlimited vet chat, smart reminders, and full health history — everything in one place.` },
    { title: `📋 Never miss a thing for ${n}`, body: `Vaccine reminders, grooming schedules, meds — Ultimate keeps all of ${n}'s care on autopilot.` },
  ],
};

const DEFAULT_COPY = (petName: string) => [
  { title: `🩺 Get 24/7 vet care for ${petName}`, body: `PetDoc AI answers your pet health questions any time — skip the $150 emergency clinic visit.` },
  { title: `💜 ${petName} deserves the best care`, body: `Ultimate unlocks unlimited vet chat, symptom scanning, and AI-powered health insights for ${petName}.` },
];

function pickCopy(concern: string | null, petName: string, lastTitle?: string): { title: string; body: string } {
  const variants = concern ? (CONCERN_COPY[concern]?.(petName) ?? DEFAULT_COPY(petName)) : DEFAULT_COPY(petName);
  // Avoid repeating the same title as last nudge
  const fresh = variants.filter(v => v.title !== lastTitle);
  const pool  = fresh.length > 0 ? fresh : variants;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Quiet hours helper ────────────────────────────────────────────────────────

function isQuietHour(tz: string | null): boolean {
  const now = new Date();
  try {
    const h = parseInt(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC' })
        .formatToParts(now).find(p => p.type === 'hour')?.value ?? '12',
      10,
    );
    return h < 8 || h >= 21;
  } catch {
    const h = now.getUTCHours();
    return h < 8 || h >= 21;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── 0. Read admin config ──────────────────────────────────────────────────
  const { data: configRows } = await supabase
    .from('app_settings')
    .select('key,value')
    .in('key', ['upgrade_nudge_enabled', 'upgrade_nudge_interval_days', 'upgrade_nudge_concern_mode']);

  const cfg: Record<string, unknown> = Object.fromEntries((configRows ?? []).map((r: any) => [r.key, r.value]));
  const nudgeEnabled    = cfg['upgrade_nudge_enabled']       !== false;
  const intervalDays    = typeof cfg['upgrade_nudge_interval_days'] === 'number' ? cfg['upgrade_nudge_interval_days'] as number : 1;
  const concernMode     = (cfg['upgrade_nudge_concern_mode'] as string) ?? 'random';

  if (!nudgeEnabled) return json({ sent: 0, reason: 'upgrade_nudge_enabled = false' });

  const cutoff = new Date(Date.now() - intervalDays * 86_400_000).toISOString();

  // ── 1. Free-tier users who have at least one pet with quiz_concerns ────────
  const { data: pets } = await supabase
    .from('pets')
    .select('id, name, emoji, owner_id, quiz_concerns, quiz_expense_idx')
    .not('quiz_concerns', 'is', null)
    .not('owner_id', 'is', null);

  if (!pets?.length) return json({ sent: 0, reason: 'no pets with quiz data' });

  const byOwner = new Map<string, typeof pets>();
  for (const p of pets) {
    if (!byOwner.has(p.owner_id)) byOwner.set(p.owner_id, []);
    byOwner.get(p.owner_id)!.push(p);
  }

  const ownerIds = [...byOwner.keys()];

  // ── 2. Filter to free-tier only ───────────────────────────────────────────
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('user_id, tier, status')
    .in('user_id', ownerIds);

  const paidUsers = new Set(
    (subs ?? [])
      .filter((s: any) => (s.tier === 'pro' || s.tier === 'ultimate') && s.status === 'active')
      .map((s: any) => s.user_id),
  );
  const freeOwnerIds = ownerIds.filter(id => !paidUsers.has(id));
  if (!freeOwnerIds.length) return json({ sent: 0, reason: 'no free-tier users' });

  // ── 3. Dedup — skip users nudged within the interval window ──────────────
  const { data: sentRecently } = await supabase
    .from('notification_logs')
    .select('user_id, metadata')
    .in('user_id', freeOwnerIds)
    .eq('type', 'upgrade_nudge')
    .gte('sent_at', cutoff);

  // Track last concern + title sent per user so we can avoid repetition
  const lastNudgeByUser = new Map<string, { concern: string | null; title: string | null }>();
  for (const row of (sentRecently ?? [])) {
    if (!lastNudgeByUser.has(row.user_id)) {
      lastNudgeByUser.set(row.user_id, {
        concern: (row.metadata as any)?.concern ?? null,
        title:   (row.metadata as any)?.title   ?? null,
      });
    }
  }

  const alreadySent = new Set(lastNudgeByUser.keys());
  const targetIds   = freeOwnerIds.filter(id => !alreadySent.has(id));
  if (!targetIds.length) return json({ sent: 0, reason: 'all already nudged within interval' });

  // ── 4. Check notif_upgrade preference + push tokens + timezones ──────────
  const [profileRes, tokenRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, timezone, notif_upgrade')
      .in('id', targetIds),
    supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', targetIds)
      .like('token', 'ExponentPushToken%'),
  ]);

  const optedOut = new Set(
    (profileRes.data ?? [])
      .filter((r: any) => r.notif_upgrade === false)
      .map((r: any) => r.id),
  );

  const tzByUser = new Map<string, string | null>(
    (profileRes.data ?? []).map((r: any) => [r.id, r.timezone ?? null]),
  );

  const tokensByUser = new Map<string, string[]>();
  for (const t of (tokenRes.data ?? [])) {
    if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
    tokensByUser.get(t.user_id)!.push(t.token);
  }

  // ── 5. Build messages ─────────────────────────────────────────────────────
  const messages: any[] = [];
  const logRows: any[] = [];

  for (const userId of targetIds) {
    if (optedOut.has(userId)) continue;
    const tokens = tokensByUser.get(userId);
    if (!tokens?.length) continue;
    if (isQuietHour(tzByUser.get(userId) ?? null)) continue;

    const userPets = byOwner.get(userId) ?? [];

    // Collect all (concern, petName) pairs across all pets
    const allPairs: Array<{ concern: string; petName: string }> = [];
    for (const pet of userPets) {
      if (Array.isArray(pet.quiz_concerns)) {
        for (const c of pet.quiz_concerns) {
          allPairs.push({ concern: c, petName: pet.name });
        }
      }
    }

    let chosenConcern: string | null = null;
    let chosenPetName = userPets[0]?.name ?? 'your pet';

    if (allPairs.length > 0) {
      if (concernMode === 'priority') {
        // Pick highest-priority concern, deterministic
        for (const concern of CONCERN_PRIORITY) {
          const match = allPairs.find(p => p.concern === concern);
          if (match) { chosenConcern = concern; chosenPetName = match.petName; break; }
        }
      } else {
        // Random: pick from all pairs, preferring one different from last sent
        const lastConcern = lastNudgeByUser.get(userId)?.concern ?? null;
        const fresh = allPairs.filter(p => p.concern !== lastConcern);
        const pool  = fresh.length > 0 ? fresh : allPairs;
        const pick  = pool[Math.floor(Math.random() * pool.length)];
        chosenConcern = pick.concern;
        chosenPetName = pick.petName;
      }
    }

    const lastTitle = lastNudgeByUser.get(userId)?.title ?? undefined;
    const copy = pickCopy(chosenConcern, chosenPetName, lastTitle);

    for (const token of tokens) {
      messages.push({
        to:        token,
        title:     copy.title,
        body:      copy.body,
        data:      { type: 'upgrade_nudge', screen: 'paywall' },
        sound:     'default',
        channelId: 'upgrade',
      });
    }

    logRows.push({
      user_id:  userId,
      type:     'upgrade_nudge',
      pet_id:   userPets[0]?.id ?? null,
      sent_at:  new Date().toISOString(),
      metadata: { concern: chosenConcern, petName: chosenPetName, title: copy.title },
    });
  }

  if (!messages.length) return json({ sent: 0, reason: 'no eligible recipients after gates' });

  // ── 6. Send via Expo ──────────────────────────────────────────────────────
  const BATCH = 100;
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const r = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(batch),
      });
      if (r.ok) sent += batch.length;
    } catch (e) {
      console.error('[nudge] batch error:', e);
    }
  }

  // ── 7. Log sends ──────────────────────────────────────────────────────────
  if (logRows.length) {
    await supabase.from('notification_logs').insert(logRows);
  }

  console.log(`[nudge] mode=${concernMode} interval=${intervalDays}d sent=${sent} users=${logRows.length}`);
  return json({ sent, users: logRows.length, mode: concernMode, intervalDays });
});
