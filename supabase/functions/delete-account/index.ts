// FamilyCube — Edge Function: delete-account
// Self-service "Delete account" for an auth-linked member (Profile's danger
// zone — features/profile). Soft-deletes: profiles.deleted_at = now(). Data
// is kept for 7 days; logging back in within that window restores
// everything automatically (see app/_layout.tsx's onAuthStateChange/
// getSession soft-delete-restore branch). member-purge-sweep permanently
// removes anything past 7 days.
//
// Adapted from PawBond's own delete-account function (same profiles.
// deleted_at column, same JWT-validate-then-soft-delete shape) — window
// shortened from 30 days to 7 to match Family Cube's own soft-delete spec
// (see migration 20260908230000_member_soft_delete.sql), copy reframed
// away from PawBond branding, and the reminder notice now goes through
// family-notifier (Family Cube's real notification path) instead of a
// raw Expo push call, so the rest of the family — not just the leaving
// member — is told via the same 'custom' type familyStore.removeMember
// uses for the parallel Roster "delete profile" flow. One consistent
// delete behavior everywhere a member can be removed, per user direction.
//
// Steps:
//   1. Validate JWT — caller must be the same user as user_id
//   2. Set profiles.deleted_at = now()  (soft delete marker)
//   3. Notify the rest of the family via family-notifier
//   4. Return success — client signs out after this call
//
// Deploy: supabase functions deploy delete-account

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY        = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── 1. Validate JWT ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { user_id } = await req.json() as { user_id: string };
    if (!user_id) return json({ error: 'user_id required' }, 400);
    if (user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2. Soft-delete: stamp deleted_at on profiles ─────────────────────────
    const { error: softDeleteErr } = await db
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', user_id);

    if (softDeleteErr) {
      console.error('[delete-account] soft delete failed:', softDeleteErr.message);
      return json({ error: 'Could not schedule account deletion. Please try again.' }, 500);
    }

    // ── 3. Notify the rest of the family via family-notifier ────────────────
    // Best-effort — the account is already soft-deleted regardless of
    // whether this notice goes out.
    try {
      const { data: memberRow } = await db
        .from('members')
        .select('id, name, family_id')
        .eq('auth_user_id', user_id)
        .maybeSingle();

      if (memberRow?.family_id) {
        const { data: family } = await db
          .from('members')
          .select('id')
          .eq('family_id', memberRow.family_id)
          .neq('id', memberRow.id)
          .is('deleted_at', null);

        const memberIds = (family ?? []).map((m: { id: string }) => m.id);
        if (memberIds.length) {
          await db.functions.invoke('family-notifier', {
            body: {
              type: 'custom',
              familyId: memberRow.family_id,
              memberIds,
              payload: {
                title: 'Account scheduled for deletion',
                body: `${memberRow.name ?? 'A family member'}'s account will be permanently deleted in 7 days unless they log back in.`,
                data: { screen: 'Roster', memberId: memberRow.id },
              },
            },
          });
        }
      }
    } catch (e: any) {
      console.warn('[delete-account] family-notifier notice failed:', e?.message);
    }

    console.log(`[delete-account] soft-deleted user=${user_id}`);
    return json({ success: true });

  } catch (err: any) {
    console.error('[delete-account] error:', err.message);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
