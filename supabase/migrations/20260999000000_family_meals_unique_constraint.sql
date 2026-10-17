-- Step 1: Remove duplicate meal rows, keeping the latest one per
-- (family_id, week_of, day, type, lower(title)).
-- family_meals ids are "{familyId}-{week}-{day}-manual-{Date.now()}" so
-- sorting by id desc gives us the most recently inserted row.
delete from family_meals
where id in (
  select id from (
    select
      id,
      row_number() over (
        partition by family_id, week_of, day, type, lower(title)
        order by id desc
      ) as rn
    from family_meals
  ) ranked
  where rn > 1
);

-- Step 2: Prevent future duplicates.
create unique index if not exists family_meals_no_dup
  on family_meals (family_id, week_of, day, type, lower(title));
