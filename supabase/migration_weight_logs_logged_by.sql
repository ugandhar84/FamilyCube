ALTER TABLE public.weight_logs
  ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES auth.users(id);
