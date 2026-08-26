-- Master-flow audit, most severe finding: award_coins() is SECURITY DEFINER,
-- granted to `authenticated` AND `anon`, and its body does nothing but
-- `UPDATE members SET coins=..., xp=... WHERE id = member_id` with ZERO check
-- that the caller belongs to that member's family, holds any role, or is
-- even a real session. Any valid OR anonymous Supabase client could call
-- this RPC directly and credit/debit any member's coins in any family,
-- completely bypassing every approval flow (award_coins is the funnel every
-- chore-approval payout goes through via store/choreStore.ts's
-- awardPoints()).
--
-- Second half of the same hole: `members`' own UPDATE RLS policy
-- (20260817170000_fix_members_rls_recursion.sql) is scoped ONLY by family
-- membership — `id = auth.uid()::text OR family_id = current_user_family_id()`
-- — with no role/column check at all. A raw `supabase.from('members')
-- .update({coins: ...})` from ANY family member's session (a kid's, a
-- grandparent's) bypasses award_coins entirely and writes the coin columns
-- directly. Locking down only the RPC and leaving this raw path open would
-- be a false sense of security.
--
-- ── Caller inventory (confirmed via static read of every call site) ──
-- award_coins RPC, real signature (member_id, coins_delta, xp_delta, wallet):
--   • store/choreStore.ts's awardPoints() — the universal chore/quest/errand
--     payout funnel (approveChore, GP quest approval, dispute reversal,
--     etc.) — every caller is already gated client-side by canApprove()
--     before awardPoints runs, i.e. a parent or active temporary-approver.
--   • supabase/functions/chore-auto-approve/index.ts — SERVICE ROLE key.
-- award_coins RPC, mismatched PawBond-template signature
-- (p_user_id/p_action/p_ref_id) in lib/db/rewards.ts's awardCoins():
--   • Confirmed CALLED live (app/_layout.tsx daily-login bonus, gated
--     behind the 'gamification' flag which defaults true; lib/db/careCoins.ts
--     via shared/store/slices/care.slice.ts) — but shared/store/index.ts
--     (which wires care.slice.ts into a real store) has zero importers
--     anywhere in the live app/features tree, so the careCoins.ts path never
--     actually runs. app/_layout.tsx's call DOES run, but always errors —
--     Postgres has no award_coins overload matching p_user_id/p_action/
--     p_ref_id keyword args, so PostgREST returns "could not find function"
--     every time, silently swallowed by .catch(() => {}). Dead-in-effect
--     today regardless of this migration (the new signature below still
--     won't match p_user_id/p_action/p_ref_id) — left as-is per instructions,
--     not fixed here.
-- store/familyStore.ts's raw `members` table writes (NOT through the RPC):
--   • awardCoins() — StoreScreen.tsx "Grant Coins" (parent-only UI, credits
--     a kid), SeniorView.tsx "Send Bonus"/cheer (grandparent crediting a
--     kid — NOT is_approver(), a distinct legitimate grant-authority class),
--     TeenView.tsx claimPickup (a teen crediting THEMSELVES for winning a
--     ride-claim race — self-service, not an approval), rewardStore.ts
--     rejectRedemption/cancelRedemption (refunding a kid's own deducted
--     balance — reject is parent-gated in the UI, cancel has zero live call
--     sites today but would be the requester refunding themselves).
--   • clawbackCoins() — TeenView.tsx dropPickup, a teen reversing their OWN
--     just-paid ride coins after backing out — self-service.
--   • deductCoins() — StoreScreen.tsx redemption request, always deducts
--     from the ACTING member's own balance.
--   • updateMember() — writes a FULL toRow() payload on every call
--     (including coins/main_coins/gp_coins/xp, unchanged, alongside whatever
--     field the caller actually meant to edit — avatar, pin, hasCar, role,
--     etc.) for ~29 call sites across the app. Confirmed zero call sites
--     pass coin/xp fields into updateMember's `updates` — every real coin
--     change goes through the three functions above instead. This rules out
--     a blunt `REVOKE UPDATE (coins, ...) ON members FROM authenticated`:
--     Postgres rejects an UPDATE naming a revoked column even when the new
--     value equals the old one, which would break all ~29 updateMember call
--     sites outright. A BEFORE UPDATE trigger comparing OLD vs NEW — same
--     shape as block_child_self_approval() — only fires when a coin/xp
--     column's value actually changes, leaving every no-op pass-through
--     write (the common case for updateMember) untouched.
--
-- ── Authorization boundary chosen ──
-- A caller may change ANOTHER member's coins/xp only if: the caller is
-- service_role (edge functions — bypass by design), OR is_approver() for
-- the target's family (parent, or active temporary-approver), OR is a
-- grandparent in the target's own family (SeniorView's bonus/cheer — a
-- distinct, legitimate "grandparent gifting their own money" grant
-- authority, not an approval decision). A caller may always change THEIR
-- OWN coins/xp (self-credit/self-debit — teen ride-claim payout/clawback,
-- a kid's own future self-cancel refund) — that's a member's own balance,
-- not someone else's approval.
--
-- Applied in TWO layers, matching the two exploitable paths:
--   1. Authorization check inside award_coins()'s own body (SECURITY
--      DEFINER functions still see auth.uid()/auth.role() for the calling
--      request — confirmed via the auth.role() = 'service_role' pattern
--      already used elsewhere in this codebase, e.g.
--      20260706000001_subscriptions.sql).
--   2. A BEFORE UPDATE trigger on members enforcing the identical rule for
--      the coin/xp columns specifically, so a raw PostgREST write can't
--      bypass the now-locked-down RPC and hit the table directly — RLS
--      alone can't express "these specific columns need extra authority"
--      (RLS is row-level, not column-level), so the trigger is what closes
--      that gap.

