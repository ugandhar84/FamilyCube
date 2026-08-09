ALTER TABLE public.grooming_logs
  ADD COLUMN IF NOT EXISTS done_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS done_at_time timestamptz;

-- Backfill done_at_time from existing date column so journals keep history
UPDATE public.grooming_logs
  SET done_at_time = (done_at::text || 'T09:00:00')::timestamptz
  WHERE done_at_time IS NULL AND done_at IS NOT NULL;
