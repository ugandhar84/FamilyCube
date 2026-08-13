// FamilyCube — Edge Function: join-family
// Called when a new member enters the 6-digit invite code.
// Validates the code, creates the member row in the family,
// and returns the family + member data so the app can log them in.
//
// No Supabase Auth account required — member is just a row in `members`.
// PIN is set separately by the member after joining.
//
// Deploy: supabase functions deploy join-family
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
    const {
      code,           // 6-digit string
      name,           // member display name
      role,           // 'kid' | 'parent' | 'grandparent'
      avatar,         // emoji string e.g. '🧒'
      color,          // hex string e.g. '#9261C7'
      expoPushToken,  // optional — device push token
    } = await req.json() as {
      code:           string;
      name:           string;
      role:           string;
      avatar:         string;
      color?:         string;
      expoPushToken?: string;
    };

    if (!code || !name || !role || !avatar) {
      return json({ error: 'code, name, role, avatar required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Validate invite code ────────────────────────────────────────────────
    const { data: invite, error: invErr } = await supabase
      .from('family_invites')
      .select('id, family_id, status, expires_at')
      .eq('code', code.trim())
      .eq('status', 'pending')
      .single();

    if (invErr || !invite) {
      return json({ error: 'Invalid or expired invite code. Ask a parent to share a new code.' }, 404);
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase.from('family_invites').update({ status: 'expired' }).eq('id', invite.id);
      return json({ error: 'This invite code has expired. Ask a parent to generate a new one.' }, 410);
    }

    // ── 2. Load family info ────────────────────────────────────────────────────
    const { data: family } = await supabase
      .from('families')
      .select('id, name')
      .eq('id', invite.family_id)
      .single();

    if (!family) return json({ error: 'Family not found' }, 404);

    // ── 3. Create the member row ───────────────────────────────────────────────
    const memberId = crypto.randomUUID();
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .insert({
        id:              memberId,
        name:            name.trim(),
        role:            role === 'grandparent' ? 'grandparent' : role === 'parent' ? 'parent' : 'kid',
        avatar:          avatar,
        color:           color ?? '#9261C7',
        family_id:       invite.family_id,
        coins:           0,
        xp:              0,
        level:           1,
        max_xp:          100,
        streak:          0,
        expo_push_token: expoPushToken ?? null,
        last_active:     new Date().toISOString(),
      })
      .select()
      .single();

    if (memberErr || !member) {
      throw new Error(memberErr?.message ?? 'Failed to create member');
    }

    // ── 4. Mark invite as used (but keep 'pending' so others can still join) ──
    // Only mark 'accepted' if we want single-use codes. For multi-member codes,
    // leave as 'pending' and just log the join.
    await supabase.from('family_invites').update({
      used_by: memberId,   // tracks last joiner; doesn't invalidate the code
    }).eq('id', invite.id);

    // ── 5. Notify existing parents that someone joined ─────────────────────────
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    fetch(notifierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        type: 'custom',
        familyId: invite.family_id,
        persist: true,
        payload: {
          title: `👋 ${name} joined the family!`,
          body:  `${name} just joined ${family.name} as ${role}`,
        },
      }),
    }).catch(() => {});

    console.log(`[join-family] ${name} (${role}) joined family ${family.name} (${family.id})`);

    return json({
      ok: true,
      memberId:   member.id,
      familyId:   family.id,
      familyName: family.name,
      member: {
        id:     member.id,
        name:   member.name,
        role:   member.role,
        avatar: member.avatar,
        color:  member.color,
        coins:  member.coins,
        xp:     member.xp,
        level:  member.level,
        pin:    null,  // PIN must be set after joining
      },
    });

  } catch (e: any) {
    console.error('[join-family]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