-- ── Layer 1: award_coins() body ──
create or replace function public.award_coins(
  member_id  text,
  coins_delta int,
  xp_delta    int default 0,
  wallet      text default 'main'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller_id text;
  target_family_id uuid;
  caller_role text;
begin
  -- Service role (edge functions, e.g. chore-auto-approve) bypasses by
  -- design — a trusted server-side caller with no meaningful auth.uid().
  if auth.role() <> 'service_role' then
    caller_id := public.resolve_active_member_id();

    if caller_id is null then
      raise exception 'award_coins: no authenticated member session'
        using errcode = '42501';
    end if;

    if caller_id <> member_id then
      select family_id into target_family_id
      from public.members where id = member_id;

      if target_family_id is null or target_family_id <> public.current_user_family_id() then
        raise exception 'award_coins: caller is not in the target member''s family'
          using errcode = '42501';
      end if;

      select role into caller_role from public.members where id = caller_id;

      if not (public.is_approver() or caller_role = 'grandparent') then
        raise exception 'award_coins: caller lacks approval or grant authority over this member'
          using errcode = '42501';
      end if;
    end if;
    -- caller_id = member_id (self-credit/self-debit) always allowed —
    -- e.g. a teen's own ride-claim payout/clawback.
  end if;

  IF wallet = 'gp' THEN
    UPDATE public.members
    SET
      gp_coins = GREATEST(0, gp_coins + coins_delta),
      xp       = GREATEST(0, xp       + xp_delta)
    WHERE id = member_id;
  ELSE
    UPDATE public.members
    SET
      coins      = GREATEST(0, coins + coins_delta),
      main_coins = GREATEST(0, main_coins + coins_delta),
      xp         = GREATEST(0, xp    + xp_delta)
    WHERE id = member_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member % not found', member_id;
  END IF;
end;
$$;

comment on function public.award_coins is
  'The one real coin-payout RPC. Authorized: service_role (edge functions), self (own balance), is_approver() (parent/active temp-approver) over the target''s family, or a grandparent crediting/debiting a member of their own family (SeniorView bonus/cheer grant authority, distinct from is_approver()).';

-- Anon was granted execute with zero auth check before this migration —
-- there is no legitimate anonymous caller of a money-moving RPC anywhere in
-- this app (even the anonymous-auth join-family flow only ever calls this
-- AFTER becoming a real `authenticated` session member). Revoke it; the
-- authorization check above would reject an anon caller anyway (no
-- resolve_active_member_id() match), but closing the grant is the correct
-- belt-and-suspenders fix for something explicitly flagged in the audit.
revoke execute on function public.award_coins(text, int, int, text) from anon;
grant execute on function public.award_coins(text, int, int, text) to authenticated, service_role;

-- ── Layer 2: members coin/xp column trigger ──
-- Mirrors block_child_self_approval()'s OLD-vs-NEW shape. Only fires when a
-- coin/xp column's value actually changes, so the ~29 updateMember() call
-- sites that pass through unchanged coin/xp values (toRow()'s full-payload
-- shape) are unaffected.
create or replace function public.guard_member_balance_writes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller_id text;
  caller_role text;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.coins is not distinct from old.coins
     and new.main_coins is not distinct from old.main_coins
     and new.gp_coins is not distinct from old.gp_coins
     and new.xp is not distinct from old.xp then
    return new;
  end if;

  caller_id := public.resolve_active_member_id();

  -- Changing your own balance (teen ride-claim payout/clawback, a future
  -- self-cancel refund) is always allowed.
  if caller_id = new.id then
    return new;
  end if;

  if caller_id is null or new.family_id <> public.current_user_family_id() then
    raise exception 'Not authorized to change this member''s balance'
      using errcode = '42501';
  end if;

  select role into caller_role from public.members where id = caller_id;

  if public.is_approver() or caller_role = 'grandparent' then
    return new;
  end if;

  raise exception 'Not authorized to change this member''s balance'
    using errcode = '42501';
end;
$$;

comment on function public.guard_member_balance_writes is
  'BEFORE UPDATE backstop on members.coins/main_coins/gp_coins/xp — closes the raw-table-write bypass of award_coins() (RLS is row-level, not column-level, so this is enforced in a trigger instead). Same authorization boundary as award_coins() itself: service_role, self, is_approver(), or a grandparent crediting/debiting their own family.';

drop trigger if exists guard_member_balance_writes_trigger on public.members;
create trigger guard_member_balance_writes_trigger
  before update on public.members
  for each row
  execute function public.guard_member_balance_writes();
