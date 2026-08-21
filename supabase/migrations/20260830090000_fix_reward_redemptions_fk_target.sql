-- Coordinated live-DB QA (Round 16) found reward_redemptions.reward_id's
-- foreign key still points at the legacy orphaned `reward_items` table
-- instead of `rewards` (the table the app has actually used since Round
-- 14's "rewards table never existed in production" fix). Every real
-- redeemReward() insert (store/rewardStore.ts) has been failing this FK
-- constraint silently ever since — the client only console.warns on
-- error while the UI already shows an optimistic "Redeemed!" success.
-- Verified live: reward_redemptions had 0 rows in all of production.
alter table public.reward_redemptions
  drop constraint reward_redemptions_reward_id_fkey;

alter table public.reward_redemptions
  add constraint reward_redemptions_reward_id_fkey
  foreign key (reward_id) references public.rewards(id) on delete cascade;
