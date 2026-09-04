// QA-only edge function — creates/destroys a fully isolated SCRATCH family
// (never touches real user data) so a QA pass can call every real RPC
// (reassign_event, confirm_event_assignment[_series_forward],
// decline_event_assignment, claim_event_slot, claim_pool_quest, etc.)
// against real rows with the service-role key, without ever exposing that
// key to a client or to the agent driving this.
//
// Every scratch row's family_id/member ids are prefixed 'qa_scratch_' so
// teardown can find and delete them unambiguously even if a run is
// interrupted mid-way; teardown also sweeps any scratch family older than
// 1 hour on every invocation, so an abandoned run cleans itself up on the
// next call regardless of whether teardown is ever explicitly requested.
//
// Actions (body: { action, ... }):
//   'setup'    → creates a scratch family + N members (default 9, spanning
//                every role: 2 parents, 4 kids, 2 teens, 1 senior) +
//                returns their ids so the caller can drive real RPCs
//                directly against Postgres via this same service-role
//                client (exposed through the 'rpc' action below) or by
//                calling the public RPCs directly with these ids as
//                p_actor_id/p_member_id.
//   'rpc'      → invokes a Postgres RPC AS a specific scratch member's real
//                session (resolve_active_member_id() only ever trusts
//                members.auth_user_id = auth.uid() — a spoofed header with
//                no real session behind it never resolves). Mints that
//                member's session via generateLink+verifyOtp (same pattern
//                the app's own recover-device edge function uses for a
//                member with no password), then calls the RPC through an
//                anon-key client carrying that real JWT — exactly how the
//                real app calls it.
//   'add_event'/'add_quest' → convenience inserts for seeding test rows
//                (a ride event, a chore) owned by the scratch family.
//   'read'     → select * from any of a small allowlist of tables scoped
//                to the scratch family_id, for the agent to inspect state
//                between steps.
//   'teardown' → deletes the scratch family and everything under it
//                (events, quests, members, participants) by family_id.
//
// Deploy: supabase functions deploy qa-scratch-family --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already present)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const READ_ALLOWLIST = new Set([
  'calendar_events', 'event_participants', 'chore_tasks', 'chore_participants',
  'members', 'families', 'activity_log', 'trips',
]);

