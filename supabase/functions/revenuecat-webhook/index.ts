import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Family Cube is single-tier (Family Plan only) — see
// docs/paywall_setup_and_implementation.md. Whether the active entitlement
// list contains the one premium entitlement is all that matters; there is
// no tier-to-tier fallback logic (a previous pro/ultimate version of this
// webhook had that, and referenced a fallback_tier column no migration ever
// actually added — every webhook call upserting it would have failed
// outright against the real schema).
const PREMIUM_ENTITLEMENT = 'com_familycube_ios_premium';

const ACTIVE_EVENTS   = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);
const GRACE_EVENTS    = new Set(['BILLING_ISSUE']);
const INACTIVE_EVENTS = new Set(['EXPIRATION', 'CANCELLATION']);

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
    const entitlementIds = (event.entitlement_ids as string[] | undefined) ?? [];
    const hasPremium = entitlementIds.includes(PREMIUM_ENTITLEMENT);
    const expiresAt   = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    if (!appUserId) return new Response('Missing app_user_id', { status: 400 });

    if (ACTIVE_EVENTS.has(eventType)) {
      // entitlement_ids should carry the premium entitlement for any of
      // these event types on a single-product app — if RC ever sends one
      // without it (e.g. a product change to something unexpected), treat
      // it as free rather than guessing.
      await supabase.from('subscriptions').upsert({
        user_id:                appUserId,
        tier:                   hasPremium ? 'premium' : 'free',
        status:                 'active',
        product_id:             productId,
        platform:               event.store === 'APP_STORE' ? 'ios' : 'android',
        expires_at:             expiresAt,
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
      // On expiry / cancellation, revert to free — single-tier app, so
      // there's nothing else to fall back to.
      // For CANCELLATION: keep expires_at from the event (subscription still valid until that date).
      // For EXPIRATION or missing expires_at: use now so the row is immediately seen as expired.
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('expires_at')
        .eq('user_id', appUserId)
        .maybeSingle();

      const effectiveExpiresAt = expiresAt ?? existing?.expires_at ?? new Date().toISOString();

      await supabase.from('subscriptions').upsert({
        user_id:       appUserId,
        tier:          'free',
        status:        eventType === 'EXPIRATION' ? 'expired' : 'cancelled',
        expires_at:    effectiveExpiresAt,
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
