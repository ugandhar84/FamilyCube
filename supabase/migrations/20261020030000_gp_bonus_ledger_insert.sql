-- A grandparent's bonus/cheer coins are written to the shared ledger for the GRANDCHILD (user_id = the child). The existing
-- policy only lets a member write their own rows (or a parent write anyone's), so the ledger insert failed for grandparents.
-- Narrow exception: a grandparent may insert an ADMIN_ADJUSTMENT row for a member of their own family.
drop policy if exists "point_transactions grandparent bonus insert" on public.point_transactions;
create policy "point_transactions grandparent bonus insert" on public.point_transactions for insert
  with check (
    transaction_type = 'ADMIN_ADJUSTMENT'
    and user_id in (select id from public.members where family_id = current_user_family_id())
    and exists (select 1 from public.members g where g.id = resolve_active_member_id() and g.role = 'grandparent')
  );
