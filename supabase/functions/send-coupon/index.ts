// PawBond — Edge Function: send-coupon
//
// Fires immediately after a coupon is redeemed via redeem_offer() RPC.
// Two delivery channels:
//   1. Expo push notification — "🎉 Your coupon is ready!"
//   2. Email via Resend — branded HTML email with the code / link
//
// Called by the client right after a successful redeem_offer() response.
// Also callable by admin for re-delivery.
//
// Request body:
//   { coupon_id: string }   — the user_coupons.id row
//
// Environment variables required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase)
//   RESEND_API_KEY   — https://resend.com  (set in Supabase secrets)
//   RESEND_FROM      — e.g. "PawBond <rewards@pawbond.app>"
//
// Deploy: supabase functions deploy send-coupon

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const RESEND_URL    = 'https://api.resend.com/emails';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── Email template ────────────────────────────────────────────────────────────

function buildEmailHtml(opts: {
  userName: string;
  partnerName: string;
  partnerLogo: string;
  offerTitle: string;
  couponCode: string | null;
  affiliateUrl: string | null;
  expiresAt: string | null;
  coinsSpent: number;
}) {
  const { userName, partnerName, partnerLogo, offerTitle, couponCode, affiliateUrl, expiresAt, coinsSpent } = opts;

  const expiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const codeBlock = couponCode
    ? `<div style="background:#F5F3FF;border:2px dashed #7C5CBF;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
        <p style="color:#6B7280;font-size:13px;margin:0 0 8px;">YOUR COUPON CODE</p>
        <p style="color:#7C5CBF;font-size:28px;font-weight:800;letter-spacing:3px;margin:0;font-family:monospace;">${couponCode}</p>
        <p style="color:#6B7280;font-size:12px;margin:8px 0 0;">Copy and paste at ${partnerName} checkout</p>
       </div>`
    : `<div style="text-align:center;margin:24px 0;">
        <a href="${affiliateUrl}" style="display:inline-block;background:#7C5CBF;color:#fff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:50px;text-decoration:none;">
          🛒 Shop at ${partnerName}
        </a>
        <p style="color:#6B7280;font-size:12px;margin:8px 0 0;">Your discount applies automatically at checkout</p>
       </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#7C5CBF,#9B72D0);padding:32px 24px;text-align:center;">
      <p style="font-size:36px;margin:0 0 8px;">🎉</p>
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">Your reward is ready!</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">You spent ${coinsSpent.toLocaleString()} coins and unlocked a deal</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px;">
      <p style="color:#374151;font-size:16px;margin:0 0 4px;">Hi ${userName || 'there'} 👋</p>
      <p style="color:#6B7280;font-size:14px;margin:0 0 16px;">
        You just unlocked a partner reward from your PawBond coin wallet.
      </p>

      <!-- Offer card -->
      <div style="background:#F9FAFB;border-radius:14px;padding:16px;display:flex;align-items:flex-start;gap:14px;margin-bottom:8px;">
        <span style="font-size:32px;line-height:1;">${partnerLogo}</span>
        <div>
          <p style="color:#6B7280;font-size:11px;font-weight:700;letter-spacing:0.5px;margin:0 0 2px;text-transform:uppercase;">${partnerName}</p>
          <p style="color:#111827;font-size:16px;font-weight:700;margin:0;">${offerTitle}</p>
        </div>
      </div>

      ${codeBlock}

      ${expiry ? `<p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0 0 16px;">⏰ Expires ${expiry}</p>` : ''}

      <div style="border-top:1px solid #F3F4F6;padding-top:20px;margin-top:4px;">
        <p style="color:#6B7280;font-size:13px;margin:0 0 8px;">
          💡 <strong>Keep earning coins</strong> — post photos, leave comments, and maintain your daily streak to unlock more rewards.
        </p>
        <p style="color:#6B7280;font-size:13px;margin:0;">
          Your coupons are also saved in the PawBond app under <strong>Profile → Pet Rewards → My Coupons</strong>.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;padding:20px 24px;text-align:center;border-top:1px solid #F3F4F6;">
      <p style="color:#9CA3AF;font-size:12px;margin:0;">
        PawBond · <a href="https://pawbond.app" style="color:#7C5CBF;text-decoration:none;">pawbond.app</a><br>
        You received this because you redeemed a reward in the PawBond app.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Auth: must be the owning user OR service role ─────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let callerUserId: string | null = null;
    if (token !== SERVICE_KEY) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return json({ error: 'Unauthorized' }, 401);
      callerUserId = user.id;
    }

    const { coupon_id } = await req.json();
    if (!coupon_id) return json({ error: 'coupon_id required' }, 400);

    // ── Load coupon + offer + user ────────────────────────────────────────────
    const { data: coupon, error: cErr } = await supabase
      .from('user_coupons')
      .select(`
        id, user_id, coupon_code, coins_spent, expires_at,
        offer:partner_offers ( partner_name, partner_logo, title, affiliate_url )
      `)
      .eq('id', coupon_id)
      .single();

    if (cErr || !coupon) return json({ error: 'Coupon not found' }, 404);

    // Caller can only send their own coupon (unless service role)
    if (callerUserId && coupon.user_id !== callerUserId) {
      return json({ error: 'Forbidden' }, 403);
    }

    const offer = coupon.offer as any;

    // ── Load user profile + push token ────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, push_token, email')
      .eq('id', coupon.user_id)
      .single();

    const results: Record<string, unknown> = {};

    // ── 1. Push notification ──────────────────────────────────────────────────
    if (profile?.push_token) {
      const pushBody: Record<string, unknown> = {
        to:    profile.push_token,
        title: `🎁 ${offer?.partner_name ?? 'Partner'} reward ready!`,
        body:  coupon.coupon_code
          ? `Your code: ${coupon.coupon_code} — tap to copy`
          : `Your discount link is waiting — tap to open`,
        data:  { type: 'coupon_ready', coupon_id: coupon.id },
        sound: 'default',
        badge: 1,
      };

      const pushRes = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(pushBody),
      });
      results.push = pushRes.ok ? 'sent' : `failed (${pushRes.status})`;
    } else {
      results.push = 'skipped (no token)';
    }

    // ── 2. Email via Resend ───────────────────────────────────────────────────
    const RESEND_KEY  = Deno.env.get('RESEND_API_KEY');
    const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'PawBond <rewards@pawbond.app>';

    if (RESEND_KEY && profile?.email) {
      const html = buildEmailHtml({
        userName:     profile.full_name ?? '',
        partnerName:  offer?.partner_name ?? 'Partner',
        partnerLogo:  offer?.partner_logo ?? '🎁',
        offerTitle:   offer?.title ?? 'Your reward',
        couponCode:   coupon.coupon_code ?? null,
        affiliateUrl: offer?.affiliate_url ?? null,
        expiresAt:    coupon.expires_at ?? null,
        coinsSpent:   coupon.coins_spent,
      });

      const emailRes = await fetch(RESEND_URL, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    RESEND_FROM,
          to:      [profile.email],
          subject: coupon.coupon_code
            ? `🎉 Your ${offer?.partner_name} code: ${coupon.coupon_code}`
            : `🎉 Your ${offer?.partner_name} reward is ready`,
          html,
        }),
      });

      const emailBody = await emailRes.json().catch(() => ({}));
      results.email = emailRes.ok ? `sent (id: ${emailBody.id})` : `failed: ${JSON.stringify(emailBody)}`;
    } else {
      results.email = RESEND_KEY ? 'skipped (no email on profile)' : 'skipped (RESEND_API_KEY not set)';
    }

    console.log(`[send-coupon] coupon=${coupon_id}`, results);
    return json({ ok: true, results });

  } catch (err) {
    console.error('[send-coupon] ERROR', err);
    return json({ error: String(err) }, 500);
  }
});
