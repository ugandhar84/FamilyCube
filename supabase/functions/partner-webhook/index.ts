// PawBond — Edge Function: partner-webhook
//
// Receives inbound webhooks from affiliate partners to track conversions.
// When a user clicks a partner link and completes a purchase, the partner
// calls this endpoint with the conversion data.
//
// Supported partner formats:
//   Amazon Associates — POST with signature header
//   Chewy Affiliate   — POST with shared secret
//   Generic           — POST with pawbond_secret header
//
// What it does on a confirmed conversion:
//   1. Looks up the user_coupon by coupon_id (passed as query param or body)
//   2. Marks the coupon as "used"
//   3. Awards bonus coins to the user (configurable in app_settings)
//   4. Writes a conversion record to partner_conversions table
//   5. Sends a push notification: "Your purchase was tracked! +X bonus coins"
//
// Security:
//   Every partner has a shared secret stored in Supabase secrets.
//   Requests without a valid secret are rejected with 401.
//   Bodies are verified before any DB writes.
//
// Environment variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   PARTNER_SECRET_AMAZON  — shared secret from Amazon Associates dashboard
//   PARTNER_SECRET_CHEWY   — shared secret from Chewy affiliate portal
//   PARTNER_SECRET_PETSMART
//   PARTNER_SECRET_PETCO
//   PARTNER_SECRET_GENERIC — fallback for any partner using our generic format
//
// Deploy: supabase functions deploy partner-webhook
// Webhook URL to give partners:
//   https://<project>.supabase.co/functions/v1/partner-webhook?partner=amazon

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-partner-secret, x-amz-sns-message-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── Partner secret validation ─────────────────────────────────────────────────

function validatePartnerSecret(req: Request, partner: string): boolean {
  const envKey  = `PARTNER_SECRET_${partner.toUpperCase()}`;
  const secret  = Deno.env.get(envKey) ?? Deno.env.get('PARTNER_SECRET_GENERIC');
  if (!secret) {
    // No secret configured → reject (fail-safe)
    console.warn(`[partner-webhook] No secret configured for partner: ${partner}`);
    return false;
  }
  const incoming =
    req.headers.get('x-partner-secret') ??
    req.headers.get('authorization')?.replace('Bearer ', '') ??
    '';
  return incoming === secret;
}

// ── Conversion body normaliser ────────────────────────────────────────────────
// Each partner sends a different schema. We normalise to one shape.

interface ConversionEvent {
  partner:      string;
  coupon_id:    string | null;    // user_coupons.id — passed by our deeplink
  order_id:     string | null;    // partner's order/transaction ID
  order_amount: number | null;    // purchase amount in USD
  commission:   number | null;    // our commission in USD (if reported)
  raw:          Record<string, unknown>;
}

