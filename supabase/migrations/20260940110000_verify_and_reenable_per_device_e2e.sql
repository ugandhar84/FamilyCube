-- Follow-up to 20260940100000: that migration's filename accidentally
-- reused the same timestamp as an earlier local-only diagnostic file that
-- had already been pushed and recorded as applied under that migration id
-- — so the UPDATE in 20260940100000 (as authored) may never have actually
-- run against the remote database (the CLI saw the timestamp as already
-- applied and skipped it). This migration re-applies the same UPDATE under
-- a fresh timestamp, and also raises the resulting value as a NOTICE so
-- the push output confirms it actually took effect this time, rather than
-- assuming again.
update feature_flags set enabled = true, updated_at = now() where key = 'per_device_e2e';

do $$
declare
  v_enabled boolean;
begin
  select enabled into v_enabled from feature_flags where key = 'per_device_e2e';
  raise notice 'per_device_e2e enabled = % (after re-apply)', v_enabled;
end $$;
