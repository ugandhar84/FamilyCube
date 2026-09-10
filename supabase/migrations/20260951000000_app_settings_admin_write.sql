-- Adds an admin write policy to app_settings — it's had read-only RLS
-- since creation (comment there: "No client write path exists today...
-- no INSERT/UPDATE policy is needed yet"). Needed now so the admin
-- console can edit ai_chain_config (the AI fallback-chain per use-case)
-- at runtime [live-requested: "we should be able to configure ai chain
-- for each ai edge function"], same is_app_admin() pattern as every
-- other admin-editable table (legal_documents, feature_flags,
-- paywall_groups).
drop policy if exists app_settings_write_admin on public.app_settings;
create policy app_settings_write_admin
  on public.app_settings for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());