// families.id / members.id are real `uuid` columns (confirmed live —
// calendar_events.id/chore_tasks.id are `text`, but these two are not) —
// generate real UUIDs for them and mark scratch rows via a name prefix
// instead, since 'qa_scratch_...' as a literal id value fails the column
// type outright.
function uuid() {
  return crypto.randomUUID();
}
// calendar_events.id/chore_tasks.id ARE plain text columns (confirmed by
// this codebase's own client code treating them as free-form strings like
// "ev1234567_0") — a prefixed scratch id is fine and self-descriptive here.
function scratchId(prefix: string) {
  return `qa_scratch_${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
const SCRATCH_MARK = 'QA SCRATCH';

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Sweep any scratch family left over from an interrupted prior run
    // (older than 1hr) on every single call — self-cleaning regardless of
    // whether teardown is ever explicitly invoked. Keyed on the name
    // marker, not the id — families.id/members.id are real uuid columns,
    // so a 'qa_scratch_' string prefix can't live there at all.
    const cutoff = new Date(Date.now() - 3600_000).toISOString();
    const { data: stale } = await admin.from('families')
      .select('id').eq('name', SCRATCH_MARK).lt('created_at', cutoff);
    for (const f of stale ?? []) {
      await deleteFamily(admin, f.id as string);
    }

    if (action === 'setup') {
      const memberCount = Math.min(Math.max(body.memberCount ?? 9, 2), 12);
      const familyId = uuid();
      const { error: famErr } = await admin.from('families').insert({
        id: familyId, name: SCRATCH_MARK, created_at: new Date().toISOString(),
      });
      if (famErr) throw new Error(`family insert failed: ${famErr.message}`);

      // Role spread: 2 parents, then kids/teens/senior filling the rest,
      // biased toward kid/teen since that's what most RPCs under test
      // actually branch on.
      const roleFor = (i: number): string => {
        if (i < 2) return 'parent';
        if (i === memberCount - 1) return 'grandparent';
        return i % 2 === 0 ? 'child' : 'teenager';
      };
      // resolve_active_member_id() (which reassign_event/confirm_event_
      // assignment/decline_event_assignment/claim_event_slot ALL call) only
      // ever resolves via `members.auth_user_id = auth.uid()` — there is no
      // path that trusts the service-role key's own identity, and no path
      // that trusts a spoofed x-active-member-id header without a real
      // auth.uid() match backing it. So a scratch member needs a REAL
      // auth.users row (created here) to ever be usable as an RPC actor —
      // same pattern this codebase's own recover-device edge function uses
      // (generateLink + verifyOtp) to mint a real session for a member with
      // no password. Each member's synthetic email is unique/disposable and
      // cleaned up in teardown alongside everything else.
      const members: any[] = [];
      for (let i = 0; i < memberCount; i++) {
        const role = roleFor(i);
        const memberId = uuid();
        const email = `qa-scratch-${memberId}@qa.familycube.invalid`;
        const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
          email, email_confirm: true,
        });
        if (authErr || !authUser?.user) throw new Error(`auth user create failed for member ${i}: ${authErr?.message}`);
        members.push({
          id: memberId,
          family_id: familyId,
          auth_user_id: authUser.user.id,
          name: `${SCRATCH_MARK} ${role === 'parent' ? 'Parent' : role === 'grandparent' ? 'GP' : role === 'teenager' ? 'Teen' : 'Kid'} ${i + 1}`,
          role,
          avatar: role === 'parent' ? '🧑' : role === 'grandparent' ? '👵' : role === 'teenager' ? '🧑‍🎓' : '🧒',
          has_car: role === 'parent' || role === 'grandparent',
          created_at: new Date().toISOString(),
          _email: email,
        });
      }
      const { error: memErr } = await admin.from('members').insert(
        members.map(({ _email, ...m }) => m),
      );
      if (memErr) throw new Error(`members insert failed: ${memErr.message}`);

      return json({
        ok: true, familyId,
        members: members.map(m => ({ id: m.id, name: m.name, role: m.role, email: m._email })),
      });
    }

    if (action === 'add_event') {
      const { familyId, memberId, category, title, date, time, rideRequired, driverName, driverId, helperName, helperId } = body;
      await assertScratchFamily(admin, familyId);
      const id = scratchId('ev');
      const { error } = await admin.from('calendar_events').insert({
        id, family_id: familyId, member_id: memberId ?? null,
        category: category ?? 'Study', title: title ?? 'QA test event',
        date: date ?? new Date().toISOString().slice(0, 10), start_time: time ?? '16:00',
        type: 'event', ride_required: rideRequired ?? false,
        driver_name: driverName ?? null, driver_id: driverId ?? null,
        helper_name: helperName ?? null, helper_id: helperId ?? null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`event insert failed: ${error.message}`);
      return json({ ok: true, eventId: id });
    }

    if (action === 'add_quest') {
      const { familyId, title, isPool, assignedToId, status } = body;
      await assertScratchFamily(admin, familyId);
      const id = scratchId('ch');
      const { error } = await admin.from('chore_tasks').insert({
        id, family_id: familyId, title: title ?? 'QA test chore',
        is_pool: isPool ?? true, assigned_to_id: assignedToId ?? null,
        status: status ?? 'todo', base_points: 10, coins_reward: 10,
        created_at: new Date().toISOString(),
      });
      if (error) throw new Error(`chore insert failed: ${error.message}`);
      return json({ ok: true, choreId: id });
    }

    if (action === 'rpc') {
      // resolve_active_member_id() only ever trusts a real auth.uid() match
      // (see its own migration — every path requires
      // members.auth_user_id = auth.uid(); a spoofed x-active-member-id
      // header with no genuine session behind it never resolves). So
      // calling as a specific member means minting THAT member's real
      // session first — same generateLink+verifyOtp pattern this codebase's
      // own recover-device edge function already uses for a member with no
      // password — then calling the RPC as an anon-key client carrying that
      // real JWT, exactly like the app itself does. actingMemberId must be
      // one of THIS run's own scratch members (looked up by real email, not
      // guessed), so this can't be pointed at a real user's account.
      const { fnName, args, actingMemberId } = body;
      if (!fnName) throw new Error('fnName required');
      if (!actingMemberId) throw new Error('actingMemberId required — resolve_active_member_id() has no path that works without a real session');

      const { data: actor, error: actorErr } = await admin.from('members')
        .select('id, name, auth_user_id').eq('id', actingMemberId).like('name', `${SCRATCH_MARK}%`).maybeSingle();
      if (actorErr || !actor) throw new Error('actingMemberId is not a known scratch member');
      if (!actor.auth_user_id) throw new Error('acting member has no linked auth user');

      const { data: authUserResp, error: getUserErr } = await admin.auth.admin.getUserById(actor.auth_user_id);
      if (getUserErr || !authUserResp?.user?.email) throw new Error(`getUserById failed: ${getUserErr?.message ?? 'no email'}`);
      const authUser = authUserResp.user;

      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'magiclink', email: authUser.email,
      });
      if (linkErr || !linkData.properties?.hashed_token) {
        throw new Error(`generateLink failed: ${linkErr?.message}`);
      }
      const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
        type: 'magiclink', token_hash: linkData.properties.hashed_token,
      });
      if (verifyErr || !verifyData.session) {
        throw new Error(`verifyOtp failed: ${verifyErr?.message}`);
      }

      const scopedClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${verifyData.session.access_token}` } },
      });
      const { data, error } = await scopedClient.rpc(fnName, args ?? {});
      return json({ ok: !error, data: data ?? null, error: error?.message ?? null, actingAs: actor.name });
    }

    if (action === 'read') {
      const { table, familyId, where } = body;
      if (!READ_ALLOWLIST.has(table)) throw new Error(`table not in allowlist: ${table}`);
      let q = admin.from(table).select('*');
      if (familyId) q = q.eq('family_id', familyId);
      if (where) for (const [k, v] of Object.entries(where as Record<string, unknown>)) q = q.eq(k, v as any);
      const { data, error } = await q;
      if (error) throw new Error(`read failed: ${error.message}`);
      return json({ ok: true, rows: data });
    }

    if (action === 'teardown') {
      const { familyId } = body;
      await assertScratchFamily(admin, familyId);
      await deleteFamily(admin, familyId);
      return json({ ok: true });
    }

    return json({ ok: false, error: `unknown action: ${action}` }, 400);
  } catch (e: any) {
    console.error('[qa-scratch-family]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'internal error' }, 500);
  }
});

