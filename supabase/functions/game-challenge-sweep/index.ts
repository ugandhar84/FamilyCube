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
// Also abandons a Tic-Tac-Toe/Memory session stuck in 'active' with no
// move/state change in 30 minutes — a silent disconnect (app force-closed,
// device died) previously had NO timeout at all: the remaining player was
// left staring at "their turn" forever with no way to end the game
// (live-reported: "we can keep the session open for 30min and then end
// else that ill become stale"). Deliberately separate from leave_game()
// (migration 20260945000000), which is the explicit "I'm done" path and
// abandons immediately — this is only the fallback for someone who never
// comes back at all. updated_at already advances on every real move via
// submit_game_move, so no new column/heartbeat write is needed to detect
// staleness.
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

    // Silent-disconnect fallback for an active Tic-Tac-Toe/Memory game —
    // see this file's own header comment. winner_id is deliberately left
    // null (unlike leave_game's explicit forfeit, which credits the
    // opponent as winner) since a plain timeout can't tell WHICH side went
    // quiet first — crediting a win off pure inactivity risks awarding it
    // to someone who was equally AFK, whereas leave_game only ever fires
    // for the person who's still there and deliberately tapped "leave."
    const staleActiveIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: abandonedSessions, error: staleSessionsErr } = await supabase
      .from('game_sessions')
      .update({ status: 'abandoned', completed_at: nowIso, updated_at: nowIso })
      .eq('status', 'active')
      .lt('updated_at', staleActiveIso)
      .select('id');
    if (staleSessionsErr) throw new Error(`stale active game_sessions sweep failed: ${staleSessionsErr.message}`);

    return json({
      ok: true,
      expiredSessions: expiredSessions?.length ?? 0,
      abandonedLobbies: abandonedLobbies?.length ?? 0,
      abandonedStaleSessions: abandonedSessions?.length ?? 0,
    });
  } catch (e: any) {
    console.error('[game-challenge-sweep]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'sweep failed' }, 500);
  }
});
