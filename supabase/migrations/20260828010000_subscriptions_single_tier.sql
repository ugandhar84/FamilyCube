-- Family Cube is a single-tier subscription (Family Plan only) — the
-- original tier CHECK constraint ('free','pro','ultimate') and the
-- fallback_tier column the webhook referenced (for downgrading ultimate ->
-- pro on expiry) were both leftover from a different app's tiered pricing
-- template. fallback_tier was never actually added by any migration despite
-- revenuecat-webhook/index.ts reading and writing it — every webhook call
-- upserting that column would have failed outright against the real schema.
-- Dropping the concept entirely rather than adding the missing column: a
-- single-tier app has nothing to fall back TO on expiry except 'free'.
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions add constraint subscriptions_tier_check check (tier in ('free', 'premium'));

-- Any pre-existing row from testing under the old tier names becomes the
-- single paid tier, since this project has no real paying subscribers yet
-- (still pre-TestFlight-launch cleanup, same wipe already done for
-- families/members).
update public.subscriptions set tier = 'premium' where tier in ('pro', 'ultimate');
