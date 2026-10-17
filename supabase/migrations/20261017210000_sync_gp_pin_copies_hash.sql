-- The grandparent PIN sync used to copy the plain PIN to the other family rows. PINs are hashed now, so copy the hash that
-- set_member_pin just stored on the original row (the p_new_pin argument is ignored and kept only for compatibility).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.sync_grandparent_pin_across_families(text,text)'::regprocedure);
  def := replace(def, 'set pin = p_new_pin', 'set pin = (select pin from public.members where id = p_member_id)');
  if position('select pin from public.members' in def) = 0 then raise exception 'patch did not apply'; end if;
  execute def;
end $$;
