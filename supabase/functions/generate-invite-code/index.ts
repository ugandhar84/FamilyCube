// FamilyCube — Edge Function: generate-invite-code
// Creates or refreshes a 6-digit invite code for a family.
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

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { familyId, memberId } = await req.json() as { familyId: string; memberId: string };
    if (!familyId || !memberId) return json({ error: 'familyId and memberId required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is a parent/senior in this family
    const { data: member } = await supabase
      .from('members')
      .select('role, family_id')
      .eq('id', memberId)
      .single();

    if (!member || member.family_id?.toString() !== familyId) {
      return json({ error: 'Not a member of this family' }, 403);
    }
    if (!['parent', 'senior'].includes(member.role) && member.role !== 'grandparent') {
      return json({ error: 'Only parents can generate invite codes' }, 403);
    }

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
        code = generateCode();
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
