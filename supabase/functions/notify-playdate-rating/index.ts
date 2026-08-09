// PawBond — Edge Function: notify-playdate-rating
// Called after a user submits a playdate rating.
// Writes both pet-to-pet (playdate_ratings) and parent-to-parent
// (playdate_host_ratings) rows, then notifies the rated pet's owner.
// Deploy: supabase functions deploy notify-playdate-rating

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canNotify } from '../_shared/prefs.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Authenticate caller
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const {
      playdate_request_id,
      rater_pet_id,
      rated_pet_id,
      pet_scores,   // { friendliness, energy_match, punctuality, well_behaved, would_play_again }
      host_scores,  // { communication, punctuality, friendliness, would_meet_again } — optional
      review,
    } = await req.json();

    if (!playdate_request_id || !rater_pet_id || !rated_pet_id || !pet_scores) {
      return json({ error: 'playdate_request_id, rater_pet_id, rated_pet_id, pet_scores required' }, 400);
    }

    // Validate pet_scores
    const PET_FIELDS = ['friendliness', 'energy_match', 'punctuality', 'well_behaved', 'would_play_again'];
    for (const f of PET_FIELDS) {
      const v = pet_scores[f];
      if (typeof v !== 'number' || v < 1 || v > 5) {
        return json({ error: `pet_scores.${f} must be 1–5` }, 400);
      }
    }

    // Validate host_scores if provided
    if (host_scores) {
      const HOST_FIELDS = ['communication', 'punctuality', 'friendliness', 'would_meet_again'];
      for (const f of HOST_FIELDS) {
        const v = host_scores[f];
        if (typeof v !== 'number' || v < 1 || v > 5) {
          return json({ error: `host_scores.${f} must be 1–5` }, 400);
        }
      }
    }

    // Look up rated pet + rater profile in parallel
    const [ratedPetRes, raterProfileRes] = await Promise.all([
      serviceClient.from('pets').select('id, name, owner_id').eq('id', rated_pet_id).single(),
      serviceClient.from('profiles').select('full_name, handle').eq('id', user.id).single(),
    ]);

    const ratedPet = ratedPetRes.data;
    if (!ratedPet) return json({ error: 'Rated pet not found' }, 404);

    const ratedUserId = ratedPet.owner_id as string;
    if (ratedUserId === user.id) return json({ ok: true, skipped: 'self' });

    const raterName = raterProfileRes.data?.handle
      ? `@${raterProfileRes.data.handle}`
      : (raterProfileRes.data?.full_name ?? 'Someone');

    // ── Write pet-to-pet rating ────────────────────────────────────────────────
    const { error: petRatingErr } = await serviceClient
      .from('playdate_ratings')
      .upsert(
        {
          playdate_request_id,
          rater_pet_id,
          rated_pet_id,
          friendliness:     pet_scores.friendliness,
          energy_match:     pet_scores.energy_match,
          punctuality:      pet_scores.punctuality,
          well_behaved:     pet_scores.well_behaved,
          would_play_again: pet_scores.would_play_again,
          review:           review?.trim() || null,
        },
        { onConflict: 'playdate_request_id,rater_pet_id' },
      );

    if (petRatingErr) {
      console.error('pet rating upsert error:', petRatingErr);
      return json({ error: petRatingErr.message }, 500);
    }

    // ── Write parent-to-parent rating ──────────────────────────────────────────
    if (host_scores) {
      const { error: hostRatingErr } = await serviceClient
        .from('playdate_host_ratings')
        .upsert(
          {
            playdate_request_id,
            rater_user_id:   user.id,
            rated_user_id:   ratedUserId,
            communication:   host_scores.communication,
            punctuality:     host_scores.punctuality,
            friendliness:    host_scores.friendliness,
            would_meet_again: host_scores.would_meet_again,
            review:          review?.trim() || null,
          },
          { onConflict: 'playdate_request_id,rater_user_id' },
        );

      if (hostRatingErr) {
        // Log but don't fail — pet rating already saved
        console.error('host rating upsert error:', hostRatingErr);
      }
    }

    // ── Push notification to rated pet's owner ─────────────────────────────────
    const petOverall = (
      pet_scores.friendliness + pet_scores.energy_match +
      pet_scores.punctuality + pet_scores.well_behaved +
      pet_scores.would_play_again
    ) / 5;
    const stars = '⭐'.repeat(Math.min(5, Math.round(petOverall)));

    const allowed = await canNotify(serviceClient, ratedUserId, 'notif_playdate');
    if (!allowed) return json({ ok: true, skipped: 'pref' });

    const { data: tokenRows } = await serviceClient
      .from('push_tokens')
      .select('token')
      .eq('user_id', ratedUserId);

    const tokens: string[] = (tokenRows ?? [])
      .map((r: any) => r.token)
      .filter((t: string) => t?.startsWith('ExponentPushToken'));

    const notifTitle = `${ratedPet.name} got a new review!`;
    const notifBody  = `${raterName} rated your playdate ${stars}`;

    if (tokens.length > 0) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens.map(to => ({
          to,
          title: notifTitle,
          body:  notifBody,
          data:  { type: 'playdate_rating', playdate_request_id, rated_pet_id, overall: petOverall.toFixed(2) },
        }))),
      });
    }

    // Log in-app notification
    await serviceClient.from('notification_logs').insert({
      user_id: ratedUserId,
      type:    'playdate_rating',
      title:   notifTitle,
      body:    notifBody,
      read:    false,
      data:    {
        type: 'playdate_rating',
        playdate_request_id,
        rated_pet_id,
        rater_pet_id,
        overall: petOverall.toFixed(2),
      },
    });

    return json({ ok: true, sent: tokens.length });
  } catch (err: any) {
    console.error('notify-playdate-rating error:', err);
    return json({ error: err.message }, 500);
  }
});
