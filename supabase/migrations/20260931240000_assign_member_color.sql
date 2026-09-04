-- Live-requested: color Calendar/Agenda/Hub event cards by which PERSON
-- they belong to, not just their role (today every parent shares one sage
-- tint, every kid shares one amber tint via roleStyle() — two kids on the
-- same day are visually identical). Each member gets their own KEY from a
-- fixed 12-color palette (constants/memberColors.ts PALETTE_ORDER — keep
-- v_palette below in sync with that array if either ever changes, they
-- express the same list in two places). A key, not a raw hex, so one DB
-- value resolves to a theme-correct hex in both light AND dark mode via
-- memberColorStyle() — a hex alone can't do that.
--
-- members.color already existed in this DB (not from any tracked
-- migration — found live, already populated with plain hex strings for 4
-- existing members, e.g. '#DB9270') from an earlier attempt at this same
-- feature that was never wired into any screen. A key, not a hex, is what
-- every function below understands, and two of those 4 legacy hexes
-- happened to be each family's light- and dark-theme lavender ('#6C519F'
-- and, loosely, '#AC9BC7') — mapping both straight across would collide
-- two different people onto the same key. Reset every non-key legacy value
-- to null here so the backfill loop further down (which already assigns
-- per-family, in creation order, skipping any key a family member already
-- holds) is the ONE place that decides who gets what — rather than
-- duplicating that same collision-avoidance logic a second time as a
-- one-off set of literal hex→key UPDATEs.
update public.members set color = null
where color is not null and color !~ '^[a-z]+$';

comment on column public.members.color is
  'Personal color KEY (constants/memberColors.ts MemberColorKey) used to tint this member''s events/chores on Calendar, Agenda, and Hub — independent of role. Resolve to an actual hex via memberColorStyle(), which picks the light/dark variant. Auto-assigned on insert by assign_member_color() when left null; editable afterward via a swatch picker on the member''s own profile row. Kept unique within a family so no two members in the same household share a shade.';

create or replace function public.assign_member_color()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Keep in sync with constants/memberColors.ts's PALETTE_ORDER array.
  v_palette text[] := array[
    'terracotta','sage','amber','lavender','rose','cyan',
    'ochre','plum','moss','slate','clay','olive'
  ];
  v_used text[];
  v_candidate text;
  v_family_count int;
begin
  if new.color is not null then
    return new;
  end if;

  -- No family yet (e.g. a row created before family_id is known in some
  -- flow) — leave unset rather than guessing; memberColorStyle()'s own
  -- fallback to 'terracotta' covers a null color until one is assigned on
  -- a later update once family_id is set.
  if new.family_id is null then
    return new;
  end if;

  select array_agg(color) into v_used
  from public.members
  where family_id = new.family_id and color is not null and id <> new.id;

  v_used := coalesce(v_used, array[]::text[]);

  -- First palette key this family hasn't already claimed.
  select p into v_candidate
  from unnest(v_palette) as p
  where not (p = any(v_used))
  limit 1;

  if v_candidate is null then
    -- Every key already claimed (13th+ member in one family) — cycle back
    -- deterministically by how many members this family already has,
    -- rather than leaving color null forever. A repeated shade at that
    -- household size is an acceptable, rare fallback, not a broken state.
    select count(*) into v_family_count from public.members where family_id = new.family_id;
    v_candidate := v_palette[(v_family_count % array_length(v_palette, 1)) + 1];
  end if;

  new.color := v_candidate;
  return new;
end;
$$;

drop trigger if exists trg_assign_member_color on public.members;
create trigger trg_assign_member_color
  before insert on public.members
  for each row
  execute function public.assign_member_color();

-- Backfill every member still uncolored at this point — both rows that
-- were null all along, and the legacy hex rows just reset to null above.
-- Assigns per family, in creation order, skipping any key that family
-- already has claimed (from a row this loop already touched, or a
-- genuinely pre-existing key value this migration didn't need to reset).
do $$
declare
  v_palette text[] := array[
    'terracotta','sage','amber','lavender','rose','cyan',
    'ochre','plum','moss','slate','clay','olive'
  ];
  v_family record;
  v_member record;
  v_idx int;
  v_used text[];
begin
  for v_family in select distinct family_id from public.members where family_id is not null loop
    select array_agg(color) into v_used from public.members
    where family_id = v_family.family_id and color is not null;
    v_used := coalesce(v_used, array[]::text[]);
    v_idx := 0;
    for v_member in
      select id from public.members
      where family_id = v_family.family_id and color is null
      order by created_at asc
    loop
      while v_palette[(v_idx % array_length(v_palette, 1)) + 1] = any(v_used) loop
        v_idx := v_idx + 1;
      end loop;
      update public.members
      set color = v_palette[(v_idx % array_length(v_palette, 1)) + 1]
      where id = v_member.id;
      v_used := array_append(v_used, v_palette[(v_idx % array_length(v_palette, 1)) + 1]);
      v_idx := v_idx + 1;
    end loop;
  end loop;
end $$;
