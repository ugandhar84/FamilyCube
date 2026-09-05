// FamilyCube — Edge Function: game-challenge-sweep
// Runs on a schedule (Supabase cron). Marks a Tic-Tac-Toe/Memory challenge
// that nobody ever accepted/declined as 'expired' once its own expires_at
// has passed (default 24h after creation — see game_sessions.expires_at's
// column default), and marks an Uno lobby that never filled its seats
// (still 'lobby' status — the create_uno_game RPC always goes straight to
// 'active' once seats are filled, so a lingering 'lobby' row implies a
// create call that never completed, or a future join-in-progress flow
// this v1 doesn't have yet) as 'abandoned' after the same 24h window,
// using created_at since uno_games has no expires_at column of its own.
//
// Cron schedule (set in Supabase Dashboard → Edge Functions → Schedule, or
// via the accompanying migration's cron.schedule call):
//   every hour: 0 * * * *
//
// Deploy: supabase functions deploy game-challenge-sweep
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const nowIso = new Date().toISOString();
    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredSessions, error: sessionsErr } = await supabase
      .from('game_sessions')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('status', 'pending')
      .lt('expires_at', nowIso)
      .select('id');
    if (sessionsErr) throw new Error(`game_sessions sweep failed: ${sessionsErr.message}`);

    const { data: abandonedLobbies, error: lobbiesErr } = await supabase
      .from('uno_games')
      .update({ status: 'abandoned', updated_at: nowIso })
      .eq('status', 'lobby')
      .lt('created_at', dayAgoIso)
      .select('id');
    if (lobbiesErr) throw new Error(`uno_games sweep failed: ${lobbiesErr.message}`);

    return json({
      ok: true,
      expiredSessions: expiredSessions?.length ?? 0,
      abandonedLobbies: abandonedLobbies?.length ?? 0,
    });
  } catch (e: any) {
    console.error('[game-challenge-sweep]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'sweep failed' }, 500);
  }
});
