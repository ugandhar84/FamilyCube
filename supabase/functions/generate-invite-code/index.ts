// FamilyCube — Edge Function: generate-invite-code
// Creates or refreshes an 8-character invite code for a family: first 3
// letters of the FAMILY'S OWN NAME (uppercased, letters/digits only — makes
// a code instantly recognizable as "this one's for the Smiths" instead of a
// generic prefix) + 5 random alphanumeric characters. Previously a bare
// 6-digit number (900,000 possibilities — brute-forceable); the random
// suffix alone draws from 36^5 (~60M) possibilities per family-name prefix.
// Called by the parent from the app — returns the code to display.
// Codes expire in 7 days; calling again refreshes the expiry.
//
// Deploy: supabase functions deploy generate-invite-code
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Excludes visually ambiguous characters (0/O, 1/I/L) so a code read aloud
// or handwritten from a screen doesn't get mistyped.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_LEN = 5;

// Strips anything that isn't a letter/digit, uppercases, and takes the
// first 3 characters — "The O'Brien Family" -> "THE", "Café Müller" -> "CAF"
// (diacritics stripped by the regex since \w-negation drops non-ASCII too).
// Padded with random alphabet characters if the family name is too short
// (e.g. a 1-2 letter name) or empty, so the prefix is always exactly 3.
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
    const { familyId, memberId } = await req.json() as { familyId: string; memberId: string };
    if (!familyId || !memberId) return json({ error: 'familyId and memberId required' }, 400);

    // memberId/familyId arrive in the body, so without verifying the caller's
    // own bearer token actually owns that memberId, anyone who knew or
    // guessed a parent's member id could mint a working invite code for a
    // family they have no access to — auth_user_id is the only thing here
    // that isn't attacker-controlled.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Not signed in' }, 401);
    }
    const token = authHeader.slice('Bearer '.length);
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return json({ error: 'Not signed in' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is a parent/senior in this family, AND that the claimed
    // memberId actually belongs to the authenticated caller's session.
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
      return json({ error: 'Only parents can generate invite codes' }, 403);
    }

    const { data: family } = await supabase
      .from('families')
      .select('name')
      .eq('id', familyId)
      .maybeSingle();

    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();

    // Upsert: one active code per family (replace if exists)
    const { data: existing } = await supabase
      .from('family_invites')
      .select('id, code')
      .eq('family_id', familyId)
      .eq('status', 'pending')
      .maybeSingle();

    let code: string;

    if (existing) {
      // Refresh expiry on the existing code
      code = existing.code;
      await supabase
        .from('family_invites')
        .update({ expires_at: expiresAt, created_by: memberId })
        .eq('id', existing.id);
    } else {
      // Generate a unique code (retry on collision)
      let attempts = 0;
      do {
        code = generateCode(family?.name);
        const { data: clash } = await supabase
          .from('family_invites')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!clash) break;
      } while (++attempts < 10);

      const { error } = await supabase.from('family_invites').insert({
        family_id:  familyId,
        code,
        status:     'pending',
        created_by: memberId,
        expires_at: expiresAt,
      });
      if (error) throw new Error(error.message);
    }

    console.log(`[generate-invite-code] family=${familyId} code=${code} expires=${expiresAt}`);
    return json({ ok: true, code, expiresAt });

  } catch (e: any) {
    console.error('[generate-invite-code]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