function normalise(partner: string, body: Record<string, unknown>, url: URL): ConversionEvent {
  // coupon_id is always passed as a query param in the affiliate deeplink
  // e.g. https://amzn.to/x?ref=pawbond&coupon_id=<uuid>
  const coupon_id = (url.searchParams.get('coupon_id') ?? body.coupon_id ?? null) as string | null;

  switch (partner) {
    case 'amazon':
      return {
        partner,
        coupon_id,
        order_id:     (body.orderId ?? body.order_id ?? null) as string | null,
        order_amount: body.orderTotalAmount ? Number(body.orderTotalAmount) : null,
        commission:   body.commissionAmount  ? Number(body.commissionAmount)  : null,
        raw: body,
      };

    case 'chewy':
      return {
        partner,
        coupon_id,
        order_id:     (body.transaction_id ?? null) as string | null,
        order_amount: body.sale_amount   ? Number(body.sale_amount)   : null,
        commission:   body.commission    ? Number(body.commission)    : null,
        raw: body,
      };

    default:
      // Generic format — partners can use our standard schema
      return {
        partner,
        coupon_id,
        order_id:     (body.order_id     ?? null) as string | null,
        order_amount: body.order_amount  ? Number(body.order_amount)  : null,
        commission:   body.commission    ? Number(body.commission)    : null,
        raw: body,
      };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url     = new URL(req.url);
  const partner = (url.searchParams.get('partner') ?? 'generic').toLowerCase();

  // Validate secret before reading body
  if (!validatePartnerSecret(req, partner)) {
    console.warn(`[partner-webhook] Rejected request from partner=${partner} — bad secret`);
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const rawBody: Record<string, unknown> = await req.json().catch(() => ({}));
    const event = normalise(partner, rawBody, url);

    console.log(`[partner-webhook] partner=${partner} coupon_id=${event.coupon_id} order_id=${event.order_id} amount=${event.order_amount}`);

    // ── 1. Verify we have a coupon to attribute ────────────────────────────
    if (!event.coupon_id) {
      // No coupon_id — log as unattributed conversion (still valuable data)
      await supabase.from('partner_conversions').insert({
        partner:      event.partner,
        coupon_id:    null,
        user_id:      null,
        order_id:     event.order_id,
        order_amount: event.order_amount,
        commission:   event.commission,
        status:       'unattributed',
        raw:          event.raw,
      });
      return json({ ok: true, attributed: false, note: 'Logged as unattributed — no coupon_id' });
    }

    // ── 2. Look up coupon + user ───────────────────────────────────────────
    const { data: coupon, error: cErr } = await supabase
      .from('user_coupons')
      .select('id, user_id, status, offer_id, offer:partner_offers(partner_name, title)')
      .eq('id', event.coupon_id)
      .single();

    if (cErr || !coupon) {
      console.error(`[partner-webhook] Coupon not found: ${event.coupon_id}`);
      return json({ error: 'Coupon not found' }, 404);
    }

    // Idempotency: if already converted, just acknowledge
    const { data: existing } = await supabase
      .from('partner_conversions')
      .select('id')
      .eq('coupon_id', event.coupon_id)
      .eq('status', 'converted')
      .maybeSingle();

    if (existing) {
      console.log(`[partner-webhook] Already converted coupon=${event.coupon_id} — skipping`);
      return json({ ok: true, attributed: true, duplicate: true });
    }

    // ── 3. Mark coupon used ────────────────────────────────────────────────
    await supabase
      .from('user_coupons')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', event.coupon_id);

    // ── 4. Load bonus coin config ──────────────────────────────────────────
    const { data: settings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'conversion_bonus_coins')
      .maybeSingle();

    // Default: 25 bonus coins per confirmed purchase (overridable in admin)
    const bonusCoins: number = settings?.value?.default_bonus ?? 25;

    // ── 5. Award bonus coins atomically ───────────────────────────────────
    //   Uses Postgres rpc to increment coins in a single statement, avoiding
    //   the read-modify-write race when two webhooks arrive simultaneously.
    const { data: coinResult } = await supabase.rpc('admin_adjust_coins', {
      p_user_id:  coupon.user_id,
      p_delta:    bonusCoins,
      p_reason:   'purchase_bonus',
      p_ref_id:   coupon.id,
    });

    const newBalance: number = (coinResult as any)?.new_balance ?? 0;

    // Fetch push token + name for notification (separate from coin update)
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token, full_name')
      .eq('id', coupon.user_id)
      .single();

    // ── 6. Record conversion ──────────────────────────────────────────────
    await supabase.from('partner_conversions').insert({
      partner:      event.partner,
      coupon_id:    event.coupon_id,
      user_id:      coupon.user_id,
      order_id:     event.order_id,
      order_amount: event.order_amount,
      commission:   event.commission,
      bonus_coins:  bonusCoins,
      status:       'converted',
      raw:          event.raw,
    });

    // ── 7. Push notification ──────────────────────────────────────────────
    if (profile?.push_token) {
      const offer = coupon.offer as any;
      await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to:    profile.push_token,
          title: `🛍️ Purchase confirmed at ${offer?.partner_name ?? 'partner'}!`,
          body:  `Thanks for shopping! We've added ${bonusCoins} bonus 🪙 coins to your wallet.`,
          data:  { type: 'purchase_bonus', coins: bonusCoins, balance: newBalance },
          sound: 'default',
        }),
      });
    }

    console.log(`[partner-webhook] ✅ Converted coupon=${event.coupon_id} user=${coupon.user_id} +${bonusCoins} coins`);
    return json({ ok: true, attributed: true, bonus_coins: bonusCoins, balance: newBalance });

  } catch (err) {
    console.error('[partner-webhook] ERROR', err);
    return json({ error: String(err) }, 500);
  }
});
