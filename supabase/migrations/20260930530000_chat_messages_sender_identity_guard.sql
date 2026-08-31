-- Real, HIGH-severity gap found by a direct QA trace of the Chat tab
-- (untraced until now this session) — the ninth-plus instance of the same
-- pattern already fixed repeatedly this session (members, calendar_events,
-- member_locations, chore_tasks): chat_messages' INSERT/UPDATE/DELETE
-- policies checked only channel participation, never who the caller
-- actually is. Any participant in a channel could:
--   - send a message with a SPOOFED sender_id, making it appear to come
--     from a completely different family member (proved live: inserted a
--     message into a 2-parent DM with a faked sender_id, succeeded cleanly)
--   - edit or delete ANY message in the channel, not just their own
--   - since reactions are a plain jsonb column updated via the same
--     UPDATE policy, add/remove a reaction "as" any other member too
--
-- Fix, via trigger (not a plain RLS clause) because UPDATE serves two
-- legitimately different cases that need different rules:
--   - INSERT: sender_id must always match the caller. No exceptions.
--   - DELETE: only the original sender may delete their own message.
--   - UPDATE: either (a) the caller is the message's sender (a full edit —
--     this app's "edit" is actually delete+reinsert client-side, but the
--     RPC-less direct-table path is still guarded here as defense in
--     depth), or (b) the write touches ONLY the reactions column, and the
--     specific change is limited to adding/removing the caller's OWN id
--     from the reaction arrays — never someone else's.
create or replace function public.guard_chat_messages_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_only_reactions_changed boolean;
  v_reaction_diff_ids_only_caller boolean;
  old_ids jsonb;
  new_ids jsonb;
  k text;
begin
  if auth.role() = 'service_role' then
    return coalesce(new, old);
  end if;

  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null then
    raise exception 'no authenticated member session';
  end if;

  if tg_op = 'INSERT' then
    if new.sender_id is distinct from v_active_member_id then
      raise exception 'sender_id must match the caller''s own member id';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.sender_id is distinct from v_active_member_id then
      raise exception 'only the original sender can delete this message';
    end if;
    return old;
  end if;

  -- UPDATE: sender editing their own message is always allowed.
  if old.sender_id = v_active_member_id then
    return new;
  end if;

  -- Not the sender — only a reactions-only change is allowed, and only if
  -- every id added or removed across every emoji key is the caller's own.
  -- Compares the FULL row (minus reactions) rather than an explicit column
  -- allowlist, so this stays correct if a column is ever added later
  -- without this trigger needing to be updated in lockstep.
  v_only_reactions_changed :=
    (to_jsonb(old) - 'reactions') = (to_jsonb(new) - 'reactions')
    and old.reactions is distinct from new.reactions;

  if not v_only_reactions_changed then
    raise exception 'only the original sender can edit this message';
  end if;

  -- Walk every emoji key present on either side, compare each array's
  -- added/removed elements against {caller_id} only.
  v_reaction_diff_ids_only_caller := true;
  for k in
    select key from jsonb_each(coalesce(old.reactions, '{}'::jsonb))
    union
    select key from jsonb_each(coalesce(new.reactions, '{}'::jsonb))
  loop
    old_ids := coalesce(old.reactions -> k, '[]'::jsonb);
    new_ids := coalesce(new.reactions -> k, '[]'::jsonb);
    if old_ids is distinct from new_ids then
      -- every id present in the symmetric difference must be the caller's own
      if exists (
        select value from jsonb_array_elements_text(old_ids) as t(value)
        where value not in (select jsonb_array_elements_text(new_ids))
          and value is distinct from v_active_member_id
      ) or exists (
        select value from jsonb_array_elements_text(new_ids) as t(value)
        where value not in (select jsonb_array_elements_text(old_ids))
          and value is distinct from v_active_member_id
      ) then
        v_reaction_diff_ids_only_caller := false;
      end if;
    end if;
  end loop;

  if not v_reaction_diff_ids_only_caller then
    raise exception 'can only add or remove your own reaction';
  end if;

  return new;
end;
$function$;

drop trigger if exists chat_messages_write_guard_insupd on public.chat_messages;
create trigger chat_messages_write_guard_insupd
  before insert or update on public.chat_messages
  for each row
  execute function public.guard_chat_messages_write();

drop trigger if exists chat_messages_write_guard_del on public.chat_messages;
create trigger chat_messages_write_guard_del
  before delete on public.chat_messages
  for each row
  execute function public.guard_chat_messages_write();
