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

// Family Cube is single-tier (Family Plan only) — see
// docs/paywall_setup_and_implementation.md and revenuecat-webhook/index.ts's
// matching comment on why there's no tier-to-tier fallback logic here.
const PREMIUM_ENTITLEMENT = 'com_familycube_ios_premium';

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
    const activeEnt = entitlements[PREMIUM_ENTITLEMENT];
    const isActive = activeEnt?.expires_date && new Date(activeEnt.expires_date) > new Date();

    if (!isActive) return json({ tier: 'free' });

    await supabaseClient.from('subscriptions').upsert({
      user_id:      user.id,
      tier:         'premium',
      status:       'active',
      product_id:   activeEnt.product_identifier ?? null,
      platform:     'ios',
      expires_at:   activeEnt.expires_date,
      revenuecat_app_user_id: user.id,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return json({ tier: 'premium' });
  } catch (e: any) {
    return json({ error: e?.message }, 500);
  }
});
