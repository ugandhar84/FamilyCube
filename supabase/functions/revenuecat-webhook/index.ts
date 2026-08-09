import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Map RevenueCat event types to subscription actions
const ACTIVE_EVENTS   = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);
const GRACE_EVENTS    = new Set(['BILLING_ISSUE']);
const INACTIVE_EVENTS = new Set(['EXPIRATION', 'CANCELLATION']);

function getTierFromProductId(productId: string, entitlements?: Record<string, unknown>): 'free' | 'pro' | 'ultimate' {
  // Check entitlements first (most reliable)
  if (entitlements?.['ultimate']) return 'ultimate';
  if (entitlements?.['pro'])      return 'pro';
  // Fall back to product ID matching
  if (productId.includes('ultimate')) return 'ultimate';
  if (productId.includes('pro'))      return 'pro';
  // Generic RC test products — default to ultimate for sandbox testing
  if (productId === 'monthly' || productId === 'yearly') return 'ultimate';
  return 'free';
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Fail closed: if the secret env var is not set, refuse all requests
  if (!WEBHOOK_SECRET) {
    return new Response('Webhook secret not configured', { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await req.json();
    const event = body?.event;

    if (!event) return new Response('Missing event', { status: 400 });

    const eventType   = event.type as string;
    const appUserId   = event.app_user_id as string;  // = Supabase user UUID
    const productId   = event.product_id as string;
    // RC sends entitlement_ids as string[] in webhook events
    const entitlementIds = event.entitlement_ids as string[] | undefined;
    const entitlements = entitlementIds
      ? Object.fromEntries(entitlementIds.map((id: string) => [id, true]))
      : undefined;
    const expiresAt   = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    if (!appUserId) return new Response('Missing app_user_id', { status: 400 });

    if (ACTIVE_EVENTS.has(eventType)) {
      const newTier = getTierFromProductId(productId, entitlements);

      // Read the current tier so we know what to fall back to if this subscription expires.
      // A free user going to Pro records fallback = 'free'.
      // A Pro user going to Ultimate records fallback = 'pro'.
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('tier, fallback_tier')
        .eq('user_id', appUserId)
        .maybeSingle();

      // Fallback = whatever the user currently has (before this upgrade), capped below the new tier.
      // If the new tier IS the same or lower (e.g. renewal), keep the existing fallback_tier.
      const tierRank: Record<string, number> = { free: 0, pro: 1, ultimate: 2 };
      const currentTier = (existing?.tier ?? 'free') as string;
      const fallbackTier = (tierRank[newTier] > tierRank[currentTier])
        ? currentTier                           // upgrading → record current as fallback
        : (existing?.fallback_tier ?? 'free');  // renewal / same tier → preserve existing fallback

      await supabase.from('subscriptions').upsert({
        user_id:                appUserId,
        tier:                   newTier,
        status:                 'active',
        product_id:             productId,
        platform:               event.store === 'APP_STORE' ? 'ios' : 'android',
        expires_at:             expiresAt,
        fallback_tier:          fallbackTier,
        revenuecat_app_user_id: appUserId,
        updated_at:             new Date().toISOString(),
      }, { onConflict: 'user_id' });

    } else if (GRACE_EVENTS.has(eventType)) {
      // Billing issue: keep current tier but move to grace_period — do NOT downgrade
      await supabase.from('subscriptions').update({
        status:     'grace_period',
        updated_at: new Date().toISOString(),
      }).eq('user_id', appUserId);

    } else if (INACTIVE_EVENTS.has(eventType)) {
      // On expiry / cancellation, revert to fallback_tier (not always 'free').
      // Pro user's Ultimate trial expiring → revert to 'pro', not 'free'.
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('fallback_tier, expires_at')
        .eq('user_id', appUserId)
        .maybeSingle();

      const revertTier = existing?.fallback_tier ?? 'free';

      // For CANCELLATION: keep expires_at from the event (subscription still valid until that date).
      // For EXPIRATION or missing expires_at: use now so the row is immediately seen as expired.
      const effectiveExpiresAt = expiresAt ?? existing?.expires_at ?? new Date().toISOString();

      await supabase.from('subscriptions').upsert({
        user_id:       appUserId,
        tier:          revertTier,
        status:        eventType === 'EXPIRATION' ? 'expired' : 'cancelled',
        expires_at:    effectiveExpiresAt,
        fallback_tier: 'free',   // once reverted, the new fallback is always free
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('[revenuecat-webhook]', e?.message);
    return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
  }
});
