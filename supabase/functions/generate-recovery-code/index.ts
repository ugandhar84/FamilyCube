// FamilyCube — Edge Function: generate-recovery-code
// Creates a short-lived, PIN-gated code that lets an ALREADY-ACTIVE member
// (auth_user_id already set — typically a kid or email-less senior whose
// original device was lost/wiped) get a working session on a NEW device,
// without ever creating a new auth.users row or touching members.auth_user_id.
//
// Distinct from generate-invite-code: that function targets a still-PENDING
// member (a first-time join) and its code claims/stamps a fresh auth_user_id.
// This function targets an already-ACTIVE member and its code is redeemed by
// recover-device, which re-authenticates the new device as that member's
// EXISTING auth_user_id via admin.generateLink + verifyOtp (validated
// end-to-end against a live throwaway anonymous user before this was built).
//
// Same code format/alphabet as generate-invite-code (ambiguity-free), same
// parent/senior/grandparent-only auth gate, same one-live-code-per-member
// pattern — but a much shorter TTL (1 hour, not 7 days): this is "parent
// generates it, hands the phone to the kid, kid types it in right now," not
// an invite sitting in an inbox for a week.
//
// Deploy: supabase functions deploy generate-recovery-code
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_LEN = 5;

function familyPrefix(familyName: string | null | undefined): string {
  const letters = (familyName ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let prefix = letters.slice(0, 3);
  while (prefix.length < 3) {
    prefix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return prefix;
}

function generateCode(familyName: string | null | undefined): string {
  let suffix = '';
  for (let i = 0; i < CODE_SUFFIX_LEN; i++) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `${familyPrefix(familyName)}${suffix}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // memberId = the calling parent's own member id (for auth).
    // targetMemberId = the already-active member this recovery code is for.
    const { familyId, memberId, targetMemberId } = await req.json() as
      { familyId: string; memberId: string; targetMemberId: string };
    if (!familyId || !memberId || !targetMemberId) {
      return json({ error: 'familyId, memberId and targetMemberId required' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401);
    const token = authHeader.slice('Bearer '.length);
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return json({ error: 'Not signed in' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: member } = await supabase
      .from('members')
      .select('role, family_id, auth_user_id')
      .eq('id', memberId)
      .single();
    if (!member || member.family_id?.toString() !== familyId) {
      return json({ error: 'Not a member of this family' }, 403);
    }
    if (member.auth_user_id !== user.id) {
      return json({ error: 'Not authorized for this member' }, 403);
    }
    if (!['parent', 'senior'].includes(member.role) && member.role !== 'grandparent') {
      return json({ error: 'Only parents can generate recovery codes' }, 403);
    }

    const { data: targetMember, error: targetErr } = await supabase
      .from('members')
      .select('id, family_id, name, invite_status, auth_user_id, pin')
      .eq('id', targetMemberId)
      .single();
    if (targetErr || !targetMember || targetMember.family_id?.toString() !== familyId) {
      return json({ error: 'Member not found in this family' }, 404);
    }
    // The whole point of this function is re-authenticating an EXISTING
    // identity — a pending (never-yet-claimed) member has no auth_user_id
    // to recover, and belongs on generate-invite-code's flow instead.
    if (targetMember.invite_status !== 'active' || !targetMember.auth_user_id) {
      return json({ error: 'This member has not joined yet — use an invite code instead, not a recovery code' }, 400);
    }
    if (!targetMember.pin) {
      return json({ error: 'This member has no PIN set — set one first so a recovery code can be PIN-gated' }, 400);
    }

    const { data: family } = await supabase
      .from('families')
      .select('name')
      .eq('id', familyId)
      .maybeSingle();

    const expiresAt = new Date(Date.now() + 3600_000).toISOString();

    const { data: existing } = await supabase
      .from('device_recovery_codes')
      .select('id')
      .eq('member_id', targetMemberId)
      .eq('status', 'pending')
      .maybeSingle();

    let code: string;
    let attempts = 0;
    do {
      code = generateCode(family?.name);
      const { data: clash } = await supabase
        .from('device_recovery_codes')
        .select('id')
        .eq('code', code)
        .eq('status', 'pending')
        .maybeSingle();
      if (!clash) break;
    } while (++attempts < 10);

    if (existing) {
      await supabase
        .from('device_recovery_codes')
        .update({ code, expires_at: expiresAt, created_by: user.id })
        .eq('id', existing.id);
    } else {
      const { error } = await supabase.from('device_recovery_codes').insert({
        family_id: familyId,
        member_id: targetMemberId,
        code,
        status: 'pending',
        created_by: user.id,
        expires_at: expiresAt,
      });
      if (error) throw new Error(error.message);
    }

    console.log(`[generate-recovery-code] family=${familyId} member=${targetMemberId} code=${code} expires=${expiresAt}`);

    return json({ ok: true, code, expiresAt, memberId: targetMemberId, memberName: targetMember.name });
  } catch (e: any) {
    console.error('[generate-recovery-code]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
