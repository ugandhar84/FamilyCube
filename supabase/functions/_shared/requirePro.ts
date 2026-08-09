/**
 * Server-side Pro subscription gate.
 *
 * Checks the caller's subscription row — NOT the pet owner's.
 * Subscription is per-user: a caretaker with a free account cannot
 * use Pro AI features even on a Pro owner's pet.
 *
 * Returns:
 *   'ok'      — user has an active Pro or Ultimate subscription
 *   'free'    — no subscription row or tier = 'free'
 *   'expired' — subscription lapsed (status = expired/cancelled and expires_at in the past)
 *   'grace'   — billing issue but still within grace period → allow (treat as ok)
 */
export type ProCheckResult = 'ok' | 'free' | 'expired' | 'grace';

export async function requirePro(db: any, userId: string): Promise<ProCheckResult> {
  const { data } = await db
    .from('subscriptions')
    .select('tier, status, expires_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.tier === 'free') return 'free';

  // Grace period: billing failed but not yet expired — give benefit of the doubt
  if (data.status === 'grace_period') return 'grace';

  // Defence-in-depth: if expires_at is set and in the past, treat as expired
  // regardless of status — catches webhook delivery failures.
  if (data.expires_at && new Date(data.expires_at) < new Date()) return 'expired';

  // Cancelled or expired status
  if (data.status === 'expired' || data.status === 'cancelled') return 'expired';

  // status === 'active' with valid (or no) expiry
  return 'ok';
}

/**
 * Bulk tier filter for cron/batch functions that process many users at once.
 * Returns only the user IDs whose subscription meets the minimum required tier.
 *
 * minTier:
 *   'pro'     → accepts pro OR ultimate
 *   'ultimate' → accepts ultimate only
 */
export async function filterByTier(
  db: any,
  userIds: string[],
  minTier: 'pro' | 'ultimate',
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const { data } = await db
    .from('subscriptions')
    .select('user_id, tier, status, expires_at')
    .in('user_id', userIds);

  if (!data) return [];

  const now = new Date();
  const allowed: string[] = [];

  for (const row of data) {
    // Must have the required tier
    const tierOk = minTier === 'pro'
      ? (row.tier === 'pro' || row.tier === 'ultimate')
      : row.tier === 'ultimate';
    if (!tierOk) continue;

    // Grace period — billing issue but still within window
    if (row.status === 'grace_period') { allowed.push(row.user_id); continue; }

    // Expired / cancelled: check actual expiry date
    if (row.status === 'expired' || row.status === 'cancelled') {
      if (row.expires_at && new Date(row.expires_at) >= now) {
        allowed.push(row.user_id);
      }
      continue;
    }

    // Active
    if (row.status === 'active') allowed.push(row.user_id);
  }

  return allowed;
}

/**
 * Stricter gate for Ultimate-exclusive features (e.g. vet-chat, symptom-scan).
 * Pro tier is NOT sufficient — only 'ultimate' is accepted.
 */
export async function requireUltimate(db: any, userId: string): Promise<ProCheckResult> {
  const { data } = await db
    .from('subscriptions')
    .select('tier, status, expires_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.tier !== 'ultimate') return 'free';

  if (data.status === 'grace_period') return 'grace';

  // Defence-in-depth: expires_at in the past → expired regardless of status field
  if (data.expires_at && new Date(data.expires_at) < new Date()) return 'expired';

  if (data.status === 'expired' || data.status === 'cancelled') return 'expired';

  return 'ok';
}

// ─────────────────────────────────────────────────────────────────────────────
// Context-tier helpers — caretaker inherits pet owner's tier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Low-level helper: fetch a single user's raw tier string from subscriptions.
 * Returns 'free' when no active subscription row exists.
 */
async function getTierForUser(db: any, userId: string): Promise<'free' | 'pro' | 'ultimate'> {
  const { data } = await db
    .from('subscriptions')
    .select('tier, status, expires_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return 'free';

  // Defence-in-depth: expires_at in the past → treat as free regardless of status
  if (data.expires_at && new Date(data.expires_at) < new Date()) return 'free';

  if (data.status === 'active' || data.status === 'grace_period') {
    return (data.tier ?? 'free') as 'free' | 'pro' | 'ultimate';
  }
  if (data.status === 'expired' || data.status === 'cancelled') {
    // expires_at in the future = cancelled-but-not-yet-lapsed (still valid)
    if (data.expires_at && new Date(data.expires_at) >= new Date()) {
      return data.tier as 'free' | 'pro' | 'ultimate';
    }
    return 'free';
  }
  return 'free';
}

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, ultimate: 2 };

/**
 * Returns the effective (context) tier for a user acting on a specific pet.
 *
 * - If the user owns the pet or has any non-caretaker role: returns their own tier.
 * - If the user is a CARETAKER on the pet: returns max(own tier, owner's tier).
 *   Caregiver and viewer do NOT inherit.
 *
 * Also returns `quotaUserId` — the user whose daily usage counter to check/increment.
 * Currently always the calling user (each caretaker gets their own quota slot).
 */
export async function getContextTier(
  db: any,
  userId: string,
  petId: string,
): Promise<{ tier: 'free' | 'pro' | 'ultimate'; quotaUserId: string }> {
  // Check if caller is a caretaker on this pet
  const { data: familyRow } = await db
    .from('pet_family')
    .select('role')
    .eq('pet_id', petId)
    .eq('user_id', userId)
    .maybeSingle();

  const isCaretaker = familyRow?.role === 'caretaker';
  const ownTier = await getTierForUser(db, userId);

  if (!isCaretaker) {
    return { tier: ownTier, quotaUserId: userId };
  }

  // Caretaker: inherit owner's tier if higher
  const { data: pet } = await db.from('pets').select('owner_id').eq('id', petId).maybeSingle();
  const ownerTier = pet?.owner_id ? await getTierForUser(db, pet.owner_id) : 'free';

  const effectiveTier = TIER_RANK[ownerTier] > TIER_RANK[ownTier] ? ownerTier : ownTier;
  return { tier: effectiveTier as 'free' | 'pro' | 'ultimate', quotaUserId: userId };
}

/**
 * Ultimate gate with context-tier support.
 * Pass `petId` when the caller may be a caretaker inheriting the owner's Ultimate.
 */
export async function requireUltimateForPet(
  db: any,
  userId: string,
  petId: string,
): Promise<ProCheckResult> {
  const { tier } = await getContextTier(db, userId, petId);
  if (tier !== 'ultimate') return 'free';
  return 'ok';
}

/**
 * Pro gate with context-tier support (accepts pro OR ultimate).
 */
export async function requireProForPet(
  db: any,
  userId: string,
  petId: string,
): Promise<ProCheckResult> {
  const { tier } = await getContextTier(db, userId, petId);
  if (tier === 'free') return 'free';
  return 'ok';
}

/** Returns a JSON 402 response for blocked Pro requests. */
export function proRequiredResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Pro or Ultimate subscription required', code: 'pro_required' }),
    { status: 402, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Returns a JSON 402 response for blocked Ultimate-only requests. */
export function ultimateRequiredResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Ultimate subscription required', code: 'ultimate_required' }),
    { status: 402, headers: { 'Content-Type': 'application/json' } },
  );
}
