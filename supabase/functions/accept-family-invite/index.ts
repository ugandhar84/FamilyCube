// PawBond — Edge Function: accept-family-invite
// Called when a user clicks an invite link (deep-link or web).
// Verifies the token, creates the pet_family record, marks invite accepted,
// and sends a push notification to the pet owner.
// Deploy: supabase functions deploy accept-family-invite

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canNotify } from './prefs.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authenticate the accepting user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { token } = await req.json();
    if (!token) return json({ error: 'token is required' }, 400);

    // Look up invitation
    const { data: inv, error: invErr } = await supabase
      .from('family_invitations')
      .select('id, pet_id, invited_by, email, role, status, expires_at')
      .eq('token', token)
      .single();

    if (invErr || !inv) return json({ error: 'Invitation not found' }, 404);
    if (inv.status !== 'pending') return json({ error: `Invitation already ${inv.status}` }, 409);
    if (new Date(inv.expires_at) < new Date()) {
      await supabase.from('family_invitations').update({ status: 'expired' }).eq('id', inv.id);
      return json({ error: 'Invitation has expired' }, 410);
    }

    // Prevent owner from accepting their own invite
    if (inv.invited_by === user.id) {
      return json({ error: 'You cannot accept your own invitation' }, 400);
    }

    // Verify invite was sent to this user's email — prevents link-hijacking
    if (inv.email && user.email && inv.email.toLowerCase() !== user.email.toLowerCase()) {
      return json({ error: 'This invitation was sent to a different email address' }, 403);
    }

    // Create pet_family record (idempotent via ON CONFLICT DO NOTHING)
    const { error: famErr } = await supabase
      .from('pet_family')
      .insert({ pet_id: inv.pet_id, user_id: user.id, role: inv.role })
      .select()
      .single();

    // 23505 = unique_violation (already a member) — treat as success
    if (famErr && famErr.code !== '23505') {
      return json({ error: famErr.message }, 400);
    }

    // Mark invitation as accepted
    await supabase
      .from('family_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: user.id })
      .eq('id', inv.id);

    // Get pet info + new member's name for the notification
    const [petRes, memberRes] = await Promise.all([
      supabase.from('pets').select('name, emoji, owner_id').eq('id', inv.pet_id).single(),
      supabase.from('profiles').select('handle, full_name').eq('id', user.id).single(),
    ]);

    const pet        = petRes.data;
    const memberName = memberRes.data?.handle ? `@${memberRes.data.handle}` : (memberRes.data?.full_name ?? 'Someone');

    // Log in-app notification for the owner
    if (pet) {
      await supabase.from('notification_logs').insert({
        user_id: inv.invited_by,
        title: `${memberName} joined ${pet.emoji} ${pet.name}'s family`,
        body: `${memberName} accepted your invitation and is now a ${inv.role} for ${pet.name}.`,
        type: 'invite',
        data: { pet_id: inv.pet_id, new_member_id: user.id, role: inv.role },
      });

      // Send push notification to the pet owner (if opted in)
      const ownerCanNotify = await canNotify(supabase, inv.invited_by, 'notif_family');
      const { data: tokens } = ownerCanNotify ? await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', inv.invited_by) : { data: null };

      const expoMessages = (tokens ?? [])
        .filter((t: any) => t.token?.startsWith('ExponentPushToken'))
        .map((t: any) => ({
          to: t.token,
          sound: 'default',
          title: `${pet.emoji} ${pet.name}'s family grew!`,
          body: `${memberName} joined as ${inv.role} 🎉`,
          data: { type: 'invite_accepted', pet_id: inv.pet_id },
          priority: 'default',
          channelId: 'family',
        }));

      if (expoMessages.length > 0) {
        const pushRes = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(expoMessages),
        });
        if (!pushRes.ok) {
          const errBody = await pushRes.text().catch(() => '');
          console.error('[accept-family-invite] Expo push failed:', pushRes.status, errBody.slice(0, 200));
        }
      }
    }

    return json({
      success: true,
      pet_id:  inv.pet_id,
      role:    inv.role,
      message: 'You have joined the family!',
    });

  } catch (err: any) {
    console.error('accept-family-invite error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
