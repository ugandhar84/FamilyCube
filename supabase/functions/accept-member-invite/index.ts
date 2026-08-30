// FamilyCube — Edge Function: accept-member-invite
// Called when a user taps a member_invitations link/deep-link. Verifies the
// token + email match, creates a NEW members row stamped with the accepting
// user's OWN real auth_user_id (unlike the anonymous/shared-session PIN
// paths), marks the invitation accepted, and notifies the inviting parent.
// Deploy: supabase functions deploy accept-member-invite

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authenticate the accepting user — their OWN real session, not the
    // inviting parent's.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { token, name, avatar, color, expoPushToken } = await req.json();
    if (!token) return json({ error: 'token is required' }, 400);

    const { data: inv, error: invErr } = await supabase
      .from('member_invitations')
      .select('id, family_id, invited_by, email, role, status, member_id, accepted_by, expires_at, message')
      .eq('token', token)
      .single();

    if (invErr || !inv) return json({ error: 'Invitation not found' }, 404);

    // Idempotent short-circuit — a retried request after a dropped response
    // (this creates a brand-new members row, unlike the pet app's
    // ON CONFLICT-safe join-table insert, so retries need explicit handling).
    if (inv.status === 'accepted' && inv.accepted_by === user.id && inv.member_id) {
      const { data: existingMember } = await supabase
        .from('members')
        .select('id, name, role, avatar, color, coins, xp, level')
        .eq('id', inv.member_id)
        .single();
      if (existingMember) {
        return json({ ok: true, memberId: existingMember.id, familyId: inv.family_id, member: existingMember });
      }
    }

    if (inv.status !== 'pending') {
      return json({ error: `Invitation already ${inv.status}` }, 409);
    }
    if (new Date(inv.expires_at) < new Date()) {
      await supabase.from('member_invitations').update({ status: 'expired' }).eq('id', inv.id);
      return json({ error: 'Invitation has expired' }, 410);
    }

    // Prevent the inviting parent from accepting their own invite.
    if (inv.invited_by === user.id) {
      return json({ error: 'You cannot accept your own invitation' }, 400);
    }

    // The critical anti-hijack check — also what makes an anonymous session
    // (user.email is always null for those) structurally unable to accept
    // an email invite, with no extra code needed for that guarantee.
    if (inv.email && user.email && inv.email.toLowerCase() !== user.email.toLowerCase()) {
      return json({ error: 'This invitation was sent to a different email address' }, 403);
    }
    if (!user.email) {
      return json({ error: 'This invitation requires a real account with an email address' }, 403);
    }

    const { data: family } = await supabase
      .from('families')
      .select('name')
      .eq('id', inv.family_id)
      .single();

    const memberId = crypto.randomUUID();
    const displayName = (typeof name === 'string' && name.trim())
      || (user.user_metadata?.full_name as string | undefined)
      || user.email.split('@')[0];

    const { data: member, error: memberErr } = await supabase
      .from('members')
      .insert({
        id:              memberId,
        name:            displayName,
        role:            inv.role,
        avatar:          avatar ?? '🧑',
        color:           color ?? '#9261C7',
        family_id:       inv.family_id,
        auth_user_id:    user.id,
        email:           user.email,
        invite_status:   'active',
        coins: 0, xp: 0, level: 1, max_xp: 100, streak: 0,
        expo_push_token: expoPushToken ?? null,
        last_active:     new Date().toISOString(),
      })
      .select()
      .single();

    if (memberErr || !member) {
      return json({ error: memberErr?.message ?? 'Failed to create member' }, 400);
    }

    await supabase
      .from('member_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: user.id, member_id: memberId })
      .eq('id', inv.id);

    // Notify the rest of the family, same 'custom'-with-no-memberIds bug
    // (and same fix) as join-family — this used to reach no one at all.
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const { data: otherMembers } = await supabase
      .from('members').select('id').eq('family_id', inv.family_id).neq('id', memberId);
    const notifyIds = (otherMembers ?? []).map((m: any) => m.id);
    if (notifyIds.length) {
      fetch(notifierUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          type: 'member_joined',
          familyId: inv.family_id,
          memberIds: notifyIds,
          persist: true,
          payload: { memberName: displayName, familyName: family?.name },
        }),
      }).catch(() => {});
    }

    console.log(`[accept-member-invite] ${displayName} (${inv.role}) joined family ${inv.family_id} via email invite`);

    return json({
      ok: true,
      memberId: member.id,
      familyId: inv.family_id,
      member: {
        id: member.id, name: member.name, role: member.role,
        avatar: member.avatar, color: member.color,
        coins: member.coins, xp: member.xp, level: member.level,
        email: member.email,
      },
    });

  } catch (err: any) {
    console.error('[accept-member-invite] error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
