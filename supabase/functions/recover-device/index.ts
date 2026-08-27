// FamilyCube — Edge Function: recover-device
// Redeems a device_recovery_codes code + the member's PIN to re-authenticate
// a NEW/wiped device as that member's EXISTING auth_user_id — never creates
// a new auth.users row, never touches members.auth_user_id. Called with NO
// bearer token (the whole point: the new device has no session yet).
//
// Mechanism (validated end-to-end against a live throwaway anonymous user
// before this function was written — see the recovery-flow architecture
// plan for the prototype results): admin.updateUserById attaches a
// deterministic, non-deliverable synthetic email to the target auth.users
// row (skipped if one is already set — e.g. a second recovery for the same
// member), admin.generateLink mints a magiclink for that email, and
// verifyOtp exchanges it for a real session server-side. The synthetic
// email flips the user's is_anonymous flag to false (confirmed in the
// prototype) — that's an accepted, harmless side effect: nothing in this
// codebase reads is_anonymous anywhere (confirmed via full-repo grep before
// this was built), so no other code path's behavior changes because of it.
//
// Deploy: supabase functions deploy recover-device --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

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
    const { code, pin } = await req.json() as { code: string; pin: string };
    if (!code || !pin) return json({ error: 'code and pin required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: invite, error: inviteErr } = await supabase
      .from('device_recovery_codes')
      .select('id, family_id, member_id, status, expires_at')
      .eq('code', code.trim().toUpperCase())
      .eq('status', 'pending')
      .maybeSingle();
    if (inviteErr || !invite) {
      return json({ error: 'Invalid or expired recovery code' }, 404);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await supabase.from('device_recovery_codes').update({ status: 'expired' }).eq('id', invite.id);
      return json({ error: 'This recovery code has expired — ask a parent to generate a new one' }, 410);
    }

    const { data: targetMember, error: memberErr } = await supabase
      .from('members')
      .select('id, family_id, name, pin, auth_user_id, invite_status')
      .eq('id', invite.member_id)
      .maybeSingle();
    if (memberErr || !targetMember || targetMember.family_id?.toString() !== invite.family_id?.toString()) {
      return json({ error: 'The profile this code was created for is missing' }, 404);
    }
    if (!targetMember.auth_user_id) {
      // Shouldn't happen — generate-recovery-code only issues codes for
      // members that already have one — but guard anyway rather than
      // proceeding into generateLink with nothing to target.
      return json({ error: 'This profile has no existing session to recover — use an invite code instead' }, 400);
    }
    if (targetMember.pin !== pin) {
      return json({ error: 'Incorrect PIN' }, 401);
    }

    // Attach a deterministic synthetic email only if this user doesn't
    // already have one — a second recovery for the same member (a THIRD
    // device, say) should reuse the same address rather than erroring on a
    // duplicate-email conflict against itself.
    const { data: existingUser, error: getUserErr } = await supabase.auth.admin.getUserById(targetMember.auth_user_id);
    if (getUserErr || !existingUser?.user) {
      return json({ error: 'The original account for this profile no longer exists' }, 404);
    }

    let syntheticEmail = existingUser.user.email;
    if (!syntheticEmail) {
      syntheticEmail = `recovery-${targetMember.auth_user_id}@recovery.internal.familycube.app`;
      const { error: updateErr } = await supabase.auth.admin.updateUserById(targetMember.auth_user_id, {
        email: syntheticEmail,
        email_confirm: true,
      });
      if (updateErr) {
        console.error('[recover-device] updateUserById failed', updateErr.message);
        return json({ error: 'Could not prepare this profile for recovery — please try again' }, 500);
      }
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: syntheticEmail,
    });
    if (linkErr || !linkData.properties?.hashed_token) {
      console.error('[recover-device] generateLink failed', linkErr?.message);
      return json({ error: 'Could not generate a recovery session — please try again' }, 500);
    }

    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
      type: 'magiclink',
      token_hash: linkData.properties.hashed_token,
    });
    if (verifyErr || !verifyData.session) {
      console.error('[recover-device] verifyOtp failed', verifyErr?.message);
      return json({ error: 'Could not complete recovery — please try again' }, 500);
    }

    await supabase.from('device_recovery_codes').update({ status: 'used', used_at: new Date().toISOString() }).eq('id', invite.id);

    console.log(`[recover-device] family=${invite.family_id} member=${targetMember.id} recovered on new device`);

    return json({
      ok: true,
      memberId: targetMember.id,
      memberName: targetMember.name,
      session: {
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
      },
    });
  } catch (e: any) {
    console.error('[recover-device]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