// Verifies `familyId` genuinely is a scratch family (created by THIS
// function, name === SCRATCH_MARK) before allowing any write/delete
// against it — a real DB check, not a string-prefix guess, since
// families.id is a plain uuid with no way to encode a marker in the id
// itself.
async function assertScratchFamily(admin: ReturnType<typeof createClient>, familyId: string | undefined) {
  if (!familyId) throw new Error('familyId required');
  const { data, error } = await admin.from('families').select('id, name').eq('id', familyId).maybeSingle();
  if (error) throw new Error(`scratch-family check failed: ${error.message}`);
  if (!data || data.name !== SCRATCH_MARK) throw new Error('refusing to write/delete a non-scratch family');
}

async function deleteFamily(admin: ReturnType<typeof createClient>, familyId: string) {
  const eventIds = (await admin.from('calendar_events').select('id').eq('family_id', familyId)).data?.map((r: any) => r.id) ?? [];
  const choreIds = (await admin.from('chore_tasks').select('id').eq('family_id', familyId)).data?.map((r: any) => r.id) ?? [];
  const authUserIds = (await admin.from('members').select('auth_user_id').eq('family_id', familyId))
    .data?.map((r: any) => r.auth_user_id).filter(Boolean) ?? [];
  if (eventIds.length) await admin.from('event_participants').delete().in('event_id', eventIds);
  if (choreIds.length) await admin.from('chore_participants').delete().in('chore_id', choreIds);
  await admin.from('trips').delete().eq('family_id', familyId);
  await admin.from('activity_log').delete().eq('family_id', familyId);
  await admin.from('calendar_events').delete().eq('family_id', familyId);
  await admin.from('chore_tasks').delete().eq('family_id', familyId);
  await admin.from('members').delete().eq('family_id', familyId);
  await admin.from('families').delete().eq('id', familyId);
  // Scratch members each get a real synthetic auth.users row (see 'setup'
  // and 'rpc' above) — clean those up too, or every run leaks accounts.
  for (const uid of authUserIds) {
    await admin.auth.admin.deleteUser(uid as string).catch(() => {});
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
