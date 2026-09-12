-- toggle_medication_dose — atomic append/remove into
-- family_medications.taken_dates, replacing a client-side
-- read-modify-write that computed the new array (AND the "all doses
-- taken today" derived taken_date) from a possibly-stale local snapshot,
-- then overwrote the whole column. Two people toggling different
-- dose-times for the same medication near-simultaneously (or the same
-- person on two devices) could have whichever write landed second
-- silently clobber the first's entry, since neither read the other's
-- write before computing its own full-array replacement.
--
-- Everything — the new taken_dates array AND whether every dose slot is
-- now taken today — is derived from the CURRENT row inside one atomic
-- statement, so two concurrent calls serialize on Postgres' own row lock
-- instead of racing on two independently-fetched client snapshots.
create or replace function toggle_medication_dose(
  p_med_id uuid,
  p_entry text,          -- encodeTakenEntry(date, time) — same format the client already builds
  p_mark_taken boolean,  -- true = add entry, false = remove entry
  p_today text,          -- 'YYYY-MM-DD'
  p_modified_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_freq_times jsonb;
  v_times text[];
  v_new_dates jsonb;
  v_all_taken boolean;
  v_expected_entry text;
begin
  select frequency_times into v_freq_times from family_medications where id = p_med_id for update;
  if not found then
    return null;
  end if;

  if p_mark_taken then
    update family_medications
    set taken_dates = (
      case when taken_dates @> to_jsonb(array[p_entry])
        then taken_dates
        else taken_dates || to_jsonb(array[p_entry])
      end
    )
    where id = p_med_id
    returning taken_dates into v_new_dates;
  else
    update family_medications
    set taken_dates = (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from jsonb_array_elements_text(taken_dates) elem
      where elem <> p_entry
    )
    where id = p_med_id
    returning taken_dates into v_new_dates;
  end if;

  -- Same "all dose slots taken today" derivation the client used to do
  -- with encodeTakenEntry(todayStr, timesForMed.length > 1 ? t : null) —
  -- mirrored here in SQL against the freshly-committed taken_dates.
  select coalesce(array_agg(value::text), array['08:00'])
  into v_times
  from jsonb_array_elements_text(coalesce(v_freq_times, '[]'::jsonb));

  v_all_taken := true;
  for i in 1 .. array_length(v_times, 1) loop
    v_expected_entry := p_today || (case when array_length(v_times, 1) > 1 then '|' || v_times[i] else '' end);
    if not (v_new_dates @> to_jsonb(array[v_expected_entry])) then
      v_all_taken := false;
      exit;
    end if;
  end loop;

  update family_medications
  set taken_date = case when v_all_taken then p_today else null end,
      modified_by = p_modified_by,
      updated_at = now()
  where id = p_med_id;

  return v_new_dates;
end;
$$;

grant execute on function toggle_medication_dose(uuid, text, boolean, text, uuid) to authenticated;
