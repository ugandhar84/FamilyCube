import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RC_SECRET_KEY = Deno.env.get('REVENUECAT_SECRET_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, ultimate: 2 };
const ENTITLEMENT_IDS = { pro: 'pro', ultimate: 'ultimate' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Verify caller's JWT and get userId
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: { user }, error: authError } = await createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  }).auth.getUser();

  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  if (!RC_SECRET_KEY) return json({ error: 'RC secret not configured' }, 500);

  try {
    // Fetch subscriber info from RC REST API
    const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${user.id}`, {
      headers: {
        'Authorization': `Bearer ${RC_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'X-Platform': 'ios',
      },
    });

    if (!rcRes.ok) {
      const err = await rcRes.text();
      return json({ error: `RC API error: ${err}` }, 502);
    }

    const rcData = await rcRes.json();
    const entitlements = rcData.subscriber?.entitlements ?? {};

    const tier: 'free' | 'pro' | 'ultimate' =
      entitlements[ENTITLEMENT_IDS.ultimate]?.expires_date &&
        new Date(entitlements[ENTITLEMENT_IDS.ultimate].expires_date) > new Date()
        ? 'ultimate'
        : entitlements[ENTITLEMENT_IDS.pro]?.expires_date &&
          new Date(entitlements[ENTITLEMENT_IDS.pro].expires_date) > new Date()
          ? 'pro'
          : 'free';

    if (tier === 'free') return json({ tier: 'free' });

    const activeEnt = entitlements[ENTITLEMENT_IDS.ultimate] ?? entitlements[ENTITLEMENT_IDS.pro];
    const expiresAt = activeEnt?.expires_date ?? null;
    const productId = activeEnt?.product_identifier ?? null;

    // Read existing row to preserve fallback_tier
    const { data: existing } = await supabaseClient
      .from('subscriptions')
      .select('tier, fallback_tier')
      .eq('user_id', user.id)
      .maybeSingle();

    const currentTier = (existing?.tier ?? 'free') as string;
    const fallbackTier = TIER_RANK[tier] > TIER_RANK[currentTier]
      ? currentTier
      : (existing?.fallback_tier ?? 'free');

    await supabaseClient.from('subscriptions').upsert({
      user_id:      user.id,
      tier,
      status:       'active',
      product_id:   productId,
      platform:     'ios',
      expires_at:   expiresAt,
      fallback_tier: fallbackTier,
      revenuecat_app_user_id: user.id,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return json({ tier });
  } catch (e: any) {
    return json({ error: e?.message }, 500);
  }
});
