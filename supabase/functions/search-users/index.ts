// PawBond — Edge Function: search-users
// Lets an authenticated user search app users by name — used to credit whoever
// found a lost pet. Runs with the service-role key (bypasses profiles RLS,
// which normally only allows viewing your own profile / public content authors),
// so this is the one deliberate, server-side-gated broadening of that rule.
// Deploy: supabase functions deploy search-users

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Must be a signed-in user — this is not a public endpoint
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));

    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { query } = await req.json();
    const trimmed = (query ?? '').trim();
    if (trimmed.length === 0) return json({ results: [] });

    const { data: results, error: searchErr } = await supabase
      .from('profiles')
      .select('id, handle, full_name, avatar_url')
      .neq('id', user.id)
      .or(`handle.ilike.%${trimmed}%,full_name.ilike.%${trimmed}%`)
      .limit(8);

    if (searchErr) return json({ error: searchErr.message }, 500);

    return json({ results: results ?? [] });
  } catch (err: any) {
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
