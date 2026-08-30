// FamilyCube — Edge Function: join-family
// Called when a new member enters the invite code.
//
// Per-invitee invite system (20260924050000): every code minted since that
// migration is scoped to a specific, already-existing member row
// (family_invites.member_id — created by a parent beforehand via Profile's
// "Add family member" form, invite_status = 'pending'). Redeeming such a
// code CLAIMS that row — stamps auth_user_id, flips invite_status to
// 'active', applies whatever avatar/color/pin the joiner picked on THIS
// device — instead of inserting a new one. The code is consumed on claim
// (status -> 'accepted'), not left 'pending' for reuse like the old
// family-wide code behavior.
//
// Legacy fallback: a code with member_id = null (minted before this
// migration, still within its 7-day TTL) falls through to the OLD
// create-a-new-member-row behavior so any pre-existing outstanding code
// keeps working until it naturally expires. No new codes are ever minted
// without a member_id (see generate-invite-code) — this branch will stop
// being reachable 7 days after this migration ships.
//
// No Supabase Auth account of their OWN is required to join as a member —
// PIN is what gates the profile client-side. But the calling DEVICE always
// has a real Supabase Auth session by this point (app/_layout.tsx gates all
// onboarding on it), and every RLS policy in this app checks
// members.auth_user_id, not members.id — so this function stamps the
// caller's auth.uid() onto the new/claimed member row. Multiple members
// (e.g. a kid and a grandparent both joined from the same parent's device)
// can and will share one auth_user_id; that's the intended model, not a bug.
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
      peek,           // true = read-only lookup, no claim/consume (see below)
    } = await req.json() as {
      code:           string;
      name?:          string;
      role?:          string;
      avatar?:        string;
      color?:         string;
      expoPushToken?: string;
      peek?:          boolean;
    };

    // Read-only "peek" mode — JoinFamilyScreen's profile step used to always
    // start blank, forcing the invitee to re-type name/DOB/role the parent
    // had ALREADY entered when pre-creating their member row (live-reported
    // gap). This looks up that pre-created row WITHOUT claiming/consuming
    // the code, so the client can pre-fill its form before the invitee ever
    // submits anything. Only meaningful for the per-invitee model
    // (invite.member_id set) — a legacy code (member_id null) has no
    // pre-created row to peek at, so it returns member: null and the client
    // falls back to its old blank-form behavior.
    if (peek) {
      if (!code) return json({ error: 'code required' }, 400);
      const { data: peekInvite, error: peekErr } = await createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
        .from('family_invites')
        .select('id, family_id, status, expires_at, member_id')
        .eq('code', code.trim())
        .eq('status', 'pending')
        .maybeSingle();
      if (peekErr || !peekInvite) {
        return json({ error: 'Invalid or expired invite code. Ask a parent to share a new code.' }, 404);
      }
      if (new Date(peekInvite.expires_at) < new Date()) {
        return json({ error: 'This invite code has expired. Ask a parent to generate a new one.' }, 410);
      }
      if (!peekInvite.member_id) {
        return json({ ok: true, member: null });
      }
      const { data: peekMember } = await createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
        .from('members')
        .select('name, role, relationship, date_of_birth')
        .eq('id', peekInvite.member_id)
        .maybeSingle();

      // Cross-check against the SEPARATE email-invite system
      // (member_invitations, send-member-invite/accept-member-invite) —
      // these two invite mechanisms have no link between them (a code is
      // per-family, not per-invitee-by-email), so this can't identify
      // "this code is for the same person as that email invite," only
      // "this family has an unrelated pending email invite outstanding
      // right now." Surfaced as a soft warning, not a hard block: real bug
      // this prevents (live-reported) — someone who WAS emailed an invite
      // instead joins anonymously via a family code, then later signs up
      // with their real email and ends up owning a phantom SECOND family,
      // because nothing ever told them "you were actually meant to use
      // your email for this." A masked address is enough for the joiner to
      // recognize themselves without leaking the full email to whoever
      // happens to be holding this family's code.
      const { data: pendingEmailInvites } = await createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
        .from('member_invitations')
        .select('email')
        .eq('family_id', peekInvite.family_id)
        .eq('status', 'pending');

      const maskEmail = (email: string) => {
        const [user, domain] = email.split('@');
        if (!domain) return email;
        const visible = user.slice(0, 1);
        return `${visible}${'*'.repeat(Math.max(user.length - 1, 3))}@${domain}`;
      };
      const pendingEmailHints = (pendingEmailInvites ?? []).map(i => maskEmail(i.email));

      return json({ ok: true, member: peekMember ?? null, pendingEmailHints });
    }

    if (!code || !name || !role || !avatar) {
      return json({ error: 'code, name, role, avatar required' }, 400);
    }

    // Caller's own Supabase Auth session — the app only ever calls this
    // function after onboarding's session gate, so this should always be
    // present. Every RLS policy in this app checks members.auth_user_id, so
    // a member row created without one is permanently unusable (every write
    // it ever makes will silently fail RLS) — hard-fail instead of creating
    // a row nothing can recover from later.
    const authHeader = req.headers.get('Authorization');
    let callerAuthUserId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { data: { user } } = await anonClient.auth.getUser(token);
      callerAuthUserId = user?.id ?? null;
    }
    if (!callerAuthUserId) {
      return json({ error: 'Could not verify your session. Please restart the app and try again.' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Validate invite code ────────────────────────────────────────────────
    const { data: invite, error: invErr } = await supabase
      .from('family_invites')
      .select('id, family_id, status, expires_at, member_id')
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

    let member: any;
    let resolvedName = name.trim();
    let resolvedRole = role;

    if (invite.member_id) {
      // ── 3a. Per-invitee path — CLAIM the pre-created member row ───────────
      // The row already has its real name/relationship/role, set by the
      // parent when they created it. Don't let the joiner overwrite those —
      // only stamp identity (auth_user_id) and cosmetic self-choices
      // (avatar/color/push token) they're picking for the first time on
      // this device.
      const { data: existingMember, error: fetchErr } = await supabase
        .from('members')
        .select('id, name, role, family_id, invite_status, auth_user_id')
        .eq('id', invite.member_id)
        .single();

      if (fetchErr || !existingMember) {
        return json({ error: 'This invite is no longer valid — the profile it was created for is missing. Ask a parent for a new one.' }, 404);
      }
      if (existingMember.family_id?.toString() !== invite.family_id?.toString()) {
        return json({ error: 'This invite is no longer valid.' }, 404);
      }
      // Already claimed by someone (invite_status flipped to active but the
      // code somehow wasn't marked accepted yet, e.g. a race) — don't let a
      // second device silently take over an already-active identity.
      if (existingMember.invite_status === 'active' && existingMember.auth_user_id && existingMember.auth_user_id !== callerAuthUserId) {
        return json({ error: 'This profile has already been claimed on another device.' }, 409);
      }

      const { data: updated, error: updateErr } = await supabase
        .from('members')
        .update({
          avatar:          avatar,
          color:           color ?? '#9261C7',
          auth_user_id:    callerAuthUserId,
          invite_status:   'active',
          expo_push_token: expoPushToken ?? null,
          last_active:     new Date().toISOString(),
        })
        .eq('id', invite.member_id)
        .select()
        .single();

      if (updateErr || !updated) {
        throw new Error(updateErr?.message ?? 'Failed to claim member profile');
      }
      member = updated;
      resolvedName = updated.name;
      resolvedRole = updated.role;
    } else {
      // ── 3b. Legacy path — create a brand-new member row ────────────────────
      // Only reachable for a code minted before the per-invitee system
      // shipped (member_id null). No new codes are ever minted this way —
      // see generate-invite-code — so this branch naturally stops being
      // reachable once every such code has expired (7-day TTL).
      const memberId = crypto.randomUUID();
      const { data: inserted, error: memberErr } = await supabase
        .from('members')
        .insert({
          id:              memberId,
          name:            name.trim(),
          role:            role === 'grandparent' ? 'grandparent' : role === 'parent' ? 'parent' : role === 'teenager' ? 'teenager' : 'kid',
          avatar:          avatar,
          color:           color ?? '#9261C7',
          family_id:       invite.family_id,
          auth_user_id:    callerAuthUserId,
          invite_status:   'active',
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

      if (memberErr || !inserted) {
        throw new Error(memberErr?.message ?? 'Failed to create member');
      }
      member = inserted;
    }

    // ── 4. Consume the code — claiming it must actually invalidate it. ────────
    // Previously left 'pending' with only `used_by` bumped, so a claimed
    // code stayed live for anyone else who still had it. Now flips to
    // 'accepted', which join-family's own lookup above (.eq('status',
    // 'pending')) means it can never be redeemed a second time.
    await supabase.from('family_invites').update({
      status:  'accepted',
      used_by: callerAuthUserId,
    }).eq('id', invite.id);

    // ── 5. Notify the rest of the family that someone joined ───────────────────
    // Was 'custom' with no memberIds at all — 'custom' isn't in
    // family-notifier's NOTIFY_PARENTS/NOTIFY_SPECIFIC auto-route lists, so
    // despite this comment's own claim, resolvedMemberIds stayed empty and
    // this reached literally no one. Explicitly resolves and notifies every
    // OTHER existing member (parents and kids alike — a kid should know a
    // new sibling/grandparent joined too), not just parents.
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const { data: otherMembers } = await supabase
      .from('members').select('id').eq('family_id', invite.family_id).neq('id', member.id);
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
          familyId: invite.family_id,
          memberIds: notifyIds,
          persist: true,
          payload: { memberName: resolvedName, familyName: family.name, role: resolvedRole },
        }),
      }).catch(() => {});
    }

    console.log(`[join-family] ${resolvedName} (${resolvedRole}) joined family ${family.name} (${family.id}) via ${invite.member_id ? 'claimed' : 'new'} member row`);

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
