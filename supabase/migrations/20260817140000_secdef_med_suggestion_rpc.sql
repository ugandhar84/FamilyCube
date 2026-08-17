-- upsert_med_suggestion() was PLPGSQL but not SECURITY DEFINER, so once RLS
-- was enabled on global_med_suggestions (20260817130000), the prior migration
-- had to leave INSERT/UPDATE open to any authenticated user just to keep this
-- RPC working (its own inserts/updates run as the calling role, subject to
-- RLS like any other client write). Making it SECURITY DEFINER lets the
-- function do its single, narrow write (upsert a med name/category/hint,
-- bump use_count) with the owning role's privileges regardless of the
-- caller's RLS grants, so the broad table-level write policy is no longer
-- needed for this to work — reissued below with the original body unchanged,
-- pinning search_path per Postgres SECURITY DEFINER best practice (avoids a
-- search_path-hijacking attack via a malicious schema earlier in the path).
CREATE OR REPLACE FUNCTION public.upsert_med_suggestion(
  p_name text, p_category text, p_hint text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.global_med_suggestions (name, category, hint, use_count, updated_at)
  VALUES (p_name, p_category, COALESCE(p_hint, p_category), 1, now())
  ON CONFLICT (name) DO UPDATE
    SET use_count  = global_med_suggestions.use_count + 1,
        updated_at = now();
END;
$function$;

-- Now that the RPC no longer needs a broad client-facing write grant, drop
-- it — global_med_suggestions goes back to SELECT-only for authenticated
-- users, matching how app_config was treated (global, non-sensitive
-- reference data, writes happen through one controlled, narrow path).
DROP POLICY IF EXISTS "global_med_suggestions_insert" ON public.global_med_suggestions;
DROP POLICY IF EXISTS "global_med_suggestions_update" ON public.global_med_suggestions;
