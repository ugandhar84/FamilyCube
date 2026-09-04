-- Live-requested: show who set up (or last changed/reset) the family
-- recovery passcode, and when — plain readable metadata, never the
-- passcode itself (that's never stored anywhere, by design). Neither
-- piece of information was tracked at all before this.
alter table public.families
  add column if not exists recovery_key_set_by text references public.members(id),
  add column if not exists recovery_key_set_at timestamptz;

comment on column public.families.recovery_key_set_by is
  'Member id of whoever last set up, changed, or reset the family recovery passcode — shown on Data Recovery as "Set up by X on Y", never the passcode itself.';
comment on column public.families.recovery_key_set_at is
  'Timestamp of the last setup/change/reset of the family recovery passcode.';
